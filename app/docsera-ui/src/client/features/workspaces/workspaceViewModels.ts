import { demoWorkspace } from "./demoWorkspace";
import type { DemoPage, DemoWorkspace, WorkspacePageRecord, WorkspaceViewRecord } from "../../shared/types/docsera";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function getWorkspaceRoleLabel(workspace: WorkspaceViewRecord | null | undefined): string {
  if (workspace?.roleLabel) {
    return workspace.roleLabel;
  }

  return "Viewer";
}

function getPageBodyPlaceholder(page: WorkspacePageRecord): string {
  const title = cleanText(page.draftTitle) || "This page";
  return `${title} was created live in ServiceNow. Body persistence is deferred in this slice.`;
}

export function buildWorkspaceShellPage(page: WorkspacePageRecord): DemoPage {
  return {
    id: cleanText(page.sysId) || `${cleanText(page.workspaceSysId)}:${cleanText(page.draftSlug)}`,
    title: cleanText(page.draftTitle) || "New page",
    slug: cleanText(page.draftSlug),
    body: cleanText(page.draftBodyText) || getPageBodyPlaceholder(page),
    sections: []
  };
}

export function buildWorkspaceShellWorkspace(workspace: WorkspaceViewRecord, pages: DemoPage[] = demoWorkspace.pages): DemoWorkspace {
  const title = cleanText(workspace.name) || "Workspace";
  const iconLabel = cleanText(workspace.icon?.label) || title.charAt(0).toUpperCase();

  return {
    ...demoWorkspace,
    title,
    iconLabel,
    homeLabel: title,
    roleLabel: getWorkspaceRoleLabel(workspace),
    canManageSettings: Boolean(workspace.canManageSettings),
    pages
  };
}
