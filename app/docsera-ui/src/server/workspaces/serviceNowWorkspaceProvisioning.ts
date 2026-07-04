import { GlideDateTime, GlideRecord, gs } from "@servicenow/glide";
import {
  DOCSERA_WORKSPACE_TABLE,
  type WorkspaceDraftInput,
  type WorkspaceGroup,
  type WorkspaceRecord,
  WORKSPACE_ROLE_NAMES,
  provisionWorkspace
} from "../../shared/workspaces/domain";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function getRoleSysId(roleName: string): string {
  const role = new GlideRecord("sys_user_role");
  role.addQuery("name", roleName);
  role.setLimit(1);
  role.query();

  if (!role.next()) {
    throw new Error(`Required Docsera role is missing: ${roleName}`);
  }

  return cleanText(role.getUniqueValue());
}

function createGroup(input: { name: string; description: string }): WorkspaceGroup {
  const existing = new GlideRecord("sys_user_group");
  existing.addQuery("name", input.name);
  existing.setLimit(1);
  existing.query();

  if (existing.next()) {
    throw new Error(`A ServiceNow group named ${input.name} already exists.`);
  }

  const group = new GlideRecord("sys_user_group");
  group.initialize();
  group.setValue("name", input.name);
  group.setValue("description", input.description);
  const sysId = cleanText(group.insert());

  if (!sysId) {
    throw new Error(`Failed to create ServiceNow group ${input.name}.`);
  }

  return {
    sysId,
    name: input.name,
    description: input.description
  };
}

function assignRoleToGroup(groupSysId: string, roleName: string): void {
  const roleSysId = getRoleSysId(roleName);
  const membership = new GlideRecord("sys_group_has_role");
  membership.addQuery("group", groupSysId);
  membership.addQuery("role", roleSysId);
  membership.setLimit(1);
  membership.query();

  if (membership.next()) {
    return;
  }

  membership.initialize();
  membership.setValue("group", groupSysId);
  membership.setValue("role", roleSysId);
  const sysId = cleanText(membership.insert());

  if (!sysId) {
    throw new Error(`Failed to assign role ${roleName} to group ${groupSysId}.`);
  }
}

function addUserToGroup(groupSysId: string, userSysId: string): void {
  const membership = new GlideRecord("sys_user_grmember");
  membership.addQuery("group", groupSysId);
  membership.addQuery("user", userSysId);
  membership.setLimit(1);
  membership.query();

  if (membership.next()) {
    return;
  }

  membership.initialize();
  membership.setValue("group", groupSysId);
  membership.setValue("user", userSysId);
  const sysId = cleanText(membership.insert());

  if (!sysId) {
    throw new Error(`Failed to add user ${userSysId} to group ${groupSysId}.`);
  }
}

function deleteGroup(groupSysId: string): void {
  const group = new GlideRecord("sys_user_group");
  if (group.get(groupSysId)) {
    group.deleteRecord();
  }
}

function mapWorkspaceRecord(record: GlideRecord): WorkspaceRecord {
  return {
    sysId: cleanText(record.getUniqueValue()),
    name: cleanText(record.getValue("name")),
    slug: cleanText(record.getValue("workspace_slug")),
    shortDescription: cleanText(record.getValue("short_description")) || null,
    icon: {
      type: cleanText(record.getValue("icon_type")) === "uploaded" ? "uploaded" : "builtin",
      key: cleanText(record.getValue("icon_key")),
      label: cleanText(record.getValue("icon_label")) || "Docsera workspace icon",
      assetPath: cleanText(record.getValue("icon_asset_path")) || undefined
    },
    status: cleanText(record.getValue("status")) === "inactive" ? "inactive" : "active",
    adminGroupSysId: cleanText(record.getValue("admin_group")),
    editorGroupSysId: cleanText(record.getValue("editor_group")),
    creatorUserSysId: cleanText(record.getValue("creator")),
    creatorUserName: cleanText(record.getDisplayValue("creator")) || null,
    createdOn: cleanText(record.getDisplayValue("sys_created_on")) || null,
    updatedOn: cleanText(record.getDisplayValue("sys_updated_on")) || null,
    updatedBy: cleanText(record.getDisplayValue("sys_updated_by")) || null,
    layout: {
      tocVisibleByDefault: normalizeBoolean(record.getValue("toc_default_visible")),
      pageWidth: cleanText(record.getValue("page_width")) === "full" ? "full" : "readable"
    }
  };
}

function saveWorkspace(workspace: WorkspaceRecord): WorkspaceRecord {
  const record = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
  record.initialize();
  record.setValue("name", workspace.name);
  record.setValue("workspace_slug", workspace.slug);
  record.setValue("short_description", workspace.shortDescription ?? "");
  record.setValue("icon_type", workspace.icon.type);
  record.setValue("icon_key", workspace.icon.key);
  record.setValue("icon_label", workspace.icon.label);
  record.setValue("icon_asset_path", workspace.icon.assetPath ?? "");
  record.setValue("status", workspace.status);
  record.setValue("admin_group", workspace.adminGroupSysId);
  record.setValue("editor_group", workspace.editorGroupSysId);
  record.setValue("creator", workspace.creatorUserSysId);
  record.setValue("toc_default_visible", workspace.layout.tocVisibleByDefault);
  record.setValue("page_width", workspace.layout.pageWidth);
  const sysId = cleanText(record.insert());

  if (!sysId) {
    throw new Error(`Failed to create workspace record in ${DOCSERA_WORKSPACE_TABLE}.`);
  }

  if (!record.get(sysId)) {
    throw new Error(`Workspace ${sysId} was inserted but could not be reloaded.`);
  }

  return mapWorkspaceRecord(record);
}

function listReservedWorkspaceSlugs(): string[] {
  const record = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
  record.query();

  const slugs: string[] = [];
  while (record.next()) {
    const slug = cleanText(record.getValue("workspace_slug"));
    if (slug) {
      slugs.push(slug);
    }
  }

  return slugs;
}

export function createServiceNowWorkspaceProvisioningService() {
  return {
    async createWorkspace(input: WorkspaceDraftInput) {
      const creatorUserSysId = cleanText(gs.getUserID());
      if (!creatorUserSysId) {
        throw new Error("The current ServiceNow user could not be resolved.");
      }

      const createdOn = new GlideDateTime().getDisplayValue();
      return provisionWorkspace(
        {
          ...input,
          creatorUserSysId,
          creatorUserName: cleanText(gs.getUserName()),
          createdOn
        },
        {
          createGroup: async ({ name, description }) => createGroup({ name, description }),
          assignRoleToGroup: async (groupSysId, roleName) => assignRoleToGroup(groupSysId, roleName),
          addUserToGroup: async ({ groupSysId, userSysId }) => addUserToGroup(groupSysId, userSysId),
          saveWorkspace: async (workspace) => saveWorkspace(workspace),
          deleteGroup: async (groupSysId) => deleteGroup(groupSysId),
          listReservedWorkspaceSlugs: async () => listReservedWorkspaceSlugs()
        },
        listReservedWorkspaceSlugs()
      );
    },
    listReservedWorkspaceSlugs,
    roleNames: WORKSPACE_ROLE_NAMES
  };
}
