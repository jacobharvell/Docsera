import { useEffect, useId, useState, type FormEvent } from "react";
import type { WorkspacePageRecord } from "../../shared/types/docsera";

type PageBodyEditorProps = {
  pageSysId: string;
  initialBodyText: string;
  canEdit: boolean;
  onSaveBody: (input: { pageSysId: string; draftBodyText: string }) => Promise<WorkspacePageRecord>;
};

type PageBodyEditorStatus = "saved" | "dirty" | "saving" | "failed";

const SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE = "Something went wrong while saving the page body. Please try again.";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function getStatusLabel(status: PageBodyEditorStatus): string {
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

function getSafeErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return cleanText(error.message) || SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE;
  }

  return cleanText(error) || SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE;
}

export function PageBodyEditor({ pageSysId, initialBodyText, canEdit, onSaveBody }: PageBodyEditorProps) {
  const textareaId = useId();
  const [draftBodyText, setDraftBodyText] = useState(initialBodyText || "");
  const [savedBodyText, setSavedBodyText] = useState(initialBodyText || "");
  const [status, setStatus] = useState<PageBodyEditorStatus>("saved");
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    const nextBodyText = initialBodyText || "";
    setDraftBodyText(nextBodyText);
    setSavedBodyText(nextBodyText);
    setStatus("saved");
    setErrorMessage("");
  }, [initialBodyText, pageSysId]);

  const isDirty = draftBodyText !== savedBodyText;
  const isSaving = status === "saving";
  const statusLabel = getStatusLabel(status);
  const showEmptyHint = !draftBodyText.trim();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canEdit || isSaving || !isDirty || !pageSysId) {
      return;
    }

    setStatus("saving");
    setErrorMessage("");

    try {
      const savedPage = await onSaveBody({
        pageSysId,
        draftBodyText
      });

      const nextBodyText = cleanText(savedPage.draftBodyText) || "";
      setDraftBodyText(nextBodyText);
      setSavedBodyText(nextBodyText);
      setStatus("saved");
      setErrorMessage("");
    } catch (error) {
      setStatus("failed");
      setErrorMessage(getSafeErrorMessage(error));
    }
  }

  return (
    <section className="docsera-main__editor" aria-label="Draft body editor">
      <div className="docsera-main__editor-header">
        <div>
          <p className="docsera-main__eyebrow">Draft body</p>
          <p className="docsera-main__editor-copy">
            Draft body edits are saved explicitly to this live page record.
          </p>
        </div>
        <div className={`docsera-main__status-pill docsera-main__status-pill--${status}`}>{statusLabel}</div>
      </div>

      <form className="docsera-main__editor-form" onSubmit={handleSubmit}>
        <label className="docsera-main__field" htmlFor={textareaId}>
          <span className="docsera-main__field-label">Body</span>
          <textarea
            id={textareaId}
            className="docsera-main__textarea"
            value={draftBodyText}
            onChange={(event) => {
              const nextValue = event.target.value;
              setDraftBodyText(nextValue);
              if (status !== "saving") {
                setStatus(nextValue === savedBodyText ? "saved" : "dirty");
              }
              if (errorMessage) {
                setErrorMessage("");
              }
            }}
            placeholder="Write the draft body for this page."
            disabled={!canEdit || isSaving}
            rows={14}
          />
        </label>

        <div className="docsera-main__editor-footer">
          <div className="docsera-main__editor-meta">
            <p className="docsera-main__helper">
              {showEmptyHint
                ? isDirty
                  ? "The draft body is empty right now. Save to persist the empty draft."
                  : "The draft body is empty."
                : "Changes remain in draft until you save them."}
            </p>
            {errorMessage ? (
              <p className="docsera-main__error" role="alert">
                {errorMessage}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            className="docsera-main__save-button"
            disabled={!canEdit || isSaving || !isDirty || !pageSysId}
          >
            {isSaving ? "Saving..." : "Save draft body"}
          </button>
        </div>
      </form>
    </section>
  );
}
