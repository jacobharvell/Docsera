import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  lease: {
    readWorkspaceMutationAuthority: vi.fn(),
    sendWorkspaceLeaseMutationFailure: vi.fn(),
    validateWorkspaceEditLeaseForRead: vi.fn(),
    verifyWorkspaceEditLease: vi.fn()
  },
  persistence: {
    createPage: vi.fn(),
    deletePage: vi.fn(),
    discardAllWorkspace: vi.fn(),
    discardPage: vi.fn(),
    listPages: vi.fn(),
    movePage: vi.fn(),
    pendingChanges: vi.fn(),
    publishWorkspace: vi.fn(),
    recoverAbandonedBodySave: vi.fn(),
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
import { process as processMovePage } from "./docsera-runtime-page-move.ts";
import { process as processPendingChanges } from "./docsera-runtime-workspace-pending-changes.ts";
import { process as processSavePageBody, processBodySaveRecovery } from "./docsera-runtime-page-save.ts";
import { process as processWorkspaceDiscardAll } from "./docsera-runtime-workspace-discard-all.ts";
import { process as processWorkspaceDiscardPage } from "./docsera-runtime-workspace-discard-page.ts";
import { process as processWorkspacePublish } from "./docsera-runtime-workspace-publish.ts";

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
    mocks.lease.validateWorkspaceEditLeaseForRead.mockReset();
    mocks.lease.verifyWorkspaceEditLease.mockReset();
    mocks.persistence.createPage.mockReset();
    mocks.persistence.deletePage.mockReset();
    mocks.persistence.discardAllWorkspace.mockReset();
    mocks.persistence.discardPage.mockReset();
    mocks.persistence.listPages.mockReset();
    mocks.persistence.movePage.mockReset();
    mocks.persistence.pendingChanges.mockReset();
    mocks.persistence.publishWorkspace.mockReset();
    mocks.persistence.recoverAbandonedBodySave.mockReset();
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

  it("passes the caller's claimed generation pair to move-page persistence and returns refreshed pages", async () => {
    mocks.lease.verifyWorkspaceEditLease.mockResolvedValue({
      kind: "held",
      leaseToken: "workspace-lease-token",
      heartbeatIntervalMs: 60_000,
      staleAfterMs: 300_000,
      changeSetId: "change-set-009",
      changeSetRevision: 12
    });
    mocks.lease.readWorkspaceMutationAuthority.mockReturnValue({ changeSetId: "change-set-008", changeSetRevision: 11 });
    mocks.persistence.movePage.mockReturnValue({
      kind: "succeeded",
      authority: { changeSetId: "change-set-009", changeSetRevision: 12 },
      result: { pages: [{ sysId: "page-101", parentPageSysId: null, siblingOrder: 4 }] }
    });
    const response = responseRecorder();

    await processMovePage({
      body: {
        workspaceSysId: "workspace-001",
        workspaceSlug: "product-docs",
        workspaceLeaseToken: "workspace-lease-token",
        expectedChangeSetId: "change-set-008",
        expectedChangeSetRevision: 11,
        pageSysId: "page-101",
        parentPageSysId: null,
        siblingOrder: "4"
      }
    }, response);

    expect(mocks.persistence.movePage).toHaveBeenCalledWith(expect.objectContaining({
      authority: { changeSetId: "change-set-008", changeSetRevision: 11 },
      pageSysId: "page-101",
      parentPageSysId: null,
      siblingOrder: "4"
    }));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      result: {
        mode: "servicenow",
        pages: [{ sysId: "page-101", parentPageSysId: null, siblingOrder: 4 }],
        changeSetId: "change-set-009",
        changeSetRevision: 12
      }
    });
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

  it("recovers an expired body claim through the held lease without accepting client mutation authority", async () => {
    mocks.lease.verifyWorkspaceEditLease.mockResolvedValue({ kind: "held", leaseToken: "workspace-lease-token", heartbeatIntervalMs: 60_000, staleAfterMs: 300_000, changeSetId: "change-set-001", changeSetRevision: 4 });
    mocks.persistence.recoverAbandonedBodySave.mockReturnValue({ kind: "recovered", authority: { changeSetId: "change-set-001", changeSetRevision: 5 } });
    const response = responseRecorder();

    await processBodySaveRecovery({ body: {
      workspaceSysId: "workspace-001", workspaceLeaseToken: "workspace-lease-token",
      expectedChangeSetId: "attacker-controlled", expectedChangeSetRevision: 999,
      pageSysId: "attacker-controlled", draftContentJson: { secret: "must-not-be-used" }
    } }, response);

    expect(mocks.persistence.recoverAbandonedBodySave).toHaveBeenCalledWith(mocks.workspaceRecord);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ result: { outcome: "recovered", changeSetId: "change-set-001", changeSetRevision: 5 } });
  });

  it("maps body-save recovery outcomes without exposing claim payloads", async () => {
    mocks.lease.verifyWorkspaceEditLease.mockResolvedValue({ kind: "held", leaseToken: "workspace-lease-token", heartbeatIntervalMs: 60_000, staleAfterMs: 300_000, changeSetId: "change-set-001", changeSetRevision: 4 });
    mocks.persistence.recoverAbandonedBodySave.mockReturnValue({ kind: "executor_active", authority: { changeSetId: "change-set-001", changeSetRevision: 4 } });
    const active = responseRecorder();
    await processBodySaveRecovery({ body: { workspaceSysId: "workspace-001", workspaceLeaseToken: "workspace-lease-token" } }, active);
    expect(active.body).toEqual({ error: { code: "executor_active", retryable: false, message: "The original body-save executor is still active." } });

    mocks.persistence.recoverAbandonedBodySave.mockReturnValue({ kind: "unsupported", authority: { changeSetId: "change-set-001", changeSetRevision: 4 } });
    const unsupported = responseRecorder();
    await processBodySaveRecovery({ body: { workspaceSysId: "workspace-001", workspaceLeaseToken: "workspace-lease-token" } }, unsupported);
    expect(unsupported.body).toEqual({ error: { code: "unsupported_mutation", retryable: false, message: "The unfinished mutation cannot be recovered by this operation." } });
  });

  it("requires the established Edit lease before body-save recovery", async () => {
    mocks.lease.verifyWorkspaceEditLease.mockResolvedValue({ kind: "lost", errorMessage: "This workspace edit session was replaced by another editor.", currentHolder: null });
    mocks.lease.sendWorkspaceLeaseMutationFailure.mockImplementation((_result, response) => {
      response.setStatus?.(409);
      response.setBody({ error: { code: "workspace_lease_lost", retryable: false, message: "This workspace edit session was replaced by another editor." } });
      return true;
    });
    const response = responseRecorder();
    await processBodySaveRecovery({ body: { workspaceSysId: "workspace-001", workspaceLeaseToken: "wrong" } }, response);
    expect(mocks.persistence.recoverAbandonedBodySave).not.toHaveBeenCalled();
    expect(response.status).toBe(409);
  });

  it("passes the caller's claimed generation pair to workspace discard-page persistence and returns refreshed state", async () => {
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
    mocks.persistence.discardPage.mockReturnValue({
      kind: "succeeded",
      authority: { changeSetId: "change-set-009", changeSetRevision: 12 },
      result: {
        discardedPageSysId: "page-101",
        pages: [{ sysId: "page-102" }],
        pendingChanges: {
          affectedPageCount: 1,
          changeSetId: "change-set-009",
          changeSetRevision: 12,
          rows: [{
            attribution: {
              accessibleLabel: "Last changed by Priya Writer",
              displayName: "P. Writer",
              fullDisplayName: "Priya Writer"
            },
            category: "Modified",
            firstPendingSequence: 2,
            lastChangedOn: "2026-07-18 00:00:00",
            navigable: true,
            pageSysId: "page-102",
            title: "Overview"
          }],
          workspaceSysId: "workspace-001"
        },
        workspaceStateRevision: 19
      }
    });
    const response = responseRecorder();

    await processWorkspaceDiscardPage({
      body: {
        workspaceSysId: "workspace-001",
        workspaceSlug: "product-docs",
        workspaceLeaseToken: "workspace-lease-token",
        expectedChangeSetId: "change-set-008",
        expectedChangeSetRevision: 11,
        pageSysId: "page-101"
      }
    }, response);

    expect(mocks.persistence.discardPage).toHaveBeenCalledWith(expect.objectContaining({
      authority: { changeSetId: "change-set-008", changeSetRevision: 11 },
      pageSysId: "page-101"
    }));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      result: {
        mode: "servicenow",
        discardedPageSysId: "page-101",
        pages: [{ sysId: "page-102" }],
        pendingChanges: expect.objectContaining({
          affectedPageCount: 1,
          changeSetId: "change-set-009",
          changeSetRevision: 12
        }),
        workspaceStateRevision: 19,
        changeSetId: "change-set-009",
        changeSetRevision: 12
      }
    });
  });

  it("returns pending changes through a held workspace edit lease without mutation authority", async () => {
    mocks.lease.validateWorkspaceEditLeaseForRead.mockResolvedValue({
      kind: "held",
      leaseToken: "workspace-lease-token",
      heartbeatIntervalMs: 60_000,
      staleAfterMs: 300_000,
      changeSetId: "change-set-002",
      changeSetRevision: 3,
      workspaceStateRevision: 7
    });
    mocks.persistence.pendingChanges.mockReturnValue({
      kind: "succeeded",
      pending: {
        affectedPageCount: 1,
        changeSetId: "change-set-002",
        changeSetRevision: 3,
        rows: [{
          attribution: {
            accessibleLabel: "Last changed by Priya Writer",
            displayName: "P. Writer",
            fullDisplayName: "Priya Writer"
          },
          category: "Modified",
          firstPendingSequence: 1,
          lastChangedOn: "2026-07-18 00:00:00",
          navigable: true,
          pageSysId: "page-001",
          title: "Overview"
        }],
        workspaceSysId: "workspace-001"
      }
    });
    const response = responseRecorder();

    await processPendingChanges({
      body: {
        workspaceSysId: "workspace-001",
        workspaceSlug: "product-docs",
        workspaceLeaseToken: "workspace-lease-token"
      }
    }, response);

    expect(mocks.lease.readWorkspaceMutationAuthority).not.toHaveBeenCalled();
    expect(mocks.lease.verifyWorkspaceEditLease).not.toHaveBeenCalled();
    expect(mocks.lease.validateWorkspaceEditLeaseForRead).toHaveBeenCalledWith(expect.objectContaining({
      workspaceLeaseToken: "workspace-lease-token",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    }));
    expect(mocks.persistence.pendingChanges).toHaveBeenCalledWith(expect.objectContaining({ sysId: "workspace-001" }));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      result: {
        mode: "servicenow",
        affectedPageCount: 1,
        changeSetId: "change-set-002",
        changeSetRevision: 3,
        rows: [expect.objectContaining({ category: "Modified", pageSysId: "page-001", title: "Overview" })],
        workspaceSysId: "workspace-001"
      }
    });
  });

  it("returns recovery-required pending changes with successor authority and the persisted recovery command", async () => {
    mocks.lease.validateWorkspaceEditLeaseForRead.mockResolvedValue({
      kind: "held",
      leaseToken: "workspace-lease-token",
      heartbeatIntervalMs: 60_000,
      staleAfterMs: 300_000,
      changeSetId: "change-set-successor",
      changeSetRevision: 0,
      workspaceStateRevision: 7
    });
    mocks.persistence.pendingChanges.mockReturnValue({
      code: "recovery_required",
      currentChangeSetId: "change-set-successor",
      currentChangeSetRevision: 0,
      errorMessage: "Discard recovery is incomplete.",
      kind: "failed",
      recoveryCommandId: "discard-001",
      status: 409
    });
    const response = responseRecorder();

    await processPendingChanges({
      body: {
        workspaceSysId: "workspace-001",
        workspaceSlug: "product-docs",
        workspaceLeaseToken: "workspace-lease-token"
      }
    }, response);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: "recovery_required",
        currentChangeSetId: "change-set-successor",
        currentChangeSetRevision: 0,
        message: "Discard recovery is incomplete.",
        recoveryCommandId: "discard-001"
      }
    });
  });

  it("publishes a workspace only after lease and exact mutation authority verification", async () => {
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
    mocks.persistence.publishWorkspace.mockReturnValue({
      kind: "succeeded",
      authority: {
        changeSetId: "change-set-successor",
        changeSetRevision: 0
      },
      result: {
        pages: [{ sysId: "page-001", draftTitle: "Published Overview" }],
        pendingChanges: {
          affectedPageCount: 0,
          changeSetId: "change-set-successor",
          changeSetRevision: 0,
          rows: [],
          state: "succeeded",
          workspaceSysId: "workspace-001"
        },
        publishedSnapshotSetId: "snapshot-published",
        workspaceStateRevision: 8
      }
    });
    const response = responseRecorder();

    await processWorkspacePublish({
      body: {
        commandId: "publish-001",
        workspaceSysId: "workspace-001",
        workspaceSlug: "product-docs",
        workspaceLeaseToken: "workspace-lease-token",
        expectedChangeSetId: "change-set-001",
        expectedChangeSetRevision: 2
      }
    }, response);

    expect(mocks.lease.verifyWorkspaceEditLease).toHaveBeenCalledWith(expect.objectContaining({
      workspaceLeaseToken: "workspace-lease-token",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    }));
    expect(mocks.lease.readWorkspaceMutationAuthority).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "held" }),
      expect.objectContaining({
        expectedChangeSetId: "change-set-001",
        expectedChangeSetRevision: 2
      }),
      response
    );
    expect(mocks.persistence.publishWorkspace).toHaveBeenCalledWith({
      authority: {
        changeSetId: "change-set-001",
        changeSetRevision: 2
      },
      commandId: "publish-001",
      workspace: expect.objectContaining({ sysId: "workspace-001" })
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      result: {
        mode: "servicenow",
        pages: [{ sysId: "page-001", draftTitle: "Published Overview" }],
        pendingChanges: {
          affectedPageCount: 0,
          changeSetId: "change-set-successor",
          changeSetRevision: 0,
          rows: [],
          state: "succeeded",
          workspaceSysId: "workspace-001"
        },
        publishedSnapshotSetId: "snapshot-published",
        workspaceStateRevision: 8,
        changeSetId: "change-set-successor",
        changeSetRevision: 0
      }
    });
  });

  it("discards a workspace change set only after lease and exact mutation authority verification", async () => {
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
    mocks.persistence.discardAllWorkspace.mockReturnValue({
      kind: "succeeded",
      authority: {
        changeSetId: "change-set-successor",
        changeSetRevision: 0
      },
      result: {
        pages: [{ sysId: "page-001", draftTitle: "Published Overview" }],
        pendingChanges: {
          affectedPageCount: 0,
          changeSetId: "change-set-successor",
          changeSetRevision: 0,
          rows: [],
          state: "succeeded",
          workspaceSysId: "workspace-001"
        },
        workspaceStateRevision: 8
      }
    });
    const response = responseRecorder();

    await processWorkspaceDiscardAll({
      body: {
        commandId: "discard-001",
        workspaceSysId: "workspace-001",
        workspaceSlug: "product-docs",
        workspaceLeaseToken: "workspace-lease-token",
        expectedChangeSetId: "change-set-001",
        expectedChangeSetRevision: 2
      }
    }, response);

    expect(mocks.persistence.discardAllWorkspace).toHaveBeenCalledWith({
      authority: {
        changeSetId: "change-set-001",
        changeSetRevision: 2
      },
      commandId: "discard-001",
      workspace: expect.objectContaining({ sysId: "workspace-001" })
    });
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      result: {
        mode: "servicenow",
        pages: [{ sysId: "page-001", draftTitle: "Published Overview" }],
        pendingChanges: {
          affectedPageCount: 0,
          changeSetId: "change-set-successor",
          changeSetRevision: 0,
          rows: [],
          state: "succeeded",
          workspaceSysId: "workspace-001"
        },
        workspaceStateRevision: 8,
        changeSetId: "change-set-successor",
        changeSetRevision: 0
      }
    });
  });

  it("surfaces recovery-required discard-all failures with the active successor authority", async () => {
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
    mocks.persistence.discardAllWorkspace.mockReturnValue({
      affectedPageCount: 4,
      code: "recovery_required",
      currentChangeSetId: "change-set-successor",
      currentChangeSetRevision: 0,
      errorMessage: "Discard recovery is incomplete.",
      kind: "failed",
      recoveryCommandId: "discard-001",
      status: 409
    });
    const response = responseRecorder();

    await processWorkspaceDiscardAll({
      body: {
        commandId: "discard-001",
        workspaceSysId: "workspace-001",
        workspaceSlug: "product-docs",
        workspaceLeaseToken: "workspace-lease-token",
        expectedChangeSetId: "change-set-001",
        expectedChangeSetRevision: 2
      }
    }, response);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        affectedPageCount: 4,
        code: "recovery_required",
        currentChangeSetId: "change-set-successor",
        currentChangeSetRevision: 0,
        message: "Discard recovery is incomplete.",
        recoveryCommandId: "discard-001"
      }
    });
  });

  it("does not publish when mutation authority validation rejects the request", async () => {
    mocks.lease.verifyWorkspaceEditLease.mockResolvedValue({
      kind: "held",
      leaseToken: "workspace-lease-token",
      heartbeatIntervalMs: 60_000,
      staleAfterMs: 300_000,
      changeSetId: "change-set-002",
      changeSetRevision: 3
    });
    mocks.lease.readWorkspaceMutationAuthority.mockReturnValue(null);
    const response = responseRecorder();

    await processWorkspacePublish({
      body: {
        commandId: "publish-001",
        workspaceSysId: "workspace-001",
        workspaceSlug: "product-docs",
        workspaceLeaseToken: "workspace-lease-token",
        expectedChangeSetId: "stale-change-set",
        expectedChangeSetRevision: 1
      }
    }, response);

    expect(mocks.persistence.publishWorkspace).not.toHaveBeenCalled();
  });
});
