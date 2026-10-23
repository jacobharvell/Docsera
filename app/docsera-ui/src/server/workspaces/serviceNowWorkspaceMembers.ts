import { GlideRecord, gs } from "@servicenow/glide";
import { DOCSERA_WORKSPACE_TABLE, type WorkspaceRecord } from "./serverWorkspaceDomain.ts";
import { evaluateCurrentUserWorkspaceCapabilities } from "./serviceNowWorkspaceCapabilities.ts";
import { mapWorkspaceRecord } from "./serviceNowWorkspaceRecords.ts";

export type WorkspaceMembershipAccessLevel = "editor" | "admin";

export type WorkspaceMember = {
  userSysId: string;
  userName: string;
  displayName: string;
  email: string;
  active: boolean;
  accessLevel: WorkspaceMembershipAccessLevel;
};

export type WorkspaceMemberUserSearchResult = {
  userSysId: string;
  userName: string;
  displayName: string;
  email: string;
};

export type WorkspaceMemberCallerCapabilities = {
  canManageWorkspaceMembers: boolean;
};

export type WorkspaceMemberMutationInput = {
  workspaceSlug?: string | null;
  workspaceSysId?: string | null;
  userSysId?: string | null;
  accessLevel?: WorkspaceMembershipAccessLevel | string | null;
};

export type WorkspaceMemberRemoveInput = {
  workspaceSlug?: string | null;
  workspaceSysId?: string | null;
  userSysId?: string | null;
};

export type WorkspaceMembershipMutationKind = "set" | "remove";

export const DOCSERA_WORKSPACE_MEMBERSHIP_MUTATION_COMMAND_TABLE =
  "x_82900_docsera_workspace_member_mutation_command";

export type WorkspaceMemberMutationCommand = {
  accessLevel: WorkspaceMembershipAccessLevel | null;
  kind: WorkspaceMembershipMutationKind;
  targetUserSysId: string;
  workspaceSysId: string;
};

export type WorkspaceMembershipDependencies = {
  evaluateWorkspaceCapabilities: (workspace: WorkspaceRecord) => {
    canManageWorkspaceMembers: boolean;
  };
  hasDocseraAdminAccess: () => boolean;
  listGroupMembers: (groupSysId: string, accessLevel: WorkspaceMembershipAccessLevel) => WorkspaceMember[];
  listWorkspaceGroupMembers?: (adminGroupSysId: string, editorGroupSysId: string) => { adminMembers: WorkspaceMember[]; editorMembers: WorkspaceMember[] };
  searchActiveUsers: (term: string, excludedUserSysIds: string[], limit: number) => WorkspaceMemberUserSearchResult[];
  loadWorkspaceBySlug: (workspaceSlug: string) => WorkspaceRecord | null;
  loadWorkspaceBySysId: (workspaceSysId: string) => WorkspaceRecord | null;
  createMutationCommand: (command: WorkspaceMemberMutationCommand) => string | null;
};

export type WorkspaceMembersOutcome =
  | { kind: "failed"; errorMessage: string; status: 400 | 404 | 500 }
  | { kind: "forbidden"; errorMessage: string }
  | { kind: "succeeded"; callerCapabilities: WorkspaceMemberCallerCapabilities; members: WorkspaceMember[] };

export type WorkspaceMemberMutationOutcome =
  | { kind: "failed"; errorMessage: string; status: 400 | 404 | 500 }
  | { kind: "forbidden"; errorMessage: string }
  | { kind: "succeeded"; callerCapabilities: WorkspaceMemberCallerCapabilities; member: WorkspaceMember | null; members: WorkspaceMember[] };

export type WorkspaceMemberRemoveOutcome =
  | { kind: "failed"; errorMessage: string; status: 400 | 404 | 500 }
  | { kind: "forbidden"; errorMessage: string }
  | { kind: "succeeded"; callerCapabilities: WorkspaceMemberCallerCapabilities; members: WorkspaceMember[] };

export type WorkspaceMemberUserSearchOutcome =
  | { kind: "failed"; errorMessage: string; status: 400 | 404 | 500 }
  | { kind: "forbidden"; errorMessage: string }
  | { kind: "succeeded"; callerCapabilities: WorkspaceMemberCallerCapabilities; users: WorkspaceMemberUserSearchResult[] };

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBoolean(value: unknown): boolean {
  const normalized = cleanText(value).toLowerCase();
  return value === true || value === 1 || normalized === "1" || normalized === "true" || normalized === "yes";
}

function normalizeAccessLevel(value: unknown): WorkspaceMembershipAccessLevel | null {
  const normalized = cleanText(value).toLowerCase();
  if (normalized === "admin" || normalized === "workspace_admin" || normalized === "workspace-admin") {
    return "admin";
  }

  if (normalized === "editor" || normalized === "workspace_editor" || normalized === "workspace-editor") {
    return "editor";
  }

  return null;
}

function callerCapabilities(dependencies: WorkspaceMembershipDependencies): WorkspaceMemberCallerCapabilities {
  return {
    canManageWorkspaceMembers: true
  };
}

function loadWorkspaceBySysId(workspaceSysId: string): WorkspaceRecord | null {
  const sysId = cleanText(workspaceSysId);
  if (!sysId) {
    return null;
  }

  const record = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
  if (!record.get("sys_id", sysId)) {
    return null;
  }

  return mapWorkspaceRecord(record);
}

function loadWorkspaceBySlug(workspaceSlug: string): WorkspaceRecord | null {
  const slug = cleanText(workspaceSlug);
  if (!slug) {
    return null;
  }

  const record = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
  record.addQuery("workspace_slug", slug);
  record.setLimit(1);
  record.query();

  if (!record.next()) {
    return null;
  }

  return mapWorkspaceRecord(record);
}

const USER_LOOKUP_BATCH_SIZE = 100;

function readGroupMembers(groups: Array<{ groupSysId: string; accessLevel: WorkspaceMembershipAccessLevel }>): WorkspaceMember[][] {
  const validGroups = groups.map((group) => ({ ...group, groupSysId: cleanText(group.groupSysId) }));
  const groupIds = [...new Set(validGroups.map((group) => group.groupSysId).filter(Boolean))];
  if (!groupIds.length) return groups.map(() => []);

  const memberships = new GlideRecord("sys_user_grmember");
  if (groups.length === 1) memberships.addQuery("group", groupIds[0]);
  else memberships.addQuery("group", "IN", groupIds.join(","));
  memberships.query();

  const userIdsByGroup: string[][] = groups.map(() => []);
  while (memberships.next()) {
    const groupSysId = cleanText(memberships.getValue("group"));
    const userSysId = cleanText(memberships.getValue("user"));
    if (!userSysId) continue;
    validGroups.forEach((group, index) => {
      if (group.groupSysId && group.groupSysId === groupSysId) userIdsByGroup[index].push(userSysId);
    });
  }

  const uniqueIds = [...new Set(userIdsByGroup.flat())];
  const usersById = new Map<string, Omit<WorkspaceMember, "accessLevel">>();
  for (let offset = 0; offset < uniqueIds.length; offset += USER_LOOKUP_BATCH_SIZE) {
    const users = new GlideRecord("sys_user");
    users.addQuery("sys_id", "IN", uniqueIds.slice(offset, offset + USER_LOOKUP_BATCH_SIZE).join(","));
    users.query();
    while (users.next()) {
      const userSysId = cleanText(users.getValue("sys_id"));
      usersById.set(userSysId, {
        userSysId,
        userName: cleanText(users.getValue("user_name")),
        displayName: cleanText(users.getDisplayValue("name")) || cleanText(users.getValue("name")) || cleanText(users.getValue("user_name")),
        email: cleanText(users.getValue("email")),
        active: normalizeBoolean(users.getValue("active"))
      });
    }
  }

  return userIdsByGroup.map((userIds, index) => {
    const members: WorkspaceMember[] = [];
    for (const userSysId of userIds) {
      const user = usersById.get(userSysId);
      if (user) members.push({ ...user, accessLevel: validGroups[index].accessLevel });
    }
    return members;
  });
}

export function listGroupMembers(groupSysId: string, accessLevel: WorkspaceMembershipAccessLevel): WorkspaceMember[] {
  return readGroupMembers([{ groupSysId, accessLevel }])[0];
}

export function listWorkspaceGroupMembers(adminGroupSysId: string, editorGroupSysId: string) {
  const [adminMembers, editorMembers] = readGroupMembers([
    { groupSysId: adminGroupSysId, accessLevel: "admin" },
    { groupSysId: editorGroupSysId, accessLevel: "editor" }
  ]);
  return { adminMembers, editorMembers };
}

export function searchActiveUsers(term: string, excludedUserSysIds: string[], limit: number): WorkspaceMemberUserSearchResult[] {
  const cleanTerm = cleanText(term);
  const excluded = new Set(excludedUserSysIds.map(cleanText).filter(Boolean));
  const users = new GlideRecord("sys_user");
  users.addQuery("active", true);
  if (excluded.size > 0) {
    users.addQuery("sys_id", "NOT IN", [...excluded].join(","));
  }
  if (cleanTerm) {
    const nameQuery = users.addQuery("name", "CONTAINS", cleanTerm);
    nameQuery.addOrCondition("user_name", "CONTAINS", cleanTerm);
    nameQuery.addOrCondition("email", "CONTAINS", cleanTerm);
  }
  users.orderBy("name");
  users.setLimit(Math.max(1, Math.min(limit, 20)));
  users.query();

  const results: WorkspaceMemberUserSearchResult[] = [];
  while (users.next()) {
    const userSysId = cleanText(users.getValue("sys_id"));
    if (!userSysId || excluded.has(userSysId)) {
      continue;
    }
    results.push({
      displayName: cleanText(users.getDisplayValue("name")) || cleanText(users.getValue("name")) || cleanText(users.getValue("user_name")),
      email: cleanText(users.getValue("email")),
      userName: cleanText(users.getValue("user_name")),
      userSysId
    });
  }

  return results;
}

function resolveWorkspace(
  dependencies: WorkspaceMembershipDependencies,
  input: { workspaceSlug?: string | null; workspaceSysId?: string | null }
): WorkspaceRecord | null {
  const workspaceSysId = cleanText(input.workspaceSysId);
  if (workspaceSysId) {
    return dependencies.loadWorkspaceBySysId(workspaceSysId);
  }

  const workspaceSlug = cleanText(input.workspaceSlug);
  if (workspaceSlug) {
    return dependencies.loadWorkspaceBySlug(workspaceSlug);
  }

  return null;
}

function mergeMembers(adminMembers: WorkspaceMember[], editorMembers: WorkspaceMember[]): WorkspaceMember[] {
  const membersByUser = new Map<string, WorkspaceMember>();

  for (const member of editorMembers) {
    membersByUser.set(member.userSysId, member);
  }

  for (const member of adminMembers) {
    membersByUser.set(member.userSysId, {
      ...member,
      accessLevel: "admin"
    });
  }

  return [...membersByUser.values()].sort((left, right) => {
    const name = left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" });
    if (name !== 0) {
      return name;
    }

    return left.userSysId.localeCompare(right.userSysId);
  });
}

function listWorkspaceMembers(
  workspace: WorkspaceRecord,
  dependencies: WorkspaceMembershipDependencies
): WorkspaceMember[] {
  if (dependencies.listWorkspaceGroupMembers) {
    const { adminMembers, editorMembers } = dependencies.listWorkspaceGroupMembers(workspace.adminGroupSysId, workspace.editorGroupSysId);
    return mergeMembers(adminMembers, editorMembers);
  }
  return mergeMembers(
    dependencies.listGroupMembers(workspace.adminGroupSysId, "admin"),
    dependencies.listGroupMembers(workspace.editorGroupSysId, "editor")
  );
}

function hasGroupMembership(
  workspace: WorkspaceRecord,
  dependencies: WorkspaceMembershipDependencies,
  groupSysId: string,
  accessLevel: WorkspaceMembershipAccessLevel,
  userSysId: string
): boolean {
  return dependencies
    .listGroupMembers(groupSysId, accessLevel)
    .some((member) => member.userSysId === userSysId);
}

function verifyMutationEndState(
  workspace: WorkspaceRecord,
  dependencies: WorkspaceMembershipDependencies,
  command: WorkspaceMemberMutationCommand
): boolean {
  const inAdmin = hasGroupMembership(workspace, dependencies, workspace.adminGroupSysId, "admin", command.targetUserSysId);
  const inEditor = hasGroupMembership(workspace, dependencies, workspace.editorGroupSysId, "editor", command.targetUserSysId);

  if (command.kind === "remove") {
    return !inAdmin && !inEditor;
  }

  if (command.accessLevel === "admin") {
    return inAdmin && !inEditor;
  }

  if (command.accessLevel === "editor") {
    return inEditor && !inAdmin;
  }

  return false;
}

function countActiveAdmins(workspace: WorkspaceRecord, dependencies: WorkspaceMembershipDependencies): number {
  return dependencies
    .listGroupMembers(workspace.adminGroupSysId, "admin")
    .filter((member) => member.active)
    .length;
}

function isUserActiveAdmin(
  workspace: WorkspaceRecord,
  dependencies: WorkspaceMembershipDependencies,
  userSysId: string
): boolean {
  return dependencies
    .listGroupMembers(workspace.adminGroupSysId, "admin")
    .some((member) => member.userSysId === userSysId && member.active);
}

function isLastActiveAdminChangeForbidden(
  workspace: WorkspaceRecord,
  dependencies: WorkspaceMembershipDependencies,
  targetUserSysId: string,
  nextAccessLevel: WorkspaceMembershipAccessLevel | null
): boolean {
  if (nextAccessLevel === "admin") {
    return false;
  }

  return isUserActiveAdmin(workspace, dependencies, targetUserSysId) && countActiveAdmins(workspace, dependencies) <= 1;
}

function validateGroupReferences(workspace: WorkspaceRecord): string | null {
  if (!cleanText(workspace.adminGroupSysId) || !cleanText(workspace.editorGroupSysId)) {
    return "Workspace access groups are not configured.";
  }

  return null;
}

function ensureCanManageMembers(
  workspace: WorkspaceRecord,
  dependencies: WorkspaceMembershipDependencies
): { allowed: true } | { allowed: false; outcome: { kind: "forbidden"; errorMessage: string } } {
  const capability = dependencies.evaluateWorkspaceCapabilities(workspace);
  if (!capability.canManageWorkspaceMembers) {
    return {
      allowed: false,
      outcome: {
        kind: "forbidden",
        errorMessage: "You do not have permission to manage workspace members."
      }
    };
  }

  return { allowed: true };
}

export function createWorkspaceMembershipService(dependencies: WorkspaceMembershipDependencies) {
  return {
    listMembers(input: { workspaceSlug?: string | null; workspaceSysId?: string | null }): WorkspaceMembersOutcome {
      const workspace = resolveWorkspace(dependencies, input);
      if (!workspace) {
        return { kind: "failed", errorMessage: "Workspace could not be found.", status: 404 };
      }

      const authorization = ensureCanManageMembers(workspace, dependencies);
      if (authorization.allowed === false) {
        return authorization.outcome;
      }

      const groupError = validateGroupReferences(workspace);
      if (groupError) {
        return { kind: "failed", errorMessage: groupError, status: 500 };
      }

      return {
        callerCapabilities: callerCapabilities(dependencies),
        kind: "succeeded",
        members: listWorkspaceMembers(workspace, dependencies)
      };
    },

    searchUsers(input: { excludedUserSysIds?: string[] | null; limit?: number | null; term?: string | null; workspaceSlug?: string | null; workspaceSysId?: string | null }): WorkspaceMemberUserSearchOutcome {
      const term = cleanText(input.term);

      const workspace = resolveWorkspace(dependencies, input);
      if (!workspace) {
        return { kind: "failed", errorMessage: "Workspace could not be found.", status: 404 };
      }

      const authorization = ensureCanManageMembers(workspace, dependencies);
      if (authorization.allowed === false) {
        return authorization.outcome;
      }

      const groupError = validateGroupReferences(workspace);
      if (groupError) {
        return { kind: "failed", errorMessage: groupError, status: 500 };
      }

      const members = listWorkspaceMembers(workspace, dependencies);
      const excluded = [
        ...members.map((member) => member.userSysId),
        ...(Array.isArray(input.excludedUserSysIds) ? input.excludedUserSysIds : [])
      ];
      return {
        callerCapabilities: callerCapabilities(dependencies),
        kind: "succeeded",
        users: dependencies.searchActiveUsers(term, excluded, input.limit ?? 10)
      };
    },

    setMemberAccess(input: WorkspaceMemberMutationInput): WorkspaceMemberMutationOutcome {
      const accessLevel = normalizeAccessLevel(input.accessLevel);
      const userSysId = cleanText(input.userSysId);
      if (!userSysId || !accessLevel) {
        return { kind: "failed", errorMessage: "A user and access level are required.", status: 400 };
      }

      const workspace = resolveWorkspace(dependencies, input);
      if (!workspace) {
        return { kind: "failed", errorMessage: "Workspace could not be found.", status: 404 };
      }

      const authorization = ensureCanManageMembers(workspace, dependencies);
      if (authorization.allowed === false) {
        return authorization.outcome;
      }

      const groupError = validateGroupReferences(workspace);
      if (groupError) {
        return { kind: "failed", errorMessage: groupError, status: 500 };
      }

      if (isLastActiveAdminChangeForbidden(workspace, dependencies, userSysId, accessLevel)) {
        return {
          kind: "forbidden",
          errorMessage: "The last active Workspace Admin cannot be demoted or removed."
        };
      }

      const command = {
        accessLevel,
        kind: "set" as const,
        targetUserSysId: userSysId,
        workspaceSysId: cleanText(workspace.sysId)
      };
      if (!dependencies.createMutationCommand(command) || !verifyMutationEndState(workspace, dependencies, command)) {
        return {
          kind: "failed",
          errorMessage: "Workspace membership could not be updated.",
          status: 500
        };
      }

      const members = listWorkspaceMembers(workspace, dependencies);
      const member = members.find((candidate) => candidate.userSysId === userSysId) ?? null;
      return {
        callerCapabilities: callerCapabilities(dependencies),
        kind: "succeeded",
        member,
        members
      };
    },

    removeMemberAccess(input: WorkspaceMemberRemoveInput): WorkspaceMemberRemoveOutcome {
      const userSysId = cleanText(input.userSysId);
      if (!userSysId) {
        return { kind: "failed", errorMessage: "A user is required.", status: 400 };
      }

      const workspace = resolveWorkspace(dependencies, input);
      if (!workspace) {
        return { kind: "failed", errorMessage: "Workspace could not be found.", status: 404 };
      }

      const authorization = ensureCanManageMembers(workspace, dependencies);
      if (authorization.allowed === false) {
        return authorization.outcome;
      }

      const groupError = validateGroupReferences(workspace);
      if (groupError) {
        return { kind: "failed", errorMessage: groupError, status: 500 };
      }

      if (isLastActiveAdminChangeForbidden(workspace, dependencies, userSysId, null)) {
        return {
          kind: "forbidden",
          errorMessage: "The last active Workspace Admin cannot be demoted or removed."
        };
      }

      const command = {
        accessLevel: null,
        kind: "remove" as const,
        targetUserSysId: userSysId,
        workspaceSysId: cleanText(workspace.sysId)
      };
      if (!dependencies.createMutationCommand(command) || !verifyMutationEndState(workspace, dependencies, command)) {
        return {
          kind: "failed",
          errorMessage: "Workspace membership could not be removed.",
          status: 500
        };
      }

      return {
        callerCapabilities: callerCapabilities(dependencies),
        kind: "succeeded",
        members: listWorkspaceMembers(workspace, dependencies)
      };
    }
  };
}

export function createMembershipMutationCommand(command: WorkspaceMemberMutationCommand): string | null {
  const workspaceSysId = cleanText(command.workspaceSysId);
  const targetUserSysId = cleanText(command.targetUserSysId);
  const kind = cleanText(command.kind);
  const accessLevel = command.accessLevel ? normalizeAccessLevel(command.accessLevel) : null;

  if (!workspaceSysId || !targetUserSysId || (kind !== "set" && kind !== "remove")) {
    return null;
  }

  if (kind === "set" && !accessLevel) {
    return null;
  }

  const commandRecord = new GlideRecord(DOCSERA_WORKSPACE_MEMBERSHIP_MUTATION_COMMAND_TABLE);
  commandRecord.initialize();
  commandRecord.setValue("workspace", workspaceSysId);
  commandRecord.setValue("target_user", targetUserSysId);
  commandRecord.setValue("mutation_kind", kind);
  commandRecord.setValue("access_level", kind === "set" ? accessLevel : "");
  commandRecord.setValue("requested_by", gs.getUserID());
  commandRecord.setValue("state", "requested");
  return cleanText(commandRecord.insert()) || null;
}

export function createServiceNowWorkspaceMembershipService() {
  return createWorkspaceMembershipService({
    evaluateWorkspaceCapabilities: evaluateCurrentUserWorkspaceCapabilities,
    hasDocseraAdminAccess: () => evaluateCurrentUserWorkspaceCapabilities({
      adminGroupSysId: "",
      creatorUserSysId: "",
      editorGroupSysId: "",
      icon: { key: "", label: "", type: "builtin" },
      layout: { pageWidth: "readable", tocVisible: true },
      name: "",
      shortDescription: null,
      slug: "",
      status: "active"
    }).canAdminWorkspace,
    listGroupMembers,
    listWorkspaceGroupMembers,
    loadWorkspaceBySlug,
    loadWorkspaceBySysId,
    createMutationCommand: createMembershipMutationCommand,
    searchActiveUsers
  });
}
