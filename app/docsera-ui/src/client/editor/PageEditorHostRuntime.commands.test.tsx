/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Editor, JSONContent } from "@tiptap/core";
import { CellSelection, findTable, moveTableColumn, moveTableRow, TableMap } from "@tiptap/pm/tables";
import { closeHistory, undoDepth } from "@tiptap/pm/history";
import { TextSelection } from "@tiptap/pm/state";
import type { DocseraTiptapDocument } from "../../shared/editor/document";
import { createEmptyDocseraDocumentEnvelope } from "../../shared/editor/document";
import { parseDocseraDocumentOrThrow } from "../../shared/editor/document";
import type { PageBodySaveResult } from "../shared/types/docsera";
import { describe, expect, it, vi } from "vitest";
import { getCommandQueryPresentationState, PageEditorHostRuntime } from "./PageEditorHostRuntime";
import type { EditorMediaAdapter, EditorMediaReference } from "./contracts";
import {
  applyToolbarBlockTypeCommand,
  formatToolbarShortcutLabel,
  isEventWithinEditor,
  resolveEditorLinkElementFromEvent,
  resolveCenteredSurfaceStyle,
  resolveToolbarMenuSurfaceStyle
} from "./CompactTextToolbar";
import { EDITOR_BLOCK_COMMANDS, getEditorBlockCommandQuickAddContent } from "./editorBlockCommands";
import {
  createEnvelopeFromDocument,
  createOverlayOwnerDocumentHarness,
  createClipboardData,
  createSuccessPage,
  openLinkSurface,
  openSlashQuery,
  openSlashQueryAtSelection,
  pasteIntoEditor,
  renderRuntime,
  runAutosave,
  selectText,
  setOverlayOwnerViewport,
  setParagraphText
} from "./PageEditorHostRuntime.testUtils";
import { createMediaBlob, openImageOptions } from "./PageEditorHostRuntime.image.testUtils";
import { STRUCTURED_TABLE_CLIPBOARD_PROVENANCE_MIME } from "./tableStructuredClipboard";

function getButtonNames(container: HTMLElement): string[] {
  return within(container)
    .getAllByRole("button")
    .map((button) => button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "");
}

function getMenuItemNames(
  container: HTMLElement,
  role: "menuitem" | "menuitemradio" | "menuitemcheckbox" = "menuitemradio"
): string[] {
  return within(container)
    .getAllByRole(role)
    .map((item) => item.getAttribute("aria-label") ?? item.textContent?.trim() ?? "");
}

function getOptionNames(container: HTMLElement): string[] {
  return within(container)
    .getAllByRole("option")
    .map((option) => option.getAttribute("aria-label") ?? option.textContent?.trim() ?? "");
}

class MockClipboardItem {
  data: Record<string, Blob>;

  types: string[];

  static supports(type: string): boolean {
    if (type === "text/plain" || type === "text/html" || type === "image/png") {
      return true;
    }

    if (!type.startsWith("web ")) {
      return false;
    }

    const customType = type.slice(4);
    return customType.includes("/") && !customType.includes(" ");
  }

  constructor(data: Record<string, Blob>) {
    this.data = data;
    this.types = Object.keys(data);

    for (const type of this.types) {
      if (!MockClipboardItem.supports(type)) {
        throw new TypeError(`Unsupported clipboard item type: ${type}`);
      }
    }
  }
}

if (typeof URL.createObjectURL !== "function") {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:mock")
  });
}

if (typeof URL.revokeObjectURL !== "function") {
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(() => undefined)
  });
}

function installStructuredClipboardWriteHarness() {
  const clipboardWrite = vi.fn(async (_items: MockClipboardItem[]) => undefined);
  const clipboardWriteText = vi.fn(async () => undefined);
  const previousClipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  const previousClipboardItem = (globalThis as { ClipboardItem?: unknown }).ClipboardItem;

  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      write: clipboardWrite,
      writeText: clipboardWriteText
    }
  });

  Object.defineProperty(globalThis, "ClipboardItem", {
    configurable: true,
    value: MockClipboardItem
  });

  return {
    clipboardWrite,
    clipboardWriteText,
    restore() {
      if (previousClipboardDescriptor) {
        Object.defineProperty(navigator, "clipboard", previousClipboardDescriptor);
      } else {
        Reflect.deleteProperty(navigator, "clipboard");
      }

      if (previousClipboardItem) {
        Object.defineProperty(globalThis, "ClipboardItem", {
          configurable: true,
          value: previousClipboardItem
        });
      } else {
        Reflect.deleteProperty(globalThis, "ClipboardItem");
      }
    }
  };
}

function installSelectorScrollModel(menu: HTMLElement) {
  const scrollElement = menu.querySelector(".docsera-block-selector__scroll");
  if (!(scrollElement instanceof HTMLElement)) {
    throw new Error("Expected the selector scroll container to be available.");
  }

  const options = within(menu).getAllByRole("option") as HTMLElement[];
  const viewportHeight = 112;
  const rowHeight = 56;
  const optionHeight = 40;
  let scrollTop = 0;
  const originalScrollTopDescriptor = Object.getOwnPropertyDescriptor(scrollElement, "scrollTop");
  Object.defineProperty(scrollElement, "scrollTop", {
    configurable: true,
    get: () => scrollTop,
    set: (next: number) => {
      scrollTop = next;
    }
  });

  const restoreSteps = [
    mockElementMetric(scrollElement, "clientHeight", viewportHeight),
    mockElementMetric(scrollElement, "clientWidth", 304),
    mockElementMetric(scrollElement, "offsetWidth", 304),
    mockElementMetric(scrollElement, "scrollHeight", rowHeight * options.length),
    ...options.map((option, index) => {
      const originalDescriptor = Object.getOwnPropertyDescriptor(option, "scrollIntoView");
      Object.defineProperty(option, "scrollIntoView", {
        configurable: true,
        value: vi.fn(() => {
          const top = index * rowHeight;
          const bottom = top + optionHeight;

          if (top < scrollTop) {
            scrollTop = top;
            return;
          }

          if (bottom > scrollTop + viewportHeight) {
            scrollTop = bottom - viewportHeight;
          }
        })
      });

      return () => {
        if (originalDescriptor) {
          Object.defineProperty(option, "scrollIntoView", originalDescriptor);
          return;
        }

        Reflect.deleteProperty(option, "scrollIntoView");
      };
    })
  ];

  return {
    getScrollTop() {
      return scrollTop;
    },
    options,
    scrollElement,
    setScrollTop(next: number) {
      scrollElement.scrollTop = next;
    },
    restore() {
      for (const restoreStep of restoreSteps.reverse()) {
        restoreStep();
      }

      if (originalScrollTopDescriptor) {
        Object.defineProperty(scrollElement, "scrollTop", originalScrollTopDescriptor);
        return;
      }

      Reflect.deleteProperty(scrollElement, "scrollTop");
    }
  };
}

function getCommandQueryParagraph(editor: Editor): HTMLElement | null {
  return editor.view.dom.querySelector("[data-docsera-command-query-owner]");
}

function getCommandQueryInline(editor: Editor): HTMLElement | null {
  return editor.view.dom.querySelector("[data-docsera-command-query]");
}

function getCommandQuerySlash(editor: Editor): HTMLElement | null {
  return editor.view.dom.querySelector("[data-docsera-command-query-slash]");
}

function getCommandQueryHelper(editor: Editor): HTMLElement | null {
  return editor.view.dom.querySelector("[data-docsera-command-query-helper]");
}

function getSelectedBlockElement(editor: Editor): HTMLElement | null {
  const selectedBlock = editor.view.dom.querySelector("[data-docsera-block-selected='true']");
  return selectedBlock instanceof HTMLElement ? selectedBlock : null;
}

function getBlockquoteParagraph(editor: Editor): HTMLParagraphElement | null {
  const paragraph = editor.view.dom.querySelector("blockquote > p");
  return paragraph instanceof HTMLParagraphElement ? paragraph : null;
}

function getRuntimeStyleText(): string {
  return Array.from(document.querySelectorAll("style"))
    .map((style) => style.textContent ?? "")
    .join("\n");
}

function readInlineBox(element: HTMLElement) {
  const left = Number.parseFloat(element.style.left || "0");
  const top = Number.parseFloat(element.style.top || "0");
  const width = Number.parseFloat(element.style.width || "0");
  const height = Number.parseFloat(element.style.height || "0");

  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width
  };
}

async function pasteIntoEditorAtCurrentSelection(editor: Editor, html: string, text = html) {
  await act(async () => {
    editor.commands.focus(undefined, { scrollIntoView: false });
    fireEvent.paste(editor.view.dom, {
      clipboardData: createClipboardData(html, text)
    } as never);
  });
}

async function typeTextThroughBrowserInput(editor: Editor, text: string) {
  const target = getBlockquoteParagraph(editor);
  if (!(target instanceof HTMLParagraphElement)) {
    throw new Error("Expected the blockquote paragraph to be available.");
  }

  for (const character of text) {
    await act(async () => {
      const beforeInputEvent =
        typeof InputEvent === "function"
          ? new InputEvent("beforeinput", {
              bubbles: true,
              cancelable: true,
              data: character,
              inputType: "insertText"
            })
          : new Event("beforeinput", { bubbles: true, cancelable: true });
      fireEvent(target, beforeInputEvent);
      target.textContent = `${target.textContent ?? ""}${character}`;
      const inputEvent =
        typeof InputEvent === "function"
          ? new InputEvent("input", {
              bubbles: true,
              data: character,
              inputType: "insertText"
            })
          : new Event("input", { bubbles: true });
      fireEvent(target, inputEvent);
    });
  }
}

async function clickQuoteForCaret(target: HTMLElement) {
  const ownerDocument = target.ownerDocument;
  const originalElementFromPoint = ownerDocument.elementFromPoint;
  Object.defineProperty(ownerDocument, "elementFromPoint", {
    configurable: true,
    value: () => target
  });

  try {
    await act(async () => {
      fireEvent.pointerDown(target, { button: 0, clientX: 18, clientY: 18 });
      fireEvent.mouseDown(target, { button: 0, clientX: 18, clientY: 18 });
      fireEvent.mouseUp(target, { button: 0, clientX: 18, clientY: 18 });
      fireEvent.click(target, { button: 0, clientX: 18, clientY: 18 });
    });
  } finally {
    Object.defineProperty(ownerDocument, "elementFromPoint", {
      configurable: true,
      value: originalElementFromPoint
    });
  }
}

function resolveTopLevelBlockIndexFromPosition(editor: Editor, position: number): number | null {
  let blockIndex: number | null = null;

  editor.state.doc.forEach((node, offset, index) => {
    if (offset === position) {
      blockIndex = index;
    }
  });

  return blockIndex;
}

function getIconPathData(container: HTMLElement): string {
  return container.querySelector("svg path")?.getAttribute("d") ?? "";
}

function getToolbarTooltip() {
  return screen.queryByRole("tooltip");
}

function getLinkInput(dialog: HTMLElement): HTMLInputElement {
  return within(dialog).getByRole("textbox", { name: "Link URL" }) as HTMLInputElement;
}

function mockElementRect(element: Element, rect: DOMRect) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(element, "getBoundingClientRect");
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => rect
  });

  return () => {
    if (originalDescriptor) {
      Object.defineProperty(element, "getBoundingClientRect", originalDescriptor);
      return;
    }

    Reflect.deleteProperty(element, "getBoundingClientRect");
  };
}

function mockElementMetric(
  element: Element,
  property: "clientHeight" | "clientWidth" | "offsetHeight" | "offsetWidth" | "scrollHeight" | "scrollWidth",
  value: number
) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(element, property);
  Object.defineProperty(element, property, {
    configurable: true,
    value
  });

  return () => {
    if (originalDescriptor) {
      Object.defineProperty(element, property, originalDescriptor);
      return;
    }

    Reflect.deleteProperty(element, property);
  };
}

const DEFAULT_TABLE_MAIN_PANE_RECT = new DOMRect(24, 32, 1180, 680);

function mockTopLevelBlockGeometry(editor: Editor, blockRects: DOMRect[]) {
  const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
  if (!(surface instanceof HTMLElement)) {
    throw new Error("Expected the editor surface to be available.");
  }

  const proseMirror = editor.view.dom;
  const proseMirrorChildren = Array.from(proseMirror.children);
  let surfaceRect = new DOMRect(72, 36, 760, 540);
  let proseMirrorRect = new DOMRect(132, 52, 620, 420);
  const restore = [
    mockElementRect(surface, surfaceRect),
    mockElementRect(proseMirror, proseMirrorRect),
    ...proseMirrorChildren.map((child, index) => mockElementRect(child, blockRects[index] ?? new DOMRect(0, 0, 1, 1)))
  ];

  return {
    setLayoutRects(nextRects: {
      hostRect?: DOMRect;
      mainPaneRect?: DOMRect;
      panelRect?: DOMRect;
      proseMirrorRect?: DOMRect;
      surfaceRect?: DOMRect;
    }) {
      surfaceRect = nextRects.surfaceRect ?? surfaceRect;
      proseMirrorRect = nextRects.proseMirrorRect ?? proseMirrorRect;
      mockElementRect(surface, surfaceRect);
      mockElementRect(proseMirror, proseMirrorRect);
    },
    mockRestore() {
      for (const reset of restore.reverse()) {
        reset();
      }
    }
  };
}

function expectCanonicalDocument(editor: Editor, expected: unknown) {
  const parsed = parseDocseraDocumentOrThrow(editor.getJSON());
  expect(parsed.document).toEqual(expected);
}

function createCanonicalDefaultTableNode() {
  return {
    type: "table",
    content: Array.from({ length: 3 }, () => ({
      type: "tableRow",
      content: Array.from({ length: 3 }, () => ({
        type: "tableCell",
        attrs: {
          colspan: 1,
          rowspan: 1,
          colwidth: null
        },
        content: [{ type: "paragraph" }]
      }))
    }))
  };
}

function createTextTableNode(rows: string[][]) {
  return {
    type: "table",
    content: rows.map((row) => ({
      type: "tableRow",
      content: row.map((text) => ({
        type: "tableCell",
        attrs: {
          colspan: 1,
          rowspan: 1,
          colwidth: null
        },
        content: text
          ? [
              {
                type: "paragraph",
                content: [{ type: "text", text }]
              }
            ]
          : [{ type: "paragraph" }]
      }))
    }))
  };
}

type TableTextCellSpec = {
  marks?: JSONContent["marks"];
  text: string;
};

function createStyledTextTableNode(rows: TableTextCellSpec[][]) {
  return {
    type: "table",
    content: rows.map((row) => ({
      type: "tableRow",
      content: row.map((cell) => ({
        type: "tableCell",
        attrs: {
          colspan: 1,
          rowspan: 1,
          colwidth: null
        },
        content: cell.text
          ? [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: cell.text,
                    ...(cell.marks ? { marks: cell.marks } : {})
                  }
                ]
              }
            ]
          : [{ type: "paragraph" }]
      }))
    }))
  };
}

type TableCellSpec = {
  cellType: "tableCell" | "tableHeader";
  colwidth: number[] | null;
  text: string;
};

function createMoveTableCell(spec: TableCellSpec): JSONContent {
  return {
    type: spec.cellType,
    attrs: {
      colspan: 1,
      colwidth: spec.colwidth,
      rowspan: 1
    },
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: spec.text }]
      }
    ]
  };
}

function createMoveTableNode(rows: TableCellSpec[][]): JSONContent {
  return {
    type: "table",
    content: rows.map((row) => ({
      type: "tableRow",
      content: row.map((cell) => createMoveTableCell(cell))
    }))
  };
}

function createMoveTableDocument(rows: TableCellSpec[][]): JSONContent {
  return {
    type: "doc",
    content: [createMoveTableNode(rows)]
  };
}

function createRichMoveTableRows(): TableCellSpec[][] {
  return [
    [
      { cellType: "tableHeader", colwidth: null, text: "H1" },
      { cellType: "tableCell", colwidth: null, text: "A1" },
      { cellType: "tableHeader", colwidth: null, text: "H3" }
    ],
    [
      { cellType: "tableCell", colwidth: null, text: "B1" },
      { cellType: "tableHeader", colwidth: null, text: "H2" },
      { cellType: "tableCell", colwidth: null, text: "B3" }
    ],
    [
      { cellType: "tableHeader", colwidth: null, text: "H4" },
      { cellType: "tableCell", colwidth: null, text: "C2" },
      { cellType: "tableHeader", colwidth: null, text: "H6" }
    ]
  ];
}

type PreviewMoveTableTransaction = {
  doc: {
    toJSON: () => JSONContent;
  };
  docChanged: boolean;
};

function previewMoveTableDocument(
  editor: Editor,
  command: (state: Editor["state"], dispatch?: (tr: PreviewMoveTableTransaction) => void) => boolean
): {
  commandResult: boolean;
  docChanged: boolean;
  document: JSONContent;
} {
  let previewDocument: JSONContent | null = null;
  let previewTransaction: PreviewMoveTableTransaction | null = null;
  const commandResult = command(editor.state, (nextTransaction) => {
    previewTransaction = nextTransaction;
    previewDocument = nextTransaction.doc.toJSON();
  });

  if (!commandResult || !previewTransaction || !previewDocument) {
    throw new Error("Expected the move command to produce a preview transaction.");
  }

  const resolvedTransaction = previewTransaction as PreviewMoveTableTransaction;
  return {
    commandResult,
    docChanged: resolvedTransaction.docChanged,
    document: previewDocument
  };
}

function createNestedTableDocument() {
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                attrs: {
                  colspan: 1,
                  rowspan: 1,
                  colwidth: null
                },
                content: [createCanonicalDefaultTableNode()]
              }
            ]
          }
        ]
      }
    ]
  };
}

function createTableContextDocument(cellType: "tableCell" | "tableHeader", cellContent: JSONContent[]): JSONContent {
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: cellType,
                attrs: {
                  colspan: 1,
                  rowspan: 1,
                  colwidth: null
                },
                content: cellContent
              }
            ]
          }
        ]
      }
    ]
  };
}

function createTableHeaderDocument() {
  return createTableContextDocument("tableHeader", [{ type: "paragraph" }]);
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

function getTableCellParagraphPositions(editor: Editor): number[] {
  const positions: number[] = [];

  editor.state.doc.descendants((node, pos) => {
    if (node.type.name !== "paragraph") {
      return true;
    }

    const $pos = editor.state.doc.resolve(pos);
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      const nodeName = $pos.node(depth).type.name;
      if (nodeName === "tableCell" || nodeName === "tableHeader") {
        positions.push(pos);
        break;
      }
    }

    return true;
  });

  return positions;
}

function getTableCellParagraphPositionAt(editor: Editor, rowIndex: number, columnIndex: number): number {
  let tablePos: number | null = null;
  let tableNode: any = null;

  editor.state.doc.descendants((node, pos) => {
    if (tablePos !== null || node.type.name !== "table") {
      return tablePos === null;
    }

    tablePos = pos;
    tableNode = node;
    return false;
  });

  if (tablePos === null || !tableNode) {
    throw new Error("Expected a table element.");
  }

  const map = TableMap.get(tableNode);
  const tableStart = tablePos + 1;
  const cellPos = tableStart + map.positionAt(rowIndex - 1, columnIndex - 1, tableNode);
  return cellPos;
}

function getTableCellTextPositionAt(editor: Editor, rowIndex: number, columnIndex: number): number {
  const table = getTableElement(editor);
  if (!table) {
    throw new Error("Expected a table element.");
  }

  const row = table.querySelectorAll("tr")[rowIndex - 1];
  if (!(row instanceof HTMLTableRowElement)) {
    throw new Error(`Expected table row ${rowIndex}.`);
  }

  const cell = row.querySelectorAll("th,td")[columnIndex - 1];
  if (!(cell instanceof HTMLTableCellElement)) {
    throw new Error(`Expected table cell ${rowIndex},${columnIndex}.`);
  }

  const firstText = cell.querySelector("p")?.firstChild;
  if (!(firstText instanceof Text)) {
    throw new Error(`Expected text in table cell ${rowIndex},${columnIndex}.`);
  }

  return editor.view.posAtDOM(firstText, 0);
}

function getTableCellElement(editor: Editor, rowIndex: number, columnIndex: number): HTMLTableCellElement {
  const table = getTableElement(editor);
  if (!table) {
    throw new Error("Expected a table element.");
  }

  const row = table.querySelectorAll("tr")[rowIndex - 1];
  if (!(row instanceof HTMLTableRowElement)) {
    throw new Error(`Expected table row ${rowIndex}.`);
  }

  const cell = row.querySelectorAll("th,td")[columnIndex - 1];
  if (!(cell instanceof HTMLTableCellElement)) {
    throw new Error(`Expected table cell ${rowIndex},${columnIndex}.`);
  }

  return cell;
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

function dispatchMouseEvent(
  target: EventTarget,
  type: "mousedown" | "mousemove" | "mouseup",
  input: {
    button?: number;
    buttons?: number;
    clientX: number;
    clientY: number;
  }
) {
  const event = new window.MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: input.button ?? 0,
    buttons: input.buttons ?? 0,
    clientX: input.clientX,
    clientY: input.clientY
  });

  Object.defineProperties(event, {
    button: { configurable: true, value: input.button ?? 0 },
    buttons: { configurable: true, value: input.buttons ?? 0 },
    clientX: { configurable: true, value: input.clientX },
    clientY: { configurable: true, value: input.clientY }
  });

  target.dispatchEvent(event);
}

async function dragTableSelection(
  startCell: HTMLTableCellElement,
  endCell: HTMLTableCellElement,
  pointerId: number,
  root: Document | ShadowRoot = startCell.ownerDocument
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
    dispatchMouseEvent(startCell, "mousedown", {
      button: 0,
      buttons: 1,
      clientX: startCell.getBoundingClientRect().left + 8,
      clientY: startCell.getBoundingClientRect().top + 8
    });
  });

  await act(async () => {
    dispatchMouseEvent(root, "mousemove", {
      buttons: 1,
      clientX: endCell.getBoundingClientRect().left + 8,
      clientY: endCell.getBoundingClientRect().top + 8
    });
    dispatchPointerEvent(root, "pointermove", {
      buttons: 1,
      clientX: endCell.getBoundingClientRect().left + 8,
      clientY: endCell.getBoundingClientRect().top + 8,
      pointerId,
      pointerType: "mouse"
    });
  });

  await act(async () => {
    dispatchMouseEvent(root, "mouseup", {
      button: 0,
      buttons: 0,
      clientX: endCell.getBoundingClientRect().left + 8,
      clientY: endCell.getBoundingClientRect().top + 8
    });
    dispatchPointerEvent(root, "pointerup", {
      button: 0,
      buttons: 0,
      clientX: endCell.getBoundingClientRect().left + 8,
      clientY: endCell.getBoundingClientRect().top + 8,
      pointerId,
      pointerType: "mouse"
    });
  });
}

function getTableCellParagraphPosition(editor: Editor, cellIndex: number): number {
  const positions = getTableCellParagraphPositions(editor);
  const position = positions[cellIndex];
  if (typeof position !== "number") {
    throw new Error(`Expected table cell paragraph at index ${cellIndex}.`);
  }

  return position;
}

function getFirstTextblockPositionInsideNode(editor: Editor, ancestorTypeName: string): number {
  let position: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (position !== null || !(node.isTextblock || node.type.name === ancestorTypeName)) {
      return position === null;
    }

    const $pos = editor.state.doc.resolve(pos);
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      if ($pos.node(depth).type.name === ancestorTypeName) {
        position = pos;
        return false;
      }
    }

    return true;
  });

  if (position === null) {
    throw new Error(`Expected a textblock inside ${ancestorTypeName}.`);
  }

  return position;
}

function getFirstTextblockPositionInsideNestedTable(editor: Editor): number {
  let position: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (position !== null || !node.isTextblock) {
      return position === null;
    }

    const $pos = editor.state.doc.resolve(pos);
    let tableDepth = 0;
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      if ($pos.node(depth).type.name === "table") {
        tableDepth += 1;
      }
    }

    if (tableDepth >= 2) {
      position = pos;
      return false;
    }

    return true;
  });

  if (position === null) {
    throw new Error("Expected a textblock inside a nested table cell.");
  }

  return position;
}

async function selectFirstTableCellText(editor: Editor, text: string) {
  const paragraphPosition = getFirstTableCellParagraphPosition(editor);
  await selectText(editor, paragraphPosition + 1, paragraphPosition + 1 + text.length);
}

function createMutableClipboardData() {
  const storedData = new Map<string, string>();
  const clipboardData = {
    types: [] as string[],
    clearData(type?: string) {
      if (typeof type === "string") {
        storedData.delete(type);
      } else {
        storedData.clear();
      }

      clipboardData.types = Array.from(storedData.keys());
    },
    getData(type: string) {
      return storedData.get(type) ?? "";
    },
    setData(type: string, value: string) {
      storedData.set(type, value);
      clipboardData.types = Array.from(storedData.keys());
    }
  };

  return clipboardData;
}

function getJsonContentChildren(node: JSONContent): JSONContent[] {
  return Array.isArray(node.content) ? node.content : [];
}

function getTableCellContent(editor: Editor, rowIndex: number, columnIndex: number): JSONContent[] {
  const table = editor.getJSON().content?.find((node) => node.type === "table");
  if (!table) {
    throw new Error("Expected a top-level table.");
  }

  const row = getJsonContentChildren(table).filter((node) => node.type === "tableRow")[rowIndex - 1];
  if (!row) {
    throw new Error(`Expected table row ${rowIndex}.`);
  }

  const cell = getJsonContentChildren(row).filter((node) => node.type === "tableCell" || node.type === "tableHeader")[
    columnIndex - 1
  ];
  if (!cell) {
    throw new Error(`Expected table cell ${rowIndex},${columnIndex}.`);
  }

  const paragraph = getJsonContentChildren(cell).find((node) => node.type === "paragraph");
  return paragraph ? getJsonContentChildren(paragraph) : [];
}

function getTableCellAttrs(editor: Editor, rowIndex: number, columnIndex: number): Record<string, unknown> {
  const table = editor.getJSON().content?.find((node) => node.type === "table");
  if (!table) {
    throw new Error("Expected a top-level table.");
  }

  const row = getJsonContentChildren(table).filter((node) => node.type === "tableRow")[rowIndex - 1];
  if (!row) {
    throw new Error(`Expected table row ${rowIndex}.`);
  }

  const cell = getJsonContentChildren(row).filter((node) => node.type === "tableCell" || node.type === "tableHeader")[
    columnIndex - 1
  ];
  if (!cell || typeof cell !== "object" || Array.isArray(cell)) {
    throw new Error(`Expected table cell ${rowIndex},${columnIndex}.`);
  }

  return typeof cell.attrs === "object" && cell.attrs && !Array.isArray(cell.attrs) ? (cell.attrs as Record<string, unknown>) : {};
}

function getTableColumnAlignments(editor: Editor, columnIndex: number): Array<string | null> {
  const table = editor.getJSON().content?.find((node) => node.type === "table");
  if (!table) {
    throw new Error("Expected a top-level table.");
  }

  return getJsonContentChildren(table)
    .filter((node) => node.type === "tableRow")
    .map((row, rowIndex) => {
      const attrs = getTableCellAttrs(editor, rowIndex + 1, columnIndex);
      return typeof attrs.align === "string" ? attrs.align : null;
    });
}

function createAlignedTableDocument(
  rows: Array<Array<{ align?: "left" | "center" | "right" | null; cellType?: "tableCell" | "tableHeader"; text: string }>>
): JSONContent {
  return {
    type: "table",
    content: rows.map((row) => ({
      type: "tableRow",
      content: row.map((cell) => {
        const attrs: Record<string, unknown> = {
          colspan: 1,
          colwidth: null,
          rowspan: 1
        };

        if (cell.align) {
          attrs.align = cell.align;
        }

        return {
          type: cell.cellType ?? "tableCell",
          attrs,
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: cell.text }]
            }
          ]
        };
      })
    }))
  };
}

function getFirstTableCellParagraphContent(editor: Editor): JSONContent[] {
  const table = editor.getJSON().content?.find((node) => node.type === "table");
  for (const row of table ? getJsonContentChildren(table) : []) {
    if (row.type !== "tableRow") {
      continue;
    }

    for (const cell of getJsonContentChildren(row)) {
      if (cell.type !== "tableCell" && cell.type !== "tableHeader") {
        continue;
      }

      const paragraph = getJsonContentChildren(cell).find((node) => node.type === "paragraph");
      if (paragraph) {
        return getJsonContentChildren(paragraph);
      }
    }
  }

  throw new Error("Expected paragraph content inside the first table cell.");
}

function documentContainsTopLevelTable(document: DocseraTiptapDocument): boolean {
  return document.content?.some((node) => {
    return typeof node === "object" && node !== null && "type" in node && node.type === "table";
  }) === true;
}

function getTableElement(editor: Editor): HTMLTableElement | null {
  const table = editor.view.dom.querySelector(".tableWrapper table");
  return table instanceof HTMLTableElement ? table : null;
}

function getTableWrapperElement(editor: Editor): HTMLElement | null {
  const wrapper = editor.view.dom.querySelector(".tableWrapper");
  return wrapper instanceof HTMLElement ? wrapper : null;
}

function getTableOverlayRoot(overlayRoot: HTMLElement): HTMLElement | null {
  const root = overlayRoot.querySelector("[data-docsera-table-overlay-root='true']");
  return root instanceof HTMLElement ? root : null;
}

function getTableRailButton(overlayRoot: HTMLElement, kind: "column" | "row"): HTMLButtonElement | null {
  const selector = `[data-docsera-table-add-rail-kind='${kind}']`;
  const ownerDocument = overlayRoot.ownerDocument as Document & {
    querySelector?: (selectors: string) => Element | null;
  };
  const documentQuery =
    (typeof ownerDocument.querySelector === "function" ? ownerDocument.querySelector(selector) : null) ??
    ownerDocument.body?.querySelector(selector) ??
    ownerDocument.documentElement?.querySelector(selector) ??
    null;
  return documentQuery instanceof HTMLButtonElement ? documentQuery : null;
}

function getTableRailIcon(overlayRoot: HTMLElement, kind: "column" | "row"): HTMLElement | null {
  const button = getTableRailButton(overlayRoot, kind);
  if (!(button instanceof HTMLButtonElement)) {
    return null;
  }

  const icon = button.querySelector("[data-docsera-table-rail-icon='true']");
  return icon instanceof HTMLElement ? icon : null;
}

function getTableResizeBadge(overlayRoot: HTMLElement): HTMLElement | null {
  const badge = overlayRoot.ownerDocument.querySelector("[data-docsera-table-resize-badge='true']");
  return badge instanceof HTMLElement ? badge : null;
}

function getTableHandleButton(
  overlayRoot: HTMLElement,
  kind: "column" | "row",
  index: number
): HTMLButtonElement | null {
  const selector = `[data-docsera-table-handle-kind='${kind}'][data-docsera-table-handle-index='${index}']`;
  const handle = overlayRoot.ownerDocument.querySelector(selector);
  return handle instanceof HTMLButtonElement ? handle : null;
}

function getTableHandleShell(
  overlayRoot: HTMLElement,
  kind: "column" | "row",
  index: number
): HTMLElement | null {
  const handle = getTableHandleButton(overlayRoot, kind, index);
  if (!handle) {
    return null;
  }

  const shell = handle.querySelector("[data-docsera-table-handle-pill='true']");
  return shell instanceof HTMLElement ? shell : null;
}

function getTableHandleEllipsisLayer(
  overlayRoot: HTMLElement,
  kind: "column" | "row",
  index: number
): HTMLElement | null {
  const handle = getTableHandleButton(overlayRoot, kind, index);
  if (!handle) {
    return null;
  }

  const ellipsisLayer = handle.querySelector("[data-docsera-table-handle-ellipsis='true']");
  return ellipsisLayer instanceof HTMLElement ? ellipsisLayer : null;
}

function getTableMenu(overlayRoot: HTMLElement, kind: "column" | "row"): HTMLElement | null {
  const selector = `[data-docsera-table-menu='true'][data-docsera-table-menu-kind='${kind}']`;
  const menu = overlayRoot.ownerDocument.querySelector(selector);
  return menu instanceof HTMLElement ? menu : null;
}

function getTableShape(editor: Editor): { columns: number; rows: number } {
  const table = editor.getJSON().content?.find((node) => node.type === "table");
  if (!table) {
    throw new Error("Expected a top-level table.");
  }

  const rows = getJsonContentChildren(table).filter((node) => node.type === "tableRow");
  const columns =
    rows.length > 0
      ? getJsonContentChildren(rows[0]!).filter((node) => node.type === "tableCell" || node.type === "tableHeader").length
      : 0;

  return {
    columns,
    rows: rows.length
  };
}

function getTableTextGrid(editor: Editor): string[][] {
  const table = editor.getJSON().content?.find((node) => node.type === "table");
  if (!table) {
    throw new Error("Expected a top-level table.");
  }

  return getJsonContentChildren(table)
    .filter((node) => node.type === "tableRow")
    .map((row) =>
      getJsonContentChildren(row)
        .filter((node) => node.type === "tableCell" || node.type === "tableHeader")
        .map((cell) => {
          const paragraph = getJsonContentChildren(cell).find((node) => node.type === "paragraph");
          if (!paragraph) {
            return "";
          }

          const text = getJsonContentChildren(paragraph)
            .filter((node) => node.type === "text" && typeof node.text === "string")
            .map((node) => node.text ?? "")
            .join("");
          return text;
        })
    );
}

function getNativeSelectionState() {
  const selection = window.getSelection();
  return selection
    ? {
        anchorNode: selection.anchorNode,
        anchorOffset: selection.anchorOffset,
        focusNode: selection.focusNode,
        focusOffset: selection.focusOffset,
        rangeCount: selection.rangeCount,
        text: selection.toString()
      }
    : null;
}

function getCellSelectionRect(editor: Editor): { bottom: number; left: number; right: number; top: number } | null {
  const selection = editor.state.selection;
  if (!(selection instanceof CellSelection)) {
    return null;
  }

  const table = findTable(selection.$anchorCell);
  if (!table) {
    return null;
  }

  return TableMap.get(table.node).rectBetween(
    selection.$anchorCell.pos - table.start,
    selection.$headCell.pos - table.start
  );
}

function getFirstStructuredTableContext(editor: Editor) {
  const selection = editor.state.selection;
  const table = findTable(selection.$from);
  if (!table) {
    throw new Error("Expected the selection to be inside a table.");
  }

  return {
    ...table,
    map: TableMap.get(table.node)
  };
}

function selectStructuredTableRow(editor: Editor, rowIndex: number) {
  const table = getFirstStructuredTableContext(editor);
  const boundedRowIndex = Math.max(0, Math.min(rowIndex, table.map.height - 1));
  const firstCellPos = table.start + table.map.positionAt(boundedRowIndex, 0, table.node);
  const lastCellPos = table.start + table.map.positionAt(boundedRowIndex, table.map.width - 1, table.node);
  const tr = editor.state.tr;

  tr.setSelection(CellSelection.rowSelection(tr.doc.resolve(firstCellPos), tr.doc.resolve(lastCellPos)));
  editor.view.dispatch(tr);
}

function selectStructuredTableColumn(editor: Editor, columnIndex: number) {
  const table = getFirstStructuredTableContext(editor);
  const boundedColumnIndex = Math.max(0, Math.min(columnIndex, table.map.width - 1));
  const firstCellPos = table.start + table.map.positionAt(0, boundedColumnIndex, table.node);
  const lastCellPos = table.start + table.map.positionAt(table.map.height - 1, boundedColumnIndex, table.node);
  const tr = editor.state.tr;

  tr.setSelection(CellSelection.colSelection(tr.doc.resolve(firstCellPos), tr.doc.resolve(lastCellPos)));
  editor.view.dispatch(tr);
}

function mockTableGeometry(
  editor: Editor,
  geometry: {
    editorSurfaceRect?: DOMRect;
    mainPaneRect?: DOMRect;
    cellRectLeftOffset?: number;
    rowRectTopOffset?: number;
    tableRect: DOMRect;
    wrapperClientHeight: number;
    wrapperClientWidth: number;
    wrapperOffsetHeight: number;
    wrapperOffsetWidth: number;
    wrapperRect: DOMRect;
    wrapperScrollLeft?: number;
    wrapperScrollWidth: number;
  }
) {
  const table = getTableElement(editor);
  const wrapper = getTableWrapperElement(editor);
  if (!(table instanceof HTMLTableElement) || !(wrapper instanceof HTMLElement)) {
    throw new Error("Expected the table wrapper and table element to be available.");
  }

  const editorPane =
    getEditorPaneElement(editor) ??
    (() => {
      throw new Error("Expected the editor pane to be available.");
    })();
  let editorSurfaceRect = geometry.editorSurfaceRect ?? geometry.mainPaneRect ?? DEFAULT_TABLE_MAIN_PANE_RECT;
  let tableRect = geometry.tableRect;
  let wrapperBaseRect = geometry.wrapperRect;
  let wrapperClientHeight = geometry.wrapperClientHeight;
  let wrapperClientWidth = geometry.wrapperClientWidth;
  let wrapperOffsetHeight = geometry.wrapperOffsetHeight;
  let wrapperOffsetWidth = geometry.wrapperOffsetWidth;
  let wrapperScrollLeft = geometry.wrapperScrollLeft ?? 0;
  let wrapperScrollWidth = geometry.wrapperScrollWidth;
  const restoreSteps: Array<() => void> = [];
  const cells = Array.from(table.querySelectorAll("td, th")) as HTMLTableCellElement[];

  const restoreRect = (element: Element, getRect: () => DOMRect) => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(element, "getBoundingClientRect");
    Object.defineProperty(element, "getBoundingClientRect", {
      configurable: true,
      value: () => getRect()
    });

    restoreSteps.push(() => {
      if (originalDescriptor) {
        Object.defineProperty(element, "getBoundingClientRect", originalDescriptor);
        return;
      }

      Reflect.deleteProperty(element, "getBoundingClientRect");
    });
  };

  const originalElementFromPoint = editor.view.dom.ownerDocument.elementFromPoint?.bind(editor.view.dom.ownerDocument) ?? null;
  Object.defineProperty(editor.view.dom.ownerDocument, "elementFromPoint", {
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
  restoreSteps.push(() => {
    Object.defineProperty(editor.view.dom.ownerDocument, "elementFromPoint", {
      configurable: true,
      value: originalElementFromPoint
    });
  });

  restoreRect(table, () => tableRect);
  restoreRect(editorPane, () => editorSurfaceRect);
  restoreRect(wrapper, () => wrapperBaseRect);

  const rowElements = Array.from(table.querySelectorAll("tr"));
  const rowHeight = rowElements.length > 0 ? tableRect.height / rowElements.length : tableRect.height;
  for (const [rowIndex, rowElement] of rowElements.entries()) {
    const rowTop = tableRect.top + rowIndex * rowHeight + (geometry.rowRectTopOffset ?? 0);
    restoreRect(
      rowElement,
      () =>
        new DOMRect(tableRect.left, rowTop, tableRect.width, rowHeight)
    );

    const cellElements = Array.from(rowElement.querySelectorAll(":scope > th, :scope > td"));
    const cellWidth = cellElements.length > 0 ? tableRect.width / cellElements.length : tableRect.width;
    for (const [columnIndex, cellElement] of cellElements.entries()) {
      const cellLeft = tableRect.left + columnIndex * cellWidth + (geometry.cellRectLeftOffset ?? 0);
      restoreRect(
        cellElement,
        () =>
          new DOMRect(cellLeft, rowTop, cellWidth, rowHeight)
      );
    }
  }

  const restoreMetric = (
    property: "clientHeight" | "clientWidth" | "offsetHeight" | "offsetWidth" | "scrollLeft" | "scrollWidth",
    getValue: () => number
  ) => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(wrapper, property);
    Object.defineProperty(wrapper, property, {
      configurable: true,
      get: () => getValue()
    });

    restoreSteps.push(() => {
      if (originalDescriptor) {
        Object.defineProperty(wrapper, property, originalDescriptor);
        return;
      }

      Reflect.deleteProperty(wrapper, property);
    });
  };

  restoreMetric("clientHeight", () => wrapperClientHeight);
  restoreMetric("clientWidth", () => wrapperClientWidth);
  restoreMetric("offsetHeight", () => wrapperOffsetHeight);
  restoreMetric("offsetWidth", () => wrapperOffsetWidth);
  restoreMetric("scrollWidth", () => wrapperScrollWidth);

  const originalScrollLeftDescriptor = Object.getOwnPropertyDescriptor(wrapper, "scrollLeft");
  Object.defineProperty(wrapper, "scrollLeft", {
    configurable: true,
    get: () => wrapperScrollLeft,
    set: (next: number) => {
      wrapperScrollLeft = Number(next);
    }
  });
  restoreSteps.push(() => {
    if (originalScrollLeftDescriptor) {
      Object.defineProperty(wrapper, "scrollLeft", originalScrollLeftDescriptor);
      return;
    }

    Reflect.deleteProperty(wrapper, "scrollLeft");
  });

  return {
    restore() {
      for (const restore of restoreSteps.reverse()) {
        restore();
      }
    },
    setLayoutRects(nextGeometry: Partial<typeof geometry>) {
      tableRect = nextGeometry.tableRect ?? tableRect;
      wrapperBaseRect = nextGeometry.wrapperRect ?? wrapperBaseRect;
      editorSurfaceRect = nextGeometry.editorSurfaceRect ?? nextGeometry.mainPaneRect ?? editorSurfaceRect;
      wrapperClientHeight = nextGeometry.wrapperClientHeight ?? wrapperClientHeight;
      wrapperClientWidth = nextGeometry.wrapperClientWidth ?? wrapperClientWidth;
      wrapperOffsetHeight = nextGeometry.wrapperOffsetHeight ?? wrapperOffsetHeight;
      wrapperOffsetWidth = nextGeometry.wrapperOffsetWidth ?? wrapperOffsetWidth;
      wrapperScrollLeft = nextGeometry.wrapperScrollLeft ?? wrapperScrollLeft;
      wrapperScrollWidth = nextGeometry.wrapperScrollWidth ?? wrapperScrollWidth;
    }
  };
}

function getEditorPaneElement(editor: Editor) {
  const editorSurface = editor.view.dom;
  const surfaceElement = editorSurface.closest(".docsera-editor-runtime__surface");
  return surfaceElement instanceof HTMLElement ? surfaceElement : null;
}

function getTopLevelNodeType(document: DocseraTiptapDocument, index: number): string | null {
  const node = document.content?.[index];
  return typeof node === "object" && node !== null && "type" in node && typeof node.type === "string"
    ? node.type
    : null;
}

async function openQuickAdd(editor: Editor, pointer: { clientX: number; clientY: number }, buttonName: string) {
  const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
  if (!(surface instanceof HTMLElement)) {
    throw new Error("Expected the editor surface to be available.");
  }

  await dispatchOwnerPointerMove(surface.ownerDocument, surface, pointer);
  fireEvent.click(await screen.findByRole("button", { name: buttonName }));
}

async function dispatchOwnerPointerEvent(
  ownerDocument: Document,
  target: EventTarget,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel" | "lostpointercapture",
  point: { clientX: number; clientY: number },
  options: {
    button?: number;
    buttons?: number;
    composedPath?: Array<EventTarget | null | undefined>;
    pointerId?: number;
    pointerType?: string;
  } = {}
): Promise<boolean> {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: {
      configurable: true,
      value: point.clientX
    },
    clientY: {
      configurable: true,
      value: point.clientY
    },
    button: {
      configurable: true,
      value: options.button ?? 0
    },
    buttons: {
      configurable: true,
      value: options.buttons ?? (type === "pointerdown" ? 1 : 0)
    },
    pointerId: {
      configurable: true,
      value: options.pointerId ?? 1
    },
    pointerType: {
      configurable: true,
      value: options.pointerType ?? "mouse"
    },
    target: {
      configurable: true,
      value: target
    },
    composedPath: {
      configurable: true,
      value: () => options.composedPath?.filter(Boolean) ?? [target]
    }
  });
  await act(async () => {
    const dispatchTarget =
      target instanceof Node && target.isConnected && target.ownerDocument === ownerDocument ? target : ownerDocument;
    dispatchTarget.dispatchEvent(event);
  });
  return event.defaultPrevented;
}

async function dispatchOwnerPointerMove(
  ownerDocument: Document,
  target: EventTarget,
  point: { clientX: number; clientY: number },
  options: { composedPath?: Array<EventTarget | null | undefined>; pointerId?: number; pointerType?: string } = {}
) {
  await dispatchOwnerPointerEvent(ownerDocument, target, "pointermove", point, options);
}

async function activateCommandOptionWithBrowserPointer(
  editor: Editor,
  option: HTMLElement,
  point: { clientX: number; clientY: number } = { clientX: 180, clientY: 120 },
  options: { beforeClick?: () => void } = {}
) {
  const pointerDefaultPrevented = await dispatchOwnerPointerEvent(
    option.ownerDocument,
    option,
    "pointerdown",
    point,
    { button: 0, buttons: 1 }
  );

  expect(pointerDefaultPrevented).toBe(true);

  if (!pointerDefaultPrevented) {
    await act(async () => {
      editor.view.dom.blur();
      option.focus();
    });
  }

  if (options.beforeClick) {
    await act(async () => {
      options.beforeClick?.();
    });
  }

  await act(async () => {
    fireEvent.mouseDown(option, { button: 0, buttons: 1, ...point });
    fireEvent.mouseUp(option, { button: 0, buttons: 0, ...point });
    fireEvent.click(option, { button: 0, buttons: 0, ...point });
  });
}

async function activateTableMenuItemWithBrowserPointer(
  menuItem: HTMLElement,
  point: { clientX: number; clientY: number } = { clientX: 180, clientY: 120 }
) {
  const pointerDefaultPrevented = await dispatchOwnerPointerEvent(
    menuItem.ownerDocument,
    menuItem,
    "pointerdown",
    point,
    { button: 0, buttons: 1 }
  );

  expect(pointerDefaultPrevented).toBe(true);
}

function createCanonicalOrderedListNode(content: Array<Record<string, unknown>>) {
  return {
    type: "orderedList",
    attrs: {
      start: 1,
      type: null
    },
    content
  };
}

function captureCommandTransactions(editor: Editor, runCommand: () => void) {
  const originalDispatch = editor.view.dispatch.bind(editor.view);
  const transactions: Array<{
    addToHistory: unknown;
    docChanged: boolean;
    selectionSet: boolean;
    steps: number;
  }> = [];

  editor.view.dispatch = (transaction) => {
    transactions.push({
      addToHistory: transaction.getMeta("addToHistory"),
      docChanged: transaction.docChanged,
      selectionSet: transaction.selectionSet,
      steps: transaction.steps.length
    });
    originalDispatch(transaction);
  };

  try {
    runCommand();
  } finally {
    editor.view.dispatch = originalDispatch;
  }

  return transactions;
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return {
    promise,
    reject,
    resolve
  };
}

async function selectFirstTextNode(editor: Editor) {
  let range: { from: number; to: number } | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (!range && node.isText) {
      range = {
        from: pos,
        to: pos + node.nodeSize
      };
      return false;
    }

    return true;
  });

  if (!range) {
    throw new Error("Expected the document to contain at least one text node.");
  }

  const selectionRange = range;
  await act(async () => {
    editor.commands.setTextSelection(selectionRange);
  });
}

describe("PageEditorHostRuntime", () => {
  it("keeps the same editor instance across a rerender for the same page", async () => {
    const { editorReady, rerender, onOutlineChange, onSaveDraft, onStatusChange, overlayRoot, onAccessLost } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const initialEditor = editorReady[0];
    rerender(
      <PageEditorHostRuntime
        canEdit={true}
        initialEnvelope={createEmptyDocseraDocumentEnvelope()}
        initialRevision={0}
        onAccessLost={onAccessLost}
        onOutlineChange={onOutlineChange}
        onSaveDraft={onSaveDraft}
        onEditorReady={(editor) => {
          editorReady[0] = editor;
        }}
        onStatusChange={onStatusChange}
        overlayRoot={overlayRoot}
        pageSysId="page-001"
        theme="light"
      />
    );

    expect(editorReady[0]).toBe(initialEditor);
  });

  it("opens slash only for eligible queries, filters results, and dismisses on Escape", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor, "he");

    const slashMenu = await screen.findByRole("listbox", { name: "Slash command menu" });
    expect(within(slashMenu).getByRole("option", { name: /Heading 1/ })).toBeInTheDocument();
    expect(within(slashMenu).getByRole("option", { name: /Heading 2/ })).toBeInTheDocument();
    expect(within(slashMenu).getByRole("option", { name: /Heading 3/ })).toBeInTheDocument();

    fireEvent.keyDown(editor.view.dom, { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();

    expect(editor.getJSON()).toEqual({ type: "doc", content: [{ type: "paragraph" }] });

    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "foo/bar" }]
          }
        ]
      });
    });
    expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();
  });

  it("does not reveal Quick Add when an ordinary slash selector closes without pointer ownership", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor);
    expect(await screen.findByRole("listbox", { name: "Slash command menu" })).toBeInTheDocument();

    fireEvent.keyDown(editor.view.dom, { key: "Escape" });

    expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Add block after/i })).toBeNull();
  });


  it("renders the transient shared search state without mutating the document or undo history", async () => {
    const { editorReady, onSaveDraft, onStatusChange } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const before = editor.getJSON();
    const beforeUndoDepth = undoDepth(editor.state);

    await openSlashQuery(editor);

    const slashMenu = await screen.findByRole("listbox", { name: "Slash command menu" });
    expect(within(slashMenu).queryByText("/")).toBeNull();
    expect(within(slashMenu).queryByLabelText("Type to search")).toBeNull();
    await waitFor(() => {
      expect(getCommandQueryParagraph(editor)).toBeInTheDocument();
      expect(getCommandQuerySlash(editor)).toHaveTextContent("/");
      expect(getCommandQueryHelper(editor)).toHaveTextContent("Type to search");
      expect(getCommandQueryInline(editor)).toBeNull();
    });
    const initialPresentation = getCommandQueryPresentationState(editor);
    expect(initialPresentation).toMatchObject({
      query: "",
      source: "slash"
    });
    expect(resolveTopLevelBlockIndexFromPosition(editor, initialPresentation?.ownerPos ?? -1)).toBe(0);

    fireEvent.keyDown(editor.view.dom, { key: "h" });
    fireEvent.keyDown(editor.view.dom, { key: "e" });
    expect(within(slashMenu).queryByLabelText("Search query he")).toBeNull();
    await waitFor(() => {
      expect(getCommandQueryInline(editor)).toHaveTextContent("/he");
      expect(getCommandQuerySlash(editor)).toBeNull();
      expect(getCommandQueryHelper(editor)).toBeNull();
    });
    const typedPresentation = getCommandQueryPresentationState(editor);
    expect(typedPresentation).toMatchObject({
      query: "he",
      source: "slash"
    });
    expect(typedPresentation?.ownerPos).toBe(initialPresentation?.ownerPos);

    fireEvent.keyDown(editor.view.dom, { key: "Backspace" });
    await waitFor(() => {
      expect(getCommandQueryInline(editor)).toHaveTextContent("/h");
      expect(getCommandQuerySlash(editor)).toBeNull();
      expect(getCommandQueryHelper(editor)).toBeNull();
    });

    expect(editor.getJSON()).toEqual(before);
    expect(undoDepth(editor.state)).toBe(beforeUndoDepth);

    await runAutosave();
    expect(onSaveDraft).toHaveBeenCalledTimes(0);
    expect(onStatusChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isDirty: false,
        status: "Saved"
      })
    );

    fireEvent.keyDown(editor.view.dom, { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();
    expect(getCommandQueryParagraph(editor)).toBeNull();
    expect(getCommandQueryPresentationState(editor)).toBeNull();
    expect(editor.getJSON()).toEqual(before);
    expect(undoDepth(editor.state)).toBe(beforeUndoDepth);
  });

  it("renders nested slash query presentation in owned textblocks and suppresses Table from nested table-cell search", async () => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createNestedTableDocument() as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const nestedTableParagraphPosition = getFirstTextblockPositionInsideNestedTable(editor);

    await act(async () => {
      editor.commands.setTextSelection(nestedTableParagraphPosition + 1);
      editor.commands.focus(undefined, { scrollIntoView: false });
    });

    const before = editor.getJSON();

    await openSlashQueryAtSelection(editor);
    await waitFor(() => {
      expect(getCommandQueryParagraph(editor)).toBeInTheDocument();
      expect(getCommandQuerySlash(editor)).toHaveTextContent("/");
      expect(getCommandQueryHelper(editor)).toHaveTextContent("Type to search");
      expect(getCommandQueryInline(editor)).toBeNull();
    });
    expect(editor.getJSON()).toEqual(before);

    for (const character of "tab") {
      fireEvent.keyDown(editor.view.dom, { key: character });
    }

    await waitFor(() => {
      const slashMenu = screen.getByRole("listbox", { name: "Slash command menu" });
      expect(getCommandQueryInline(editor)).toHaveTextContent("/tab");
      expect(getCommandQuerySlash(editor)).toBeNull();
      expect(getCommandQueryHelper(editor)).toBeNull();
      expect(within(slashMenu).queryByRole("option", { name: /Table/ })).toBeNull();
    });

    fireEvent.keyDown(editor.view.dom, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();
      expect(getCommandQueryPresentationState(editor)).toBeNull();
      expect(getCommandQueryParagraph(editor)).toBeNull();
    });
    expect(editor.getJSON()).toEqual(before);
  });

  it("supports arrow navigation, Enter execution, and pointer execution for slash commands", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor, "he");

    fireEvent.keyDown(editor.view.dom, { key: "ArrowDown" });
    fireEvent.keyDown(editor.view.dom, { key: "ArrowDown" });
    fireEvent.keyDown(editor.view.dom, { key: "Enter" });

    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();
      expect(editor.getJSON()).toEqual({
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 3 }
          }
        ]
      });
    });
    expect(getCommandQueryPresentationState(editor)).toBeNull();
    expect(document.activeElement).toBe(editor.view.dom);

    await setParagraphText(editor, "");
    await openSlashQuery(editor);
    fireEvent.keyDown(editor.view.dom, { key: "ArrowDown" });
    fireEvent.keyDown(editor.view.dom, { key: "ArrowDown" });
    fireEvent.keyDown(editor.view.dom, { key: "ArrowDown" });
    fireEvent.keyDown(editor.view.dom, { key: "ArrowDown" });
    fireEvent.keyDown(editor.view.dom, { key: "Enter" });

    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();
      expect(editor.getJSON().content?.[0]).toMatchObject({
        type: "blockquote",
        content: [{ type: "paragraph" }]
      });
    });
    expect(getCommandQueryPresentationState(editor)).toBeNull();
    expect(document.activeElement).toBe(editor.view.dom);
    expect(editor.isActive("blockquote")).toBe(true);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");

    await typeTextThroughBrowserInput(editor, "Quoted text");

    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "blockquote",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Quoted text" }]
        }
      ]
    });
  });

  it.each([
    {
      label: "Slash",
      menuLabel: "Slash command menu",
      openMenu: async (editor: Editor) => {
        await openSlashQuery(editor);
      },
      expectedAfterEnter: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 3 }
          }
        ]
      }
    },
    {
      label: "Quick Add",
      menuLabel: "Insert block after Text",
      openMenu: async (editor: Editor) => {
        await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
      },
      expectedAfterEnter: {
        type: "doc",
        content: [
          {
            type: "paragraph"
          },
          {
            type: "heading",
            attrs: { level: 3 }
          }
        ]
      }
    }
  ])("keeps the active %s selector option visible while arrowing and still executes Enter", async ({ menuLabel, openMenu, expectedAfterEnter }) => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);

    await openMenu(editor);
    const menu = await screen.findByRole("listbox", { name: menuLabel });
    const scrollModel = installSelectorScrollModel(menu);
    const options = within(menu).getAllByRole("option");

    expect(scrollModel.getScrollTop()).toBe(0);
    expect(options[0]).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(editor.view.dom, { key: "ArrowDown" });
    fireEvent.keyDown(editor.view.dom, { key: "ArrowDown" });
    fireEvent.keyDown(editor.view.dom, { key: "ArrowDown" });
    fireEvent.keyDown(editor.view.dom, { key: "ArrowDown" });

    await waitFor(() => {
      expect(options[4]).toHaveAttribute("aria-selected", "true");
      expect(scrollModel.getScrollTop()).toBeGreaterThan(0);
    });

    scrollModel.setScrollTop(260);
    fireEvent.keyDown(editor.view.dom, { key: "ArrowUp" });

    await waitFor(() => {
      expect(options[3]).toHaveAttribute("aria-selected", "true");
      expect(scrollModel.getScrollTop()).toBe(168);
    });

    const beforeEnter = editor.getJSON();
    fireEvent.keyDown(editor.view.dom, { key: "Enter" });

    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: menuLabel })).toBeNull();
      expect(editor.getJSON()).toEqual(expectedAfterEnter);
    });
    expect(editor.getJSON()).not.toEqual(beforeEnter);

    scrollModel.restore();
    geometrySpy.mockRestore();
  });

  it.each([
    {
      label: "Slash",
      menuLabel: "Slash command menu",
      openMenu: async (editor: Editor) => {
        await openSlashQuery(editor);
      }
    },
    {
      label: "Quick Add",
      menuLabel: "Insert block after Text",
      openMenu: async (editor: Editor) => {
        await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
      }
    }
  ])("keeps the shared %s selector wrapped item visible when moving from last to first and first to last", async ({ menuLabel, openMenu }) => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);

    await openMenu(editor);
    const menu = await screen.findByRole("listbox", { name: menuLabel });
    const scrollModel = installSelectorScrollModel(menu);
    const options = within(menu).getAllByRole("option");

    for (let index = 0; index < options.length - 1; index += 1) {
      fireEvent.keyDown(editor.view.dom, { key: "ArrowDown" });
    }

    await waitFor(() => {
      expect(options[options.length - 1]).toHaveAttribute("aria-selected", "true");
      expect(scrollModel.getScrollTop()).toBeGreaterThan(0);
    });

    fireEvent.keyDown(editor.view.dom, { key: "ArrowDown" });
    await waitFor(() => {
      expect(options[0]).toHaveAttribute("aria-selected", "true");
      expect(scrollModel.getScrollTop()).toBe(0);
    });

    fireEvent.keyDown(editor.view.dom, { key: "ArrowUp" });
    await waitFor(() => {
      expect(options[options.length - 1]).toHaveAttribute("aria-selected", "true");
      expect(scrollModel.getScrollTop()).toBeGreaterThan(0);
    });

    fireEvent.keyDown(editor.view.dom, { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: menuLabel })).toBeNull();

    scrollModel.restore();
    geometrySpy.mockRestore();
  });

  it.each(["light", "dark"] as const)("uses the floated empty-blockquote placeholder contract in %s mode", async (theme) => {
    const slashRuntime = renderRuntime({ theme });

    await waitFor(() => {
      expect(slashRuntime.editorReady[0]).toBeDefined();
    });

    const slashEditor = slashRuntime.editorReady[0];
    await openSlashQuery(slashEditor);
    fireEvent.click(await screen.findByRole("option", { name: /Blockquote/ }));

    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();
      expect(slashEditor.getJSON().content?.[0]).toMatchObject({
        type: "blockquote",
        content: [{ type: "paragraph" }]
      });
    });

    const runtimeStyleText = getRuntimeStyleText();
    expect(runtimeStyleText).toContain(".docsera-editor-runtime__surface .ProseMirror blockquote > p[data-placeholder]::before");
    expect(runtimeStyleText).toContain("float: left;");
    expect(runtimeStyleText).toContain("height: 0;");

    const insertedQuote = getBlockquoteParagraph(slashEditor);
    expect(insertedQuote).toHaveAttribute("data-placeholder", "Enter a quote");

    await typeTextThroughBrowserInput(slashEditor, `Quoted text ${theme}`);

    expect(insertedQuote).not.toHaveAttribute("data-placeholder");
    expect(slashEditor.getJSON().content?.[0]).toMatchObject({
      type: "blockquote",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: `Quoted text ${theme}` }]
        }
      ]
    });

    await act(async () => {
      slashEditor.commands.undo();
    });

    await openSlashQuery(slashEditor);
    fireEvent.click(await screen.findByRole("option", { name: /Blockquote/ }));

    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();
    });

    await act(async () => {
      slashEditor.view.dom.blur();
    });

    const reentryQuote = getBlockquoteParagraph(slashEditor);
    if (!(reentryQuote instanceof HTMLParagraphElement)) {
      throw new Error("Expected the empty blockquote paragraph to be available.");
    }

    await clickQuoteForCaret(reentryQuote);

    expect(document.activeElement).toBe(slashEditor.view.dom);
    expect(slashEditor.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(reentryQuote).toHaveAttribute("data-placeholder", "Enter a quote");

    await typeTextThroughBrowserInput(slashEditor, `Clicked quote ${theme}`);
    expect(reentryQuote).not.toHaveAttribute("data-placeholder");

    slashRuntime.unmount();

    const quickInitial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        }
      ]
    };
    const quickRuntime = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(quickInitial as DocseraTiptapDocument),
      theme
    });

    await waitFor(() => {
      expect(quickRuntime.editorReady[0]).toBeDefined();
    });

    const quickEditor = quickRuntime.editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(quickEditor, [new DOMRect(132, 52, 620, 28)]);

    await openQuickAdd(quickEditor, { clientX: 120, clientY: 64 }, "Add block after Text");
    fireEvent.click(await screen.findByRole("option", { name: "Blockquote" }));

    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: /Insert block after/i })).toBeNull();
      expect(quickEditor.getJSON()).toEqual({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Alpha" }]
          },
          {
            type: "blockquote",
            content: [{ type: "paragraph" }]
          }
        ]
      });
    });

    const insertedQuickQuote = getBlockquoteParagraph(quickEditor);
    expect(insertedQuickQuote).toHaveAttribute("data-placeholder", "Enter a quote");

    await typeTextThroughBrowserInput(quickEditor, `Quick quote ${theme}`);
    expect(insertedQuickQuote).not.toHaveAttribute("data-placeholder");

    await act(async () => {
      quickEditor.commands.undo();
    });

    await openQuickAdd(quickEditor, { clientX: 120, clientY: 64 }, "Add block after Text");
    fireEvent.click(await screen.findByRole("option", { name: "Blockquote" }));
    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: /Insert block after/i })).toBeNull();
    });

    await act(async () => {
      quickEditor.view.dom.blur();
    });

    const quickReentryQuote = getBlockquoteParagraph(quickEditor);
    if (!(quickReentryQuote instanceof HTMLParagraphElement)) {
      throw new Error("Expected the empty Quick Add blockquote paragraph to be available.");
    }

    await clickQuoteForCaret(quickReentryQuote.closest("blockquote") instanceof HTMLElement ? (quickReentryQuote.closest("blockquote") as HTMLElement) : quickReentryQuote);

    expect(document.activeElement).toBe(quickEditor.view.dom);
    expect(quickEditor.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(quickReentryQuote).toHaveAttribute("data-placeholder", "Enter a quote");

    await typeTextThroughBrowserInput(quickEditor, `Reclicked quick quote ${theme}`);
    expect(quickReentryQuote).not.toHaveAttribute("data-placeholder");

    geometrySpy.mockRestore();
    quickRuntime.unmount();
  });

  it("closes the slash selector, restores a live caret inside a pointer-selected blockquote, and supports blur-click re-entry", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor);

    fireEvent.click(await screen.findByRole("option", { name: /Blockquote/ }));

    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();
      expect(editor.getJSON().content?.[0]).toMatchObject({
        type: "blockquote",
        content: [{ type: "paragraph" }]
      });
    });

    const insertedQuote = getBlockquoteParagraph(editor);
    expect(getCommandQueryPresentationState(editor)).toBeNull();
    expect(document.activeElement).toBe(editor.view.dom);
    expect(editor.isActive("blockquote")).toBe(true);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(insertedQuote).toHaveAttribute("data-placeholder", "Enter a quote");

    await typeTextThroughBrowserInput(editor, "Pointer quote");

    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "blockquote",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Pointer quote" }]
        }
      ]
    });

    await act(async () => {
      editor.commands.undo();
    });

    expect(editor.getJSON()).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }]
    });

    await openSlashQuery(editor);
    fireEvent.click(await screen.findByRole("option", { name: /Blockquote/ }));
    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();
    });

    await act(async () => {
      editor.view.dom.blur();
    });
    expect(document.activeElement).not.toBe(editor.view.dom);
    const emptyQuote = getBlockquoteParagraph(editor);
    if (!(emptyQuote instanceof HTMLParagraphElement)) {
      throw new Error("Expected the empty blockquote paragraph to be available.");
    }

    await clickQuoteForCaret(emptyQuote);

    expect(document.activeElement).toBe(editor.view.dom);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(editor.state.selection.from).toBe(editor.state.selection.to);
    expect(emptyQuote).toHaveAttribute("data-placeholder", "Enter a quote");

    await typeTextThroughBrowserInput(editor, "Clicked quote");

    expect(editor.getJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Clicked quote" }]
            }
          ]
        }
      ]
    });
  });

  it("closes Quick Add, restores a live caret inside the inserted blockquote, and keeps the quote pointer-editable", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        }
      ]
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);

    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    fireEvent.click(await screen.findByRole("option", { name: "Blockquote" }));

    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: /Insert block after/i })).toBeNull();
      expect(editor.getJSON()).toEqual({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Alpha" }]
          },
          {
            type: "blockquote",
            content: [{ type: "paragraph" }]
          }
        ]
      });
    });

    const insertedQuote = getBlockquoteParagraph(editor);
    expect(document.activeElement).toBe(editor.view.dom);
    expect(editor.isActive("blockquote")).toBe(true);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(insertedQuote).toHaveAttribute("data-placeholder", "Enter a quote");

    await typeTextThroughBrowserInput(editor, "Quick quote");

    expect(editor.getJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        },
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Quick quote" }]
            }
          ]
        }
      ]
    });

    await act(async () => {
      editor.commands.undo();
    });

    expect(editor.getJSON()).toEqual(initial);

    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    fireEvent.click(await screen.findByRole("option", { name: "Blockquote" }));
    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: /Insert block after/i })).toBeNull();
    });

    await act(async () => {
      editor.view.dom.blur();
    });
    const emptyQuote = getBlockquoteParagraph(editor);
    if (!(emptyQuote instanceof HTMLParagraphElement)) {
      throw new Error("Expected the empty Quick Add blockquote paragraph to be available.");
    }

    await clickQuoteForCaret(emptyQuote.closest("blockquote") instanceof HTMLElement ? (emptyQuote.closest("blockquote") as HTMLElement) : emptyQuote);

    expect(document.activeElement).toBe(editor.view.dom);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(editor.state.selection.from).toBe(editor.state.selection.to);
    expect(emptyQuote).toHaveAttribute("data-placeholder", "Enter a quote");

    await typeTextThroughBrowserInput(editor, "Reclicked quick quote");

    expect(editor.getJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        },
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Reclicked quick quote" }]
            }
          ]
        }
      ]
    });

    geometrySpy.mockRestore();
  });

  it("keeps Quick Add ownership from block content into the gutter and clears it outside the editor-owned region", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Alpha" }]
            }
          ]
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Bravo" }]
                }
              ]
            }
          ]
        },
        { type: "horizontalRule" }
      ]
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 52, 620, 52),
      new DOMRect(132, 132, 620, 72),
      new DOMRect(132, 238, 620, 10)
    ]);

    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 60 });
    const button = await screen.findByRole("button", { name: "Add block after Blockquote" });
    expect(button).toBeInTheDocument();

    await dispatchOwnerPointerMove(button.ownerDocument, button, { clientX: 84, clientY: 60 });
    expect(screen.getByRole("button", { name: "Add block after Blockquote" })).toBeInTheDocument();

    await dispatchOwnerPointerMove(document, document.body, { clientX: 20, clientY: 20 });
    expect(screen.queryByRole("button", { name: /Add block after/i })).toBeNull();

    geometrySpy.mockRestore();
  });

  it("keeps hover ownership when the owner-document pointer event is retargeted to the shadow host but the composed path contains a top-level block", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    const host = document.createElement("div");
    const block = editor.view.dom.children[0];
    if (!(surface instanceof HTMLElement) || !(block instanceof HTMLElement)) {
      throw new Error("Expected the editor surface and top-level block to be available.");
    }

    await dispatchOwnerPointerMove(surface.ownerDocument, host, { clientX: 120, clientY: 64 }, { composedPath: [block, editor.view.dom, host] });

    expect(await screen.findByRole("button", { name: "Add block after Text" })).toBeInTheDocument();
    geometrySpy.mockRestore();
  });

  it("retargets normally when the pointer moves from the gutter back into block content", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Alpha" }]
            }
          ]
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Bravo" }]
                }
              ]
            }
          ]
        }
      ]
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 52, 620, 52),
      new DOMRect(132, 132, 620, 72)
    ]);

    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 60 });
    const button = await screen.findByRole("button", { name: "Add block after Blockquote" });
    await dispatchOwnerPointerMove(button.ownerDocument, button, { clientX: 84, clientY: 60 });
    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 132 });

    expect(screen.getByRole("button", { name: "Add block after Bulleted List" })).toBeInTheDocument();

    geometrySpy.mockRestore();
  });

  it("keeps hover ownership when the composed path runs through the portaled gutter control", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 64 });
    const button = await screen.findByRole("button", { name: "Add block after Text" });
    await dispatchOwnerPointerMove(button.ownerDocument, document.body, { clientX: 84, clientY: 64 }, { composedPath: [button, document.body] });

    expect(screen.getByRole("button", { name: "Add block after Text" })).toBeInTheDocument();
    geometrySpy.mockRestore();
  });

  it("uses the same grouped selector inventory and inline query presentation for slash and Quick Add", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph"
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Nested" }]
                }
              ]
            }
          ]
        },
        { type: "horizontalRule" },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Omega" }]
        }
      ]
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 52, 620, 28),
      new DOMRect(132, 104, 620, 64),
      new DOMRect(132, 196, 620, 10),
      new DOMRect(132, 234, 620, 28)
    ]);

    await act(async () => {
      editor.commands.focus("start", { scrollIntoView: false });
    });
    fireEvent.keyDown(editor.view.dom, { key: "/" });
    const slashMenu = await screen.findByRole("listbox", { name: "Slash command menu" });
    expect(within(slashMenu).getByText("Basic Blocks")).toBeInTheDocument();
    expect(within(slashMenu).queryByText("/")).toBeNull();
    expect(within(slashMenu).queryByLabelText("Type to search")).toBeNull();
    await waitFor(() => {
      expect(getCommandQueryParagraph(editor)).toBeInTheDocument();
      expect(getCommandQuerySlash(editor)).toHaveTextContent("/");
      expect(getCommandQueryHelper(editor)).toHaveTextContent("Type to search");
    });
    const slashPresentation = getCommandQueryPresentationState(editor);
    expect(slashPresentation).toMatchObject({
      query: "",
      source: "slash"
    });
    expect(resolveTopLevelBlockIndexFromPosition(editor, slashPresentation?.ownerPos ?? -1)).toBe(0);
    const slashOptions = getOptionNames(slashMenu);
    expect(slashOptions).toEqual([
      "Text",
      "Heading 1",
      "Heading 2",
      "Heading 3",
      "Blockquote",
      "Bulleted List",
      "Numbered List",
      "Accordion",
      "Code Block",
      "Horizontal Rule",
      "Image",
      "Table"
    ]);
    fireEvent.keyDown(editor.view.dom, { key: "h" });
    fireEvent.keyDown(editor.view.dom, { key: "e" });
    await waitFor(() => {
      expect(getCommandQueryInline(editor)).toHaveTextContent("/he");
      expect(getCommandQueryHelper(editor)).toBeNull();
    });
    const slashFilteredPresentation = getCommandQueryPresentationState(editor);
    expect(slashFilteredPresentation).toMatchObject({
      query: "he",
      source: "slash"
    });
    expect(slashFilteredPresentation?.ownerPos).toBe(slashPresentation?.ownerPos);
    const slashFilteredOptions = getOptionNames(slashMenu);

    fireEvent.keyDown(editor.view.dom, { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();
    expect(getCommandQueryPresentationState(editor)).toBeNull();

    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 132 });
    fireEvent.click((await screen.findAllByRole("button")).find((button) => button.getAttribute("aria-haspopup") === "listbox")!);

    const quickAddMenu = await screen.findByRole("listbox");
    expect(within(quickAddMenu).getByText("Basic Blocks")).toBeInTheDocument();
    expect(within(quickAddMenu).queryByText("/")).toBeNull();
    expect(within(quickAddMenu).queryByLabelText("Type to search")).toBeNull();
    await waitFor(() => {
      expect(getCommandQueryParagraph(editor)).toBeInTheDocument();
      expect(getCommandQuerySlash(editor)).toHaveTextContent("/");
      expect(getCommandQueryHelper(editor)).toHaveTextContent("Type to search");
    });
    const quickAddPresentation = getCommandQueryPresentationState(editor);
    expect(quickAddPresentation).toMatchObject({
      query: "",
      source: "quickAdd"
    });
    expect(resolveTopLevelBlockIndexFromPosition(editor, quickAddPresentation?.ownerPos ?? -1)).toBe(2);
    expect(editor.getJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph"
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Nested" }]
                }
              ]
            }
          ]
        },
        {
          type: "paragraph"
        },
        { type: "horizontalRule" },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Omega" }]
        }
      ]
    });
    expect(editor.view.dom.children[2]).toHaveAttribute("data-placeholder", "Start typing or press '/' for commands");
    expect(getOptionNames(quickAddMenu)).toEqual(slashOptions);
    fireEvent.keyDown(editor.view.dom, { key: "h" });
    fireEvent.keyDown(editor.view.dom, { key: "e" });
    await waitFor(() => {
      expect(getCommandQueryInline(editor)).toHaveTextContent("/he");
      expect(getCommandQueryHelper(editor)).toBeNull();
    });
    const quickAddFilteredPresentation = getCommandQueryPresentationState(editor);
    expect(quickAddFilteredPresentation).toMatchObject({
      query: "he",
      source: "quickAdd"
    });
    expect(quickAddFilteredPresentation?.ownerPos).toBe(quickAddPresentation?.ownerPos);
    expect(getOptionNames(quickAddMenu)).toEqual(slashFilteredOptions);
    geometrySpy.mockRestore();
  });

  it("uses pointer cursors for the Quick Add control and selector rows inside the editor runtime", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 64 });
    const quickAddButton = await screen.findByRole("button", { name: "Add block after Text" });
    fireEvent.click(quickAddButton);
    const quickAddMenu = await screen.findByRole("listbox", { name: "Insert block after Text" });
    const option = within(quickAddMenu).getByRole("option", { name: "Heading 1" });

    expect(window.getComputedStyle(quickAddButton).cursor).toBe("pointer");
    expect(window.getComputedStyle(option).cursor).toBe("pointer");

    geometrySpy.mockRestore();
  });

  it("removes permanent scrollbar gutter space when the selector does not overflow and restores measured padding when it does", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);

    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    const quickAddMenu = await screen.findByRole("listbox", { name: "Insert block after Text" });
    const scrollElement = quickAddMenu.querySelector(".docsera-block-selector__scroll");
    if (!(scrollElement instanceof HTMLElement)) {
      throw new Error("Expected the selector scroll container to be available.");
    }

    const restoreMetrics = [
      mockElementMetric(scrollElement, "clientHeight", 280),
      mockElementMetric(scrollElement, "clientWidth", 304),
      mockElementMetric(scrollElement, "offsetWidth", 304),
      mockElementMetric(scrollElement, "scrollHeight", 260)
    ];
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });
    await waitFor(() => {
      expect(quickAddMenu.style.getPropertyValue("--docsera-block-selector-scrollbar-gap")).toBe("0px");
    });

    restoreMetrics.forEach((reset) => reset());
    const restoreOverflowMetrics = [
      mockElementMetric(scrollElement, "clientHeight", 180),
      mockElementMetric(scrollElement, "clientWidth", 287),
      mockElementMetric(scrollElement, "offsetWidth", 304),
      mockElementMetric(scrollElement, "scrollHeight", 420)
    ];
    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });
    await waitFor(() => {
      expect(quickAddMenu.style.getPropertyValue("--docsera-block-selector-scrollbar-gap")).toBe("17px");
    });

    restoreOverflowMetrics.forEach((reset) => reset());
    geometrySpy.mockRestore();
  });

  it("opens the selector above the owner when there is more usable room above and keeps that placement stable while filtering", async () => {
    const harness = createOverlayOwnerDocumentHarness(1280, 220);
    const overlayRoot = document.createElement("div");
    Object.defineProperty(overlayRoot, "ownerDocument", {
      configurable: true,
      value: harness.ownerDocument
    });

    const { editorReady } = renderRuntime({}, { overlayRoot });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 164, 620, 28)]);
    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await dispatchOwnerPointerMove(harness.ownerDocument, surface, { clientX: 120, clientY: 176 });
    fireEvent.click(await screen.findByRole("button", { name: "Add block after Text" }));
    const quickAddMenu = await screen.findByRole("listbox", { name: "Insert block after Text" });
    const insertedBlock = editor.view.dom.children[1];
    if (!(insertedBlock instanceof HTMLElement)) {
      throw new Error("Expected the inserted Quick Add paragraph to be available.");
    }
    const restoreInsertedRect = mockElementRect(insertedBlock, new DOMRect(132, 192, 620, 28));

    act(() => {
      harness.triggerResize();
    });

    await waitFor(() => {
      const top = Number.parseFloat(quickAddMenu.style.top);
      const maxHeight = Number.parseFloat(quickAddMenu.style.maxHeight);
      expect(192 - (top + maxHeight)).toBeGreaterThanOrEqual(9);
      expect(192 - (top + maxHeight)).toBeLessThanOrEqual(10);
      expect(Number.parseFloat(quickAddMenu.style.maxHeight)).toBeGreaterThan(100);
      expect(Number.parseFloat(quickAddMenu.style.maxHeight)).toBeLessThan(288);
    });

    const initialTop = quickAddMenu.style.top;
    const initialMaxHeight = quickAddMenu.style.maxHeight;

    fireEvent.keyDown(editor.view.dom, { key: "h" });
    fireEvent.keyDown(editor.view.dom, { key: "e" });

    await waitFor(() => {
      expect(quickAddMenu.style.top).toBe(initialTop);
      expect(quickAddMenu.style.maxHeight).toBe(initialMaxHeight);
    });

    restoreInsertedRect();
    geometrySpy.mockRestore();
  });

  it("opens the selector below the owner when the complete surface fits below", async () => {
    const harness = createOverlayOwnerDocumentHarness(1280, 720);
    const overlayRoot = document.createElement("div");
    Object.defineProperty(overlayRoot, "ownerDocument", {
      configurable: true,
      value: harness.ownerDocument
    });

    const { editorReady } = renderRuntime({}, { overlayRoot });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await dispatchOwnerPointerMove(harness.ownerDocument, surface, { clientX: 120, clientY: 64 });
    fireEvent.click(await screen.findByRole("button", { name: "Add block after Text" }));
    const quickAddMenu = await screen.findByRole("listbox", { name: "Insert block after Text" });
    const insertedBlock = editor.view.dom.children[1];
    if (!(insertedBlock instanceof HTMLElement)) {
      throw new Error("Expected the inserted Quick Add paragraph to be available.");
    }
    const restoreInsertedRect = mockElementRect(insertedBlock, new DOMRect(132, 84, 620, 28));

    act(() => {
      harness.triggerResize();
    });

    await waitFor(() => {
      expect(Number.parseFloat(quickAddMenu.style.top)).toBe(84 + 28 + 10);
    });
    expect(Number.parseFloat(quickAddMenu.style.maxHeight)).toBeGreaterThanOrEqual(288);

    restoreInsertedRect();
    geometrySpy.mockRestore();
  });

  it("converts the inserted Quick Add paragraph in place when a following block exists", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Omega" }]
        }
      ]
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 52, 620, 28),
      new DOMRect(132, 108, 620, 28)
    ]);

    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    fireEvent.click(await screen.findByRole("option", { name: "Heading 1" }));

    expect(editor.getJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        },
        {
          type: "heading",
          attrs: { level: 1 }
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Omega" }]
        }
      ]
    });

    await act(async () => {
      editor.commands.undo();
    });
    expect(editor.getJSON()).toEqual(initial);

    geometrySpy.mockRestore();
  });

  it.each([
    ["Heading 1", 1],
    ["Heading 2", 2],
    ["Heading 3", 3]
  ])("converts the inserted Quick Add paragraph after the final block to %s without leaving a trailing paragraph", async (label, level) => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        }
      ]
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    fireEvent.click(await screen.findByRole("option", { name: label }));

    await waitFor(() => {
      expect(editor.getJSON()).toEqual({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Alpha" }]
          },
          {
            type: "heading",
            attrs: { level }
          }
        ]
      });
    });

    geometrySpy.mockRestore();
  });

  it.each(
    EDITOR_BLOCK_COMMANDS.filter((command) => command.id !== "image").map((command) => [
      command.label,
      getEditorBlockCommandQuickAddContent(command)
    ])
  )("replaces the temporary final-block Quick Add paragraph with the declared Quick Add output for %s in one undo step", async (label, declaredQuickAddContent) => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        }
      ]
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    const expectedQuickAddNodes = declaredQuickAddContent.map((node) => editor.schema.nodeFromJSON(node).toJSON());

    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    fireEvent.click(await screen.findByRole("option", { name: label }));

    await waitFor(() => {
      expect(editor.getJSON()).toEqual({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Alpha" }]
          },
          ...expectedQuickAddNodes
        ]
      });
    });

    await act(async () => {
      editor.commands.undo();
    });

    expect(editor.getJSON()).toEqual(initial);
    geometrySpy.mockRestore();
  });

  it("generates fresh non-empty accordion ids for each Quick Add insertion", () => {
    const accordionCommand = EDITOR_BLOCK_COMMANDS.find((command) => command.id === "accordion");
    if (!accordionCommand) {
      throw new Error("Expected the accordion command to be registered.");
    }

    const first = getEditorBlockCommandQuickAddContent(accordionCommand);
    const second = getEditorBlockCommandQuickAddContent(accordionCommand);

    expect(first).toHaveLength(1);
    expect(second).toHaveLength(1);
    expect(first[0]).toMatchObject({
      type: "accordion",
      attrs: {
        accordionId: expect.stringMatching(/^accordion-/)
      },
      content: [
        {
          type: "accordionItem",
          attrs: {
            accordionItemId: expect.stringMatching(/^accordion-item-/)
          }
        }
      ]
    });
    expect(second[0]).toMatchObject({
      type: "accordion",
      attrs: {
        accordionId: expect.stringMatching(/^accordion-/)
      },
      content: [
        {
          type: "accordionItem",
          attrs: {
            accordionItemId: expect.stringMatching(/^accordion-item-/)
          }
        }
      ]
    });
    expect((first[0].attrs as { accordionId?: string }).accordionId).not.toBe(
      (second[0].attrs as { accordionId?: string }).accordionId
    );
    expect((first[0].content?.[0]?.attrs as { accordionItemId?: string }).accordionItemId).not.toBe(
      (second[0].content?.[0]?.attrs as { accordionItemId?: string }).accordionItemId
    );
  });

  it.each([
    [
      "Heading 1",
      "Heading text",
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Heading text" }]
      }
    ],
    [
      "Heading 2",
      "Section text",
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Section text" }]
      }
    ],
    [
      "Heading 3",
      "Subsection text",
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "Subsection text" }]
      }
    ],
    [
      "Blockquote",
      "Quoted text",
      {
        type: "blockquote",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Quoted text" }]
          }
        ]
      }
    ],
    [
      "Code Block",
      "const value = 1;",
      {
        type: "codeBlock",
        attrs: { language: null },
        content: [{ type: "text", text: "const value = 1;" }]
      }
    ]
  ])("does not append a duplicate trailing paragraph when typing into a final-block Quick Add %s", async (label, insertedText, expectedNode) => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        }
      ]
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);

    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    fireEvent.click(await screen.findByRole("option", { name: label }));

    await act(async () => {
      editor.commands.insertContent(insertedText);
    });

    expect(editor.getJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        },
        expectedNode
      ]
    });

    geometrySpy.mockRestore();
  });

  it.each([
    ["Heading 1", 1],
    ["Heading 2", 2],
    ["Heading 3", 3]
  ])("creates exactly one continuation paragraph when pressing Enter from an empty final-block Quick Add %s", async (label, level) => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        }
      ]
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);

    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    fireEvent.click(await screen.findByRole("option", { name: label }));
    fireEvent.keyDown(editor.view.dom, { key: "Enter" });

    await waitFor(() => {
      expect(editor.getJSON()).toEqual({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Alpha" }]
          },
          {
            type: "heading",
            attrs: { level }
          },
          {
            type: "paragraph"
          }
        ]
      });
    });

    geometrySpy.mockRestore();
  });

  it("removes an empty final-block blockquote with Backspace without leaving duplicate paragraphs", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        }
      ]
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);

    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    fireEvent.click(await screen.findByRole("option", { name: "Blockquote" }));
    fireEvent.keyDown(editor.view.dom, { key: "Backspace" });

    await waitFor(() => {
      expect(editor.getJSON()).toEqual({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Alpha" }]
          },
          {
            type: "paragraph"
          }
        ]
      });
    });

    await act(async () => {
      editor.commands.undo();
    });

    expect(editor.getJSON()).toEqual(initial);
    geometrySpy.mockRestore();
  });

  it("exits a trailing blockquote paragraph, rejoins to the quote boundary with a live text selection, and preserves undo and autosave coherence", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Quoted text" }]
            }
          ]
        }
      ]
    };
    const onSaveDraft = vi.fn(async ({ draftContentJson }: { draftContentJson: ReturnType<typeof createEmptyDocseraDocumentEnvelope> }) => ({
      state: "succeeded" as const,
      page: {
        ...createSuccessPage(1),
        draftContentJson
      }
    }));
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument),
      onSaveDraft
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];

    await act(async () => {
      editor.commands.focus("end", { scrollIntoView: false });
    });

    fireEvent.keyDown(editor.view.dom, { key: "Enter" });

    await waitFor(() => {
      expect(editor.getJSON()).toEqual({
        type: "doc",
        content: [
          {
            type: "blockquote",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Quoted text" }]
              },
              {
                type: "paragraph"
              }
            ]
          }
        ]
      });
    });

    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.$from.node(1).type.name).toBe("blockquote");
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(editor.state.selection.$from.parent.content.size).toBe(0);
    expect(editor.state.selection.$from.parentOffset).toBe(0);

    fireEvent.keyDown(editor.view.dom, { key: "Backspace" });

    await waitFor(() => {
      expect(editor.getJSON()).toEqual({
        type: "doc",
        content: [
          {
            type: "blockquote",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Quoted text" }]
              }
            ]
          },
          {
            type: "paragraph"
          }
        ]
      });
    });

    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.$from.depth).toBe(1);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(editor.state.selection.$from.parent.content.size).toBe(0);
    expect(editor.state.selection.$from.parentOffset).toBe(0);

    fireEvent.keyDown(editor.view.dom, { key: "Backspace" });

    await waitFor(() => {
      expect(editor.getJSON()).toEqual(initial);
    });

    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.$from.node(1).type.name).toBe("blockquote");
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(editor.state.selection.$from.parent.textContent).toBe("Quoted text");
    expect(editor.state.selection.$from.parentOffset).toBe("Quoted text".length);

    await act(async () => {
      editor.commands.insertContent("!");
    });

    const insertedState = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Quoted text!" }]
            }
          ]
        }
      ]
    };
    expect(editor.getJSON()).toEqual(insertedState);

    await runAutosave();
    await waitFor(() => {
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
    });
    expect(onSaveDraft.mock.calls[0]?.[0].draftContentJson.document).toEqual(insertedState);

    await act(async () => {
      editor.commands.undo();
    });
    expect(editor.getJSON()).toEqual(initial);

    await act(async () => {
      editor.commands.redo();
    });
    expect(editor.getJSON()).toEqual(insertedState);

    await act(async () => {
      editor.commands.undo();
    });
    expect(editor.getJSON()).toEqual(initial);
  });

  it.each([
    ["Heading 1", 1],
    ["Heading 2", 2],
    ["Heading 3", 3]
  ])("preserves a legitimate final empty paragraph when Quick Add converts to %s", async (label, level) => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        },
        {
          type: "paragraph"
        }
      ]
    };
    const onSaveDraft = vi.fn(async ({ draftContentJson }: { draftContentJson: ReturnType<typeof createEmptyDocseraDocumentEnvelope> }) => ({
      state: "succeeded" as const,
      page: {
        ...createSuccessPage(1),
        draftContentJson
      }
    }));
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument),
      onSaveDraft
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 52, 620, 28),
      new DOMRect(132, 108, 620, 28)
    ]);

    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    fireEvent.click(await screen.findByRole("option", { name: label }));

    const expected = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        },
        {
          type: "heading",
          attrs: { level }
        },
        {
          type: "paragraph"
        }
      ]
    };

    await waitFor(() => {
      expect(editor.getJSON()).toEqual(expected);
    });

    await runAutosave();
    await waitFor(() => {
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
    });
    expect(onSaveDraft.mock.calls[0]?.[0].draftContentJson.document).toEqual(expected);

    geometrySpy.mockRestore();
  });

  it("retains the intended continuation paragraph for Quick Add horizontal rules", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        }
      ]
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);

    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    fireEvent.click(await screen.findByRole("option", { name: "Horizontal Rule" }));

    expect(editor.getJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        },
        {
          type: "horizontalRule"
        },
        {
          type: "paragraph"
        }
      ]
    });

    geometrySpy.mockRestore();
  });

  it("keeps successful and cancelled Quick Add mutations within a single undo step while preserving the inserted paragraph on cancel", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        }
      ]
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);

    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    fireEvent.click(await screen.findByRole("option", { name: "Heading 3" }));
    expect(undoDepth(editor.state)).toBeGreaterThan(0);

    await act(async () => {
      editor.commands.undo();
    });
    expect(editor.getJSON()).toEqual(initial);

    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    expect(await screen.findByRole("listbox", { name: "Insert block after Text" })).toBeInTheDocument();

    fireEvent.keyDown(editor.view.dom, { key: "Escape" });
    expect(screen.queryByRole("listbox")).toBeNull();
    await waitFor(() => {
      expect(getCommandQueryParagraph(editor)).toBeNull();
    });
    expect(getCommandQuerySlash(editor)).toBeNull();
    expect(getCommandQueryHelper(editor)).toBeNull();
    expect(editor.getJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        },
        {
          type: "paragraph"
        }
      ]
    });
    await waitFor(() => {
      expect(editor.view.dom.children[1]).toHaveAttribute("data-placeholder", "Start typing or press '/' for commands");
    });

    await act(async () => {
      editor.commands.undo();
    });
    expect(editor.getJSON()).toEqual(initial);

    geometrySpy.mockRestore();
  });

  it("does not autosave from hover or slash-selector navigation, and autosaves after a completed Quick Add mutation", async () => {
    const { editorReady, onSaveDraft } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 64 });
    await runAutosave();
    expect(onSaveDraft).toHaveBeenCalledTimes(0);

    await openSlashQuery(editor, "he");
    fireEvent.keyDown(editor.view.dom, { key: "ArrowDown" });
    fireEvent.keyDown(editor.view.dom, { key: "ArrowUp" });
    await runAutosave();
    expect(onSaveDraft).toHaveBeenCalledTimes(0);

    fireEvent.keyDown(editor.view.dom, { key: "Escape" });
    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    fireEvent.click(await screen.findByRole("option", { name: "Heading 2" }));

    await runAutosave();
    await waitFor(() => {
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
    });

    geometrySpy.mockRestore();
  });

  it("restores editor focus after a pointer-executed Quick Add command so one keyboard undo removes the transaction", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        }
      ]
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);

    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    fireEvent.click(await screen.findByRole("option", { name: "Heading 2" }));

    await waitFor(() => {
      expect(editor.isFocused).toBe(true);
    });
    expect(document.activeElement === editor.view.dom || editor.view.dom.contains(document.activeElement)).toBe(true);

    fireEvent.keyDown(editor.view.dom, { ctrlKey: true, key: "z" });

    await waitFor(() => {
      expect(editor.getJSON()).toEqual(initial);
    });

    geometrySpy.mockRestore();
  });

  it("keeps Quick Add hover activity document-clean while option hover only changes the highlighted row", async () => {
    const { editorReady, onSaveDraft, onStatusChange } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);

    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    const quickAddMenu = await screen.findByRole("listbox", { name: "Insert block after Text" });
    const options = within(quickAddMenu).getAllByRole("option");
    const before = editor.getJSON();
    const beforeUndoDepth = undoDepth(editor.state);
    const childCountBeforeHover = editor.state.doc.childCount;
    const saveCallsBeforeHover = onSaveDraft.mock.calls.length;
    const statusCallsBeforeHover = onStatusChange.mock.calls.length;

    fireEvent.mouseEnter(options[1]);
    fireEvent.mouseEnter(options[2]);
    fireEvent.mouseEnter(options[0]);

    expect(options[0]).toHaveAttribute("aria-selected", "true");
    expect(editor.getJSON()).toEqual(before);
    expect(editor.state.doc.childCount).toBe(childCountBeforeHover);
    expect(undoDepth(editor.state)).toBe(beforeUndoDepth);
    expect(onSaveDraft.mock.calls.length).toBe(saveCallsBeforeHover);
    expect(onStatusChange.mock.calls.length).toBe(statusCallsBeforeHover);

    geometrySpy.mockRestore();
  });

  it("shows the placeholder on the initial empty paragraph without changing canonical JSON or autosave state", async () => {
    const { editorReady, onSaveDraft, onStatusChange } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    expect(editor.getJSON()).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    expect(editor.view.dom.firstElementChild).toHaveAttribute("data-placeholder", "Start typing or press '/' for commands");

    await runAutosave();
    expect(onSaveDraft).toHaveBeenCalledTimes(0);
    expect(onStatusChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isDirty: false,
        status: "Saved"
      })
    );
  });

  it("keeps the inline query out of the dropdown while preserving grouped headings only", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor);

    const slashMenu = await screen.findByRole("listbox", { name: "Slash command menu" });
    expect(within(slashMenu).queryByText("Insert block")).toBeNull();
    expect(within(slashMenu).queryByText("/ Type to search")).toBeNull();
    expect(within(slashMenu).queryByText("/")).toBeNull();
    expect(within(slashMenu).getByText("Basic Blocks")).toBeInTheDocument();
    await waitFor(() => {
      expect(getCommandQueryParagraph(editor)).toBeInTheDocument();
      expect(getCommandQuerySlash(editor)).toHaveTextContent("/");
      expect(getCommandQueryHelper(editor)).toHaveTextContent("Type to search");
    });
  });

  it("creates a placeholder paragraph on Enter, removes it while typing, and restores it when the paragraph becomes empty again", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Alpha");
    await act(async () => {
      editor.commands.focus("end", { scrollIntoView: false });
      editor.commands.enter();
    });

    await waitFor(() => {
      expect(editor.view.dom.children[1]).toHaveAttribute("data-placeholder", "Start typing or press '/' for commands");
    });

    await act(async () => {
      editor.commands.insertContent("Beta");
    });
    expect(editor.view.dom.children[1]).not.toHaveAttribute("data-placeholder");

    await act(async () => {
      editor.commands.deleteRange({ from: 8, to: 12 });
    });

    await waitFor(() => {
      expect(editor.view.dom.children[1]).toHaveAttribute("data-placeholder", "Start typing or press '/' for commands");
    });
  });

  it("shows the accepted helper text for empty headings and blockquotes without mutating canonical content", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 }
        },
        {
          type: "heading",
          attrs: { level: 2 }
        },
        {
          type: "heading",
          attrs: { level: 3 }
        },
        {
          type: "blockquote",
          content: [{ type: "paragraph" }]
        }
      ]
    };
    const { editorReady, onSaveDraft } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const [h1, h2, h3, quote] = Array.from(editor.view.dom.children) as HTMLElement[];
    expect(h1).toHaveAttribute("data-placeholder", "Heading 1");
    expect(h2).toHaveAttribute("data-placeholder", "Heading 2");
    expect(h3).toHaveAttribute("data-placeholder", "Heading 3");
    expect(quote.querySelector("p")).toHaveAttribute("data-placeholder", "Enter a quote");

    await runAutosave();
    expect(editor.getJSON()).toEqual(initial);
    expect(onSaveDraft).toHaveBeenCalledTimes(0);
  });

  it("does not resurrect stale hover when a Quick Add selector closes while the pointer is over the menu", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);

    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    const quickAddMenu = await screen.findByRole("listbox", { name: "Insert block after Text" });

    await dispatchOwnerPointerMove(quickAddMenu.ownerDocument, quickAddMenu, { clientX: 920, clientY: 120 });
    fireEvent.keyDown(editor.view.dom, { key: "Escape" });

    expect(screen.queryByRole("listbox", { name: "Insert block after Text" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add block after Text" })).toBeNull();

    geometrySpy.mockRestore();
  });

  it("does not resurrect stale hover when a Quick Add selector executes while the pointer is over the menu", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);

    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    const quickAddMenu = await screen.findByRole("listbox", { name: "Insert block after Text" });

    await dispatchOwnerPointerMove(quickAddMenu.ownerDocument, quickAddMenu, { clientX: 920, clientY: 120 });
    fireEvent.click(await screen.findByRole("option", { name: "Heading 2" }));

    expect(screen.queryByRole("listbox", { name: "Insert block after Text" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add block after Text" })).toBeNull();

    geometrySpy.mockRestore();
  });

  it("hides the gutter control while Quick Add is open and keeps the selector anchored to the inserted paragraph instead of live hover", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Omega" }]
        }
      ]
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 52, 620, 28),
      new DOMRect(132, 140, 620, 28)
    ]);

    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    const quickAddMenu = await screen.findByRole("listbox", { name: "Insert block after Text" });

    expect(screen.queryByRole("button", { name: /Add block after/i })).toBeNull();

    const insertedBlock = editor.view.dom.children[1];
    const followingBlock = editor.view.dom.children[2];
    if (!(insertedBlock instanceof HTMLElement) || !(followingBlock instanceof HTMLElement)) {
      throw new Error("Expected Quick Add to insert a stable paragraph before the following block.");
    }

    const restoreInsertedRect = mockElementRect(insertedBlock, new DOMRect(132, 84, 620, 28));
    const restoreFollowingRect = mockElementRect(followingBlock, new DOMRect(132, 140, 620, 28));

    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });

    await waitFor(() => {
      expect(quickAddMenu.style.top).toBe("122px");
    });

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 148 });

    expect(quickAddMenu.style.top).toBe("122px");
    expect(screen.queryByRole("button", { name: /Add block after/i })).toBeNull();

    restoreFollowingRect();
    restoreInsertedRect();
    geometrySpy.mockRestore();
  });

  it("keeps the same ProseMirror root DOM node while overlay measurements run on resize", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    const proseMirrorRoot = editor.view.dom;

    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    expect(await screen.findByRole("listbox", { name: "Insert block after Text" })).toBeInTheDocument();

    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });

    expect(editor.view.dom).toBe(proseMirrorRoot);
    geometrySpy.mockRestore();
  });

  it("renders the handle immediately after Quick Add and keeps the selected-block hook out of document flow", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        }
      ]
    };
    const { editorReady, onSaveDraft, overlayRoot } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 64 });

    const floatingLayer = overlayRoot.querySelector(".docsera-editor-floating-layer");
    if (!(floatingLayer instanceof HTMLElement)) {
      throw new Error("Expected the floating editor layer to be available.");
    }

    const floatingButtons = within(floatingLayer).getAllByRole("button");
    expect(floatingButtons).toHaveLength(2);
    expect(floatingButtons.map((button) => button.getAttribute("aria-label"))).toEqual([
      "Add block after Text",
      "Select block: Text"
    ]);
    const quickAddButton = floatingButtons[0] as HTMLElement;
    const handleButton = floatingButtons[1] as HTMLElement;
    const quickAddBox = readInlineBox(quickAddButton);
    const handleBox = readInlineBox(handleButton);
    expect(handleButton).toHaveAttribute("tabindex", "-1");
    expect(getComputedStyle(handleButton).cursor).toBe("grab");
    expect(quickAddBox).toMatchObject({
      height: 24,
      left: 63,
      right: 87,
      top: 53,
      width: 24
    });
    expect(handleBox).toMatchObject({
      height: 24,
      left: 93,
      right: 117,
      top: 53,
      width: 24
    });
    expect(handleBox.left - quickAddBox.right).toBe(6);
    expect(132 - handleBox.right).toBe(15);
    expect(handleBox.right).toBeLessThan(132);
    expect(getRuntimeStyleText()).toContain(".docsera-editor-runtime__block--selected");

    geometrySpy.setLayoutRects({
      hostRect: new DOMRect(96, 96, 920, 540),
      mainPaneRect: new DOMRect(24, 32, 1180, 680),
      panelRect: new DOMRect(168, 32, 860, 680),
      proseMirrorRect: new DOMRect(168, 100, 620, 420),
      surfaceRect: new DOMRect(96, 96, 920, 540)
    });

    await act(async () => {
      window.dispatchEvent(new Event("resize"));
    });

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 64 });

    expect(readInlineBox(quickAddButton)).toMatchObject({
      height: 24,
      left: 63,
      right: 87,
      top: 53,
      width: 24
    });
    expect(readInlineBox(handleButton)).toMatchObject({
      height: 24,
      left: 93,
      right: 117,
      top: 53,
      width: 24
    });

    const selectedBefore = editor.getJSON();
    const undoDepthBefore = undoDepth(editor.state);

    await dispatchOwnerPointerEvent(surface.ownerDocument, floatingButtons[1], "pointerdown", { clientX: 160, clientY: 64 }, { button: 0, buttons: 1 });
    expect(getComputedStyle(handleButton).cursor).toBe("grabbing");
    await dispatchOwnerPointerEvent(surface.ownerDocument, floatingButtons[1], "pointerup", { clientX: 160, clientY: 64 }, { button: 0, buttons: 0 });

    expect(getSelectedBlockElement(editor)).toHaveTextContent("Alpha");
    expect(editor.getJSON()).toEqual(selectedBefore);
    expect(undoDepth(editor.state)).toBe(undoDepthBefore);
    expect(onSaveDraft).toHaveBeenCalledTimes(0);

    await dispatchOwnerPointerMove(surface.ownerDocument, document.body, { clientX: 20, clientY: 20 }, { composedPath: [document.body] });

    expect(screen.getByRole("button", { name: "Add block after Text" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select block: Text" })).toBeInTheDocument();
    expect(getSelectedBlockElement(editor)).toHaveTextContent("Alpha");

    geometrySpy.mockRestore();
  });

  it("keeps hover ownership bounded to the first, middle, and final block rows", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Bravo" }]
        },
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Charlie" }]
            }
          ]
        }
      ]
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 100, 620, 40),
      new DOMRect(132, 180, 620, 40),
      new DOMRect(132, 260, 620, 40)
    ]);
    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 99 });
    expect(screen.queryByRole("button", { name: /Add block after/i })).toBeNull();

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 100 });
    expect(await screen.findByRole("button", { name: "Add block after Text" })).toBeInTheDocument();

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 160 });
    expect(await screen.findByRole("button", { name: "Add block after Heading 2" })).toBeInTheDocument();

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 240 });
    expect(await screen.findByRole("button", { name: "Add block after Blockquote" })).toBeInTheDocument();

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 301 });
    expect(screen.queryByRole("button", { name: /Add block after/i })).toBeNull();

    geometrySpy.mockRestore();
  });

  it("keeps the shared gutter geometry across paragraphs, nested blockquotes, lists, and structural blocks", async () => {
    const cases = [
      {
        blockRects: [new DOMRect(132, 52, 620, 28)],
        hoverPoint: { clientX: 120, clientY: 64 },
        initialEnvelope: createEnvelopeFromDocument({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Alpha" }]
            }
          ]
        } as DocseraTiptapDocument),
        label: "Text"
      },
      {
        blockRects: [new DOMRect(132, 52, 620, 52), new DOMRect(132, 140, 620, 28)],
        hoverPoint: { clientX: 124, clientY: 68 },
        initialEnvelope: createEnvelopeFromDocument({
          type: "doc",
          content: [
            {
              type: "blockquote",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Quoted" }]
                }
              ]
            },
            {
              type: "paragraph",
              content: [{ type: "text", text: "After" }]
            }
          ]
        } as DocseraTiptapDocument),
        label: "Blockquote"
      },
      {
        blockRects: [new DOMRect(132, 52, 620, 52), new DOMRect(132, 140, 620, 28)],
        hoverPoint: { clientX: 124, clientY: 68 },
        initialEnvelope: createEnvelopeFromDocument({
          type: "doc",
          content: [
            {
              type: "bulletList",
              content: [
                {
                  type: "listItem",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Item" }]
                    }
                  ]
                }
              ]
            },
            {
              type: "paragraph",
              content: [{ type: "text", text: "After" }]
            }
          ]
        } as DocseraTiptapDocument),
        label: "Bulleted List"
      },
      {
        blockRects: [new DOMRect(132, 52, 620, 28), new DOMRect(132, 140, 620, 28)],
        hoverPoint: { clientX: 124, clientY: 64 },
        initialEnvelope: createEnvelopeFromDocument({
          type: "doc",
          content: [
            { type: "horizontalRule" },
            {
              type: "paragraph",
              content: [{ type: "text", text: "After" }]
            }
          ]
        } as DocseraTiptapDocument),
        label: "Horizontal Rule"
      }
    ] as const;

    for (const testCase of cases) {
      const { editorReady, overlayRoot } = renderRuntime({
        initialEnvelope: testCase.initialEnvelope
      });

      await waitFor(() => {
        expect(editorReady[0]).toBeDefined();
      });

      const editor = editorReady[0];
      const geometrySpy = mockTopLevelBlockGeometry(editor, [...testCase.blockRects]);
      const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
      if (!(surface instanceof HTMLElement)) {
        throw new Error("Expected the editor surface to be available.");
      }

      await dispatchOwnerPointerMove(surface.ownerDocument, surface, testCase.hoverPoint);

      const floatingLayer = overlayRoot.querySelector(".docsera-editor-floating-layer");
      if (!(floatingLayer instanceof HTMLElement)) {
        throw new Error("Expected the floating editor layer to be available.");
      }

      const floatingButtons = within(floatingLayer).getAllByRole("button");
      expect(floatingButtons.map((button) => button.getAttribute("aria-label"))).toEqual([
        `Add block after ${testCase.label}`,
        `Select block: ${testCase.label}`
      ]);

      const quickAddBox = readInlineBox(floatingButtons[0] as HTMLElement);
      const handleBox = readInlineBox(floatingButtons[1] as HTMLElement);
      expect(quickAddBox.right).toBe(handleBox.left - 6);
      expect(handleBox.right).toBeLessThan(testCase.blockRects[0].left);
      expect(testCase.blockRects[0].left - handleBox.right).toBe(15);
      expect(quickAddBox.top).toBe(testCase.blockRects[0].top + 1);
      expect(handleBox.top).toBe(testCase.blockRects[0].top + 1);

      geometrySpy.mockRestore();
    }
  });

  it("targets a nested blockquote descendant and opens the block menu on an ordinary handle click", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Quoted" }]
            }
          ]
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "After" }]
        }
      ]
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 52, 620, 52),
      new DOMRect(132, 140, 620, 28)
    ]);
    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    const nestedParagraph = editor.view.dom.querySelector("blockquote > p");
    if (!(nestedParagraph instanceof HTMLElement)) {
      throw new Error("Expected the nested blockquote paragraph to be available.");
    }

    const blockquote = editor.view.dom.querySelector("blockquote");
    if (!(blockquote instanceof HTMLElement)) {
      throw new Error("Expected the blockquote block to be available.");
    }

    await dispatchOwnerPointerMove(surface.ownerDocument, nestedParagraph, {
      clientX: 124,
      clientY: 68
    }, {
      composedPath: [nestedParagraph, blockquote, editor.view.dom, surface]
    });

    expect(await screen.findByRole("button", { name: "Add block after Blockquote" })).toBeInTheDocument();

    const handle = screen.getByRole("button", { name: "Select block: Blockquote" });
    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 68 }, { button: 0, buttons: 1 });
    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerup", { clientX: 160, clientY: 68 }, { button: 0, buttons: 0 });

    await waitFor(() => expect(getSelectedBlockElement(editor)).toHaveTextContent("Quoted"));

    fireEvent.keyDown(editor.view.dom, { key: "Escape" });
    expect(getSelectedBlockElement(editor)).toBeNull();

    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 68 }, { button: 0, buttons: 1 });
    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerup", { clientX: 160, clientY: 68 }, { button: 0, buttons: 0 });

    await waitFor(() => expect(getSelectedBlockElement(editor)).toHaveTextContent("Quoted"));
    expect(screen.getByRole("menu", { name: "Block actions for Blockquote" })).toBeInTheDocument();
    expect(editor.getJSON()).toEqual(initial);

    geometrySpy.mockRestore();
  });

  it.each(["pointercancel", "lostpointercapture"] as const)(
    "clears a pending handle gesture on %s without selecting or mutating",
    async (eventType) => {
      const initial = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Alpha" }]
          }
        ]
      };
      const { editorReady } = renderRuntime({
        initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
      });

      await waitFor(() => {
        expect(editorReady[0]).toBeDefined();
      });

      const editor = editorReady[0];
      const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
      const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
      if (!(surface instanceof HTMLElement)) {
        throw new Error("Expected the editor surface to be available.");
      }

      await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 64 });
      const handle = await screen.findByRole("button", { name: "Select block: Text" });

      await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 64 }, { button: 0, buttons: 1 });
      await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointermove", { clientX: 172, clientY: 76 }, { button: 0, buttons: 1 });
      await dispatchOwnerPointerEvent(surface.ownerDocument, handle, eventType, { clientX: 172, clientY: 76 }, { button: 0, buttons: 0 });

      expect(screen.queryByRole("menu", { name: "Block actions for Text" })).not.toBeInTheDocument();
      expect(getSelectedBlockElement(editor)).toBeNull();
      expect(editor.getJSON()).toEqual(initial);
      expect(undoDepth(editor.state)).toBe(0);

      geometrySpy.mockRestore();
    }
  );

  it("opens the block actions menu from the handle and dismisses it on Escape", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        }
      ]
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 64 });
    const handle = await screen.findByRole("button", { name: "Select block: Text" });

    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 64 }, { button: 0, buttons: 1 });
    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerup", { clientX: 160, clientY: 64 }, { button: 0, buttons: 0 });

    const menu = await screen.findByRole("menu", { name: "Block actions for Text" });
    expect(getMenuItemNames(menu, "menuitem")).toEqual(["Turn into", "Duplicate", "Delete"]);
    expect(within(menu).queryByText("Block actions")).toBeNull();
    expect(screen.getByRole("button", { name: "Add block after Text" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Select block: Text" })).toBeInTheDocument();
    expect(getSelectedBlockElement(editor)).toHaveTextContent("Alpha");

    fireEvent.keyDown(menu, { key: "Escape" });

    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "Block actions for Text" })).toBeNull();
    });
    expect(screen.getByRole("button", { name: "Select block: Text" })).toBeInTheDocument();
    expect(getSelectedBlockElement(editor)).toBeNull();

    geometrySpy.mockRestore();
  });

  it("duplicates the selected block from the menu and keeps the duplicate focused", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Omega" }]
        }
      ]
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 52, 620, 28),
      new DOMRect(132, 108, 620, 28)
    ]);
    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 64 });
    const handle = await screen.findByRole("button", { name: "Select block: Text" });

    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 64 }, { button: 0, buttons: 1 });
    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerup", { clientX: 160, clientY: 64 }, { button: 0, buttons: 0 });

    const menu = await screen.findByRole("menu", { name: "Block actions for Text" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Duplicate" }));

    await waitFor(() => {
      expect(editor.getJSON()).toEqual({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Alpha" }]
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Alpha" }]
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Omega" }]
          }
        ]
      });
    });
    expect(resolveTopLevelBlockIndexFromPosition(editor, editor.state.selection.from)).toBe(1);
    expect(screen.queryByRole("menu", { name: "Block actions for Text" })).toBeNull();

    geometrySpy.mockRestore();
  });

  it("opens the Turn into submenu and converts the block from the submenu", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Alpha",
              marks: [{ type: "bold" }]
            }
          ]
        }
      ]
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 64 });
    const handle = await screen.findByRole("button", { name: "Select block: Text" });

    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 64 }, { button: 0, buttons: 1 });
    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerup", { clientX: 160, clientY: 64 }, { button: 0, buttons: 0 });

    const menu = await screen.findByRole("menu", { name: "Block actions for Text" });
    fireEvent.keyDown(menu, { key: "ArrowRight" });

    const submenu = await screen.findByRole("menu", { name: "Turn into Text" });
    expect(getMenuItemNames(submenu)).toEqual(["Text", "Heading 1", "Heading 2", "Heading 3", "Blockquote", "Bulleted List", "Numbered List"]);
    expect(within(submenu).queryByText("Turn into")).toBeNull();
    expect(within(submenu).getByRole("menuitemradio", { name: "Text" })).toHaveAttribute("aria-checked", "true");

    fireEvent.keyDown(submenu, { key: "ArrowDown" });
    fireEvent.keyDown(submenu, { key: "ArrowDown" });
    fireEvent.keyDown(submenu, { key: "Enter" });

    await waitFor(() => {
      expect(editor.getJSON()).toEqual({
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 2 },
            content: [
              {
                type: "text",
                text: "Alpha",
                marks: [{ type: "bold" }]
              }
            ]
          }
        ]
      });
    });
    expect(resolveTopLevelBlockIndexFromPosition(editor, editor.state.selection.from)).toBe(0);
    expect(screen.queryByRole("menu", { name: "Turn into Text" })).toBeNull();

    geometrySpy.mockRestore();
  });

  it("deletes the final block from the menu and leaves one empty paragraph", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Solo" }]
        }
      ]
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 64 });
    const handle = await screen.findByRole("button", { name: "Select block: Text" });

    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 64 }, { button: 0, buttons: 1 });
    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerup", { clientX: 160, clientY: 64 }, { button: 0, buttons: 0 });

    const menu = await screen.findByRole("menu", { name: "Block actions for Text" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Delete" }));

    await waitFor(() => {
      expect(editor.getJSON()).toEqual({
        type: "doc",
        content: [{ type: "paragraph" }]
      });
    });
    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(editor.state.selection.$from.parentOffset).toBe(0);
    expect(screen.getByRole("button", { name: "Select block: Text" })).toBeInTheDocument();

    geometrySpy.mockRestore();
  });

  it("deletes a selected block with Delete from the block-actions menu, keeps the following block focused, and preserves undo/autosave", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Beta" }]
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Omega" }]
        }
      ]
    };
    const onSaveDraft = vi.fn(async ({ draftContentJson }: { draftContentJson: ReturnType<typeof createEmptyDocseraDocumentEnvelope> }) => ({
      state: "succeeded" as const,
      page: {
        ...createSuccessPage(1),
        draftContentJson
      }
    }));
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument),
      onSaveDraft
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 52, 620, 28),
      new DOMRect(132, 108, 620, 28),
      new DOMRect(132, 164, 620, 28)
    ]);
    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 64 });
    const handle = await screen.findByRole("button", { name: "Select block: Text" });

    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 64 }, { button: 0, buttons: 1 });
    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerup", { clientX: 160, clientY: 64 }, { button: 0, buttons: 0 });

    const menu = await screen.findByRole("menu", { name: "Block actions for Text" });
    const before = editor.getJSON();
    const undoDepthBefore = undoDepth(editor.state);

    fireEvent.keyDown(menu, { key: "Delete" });

    await waitFor(() => {
      expect(editor.getJSON()).toEqual({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Beta" }]
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Omega" }]
          }
        ]
      });
    });

    expect(screen.queryByRole("menu", { name: "Block actions for Text" })).toBeNull();
    expect(screen.queryByRole("menu", { name: "Turn into Text" })).toBeNull();
    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(editor.state.selection.$from.parentOffset).toBe(0);
    expect(undoDepth(editor.state)).toBe(undoDepthBefore + 1);

    await runAutosave();
    await waitFor(() => {
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
    });
    expect(onSaveDraft.mock.calls[0]?.[0].draftContentJson.document).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Beta" }]
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Omega" }]
        }
      ]
    });

    await act(async () => {
      editor.commands.undo();
    });
    expect(editor.getJSON()).toEqual(before);
    expect(undoDepth(editor.state)).toBe(undoDepthBefore);

    geometrySpy.mockRestore();
  });

  it("deletes a selected block with Backspace from the Turn into submenu and keeps the preceding block focused", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Omega" }]
        }
      ]
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28), new DOMRect(132, 108, 620, 28)]);
    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 120 });
    const handle = await screen.findByRole("button", { name: "Select block: Text" });

    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 120 }, { button: 0, buttons: 1 });
    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerup", { clientX: 160, clientY: 120 }, { button: 0, buttons: 0 });

    const menu = await screen.findByRole("menu", { name: "Block actions for Text" });
    fireEvent.keyDown(menu, { key: "ArrowRight" });

    const submenu = await screen.findByRole("menu", { name: "Turn into Text" });
    fireEvent.keyDown(submenu, { key: "Backspace" });

    await waitFor(() => {
      expect(editor.getJSON()).toEqual({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Alpha" }]
          }
        ]
      });
    });

    expect(screen.queryByRole("menu", { name: "Block actions for Text" })).toBeNull();
    expect(screen.queryByRole("menu", { name: "Turn into Text" })).toBeNull();
    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(editor.state.selection.$from.parentOffset).toBe(0);

    geometrySpy.mockRestore();
  });

  it("deletes the final selected block with Backspace and leaves one empty paragraph", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Solo" }]
        }
      ]
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 64 });
    const handle = await screen.findByRole("button", { name: "Select block: Text" });

    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 64 }, { button: 0, buttons: 1 });
    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerup", { clientX: 160, clientY: 64 }, { button: 0, buttons: 0 });

    const menu = await screen.findByRole("menu", { name: "Block actions for Text" });
    fireEvent.keyDown(menu, { key: "Backspace" });

    await waitFor(() => {
      expect(editor.getJSON()).toEqual({
        type: "doc",
        content: [{ type: "paragraph" }]
      });
    });

    expect(screen.queryByRole("menu", { name: "Block actions for Text" })).toBeNull();
    expect(screen.queryByRole("menu", { name: "Turn into Text" })).toBeNull();
    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(editor.state.selection.$from.parentOffset).toBe(0);

    geometrySpy.mockRestore();
  });

  it("deletes the preceding block before a blockquote and places the caret at the quote start", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        },
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Quoted" }]
            }
          ]
        }
      ]
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 52, 620, 28),
      new DOMRect(132, 108, 620, 28)
    ]);
    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 64 });
    const handle = await screen.findByRole("button", { name: "Select block: Text" });

    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 64 }, { button: 0, buttons: 1 });
    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerup", { clientX: 160, clientY: 64 }, { button: 0, buttons: 0 });

    const menu = await screen.findByRole("menu", { name: "Block actions for Text" });
    fireEvent.keyDown(menu, { key: "Backspace" });

    await waitFor(() => {
      expect(editor.getJSON()).toEqual({
        type: "doc",
        content: [
          {
            type: "blockquote",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Quoted" }]
              }
            ]
          }
        ]
      });
    });

    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.$from.node(1).type.name).toBe("blockquote");
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(editor.state.selection.$from.parentOffset).toBe(0);

    geometrySpy.mockRestore();
  });

  it("deletes the preceding block before a list and places the caret at the list start", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Item" }]
                }
              ]
            }
          ]
        }
      ]
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 52, 620, 28),
      new DOMRect(132, 108, 620, 28)
    ]);
    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 64 });
    const handle = await screen.findByRole("button", { name: "Select block: Text" });

    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 64 }, { button: 0, buttons: 1 });
    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerup", { clientX: 160, clientY: 64 }, { button: 0, buttons: 0 });

    const menu = await screen.findByRole("menu", { name: "Block actions for Text" });
    fireEvent.keyDown(menu, { key: "Backspace" });

    await waitFor(() => {
      expect(editor.getJSON()).toEqual({
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Item" }]
                  }
                ]
              }
            ]
          }
        ]
      });
    });

    expect(editor.state.selection).toBeInstanceOf(TextSelection);
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.$from.node(1).type.name).toBe("bulletList");
    expect(editor.state.selection.$from.node(2).type.name).toBe("listItem");
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(editor.state.selection.$from.parentOffset).toBe(0);

    geometrySpy.mockRestore();
  });

  it.each(["Delete", "Backspace"] as const)("leaves ordinary %s behavior unchanged when no whole-block selection exists", async (key) => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Alpha" }]
          }
        ]
      } as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await selectText(editor, 1, 6);
    expect(getSelectedBlockElement(editor)).toBeNull();

    fireEvent.keyDown(editor.view.dom, { key });

    expect(editor.getJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph"
        }
      ]
    });
    expect(getSelectedBlockElement(editor)).toBeNull();
    expect(screen.queryByRole("menu", { name: "Block actions for Text" })).toBeNull();
    expect(screen.queryByRole("menu", { name: "Turn into Text" })).toBeNull();
  });

  it("maps the transient selected block through document changes and clears it when the owner disappears", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Omega" }]
        }
      ]
    };
    const { editorReady, rerender, onAccessLost, onOutlineChange, onSaveDraft, onStatusChange, overlayRoot } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 52, 620, 28),
      new DOMRect(132, 108, 620, 28)
    ]);
    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 120 });
    const handle = await screen.findByRole("button", { name: "Select block: Text" });
    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 120 }, { button: 0, buttons: 1 });
    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerup", { clientX: 160, clientY: 120 }, { button: 0, buttons: 0 });

    expect(getSelectedBlockElement(editor)).toHaveTextContent("Omega");

    await act(async () => {
      editor.view.dispatch(
        editor.state.tr.insert(
          0,
          editor.schema.nodes.paragraph.create(null, editor.schema.text("Prelude"))
        )
      );
    });

    expect(getSelectedBlockElement(editor)).toHaveTextContent("Omega");

    let omegaFrom = 0;
    let omegaTo = 0;
    let foundOmega = false;
    editor.state.doc.forEach((node, pos) => {
      if (!foundOmega && node.isTextblock && node.textContent === "Omega") {
        omegaFrom = pos;
        omegaTo = pos + node.nodeSize;
        foundOmega = true;
      }
    });

    if (!foundOmega) {
      throw new Error("Expected to resolve the Omega block range.");
    }

    await act(async () => {
      editor.view.dispatch(editor.state.tr.delete(omegaFrom, omegaTo));
    });

    expect(getSelectedBlockElement(editor)).toBeNull();

    rerender(
      <PageEditorHostRuntime
        canEdit={false}
        initialEnvelope={createEnvelopeFromDocument(initial as DocseraTiptapDocument)}
        initialRevision={0}
        onAccessLost={onAccessLost}
        onOutlineChange={onOutlineChange}
        onSaveDraft={onSaveDraft}
        onEditorReady={(nextEditor) => {
          editorReady[0] = nextEditor;
        }}
        onStatusChange={onStatusChange}
        overlayRoot={overlayRoot}
        pageSysId="page-002"
        sessionKey="session-b"
        theme="light"
      />
    );

    expect(screen.queryByRole("button", { name: "Select block: Text" })).toBeNull();

    geometrySpy.mockRestore();
  });

  it("invalidates hover and selector state when the edit session identity changes", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        }
      ]
    };
    const { editorReady, onAccessLost, onOutlineChange, onSaveDraft, onStatusChange, overlayRoot, rerender } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument),
      pageSysId: "page-001",
      sessionKey: "session-a"
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    expect(await screen.findByRole("listbox", { name: "Insert block after Text" })).toBeInTheDocument();

    rerender(
      <PageEditorHostRuntime
        canEdit={true}
        initialEnvelope={createEnvelopeFromDocument(initial as DocseraTiptapDocument)}
        initialRevision={0}
        onAccessLost={onAccessLost}
        onOutlineChange={onOutlineChange}
        onSaveDraft={onSaveDraft}
        onEditorReady={(nextEditor) => {
          editorReady[0] = nextEditor;
        }}
        onStatusChange={onStatusChange}
        overlayRoot={overlayRoot}
        pageSysId="page-002"
        sessionKey="session-b"
        theme="light"
      />
    );

    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: "Insert block after Text" })).toBeNull();
      expect(screen.queryByRole("button", { name: "Add block after Text" })).toBeNull();
    });

    geometrySpy.mockRestore();
  });

  it("ignores stale upload completions after the editor session changes", async () => {
    const uploadDeferred = createDeferred<{
      contentType: string;
      fileName: string;
      mediaId: string;
      sizeBytes: number;
    }>();
    const mediaAdapter: EditorMediaAdapter = {
      list: vi.fn(async () => [
        {
          contentType: "image/png",
          fileName: "source.png",
          mediaId: "workspace-media-001",
          sizeBytes: 1024
        }
      ]),
      load: vi.fn(async ({ mediaId }) =>
        mediaId === "workspace-media-base" ||
        mediaId === "workspace-media-001" ||
        mediaId === "workspace-media-999"
          ? createMediaBlob(mediaId)
          : null
      ),
      upload: vi.fn(() => uploadDeferred.promise)
    };
    const initial = {
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            mediaId: "workspace-media-base",
            darkMediaId: null,
            alt: "",
            caption: "",
            frame: false,
            align: "center",
            widthPct: 100
          }
        }
      ]
    };
    const { editorReady, rerender, onAccessLost, onOutlineChange, onSaveDraft, onStatusChange, overlayRoot } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument),
      mediaAdapter,
      sessionKey: "session-a"
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    await openImageOptions(editor, { clientX: 720, clientY: 60 });
    const panel = await screen.findByRole("dialog", { name: "Image Options" });
    fireEvent.click(within(panel).getAllByRole("button", { name: "Upload" })[0]);

    const dialog = await screen.findByRole("dialog", { name: "Select image" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload image" }));

    const fileInput = dialog.querySelector("input[type='file']");
    if (!(fileInput instanceof HTMLInputElement)) {
      throw new Error("Expected the picker file input to be available.");
    }

    fireEvent.change(fileInput, {
      target: {
        files: [new File([new Uint8Array([1, 2, 3])], "session.png", { type: "image/png" })]
      }
    });

    await waitFor(() => {
      expect(within(dialog).getByLabelText("Image file name")).toHaveValue("session.png");
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "Upload image" }));

    rerender(
      <PageEditorHostRuntime
        canEdit={true}
        initialEnvelope={createEmptyDocseraDocumentEnvelope()}
        initialRevision={0}
        onAccessLost={onAccessLost}
        onOutlineChange={onOutlineChange}
        onSaveDraft={onSaveDraft}
        onEditorReady={() => undefined}
        onStatusChange={onStatusChange}
        overlayRoot={overlayRoot}
        pageSysId="page-001"
        sessionKey="session-b"
        theme="light"
      />
    );
    await act(async () => {
      uploadDeferred.resolve({
        contentType: "image/png",
        fileName: "session.png",
        mediaId: "workspace-media-999",
        sizeBytes: 1024
      });
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Select image" })).toBeNull();
    });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Image Options" })).toBeNull();
    });
    expect(editor.getJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            alt: "",
            align: "center",
            caption: "",
            darkMediaId: null,
            frame: false,
            mediaId: "workspace-media-base",
            widthPct: 100
          }
        }
      ]
    });
    geometrySpy.mockRestore();
  });

  it.each([
    ["Text", { type: "doc", content: [{ type: "paragraph" }] }],
    ["Heading 1", { type: "doc", content: [{ type: "heading", attrs: { level: 1 } }] }],
    ["Heading 2", { type: "doc", content: [{ type: "heading", attrs: { level: 2 } }] }],
    ["Heading 3", { type: "doc", content: [{ type: "heading", attrs: { level: 3 } }] }],
    ["Bulleted List", { type: "doc", content: [{ type: "bulletList" }] }],
    ["Numbered List", { type: "doc", content: [{ type: "orderedList" }] }],
    [
      "Accordion",
      {
        type: "doc",
        content: [
          {
            type: "accordion",
            attrs: {
              accordionId: expect.stringMatching(/^accordion-/)
            },
            content: [
              {
                type: "accordionItem",
                attrs: {
                  accordionItemId: expect.stringMatching(/^accordion-item-/)
                },
                content: [
                  {
                    type: "accordionTitle"
                  },
                  {
                    type: "accordionContent",
                    content: [{ type: "paragraph" }]
                  }
                ]
              }
            ]
          }
        ]
      }
    ],
    ["Blockquote", { type: "doc", content: [{ type: "blockquote" }] }],
    [
      "Horizontal Rule",
      {
        type: "doc",
        content: [
          { type: "horizontalRule" },
          { type: "paragraph" }
        ]
      }
    ],
    ["Code Block", { type: "doc", content: [{ type: "codeBlock" }] }]
  ])("produces canonical JSON for slash command %s", async (label, expected) => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor);

    fireEvent.click(await screen.findByRole("option", { name: new RegExp(label, "i") }));
    expect(editor.getJSON()).toMatchObject(expected);
    if (label === "Horizontal Rule") {
      expect(editor.getJSON().content?.[1]).toMatchObject(expected.content[1]);
    }
  });

  it("replaces the owner paragraph with a canonical accordion and leaves no ghost paragraph when inserted from Slash", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];

    await openSlashQuery(editor);
    fireEvent.click(await screen.findByRole("option", { name: /Accordion/ }));

    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [
        {
          type: "accordion",
          attrs: {
            accordionId: expect.stringMatching(/^accordion-/)
          },
          content: [
            {
              type: "accordionItem",
              attrs: {
                accordionItemId: expect.stringMatching(/^accordion-item-/)
              },
              content: [
                {
                  type: "accordionTitle"
                },
                {
                  type: "accordionContent",
                  content: [{ type: "paragraph" }]
                }
              ]
            }
          ]
        }
      ]
    });
    expect(editor.getJSON().content).toHaveLength(1);
  });

  it("treats the accordion title placeholder as presentation only", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "accordion",
          attrs: {
            accordionId: "accordion-placeholder"
          },
          content: [
            {
              type: "accordionItem",
              attrs: {
                accordionItemId: "accordion-item-placeholder"
              },
              content: [
                {
                  type: "accordionTitle"
                },
                {
                  type: "accordionContent",
                  content: [
                    {
                      type: "paragraph"
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const title = editor.view.dom.querySelector("[data-docsera-accordion-title='true']");
    if (!(title instanceof HTMLElement)) {
      throw new Error("Expected the accordion title element to be present.");
    }

    expect(title).toHaveAttribute("data-placeholder", "New accordion");
    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [
        {
          type: "accordion",
          content: [
            {
              type: "accordionItem",
              content: [
                {
                  type: "accordionTitle"
                },
                {
                  type: "accordionContent",
                  content: [
                    {
                      type: "paragraph"
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    });
  });

  it("creates the same 3 x 3 no-header table through Slash and Quick Add with focus in the first cell", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor, "table");
    await activateCommandOptionWithBrowserPointer(editor, await screen.findByRole("option", { name: /Table/ }));

    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();
    });
    expectCanonicalDocument(editor, {
      type: "doc",
      content: [createCanonicalDefaultTableNode()]
    });
    expect(editor.state.selection.from).toBe(getFirstTableCellParagraphPosition(editor) + 1);
    expect(editor.view.dom.children).toHaveLength(1);

    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [{ type: "paragraph" }]
      });
    });

    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    const quickAddMenu = await screen.findByRole("listbox", { name: "Insert block after Text" });
    await activateCommandOptionWithBrowserPointer(editor, within(quickAddMenu).getByRole("option", { name: /Table/ }));

    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: "Insert block after Text" })).toBeNull();
    });
    expectCanonicalDocument(editor, {
      type: "doc",
      content: [{ type: "paragraph" }, createCanonicalDefaultTableNode()]
    });
    expect(editor.state.selection.from).toBe(getFirstTableCellParagraphPosition(editor) + 1);
    expect(editor.view.dom.children).toHaveLength(2);
    const quickAddPointerJson = editor.getJSON();

    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [{ type: "paragraph" }]
      });
    });

    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    for (const character of "table") {
      fireEvent.keyDown(editor.view.dom, { key: character });
    }
    const quickAddKeyboardMenu = await screen.findByRole("listbox", { name: "Insert block after Text" });
    expect(within(quickAddKeyboardMenu).getByRole("option", { name: /Table/ })).toBeInTheDocument();
    fireEvent.keyDown(editor.view.dom, { key: "Enter" });

    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: "Insert block after Text" })).toBeNull();
    });
    expectCanonicalDocument(editor, {
      type: "doc",
      content: [{ type: "paragraph" }, createCanonicalDefaultTableNode()]
    });
    expect(editor.state.selection.from).toBe(getFirstTableCellParagraphPosition(editor) + 1);
    expect(editor.getJSON()).toEqual(quickAddPointerJson);

    geometrySpy.mockRestore();
  });

  it("hides the table overlay outside a table and reveals the rails inside a table", async () => {
    const { editorReady, overlayRoot } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Outside table" }]
          }
        ]
      });
    });

    const overlay = getTableOverlayRoot(overlayRoot);
    expect(overlay).toBeInstanceOf(HTMLElement);
    expect(getTableRailButton(overlayRoot, "column")).toBeNull();
    expect(getTableRailButton(overlayRoot, "row")).toBeNull();

    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [createCanonicalDefaultTableNode()]
      });
    });

    await waitFor(() => {
      expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
    });

    const geometry = mockTableGeometry(editor, {
      tableRect: new DOMRect(120, 140, 420, 160),
      wrapperClientHeight: 180,
      wrapperClientWidth: 420,
      wrapperOffsetHeight: 192,
      wrapperOffsetWidth: 460,
      wrapperRect: new DOMRect(100, 120, 460, 200),
      wrapperScrollWidth: 520
    });

    try {
      await act(async () => {
        editor.commands.setTextSelection(getFirstTableCellParagraphPosition(editor) + 1);
      });

      await waitFor(() => {
        expect(getTableRailButton(overlayRoot, "column")).toBeInstanceOf(HTMLButtonElement);
        expect(getTableRailButton(overlayRoot, "row")).toBeInstanceOf(HTMLButtonElement);
      });

      expect(getTableOverlayRoot(overlayRoot)).toHaveAttribute("data-docsera-table-overflow-x", "true");
    } finally {
      geometry.restore();
    }
  });

  it("keeps the column rail beside the actual narrow table edge without reserving page space", async () => {
    const { editorReady, overlayRoot } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [createTextTableNode([["R1C1", "R1C2"], ["R2C1", "R2C2"]])]
      });
    });

    const wrapper = getTableWrapperElement(editor);
    if (!(wrapper instanceof HTMLElement)) {
      throw new Error("Expected the table wrapper to be available.");
    }

    await waitFor(() => {
      expect(wrapper).toBeInstanceOf(HTMLElement);
    });

    const ownerWindow = editor.view.dom.ownerDocument.defaultView;
    if (!ownerWindow) {
      throw new Error("Expected the editor owner window to be available.");
    }

    const geometry = mockTableGeometry(editor, {
      editorSurfaceRect: new DOMRect(24, 32, 640, 680),
      tableRect: new DOMRect(120, 140, 220, 120),
      wrapperClientHeight: 180,
      wrapperClientWidth: 360,
      wrapperOffsetHeight: 192,
      wrapperOffsetWidth: 360,
      wrapperRect: new DOMRect(100, 120, 360, 200),
      wrapperScrollWidth: 360
    });

    try {
      await act(async () => {
        editor.commands.setTextSelection(getTableCellParagraphPosition(editor, 0) + 1);
      });

      await waitFor(() => {
        expect(getTableRailButton(overlayRoot, "column")).toBeInstanceOf(HTMLButtonElement);
        expect(getTableRailButton(overlayRoot, "row")).toBeInstanceOf(HTMLButtonElement);
      });

      const columnRail = getTableRailButton(overlayRoot, "column");
      const rowRail = getTableRailButton(overlayRoot, "row");
      if (!(columnRail instanceof HTMLButtonElement) || !(rowRail instanceof HTMLButtonElement)) {
        throw new Error("Expected both table rails to be available.");
      }

      const columnRailBox = readInlineBox(columnRail.parentElement as HTMLElement);
      const rowRailBox = readInlineBox(rowRail.parentElement as HTMLElement);

      expect(getTableOverlayRoot(overlayRoot)).toHaveAttribute("data-docsera-table-overflow-x", "false");
      expect(columnRailBox.left).toBe(340);
      expect(columnRailBox.right).toBe(362);
      expect(rowRailBox.left).toBe(120);
      expect(rowRailBox.right).toBe(340);
    } finally {
      geometry.restore();
    }
  });

  it("keeps the bottom rail at the same screen position as horizontal overflow appears and disappears", async () => {
    const { editorReady, overlayRoot } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [createTextTableNode([["R1C1", "R1C2"], ["R2C1", "R2C2"]])]
      });
    });

    const wrapper = getTableWrapperElement(editor);
    if (!(wrapper instanceof HTMLElement)) {
      throw new Error("Expected the table wrapper to be available.");
    }

    await waitFor(() => {
      expect(wrapper).toBeInstanceOf(HTMLElement);
    });

    const geometry = mockTableGeometry(editor, {
      editorSurfaceRect: new DOMRect(24, 32, 640, 680),
      tableRect: new DOMRect(120, 140, 220, 120),
      wrapperClientHeight: 180,
      wrapperClientWidth: 360,
      wrapperOffsetHeight: 192,
      wrapperOffsetWidth: 360,
      wrapperRect: new DOMRect(100, 120, 360, 200),
      wrapperScrollWidth: 360
    });

    try {
      await act(async () => {
        editor.commands.setTextSelection(getTableCellParagraphPosition(editor, 0) + 1);
      });

      await waitFor(() => {
        expect(getTableRailButton(overlayRoot, "column")).toBeInstanceOf(HTMLButtonElement);
      });

      const columnRail = getTableRailButton(overlayRoot, "column");
      const rowRail = getTableRailButton(overlayRoot, "row");
      if (!(columnRail instanceof HTMLButtonElement) || !(rowRail instanceof HTMLButtonElement)) {
        throw new Error("Expected both table rails to be available.");
      }

      const initialColumnRailBox = readInlineBox(columnRail.parentElement as HTMLElement);
      const initialRowRailBox = readInlineBox(rowRail.parentElement as HTMLElement);
      expect(wrapper.clientWidth).toBe(360);
      expect(wrapper.scrollWidth).toBe(360);
      expect(getComputedStyle(wrapper).overflowY).toBe("visible");
      expect(getTableOverlayRoot(overlayRoot)).toHaveAttribute("data-docsera-table-overflow-x", "false");

      const ownerWindow = editor.view.dom.ownerDocument.defaultView;
      if (!ownerWindow) {
        throw new Error("Expected the editor owner window to be available.");
      }

      geometry.setLayoutRects({
        tableRect: new DOMRect(120, 140, 760, 120),
        wrapperClientHeight: 192,
        wrapperOffsetHeight: 204,
        wrapperRect: new DOMRect(100, 120, 360, 212),
        wrapperScrollWidth: 806
      });

      await act(async () => {
        ownerWindow.dispatchEvent(new Event("resize"));
      });

      await waitFor(() => {
        const updatedColumnRailBox = readInlineBox(columnRail.parentElement as HTMLElement);
        const updatedRowRailBox = readInlineBox(rowRail.parentElement as HTMLElement);
        expect(updatedColumnRailBox.left).toBeGreaterThan(initialColumnRailBox.left);
        expect(updatedRowRailBox.top).toBe(initialRowRailBox.top);
        expect(updatedRowRailBox.bottom).toBe(initialRowRailBox.bottom);
        expect(updatedRowRailBox.left).toBe(initialRowRailBox.left);
        expect(updatedRowRailBox.right).toBeGreaterThan(initialRowRailBox.right);
        expect(wrapper.clientWidth).toBe(360);
        expect(wrapper.scrollWidth).toBe(806);
        expect(getComputedStyle(wrapper).overflowY).toBe("visible");
        expect(getTableOverlayRoot(overlayRoot)).toHaveAttribute("data-docsera-table-overflow-x", "true");
      });

      geometry.setLayoutRects({
        tableRect: new DOMRect(120, 140, 220, 120),
        wrapperClientHeight: 180,
        wrapperOffsetHeight: 192,
        wrapperRect: new DOMRect(100, 120, 360, 200),
        wrapperScrollWidth: 360
      });

      await act(async () => {
        ownerWindow.dispatchEvent(new Event("resize"));
      });

      await waitFor(() => {
        const restoredColumnRailBox = readInlineBox(columnRail.parentElement as HTMLElement);
        const restoredRowRailBox = readInlineBox(rowRail.parentElement as HTMLElement);
        expect(restoredColumnRailBox.left).toBe(initialColumnRailBox.left);
        expect(restoredColumnRailBox.right).toBe(initialColumnRailBox.right);
        expect(restoredRowRailBox.top).toBe(initialRowRailBox.top);
        expect(restoredRowRailBox.bottom).toBe(initialRowRailBox.bottom);
        expect(restoredRowRailBox.left).toBe(initialRowRailBox.left);
        expect(restoredRowRailBox.right).toBe(initialRowRailBox.right);
        expect(wrapper.clientWidth).toBe(360);
        expect(wrapper.scrollWidth).toBe(360);
        expect(getComputedStyle(wrapper).overflowY).toBe("visible");
        expect(getTableOverlayRoot(overlayRoot)).toHaveAttribute("data-docsera-table-overflow-x", "false");
      });
    } finally {
      geometry.restore();
    }
  });

  it("keeps the Add Column rail pinned to the visible edge as horizontal scroll changes", async () => {
    const { editorReady, overlayRoot } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [createTextTableNode([["R1C1", "R1C2"], ["R2C1", "R2C2"]])]
      });
    });

    const wrapper = getTableWrapperElement(editor);
    if (!(wrapper instanceof HTMLElement)) {
      throw new Error("Expected the table wrapper to be available.");
    }

    await waitFor(() => {
      expect(wrapper).toBeInstanceOf(HTMLElement);
    });

    const geometry = mockTableGeometry(editor, {
      editorSurfaceRect: new DOMRect(24, 32, 1180, 680),
      tableRect: new DOMRect(120, 140, 760, 120),
      wrapperClientHeight: 180,
      wrapperClientWidth: 360,
      wrapperOffsetHeight: 192,
      wrapperOffsetWidth: 360,
      wrapperRect: new DOMRect(100, 120, 360, 200),
      wrapperScrollWidth: 806
    });

    const ownerWindow = editor.view.dom.ownerDocument.defaultView;
    if (!ownerWindow) {
      throw new Error("Expected the editor owner window to be available.");
    }

    try {
      await act(async () => {
        editor.commands.setTextSelection(getTableCellParagraphPosition(editor, 0) + 1);
      });

      await waitFor(() => {
        expect(getTableRailButton(overlayRoot, "column")).toBeInstanceOf(HTMLButtonElement);
      });

      const columnRail = getTableRailButton(overlayRoot, "column");
      const rowRail = getTableRailButton(overlayRoot, "row");
      if (!(columnRail instanceof HTMLButtonElement) || !(rowRail instanceof HTMLButtonElement)) {
        throw new Error("Expected both table rails to be available.");
      }

      const initialColumnRailBox = readInlineBox(columnRail.parentElement as HTMLElement);
      const initialRowRailBox = readInlineBox(rowRail.parentElement as HTMLElement);
      expect(getTableOverlayRoot(overlayRoot)).toHaveAttribute("data-docsera-table-overflow-x", "true");
      expect(initialColumnRailBox.left).toBe(460);
      expect(initialColumnRailBox.right).toBe(482);
      expect(initialColumnRailBox.height).toBe(120);
      expect(initialRowRailBox.left).toBe(120);
      expect(initialRowRailBox.right).toBe(460);
      expect(initialRowRailBox.height).toBe(22);

      geometry.setLayoutRects({
        tableRect: new DOMRect(-326, 140, 760, 160),
        wrapperScrollLeft: 446
      });

      await act(async () => {
        overlayRoot.ownerDocument.dispatchEvent(new Event("scroll"));
      });

      await waitFor(() => {
        const revealedColumnRail = getTableRailButton(overlayRoot, "column");
        const revealedRowRail = getTableRailButton(overlayRoot, "row");
        if (!(revealedColumnRail instanceof HTMLButtonElement) || !(revealedRowRail instanceof HTMLButtonElement)) {
          throw new Error("Expected both table rails to remain available.");
        }
        const revealedColumnRailBox = readInlineBox(revealedColumnRail.parentElement as HTMLElement);
        const revealedRowRailBox = readInlineBox(revealedRowRail.parentElement as HTMLElement);
        expect(revealedColumnRailBox.left).toBe(434);
        expect(revealedColumnRailBox.right).toBe(456);
        expect(revealedColumnRailBox.height).toBe(160);
        expect(revealedRowRailBox.height).toBe(22);
        expect(revealedRowRailBox.right).toBe(434);
      });
    } finally {
      geometry.restore();
    }
  });

  it.each([
    ["light", "rgb(70, 72, 212)"],
    ["dark", "rgb(124, 131, 250)"]
  ] as const)("uses the accepted rail hover color in %s mode", async (theme, primaryColor) => {
    const { editorReady, overlayRoot } = renderRuntime({ theme });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [createCanonicalDefaultTableNode()]
      });
    });

    await waitFor(() => {
      expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
    });

    const geometry = mockTableGeometry(editor, {
      tableRect: new DOMRect(120, 140, 420, 180),
      wrapperClientHeight: 180,
      wrapperClientWidth: 420,
      wrapperOffsetHeight: 192,
      wrapperOffsetWidth: 460,
      wrapperRect: new DOMRect(100, 120, 460, 220),
      wrapperScrollWidth: 520
    });

    try {
      await act(async () => {
        editor.commands.setTextSelection(getFirstTableCellParagraphPosition(editor) + 1);
      });

      await waitFor(() => {
        expect(getTableRailButton(overlayRoot, "row")).toBeInstanceOf(HTMLButtonElement);
        expect(getTableRailButton(overlayRoot, "column")).toBeInstanceOf(HTMLButtonElement);
      });

      const rowRail = getTableRailButton(overlayRoot, "row");
      const columnRail = getTableRailButton(overlayRoot, "column");
      const rowRailIcon = getTableRailIcon(overlayRoot, "row");
      const columnRailIcon = getTableRailIcon(overlayRoot, "column");
      if (
        !(rowRail instanceof HTMLButtonElement) ||
        !(columnRail instanceof HTMLButtonElement) ||
        !(rowRailIcon instanceof HTMLElement) ||
        !(columnRailIcon instanceof HTMLElement)
      ) {
        throw new Error("Expected both table rail icons to be available.");
      }

      const initialRowIconColor = getComputedStyle(rowRailIcon).color;
      const initialColumnIconColor = getComputedStyle(columnRailIcon).color;
      expect(initialRowIconColor).toBe(initialColumnIconColor);
      expect(initialRowIconColor).not.toBe(primaryColor);

      fireEvent.mouseEnter(rowRail);
      await waitFor(() => {
        expect(getComputedStyle(rowRailIcon).color).toBe(primaryColor);
        expect(getComputedStyle(columnRailIcon).color).toBe(initialColumnIconColor);
      });

      fireEvent.mouseLeave(rowRail);
      await waitFor(() => {
        expect(getComputedStyle(rowRailIcon).color).toBe(initialRowIconColor);
      });

      fireEvent.mouseEnter(columnRail);
      await waitFor(() => {
        expect(getComputedStyle(columnRailIcon).color).toBe(primaryColor);
        expect(getComputedStyle(rowRailIcon).color).toBe(initialRowIconColor);
      });

      fireEvent.mouseLeave(columnRail);
      await waitFor(() => {
        expect(getComputedStyle(columnRailIcon).color).toBe(initialColumnIconColor);
      });
    } finally {
      geometry.restore();
    }
  });

  it("centers compact row and column pills on the table borders and expands them in place on hover", async () => {
    const { editorReady, overlayRoot } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [createCanonicalDefaultTableNode()]
      });
    });

    await waitFor(() => {
      expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
    });

    const geometry = mockTableGeometry(editor, {
      tableRect: new DOMRect(120, 140, 420, 180),
      cellRectLeftOffset: 3,
      rowRectTopOffset: 3,
      wrapperClientHeight: 180,
      wrapperClientWidth: 420,
      wrapperOffsetHeight: 192,
      wrapperOffsetWidth: 460,
      wrapperRect: new DOMRect(100, 120, 460, 220),
      wrapperScrollWidth: 520
    });

    let firstRowFirstCell: HTMLTableCellElement | null = null;
    let previousBorderLeftWidth = "";
    let previousBorderTopWidth = "";
    try {
      const table = getTableElement(editor);
      if (!(table instanceof HTMLTableElement)) {
        throw new Error("Expected the table element to be available.");
      }

      firstRowFirstCell = table.querySelector("tr:first-child > th, tr:first-child > td");
      if (!(firstRowFirstCell instanceof HTMLTableCellElement)) {
        throw new Error("Expected the first table cell to be available.");
      }

      previousBorderLeftWidth = firstRowFirstCell.style.borderLeftWidth;
      previousBorderTopWidth = firstRowFirstCell.style.borderTopWidth;
      firstRowFirstCell.style.borderLeftWidth = "3px";
      firstRowFirstCell.style.borderTopWidth = "5px";

      await act(async () => {
        editor.commands.setTextSelection(getFirstTableCellParagraphPosition(editor) + 1);
      });

      await waitFor(() => {
        expect(getTableHandleButton(overlayRoot, "row", 0)).toBeInstanceOf(HTMLButtonElement);
        expect(getTableHandleButton(overlayRoot, "column", 0)).toBeInstanceOf(HTMLButtonElement);
      });

      const rowButton = getTableHandleButton(overlayRoot, "row", 0);
      const columnButton = getTableHandleButton(overlayRoot, "column", 0);
      const rowShell = getTableHandleShell(overlayRoot, "row", 0);
      const columnShell = getTableHandleShell(overlayRoot, "column", 0);
      const rowEllipsisLayer = getTableHandleEllipsisLayer(overlayRoot, "row", 0);
      const columnEllipsisLayer = getTableHandleEllipsisLayer(overlayRoot, "column", 0);
      const rowRail = getTableRailButton(overlayRoot, "row");
      const columnRail = getTableRailButton(overlayRoot, "column");
      if (
        !(rowButton instanceof HTMLButtonElement) ||
        !(columnButton instanceof HTMLButtonElement) ||
        !(rowShell instanceof HTMLElement) ||
        !(columnShell instanceof HTMLElement) ||
        !(rowEllipsisLayer instanceof HTMLElement) ||
        !(columnEllipsisLayer instanceof HTMLElement) ||
        !(rowRail instanceof HTMLButtonElement) ||
        !(columnRail instanceof HTMLButtonElement)
      ) {
        throw new Error("Expected both table pills to be available.");
      }

      if (rowShell.parentElement !== rowButton || columnShell.parentElement !== columnButton) {
        throw new Error("Expected the shell layers to be direct children of their buttons.");
      }
      if (rowEllipsisLayer.parentElement !== rowButton || columnEllipsisLayer.parentElement !== columnButton) {
        throw new Error("Expected the ellipsis layers to be direct children of their buttons.");
      }
      if (rowShell.contains(rowEllipsisLayer) || columnShell.contains(columnEllipsisLayer)) {
        throw new Error("Expected the ellipsis layers to be siblings of the animated shells.");
      }

      const rowEllipsisSvg = rowEllipsisLayer.querySelector("svg");
      const columnEllipsisSvg = columnEllipsisLayer.querySelector("svg");
      if (!(rowEllipsisSvg instanceof SVGElement) || !(columnEllipsisSvg instanceof SVGElement)) {
        throw new Error("Expected pill icons to be available.");
      }

      const rowButtonBox = readInlineBox(rowButton);
      const columnButtonBox = readInlineBox(columnButton);
      const firstCellRect = firstRowFirstCell.getBoundingClientRect();
      const computedCellStyle = getComputedStyle(firstRowFirstCell);
      const renderedLeftBorderWidth = Number.parseFloat(computedCellStyle.borderLeftWidth);
      const renderedTopBorderWidth = Number.parseFloat(computedCellStyle.borderTopWidth);
      expect(rowButtonBox).toMatchObject({
        left: 111.5,
        top: 152,
        width: 26,
        height: 42
      });
      expect(columnButtonBox).toMatchObject({
        left: 172,
        top: 132.5,
        width: 42,
        height: 26
      });
      expect(rowButtonBox.left + rowButtonBox.width / 2).toBeCloseTo(firstCellRect.left + renderedLeftBorderWidth / 2, 5);
      expect(rowButtonBox.top + rowButtonBox.height / 2).toBe(173);
      expect(columnButtonBox.left + columnButtonBox.width / 2).toBe(193);
      expect(columnButtonBox.top + columnButtonBox.height / 2).toBeCloseTo(firstCellRect.top + renderedTopBorderWidth / 2, 5);
      expect(rowEllipsisLayer.style.position).toBe("");
      expect(columnEllipsisLayer.style.position).toBe("");
      expect(getComputedStyle(rowEllipsisLayer).display).toBe("grid");
      expect(getComputedStyle(columnEllipsisLayer).display).toBe("grid");
      expect(getComputedStyle(rowEllipsisLayer).pointerEvents).toBe("none");
      expect(getComputedStyle(columnEllipsisLayer).pointerEvents).toBe("none");
      expect(getComputedStyle(rowEllipsisLayer).width).toBe("12px");
      expect(getComputedStyle(rowEllipsisLayer).height).toBe("12px");
      expect(getComputedStyle(columnEllipsisLayer).width).toBe("12px");
      expect(getComputedStyle(columnEllipsisLayer).height).toBe("12px");
      expect(getComputedStyle(rowShell).zIndex).toBe("0");
      expect(getComputedStyle(columnShell).zIndex).toBe("0");
      expect(getComputedStyle(rowEllipsisLayer).zIndex).toBe("1");
      expect(getComputedStyle(columnEllipsisLayer).zIndex).toBe("1");
      expect(getComputedStyle(rowShell).height).toBe("18px");
      expect(getComputedStyle(rowShell).width).toBe("8px");
      expect(getComputedStyle(columnShell).height).toBe("8px");
      expect(getComputedStyle(columnShell).width).toBe("18px");
      expect(rowShell.style.transition).toContain("height");
      expect(columnShell.style.transition).toContain("width");
      expect(getComputedStyle(rowButton).display).toBe("grid");
      expect(getComputedStyle(columnButton).display).toBe("grid");
      expect(getComputedStyle(rowRail).cursor).toBe("row-resize");
      expect(getComputedStyle(columnRail).cursor).toBe("col-resize");
      expect(rowEllipsisLayer.style.opacity).toBe("");
      expect(columnEllipsisLayer.style.opacity).toBe("");
      expect(getComputedStyle(rowEllipsisLayer).opacity).toBe("0");
      expect(getComputedStyle(columnEllipsisLayer).opacity).toBe("0");

      fireEvent.mouseEnter(rowButton);
      await waitFor(() => {
        const hoveredRowShell = getTableHandleShell(overlayRoot, "row", 0);
        const hoveredRowEllipsisLayer = getTableHandleEllipsisLayer(overlayRoot, "row", 0);
        if (!(hoveredRowShell instanceof HTMLElement)) {
          throw new Error("Expected the hovered row pill to remain available.");
        }
        if (!(hoveredRowEllipsisLayer instanceof HTMLElement)) {
          throw new Error("Expected the row ellipsis layer to remain available.");
        }
        expect(getComputedStyle(hoveredRowShell).height).toBe("28px");
        expect(getComputedStyle(hoveredRowShell).width).toBe("8px");
        expect(readInlineBox(rowButton)).toMatchObject(rowButtonBox);
        expect(getComputedStyle(hoveredRowEllipsisLayer).width).toBe("12px");
        expect(getComputedStyle(hoveredRowEllipsisLayer).height).toBe("12px");
        expect(hoveredRowEllipsisLayer.style.position).toBe("");
        expect(getComputedStyle(hoveredRowEllipsisLayer).display).toBe("grid");
        expect(hoveredRowEllipsisLayer.style.opacity).toBe("");
        expect(getComputedStyle(hoveredRowEllipsisLayer).opacity).toBe("1");
      });

      fireEvent.mouseLeave(rowButton);
      fireEvent.mouseEnter(columnButton);
      await waitFor(() => {
        const hoveredColumnShell = getTableHandleShell(overlayRoot, "column", 0);
        const hoveredColumnEllipsisLayer = getTableHandleEllipsisLayer(overlayRoot, "column", 0);
        if (!(hoveredColumnShell instanceof HTMLElement)) {
          throw new Error("Expected the hovered column pill to remain available.");
        }
        if (!(hoveredColumnEllipsisLayer instanceof HTMLElement)) {
          throw new Error("Expected the column ellipsis layer to remain available.");
        }
        expect(getComputedStyle(hoveredColumnShell).height).toBe("8px");
        expect(getComputedStyle(hoveredColumnShell).width).toBe("28px");
        expect(readInlineBox(columnButton)).toMatchObject(columnButtonBox);
        expect(getComputedStyle(hoveredColumnEllipsisLayer).width).toBe("12px");
        expect(getComputedStyle(hoveredColumnEllipsisLayer).height).toBe("12px");
        expect(hoveredColumnEllipsisLayer.style.position).toBe("");
        expect(getComputedStyle(hoveredColumnEllipsisLayer).display).toBe("grid");
        expect(hoveredColumnEllipsisLayer.style.opacity).toBe("");
        expect(getComputedStyle(hoveredColumnEllipsisLayer).opacity).toBe("1");
      });
    } finally {
      if (firstRowFirstCell) {
        firstRowFirstCell.style.borderLeftWidth = previousBorderLeftWidth;
        firstRowFirstCell.style.borderTopWidth = previousBorderTopWidth;
      }
      geometry.restore();
    }
  });

  it("keeps table-control chrome on current Docsera tokens and off legacy utility-only assumptions", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/editor/TableControlsOverlay.tsx`,
      "utf8"
    );
    const runtimeSource = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/editor/PageEditorHostRuntime.tsx`,
      "utf8"
    );
    const runtimeShellSource = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    );
    const imageStylesSource = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/editor/ImageOptionsStyles.ts`,
      "utf8"
    );

    expect(source).toContain("docsera-table-controls-overlay__pill-shell");
    expect(source).toContain("docsera-table-controls-overlay__pill-icon");
    expect(source).toContain("docsera-table-controls-overlay__rail");
    expect(source).toContain("docsera-table-controls-overlay__rail-button");
    expect(source).not.toContain("docsera-table-controls-overlay__resize-badge");
    expect(source).not.toContain("data-docsera-table-resize-badge");
    expect(source).toContain("data-docsera-table-rail-cursor-lock");
    expect(source).toContain(".docsera-table-controls-overlay__pill:hover .docsera-table-controls-overlay__pill-icon");
    expect(source).toContain(
      ".docsera-table-controls-overlay__pill[data-docsera-table-handle-expanded=\"true\"] .docsera-table-controls-overlay__pill-icon"
    );
    expect(source).toContain(".docsera-table-controls-overlay__pill:focus-visible .docsera-table-controls-overlay__pill-icon");
    expect(source).toContain(".docsera-table-controls-overlay__pill[data-docsera-table-handle-kind=\"row\"] .docsera-table-controls-overlay__pill-shell");
    expect(source).toContain(
      ".docsera-table-controls-overlay__pill[data-docsera-table-handle-kind=\"row\"][data-docsera-table-handle-expanded=\"true\"] .docsera-table-controls-overlay__pill-shell"
    );
    expect(source).toContain(".docsera-table-controls-overlay__pill[data-docsera-table-handle-kind=\"column\"] .docsera-table-controls-overlay__pill-shell");
    expect(source).toContain(
      ".docsera-table-controls-overlay__pill[data-docsera-table-handle-kind=\"column\"][data-docsera-table-handle-expanded=\"true\"] .docsera-table-controls-overlay__pill-shell"
    );
    expect(source).toContain("var(--docsera-table-control-primary)");
    expect(source).toContain("@media (prefers-reduced-motion: reduce)");
    expect(source).toContain("transition: none;");
    expect(source).toContain("display: grid;");
    expect(source).toContain("place-items: center;");
    expect(source).toContain("position: relative;");
    expect(source).toContain("z-index: 0;");
    expect(source).toContain("z-index: 1;");
    expect(source).toContain("pointer-events: none;");
    expect(source).toContain("cursor: pointer;");
    expect(source).toContain("grid-area: 1 / 1;");
    expect(source).toContain("var(--docsera-editor-panel-border)");
    expect(source).toContain("var(--docsera-editor-panel)");
    expect(source).toContain("var(--docsera-editor-muted)");
    expect(source).toContain("var(--docsera-editor-primary)");
    expect(source).toContain("var(--docsera-error)");
    expect(source).toContain("resolveTableControlActiveIconColor(editor)");
    expect(source).toContain("#ffffff");
    expect(source).not.toContain("resizeIndicatorState.columnCount");
    expect(source).not.toContain("resizeIndicatorState.rowCount");
    expect(runtimeSource).toContain("--docsera-table-control-primary: #4648D4");
    expect(runtimeSource).toContain("--docsera-table-control-primary: #7C83FA");
    expect(runtimeSource).toContain("--docsera-table-control-active-icon: var(--docsera-editor-panel);");
    expect(runtimeSource).toContain("--docsera-table-control-active-icon: #ffffff;");
    expect(runtimeSource).toContain("const IMAGE_OPTIONS_PANEL_WIDTH = 372;");
    expect(runtimeSource).toContain("const IMAGE_RESIZE_HANDLE_WIDTH = 12;");
    expect(runtimeSource).toContain("const IMAGE_RESIZE_HANDLE_INSET = 6;");
    expect(runtimeSource).toContain("overflow-y: visible;");
    expect(runtimeSource).toContain("border-color: var(--docsera-table-control-primary);");
    expect(runtimeSource).toContain("box-shadow: inset 0 0 0 1.5px var(--docsera-table-control-primary);");
    expect(runtimeShellSource).toContain("overflow-y: visible;");
    expect(source).not.toContain("--docsera-border-strong");
    expect(source).not.toContain("--docsera-surface-overlay");
    expect(source).not.toContain("--docsera-surface-base");
    expect(source).not.toContain("--docsera-text-secondary");
    expect(source).not.toContain("rounded-full border border-[color:var(--docsera-border-strong)]");
    expect(source).not.toContain("bg-[var(--docsera-surface-overlay)]");
    expect(source).not.toContain("text-[var(--docsera-text-secondary)]");
    expect(source).not.toContain("pointer-events-none inline-flex items-center justify-center");
    expect(source).not.toContain("opacity: isHovered || isMenuOpen ? 1 : 0,");
    expect(runtimeSource).toContain("Frame as FrameIcon");
    expect(runtimeSource).toContain("EllipsisVertical");
    expect(runtimeSource).toContain("translateX(-100%)");
    expect(runtimeSource).toContain("anchorRect.right - IMAGE_OPTIONS_CONTROL_INSET");
    expect(runtimeSource).not.toContain("viewportWidth - anchorRect.right");
    expect(runtimeSource).not.toContain("Crop");
    expect(runtimeSource).not.toContain("MoreHorizontal");
    expect(imageStylesSource).toContain(".docsera-image-preview-group");
    expect(imageStylesSource).toContain(".docsera-image-controls-group");
    expect(imageStylesSource).toContain(".docsera-image-controls-button");
    expect(imageStylesSource).toContain(".docsera-image-controls-button--selected");
    expect(imageStylesSource).toContain(".docsera-image-options-trigger");
    expect(imageStylesSource).toContain(".docsera-image-options-panel");
    expect(imageStylesSource).toContain(".docsera-image-options-panel__header-divider");
    expect(imageStylesSource).toContain(".docsera-image-options-panel__button--primary");
    expect(imageStylesSource).toContain(".docsera-image-alignment-menu {");
    expect(imageStylesSource).toContain(".docsera-image-alignment-menu--active");
    expect(imageStylesSource).toContain(".docsera-image-alignment-menu__item {");
    expect(imageStylesSource).toContain(".docsera-image-alignment-menu__item:hover,");
    expect(imageStylesSource).toContain(".docsera-image-alignment-menu__item:focus-visible,");
    expect(imageStylesSource).toContain(".docsera-image-alignment-menu__item--selected");
    expect(imageStylesSource).toContain("[aria-disabled=\"true\"]");
    expect(imageStylesSource).toContain("pointer-events: auto;");
    expect(imageStylesSource).toContain("pointer-events: auto;\n    display: grid;");
    expect(imageStylesSource).toContain("border-radius: 8px;");
    expect(imageStylesSource).toContain("border-radius: 6px;");
    expect(imageStylesSource).toContain("overflow-y: auto;");
    expect(imageStylesSource).toContain("border-radius: 4px;");
    expect(imageStylesSource).toContain("min-height: 34px;");
    expect(imageStylesSource).toContain("background: var(--docsera-surface);");
    expect(imageStylesSource).toContain("box-shadow: none;");
    expect(imageStylesSource).toContain("outline: none;");
    expect(imageStylesSource).toContain("border-color: var(--docsera-primary);");
    expect(imageStylesSource).toContain("white-space: nowrap;");
    expect(imageStylesSource).toContain("text-overflow: ellipsis;");
    expect(imageStylesSource).toContain("width: min(372px, calc(100vw - 24px));");
    expect(imageStylesSource).toContain("max-width: min(372px, calc(100vw - 24px));");
    expect(imageStylesSource).toContain("background: var(--docsera-surface-muted);");
    expect(imageStylesSource).toContain("cursor: pointer;");
    expect(imageStylesSource).toContain("color: white;");
    expect(imageStylesSource).toContain(".docsera-image-resize-handle::before {");
    expect(imageStylesSource).toContain("width: 2px;");
    expect(imageStylesSource).not.toContain("transform: translateY(-1px);");
    expect(runtimeSource).toContain("transform: \"translateX(-100%)\"");
    expect(imageStylesSource).not.toContain("scale(");
    expect(imageStylesSource).not.toContain("word-break: break-word;");
    expect(imageStylesSource).not.toContain("color: var(--docsera-surface);");
  });

  it("appends a column at the far-right edge even when the active cell is not the last column", async () => {
    const { editorReady, overlayRoot, onSaveDraft } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          createTextTableNode([
            ["R1C1", "R1C2", "R1C3"],
            ["R2C1", "R2C2", "R2C3"],
            ["R3C1", "R3C2", "R3C3"]
          ])
        ]
      });
    });

    await waitFor(() => {
      expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
    });

    const geometry = mockTableGeometry(editor, {
      tableRect: new DOMRect(120, 140, 420, 160),
      wrapperClientHeight: 180,
      wrapperClientWidth: 420,
      wrapperOffsetHeight: 192,
      wrapperOffsetWidth: 460,
      wrapperRect: new DOMRect(100, 120, 460, 200),
      wrapperScrollWidth: 520
    });

    try {
      await runAutosave();
      onSaveDraft.mockClear();
      const startingDocument = editor.getJSON();
      const undoDepthBeforeAppend = undoDepth(editor.state);

      await act(async () => {
        editor.commands.setTextSelection(getTableCellParagraphPosition(editor, 7) + 1);
      });

      await waitFor(() => {
        expect(getTableRailButton(overlayRoot, "column")).toBeInstanceOf(HTMLButtonElement);
      });

      const columnButton = getTableRailButton(overlayRoot, "column");
      if (!(columnButton instanceof HTMLButtonElement)) {
        throw new Error("Expected the add column button to be available.");
      }

      fireEvent.click(columnButton);
      await waitFor(() => {
        expect(getTableTextGrid(editor)).toEqual([
          ["R1C1", "R1C2", "R1C3", ""],
          ["R2C1", "R2C2", "R2C3", ""],
          ["R3C1", "R3C2", "R3C3", ""]
        ]);
        expect(editor.state.selection instanceof CellSelection).toBe(true);
        expect(getNativeSelectionState()?.rangeCount ?? 0).toBe(0);
      });
      expect(undoDepth(editor.state)).toBe(undoDepthBeforeAppend + 1);
      await runAutosave();
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
      expect(getTableShape(editor)).toEqual({ columns: 4, rows: 3 });

      await act(async () => {
        editor.commands.undo();
      });
      expect(editor.getJSON()).toEqual(startingDocument);
      expect(getTableShape(editor)).toEqual({ columns: 3, rows: 3 });
      expect(undoDepth(editor.state)).toBe(undoDepthBeforeAppend);
    } finally {
      geometry.restore();
    }
  });

  it("appends a row at the bottom edge even when the active cell is not the last row", async () => {
    const { editorReady, overlayRoot, onSaveDraft } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          createTextTableNode([
            ["R1C1", "R1C2", "R1C3"],
            ["R2C1", "R2C2", "R2C3"],
            ["R3C1", "R3C2", "R3C3"]
          ])
        ]
      });
    });

    await waitFor(() => {
      expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
    });

    const geometry = mockTableGeometry(editor, {
      tableRect: new DOMRect(120, 140, 420, 160),
      wrapperClientHeight: 180,
      wrapperClientWidth: 420,
      wrapperOffsetHeight: 192,
      wrapperOffsetWidth: 460,
      wrapperRect: new DOMRect(100, 120, 460, 200),
      wrapperScrollWidth: 520
    });

    try {
      await runAutosave();
      onSaveDraft.mockClear();
      const startingDocument = editor.getJSON();
      const undoDepthBeforeAppend = undoDepth(editor.state);

      await act(async () => {
        editor.commands.setTextSelection(getTableCellParagraphPosition(editor, 4) + 1);
      });

      await waitFor(() => {
        expect(getTableRailButton(overlayRoot, "row")).toBeInstanceOf(HTMLButtonElement);
      });

      const rowButton = getTableRailButton(overlayRoot, "row");
      if (!(rowButton instanceof HTMLButtonElement)) {
        throw new Error("Expected the add row button to be available.");
      }

      fireEvent.click(rowButton);
      await waitFor(() => {
        expect(getTableTextGrid(editor)).toEqual([
          ["R1C1", "R1C2", "R1C3"],
          ["R2C1", "R2C2", "R2C3"],
          ["R3C1", "R3C2", "R3C3"],
          ["", "", ""]
        ]);
        expect(editor.state.selection instanceof CellSelection).toBe(true);
        expect(getNativeSelectionState()?.rangeCount ?? 0).toBe(0);
      });
      expect(undoDepth(editor.state)).toBe(undoDepthBeforeAppend + 1);
      await runAutosave();
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
      expect(getTableShape(editor)).toEqual({ columns: 3, rows: 4 });

      await act(async () => {
        editor.commands.undo();
      });
      expect(editor.getJSON()).toEqual(startingDocument);
      expect(getTableShape(editor)).toEqual({ columns: 3, rows: 3 });
      expect(undoDepth(editor.state)).toBe(undoDepthBeforeAppend);
    } finally {
      geometry.restore();
    }
  });

  it("binds table rail listeners and viewport measurements to the overlay owner's document and window", async () => {
    const harness = createOverlayOwnerDocumentHarness(240, 160);
    const overlayRoot = document.createElement("div");
    Object.defineProperty(overlayRoot, "ownerDocument", {
      configurable: true,
      value: harness.ownerDocument
    });

    const { editorReady } = renderRuntime({}, { overlayRoot });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          createTextTableNode([
            ["R1C1", "R1C2", "R1C3"],
            ["R2C1", "R2C2", "R2C3"],
            ["R3C1", "R3C2", "R3C3"]
          ])
        ]
      });
    });

    await waitFor(() => {
      expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
    });

    const geometry = mockTableGeometry(editor, {
      tableRect: new DOMRect(120, 40, 420, 240),
      wrapperClientHeight: 260,
      wrapperClientWidth: 420,
      wrapperOffsetHeight: 272,
      wrapperOffsetWidth: 460,
      wrapperRect: new DOMRect(100, 20, 460, 280),
      wrapperScrollWidth: 520
    });

    try {
      await act(async () => {
        editor.commands.setTextSelection(getTableCellParagraphPosition(editor, 7) + 1);
      });

      await waitFor(() => {
        expect(getTableRailButton(overlayRoot, "column")).toBeInstanceOf(HTMLButtonElement);
        expect(getTableRailButton(overlayRoot, "row")).toBeInstanceOf(HTMLButtonElement);
      });

      expect(harness.ownerDocumentAddEventListener).toHaveBeenCalledWith("scroll", expect.any(Function), true);
      expect(harness.ownerWindowAddEventListener).toHaveBeenCalledWith("resize", expect.any(Function));
      expect(window.innerHeight).not.toBe(harness.ownerWindow.innerHeight);

      const rowRail = getTableRailButton(overlayRoot, "row");
      if (!(rowRail instanceof HTMLButtonElement)) {
        throw new Error("Expected the add row button to be available.");
      }

      expect(getTableHandleButton(overlayRoot, "row", 2)).toBeNull();

      setOverlayOwnerViewport(harness.ownerWindow, 240, 260);

      act(() => {
        harness.triggerScroll();
        harness.triggerResize();
      });

      await waitFor(() => {
        expect(getTableRailButton(overlayRoot, "row")).toBeInstanceOf(HTMLButtonElement);
        expect(getTableHandleButton(overlayRoot, "row", 2)).toBeInstanceOf(HTMLButtonElement);
      });
    } finally {
      geometry.restore();
    }
  });

  it("keeps rail pointerdown from moving the ProseMirror or native selection", async () => {
    const { editorReady, overlayRoot } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [createCanonicalDefaultTableNode()]
      });
    });

    await waitFor(() => {
      expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
    });

    const geometry = mockTableGeometry(editor, {
      tableRect: new DOMRect(120, 140, 420, 160),
      wrapperClientHeight: 180,
      wrapperClientWidth: 420,
      wrapperOffsetHeight: 192,
      wrapperOffsetWidth: 460,
      wrapperRect: new DOMRect(100, 120, 460, 200),
      wrapperScrollWidth: 520
    });

    try {
      await act(async () => {
        editor.commands.setTextSelection(getFirstTableCellParagraphPosition(editor) + 1);
      });

      await waitFor(() => {
        expect(getTableRailButton(overlayRoot, "column")).toBeInstanceOf(HTMLButtonElement);
      });

      const beforeSelection = {
        from: editor.state.selection.from,
        to: editor.state.selection.to
      };
      const beforeNativeSelection = getNativeSelectionState();
      const columnButton = getTableRailButton(overlayRoot, "column");
      if (!(columnButton instanceof HTMLButtonElement)) {
        throw new Error("Expected the add column button to be available.");
      }

      fireEvent.pointerDown(columnButton, { button: 0 });
      fireEvent.mouseDown(columnButton, { button: 0 });

      expect(editor.state.selection.from).toBe(beforeSelection.from);
      expect(editor.state.selection.to).toBe(beforeSelection.to);
      expect(getNativeSelectionState()).toEqual(beforeNativeSelection);
    } finally {
      geometry.restore();
    }
  });

  it("resizes the bottom rail live, reverses direction, suppresses the trailing click, and stays on one undo step", async () => {
    const { editorReady, overlayRoot, onSaveDraft } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          createTextTableNode([
            ["R1C1", "R1C2"],
            ["R2C1", "R2C2"]
          ])
        ]
      });
    });

    await waitFor(() => {
      expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
    });

    const geometry = mockTableGeometry(editor, {
      tableRect: new DOMRect(120, 140, 160, 80),
      wrapperClientHeight: 100,
      wrapperClientWidth: 220,
      wrapperOffsetHeight: 112,
      wrapperOffsetWidth: 260,
      wrapperRect: new DOMRect(100, 120, 260, 140),
      wrapperScrollWidth: 260
    });

    try {
      await runAutosave();
      onSaveDraft.mockClear();
      const startingDocument = editor.getJSON();
      const undoDepthBefore = undoDepth(editor.state);

      await act(async () => {
        editor.commands.setTextSelection(getTableCellParagraphPosition(editor, 0) + 1);
      });

      await waitFor(() => {
        expect(getTableRailButton(overlayRoot, "row")).toBeInstanceOf(HTMLButtonElement);
      });

      const rowButton = getTableRailButton(overlayRoot, "row");
      if (!(rowButton instanceof HTMLButtonElement)) {
        throw new Error("Expected the row rail button to be available.");
      }

      const ownerDocument = rowButton.ownerDocument;
      await dispatchOwnerPointerEvent(ownerDocument, rowButton, "pointerdown", { clientX: 150, clientY: 209 }, {
        button: 0,
        buttons: 1,
        pointerId: 1
      });
      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointermove", { clientX: 150, clientY: 262 }, {
        buttons: 1,
        pointerId: 1
      });
      expect(getTableShape(editor)).toEqual({ columns: 2, rows: 3 });
      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointermove", { clientX: 150, clientY: 305 }, {
        buttons: 1,
        pointerId: 1
      });
      expect(getTableShape(editor)).toEqual({ columns: 2, rows: 4 });
      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointermove", { clientX: 150, clientY: 262 }, {
        buttons: 1,
        pointerId: 1
      });
      expect(getTableShape(editor)).toEqual({ columns: 2, rows: 3 });
      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointerup", { clientX: 150, clientY: 262 }, {
        button: 0,
        buttons: 0,
        pointerId: 1
      });

      fireEvent.click(rowButton);
      expect(getTableShape(editor)).toEqual({ columns: 2, rows: 3 });
      expect(undoDepth(editor.state)).toBe(undoDepthBefore + 1);
      expect(getNativeSelectionState()?.rangeCount ?? 0).toBe(0);

      await runAutosave();
      expect(onSaveDraft).toHaveBeenCalledTimes(1);

      await act(async () => {
        editor.commands.undo();
      });

      expect(editor.getJSON()).toEqual(startingDocument);
      expect(undoDepth(editor.state)).toBe(undoDepthBefore);
    } finally {
      geometry.restore();
    }
  });

  it("resizes the right rail with fixed overlay geometry, keeps a selected trailing cell valid, and completes outside the rail", async () => {
    const { editorReady, overlayRoot, onSaveDraft } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          createTextTableNode([
            ["R1C1", "R1C2"],
            ["R2C1", "R2C2"]
          ])
        ]
      });
    });

    await waitFor(() => {
      expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
    });

    const geometry = mockTableGeometry(editor, {
      tableRect: new DOMRect(120, 140, 160, 80),
      wrapperClientHeight: 100,
      wrapperClientWidth: 220,
      wrapperOffsetHeight: 112,
      wrapperOffsetWidth: 260,
      wrapperRect: new DOMRect(100, 120, 260, 140),
      wrapperScrollLeft: 60,
      wrapperScrollWidth: 340
    });

    try {
      await runAutosave();
      onSaveDraft.mockClear();
      const startingDocument = editor.getJSON();
      const undoDepthBefore = undoDepth(editor.state);

      await act(async () => {
        editor.commands.setTextSelection(getTableCellParagraphPosition(editor, 3) + 1);
      });

      await waitFor(() => {
        expect(getTableRailButton(overlayRoot, "column")).toBeInstanceOf(HTMLButtonElement);
      });

      const columnButton = getTableRailButton(overlayRoot, "column");
      if (!(columnButton instanceof HTMLButtonElement)) {
        throw new Error("Expected the column rail button to be available.");
      }

      const ownerDocument = columnButton.ownerDocument;
      await dispatchOwnerPointerEvent(ownerDocument, columnButton, "pointerdown", { clientX: 250, clientY: 170 }, {
        button: 0,
        buttons: 1,
        pointerId: 1
      });
      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointermove", { clientX: 370, clientY: 170 }, {
        buttons: 1,
        pointerId: 1
      });
      expect(getTableShape(editor)).toEqual({ columns: 3, rows: 2 });
      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointerup", { clientX: 370, clientY: 170 }, {
        button: 0,
        buttons: 0,
        pointerId: 1
      });

      expect(findTable(editor.state.selection.$from)).not.toBeNull();
      expect(editor.state.selection instanceof CellSelection).toBe(true);
      expect(getTableShape(editor)).toEqual({ columns: 3, rows: 2 });
      expect(undoDepth(editor.state)).toBe(undoDepthBefore + 1);
      await waitFor(() => {
        expect(getNativeSelectionState()?.rangeCount ?? 0).toBe(0);
      });

      await runAutosave();
      expect(onSaveDraft).toHaveBeenCalledTimes(1);

      await act(async () => {
        editor.commands.undo();
      });

      expect(editor.getJSON()).toEqual(startingDocument);
      expect(undoDepth(editor.state)).toBe(undoDepthBefore);
    } finally {
      geometry.restore();
    }
  });

  it("auto-scrolls the column content during an active drag, keeps the cursor locked, and leaves the resize badge absent", async () => {
    const { editorReady, overlayRoot } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          createTextTableNode([
            ["R1C1", "R1C2", "R1C3", "R1C4"],
            ["R2C1", "R2C2", "R2C3", "R2C4"]
          ])
        ]
      });
    });

    await waitFor(() => {
      expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
    });

    const geometry = mockTableGeometry(editor, {
      tableRect: new DOMRect(120, 140, 320, 80),
      wrapperClientHeight: 100,
      wrapperClientWidth: 220,
      wrapperOffsetHeight: 112,
      wrapperOffsetWidth: 260,
      wrapperRect: new DOMRect(100, 120, 260, 140),
      wrapperScrollLeft: 60,
      wrapperScrollWidth: 420
    });

    try {
      await act(async () => {
        editor.commands.setTextSelection(getTableCellParagraphPosition(editor, 0) + 1);
      });

      await waitFor(() => {
        expect(getTableRailButton(overlayRoot, "column")).toBeInstanceOf(HTMLButtonElement);
      });

      const columnButton = getTableRailButton(overlayRoot, "column");
      if (!(columnButton instanceof HTMLButtonElement)) {
        throw new Error("Expected the column rail button to be available.");
      }

      const ownerDocument = columnButton.ownerDocument;
      const initialCursor = getComputedStyle(ownerDocument.documentElement).cursor;
      const initialColumnRailBox = readInlineBox(columnButton.parentElement as HTMLElement);
      expect(getTableResizeBadge(overlayRoot)).toBeNull();

      await dispatchOwnerPointerEvent(ownerDocument, columnButton, "pointerdown", { clientX: 250, clientY: 170 }, {
        button: 0,
        buttons: 1,
        pointerId: 11
      });
      expect(getComputedStyle(ownerDocument.documentElement).cursor).toBe("col-resize");

      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointermove", { clientX: 520, clientY: 170 }, {
        buttons: 1,
        pointerId: 11
      });

      await waitFor(() => {
        expect(getTableShape(editor)).toEqual({ columns: 5, rows: 2 });
        expect(getTableResizeBadge(overlayRoot)).toBeNull();
      });

      expect(getTableWrapperElement(editor)?.scrollLeft ?? 0).toBeGreaterThan(60);
      const firstScrollLeft = getTableWrapperElement(editor)?.scrollLeft ?? 0;
      const firstTableRect = new DOMRect(120 - (firstScrollLeft - 60), 140, 400, 80);
      geometry.setLayoutRects({
        tableRect: firstTableRect,
        wrapperScrollLeft: firstScrollLeft
      });

      await act(async () => {
        overlayRoot.ownerDocument.dispatchEvent(new Event("scroll"));
      });

      await waitFor(() => {
        const updatedColumnRail = getTableRailButton(overlayRoot, "column");
        if (!(updatedColumnRail instanceof HTMLButtonElement)) {
          throw new Error("Expected the column rail button to remain available.");
        }

        const updatedColumnRailBox = readInlineBox(updatedColumnRail.parentElement as HTMLElement);
        expect(updatedColumnRailBox.left).toBe(initialColumnRailBox.left);
        expect(updatedColumnRailBox.right).toBe(initialColumnRailBox.right);
        expect(getTableResizeBadge(overlayRoot)).toBeNull();
        expect(getComputedStyle(ownerDocument.documentElement).cursor).toBe("col-resize");
      });

      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointermove", { clientX: 460, clientY: 170 }, {
        buttons: 1,
        pointerId: 11
      });

      await waitFor(() => {
        expect(getTableShape(editor)).toEqual({ columns: 4, rows: 2 });
        expect(getTableResizeBadge(overlayRoot)).toBeNull();
      });

      const secondScrollLeft = getTableWrapperElement(editor)?.scrollLeft ?? 0;
      const secondTableRect = new DOMRect(120 - (secondScrollLeft - 60), 140, 320, 80);
      geometry.setLayoutRects({
        tableRect: secondTableRect,
        wrapperScrollLeft: secondScrollLeft
      });

      await act(async () => {
        overlayRoot.ownerDocument.dispatchEvent(new Event("scroll"));
      });

      await waitFor(() => {
        const updatedColumnRail = getTableRailButton(overlayRoot, "column");
        if (!(updatedColumnRail instanceof HTMLButtonElement)) {
          throw new Error("Expected the column rail button to remain available.");
        }

        const updatedColumnRailBox = readInlineBox(updatedColumnRail.parentElement as HTMLElement);
        expect(updatedColumnRailBox.left).toBe(initialColumnRailBox.left);
        expect(updatedColumnRailBox.right).toBe(initialColumnRailBox.right);
        expect(getTableResizeBadge(overlayRoot)).toBeNull();
      });

      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointerup", { clientX: 460, clientY: 170 }, {
        button: 0,
        buttons: 0,
        pointerId: 11
      });

      await waitFor(() => {
        expect(getTableResizeBadge(overlayRoot)).toBeNull();
      });
      expect(getComputedStyle(ownerDocument.documentElement).cursor).toBe(initialCursor);
    } finally {
      geometry.restore();
    }
  });

  it("preserves manual horizontal scrolling outside a resize session and keeps the rail aligned", async () => {
    const { editorReady, overlayRoot } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [createCanonicalDefaultTableNode()]
      });
    });

    await waitFor(() => {
      expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
    });

    const wrapper = getTableWrapperElement(editor);
    if (!(wrapper instanceof HTMLElement)) {
      throw new Error("Expected the table wrapper to be available.");
    }

    const geometry = mockTableGeometry(editor, {
      tableRect: new DOMRect(120, 140, 460, 160),
      wrapperClientHeight: 180,
      wrapperClientWidth: 420,
      wrapperOffsetHeight: 192,
      wrapperOffsetWidth: 420,
      wrapperRect: new DOMRect(120, 120, 420, 200),
      wrapperScrollLeft: 0,
      wrapperScrollWidth: 620
    });

    try {
      await act(async () => {
        editor.commands.setTextSelection(getFirstTableCellParagraphPosition(editor) + 1);
      });

      await waitFor(() => {
        expect(getTableRailButton(overlayRoot, "column")).toBeInstanceOf(HTMLButtonElement);
      });

      wrapper.scrollLeft = 160;
      geometry.setLayoutRects({
        tableRect: new DOMRect(-40, 140, 460, 160),
        wrapperScrollLeft: 160
      });

      await act(async () => {
        overlayRoot.ownerDocument.dispatchEvent(new Event("scroll"));
      });

      await waitFor(() => {
        const columnRail = getTableRailButton(overlayRoot, "column");
        if (!(columnRail instanceof HTMLButtonElement)) {
          throw new Error("Expected the column rail button to remain available.");
        }

        const columnRailBox = readInlineBox(columnRail.parentElement as HTMLElement);
        expect(wrapper.scrollLeft).toBe(160);
        expect(columnRailBox.left).toBe(420);
        expect(columnRailBox.right).toBe(442);
      });
    } finally {
      geometry.restore();
    }
  });

  it("keeps the 1x1 minimum, clears cancelled rail drags, and tears down without leaving stuck rail state", async () => {
    const runtime = renderRuntime();

    await waitFor(() => {
      expect(runtime.editorReady[0]).toBeDefined();
    });

    const editor = runtime.editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          createTextTableNode([
            ["R1C1"]
          ])
        ]
      });
    });

    await waitFor(() => {
      expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
    });

    const wrapper = getTableWrapperElement(editor);
    if (!(wrapper instanceof HTMLElement)) {
      throw new Error("Expected the table wrapper to be available.");
    }

    let scrollTop = 0;
    const originalScrollTopDescriptor = Object.getOwnPropertyDescriptor(wrapper, "scrollTop");
    Object.defineProperty(wrapper, "scrollTop", {
      configurable: true,
      get: () => scrollTop,
      set: (next: number) => {
        scrollTop = next;
      }
    });

    const geometry = mockTableGeometry(editor, {
      tableRect: new DOMRect(120, 140, 80, 40),
      wrapperClientHeight: 60,
      wrapperClientWidth: 120,
      wrapperOffsetHeight: 72,
      wrapperOffsetWidth: 160,
      wrapperRect: new DOMRect(100, 120, 160, 100),
      wrapperScrollWidth: 120
    });

    try {
      await act(async () => {
        editor.commands.setTextSelection(getFirstTableCellParagraphPosition(editor) + 1);
      });

      await waitFor(() => {
        expect(getTableRailButton(runtime.overlayRoot, "column")).toBeInstanceOf(HTMLButtonElement);
        expect(getTableRailButton(runtime.overlayRoot, "row")).toBeInstanceOf(HTMLButtonElement);
      });

      const rowButton = getTableRailButton(runtime.overlayRoot, "row");
      const columnButton = getTableRailButton(runtime.overlayRoot, "column");
      if (!(rowButton instanceof HTMLButtonElement) || !(columnButton instanceof HTMLButtonElement)) {
        throw new Error("Expected both table rail buttons to be available.");
      }

      const ownerDocument = rowButton.ownerDocument;
      await dispatchOwnerPointerEvent(ownerDocument, rowButton, "pointerdown", { clientX: 150, clientY: 170 }, {
        button: 0,
        buttons: 1,
        pointerId: 1
      });
      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument.body, "pointermove", { clientX: 150, clientY: 100 }, {
        buttons: 1,
        pointerId: 1
      });
      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument.body, "pointerup", { clientX: 150, clientY: 100 }, {
        button: 0,
        buttons: 0,
        pointerId: 1
      });

      fireEvent.click(rowButton);
      expect(getTableShape(editor)).toEqual({ columns: 1, rows: 1 });
      expect(scrollTop).toBe(0);

      fireEvent.click(rowButton);
      expect(getTableShape(editor)).toEqual({ columns: 1, rows: 2 });
      expect(scrollTop).toBe(0);

      await act(async () => {
        editor.commands.setContent({
          type: "doc",
          content: [
            createTextTableNode([
              ["R1C1"]
            ])
          ]
        });
      });

      await waitFor(() => {
        expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
      });
      await waitFor(() => {
        expect(getTableShape(editor)).toEqual({ columns: 1, rows: 1 });
      });

      await waitFor(() => {
        expect(getTableRailButton(runtime.overlayRoot, "column")).toBeInstanceOf(HTMLButtonElement);
        expect(getTableRailButton(runtime.overlayRoot, "row")).toBeInstanceOf(HTMLButtonElement);
      });

      const freshRowButton = getTableRailButton(runtime.overlayRoot, "row");
      const freshColumnButton = getTableRailButton(runtime.overlayRoot, "column");
      if (!(freshRowButton instanceof HTMLButtonElement) || !(freshColumnButton instanceof HTMLButtonElement)) {
        throw new Error("Expected the fresh rail buttons to be available.");
      }

      await dispatchOwnerPointerEvent(ownerDocument, freshRowButton, "pointerdown", { clientX: 150, clientY: 170 }, {
        button: 0,
        buttons: 1,
        pointerId: 2
      });
      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointermove", { clientX: 150, clientY: 230 }, {
        buttons: 1,
        pointerId: 2
      });
      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointercancel", { clientX: 150, clientY: 230 }, {
        button: 0,
        buttons: 0,
        pointerId: 2
      });
      expect(getTableResizeBadge(runtime.overlayRoot)).toBeNull();

      fireEvent.click(freshRowButton);
      await waitFor(() => {
        expect(getTableShape(editor)).toEqual({ columns: 1, rows: 3 });
      });
      expect(scrollTop).toBe(0);

      await dispatchOwnerPointerEvent(ownerDocument, freshColumnButton, "pointerdown", { clientX: 210, clientY: 160 }, {
        button: 0,
        buttons: 1,
        pointerId: 3
      });
      runtime.unmount();
    } finally {
      if (originalScrollTopDescriptor) {
        Object.defineProperty(wrapper, "scrollTop", originalScrollTopDescriptor);
      } else {
        Reflect.deleteProperty(wrapper, "scrollTop");
      }
      geometry.restore();
    }
  });

  it("tracks the visible table edges and the scrollbar lane when horizontal scroll changes", async () => {
    const { editorReady, overlayRoot } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [createCanonicalDefaultTableNode()]
      });
    });

    await waitFor(() => {
      expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
    });

    const geometry = mockTableGeometry(editor, {
      mainPaneRect: DEFAULT_TABLE_MAIN_PANE_RECT,
      tableRect: new DOMRect(80, 140, 460, 160),
      wrapperClientHeight: 180,
      wrapperClientWidth: 420,
      wrapperOffsetHeight: 192,
      wrapperOffsetWidth: 420,
      wrapperRect: new DOMRect(120, 120, 420, 200),
      wrapperScrollWidth: 520
    });

    try {
      await act(async () => {
        editor.commands.setTextSelection(getFirstTableCellParagraphPosition(editor) + 1);
      });

      await waitFor(() => {
        expect(getTableRailButton(overlayRoot, "column")).toBeInstanceOf(HTMLButtonElement);
      });

      const columnRail = getTableRailButton(overlayRoot, "column");
      const rowRail = getTableRailButton(overlayRoot, "row");
      if (!(columnRail instanceof HTMLButtonElement) || !(rowRail instanceof HTMLButtonElement)) {
        throw new Error("Expected both table rails to be available.");
      }

      const columnRailBox = readInlineBox(columnRail.parentElement as HTMLElement);
      const rowRailBox = readInlineBox(rowRail.parentElement as HTMLElement);

      expect(columnRailBox.left).toBe(540);
      expect(columnRailBox.right).toBe(562);
      expect(rowRailBox.left).toBe(120);
      expect(rowRailBox.right).toBe(540);
      expect(getTableOverlayRoot(overlayRoot)).toHaveAttribute("data-docsera-table-overflow-x", "true");

      geometry.setLayoutRects({
        tableRect: new DOMRect(70, 140, 440, 160)
      });

      await act(async () => {
        overlayRoot.ownerDocument.dispatchEvent(new Event("scroll"));
      });

      await waitFor(() => {
        const updatedColumnRail = getTableRailButton(overlayRoot, "column");
        const updatedRowRail = getTableRailButton(overlayRoot, "row");
        if (!(updatedColumnRail instanceof HTMLButtonElement) || !(updatedRowRail instanceof HTMLButtonElement)) {
          throw new Error("Expected both table rails to remain available.");
        }
        const updatedColumnRailBox = readInlineBox(updatedColumnRail.parentElement as HTMLElement);
        const updatedRowRailBox = readInlineBox(updatedRowRail.parentElement as HTMLElement);
        expect(updatedColumnRailBox.left).toBe(510);
        expect(updatedColumnRailBox.right).toBe(532);
        expect(updatedRowRailBox.left).toBe(120);
        expect(updatedRowRailBox.right).toBe(510);
      });
    } finally {
      geometry.restore();
    }
  });

  it("keeps adjacent editor chrome out of the column rail geometry", async () => {
    const { editorReady, overlayRoot } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [createCanonicalDefaultTableNode()]
      });
    });

    await waitFor(() => {
      expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
    });

    const wrapper = getTableWrapperElement(editor);
    if (!(wrapper instanceof HTMLElement)) {
      throw new Error("Expected the table wrapper to be available.");
    }

    const geometry = mockTableGeometry(editor, {
      editorSurfaceRect: new DOMRect(24, 32, 560, 680),
      tableRect: new DOMRect(100, 140, 620, 160),
      wrapperClientHeight: 180,
      wrapperClientWidth: 500,
      wrapperOffsetHeight: 192,
      wrapperOffsetWidth: 500,
      wrapperRect: new DOMRect(80, 120, 500, 200),
      wrapperScrollWidth: 760
    });

    const ownerWindow = editor.view.dom.ownerDocument.defaultView;
    if (!ownerWindow) {
      throw new Error("Expected the editor owner window to be available.");
    }

    try {
      await act(async () => {
        editor.commands.setTextSelection(getFirstTableCellParagraphPosition(editor) + 1);
      });

      await waitFor(() => {
        expect(getTableRailButton(overlayRoot, "column")).toBeInstanceOf(HTMLButtonElement);
        expect(getTableRailButton(overlayRoot, "row")).toBeInstanceOf(HTMLButtonElement);
      });

      const columnRail = getTableRailButton(overlayRoot, "column");
      const rowRail = getTableRailButton(overlayRoot, "row");
      if (!(columnRail instanceof HTMLButtonElement) || !(rowRail instanceof HTMLButtonElement)) {
        throw new Error("Expected both table rails to be available.");
      }

      const initialColumnRailBox = readInlineBox(columnRail.parentElement as HTMLElement);
      const initialRowRailBox = readInlineBox(rowRail.parentElement as HTMLElement);

      expect(initialColumnRailBox.left).toBe(580);
      expect(initialColumnRailBox.right).toBe(602);
      expect(initialRowRailBox.right).toBe(580);
      expect(getTableOverlayRoot(overlayRoot)).toHaveAttribute("data-docsera-table-overflow-x", "true");

      geometry.setLayoutRects({
        editorSurfaceRect: new DOMRect(24, 32, 760, 680)
      });

      await act(async () => {
        ownerWindow.dispatchEvent(new Event("resize"));
      });

      await waitFor(() => {
        const unchangedColumnRailBox = readInlineBox(columnRail.parentElement as HTMLElement);
        expect(unchangedColumnRailBox.left).toBe(580);
        expect(unchangedColumnRailBox.right).toBe(602);
      });

      geometry.setLayoutRects({
        wrapperRect: new DOMRect(80, 120, 700, 200)
      });

      await act(async () => {
        ownerWindow.dispatchEvent(new Event("resize"));
      });

      await waitFor(() => {
        const expandedColumnRailBox = readInlineBox(columnRail.parentElement as HTMLElement);
        const expandedRowRailBox = readInlineBox(rowRail.parentElement as HTMLElement);

        expect(expandedColumnRailBox.left).toBe(720);
        expect(expandedColumnRailBox.right).toBe(742);
        expect(expandedRowRailBox.right).toBe(720);
      });
    } finally {
      geometry.restore();
    }
  });

  it("shows the active row and column pills for a table cell and retargets them when the selection changes", async () => {
    const { editorReady, overlayRoot } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [createCanonicalDefaultTableNode()]
      });
    });

    await waitFor(() => {
      expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
    });

    const geometry = mockTableGeometry(editor, {
      tableRect: new DOMRect(120, 140, 420, 180),
      wrapperClientHeight: 180,
      wrapperClientWidth: 420,
      wrapperOffsetHeight: 192,
      wrapperOffsetWidth: 460,
      wrapperRect: new DOMRect(100, 120, 460, 220),
      wrapperScrollWidth: 520
    });

    try {
      await act(async () => {
        editor.commands.setTextSelection(getFirstTableCellParagraphPosition(editor) + 1);
      });

      await waitFor(() => {
        expect(getTableHandleButton(overlayRoot, "row", 0)).toBeInstanceOf(HTMLButtonElement);
        expect(getTableHandleButton(overlayRoot, "column", 0)).toBeInstanceOf(HTMLButtonElement);
      });

      expect(getTableHandleButton(overlayRoot, "row", 0)).toHaveAttribute("aria-expanded", "false");
      expect(getTableHandleButton(overlayRoot, "column", 0)).toHaveAttribute("aria-expanded", "false");

      await act(async () => {
        editor.commands.setTextSelection(getTableCellParagraphPosition(editor, 4) + 1);
      });

      await waitFor(() => {
        expect(getTableHandleButton(overlayRoot, "row", 0)).toBeNull();
        expect(getTableHandleButton(overlayRoot, "column", 0)).toBeNull();
        expect(getTableHandleButton(overlayRoot, "row", 1)).toBeInstanceOf(HTMLButtonElement);
        expect(getTableHandleButton(overlayRoot, "column", 1)).toBeInstanceOf(HTMLButtonElement);
      });
    } finally {
      geometry.restore();
    }
  });

  it("keeps the active row pill visible while its menu is open, switches menu kinds, and closes on Escape or outside pointerdown", async () => {
    const { editorReady, overlayRoot } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [createCanonicalDefaultTableNode()]
      });
    });

    await waitFor(() => {
      expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
    });

    const geometry = mockTableGeometry(editor, {
      tableRect: new DOMRect(120, 140, 420, 180),
      wrapperClientHeight: 180,
      wrapperClientWidth: 420,
      wrapperOffsetHeight: 192,
      wrapperOffsetWidth: 460,
      wrapperRect: new DOMRect(100, 120, 460, 220),
      wrapperScrollWidth: 520
    });

    try {
      await act(async () => {
        editor.commands.setTextSelection(getFirstTableCellParagraphPosition(editor) + 1);
      });

      const rowButton = await screen.findByRole("button", { name: "Table row 1 options" });
      const columnButton = await screen.findByRole("button", { name: "Table column 1 options" });
      fireEvent.click(rowButton);

      await waitFor(() => {
        expect(screen.getByRole("menu", { name: "Table row menu" })).toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Table row 1 options" })).toHaveAttribute("aria-expanded", "true");
        expect(getCellSelectionRect(editor)).toEqual({
          bottom: 1,
          left: 0,
          right: 3,
          top: 0
        });
      });

      expect(screen.getByRole("button", { name: "Table row 1 options" })).toHaveAttribute(
        "data-docsera-table-handle-expanded",
        "false"
      );

      fireEvent.click(columnButton);

      await waitFor(() => {
        expect(screen.queryByRole("menu", { name: "Table row menu" })).toBeNull();
        expect(screen.getByRole("menu", { name: "Table column menu" })).toBeInTheDocument();
        expect(getCellSelectionRect(editor)).toEqual({
          bottom: 3,
          left: 0,
          right: 1,
          top: 0
        });
      });

      fireEvent.keyDown(document, { key: "Escape" });

      await waitFor(() => {
        expect(screen.queryByRole("menu", { name: "Table column menu" })).toBeNull();
      });

      fireEvent.click(rowButton);
      await screen.findByRole("menu", { name: "Table row menu" });
      fireEvent.pointerDown(document.body);

      await waitFor(() => {
        expect(screen.queryByRole("menu", { name: "Table row menu" })).toBeNull();
      });
    } finally {
      geometry.restore();
    }
  });

  it.each([
    {
      expectedGrid: [
        ["R1C1", "R1C2", "R1C3"],
        ["", "", ""],
        ["R2C1", "R2C2", "R2C3"],
        ["R3C1", "R3C2", "R3C3"]
      ],
      itemLabel: "Insert before"
    },
    {
      expectedGrid: [
        ["R1C1", "R1C2", "R1C3"],
        ["R2C1", "R2C2", "R2C3"],
        ["", "", ""],
        ["R3C1", "R3C2", "R3C3"]
      ],
      itemLabel: "Insert after"
    },
    {
      expectedGrid: [
        ["R1C1", "R1C2", "R1C3"],
        ["R3C1", "R3C2", "R3C3"]
      ],
      itemLabel: "Delete row"
    }
  ] as const)(
    "runs the row menu action %s and restores the table on undo",
    async ({ expectedGrid, itemLabel }) => {
      const harness = createOverlayOwnerDocumentHarness(1280, 720);
      const overlayRoot = document.createElement("div");
      Object.defineProperty(overlayRoot, "ownerDocument", {
        configurable: true,
        value: harness.ownerDocument
      });
      const { editorReady, onSaveDraft } = renderRuntime({}, { overlayRoot });

      await waitFor(() => {
        expect(editorReady[0]).toBeDefined();
      });

      const editor = editorReady[0];
      await act(async () => {
        editor.commands.setContent({
          type: "doc",
          content: [
            createTextTableNode([
              ["R1C1", "R1C2", "R1C3"],
              ["R2C1", "R2C2", "R2C3"],
              ["R3C1", "R3C2", "R3C3"]
            ])
          ]
        });
      });

      await waitFor(() => {
        expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
      });

      const geometry = mockTableGeometry(editor, {
        tableRect: new DOMRect(120, 140, 420, 180),
        wrapperClientHeight: 180,
        wrapperClientWidth: 420,
        wrapperOffsetHeight: 192,
        wrapperOffsetWidth: 460,
        wrapperRect: new DOMRect(100, 120, 460, 220),
        wrapperScrollWidth: 520
      });

      try {
        const startingDocument = editor.getJSON();
        const undoDepthBefore = undoDepth(editor.state);
        await act(async () => {
          editor.commands.setTextSelection(getTableCellParagraphPosition(editor, 4) + 1);
        });

        const rowButton = await screen.findByRole("button", { name: "Table row 2 options" });
        fireEvent.click(rowButton);
        const menu = await screen.findByRole("menu", { name: "Table row menu" });
        expect(getMenuItemNames(menu, "menuitem")).toEqual([
          "Insert before",
          "Insert after",
          "Move up",
          "Move down",
          "Copy row",
          "Delete row"
        ]);
        const menuItem = within(menu).getByRole("menuitem", { name: itemLabel });
        const beforeDocument = editor.getJSON();
        const beforeSelection = getCellSelectionRect(editor);
        try {
          await act(async () => {
            await activateTableMenuItemWithBrowserPointer(menuItem);
          });

          expect(editor.getJSON()).toEqual(beforeDocument);
          expect(getCellSelectionRect(editor)).toEqual(beforeSelection);
          expect(getTableMenu(overlayRoot, "row")).not.toBeNull();

          await act(async () => {
            fireEvent.click(menuItem);
          });

          expect(getTableMenu(overlayRoot, "row")).toBeNull();
          expect(getTableTextGrid(editor)).toEqual(expectedGrid);
          expect(harness.ownerWindowSetTimeout).not.toHaveBeenCalled();
        } finally {
          harness.ownerWindowSetTimeout.mockClear();
        }

        expect(undoDepth(editor.state)).toBe(undoDepthBefore + 1);
        await runAutosave();
        expect(onSaveDraft).toHaveBeenCalledTimes(1);

        await act(async () => {
          editor.commands.undo();
        });

        expect(editor.getJSON()).toEqual(startingDocument);
        expect(undoDepth(editor.state)).toBe(undoDepthBefore);
      } finally {
        geometry.restore();
      }
    }
  );

  it.each([
    {
      expectedGrid: [
        ["R1C1", "", "R1C2", "R1C3"],
        ["R2C1", "", "R2C2", "R2C3"],
        ["R3C1", "", "R3C2", "R3C3"]
      ],
      itemLabel: "Insert before"
    },
    {
      expectedGrid: [
        ["R1C1", "R1C2", "", "R1C3"],
        ["R2C1", "R2C2", "", "R2C3"],
        ["R3C1", "R3C2", "", "R3C3"]
      ],
      itemLabel: "Insert after"
    },
    {
      expectedGrid: [
        ["R1C1", "R1C3"],
        ["R2C1", "R2C3"],
        ["R3C1", "R3C3"]
      ],
      itemLabel: "Delete column"
    }
  ] as const)(
    "runs the column menu action %s and restores the table on undo",
    async ({ expectedGrid, itemLabel }) => {
      const harness = createOverlayOwnerDocumentHarness(1280, 720);
      const overlayRoot = document.createElement("div");
      Object.defineProperty(overlayRoot, "ownerDocument", {
        configurable: true,
        value: harness.ownerDocument
      });
      const { editorReady, onSaveDraft } = renderRuntime({}, { overlayRoot });

      await waitFor(() => {
        expect(editorReady[0]).toBeDefined();
      });

      const editor = editorReady[0];
      await act(async () => {
        editor.commands.setContent({
          type: "doc",
          content: [
            createTextTableNode([
              ["R1C1", "R1C2", "R1C3"],
              ["R2C1", "R2C2", "R2C3"],
              ["R3C1", "R3C2", "R3C3"]
            ])
          ]
        });
      });

      await waitFor(() => {
        expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
      });

      const geometry = mockTableGeometry(editor, {
        tableRect: new DOMRect(120, 140, 420, 180),
        wrapperClientHeight: 180,
        wrapperClientWidth: 420,
        wrapperOffsetHeight: 192,
        wrapperOffsetWidth: 460,
        wrapperRect: new DOMRect(100, 120, 460, 220),
        wrapperScrollWidth: 520
      });

      try {
        const startingDocument = editor.getJSON();
        const undoDepthBefore = undoDepth(editor.state);
        await act(async () => {
          editor.commands.setTextSelection(getTableCellParagraphPosition(editor, 4) + 1);
        });

        const columnButton = await screen.findByRole("button", { name: "Table column 2 options" });
        fireEvent.click(columnButton);
        const menu = await screen.findByRole("menu", { name: "Table column menu" });
        expect(getMenuItemNames(menu, "menuitem")).toEqual([
          "Insert before",
          "Insert after",
          "Move left",
          "Move right",
          "Align left",
          "Align center",
          "Align right",
          "Copy column",
          "Delete column"
        ]);
        const menuItem = within(menu).getByRole("menuitem", { name: itemLabel });
        const beforeDocument = editor.getJSON();
        const beforeSelection = getCellSelectionRect(editor);
        try {
          await act(async () => {
            await activateTableMenuItemWithBrowserPointer(menuItem);
          });

          expect(editor.getJSON()).toEqual(beforeDocument);
          expect(getCellSelectionRect(editor)).toEqual(beforeSelection);
          expect(getTableMenu(overlayRoot, "column")).not.toBeNull();

          await act(async () => {
            fireEvent.click(menuItem, { button: 0, buttons: 0 });
          });

          expect(getTableMenu(overlayRoot, "column")).toBeNull();
          expect(getTableTextGrid(editor)).toEqual(expectedGrid);
          expect(harness.ownerWindowSetTimeout).not.toHaveBeenCalled();
        } finally {
          harness.ownerWindowSetTimeout.mockClear();
        }

        expect(undoDepth(editor.state)).toBe(undoDepthBefore + 1);
        await runAutosave();
        expect(onSaveDraft).toHaveBeenCalledTimes(1);

        await act(async () => {
          editor.commands.undo();
        });

        expect(editor.getJSON()).toEqual(startingDocument);
        expect(undoDepth(editor.state)).toBe(undoDepthBefore);
      } finally {
        geometry.restore();
      }
    }
  );

  it.each([
    {
      activeLabel: "Align left",
      columnAlignments: [null, null, null],
      description: "default column alignment"
    },
    {
      activeLabel: "Align left",
      columnAlignments: ["center", "left", "right"],
      description: "mixed column alignment"
    },
    {
      activeLabel: "Align center",
      columnAlignments: ["center", "center", "center"],
      description: "uniform center column alignment"
    },
    {
      activeLabel: "Align right",
      columnAlignments: ["right", "right", "right"],
      description: "uniform right column alignment"
    }
  ] as const)("shows the active %s state for %s", async ({ activeLabel, columnAlignments }) => {
    const harness = createOverlayOwnerDocumentHarness(1280, 720);
    const overlayRoot = document.createElement("div");
    Object.defineProperty(overlayRoot, "ownerDocument", {
      configurable: true,
      value: harness.ownerDocument
    });
    const { editorReady } = renderRuntime({}, { overlayRoot });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          createAlignedTableDocument([
            [
              { cellType: "tableHeader", text: "H1" },
              { cellType: "tableHeader", text: "H2", align: columnAlignments[0] ?? null }
            ],
            [
              { text: "A1" },
              { text: "A2", align: columnAlignments[1] ?? null }
            ],
            [
              { text: "B1" },
              { text: "B2", align: columnAlignments[2] ?? null }
            ]
          ])
        ]
      });
    });

    await waitFor(() => {
      expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
    });

    const geometry = mockTableGeometry(editor, {
      tableRect: new DOMRect(120, 140, 420, 180),
      wrapperClientHeight: 180,
      wrapperClientWidth: 420,
      wrapperOffsetHeight: 192,
      wrapperOffsetWidth: 460,
      wrapperRect: new DOMRect(100, 120, 460, 220),
      wrapperScrollWidth: 520
    });

    try {
      await act(async () => {
        editor.commands.setTextSelection(getTableCellParagraphPosition(editor, 5) + 1);
      });

      const columnButton = await screen.findByRole("button", { name: "Table column 2 options" });
      fireEvent.click(columnButton);
      const menu = await screen.findByRole("menu", { name: "Table column menu" });

      expect(within(menu).getByRole("menuitem", { name: activeLabel })).toHaveClass(
        "docsera-compact-menu__item--active"
      );
    } finally {
      geometry.restore();
    }
  });

  it.each([
    { commandLabel: "Align left", alignment: "left" as const },
    { commandLabel: "Align center", alignment: "center" as const },
    { commandLabel: "Align right", alignment: "right" as const }
  ])(
    "applies %s across the entire column, keeps header cells included, and survives undo plus round-trip persistence",
    async ({ commandLabel, alignment }) => {
      const harness = createOverlayOwnerDocumentHarness(1280, 720);
      const overlayRoot = document.createElement("div");
      Object.defineProperty(overlayRoot, "ownerDocument", {
        configurable: true,
        value: harness.ownerDocument
      });
      const { editorReady, onSaveDraft } = renderRuntime({}, { overlayRoot });

      await waitFor(() => {
        expect(editorReady[0]).toBeDefined();
      });

      const editor = editorReady[0];
      await act(async () => {
        editor.commands.setContent({
          type: "doc",
          content: [
            createAlignedTableDocument([
              [
                { cellType: "tableHeader", text: "H1" },
                { cellType: "tableHeader", text: "H2" },
                { cellType: "tableHeader", text: "H3" }
              ],
              [
                { text: "A1" },
                { text: "A2" },
                { text: "A3" }
              ],
              [
                { text: "B1" },
                { text: "B2" },
                { text: "B3" }
              ]
            ])
          ]
        });
      });

      await waitFor(() => {
        expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
      });

      const geometry = mockTableGeometry(editor, {
        tableRect: new DOMRect(120, 140, 420, 180),
        wrapperClientHeight: 180,
        wrapperClientWidth: 420,
        wrapperOffsetHeight: 192,
        wrapperOffsetWidth: 460,
        wrapperRect: new DOMRect(100, 120, 460, 220),
        wrapperScrollWidth: 520
      });

      try {
      const startingDocument = editor.getJSON();
      const undoDepthBefore = undoDepth(editor.state);
      await act(async () => {
        editor.commands.setTextSelection(getTableCellParagraphPosition(editor, 4) + 1);
      });

        const columnButton = await screen.findByRole("button", { name: "Table column 2 options" });
        fireEvent.click(columnButton);
        const menu = await screen.findByRole("menu", { name: "Table column menu" });
        const menuItem = within(menu).getByRole("menuitem", { name: commandLabel });

        await act(async () => {
          fireEvent.click(menuItem);
        });

        await waitFor(() => {
          expect(getTableMenu(overlayRoot, "column")).toBeNull();
          expect(document.activeElement).toBe(editor.view.dom);
        });

        expect(getTableColumnAlignments(editor, 2)).toEqual([alignment, alignment, alignment]);
        expect(undoDepth(editor.state)).toBe(undoDepthBefore + 1);

        await runAutosave();
        expect(onSaveDraft).toHaveBeenCalledTimes(1);

        const persistedEnvelope = createEnvelopeFromDocument(editor.getJSON());
        const reloadOverlayRoot = document.createElement("div");
        Object.defineProperty(reloadOverlayRoot, "ownerDocument", {
          configurable: true,
          value: harness.ownerDocument
        });
        const reloaded = renderRuntime({ initialEnvelope: persistedEnvelope }, { overlayRoot: reloadOverlayRoot });
        try {
          await waitFor(() => {
            expect(reloaded.editorReady[0]).toBeDefined();
          });

          expect(getTableColumnAlignments(reloaded.editorReady[0], 2)).toEqual([alignment, alignment, alignment]);
        } finally {
          reloaded.unmount();
        }

        await act(async () => {
          editor.commands.undo();
        });

        expect(editor.getJSON()).toEqual(startingDocument);
        expect(getTableColumnAlignments(editor, 2)).toEqual([null, null, null]);
        expect(undoDepth(editor.state)).toBe(undoDepthBefore);
      } finally {
        geometry.restore();
      }
    }
  );

  it("does not throw when the editor is destroyed while a column menu is open and the overlay refreshes", async () => {
    const harness = createOverlayOwnerDocumentHarness(1280, 720);
    const overlayRoot = document.createElement("div");
    Object.defineProperty(overlayRoot, "ownerDocument", {
      configurable: true,
      value: harness.ownerDocument
    });
    const { editorReady } = renderRuntime({}, { overlayRoot });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          createAlignedTableDocument([
            [
              { cellType: "tableHeader", text: "H1" },
              { cellType: "tableHeader", text: "H2" },
              { cellType: "tableHeader", text: "H3" }
            ],
            [
              { text: "A1" },
              { text: "A2" },
              { text: "A3" }
            ],
            [
              { text: "B1" },
              { text: "B2" },
              { text: "B3" }
            ]
          ])
        ]
      });
    });

    await waitFor(() => {
      expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
    });

    const geometry = mockTableGeometry(editor, {
      tableRect: new DOMRect(120, 140, 420, 180),
      wrapperClientHeight: 180,
      wrapperClientWidth: 420,
      wrapperOffsetHeight: 192,
      wrapperOffsetWidth: 460,
      wrapperRect: new DOMRect(100, 120, 460, 220),
      wrapperScrollWidth: 520
    });
    let geometryRestored = false;

    try {
      await act(async () => {
        editor.commands.setTextSelection(getTableCellParagraphPosition(editor, 4) + 1);
      });

      const columnButton = await screen.findByRole("button", { name: "Table column 2 options" });
      fireEvent.click(columnButton);
      expect(await screen.findByRole("menu", { name: "Table column menu" })).toBeInTheDocument();

      geometry.restore();
      geometryRestored = true;

      await act(async () => {
        editor.destroy();
      });
      await waitFor(() => {
        expect(editor.isDestroyed).toBe(true);
      });

      await act(async () => {
        harness.triggerResize();
      });
    } finally {
      if (!geometryRestored) {
        geometry.restore();
      }
    }
  });

  it.each([
    {
      itemLabel: "Move up",
      menuItemName: "Table row 2 options",
      expectedGrid: [
        ["B1", "H2", "B3"],
        ["H1", "A1", "H3"],
        ["H4", "C2", "H6"]
      ],
      selectionRect: {
        bottom: 1,
        left: 0,
        right: 3,
        top: 0
      },
      targetIndex: 0
    },
    {
      itemLabel: "Move down",
      menuItemName: "Table row 2 options",
      expectedGrid: [
        ["H1", "A1", "H3"],
        ["H4", "C2", "H6"],
        ["B1", "H2", "B3"]
      ],
      selectionRect: {
        bottom: 3,
        left: 0,
        right: 3,
        top: 2
      },
      targetIndex: 2
    }
  ] as const)(
    "moves a middle row %s, keeps the moved row selected, and restores the table on undo",
    async ({ itemLabel, menuItemName, expectedGrid, selectionRect, targetIndex }) => {
      const harness = createOverlayOwnerDocumentHarness(1280, 720);
      const overlayRoot = document.createElement("div");
      Object.defineProperty(overlayRoot, "ownerDocument", {
        configurable: true,
        value: harness.ownerDocument
      });
      const { editorReady, onSaveDraft } = renderRuntime({}, { overlayRoot });

      await waitFor(() => {
        expect(editorReady[0]).toBeDefined();
      });

      const editor = editorReady[0];
      await act(async () => {
        editor.commands.setContent(createMoveTableDocument(createRichMoveTableRows()));
      });

      await waitFor(() => {
        expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
      });

      const startingDocument = editor.getJSON();
      const undoDepthBefore = undoDepth(editor.state);
      const geometry = mockTableGeometry(editor, {
        tableRect: new DOMRect(120, 140, 420, 180),
        wrapperClientHeight: 180,
        wrapperClientWidth: 420,
        wrapperOffsetHeight: 192,
        wrapperOffsetWidth: 460,
        wrapperRect: new DOMRect(100, 120, 460, 220),
        wrapperScrollWidth: 520
      });

      try {
        await act(async () => {
          editor.commands.setTextSelection(getTableCellParagraphPosition(editor, 4) + 1);
        });

        expect(getTableTextGrid(editor)).toEqual([
          ["H1", "A1", "H3"],
          ["B1", "H2", "B3"],
          ["H4", "C2", "H6"]
        ]);

        const rowButton = await screen.findByRole("button", { name: menuItemName });
        fireEvent.click(rowButton);
        const menu = await screen.findByRole("menu", { name: "Table row menu" });
        expect(getMenuItemNames(menu, "menuitem")).toEqual([
          "Insert before",
          "Insert after",
          "Move up",
          "Move down",
          "Copy row",
          "Delete row"
        ]);
        expect(getCellSelectionRect(editor)).toEqual({
          top: 1,
          bottom: 2,
          left: 0,
          right: 3
        });

        const selection = editor.state.selection;
        if (!(selection instanceof CellSelection)) {
          throw new Error("Expected a row CellSelection before moving the table row.");
        }
        const tableContext = findTable(selection.$anchorCell);
        if (!tableContext) {
          throw new Error("Expected the active table context before moving the table row.");
        }
        const preview = previewMoveTableDocument(editor, (state, dispatch) =>
          moveTableRow({
            from: 1,
            pos: tableContext.start,
            select: true,
            to: targetIndex
          })(state, dispatch)
        );
        expect(preview.commandResult).toBe(true);
        expect(preview.docChanged).toBe(true);

        const menuItem = within(menu).getByRole("menuitem", { name: itemLabel });
        const beforeDocument = editor.getJSON();
        const beforeSelection = getCellSelectionRect(editor);
        let transactions: Array<{
          addToHistory: unknown;
          docChanged: boolean;
          selectionSet: boolean;
          steps: number;
        }> = [];
        try {
          await act(async () => {
            await activateTableMenuItemWithBrowserPointer(menuItem);
          });

          expect(editor.getJSON()).toEqual(beforeDocument);
          expect(getCellSelectionRect(editor)).toEqual(beforeSelection);
          expect(getTableMenu(overlayRoot, "row")).not.toBeNull();

          await act(async () => {
            transactions = captureCommandTransactions(editor, () => {
              fireEvent.click(menuItem);
            });
          });

          await waitFor(() => {
            expect(getTableMenu(overlayRoot, "row")).toBeNull();
            expect(document.activeElement).toBe(editor.view.dom);
          });

          expect(transactions.length).toBeGreaterThanOrEqual(2);
          expect(transactions.some((transaction) => transaction.docChanged)).toBe(true);
          expect(transactions.filter((transaction) => transaction.docChanged)).toHaveLength(1);
          expect(editor.getJSON()).toEqual(preview.document);
          expect(getTableTextGrid(editor)).toEqual(expectedGrid);
          expect(getCellSelectionRect(editor)).toEqual(selectionRect);
          expect(harness.ownerWindowSetTimeout).not.toHaveBeenCalled();
        } finally {
          harness.ownerWindowSetTimeout.mockClear();
        }

        expect(undoDepth(editor.state)).toBe(undoDepthBefore + 1);
        await runAutosave();
        expect(onSaveDraft).toHaveBeenCalledTimes(1);

        await act(async () => {
          editor.commands.undo();
        });

        expect(editor.getJSON()).toEqual(startingDocument);
        expect(undoDepth(editor.state)).toBe(undoDepthBefore);
      } finally {
        geometry.restore();
      }
    }
  );

  it.each([
    {
      itemLabel: "Move left",
      menuItemName: "Table column 2 options",
      expectedGrid: [
        ["A1", "H1", "H3"],
        ["H2", "B1", "B3"],
        ["C2", "H4", "H6"]
      ],
      selectionRect: {
        bottom: 3,
        left: 0,
        right: 1,
        top: 0
      },
      targetIndex: 0,
      wrapperScrollLeft: 136
    },
    {
      itemLabel: "Move right",
      menuItemName: "Table column 2 options",
      expectedGrid: [
        ["H1", "H3", "A1"],
        ["B1", "B3", "H2"],
        ["H4", "H6", "C2"]
      ],
      selectionRect: {
        bottom: 3,
        left: 2,
        right: 3,
        top: 0
      },
      targetIndex: 2,
      wrapperScrollLeft: 136
    }
  ] as const)(
    "moves a middle column %s without losing the selected structural target, and restores the table on undo",
    async ({ itemLabel, menuItemName, expectedGrid, selectionRect, targetIndex, wrapperScrollLeft }) => {
      const harness = createOverlayOwnerDocumentHarness(1280, 720);
      const overlayRoot = document.createElement("div");
      Object.defineProperty(overlayRoot, "ownerDocument", {
        configurable: true,
        value: harness.ownerDocument
      });
      const { editorReady, onSaveDraft } = renderRuntime({}, { overlayRoot });

      await waitFor(() => {
        expect(editorReady[0]).toBeDefined();
      });

      const editor = editorReady[0];
      await act(async () => {
        editor.commands.setContent(createMoveTableDocument(createRichMoveTableRows()));
      });

      await waitFor(() => {
        expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
      });

      const startingDocument = editor.getJSON();
      const undoDepthBefore = undoDepth(editor.state);
      const geometry = mockTableGeometry(editor, {
        tableRect: new DOMRect(120, 140, 420, 180),
        wrapperClientHeight: 180,
        wrapperClientWidth: 420,
        wrapperOffsetHeight: 192,
        wrapperOffsetWidth: 460,
        wrapperRect: new DOMRect(100, 120, 460, 220),
        wrapperScrollLeft,
        wrapperScrollWidth: 720
      });

      try {
        await act(async () => {
          editor.commands.setTextSelection(getTableCellParagraphPosition(editor, 4) + 1);
        });

        expect(getTableTextGrid(editor)).toEqual([
          ["H1", "A1", "H3"],
          ["B1", "H2", "B3"],
          ["H4", "C2", "H6"]
        ]);

        const columnButton = await screen.findByRole("button", { name: menuItemName });
        fireEvent.click(columnButton);
        const menu = await screen.findByRole("menu", { name: "Table column menu" });
        expect(getMenuItemNames(menu, "menuitem")).toEqual([
          "Insert before",
          "Insert after",
          "Move left",
          "Move right",
          "Align left",
          "Align center",
          "Align right",
          "Copy column",
          "Delete column"
        ]);
        expect(getCellSelectionRect(editor)).toEqual({
          top: 0,
          bottom: 3,
          left: 1,
          right: 2
        });

        const selection = editor.state.selection;
        if (!(selection instanceof CellSelection)) {
          throw new Error("Expected a column CellSelection before moving the table column.");
        }
        const tableContext = findTable(selection.$anchorCell);
        if (!tableContext) {
          throw new Error("Expected the active table context before moving the table column.");
        }
        const preview = previewMoveTableDocument(editor, (state, dispatch) =>
          moveTableColumn({
            from: 1,
            pos: tableContext.start,
            select: true,
            to: targetIndex
          })(state, dispatch)
        );
        expect(preview.commandResult).toBe(true);
        expect(preview.docChanged).toBe(true);

        const menuItem = within(menu).getByRole("menuitem", { name: itemLabel });
        const beforeDocument = editor.getJSON();
        const beforeSelection = getCellSelectionRect(editor);
        let transactions: Array<{
          addToHistory: unknown;
          docChanged: boolean;
          selectionSet: boolean;
          steps: number;
        }> = [];
        try {
          await act(async () => {
            await activateTableMenuItemWithBrowserPointer(menuItem);
          });

          expect(editor.getJSON()).toEqual(beforeDocument);
          expect(getCellSelectionRect(editor)).toEqual(beforeSelection);
          expect(getTableMenu(overlayRoot, "column")).not.toBeNull();

          await act(async () => {
            transactions = captureCommandTransactions(editor, () => {
              fireEvent.click(menuItem);
            });
          });

          await waitFor(() => {
            expect(getTableMenu(overlayRoot, "column")).toBeNull();
            expect(document.activeElement).toBe(editor.view.dom);
          });

          expect(transactions.length).toBeGreaterThanOrEqual(2);
          expect(transactions.some((transaction) => transaction.docChanged)).toBe(true);
          expect(transactions.filter((transaction) => transaction.docChanged)).toHaveLength(1);
          expect(editor.getJSON()).toEqual(preview.document);
          expect(getTableTextGrid(editor)).toEqual(expectedGrid);
          expect(getCellSelectionRect(editor)).toEqual(selectionRect);
          expect(harness.ownerWindowSetTimeout).not.toHaveBeenCalled();
        } finally {
          harness.ownerWindowSetTimeout.mockClear();
        }

        expect(undoDepth(editor.state)).toBe(undoDepthBefore + 1);
        await runAutosave();
        expect(onSaveDraft).toHaveBeenCalledTimes(1);

        await act(async () => {
          editor.commands.undo();
        });

        expect(editor.getJSON()).toEqual(startingDocument);
        expect(undoDepth(editor.state)).toBe(undoDepthBefore);
      } finally {
        geometry.restore();
      }
    }
  );

  it("copies a row as structured clipboard data, truncates on paste into a smaller row, and falls back to ordinary paste after expiry", async () => {
    const clipboardHarness = installStructuredClipboardWriteHarness();
    const harness = createOverlayOwnerDocumentHarness(1280, 720);
    const overlayRoot = document.createElement("div");
    Object.defineProperty(overlayRoot, "ownerDocument", {
      configurable: true,
      value: harness.ownerDocument
    });
    const { editorReady } = renderRuntime({}, { overlayRoot });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    let currentTime = 1_700_000_000_000;
    const dateNowSpy = vi.spyOn(Date, "now").mockImplementation(() => currentTime);
    const rowProvenanceToken = "11111111-1111-4111-8111-111111111111";
    const randomUUIDSpy = vi.spyOn(crypto, "randomUUID").mockReturnValue(rowProvenanceToken);

    try {
      await act(async () => {
        editor.commands.setContent({
          type: "doc",
          content: [
            createTextTableNode([["Src1", "Src2", "Src3", "Src4"]])
          ]
        });
      });

      await waitFor(() => {
        expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
      });

      const geometry = mockTableGeometry(editor, {
        tableRect: new DOMRect(120, 140, 560, 96),
        wrapperClientHeight: 96,
        wrapperClientWidth: 560,
        wrapperOffsetHeight: 108,
        wrapperOffsetWidth: 600,
        wrapperRect: new DOMRect(100, 120, 600, 160),
        wrapperScrollWidth: 640
      });

      const prepareRowDestination = async () => {
        await act(async () => {
          editor.commands.setContent({
            type: "doc",
            content: [
              createTextTableNode([["Dst1", "Dst2"]])
            ]
          });
        });

        await waitFor(() => {
          expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
        });

        await act(async () => {
          editor.commands.setTextSelection(getTableCellParagraphPosition(editor, 0) + 1);
        });
        selectStructuredTableRow(editor, 0);
        await act(async () => {
          editor.commands.focus(undefined, { scrollIntoView: false });
        });
      };

      try {
        await act(async () => {
          editor.commands.setTextSelection(getTableCellParagraphPosition(editor, 0) + 1);
        });

        const rowButton = await screen.findByRole("button", { name: "Table row 1 options" });
        fireEvent.click(rowButton);
        const menu = await screen.findByRole("menu", { name: "Table row menu" });
        const copyRowItem = within(menu).getByRole("menuitem", { name: "Copy row" });
        const sourceDocument = editor.getJSON();
        const sourceUndoDepth = undoDepth(editor.state);
        fireEvent.click(copyRowItem);

        await waitFor(() => {
          expect(clipboardHarness.clipboardWrite).toHaveBeenCalledTimes(1);
        });

        const writtenClipboardItems = clipboardHarness.clipboardWrite.mock.calls[0]?.[0] as MockClipboardItem[] | undefined;
        const writtenClipboardItem = writtenClipboardItems?.[0];
        if (!writtenClipboardItem) {
          throw new Error("Expected structured row copy to write a clipboard item.");
        }

        expect(writtenClipboardItem.types).toContain(STRUCTURED_TABLE_CLIPBOARD_PROVENANCE_MIME);
        expect(writtenClipboardItem.types).toContain("text/plain");
        expect(MockClipboardItem.supports(STRUCTURED_TABLE_CLIPBOARD_PROVENANCE_MIME)).toBe(true);
        expect(editor.getJSON()).toEqual(sourceDocument);
        expect(undoDepth(editor.state)).toBe(sourceUndoDepth);
        expect(getTableMenu(overlayRoot, "row")).toBeNull();
        await prepareRowDestination();

        const matchingClipboardText = "Src1\nSrc2\nSrc3\nSrc4";
        const beforeDocument = editor.getJSON();
        const beforeUndoDepth = undoDepth(editor.state);
        const matchingTransactions = captureCommandTransactions(editor, () => {
          fireEvent.paste(editor.view.dom, {
            clipboardData: createClipboardData("<p>Src1</p>", matchingClipboardText, {
              [STRUCTURED_TABLE_CLIPBOARD_PROVENANCE_MIME]: rowProvenanceToken
            })
          } as never);
        });

        expect(matchingTransactions.some((transaction) => transaction.docChanged)).toBe(true);
        expect(matchingTransactions.filter((transaction) => transaction.docChanged)).toHaveLength(1);
        expect(getTableTextGrid(editor)).toEqual([["Src1", "Src2"]]);
        expect(undoDepth(editor.state)).toBe(beforeUndoDepth + 1);

        await act(async () => {
          editor.commands.undo();
        });

        expect(editor.getJSON()).toEqual(beforeDocument);

        await prepareRowDestination();

        const beforeDifferentTextDocument = editor.getJSON();
        const differentTextTransactions = captureCommandTransactions(editor, () => {
          fireEvent.paste(editor.view.dom, {
            clipboardData: createClipboardData("<p>Ignored different text</p>", "Different plain text")
          } as never);
        });

        expect(differentTextTransactions.some((transaction) => transaction.docChanged)).toBe(true);
        expect(differentTextTransactions.filter((transaction) => transaction.docChanged)).toHaveLength(1);
        expect(editor.state.doc.textContent).toContain("Ignored different text");
        expect(JSON.stringify(editor.getJSON())).not.toContain("Src1");
        expect(JSON.stringify(editor.getJSON())).not.toContain("Src2");

        await act(async () => {
          editor.commands.undo();
        });

        expect(editor.getJSON()).toEqual(beforeDifferentTextDocument);

        await prepareRowDestination();

        const beforeSameTextDocument = editor.getJSON();
        const sameTextWithoutProvenanceTransactions = captureCommandTransactions(editor, () => {
          fireEvent.paste(editor.view.dom, {
            clipboardData: createClipboardData("<p>Ignored same text</p>", matchingClipboardText)
          } as never);
        });

        expect(sameTextWithoutProvenanceTransactions.some((transaction) => transaction.docChanged)).toBe(true);
        expect(sameTextWithoutProvenanceTransactions.filter((transaction) => transaction.docChanged)).toHaveLength(1);
        expect(editor.state.doc.textContent).toContain("Ignored same text");
        expect(JSON.stringify(editor.getJSON())).not.toContain("Src1");
        expect(JSON.stringify(editor.getJSON())).not.toContain("Src2");

        await act(async () => {
          editor.commands.undo();
        });

        expect(editor.getJSON()).toEqual(beforeSameTextDocument);

        await prepareRowDestination();

        const beforeWrongProvenanceDocument = editor.getJSON();
        const wrongProvenanceTransactions = captureCommandTransactions(editor, () => {
          fireEvent.paste(editor.view.dom, {
            clipboardData: createClipboardData("<p>Ignored wrong provenance</p>", matchingClipboardText, {
              [STRUCTURED_TABLE_CLIPBOARD_PROVENANCE_MIME]: "different-token"
            })
          } as never);
        });

        expect(wrongProvenanceTransactions.some((transaction) => transaction.docChanged)).toBe(true);
        expect(wrongProvenanceTransactions.filter((transaction) => transaction.docChanged)).toHaveLength(1);
        expect(editor.state.doc.textContent).toContain("Ignored wrong provenance");
        expect(JSON.stringify(editor.getJSON())).not.toContain("Src1");
        expect(JSON.stringify(editor.getJSON())).not.toContain("Src2");

        await act(async () => {
          editor.commands.undo();
        });

        expect(editor.getJSON()).toEqual(beforeWrongProvenanceDocument);

        currentTime += 1_000;

        await prepareRowDestination();

        const fallbackBeforeDocument = editor.getJSON();
        const fallbackTransactions = captureCommandTransactions(editor, () => {
          fireEvent.paste(editor.view.dom, {
            clipboardData: createClipboardData("<p>Ignored</p>", "Ignored")
          } as never);
        });

        expect(fallbackTransactions.some((transaction) => transaction.docChanged)).toBe(true);
        expect(fallbackTransactions.filter((transaction) => transaction.docChanged)).toHaveLength(1);
        expect(editor.state.doc.textContent).toContain("Ignored");
        expect(JSON.stringify(editor.getJSON())).not.toContain("Src1");
        expect(JSON.stringify(editor.getJSON())).not.toContain("Src2");

        await act(async () => {
          editor.commands.undo();
        });

        expect(editor.getJSON()).toEqual(fallbackBeforeDocument);

        currentTime += 5 * 60 * 1000 + 1;

        await act(async () => {
          editor.commands.setContent({
            type: "doc",
            content: [{ type: "paragraph" }]
          });
        });

        await pasteIntoEditorAtCurrentSelection(editor, "<p>Fallback</p>", "Fallback");
        expect(editor.state.doc.textContent).toBe("Fallback");
      } finally {
        geometry.restore();
      }
    } finally {
      clipboardHarness.restore();
      randomUUIDSpy.mockRestore();
      dateNowSpy.mockRestore();
    }
  });

  it("copies a column as structured clipboard data, truncates on paste into a smaller column, and restores the prior table on undo", async () => {
    const clipboardHarness = installStructuredClipboardWriteHarness();
    const harness = createOverlayOwnerDocumentHarness(1280, 720);
    const overlayRoot = document.createElement("div");
    Object.defineProperty(overlayRoot, "ownerDocument", {
      configurable: true,
      value: harness.ownerDocument
    });
    const { editorReady } = renderRuntime({}, { overlayRoot });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          createTextTableNode([["Src1"], ["Src2"], ["Src3"], ["Src4"]])
        ]
      });
    });

    await waitFor(() => {
      expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
    });

    const geometry = mockTableGeometry(editor, {
      tableRect: new DOMRect(120, 140, 180, 192),
      wrapperClientHeight: 192,
      wrapperClientWidth: 180,
      wrapperOffsetHeight: 204,
      wrapperOffsetWidth: 220,
      wrapperRect: new DOMRect(100, 120, 220, 240),
      wrapperScrollWidth: 240
    });
    const columnProvenanceToken = "22222222-2222-4222-8222-222222222222";
    const randomUUIDSpy = vi.spyOn(crypto, "randomUUID").mockReturnValue(columnProvenanceToken);

    try {
      await act(async () => {
        editor.commands.setTextSelection(getTableCellParagraphPosition(editor, 0) + 1);
      });

      const columnButton = await screen.findByRole("button", { name: "Table column 1 options" });
      fireEvent.click(columnButton);
      const menu = await screen.findByRole("menu", { name: "Table column menu" });
      const copyColumnItem = within(menu).getByRole("menuitem", { name: "Copy column" });
      const sourceDocument = editor.getJSON();
      const sourceUndoDepth = undoDepth(editor.state);
      fireEvent.click(copyColumnItem);

      await waitFor(() => {
        expect(clipboardHarness.clipboardWrite).toHaveBeenCalledTimes(1);
      });

      const writtenClipboardItems = clipboardHarness.clipboardWrite.mock.calls[0]?.[0] as MockClipboardItem[] | undefined;
      const writtenClipboardItem = writtenClipboardItems?.[0];
      if (!writtenClipboardItem) {
        throw new Error("Expected structured column copy to write a clipboard item.");
      }

      expect(writtenClipboardItem.types).toContain(STRUCTURED_TABLE_CLIPBOARD_PROVENANCE_MIME);
      expect(writtenClipboardItem.types).toContain("text/plain");
      expect(MockClipboardItem.supports(STRUCTURED_TABLE_CLIPBOARD_PROVENANCE_MIME)).toBe(true);
      expect(editor.getJSON()).toEqual(sourceDocument);
      expect(undoDepth(editor.state)).toBe(sourceUndoDepth);
      expect(getTableMenu(overlayRoot, "column")).toBeNull();
    } finally {
      geometry.restore();
      clipboardHarness.restore();
      randomUUIDSpy.mockRestore();
    }

    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          createTextTableNode([["Dst1"], ["Dst2"]])
        ]
      });
    });

    await waitFor(() => {
      expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
    });

    await act(async () => {
      editor.commands.setTextSelection(getTableCellParagraphPosition(editor, 0) + 1);
    });
    selectStructuredTableColumn(editor, 0);
    await act(async () => {
      editor.commands.focus(undefined, { scrollIntoView: false });
    });

    const matchingClipboardText = "Src1\nSrc2\nSrc3\nSrc4";
    const beforeDocument = editor.getJSON();
    const beforeUndoDepth = undoDepth(editor.state);
    const transactions = captureCommandTransactions(editor, () => {
      fireEvent.paste(editor.view.dom, {
        clipboardData: createClipboardData("<p>Src1</p>", matchingClipboardText, {
          [STRUCTURED_TABLE_CLIPBOARD_PROVENANCE_MIME]: columnProvenanceToken
        })
      } as never);
    });

    expect(transactions.some((transaction) => transaction.docChanged)).toBe(true);
    expect(transactions.filter((transaction) => transaction.docChanged)).toHaveLength(1);
    expect(getTableTextGrid(editor)).toEqual([["Src1"], ["Src2"]]);
    expect(undoDepth(editor.state)).toBe(beforeUndoDepth + 1);

    await act(async () => {
      editor.commands.undo();
    });

    expect(editor.getJSON()).toEqual(beforeDocument);
  });

  it("copies and pastes an ordinary rectangular cell range through the stock table clipboard path", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];

    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          createStyledTextTableNode([
            [
              { marks: [{ type: "bold" }], text: "Src11" },
              { text: "Src12" },
              { text: "Src13" }
            ],
            [
              { text: "Src21" },
              { marks: [{ type: "italic" }], text: "Src22" },
              { text: "Src23" }
            ],
            [
              { text: "Src31" },
              { text: "Src32" },
              { text: "Src33" }
            ]
          ])
        ]
      });
    });

    await waitFor(() => {
      expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
    });

    const cleanup: Array<() => void> = [];

    try {
      const sourceGeometry = mockTableGeometry(editor, {
        tableRect: new DOMRect(120, 140, 360, 168),
        wrapperClientHeight: 168,
        wrapperClientWidth: 360,
        wrapperOffsetHeight: 180,
        wrapperOffsetWidth: 400,
        wrapperRect: new DOMRect(100, 120, 400, 220),
        wrapperScrollWidth: 360
      });
      cleanup.push(() => sourceGeometry.restore());

      await act(async () => {
        await dragTableSelection(
          getTableCellElement(editor, 1, 1),
          getTableCellElement(editor, 2, 2),
          17
        );
      });

      await waitFor(() => {
        expect(editor.state.selection instanceof CellSelection).toBe(true);
        expect(getCellSelectionRect(editor)).toEqual({
          bottom: 2,
          left: 0,
          right: 2,
          top: 0
        });
      });

      const clipboardData = createMutableClipboardData();
      fireEvent.copy(editor.view.dom, {
        clipboardData
      } as never);

      expect(clipboardData.types).not.toContain(STRUCTURED_TABLE_CLIPBOARD_PROVENANCE_MIME);
      expect(clipboardData.getData("text/html")).toContain("<table");
      expect(clipboardData.getData("text/plain")).toBe("Src11\n\nSrc12\n\nSrc21\n\nSrc22");
      expect(clipboardData.getData("text/plain")).not.toContain("Src13");
      expect(clipboardData.getData("text/plain")).not.toContain("Src23");
      expect(clipboardData.getData("text/plain")).not.toContain("Src31");
      expect(clipboardData.getData("text/plain")).not.toContain("Src32");
      expect(clipboardData.getData("text/plain")).not.toContain("Src33");

      const pasteClipboardData = createMutableClipboardData();
      pasteClipboardData.setData("text/html", clipboardData.getData("text/html"));
      pasteClipboardData.setData("text/plain", clipboardData.getData("text/plain"));

      await act(async () => {
        editor.commands.setContent({
          type: "doc",
          content: [createTextTableNode([["Dst11", "Dst12"], ["Dst21", "Dst22"]])]
        });
        editor.view.dispatch(closeHistory(editor.state.tr));
      });

      await waitFor(() => {
        expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
      });

      cleanup.pop()?.();

      const destinationGeometry = mockTableGeometry(editor, {
        tableRect: new DOMRect(120, 140, 240, 112),
        wrapperClientHeight: 112,
        wrapperClientWidth: 240,
        wrapperOffsetHeight: 124,
        wrapperOffsetWidth: 280,
        wrapperRect: new DOMRect(100, 120, 280, 180),
        wrapperScrollWidth: 240
      });
      cleanup.push(() => destinationGeometry.restore());

      await act(async () => {
        editor.commands.setTextSelection(getTableCellTextPositionAt(editor, 1, 1));
        editor.commands.focus(undefined, { scrollIntoView: false });
      });

      const beforeOverwriteDocument = editor.getJSON();
      const overwriteTransactions = captureCommandTransactions(editor, () => {
        fireEvent.paste(editor.view.dom, {
          clipboardData: pasteClipboardData
        } as never);
      });

      expect(overwriteTransactions.some((transaction) => transaction.docChanged)).toBe(true);
      expect(overwriteTransactions.filter((transaction) => transaction.docChanged)).toHaveLength(1);
      expect(getTableTextGrid(editor)).toEqual([
        ["Src11", "Src12"],
        ["Src21", "Src22"]
      ]);
      expect(getTableCellContent(editor, 1, 1)).toMatchObject([
        {
          type: "text",
          text: "Src11",
          marks: [{ type: "bold" }]
        }
      ]);
      expect(getTableCellContent(editor, 2, 2)).toMatchObject([
        {
          type: "text",
          text: "Src22",
          marks: [{ type: "italic" }]
        }
      ]);

      await act(async () => {
        editor.commands.undo();
      });

      expect(editor.getJSON()).toEqual(beforeOverwriteDocument);

      await act(async () => {
        editor.commands.setContent({
          type: "doc",
          content: [createTextTableNode([["Dst11", "Dst12"], ["Dst21", "Dst22"]])]
        });
        editor.view.dispatch(closeHistory(editor.state.tr));
      });

      await waitFor(() => {
        expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
      });

      cleanup.pop()?.();

      const expansionGeometry = mockTableGeometry(editor, {
        tableRect: new DOMRect(120, 140, 240, 112),
        wrapperClientHeight: 112,
        wrapperClientWidth: 240,
        wrapperOffsetHeight: 124,
        wrapperOffsetWidth: 280,
        wrapperRect: new DOMRect(100, 120, 280, 180),
        wrapperScrollWidth: 240
      });
      cleanup.push(() => expansionGeometry.restore());

      await act(async () => {
        editor.commands.setTextSelection(getTableCellTextPositionAt(editor, 2, 2));
        editor.commands.focus(undefined, { scrollIntoView: false });
      });

      const beforeExpansionDocument = editor.getJSON();
      const expansionTransactions = captureCommandTransactions(editor, () => {
        fireEvent.paste(editor.view.dom, {
          clipboardData: pasteClipboardData
        } as never);
      });

      expect(expansionTransactions.some((transaction) => transaction.docChanged)).toBe(true);
      expect(expansionTransactions.filter((transaction) => transaction.docChanged)).toHaveLength(1);
      expect(getTableShape(editor)).toEqual({
        columns: 3,
        rows: 3
      });
      expect(getTableTextGrid(editor)).toEqual([
        ["Dst11", "Dst12", ""],
        ["Dst21", "Src11", "Src12"],
        ["", "Src21", "Src22"]
      ]);
      expect(getTableCellContent(editor, 2, 2)).toMatchObject([
        {
          type: "text",
          text: "Src11",
          marks: [{ type: "bold" }]
        }
      ]);

      await act(async () => {
        editor.commands.undo();
      });

      expect(editor.getJSON()).toEqual(beforeExpansionDocument);
    } finally {
      for (const restore of cleanup.reverse()) {
        restore();
      }
    }
  });

  it("still copies and pastes ordinary text through the browser clipboard path", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "Plain text" }] }]
      });
    });

    await selectText(editor, 1, 6);
    await act(async () => {
      editor.commands.focus(undefined, { scrollIntoView: false });
    });

    const clipboardData = createMutableClipboardData();
    fireEvent.copy(editor.view.dom, {
      clipboardData
    } as never);

    expect(clipboardData.getData("text/plain")).toBe("Plain");
    expect(clipboardData.types).not.toContain(STRUCTURED_TABLE_CLIPBOARD_PROVENANCE_MIME);

    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [{ type: "paragraph" }]
      });
    });

    await act(async () => {
      editor.commands.setTextSelection({ from: 1, to: 1 });
      editor.commands.focus(undefined, { scrollIntoView: false });
    });

    const transactions = captureCommandTransactions(editor, () => {
      fireEvent.paste(editor.view.dom, {
        clipboardData
      } as never);
    });

    expect(transactions.some((transaction) => transaction.docChanged)).toBe(true);
    expect(transactions.filter((transaction) => transaction.docChanged)).toHaveLength(1);
    expect(editor.state.doc.textContent).toBe("Plain");
  });

  it.each([
    {
      disabledItemLabel: "Move up",
      menuItemName: "Table row 1 options",
      selectionPosition: 1
    },
    {
      disabledItemLabel: "Move down",
      menuItemName: "Table row 3 options",
      selectionPosition: 7
    }
  ] as const)(
    "renders the row boundary move action %s as disabled and ignores clicks",
    async ({ disabledItemLabel, menuItemName, selectionPosition }) => {
      const harness = createOverlayOwnerDocumentHarness(1280, 720);
      const overlayRoot = document.createElement("div");
      Object.defineProperty(overlayRoot, "ownerDocument", {
        configurable: true,
        value: harness.ownerDocument
      });
      const { editorReady } = renderRuntime({}, { overlayRoot });

      await waitFor(() => {
        expect(editorReady[0]).toBeDefined();
      });

      const editor = editorReady[0];
      await act(async () => {
        editor.commands.setContent(createMoveTableDocument(createRichMoveTableRows()));
      });

      await waitFor(() => {
        expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
      });

      const geometry = mockTableGeometry(editor, {
        tableRect: new DOMRect(120, 140, 420, 180),
        wrapperClientHeight: 180,
        wrapperClientWidth: 420,
        wrapperOffsetHeight: 192,
        wrapperOffsetWidth: 460,
        wrapperRect: new DOMRect(100, 120, 460, 220),
        wrapperScrollWidth: 520
      });

      try {
        await act(async () => {
          editor.commands.setTextSelection(getTableCellParagraphPosition(editor, selectionPosition) + 1);
        });

        const rowButton = await screen.findByRole("button", { name: menuItemName });
        fireEvent.click(rowButton);
        const menu = await screen.findByRole("menu", { name: "Table row menu" });
        expect(getMenuItemNames(menu, "menuitem")).toEqual([
          "Insert before",
          "Insert after",
          "Move up",
          "Move down",
          "Copy row",
          "Delete row"
        ]);

        const disabledItem = within(menu).getByRole("menuitem", { name: disabledItemLabel });
        expect(disabledItem).toBeDisabled();

        const beforeDocument = editor.getJSON();
        const beforeSelection = getCellSelectionRect(editor);
        const beforeUndoDepth = undoDepth(editor.state);
        fireEvent.click(disabledItem);

        expect(editor.getJSON()).toEqual(beforeDocument);
        expect(getCellSelectionRect(editor)).toEqual(beforeSelection);
        expect(undoDepth(editor.state)).toBe(beforeUndoDepth);
        expect(getTableMenu(overlayRoot, "row")).not.toBeNull();
      } finally {
        geometry.restore();
      }
    }
  );

  it.each([
    {
      disabledItemLabel: "Move left",
      menuItemName: "Table column 1 options",
      selectionPosition: 0
    },
    {
      disabledItemLabel: "Move right",
      menuItemName: "Table column 3 options",
      selectionPosition: 2
    }
  ] as const)(
    "renders the column boundary move action %s as disabled and ignores clicks",
    async ({ disabledItemLabel, menuItemName, selectionPosition }) => {
      const harness = createOverlayOwnerDocumentHarness(1280, 720);
      const overlayRoot = document.createElement("div");
      Object.defineProperty(overlayRoot, "ownerDocument", {
        configurable: true,
        value: harness.ownerDocument
      });
      const { editorReady } = renderRuntime({}, { overlayRoot });

      await waitFor(() => {
        expect(editorReady[0]).toBeDefined();
      });

      const editor = editorReady[0];
      await act(async () => {
        editor.commands.setContent(createMoveTableDocument(createRichMoveTableRows()));
      });

      await waitFor(() => {
        expect(getTableWrapperElement(editor)).toBeInstanceOf(HTMLElement);
      });

      const geometry = mockTableGeometry(editor, {
        tableRect: new DOMRect(120, 140, 420, 180),
        wrapperClientHeight: 180,
        wrapperClientWidth: 420,
        wrapperOffsetHeight: 192,
        wrapperOffsetWidth: 460,
        wrapperRect: new DOMRect(100, 120, 460, 220),
        wrapperScrollLeft: 136,
        wrapperScrollWidth: 720
      });

      try {
        await act(async () => {
          editor.commands.setTextSelection(getTableCellParagraphPosition(editor, selectionPosition) + 1);
        });

        const columnButton = await screen.findByRole("button", { name: menuItemName });
        fireEvent.click(columnButton);
        const menu = await screen.findByRole("menu", { name: "Table column menu" });
        expect(getMenuItemNames(menu, "menuitem")).toEqual([
          "Insert before",
          "Insert after",
          "Move left",
          "Move right",
          "Align left",
          "Align center",
          "Align right",
          "Copy column",
          "Delete column"
        ]);

        const disabledItem = within(menu).getByRole("menuitem", { name: disabledItemLabel });
        expect(disabledItem).toBeDisabled();

        const beforeDocument = editor.getJSON();
        const beforeSelection = getCellSelectionRect(editor);
        const beforeUndoDepth = undoDepth(editor.state);
        fireEvent.click(disabledItem);

        expect(editor.getJSON()).toEqual(beforeDocument);
        expect(getCellSelectionRect(editor)).toEqual(beforeSelection);
        expect(undoDepth(editor.state)).toBe(beforeUndoDepth);
        expect(getTableMenu(overlayRoot, "column")).not.toBeNull();
      } finally {
        geometry.restore();
      }
    }
  );

  it.each([
    [
      "Heading 1",
      "heading",
      {
        type: "doc",
        content: [{ type: "heading", attrs: { level: 1 } }]
      }
    ],
    [
      "Blockquote",
      "quote",
      {
        type: "doc",
        content: [{ type: "blockquote", content: [{ type: "paragraph" }] }]
      }
    ],
    [
      "Table",
      "table",
      {
        type: "doc",
        content: [createCanonicalDefaultTableNode()]
      }
    ]
  ])("keeps Slash pointer activation equivalent to Enter for %s", async (label, query, expected) => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor, query);
    fireEvent.keyDown(editor.view.dom, { key: "Enter" });

    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();
    });
    expectCanonicalDocument(editor, expected);
    const keyboardJson = editor.getJSON();

    await act(async () => {
      editor.commands.setContent({ type: "doc", content: [{ type: "paragraph" }] });
    });

    await openSlashQuery(editor, query);
    const option = await screen.findByRole("option", { name: new RegExp(label, "i") });
    await activateCommandOptionWithBrowserPointer(editor, option);

    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();
    });
    expect(editor.getJSON()).toEqual(keyboardJson);
    expectCanonicalDocument(editor, expected);
  });

  it("creates a nested table from Slash when the active schema permits that context", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [{ type: "paragraph" }]
        }
      ]
    };
    const expected = {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [createCanonicalDefaultTableNode()]
        }
      ]
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setTextSelection(getFirstTextblockPositionInsideNode(editor, "blockquote") + 1);
    });
    await openSlashQuery(editor, "table");
    expect(await screen.findByRole("option", { name: /Table/ })).toBeInTheDocument();
    fireEvent.keyDown(editor.view.dom, { key: "Enter" });

    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();
    });
    expectCanonicalDocument(editor, expected);

    await act(async () => {
      editor.commands.setContent(initial);
      editor.commands.setTextSelection(getFirstTextblockPositionInsideNode(editor, "blockquote") + 1);
    });

    await openSlashQuery(editor, "table");
    const option = await screen.findByRole("option", { name: /Table/ });
    await activateCommandOptionWithBrowserPointer(editor, option);

    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();
    });
    expectCanonicalDocument(editor, expected);
  });

  it.each([
    [
      "Heading 1",
      "heading",
      {
        type: "doc",
        content: [{ type: "paragraph" }, { type: "heading", attrs: { level: 1 } }]
      }
    ],
    [
      "Blockquote",
      "quote",
      {
        type: "doc",
        content: [{ type: "paragraph" }, { type: "blockquote", content: [{ type: "paragraph" }] }]
      }
    ],
    [
      "Table",
      "table",
      {
        type: "doc",
        content: [{ type: "paragraph" }, createCanonicalDefaultTableNode()]
      }
    ]
  ])("keeps Quick Add pointer activation equivalent to Enter for %s", async (label, query, expected) => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);

    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    for (const character of query) {
      fireEvent.keyDown(editor.view.dom, { key: character });
    }
    fireEvent.keyDown(editor.view.dom, { key: "Enter" });

    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: "Insert block after Text" })).toBeNull();
    });
    expectCanonicalDocument(editor, expected);
    const keyboardJson = editor.getJSON();

    await act(async () => {
      editor.commands.setContent({ type: "doc", content: [{ type: "paragraph" }] });
    });

    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    for (const character of query) {
      fireEvent.keyDown(editor.view.dom, { key: character });
    }
    const quickAddMenu = await screen.findByRole("listbox", { name: "Insert block after Text" });
    const option = within(quickAddMenu).getByRole("option", { name: new RegExp(label, "i") });
    await activateCommandOptionWithBrowserPointer(editor, option);

    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: "Insert block after Text" })).toBeNull();
    });
    expect(editor.getJSON()).toEqual(keyboardJson);
    expectCanonicalDocument(editor, expected);

    geometrySpy.mockRestore();
  });

  it("exposes Table in top-level Slash, Quick Add, and schema-valid nested Slash contexts", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor, "table");
    expect(await screen.findByRole("option", { name: /Table/ })).toBeInTheDocument();
    fireEvent.keyDown(editor.view.dom, { key: "Escape" });

    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    const quickAddMenu = await screen.findByRole("listbox", { name: "Insert block after Text" });
    expect(within(quickAddMenu).getByRole("option", { name: /Table/ })).toBeInTheDocument();
    fireEvent.keyDown(editor.view.dom, { key: "Escape" });
    geometrySpy.mockRestore();

    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [{ type: "blockquote", content: [{ type: "paragraph" }] }]
      });
      editor.commands.setTextSelection(getFirstTextblockPositionInsideNode(editor, "blockquote") + 1);
    });
    fireEvent.keyDown(editor.view.dom, { key: "/" });
    let slashMenu = await screen.findByRole("listbox", { name: "Slash command menu" });
    expect(getOptionNames(slashMenu)).toContain("Table");
    fireEvent.keyDown(editor.view.dom, { key: "Escape" });

    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [{ type: "listItem", content: [{ type: "paragraph" }] }]
          }
        ]
      });
      editor.commands.setTextSelection(getFirstTextblockPositionInsideNode(editor, "listItem") + 1);
    });
    fireEvent.keyDown(editor.view.dom, { key: "/" });
    slashMenu = await screen.findByRole("listbox", { name: "Slash command menu" });
    expect(getOptionNames(slashMenu)).toContain("Table");
  });

  it.each([
    {
      label: "tableCell",
      expectedAfterBlockquote: createTableContextDocument("tableCell", [
        {
          type: "codeBlock",
          attrs: {
            language: null
          }
        }
      ]),
      getSelectionPosition: getFirstTableCellParagraphPosition,
      initialEnvelope: createTableContextDocument("tableCell", [{ type: "paragraph" }])
    },
    {
      label: "tableHeader",
      expectedAfterBlockquote: createTableContextDocument("tableHeader", [
        {
          type: "codeBlock",
          attrs: {
            language: null
          }
        }
      ]),
      getSelectionPosition: (editor: Editor) => getFirstTextblockPositionInsideNode(editor, "tableHeader"),
      initialEnvelope: createTableHeaderDocument()
    }
  ])(
    "hides Table from in-%s Slash searches, preserves nested command execution, and leaves editor state untouched while filtering",
    async ({ expectedAfterBlockquote, getSelectionPosition, initialEnvelope }) => {
      const { editorReady, onSaveDraft, onStatusChange } = renderRuntime({
        initialEnvelope: createEnvelopeFromDocument(initialEnvelope as DocseraTiptapDocument)
      });

      await waitFor(() => {
        expect(editorReady[0]).toBeDefined();
      });

      const editor = editorReady[0];
      const before = editor.getJSON();
      const beforeUndoDepth = undoDepth(editor.state);
      const beforeStatusCalls = onStatusChange.mock.calls.length;
      const beforeSaveCalls = onSaveDraft.mock.calls.length;

      await act(async () => {
        editor.commands.setTextSelection(getSelectionPosition(editor) + 1);
      });

      fireEvent.keyDown(editor.view.dom, { key: "/" });
      const slashMenu = await screen.findByRole("listbox", { name: "Slash command menu" });
      expect(getOptionNames(slashMenu)).not.toContain("Table");
      expect(getOptionNames(slashMenu)).toContain("Blockquote");
      expect(getOptionNames(slashMenu)).toContain("Code Block");

      fireEvent.keyDown(editor.view.dom, { key: "t" });
      fireEvent.keyDown(editor.view.dom, { key: "a" });
      fireEvent.keyDown(editor.view.dom, { key: "b" });
      fireEvent.keyDown(editor.view.dom, { key: "l" });
      fireEvent.keyDown(editor.view.dom, { key: "e" });

      await waitFor(() => {
        expect(within(slashMenu).queryByRole("option", { name: /Table/ })).toBeNull();
      });

      fireEvent.keyDown(editor.view.dom, { key: "Escape" });
      await waitFor(() => {
        expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();
      });

      expect(editor.getJSON()).toEqual(before);
      expect(undoDepth(editor.state)).toBe(beforeUndoDepth);
      expect(onStatusChange.mock.calls.length).toBe(beforeStatusCalls);
      expect(onSaveDraft.mock.calls.length).toBe(beforeSaveCalls);

      await runAutosave();
      expect(onSaveDraft.mock.calls.length).toBe(beforeSaveCalls);
      expect(onStatusChange).toHaveBeenLastCalledWith(
        expect.objectContaining({
          isDirty: false,
          status: "Saved"
        })
      );

      await act(async () => {
        editor.commands.setTextSelection(getSelectionPosition(editor) + 1);
      });

      fireEvent.keyDown(editor.view.dom, { key: "/" });
      fireEvent.keyDown(editor.view.dom, { key: "c" });
      fireEvent.keyDown(editor.view.dom, { key: "o" });
      fireEvent.keyDown(editor.view.dom, { key: "d" });
      fireEvent.keyDown(editor.view.dom, { key: "e" });

      const codeMenu = await screen.findByRole("listbox", { name: "Slash command menu" });
      expect(getOptionNames(codeMenu)).toContain("Code Block");
      await activateCommandOptionWithBrowserPointer(editor, within(codeMenu).getByRole("option", { name: "Code Block" }));

      await waitFor(() => {
        expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();
      });

      expectCanonicalDocument(editor, expectedAfterBlockquote);
    }
  );

  it("preserves text formatting and link controls inside table cells", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor, "table");
    fireEvent.click(await screen.findByRole("option", { name: /Table/ }));

    await act(async () => {
      editor.commands.insertContent("Cell link");
    });
    await selectFirstTableCellText(editor, "Cell");
    const toolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    fireEvent.click(within(toolbar).getByRole("button", { name: "Bold" }));

    await selectFirstTableCellText(editor, "Cell");
    fireEvent.click((await screen.findByRole("toolbar", { name: "Text formatting" })).querySelector("[aria-label='Link']") as HTMLElement);
    const dialog = await screen.findByRole("dialog", { name: "Create link" });
    const linkInput = getLinkInput(dialog);
    await act(async () => {
      fireEvent.change(linkInput, { target: { value: "https://example.com/table-cell" } });
    });
    fireEvent.keyDown(linkInput, { key: "Enter" });

    const firstCellContent = getFirstTableCellParagraphContent(editor);
    expect(firstCellContent[0]).toMatchObject({
      type: "text",
      text: "Cell",
      marks: expect.arrayContaining([
        { type: "bold" },
        expect.objectContaining({
          type: "link",
          attrs: expect.objectContaining({ href: "https://example.com/table-cell" })
        })
      ])
    });
  });

  it("pastes ordinary sanitized HTML tables and preserves supported nested table content", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await pasteIntoEditor(
      editor,
      "<table><tbody><tr><th>Head</th><th>Unsafe<script>alert(1)</script></th></tr><tr><td colspan=\"2\"><a href=\"javascript:alert(1)\">bad</a></td></tr></tbody></table>"
    );

    const parsed = parseDocseraDocumentOrThrow(editor.getJSON());
    expect(documentContainsTopLevelTable(parsed.document)).toBe(true);
    expect(JSON.stringify(parsed.document)).not.toContain("script");
    expect(JSON.stringify(parsed.document)).not.toContain("javascript:alert");
    expect(getTopLevelNodeType(parsed.document, 0)).toBe("table");

    await act(async () => {
      editor.commands.setContent({ type: "doc", content: [{ type: "paragraph" }] });
    });
    await pasteIntoEditor(editor, "<table><tr><td>Outer<table><tr><td>Inner</td></tr></table></td></tr></table>");
    const nestedParsed = parseDocseraDocumentOrThrow(editor.getJSON());
    const nestedJson = JSON.stringify(nestedParsed.document);
    expect(nestedJson.match(/"type":"table"/g)).toHaveLength(2);
    expect(nestedJson).toContain("Inner");
  });

  it("duplicates and deletes a complete table through existing whole-block actions", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor, "table");
    fireEvent.click(await screen.findByRole("option", { name: /Table/ }));

    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 96)]);
    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 64 });
    expect(await screen.findByRole("button", { name: "Add block after Table" })).toBeInTheDocument();
    const handle = await screen.findByRole("button", { name: "Select block: Table" });
    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 64 }, { button: 0, buttons: 1 });
    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerup", { clientX: 160, clientY: 64 }, { button: 0, buttons: 0 });
    let menu = await screen.findByRole("menu", { name: "Block actions for Table" });
    expect(getMenuItemNames(menu, "menuitem")).toEqual(["Duplicate", "Delete"]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Duplicate" }));

    await waitFor(() => {
      expect(editor.getJSON().content?.filter((node) => node.type === "table")).toHaveLength(2);
    });

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 64 });
    const duplicateHandle = await screen.findByRole("button", { name: "Select block: Table" });
    await dispatchOwnerPointerEvent(surface.ownerDocument, duplicateHandle, "pointerdown", { clientX: 160, clientY: 64 }, { button: 0, buttons: 1 });
    await dispatchOwnerPointerEvent(surface.ownerDocument, duplicateHandle, "pointerup", { clientX: 160, clientY: 64 }, { button: 0, buttons: 0 });
    menu = await screen.findByRole("menu", { name: "Block actions for Table" });
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Delete" }));

    await waitFor(() => {
      expect(editor.getJSON().content?.filter((node) => node.type === "table")).toHaveLength(1);
    });

    geometrySpy.mockRestore();
  });

  it("renders the compact toolbar in the accepted order with platform-aware tooltip labels", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Hello world");
    await selectText(editor, 1, 6);

    const toolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    expect(toolbar).toHaveClass("docsera-text-toolbar");
    expect(toolbar.className).not.toContain("docsera-editor-floating--bubble");
    expect(toolbar.querySelectorAll(".docsera-text-toolbar__divider")).toHaveLength(2);
    expect(getButtonNames(toolbar)).toEqual([
      "Text",
      "Bold",
      "Italic",
      "Underline",
      "Strikethrough",
      "Inline code",
      "Link",
      "More"
    ]);

    const blockTrigger = within(toolbar).getByRole("button", { name: "Text" });
    const boldButton = within(toolbar).getByRole("button", { name: "Bold" });
    const italicButton = within(toolbar).getByRole("button", { name: "Italic" });
    const underlineButton = within(toolbar).getByRole("button", { name: "Underline" });
    const strikeButton = within(toolbar).getByRole("button", { name: "Strikethrough" });
    const codeButton = within(toolbar).getByRole("button", { name: "Inline code" });
    const linkButton = within(toolbar).getByRole("button", { name: "Link" });
    const moreButton = within(toolbar).getByRole("button", { name: "More" });

    expect(blockTrigger).toHaveAttribute("aria-expanded", "false");
    expect(blockTrigger).toHaveAttribute("aria-haspopup", "menu");
    expect(blockTrigger).toHaveAttribute("aria-label", "Text");
    const closedChevronPath = getIconPathData(blockTrigger);
    expect(closedChevronPath).not.toBe("");

    expect(boldButton).toHaveAttribute("aria-pressed", "false");
    expect(boldButton).toHaveAttribute("data-shortcut", "Mod+B");
    expect(italicButton).toHaveAttribute("data-shortcut", "Mod+I");
    expect(underlineButton).toHaveAttribute("data-shortcut", "Mod+U");
    expect(strikeButton).toHaveAttribute("data-shortcut", "Mod+Shift+S");
    expect(codeButton).toHaveAttribute("data-shortcut", "Mod+E");
    expect(linkButton).toHaveAttribute("aria-pressed", "false");
    expect(linkButton).toHaveAttribute("data-shortcut", "Mod+K");
    expect(moreButton).toHaveAttribute("aria-expanded", "false");
    expect(moreButton).toHaveAttribute("aria-haspopup", "menu");

    expect(formatToolbarShortcutLabel("Mod+B", { navigator: { platform: "Win32" } } as Window)).toBe("Ctrl+B");
    expect(formatToolbarShortcutLabel("Mod+B", { navigator: { platform: "MacIntel" } } as Window)).toBe("Command+B");
  });

  it.each([
    {
      label: "paragraph to numbered list",
      initial: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Paragraph", marks: [{ type: "bold" }] }
            ]
          }
        ]
      },
      target: "numberedList",
      expected: {
        type: "doc",
        content: [
          createCanonicalOrderedListNode([
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "Paragraph", marks: [{ type: "bold" }] }
                  ]
                }
              ]
            }
          ])
        ]
      },
      expectOneUndoStep: true
    },
    {
      label: "H2 to H3",
      initial: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 2 },
            content: [
              { type: "text", text: "Heading", marks: [{ type: "bold" }] }
            ]
          }
        ]
      },
      target: "heading3",
      expected: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 3 },
            content: [
              { type: "text", text: "Heading", marks: [{ type: "bold" }] }
            ]
          }
        ]
      }
    },
    {
      label: "H3 to numbered list",
      initial: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 3 },
            content: [
              { type: "text", text: "Heading", marks: [{ type: "bold" }] }
            ]
          }
        ]
      },
      target: "numberedList",
      expected: {
        type: "doc",
        content: [
          createCanonicalOrderedListNode([
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "Heading", marks: [{ type: "bold" }] }
                  ]
                }
              ]
            }
          ])
        ]
      },
      expectOneUndoStep: true
    },
    {
      label: "unordered list to Text",
      initial: {
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      { type: "text", text: "List item", marks: [{ type: "bold" }] }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      target: "text",
      expected: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "List item", marks: [{ type: "bold" }] }
            ]
          }
        ]
      }
    },
    {
      label: "numbered list to Text",
      initial: {
        type: "doc",
        content: [
          createCanonicalOrderedListNode([
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "List item", marks: [{ type: "bold" }] }
                  ]
                }
              ]
            }
          ])
        ]
      },
      target: "text",
      expected: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "List item", marks: [{ type: "bold" }] }
            ]
          }
        ]
      },
      expectOneUndoStep: true
    },
    {
      label: "unordered list to numbered list",
      initial: {
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      { type: "text", text: "List item", marks: [{ type: "bold" }] }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      target: "numberedList",
      expected: {
        type: "doc",
        content: [
          createCanonicalOrderedListNode([
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "List item", marks: [{ type: "bold" }] }
                  ]
                }
              ]
            }
          ])
        ]
      },
      expectOneUndoStep: true
    },
    {
      label: "numbered list to unordered list",
      initial: {
        type: "doc",
        content: [
          createCanonicalOrderedListNode([
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "List item", marks: [{ type: "bold" }] }
                  ]
                }
              ]
            }
          ])
        ]
      },
      target: "bulletedList",
      expected: {
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      { type: "text", text: "List item", marks: [{ type: "bold" }] }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      expectOneUndoStep: true
    },
    {
      label: "unordered list to H2",
      initial: {
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      { type: "text", text: "List item", marks: [{ type: "bold" }] }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      },
      target: "heading2",
      expected: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 2 },
            content: [
              { type: "text", text: "List item", marks: [{ type: "bold" }] }
            ]
          }
        ]
      }
    },
    {
      label: "numbered list to H3",
      initial: {
        type: "doc",
        content: [
          createCanonicalOrderedListNode([
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    { type: "text", text: "List item", marks: [{ type: "bold" }] }
                  ]
                }
              ]
            }
          ])
        ]
      },
      target: "heading3",
      expected: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 3 },
            content: [
              { type: "text", text: "List item", marks: [{ type: "bold" }] }
            ]
          }
        ]
      },
      expectOneUndoStep: true
    }
  ])("$label converts structurally and preserves inline marks", async ({ initial, target, expected, expectOneUndoStep }) => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    expectCanonicalDocument(editor, initial);
    await selectFirstTextNode(editor);

    const before = editor.getJSON();
    const undoDepthBefore = undoDepth(editor.state);

    let applied = false;
    let transactions: ReturnType<typeof captureCommandTransactions> = [];
    await act(async () => {
      transactions = captureCommandTransactions(editor, () => {
        applied = applyToolbarBlockTypeCommand(editor, target as never);
      });
    });

    expect(applied).toBe(true);
    expect(editor.getJSON()).toEqual(expected);
    expectCanonicalDocument(editor, expected);

    if (expectOneUndoStep) {
      expect(undoDepth(editor.state)).toBe(undoDepthBefore + 1);
      expect(transactions.filter((transaction) => transaction.docChanged)).toHaveLength(1);
    }

    await act(async () => {
      editor.commands.undo();
    });

    expect(editor.getJSON()).toEqual(before);

    await act(async () => {
      editor.commands.redo();
    });

    expect(editor.getJSON()).toEqual(expected);
    expectCanonicalDocument(editor, expected);
  });

  it.each([
    {
      label: "paragraph",
      initial: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Paragraph", marks: [{ type: "bold" }] }]
          }
        ]
      },
      target: "text"
    },
    {
      label: "heading",
      initial: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 3 },
            content: [{ type: "text", text: "Heading", marks: [{ type: "bold" }] }]
          }
        ]
      },
      target: "heading3"
    },
    {
      label: "unordered list",
      initial: {
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "List", marks: [{ type: "bold" }] }]
                  }
                ]
              }
            ]
          }
        ]
      },
      target: "bulletedList"
    },
    {
      label: "numbered list",
      initial: {
        type: "doc",
        content: [
          createCanonicalOrderedListNode([
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "List", marks: [{ type: "bold" }] }]
                }
              ]
            }
          ])
        ]
      },
      target: "numberedList"
    }
  ])("keeps %s conversions as no-ops", async ({ initial, target }) => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    expectCanonicalDocument(editor, initial);
    await selectFirstTextNode(editor);

    const before = editor.getJSON();
    const undoDepthBefore = undoDepth(editor.state);
    let applied = true;
    let transactions: ReturnType<typeof captureCommandTransactions> = [];
    await act(async () => {
      transactions = captureCommandTransactions(editor, () => {
        applied = applyToolbarBlockTypeCommand(editor, target as never);
      });
    });

    expect(applied).toBe(false);
    expect(editor.getJSON()).toEqual(before);
    expectCanonicalDocument(editor, before);
    expect(undoDepth(editor.state)).toBe(undoDepthBefore);
    expect(transactions.filter((transaction) => transaction.docChanged)).toHaveLength(0);
    expect(transactions.filter((transaction) => transaction.addToHistory !== false)).toHaveLength(0);
  });

  it("keeps the toolbar mounted at the last settled position during resumed dragging and repositions only after idle and release", async () => {
    const geometrySpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const className = typeof this.className === "string" ? this.className : "";
      if (className.includes("docsera-text-toolbar__menu")) {
        return new DOMRect(0, 0, 220, 120);
      }

      if (className.includes("docsera-text-toolbar")) {
        return new DOMRect(0, 0, 240, 40);
      }

      return new DOMRect(0, 0, 1, 1);
    });

    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const coordsSpy = vi.spyOn(editor.view, "coordsAtPos").mockImplementation((pos: number) =>
      pos < 6
        ? { left: 100, right: 100, top: 100, bottom: 120 }
        : { left: 360, right: 360, top: 220, bottom: 240 }
    );

    await setParagraphText(editor, "Pointer timing");
    await selectText(editor, 1, 5);

    const initialToolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    vi.useFakeTimers();
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn().mockReturnValue(editor.view.dom)
    });
    const initialLeft = initialToolbar.style.left;
    const initialTop = initialToolbar.style.top;

    fireEvent.mouseDown(editor.view.dom, { button: 0, clientX: 10, clientY: 10 });
    expect(screen.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();

    fireEvent.mouseMove(editor.view.dom, { clientX: 12, clientY: 12 });
    await act(async () => {
      vi.advanceTimersByTime(180);
    });
    expect(screen.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();

    fireEvent.mouseMove(editor.view.dom, { clientX: 16, clientY: 16 });
    await act(async () => {
      vi.advanceTimersByTime(89);
    });
    expect(screen.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });

    const firstReveal = screen.getByRole("toolbar", { name: "Text formatting" });
    expect(firstReveal).toHaveStyle({ left: initialLeft, top: initialTop });

    fireEvent.mouseMove(editor.view.dom, { clientX: 20, clientY: 20 });
    expect(screen.getByRole("toolbar", { name: "Text formatting" })).toBe(firstReveal);
    expect(screen.getByRole("toolbar", { name: "Text formatting" })).toHaveStyle({ left: initialLeft, top: initialTop });

    await selectText(editor, 7, 12);
    fireEvent.mouseMove(editor.view.dom, { clientX: 24, clientY: 24 });
    await act(async () => {
      vi.advanceTimersByTime(90);
    });

    const secondReveal = screen.getByRole("toolbar", { name: "Text formatting" });
    expect(secondReveal.style.left).not.toBe(initialLeft);

    fireEvent.mouseMove(editor.view.dom, { clientX: 28, clientY: 28 });
    expect(screen.getByRole("toolbar", { name: "Text formatting" })).toBe(secondReveal);

    fireEvent.mouseUp(editor.view.dom);
    await act(async () => {
      vi.advanceTimersByTime(0);
    });
    const finalReveal = screen.getByRole("toolbar", { name: "Text formatting" });
    expect(finalReveal.style.left).toBe(secondReveal.style.left);

    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: originalElementFromPoint
    });
    vi.useRealTimers();
    coordsSpy.mockRestore();
    geometrySpy.mockRestore();
  });

  it("detects editor-contained events from composed paths even when the event target is not a Node in the current realm", () => {
    const editorElement = document.createElement("div");
    const child = document.createElement("span");
    editorElement.appendChild(child);

    const event = {
      target: { outside: true },
      composedPath: () => [child]
    } as unknown as Event;

    expect(isEventWithinEditor(event, editorElement, window)).toBe(true);
  });

  it("resolves owner-window-safe direct-link targets from composed paths and text-node targets", () => {
    const editorElement = document.createElement("div");
    const linkElement = document.createElement("a");
    linkElement.href = "https://example.com/anchor";
    const textNode = document.createTextNode("linked text");
    linkElement.appendChild(textNode);
    editorElement.appendChild(linkElement);

    const event = {
      target: { realm: "foreign" },
      composedPath: () => [textNode, linkElement, editorElement]
    } as unknown as Event;

    expect(resolveEditorLinkElementFromEvent(event, editorElement, window)).toBe(linkElement);
  });

  it("preserves a cross-block text selection after mouse release and only reveals the toolbar after the final selection commits", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Alpha line" }] },
          { type: "paragraph", content: [{ type: "text", text: "Beta line" }] }
        ]
      } as never);
    });
    await selectText(editor, 1, 14);

    const toolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    expect(toolbar).toBeInTheDocument();

    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn().mockReturnValue(editor.view.dom)
    });

    fireEvent.mouseDown(editor.view.dom, { button: 0, clientX: 12, clientY: 12 });
    expect(screen.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();

    await act(async () => {
      editor.commands.setTextSelection({ from: 1, to: 20 });
    });

    fireEvent.mouseUp(editor.view.dom, { clientX: 20, clientY: 30 });

    expect(editor.state.selection.empty).toBe(false);
    expect(editor.state.selection.from).toBe(1);
    expect(editor.state.selection.to).toBe(20);
    expect(screen.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(editor.state.selection.empty).toBe(false);
    expect(editor.state.selection.from).toBe(1);
    expect(editor.state.selection.to).toBe(20);
    expect(screen.getByRole("toolbar", { name: "Text formatting" })).toBeInTheDocument();

    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: originalElementFromPoint
    });
  });

  it("shows keyboard selections immediately, hides unsupported selections, and respects the content-sized toolbar contract", async () => {
    const { editorReady, rerender, onAccessLost, onOutlineChange, onSaveDraft, onStatusChange, overlayRoot } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Keyboard selection");
    await selectText(editor, 1, 9);

    const toolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    expect(toolbar).not.toHaveClass("docsera-editor-floating--compact-toolbar");
    expect(toolbar.querySelectorAll(".docsera-text-toolbar__divider")).toHaveLength(2);
    expect(toolbar.className).not.toContain("backdrop");
    expect(toolbar.style.width).toBe("");

    await act(async () => {
      editor.commands.setTextSelection({ from: 1, to: 1 });
    });
    expect(screen.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();

    await selectText(editor, 1, 9);
    expect(await screen.findByRole("toolbar", { name: "Text formatting" })).toBeInTheDocument();

    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          {
            type: "codeBlock",
            content: [{ type: "text", text: "const value = 1;" }]
          }
        ]
      });
      editor.commands.setTextSelection({ from: 1, to: 16 });
    });
    expect(screen.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();

    rerender(
      <PageEditorHostRuntime
        canEdit={false}
        initialEnvelope={createEmptyDocseraDocumentEnvelope()}
        initialRevision={0}
        onAccessLost={onAccessLost}
        onOutlineChange={onOutlineChange}
        onSaveDraft={onSaveDraft}
        onEditorReady={() => undefined}
        onStatusChange={onStatusChange}
        overlayRoot={overlayRoot}
        pageSysId="page-001"
        theme="light"
      />
    );

    expect(screen.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();
  });

  it("schedules and dismisses tooltips across the shared toolbar controls", async () => {
    const { editorReady, unmount } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Tooltip text");
    await selectText(editor, 1, 11);

    const toolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    vi.useFakeTimers();
    const blockTrigger = within(toolbar).getByRole("button", { name: "Text" });
    const boldButton = within(toolbar).getByRole("button", { name: "Bold" });
    const italicButton = within(toolbar).getByRole("button", { name: "Italic" });
    const underlineButton = within(toolbar).getByRole("button", { name: "Underline" });
    const strikeButton = within(toolbar).getByRole("button", { name: "Strikethrough" });
    const codeButton = within(toolbar).getByRole("button", { name: "Inline code" });
    const linkButton = within(toolbar).getByRole("button", { name: "Link" });
    const moreButton = within(toolbar).getByRole("button", { name: "More" });

    fireEvent.mouseEnter(boldButton);
    await act(async () => {
      vi.advanceTimersByTime(179);
    });
    expect(getToolbarTooltip()).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Bold");
    expect(screen.getByRole("tooltip")).toHaveTextContent(formatToolbarShortcutLabel("Mod+B", window));

    fireEvent.mouseLeave(boldButton);
    expect(getToolbarTooltip()).toBeNull();

    fireEvent.mouseEnter(italicButton);
    await act(async () => {
      vi.advanceTimersByTime(80);
    });
    fireEvent.mouseLeave(italicButton);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(getToolbarTooltip()).toBeNull();

    fireEvent.focus(strikeButton);
    const strikeTooltip = screen.getByRole("tooltip");
    expect(strikeTooltip).toHaveTextContent("Strikethrough");
    fireEvent.blur(strikeButton);
    expect(getToolbarTooltip()).toBeNull();

    fireEvent.focus(blockTrigger);
    const blockTooltip = screen.getByRole("tooltip");
    expect(blockTooltip).toHaveTextContent("Change to");
    expect(blockTooltip).not.toHaveTextContent("Ctrl");
    expect(blockTooltip).not.toHaveTextContent("Command");
    fireEvent.blur(blockTrigger);
    expect(getToolbarTooltip()).toBeNull();

    fireEvent.mouseEnter(blockTrigger);
    expect(getToolbarTooltip()).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(179);
    });
    expect(getToolbarTooltip()).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Change to");
    fireEvent.mouseLeave(blockTrigger);
    expect(getToolbarTooltip()).toBeNull();

    fireEvent.mouseEnter(blockTrigger);
    await act(async () => {
      vi.advanceTimersByTime(80);
    });
    fireEvent.mouseLeave(blockTrigger);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(getToolbarTooltip()).toBeNull();

    fireEvent.focus(moreButton);
    const moreTooltip = screen.getByRole("tooltip");
    expect(moreTooltip).toHaveTextContent("More");
    expect(moreTooltip).not.toHaveTextContent("Ctrl");
    expect(moreTooltip).not.toHaveTextContent("Command");
    fireEvent.blur(moreButton);
    expect(getToolbarTooltip()).toBeNull();

    fireEvent.mouseEnter(moreButton);
    expect(getToolbarTooltip()).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(179);
    });
    expect(getToolbarTooltip()).toBeNull();
    await act(async () => {
      vi.advanceTimersByTime(1);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("More");
    fireEvent.mouseLeave(moreButton);
    expect(getToolbarTooltip()).toBeNull();

    fireEvent.mouseEnter(moreButton);
    await act(async () => {
      vi.advanceTimersByTime(80);
    });
    fireEvent.mouseLeave(moreButton);
    await act(async () => {
      vi.advanceTimersByTime(200);
    });
    expect(getToolbarTooltip()).toBeNull();

    fireEvent.mouseEnter(codeButton);
    await act(async () => {
      vi.advanceTimersByTime(180);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Inline code");
    fireEvent.click(codeButton);
    expect(getToolbarTooltip()).toBeNull();

    fireEvent.mouseEnter(linkButton);
    await act(async () => {
      vi.advanceTimersByTime(180);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Link");
    fireEvent.click(linkButton);
    expect(getToolbarTooltip()).toBeNull();
    const linkDialog = screen.getByRole("dialog", { name: "Create link" });
    expect(linkDialog).toBeInTheDocument();
    fireEvent.keyDown(getLinkInput(linkDialog), { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Create link" })).toBeNull();

    const refreshedToolbar = screen.getByRole("toolbar", { name: "Text formatting" });
    const refreshedButtons = within(refreshedToolbar);
    const refreshedUnderlineButton = refreshedButtons.getByRole("button", { name: "Underline" });
    const refreshedBoldButton = refreshedButtons.getByRole("button", { name: "Bold" });
    const refreshedInlineCodeButton = refreshedButtons.getByRole("button", { name: "Inline code" });

    fireEvent.mouseEnter(refreshedUnderlineButton);
    await act(async () => {
      vi.advanceTimersByTime(180);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Underline");
    fireEvent.mouseLeave(refreshedUnderlineButton);
    fireEvent.mouseEnter(refreshedBoldButton);
    await act(async () => {
      vi.advanceTimersByTime(180);
    });
    expect(screen.getByRole("tooltip")).toHaveTextContent("Bold");
    expect(screen.getByRole("tooltip")).not.toHaveTextContent("Underline");

    fireEvent.mouseEnter(refreshedInlineCodeButton);
    unmount();
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(getToolbarTooltip()).toBeNull();
  });

  it("keeps the toolbar open for pointerdown inside its own surface and dismisses it on outside pointerdown", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Toolbar dismissal");
    await selectText(editor, 1, 8);

    const toolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    const before = editor.getJSON();
    const boldButton = within(toolbar).getByRole("button", { name: "Bold" });

    fireEvent.pointerDown(boldButton);
    expect(screen.getByRole("toolbar", { name: "Text formatting" })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    await waitFor(() => {
      expect(screen.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();
    });
    expect(editor.getJSON()).toEqual(before);
  });

  it("keeps Mod+K available and preserves distinct Escape behavior for toolbar and direct-click link popups", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Keyboard link bridge");
    await selectText(editor, 1, 21);

    const toolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    fireEvent.keyDown(editor.view.dom, { key: "Escape" });
    expect(screen.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();

    await selectText(editor, 2, 20);
    const restoredToolbarBeforePopup = await screen.findByRole("toolbar", { name: "Text formatting" });
    const frozenLeft = restoredToolbarBeforePopup.style.left;
    const frozenTop = restoredToolbarBeforePopup.style.top;

    fireEvent.keyDown(editor.view.dom, {
      key: "k",
      ctrlKey: true
    });

    const escapedCreateDialog = await screen.findByRole("dialog", { name: "Create link" });
    fireEvent.keyDown(getLinkInput(escapedCreateDialog), { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Create link" })).toBeNull();
    });
    const restoredToolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    expect(restoredToolbar).toHaveStyle({
      left: frozenLeft,
      top: frozenTop
    });

    await selectText(editor, 1, 21);

    fireEvent.keyDown(editor.view.dom, {
      key: "k",
      ctrlKey: true
    });

    const createDialog = await screen.findByRole("dialog", { name: "Create link" });
    const createInput = getLinkInput(createDialog);
    await act(async () => {
      fireEvent.change(createInput, { target: { value: "https://example.com/bridge" } });
    });
    fireEvent.keyDown(createInput, { key: "Enter" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Create link" })).toBeNull();
      expect(screen.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();
    });

    await waitFor(() => {
      expect(editor.getJSON()).toMatchObject({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Keyboard link bridge",
                marks: [{ type: "link", attrs: { href: "https://example.com/bridge" } }]
              }
            ]
          }
        ]
      });
    });

    await selectText(editor, 3, 8);
    const editToolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    fireEvent.keyDown(editor.view.dom, {
      key: "k",
      ctrlKey: true
    });

    const editDialog = await screen.findByRole("dialog", { name: "Edit link" });
    expect(getLinkInput(editDialog)).toHaveValue("https://example.com/bridge");
    fireEvent.keyDown(getLinkInput(editDialog), { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit link" })).toBeNull();
    });
    const restoredEditToolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    expect(restoredEditToolbar).toHaveStyle({
      left: editToolbar.style.left,
      top: editToolbar.style.top
    });

    const posAtCoordsSpy = vi.spyOn(editor.view, "posAtCoords").mockReturnValue({ pos: 1, inside: -1 });
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn().mockReturnValue(editor.view.dom)
    });

    await act(async () => {
      fireEvent.mouseUp(editor.view.dom.querySelector("a") as Element, { button: 0, clientX: 12, clientY: 12 });
    });

    const clickDialog = await screen.findByRole("dialog", { name: "Edit link" });
    fireEvent.keyDown(getLinkInput(clickDialog), { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit link" })).toBeNull();
      expect(screen.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();
    });

    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: originalElementFromPoint
    });
    posAtCoordsSpy.mockRestore();
  });

  describe("resolveCenteredSurfaceStyle", () => {
    it.each([
      {
        anchorRect: new DOMRect(120, 80, 80, 20),
        expected: {
          left: "90px",
          top: "110px",
          width: "140px"
        },
        name: "centers without clamping",
        preferAbove: false,
        surfaceRect: { width: 140, height: 60 }
      },
      {
        anchorRect: new DOMRect(0, 80, 40, 20),
        expected: {
          left: "12px",
          top: "110px",
          width: "140px"
        },
        name: "clamps to the left gutter",
        preferAbove: false,
        surfaceRect: { width: 140, height: 60 }
      },
      {
        anchorRect: new DOMRect(390, 80, 40, 20),
        expected: {
          left: "208px",
          top: "110px",
          width: "200px"
        },
        name: "clamps to the right gutter",
        preferAbove: false,
        surfaceRect: { width: 200, height: 60 }
      },
      {
        anchorRect: new DOMRect(120, 120, 80, 20),
        expected: {
          left: "90px",
          top: "50px",
          width: "140px"
        },
        name: "prefers above placement when space exists",
        preferAbove: true,
        surfaceRect: { width: 140, height: 60 }
      },
      {
        anchorRect: new DOMRect(120, 40, 80, 20),
        expected: {
          left: "90px",
          top: "70px",
          width: "140px"
        },
        name: "falls below when above does not fit",
        preferAbove: true,
        surfaceRect: { width: 140, height: 60 }
      },
      {
        anchorRect: new DOMRect(120, 80, 80, 20),
        expected: {
          left: "12px",
          maxWidth: "396px",
          top: "110px",
          width: "396px"
        },
        name: "clamps width when the surface is wider than the viewport",
        preferAbove: false,
        surfaceRect: { width: 1000, height: 60 }
      },
      {
        anchorRect: new DOMRect(120, 80, 80, 20),
        expected: {
          left: "90px",
          maxHeight: "236px",
          top: "12px",
          width: "140px"
        },
        name: "clamps height when needed",
        preferAbove: false,
        surfaceRect: { width: 140, height: 1000 }
      }
    ])("$name", ({ anchorRect, expected, preferAbove, surfaceRect }) => {
      const harness = createOverlayOwnerDocumentHarness(420, 260);

      expect(resolveCenteredSurfaceStyle(harness.ownerDocument, anchorRect, surfaceRect, preferAbove)).toMatchObject(expected);
    });
  });

  it("keeps the toolbar content-sized while anchoring intrinsic menus with the final spacing and cursor contract", async () => {
    const harness = createOverlayOwnerDocumentHarness(420, 260);
    const overlayRoot = document.createElement("div");
    Object.defineProperty(overlayRoot, "ownerDocument", {
      configurable: true,
      value: harness.ownerDocument
    });

    const selectionAnchorRect = new DOMRect(120, 80, 80, 20);
    const selectionStyle = resolveCenteredSurfaceStyle(harness.ownerDocument, selectionAnchorRect, { width: 140, height: 60 });
    expect(selectionStyle).toMatchObject({
      left: "90px",
      top: "110px",
      width: "140px"
    });

    const clampedSelectionStyle = resolveCenteredSurfaceStyle(harness.ownerDocument, new DOMRect(390, 80, 40, 20), { width: 200, height: 60 });
    expect(clampedSelectionStyle).toMatchObject({
      left: "208px",
      top: "110px"
    });

    const geometrySpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      const ariaLabel = this.getAttribute("aria-label");
      if (ariaLabel === "Text") {
        return new DOMRect(120, 50, 60, 28);
      }

      if (ariaLabel === "More") {
        return new DOMRect(300, 50, 32, 28);
      }

      if (this.getAttribute("role") === "menu") {
        return new DOMRect(0, 0, 170, 120);
      }

      const role = this.getAttribute("role");
      if (role === "toolbar") {
        return new DOMRect(0, 0, 240, 40);
      }

      return new DOMRect(0, 0, 1, 1);
    });

    const { editorReady } = renderRuntime({}, { overlayRoot });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const coordsSpy = vi.spyOn(editor.view, "coordsAtPos").mockImplementation((pos: number) =>
      pos < 6
        ? { left: 100, right: 100, top: 80, bottom: 100 }
        : { left: 220, right: 220, top: 80, bottom: 100 }
    );

    await setParagraphText(editor, "Geometry test");
    await selectText(editor, 1, 10);

    const toolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    const toolbarCoordinates = { left: "40px", top: "30px" };
    expect(toolbar).toHaveStyle(toolbarCoordinates);
    expect(toolbar.style.width).toBe("");
    expect(toolbar).toHaveStyle({ padding: "3px 5px" });

    const expectedBlockMenuStyle = resolveToolbarMenuSurfaceStyle(
      harness.ownerDocument,
      new DOMRect(0, 0, 240, 40),
      new DOMRect(120, 50, 60, 28),
      { width: 170, height: 120 },
      "start"
    );
    const expectedMoreMenuStyle = resolveToolbarMenuSurfaceStyle(
      harness.ownerDocument,
      new DOMRect(0, 0, 240, 40),
      new DOMRect(300, 50, 32, 28),
      { width: 170, height: 120 },
      "end"
    );

    const blockTrigger = within(toolbar).getByRole("button", { name: "Text" });
    const moreTrigger = within(toolbar).getByRole("button", { name: "More" });
    expect(getComputedStyle(blockTrigger).paddingLeft).toBe("9px");
    expect(getComputedStyle(blockTrigger).paddingRight).toBe("9px");
    expect(getComputedStyle(moreTrigger).paddingLeft).toBe("9px");
    expect(getComputedStyle(moreTrigger).paddingRight).toBe("9px");
    expect(getComputedStyle(blockTrigger).cursor).toBe("pointer");
    expect(getComputedStyle(moreTrigger).cursor).toBe("pointer");
    expect(getComputedStyle(within(toolbar).getByRole("button", { name: "Bold" })).cursor).toBe("pointer");

    await act(async () => {
      fireEvent.click(blockTrigger);
    });

    const blockMenu = await screen.findByRole("menu", { name: "Change to" });
    await waitFor(() => {
      expect(blockMenu).toHaveStyle(expectedBlockMenuStyle as Record<string, unknown>);
    });
    expect(blockMenu.style.width).toBe("");
    expect(blockMenu.style.top).toBe("44px");
    expect(blockMenu).toHaveStyle({ maxWidth: "396px" });
    expect(getComputedStyle(within(blockMenu).getByRole("menuitemradio", { name: "Text" })).cursor).toBe("pointer");
    expect(within(blockMenu).getByText("Change to")).toHaveStyle({
      fontSize: "0.68rem",
      letterSpacing: "0.06em"
    });
    expect(toolbar).toHaveStyle(toolbarCoordinates);
    expect(toolbar.style.width).toBe("");
    expect(screen.queryByRole("menu", { name: "More" })).toBeNull();

    await act(async () => {
      fireEvent.click(moreTrigger);
    });

    const moreMenu = await screen.findByRole("menu", { name: "More" });
    Object.defineProperty(moreMenu, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(0, 0, 170, 120)
    });
    await act(async () => {
      harness.triggerResize();
    });
    await waitFor(() => {
      expect(moreMenu).toHaveStyle(expectedMoreMenuStyle as Record<string, unknown>);
    });
    expect(moreMenu.style.width).toBe("");
    expect(moreMenu.style.top).toBe("44px");
    expect(getComputedStyle(within(moreMenu).getByRole("menuitemcheckbox", { name: "Blockquote" })).cursor).toBe("pointer");
    expect(toolbar).toHaveStyle(toolbarCoordinates);
    expect(toolbar.style.width).toBe("");
    expect(screen.queryByRole("menu", { name: "Change to" })).toBeNull();

    coordsSpy.mockRestore();
    geometrySpy.mockRestore();
  });

  it("keeps the compact toolbar on the dark-theme runtime class contract", async () => {
    const { editorReady, container } = renderRuntime({ theme: "dark" });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Dark theme");
    await selectText(editor, 1, 5);

    const runtime = container.querySelector(".docsera-editor-runtime");
    expect(runtime).toHaveClass("docsera-editor-runtime--dark");
    expect(await screen.findByRole("toolbar", { name: "Text formatting" })).toHaveClass("docsera-text-toolbar");
  });

  it.each([
    ["Bold", { type: "bold" }],
    ["Italic", { type: "italic" }],
    ["Underline", { type: "underline" }],
    ["Strikethrough", { type: "strike" }],
    ["Inline code", { type: "code" }]
  ])("toggles %s through the compact toolbar", async (label, expectedMark) => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Toggle me");
    await selectText(editor, 1, 10);

    const toolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    const button = within(toolbar).getByRole("button", { name: label });
    expect(button).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(button);

    expect(within(screen.getByRole("toolbar", { name: "Text formatting" })).getByRole("button", { name: label })).toHaveAttribute("aria-pressed", "true");
    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "Toggle me", marks: [expectedMark] }]
    });
  });

  it("shows the block-type menu in the accepted order with selected state and chevron flip", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: "Heading" }]
          }
        ]
      });
    });
    await selectText(editor, 1, 8);

    const toolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    const blockTrigger = within(toolbar).getByRole("button", { name: "Heading 1" });
    expect(blockTrigger).toHaveAttribute("aria-expanded", "false");
    const closedChevronPath = getIconPathData(blockTrigger);
    expect(closedChevronPath).not.toBe("");

    fireEvent.click(blockTrigger);

    const blockMenu = await screen.findByRole("menu", { name: "Change to" });
    expect(blockTrigger).toHaveAttribute("aria-expanded", "true");
    expect(getIconPathData(blockTrigger)).not.toBe(closedChevronPath);
    expect(getMenuItemNames(blockMenu)).toEqual(["Text", "Heading 1", "Heading 2", "Heading 3", "Unordered List", "Numbered List"]);
    const activeItem = within(blockMenu).getByRole("menuitemradio", { name: "Heading 1" });
    expect(activeItem).toHaveAttribute("aria-checked", "true");
    expect(activeItem.querySelector("svg")).not.toBeNull();
  });

  it.each([
    {
      initial: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 1 },
            content: [{ type: "text", text: "Alpha" }]
          }
        ]
      },
      triggerLabel: "Heading 1",
      targetLabel: "Text",
      expectedNode: { type: "paragraph", content: [{ type: "text", text: "Alpha" }] }
    },
    {
      initial: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Alpha" }]
          }
        ]
      },
      triggerLabel: "Text",
      targetLabel: "Heading 1",
      expectedNode: { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Alpha" }] }
    },
    {
      initial: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Alpha" }]
          }
        ]
      },
      triggerLabel: "Text",
      targetLabel: "Heading 2",
      expectedNode: { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Alpha" }] }
    },
    {
      initial: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Alpha" }]
          }
        ]
      },
      triggerLabel: "Text",
      targetLabel: "Heading 3",
      expectedNode: { type: "heading", attrs: { level: 3 }, content: [{ type: "text", text: "Alpha" }] }
    },
    {
      initial: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Alpha" }]
          }
        ]
      },
      triggerLabel: "Text",
      targetLabel: "Unordered List",
      expectedNode: {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Alpha" }] }]
          }
        ]
      }
    },
    {
      initial: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Alpha" }]
          }
        ]
      },
      triggerLabel: "Text",
      targetLabel: "Numbered List",
      expectedNode: {
        type: "orderedList",
        content: [
          {
            type: "listItem",
            content: [{ type: "paragraph", content: [{ type: "text", text: "Alpha" }] }]
          }
        ]
      }
    }
  ])("converts selected text to %s from the block-type menu", async ({ initial, triggerLabel, targetLabel, expectedNode }) => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent(initial as never);
    });
    await selectText(editor, 1, 6);

    const toolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    fireEvent.click(within(toolbar).getByRole("button", { name: triggerLabel }));
    const blockMenu = await screen.findByRole("menu", { name: "Change to" });
    fireEvent.click(within(blockMenu).getByRole("menuitemradio", { name: targetLabel }));

    expect(screen.queryByRole("menu", { name: "Change to" })).toBeNull();
    expect(editor.getJSON().content?.[0]).toMatchObject(expectedNode);
  });

  it("shows the More menu in the accepted order and selected treatment", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          {
            type: "blockquote",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Quote" }]
              }
            ]
          }
        ]
      });
    });
    await selectText(editor, 1, 6);

    const toolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    fireEvent.click(within(toolbar).getByRole("button", { name: "More" }));

    const moreMenu = await screen.findByRole("menu", { name: "More" });
    expect(getMenuItemNames(moreMenu, "menuitemcheckbox")).toEqual(["Blockquote", "Superscript", "Subscript", "Highlight"]);
    const blockquoteItem = within(moreMenu).getByRole("menuitemcheckbox", { name: "Blockquote" });
    expect(blockquoteItem).toHaveAttribute("aria-checked", "true");
    expect(blockquoteItem.querySelector("svg")).not.toBeNull();
  });

  it("keeps only one toolbar-owned nested surface open at a time", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Alpha Beta");
    await selectText(editor, 1, 11);

    const toolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    fireEvent.click(within(toolbar).getByRole("button", { name: "Text" }));
    expect(await screen.findByRole("menu", { name: "Change to" })).toBeInTheDocument();

    fireEvent.click(within(toolbar).getByRole("button", { name: "More" }));
    expect(screen.queryByRole("menu", { name: "Change to" })).toBeNull();
    expect(await screen.findByRole("menu", { name: "More" })).toBeInTheDocument();

    fireEvent.click(within(toolbar).getByRole("button", { name: "Link" }));
    expect(screen.queryByRole("menu", { name: "More" })).toBeNull();
    expect(screen.queryByRole("menu", { name: "Change to" })).toBeNull();
    expect(await screen.findByRole("dialog", { name: "Create link" })).toBeInTheDocument();
  });

  it.each([
    {
      label: "Blockquote",
      initial: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Quote me" }]
          }
        ]
      },
      expectedNode: {
        type: "blockquote",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Quote me" }]
          }
        ]
      }
    },
    {
      label: "Highlight",
      initial: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Highlight me" }]
          }
        ]
      },
      expectedNode: {
        type: "paragraph",
        content: [{ type: "text", text: "Highlight me", marks: [{ type: "highlight" }] }]
      }
    }
  ])("applies %s through the More menu", async ({ label, initial, expectedNode }) => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent(initial as never);
    });
    await selectText(editor, 1, label === "Blockquote" ? 9 : 13);

    const toolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    fireEvent.click(within(toolbar).getByRole("button", { name: "More" }));
    const moreMenu = await screen.findByRole("menu", { name: "More" });
    fireEvent.click(within(moreMenu).getByRole("menuitemcheckbox", { name: label }));

    expect(screen.queryByRole("menu", { name: "More" })).toBeNull();
    expect(editor.getJSON().content?.[0]).toMatchObject(expectedNode);
  });

  it("replaces superscript with subscript without removing unrelated marks through the More menu", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Formula");
    await selectText(editor, 1, 8);

    const toolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    fireEvent.click(within(toolbar).getByRole("button", { name: "Bold" }));
    fireEvent.click(within(toolbar).getByRole("button", { name: "More" }));
    fireEvent.click(within(await screen.findByRole("menu", { name: "More" })).getByRole("menuitemcheckbox", { name: "Superscript" }));
    fireEvent.click(within(screen.getByRole("toolbar", { name: "Text formatting" })).getByRole("button", { name: "More" }));
    fireEvent.click(within(await screen.findByRole("menu", { name: "More" })).getByRole("menuitemcheckbox", { name: "Subscript" }));

    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "Formula", marks: [{ type: "bold" }, { type: "subscript" }] }]
    });
    expect(JSON.stringify(editor.getJSON())).not.toContain("superscript");
  });

  it("keeps the compact link popup width stable in create and edit modes", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Linked text");
    await selectText(editor, 3, 8);

    const toolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    fireEvent.click(within(toolbar).getByRole("button", { name: "Link" }));

    const createDialog = await screen.findByRole("dialog", { name: "Create link" });
    const createInput = getLinkInput(createDialog);
    expect(createInput).toHaveValue("");
    expect(within(createDialog).queryByRole("button", { name: "Copy URL" })).toBeNull();
    expect(within(createDialog).queryByRole("button", { name: "Remove link" })).toBeNull();

    const createWidth = createDialog.style.width;
    const createLeft = createDialog.style.left;
    const createTop = createDialog.style.top;

    await act(async () => {
      fireEvent.change(createInput, {
        target: { value: "https://example.com/typing/should/not/change/popup/width/in/create/mode" }
      });
    });

    expect(screen.getByRole("dialog", { name: "Create link" })).toBe(createDialog);
    expect(createDialog.style.width).toBe(createWidth);
    expect(createDialog.style.left).toBe(createLeft);
    expect(createDialog.style.top).toBe(createTop);
    expect(within(createDialog).queryByRole("button", { name: "Copy URL" })).toBeNull();
    expect(within(createDialog).queryByRole("button", { name: "Remove link" })).toBeNull();

    fireEvent.keyDown(createInput, { key: "Enter" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Create link" })).toBeNull();
      expect(screen.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();
    });

    const createdEnvelope = createEnvelopeFromDocument(parseDocseraDocumentOrThrow(editor.getJSON()).document);
    const { editorReady: editEditorReady } = renderRuntime({
      initialEnvelope: createdEnvelope
    });

    await waitFor(() => {
      expect(editEditorReady[0]).toBeDefined();
    });

    const editEditor = editEditorReady[0];
    await selectText(editEditor, 3, 8);
    const linkedToolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    fireEvent.click(within(linkedToolbar).getByRole("button", { name: "Link" }));

    const editDialog = await screen.findByRole("dialog", { name: "Edit link" });
    const editInput = getLinkInput(editDialog);
    expect(editInput).toHaveValue("https://example.com/typing/should/not/change/popup/width/in/create/mode");
    expect(within(editDialog).getByRole("button", { name: "Copy URL" })).toBeInTheDocument();
    expect(within(editDialog).getByRole("button", { name: "Remove link" })).toBeInTheDocument();

    const editWidth = editDialog.style.width;
    const editLeft = editDialog.style.left;
    const editTop = editDialog.style.top;

    await act(async () => {
      fireEvent.change(editInput, {
        target: { value: "https://example.com/typing/should/not/change/popup/width/in/edit/mode" }
      });
    });

    expect(screen.getByRole("dialog", { name: "Edit link" })).toBe(editDialog);
    expect(editDialog.style.width).toBe(editWidth);
    expect(editDialog.style.left).toBe(editLeft);
    expect(editDialog.style.top).toBe(editTop);
  });

  it("creates, edits, removes, and follows safe links without navigating away", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => ({ opener: null } as Window));
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Linked text");
    await selectText(editor, 1, 12);
    const toolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    const linkButton = within(toolbar).getByRole("button", { name: "Link" });
    expect(linkButton).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(linkButton);

    const createDialog = await screen.findByRole("dialog", { name: "Create link" });
    const input = getLinkInput(createDialog);
    expect(input).toHaveValue("");
    expect(screen.getByRole("toolbar", { name: "Text formatting" })).toBeInTheDocument();
    expect(within(createDialog).queryByRole("button", { name: "Copy URL" })).toBeNull();
    expect(within(createDialog).queryByRole("button", { name: "Remove link" })).toBeNull();

    await act(async () => {
      fireEvent.change(input, { target: { value: "www.example.com/docs" } });
    });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Create link" })).toBeNull();
      expect(screen.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();
    });

    await waitFor(() => {
      const paragraphContent = editor.getJSON().content?.[0]?.content ?? [];
      expect(
        paragraphContent.some(
          (node) =>
            node.type === "text" &&
            Array.isArray(node.marks) &&
            node.marks.some((mark) => mark.type === "link" && mark.attrs?.href === "https://www.example.com/docs")
        )
      ).toBe(true);
    });

    await selectText(editor, 3, 8);
    const linkedToolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    const linkedLinkButton = within(linkedToolbar).getByRole("button", { name: "Link" });
    expect(linkedLinkButton).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(linkedLinkButton);
    const editDialog = await screen.findByRole("dialog", { name: "Edit link" });
    const editInput = getLinkInput(editDialog);
    expect(editInput).toHaveValue("https://www.example.com/docs");
    expect(within(editDialog).getByRole("button", { name: "Copy URL" })).toBeInTheDocument();
    expect(within(editDialog).getByRole("button", { name: "Remove link" })).toBeInTheDocument();

    await act(async () => {
      fireEvent.change(editInput, { target: { value: "https://example.com/next" } });
    });
    fireEvent.keyDown(editInput, { key: "Enter" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit link" })).toBeNull();
      expect(screen.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();
    });

    await waitFor(() => {
      const paragraphContent = editor.getJSON().content?.[0]?.content ?? [];
      expect(
        paragraphContent.some(
          (node) =>
            node.type === "text" &&
            Array.isArray(node.marks) &&
            node.marks.some((mark) => mark.type === "link" && mark.attrs?.href === "https://example.com/next")
        )
      ).toBe(true);
    });

    await selectText(editor, 3, 8);
    const followToolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    fireEvent.click(within(followToolbar).getByRole("button", { name: "Link" }));
    const followDialog = await screen.findByRole("dialog", { name: "Edit link" });
    fireEvent.click(within(followDialog).getByRole("button", { name: "Open link" }));
    expect(openSpy).toHaveBeenCalledWith("https://example.com/next", "_blank", "noopener,noreferrer");
    fireEvent.keyDown(getLinkInput(followDialog), { key: "Escape" });
    const posAtCoordsSpy = vi.spyOn(editor.view, "posAtCoords").mockReturnValue({ pos: 1, inside: -1 });
    const originalElementFromPoint = document.elementFromPoint;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn().mockReturnValue(editor.view.dom)
    });
    await act(async () => {
      fireEvent.mouseUp(editor.view.dom.querySelector("a") as Element, { button: 0, clientX: 12, clientY: 12 });
    });
    const clickDialog = await screen.findByRole("dialog", { name: "Edit link" });
    await waitFor(() => {
      expect(screen.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();
    });
    expect(getLinkInput(clickDialog)).toHaveValue("https://example.com/next");

    fireEvent.click(within(clickDialog).getByRole("button", { name: "Remove link" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit link" })).toBeNull();
      expect(screen.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();
    });
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: originalElementFromPoint
    });
    posAtCoordsSpy.mockRestore();
    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Linked text" }] }]
    });

    openSpy.mockRestore();
  });

  it("removes the complete existing link mark when only part of the linked text is selected", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Linked text");
    await selectText(editor, 1, 12);

    const toolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    fireEvent.click(within(toolbar).getByRole("button", { name: "Link" }));

    const createDialog = await screen.findByRole("dialog", { name: "Create link" });
    const createInput = getLinkInput(createDialog);
    await act(async () => {
      fireEvent.change(createInput, { target: { value: "https://example.com/original" } });
    });
    fireEvent.keyDown(createInput, { key: "Enter" });

    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Linked text",
              marks: [{ type: "link", attrs: { href: "https://example.com/original" } }]
            }
          ]
        }
      ]
    });

    await selectText(editor, 3, 8);
    const partialToolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    const frozenLeft = partialToolbar.style.left;
    const frozenTop = partialToolbar.style.top;
    fireEvent.click(within(partialToolbar).getByRole("button", { name: "Link" }));

    const editDialog = await screen.findByRole("dialog", { name: "Edit link" });
    expect(getLinkInput(editDialog)).toHaveValue("https://example.com/original");
    expect(screen.getByRole("toolbar", { name: "Text formatting" })).toHaveStyle({
      left: frozenLeft,
      top: frozenTop
    });

    fireEvent.click(within(editDialog).getByRole("button", { name: "Remove link" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Edit link" })).toBeNull();
      expect(screen.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();
    });

    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Linked text" }]
        }
      ]
    });
    expect(editor.getJSON().content?.[0]?.content).toHaveLength(1);
    expect(editor.getJSON().content?.[0]?.content?.[0]).toMatchObject({ type: "text", text: "Linked text" });

    await act(async () => {
      editor.commands.undo();
    });
    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Linked text",
              marks: [{ type: "link", attrs: { href: "https://example.com/original" } }]
            }
          ]
        }
      ]
    });
  });

  it("dismisses the link surface and toolbar when the editor receives another pointer action and keeps the replacement selection", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Alpha Beta");
    await selectText(editor, 1, 6);
    await openLinkSurface(editor);

    const createDialog = await screen.findByRole("dialog", { name: "Create link" });
    expect(createDialog).toBeInTheDocument();
    expect(screen.getByRole("toolbar", { name: "Text formatting" })).toBeInTheDocument();

    await selectText(editor, 7, 11);
    fireEvent.pointerDown(editor.view.dom);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Create link" })).toBeNull();
    });
    await waitFor(() => {
      expect(screen.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();
    });
    expect(editor.state.selection.from).toBe(7);
    expect(editor.state.selection.to).toBe(11);

    await openLinkSurface(editor);
    const reopenDialog = await screen.findByRole("dialog", { name: "Create link" });
    const reopenInput = getLinkInput(reopenDialog);
    await act(async () => {
      fireEvent.change(reopenInput, { target: { value: "https://example.com/new-target" } });
    });
    fireEvent.keyDown(reopenInput, { key: "Enter" });

    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Alpha " },
            {
              type: "text",
              text: "Beta",
              marks: [{ type: "link", attrs: { href: "https://example.com/new-target" } }]
            }
          ]
        }
      ]
    });
  });

  it("closes the link surface and toolbar on an outside-shell pointerdown without changing content", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Outside shell");
    await selectText(editor, 1, 8);
    await openLinkSurface(editor);

    const before = editor.getJSON();
    expect(screen.getByRole("dialog", { name: "Create link" })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Create link" })).toBeNull();
    });
    await waitFor(() => {
      expect(screen.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();
    });
    expect(editor.getJSON()).toEqual(before);
  });

  it.each([
    ["javascript:alert(1)", true],
    ["data:text/html,hi", true],
    ["   ", false]
  ])("handles %s in the enter path without calling setLink", async (draftHref, shouldStayOpen) => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const setLinkSpy = vi.spyOn(editor.commands, "setLink");
    await setParagraphText(editor, "Unsafe link");
    await selectText(editor, 1, 12);
    await openLinkSurface(editor);

    const dialog = await screen.findByRole("dialog", { name: "Create link" });
    const input = getLinkInput(dialog);
    const before = editor.getJSON();
    const selectionBefore = {
      from: editor.state.selection.from,
      to: editor.state.selection.to
    };

    await act(async () => {
      fireEvent.change(input, { target: { value: draftHref } });
    });

    fireEvent.keyDown(input, { key: "Enter" });

    expect(setLinkSpy).not.toHaveBeenCalled();
    expect(editor.getJSON()).toEqual(before);
    expect(editor.state.selection.from).toBe(selectionBefore.from);
    expect(editor.state.selection.to).toBe(selectionBefore.to);
    if (shouldStayOpen) {
      expect(screen.getByRole("dialog", { name: "Create link" })).toBeInTheDocument();
    } else {
      expect(screen.queryByRole("dialog", { name: "Create link" })).toBeNull();
    }
  });

  it("recalculates floating positioning from the overlay owner document and cleans up listeners on close and unmount", async () => {
    const harness = createOverlayOwnerDocumentHarness(240, 180);
    const overlayRoot = document.createElement("div");
    Object.defineProperty(overlayRoot, "ownerDocument", {
      configurable: true,
      value: harness.ownerDocument
    });

    const { editorReady, unmount } = renderRuntime({}, { overlayRoot });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Positioned link");
    await selectText(editor, 1, 15);
    await openLinkSurface(editor);

    const dialog = await screen.findByRole("dialog", { name: "Create link" });
    expect(harness.ownerDocument.addEventListener).toHaveBeenCalledWith("scroll", expect.any(Function), true);
    expect(harness.ownerWindow.addEventListener).toHaveBeenCalledWith("resize", expect.any(Function), { passive: true });

    setOverlayOwnerViewport(harness.ownerWindow, 180, 150);
    act(() => {
      harness.triggerScroll();
    });
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Create link" })).toBeInTheDocument();
    });

    setOverlayOwnerViewport(harness.ownerWindow, 260, 160);
    act(() => {
      harness.triggerResize();
    });
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Create link" })).toBeInTheDocument();
    });

    fireEvent.keyDown(getLinkInput(dialog), { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Create link" })).toBeNull();
    });
    expect(harness.ownerDocumentRemoveEventListener).toHaveBeenCalledWith("scroll", expect.any(Function), true);
    expect(harness.ownerWindowRemoveEventListener).toHaveBeenCalledWith("resize", expect.any(Function));

    await openLinkSurface(editor);
    await screen.findByRole("dialog", { name: "Create link" });
    const scrollCleanupCallsBeforeUnmount = harness.ownerDocumentRemoveEventListener.mock.calls.length;
    const resizeCleanupCallsBeforeUnmount = harness.ownerWindowRemoveEventListener.mock.calls.length;

    await act(async () => {
      unmount();
    });
    expect(harness.ownerDocumentRemoveEventListener.mock.calls.length).toBeGreaterThan(scrollCleanupCallsBeforeUnmount);
    expect(harness.ownerWindowRemoveEventListener.mock.calls.length).toBeGreaterThan(resizeCleanupCallsBeforeUnmount);
    expect(screen.queryByRole("dialog", { name: "Create link" })).toBeNull();
  });

  it("registers and removes pointer-ownership listeners with the editor session", async () => {
    const harness = createOverlayOwnerDocumentHarness(240, 180);
    const overlayRoot = document.createElement("div");
    Object.defineProperty(overlayRoot, "ownerDocument", {
      configurable: true,
      value: harness.ownerDocument
    });

    const { editorReady, unmount } = renderRuntime({}, { overlayRoot });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    expect(harness.ownerDocumentAddEventListener).toHaveBeenCalledWith("pointermove", expect.any(Function), true);

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await dispatchOwnerPointerMove(harness.ownerDocument, surface, { clientX: 120, clientY: 64 });
    expect(await screen.findByRole("button", { name: "Add block after Text" })).toBeInTheDocument();

    await act(async () => {
      unmount();
    });

    expect(harness.ownerDocumentRemoveEventListener).toHaveBeenCalledWith("pointermove", expect.any(Function), true);
    geometrySpy.mockRestore();
  });

  it("rejects unsafe, invalid, blank, and cancelled link input", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Unsafe");
    await selectText(editor, 1, 7);
    await openLinkSurface(editor);

    const dialog = await screen.findByRole("dialog", { name: "Create link" });
    const input = getLinkInput(dialog);

    await act(async () => {
      fireEvent.change(input, { target: { value: "javascript:alert(1)" } });
    });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByRole("dialog", { name: "Create link" })).toBeInTheDocument();
    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Unsafe" }] }]
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: "" } });
    });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Unsafe" }] }]
    });

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Create link" })).toBeNull();
    expect(editor.state.selection.from).toBe(1);
    expect(editor.state.selection.to).toBe(7);
  });

  it("supports undo and redo after slash, formatting, and link commands", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor, "he");
    fireEvent.click(await screen.findByRole("option", { name: /Heading 2/ }));
    const afterSlash = editor.getJSON();

    await act(async () => {
      editor.commands.undo();
    });
    expect(editor.getJSON()).not.toEqual(afterSlash);

    await act(async () => {
      editor.commands.redo();
    });
    expect(editor.getJSON()).toEqual(afterSlash);

    await setParagraphText(editor, "Redo mark");
    await selectText(editor, 1, 9);
    fireEvent.click(await screen.findByRole("button", { name: "Bold" }));
    const afterBold = editor.getJSON();

    await act(async () => {
      editor.commands.undo();
    });
    expect(editor.getJSON()).not.toEqual(afterBold);
    await act(async () => {
      editor.commands.redo();
    });
    expect(editor.getJSON()).toEqual(afterBold);

    await setParagraphText(editor, "Link redo");
    await selectText(editor, 1, 9);
    await openLinkSurface(editor);
    const dialog = await screen.findByRole("dialog", { name: "Create link" });
    const input = getLinkInput(dialog);
    await act(async () => {
      fireEvent.change(input, { target: { value: "https://example.com/redo" } });
    });
    fireEvent.keyDown(input, { key: "Enter" });
    const afterLink = editor.getJSON();

    await act(async () => {
      editor.commands.undo();
    });
    expect(editor.getJSON()).not.toEqual(afterLink);
    await act(async () => {
      editor.commands.redo();
    });
    expect(editor.getJSON()).toEqual(afterLink);
  });

  it("keeps a no-op paragraph command clean and tears down controls when edit access is lost", async () => {
    const onSaveDraft = vi.fn(async (): Promise<PageBodySaveResult> => ({
      state: "succeeded",
      page: createSuccessPage(1)
    }));
    const { editorReady, rerender, onAccessLost, onOutlineChange, onStatusChange, overlayRoot } = renderRuntime({
      onSaveDraft
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor);
    fireEvent.click(await screen.findByRole("option", { name: /Text/ }));
    expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();

    await runAutosave();
    expect(onSaveDraft).toHaveBeenCalledTimes(0);

    await setParagraphText(editor, "Access loss");
    await selectText(editor, 1, 12);
    await openLinkSurface(editor);
    expect(screen.getByRole("dialog", { name: "Create link" })).toBeInTheDocument();

    rerender(
      <PageEditorHostRuntime
        canEdit={false}
        initialEnvelope={createEmptyDocseraDocumentEnvelope()}
        initialRevision={0}
        onAccessLost={onAccessLost}
        onOutlineChange={onOutlineChange}
        onSaveDraft={onSaveDraft}
        onEditorReady={() => undefined}
        onStatusChange={onStatusChange}
        overlayRoot={overlayRoot}
        pageSysId="page-001"
        theme="light"
      />
    );

    expect(screen.queryByRole("dialog", { name: /link/i })).toBeNull();
    expect(screen.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();
    expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();
  });
});



