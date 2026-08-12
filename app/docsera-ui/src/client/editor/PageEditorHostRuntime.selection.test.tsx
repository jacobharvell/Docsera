/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, createEvent, fireEvent, screen, waitFor } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { undoDepth } from "@tiptap/pm/history";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createEnvelopeFromDocument, renderRuntime, runAutosave } from "./PageEditorHostRuntime.testUtils";
import { PageEditorHostRuntime } from "./PageEditorHostRuntime";

function createSelectionEnvelope() {
  return createEnvelopeFromDocument({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Alpha" }]
      },
      {
        type: "heading",
        attrs: { level: 2 },
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

function getEditorSurface(editor: Editor): HTMLElement {
  const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
  if (!(surface instanceof HTMLElement)) {
    throw new Error("Expected the editor surface to be available.");
  }

  return surface;
}

function getEditorPanel(editor: Editor): HTMLElement {
  const panel = getEditorSurface(editor).closest(".docsera-main__surface--editor");
  if (!(panel instanceof HTMLElement)) {
    throw new Error("Expected the editor panel to be available.");
  }

  return panel;
}

function getSelectionMarquee(): HTMLElement | null {
  return document.querySelector(".docsera-editor-floating__selection-marquee");
}

function getFloatingLayer(): HTMLElement | null {
  return document.querySelector(".docsera-editor-floating-layer");
}

type AnimationFrameEntry = {
  callback: FrameRequestCallback;
  id: number;
};

function createAnimationFrameHarness() {
  const queuedFrames: AnimationFrameEntry[] = [];
  const canceledFrameIds = new Set<number>();
  let nextFrameId = 0;
  const requestAnimationFrameSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    const id = nextFrameId + 1;
    nextFrameId = id;
    queuedFrames.push({ callback, id });
    return id;
  });
  const cancelAnimationFrameSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation((frameId) => {
    canceledFrameIds.add(frameId);
  });

  return {
    cancelAnimationFrameSpy,
    requestAnimationFrameSpy,
    shiftNextFrame(): FrameRequestCallback | undefined {
      while (queuedFrames.length > 0) {
        const nextFrame = queuedFrames.shift();
        if (!nextFrame) {
          return undefined;
        }
        if (canceledFrameIds.has(nextFrame.id)) {
          canceledFrameIds.delete(nextFrame.id);
          continue;
        }
        return nextFrame.callback;
      }

      return undefined;
    }
  };
}

function getSelectedBlockElements(editor: Editor): HTMLElement[] {
  return Array.from(editor.view.dom.querySelectorAll("[data-docsera-block-selected='true']")).filter(
    (element): element is HTMLElement => element instanceof HTMLElement
  );
}

function getSelectedBlockTags(editor: Editor): string[] {
  return getSelectedBlockElements(editor).map((element) => element.tagName);
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

function defineSyntheticPointerEventProperties(
  event: Event,
  point: { clientX: number; clientY: number },
  options: {
    button?: number;
    buttons?: number;
    isPrimary?: boolean;
    pointerId?: number;
    pointerType?: string;
  } = {}
) {
  Object.defineProperties(event, {
    button: {
      configurable: true,
      value: options.button ?? 0
    },
    buttons: {
      configurable: true,
      value: options.buttons ?? 1
    },
    clientX: {
      configurable: true,
      value: point.clientX
    },
    clientY: {
      configurable: true,
      value: point.clientY
    },
    isPrimary: {
      configurable: true,
      value: options.isPrimary ?? true
    },
    pointerId: {
      configurable: true,
      value: options.pointerId ?? 1
    },
    pointerType: {
      configurable: true,
      value: options.pointerType ?? "mouse"
    }
  });
}

function mockTopLevelBlockGeometry(editor: Editor, blockRects: DOMRect[]) {
  const surface = getEditorSurface(editor);
  const proseMirror = editor.view.dom;
  const proseMirrorChildren = Array.from(proseMirror.children);
  let nextBlockRects = blockRects;
  let surfaceRect = new DOMRect(72, 96, 760, 540);
  let mainPaneRect = new DOMRect(40, 36, 960, 620);
  let panelRect = new DOMRect(132, 36, 768, 620);
  const titleRect = new DOMRect(132, 64, 260, 48);
  let titleTextRect = new DOMRect(184, 74, 102, 26);
  let hostRect = new DOMRect(72, 96, 760, 540);
  let proseMirrorRect = new DOMRect(132, 100, 620, 420);
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
    const originalGetClientRects =
      typeof nativeRange.getClientRects === "function" ? nativeRange.getClientRects.bind(nativeRange) : () => [];
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
    setLayoutRects(nextRects: {
      blockRects?: DOMRect[];
      hostRect?: DOMRect;
      mainPaneRect?: DOMRect;
      panelRect?: DOMRect;
      proseMirrorRect?: DOMRect;
      surfaceRect?: DOMRect;
    }) {
      if (nextRects.blockRects) {
        nextBlockRects = nextRects.blockRects;
        proseMirrorChildren.forEach((child, index) => {
          mockElementRect(child, nextBlockRects[index] ?? new DOMRect(0, 0, 1, 1));
        });
      }
      hostRect = nextRects.hostRect ?? hostRect;
      mainPaneRect = nextRects.mainPaneRect ?? mainPaneRect;
      panelRect = nextRects.panelRect ?? panelRect;
      proseMirrorRect = nextRects.proseMirrorRect ?? proseMirrorRect;
      surfaceRect = nextRects.surfaceRect ?? surfaceRect;
    },
    setTitleTextRect(nextRect: DOMRect) {
      titleTextRect = nextRect;
    },
    setTitleText(text: string) {
      titleTextNode.textContent = text;
    },
    mockRestore() {
      for (const reset of restore.reverse()) {
        reset();
      }
      document.createRange = originalCreateRange;
      workspace.remove();
    }
  };
}

function mockScrollableMainPaneGeometry(
  editor: Editor,
  geometry: ReturnType<typeof mockTopLevelBlockGeometry>,
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
    isPrimary?: boolean;
  } = {}
) {
  const dispatchTarget =
    target instanceof Node && target.isConnected && target.ownerDocument === ownerDocument
      ? target
      : ownerDocument.body;
  const eventFactory =
    type === "pointerdown"
      ? createEvent.pointerDown
      : type === "pointermove"
        ? createEvent.pointerMove
        : type === "pointerup"
          ? createEvent.pointerUp
          : type === "pointercancel"
            ? createEvent.pointerCancel
            : null;
  const event =
    typeof eventFactory === "function"
      ? eventFactory(dispatchTarget as Element, {
          button: options.button ?? 0,
          buttons: options.buttons ?? (type === "pointerup" ? 0 : 1),
          clientX: point.clientX,
          clientY: point.clientY,
          pointerId: options.pointerId ?? 1,
          pointerType: options.pointerType ?? "mouse"
        })
      : new Event(type, { bubbles: true, cancelable: true });
  defineSyntheticPointerEventProperties(event, point, {
    button: options.button ?? 0,
    buttons: options.buttons ?? (type === "pointerup" ? 0 : 1),
    isPrimary: options.isPrimary ?? true,
    pointerId: options.pointerId ?? 1,
    pointerType: options.pointerType ?? "mouse"
  });
  Object.defineProperty(event, "composedPath", {
    configurable: true,
    value: () => options.composedPath?.filter(Boolean) ?? [target]
  });

  await act(async () => {
    if (dispatchTarget !== target) {
      Object.defineProperty(event, "target", {
        configurable: true,
        value: target
      });
    }
    fireEvent(dispatchTarget as Element, event);
  });

  return event;
}

async function dispatchBlankGutterDrag(
  editor: Editor,
  start: { clientX: number; clientY: number },
  moves: Array<{ clientX: number; clientY: number }>,
  options: {
    composedPath?: Array<EventTarget | null | undefined>;
    target?: EventTarget;
  } = {}
) {
  const surface = getEditorSurface(editor);
  const target = options.target ?? surface;
  if (!options.composedPath && target instanceof Element) {
    await act(async () => {
      const event = createEvent.pointerDown(target);
      defineSyntheticPointerEventProperties(event, start, {
        button: 0,
        buttons: 1,
        pointerId: 1,
        pointerType: "mouse"
      });
      fireEvent(target, event);
    });

    for (const move of moves) {
      await act(async () => {
        const event = createEvent.pointerMove(surface.ownerDocument.body);
        defineSyntheticPointerEventProperties(event, move, {
          buttons: 1,
          pointerId: 1,
          pointerType: "mouse"
        });
        fireEvent(surface.ownerDocument.body, event);
      });
    }

    await act(async () => {
      const endPoint = moves[moves.length - 1] ?? start;
      const event = createEvent.pointerUp(surface.ownerDocument.body);
      defineSyntheticPointerEventProperties(event, endPoint, {
        button: 0,
        buttons: 0,
        pointerId: 1,
        pointerType: "mouse"
      });
      fireEvent(surface.ownerDocument.body, event);
    });
    return;
  }

  const ownerDocument = surface.ownerDocument;
  const composedPath = options.composedPath ?? [target];

  await dispatchOwnerPointerEvent(ownerDocument, target, "pointerdown", start, {
    button: 0,
    buttons: 1,
    composedPath,
    pointerId: 1
  });

  for (const move of moves) {
    await dispatchOwnerPointerEvent(ownerDocument, target, "pointermove", move, {
      buttons: 1,
      composedPath,
      pointerId: 1
    });
  }

  await dispatchOwnerPointerEvent(ownerDocument, target, "pointerup", moves[moves.length - 1] ?? start, {
    button: 0,
    buttons: 0,
    composedPath,
    pointerId: 1
  });
}

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe("PageEditorHostRuntime gutter range selection", () => {
  it("auto-scrolls panel-background range selection with a fixed anchor and no document mutation", async () => {
    const animationFrames = createAnimationFrameHarness();
    const { editorReady, onSaveDraft } = renderRuntime();
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: Array.from({ length: 14 }, (_, index) => ({
          type: "paragraph",
          content: [{ type: "text", text: `Block ${index + 1}` }]
        }))
      });
    });
    const baseRects = Array.from({ length: 14 }, (_, index) => new DOMRect(132, 100 + index * 48, 620, 36));
    const geometry = mockTopLevelBlockGeometry(editor, baseRects);
    const scrollGeometry = mockScrollableMainPaneGeometry(editor, geometry, baseRects);

    try {
      await runAutosave();
      onSaveDraft.mockClear();
      const startingDocument = editor.getJSON();
      const undoDepthBeforeSelection = undoDepth(editor.state);
      const surface = getEditorSurface(editor);
      await dispatchOwnerPointerEvent(surface.ownerDocument, geometry.elements.mainPane, "pointerdown", { clientX: 80, clientY: 164 }, {
        button: 0,
        buttons: 1,
        composedPath: [geometry.elements.mainPane, geometry.elements.workspace, document.body],
        pointerId: 1
      });
      await dispatchOwnerPointerEvent(surface.ownerDocument, geometry.elements.mainPane, "pointermove", { clientX: 80, clientY: 620 }, {
        buttons: 1,
        composedPath: [geometry.elements.mainPane, geometry.elements.workspace, document.body],
        pointerId: 1
      });

      const selectedBeforeScroll = getSelectedBlockElements(editor).length;
      expect(selectedBeforeScroll).toBeGreaterThan(1);

      await act(async () => {
        for (let index = 0; index < 4 && scrollGeometry.getScrollTop() === 0; index += 1) {
          animationFrames.shiftNextFrame()?.(index * 16);
        }
      });

      expect(scrollGeometry.getScrollTop()).toBeGreaterThan(0);
      expect(getSelectedBlockElements(editor).length).toBeGreaterThanOrEqual(selectedBeforeScroll);
      expect(getSelectedBlockElements(editor)[0]).toHaveTextContent("Block 2");

      await dispatchOwnerPointerEvent(surface.ownerDocument, geometry.elements.mainPane, "pointermove", { clientX: 80, clientY: 84 }, {
        buttons: 1,
        composedPath: [geometry.elements.mainPane, geometry.elements.workspace, document.body],
        pointerId: 1
      });
      const scrolledDown = scrollGeometry.getScrollTop();
      await act(async () => {
        for (let index = 0; index < 4 && scrollGeometry.getScrollTop() >= scrolledDown; index += 1) {
          animationFrames.shiftNextFrame()?.(64 + index * 16);
        }
      });

      expect(scrollGeometry.getScrollTop()).toBeLessThan(scrolledDown);
      expect(getSelectedBlockElements(editor)[0]).toHaveTextContent("Block 1");
      expect(editor.getJSON()).toEqual(startingDocument);
      expect(undoDepth(editor.state)).toBe(undoDepthBeforeSelection);
      await runAutosave();
      expect(onSaveDraft).toHaveBeenCalledTimes(0);

      fireEvent.keyDown(surface.ownerDocument, { key: "Escape" });
      expect(getSelectionMarquee()).toBeNull();
    } finally {
      scrollGeometry.mockRestore();
      geometry.mockRestore();
      vi.restoreAllMocks();
    }
  });

  it("arms only after a blank-gutter drag crosses the intent threshold, preserves the range on release, and stays outside autosave and undo", async () => {
    const initialEnvelope = createSelectionEnvelope();
    const { editorReady, onSaveDraft } = renderRuntime({ initialEnvelope });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 100, 620, 36),
      new DOMRect(132, 148, 620, 36),
      new DOMRect(132, 196, 620, 36),
      new DOMRect(132, 244, 620, 36),
      new DOMRect(132, 292, 620, 36),
      new DOMRect(132, 340, 620, 36),
      new DOMRect(132, 388, 620, 36)
    ]);
    try {
      const surface = getEditorSurface(editor);
      await dispatchOwnerPointerEvent(surface.ownerDocument, geometry.elements.mainPane, "pointerdown", { clientX: 80, clientY: 164 }, {
        button: 0,
        buttons: 1,
        composedPath: [geometry.elements.mainPane, geometry.elements.workspace, document.body],
        pointerId: 1
      });
      await dispatchOwnerPointerEvent(surface.ownerDocument, geometry.elements.mainPane, "pointermove", { clientX: 82, clientY: 166 }, {
        buttons: 1,
        composedPath: [geometry.elements.mainPane, geometry.elements.workspace, document.body],
        pointerId: 1
      });

      expect(getSelectedBlockElements(editor)).toHaveLength(0);
      expect(screen.queryByRole("menu")).toBeNull();
      expect(screen.queryByRole("toolbar")).toBeNull();

      await dispatchOwnerPointerEvent(surface.ownerDocument, geometry.elements.mainPane, "pointermove", { clientX: 82, clientY: 228 }, {
        buttons: 1,
        composedPath: [geometry.elements.mainPane, geometry.elements.workspace, document.body],
        pointerId: 1
      });
      await dispatchOwnerPointerEvent(surface.ownerDocument, geometry.elements.mainPane, "pointerup", { clientX: 82, clientY: 228 }, {
        button: 0,
        buttons: 0,
        composedPath: [geometry.elements.mainPane, geometry.elements.workspace, document.body],
        pointerId: 1
      });

      expect(getSelectedBlockTags(editor)).toEqual(["H2", "UL"]);
      expect(undoDepth(editor.state)).toBe(0);
      await runAutosave();
      expect(onSaveDraft).toHaveBeenCalledTimes(0);
    } finally {
      geometry.mockRestore();
    }
  });

  it("arms from right panel background and preserves the contiguous range on release", async () => {
    const initialEnvelope = createSelectionEnvelope();
    const { editorReady } = renderRuntime({ initialEnvelope });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 100, 620, 36),
      new DOMRect(132, 148, 620, 36),
      new DOMRect(132, 196, 620, 36),
      new DOMRect(132, 244, 620, 36),
      new DOMRect(132, 292, 620, 36),
      new DOMRect(132, 340, 620, 36),
      new DOMRect(132, 388, 620, 36)
    ]);

    try {
      await dispatchBlankGutterDrag(editor, { clientX: 940, clientY: 164 }, [{ clientX: 944, clientY: 228 }]);
      expect(getSelectedBlockTags(editor)).toEqual(["H2", "UL"]);
    } finally {
      geometry.mockRestore();
    }
  });

  it("arms from both outer side bands when MAIN owns the target path and the article path is absent", async () => {
    const initialEnvelope = createSelectionEnvelope();
    const { editorReady } = renderRuntime({ initialEnvelope });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 100, 620, 36),
      new DOMRect(132, 148, 620, 36),
      new DOMRect(132, 196, 620, 36),
      new DOMRect(132, 244, 620, 36),
      new DOMRect(132, 292, 620, 36),
      new DOMRect(132, 340, 620, 36),
      new DOMRect(132, 388, 620, 36)
    ]);

    try {
      await dispatchBlankGutterDrag(editor, { clientX: 80, clientY: 164 }, [{ clientX: 84, clientY: 228 }], {
        composedPath: [geometry.elements.mainPane, geometry.elements.workspace, document.body],
        target: geometry.elements.mainPane
      });
      expect(getSelectedBlockTags(editor)).toEqual(["H2", "UL"]);

      await dispatchBlankGutterDrag(editor, { clientX: 940, clientY: 164 }, [{ clientX: 936, clientY: 228 }], {
        composedPath: [geometry.elements.mainPane, geometry.elements.workspace, document.body],
        target: geometry.elements.mainPane
      });
      expect(getSelectedBlockTags(editor)).toEqual(["H2", "UL"]);
    } finally {
      geometry.mockRestore();
    }
  });

  it("anchors the first block from panel background above the first body block", async () => {
    const initialEnvelope = createSelectionEnvelope();
    const { editorReady } = renderRuntime({ initialEnvelope });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 140, 620, 36),
      new DOMRect(132, 188, 620, 36),
      new DOMRect(132, 236, 620, 36),
      new DOMRect(132, 284, 620, 36),
      new DOMRect(132, 332, 620, 36),
      new DOMRect(132, 380, 620, 36),
      new DOMRect(132, 428, 620, 36)
    ]);

    try {
      await dispatchBlankGutterDrag(editor, { clientX: 80, clientY: 124 }, [{ clientX: 84, clientY: 204 }]);
      expect(getSelectedBlockTags(editor)).toEqual(["P", "H2"]);
    } finally {
      geometry.mockRestore();
    }
  });

  it("anchors the last block from panel background below the final body block", async () => {
    const initialEnvelope = createSelectionEnvelope();
    const { editorReady } = renderRuntime({ initialEnvelope });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 140, 620, 36),
      new DOMRect(132, 188, 620, 36),
      new DOMRect(132, 236, 620, 36),
      new DOMRect(132, 284, 620, 36),
      new DOMRect(132, 332, 620, 36),
      new DOMRect(132, 380, 620, 36),
      new DOMRect(132, 428, 620, 36)
    ]);

    try {
      await dispatchBlankGutterDrag(editor, { clientX: 940, clientY: 484 }, [{ clientX: 936, clientY: 396 }]);
      expect(getSelectedBlockTags(editor)).toEqual(["HR", "P"]);
    } finally {
      geometry.mockRestore();
    }
  });

  it("keeps rendered title text ineligible while allowing empty space beside and around it inside the title row", async () => {
    const initialEnvelope = createSelectionEnvelope();
    const { editorReady } = renderRuntime({ initialEnvelope });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 140, 620, 36),
      new DOMRect(132, 188, 620, 36),
      new DOMRect(132, 236, 620, 36),
      new DOMRect(132, 284, 620, 36),
      new DOMRect(132, 332, 620, 36),
      new DOMRect(132, 380, 620, 36),
      new DOMRect(132, 428, 620, 36)
    ]);

    try {
      await dispatchBlankGutterDrag(editor, { clientX: 210, clientY: 88 }, [{ clientX: 212, clientY: 142 }]);
      expect(getSelectedBlockElements(editor)).toHaveLength(0);

      await dispatchBlankGutterDrag(editor, { clientX: 148, clientY: 88 }, [{ clientX: 152, clientY: 142 }]);
      expect(getSelectedBlockTags(editor)).toEqual(["P"]);

      await dispatchBlankGutterDrag(editor, { clientX: 324, clientY: 88 }, [{ clientX: 328, clientY: 142 }]);
      expect(getSelectedBlockTags(editor)).toEqual(["P"]);

      await dispatchBlankGutterDrag(editor, { clientX: 210, clientY: 68 }, [{ clientX: 214, clientY: 142 }]);
      expect(getSelectedBlockTags(editor)).toEqual(["P"]);

      await dispatchBlankGutterDrag(editor, { clientX: 210, clientY: 116 }, [{ clientX: 214, clientY: 142 }]);
      expect(getSelectedBlockTags(editor)).toEqual(["P"]);
    } finally {
      geometry.mockRestore();
    }
  });

  it("recomputes title text geometry when the title content or layout changes", async () => {
    const initialEnvelope = createSelectionEnvelope();
    const { editorReady } = renderRuntime({ initialEnvelope });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 140, 620, 36),
      new DOMRect(132, 188, 620, 36),
      new DOMRect(132, 236, 620, 36),
      new DOMRect(132, 284, 620, 36),
      new DOMRect(132, 332, 620, 36),
      new DOMRect(132, 380, 620, 36),
      new DOMRect(132, 428, 620, 36)
    ]);

    try {
      await dispatchBlankGutterDrag(editor, { clientX: 300, clientY: 88 }, [{ clientX: 304, clientY: 144 }]);
      expect(getSelectedBlockTags(editor)).toEqual(["P"]);

      geometry.setTitleText("expanded title content");
      geometry.setTitleTextRect(new DOMRect(214, 74, 128, 26));

      await dispatchBlankGutterDrag(editor, { clientX: 300, clientY: 88 }, [{ clientX: 304, clientY: 144 }]);
      expect(getSelectedBlockElements(editor)).toHaveLength(0);
    } finally {
      geometry.mockRestore();
    }
  });

  it("rejects points outside the main-pane edges and excludes nav, ToC toggle, and shell overlays", async () => {
    const initialEnvelope = createSelectionEnvelope();
    const { editorReady } = renderRuntime({ initialEnvelope });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 100, 620, 36),
      new DOMRect(132, 148, 620, 36),
      new DOMRect(132, 196, 620, 36),
      new DOMRect(132, 244, 620, 36),
      new DOMRect(132, 292, 620, 36),
      new DOMRect(132, 340, 620, 36),
      new DOMRect(132, 388, 620, 36)
    ]);
    const pageSettingsOverlay = document.createElement("div");
    pageSettingsOverlay.className = "docsera-page-settings-overlay";
    document.body.append(pageSettingsOverlay);

    try {
      await dispatchBlankGutterDrag(editor, { clientX: 39, clientY: 164 }, [{ clientX: 35, clientY: 228 }], {
        composedPath: [geometry.elements.workspace, document.body],
        target: geometry.elements.workspace
      });
      expect(getSelectedBlockElements(editor)).toHaveLength(0);

      await dispatchBlankGutterDrag(editor, { clientX: 1001, clientY: 164 }, [{ clientX: 1005, clientY: 228 }], {
        composedPath: [geometry.elements.workspace, document.body],
        target: geometry.elements.workspace
      });
      expect(getSelectedBlockElements(editor)).toHaveLength(0);

      await dispatchOwnerPointerEvent(document, geometry.elements.nav, "pointerdown", { clientX: 24, clientY: 164 }, {
        button: 0,
        buttons: 1,
        composedPath: [geometry.elements.nav, geometry.elements.workspace, document.body],
        pointerId: 71
      });
      expect(getSelectedBlockElements(editor)).toHaveLength(0);

      await dispatchOwnerPointerEvent(document, geometry.elements.tocToggle, "pointerdown", { clientX: 994, clientY: 164 }, {
        button: 0,
        buttons: 1,
        composedPath: [geometry.elements.tocToggle, geometry.elements.aside, geometry.elements.workspace, document.body],
        pointerId: 72
      });
      expect(getSelectedBlockElements(editor)).toHaveLength(0);

      await dispatchOwnerPointerEvent(document, pageSettingsOverlay, "pointerdown", { clientX: 980, clientY: 164 }, {
        button: 0,
        buttons: 1,
        composedPath: [pageSettingsOverlay, document.body],
        pointerId: 73
      });
      expect(getSelectedBlockElements(editor)).toHaveLength(0);
    } finally {
      pageSettingsOverlay.remove();
      geometry.mockRestore();
    }
  });

  it("recomputes main-pane ownership geometry when the shell width and article offset change", async () => {
    const initialEnvelope = createSelectionEnvelope();
    const { editorReady } = renderRuntime({ initialEnvelope });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 100, 620, 36),
      new DOMRect(132, 148, 620, 36),
      new DOMRect(132, 196, 620, 36),
      new DOMRect(132, 244, 620, 36),
      new DOMRect(132, 292, 620, 36),
      new DOMRect(132, 340, 620, 36),
      new DOMRect(132, 388, 620, 36)
    ]);

    try {
      await dispatchBlankGutterDrag(editor, { clientX: 940, clientY: 164 }, [{ clientX: 936, clientY: 228 }]);
      expect(getSelectedBlockTags(editor)).toEqual(["H2", "UL"]);

      geometry.setLayoutRects({
        blockRects: [
          new DOMRect(276, 100, 440, 36),
          new DOMRect(276, 148, 440, 36),
          new DOMRect(276, 196, 440, 36),
          new DOMRect(276, 244, 440, 36),
          new DOMRect(276, 292, 440, 36),
          new DOMRect(276, 340, 440, 36),
          new DOMRect(276, 388, 440, 36)
        ],
        hostRect: new DOMRect(144, 96, 760, 540),
        mainPaneRect: new DOMRect(120, 36, 760, 620),
        panelRect: new DOMRect(216, 36, 560, 620),
        proseMirrorRect: new DOMRect(276, 100, 440, 420),
        surfaceRect: new DOMRect(144, 96, 760, 540)
      });

      await dispatchBlankGutterDrag(editor, { clientX: 124, clientY: 164 }, [{ clientX: 128, clientY: 228 }], {
        composedPath: [geometry.elements.mainPane, geometry.elements.workspace, document.body],
        target: geometry.elements.mainPane
      });
      expect(getSelectedBlockTags(editor)).toEqual(["H2", "UL"]);

      await dispatchBlankGutterDrag(editor, { clientX: 840, clientY: 164 }, [{ clientX: 836, clientY: 228 }], {
        composedPath: [geometry.elements.mainPane, geometry.elements.workspace, document.body],
        target: geometry.elements.mainPane
      });
      expect(getSelectedBlockTags(editor)).toEqual(["H2", "UL"]);
    } finally {
      geometry.mockRestore();
    }
  });

  it("arms from empty inter-block space inside the central column and keeps actual block rectangles ineligible", async () => {
    const initialEnvelope = createSelectionEnvelope();
    const { editorReady } = renderRuntime({ initialEnvelope });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 100, 620, 36),
      new DOMRect(132, 168, 620, 36),
      new DOMRect(132, 236, 620, 36),
      new DOMRect(132, 304, 620, 36),
      new DOMRect(132, 372, 620, 36),
      new DOMRect(132, 440, 620, 36),
      new DOMRect(132, 508, 620, 36)
    ]);

    try {
      await dispatchBlankGutterDrag(editor, { clientX: 220, clientY: 152 }, [{ clientX: 224, clientY: 252 }]);
      expect(getSelectedBlockTags(editor)).toEqual(["H2", "UL"]);

      await dispatchBlankGutterDrag(editor, { clientX: 220, clientY: 116 }, [{ clientX: 224, clientY: 252 }]);
      expect(getSelectedBlockElements(editor)).toHaveLength(0);
    } finally {
      geometry.mockRestore();
    }
  });

  it("shows the marquee only after threshold crossing and removes it on release while keeping block highlights", async () => {
    const initialEnvelope = createSelectionEnvelope();
    const { editorReady } = renderRuntime({ initialEnvelope });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 100, 620, 36),
      new DOMRect(132, 148, 620, 36),
      new DOMRect(132, 196, 620, 36),
      new DOMRect(132, 244, 620, 36),
      new DOMRect(132, 292, 620, 36),
      new DOMRect(132, 340, 620, 36),
      new DOMRect(132, 388, 620, 36)
    ]);

    try {
      const surface = getEditorSurface(editor);
      await dispatchOwnerPointerEvent(surface.ownerDocument, surface, "pointerdown", { clientX: 80, clientY: 164 }, {
        button: 0,
        buttons: 1,
        pointerId: 22
      });
      expect(getSelectionMarquee()).toBeNull();

      await dispatchOwnerPointerEvent(surface.ownerDocument, surface.ownerDocument.body, "pointermove", { clientX: 84, clientY: 228 }, {
        buttons: 1,
        pointerId: 22
      });
      await waitFor(() => expect(getSelectionMarquee()).not.toBeNull());
      const marquee = getSelectionMarquee();
      const floatingLayer = getFloatingLayer();
      expect(marquee).toBeInstanceOf(HTMLElement);
      expect(floatingLayer).toBeInstanceOf(HTMLElement);
      expect(Number.parseFloat(marquee?.style.width ?? "0")).toBeGreaterThan(0);
      expect(Number.parseFloat(marquee?.style.height ?? "0")).toBeGreaterThan(0);
      expect(floatingLayer).toHaveClass("docsera-editor-runtime--light");
      expect(getComputedStyle(floatingLayer!).getPropertyValue("--docsera-editor-primary").trim()).toBe("#015ec2");
      expect(getComputedStyle(marquee!).display).toBe("block");
      expect(getComputedStyle(marquee!).visibility).toBe("visible");
      expect(getComputedStyle(floatingLayer!).getPropertyValue("--docsera-editor-panel").trim()).toBe("rgba(255, 255, 255, 0.98)");
      expect(getSelectedBlockTags(editor)).toEqual(["H2", "UL"]);

      await dispatchOwnerPointerEvent(surface.ownerDocument, surface.ownerDocument.body, "pointerup", { clientX: 84, clientY: 228 }, {
        button: 0,
        buttons: 0,
        pointerId: 22
      });
      await waitFor(() => expect(getSelectionMarquee()).toBeNull());
      expect(getSelectedBlockTags(editor)).toEqual(["H2", "UL"]);
    } finally {
      geometry.mockRestore();
    }
  });

  it("treats the near-block caret strip as text intent and places the caret at the block start", async () => {
    const initialEnvelope = createSelectionEnvelope();
    const { editorReady } = renderRuntime({ initialEnvelope });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 100, 620, 36),
      new DOMRect(132, 148, 620, 36),
      new DOMRect(132, 196, 620, 36),
      new DOMRect(132, 244, 620, 36),
      new DOMRect(132, 292, 620, 36),
      new DOMRect(132, 340, 620, 36),
      new DOMRect(132, 388, 620, 36)
    ]);

    try {
      const surface = getEditorSurface(editor);
      await dispatchOwnerPointerEvent(surface.ownerDocument, surface, "pointermove", { clientX: 128, clientY: 116 }, {
        buttons: 0,
        pointerId: 31
      });
      expect(surface.style.cursor).toBe("text");

      await dispatchOwnerPointerEvent(surface.ownerDocument, surface, "pointerdown", { clientX: 128, clientY: 116 }, {
        button: 0,
        buttons: 1,
        pointerId: 31
      });
      await dispatchOwnerPointerEvent(surface.ownerDocument, surface.ownerDocument.body, "pointerup", { clientX: 128, clientY: 116 }, {
        button: 0,
        buttons: 0,
        pointerId: 31
      });

      expect(getSelectedBlockElements(editor)).toHaveLength(0);
      expect(editor.state.selection.from).toBe(1);
      expect(editor.state.selection.to).toBe(1);
    } finally {
      geometry.mockRestore();
    }
  });

  it("tracks expansion, contraction, and reversal around a fixed anchor while drifting horizontally across the gutter lane", async () => {
    const initialEnvelope = createSelectionEnvelope();
    const { editorReady } = renderRuntime({ initialEnvelope });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 100, 620, 36),
      new DOMRect(132, 148, 620, 36),
      new DOMRect(132, 196, 620, 36),
      new DOMRect(132, 244, 620, 36),
      new DOMRect(132, 292, 620, 36),
      new DOMRect(132, 340, 620, 36),
      new DOMRect(132, 388, 620, 36)
    ]);

    try {
      const surface = getEditorSurface(editor);
      await dispatchOwnerPointerEvent(surface.ownerDocument, surface, "pointerdown", { clientX: 80, clientY: 264 }, {
        button: 0,
        buttons: 1,
        pointerId: 1
      });
      await dispatchOwnerPointerEvent(surface.ownerDocument, surface, "pointermove", { clientX: 84, clientY: 272 }, {
        buttons: 1,
        pointerId: 1
      });

      expect(getSelectedBlockTags(editor)).toEqual(["BLOCKQUOTE"]);

      await dispatchOwnerPointerEvent(surface.ownerDocument, surface, "pointermove", { clientX: 248, clientY: 308 }, {
        buttons: 1,
        pointerId: 1
      });
      expect(getSelectedBlockTags(editor)).toEqual(["BLOCKQUOTE", "PRE"]);

      await dispatchOwnerPointerEvent(surface.ownerDocument, surface, "pointermove", { clientX: 252, clientY: 220 }, {
        buttons: 1,
        pointerId: 1
      });
      expect(getSelectedBlockTags(editor)).toEqual(["UL", "BLOCKQUOTE"]);

      await dispatchOwnerPointerEvent(surface.ownerDocument, surface, "pointermove", { clientX: 260, clientY: 120 }, {
        buttons: 1,
        pointerId: 1
      });
      expect(getSelectedBlockTags(editor)).toEqual(["P", "H2", "UL", "BLOCKQUOTE"]);

      await dispatchOwnerPointerEvent(surface.ownerDocument, surface, "pointerup", { clientX: 260, clientY: 120 }, {
        button: 0,
        buttons: 0,
        pointerId: 1
      });

      expect(getSelectedBlockTags(editor)).toEqual(["P", "H2", "UL", "BLOCKQUOTE"]);
    } finally {
      geometry.mockRestore();
    }
  });

  it("does not arm from Quick Add, the drag handle, document content, the slash menu, the text toolbar, or shell space", async () => {
    const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "scrollIntoView");
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: () => undefined
    });
    const initialEnvelope = createSelectionEnvelope();
    const { editorReady } = renderRuntime({ initialEnvelope });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 100, 620, 36),
      new DOMRect(132, 148, 620, 36),
      new DOMRect(132, 196, 620, 36),
      new DOMRect(132, 244, 620, 36),
      new DOMRect(132, 292, 620, 36),
      new DOMRect(132, 340, 620, 36),
      new DOMRect(132, 388, 620, 36)
    ]);

    try {
      const surface = getEditorSurface(editor);
      await dispatchOwnerPointerEvent(surface.ownerDocument, surface, "pointermove", { clientX: 80, clientY: 164 });

      const quickAdd = await screen.findByRole("button", { name: "Add block after Heading 2" });
      const handle = await screen.findByRole("button", { name: "Select block: Heading 2" });

      await dispatchOwnerPointerEvent(surface.ownerDocument, quickAdd, "pointerdown", { clientX: 82, clientY: 162 }, {
        button: 0,
        buttons: 1,
        pointerId: 1
      });
      expect(getSelectedBlockElements(editor)).toHaveLength(0);

      await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerdown", { clientX: 108, clientY: 162 }, {
        button: 0,
        buttons: 1,
        pointerId: 2
      });
      expect(getSelectedBlockElements(editor)).toHaveLength(0);

      fireEvent.click(quickAdd);
      await screen.findByRole("listbox", { name: /Insert block after/i });
      expect(getSelectedBlockElements(editor)).toHaveLength(0);

      const shellSpace = document.body;
      await dispatchOwnerPointerEvent(shellSpace.ownerDocument, shellSpace, "pointerdown", { clientX: 10, clientY: 10 }, {
        button: 0,
        buttons: 1,
        pointerId: 3
      });
      expect(getSelectedBlockElements(editor)).toHaveLength(0);

      const paragraph = editor.view.dom.querySelector("p");
      if (!(paragraph instanceof HTMLElement)) {
        throw new Error("Expected a paragraph element.");
      }

      await dispatchOwnerPointerEvent(surface.ownerDocument, paragraph, "pointerdown", { clientX: 194, clientY: 118 }, {
        button: 0,
        buttons: 1,
        pointerId: 5
      });
      expect(getSelectedBlockElements(editor)).toHaveLength(0);

      await act(async () => {
        editor.commands.setTextSelection({ from: 2, to: 4 });
      });
      expect(getSelectedBlockElements(editor)).toHaveLength(0);
      expect(editor.state.selection.empty).toBe(false);
    } finally {
      geometry.mockRestore();
      if (originalScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", originalScrollIntoView);
      } else {
        Reflect.deleteProperty(HTMLElement.prototype, "scrollIntoView");
      }
    }
  });

  it("keeps Quick Add out of the drag path while the handle preserves a selected range for click-versus-drag disambiguation", async () => {
    const initialEnvelope = createSelectionEnvelope();
    const { editorReady } = renderRuntime({ initialEnvelope });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 100, 620, 36),
      new DOMRect(132, 148, 620, 36),
      new DOMRect(132, 196, 620, 36),
      new DOMRect(132, 244, 620, 36),
      new DOMRect(132, 292, 620, 36),
      new DOMRect(132, 340, 620, 36),
      new DOMRect(132, 388, 620, 36)
    ]);

    try {
      const surface = getEditorSurface(editor);
      const startingDocument = editor.getJSON();
      await dispatchBlankGutterDrag(editor, { clientX: 80, clientY: 164 }, [{ clientX: 84, clientY: 228 }]);
      expect(getSelectedBlockTags(editor)).toEqual(["H2", "UL"]);

      const quickAdd = await screen.findByRole("button", { name: "Add block after Bulleted List" });

      await dispatchOwnerPointerEvent(surface.ownerDocument, quickAdd, "pointerdown", { clientX: 82, clientY: 162 }, {
        button: 0,
        buttons: 1,
        pointerId: 1
      });
      expect(getSelectedBlockTags(editor)).toEqual(["H2", "UL"]);

      const freshHandle = await screen.findByRole("button", { name: "Select block: Bulleted List" });

      await dispatchOwnerPointerEvent(surface.ownerDocument, freshHandle, "pointerdown", { clientX: 108, clientY: 162 }, {
        button: 0,
        buttons: 1,
        pointerId: 2
      });
      expect(getSelectedBlockTags(editor)).toEqual(["H2", "UL"]);

      await dispatchOwnerPointerEvent(surface.ownerDocument, freshHandle, "pointerup", { clientX: 108, clientY: 162 }, {
        button: 0,
        buttons: 0,
        pointerId: 2
      });

      expect(screen.getByRole("menu", { name: "Block actions for Bulleted List" })).toBeInTheDocument();
      expect(getSelectedBlockTags(editor)).toEqual(["UL"]);
      expect(editor.getJSON()).toEqual(startingDocument);
    } finally {
      geometry.mockRestore();
    }
  });

  it("clears a persisted range on a blank-gutter click without opening the menu or mutating the document", async () => {
    const initialEnvelope = createSelectionEnvelope();
    const { editorReady } = renderRuntime({ initialEnvelope });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 100, 620, 36),
      new DOMRect(132, 148, 620, 36),
      new DOMRect(132, 196, 620, 36),
      new DOMRect(132, 244, 620, 36),
      new DOMRect(132, 292, 620, 36),
      new DOMRect(132, 340, 620, 36),
      new DOMRect(132, 388, 620, 36)
    ]);

    try {
      const startingDocument = editor.getJSON();
      await dispatchBlankGutterDrag(editor, { clientX: 80, clientY: 164 }, [{ clientX: 84, clientY: 228 }]);
      expect(getSelectedBlockTags(editor)).toEqual(["H2", "UL"]);

      const surface = getEditorSurface(editor);
      await dispatchOwnerPointerEvent(surface.ownerDocument, surface, "pointerdown", { clientX: 80, clientY: 164 }, {
        button: 0,
        buttons: 1,
        pointerId: 8
      });
      await dispatchOwnerPointerEvent(surface.ownerDocument, surface, "pointerup", { clientX: 80, clientY: 164 }, {
        button: 0,
        buttons: 0,
        pointerId: 8
      });
      fireEvent.click(surface, { button: 0, clientX: 80, clientY: 164 });

      expect(getSelectedBlockElements(editor)).toHaveLength(0);
      expect(screen.queryByRole("menu")).toBeNull();
      expect(editor.getJSON()).toEqual(startingDocument);
    } finally {
      geometry.mockRestore();
    }
  });

  it.each(["Escape", "Enter", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "x"] as const)(
    "clears the persisted range on %s without deleting or replacing blocks",
    async (key) => {
      const initialEnvelope = createSelectionEnvelope();
      const { editorReady } = renderRuntime({ initialEnvelope });
      await waitFor(() => expect(editorReady[0]).toBeDefined());
      const editor = editorReady[0]!;
      const geometry = mockTopLevelBlockGeometry(editor, [
        new DOMRect(132, 100, 620, 36),
        new DOMRect(132, 148, 620, 36),
        new DOMRect(132, 196, 620, 36),
        new DOMRect(132, 244, 620, 36),
        new DOMRect(132, 292, 620, 36),
        new DOMRect(132, 340, 620, 36),
        new DOMRect(132, 388, 620, 36)
      ]);

      try {
        await dispatchBlankGutterDrag(editor, { clientX: 80, clientY: 164 }, [{ clientX: 84, clientY: 228 }]);
        const before = editor.getJSON();
        const beforeUndoDepth = undoDepth(editor.state);

        fireEvent.keyDown(editor.view.dom, { key });

        expect(getSelectedBlockElements(editor)).toHaveLength(0);
        expect(editor.getJSON()).toEqual(before);
        expect(undoDepth(editor.state)).toBe(beforeUndoDepth);
      } finally {
        geometry.mockRestore();
      }
    }
  );

  it.each(["Delete", "Backspace"] as const)(
    "deletes the contiguous range with %s and restores it with Undo",
    async (key) => {
      const initialEnvelope = createSelectionEnvelope();
      const { editorReady } = renderRuntime({ initialEnvelope });
      await waitFor(() => expect(editorReady[0]).toBeDefined());
      const editor = editorReady[0]!;
      const geometry = mockTopLevelBlockGeometry(editor, [
        new DOMRect(132, 100, 620, 36),
        new DOMRect(132, 148, 620, 36),
        new DOMRect(132, 196, 620, 36),
        new DOMRect(132, 244, 620, 36),
        new DOMRect(132, 292, 620, 36),
        new DOMRect(132, 340, 620, 36),
        new DOMRect(132, 388, 620, 36)
      ]);

      try {
        const startingDocument = editor.getJSON();
        await dispatchBlankGutterDrag(editor, { clientX: 80, clientY: 164 }, [{ clientX: 84, clientY: 228 }]);
        const undoDepthBeforeDelete = undoDepth(editor.state);

        fireEvent.keyDown(editor.view.dom, { key });

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
        expect(undoDepth(editor.state)).toBe(undoDepthBeforeDelete + 1);
        expect(getSelectedBlockElements(editor)).toHaveLength(0);

        await act(async () => {
          editor.commands.undo();
        });

        expect(editor.getJSON()).toEqual(startingDocument);
        expect(undoDepth(editor.state)).toBe(undoDepthBeforeDelete);
      } finally {
        geometry.mockRestore();
      }
    }
  );

  it("deletes a trailing contiguous range and places the caret in the preceding surviving block", async () => {
    const initialEnvelope = createSelectionEnvelope();
    const { editorReady } = renderRuntime({ initialEnvelope });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 100, 620, 36),
      new DOMRect(132, 148, 620, 36),
      new DOMRect(132, 196, 620, 36),
      new DOMRect(132, 244, 620, 36),
      new DOMRect(132, 292, 620, 36),
      new DOMRect(132, 340, 620, 36),
      new DOMRect(132, 388, 620, 36)
    ]);

    try {
      await dispatchBlankGutterDrag(editor, { clientX: 80, clientY: 364 }, [{ clientX: 84, clientY: 408 }]);
      fireEvent.keyDown(editor.view.dom, { key: "Backspace" });

      expect(editor.getJSON()).toEqual({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Alpha" }]
          },
          {
            type: "heading",
            attrs: { level: 2 },
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
          }
        ]
      });
      expect(editor.state.selection.$from.parent.type.name).toBe("codeBlock");
      expect(getSelectedBlockElements(editor)).toHaveLength(0);
    } finally {
      geometry.mockRestore();
    }
  });

  it("deletes the full document with one transaction, leaves one empty paragraph, and restores the original range with Undo", async () => {
    const initialEnvelope = createSelectionEnvelope();
    const { editorReady } = renderRuntime({ initialEnvelope });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 100, 620, 36),
      new DOMRect(132, 148, 620, 36),
      new DOMRect(132, 196, 620, 36),
      new DOMRect(132, 244, 620, 36),
      new DOMRect(132, 292, 620, 36),
      new DOMRect(132, 340, 620, 36),
      new DOMRect(132, 388, 620, 36)
    ]);

    try {
      const startingDocument = editor.getJSON();
      await dispatchBlankGutterDrag(editor, { clientX: 80, clientY: 116 }, [{ clientX: 84, clientY: 408 }]);
      const undoDepthBeforeDelete = undoDepth(editor.state);

      fireEvent.keyDown(editor.view.dom, { key: "Delete" });

      expect(editor.getJSON()).toEqual({
        type: "doc",
        content: [{ type: "paragraph" }]
      });
      expect(editor.view.dom.firstElementChild).toHaveAttribute(
        "data-placeholder",
        "Start typing or press '/' for commands"
      );
      expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
      expect(undoDepth(editor.state)).toBe(undoDepthBeforeDelete + 1);

      await act(async () => {
        editor.commands.undo();
      });

      expect(editor.getJSON()).toEqual(startingDocument);
      expect(undoDepth(editor.state)).toBe(undoDepthBeforeDelete);
    } finally {
      geometry.mockRestore();
    }
  });

  it("keeps a still-valid range through harmless mapping and autosave acknowledgement", async () => {
    const initialEnvelope = createSelectionEnvelope();
    const { editorReady, onSaveDraft } = renderRuntime({ initialEnvelope });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0]!;
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 100, 620, 36),
      new DOMRect(132, 148, 620, 36),
      new DOMRect(132, 196, 620, 36),
      new DOMRect(132, 244, 620, 36),
      new DOMRect(132, 292, 620, 36),
      new DOMRect(132, 340, 620, 36),
      new DOMRect(132, 388, 620, 36)
    ]);

    try {
      await dispatchBlankGutterDrag(editor, { clientX: 80, clientY: 164 }, [{ clientX: 84, clientY: 276 }]);
      const selectedBeforeSave = getSelectedBlockTags(editor);
      const undoDepthBeforeSave = undoDepth(editor.state);

      await act(async () => {
        editor.view.dispatch(
          editor.state.tr
            .insert(editor.state.doc.content.size, editor.schema.nodes.paragraph.create())
            .setMeta("addToHistory", false)
        );
      });

      expect(getSelectedBlockTags(editor)).toEqual(selectedBeforeSave);

      await runAutosave();

      expect(onSaveDraft).toHaveBeenCalledTimes(1);
      expect(getSelectedBlockTags(editor)).toEqual(selectedBeforeSave);
      expect(undoDepth(editor.state)).toBe(undoDepthBeforeSave);
    } finally {
      geometry.mockRestore();
    }
  });

  it("clears a live range on pointer cancellation and when the editor session or editability changes", async () => {
    const initialEnvelope = createSelectionEnvelope();
    const runtime = renderRuntime({ initialEnvelope });
    await waitFor(() => expect(runtime.editorReady[0]).toBeDefined());
    const editor = runtime.editorReady[0]!;
    const geometry = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 100, 620, 36),
      new DOMRect(132, 148, 620, 36),
      new DOMRect(132, 196, 620, 36),
      new DOMRect(132, 244, 620, 36),
      new DOMRect(132, 292, 620, 36),
      new DOMRect(132, 340, 620, 36),
      new DOMRect(132, 388, 620, 36)
    ]);

    try {
      const surface = getEditorSurface(editor);
      await dispatchOwnerPointerEvent(surface.ownerDocument, surface, "pointerdown", { clientX: 80, clientY: 164 }, {
        button: 0,
        buttons: 1,
        pointerId: 1
      });
      await dispatchOwnerPointerEvent(surface.ownerDocument, surface, "pointermove", { clientX: 84, clientY: 228 }, {
        buttons: 1,
        pointerId: 1
      });
      expect(getSelectedBlockTags(editor)).toEqual(["H2", "UL"]);

      await dispatchOwnerPointerEvent(surface.ownerDocument, surface.ownerDocument, "pointercancel", { clientX: 84, clientY: 228 }, {
        buttons: 0,
        pointerId: 1
      });
      expect(getSelectedBlockElements(editor)).toHaveLength(0);

      await dispatchOwnerPointerEvent(surface.ownerDocument, surface, "pointerdown", { clientX: 80, clientY: 164 }, {
        button: 0,
        buttons: 1,
        pointerId: 2
      });
      await dispatchOwnerPointerEvent(surface.ownerDocument, surface, "pointermove", { clientX: 84, clientY: 228 }, {
        buttons: 1,
        pointerId: 2
      });
      expect(getSelectedBlockTags(editor)).toEqual(["H2", "UL"]);

      runtime.rerender(
        <PageEditorHostRuntime
          canEdit={false}
          initialEnvelope={initialEnvelope}
          initialRevision={0}
          onAccessLost={runtime.onAccessLost}
          onOutlineChange={runtime.onOutlineChange}
          onSaveDraft={runtime.onSaveDraft}
          onStatusChange={runtime.onStatusChange}
          overlayRoot={runtime.overlayRoot}
          pageSysId="page-001"
          sessionKey="page-001:next"
          theme="light"
        />
      );

      await waitFor(() => expect(document.querySelectorAll("[data-docsera-block-selected='true']")).toHaveLength(0));
    } finally {
      geometry.mockRestore();
    }
  });
});
