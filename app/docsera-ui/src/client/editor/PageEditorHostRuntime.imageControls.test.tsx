/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { Editor, JSONContent } from "@tiptap/core";
import { undoDepth } from "@tiptap/pm/history";
import type { DocseraTiptapDocument } from "../../shared/editor/document";
import { describe, expect, it, vi } from "vitest";
import type { EditorMediaAdapter, EditorMediaReference } from "./contracts";
import {
  createEnvelopeFromDocument,
  renderRuntime,
  runAutosave
} from "./PageEditorHostRuntime.testUtils";
import {
  createMediaBlob,
  dispatchOwnerPointerEvent,
  dispatchOwnerPointerMove,
  getButtonNames,
  getMenuItemNames,
  getRuntimeStyleText,
  mockTopLevelBlockGeometry,
  openImageOptions
} from "./PageEditorHostRuntime.image.testUtils";
import { ImagePickerDialog } from "./ImagePickerDialog";
import { ImageFullscreenViewer } from "../shared/media/ImageFullscreenViewer";
describe("PageEditorHostRuntime", () => {
  it("renders the image hover controls in the accepted order and opens the image viewer from Zoom", async () => {
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
            alt: "",
            caption: "",
            frame: false,
            align: "left",
            widthPct: 100
          }
        }
      ]
    };

    const { editorReady, onSaveDraft } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument),
      mediaAdapter
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    const controlGroupRect = new DOMRect(640, 58, 96, 32);
    const alignmentButtonRect = new DOMRect(708, 62, 24, 24);
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.dataset.docseraImageControls === "true" && this.dataset.docseraImageControlsBlockIndex === "0") {
        return controlGroupRect;
      }

      if (
        this.dataset.docseraImageControl === "true" &&
        this.dataset.docseraImageControlKind === "alignment" &&
        this.dataset.docseraImageControlsBlockIndex === "0"
      ) {
        return alignmentButtonRect;
      }

      return new DOMRect(0, 0, 1, 1);
    });
    const before = editor.getJSON();

    await openImageOptions(editor, { clientX: 720, clientY: 60 });

    const previewGroup = document.querySelector(
      `[data-docsera-image-preview-controls="true"][data-docsera-image-preview-controls-block-index="0"]`
    );
    expect(previewGroup).toBeInstanceOf(HTMLElement);
    if (!(previewGroup instanceof HTMLElement)) {
      throw new Error("Expected the image preview control group to render.");
    }

    expect(getButtonNames(previewGroup)).toEqual(["Light preview", "Dark preview"]);
    const previewButtons = within(previewGroup).getAllByRole("button");
    expect(previewButtons[0]).toHaveClass("docsera-image-controls-button--selected");
    expect(previewButtons[1]).not.toHaveClass("docsera-image-controls-button--selected");
    expect(previewButtons[0]).not.toBeDisabled();
    expect(previewButtons[1]).not.toBeDisabled();

    const controlGroup = document.querySelector(
      `[data-docsera-image-controls="true"][data-docsera-image-controls-block-index="0"]`
    );
    expect(controlGroup).toBeInstanceOf(HTMLElement);
    if (!(controlGroup instanceof HTMLElement)) {
      throw new Error("Expected the image control group to render.");
    }

    const controlButtons = within(controlGroup).getAllByRole("button");
    expect(getButtonNames(controlGroup)).toEqual(["Zoom", "Frame image off", "Alignment: Left", "Image options"]);
    expect(controlButtons[1]).toHaveAttribute("aria-pressed", "false");
    expect(controlButtons[1]).not.toHaveClass("docsera-image-controls-button--selected");
    expect(controlButtons[1]).toHaveAttribute("aria-label", "Frame image off");
    expect(controlButtons[2]).toHaveAttribute("aria-haspopup", "menu");
    expect(controlButtons[2]).toHaveAttribute("aria-expanded", "false");
    expect(controlButtons[2]).toHaveAttribute("aria-label", "Alignment: Left");
    expect(controlButtons[3]).not.toBeDisabled();

    fireEvent.click(controlButtons[0]);

    expect(editor.getJSON()).toEqual(before);
    expect(screen.getByRole("dialog", { name: "Image viewer" })).toBeInTheDocument();

    rectSpy.mockRestore();
    geometrySpy.mockRestore();
  });

  it("uses shared tooltips for compact image controls", async () => {
    const mediaAdapter: EditorMediaAdapter = {
      list: vi.fn(async () => []),
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
            alt: "Architecture diagram",
            caption: "",
            frame: false,
            align: "left",
            widthPct: 100
          }
        }
      ]
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
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.dataset.docseraImageControls === "true" && this.dataset.docseraImageControlsBlockIndex === "0") {
        return new DOMRect(640, 58, 120, 32);
      }

      if (this.dataset.docseraImageControl === "true") {
        return new DOMRect(650, 62, 24, 24);
      }

      return new DOMRect(0, 0, 1, 1);
    });

    try {
      await openImageOptions(editor, { clientX: 720, clientY: 60 });
      const controlGroup = document.querySelector(
        `[data-docsera-image-controls="true"][data-docsera-image-controls-block-index="0"]`
      );
      expect(controlGroup).toBeInstanceOf(HTMLElement);
      if (!(controlGroup instanceof HTMLElement)) {
        throw new Error("Expected the image control group to render.");
      }

      const zoomButton = within(controlGroup).getByRole("button", { name: "Zoom" });
      expect(getButtonNames(controlGroup)).toEqual(["Zoom", "Frame image off", "Alignment: Left", "Image options"]);
      expect(zoomButton).not.toHaveAttribute("title");
      fireEvent.focus(zoomButton);
      expect(await screen.findByRole("tooltip")).toHaveTextContent("Zoom");
      expect(zoomButton).toHaveAccessibleName("Zoom");
      fireEvent.blur(zoomButton);
    } finally {
      rectSpy.mockRestore();
      geometrySpy.mockRestore();
    }

    const pickerRoot = document.createElement("div");
    document.body.append(pickerRoot);
    const picker = render(
      <ImagePickerDialog
        isOpen
        mediaAdapter={mediaAdapter}
        onClose={vi.fn()}
        overlayRoot={pickerRoot}
        sessionId="session-001"
      />
    );

    const pickerDialog = await screen.findByRole("dialog", { name: "Select image" });
    const pickerClose = within(pickerDialog).getByRole("button", { name: "Close image picker" });
    expect(pickerClose).not.toHaveAttribute("title");
    fireEvent.focus(pickerClose);
    expect(await screen.findByText("Close image picker")).toBeInTheDocument();
    expect(pickerClose).toHaveAccessibleName("Close image picker");
    picker.unmount();
    pickerRoot.remove();

    const viewerRoot = document.createElement("div");
    document.body.append(viewerRoot);
    const viewer = render(
      <ImageFullscreenViewer
        isOpen
        onDismissed={vi.fn()}
        onRequestClose={vi.fn()}
        overlayRoot={viewerRoot}
        session={{
          alt: "Architecture diagram",
          imageSrc: "blob:image-viewer",
          naturalHeight: 480,
          naturalWidth: 640,
          restoreFocusElement: null,
          sourceBorderRadius: "0px",
          sourceRect: new DOMRect(100, 100, 320, 240)
        }}
        theme="light"
      />
    );

    const viewerClose = screen
      .getAllByRole("button", { name: "Close image viewer" })
      .find((button) => button.classList.contains("docsera-image-viewer__close"));
    expect(viewerClose).toBeInstanceOf(HTMLButtonElement);
    if (!(viewerClose instanceof HTMLButtonElement)) {
      throw new Error("Expected the fullscreen viewer close button.");
    }
    expect(viewerClose).not.toHaveAttribute("title");
    fireEvent.focus(viewerClose);
    expect(await screen.findByText("Close image viewer")).toBeInTheDocument();
    expect(viewerClose).toHaveAccessibleName("Close image viewer");
    viewer.unmount();
    viewerRoot.remove();
  });


  it("marks Dark preview selected in dark theme while keeping future controls inert", async () => {
    const mediaAdapter: EditorMediaAdapter = {
      list: vi.fn(async () => [
        {
          contentType: "image/png",
          fileName: "light.png",
          mediaId: "workspace-media-light",
          sizeBytes: 2048
        }
      ]),
      load: vi.fn(async ({ mediaId }) =>
        mediaId === "workspace-media-light" || mediaId === "workspace-media-base" ? createMediaBlob(mediaId) : null
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
            darkMediaId: null,
            alt: "",
            caption: "",
            frame: false,
            align: "center",
            widthPct: 100
          }
        }
      ]
    };

    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument),
      mediaAdapter,
      theme: "dark"
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    const controlGroupRect = new DOMRect(640, 58, 96, 32);
    const triggerRect = new DOMRect(708, 62, 24, 24);
    const alignmentButtonRect = new DOMRect(708, 62, 24, 24);
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.dataset.docseraImageControls === "true" && this.dataset.docseraImageControlsBlockIndex === "0") {
        return controlGroupRect;
      }

      if (this.dataset.docseraImageOptions === "true" && this.dataset.docseraImageOptionsBlockIndex === "0") {
        return triggerRect;
      }

      if (
        this.dataset.docseraImageControl === "true" &&
        this.dataset.docseraImageControlKind === "alignment" &&
        this.dataset.docseraImageControlsBlockIndex === "0"
      ) {
        return alignmentButtonRect;
      }

      return new DOMRect(0, 0, 1, 1);
    });

    await openImageOptions(editor, { clientX: 720, clientY: 60 });

    const previewGroup = document.querySelector(
      `[data-docsera-image-preview-controls="true"][data-docsera-image-preview-controls-block-index="0"]`
    );
    expect(previewGroup).toBeInstanceOf(HTMLElement);
    if (!(previewGroup instanceof HTMLElement)) {
      throw new Error("Expected the image preview control group to render.");
    }

    const previewButtons = within(previewGroup).getAllByRole("button");
    expect(getButtonNames(previewGroup)).toEqual(["Light preview", "Dark preview"]);
    expect(previewButtons[0]).not.toHaveClass("docsera-image-controls-button--selected");
    expect(previewButtons[1]).toHaveClass("docsera-image-controls-button--selected");

    const controlGroup = document.querySelector(
      `[data-docsera-image-controls="true"][data-docsera-image-controls-block-index="0"]`
    );
    expect(controlGroup).toBeInstanceOf(HTMLElement);
    if (!(controlGroup instanceof HTMLElement)) {
      throw new Error("Expected the image control group to render.");
    }

    const controlButtons = within(controlGroup).getAllByRole("button");
    expect(getButtonNames(controlGroup)).toEqual(["Zoom", "Frame image off", "Alignment: Center", "Image options"]);
    expect(controlButtons[1]).toHaveAttribute("aria-pressed", "false");
    expect(controlButtons[1]).not.toHaveClass("docsera-image-controls-button--selected");
    expect(controlButtons[1]).toHaveAttribute("aria-label", "Frame image off");
    expect(controlButtons[2]).toHaveAttribute("aria-haspopup", "menu");
    expect(controlButtons[2]).toHaveAttribute("aria-expanded", "false");
    expect(controlButtons[2]).toHaveAttribute("aria-label", "Alignment: Center");
    expect(controlButtons[3]).not.toHaveAttribute("aria-disabled", "true");

    geometrySpy.mockRestore();
  });


  it("stages image options changes until Save Changes and preserves align, widthPct, and frame metadata", async () => {
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
        mediaId === "workspace-media-light" || mediaId === "workspace-media-dark" || mediaId === "workspace-media-base"
          ? createMediaBlob(mediaId)
          : null
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
            darkMediaId: null,
            alt: "",
            caption: "",
            frame: true,
            align: "center",
            widthPct: 80
          }
        }
      ]
    };

    const { editorReady, onSaveDraft } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument),
      mediaAdapter
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    const before = editor.getJSON();

    await openImageOptions(editor, { clientX: 720, clientY: 60 });
    const panel = await screen.findByRole("dialog", { name: "Image Options" });
    const controlGroup = document.querySelector(
      `[data-docsera-image-controls="true"][data-docsera-image-controls-block-index="0"]`
    );
    expect(controlGroup).toBeInstanceOf(HTMLElement);
    if (!(controlGroup instanceof HTMLElement)) {
      throw new Error("Expected the image control group to render.");
    }
    const footerActions = panel.querySelector(".docsera-image-options-panel__footer-actions");
    expect(footerActions).toBeInstanceOf(HTMLElement);
    if (!(footerActions instanceof HTMLElement)) {
      throw new Error("Expected the image options footer actions to render.");
    }

    const footerButtons = within(footerActions).getAllByRole("button");
    expect(getButtonNames(footerActions)).toEqual(["Delete", "Save Changes"]);
    expect(footerButtons[0]).toHaveClass("docsera-image-options-panel__button--destructive");
    expect(footerButtons[1]).toHaveClass("docsera-image-options-panel__button--primary");
    expect(footerButtons[0]).not.toHaveClass("docsera-image-options-panel__button--primary");

    expect(within(panel).getByText("Light mode image")).toBeInTheDocument();
    expect(within(panel).getByText("Dark mode image")).toBeInTheDocument();
    expect(within(panel).getAllByRole("button", { name: "Upload" })).toHaveLength(2);
    expect(within(panel).queryByRole("button", { name: "Clear" })).toBeNull();
    expect(within(panel).queryByRole("checkbox", { name: "Frame image" })).toBeNull();

    fireEvent.click(within(panel).getAllByRole("button", { name: "Upload" })[0]);
    const picker = await screen.findByRole("dialog", { name: "Select image" });
    fireEvent.click(within(picker).getByRole("button", { name: "light.png" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Select image" })).toBeNull();
    });

    fireEvent.click(within(panel).getAllByRole("button", { name: "Upload" })[1]);
    const darkPicker = await screen.findByRole("dialog", { name: "Select image" });
    fireEvent.click(within(darkPicker).getByRole("button", { name: "dark.png" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Select image" })).toBeNull();
    });

    fireEvent.change(within(panel).getByLabelText("Alt text"), {
      target: { value: "Architecture diagram" }
    });
    fireEvent.change(within(panel).getByLabelText("Caption"), {
      target: { value: "Published in both light and dark modes" }
    });

    expect(editor.getJSON()).toEqual(before);

    fireEvent.click(within(controlGroup).getByRole("button", { name: "Frame image on" }));

    await waitFor(() => {
      expect(editor.getJSON()).toMatchObject({
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              mediaId: "workspace-media-base",
              darkMediaId: null,
              alt: "",
              caption: "",
              frame: false,
              align: "center",
              widthPct: 80
            }
          }
        ]
      });
    });
    expect(within(panel).getByLabelText("Alt text")).toHaveValue("Architecture diagram");
    expect(within(panel).getByLabelText("Caption")).toHaveValue("Published in both light and dark modes");
    await runAutosave();
    expect(onSaveDraft).toHaveBeenCalledTimes(1);

    const rightHandle = await screen.findByRole("button", { name: "Resize image from right edge" });
    const leftHandle = await screen.findByRole("button", { name: "Resize image from left edge" });
    const figure = document.querySelector(".docsera-editor-image");
    if (!(figure instanceof HTMLElement)) {
      throw new Error("Expected the editor image figure to render.");
    }

    const leftHandleStyles = getComputedStyle(leftHandle);
    const rightHandleStyles = getComputedStyle(rightHandle);
    expect(leftHandleStyles.width).toBe("12px");
    expect(rightHandleStyles.width).toBe("12px");
    expect(leftHandleStyles.left).toBe("126px");
    expect(rightHandleStyles.left).toBe("746px");
    expect(Number.parseFloat(leftHandleStyles.left) + Number.parseFloat(leftHandleStyles.width) / 2).toBeCloseTo(132, 5);
    expect(Number.parseFloat(rightHandleStyles.left) + Number.parseFloat(rightHandleStyles.width) / 2).toBeCloseTo(752, 5);

    await waitFor(() => {
      expect(editor.getJSON()).toMatchObject({
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              mediaId: "workspace-media-base",
              darkMediaId: null,
              alt: "",
              caption: "",
              frame: false,
              align: "center",
              widthPct: 80
            }
          }
        ]
      });
    });
    expect(within(panel).getByLabelText("Alt text")).toHaveValue("Architecture diagram");
    expect(within(panel).getByLabelText("Caption")).toHaveValue("Published in both light and dark modes");
    await runAutosave();
    expect(onSaveDraft).toHaveBeenCalledTimes(1);

    const rightPointerDownPrevented = await dispatchOwnerPointerEvent(
      panel.ownerDocument,
      rightHandle,
      "pointerdown",
      { clientX: 740, clientY: 64 },
      { button: 0, buttons: 1, pointerId: 11 }
    );
    expect(rightPointerDownPrevented).toBe(true);

    await dispatchOwnerPointerEvent(
      panel.ownerDocument,
      panel.ownerDocument,
      "pointermove",
      { clientX: 780, clientY: 64 },
      { button: 0, buttons: 1, pointerId: 11 }
    );

    await waitFor(() => {
      expect(editor.getJSON()).toMatchObject({
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              mediaId: "workspace-media-base",
              darkMediaId: null,
              alt: "",
              caption: "",
              frame: false,
              align: "center",
              widthPct: 80
            }
          }
        ]
      });
      expect(figure).toHaveAttribute("data-docsera-image-width-pct", "86");
      expect(figure).toHaveStyle({ width: "86%" });
    });
    await runAutosave();
    expect(onSaveDraft).toHaveBeenCalledTimes(1);

    await dispatchOwnerPointerEvent(
      panel.ownerDocument,
      panel.ownerDocument,
      "pointerup",
      { clientX: 820, clientY: 64 },
      { button: 0, buttons: 0, pointerId: 11 }
    );

    await waitFor(() => {
      expect(editor.getJSON()).toMatchObject({
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              mediaId: "workspace-media-base",
              darkMediaId: null,
              alt: "",
              caption: "",
              frame: false,
              align: "center",
              widthPct: 93
            }
          }
        ]
      });
      expect(figure).toHaveAttribute("data-docsera-image-width-pct", "93");
      expect(figure).toHaveStyle({ width: "93%" });
    });
    await runAutosave();
    expect(onSaveDraft).toHaveBeenCalledTimes(2);

    fireEvent.click(within(panel).getByRole("button", { name: "Save Changes" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Image Options" })).toBeNull();
    });

    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [
          {
            type: "image",
            attrs: {
              mediaId: "workspace-media-light",
              darkMediaId: "workspace-media-dark",
              alt: "Architecture diagram",
              caption: "Published in both light and dark modes",
              frame: false,
              align: "center",
              widthPct: 93
            }
          }
        ]
      });

    geometrySpy.mockRestore();
  });


  it("toggles frame immediately and restores the prior state through undo and redo", async () => {
    const mediaAdapter: EditorMediaAdapter = {
      list: vi.fn(async () => []),
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
            alt: "",
            caption: "",
            frame: true,
            align: "left",
            widthPct: 100
          }
        }
      ]
    };

    const { editorReady, onSaveDraft, onStatusChange } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument),
      mediaAdapter
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);

    await openImageOptions(editor, { clientX: 720, clientY: 60 });
    const controlGroup = document.querySelector(
      `[data-docsera-image-controls="true"][data-docsera-image-controls-block-index="0"]`
    );
    expect(controlGroup).toBeInstanceOf(HTMLElement);
    if (!(controlGroup instanceof HTMLElement)) {
      throw new Error("Expected the image control group to render.");
    }

    const frameButton = within(controlGroup).getByRole("button", { name: "Frame image on" });
    expect(frameButton).toHaveAttribute("aria-pressed", "true");
    expect(frameButton).toHaveClass("docsera-image-controls-button--selected");

    fireEvent.click(frameButton);

    await waitFor(() => {
      expect(editor.getJSON()).toMatchObject({
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              frame: false,
              align: "left",
              widthPct: 100
            }
          }
        ]
      });
    });
    await runAutosave();
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onStatusChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isDirty: false,
        status: "Saved"
      })
    );
    expect(undoDepth(editor.state)).toBe(1);
    expect(within(controlGroup).getByRole("button", { name: "Frame image off" })).toHaveAttribute("aria-pressed", "false");

    await act(async () => {
      editor.commands.undo();
    });

    await waitFor(() => {
      expect(editor.getJSON()).toMatchObject({
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              frame: true,
              align: "left",
              widthPct: 100
            }
          }
        ]
      });
    });
    expect(within(controlGroup).getByRole("button", { name: "Frame image on" })).toHaveAttribute("aria-pressed", "true");

    await act(async () => {
      editor.commands.redo();
    });

    await waitFor(() => {
      expect(editor.getJSON()).toMatchObject({
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              frame: false,
              align: "left",
              widthPct: 100
            }
          }
        ]
      });
    });
    expect(within(controlGroup).getByRole("button", { name: "Frame image off" })).toHaveAttribute("aria-pressed", "false");

    geometrySpy.mockRestore();
  });


  it("keeps the alignment trigger non-mutating", async () => {
    const mediaAdapter: EditorMediaAdapter = {
      list: vi.fn(async () => []),
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
            alt: "",
            caption: "",
            frame: true,
            align: "left",
            widthPct: 100
          }
        }
      ]
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

    await openImageOptions(editor, { clientX: 720, clientY: 60 });
    const controlGroup = document.querySelector(
      `[data-docsera-image-controls="true"][data-docsera-image-controls-block-index="0"]`
    );
    expect(controlGroup).toBeInstanceOf(HTMLElement);
    if (!(controlGroup instanceof HTMLElement)) {
      throw new Error("Expected the image control group to render.");
    }

    const alignmentButton = within(controlGroup).getByRole("button", { name: "Alignment: Left" });
    expect(alignmentButton).toHaveAttribute("aria-haspopup", "menu");
    expect(alignmentButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(alignmentButton);
    const alignmentMenu = await screen.findByRole("menu", { name: "Alignment options" });
    expect(getMenuItemNames(alignmentMenu)).toEqual([
      "Left Move the image to the left",
      "Center Center the image",
      "Right Move the image to the right"
    ]);
    fireEvent.click(within(alignmentMenu).getByRole("menuitemradio", { name: "Left Move the image to the left" }));

    await waitFor(() => {
      expect(screen.queryByRole("menu", { name: "Alignment options" })).toBeNull();
    });
    expect(editor.getJSON()).toEqual(initial);

    geometrySpy.mockRestore();
  });


  it("resizes from both edges with live preview, clamping, undo, and cancel restore", async () => {
    const mediaAdapter: EditorMediaAdapter = {
      list: vi.fn(async () => []),
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
            alt: "",
            caption: "",
            frame: true,
            align: "left",
            widthPct: 80
          }
        }
      ]
    };

    const { editorReady, container, onSaveDraft, onStatusChange } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument),
      mediaAdapter
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    const surface = container.querySelector(".docsera-editor-runtime__surface");
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Expected the editor surface to render.");
    }

    await openImageOptions(editor, { clientX: 720, clientY: 60 });
    const beforeResize = editor.getJSON();
    const rightHandle = await screen.findByRole("button", { name: "Resize image from right edge" });
    const leftHandle = await screen.findByRole("button", { name: "Resize image from left edge" });
    const figure = document.querySelector(".docsera-editor-image");
    if (!(figure instanceof HTMLElement)) {
      throw new Error("Expected the editor image figure to render.");
    }

    const rightPointerDownPrevented = await dispatchOwnerPointerEvent(
      surface.ownerDocument,
      rightHandle,
      "pointerdown",
      { clientX: 740, clientY: 64 },
      { button: 0, buttons: 1, pointerId: 11 }
    );
    expect(rightPointerDownPrevented).toBe(true);

    await dispatchOwnerPointerEvent(
      surface.ownerDocument,
      surface.ownerDocument,
      "pointermove",
      { clientX: 780, clientY: 64 },
      { button: 0, buttons: 1, pointerId: 11 }
    );

    await waitFor(() => {
      expect(editor.getJSON()).toEqual(beforeResize);
      expect(figure).toHaveAttribute("data-docsera-image-width-pct", "86");
      expect(figure).toHaveStyle({ width: "86%" });
    });
    expect(surface.className).not.toContain("docsera-editor-runtime__surface--block-dragging");
    await runAutosave();
    expect(onSaveDraft).toHaveBeenCalledTimes(0);
    expect(onStatusChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isDirty: false,
        status: "Saved"
      })
    );

    await dispatchOwnerPointerEvent(
      surface.ownerDocument,
      surface.ownerDocument,
      "pointerup",
      { clientX: 820, clientY: 64 },
      { button: 0, buttons: 0, pointerId: 11 }
    );

    await waitFor(() => {
      expect(editor.getJSON()).toMatchObject({
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              frame: true,
              align: "left",
              widthPct: 93
            }
          }
        ]
      });
    });
    await runAutosave();
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onStatusChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        isDirty: false,
        status: "Saved"
      })
    );
    expect(undoDepth(editor.state)).toBe(1);

    await act(async () => {
      editor.commands.undo();
    });

    await waitFor(() => {
      expect(editor.getJSON()).toMatchObject({
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              frame: true,
              align: "left",
              widthPct: 80
            }
          }
        ]
      });
      expect(figure).toHaveAttribute("data-docsera-image-width-pct", "80");
      expect(figure).toHaveStyle({ width: "80%" });
    });
    expect(undoDepth(editor.state)).toBe(0);

    await act(async () => {
      editor.commands.redo();
    });

    await waitFor(() => {
      expect(editor.getJSON()).toMatchObject({
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              frame: true,
              align: "left",
              widthPct: 93
            }
          }
        ]
      });
      expect(figure).toHaveAttribute("data-docsera-image-width-pct", "93");
      expect(figure).toHaveStyle({ width: "93%" });
    });
    expect(undoDepth(editor.state)).toBe(1);

    const leftPointerDownPrevented = await dispatchOwnerPointerEvent(
      surface.ownerDocument,
      leftHandle,
      "pointerdown",
      { clientX: 132, clientY: 64 },
      { button: 0, buttons: 1, pointerId: 12 }
    );
    expect(leftPointerDownPrevented).toBe(true);

    await dispatchOwnerPointerEvent(
      surface.ownerDocument,
      surface.ownerDocument,
      "pointermove",
      { clientX: 640, clientY: 64 },
      { button: 0, buttons: 1, pointerId: 12 }
    );

    await waitFor(() => {
      expect(editor.getJSON()).toMatchObject({
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              frame: true,
              align: "left",
              widthPct: 93
            }
          }
        ]
      });
      expect(figure).toHaveAttribute("data-docsera-image-width-pct", "20");
      expect(figure).toHaveStyle({ width: "20%" });
    });
    await runAutosave();
    expect(onSaveDraft).toHaveBeenCalledTimes(1);

    await dispatchOwnerPointerEvent(
      surface.ownerDocument,
      surface.ownerDocument,
      "pointerup",
      { clientX: 640, clientY: 64 },
      { button: 0, buttons: 0, pointerId: 12 }
    );

    await waitFor(() => {
      expect(editor.getJSON()).toMatchObject({
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              frame: true,
              align: "left",
              widthPct: 20
            }
          }
        ]
      });
      expect(figure).toHaveAttribute("data-docsera-image-width-pct", "20");
      expect(figure).toHaveStyle({ width: "20%" });
    });
    await runAutosave();
    expect(onSaveDraft).toHaveBeenCalledTimes(2);

    const cancelPointerDownPrevented = await dispatchOwnerPointerEvent(
      surface.ownerDocument,
      leftHandle,
      "pointerdown",
      { clientX: 132, clientY: 64 },
      { button: 0, buttons: 1, pointerId: 13 }
    );
    expect(cancelPointerDownPrevented).toBe(true);

    await dispatchOwnerPointerEvent(
      surface.ownerDocument,
      surface.ownerDocument,
      "pointermove",
      { clientX: 80, clientY: 64 },
      { button: 0, buttons: 1, pointerId: 13 }
    );

    await waitFor(() => {
      expect(figure).toHaveAttribute("data-docsera-image-width-pct", "28");
      expect(figure).toHaveStyle({ width: "28%" });
    });

    await dispatchOwnerPointerEvent(
      surface.ownerDocument,
      surface.ownerDocument,
      "pointercancel",
      { clientX: 80, clientY: 64 },
      { button: 0, buttons: 0, pointerId: 13 }
    );

    await waitFor(() => {
      expect(editor.getJSON()).toMatchObject({
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              frame: true,
              align: "left",
              widthPct: 20
            }
          }
        ]
      });
      expect(figure).toHaveAttribute("data-docsera-image-width-pct", "20");
      expect(figure).toHaveStyle({ width: "20%" });
    });
    await runAutosave();
    expect(onSaveDraft).toHaveBeenCalledTimes(2);

    geometrySpy.mockRestore();
  });


  it("keeps image options anchored below the toolbar and remeasured on resize", async () => {
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
        mediaId === "workspace-media-base" || mediaId === "workspace-media-light" || mediaId === "workspace-media-dark"
          ? createMediaBlob(mediaId)
          : null
      ),
      upload: vi.fn(async () => ({
        contentType: "image/png",
        fileName: "light.png",
        mediaId: "workspace-media-light",
        sizeBytes: 2048
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

    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument),
      mediaAdapter
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    let controlGroupRect = new DOMRect(640, 58, 96, 32);
    let triggerRect = new DOMRect(708, 62, 24, 24);
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (
        this.dataset.docseraImageControls === "true" &&
        this.dataset.docseraImageControlsBlockIndex === "0"
      ) {
        return controlGroupRect;
      }

      if (
        this.dataset.docseraImageOptions === "true" &&
        this.dataset.docseraImageOptionsBlockIndex === "0"
      ) {
        return triggerRect;
      }

      return new DOMRect(0, 0, 1, 1);
    });

    await openImageOptions(editor, { clientX: 720, clientY: 60 });
    const panel = await screen.findByRole("dialog", { name: "Image Options" });
    const controlGroup = document.querySelector(
      `[data-docsera-image-controls="true"][data-docsera-image-controls-block-index="0"]`
    );
    expect(controlGroup).toBeInstanceOf(HTMLElement);
    if (!(controlGroup instanceof HTMLElement)) {
      throw new Error("Expected the image control group to render.");
    }

    await waitFor(() => {
      expect(controlGroup).toHaveStyle({ left: "744px", top: "60px" });
      expect(controlGroup).toHaveStyle({ transform: "translateX(-100%)" });
      expect(panel).toHaveStyle({ left: "364px", top: "100px" });
    });

    controlGroupRect = new DOMRect(604, 122, 96, 32);
    triggerRect = new DOMRect(672, 126, 24, 24);
    window.dispatchEvent(new Event("resize"));

    await waitFor(() => {
      expect(controlGroup).toHaveStyle({ left: "744px", top: "60px" });
      expect(panel).toHaveStyle({ left: "328px", top: "164px" });
    });

    rectSpy.mockRestore();
    geometrySpy.mockRestore();
  });


  it("dismisses staged image options when alignment is invoked", async () => {
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
        mediaId === "workspace-media-base" || mediaId === "workspace-media-light" || mediaId === "workspace-media-dark"
          ? createMediaBlob(mediaId)
          : null
      ),
      upload: vi.fn(async () => ({
        contentType: "image/png",
        fileName: "light.png",
        mediaId: "workspace-media-light",
        sizeBytes: 2048
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

    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument),
      mediaAdapter
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    const controlGroupRect = new DOMRect(640, 58, 96, 32);
    const triggerRect = new DOMRect(708, 62, 24, 24);
    const rectSpy = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      if (this.dataset.docseraImageControls === "true" && this.dataset.docseraImageControlsBlockIndex === "0") {
        return controlGroupRect;
      }

      if (this.dataset.docseraImageOptions === "true" && this.dataset.docseraImageOptionsBlockIndex === "0") {
        return triggerRect;
      }

      return new DOMRect(0, 0, 1, 1);
    });
    const before = editor.getJSON();

    await openImageOptions(editor, { clientX: 720, clientY: 60 });
    const panel = await screen.findByRole("dialog", { name: "Image Options" });
    const controlGroup = document.querySelector(
      `[data-docsera-image-controls="true"][data-docsera-image-controls-block-index="0"]`
    );
    expect(controlGroup).toBeInstanceOf(HTMLElement);
    if (!(controlGroup instanceof HTMLElement)) {
      throw new Error("Expected the image control group to render.");
    }

    const lightUpload = within(panel).getAllByRole("button", { name: "Upload" })[0];
    const darkUpload = within(panel).getAllByRole("button", { name: "Upload" })[1];
    fireEvent.click(lightUpload);
    const picker = await screen.findByRole("dialog", { name: "Select image" });
    fireEvent.click(within(picker).getByRole("button", { name: "light.png" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Select image" })).toBeNull();
    });

    fireEvent.click(darkUpload);
    const darkPicker = await screen.findByRole("dialog", { name: "Select image" });
    fireEvent.click(within(darkPicker).getByRole("button", { name: "light.png" }));

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Select image" })).toBeNull();
    });

    fireEvent.change(within(panel).getByLabelText("Alt text"), {
      target: { value: "Discarded alt" }
    });
    fireEvent.change(within(panel).getByLabelText("Caption"), {
      target: { value: "Discarded caption" }
    });

    expect(editor.getJSON()).toEqual(before);

    const alignmentButton = within(controlGroup).getByRole("button", { name: "Alignment: Left" });
    expect(getComputedStyle(controlGroup).pointerEvents).toBe("auto");
    expect(getComputedStyle(alignmentButton).cursor).toBe("pointer");
    expect(alignmentButton).toHaveAttribute("aria-haspopup", "menu");
    expect(alignmentButton).toHaveAttribute("aria-controls");
    expect(alignmentButton).toHaveAttribute("aria-expanded", "false");

    await waitFor(() => {
      expect(panel).toHaveStyle({ left: "364px", top: "100px" });
    });

    fireEvent.click(alignmentButton);
    const alignmentMenu = await screen.findByRole("menu", { name: "Alignment options" });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Image Options" })).toBeNull();
    });
    expect(editor.getJSON()).toEqual(before);
    expect(within(alignmentMenu).getByRole("menuitemradio", { name: "Left Move the image to the left" })).toHaveAttribute(
      "aria-checked",
      "true"
    );

    rectSpy.mockRestore();
    geometrySpy.mockRestore();
  });


  it("discards staged image options when dismissed outside the panel", async () => {
    const mediaAdapter: EditorMediaAdapter = {
      list: vi.fn(async () => [
        {
          contentType: "image/png",
          fileName: "light.png",
          mediaId: "workspace-media-light",
          sizeBytes: 2048
        }
      ]),
      load: vi.fn(async ({ mediaId }) => (mediaId === "workspace-media-base" || mediaId === "workspace-media-light" ? createMediaBlob(mediaId) : null)),
      upload: vi.fn(async () => ({
        contentType: "image/png",
        fileName: "light.png",
        mediaId: "workspace-media-light",
        sizeBytes: 2048
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

    const { editorReady } = renderRuntime({
      initialEnvelope: createEnvelopeFromDocument(initial as DocseraTiptapDocument),
      mediaAdapter
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const geometrySpy = mockTopLevelBlockGeometry(editor, [new DOMRect(132, 52, 620, 28)]);
    const before = editor.getJSON();

    await openImageOptions(editor, { clientX: 720, clientY: 60 });
    const panel = await screen.findByRole("dialog", { name: "Image Options" });
    fireEvent.change(within(panel).getByLabelText("Alt text"), {
      target: { value: "Discarded alt" }
    });

    fireEvent.pointerDown(document.body, { button: 0, clientX: 8, clientY: 8 });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Image Options" })).toBeNull();
    });
    expect(editor.getJSON()).toEqual(before);

    geometrySpy.mockRestore();
  });


  it("keeps the accepted frame stylesheet to a simple border treatment", () => {
    renderRuntime();
    const runtimeStyleText = getRuntimeStyleText();
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const runtimeShellSource = nodeProcess
      .getBuiltinModule("fs")
      .readFileSync(`${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`, "utf8");

    expect(runtimeStyleText).toMatch(/\.docsera-editor-image__surface\[data-docsera-image-frame="true"\]\s*{[^}]*border:\s*1px solid[^}]*}/s);
    expect(runtimeStyleText).toMatch(/\.docsera-editor-image__surface\s*{[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
    expect(runtimeShellSource).toMatch(/\.docsera-main__media--framed\s*{[^}]*background:\s*transparent;[^}]*}/s);
  });


});
