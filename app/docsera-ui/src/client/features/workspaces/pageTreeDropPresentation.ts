import type { PageTreeDropGeometryRow } from "./pageTreeDropGeometry";
import { resolvePageTreeDropDestination, type PageTreeDropDestination } from "./pageTreeDropResolver";
import type { WorkspacePageView } from "./workspaceViewModels";

export type PageTreeDropPresentationAnchor = Pick<PageTreeDropDestination, "position" | "targetPageId">;

export type PageTreeDropPresentationInput = {
  destination: PageTreeDropDestination;
  draggedPageId: string;
  pagesById: ReadonlyMap<string, WorkspacePageView>;
  pagesByParent: ReadonlyMap<string, WorkspacePageView[]>;
  rows: ReadonlyArray<PageTreeDropGeometryRow>;
};

function sameMovementInput(left: PageTreeDropDestination, right: PageTreeDropDestination): boolean {
  return (
    left.pageSysId === right.pageSysId &&
    left.parentPageSysId === right.parentPageSysId &&
    left.siblingOrder === right.siblingOrder
  );
}

export function resolvePageTreeDropPresentationAnchor(input: PageTreeDropPresentationInput): PageTreeDropPresentationAnchor {
  const defaultAnchor: PageTreeDropPresentationAnchor = {
    position: input.destination.position,
    targetPageId: input.destination.targetPageId
  };

  if (input.destination.position !== "after") {
    return defaultAnchor;
  }

  const targetPage = input.pagesById.get(input.destination.targetPageId);
  if (!targetPage) {
    return defaultAnchor;
  }

  const rows = [...input.rows].sort((left, right) => left.top - right.top || left.bottom - right.bottom);
  const targetRowIndex = rows.findIndex((row) => row.pageId === targetPage.id);
  if (targetRowIndex < 0) {
    return defaultAnchor;
  }

  const lowerPeerRow = rows[targetRowIndex + 1];
  if (!lowerPeerRow) {
    return defaultAnchor;
  }

  const lowerPeerPage = input.pagesById.get(lowerPeerRow.pageId);
  if (!lowerPeerPage || lowerPeerPage.parentPageSysId !== targetPage.parentPageSysId) {
    return defaultAnchor;
  }

  const alternateDestination = resolvePageTreeDropDestination({
    draggedPageId: input.draggedPageId,
    pagesById: input.pagesById,
    pagesByParent: input.pagesByParent,
    position: "before",
    targetPageId: lowerPeerPage.id
  });
  if (!alternateDestination || !sameMovementInput(input.destination, alternateDestination)) {
    return defaultAnchor;
  }

  return {
    position: "before",
    targetPageId: lowerPeerPage.id
  };
}
