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

const DEFAULT_BLOCK_GUTTER_WIDTH = 69;

function isPointInsideRect(rect: EditorBlockHoverRect, point: EditorBlockHoverPoint): boolean {
  return (
    point.clientX >= rect.left &&
    point.clientX <= rect.right &&
    point.clientY >= rect.top &&
    point.clientY <= rect.bottom
  );
}

export function resolveHoverTargetBlockIndex(
  blockRects: EditorBlockHoverRect[],
  point: EditorBlockHoverPoint,
  blockGutterWidth: number = DEFAULT_BLOCK_GUTTER_WIDTH
): number | null {
  if (!blockRects.length) {
    return null;
  }

  for (let index = 0; index < blockRects.length; index += 1) {
    const currentRect = blockRects[index];
    const previousRect = blockRects[index - 1] ?? null;
    const nextRect = blockRects[index + 1] ?? null;
    const rowTop = previousRect ? previousRect.bottom + (currentRect.top - previousRect.bottom) / 2 : currentRect.top;
    const rowBottom = nextRect ? currentRect.bottom + (nextRect.top - currentRect.bottom) / 2 : currentRect.bottom;
    const rowLeft = currentRect.left - blockGutterWidth;
    const rowRight = currentRect.right;
    const isInsideRow =
      point.clientX >= rowLeft &&
      point.clientX <= rowRight &&
      point.clientY >= rowTop &&
      (nextRect ? point.clientY < rowBottom : point.clientY <= rowBottom);

    if (isInsideRow) {
      return index;
    }
  }

  return null;
}
