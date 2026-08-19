import { GlideRecord, GlideSysAttachment, gs } from "@servicenow/glide";
import { verifyWorkspaceEditLease } from "../api/docsera-runtime-workspace-edit-lease.ts";
import { DOCSERA_WORKSPACE_TABLE, type WorkspaceRecord } from "./serverWorkspaceDomain.ts";
import { evaluateCurrentUserWorkspaceCapabilities } from "./serviceNowWorkspaceCapabilities.ts";
import { mapWorkspaceRecord } from "./serviceNowWorkspaceRecords.ts";
import { type WorkspaceEditLeaseResult } from "../workspace-leases/serverWorkspaceEditLeaseDomain.ts";

export type SupportedWorkspaceMediaContentType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export type WorkspaceMediaDescriptor = {
  mediaId: string;
  fileName: string;
  contentType: SupportedWorkspaceMediaContentType;
  sizeBytes: number;
  createdOn: string;
  updatedOn: string;
};

export type WorkspaceMediaAttachmentRecord = {
  contentType: string;
  createdOn: string;
  fileName: string;
  mediaId: string;
  sizeBytes: number;
  tableName: string;
  tableSysId: string;
  updatedOn: string;
};

export type WorkspaceMediaServiceFailure = {
  errorMessage: string;
  status: 400 | 403 | 404 | 413 | 415 | 500;
  kind: "failed";
};

export type WorkspaceMediaListResult =
  | {
      kind: "succeeded";
      items: WorkspaceMediaDescriptor[];
    }
  | WorkspaceMediaServiceFailure;

export type WorkspaceMediaUploadResult =
  | {
      kind: "succeeded";
      media: WorkspaceMediaDescriptor;
    }
  | WorkspaceMediaServiceFailure;

export type WorkspaceMediaFileResult =
  | {
      kind: "succeeded";
      contentStream: unknown;
      contentType: SupportedWorkspaceMediaContentType;
      media: WorkspaceMediaDescriptor;
    }
  | WorkspaceMediaServiceFailure;

export type WorkspaceMediaServiceDependencies = {
  deleteAttachment: (mediaId: string) => void;
  evaluateWorkspaceCapabilities: (workspace: WorkspaceRecord) => {
    canAdminWorkspace: boolean;
    canEditWorkspace: boolean;
    canViewWorkspace: boolean;
  };
  getAttachmentBySysId: (mediaId: string) => WorkspaceMediaAttachmentRecord | null;
  getAttachmentContentStream: (mediaId: string) => unknown;
  listWorkspaceAttachments: (workspaceSysId: string) => WorkspaceMediaAttachmentRecord[];
  loadWorkspaceBySysId: (workspaceSysId: string) => WorkspaceRecord | null;
  maxUploadBytes: number;
  verifyWorkspaceEditLease: typeof verifyWorkspaceEditLease;
  writeAttachmentToWorkspace: (input: {
    contentType: SupportedWorkspaceMediaContentType;
    dataStream: unknown;
    fileName: string;
    workspaceSysId: string;
  }) => string | null;
};

type WorkspaceMediaUploadInput = {
  contentLengthBytes?: number | null;
  contentType: string;
  dataStream: unknown;
  fileName: string;
  workspaceLeaseToken: string;
  workspaceSysId: string;
};

type WorkspaceMediaLookupInput = {
  mediaId: string;
  workspaceSysId: string;
};

type WorkspaceMediaListInput = {
  workspaceSysId: string;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeContentType(value: unknown): string {
  return cleanText(value).split(";")[0].trim().toLowerCase();
}

function isSupportedMediaContentType(value: unknown): value is SupportedWorkspaceMediaContentType {
  const contentType = normalizeContentType(value);
  return contentType === "image/jpeg" || contentType === "image/png" || contentType === "image/webp" || contentType === "image/gif";
}

function contentTypeForExtension(extension: string): SupportedWorkspaceMediaContentType | null {
  switch (extension.toLowerCase()) {
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "gif":
      return "image/gif";
    default:
      return null;
  }
}

function splitSupportedMediaFileName(fileName: string): { baseName: string; extension: string } | null {
  const candidate = cleanText(fileName);
  if (!candidate || candidate.includes("/") || candidate.includes("\\") || candidate.includes("..")) {
    return null;
  }

  const lastDot = candidate.lastIndexOf(".");
  if (lastDot <= 0 || lastDot === candidate.length - 1) {
    return null;
  }

  const baseName = candidate.slice(0, lastDot);
  const extension = candidate.slice(lastDot + 1);
  if (!baseName || baseName.includes("/") || baseName.includes("\\") || baseName.includes("..")) {
    return null;
  }

  return {
    baseName,
    extension
  };
}

function isSupportedMediaPair(fileName: string, contentType: string): boolean {
  const split = splitSupportedMediaFileName(fileName);
  if (!split) {
    return false;
  }

  const supportedContentType = contentTypeForExtension(split.extension);
  return Boolean(supportedContentType) && normalizeContentType(contentType) === supportedContentType;
}

function compareMediaDescriptors(left: WorkspaceMediaDescriptor, right: WorkspaceMediaDescriptor): number {
  const updatedComparison = cleanText(right.updatedOn).localeCompare(cleanText(left.updatedOn));
  if (updatedComparison !== 0) {
    return updatedComparison;
  }

  const createdComparison = cleanText(right.createdOn).localeCompare(cleanText(left.createdOn));
  if (createdComparison !== 0) {
    return createdComparison;
  }

  return cleanText(left.mediaId).localeCompare(cleanText(right.mediaId));
}

function toMediaDescriptor(record: WorkspaceMediaAttachmentRecord): WorkspaceMediaDescriptor | null {
  if (!isSupportedMediaPair(record.fileName, record.contentType)) {
    return null;
  }

  const supportedContentType = normalizeContentType(record.contentType);
  if (!isSupportedMediaContentType(supportedContentType)) {
    return null;
  }

  return {
    mediaId: cleanText(record.mediaId),
    fileName: cleanText(record.fileName),
    contentType: supportedContentType,
    sizeBytes: safeInteger(record.sizeBytes) ?? 0,
    createdOn: cleanText(record.createdOn),
    updatedOn: cleanText(record.updatedOn)
  };
}

function toFailure(status: WorkspaceMediaServiceFailure["status"], errorMessage: string): WorkspaceMediaServiceFailure {
  return {
    kind: "failed",
    status,
    errorMessage
  };
}

function isWorkspaceMediaLeaseHeld(result: WorkspaceEditLeaseResult): result is Extract<WorkspaceEditLeaseResult, { kind: "held" }> {
  return result.kind === "held";
}

function buildAttachmentFilenameCollisionSet(records: WorkspaceMediaAttachmentRecord[]): Set<string> {
  const names = new Set<string>();
  for (const record of records) {
    const fileName = cleanText(record.fileName);
    if (fileName) {
      names.add(fileName);
    }
  }
  return names;
}

function allocateCollisionSafeFileName(fileName: string, existingFileNames: Set<string>): string {
  const candidate = cleanText(fileName);
  if (!existingFileNames.has(candidate)) {
    return candidate;
  }

  const split = splitSupportedMediaFileName(candidate);
  if (!split) {
    return candidate;
  }

  let suffix = 1;
  while (existingFileNames.has(`${split.baseName}-${suffix}.${split.extension}`)) {
    suffix += 1;
  }

  return `${split.baseName}-${suffix}.${split.extension}`;
}

function createDefaultDependencies(): WorkspaceMediaServiceDependencies {
  return {
    deleteAttachment(mediaId: string) {
      if (!cleanText(mediaId)) {
        return;
      }
      new GlideSysAttachment().deleteAttachment(mediaId);
    },
    evaluateWorkspaceCapabilities: evaluateCurrentUserWorkspaceCapabilities,
    getAttachmentBySysId(mediaId: string) {
      const attachment = new GlideRecord("sys_attachment");
      if (!attachment.get("sys_id", cleanText(mediaId))) {
        return null;
      }
      return {
        contentType: normalizeContentType(attachment.getValue("content_type")),
        createdOn: cleanText(attachment.getValue("sys_created_on")) || cleanText(attachment.getDisplayValue("sys_created_on")),
        fileName: cleanText(attachment.getValue("file_name")),
        mediaId: cleanText(attachment.getUniqueValue()),
        sizeBytes: safeInteger(attachment.getValue("size_bytes")) ?? 0,
        tableName: cleanText(attachment.getValue("table_name")),
        tableSysId: cleanText(attachment.getValue("table_sys_id")),
        updatedOn: cleanText(attachment.getValue("sys_updated_on")) || cleanText(attachment.getDisplayValue("sys_updated_on"))
      };
    },
    getAttachmentContentStream(mediaId: string) {
      return new GlideSysAttachment().getContentStream(cleanText(mediaId));
    },
    listWorkspaceAttachments(workspaceSysId: string) {
      const rows = new GlideRecord("sys_attachment");
      rows.addQuery("table_name", DOCSERA_WORKSPACE_TABLE);
      rows.addQuery("table_sys_id", cleanText(workspaceSysId));
      rows.query();

      const attachments: WorkspaceMediaAttachmentRecord[] = [];
      while (rows.next()) {
        attachments.push({
          contentType: normalizeContentType(rows.getValue("content_type")),
          createdOn: cleanText(rows.getValue("sys_created_on")) || cleanText(rows.getDisplayValue("sys_created_on")),
          fileName: cleanText(rows.getValue("file_name")),
          mediaId: cleanText(rows.getUniqueValue()),
          sizeBytes: safeInteger(rows.getValue("size_bytes")) ?? 0,
          tableName: cleanText(rows.getValue("table_name")),
          tableSysId: cleanText(rows.getValue("table_sys_id")),
          updatedOn: cleanText(rows.getValue("sys_updated_on")) || cleanText(rows.getDisplayValue("sys_updated_on"))
        });
      }

      return attachments;
    },
    loadWorkspaceBySysId(workspaceSysId: string) {
      const row = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
      if (!row.get("sys_id", cleanText(workspaceSysId))) {
        return null;
      }
      return mapWorkspaceRecord(row);
    },
    maxUploadBytes: 10 * 1024 * 1024,
    verifyWorkspaceEditLease,
    writeAttachmentToWorkspace(input: { contentType: SupportedWorkspaceMediaContentType; dataStream: unknown; fileName: string; workspaceSysId: string }) {
      const workspace = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
      if (!workspace.get("sys_id", cleanText(input.workspaceSysId))) {
        return null;
      }
      const attachment = new GlideSysAttachment();
      const mediaId = attachment.writeContentStream(workspace, cleanText(input.fileName), input.contentType, input.dataStream as never);
      return cleanText(mediaId);
    }
  };
}

export function createWorkspaceMediaService(dependencies: WorkspaceMediaServiceDependencies) {
  const maxUploadBytes = Number.isSafeInteger(dependencies.maxUploadBytes) && dependencies.maxUploadBytes > 0 ? dependencies.maxUploadBytes : 10 * 1024 * 1024;

  function loadWorkspaceOrFailure(workspaceSysId: string): WorkspaceRecord | WorkspaceMediaServiceFailure {
    const cleanWorkspaceSysId = cleanText(workspaceSysId);
    if (!cleanWorkspaceSysId) {
      return toFailure(400, "A workspace reference is required.");
    }

    const workspace = dependencies.loadWorkspaceBySysId(cleanWorkspaceSysId);
    if (!workspace || !cleanText(workspace.sysId)) {
      return toFailure(404, "Workspace could not be found.");
    }

    return workspace;
  }

  function validateAuthoringAccess(workspace: WorkspaceRecord): WorkspaceMediaServiceFailure | null {
    const capability = dependencies.evaluateWorkspaceCapabilities(workspace);
    if (!capability.canAdminWorkspace && !capability.canEditWorkspace) {
      return toFailure(403, "You do not have permission to access the workspace media library.");
    }

    return null;
  }

  function validateViewingAccess(workspace: WorkspaceRecord): WorkspaceMediaServiceFailure | null {
    const capability = dependencies.evaluateWorkspaceCapabilities(workspace);
    if (!capability.canViewWorkspace) {
      return toFailure(403, "You do not have permission to view media in this workspace.");
    }

    return null;
  }

  function listAttachments(workspaceSysId: string): WorkspaceMediaDescriptor[] {
    const attachments = dependencies.listWorkspaceAttachments(workspaceSysId);
    const items = attachments
      .filter((attachment) => cleanText(attachment.tableName) === DOCSERA_WORKSPACE_TABLE && cleanText(attachment.tableSysId) === cleanText(workspaceSysId))
      .map(toMediaDescriptor)
      .filter((item): item is WorkspaceMediaDescriptor => Boolean(item))
      .sort(compareMediaDescriptors);

    return items;
  }

  function loadAttachmentOrFailure(workspaceSysId: string, mediaId: string): WorkspaceMediaAttachmentRecord | WorkspaceMediaServiceFailure {
    const cleanWorkspaceSysId = cleanText(workspaceSysId);
    const cleanMediaId = cleanText(mediaId);
    if (!cleanWorkspaceSysId || !cleanMediaId) {
      return toFailure(400, "A workspace reference and media reference are required.");
    }

    const attachment = dependencies.getAttachmentBySysId(cleanMediaId);
    if (!attachment || cleanText(attachment.mediaId) !== cleanMediaId || cleanText(attachment.tableName) !== DOCSERA_WORKSPACE_TABLE || cleanText(attachment.tableSysId) !== cleanWorkspaceSysId) {
      return toFailure(404, "Media could not be found.");
    }

    return attachment;
  }

  function cleanupCreatedAttachment(mediaId: string): void {
    const cleanMediaId = cleanText(mediaId);
    if (!cleanMediaId) {
      return;
    }

    try {
      dependencies.deleteAttachment(cleanMediaId);
    } catch (error) {
      gs.error(`[Docsera workspace media] ${JSON.stringify({ context: { mediaId: cleanMediaId, phase: "cleanup" }, message: cleanText(error instanceof Error ? error.message : error) || "Unknown attachment cleanup failure." })}`);
    }
  }

  return {
    async listWorkspaceMedia(input: WorkspaceMediaListInput): Promise<WorkspaceMediaListResult> {
      const workspaceResult = loadWorkspaceOrFailure(input.workspaceSysId);
      if ("kind" in workspaceResult) {
        return workspaceResult;
      }

      const accessFailure = validateAuthoringAccess(workspaceResult);
      if (accessFailure) {
        return accessFailure;
      }

      return {
        kind: "succeeded",
        items: listAttachments(workspaceResult.sysId ?? cleanText(input.workspaceSysId))
      };
    },

    async uploadWorkspaceMedia(input: WorkspaceMediaUploadInput): Promise<WorkspaceMediaUploadResult> {
      const workspaceResult = loadWorkspaceOrFailure(input.workspaceSysId);
      if ("kind" in workspaceResult) {
        return workspaceResult;
      }

      const accessFailure = validateAuthoringAccess(workspaceResult);
      if (accessFailure) {
        return accessFailure;
      }

      const lease = await dependencies.verifyWorkspaceEditLease({
        workspaceLeaseToken: cleanText(input.workspaceLeaseToken),
        workspaceSlug: cleanText(workspaceResult.slug),
        workspaceSysId: cleanText(workspaceResult.sysId)
      });
      if (!isWorkspaceMediaLeaseHeld(lease)) {
        return toFailure(403, "A valid workspace edit lease is required to upload media.");
      }

      if (input.dataStream === undefined || input.dataStream === null) {
        return toFailure(400, "The upload body cannot be empty.");
      }

      const fileName = cleanText(input.fileName);
      if (!fileName) {
        return toFailure(400, "A file name is required.");
      }

      if (fileName.includes("/") || fileName.includes("\\") || fileName.includes("..")) {
        return toFailure(400, "The file name cannot include a path or traversal intent.");
      }

      const fileNameParts = splitSupportedMediaFileName(fileName);
      if (!fileNameParts) {
        return toFailure(415, "The file name must include a supported image extension.");
      }

      const expectedContentType = contentTypeForExtension(fileNameParts.extension);
      if (!expectedContentType) {
        return toFailure(415, "The file name must include a supported image extension.");
      }

      const requestContentType = normalizeContentType(input.contentType);
      if (!isSupportedMediaContentType(requestContentType)) {
        return toFailure(415, "The upload content type is not supported.");
      }

      if (requestContentType !== expectedContentType) {
        return toFailure(415, "The file name extension and upload content type do not match.");
      }

      const contentLengthBytes = Number.isSafeInteger(input.contentLengthBytes) ? input.contentLengthBytes ?? null : null;
      if (contentLengthBytes !== null) {
        if (contentLengthBytes <= 0) {
          return toFailure(400, "The upload body cannot be empty.");
        }

        if (contentLengthBytes > maxUploadBytes) {
          return toFailure(413, "The upload exceeds the 10 MB limit.");
        }
      }

      const existingNames = buildAttachmentFilenameCollisionSet(dependencies.listWorkspaceAttachments(workspaceResult.sysId ?? cleanText(input.workspaceSysId)));
      const collisionSafeFileName = allocateCollisionSafeFileName(fileName, existingNames);
      const mediaId = dependencies.writeAttachmentToWorkspace({
        contentType: requestContentType,
        dataStream: input.dataStream,
        fileName: collisionSafeFileName,
        workspaceSysId: workspaceResult.sysId ?? cleanText(input.workspaceSysId)
      });

      if (!cleanText(mediaId)) {
        return toFailure(500, "Something went wrong while saving the media file. Please try again.");
      }

      const attachment = dependencies.getAttachmentBySysId(mediaId);
      if (!attachment || cleanText(attachment.mediaId) !== cleanText(mediaId) || cleanText(attachment.tableName) !== DOCSERA_WORKSPACE_TABLE || cleanText(attachment.tableSysId) !== cleanText(workspaceResult.sysId ?? input.workspaceSysId) || !isSupportedMediaPair(attachment.fileName, attachment.contentType)) {
        cleanupCreatedAttachment(mediaId);
        return toFailure(500, "Something went wrong while saving the media file. Please try again.");
      }

      const persistedSizeBytes = safeInteger(attachment.sizeBytes);
      if (persistedSizeBytes === null) {
        cleanupCreatedAttachment(mediaId);
        return toFailure(500, "Something went wrong while saving the media file. Please try again.");
      }

      if (persistedSizeBytes <= 0) {
        cleanupCreatedAttachment(mediaId);
        return toFailure(400, "The upload body cannot be empty.");
      }

      if (persistedSizeBytes > maxUploadBytes) {
        cleanupCreatedAttachment(mediaId);
        return toFailure(413, "The upload exceeds the 10 MB limit.");
      }

      const descriptor = toMediaDescriptor({
        ...attachment,
        sizeBytes: persistedSizeBytes
      });
      if (!descriptor) {
        cleanupCreatedAttachment(mediaId);
        return toFailure(500, "Something went wrong while saving the media file. Please try again.");
      }

      return {
        kind: "succeeded",
        media: descriptor
      };
    },

    async getWorkspaceMediaFile(input: WorkspaceMediaLookupInput): Promise<WorkspaceMediaFileResult> {
      const workspaceResult = loadWorkspaceOrFailure(input.workspaceSysId);
      if ("kind" in workspaceResult) {
        return workspaceResult;
      }

      const accessFailure = validateViewingAccess(workspaceResult);
      if (accessFailure) {
        return accessFailure;
      }

      const attachmentResult = loadAttachmentOrFailure(cleanText(input.workspaceSysId), input.mediaId);
      if ("kind" in attachmentResult) {
        return attachmentResult;
      }

      if (!isSupportedMediaPair(attachmentResult.fileName, attachmentResult.contentType)) {
        return toFailure(415, "The requested media file is not a supported image type.");
      }

      const descriptor = toMediaDescriptor(attachmentResult);
      if (!descriptor) {
        return toFailure(415, "The requested media file is not a supported image type.");
      }

      const contentStream = dependencies.getAttachmentContentStream(attachmentResult.mediaId);
      if (contentStream === null || contentStream === undefined) {
        return toFailure(404, "Media could not be found.");
      }

      return {
        kind: "succeeded",
        contentStream,
        contentType: descriptor.contentType,
        media: descriptor
      };
    }
  };
}

export function createServiceNowWorkspaceMediaService() {
  return createWorkspaceMediaService(createDefaultDependencies());
}
