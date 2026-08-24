/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Editor, JSONContent } from "@tiptap/core";
import type { DocseraTiptapDocument } from "../../shared/editor/document";
import { createEmptyDocseraDocumentEnvelope } from "../../shared/editor/document";
import { describe, expect, it, vi } from "vitest";
import { PageEditorHostRuntime } from "./PageEditorHostRuntime";
import type { EditorMediaAdapter, EditorMediaReference } from "./contracts";
import {
  createEnvelopeFromDocument,
  openSlashQuery,
  openSlashQueryAtSelection,
  renderRuntime,
  runAutosave,
} from "./PageEditorHostRuntime.testUtils";
import {
  createMediaBlob,
  dispatchOwnerPointerEvent,
  dispatchOwnerPointerMove,
  expectQuietLoadingMediaPlaceholderContract,
  expectStandardImageFieldContract,
  expectStandardImageMediaValueContract,
  getButtonNames,
  getEditorPaneElement,
  getMenuItemNames,
  mockElementRect,
  mockTopLevelBlockGeometry,
  MUTED_SURFACE_BACKGROUND_STYLE,
  openImageOptions
} from "./PageEditorHostRuntime.image.testUtils";
import { createDeferred } from "../app/appTestSupport";

function createCanonicalDefaultTableNode() {
  return {
    type: "table",
    content: Array.from({ length: 3 }, () => ({
      type: "tableRow",
      content: Array.from({ length: 3 }, () => ({
        type: "tableCell",
        attrs: {
          colspan: 1,
          rowspan: 1,
          colwidth: null
        },
        content: [{ type: "paragraph" }]
      }))
    }))
  };
}

function createNestedTableDocumentForImageTest() {
  return {
    type: "doc",
    content: [
      {
        type: "table",
        content: [
          {
            type: "tableRow",
            content: [
              {
                type: "tableCell",
                attrs: {
                  colspan: 1,
                  rowspan: 1,
                  colwidth: null
                },
                content: [createCanonicalDefaultTableNode()]
              }
            ]
          }
        ]
      }
    ]
  };
}

function getFirstTextblockPositionInsideNestedTable(editor: Editor): number {
  let position: number | null = null;
  editor.state.doc.descendants((node, pos) => {
    if (position !== null || !node.isTextblock) {
      return position === null;
    }

    const $pos = editor.state.doc.resolve(pos);
    let tableDepth = 0;
    for (let depth = $pos.depth; depth > 0; depth -= 1) {
      if ($pos.node(depth).type.name === "table") {
        tableDepth += 1;
      }
    }

    if (tableDepth >= 2) {
      position = pos;
      return false;
    }

    return true;
  });

  if (position === null) {
    throw new Error("Expected a textblock inside a nested table cell.");
  }

  return position;
}

async function openQuickAdd(editor: Editor, pointer: { clientX: number; clientY: number }, buttonName: string) {
  const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
  if (!(surface instanceof HTMLElement)) {
    throw new Error("Expected the editor surface to be available.");
  }

  await dispatchOwnerPointerMove(surface.ownerDocument, surface, pointer);
  fireEvent.click(await screen.findByRole("button", { name: buttonName }));
}

describe("PageEditorHostRuntime", () => {
  it("opens the image picker from slash commands and inserts a canonical image block", async () => {
    const mediaAdapter: EditorMediaAdapter = {
      list: vi.fn(async () => [
        {
          contentType: "image/png",
          fileName: "diagram.png",
          mediaId: "workspace-media-001",
          sizeBytes: 2048
        }
      ]),
      load: vi.fn(async ({ mediaId }) => (mediaId === "workspace-media-001" ? createMediaBlob(mediaId) : null)),
      upload: vi.fn(async () => ({
        contentType: "image/png",
        fileName: "diagram.png",
        mediaId: "workspace-media-001",
        sizeBytes: 2048
      }))
    };

    const { editorReady } = renderRuntime({ mediaAdapter });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor, "image");

    const slashMenu = await screen.findByRole("listbox", { name: "Slash command menu" });
    fireEvent.click(within(slashMenu).getByRole("option", { name: "Image" }));

    const dialog = await screen.findByRole("dialog", { name: "Select image" });
    expect(mediaAdapter.list).toHaveBeenCalledTimes(1);

    fireEvent.click(within(dialog).getByRole("button", { name: /diagram\.png/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Select image" })).toBeNull();
    });

    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "image",
      attrs: {
        mediaId: "workspace-media-001"
      }
    });
  });


  it("renders picker thumbnails as actual images with the expected fit contract", async () => {
    const mediaAdapter: EditorMediaAdapter = {
      list: vi.fn(async () => [
        {
          contentType: "image/png",
          fileName: "diagram.png",
          mediaId: "workspace-media-001",
          sizeBytes: 2048
        }
      ]),
      load: vi.fn(async ({ mediaId }) => (mediaId === "workspace-media-001" ? createMediaBlob(mediaId) : null)),
      upload: vi.fn(async () => ({
        contentType: "image/png",
        fileName: "diagram.png",
        mediaId: "workspace-media-001",
        sizeBytes: 2048
      }))
    };
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:thumbnail");

    const { editorReady } = renderRuntime({ mediaAdapter });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor, "image");

    const slashMenu = await screen.findByRole("listbox", { name: "Slash command menu" });
    fireEvent.click(within(slashMenu).getByRole("option", { name: "Image" }));

    const dialog = await screen.findByRole("dialog", { name: "Select image" });
    let thumbnailImage: HTMLImageElement | null = null;
    await waitFor(() => {
      const element = dialog.querySelector("img.docsera-image-picker__tile-image");
      if (!element) {
        throw new Error("Expected the picker thumbnail to render as an actual image element.");
      }

      thumbnailImage = element as HTMLImageElement;
    });

    if (!thumbnailImage) {
      throw new Error("Expected the picker thumbnail image to be captured.");
    }

    expect(thumbnailImage).toHaveAttribute("src", "blob:thumbnail");
    expect(thumbnailImage).toHaveClass("docsera-image-picker__tile-image");
    createObjectUrlSpy.mockRestore();
  });


  it("loads edit-runtime image media IDs through the adapter and keeps canonical JSON URL-free", async () => {
    const mediaAdapter: EditorMediaAdapter = {
      list: vi.fn(async () => []),
      load: vi.fn(async ({ mediaId }) => (mediaId === "workspace-media-001" ? createMediaBlob(mediaId) : null)),
      upload: vi.fn(async () => ({
        contentType: "image/png",
        fileName: "diagram.png",
        mediaId: "workspace-media-001",
        sizeBytes: 2048
      }))
    };
    const initialEnvelope = createEnvelopeFromDocument(
      {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              mediaId: "workspace-media-001",
              darkMediaId: null,
              alt: "",
              caption: "",
              frame: true,
              align: "left",
              widthPct: 100
            }
          }
        ]
      } as DocseraTiptapDocument
    );

    const { editorReady } = renderRuntime({ initialEnvelope, mediaAdapter });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await waitFor(() => {
      const image = editor.view.dom.querySelector("img");
      if (!(image instanceof HTMLImageElement)) {
        throw new Error("Expected the runtime image node to render an image element.");
      }

      expect(image.getAttribute("src")).toBe("blob:mock");
    });
    const figure = editor.view.dom.querySelector("figure");
    if (!(figure instanceof HTMLElement)) {
      throw new Error("Expected the runtime image node view to render a figure element.");
    }

    expect(figure).toHaveClass("docsera-editor-image");
    expect(figure).not.toHaveClass("docsera-main__editor-image");
    expect(figure).toHaveAttribute("data-docsera-image-align", "left");
    expect(figure).toHaveAttribute("data-docsera-image-frame", "true");
    expect(figure).toHaveAttribute("data-docsera-image-width-pct", "100");
    expect(mediaAdapter.load).toHaveBeenCalledWith({ mediaId: "workspace-media-001", signal: expect.any(AbortSignal) });
    expect(JSON.stringify(editor.getJSON())).not.toContain("src");
    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "image",
      attrs: {
        mediaId: "workspace-media-001"
      }
    });
  });


  it("shows a loading media label first, then the resolved filename, without rendering the raw media id", async () => {
    const listDeferred = createDeferred<EditorMediaReference[]>();
    const mediaAdapter: EditorMediaAdapter = {
      list: vi.fn(async () => listDeferred.promise),
      load: vi.fn(async ({ mediaId }) => (mediaId === "workspace-media-base" ? createMediaBlob(mediaId) : null)),
      upload: vi.fn(async ({ file }) => ({
        contentType: file.type,
        fileName: file.name,
        mediaId: "workspace-media-upload",
        sizeBytes: file.size
      }))
    };
    const initial = {
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            mediaId: "workspace-media-base",
            darkMediaId: null,
            alt: "Original alt",
            caption: "Original caption",
            frame: true,
            align: "left",
            widthPct: 100
          }
        }
      ]
    };

    const { editorReady, unmount } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument),
      mediaAdapter
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);

    const surface = getEditorPaneElement(editor);
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await dispatchOwnerPointerMove(surface.ownerDocument, surface, { clientX: 720, clientY: 60 });
    fireEvent.click(await screen.findByRole("button", { name: "Image options" }));
    const panel = await screen.findByRole("dialog", { name: "Image Options" });
    const panelStyles = getComputedStyle(panel);
    const panelBackgroundColor = panelStyles.backgroundColor;
    const altInput = within(panel).getByLabelText("Alt text");
    const captionInput = within(panel).getByLabelText("Caption");
    const lightMediaValue = within(panel).getByDisplayValue("Loading…");
    const darkMediaValue = within(panel).getByDisplayValue("Not configured");

    expect(lightMediaValue).toHaveValue("Loading…");
    expect(darkMediaValue).toHaveValue("Not configured");
    expect(panel).not.toHaveTextContent("workspace-media-base");
    expectStandardImageMediaValueContract(lightMediaValue, MUTED_SURFACE_BACKGROUND_STYLE);
    expectStandardImageMediaValueContract(darkMediaValue, MUTED_SURFACE_BACKGROUND_STYLE);
    expectStandardImageFieldContract(altInput, panelBackgroundColor);
    expectStandardImageFieldContract(captionInput, panelBackgroundColor);

    await act(async () => {
      altInput.focus();
    });
    expect(document.activeElement).toBe(altInput);

    listDeferred.resolve([
      {
        contentType: "image/png",
        fileName: "hero-image.png",
        mediaId: "workspace-media-base",
        sizeBytes: 2048
      }
    ]);

    await act(async () => {
      await listDeferred.promise;
    });

    const resolvedLightMediaValue = await within(panel).findByDisplayValue("hero-image.png");

    expect(panel).not.toHaveTextContent("workspace-media-base");
    expectStandardImageMediaValueContract(resolvedLightMediaValue, MUTED_SURFACE_BACKGROUND_STYLE);
    expectStandardImageMediaValueContract(
      within(panel).getByDisplayValue("Not configured"),
      MUTED_SURFACE_BACKGROUND_STYLE
    );

    geometrySpy.mockRestore();
    unmount();
  });


  it("shows a neutral unavailable label when configured media is missing from the catalog", async () => {
    const mediaAdapter: EditorMediaAdapter = {
      list: vi.fn(async () => []),
      load: vi.fn(async ({ mediaId }) =>
        mediaId === "workspace-media-base" || mediaId === "workspace-media-dark" ? createMediaBlob(mediaId) : null
      ),
      upload: vi.fn(async ({ file }) => ({
        contentType: file.type,
        fileName: file.name,
        mediaId: "workspace-media-upload",
        sizeBytes: file.size
      }))
    };
    const initial = {
      type: "doc",
      content: [
        {
          type: "image",
          attrs: {
            mediaId: "workspace-media-base",
            darkMediaId: "workspace-media-dark",
            alt: "Original alt",
            caption: "Original caption",
            frame: true,
            align: "left",
            widthPct: 100
          }
        }
      ]
    };

    const { editorReady, unmount } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument),
      mediaAdapter
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];

    const figure = await waitFor(() => {
      const element = editor.view.dom.querySelector("figure.docsera-editor-image");
      if (!(element instanceof HTMLElement)) {
        throw new Error("Expected the top-level editor image figure to render.");
      }

      expect(element.querySelector("img")).toBeInstanceOf(HTMLImageElement);
      return element;
    });

    await waitFor(() => {
      const image = figure.querySelector("img");
      if (!(image instanceof HTMLImageElement)) {
        throw new Error("Expected the image figure to finish rendering its media state.");
      }
    });

    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    const surface = editor.view.dom.closest(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to be available.");
    }

    await dispatchOwnerPointerMove(surface.ownerDocument, figure, { clientX: 720, clientY: 60 }, {
      composedPath: [figure, surface, surface.ownerDocument.body]
    });
    const imageOptionsButton = await screen.findByRole("button", { name: "Image options" });
    fireEvent.click(imageOptionsButton);
    const panel = await screen.findByRole("dialog", { name: "Image Options" });

    expect(within(panel).getAllByDisplayValue("Media unavailable")).toHaveLength(2);
    expect(panel).not.toHaveTextContent("workspace-media-base");
    expect(panel).not.toHaveTextContent("workspace-media-dark");

    for (const mediaValue of within(panel).getAllByDisplayValue("Media unavailable")) {
      expectStandardImageMediaValueContract(mediaValue, MUTED_SURFACE_BACKGROUND_STYLE);
    }

    geometrySpy.mockRestore();
    unmount();
  });


  it("updates dark media through Upload and removes the image block without deleting workspace media", async () => {
    const mediaAdapter: EditorMediaAdapter = {
      list: vi.fn(async () => [
        {
          contentType: "image/png",
          fileName: "light.png",
          mediaId: "workspace-media-light",
          sizeBytes: 2048
        },
        {
          contentType: "image/png",
          fileName: "dark.png",
          mediaId: "workspace-media-dark",
          sizeBytes: 2048
        }
      ]),
      load: vi.fn(async ({ mediaId }) =>
        mediaId === "workspace-media-light" || mediaId === "workspace-media-dark" ? createMediaBlob(mediaId) : null
      ),
      upload: vi.fn(async ({ file }) => ({
        contentType: file.type,
        fileName: file.name,
        mediaId: "workspace-media-upload",
        sizeBytes: file.size
      }))
    };
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        },
        {
          type: "image",
          attrs: {
            mediaId: "workspace-media-light",
            darkMediaId: "workspace-media-dark",
            alt: "Architecture diagram",
            caption: "Published in both light and dark modes",
            frame: true,
            align: "center",
            widthPct: 80
          }
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Omega" }]
        }
      ]
    };

    const { editorReady, unmount } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument),
      mediaAdapter
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [
      new DOMRect(132, 52, 620, 28),
      new DOMRect(132, 108, 620, 28),
      new DOMRect(132, 164, 620, 28)
    ]);

    await openImageOptions(editor, { clientX: 720, clientY: 118 });
    const panel = await screen.findByRole("dialog", { name: "Image Options" });
    expect(within(panel).getAllByRole("button", { name: "Upload" })).toHaveLength(2);
    expect(within(panel).queryByRole("button", { name: "Clear" })).toBeNull();
    expect(within(panel).queryByRole("checkbox", { name: "Frame image" })).toBeNull();
    fireEvent.click(within(panel).getAllByRole("button", { name: "Upload" })[1]);
    const darkPicker = await screen.findByRole("dialog", { name: "Select image" });
    fireEvent.click(within(darkPicker).getByRole("button", { name: "dark.png" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Select image" })).toBeNull();
    });
    fireEvent.click(within(panel).getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Image Options" })).toBeNull();
    });

    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        },
        {
          type: "image",
          attrs: {
            mediaId: "workspace-media-light",
            darkMediaId: "workspace-media-dark",
            alt: "Architecture diagram",
            caption: "Published in both light and dark modes",
            frame: true,
            align: "center",
            widthPct: 80
          }
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Omega" }]
        }
      ]
    });

    await openImageOptions(editor, { clientX: 720, clientY: 118 });
    const deletePanel = await screen.findByRole("dialog", { name: "Image Options" });
    fireEvent.click(within(deletePanel).getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Image Options" })).toBeNull();
    });

    expect(editor.getJSON()).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Omega" }]
        }
      ]
    });

    expect(mediaAdapter.upload).not.toHaveBeenCalled();
    geometrySpy.mockRestore();
    unmount();
  });


  it("invalidates a pending image load when the editor is destroyed", async () => {
    const loadDeferred = createDeferred<Blob | null>();
    const mediaAdapter: EditorMediaAdapter = {
      list: vi.fn(async () => []),
      load: vi.fn(async () => loadDeferred.promise),
      upload: vi.fn(async () => ({
        contentType: "image/png",
        fileName: "diagram.png",
        mediaId: "workspace-media-001",
        sizeBytes: 2048
      }))
    };
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:late");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument({
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              mediaId: "workspace-media-001",
              darkMediaId: null,
              alt: "",
              caption: "",
              frame: true,
              align: "left",
              widthPct: 100
            }
          }
        ]
      }),
      mediaAdapter
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    let figure: HTMLElement | null = null;
    await waitFor(() => {
      const element = editor.view.dom.querySelector("figure");
      if (!element) {
        throw new Error("Expected the runtime image node view to render a figure element.");
      }

      figure = element as HTMLElement;
    });

    if (!figure) {
      throw new Error("Expected the runtime image node view figure to be captured.");
    }

    const loadedFigure = figure as HTMLElement;
    const loadingStatus = within(loadedFigure).getByRole("status", { name: "Loading image" });

    expect(loadedFigure).toHaveAttribute("data-docsera-image-frame", "true");
    expect(loadingStatus).toHaveAttribute("aria-busy", "true");
    expect(loadingStatus).not.toHaveTextContent("Media");
    expect(loadingStatus).not.toHaveTextContent("Loading image");
    expectQuietLoadingMediaPlaceholderContract(loadingStatus);

    await act(async () => {
      editor.destroy();
    });

    await act(async () => {
      loadDeferred.resolve(createMediaBlob("workspace-media-001"));
    });

    await waitFor(() => {
      expect(createObjectUrlSpy).not.toHaveBeenCalled();
      expect(loadedFigure.querySelector("img")).toBeNull();
    });

    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(0);
    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
  });


  it("keeps the unframed loading placeholder borderless while the editor image resolves", async () => {
    const loadDeferred = createDeferred<Blob | null>();
    const mediaAdapter: EditorMediaAdapter = {
      list: vi.fn(async () => []),
      load: vi.fn(async () => loadDeferred.promise),
      upload: vi.fn(async () => ({
        contentType: "image/png",
        fileName: "diagram.png",
        mediaId: "workspace-media-001",
        sizeBytes: 2048
      }))
    };
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:unframed-loading");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument({
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              mediaId: "workspace-media-001",
              darkMediaId: null,
              alt: "",
              caption: "",
              frame: false,
              align: "left",
              widthPct: 100
            }
          }
        ]
      }),
      mediaAdapter
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const figure = await waitFor(() => {
      const element = editor.view.dom.querySelector("figure");
      if (!element) {
        throw new Error("Expected the runtime image node view to render a figure element.");
      }

      return element as HTMLElement;
    });

    const loadingStatus = within(figure).getByRole("status", { name: "Loading image" });

    expect(figure).toHaveAttribute("data-docsera-image-frame", "false");
    expect(loadingStatus).toHaveAttribute("aria-busy", "true");
    expect(loadingStatus).not.toHaveTextContent("Media");
    expect(loadingStatus).not.toHaveTextContent("Loading image");
    expectQuietLoadingMediaPlaceholderContract(loadingStatus);

    await act(async () => {
      loadDeferred.resolve(createMediaBlob("workspace-media-001"));
    });

    await waitFor(() => {
      expect(figure.querySelector("img")).toHaveAttribute("src", "blob:unframed-loading");
    });

    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(0);
    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
  });


  it("keeps the picker library region busy without rendering a loading row", async () => {
    const listDeferred = createDeferred<EditorMediaReference[]>();
    const mediaAdapter: EditorMediaAdapter = {
      list: vi.fn(async () => listDeferred.promise),
      load: vi.fn(async ({ mediaId }) =>
        mediaId === "workspace-media-base" || mediaId === "workspace-media-001" ? createMediaBlob(mediaId) : null
      ),
      upload: vi.fn(async () => ({
        contentType: "image/png",
        fileName: "upload.png",
        mediaId: "workspace-media-upload",
        sizeBytes: 1024
      }))
    };

    const { editorReady } = renderRuntime({ mediaAdapter });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor, "image");
    fireEvent.click(await screen.findByRole("option", { name: "Image" }));

    const dialog = await screen.findByRole("dialog", { name: "Select image" });
    const libraryScroll = dialog.querySelector(".docsera-image-picker__library-scroll");
    if (!(libraryScroll instanceof HTMLElement)) {
      throw new Error("Expected the picker library scroll container to be available.");
    }

    expect(libraryScroll).toHaveAttribute("aria-busy", "true");
    expect(dialog).not.toHaveTextContent("Loading the workspace media library...");
    expect(within(dialog).getByRole("button", { name: "Upload image" })).toBeInTheDocument();

    listDeferred.resolve([
      {
        contentType: "image/png",
        fileName: "diagram.png",
        mediaId: "workspace-media-001",
        sizeBytes: 2048
      }
    ]);

    await act(async () => {
      await listDeferred.promise;
    });

    await waitFor(() => {
      expect(libraryScroll).not.toHaveAttribute("aria-busy");
      expect(within(dialog).getByRole("button", { name: "diagram.png" })).toBeInTheDocument();
    });
  });


  it("retries the library load, filters by file name without reordering, and only enters upload after a file is chosen", async () => {
    const mediaAdapter: EditorMediaAdapter = {
      list: vi.fn().mockRejectedValueOnce(new Error("Unable to load the workspace media library.")).mockResolvedValueOnce([
          {
            contentType: "image/jpeg",
            fileName: "gamma.png",
            mediaId: "workspace-media-003",
            sizeBytes: 1024
          },
          {
            contentType: "image/png",
            fileName: "alpha.png",
            mediaId: "workspace-media-001",
            sizeBytes: 1024
          }
        ]),
      load: vi.fn(async ({ mediaId }) =>
        mediaId === "workspace-media-base" ||
        mediaId === "workspace-media-001" ||
        mediaId === "workspace-media-999"
          ? createMediaBlob(mediaId)
          : null
      ),
      upload: vi.fn(async () => ({
        contentType: "image/png",
        fileName: "upload.png",
        mediaId: "workspace-media-004",
        sizeBytes: 1024
      }))
    };

    const { editorReady } = renderRuntime({ mediaAdapter });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor, "image");
    fireEvent.click(await screen.findByRole("option", { name: "Image" }));

    const dialog = await screen.findByRole("dialog", { name: "Select image" });
    await waitFor(() => {
      expect(within(dialog).getByRole("alert")).toHaveTextContent("Unable to load the workspace media library.");
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "Try again" }));
    await waitFor(() => {
      expect(mediaAdapter.list).toHaveBeenCalledTimes(2);
      expect(within(dialog).queryByRole("alert")).toBeNull();
    });

    const search = within(dialog).getByPlaceholderText("Search images");
    fireEvent.change(search, { target: { value: "jpeg" } });
    expect(dialog.querySelector(".docsera-image-picker__tile-name")).toBeNull();
    expect(dialog.querySelector(".docsera-image-picker__tile-details")).toBeNull();

    fireEvent.change(search, { target: { value: "a" } });
    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: "gamma.png" })).toBeInTheDocument();
      expect(within(dialog).getByRole("button", { name: "alpha.png" })).toBeInTheDocument();
      expect(dialog.querySelector(".docsera-image-picker__tile-name")).toBeNull();
      expect(dialog.querySelector(".docsera-image-picker__tile-details")).toBeNull();
    });

    const fileInput = dialog.querySelector("input[type='file']");
    if (!(fileInput instanceof HTMLInputElement)) {
      throw new Error("Expected the picker file input to be available.");
    }

    const clickSpy = vi.spyOn(fileInput, "click");
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload image" }));
    expect(clickSpy).toHaveBeenCalledTimes(1);
    expect(within(dialog).queryByLabelText("Image file name")).toBeNull();

    const selectedFile = new File([new Uint8Array([1, 2, 3])], "alpha.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [selectedFile] } });

    await waitFor(() => {
      expect(within(dialog).getByLabelText("Image file name")).toHaveValue("alpha.png");
      expect(within(dialog).queryByPlaceholderText("Search images")).toBeNull();
    });
  });


  it("preserves upload-state cleanup on replacement and Back, disables chooser actions while uploading, and ignores late upload completions after Back", async () => {
    const uploadDeferred = createDeferred<{
      contentType: string;
      fileName: string;
      mediaId: string;
      sizeBytes: number;
    }>();
    const mediaAdapter: EditorMediaAdapter = {
      list: vi.fn(async () => [
        {
          contentType: "image/png",
          fileName: "source.png",
          mediaId: "workspace-media-001",
          sizeBytes: 1024
        }
      ]),
      load: vi.fn(async ({ mediaId }) => (mediaId === "workspace-media-base" ? createMediaBlob(mediaId) : null)),
      upload: vi.fn(() => uploadDeferred.promise)
    };
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValueOnce("blob:one").mockReturnValueOnce("blob:two");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const { editorReady } = renderRuntime({ mediaAdapter });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor, "image");
    fireEvent.click(await screen.findByRole("option", { name: "Image" }));

    const dialog = await screen.findByRole("dialog", { name: "Select image" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload image" }));

    const fileInput = dialog.querySelector("input[type='file']");
    if (!(fileInput instanceof HTMLInputElement)) {
      throw new Error("Expected the picker file input to be available.");
    }

    const firstFile = new File([new Uint8Array([1, 2, 3])], "first.png", { type: "image/png" });
    const secondFile = new File([new Uint8Array([4, 5, 6])], "second.png", { type: "image/png" });
    fireEvent.change(fileInput, { target: { files: [firstFile] } });

    await waitFor(() => {
      expect(within(dialog).getByLabelText("Image file name")).toHaveValue("first.png");
      expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    });

    fireEvent.change(fileInput, { target: { files: [secondFile] } });

    await waitFor(() => {
      expect(within(dialog).getByLabelText("Image file name")).toHaveValue("second.png");
      expect(createObjectUrlSpy).toHaveBeenCalledTimes(2);
      expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:one");
    });

      fireEvent.click(within(dialog).getByRole("button", { name: "Upload image" }));
    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: "Uploading..." })).toBeDisabled();
    });

      fireEvent.click(within(dialog).getByRole("button", { name: "Go back" }));
      await waitFor(() => {
        expect(within(dialog).getByRole("button", { name: "Upload image" })).toBeInTheDocument();
        expect(within(dialog).queryByLabelText("Image file name")).toBeNull();
      });

    await act(async () => {
      uploadDeferred.resolve({
        contentType: "image/png",
        fileName: "second.png",
        mediaId: "workspace-media-999",
        sizeBytes: 1024
      });
    });

    await waitFor(() => {
      expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:two");
    });
    expect(editor.getJSON()).toEqual({
      type: "doc",
      content: [{ type: "paragraph" }]
    });

    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
  });


  it("restores the library scroll position after Back from upload", async () => {
    const mediaAdapter: EditorMediaAdapter = {
      list: vi.fn(async () =>
        Array.from({ length: 20 }, (_, index) => ({
          contentType: "image/png",
          fileName: `image-${String(index + 1).padStart(2, "0")}.png`,
          mediaId: `workspace-media-${String(index + 1).padStart(3, "0")}`,
          sizeBytes: 1024
        }))
      ),
      load: vi.fn(async ({ mediaId }) =>
        mediaId === "workspace-media-base" ||
        mediaId === "workspace-media-001" ||
        mediaId === "workspace-media-999"
          ? createMediaBlob(mediaId)
          : null
      ),
      upload: vi.fn(async () => ({
        contentType: "image/png",
        fileName: "upload.png",
        mediaId: "workspace-media-upload",
        sizeBytes: 1024
      }))
    };
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:scroll-restore");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const { editorReady } = renderRuntime({ mediaAdapter });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor, "image");
    fireEvent.click(await screen.findByRole("option", { name: "Image" }));

    const dialog = await screen.findByRole("dialog", { name: "Select image" });
    await waitFor(() => {
      expect(dialog.querySelectorAll(".docsera-image-picker__grid-item")).toHaveLength(21);
    });

    const libraryScroll = dialog.querySelector(".docsera-image-picker__library-scroll");
    if (!(libraryScroll instanceof HTMLElement)) {
      throw new Error("Expected the picker library scroll container to be available.");
    }

    libraryScroll.scrollTop = 188;
    expect(libraryScroll.scrollTop).toBe(188);

    fireEvent.click(within(dialog).getByRole("button", { name: "Upload image" }));

    const fileInput = dialog.querySelector("input[type='file']");
    if (!(fileInput instanceof HTMLInputElement)) {
      throw new Error("Expected the picker file input to be available.");
    }

    fireEvent.change(fileInput, {
      target: {
        files: [new File([new Uint8Array([1, 2, 3])], "scroll-restore.png", { type: "image/png" })]
      }
    });

    await waitFor(() => {
      expect(within(dialog).getByLabelText("Image file name")).toHaveValue("scroll-restore.png");
      expect(createObjectUrlSpy).toHaveBeenCalledTimes(2);
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "Go back" }));

    await waitFor(() => {
      expect(within(dialog).getByRole("button", { name: "Upload image" })).toBeInTheDocument();
      const restoredScroll = dialog.querySelector(".docsera-image-picker__library-scroll");
      if (!(restoredScroll instanceof HTMLElement)) {
        throw new Error("Expected the picker library scroll container to be restored.");
      }

      expect(restoredScroll.scrollTop).toBe(188);
    });

    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
  });


  it("surfaces upload validation errors and safe adapter failure messages", async () => {
    const uploadDeferred = createDeferred<{
      contentType: string;
      fileName: string;
      mediaId: string;
      sizeBytes: number;
    }>();
    const mediaAdapter: EditorMediaAdapter = {
      list: vi.fn(async () => []),
      load: vi.fn(async ({ mediaId }) =>
        mediaId === "workspace-media-base" ||
        mediaId === "workspace-media-001" ||
        mediaId === "workspace-media-999"
          ? createMediaBlob(mediaId)
          : null
      ),
      upload: vi.fn(() => uploadDeferred.promise)
    };
    const { editorReady } = renderRuntime({ mediaAdapter });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor, "image");
    fireEvent.click(await screen.findByRole("option", { name: "Image" }));

    const dialog = await screen.findByRole("dialog", { name: "Select image" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Upload image" }));

    const fileInput = dialog.querySelector("input[type='file']");
    if (!(fileInput instanceof HTMLInputElement)) {
      throw new Error("Expected the picker file input to be available.");
    }

    const cases = [
      { file: new File([], "empty.png", { type: "image/png" }), message: "The selected file is empty." },
      {
        file: new File([new Uint8Array(10 * 1024 * 1024 + 1)], "huge.png", { type: "image/png" }),
        message: "The selected file is larger than 10 MB."
      },
      {
        file: new File([new Uint8Array([1])], "note.txt", { type: "text/plain" }),
        message: "The file name must end with a supported image extension."
      },
      {
        file: new File([new Uint8Array([1])], "photo.jpg", { type: "image/png" }),
        message: "The file name extension and selected file type do not match."
      }
    ];

    for (const { file, message } of cases) {
      fireEvent.change(fileInput, { target: { files: [file] } });
      await waitFor(() => {
        expect(within(dialog).getByLabelText("Image file name")).toHaveValue(file.name);
      });

        fireEvent.click(within(dialog).getByRole("button", { name: "Upload image" }));
        await waitFor(() => {
          expect(within(dialog).getByRole("alert")).toHaveTextContent(message);
        });
    }

    fireEvent.change(fileInput, { target: { files: [new File([new Uint8Array([1, 2, 3])], "photo.png", { type: "image/png" })] } });
    await waitFor(() => {
      expect(within(dialog).getByLabelText("Image file name")).toHaveValue("photo.png");
    });

      fireEvent.click(within(dialog).getByRole("button", { name: "Upload image" }));
      await waitFor(() => {
        expect(within(dialog).getByRole("button", { name: "Uploading..." })).toBeDisabled();
      });

    await act(async () => {
      uploadDeferred.reject(new Error("Try again later."));
    });

    await waitFor(() => {
      expect(within(dialog).getByRole("alert")).toHaveTextContent("Try again later.");
    });
  });


  it("keeps Quick Add image insertion in one undo step and persists only canonical media IDs", async () => {
    const initial = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha" }]
        }
      ]
    };
    const mediaAdapter: EditorMediaAdapter = {
      list: vi.fn(async () => [
        {
          contentType: "image/png",
          fileName: "diagram.png",
          mediaId: "workspace-media-001",
          sizeBytes: 2048
        }
      ]),
      load: vi.fn(async ({ mediaId }) => (mediaId === "workspace-media-001" ? createMediaBlob(mediaId) : null)),
      upload: vi.fn(async () => ({
        contentType: "image/png",
        fileName: "diagram.png",
        mediaId: "workspace-media-001",
        sizeBytes: 2048
      }))
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument),
      mediaAdapter
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);

    await openQuickAdd(editor, { clientX: 120, clientY: 64 }, "Add block after Text");
    fireEvent.click(await screen.findByRole("option", { name: "Image" }));

    const dialog = await screen.findByRole("dialog", { name: "Select image" });
    fireEvent.click(within(dialog).getByRole("button", { name: /diagram\.png/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Select image" })).toBeNull();
      expect(editor.getJSON()).toMatchObject({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Alpha" }]
          },
          {
            type: "image",
            attrs: {
              mediaId: "workspace-media-001"
            }
          }
        ]
      });
    });

    expect(JSON.stringify(editor.getJSON())).not.toContain("src");

    await act(async () => {
      editor.commands.undo();
    });

    expect(editor.getJSON()).toEqual(initial);
    geometrySpy.mockRestore();
  });


  it("inserts Slash images into an empty nested table-cell paragraph", async () => {
    const mediaAdapter: EditorMediaAdapter = {
      list: vi.fn(async () => [
        {
          contentType: "image/png",
          fileName: "diagram.png",
          mediaId: "workspace-media-001",
          sizeBytes: 2048
        }
      ]),
      load: vi.fn(async ({ mediaId }) => (mediaId === "workspace-media-001" ? createMediaBlob(mediaId) : null)),
      upload: vi.fn(async () => ({
        contentType: "image/png",
        fileName: "diagram.png",
        mediaId: "workspace-media-001",
        sizeBytes: 2048
      }))
    };
    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(createNestedTableDocumentForImageTest() as DocseraTiptapDocument),
      mediaAdapter
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const nestedTableParagraphPosition = getFirstTextblockPositionInsideNestedTable(editor);

    await act(async () => {
      editor.commands.setTextSelection(nestedTableParagraphPosition + 1);
      editor.commands.focus(undefined, { scrollIntoView: false });
    });

    await openSlashQueryAtSelection(editor);
    fireEvent.click(await screen.findByRole("option", { name: "Image" }));

    const dialog = await screen.findByRole("dialog", { name: "Select image" });
    fireEvent.click(within(dialog).getByRole("button", { name: /diagram\.png/i }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Select image" })).toBeNull();
    });

    let foundImageInsideTableCell = false;
    editor.state.doc.descendants((node, pos) => {
      if (foundImageInsideTableCell || node.type.name !== "image") {
        return !foundImageInsideTableCell;
      }

      const $pos = editor.state.doc.resolve(pos);
      for (let depth = $pos.depth; depth > 0; depth -= 1) {
        const nodeName = $pos.node(depth).type.name;
        if (nodeName === "tableCell" || nodeName === "tableHeader") {
          foundImageInsideTableCell = true;
          break;
        }
      }

      return !foundImageInsideTableCell;
    });

    expect(foundImageInsideTableCell).toBe(true);
    expect(JSON.stringify(editor.getJSON())).not.toContain("src");
  });
});
