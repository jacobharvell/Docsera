import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { Redo2, Undo2 } from "lucide-react";
import { DocseraCompactTooltip } from "./DocseraTooltip";

export type EditorHistoryControlsProps = {
  canEdit: boolean;
  editor: Editor | null;
  ownerDocument: Document;
};

type HistoryAction = "redo" | "undo";

const editorKeys = new WeakMap<Editor, number>();
let nextEditorKey = 1;

function getEditorKey(editor: Editor | null): string {
  if (!editor) {
    return "none";
  }

  const existing = editorKeys.get(editor);
  if (existing) {
    return String(existing);
  }

  const next = nextEditorKey;
  nextEditorKey += 1;
  editorKeys.set(editor, next);
  return String(next);
}

function canRunHistoryCommand(editor: Editor | null, action: HistoryAction): boolean {
  if (!editor || editor.isDestroyed || !editor.isEditable) {
    return false;
  }

  try {
    return action === "undo" ? editor.can().undo() : editor.can().redo();
  } catch {
    return false;
  }
}

function runHistoryCommand(editor: Editor | null, action: HistoryAction): void {
  if (!editor || editor.isDestroyed || !editor.isEditable) {
    return;
  }

  if (action === "undo") {
    editor.commands.undo();
    return;
  }

  editor.commands.redo();
}

export function EditorHistoryControls({ canEdit, editor, ownerDocument }: EditorHistoryControlsProps) {
  return (
    <EditorHistoryControlsState
      key={getEditorKey(editor)}
      canEdit={canEdit}
      editor={editor}
      ownerDocument={ownerDocument}
    />
  );
}

function EditorHistoryControlsState({ canEdit, editor, ownerDocument }: EditorHistoryControlsProps) {
  const availability = useEditorState({
    editor,
    selector: ({ editor: snapshotEditor, transactionNumber }) => ({
      canRedo: canEdit && canRunHistoryCommand(snapshotEditor, "redo"),
      canUndo: canEdit && canRunHistoryCommand(snapshotEditor, "undo"),
      transactionNumber
    })
  });
  const canRedo = availability?.canRedo ?? false;
  const canUndo = availability?.canUndo ?? false;

  return (
    <div className="docsera-editor-history-controls" role="toolbar" aria-label="Editor history" data-surface="editor-history-controls">
      <DocseraCompactTooltip label="Undo" ownerDocument={ownerDocument}>
        <button
          type="button"
          className="docsera-editor-history-controls__button"
          aria-label="Undo"
          disabled={!canUndo}
          onPointerDown={(event) => {
            event.preventDefault();
          }}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            runHistoryCommand(editor, "undo");
          }}
        >
          <Undo2 size={15} strokeWidth={2.2} aria-hidden="true" focusable="false" />
        </button>
      </DocseraCompactTooltip>
      <DocseraCompactTooltip label="Redo" ownerDocument={ownerDocument}>
        <button
          type="button"
          className="docsera-editor-history-controls__button"
          aria-label="Redo"
          disabled={!canRedo}
          onPointerDown={(event) => {
            event.preventDefault();
          }}
          onMouseDown={(event) => {
            event.preventDefault();
          }}
          onClick={() => {
            runHistoryCommand(editor, "redo");
          }}
        >
          <Redo2 size={15} strokeWidth={2.2} aria-hidden="true" focusable="false" />
        </button>
      </DocseraCompactTooltip>
      <style>{`
        .docsera-editor-history-controls {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          color: var(--docsera-text-muted);
          pointer-events: auto;
        }

        .docsera-editor-history-controls__button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 24px;
          height: 24px;
          padding: 0;
          border: 1px solid transparent;
          border-radius: 7px;
          background: transparent;
          color: inherit;
          cursor: pointer;
          transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
        }

        .docsera-editor-history-controls__button:hover,
        .docsera-editor-history-controls__button:focus-visible {
          border-color: var(--docsera-border);
          background: var(--docsera-surface-muted);
          color: var(--docsera-primary);
          outline: none;
        }

        .docsera-editor-history-controls__button:focus-visible {
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--docsera-primary) 22%, transparent);
        }

        .docsera-editor-history-controls__button:disabled,
        .docsera-editor-history-controls__button:disabled:hover,
        .docsera-editor-history-controls__button:disabled:focus-visible {
          border-color: transparent;
          background: transparent;
          color: var(--docsera-text-soft);
          cursor: not-allowed;
          opacity: 0.55;
          box-shadow: none;
        }

        .docsera-editor-history-controls__button svg {
          width: 15px;
          height: 15px;
          flex: 0 0 auto;
        }
      `}</style>
    </div>
  );
}
