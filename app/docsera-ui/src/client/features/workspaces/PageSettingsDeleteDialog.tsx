import type { KeyboardEvent } from "react";
import { DocseraIcon } from "../../shared/icons/DocseraIcon";
import { docseraIcons } from "../../shared/icons/docseraIcons";
import { DocseraCompactTooltip } from "../../shared/tooltip/DocseraTooltip";

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
            <h2 id="docsera-delete-page-title" className="docsera-modal__title">
              Confirm deletion
            </h2>
            <DocseraCompactTooltip label="Close delete dialog">
              <button type="button" className="docsera-modal__close" disabled={pending} onClick={onRequestClose} aria-label="Close delete dialog">
                <CloseIcon />
              </button>
            </DocseraCompactTooltip>
          </div>

          {errorMessage ? (
            <div className="docsera-modal__alert" role="alert">
              {errorMessage}
            </div>
          ) : null}

          <div className="docsera-modal__body">
            <p className="docsera-modal__copy">
              {hasDescendants
                ? <>This will permanently delete {pageTitle || "page"} and any nested pages underneath it.</>
                : <>This will permanently delete {pageTitle || "page"}.</>}
            </p>
          </div>

          <div className="docsera-modal__footer">
            <div className="docsera-modal__actions">
              <button type="button" className="docsera-modal__secondary" disabled={pending} onClick={onRequestClose}>
                Cancel
              </button>
              <button
                type="button"
                className="docsera-modal__primary docsera-modal__primary--destructive docsera-delete-confirmation-button"
                aria-busy={pending ? "true" : undefined}
                disabled={pending}
                onClick={onConfirm}
              >
                {pending ? (
                  <span className="docsera-delete-confirmation-button__spinner-slot" aria-hidden="true">
                    <span className="docsera-delete-confirmation-button__spinner" />
                  </span>
                ) : null}
                <span className="docsera-delete-confirmation-button__label">Delete page</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
