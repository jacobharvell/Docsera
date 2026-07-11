type DirtyTransitionDialogProps = {
  open: boolean;
  onDiscard: () => void;
  onStay: () => void;
};

export function DirtyTransitionDialog({ open, onDiscard, onStay }: DirtyTransitionDialogProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="docsera-modal" role="presentation" onClick={onStay}>
      <div
        className="docsera-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="docsera-dirty-transition-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="docsera-modal__form">
          <div className="docsera-modal__header">
            <h2 id="docsera-dirty-transition-title" className="docsera-modal__title">
              Unsaved changes
            </h2>
          </div>
          <div className="docsera-modal__body">
            <p className="docsera-modal__copy">
              Your latest draft changes have not been saved. Leaving now will discard them for this editor session.
            </p>
          </div>
          <div className="docsera-modal__footer">
            <div className="docsera-modal__actions">
              <button type="button" className="docsera-modal__secondary" onClick={onStay}>
                Stay and continue editing
              </button>
              <button type="button" className="docsera-modal__primary docsera-modal__primary--destructive" onClick={onDiscard}>
                Discard changes
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
