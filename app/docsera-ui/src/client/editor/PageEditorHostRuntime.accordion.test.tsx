/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Editor, JSONContent } from "@tiptap/core";
import { undoDepth } from "@tiptap/pm/history";
import type { DocseraTiptapDocument } from "../../shared/editor/document";
import { createEnvelopeFromDocument, renderRuntime, runAutosave } from "./PageEditorHostRuntime.testUtils";
import { describe, expect, it } from "vitest";

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

function getAccordionTitleParagraph(editor: Editor): HTMLParagraphElement | null {
  const title = editor.view.dom.querySelector("[data-docsera-accordion-title='true']");
  return title instanceof HTMLParagraphElement ? title : null;
}

function getAccordionBodyParagraphs(editor: Editor): HTMLParagraphElement[] {
  return Array.from(editor.view.dom.querySelectorAll("[data-docsera-accordion-content='true'] > p")).filter(
    (element): element is HTMLParagraphElement => element instanceof HTMLParagraphElement
  );
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
