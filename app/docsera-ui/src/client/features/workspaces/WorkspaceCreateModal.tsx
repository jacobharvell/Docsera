import { useEffect, useState, type FormEvent } from "react";
import { WorkspaceIconBadge } from "./WorkspacePrimitives";

type WorkspaceCreateModalProps = {
  errorMessage?: string;
  onClose: () => void;
  onSubmit: (input: { name: string; shortDescription: string }) => void;
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

export function WorkspaceCreateModal({ errorMessage, onClose, onSubmit, open, phase }: WorkspaceCreateModalProps) {
  const [name, setName] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});

  useEffect(() => {
    if (!open) {
      setName("");
      setShortDescription("");
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
      shortDescription: cleanText(shortDescription)
    });
  }

  const pending = phase !== "idle";
  const canClose = phase === "idle";

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
            <div>
              <p className="docsera-modal__eyebrow">New workspace</p>
              <h2 id="docsera-create-workspace-title" className="docsera-modal__title">
                Create workspace
              </h2>
            </div>
            <button type="button" className="docsera-modal__close" onClick={onClose} aria-label="Close modal" disabled={!canClose}>
              x
            </button>
          </div>

          <p className="docsera-modal__copy">
            Workspace names, descriptions, and generated access groups will be created through the live provisioning flow.
          </p>

          {errorMessage ? (
            <div className="docsera-modal__alert" role="alert">
              {errorMessage}
            </div>
          ) : null}

          <div className="docsera-modal__icon-row">
            <WorkspaceIconBadge
              workspace={{
                icon: {
                  type: "builtin",
                  key: "docsera-workspace",
                  label: "Docsera workspace icon"
                },
                name: "Docsera workspace icon"
              }}
              className="docsera-modal__icon"
            />
            <div className="docsera-modal__icon-copy">
              <p className="docsera-modal__label">Workspace icon</p>
              <p className="docsera-modal__helper">The default built-in Docsera icon is used for this slice.</p>
            </div>
          </div>

          <label className="docsera-modal__field">
            <span className="docsera-modal__label">Workspace name</span>
            <input
              className={`docsera-modal__input${errors.name ? " docsera-modal__input--invalid" : ""}`}
              type="text"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={80}
              disabled={pending}
            />
            {errors.name ? <span className="docsera-modal__field-error">{errors.name}</span> : null}
          </label>

          <label className="docsera-modal__field">
            <span className="docsera-modal__label">Short description</span>
            <textarea
              className={`docsera-modal__textarea${errors.shortDescription ? " docsera-modal__input--invalid" : ""}`}
              value={shortDescription}
              onChange={(event) => setShortDescription(event.target.value)}
              maxLength={160}
              rows={3}
              disabled={pending}
            />
            {errors.shortDescription ? (
              <span className="docsera-modal__field-error">{errors.shortDescription}</span>
            ) : (
              <span className="docsera-modal__helper">Optional. One line in My Workspaces when present.</span>
            )}
          </label>

          <div className="docsera-modal__actions">
            <button type="button" className="docsera-modal__secondary" onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="docsera-modal__primary" disabled={pending}>
              {phase === "polling" ? "Provisioning..." : phase === "submitting" ? "Creating..." : "Create workspace"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
