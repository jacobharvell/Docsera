import type { KeyboardEvent, RefObject } from "react";
import { DocseraIcon } from "../../shared/icons/DocseraIcon";
import { docseraIcons } from "../../shared/icons/docseraIcons";

type PageSettingsField = "title" | "slug";

type PageSettingsOverlayProps = {
  activeField: PageSettingsField | "";
  canManagePageSettings: boolean;
  generalError: string;
  hasDescendants: boolean;
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
  return <DocseraIcon icon={docseraIcons.close} />;
}

function DangerIcon() {
  return <DocseraIcon icon={docseraIcons.triangleAlert} />;
}

function SettingsIcon() {
  return <DocseraIcon icon={docseraIcons.settings} />;
}

function CollapseIcon() {
  return <DocseraIcon icon={docseraIcons.chevronRight} />;
}

export function PageSettingsOverlay({
  activeField,
  canManagePageSettings,
  generalError,
  hasDescendants,
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
        <span className="docsera-page-settings__row-icon" aria-hidden="true">
          {field === "title" ? "T" : "#"}
        </span>
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
          <button type="button" className="docsera-page-settings__value" onClick={() => onStartField(field)}>
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
        <div>
          <p className="docsera-page-settings__eyebrow">Page Settings</p>
          <h2 id="docsera-page-settings-title" className="docsera-page-settings__title">
            Page Settings
          </h2>
        </div>
        <button type="button" className="docsera-page-settings__icon-button" aria-label="Close page settings" onClick={onRequestClose}>
          <CloseIcon />
        </button>
      </div>

      <p className="docsera-page-settings__copy">Edit the selected page title and slug. Changes save when you leave the panel.</p>

      {generalError ? (
        <div className="docsera-page-settings__error" role="alert">
          {generalError}
        </div>
      ) : null}

      <div className="docsera-page-settings__rows">
        {renderField("title", "Title", pageTitle, titleError)}
        {renderField("slug", "Slug", pageSlug, slugError)}
      </div>

      <section className="docsera-page-settings__danger">
        <div className="docsera-page-settings__danger-copy">
          <p className="docsera-page-settings__eyebrow">Danger zone</p>
          <p>Delete this page and its descendants from the workspace.</p>
          {hasDescendants ? (
            <p>This page has child pages. Deleting it will also delete the nested child pages and their contents.</p>
          ) : null}
        </div>
        <button type="button" className="docsera-page-settings__destructive" onClick={onRequestDelete}>
          <DangerIcon />
          <span>Delete page</span>
        </button>
      </section>

      <div className="docsera-page-settings__footer">
        <button type="button" className="docsera-page-settings__collapse" onClick={onRequestClose}>
          <CollapseIcon />
          <span>Collapse</span>
        </button>
        <div className="docsera-page-settings__footer-copy">
          <SettingsIcon />
          <span>Dismissing the panel saves valid changes.</span>
        </div>
      </div>
    </aside>
  );
}
