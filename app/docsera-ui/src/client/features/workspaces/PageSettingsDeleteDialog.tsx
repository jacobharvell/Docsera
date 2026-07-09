import type { KeyboardEvent } from "react";
import { DocseraIcon } from "../../shared/icons/DocseraIcon";
import { docseraIcons } from "../../shared/icons/docseraIcons";

type PageSettingsDeleteDialogProps = {
  errorMessage: string;
  hasDescendants: boolean;
  open: boolean;
  pending: boolean;
  pageTitle: string;
  onConfirm: () => void;
  onRequestClose: () => void;
};

function CloseIcon() {
  return <DocseraIcon icon={docseraIcons.close} />;
}

export function PageSettingsDeleteDialog({
  errorMessage,
  hasDescendants,
  open,
  pending,
  pageTitle,
  onConfirm,
  onRequestClose
}: PageSettingsDeleteDialogProps) {
  if (!open) {
    return null;
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onRequestClose();
    }
  };

  return (
    <div className="docsera-modal" data-docsera-delete-dialog="true" role="presentation" onClick={onRequestClose}>
      <div
        className="docsera-modal__panel docsera-page-settings__delete-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="docsera-delete-page-title"
        onClick={(event) => event.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <div className="docsera-modal__form">
          <div className="docsera-modal__header">
            <div>
              <p className="docsera-modal__eyebrow">Delete page</p>
              <h2 id="docsera-delete-page-title" className="docsera-modal__title">
                Delete {pageTitle || "page"}?
              </h2>
            </div>
            <button type="button" className="docsera-modal__close" disabled={pending} onClick={onRequestClose} aria-label="Close delete dialog">
              <CloseIcon />
            </button>
          </div>

          <p className="docsera-modal__copy">This will permanently delete this page.</p>

          {hasDescendants ? (
            <p className="docsera-modal__copy docsera-modal__copy--warning">
              All child pages and content inside this page will also be deleted.
            </p>
          ) : null}

          {errorMessage ? (
            <div className="docsera-modal__alert" role="alert">
              {errorMessage}
            </div>
          ) : null}

          <div className="docsera-modal__actions">
            <button type="button" className="docsera-modal__secondary" disabled={pending} onClick={onRequestClose}>
              Cancel
            </button>
            <button type="button" className="docsera-modal__primary docsera-modal__primary--destructive" disabled={pending} onClick={onConfirm}>
              Delete page
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
