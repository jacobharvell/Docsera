import type { Editor } from "@tiptap/core";
import type { CSSProperties } from "react";

export type BlockDragState = {
  clientX: number;
  clientY: number;
  destinationIndex: number | null;
  previewLabel: string;
  previewHtml: string;
  sourceBlockRect: DOMRect;
  sourceBlockIndex: number;
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

export function getTopLevelBlockDragPreview(editor: Editor, blockIndex: number): {
  previewLabel: string;
  previewHtml: string;
  sourceBlockRect: DOMRect;
} | null {
  const sourceElement = getTopLevelBlockElements(editor)[blockIndex];
  if (!(sourceElement instanceof HTMLElement)) {
    return null;
  }

  return {
    previewLabel: sourceElement.textContent?.replace(/\s+/g, " ").trim() || "Moving block",
    previewHtml: createInertTopLevelBlockPreviewHtml(sourceElement),
    sourceBlockRect: sourceElement.getBoundingClientRect()
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
  destinationIndex: number | null
): boolean {
  if (destinationIndex === null || childCount <= 0) {
    return false;
  }

  const normalizedDestinationIndex = Math.max(0, Math.min(destinationIndex, childCount));
  const adjustedDestinationIndex = normalizedDestinationIndex > sourceBlockIndex ? normalizedDestinationIndex - 1 : normalizedDestinationIndex;
  return adjustedDestinationIndex !== sourceBlockIndex;
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
  const sourceRange = input.getTopLevelBlockRange(editor, sourceBlockIndex);
  const sourceNode = sourceBlockIndex >= 0 && sourceBlockIndex < editor.state.doc.childCount ? editor.state.doc.child(sourceBlockIndex) : null;
  if (!sourceRange || !sourceNode) {
    return false;
  }

  const normalizedDestinationIndex = Math.max(0, Math.min(destinationIndex, editor.state.doc.childCount));
  const adjustedDestinationIndex =
    normalizedDestinationIndex > sourceBlockIndex ? normalizedDestinationIndex - 1 : normalizedDestinationIndex;
  if (adjustedDestinationIndex === sourceBlockIndex) {
    return false;
  }

  const draftTransaction = editor.state.tr.delete(sourceRange.from, sourceRange.to);
  const insertionPosition = getTopLevelBlockInsertionPositionFromDoc(draftTransaction.doc, adjustedDestinationIndex);
  if (insertionPosition === null) {
    return false;
  }

  const movedNode = editor.schema.nodeFromJSON(sourceNode.toJSON());
  editor.view.dispatch(draftTransaction.insert(insertionPosition, movedNode));
  input.focusTopLevelBlockSelection(editor, adjustedDestinationIndex);
  input.selectTopLevelBlock(adjustedDestinationIndex);
  return true;
}

function createInertTopLevelBlockPreviewHtml(sourceElement: HTMLElement): string {
  const previewElement = sourceElement.cloneNode(true);
  if (!(previewElement instanceof HTMLElement)) {
    return sourceElement.outerHTML;
  }

  sanitizeTopLevelBlockPreviewElement(previewElement);
  return previewElement.outerHTML;
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
