import { describe, expect, it } from "vitest";
import { resolveHoverTargetBlockIndex } from "./editorBlockHover";

const surfaceRect = {
  top: 36,
  bottom: 576,
  left: 72,
  right: 832
};

const blockRects = [
  {
    top: 52,
    bottom: 104,
    left: 132,
    right: 752
  },
  {
    top: 132,
    bottom: 204,
    left: 132,
    right: 752
  },
  {
    top: 238,
    bottom: 248,
    left: 132,
    right: 752
  }
];

describe("resolveHoverTargetBlockIndex", () => {
  it("targets the containing block when the pointer is inside block content", () => {
    expect(resolveHoverTargetBlockIndex(surfaceRect, blockRects, { clientX: 220, clientY: 72 })).toBe(0);
  });

  it("keeps ownership while the pointer moves from content into the host-owned gutter lane", () => {
    expect(resolveHoverTargetBlockIndex(surfaceRect, blockRects, { clientX: 84, clientY: 164 })).toBe(1);
  });

  it("uses a stable midpoint boundary between adjacent blocks", () => {
    const midpoint = blockRects[0].bottom + (blockRects[1].top - blockRects[0].bottom) / 2;
    expect(resolveHoverTargetBlockIndex(surfaceRect, blockRects, { clientX: 220, clientY: midpoint - 1 })).toBe(0);
    expect(resolveHoverTargetBlockIndex(surfaceRect, blockRects, { clientX: 220, clientY: midpoint })).toBe(1);
  });

  it("targets the first block above the first block and the final block below the final block", () => {
    expect(resolveHoverTargetBlockIndex(surfaceRect, blockRects, { clientX: 220, clientY: 40 })).toBe(0);
    expect(resolveHoverTargetBlockIndex(surfaceRect, blockRects, { clientX: 220, clientY: 420 })).toBe(2);
  });

  it("resolves nested content to the top-level block that owns its geometry", () => {
    expect(resolveHoverTargetBlockIndex(surfaceRect, blockRects, { clientX: 260, clientY: 176 })).toBe(1);
  });

  it("returns null after leaving the usable editor lane", () => {
    expect(resolveHoverTargetBlockIndex(surfaceRect, blockRects, { clientX: 40, clientY: 132 })).toBeNull();
    expect(resolveHoverTargetBlockIndex(surfaceRect, blockRects, { clientX: 220, clientY: 600 })).toBeNull();
  });
});
