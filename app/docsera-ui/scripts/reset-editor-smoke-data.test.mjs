import { describe, expect, it } from "vitest";
import {
  authorizeProofCleanup,
  buildEmptyWorkspaceCreateBody,
  buildProofRecoveryPlan,
  buildProofCleanupDeleteOrder,
  buildProofCleanupInventory,
  planSmokeResetWorkspace,
  planProofWorkspaceRecovery,
  shouldReleaseSmokeLease
} from "./reset-editor-smoke-data.mjs";

describe("editor smoke reset lease handling", () => {
  it("treats a held workspace lease as a destructive-reset block", () => {
    const result = planSmokeResetWorkspace(
      {
        slug: "task-32-jacob-smoke-empty",
        name: "Task 32 Jacob Smoke Empty",
        page: undefined
      },
      {
        status: 409,
        payload: {
          error: {
            code: "workspace_locked",
            holderDisplayName: "Priya Writer",
            sameUserDifferentSession: true
          }
        }
      }
    );

    expect(result).toEqual({
      slug: "task-32-jacob-smoke-empty",
      name: "Task 32 Jacob Smoke Empty",
      plannedAction: "delete-and-recreate",
      leaseState: "unknown",
      holderDisplayName: "Priya Writer",
      blocked: true,
      blockReason: "active lease held by Priya Writer"
    });
  });

  it("keeps unlocked workspaces eligible for destructive reset", () => {
    const result = planSmokeResetWorkspace(
      {
        slug: "task-32-jacob-smoke-populated",
        name: "Task 32 Jacob Smoke Populated",
        page: { draftSlug: "editor-controls-smoke" }
      },
      {
        status: 200,
        payload: {
          result: {
            state: "unlocked"
          }
        }
      }
    );

    expect(result.blocked).toBe(false);
    expect(result.blockReason).toBe("");
    expect(result.leaseState).toBe("unlocked");
  });

  it("treats an unknown lease state as a destructive-reset block", () => {
    const result = planSmokeResetWorkspace(
      {
        slug: "task-32-jacob-smoke-empty",
        name: "Task 32 Jacob Smoke Empty",
        page: undefined
      },
      {
        status: 500,
        payload: {
          error: {
            code: "unexpected_failure"
          }
        }
      }
    );

    expect(result.blocked).toBe(true);
    expect(result.leaseState).toBe("unknown");
    expect(result.blockReason).toContain("HTTP 500");
  });

  it("passes the exact lease authority into the empty-workspace create request", () => {
    expect(
      buildEmptyWorkspaceCreateBody({
        title: "First Smoke Reset Page",
        workspaceSlug: "task-32-jacob-smoke-empty",
        workspaceSysId: "workspace-001",
        workspaceLeaseToken: "lease-token-123",
        expectedChangeSetId: "change-set-001",
        expectedChangeSetRevision: 7
      })
    ).toEqual({
      title: "First Smoke Reset Page",
      workspaceSlug: "task-32-jacob-smoke-empty",
      workspaceSysId: "workspace-001",
      workspaceLeaseToken: "lease-token-123",
      expectedChangeSetId: "change-set-001",
      expectedChangeSetRevision: 7
    });
  });

  it("only schedules supported lease release when a token was actually acquired", () => {
    expect(shouldReleaseSmokeLease("lease-token-123")).toBe(true);
    expect(shouldReleaseSmokeLease("   ")).toBe(false);
    expect(shouldReleaseSmokeLease("")).toBe(false);
  });

  it("authorizes proof cleanup after a successful supported lease release", () => {
    expect(authorizeProofCleanup({ releaseResult: { status: 200 }, statusResult: null })).toEqual({
      authorized: true,
      reason: "supported release confirmed"
    });
  });

  it("does not authorize proof cleanup when release fails and the workspace is still held", () => {
    expect(
      authorizeProofCleanup({
        releaseResult: { status: 409 },
        statusResult: {
          status: 200,
          payload: {
            result: {
              state: "held",
              holderDisplayName: "Priya Writer"
            }
          }
        }
      })
    ).toEqual({
      authorized: false,
      reason: "supported release could not be confirmed and the workspace remained non-unlocked"
    });
  });

  it("authorizes proof cleanup when supported status confirms unlocked after release uncertainty", () => {
    expect(
      authorizeProofCleanup({
        releaseResult: { status: 409 },
        statusResult: {
          status: 200,
          payload: {
            result: {
              state: "unlocked"
            }
          }
        }
      })
    ).toEqual({
      authorized: true,
      reason: "supported status confirmed unlocked"
    });
  });

  it("builds the bounded proof cleanup inventory without a lease-delete path", () => {
    const inventory = buildProofCleanupInventory({
      workspaceSysId: "workspace-001",
      workspaceSlug: "task-32-jacob-smoke-empty-proof",
      pageIds: ["page-001"],
      snapshotSetIds: ["snapshot-001"],
      changeSetIds: ["change-set-001"],
      requestIds: ["request-001"],
      membershipIds: ["membership-001"],
      groupRoleGrantIds: ["grant-001"],
      groupIds: ["group-001", "group-002"],
      leaseIds: ["lease-001"]
    });

    expect(inventory).toMatchObject({
      workspaceSysId: "workspace-001",
      workspaceSlug: "task-32-jacob-smoke-empty-proof",
      pageIds: ["page-001"],
      snapshotSetIds: ["snapshot-001"],
      changeSetIds: ["change-set-001"],
      requestIds: ["request-001"],
      membershipIds: ["membership-001"],
      groupRoleGrantIds: ["grant-001"],
      groupIds: ["group-001", "group-002"],
      leaseIds: ["lease-001"]
    });
  });

  it("orders proof cleanup to remove foundation records before the workspace boundary", () => {
    const order = buildProofCleanupDeleteOrder(
      buildProofCleanupInventory({
        workspaceSysId: "workspace-001",
        pageIds: ["page-001"],
        snapshotSetIds: ["snapshot-001"],
        changeSetIds: ["change-set-001"],
        requestIds: ["request-001"],
        membershipIds: ["membership-001"],
        groupRoleGrantIds: ["grant-001"],
        groupIds: ["group-001"]
      })
    );

    expect(order.map((step) => step.kind)).toEqual([
      "removalMembers",
      "removalBatches",
      "mutationClaims",
      "changeEntries",
      "snapshotPages",
      "pages",
      "snapshotSets",
      "changeSets",
      "requests",
      "workspace",
      "memberships",
      "groupRoleGrants",
      "groups"
    ]);
  });

  it("marks an unlocked stale proof workspace as eligible for bounded cleanup", () => {
    expect(
      planProofWorkspaceRecovery(
        {
          slug: "task-32-proof",
          name: "Task 32 Proof"
        },
        {
          status: 200,
          payload: {
            result: {
              state: "unlocked"
            }
          }
        }
      )
    ).toMatchObject({
      slug: "task-32-proof",
      blocked: false,
      action: "cleanup"
    });
  });

  it("blocks creating another proof workspace while a stale proof workspace is still leased", () => {
    expect(
      planProofWorkspaceRecovery(
        {
          slug: "task-32-proof",
          name: "Task 32 Proof"
        },
        {
          status: 409,
          payload: {
            error: {
              code: "workspace_locked",
              holderDisplayName: "Priya Writer"
            }
          }
        }
      )
    ).toMatchObject({
      slug: "task-32-proof",
      blocked: true,
      action: "block",
      blockReason: "active lease held by Priya Writer"
    });
  });

  it("blocks the proof recovery plan when an existing proof workspace lease is held", () => {
    const plan = buildProofRecoveryPlan({
      proofWorkspacePlans: [
        {
          workspace: {
            slug: "task-32-proof",
            name: "Task 32 Proof",
            sysId: "workspace-001"
          },
          record: {
            admin_group: "group-admin-001",
            editor_group: "group-editor-001"
          },
          plan: planProofWorkspaceRecovery(
            {
              slug: "task-32-proof",
              name: "Task 32 Proof"
            },
            {
              status: 409,
              payload: {
                error: {
                  code: "workspace_locked",
                  holderDisplayName: "Priya Writer"
                }
              }
            }
          )
        }
      ],
      failedRequests: [
        {
          sys_id: "request-001",
          workspace_slug: "task-32-proof",
          state: "failed"
        }
      ],
      candidateGroupRecords: [{ sys_id: "group-admin-001", name: "Proof Admins" }]
    });

    expect(plan.blocked).toBe(true);
    expect(plan.blockers).toEqual([
      {
        slug: "task-32-proof",
        workspaceSysId: "workspace-001",
        leaseState: "unknown",
        holderDisplayName: "Priya Writer",
        blockReason: "active lease held by Priya Writer"
      }
    ]);
    expect(plan.failedProvisionRequests[0]?.plannedAction).toBe("block");
    expect(plan.orphanGroups[0]?.plannedAction).toBe("block");
    expect(plan.plannedActions).toEqual({
      cleanupWorkspaceSysIds: [],
      cleanupFailedRequestIds: [],
      cleanupOrphanGroupIds: []
    });
  });

  it("blocks the proof recovery plan when lease state is unknown", () => {
    const plan = buildProofRecoveryPlan({
      proofWorkspacePlans: [
        {
          workspace: {
            slug: "task-32-proof",
            name: "Task 32 Proof",
            sysId: "workspace-001"
          },
          record: {},
          plan: planProofWorkspaceRecovery(
            {
              slug: "task-32-proof",
              name: "Task 32 Proof"
            },
            {
              status: 500,
              payload: {
                error: {
                  code: "unexpected_failure"
                }
              }
            }
          )
        }
      ],
      failedRequests: [],
      candidateGroupRecords: []
    });

    expect(plan.blocked).toBe(true);
    expect(plan.blockers[0]).toMatchObject({
      slug: "task-32-proof",
      leaseState: "unknown",
      blockReason: "lease status returned HTTP 500"
    });
  });

  it("marks an unlocked stale proof workspace as eligible for bounded recovery", () => {
    const plan = buildProofRecoveryPlan({
      proofWorkspacePlans: [
        {
          workspace: {
            slug: "task-32-proof",
            name: "Task 32 Proof",
            sysId: "workspace-001"
          },
          record: {
            admin_group: "group-admin-001",
            editor_group: "group-editor-001"
          },
          plan: planProofWorkspaceRecovery(
            {
              slug: "task-32-proof",
              name: "Task 32 Proof"
            },
            {
              status: 200,
              payload: {
                result: {
                  state: "unlocked"
                }
              }
            }
          )
        }
      ],
      failedRequests: [],
      candidateGroupRecords: []
    });

    expect(plan.blocked).toBe(false);
    expect(plan.workspaces).toEqual([
      {
        slug: "task-32-proof",
        name: "Task 32 Proof",
        workspaceSysId: "workspace-001",
        adminGroupId: "group-admin-001",
        editorGroupId: "group-editor-001",
        leaseState: "unlocked",
        holderDisplayName: "",
        blocked: false,
        blockReason: "",
        plannedAction: "cleanup"
      }
    ]);
    expect(plan.plannedActions.cleanupWorkspaceSysIds).toEqual(["workspace-001"]);
  });

  it("marks orphan deterministic groups with no workspace reference as eligible for cleanup", () => {
    const plan = buildProofRecoveryPlan({
      proofWorkspacePlans: [],
      failedRequests: [
        {
          sys_id: "request-001",
          workspace_slug: "task-32-proof",
          state: "failed"
        }
      ],
      candidateGroupRecords: [{ sys_id: "group-orphan-001", name: "Proof Admins" }]
    });

    expect(plan.failedProvisionRequests[0]).toMatchObject({
      requestId: "request-001",
      plannedAction: "cleanup"
    });
    expect(plan.orphanGroups).toEqual([
      {
        sysId: "group-orphan-001",
        name: "Proof Admins",
        referencedByWorkspace: false,
        plannedAction: "cleanup"
      }
    ]);
    expect(plan.plannedActions.cleanupFailedRequestIds).toEqual(["request-001"]);
    expect(plan.plannedActions.cleanupOrphanGroupIds).toEqual(["group-orphan-001"]);
  });

  it("excludes groups referenced by an existing proof workspace from orphan cleanup", () => {
    const plan = buildProofRecoveryPlan({
      proofWorkspacePlans: [
        {
          workspace: {
            slug: "task-32-proof",
            name: "Task 32 Proof",
            sysId: "workspace-001"
          },
          record: {
            admin_group: "group-admin-001",
            editor_group: "group-editor-001"
          },
          plan: planProofWorkspaceRecovery(
            {
              slug: "task-32-proof",
              name: "Task 32 Proof"
            },
            {
              status: 200,
              payload: {
                result: {
                  state: "unlocked"
                }
              }
            }
          )
        }
      ],
      failedRequests: [],
      candidateGroupRecords: [
        { sys_id: "group-admin-001", name: "Proof Admins" },
        { sys_id: "group-orphan-001", name: "Proof Editors" }
      ]
    });

    expect(plan.orphanGroups).toEqual([
      {
        sysId: "group-admin-001",
        name: "Proof Admins",
        referencedByWorkspace: true,
        plannedAction: "retain"
      },
      {
        sysId: "group-orphan-001",
        name: "Proof Editors",
        referencedByWorkspace: false,
        plannedAction: "cleanup"
      }
    ]);
    expect(plan.plannedActions.cleanupOrphanGroupIds).toEqual(["group-orphan-001"]);
  });

  it("excludes failed-request cleanup when the request belongs to an existing proof workspace boundary", () => {
    const plan = buildProofRecoveryPlan({
      proofWorkspacePlans: [
        {
          workspace: {
            slug: "task-32-proof",
            name: "Task 32 Proof",
            sysId: "workspace-001"
          },
          record: {
            admin_group: "group-admin-001",
            editor_group: "group-editor-001"
          },
          plan: planProofWorkspaceRecovery(
            {
              slug: "task-32-proof",
              name: "Task 32 Proof"
            },
            {
              status: 200,
              payload: {
                result: {
                  state: "unlocked"
                }
              }
            }
          )
        }
      ],
      failedRequests: [
        {
          sys_id: "request-001",
          workspace_slug: "task-32-proof",
          state: "failed",
          admin_group_name: "Proof Admins",
          editor_group_name: "Proof Editors"
        }
      ],
      candidateGroupRecords: []
    });

    expect(plan.failedProvisionRequests).toEqual([
      expect.objectContaining({
        requestId: "request-001",
        workspaceSlug: "task-32-proof",
        referencedByWorkspace: true,
        plannedAction: "retain"
      })
    ]);
    expect(plan.plannedActions.cleanupFailedRequestIds).toEqual([]);
  });

  it("does not reveal lease tokens in cleanup authorization reasons", () => {
    const reason = authorizeProofCleanup({
      releaseResult: { status: 409, text: "leaseToken=secret-token-123" },
      statusResult: {
        status: 200,
        payload: {
          result: {
            state: "held"
          }
        }
      }
    }).reason;

    expect(reason).not.toContain("secret-token-123");
    expect(reason).not.toContain("leaseToken");
  });
});
