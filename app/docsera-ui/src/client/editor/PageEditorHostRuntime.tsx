import type { Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DocseraDocumentEnvelope, DocseraTiptapDocument } from "../../shared/editor/document";
import { DOCSERA_DOCUMENT_SCHEMA_VERSION } from "../../shared/editor/document";
import { extractDocumentOutline, type EditorOutlineItem } from "./documentOutline";
import type { PageBodySaveResult } from "../shared/types/docsera";

type PageEditorHostRuntimeProps = {
  canEdit: boolean;
  initialEnvelope: DocseraDocumentEnvelope;
  initialRevision: number;
  onAccessLost: () => void;
  onOutlineChange: (outline: EditorOutlineItem[]) => void;
  onSaveDraft: (input: {
    draftContentJson: DocseraDocumentEnvelope;
    expectedRevision: number;
    pageSysId: string;
  }) => Promise<PageBodySaveResult>;
  onEditorReady?: (editor: Editor) => void;
  onStatusChange: (state: { isDirty: boolean; isSaving: boolean }) => void;
  overlayRoot: HTMLElement;
  pageSysId: string;
  theme: "dark" | "light";
};

type RuntimeStatus = "dirty" | "failed" | "saved" | "saving";

const SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE = "Something went wrong while saving the page body. Please try again.";

function cloneEnvelope(envelope: DocseraDocumentEnvelope): DocseraDocumentEnvelope {
  return JSON.parse(JSON.stringify(envelope)) as DocseraDocumentEnvelope;
}

function normalizeDocument(document: DocseraTiptapDocument): DocseraTiptapDocument {
  const cloned = JSON.parse(JSON.stringify(document)) as DocseraTiptapDocument;
  return {
    ...cloned,
    content: Array.isArray(cloned.content) ? cloned.content : []
  };
}

function serializeDocument(document: DocseraTiptapDocument): string {
  return JSON.stringify(normalizeDocument(document));
}

function createEnvelope(document: DocseraTiptapDocument): DocseraDocumentEnvelope {
  return {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: normalizeDocument(document)
  };
}

function statusLabel(status: RuntimeStatus): string {
  switch (status) {
    case "dirty":
      return "Unsaved changes";
    case "saving":
      return "Saving";
    case "failed":
      return "Save failed";
    case "saved":
    default:
      return "Saved";
  }
}

export function PageEditorHostRuntime({
  canEdit,
  initialEnvelope,
  initialRevision,
  onAccessLost,
  onOutlineChange,
  onSaveDraft,
  onEditorReady,
  onStatusChange,
  overlayRoot,
  pageSysId,
  theme
}: PageEditorHostRuntimeProps) {
  const [errorMessage, setErrorMessage] = useState("");
  const [savedDocumentKey, setSavedDocumentKey] = useState(() => serializeDocument(initialEnvelope.document));
  const [savedRevision, setSavedRevision] = useState(initialRevision);
  const [status, setStatus] = useState<RuntimeStatus>("saved");
  const disposedRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const saveGenerationRef = useRef(0);
  const currentDocumentKeyRef = useRef(savedDocumentKey);
  const savedDocumentKeyRef = useRef(savedDocumentKey);
  const statusRef = useRef<RuntimeStatus>("saved");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    savedDocumentKeyRef.current = savedDocumentKey;
  }, [savedDocumentKey]);

  useEffect(() => {
    onStatusChange({
      isDirty: currentDocumentKeyRef.current !== savedDocumentKey,
      isSaving: status === "saving"
    });
  }, [onStatusChange, savedDocumentKey, status]);

  const editor = useEditor({
    editable: canEdit,
    extensions: [StarterKit],
    content: initialEnvelope.document as unknown as Record<string, unknown>,
    immediatelyRender: false,
    onCreate: ({ editor: runtimeEditor }) => {
      const envelope = createEnvelope(runtimeEditor.getJSON() as DocseraTiptapDocument);
      currentDocumentKeyRef.current = serializeDocument(envelope.document);
      onEditorReady?.(runtimeEditor);
      onOutlineChange(extractDocumentOutline(envelope));
    },
    onUpdate: ({ editor: runtimeEditor }) => {
      const envelope = createEnvelope(runtimeEditor.getJSON() as DocseraTiptapDocument);
      const nextDocumentKey = serializeDocument(envelope.document);
      currentDocumentKeyRef.current = nextDocumentKey;
      onOutlineChange(extractDocumentOutline(envelope));

      if (statusRef.current !== "saving") {
        setStatus(nextDocumentKey === savedDocumentKeyRef.current ? "saved" : "dirty");
      }

      if (errorMessage) {
        setErrorMessage("");
      }
    }
  });

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
    };
  }, []);

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(canEdit);
  }, [canEdit, editor]);

  const isDirty = currentDocumentKeyRef.current !== savedDocumentKey;
  const isSaving = status === "saving";
  const overlayThemeClass = useMemo(
    () => (theme === "dark" ? "docsera-editor-runtime--dark" : "docsera-editor-runtime--light"),
    [theme]
  );

  async function handleSave() {
    if (!editor || !canEdit || isSaving || saveInFlightRef.current) {
      return;
    }

    const envelope = createEnvelope(editor.getJSON() as DocseraTiptapDocument);
    const pendingDocumentKey = serializeDocument(envelope.document);
    if (pendingDocumentKey === savedDocumentKeyRef.current) {
      setStatus("saved");
      setErrorMessage("");
      return;
    }

    setStatus("saving");
    setErrorMessage("");
    const saveGeneration = saveGenerationRef.current + 1;
    saveGenerationRef.current = saveGeneration;
    saveInFlightRef.current = true;

    try {
      const result = await onSaveDraft({
        draftContentJson: cloneEnvelope(envelope),
        expectedRevision: savedRevision,
        pageSysId
      });

      if (disposedRef.current || saveGenerationRef.current !== saveGeneration) {
        return;
      }

      if (result.state === "failed") {
        setStatus("failed");
        setErrorMessage(result.errorMessage);

        if (result.code === "forbidden") {
          onAccessLost();
        }

        return;
      }

      const nextSavedKey = pendingDocumentKey;
      setSavedDocumentKey(nextSavedKey);
      setSavedRevision(result.page.draftRevision ?? savedRevision + 1);
      setErrorMessage("");
      setStatus(currentDocumentKeyRef.current === nextSavedKey ? "saved" : "dirty");
    } catch {
      if (disposedRef.current || saveGenerationRef.current !== saveGeneration) {
        return;
      }

      setStatus("failed");
      setErrorMessage(SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE);
    } finally {
      if (saveGenerationRef.current === saveGeneration) {
        saveInFlightRef.current = false;
      }
    }
  }

  return (
    <section className={`docsera-editor-runtime ${overlayThemeClass}`} aria-label="Draft editor">
      <style>{`
        .docsera-editor-runtime {
          display: grid;
          gap: 18px;
          padding: 22px;
          border: 1px solid var(--docsera-border, rgba(140, 156, 178, 0.28));
          border-radius: 24px;
          background: var(--docsera-editor-surface);
          box-shadow: 0 18px 48px rgba(15, 23, 42, 0.07);
          color: var(--docsera-editor-text);
          font-family: Inter, "Segoe UI", sans-serif;
        }
        .docsera-editor-runtime--light {
          --docsera-editor-surface:
            linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(248, 249, 252, 0.94)),
            #ffffff;
          --docsera-editor-muted: #5f6b7c;
          --docsera-editor-panel: rgba(255, 255, 255, 0.98);
          --docsera-editor-panel-border: rgba(140, 156, 178, 0.22);
          --docsera-editor-text: #16212f;
          --docsera-editor-primary: #015ec2;
        }
        .docsera-editor-runtime--dark {
          --docsera-editor-surface:
            linear-gradient(180deg, rgba(17, 23, 34, 0.96), rgba(11, 14, 20, 0.94)),
            #0b0e14;
          --docsera-editor-muted: #a7b3c5;
          --docsera-editor-panel: rgba(15, 18, 24, 0.98);
          --docsera-editor-panel-border: rgba(122, 139, 167, 0.22);
          --docsera-editor-text: #eef2f8;
          --docsera-editor-primary: #58a6ff;
        }
        .docsera-editor-runtime__header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
        }
        .docsera-editor-runtime__eyebrow {
          margin: 0;
          color: var(--docsera-editor-muted);
          font-size: 0.75rem;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .docsera-editor-runtime__copy {
          margin: 6px 0 0;
          max-width: 58ch;
          color: var(--docsera-editor-muted);
          font-size: 0.9375rem;
          line-height: 1.6;
        }
        .docsera-editor-runtime__status {
          display: inline-flex;
          align-items: center;
          flex: 0 0 auto;
          padding: 7px 11px;
          border: 1px solid transparent;
          border-radius: 999px;
          font-size: 0.72rem;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .docsera-editor-runtime__status--saved {
          border-color: rgba(23, 125, 84, 0.2);
          background: rgba(23, 125, 84, 0.1);
          color: #177d54;
        }
        .docsera-editor-runtime__status--dirty {
          border-color: rgba(185, 112, 0, 0.2);
          background: rgba(185, 112, 0, 0.1);
          color: #b97000;
        }
        .docsera-editor-runtime__status--saving {
          border-color: rgba(11, 102, 204, 0.2);
          background: rgba(11, 102, 204, 0.1);
          color: var(--docsera-editor-primary);
        }
        .docsera-editor-runtime__status--failed {
          border-color: rgba(186, 26, 26, 0.2);
          background: rgba(186, 26, 26, 0.1);
          color: #ba1a1a;
        }
        .docsera-editor-runtime__surface {
          position: relative;
          min-height: 340px;
          padding: 18px 20px;
          border: 1px solid var(--docsera-editor-panel-border);
          border-radius: 20px;
          background: var(--docsera-editor-panel);
          box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06);
        }
        .docsera-editor-runtime__surface .ProseMirror {
          min-height: 300px;
          color: var(--docsera-editor-text);
          font-size: 1rem;
          line-height: 1.8;
          outline: none;
        }
        .docsera-editor-runtime__surface .ProseMirror p {
          margin: 0 0 1rem;
        }
        .docsera-editor-runtime__surface .ProseMirror h1,
        .docsera-editor-runtime__surface .ProseMirror h2,
        .docsera-editor-runtime__surface .ProseMirror h3 {
          margin: 1.4rem 0 0.7rem;
          line-height: 1.2;
        }
        .docsera-editor-runtime__footer {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 16px;
          flex-wrap: wrap;
        }
        .docsera-editor-runtime__meta {
          display: grid;
          gap: 6px;
          min-width: 0;
        }
        .docsera-editor-runtime__helper {
          margin: 0;
          color: var(--docsera-editor-muted);
          font-size: 0.75rem;
          line-height: 1.5;
        }
        .docsera-editor-runtime__error {
          margin: 0;
          color: #ba1a1a;
          font-size: 0.875rem;
          font-weight: 700;
          line-height: 1.5;
        }
        .docsera-editor-runtime__save-button,
        .docsera-editor-runtime__overlay-button {
          min-width: 176px;
          padding: 14px 18px;
          border: 1px solid transparent;
          border-radius: 999px;
          background: linear-gradient(135deg, var(--docsera-editor-primary), #004fa8);
          color: #ffffff;
          font-family: Geist, Inter, "Segoe UI", sans-serif;
          font-size: 0.9375rem;
          font-weight: 700;
          box-shadow: 0 16px 30px rgba(1, 94, 194, 0.24);
        }
        .docsera-editor-runtime__save-button:disabled,
        .docsera-editor-runtime__overlay-button:disabled {
          background: linear-gradient(135deg, rgba(99, 117, 147, 0.85), rgba(96, 112, 139, 0.85));
          box-shadow: none;
          cursor: not-allowed;
        }
        .docsera-editor-runtime__overlay {
          position: absolute;
          right: 0;
          bottom: 0;
          display: grid;
          justify-items: end;
          gap: 10px;
          padding: 0 22px 22px;
          pointer-events: none;
        }
        .docsera-editor-runtime__overlay-button {
          min-width: 0;
          padding: 10px 14px;
          pointer-events: auto;
        }
      `}</style>
      <div className="docsera-editor-runtime__header">
        <div>
          <p className="docsera-editor-runtime__eyebrow">Draft editor</p>
          <p className="docsera-editor-runtime__copy">
            Canonical TipTap content is isolated inside the production child host and saved explicitly during E2.
          </p>
        </div>
        <div className={`docsera-editor-runtime__status docsera-editor-runtime__status--${status}`}>{statusLabel(status)}</div>
      </div>

      <div className="docsera-editor-runtime__surface">
        <EditorContent editor={editor} />
        {createPortal(
          <div className="docsera-editor-runtime__overlay">
            <button type="button" className="docsera-editor-runtime__overlay-button" disabled={!canEdit}>
              Edit mode
            </button>
          </div>,
          overlayRoot
        )}
      </div>

      <div className="docsera-editor-runtime__footer">
        <div className="docsera-editor-runtime__meta">
          <p className="docsera-editor-runtime__helper">
            {canEdit
              ? isDirty
                ? "Changes stay in the shared draft until you save them."
                : "The current canonical draft is up to date."
              : "Authoring access is no longer available for this editor session."}
          </p>
          {errorMessage ? (
            <p className="docsera-editor-runtime__error" role="alert">
              {errorMessage}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          className="docsera-editor-runtime__save-button"
          disabled={!canEdit || isSaving || !isDirty}
          onClick={() => {
            void handleSave();
          }}
        >
          {isSaving ? "Saving..." : "Save draft"}
        </button>
      </div>
    </section>
  );
}
