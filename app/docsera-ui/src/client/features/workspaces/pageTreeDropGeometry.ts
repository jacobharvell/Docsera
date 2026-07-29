import type { PageTreeDropPosition } from "./pageTreeDropResolver";

export type PageTreeDropGeometryRow = {
  bottom: number;
  depth: number;
  pageId: string;
  top: number;
};

export type PageTreeDropGeometryEdgeZone = {
  bottom: number;
  pageId: string;
  top: number;
};

export type PageTreeDropGeometryInput = {
  bottomEdgeZone?: PageTreeDropGeometryEdgeZone | null;
  pointerY: number;
  rows: ReadonlyArray<PageTreeDropGeometryRow>;
  topEdgeZone?: PageTreeDropGeometryEdgeZone | null;
};

export type PageTreeDropGeometryCandidate = {
  edge: "top" | "bottom" | null;
  position: PageTreeDropPosition;
  targetPageId: string;
};

function resolveRowPosition(pointerY: number, row: PageTreeDropGeometryRow): PageTreeDropPosition {
  const height = Math.max(1, row.bottom - row.top);
  const offset = pointerY - row.top;

  if (offset <= height / 3) {
    return "before";
  }

  if (offset >= (height * 2) / 3) {
    return "after";
  }

  return "inside";
}

export function resolvePageTreeDropGeometry(input: PageTreeDropGeometryInput): PageTreeDropGeometryCandidate | null {
  const rows = [...input.rows].sort((left, right) => left.top - right.top || left.bottom - right.bottom);
  if (rows.length === 0) {
    return null;
  }

  const topEdgeZone = input.topEdgeZone;
  if (topEdgeZone && input.pointerY >= topEdgeZone.top && input.pointerY <= topEdgeZone.bottom) {
    return {
      edge: "top",
      position: "before",
      targetPageId: topEdgeZone.pageId
    };
  }

  const bottomEdgeZone = input.bottomEdgeZone;
  if (bottomEdgeZone && input.pointerY >= bottomEdgeZone.top && input.pointerY <= bottomEdgeZone.bottom) {
    return {
      edge: "bottom",
      position: "after",
      targetPageId: bottomEdgeZone.pageId
    };
  }

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    if (input.pointerY >= row.top && input.pointerY <= row.bottom) {
      return {
        edge: null,
        position: resolveRowPosition(input.pointerY, row),
        targetPageId: row.pageId
      };
    }

    const nextRow = rows[index + 1];
    if (!nextRow) {
      continue;
    }

    if (input.pointerY > row.bottom && input.pointerY < nextRow.top) {
      const midpoint = row.bottom + (nextRow.top - row.bottom) / 2;
      return {
        edge: null,
        position: input.pointerY <= midpoint ? "after" : "before",
        targetPageId: input.pointerY <= midpoint ? row.pageId : nextRow.pageId
      };
    }
  }

  return null;
}
