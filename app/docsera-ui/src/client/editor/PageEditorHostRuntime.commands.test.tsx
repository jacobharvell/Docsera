/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { undoDepth } from "@tiptap/pm/history";
import type { DocseraTiptapDocument } from "../../shared/editor/document";
import { createEmptyDocseraDocumentEnvelope } from "../../shared/editor/document";
import { parseDocseraDocumentOrThrow } from "../../shared/editor/document";
import type { PageBodySaveResult } from "../shared/types/docsera";
import { describe, expect, it, vi } from "vitest";
import { PageEditorHostRuntime } from "./PageEditorHostRuntime";
import {
  applyToolbarBlockTypeCommand,
  formatToolbarShortcutLabel,
  isEventWithinEditor,
  resolveEditorLinkElementFromEvent,
  resolveCenteredSurfaceStyle,
  resolveToolbarMenuSurfaceStyle
} from "./CompactTextToolbar";
import {
  createEnvelopeFromDocument,
  createOverlayOwnerDocumentHarness,
  createSuccessPage,
  openLinkSurface,
  openSlashQuery,
  pasteIntoEditor,
  renderRuntime,
  runAutosave,
  selectText,
  setOverlayOwnerViewport,
  setParagraphText
} from "./PageEditorHostRuntime.testUtils";

function getButtonNames(container: HTMLElement): string[] {
  return within(container)
    .getAllByRole("button")
    .map((button) => button.getAttribute("aria-label") ?? button.textContent?.trim() ?? "");
}

function getMenuItemNames(container: HTMLElement, role: "menuitemradio" | "menuitemcheckbox" = "menuitemradio"): string[] {
  return within(container)
    .getAllByRole(role)
    .map((item) => item.getAttribute("aria-label") ?? item.textContent?.trim() ?? "");
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

function expectCanonicalDocument(editor: Editor, expected: unknown) {
  const parsed = parseDocseraDocumentOrThrow(editor.getJSON());
  expect(parsed.document).toEqual(expected);
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
    ["Heading 1", { type: "doc", content: [{ type: "heading", attrs: { level: 1 } }] }],
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
          ]),
          { type: "paragraph" }
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
          },
          { type: "paragraph" }
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
          ]),
          { type: "paragraph" }
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
          },
          { type: "paragraph" }
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
          },
          { type: "paragraph" }
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
          ]),
          { type: "paragraph" }
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
          },
          { type: "paragraph" }
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
          },
          { type: "paragraph" }
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
          },
          { type: "paragraph" }
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
    expect(screen.getByRole("toolbar", { name: "Text formatting" })).toBeInTheDocument();

    await selectText(editor, 7, 11);
    fireEvent.pointerDown(editor.view.dom);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Create link" })).toBeNull();
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
    expect(screen.getByRole("toolbar", { name: "Text formatting" })).toBeInTheDocument();
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

