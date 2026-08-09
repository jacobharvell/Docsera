export type EditorAutoScrollViewport = {
  element: HTMLElement | null;
  rect: DOMRect;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  scrollBy: (deltaY: number) => void;
};

export type EditorAutoScrollRequest = {
  deltaY: number;
  direction: "down" | "none" | "up";
};

type EditorAutoScrollSessionInput = {
  getPointerY: () => number | null;
  getTopClearancePx?: () => number;
  getViewport: () => EditorAutoScrollViewport | null;
  onScroll: () => void;
  ownerWindow: Window | null;
};

export const EDITOR_AUTO_SCROLL_EDGE_ZONE_PX = 72;
export const EDITOR_AUTO_SCROLL_MAX_DELTA_PX = 18;

export function resolveEditorAutoScrollRequest(
  viewport: EditorAutoScrollViewport,
  pointerClientY: number,
  input: {
    edgeZonePx?: number;
    maxDeltaPx?: number;
    topClearancePx?: number;
  } = {}
): EditorAutoScrollRequest {
  const edgeZonePx = Math.max(1, input.edgeZonePx ?? EDITOR_AUTO_SCROLL_EDGE_ZONE_PX);
  const maxDeltaPx = Math.max(1, input.maxDeltaPx ?? EDITOR_AUTO_SCROLL_MAX_DELTA_PX);
  const topClearancePx = Math.max(0, input.topClearancePx ?? 0);
  const viewportTop = Math.max(viewport.rect.top, topClearancePx);
  const viewportBottom = viewport.rect.bottom;
  const maxScrollTop = Math.max(0, viewport.scrollHeight - viewport.clientHeight);

  if (viewportBottom <= viewportTop || maxScrollTop <= 0) {
    return { deltaY: 0, direction: "none" };
  }

  if (pointerClientY < viewportTop + edgeZonePx) {
    const proximity = Math.max(0, Math.min(1, (viewportTop + edgeZonePx - pointerClientY) / edgeZonePx));
    const requestedDelta = -resolveAcceleratedAutoScrollDelta(proximity, maxDeltaPx);
    const deltaY = Math.max(-viewport.scrollTop, requestedDelta);
    return {
      deltaY: Object.is(deltaY, -0) ? 0 : deltaY,
      direction: "up"
    };
  }

  if (pointerClientY > viewportBottom - edgeZonePx) {
    const proximity = Math.max(0, Math.min(1, (pointerClientY - (viewportBottom - edgeZonePx)) / edgeZonePx));
    const requestedDelta = resolveAcceleratedAutoScrollDelta(proximity, maxDeltaPx);
    const deltaY = Math.min(maxScrollTop - viewport.scrollTop, requestedDelta);
    return {
      deltaY: Object.is(deltaY, -0) ? 0 : deltaY,
      direction: "down"
    };
  }

  return { deltaY: 0, direction: "none" };
}

export function resolveEditorDocumentAutoScrollViewport(input: {
  ownerDocument: Document;
  mainPaneElement: HTMLElement | null;
}): EditorAutoScrollViewport | null {
  const mainPaneViewport = input.mainPaneElement ? buildElementAutoScrollViewport(input.mainPaneElement) : null;
  if (mainPaneViewport && mainPaneViewport.scrollHeight > mainPaneViewport.clientHeight) {
    return mainPaneViewport;
  }

  const scrollingElement = input.ownerDocument.scrollingElement;
  if (!(scrollingElement instanceof HTMLElement)) {
    return null;
  }

  const ownerWindow = input.ownerDocument.defaultView;
  const viewportHeight = ownerWindow?.innerHeight ?? scrollingElement.clientHeight;
  return {
    element: scrollingElement,
    rect: new DOMRect(0, 0, ownerWindow?.innerWidth ?? scrollingElement.clientWidth, viewportHeight),
    scrollTop: scrollingElement.scrollTop,
    scrollHeight: scrollingElement.scrollHeight,
    clientHeight: viewportHeight,
    scrollBy: (deltaY) => {
      scrollingElement.scrollTop += deltaY;
    }
  };
}

export function resolveEditorAutoScrollTopClearancePx(input: {
  ownerDocument: Document;
  styleTarget: HTMLElement | null;
}): number {
  const ownerWindow = input.ownerDocument.defaultView;
  const candidates = [input.styleTarget, input.ownerDocument.documentElement].filter(
    (candidate): candidate is HTMLElement => candidate instanceof HTMLElement
  );

  for (const candidate of candidates) {
    const computedStyle = ownerWindow?.getComputedStyle(candidate);
    const scrollPaddingTop = parsePixelValue(computedStyle?.scrollPaddingTop ?? null);
    if (scrollPaddingTop !== null && scrollPaddingTop > 0) {
      return scrollPaddingTop;
    }

    const headingMargin = parsePixelValue(computedStyle?.getPropertyValue("--docsera-workspace-heading-scroll-margin") ?? null);
    if (headingMargin !== null && headingMargin > 0) {
      return headingMargin;
    }

    const headerHeight = parsePixelValue(computedStyle?.getPropertyValue("--docsera-header-height") ?? null);
    if (headerHeight !== null && headerHeight > 0) {
      return headerHeight;
    }
  }

  return 0;
}

export function createEditorAutoScrollSession(input: EditorAutoScrollSessionInput) {
  const ownerWindow = input.ownerWindow ?? window;
  let frameId: number | null = null;
  let active = true;

  const stop = () => {
    active = false;
    if (frameId !== null) {
      ownerWindow.cancelAnimationFrame(frameId);
      frameId = null;
    }
  };

  const tick = () => {
    frameId = null;
    if (!active) {
      return;
    }

    const pointerY = input.getPointerY();
    const viewport = input.getViewport();
    if (pointerY === null || !viewport) {
      return;
    }

    const request = resolveEditorAutoScrollRequest(viewport, pointerY, {
      topClearancePx: input.getTopClearancePx?.() ?? 0
    });
    if (request.deltaY === 0) {
      return;
    }

    viewport.scrollBy(request.deltaY);
    input.onScroll();
    frameId = ownerWindow.requestAnimationFrame(tick);
  };

  const update = () => {
    if (!active || frameId !== null) {
      return;
    }

    frameId = ownerWindow.requestAnimationFrame(tick);
  };

  return {
    stop,
    update
  };
}

function buildElementAutoScrollViewport(element: HTMLElement): EditorAutoScrollViewport {
  return {
    element,
    rect: element.getBoundingClientRect(),
    scrollTop: element.scrollTop,
    scrollHeight: element.scrollHeight,
    clientHeight: element.clientHeight,
    scrollBy: (deltaY) => {
      element.scrollTop += deltaY;
    }
  };
}

function resolveAcceleratedAutoScrollDelta(proximity: number, maxDeltaPx: number): number {
  return Math.max(1, Math.round(2 + (maxDeltaPx - 2) * proximity * proximity));
}

function parsePixelValue(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}
