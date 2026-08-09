import type { Editor } from "@tiptap/core";
import type { CSSProperties } from "react";

export type TopLevelBlockDragSourceRange = {
  endBlockIndex: number;
  startBlockIndex: number;
};

export type BlockDragState = {
  clientX: number;
  clientY: number;
  destinationIndex: number | null;
  previewLabel: string;
  previewHtml: string;
  sourceBlockEndIndex: number;
  sourceBlockIndex: number;
  sourceBlockRect: DOMRect;
  pointerOffsetX: number;
  pointerOffsetY: number;
};

export function getTopLevelBlockElements(editor: Editor): HTMLElement[] {
  const proseMirror = editor.view.dom;
  if (!(proseMirror instanceof HTMLElement)) {
    return [];
  }

  return Array.from(proseMirror.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
}

export function resolveTopLevelBlockDropIndexFromRects(blockRects: DOMRect[], clientY: number): number | null {
  if (!blockRects.length) {
    return null;
  }

  for (let index = 0; index < blockRects.length; index += 1) {
    const blockRect = blockRects[index]!;
    if (clientY < blockRect.top + blockRect.height / 2) {
      return index;
    }
  }

  return blockRects.length;
}

export function resolveTopLevelBlockDropIndex(editor: Editor, clientY: number): number | null {
  return resolveTopLevelBlockDropIndexFromRects(
    getTopLevelBlockElements(editor).map((element) => element.getBoundingClientRect()),
    clientY
  );
}

export function getTopLevelBlockDragPreview(
  editor: Editor,
  blockIndex: number,
  blockEndIndex = blockIndex
): {
  previewLabel: string;
  previewHtml: string;
  sourceBlockRect: DOMRect;
} | null {
  const sourceElements = getTopLevelBlockElements(editor).slice(Math.min(blockIndex, blockEndIndex), Math.max(blockIndex, blockEndIndex) + 1);
  if (sourceElements.length === 0) {
    return null;
  }

  const sourceBlockRect = resolveBoundingRect(sourceElements.map((element) => element.getBoundingClientRect()));
  return {
    previewLabel:
      sourceElements.map((element) => element.textContent?.replace(/\s+/g, " ").trim() || "").filter(Boolean).join(" ") ||
      `Moving ${sourceElements.length} blocks`,
    previewHtml: createInertTopLevelBlockPreviewHtml(sourceElements),
    sourceBlockRect
  };
}

export function isPointWithinTopLevelBlockDropZone(
  editor: Editor,
  clientX: number,
  gutterWidth: number
): boolean {
  const blockRects = getTopLevelBlockElements(editor).map((element) => element.getBoundingClientRect());
  if (!blockRects.length) {
    return false;
  }

  const left = Math.max(VIEWPORT_GUTTER_FALLBACK, Math.min(...blockRects.map((rect) => rect.left)) - gutterWidth);
  const right = Math.max(...blockRects.map((rect) => rect.right));
  return clientX >= left && clientX <= right;
}

export function isValidBlockDragDestinationIndex(
  childCount: number,
  sourceBlockIndex: number,
  sourceBlockEndIndex: number,
  destinationIndex: number | null
): boolean {
  if (destinationIndex === null || childCount <= 0 || sourceBlockIndex < 0 || sourceBlockEndIndex < sourceBlockIndex || sourceBlockEndIndex >= childCount) {
    return false;
  }

  const normalizedDestinationIndex = Math.max(0, Math.min(destinationIndex, childCount));
  return normalizedDestinationIndex < sourceBlockIndex || normalizedDestinationIndex > sourceBlockEndIndex + 1;
}

export function getTopLevelBlockInsertionPositionFromDoc(
  doc: Editor["state"]["doc"],
  blockIndex: number
): number | null {
  if (blockIndex < 0 || blockIndex > doc.childCount) {
    return null;
  }

  if (blockIndex === doc.childCount) {
    return doc.content.size;
  }

  let insertionPosition: number | null = null;
  doc.forEach((node, offset, index) => {
    if (index === blockIndex) {
      insertionPosition = offset;
    }
  });

  return insertionPosition;
}

export function buildTopLevelBlockDropIndicatorStyleFromRects(
  input: {
    blockRects: DOMRect[];
    destinationIndex: number;
    lineHeight?: number;
    viewportGutter: number;
  }
): CSSProperties | null {
  const { blockRects, destinationIndex, lineHeight = 2, viewportGutter } = input;
  if (!blockRects.length) {
    return null;
  }

  const clampedDestinationIndex = Math.max(0, Math.min(destinationIndex, blockRects.length));
  const targetRect = clampedDestinationIndex >= blockRects.length ? blockRects[blockRects.length - 1]! : blockRects[clampedDestinationIndex]!;

  const left = Math.max(viewportGutter, targetRect.left);
  const width = Math.max(1, targetRect.width);
  const top =
    clampedDestinationIndex === 0
      ? targetRect.top - lineHeight / 2
      : clampedDestinationIndex >= blockRects.length
        ? targetRect.bottom - lineHeight / 2
        : ((blockRects[clampedDestinationIndex - 1]!.bottom + targetRect.top) / 2) - lineHeight / 2;

  return {
    position: "fixed",
    left: `${left}px`,
    top: `${top}px`,
    width: `${width}px`,
    height: `${lineHeight}px`
  };
}

export function buildTopLevelBlockDragFeedbackStyle(input: {
  clientX: number;
  clientY: number;
}): CSSProperties {
  const { clientX, clientY } = input;

  return {
    position: "fixed",
    left: `${Math.round(clientX + 12)}px`,
    top: `${Math.round(clientY + 12)}px`
  };
}

export function buildTopLevelBlockDropIndicatorStyle(
  editor: Editor,
  destinationIndex: number,
  input: {
    lineHeight?: number;
    viewportGutter: number;
  }
): CSSProperties | null {
  const blockRects = getTopLevelBlockElements(editor).map((element) => element.getBoundingClientRect());
  return buildTopLevelBlockDropIndicatorStyleFromRects({
    blockRects,
    destinationIndex,
    lineHeight: input.lineHeight,
    viewportGutter: input.viewportGutter
  });
}

export function moveTopLevelBlock(
  editor: Editor,
  sourceBlockIndex: number,
  destinationIndex: number,
  input: {
    focusTopLevelBlockSelection: (editor: Editor, blockIndex: number) => void;
    getTopLevelBlockRange: (editor: Editor, blockIndex: number) => { from: number; to: number } | null;
    selectTopLevelBlock: (blockIndex: number) => void;
  }
): boolean {
  return moveTopLevelBlocks(editor, sourceBlockIndex, sourceBlockIndex, destinationIndex, {
    ...input,
    selectTopLevelBlockRange: (startBlockIndex) => input.selectTopLevelBlock(startBlockIndex)
  });
}

export function moveTopLevelBlocks(
  editor: Editor,
  sourceStartBlockIndex: number,
  sourceEndBlockIndex: number,
  destinationIndex: number,
  input: {
    focusTopLevelBlockSelection: (editor: Editor, blockIndex: number) => void;
    getTopLevelBlockRange: (editor: Editor, blockIndex: number) => { from: number; to: number } | null;
    selectTopLevelBlockRange: (startBlockIndex: number, endBlockIndex: number) => void;
  }
): boolean {
  const normalizedSourceStartBlockIndex = Math.min(sourceStartBlockIndex, sourceEndBlockIndex);
  const normalizedSourceEndBlockIndex = Math.max(sourceStartBlockIndex, sourceEndBlockIndex);
  if (
    normalizedSourceStartBlockIndex < 0 ||
    normalizedSourceEndBlockIndex < normalizedSourceStartBlockIndex ||
    normalizedSourceEndBlockIndex >= editor.state.doc.childCount
  ) {
    return false;
  }

  const sourceStartRange = input.getTopLevelBlockRange(editor, normalizedSourceStartBlockIndex);
  const sourceEndRange = input.getTopLevelBlockRange(editor, normalizedSourceEndBlockIndex);
  if (!sourceStartRange || !sourceEndRange) {
    return false;
  }

  const normalizedDestinationIndex = Math.max(0, Math.min(destinationIndex, editor.state.doc.childCount));
  if (normalizedDestinationIndex >= normalizedSourceStartBlockIndex && normalizedDestinationIndex <= normalizedSourceEndBlockIndex + 1) {
    return false;
  }

  const sourceContent = editor.state.doc.slice(sourceStartRange.from, sourceEndRange.to).content;
  const sourceBlockCount = normalizedSourceEndBlockIndex - normalizedSourceStartBlockIndex + 1;
  const adjustedDestinationIndex =
    normalizedDestinationIndex > normalizedSourceEndBlockIndex + 1
      ? normalizedDestinationIndex - sourceBlockCount
      : normalizedDestinationIndex;
  const draftTransaction = editor.state.tr.delete(sourceStartRange.from, sourceEndRange.to);
  const insertionPosition = getTopLevelBlockInsertionPositionFromDoc(draftTransaction.doc, adjustedDestinationIndex);
  if (insertionPosition === null) {
    return false;
  }

  editor.view.dispatch(draftTransaction.insert(insertionPosition, sourceContent));
  input.focusTopLevelBlockSelection(editor, adjustedDestinationIndex);
  input.selectTopLevelBlockRange(adjustedDestinationIndex, adjustedDestinationIndex + sourceBlockCount - 1);
  return true;
}

function createInertTopLevelBlockPreviewHtml(sourceElements: HTMLElement[]): string {
  const previewHtmlParts: string[] = [];

  for (const sourceElement of sourceElements) {
    const previewBlock = sourceElement.cloneNode(true);
    if (!(previewBlock instanceof HTMLElement)) {
      previewHtmlParts.push(sourceElement.outerHTML);
      continue;
    }

    sanitizeTopLevelBlockPreviewElement(previewBlock);
    previewHtmlParts.push(previewBlock.outerHTML);
  }

  return previewHtmlParts.join("");
}

function sanitizeTopLevelBlockPreviewElement(root: HTMLElement) {
  const previewElements = [root, ...Array.from(root.querySelectorAll("*"))].filter(
    (element): element is HTMLElement => element instanceof HTMLElement
  );

  for (const element of previewElements) {
    element.removeAttribute("id");
    element.removeAttribute("contenteditable");
    element.removeAttribute("draggable");
    element.removeAttribute("spellcheck");
    element.removeAttribute("tabindex");
    element.removeAttribute("aria-selected");
    element.removeAttribute("aria-expanded");
    element.removeAttribute("aria-controls");
    element.removeAttribute("aria-activedescendant");
    element.removeAttribute("aria-haspopup");
    element.removeAttribute("data-docsera-block-selected");
    element.removeAttribute("data-docsera-block-gutter");
    element.removeAttribute("data-docsera-command-query-owner");
    element.removeAttribute("data-docsera-command-query-inline");
    element.removeAttribute("data-docsera-command-query-inline--helper");

    if (element.classList.contains("docsera-editor-runtime__block--selected")) {
      element.classList.remove("docsera-editor-runtime__block--selected");
    }

    if (element.tagName === "A") {
      element.removeAttribute("href");
      element.removeAttribute("target");
      element.removeAttribute("rel");
      element.removeAttribute("download");
      element.removeAttribute("ping");
      element.removeAttribute("referrerpolicy");
      element.tabIndex = -1;
      continue;
    }

    if (FOCUSABLE_TAG_NAMES.has(element.tagName)) {
      element.tabIndex = -1;
      element.setAttribute("aria-disabled", "true");
    }
  }
}

const VIEWPORT_GUTTER_FALLBACK = 12;
const FOCUSABLE_TAG_NAMES = new Set(["BUTTON", "INPUT", "SELECT", "TEXTAREA", "SUMMARY", "IFRAME", "OBJECT", "EMBED", "VIDEO", "AUDIO"]);

function resolveBoundingRect(rects: DOMRect[]): DOMRect {
  const firstRect = rects[0];
  if (!firstRect) {
    return new DOMRect(0, 0, 0, 0);
  }

  let left = firstRect.left;
  let top = firstRect.top;
  let right = firstRect.right;
  let bottom = firstRect.bottom;
  for (const rect of rects.slice(1)) {
    left = Math.min(left, rect.left);
    top = Math.min(top, rect.top);
    right = Math.max(right, rect.right);
    bottom = Math.max(bottom, rect.bottom);
  }

  return new DOMRect(left, top, right - left, bottom - top);
}
