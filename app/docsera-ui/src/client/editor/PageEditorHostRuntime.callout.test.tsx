/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Editor, JSONContent } from "@tiptap/core";
import { undoDepth } from "@tiptap/pm/history";
import { TextSelection } from "@tiptap/pm/state";
import type { DocseraTiptapDocument } from "../../shared/editor/document";
import {
  parseDocseraMarkdownDocument,
  serializeDocseraMarkdownDocument
} from "../../shared/editor/markdown";
import { PublishedDocumentReader } from "../features/workspaces/PublishedDocumentReader";
import {
  createClipboardData,
  createEnvelopeFromDocument,
  openSlashQuery,
  openSlashQueryAtSelection,
  renderRuntime
} from "./PageEditorHostRuntime.testUtils";
import { describe, expect, it, vi } from "vitest";

function getOptionNames(container: HTMLElement): string[] {
  return within(container)
    .getAllByRole("option")
    .map((option) => option.getAttribute("aria-label") ?? option.textContent?.trim() ?? "");
}

function getEditorRuntimeStyleText(): string {
  return Array.from(document.querySelectorAll("style"))
    .map((style) => style.textContent ?? "")
    .find((styleText) => styleText.includes(".docsera-editor-callout")) ?? "";
}

function getRuntimeRuleBody(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escapedSelector}\\s*{(?<body>[^}]*)}`, "s"))?.groups?.body ?? "";
}

function getSvgGeometry(svg: Element | null | undefined) {
  expect(svg).toBeInTheDocument();

  const getAttributes = (element: Element) =>
    Array.from(element.attributes)
      .map((attribute) => [attribute.name, attribute.value] as const)
      .sort(([left], [right]) => left.localeCompare(right));

  return {
    root: getAttributes(svg as Element),
    children: Array.from((svg as Element).children).map((element) => ({
      name: element.localName,
      attributes: getAttributes(element)
    }))
  };
}

function createCalloutDocument(type: "info" | "warning" | "success" | "error" = "info", title: string | null = null): DocseraTiptapDocument {
  return {
    type: "doc",
    content: [
      {
        type: "callout",
        attrs: { type, title },
        content: [{ type: "paragraph" }]
      }
    ]
  };
}

function createMultiParagraphCalloutDocument(): DocseraTiptapDocument {
  return {
    type: "doc",
    content: [
      {
        type: "callout",
        attrs: { type: "info", title: "Steps" },
        content: [
          { type: "paragraph", content: [{ type: "text", text: "First body" }] },
          { type: "paragraph", content: [{ type: "text", text: "Second body" }] }
        ]
      }
    ]
  };
}

function createAdjacentCalloutDocument(): DocseraTiptapDocument {
  return {
    type: "doc",
    content: [
      { type: "paragraph", content: [{ type: "text", text: "Before" }] },
      ...(createMultiParagraphCalloutDocument().content ?? []),
      { type: "paragraph", content: [{ type: "text", text: "After" }] }
    ]
  };
}

function createAllCalloutTypesDocument(): DocseraTiptapDocument {
  return {
    type: "doc",
    content: (["info", "warning", "success", "error"] as const).map((type) => ({
      type: "callout",
      attrs: { type, title: `${type} title` },
      content: [{ type: "paragraph", content: [{ type: "text", text: `${type} body` }] }]
    }))
  };
}

function createAccordionBodyParagraphDocument(): DocseraTiptapDocument {
  return {
    type: "doc",
    content: [
      {
        type: "accordion",
        attrs: { accordionId: "accordion-callout-body" },
        content: [
          {
            type: "accordionItem",
            attrs: { accordionItemId: "accordion-item-callout-body" },
            content: [
              { type: "accordionTitle", content: [{ type: "text", text: "Accordion" }] },
              { type: "accordionContent", content: [{ type: "paragraph" }] }
            ]
          }
        ]
      }
    ]
  };
}

function createAccordionWithCalloutDocument(): DocseraTiptapDocument {
  const document = createAccordionBodyParagraphDocument();
  const accordion = document.content?.[0] as JSONContent;
  const item = accordion.content?.[0] as JSONContent;
  const body = item.content?.[1] as JSONContent;
  body.content = [
    {
      type: "callout",
      attrs: { type: "info", title: null },
      content: [{ type: "paragraph" }]
    }
  ];
  return document;
}

function getFirstTextblockPositionInsideNode(editor: Editor, ancestorTypeName: string): number {
  let position: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (position !== null || !node.isTextblock) {
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

function getTextblockPositionsInsideNode(editor: Editor, ancestorTypeName: string): Array<{ contentEnd: number; contentStart: number }> {
  const positions: Array<{ contentEnd: number; contentStart: number }> = [];
  editor.state.doc.descendants((node, pos) => {
    if (!node.isTextblock) {
      return true;
    }

    const $pos = editor.state.doc.resolve(pos);
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      if ($pos.node(depth).type.name === ancestorTypeName) {
        positions.push({ contentStart: pos + 1, contentEnd: pos + 1 + node.content.size });
        return false;
      }
    }

    return true;
  });

  if (positions.length === 0) {
    throw new Error(`Expected textblocks inside ${ancestorTypeName}.`);
  }

  return positions;
}

function expectSelectionInsideCalloutBody(editor: Editor) {
  expect(editor.state.selection).toBeInstanceOf(TextSelection);
  expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
  const ancestorNames = Array.from({ length: editor.state.selection.$from.depth }, (_entry, index) =>
    editor.state.selection.$from.node(index + 1).type.name
  );
  expect(ancestorNames).toContain("callout");
}

function mockEndOfTextblock(editor: Editor, handler: (direction: "up" | "down") => boolean) {
  const original = editor.view.endOfTextblock.bind(editor.view);
  const mock = vi.fn((direction: "up" | "down") => handler(direction));
  editor.view.endOfTextblock = mock;

  return {
    mock,
    restore: () => {
      editor.view.endOfTextblock = original;
    }
  };
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

function mockTopLevelBlockGeometry(editor: Editor, blockRects: DOMRect[]) {
  const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
  if (!(surface instanceof HTMLElement)) {
    throw new Error("Expected the editor surface to be available.");
  }

  const proseMirror = editor.view.dom;
  const proseMirrorChildren = Array.from(proseMirror.children);
  const restore = [
    mockElementRect(surface, new DOMRect(72, 36, 760, 540)),
    mockElementRect(proseMirror, new DOMRect(132, 52, 620, 420)),
    ...proseMirrorChildren.map((child, index) => mockElementRect(child, blockRects[index] ?? new DOMRect(0, 0, 1, 1)))
  ];

  return {
    restore() {
      for (const reset of restore.reverse()) {
        reset();
      }
    }
  };
}

async function openQuickAdd(editor: Editor, buttonName: string) {
  const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
  if (!(surface instanceof HTMLElement)) {
    throw new Error("Expected the editor surface to be available.");
  }

  const event = new Event("pointermove", { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { configurable: true, value: 120 },
    clientY: { configurable: true, value: 64 },
    composedPath: { configurable: true, value: () => [surface] },
    target: { configurable: true, value: surface }
  });
  await act(async () => {
    surface.ownerDocument.dispatchEvent(event);
  });
  fireEvent.click(await screen.findByRole("button", { name: buttonName }));
}

async function dispatchOwnerPointerEvent(
  ownerDocument: Document,
  target: EventTarget,
  type: "pointerdown" | "pointerup",
  point: { clientX: number; clientY: number },
  options: { button?: number; buttons?: number } = {}
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperties(event, {
    clientX: { configurable: true, value: point.clientX },
    clientY: { configurable: true, value: point.clientY },
    button: { configurable: true, value: options.button ?? 0 },
    buttons: { configurable: true, value: options.buttons ?? (type === "pointerdown" ? 1 : 0) },
    pointerId: { configurable: true, value: 1 },
    pointerType: { configurable: true, value: "mouse" },
    target: { configurable: true, value: target },
    composedPath: { configurable: true, value: () => [target] }
  });

  await act(async () => {
    const dispatchTarget =
      target instanceof Node && target.isConnected && target.ownerDocument === ownerDocument ? target : ownerDocument;
    dispatchTarget.dispatchEvent(event);
  });
}

describe("PageEditorHostRuntime callouts", () => {
  it("inserts an editable info callout through Slash and Quick Add", async () => {
    const slashView = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument({ type: "doc", content: [{ type: "paragraph" }] } as DocseraTiptapDocument)
    });
    await waitFor(() => expect(slashView.editorReady[0]).toBeDefined());
    const slashEditor = slashView.editorReady[0];
    const slashGeometry = mockTopLevelBlockGeometry(slashEditor, [new DOMRect(132, 52, 620, 28)]);

    await openSlashQuery(slashEditor, "call");
    fireEvent.click(await screen.findByRole("option", { name: "Callout" }));

    await waitFor(() => expect(slashEditor.getJSON()).toEqual(createCalloutDocument()));
    expect(slashEditor.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(slashEditor.view.dom.querySelector(".docsera-editor-callout")).toHaveAttribute("data-docsera-callout-type", "info");
    slashGeometry.restore();
    slashView.unmount();

    const quickAddView = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument({ type: "doc", content: [{ type: "paragraph" }] } as DocseraTiptapDocument)
    });
    await waitFor(() => expect(quickAddView.editorReady[0]).toBeDefined());
    const quickAddEditor = quickAddView.editorReady[0];
    const quickAddGeometry = mockTopLevelBlockGeometry(quickAddEditor, [new DOMRect(132, 52, 620, 28)]);

    await openQuickAdd(quickAddEditor, "Add block after Text");
    fireEvent.click(await screen.findByRole("option", { name: "Callout" }));

    await waitFor(() =>
      expect(quickAddEditor.getJSON()).toEqual({
        type: "doc",
        content: [{ type: "paragraph" }, ...(createCalloutDocument().content ?? [])]
      })
    );
    expect(quickAddEditor.state.selection.$from.parent.type.name).toBe("paragraph");
    quickAddGeometry.restore();
    quickAddView.unmount();
  });

  it("persists title and type edits as undoable document transactions", async () => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createCalloutDocument())
    });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0];

    const title = await screen.findByRole("textbox", { name: "Callout title" });
    const type = await screen.findByRole("combobox", { name: "Callout type" });

    fireEvent.input(title, { target: { value: "Read this" } });
    fireEvent.keyDown(title, { key: "Enter" });
    fireEvent.change(type, { target: { value: "warning" } });

    await waitFor(() => {
      expect(editor.getJSON()).toEqual(createCalloutDocument("warning", "Read this"));
    });
    expect(screen.getByRole("note", { name: "Warning callout: Read this" })).toBeInTheDocument();

    await act(async () => {
      editor.commands.undo();
    });
    expect((editor.getJSON().content?.[0]?.attrs as Record<string, unknown>).type).toBe("info");

    await act(async () => {
      editor.commands.redo();
    });
    expect(editor.getJSON()).toEqual(createCalloutDocument("warning", "Read this"));

    const serialized = serializeDocseraMarkdownDocument("Callout page", createEnvelopeFromDocument(editor.getJSON() as DocseraTiptapDocument));
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) {
      return;
    }
    expect(serialized.markdown).toContain(':::docsera-callout{type="warning" title="Read this"}');
    const parsed = parseDocseraMarkdownDocument(serialized.markdown);
    expect(parsed).toMatchObject({
      ok: true,
      title: "Callout page",
      envelope: createEnvelopeFromDocument(createCalloutDocument("warning", "Read this"))
    });
  });

  it("keeps an untitled title field visible and persists browser-like multiword edits across focus and pointer changes", async () => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createCalloutDocument())
    });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0];

    const title = await screen.findByRole("textbox", { name: "Callout title" });
    const body = editor.view.dom.querySelector("[data-docsera-callout-body='true']");
    const callout = editor.view.dom.querySelector(".docsera-editor-callout");
    expect(body).toBeInTheDocument();
    expect(callout).toHaveAttribute("data-docsera-callout-has-title", "false");
    expect(title).toHaveAttribute("placeholder", "Optional title");
    expect(title).toHaveValue("");
    expect(
      getRuntimeRuleBody(
        getEditorRuntimeStyleText(),
        '.docsera-editor-runtime__surface .ProseMirror .docsera-editor-callout[data-docsera-callout-has-title="false"] .docsera-editor-callout__title'
      )
    ).toContain("margin-bottom: 8px;");
    title.focus();
    expect(title).toHaveFocus();

    fireEvent.input(title, { target: { value: "Read " } });
    expect(title).toHaveValue("Read ");
    await waitFor(() => expect(editor.getJSON()).toEqual(createCalloutDocument("info", "Read ")));

    fireEvent.input(title, { target: { value: "Read this" } });
    fireEvent.pointerMove(body as Element);
    (body as HTMLElement).focus();
    fireEvent.blur(title);
    fireEvent.pointerOut(callout as Element);
    expect(title).toHaveValue("Read this");
    await waitFor(() => expect(editor.getJSON()).toEqual(createCalloutDocument("info", "Read this")));
    expect(callout).toHaveAttribute("data-docsera-callout-has-title", "true");

    await act(async () => {
      editor.commands.undo();
    });
    expect((editor.getJSON().content?.[0]?.attrs as Record<string, unknown>).title).toBeNull();
    await act(async () => {
      editor.commands.redo();
    });
    expect(editor.getJSON()).toEqual(createCalloutDocument("info", "Read this"));

    fireEvent.input(title, { target: { value: "" } });
    expect(title).toHaveValue("");
    await waitFor(() => expect(editor.getJSON()).toEqual(createCalloutDocument("info", null)));
  });

  it("makes an initially untitled callout title reachable by normal keyboard focus", async () => {
    renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createCalloutDocument())
    });

    const title = await screen.findByRole("textbox", { name: "Callout title" });
    expect(title.tagName).toBe("TEXTAREA");
    expect(title).toHaveAttribute("aria-multiline", "false");

    title.focus();
    expect(title).toHaveFocus();
  });

  it("does not create an undo step when an unchanged callout title loses focus to a real control", async () => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createCalloutDocument("warning", "Watch this"))
    });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0];
    const beforeDocument = editor.getJSON();
    const beforeUndoDepth = undoDepth(editor.state);

    const title = await screen.findByRole("textbox", { name: "Callout title" });
    const type = await screen.findByRole("combobox", { name: "Callout type" });

    title.focus();
    expect(title).toHaveFocus();
    type.focus();
    fireEvent.blur(title);

    expect(type).toHaveFocus();
    expect(editor.getJSON()).toEqual(beforeDocument);
    expect(undoDepth(editor.state)).toBe(beforeUndoDepth);
    expect(editor.can().undo()).toBe(false);
  });

  it("owns callout title editing and body navigation inside a ShadowRoot", async () => {
    const shadowHost = document.createElement("section");
    document.body.append(shadowHost);
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });
    const renderContainer = document.createElement("div");
    const overlayRoot = document.createElement("div");
    shadowRoot.append(renderContainer);

    const { editorReady } = renderRuntime(
      {
        initialEnvelope: createEnvelopeFromDocument(createCalloutDocument())
      },
      { overlayRoot, renderContainer, renderBaseElement: shadowRoot }
    );
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0];
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => false)
    });
    const shadowQueries = within(shadowRoot as unknown as HTMLElement);
    const title = await shadowQueries.findByRole("textbox", { name: "Callout title" });
    const body = editor.view.dom.querySelector("[data-docsera-callout-body='true']");
    expect(body).toBeInTheDocument();

    title.focus();
    expect(document.activeElement).toBe(shadowHost);
    expect(shadowRoot.activeElement).toBe(title);

    fireEvent.input(title, { target: { value: "Read these words" } });
    fireEvent.input(title, { target: { value: "Read these word" } });
    fireEvent.input(title, { target: { value: "Read these words now" } });
    await waitFor(() => expect(editor.getJSON()).toEqual(createCalloutDocument("info", "Read these words now")));

    const beforeEnterBlockCount = editor.state.doc.childCount;
    fireEvent.keyDown(title, { key: "Enter" });
    await waitFor(() => {
      expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
      expect(editor.state.selection.$from.node(editor.state.selection.$from.depth - 1).type.name).toBe("callout");
    });
    expect(editor.getJSON()).toEqual(createCalloutDocument("info", "Read these words now"));
    expect(editor.state.doc.childCount).toBe(beforeEnterBlockCount);

    title.focus();
    fireEvent.keyDown(title, { key: "ArrowDown" });
    await waitFor(() => {
      expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
      expect(editor.state.selection.$from.node(editor.state.selection.$from.depth - 1).type.name).toBe("callout");
    });
    expect(editor.state.doc.childCount).toBe(beforeEnterBlockCount);

    title.focus();
    fireEvent.input(title, { target: { value: "Body click title" } });
    fireEvent.blur(title, { relatedTarget: body });
    fireEvent.click(body as Element);
    await waitFor(() => expect(editor.getJSON()).toEqual(createCalloutDocument("info", "Body click title")));

    title.focus();
    fireEvent.input(title, { target: { value: "Outside click title" } });
    fireEvent.blur(title);
    fireEvent.pointerDown(document.body);
    await waitFor(() => expect(editor.getJSON()).toEqual(createCalloutDocument("info", "Outside click title")));

    const beforeUnchangedUndoDepth = undoDepth(editor.state);
    title.focus();
    fireEvent.blur(title);
    expect(undoDepth(editor.state)).toBe(beforeUnchangedUndoDepth);

    fireEvent.input(title, { target: { value: "Shortcut title" } });
    await waitFor(() => expect(editor.getJSON()).toEqual(createCalloutDocument("info", "Shortcut title")));
    fireEvent.keyDown(title, { key: "z", ctrlKey: true });
    await waitFor(() => expect(editor.getJSON()).toEqual(createCalloutDocument("info", null)));
    fireEvent.keyDown(title, { key: "y", ctrlKey: true });
    await waitFor(() => expect(editor.getJSON()).toEqual(createCalloutDocument("info", "Shortcut title")));
  });

  it("moves ArrowUp from the first callout body line into the optional title without changing the document", async () => {
    const shadowHost = document.createElement("section");
    document.body.append(shadowHost);
    const shadowRoot = shadowHost.attachShadow({ mode: "open" });
    const renderContainer = document.createElement("div");
    const overlayRoot = document.createElement("div");
    shadowRoot.append(renderContainer);
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createCalloutDocument("info", "Only callout"))
    }, { overlayRoot, renderContainer, renderBaseElement: shadowRoot });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0];
    const shadowQueries = within(shadowRoot as unknown as HTMLElement);
    const title = await shadowQueries.findByRole("textbox", { name: "Callout title" });
    const { mock, restore } = mockEndOfTextblock(editor, () => true);

    try {
      await act(async () => {
        editor.commands.insertContent("Alpha beta gamma");
      });
      const [bodyParagraph] = getTextblockPositionsInsideNode(editor, "callout");

      await act(async () => {
        editor.commands.setTextSelection(bodyParagraph.contentStart + 6);
      });
      const beforeDocument = editor.getJSON();
      const beforeTopLevelBlockCount = editor.state.doc.childCount;

      expect(fireEvent.keyDown(editor.view.dom, { key: "ArrowUp" })).toBe(false);

      expect(mock).toHaveBeenCalledWith("up");
      expect(document.activeElement).toBe(shadowHost);
      expect(shadowRoot.activeElement).toBe(title);
      expect(editor.getJSON()).toEqual(beforeDocument);
      expect(editor.state.doc.childCount).toBe(beforeTopLevelBlockCount);
    } finally {
      restore();
      shadowHost.remove();
    }
  });

  it("leaves ArrowUp and ArrowDown unconsumed when visual movement remains inside a callout textblock", async () => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createCalloutDocument("info", "Only callout"))
    });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0];
    const { mock, restore } = mockEndOfTextblock(editor, () => false);

    try {
      await act(async () => {
        editor.commands.insertContent("Alpha beta gamma");
      });
      const [bodyParagraph] = getTextblockPositionsInsideNode(editor, "callout");

      await act(async () => {
        editor.commands.setTextSelection(bodyParagraph.contentStart + 6);
      });
      const beforeDocument = editor.getJSON();
      const beforeSelection = editor.state.selection.toJSON();
      expect(fireEvent.keyDown(editor.view.dom, { key: "ArrowUp" })).toBe(true);
      expect(fireEvent.keyDown(editor.view.dom, { key: "ArrowDown" })).toBe(true);
      expect(mock).toHaveBeenCalledWith("up");
      expect(mock).toHaveBeenCalledWith("down");
      expect(editor.state.selection.toJSON()).toEqual(beforeSelection);
      expect(editor.getJSON()).toEqual(beforeDocument);
    } finally {
      restore();
    }
  });

  it("keeps wrapped-title ArrowDown native until the caret reaches the title end", async () => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createCalloutDocument("info", "Long wrapped title"))
    });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0];
    const title = await screen.findByRole("textbox", { name: "Callout title" }) as HTMLTextAreaElement;
    const beforeDocument = editor.getJSON();

    title.focus();
    title.setSelectionRange(4, 4);
    expect(fireEvent.keyDown(title, { key: "ArrowDown" })).toBe(true);
    expect(title).toHaveFocus();
    expect(editor.getJSON()).toEqual(beforeDocument);

    title.setSelectionRange(title.value.length, title.value.length);
    expect(fireEvent.keyDown(title, { key: "ArrowDown" })).toBe(false);
    await waitFor(() => expectSelectionInsideCalloutBody(editor));
    expect(editor.getJSON()).toEqual(beforeDocument);
  });

  it("enters the callout title from the immediately preceding block and then the existing body", async () => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createAdjacentCalloutDocument())
    });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0];
    const title = await screen.findByRole("textbox", { name: "Callout title" });
    const beforeDocument = editor.getJSON();
    const beforeTopLevelBlockCount = editor.state.doc.childCount;
    const { mock, restore } = mockEndOfTextblock(editor, (direction) => direction === "down");

    try {
      await act(async () => {
        editor.commands.setTextSelection(7);
      });

      expect(fireEvent.keyDown(editor.view.dom, { key: "ArrowDown" })).toBe(false);
      expect(mock).toHaveBeenCalledWith("down");
      expect(title).toHaveFocus();

      expect(fireEvent.keyDown(title, { key: "ArrowDown" })).toBe(false);
      await waitFor(() => expectSelectionInsideCalloutBody(editor));
      expect(editor.getJSON()).toEqual(beforeDocument);
      expect(editor.state.doc.childCount).toBe(beforeTopLevelBlockCount);
    } finally {
      restore();
    }
  });

  it("lets ArrowDown leave the last callout body block for neighboring content", async () => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createAdjacentCalloutDocument())
    });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0];
    const beforeDocument = editor.getJSON();
    const beforeTopLevelBlockCount = editor.state.doc.childCount;
    const bodyParagraphs = getTextblockPositionsInsideNode(editor, "callout");
    const { restore } = mockEndOfTextblock(editor, () => true);

    try {
      await act(async () => {
        editor.commands.setTextSelection(bodyParagraphs[1].contentEnd - 2);
      });
      const beforeArrowDownSelection = editor.state.selection.toJSON();
      expect(fireEvent.keyDown(editor.view.dom, { key: "ArrowDown" })).toBe(true);
      expectSelectionInsideCalloutBody(editor);
      expect(editor.state.selection.toJSON()).toEqual(beforeArrowDownSelection);
      expect(editor.getJSON()).toEqual(beforeDocument);
      expect(editor.state.doc.childCount).toBe(beforeTopLevelBlockCount);
    } finally {
      restore();
    }
  });

  it("flattens formatted callout title paste to plain text", async () => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createCalloutDocument())
    });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0];

    const title = await screen.findByRole("textbox", { name: "Callout title" });
    title.focus();
    fireEvent.paste(title, {
      clipboardData: createClipboardData("<strong>Formatted</strong> <em>title</em>", "Formatted title")
    } as never);

    expect(title).toHaveValue("Formatted title");
    await waitFor(() => expect(editor.getJSON()).toEqual(createCalloutDocument("info", "Formatted title")));
  });

  it("sanitizes pasted callout title newlines without moving focus", async () => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createCalloutDocument())
    });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0];

    const title = await screen.findByRole("textbox", { name: "Callout title" });
    title.focus();
    fireEvent.input(title, { target: { value: "Alpha\nbeta\r\n gamma" } });

    expect(title).toHaveFocus();
    expect(title).toHaveValue("Alpha beta  gamma");
    await waitFor(() => expect(editor.getJSON()).toEqual(createCalloutDocument("info", "Alpha beta  gamma")));
  });

  it("keeps keyboard focus on the callout type selector through successive changes", async () => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createCalloutDocument())
    });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0];

    const type = await screen.findByRole("combobox", { name: "Callout type" });
    type.focus();
    expect(type).toHaveFocus();

    fireEvent.keyDown(type, { key: "ArrowDown" });
    fireEvent.change(type, { target: { value: "warning" } });
    expect(type).toHaveFocus();

    fireEvent.keyDown(type, { key: "ArrowDown" });
    fireEvent.change(type, { target: { value: "success" } });
    expect(type).toHaveFocus();
    await waitFor(() => expect(editor.getJSON()).toEqual(createCalloutDocument("success", null)));

    await act(async () => {
      editor.commands.undo();
    });
    expect((editor.getJSON().content?.[0]?.attrs as Record<string, unknown>).type).toBe("info");

    await act(async () => {
      editor.commands.redo();
    });
    expect(editor.getJSON()).toEqual(createCalloutDocument("success", null));
  });

  it("labels top-level callouts correctly for existing gutter controls and block actions", async () => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createCalloutDocument())
    });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0];
    const geometry = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 96)]);
    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    const event = new Event("pointermove", { bubbles: true, cancelable: true });
    Object.defineProperties(event, {
      clientX: { configurable: true, value: 120 },
      clientY: { configurable: true, value: 64 },
      composedPath: { configurable: true, value: () => [surface] },
      target: { configurable: true, value: surface }
    });
    await act(async () => {
      surface.ownerDocument.dispatchEvent(event);
    });

    expect(await screen.findByRole("button", { name: "Add block after Callout" })).toBeInTheDocument();
    const handle = await screen.findByRole("button", { name: "Select block: Callout" });
    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 64 }, { button: 0, buttons: 1 });
    await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerup", { clientX: 160, clientY: 64 }, { button: 0, buttons: 0 });
    expect(await screen.findByRole("menu", { name: "Block actions for Callout" })).toBeInTheDocument();

    geometry.restore();
  });

  it("uses the approved semantic SVG icon shapes and shared container contract in edit mode", async () => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createCalloutDocument("error", "Problem"))
    });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0];

    const callout = editor.view.dom.querySelector(".docsera-editor-callout");
    const frame = editor.view.dom.querySelector(".docsera-editor-callout__frame");
    expect(callout).toHaveAttribute("data-docsera-callout-type", "error");
    expect(callout).toHaveAttribute("data-docsera-callout-has-title", "true");
    expect(frame).toHaveAttribute("role", "note");
    expect(frame).toHaveAttribute("aria-label", "Error callout: Problem");
    expect(callout).toHaveStyle({
      "--docsera-callout-accent": "#EF4444",
      "--docsera-callout-icon-color": "#DC2626"
    });
    const runtimeStyle = getEditorRuntimeStyleText();
    expect(runtimeStyle).toContain(
      "--docsera-callout-icon-row-offset: calc((var(--docsera-document-body-font-size) * var(--docsera-document-body-line-height) - 20px) / 2);"
    );
    expect(runtimeStyle).toContain("grid-template-columns: 20px minmax(0, 1fr);");
    expect(runtimeStyle).toContain("box-sizing: border-box;");
    expect(runtimeStyle).toMatch(/\.docsera-editor-callout__frame\s*{[^}]*width:\s*100%;/s);
    expect(runtimeStyle).toContain("padding: 16px 18px;");
    expect(runtimeStyle).toContain("border-left: 4px solid var(--docsera-callout-accent);");
    expect(runtimeStyle).toContain("border-radius: 6px;");
    expect(runtimeStyle).toContain("color: var(--docsera-text);");

    const icon = callout?.querySelector(".docsera-editor-callout__icon");
    expect(runtimeStyle).toContain("align-items: flex-start;");
    expect(runtimeStyle).toContain("width: 20px;");
    expect(runtimeStyle).toContain("height: 20px;");
    expect(runtimeStyle).toContain("margin-top: var(--docsera-callout-icon-row-offset);");
    expect(runtimeStyle).toContain("color: var(--docsera-callout-icon-color);");
    expect(runtimeStyle).toContain(".docsera-editor-callout__icon svg");
    expect(runtimeStyle).toContain("flex: 0 0 20px;");
    expect(icon).toHaveTextContent("");
    expect(icon?.querySelector("svg")).toBeInTheDocument();
    const iconGeometry = getSvgGeometry(icon?.querySelector("svg"));
    expect(iconGeometry.children).toEqual([
      { name: "circle", attributes: [["cx", "12"], ["cy", "12"], ["r", "10"]] },
      { name: "path", attributes: [["d", "m15 9-6 6"]] },
      { name: "path", attributes: [["d", "m9 9 6 6"]] }
    ]);

    const title = callout?.querySelector(".docsera-editor-callout__title");
    const type = callout?.querySelector(".docsera-editor-callout__type");
    expect(title).toBeInTheDocument();
    expect(type).toBeInTheDocument();
    expect(title?.tagName).toBe("TEXTAREA");
    expect(title).toHaveAttribute("aria-multiline", "false");
    expect(runtimeStyle).toContain("white-space: pre-wrap;");
    expect(runtimeStyle).toContain("overflow-wrap: anywhere;");
    expect(runtimeStyle).toContain("font-size: var(--docsera-document-body-font-size);");
    expect(runtimeStyle).toContain("line-height: var(--docsera-document-body-line-height);");
    expect(runtimeStyle).toContain("color: color-mix(in srgb, var(--docsera-text-muted) 58%, transparent);");
    expect(runtimeStyle).toContain("font-weight: 500;");
    expect(runtimeStyle).toContain("font-size: 14px;");
    expect(runtimeStyle).toContain("line-height: 1.3;");
  });

  it("keeps every edit callout icon at live-reader SVG geometry parity", async () => {
    const document = createAllCalloutTypesDocument();
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(document)
    });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0];
    const reader = render(<PublishedDocumentReader envelope={createEnvelopeFromDocument(document)} pageIdentity="callout-icon-parity" />);

    const callouts = Array.from(editor.view.dom.querySelectorAll(".docsera-editor-callout"));
    const liveCallouts = Array.from(reader.container.querySelectorAll(".docsera-main__callout"));
    expect(callouts).toHaveLength(4);
    expect(liveCallouts).toHaveLength(4);
    expect(callouts.map((callout) => callout.getAttribute("data-docsera-callout-type"))).toEqual([
      "info",
      "warning",
      "success",
      "error"
    ]);
    expect(liveCallouts.map((callout) => callout.getAttribute("data-docsera-callout-type"))).toEqual([
      "info",
      "warning",
      "success",
      "error"
    ]);

    for (const [index, callout] of callouts.entries()) {
      const icon = callout.querySelector(".docsera-editor-callout__icon");
      const svg = icon?.querySelector("svg");
      const liveSvg = liveCallouts[index]?.querySelector(".docsera-main__callout-icon svg");
      expect(icon).toBeInTheDocument();
      expect(svg).toBeInTheDocument();
      expect(svg).toHaveAttribute("width", "20");
      expect(svg).toHaveAttribute("height", "20");
      expect(svg).toHaveAttribute("viewBox", "0 0 24 24");
      expect(svg).toHaveAttribute("fill", "none");
      expect(svg).toHaveAttribute("stroke", "currentColor");
      expect(svg).toHaveAttribute("stroke-width", "2.2");
      expect(svg).toHaveAttribute("stroke-linecap", "round");
      expect(svg).toHaveAttribute("stroke-linejoin", "round");
      expect(getSvgGeometry(svg)).toEqual(getSvgGeometry(liveSvg));
    }
  });

  it("keeps untitled callout body width at live-reader parity while exposing above-frame type controls", async () => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createCalloutDocument("info", null))
    });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0];

    const callout = editor.view.dom.querySelector(".docsera-editor-callout");
    expect(callout).toHaveAttribute("data-docsera-callout-has-title", "false");

    const runtimeStyle = getEditorRuntimeStyleText();
    const controls = callout?.querySelector(".docsera-editor-callout__controls");
    const frame = callout?.querySelector(".docsera-editor-callout__frame");
    const title = callout?.querySelector(".docsera-editor-callout__title");
    const type = callout?.querySelector(".docsera-editor-callout__type");
    const body = callout?.querySelector(".docsera-editor-callout__body");
    expect(controls).toBeInTheDocument();
    expect(frame).toBeInTheDocument();
    expect(title).toBeInTheDocument();
    expect(type).toBeInTheDocument();
    expect(body).toBeInTheDocument();
    const controlsRule = getRuntimeRuleBody(runtimeStyle, ".docsera-editor-runtime__surface .ProseMirror .docsera-editor-callout__controls");
    expect(controls?.nextElementSibling).toBe(frame);
    expect(controls?.firstElementChild).toBe(type);
    expect(runtimeStyle).toMatch(/\.docsera-editor-callout__controls\s*{[^}]*display:\s*flex;[^}]*justify-content:\s*flex-end;[^}]*margin-bottom:\s*4px;/s);
    expect(runtimeStyle).toContain('[data-docsera-callout-has-title="false"] .docsera-editor-callout__title');
    const untitledTitleRule = getRuntimeRuleBody(
      runtimeStyle,
      '.docsera-editor-runtime__surface .ProseMirror .docsera-editor-callout[data-docsera-callout-has-title="false"] .docsera-editor-callout__title'
    );
    expect(untitledTitleRule).toContain("margin-bottom: 8px;");
    expect(untitledTitleRule).not.toContain("max-height: 0;");
    expect(untitledTitleRule).not.toContain("opacity: 0;");
    expect(untitledTitleRule).not.toContain("overflow: hidden;");
    expect(runtimeStyle).not.toMatch(/\[data-docsera-callout-has-title="false"\]:hover\s+\.docsera-editor-callout__title/);
    expect(controlsRule).not.toContain("position: absolute;");
    expect(controlsRule).not.toContain("right: 18px;");
    expect(runtimeStyle).not.toContain("padding-right: 8.5rem;");
    expect(runtimeStyle).not.toMatch(
      /docsera-editor-callout\[data-docsera-callout-has-title="false"\]\s+\.docsera-editor-callout__body\s*{[^}]*padding-right:/s
    );
  });

  it("offers callouts inside accordion bodies and suppresses unsupported callout descendants", async () => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createAccordionBodyParagraphDocument())
    });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0];
    const geometry = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 180)]);

    await act(async () => {
      editor.commands.setTextSelection(getFirstTextblockPositionInsideNode(editor, "accordionContent") + 1);
    });
    await openSlashQueryAtSelection(editor, "call");
    fireEvent.click(await screen.findByRole("option", { name: "Callout" }));

    await waitFor(() => expect(editor.getJSON()).toEqual(createAccordionWithCalloutDocument()));
    await waitFor(() => expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull());

    await act(async () => {
      editor.commands.setTextSelection(getFirstTextblockPositionInsideNode(editor, "callout") + 1);
    });
    const selectionAncestorNames = Array.from({ length: editor.state.selection.$from.depth }, (_entry, index) =>
      editor.state.selection.$from.node(index + 1).type.name
    );
    expect(selectionAncestorNames).toContain("callout");
    fireEvent.keyDown(editor.view.dom, { key: "/" });
    const slashMenu = await screen.findByRole("listbox", { name: "Slash command menu" });
    const optionNames = getOptionNames(slashMenu);
    expect(optionNames).toEqual(expect.arrayContaining(["Text", "Blockquote", "Horizontal Rule"]));
    expect(optionNames).not.toContain("Image");
    expect(optionNames).not.toContain("Table");
    expect(optionNames).not.toContain("Accordion");
    expect(optionNames).not.toContain("Callout");
    expect(optionNames).not.toContain("2 columns");

    geometry.restore();
  });

  it("does not open Slash commands from the callout title control", async () => {
    renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createCalloutDocument())
    });

    const title = await screen.findByRole("textbox", { name: "Callout title" });
    fireEvent.keyDown(title, { key: "/" });
    expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();
  });

  it("drops unsupported pasted callout descendants at the callout boundary", async () => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createCalloutDocument())
    });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0];

    await act(async () => {
      editor.commands.setTextSelection(getFirstTextblockPositionInsideNode(editor, "callout") + 1);
      fireEvent.paste(editor.view.dom, {
        clipboardData: createClipboardData(
          '<aside data-docsera-callout="true" data-docsera-callout-type="warning"><p>Nested</p></aside>',
          "Nested"
        )
      } as never);
    });

    expect(editor.getJSON()).toEqual(createCalloutDocument());
  });
});
