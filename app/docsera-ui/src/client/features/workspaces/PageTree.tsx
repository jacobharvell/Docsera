import { useDropdownExitPresence } from "./useDropdownExitPresence";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, RefObject } from "react";
import { createPortal } from "react-dom";
import { DocseraIcon } from "../../shared/icons/DocseraIcon";
import { docseraIcons } from "../../shared/icons/docseraIcons";
import type { WorkspacePageView } from "./workspaceViewModels";
import {
  resolvePageTreeDropGeometry,
  type PageTreeDropGeometryEdgeZone,
  type PageTreeDropGeometryRow
} from "./pageTreeDropGeometry";
import {
  resolvePageTreeDropDestination,
  type PageTreeDropDestination
} from "./pageTreeDropResolver";
import {
  resolvePageTreeDropPresentationAnchor,
  type PageTreeDropPresentationAnchor
} from "./pageTreeDropPresentation";
import { DocseraCompactTooltip } from "../../shared/tooltip/DocseraTooltip";

export type InlinePageCreateState = {
  errorMessage: string;
  focusToken: number;
  noticeMessage: string;
  parentPageSysId: string;
  pending: boolean;
  showInput: boolean;
  title: string;
};

type PageTreeProps = {
  canCreatePage: boolean;
  canManagePageSettings: boolean;
  dragSurfaceRef?: RefObject<HTMLElement>;
  filterText: string;
  inlineCreateState: InlinePageCreateState | null;
  inlineRenameErrorMessage?: string;
  inlineRenamePageId?: string;
  inlineRenameValue?: string;
  isCreatingPage: boolean;
  onCancelInlineRename?: () => void;
  onCommitInlineCreate: () => Promise<void> | void;
  onCommitInlineRename?: () => Promise<boolean> | boolean;
  onInlineCreateTitleChange: (value: string) => void;
  onInlineRenameTitleChange?: (value: string) => void;
  onSelectPage: (pageId: string) => void;
  onMovePage?: (input: { pageSysId: string; parentPageSysId: string | null; siblingOrder: string | number }) => void;
  onRequestDeletePage: (pageId: string) => void;
  onStartInlineRename?: (pageId: string) => void;
  onShowCreatePage: () => void;
  onShowChildPageCreate: (parentPageId: string, parentPageTitle: string) => void;
  onTogglePageSettings: (pageId: string) => void;
  pageSettingsOpenPageId: string;
  pages: WorkspacePageView[];
  selectedPageId: string;
  collapsedPageIds?: string[];
  navigationCollapsed?: boolean;
  onCollapsedPageIdsChange?: (pageIds: string[]) => void;
  treeViewportRef?: RefObject<HTMLElement>;
};

type PageTreeNodeProps = Omit<PageTreeProps, "collapsedPageIds" | "dragSurfaceRef" | "treeViewportRef"> & {
  collapsedPageIds: ReadonlySet<string>;
  depth: number;
  draggedPageId: string;
  dropPreview: PageTreeDropPreviewState | null;
  inlineCreateState: InlinePageCreateState | null;
  onCommitInlineCreate: () => Promise<void> | void;
  onDragEnd: () => void;
  onDragStart: (pageId: string) => void;
  onInlineCreateTitleChange: (value: string) => void;
  onShowPageContextMenu: (input: PageTreeContextMenuState) => void;
  onToggleCollapsed: (pageId: string) => void;
  page: WorkspacePageView;
  contextMenuPageId: string;
  firstVisibleRootPageId: string | null;
  lastVisibleRootPageId: string | null;
};

type PageTreeDropPreviewPlacement = "row" | "top-edge" | "bottom-edge";

type PageTreeDropPreviewState = {
  destination: PageTreeDropDestination;
  presentationAnchor: PageTreeDropPresentationAnchor;
  placement: PageTreeDropPreviewPlacement;
  edgeLineOffset: number | null;
};

type PageTreeContextMenuState = {
  page: WorkspacePageView;
  x: number;
  y: number;
  anchorY: number;
  origin: HTMLElement;
  placement: "pointer" | "control";
};

type PageTreeContextMenuAction = "settings" | "rename" | "delete" | "add-child";

const CONTEXT_MENU_VIEWPORT_MARGIN = 8;
const CONTEXT_MENU_CONTROL_OFFSET = 4;

function EllipsisIcon() {
  return <DocseraIcon icon={docseraIcons.ellipsis} size={14} />;
}

function PlusIcon() {
  return <DocseraIcon icon={docseraIcons.plus} size={14} />;
}

function PageTreeMenuIcon({ action }: { action: PageTreeContextMenuAction }) {
  const icon =
    action === "settings"
      ? docseraIcons.sliders
      : action === "rename"
        ? docseraIcons.squarePen
        : action === "delete"
          ? docseraIcons.trash
          : docseraIcons.plus;
  return <DocseraIcon icon={icon} size={14} />;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <DocseraIcon
      className={`docsera-page-tree__chevron-icon${expanded ? " docsera-page-tree__chevron-icon--expanded" : ""}`}
      icon={docseraIcons.chevronRight}
      size={14}
    />
  );
}

function matchesTreeFilter(page: WorkspacePageView, filterText: string): boolean {
  if (!filterText) {
    return true;
  }

  const normalizedFilter = filterText.toLowerCase();
  if (page.title.toLowerCase().includes(normalizedFilter) || page.slug.toLowerCase().includes(normalizedFilter)) {
    return true;
  }

  return page.children ? page.children.some((child) => matchesTreeFilter(child, filterText)) : false;
}

function pageHasSelectedDescendant(page: WorkspacePageView, selectedPageId: string): boolean {
  return page.children ? page.children.some((child) => child.id === selectedPageId || pageHasSelectedDescendant(child, selectedPageId)) : false;
}

function flattenPages(pages: WorkspacePageView[]): WorkspacePageView[] {
  return pages.flatMap((page) => [page, ...flattenPages(page.children ?? [])]);
}

function sameDropPresentationAnchor(
  left: PageTreeDropPresentationAnchor | null,
  right: PageTreeDropPresentationAnchor | null
): boolean {
  if (!left || !right) {
    return left === right;
  }

  return left.position === right.position && left.targetPageId === right.targetPageId;
}

function sameDropPreview(left: PageTreeDropPreviewState | null, right: PageTreeDropPreviewState | null): boolean {
  if (!left || !right) {
    return left === right;
  }

  return (
    left.edgeLineOffset === right.edgeLineOffset &&
    left.placement === right.placement &&
    sameDropPresentationAnchor(left.presentationAnchor, right.presentationAnchor)
  );
}

function clampContextMenuCoordinate(value: number, size: number, viewportSize: number): number {
  const maximum = Math.max(CONTEXT_MENU_VIEWPORT_MARGIN, viewportSize - size - CONTEXT_MENU_VIEWPORT_MARGIN);
  return Math.min(Math.max(value, CONTEXT_MENU_VIEWPORT_MARGIN), maximum);
}

function resolveContextMenuViewportPosition(contextMenu: PageTreeContextMenuState, menuElement: HTMLElement): Pick<PageTreeContextMenuState, "x" | "y"> {
  const menuRect = menuElement.getBoundingClientRect();
  const x = clampContextMenuCoordinate(contextMenu.x, menuRect.width, window.innerWidth);
  const hasRoomBelow = contextMenu.anchorY + menuRect.height + CONTEXT_MENU_VIEWPORT_MARGIN <= window.innerHeight;
  const originRect = contextMenu.origin.getBoundingClientRect();
  const aboveY =
    contextMenu.placement === "control"
      ? originRect.top - menuRect.height - CONTEXT_MENU_CONTROL_OFFSET
      : contextMenu.anchorY - menuRect.height;
  const preferredY = hasRoomBelow ? contextMenu.anchorY : aboveY;

  return {
    x,
    y: clampContextMenuCoordinate(preferredY, menuRect.height, window.innerHeight)
  };
}

function isDragEventInsideCurrentTarget(event: { currentTarget: EventTarget | null; relatedTarget: EventTarget | null }): boolean {
  return event.currentTarget instanceof Node && event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget);
}

function buildDropPreview(
  destination: PageTreeDropDestination,
  presentationAnchor: PageTreeDropPresentationAnchor,
  edge: "top" | "bottom" | null,
  edgeLineOffset: number | null
): PageTreeDropPreviewState {
  if (edge === "top") {
    return {
      destination,
      edgeLineOffset,
      presentationAnchor,
      placement: "top-edge"
    };
  }

  if (edge === "bottom") {
    return {
      destination,
      edgeLineOffset,
      presentationAnchor,
      placement: "bottom-edge"
    };
  }

  return {
    destination,
    edgeLineOffset: null,
    presentationAnchor,
    placement: "row"
  };
}

function getRectBounds(element: HTMLElement): { bottom: number; top: number } | null {
  const rect = element.getBoundingClientRect();
  if (!Number.isFinite(rect.top) || !Number.isFinite(rect.bottom)) {
    return null;
  }

  return {
    bottom: rect.bottom,
    top: rect.top
  };
}

function collectPageTreeGeometry(
  surfaceElement: HTMLElement,
  treeElement: HTMLElement,
  firstVisibleRootPageId: string | null,
  lastVisibleRootPageId: string | null
): {
  bottomEdgeZone: PageTreeDropGeometryEdgeZone | null;
  bottomEdgeLineOffset: number | null;
  rows: PageTreeDropGeometryRow[];
  topEdgeLineOffset: number | null;
  topEdgeZone: PageTreeDropGeometryEdgeZone | null;
} {
  const surfaceBounds = getRectBounds(surfaceElement);
  const treeBounds = getRectBounds(treeElement);
  const rows = [...treeElement.querySelectorAll<HTMLElement>(".docsera-page-tree__row[data-docsera-page-id]")]
    .map((rowElement) => {
      const pageId = rowElement.dataset.docseraPageId?.trim() ?? "";
      if (!pageId) {
        return null;
      }

      const bounds = getRectBounds(rowElement);
      if (!bounds) {
        return null;
      }

      const itemElement = rowElement.closest<HTMLElement>(".docsera-page-tree__item");
      const depth = Number(itemElement?.dataset.docseraPageTreeDepth ?? rowElement.dataset.docseraPageTreeDepth ?? "0");
      return {
        bottom: bounds.bottom,
        depth: Number.isFinite(depth) ? depth : 0,
        pageId,
        top: bounds.top
      };
    })
    .filter((row): row is PageTreeDropGeometryRow => Boolean(row));

  const firstRootRow = firstVisibleRootPageId ? rows.find((row) => row.pageId === firstVisibleRootPageId) ?? null : null;
  const lastRootIndex = lastVisibleRootPageId ? rows.findIndex((row) => row.pageId === lastVisibleRootPageId) : -1;
  const lastRootBranchBottom =
    lastRootIndex >= 0 ? rows.slice(lastRootIndex).reduce((bottom, row) => Math.max(bottom, row.bottom), rows[lastRootIndex]!.bottom) : null;

  return {
    bottomEdgeLineOffset: treeBounds && lastRootBranchBottom !== null ? lastRootBranchBottom - treeBounds.top : null,
    bottomEdgeZone:
      surfaceBounds && lastVisibleRootPageId && lastRootBranchBottom !== null && surfaceBounds.bottom >= lastRootBranchBottom
        ? {
            bottom: surfaceBounds.bottom,
            pageId: lastVisibleRootPageId,
            top: lastRootBranchBottom
          }
        : null,
    rows,
    topEdgeLineOffset: treeBounds && firstRootRow ? firstRootRow.top - treeBounds.top : null,
    topEdgeZone:
      surfaceBounds && firstRootRow && surfaceBounds.top <= firstRootRow.top
        ? {
            bottom: firstRootRow.top,
            pageId: firstVisibleRootPageId!,
            top: surfaceBounds.top
          }
        : null
  };
}

function readTreeDropPreview(
  surfaceElement: HTMLElement,
  treeElement: HTMLElement,
  input: {
    draggedPageId: string;
    firstVisibleRootPageId: string | null;
    lastVisibleRootPageId: string | null;
    pagesById: ReadonlyMap<string, WorkspacePageView>;
    pagesByParent: ReadonlyMap<string, WorkspacePageView[]>;
    pointerY: number;
  }
): PageTreeDropPreviewState | null {
  const geometry = collectPageTreeGeometry(surfaceElement, treeElement, input.firstVisibleRootPageId, input.lastVisibleRootPageId);
  const candidate = resolvePageTreeDropGeometry({
    bottomEdgeZone: geometry.bottomEdgeZone,
    pointerY: input.pointerY,
    rows: geometry.rows,
    topEdgeZone: geometry.topEdgeZone
  });
  if (!candidate) {
    return null;
  }

  const destination = resolvePageTreeDropDestination({
    draggedPageId: input.draggedPageId,
    pagesById: input.pagesById,
    pagesByParent: input.pagesByParent,
    position: candidate.position,
    targetPageId: candidate.targetPageId
  });
  if (!destination) {
    return null;
  }

  const presentationAnchor = resolvePageTreeDropPresentationAnchor({
    destination,
    draggedPageId: input.draggedPageId,
    pagesById: input.pagesById,
    pagesByParent: input.pagesByParent,
    rows: geometry.rows
  });

  return buildDropPreview(
    destination,
    presentationAnchor,
    candidate.edge,
    candidate.edge === "top" ? geometry.topEdgeLineOffset : candidate.edge === "bottom" ? geometry.bottomEdgeLineOffset : null
  );
}

function InlineCreateRow({
  depth,
  errorMessage,
  focusToken,
  noticeMessage,
  pending,
  showInput,
  title,
  onCommit,
  onTitleChange
}: {
  depth: number;
  errorMessage: string;
  focusToken: number;
  noticeMessage: string;
  pending: boolean;
  showInput: boolean;
  title: string;
  onCommit: () => Promise<void> | void;
  onTitleChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLLabelElement>(null);
  const commitInFlightRef = useRef(false);
  useEffect(() => {
    if (pending || !showInput) {
      return;
    }

    const input = inputRef.current;
    if (!input) {
      return;
    }

    input.focus();
    input.select();
  }, [focusToken, pending]);

  const commit = useCallback(() => {
    if (commitInFlightRef.current) {
      return;
    }
    commitInFlightRef.current = true;
    void Promise.resolve(onCommit()).finally(() => {
      commitInFlightRef.current = false;
    });
  }, [onCommit]);

  useEffect(() => {
    const input = inputRef.current;
    const ownerDocument = input?.ownerDocument;
    if (!input || !ownerDocument || pending || !showInput) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) {
        return;
      }
      if (fieldRef.current?.contains(event.target)) {
        return;
      }
      commit();
    }

    ownerDocument.addEventListener("pointerdown", handlePointerDown, true);
    return () => ownerDocument.removeEventListener("pointerdown", handlePointerDown, true);
  }, [commit, pending, showInput]);

  return (
    <li className="docsera-page-tree__item docsera-page-tree__item--inline-create">
      {showInput ? (
        <div className="docsera-page-tree__row docsera-page-tree__row--selected docsera-page-tree__row--inline-create">
          <div className="docsera-page-tree__row-main">
            <span className="docsera-page-tree__chevron-spacer" aria-hidden="true" />
            <label ref={fieldRef} className="docsera-page-tree__inline-field">
              <span className="docsera-page-tree__inline-field-label">New page title</span>
              <input
                ref={inputRef}
                aria-label="New page title"
                className="docsera-page-tree__inline-input"
                disabled={pending}
                onBlur={commit}
                onChange={(event) => onTitleChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    commit();
                  }
                }}
                type="text"
                value={title}
              />
            </label>
          </div>
        </div>
      ) : null}
      {noticeMessage ? (
        <p className="docsera-page-tree__inline-notice" role="status">
          {noticeMessage}
        </p>
      ) : null}
      {errorMessage ? (
        <p className="docsera-page-tree__inline-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </li>
  );
}

function InlineRenameField({
  errorMessage,
  pageId,
  pageTitle,
  value,
  onCancel,
  onCommit,
  onTitleChange
}: {
  errorMessage: string;
  pageId: string;
  pageTitle: string;
  value: string;
  onCancel: () => void;
  onCommit: () => Promise<boolean> | boolean;
  onTitleChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLLabelElement>(null);
  const cancelledRef = useRef(false);
  const commitInFlightRef = useRef(false);
  const errorId = `docsera-page-tree-rename-${pageId.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-error`;

  useEffect(() => {
    const input = inputRef.current;
    if (!input) {
      return;
    }

    input.focus();
    input.select();
  }, []);

  function commit() {
    if (cancelledRef.current || commitInFlightRef.current) {
      return;
    }
    commitInFlightRef.current = true;
    void Promise.resolve(onCommit()).then(
      (committed) => {
        if (!committed) {
          commitInFlightRef.current = false;
        }
      },
      () => {
        commitInFlightRef.current = false;
      }
    );
  }

  function cancel() {
    cancelledRef.current = true;
    onCancel();
  }

  useEffect(() => {
    const input = inputRef.current;
    const ownerDocument = input?.ownerDocument;
    if (!input || !ownerDocument) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (!(event.target instanceof Node)) {
        return;
      }
      if (fieldRef.current?.contains(event.target)) {
        return;
      }
      commit();
    }

    ownerDocument.addEventListener("pointerdown", handlePointerDown, true);
    return () => ownerDocument.removeEventListener("pointerdown", handlePointerDown, true);
  }, []);

  return (
    <label ref={fieldRef} className="docsera-page-tree__inline-field docsera-page-tree__inline-field--rename">
      <span className="docsera-page-tree__inline-field-label">Rename page</span>
      <input
        ref={inputRef}
        aria-describedby={errorMessage ? errorId : undefined}
        aria-invalid={errorMessage ? "true" : undefined}
        aria-label={`Rename ${pageTitle}`}
        className={`docsera-page-tree__inline-input${errorMessage ? " docsera-page-tree__inline-input--invalid" : ""}`}
        onBlur={commit}
        onChange={(event) => onTitleChange(event.target.value)}
        onClick={(event) => event.stopPropagation()}
        onDragStart={(event) => event.preventDefault()}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          } else if (event.key === "Escape") {
            event.preventDefault();
            cancel();
          }
        }}
        onPointerDown={(event) => event.stopPropagation()}
        type="text"
        value={value}
      />
      {errorMessage ? (
        <span className="docsera-page-tree__inline-error docsera-page-tree__inline-error--rename" id={errorId} role="alert">
          {errorMessage}
        </span>
      ) : null}
    </label>
  );
}

function PageTreeNode({
  canCreatePage,
  canManagePageSettings,
  collapsedPageIds,
  depth,
  draggedPageId,
  dropPreview,
  filterText,
  inlineCreateState,
  isCreatingPage,
  onCommitInlineCreate,
  inlineRenamePageId = "",
  inlineRenameErrorMessage = "",
  inlineRenameValue = "",
  onCancelInlineRename = () => undefined,
  onCommitInlineRename = () => true,
  onDragEnd,
  onDragStart,
  onInlineCreateTitleChange,
  onInlineRenameTitleChange = () => undefined,
  onSelectPage,
  onMovePage,
  onRequestDeletePage,
  onStartInlineRename = () => undefined,
  onShowChildPageCreate,
  onShowPageContextMenu,
  onToggleCollapsed,
  onTogglePageSettings,
  page,
  contextMenuPageId,
  firstVisibleRootPageId,
  lastVisibleRootPageId,
  pageSettingsOpenPageId,
  selectedPageId
}: PageTreeNodeProps) {
  if (!matchesTreeFilter(page, filterText)) {
    return null;
  }

  const hasChildren = Boolean(page.children?.length);
  const pageIdentity = page.sysId || page.id;
  const isSelected = page.id === selectedPageId;
  const isPageSettingsOpen = page.id === pageSettingsOpenPageId;
  const isContextMenuOpen = page.id === contextMenuPageId || pageIdentity === contextMenuPageId;
  const isInlineCreateParent = inlineCreateState?.parentPageSysId === page.id;
  const isInlineRenaming = inlineRenamePageId === pageIdentity;
  const mustStayExpanded =
    hasChildren &&
    (
      pageHasSelectedDescendant(page, selectedPageId) ||
      isInlineCreateParent ||
      Boolean(filterText && page.children?.some((child) => matchesTreeFilter(child, filterText)))
    );
  const isExpanded = hasChildren ? !collapsedPageIds.has(page.id) || mustStayExpanded : false;
  const showChildCreateButton = canCreatePage && hasChildren;
  const showActionsButton = canManagePageSettings;
  const hasContextMenuActions = canCreatePage || canManagePageSettings;
  const actionCount = [showChildCreateButton, showActionsButton].filter(Boolean).length;
  const canMovePage = Boolean(onMovePage && canManagePageSettings);
  const activeDropAnchor = dropPreview?.presentationAnchor ?? null;
  const isDropBeforeTarget = activeDropAnchor?.targetPageId === page.id && activeDropAnchor.position === "before";
  const isDropInsideTarget = dropPreview?.destination.targetPageId === page.id && dropPreview.destination.position === "inside";
  const isDropAfterTarget = activeDropAnchor?.targetPageId === page.id && activeDropAnchor.position === "after";
  const isRootBeforeEdge = Boolean(
    dropPreview?.placement === "top-edge" &&
      firstVisibleRootPageId &&
      page.id === firstVisibleRootPageId &&
      isDropBeforeTarget
  );
  const isRootAfterEdge = Boolean(
    dropPreview?.placement === "bottom-edge" &&
      lastVisibleRootPageId &&
      page.id === lastVisibleRootPageId &&
      isDropAfterTarget
  );
  const itemStyle = {
    "--docsera-page-tree-action-count": String(actionCount),
    "--docsera-page-tree-drop-start": `${depth * 16}px`
  } as CSSProperties;
  function handleRowClick() {
    onSelectPage(page.id);
    if (hasChildren) {
      onToggleCollapsed(page.id);
    }
  }

  function openContextMenu(input: {
    clientX: number;
    clientY: number;
    currentTarget: EventTarget | null;
    preventDefault: () => void;
    stopPropagation: () => void;
  }) {
    if (!hasContextMenuActions || !(input.currentTarget instanceof HTMLElement)) {
      return;
    }

    input.preventDefault();
    input.stopPropagation();
    onShowPageContextMenu({
      origin: input.currentTarget,
      placement: "pointer",
      page,
      x: input.clientX,
      y: input.clientY,
      anchorY: input.clientY
    });
  }

  return (
    <li
      className={`docsera-page-tree__item${isDropBeforeTarget && !isRootBeforeEdge ? " docsera-page-tree__item--drop-before" : ""}${
        isDropAfterTarget && !isRootAfterEdge ? " docsera-page-tree__item--drop-after" : ""
      }`}
      data-docsera-page-tree-depth={depth}
      style={itemStyle}
    >
      {isDropBeforeTarget && !isRootBeforeEdge ? (
        <span className="docsera-page-tree__drop-indicator docsera-page-tree__drop-indicator--before" aria-hidden="true" />
      ) : null}
      <div
        className={`docsera-page-tree__row${isSelected ? " docsera-page-tree__row--selected" : ""}${
          isPageSettingsOpen ? " docsera-page-tree__row--settings-open" : ""
        }${isContextMenuOpen ? " docsera-page-tree__row--menu-open" : ""}${draggedPageId === page.id ? " docsera-page-tree__row--dragging" : ""}${
          isDropInsideTarget ? " docsera-page-tree__row--drop-inside" : ""
        }`}
        data-docsera-page-id={page.id}
        data-docsera-page-tree-depth={depth}
        draggable={canMovePage}
        onContextMenu={openContextMenu}
        onDragEnd={canMovePage ? onDragEnd : undefined}
        onDragStart={
          canMovePage
            ? (event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", page.id);
              onDragStart(page.id);
            }
            : undefined
        }
      >
        {isInlineRenaming ? (
          <div className="docsera-page-tree__button docsera-page-tree__button--inline-rename">
            <span className="docsera-page-tree__row-main">
              {hasChildren ? (
                <span className="docsera-page-tree__chevron" aria-hidden="true">
                  <ChevronIcon expanded={isExpanded} />
                </span>
              ) : (
                <span className="docsera-page-tree__chevron-spacer" aria-hidden="true" />
              )}
              <InlineRenameField
                errorMessage={inlineRenameErrorMessage}
                pageId={pageIdentity}
                pageTitle={page.title}
                value={inlineRenameValue}
                onCancel={onCancelInlineRename}
                onCommit={onCommitInlineRename}
                onTitleChange={onInlineRenameTitleChange}
              />
            </span>
          </div>
        ) : (
          <button
            type="button"
            className="docsera-page-tree__button"
            onClick={handleRowClick}
            onKeyDown={(event) => {
              if (event.key !== "ContextMenu" && !(event.shiftKey && event.key === "F10")) {
                return;
              }

              const rect = event.currentTarget.getBoundingClientRect();
              openContextMenu({
                clientX: rect.left + Math.min(32, Math.max(0, rect.width / 2)),
                clientY: rect.top + Math.min(24, Math.max(0, rect.height)),
                currentTarget: event.currentTarget,
                preventDefault: () => event.preventDefault(),
                stopPropagation: () => event.stopPropagation()
              });
            }}
            aria-current={isSelected ? "page" : undefined}
            aria-expanded={hasChildren ? isExpanded : undefined}
          >
            <span className="docsera-page-tree__row-main">
              {hasChildren ? (
                <span className="docsera-page-tree__chevron" aria-hidden="true">
                  <ChevronIcon expanded={isExpanded} />
                </span>
              ) : (
                <span className="docsera-page-tree__chevron-spacer" aria-hidden="true" />
              )}
              <span className="docsera-page-tree__title">{page.title}</span>
            </span>
          </button>
        )}

        {actionCount > 0 ? (
          <div className="docsera-page-tree__actions">
            {showChildCreateButton ? (
              <DocseraCompactTooltip label={`Add child page to ${page.title}`}>
                <button
                  type="button"
                  className="docsera-page-tree__action-button"
                  aria-label={`Add child page to ${page.title}`}
                  onClick={() => onShowChildPageCreate(pageIdentity, page.title)}
                  disabled={isCreatingPage}
                >
                  <PlusIcon />
                </button>
              </DocseraCompactTooltip>
            ) : null}
            {showActionsButton ? (
              <span className="docsera-page-tree__action-slot" onClick={(event) => event.stopPropagation()}>
                <DocseraCompactTooltip label={`Page actions for ${page.title}`}>
                  <button
                    type="button"
                    className="docsera-page-tree__action-button docsera-page-tree__action-button--actions"
                    data-menu-open={isContextMenuOpen || undefined}
                    aria-label={`Page actions for ${page.title}`}
                    aria-haspopup="menu"
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      const rect = event.currentTarget.getBoundingClientRect();
                      onShowPageContextMenu({
                        origin: event.currentTarget,
                        placement: "control",
                        page,
                        x: rect.left,
                        y: rect.bottom + CONTEXT_MENU_CONTROL_OFFSET,
                        anchorY: rect.bottom + CONTEXT_MENU_CONTROL_OFFSET
                      });
                    }}
                  >
                    <EllipsisIcon />
                  </button>
                </DocseraCompactTooltip>
              </span>
            ) : null}
          </div>
        ) : null}
      </div>

      {hasChildren && isExpanded ? (
        <ul className="docsera-page-tree__children">
          {page.children?.map((child) => (
            <PageTreeNode
              key={child.id}
              canCreatePage={canCreatePage}
              canManagePageSettings={canManagePageSettings}
              collapsedPageIds={collapsedPageIds}
              depth={depth + 1}
              dropPreview={dropPreview}
              filterText={filterText}
              inlineCreateState={inlineCreateState}
              isCreatingPage={isCreatingPage}
              onCommitInlineCreate={onCommitInlineCreate}
              inlineRenamePageId={inlineRenamePageId}
              inlineRenameErrorMessage={inlineRenameErrorMessage}
              inlineRenameValue={inlineRenameValue}
              draggedPageId={draggedPageId}
              onCancelInlineRename={onCancelInlineRename}
              onCommitInlineRename={onCommitInlineRename}
              onDragEnd={onDragEnd}
              onDragStart={onDragStart}
              onInlineCreateTitleChange={onInlineCreateTitleChange}
              onInlineRenameTitleChange={onInlineRenameTitleChange}
              onSelectPage={onSelectPage}
              onMovePage={onMovePage}
              onRequestDeletePage={onRequestDeletePage}
              onStartInlineRename={onStartInlineRename}
              onShowChildPageCreate={onShowChildPageCreate}
              onShowCreatePage={() => undefined}
              onShowPageContextMenu={onShowPageContextMenu}
              onToggleCollapsed={onToggleCollapsed}
              onTogglePageSettings={onTogglePageSettings}
              page={child}
              contextMenuPageId={contextMenuPageId}
              firstVisibleRootPageId={firstVisibleRootPageId}
              lastVisibleRootPageId={lastVisibleRootPageId}
              pageSettingsOpenPageId={pageSettingsOpenPageId}
              pages={[]}
              selectedPageId={selectedPageId}
            />
          ))}
        </ul>
      ) : null}
      {isInlineCreateParent ? (
        <ul className="docsera-page-tree__children">
          <InlineCreateRow
            depth={depth + 1}
            errorMessage={inlineCreateState.errorMessage}
            focusToken={inlineCreateState.focusToken}
            noticeMessage={inlineCreateState.noticeMessage}
            pending={inlineCreateState.pending}
            showInput={inlineCreateState.showInput}
            title={inlineCreateState.title}
            onCommit={onCommitInlineCreate}
            onTitleChange={onInlineCreateTitleChange}
          />
        </ul>
      ) : null}
      {isDropAfterTarget && !isRootAfterEdge ? (
        <span className="docsera-page-tree__drop-indicator docsera-page-tree__drop-indicator--after" aria-hidden="true" />
      ) : null}
    </li>
  );
}

export function PageTree({
  canCreatePage,
  canManagePageSettings,
  dragSurfaceRef,
  filterText,
  inlineCreateState,
  inlineRenameErrorMessage = "",
  inlineRenamePageId = "",
  inlineRenameValue = "",
  isCreatingPage,
  onCancelInlineRename = () => undefined,
  onCommitInlineCreate,
  onCommitInlineRename = () => true,
  onInlineCreateTitleChange,
  onInlineRenameTitleChange = () => undefined,
  onSelectPage,
  onMovePage,
  onRequestDeletePage,
  onStartInlineRename = () => undefined,
  onShowCreatePage,
  onShowChildPageCreate,
  onTogglePageSettings,
  pageSettingsOpenPageId,
  pages,
  selectedPageId,
  collapsedPageIds = [],
  navigationCollapsed = false,
  onCollapsedPageIdsChange,
  treeViewportRef
}: PageTreeProps) {
  const canMovePage = Boolean(onMovePage && canManagePageSettings);
  const [localCollapsedPageIds, setLocalCollapsedPageIds] = useState<Set<string>>(() => new Set(collapsedPageIds));
  const [draggedPageId, setDraggedPageId] = useState("");
  const [dropPreview, setDropPreview] = useState<PageTreeDropPreviewState | null>(null);
  const [contextMenu, setContextMenu] = useState<PageTreeContextMenuState | null>(null);
  const contextMenuPresence = useDropdownExitPresence(contextMenu);
  const menuRef = useRef<HTMLDivElement>(null);
  const draggedPageIdRef = useRef("");
  const effectiveCollapsedPageIds = useMemo(() => new Set(collapsedPageIds), [collapsedPageIds]);
  const visiblePages = useMemo(() => pages.filter((page) => matchesTreeFilter(page, filterText)), [filterText, pages]);
  const firstVisibleRootPageId = visiblePages[0]?.id ?? null;
  const lastVisibleRootPageId = visiblePages[visiblePages.length - 1]?.id ?? null;
  const flatPages = useMemo(() => flattenPages(pages), [pages]);
  const pagesById = useMemo(() => new Map(flatPages.map((page) => [page.id, page])), [flatPages]);
  const pagesByParent = useMemo(() => {
    const groups = new Map<string, WorkspacePageView[]>();
    for (const page of flatPages) {
      const key = page.parentPageSysId ?? "";
      const siblings = groups.get(key) ?? [];
      siblings.push(page);
      groups.set(key, siblings);
    }
    for (const siblings of groups.values()) {
      siblings.sort((left, right) => left.siblingOrder - right.siblingOrder);
    }
    return groups;
  }, [flatPages]);
  const contextMenuPageId = contextMenu ? contextMenu.page.sysId || contextMenu.page.id : "";
  const dragContextRef = useRef({
    canManagePageSettings,
    firstVisibleRootPageId,
    lastVisibleRootPageId,
    onMovePage,
    pagesById,
    pagesByParent
  });

  useEffect(() => {
    setLocalCollapsedPageIds(new Set(collapsedPageIds));
  }, [collapsedPageIds]);

  useEffect(() => {
    if (navigationCollapsed) {
      setContextMenu(null);
    }
  }, [navigationCollapsed]);

  dragContextRef.current = {
    canManagePageSettings,
    firstVisibleRootPageId,
    lastVisibleRootPageId,
    onMovePage,
    pagesById,
    pagesByParent
  };

  const contextMenuActions = useMemo(() => {
    const actions: PageTreeContextMenuAction[] = [];
    if (canManagePageSettings) {
      actions.push("settings", "rename");
    }
    if (canCreatePage && !isCreatingPage) {
      actions.push("add-child");
    }
    if (canManagePageSettings) {
      actions.push("delete");
    }
    return actions;
  }, [canCreatePage, canManagePageSettings, isCreatingPage]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    const firstItem = menuRef.current?.querySelector<HTMLButtonElement>("[role='menuitem']");
    firstItem?.focus();
  }, [contextMenu]);

  useEffect(() => {
    if (!contextMenu) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && menuRef.current?.contains(event.target)) {
        return;
      }

      setContextMenu(null);
    }

    window.addEventListener("pointerdown", handlePointerDown, true);
    return () => window.removeEventListener("pointerdown", handlePointerDown, true);
  }, [contextMenu]);

  useLayoutEffect(() => {
    if (!contextMenu || !menuRef.current) {
      return;
    }

    const nextPosition = resolveContextMenuViewportPosition(contextMenu, menuRef.current);
    if (nextPosition.x === contextMenu.x && nextPosition.y === contextMenu.y) {
      return;
    }

    setContextMenu({ ...contextMenu, ...nextPosition });
  }, [contextMenu]);

  function closeContextMenu(options: { restoreFocus?: boolean } = {}) {
    const origin = contextMenu?.origin ?? null;
    setContextMenu(null);
    if (options.restoreFocus) {
      window.setTimeout(() => origin?.focus(), 0);
    }
  }

  function activateContextMenuAction(action: PageTreeContextMenuAction) {
    const target = contextMenu?.page;
    if (!target) {
      return;
    }

    setContextMenu(null);
    if (action === "add-child") {
      onShowChildPageCreate(target.sysId || target.id, target.title);
      return;
    }
    if (action === "settings") {
      onTogglePageSettings(target.sysId || target.id);
      return;
    }
    if (action === "rename") {
      onStartInlineRename(target.sysId || target.id);
      return;
    }
    onRequestDeletePage(target.sysId || target.id);
  }

  function focusMenuItem(offset: number) {
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? [])];
    const currentIndex = items.findIndex((item) => item === document.activeElement);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + offset + items.length) % items.length;
    items[nextIndex]?.focus();
  }

  function focusMenuBoundary(position: "first" | "last") {
    const items = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("[role='menuitem']") ?? [])];
    const nextItem = position === "first" ? items[0] : items[items.length - 1];
    nextItem?.focus();
  }

  function toggleCollapsed(pageId: string) {
    const next = new Set(localCollapsedPageIds);
    if (next.has(pageId)) {
      next.delete(pageId);
    } else {
      next.add(pageId);
    }

    const nextCollapsedPageIds = [...next];
    setLocalCollapsedPageIds(next);
    onCollapsedPageIdsChange?.(nextCollapsedPageIds);
  }

  function resolveDropPreview(surfaceElement: HTMLElement, treeElement: HTMLElement, pointerY: number): PageTreeDropPreviewState | null {
    if (!draggedPageIdRef.current) {
      setDropPreview(null);
      return null;
    }

    const { firstVisibleRootPageId: currentFirstVisibleRootPageId, lastVisibleRootPageId: currentLastVisibleRootPageId, pagesById: currentPagesById, pagesByParent: currentPagesByParent } =
      dragContextRef.current;

    return readTreeDropPreview(surfaceElement, treeElement, {
      draggedPageId: draggedPageIdRef.current,
      firstVisibleRootPageId: currentFirstVisibleRootPageId,
      lastVisibleRootPageId: currentLastVisibleRootPageId,
      pagesById: currentPagesById,
      pagesByParent: currentPagesByParent,
      pointerY
    });
  }

  function clearDropDestination(event: { currentTarget: EventTarget | null; relatedTarget: EventTarget | null }) {
    if (isDragEventInsideCurrentTarget(event)) {
      return;
    }

    setDropPreview(null);
  }

  function acceptInternalPageDrag(event: { preventDefault: () => void; dataTransfer: DataTransfer | null }) {
    if (!draggedPageIdRef.current) {
      return false;
    }

    event.preventDefault();

    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }

    return true;
  }

  useEffect(() => {
    const dragSurfaceElement = dragSurfaceRef?.current;
    const treeElement = treeViewportRef?.current ?? dragSurfaceElement;
    if (!canMovePage || !dragSurfaceElement || !treeElement) {
      return;
    }
    const activeDragSurfaceElement = dragSurfaceElement;
    const activeTreeElement = treeElement;

    function handleDragEnter(event: globalThis.DragEvent) {
      acceptInternalPageDrag(event);
    }

    function handleDragOver(event: globalThis.DragEvent) {
      if (!acceptInternalPageDrag(event)) {
        setDropPreview(null);
        return;
      }

      const nextPreview = resolveDropPreview(activeDragSurfaceElement, activeTreeElement, event.clientY);
      setDropPreview((current) => (sameDropPreview(current, nextPreview) ? current : nextPreview));
    }

    function handleDragLeave(event: globalThis.DragEvent) {
      if (
        isDragEventInsideCurrentTarget({
          currentTarget: activeDragSurfaceElement,
          relatedTarget: event.relatedTarget
        })
      ) {
        return;
      }

      setDropPreview(null);
    }

    function handleDrop(event: globalThis.DragEvent) {
      const { canManagePageSettings: currentCanManagePageSettings, onMovePage: currentOnMovePage } = dragContextRef.current;
      const activeDraggedPageId = draggedPageIdRef.current;
      if (!activeDraggedPageId || !currentOnMovePage || !currentCanManagePageSettings) {
        setDropPreview(null);
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      const destination = resolveDropPreview(activeDragSurfaceElement, activeTreeElement, event.clientY)?.destination ?? null;
      setDropPreview(null);
      if (!destination) {
        setDraggedPageId("");
        draggedPageIdRef.current = "";
        return;
      }

      currentOnMovePage({
        pageSysId: destination.pageSysId,
        parentPageSysId: destination.parentPageSysId,
        siblingOrder: destination.siblingOrder
      });
      setDraggedPageId("");
      draggedPageIdRef.current = "";
    }

    dragSurfaceElement.addEventListener("dragenter", handleDragEnter, true);
    dragSurfaceElement.addEventListener("dragover", handleDragOver, true);
    dragSurfaceElement.addEventListener("dragleave", handleDragLeave);
    dragSurfaceElement.addEventListener("drop", handleDrop);

    return () => {
      dragSurfaceElement.removeEventListener("dragenter", handleDragEnter, true);
      dragSurfaceElement.removeEventListener("dragover", handleDragOver, true);
      dragSurfaceElement.removeEventListener("dragleave", handleDragLeave);
      dragSurfaceElement.removeEventListener("drop", handleDrop);
    };
  }, [canMovePage, dragSurfaceRef, treeViewportRef]);

  const contextMenuElement =
    contextMenuPresence.item && contextMenuActions.length > 0
      ? createPortal(
          <div
            ref={menuRef}
            className={`docsera-page-tree__context-menu docsera-page-tree__context-menu--${contextMenuPresence.item.placement}`}
            data-docsera-dropdown-motion={contextMenuPresence.open ? "enter" : "exit"}
            {...(!contextMenuPresence.open ? { inert: "" } : {})}
            aria-hidden={!contextMenuPresence.open || undefined}
            role="menu"
            aria-label={`Page actions for ${contextMenuPresence.item.page.title}`}
            style={{ left: `${contextMenuPresence.item.x}px`, top: `${contextMenuPresence.item.y}px` }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                closeContextMenu({ restoreFocus: true });
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                focusMenuItem(1);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                focusMenuItem(-1);
              } else if (event.key === "Home") {
                event.preventDefault();
                focusMenuBoundary("first");
              } else if (event.key === "End") {
                event.preventDefault();
                focusMenuBoundary("last");
              } else if (event.key === "Enter" || event.key === " ") {
                const action = event.target instanceof HTMLElement ? event.target.dataset.docseraPageTreeMenuAction : "";
                if (action === "add-child" || action === "settings" || action === "rename" || action === "delete") {
                  event.preventDefault();
                  activateContextMenuAction(action);
                }
              }
            }}
          >
            {contextMenuActions.map((action) => (
              <button
                key={action}
                type="button"
                role="menuitem"
                className={`docsera-page-tree__context-menu-item${
                  action === "delete" ? " docsera-page-tree__context-menu-item--destructive" : ""
                }`}
                data-docsera-page-tree-menu-action={action}
                onClick={() => activateContextMenuAction(action)}
              >
                <span className="docsera-page-tree__context-menu-icon" aria-hidden="true">
                  <PageTreeMenuIcon action={action} />
                </span>
                <span>
                  {action === "settings"
                    ? "Page settings"
                    : action === "rename"
                      ? "Rename"
                      : action === "delete"
                        ? "Delete"
                        : "Add child page"}
                </span>
              </button>
            ))}
          </div>,
          document.body
        )
      : null;

  return (
    <>
    <div
      className="docsera-page-tree__list"
      onDragLeave={!dragSurfaceRef && canMovePage ? clearDropDestination : undefined}
      onDragOver={
        !dragSurfaceRef && canMovePage
          ? (event) => {
              if (!acceptInternalPageDrag(event)) {
                setDropPreview(null);
                return;
              }

              const nextPreview = resolveDropPreview(event.currentTarget, event.currentTarget, event.clientY);
              setDropPreview((current) => (sameDropPreview(current, nextPreview) ? current : nextPreview));
            }
          : undefined
      }
      onDrop={
        !dragSurfaceRef && canMovePage
          ? (event) => {
            event.preventDefault();
            event.stopPropagation();
            const destination = resolveDropPreview(event.currentTarget, event.currentTarget, event.clientY)?.destination ?? null;
            setDropPreview(null);
            if (!destination) {
              setDraggedPageId("");
              draggedPageIdRef.current = "";
              return;
            }

            onMovePage?.({
              pageSysId: destination.pageSysId,
              parentPageSysId: destination.parentPageSysId,
              siblingOrder: destination.siblingOrder
            });
            setDraggedPageId("");
            draggedPageIdRef.current = "";
          }
          : undefined
      }
    >
      <div className="docsera-page-tree__drop-layer" aria-hidden="true">
        {dropPreview?.placement === "top-edge" && dropPreview.edgeLineOffset !== null ? (
          <span
            className="docsera-page-tree__drop-edge-line docsera-page-tree__drop-edge-line--top"
            style={{ top: `${dropPreview.edgeLineOffset}px` }}
          />
        ) : null}
        {dropPreview?.placement === "bottom-edge" && dropPreview.edgeLineOffset !== null ? (
          <span
            className="docsera-page-tree__drop-edge-line docsera-page-tree__drop-edge-line--bottom"
            style={{ top: `${dropPreview.edgeLineOffset}px` }}
          />
        ) : null}
      </div>
      <ul className="docsera-page-tree__items">
        {visiblePages.map((page) => (
          <PageTreeNode
            key={page.id}
            canCreatePage={canCreatePage}
            canManagePageSettings={canManagePageSettings}
            collapsedPageIds={effectiveCollapsedPageIds.size > 0 ? effectiveCollapsedPageIds : localCollapsedPageIds}
            depth={0}
            draggedPageId={draggedPageId}
            dropPreview={dropPreview}
            filterText={filterText}
            inlineCreateState={inlineCreateState}
            isCreatingPage={isCreatingPage}
            onCommitInlineCreate={onCommitInlineCreate}
            inlineRenamePageId={inlineRenamePageId}
            inlineRenameErrorMessage={inlineRenameErrorMessage}
            inlineRenameValue={inlineRenameValue}
            onDragEnd={() => {
              setDraggedPageId("");
              draggedPageIdRef.current = "";
              setDropPreview(null);
            }}
            onDragStart={(pageId) => {
              draggedPageIdRef.current = pageId;
              setDraggedPageId(pageId);
              setDropPreview(null);
            }}
            onCancelInlineRename={onCancelInlineRename}
            onCommitInlineRename={onCommitInlineRename}
            onInlineCreateTitleChange={onInlineCreateTitleChange}
            onInlineRenameTitleChange={onInlineRenameTitleChange}
            onSelectPage={onSelectPage}
            onMovePage={onMovePage}
            onRequestDeletePage={onRequestDeletePage}
            onStartInlineRename={onStartInlineRename}
            onShowChildPageCreate={onShowChildPageCreate}
            onShowCreatePage={onShowCreatePage}
            onShowPageContextMenu={(input) => {
              if (!contextMenuActions.length) {
                return;
              }
              setContextMenu(input);
            }}
            onToggleCollapsed={toggleCollapsed}
            onTogglePageSettings={onTogglePageSettings}
            page={page}
            contextMenuPageId={contextMenuPageId}
            firstVisibleRootPageId={firstVisibleRootPageId}
            lastVisibleRootPageId={lastVisibleRootPageId}
            pageSettingsOpenPageId={pageSettingsOpenPageId}
            pages={pages}
            selectedPageId={selectedPageId}
          />
        ))}
        {canCreatePage && inlineCreateState && !inlineCreateState.parentPageSysId ? (
          <InlineCreateRow
            depth={0}
            errorMessage={inlineCreateState.errorMessage}
            focusToken={inlineCreateState.focusToken}
            noticeMessage={inlineCreateState.noticeMessage}
            pending={inlineCreateState.pending}
            showInput={inlineCreateState.showInput}
            title={inlineCreateState.title}
            onCommit={onCommitInlineCreate}
            onTitleChange={onInlineCreateTitleChange}
          />
        ) : null}
        {canCreatePage ? (
          <li className="docsera-page-tree__item docsera-page-tree__item--new-page">
            <button
              type="button"
              className="docsera-page-tree__new-page"
              onClick={onShowCreatePage}
              disabled={isCreatingPage}
            >
              <span className="docsera-page-tree__new-page-icon-slot" aria-hidden="true">
                <PlusIcon />
              </span>
              <span>New page</span>
            </button>
          </li>
        ) : null}
      </ul>
    </div>
    {contextMenuElement}
    </>
  );
}
