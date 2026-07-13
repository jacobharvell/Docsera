/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createEmptyDocseraDocumentEnvelope,
  type DocseraDocumentEnvelope
} from "../../shared/editor/document";
import { createSupportedE2DocseraDocumentEnvelope } from "../../shared/editor/documentFixtures";
import type { PageBodySaveResult } from "../shared/types/docsera";
import { getAutosaveRetryDelay, PageEditorHostRuntime } from "./PageEditorHostRuntime";

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
  const ownerWindowAddEventListener = vi.fn((type: string, handler: EventListener) => {
    if (type === "resize") {
      resizeHandler = handler;
    }
  });
  const ownerWindowRemoveEventListener = vi.fn((type: string, handler: EventListener) => {
    if (type === "resize" && resizeHandler === handler) {
      resizeHandler = null;
    }
  });
  const ownerDocumentAddEventListener = vi.fn((type: string, handler: EventListener) => {
    if (type === "scroll") {
      scrollHandler = handler;
    }
  });
  const ownerDocumentRemoveEventListener = vi.fn((type: string, handler: EventListener) => {
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
    removeEventListener: ownerDocumentRemoveEventListener
  } as unknown as Document;

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
        {
          type: "paragraph",
          content: [{ type: "text", text }]
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
    editor.commands.insertContent(`/${query}`);
  });
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
  vi.useRealTimers();
  cleanup();
  document.querySelectorAll("[data-docsera-editor-runtime-overlay-root='true']").forEach((node) => node.remove());
  document.querySelectorAll("[data-docsera-editor-runtime-header-controls-root='true']").forEach((node) => node.remove());
});

describe("PageEditorHostRuntime", () => {
  it("defines exactly four finite automatic retry delays", () => {
    expect([0, 1, 2, 3, 4, 5].map(getAutosaveRetryDelay)).toEqual([1500, 3000, 6000, 12000, null, null]);
  });

  it("mounts the supported E2 rich-text schema without normalizing away accepted nodes or marks", async () => {
    const supportedEnvelope = createSupportedE2DocseraDocumentEnvelope();
    const { editorReady, onSaveDraft } = renderRuntime({ initialEnvelope: supportedEnvelope });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    expect(editorReady[0].getJSON()).toEqual(supportedEnvelope.document);

    expect(screen.queryByRole("button", { name: /Save draft/i })).not.toBeInTheDocument();
    expect(onSaveDraft).not.toHaveBeenCalled();
  });

  it("rejects an invalid initial envelope before editor mount", () => {
    expect(() =>
      renderRuntime({
        initialEnvelope: {
          schemaVersion: 1,
          document: {
            type: "doc",
            content: [
              {
                type: "image"
              }
            ]
          }
        } as never
      })
    ).toThrow("valid TipTap document");
  });

  it("exposes an editable contenteditable surface that accepts focus and TipTap document transactions", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    expect(editor.view.dom).toHaveAttribute("contenteditable", "true");

    await act(async () => {
      editor.view.dom.focus();
    });

    expect(document.activeElement).toBe(editor.view.dom);

    await act(async () => {
      editor.commands.insertContent("Hello world");
    });

    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello world" }]
        }
      ]
    });
    expect(screen.queryByRole("button", { name: /Save draft/i })).not.toBeInTheDocument();
  });

  it("starts an empty page clean and focus, caret movement, and selection-only transactions issue zero saves", async () => {
    const { editorReady, onSaveDraft, container } = renderRuntime();
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0];
    expect(editor.getJSON()).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    fireEvent.click(container.querySelector(".ProseMirror")!);
    await act(async () => {
      editor.commands.focus("start", { scrollIntoView: false });
      editor.commands.setTextSelection(1);
    });
    await runAutosave();
    expect(onSaveDraft).toHaveBeenCalledTimes(0);
  });

  it("reuses a trailing empty paragraph and appends exactly one paragraph below non-empty content", async () => {
    const { editorReady, container } = renderRuntime();
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0];
    const surface = container.querySelector(".docsera-editor-runtime__surface")!;
    fireEvent.click(surface);
    fireEvent.click(surface);
    expect(editor.getJSON()).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    await act(async () => editor.commands.insertContent("First"));
    fireEvent.click(surface);
    fireEvent.click(surface);
    expect(editor.getJSON()).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "First" }] },
        { type: "paragraph" }
      ]
    });
  });

  it("renders the editor body without the old diagnostic card chrome and keeps the overlay root available", async () => {
    const { editorReady, container, overlayRoot } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const runtimeStyle = container.querySelector("style")?.textContent ?? "";
    expect(container.querySelector(".docsera-editor-runtime")).toBeInTheDocument();
    expect(container.querySelector(".ProseMirror[contenteditable='true']")).toBeInTheDocument();
    expect(container.textContent ?? "").not.toContain("The selected page is using the shared workspace draft representation.");
    expect(container.textContent ?? "").not.toContain("Canonical TipTap content is isolated inside the production child host and saved explicitly during E2.");
    expect(container.querySelector(".docsera-main__authoring-controls")).toBeNull();
    expect(overlayRoot).toBeInTheDocument();
    expect(runtimeStyle).not.toContain("padding: 22px");
    expect(runtimeStyle).not.toContain("border-radius: 24px");
    expect(runtimeStyle).not.toContain("box-shadow: 0 18px 48px");
    expect(runtimeStyle).not.toContain("--docsera-editor-surface");
    expect(runtimeStyle).not.toContain(".docsera-editor-runtime__overlay");
    expect(runtimeStyle).not.toContain(".docsera-editor-runtime__overlay-button");
    expect(runtimeStyle).not.toContain(".docsera-editor-runtime__save-button");
  });

  it("explicitly saves the supported E2 rich-text schema without flattening accepted structure", async () => {
    const supportedEnvelope = createSupportedE2DocseraDocumentEnvelope();
    const { editorReady, onSaveDraft, onStatusChange } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent(supportedEnvelope.document as never);
    });

    await runAutosave();

    await waitFor(() => {
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
    });

    expect(onSaveDraft).toHaveBeenCalledWith({
      draftContentJson: supportedEnvelope,
      expectedRevision: 0,
      pageSysId: "page-001"
    });

    await waitFor(() => {
      expect(onStatusChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: "Saved" }));
    });
  });

  it("preserves plain-text paste as paragraphs and auto-links supported URLs", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await pasteIntoEditor(editor, "", "First line\nhttps://example.com/docs\nSecond line");

    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "First line" }]
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "https://example.com/docs",
              marks: [{ type: "link", attrs: { href: "https://example.com/docs" } }]
            }
          ]
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Second line" }]
        }
      ]
    });
  });

  it("preserves supported rich HTML paste while stripping unsupported markup and unsafe links", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await pasteIntoEditor(
      editor,
      [
        "<h2>Overview</h2>",
        "<p><strong>Bold</strong> <em>italic</em> <s>strike</s> <code>code</code> <a href=\"https://example.com/docs\">link</a></p>",
        "<ol start=\"3\"><li><p>Ordered item</p><ul><li><p>Nested bullet</p></li></ul></li></ol>",
        "<ul data-type=\"taskList\"><li data-type=\"taskItem\" data-checked=\"true\"><p>Checked task</p></li></ul>",
        "<blockquote><p>Quoted text</p></blockquote>",
        "<pre><code class=\"language-typescript\">const value = 1;</code></pre>",
        "<script>alert(1)</script>",
        "<style>.bad{color:red}</style>",
        "<p><a href=\"javascript:alert(1)\">Unsafe</a></p>"
      ].join("")
    );

    const json = editor.getJSON();
    expect(json).toMatchObject({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Overview" }]
        },
        { type: "paragraph" },
        {
          type: "orderedList",
          attrs: { start: 3 },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Ordered item" }]
                },
                {
                  type: "bulletList",
                  content: [
                    {
                      type: "listItem",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Nested bullet" }]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: true },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Checked task" }]
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
              content: [{ type: "text", text: "Quoted text" }]
            }
          ]
        },
        {
          type: "codeBlock",
          attrs: { language: "typescript" },
          content: [{ type: "text", text: "const value = 1;" }]
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Unsafe" }]
        }
      ]
    });

    const paragraph = (json.content?.[1] as { content?: Array<{ marks?: Array<{ type: string }> }> } | undefined)?.content ?? [];
    const paragraphMarkTypes = paragraph.flatMap((node) => node.marks?.map((mark) => mark.type) ?? []);
    expect(paragraphMarkTypes).toEqual(expect.arrayContaining(["bold", "italic", "strike", "code", "link"]));
  });

  it("keeps unsupported active and embedded markup out of canonical JSON during paste", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await pasteIntoEditor(
      editor,
      [
        "<p>Safe text</p>",
        "<img src=\"x\" onerror=\"alert(1)\">",
        "<svg onload=\"alert(1)\"><title>Ignored</title></svg>",
        "<math><mi>x</mi></math>",
        "<object data=\"x\"></object>",
        "<embed src=\"x\"></embed>",
        "<iframe srcdoc=\"<p>bad</p>\"></iframe>",
        "<span data-unsupported=\"yes\" style=\"color: red\">still text</span>"
      ].join("")
    );

    const jsonValue = editor.getJSON();
    expect(jsonValue.content?.[0]).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "Safe text" }]
    });

    const json = JSON.stringify(jsonValue);
    expect(json).not.toContain("image");
    expect(json).not.toContain("svg");
    expect(json).not.toContain("math");
    expect(json).not.toContain("object");
    expect(json).not.toContain("embed");
    expect(json).not.toContain("iframe");
    expect(json).not.toContain("onerror");
    expect(json).not.toContain("srcdoc");
  });

  it("keeps undo and redo available after an explicit save", async () => {
    const { editorReady, onSaveDraft, onStatusChange } = renderRuntime();

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
            content: [{ type: "text", text: "Base" }]
          }
        ]
      });
    });

    await act(async () => {
      editor.commands.insertContent(" edit");
    });

    await runAutosave();

    await waitFor(() => {
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
    });

    const savedState = editor.getJSON();

    await act(async () => {
      editor.commands.undo();
    });

    expect(editor.getJSON()).not.toEqual(savedState);

    await act(async () => {
      editor.commands.redo();
    });

    expect(editor.getJSON()).toEqual(savedState);
  });

  it("becomes dirty after a real TipTap transaction and does not save a clean document", async () => {
    const { editorReady, onSaveDraft, onStatusChange } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    expect(screen.queryByRole("button", { name: /Save draft/i })).not.toBeInTheDocument();
    expect(onSaveDraft).not.toHaveBeenCalled();

    await act(async () => {
      editor.commands.insertContent("Draft change");
    });

    expect(onStatusChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: "Unsaved" }));
    await runAutosave();

    await waitFor(() => {
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
    });

    expect(onSaveDraft).toHaveBeenCalledWith({
      draftContentJson: createEnvelopeFromDocument({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Draft change" }]
          }
        ]
      }),
      expectedRevision: 0,
      pageSysId: "page-001"
    });

    await waitFor(() => {
      expect(onStatusChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: "Saved" }));
    });
  });

  it("keeps newer edits dirty while a save is pending and advances the revision after success", async () => {
    let resolveSave: ((value: PageBodySaveResult) => void) | null = null;
    const onSaveDraft = vi.fn(
      () =>
        new Promise<PageBodySaveResult>((resolve) => {
          resolveSave = resolve;
        })
    );
    const { editorReady, onStatusChange } = renderRuntime({ onSaveDraft });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.insertContent("First draft");
    });
    await runAutosave();

    await waitFor(() => {
      expect(onStatusChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: "Saving…" }));
    });

    await act(async () => {
      editor.commands.insertContent(" after save begins");
    });

    expect(onStatusChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: "Saving…" }));

    await act(async () => {
      resolveSave?.({
        state: "succeeded",
        page: createSuccessPage(1)
      });
    });

    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(2));

    const secondSaveCall = onSaveDraft.mock.calls[1] as unknown as [
      {
        expectedRevision: number;
        pageSysId: string;
      }
    ];

    expect(secondSaveCall?.[0]).toMatchObject({
      expectedRevision: 1,
      pageSysId: "page-001"
    });
  });

  it("keeps draft content after save failures and allows retry", async () => {
    const onSaveDraft = vi
      .fn()
      .mockResolvedValueOnce({
        state: "failed",
        code: "failed",
        retryable: true,
        errorMessage: "Something went wrong while saving the page body. Please try again."
      } satisfies PageBodySaveResult)
      .mockResolvedValueOnce({
        state: "succeeded",
        page: createSuccessPage(1)
      } satisfies PageBodySaveResult);
    const { editorReady, onStatusChange } = renderRuntime({ onSaveDraft });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.insertContent("Retry me");
    });

    await runAutosave();

    await waitFor(() => expect(onStatusChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: "Changes not saved" })));
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();

    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Retry me" }] }]
    });

    await act(async () => { await new Promise((resolve) => window.setTimeout(resolve, 1510)); });
    await waitFor(() => expect(onStatusChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: "Saved" })));

    expect(onSaveDraft).toHaveBeenCalledTimes(2);
  });

  it("stops after four automatic retries, preserves content, and lets a new edit reset the sequence", async () => {
    const onSaveDraft = vi.fn(async (): Promise<PageBodySaveResult> => ({
      state: "failed",
      code: "network",
      retryable: true,
      errorMessage: "Something went wrong while saving the page body. Please try again."
    }));
    const { editorReady, onStatusChange } = renderRuntime({ onSaveDraft });

    await waitFor(() => expect(editorReady[0]).toBeDefined());
    vi.useFakeTimers();

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.insertContent("Finite retry draft");
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(onSaveDraft).toHaveBeenCalledTimes(1);

    for (const delay of [1500, 3000, 6000, 12000]) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(delay);
      });
    }
    expect(onSaveDraft).toHaveBeenCalledTimes(5);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(120_000);
    });
    expect(onSaveDraft).toHaveBeenCalledTimes(5);
    expect(onStatusChange).toHaveBeenLastCalledWith(expect.objectContaining({ isDirty: true, status: "Changes not saved" }));
    expect(editor.getText()).toBe("Finite retry draft");

    await act(async () => {
      editor.commands.insertContent(" updated");
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(onSaveDraft).toHaveBeenCalledTimes(6);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });
    expect(onSaveDraft).toHaveBeenCalledTimes(7);
  });

  it.each([
    ["conflict", "conflict"],
    ["forbidden", "forbidden"],
    ["validation", "invalid"],
    ["capacity", "capacity"],
    ["invariant", "persistence_invariant"]
  ] as const)("does not retry a terminal %s failure", async (_label, code) => {
    const onSaveDraft = vi.fn(async (): Promise<PageBodySaveResult> => ({
      state: "failed",
      code,
      retryable: false,
      errorMessage: "Terminal save failure."
    }));
    const { editorReady, onAccessLost } = renderRuntime({ onSaveDraft });

    await waitFor(() => expect(editorReady[0]).toBeDefined());
    vi.useFakeTimers();
    await act(async () => {
      editorReady[0].commands.insertContent("Terminal draft");
      await vi.advanceTimersByTimeAsync(700);
      await vi.advanceTimersByTimeAsync(120_000);
    });

    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(editorReady[0].getText()).toBe("Terminal draft");
    expect(onAccessLost).toHaveBeenCalledTimes(code === "forbidden" ? 1 : 0);
  });

  it("keeps requests serialized and cancels a pending retry on teardown", async () => {
    let resolveSave: ((result: PageBodySaveResult) => void) | undefined;
    const onSaveDraft = vi.fn(
      () =>
        new Promise<PageBodySaveResult>((resolve) => {
          resolveSave = resolve;
        })
    );
    const { editorReady, unmount } = renderRuntime({ onSaveDraft });

    await waitFor(() => expect(editorReady[0]).toBeDefined());
    vi.useFakeTimers();
    await act(async () => {
      editorReady[0].commands.insertContent("Serialized draft");
      await vi.advanceTimersByTimeAsync(700);
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(onSaveDraft).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveSave?.({ state: "failed", code: "transient", retryable: true, errorMessage: "Try later." });
      await Promise.resolve();
    });
    unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
  });

  it("preserves the in-memory draft and dirty state after a conflict save failure", async () => {
    const onAccessLost = vi.fn();
    const onSaveDraft = vi.fn(async (): Promise<PageBodySaveResult> => ({
      state: "failed",
      code: "conflict",
      currentRevision: 3,
      errorMessage: "This draft was updated elsewhere. Refresh to load the latest revision."
    }));
    const { editorReady, onStatusChange } = renderRuntime({ onAccessLost, onSaveDraft });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.insertContent("Conflict draft");
    });

    await runAutosave();

    await waitFor(() => expect(onStatusChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: "Changes not saved" })));

    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Conflict draft" }] }]
    });
    expect(screen.queryByRole("button", { name: "Retry" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Save draft/i })).not.toBeInTheDocument();
    expect(onAccessLost).not.toHaveBeenCalled();
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onSaveDraft).toHaveBeenCalledWith({
      draftContentJson: createEnvelopeFromDocument({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Conflict draft" }]
          }
        ]
      }),
      expectedRevision: 0,
      pageSysId: "page-001"
    });
  });

  it("suppresses duplicate overlapping explicit saves and accepts a later save after the first settles", async () => {
    let resolveSave: ((value: PageBodySaveResult) => void) | null = null;
    const onSaveDraft = vi.fn(
      () =>
        new Promise<PageBodySaveResult>((resolve) => {
          resolveSave = resolve;
        })
    );
    const { editorReady, onStatusChange } = renderRuntime({ onSaveDraft });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.insertContent("First draft");
    });

    await runAutosave();

    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onStatusChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: "Saving…" }));

    await act(async () => {
      resolveSave?.({
        state: "succeeded",
        page: createSuccessPage(1)
      });
    });

    await waitFor(() => {
      expect(onStatusChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: "Saved" }));
    });

    await act(async () => {
      editor.commands.insertContent(" second draft");
    });

    await runAutosave();

    await waitFor(() => {
      expect(onSaveDraft).toHaveBeenCalledTimes(2);
    });

    const secondSaveCall = onSaveDraft.mock.calls[1] as unknown as [
      {
        expectedRevision: number;
        pageSysId: string;
      }
    ];

    expect(secondSaveCall?.[0]).toMatchObject({
      expectedRevision: 1,
      pageSysId: "page-001"
    });
  });

  it("keeps forbidden saves recoverable and notifies access loss", async () => {
    const onSaveDraft = vi.fn(async (): Promise<PageBodySaveResult> => ({
      state: "failed",
      code: "forbidden",
      errorMessage: "You do not have permission to edit page bodies in this workspace."
    }));
    const { editorReady, onAccessLost } = renderRuntime({ onSaveDraft });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.insertContent("Forbidden draft");
    });

    await runAutosave();

    await waitFor(() => {
      expect(onAccessLost).toHaveBeenCalledTimes(1);
    });
    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Forbidden draft" }] }]
    });
  });

  it("preserves canonical JSON and terminal whitespace through explicit save", async () => {
    const expectedDocument = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Canonical title" }]
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Trailing whitespace " }]
        }
      ]
    } as const;

    const onSaveDraft = vi.fn(async (): Promise<PageBodySaveResult> => ({
      state: "succeeded",
      page: createSuccessPage(1)
    }));
    const { editorReady } = renderRuntime({ onSaveDraft });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await act(async () => {
      editor.commands.setContent(expectedDocument as never);
    });

    await runAutosave();

    await waitFor(() => {
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
    });

    expect(onSaveDraft).toHaveBeenCalledWith({
      draftContentJson: {
        schemaVersion: 1,
        document: expectedDocument
      },
      expectedRevision: 0,
      pageSysId: "page-001"
    });
  });

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
    expect(within(slashMenu).getByRole("option", { name: /Heading 2/ })).toBeInTheDocument();
    expect(within(slashMenu).getByRole("option", { name: /Heading 3/ })).toBeInTheDocument();

    fireEvent.keyDown(editor.view.dom, { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();

    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "/he" }] }]
    });

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

  it("supports arrow navigation, Enter execution, and pointer execution for slash commands", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor, "he");

    fireEvent.keyDown(editor.view.dom, { key: "ArrowDown" });
    fireEvent.keyDown(editor.view.dom, { key: "Enter" });

    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "heading",
      attrs: { level: 3 }
    });
    expect(editor.getJSON().content?.[1]).toMatchObject({ type: "paragraph" });

    await setParagraphText(editor, "");
    await openSlashQuery(editor);
    fireEvent.click(await screen.findByRole("option", { name: /Blockquote/ }));

    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "blockquote",
      content: [{ type: "paragraph" }]
    });
  });

  it.each([
    ["Paragraph", { type: "doc", content: [{ type: "paragraph" }] }],
    ["Heading 2", { type: "doc", content: [{ type: "heading", attrs: { level: 2 } }] }],
    ["Heading 3", { type: "doc", content: [{ type: "heading", attrs: { level: 3 } }] }],
    ["Bulleted list", { type: "doc", content: [{ type: "bulletList" }] }],
    ["Numbered list", { type: "doc", content: [{ type: "orderedList" }] }],
    ["Task list", { type: "doc", content: [{ type: "taskList" }] }],
    ["Blockquote", { type: "doc", content: [{ type: "blockquote" }] }],
    [
      "Horizontal rule",
      {
        type: "doc",
        content: [
          { type: "horizontalRule" },
          { type: "paragraph" }
        ]
      }
    ],
    ["Code block", { type: "doc", content: [{ type: "codeBlock" }] }]
  ])("produces canonical JSON for slash command %s", async (label, expected) => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor);

    fireEvent.click(await screen.findByRole("option", { name: new RegExp(label, "i") }));
    expect(editor.getJSON().content?.[0]).toMatchObject(expected.content[0]);
    if (label === "Horizontal rule") {
      expect(editor.getJSON().content?.[1]).toMatchObject(expected.content[1]);
    }
  });

  it("shows the formatting bubble for text selections and applies core mark toggles and shortcuts", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Hello world");
    await selectText(editor, 1, 6);

    const toolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    const boldButton = within(toolbar).getByRole("button", { name: "Bold" });
    expect(boldButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(boldButton);
    expect(within(toolbar).getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "paragraph",
      content: [
        { type: "text", text: "Hello", marks: [{ type: "bold" }] },
        { type: "text", text: " world" }
      ]
    });

    await setParagraphText(editor, "Hello world");
    await selectText(editor, 1, 6);
    fireEvent.keyDown(editor.view.dom, { key: "i", ctrlKey: true });
    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "paragraph",
      content: [
        { type: "text", text: "Hello", marks: [{ type: "italic" }] },
        { type: "text", text: " world" }
      ]
    });
  });

  it.each([
    ["Bold", { type: "bold" }],
    ["Italic", { type: "italic" }],
    ["Strike", { type: "strike" }],
    ["Inline code", { type: "code" }]
  ])("toggles %s through the bubble menu", async (label, expectedMark) => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Toggle me");
    await selectText(editor, 1, 10);

    fireEvent.click(await screen.findByRole("button", { name: label }));

    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "Toggle me", marks: [expectedMark] }]
    });
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
    await openLinkSurface(editor);

    const createDialog = await screen.findByRole("dialog", { name: "Create link" });
    const input = within(createDialog).getByRole("textbox", { name: "URL" }) as HTMLInputElement;
    expect(input).toHaveValue("");

    await act(async () => {
      fireEvent.change(input, { target: { value: "https://example.com/docs" } });
    });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Linked text",
              marks: [
                {
                  type: "link",
                  attrs: { href: "https://example.com/docs" }
                }
              ]
            }
          ]
        }
      ]
    });

    await selectText(editor, 1, 12);
    await openLinkSurface(editor);
    const editDialog = await screen.findByRole("dialog", { name: "Edit link" });
    const editInput = within(editDialog).getByRole("textbox", { name: "URL" }) as HTMLInputElement;
    expect(editInput).toHaveValue("https://example.com/docs");

    await act(async () => {
      fireEvent.change(editInput, { target: { value: "https://example.com/next" } });
    });
    fireEvent.click(within(editDialog).getByRole("button", { name: "Apply" }));

    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Linked text",
              marks: [
                {
                  type: "link",
                  attrs: { href: "https://example.com/next" }
                }
              ]
            }
          ]
        }
      ]
    });

    await selectText(editor, 1, 12);
    await openLinkSurface(editor);
    const followDialog = await screen.findByRole("dialog", { name: "Edit link" });
    fireEvent.click(within(followDialog).getByRole("button", { name: "Follow" }));
    expect(openSpy).toHaveBeenCalledWith("https://example.com/next", "_blank", "noopener,noreferrer");

    fireEvent.click(within(followDialog).getByRole("button", { name: "Remove" }));
    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Linked text" }] }]
    });

    openSpy.mockRestore();
  });

  it("dismisses the link surface when the editor receives another pointer action and keeps the replacement selection", async () => {
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

    await selectText(editor, 7, 11);
    fireEvent.pointerDown(editor.view.dom);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Create link" })).toBeNull();
    });
    expect(editor.state.selection.from).toBe(7);
    expect(editor.state.selection.to).toBe(11);

    await openLinkSurface(editor);
    const reopenDialog = await screen.findByRole("dialog", { name: "Create link" });
    const reopenInput = within(reopenDialog).getByRole("textbox", { name: "URL" }) as HTMLInputElement;
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

  it("closes the link surface on an outside-shell pointerdown without changing content", async () => {
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
    expect(editor.getJSON()).toEqual(before);
  });

  it.each([
    ["javascript:alert(1)", true],
    ["data:text/html,hi", true],
    ["   ", false]
  ])("rejects %s in the apply path without calling setLink", async (draftHref, showValidation) => {
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
    const input = within(dialog).getByRole("textbox", { name: "URL" }) as HTMLInputElement;
    const applyButton = within(dialog).getByRole("button", { name: "Apply" });
    const before = editor.getJSON();
    const selectionBefore = {
      from: editor.state.selection.from,
      to: editor.state.selection.to
    };

    await act(async () => {
      fireEvent.change(input, { target: { value: draftHref } });
    });

    expect(applyButton).toBeDisabled();
    if (showValidation) {
      expect(within(dialog).getByRole("alert")).toHaveTextContent("Enter a safe URL.");
    } else {
      expect(screen.queryByRole("alert")).toBeNull();
    }

    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(applyButton);

    expect(setLinkSpy).not.toHaveBeenCalled();
    expect(editor.getJSON()).toEqual(before);
    expect(editor.state.selection.from).toBe(selectionBefore.from);
    expect(editor.state.selection.to).toBe(selectionBefore.to);
    expect(screen.getByRole("dialog", { name: "Create link" })).toBeInTheDocument();
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
    expect(dialog).toHaveStyle({ width: "216px" });
    expect(harness.ownerDocument.addEventListener).toHaveBeenCalledWith("scroll", expect.any(Function), true);
    expect(harness.ownerWindow.addEventListener).toHaveBeenCalledWith("resize", expect.any(Function), { passive: true });

    setOverlayOwnerViewport(harness.ownerWindow, 180, 150);
    act(() => {
      harness.triggerScroll();
    });
    await waitFor(() => {
      expect(dialog).toHaveStyle({ width: "156px" });
    });

    setOverlayOwnerViewport(harness.ownerWindow, 260, 160);
    act(() => {
      harness.triggerResize();
    });
    await waitFor(() => {
      expect(dialog).toHaveStyle({ width: "236px" });
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
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
    const input = within(dialog).getByRole("textbox", { name: "URL" }) as HTMLInputElement;

    await act(async () => {
      fireEvent.change(input, { target: { value: "javascript:alert(1)" } });
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Enter a safe URL.");
    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Unsafe" }] }]
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: "" } });
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
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
    const input = within(dialog).getByRole("textbox", { name: "URL" }) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "https://example.com/redo" } });
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
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
    fireEvent.click(await screen.findByRole("option", { name: /Paragraph/ }));
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




