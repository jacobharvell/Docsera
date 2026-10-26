import { GlideRecord, GlideSysAttachment, gs } from "@servicenow/glide";
import { DOCSERA_WORKSPACE_TABLE, type WorkspaceRecord } from "./serverWorkspaceDomain.ts";
import { evaluateCurrentUserWorkspaceCapabilities } from "./serviceNowWorkspaceCapabilities.ts";
import { mapWorkspaceRecord } from "./serviceNowWorkspaceRecords.ts";

const DOCSERA_PAGE_TABLE = "x_82900_docsera_page";
const DOCSERA_WORKSPACE_CHANGE_SET_TABLE = "x_82900_docsera_workspace_change_set";
const DOCSERA_WORKSPACE_CHANGE_ENTRY_TABLE = "x_82900_docsera_workspace_change_entry";
const DOCSERA_WORKSPACE_EDIT_LEASE_TABLE = "x_82900_docsera_workspace_edit_lease";
const DOCSERA_WORKSPACE_ICON_ASSET_TABLE = "x_82900_docsera_workspace_icon_asset";
const DOCSERA_WORKSPACE_MEMBER_MUTATION_COMMAND_TABLE = "x_82900_docsera_workspace_member_mutation_command";
const DOCSERA_WORKSPACE_MUTATION_CLAIM_TABLE = "x_82900_docsera_workspace_mutation_claim";
const DOCSERA_WORKSPACE_PAGE_SNAPSHOT_TABLE = "x_82900_docsera_workspace_page_snapshot";
const DOCSERA_WORKSPACE_REMOVAL_BATCH_TABLE = "x_82900_docsera_workspace_removal_batch";
const DOCSERA_WORKSPACE_REMOVAL_MEMBER_TABLE = "x_82900_docsera_workspace_removal_member";
const DOCSERA_WORKSPACE_SNAPSHOT_SET_TABLE = "x_82900_docsera_workspace_snapshot_set";

type WorkspaceDeletionStatus = 400 | 403 | 404 | 500;
type WorkspaceGroupCommandState = "failed" | "requested" | "succeeded" | "unavailable";

export type WorkspaceDeletionOutcome =
  | { deletionCommitted?: boolean; kind: "failed"; errorMessage: string; status: WorkspaceDeletionStatus }
  | { kind: "succeeded"; workspace: WorkspaceRecord };

export type WorkspaceDeletionDependencies = {
  createGroupDeletionCommand: (workspace: WorkspaceRecord) => string | null;
  createGroupDeletionValidationCommand: (workspace: WorkspaceRecord) => WorkspaceGroupCommandState;
  commitWorkspaceInactiveTombstone: (workspace: WorkspaceRecord) => WorkspaceRecord | null;
  deleteAttachment: (attachmentSysId: string) => void;
  deleteChangeEntriesByChangeSet: (changeSetSysId: string) => void;
  deleteIconAssetsByWorkspace: (workspaceSysId: string) => void;
  deleteMemberMutationCommandsByWorkspace: (workspaceSysId: string) => void;
  deleteMutationClaimsByWorkspace: (workspaceSysId: string) => void;
  deletePageSnapshotsBySnapshotSet: (snapshotSetSysId: string) => void;
  deletePagesByWorkspace: (workspaceSysId: string) => void;
  deleteRemovalBatchesByChangeSet: (changeSetSysId: string) => void;
  deleteRemovalMembersByBatch: (removalBatchSysId: string) => void;
  deleteSnapshotSetsByWorkspace: (workspaceSysId: string) => void;
  deleteWorkspaceChangeSetsByWorkspace: (workspaceSysId: string) => void;
  deleteWorkspaceEditLeasesByWorkspace: (workspaceSysId: string) => void;
  evaluateWorkspaceCapabilities: (workspace: WorkspaceRecord) => { canAdminWorkspace: boolean };
  listAttachments: (tableName: string, tableSysId: string) => string[];
  listChangeSetSysIds: (workspaceSysId: string) => string[];
  listIconAssetAttachments: (workspaceSysId: string) => string[];
  listPageSysIds: (workspaceSysId: string) => string[];
  listRemovalBatchSysIds: (changeSetSysIds: string[]) => string[];
  listSnapshotSetSysIds: (workspaceSysId: string) => string[];
  loadWorkspaceBySlug: (workspaceSlug: string) => WorkspaceRecord | null;
  loadWorkspaceBySysId: (workspaceSysId: string) => WorkspaceRecord | null;
  markWorkspaceInactiveTombstone: (workspace: WorkspaceRecord) => WorkspaceRecord | null;
  verifyCleanupComplete: (input: WorkspaceCleanupVerificationInput) => boolean;
  verifyGroupsDeleted: (workspace: WorkspaceRecord) => boolean;
};

type WorkspaceCleanupVerificationInput = {
  changeSetSysIds: string[];
  iconAttachmentSysIds: string[];
  pageSysIds: string[];
  removalBatchSysIds: string[];
  snapshotSetSysIds: string[];
  workspaceAttachmentSysIds: string[];
  workspaceSysId: string;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function loadWorkspaceBySysId(workspaceSysId: string): WorkspaceRecord | null {
  const sysId = cleanText(workspaceSysId);
  if (!sysId) return null;
  const record = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
  return record.get("sys_id", sysId) ? mapWorkspaceRecord(record) : null;
}

function loadWorkspaceBySlug(workspaceSlug: string): WorkspaceRecord | null {
  const slug = cleanText(workspaceSlug);
  if (!slug) return null;
  const record = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
  record.addQuery("workspace_slug", slug);
  record.setLimit(1);
  record.query();
  return record.next() ? mapWorkspaceRecord(record) : null;
}

function deleteRowsByConfiguredQuery(tableName: string, configureQuery: (rows: GlideRecord) => boolean): void {
  const rows = new GlideRecord(tableName);
  if (!configureQuery(rows)) return;
  rows.deleteMultiple();
}

function addRequiredQuery(rows: GlideRecord, fieldName: string, value: string): boolean {
  const cleanValue = cleanText(value);
  if (!cleanValue) return false;
  rows.addQuery(fieldName, cleanValue);
  return true;
}

function countRecordsByField(tableName: string, fieldName: string, value: string): number {
  const cleanValue = cleanText(value);
  if (!cleanValue) return 0;
  const rows = new GlideRecord(tableName);
  rows.addQuery(fieldName, cleanValue);
  rows.query();
  let count = 0;
  while (rows.next()) count += 1;
  return count;
}

function recordExists(tableName: string, sysId: string): boolean {
  const cleanSysId = cleanText(sysId);
  if (!cleanSysId) return false;
  const row = new GlideRecord(tableName);
  return row.get("sys_id", cleanSysId);
}

function listAttachments(tableName: string, tableSysId: string): string[] {
  const rows = new GlideRecord("sys_attachment");
  rows.addQuery("table_name", tableName);
  rows.addQuery("table_sys_id", cleanText(tableSysId));
  rows.query();
  const attachmentSysIds: string[] = [];
  while (rows.next()) {
    const sysId = cleanText(rows.getUniqueValue());
    if (sysId) attachmentSysIds.push(sysId);
  }
  return attachmentSysIds;
}

function listIconAssetAttachments(workspaceSysId: string): string[] {
  const assets = new GlideRecord(DOCSERA_WORKSPACE_ICON_ASSET_TABLE);
  assets.addQuery("workspace", cleanText(workspaceSysId));
  assets.query();
  const attachmentSysIds: string[] = [];
  while (assets.next()) {
    const attachmentSysId = cleanText(assets.getValue("attachment"));
    if (attachmentSysId) attachmentSysIds.push(attachmentSysId);
  }
  return attachmentSysIds;
}

function listPageSysIds(workspaceSysId: string): string[] {
  const pages = new GlideRecord(DOCSERA_PAGE_TABLE);
  pages.addQuery("workspace", cleanText(workspaceSysId));
  pages.query();
  const pageSysIds: string[] = [];
  while (pages.next()) {
    const pageSysId = cleanText(pages.getUniqueValue());
    if (pageSysId) pageSysIds.push(pageSysId);
  }
  return pageSysIds;
}

function listSysIdsByField(tableName: string, fieldName: string, value: string): string[] {
  const cleanValue = cleanText(value);
  if (!cleanValue) return [];
  const rows = new GlideRecord(tableName);
  rows.addQuery(fieldName, cleanValue);
  rows.query();
  const sysIds: string[] = [];
  while (rows.next()) {
    const sysId = cleanText(rows.getUniqueValue());
    if (sysId) sysIds.push(sysId);
  }
  return sysIds;
}

function listChangeSetSysIds(workspaceSysId: string): string[] {
  return listSysIdsByField(DOCSERA_WORKSPACE_CHANGE_SET_TABLE, "workspace", workspaceSysId);
}

function listSnapshotSetSysIds(workspaceSysId: string): string[] {
  return listSysIdsByField(DOCSERA_WORKSPACE_SNAPSHOT_SET_TABLE, "workspace", workspaceSysId);
}

function listRemovalBatchSysIds(changeSetSysIds: string[]): string[] {
  const removalBatchSysIds: string[] = [];
  for (const changeSetSysId of changeSetSysIds) {
    removalBatchSysIds.push(...listSysIdsByField(DOCSERA_WORKSPACE_REMOVAL_BATCH_TABLE, "change_set", changeSetSysId));
  }
  return removalBatchSysIds;
}

function markWorkspaceInactiveTombstone(workspace: WorkspaceRecord): WorkspaceRecord | null {
  const workspaceSysId = cleanText(workspace.sysId);
  if (!workspaceSysId) return null;
  const record = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
  if (!record.get("sys_id", workspaceSysId)) return null;
  record.setValue("status", "inactive");
  record.setValue("admin_group", null);
  record.setValue("editor_group", null);
  record.setValue("pending_change_set", null);
  record.setValue("published_snapshot_set", null);
  record.setValue("icon_type", "builtin");
  record.setValue("icon_key", "docsera-workspace");
  record.setValue("icon_label", "Docsera workspace");
  record.setValue("icon_asset_path", null);
  if (!cleanText(record.update())) return null;
  const refreshed = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
  return refreshed.get("sys_id", workspaceSysId) ? mapWorkspaceRecord(refreshed) : null;
}

function commitWorkspaceInactiveTombstone(workspace: WorkspaceRecord): WorkspaceRecord | null {
  const workspaceSysId = cleanText(workspace.sysId);
  if (!workspaceSysId) return null;
  const record = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
  if (!record.get("sys_id", workspaceSysId)) return null;
  record.setValue("status", "inactive");
  if (!cleanText(record.update())) return null;
  const refreshed = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
  return refreshed.get("sys_id", workspaceSysId) ? mapWorkspaceRecord(refreshed) : null;
}

function createWorkspaceGroupCommand(workspace: WorkspaceRecord, mutationKind: "delete_workspace_groups" | "validate_workspace_group_deletion"): string | null {
  const workspaceSysId = cleanText(workspace.sysId);
  const userSysId = cleanText(gs.getUserID());
  if (!workspaceSysId || !userSysId) return null;
  const command = new GlideRecord(DOCSERA_WORKSPACE_MEMBER_MUTATION_COMMAND_TABLE);
  command.initialize();
  command.setValue("workspace", workspaceSysId);
  command.setValue("target_user", userSysId);
  command.setValue("mutation_kind", mutationKind);
  command.setValue("access_level", "");
  command.setValue("requested_by", userSysId);
  command.setValue("state", "requested");
  return cleanText(command.insert()) || null;
}

function readWorkspaceGroupCommandState(commandSysId: string): WorkspaceGroupCommandState {
  const sysId = cleanText(commandSysId);
  if (!sysId) return "unavailable";
  const command = new GlideRecord(DOCSERA_WORKSPACE_MEMBER_MUTATION_COMMAND_TABLE);
  if (!command.get("sys_id", sysId)) return "unavailable";
  const state = cleanText(command.getValue("state"));
  return state === "succeeded" || state === "failed" || state === "requested" ? state : "unavailable";
}

function createGroupDeletionCommand(workspace: WorkspaceRecord): string | null {
  return createWorkspaceGroupCommand(workspace, "delete_workspace_groups");
}

function createGroupDeletionValidationCommand(workspace: WorkspaceRecord): WorkspaceGroupCommandState {
  const commandSysId = createWorkspaceGroupCommand(workspace, "validate_workspace_group_deletion");
  return readWorkspaceGroupCommandState(commandSysId ?? "");
}

function groupExists(groupSysId: string): boolean {
  const sysId = cleanText(groupSysId);
  if (!sysId) return false;
  const group = new GlideRecord("sys_user_group");
  return group.get("sys_id", sysId);
}

function verifyGroupsDeleted(workspace: WorkspaceRecord): boolean {
  return !groupExists(workspace.adminGroupSysId) && !groupExists(workspace.editorGroupSysId);
}

function verifyCleanupComplete(input: WorkspaceCleanupVerificationInput): boolean {
  if (countRecordsByField(DOCSERA_WORKSPACE_MUTATION_CLAIM_TABLE, "workspace", input.workspaceSysId) > 0) return false;
  if (countRecordsByField(DOCSERA_WORKSPACE_EDIT_LEASE_TABLE, "workspace", input.workspaceSysId) > 0) return false;
  if (countRecordsByField(DOCSERA_WORKSPACE_ICON_ASSET_TABLE, "workspace", input.workspaceSysId) > 0) return false;
  if (countRecordsByField(DOCSERA_WORKSPACE_MEMBER_MUTATION_COMMAND_TABLE, "workspace", input.workspaceSysId) > 0) return false;
  if (countRecordsByField(DOCSERA_PAGE_TABLE, "workspace", input.workspaceSysId) > 0) return false;
  if (countRecordsByField(DOCSERA_WORKSPACE_CHANGE_SET_TABLE, "workspace", input.workspaceSysId) > 0) return false;
  if (countRecordsByField(DOCSERA_WORKSPACE_SNAPSHOT_SET_TABLE, "workspace", input.workspaceSysId) > 0) return false;
  for (const changeSetSysId of input.changeSetSysIds) {
    if (countRecordsByField(DOCSERA_WORKSPACE_CHANGE_ENTRY_TABLE, "change_set", changeSetSysId) > 0) return false;
    if (countRecordsByField(DOCSERA_WORKSPACE_REMOVAL_BATCH_TABLE, "change_set", changeSetSysId) > 0) return false;
  }
  for (const removalBatchSysId of input.removalBatchSysIds) {
    if (countRecordsByField(DOCSERA_WORKSPACE_REMOVAL_MEMBER_TABLE, "removal_batch", removalBatchSysId) > 0) return false;
  }
  for (const snapshotSetSysId of input.snapshotSetSysIds) {
    if (countRecordsByField(DOCSERA_WORKSPACE_PAGE_SNAPSHOT_TABLE, "snapshot_set", snapshotSetSysId) > 0) return false;
  }
  for (const attachmentSysId of [...input.workspaceAttachmentSysIds, ...input.iconAttachmentSysIds]) {
    if (recordExists("sys_attachment", attachmentSysId)) return false;
  }
  return true;
}

function createDefaultDependencies(): WorkspaceDeletionDependencies {
  return {
    createGroupDeletionCommand,
    createGroupDeletionValidationCommand,
    commitWorkspaceInactiveTombstone,
    deleteAttachment: (attachmentSysId) => new GlideSysAttachment().deleteAttachment(cleanText(attachmentSysId)),
    deleteChangeEntriesByChangeSet: (changeSetSysId) => deleteRowsByConfiguredQuery(DOCSERA_WORKSPACE_CHANGE_ENTRY_TABLE, (rows) => addRequiredQuery(rows, "change_set", changeSetSysId)),
    deleteIconAssetsByWorkspace: (workspaceSysId) => deleteRowsByConfiguredQuery(DOCSERA_WORKSPACE_ICON_ASSET_TABLE, (rows) => addRequiredQuery(rows, "workspace", workspaceSysId)),
    deleteMemberMutationCommandsByWorkspace: (workspaceSysId) => deleteRowsByConfiguredQuery(DOCSERA_WORKSPACE_MEMBER_MUTATION_COMMAND_TABLE, (rows) => addRequiredQuery(rows, "workspace", workspaceSysId)),
    deleteMutationClaimsByWorkspace: (workspaceSysId) => deleteRowsByConfiguredQuery(DOCSERA_WORKSPACE_MUTATION_CLAIM_TABLE, (rows) => addRequiredQuery(rows, "workspace", workspaceSysId)),
    deletePageSnapshotsBySnapshotSet: (snapshotSetSysId) => deleteRowsByConfiguredQuery(DOCSERA_WORKSPACE_PAGE_SNAPSHOT_TABLE, (rows) => addRequiredQuery(rows, "snapshot_set", snapshotSetSysId)),
    deletePagesByWorkspace: (workspaceSysId) => deleteRowsByConfiguredQuery(DOCSERA_PAGE_TABLE, (rows) => addRequiredQuery(rows, "workspace", workspaceSysId)),
    deleteRemovalBatchesByChangeSet: (changeSetSysId) => deleteRowsByConfiguredQuery(DOCSERA_WORKSPACE_REMOVAL_BATCH_TABLE, (rows) => addRequiredQuery(rows, "change_set", changeSetSysId)),
    deleteRemovalMembersByBatch: (removalBatchSysId) => deleteRowsByConfiguredQuery(DOCSERA_WORKSPACE_REMOVAL_MEMBER_TABLE, (rows) => addRequiredQuery(rows, "removal_batch", removalBatchSysId)),
    deleteSnapshotSetsByWorkspace: (workspaceSysId) => deleteRowsByConfiguredQuery(DOCSERA_WORKSPACE_SNAPSHOT_SET_TABLE, (rows) => addRequiredQuery(rows, "workspace", workspaceSysId)),
    deleteWorkspaceChangeSetsByWorkspace: (workspaceSysId) => deleteRowsByConfiguredQuery(DOCSERA_WORKSPACE_CHANGE_SET_TABLE, (rows) => addRequiredQuery(rows, "workspace", workspaceSysId)),
    deleteWorkspaceEditLeasesByWorkspace: (workspaceSysId) => deleteRowsByConfiguredQuery(DOCSERA_WORKSPACE_EDIT_LEASE_TABLE, (rows) => addRequiredQuery(rows, "workspace", workspaceSysId)),
    evaluateWorkspaceCapabilities: evaluateCurrentUserWorkspaceCapabilities,
    listAttachments,
    listChangeSetSysIds,
    listIconAssetAttachments,
    listPageSysIds,
    listRemovalBatchSysIds,
    listSnapshotSetSysIds,
    loadWorkspaceBySlug,
    loadWorkspaceBySysId,
    markWorkspaceInactiveTombstone,
    verifyCleanupComplete,
    verifyGroupsDeleted
  };
}

function resolveWorkspace(dependencies: WorkspaceDeletionDependencies, input: { workspaceSlug?: string | null; workspaceSysId?: string | null }): WorkspaceRecord | null {
  const workspaceSysId = cleanText(input.workspaceSysId);
  if (workspaceSysId) return dependencies.loadWorkspaceBySysId(workspaceSysId);
  const workspaceSlug = cleanText(input.workspaceSlug);
  return workspaceSlug ? dependencies.loadWorkspaceBySlug(workspaceSlug) : null;
}

export function createWorkspaceDeletionService(dependencies: WorkspaceDeletionDependencies) {
  return {
    async deleteWorkspace(input: { workspaceSlug?: string | null; workspaceSysId?: string | null }): Promise<WorkspaceDeletionOutcome> {
      const workspace = resolveWorkspace(dependencies, input);
      if (!workspace || !cleanText(workspace.sysId)) {
        return { kind: "failed", errorMessage: "Workspace could not be found.", status: 404 };
      }
      if (!dependencies.evaluateWorkspaceCapabilities(workspace).canAdminWorkspace) {
        return { kind: "failed", errorMessage: "You do not have permission to delete this workspace.", status: 403 };
      }

      const workspaceSysId = cleanText(workspace.sysId);
      const deletingActiveWorkspace = workspace.status !== "inactive";
      const hasGroupReferences = Boolean(cleanText(workspace.adminGroupSysId) || cleanText(workspace.editorGroupSysId));
      try {
        const pageSysIds = dependencies.listPageSysIds(workspaceSysId);
        const changeSetSysIds = dependencies.listChangeSetSysIds(workspaceSysId);
        const snapshotSetSysIds = dependencies.listSnapshotSetSysIds(workspaceSysId);
        const removalBatchSysIds = dependencies.listRemovalBatchSysIds(changeSetSysIds);
        const workspaceAttachmentSysIds = dependencies.listAttachments(DOCSERA_WORKSPACE_TABLE, workspaceSysId);
        const iconAttachmentSysIds = dependencies.listIconAssetAttachments(workspaceSysId);

        if (deletingActiveWorkspace && dependencies.createGroupDeletionValidationCommand(workspace) !== "succeeded") {
          return { kind: "failed", errorMessage: "Workspace access groups could not be deleted. The workspace was not deleted.", status: 500 };
        }

        const committedWorkspace = dependencies.commitWorkspaceInactiveTombstone(workspace);
        if (!committedWorkspace || committedWorkspace.status !== "inactive" || cleanText(committedWorkspace.slug) !== cleanText(workspace.slug)) {
          return { kind: "failed", errorMessage: "Workspace deletion could not be started. The workspace was not deleted.", status: 500 };
        }

        for (const attachmentSysId of workspaceAttachmentSysIds) {
          dependencies.deleteAttachment(attachmentSysId);
        }
        for (const attachmentSysId of iconAttachmentSysIds) {
          dependencies.deleteAttachment(attachmentSysId);
        }

        dependencies.deleteMemberMutationCommandsByWorkspace(workspaceSysId);
        dependencies.deleteMutationClaimsByWorkspace(workspaceSysId);
        for (const changeSetSysId of changeSetSysIds) {
          dependencies.deleteChangeEntriesByChangeSet(changeSetSysId);
        }
        for (const removalBatchSysId of removalBatchSysIds) {
          dependencies.deleteRemovalMembersByBatch(removalBatchSysId);
        }
        for (const changeSetSysId of changeSetSysIds) {
          dependencies.deleteRemovalBatchesByChangeSet(changeSetSysId);
        }
        for (const snapshotSetSysId of snapshotSetSysIds) {
          dependencies.deletePageSnapshotsBySnapshotSet(snapshotSetSysId);
        }
        dependencies.deleteSnapshotSetsByWorkspace(workspaceSysId);
        dependencies.deleteWorkspaceChangeSetsByWorkspace(workspaceSysId);
        dependencies.deleteWorkspaceEditLeasesByWorkspace(workspaceSysId);
        dependencies.deleteIconAssetsByWorkspace(workspaceSysId);
        dependencies.deletePagesByWorkspace(workspaceSysId);

        if (!dependencies.verifyCleanupComplete({
          changeSetSysIds,
          iconAttachmentSysIds,
          pageSysIds,
          removalBatchSysIds,
          snapshotSetSysIds,
          workspaceAttachmentSysIds,
          workspaceSysId
        })) {
          return { deletionCommitted: true, kind: "failed", errorMessage: "Workspace deletion started, but cleanup could not be completed. Please retry deletion cleanup.", status: 500 };
        }

        if (hasGroupReferences) {
          if (!dependencies.createGroupDeletionCommand(committedWorkspace) || !dependencies.verifyGroupsDeleted(workspace)) {
            return { deletionCommitted: true, kind: "failed", errorMessage: "Workspace deletion started, but cleanup could not be completed. Please retry deletion cleanup.", status: 500 };
          }
          dependencies.deleteMemberMutationCommandsByWorkspace(workspaceSysId);
          if (!dependencies.verifyGroupsDeleted(workspace) || !dependencies.verifyCleanupComplete({
            changeSetSysIds,
            iconAttachmentSysIds,
            pageSysIds,
            removalBatchSysIds,
            snapshotSetSysIds,
            workspaceAttachmentSysIds,
            workspaceSysId
          })) {
            return { deletionCommitted: true, kind: "failed", errorMessage: "Workspace deletion started, but cleanup could not be completed. Please retry deletion cleanup.", status: 500 };
          }
        }

        const tombstone = dependencies.markWorkspaceInactiveTombstone(committedWorkspace);
        if (!tombstone || tombstone.status !== "inactive" || cleanText(tombstone.slug) !== cleanText(workspace.slug)) {
          return { deletionCommitted: true, kind: "failed", errorMessage: "Workspace deletion started, but cleanup could not be finalized. Please retry deletion cleanup.", status: 500 };
        }

        return { kind: "succeeded", workspace: tombstone };
      } catch (error) {
        gs?.error?.(`[Docsera workspace deletion] ${cleanText(error instanceof Error ? error.message : error) || "Unknown workspace deletion failure."}`);
        return { deletionCommitted: dependencies.loadWorkspaceBySysId(workspaceSysId)?.status === "inactive", kind: "failed", errorMessage: "Something went wrong while deleting the workspace. Please try again.", status: 500 };
      }
    }
  };
}

export function createServiceNowWorkspaceDeletionService() {
  return createWorkspaceDeletionService(createDefaultDependencies());
}
