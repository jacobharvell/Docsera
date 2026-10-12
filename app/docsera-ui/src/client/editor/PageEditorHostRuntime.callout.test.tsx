/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Editor, JSONContent } from "@tiptap/core";
import type { DocseraTiptapDocument } from "../../shared/editor/document";
import { PublishedDocumentReader } from "../features/workspaces/PublishedDocumentReader";
import {
  createClipboardData,
  createEnvelopeFromDocument,
  openSlashQuery,
  openSlashQueryAtSelection,
  renderRuntime
} from "./PageEditorHostRuntime.testUtils";
import { describe, expect, it } from "vitest";

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
  });

  it("preserves incremental multiword callout title typing without trimming spaces", async () => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createCalloutDocument())
    });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0];

    const title = await screen.findByRole("textbox", { name: "Callout title" });
    title.focus();

    fireEvent.input(title, { target: { value: "Read " } });
    expect(title).toHaveValue("Read ");
    await waitFor(() => expect(editor.getJSON()).toEqual(createCalloutDocument("info", "Read ")));

    fireEvent.input(title, { target: { value: "Read this" } });
    expect(title).toHaveValue("Read this");
    await waitFor(() => expect(editor.getJSON()).toEqual(createCalloutDocument("info", "Read this")));

    fireEvent.input(title, { target: { value: "" } });
    expect(title).toHaveValue("");
    await waitFor(() => expect(editor.getJSON()).toEqual(createCalloutDocument("info", null)));
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
    expect(callout).toHaveAttribute("data-docsera-callout-type", "error");
    expect(callout).toHaveAttribute("data-docsera-callout-has-title", "true");
    expect(callout).toHaveAttribute("role", "note");
    expect(callout).toHaveAttribute("aria-label", "Error callout: Problem");
    expect(callout).toHaveStyle({
      "--docsera-callout-accent": "#EF4444",
      "--docsera-callout-icon-color": "#DC2626"
    });
    const runtimeStyle = getEditorRuntimeStyleText();
    expect(runtimeStyle).toContain(
      "--docsera-callout-icon-row-offset: calc((var(--docsera-document-body-font-size) * var(--docsera-document-body-line-height) - 20px) / 2);"
    );
    expect(runtimeStyle).toContain("grid-template-columns: 20px minmax(0, 1fr);");
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
    expect(runtimeStyle).toContain("font-size: var(--docsera-document-body-font-size);");
    expect(runtimeStyle).toContain("line-height: var(--docsera-document-body-line-height);");
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

  it("keeps untitled callout body width at live-reader parity while revealing controls without body overlap", async () => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createCalloutDocument("info", null))
    });
    await waitFor(() => expect(editorReady[0]).toBeDefined());
    const editor = editorReady[0];

    const callout = editor.view.dom.querySelector(".docsera-editor-callout");
    expect(callout).toHaveAttribute("data-docsera-callout-has-title", "false");

    const runtimeStyle = getEditorRuntimeStyleText();
    const controls = callout?.querySelector(".docsera-editor-callout__controls");
    const title = callout?.querySelector(".docsera-editor-callout__title");
    const body = callout?.querySelector(".docsera-editor-callout__body");
    expect(controls).toBeInTheDocument();
    expect(title).toBeInTheDocument();
    expect(body).toBeInTheDocument();
    expect(runtimeStyle).toContain('[data-docsera-callout-has-title="false"] .docsera-editor-callout__controls');
    expect(runtimeStyle).toContain("position: absolute;");
    expect(runtimeStyle).toContain("right: 18px;");
    expect(runtimeStyle).toContain("margin-bottom: 0;");
    expect(runtimeStyle).toContain("opacity: 0;");
    expect(runtimeStyle).toContain("pointer-events: none;");
    expect(runtimeStyle).toContain("width: 1px;");
    expect(runtimeStyle).toContain("opacity: 0;");
    expect(runtimeStyle).toContain("position: static;");
    expect(runtimeStyle).toContain("right: auto;");
    expect(runtimeStyle).toContain("margin-bottom: 8px;");
    expect(runtimeStyle).toContain("pointer-events: auto;");
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
