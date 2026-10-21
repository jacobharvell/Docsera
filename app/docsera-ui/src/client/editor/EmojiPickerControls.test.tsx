/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmojiPickerControls } from "./EmojiPickerControls";

const mountedEditors = new Set<Editor>();

function createEditor(content = "<p>Hello world</p>") {
  const element = document.createElement("div");
  document.body.append(element);
  const editor = new Editor({ element, extensions: [StarterKit], content });
  mountedEditors.add(editor);
  return editor;
}

function renderControls(editor: Editor, canEdit = true) {
  return render(<EmojiPickerControls canEdit={canEdit} editor={editor} ownerDocument={document} />);
}

async function select(editor: Editor, from: number, to = from) {
  await act(async () => {
    editor.commands.setTextSelection({ from, to });
    editor.view.focus();
  });
}

function openPicker() {
  fireEvent.click(screen.getByRole("button", { name: "Insert emoji" }));
  const picker = screen.getByRole("dialog", { name: "Emoji picker" });
  expect(picker).toHaveClass("docsera-editor-dropdown--enter");
  return picker;
}

afterEach(() => {
  for (const editor of mountedEditors) {
    if (!editor.isDestroyed) editor.destroy();
  }
  mountedEditors.clear();
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("EmojiPickerControls", () => {
  it("provides reduced-motion overrides for every editor entrance variant", () => {
    renderControls(createEditor());
    const styles = document.querySelector(".docsera-emoji-picker-controls style")?.textContent ?? "";
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*dropdown--enter[\s\S]*dropdown--fade-enter[\s\S]*dropdown--shift-enter[\s\S]*animation: none/);
  });

  it("overrides global SVG sizing with compact 15px picker icon dimensions", () => {
    const editor = createEditor();
    const globalSvgStyle = document.createElement("style");
    globalSvgStyle.textContent = "svg { width: 100%; height: 100%; }";
    document.head.append(globalSvgStyle);
    try {
      renderControls(editor);

      const icon = screen.getByRole("button", { name: "Insert emoji" }).querySelector("svg");
      expect(icon).not.toBeNull();
      expect(getComputedStyle(icon!).width).toBe("15px");
      expect(getComputedStyle(icon!).height).toBe("15px");
      expect(icon).toHaveAttribute("stroke-width", "2.2");
    } finally {
      globalSvgStyle.remove();
    }
  });

  it("inserts a Unicode emoji at the captured caret and keeps it as normal text", async () => {
    const editor = createEditor();
    renderControls(editor);
    await select(editor, 6);

    openPicker();
    fireEvent.click(screen.getByRole("button", { name: "Technologist" }));

    await waitFor(() => expect(editor.getText()).toBe("Hello🧑‍💻 world"));
    expect(JSON.stringify(editor.getJSON())).toContain("🧑‍💻");
    expect(document.activeElement).toBe(editor.view.dom);
  });

  it("replaces the captured text selection with a chosen emoji", async () => {
    const editor = createEditor();
    renderControls(editor);
    await select(editor, 7, 12);

    openPicker();
    fireEvent.click(screen.getByRole("button", { name: "Party popper" }));

    await waitFor(() => expect(editor.getText()).toBe("Hello 🎉"));
  });

  it("creates one ordinary undoable document edit and supports redo", async () => {
    const editor = createEditor("<p>Hello</p>");
    renderControls(editor);
    await select(editor, 6);

    openPicker();
    fireEvent.click(screen.getByRole("button", { name: "Red heart" }));
    await waitFor(() => expect(editor.getText()).toBe("Hello❤️"));

    await act(async () => { editor.commands.undo(); });
    expect(editor.getText()).toBe("Hello");
    await act(async () => { editor.commands.redo(); });
    expect(editor.getText()).toBe("Hello❤️");
  });

  it("searches common emoji across categories and exposes native labeled buttons in an accessible group", () => {
    const editor = createEditor();
    renderControls(editor);
    openPicker();
    const search = screen.getByRole("searchbox", { name: "Search emoji" }) as HTMLInputElement;

    fireEvent.change(search, { target: { value: "pizza" } });
    expect(screen.getByRole("button", { name: "Pizza" })).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "shield" } });
    expect(screen.getByRole("button", { name: "Shield" })).toBeInTheDocument();
    fireEvent.change(search, { target: { value: "developer" } });
    expect(screen.getByRole("button", { name: "Technologist" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Emoji choices" })).toBeInTheDocument();
    expect(screen.queryByRole("grid")).not.toBeInTheDocument();
  });

  it("preserves Left and Right cursor movement in search, then moves predictably between search and results", async () => {
    const editor = createEditor();
    renderControls(editor);
    await select(editor, 6);

    openPicker();
    const search = screen.getByRole("searchbox", { name: "Search emoji" }) as HTMLInputElement;
    expect(search).toHaveFocus();
    fireEvent.change(search, { target: { value: "rocket" } });
    search.setSelectionRange(4, 4);
    fireEvent.keyDown(search, { key: "ArrowLeft" });
    expect(search.selectionStart).toBe(4);
    fireEvent.keyDown(search, { key: "ArrowRight" });
    expect(search.selectionStart).toBe(4);
    expect(screen.getByRole("button", { name: "Rocket" })).toBeInTheDocument();
    fireEvent.keyDown(search, { key: "ArrowDown" });
    const rocket = screen.getByRole("button", { name: "Rocket" });
    expect(rocket).toHaveFocus();
    fireEvent.keyDown(rocket, { key: "ArrowUp" });
    expect(search).toHaveFocus();
    fireEvent.keyDown(search, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Emoji picker" })).not.toBeInTheDocument());
    expect(editor.getText()).toBe("Hello world");
    expect(document.activeElement).toBe(editor.view.dom);
  });

  it("dismisses outside clicks without mutating document content", async () => {
    const editor = createEditor();
    renderControls(editor);
    await select(editor, 6);
    openPicker();

    fireEvent.pointerDown(document.body);

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Emoji picker" })).not.toBeInTheDocument());
    expect(editor.getText()).toBe("Hello world");
  });

  it("invalidates the open picker when its editor session is replaced", async () => {
    const firstEditor = createEditor();
    const secondEditor = createEditor("<p>Second</p>");
    const view = renderControls(firstEditor);
    await select(firstEditor, 6);
    openPicker();

    view.rerender(<EmojiPickerControls canEdit={true} editor={secondEditor} ownerDocument={document} />);

    expect(screen.queryByRole("dialog", { name: "Emoji picker" })).not.toBeInTheDocument();
    expect(secondEditor.getText()).toBe("Second");
  });

  it("does not open when Edit access is unavailable", () => {
    const editor = createEditor();
    renderControls(editor, false);

    expect(screen.getByRole("button", { name: "Insert emoji" })).toBeDisabled();
  });
});
