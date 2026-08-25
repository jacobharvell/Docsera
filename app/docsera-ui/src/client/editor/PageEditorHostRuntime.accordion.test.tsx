/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Editor, JSONContent } from "@tiptap/core";
import { undoDepth } from "@tiptap/pm/history";
import { Slice } from "@tiptap/pm/model";
import type { DocseraTiptapDocument } from "../../shared/editor/document";
import {
  createEnvelopeFromDocument,
  pasteIntoEditor,
  renderRuntime,
  runAutosave
} from "./PageEditorHostRuntime.testUtils";
import { describe, expect, it } from "vitest";
import { getAccordionOpenItemId } from "../../shared/editor/schema";
import { regenerateAccordionPastedSliceIdentities, transformAccordionPastedSliceIdentities } from "./PageEditorHostRuntime";

function getOptionNames(container: HTMLElement): string[] {
  return within(container)
    .getAllByRole("option")
    .map((option) => option.getAttribute("aria-label") ?? option.textContent?.trim() ?? "");
}

function getMenuItemNames(container: HTMLElement): string[] {
  return within(container)
    .getAllByRole("menuitem")
    .map((item) => item.getAttribute("aria-label") ?? item.textContent?.trim() ?? "");
}

function getSelectedBlockElement(editor: Editor): HTMLElement | null {
  const selectedBlock = editor.view.dom.querySelector("[data-docsera-block-selected='true']");
  return selectedBlock instanceof HTMLElement ? selectedBlock : null;
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
  const workspace = document.createElement("div");
  workspace.className = "docsera-workspace";
  const mainPane = document.createElement("main");
  mainPane.className = "docsera-main";
  const panel = document.createElement("article");
  panel.className = "docsera-main__surface docsera-main__surface--editor";
  const intro = document.createElement("div");
  intro.className = "docsera-main__intro";
  const title = document.createElement("h1");
  title.id = "docsera-page-title";
  title.className = "docsera-main__title";
  title.textContent = "Accordion";
  const host = document.createElement("div");
  host.className = "docsera-main__editor-host";
  intro.append(title);
  panel.append(intro, host);
  mainPane.append(panel);
  workspace.append(mainPane);
  document.body.append(workspace);

  const originalClosest = surface.closest.bind(surface);
  const restore = [
    mockElementProperty(mainPane, "getBoundingClientRect", () => new DOMRect(40, 36, 960, 620)),
    mockElementProperty(panel, "getBoundingClientRect", () => new DOMRect(132, 36, 768, 620)),
    mockElementProperty(host, "getBoundingClientRect", () => new DOMRect(72, 96, 760, 540)),
    mockElementProperty(surface, "getBoundingClientRect", () => new DOMRect(72, 96, 760, 540)),
    mockElementProperty(proseMirror, "getBoundingClientRect", () => new DOMRect(132, 100, 620, 420)),
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

  return {
    restore() {
      for (const step of restore.reverse()) {
        step();
      }
      workspace.remove();
    }
  };
}

async function dispatchOwnerPointerEvent(
  ownerDocument: Document,
  target: EventTarget,
  type: "pointerdown" | "pointermove" | "pointerup",
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

async function dispatchOwnerPointerMove(ownerDocument: Document, target: EventTarget, point: { clientX: number; clientY: number }) {
  await dispatchOwnerPointerEvent(ownerDocument, target, "pointermove", point);
}

function createAccordionDocument(): DocseraTiptapDocument {
  return {
    type: "doc",
    content: [
      {
        type: "accordion",
        attrs: {
          accordionId: "accordion-actions"
        },
        content: [
          {
            type: "accordionItem",
            attrs: {
              accordionItemId: "accordion-item-overview"
            },
            content: [
              {
                type: "accordionTitle",
                content: [{ type: "text", text: "Overview" }]
              },
              {
                type: "accordionContent",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Overview body" }]
                  }
                ]
              }
            ]
          },
          {
            type: "accordionItem",
            attrs: {
              accordionItemId: "accordion-item-plan"
            },
            content: [
              {
                type: "accordionTitle",
                content: [{ type: "text", text: "Plan" }]
              },
              {
                type: "accordionContent",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Plan body" }]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
}

function createSingleItemAccordionDocument(): DocseraTiptapDocument {
  const accordion = createAccordionDocument().content?.[0] as JSONContent | undefined;
  if (!accordion || accordion.type !== "accordion") {
    throw new Error("Expected the accordion fixture to create a canonical accordion.");
  }

  const accordionAttrs = accordion.attrs as { accordionId?: string } | undefined;
  const singleItemAccordion = accordion as JSONContent & { content?: JSONContent[] };

  return {
    type: "doc",
    content: [
      {
        type: "accordion",
        attrs: {
          accordionId: typeof accordionAttrs?.accordionId === "string" ? accordionAttrs.accordionId : "accordion-actions"
        },
        content: Array.isArray(singleItemAccordion.content) ? singleItemAccordion.content.slice(0, 1) : []
      }
    ]
  };
}

function createAccordionTaskListDocument(): DocseraTiptapDocument {
  return {
    type: "doc",
    content: [
      {
        type: "accordion",
        attrs: {
          accordionId: "accordion-task-list"
        },
        content: [
          {
            type: "accordionItem",
            attrs: {
              accordionItemId: "accordion-item-task-list"
            },
            content: [
              {
                type: "accordionTitle",
                content: [{ type: "text", text: "Tasks" }]
              },
              {
                type: "accordionContent",
                content: [
                  {
                    type: "taskList",
                    content: [
                      {
                        type: "taskItem",
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text: "First task" }]
                          }
                        ]
                      },
                      {
                        type: "taskItem",
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text: "Second task" }]
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
}

function getAccordionTitleParagraph(editor: Editor): HTMLParagraphElement | null {
  const title = editor.view.dom.querySelector("[data-docsera-accordion-title='true']");
  return title instanceof HTMLParagraphElement ? title : null;
}

function getAccordionBodyParagraphs(editor: Editor): HTMLParagraphElement[] {
  return Array.from(editor.view.dom.querySelectorAll("[data-docsera-accordion-content='true'] > p")).filter(
    (element): element is HTMLParagraphElement => element instanceof HTMLParagraphElement
  );
}

function getAccordionItemElement(editor: Editor, itemId: string): HTMLElement | null {
  const item = editor.view.dom.querySelector(`[data-docsera-accordion-item-id="${itemId}"]`);
  return item instanceof HTMLElement ? item : null;
}

function getAccordionItemMenuElement(editor: Editor, itemId: string): HTMLDivElement | null {
  const item = getAccordionItemElement(editor, itemId);
  if (!(item instanceof HTMLElement)) {
    return null;
  }

  const menu = item.querySelector("[role='menu']");
  return menu instanceof HTMLDivElement ? menu : null;
}

function getAccordionItemPosition(editor: Editor, itemId: string): number {
  let itemPosition: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (itemPosition !== null) {
      return false;
    }

    if (node.type.name === "accordionItem" && (node.attrs as { accordionItemId?: string }).accordionItemId === itemId) {
      itemPosition = pos;
      return false;
    }

    return true;
  });

  if (itemPosition === null) {
    throw new Error(`Expected to find accordion item ${itemId}.`);
  }

  return itemPosition;
}

function getAccordionItemSelectionPositions(editor: Editor, itemId: string) {
  const itemPosition = getAccordionItemPosition(editor, itemId);
  const itemNode = editor.state.doc.nodeAt(itemPosition);
  if (!itemNode || itemNode.type.name !== "accordionItem" || itemNode.childCount < 2) {
    throw new Error(`Expected accordion item ${itemId} to have a canonical title/body structure.`);
  }

  const titleNode = itemNode.child(0);
  return {
    itemPosition,
    titleSelectionPosition: itemPosition + 2,
    bodySelectionPosition: itemPosition + 1 + titleNode.nodeSize + 2
  };
}

function getTextSelectionPosition(editor: Editor, text: string): number {
  let selectionPosition: number | null = null;

  editor.state.doc.descendants((node, pos) => {
    if (selectionPosition !== null) {
      return false;
    }

    if (node.isText && typeof node.text === "string" && node.text.includes(text)) {
      selectionPosition = pos + 1;
      return false;
    }

    return true;
  });

  if (selectionPosition === null) {
    throw new Error(`Expected to find text ${text} in the editor document.`);
  }

  return selectionPosition;
}

function isEmptyParagraphNode(node: JSONContent): boolean {
  return (
    node.type === "paragraph" &&
    (!Array.isArray(node.content) ||
      node.content.length === 0 ||
      node.content.every((child) => child.type !== "text" || typeof child.text !== "string" || child.text.trim().length === 0))
  );
}

function readJsonNodeText(node: JSONContent | undefined): string {
  if (!node) {
    return "";
  }

  if (typeof node.text === "string") {
    return node.text;
  }

  return (node.content ?? []).map((child) => readJsonNodeText(child)).join("");
}

function findAccordionNodeByFirstTitle(content: JSONContent[] | undefined, title: string): JSONContent | undefined {
  for (const node of content ?? []) {
    if (node.type !== "accordion" || !Array.isArray(node.content)) {
      continue;
    }

    const firstItem = node.content.find((child) => child.type === "accordionItem");
    if (!firstItem || !Array.isArray(firstItem.content)) {
      continue;
    }

    const titleNode = firstItem.content.find((child) => child.type === "accordionTitle");
    if (!titleNode || readJsonNodeText(titleNode).trim() !== title) {
      continue;
    }

    return node;
  }

  return undefined;
}

function serializeClipboardHtmlForDocument(editor: Editor, sourceDocument: DocseraTiptapDocument): string {
  const sourceSlice = new Slice(editor.schema.nodeFromJSON(sourceDocument).content, 0, 0);
  const { dom } = editor.view.serializeForClipboard(sourceSlice);
  return dom.innerHTML;
}

function createAccordionClipboardSlice(editor: Editor, sourceDocument: DocseraTiptapDocument): Slice {
  return new Slice(editor.schema.nodeFromJSON(sourceDocument).content, 0, 0);
}

async function openAccordionBlockMenu(editor: Editor, blockRect = new DOMRect(132, 52, 620, 196)) {
  const geometry = mockTopLevelBlockGeometry(editor, [blockRect]);
  const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
  if (!(surface instanceof HTMLElement)) {
    throw new Error("Expected the editor surface to be available.");
  }

  await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 120, clientY: 64 });
  const handle = await screen.findByRole("button", { name: "Select block: Accordion" });
  await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerdown", { clientX: 160, clientY: 64 }, { button: 0, buttons: 1 });
  await dispatchOwnerPointerEvent(surface.ownerDocument, handle, "pointerup", { clientX: 160, clientY: 64 }, { button: 0, buttons: 0 });

  return {
    geometry,
    handle,
    menu: await screen.findByRole("menu", { name: "Block actions for Accordion" })
  };
}

describe("PageEditorHostRuntime accordion corrections", () => {
  it("replaces an empty accordion body paragraph with a nested blockquote through Slash, preserves accordion ownership, and still suppresses title Slash", async () => {
    const initial = createAccordionDocument();
    const { editorReady, onSaveDraft } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const titleParagraph = getAccordionTitleParagraph(editor);
    if (!(titleParagraph instanceof HTMLParagraphElement)) {
      throw new Error("Expected the accordion title paragraph.");
    }
    const initialBodyParagraphs = getAccordionBodyParagraphs(editor);
    expect(initialBodyParagraphs).toHaveLength(2);
    const firstBodyParagraph = initialBodyParagraphs[0];
    if (!(firstBodyParagraph instanceof HTMLParagraphElement)) {
      throw new Error("Expected the first accordion body paragraph.");
    }

    await act(async () => {
      editor.commands.focus("start", { scrollIntoView: false });
    });
    fireEvent.keyDown(editor.view.dom, { key: "/" });
    expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();

    await act(async () => {
      editor.commands.focus("end", { scrollIntoView: false });
    });
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");

    fireEvent.keyDown(editor.view.dom, { key: "Enter" });

    await waitFor(() => {
      expect(getAccordionBodyParagraphs(editor)).toHaveLength(3);
    });

    const bodyParagraphs = getAccordionBodyParagraphs(editor);
    const emptyBodyParagraph = bodyParagraphs[bodyParagraphs.length - 1];
    if (!(emptyBodyParagraph instanceof HTMLParagraphElement)) {
      throw new Error("Expected the Enter-created empty accordion body paragraph.");
    }

    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(emptyBodyParagraph).toHaveAttribute("data-placeholder", "Start typing or press '/' for commands");
    const undoDepthAfterEnter = undoDepth(editor.state);
    expect(undoDepthAfterEnter).toBe(1);
    const emptyParagraphState = editor.getJSON();
    fireEvent.keyDown(editor.view.dom, { key: "/" });

    const slashMenu = await screen.findByRole("listbox", { name: "Slash command menu" });
    expect(editor.view.dom.querySelector("[data-docsera-command-query-helper='Type to search']")).toBeInTheDocument();
    expect(getOptionNames(slashMenu)).toContain("Blockquote");
    expect(getOptionNames(slashMenu)).toContain("Code Block");
    expect(getOptionNames(slashMenu)).not.toContain("Accordion");
    expect(undoDepth(editor.state)).toBe(undoDepthAfterEnter);
    expect(onSaveDraft).not.toHaveBeenCalled();

    fireEvent.click(await within(slashMenu).findByRole("option", { name: "Blockquote" }));

    const expectedAfterBlockquote = {
      type: "doc",
      content: [
        {
          type: "accordion",
          attrs: {
            accordionId: "accordion-actions"
          },
          content: [
            {
              type: "accordionItem",
              attrs: {
                accordionItemId: "accordion-item-overview"
              },
              content: [
                {
                  type: "accordionTitle",
                  content: [{ type: "text", text: "Overview" }]
                },
                {
                  type: "accordionContent",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Overview body" }]
                    }
                  ]
                }
              ]
            },
            {
              type: "accordionItem",
              attrs: {
                accordionItemId: "accordion-item-plan"
              },
              content: [
                {
                  type: "accordionTitle",
                  content: [{ type: "text", text: "Plan" }]
                },
                {
                  type: "accordionContent",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Plan body" }]
                    },
                    {
                      type: "blockquote",
                      content: [{ type: "paragraph" }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    } satisfies DocseraTiptapDocument;

    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();
      expect(editor.getJSON()).toEqual(expectedAfterBlockquote);
    });

    expect(editor.getJSON().content).toHaveLength(1);
    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "accordion",
      attrs: { accordionId: "accordion-actions" }
    });
    expect(editor.state.selection.empty).toBe(true);
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(editor.isActive("blockquote")).toBe(true);
    expect(document.activeElement).toBe(editor.view.dom);

    const nestedBlockquoteParagraph = editor.view.dom.querySelector("[data-docsera-accordion-content='true'] blockquote > p");
    expect(nestedBlockquoteParagraph).toBeInstanceOf(HTMLParagraphElement);

    await runAutosave();
    await waitFor(() => {
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
    });
    const saveCalls = onSaveDraft.mock.calls as unknown as Array<[{ draftContentJson: { document: DocseraTiptapDocument } }]>;
    expect(saveCalls[0]?.[0].draftContentJson.document).toEqual(expectedAfterBlockquote);

    await act(async () => {
      editor.commands.undo();
    });

    await waitFor(() => {
      expect(editor.getJSON()).toEqual(emptyParagraphState);
    });
    expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    expect(editor.isActive("blockquote")).toBe(false);

    fireEvent.keyDown(editor.view.dom, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();
    });

    await act(async () => {
      editor.commands.setTextSelection(2);
    });
    fireEvent.keyDown(editor.view.dom, { key: "/" });
    expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();
  });

  it("moves from accordion title editing into the body on Enter without mutating the document", async () => {
    const initial = createSingleItemAccordionDocument();
    const { editorReady, onSaveDraft } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const { titleSelectionPosition } = getAccordionItemSelectionPositions(editor, "accordion-item-overview");

    await act(async () => {
      editor.commands.setTextSelection(titleSelectionPosition);
    });

    const initialJson = editor.getJSON();
    const initialUndoDepth = undoDepth(editor.state);

    fireEvent.keyDown(editor.view.dom, { key: "Enter" });

    await waitFor(() => {
      expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
      expect(getAccordionItemElement(editor, "accordion-item-overview")).toHaveAttribute(
        "data-docsera-accordion-open",
        "true"
      );
    });

    expect(editor.getJSON()).toEqual(initialJson);
    expect(undoDepth(editor.state)).toBe(initialUndoDepth);

    await runAutosave();
    expect(onSaveDraft).not.toHaveBeenCalled();
  });

  it("shows accordion item controls inline with the item and adds only from the last item", async () => {
    const initial = createAccordionDocument();
    const { editorReady, onSaveDraft } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const firstItem = getAccordionItemElement(editor, "accordion-item-overview");
    const secondItem = getAccordionItemElement(editor, "accordion-item-plan");
    if (!(firstItem instanceof HTMLElement) || !(secondItem instanceof HTMLElement)) {
      throw new Error("Expected the first accordion item.");
    }

    expect(firstItem.querySelector(".docsera-editor-accordion__item-controls")).toBeNull();
    expect(secondItem.querySelector(".docsera-editor-accordion__item-controls")).toBeNull();
    const firstLane = firstItem.querySelector<HTMLElement>('[data-docsera-accordion-control="add-lane"]');
    if (!(firstLane instanceof HTMLElement)) {
      throw new Error("Expected the first accordion item add interaction lane.");
    }
    expect(firstLane).toHaveAttribute("hidden");
    expect(within(firstItem).queryByRole("button", { name: "Add item after: Overview" })).toBeNull();

    const secondLane = secondItem.querySelector<HTMLElement>('[data-docsera-accordion-control="add-lane"]');
    if (!(secondLane instanceof HTMLElement)) {
      throw new Error("Expected the last accordion item to render the add interaction lane.");
    }
    expect(secondLane).not.toHaveAttribute("hidden");
    const secondLaneStyles = getComputedStyle(secondLane);
    expect(secondLaneStyles.position).toBe("absolute");
    expect(secondLaneStyles.left).toBe("100%");
    expect(secondLaneStyles.top).toBe("0px");
    expect(secondLaneStyles.width).toBe("2.25rem");
    expect(secondLaneStyles.height).toBe("100%");
    expect(secondLaneStyles.pointerEvents).toBe("auto");
    expect(secondLaneStyles.zIndex).toBe("0");

    const secondEllipsis = secondItem.querySelector<HTMLButtonElement>('[data-docsera-accordion-control="menu"]');
    if (!(secondEllipsis instanceof HTMLButtonElement)) {
      throw new Error("Expected the second accordion ellipsis button.");
    }
    const secondEllipsisIcon = secondEllipsis.querySelector("svg");
    if (!(secondEllipsisIcon instanceof SVGElement)) {
      throw new Error("Expected the second accordion ellipsis icon.");
    }
    expect(secondEllipsis).not.toHaveTextContent("⋯");
    expect(secondEllipsisIcon).toHaveAttribute("aria-hidden", "true");
    expect(secondEllipsisIcon).toHaveAttribute("width", "14");
    expect(secondEllipsisIcon).toHaveAttribute("height", "14");

    const secondAdd = secondItem.querySelector<HTMLButtonElement>('[data-docsera-accordion-control="add"]');
    if (!(secondAdd instanceof HTMLButtonElement)) {
      throw new Error("Expected the second accordion add button.");
    }
    const secondAddIcon = secondAdd.querySelector("svg");
    if (!(secondAddIcon instanceof SVGElement)) {
      throw new Error("Expected the second accordion add icon.");
    }
    expect(secondAdd).not.toHaveTextContent("+");
    expect(secondAddIcon).toHaveAttribute("aria-hidden", "true");
    expect(secondAddIcon).toHaveAttribute("width", "14");
    expect(secondAddIcon).toHaveAttribute("height", "14");
    expect(secondAdd).toHaveStyle({ zIndex: "1" });

    fireEvent.focusIn(secondItem);
    fireEvent.click(within(secondItem).getByRole("button", { name: "Add item after: Plan", hidden: true }));

    await waitFor(() => {
      expect(editor.getJSON().content?.[0]?.content).toHaveLength(3);
    });

    const accordion = editor.getJSON().content?.[0];
    if (!accordion || accordion.type !== "accordion") {
      throw new Error("Expected the pasted accordion to remain canonical after adding an item.");
    }

    const [sourceItem, preservedItem, addedItem] = (accordion.content ?? []) as JSONContent[];
    expect((sourceItem.attrs as { accordionItemId?: string }).accordionItemId).toBe("accordion-item-overview");
    expect((preservedItem.attrs as { accordionItemId?: string }).accordionItemId).toBe("accordion-item-plan");
    expect((addedItem.attrs as { accordionItemId?: string }).accordionItemId).toMatch(/^accordion-item-/);
    expect((addedItem.attrs as { accordionItemId?: string }).accordionItemId).not.toBe(
      (sourceItem.attrs as { accordionItemId?: string }).accordionItemId
    );
    expect(addedItem).toMatchObject({
      type: "accordionItem",
      content: [
        {
          type: "accordionTitle"
        },
        {
          type: "accordionContent",
          content: [{ type: "paragraph" }]
        }
      ]
    });
    expect(undoDepth(editor.state)).toBeGreaterThan(0);

    await runAutosave();
    await waitFor(() => {
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      editor.commands.undo();
    });

    await waitFor(() => {
      expect(editor.getJSON()).toEqual(initial);
    });
  });

  it("renders the final-item add interaction lane and compact icon/menu affordances without literal glyphs", async () => {
    const initial = createAccordionDocument();
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const firstItem = getAccordionItemElement(editor, "accordion-item-overview");
    const secondItem = getAccordionItemElement(editor, "accordion-item-plan");
    if (!(firstItem instanceof HTMLElement) || !(secondItem instanceof HTMLElement)) {
      throw new Error("Expected both accordion items.");
    }

    const firstLane = firstItem.querySelector<HTMLElement>('[data-docsera-accordion-control="add-lane"]');
    if (!(firstLane instanceof HTMLElement)) {
      throw new Error("Expected the first accordion item add interaction lane.");
    }
    expect(firstLane).not.toHaveClass("docsera-editor-accordion__control");
    expect(firstLane).toHaveClass("docsera-editor-accordion__add-lane");
    expect(firstLane).toHaveAttribute("hidden");

    const secondLane = secondItem.querySelector<HTMLElement>('[data-docsera-accordion-control="add-lane"]');
    if (!(secondLane instanceof HTMLElement)) {
      throw new Error("Expected the final accordion item add interaction lane.");
    }
    expect(secondLane).not.toHaveClass("docsera-editor-accordion__control");
    expect(secondLane).toHaveClass("docsera-editor-accordion__add-lane");
    expect(secondLane).not.toHaveAttribute("hidden");
    const secondLaneStyles = getComputedStyle(secondLane);
    expect(secondLaneStyles.position).toBe("absolute");
    expect(secondLaneStyles.left).toBe("100%");
    expect(secondLaneStyles.top).toBe("0px");
    expect(secondLaneStyles.width).toBe("2.25rem");
    expect(secondLaneStyles.height).toBe("100%");
    expect(secondLaneStyles.pointerEvents).toBe("auto");
    expect(secondLaneStyles.zIndex).toBe("0");

    const secondEllipsis = secondItem.querySelector<HTMLButtonElement>('[data-docsera-accordion-control="menu"]');
    const secondAdd = secondItem.querySelector<HTMLButtonElement>('[data-docsera-accordion-control="add"]');
    const secondMenu = getAccordionItemMenuElement(editor, "accordion-item-plan");
    if (!(secondEllipsis instanceof HTMLButtonElement) || !(secondAdd instanceof HTMLButtonElement) || !(secondMenu instanceof HTMLDivElement)) {
      throw new Error("Expected the last accordion item's controls.");
    }
    expect(secondAdd).toHaveStyle({ zIndex: "1" });

    const secondEllipsisIcon = secondEllipsis.querySelector("svg");
    const secondAddIcon = secondAdd.querySelector("svg");
    if (!(secondEllipsisIcon instanceof SVGElement) || !(secondAddIcon instanceof SVGElement)) {
      throw new Error("Expected the accordion control icons.");
    }

    expect(secondMenu).toHaveClass("docsera-compact-menu");
    expect(secondEllipsis).not.toHaveTextContent("⋯");
    expect(secondAdd).not.toHaveTextContent("+");
    expect(secondEllipsisIcon).toHaveAttribute("aria-hidden", "true");
    expect(secondEllipsisIcon).toHaveAttribute("width", "14");
    expect(secondEllipsisIcon).toHaveAttribute("height", "14");
    expect(secondAddIcon).toHaveAttribute("aria-hidden", "true");
    expect(secondAddIcon).toHaveAttribute("width", "14");
    expect(secondAddIcon).toHaveAttribute("height", "14");
    expect(secondMenu).toHaveAttribute("hidden");
    const secondDeleteItem = secondMenu.querySelector<HTMLElement>('[role="menuitem"]');
    if (!(secondDeleteItem instanceof HTMLElement)) {
      throw new Error("Expected the hidden delete menu item.");
    }
    expect(secondDeleteItem).toHaveClass("docsera-block-menu__item", "docsera-block-menu__item--destructive");
    expect(secondDeleteItem).toHaveAttribute("aria-label", "Delete item");
    const secondDeleteIcon = secondDeleteItem.querySelector<HTMLElement>(".docsera-block-menu__icon");
    const secondDeleteLabel = secondDeleteItem.querySelector<HTMLElement>(".docsera-block-menu__label");
    if (!(secondDeleteIcon instanceof HTMLElement) || !(secondDeleteLabel instanceof HTMLElement)) {
      throw new Error("Expected the destructive delete menu item icon and label structure.");
    }
    expect(secondDeleteIcon.querySelector("svg")).toHaveAttribute("width", "15");
    expect(secondDeleteIcon.querySelector("svg")).toHaveAttribute("height", "15");
    expect(secondDeleteLabel).toHaveTextContent("Delete item");
  });

  it("keeps the item menu hidden until opened, closes it again, and still deletes accordion items while keeping the last item protected", async () => {
    const initial = createAccordionDocument();
    const { editorReady, onSaveDraft } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const secondItem = getAccordionItemElement(editor, "accordion-item-plan");
    const secondMenu = getAccordionItemMenuElement(editor, "accordion-item-plan");
    if (!(secondItem instanceof HTMLElement)) {
      throw new Error("Expected the second accordion item.");
    }
    if (!(secondMenu instanceof HTMLDivElement)) {
      throw new Error("Expected the second accordion menu.");
    }

    const secondEllipsis = secondItem.querySelector<HTMLButtonElement>('[data-docsera-accordion-control="menu"]');
    if (!(secondEllipsis instanceof HTMLButtonElement)) {
      throw new Error("Expected the second accordion ellipsis button.");
    }
    const secondToggle = secondItem.querySelector<HTMLButtonElement>('[data-docsera-accordion-control="toggle"]');
    if (!(secondToggle instanceof HTMLButtonElement)) {
      throw new Error("Expected the second accordion disclosure button.");
    }
    const secondToggleIcon = secondToggle.querySelector("svg");
    if (!(secondToggleIcon instanceof SVGElement)) {
      throw new Error("Expected the second accordion disclosure icon.");
    }

    expect(within(secondItem).queryByRole("menu", { name: "Accordion item actions: Plan" })).toBeNull();
    expect(secondToggle).not.toHaveTextContent("▸");
    expect(secondToggleIcon).toHaveAttribute("aria-hidden", "true");
    expect(secondToggleIcon).toHaveAttribute("width", "18");
    expect(secondToggleIcon).toHaveAttribute("height", "18");
    expect(secondToggleIcon).toHaveAttribute("stroke-width", "2.2");
    expect(secondMenu).toHaveAttribute("hidden");
    expect(secondMenu).not.toBeVisible();

    fireEvent.focusIn(secondItem);
    fireEvent.click(secondEllipsis);

    const menu = await screen.findByRole("menu", { name: "Accordion item actions: Plan" });
    expect(getMenuItemNames(menu)).toEqual(["Delete item"]);

    fireEvent.click(secondEllipsis);

    await waitFor(() => {
      expect(getAccordionItemMenuElement(editor, "accordion-item-plan")).toHaveAttribute("hidden");
    });
    expect(screen.queryByRole("menu", { name: "Accordion item actions: Plan" })).toBeNull();

    fireEvent.click(secondEllipsis);

    const reopenedMenu = await screen.findByRole("menu", { name: "Accordion item actions: Plan" });
    expect(reopenedMenu).not.toHaveAttribute("hidden");
    expect(getMenuItemNames(reopenedMenu)).toEqual(["Delete item"]);

    fireEvent.click(within(reopenedMenu).getByRole("menuitem", { name: "Delete item" }));

    await waitFor(() => {
      expect(editor.getJSON().content?.[0]?.content).toHaveLength(1);
    });

    const remainingItem = getAccordionItemElement(editor, "accordion-item-overview");
    if (!(remainingItem instanceof HTMLElement)) {
      throw new Error("Expected the remaining accordion item.");
    }

    const remainingMenuButton = remainingItem.querySelector<HTMLButtonElement>('[data-docsera-accordion-control="menu"]');
    if (!(remainingMenuButton instanceof HTMLButtonElement)) {
      throw new Error("Expected the remaining accordion menu button.");
    }
    fireEvent.focusIn(remainingItem);
    fireEvent.click(remainingMenuButton);

    const remainingMenu = await screen.findByRole("menu", { name: "Accordion item actions: Overview" });
    expect(getAccordionItemMenuElement(editor, "accordion-item-overview")).not.toHaveAttribute("hidden");
    const remainingDeleteItem = within(remainingMenu).getByRole("menuitem", { name: "Delete item" });
    expect(remainingDeleteItem).toBeDisabled();
    expect(remainingDeleteItem).toHaveClass("docsera-block-menu__item", "docsera-block-menu__item--destructive");

    await runAutosave();
    await waitFor(() => {
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
    });

    await act(async () => {
      editor.commands.undo();
    });

    await waitFor(() => {
      expect(editor.getJSON()).toEqual(initial);
    });
  });

  it("keeps accordion disclosure transient, single-open, and zero-open without JSON, autosave, or undo mutation", async () => {
    const initial = createAccordionDocument();
    const { editorReady, onSaveDraft } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const initialJson = editor.getJSON();
    const initialUndoDepth = undoDepth(editor.state);
    const firstItem = getAccordionItemElement(editor, "accordion-item-overview");
    const secondItem = getAccordionItemElement(editor, "accordion-item-plan");
    if (!(firstItem instanceof HTMLElement) || !(secondItem instanceof HTMLElement)) {
      throw new Error("Expected both accordion items.");
    }

    const firstToggle = within(firstItem).getByRole("button", { name: "Expand accordion item: Overview" });
    const secondToggle = within(secondItem).getByRole("button", { name: "Expand accordion item: Plan" });

    expect(firstItem).toHaveAttribute("data-docsera-accordion-open", "false");
    expect(secondItem).toHaveAttribute("data-docsera-accordion-open", "false");

    fireEvent.click(firstToggle);
    await waitFor(() => {
      expect(firstItem).toHaveAttribute("data-docsera-accordion-open", "true");
      expect(secondItem).toHaveAttribute("data-docsera-accordion-open", "false");
    });
    expect(editor.getJSON()).toEqual(initialJson);
    expect(undoDepth(editor.state)).toBe(initialUndoDepth);

    fireEvent.click(secondToggle);
    await waitFor(() => {
      expect(firstItem).toHaveAttribute("data-docsera-accordion-open", "false");
      expect(secondItem).toHaveAttribute("data-docsera-accordion-open", "true");
    });
    expect(editor.getJSON()).toEqual(initialJson);
    expect(undoDepth(editor.state)).toBe(initialUndoDepth);

    fireEvent.click(secondToggle);
    await waitFor(() => {
      expect(firstItem).toHaveAttribute("data-docsera-accordion-open", "false");
      expect(secondItem).toHaveAttribute("data-docsera-accordion-open", "false");
    });
    expect(editor.getJSON()).toEqual(initialJson);
    expect(undoDepth(editor.state)).toBe(initialUndoDepth);

    await runAutosave();
    expect(onSaveDraft).not.toHaveBeenCalled();
  });

  it("opens accordion items when the selection enters their title or body without mutating the document", async () => {
    const initial = createAccordionDocument();
    const { editorReady, onSaveDraft } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const initialJson = editor.getJSON();
    const initialUndoDepth = undoDepth(editor.state);
    const overviewItem = getAccordionItemElement(editor, "accordion-item-overview");
    const planItem = getAccordionItemElement(editor, "accordion-item-plan");
    if (!(overviewItem instanceof HTMLElement) || !(planItem instanceof HTMLElement)) {
      throw new Error("Expected both accordion items to be rendered.");
    }
    const overview = getAccordionItemSelectionPositions(editor, "accordion-item-overview");
    const plan = getAccordionItemSelectionPositions(editor, "accordion-item-plan");

    await act(async () => {
      editor.commands.setTextSelection(plan.titleSelectionPosition);
    });

    expect(getAccordionOpenItemId(editor.state, "accordion-actions")).toBe("accordion-item-plan");
    expect(planItem).toHaveAttribute("data-docsera-accordion-open", "true");
    expect(overviewItem).toHaveAttribute("data-docsera-accordion-open", "false");
    expect(editor.getJSON()).toEqual(initialJson);
    expect(undoDepth(editor.state)).toBe(initialUndoDepth);

    await act(async () => {
      editor.commands.setTextSelection(plan.bodySelectionPosition);
    });

    expect(getAccordionOpenItemId(editor.state, "accordion-actions")).toBe("accordion-item-plan");
    expect(planItem).toHaveAttribute("data-docsera-accordion-open", "true");
    expect(overviewItem).toHaveAttribute("data-docsera-accordion-open", "false");
    expect(editor.getJSON()).toEqual(initialJson);
    expect(undoDepth(editor.state)).toBe(initialUndoDepth);

    await act(async () => {
      editor.commands.setTextSelection(overview.bodySelectionPosition);
    });

    expect(getAccordionOpenItemId(editor.state, "accordion-actions")).toBe("accordion-item-overview");
    expect(overviewItem).toHaveAttribute("data-docsera-accordion-open", "true");
    expect(planItem).toHaveAttribute("data-docsera-accordion-open", "false");
    expect(editor.getJSON()).toEqual(initialJson);
    expect(undoDepth(editor.state)).toBe(initialUndoDepth);

    await runAutosave();
    expect(onSaveDraft).not.toHaveBeenCalled();
  });

  it("preserves nested TipTap Tab behavior inside accordion content", async () => {
    const initial = createAccordionTaskListDocument();
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const selectionPosition = getTextSelectionPosition(editor, "Second task");

    await act(async () => {
      editor.commands.setTextSelection(selectionPosition);
      editor.commands.focus("end", { scrollIntoView: false });
    });

    fireEvent.keyDown(editor.view.dom, { key: "Tab", code: "Tab" });

    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [
        {
          type: "accordion",
          attrs: {
            accordionId: "accordion-task-list"
          },
          content: [
            {
              type: "accordionItem",
              attrs: {
                accordionItemId: "accordion-item-task-list"
              },
              content: [
                {
                  type: "accordionTitle",
                  content: [{ type: "text", text: "Tasks" }]
                },
                {
                  type: "accordionContent",
                  content: [
                    {
                      type: "taskList",
                      content: [
                        {
                          type: "taskItem",
                          content: [
                            {
                              type: "paragraph",
                              content: [{ type: "text", text: "First task" }]
                            },
                            {
                              type: "taskList",
                              content: [
                                {
                                  type: "taskItem",
                                  content: [
                                    {
                                      type: "paragraph",
                                      content: [{ type: "text", text: "Second task" }]
                                    }
                                  ]
                                }
                              ]
                            }
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    });
  });

  it("regenerates accordion identities when pasted from serialized clipboard HTML", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const sourceDocument: DocseraTiptapDocument = {
      type: "doc",
      content: [
        {
          type: "accordion",
          attrs: {
            accordionId: "accordion-copy-source"
          },
          content: [
            {
              type: "accordionItem",
              attrs: {
                accordionItemId: "accordion-item-copy-source-1"
              },
              content: [
                {
                  type: "accordionTitle",
                  content: [{ type: "text", text: "Copied overview" }]
                },
                {
                  type: "accordionContent",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Copied body" }]
                    }
                  ]
                }
              ]
            },
            {
              type: "accordionItem",
              attrs: {
                accordionItemId: "accordion-item-copy-source-2"
              },
              content: [
                {
                  type: "accordionTitle",
                  content: [{ type: "text", text: "Copied plan" }]
                },
                {
                  type: "accordionContent",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Second body" }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
    const pastedHtml = serializeClipboardHtmlForDocument(editor, sourceDocument);
    const sourceAccordion = sourceDocument.content?.[0] as JSONContent | undefined;
    const sourceAccordionId = (sourceAccordion?.attrs as { accordionId?: string } | undefined)?.accordionId;
    const sourceItemIds = ((sourceAccordion?.content ?? []) as JSONContent[]).map(
      (item) => (item.attrs as { accordionItemId?: string } | undefined)?.accordionItemId ?? ""
    );

    await pasteIntoEditor(editor, pastedHtml);

    const pastedAccordion = findAccordionNodeByFirstTitle(editor.getJSON().content, "Copied overview");
    if (!pastedAccordion) {
      throw new Error("Expected the pasted accordion to be present in the document.");
    }

    const pastedAccordionId = (pastedAccordion.attrs as { accordionId?: string }).accordionId;
    expect(pastedAccordionId).toMatch(/^accordion-/);
    expect(pastedAccordionId).not.toBe(sourceAccordionId);
    expect((pastedAccordion.content?.[0]?.attrs as { accordionItemId?: string }).accordionItemId).toMatch(/^accordion-item-/);
    expect((pastedAccordion.content?.[1]?.attrs as { accordionItemId?: string }).accordionItemId).toMatch(/^accordion-item-/);
    expect((pastedAccordion.content?.[0]?.attrs as { accordionItemId?: string }).accordionItemId).not.toBe(sourceItemIds[0]);
    expect((pastedAccordion.content?.[1]?.attrs as { accordionItemId?: string }).accordionItemId).not.toBe(sourceItemIds[1]);
    expect(sourceAccordionId).toBe("accordion-copy-source");
    expect(sourceItemIds).toEqual(["accordion-item-copy-source-1", "accordion-item-copy-source-2"]);
    expect(pastedAccordion).toMatchObject({
      type: "accordion",
      content: [
        {
          type: "accordionItem",
          content: [
            {
              type: "accordionTitle",
              content: [{ type: "text", text: "Copied overview" }]
            },
            {
              type: "accordionContent",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Copied body" }]
                }
              ]
            }
          ]
        },
        {
          type: "accordionItem",
          content: [
            {
              type: "accordionTitle",
              content: [{ type: "text", text: "Copied plan" }]
            },
            {
              type: "accordionContent",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Second body" }]
                }
              ]
            }
          ]
        }
      ]
    });
  });

  it("preserves accordion identities for active in-editor move drags", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const sourceDocument: DocseraTiptapDocument = {
      type: "doc",
      content: [
        {
          type: "accordion",
          attrs: {
            accordionId: "accordion-drag-source"
          },
          content: [
            {
              type: "accordionItem",
              attrs: {
                accordionItemId: "accordion-item-drag-source-1"
              },
              content: [
                {
                  type: "accordionTitle",
                  content: [{ type: "text", text: "Dragged overview" }]
                },
                {
                  type: "accordionContent",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Dragged body" }] }]
                }
              ]
            }
          ]
        }
      ]
    };
    const sourceSlice = createAccordionClipboardSlice(editor, sourceDocument);

    const transformedMoveSlice = transformAccordionPastedSliceIdentities(sourceSlice, {
      dragging: { move: true }
    });
    const transformedCopySlice = transformAccordionPastedSliceIdentities(sourceSlice, {
      dragging: { move: false }
    });

    expect(transformedMoveSlice).toBe(sourceSlice);
    expect(transformedMoveSlice.content.toJSON()).toEqual(sourceSlice.content.toJSON());
    expect(transformedCopySlice).not.toBe(sourceSlice);

    const movedAccordion = transformedMoveSlice.content.firstChild?.toJSON() as JSONContent | undefined;
    const copiedAccordion = transformedCopySlice.content.firstChild?.toJSON() as JSONContent | undefined;
    expect((movedAccordion?.attrs as { accordionId?: string } | undefined)?.accordionId).toBe("accordion-drag-source");
    expect(
      (((movedAccordion?.content ?? []) as JSONContent[])[0]?.attrs as { accordionItemId?: string } | undefined)?.accordionItemId
    ).toBe("accordion-item-drag-source-1");
    expect((copiedAccordion?.attrs as { accordionId?: string } | undefined)?.accordionId).toMatch(/^accordion-/);
    expect((copiedAccordion?.attrs as { accordionId?: string } | undefined)?.accordionId).not.toBe("accordion-drag-source");
    expect(
      (((copiedAccordion?.content ?? []) as JSONContent[])[0]?.attrs as { accordionItemId?: string } | undefined)?.accordionItemId
    ).toMatch(/^accordion-item-/);
    expect(
      (((copiedAccordion?.content ?? []) as JSONContent[])[0]?.attrs as { accordionItemId?: string } | undefined)?.accordionItemId
    ).not.toBe("accordion-item-drag-source-1");
  });

  it("preserves surrounding content and multiple accordions when pasted from serialized clipboard HTML", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const sourceDocument: DocseraTiptapDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Lead paragraph" }]
        },
        {
          type: "accordion",
          attrs: {
            accordionId: "accordion-copy-source-1"
          },
          content: [
            {
              type: "accordionItem",
              attrs: {
                accordionItemId: "accordion-item-copy-source-1"
              },
              content: [
                {
                  type: "accordionTitle",
                  content: [{ type: "text", text: "Copied overview" }]
                },
                {
                  type: "accordionContent",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Copied body" }] }]
                }
              ]
            },
            {
              type: "accordionItem",
              attrs: {
                accordionItemId: "accordion-item-copy-source-2"
              },
              content: [
                {
                  type: "accordionTitle",
                  content: [{ type: "text", text: "Copied plan" }]
                },
                {
                  type: "accordionContent",
                  content: [{ type: "paragraph", content: [{ type: "text", text: "Second body" }] }]
                }
              ]
            }
          ]
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Middle paragraph" }]
        },
        {
          type: "accordion",
          attrs: {
            accordionId: "accordion-copy-source-2"
          },
          content: [
            {
              type: "accordionItem",
              attrs: {
                accordionItemId: "accordion-item-copy-source-3"
              },
              content: [
                {
                  type: "accordionTitle",
                  content: [{ type: "text", text: "Copied appendix" }]
                },
                {
                  type: "accordionContent",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Appendix body" }]
                    },
                    {
                      type: "blockquote",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Nested quote" }]
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
          type: "paragraph",
          content: [{ type: "text", text: "Tail paragraph" }]
        }
      ]
    };
    const pastedHtml = serializeClipboardHtmlForDocument(editor, sourceDocument);
    const sourceTopLevelNodes = (sourceDocument.content ?? []) as JSONContent[];
    const sourceAccordionNodes: JSONContent[] = sourceTopLevelNodes.filter((node) => node.type === "accordion");
    const sourceAccordionIds = sourceAccordionNodes.map(
      (node) => (node.attrs as { accordionId?: string } | undefined)?.accordionId ?? ""
    );
    const sourceItemIds = sourceAccordionNodes
      .flatMap((node) =>
        ((node.content ?? []) as JSONContent[]).map(
          (item) => (item.attrs as { accordionItemId?: string } | undefined)?.accordionItemId ?? ""
        )
      );

    await pasteIntoEditor(editor, pastedHtml);

    const topLevelContent: JSONContent[] = ((editor.getJSON().content ?? []) as JSONContent[]).filter(
      (node) => !isEmptyParagraphNode(node)
    );
    const leadIndex = topLevelContent.findIndex((node) => node.type === "paragraph" && readJsonNodeText(node).trim() === "Lead paragraph");
    const firstAccordion = findAccordionNodeByFirstTitle(topLevelContent, "Copied overview");
    const middleIndex = topLevelContent.findIndex((node) => node.type === "paragraph" && readJsonNodeText(node).trim() === "Middle paragraph");
    const secondAccordion = findAccordionNodeByFirstTitle(topLevelContent, "Copied appendix");
    const tailIndex = topLevelContent.findIndex((node) => node.type === "paragraph" && readJsonNodeText(node).trim() === "Tail paragraph");

    if (leadIndex < 0 || middleIndex < 0 || tailIndex < 0 || !firstAccordion || !secondAccordion) {
      throw new Error("Expected all pasted landmarks to be present in the document.");
    }

    const firstResolvedAccordion: JSONContent = firstAccordion;
    const secondResolvedAccordion: JSONContent = secondAccordion;
    const firstAccordionIndex = topLevelContent.indexOf(firstResolvedAccordion);
    const secondAccordionIndex = topLevelContent.indexOf(secondResolvedAccordion);
    expect(leadIndex).toBeLessThan(firstAccordionIndex);
    expect(firstAccordionIndex).toBeLessThan(middleIndex);
    expect(middleIndex).toBeLessThan(secondAccordionIndex);
    expect(secondAccordionIndex).toBeLessThan(tailIndex);

    const leadParagraph = topLevelContent[leadIndex];
    const middleParagraph = topLevelContent[middleIndex];
    const tailParagraph = topLevelContent[tailIndex];
    expect(leadParagraph).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "Lead paragraph" }]
    });
    expect(middleParagraph).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "Middle paragraph" }]
    });
    expect(tailParagraph).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "Tail paragraph" }]
    });

    expect((firstAccordion.attrs as { accordionId?: string }).accordionId).toMatch(/^accordion-/);
    expect((firstAccordion.attrs as { accordionId?: string }).accordionId).not.toBe(sourceAccordionIds[0]);
    expect((secondAccordion.attrs as { accordionId?: string }).accordionId).toMatch(/^accordion-/);
    expect((secondAccordion.attrs as { accordionId?: string }).accordionId).not.toBe(sourceAccordionIds[1]);

    const firstAccordionItems = (firstAccordion.content ?? []) as JSONContent[];
    const secondAccordionItems = (secondAccordion.content ?? []) as JSONContent[];
    expect(firstAccordionItems).toHaveLength(2);
    expect(secondAccordionItems).toHaveLength(1);

    expect((firstAccordionItems[0]?.attrs as { accordionItemId?: string }).accordionItemId).toMatch(/^accordion-item-/);
    expect((firstAccordionItems[1]?.attrs as { accordionItemId?: string }).accordionItemId).toMatch(/^accordion-item-/);
    expect((secondAccordionItems[0]?.attrs as { accordionItemId?: string }).accordionItemId).toMatch(/^accordion-item-/);
    expect((firstAccordionItems[0]?.attrs as { accordionItemId?: string }).accordionItemId).not.toBe(sourceItemIds[0]);
    expect((firstAccordionItems[1]?.attrs as { accordionItemId?: string }).accordionItemId).not.toBe(sourceItemIds[1]);
    expect((secondAccordionItems[0]?.attrs as { accordionItemId?: string }).accordionItemId).not.toBe(sourceItemIds[2]);
    expect(sourceAccordionIds).toEqual(["accordion-copy-source-1", "accordion-copy-source-2"]);
    expect(sourceItemIds).toEqual([
      "accordion-item-copy-source-1",
      "accordion-item-copy-source-2",
      "accordion-item-copy-source-3"
    ]);

    expect(firstAccordion).toMatchObject({
      type: "accordion",
      content: [
        {
          type: "accordionItem",
          content: [
            {
              type: "accordionTitle",
              content: [{ type: "text", text: "Copied overview" }]
            },
            {
              type: "accordionContent",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Copied body" }] }]
            }
          ]
        },
        {
          type: "accordionItem",
          content: [
            {
              type: "accordionTitle",
              content: [{ type: "text", text: "Copied plan" }]
            },
            {
              type: "accordionContent",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Second body" }] }]
            }
          ]
        }
      ]
    });

    expect(secondAccordion).toMatchObject({
      type: "accordion",
      content: [
        {
          type: "accordionItem",
          content: [
            {
              type: "accordionTitle",
              content: [{ type: "text", text: "Copied appendix" }]
            },
            {
              type: "accordionContent",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Appendix body" }]
                },
                {
                  type: "blockquote",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Nested quote" }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    });
  });

  it("selects the complete accordion block through the handle and anchors the menu to the gutter controls", async () => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createAccordionDocument())
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const { geometry, handle, menu } = await openAccordionBlockMenu(editor);

    const selectedBlock = getSelectedBlockElement(editor);
    expect(selectedBlock).toBe(handle.ownerDocument.querySelector("[data-docsera-accordion='true']"));
    expect(selectedBlock).toHaveAttribute("data-docsera-block-selected", "true");

    const handleBox = readInlineBox(handle);
    const menuBox = readInlineBox(menu);
    expect(menuBox.top).toBeGreaterThanOrEqual(handleBox.top);
    expect(menuBox.top).toBeLessThan(180);

    geometry.restore();
  });

  it("duplicates a complete accordion with preserved content and fresh accordion identities", async () => {
    const initial = createAccordionDocument();
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const { geometry, menu } = await openAccordionBlockMenu(editor);

    expect(getMenuItemNames(menu)).toEqual(["Duplicate", "Delete"]);
    fireEvent.click(within(menu).getByRole("menuitem", { name: "Duplicate" }));

    await waitFor(() => {
      expect(editor.getJSON().content).toHaveLength(2);
    });

    const content = editor.getJSON().content as JSONContent[];
    const [sourceAccordion, duplicateAccordion] = content;
    expect(sourceAccordion).toBeDefined();
    expect(duplicateAccordion).toBeDefined();
    expect(sourceAccordion?.type).toBe("accordion");
    expect(duplicateAccordion?.type).toBe("accordion");
    expect((duplicateAccordion?.attrs as { accordionId?: string }).accordionId).not.toBe(
      (sourceAccordion?.attrs as { accordionId?: string }).accordionId
    );

    const sourceItems = ((sourceAccordion?.content ?? []) as JSONContent[]).map((item) => ({
      accordionItemId: (item.attrs as { accordionItemId?: string }).accordionItemId,
      body: JSON.stringify(item.content?.[1] ?? null),
      title: JSON.stringify(item.content?.[0] ?? null)
    }));
    const duplicateItems = ((duplicateAccordion?.content ?? []) as JSONContent[]).map((item) => ({
      accordionItemId: (item.attrs as { accordionItemId?: string }).accordionItemId,
      body: JSON.stringify(item.content?.[1] ?? null),
      title: JSON.stringify(item.content?.[0] ?? null)
    }));

    expect(duplicateItems.map(({ body, title }) => ({ body, title }))).toEqual(
      sourceItems.map(({ body, title }) => ({ body, title }))
    );
    const sourceItemIds = sourceItems.map(({ accordionItemId }) => accordionItemId);
    const duplicateItemIds = duplicateItems.map(({ accordionItemId }) => accordionItemId);
    expect(duplicateItemIds).toHaveLength(sourceItemIds.length);
    for (let index = 0; index < sourceItemIds.length; index += 1) {
      expect(duplicateItemIds[index]).not.toBe(sourceItemIds[index]);
    }

    geometry.restore();
  });
});
