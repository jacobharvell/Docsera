import { useEffect, useState, type FormEvent } from "react";
import { DocseraIcon } from "../../shared/icons/DocseraIcon";
import { docseraIcons } from "../../shared/icons/docseraIcons";
import type { WorkspaceIcon } from "../../shared/types/docsera";
import {
  BUILT_IN_WORKSPACE_ICONS,
  DEFAULT_BUILT_IN_WORKSPACE_ICON,
  findBuiltInWorkspaceIcon,
  type BuiltInWorkspaceIcon
} from "../../../shared/workspaces/domain";
import { WorkspaceIconBadge } from "./WorkspacePrimitives";

type WorkspaceCreateModalProps = {
  errorMessage?: string;
  onClose: () => void;
  onSubmit: (input: { name: string; shortDescription: string; icon: WorkspaceIcon }) => void;
  open: boolean;
  phase: "idle" | "submitting" | "polling";
};

type FormErrors = {
  name?: string;
  shortDescription?: string;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toWorkspaceIcon(icon: BuiltInWorkspaceIcon): WorkspaceIcon {
  return {
    type: "builtin",
    key: icon.key,
    label: icon.label
  };
}

export function WorkspaceCreateModal({ errorMessage, onClose, onSubmit, open, phase }: WorkspaceCreateModalProps) {
  const [name, setName] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [selectedIconKey, setSelectedIconKey] = useState(DEFAULT_BUILT_IN_WORKSPACE_ICON.key);
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    if (!open) {
      setName("");
      setShortDescription("");
      setSelectedIconKey(DEFAULT_BUILT_IN_WORKSPACE_ICON.key);
      setErrors({});
    }
  }, [open]);

  if (!open) {
    return null;
  }

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    const trimmedName = cleanText(name);
    const trimmedDescription = cleanText(shortDescription);

    if (!trimmedName) {
      nextErrors.name = "Workspace name is required.";
    } else if (trimmedName.length > 80) {
      nextErrors.name = "Workspace name must be 80 characters or fewer.";
    }

    if (trimmedDescription.length > 160) {
      nextErrors.shortDescription = "Short description must be 160 characters or fewer.";
    }

    setErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (phase !== "idle") {
      return;
    }

    if (!validate()) {
      return;
    }

    onSubmit({
      name: cleanText(name),
      shortDescription: cleanText(shortDescription),
      icon: toWorkspaceIcon(findBuiltInWorkspaceIcon(selectedIconKey) ?? DEFAULT_BUILT_IN_WORKSPACE_ICON)
    });
  }

  const pending = phase !== "idle";
  const canClose = phase === "idle";
  const selectedIcon = findBuiltInWorkspaceIcon(selectedIconKey) ?? DEFAULT_BUILT_IN_WORKSPACE_ICON;

  return (
    <div className="docsera-modal" role="presentation" onMouseDown={() => (canClose ? onClose() : undefined)}>
      <div
        className="docsera-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="docsera-create-workspace-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form className="docsera-modal__form" onSubmit={handleSubmit}>
          <div className="docsera-modal__header">
            <h2 id="docsera-create-workspace-title" className="docsera-modal__title">
              New Workspace
            </h2>
            <button type="button" className="docsera-modal__close" onClick={onClose} aria-label="Close modal" disabled={!canClose}>
              <DocseraIcon className="docsera-modal__close-icon" icon={docseraIcons.close} />
            </button>
          </div>

          {errorMessage ? (
            <div className="docsera-modal__alert" role="alert">
              {errorMessage}
            </div>
          ) : null}

          <div className="docsera-modal__body">
            <label className="docsera-modal__field">
              <span className="docsera-modal__label" id="docsera-create-workspace-name-label">Workspace name</span>
              <input
                className={`docsera-modal__input${errors.name ? " docsera-modal__input--invalid" : ""}`}
                type="text"
                aria-labelledby="docsera-create-workspace-name-label"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                placeholder="Example: HR Docs"
                disabled={pending}
              />
              {errors.name ? <span className="docsera-modal__field-error">{errors.name}</span> : null}
            </label>

            <label className="docsera-modal__field">
              <span className="docsera-modal__label" id="docsera-create-workspace-description-label">Short description</span>
              <input
                className={`docsera-modal__input${errors.shortDescription ? " docsera-modal__input--invalid" : ""}`}
                type="text"
                aria-labelledby="docsera-create-workspace-description-label"
                value={shortDescription}
                onChange={(event) => setShortDescription(event.target.value)}
                maxLength={160}
                placeholder="One-line description shown in My Workspaces"
                disabled={pending}
              />
              {errors.shortDescription ? (
                <span className="docsera-modal__field-error">{errors.shortDescription}</span>
              ) : null}
            </label>

            <fieldset className="docsera-modal__field docsera-workspace-icon-picker">
              <legend className="docsera-modal__label">Workspace icon</legend>
              <div className="docsera-workspace-icon-picker__grid">
                {BUILT_IN_WORKSPACE_ICONS.map((icon) => {
                  const selected = icon.key === selectedIcon.key;
                  return (
                    <button
                      key={icon.key}
                      type="button"
                      className={`docsera-workspace-icon-picker__option${selected ? " docsera-workspace-icon-picker__option--selected" : ""}`}
                      aria-pressed={selected}
                      aria-label={`${icon.label}${selected ? ", selected" : ""}`}
                      disabled={pending}
                      onClick={() => setSelectedIconKey(icon.key)}
                    >
                      <WorkspaceIconBadge
                        workspace={{
                          icon: toWorkspaceIcon(icon),
                          name: icon.label
                        }}
                      />
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <div className="docsera-modal__info-note">
              <p className="docsera-modal__info-note-copy">The creator becomes an Admin for the new workspace.</p>
            </div>
          </div>
          <div className="docsera-modal__footer">
            <div className="docsera-modal__actions">
              <button type="button" className="docsera-modal__secondary" onClick={onClose} disabled={pending}>
                Cancel
              </button>
              <button type="submit" className="docsera-modal__primary" disabled={pending}>
                {phase === "polling" ? "Provisioning..." : phase === "submitting" ? "Creating..." : "Create Workspace"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
