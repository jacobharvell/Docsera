export type EditorBlockHoverRect = {
  bottom: number;
  left: number;
  right: number;
  top: number;
};

export type EditorBlockHoverPoint = {
  clientX: number;
  clientY: number;
};

function isPointInsideRect(rect: EditorBlockHoverRect, point: EditorBlockHoverPoint): boolean {
  return (
    point.clientX >= rect.left &&
    point.clientX <= rect.right &&
    point.clientY >= rect.top &&
    point.clientY <= rect.bottom
  );
}

export function resolveHoverTargetBlockIndex(
  surfaceRect: EditorBlockHoverRect,
  blockRects: EditorBlockHoverRect[],
  point: EditorBlockHoverPoint
): number | null {
  if (!blockRects.length || !isPointInsideRect(surfaceRect, point)) {
    return null;
  }

  let targetIndex = blockRects.length - 1;
  for (let index = 0; index < blockRects.length; index += 1) {
    const currentRect = blockRects[index];
    const nextRect = blockRects[index + 1] ?? null;
    const boundary = nextRect ? currentRect.bottom + (nextRect.top - currentRect.bottom) / 2 : Number.POSITIVE_INFINITY;
    if (point.clientY < boundary) {
      targetIndex = index;
      break;
    }
  }

  return targetIndex;
}
