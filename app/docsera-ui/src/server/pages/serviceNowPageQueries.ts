import { GlideRecord } from "@servicenow/glide";
import { DOCSERA_PAGE_TABLE, type PageRecord } from "./serverPageDomain.ts";
import { DOCSERA_WORKSPACE_TABLE, type WorkspaceRecord } from "../workspaces/serverWorkspaceDomain.ts";
import { mapPageRecord } from "./serviceNowPageRecords.ts";
import { mapWorkspaceRecord } from "../workspaces/serviceNowWorkspaceRecords.ts";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function comparePageRecords(left: PageRecord, right: PageRecord): number {
  if (left.siblingOrder !== right.siblingOrder) {
    return left.siblingOrder - right.siblingOrder;
  }

  const titleComparison = cleanText(left.draftTitle).localeCompare(cleanText(right.draftTitle), undefined, {
    sensitivity: "base"
  });
  if (titleComparison !== 0) {
    return titleComparison;
  }

  const slugComparison = cleanText(left.draftSlug).localeCompare(cleanText(right.draftSlug), undefined, {
    sensitivity: "base"
  });
  if (slugComparison !== 0) {
    return slugComparison;
  }

  return cleanText(left.sysId).localeCompare(cleanText(right.sysId), undefined, { sensitivity: "base" });
}

export function loadWorkspaceBySlug(workspaceSlug: string): WorkspaceRecord | null {
  const slug = cleanText(workspaceSlug);
  if (!slug) {
    return null;
  }

  const record = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
  record.addQuery("workspace_slug", slug);
  record.addQuery("status", "active");
  record.setLimit(1);
  record.query();

  if (!record.next()) {
    return null;
  }

  return mapWorkspaceRecord(record);
}

export function sortPageRecordsForTree(records: PageRecord[]): PageRecord[] {
  type TreeNode = {
    key: string;
    page: PageRecord;
    children: TreeNode[];
  };

  const nodesByKey = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  records.forEach((page, index) => {
    const key = cleanText(page.sysId) || `${cleanText(page.workspaceSysId)}:${cleanText(page.draftSlug)}:${index}`;
    nodesByKey.set(key, {
      key,
      page,
      children: []
    });
  });

  for (const node of nodesByKey.values()) {
    const parentKey = cleanText(node.page.parentPageSysId);
    const parentNode = parentKey ? nodesByKey.get(parentKey) : null;

    if (parentNode && parentNode.key !== node.key) {
      parentNode.children.push(node);
      continue;
    }

    roots.push(node);
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((left, right) => comparePageRecords(left.page, right.page));
    for (const node of nodes) {
      sortNodes(node.children);
    }
  };

  sortNodes(roots);

  const ordered: PageRecord[] = [];
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
  remaining.sort((left, right) => comparePageRecords(left.page, right.page));

  for (const node of remaining) {
    visit(node);
  }

  return ordered;
}

export function listWorkspacePages(workspaceSysId: string, options: { activeOnly?: boolean } = {}): Promise<PageRecord[]> {
  const sysId = cleanText(workspaceSysId);
  const pages = new GlideRecord(DOCSERA_PAGE_TABLE);
  pages.addQuery("workspace", sysId);

  if (options.activeOnly) {
    pages.addQuery("active", "true");
  }

  pages.query();

  const results: PageRecord[] = [];
  while (pages.next()) {
    results.push(mapPageRecord(pages));
  }

  return Promise.resolve(sortPageRecordsForTree(results));
}
