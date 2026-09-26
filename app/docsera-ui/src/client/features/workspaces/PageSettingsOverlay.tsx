import type { KeyboardEvent, RefObject } from "react";
import { DocseraIcon } from "../../shared/icons/DocseraIcon";
import { docseraIcons } from "../../shared/icons/docseraIcons";
import { DocseraCompactTooltip } from "../../shared/tooltip/DocseraTooltip";

type PageSettingsField = "title" | "slug";

type PageSettingsOverlayProps = {
  activeField: PageSettingsField | "";
  canManagePageSettings: boolean;
  generalError: string;
  noticeMessage?: string;
  open: boolean;
  panelRef: RefObject<HTMLElement>;
  pageSlug: string;
  pageTitle: string;
  slugError: string;
  titleError: string;
  onCancelField: (field: PageSettingsField) => void;
  onChangeField: (field: PageSettingsField, value: string) => void;
  onFinishField: (field: PageSettingsField) => void;
  onRequestClose: () => void;
  onRequestDelete: () => void;
  onStartField: (field: PageSettingsField) => void;
};

function CloseIcon() {
  return <DocseraIcon icon={docseraIcons.close} size={16} />;
}

function TrashIcon() {
  return <DocseraIcon icon={docseraIcons.trash} size={16} />;
}

export function PageSettingsOverlay({
  activeField,
  canManagePageSettings,
  generalError,
  noticeMessage,
  open,
  panelRef,
  pageSlug,
  pageTitle,
  slugError,
  titleError,
  onCancelField,
  onChangeField,
  onFinishField,
  onRequestClose,
  onRequestDelete,
  onStartField
}: PageSettingsOverlayProps) {
  if (!open || !canManagePageSettings) {
    return null;
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") {
      return;
    }

    event.stopPropagation();

    if (activeField) {
      onCancelField(activeField);
      return;
    }

    onRequestClose();
  };

  const renderField = (field: PageSettingsField, label: string, value: string, error: string) => (
    <div className="docsera-page-settings__row">
      <div className="docsera-page-settings__label">
        <span>{label}</span>
      </div>
      <div className="docsera-page-settings__body">
        {activeField === field ? (
          <input
            autoFocus
            className={`docsera-page-settings__input${error ? " docsera-page-settings__input--invalid" : ""}`}
            aria-invalid={error ? "true" : "false"}
            type="text"
            value={value}
            onBlur={() => onFinishField(field)}
            onChange={(event) => onChangeField(field, event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                onFinishField(field);
                return;
              }

              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                onCancelField(field);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className={`docsera-page-settings__value${error ? " docsera-page-settings__value--invalid" : ""}`}
            onClick={() => onStartField(field)}
          >
            {value || (field === "title" ? "Untitled page" : "page-slug")}
          </button>
        )}
        {error ? (
          <div className="docsera-page-settings__field-error" role="alert">
            {error}
          </div>
        ) : null}
      </div>
    </div>
  );

  return (
    <aside
      ref={panelRef}
      className="docsera-page-settings"
      role="complementary"
      aria-labelledby="docsera-page-settings-title"
      onKeyDown={handleKeyDown}
    >
      <div className="docsera-page-settings__header">
        <h2 id="docsera-page-settings-title" className="docsera-page-settings__title">
          Page Settings
        </h2>
        <DocseraCompactTooltip label="Close page settings">
          <button
            type="button"
            className="docsera-modal__close docsera-page-settings__icon-button"
            aria-label="Close page settings"
            onClick={onRequestClose}
          >
            <CloseIcon />
          </button>
        </DocseraCompactTooltip>
      </div>
      <div className="docsera-page-settings__header-divider" aria-hidden="true" />

      {noticeMessage ? (
        <div className="docsera-page-settings__notice" role="status">
          {noticeMessage}
        </div>
      ) : null}

      {generalError ? (
        <div className="docsera-page-settings__error" role="alert">
          {generalError}
        </div>
      ) : null}

      <div className="docsera-page-settings__rows">
        {renderField("title", "Title", pageTitle, titleError)}
        {renderField("slug", "Slug", pageSlug, slugError)}
      </div>

      <section className="docsera-page-settings__delete-section" aria-label="Delete page">
        <div className="docsera-page-settings__section-divider" aria-hidden="true" />
        <button type="button" className="docsera-destructive-action docsera-page-settings__destructive" onClick={onRequestDelete}>
          <TrashIcon />
          <span>Delete page</span>
        </button>
        <p className="docsera-page-settings__footer-helper">
          Changes are saved automatically when you close this panel or click outside of it.
        </p>
      </section>
    </aside>
  );
}
