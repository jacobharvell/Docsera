import { useId } from "react";

type DirtyTransitionDialogProps = {
  destructiveActionLabel?: string;
  message?: string;
  open: boolean;
  secondaryActionLabel?: string;
  title?: string;
  onDiscard: () => void;
  onStay: () => void;
};

export function DirtyTransitionDialog({
  destructiveActionLabel = "Discard changes",
  message = "Your latest draft changes have not been saved. Leaving now will discard them for this editor session.",
  open,
  secondaryActionLabel = "Stay and continue editing",
  title = "Unsaved changes",
  onDiscard,
  onStay
}: DirtyTransitionDialogProps) {
  const titleId = useId();

  if (!open) {
    return null;
  }

  return (
    <div className="docsera-modal" role="presentation" onClick={onStay}>
      <div
        className="docsera-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="docsera-modal__form">
          <div className="docsera-modal__header">
            <h2 id={titleId} className="docsera-modal__title">
              {title}
            </h2>
          </div>
          <div className="docsera-modal__body">
            <p className="docsera-modal__copy">
              {message}
            </p>
          </div>
          <div className="docsera-modal__footer">
            <div className="docsera-modal__actions">
              <button type="button" className="docsera-modal__secondary" onClick={onStay}>
                {secondaryActionLabel}
              </button>
              <button type="button" className="docsera-modal__primary docsera-modal__primary--destructive" onClick={onDiscard}>
                {destructiveActionLabel}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
