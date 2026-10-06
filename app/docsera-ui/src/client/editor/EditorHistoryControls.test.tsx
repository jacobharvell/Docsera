/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EditorHistoryControls } from "./EditorHistoryControls";

const mountedEditors = new Set<Editor>();

function createEditor(content = "<p>Hello</p>") {
  const element = document.createElement("div");
  document.body.append(element);
  const editor = new Editor({
    element,
    extensions: [StarterKit],
    content
  });
  mountedEditors.add(editor);
  return editor;
}

function renderControls(editor: Editor | null) {
  return render(
    <EditorHistoryControls
      canEdit={true}
      editor={editor}
      ownerDocument={document}
    />
  );
}

async function insertText(editor: Editor, text: string) {
  await act(async () => {
    editor.chain().focus("end", { scrollIntoView: false }).insertContent(text).run();
  });
}

async function waitForEnabled(button: HTMLElement) {
  await waitFor(() => expect(button).toBeEnabled());
}

afterEach(() => {
  for (const editor of mountedEditors) {
    if (!editor.isDestroyed) {
      editor.destroy();
    }
  }
  mountedEditors.clear();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("EditorHistoryControls", () => {
  it("starts with unavailable actions disabled", () => {
    const editor = createEditor();

    renderControls(editor);

    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  });

  it("undoes and redoes a normal editor transaction", async () => {
    const editor = createEditor();
    renderControls(editor);

    await insertText(editor, " world");

    const undo = screen.getByRole("button", { name: "Undo" });
    const redo = screen.getByRole("button", { name: "Redo" });
    await waitForEnabled(undo);
    expect(redo).toBeDisabled();

    fireEvent.click(undo);
    await waitFor(() => expect(editor.getText()).toBe("Hello"));
    await waitForEnabled(redo);

    fireEvent.click(redo);
    await waitFor(() => expect(editor.getText()).toBe("Hello world"));
    await waitForEnabled(undo);
    expect(redo).toBeDisabled();
  });

  it("invalidates redo availability after a new edit", async () => {
    const editor = createEditor();
    renderControls(editor);

    await insertText(editor, " world");
    const undo = screen.getByRole("button", { name: "Undo" });
    const redo = screen.getByRole("button", { name: "Redo" });
    await waitForEnabled(undo);

    fireEvent.click(undo);
    await waitForEnabled(redo);

    await insertText(editor, " again");

    expect(editor.getText()).toBe("Hello again");
    await waitFor(() => expect(redo).toBeDisabled());
  });

  it("reacts to availability changes caused by external editor commands", async () => {
    const editor = createEditor();
    renderControls(editor);

    const undo = screen.getByRole("button", { name: "Undo" });
    const redo = screen.getByRole("button", { name: "Redo" });
    expect(undo).toBeDisabled();

    await insertText(editor, " external");
    await waitForEnabled(undo);

    await act(async () => {
      editor.commands.undo();
    });

    await waitFor(() => expect(undo).toBeDisabled());
    await waitForEnabled(redo);
  });

  it("binds availability and commands to the replacement editor", async () => {
    const firstEditor = createEditor("<p>First</p>");
    const secondEditor = createEditor("<p>Second</p>");
    const view = renderControls(firstEditor);

    await insertText(firstEditor, " draft");
    await waitForEnabled(screen.getByRole("button", { name: "Undo" }));

    view.rerender(
      <EditorHistoryControls
        canEdit={true}
        editor={secondEditor}
        ownerDocument={document}
      />
    );

    const undo = screen.getByRole("button", { name: "Undo" });
    await waitFor(() => expect(undo).toBeDisabled());

    await insertText(secondEditor, " draft");
    await waitForEnabled(undo);
    fireEvent.click(undo);

    await waitFor(() => expect(secondEditor.getText()).toBe("Second"));
    expect(firstEditor.getText()).toBe("First draft");
  });

  it("exposes accessible controls with styled tooltip wrappers", () => {
    const editor = createEditor();

    renderControls(editor);

    expect(screen.getByRole("toolbar", { name: "Editor history" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toHaveClass("docsera-editor-history-controls__button");
    expect(screen.getByRole("button", { name: "Redo" })).toHaveClass("docsera-editor-history-controls__button");
  });

  it("keeps the control group visually unframed while preserving compact buttons", () => {
    const editor = createEditor();

    renderControls(editor);

    const styles = screen.getByRole("toolbar", { name: "Editor history" }).querySelector("style")?.textContent ?? "";
    const groupRule = styles.match(/\.docsera-editor-history-controls\s*\{(?<body>[^}]*)\}/)?.groups?.body ?? "";
    expect(groupRule).not.toMatch(/border:/);
    expect(groupRule).not.toMatch(/background:/);
    expect(groupRule).not.toMatch(/box-shadow:/);
    expect(groupRule).not.toMatch(/border-radius:/);
    expect(groupRule).not.toMatch(/padding:/);
    expect(styles).toMatch(/\.docsera-editor-history-controls__button\s*\{[^}]*width:\s*24px;[^}]*height:\s*24px;/s);
  });

  it("preserves pointer selection on press and activates only from click", async () => {
    const editor = createEditor();
    renderControls(editor);
    await insertText(editor, " one");
    await act(async () => {
      editor.view.dispatch(closeHistory(editor.state.tr));
    });
    await insertText(editor, " two");

    const undo = screen.getByRole("button", { name: "Undo" });
    await waitForEnabled(undo);

    expect(fireEvent.pointerDown(undo)).toBe(false);
    expect(fireEvent.mouseDown(undo)).toBe(false);
    expect(editor.getText()).toBe("Hello one two");

    fireEvent.click(undo);

    await waitFor(() => expect(editor.getText()).toBe("Hello one"));

    await insertText(editor, " twice");
    fireEvent.click(undo);

    await waitFor(() => expect(editor.getText()).toBe("Hello one"));
  });
});
