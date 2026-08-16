/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { CellSelection, findTable, TableMap } from "@tiptap/pm/tables";
import { useMemo, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import type { DocseraDocumentEnvelope } from "../../shared/editor/document";
import { PageTree, type InlinePageCreateState } from "../features/workspaces/PageTree";
import { buildWorkspacePageTree } from "../features/workspaces/workspaceViewModels";
import { requestPageOwnershipHandoff } from "../pageOwnershipHandoff";
import type { WorkspacePageRecord } from "../shared/types/docsera";
import { createEnvelopeFromDocument, renderRuntime } from "./PageEditorHostRuntime.testUtils";

const LIGHT_ACTIVE_PILL_SURFACE = "#4648d4";
const DARK_ACTIVE_PILL_SURFACE = "#7c83fa";
const DARK_ACTIVE_PILL_ELLIPSIS = "#ffffff";
const MUTED_PILL_BORDER = "var(--docsera-editor-panel-border)";

function getTableControlPrimaryColor(theme: "light" | "dark"): string {
  return theme === "dark" ? DARK_ACTIVE_PILL_SURFACE : LIGHT_ACTIVE_PILL_SURFACE;
}

function normalizeColor(value: string | null | undefined): string {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) {
    return "";
  }

  if (normalized.startsWith("#")) {
    return normalized;
  }

  const rgbMatch = normalized.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/);
  if (!rgbMatch) {
    return normalized;
  }

  return `#${rgbMatch
    .slice(1)
    .map((channel) => Number(channel).toString(16).padStart(2, "0"))
    .join("")}`;
}

function createTableDocument(rows: number, columns: number): DocseraDocumentEnvelope["document"] {
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: Array.from({ length: rows }, (_, rowIndex) => ({
          type: "tableRow",
          content: Array.from({ length: columns }, (_, columnIndex) => ({
            type: "tableCell",
            attrs: {
              colspan: 1,
              rowspan: 1,
              colwidth: null
            },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: `R${rowIndex + 1}C${columnIndex + 1}` }]
              }
            ]
          }))
        }))
      }
    ]
  };
}

function createWorkspacePageRecord(overrides: Partial<WorkspacePageRecord> & Pick<WorkspacePageRecord, "draftTitle" | "sysId">): WorkspacePageRecord {
  const draftSlug = slugify(overrides.draftSlug ?? overrides.draftTitle);
  return {
    ...overrides,
    active: true,
    draftBodyText: null,
    draftContentJson: createEnvelopeFromDocument(createTableDocument(1, 1)),
    draftRevision: 0,
    draftSlug,
    draftSlugNormalized: overrides.draftSlugNormalized ?? draftSlug,
    draftTitle: overrides.draftTitle,
    parentPageSysId: overrides.parentPageSysId ?? null,
    publicationState: overrides.publicationState ?? "draft",
    publishedAt: overrides.publishedAt ?? null,
    publishedBodyText: null,
    publishedByDisplayName: overrides.publishedByDisplayName ?? null,
    publishedBySysId: overrides.publishedBySysId ?? null,
    publishedContentJson: overrides.publishedContentJson ?? null,
    publishedSlug: overrides.publishedSlug ?? null,
    publishedSlugNormalized: overrides.publishedSlugNormalized ?? null,
    publishedTitle: overrides.publishedTitle ?? null,
    siblingOrder: overrides.siblingOrder ?? 1,
    sysId: overrides.sysId,
    workspaceSysId: overrides.workspaceSysId ?? "workspace-001",
  };
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled-page";
}

function createInlineCreateState(parentPageSysId = "", focusToken = 0): InlinePageCreateState {
  return {
    errorMessage: "",
    focusToken,
    noticeMessage: "",
    parentPageSysId,
    pending: false,
    showInput: true,
    title: "untitled-page"
  };
}

function getTableCell(editor: HTMLElement, row: number, column: number): HTMLTableCellElement {
  const cell = editor.querySelector(`.ProseMirror table tr:nth-child(${row}) td:nth-child(${column})`);
  if (!(cell instanceof HTMLTableCellElement)) {
    throw new Error(`Expected cell ${row}, ${column} to be available.`);
  }
  return cell;
}

function getTableWrapper(editor: HTMLElement): HTMLElement {
  const wrapper = editor.querySelector(".tableWrapper");
  if (!(wrapper instanceof HTMLElement)) {
    throw new Error("Expected a table wrapper.");
  }
  return wrapper;
}

function installTableGeometry(input: {
  editor: HTMLElement;
  left: number;
  top: number;
  rows: number;
  columns: number;
  cellHeight: number;
  cellWidth: number;
  scrollLeft?: number;
  wrapperWidth?: number;
}) {
  const { editor, left, top, rows, columns, cellHeight, cellWidth } = input;
  const wrapper = getTableWrapper(editor);
  const table = editor.querySelector(".ProseMirror table");
  if (!(table instanceof HTMLTableElement)) {
    throw new Error("Expected a table element.");
  }

  const cells = Array.from(table.querySelectorAll("td, th")) as HTMLTableCellElement[];
  const wrapperWidth = input.wrapperWidth ?? columns * cellWidth;
  let scrollLeft = input.scrollLeft ?? 0;
  const wrapperHeight = rows * cellHeight;
  const tableRect = () => new DOMRect(left - scrollLeft, top, columns * cellWidth, rows * cellHeight);
  const wrapperRect = () => new DOMRect(left, top, wrapperWidth, wrapperHeight);
  const cellRect = (rowIndex: number, columnIndex: number) =>
    new DOMRect(
      left - scrollLeft + columnIndex * cellWidth,
      top + rowIndex * cellHeight,
      cellWidth,
      cellHeight
    );

  const restore: Array<() => void> = [];
  const defineRect = (element: Element, getRect: () => DOMRect) => {
    const original = Object.getOwnPropertyDescriptor(element, "getBoundingClientRect");
    Object.defineProperty(element, "getBoundingClientRect", {
      configurable: true,
      value: getRect
    });
    restore.push(() => {
      if (original) {
        Object.defineProperty(element, "getBoundingClientRect", original);
        return;
      }
      Reflect.deleteProperty(element, "getBoundingClientRect");
    });
  };

  defineRect(wrapper, wrapperRect);
  defineRect(table, tableRect);
  cells.forEach((cell, index) => {
    defineRect(cell, () => cellRect(Math.floor(index / columns), index % columns));
  });

  const defineMetric = (element: Element, property: string, value: number) => {
    const original = Object.getOwnPropertyDescriptor(element, property);
    Object.defineProperty(element, property, {
      configurable: true,
      get: () => value
    });
    restore.push(() => {
      if (original) {
        Object.defineProperty(element, property, original);
        return;
      }
      Reflect.deleteProperty(element, property);
    });
  };

  defineMetric(wrapper, "clientWidth", wrapperWidth);
  defineMetric(wrapper, "scrollWidth", columns * cellWidth);
  defineMetric(wrapper, "clientHeight", wrapperHeight);
  defineMetric(wrapper, "offsetWidth", wrapperWidth);
  defineMetric(wrapper, "offsetHeight", wrapperHeight + 12);
  defineMetric(wrapper, "scrollHeight", wrapperHeight);
  Object.defineProperty(wrapper, "scrollLeft", {
    configurable: true,
    get: () => scrollLeft,
    set: (next: number) => {
      scrollLeft = next;
    }
  });
  restore.push(() => {
    Reflect.deleteProperty(wrapper, "scrollLeft");
  });

  const originalElementFromPoint = editor.ownerDocument.elementFromPoint?.bind(editor.ownerDocument) ?? null;
  Object.defineProperty(editor.ownerDocument, "elementFromPoint", {
    configurable: true,
    value: (x: number, y: number) => {
      for (const cell of cells) {
        const rect = cell.getBoundingClientRect();
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          return cell;
        }
      }

      const wrapperBox = wrapper.getBoundingClientRect();
      if (x >= wrapperBox.left && x <= wrapperBox.right && y >= wrapperBox.top && y <= wrapperBox.bottom) {
        return wrapper;
      }

      const tableBox = table.getBoundingClientRect();
      if (x >= tableBox.left && x <= tableBox.right && y >= tableBox.top && y <= tableBox.bottom) {
        return table;
      }

      return originalElementFromPoint ? originalElementFromPoint(x, y) : null;
    }
  });
  restore.push(() => {
    Object.defineProperty(editor.ownerDocument, "elementFromPoint", {
      configurable: true,
      value: originalElementFromPoint
    });
  });

  return {
    setScrollLeft(next: number) {
      scrollLeft = next;
    },
    restore() {
      for (const step of restore.reverse()) {
        step();
      }
    }
  };
}

function dispatchPointerEvent(
  target: EventTarget,
  type: "pointerdown" | "pointermove" | "pointerup",
  input: {
    button?: number;
    buttons?: number;
    clientX: number;
    clientY: number;
    pointerId?: number;
    pointerType?: string;
  }
) {
  const eventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: input.button ?? 0,
    buttons: input.buttons ?? 0,
    clientX: input.clientX,
    clientY: input.clientY,
    pointerId: input.pointerId ?? 1,
    pointerType: input.pointerType ?? "mouse"
  };
  const event =
    typeof window.PointerEvent === "function"
      ? new window.PointerEvent(type, eventInit)
      : new window.MouseEvent(type, eventInit);

  Object.defineProperties(event, {
    button: { configurable: true, value: eventInit.button },
    buttons: { configurable: true, value: eventInit.buttons },
    clientX: { configurable: true, value: eventInit.clientX },
    clientY: { configurable: true, value: eventInit.clientY },
    pointerId: { configurable: true, value: eventInit.pointerId },
    pointerType: { configurable: true, value: eventInit.pointerType }
  });

  target.dispatchEvent(event);
}

function withBoxedTableMapRects<T>(run: () => Promise<T>): Promise<T> {
  const originalGet = TableMap.get.bind(TableMap);
  const boxedNumber = (value: number): number => new Number(value) as unknown as number;
  const boxRect = (rect: { bottom: number; left: number; right: number; top: number }) => ({
    bottom: boxedNumber(rect.bottom),
    left: boxedNumber(rect.left),
    right: boxedNumber(rect.right),
    top: boxedNumber(rect.top),
  });

  const getSpy = vi.spyOn(TableMap, "get").mockImplementation((node) => {
    const map = originalGet(node);
    return Object.assign(Object.create(Object.getPrototypeOf(map)), map, {
      findCell(pos: number) {
        return boxRect(map.findCell(pos));
      },
      rectBetween(left: number, right: number) {
        return boxRect(map.rectBetween(left, right));
      },
    });
  });

  return run().finally(() => {
    getSpy.mockRestore();
  });
}

function getNativeSelectionState() {
  const selection = window.getSelection();
  return selection
    ? {
        rangeCount: selection.rangeCount,
        text: selection.toString()
      }
    : null;
}

function getTableHandleIndexes(overlayRoot: HTMLElement, kind: "row" | "column"): number[] {
  return Array.from(
    overlayRoot.querySelectorAll(`[data-docsera-table-handle-kind="${kind}"]`)
  )
    .map((handle) => Number((handle as HTMLElement).dataset.docseraTableHandleIndex))
    .sort((left, right) => left - right);
}

function getActiveTableHandleIndexes(overlayRoot: HTMLElement, kind: "row" | "column"): number[] {
  return Array.from(
    overlayRoot.querySelectorAll(
      `[data-docsera-table-handle-kind="${kind}"][data-docsera-table-handle-accented="true"]`
    )
  )
    .map((handle) => Number((handle as HTMLElement).dataset.docseraTableHandleIndex))
    .sort((left, right) => left - right);
}

function getTableHandleButton(
  overlayRoot: HTMLElement,
  kind: "row" | "column",
  index: number
): HTMLButtonElement | null {
  const selector = `[data-docsera-table-handle-kind="${kind}"][data-docsera-table-handle-index="${index}"]`;
  const handle = overlayRoot.querySelector(selector) ?? overlayRoot.ownerDocument.querySelector(selector);
  return handle instanceof HTMLButtonElement ? handle : null;
}

function getTableHandleShell(
  overlayRoot: HTMLElement,
  kind: "row" | "column",
  index: number
): HTMLSpanElement | null {
  const handle = getTableHandleButton(overlayRoot, kind, index);
  const shell = handle?.querySelector("[data-docsera-table-handle-pill='true']");
  return shell instanceof HTMLSpanElement ? shell : null;
}

function getTableHandleEllipsisIcon(
  overlayRoot: HTMLElement,
  kind: "row" | "column",
  index: number
): SVGElement | null {
  const handle = getTableHandleButton(overlayRoot, kind, index);
  const icon = handle?.querySelector("[data-docsera-table-handle-ellipsis='true'] svg");
  return icon instanceof SVGElement ? icon : null;
}

function getExpandedTableHandles(
  overlayRoot: HTMLElement
): Array<{ index: number; kind: "row" | "column" }> {
  return Array.from(
    overlayRoot.querySelectorAll('[data-docsera-table-handle="true"][data-docsera-table-handle-expanded="true"]')
  )
    .map<{ index: number; kind: "row" | "column" }>((handle) => {
      const element = handle as HTMLElement;
      const kind = element.dataset.docseraTableHandleKind;
      const index = Number(element.dataset.docseraTableHandleIndex);
      if ((kind !== "row" && kind !== "column") || Number.isNaN(index)) {
        throw new Error("Expected expanded table handles to expose kind and index metadata.");
      }

      return { kind, index };
    })
    .sort((left, right) =>
      left.kind === right.kind ? left.index - right.index : left.kind.localeCompare(right.kind)
    );
}

function expectTableHandleVisualState(
  overlayRoot: HTMLElement,
  input: {
    index: number;
    kind: "row" | "column";
    state: "active" | "muted";
    theme?: "light" | "dark";
  }
): void {
  const handle = getTableHandleButton(overlayRoot, input.kind, input.index);
  const shell = getTableHandleShell(overlayRoot, input.kind, input.index);
  const ellipsisIcon = getTableHandleEllipsisIcon(overlayRoot, input.kind, input.index);
  expect(handle).toBeInstanceOf(HTMLButtonElement);
  expect(shell).toBeInstanceOf(HTMLSpanElement);
  expect(handle).toHaveAttribute("data-docsera-table-handle-visual-state", input.state);
  expect(handle).toHaveAttribute(
    "data-docsera-table-handle-accented",
    input.state === "active" ? "true" : "false"
  );

  const expectedColor =
    input.state === "active"
      ? getTableControlPrimaryColor(input.theme ?? "light")
      : MUTED_PILL_BORDER;
  expect(normalizeColor(shell?.style.borderColor)).toBe(expectedColor);
  if (input.state === "active") {
    expect(normalizeColor(shell?.style.backgroundColor)).toBe(expectedColor);
    expect(normalizeColor(getComputedStyle(shell!).borderColor)).toBe(expectedColor);
    expect(normalizeColor(getComputedStyle(shell!).backgroundColor)).toBe(expectedColor);
    expect(shell?.style.boxShadow).not.toContain(expectedColor);
    expect(shell?.style.boxShadow).not.toContain("var(--docsera-editor-primary)");
    expect(ellipsisIcon).toBeInstanceOf(SVGElement);
    if (input.theme === "dark") {
      expect(normalizeColor(ellipsisIcon?.getAttribute("stroke"))).toBe(normalizeColor(DARK_ACTIVE_PILL_ELLIPSIS));
    }
  } else {
    expect(shell?.style.backgroundColor).toContain("color-mix");
    expect(shell?.style.boxShadow).toContain("var(--docsera-editor-panel-border)");
  }
}

function getCellSelectionRect(editor: Editor): {
  bottom: number;
  left: number;
  right: number;
  top: number;
} | null {
  const selection = editor.state.selection;
  if (!(selection instanceof CellSelection)) {
    return null;
  }

  const table = findTable(selection.$anchorCell);
  if (!table) {
    return null;
  }

  const map = TableMap.get(table.node);
  return map.rectBetween(selection.$anchorCell.pos - table.start, selection.$headCell.pos - table.start);
}

function getTableRowCount(editor: Editor): number {
  const table = editor.state.doc.firstChild;
  if (!table || table.type.name !== "table") {
    throw new Error("Expected the document to contain a table.");
  }

  return table.childCount;
}

function getNormalizedSelectedTableCellCoordinates(editor: Editor): Array<{
  columnIndex: number;
  rowIndex: number;
}> {
  const selection = editor.state.selection;
  if (!(selection instanceof CellSelection)) {
    return [];
  }

  const rect = getCellSelectionRect(editor);
  if (!rect) {
    return [];
  }

  const coordinates: Array<{ columnIndex: number; rowIndex: number }> = [];
  for (let rowIndex = rect.top; rowIndex < rect.bottom; rowIndex += 1) {
    for (let columnIndex = rect.left; columnIndex < rect.right; columnIndex += 1) {
      coordinates.push({ columnIndex, rowIndex });
    }
  }

  return Array.from(
    new Map(coordinates.map((coordinate) => [`${coordinate.rowIndex}:${coordinate.columnIndex}`, coordinate])).values()
  ).sort((left, right) =>
    left.rowIndex === right.rowIndex ? left.columnIndex - right.columnIndex : left.rowIndex - right.rowIndex
  );
}

function getFirstTableCellParagraphPosition(editor: Editor): number {
  let position: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (position === null && node.type.name === "paragraph") {
      const $pos = editor.state.doc.resolve(pos);
      for (let depth = $pos.depth; depth > 0; depth -= 1) {
        const nodeName = $pos.node(depth).type.name;
        if (nodeName === "tableCell" || nodeName === "tableHeader") {
          position = pos;
          return false;
        }
      }
    }

    return true;
  });

  if (position === null) {
    throw new Error("Expected a paragraph inside the first table cell.");
  }

  return position;
}

function getTableCellTextNode(editor: HTMLElement, row: number, column: number): Text {
  const textNode = getTableCell(editor, row, column).querySelector("p")?.firstChild;
  if (!(textNode instanceof Text)) {
    throw new Error(`Expected a text node inside cell ${row}, ${column}.`);
  }

  return textNode;
}

function getTableCellText(editor: HTMLElement, row: number, column: number): string {
  return getTableCellTextNode(editor, row, column).textContent ?? "";
}

function getTableCellTextPosition(editor: Editor, row: number, column: number, offset: number): number {
  const textNode = getTableCellTextNode(editor.view.dom, row, column);
  return editor.view.posAtDOM(textNode, offset);
}

function setCollapsedNativeSelection(textNode: Text, offset: number): void {
  const selection = window.getSelection();
  if (!selection) {
    throw new Error("Expected the native selection API to be available.");
  }

  selection.removeAllRanges();
  const range = document.createRange();
  range.setStart(textNode, offset);
  range.collapse(true);
  selection.addRange(range);
}

async function dragTableSelection(
  startCell: HTMLTableCellElement,
  endCell: HTMLTableCellElement,
  pointerId: number
): Promise<void> {
  await act(async () => {
    startCell.focus();
    dispatchPointerEvent(startCell, "pointerdown", {
      button: 0,
      buttons: 1,
      clientX: startCell.getBoundingClientRect().left + 8,
      clientY: startCell.getBoundingClientRect().top + 8,
      pointerId,
      pointerType: "mouse"
    });
  });

  await act(async () => {
    dispatchPointerEvent(document, "pointermove", {
      buttons: 1,
      clientX: endCell.getBoundingClientRect().left + 8,
      clientY: endCell.getBoundingClientRect().top + 8,
      pointerId,
      pointerType: "mouse"
    });
  });

  await act(async () => {
    dispatchPointerEvent(document, "pointerup", {
      button: 0,
      buttons: 0,
      clientX: endCell.getBoundingClientRect().left + 8,
      clientY: endCell.getBoundingClientRect().top + 8,
      pointerId,
      pointerType: "mouse"
    });
  });
}

async function clickWithPointer(
  target: HTMLElement,
  pointerId: number
): Promise<void> {
  const rect = target.getBoundingClientRect();
  const clientX = rect.left + Math.max(8, rect.width / 2);
  const clientY = rect.top + Math.max(8, rect.height / 2);

  await act(async () => {
    dispatchPointerEvent(target, "pointerdown", {
      button: 0,
      buttons: 1,
      clientX,
      clientY,
      pointerId,
      pointerType: "mouse"
    });
  });

  await act(async () => {
    dispatchPointerEvent(target, "pointerup", {
      button: 0,
      buttons: 0,
      clientX,
      clientY,
      pointerId,
      pointerType: "mouse"
    });
  });

  await act(async () => {
    fireEvent.click(target, {
      button: 0,
      clientX,
      clientY
    });
  });
}

function setTableCellSelection(
  editor: Editor,
  startCell: readonly [number, number],
  endCell: readonly [number, number]
): void {
  const startCellElement = getTableCell(editor.view.dom, startCell[0], startCell[1]);
  const endCellElement = getTableCell(editor.view.dom, endCell[0], endCell[1]);

  const resolveCellPosition = (cellElement: HTMLTableCellElement): number => {
    const firstText = cellElement.querySelector("p")?.firstChild;
    if (!(firstText instanceof Text)) {
      throw new Error("Expected a text node inside the table cell.");
    }

    const textPos = editor.view.posAtDOM(firstText, 0);
    const resolvedPos = editor.state.doc.resolve(textPos);
    for (let depth = resolvedPos.depth; depth > 0; depth -= 1) {
      const nodeName = resolvedPos.node(depth).type.name;
      if (nodeName === "tableCell" || nodeName === "tableHeader") {
        return resolvedPos.before(depth);
      }
    }

    throw new Error("Expected the text node to resolve inside a table cell.");
  };

  const startPos = resolveCellPosition(startCellElement);
  const endPos = resolveCellPosition(endCellElement);
  const tr = editor.state.tr;
  tr.setSelection(CellSelection.create(tr.doc, startPos, endPos));
  editor.view.dispatch(tr);
}

function renderTableNavigationHarness(options: {
  initialPageRecords?: WorkspacePageRecord[];
  initialSelectedPageId?: string;
} = {}) {
  const initialPageRecords =
    options.initialPageRecords ??
    [
      createWorkspacePageRecord({
        draftSlug: "overview",
        draftTitle: "Overview",
        draftSlugNormalized: "overview",
        sysId: "page-001"
      })
    ];
  const initialSelectedPageId = options.initialSelectedPageId ?? initialPageRecords[0]?.sysId ?? "";

  function Harness() {
    const [pageRecords, setPageRecords] = useState(initialPageRecords);
    const [selectedPageId, setSelectedPageId] = useState(initialSelectedPageId);
    const [inlineCreateState, setInlineCreateState] = useState<InlinePageCreateState | null>(null);
    const [focusToken, setFocusToken] = useState(0);
    const pages = useMemo(() => buildWorkspacePageTree(pageRecords, "edit"), [pageRecords]);
    const openInlineCreate = (parentPageSysId = "") => {
      requestPageOwnershipHandoff({
        pageSysId: selectedPageId,
        reason: "page-create-inline-title"
      });
      const nextFocusToken = focusToken + 1;
      setFocusToken(nextFocusToken);
      setInlineCreateState(createInlineCreateState(parentPageSysId, nextFocusToken));
    };

    return (
      <>
        <button
          type="button"
          aria-label="Header New page"
          onClick={() => openInlineCreate()}
        >
          Header New page
        </button>
        <PageTree
          canCreatePage
          canManagePageSettings={false}
          collapsedPageIds={[]}
          filterText=""
          inlineCreateState={inlineCreateState}
          isCreatingPage={false}
          onCollapsedPageIdsChange={vi.fn()}
          onCommitInlineCreate={() => {
            const title = inlineCreateState?.title.trim() ?? "";
            if (!title) {
              setInlineCreateState(null);
              return;
            }

            const slug = slugify(title);
            const sysId = `page-created-${pageRecords.length + 1}`;
            const nextPage = createWorkspacePageRecord({
              draftSlug: slug,
              draftSlugNormalized: slug,
              draftTitle: title,
              siblingOrder: pageRecords.length + 1,
              sysId
            });
            setPageRecords((current) => [...current, nextPage]);
            setSelectedPageId(sysId);
            setInlineCreateState(null);
          }}
          onInlineCreateTitleChange={(value) => {
            setInlineCreateState((current) => (current ? { ...current, title: value } : current));
          }}
          onMovePage={undefined}
          onSelectPage={(pageId) => {
            setSelectedPageId(pageId);
          }}
          onShowChildPageCreate={(parentPageId) => {
            openInlineCreate(parentPageId);
          }}
          onShowCreatePage={() => {
            openInlineCreate();
          }}
          onTogglePageSettings={vi.fn()}
          pageSettingsOpenPageId=""
          pages={pages}
          selectedPageId={selectedPageId}
        />
      </>
    );
  }

  return render(<Harness />);
}

function treeNewPageButton(): HTMLButtonElement {
  const button = document.querySelector(".docsera-page-tree__new-page");
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Missing tree New page button.");
  }
  return button;
}

function headerNewPageButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "Header New page" });
}

describe("PageEditorHostRuntime table drag selection", () => {
  it("keeps ordinary within-cell pointer gestures available and promotes cross-cell drags to CellSelection", async () => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createTableDocument(3, 3))
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const proseMirror = editor.view.dom;
    const tableWrapper = getTableWrapper(proseMirror);
    const geometry = installTableGeometry({
      editor: proseMirror,
      left: 120,
      top: 140,
      rows: 3,
      columns: 3,
      cellWidth: 120,
      cellHeight: 56
    });

    try {
      const firstCell = getTableCell(proseMirror, 1, 1);
      const secondCell = getTableCell(proseMirror, 1, 2);
      await act(async () => {
        firstCell.focus();
        dispatchPointerEvent(firstCell, "pointerdown", {
          button: 0,
          buttons: 1,
          clientX: firstCell.getBoundingClientRect().left + 8,
          clientY: firstCell.getBoundingClientRect().top + 8,
          pointerId: 3,
          pointerType: "mouse"
        });
      });

      expect(editor.state.selection instanceof CellSelection).toBe(false);
      expect(tableWrapper).not.toHaveAttribute("data-docsera-table-drag-selection-active", "true");

      await act(async () => {
        dispatchPointerEvent(document, "pointermove", {
          buttons: 1,
          clientX: secondCell.getBoundingClientRect().left + 8,
          clientY: secondCell.getBoundingClientRect().top + 8,
          pointerId: 3,
          pointerType: "mouse"
        });
      });

      await waitFor(() => {
        expect(editor.state.selection instanceof CellSelection).toBe(true);
      });
      expect(tableWrapper).toHaveAttribute("data-docsera-table-drag-selection-active", "true");
      await act(async () => {
        dispatchPointerEvent(document, "pointerup", {
          button: 0,
          buttons: 0,
          clientX: secondCell.getBoundingClientRect().left + 8,
          clientY: secondCell.getBoundingClientRect().top + 8,
          pointerId: 3,
          pointerType: "mouse"
        });
      });

      await waitFor(() => {
        expect(getNativeSelectionState()?.rangeCount ?? 0).toBe(0);
      });
    } finally {
      geometry.restore();
    }
  });

  it("keeps a settled CellSelection alive while the pointer pauses, reaches an edge, and reverses direction", async () => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createTableDocument(4, 4))
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const proseMirror = editor.view.dom;
    const geometry = installTableGeometry({
      editor: proseMirror,
      left: 120,
      top: 140,
      rows: 4,
      columns: 4,
      cellWidth: 120,
      cellHeight: 56
    });

    try {
      const startCell = getTableCell(proseMirror, 2, 2);
      const edgeCell = getTableCell(proseMirror, 1, 4);
      const reverseCell = getTableCell(proseMirror, 1, 1);

      await act(async () => {
        startCell.focus();
        dispatchPointerEvent(startCell, "pointerdown", {
          button: 0,
          buttons: 1,
          clientX: startCell.getBoundingClientRect().left + 8,
          clientY: startCell.getBoundingClientRect().top + 8,
          pointerId: 9,
          pointerType: "mouse"
        });
      });

      await act(async () => {
        dispatchPointerEvent(document, "pointermove", {
          buttons: 1,
          clientX: getTableCell(proseMirror, 2, 3).getBoundingClientRect().left + 8,
          clientY: getTableCell(proseMirror, 2, 3).getBoundingClientRect().top + 8,
          pointerId: 9,
          pointerType: "mouse"
        });
      });

      await waitFor(() => {
        expect(editor.state.selection instanceof CellSelection).toBe(true);
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(editor.state.selection instanceof CellSelection).toBe(true);

      await act(async () => {
        dispatchPointerEvent(document, "pointermove", {
          buttons: 1,
          clientX: edgeCell.getBoundingClientRect().left + 8,
          clientY: edgeCell.getBoundingClientRect().top + 8,
          pointerId: 9,
          pointerType: "mouse"
        });
      });

      await waitFor(() => {
        expect(editor.state.selection instanceof CellSelection).toBe(true);
      });

      await act(async () => {
        dispatchPointerEvent(document, "pointermove", {
          buttons: 1,
          clientX: reverseCell.getBoundingClientRect().left + 8,
          clientY: reverseCell.getBoundingClientRect().top + 8,
          pointerId: 9,
          pointerType: "mouse"
        });
      });

      await waitFor(() => {
        expect(editor.state.selection instanceof CellSelection).toBe(true);
      });

      await act(async () => {
        dispatchPointerEvent(document, "pointerup", {
          button: 0,
          buttons: 0,
          clientX: reverseCell.getBoundingClientRect().left + 8,
          clientY: reverseCell.getBoundingClientRect().top + 8,
          pointerId: 9,
          pointerType: "mouse"
        });
      });

      await waitFor(() => {
        expect(editor.state.selection instanceof CellSelection).toBe(true);
        expect(getNativeSelectionState()?.rangeCount ?? 0).toBe(0);
      });
    } finally {
      geometry.restore();
    }
  });

  it("keeps ordinary text selections inside a table cell usable and does not clear the browser selection", async () => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createTableDocument(3, 3))
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const proseMirror = editor.view.dom;
    const geometry = installTableGeometry({
      editor: proseMirror,
      left: 120,
      top: 140,
      rows: 3,
      columns: 3,
      cellWidth: 120,
      cellHeight: 56
    });

    try {
      const firstCellParagraphPosition = getFirstTableCellParagraphPosition(editor);
      await act(async () => {
        editor.commands.setTextSelection(firstCellParagraphPosition + 1);
      });

      const firstCellText = getTableCell(proseMirror, 1, 1).querySelector("p")?.firstChild;
      if (!(firstCellText instanceof Text)) {
        throw new Error("Expected the first table cell text node to be available.");
      }

      await act(async () => {
        const selection = window.getSelection();
        if (!selection) {
          throw new Error("Expected the native selection API to be available.");
        }

        selection.removeAllRanges();
        const range = document.createRange();
        range.setStart(firstCellText, 0);
        range.setEnd(firstCellText, firstCellText.textContent?.length ?? 0);
        selection.addRange(range);
      });

      await waitFor(() => {
        expect(getNativeSelectionState()?.rangeCount).toBe(1);
        expect(getNativeSelectionState()?.text).not.toBe("");
      });
    } finally {
      geometry.restore();
    }
  });

  it("returns a multi-cell structural selection to a stable in-cell caret and preserves later text and drag gestures", async () => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createTableDocument(3, 3))
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const proseMirror = editor.view.dom;
    const geometry = installTableGeometry({
      editor: proseMirror,
      left: 120,
      top: 140,
      rows: 3,
      columns: 3,
      cellWidth: 120,
      cellHeight: 56
    });

    try {
      setTableCellSelection(editor, [1, 1], [2, 2]);

      await waitFor(() => {
        expect(editor.state.selection instanceof CellSelection).toBe(true);
        expect(getNativeSelectionState()?.rangeCount ?? 0).toBe(0);
      });

      const targetCell = getTableCell(proseMirror, 2, 2);
      const targetText = getTableCellTextNode(proseMirror, 2, 2);
      const caretOffset = 2;
      const caretPosition = getTableCellTextPosition(editor, 2, 2, caretOffset);

      await act(async () => {
        fireEvent.pointerDown(targetCell, {
          button: 0,
          buttons: 1,
          clientX: targetCell.getBoundingClientRect().left + 18,
          clientY: targetCell.getBoundingClientRect().top + 18,
          pointerId: 17,
          pointerType: "mouse"
        });
        fireEvent.mouseDown(targetCell, {
          button: 0,
          buttons: 1,
          clientX: targetCell.getBoundingClientRect().left + 18,
          clientY: targetCell.getBoundingClientRect().top + 18
        });
        setCollapsedNativeSelection(targetText, caretOffset);
        targetCell.ownerDocument.dispatchEvent(new Event("selectionchange"));
      });

      await waitFor(() => {
        const selection = window.getSelection();
        expect(selection?.rangeCount ?? 0).toBe(1);
        expect(selection?.anchorNode).toBe(targetText);
        expect(selection?.anchorOffset).toBe(caretOffset);
      });

      await act(async () => {
        editor.commands.setTextSelection(caretPosition);
        fireEvent.pointerUp(targetCell, {
          button: 0,
          buttons: 0,
          clientX: targetCell.getBoundingClientRect().left + 18,
          clientY: targetCell.getBoundingClientRect().top + 18,
          pointerId: 17,
          pointerType: "mouse"
        });
        fireEvent.mouseUp(targetCell, {
          button: 0,
          buttons: 0,
          clientX: targetCell.getBoundingClientRect().left + 18,
          clientY: targetCell.getBoundingClientRect().top + 18
        });
        fireEvent.click(targetCell, {
          button: 0,
          clientX: targetCell.getBoundingClientRect().left + 18,
          clientY: targetCell.getBoundingClientRect().top + 18
        });
        targetCell.ownerDocument.dispatchEvent(new Event("selectionchange"));
      });

      await waitFor(() => {
        expect(editor.state.selection instanceof CellSelection).toBe(false);
        expect(editor.state.selection.from).toBe(caretPosition);
        expect(editor.state.selection.to).toBe(caretPosition);
      });

      await act(async () => {
        editor.commands.insertContent("!");
      });

      await waitFor(() => {
        expect(getTableCellText(proseMirror, 2, 2)).toBe("R2!C2");
      });

      await act(async () => {
        const selection = window.getSelection();
        if (!selection) {
          throw new Error("Expected the native selection API to be available.");
        }

        selection.removeAllRanges();
        const range = document.createRange();
        range.setStart(targetText, 1);
        range.setEnd(targetText, 4);
        selection.addRange(range);
        targetCell.ownerDocument.dispatchEvent(new Event("selectionchange"));
      });

      await waitFor(() => {
        expect(editor.state.selection instanceof CellSelection).toBe(false);
        expect(getNativeSelectionState()?.text).toBe("2!C");
      });

      await dragTableSelection(getTableCell(proseMirror, 2, 2), getTableCell(proseMirror, 2, 3), 18);

      await waitFor(() => {
        expect(editor.state.selection instanceof CellSelection).toBe(true);
        expect(getNativeSelectionState()?.rangeCount ?? 0).toBe(0);
      });
    } finally {
      geometry.restore();
    }
  });

  it("updates the live structural pills only when the selected rectangle reaches the top row or leftmost column", async () => {
    const { editorReady, overlayRoot } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createTableDocument(4, 4))
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const proseMirror = editor.view.dom;
    const geometry = installTableGeometry({
      editor: proseMirror,
      left: 120,
      top: 140,
      rows: 4,
      columns: 4,
      cellWidth: 120,
      cellHeight: 56
    });

    try {
      await act(async () => {
        setTableCellSelection(editor, [2, 2], [3, 3]);
      });

      await waitFor(() => {
        expect(editor.state.selection instanceof CellSelection).toBe(true);
        expect(proseMirror.querySelectorAll(".docsera-table-selection-outline")).toHaveLength(4);
        expect(getTableHandleIndexes(overlayRoot, "row")).toEqual([]);
        expect(getTableHandleIndexes(overlayRoot, "column")).toEqual([]);
      });

      await act(async () => {
        setTableCellSelection(editor, [2, 1], [3, 2]);
      });

      await waitFor(() => {
        expect(getTableHandleIndexes(overlayRoot, "row")).toEqual([1, 2]);
        expect(getTableHandleIndexes(overlayRoot, "column")).toEqual([]);
        expect(getTableHandleButton(overlayRoot, "row", 1)).toHaveAttribute("data-docsera-table-handle-accented", "true");
        expect(getTableHandleButton(overlayRoot, "row", 2)).toHaveAttribute("data-docsera-table-handle-accented", "true");
      });

      await act(async () => {
        setTableCellSelection(editor, [1, 1], [3, 2]);
      });

      await waitFor(() => {
        expect(getTableHandleIndexes(overlayRoot, "row")).toEqual([0, 1, 2]);
        expect(getTableHandleIndexes(overlayRoot, "column")).toEqual([0, 1]);
        expect(getTableHandleButton(overlayRoot, "row", 0)).toBeVisible();
        expect(getTableHandleButton(overlayRoot, "row", 1)).toBeVisible();
        expect(getTableHandleButton(overlayRoot, "row", 2)).toBeVisible();
        expect(getTableHandleButton(overlayRoot, "column", 0)).toBeVisible();
        expect(getTableHandleButton(overlayRoot, "column", 1)).toBeVisible();
      });

      await act(async () => {
        setTableCellSelection(editor, [1, 2], [2, 3]);
      });

      await waitFor(() => {
        expect(getTableHandleIndexes(overlayRoot, "row")).toEqual([]);
        expect(getTableHandleIndexes(overlayRoot, "column")).toEqual([1, 2]);
        expect(getTableHandleButton(overlayRoot, "column", 1)).toHaveAttribute("data-docsera-table-handle-accented", "true");
        expect(getTableHandleButton(overlayRoot, "column", 2)).toHaveAttribute("data-docsera-table-handle-accented", "true");
      });

      await act(async () => {
        setTableCellSelection(editor, [3, 2], [4, 3]);
      });

      await waitFor(() => {
        expect(getTableHandleIndexes(overlayRoot, "row")).toEqual([]);
        expect(getTableHandleIndexes(overlayRoot, "column")).toEqual([]);
      });

      await act(async () => {
        setTableCellSelection(editor, [2, 3], [3, 4]);
      });

      await waitFor(() => {
        expect(getTableHandleIndexes(overlayRoot, "row")).toEqual([]);
        expect(getTableHandleIndexes(overlayRoot, "column")).toEqual([]);
      });

      await act(async () => {
        setTableCellSelection(editor, [3, 3], [4, 4]);
      });

      await waitFor(() => {
        expect(getTableHandleIndexes(overlayRoot, "row")).toEqual([]);
        expect(getTableHandleIndexes(overlayRoot, "column")).toEqual([]);
      });

      await act(async () => {
        setTableCellSelection(editor, [2, 2], [3, 3]);
      });

      await waitFor(() => {
        expect(getTableHandleIndexes(overlayRoot, "row")).toEqual([]);
        expect(getTableHandleIndexes(overlayRoot, "column")).toEqual([]);
      });
    } finally {
      geometry.restore();
    }
  });

  it.each([
    {
      expectedColumnIndexes: [1, 2],
      expectedRowIndexes: [],
      label: "top edge",
      startCell: [2, 2] as const,
      endCell: [1, 3] as const
    },
    {
      expectedColumnIndexes: [],
      expectedRowIndexes: [],
      label: "bottom edge only",
      startCell: [3, 2] as const,
      endCell: [4, 3] as const
    },
    {
      expectedColumnIndexes: [],
      expectedRowIndexes: [1, 2],
      label: "left edge",
      startCell: [2, 1] as const,
      endCell: [3, 2] as const
    },
    {
      expectedColumnIndexes: [],
      expectedRowIndexes: [],
      label: "right edge only",
      startCell: [2, 3] as const,
      endCell: [3, 4] as const
    },
    {
      expectedColumnIndexes: [0, 1],
      expectedRowIndexes: [0, 1, 2],
      label: "exact annotated top-left range",
      startCell: [3, 2] as const,
      endCell: [1, 1] as const
    },
    {
      expectedColumnIndexes: [2, 3],
      expectedRowIndexes: [],
      label: "top-right corner",
      startCell: [1, 3] as const,
      endCell: [2, 4] as const
    },
    {
      expectedColumnIndexes: [],
      expectedRowIndexes: [2, 3],
      label: "bottom-left corner",
      startCell: [3, 1] as const,
      endCell: [4, 2] as const
    },
    {
      expectedColumnIndexes: [],
      expectedRowIndexes: [],
      label: "bottom-right corner",
      startCell: [3, 3] as const,
      endCell: [4, 4] as const
    },
    {
      expectedColumnIndexes: [],
      expectedRowIndexes: [],
      label: "fully interior range",
      startCell: [2, 2] as const,
      endCell: [3, 3] as const
    },
    {
      expectedColumnIndexes: [0, 1],
      expectedRowIndexes: [0, 1, 2],
      label: "reversed exact annotated top-left range",
      startCell: [1, 1] as const,
      endCell: [3, 2] as const
    }
  ])("projects the real pointer-drag selection onto the $label pills", async ({ endCell, expectedColumnIndexes, expectedRowIndexes, startCell }) => {
    const { editorReady, overlayRoot } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createTableDocument(4, 4))
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const proseMirror = editor.view.dom;
    const geometry = installTableGeometry({
      editor: proseMirror,
      left: 120,
      top: 140,
      rows: 4,
      columns: 4,
      cellWidth: 120,
      cellHeight: 56
    });

    try {
      await dragTableSelection(
        getTableCell(proseMirror, startCell[0], startCell[1]),
        getTableCell(proseMirror, endCell[0], endCell[1]),
        30
      );

      await waitFor(() => {
        expect(editor.state.selection instanceof CellSelection).toBe(true);
        expect(getTableHandleIndexes(overlayRoot, "column")).toEqual(expectedColumnIndexes);
        expect(getTableHandleIndexes(overlayRoot, "row")).toEqual(expectedRowIndexes);
        expectedColumnIndexes.forEach((index) => {
          expect(getTableHandleButton(overlayRoot, "column", index)).toBeVisible();
          expect(getTableHandleButton(overlayRoot, "column", index)).toHaveAttribute("data-docsera-table-handle-accented", "true");
        });
        expectedRowIndexes.forEach((index) => {
          expect(getTableHandleButton(overlayRoot, "row", index)).toBeVisible();
          expect(getTableHandleButton(overlayRoot, "row", index)).toHaveAttribute("data-docsera-table-handle-accented", "true");
        });
      });
    } finally {
      geometry.restore();
    }
  });

  it("normalizes the top-only pointer drag selection to selected cells before activating column pills", async () => {
    const { editorReady, overlayRoot } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createTableDocument(4, 4))
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const proseMirror = editor.view.dom;
    const geometry = installTableGeometry({
      editor: proseMirror,
      left: 120,
      top: 140,
      rows: 4,
      columns: 4,
      cellWidth: 120,
      cellHeight: 56
    });

    try {
      await dragTableSelection(getTableCell(proseMirror, 2, 2), getTableCell(proseMirror, 1, 3), 30);

      await waitFor(() => {
        expect(editor.state.selection instanceof CellSelection).toBe(true);
        expect(getNativeSelectionState()?.rangeCount ?? 0).toBe(0);
        expect(getNormalizedSelectedTableCellCoordinates(editor)).toEqual([
          { columnIndex: 1, rowIndex: 0 },
          { columnIndex: 2, rowIndex: 0 },
          { columnIndex: 1, rowIndex: 1 },
          { columnIndex: 2, rowIndex: 1 }
        ]);
        expect(getActiveTableHandleIndexes(overlayRoot, "column")).toEqual([1, 2]);
        expect(getActiveTableHandleIndexes(overlayRoot, "row")).toEqual([]);
      });

      expect(getTableHandleIndexes(overlayRoot, "column")).toEqual([1, 2]);
      expect(getTableHandleIndexes(overlayRoot, "row")).toEqual([]);
      expectTableHandleVisualState(overlayRoot, { index: 1, kind: "column", state: "active" });
      expectTableHandleVisualState(overlayRoot, { index: 2, kind: "column", state: "active" });
    } finally {
      geometry.restore();
    }
  });

  it("keeps exactly two active top-side column pills and no active row pills for the screenshot-equivalent two-by-two top-only drag selection after pointer release", async () => {
    const { editorReady, overlayRoot } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createTableDocument(4, 4))
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const proseMirror = editor.view.dom;
    const geometry = installTableGeometry({
      editor: proseMirror,
      left: 120,
      top: 140,
      rows: 4,
      columns: 4,
      cellWidth: 120,
      cellHeight: 56
    });

    try {
      await dragTableSelection(getTableCell(proseMirror, 2, 2), getTableCell(proseMirror, 1, 3), 32);

      await waitFor(() => {
        expect(editor.state.selection instanceof CellSelection).toBe(true);
        expect(getCellSelectionRect(editor)).toEqual({
          bottom: 2,
          left: 1,
          right: 3,
          top: 0
        });
        expect(getActiveTableHandleIndexes(overlayRoot, "column")).toEqual([1, 2]);
        expect(getActiveTableHandleIndexes(overlayRoot, "row")).toEqual([]);
      });

      expect(getTableHandleIndexes(overlayRoot, "column")).toEqual([1, 2]);
      expect(getTableHandleIndexes(overlayRoot, "row")).toEqual([]);
      expectTableHandleVisualState(overlayRoot, { index: 1, kind: "column", state: "active" });
      expectTableHandleVisualState(overlayRoot, { index: 2, kind: "column", state: "active" });
    } finally {
      geometry.restore();
    }
  });

  it("keeps the top-left two-by-two drag selection projected onto both structural edges after pointer release", async () => {
    const { editorReady, overlayRoot } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createTableDocument(4, 4))
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const proseMirror = editor.view.dom;
    const geometry = installTableGeometry({
      editor: proseMirror,
      left: 120,
      top: 140,
      rows: 4,
      columns: 4,
      cellWidth: 120,
      cellHeight: 56
    });

    try {
      await dragTableSelection(getTableCell(proseMirror, 1, 1), getTableCell(proseMirror, 2, 2), 24);

      await waitFor(() => {
        expect(editor.state.selection instanceof CellSelection).toBe(true);
        expect(getCellSelectionRect(editor)).toEqual({
          bottom: 2,
          left: 0,
          right: 2,
          top: 0
        });
        expect(getNormalizedSelectedTableCellCoordinates(editor)).toEqual([
          { columnIndex: 0, rowIndex: 0 },
          { columnIndex: 1, rowIndex: 0 },
          { columnIndex: 0, rowIndex: 1 },
          { columnIndex: 1, rowIndex: 1 }
        ]);
        expect(getActiveTableHandleIndexes(overlayRoot, "column")).toEqual([0, 1]);
        expect(getActiveTableHandleIndexes(overlayRoot, "row")).toEqual([0, 1]);
      });

      expect(getTableHandleIndexes(overlayRoot, "column")).toEqual([0, 1]);
      expect(getTableHandleIndexes(overlayRoot, "row")).toEqual([0, 1]);
      expectTableHandleVisualState(overlayRoot, { index: 0, kind: "column", state: "active" });
      expectTableHandleVisualState(overlayRoot, { index: 1, kind: "column", state: "active" });
      expectTableHandleVisualState(overlayRoot, { index: 0, kind: "row", state: "active" });
      expectTableHandleVisualState(overlayRoot, { index: 1, kind: "row", state: "active" });
    } finally {
      geometry.restore();
    }
  });

  it.each([
    {
      expectedColumnIndexes: [1, 2],
      expectedRowIndexes: [],
      label: "top-only structural range",
      startCell: [2, 2] as const,
      endCell: [1, 3] as const,
    },
    {
      expectedColumnIndexes: [],
      expectedRowIndexes: [1, 2],
      label: "left-only structural range",
      startCell: [3, 2] as const,
      endCell: [2, 1] as const,
    },
    {
      expectedColumnIndexes: [0, 1],
      expectedRowIndexes: [0, 1, 2],
      label: "top-left structural union",
      startCell: [3, 2] as const,
      endCell: [1, 1] as const,
    },
  ])("keeps structural pills active when the live table-map rectangles expose boxed number fields for the $label", async ({ endCell, expectedColumnIndexes, expectedRowIndexes, startCell }) => {
    await withBoxedTableMapRects(async () => {
      const { editorReady, overlayRoot } = renderRuntime({
        initialEnvelope: createEnvelopeFromDocument(createTableDocument(4, 4))
      });

      await waitFor(() => {
        expect(editorReady[0]).toBeDefined();
      });

      const editor = editorReady[0];
      const proseMirror = editor.view.dom;
      const geometry = installTableGeometry({
        editor: proseMirror,
        left: 120,
        top: 140,
        rows: 4,
        columns: 4,
        cellWidth: 120,
        cellHeight: 56
      });

      try {
        await dragTableSelection(
          getTableCell(proseMirror, startCell[0], startCell[1]),
          getTableCell(proseMirror, endCell[0], endCell[1]),
          41
        );

        await waitFor(() => {
          expect(editor.state.selection instanceof CellSelection).toBe(true);
          expect(getActiveTableHandleIndexes(overlayRoot, "column")).toEqual(expectedColumnIndexes);
          expect(getActiveTableHandleIndexes(overlayRoot, "row")).toEqual(expectedRowIndexes);
        });
      } finally {
        geometry.restore();
      }
    });
  });

  it("keeps exactly two active column pills and three active row pills for the annotated two-column by three-row top-left drag selection after pointer release", async () => {
    const { editorReady, overlayRoot } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createTableDocument(4, 4))
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const proseMirror = editor.view.dom;
    const geometry = installTableGeometry({
      editor: proseMirror,
      left: 120,
      top: 140,
      rows: 4,
      columns: 4,
      cellWidth: 120,
      cellHeight: 56
    });

    try {
      await dragTableSelection(getTableCell(proseMirror, 3, 2), getTableCell(proseMirror, 1, 1), 31);

      await waitFor(() => {
        expect(editor.state.selection instanceof CellSelection).toBe(true);
        expect(getTableHandleIndexes(overlayRoot, "column")).toEqual([0, 1]);
        expect(getTableHandleIndexes(overlayRoot, "row")).toEqual([0, 1, 2]);
      });

      const activeColumnHandles = Array.from(
        overlayRoot.querySelectorAll('[data-docsera-table-handle-kind="column"][data-docsera-table-handle-accented="true"]')
      );
      const activeRowHandles = Array.from(
        overlayRoot.querySelectorAll('[data-docsera-table-handle-kind="row"][data-docsera-table-handle-accented="true"]')
      );

      expect(activeColumnHandles).toHaveLength(2);
      expect(activeRowHandles).toHaveLength(3);
      expectTableHandleVisualState(overlayRoot, { index: 0, kind: "column", state: "active" });
      expectTableHandleVisualState(overlayRoot, { index: 1, kind: "column", state: "active" });
      expectTableHandleVisualState(overlayRoot, { index: 0, kind: "row", state: "active" });
      expectTableHandleVisualState(overlayRoot, { index: 1, kind: "row", state: "active" });
      expectTableHandleVisualState(overlayRoot, { index: 2, kind: "row", state: "active" });
    } finally {
      geometry.restore();
    }
  });

  it("keeps ordinary interior-cell locator pills visible but muted", async () => {
    const { editorReady, overlayRoot } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createTableDocument(4, 4))
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const proseMirror = editor.view.dom;
    const geometry = installTableGeometry({
      editor: proseMirror,
      left: 120,
      top: 140,
      rows: 4,
      columns: 4,
      cellWidth: 120,
      cellHeight: 56
    });

    try {
      await act(async () => {
        editor.commands.setTextSelection(getTableCellTextPosition(editor, 2, 2, 1));
      });

      await waitFor(() => {
        expect(getTableHandleIndexes(overlayRoot, "row")).toEqual([1]);
        expect(getTableHandleIndexes(overlayRoot, "column")).toEqual([1]);
        expect(getTableHandleButton(overlayRoot, "row", 1)).toBeVisible();
        expect(getTableHandleButton(overlayRoot, "column", 1)).toBeVisible();
      });

      expectTableHandleVisualState(overlayRoot, { index: 1, kind: "row", state: "muted" });
      expectTableHandleVisualState(overlayRoot, { index: 1, kind: "column", state: "muted" });
    } finally {
      geometry.restore();
    }
  });

  it("renders the dark-theme active pill chrome and table-control token with the exact Docsera color", async () => {
    const { editorReady, overlayRoot } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createTableDocument(4, 4)),
      theme: "dark"
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const proseMirror = editor.view.dom;
    const geometry = installTableGeometry({
      editor: proseMirror,
      left: 120,
      top: 140,
      rows: 4,
      columns: 4,
      cellWidth: 120,
      cellHeight: 56
    });

    try {
      await act(async () => {
        editor.commands.setTextSelection(getTableCellTextPosition(editor, 1, 1, 1));
      });

      await waitFor(() => {
        expect(getTableHandleIndexes(overlayRoot, "row")).toEqual([0]);
        expect(getTableHandleIndexes(overlayRoot, "column")).toEqual([0]);
        expect(getTableHandleButton(overlayRoot, "row", 0)).toBeVisible();
        expect(getTableHandleButton(overlayRoot, "column", 0)).toBeVisible();
      });

      expectTableHandleVisualState(overlayRoot, { index: 0, kind: "row", state: "active", theme: "dark" });
      expectTableHandleVisualState(overlayRoot, { index: 0, kind: "column", state: "active", theme: "dark" });
      expect(
        normalizeColor(
          getComputedStyle(proseMirror.closest(".docsera-editor-runtime") as HTMLElement)
            .getPropertyValue("--docsera-table-control-primary")
        )
      ).toBe(normalizeColor(DARK_ACTIVE_PILL_SURFACE));
    } finally {
      geometry.restore();
    }
  });

  it.each([
    {
      columnIndex: 2,
      expectedColumnState: "active" as const,
      expectedRowState: "muted" as const,
      label: "top-row cell",
      rowIndex: 1,
    },
    {
      columnIndex: 1,
      expectedColumnState: "muted" as const,
      expectedRowState: "active" as const,
      label: "leftmost-column cell",
      rowIndex: 2,
    },
    {
      columnIndex: 4,
      expectedColumnState: "muted" as const,
      expectedRowState: "muted" as const,
      label: "rightmost-column cell",
      rowIndex: 2,
    },
    {
      columnIndex: 2,
      expectedColumnState: "muted" as const,
      expectedRowState: "muted" as const,
      label: "bottom-row cell",
      rowIndex: 4,
    },
    {
      columnIndex: 1,
      expectedColumnState: "active" as const,
      expectedRowState: "active" as const,
      label: "top-left cell",
      rowIndex: 1,
    },
    {
      columnIndex: 4,
      expectedColumnState: "active" as const,
      expectedRowState: "muted" as const,
      label: "top-right cell",
      rowIndex: 1,
    },
    {
      columnIndex: 1,
      expectedColumnState: "muted" as const,
      expectedRowState: "active" as const,
      label: "bottom-left cell",
      rowIndex: 4,
    },
    {
      columnIndex: 4,
      expectedColumnState: "muted" as const,
      expectedRowState: "muted" as const,
      label: "bottom-right cell",
      rowIndex: 4,
    },
  ])(
    "renders the accepted locator-pill visual state for a $label",
    async ({ columnIndex, expectedColumnState, expectedRowState, rowIndex }) => {
      const { editorReady, overlayRoot } = renderRuntime({
        initialEnvelope: createEnvelopeFromDocument(createTableDocument(4, 4))
      });

      await waitFor(() => {
        expect(editorReady[0]).toBeDefined();
      });

      const editor = editorReady[0];
      const proseMirror = editor.view.dom;
      const geometry = installTableGeometry({
        editor: proseMirror,
        left: 120,
        top: 140,
        rows: 4,
        columns: 4,
        cellWidth: 120,
        cellHeight: 56
      });

      try {
        await act(async () => {
          editor.commands.setTextSelection(getTableCellTextPosition(editor, rowIndex, columnIndex, 1));
        });

        const expectedZeroBasedRowIndex = rowIndex - 1;
        const expectedZeroBasedColumnIndex = columnIndex - 1;

        await waitFor(() => {
          expect(getTableHandleIndexes(overlayRoot, "row")).toEqual([expectedZeroBasedRowIndex]);
          expect(getTableHandleIndexes(overlayRoot, "column")).toEqual([expectedZeroBasedColumnIndex]);
          expect(getTableHandleButton(overlayRoot, "row", expectedZeroBasedRowIndex)).toBeVisible();
          expect(getTableHandleButton(overlayRoot, "column", expectedZeroBasedColumnIndex)).toBeVisible();
        });

        expectTableHandleVisualState(overlayRoot, {
          index: expectedZeroBasedRowIndex,
          kind: "row",
          state: expectedRowState,
        });
        expectTableHandleVisualState(overlayRoot, {
          index: expectedZeroBasedColumnIndex,
          kind: "column",
          state: expectedColumnState,
        });
      } finally {
        geometry.restore();
      }
    }
  );

  it("keeps pill expansion hover-owned across menu transitions, pill clicks, and selection rerenders", async () => {
    const { editorReady, overlayRoot } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createTableDocument(4, 4))
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const proseMirror = editor.view.dom;
    const geometry = installTableGeometry({
      editor: proseMirror,
      left: 120,
      top: 140,
      rows: 4,
      columns: 4,
      cellWidth: 120,
      cellHeight: 56
    });

    try {
      await act(async () => {
        editor.commands.setTextSelection(getTableCellTextPosition(editor, 1, 1, 1));
      });

      await waitFor(() => {
        expect(getTableHandleIndexes(overlayRoot, "row")).toEqual([0]);
        expect(getTableHandleIndexes(overlayRoot, "column")).toEqual([0]);
      });

      const rowButton = getTableHandleButton(overlayRoot, "row", 0);
      const columnButton = getTableHandleButton(overlayRoot, "column", 0);
      const rowShell = getTableHandleShell(overlayRoot, "row", 0);
      const columnShell = getTableHandleShell(overlayRoot, "column", 0);
      if (
        !(rowButton instanceof HTMLButtonElement) ||
        !(columnButton instanceof HTMLButtonElement) ||
        !(rowShell instanceof HTMLSpanElement) ||
        !(columnShell instanceof HTMLSpanElement)
      ) {
        throw new Error("Expected the top-left row and column pills to be available.");
      }

      expect(getExpandedTableHandles(overlayRoot)).toEqual([]);

      fireEvent.mouseEnter(rowButton);
      await waitFor(() => {
        expect(getExpandedTableHandles(overlayRoot)).toEqual([{ index: 0, kind: "row" }]);
        expect(getComputedStyle(rowShell).height).toBe("28px");
      });

      fireEvent.mouseLeave(rowButton);
      await waitFor(() => {
        expect(getExpandedTableHandles(overlayRoot)).toEqual([]);
        expect(getComputedStyle(rowShell).height).toBe("18px");
      });

      fireEvent.mouseEnter(rowButton);
      await waitFor(() => {
        expect(getExpandedTableHandles(overlayRoot)).toEqual([{ index: 0, kind: "row" }]);
      });

      fireEvent.pointerDown(rowButton);
      await waitFor(() => {
        expect(
          overlayRoot.ownerDocument.querySelector(
            '[data-docsera-table-menu="true"][data-docsera-table-menu-kind="row"][data-docsera-table-menu-index="0"]'
          )
        ).toBeInstanceOf(HTMLElement);
        expect(getExpandedTableHandles(overlayRoot)).toEqual([]);
      });
      expectTableHandleVisualState(overlayRoot, { index: 0, kind: "row", state: "active" });

      const rowMenu = overlayRoot.ownerDocument.querySelector(
        '[data-docsera-table-menu="true"][data-docsera-table-menu-kind="row"][data-docsera-table-menu-index="0"]'
      );
      if (!(rowMenu instanceof HTMLElement)) {
        throw new Error("Expected the row menu to remain available.");
      }

      fireEvent.mouseMove(rowMenu);
      await waitFor(() => {
        expect(getExpandedTableHandles(overlayRoot)).toEqual([]);
      });

      fireEvent.mouseMove(overlayRoot.ownerDocument.body);
      await waitFor(() => {
        expect(getExpandedTableHandles(overlayRoot)).toEqual([]);
      });

      fireEvent.mouseEnter(columnButton);
      await waitFor(() => {
        expect(getExpandedTableHandles(overlayRoot)).toEqual([{ index: 0, kind: "column" }]);
        expect(getComputedStyle(columnShell).width).toBe("28px");
      });

      fireEvent.pointerDown(columnButton);
      await waitFor(() => {
        expect(
          overlayRoot.ownerDocument.querySelector(
            '[data-docsera-table-menu="true"][data-docsera-table-menu-kind="column"][data-docsera-table-menu-index="0"]'
          )
        ).toBeInstanceOf(HTMLElement);
        expect(
          overlayRoot.ownerDocument.querySelector(
            '[data-docsera-table-menu="true"][data-docsera-table-menu-kind="row"][data-docsera-table-menu-index="0"]'
          )
        ).toBeNull();
        expect(getExpandedTableHandles(overlayRoot)).toEqual([]);
      });
      expectTableHandleVisualState(overlayRoot, { index: 0, kind: "column", state: "active" });

      fireEvent.pointerDown(overlayRoot.ownerDocument.body);
      await waitFor(() => {
        expect(
          overlayRoot.ownerDocument.querySelector(
            '[data-docsera-table-menu="true"][data-docsera-table-menu-kind="column"][data-docsera-table-menu-index="0"]'
          )
        ).toBeNull();
        expect(getExpandedTableHandles(overlayRoot)).toEqual([]);
      });

      fireEvent.mouseEnter(columnButton);
      await waitFor(() => {
        expect(getExpandedTableHandles(overlayRoot)).toEqual([{ index: 0, kind: "column" }]);
      });

      await act(async () => {
        editor.commands.setTextSelection(getTableCellTextPosition(editor, 2, 2, 1));
      });

      await waitFor(() => {
        expect(getExpandedTableHandles(overlayRoot)).toEqual([]);
        expect(getTableHandleIndexes(overlayRoot, "row")).toEqual([1]);
        expect(getTableHandleIndexes(overlayRoot, "column")).toEqual([1]);
      });
      expectTableHandleVisualState(overlayRoot, { index: 1, kind: "row", state: "muted" });
      expectTableHandleVisualState(overlayRoot, { index: 1, kind: "column", state: "muted" });
    } finally {
      geometry.restore();
    }
  });

  it("keeps a shadow-root table menu item owned on pointerdown, runs its click once, and dismisses on outside pointerdown", async () => {
    const { editorReady, overlayRoot } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createTableDocument(2, 2))
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const shadowHost = document.createElement("div");
    document.body.append(shadowHost);
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });
    shadowRoot.append(overlayRoot);
    const ownerDocument = overlayRoot.ownerDocument;
    const captureEvents: Array<{ path: EventTarget[]; target: EventTarget | null }> = [];
    const captureListener = (event: Event) => {
      captureEvents.push({
        path: event.composedPath().filter((entry): entry is EventTarget => entry !== null && entry !== undefined),
        target: event.target
      });
    };

    const geometry = installTableGeometry({
      editor: editor.view.dom,
      left: 120,
      top: 140,
      rows: 2,
      columns: 2,
      cellWidth: 120,
      cellHeight: 56
    });

    try {
      await act(async () => {
        editor.commands.setTextSelection(getTableCellTextPosition(editor, 1, 1, 1));
      });

      await waitFor(() => {
        expect(getTableHandleButton(overlayRoot, "row", 0)).toBeInstanceOf(HTMLButtonElement);
      });

      const rowButton = getTableHandleButton(overlayRoot, "row", 0);
      if (!(rowButton instanceof HTMLButtonElement)) {
        throw new Error("Expected the first row pill to be available.");
      }

      await act(async () => {
        dispatchPointerEvent(rowButton, "pointerdown", {
          button: 0,
          buttons: 1,
          clientX: rowButton.getBoundingClientRect().left + 8,
          clientY: rowButton.getBoundingClientRect().top + 8,
          pointerId: 10,
          pointerType: "mouse"
        });
      });

      const rowMenuSelector = '[data-docsera-table-menu="true"][data-docsera-table-menu-kind="row"][data-docsera-table-menu-index="0"]';
      await waitFor(() => {
        expect(overlayRoot.querySelector(rowMenuSelector)).toBeInstanceOf(HTMLElement);
      });

      const rowMenu = overlayRoot.querySelector(rowMenuSelector);
      if (!(rowMenu instanceof HTMLElement)) {
        throw new Error("Expected the row menu to remain available.");
      }

      ownerDocument.addEventListener("pointerdown", captureListener, true);
      const insertAfterItem = within(rowMenu).getByRole("menuitem", { name: "Insert after" });
      expect(insertAfterItem.getRootNode()).toBe(shadowRoot);

      await act(async () => {
        dispatchPointerEvent(insertAfterItem, "pointerdown", {
          button: 0,
          buttons: 1,
          clientX: insertAfterItem.getBoundingClientRect().left + 8,
          clientY: insertAfterItem.getBoundingClientRect().top + 8,
          pointerId: 11,
          pointerType: "mouse"
        });
      });

      expect(captureEvents).toHaveLength(1);
      expect(captureEvents[0]?.target).toBe(shadowHost);
      expect(captureEvents[0]?.path[0]).toBe(insertAfterItem);
      expect(captureEvents[0]?.path).toEqual(expect.arrayContaining([insertAfterItem, rowMenu, shadowRoot, shadowHost, ownerDocument]));
      await waitFor(() => {
        expect(overlayRoot.querySelector(rowMenuSelector)).toBeInstanceOf(HTMLElement);
      });

      await act(async () => {
        fireEvent.click(insertAfterItem);
      });

      await waitFor(() => {
        expect(getTableRowCount(editor)).toBe(3);
        expect(overlayRoot.querySelector(rowMenuSelector)).toBeNull();
      });

      await act(async () => {
        dispatchPointerEvent(rowButton, "pointerdown", {
          button: 0,
          buttons: 1,
          clientX: rowButton.getBoundingClientRect().left + 8,
          clientY: rowButton.getBoundingClientRect().top + 8,
          pointerId: 12,
          pointerType: "mouse"
        });
      });

      await waitFor(() => {
        expect(overlayRoot.querySelector(rowMenuSelector)).toBeInstanceOf(HTMLElement);
      });

      await act(async () => {
        dispatchPointerEvent(document.body, "pointerdown", {
          button: 0,
          buttons: 1,
          clientX: 12,
          clientY: 12,
          pointerId: 13,
          pointerType: "mouse"
        });
      });

      await waitFor(() => {
        expect(overlayRoot.querySelector(rowMenuSelector)).toBeNull();
      });
    } finally {
      ownerDocument.removeEventListener("pointerdown", captureListener, true);
      geometry.restore();
      shadowHost.remove();
    }
  });

  it("keeps active pills usable after drag release so pill clicks select the full row or column and open the correct menu", async () => {
    const { editorReady, overlayRoot } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createTableDocument(4, 4))
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const proseMirror = editor.view.dom;
    const geometry = installTableGeometry({
      editor: proseMirror,
      left: 120,
      top: 140,
      rows: 4,
      columns: 4,
      cellWidth: 120,
      cellHeight: 56
    });

    try {
      await dragTableSelection(getTableCell(proseMirror, 3, 2), getTableCell(proseMirror, 2, 1), 21);

      await waitFor(() => {
        expect(editor.state.selection instanceof CellSelection).toBe(true);
        expect(getTableHandleIndexes(overlayRoot, "row")).toEqual([1, 2]);
        expect(getTableHandleIndexes(overlayRoot, "column")).toEqual([]);
        expect(getTableHandleButton(overlayRoot, "row", 1)).toBeVisible();
      });

      await act(async () => {
        fireEvent.pointerDown(getTableHandleButton(overlayRoot, "row", 1)!);
      });

      await waitFor(() => {
        expect(getCellSelectionRect(editor)).toEqual({
          bottom: 2,
          left: 0,
          right: 4,
          top: 1,
        });
        expect(
          overlayRoot.ownerDocument.querySelector('[data-docsera-table-menu-kind="row"][data-docsera-table-menu-index="1"]')
        ).toBeInstanceOf(HTMLElement);
      });

      expectTableHandleVisualState(overlayRoot, { index: 1, kind: "row", state: "active" });

      await dragTableSelection(getTableCell(proseMirror, 2, 2), getTableCell(proseMirror, 1, 3), 22);

      await waitFor(() => {
        expect(editor.state.selection instanceof CellSelection).toBe(true);
        expect(getTableHandleIndexes(overlayRoot, "row")).toEqual([]);
        expect(getTableHandleIndexes(overlayRoot, "column")).toEqual([1, 2]);
        expect(getTableHandleButton(overlayRoot, "column", 1)).toBeVisible();
      });

      await act(async () => {
        fireEvent.pointerDown(getTableHandleButton(overlayRoot, "column", 1)!);
      });

      await waitFor(() => {
        expect(getCellSelectionRect(editor)).toEqual({
          bottom: 4,
          left: 1,
          right: 2,
          top: 0,
        });
        expect(
          overlayRoot.ownerDocument.querySelector('[data-docsera-table-menu-kind="column"][data-docsera-table-menu-index="1"]')
        ).toBeInstanceOf(HTMLElement);
      });

      expectTableHandleVisualState(overlayRoot, { index: 1, kind: "column", state: "active" });
    } finally {
      geometry.restore();
    }
  });

  it("keeps the table controls usable when the table is horizontally scrolled", async () => {
    const { editorReady, overlayRoot } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createTableDocument(4, 6))
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const proseMirror = editor.view.dom;
    const wrapper = getTableWrapper(proseMirror);
    const geometry = installTableGeometry({
      editor: proseMirror,
      left: 120,
      top: 140,
      rows: 4,
      columns: 6,
      cellWidth: 96,
      cellHeight: 56,
      scrollLeft: 160,
      wrapperWidth: 288
    });

    try {
      await act(async () => {
        setTableCellSelection(editor, [1, 5], [2, 6]);
      });

      await waitFor(() => {
        expect(editor.state.selection instanceof CellSelection).toBe(true);
        expect(getTableHandleIndexes(overlayRoot, "row")).toEqual([]);
        expect(getTableHandleIndexes(overlayRoot, "column")).toEqual([4]);
        expect(getTableHandleButton(overlayRoot, "column", 4)).toBeVisible();
      });

      expect(wrapper.scrollLeft).toBe(160);
      expect(proseMirror.querySelectorAll(".docsera-table-selection-outline").length).toBeGreaterThan(0);
      const overlay = overlayRoot.querySelector("[data-docsera-table-overlay-root='true']");
      expect(overlay).toBeInstanceOf(HTMLElement);
      expectTableHandleVisualState(overlayRoot, { index: 4, kind: "column", state: "active" });
    } finally {
      geometry.restore();
      }
    });

  it.each([
    [treeNewPageButton, 41] as const,
    [headerNewPageButton, 42] as const
  ])("ends settled CellSelection ownership when New page opens inline create", async (getButton, pointerId) => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createTableDocument(4, 4))
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const proseMirror = editor.view.dom;
    const geometry = installTableGeometry({
      editor: proseMirror,
      left: 120,
      top: 140,
      rows: 4,
      columns: 4,
      cellWidth: 120,
      cellHeight: 56
    });
    renderTableNavigationHarness();
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    try {
      await dragTableSelection(getTableCell(proseMirror, 2, 2), getTableCell(proseMirror, 3, 3), 41);

      await waitFor(() => {
        expect(editor.state.selection instanceof CellSelection).toBe(true);
      });

      await clickWithPointer(getButton(), pointerId);

      const titleInput = await screen.findByRole("textbox", { name: "New page title" });
      await waitFor(() => {
        expect(titleInput).toHaveFocus();
        expect(document.activeElement).toBe(titleInput);
        expect(editor.state.selection instanceof CellSelection).toBe(false);
        expect(getCellSelectionRect(editor)).toBeNull();
      });

      expect(
        consoleWarnSpy.mock.calls.some((call) =>
          call.some((value) => String(value).includes("TextSelection endpoint not pointing into a node with inline content"))
        )
      ).toBe(false);

      fireEvent.change(titleInput, { target: { value: "Queued workspace page" } });
      expect(titleInput).toHaveValue("Queued workspace page");
      fireEvent.keyDown(titleInput, { key: "Enter" });

      const createdPageButton = await screen.findByRole("button", { name: "Queued workspace page" });
      await waitFor(() => {
        expect(createdPageButton).toHaveAttribute("aria-current", "page");
        expect(editor.state.selection instanceof CellSelection).toBe(false);
        expect(getCellSelectionRect(editor)).toBeNull();
      });

      const overviewButton = screen.getByRole("button", { name: "Overview" });
      await clickWithPointer(overviewButton, pointerId + 100);

      await waitFor(() => {
        expect(overviewButton).toHaveAttribute("aria-current", "page");
        expect(editor.state.selection instanceof CellSelection).toBe(false);
      });

      await dragTableSelection(getTableCell(proseMirror, 2, 2), getTableCell(proseMirror, 3, 3), pointerId + 200);

      await waitFor(() => {
        expect(editor.state.selection instanceof CellSelection).toBe(true);
      });
    } finally {
      consoleWarnSpy.mockRestore();
      geometry.restore();
    }
  });

  it("keeps the New page workflow focused and selectable when no structural table selection is active", async () => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createTableDocument(3, 3))
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    renderTableNavigationHarness();

    const newPageButton = treeNewPageButton();
    await clickWithPointer(newPageButton, 51);

    const titleInput = await screen.findByRole("textbox", { name: "New page title" });
    expect(titleInput).toHaveFocus();

    fireEvent.change(titleInput, { target: { value: "Standalone draft" } });
    fireEvent.keyDown(titleInput, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Standalone draft" })).toHaveAttribute("aria-current", "page");
    });
  });
});
