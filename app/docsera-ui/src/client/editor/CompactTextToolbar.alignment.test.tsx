/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { Editor } from "@tiptap/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  renderRuntime,
  selectText,
  setParagraphText
} from "./PageEditorHostRuntime.testUtils";

async function renderReadyEditor() {
  const runtime = renderRuntime();
  await waitFor(() => {
    expect(runtime.editorReady[0]).toBeDefined();
  });
  return {
    ...runtime,
    editor: runtime.editorReady[0]
  };
}

async function openMoreToolbar() {
  const toolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
  fireEvent.click(within(toolbar).getByRole("button", { name: "More" }));
  return screen.findByRole("toolbar", { name: "More formatting" });
}

function getToolbarButtonNames(toolbar: HTMLElement) {
  return within(toolbar).getAllByRole("button").map((button) => button.getAttribute("aria-label"));
}

async function setContent(editor: Editor, content: Record<string, unknown>) {
  await act(async () => {
    editor.commands.setContent(content);
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("CompactTextToolbar secondary formatting toolbar", () => {
  it("opens a secondary toolbar from More instead of a More menu or Alignment submenu", async () => {
    const { editor } = await renderReadyEditor();
    await setParagraphText(editor, "Formula");
    await selectText(editor, 1, 8);

    const toolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    const moreTrigger = within(toolbar).getByRole("button", { name: "More" });
    fireEvent.click(moreTrigger);

    const moreToolbar = await screen.findByRole("toolbar", { name: "More formatting" });
    expect(moreTrigger).toHaveAttribute("aria-expanded", "true");
    expect(moreTrigger).toHaveClass("docsera-text-toolbar__trigger--active");
    expect(screen.queryByRole("menu", { name: "More" })).toBeNull();
    expect(screen.queryByRole("menu", { name: "Alignment" })).toBeNull();
    expect(screen.queryByText("MORE")).toBeNull();
    expect(screen.queryByText("ALIGNMENT")).toBeNull();
    expect(getToolbarButtonNames(moreToolbar)).toEqual(["Superscript", "Subscript", "Left", "Center", "Right"]);
    expect(moreToolbar.querySelector(".docsera-text-toolbar__divider")).not.toBeNull();
  });

  it("preserves Superscript and Subscript mutual exclusion from the secondary toolbar", async () => {
    const { editor } = await renderReadyEditor();
    await setParagraphText(editor, "Formula");
    await selectText(editor, 1, 8);

    fireEvent.click(within(await openMoreToolbar()).getByRole("button", { name: "Superscript" }));
    await selectText(editor, 1, 8);
    fireEvent.click(within(await openMoreToolbar()).getByRole("button", { name: "Subscript" }));

    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "Formula", marks: [{ type: "subscript" }] }]
    });
    expect(JSON.stringify(editor.getJSON())).not.toContain("superscript");
  });

  it("reports default unset alignment as Left and applies Center and Right without aligning unsupported nodes", async () => {
    const { editor } = await renderReadyEditor();
    await setContent(editor, {
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Para" }] },
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Head" }] },
        { type: "codeBlock", content: [{ type: "text", text: "Code" }] }
      ]
    });
    await selectText(editor, 1, 17);

    let moreToolbar = await openMoreToolbar();
    expect(within(moreToolbar).getByRole("button", { name: "Left" })).toHaveAttribute("aria-pressed", "true");
    expect(within(moreToolbar).getByRole("button", { name: "Center" })).toHaveAttribute("aria-pressed", "false");
    expect(within(moreToolbar).getByRole("button", { name: "Right" })).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(within(moreToolbar).getByRole("button", { name: "Center" }));
    expect(editor.getJSON().content?.[0]).toMatchObject({ type: "paragraph", attrs: { textAlign: "center" } });
    expect(editor.getJSON().content?.[1]).toMatchObject({ type: "heading", attrs: { level: 2, textAlign: "center" } });
    expect(JSON.stringify(editor.getJSON().content?.[2])).not.toContain("textAlign");

    await selectText(editor, 1, 17);
    moreToolbar = await openMoreToolbar();
    expect(within(moreToolbar).getByRole("button", { name: "Center" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(within(moreToolbar).getByRole("button", { name: "Right" }));
    expect(editor.getJSON().content?.[0]).toMatchObject({ type: "paragraph", attrs: { textAlign: "right" } });
    expect(editor.getJSON().content?.[1]).toMatchObject({ type: "heading", attrs: { level: 2, textAlign: "right" } });
    expect(JSON.stringify(editor.getJSON().content?.[2])).not.toContain("textAlign");
  });

  it("clears explicit textAlign when Left is chosen", async () => {
    const { editor } = await renderReadyEditor();
    await setContent(editor, {
      type: "doc",
      content: [
        { type: "paragraph", attrs: { textAlign: "right" }, content: [{ type: "text", text: "Para" }] },
        { type: "heading", attrs: { level: 3, textAlign: "center" }, content: [{ type: "text", text: "Head" }] }
      ]
    });
    await selectText(editor, 1, 11);

    fireEvent.click(within(await openMoreToolbar()).getByRole("button", { name: "Left" }));
    expect(JSON.stringify(editor.getJSON())).not.toContain("textAlign");
  });

  it("shows no active alignment button for mixed supported alignment", async () => {
    const { editor } = await renderReadyEditor();
    await setContent(editor, {
      type: "doc",
      content: [
        { type: "paragraph", attrs: { textAlign: "center" }, content: [{ type: "text", text: "Para" }] },
        { type: "heading", attrs: { level: 2, textAlign: "right" }, content: [{ type: "text", text: "Head" }] }
      ]
    });
    await selectText(editor, 1, 11);

    const moreToolbar = await openMoreToolbar();
    expect(within(moreToolbar).getByRole("button", { name: "Left" })).toHaveAttribute("aria-pressed", "false");
    expect(within(moreToolbar).getByRole("button", { name: "Center" })).toHaveAttribute("aria-pressed", "false");
    expect(within(moreToolbar).getByRole("button", { name: "Right" })).toHaveAttribute("aria-pressed", "false");
  });

  it("keeps toolbar selection ownership when pointerdown starts on a secondary-toolbar control", async () => {
    const { editor } = await renderReadyEditor();
    await setParagraphText(editor, "Align me");
    await selectText(editor, 1, 9);

    const moreToolbar = await openMoreToolbar();
    const centerButton = within(moreToolbar).getByRole("button", { name: "Center" });

    fireEvent.pointerDown(centerButton);
    expect(screen.getByRole("toolbar", { name: "More formatting" })).toBeInTheDocument();
    expect(editor.state.selection.from).toBe(1);
    expect(editor.state.selection.to).toBe(9);

    fireEvent.mouseDown(centerButton);
    expect(JSON.stringify(editor.getJSON())).not.toContain("textAlign");
    expect(screen.getByRole("toolbar", { name: "More formatting" })).toBeInTheDocument();

    fireEvent.click(centerButton);
    expect(editor.getJSON().content?.[0]).toMatchObject({ type: "paragraph", attrs: { textAlign: "center" } });
    expect(screen.queryByRole("toolbar", { name: "More formatting" })).toBeNull();
  });

  it("closes the secondary toolbar on Escape before dismissing the main toolbar", async () => {
    const { editor } = await renderReadyEditor();
    await setParagraphText(editor, "Escape me");
    await selectText(editor, 1, 10);

    await openMoreToolbar();
    expect(editor.state.selection.from).toBe(1);
    expect(editor.state.selection.to).toBe(10);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("toolbar", { name: "More formatting" })).toBeNull();
    expect(await screen.findByRole("toolbar", { name: "Text formatting" })).toBeInTheDocument();
    expect(editor.state.selection.from).toBe(1);
    expect(editor.state.selection.to).toBe(10);

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();
    });
    expect(editor.state.selection.from).toBe(1);
    expect(editor.state.selection.to).toBe(10);
  });

  it("positions the unclamped secondary toolbar above and right-aligned to the main toolbar", async () => {
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function getMockRect(this: HTMLElement) {
      const element = this;
      if (element.classList.contains("docsera-text-toolbar--secondary")) {
        return new DOMRect(0, 0, 172, 36);
      }
      if (element.classList.contains("docsera-text-toolbar")) {
        return new DOMRect(100, 200, 240, 36);
      }
      return new DOMRect(0, 0, 1, 1);
    });

    const { editor } = await renderReadyEditor();
    await setParagraphText(editor, "Place me");
    await selectText(editor, 1, 9);

    const moreToolbar = await openMoreToolbar();
    await waitFor(() => {
      expect(moreToolbar).toHaveStyle({ left: "168px", top: "160px" });
    });
  });
});
