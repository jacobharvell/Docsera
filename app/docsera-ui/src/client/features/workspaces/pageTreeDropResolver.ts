import type { WorkspacePageView } from "./workspaceViewModels";

export type PageTreeDropPosition = "before" | "after" | "inside";

export type PageTreeDropDestination = {
  pageSysId: string;
  parentPageSysId: string | null;
  position: PageTreeDropPosition;
  siblingOrder: string;
  targetPageId: string;
};

export type PageTreeDropResolverInput = {
  draggedPageId: string;
  pagesById: ReadonlyMap<string, WorkspacePageView>;
  pagesByParent: ReadonlyMap<string, WorkspacePageView[]>;
  position: PageTreeDropPosition;
  targetPageId: string;
};

function pageContainsTarget(page: WorkspacePageView, targetPageId: string): boolean {
  return page.id === targetPageId || Boolean(page.children?.some((child) => pageContainsTarget(child, targetPageId)));
}

function pageDepth(pageId: string | null, pagesById: ReadonlyMap<string, WorkspacePageView>): number {
  if (!pageId) {
    return 0;
  }

  const page = pagesById.get(pageId);
  return page ? pageDepth(page.parentPageSysId, pagesById) + 1 : 0;
}

function subtreeHeight(page: WorkspacePageView): number {
  const childHeights = (page.children ?? []).map(subtreeHeight);
  return 1 + (childHeights.length ? Math.max(...childHeights) : 0);
}

function rankBetween(previous: number | null, next: number | null): string {
  if (previous === null && next === null) {
    return "1";
  }
  if (previous === null) {
    return String((next ?? 1) - 1);
  }
  if (next === null) {
    return String(previous + 1);
  }
  return String((previous + next) / 2);
}

function movementRankForSiblingDrop(input: {
  draggedPageId: string;
  parentPageSysId: string | null;
  pagesByParent: ReadonlyMap<string, WorkspacePageView[]>;
  position: "before" | "after";
  targetPageId: string;
}): string {
  const parentKey = input.parentPageSysId ?? "";
  const siblings = (input.pagesByParent.get(parentKey) ?? []).filter((page) => page.id !== input.draggedPageId);
  const targetIndex = siblings.findIndex((page) => page.id === input.targetPageId);
  if (targetIndex < 0) {
    return "1";
  }

  if (input.position === "before") {
    return rankBetween(siblings[targetIndex - 1]?.siblingOrder ?? null, siblings[targetIndex]?.siblingOrder ?? null);
  }

  return rankBetween(siblings[targetIndex]?.siblingOrder ?? null, siblings[targetIndex + 1]?.siblingOrder ?? null);
}

function movementRankForChildDrop(
  parentPageId: string,
  pagesByParent: ReadonlyMap<string, WorkspacePageView[]>,
  draggedPageId: string
): string {
  const children = (pagesByParent.get(parentPageId) ?? []).filter((page) => page.id !== draggedPageId);
  const lastOrder = children.length ? children[children.length - 1]?.siblingOrder ?? null : null;
  return rankBetween(lastOrder, null);
}

export function resolvePageTreeDropDestination(input: PageTreeDropResolverInput): PageTreeDropDestination | null {
  const { draggedPageId, pagesById, pagesByParent, position, targetPageId } = input;
  const draggedPage = pagesById.get(draggedPageId);
  const targetPage = pagesById.get(targetPageId);
  if (!draggedPage || !targetPage || draggedPage.id === targetPage.id || pageContainsTarget(draggedPage, targetPage.id)) {
    return null;
  }

  const parentPageSysId = position === "inside" ? targetPage.id : targetPage.parentPageSysId;
  const parentDepth = pageDepth(parentPageSysId, pagesById);
  if (parentDepth + subtreeHeight(draggedPage) > 6) {
    return null;
  }

  const siblingOrder =
    position === "inside"
      ? movementRankForChildDrop(targetPage.id, pagesByParent, draggedPage.id)
      : movementRankForSiblingDrop({
          draggedPageId: draggedPage.id,
          parentPageSysId,
          pagesByParent,
          position,
          targetPageId: targetPage.id
        });

  if (draggedPage.parentPageSysId === parentPageSysId && String(draggedPage.siblingOrder) === siblingOrder) {
    return null;
  }

  return {
    pageSysId: draggedPage.id,
    parentPageSysId,
    position,
    siblingOrder,
    targetPageId: targetPage.id
  };
}
