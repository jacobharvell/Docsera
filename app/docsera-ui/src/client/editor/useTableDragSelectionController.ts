import type { Editor as TiptapEditor } from "@tiptap/core";
import { CellSelection, TableMap, findTable } from "@tiptap/pm/tables";
import { useCallback, useEffect, useRef } from "react";

type TableCellCoordinates = {
  rowIndex: number;
  columnIndex: number;
};

type PendingTableDragSelection = {
  pointerId: number;
  tableElement: HTMLTableElement;
  tablePos: number;
  anchorCoordinates: TableCellCoordinates;
};

type ActiveTableDragSelection = PendingTableDragSelection & {
  currentCoordinates: TableCellCoordinates;
};

const TABLE_DRAG_SELECTION_ACTIVE_ATTR = "data-docsera-table-drag-selection-active";
const TABLE_OVERLAY_EXCLUSION_SELECTOR = [
  "[data-docsera-table-handle='true']",
  "[data-docsera-table-add-rail-kind='row']",
  "[data-docsera-table-add-rail-kind='column']",
  "[data-docsera-table-menu='true']",
].join(", ");

function getTableContextFromCell(
  editor: TiptapEditor,
  cellElement: HTMLTableCellElement
): {
  map: TableMap;
  tableElement: HTMLTableElement;
  tableNode: TiptapEditor["state"]["doc"];
  tablePos: number;
  tableStart: number;
} | null {
  const tableElement = cellElement.closest("table");
  if (!(tableElement instanceof HTMLTableElement)) {
    return null;
  }

  if (editor.isDestroyed) {
    return null;
  }

  let editorView: TiptapEditor["view"] | null = null;
  try {
    editorView = editor.view;
  } catch {
    editorView = null;
  }

  if (!editorView) {
    return null;
  }

  const ownerDocument = tableElement.ownerDocument;
  const editorDom = editorView.dom;
  if (ownerDocument !== editorDom.ownerDocument || !editorDom.contains(tableElement)) {
    return null;
  }

  const activeTable = findTable(editor.state.selection.$from);
  if (activeTable) {
    const activeNodeDom = editorView.nodeDOM(activeTable.pos);
    const activeTableElement =
      activeNodeDom instanceof HTMLTableElement
        ? activeNodeDom
        : activeNodeDom instanceof HTMLElement
        ? activeNodeDom.querySelector("table")
        : null;
    if (activeTableElement === tableElement) {
      return {
        map: TableMap.get(activeTable.node),
        tableElement,
        tableNode: activeTable.node,
        tablePos: activeTable.pos,
        tableStart: activeTable.start,
      };
    }
  }

  let resolvedCellPos: number | null = null;
  try {
    resolvedCellPos = editorView.posAtDOM(cellElement, 0);
  } catch {
    resolvedCellPos = null;
  }

  if (resolvedCellPos === null) {
    return null;
  }

  let currentTable:
    | {
        node: TiptapEditor["state"]["doc"];
        pos: number;
        start: number;
      }
    | null = null;
  try {
    currentTable = findTable(editor.state.doc.resolve(resolvedCellPos));
  } catch {
    currentTable = null;
  }

  if (!currentTable) {
    return null;
  }

  return {
    map: TableMap.get(currentTable.node),
    tableElement,
    tableNode: currentTable.node,
    tablePos: currentTable.pos,
    tableStart: currentTable.start,
  };
}

function resolveCellCoordinates(
  tableElement: HTMLTableElement,
  cellElement: HTMLTableCellElement
): TableCellCoordinates | null {
  const rowElement = cellElement.parentElement;
  if (!(rowElement instanceof HTMLTableRowElement)) {
    return null;
  }

  const rowElements = Array.from(tableElement.querySelectorAll("tr"));
  const rowIndex = rowElements.indexOf(rowElement);
  const rowCells = Array.from(rowElement.querySelectorAll(":scope > th, :scope > td"));
  const columnIndex = rowCells.indexOf(cellElement);
  if (rowIndex < 0 || columnIndex < 0) {
    return null;
  }

  return {
    rowIndex,
    columnIndex,
  };
}

function coordinatesMatch(left: TableCellCoordinates, right: TableCellCoordinates): boolean {
  return left.rowIndex === right.rowIndex && left.columnIndex === right.columnIndex;
}

function getSelectionHost(tableElement: HTMLTableElement): HTMLElement {
  return (tableElement.closest(".tableWrapper") as HTMLElement | null) ?? tableElement;
}

export default function useTableDragSelectionController(
  editor: TiptapEditor | null,
  enabled: boolean
): void {
  const pendingSelectionRef = useRef<PendingTableDragSelection | null>(null);
  const activeSelectionRef = useRef<ActiveTableDragSelection | null>(null);

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

  const setSelectionHostActive = useCallback((tableElement: HTMLTableElement, isActive: boolean) => {
    const host = getSelectionHost(tableElement);
    if (isActive) {
      host.setAttribute(TABLE_DRAG_SELECTION_ACTIVE_ATTR, "true");
      return;
    }

    host.removeAttribute(TABLE_DRAG_SELECTION_ACTIVE_ATTR);
  }, []);

  const dispatchCellSelection = useCallback(
    (
      tablePos: number,
      anchorCoordinates: TableCellCoordinates,
      headCoordinates: TableCellCoordinates
    ) => {
      if (!editor || editor.isDestroyed) {
        return false;
      }

      const nodeAtTablePos = editor.state.doc.nodeAt(tablePos);
      if (!nodeAtTablePos || nodeAtTablePos.type.name !== "table") {
        return false;
      }

      const map = TableMap.get(nodeAtTablePos);
      const boundedAnchorRow = Math.max(0, Math.min(anchorCoordinates.rowIndex, map.height - 1));
      const boundedAnchorColumn = Math.max(0, Math.min(anchorCoordinates.columnIndex, map.width - 1));
      const boundedHeadRow = Math.max(0, Math.min(headCoordinates.rowIndex, map.height - 1));
      const boundedHeadColumn = Math.max(0, Math.min(headCoordinates.columnIndex, map.width - 1));
      const tableStart = tablePos + 1;
      const anchorCellPos = tableStart + map.positionAt(boundedAnchorRow, boundedAnchorColumn, nodeAtTablePos);
      const headCellPos = tableStart + map.positionAt(boundedHeadRow, boundedHeadColumn, nodeAtTablePos);
      const tr = editor.state.tr;
      tr.setSelection(new CellSelection(tr.doc.resolve(anchorCellPos), tr.doc.resolve(headCellPos)));
      editor.view.dispatch(tr);
      editor.view.focus();
      return true;
    },
    [editor, getEditorOwnerDocument]
  );

  const stopActiveSelection = useCallback(
    (pointerId: number | null) => {
      const activeSelection = activeSelectionRef.current;
      if (activeSelection && (pointerId === null || activeSelection.pointerId === pointerId)) {
        activeSelectionRef.current = null;
        setSelectionHostActive(activeSelection.tableElement, false);
        const ownerWindow = getEditorOwnerDocument()?.defaultView;
        if (ownerWindow) {
          ownerWindow.requestAnimationFrame(() => {
            clearNativeSelectionRanges();
          });
        } else {
          clearNativeSelectionRanges();
        }
      }

      const pendingSelection = pendingSelectionRef.current;
      if (pendingSelection && (pointerId === null || pendingSelection.pointerId === pointerId)) {
        pendingSelectionRef.current = null;
      }
    },
    [clearNativeSelectionRanges, editor, getEditorOwnerDocument, setSelectionHostActive]
  );

  useEffect(() => {
    if (!editor || !enabled || editor.isDestroyed) {
      stopActiveSelection(null);
      return;
    }

    const ownerDocument = getEditorOwnerDocument();
    if (!ownerDocument) {
      stopActiveSelection(null);
      return;
    }
    const ownerWindow = ownerDocument.defaultView;
    if (!ownerWindow) {
      return;
    }

    const activatePendingSelection = (
      pendingSelection: PendingTableDragSelection,
      headCoordinates: TableCellCoordinates,
      pointerEvent: PointerEvent
    ) => {
      setSelectionHostActive(pendingSelection.tableElement, true);
      activeSelectionRef.current = {
        ...pendingSelection,
        currentCoordinates: headCoordinates,
      };
      pendingSelectionRef.current = null;
      pointerEvent.preventDefault();
      clearNativeSelectionRanges();
      dispatchCellSelection(
        pendingSelection.tablePos,
        pendingSelection.anchorCoordinates,
        headCoordinates
      );
    };

    const resolveCurrentCell = (event: PointerEvent): HTMLTableCellElement | null => {
      const target = event.target;
      if (target instanceof HTMLElement) {
        const directCell = target.closest("td, th");
        if (directCell instanceof HTMLTableCellElement) {
          return directCell;
        }
      }

      const elementFromPoint =
        typeof ownerDocument.elementFromPoint === "function"
          ? ownerDocument.elementFromPoint(event.clientX, event.clientY)
          : null;
      if (!(elementFromPoint instanceof HTMLElement)) {
        return null;
      }

      const pointCell = elementFromPoint.closest("td, th");
      return pointCell instanceof HTMLTableCellElement ? pointCell : null;
    };

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 0) {
        stopActiveSelection(null);
        return;
      }

      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        stopActiveSelection(null);
        return;
      }

      if (target.closest(TABLE_OVERLAY_EXCLUSION_SELECTOR)) {
        stopActiveSelection(null);
        return;
      }

      const cellElement = target.closest("td, th");
      if (!(cellElement instanceof HTMLTableCellElement)) {
        stopActiveSelection(null);
        return;
      }

      const tableContext = getTableContextFromCell(editor, cellElement);
      if (!tableContext) {
        stopActiveSelection(null);
        return;
      }

      const anchorCoordinates = resolveCellCoordinates(tableContext.tableElement, cellElement);
      if (!anchorCoordinates) {
        stopActiveSelection(null);
        return;
      }

      stopActiveSelection(null);
      pendingSelectionRef.current = {
        anchorCoordinates,
        pointerId: event.pointerId,
        tableElement: tableContext.tableElement,
        tablePos: tableContext.tablePos,
      };
    };

    const handlePointerMove = (event: PointerEvent) => {
      const activeSelection = activeSelectionRef.current;
      if (activeSelection && activeSelection.pointerId === event.pointerId) {
        const currentCell = resolveCurrentCell(event);
        if (!currentCell) {
          event.preventDefault();
          clearNativeSelectionRanges();
          return;
        }

        if (currentCell.closest("table") !== activeSelection.tableElement) {
          event.preventDefault();
          clearNativeSelectionRanges();
          return;
        }

        const nextCoordinates = resolveCellCoordinates(activeSelection.tableElement, currentCell);
        if (!nextCoordinates || coordinatesMatch(nextCoordinates, activeSelection.currentCoordinates)) {
          event.preventDefault();
          clearNativeSelectionRanges();
          return;
        }

        activeSelection.currentCoordinates = nextCoordinates;
        event.preventDefault();
        clearNativeSelectionRanges();
        dispatchCellSelection(
          activeSelection.tablePos,
          activeSelection.anchorCoordinates,
          nextCoordinates
        );
        return;
      }

      const pendingSelection = pendingSelectionRef.current;
      if (!pendingSelection || pendingSelection.pointerId !== event.pointerId) {
        return;
      }

      const currentCell = resolveCurrentCell(event);
      if (!currentCell) {
        return;
      }

      if (currentCell.closest("table") !== pendingSelection.tableElement) {
        return;
      }

      const currentCoordinates = resolveCellCoordinates(pendingSelection.tableElement, currentCell);
      if (!currentCoordinates) {
        return;
      }

      const shouldActivate =
        editor.state.selection instanceof CellSelection ||
        !coordinatesMatch(currentCoordinates, pendingSelection.anchorCoordinates);

      if (shouldActivate) {
        activatePendingSelection(pendingSelection, currentCoordinates, event);
      }
    };

    const handlePointerUp = (event: PointerEvent) => {
      stopActiveSelection(event.pointerId);
    };

    const handlePointerCancel = (event: PointerEvent) => {
      stopActiveSelection(event.pointerId);
    };

    const handleWindowBlur = () => {
      stopActiveSelection(null);
    };

    const handleSelectStart = (event: Event) => {
      if (!activeSelectionRef.current) {
        return;
      }

      event.preventDefault();
      clearNativeSelectionRanges();
    };

    ownerDocument.addEventListener("pointerdown", handlePointerDown, true);
    ownerDocument.addEventListener("pointermove", handlePointerMove, true);
    ownerDocument.addEventListener("pointerup", handlePointerUp, true);
    ownerDocument.addEventListener("pointercancel", handlePointerCancel, true);
    ownerWindow.addEventListener("blur", handleWindowBlur);
    ownerDocument.addEventListener("selectstart", handleSelectStart, true);

    return () => {
      ownerDocument.removeEventListener("pointerdown", handlePointerDown, true);
      ownerDocument.removeEventListener("pointermove", handlePointerMove, true);
      ownerDocument.removeEventListener("pointerup", handlePointerUp, true);
      ownerDocument.removeEventListener("pointercancel", handlePointerCancel, true);
      ownerWindow.removeEventListener("blur", handleWindowBlur);
      ownerDocument.removeEventListener("selectstart", handleSelectStart, true);
      stopActiveSelection(null);
    };
  }, [
    clearNativeSelectionRanges,
    dispatchCellSelection,
    editor,
    enabled,
    getEditorOwnerDocument,
    stopActiveSelection,
    setSelectionHostActive
  ]);
}
