/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { undoDepth } from "@tiptap/pm/history";
import { describe, expect, it } from "vitest";
import { createEmptyDocseraDocumentEnvelope } from "../../shared/editor/document";
import { buildTopLevelBlockDragFeedbackStyle, buildTopLevelBlockDropIndicatorStyleFromRects } from "./blockDragReorder";
import { PageEditorHostRuntime } from "./PageEditorHostRuntime";
import { renderRuntime, runAutosave } from "./PageEditorHostRuntime.testUtils";

function getSelectedBlockElement(editor: Editor): HTMLElement | null {
  const selectedBlock = editor.view.dom.querySelector("[data-docsera-block-selected='true']");
  return selectedBlock instanceof HTMLElement ? selectedBlock : null;
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

function mockElementProperty<T>(element: Element, property: string, value: T) {
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

function mockTopLevelBlockGeometry(editor: Editor, blockRects: DOMRect[]) {
  const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
  if (!(surface instanceof HTMLElement)) {
    throw new Error("Expected the editor surface to be available.");
  }

  const proseMirror = editor.view.dom;
  const proseMirrorChildren = Array.from(proseMirror.children);
  const surfaceRect = new DOMRect(72, 36, 760, 540);
  const proseMirrorRect = new DOMRect(132, 52, 620, 420);
  const restore = [
    mockElementRect(surface, surfaceRect),
    mockElementRect(proseMirror, proseMirrorRect),
    mockElementProperty(proseMirror, "offsetParent", surface),
    ...proseMirrorChildren.map((child, index) => mockElementRect(child, blockRects[index] ?? new DOMRect(0, 0, 1, 1)))
  ];

  return {
    mockRestore() {
      for (const reset of restore.reverse()) {
        reset();
      }
    }
  };
}

function getEditorSurface(editor: Editor): HTMLElement {
  const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
  if (!(surface instanceof HTMLElement)) {
    throw new Error("Expected the editor surface to be available.");
  }

  return surface;
}

function getFloatingBlockDragFeedback(): HTMLElement | null {
  const feedback = document.querySelector(".docsera-editor-floating__block-drag-feedback");
  return feedback instanceof HTMLElement ? feedback : null;
}

function getFloatingBlockDragPreview(): HTMLElement | null {
  const preview = document.querySelector(".docsera-editor-floating__block-drag-preview");
  return preview instanceof HTMLElement ? preview : null;
}

function getFloatingLayer(): HTMLElement | null {
  const layer = document.querySelector(".docsera-editor-floating-layer");
  return layer instanceof HTMLElement ? layer : null;
}

function getFloatingBlockDropIndicator(): HTMLElement | null {
  const indicator = document.querySelector(".docsera-editor-floating__block-drop-indicator");
  return indicator instanceof HTMLElement ? indicator : null;
}

function getProseMirrorElement(editor: Editor): HTMLElement {
  const proseMirror = editor.view.dom;
  if (!(proseMirror instanceof HTMLElement)) {
    throw new Error("Expected the ProseMirror surface to be available.");
  }

  return proseMirror;
}

function expectGrabbingCursor(element: HTMLElement) {
  const cursor = getComputedStyle(element).cursor;
  expect(cursor).toBe("grabbing");
  expect(cursor).not.toBe("default");
  expect(cursor).not.toBe("text");
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

async function dispatchOwnerPointerEvent(
  ownerDocument: Document,
  target: EventTarget,
  type: "pointerdown" | "pointermove" | "pointerup" | "pointercancel",
  point: { clientX: number; clientY: number },
  options: { button?: number; buttons?: number; pointerId?: number } = {}
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    button: {
      configurable: true,
      value: options.button ?? 0
    },
    buttons: {
      configurable: true,
      value: options.buttons ?? (type === "pointerup" ? 0 : 1)
    },
    clientX: {
      configurable: true,
      value: point.clientX
    },
    clientY: {
      configurable: true,
      value: point.clientY
    },
    composedPath: {
      configurable: true,
      value: () => [target]
    },
    pointerId: {
      configurable: true,
      value: options.pointerId ?? 1
    },
    pointerType: {
      configurable: true,
      value: "mouse"
    },
    target: {
      configurable: true,
      value: target
    }
  });

  await act(async () => {
    const dispatchTarget =
      target instanceof Node && target.isConnected && target.ownerDocument === ownerDocument ? target : ownerDocument;
    dispatchTarget.dispatchEvent(event);
  });

  return event;
}

async function setBlocks(editor: Editor, texts: string[]) {
  await act(async () => {
    editor.commands.setContent({
      type: "doc",
      content: texts.map((text) => ({
        type: "paragraph",
        content: text
          ? [
              {
                type: "text",
                text
              }
            ]
          : []
      }))
    });
  });
}

async function setDocument(editor: Editor, document: Parameters<Editor["commands"]["setContent"]>[0]) {
  await act(async () => {
    editor.commands.setContent(document);
  });
}

async function hoverFirstVisibleHandle(editor: Editor, clientX: number, clientY: number) {
  const surface = getEditorSurface(editor);
  await act(async () => {
    await Promise.resolve();
  });
  await dispatchOwnerPointerEvent(surface.ownerDocument, surface, "pointermove", { clientX, clientY });

  return screen.findByRole("button", { name: /^Select block:/ });
}

async function getCurrentVisibleHandle() {
  await act(async () => {
    await Promise.resolve();
  });

  return screen.findByRole("button", { name: /^Select block:/ });
}

async function pressHandle(editor: Editor, handle: HTMLElement, point: { clientX: number; clientY: number }, pointerId = 1) {
  const ownerDocument = getEditorSurface(editor).ownerDocument;
  return dispatchOwnerPointerEvent(ownerDocument, handle, "pointerdown", point, { button: 0, buttons: 1, pointerId });
}

describe("block drag geometry helpers", () => {
  it("centers a shared boundary line between blocks", () => {
    const indicatorStyle = buildTopLevelBlockDropIndicatorStyleFromRects({
      blockRects: [
        new DOMRect(132, 100, 620, 36),
        new DOMRect(132, 148, 620, 36),
        new DOMRect(132, 196, 620, 36)
      ],
      destinationIndex: 1,
      viewportGutter: 12
    });

    expect(indicatorStyle).toEqual({
      position: "fixed",
      left: "132px",
      top: "141px",
      width: "620px",
      height: "2px"
    });
  });

  it("keeps the block drag presentation close to the pointer", () => {
    expect(buildTopLevelBlockDragFeedbackStyle({ clientX: 160, clientY: 116 })).toEqual({
      position: "fixed",
      left: "172px",
      top: "128px"
    });
  });
});

describe("PageEditorHostRuntime block drag", () => {
  it("keeps click threshold behavior and opens the block menu without dragging", async () => {
    const { editorReady } = renderRuntime();
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    await setBlocks(editor, ["Alpha", "Beta", "Gamma"]);
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 100, 620, 36),
      new DOMRect(132, 148, 620, 36),
      new DOMRect(132, 196, 620, 36)
    ]);

    try {
      const handle = await hoverFirstVisibleHandle(editor, 160, 116);
      expect(getComputedStyle(handle).cursor).toBe("grab");
      expect(handle).toHaveAttribute("draggable", "false");

      const pointerDownEvent = await pressHandle(editor, handle, { clientX: 160, clientY: 116 });
      expect(pointerDownEvent.defaultPrevented).toBe(true);
      expect(getComputedStyle(handle).cursor).toBe("grabbing");
      await expect(getCurrentVisibleHandle()).resolves.toBe(handle);
      await dispatchOwnerPointerEvent(getEditorSurface(editor).ownerDocument, getEditorSurface(editor).ownerDocument, "pointerup", { clientX: 162, clientY: 118 }, { button: 0, buttons: 0, pointerId: 1 });

      expect(screen.getByRole("menu", { name: /Block actions for Text/ })).toBeInTheDocument();
      expect(editor.state.doc.textContent).toBe("AlphaBetaGamma");
      await expect(getCurrentVisibleHandle()).resolves.toBe(handle);
      expect(getFloatingBlockDragFeedback()).toBeNull();
    } finally {
      geometry.mockRestore();
    }
  });

  it("shows grabbing while pressed before the threshold and swaps to pointer feedback only after crossing it", async () => {
    const { editorReady } = renderRuntime();
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    await setBlocks(editor, ["Alpha", "Beta", "Gamma"]);
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 100, 620, 36),
      new DOMRect(132, 148, 620, 36),
      new DOMRect(132, 196, 620, 36)
    ]);

    try {
      const ownerDocument = getEditorSurface(editor).ownerDocument;
      const handle = await hoverFirstVisibleHandle(editor, 160, 116);

      expect(getComputedStyle(handle).cursor).toBe("grab");

      await dispatchOwnerPointerEvent(ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 116 }, { button: 0, buttons: 1, pointerId: 1 });
      expect(getComputedStyle(handle).cursor).toBe("grabbing");
      expect(getFloatingBlockDragFeedback()).toBeNull();

      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointermove", { clientX: 162, clientY: 117 }, { buttons: 1, pointerId: 1 });
      expect(getFloatingBlockDragFeedback()).toBeNull();
      expect(getEditorSurface(editor)).not.toHaveClass("docsera-editor-runtime__surface--block-dragging");

      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointermove", { clientX: 160, clientY: 180 }, { buttons: 1, pointerId: 1 });

      const feedback = getFloatingBlockDragFeedback();
      const proseMirror = getProseMirrorElement(editor);
      const firstBlock = proseMirror.firstElementChild;
      const floatingLayer = getFloatingLayer();
      const preview = getFloatingBlockDragPreview();

      expect(feedback).toBeInTheDocument();
      expect(feedback).toHaveAttribute("aria-hidden", "true");
      expect(feedback).toHaveTextContent("Alpha");
      expect(feedback?.childElementCount).toBe(1);
      expect(feedback?.innerHTML).toContain("docsera-editor-floating__block-drag-preview");
      expect(feedback?.querySelector(".docsera-editor-floating__block-drag-feedback-row")).toBeNull();
      expect(feedback?.querySelector(".docsera-editor-floating__block-drag-feedback-marker")).toBeNull();
      expect(feedback?.querySelector(".docsera-editor-floating__block-drag-feedback-plus-square")).toBeNull();
      expect(feedback?.querySelector(".docsera-editor-floating__block-drag-feedback-plus-glyph")).toBeNull();
      expect(preview).toBeInTheDocument();
      expect(preview).toHaveAttribute("aria-hidden", "true");
      expect(getComputedStyle(preview!).opacity).toBe("0.56");
      expect(getComputedStyle(feedback!).pointerEvents).toBe("none");
      expect(getComputedStyle(preview!).pointerEvents).toBe("none");
      expect(getComputedStyle(feedback!).borderWidth).toBe("0px");
      expect(getComputedStyle(feedback!).backgroundColor).toBe("rgba(0, 0, 0, 0)");
      expect(getComputedStyle(feedback!).boxShadow).toBe("none");
      expect(feedback?.style.left).toBe("172px");
      expect(feedback?.style.top).toBe("192px");
      expect(getComputedStyle(preview!).fontSize).toBe(getComputedStyle(proseMirror).fontSize);
      expect(getComputedStyle(preview!).lineHeight).toBe(getComputedStyle(proseMirror).lineHeight);
      expect(getEditorSurface(editor)).toHaveClass("docsera-editor-runtime__surface--block-dragging");
      expectGrabbingCursor(getEditorSurface(editor));
      expectGrabbingCursor(proseMirror);
      expect(firstBlock).toBeInstanceOf(HTMLElement);
      expectGrabbingCursor(firstBlock as HTMLElement);
      expectGrabbingCursor(feedback!);
      expectGrabbingCursor(preview!);
      expect(floatingLayer).toBeInstanceOf(HTMLElement);
      expectGrabbingCursor(floatingLayer as HTMLElement);

      const presentationHtml = feedback!.innerHTML;
      for (const point of [
        { clientX: 112, clientY: 180, left: "124px", top: "192px" },
        { clientX: 160, clientY: 142, left: "172px", top: "154px" },
        { clientX: 160, clientY: 250, left: "172px", top: "262px" }
      ]) {
        await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointermove", { clientX: point.clientX, clientY: point.clientY }, { buttons: 1, pointerId: 1 });
        const nextFeedback = getFloatingBlockDragFeedback();
        const nextPreview = getFloatingBlockDragPreview();

        expect(nextFeedback).toBeInTheDocument();
        expect(nextFeedback?.innerHTML).toBe(presentationHtml);
        expect(nextFeedback?.childElementCount).toBe(1);
        expect(nextFeedback?.querySelector(".docsera-editor-floating__block-drag-feedback-row")).toBeNull();
        expect(nextFeedback?.querySelector(".docsera-editor-floating__block-drag-feedback-marker")).toBeNull();
        expect(nextFeedback?.querySelector(".docsera-editor-floating__block-drag-feedback-plus-square")).toBeNull();
        expect(nextFeedback?.querySelector(".docsera-editor-floating__block-drag-feedback-plus-glyph")).toBeNull();
        expect(nextPreview).toBeInTheDocument();
        expect(nextPreview).toHaveTextContent("Alpha");
        expect(nextFeedback?.style.left).toBe(point.left);
        expect(nextFeedback?.style.top).toBe(point.top);
        expectGrabbingCursor(nextFeedback!);
        expectGrabbingCursor(nextPreview!);
      }

      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointerup", { clientX: 160, clientY: 180 }, { button: 0, buttons: 0, pointerId: 1 });

      expect(getFloatingBlockDragFeedback()).toBeNull();
      expect(getEditorSurface(editor)).not.toHaveClass("docsera-editor-runtime__surface--block-dragging");
      expect(getComputedStyle(getEditorSurface(editor)).cursor).not.toBe("text");
      expect(getComputedStyle(proseMirror).cursor).not.toBe("text");
      expect(firstBlock).toBeInstanceOf(HTMLElement);
      expect(getComputedStyle(firstBlock as HTMLElement).cursor).not.toBe("text");
      expect(floatingLayer).toBeInstanceOf(HTMLElement);
      expect(getComputedStyle(floatingLayer as HTMLElement).cursor).not.toBe("text");
    } finally {
      geometry.mockRestore();
    }
  });

  it("renders an inert faded snapshot of a code block", async () => {
    const { editorReady } = renderRuntime();
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    await setDocument(editor, {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          content: [{ type: "text", text: "const answer = 42;" }]
        },
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Quoted block" }]
            }
          ]
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Trailing" }]
        }
      ]
    });
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 100, 620, 56),
      new DOMRect(132, 168, 620, 64),
      new DOMRect(132, 244, 620, 36)
    ]);

    try {
      const ownerDocument = getEditorSurface(editor).ownerDocument;
      const handle = await hoverFirstVisibleHandle(editor, 160, 116);

      await dispatchOwnerPointerEvent(ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 116 }, { button: 0, buttons: 1, pointerId: 1 });
      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointermove", { clientX: 160, clientY: 178 }, { buttons: 1, pointerId: 1 });

      const feedback = getFloatingBlockDragFeedback();
      const preview = getFloatingBlockDragPreview();

      expect(feedback).toBeInTheDocument();
      expect(feedback).toHaveAttribute("aria-hidden", "true");
      expect(getComputedStyle(feedback!).pointerEvents).toBe("none");
      expect(feedback?.querySelector(".docsera-editor-floating__block-drag-feedback-row")).toBeNull();
      expect(feedback?.querySelector(".docsera-editor-floating__block-drag-feedback-marker")).toBeNull();
      expect(feedback?.querySelector(".docsera-editor-floating__block-drag-feedback-plus-square")).toBeNull();
      expect(feedback?.querySelector(".docsera-editor-floating__block-drag-feedback-plus-glyph")).toBeNull();
      expect(preview).toBeInTheDocument();
      expect(getComputedStyle(preview!).opacity).toBe("0.56");
      expect(preview?.querySelector("pre")).toBeInstanceOf(HTMLElement);
      expect(preview?.querySelector("code")).toBeInstanceOf(HTMLElement);
      expect(preview?.querySelectorAll("[id]").length).toBe(0);
      expect(preview?.querySelectorAll("[contenteditable]").length).toBe(0);
      expect(preview?.querySelectorAll("[tabindex]").length).toBe(0);
      expect(preview?.querySelectorAll("[data-docsera-block-selected='true']").length).toBe(0);
      expect(preview?.querySelectorAll("[data-docsera-block-gutter='true']").length).toBe(0);
      expect(preview?.querySelectorAll("button, input, select, textarea, a[href]").length).toBe(0);
      expect(preview).toHaveTextContent("const answer = 42;");
      expect(feedback?.innerHTML).not.toContain("docsera-editor-runtime__block--selected");
      expect(feedback?.innerHTML).not.toContain("contenteditable");
      expect(feedback?.innerHTML).not.toContain("data-docsera-block-gutter");
      expect(feedback?.style.left).toBe("172px");
      expect(feedback?.style.top).toBe("190px");
    } finally {
      geometry.mockRestore();
    }
  });

  it("renders an inert faded snapshot of a blockquote", async () => {
    const { editorReady } = renderRuntime();
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    await setDocument(editor, {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Quoted block" }]
            }
          ]
        },
        {
          type: "codeBlock",
          content: [{ type: "text", text: "const answer = 42;" }]
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Trailing" }]
        }
      ]
    });
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 100, 620, 64),
      new DOMRect(132, 176, 620, 56),
      new DOMRect(132, 244, 620, 36)
    ]);

    try {
      const ownerDocument = getEditorSurface(editor).ownerDocument;
      const handle = await hoverFirstVisibleHandle(editor, 160, 116);

      await dispatchOwnerPointerEvent(ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 116 }, { button: 0, buttons: 1, pointerId: 1 });
      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointermove", { clientX: 160, clientY: 178 }, { buttons: 1, pointerId: 1 });

      const feedback = getFloatingBlockDragFeedback();
      const preview = getFloatingBlockDragPreview();

      expect(feedback).toBeInTheDocument();
      expect(feedback).toHaveAttribute("aria-hidden", "true");
      expect(getComputedStyle(feedback!).pointerEvents).toBe("none");
      expect(preview).toBeInTheDocument();
      expect(getComputedStyle(preview!).opacity).toBe("0.56");
      expect(preview?.querySelector("blockquote")).toBeInstanceOf(HTMLElement);
      expect(preview?.querySelector("blockquote p")).toBeInstanceOf(HTMLElement);
      expect(preview?.querySelector("pre")).toBeNull();
      expect(preview?.querySelector("code")).toBeNull();
      expect(preview?.querySelectorAll("[id]").length).toBe(0);
      expect(preview?.querySelectorAll("[contenteditable]").length).toBe(0);
      expect(preview?.querySelectorAll("[tabindex]").length).toBe(0);
      expect(preview?.querySelectorAll("[data-docsera-block-selected='true']").length).toBe(0);
      expect(preview?.querySelectorAll("[data-docsera-block-gutter='true']").length).toBe(0);
      expect(preview?.querySelectorAll("button, input, select, textarea, a[href]").length).toBe(0);
      expect(preview).toHaveTextContent("Quoted block");
      expect(preview).not.toHaveTextContent("const answer = 42;");
      expect(preview).not.toHaveTextContent("Trailing");
      expect(feedback?.innerHTML).not.toContain("docsera-editor-runtime__block--selected");
      expect(feedback?.innerHTML).not.toContain("contenteditable");
      expect(feedback?.innerHTML).not.toContain("data-docsera-block-gutter");
      expect(feedback?.style.left).toBe("172px");
      expect(feedback?.style.top).toBe("190px");
    } finally {
      geometry.mockRestore();
    }
  });

  it("selects the source block on drag start, preserves the block selection through drop, and requires a fresh handle for a second gesture", async () => {
    const { editorReady, onSaveDraft } = renderRuntime();
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    await setBlocks(editor, ["Alpha", "Beta", "Gamma"]);
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 100, 620, 36),
      new DOMRect(132, 148, 620, 36),
      new DOMRect(132, 196, 620, 36)
    ]);

    try {
      await runAutosave();
      onSaveDraft.mockClear();
      const undoDepthBeforeMove = undoDepth(editor.state);

      const ownerDocument = getEditorSurface(editor).ownerDocument;
      const firstHandle = await hoverFirstVisibleHandle(editor, 160, 116);

      await dispatchOwnerPointerEvent(ownerDocument, firstHandle, "pointerdown", { clientX: 160, clientY: 116 }, { button: 0, buttons: 1, pointerId: 1 });
      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointermove", { clientX: 160, clientY: 180 }, { buttons: 1, pointerId: 1 });

      expect(getSelectedBlockElement(editor)).toHaveTextContent("Alpha");
      expect(getEditorSurface(editor)).toHaveClass("docsera-editor-runtime__surface--block-dragging");

      const indicator = getFloatingBlockDropIndicator();
      expect(indicator).toBeInTheDocument();
      expect(readInlineBox(indicator!)).toMatchObject({
        bottom: 191,
        height: 2,
        left: 132,
        right: 752,
        top: 189,
        width: 620
      });
      expect(getFloatingBlockDragFeedback()).toBeInTheDocument();

      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointermove", { clientX: 160, clientY: 250 }, { buttons: 1, pointerId: 1 });
      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointerup", { clientX: 160, clientY: 250 }, { button: 0, buttons: 0, pointerId: 1 });

      await runAutosave();

      expect(editor.state.doc.textContent).toBe("BetaGammaAlpha");
      expect(getSelectedBlockElement(editor)).toHaveTextContent("Alpha");
      expect(undoDepth(editor.state)).toBe(undoDepthBeforeMove + 1);
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
      expect(getEditorSurface(editor)).not.toHaveClass("docsera-editor-runtime__surface--block-dragging");
      expect(getFloatingBlockDragFeedback()).toBeNull();
      expect(getFloatingBlockDropIndicator()).toBeNull();
      expect(getComputedStyle(getEditorSurface(editor)).cursor).not.toBe("text");

      await act(async () => {
        editor.commands.undo();
      });

      expect(editor.state.doc.textContent).toBe("AlphaBetaGamma");
      expect(getSelectedBlockElement(editor)).toBeNull();

      const freshHandle = await hoverFirstVisibleHandle(editor, 160, 116);
      await dispatchOwnerPointerEvent(ownerDocument, freshHandle, "pointerdown", { clientX: 160, clientY: 116 }, { button: 0, buttons: 1, pointerId: 2 });
      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointermove", { clientX: 160, clientY: 164 }, { buttons: 1, pointerId: 2 });

      expect(getSelectedBlockElement(editor)).toHaveTextContent("Alpha");
      expect(getEditorSurface(editor)).toHaveClass("docsera-editor-runtime__surface--block-dragging");

      await act(async () => {
        fireEvent.keyDown(ownerDocument, { key: "Escape" });
      });

      expect(editor.state.doc.textContent).toBe("AlphaBetaGamma");
      expect(getSelectedBlockElement(editor)).toBeNull();
      expect(getEditorSurface(editor)).not.toHaveClass("docsera-editor-runtime__surface--block-dragging");
      expect(getFloatingBlockDragFeedback()).toBeNull();
      expect(getFloatingBlockDropIndicator()).toBeNull();
      expect(getComputedStyle(getEditorSurface(editor)).cursor).not.toBe("text");
    } finally {
      geometry.mockRestore();
    }
  });

  it("shows no destination outside the lane and cancels without mutation on release", async () => {
    const { editorReady } = renderRuntime();
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    await setBlocks(editor, ["Alpha", "Beta", "Gamma"]);
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 100, 620, 36),
      new DOMRect(132, 148, 620, 36),
      new DOMRect(132, 196, 620, 36)
    ]);

    try {
      const initialText = editor.state.doc.textContent;
      const ownerDocument = getEditorSurface(editor).ownerDocument;
      const handle = await hoverFirstVisibleHandle(editor, 160, 116);

      await dispatchOwnerPointerEvent(ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 116 }, { button: 0, buttons: 1, pointerId: 1 });
      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointermove", { clientX: 24, clientY: 160 }, { buttons: 1, pointerId: 1 });

      expect(getSelectedBlockElement(editor)).toHaveTextContent("Alpha");
      expect(getFloatingBlockDropIndicator()).toBeNull();
      expect(getFloatingBlockDragFeedback()).toBeInTheDocument();
      expect(getEditorSurface(editor)).toHaveClass("docsera-editor-runtime__surface--block-dragging");

      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointercancel", { clientX: 24, clientY: 160 }, { button: 0, buttons: 0, pointerId: 1 });

      expect(editor.state.doc.textContent).toBe(initialText);
      expect(getSelectedBlockElement(editor)).toBeNull();
      expect(getFloatingBlockDragFeedback()).toBeNull();
      expect(getFloatingBlockDropIndicator()).toBeNull();
      expect(getEditorSurface(editor)).not.toHaveClass("docsera-editor-runtime__surface--block-dragging");
      expect(getComputedStyle(getEditorSurface(editor)).cursor).not.toBe("text");
    } finally {
      geometry.mockRestore();
    }
  });

  it("cleans up an active drag when page, session, or access state changes", async () => {
    const { editorReady, onAccessLost, onOutlineChange, onSaveDraft, onStatusChange, overlayRoot, rerender } = renderRuntime();
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    await setBlocks(editor, ["Alpha", "Beta", "Gamma"]);
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 100, 620, 36),
      new DOMRect(132, 148, 620, 36),
      new DOMRect(132, 196, 620, 36)
    ]);

    try {
      const ownerDocument = getEditorSurface(editor).ownerDocument;
      const handle = await hoverFirstVisibleHandle(editor, 160, 116);

      await dispatchOwnerPointerEvent(ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 116 }, { button: 0, buttons: 1, pointerId: 1 });
      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointermove", { clientX: 160, clientY: 180 }, { buttons: 1, pointerId: 1 });

      expect(getFloatingBlockDragFeedback()).toBeInTheDocument();
      expect(getFloatingBlockDropIndicator()).toBeInTheDocument();
      expect(getEditorSurface(editor)).toHaveClass("docsera-editor-runtime__surface--block-dragging");

      await act(async () => {
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
            pageSysId="page-002"
            sessionKey="session-002"
            theme="light"
          />
        );
      });

      expect(getFloatingBlockDragFeedback()).toBeNull();
      expect(getFloatingBlockDropIndicator()).toBeNull();
      expect(document.querySelector("[data-docsera-block-selected='true']")).toBeNull();
      const surface = document.querySelector(".docsera-editor-runtime__surface");
      expect(surface).toBeInstanceOf(HTMLElement);
      expect(surface).not.toHaveClass("docsera-editor-runtime__surface--block-dragging");
      expect(getComputedStyle(surface as HTMLElement).cursor).not.toBe("text");
    } finally {
      geometry.mockRestore();
    }
  });
});
