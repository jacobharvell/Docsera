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
  return `${title} does not have a saved draft body yet.`;
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

export function buildWorkspaceShellPages(pages: WorkspacePageRecord[]): DemoPage[] {
  type TreeNode = {
    key: string;
    page: DemoPage;
    children: TreeNode[];
    parentKey: string;
    siblingOrder: number;
    title: string;
    slug: string;
  };

  const nodesByKey = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  pages.forEach((page, index) => {
    const key = cleanText(page.sysId) || `${cleanText(page.workspaceSysId)}:${cleanText(page.draftSlug)}:${index}`;
    nodesByKey.set(key, {
      key,
      page: buildWorkspaceShellPage(page),
      children: [],
      parentKey: cleanText(page.parentPageSysId),
      siblingOrder: Number(page.siblingOrder) || 1,
      title: cleanText(page.draftTitle) || "New page",
      slug: cleanText(page.draftSlug)
    });
  });

  for (const node of nodesByKey.values()) {
    const parentNode = node.parentKey ? nodesByKey.get(node.parentKey) : null;
    if (parentNode && parentNode.key !== node.key) {
      parentNode.children.push(node);
      continue;
    }

    roots.push(node);
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((left, right) => {
      if (left.siblingOrder !== right.siblingOrder) {
        return left.siblingOrder - right.siblingOrder;
      }

      const titleComparison = left.title.localeCompare(right.title, undefined, { sensitivity: "base" });
      if (titleComparison !== 0) {
        return titleComparison;
      }

      const slugComparison = left.slug.localeCompare(right.slug, undefined, { sensitivity: "base" });
      if (slugComparison !== 0) {
        return slugComparison;
      }

      return left.key.localeCompare(right.key, undefined, { sensitivity: "base" });
    });

    for (const node of nodes) {
      sortNodes(node.children);
    }
  };

  sortNodes(roots);

  const ordered: DemoPage[] = [];
  const visited = new Set<string>();

  const visit = (node: TreeNode) => {
    if (visited.has(node.key)) {
      return;
    }

    visited.add(node.key);
    ordered.push(node.page);

    for (const child of node.children) {
      visit(child);
    }
  };

  for (const root of roots) {
    visit(root);
  }

  const remaining = [...nodesByKey.values()].filter((node) => !visited.has(node.key));
  remaining.sort((left, right) => left.page.title.localeCompare(right.page.title, undefined, { sensitivity: "base" }));
  for (const node of remaining) {
    visit(node);
  }

  return ordered;
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
