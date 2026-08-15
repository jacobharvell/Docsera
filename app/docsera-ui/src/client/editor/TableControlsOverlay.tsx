import type { Editor as TiptapEditor } from "@tiptap/core";
import {
  CellSelection,
  findCellPos,
  findTable,
  selectedRect,
  TableMap,
} from "@tiptap/pm/tables";
import { EllipsisVertical, MoreHorizontal, Plus } from "lucide-react";
import type { CSSProperties } from "react";
import { type PointerEvent as ReactPointerEvent, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { closeHistory } from "prosemirror-history";
import { COMPACT_MENU_STYLES } from "./CompactMenuStyles";
import useTableDragSelectionController from "./useTableDragSelectionController";

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
  columnWidths: number[];
  map: TableMap;
  rowCenters: number[];
  rowHeights: number[];
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
  accentedColumnIndexes: number[];
  accentedRowIndexes: number[];
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

type TableHandleState = {
  index: number;
  kind: "row" | "column";
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
const TABLE_RAIL_DRAG_THRESHOLD_PX = 4;
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
const LIGHT_TABLE_CONTROL_PRIMARY_COLOR = "#4648D4";
const DARK_TABLE_CONTROL_PRIMARY_COLOR = "#7C83FA";
const TABLE_OVERLAY_EXCLUSION_SELECTOR = [
  "[data-docsera-table-handle='true']",
  "[data-docsera-table-add-rail-kind='row']",
  "[data-docsera-table-add-rail-kind='column']",
  "[data-docsera-table-menu='true']",
].join(", ");
const TABLE_RAIL_CURSOR_LOCK_ATTRIBUTE = "data-docsera-table-rail-cursor-lock";

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

  .docsera-table-controls-overlay__pill[data-docsera-table-handle-kind="row"] .docsera-table-controls-overlay__pill-shell {
    width: ${ROW_PILL_WIDTH_PX}px;
    height: ${ROW_PILL_COMPACT_HEIGHT_PX}px;
  }

  .docsera-table-controls-overlay__pill[data-docsera-table-handle-kind="row"][data-docsera-table-handle-expanded="true"] .docsera-table-controls-overlay__pill-shell,
  .docsera-table-controls-overlay__pill[data-docsera-table-handle-kind="row"]:hover .docsera-table-controls-overlay__pill-shell,
  .docsera-table-controls-overlay__pill[data-docsera-table-handle-kind="row"]:focus-visible .docsera-table-controls-overlay__pill-shell {
    height: ${ROW_PILL_EXPANDED_HEIGHT_PX}px;
  }

  .docsera-table-controls-overlay__pill[data-docsera-table-handle-kind="column"] .docsera-table-controls-overlay__pill-shell {
    width: ${COLUMN_PILL_COMPACT_WIDTH_PX}px;
    height: ${COLUMN_PILL_HEIGHT_PX}px;
  }

  .docsera-table-controls-overlay__pill[data-docsera-table-handle-kind="column"][data-docsera-table-handle-expanded="true"] .docsera-table-controls-overlay__pill-shell,
  .docsera-table-controls-overlay__pill[data-docsera-table-handle-kind="column"]:hover .docsera-table-controls-overlay__pill-shell,
  .docsera-table-controls-overlay__pill[data-docsera-table-handle-kind="column"]:focus-visible .docsera-table-controls-overlay__pill-shell {
    width: ${COLUMN_PILL_EXPANDED_WIDTH_PX}px;
  }

  .docsera-table-controls-overlay__pill[data-docsera-table-handle-accented="false"][data-docsera-table-handle-expanded="true"] .docsera-table-controls-overlay__pill-shell,
  .docsera-table-controls-overlay__pill[data-docsera-table-handle-accented="false"]:hover .docsera-table-controls-overlay__pill-shell,
  .docsera-table-controls-overlay__pill[data-docsera-table-handle-accented="false"]:focus-visible .docsera-table-controls-overlay__pill-shell {
    box-shadow:
      0 1px 2px color-mix(in srgb, var(--docsera-editor-text) 10%, transparent),
      0 0 0 1px color-mix(in srgb, var(--docsera-table-control-primary) 28%, transparent);
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
  }

  .docsera-table-controls-overlay__rail-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--docsera-editor-muted);
    transition: color 120ms ease;
  }

  .docsera-table-controls-overlay__rail-button:hover .docsera-table-controls-overlay__rail-icon,
  .docsera-table-controls-overlay__rail-button:focus-visible .docsera-table-controls-overlay__rail-icon {
    color: var(--docsera-table-control-primary);
  }

  html[data-docsera-table-rail-cursor-lock="row"],
  html[data-docsera-table-rail-cursor-lock="row"] * {
    cursor: row-resize !important;
  }

  html[data-docsera-table-rail-cursor-lock="column"],
  html[data-docsera-table-rail-cursor-lock="column"] * {
    cursor: col-resize !important;
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

  @media (prefers-reduced-motion: reduce) {
    .docsera-table-controls-overlay__pill-shell,
    .docsera-table-controls-overlay__pill-icon,
    .docsera-table-controls-overlay__rail-button {
      transition: none;
    }
  }
`;

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(value, max));

const getOverlayOwnerWindow = (overlayRoot: HTMLElement): Window | null => overlayRoot.ownerDocument.defaultView;

function resolveTableControlTheme(editor: TiptapEditor | null): "light" | "dark" {
  let editorDom: HTMLElement | null = null;
  try {
    editorDom = editor?.view?.dom instanceof HTMLElement ? editor.view.dom : null;
  } catch {
    editorDom = null;
  }

  const editorRoot = editorDom?.closest(".docsera-editor-runtime");
  return editorRoot instanceof HTMLElement && editorRoot.classList.contains("docsera-editor-runtime--dark")
    ? "dark"
    : "light";
}

function resolveTableControlPrimaryColor(editor: TiptapEditor | null): string {
  return resolveTableControlTheme(editor) === "dark"
    ? DARK_TABLE_CONTROL_PRIMARY_COLOR
    : LIGHT_TABLE_CONTROL_PRIMARY_COLOR;
}

function resolveTableControlActiveIconColor(editor: TiptapEditor | null): string {
  return resolveTableControlTheme(editor) === "dark" ? "#ffffff" : "var(--docsera-editor-panel)";
}

function isEditableTableCellEventTarget(target: EventTarget | null): target is HTMLElement {
  return target instanceof HTMLElement && !target.closest(TABLE_OVERLAY_EXCLUSION_SELECTOR) && Boolean(target.closest("td, th"));
}

function clearNativeSelectionIfCellSelection(editor: TiptapEditor | null): void {
  if (!editor || editor.isDestroyed || !(editor.state.selection instanceof CellSelection)) {
    return;
  }

  const selection = editor.view.dom.ownerDocument.getSelection();
  if (selection && selection.rangeCount > 0) {
    selection.removeAllRanges();
  }
}

function normalizeCellRect(cellRect: {
  bottom: number;
  left: number;
  right: number;
  top: number;
}): {
  bottom: number;
  left: number;
  right: number;
  top: number;
} {
  return {
    bottom: Number(cellRect.bottom),
    left: Number(cellRect.left),
    right: Number(cellRect.right),
    top: Number(cellRect.top),
  };
}

type SelectedTableCellCoordinate = {
  columnIndex: number;
  rowIndex: number;
};

function normalizeSelectedTableCellCoordinates(
  coordinates: SelectedTableCellCoordinate[]
): SelectedTableCellCoordinate[] {
  const uniqueCoordinates = new Map<string, SelectedTableCellCoordinate>();
  for (const coordinate of coordinates) {
    const rowIndex = Number(coordinate.rowIndex);
    const columnIndex = Number(coordinate.columnIndex);
    if (!Number.isFinite(rowIndex) || !Number.isFinite(columnIndex)) {
      continue;
    }

    uniqueCoordinates.set(`${rowIndex}:${columnIndex}`, { columnIndex, rowIndex });
  }

  return Array.from(uniqueCoordinates.values()).sort((left, right) =>
    left.rowIndex === right.rowIndex
      ? left.columnIndex - right.columnIndex
      : left.rowIndex - right.rowIndex
  );
}

function buildSelectedTableCellCoordinates(
  cellRect: {
    bottom: number;
    left: number;
    right: number;
    top: number;
  },
): SelectedTableCellCoordinate[] {
  const normalizedCellRect = normalizeCellRect(cellRect);
  const coordinates: SelectedTableCellCoordinate[] = [];

  for (let rowIndex = normalizedCellRect.top; rowIndex < normalizedCellRect.bottom; rowIndex += 1) {
    for (let columnIndex = normalizedCellRect.left; columnIndex < normalizedCellRect.right; columnIndex += 1) {
      coordinates.push({ columnIndex, rowIndex });
    }
  }

  return normalizeSelectedTableCellCoordinates(coordinates);
}

function buildPillShellStyle(input: { isActive: boolean; primaryColor: string }): CSSProperties {
  const mutedRing =
    "0 1px 2px color-mix(in srgb, var(--docsera-editor-text) 10%, transparent), 0 0 0 1px color-mix(in srgb, var(--docsera-editor-panel-border) 58%, transparent)";
  const activeRing =
    "0 1px 2px color-mix(in srgb, var(--docsera-editor-text) 10%, transparent)";

  return {
    borderColor: input.isActive ? input.primaryColor : "var(--docsera-editor-panel-border)",
    backgroundColor: input.isActive
      ? input.primaryColor
      : "color-mix(in srgb, var(--docsera-editor-panel) 94%, var(--docsera-editor-primary) 6%)",
    boxShadow: input.isActive ? activeRing : mutedRing,
    transition:
      `width ${PILL_TRANSITION_DURATION_MS}ms ease, ` +
      `height ${PILL_TRANSITION_DURATION_MS}ms ease, ` +
      `opacity ${PILL_TRANSITION_DURATION_MS}ms ease, ` +
      `border-color ${PILL_TRANSITION_DURATION_MS}ms ease, ` +
      `background-color ${PILL_TRANSITION_DURATION_MS}ms ease, ` +
      `box-shadow ${PILL_TRANSITION_DURATION_MS}ms ease`,
    willChange: "width, height, opacity",
  };
}

function buildSelectedTableHandleIndexes(
  selectedCells: SelectedTableCellCoordinate[]
): {
  accentedColumnIndexes: number[];
  accentedRowIndexes: number[];
  selectedColumnIndexes: number[];
  selectedRowIndexes: number[];
} {
  if (selectedCells.length === 1) {
    const [selectedCell] = selectedCells;
    return {
      accentedColumnIndexes: selectedCell.rowIndex === 0 ? [selectedCell.columnIndex] : [],
      accentedRowIndexes: selectedCell.columnIndex === 0 ? [selectedCell.rowIndex] : [],
      selectedColumnIndexes: [selectedCell.columnIndex],
      selectedRowIndexes: [selectedCell.rowIndex],
    };
  }

  const activeColumnIndexes = new Set<number>();
  const activeRowIndexes = new Set<number>();

  for (const cellCoordinate of selectedCells) {
    if (cellCoordinate.rowIndex === 0) {
      activeColumnIndexes.add(cellCoordinate.columnIndex);
    }
    if (cellCoordinate.columnIndex === 0) {
      activeRowIndexes.add(cellCoordinate.rowIndex);
    }
  }

  const selectedColumnIndexes = Array.from(activeColumnIndexes).sort((left, right) => left - right);
  const selectedRowIndexes = Array.from(activeRowIndexes).sort((left, right) => left - right);
  return {
    accentedColumnIndexes: selectedColumnIndexes,
    accentedRowIndexes: selectedRowIndexes,
    selectedColumnIndexes,
    selectedRowIndexes,
  };
}

function resolveSelectedTableCells(editor: TiptapEditor): SelectedTableCellCoordinate[] {
  const selection = editor.state.selection;
  if (selection instanceof CellSelection) {
    let selectedRectRange:
      | {
          bottom: number;
          left: number;
          right: number;
          top: number;
        }
      | null = null;

    try {
      selectedRectRange = normalizeCellRect(selectedRect(editor.state));
    } catch {
      selectedRectRange = null;
    }

    if (selectedRectRange) {
      return buildSelectedTableCellCoordinates(selectedRectRange);
    }

    const selectedTableContext = getLiveTableContext(editor);
    const liveCellSelectionRect = selectedTableContext
      ? resolveLiveCellSelectionRect(editor, selectedTableContext)
      : null;
    return liveCellSelectionRect ? buildSelectedTableCellCoordinates(liveCellSelectionRect) : [];
  }

  const textSelection = selection as { $from?: any } | null | undefined;
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

  if (!textSelection?.$from) {
    return currentRect ? [{ columnIndex: currentRect.left, rowIndex: currentRect.top }] : [];
  }

  const tableContext = getLiveTableContext(editor);
  if (tableContext) {
    const cellAnchor = findCellPos(editor.state.doc, textSelection.$from.pos);
    if (cellAnchor) {
      const relativeCellPos = cellAnchor.pos - tableContext.tablePos;
      try {
        const cellRect = tableContext.map.findCell(relativeCellPos);
        return [{ columnIndex: cellRect.left, rowIndex: cellRect.top }];
      } catch {
        // Fall through to the manual ancestry scan below.
      }
    }

    const $from = textSelection.$from;
    for (let depth = $from.depth; depth > 0; depth -= 1) {
      const node = $from.node(depth);
      if (node.type.name !== "tableCell" && node.type.name !== "tableHeader") {
        continue;
      }

      const candidateCellPositions = [$from.before(depth) - tableContext.tablePos, $from.start(depth) - tableContext.tablePos];

      for (const relativeCellPos of candidateCellPositions) {
        if (relativeCellPos < 0) {
          continue;
        }

        try {
          const cellRect = tableContext.map.findCell(relativeCellPos);
          return [{ columnIndex: cellRect.left, rowIndex: cellRect.top }];
        } catch {
          // Try the alternate cell boundary offset before giving up on the current ancestor.
        }
      }
    }
  }

  if (currentRect) {
    return [{ columnIndex: currentRect.left, rowIndex: currentRect.top }];
  }

  return [];
}

const getLiveTableContext = (
  editor: TiptapEditor
): TableContext | null => {
  const selection = editor.state.selection as { $anchorCell?: unknown; $from?: unknown } | null | undefined;
  const selectionAnchor =
    selection instanceof CellSelection ? selection.$anchorCell : selection?.$from;
  if (!selectionAnchor) return null;

  const currentTable = findTable(selectionAnchor as Parameters<typeof findTable>[0]);
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

function areHandleStatesEqual(left: TableHandleState | null, right: TableHandleState | null): boolean {
  return left?.kind === right?.kind && left?.index === right?.index;
}

function resolveHandleStateFromTarget(target: EventTarget | null): TableHandleState | null {
  if (!(target instanceof Element)) {
    return null;
  }

  const handle = target.closest("[data-docsera-table-handle='true']");
  if (!(handle instanceof HTMLElement)) {
    return null;
  }

  const kind = handle.dataset.docseraTableHandleKind;
  const index = Number(handle.dataset.docseraTableHandleIndex);
  if ((kind !== "row" && kind !== "column") || Number.isNaN(index)) {
    return null;
  }

  return { kind, index };
}

export default function TableControlsOverlay({
  editor,
  overlayRoot,
}: TableControlsOverlayProps) {
  const [overlayState, setOverlayState] = useState<TableOverlayState | null>(null);
  const [menuState, setMenuState] = useState<TableMenuState | null>(null);
  const [hoveredHandle, setHoveredHandle] = useState<TableHandleState | null>(null);
  const [hoveredRailKind, setHoveredRailKind] = useState<TableRailResizeKind | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const structuralSelectionClickHandoffRef = useRef<number | null>(null);
  const ownerWindow = getOverlayOwnerWindow(overlayRoot);
  const tableControlPrimaryColor = resolveTableControlPrimaryColor(editor);
  const activeTableIconColor = resolveTableControlActiveIconColor(editor);
  const { handleRailClick, handleRailPointerDown } = useTableRailResizeSession(editor, setOverlayState);

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

    const selectedCellCoordinates = resolveSelectedTableCells(editor);
    const nextOverlayState = {
      ...layout,
      ...buildSelectedTableIndexesFromCells(selectedCellCoordinates),
    };
    setOverlayState(nextOverlayState);
  }, [editor]);
  useTableDragSelectionController(editor, Boolean(editor));

  useEffect(() => {
    if (!editor || !ownerWindow) {
      return;
    }

    const ownerDocument = overlayRoot.ownerDocument;
    const hasRequestAnimationFrame = typeof ownerWindow.requestAnimationFrame === "function";
    if (!hasRequestAnimationFrame) {
      clearNativeSelectionIfCellSelection(editor);
      return;
    }

    let animationFrameId: number | null = null;

    const clearStructuralSelection = () => {
      if (animationFrameId !== null) {
        ownerWindow.cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }

      if (!(editor.state.selection instanceof CellSelection)) {
        return;
      }

      animationFrameId = ownerWindow.requestAnimationFrame(() => {
        animationFrameId = null;
        if (structuralSelectionClickHandoffRef.current !== null) {
          return;
        }
        clearNativeSelectionIfCellSelection(editor);
      });
    };

    const beginStructuralSelectionClickHandoff = (event: PointerEvent) => {
      if (!(editor.state.selection instanceof CellSelection)) {
        structuralSelectionClickHandoffRef.current = null;
        return;
      }

      if (!isEditableTableCellEventTarget(event.target)) {
        structuralSelectionClickHandoffRef.current = null;
        return;
      }

      structuralSelectionClickHandoffRef.current = event.pointerId;
    };

    const endStructuralSelectionClickHandoff = (pointerId: number | null) => {
      if (
        structuralSelectionClickHandoffRef.current === null ||
        (pointerId !== null && structuralSelectionClickHandoffRef.current !== pointerId)
      ) {
        return;
      }

      structuralSelectionClickHandoffRef.current = null;
      clearStructuralSelection();
    };

    const handlePointerUp = (event: PointerEvent) => {
      endStructuralSelectionClickHandoff(event.pointerId);
    };

    const handlePointerCancel = (event: PointerEvent) => {
      endStructuralSelectionClickHandoff(event.pointerId);
    };

    const handleWindowBlur = () => {
      endStructuralSelectionClickHandoff(null);
    };

    clearStructuralSelection();

    if (typeof editor.on !== "function" || typeof editor.off !== "function") {
      return () => {
        if (animationFrameId !== null) {
          ownerWindow.cancelAnimationFrame(animationFrameId);
        }
      };
    }

    editor.on("selectionUpdate", clearStructuralSelection);
    ownerDocument.addEventListener("pointerdown", beginStructuralSelectionClickHandoff, true);
    ownerDocument.addEventListener("pointerup", handlePointerUp, true);
    ownerDocument.addEventListener("pointercancel", handlePointerCancel, true);
    ownerWindow.addEventListener("blur", handleWindowBlur);

    return () => {
      editor.off("selectionUpdate", clearStructuralSelection);
      ownerDocument.removeEventListener("pointerdown", beginStructuralSelectionClickHandoff, true);
      ownerDocument.removeEventListener("pointerup", handlePointerUp, true);
      ownerDocument.removeEventListener("pointercancel", handlePointerCancel, true);
      ownerWindow.removeEventListener("blur", handleWindowBlur);
      if (animationFrameId !== null) {
        ownerWindow.cancelAnimationFrame(animationFrameId);
      }
    };
  }, [editor, ownerWindow, overlayRoot]);

  useEffect(() => {
    if (!editor || !ownerWindow) {
      return;
    }

    const ownerDocument = overlayRoot.ownerDocument;
    const handleSelectionChange = () => {
      if (structuralSelectionClickHandoffRef.current !== null) {
        return;
      }

      if (!(editor.state.selection instanceof CellSelection)) {
        return;
      }

      if (typeof ownerWindow.requestAnimationFrame === "function") {
        ownerWindow.requestAnimationFrame(() => {
          if (structuralSelectionClickHandoffRef.current !== null) {
            return;
          }

          clearNativeSelectionIfCellSelection(editor);
        });
        return;
      }

      clearNativeSelectionIfCellSelection(editor);
    };

    ownerDocument.addEventListener("selectionchange", handleSelectionChange);
    return () => {
      ownerDocument.removeEventListener("selectionchange", handleSelectionChange);
    };
  }, [editor, ownerWindow, overlayRoot]);

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

    const updateHoveredHandle = (next: TableHandleState | null) => {
      setHoveredHandle((previous) => (areHandleStatesEqual(previous, next) ? previous : next));
    };

    const handlePointerMove = (event: MouseEvent) => {
      const target = event.target;
      updateHoveredHandle(resolveHandleStateFromTarget(target));

      if (!(target instanceof HTMLElement) || target.closest("[data-docsera-table-handle='true'], [data-docsera-table-menu='true']")) {
        return;
      }

      const activeContext = getLiveTableContext(editor);
      if (!activeContext) {
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
        return;
      }

      const targetTable = target.closest("table");
      if (targetTable !== activeTableElement) {
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
    };

    const handlePointerLeaveDocument = () => {
      updateHoveredHandle(null);
    };

    const handlePointerDown = (event: MouseEvent | PointerEvent) => {
      updateHoveredHandle(resolveHandleStateFromTarget(event.target));
    };

    ownerDocument.addEventListener("pointermove", handlePointerMove, true);
    ownerDocument.addEventListener("mousemove", handlePointerMove, true);
    ownerDocument.addEventListener("pointerdown", handlePointerDown, true);
    ownerDocument.addEventListener("mousedown", handlePointerDown, true);
    ownerDocument.addEventListener("mouseleave", handlePointerLeaveDocument, true);
    ownerWindow.addEventListener("blur", handlePointerLeaveDocument);
    return () => {
      ownerDocument.removeEventListener("pointermove", handlePointerMove, true);
      ownerDocument.removeEventListener("mousemove", handlePointerMove, true);
      ownerDocument.removeEventListener("pointerdown", handlePointerDown, true);
      ownerDocument.removeEventListener("mousedown", handlePointerDown, true);
      ownerDocument.removeEventListener("mouseleave", handlePointerLeaveDocument, true);
      ownerWindow.removeEventListener("blur", handlePointerLeaveDocument);
    };
  }, [editor, overlayRoot, ownerWindow]);

  useEffect(() => {
    if (!editor || typeof editor.on !== "function" || typeof editor.off !== "function") {
      return;
    }

    const clearHoveredHandle = () => {
      setHoveredHandle(null);
    };

    editor.on("selectionUpdate", clearHoveredHandle);
    return () => {
      editor.off("selectionUpdate", clearHoveredHandle);
    };
  }, [editor]);

  useEffect(() => {
    setHoveredHandle(null);
  }, [menuState]);

  useEffect(() => {
    const ownerDocument = overlayRoot.ownerDocument;
    if (!ownerWindow) return;

    const handleOutsidePointerDown = (event: MouseEvent | PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target)) return;
      if ((target as HTMLElement).closest("[data-docsera-table-handle='true']")) return;
      if (!editor?.isDestroyed && editor?.view.dom.contains(target)) return;
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
  const selectedCellCoordinates = editor ? resolveSelectedTableCells(editor) : [];
  const selectionIndexes:
    | Pick<
        TableOverlayState,
        "accentedColumnIndexes" | "accentedRowIndexes" | "selectedColumnIndexes" | "selectedRowIndexes"
      >
    | null = editor ? buildSelectedTableIndexesFromCells(selectedCellCoordinates) : null;
  const visibleRowIndexes =
    menuState?.kind === "row"
      ? [menuState.index]
      : selectionIndexes?.selectedRowIndexes ?? [];
  const visibleColumnIndexes =
    menuState?.kind === "column"
      ? [menuState.index]
      : selectionIndexes?.selectedColumnIndexes ?? [];
  const accentedRowIndexes = selectionIndexes?.accentedRowIndexes ?? [];
  const accentedColumnIndexes = selectionIndexes?.accentedColumnIndexes ?? [];
  const visibleTableLeft = renderLayout ? Math.max(renderLayout.tableRect.left, renderLayout.wrapperRect.left) : 0;
  const visibleTableRight = renderLayout ? Math.min(renderLayout.tableRect.right, renderLayout.wrapperRect.right) : 0;
  const visibleTableTop = renderLayout ? Math.max(renderLayout.tableRect.top, renderLayout.wrapperRect.top) : 0;
  const visibleTableBottom = renderLayout ? Math.min(renderLayout.tableRect.bottom, renderLayout.wrapperRect.bottom) : 0;
  const wrapperScrollbarLaneHeightPx = renderLayout?.wrapperOverflowX
    ? Math.max(renderLayout.wrapperScrollbarHeightPx, WRAPPER_SCROLLBAR_HEIGHT_FALLBACK_PX)
    : 0;
  const rowRailBottom = renderLayout
    ? Math.min(
        renderLayout.wrapperRect.bottom - wrapperScrollbarLaneHeightPx - TABLE_CONTROL_RAIL_GAP_PX,
        ownerWindow ? ownerWindow.innerHeight - TABLE_CONTROL_RAIL_GAP_PX : 0
      )
    : 0;
  const rowRailTop = renderLayout ? Math.max(visibleTableBottom - ROW_ADD_RAIL_HEIGHT_PX, rowRailBottom - ROW_ADD_RAIL_HEIGHT_PX) : 0;
  const rowRailWidth = renderLayout ? Math.max(0, visibleTableRight - visibleTableLeft) : 0;
  const columnRailLeft = visibleTableRight;
  const columnRailTop = visibleTableTop;
  const viewportBottom = ownerWindow?.innerHeight ?? renderLayout?.tableRect.bottom ?? 0;
  const columnRailHeight = renderLayout
    ? Math.max(0, Math.min(renderLayout.tableRect.bottom, viewportBottom) - columnRailTop)
    : 0;

  const openMenu = useCallback(
    (kind: "row" | "column", index: number) => {
      if (!editor || editor.isDestroyed) return;

      const context = getLiveTableContext(editor);
      if (!context) return;

      const boundedIndex =
        kind === "row"
          ? clamp(index, 0, context.map.height - 1)
          : clamp(index, 0, context.map.width - 1);

      if (kind === "row") {
        selectRow(editor, context, boundedIndex);
      } else {
        selectColumn(editor, context, boundedIndex);
      }

      setMenuState({
        kind,
        index: boundedIndex,
        tablePos: context.tablePos,
      });
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
              const isVisibleBySelection = visibleRowIndexes.includes(rowIndex);
              const isAccentedBySelection = accentedRowIndexes.includes(rowIndex);
              const isMenuOpen = menuState?.kind === "row" && menuState.index === rowIndex;
              const isVisible = isVisibleBySelection || isHovered || isMenuOpen;
              if (!isVisible) return null;

              const isAccented = isAccentedBySelection || isMenuOpen;
              const isExpanded = isHovered;
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
                  data-docsera-table-handle-expanded={isExpanded ? "true" : "false"}
                  data-docsera-table-handle-accented={isAccented ? "true" : "false"}
                  data-docsera-table-handle-visual-state={isAccented ? "active" : "muted"}
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
                    style={buildPillShellStyle({ isActive: isAccented, primaryColor: tableControlPrimaryColor })}
                  />
                  <span
                    className="docsera-table-controls-overlay__pill-icon"
                    data-docsera-table-handle-ellipsis="true"
                  >
                    <EllipsisVertical
                      size={HANDLE_ICON_SIZE_PX}
                      strokeWidth={HANDLE_ICON_STROKE_WIDTH}
                      color={isAccented ? activeTableIconColor : "var(--docsera-editor-muted)"}
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
              const isVisibleBySelection = visibleColumnIndexes.includes(columnIndex);
              const isAccentedBySelection = accentedColumnIndexes.includes(columnIndex);
              const isMenuOpen = menuState?.kind === "column" && menuState.index === columnIndex;
              const isVisible = isVisibleBySelection || isHovered || isMenuOpen;
              if (!isVisible) return null;

              const isAccented = isAccentedBySelection || isMenuOpen;
              const isExpanded = isHovered;
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
                  data-docsera-table-handle-expanded={isExpanded ? "true" : "false"}
                  data-docsera-table-handle-accented={isAccented ? "true" : "false"}
                  data-docsera-table-handle-visual-state={isAccented ? "active" : "muted"}
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
                    style={buildPillShellStyle({ isActive: isAccented, primaryColor: tableControlPrimaryColor })}
                  />
                  <span
                    className="docsera-table-controls-overlay__pill-icon"
                    data-docsera-table-handle-ellipsis="true"
                  >
                    <MoreHorizontal
                      size={HANDLE_ICON_SIZE_PX}
                      strokeWidth={HANDLE_ICON_STROKE_WIDTH}
                      color={isAccented ? activeTableIconColor : "var(--docsera-editor-muted)"}
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
                      style={{
                        alignItems: "center",
                        cursor: "row-resize",
                        display: "flex",
                        height: "100%",
                        justifyContent: "center",
                        padding: 0,
                        width: "100%",
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleRailClick("row");
                      }}
                      onMouseDown={(event) => {
                        event.stopPropagation();
                      }}
                      onMouseEnter={() => {
                        setHoveredRailKind("row");
                      }}
                      onMouseLeave={() => {
                        setHoveredRailKind((previous) => (previous === "row" ? null : previous));
                      }}
                      onFocus={() => {
                        setHoveredRailKind("row");
                      }}
                      onBlur={() => {
                        setHoveredRailKind((previous) => (previous === "row" ? null : previous));
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        handleRailPointerDown("row", event);
                      }}
                      onDragStart={(event) => {
                        event.preventDefault();
                      }}
                    >
                      <span
                        className="docsera-table-controls-overlay__rail-icon"
                        data-docsera-table-rail-icon="true"
                        style={{
                          color:
                            hoveredRailKind === "row"
                              ? tableControlPrimaryColor
                              : "var(--docsera-editor-muted)",
                        }}
                      >
                        <Plus size={13} strokeWidth={2.2} />
                      </span>
                    </button>
                  </div>
                </div>
                <div data-docsera-table-column-rail="true">
                  <div
                    className="docsera-table-controls-overlay__rail"
                    style={{
                      height: `${columnRailHeight}px`,
                      left: `${columnRailLeft}px`,
                      pointerEvents: "auto",
                      position: "fixed",
                      top: `${columnRailTop}px`,
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
                      style={{
                        alignItems: "center",
                        cursor: "col-resize",
                        display: "flex",
                        height: "100%",
                        justifyContent: "center",
                        padding: 0,
                        width: "100%",
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleRailClick("column");
                      }}
                      onMouseDown={(event) => {
                        event.stopPropagation();
                      }}
                      onMouseEnter={() => {
                        setHoveredRailKind("column");
                      }}
                      onMouseLeave={() => {
                        setHoveredRailKind((previous) => (previous === "column" ? null : previous));
                      }}
                      onFocus={() => {
                        setHoveredRailKind("column");
                      }}
                      onBlur={() => {
                        setHoveredRailKind((previous) => (previous === "column" ? null : previous));
                      }}
                      onPointerDown={(event) => {
                        event.stopPropagation();
                        handleRailPointerDown("column", event);
                      }}
                      onDragStart={(event) => {
                        event.preventDefault();
                      }}
                    >
                      <span
                        className="docsera-table-controls-overlay__rail-icon"
                        data-docsera-table-rail-icon="true"
                        style={{
                          color:
                            hoveredRailKind === "column"
                              ? tableControlPrimaryColor
                              : "var(--docsera-editor-muted)",
                        }}
                      >
                        <Plus size={13} strokeWidth={2.2} />
                      </span>
                    </button>
                  </div>
                </div>
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
  const rowHeights = Array.from({ length: context.map.height }).map((_, rowIndex) => {
    const rowElement = rowElements[rowIndex];
    if (!(rowElement instanceof HTMLTableRowElement)) {
      return Math.max(1, tableRect.height / Math.max(1, context.map.height));
    }

    const rowRect = rowElement.getBoundingClientRect();
    return rowRect.height > 0 ? rowRect.height : Math.max(1, tableRect.height / Math.max(1, context.map.height));
  });
  const rowCenters = Array.from({ length: context.map.height }).map((_, rowIndex) => {
    const rowElement = rowElements[rowIndex];
    if (!rowElement) {
      return tableRect.top + ((rowIndex + 0.5) / Math.max(1, context.map.height)) * tableRect.height;
    }
    const rowRect = rowElement.getBoundingClientRect();
    if (rowRect.width <= 0 || rowRect.height <= 0) {
      return tableRect.top + ((rowIndex + 0.5) / Math.max(1, context.map.height)) * tableRect.height;
    }
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
  const columnWidths = Array.from({ length: context.map.width }).map((_, columnIndex) => {
    const columnCell = firstRowCells[columnIndex];
    if (!(columnCell instanceof HTMLTableCellElement)) {
      return Math.max(1, tableRect.width / Math.max(1, context.map.width));
    }

    const columnRect = columnCell.getBoundingClientRect();
    return columnRect.width > 0 ? columnRect.width : Math.max(1, tableRect.width / Math.max(1, context.map.width));
  });
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
    columnWidths,
    map: context.map,
    rowCenters,
    rowHeights,
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

function resolveLiveCellSelectionRect(
  editor: TiptapEditor,
  tableContext: TableContext
):
  | {
      bottom: number;
      left: number;
      right: number;
      top: number;
    }
  | null {
  const selection = editor.state.selection;
  if (!(selection instanceof CellSelection)) {
    return null;
  }

  return normalizeCellRect(
    tableContext.map.rectBetween(
      selection.$anchorCell.pos - tableContext.tableStart,
      selection.$headCell.pos - tableContext.tableStart
    )
  );
}

function resolveSelectedTableIndexes(editor: TiptapEditor): {
  accentedColumnIndexes: number[];
  accentedRowIndexes: number[];
  selectedColumnIndexes: number[];
  selectedRowIndexes: number[];
} {
  const selectedCells = resolveSelectedTableCells(editor);
  return buildSelectedTableIndexesFromCells(selectedCells);
}

function buildSelectedTableIndexesFromCells(
  selectedCells: SelectedTableCellCoordinate[]
): {
  accentedColumnIndexes: number[];
  accentedRowIndexes: number[];
  selectedColumnIndexes: number[];
  selectedRowIndexes: number[];
} {
  if (!selectedCells.length) {
    return {
      accentedColumnIndexes: [],
      accentedRowIndexes: [],
      selectedColumnIndexes: [],
      selectedRowIndexes: [],
    };
  }

  return buildSelectedTableHandleIndexes(selectedCells);
}

function addColumnAtEnd(
  editor: TiptapEditor | null,
  setState: (nextState: TableOverlayState | null) => void
): boolean {
  if (!editor) {
    return false;
  }

  const context = getLiveTableContext(editor);
  if (!context) {
    return false;
  }

  selectColumn(editor, context, context.map.width - 1);
  if (!editor.commands.addColumnAfter()) {
    return false;
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

  return true;
}

function addRowAtEnd(
  editor: TiptapEditor | null,
  setState: (nextState: TableOverlayState | null) => void
): boolean {
  if (!editor) {
    return false;
  }

  const context = getLiveTableContext(editor);
  if (!context) {
    return false;
  }

  selectRow(editor, context, context.map.height - 1);
  if (!editor.commands.addRowAfter()) {
    return false;
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

  return true;
}

function removeColumnAtEnd(
  editor: TiptapEditor | null,
  setState: (nextState: TableOverlayState | null) => void
): boolean {
  if (!editor) {
    return false;
  }

  const context = getLiveTableContext(editor);
  if (!context || context.map.width <= 1) {
    return false;
  }

  selectColumn(editor, context, context.map.width - 1);
  if (!editor.commands.deleteColumn()) {
    return false;
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

  return true;
}

function removeRowAtEnd(
  editor: TiptapEditor | null,
  setState: (nextState: TableOverlayState | null) => void
): boolean {
  if (!editor) {
    return false;
  }

  const context = getLiveTableContext(editor);
  if (!context || context.map.height <= 1) {
    return false;
  }

  selectRow(editor, context, context.map.height - 1);
  if (!editor.commands.deleteRow()) {
    return false;
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

  return true;
}

function runTableMutationWithHistoryTime(editor: TiptapEditor, historyTime: number, run: () => boolean): boolean {
  const originalDispatch = editor.view.dispatch.bind(editor.view);
  let didRun = false;

  editor.view.dispatch = (transaction) => {
    transaction.time = historyTime;
    originalDispatch(transaction);
  };

  try {
    const result = run();
    didRun = result !== false;
  } finally {
    editor.view.dispatch = originalDispatch;
  }

  return didRun;
}

function getTrailingRowStepPx(layout: TableLayout): number {
  return Math.max(1, layout.rowHeights[layout.rowHeights.length - 1] ?? layout.tableRect.height / Math.max(1, layout.map.height));
}

function getTrailingColumnStepPx(layout: TableLayout): number {
  return Math.max(1, layout.columnWidths[layout.columnWidths.length - 1] ?? layout.tableRect.width / Math.max(1, layout.map.width));
}

type TableRailResizeKind = "row" | "column";

type TableRailResizeSession = {
  dragActivated: boolean;
  historyClosed: boolean;
  historyTime: number;
  originBoundaryAxis: number;
  originCount: number;
  originStepPx: number;
  kind: TableRailResizeKind;
  originClientX: number;
  originClientY: number;
  lastClientX: number;
  lastClientY: number;
  ownerDocument: Document;
  pointerId: number;
  pointerCaptureTarget: HTMLButtonElement | null;
  tablePos: number;
};

function useTableRailResizeSession(
  editor: TiptapEditor | null,
  setOverlayState: (nextState: TableOverlayState | null) => void
): {
  handleRailClick: (kind: TableRailResizeKind) => boolean;
  handleRailPointerDown: (
    kind: TableRailResizeKind,
    event: ReactPointerEvent<HTMLButtonElement>
  ) => void;
} {
  const sessionRef = useRef<TableRailResizeSession | null>(null);
  const suppressNextClickRef = useRef<TableRailResizeKind | null>(null);

  const getEditorOwnerDocument = useCallback((): Document | null => {
    if (!editor || editor.isDestroyed) {
      return null;
    }

    try {
      return editor.view.dom.ownerDocument;
    } catch {
      return null;
    }
  }, [editor]);

  const clearNativeSelectionRanges = useCallback(() => {
    const ownerDocument = getEditorOwnerDocument();
    const selection = ownerDocument?.getSelection();
    if (!selection || selection.rangeCount === 0) {
      return;
    }

    selection.removeAllRanges();
  }, [getEditorOwnerDocument]);

  const clearTableRailCursorLock = useCallback((ownerDocument: Document | null) => {
    ownerDocument?.documentElement.removeAttribute(TABLE_RAIL_CURSOR_LOCK_ATTRIBUTE);
  }, []);

  const lockTableRailCursor = useCallback((ownerDocument: Document, kind: TableRailResizeKind) => {
    ownerDocument.documentElement.setAttribute(TABLE_RAIL_CURSOR_LOCK_ATTRIBUTE, kind);
  }, []);

  const syncLiveTableState = useCallback(
    (session: TableRailResizeSession | null): TableLayout | null => {
      const runtimeEditor = editor;
      if (!runtimeEditor || runtimeEditor.isDestroyed) {
        setOverlayState(null);
        return null;
      }

      if (!session) {
        return null;
      }

      const tableContext = getLiveTableContextFromTablePos(runtimeEditor, session.tablePos);
      if (!tableContext) {
        setOverlayState(null);
        return null;
      }

      const layout = resolveTableLayoutFromContext(runtimeEditor, tableContext);
      if (!layout) {
        setOverlayState(null);
        return null;
      }

      setOverlayState({
        ...layout,
        ...resolveSelectedTableIndexes(runtimeEditor),
      });
      return layout;
    },
    [editor, setOverlayState]
  );

  const ensureTrailingColumnContentVisibility = useCallback(
    (layout: TableLayout): boolean => {
      const maxScrollLeft = Math.max(0, layout.tableWrapper.scrollWidth - layout.tableWrapper.clientWidth);
      if (layout.tableWrapper.scrollLeft > maxScrollLeft) {
        layout.tableWrapper.scrollLeft = maxScrollLeft;
        return true;
      }

      if (layout.tableWrapper.scrollWidth <= layout.tableWrapper.clientWidth) {
        return false;
      }

      const overflow = layout.tableRect.right - layout.wrapperRect.right;
      if (overflow <= 0) {
        return false;
      }

      const nextScrollLeft = clamp(layout.tableWrapper.scrollLeft + overflow, 0, maxScrollLeft);
      if (nextScrollLeft === layout.tableWrapper.scrollLeft) {
        return false;
      }

      layout.tableWrapper.scrollLeft = nextScrollLeft;
      return true;
    },
    []
  );

  const clearSession = useCallback(
    (options: { suppressClick?: boolean } = {}) => {
      const { suppressClick = false } = options;
      const session = sessionRef.current;
      if (session && suppressClick) {
        suppressNextClickRef.current = session.kind;
      }

      if (session?.pointerCaptureTarget) {
        try {
          const hasPointerCapture =
            typeof session.pointerCaptureTarget.hasPointerCapture === "function" &&
            session.pointerCaptureTarget.hasPointerCapture(session.pointerId);
          if (typeof session.pointerCaptureTarget.releasePointerCapture === "function" && hasPointerCapture) {
            session.pointerCaptureTarget.releasePointerCapture(session.pointerId);
          }
        } catch {
          // Ignore pointer-capture cleanup failures during teardown or lost-capture paths.
        }
      }

      clearTableRailCursorLock(session?.ownerDocument ?? null);
      sessionRef.current = null;
    },
    [clearTableRailCursorLock]
  );

  const activateSession = useCallback(
    (session: TableRailResizeSession) => {
      if (session.dragActivated) {
        return;
      }

      session.dragActivated = true;
      lockTableRailCursor(session.ownerDocument, session.kind);
      if (session.pointerCaptureTarget && typeof session.pointerCaptureTarget.setPointerCapture === "function") {
        try {
          session.pointerCaptureTarget.setPointerCapture(session.pointerId);
        } catch {
          // Pointer capture is an enhancement for browser fidelity; the document listeners remain the source of truth.
        }
      }
      if (!session.historyClosed && editor && !editor.isDestroyed) {
        editor.view.dispatch(closeHistory(editor.state.tr));
        session.historyClosed = true;
      }
      clearNativeSelectionRanges();
      syncLiveTableState(session);
    },
    [clearNativeSelectionRanges, editor, lockTableRailCursor, syncLiveTableState]
  );

  const applySessionResizeAtPoint = useCallback(
    (pointerX: number, pointerY: number) => {
      const runtimeEditor = editor;
      const session = sessionRef.current;
      if (!runtimeEditor || runtimeEditor.isDestroyed || !session) {
        return false;
      }

      const liveLayout = syncLiveTableState(session);
      if (!liveLayout) {
        clearSession({ suppressClick: session.dragActivated });
        return false;
      }

      const currentCount = session.kind === "row" ? liveLayout.map.height : liveLayout.map.width;
      const delta =
        session.kind === "row"
          ? pointerY - session.originBoundaryAxis
          : pointerX - session.originBoundaryAxis;
      const targetCount = Math.max(1, session.originCount + Math.trunc(delta / session.originStepPx));
      if (targetCount === currentCount) {
        return true;
      }

      let safety = 0;
      while (safety < 200) {
        safety += 1;
        const nextLiveLayout = syncLiveTableState(session);
        if (!nextLiveLayout) {
          clearSession({ suppressClick: session.dragActivated });
          return false;
        }

        const nextCurrentCount = session.kind === "row" ? nextLiveLayout.map.height : nextLiveLayout.map.width;
        if (nextCurrentCount === targetCount) {
          if (session.kind === "column" && ensureTrailingColumnContentVisibility(nextLiveLayout)) {
            syncLiveTableState(session);
          }
          return true;
        }

        const runMutation =
          targetCount > nextCurrentCount
            ? () => {
                if (session.kind === "row") {
                  return addRowAtEnd(runtimeEditor, setOverlayState);
                }

                return addColumnAtEnd(runtimeEditor, setOverlayState);
              }
            : () => {
                if (session.kind === "row") {
                  return removeRowAtEnd(runtimeEditor, setOverlayState);
                }

                return removeColumnAtEnd(runtimeEditor, setOverlayState);
              };

        if (!session.historyClosed) {
          editor.view.dispatch(closeHistory(editor.state.tr));
          session.historyClosed = true;
        }

        const didMutate = runTableMutationWithHistoryTime(runtimeEditor, session.historyTime, runMutation);
        if (!didMutate) {
          clearSession({ suppressClick: session.dragActivated });
          return false;
        }

        const mutatedLayout = syncLiveTableState(session);
        if (mutatedLayout && session.kind === "column" && ensureTrailingColumnContentVisibility(mutatedLayout)) {
          syncLiveTableState(session);
        }
      }

      return true;
    },
    [clearSession, editor, ensureTrailingColumnContentVisibility, syncLiveTableState, setOverlayState]
  );

  const handleRailPointerDown = useCallback(
    (kind: TableRailResizeKind, event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0) {
        return;
      }

      event.stopPropagation();

      if (!editor || editor.isDestroyed) {
        return;
      }

      const ownerDocument = event.currentTarget.ownerDocument;
      const context = getLiveTableContext(editor);
      if (!context) {
        return;
      }

      const layout = resolveTableLayoutFromContext(editor, context);
      if (!layout) {
        return;
      }

      const originCount = kind === "row" ? layout.map.height : layout.map.width;
      const originBoundaryAxis = kind === "row" ? layout.tableRect.bottom : layout.tableRect.right;
      const originStepPx = kind === "row" ? getTrailingRowStepPx(layout) : getTrailingColumnStepPx(layout);

      suppressNextClickRef.current = null;
      clearSession();
      lockTableRailCursor(ownerDocument, kind);
      sessionRef.current = {
        dragActivated: false,
        historyClosed: false,
        historyTime: Date.now(),
        originBoundaryAxis,
        originCount,
        originStepPx,
        kind,
        originClientX: event.clientX,
        originClientY: event.clientY,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        ownerDocument,
        pointerId: event.pointerId,
        pointerCaptureTarget: event.currentTarget,
        tablePos: context.tablePos,
      };
    },
    [clearSession, editor]
  );

  const handleRailClick = useCallback(
    (kind: TableRailResizeKind) => {
      if (suppressNextClickRef.current === kind) {
        suppressNextClickRef.current = null;
        return false;
      }

      if (!editor || editor.isDestroyed) {
        return false;
      }

      return kind === "row" ? addRowAtEnd(editor, setOverlayState) : addColumnAtEnd(editor, setOverlayState);
    },
    [editor, setOverlayState]
  );

  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      clearSession();
      return;
    }

    const ownerDocument = getEditorOwnerDocument();
    if (!ownerDocument) {
      clearSession();
      return;
    }

    const ownerWindow = ownerDocument.defaultView;
    if (!ownerWindow) {
      clearSession();
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }

      session.lastClientX = event.clientX;
      session.lastClientY = event.clientY;

      const deltaX = event.clientX - session.originClientX;
      const deltaY = event.clientY - session.originClientY;
      const primaryDelta = session.kind === "row" ? deltaY : deltaX;
      const orthogonalDelta = session.kind === "row" ? deltaX : deltaY;
      const isAxisAligned = Math.abs(primaryDelta) >= TABLE_RAIL_DRAG_THRESHOLD_PX && Math.abs(primaryDelta) >= Math.abs(orthogonalDelta);
      if (!session.dragActivated) {
        if (!isAxisAligned) {
          return;
        }

        activateSession(session);
      }

      event.preventDefault();
      clearNativeSelectionRanges();
      applySessionResizeAtPoint(event.clientX, event.clientY);
    };

    const handlePointerUp = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }

      if (session.dragActivated) {
        event.preventDefault();
        applySessionResizeAtPoint(event.clientX, event.clientY);
        clearSession({ suppressClick: true });
        return;
      }

      clearSession();
    };

    const handlePointerCancel = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }

      clearSession();
    };

    const handleLostPointerCapture = (event: PointerEvent) => {
      const session = sessionRef.current;
      if (!session || session.pointerId !== event.pointerId) {
        return;
      }

      clearSession();
    };

    const handleSelectStart = (event: Event) => {
      if (!sessionRef.current?.dragActivated) {
        return;
      }

      event.preventDefault();
      clearNativeSelectionRanges();
    };

    const handleVisibilityChange = () => {
      if (ownerDocument.visibilityState === "hidden") {
        clearSession();
      }
    };

    const handleWindowBlur = () => {
      clearSession();
    };

    const handleTransaction = () => {
      const session = sessionRef.current;
      if (!session || editor.isDestroyed) {
        return;
      }

      if (!getLiveTableContextFromTablePos(editor, session.tablePos)) {
        clearSession();
      }
    };

    const canSubscribeToEditorEvents =
      typeof editor.on === "function" && typeof editor.off === "function";

    ownerDocument.addEventListener("pointermove", handlePointerMove, true);
    ownerDocument.addEventListener("pointerup", handlePointerUp, true);
    ownerDocument.addEventListener("pointercancel", handlePointerCancel, true);
    ownerDocument.addEventListener("lostpointercapture", handleLostPointerCapture, true);
    ownerDocument.addEventListener("selectstart", handleSelectStart, true);
    ownerDocument.addEventListener("visibilitychange", handleVisibilityChange);
    ownerWindow.addEventListener("blur", handleWindowBlur);
    if (canSubscribeToEditorEvents) {
      editor.on("transaction", handleTransaction);
    }

    return () => {
      ownerDocument.removeEventListener("pointermove", handlePointerMove, true);
      ownerDocument.removeEventListener("pointerup", handlePointerUp, true);
      ownerDocument.removeEventListener("pointercancel", handlePointerCancel, true);
      ownerDocument.removeEventListener("lostpointercapture", handleLostPointerCapture, true);
      ownerDocument.removeEventListener("selectstart", handleSelectStart, true);
      ownerDocument.removeEventListener("visibilitychange", handleVisibilityChange);
      ownerWindow.removeEventListener("blur", handleWindowBlur);
      if (canSubscribeToEditorEvents) {
        editor.off("transaction", handleTransaction);
      }
      clearSession();
    };
  }, [activateSession, applySessionResizeAtPoint, clearNativeSelectionRanges, clearSession, editor, getEditorOwnerDocument]);

  return {
    handleRailClick,
    handleRailPointerDown,
  };
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
  clearNativeSelectionIfCellSelection(editor);
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
  clearNativeSelectionIfCellSelection(editor);
}

function shouldFlipRowMenu(layout: TableLayout, rowIndex: number, ownerWindow: Window): boolean {
  const rowCenterY = layout.rowCenters[rowIndex];
  return rowCenterY + TABLE_CONTROL_MENU_MIN_HEIGHT_PX / 2 > ownerWindow.innerHeight - TABLE_CONTROL_VIEWPORT_EDGE_PX;
}

function shouldFlipColumnMenu(layout: TableLayout, columnIndex: number, ownerWindow: Window): boolean {
  const columnCenterX = layout.columnCenters[columnIndex];
  return columnCenterX + TABLE_CONTROL_MENU_MIN_WIDTH_PX / 2 > ownerWindow.innerWidth - TABLE_CONTROL_VIEWPORT_EDGE_PX;
}
