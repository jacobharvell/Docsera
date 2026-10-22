import { parseDocseraDocument, type DocseraDocumentEnvelope } from "../../../shared/editor/document";
import { extractDocumentOutline, type EditorOutlineItem } from "../../editor/documentOutline";
import type {
  PagePublicationState,
  WorkspaceMode,
  WorkspacePageRecord,
  WorkspaceViewRecord
} from "../../shared/types/docsera";
import { normalizeNumericSiblingOrder } from "../../../shared/pages/siblingOrder";

export type WorkspacePageOutlineItem = EditorOutlineItem;

export type WorkspacePageView = {
  children?: WorkspacePageView[];
  contentEnvelope: DocseraDocumentEnvelope | null;
  contentError: string;
  contentState: "invalid" | "missing" | "ready";
  id: string;
  isDraftOnly: boolean;
  page: WorkspacePageRecord;
  publicationState: PagePublicationState;
  slug: string;
  statusIndicator: "Draft" | "Unpublished" | null;
  siblingOrder: number;
  sysId: string;
  title: string;
  tocItems: WorkspacePageOutlineItem[];
  parentPageSysId: string | null;
};

export type WorkspaceShellViewModel = {
  canManageSettings: boolean;
  icon: WorkspaceViewRecord["icon"];
  roleLabel: string;
  title: string;
};

type TreeNode = {
  children: TreeNode[];
  key: string;
  page: WorkspacePageView;
  parentKey: string;
  siblingOrder: number;
  slug: string;
  title: string;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function resolvePageContentState(content: unknown): Pick<WorkspacePageView, "contentEnvelope" | "contentError" | "contentState" | "tocItems"> {
  if (content === null || content === undefined || content === "") {
    return {
      contentEnvelope: null,
      contentError: "The current page content is unavailable.",
      contentState: "missing",
      tocItems: []
    };
  }

  const parsed = parseDocseraDocument(content);
  if (!parsed.ok) {
    return {
      contentEnvelope: null,
      contentError: parsed.message,
      contentState: "invalid",
      tocItems: []
    };
  }

  return {
      contentEnvelope: parsed.envelope,
      contentError: "",
      contentState: "ready",
      tocItems: extractDocumentOutline(parsed.envelope)
    };
  }

export function getWorkspaceRoleLabel(workspace: WorkspaceViewRecord | null | undefined): string {
  return workspace?.roleLabel ?? "Viewer";
}

export function buildWorkspaceShellViewModel(workspace: WorkspaceViewRecord): WorkspaceShellViewModel {
  return {
    canManageSettings: Boolean(workspace.canManageSettings),
    icon: workspace.icon,
    roleLabel: getWorkspaceRoleLabel(workspace),
    title: cleanText(workspace.name) || "Workspace"
  };
}

export function buildWorkspacePageView(
  page: WorkspacePageRecord,
  mode: WorkspaceMode,
  contentState = resolvePageContentState(page.draftContentJson)
): WorkspacePageView {
  const sysId = cleanText(page.sysId) || `${cleanText(page.workspaceSysId)}:${cleanText(page.draftSlug)}`;
  const title = cleanText(page.draftTitle) || "Untitled page";
  const slug = cleanText(page.draftSlug);
  const isDraftOnly = page.publicationState === "draft";

  return {
    ...contentState,
    id: sysId,
    isDraftOnly,
    page,
    parentPageSysId: cleanText(page.parentPageSysId) || null,
    publicationState: page.publicationState,
    siblingOrder: normalizeNumericSiblingOrder(page.siblingOrder),
    slug,
    statusIndicator:
      mode === "edit"
        ? page.publicationState === "draft"
          ? "Draft"
          : page.publicationState === "published_with_unpublished_changes"
            ? "Unpublished"
            : null
        : null,
    sysId,
    title,
    tocItems: contentState.tocItems
  };
}

export function buildWorkspacePageTree(pages: WorkspacePageRecord[], mode: WorkspaceMode): WorkspacePageView[] {
  const nodesByKey = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  pages.forEach((page, index) => {
    const viewPage = buildWorkspacePageView(page, mode, {
      contentEnvelope: null, contentError: "", contentState: "missing", tocItems: []
    });
    const key = viewPage.sysId || `${cleanText(page.workspaceSysId)}:${cleanText(page.draftSlug)}:${index}`;
    nodesByKey.set(key, {
      children: [],
      key,
      page: viewPage,
      parentKey: cleanText(page.parentPageSysId),
      siblingOrder: viewPage.siblingOrder,
      slug: viewPage.slug,
      title: viewPage.title
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

    nodes.forEach((node) => sortNodes(node.children));
  };

  sortNodes(roots);
  const visited = new Set<string>();

  const buildTreePage = (node: TreeNode): WorkspacePageView => {
    if (visited.has(node.key)) {
      return node.page;
    }

    visited.add(node.key);
    return {
      ...node.page,
      ...(node.children.length > 0
        ? {
            children: node.children.map((child) => buildTreePage(child))
          }
        : {})
    };
  };

  const treePages = roots.map((root) => buildTreePage(root));
  const remaining = [...nodesByKey.values()]
    .filter((node) => !visited.has(node.key))
    .sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: "base" }));

  return [...treePages, ...remaining.map((node) => buildTreePage(node))];
}
