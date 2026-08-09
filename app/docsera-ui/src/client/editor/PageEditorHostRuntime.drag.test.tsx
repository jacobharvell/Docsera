/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { undoDepth } from "@tiptap/pm/history";
import { describe, expect, it, vi } from "vitest";
import { createEmptyDocseraDocumentEnvelope } from "../../shared/editor/document";
import {
  buildTopLevelBlockDragFeedbackStyle,
  buildTopLevelBlockDropIndicatorStyleFromRects,
  moveTopLevelBlocks
} from "./blockDragReorder";
import {
  createEditorAutoScrollSession,
  resolveEditorAutoScrollRequest,
  resolveEditorAutoScrollTopClearancePx,
  resolveEditorDocumentAutoScrollViewport,
  type EditorAutoScrollViewport
} from "./editorAutoScroll";
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

function mockElementAccessor<T>(element: Element, property: string, descriptor: { get: () => T; set?: (value: T) => void }) {
  const originalDescriptor = Object.getOwnPropertyDescriptor(element, property);
  Object.defineProperty(element, property, {
    configurable: true,
    get: descriptor.get,
    set: descriptor.set
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
  options: { button?: number; buttons?: number; composedPath?: Array<EventTarget | null | undefined>; pointerId?: number } = {}
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
      value: () => options.composedPath?.filter(Boolean) ?? [target]
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
    target.dispatchEvent(event);
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

async function setRangeDragDocument(editor: Editor) {
  await setDocument(editor, {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Alpha" }]
      },
      {
        attrs: { level: 2 },
        type: "heading",
        content: [{ type: "text", text: "Beta" }]
      },
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Gamma" }]
              }
            ]
          }
        ]
      },
      {
        type: "blockquote",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Delta" }]
          }
        ]
      },
      {
        attrs: { language: null },
        type: "codeBlock",
        content: [{ type: "text", text: "Epsilon" }]
      },
      {
        type: "horizontalRule"
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: "Zeta" }]
      }
    ]
  });
}

function getTopLevelBlockSignatures(editor: Editor): string[] {
  return Array.from(editor.view.dom.children)
    .filter((element): element is HTMLElement => element instanceof HTMLElement)
    .map((element) => `${element.tagName}:${element.textContent?.replace(/\s+/g, " ").trim() || ""}`);
}

function getSelectedBlockTags(editor: Editor): string[] {
  return Array.from(editor.view.dom.querySelectorAll("[data-docsera-block-selected='true']")).filter(
    (element): element is HTMLElement => element instanceof HTMLElement
  ).map((element) => element.tagName);
}

function getSelectedBlockElements(editor: Editor): HTMLElement[] {
  return Array.from(editor.view.dom.querySelectorAll("[data-docsera-block-selected='true']")).filter(
    (element): element is HTMLElement => element instanceof HTMLElement
  );
}

function mockRangeSelectionGeometry(editor: Editor, blockRects: DOMRect[]) {
  const surface = getEditorSurface(editor);
  const proseMirror = editor.view.dom;
  const proseMirrorChildren = Array.from(proseMirror.children);
  const surfaceRect = new DOMRect(72, 96, 760, 540);
  const mainPaneRect = new DOMRect(40, 36, 960, 620);
  const panelRect = new DOMRect(132, 36, 768, 620);
  const titleRect = new DOMRect(132, 64, 260, 48);
  let titleTextRect = new DOMRect(184, 74, 102, 26);
  const hostRect = new DOMRect(72, 96, 760, 540);
  const proseMirrorRect = new DOMRect(132, 100, 620, 420);
  const workspace = document.createElement("div");
  workspace.className = "docsera-workspace";
  const nav = document.createElement("nav");
  nav.className = "docsera-workspace__nav";
  const aside = document.createElement("aside");
  aside.className = "docsera-workspace__aside";
  const tocToggle = document.createElement("button");
  tocToggle.className = "docsera-workspace__toc-toggle";
  aside.append(tocToggle);
  const mainPane = document.createElement("main");
  mainPane.className = "docsera-main";
  const panel = document.createElement("article");
  panel.className = "docsera-main__surface docsera-main__surface--editor";
  const intro = document.createElement("div");
  intro.className = "docsera-main__intro";
  const title = document.createElement("h1");
  title.id = "docsera-page-title";
  title.className = "docsera-main__title";
  const titleTextNode = document.createTextNode("test page 01");
  title.append(titleTextNode);
  const host = document.createElement("div");
  host.className = "docsera-main__editor-host";
  intro.append(title);
  panel.append(intro, host);
  mainPane.append(panel);
  workspace.append(nav, mainPane, aside);
  document.body.append(workspace);
  const originalClosest = surface.closest.bind(surface);
  const originalCreateRange = document.createRange.bind(document);
  const restore = [
    mockElementProperty(mainPane, "getBoundingClientRect", () => mainPaneRect),
    mockElementProperty(panel, "getBoundingClientRect", () => panelRect),
    mockElementRect(title, titleRect),
    mockElementProperty(host, "getBoundingClientRect", () => hostRect),
    mockElementProperty(surface, "getBoundingClientRect", () => surfaceRect),
    mockElementProperty(proseMirror, "getBoundingClientRect", () => proseMirrorRect),
    mockElementProperty(proseMirror, "offsetParent", surface),
    mockElementProperty(surface, "closest", (selector: string) => {
      if (selector === "main.docsera-main") {
        return mainPane;
      }
      if (selector === ".docsera-main__editor-host") {
        return host;
      }
      if (selector === ".docsera-main__surface--editor") {
        return panel;
      }
      return originalClosest(selector);
    }),
    ...proseMirrorChildren.map((child, index) => mockElementRect(child, blockRects[index] ?? new DOMRect(0, 0, 1, 1)))
  ];
  document.createRange = (() => {
    const nativeRange = originalCreateRange();
    const originalSelectNodeContents = nativeRange.selectNodeContents.bind(nativeRange);
    const originalGetClientRects = nativeRange.getClientRects.bind(nativeRange);
    let selectedNode: Node | null = null;

    return new Proxy(nativeRange, {
      get(target, property, receiver) {
        if (property === "selectNodeContents") {
          return (node: Node) => {
            selectedNode = node;
            return originalSelectNodeContents(node);
          };
        }

        if (property === "getClientRects") {
          return () =>
            selectedNode === titleTextNode && titleTextRect.width > 0 && titleTextRect.height > 0
              ? [titleTextRect]
              : originalGetClientRects();
        }

        return Reflect.get(target, property, receiver);
      }
    });
  }) as typeof document.createRange;

  return {
    elements: {
      aside,
      mainPane,
      nav,
      panel,
      tocToggle,
      workspace
    },
    mockRestore() {
      for (const reset of restore.reverse()) {
        reset();
      }
      document.createRange = originalCreateRange;
      workspace.remove();
    },
    setLayoutRects(nextRects: {
      blockRects?: DOMRect[];
      hostRect?: DOMRect;
      mainPaneRect?: DOMRect;
      panelRect?: DOMRect;
      proseMirrorRect?: DOMRect;
      surfaceRect?: DOMRect;
    }) {
      if (nextRects.blockRects) {
        nextRects.blockRects.forEach((rect, index) => {
          mockElementRect(proseMirrorChildren[index]!, rect);
        });
      }
      if (nextRects.hostRect) {
        mockElementProperty(host, "getBoundingClientRect", () => nextRects.hostRect ?? hostRect);
      }
      if (nextRects.mainPaneRect) {
        mockElementProperty(mainPane, "getBoundingClientRect", () => nextRects.mainPaneRect ?? mainPaneRect);
      }
      if (nextRects.panelRect) {
        mockElementProperty(panel, "getBoundingClientRect", () => nextRects.panelRect ?? panelRect);
      }
      if (nextRects.proseMirrorRect) {
        mockElementProperty(proseMirror, "getBoundingClientRect", () => nextRects.proseMirrorRect ?? proseMirrorRect);
      }
      if (nextRects.surfaceRect) {
        mockElementProperty(surface, "getBoundingClientRect", () => nextRects.surfaceRect ?? surfaceRect);
      }
    },
    setTitleTextRect(nextRect: DOMRect) {
      titleTextRect = nextRect;
    }
  };
}

function mockScrollableMainPaneGeometry(
  editor: Editor,
  geometry: ReturnType<typeof mockRangeSelectionGeometry>,
  baseBlockRects: DOMRect[]
) {
  let scrollTop = 0;
  const proseMirrorChildren = Array.from(editor.view.dom.children);
  const restore = [
    mockElementProperty(geometry.elements.mainPane, "clientHeight", 620),
    mockElementProperty(geometry.elements.mainPane, "scrollHeight", 1600),
    mockElementAccessor(geometry.elements.mainPane, "scrollTop", {
      get: () => scrollTop,
      set: (value) => {
        scrollTop = Number(value);
      }
    }),
    ...proseMirrorChildren.map((child, index) =>
      mockElementProperty(child, "getBoundingClientRect", () => {
        const rect = baseBlockRects[index] ?? new DOMRect(132, 100 + index * 48, 620, 36);
        return new DOMRect(rect.left, rect.top - scrollTop, rect.width, rect.height);
      })
    )
  ];

  return {
    getScrollTop: () => scrollTop,
    mockRestore() {
      for (const reset of restore.reverse()) {
        reset();
      }
    }
  };
}

async function runQueuedAnimationFramesUntil(
  callbacks: FrameRequestCallback[],
  predicate: () => boolean,
  maxFrames = 8
) {
  await act(async () => {
    for (let index = 0; index < maxFrames && !predicate(); index += 1) {
      const callback = callbacks.shift();
      if (!callback) {
        break;
      }
      callback(index * 16);
    }
  });
}

async function dispatchBlankGutterDrag(
  editor: Editor,
  geometry: ReturnType<typeof mockRangeSelectionGeometry>,
  start: { clientX: number; clientY: number },
  moves: Array<{ clientX: number; clientY: number }>
) {
  const ownerDocument = getEditorSurface(editor).ownerDocument;
  await dispatchOwnerPointerEvent(ownerDocument, geometry.elements.mainPane, "pointerdown", start, {
    button: 0,
    buttons: 1,
    composedPath: [geometry.elements.mainPane, geometry.elements.workspace, document.body],
    pointerId: 1
  });

  for (const move of moves) {
    await dispatchOwnerPointerEvent(ownerDocument, geometry.elements.mainPane, "pointermove", move, {
      buttons: 1,
      composedPath: [geometry.elements.mainPane, geometry.elements.workspace, document.body],
      pointerId: 1
    });
  }

  const endPoint = moves[moves.length - 1] ?? start;
  await dispatchOwnerPointerEvent(ownerDocument, geometry.elements.mainPane, "pointerup", endPoint, {
    button: 0,
    buttons: 0,
    composedPath: [geometry.elements.mainPane, geometry.elements.workspace, document.body],
    pointerId: 1
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

function getTopLevelBlockRangeForMove(editor: Editor, blockIndex: number): { from: number; to: number } | null {
  if (blockIndex < 0 || blockIndex >= editor.state.doc.childCount) {
    return null;
  }

  let blockRange: { from: number; to: number } | null = null;
  editor.state.doc.forEach((node, offset, index) => {
    if (index === blockIndex) {
      blockRange = {
        from: offset,
        to: offset + node.nodeSize
      };
    }
  });

  return blockRange;
}

type MoveBlocksResult = {
  didMove: boolean;
  focusedBlockIndex: number | null;
  selectedRange: [number, number] | null;
  transactions: Array<{ docChanged: boolean; steps: number }>;
};

function moveBlocksWithCapturedTransactions(
  editor: Editor,
  sourceStartBlockIndex: number,
  sourceEndBlockIndex: number,
  destinationIndex: number
): MoveBlocksResult {
  const originalDispatch = editor.view.dispatch.bind(editor.view);
  const historyTime = Date.now() + 1000;
  const transactions: Array<{ docChanged: boolean; steps: number }> = [];
  let focusedBlockIndex: number | null = null;
  let selectedRange: [number, number] | null = null;

  editor.view.dispatch = (transaction) => {
    transaction.time = historyTime;
    transactions.push({
      docChanged: transaction.docChanged,
      steps: transaction.steps.length
    });
    originalDispatch(transaction);
  };

  try {
    const didMove = moveTopLevelBlocks(editor, sourceStartBlockIndex, sourceEndBlockIndex, destinationIndex, {
      focusTopLevelBlockSelection: (_editor, blockIndex) => {
        focusedBlockIndex = blockIndex;
      },
      getTopLevelBlockRange: getTopLevelBlockRangeForMove,
      selectTopLevelBlockRange: (startBlockIndex, endBlockIndex) => {
        selectedRange = [startBlockIndex, endBlockIndex];
      }
    });

    return {
      didMove,
      focusedBlockIndex,
      selectedRange,
      transactions
    };
  } finally {
    editor.view.dispatch = originalDispatch;
  }
}

async function runCapturedBlockMove(
  editor: Editor,
  sourceStartBlockIndex: number,
  sourceEndBlockIndex: number,
  destinationIndex: number
): Promise<MoveBlocksResult> {
  let result: MoveBlocksResult | null = null;
  await act(async () => {
    result = moveBlocksWithCapturedTransactions(editor, sourceStartBlockIndex, sourceEndBlockIndex, destinationIndex);
  });

  if (!result) {
    throw new Error("Expected the move helper to return a result.");
  }

  return result;
}

describe("block drag geometry helpers", () => {
  it("resolves vertical auto-scroll requests only inside top and bottom edge regions", () => {
    const viewport: EditorAutoScrollViewport = {
      clientHeight: 500,
      element: null,
      rect: new DOMRect(0, 80, 800, 500),
      scrollBy: () => undefined,
      scrollHeight: 1200,
      scrollTop: 300
    };

    expect(resolveEditorAutoScrollRequest(viewport, 250)).toEqual({ deltaY: 0, direction: "none" });
    expect(resolveEditorAutoScrollRequest(viewport, 96).direction).toBe("up");
    expect(resolveEditorAutoScrollRequest(viewport, 564).direction).toBe("down");
  });

  it("accelerates near the edge, ignores horizontal position, and clamps to remaining scroll range", () => {
    const viewport: EditorAutoScrollViewport = {
      clientHeight: 500,
      element: null,
      rect: new DOMRect(0, 80, 800, 500),
      scrollBy: () => undefined,
      scrollHeight: 1200,
      scrollTop: 300
    };

    const farDown = resolveEditorAutoScrollRequest(viewport, 512);
    const nearDown = resolveEditorAutoScrollRequest(viewport, 579);
    expect(nearDown.deltaY).toBeGreaterThan(farDown.deltaY);
    expect(resolveEditorAutoScrollRequest({ ...viewport, scrollTop: 700 }, 579).deltaY).toBe(0);
    expect(resolveEditorAutoScrollRequest({ ...viewport, scrollTop: 0 }, 81).deltaY).toBe(0);
  });

  it("respects fixed-header top clearance when resolving the top edge zone", () => {
    const viewport: EditorAutoScrollViewport = {
      clientHeight: 700,
      element: null,
      rect: new DOMRect(0, 0, 900, 700),
      scrollBy: () => undefined,
      scrollHeight: 1400,
      scrollTop: 300
    };

    expect(resolveEditorAutoScrollRequest(viewport, 86, { topClearancePx: 72 }).direction).toBe("up");
    expect(resolveEditorAutoScrollRequest(viewport, 150, { topClearancePx: 72 }).direction).toBe("none");
  });

  it("resolves the measured main pane as the scroll owner and reads header clearance from runtime styles", () => {
    const mainPane = document.createElement("main");
    mainPane.className = "docsera-main";
    mainPane.style.scrollPaddingTop = "68px";
    document.body.append(mainPane);
    const restore = [
      mockElementRect(mainPane, new DOMRect(40, 72, 900, 640)),
      mockElementProperty(mainPane, "clientHeight", 640),
      mockElementProperty(mainPane, "scrollHeight", 1400)
    ];

    try {
      const viewport = resolveEditorDocumentAutoScrollViewport({
        mainPaneElement: mainPane,
        ownerDocument: document
      });

      expect(viewport?.element).toBe(mainPane);
      expect(viewport?.rect.top).toBe(72);
      expect(resolveEditorAutoScrollTopClearancePx({ ownerDocument: document, styleTarget: mainPane })).toBe(68);
    } finally {
      for (const reset of restore.reverse()) {
        reset();
      }
      mainPane.remove();
    }
  });

  it("continues auto-scroll on animation frames and stops deterministically", () => {
    const callbacks: FrameRequestCallback[] = [];
    let frameId = 0;
    const requestAnimationFrameSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callbacks.push(callback);
      frameId += 1;
      return frameId;
    });
    const cancelAnimationFrameSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    let scrollTop = 120;
    const onScroll = vi.fn();
    const session = createEditorAutoScrollSession({
      getPointerY: () => 578,
      getViewport: () => ({
        clientHeight: 500,
        element: null,
        rect: new DOMRect(0, 80, 800, 500),
        scrollBy: (deltaY) => {
          scrollTop += deltaY;
        },
        scrollHeight: 1200,
        scrollTop
      }),
      onScroll,
      ownerWindow: window
    });

    session.update();
    callbacks.shift()?.(0);
    expect(scrollTop).toBeGreaterThan(120);
    expect(onScroll).toHaveBeenCalledTimes(1);
    expect(requestAnimationFrameSpy).toHaveBeenCalledTimes(2);

    session.stop();
    expect(cancelAnimationFrameSpy).toHaveBeenCalledWith(2);
    requestAnimationFrameSpy.mockRestore();
    cancelAnimationFrameSpy.mockRestore();
  });

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

describe("top-level block move transaction", () => {
  it.each([
    {
      destinationIndex: 0,
      expectedTexts: ["Gamma", "Alpha", "Beta", "Delta"],
      label: "before first",
      sourceIndex: 2
    },
    {
      destinationIndex: 1,
      expectedTexts: ["Alpha", "Delta", "Beta", "Gamma"],
      label: "between blocks",
      sourceIndex: 3
    },
    {
      destinationIndex: 4,
      expectedTexts: ["Alpha", "Gamma", "Delta", "Beta"],
      label: "after last",
      sourceIndex: 1
    }
  ])("moves one block $label with one transaction and preserves all document content", async ({ destinationIndex, expectedTexts, sourceIndex }) => {
    const { editorReady } = renderRuntime();
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    await setBlocks(editor, ["Alpha", "Beta", "Gamma", "Delta"]);

    const undoDepthBeforeMove = undoDepth(editor.state);
    const result = await runCapturedBlockMove(editor, sourceIndex, sourceIndex, destinationIndex);

    expect(result.didMove).toBe(true);
    expect(result.transactions).toEqual([{ docChanged: true, steps: 2 }]);
    expect(editor.state.doc.toJSON()).toMatchObject({
      content: expectedTexts.map((text) => ({
        content: [{ text, type: "text" }],
        type: "paragraph"
      })),
      type: "doc"
    });
    expect(editor.state.doc.textContent).toBe(expectedTexts.join(""));
    expect(result.focusedBlockIndex).toBe(expectedTexts.indexOf(["Alpha", "Beta", "Gamma", "Delta"][sourceIndex]!));
    expect(result.selectedRange).toEqual([result.focusedBlockIndex, result.focusedBlockIndex]);
    expect(undoDepth(editor.state)).toBe(undoDepthBeforeMove + 1);

    await act(async () => {
      editor.commands.undo();
    });

    expect(editor.state.doc.textContent).toBe("AlphaBetaGammaDelta");
  });

  it.each([
    {
      destinationIndex: 0,
      expectedSignatures: [
        "heading:Beta",
        "bulletList:Gamma",
        "blockquote:Delta",
        "paragraph:Alpha",
        "codeBlock:Epsilon",
        "horizontalRule:",
        "paragraph:Zeta"
      ],
      expectedTextContent: "BetaGammaDeltaAlphaEpsilonZeta",
      expectedSelectedRange: [0, 2] as [number, number],
      label: "before first"
    },
    {
      destinationIndex: 5,
      expectedSignatures: [
        "paragraph:Alpha",
        "codeBlock:Epsilon",
        "heading:Beta",
        "bulletList:Gamma",
        "blockquote:Delta",
        "horizontalRule:",
        "paragraph:Zeta"
      ],
      expectedTextContent: "AlphaEpsilonBetaGammaDeltaZeta",
      expectedSelectedRange: [2, 4] as [number, number],
      label: "between blocks"
    },
    {
      destinationIndex: 7,
      expectedSignatures: [
        "paragraph:Alpha",
        "codeBlock:Epsilon",
        "horizontalRule:",
        "paragraph:Zeta",
        "heading:Beta",
        "bulletList:Gamma",
        "blockquote:Delta"
      ],
      expectedTextContent: "AlphaEpsilonZetaBetaGammaDelta",
      expectedSelectedRange: [4, 6] as [number, number],
      label: "after last"
    }
  ])("moves a heterogeneous contiguous range $label with native source content and one transaction", async ({
    destinationIndex,
    expectedSelectedRange,
    expectedSignatures,
    expectedTextContent
  }) => {
    const { editorReady } = renderRuntime();
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    await setRangeDragDocument(editor);

    const sourceJson = editor.state.doc.slice(
      getTopLevelBlockRangeForMove(editor, 1)!.from,
      getTopLevelBlockRangeForMove(editor, 3)!.to
    ).content.toJSON();
    const undoDepthBeforeMove = undoDepth(editor.state);
    const result = await runCapturedBlockMove(editor, 1, 3, destinationIndex);

    const movedJson = editor.state.doc.slice(
      getTopLevelBlockRangeForMove(editor, expectedSelectedRange[0])!.from,
      getTopLevelBlockRangeForMove(editor, expectedSelectedRange[1])!.to
    ).content.toJSON();

    expect(result.didMove).toBe(true);
    expect(result.transactions).toEqual([{ docChanged: true, steps: 2 }]);
    expect(editor.state.doc.textContent).toBe(expectedTextContent);
    expect(editor.state.doc.content.content.map((node) => `${node.type.name}:${node.textContent}`)).toEqual(expectedSignatures);
    expect(movedJson).toEqual(sourceJson);
    expect(result.focusedBlockIndex).toBe(expectedSelectedRange[0]);
    expect(result.selectedRange).toEqual(expectedSelectedRange);
    expect(undoDepth(editor.state)).toBe(undoDepthBeforeMove + 1);

    await act(async () => {
      editor.commands.undo();
    });

    expect(editor.state.doc.textContent).toBe("AlphaBetaGammaDeltaEpsilonZeta");
  });

  it.each([
    {
      destinationIndex: 2,
      label: "inside-range destination"
    },
    {
      destinationIndex: 4,
      label: "equivalent boundary after source"
    }
  ])("rejects an invalid $label without mutation or dispatch", async ({ destinationIndex }) => {
    const { editorReady } = renderRuntime();
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    await setRangeDragDocument(editor);

    const initialJson = editor.state.doc.toJSON();
    const undoDepthBeforeMove = undoDepth(editor.state);
    const result = await runCapturedBlockMove(editor, 1, 3, destinationIndex);

    expect(result.didMove).toBe(false);
    expect(result.transactions).toEqual([]);
    expect(result.focusedBlockIndex).toBeNull();
    expect(result.selectedRange).toBeNull();
    expect(editor.state.doc.toJSON()).toEqual(initialJson);
    expect(undoDepth(editor.state)).toBe(undoDepthBeforeMove);
  });
});

describe("PageEditorHostRuntime multi-block drag", () => {
  const blockRects = [
    new DOMRect(132, 100, 620, 36),
    new DOMRect(132, 148, 620, 36),
    new DOMRect(132, 196, 620, 36),
    new DOMRect(132, 244, 620, 36),
    new DOMRect(132, 292, 620, 36),
    new DOMRect(132, 340, 620, 36),
    new DOMRect(132, 388, 620, 36)
  ];

  async function prepareSelectedRange(editor: Editor) {
    await setRangeDragDocument(editor);
    const geometry = mockRangeSelectionGeometry(editor, blockRects);
    await dispatchBlankGutterDrag(editor, geometry, { clientX: 80, clientY: 164 }, [{ clientX: 84, clientY: 276 }]);
    expect(getSelectedBlockTags(editor)).toEqual(["H2", "UL", "BLOCKQUOTE"]);
    return geometry;
  }

  it.each([
    {
      destinationLabel: "before-first",
      dropPoint: { clientX: 160, clientY: 84 },
      expectedSignatures: [
        "H2:Beta",
        "UL:Gamma",
        "BLOCKQUOTE:Delta",
        "P:Alpha",
        "PRE:Epsilon",
        "HR:",
        "P:Zeta"
      ],
      expectedTextContent: "BetaGammaDeltaAlphaEpsilonZeta",
      handleY: 164,
      label: "first"
    },
    {
      destinationLabel: "after-last",
      dropPoint: { clientX: 160, clientY: 470 },
      expectedSignatures: [
        "P:Alpha",
        "PRE:Epsilon",
        "HR:",
        "P:Zeta",
        "H2:Beta",
        "UL:Gamma",
        "BLOCKQUOTE:Delta"
      ],
      expectedTextContent: "AlphaEpsilonZetaBetaGammaDelta",
      handleY: 212,
      label: "middle"
    },
    {
      destinationLabel: "between-blocks",
      dropPoint: { clientX: 160, clientY: 320 },
      expectedSignatures: [
        "P:Alpha",
        "PRE:Epsilon",
        "H2:Beta",
        "UL:Gamma",
        "BLOCKQUOTE:Delta",
        "HR:",
        "P:Zeta"
      ],
      expectedTextContent: "AlphaEpsilonBetaGammaDeltaZeta",
      handleY: 260,
      label: "final"
    }
  ])(
    "moves the selected range from the $label handle to the $destinationLabel destination without changing block order",
    async ({ dropPoint, expectedSignatures, expectedTextContent, handleY }) => {
      const { editorReady, onSaveDraft } = renderRuntime();
      await waitFor(() => expect(editorReady[0]).toBeDefined());
      const editor = editorReady[0]!;
      const geometry = await prepareSelectedRange(editor);

      try {
        await runAutosave();
        onSaveDraft.mockClear();
        const undoDepthBeforeMove = undoDepth(editor.state);

      const ownerDocument = getEditorSurface(editor).ownerDocument;
      const handle = await hoverFirstVisibleHandle(editor, 160, handleY);
      await dispatchOwnerPointerEvent(ownerDocument, handle, "pointerdown", { clientX: 160, clientY: handleY }, {
        button: 0,
        buttons: 1,
        pointerId: 1
      });
      expect(getSelectedBlockTags(editor)).toEqual(["H2", "UL", "BLOCKQUOTE"]);
      expect(getFloatingBlockDragFeedback()).toBeNull();
      expect(getEditorSurface(editor)).not.toHaveClass("docsera-editor-runtime__surface--block-dragging");
      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointermove", dropPoint, {
        buttons: 1,
        pointerId: 1
      });

        const feedback = getFloatingBlockDragFeedback();
        const preview = getFloatingBlockDragPreview();
        const indicator = getFloatingBlockDropIndicator();

        expect(feedback).toBeInTheDocument();
        expect(feedback).toHaveAttribute("aria-hidden", "true");
        expect(feedback?.childElementCount).toBe(1);
        expect(preview).toBeInTheDocument();
        expect(preview?.childElementCount).toBe(3);
        expect(preview).toHaveTextContent("Beta");
        expect(preview).toHaveTextContent("Gamma");
        expect(preview).toHaveTextContent("Delta");
        expect(indicator).toBeInTheDocument();

        await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointerup", dropPoint, {
          button: 0,
          buttons: 0,
          pointerId: 1
        });

        await runAutosave();

        expect(editor.state.doc.textContent).toBe(expectedTextContent);
        expect(getTopLevelBlockSignatures(editor)).toEqual(expectedSignatures);
        expect(getSelectedBlockTags(editor)).toEqual(["H2", "UL", "BLOCKQUOTE"]);
        expect(undoDepth(editor.state)).toBe(undoDepthBeforeMove + 1);
        expect(onSaveDraft).toHaveBeenCalledTimes(1);
        expect(getFloatingBlockDragFeedback()).toBeNull();
        expect(getFloatingBlockDropIndicator()).toBeNull();
      } finally {
        geometry.mockRestore();
      }
    }
  );

  it.each([
    {
      destinationLabel: "inside the selected range",
      dropPoint: { clientX: 160, clientY: 230 }
    },
    {
      destinationLabel: "the equivalent no-op boundary after the range",
      dropPoint: { clientX: 160, clientY: 284 }
    }
  ])("rejects a $destinationLabel drop without an insertion line or mutation", async ({ dropPoint }) => {
    const { editorReady } = renderRuntime();
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    const geometry = await prepareSelectedRange(editor);

    try {
      const initialSignatures = getTopLevelBlockSignatures(editor);
      const ownerDocument = getEditorSurface(editor).ownerDocument;
      const handle = await hoverFirstVisibleHandle(editor, 160, 212);

      await dispatchOwnerPointerEvent(ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 212 }, {
        button: 0,
        buttons: 1,
        pointerId: 1
      });
      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointermove", dropPoint, {
        buttons: 1,
        pointerId: 1
      });

      expect(getFloatingBlockDragFeedback()).toBeInTheDocument();
      expect(getFloatingBlockDragPreview()).toBeInTheDocument();
      expect(getFloatingBlockDragPreview()).toHaveTextContent("Beta");
      expect(getFloatingBlockDropIndicator()).toBeNull();
      expect(getEditorSurface(editor)).toHaveClass("docsera-editor-runtime__surface--block-dragging");

      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointerup", dropPoint, {
        button: 0,
        buttons: 0,
        pointerId: 1
      });

      expect(getTopLevelBlockSignatures(editor)).toEqual(initialSignatures);
      expect(getSelectedBlockElements(editor)).toHaveLength(0);
      expect(getFloatingBlockDragFeedback()).toBeNull();
      expect(getFloatingBlockDropIndicator()).toBeNull();
    } finally {
      geometry.mockRestore();
    }
  });

  it("collapses a selected range to the clicked block and opens its menu when the handle is released below the drag threshold", async () => {
    const { editorReady } = renderRuntime();
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    const geometry = await prepareSelectedRange(editor);

    try {
      const ownerDocument = getEditorSurface(editor).ownerDocument;
      const handle = await hoverFirstVisibleHandle(editor, 160, 212);

      expect(getSelectedBlockTags(editor)).toEqual(["H2", "UL", "BLOCKQUOTE"]);

      await dispatchOwnerPointerEvent(ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 212 }, {
        button: 0,
        buttons: 1,
        pointerId: 1
      });
      expect(getSelectedBlockTags(editor)).toEqual(["H2", "UL", "BLOCKQUOTE"]);
      expect(getFloatingBlockDragFeedback()).toBeNull();
      expect(getEditorSurface(editor)).not.toHaveClass("docsera-editor-runtime__surface--block-dragging");

      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointerup", { clientX: 162, clientY: 214 }, {
        button: 0,
        buttons: 0,
        pointerId: 1
      });

      expect(getTopLevelBlockSignatures(editor)).toEqual([
        "P:Alpha",
        "H2:Beta",
        "UL:Gamma",
        "BLOCKQUOTE:Delta",
        "PRE:Epsilon",
        "HR:",
        "P:Zeta"
      ]);
      expect(getSelectedBlockTags(editor)).toEqual(["UL"]);
      expect(screen.getByRole("menu", { name: "Block actions for Bulleted List" })).toBeInTheDocument();
      expect(getFloatingBlockDragFeedback()).toBeNull();
      expect(getFloatingBlockDropIndicator()).toBeNull();
      expect(getEditorSurface(editor)).not.toHaveClass("docsera-editor-runtime__surface--block-dragging");
    } finally {
      geometry.mockRestore();
    }
  });

  it("preserves a selected range after a successful drop, creates one undo step, and restores the pre-drag document on undo", async () => {
    const { editorReady, onSaveDraft } = renderRuntime();
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    const geometry = await prepareSelectedRange(editor);

    try {
      await runAutosave();
      onSaveDraft.mockClear();
      const undoDepthBeforeMove = undoDepth(editor.state);
      const initialSignatures = getTopLevelBlockSignatures(editor);

      const ownerDocument = getEditorSurface(editor).ownerDocument;
      const handle = await hoverFirstVisibleHandle(editor, 160, 260);

      await dispatchOwnerPointerEvent(ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 260 }, {
        button: 0,
        buttons: 1,
        pointerId: 1
      });
      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointermove", { clientX: 160, clientY: 470 }, {
        buttons: 1,
        pointerId: 1
      });
      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointerup", { clientX: 160, clientY: 470 }, {
        button: 0,
        buttons: 0,
        pointerId: 1
      });

      await runAutosave();

      expect(editor.state.doc.textContent).toBe("AlphaEpsilonZetaBetaGammaDelta");
      expect(getSelectedBlockTags(editor)).toEqual(["H2", "UL", "BLOCKQUOTE"]);
      expect(undoDepth(editor.state)).toBe(undoDepthBeforeMove + 1);
      expect(onSaveDraft).toHaveBeenCalledTimes(1);

      await act(async () => {
        editor.commands.undo();
      });

      expect(getTopLevelBlockSignatures(editor)).toEqual(initialSignatures);
      expect(getSelectedBlockElements(editor)).toHaveLength(0);
    } finally {
      geometry.mockRestore();
    }
  });

  it("cancels a selected-range drag without changing the document or leaving stale drag state behind", async () => {
    const { editorReady } = renderRuntime();
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    const geometry = await prepareSelectedRange(editor);

    try {
      const initialSignatures = getTopLevelBlockSignatures(editor);
      const ownerDocument = getEditorSurface(editor).ownerDocument;
      const handle = await hoverFirstVisibleHandle(editor, 160, 164);

      await dispatchOwnerPointerEvent(ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 164 }, {
        button: 0,
        buttons: 1,
        pointerId: 1
      });
      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointermove", { clientX: 24, clientY: 164 }, {
        buttons: 1,
        pointerId: 1
      });

      expect(getFloatingBlockDragFeedback()).toBeInTheDocument();
      expect(getFloatingBlockDropIndicator()).toBeNull();
      expect(getEditorSurface(editor)).toHaveClass("docsera-editor-runtime__surface--block-dragging");

      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointercancel", { clientX: 24, clientY: 164 }, {
        button: 0,
        buttons: 0,
        pointerId: 1
      });

      expect(getTopLevelBlockSignatures(editor)).toEqual(initialSignatures);
      expect(getSelectedBlockElements(editor)).toHaveLength(0);
      expect(getFloatingBlockDragFeedback()).toBeNull();
      expect(getFloatingBlockDropIndicator()).toBeNull();
      expect(getEditorSurface(editor)).not.toHaveClass("docsera-editor-runtime__surface--block-dragging");
    } finally {
      geometry.mockRestore();
    }
  });

  it("keeps an unselected block handle on the single-block drag path even when a contiguous range is already selected", async () => {
    const { editorReady } = renderRuntime();
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    const geometry = await prepareSelectedRange(editor);

    try {
      const ownerDocument = getEditorSurface(editor).ownerDocument;
      const handle = await hoverFirstVisibleHandle(editor, 160, 308);

      await dispatchOwnerPointerEvent(ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 308 }, {
        button: 0,
        buttons: 1,
        pointerId: 1
      });
      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointermove", { clientX: 160, clientY: 470 }, {
        buttons: 1,
        pointerId: 1
      });

      expect(getFloatingBlockDragPreview()).toBeInTheDocument();
      expect(getFloatingBlockDragPreview()).toHaveTextContent("Epsilon");
      expect(getFloatingBlockDragPreview()?.childElementCount).toBe(1);
      expect(getFloatingBlockDropIndicator()).toBeInTheDocument();

      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointerup", { clientX: 160, clientY: 470 }, {
        button: 0,
        buttons: 0,
        pointerId: 1
      });

      expect(getTopLevelBlockSignatures(editor)).toEqual([
        "P:Alpha",
        "H2:Beta",
        "UL:Gamma",
        "BLOCKQUOTE:Delta",
        "HR:",
        "P:Zeta",
        "PRE:Epsilon"
      ]);
      expect(getSelectedBlockTags(editor)).toEqual(["PRE"]);
    } finally {
      geometry.mockRestore();
    }
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

  it("continues scrolling near the bottom edge with a stationary pointer and advances the destination", async () => {
    const callbacks: FrameRequestCallback[] = [];
    let frameId = 0;
    const requestAnimationFrameSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callbacks.push(callback);
      frameId += 1;
      return frameId;
    });
    const cancelAnimationFrameSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const { editorReady } = renderRuntime();
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    await setBlocks(editor, Array.from({ length: 14 }, (_, index) => `Block ${index + 1}`));
    const baseRects = Array.from({ length: 14 }, (_, index) => new DOMRect(132, 100 + index * 48, 620, 36));
    const geometry = mockRangeSelectionGeometry(editor, baseRects);
    const scrollGeometry = mockScrollableMainPaneGeometry(editor, geometry, baseRects);

    try {
      const ownerDocument = getEditorSurface(editor).ownerDocument;
      const handle = await hoverFirstVisibleHandle(editor, 160, 116);

      await dispatchOwnerPointerEvent(ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 116 }, { button: 0, buttons: 1, pointerId: 1 });
      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointermove", { clientX: 160, clientY: 620 }, { buttons: 1, pointerId: 1 });

      const firstIndicator = getFloatingBlockDropIndicator();
      expect(firstIndicator).toBeInTheDocument();
      const firstTop = Number.parseFloat(firstIndicator?.style.top ?? "0");

      await runQueuedAnimationFramesUntil(callbacks, () => scrollGeometry.getScrollTop() > 0);

      expect(scrollGeometry.getScrollTop()).toBeGreaterThan(0);
      const nextIndicator = getFloatingBlockDropIndicator();
      expect(nextIndicator).toBeInTheDocument();
      expect(Number.parseFloat(nextIndicator?.style.top ?? "0")).toBeLessThan(firstTop);
      expect(getFloatingBlockDragFeedback()).toBeInTheDocument();

      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointermove", { clientX: 160, clientY: 300 }, { buttons: 1, pointerId: 1 });
      const scrollAfterLeavingEdge = scrollGeometry.getScrollTop();
      await runQueuedAnimationFramesUntil(callbacks, () => callbacks.length === 0);
      expect(scrollGeometry.getScrollTop()).toBe(scrollAfterLeavingEdge);

      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointerup", { clientX: 160, clientY: 300 }, { button: 0, buttons: 0, pointerId: 1 });
      expect(getFloatingBlockDragFeedback()).toBeNull();
      const scrollAfterRelease = scrollGeometry.getScrollTop();
      await runQueuedAnimationFramesUntil(callbacks, () => callbacks.length === 0);
      expect(scrollGeometry.getScrollTop()).toBe(scrollAfterRelease);
      expect(getFloatingBlockDragFeedback()).toBeNull();
    } finally {
      scrollGeometry.mockRestore();
      geometry.mockRestore();
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
  });

  it("continues scrolling near the top edge with a stationary pointer and keeps the drag source selected", async () => {
    const callbacks: FrameRequestCallback[] = [];
    let frameId = 0;
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callbacks.push(callback);
      frameId += 1;
      return frameId;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
    const { editorReady } = renderRuntime();
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    await setBlocks(editor, Array.from({ length: 12 }, (_, index) => `Block ${index + 1}`));
    const baseRects = Array.from({ length: 12 }, (_, index) => new DOMRect(132, 100 + index * 48, 620, 36));
    const geometry = mockRangeSelectionGeometry(editor, baseRects);
    const scrollGeometry = mockScrollableMainPaneGeometry(editor, geometry, baseRects);

    try {
      const ownerDocument = getEditorSurface(editor).ownerDocument;
      const handle = await hoverFirstVisibleHandle(editor, 160, 356);
      await dispatchOwnerPointerEvent(ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 356 }, { button: 0, buttons: 1, pointerId: 1 });
      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointermove", { clientX: 160, clientY: 620 }, { buttons: 1, pointerId: 1 });
      await runQueuedAnimationFramesUntil(callbacks, () => scrollGeometry.getScrollTop() > 0);

      const scrolledDown = scrollGeometry.getScrollTop();
      expect(scrolledDown).toBeGreaterThan(0);

      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointermove", { clientX: 160, clientY: 84 }, { buttons: 1, pointerId: 1 });
      await runQueuedAnimationFramesUntil(callbacks, () => scrollGeometry.getScrollTop() < scrolledDown);

      expect(scrollGeometry.getScrollTop()).toBeLessThan(scrolledDown);
      expect(getSelectedBlockElement(editor)).toHaveTextContent("Block 6");
      expect(getFloatingBlockDragFeedback()).toBeInTheDocument();

      await dispatchOwnerPointerEvent(ownerDocument, ownerDocument, "pointercancel", { clientX: 160, clientY: 84 }, { button: 0, buttons: 0, pointerId: 1 });
      expect(getFloatingBlockDragFeedback()).toBeNull();
    } finally {
      scrollGeometry.mockRestore();
      geometry.mockRestore();
      vi.restoreAllMocks();
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
