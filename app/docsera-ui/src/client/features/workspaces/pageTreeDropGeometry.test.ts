import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import {
  resolvePageTreeDropGeometry,
  type PageTreeDropGeometryEdgeZone,
  type PageTreeDropGeometryRow
} from "./pageTreeDropGeometry";

function row(pageId: string, top: number, bottom: number, depth = 0): PageTreeDropGeometryRow {
  return { bottom, depth, pageId, top };
}

function edge(pageId: string, top: number, bottom: number): PageTreeDropGeometryEdgeZone {
  return { bottom, pageId, top };
}

function resolve(
  pointerY: number,
  rows: PageTreeDropGeometryRow[],
  topEdgeZone?: PageTreeDropGeometryEdgeZone | null,
  bottomEdgeZone?: PageTreeDropGeometryEdgeZone | null
) {
  return resolvePageTreeDropGeometry({
    bottomEdgeZone,
    pointerY,
    rows,
    topEdgeZone
  });
}

describe("pageTreeDropGeometry", () => {
  it("splits root sibling gaps at the midpoint", () => {
    const rows = [row("root-a", 0, 30), row("root-b", 34, 64)];

    expect(resolve(31, rows)).toMatchObject({ position: "after", targetPageId: "root-a" });
    expect(resolve(33, rows)).toMatchObject({ position: "before", targetPageId: "root-b" });
  });

  it("splits nested sibling gaps at the midpoint", () => {
    const rows = [row("nested-a", 0, 30, 1), row("nested-b", 34, 64, 1)];

    expect(resolve(31, rows)).toMatchObject({ position: "after", targetPageId: "nested-a" });
    expect(resolve(33, rows)).toMatchObject({ position: "before", targetPageId: "nested-b" });
  });

  it("splits the parent-to-first-child gap at the midpoint", () => {
    const rows = [row("parent", 0, 30, 0), row("child", 34, 64, 1)];

    expect(resolve(31, rows)).toMatchObject({ position: "after", targetPageId: "parent" });
    expect(resolve(33, rows)).toMatchObject({ position: "before", targetPageId: "child" });
  });

  it("splits the final descendant-to-next-root gap at the midpoint", () => {
    const rows = [row("descendant", 0, 30, 2), row("next-root", 34, 64, 0)];

    expect(resolve(31, rows)).toMatchObject({ position: "after", targetPageId: "descendant" });
    expect(resolve(33, rows)).toMatchObject({ position: "before", targetPageId: "next-root" });
  });

  it("resolves the virtual top destination before the first root page", () => {
    const rows = [row("first-root", 30, 60)];

    expect(resolve(0, rows, edge("first-root", 0, 30))).toMatchObject({
      edge: "top",
      position: "before",
      targetPageId: "first-root"
    });
    expect(resolve(0.25, rows, edge("first-root", 0, 30))).toMatchObject({
      edge: "top",
      position: "before",
      targetPageId: "first-root"
    });
    expect(resolve(29.25, rows, edge("first-root", 0, 30))).toMatchObject({
      edge: "top",
      position: "before",
      targetPageId: "first-root"
    });
    expect(resolve(29.75, rows, edge("first-root", 0, 30))).toMatchObject({
      edge: "top",
      position: "before",
      targetPageId: "first-root"
    });
    expect(resolve(30, rows, edge("first-root", 0, 30))).toMatchObject({
      edge: "top",
      position: "before",
      targetPageId: "first-root"
    });
  });

  it("resolves the virtual bottom destination after the final root page", () => {
    const rows = [row("final-root", 0, 30)];

    expect(resolve(30, rows, null, edge("final-root", 30, 64))).toMatchObject({
      edge: "bottom",
      position: "after",
      targetPageId: "final-root"
    });
    expect(resolve(30.25, rows, null, edge("final-root", 30, 64))).toMatchObject({
      edge: "bottom",
      position: "after",
      targetPageId: "final-root"
    });
    expect(resolve(63.75, rows, null, edge("final-root", 30, 64))).toMatchObject({
      edge: "bottom",
      position: "after",
      targetPageId: "final-root"
    });
    expect(resolve(64, rows, null, edge("final-root", 30, 64))).toMatchObject({
      edge: "bottom",
      position: "after",
      targetPageId: "final-root"
    });
  });

  it("keeps the bottom destination root-level when the final root page has visible descendants", () => {
    const rows = [row("final-root", 0, 30), row("final-child", 34, 64, 1)];

    expect(resolve(63.75, rows, null, edge("final-root", 64, 98))).toMatchObject({
      edge: null,
      position: "after",
      targetPageId: "final-child"
    });
    expect(resolve(64, rows, null, edge("final-root", 64, 98))).toMatchObject({
      edge: "bottom",
      position: "after",
      targetPageId: "final-root"
    });
    expect(resolve(64.25, rows, null, edge("final-root", 64, 98))).toMatchObject({
      edge: "bottom",
      position: "after",
      targetPageId: "final-root"
    });
  });

  it("covers every vertical point across rows, gaps, and virtual edge regions without null seams", () => {
    const rows = [row("first-root", 30, 60), row("child", 64, 94, 1), row("last-root", 98, 128)];
    const topEdgeZone = edge("first-root", 0, 30);
    const bottomEdgeZone = edge("last-root", 128, 161);

    expect(resolve(30, rows, topEdgeZone, bottomEdgeZone)).toMatchObject({
      edge: "top",
      position: "before",
      targetPageId: "first-root"
    });
    expect(resolve(40, rows, topEdgeZone, bottomEdgeZone)).toMatchObject({
      edge: null,
      position: "before",
      targetPageId: "first-root"
    });
    expect(resolve(50, rows, topEdgeZone, bottomEdgeZone)).toMatchObject({
      edge: null,
      position: "after",
      targetPageId: "first-root"
    });
    expect(resolve(60, rows, topEdgeZone, bottomEdgeZone)).toMatchObject({
      edge: null,
      position: "after",
      targetPageId: "first-root"
    });
    expect(resolve(60.25, rows, topEdgeZone, bottomEdgeZone)).toMatchObject({
      edge: null,
      position: "after",
      targetPageId: "first-root"
    });
    expect(resolve(63.75, rows, topEdgeZone, bottomEdgeZone)).toMatchObject({
      edge: null,
      position: "before",
      targetPageId: "child"
    });
    expect(resolve(64, rows, topEdgeZone, bottomEdgeZone)).toMatchObject({
      edge: null,
      position: "before",
      targetPageId: "child"
    });
    expect(resolve(94, rows, topEdgeZone, bottomEdgeZone)).toMatchObject({
      edge: null,
      position: "after",
      targetPageId: "child"
    });
    expect(resolve(98, rows, topEdgeZone, bottomEdgeZone)).toMatchObject({
      edge: null,
      position: "before",
      targetPageId: "last-root"
    });
    expect(resolve(127.75, rows, topEdgeZone, bottomEdgeZone)).toMatchObject({
      edge: null,
      position: "after",
      targetPageId: "last-root"
    });
    expect(resolve(128, rows, topEdgeZone, bottomEdgeZone)).toMatchObject({
      edge: "bottom",
      position: "after",
      targetPageId: "last-root"
    });
    expect(resolve(128.25, rows, topEdgeZone, bottomEdgeZone)).toMatchObject({
      edge: "bottom",
      position: "after",
      targetPageId: "last-root"
    });
    expect(resolve(161, rows, topEdgeZone, bottomEdgeZone)).toMatchObject({
      edge: "bottom",
      position: "after",
      targetPageId: "last-root"
    });

    for (let pointerY = 0; pointerY <= 161; pointerY += 0.25) {
      expect(resolve(pointerY, rows, topEdgeZone, bottomEdgeZone)).not.toBeNull();
    }
  });
});
