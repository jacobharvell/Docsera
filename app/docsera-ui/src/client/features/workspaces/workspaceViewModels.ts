import { demoWorkspace } from "./demoWorkspace";
import type { WorkspaceViewRecord } from "../../shared/types/docsera";
import type { DemoWorkspace } from "../../shared/types/docsera";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getWorkspaceRoleLabel(workspace: WorkspaceViewRecord | null | undefined): string {
  if (workspace?.roleLabel) {
    return workspace.roleLabel;
  }

  return "Viewer";
}

export function buildWorkspaceShellWorkspace(workspace: WorkspaceViewRecord): DemoWorkspace {
  const title = cleanText(workspace.name) || "Workspace";
  const iconLabel = cleanText(workspace.icon?.label) || title.charAt(0).toUpperCase();

  return {
    ...demoWorkspace,
    title,
    iconLabel,
    homeLabel: title,
    roleLabel: getWorkspaceRoleLabel(workspace),
    canManageSettings: Boolean(workspace.canManageSettings)
  };
}
