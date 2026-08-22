/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { useMemo, useState } from "react";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { PageBodySaveResult } from "../shared/types/docsera";
import { describe, expect, it, vi } from "vitest";
import { createEmptyDocseraDocumentEnvelope, type DocseraDocumentEnvelope } from "../../shared/editor/document";
import { createExpandedTextFormattingDocseraDocumentEnvelope, createSupportedE2DocseraDocumentEnvelope } from "../../shared/editor/documentFixtures";
import {
  createCanonicalImageDocseraDocumentEnvelope,
  createResponsiveImageDocseraDocumentEnvelope
} from "../../shared/editor/imageFixtures";
import {
  createImageFullscreenViewerSession,
  ImageFullscreenViewer,
  type ImageFullscreenViewerSession
} from "../shared/media/ImageFullscreenViewer";
import {
  resetDocseraImageDisplayState,
  setDocseraImagePreviewState
} from "../shared/editor/imageDisplayState";
import type { EditorMediaAdapter } from "./contracts";
import { getAutosaveRetryDelay, PageEditorHostRuntime } from "./PageEditorHostRuntime";
import {
  createEnvelopeFromDocument,
  createSuccessPage,
  pasteIntoEditor,
  renderRuntime,
  runAutosave
} from "./PageEditorHostRuntime.testUtils";

if (typeof URL.createObjectURL !== "function") {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:test"
  });
}

if (typeof URL.revokeObjectURL !== "function") {
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: () => undefined
  });
}

function createMediaAdapter(load: EditorMediaAdapter["load"]): EditorMediaAdapter {
  return {
    list: vi.fn(async () => []),
    load,
    upload: vi.fn(async (input: Parameters<EditorMediaAdapter["upload"]>[0]) => ({
      contentType: input.file.type,
      fileName: input.file.name,
      mediaId: `media-${input.file.name}`,
      sizeBytes: input.file.size
    }))
  };
}

function FullscreenViewerHarness({
  initialSession,
  onRequestClose,
  overlayRoot,
  theme = "light"
}: {
  initialSession: ImageFullscreenViewerSession;
  onRequestClose?: () => void;
  overlayRoot: HTMLElement;
  theme?: "dark" | "light";
}) {
  const [session, setSession] = useState<ImageFullscreenViewerSession | null>(initialSession);
  const [isOpen, setIsOpen] = useState(true);

  return session ? (
    <ImageFullscreenViewer
      overlayRoot={overlayRoot}
      isOpen={isOpen}
      onDismissed={() => {
        setSession(null);
      }}
      onRequestClose={() => {
        setIsOpen(false);
        onRequestClose?.();
      }}
      session={session}
      theme={theme}
    />
  ) : null;
}

function SaveAcknowledgeHarness(input: {
  initialEnvelope: DocseraDocumentEnvelope;
  onEditorReady?: (editor: Parameters<NonNullable<Parameters<typeof PageEditorHostRuntime>[0]["onEditorReady"]>>[0]) => void;
  onOutlineChange?: Parameters<typeof PageEditorHostRuntime>[0]["onOutlineChange"];
  onSaveDraft: Parameters<typeof PageEditorHostRuntime>[0]["onSaveDraft"];
  onStatusChange: Parameters<typeof PageEditorHostRuntime>[0]["onStatusChange"];
  overlayRoot: HTMLElement;
}) {
  const [pageState, setPageState] = useState(() => ({
    envelope: input.initialEnvelope,
    revision: 0,
    savedEnvelope: input.initialEnvelope
  }));
  const handleSaveDraft = useMemo(
    () =>
      (async (saveInput: Parameters<typeof PageEditorHostRuntime>[0]["onSaveDraft"] extends (arg: infer T) => Promise<PageBodySaveResult> ? T : never) => {
        const result = await input.onSaveDraft(saveInput);
        if (result.state === "succeeded") {
          const nextEnvelope = (
            result.page.draftContentJson ??
            saveInput.readLatestDraftContentJson?.() ??
            saveInput.draftContentJson
          ) as DocseraDocumentEnvelope;
          setPageState((current) => ({
            envelope: nextEnvelope,
            revision: result.page.draftRevision ?? current.revision,
            savedEnvelope: nextEnvelope
          }));
        }
        return result;
      }),
    [input]
  );

  return (
    <PageEditorHostRuntime
      canEdit={true}
      initialEnvelope={pageState.envelope}
      initialSavedEnvelope={pageState.savedEnvelope}
      initialRevision={pageState.revision}
      onAccessLost={vi.fn()}
      onEditorReady={input.onEditorReady}
      onOutlineChange={input.onOutlineChange ?? vi.fn()}
      onSaveDraft={handleSaveDraft}
      onStatusChange={input.onStatusChange}
      overlayRoot={input.overlayRoot}
      pageSysId="page-001"
      sessionKey="page-001:1"
      theme="light"
    />
  );
}

describe("PageEditorHostRuntime", () => {
  it("keeps editor links on the shared primary token and preserves visited-link styling", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/editor/PageEditorHostRuntime.tsx`,
      "utf8"
    );

    expect(source).toContain(".docsera-editor-runtime__surface .ProseMirror a {");
    expect(source).toContain("color: var(--docsera-primary);");
    expect(source).toContain(".docsera-editor-runtime__surface .ProseMirror a:visited {");
    expect(source).toContain("text-decoration-color: currentColor;");
    expect(source).toContain(".docsera-editor-runtime__surface .ProseMirror a:hover,");
    expect(source).toContain(".docsera-editor-runtime__surface .ProseMirror a:focus-visible {");
  });

  it("keeps natural document width and derives gutter hit testing from an extended lane instead of widening the document canvas", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/editor/PageEditorHostRuntime.tsx`,
      "utf8"
    );

    expect(source).not.toContain("width: calc(100% + ${BLOCK_GUTTER_WIDTH}px);");
    expect(source).not.toContain("margin-left: -${BLOCK_GUTTER_WIDTH}px;");
    expect(source).not.toContain("padding-left: ${BLOCK_GUTTER_WIDTH}px;");
    expect(source).toContain("resolveEditorLaneGeometry(surfaceElement, proseMirror)");
    expect(source).toContain('const gutterWidth = resolveConfiguredGutterWidth(surfaceElement);');
    expect(source).toContain('hostElement?.closest(EDITOR_SHELL_SURFACE_SELECTOR)');
  });

  it("uses a dedicated grouped block selector contract and removes the legacy 340px editor minimum height", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/editor/PageEditorHostRuntime.tsx`,
      "utf8"
    );
    const selectorStyleSource = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/editor/BlockSelectorStyles.ts`,
      "utf8"
    );

    expect(source).toContain('import { BLOCK_SELECTOR_STYLES } from "./BlockSelectorStyles";');
    expect(source).toContain('className="docsera-editor-floating docsera-block-selector"');
    expect(source).not.toContain("min-height: 340px;");
    expect(selectorStyleSource).toContain("width: min(320px, calc(100vw - 24px));");
    expect(selectorStyleSource).toContain("max-height: 288px;");
    expect(selectorStyleSource).toContain(".docsera-block-selector__heading");
    expect(selectorStyleSource).toContain("width: calc(100% + var(--docsera-block-selector-scrollbar-gap));");
    expect(selectorStyleSource).toContain("margin-right: calc(-1 * var(--docsera-block-selector-scrollbar-gap));");
    expect(selectorStyleSource).toContain("padding: 8px calc(10px + var(--docsera-block-selector-scrollbar-gap)) 8px 10px;");
  });

  it("owns editor image presentation inside the shadow runtime and keeps the picker contract compact", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const runtimeSource = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/editor/PageEditorHostRuntime.tsx`,
      "utf8"
    );
    const editorImageStylesSource = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/editor/EditorImageStyles.ts`,
      "utf8"
    );
    const imageOptionsPanelSource = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/editor/ImageOptionsPanel.tsx`,
      "utf8"
    );
    const imagePickerDialogSource = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/editor/ImagePickerDialog.tsx`,
      "utf8"
    );
    const imagePickerStylesSource = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/editor/ImagePickerStyles.ts`,
      "utf8"
    );
    const editorImageNodeSource = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/shared/editor/schema.ts`,
      "utf8"
    );
    const publishedReaderSource = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/features/workspaces/PublishedDocumentReader.tsx`,
      "utf8"
    );

    expect(runtimeSource).toContain('import { COMPACT_MENU_STYLES } from "./CompactMenuStyles";');
    expect(runtimeSource).toContain('import { EDITOR_IMAGE_STYLES } from "./EditorImageStyles";');
    expect(runtimeSource).toContain('ImageFullscreenViewer');
    expect(runtimeSource).toContain("${EDITOR_IMAGE_STYLES}");
    expect(runtimeSource).toContain("${COMPACT_MENU_STYLES}");
    expect(editorImageStylesSource).toContain(".docsera-editor-image {");
    expect(editorImageStylesSource).toContain("margin: 0;");
    expect(editorImageStylesSource).toContain(".docsera-editor-image__surface {");
    expect(editorImageStylesSource).toContain("border-radius: 0;");
    expect(editorImageStylesSource).toContain(".docsera-editor-image__caption {");
    expect(editorImageStylesSource).toContain(".docsera-editor-image__loading,");
    expect(editorImageStylesSource).toContain(".docsera-editor-image__unavailable");
    expect(imagePickerStylesSource).toContain(".docsera-modal__surface.docsera-image-picker {");
    expect(imagePickerStylesSource).toContain("width: min(100%, 560px);");
    expect(imagePickerStylesSource).toContain("border-radius: 8px;");
    expect(imagePickerStylesSource).toContain("box-shadow: 0 24px 48px rgba(15, 23, 42, 0.22);");
    expect(imagePickerStylesSource).toContain(".docsera-modal__surface.docsera-image-picker,");
    expect(imagePickerStylesSource).toContain(".docsera-modal__surface.docsera-image-picker *,");
    expect(imagePickerStylesSource).toContain(".docsera-modal__surface.docsera-image-picker *::before,");
    expect(imagePickerStylesSource).toContain(".docsera-modal__surface.docsera-image-picker *::after {");
    expect(imagePickerStylesSource).toContain("box-sizing: border-box;");
    expect(imagePickerStylesSource).toContain(".docsera-image-picker__header {");
    expect(imagePickerStylesSource).toContain("border-bottom: 1px solid var(--docsera-border-soft);");
    expect(imagePickerStylesSource).toContain(".docsera-modal__close.docsera-image-picker__close {");
    expect(imagePickerStylesSource).toContain("width: 32px;");
    expect(imagePickerStylesSource).toContain("height: 32px;");
    expect(imagePickerStylesSource).toContain("background: transparent;");
    expect(imagePickerStylesSource).toContain("cursor: pointer;");
    expect(imagePickerStylesSource).toContain("cursor: default;");
    expect(imagePickerStylesSource).toContain(".docsera-image-picker__search-row {");
    expect(imagePickerStylesSource).toContain("padding: 0;");
    expect(imagePickerStylesSource).toContain(".docsera-image-picker__search,");
    expect(imagePickerStylesSource).toContain(".docsera-image-picker__input {");
    expect(imagePickerStylesSource).toContain("width: 100%;");
    expect(imagePickerStylesSource).toContain("border-radius: 4px;");
    expect(imagePickerStylesSource).toContain("border-color: var(--docsera-primary);");
    expect(imagePickerStylesSource).toContain("box-shadow: none;");
    expect(imagePickerStylesSource).toContain(".docsera-image-picker__grid {");
    expect(imagePickerStylesSource).toContain(".docsera-image-picker__tile {");
    expect(imagePickerStylesSource).toContain("aspect-ratio: 1 / 1;");
    expect(imagePickerStylesSource).toContain(".docsera-image-picker__tile--upload {");
    expect(imagePickerStylesSource).toContain(".docsera-image-picker__tile-thumb {");
    expect(imagePickerStylesSource).toContain(".docsera-image-picker__upload-view {");
    expect(imagePickerStylesSource).toContain(".docsera-image-picker__upload-preview {");
    expect(imagePickerStylesSource).toContain("height: clamp(220px, 36vh, 280px);");
    expect(imagePickerStylesSource).toContain("object-fit: contain;");
    expect(imagePickerStylesSource).toContain(".docsera-modal__primary {");
    expect(imagePickerStylesSource).toContain("min-width: 134px;");
    expect(imagePickerStylesSource).toContain("height: 34px;");
    expect(imagePickerStylesSource).toContain("font-size: 14px;");
    expect(imagePickerStylesSource).toContain("font-weight: 600;");
    expect(imagePickerStylesSource).toContain("min-height: 34px;");
    expect(imagePickerStylesSource).toContain("border-radius: 4px;");
    expect(imagePickerStylesSource).toContain(".docsera-modal__secondary {");
    expect(imagePickerStylesSource).toContain("color: var(--docsera-text-muted);");
    expect(imagePickerStylesSource).toContain("img.docsera-image-picker__tile-image {");
    expect(imagePickerStylesSource).not.toContain("linear-gradient(180deg");
    expect(imagePickerStylesSource).not.toContain(".docsera-image-picker__tile-meta {");
    expect(imagePickerStylesSource).not.toContain(".docsera-image-picker__tile-name {");
    expect(imagePickerStylesSource).not.toContain(".docsera-image-picker__tile-details {");
    expect(imagePickerStylesSource).not.toContain(".docsera-image-picker__library-layout {");
    expect(imagePickerStylesSource).not.toContain(".docsera-image-picker__preview-pane {");
    expect(imagePickerStylesSource).not.toContain(".docsera-image-picker__upload-layout {");
    expect(imagePickerStylesSource).not.toContain(".docsera-image-picker__library-toolbar {");
    expect(imagePickerStylesSource).not.toContain(".docsera-image-picker__tile-image img {");
    expect(imagePickerStylesSource).not.toContain("cursor: not-allowed;");
    expect(imagePickerStylesSource).not.toContain(":host-context(html[data-docsera-theme=\"dark\"]) .docsera-image-picker__header");
    expect(imagePickerStylesSource).not.toContain(":host-context(html[data-docsera-theme=\"dark\"]) .docsera-image-picker__search");
    expect(imageOptionsPanelSource).toContain('className={`docsera-image-options-panel__media-value docsera-image-options-panel__media-value--${lightMediaLabel.state}`}');
    expect(imageOptionsPanelSource).toContain('style={readonlyMediaValueStyle}');
    expect(imageOptionsPanelSource).toContain('readOnly');
    expect(imageOptionsPanelSource).toContain('aria-readonly="true"');
    expect(imagePickerDialogSource).toContain('aria-busy={libraryState.status === "loading" ? "true" : undefined}');
    expect(imagePickerDialogSource).not.toContain("Loading the workspace media library...");
    expect(editorImageNodeSource).toContain('aria-label", "Loading image"');
    expect(editorImageNodeSource).not.toContain("The image is being loaded through the authenticated media boundary.");
    expect(publishedReaderSource).toContain('aria-label="Loading image"');
    expect(publishedReaderSource).toContain("docsera-main__media-surface");
    expect(publishedReaderSource).toContain("docsera-main__media-activation");
    expect(publishedReaderSource).not.toContain("The image is being loaded through the authenticated media boundary.");
  });

  it("keeps the edit-mode title-to-editor spacing at 40px", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const runtimeShellSource = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    );

    expect(runtimeShellSource).toContain(".docsera-main__editor-host {");
    expect(runtimeShellSource).toContain("margin-top: 40px;");
    expect(runtimeShellSource).not.toContain(".docsera-image-picker__backdrop");
    expect(runtimeShellSource).not.toContain(".docsera-modal__surface.docsera-image-picker");
  });

  it("keeps the editor content lane shrinkable so wide tables stay inside the existing shell width", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const runtimeShellSource = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    );
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/editor/PageEditorHostRuntime.tsx`,
      "utf8"
    );

    expect(runtimeShellSource).toMatch(
      /\.docsera-main__surface \{\s*width: min\(100%, var\(--docsera-main-surface-max-width\)\);\s*min-width: 0;/s
    );
    expect(runtimeShellSource).toMatch(/\.docsera-main__editor-host \{\s*margin-top: 40px;\s*min-width: 0;/s);
    expect(source).toMatch(/\.docsera-editor-runtime__surface \{\s*position: relative;\s*width: 100%;\s*min-width: 0;/s);
    expect(source).toMatch(
      /\.docsera-editor-runtime__surface \.ProseMirror \{\s*color: var\(--docsera-editor-text\);\s*caret-color: var\(--docsera-editor-primary\);\s*font-size: 1rem;\s*line-height: 1\.7;\s*outline: none;\s*min-width: 0;/s
    );
    expect(source).toMatch(
      /\.docsera-editor-runtime__surface \.ProseMirror \.tableWrapper \{[\s\S]*?overflow-x: auto;[\s\S]*?min-width: 0;/s
    );
    expect(source).toMatch(/\.docsera-editor-runtime__surface \.ProseMirror table \{\s*[\s\S]*?width: max-content;/s);
  });

  it("keeps the Quick Add control transparent by default and applies token-based hover chrome only on hover or focus", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/editor/PageEditorHostRuntime.tsx`,
      "utf8"
    );

    expect(source).toContain("width: ${QUICK_ADD_BUTTON_SIZE}px;");
    expect(source).toContain("height: ${QUICK_ADD_BUTTON_SIZE}px;");
    expect(source).toContain("background: transparent;");
    expect(source).toContain("color: var(--docsera-text-soft);");
    expect(source).toContain("box-shadow: none;");
    expect(source).toContain(".docsera-editor-floating__quick-add:hover,");
    expect(source).toContain("background: var(--docsera-surface-muted);");
    expect(source).toContain("color: var(--docsera-primary);");
    expect(source).toContain(".docsera-editor-floating__handle {");
    expect(source).toContain(".docsera-editor-runtime__block--selected {");
    expect(source).toContain("background: var(--docsera-editor-block-selection);");
    expect(source).toContain("box-shadow: none;");
    expect(source).toContain("border-radius: 0;");
  });

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

  it("keeps image preview changes transient and uses the configured dark image when previewed", async () => {
    resetDocseraImageDisplayState();
    const envelope = createResponsiveImageDocseraDocumentEnvelope();
    const createObjectUrlSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockImplementation((blob: Blob | MediaSource) =>
        blob instanceof Blob && blob.size === "workspace-media-light".length ? "blob:light" : "blob:dark"
      );
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const { container, editorReady, onSaveDraft } = renderRuntime({
      initialEnvelope: envelope,
      mediaAdapter: createMediaAdapter(async ({ mediaId }) => new Blob([mediaId], { type: "image/png" }))
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const imageFigure = await waitFor(() => {
      const figure = container.querySelector(".docsera-editor-image") as HTMLElement | null;
      expect(figure).not.toBeNull();
      return figure!;
    });
    await waitFor(() => {
      expect(imageFigure.querySelector("img")).toHaveAttribute("src", "blob:light");
    });

    await act(async () => {
      setDocseraImagePreviewState({ blockIndex: 0, theme: "dark" });
    });

    await waitFor(() => {
      expect(imageFigure).toHaveAttribute("data-docsera-image-preview-theme", "dark");
      expect(imageFigure.querySelector("img")).toHaveAttribute("src", "blob:dark");
    });

    expect(editorReady[0].getJSON()).toEqual(envelope.document);
    expect(onSaveDraft).not.toHaveBeenCalled();
    await act(async () => {
      resetDocseraImageDisplayState();
    });
    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
  });

  it("falls back to the light image when previewing dark mode without a dark asset", async () => {
    resetDocseraImageDisplayState();
    const envelope = createCanonicalImageDocseraDocumentEnvelope();
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:light");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const { container, editorReady, onSaveDraft } = renderRuntime({
      initialEnvelope: envelope,
      mediaAdapter: createMediaAdapter(async ({ mediaId }) => new Blob([mediaId], { type: "image/png" }))
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const imageFigure = await waitFor(() => {
      const figure = container.querySelector(".docsera-editor-image") as HTMLElement | null;
      expect(figure).not.toBeNull();
      return figure!;
    });
    await waitFor(() => {
      expect(imageFigure.querySelector("img")).toHaveAttribute("src", "blob:light");
    });

    await act(async () => {
      setDocseraImagePreviewState({ blockIndex: 0, theme: "dark" });
    });

    await waitFor(() => {
      expect(imageFigure).toHaveAttribute("data-docsera-image-preview-theme", "dark");
      expect(imageFigure.querySelector("img")).toHaveAttribute("src", "blob:light");
    });

    expect(editorReady[0].getJSON()).toEqual(envelope.document);
    expect(onSaveDraft).not.toHaveBeenCalled();
    await act(async () => {
      resetDocseraImageDisplayState();
    });
    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
  });

  it("renders the fullscreen viewer with edit-mode session semantics and restores focus on close", async () => {
    const overlayRoot = document.createElement("div");
    document.body.append(overlayRoot);
    const restoreButton = document.createElement("button");
    restoreButton.type = "button";
    restoreButton.textContent = "Restore focus";
    document.body.append(restoreButton);
    const sourceElement = document.createElement("div");
    Object.defineProperty(sourceElement, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(120, 100, 320, 180)
    });
    const imageElement = document.createElement("img");
    Object.defineProperty(imageElement, "src", {
      configurable: true,
      value: "blob:viewer"
    });
    Object.defineProperty(imageElement, "currentSrc", {
      configurable: true,
      value: "blob:viewer"
    });
    Object.defineProperty(imageElement, "naturalWidth", {
      configurable: true,
      value: 1920
    });
    Object.defineProperty(imageElement, "naturalHeight", {
      configurable: true,
      value: 1080
    });
    const session = createImageFullscreenViewerSession({
      alt: "Architecture diagram",
      imageElement,
      restoreFocusElement: restoreButton,
      sourceElement
    });

    render(
      <FullscreenViewerHarness initialSession={session} overlayRoot={overlayRoot} />
    );

    const dialog = await waitFor(() => within(overlayRoot).getByRole("dialog", { name: "Image viewer" }));
    expect(dialog).toBeInTheDocument();

    const backdrop = overlayRoot.querySelector(".docsera-image-viewer__backdrop") as HTMLButtonElement | null;
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);

    await waitFor(() => {
      expect(overlayRoot.querySelector(".docsera-image-viewer--closing")).not.toBeNull();
    });

    const viewerSurface = overlayRoot.querySelector(".docsera-image-viewer__surface") as HTMLElement | null;
    expect(viewerSurface).not.toBeNull();
    fireEvent.transitionEnd(viewerSurface!);

    await waitFor(() => {
      expect(within(overlayRoot).queryByRole("dialog", { name: "Image viewer" })).not.toBeInTheDocument();
      expect(restoreButton).toHaveFocus();
    });

    overlayRoot.remove();
    restoreButton.remove();
  });

  it("locks viewport scrolling while the fullscreen viewer is open and restores the prior scroll position on close", async () => {
    const overlayRoot = document.createElement("div");
    document.body.append(overlayRoot);
    const restoreButton = document.createElement("button");
    restoreButton.type = "button";
    restoreButton.textContent = "Restore focus";
    document.body.append(restoreButton);
    const sourceElement = document.createElement("div");
    Object.defineProperty(sourceElement, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(120, 100, 320, 180)
    });
    const imageElement = document.createElement("img");
    Object.defineProperty(imageElement, "src", {
      configurable: true,
      value: "blob:viewer"
    });
    Object.defineProperty(imageElement, "currentSrc", {
      configurable: true,
      value: "blob:viewer"
    });
    Object.defineProperty(imageElement, "naturalWidth", {
      configurable: true,
      value: 1920
    });
    Object.defineProperty(imageElement, "naturalHeight", {
      configurable: true,
      value: 1080
    });
    const originalScrollX = Object.getOwnPropertyDescriptor(window, "scrollX");
    const originalScrollY = Object.getOwnPropertyDescriptor(window, "scrollY");
    const scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => undefined);
    Object.defineProperty(window, "scrollX", {
      configurable: true,
      value: 72
    });
    Object.defineProperty(window, "scrollY", {
      configurable: true,
      value: 144
    });

    try {
      const session = createImageFullscreenViewerSession({
        alt: "Architecture diagram",
        imageElement,
        restoreFocusElement: restoreButton,
        sourceElement
      });

      render(
        <FullscreenViewerHarness initialSession={session} overlayRoot={overlayRoot} />
      );

      const dialog = await waitFor(() => within(overlayRoot).getByRole("dialog", { name: "Image viewer" }));
      expect(dialog).toBeInTheDocument();
      expect(document.documentElement.style.overflow).toBe("hidden");
      expect(document.body.style.overflow).toBe("hidden");

      const wheelEvent = new WheelEvent("wheel", { bubbles: true, cancelable: true, deltaY: 120 });
      dialog.dispatchEvent(wheelEvent);
      expect(wheelEvent.defaultPrevented).toBe(true);

      const touchEvent = new Event("touchmove", { bubbles: true, cancelable: true });
      dialog.dispatchEvent(touchEvent);
      expect(touchEvent.defaultPrevented).toBe(true);

      const keyEvent = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "PageDown" });
      dialog.dispatchEvent(keyEvent);
      expect(keyEvent.defaultPrevented).toBe(true);

      const backdrop = overlayRoot.querySelector(".docsera-image-viewer__backdrop") as HTMLButtonElement | null;
      expect(backdrop).not.toBeNull();
      fireEvent.click(backdrop!);

      await waitFor(() => {
        expect(overlayRoot.querySelector(".docsera-image-viewer--closing")).not.toBeNull();
      });

      const viewerSurface = overlayRoot.querySelector(".docsera-image-viewer__surface") as HTMLElement | null;
      expect(viewerSurface).not.toBeNull();
      fireEvent.transitionEnd(viewerSurface!);

      await waitFor(() => {
        expect(within(overlayRoot).queryByRole("dialog", { name: "Image viewer" })).not.toBeInTheDocument();
        expect(restoreButton).toHaveFocus();
      });

      expect(scrollToSpy).toHaveBeenCalledWith(72, 144);
      expect(document.documentElement.style.overflow).toBe("");
      expect(document.body.style.overflow).toBe("");
    } finally {
      scrollToSpy.mockRestore();
      if (originalScrollX) {
        Object.defineProperty(window, "scrollX", originalScrollX);
      } else {
        Reflect.deleteProperty(window, "scrollX");
      }
      if (originalScrollY) {
        Object.defineProperty(window, "scrollY", originalScrollY);
      } else {
        Reflect.deleteProperty(window, "scrollY");
      }
      overlayRoot.remove();
      restoreButton.remove();
    }
  });

  it("keeps the fullscreen close button available to Space and Enter while Escape still dismisses the viewer", async () => {
    const overlayRoot = document.createElement("div");
    document.body.append(overlayRoot);
    const restoreButton = document.createElement("button");
    restoreButton.type = "button";
    restoreButton.textContent = "Restore focus";
    document.body.append(restoreButton);
    const sourceElement = document.createElement("div");
    Object.defineProperty(sourceElement, "getBoundingClientRect", {
      configurable: true,
      value: () => new DOMRect(120, 100, 320, 180)
    });
    const imageElement = document.createElement("img");
    Object.defineProperty(imageElement, "src", {
      configurable: true,
      value: "blob:viewer"
    });
    Object.defineProperty(imageElement, "currentSrc", {
      configurable: true,
      value: "blob:viewer"
    });
    Object.defineProperty(imageElement, "naturalWidth", {
      configurable: true,
      value: 1920
    });
    Object.defineProperty(imageElement, "naturalHeight", {
      configurable: true,
      value: 1080
    });

    try {
      const session = createImageFullscreenViewerSession({
        alt: "Architecture diagram",
        imageElement,
        restoreFocusElement: restoreButton,
        sourceElement
      });

      render(
        <FullscreenViewerHarness initialSession={session} overlayRoot={overlayRoot} />
      );

      const dialog = await waitFor(() => overlayRoot.querySelector(".docsera-image-viewer"));
      expect(dialog).toBeInstanceOf(HTMLElement);
      if (!(dialog instanceof HTMLElement)) {
        throw new Error("Expected the fullscreen viewer dialog to render.");
      }
      const closeButton = overlayRoot.querySelector(".docsera-image-viewer__close");
      expect(closeButton).toBeInstanceOf(HTMLButtonElement);
      if (!(closeButton instanceof HTMLButtonElement)) {
        throw new Error("Expected the fullscreen close button to render.");
      }

      const spaceEvent = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: " " });
      closeButton.dispatchEvent(spaceEvent);
      expect(spaceEvent.defaultPrevented).toBe(false);

      const enterEvent = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key: "Enter" });
      closeButton.dispatchEvent(enterEvent);
      expect(enterEvent.defaultPrevented).toBe(false);

      fireEvent.keyDown(dialog, { key: "Escape" });
      await waitFor(() => {
        expect(overlayRoot.querySelector(".docsera-image-viewer--closing")).not.toBeNull();
      });

      const viewerSurface = overlayRoot.querySelector(".docsera-image-viewer__surface") as HTMLElement | null;
      expect(viewerSurface).not.toBeNull();
      fireEvent.transitionEnd(viewerSurface!);

      await waitFor(() => {
        expect(within(overlayRoot).queryByRole("dialog", { name: "Image viewer" })).not.toBeInTheDocument();
        expect(restoreButton).toHaveFocus();
      });
    } finally {
      overlayRoot.remove();
      restoreButton.remove();
    }
  });

  it("rejects an invalid initial envelope before editor mount", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(() =>
      renderRuntime({
        initialEnvelope: {
          schemaVersion: 1,
          document: {
            type: "doc",
            content: [
              {
                type: "image",
                attrs: {
                  mediaId: "",
                  src: "https://example.com/image.png"
                }
              }
            ]
          }
        } as never
      })
    ).toThrow("valid TipTap document");

    consoleErrorSpy.mockRestore();
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
    expect(editor.view.dom.firstElementChild).toHaveAttribute("data-placeholder", "Start typing or press '/' for commands");
    fireEvent.click(container.querySelector(".ProseMirror")!);
    await act(async () => {
      editor.commands.focus("start", { scrollIntoView: false });
      editor.commands.setTextSelection(1);
    });
    await runAutosave();
    expect(onSaveDraft).toHaveBeenCalledTimes(0);
  });

  it("does not treat a retargeted ProseMirror root click above the last content block as a blank-canvas mutation", async () => {
    const initialEnvelope = createEnvelopeFromDocument({
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Overview" }]
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Body copy" }]
        }
      ]
    });
    const { editorReady, onSaveDraft, container } = renderRuntime({ initialEnvelope });
    await waitFor(() => expect(editorReady[0]).toBeDefined());

    const proseMirror = container.querySelector(".ProseMirror") as HTMLElement | null;
    expect(proseMirror).not.toBeNull();

    const lastContentElement = proseMirror?.lastElementChild as HTMLElement | null;
    expect(lastContentElement).not.toBeNull();

    Object.defineProperty(lastContentElement, "getBoundingClientRect", {
      configurable: true,
      value: () => ({
        bottom: 240,
        height: 24,
        left: 0,
        right: 100,
        top: 216,
        width: 100,
        x: 0,
        y: 216,
        toJSON() {
          return this;
        }
      })
    });

    fireEvent.click(proseMirror!, { clientY: 200 });
    await runAutosave();

    expect(editorReady[0].getJSON()).toEqual(initialEnvelope.document);
    expect(onSaveDraft).toHaveBeenCalledTimes(0);
  });

  it("allows ordinary editor mouse and click interactions to reach outer document handlers", async () => {
    const initialEnvelope = createEnvelopeFromDocument({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Body copy" }]
        }
      ]
    });
    const documentMouseDown = vi.fn();
    const documentClick = vi.fn();
    document.addEventListener("mousedown", documentMouseDown);
    document.addEventListener("click", documentClick);

    try {
      const { container } = renderRuntime({ initialEnvelope });
      const proseMirror = await waitFor(() => {
        const element = container.querySelector(".ProseMirror") as HTMLElement | null;
        expect(element).not.toBeNull();
        return element!;
      });
      const paragraph = proseMirror.querySelector("p");
      expect(paragraph).not.toBeNull();
      const originalElementFromPoint = document.elementFromPoint?.bind(document);
      Object.defineProperty(document, "elementFromPoint", {
        configurable: true,
        value: () => paragraph
      });

      fireEvent.mouseDown(paragraph!);
      fireEvent.click(paragraph!, { clientY: 120 });

      expect(documentMouseDown).toHaveBeenCalledTimes(1);
      expect(documentClick).toHaveBeenCalledTimes(1);
      if (originalElementFromPoint) {
        Object.defineProperty(document, "elementFromPoint", {
          configurable: true,
          value: originalElementFromPoint
        });
      }
    } finally {
      document.removeEventListener("mousedown", documentMouseDown);
      document.removeEventListener("click", documentClick);
    }
  });

  it("does not replace the mounted ProseMirror root when callback props refresh", async () => {
    const initialEnvelope = createEnvelopeFromDocument({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Body copy" }]
        }
      ]
    });
    const firstOutlineChange = vi.fn();
    const firstEditorReady = vi.fn();
    const { container, rerender } = renderRuntime({
      initialEnvelope,
      onEditorReady: firstEditorReady,
      onOutlineChange: firstOutlineChange
    });

    const originalProseMirror = await waitFor(() => {
      const element = container.querySelector(".ProseMirror") as HTMLElement | null;
      expect(element).not.toBeNull();
      return element!;
    });

    rerender(
      <PageEditorHostRuntime
        canEdit={true}
        initialEnvelope={initialEnvelope}
        initialRevision={0}
        onAccessLost={vi.fn()}
        onEditorReady={vi.fn()}
        onOutlineChange={vi.fn()}
        onSaveDraft={vi.fn(async (): Promise<PageBodySaveResult> => ({
          state: "succeeded",
          page: createSuccessPage(1)
        }))}
        onStatusChange={vi.fn()}
        overlayRoot={document.querySelector("[data-docsera-editor-runtime-overlay-root='true']") as HTMLElement}
        pageSysId="page-001"
        theme="light"
      />
    );

    const currentProseMirror = await waitFor(() => {
      const element = container.querySelector(".ProseMirror") as HTMLElement | null;
      expect(element).not.toBeNull();
      return element!;
    });

    expect(currentProseMirror).toBe(originalProseMirror);
    expect(originalProseMirror.isConnected).toBe(true);
  });

  it("keeps the editor instance, ProseMirror node, focus, and caret stable when a successful save refreshes same-session props", async () => {
    let resolveSave: ((value: PageBodySaveResult) => void) | null = null;
    const externalSave = vi.fn(
      () =>
        new Promise<PageBodySaveResult>((resolve) => {
          resolveSave = resolve;
        })
    );
    const statusChanges = vi.fn();
    const editorReady: Array<Parameters<NonNullable<Parameters<typeof PageEditorHostRuntime>[0]["onEditorReady"]>>[0]> = [];
    const overlayRoot = document.createElement("div");
    overlayRoot.dataset.docseraEditorRuntimeOverlayRoot = "true";
    document.body.append(overlayRoot);
    const initialEnvelope = createEnvelopeFromDocument({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha Beta" }]
        }
      ]
    });

    const view = render(
      <SaveAcknowledgeHarness
        initialEnvelope={initialEnvelope}
        onEditorReady={(editor) => {
          editorReady.push(editor);
          const editorView = editor.view as typeof editor.view & { scrollToSelection: () => void };
          editorView.scrollToSelection = () => undefined;
        }}
        onSaveDraft={externalSave}
        onStatusChange={statusChanges}
        overlayRoot={overlayRoot}
      />
    );

    const editor = await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
      return editorReady[0]!;
    });
    const proseMirror = await waitFor(() => {
      const element = view.container.querySelector(".ProseMirror") as HTMLElement | null;
      expect(element).not.toBeNull();
      return element!;
    });

    await act(async () => {
      proseMirror.focus();
      editor.commands.setTextSelection(7);
      editor.commands.insertContent("X");
    });
    const selectionBeforeSave = {
      anchor: editor.state.selection.anchor,
      from: editor.state.selection.from,
      head: editor.state.selection.head,
      to: editor.state.selection.to
    };

    await runAutosave();
    await waitFor(() => {
      expect(statusChanges).toHaveBeenLastCalledWith(expect.objectContaining({ status: "Saving…" }));
    });

    await act(async () => {
      resolveSave?.({
        state: "succeeded",
        page: {
          ...createSuccessPage(1),
          draftContentJson: createEnvelopeFromDocument(editor.getJSON()),
          draftRevision: 1
        }
      });
    });

    await waitFor(() => {
      expect(statusChanges).toHaveBeenLastCalledWith(expect.objectContaining({ status: "Saved" }));
    });

    expect(editorReady).toHaveLength(1);
    expect(view.container.querySelector(".ProseMirror")).toBe(proseMirror);
    expect(proseMirror.isConnected).toBe(true);
    expect(document.activeElement).toBe(proseMirror);
    expect(editor.isFocused).toBe(true);
    expect(editor.state.selection.from).toBe(selectionBeforeSave.from);
    expect(editor.state.selection.to).toBe(selectionBeforeSave.to);
    expect(editor.state.selection.anchor).toBe(selectionBeforeSave.anchor);
    expect(editor.state.selection.head).toBe(selectionBeforeSave.head);

    await act(async () => {
      editor.view.dispatch(editor.state.tr.insertText("Y", editor.state.selection.from, editor.state.selection.to));
    });

    expect(document.activeElement).toBe(proseMirror);
    expect(editor.getText()).toContain("Alpha XYBeta");
  });

  it("keeps the active editor and current selection stable while a newer edit queues behind an in-flight save", async () => {
    let resolveFirstSave: ((value: PageBodySaveResult) => void) | null = null;
    const externalSave = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<PageBodySaveResult>((resolve) => {
            resolveFirstSave = resolve;
          })
      )
      .mockResolvedValueOnce({
        state: "succeeded",
        page: {
          ...createSuccessPage(2),
          draftContentJson: createEnvelopeFromDocument({
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Alpha XZBeta" }]
              }
            ]
          }),
          draftRevision: 2
        }
      } satisfies PageBodySaveResult);
    const statusChanges = vi.fn();
    const editorReady: Array<Parameters<NonNullable<Parameters<typeof PageEditorHostRuntime>[0]["onEditorReady"]>>[0]> = [];
    const overlayRoot = document.createElement("div");
    overlayRoot.dataset.docseraEditorRuntimeOverlayRoot = "true";
    document.body.append(overlayRoot);
    const initialEnvelope = createEnvelopeFromDocument({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Alpha Beta" }]
        }
      ]
    });

    const view = render(
      <SaveAcknowledgeHarness
        initialEnvelope={initialEnvelope}
        onEditorReady={(editor) => {
          editorReady.push(editor);
          const editorView = editor.view as typeof editor.view & { scrollToSelection: () => void };
          editorView.scrollToSelection = () => undefined;
        }}
        onSaveDraft={externalSave}
        onStatusChange={statusChanges}
        overlayRoot={overlayRoot}
      />
    );

    const editor = await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
      return editorReady[0]!;
    });
    const proseMirror = await waitFor(() => {
      const element = view.container.querySelector(".ProseMirror") as HTMLElement | null;
      expect(element).not.toBeNull();
      return element!;
    });

    await act(async () => {
      proseMirror.focus();
      editor.commands.setTextSelection(7);
      editor.commands.insertContent("X");
    });

    await runAutosave();
    await waitFor(() => {
      expect(statusChanges).toHaveBeenLastCalledWith(expect.objectContaining({ status: "Saving…" }));
    });

    await act(async () => {
      editor.commands.insertContent("Z");
    });
    const selectionDuringSave = {
      anchor: editor.state.selection.anchor,
      from: editor.state.selection.from,
      head: editor.state.selection.head,
      to: editor.state.selection.to
    };

    await act(async () => {
      resolveFirstSave?.({
        state: "succeeded",
        page: {
          ...createSuccessPage(1),
          draftContentJson: createEnvelopeFromDocument({
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Alpha XBeta" }]
              }
            ]
          }),
          draftRevision: 1
        }
      });
    });

    await waitFor(() => {
      expect(externalSave).toHaveBeenCalledTimes(2);
    });

    expect(editorReady).toHaveLength(1);
    expect(view.container.querySelector(".ProseMirror")).toBe(proseMirror);
    expect(document.activeElement).toBe(proseMirror);
    expect(editor.state.selection.from).toBe(selectionDuringSave.from);
    expect(editor.state.selection.to).toBe(selectionDuringSave.to);
    expect(editor.state.selection.anchor).toBe(selectionDuringSave.anchor);
    expect(editor.state.selection.head).toBe(selectionDuringSave.head);
    expect(externalSave.mock.calls[1]?.[0]).toMatchObject({
      expectedRevision: 1,
      pageSysId: "page-001"
    });

    await waitFor(() => {
      expect(statusChanges).toHaveBeenLastCalledWith(expect.objectContaining({ status: "Saved" }));
    });
    expect(editor.getText()).toContain("Alpha XZBeta");
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
    expect(runtimeStyle).not.toContain("--docsera-editor-surface");
    expect(runtimeStyle).not.toContain(".docsera-editor-runtime__overlay");
    expect(runtimeStyle).not.toContain(".docsera-editor-runtime__overlay-button");
    expect(runtimeStyle).not.toContain(".docsera-editor-runtime__save-button");
    expect(runtimeStyle).toContain(".docsera-image-picker__backdrop");
    expect(runtimeStyle).toContain(".docsera-modal__surface.docsera-image-picker");
    expect(runtimeStyle).toContain(".docsera-image-picker__library-scroll");
    expect(runtimeStyle).toContain(":host-context(html[data-docsera-theme=\"dark\"]) .docsera-image-picker__backdrop");
    expect(runtimeStyle).toContain("scroll-padding-top: var(--docsera-workspace-heading-scroll-margin);");
    expect(runtimeStyle).toContain("scroll-margin-top: var(--docsera-workspace-heading-scroll-margin);");
  });

  it("mounts the expanded heading and mark contract without normalizing away H1, underline, highlight, superscript, or subscript", async () => {
    const supportedEnvelope = createExpandedTextFormattingDocseraDocumentEnvelope();
    const { editorReady } = renderRuntime({ initialEnvelope: supportedEnvelope });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    expect(editorReady[0].getJSON()).toEqual(supportedEnvelope.document);
  });

  it("disables TipTap trailing-node ownership so end-of-document paragraphs only come from explicit editor actions or native block transitions", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/shared/editor/schema.ts`,
      "utf8"
    );

    expect(source).toContain("trailingNode: false");
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
        "<h1>Getting started</h1>",
        "<h2>Overview</h2>",
        "<p><strong>Bold</strong> <em>italic</em> <u>underline</u> <s>strike</s> <code>code</code> <a href=\"https://example.com/docs\">link</a> <mark style=\"background-color:#00ff00\">highlight</mark> H<sub>2</sub> x<sup>2</sup></p>",
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
          attrs: { level: 1 },
          content: [{ type: "text", text: "Getting started" }]
        },
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

    const paragraph = (json.content?.[2] as { content?: Array<{ marks?: Array<{ type: string }> }> } | undefined)?.content ?? [];
    const paragraphMarkTypes = paragraph.flatMap((node) => node.marks?.map((mark) => mark.type) ?? []);
    expect(paragraphMarkTypes).toEqual(expect.arrayContaining(["bold", "italic", "underline", "strike", "code", "link", "highlight", "subscript", "superscript"]));
    expect(JSON.stringify(json)).not.toContain("background-color");
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

  it("keeps a restored unsaved snapshot dirty without autosaving it on mount, and the first real edit still saves", async () => {
    const restoredEnvelope = createEnvelopeFromDocument({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Recovered draft" }]
        }
      ]
    });
    const { editorReady, onSaveDraft, onStatusChange } = renderRuntime({
      initialEnvelope: restoredEnvelope,
      initialSavedEnvelope: createEmptyDocseraDocumentEnvelope()
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    expect(onStatusChange).toHaveBeenLastCalledWith(expect.objectContaining({ isDirty: true, status: "Unsaved" }));
    await runAutosave();
    expect(onSaveDraft).toHaveBeenCalledTimes(0);

    await act(async () => {
      editorReady[0].commands.insertContent(" plus one edit");
    });

    expect(onStatusChange).toHaveBeenLastCalledWith(expect.objectContaining({ isDirty: true, status: "Unsaved" }));
    await runAutosave();

    await waitFor(() => {
      expect(onSaveDraft).toHaveBeenCalledTimes(1);
    });
    expect(onSaveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        draftContentJson: createEnvelopeFromDocument({
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: " plus one editRecovered draft" }]
            }
          ]
        }),
        expectedRevision: 0,
        pageSysId: "page-001"
      })
    );
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
});

