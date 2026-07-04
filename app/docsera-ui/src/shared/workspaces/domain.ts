export const DOCSERA_SCOPE = "x_82900_docsera";
export const DOCSERA_WORKSPACE_TABLE = "x_82900_docsera_workspace";

export const WORKSPACE_ROLE_NAMES = Object.freeze({
  docseraAdmin: `${DOCSERA_SCOPE}.admin`,
  workspaceAdmin: `${DOCSERA_SCOPE}.workspace_admin`,
  editor: `${DOCSERA_SCOPE}.editor`
});

export const DEFAULT_WORKSPACE_ICON = Object.freeze({
  type: "builtin",
  key: "docsera-workspace",
  label: "Docsera workspace icon"
});

export const DEFAULT_WORKSPACE_LAYOUT = Object.freeze({
  tocVisibleByDefault: true,
  pageWidth: "readable"
});

export type WorkspaceStatus = "active" | "inactive";
export type WorkspacePageWidth = "readable" | "full";

export type WorkspaceIcon = {
  type: "builtin" | "uploaded";
  key: string;
  label: string;
  assetPath?: string;
  attachmentSysId?: string;
  value?: string;
};

export type WorkspaceLayoutDefaults = {
  tocVisibleByDefault: boolean;
  pageWidth: WorkspacePageWidth;
};

export type WorkspaceRecord = {
  sysId?: string;
  name: string;
  slug: string;
  shortDescription: string | null;
  icon: WorkspaceIcon;
  status: WorkspaceStatus;
  adminGroupSysId: string;
  editorGroupSysId: string;
  adminGroupName?: string;
  editorGroupName?: string;
  creatorUserSysId: string;
  creatorUserName?: string | null;
  createdOn?: string | null;
  updatedOn?: string | null;
  updatedBy?: string | null;
  layout: WorkspaceLayoutDefaults;
};

export type WorkspaceDraftInput = {
  name: string;
  shortDescription?: string | null;
  icon?: Partial<WorkspaceIcon> | string | null;
  status?: WorkspaceStatus | null;
  creatorUserSysId?: string | null;
  creatorUserName?: string | null;
  createdOn?: string | null;
  layout?: Partial<WorkspaceLayoutDefaults> | null;
};

export type WorkspaceDraft = Omit<WorkspaceRecord, "adminGroupSysId" | "editorGroupSysId"> & {
  workspaceGroupKey: string;
  adminGroupName: string;
  editorGroupName: string;
};

export type WorkspaceGroup = {
  sysId: string;
  name: string;
  description?: string;
};

export type WorkspaceSlugReservation = string | { slug?: string; workspaceSlug?: string };

export type WorkspaceProvisioningDependencies = {
  createGroup: (input: { name: string; description: string; type: "admin" | "editor" }) => Promise<WorkspaceGroup>;
  assignRoleToGroup: (groupSysId: string, roleName: string) => Promise<void>;
  addUserToGroup: (input: { groupSysId: string; userSysId: string }) => Promise<void>;
  saveWorkspace: (workspace: WorkspaceRecord) => Promise<WorkspaceRecord>;
  deleteGroup?: (groupSysId: string) => Promise<void>;
  listReservedWorkspaceSlugs?: () => Promise<WorkspaceSlugReservation[]> | WorkspaceSlugReservation[];
};

export type WorkspaceProvisioningResult = {
  draft: WorkspaceDraft;
  workspace: WorkspaceRecord;
  adminGroup: WorkspaceGroup;
  editorGroup: WorkspaceGroup;
};

export type WorkspaceCapabilityResult = {
  canViewWorkspace: boolean;
  canEditWorkspace: boolean;
  canAdminWorkspace: boolean;
  canManageWorkspaceMembers: boolean;
};

export type WorkspaceCapabilityRoleNames = {
  docseraAdmin: string;
  workspaceAdmin: string;
  editor: string;
};

export type WorkspaceCapabilityDependencies = {
  isAuthenticated: boolean;
  hasRole: (roleName: string) => boolean;
  isMemberOfGroup: (groupSysId: string) => boolean;
  roleNames?: Partial<WorkspaceCapabilityRoleNames>;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toSlugFragment(value: string): string {
  return cleanText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

function toWorkspaceTitleFragment(value: string): string {
  return cleanText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join("_");
}

function normalizeRetainedWorkspaceSlugs(retainedWorkspaces: WorkspaceSlugReservation[] = []): string[] {
  return retainedWorkspaces
    .map((entry) => {
      if (typeof entry === "string") {
        return cleanText(entry);
      }

      if (!entry || typeof entry !== "object") {
        return "";
      }

      return cleanText(entry.slug ?? entry.workspaceSlug);
    })
    .filter(Boolean);
}

export function slugifyWorkspaceName(name: string): string {
  return toSlugFragment(name) || "workspace";
}

export function allocateWorkspaceSlug(
  name: string,
  retainedWorkspaces: WorkspaceSlugReservation[] = []
): string {
  const baseSlug = slugifyWorkspaceName(name);
  const reservedSlugs = new Set(normalizeRetainedWorkspaceSlugs(retainedWorkspaces).map((slug) => slug.toLowerCase()));

  if (!reservedSlugs.has(baseSlug)) {
    return baseSlug;
  }

  let suffix = 2;
  while (reservedSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix += 1;
  }

  return `${baseSlug}-${suffix}`;
}

export function deriveWorkspaceGroupKey(name: string, slug: string): string {
  const baseKey = toWorkspaceTitleFragment(name) || "Workspace";
  const suffix = cleanText(slug).match(/-(\d+)$/)?.[1];
  return suffix ? `${baseKey}_${suffix}` : baseKey;
}

export function buildWorkspaceGroupNames(workspaceKey: string): { admin: string; editor: string } {
  const cleanKey = cleanText(workspaceKey) || "Workspace";
  return {
    admin: `Docsera_${cleanKey}_Admins`,
    editor: `Docsera_${cleanKey}_Editors`
  };
}

export function normalizeWorkspaceIcon(icon?: Partial<WorkspaceIcon> | string | null): WorkspaceIcon {
  if (!icon) {
    return { ...DEFAULT_WORKSPACE_ICON };
  }

  if (typeof icon === "string") {
    return {
      ...DEFAULT_WORKSPACE_ICON,
      key: cleanText(icon) || DEFAULT_WORKSPACE_ICON.key
    };
  }

  const type = icon.type === "uploaded" ? "uploaded" : "builtin";
  const key = cleanText(icon.key) || DEFAULT_WORKSPACE_ICON.key;
  const label = cleanText(icon.label) || DEFAULT_WORKSPACE_ICON.label;

  return {
    type,
    key,
    label,
    assetPath: cleanText(icon.assetPath) || undefined,
    attachmentSysId: cleanText(icon.attachmentSysId) || undefined,
    value: cleanText(icon.value) || undefined
  };
}

export function normalizeWorkspaceLayout(layout?: Partial<WorkspaceLayoutDefaults> | null): WorkspaceLayoutDefaults {
  return {
    tocVisibleByDefault:
      typeof layout?.tocVisibleByDefault === "boolean"
        ? layout.tocVisibleByDefault
        : DEFAULT_WORKSPACE_LAYOUT.tocVisibleByDefault,
    pageWidth: layout?.pageWidth === "full" ? "full" : DEFAULT_WORKSPACE_LAYOUT.pageWidth
  };
}

export function createWorkspaceDraft(
  input: WorkspaceDraftInput,
  retainedWorkspaces: WorkspaceSlugReservation[] = []
): WorkspaceDraft {
  if (!input || typeof input !== "object") {
    throw new TypeError("Workspace input must be an object.");
  }

  const name = cleanText(input.name);
  if (!name) {
    throw new TypeError("Workspace name is required.");
  }

  const slug = allocateWorkspaceSlug(name, retainedWorkspaces);
  const workspaceGroupKey = deriveWorkspaceGroupKey(name, slug);
  const groupNames = buildWorkspaceGroupNames(workspaceGroupKey);

  return {
    name,
    slug,
    shortDescription: cleanText(input.shortDescription) || null,
    icon: normalizeWorkspaceIcon(input.icon),
    status: input.status === "inactive" ? "inactive" : "active",
    adminGroupName: groupNames.admin,
    editorGroupName: groupNames.editor,
    workspaceGroupKey,
    creatorUserSysId: cleanText(input.creatorUserSysId),
    creatorUserName: cleanText(input.creatorUserName) || null,
    createdOn: cleanText(input.createdOn) || null,
    layout: normalizeWorkspaceLayout(input.layout)
  };
}

export function reconcileWorkspaceDraftSlug(
  draft: WorkspaceDraft,
  retainedWorkspaces: WorkspaceSlugReservation[] = []
): WorkspaceDraft {
  const nextSlug = allocateWorkspaceSlug(draft.name, retainedWorkspaces);
  if (nextSlug === draft.slug) {
    return draft;
  }

  const workspaceGroupKey = deriveWorkspaceGroupKey(draft.name, nextSlug);
  const groupNames = buildWorkspaceGroupNames(workspaceGroupKey);

  return {
    ...draft,
    slug: nextSlug,
    workspaceGroupKey,
    adminGroupName: groupNames.admin,
    editorGroupName: groupNames.editor
  };
}

function resolveWorkspaceCapabilityRoleNames(
  roleNames?: Partial<WorkspaceCapabilityRoleNames>
): WorkspaceCapabilityRoleNames {
  return {
    docseraAdmin: cleanText(roleNames?.docseraAdmin) || WORKSPACE_ROLE_NAMES.docseraAdmin,
    workspaceAdmin: cleanText(roleNames?.workspaceAdmin) || WORKSPACE_ROLE_NAMES.workspaceAdmin,
    editor: cleanText(roleNames?.editor) || WORKSPACE_ROLE_NAMES.editor
  };
}

function hasWorkspaceAccessWithMembership(
  roleName: string,
  groupSysId: string,
  dependencies: WorkspaceCapabilityDependencies
): boolean {
  return Boolean(roleName) && Boolean(groupSysId) && dependencies.hasRole(roleName) && dependencies.isMemberOfGroup(groupSysId);
}

export function evaluateWorkspaceCapabilities(
  workspace: WorkspaceRecord,
  dependencies: WorkspaceCapabilityDependencies
): WorkspaceCapabilityResult {
  if (!workspace || typeof workspace !== "object") {
    throw new TypeError("A workspace record is required for capability evaluation.");
  }

  if (!dependencies || typeof dependencies !== "object") {
    throw new TypeError("Workspace capability dependencies are required.");
  }

  if (typeof dependencies.hasRole !== "function") {
    throw new TypeError("A hasRole dependency is required.");
  }

  if (typeof dependencies.isMemberOfGroup !== "function") {
    throw new TypeError("An isMemberOfGroup dependency is required.");
  }

  const roleNames = resolveWorkspaceCapabilityRoleNames(dependencies.roleNames);
  const adminGroupSysId = cleanText(workspace.adminGroupSysId);
  const editorGroupSysId = cleanText(workspace.editorGroupSysId);

  const canAdminWorkspace =
    dependencies.hasRole(roleNames.docseraAdmin) ||
    hasWorkspaceAccessWithMembership(roleNames.workspaceAdmin, adminGroupSysId, dependencies);
  const canManageWorkspaceMembers = canAdminWorkspace;
  const canEditWorkspace =
    canAdminWorkspace || hasWorkspaceAccessWithMembership(roleNames.editor, editorGroupSysId, dependencies);
  const canViewWorkspace =
    canEditWorkspace || canAdminWorkspace || (dependencies.isAuthenticated && workspace.status === "active");

  return {
    canViewWorkspace,
    canEditWorkspace,
    canAdminWorkspace,
    canManageWorkspaceMembers
  };
}

async function cleanupProvisionedGroups(
  dependencies: WorkspaceProvisioningDependencies,
  groupSysIds: string[]
): Promise<void> {
  if (typeof dependencies.deleteGroup !== "function") {
    return;
  }

  for (const groupSysId of groupSysIds.reverse()) {
    if (groupSysId) {
      await dependencies.deleteGroup(groupSysId);
    }
  }
}

export async function provisionWorkspace(
  input: WorkspaceDraftInput,
  dependencies: WorkspaceProvisioningDependencies,
  retainedWorkspaces: WorkspaceSlugReservation[] = []
): Promise<WorkspaceProvisioningResult> {
  if (!dependencies || typeof dependencies !== "object") {
    throw new TypeError("Workspace provisioning dependencies are required.");
  }

  if (typeof dependencies.createGroup !== "function") {
    throw new TypeError("A createGroup dependency is required.");
  }

  if (typeof dependencies.assignRoleToGroup !== "function") {
    throw new TypeError("An assignRoleToGroup dependency is required.");
  }

  if (typeof dependencies.addUserToGroup !== "function") {
    throw new TypeError("An addUserToGroup dependency is required.");
  }

  if (typeof dependencies.saveWorkspace !== "function") {
    throw new TypeError("A saveWorkspace dependency is required.");
  }

  let draft = createWorkspaceDraft(input, retainedWorkspaces);
  if (typeof dependencies.listReservedWorkspaceSlugs === "function") {
    draft = reconcileWorkspaceDraftSlug(draft, await dependencies.listReservedWorkspaceSlugs());
  }
  const createdGroupSysIds: string[] = [];

  try {
    const adminGroup = await dependencies.createGroup({
      name: draft.adminGroupName,
      description: `Workspace admin group for ${draft.name}`,
      type: "admin"
    });
    createdGroupSysIds.push(adminGroup.sysId);

    const editorGroup = await dependencies.createGroup({
      name: draft.editorGroupName,
      description: `Workspace editor group for ${draft.name}`,
      type: "editor"
    });
    createdGroupSysIds.push(editorGroup.sysId);

    await dependencies.assignRoleToGroup(adminGroup.sysId, WORKSPACE_ROLE_NAMES.workspaceAdmin);
    await dependencies.assignRoleToGroup(editorGroup.sysId, WORKSPACE_ROLE_NAMES.editor);

    if (draft.creatorUserSysId) {
      await dependencies.addUserToGroup({
        groupSysId: adminGroup.sysId,
        userSysId: draft.creatorUserSysId
      });
    }

    const workspace = await dependencies.saveWorkspace({
      ...draft,
      adminGroupSysId: adminGroup.sysId,
      editorGroupSysId: editorGroup.sysId
    });

    return {
      draft,
      workspace,
      adminGroup,
      editorGroup
    };
  } catch (error) {
    await cleanupProvisionedGroups(dependencies, createdGroupSysIds);
    throw error;
  }
}
