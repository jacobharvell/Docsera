import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";

function React18TipTapProbe({ onReady }: { onReady: (editor: Editor) => void }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "TipTap runtime probe" }] }]
    }
  });

  useEffect(() => {
    if (editor) {
      onReady(editor);
    }
  }, [editor, onReady]);

  return <EditorContent editor={editor} aria-label="TipTap compatibility probe" />;
}

describe("TipTap runtime compatibility", () => {
  it("creates and destroys a headless editor with the canonical JSON shape", () => {
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: [StarterKit],
      content: { type: "doc", content: [] }
    });

    editor.commands.setContent({
      type: "doc",
      content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Compatibility" }] }]
    });

    expect(editor.getJSON().type).toBe("doc");
    expect(editor.getJSON().content?.[0]).toMatchObject({ type: "heading", attrs: { level: 2 } });

    editor.destroy();
    expect(editor.isDestroyed).toBe(true);
  });

  it("mounts through the React 18 adapter without the Studio React 19 patch", async () => {
    const onReady = vi.fn();
    const { unmount } = render(<React18TipTapProbe onReady={onReady} />);

    expect(await screen.findByText("TipTap runtime probe")).toBeInTheDocument();
    expect(onReady).toHaveBeenCalledTimes(1);

    const editor = onReady.mock.calls[0][0] as Editor;
    unmount();
    await waitFor(() => {
      expect(editor.isDestroyed).toBe(true);
    });
  });
});
