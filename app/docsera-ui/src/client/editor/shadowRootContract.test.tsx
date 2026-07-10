import "@testing-library/jest-dom/vitest";
import { act } from "@testing-library/react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createRoot } from "react-dom/client";
import { createPortal } from "react-dom";
import { describe, expect, it } from "vitest";

function ShadowEditorProbe({ overlayRoot }: { overlayRoot: HTMLElement }) {
  const editor = useEditor({
    extensions: [StarterKit],
    content: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Shadow editor" }] }] }
  });

  return (
    <>
      <EditorContent editor={editor} />
      {createPortal(<button type="button">Editor overlay</button>, overlayRoot)}
    </>
  );
}

describe("editor shadow-root contract", () => {
  it("keeps the ProseMirror surface and editor overlays inside the child root", async () => {
    const host = document.createElement("div");
    document.body.append(host);
    const shadowRoot = host.attachShadow({ mode: "open" });
    const runtimeRoot = document.createElement("div");
    const overlayRoot = document.createElement("div");
    overlayRoot.dataset.docseraEditorOverlayRoot = "true";
    shadowRoot.append(runtimeRoot, overlayRoot);
    const reactRoot = createRoot(runtimeRoot);

    await act(async () => {
      reactRoot.render(<ShadowEditorProbe overlayRoot={overlayRoot} />);
    });

    const proseMirror = shadowRoot.querySelector(".ProseMirror");
    const overlay = shadowRoot.querySelector("button");
    expect(proseMirror?.getRootNode()).toBe(shadowRoot);
    expect(overlayRoot).toContainElement(overlay);
    expect(document.body.querySelector(".ProseMirror")).toBeNull();
    expect(document.body.querySelector("button")).toBeNull();

    await act(async () => {
      reactRoot.unmount();
    });
    expect(shadowRoot.querySelector(".ProseMirror")).toBeNull();
    host.remove();
  });
});
