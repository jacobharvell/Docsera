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

function createClipboardData(html: string, text = html) {
  return {
    getData: (type: string) => {
      if (type === "text/html") {
        return html;
      }

      if (type === "text/plain") {
        return text;
      }

      return "";
    },
    types: [html ? "text/html" : "", text ? "text/plain" : ""].filter(Boolean)
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
    editor.commands.setTextSelection({ from, to });
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
  createClipboardData,
  createEnvelopeFromDocument,
  createOverlayOwnerDocumentHarness,
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
};
