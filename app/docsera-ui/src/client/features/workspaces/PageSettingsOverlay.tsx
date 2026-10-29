import { useEffect, useState, type KeyboardEvent, type RefObject } from "react";
import { DocseraIcon } from "../../shared/icons/DocseraIcon";
import { docseraIcons } from "../../shared/icons/docseraIcons";
import { DocseraCompactTooltip } from "../../shared/tooltip/DocseraTooltip";
import { usePanelTransitionPresence } from "./usePanelTransitionPresence";

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

type PageSettingsVisualSnapshot = {
  generalError: string;
  noticeMessage?: string;
  pageSlug: string;
  pageTitle: string;
  slugError: string;
  titleError: string;
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
  const visuallyOpen = open && canManagePageSettings;
  const { active, present } = usePanelTransitionPresence(visuallyOpen);
  const [visualSnapshot, setVisualSnapshot] = useState<PageSettingsVisualSnapshot | null>(null);

  useEffect(() => {
    if (!visuallyOpen) return;
    setVisualSnapshot({
      generalError,
      noticeMessage,
      pageSlug,
      pageTitle,
      slugError,
      titleError
    });
  }, [generalError, noticeMessage, pageSlug, pageTitle, slugError, titleError, visuallyOpen]);

  useEffect(() => {
    if (present) return;
    setVisualSnapshot(null);
  }, [present]);

  const renderSnapshot = visuallyOpen
    ? { generalError, noticeMessage, pageSlug, pageTitle, slugError, titleError }
    : visualSnapshot;

  if (!present || !renderSnapshot) {
    return null;
  }

  const displayedActiveField = visuallyOpen ? activeField : "";
  const closingAttributes = visuallyOpen ? {} : ({ "aria-hidden": true, inert: "" } as Record<string, unknown>);

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Escape") {
      return;
    }

    event.stopPropagation();

    if (displayedActiveField) {
      onCancelField(displayedActiveField);
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
        {displayedActiveField === field ? (
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
    <div className="docsera-page-settings-shell">
    <aside
      ref={panelRef}
      className={`docsera-page-settings${active ? " docsera-page-settings--open" : " docsera-page-settings--closing"}`}
      role="complementary"
      aria-labelledby="docsera-page-settings-title"
      onKeyDown={handleKeyDown}
      {...closingAttributes}
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

      <div className="docsera-page-settings__scroll-content">
        {renderSnapshot.noticeMessage ? (
          <div className="docsera-page-settings__notice" role="status">
            {renderSnapshot.noticeMessage}
          </div>
        ) : null}

        {renderSnapshot.generalError ? (
          <div className="docsera-page-settings__error" role="alert">
            {renderSnapshot.generalError}
          </div>
        ) : null}

        <div className="docsera-page-settings__rows">
          {renderField("title", "Title", renderSnapshot.pageTitle, renderSnapshot.titleError)}
          {renderField("slug", "Slug", renderSnapshot.pageSlug, renderSnapshot.slugError)}
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
      </div>
    </aside>
    </div>
  );
}
