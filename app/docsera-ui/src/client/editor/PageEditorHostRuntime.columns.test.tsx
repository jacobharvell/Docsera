import "@testing-library/jest-dom/vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Editor, JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { describe, expect, it, vi } from "vitest";
import type { DocseraTiptapDocument } from "../../shared/editor/document";
import { createCanonicalImageDocseraDocumentEnvelope } from "../../shared/editor/imageFixtures";
import {
  createEnvelopeFromDocument,
  createSuccessPage,
  openSlashQuery,
  openSlashQueryAtSelection,
  renderRuntime
} from "./PageEditorHostRuntime.testUtils";
import { createMediaBlob } from "./PageEditorHostRuntime.image.testUtils";

function getOptionNames(container: HTMLElement): string[] {
  return within(container)
    .getAllByRole("option")
    .map((option) => option.getAttribute("aria-label") ?? option.textContent?.trim() ?? "");
}

function createColumnsDocument(columnCount: 2 | 3 | 4): DocseraTiptapDocument {
  return {
    type: "doc",
    content: [
      {
        type: "columns",
        content: Array.from({ length: columnCount }, () => ({
          type: "column",
          content: [{ type: "paragraph" }]
        }))
      }
    ]
  };
}

function createQuickAddColumnsDocument(columnCount: 2 | 3 | 4): DocseraTiptapDocument {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph"
      },
      {
        type: "columns",
        content: Array.from({ length: columnCount }, () => ({
          type: "column",
          content: [{ type: "paragraph" }]
        }))
      } as JSONContent
    ]
  };
}

function createColumnsDocumentWithFirstColumnText(columnCount: 2 | 3 | 4, text: string): DocseraTiptapDocument {
  return {
    type: "doc",
    content: [
      {
        type: "columns",
        content: [
          {
            type: "column",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text }]
              }
            ]
          },
          ...Array.from({ length: columnCount - 1 }, () => ({
            type: "column",
            content: [{ type: "paragraph" }]
          }))
        ]
      }
    ]
  };
}

function createColumnsDocumentWithNestedBlockquote(columnCount: 2 | 3 | 4): DocseraTiptapDocument {
  return {
    type: "doc",
    content: [
      {
        type: "columns",
        content: [
          {
            type: "column",
            content: [
              {
                type: "blockquote",
                content: [{ type: "paragraph" }]
              }
            ]
          },
          ...Array.from({ length: columnCount - 1 }, () => ({
            type: "column",
            content: [{ type: "paragraph" }]
          }))
        ]
      }
    ]
  };
}

function createColumnsDocumentWithImageAndEmptyParagraph(columnCount: 2 | 3 | 4): DocseraTiptapDocument {
  const imageEnvelope = createCanonicalImageDocseraDocumentEnvelope();
  const imageDocument = imageEnvelope.document;
  if (!imageDocument) {
    throw new Error("Expected the canonical image document to contain a document node.");
  }

  const imageNode = imageDocument.content?.[0];
  if (!imageNode) {
    throw new Error("Expected the canonical image document to contain an image node.");
  }

  return {
    type: "doc",
    content: [
      {
        type: "columns",
        content: [
          {
            type: "column",
            content: [imageNode as JSONContent, { type: "paragraph" }]
          },
          ...Array.from({ length: columnCount - 1 }, () => ({
            type: "column",
            content: [{ type: "paragraph" }]
          }))
        ]
      }
    ]
  };
}

function getColumnHelperParagraphs(editor: Editor): HTMLParagraphElement[] {
  return Array.from(
    editor.view.dom.querySelectorAll(
      ".docsera-editor-columns__column > p[data-docsera-empty-paragraph='true'][data-placeholder='Type here...']"
    )
  ).filter((node): node is HTMLParagraphElement => node instanceof HTMLParagraphElement);
}

function expectColumnsDocumentWithSingleFirstColumnBlock(
  editor: Editor,
  firstColumnBlock: Record<string, unknown>
): void {
  expect(editor.getJSON()).toMatchObject({
    type: "doc",
    content: [
      {
        type: "columns",
        content: [
          {
            type: "column",
            content: [firstColumnBlock]
          },
          {
            type: "column",
            content: [{ type: "paragraph" }]
          }
        ]
      }
    ]
  });
}

function createAccordionBodyParagraphDocument(): DocseraTiptapDocument {
  return {
    type: "doc",
    content: [
      {
        type: "accordion",
        attrs: {
          accordionId: "accordion-columns-body"
        },
        content: [
          {
            type: "accordionItem",
            attrs: {
              accordionItemId: "accordion-item-columns-body"
            },
            content: [
              {
                type: "accordionTitle",
                content: [{ type: "text", text: "Accordion" }]
              },
              {
                type: "accordionContent",
                content: [{ type: "paragraph" }]
              }
            ]
          }
        ]
      }
    ]
  };
}

function createAccordionWithColumnsDocument(columnCount: 2 | 3 | 4): DocseraTiptapDocument {
  return {
    type: "doc",
    content: [
      {
        type: "accordion",
        attrs: {
          accordionId: "accordion-columns-body"
        },
        content: [
          {
            type: "accordionItem",
            attrs: {
              accordionItemId: "accordion-item-columns-body"
            },
            content: [
              {
                type: "accordionTitle",
                content: [{ type: "text", text: "Accordion" }]
              },
              {
                type: "accordionContent",
                content: [
                  {
                    type: "columns",
                    content: Array.from({ length: columnCount }, () => ({
                      type: "column",
                      content: [{ type: "paragraph" }]
                    }))
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

function createTopLevelColumnDocument(): DocseraTiptapDocument {
  return {
    type: "doc",
    content: [
      {
        type: "columns",
        content: [
          {
            type: "column",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Inside column" }]
              }
            ]
          },
          {
            type: "column",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Second column" }]
              }
            ]
          }
        ]
      }
    ]
  };
}

function getFirstTextblockPositionInsideNode(editor: Editor, ancestorTypeName: string): number {
  let position: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (position !== null || !(node.isTextblock || node.type.name === ancestorTypeName)) {
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
  const surfaceRect = new DOMRect(72, 36, 760, 540);
  const proseMirrorRect = new DOMRect(132, 52, 620, 420);
  const restore = [
    mockElementRect(surface, surfaceRect),
    mockElementRect(proseMirror, proseMirrorRect),
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

function mountOverlayRootInShadowDom(overlayRoot: HTMLElement) {
  const shadowHost = document.createElement("div");
  document.body.append(shadowHost);
  const shadowRoot = shadowHost.attachShadow({ mode: "open" });
  shadowRoot.append(overlayRoot);

  return {
    shadowHost,
    shadowRoot
  };
}

async function dispatchOwnerPointerEvent(
  ownerDocument: Document,
  target: EventTarget,
  type: "pointerdown" | "pointermove" | "pointerup",
  point: { clientX: number; clientY: number },
  options: {
    button?: number;
    buttons?: number;
    composedPath?: Array<EventTarget | null | undefined>;
    pointerId?: number;
    pointerType?: string;
  } = {}
): Promise<boolean> {
  const eventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    button: options.button ?? 0,
    buttons: options.buttons ?? (type === "pointerdown" ? 1 : 0),
    clientX: point.clientX,
    clientY: point.clientY,
    pointerId: options.pointerId ?? 1,
    pointerType: options.pointerType ?? "mouse"
  };
  const event =
    typeof window.PointerEvent === "function"
      ? new window.PointerEvent(type, eventInit)
      : new window.MouseEvent(type, eventInit);
  Object.defineProperties(event, {
    clientX: {
      configurable: true,
      value: point.clientX
    },
    clientY: {
      configurable: true,
      value: point.clientY
    },
    button: {
      configurable: true,
      value: eventInit.button
    },
    buttons: {
      configurable: true,
      value: eventInit.buttons
    },
    pointerId: {
      configurable: true,
      value: eventInit.pointerId
    },
    pointerType: {
      configurable: true,
      value: eventInit.pointerType
    },
    composedPath: {
      configurable: true,
      value: () => options.composedPath?.filter(Boolean) ?? [target]
    }
  });

  await act(async () => {
    const dispatchTarget =
      target instanceof Node && target.isConnected && target.ownerDocument === ownerDocument ? target : ownerDocument;
    dispatchTarget.dispatchEvent(event);
  });

  return event.defaultPrevented;
}

async function dispatchOwnerPointerMove(
  ownerDocument: Document,
  target: EventTarget,
  point: { clientX: number; clientY: number },
  options: { composedPath?: Array<EventTarget | null | undefined> } = {}
) {
  await dispatchOwnerPointerEvent(ownerDocument, target, "pointermove", point, options);
}

async function openQuickAdd(editor: Editor, pointer: { clientX: number; clientY: number }, buttonName: string) {
  const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
  if (!(surface instanceof HTMLElement)) {
    throw new Error("Expected the editor surface to be available.");
  }

  await dispatchOwnerPointerMove(surface.ownerDocument, surface, pointer);
  fireEvent.click(await screen.findByRole("button", { name: buttonName }));
}

describe("PageEditorHostRuntime columns corrections", () => {
  it.each<[2 | 3 | 4]>([[2], [3], [4]])(
    "creates a canonical %s-column structure through Slash with empty paragraph sentinels and first-column focus",
    async (columnCount) => {
      const label = `${columnCount} columns`;
      const expectedDocument = createColumnsDocument(columnCount);
      const initialDocument = {
        type: "doc",
        content: [{ type: "paragraph" }]
      };
      const { editorReady } = renderRuntime({
        initialEnvelope: createEnvelopeFromDocument(initialDocument as DocseraTiptapDocument)
      });

      await waitFor(() => {
        expect(editorReady[0]).toBeDefined();
      });

      const editor = editorReady[0];
      const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);

      await openSlashQuery(editor, "columns");
      fireEvent.click(await screen.findByRole("option", { name: label }));

      await waitFor(() => {
        expect(editor.getJSON()).toEqual(expectedDocument);
      });
      expect(editor.state.selection.from).toBe(getFirstTextblockPositionInsideNode(editor, "columns") + 1);
      expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
      const columns = editor.view.dom.querySelector(".docsera-editor-columns");
      expect(columns).not.toBeNull();
      expect((columns as HTMLElement).getAttribute("style")).toContain(`--docsera-columns-count: ${columnCount}`);
      geometrySpy.mockRestore();
    }
  );

  it("activates the canonical 2-column slash command through Enter inside a shadow-root overlay", async () => {
    const expectedDocument = createColumnsDocument(2);
    const initialDocument = {
      type: "doc",
      content: [{ type: "paragraph" }]
    };
    const { editorReady, overlayRoot } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initialDocument as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const { shadowHost } = mountOverlayRootInShadowDom(overlayRoot);
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);

    try {
      await openSlashQuery(editor, "columns");
      expect(await within(overlayRoot).findByRole("option", { name: "2 columns" })).toBeInTheDocument();

      fireEvent.keyDown(editor.view.dom, { key: "Enter" });

      await waitFor(() => {
        expect(editor.getJSON()).toEqual(expectedDocument);
      });
      expect(editor.state.selection.from).toBe(getFirstTextblockPositionInsideNode(editor, "columns") + 1);
      expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    } finally {
      geometrySpy.mockRestore();
      shadowHost.remove();
    }
  });

  it("keeps the canonical 2-column slash option owned on pointerdown inside a shadow-root overlay and executes on click", async () => {
    const expectedDocument = createColumnsDocument(2);
    const initialDocument = {
      type: "doc",
      content: [{ type: "paragraph" }]
    };
    const { editorReady, overlayRoot } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initialDocument as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const { shadowHost, shadowRoot } = mountOverlayRootInShadowDom(overlayRoot);
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    const capturedPointerdowns: Array<{
      path: EventTarget[];
      target: EventTarget | null;
    }> = [];
    const pointerdownCaptureListener = (event: Event) => {
      capturedPointerdowns.push({
        path: event.composedPath().filter((entry): entry is EventTarget => entry instanceof EventTarget),
        target: event.target
      });
    };
    const ownerDocument = overlayRoot.ownerDocument;

    ownerDocument.addEventListener("pointerdown", pointerdownCaptureListener, true);

    try {
      await openSlashQuery(editor, "columns");

      const option = await within(overlayRoot).findByRole("option", { name: "2 columns" });
      const optionRect = option.getBoundingClientRect();
      await act(async () => {
        await dispatchOwnerPointerEvent(
          ownerDocument,
          option,
          "pointerdown",
          {
            clientX: optionRect.left + 8,
            clientY: optionRect.top + 8
          },
          {
            button: 0,
            buttons: 1,
            composedPath: [option, overlayRoot, shadowRoot, shadowHost, ownerDocument]
          }
        );
      });

      expect(capturedPointerdowns).toHaveLength(1);
      expect(capturedPointerdowns[0]?.target).toBe(shadowHost);
      expect(capturedPointerdowns[0]?.path[0]).toBe(option);
      expect(capturedPointerdowns[0]?.path).toEqual(
        expect.arrayContaining([option, overlayRoot, shadowRoot, shadowHost, ownerDocument])
      );
      expect(within(overlayRoot).getByRole("option", { name: "2 columns" })).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(option);
      });

      await waitFor(() => {
        expect(editor.getJSON()).toEqual(expectedDocument);
      });
      expect(editor.state.selection.from).toBe(getFirstTextblockPositionInsideNode(editor, "columns") + 1);
      expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    } finally {
      ownerDocument.removeEventListener("pointerdown", pointerdownCaptureListener, true);
      geometrySpy.mockRestore();
      shadowHost.remove();
    }
  });

  it.each<[2 | 3 | 4]>([[2], [3], [4]])(
    "creates a canonical %s-column structure through Quick Add with a leading paragraph sentinel and first-column focus",
    async (columnCount) => {
      const label = `${columnCount} columns`;
      const expectedDocument = createQuickAddColumnsDocument(columnCount);
      const initialDocument = {
        type: "doc",
        content: [{ type: "paragraph" }]
      };
      const { editorReady } = renderRuntime({
        initialEnvelope: createEnvelopeFromDocument(initialDocument as DocseraTiptapDocument)
      });

      await waitFor(() => {
        expect(editorReady[0]).toBeDefined();
      });

      const editor = editorReady[0];
      const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);

      await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
      fireEvent.click(await screen.findByRole("option", { name: label }));

      await waitFor(() => {
        expect(editor.getJSON()).toEqual(expectedDocument);
      });
      expect(editor.state.selection.from).toBe(getFirstTextblockPositionInsideNode(editor, "columns") + 1);
      expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
      const columns = editor.view.dom.querySelector(".docsera-editor-columns");
      expect(columns).not.toBeNull();
      expect((columns as HTMLElement).getAttribute("style")).toContain(`--docsera-columns-count: ${columnCount}`);

      geometrySpy.mockRestore();
    }
  );

  it.each<[2 | 3 | 4]>([[2], [3], [4]])(
    "shows and restores the empty-column helper text for %s columns without changing canonical JSON",
    async (columnCount) => {
      const label = `${columnCount} columns`;
      const expectedDocument = createColumnsDocument(columnCount);
      const typedDocument = createColumnsDocumentWithFirstColumnText(columnCount, "Alpha");
      const initialDocument = {
        type: "doc",
        content: [{ type: "paragraph" }]
      };
      const { editorReady } = renderRuntime({
        initialEnvelope: createEnvelopeFromDocument(initialDocument as DocseraTiptapDocument)
      });

      await waitFor(() => {
        expect(editorReady[0]).toBeDefined();
      });

      const editor = editorReady[0];
      const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);

      await openSlashQuery(editor, "columns");
      fireEvent.click(await screen.findByRole("option", { name: label }));

      await waitFor(() => {
        expect(editor.getJSON()).toEqual(expectedDocument);
      });

      expect(getColumnHelperParagraphs(editor)).toHaveLength(columnCount);
      expect(editor.getJSON()).toEqual(expectedDocument);

      await act(async () => {
        editor.commands.focus(undefined, { scrollIntoView: false });
        editor.commands.insertContent("Alpha");
      });

      await waitFor(() => {
        expect(getColumnHelperParagraphs(editor)).toHaveLength(columnCount - 1);
        expect(editor.getJSON()).toEqual(typedDocument);
      });

      const insertedTextEnd = editor.state.selection.from;
      await act(async () => {
        editor.commands.setTextSelection({
          from: insertedTextEnd - "Alpha".length,
          to: insertedTextEnd
        });
        editor.commands.deleteSelection();
      });

      await waitFor(() => {
        expect(getColumnHelperParagraphs(editor)).toHaveLength(columnCount);
        expect(editor.getJSON()).toEqual(expectedDocument);
      });

      geometrySpy.mockRestore();
    }
  );

  it.each<[2 | 3 | 4]>([[2], [3], [4]])(
    "keeps the empty-column helper hidden when %s columns contain other content alongside an empty paragraph",
    async (columnCount) => {
      const expectedDocument = createColumnsDocumentWithImageAndEmptyParagraph(columnCount);
      const mediaAdapter = {
        list: vi.fn(async () => []),
        load: vi.fn(async ({ mediaId }: { mediaId: string }) =>
          mediaId === "workspace-media-001" ? createMediaBlob(mediaId) : null
        ),
        upload: vi.fn(async () => {
          throw new Error("Unexpected image upload request in the columns helper test.");
        })
      };
      const view = renderRuntime({
        initialEnvelope: createEnvelopeFromDocument(expectedDocument),
        mediaAdapter
      });

      await waitFor(() => {
        expect(view.editorReady[0]).toBeDefined();
      });

      const editor = view.editorReady[0];
      const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);

      await waitFor(() => {
        expect(editor.getJSON()).toEqual(expectedDocument);
      });

      expect(getColumnHelperParagraphs(editor)).toHaveLength(columnCount - 1);

      const firstColumnParagraph = editor.view.dom.querySelector(
        ".docsera-editor-columns__column:first-child > p"
      );
      expect(firstColumnParagraph).not.toBeNull();
      expect(firstColumnParagraph).not.toHaveAttribute("data-placeholder", "Type here...");

      geometrySpy.mockRestore();
      view.unmount();
    }
  );

  it.each<[2 | 3 | 4]>([[2], [3], [4]])(
    "keeps nested empty blockquotes in %s columns on their blockquote placeholder instead of the column helper",
    async (columnCount) => {
      const initialDocument = createColumnsDocumentWithNestedBlockquote(columnCount);
      const { editorReady } = renderRuntime({
        initialEnvelope: createEnvelopeFromDocument(initialDocument)
      });

      await waitFor(() => {
        expect(editorReady[0]).toBeDefined();
      });

      const editor = editorReady[0];

      await waitFor(() => {
        expect(getColumnHelperParagraphs(editor)).toHaveLength(columnCount - 1);
      });

      const blockquoteParagraph = editor.view.dom.querySelector(
        ".docsera-editor-columns__column blockquote > p"
      );

      expect(blockquoteParagraph).not.toBeNull();
      expect(blockquoteParagraph).toHaveAttribute("data-placeholder", "Enter a quote");
      expect(blockquoteParagraph).not.toHaveAttribute("data-placeholder", "Type here...");
    }
  );

  it.each([
    {
      expectedFirstColumnBlock: {
        attrs: {
          accordionId: expect.stringMatching(/^accordion-/)
        },
        content: [
          {
            attrs: {
              accordionItemId: expect.stringMatching(/^accordion-item-/)
            },
            content: [
              {
                type: "accordionTitle"
              },
              {
                content: [{ type: "paragraph" }],
                type: "accordionContent"
              }
            ],
            type: "accordionItem"
          }
        ],
        type: "accordion"
      },
      label: "Accordion",
      query: "accordion"
    },
    {
      expectedFirstColumnBlock: {
        type: "horizontalRule"
      },
      label: "Horizontal Rule",
      query: "rule"
    },
    {
      expectedFirstColumnBlock: {
        type: "table"
      },
      label: "Table",
      query: "table"
    }
  ] as const)(
    "consumes the empty column paragraph when inserting %s through Slash",
    async ({ expectedFirstColumnBlock, label, query }) => {
      const { editorReady } = renderRuntime({
        initialEnvelope: createEnvelopeFromDocument(createColumnsDocument(2) as DocseraTiptapDocument)
      });

      await waitFor(() => {
        expect(editorReady[0]).toBeDefined();
      });

      const editor = editorReady[0];
      const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 132)]);
      const warnSpy = query === "rule" ? vi.spyOn(console, "warn").mockImplementation(() => undefined) : null;

      try {
        await act(async () => {
          editor.commands.setTextSelection(getFirstTextblockPositionInsideNode(editor, "column") + 1);
        });

        await openSlashQueryAtSelection(editor, query);
        fireEvent.click(await screen.findByRole("option", { name: label }));

        await waitFor(() => {
          expectColumnsDocumentWithSingleFirstColumnBlock(editor, expectedFirstColumnBlock);
        });

        if (query === "rule") {
          expect(editor.state.selection).toBeInstanceOf(NodeSelection);
          expect((editor.state.selection as NodeSelection).node.type.name).toBe("horizontalRule");
          expect(
            warnSpy?.mock.calls.some((call) =>
              call.some(
                (entry) =>
                  typeof entry === "string" &&
                  entry.includes("TextSelection endpoint not pointing into a node with inline content")
              )
            )
          ).toBe(false);
        }
      } finally {
        warnSpy?.mockRestore();
        geometrySpy.mockRestore();
      }
    }
  );

  it("consumes the empty column paragraph when inserting an Image through Slash and the picker", async () => {
    const mediaAdapter = {
      list: vi.fn(async () => []),
      load: vi.fn(async ({ mediaId }: { mediaId: string }) => (mediaId === "workspace-media-999" ? createMediaBlob(mediaId) : null)),
      upload: vi.fn(async () => ({
        contentType: "image/png",
        fileName: "column-image.png",
        mediaId: "workspace-media-999",
        sizeBytes: 1024
      }))
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createColumnsDocument(2) as DocseraTiptapDocument),
      mediaAdapter
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 132)]);

    try {
      await act(async () => {
        editor.commands.setTextSelection(getFirstTextblockPositionInsideNode(editor, "column") + 1);
      });

      await openSlashQueryAtSelection(editor, "image");
      fireEvent.click(await screen.findByRole("option", { name: "Image" }));

      const dialog = await screen.findByRole("dialog", { name: "Select image" });
      fireEvent.click(within(dialog).getByRole("button", { name: "Upload image" }));

      const fileInput = dialog.querySelector("input[type='file']");
      if (!(fileInput instanceof HTMLInputElement)) {
        throw new Error("Expected the image picker file input to be available.");
      }

      fireEvent.change(fileInput, {
        target: {
          files: [new File([new Uint8Array([1, 2, 3])], "column-image.png", { type: "image/png" })]
        }
      });

      fireEvent.click(within(dialog).getByRole("button", { name: "Upload image" }));

      await waitFor(() => {
        expectColumnsDocumentWithSingleFirstColumnBlock(editor, {
          attrs: {
            align: "left",
            alt: "",
            caption: "",
            darkMediaId: null,
            frame: true,
            mediaId: "workspace-media-999",
            widthPct: 100
          },
          type: "image"
        });
      });
    } finally {
      geometrySpy.mockRestore();
    }
  });

  it("offers Columns inside an Accordion body and replaces only the local slash owner paragraph", async () => {
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createAccordionBodyParagraphDocument() as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 180)]);

    try {
      await act(async () => {
        editor.commands.setTextSelection(getFirstTextblockPositionInsideNode(editor, "accordionContent") + 1);
      });
      fireEvent.keyDown(editor.view.dom, { key: "/" });

      const slashMenu = await screen.findByRole("listbox", { name: "Slash command menu" });
      expect(getOptionNames(slashMenu)).toEqual(expect.arrayContaining(["2 columns", "3 columns", "4 columns"]));
      expect(getOptionNames(slashMenu)).not.toContain("Accordion");

      fireEvent.click(await screen.findByRole("option", { name: "2 columns" }));

      await waitFor(() => {
        expect(editor.getJSON()).toEqual(createAccordionWithColumnsDocument(2));
      });
      expect(editor.state.selection.from).toBe(getFirstTextblockPositionInsideNode(editor, "columns") + 1);
      expect(editor.state.selection.$from.parent.type.name).toBe("paragraph");
    } finally {
      geometrySpy.mockRestore();
    }
  });

  it.each([
    {
      expectedAccordionVisible: true,
      initialEnvelope: createEnvelopeFromDocument(createTopLevelColumnDocument() as DocseraTiptapDocument),
      label: "top-level column"
    },
    {
      expectedAccordionVisible: false,
      initialEnvelope: createEnvelopeFromDocument(createAccordionWithColumnsDocument(2) as DocseraTiptapDocument),
      label: "accordion > columns > column"
    }
  ])("suppresses Columns beneath column ancestry for %s", async ({ expectedAccordionVisible, initialEnvelope }) => {
    const { editorReady } = renderRuntime({
      initialEnvelope
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];

    await act(async () => {
      editor.commands.setTextSelection(getFirstTextblockPositionInsideNode(editor, "column") + 1);
    });
    fireEvent.keyDown(editor.view.dom, { key: "/" });

    const slashMenu = await screen.findByRole("listbox", { name: "Slash command menu" });
    const optionNames = getOptionNames(slashMenu);
    expect(optionNames).not.toContain("2 columns");
    expect(optionNames).not.toContain("3 columns");
    expect(optionNames).not.toContain("4 columns");
    if (expectedAccordionVisible) {
      expect(optionNames).toContain("Accordion");
    } else {
      expect(optionNames).not.toContain("Accordion");
    }
  });

  it("exposes Columns as the top-level hover label and keeps nested Columns from getting their own gutter", async () => {
    const topLevelColumns = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createColumnsDocument(2) as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(topLevelColumns.editorReady[0]).toBeDefined();
    });

    const topLevelEditor = topLevelColumns.editorReady[0];
    const topLevelGeometry = mockTopLevelBlockGeometry(topLevelEditor, [new DOMRect(132, 52, 620, 132)]);
    const topLevelSurface = topLevelEditor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(topLevelSurface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await dispatchOwnerPointerMove(topLevelSurface.ownerDocument, topLevelSurface, { clientX: 120, clientY: 64 });
    expect(await screen.findByRole("button", { name: "Add block after Columns" })).toBeInTheDocument();

    topLevelGeometry.mockRestore();
    topLevelColumns.unmount();

    const nestedColumns = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createAccordionWithColumnsDocument(2) as DocseraTiptapDocument)
    });

    await waitFor(() => {
      expect(nestedColumns.editorReady[0]).toBeDefined();
    });

    const nestedEditor = nestedColumns.editorReady[0];
    const nestedGeometry = mockTopLevelBlockGeometry(nestedEditor, [new DOMRect(132, 52, 620, 180)]);
    const nestedSurface = nestedEditor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(nestedSurface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    const nestedColumnsElement = nestedEditor.view.dom.querySelector(".docsera-editor-columns");
    if (!(nestedColumnsElement instanceof HTMLElement)) {
      throw new Error("Expected the nested columns element to be available.");
    }

    const restoreNestedColumnsRect = mockElementRect(nestedColumnsElement, new DOMRect(164, 138, 556, 88));
    await dispatchOwnerPointerMove(nestedSurface.ownerDocument, nestedColumnsElement, { clientX: 220, clientY: 160 });
    expect(await screen.findByRole("button", { name: "Add block after Accordion" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add block after Columns" })).toBeNull();

    restoreNestedColumnsRect();
    nestedGeometry.mockRestore();
    nestedColumns.unmount();
  });

  it("renders editor-owned Columns presentation with equal-width tracks and a 920px stack rule", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/editor/PageEditorHostRuntime.tsx`,
      "utf8"
    );

    expect(source).toMatch(/\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-columns \{\s*margin:\s*1rem 0;\s*display:\s*grid;\s*gap:\s*24px;\s*align-items:\s*start;\s*grid-template-columns:\s*repeat\(var\(--docsera-columns-count\), minmax\(0, 1fr\)\);/s);
    expect(source).toMatch(
      /\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-columns__column \{\s*min-width:\s*0;\s*display:\s*grid;\s*gap:\s*12px;\s*overflow-wrap:\s*anywhere;/s
    );
    expect(source).toMatch(/@media \(max-width:\s*920px\) \{\s*\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-columns \{\s*grid-template-columns:\s*1fr;/s);
  });

  it("keeps pre-mount hover geometry from reading editor.view.dom", async () => {
    await vi.resetModules();
    const { render, waitFor: waitForLocal } = await import("@testing-library/react");
    const hoverTarget = {
      accessibleLabel: "Columns",
      blockIndex: 0
    };
    let viewReady = false;
    let mounted = false;
    let editorProxy: Editor | null = null;
    let hoverTargetInjected = false;

    vi.doMock("react", async () => {
      const actual = await vi.importActual<typeof import("react")>("react");
      const realUseState = actual.useState;

      return {
        ...actual,
        useState(initialState: unknown) {
          if (!hoverTargetInjected && initialState === null) {
            hoverTargetInjected = true;
            return realUseState(hoverTarget as never);
          }

          return realUseState(initialState as never);
        }
      };
    });

    vi.doMock("@tiptap/react", async () => {
      const actual = await vi.importActual<typeof import("@tiptap/react")>("@tiptap/react");

      return {
        ...actual,
        EditorContent: function MockEditorContent() {
          return <div data-testid="mock-editor-content" />;
        },
        useEditor(config: Parameters<typeof actual.useEditor>[0]) {
          const editor = actual.useEditor({
            ...config,
            onCreate: (payload: { editor: Editor }) => {
              viewReady = true;
              if (editorProxy) {
                payload.editor = editorProxy;
              }
              config.onCreate?.(payload);
            }
          });

          if (editor && !editorProxy) {
            editorProxy = new Proxy(editor, {
              get(target, property, receiver) {
                if (property === "view" && !viewReady) {
                  throw new Error("view unavailable before onCreate");
                }

                return Reflect.get(target, property, receiver);
              }
            });
          }

          return editorProxy ?? editor;
        }
      };
    });

    try {
      const { PageEditorHostRuntime } = await import("./PageEditorHostRuntime");
      const overlayRoot = document.createElement("div");
      overlayRoot.dataset.docseraEditorRuntimeOverlayRoot = "true";
      document.body.append(overlayRoot);

      const view = render(
        <PageEditorHostRuntime
          canEdit={true}
          initialEnvelope={createEnvelopeFromDocument(createColumnsDocument(2) as DocseraTiptapDocument)}
          initialRevision={0}
          onAccessLost={vi.fn()}
          onEditorReady={() => {
            mounted = true;
          }}
          onOutlineChange={vi.fn()}
          onSaveDraft={vi.fn(async () => ({
            state: "succeeded" as const,
            page: createSuccessPage(1)
          }))}
          onStatusChange={vi.fn()}
          overlayRoot={overlayRoot}
          pageSysId="page-001"
          theme="light"
        />
      );

      await waitForLocal(() => {
        expect(mounted).toBe(true);
      });

      expect(screen.queryByTestId("mock-editor-content")).toBeInTheDocument();
      view.unmount();
    } finally {
      vi.doUnmock("@tiptap/react");
      vi.doUnmock("react");
      await vi.resetModules();
    }
  });
});
