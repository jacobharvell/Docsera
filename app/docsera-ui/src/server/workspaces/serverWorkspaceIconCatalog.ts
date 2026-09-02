export type BuiltInWorkspaceIconGlyph =
  | "docsera-workspace"
  | "book-open"
  | "briefcase"
  | "building"
  | "code"
  | "monitor-cog"
  | "shield-check"
  | "users"
  | "graduation-cap"
  | "clipboard-list"
  | "lightbulb"
  | "folder-kanban";

export type BuiltInWorkspaceIcon = {
  type: "builtin";
  key: string;
  label: string;
  glyph: BuiltInWorkspaceIconGlyph;
};

export const DEFAULT_BUILT_IN_WORKSPACE_ICON_KEY = "docsera-workspace";

export const BUILT_IN_WORKSPACE_ICONS: readonly BuiltInWorkspaceIcon[] = Object.freeze([
  {
    type: "builtin",
    key: DEFAULT_BUILT_IN_WORKSPACE_ICON_KEY,
    label: "Docsera workspace icon",
    glyph: "docsera-workspace"
  },
  {
    type: "builtin",
    key: "documentation",
    label: "Documentation",
    glyph: "book-open"
  },
  {
    type: "builtin",
    key: "business",
    label: "Business",
    glyph: "briefcase"
  },
  {
    type: "builtin",
    key: "organization",
    label: "Organization",
    glyph: "building"
  },
  {
    type: "builtin",
    key: "engineering",
    label: "Engineering",
    glyph: "code"
  },
  {
    type: "builtin",
    key: "it",
    label: "IT",
    glyph: "monitor-cog"
  },
  {
    type: "builtin",
    key: "security",
    label: "Security",
    glyph: "shield-check"
  },
  {
    type: "builtin",
    key: "team",
    label: "Team",
    glyph: "users"
  },
  {
    type: "builtin",
    key: "training",
    label: "Training",
    glyph: "graduation-cap"
  },
  {
    type: "builtin",
    key: "operations",
    label: "Operations",
    glyph: "clipboard-list"
  },
  {
    type: "builtin",
    key: "ideas",
    label: "Ideas",
    glyph: "lightbulb"
  },
  {
    type: "builtin",
    key: "projects",
    label: "Projects",
    glyph: "folder-kanban"
  }
]);

export const DEFAULT_BUILT_IN_WORKSPACE_ICON = Object.freeze(
  BUILT_IN_WORKSPACE_ICONS[0] satisfies BuiltInWorkspaceIcon
);

export function findBuiltInWorkspaceIcon(key: unknown): BuiltInWorkspaceIcon | null {
  const cleanKey = typeof key === "string" ? key.trim() : "";
  if (!cleanKey) {
    return null;
  }

  return BUILT_IN_WORKSPACE_ICONS.find((icon) => icon.key === cleanKey) ?? null;
}

export function isBuiltInWorkspaceIconKey(key: unknown): boolean {
  return Boolean(findBuiltInWorkspaceIcon(key));
}

export function normalizeBuiltInWorkspaceIcon(key: unknown): BuiltInWorkspaceIcon {
  return findBuiltInWorkspaceIcon(key) ?? DEFAULT_BUILT_IN_WORKSPACE_ICON;
}
