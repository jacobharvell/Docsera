import { cloneElement, isValidElement, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { CSSProperties, ReactElement, RefObject, ReactNode } from "react";

export const DOCSERA_TOOLTIP_DELAY_MS = 180;
export const DOCSERA_TOOLTIP_VIEWPORT_GUTTER = 12;

const TOOLTIP_GAP = 10;

type CompactTooltipState = {
  anchorRect: DOMRect;
};

type CompactTooltipTriggerProps = {
  onBlur?: React.FocusEventHandler<HTMLElement>;
  onClick?: React.MouseEventHandler<HTMLElement>;
  onFocus?: React.FocusEventHandler<HTMLElement>;
  onMouseEnter?: React.MouseEventHandler<HTMLElement>;
  onMouseLeave?: React.MouseEventHandler<HTMLElement>;
  onPointerDown?: React.PointerEventHandler<HTMLElement>;
};

export function sameFloatingStyle(left: CSSProperties | undefined, right: CSSProperties): boolean {
  return (
    left?.left === right.left &&
    left?.top === right.top &&
    left?.width === right.width &&
    left?.maxWidth === right.maxWidth &&
    left?.maxHeight === right.maxHeight &&
    left?.visibility === right.visibility
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(min, value), max);
}

export function resolveDocseraTooltipStyle(
  ownerDocument: Document,
  anchorRect: DOMRect,
  surfaceRect: Pick<DOMRect, "height" | "width">
): CSSProperties {
  const ownerWindow = ownerDocument.defaultView;
  const viewportWidth = ownerWindow?.innerWidth ?? ownerDocument.documentElement.clientWidth;
  const viewportHeight = ownerWindow?.innerHeight ?? ownerDocument.documentElement.clientHeight;
  const maxSurfaceWidth = Math.max(1, viewportWidth - DOCSERA_TOOLTIP_VIEWPORT_GUTTER * 2);
  const maxSurfaceHeight = Math.max(1, viewportHeight - DOCSERA_TOOLTIP_VIEWPORT_GUTTER * 2);
  const clampedWidth = Math.max(1, Math.min(surfaceRect.width, maxSurfaceWidth));
  const clampedHeight = Math.max(1, Math.min(surfaceRect.height, maxSurfaceHeight));
  const centeredLeft = anchorRect.left + anchorRect.width / 2 - clampedWidth / 2;
  const left = clamp(
    centeredLeft,
    DOCSERA_TOOLTIP_VIEWPORT_GUTTER,
    Math.max(DOCSERA_TOOLTIP_VIEWPORT_GUTTER, viewportWidth - clampedWidth - DOCSERA_TOOLTIP_VIEWPORT_GUTTER)
  );
  const aboveTop = anchorRect.top - clampedHeight - TOOLTIP_GAP;
  const belowTop = anchorRect.bottom + TOOLTIP_GAP;
  const top =
    aboveTop >= DOCSERA_TOOLTIP_VIEWPORT_GUTTER
      ? aboveTop
      : clamp(
          belowTop,
          DOCSERA_TOOLTIP_VIEWPORT_GUTTER,
          Math.max(DOCSERA_TOOLTIP_VIEWPORT_GUTTER, viewportHeight - clampedHeight - DOCSERA_TOOLTIP_VIEWPORT_GUTTER)
        );

  return {
    position: "fixed",
    left: `${left}px`,
    top: `${top}px`,
    width: `${clampedWidth}px`,
    maxWidth: `${maxSurfaceWidth}px`,
    maxHeight: `${maxSurfaceHeight}px`
  };
}

export function DocseraTooltip({
  anchorRect,
  children,
  className = "",
  ownerDocument,
  tooltipRef
}: {
  anchorRect: DOMRect;
  children: ReactNode;
  className?: string;
  ownerDocument: Document;
  tooltipRef: RefObject<HTMLDivElement>;
}) {
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    const tooltipElement = tooltipRef.current;
    if (!tooltipElement) {
      setTooltipStyle(null);
      return;
    }

    tooltipElement.style.width = "max-content";
    const size = tooltipElement.getBoundingClientRect();
    const width = Math.max(1, size.width);
    const height = Math.max(1, size.height);
    const style: CSSProperties = {
      ...resolveDocseraTooltipStyle(ownerDocument, anchorRect, { width, height }),
      visibility: "visible"
    };

    setTooltipStyle((current) => (sameFloatingStyle(current ?? undefined, style) ? current : style));
  }, [anchorRect, children, className, ownerDocument, tooltipRef]);

  return (
    <div
      ref={tooltipRef}
      className={`docsera-tooltip${className ? ` ${className}` : ""}`}
      role="tooltip"
      style={tooltipStyle ?? { visibility: "hidden" }}
    >
      {children}
    </div>
  );
}

export function DocseraCompactTooltip({
  children,
  label,
  ownerDocument,
  resolveAnchorRect,
  shortcut
}: {
  children: ReactElement<CompactTooltipTriggerProps>;
  label: string;
  ownerDocument?: Document;
  resolveAnchorRect?: (trigger: HTMLElement) => DOMRect;
  shortcut?: string | null;
}) {
  const [tooltip, setTooltip] = useState<CompactTooltipState | null>(null);
  const timerRef = useRef<number | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);
  const resolvedOwnerDocument = ownerDocument ?? (typeof document !== "undefined" ? document : null);
  const ownerWindow = resolvedOwnerDocument?.defaultView ?? (typeof window !== "undefined" ? window : null);

  function clearTooltipTimer() {
    if (timerRef.current !== null) {
      ownerWindow?.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }

  function hideTooltip() {
    clearTooltipTimer();
    setTooltip(null);
  }

  function showTooltip(target: HTMLElement, immediate = false) {
    if (!resolvedOwnerDocument) {
      return;
    }
    const nextTooltip = {
      anchorRect: resolveAnchorRect?.(target) ?? target.getBoundingClientRect()
    };
    clearTooltipTimer();
    setTooltip(null);
    if (immediate) {
      setTooltip(nextTooltip);
      return;
    }
    timerRef.current = ownerWindow?.setTimeout(() => {
      timerRef.current = null;
      setTooltip(nextTooltip);
    }, DOCSERA_TOOLTIP_DELAY_MS) ?? null;
  }

  if (!isValidElement(children)) {
    return children;
  }

  const trigger = cloneElement(children, {
    onBlur: (event: React.FocusEvent<HTMLElement>) => {
      hideTooltip();
      children.props.onBlur?.(event);
    },
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      hideTooltip();
      children.props.onClick?.(event);
    },
    onFocus: (event: React.FocusEvent<HTMLElement>) => {
      showTooltip(event.currentTarget, true);
      children.props.onFocus?.(event);
    },
    onMouseEnter: (event: React.MouseEvent<HTMLElement>) => {
      showTooltip(event.currentTarget);
      children.props.onMouseEnter?.(event);
    },
    onMouseLeave: (event: React.MouseEvent<HTMLElement>) => {
      hideTooltip();
      children.props.onMouseLeave?.(event);
    },
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      hideTooltip();
      children.props.onPointerDown?.(event);
    }
  });

  return (
    <>
      {trigger}
      {tooltip && resolvedOwnerDocument
        ? createPortal(
            <DocseraTooltip anchorRect={tooltip.anchorRect} ownerDocument={resolvedOwnerDocument} tooltipRef={tooltipRef}>
              {shortcut ? (
                <span className="docsera-tooltip__line docsera-tooltip__line--inline">
                  <span className="docsera-tooltip__label">{label}</span>
                  <span className="docsera-tooltip__shortcut">{shortcut}</span>
                </span>
              ) : (
                <span className="docsera-tooltip__label">{label}</span>
              )}
            </DocseraTooltip>,
            resolvedOwnerDocument.body
          )
        : null}
    </>
  );
}

export const DOCSERA_TOOLTIP_STYLES = `
  .docsera-tooltip {
    box-sizing: border-box;
    display: inline-flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    width: max-content;
    padding: 5px 8px;
    border: 1px solid var(--docsera-border);
    border-radius: 8px;
    background: var(--docsera-surface);
    color: var(--docsera-text);
    box-shadow: var(--docsera-shadow);
    max-width: min(260px, calc(100vw - ${DOCSERA_TOOLTIP_VIEWPORT_GUTTER * 2}px));
    pointer-events: none;
    z-index: var(--docsera-tooltip-z-index, 200);
  }

  .docsera-tooltip__label {
    font-size: 0.8125rem;
    font-weight: 500;
    line-height: 1.25;
    white-space: nowrap;
  }

  .docsera-tooltip__line {
    display: flex;
    justify-content: center;
    gap: 0.25rem;
    white-space: nowrap;
  }

  .docsera-tooltip__line--inline {
    align-items: center;
    gap: 0.375rem;
  }

  .docsera-tooltip__muted {
    color: var(--docsera-text-soft);
    font-weight: 400;
  }

  .docsera-tooltip__shortcut {
    display: inline-flex;
    align-items: center;
    min-height: 18px;
    padding: 0 5px;
    border: 1px solid var(--docsera-border);
    border-radius: 6px;
    background: var(--docsera-surface-muted);
    color: var(--docsera-text-soft);
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1;
    white-space: nowrap;
  }
`;
