import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createWorkspaceDeletionService, type WorkspaceDeletionDependencies } from "./serviceNowWorkspaceDeletion";
import type { WorkspaceRecord } from "./serverWorkspaceDomain";

function workspace(overrides: Partial<WorkspaceRecord> = {}): WorkspaceRecord {
  return {
    adminGroupSysId: "admin-group",
    creatorUserSysId: "creator",
    editorGroupSysId: "editor-group",
    icon: { assetPath: "/api/icon", key: "icon-key", label: "Icon", type: "uploaded" },
    layout: { pageWidth: "readable", tocVisible: true },
    name: "Product Docs",
    pendingChangeSetSysId: "change-set",
    publishedSnapshotSetSysId: "snapshot-set",
    shortDescription: null,
    slug: "product-docs",
    status: "active",
    sysId: "workspace-1",
    ...overrides
  };
}

function dependencies(input: {
  canAdmin?: boolean;
  cleanupVerified?: boolean;
  groupDeleted?: boolean;
  loadedWorkspace?: WorkspaceRecord | null;
} = {}) {
  const loadedWorkspace = input.loadedWorkspace === undefined ? workspace() : input.loadedWorkspace;
  const calls: Array<{ operation: string; value: string }> = [];
  const attachmentDeletes: string[] = [];
  let groupsDeleted = input.groupDeleted ?? false;
  const deps: WorkspaceDeletionDependencies = {
    createGroupDeletionCommand: vi.fn(() => {
      groupsDeleted = true;
      return "command-1";
    }),
    createGroupDeletionValidationCommand: vi.fn(() => "succeeded" as const),
    commitWorkspaceInactiveTombstone: vi.fn((current) => workspace({ ...current, status: "inactive" })),
    deleteAttachment: vi.fn((attachmentSysId) => attachmentDeletes.push(attachmentSysId)),
    deleteChangeEntriesByChangeSet: vi.fn((value) => calls.push({ operation: "deleteChangeEntriesByChangeSet", value })),
    deleteEditLocksByPage: vi.fn((value) => calls.push({ operation: "deleteEditLocksByPage", value })),
    deleteIconAssetsByWorkspace: vi.fn((value) => calls.push({ operation: "deleteIconAssetsByWorkspace", value })),
    deleteMemberMutationCommandsByWorkspace: vi.fn((value) => calls.push({ operation: "deleteMemberMutationCommandsByWorkspace", value })),
    deleteMutationClaimsByWorkspace: vi.fn((value) => calls.push({ operation: "deleteMutationClaimsByWorkspace", value })),
    deletePageSnapshotsBySnapshotSet: vi.fn((value) => calls.push({ operation: "deletePageSnapshotsBySnapshotSet", value })),
    deletePagesByWorkspace: vi.fn((value) => calls.push({ operation: "deletePagesByWorkspace", value })),
    deleteRemovalBatchesByChangeSet: vi.fn((value) => calls.push({ operation: "deleteRemovalBatchesByChangeSet", value })),
    deleteRemovalMembersByBatch: vi.fn((value) => calls.push({ operation: "deleteRemovalMembersByBatch", value })),
    deleteSnapshotSetsByWorkspace: vi.fn((value) => calls.push({ operation: "deleteSnapshotSetsByWorkspace", value })),
    deleteWorkspaceChangeSetsByWorkspace: vi.fn((value) => calls.push({ operation: "deleteWorkspaceChangeSetsByWorkspace", value })),
    deleteWorkspaceEditLeasesByWorkspace: vi.fn((value) => calls.push({ operation: "deleteWorkspaceEditLeasesByWorkspace", value })),
    evaluateWorkspaceCapabilities: vi.fn(() => ({ canAdminWorkspace: input.canAdmin ?? true })),
    listAttachments: vi.fn(() => ["workspace-media-1", "workspace-media-2"]),
    listChangeSetSysIds: vi.fn(() => ["change-set-1", "change-set-2"]),
    listIconAssetAttachments: vi.fn(() => ["icon-attachment-1"]),
    listPageSysIds: vi.fn(() => ["page-1", "page-2"]),
    listRemovalBatchSysIds: vi.fn(() => ["removal-batch-1", "removal-batch-2"]),
    listSnapshotSetSysIds: vi.fn(() => ["snapshot-set-1", "snapshot-set-2"]),
    loadWorkspaceBySlug: vi.fn(() => loadedWorkspace),
    loadWorkspaceBySysId: vi.fn(() => loadedWorkspace),
    markWorkspaceInactiveTombstone: vi.fn((current) => workspace({ ...current, adminGroupSysId: "", editorGroupSysId: "", icon: { key: "docsera-workspace", label: "Docsera workspace", type: "builtin" }, pendingChangeSetSysId: null, publishedSnapshotSetSysId: null, status: "inactive" })),
    verifyCleanupComplete: vi.fn(() => input.cleanupVerified ?? true),
    verifyGroupsDeleted: vi.fn((current) => groupsDeleted || (!current.adminGroupSysId && !current.editorGroupSysId))
  };
  return { attachmentDeletes, calls, deps };
}

function deletionSource() {
  return readFileSync(path.resolve(process.cwd(), "src/server/workspaces/serviceNowWorkspaceDeletion.ts"), "utf8");
}

function markWorkspaceInactiveTombstoneSource() {
  const text = deletionSource();
  const start = text.indexOf("function markWorkspaceInactiveTombstone");
  const end = text.indexOf("\nfunction commitWorkspaceInactiveTombstone", start);
  expect(start).toBeGreaterThanOrEqual(0);
  expect(end).toBeGreaterThan(start);
  return text.slice(start, end);
}

describe("workspace deletion service", () => {
  it("rejects callers without Workspace Admin authority before cleanup", async () => {
    const { deps } = dependencies({ canAdmin: false });
    const result = await createWorkspaceDeletionService(deps).deleteWorkspace({ workspaceSysId: "workspace-1" });

    expect(result).toMatchObject({ kind: "failed", status: 403 });
    expect(deps.createGroupDeletionCommand).not.toHaveBeenCalled();
    expect(deps.deletePagesByWorkspace).not.toHaveBeenCalled();
  });

  it("permits the inactive commit only after global validation succeeds", async () => {
    const { deps } = dependencies();
    const result = await createWorkspaceDeletionService(deps).deleteWorkspace({ workspaceSysId: "workspace-1" });

    expect(result).toMatchObject({ kind: "succeeded" });
    expect(deps.createGroupDeletionValidationCommand).toHaveBeenCalledWith(expect.objectContaining({ sysId: "workspace-1" }));
    expect(vi.mocked(deps.createGroupDeletionValidationCommand).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(deps.commitWorkspaceInactiveTombstone).mock.invocationCallOrder[0]);
  });

  it("performs no destructive writes and leaves the workspace active when preflight group validation fails", async () => {
    const { deps } = dependencies();
    vi.mocked(deps.createGroupDeletionValidationCommand).mockReturnValue("failed");

    const result = await createWorkspaceDeletionService(deps).deleteWorkspace({ workspaceSysId: "workspace-1" });

    expect(result).toMatchObject({ kind: "failed", status: 500 });
    expect(deps.commitWorkspaceInactiveTombstone).not.toHaveBeenCalled();
    expect(deps.createGroupDeletionCommand).not.toHaveBeenCalled();
    expect(deps.deletePagesByWorkspace).not.toHaveBeenCalled();
    expect(deps.deleteWorkspaceChangeSetsByWorkspace).not.toHaveBeenCalled();
  });

  it("treats unresolved preflight group validation state as a failure before the inactive commit", async () => {
    const { deps } = dependencies();
    vi.mocked(deps.createGroupDeletionValidationCommand).mockReturnValue("requested");

    const result = await createWorkspaceDeletionService(deps).deleteWorkspace({ workspaceSysId: "workspace-1" });

    expect(result).toMatchObject({ kind: "failed", status: 500 });
    expect(deps.commitWorkspaceInactiveTombstone).not.toHaveBeenCalled();
    expect(deps.createGroupDeletionCommand).not.toHaveBeenCalled();
    expect(deps.deletePagesByWorkspace).not.toHaveBeenCalled();
  });

  it("deletes workspace-owned resources through schema relationships and leaves an inactive slug tombstone", async () => {
    const { attachmentDeletes, calls, deps } = dependencies();
    const result = await createWorkspaceDeletionService(deps).deleteWorkspace({ workspaceSlug: "product-docs" });

    expect(result).toMatchObject({
      kind: "succeeded",
      workspace: {
        slug: "product-docs",
        status: "inactive"
      }
    });
    expect(deps.createGroupDeletionCommand).toHaveBeenCalledWith(expect.objectContaining({ sysId: "workspace-1" }));
    expect(vi.mocked(deps.commitWorkspaceInactiveTombstone).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(deps.deleteEditLocksByPage).mock.invocationCallOrder[0]);
    expect(vi.mocked(deps.verifyCleanupComplete).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(deps.createGroupDeletionCommand).mock.invocationCallOrder[0]);
    expect(deps.listRemovalBatchSysIds).toHaveBeenCalledWith(["change-set-1", "change-set-2"]);
    expect(attachmentDeletes).toEqual(["workspace-media-1", "workspace-media-2", "icon-attachment-1"]);
    expect(calls).toEqual([
      { operation: "deleteEditLocksByPage", value: "page-1" },
      { operation: "deleteEditLocksByPage", value: "page-2" },
      { operation: "deleteMemberMutationCommandsByWorkspace", value: "workspace-1" },
      { operation: "deleteMutationClaimsByWorkspace", value: "workspace-1" },
      { operation: "deleteChangeEntriesByChangeSet", value: "change-set-1" },
      { operation: "deleteChangeEntriesByChangeSet", value: "change-set-2" },
      { operation: "deleteRemovalMembersByBatch", value: "removal-batch-1" },
      { operation: "deleteRemovalMembersByBatch", value: "removal-batch-2" },
      { operation: "deleteRemovalBatchesByChangeSet", value: "change-set-1" },
      { operation: "deleteRemovalBatchesByChangeSet", value: "change-set-2" },
      { operation: "deletePageSnapshotsBySnapshotSet", value: "snapshot-set-1" },
      { operation: "deletePageSnapshotsBySnapshotSet", value: "snapshot-set-2" },
      { operation: "deleteSnapshotSetsByWorkspace", value: "workspace-1" },
      { operation: "deleteWorkspaceChangeSetsByWorkspace", value: "workspace-1" },
      { operation: "deleteWorkspaceEditLeasesByWorkspace", value: "workspace-1" },
      { operation: "deleteIconAssetsByWorkspace", value: "workspace-1" },
      { operation: "deletePagesByWorkspace", value: "workspace-1" },
      { operation: "deleteMemberMutationCommandsByWorkspace", value: "workspace-1" }
    ]);
    expect(deps.verifyCleanupComplete).toHaveBeenCalledWith({
      changeSetSysIds: ["change-set-1", "change-set-2"],
      iconAttachmentSysIds: ["icon-attachment-1"],
      pageSysIds: ["page-1", "page-2"],
      removalBatchSysIds: ["removal-batch-1", "removal-batch-2"],
      snapshotSetSysIds: ["snapshot-set-1", "snapshot-set-2"],
      workspaceAttachmentSysIds: ["workspace-media-1", "workspace-media-2"],
      workspaceSysId: "workspace-1"
    });
    expect(deps.markWorkspaceInactiveTombstone).toHaveBeenCalledWith(expect.objectContaining({ slug: "product-docs", status: "inactive" }));
  });

  it("keeps the workspace inactive when cleanup verification does not prove the end state", async () => {
    const { deps } = dependencies({ cleanupVerified: false });
    const result = await createWorkspaceDeletionService(deps).deleteWorkspace({ workspaceSysId: "workspace-1" });

    expect(result).toMatchObject({ deletionCommitted: true, kind: "failed", status: 500 });
    expect(deps.commitWorkspaceInactiveTombstone).toHaveBeenCalled();
    expect(deps.createGroupDeletionCommand).not.toHaveBeenCalled();
    expect(deps.markWorkspaceInactiveTombstone).not.toHaveBeenCalled();
  });

  it("keeps the workspace inactive when cleanup fails after the commit boundary", async () => {
    const { deps } = dependencies();
    vi.mocked(deps.deletePagesByWorkspace).mockImplementation(() => {
      throw new Error("page cleanup failed");
    });
    vi.mocked(deps.loadWorkspaceBySysId).mockReturnValue(workspace({ status: "inactive" }));

    const result = await createWorkspaceDeletionService(deps).deleteWorkspace({ workspaceSysId: "workspace-1" });

    expect(result).toMatchObject({ deletionCommitted: true, kind: "failed", status: 500 });
    expect(deps.commitWorkspaceInactiveTombstone).toHaveBeenCalled();
    expect(deps.markWorkspaceInactiveTombstone).not.toHaveBeenCalled();
  });

  it("retries cleanup idempotently against an already-inactive tombstone without requiring group deletion", async () => {
    const inactiveWorkspace = workspace({
      adminGroupSysId: "",
      editorGroupSysId: "",
      icon: { key: "docsera-workspace", label: "Docsera workspace", type: "builtin" },
      pendingChangeSetSysId: null,
      publishedSnapshotSetSysId: null,
      status: "inactive"
    });
    const { deps } = dependencies({ loadedWorkspace: inactiveWorkspace });

    const result = await createWorkspaceDeletionService(deps).deleteWorkspace({ workspaceSysId: "workspace-1" });

    expect(result).toMatchObject({ kind: "succeeded", workspace: { status: "inactive", slug: "product-docs" } });
    expect(deps.createGroupDeletionValidationCommand).not.toHaveBeenCalled();
    expect(deps.createGroupDeletionCommand).not.toHaveBeenCalled();
    expect(deps.deletePagesByWorkspace).toHaveBeenCalledWith("workspace-1");
    expect(deps.markWorkspaceInactiveTombstone).toHaveBeenCalledWith(expect.objectContaining({ status: "inactive" }));
  });

  it("successful cleanup finalizes the inactive tombstone fields", async () => {
    const { deps } = dependencies();

    const result = await createWorkspaceDeletionService(deps).deleteWorkspace({ workspaceSysId: "workspace-1" });

    expect(result).toMatchObject({
      kind: "succeeded",
      workspace: {
        adminGroupSysId: "",
        editorGroupSysId: "",
        icon: { key: "docsera-workspace", label: "Docsera workspace", type: "builtin" },
        pendingChangeSetSysId: null,
        publishedSnapshotSetSysId: null,
        slug: "product-docs",
        status: "inactive"
      }
    });
  });

  it("persists the final tombstone by null-clearing deleted references and nullable fields", () => {
    const tombstone = markWorkspaceInactiveTombstoneSource();

    for (const field of ["admin_group", "editor_group", "pending_change_set", "published_snapshot_set", "icon_asset_path"]) {
      expect(tombstone).toContain(`record.setValue("${field}", null);`);
      expect(tombstone).not.toContain(`record.setValue("${field}", "");`);
    }
  });
});
