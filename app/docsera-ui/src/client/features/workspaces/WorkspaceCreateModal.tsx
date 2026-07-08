import { useEffect, useState, type FormEvent } from "react";

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
            <h2 id="docsera-create-workspace-title" className="docsera-modal__title">
              New Workspace
            </h2>
            <button type="button" className="docsera-modal__close" onClick={onClose} aria-label="Close modal" disabled={!canClose}>
              <svg className="docsera-modal__close-icon" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M6 18 18 6M6 6l12 12"
                  fill="none"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                />
              </svg>
            </button>
          </div>

          {errorMessage ? (
            <div className="docsera-modal__alert" role="alert">
              {errorMessage}
            </div>
          ) : null}

          <div className="docsera-modal__body">
            <label className="docsera-modal__field">
              <span className="docsera-modal__label">Workspace name</span>
              <input
                className={`docsera-modal__input${errors.name ? " docsera-modal__input--invalid" : ""}`}
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                placeholder="Example: HR Docs"
                disabled={pending}
              />
              {errors.name ? <span className="docsera-modal__field-error">{errors.name}</span> : null}
            </label>

            <label className="docsera-modal__field">
              <span className="docsera-modal__label">Short description</span>
              <input
                className={`docsera-modal__input${errors.shortDescription ? " docsera-modal__input--invalid" : ""}`}
                type="text"
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
