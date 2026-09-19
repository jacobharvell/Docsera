// Keep server-executed workspace domain logic under src/server so the SDK emits
// it into sys_module records for on-instance module resolution.

export const DOCSERA_SCOPE = "x_82900_docsera";
export const DOCSERA_WORKSPACE_TABLE = "x_82900_docsera_workspace";

export const WORKSPACE_ROLE_NAMES = Object.freeze({
  docseraAdmin: `${DOCSERA_SCOPE}.admin`,
  workspaceAdmin: `${DOCSERA_SCOPE}.workspace_admin`,
  editor: `${DOCSERA_SCOPE}.editor`
});

export {
  BUILT_IN_WORKSPACE_ICONS,
  DEFAULT_BUILT_IN_WORKSPACE_ICON,
  DEFAULT_BUILT_IN_WORKSPACE_ICON_KEY,
  type BuiltInWorkspaceIcon,
  type BuiltInWorkspaceIconGlyph,
  findBuiltInWorkspaceIcon,
  isBuiltInWorkspaceIconKey,
  normalizeBuiltInWorkspaceIcon
} from "./serverWorkspaceIconCatalog.ts";
import { DEFAULT_BUILT_IN_WORKSPACE_ICON, findBuiltInWorkspaceIcon, normalizeBuiltInWorkspaceIcon } from "./serverWorkspaceIconCatalog.ts";

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
  tocVisible: boolean;
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
  pendingChangeSetSysId?: string | null;
  publishedSnapshotSetSysId?: string | null;
  workspaceStateRevision?: number | null;
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

export type WorkspaceSettingsInput = {
  workspaceSlug?: string | null;
  workspaceSysId?: string | null;
  name?: string | null;
  shortDescription?: string | null;
  icon?: Partial<WorkspaceIcon> | string | null;
  layout?: Partial<Pick<WorkspaceLayoutDefaults, "tocVisible">> | null;
};

export type WorkspaceSettingsValidation =
  | {
      valid: true;
      workspace: WorkspaceRecord;
    }
  | {
      valid: false;
      error: string;
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

export type WorkspaceProvisionedAccessGroups = {
  adminGroup: WorkspaceGroup;
  editorGroup: WorkspaceGroup;
};

export type WorkspaceSlugReservation = string | { slug?: string; workspaceSlug?: string };

export type WorkspaceProvisioningDependencies = {
  createGroup?: (input: { name: string; description: string; type: "admin" | "editor" }) => Promise<WorkspaceGroup>;
  assignRoleToGroup?: (groupSysId: string, roleName: string) => Promise<void>;
  provisionAccessGroups?: (draft: WorkspaceDraft) => Promise<WorkspaceProvisionedAccessGroups>;
  deleteProvisionedAccessGroups?: (groups: WorkspaceProvisionedAccessGroups) => Promise<void>;
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

export type WorkspaceCapabilityLabel = "Admin" | "Editor";

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

export type WorkspaceListItem = WorkspaceRecord & {
  roleLabel: WorkspaceCapabilityLabel | null;
  canManageWorkspaceMembers: boolean;
  canManageSettings: boolean;
};

export type WorkspaceListQuery = {
  searchText?: string;
  page?: number;
  pageSize?: number;
};

export type WorkspaceListResult = {
  canCreateWorkspaces: boolean;
  items: WorkspaceListItem[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasNextPage: boolean;
  searchText: string;
};

const DEFAULT_WORKSPACE_ICON = Object.freeze({
  type: "builtin" as const,
  key: DEFAULT_BUILT_IN_WORKSPACE_ICON.key,
  label: DEFAULT_BUILT_IN_WORKSPACE_ICON.label
});

const DEFAULT_WORKSPACE_LAYOUT = Object.freeze({
  tocVisible: true,
  pageWidth: "readable" as const
});

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeWorkspaceSearchText(value: unknown): string {
  return cleanText(value).toLowerCase();
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
    const builtInIcon = findBuiltInWorkspaceIcon(icon);
    if (!builtInIcon) {
      throw new TypeError("Unsupported built-in workspace icon.");
    }

    return {
      ...DEFAULT_WORKSPACE_ICON,
      key: builtInIcon.key,
      label: builtInIcon.label
    };
  }

  const type = icon.type === "uploaded" ? "uploaded" : "builtin";
  if (type === "builtin") {
    const builtInIcon = findBuiltInWorkspaceIcon(icon.key);
    if (!builtInIcon) {
      throw new TypeError("Unsupported built-in workspace icon.");
    }

    return {
      type: "builtin",
      key: builtInIcon.key,
      label: builtInIcon.label
    };
  }

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
    tocVisible:
      typeof layout?.tocVisible === "boolean"
        ? layout.tocVisible
        : DEFAULT_WORKSPACE_LAYOUT.tocVisible,
    pageWidth: layout?.pageWidth === "full" ? "full" : DEFAULT_WORKSPACE_LAYOUT.pageWidth
  };
}

function hasOwnProperty(value: object, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

export function applyWorkspaceSettings(
  currentWorkspace: WorkspaceRecord,
  input: WorkspaceSettingsInput
): WorkspaceSettingsValidation {
  if (!currentWorkspace || typeof currentWorkspace !== "object") {
    throw new TypeError("A workspace record is required.");
  }

  if (!input || typeof input !== "object") {
    return {
      valid: false,
      error: "Workspace settings input is required."
    };
  }

  const workspaceSysId = cleanText(input.workspaceSysId);
  const workspaceSlug = cleanText(input.workspaceSlug);
  if (!workspaceSysId && !workspaceSlug) {
    return {
      valid: false,
      error: "A workspace reference is required."
    };
  }

  if (workspaceSysId && cleanText(currentWorkspace.sysId) !== workspaceSysId) {
    return {
      valid: false,
      error: "Workspace could not be found."
    };
  }

  if (workspaceSlug && cleanText(currentWorkspace.slug) !== workspaceSlug) {
    return {
      valid: false,
      error: "Workspace could not be found."
    };
  }

  const name = cleanText(input.name);
  if (!name) {
    return {
      valid: false,
      error: "Workspace name is required."
    };
  }

  if (name.length > 160) {
    return {
      valid: false,
      error: "Workspace name must be 160 characters or fewer."
    };
  }

  const shortDescription = cleanText(input.shortDescription);
  if (shortDescription.length > 240) {
    return {
      valid: false,
      error: "Short description must be 240 characters or fewer."
    };
  }

  let icon = currentWorkspace.icon;
  if (hasOwnProperty(input, "icon") && input.icon != null) {
    try {
      icon = normalizeWorkspaceIcon(input.icon);
    } catch {
      return {
        valid: false,
        error: "Unsupported built-in workspace icon."
      };
    }
  }

  const tocVisible =
    input.layout && typeof input.layout.tocVisible === "boolean"
      ? input.layout.tocVisible
      : currentWorkspace.layout.tocVisible;

  return {
    valid: true,
    workspace: {
      ...currentWorkspace,
      name,
      shortDescription: shortDescription || null,
      icon,
      layout: {
        ...currentWorkspace.layout,
        tocVisible
      }
    }
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

export function resolveWorkspaceCapabilityLabel(
  capability: WorkspaceCapabilityResult
): WorkspaceCapabilityLabel | null {
  if (capability.canAdminWorkspace) {
    return "Admin";
  }

  if (capability.canEditWorkspace) {
    return "Editor";
  }

  return null;
}

export function buildWorkspaceListItem(
  workspace: WorkspaceRecord,
  capability: WorkspaceCapabilityResult
): WorkspaceListItem {
  const roleLabel = resolveWorkspaceCapabilityLabel(capability);

  return {
    ...workspace,
    roleLabel,
    canManageSettings: capability.canAdminWorkspace,
    canManageWorkspaceMembers: capability.canManageWorkspaceMembers
  };
}

export function sortWorkspacesByName(left: WorkspaceRecord, right: WorkspaceRecord): number {
  const nameComparison = cleanText(left.name).localeCompare(cleanText(right.name), undefined, { sensitivity: "base" });
  if (nameComparison !== 0) {
    return nameComparison;
  }

  return cleanText(left.slug).localeCompare(cleanText(right.slug), undefined, { sensitivity: "base" });
}

export function filterWorkspacesByName(workspaces: WorkspaceRecord[], searchText: string): WorkspaceRecord[] {
  const query = normalizeWorkspaceSearchText(searchText);
  if (!query) {
    return [...workspaces];
  }

  return workspaces.filter((workspace) => normalizeWorkspaceSearchText(workspace.name).includes(query));
}

// Keep list helpers under src/server so the SDK emits the full workspace
// catalog dependency graph into sys_module records for on-instance resolution.
export function buildWorkspaceListResult(
  workspaces: WorkspaceRecord[],
  capabilitiesByWorkspaceSlug: Map<string, WorkspaceCapabilityResult>,
  query: WorkspaceListQuery = {},
  canCreateWorkspaces = false
): WorkspaceListResult {
  const pageSize = Math.max(1, Math.min(50, Number(query.pageSize) || 10));
  const page = Math.max(1, Number(query.page) || 1);
  const searchText = normalizeWorkspaceSearchText(query.searchText);
  const filteredWorkspaces = filterWorkspacesByName(workspaces, searchText).sort(sortWorkspacesByName);
  const listedItems = filteredWorkspaces
    .map((workspace) => {
      const capability = capabilitiesByWorkspaceSlug.get(cleanText(workspace.slug));
      if (!capability) {
        return null;
      }

      return buildWorkspaceListItem(workspace, capability);
    })
    .filter((item): item is WorkspaceListItem => {
      if (!item) {
        return false;
      }

      return Boolean(item.roleLabel);
    });

  const startIndex = (page - 1) * pageSize;
  const items = listedItems.slice(startIndex, startIndex + pageSize);

  return {
    canCreateWorkspaces,
    items,
    page,
    pageSize,
    totalCount: listedItems.length,
    hasNextPage: startIndex + pageSize < listedItems.length,
    searchText
  };
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
  groupSysIds: string[],
  provisionedGroups?: WorkspaceProvisionedAccessGroups
): Promise<void> {
  if (provisionedGroups && typeof dependencies.deleteProvisionedAccessGroups === "function") {
    await dependencies.deleteProvisionedAccessGroups(provisionedGroups);
    return;
  }

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

  if (typeof dependencies.saveWorkspace !== "function") {
    throw new TypeError("A saveWorkspace dependency is required.");
  }

  let draft = createWorkspaceDraft(input, retainedWorkspaces);
  if (typeof dependencies.listReservedWorkspaceSlugs === "function") {
    draft = reconcileWorkspaceDraftSlug(draft, await dependencies.listReservedWorkspaceSlugs());
  }
  const createdGroupSysIds: string[] = [];
  let provisionedGroups: WorkspaceProvisionedAccessGroups | undefined;

  try {
    if (typeof dependencies.provisionAccessGroups === "function") {
      provisionedGroups = await dependencies.provisionAccessGroups(draft);
      const workspace = await dependencies.saveWorkspace({
        ...draft,
        adminGroupSysId: provisionedGroups.adminGroup.sysId,
        editorGroupSysId: provisionedGroups.editorGroup.sysId
      });

      return {
        draft,
        workspace,
        adminGroup: provisionedGroups.adminGroup,
        editorGroup: provisionedGroups.editorGroup
      };
    }

    if (typeof dependencies.createGroup !== "function") {
      throw new TypeError("A createGroup dependency is required.");
    }

    if (typeof dependencies.assignRoleToGroup !== "function") {
      throw new TypeError("An assignRoleToGroup dependency is required.");
    }

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
    await cleanupProvisionedGroups(dependencies, createdGroupSysIds, provisionedGroups);
    throw error;
  }
}
