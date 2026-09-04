import type { WorkspaceIcon, WorkspaceRecord as ServerWorkspaceRecord } from "./serverWorkspaceDomain.ts";
import type { WorkspaceRoleLabel, WorkspaceViewRecord } from "../../client/shared/types/docsera.ts";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeServiceNowBoolean(value: unknown): boolean {
  const normalized = cleanText(value).toLowerCase();
  return normalized === "1" || normalized === "true";
}

function normalizeIcon(record: {
  getValue: (fieldName: string) => unknown;
}): WorkspaceIcon {
  return {
    type: cleanText(record.getValue("icon_type")) === "uploaded" ? "uploaded" : "builtin",
    key: cleanText(record.getValue("icon_key")),
    label: cleanText(record.getValue("icon_label")) || "Docsera workspace icon",
    assetPath: cleanText(record.getValue("icon_asset_path")) || undefined
  };
}

export function mapWorkspaceRecord(record: {
  getUniqueValue: () => string;
  getValue: (fieldName: string) => unknown;
  getDisplayValue: (fieldName: string) => unknown;
}): ServerWorkspaceRecord {
  const workspaceStateRevision = Number(record.getValue("workspace_state_revision"));
  return {
    sysId: cleanText(record.getUniqueValue()),
    name: cleanText(record.getValue("name")),
    slug: cleanText(record.getValue("workspace_slug")),
    shortDescription: cleanText(record.getValue("short_description")) || null,
    icon: normalizeIcon(record),
    status: cleanText(record.getValue("status")) === "inactive" ? "inactive" : "active",
    adminGroupSysId: cleanText(record.getValue("admin_group")),
    editorGroupSysId: cleanText(record.getValue("editor_group")),
    creatorUserSysId: cleanText(record.getValue("creator")),
    creatorUserName: cleanText(record.getDisplayValue("creator")) || null,
    createdOn: cleanText(record.getDisplayValue("sys_created_on")) || null,
    updatedOn: cleanText(record.getDisplayValue("sys_updated_on")) || null,
    updatedBy: cleanText(record.getDisplayValue("sys_updated_by")) || null,
    pendingChangeSetSysId: cleanText(record.getValue("pending_change_set")) || null,
    publishedSnapshotSetSysId: cleanText(record.getValue("published_snapshot_set")) || null,
    workspaceStateRevision: Number.isSafeInteger(workspaceStateRevision) && workspaceStateRevision >= 0 ? workspaceStateRevision : null,
    layout: {
      tocVisible: normalizeServiceNowBoolean(record.getValue("toc_default_visible")),
      pageWidth: cleanText(record.getValue("page_width")) === "full" ? "full" : "readable"
    }
  };
}

export function cleanWorkspaceSlug(value: unknown): string {
  return cleanText(value);
}

export function toWorkspaceViewRecord(workspace: ServerWorkspaceRecord, roleLabel: WorkspaceRoleLabel | null = null): WorkspaceViewRecord {
  return {
    sysId: cleanText(workspace.sysId),
    slug: cleanText(workspace.slug),
    name: cleanText(workspace.name),
    shortDescription: workspace.shortDescription,
    icon: workspace.icon,
    layout: {
      tocVisible: workspace.layout.tocVisible
    },
    status: workspace.status,
    roleLabel,
    canManageSettings: Boolean(roleLabel === "Admin")
  };
}
