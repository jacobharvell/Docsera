import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lease: {
    readWorkspaceMutationAuthority: vi.fn(),
    sendWorkspaceLeaseMutationFailure: vi.fn(),
    verifyWorkspaceEditLease: vi.fn()
  },
  persistence: {
    createPage: vi.fn(),
    deletePage: vi.fn(),
    listPages: vi.fn(),
    savePageBody: vi.fn(),
    savePageSettings: vi.fn()
  },
  glide: {
    gs: {
      error: vi.fn()
    }
  },
  workspaceRecord: {
    sysId: "workspace-001",
    slug: "product-docs",
    name: "Product Docs"
  }
}));

vi.mock("./docsera-runtime-workspace-edit-lease.ts", () => mocks.lease);

vi.mock("../workspaces/serviceNowWorkspaceChangeSetPersistence.ts", () => ({
  createServiceNowWorkspaceChangeSetPersistenceService: () => mocks.persistence
}));

vi.mock("../workspaces/serviceNowWorkspaceRecords.ts", () => ({
  mapWorkspaceRecord: vi.fn(() => mocks.workspaceRecord)
}));

vi.mock("../workspaces/serverWorkspaceDomain.ts", () => ({
  DOCSERA_WORKSPACE_TABLE: "x_82900_docsera_workspace"
}));

vi.mock("@servicenow/glide", () => ({
  GlideRecord: class {
    constructor(_tableName: string) {}

    get(fieldName: string, value: unknown) {
      return fieldName === "sys_id" && String(value).trim() === "workspace-001";
    }

    addQuery() {}

    setLimit() {}

    query() {}

    next() {
      return false;
    }
  },
  gs: mocks.glide.gs
}));

import { process as processCreatePage } from "./docsera-runtime-create-page.ts";
import { process as processSavePageBody } from "./docsera-runtime-page-save.ts";

function responseRecorder() {
  return {
    body: undefined as unknown,
    status: undefined as number | undefined,
    setBody(payload: unknown) {
      this.body = payload;
    },
    setStatus(status: number) {
      this.status = status;
    }
  };
}

describe("docsera runtime mutation routes", () => {
  beforeEach(() => {
    mocks.lease.readWorkspaceMutationAuthority.mockReset();
    mocks.lease.sendWorkspaceLeaseMutationFailure.mockReset();
    mocks.lease.verifyWorkspaceEditLease.mockReset();
    mocks.persistence.createPage.mockReset();
    mocks.persistence.deletePage.mockReset();
    mocks.persistence.listPages.mockReset();
    mocks.persistence.savePageBody.mockReset();
    mocks.persistence.savePageSettings.mockReset();
    mocks.glide.gs.error.mockReset();
    mocks.lease.sendWorkspaceLeaseMutationFailure.mockReturnValue(false);
  });

  it("passes the caller's claimed generation pair to body persistence even when the renewed lease has advanced", async () => {
    mocks.lease.verifyWorkspaceEditLease.mockResolvedValue({
      kind: "held",
      leaseToken: "workspace-lease-token",
      heartbeatIntervalMs: 60_000,
      staleAfterMs: 300_000,
      changeSetId: "change-set-002",
      changeSetRevision: 3,
      workspaceStateRevision: 7
    });
    mocks.lease.readWorkspaceMutationAuthority.mockReturnValue({
      changeSetId: "change-set-001",
      changeSetRevision: 2
    });
    mocks.persistence.savePageBody.mockReturnValue({
      kind: "succeeded",
      authority: {
        changeSetId: "change-set-002",
        changeSetRevision: 3
      },
      result: {
        page: {
          sysId: "page-001"
        }
      }
    });
    const response = responseRecorder();

    await processSavePageBody(
      {
        body: {
          workspaceSysId: "workspace-001",
          workspaceSlug: "product-docs",
          workspaceLeaseToken: "workspace-lease-token",
          expectedChangeSetId: "change-set-001",
          expectedChangeSetRevision: 2,
          pageSysId: "page-001",
          expectedRevision: 4,
          draftContentJson: { type: "doc", content: [] }
        }
      },
      response
    );

    expect(mocks.lease.readWorkspaceMutationAuthority).toHaveBeenCalledWith(
      expect.objectContaining({
        changeSetId: "change-set-002",
        changeSetRevision: 3
      }),
      expect.objectContaining({
        expectedChangeSetId: "change-set-001",
        expectedChangeSetRevision: 2
      }),
      response
    );
    expect(mocks.persistence.savePageBody).toHaveBeenCalledWith(
      expect.objectContaining({
        authority: {
          changeSetId: "change-set-001",
          changeSetRevision: 2
        }
      })
    );
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      result: {
        mode: "servicenow",
        page: {
          sysId: "page-001"
        },
        changeSetId: "change-set-002",
        changeSetRevision: 3
      }
    });
  });

  it("passes the caller's claimed generation pair to create-page persistence", async () => {
    mocks.lease.verifyWorkspaceEditLease.mockResolvedValue({
      kind: "held",
      leaseToken: "workspace-lease-token",
      heartbeatIntervalMs: 60_000,
      staleAfterMs: 300_000,
      changeSetId: "change-set-009",
      changeSetRevision: 12,
      workspaceStateRevision: 18
    });
    mocks.lease.readWorkspaceMutationAuthority.mockReturnValue({
      changeSetId: "change-set-008",
      changeSetRevision: 11
    });
    mocks.persistence.createPage.mockReturnValue({
      kind: "succeeded",
      authority: {
        changeSetId: "change-set-009",
        changeSetRevision: 12
      },
      result: {
        page: {
          sysId: "page-101"
        }
      }
    });
    const response = responseRecorder();

    await processCreatePage(
      {
        body: {
          workspaceSysId: "workspace-001",
          workspaceSlug: "product-docs",
          workspaceLeaseToken: "workspace-lease-token",
          expectedChangeSetId: "change-set-008",
          expectedChangeSetRevision: 11,
          title: "New page"
        }
      },
      response
    );

    expect(mocks.persistence.createPage).toHaveBeenCalledWith(
      expect.objectContaining({
        authority: {
          changeSetId: "change-set-008",
          changeSetRevision: 11
        }
      })
    );
    expect(response.status).toBe(201);
  });

  it("still blocks mutation routes when the workspace lease has been lost", async () => {
    mocks.lease.verifyWorkspaceEditLease.mockResolvedValue({
      kind: "lost",
      errorMessage: "This workspace edit session was replaced by another editor.",
      currentHolder: null
    });
    mocks.lease.sendWorkspaceLeaseMutationFailure.mockImplementation((result, response) => {
      response.setStatus?.(409);
      response.setBody({
        error: {
          code: "workspace_lease_lost",
          retryable: false,
          message: result.errorMessage
        }
      });
      return true;
    });
    const response = responseRecorder();

    await processSavePageBody(
      {
        body: {
          workspaceSysId: "workspace-001",
          workspaceSlug: "product-docs",
          workspaceLeaseToken: "workspace-lease-token",
          expectedChangeSetId: "change-set-001",
          expectedChangeSetRevision: 2,
          pageSysId: "page-001",
          expectedRevision: 4,
          draftContentJson: { type: "doc", content: [] }
        }
      },
      response
    );

    expect(mocks.lease.readWorkspaceMutationAuthority).not.toHaveBeenCalled();
    expect(mocks.persistence.savePageBody).not.toHaveBeenCalled();
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: "workspace_lease_lost",
        retryable: false,
        message: "This workspace edit session was replaced by another editor."
      }
    });
  });
});
