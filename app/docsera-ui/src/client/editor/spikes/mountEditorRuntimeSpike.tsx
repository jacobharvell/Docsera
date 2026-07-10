import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createPortal } from "react-dom";
import { createRoot } from "react-dom/client";

type MountEditorRuntimeSpikeInput = {
  runtimeRoot: HTMLElement;
  overlayRoot: HTMLElement;
};

function EditorRuntimeSpike({ overlayRoot }: { overlayRoot: HTMLElement }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "TipTap editor asset loaded" }]
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Edit this text to verify the child runtime remains interactive." }]
        }
      ]
    }
  });

  return (
    <div className="spike-surface">
      <style>{`
        :host { color: #eef2ff; font: 14px/1.5 Inter, sans-serif; }
        .spike-surface { position: relative; padding: 16px; border: 1px solid #3b4252; border-radius: 10px; background: #111827; }
        .ProseMirror { min-height: 110px; padding: 12px; border: 1px solid #4b5563; border-radius: 8px; outline: none; background: #0b0e14; }
        .ProseMirror:focus { border-color: #818cf8; box-shadow: 0 0 0 2px rgba(129, 140, 248, .25); }
        button { margin-top: 10px; border: 1px solid #818cf8; border-radius: 6px; padding: 6px 10px; background: #312e81; color: white; }
      `}</style>
      <EditorContent editor={editor} />
      {createPortal(
        <button type="button" data-docsera-editor-spike-overlay="true">
          Editor-local overlay control
        </button>,
        overlayRoot
      )}
    </div>
  );
}

export function mountEditorRuntimeSpike({ runtimeRoot, overlayRoot }: MountEditorRuntimeSpikeInput): () => void {
  const root = createRoot(runtimeRoot);
  root.render(<EditorRuntimeSpike overlayRoot={overlayRoot} />);
  return () => root.unmount();
}
