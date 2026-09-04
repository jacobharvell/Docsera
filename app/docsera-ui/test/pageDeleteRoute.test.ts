import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServiceNowWorkspaceChangeSetPersistenceService } = vi.hoisted(() => ({
  createServiceNowWorkspaceChangeSetPersistenceService: vi.fn()
}));

const { readWorkspaceMutationAuthority, sendWorkspaceLeaseMutationFailure, verifyWorkspaceEditLease } = vi.hoisted(() => ({
  readWorkspaceMutationAuthority: vi.fn(() => ({
    changeSetId: "change-set-001",
    changeSetRevision: 9
  })),
  sendWorkspaceLeaseMutationFailure: vi.fn(() => false),
  verifyWorkspaceEditLease: vi.fn(async () => ({ kind: "held", changeSetId: "change-set-001", changeSetRevision: 9 }))
}));

vi.mock("@servicenow/glide", () => ({
  GlideRecord: vi.fn(() => ({
    get: vi.fn((_field: string, value: string) => value === "workspace-001"),
    getValue: vi.fn((field: string) => {
      const values: Record<string, string> = {
        sys_id: "workspace-001",
        name: "Product Docs",
        workspace_slug: "product-docs",
        short_description: "Product documentation",
        status: "active",
        icon_type: "builtin",
        icon_value: "docsera-workspace",
        icon_label: "Docsera workspace icon",
        admin_group_sys_id: "group-admin",
        editor_group_sys_id: "group-editor",
        creator_user_sys_id: "user-001",
        layout_toc_visible_by_default: "true",
        layout_page_width: "readable"
      };
      return values[field] ?? "";
    }),
    isValidField: vi.fn(() => true)
  })),
  gs: {
    error: vi.fn()
  }
}));

vi.mock("../src/server/workspaces/serviceNowWorkspaceChangeSetPersistence.ts", () => ({
  createServiceNowWorkspaceChangeSetPersistenceService
}));

vi.mock("../src/server/workspaces/serviceNowWorkspaceRecords.ts", () => ({
  mapWorkspaceRecord: vi.fn(() => ({
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
      tocVisible: true,
      pageWidth: "readable"
    }
  }))
}));

vi.mock("../src/server/api/docsera-runtime-workspace-edit-lease.ts", () => ({
  readWorkspaceMutationAuthority,
  sendWorkspaceLeaseMutationFailure,
  verifyWorkspaceEditLease
}));

import { process as processDeletePageAction } from "../src/server/api/docsera-runtime-page-delete-action";
import { process as processDeletePageLegacy } from "../src/server/api/docsera-runtime-page-delete";

type ResponseRecorder = {
  body: unknown;
  status?: number;
  setBody: (payload: unknown) => void;
  setStatus: (status: number) => void;
};

function createResponseRecorder(): ResponseRecorder {
  return {
    body: undefined,
    status: undefined,
    setBody(payload: unknown) {
      this.body = payload;
    },
    setStatus(status: number) {
      this.status = status;
    }
  };
}

beforeEach(() => {
  vi.mocked(createServiceNowWorkspaceChangeSetPersistenceService).mockReset();
  vi.mocked(readWorkspaceMutationAuthority).mockReturnValue({
    changeSetId: "change-set-001",
    changeSetRevision: 9
  } as never);
  vi.mocked(sendWorkspaceLeaseMutationFailure).mockReturnValue(false);
  vi.mocked(verifyWorkspaceEditLease).mockResolvedValue({ kind: "held", changeSetId: "change-set-001", changeSetRevision: 9 } as never);
});

describe("page delete action route", () => {
  it("reads identifiers from the POST body and forwards them to the page settings service", async () => {
    const deletePage = vi.fn(() => ({
      authority: {
        changeSetId: "change-set-001",
        changeSetRevision: 10
      },
      kind: "succeeded" as const,
      result: {
        deletedPageSysId: "page-001",
        nextPageSysId: "page-002"
      }
    }));
    vi.mocked(createServiceNowWorkspaceChangeSetPersistenceService).mockReturnValue({
      deletePage,
      listPages: vi.fn()
    } as never);

    const response = createResponseRecorder();

    await processDeletePageAction(
      {
        body: {
          data: {
            workspaceSlug: "product-docs",
            workspaceSysId: "workspace-001",
            pageSysId: "page-001",
            workspaceLeaseToken: "workspace-lease-token",
            expectedChangeSetId: "change-set-001",
            expectedChangeSetRevision: 9,
            lockToken: "ignored-page-token"
          }
        }
      },
      response
    );

    expect(deletePage).toHaveBeenCalledWith({
      authority: {
        changeSetId: "change-set-001",
        changeSetRevision: 9
      },
      pageSysId: "page-001",
      workspace: expect.objectContaining({
        slug: "product-docs",
        sysId: "workspace-001"
      })
    });
    expect(verifyWorkspaceEditLease).toHaveBeenCalledWith(expect.objectContaining({
      workspaceLeaseToken: "workspace-lease-token",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    }));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      result: {
        changeSetId: "change-set-001",
        changeSetRevision: 10,
        mode: "servicenow",
        deletedPageSysId: "page-001",
        nextPageSysId: "page-002"
      }
    });
  });

  it("rejects missing identifiers safely", async () => {
    vi.mocked(createServiceNowWorkspaceChangeSetPersistenceService).mockReturnValue({
      deletePage: vi.fn(async () => ({
        kind: "failed" as const,
        errorMessage: "A workspace reference is required.",
        status: 400 as const
      })),
      listPages: vi.fn()
    } as never);

    const response = createResponseRecorder();

    await processDeletePageAction(
      {
        body: {
          data: {
            workspaceSlug: "",
            workspaceSysId: "",
            pageSysId: "",
            workspaceLeaseToken: "workspace-lease-token",
            expectedChangeSetId: "change-set-001",
            expectedChangeSetRevision: 9
          }
        }
      },
      response
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        code: "invalid",
        message: "A workspace reference is required."
      }
    });
  });

  it("returns the workspace lease failure before calling the delete service", async () => {
    const deletePage = vi.fn();
    vi.mocked(createServiceNowWorkspaceChangeSetPersistenceService).mockReturnValue({
      deletePage,
      listPages: vi.fn()
    } as never);
    vi.mocked(sendWorkspaceLeaseMutationFailure).mockImplementation((_result, response) => {
      response.setStatus?.(409);
      response.setBody({ error: { code: "workspace_lease_lost", message: "Workspace lease lost.", retryable: false } });
      return true;
    });

    const response = createResponseRecorder();
    await processDeletePageAction({ body: { workspaceSlug: "product-docs", workspaceSysId: "workspace-001", pageSysId: "page-001", workspaceLeaseToken: "lost-token" } }, response);

    expect(deletePage).not.toHaveBeenCalled();
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: { code: "workspace_lease_lost", message: "Workspace lease lost.", retryable: false } });
  });

  it("keeps the legacy DELETE route body-free", async () => {
    const response = createResponseRecorder();

    await processDeletePageLegacy({}, response);

    expect(response.status).toBe(405);
    expect(response.body).toEqual({
      error: {
        message: "Delete page requires the POST /pages/delete action route."
      }
    });
  });
});
