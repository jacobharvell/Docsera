import { GlideDateTime, GlideRecord, gs } from "@servicenow/glide";
import {
  DOCSERA_WORKSPACE_TABLE,
  type WorkspaceDraftInput,
  type WorkspaceGroup,
  type WorkspaceRecord,
  WORKSPACE_ROLE_NAMES,
  provisionWorkspace
} from "./serverWorkspaceDomain.ts";

type WorkspaceProvisioningDiagnosticSnapshot = {
  hasAdminRole: boolean;
  hasDocseraAdminRole: boolean;
  hasEditorRole: boolean;
  hasWorkspaceAdminRole: boolean;
  groupExistsBeforeInsert: boolean;
  userName: string;
  userSysId: string;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readLastErrorMessage(
  record: GlideRecord,
): string {
  return cleanText(
    (
      record as GlideRecord & {
        getLastErrorMessage?: () => string;
      }
    ).getLastErrorMessage?.()
  );
}

function describeThrownInsertFailure(fallbackMessage: string, error: unknown): string {
  const errorMessage = cleanText(error instanceof Error ? error.message : error);
  return errorMessage && errorMessage.startsWith(fallbackMessage) ? errorMessage : fallbackMessage;
}

function normalizeBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

function captureGroupCreateDiagnostics(groupName: string): WorkspaceProvisioningDiagnosticSnapshot {
  const currentUserSysId = cleanText(gs.getUserID());
  const currentUserName = cleanText(gs.getUserName());
  const existing = new GlideRecord("sys_user_group");
  existing.addQuery("name", groupName);
  existing.setLimit(1);
  existing.query();
  return {
    hasAdminRole: Boolean(gs.hasRole("admin")),
    hasDocseraAdminRole: Boolean(gs.hasRole(WORKSPACE_ROLE_NAMES.docseraAdmin)),
    hasEditorRole: Boolean(gs.hasRole(WORKSPACE_ROLE_NAMES.editor)),
    hasWorkspaceAdminRole: Boolean(gs.hasRole(WORKSPACE_ROLE_NAMES.workspaceAdmin)),
    groupExistsBeforeInsert: existing.next(),
    userName: currentUserName,
    userSysId: currentUserSysId
  };
}

function logProvisioningFailure(
  event: string,
  safeMessage: string,
  detail?: string,
  diagnostics?: WorkspaceProvisioningDiagnosticSnapshot
): void {
  const payload = {
    message: safeMessage,
    detail: cleanText(detail) || undefined,
    diagnostics
  };
  gs.error(`[Docsera workspace provisioning] ${event} ${JSON.stringify(payload)}`);
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
  gs.info(`[Docsera workspace provisioning] createGroup start ${input.name}`);
  let diagnostics: WorkspaceProvisioningDiagnosticSnapshot;
  try {
    diagnostics = captureGroupCreateDiagnostics(input.name);
    gs.info(
      `[Docsera workspace provisioning] createGroup diagnostics ${JSON.stringify({
        hasAdminRole: diagnostics.hasAdminRole,
        hasDocseraAdminRole: diagnostics.hasDocseraAdminRole,
        hasEditorRole: diagnostics.hasEditorRole,
        hasWorkspaceAdminRole: diagnostics.hasWorkspaceAdminRole,
        groupExistsBeforeInsert: diagnostics.groupExistsBeforeInsert,
        userName: diagnostics.userName,
        userSysId: diagnostics.userSysId
      })}`
    );
  } catch (error) {
    gs.error(
      `[Docsera workspace provisioning] createGroup diagnostics failed ${input.name}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throw error;
  }

  if (diagnostics.groupExistsBeforeInsert) {
    throw new Error(`A ServiceNow group named ${input.name} already exists.`);
  }

  const group = new GlideRecord("sys_user_group");
  group.initialize();
  group.setValue("name", input.name);
  group.setValue("description", input.description);

  try {
    gs.info(`[Docsera workspace provisioning] createGroup insert begin ${input.name}`);
    const sysId = cleanText(group.insert());

    if (!sysId) {
      const safeMessage = "Failed to create a required workspace access group.";
      logProvisioningFailure(
        `createGroup insert failed ${input.name}`,
        safeMessage,
        readLastErrorMessage(group),
        diagnostics
      );
      throw new Error(safeMessage);
    }

    gs.info(`[Docsera workspace provisioning] createGroup insert success ${input.name} ${sysId}`);

    return {
      sysId,
      name: input.name,
      description: input.description
    };
  } catch (error) {
    const safeMessage = "Failed to create a required workspace access group.";
    logProvisioningFailure(
      `createGroup exception ${input.name}`,
      safeMessage,
      error instanceof Error ? error.message : String(error),
      diagnostics
    );
    throw new Error(describeThrownInsertFailure(safeMessage, error));
  }
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
    const safeMessage = "Failed to assign a required workspace role.";
    logProvisioningFailure(
      `assignRoleToGroup insert failed ${groupSysId}`,
      safeMessage,
      readLastErrorMessage(membership)
    );
    throw new Error(safeMessage);
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
    const safeMessage = "Failed to add the workspace creator to the admin group.";
    logProvisioningFailure(
      `addUserToGroup insert failed ${groupSysId}`,
      safeMessage,
      readLastErrorMessage(membership)
    );
    throw new Error(safeMessage);
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
    const safeMessage = "Failed to create the workspace record.";
    logProvisioningFailure(
      `saveWorkspace insert failed ${workspace.slug}`,
      safeMessage,
      readLastErrorMessage(record)
    );
    throw new Error(safeMessage);
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
