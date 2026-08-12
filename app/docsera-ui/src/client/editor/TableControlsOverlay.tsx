import type { Editor as TiptapEditor } from "@tiptap/core";
import {
  CellSelection,
  findCellPos,
  findTable,
  selectionCell,
  selectedRect,
  TableMap,
} from "@tiptap/pm/tables";
import { EllipsisVertical, MoreHorizontal, Plus } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { closeHistory } from "prosemirror-history";
import { COMPACT_MENU_STYLES } from "./CompactMenuStyles";

type TableControlsOverlayProps = {
  editor: TiptapEditor | null;
  overlayRoot: HTMLElement;
};

type TableContext = {
  map: TableMap;
  tableNode: TiptapEditor["state"]["doc"];
  tablePos: number;
  tableStart: number;
};

type TableLayout = {
  columnCenters: number[];
  columnTopBorderAnchorYs: number[];
  map: TableMap;
  rowCenters: number[];
  rowLeftBorderAnchorXs: number[];
  tableNode: TiptapEditor["state"]["doc"];
  tablePos: number;
  tableRect: DOMRect;
  tableStart: number;
  tableWrapper: HTMLElement;
  wrapperOverflowX: boolean;
  wrapperRect: DOMRect;
  wrapperScrollbarHeightPx: number;
};

type TableOverlayState = TableLayout & {
  selectedColumnIndexes: number[];
  selectedRowIndexes: number[];
};

type TableMenuState =
  | {
      index: number;
      kind: "row";
      tablePos: number;
    }
  | {
      index: number;
      kind: "column";
      tablePos: number;
    };

const ROW_PILL_WIDTH_PX = 8;
const ROW_PILL_COMPACT_HEIGHT_PX = 18;
const ROW_PILL_EXPANDED_HEIGHT_PX = 28;
const ROW_PILL_HITBOX_WIDTH_PX = 26;
const ROW_PILL_HITBOX_HEIGHT_PX = 42;
const COLUMN_PILL_HEIGHT_PX = 8;
const COLUMN_PILL_COMPACT_WIDTH_PX = 18;
const COLUMN_PILL_EXPANDED_WIDTH_PX = 28;
const COLUMN_PILL_HITBOX_WIDTH_PX = 42;
const COLUMN_PILL_HITBOX_HEIGHT_PX = 26;
const COLUMN_ADD_RAIL_WIDTH_PX = 22;
const ROW_ADD_RAIL_HEIGHT_PX = 22;
const TABLE_CONTROL_MENU_GAP_PX = 10;
const TABLE_CONTROL_RAIL_GAP_PX = 4;
const TABLE_CONTROL_VIEWPORT_EDGE_PX = 12;
const TABLE_CONTROL_MENU_MIN_WIDTH_PX = 190;
const TABLE_CONTROL_MENU_MIN_HEIGHT_PX = 118;
const TABLE_CONTROL_OVERLAY_Z_INDEX = 126;
const TABLE_CONTROL_MENU_Z_INDEX = 130;
const PILL_TRANSITION_DURATION_MS = 140;
const PILL_ICON_TRANSITION_DURATION_MS = 110;
const WRAPPER_SCROLLBAR_HEIGHT_FALLBACK_PX = 8;
const HANDLE_ICON_SIZE_PX = 12;
const HANDLE_ICON_SLOT_SIZE_PX = 12;
const HANDLE_ICON_STROKE_WIDTH = 2.2;

const TABLE_CONTROLS_OVERLAY_STYLES = `
  .docsera-table-controls-overlay {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: ${TABLE_CONTROL_OVERLAY_Z_INDEX};
  }

  .docsera-table-controls-overlay__pill {
    position: fixed;
    display: grid;
    place-items: center;
    border: none;
    background: transparent;
    padding: 0;
    margin: 0;
    appearance: none;
    pointer-events: auto;
    cursor: pointer;
  }

  .docsera-table-controls-overlay__pill-shell {
    grid-area: 1 / 1;
    display: grid;
    place-items: center;
    position: relative;
    z-index: 0;
    overflow: hidden;
    border-radius: 9999px;
    box-sizing: border-box;
    border: 1px solid var(--docsera-editor-panel-border);
    background: color-mix(in srgb, var(--docsera-editor-panel) 94%, var(--docsera-editor-primary) 6%);
    color: var(--docsera-editor-muted);
    box-shadow:
      0 1px 2px color-mix(in srgb, var(--docsera-editor-text) 10%, transparent),
      0 0 0 1px color-mix(in srgb, var(--docsera-editor-panel-border) 58%, transparent);
    will-change: width, height, opacity;
    transition:
      width ${PILL_TRANSITION_DURATION_MS}ms ease,
      height ${PILL_TRANSITION_DURATION_MS}ms ease,
      opacity ${PILL_TRANSITION_DURATION_MS}ms ease,
      border-color ${PILL_TRANSITION_DURATION_MS}ms ease,
      background-color ${PILL_TRANSITION_DURATION_MS}ms ease,
      box-shadow ${PILL_TRANSITION_DURATION_MS}ms ease;
  }

  .docsera-table-controls-overlay__pill[data-docsera-table-handle-accented="true"] .docsera-table-controls-overlay__pill-shell {
    border-color: color-mix(in srgb, var(--docsera-editor-primary) 72%, var(--docsera-editor-panel-border));
    background: color-mix(in srgb, var(--docsera-editor-panel) 88%, var(--docsera-editor-primary) 12%);
    box-shadow:
      0 1px 2px color-mix(in srgb, var(--docsera-editor-text) 10%, transparent),
      0 0 0 1px color-mix(in srgb, var(--docsera-editor-primary) 28%, transparent);
  }

  .docsera-table-controls-overlay__pill[data-docsera-table-handle-expanded="true"] .docsera-table-controls-overlay__pill-shell,
  .docsera-table-controls-overlay__pill:hover .docsera-table-controls-overlay__pill-shell,
  .docsera-table-controls-overlay__pill:focus-visible .docsera-table-controls-overlay__pill-shell {
    box-shadow:
      0 1px 2px color-mix(in srgb, var(--docsera-editor-text) 10%, transparent),
      0 0 0 1px color-mix(in srgb, var(--docsera-editor-primary) 28%, transparent);
  }

  .docsera-table-controls-overlay__pill-icon {
    grid-area: 1 / 1;
    display: grid;
    place-items: center;
    position: relative;
    z-index: 1;
    width: ${HANDLE_ICON_SLOT_SIZE_PX}px;
    height: ${HANDLE_ICON_SLOT_SIZE_PX}px;
    pointer-events: none;
    opacity: 0;
    transition: opacity ${PILL_ICON_TRANSITION_DURATION_MS}ms ease;
  }

  .docsera-table-controls-overlay__pill[data-docsera-table-handle-expanded="true"] .docsera-table-controls-overlay__pill-icon,
  .docsera-table-controls-overlay__pill:hover .docsera-table-controls-overlay__pill-icon,
  .docsera-table-controls-overlay__pill:focus-visible .docsera-table-controls-overlay__pill-icon {
    opacity: 1;
  }

  .docsera-table-controls-overlay__rail {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    box-sizing: border-box;
    border: 1px solid var(--docsera-editor-panel-border);
    border-radius: 11px;
    background: color-mix(in srgb, var(--docsera-editor-panel) 94%, var(--docsera-editor-primary) 6%);
    box-shadow:
      0 1px 2px color-mix(in srgb, var(--docsera-editor-text) 10%, transparent),
      0 0 0 1px color-mix(in srgb, var(--docsera-editor-panel-border) 58%, transparent);
  }

  .docsera-table-controls-overlay__rail-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    padding: 0;
    border: none;
    border-radius: inherit;
    background: transparent;
    cursor: pointer;
    color: var(--docsera-editor-muted);
    transition:
      background-color 120ms ease,
      color 120ms ease;
  }

  .docsera-table-controls-overlay__rail-button:hover,
  .docsera-table-controls-overlay__rail-button:focus-visible {
    background: color-mix(in srgb, var(--docsera-editor-panel) 84%, var(--docsera-editor-primary) 16%);
    color: var(--docsera-editor-primary);
  }

  .docsera-table-controls-overlay__menu {
    position: fixed;
    pointer-events: auto;
    z-index: ${TABLE_CONTROL_MENU_Z_INDEX};
    max-width: min(256px, calc(100vw - 24px));
    max-height: min(320px, calc(100vh - 24px));
    overflow: auto;
  }

  .docsera-table-controls-overlay__menu-item--destructive,
  .docsera-table-controls-overlay__menu-item--destructive:hover,
  .docsera-table-controls-overlay__menu-item--destructive:focus-visible {
    color: var(--docsera-error);
  }

  .docsera-table-controls-overlay__menu-item--destructive:hover,
  .docsera-table-controls-overlay__menu-item--destructive:focus-visible {
    border-color: color-mix(in srgb, var(--docsera-error) 20%, var(--docsera-border));
    background: color-mix(in srgb, var(--docsera-error) 10%, var(--docsera-surface));
  }
`;

const uniqueSorted = (values: number[]): number[] =>
  Array.from(new Set(values)).sort((left, right) => left - right);

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, max));

const getOverlayOwnerWindow = (overlayRoot: HTMLElement): Window | null => overlayRoot.ownerDocument.defaultView;

const getLiveTableContext = (
  editor: TiptapEditor
): TableContext | null => {
  const selection = editor.state.selection as { $from?: unknown } | null | undefined;
  if (!selection?.$from) return null;

  const currentTable = findTable(selection.$from as Parameters<typeof findTable>[0]);
  if (!currentTable) return null;

  return {
    tablePos: currentTable.pos,
    tableStart: currentTable.start,
    tableNode: currentTable.node,
    map: TableMap.get(currentTable.node),
  };
};

const getLiveTableContextFromTablePos = (
  editor: TiptapEditor,
  tablePos: number
): TableContext | null => {
  const nodeAtTablePos = editor.state.doc.nodeAt(tablePos);
  if (!nodeAtTablePos || nodeAtTablePos.type.name !== "table") return null;

  return {
    tablePos,
    tableStart: tablePos + 1,
    tableNode: nodeAtTablePos,
    map: TableMap.get(nodeAtTablePos),
  };
};

export default function TableControlsOverlay({
  editor,
  overlayRoot,
}: TableControlsOverlayProps) {
  const [overlayState, setOverlayState] = useState<TableOverlayState | null>(null);
  const [menuState, setMenuState] = useState<TableMenuState | null>(null);
  const [hoveredCellIndexes, setHoveredCellIndexes] = useState<{
    rowIndex: number | null;
    columnIndex: number | null;
  }>({
    rowIndex: null,
    columnIndex: null,
  });
  const [hoveredHandle, setHoveredHandle] = useState<{ kind: "row" | "column"; index: number } | null>(
    null
  );
  const menuRef = useRef<HTMLDivElement | null>(null);
  const ownerWindow = getOverlayOwnerWindow(overlayRoot);

  const refreshOverlayState = useCallback(() => {
    if (!editor || editor.isDestroyed) {
      setOverlayState(null);
      return;
    }

    const tableContext = getLiveTableContext(editor);
    if (!tableContext) {
      setOverlayState(null);
      return;
    }

    const layout = resolveTableLayoutFromContext(editor, tableContext);
    if (!layout) {
      setOverlayState(null);
      return;
    }

    setOverlayState({
      ...layout,
      ...resolveSelectedTableIndexes(editor),
    });
  }, [editor]);

  useLayoutEffect(() => {
    if (!editor || !ownerWindow) {
      setOverlayState(null);
      return;
    }

    const ownerDocument = overlayRoot.ownerDocument;

    let pendingRefreshRafId: number | null = null;

    const hasRequestAnimationFrame = typeof ownerWindow.requestAnimationFrame === "function";
    const canSubscribeToEditor = typeof editor.on === "function" && typeof editor.off === "function";
    const scheduleRefresh = () => {
      if (!hasRequestAnimationFrame) {
        refreshOverlayState();
        return;
      }

      if (pendingRefreshRafId !== null) {
        ownerWindow.cancelAnimationFrame(pendingRefreshRafId);
      }

      pendingRefreshRafId = ownerWindow.requestAnimationFrame(() => {
        pendingRefreshRafId = null;
        refreshOverlayState();
      });
    };

    scheduleRefresh();
    if (!canSubscribeToEditor) {
      return () => {
        if (hasRequestAnimationFrame && pendingRefreshRafId !== null) {
          ownerWindow.cancelAnimationFrame(pendingRefreshRafId);
        }
      };
    }

    editor.on("selectionUpdate", scheduleRefresh);
    editor.on("transaction", scheduleRefresh);

    ownerDocument.addEventListener("scroll", scheduleRefresh, true);
    ownerWindow.addEventListener("resize", scheduleRefresh);

    return () => {
      editor.off("selectionUpdate", scheduleRefresh);
      editor.off("transaction", scheduleRefresh);
      ownerDocument.removeEventListener("scroll", scheduleRefresh, true);
      ownerWindow.removeEventListener("resize", scheduleRefresh);
      if (hasRequestAnimationFrame && pendingRefreshRafId !== null) {
        ownerWindow.cancelAnimationFrame(pendingRefreshRafId);
      }
    };
  }, [editor, overlayRoot, ownerWindow, refreshOverlayState]);

  useEffect(() => {
    if (!editor) return;

    if (!ownerWindow) return;
    const ownerDocument = overlayRoot.ownerDocument;

    const updateHoveredCellIndexes = (next: {
      rowIndex: number | null;
      columnIndex: number | null;
    }) => {
      setHoveredCellIndexes((previous) => {
        if (
          previous.rowIndex === next.rowIndex &&
          previous.columnIndex === next.columnIndex
        ) {
          return previous;
        }
        return next;
      });
    };

    const handlePointerMove = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        updateHoveredCellIndexes({ rowIndex: null, columnIndex: null });
        return;
      }

      if (target.closest("[data-docsera-table-handle='true'], [data-docsera-table-menu='true']")) {
        return;
      }

      const activeContext = getLiveTableContext(editor);
      if (!activeContext) {
        updateHoveredCellIndexes({ rowIndex: null, columnIndex: null });
        return;
      }

      const activeNodeDom = editor.view.nodeDOM(activeContext.tablePos);
      const activeTableElement =
        activeNodeDom instanceof HTMLTableElement
          ? activeNodeDom
          : activeNodeDom instanceof HTMLElement
          ? activeNodeDom.querySelector("table")
          : null;
      if (!(activeTableElement instanceof HTMLTableElement)) {
        updateHoveredCellIndexes({ rowIndex: null, columnIndex: null });
        return;
      }

      const targetTable = target.closest("table");
      if (targetTable !== activeTableElement) {
        updateHoveredCellIndexes({ rowIndex: null, columnIndex: null });
        return;
      }

      const cellElement = target.closest("td, th");
      if (!(cellElement instanceof HTMLTableCellElement)) {
        return;
      }

      const rowElement = cellElement.parentElement;
      if (!(rowElement instanceof HTMLTableRowElement)) {
        return;
      }

      const rowElements = Array.from(activeTableElement.querySelectorAll("tr"));
      const rowIndex = rowElements.indexOf(rowElement);
      const rowCells = Array.from(rowElement.querySelectorAll(":scope > th, :scope > td"));
      const columnIndex = rowCells.indexOf(cellElement);
      if (rowIndex < 0 || columnIndex < 0) {
        return;
      }

      updateHoveredCellIndexes({
        rowIndex: columnIndex === 0 ? rowIndex : null,
        columnIndex: rowIndex === 0 ? columnIndex : null,
      });
    };

    const handlePointerLeaveDocument = () => {
      updateHoveredCellIndexes({ rowIndex: null, columnIndex: null });
    };

    ownerDocument.addEventListener("mousemove", handlePointerMove, true);
    ownerDocument.addEventListener("mouseleave", handlePointerLeaveDocument, true);
    ownerWindow.addEventListener("blur", handlePointerLeaveDocument);
    return () => {
      ownerDocument.removeEventListener("mousemove", handlePointerMove, true);
      ownerDocument.removeEventListener("mouseleave", handlePointerLeaveDocument, true);
      ownerWindow.removeEventListener("blur", handlePointerLeaveDocument);
    };
  }, [editor, overlayRoot, ownerWindow]);

  useEffect(() => {
    const ownerDocument = overlayRoot.ownerDocument;
    if (!ownerWindow) return;

    const handleOutsidePointerDown = (event: MouseEvent | PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest("[data-docsera-table-handle='true']")) return;
      setMenuState(null);
    };

    ownerDocument.addEventListener("pointerdown", handleOutsidePointerDown, true);
    ownerDocument.addEventListener("mousedown", handleOutsidePointerDown, true);
    return () => {
      ownerDocument.removeEventListener("pointerdown", handleOutsidePointerDown, true);
      ownerDocument.removeEventListener("mousedown", handleOutsidePointerDown, true);
    };
  }, [overlayRoot, ownerWindow]);

  useEffect(() => {
    const ownerDocument = overlayRoot.ownerDocument;
    if (!ownerWindow) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setMenuState(null);
    };

    ownerDocument.addEventListener("keydown", handleKeyDown, true);
    return () => {
      ownerDocument.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [overlayRoot, ownerWindow]);

  useEffect(() => {
    if (!menuState || !editor || editor.isDestroyed) return;

    const tableContext = getLiveTableContextFromTablePos(editor, menuState.tablePos);
    if (!tableContext) {
      setMenuState(null);
      return;
    }

    if (
      (menuState.kind === "row" && menuState.index >= tableContext.map.height) ||
      (menuState.kind === "column" && menuState.index >= tableContext.map.width)
    ) {
      setMenuState(null);
    }
  }, [editor, menuState]);

  const menuLayout = menuState && editor ? resolveTableLayoutFromTablePos(editor, menuState.tablePos) : null;
  const renderLayout = menuState ? menuLayout : overlayState;
  const selectionIndexes:
    | Pick<TableOverlayState, "selectedColumnIndexes" | "selectedRowIndexes">
    | null = editor ? resolveSelectedTableIndexes(editor) : null;
  const visibleRowIndexes =
    menuState?.kind === "row"
      ? [menuState.index]
      : selectionIndexes?.selectedRowIndexes ?? [];
  const visibleColumnIndexes =
    menuState?.kind === "column"
      ? [menuState.index]
      : selectionIndexes?.selectedColumnIndexes ?? [];
  const visibleTableLeft = renderLayout ? Math.max(renderLayout.tableRect.left, renderLayout.wrapperRect.left) : 0;
  const visibleTableRight = renderLayout ? Math.min(renderLayout.tableRect.right, renderLayout.wrapperRect.right) : 0;
  const visibleTableBottom = renderLayout
    ? Math.min(renderLayout.tableRect.bottom, renderLayout.wrapperRect.bottom)
    : 0;
  const rowRailBottom = renderLayout
    ? Math.min(
        renderLayout.wrapperRect.bottom -
          Math.max(renderLayout.wrapperScrollbarHeightPx, WRAPPER_SCROLLBAR_HEIGHT_FALLBACK_PX) -
          TABLE_CONTROL_RAIL_GAP_PX,
        ownerWindow ? ownerWindow.innerHeight - TABLE_CONTROL_RAIL_GAP_PX : 0
      )
    : 0;
  const rowRailTop = renderLayout
    ? Math.max(visibleTableBottom - ROW_ADD_RAIL_HEIGHT_PX, rowRailBottom - ROW_ADD_RAIL_HEIGHT_PX)
    : 0;
  const rowRailWidth = renderLayout ? Math.max(0, visibleTableRight - visibleTableLeft) : 0;

  const openMenu = useCallback(
    (kind: "row" | "column", index: number) => {
      if (!editor || editor.isDestroyed) return;

      const context = getLiveTableContext(editor);
      if (!context) return;

      const boundedIndex =
        kind === "row"
          ? clamp(index, 0, context.map.height - 1)
          : clamp(index, 0, context.map.width - 1);

      setMenuState({
        kind,
        index: boundedIndex,
        tablePos: context.tablePos,
      });
      setHoveredHandle({ kind, index: boundedIndex });
    },
    [editor]
  );

  const executeRowMenuCommand = useCallback(
    (
      target: Extract<TableMenuState, { kind: "row" }>,
      command: "insertBefore" | "insertAfter" | "delete"
    ) => {
      if (!editor || editor.isDestroyed) return false;

      const context = getLiveTableContextFromTablePos(editor, target.tablePos);
      if (!context) return false;

      editor.view.dispatch(closeHistory(editor.state.tr));
      selectRow(editor, context, target.index);
      let result = false;
      if (command === "insertBefore") result = editor.commands.addRowBefore();
      else if (command === "insertAfter") result = editor.commands.addRowAfter();
      else result = editor.commands.deleteRow();
      if (!result) return false;

      const refreshedContext = getLiveTableContext(editor) ?? getLiveTableContextFromTablePos(editor, target.tablePos);
      if (refreshedContext) {
        selectRow(editor, refreshedContext, Math.min(target.index, refreshedContext.map.height - 1));
      }
      return true;
    },
    [editor]
  );

  const executeColumnMenuCommand = useCallback(
    (
      target: Extract<TableMenuState, { kind: "column" }>,
      command: "insertBefore" | "insertAfter" | "delete"
    ) => {
      if (!editor || editor.isDestroyed) return false;

      const context = getLiveTableContextFromTablePos(editor, target.tablePos);
      if (!context) return false;

      editor.view.dispatch(closeHistory(editor.state.tr));
      selectColumn(editor, context, target.index);
      let result = false;
      if (command === "insertBefore") result = editor.commands.addColumnBefore();
      else if (command === "insertAfter") result = editor.commands.addColumnAfter();
      else result = editor.commands.deleteColumn();
      if (!result) return false;

      const refreshedContext = getLiveTableContext(editor) ?? getLiveTableContextFromTablePos(editor, target.tablePos);
      if (refreshedContext) {
        selectColumn(editor, refreshedContext, Math.min(target.index, refreshedContext.map.width - 1));
      }
      return true;
    },
    [editor]
  );

  if (!ownerWindow) {
    return null;
  }

  return (
    <>
      <style>{`${COMPACT_MENU_STYLES}\n${TABLE_CONTROLS_OVERLAY_STYLES}`}</style>
      <div
        data-docsera-table-overlay-root="true"
        data-docsera-table-overflow-x={renderLayout?.wrapperOverflowX ? "true" : "false"}
        className="docsera-table-controls-overlay"
      >
        {renderLayout ? (
          <>
            {visibleRowIndexes.map((rowIndex) => {
              const rowCenterY = renderLayout.rowCenters[rowIndex];
              if (typeof rowCenterY !== "number") return null;
              const isInViewport =
                rowCenterY >= renderLayout.wrapperRect.top &&
                rowCenterY <= renderLayout.wrapperRect.bottom &&
                rowCenterY >= TABLE_CONTROL_VIEWPORT_EDGE_PX &&
                rowCenterY <= ownerWindow.innerHeight - TABLE_CONTROL_VIEWPORT_EDGE_PX;
              if (!isInViewport) return null;

              const isHovered = hoveredHandle?.kind === "row" && hoveredHandle.index === rowIndex;
              const isVisibleByHover = hoveredCellIndexes.rowIndex === rowIndex;
              const isVisibleBySelection = visibleRowIndexes.includes(rowIndex);
              const isMenuOpen = menuState?.kind === "row" && menuState.index === rowIndex;
              const isVisible = isVisibleBySelection || isVisibleByHover || isHovered || isMenuOpen;
              if (!isVisible) return null;

              const isAccented = isVisibleBySelection || isVisibleByHover || isMenuOpen;
              const handleHeightPx = isHovered || isMenuOpen
                ? ROW_PILL_EXPANDED_HEIGHT_PX
                : ROW_PILL_COMPACT_HEIGHT_PX;
              const handleLeft =
                (renderLayout.rowLeftBorderAnchorXs[rowIndex] ?? renderLayout.tableRect.left) -
                ROW_PILL_HITBOX_WIDTH_PX / 2;
              const handleTop = rowCenterY - ROW_PILL_HITBOX_HEIGHT_PX / 2;
              return (
                <button
                  key={`table-row-handle-${rowIndex}`}
                  type="button"
                  data-docsera-table-handle="true"
                  data-docsera-table-handle-kind="row"
                  data-docsera-table-handle-index={rowIndex}
                  data-docsera-table-handle-expanded={isHovered || isMenuOpen ? "true" : "false"}
                  data-docsera-table-handle-accented={isAccented ? "true" : "false"}
                  aria-label={`Table row ${rowIndex + 1} options`}
                  aria-haspopup="menu"
                  aria-expanded={isMenuOpen}
                  className="docsera-table-controls-overlay__pill"
                  style={{
                    left: `${handleLeft}px`,
                    top: `${handleTop}px`,
                    width: `${ROW_PILL_HITBOX_WIDTH_PX}px`,
                    height: `${ROW_PILL_HITBOX_HEIGHT_PX}px`,
                  }}
                  onMouseEnter={() => setHoveredHandle({ kind: "row", index: rowIndex })}
                  onMouseLeave={() =>
                    setHoveredHandle((previous) => (previous?.kind === "row" ? null : previous))
                  }
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openMenu("row", rowIndex);
                  }}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openMenu("row", rowIndex);
                  }}
                  onClick={() => {
                    openMenu("row", rowIndex);
                  }}
                >
                  <span
                    className="docsera-table-controls-overlay__pill-shell"
                    data-docsera-table-handle-pill="true"
                    style={{
                      width: `${ROW_PILL_WIDTH_PX}px`,
                      height: `${handleHeightPx}px`,
                    }}
                  />
                  <span
                    className="docsera-table-controls-overlay__pill-icon"
                    data-docsera-table-handle-ellipsis="true"
                  >
                    <EllipsisVertical
                      size={HANDLE_ICON_SIZE_PX}
                      strokeWidth={HANDLE_ICON_STROKE_WIDTH}
                      color={isAccented ? "var(--docsera-editor-primary)" : "var(--docsera-editor-muted)"}
                    />
                  </span>
                </button>
              );
            })}

            {visibleColumnIndexes.map((columnIndex) => {
              const columnCenterX = renderLayout.columnCenters[columnIndex];
              if (typeof columnCenterX !== "number") return null;
              const isInViewport =
                columnCenterX >= renderLayout.wrapperRect.left &&
                columnCenterX <= renderLayout.wrapperRect.right &&
                columnCenterX >= TABLE_CONTROL_VIEWPORT_EDGE_PX &&
                columnCenterX <= ownerWindow.innerWidth - TABLE_CONTROL_VIEWPORT_EDGE_PX;
              if (!isInViewport) return null;

              const isHovered =
                hoveredHandle?.kind === "column" && hoveredHandle.index === columnIndex;
              const isVisibleByHover = hoveredCellIndexes.columnIndex === columnIndex;
              const isVisibleBySelection = visibleColumnIndexes.includes(columnIndex);
              const isMenuOpen = menuState?.kind === "column" && menuState.index === columnIndex;
              const isVisible = isVisibleBySelection || isVisibleByHover || isHovered || isMenuOpen;
              if (!isVisible) return null;

              const isAccented = isVisibleBySelection || isVisibleByHover || isMenuOpen;
              const handleWidthPx = isHovered || isMenuOpen
                ? COLUMN_PILL_EXPANDED_WIDTH_PX
                : COLUMN_PILL_COMPACT_WIDTH_PX;
              const handleLeft = columnCenterX - COLUMN_PILL_HITBOX_WIDTH_PX / 2;
              const handleTop =
                (renderLayout.columnTopBorderAnchorYs[columnIndex] ?? renderLayout.tableRect.top) -
                COLUMN_PILL_HITBOX_HEIGHT_PX / 2;
              return (
                <button
                  key={`table-column-handle-${columnIndex}`}
                  type="button"
                  data-docsera-table-handle="true"
                  data-docsera-table-handle-kind="column"
                  data-docsera-table-handle-index={columnIndex}
                  data-docsera-table-handle-expanded={isHovered || isMenuOpen ? "true" : "false"}
                  data-docsera-table-handle-accented={isAccented ? "true" : "false"}
                  aria-label={`Table column ${columnIndex + 1} options`}
                  aria-haspopup="menu"
                  aria-expanded={isMenuOpen}
                  className="docsera-table-controls-overlay__pill"
                  style={{
                    left: `${handleLeft}px`,
                    top: `${handleTop}px`,
                    width: `${COLUMN_PILL_HITBOX_WIDTH_PX}px`,
                    height: `${COLUMN_PILL_HITBOX_HEIGHT_PX}px`,
                  }}
                  onMouseEnter={() => setHoveredHandle({ kind: "column", index: columnIndex })}
                  onMouseLeave={() =>
                    setHoveredHandle((previous) => (previous?.kind === "column" ? null : previous))
                  }
                  onPointerDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openMenu("column", columnIndex);
                  }}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    openMenu("column", columnIndex);
                  }}
                  onClick={() => {
                    openMenu("column", columnIndex);
                  }}
                >
                  <span
                    className="docsera-table-controls-overlay__pill-shell"
                    data-docsera-table-handle-pill="true"
                    style={{
                      width: `${handleWidthPx}px`,
                      height: `${COLUMN_PILL_HEIGHT_PX}px`,
                    }}
                  />
                  <span
                    className="docsera-table-controls-overlay__pill-icon"
                    data-docsera-table-handle-ellipsis="true"
                  >
                    <MoreHorizontal
                      size={HANDLE_ICON_SIZE_PX}
                      strokeWidth={HANDLE_ICON_STROKE_WIDTH}
                      color={isAccented ? "var(--docsera-editor-primary)" : "var(--docsera-editor-muted)"}
                    />
                  </span>
                </button>
              );
            })}

            {renderLayout ? (
              <>
                <div data-docsera-table-row-rail="true">
                  <div
                    className="docsera-table-controls-overlay__rail"
                    style={{
                      left: `${visibleTableLeft}px`,
                      top: `${rowRailTop}px`,
                      width: `${rowRailWidth}px`,
                      height: `${ROW_ADD_RAIL_HEIGHT_PX}px`,
                      zIndex: TABLE_CONTROL_OVERLAY_Z_INDEX + 1,
                      pointerEvents: "auto",
                      position: "fixed",
                    }}
                  >
                    <button
                      type="button"
                      data-docsera-table-add-row="true"
                      data-docsera-table-add-rail-kind="row"
                      aria-label="Add rows"
                      className="docsera-table-controls-overlay__rail-button"
                      onMouseDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      onDragStart={(event) => {
                        event.preventDefault();
                      }}
                      onClick={() => {
                        addRowAtEnd(editor, setOverlayState);
                      }}
                      style={{
                        alignItems: "center",
                        display: "flex",
                        height: "100%",
                        justifyContent: "center",
                        padding: 0,
                        width: "100%",
                      }}
                    >
                      <Plus size={13} strokeWidth={2.2} />
                    </button>
                  </div>
                </div>
                {renderLayout.tableWrapper ? (
                  createPortal(
                    <div data-docsera-table-column-rail="true">
                      <div
                        className="docsera-table-controls-overlay__rail"
                        style={{
                          height: `${Math.max(COLUMN_ADD_RAIL_WIDTH_PX, renderLayout.tableRect.height)}px`,
                          left: `${renderLayout.tableRect.right + renderLayout.tableWrapper.scrollLeft + TABLE_CONTROL_RAIL_GAP_PX - renderLayout.wrapperRect.left}px`,
                          pointerEvents: "auto",
                          position: "absolute",
                          top: `${Math.max(0, renderLayout.tableRect.top - renderLayout.wrapperRect.top)}px`,
                          width: `${COLUMN_ADD_RAIL_WIDTH_PX}px`,
                          zIndex: TABLE_CONTROL_OVERLAY_Z_INDEX + 1,
                        }}
                      >
                        <button
                          type="button"
                          data-docsera-table-add-column="true"
                          data-docsera-table-add-rail-kind="column"
                          aria-label="Add columns"
                          className="docsera-table-controls-overlay__rail-button"
                          onMouseDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onPointerDown={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                          }}
                          onDragStart={(event) => {
                            event.preventDefault();
                          }}
                          onClick={() => {
                            addColumnAtEnd(editor, setOverlayState);
                          }}
                          style={{
                            alignItems: "center",
                            display: "flex",
                            height: "100%",
                            justifyContent: "center",
                            padding: 0,
                            width: "100%",
                          }}
                        >
                          <Plus size={13} strokeWidth={2.2} />
                        </button>
                      </div>
                    </div>,
                    renderLayout.tableWrapper
                  )
                ) : null}
              </>
            ) : null}

            {renderLayout && menuState ? (
              <div
                ref={menuRef}
                data-docsera-table-menu="true"
                data-docsera-table-menu-kind={menuState.kind}
                data-docsera-table-menu-index={menuState.index}
                className={`docsera-compact-menu docsera-table-controls-overlay__menu`}
                role="menu"
                aria-label={menuState.kind === "row" ? "Table row menu" : "Table column menu"}
                style={{
                  minWidth: `${TABLE_CONTROL_MENU_MIN_WIDTH_PX}px`,
                  left:
                    menuState.kind === "row"
                      ? `${shouldFlipRowMenu(renderLayout, menuState.index, ownerWindow) ? Math.max(TABLE_CONTROL_VIEWPORT_EDGE_PX, (renderLayout.rowLeftBorderAnchorXs[menuState.index] ?? renderLayout.tableRect.left) - TABLE_CONTROL_MENU_GAP_PX) : (renderLayout.rowLeftBorderAnchorXs[menuState.index] ?? renderLayout.tableRect.left) + TABLE_CONTROL_MENU_GAP_PX}px`
                      : `${clamp(
                          renderLayout.columnCenters[menuState.index] ?? renderLayout.tableRect.left,
                          TABLE_CONTROL_VIEWPORT_EDGE_PX,
                          ownerWindow.innerWidth - TABLE_CONTROL_VIEWPORT_EDGE_PX
                        )}px`,
                  top:
                    menuState.kind === "row"
                      ? `${clamp(
                          renderLayout.rowCenters[menuState.index] ?? renderLayout.tableRect.top,
                          TABLE_CONTROL_VIEWPORT_EDGE_PX + TABLE_CONTROL_MENU_MIN_HEIGHT_PX / 2,
                          ownerWindow.innerHeight - TABLE_CONTROL_VIEWPORT_EDGE_PX - TABLE_CONTROL_MENU_MIN_HEIGHT_PX / 2
                        )}px`
                      : `${shouldFlipColumnMenu(renderLayout, menuState.index, ownerWindow)
                          ? Math.max(TABLE_CONTROL_VIEWPORT_EDGE_PX, (renderLayout.columnTopBorderAnchorYs[menuState.index] ?? renderLayout.tableRect.top) - TABLE_CONTROL_MENU_GAP_PX)
                          : (renderLayout.columnTopBorderAnchorYs[menuState.index] ?? renderLayout.tableRect.top) + TABLE_CONTROL_MENU_GAP_PX
                        }px`,
                  transform:
                    menuState.kind === "row"
                      ? shouldFlipRowMenu(renderLayout, menuState.index, ownerWindow)
                        ? "translate(-100%, -50%)"
                        : "translate(0, -50%)"
                      : shouldFlipColumnMenu(renderLayout, menuState.index, ownerWindow)
                        ? "translate(-50%, -100%)"
                        : "translate(-50%, 0)",
                  zIndex: TABLE_CONTROL_MENU_Z_INDEX,
                }}
              >
                {menuState.kind === "row"
                  ? [
                      {
                        label: "Insert before",
                        command: "insertBefore" as const,
                      },
                      {
                        label: "Insert after",
                        command: "insertAfter" as const,
                      },
                      {
                        label: "Delete row",
                        command: "delete" as const,
                        destructive: true,
                      },
                    ].map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        role="menuitem"
                        className={`docsera-compact-menu__item${
                          item.destructive ? " docsera-table-controls-overlay__menu-item--destructive" : ""
                        }`}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={() => {
                          const target = menuState;
                          if (!target || target.kind !== "row") return;

                          try {
                            executeRowMenuCommand(target, item.command);
                          } finally {
                            setMenuState(null);
                          }
                        }}
                      >
                        <span>{item.label}</span>
                      </button>
                    ))
                  : [
                      {
                        label: "Insert before",
                        command: "insertBefore" as const,
                      },
                      {
                        label: "Insert after",
                        command: "insertAfter" as const,
                      },
                      {
                        label: "Delete column",
                        command: "delete" as const,
                        destructive: true,
                      },
                    ].map((item) => (
                      <button
                        key={item.label}
                        type="button"
                        role="menuitem"
                        className={`docsera-compact-menu__item${
                          item.destructive ? " docsera-table-controls-overlay__menu-item--destructive" : ""
                        }`}
                        onPointerDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onMouseDown={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                        }}
                        onClick={() => {
                          const target = menuState;
                          if (!target || target.kind !== "column") return;

                          try {
                            executeColumnMenuCommand(target, item.command);
                          } finally {
                            setMenuState(null);
                          }
                        }}
                      >
                        <span>{item.label}</span>
                      </button>
                    ))}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </>
  );
}

function resolveTableLayoutFromContext(
  editor: TiptapEditor,
  context: TableContext
): TableLayout | null {
  const nodeDom = editor.view.nodeDOM(context.tablePos);
  let tableElement: HTMLTableElement | null = null;
  let tableWrapperElement: HTMLElement | null = null;
  if (nodeDom instanceof HTMLTableElement) {
    tableElement = nodeDom;
  } else if (nodeDom instanceof HTMLElement) {
    tableWrapperElement = nodeDom.classList.contains("tableWrapper") ? nodeDom : null;
    tableElement = nodeDom.querySelector("table");
  }

  if (!tableElement) {
    return null;
  }

  if (!tableWrapperElement) {
    const wrapperAncestor = tableElement.closest(".tableWrapper");
    tableWrapperElement = wrapperAncestor instanceof HTMLElement ? wrapperAncestor : null;
  }

  if (!(tableWrapperElement instanceof HTMLElement)) {
    return null;
  }

  const tableRect = tableElement.getBoundingClientRect();
  if (tableRect.width <= 0 || tableRect.height <= 0) {
    return null;
  }

  const wrapperRect = tableWrapperElement.getBoundingClientRect();
  const wrapperOverflowX = tableWrapperElement.scrollWidth > tableWrapperElement.clientWidth + 1;
  const wrapperScrollbarHeightPx = Math.max(
    0,
    tableWrapperElement.offsetHeight - tableWrapperElement.clientHeight || WRAPPER_SCROLLBAR_HEIGHT_FALLBACK_PX
  );
  const ownerWindow = tableElement.ownerDocument.defaultView;

  const rowElements = Array.from(tableElement.querySelectorAll("tr"));
  const rowCenters = Array.from({ length: context.map.height }).map((_, rowIndex) => {
    const rowElement = rowElements[rowIndex];
    if (!rowElement) {
      return tableRect.top + ((rowIndex + 0.5) / Math.max(1, context.map.height)) * tableRect.height;
    }
    const rowRect = rowElement.getBoundingClientRect();
    return rowRect.top + rowRect.height / 2;
  });
  const rowLeftBorderAnchorXs = Array.from({ length: context.map.height }).map((_, rowIndex) => {
    const rowElement = rowElements[rowIndex];
    if (!rowElement) {
      return tableRect.left;
    }

    const rowCells = Array.from(rowElement.querySelectorAll(":scope > th, :scope > td"));
    const firstCell = rowCells[0];
    if (!(firstCell instanceof HTMLTableCellElement)) {
      return tableRect.left;
    }

    const rowRect = firstCell.getBoundingClientRect();
    const computedStyle = ownerWindow?.getComputedStyle(firstCell);
    const renderedLeftBorderWidth = computedStyle ? Number.parseFloat(computedStyle.borderLeftWidth) || 0 : 0;
    return rowRect.left + renderedLeftBorderWidth / 2;
  });

  const firstRowCells = rowElements[0]
    ? Array.from(rowElements[0].querySelectorAll(":scope > th, :scope > td"))
    : [];
  const columnCenters = Array.from({ length: context.map.width }).map((_, columnIndex) => {
    const columnCell = firstRowCells[columnIndex];
    if (!columnCell) {
      return tableRect.left + ((columnIndex + 0.5) / Math.max(1, context.map.width)) * tableRect.width;
    }
    const columnRect = columnCell.getBoundingClientRect();
    return columnRect.left + columnRect.width / 2;
  });
  const columnTopBorderAnchorYs = Array.from({ length: context.map.width }).map((_, columnIndex) => {
    const columnCell = firstRowCells[columnIndex];
    if (!(columnCell instanceof HTMLTableCellElement)) {
      return tableRect.top;
    }

    const columnRect = columnCell.getBoundingClientRect();
    const computedStyle = ownerWindow?.getComputedStyle(columnCell);
    const renderedTopBorderWidth = computedStyle ? Number.parseFloat(computedStyle.borderTopWidth) || 0 : 0;
    return columnRect.top + renderedTopBorderWidth / 2;
  });

  return {
    columnCenters,
    columnTopBorderAnchorYs,
    map: context.map,
    rowCenters,
    rowLeftBorderAnchorXs,
    tableNode: context.tableNode,
    tablePos: context.tablePos,
    tableRect,
    tableStart: context.tableStart,
    tableWrapper: tableWrapperElement,
    wrapperOverflowX,
    wrapperRect,
    wrapperScrollbarHeightPx,
  };
}

function resolveTableLayoutFromTablePos(editor: TiptapEditor, tablePos: number): TableLayout | null {
  const tableContext = getLiveTableContextFromTablePos(editor, tablePos);
  if (!tableContext) {
    return null;
  }

  return resolveTableLayoutFromContext(editor, tableContext);
}

function resolveSelectedTableIndexes(editor: TiptapEditor): {
  selectedColumnIndexes: number[];
  selectedRowIndexes: number[];
} {
  let currentRect:
    | {
        left: number;
        right: number;
        top: number;
        bottom: number;
      }
    | null = null;
  try {
    currentRect = selectedRect(editor.state);
  } catch {
    currentRect = null;
  }

  if (currentRect && editor.state.selection instanceof CellSelection) {
    return {
      selectedColumnIndexes: uniqueSorted(
        Array.from({ length: Math.max(0, currentRect.right - currentRect.left) }).map(
          (_, index) => currentRect.left + index
        )
      ),
      selectedRowIndexes: uniqueSorted(
        Array.from({ length: Math.max(0, currentRect.bottom - currentRect.top) }).map(
          (_, index) => currentRect.top + index
        )
      ),
    };
  }

  const selection = editor.state.selection as { $from?: any } | null | undefined;
  if (!selection?.$from) {
    if (currentRect) {
      return {
        selectedColumnIndexes: [currentRect.left],
        selectedRowIndexes: [currentRect.top],
      };
    }
    return { selectedColumnIndexes: [], selectedRowIndexes: [] };
  }

  const tableContext = getLiveTableContext(editor);
  if (tableContext) {
    const cellAnchor = findCellPos(editor.state.doc, selection.$from.pos);
    if (cellAnchor) {
      const relativeCellPos = cellAnchor.pos - tableContext.tablePos;
      try {
        const cellRect = tableContext.map.findCell(relativeCellPos);
        return {
          selectedColumnIndexes: [cellRect.left],
          selectedRowIndexes: [cellRect.top],
        };
      } catch {
        // Fall through to the manual ancestry scan below.
      }
    }

    const $from = selection.$from;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth);
      if (node.type.name !== "tableCell" && node.type.name !== "tableHeader") {
        continue;
      }

      const candidateCellPositions = [
        $from.before(depth) - tableContext.tablePos,
        $from.start(depth) - tableContext.tablePos,
      ];

      for (const relativeCellPos of candidateCellPositions) {
        if (relativeCellPos < 0) {
          continue;
        }

        try {
          const cellRect = tableContext.map.findCell(relativeCellPos);
          return {
            selectedColumnIndexes: [cellRect.left],
            selectedRowIndexes: [cellRect.top],
          };
        } catch {
          // Try the alternate cell boundary offset before giving up on the current ancestor.
        }
      }
    }
  }

  if (currentRect) {
    return {
      selectedColumnIndexes: [currentRect.left],
      selectedRowIndexes: [currentRect.top],
    };
  }

  return { selectedColumnIndexes: [], selectedRowIndexes: [] };
}

function addColumnAtEnd(
  editor: TiptapEditor | null,
  setState: (nextState: TableOverlayState | null) => void
): void {
  if (!editor) {
    return;
  }

  const context = getLiveTableContext(editor);
  if (!context) {
    return;
  }

  selectColumn(editor, context, context.map.width - 1);
  if (!editor.commands.addColumnAfter()) {
    return;
  }

  const refreshedContext = getLiveTableContext(editor) ?? getLiveTableContextFromTablePos(editor, context.tablePos);
  if (refreshedContext) {
    selectColumn(editor, refreshedContext, refreshedContext.map.width - 1);
  }

  const nextLayout = resolveTableLayoutFromContext(editor, refreshedContext ?? context);
  if (nextLayout) {
    setState({
      ...nextLayout,
      ...resolveSelectedTableIndexes(editor),
    });
  }
}

function addRowAtEnd(
  editor: TiptapEditor | null,
  setState: (nextState: TableOverlayState | null) => void
): void {
  if (!editor) {
    return;
  }

  const context = getLiveTableContext(editor);
  if (!context) {
    return;
  }

  selectRow(editor, context, context.map.height - 1);
  if (!editor.commands.addRowAfter()) {
    return;
  }

  const refreshedContext = getLiveTableContext(editor) ?? getLiveTableContextFromTablePos(editor, context.tablePos);
  if (refreshedContext) {
    selectRow(editor, refreshedContext, refreshedContext.map.height - 1);
  }

  const nextLayout = resolveTableLayoutFromContext(editor, refreshedContext ?? context);
  if (nextLayout) {
    setState({
      ...nextLayout,
      ...resolveSelectedTableIndexes(editor),
    });
  }
}

function selectColumn(editor: TiptapEditor, context: TableContext, columnIndex: number): void {
  const boundedColumnIndex = Math.max(0, Math.min(columnIndex, context.map.width - 1));
  const firstCellPos =
    context.tableStart + context.map.positionAt(0, boundedColumnIndex, context.tableNode);
  const lastCellPos =
    context.tableStart +
    context.map.positionAt(context.map.height - 1, boundedColumnIndex, context.tableNode);
  const tr = editor.state.tr;
  tr.setSelection(
    CellSelection.colSelection(tr.doc.resolve(firstCellPos), tr.doc.resolve(lastCellPos))
  );
  editor.view.dispatch(tr);
  editor.view.focus();
}

function selectRow(editor: TiptapEditor, context: TableContext, rowIndex: number): void {
  const boundedRowIndex = Math.max(0, Math.min(rowIndex, context.map.height - 1));
  const firstCellPos =
    context.tableStart + context.map.positionAt(boundedRowIndex, 0, context.tableNode);
  const lastCellPos =
    context.tableStart +
    context.map.positionAt(boundedRowIndex, context.map.width - 1, context.tableNode);
  const tr = editor.state.tr;
  tr.setSelection(
    CellSelection.rowSelection(tr.doc.resolve(firstCellPos), tr.doc.resolve(lastCellPos))
  );
  editor.view.dispatch(tr);
  editor.view.focus();
}

function shouldFlipRowMenu(layout: TableLayout, rowIndex: number, ownerWindow: Window): boolean {
  const rowCenterY = layout.rowCenters[rowIndex];
  return rowCenterY + TABLE_CONTROL_MENU_MIN_HEIGHT_PX / 2 > ownerWindow.innerHeight - TABLE_CONTROL_VIEWPORT_EDGE_PX;
}

function shouldFlipColumnMenu(layout: TableLayout, columnIndex: number, ownerWindow: Window): boolean {
  const columnCenterX = layout.columnCenters[columnIndex];
  return columnCenterX + TABLE_CONTROL_MENU_MIN_WIDTH_PX / 2 > ownerWindow.innerWidth - TABLE_CONTROL_VIEWPORT_EDGE_PX;
}
