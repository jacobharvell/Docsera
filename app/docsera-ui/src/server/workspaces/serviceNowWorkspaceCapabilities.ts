import { GlideRecord, gs } from "@servicenow/glide";
import {
  WORKSPACE_ROLE_NAMES,
  type WorkspaceCapabilityResult,
  type WorkspaceRecord,
  evaluateWorkspaceCapabilities
} from "./serverWorkspaceDomain.ts";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isCurrentUserMemberOfGroup(groupSysId: string, userSysId: string): boolean {
  const cleanGroupSysId = cleanText(groupSysId);
  if (!cleanGroupSysId || !userSysId) {
    return false;
  }

  const membership = new GlideRecord("sys_user_grmember");
  membership.addQuery("group", cleanGroupSysId);
  membership.addQuery("user", userSysId);
  membership.setLimit(1);
  membership.query();
  return membership.next();
}

export function evaluateCurrentUserWorkspaceCapabilities(workspace: WorkspaceRecord): WorkspaceCapabilityResult {
  const currentUserSysId = cleanText(gs.getUserID());

  return evaluateWorkspaceCapabilities(workspace, {
    isAuthenticated: Boolean(currentUserSysId),
    hasRole: (roleName) => Boolean(cleanText(roleName)) && gs.hasRole(roleName),
    isMemberOfGroup: (groupSysId) => isCurrentUserMemberOfGroup(groupSysId, currentUserSysId)
  });
}

export function canCurrentUserCreateWorkspaces(): boolean {
  return gs.hasRole(WORKSPACE_ROLE_NAMES.docseraAdmin);
}
