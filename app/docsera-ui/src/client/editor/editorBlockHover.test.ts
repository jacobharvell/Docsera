import { describe, expect, it } from "vitest";
import { resolveHoverTargetBlockIndex } from "./editorBlockHover";

const blockRects = [
  {
    top: 100,
    bottom: 140,
    left: 132,
    right: 752
  },
  {
    top: 180,
    bottom: 220,
    left: 132,
    right: 752
  },
  {
    top: 264,
    bottom: 304,
    left: 132,
    right: 752
  }
];

describe("resolveHoverTargetBlockIndex", () => {
  it("targets the containing block when the pointer is inside the rendered row", () => {
    expect(resolveHoverTargetBlockIndex(blockRects, { clientX: 220, clientY: 120 })).toBe(0);
    expect(resolveHoverTargetBlockIndex(blockRects, { clientX: 70, clientY: 120 })).toBe(0);
    expect(resolveHoverTargetBlockIndex(blockRects, { clientX: 100, clientY: 120 })).toBe(0);
    expect(resolveHoverTargetBlockIndex(blockRects, { clientX: 126, clientY: 120 })).toBe(0);
  });

  it("keeps ownership while the pointer moves from content into the block-owned gutter lane", () => {
    expect(resolveHoverTargetBlockIndex(blockRects, { clientX: 84, clientY: 200 })).toBe(1);
  });

  it("uses a stable midpoint boundary between adjacent blocks", () => {
    const midpoint = blockRects[0].bottom + (blockRects[1].top - blockRects[0].bottom) / 2;
    expect(resolveHoverTargetBlockIndex(blockRects, { clientX: 220, clientY: midpoint - 1 })).toBe(0);
    expect(resolveHoverTargetBlockIndex(blockRects, { clientX: 220, clientY: midpoint })).toBe(1);
    expect(resolveHoverTargetBlockIndex(blockRects, { clientX: 220, clientY: midpoint + 1 })).toBe(1);
  });

  it("ignores blank space above the first block and below the final block", () => {
    expect(resolveHoverTargetBlockIndex(blockRects, { clientX: 220, clientY: 99 })).toBeNull();
    expect(resolveHoverTargetBlockIndex(blockRects, { clientX: 220, clientY: 100 })).toBe(0);
    expect(resolveHoverTargetBlockIndex(blockRects, { clientX: 220, clientY: 304 })).toBe(2);
    expect(resolveHoverTargetBlockIndex(blockRects, { clientX: 220, clientY: 305 })).toBeNull();
  });

  it("resolves nested descendants such as in-block tables to the top-level block that owns their geometry", () => {
    expect(resolveHoverTargetBlockIndex(blockRects, { clientX: 260, clientY: 200 })).toBe(1);
  });

  it("returns null after leaving the block-owned row", () => {
    expect(resolveHoverTargetBlockIndex(blockRects, { clientX: 40, clientY: 180 })).toBeNull();
    expect(resolveHoverTargetBlockIndex(blockRects, { clientX: 780, clientY: 180 })).toBeNull();
    expect(resolveHoverTargetBlockIndex(blockRects, { clientX: 220, clientY: 620 })).toBeNull();
  });
});
