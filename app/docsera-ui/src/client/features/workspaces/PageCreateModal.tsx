import { useEffect, useState, type FormEvent } from "react";

type PageCreateModalProps = {
  errorMessage?: string;
  onClose: () => void;
  onSubmit: (input: { title: string }) => void;
  open: boolean;
  phase: "idle" | "submitting";
};

type FormErrors = {
  title?: string;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function PageCreateModal({ errorMessage, onClose, onSubmit, open, phase }: PageCreateModalProps) {
  const [title, setTitle] = useState("");
  const [errors, setErrors] = useState<FormErrors>({});
  const titleInputId = "docsera-create-page-title-input";

  useEffect(() => {
    if (!open) {
      setTitle("");
      setErrors({});
    }
  }, [open]);

  if (!open) {
    return null;
  }

  function validate(): boolean {
    const nextErrors: FormErrors = {};
    const trimmedTitle = cleanText(title);

    if (!trimmedTitle) {
      nextErrors.title = "Page title is required.";
    } else if (trimmedTitle.length > 160) {
      nextErrors.title = "Page title must be 160 characters or fewer.";
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
      title: cleanText(title)
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
        aria-labelledby="docsera-create-page-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form className="docsera-modal__form" onSubmit={handleSubmit}>
          <div className="docsera-modal__header">
            <div>
              <p className="docsera-modal__eyebrow">New page</p>
              <h2 id="docsera-create-page-title" className="docsera-modal__title">
                Create page
              </h2>
            </div>
            <button type="button" className="docsera-modal__close" onClick={onClose} aria-label="Close modal" disabled={!canClose}>
              x
            </button>
          </div>

          <p className="docsera-modal__copy">
            The page will be created at the workspace root. Body persistence is deferred for this slice.
          </p>

          {errorMessage ? (
            <div className="docsera-modal__alert" role="alert">
              {errorMessage}
            </div>
          ) : null}

          <label className="docsera-modal__field" htmlFor={titleInputId}>
            <span className="docsera-modal__label">
              Page title
            </span>
            <input
              id={titleInputId}
              className={`docsera-modal__input${errors.title ? " docsera-modal__input--invalid" : ""}`}
              type="text"
              aria-label="Page title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              maxLength={160}
              disabled={pending}
              autoFocus
            />
            {errors.title ? <span className="docsera-modal__field-error">{errors.title}</span> : null}
          </label>

          <div className="docsera-modal__actions">
            <button type="button" className="docsera-modal__secondary" onClick={onClose} disabled={pending}>
              Cancel
            </button>
            <button type="submit" className="docsera-modal__primary" disabled={pending}>
              {phase === "submitting" ? "Creating page..." : "Create page"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
