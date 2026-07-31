/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { createEmptyDocseraDocumentEnvelope } from "../../shared/editor/document";
import type { PageBodySaveResult } from "../shared/types/docsera";
import { describe, expect, it, vi } from "vitest";
import { PageEditorHostRuntime } from "./PageEditorHostRuntime";
import {
  createEnvelopeFromDocument,
  createOverlayOwnerDocumentHarness,
  createSuccessPage,
  openLinkSurface,
  openSlashQuery,
  pasteIntoEditor,
  renderRuntime,
  runAutosave,
  selectText,
  setOverlayOwnerViewport,
  setParagraphText
} from "./PageEditorHostRuntime.testUtils";

describe("PageEditorHostRuntime", () => {
  it("keeps the same editor instance across a rerender for the same page", async () => {
    const { editorReady, rerender, onOutlineChange, onSaveDraft, onStatusChange, overlayRoot, onAccessLost } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const initialEditor = editorReady[0];
    rerender(
      <PageEditorHostRuntime
        canEdit={true}
        initialEnvelope={createEmptyDocseraDocumentEnvelope()}
        initialRevision={0}
        onAccessLost={onAccessLost}
        onOutlineChange={onOutlineChange}
        onSaveDraft={onSaveDraft}
        onEditorReady={(editor) => {
          editorReady[0] = editor;
        }}
        onStatusChange={onStatusChange}
        overlayRoot={overlayRoot}
        pageSysId="page-001"
        theme="light"
      />
    );

    expect(editorReady[0]).toBe(initialEditor);
  });

  it("opens slash only for eligible queries, filters results, and dismisses on Escape", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor, "he");

    const slashMenu = await screen.findByRole("listbox", { name: "Slash command menu" });
    expect(within(slashMenu).getByRole("option", { name: /Heading 1/ })).toBeInTheDocument();
    expect(within(slashMenu).getByRole("option", { name: /Heading 2/ })).toBeInTheDocument();
    expect(within(slashMenu).getByRole("option", { name: /Heading 3/ })).toBeInTheDocument();

    fireEvent.keyDown(editor.view.dom, { key: "Escape" });
    expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();

    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "/he" }] }]
    });

    await act(async () => {
      editor.commands.setContent({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "foo/bar" }]
          }
        ]
      });
    });
    expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();
  });

  it("supports arrow navigation, Enter execution, and pointer execution for slash commands", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor, "he");

    fireEvent.keyDown(editor.view.dom, { key: "ArrowDown" });
    fireEvent.keyDown(editor.view.dom, { key: "ArrowDown" });
    fireEvent.keyDown(editor.view.dom, { key: "Enter" });

    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "heading",
      attrs: { level: 3 }
    });
    expect(editor.getJSON().content?.[1]).toMatchObject({ type: "paragraph" });

    await setParagraphText(editor, "");
    await openSlashQuery(editor);
    fireEvent.click(await screen.findByRole("option", { name: /Blockquote/ }));

    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "blockquote",
      content: [{ type: "paragraph" }]
    });
  });

  it.each([
    ["Paragraph", { type: "doc", content: [{ type: "paragraph" }] }],
    ["Heading 1", { type: "doc", content: [{ type: "heading", attrs: { level: 1 } }] }],
    ["Heading 2", { type: "doc", content: [{ type: "heading", attrs: { level: 2 } }] }],
    ["Heading 3", { type: "doc", content: [{ type: "heading", attrs: { level: 3 } }] }],
    ["Bulleted list", { type: "doc", content: [{ type: "bulletList" }] }],
    ["Numbered list", { type: "doc", content: [{ type: "orderedList" }] }],
    ["Task list", { type: "doc", content: [{ type: "taskList" }] }],
    ["Blockquote", { type: "doc", content: [{ type: "blockquote" }] }],
    [
      "Horizontal rule",
      {
        type: "doc",
        content: [
          { type: "horizontalRule" },
          { type: "paragraph" }
        ]
      }
    ],
    ["Code block", { type: "doc", content: [{ type: "codeBlock" }] }]
  ])("produces canonical JSON for slash command %s", async (label, expected) => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor);

    fireEvent.click(await screen.findByRole("option", { name: new RegExp(label, "i") }));
    expect(editor.getJSON().content?.[0]).toMatchObject(expected.content[0]);
    if (label === "Horizontal rule") {
      expect(editor.getJSON().content?.[1]).toMatchObject(expected.content[1]);
    }
  });

  it("shows the formatting bubble for text selections and applies core mark toggles and shortcuts", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Hello world");
    await selectText(editor, 1, 6);

    const toolbar = await screen.findByRole("toolbar", { name: "Text formatting" });
    const boldButton = within(toolbar).getByRole("button", { name: "Bold" });
    expect(boldButton).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(boldButton);
    expect(within(toolbar).getByRole("button", { name: "Bold" })).toHaveAttribute("aria-pressed", "true");
    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "paragraph",
      content: [
        { type: "text", text: "Hello", marks: [{ type: "bold" }] },
        { type: "text", text: " world" }
      ]
    });

    await setParagraphText(editor, "Hello world");
    await selectText(editor, 1, 6);
    fireEvent.keyDown(editor.view.dom, { key: "i", ctrlKey: true });
    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "paragraph",
      content: [
        { type: "text", text: "Hello", marks: [{ type: "italic" }] },
        { type: "text", text: " world" }
      ]
    });
  });

  it.each([
    ["Bold", { type: "bold" }],
    ["Italic", { type: "italic" }],
    ["Underline", { type: "underline" }],
    ["Strike", { type: "strike" }],
    ["Inline code", { type: "code" }],
    ["Highlight", { type: "highlight" }],
    ["Superscript", { type: "superscript" }],
    ["Subscript", { type: "subscript" }]
  ])("toggles %s through the bubble menu", async (label, expectedMark) => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Toggle me");
    await selectText(editor, 1, 10);

    fireEvent.click(await screen.findByRole("button", { name: label }));

    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "Toggle me", marks: [expectedMark] }]
    });
  });

  it("creates, edits, removes, and follows safe links without navigating away", async () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => ({ opener: null } as Window));
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Linked text");
    await selectText(editor, 1, 12);
    await openLinkSurface(editor);

    const createDialog = await screen.findByRole("dialog", { name: "Create link" });
    const input = within(createDialog).getByRole("textbox", { name: "URL" }) as HTMLInputElement;
    expect(input).toHaveValue("");

    await act(async () => {
      fireEvent.change(input, { target: { value: "https://example.com/docs" } });
    });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Linked text",
              marks: [
                {
                  type: "link",
                  attrs: { href: "https://example.com/docs" }
                }
              ]
            }
          ]
        }
      ]
    });

    await selectText(editor, 1, 12);
    await openLinkSurface(editor);
    const editDialog = await screen.findByRole("dialog", { name: "Edit link" });
    const editInput = within(editDialog).getByRole("textbox", { name: "URL" }) as HTMLInputElement;
    expect(editInput).toHaveValue("https://example.com/docs");

    await act(async () => {
      fireEvent.change(editInput, { target: { value: "https://example.com/next" } });
    });
    fireEvent.click(within(editDialog).getByRole("button", { name: "Apply" }));

    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Linked text",
              marks: [
                {
                  type: "link",
                  attrs: { href: "https://example.com/next" }
                }
              ]
            }
          ]
        }
      ]
    });

    await selectText(editor, 1, 12);
    await openLinkSurface(editor);
    const followDialog = await screen.findByRole("dialog", { name: "Edit link" });
    fireEvent.click(within(followDialog).getByRole("button", { name: "Follow" }));
    expect(openSpy).toHaveBeenCalledWith("https://example.com/next", "_blank", "noopener,noreferrer");

    fireEvent.click(within(followDialog).getByRole("button", { name: "Remove" }));
    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Linked text" }] }]
    });

    openSpy.mockRestore();
  });

  it("dismisses the link surface when the editor receives another pointer action and keeps the replacement selection", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Alpha Beta");
    await selectText(editor, 1, 6);
    await openLinkSurface(editor);

    const createDialog = await screen.findByRole("dialog", { name: "Create link" });
    expect(createDialog).toBeInTheDocument();

    await selectText(editor, 7, 11);
    fireEvent.pointerDown(editor.view.dom);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Create link" })).toBeNull();
    });
    expect(editor.state.selection.from).toBe(7);
    expect(editor.state.selection.to).toBe(11);

    await openLinkSurface(editor);
    const reopenDialog = await screen.findByRole("dialog", { name: "Create link" });
    const reopenInput = within(reopenDialog).getByRole("textbox", { name: "URL" }) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(reopenInput, { target: { value: "https://example.com/new-target" } });
    });
    fireEvent.keyDown(reopenInput, { key: "Enter" });

    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Alpha " },
            {
              type: "text",
              text: "Beta",
              marks: [{ type: "link", attrs: { href: "https://example.com/new-target" } }]
            }
          ]
        }
      ]
    });
  });

  it("closes the link surface on an outside-shell pointerdown without changing content", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Outside shell");
    await selectText(editor, 1, 8);
    await openLinkSurface(editor);

    const before = editor.getJSON();
    expect(screen.getByRole("dialog", { name: "Create link" })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Create link" })).toBeNull();
    });
    expect(editor.getJSON()).toEqual(before);
  });

  it.each([
    ["javascript:alert(1)", true],
    ["data:text/html,hi", true],
    ["   ", false]
  ])("rejects %s in the apply path without calling setLink", async (draftHref, showValidation) => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    const setLinkSpy = vi.spyOn(editor.commands, "setLink");
    await setParagraphText(editor, "Unsafe link");
    await selectText(editor, 1, 12);
    await openLinkSurface(editor);

    const dialog = await screen.findByRole("dialog", { name: "Create link" });
    const input = within(dialog).getByRole("textbox", { name: "URL" }) as HTMLInputElement;
    const applyButton = within(dialog).getByRole("button", { name: "Apply" });
    const before = editor.getJSON();
    const selectionBefore = {
      from: editor.state.selection.from,
      to: editor.state.selection.to
    };

    await act(async () => {
      fireEvent.change(input, { target: { value: draftHref } });
    });

    expect(applyButton).toBeDisabled();
    if (showValidation) {
      expect(within(dialog).getByRole("alert")).toHaveTextContent("Enter a safe URL.");
    } else {
      expect(screen.queryByRole("alert")).toBeNull();
    }

    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.click(applyButton);

    expect(setLinkSpy).not.toHaveBeenCalled();
    expect(editor.getJSON()).toEqual(before);
    expect(editor.state.selection.from).toBe(selectionBefore.from);
    expect(editor.state.selection.to).toBe(selectionBefore.to);
    expect(screen.getByRole("dialog", { name: "Create link" })).toBeInTheDocument();
  });

  it("recalculates floating positioning from the overlay owner document and cleans up listeners on close and unmount", async () => {
    const harness = createOverlayOwnerDocumentHarness(240, 180);
    const overlayRoot = document.createElement("div");
    Object.defineProperty(overlayRoot, "ownerDocument", {
      configurable: true,
      value: harness.ownerDocument
    });

    const { editorReady, unmount } = renderRuntime({}, { overlayRoot });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Positioned link");
    await selectText(editor, 1, 15);
    await openLinkSurface(editor);

    const dialog = await screen.findByRole("dialog", { name: "Create link" });
    expect(dialog).toHaveStyle({ width: "216px" });
    expect(harness.ownerDocument.addEventListener).toHaveBeenCalledWith("scroll", expect.any(Function), true);
    expect(harness.ownerWindow.addEventListener).toHaveBeenCalledWith("resize", expect.any(Function), { passive: true });

    setOverlayOwnerViewport(harness.ownerWindow, 180, 150);
    act(() => {
      harness.triggerScroll();
    });
    await waitFor(() => {
      expect(dialog).toHaveStyle({ width: "156px" });
    });

    setOverlayOwnerViewport(harness.ownerWindow, 260, 160);
    act(() => {
      harness.triggerResize();
    });
    await waitFor(() => {
      expect(dialog).toHaveStyle({ width: "236px" });
    });

    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Create link" })).toBeNull();
    });
    expect(harness.ownerDocumentRemoveEventListener).toHaveBeenCalledWith("scroll", expect.any(Function), true);
    expect(harness.ownerWindowRemoveEventListener).toHaveBeenCalledWith("resize", expect.any(Function));

    await openLinkSurface(editor);
    await screen.findByRole("dialog", { name: "Create link" });
    const scrollCleanupCallsBeforeUnmount = harness.ownerDocumentRemoveEventListener.mock.calls.length;
    const resizeCleanupCallsBeforeUnmount = harness.ownerWindowRemoveEventListener.mock.calls.length;

    await act(async () => {
      unmount();
    });
    expect(harness.ownerDocumentRemoveEventListener.mock.calls.length).toBeGreaterThan(scrollCleanupCallsBeforeUnmount);
    expect(harness.ownerWindowRemoveEventListener.mock.calls.length).toBeGreaterThan(resizeCleanupCallsBeforeUnmount);
    expect(screen.queryByRole("dialog", { name: "Create link" })).toBeNull();
  });

  it("rejects unsafe, invalid, blank, and cancelled link input", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Unsafe");
    await selectText(editor, 1, 7);
    await openLinkSurface(editor);

    const dialog = await screen.findByRole("dialog", { name: "Create link" });
    const input = within(dialog).getByRole("textbox", { name: "URL" }) as HTMLInputElement;

    await act(async () => {
      fireEvent.change(input, { target: { value: "javascript:alert(1)" } });
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent("Enter a safe URL.");
    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Unsafe" }] }]
    });

    await act(async () => {
      fireEvent.change(input, { target: { value: "" } });
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    expect(editor.getJSON()).toMatchObject({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Unsafe" }] }]
    });

    fireEvent.keyDown(input, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Create link" })).toBeNull();
    expect(editor.state.selection.from).toBe(1);
    expect(editor.state.selection.to).toBe(7);
  });

  it("supports undo and redo after slash, formatting, and link commands", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor, "he");
    fireEvent.click(await screen.findByRole("option", { name: /Heading 2/ }));
    const afterSlash = editor.getJSON();

    await act(async () => {
      editor.commands.undo();
    });
    expect(editor.getJSON()).not.toEqual(afterSlash);

    await act(async () => {
      editor.commands.redo();
    });
    expect(editor.getJSON()).toEqual(afterSlash);

    await setParagraphText(editor, "Redo mark");
    await selectText(editor, 1, 9);
    fireEvent.click(await screen.findByRole("button", { name: "Bold" }));
    const afterBold = editor.getJSON();

    await act(async () => {
      editor.commands.undo();
    });
    expect(editor.getJSON()).not.toEqual(afterBold);
    await act(async () => {
      editor.commands.redo();
    });
    expect(editor.getJSON()).toEqual(afterBold);

    await setParagraphText(editor, "Link redo");
    await selectText(editor, 1, 9);
    await openLinkSurface(editor);
    const dialog = await screen.findByRole("dialog", { name: "Create link" });
    const input = within(dialog).getByRole("textbox", { name: "URL" }) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { value: "https://example.com/redo" } });
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Apply" }));
    const afterLink = editor.getJSON();

    await act(async () => {
      editor.commands.undo();
    });
    expect(editor.getJSON()).not.toEqual(afterLink);
    await act(async () => {
      editor.commands.redo();
    });
    expect(editor.getJSON()).toEqual(afterLink);
  });

  it("keeps a no-op paragraph command clean and tears down controls when edit access is lost", async () => {
    const onSaveDraft = vi.fn(async (): Promise<PageBodySaveResult> => ({
      state: "succeeded",
      page: createSuccessPage(1)
    }));
    const { editorReady, rerender, onAccessLost, onOutlineChange, onStatusChange, overlayRoot } = renderRuntime({
      onSaveDraft
    });

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await openSlashQuery(editor);
    fireEvent.click(await screen.findByRole("option", { name: /Paragraph/ }));
    expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();

    await runAutosave();
    expect(onSaveDraft).toHaveBeenCalledTimes(0);

    await setParagraphText(editor, "Access loss");
    await selectText(editor, 1, 12);
    await openLinkSurface(editor);
    expect(screen.getByRole("dialog", { name: "Create link" })).toBeInTheDocument();

    rerender(
      <PageEditorHostRuntime
        canEdit={false}
        initialEnvelope={createEmptyDocseraDocumentEnvelope()}
        initialRevision={0}
        onAccessLost={onAccessLost}
        onOutlineChange={onOutlineChange}
        onSaveDraft={onSaveDraft}
        onEditorReady={() => undefined}
        onStatusChange={onStatusChange}
        overlayRoot={overlayRoot}
        pageSysId="page-001"
        theme="light"
      />
    );

    expect(screen.queryByRole("dialog", { name: /link/i })).toBeNull();
    expect(screen.queryByRole("toolbar", { name: "Text formatting" })).toBeNull();
    expect(screen.queryByRole("listbox", { name: "Slash command menu" })).toBeNull();
  });

  it("replaces superscript with subscript without removing unrelated marks", async () => {
    const { editorReady } = renderRuntime();

    await waitFor(() => {
      expect(editorReady[0]).toBeDefined();
    });

    const editor = editorReady[0];
    await setParagraphText(editor, "Formula");
    await selectText(editor, 1, 8);

    fireEvent.click(await screen.findByRole("button", { name: "Bold" }));
    fireEvent.click(await screen.findByRole("button", { name: "Superscript" }));
    fireEvent.click(await screen.findByRole("button", { name: "Subscript" }));

    expect(editor.getJSON().content?.[0]).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "Formula", marks: [{ type: "bold" }, { type: "subscript" }] }]
    });
    expect(JSON.stringify(editor.getJSON())).not.toContain("superscript");
  });
});

