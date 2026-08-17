import "@testing-library/jest-dom/vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { useEffect } from "react";
import { describe, expect, it, vi } from "vitest";
import { createDocseraEditorExtensions } from "../../shared/editor/schema";
import { DOCSERA_DOCUMENT_SCHEMA_VERSION, parseDocseraDocument } from "../../shared/editor/document";
import { createDocseraDocumentFixtureCorpus, createSupportedE2DocseraDocumentEnvelope } from "../../shared/editor/documentFixtures";
import type { JSONContent } from "@tiptap/core";

function React18TipTapProbe({ onReady }: { onReady: (editor: Editor) => void }) {
  const editor = useEditor({
    extensions: createDocseraEditorExtensions(),
    content: createSupportedE2DocseraDocumentEnvelope().document as JSONContent
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
      extensions: createDocseraEditorExtensions(),
      content: createSupportedE2DocseraDocumentEnvelope().document as JSONContent
    });

    editor.commands.setContent(createSupportedE2DocseraDocumentEnvelope().document as JSONContent);

    expect(editor.getJSON().type).toBe("doc");
    expect(editor.getJSON().content?.[0]).toMatchObject({ type: "heading", attrs: { level: 2 } });

    editor.destroy();
    expect(editor.isDestroyed).toBe(true);
  });

  it("mounts through the React 18 adapter without the Studio React 19 patch", async () => {
    const onReady = vi.fn();
    const { unmount } = render(<React18TipTapProbe onReady={onReady} />);

    expect(await screen.findByLabelText("TipTap compatibility probe")).toBeInTheDocument();
    expect(onReady).toHaveBeenCalledTimes(1);

    const editor = onReady.mock.calls[0][0] as Editor;
    unmount();
    await waitFor(() => {
      expect(editor.isDestroyed).toBe(true);
    });
  });

  it.each(createDocseraDocumentFixtureCorpus().filter((fixture) => fixture.expected.ok))(
    "materializes the same canonical JSON as the shared contract for $label",
    ({ input }) => {
      const parsed = parseDocseraDocument(input);
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) {
        return;
      }

      const editor = new Editor({
        element: document.createElement("div"),
        extensions: createDocseraEditorExtensions(),
        content: parsed.envelope.document as JSONContent
      });

      expect(
        parseDocseraDocument({
          schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
          document: editor.getJSON() as typeof parsed.envelope.document
        })
      ).toMatchObject({
        ok: true,
        envelope: parsed.envelope
      });

      editor.destroy();
    }
  );
});
