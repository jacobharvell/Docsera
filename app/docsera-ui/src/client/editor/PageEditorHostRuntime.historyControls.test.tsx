/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { PageBodySaveResult } from "../shared/types/docsera";
import { createEmptyDocseraDocumentEnvelope, type DocseraDocumentEnvelope } from "../../shared/editor/document";
import { PageEditorHostRuntime } from "./PageEditorHostRuntime";
import {
  createEnvelopeFromDocument,
  createSuccessPage,
  renderRuntime,
  runAutosave
} from "./PageEditorHostRuntime.testUtils";

async function waitForEditor(runtime: ReturnType<typeof renderRuntime>) {
  await waitFor(() => expect(runtime.editorReady[0]).toBeDefined());
  return runtime.editorReady[0]!;
}

function createTextEnvelope(text: string): DocseraDocumentEnvelope {
  return createEnvelopeFromDocument({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: text ? [{ type: "text", text }] : undefined
      }
    ]
  });
}

async function insertTextAtEnd(editor: Awaited<ReturnType<typeof waitForEditor>>, text: string) {
  await act(async () => {
    editor.chain().focus("end", { scrollIntoView: false }).insertContent(text).run();
  });
}

describe("PageEditorHostRuntime history controls", () => {
  it("mounts in the active runtime and participates in normal autosave after undo and redo", async () => {
    const onSaveDraft = vi.fn(async (input: { draftContentJson: DocseraDocumentEnvelope }): Promise<PageBodySaveResult> => ({
      state: "succeeded",
      page: {
        ...createSuccessPage(1),
        draftContentJson: input.draftContentJson
      }
    }));
    const runtime = renderRuntime({
      interactionActive: true,
      onSaveDraft
    });
    const editor = await waitForEditor(runtime);

    const undo = screen.getByRole("button", { name: "Undo" });
    const redo = screen.getByRole("button", { name: "Redo" });
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();

    await insertTextAtEnd(editor, "Draft");
    await waitFor(() => expect(undo).toBeEnabled());

    await runAutosave();
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onSaveDraft.mock.calls[0]?.[0].draftContentJson.document).toEqual(editor.getJSON());
    onSaveDraft.mockClear();

    fireEvent.click(undo);
    await waitFor(() => expect(editor.getText()).toBe(""));
    await waitFor(() => expect(redo).toBeEnabled());

    await runAutosave();
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onSaveDraft.mock.calls[0]?.[0].draftContentJson.document).toEqual(editor.getJSON());

    fireEvent.click(redo);
    await waitFor(() => expect(editor.getText()).toBe("Draft"));

    onSaveDraft.mockClear();
    await runAutosave();
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onSaveDraft.mock.calls[0]?.[0].draftContentJson.document).toEqual(editor.getJSON());
  });

  it("portals history controls into the workspace main presentation mount when provided", async () => {
    const historyControlsMount = document.createElement("div");
    historyControlsMount.dataset.docseraEditorHistoryControlsMount = "true";
    document.body.append(historyControlsMount);

    const runtime = renderRuntime({
      historyControlsMount,
      interactionActive: true
    });
    await waitForEditor(runtime);

    const toolbar = screen.getByRole("toolbar", { name: "Editor history" });
    expect(historyControlsMount).toContainElement(toolbar);
  });

  it("keeps the workspace history-control mount sticky without taking layout width and offsets only the rendered controls", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const runtimeShellSource = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    );
    const mountRule =
      runtimeShellSource.match(/\.docsera-main__editor-history-controls-mount\s*\{(?<body>[\s\S]*?)\n\}/)?.groups?.body ?? "";
    const controlsOffsetRule =
      runtimeShellSource.match(
        /\.docsera-main__editor-history-controls-mount\s*>\s*\.docsera-editor-history-controls\s*\{(?<body>[\s\S]*?)\n\}/
      )?.groups?.body ?? "";

    expect(mountRule).toContain("position: sticky;");
    expect(mountRule).toContain("top: 8px;");
    expect(mountRule).toContain("left: calc(100% - 8px);");
    expect(mountRule).toContain("flex: 0 0 0;");
    expect(mountRule).toContain("width: 0;");
    expect(mountRule).toContain("height: 0;");
    expect(mountRule).not.toContain("position: absolute;");
    expect(controlsOffsetRule).toContain("transform: translate(-8px, 8px);");
  });

  it("does not render controls when the visual interaction surface is inactive or read-only", async () => {
    const inactiveRuntime = renderRuntime({
      interactionActive: false
    });
    await waitForEditor(inactiveRuntime);

    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
    inactiveRuntime.unmount();

    const readOnlyRuntime = renderRuntime({
      canEdit: false,
      interactionActive: true
    });
    await waitForEditor(readOnlyRuntime);

    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });

  it("tears down the previous page history and binds a fresh session to its own editor", async () => {
    const firstRuntime = renderRuntime({
      initialEnvelope: createTextEnvelope("First"),
      interactionActive: true,
      pageSysId: "page-001",
      sessionKey: "page-001:1"
    });
    const firstEditor = await waitForEditor(firstRuntime);

    await insertTextAtEnd(firstEditor, " draft");
    await waitFor(() => expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled());
    firstRuntime.unmount();

    const secondRuntime = renderRuntime({
      initialEnvelope: createTextEnvelope("Second"),
      interactionActive: true,
      pageSysId: "page-002",
      sessionKey: "page-002:1"
    });
    const secondEditor = await waitForEditor(secondRuntime);

    const undo = screen.getByRole("button", { name: "Undo" });
    const redo = screen.getByRole("button", { name: "Redo" });
    await waitFor(() => expect(undo).toBeDisabled());
    expect(redo).toBeDisabled();

    await insertTextAtEnd(secondEditor, " draft");
    await waitFor(() => expect(undo).toBeEnabled());
    fireEvent.click(undo);

    await waitFor(() => expect(secondEditor.getText()).toBe("Second"));
    expect(firstEditor.isDestroyed).toBe(true);
  });

  it("clears controls when an active editable session becomes inactive or read-only", async () => {
    const runtime = renderRuntime({
      interactionActive: true
    });
    await waitForEditor(runtime);
    expect(screen.getByRole("button", { name: "Undo" })).toBeInTheDocument();

    runtime.rerender(
      <PageEditorHostRuntime
        canEdit={true}
        interactionActive={false}
        initialEnvelope={createEmptyDocseraDocumentEnvelope()}
        initialRevision={0}
        onAccessLost={runtime.onAccessLost}
        onOutlineChange={runtime.onOutlineChange}
        onSaveDraft={runtime.onSaveDraft}
        onStatusChange={runtime.onStatusChange}
        overlayRoot={runtime.overlayRoot}
        pageSysId="page-001"
        theme="light"
      />
    );
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();

    runtime.rerender(
      <PageEditorHostRuntime
        canEdit={false}
        interactionActive={true}
        initialEnvelope={createEmptyDocseraDocumentEnvelope()}
        initialRevision={0}
        onAccessLost={runtime.onAccessLost}
        onOutlineChange={runtime.onOutlineChange}
        onSaveDraft={runtime.onSaveDraft}
        onStatusChange={runtime.onStatusChange}
        overlayRoot={runtime.overlayRoot}
        pageSysId="page-001"
        theme="light"
      />
    );
    expect(screen.queryByRole("button", { name: "Undo" })).not.toBeInTheDocument();
  });
});
