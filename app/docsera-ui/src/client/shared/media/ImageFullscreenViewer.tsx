import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent, TransitionEvent as ReactTransitionEvent } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { IMAGE_FULLSCREEN_VIEWER_STYLES } from "./ImageFullscreenViewerStyles";
import type { DocseraImageDisplayTheme } from "../editor/imageDisplayState";
import { DocseraCompactTooltip } from "../tooltip/DocseraTooltip";

export type ImageFullscreenViewerSession = Readonly<{
  alt: string;
  imageSrc: string;
  naturalHeight: number;
  naturalWidth: number;
  restoreFocusElement: HTMLElement | null;
  sourceBorderRadius: string;
  sourceRect: DOMRect;
}>;

export type ImageFullscreenViewerProps = Readonly<{
  overlayRoot: HTMLElement;
  isOpen: boolean;
  onRequestClose: () => void;
  onDismissed: () => void;
  session: ImageFullscreenViewerSession | null;
  theme: DocseraImageDisplayTheme;
}>;

type ViewerPhase = "opening" | "open" | "closing";

function supportsReducedMotion(ownerWindow: Window | null): boolean {
  if (!ownerWindow?.matchMedia) {
    return false;
  }

  return ownerWindow.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function clampDimension(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function isViewportScrollKey(key: string): boolean {
  return key === "ArrowDown" || key === "ArrowUp" || key === "ArrowLeft" || key === "ArrowRight" || key === "PageDown" || key === "PageUp" || key === "Home" || key === "End" || key === " ";
}

function isInteractiveKeyboardTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  return Boolean(target.closest("button, a[href], input, select, textarea, summary, [contenteditable='true'], [role='button']"));
}

function resolveFullscreenRect(
  session: ImageFullscreenViewerSession,
  ownerWindow: Window | null
): Pick<DOMRect, "left" | "top" | "width" | "height"> {
  const viewportWidth = ownerWindow?.innerWidth ?? document.documentElement.clientWidth;
  const viewportHeight = ownerWindow?.innerHeight ?? document.documentElement.clientHeight;
  const availableWidth = Math.max(1, viewportWidth - 48);
  const availableHeight = Math.max(1, viewportHeight - 48);
  const naturalWidth = clampDimension(session.naturalWidth, Math.max(1, session.sourceRect.width));
  const naturalHeight = clampDimension(session.naturalHeight, Math.max(1, session.sourceRect.height));
  const scale = Math.min(1, availableWidth / naturalWidth, availableHeight / naturalHeight);
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));

  return {
    left: Math.round((viewportWidth - width) / 2),
    top: Math.round((viewportHeight - height) / 2),
    width,
    height
  };
}

function areSessionsEqual(left: ImageFullscreenViewerSession | null, right: ImageFullscreenViewerSession | null): boolean {
  return (
    left?.imageSrc === right?.imageSrc &&
    left?.naturalHeight === right?.naturalHeight &&
    left?.naturalWidth === right?.naturalWidth &&
    left?.sourceRect.left === right?.sourceRect.left &&
    left?.sourceRect.top === right?.sourceRect.top &&
    left?.sourceRect.width === right?.sourceRect.width &&
    left?.sourceRect.height === right?.sourceRect.height &&
    left?.sourceBorderRadius === right?.sourceBorderRadius &&
    left?.alt === right?.alt
  );
}

export function createImageFullscreenViewerSession(input: {
  alt: string;
  imageElement: HTMLImageElement;
  restoreFocusElement: HTMLElement | null;
  sourceElement: HTMLElement;
}): ImageFullscreenViewerSession {
  const sourceRect = input.sourceElement.getBoundingClientRect();
  const sourceStyle = input.sourceElement.ownerDocument.defaultView?.getComputedStyle(input.sourceElement);
  return {
    alt: input.alt,
    imageSrc: input.imageElement.currentSrc || input.imageElement.src,
    naturalHeight: Math.max(1, input.imageElement.naturalHeight || sourceRect.height || 1),
    naturalWidth: Math.max(1, input.imageElement.naturalWidth || sourceRect.width || 1),
    restoreFocusElement: input.restoreFocusElement,
    sourceBorderRadius: sourceStyle?.borderRadius || "0px",
    sourceRect: new DOMRect(sourceRect.left, sourceRect.top, Math.max(1, sourceRect.width), Math.max(1, sourceRect.height))
  };
}

export function ImageFullscreenViewer({ isOpen, overlayRoot, onDismissed, onRequestClose, session, theme }: ImageFullscreenViewerProps) {
  const [displaySession, setDisplaySession] = useState<ImageFullscreenViewerSession | null>(session);
  const [phase, setPhase] = useState<ViewerPhase>("opening");
  const [reduceMotion, setReduceMotion] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const ownerWindow = overlayRoot.ownerDocument.defaultView;
  const viewportLockRef = useRef<{
    bodyOverflow: string;
    bodyOverscrollBehavior: string;
    bodyTouchAction: string;
    htmlOverflow: string;
    htmlOverscrollBehavior: string;
    scrollX: number;
    scrollY: number;
  } | null>(null);
  const targetRect = useMemo(
    () => (displaySession ? resolveFullscreenRect(displaySession, ownerWindow) : null),
    [displaySession, ownerWindow]
  );

  useEffect(() => {
    const nextReducedMotion = supportsReducedMotion(ownerWindow);
    setReduceMotion(nextReducedMotion);
    if (!ownerWindow?.matchMedia) {
      return;
    }

    const mediaQuery = ownerWindow.matchMedia("(prefers-reduced-motion: reduce)");
    const handleChange = () => {
      setReduceMotion(mediaQuery.matches);
    };

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", handleChange);
      return () => mediaQuery.removeEventListener("change", handleChange);
    }

    mediaQuery.addListener(handleChange);
    return () => mediaQuery.removeListener(handleChange);
  }, [ownerWindow]);

  useEffect(() => {
    if (session && isOpen && !areSessionsEqual(session, displaySession)) {
      setDisplaySession(session);
      setPhase("opening");
      return;
    }

    if (!isOpen && displaySession) {
      if (reduceMotion) {
        displaySession.restoreFocusElement?.focus?.({ preventScroll: true });
        setDisplaySession(null);
        onDismissed();
        setPhase("opening");
        return;
      }

      setPhase("closing");
    }
  }, [displaySession, isOpen, onDismissed, reduceMotion, session]);

  useEffect(() => {
    if (!displaySession) {
      return;
    }

    const ownerDocument = overlayRoot.ownerDocument;
    const ownerHtml = ownerDocument.documentElement;
    const ownerBody = ownerDocument.body;
    viewportLockRef.current = {
      bodyOverflow: ownerBody.style.overflow,
      bodyOverscrollBehavior: ownerBody.style.overscrollBehavior,
      bodyTouchAction: ownerBody.style.touchAction,
      htmlOverflow: ownerHtml.style.overflow,
      htmlOverscrollBehavior: ownerHtml.style.overscrollBehavior,
      scrollX: ownerWindow?.scrollX ?? ownerDocument.defaultView?.pageXOffset ?? ownerHtml.scrollLeft ?? 0,
      scrollY: ownerWindow?.scrollY ?? ownerDocument.defaultView?.pageYOffset ?? ownerHtml.scrollTop ?? 0
    };

    ownerHtml.style.overflow = "hidden";
    ownerHtml.style.overscrollBehavior = "none";
    ownerBody.style.overflow = "hidden";
    ownerBody.style.overscrollBehavior = "none";
    ownerBody.style.touchAction = "none";

    const preventScroll = (event: Event) => {
      event.preventDefault();
    };
    const preventKeyboardScroll = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        !isViewportScrollKey(event.key) ||
        isInteractiveKeyboardTarget(event.target)
      ) {
        return;
      }

      event.preventDefault();
    };

    ownerDocument.addEventListener("wheel", preventScroll, { capture: true, passive: false });
    ownerDocument.addEventListener("touchmove", preventScroll, { capture: true, passive: false });
    ownerDocument.addEventListener("keydown", preventKeyboardScroll, { capture: true });

    return () => {
      ownerDocument.removeEventListener("wheel", preventScroll, true);
      ownerDocument.removeEventListener("touchmove", preventScroll, true);
      ownerDocument.removeEventListener("keydown", preventKeyboardScroll, true);

      const lockSnapshot = viewportLockRef.current;
      viewportLockRef.current = null;
      ownerHtml.style.overflow = lockSnapshot?.htmlOverflow ?? "";
      ownerHtml.style.overscrollBehavior = lockSnapshot?.htmlOverscrollBehavior ?? "";
      ownerBody.style.overflow = lockSnapshot?.bodyOverflow ?? "";
      ownerBody.style.overscrollBehavior = lockSnapshot?.bodyOverscrollBehavior ?? "";
      ownerBody.style.touchAction = lockSnapshot?.bodyTouchAction ?? "";
      ownerWindow?.scrollTo(lockSnapshot?.scrollX ?? 0, lockSnapshot?.scrollY ?? 0);
    };
  }, [displaySession, ownerWindow, overlayRoot]);

  useLayoutEffect(() => {
    if (!displaySession || !isOpen) {
      return;
    }

    if (reduceMotion) {
      setPhase("open");
      closeButtonRef.current?.focus({ preventScroll: true });
      return;
    }

    const frame = ownerWindow?.requestAnimationFrame ?? window.requestAnimationFrame;
    const cancelFrame = ownerWindow?.cancelAnimationFrame ?? window.cancelAnimationFrame;
    const requestId = frame(() => {
      setPhase("open");
      closeButtonRef.current?.focus({ preventScroll: true });
    });

    return () => {
      cancelFrame(requestId);
    };
  }, [displaySession, isOpen, ownerWindow, reduceMotion]);

  useEffect(() => {
    if (!displaySession) {
      return;
    }

    if (phase === "open") {
      return;
    }

    if (phase === "closing" && reduceMotion) {
      displaySession.restoreFocusElement?.focus?.({ preventScroll: true });
      setDisplaySession(null);
      onDismissed();
    }
  }, [displaySession, onDismissed, phase, reduceMotion]);

  if (!displaySession || !targetRect) {
    return null;
  }

  const handleRequestClose = () => {
    if (phase === "closing") {
      return;
    }

    onRequestClose();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      handleRequestClose();
      return;
    }

    if (event.key === "Tab") {
      event.preventDefault();
      closeButtonRef.current?.focus({ preventScroll: true });
    }
  };

  const handleTransitionEnd = (event: ReactTransitionEvent<HTMLElement>) => {
    if (phase !== "closing" || event.target !== event.currentTarget) {
      return;
    }

    displaySession.restoreFocusElement?.focus?.({ preventScroll: true });
    setDisplaySession(null);
    onDismissed();
    setPhase("opening");
  };

  return createPortal(
    <>
      <style>{IMAGE_FULLSCREEN_VIEWER_STYLES}</style>
      <div
        className={`docsera-image-viewer docsera-image-viewer--${theme} docsera-image-viewer--${phase}`}
        role="dialog"
        aria-modal="true"
        aria-label="Image viewer"
        onKeyDown={handleKeyDown}
      >
        <button
          type="button"
          className="docsera-image-viewer__backdrop"
          aria-label="Close image viewer"
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={handleRequestClose}
        />
        <div
          className="docsera-image-viewer__surface"
          onClick={handleRequestClose}
          style={{
            left: phase === "open" ? `${targetRect.left}px` : `${displaySession.sourceRect.left}px`,
            top: phase === "open" ? `${targetRect.top}px` : `${displaySession.sourceRect.top}px`,
            width: phase === "open" ? `${targetRect.width}px` : `${Math.max(1, displaySession.sourceRect.width)}px`,
            height: phase === "open" ? `${targetRect.height}px` : `${Math.max(1, displaySession.sourceRect.height)}px`,
            borderRadius: phase === "open" ? "0px" : displaySession.sourceBorderRadius || "0px"
          }}
          onTransitionEnd={handleTransitionEnd}
        >
          <img className="docsera-image-viewer__image" src={displaySession.imageSrc} alt={displaySession.alt} />
        </div>
        <DocseraCompactTooltip label="Close image viewer" ownerDocument={overlayRoot.ownerDocument}>
          <button
            ref={closeButtonRef}
            type="button"
            className="docsera-image-viewer__close"
            aria-label="Close image viewer"
            data-docsera-suppress-focus-tooltip="true"
            onMouseDown={(event) => {
              event.preventDefault();
            }}
            onClick={(event) => {
              event.stopPropagation();
              handleRequestClose();
            }}
          >
            <X size={16} strokeWidth={2.2} aria-hidden="true" focusable="false" />
          </button>
        </DocseraCompactTooltip>
      </div>
    </>,
    overlayRoot
  );
}
