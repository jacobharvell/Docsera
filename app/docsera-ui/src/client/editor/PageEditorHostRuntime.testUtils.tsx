/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { afterEach, expect, vi } from "vitest";
import {
  createEmptyDocseraDocumentEnvelope,
  type DocseraDocumentEnvelope
} from "../../shared/editor/document";
import { createSupportedE2DocseraDocumentEnvelope } from "../../shared/editor/documentFixtures";
import type { PageBodySaveResult } from "../shared/types/docsera";
import { PageEditorHostRuntime } from "./PageEditorHostRuntime";

const geometryShim = {
  getClientRects() {
    return [new DOMRect(0, 0, 0, 0)];
  },
  getBoundingClientRect() {
    return new DOMRect(0, 0, 0, 0);
  }
};

if (typeof Node !== "undefined" && !("getClientRects" in Node.prototype)) {
  Object.defineProperty(Node.prototype, "getClientRects", {
    configurable: true,
    value: geometryShim.getClientRects
  });
}

if (typeof Node !== "undefined" && !("getBoundingClientRect" in Node.prototype)) {
  Object.defineProperty(Node.prototype, "getBoundingClientRect", {
    configurable: true,
    value: geometryShim.getBoundingClientRect
  });
}

class TestBroadcastChannel {
  static channels = new Map<string, Set<TestBroadcastChannel>>();

  name: string;

  listeners = new Set<(event: MessageEvent) => void>();

  constructor(name: string) {
    this.name = name;
    const peers = TestBroadcastChannel.channels.get(name) ?? new Set<TestBroadcastChannel>();
    peers.add(this);
    TestBroadcastChannel.channels.set(name, peers);
  }

  addEventListener(_type: "message", listener: EventListener) {
    this.listeners.add(listener as (event: MessageEvent) => void);
  }

  removeEventListener(_type: "message", listener: EventListener) {
    this.listeners.delete(listener as (event: MessageEvent) => void);
  }

  postMessage(data: unknown) {
    for (const peer of TestBroadcastChannel.channels.get(this.name) ?? []) {
      if (peer === this) {
        continue;
      }

      for (const listener of peer.listeners) {
        listener({ data } as MessageEvent);
      }
    }
  }

  close() {
    const peers = TestBroadcastChannel.channels.get(this.name);
    peers?.delete(this);
    if (peers && peers.size === 0) {
      TestBroadcastChannel.channels.delete(this.name);
    }
  }
}

if (typeof window !== "undefined") {
  vi.stubGlobal("BroadcastChannel", TestBroadcastChannel);
  (window as any).BroadcastChannel = TestBroadcastChannel;
}

const mountedEditors = new Set<Editor>();

function createEnvelopeFromDocument(document: DocseraDocumentEnvelope["document"]): DocseraDocumentEnvelope {
  return {
    schemaVersion: 1,
    document: JSON.parse(JSON.stringify(document)) as DocseraDocumentEnvelope["document"]
  };
}

function createSuccessPage(revision: number) {
  return {
    sysId: "page-001",
    workspaceSysId: "workspace-001",
    parentPageSysId: null,
    siblingOrder: 1,
    draftTitle: "Overview",
    draftSlug: "overview",
    draftSlugNormalized: "overview",
    draftContentJson: createEmptyDocseraDocumentEnvelope(),
    draftRevision: revision,
    draftBodyText: null,
    publishedTitle: null,
    publishedSlug: null,
    publishedSlugNormalized: null,
    publishedContentJson: null,
    publishedBodyText: null,
    publicationState: "draft" as const,
    active: true
  };
}

function renderRuntime(
  overrides: Partial<Parameters<typeof PageEditorHostRuntime>[0]> = {},
  options: { overlayRoot?: HTMLElement } = {}
) {
  const editorReady: Editor[] = [];
  const onAccessLost = vi.fn();
  const onOutlineChange = vi.fn();
  const onSaveDraft = vi.fn(async (): Promise<PageBodySaveResult> => ({
    state: "succeeded",
    page: createSuccessPage(1)
  }));
  const onStatusChange = vi.fn();
  const overlayRoot = options.overlayRoot ?? document.createElement("div");
  overlayRoot.dataset.docseraEditorRuntimeOverlayRoot = "true";
  document.body.append(overlayRoot);

  const view = render(
    <PageEditorHostRuntime
      canEdit={true}
      initialEnvelope={createEmptyDocseraDocumentEnvelope()}
      initialRevision={0}
      onAccessLost={onAccessLost}
      onOutlineChange={onOutlineChange}
      onSaveDraft={onSaveDraft}
      onEditorReady={(editor) => {
        mountedEditors.add(editor);
        editorReady[0] = editor;
        const editorView = editor.view as typeof editor.view & { scrollToSelection: () => void };
        editorView.scrollToSelection = () => undefined;
      }}
      onStatusChange={onStatusChange}
      overlayRoot={overlayRoot}
      pageSysId="page-001"
      theme="light"
      {...overrides}
    />
  );

  return {
    editorReady,
    onAccessLost,
    onOutlineChange,
    onSaveDraft,
    onStatusChange,
    overlayRoot,
    ...view
  };
}

export function createClipboardData(html: string, text = html, extraData: Record<string, string> = {}) {
  const dataEntries = [
    ["text/html", html],
    ["text/plain", text],
    ...Object.entries(extraData)
  ].filter(([, value]) => typeof value === "string" && value.length > 0) as Array<[string, string]>;

  return {
    getData: (type: string) => {
      return dataEntries.find(([entryType]) => entryType === type)?.[1] ?? "";
    },
    types: dataEntries.map(([type]) => type)
  };
}

function createOverlayOwnerDocumentHarness(width: number, height: number) {
  let scrollHandler: EventListener | null = null;
  let resizeHandler: EventListener | null = null;
  const ownerDocumentListeners = new Map<string, Set<EventListener>>();
  const ownerWindowListeners = new Map<string, Set<EventListener>>();
  const addListener = (listeners: Map<string, Set<EventListener>>, type: string, handler: EventListener) => {
    const registered = listeners.get(type) ?? new Set<EventListener>();
    registered.add(handler);
    listeners.set(type, registered);
  };
  const removeListener = (listeners: Map<string, Set<EventListener>>, type: string, handler: EventListener) => {
    const registered = listeners.get(type);
    registered?.delete(handler);
    if (registered && registered.size === 0) {
      listeners.delete(type);
    }
  };
  const dispatchListeners = (listeners: Map<string, Set<EventListener>>, event: Event) => {
    for (const listener of listeners.get(event.type) ?? []) {
      listener(event);
    }
    return true;
  };
  const ownerWindowAddEventListener = vi.fn((type: string, handler: EventListener) => {
    addListener(ownerWindowListeners, type, handler);
    if (type === "resize") {
      resizeHandler = handler;
    }
  });
  const ownerWindowRemoveEventListener = vi.fn((type: string, handler: EventListener) => {
    removeListener(ownerWindowListeners, type, handler);
    if (type === "resize" && resizeHandler === handler) {
      resizeHandler = null;
    }
  });
  const ownerDocumentAddEventListener = vi.fn((type: string, handler: EventListener) => {
    addListener(ownerDocumentListeners, type, handler);
    if (type === "scroll") {
      scrollHandler = handler;
    }
  });
  const ownerDocumentRemoveEventListener = vi.fn((type: string, handler: EventListener) => {
    removeListener(ownerDocumentListeners, type, handler);
    if (type === "scroll" && scrollHandler === handler) {
      scrollHandler = null;
    }
  });
  const ownerWindow = {
    innerWidth: width,
    innerHeight: height,
    getComputedStyle: window.getComputedStyle.bind(window),
    open: vi.fn(() => ({ opener: null } as Window)),
    setTimeout: vi.fn((handler: TimerHandler, timeout?: number) => window.setTimeout(handler, timeout)),
    clearTimeout: vi.fn((handle?: number) => window.clearTimeout(handle)),
    Node: window.Node,
    addEventListener: ownerWindowAddEventListener,
    removeEventListener: ownerWindowRemoveEventListener
  } as unknown as Window;
  const ownerDocument = {
    defaultView: ownerWindow,
    createElement: document.createElement.bind(document),
    createElementNS: document.createElementNS.bind(document),
    createTextNode: document.createTextNode.bind(document),
    createComment: document.createComment.bind(document),
    body: document.body,
    documentElement: document.documentElement,
    hasFocus: () => true,
    querySelector: document.querySelector.bind(document),
    querySelectorAll: document.querySelectorAll.bind(document),
    addEventListener: ownerDocumentAddEventListener,
    removeEventListener: ownerDocumentRemoveEventListener,
    dispatchEvent: (event: Event) => dispatchListeners(ownerDocumentListeners, event)
  } as unknown as Document;
  Object.assign(ownerWindow, {
    dispatchEvent: (event: Event) => dispatchListeners(ownerWindowListeners, event)
  });

  return {
    ownerDocument,
    ownerWindow,
    ownerDocumentAddEventListener,
    ownerDocumentRemoveEventListener,
    ownerWindowAddEventListener,
    ownerWindowRemoveEventListener,
    ownerWindowSetTimeout: ownerWindow.setTimeout as unknown as ReturnType<typeof vi.fn>,
    triggerScroll() {
      scrollHandler?.(new Event("scroll") as never);
    },
    triggerResize() {
      resizeHandler?.(new Event("resize") as never);
    }
  };
}

function setOverlayOwnerViewport(ownerWindow: Window, width: number, height: number) {
  Object.defineProperty(ownerWindow, "innerWidth", {
    configurable: true,
    value: width
  });
  Object.defineProperty(ownerWindow, "innerHeight", {
    configurable: true,
    value: height
  });
}

async function setParagraphText(editor: Editor, text: string) {
  await act(async () => {
    editor.commands.setContent({
      type: "doc",
      content: [
        text.length
          ? {
              type: "paragraph",
              content: [{ type: "text", text }]
            }
          : {
              type: "paragraph"
            }
      ]
    });
  });
}

async function runAutosave() {
  await act(async () => {
    await new Promise((resolve) => window.setTimeout(resolve, 710));
  });
}

async function selectText(editor: Editor, from: number, to: number) {
  await act(async () => {
    editor.view.dom.focus();
    editor.commands.setTextSelection({ from, to });

    const ownerDocument = editor.view.dom.ownerDocument;
    const selection = ownerDocument.getSelection();
    if (!selection) {
      return;
    }

    const start = Math.min(from, to);
    const end = Math.max(from, to);
    const startPos = editor.view.domAtPos(start);
    const endPos = editor.view.domAtPos(end);

    selection.removeAllRanges();
    const range = ownerDocument.createRange();
    range.setStart(startPos.node, startPos.offset);
    range.setEnd(endPos.node, endPos.offset);

    const selectionRect = (() => {
      try {
        const startRect = editor.view.coordsAtPos(start);
        const endRect = editor.view.coordsAtPos(end);
        const left = Math.min(startRect.left, endRect.left);
        const right = Math.max(startRect.right, endRect.right);
        const top = Math.min(startRect.top, endRect.top);
        const bottom = Math.max(startRect.bottom, endRect.bottom);
        return new DOMRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
      } catch {
        return new DOMRect(12, 12, 1, 20);
      }
    })();

    Object.defineProperty(range, "getClientRects", {
      configurable: true,
      value: () => [selectionRect]
    });
    Object.defineProperty(range, "getBoundingClientRect", {
      configurable: true,
      value: () => selectionRect
    });

    const originalAddRange = selection.addRange.bind(selection);
    const originalGetRangeAt = selection.getRangeAt.bind(selection);
    const originalRemoveAllRanges = selection.removeAllRanges.bind(selection);
    const selectionState = {
      anchorNode: startPos.node,
      anchorOffset: startPos.offset,
      focusNode: endPos.node,
      focusOffset: endPos.offset,
      range: range as Range | null
    };

    Object.defineProperties(selection, {
      addRange: {
        configurable: true,
        value: (nextRange: Range) => {
          selectionState.range = nextRange;
          return originalAddRange(nextRange);
        }
      },
      anchorNode: {
        configurable: true,
        get: () => selectionState.range ? selectionState.anchorNode : null
      },
      anchorOffset: {
        configurable: true,
        get: () => selectionState.range ? selectionState.anchorOffset : 0
      },
      focusNode: {
        configurable: true,
        get: () => selectionState.range ? selectionState.focusNode : null
      },
      focusOffset: {
        configurable: true,
        get: () => selectionState.range ? selectionState.focusOffset : 0
      },
      getRangeAt: {
        configurable: true,
        value: (index: number) => {
          if (index !== 0 || !selectionState.range) {
            return originalGetRangeAt(index);
          }

          return selectionState.range;
        }
      },
      rangeCount: {
        configurable: true,
        get: () => (selectionState.range ? 1 : 0)
      },
      removeAllRanges: {
        configurable: true,
        value: () => {
          selectionState.range = null;
          return originalRemoveAllRanges();
        }
      },
      toString: {
        configurable: true,
        value: () => (selectionState.range ? selectionState.range.toString() : "")
      }
    });

    selection.addRange(range);
  });
}

async function openSlashQuery(editor: Editor, query = "") {
  await act(async () => {
    editor.commands.focus("end", { scrollIntoView: false });
  });
  fireEvent.keyDown(editor.view.dom, { key: "/" });
  for (const character of query) {
    fireEvent.keyDown(editor.view.dom, { key: character });
  }
}

async function openSlashQueryAtSelection(editor: Editor, query = "") {
  fireEvent.keyDown(editor.view.dom, { key: "/" });
  for (const character of query) {
    fireEvent.keyDown(editor.view.dom, { key: character });
  }
}

async function openLinkSurface(editor: Editor) {
  await act(async () => {
    editor.commands.focus(undefined, { scrollIntoView: false });
  });
  fireEvent.keyDown(editor.view.dom, {
    key: "k",
    ctrlKey: true
  });
}

async function pasteIntoEditor(editor: Editor, html: string, text = html) {
  await act(async () => {
    editor.commands.focus("end", { scrollIntoView: false });
    fireEvent.paste(editor.view.dom, {
      clipboardData: createClipboardData(html, text)
    } as never);
  });
}

async function pastePlainTextOnlyIntoEditor(editor: Editor, text: string) {
  await act(async () => {
    editor.commands.focus("end", { scrollIntoView: false });
    fireEvent.paste(editor.view.dom, {
      clipboardData: {
        getData: (type: string) => (type === "text/plain" ? text : ""),
        types: ["text/plain"]
      }
    } as never);
  });
}

afterEach(() => {
  for (const editor of mountedEditors) {
    if (!(editor as Editor & { isDestroyed?: boolean }).isDestroyed) {
      editor.destroy();
    }
  }
  mountedEditors.clear();
  cleanup();
  expect(TestBroadcastChannel.channels.size).toBe(0);
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur();
  }
  document.getSelection()?.removeAllRanges();
  window.name = "";
  window.sessionStorage.clear();
  window.localStorage.clear();
  TestBroadcastChannel.channels.clear();
  document.querySelectorAll("[data-docsera-editor-runtime-overlay-root='true']").forEach((node) => node.remove());
  document.querySelectorAll("[data-docsera-editor-runtime-header-controls-root='true']").forEach((node) => node.remove());
  document.body.innerHTML = "";
});
export {
  createEnvelopeFromDocument,
  createOverlayOwnerDocumentHarness,
  createSuccessPage,
  openLinkSurface,
  openSlashQuery,
  openSlashQueryAtSelection,
  pasteIntoEditor,
  pastePlainTextOnlyIntoEditor,
  renderRuntime,
  runAutosave,
  selectText,
  setOverlayOwnerViewport,
  setParagraphText
};
