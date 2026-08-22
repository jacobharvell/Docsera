import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createWorkspaceMediaService,
  type SupportedWorkspaceMediaContentType,
  type WorkspaceMediaAttachmentRecord,
  type WorkspaceMediaServiceDependencies
} from "./serviceNowWorkspaceMedia.ts";
import type { WorkspaceRecord } from "./serverWorkspaceDomain.ts";
import { DOCSERA_WORKSPACE_TABLE } from "./serverWorkspaceDomain.ts";
import type { WorkspaceEditLeaseResult } from "../workspace-leases/serverWorkspaceEditLeaseDomain.ts";

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

const workspace: WorkspaceRecord = {
  sysId: "workspace-001",
  name: "Product Docs",
  slug: "product-docs",
  shortDescription: "Product documentation",
  icon: {
    type: "builtin",
    key: "docsera-workspace",
    label: "Docsera workspace icon"
  },
  status: "active",
  adminGroupSysId: "group-admin",
  editorGroupSysId: "group-editor",
  creatorUserSysId: "user-001",
  layout: {
    tocVisibleByDefault: true,
    pageWidth: "readable"
  }
};

const defaultCapabilities = {
  canAdminWorkspace: false,
  canEditWorkspace: true,
  canViewWorkspace: true
};

function createAttachment(overrides: Partial<WorkspaceMediaAttachmentRecord> & { mediaId: string }): WorkspaceMediaAttachmentRecord {
  return {
    mediaId: overrides.mediaId,
    tableName: overrides.tableName ?? DOCSERA_WORKSPACE_TABLE,
    tableSysId: overrides.tableSysId ?? workspace.sysId,
    fileName: overrides.fileName ?? "diagram.png",
    contentType: overrides.contentType ?? "image/png",
    sizeBytes: overrides.sizeBytes ?? 1024,
    createdOn: overrides.createdOn ?? "2026-08-19 09:00:00",
    updatedOn: overrides.updatedOn ?? "2026-08-19 09:00:00"
  };
}

function createHarness(overrides: {
  attachments?: WorkspaceMediaAttachmentRecord[];
  capabilities?: Partial<typeof defaultCapabilities>;
  leaseResult?: WorkspaceEditLeaseResult;
  loadedWorkspace?: WorkspaceRecord | null;
  contentStream?: unknown;
  persistedSizeBytes?: number;
  persistedContentType?: SupportedWorkspaceMediaContentType;
  persistedFileName?: string;
  writeReturnValue?: string | null;
} = {}) {
  let attachments = [...(overrides.attachments ?? [])];
  const deleteCalls: string[] = [];
  const writeCalls: Array<{
    contentType: SupportedWorkspaceMediaContentType;
    dataStream: unknown;
    fileName: string;
    workspaceSysId: string;
  }> = [];

  const dependencies: WorkspaceMediaServiceDependencies = {
    deleteAttachment: vi.fn((mediaId: string) => {
      deleteCalls.push(mediaId);
      attachments = attachments.filter((attachment) => attachment.mediaId !== mediaId);
    }),
    evaluateWorkspaceCapabilities: vi.fn(() => ({
      ...defaultCapabilities,
      ...(overrides.capabilities ?? {})
    })),
    getAttachmentBySysId: vi.fn((mediaId: string) => attachments.find((attachment) => attachment.mediaId === mediaId) ?? null),
    getAttachmentContentStream: vi.fn((mediaId: string) =>
      Object.prototype.hasOwnProperty.call(overrides, "contentStream") ? overrides.contentStream : `stream:${mediaId}`
    ),
    listWorkspaceAttachments: vi.fn(() => [...attachments]),
    loadWorkspaceBySysId: vi.fn((workspaceSysId: string) =>
      workspaceSysId === workspace.sysId ? (overrides.loadedWorkspace === undefined ? workspace : overrides.loadedWorkspace) : null
    ),
    maxUploadBytes: MAX_UPLOAD_BYTES,
    verifyWorkspaceEditLease: vi.fn(async () =>
      overrides.leaseResult ?? {
        kind: "held",
        changeSetId: "change-set-001",
        changeSetRevision: 9,
        heartbeatIntervalMs: 60_000,
        staleAfterMs: 300_000,
        leaseToken: "lease-token",
        workspaceStateRevision: 4
      }
    ),
    writeAttachmentToWorkspace: vi.fn((input) => {
      writeCalls.push(input);
      const mediaId = overrides.writeReturnValue ?? `media-${writeCalls.length}`;
      if (mediaId) {
        attachments.push({
          mediaId,
          tableName: DOCSERA_WORKSPACE_TABLE,
          tableSysId: workspace.sysId,
          fileName: overrides.persistedFileName ?? input.fileName,
          contentType: overrides.persistedContentType ?? input.contentType,
          sizeBytes: overrides.persistedSizeBytes ?? 1024,
          createdOn: "2026-08-19 09:00:00",
          updatedOn: "2026-08-19 09:00:00"
        });
      }
      return mediaId;
    })
  };

  return {
    dependencies,
    deleteCalls,
    service: createWorkspaceMediaService(dependencies),
    attachments,
    writeCalls
  };
}

describe("workspace media service", () => {
  it("requires authoring access to list the workspace media library", async () => {
    const harness = createHarness({
      capabilities: {
        canAdminWorkspace: false,
        canEditWorkspace: false,
        canViewWorkspace: true
      }
    });

    const result = await harness.service.listWorkspaceMedia({
      workspaceSysId: workspace.sysId
    });

    expect(result).toEqual({
      kind: "failed",
      status: 403,
      errorMessage: "You do not have permission to access the workspace media library."
    });
  });

  it("filters unsupported direct workspace attachments out of the authoring library", async () => {
    const harness = createHarness({
      attachments: [
        createAttachment({
          mediaId: "media-003",
          fileName: "broken.png",
          contentType: "image/jpeg",
          updatedOn: "2026-08-19 09:00:03"
        }),
        createAttachment({
          mediaId: "media-002",
          fileName: "notes.pdf",
          contentType: "application/pdf",
          updatedOn: "2026-08-19 09:00:02"
        }),
        createAttachment({
          mediaId: "media-001",
          fileName: "diagram.png",
          contentType: "image/png",
          sizeBytes: 2048,
          createdOn: "2026-08-19 09:00:00",
          updatedOn: "2026-08-19 09:00:01"
        })
      ]
    });

    const result = await harness.service.listWorkspaceMedia({
      workspaceSysId: workspace.sysId
    });

    expect(result).toEqual({
      kind: "succeeded",
      items: [
        {
          mediaId: "media-001",
          fileName: "diagram.png",
          contentType: "image/png",
          sizeBytes: 2048,
          createdOn: "2026-08-19 09:00:00",
          updatedOn: "2026-08-19 09:00:01"
        }
      ]
    });
  });

  it("orders supported media newest-first by updated and created timestamps with a deterministic tie-breaker", async () => {
    const harness = createHarness({
      attachments: [
        createAttachment({
          mediaId: "media-c",
          fileName: "zeta.png",
          contentType: "image/png",
          updatedOn: "2026-08-19 09:00:00",
          createdOn: "2026-08-19 09:00:00"
        }),
        createAttachment({
          mediaId: "media-a",
          fileName: "alpha.png",
          contentType: "image/png",
          updatedOn: "2026-08-19 09:00:02",
          createdOn: "2026-08-19 09:00:02"
        }),
        createAttachment({
          mediaId: "media-b",
          fileName: "beta.png",
          contentType: "image/png",
          updatedOn: "2026-08-19 09:00:02",
          createdOn: "2026-08-19 09:00:01"
        })
      ]
    });

    const result = await harness.service.listWorkspaceMedia({
      workspaceSysId: workspace.sysId
    });

    expect(result.kind).toBe("succeeded");
    if (result.kind === "succeeded") {
      expect(result.items.map((item) => item.mediaId)).toEqual(["media-a", "media-b", "media-c"]);
    }
  });

  it("returns not-found for a media id that belongs to another workspace", async () => {
    const harness = createHarness({
      capabilities: {
        canViewWorkspace: true
      },
      attachments: [
        createAttachment({
          mediaId: "media-foreign",
          tableSysId: "workspace-002",
          fileName: "diagram.png",
          contentType: "image/png"
        })
      ]
    });

    const result = await harness.service.getWorkspaceMediaFile({
      mediaId: "media-foreign",
      workspaceSysId: workspace.sysId
    });

    expect(result).toEqual({
      kind: "failed",
      status: 404,
      errorMessage: "Media could not be found."
    });
    expect(harness.dependencies.getAttachmentContentStream).not.toHaveBeenCalled();
  });

  it("denies retrieval before resolving attachment content for users without workspace view access", async () => {
    const harness = createHarness({
      capabilities: {
        canAdminWorkspace: false,
        canEditWorkspace: false,
        canViewWorkspace: false
      },
      attachments: [
        createAttachment({
          mediaId: "media-001",
          fileName: "diagram.png",
          contentType: "image/png"
        })
      ]
    });

    const result = await harness.service.getWorkspaceMediaFile({
      mediaId: "media-001",
      workspaceSysId: workspace.sysId
    });

    expect(result).toEqual({
      kind: "failed",
      status: 403,
      errorMessage: "You do not have permission to view media in this workspace."
    });
    expect(harness.dependencies.getAttachmentBySysId).not.toHaveBeenCalled();
    expect(harness.dependencies.getAttachmentContentStream).not.toHaveBeenCalled();
  });

  it("permits view-only users to retrieve a validated workspace media file", async () => {
    const harness = createHarness({
      capabilities: {
        canAdminWorkspace: false,
        canEditWorkspace: false,
        canViewWorkspace: true
      },
      attachments: [
        createAttachment({
          mediaId: "media-001",
          fileName: "diagram.png",
          contentType: "image/png"
        })
      ]
    });

    const result = await harness.service.getWorkspaceMediaFile({
      mediaId: "media-001",
      workspaceSysId: workspace.sysId
    });

    expect(result).toEqual({
      kind: "succeeded",
      contentStream: "stream:media-001",
      contentType: "image/png",
      media: {
        mediaId: "media-001",
        fileName: "diagram.png",
        contentType: "image/png",
        sizeBytes: 1024,
        createdOn: "2026-08-19 09:00:00",
        updatedOn: "2026-08-19 09:00:00"
      }
    });
  });

  it("rejects unsupported upload extensions before creating an attachment", async () => {
    const harness = createHarness();

    const result = await harness.service.uploadWorkspaceMedia({
      contentType: "image/png",
      dataStream: { bytes: 1 },
      fileName: "diagram.txt",
      workspaceLeaseToken: "lease-token",
      workspaceSysId: workspace.sysId
    });

    expect(result).toEqual({
      kind: "failed",
      status: 415,
      errorMessage: "The file name must include a supported image extension."
    });
    expect(harness.dependencies.writeAttachmentToWorkspace).not.toHaveBeenCalled();
  });

  it("rejects unsupported upload MIME types before creating an attachment", async () => {
    const harness = createHarness();

    const result = await harness.service.uploadWorkspaceMedia({
      contentType: "image/tiff",
      dataStream: { bytes: 1 },
      fileName: "diagram.png",
      workspaceLeaseToken: "lease-token",
      workspaceSysId: workspace.sysId
    });

    expect(result).toEqual({
      kind: "failed",
      status: 415,
      errorMessage: "The upload content type is not supported."
    });
    expect(harness.dependencies.writeAttachmentToWorkspace).not.toHaveBeenCalled();
  });

  it("rejects mismatched extension and MIME pairs before creating an attachment", async () => {
    const harness = createHarness();

    const result = await harness.service.uploadWorkspaceMedia({
      contentType: "image/jpeg",
      dataStream: { bytes: 1 },
      fileName: "diagram.png",
      workspaceLeaseToken: "lease-token",
      workspaceSysId: workspace.sysId
    });

    expect(result).toEqual({
      kind: "failed",
      status: 415,
      errorMessage: "The file name extension and upload content type do not match."
    });
    expect(harness.dependencies.writeAttachmentToWorkspace).not.toHaveBeenCalled();
  });

  it.each(["photo.jpg", "photo.jpeg"])("accepts %s with image/jpeg", async (fileName) => {
    const harness = createHarness();

    const result = await harness.service.uploadWorkspaceMedia({
      contentType: "image/jpeg",
      dataStream: { bytes: 1 },
      fileName,
      workspaceLeaseToken: "lease-token",
      workspaceSysId: workspace.sysId
    });

    expect(result.kind).toBe("succeeded");
    if (result.kind === "succeeded") {
      expect(result.media.contentType).toBe("image/jpeg");
      expect(result.media.fileName).toBe(fileName);
    }
  });

  it("requires a held workspace edit lease before uploading", async () => {
    const harness = createHarness({
      leaseResult: {
        kind: "lost",
        currentHolder: null,
        errorMessage: "This workspace edit session ended."
      }
    });

    const result = await harness.service.uploadWorkspaceMedia({
      contentType: "image/png",
      dataStream: { bytes: 1 },
      fileName: "diagram.png",
      workspaceLeaseToken: "lease-token",
      workspaceSysId: workspace.sysId
    });

    expect(result).toEqual({
      kind: "failed",
      status: 403,
      errorMessage: "A valid workspace edit lease is required to upload media."
    });
    expect(harness.dependencies.writeAttachmentToWorkspace).not.toHaveBeenCalled();
  });

  it("rejects view-only users before lease verification or attachment persistence", async () => {
    const harness = createHarness({
      capabilities: {
        canAdminWorkspace: false,
        canEditWorkspace: false,
        canViewWorkspace: true
      }
    });

    const result = await harness.service.uploadWorkspaceMedia({
      contentType: "image/png",
      dataStream: { bytes: 1 },
      fileName: "diagram.png",
      workspaceLeaseToken: "lease-token",
      workspaceSysId: workspace.sysId
    });

    expect(result).toEqual({
      kind: "failed",
      status: 403,
      errorMessage: "You do not have permission to access the workspace media library."
    });
    expect(harness.dependencies.verifyWorkspaceEditLease).not.toHaveBeenCalled();
    expect(harness.dependencies.writeAttachmentToWorkspace).not.toHaveBeenCalled();
  });

  it("preserves the requested filename when no collision exists", async () => {
    const harness = createHarness();

    await harness.service.uploadWorkspaceMedia({
      contentType: "image/png",
      dataStream: { bytes: 1 },
      fileName: "diagram.png",
      workspaceLeaseToken: "lease-token",
      workspaceSysId: workspace.sysId
    });

    expect(harness.dependencies.writeAttachmentToWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      fileName: "diagram.png"
    }));
  });

  it("increments workspace-local filename collisions with the legacy suffix convention", async () => {
    const harness = createHarness({
      attachments: [
        createAttachment({
          mediaId: "media-001",
          fileName: "diagram.png",
          contentType: "image/png"
        }),
        createAttachment({
          mediaId: "media-002",
          fileName: "diagram-1.png",
          contentType: "image/png"
        }),
        createAttachment({
          mediaId: "media-003",
          fileName: "diagram.pdf",
          contentType: "application/pdf"
        })
      ]
    });

    const result = await harness.service.uploadWorkspaceMedia({
      contentType: "image/png",
      dataStream: { bytes: 1 },
      fileName: "diagram.png",
      workspaceLeaseToken: "lease-token",
      workspaceSysId: workspace.sysId
    });

    expect(result.kind).toBe("succeeded");
    expect(harness.dependencies.writeAttachmentToWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      fileName: "diagram-2.png"
    }));
  });

  it("accepts duplicate content when the author chooses a different collision-safe filename", async () => {
    const harness = createHarness();
    const sharedStream = { bytes: 1024 };

    const first = await harness.service.uploadWorkspaceMedia({
      contentType: "image/png",
      dataStream: sharedStream,
      fileName: "diagram.png",
      workspaceLeaseToken: "lease-token",
      workspaceSysId: workspace.sysId
    });
    const second = await harness.service.uploadWorkspaceMedia({
      contentType: "image/png",
      dataStream: sharedStream,
      fileName: "diagram-copy.png",
      workspaceLeaseToken: "lease-token",
      workspaceSysId: workspace.sysId
    });

    expect(first.kind).toBe("succeeded");
    expect(second.kind).toBe("succeeded");
    expect(harness.dependencies.writeAttachmentToWorkspace).toHaveBeenCalledTimes(2);
  });

  it("accepts an exact 10 MB upload", async () => {
    const harness = createHarness({
      persistedSizeBytes: MAX_UPLOAD_BYTES
    });

    const result = await harness.service.uploadWorkspaceMedia({
      contentLengthBytes: MAX_UPLOAD_BYTES,
      contentType: "image/png",
      dataStream: { bytes: MAX_UPLOAD_BYTES },
      fileName: "diagram.png",
      workspaceLeaseToken: "lease-token",
      workspaceSysId: workspace.sysId
    });

    expect(result.kind).toBe("succeeded");
    if (result.kind === "succeeded") {
      expect(result.media.sizeBytes).toBe(MAX_UPLOAD_BYTES);
    }
    expect(harness.dependencies.writeAttachmentToWorkspace).toHaveBeenCalledTimes(1);
  });

  it("rejects uploads larger than 10 MB before creating an attachment when Content-Length is reliable", async () => {
    const harness = createHarness();

    const result = await harness.service.uploadWorkspaceMedia({
      contentLengthBytes: MAX_UPLOAD_BYTES + 1,
      contentType: "image/png",
      dataStream: { bytes: MAX_UPLOAD_BYTES + 1 },
      fileName: "diagram.png",
      workspaceLeaseToken: "lease-token",
      workspaceSysId: workspace.sysId
    });

    expect(result).toEqual({
      kind: "failed",
      status: 413,
      errorMessage: "The upload exceeds the 10 MB limit."
    });
    expect(harness.dependencies.writeAttachmentToWorkspace).not.toHaveBeenCalled();
  });

  it("deletes oversized persisted uploads and returns failure instead of a media descriptor", async () => {
    const harness = createHarness({
      persistedSizeBytes: MAX_UPLOAD_BYTES + 1
    });

    const result = await harness.service.uploadWorkspaceMedia({
      contentType: "image/png",
      dataStream: { bytes: MAX_UPLOAD_BYTES + 1 },
      fileName: "diagram.png",
      workspaceLeaseToken: "lease-token",
      workspaceSysId: workspace.sysId
    });

    expect(result).toEqual({
      kind: "failed",
      status: 413,
      errorMessage: "The upload exceeds the 10 MB limit."
    });
    expect(harness.deleteCalls).toEqual(["media-1"]);
  });

  it("deletes zero-byte persisted uploads and returns failure instead of a media descriptor", async () => {
    const harness = createHarness({
      persistedSizeBytes: 0
    });

    const result = await harness.service.uploadWorkspaceMedia({
      contentType: "image/png",
      dataStream: { bytes: 0 },
      fileName: "diagram.png",
      workspaceLeaseToken: "lease-token",
      workspaceSysId: workspace.sysId
    });

    expect(result).toEqual({
      kind: "failed",
      status: 400,
      errorMessage: "The upload body cannot be empty."
    });
    expect(harness.deleteCalls).toEqual(["media-1"]);
  });

  it("returns the validated attachment content type and stream for retrieval rather than base64", async () => {
    const harness = createHarness({
      attachments: [
        createAttachment({
          mediaId: "media-001",
          fileName: "diagram.png",
          contentType: "image/png"
        })
      ]
    });

    const result = await harness.service.getWorkspaceMediaFile({
      mediaId: "media-001",
      workspaceSysId: workspace.sysId
    });

    expect(result).toEqual({
      kind: "succeeded",
      contentStream: "stream:media-001",
      contentType: "image/png",
      media: {
        mediaId: "media-001",
        fileName: "diagram.png",
        contentType: "image/png",
        sizeBytes: 1024,
        createdOn: "2026-08-19 09:00:00",
        updatedOn: "2026-08-19 09:00:00"
      }
    });
  });

  it("returns not-found when a valid attachment has no retrievable content stream", async () => {
    const harness = createHarness({
      attachments: [
        createAttachment({
          mediaId: "media-001",
          fileName: "diagram.png",
          contentType: "image/png"
        })
      ],
      contentStream: undefined
    });

    const result = await harness.service.getWorkspaceMediaFile({
      mediaId: "media-001",
      workspaceSysId: workspace.sysId
    });

    expect(result).toEqual({
      kind: "failed",
      status: 404,
      errorMessage: "Media could not be found."
    });
    expect(harness.dependencies.getAttachmentContentStream).toHaveBeenCalledWith("media-001");
  });
});
