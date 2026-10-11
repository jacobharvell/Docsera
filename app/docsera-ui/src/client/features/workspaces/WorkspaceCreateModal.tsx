import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { DocseraIcon } from "../../shared/icons/DocseraIcon";
import { docseraIcons } from "../../shared/icons/docseraIcons";
import { DocseraCompactTooltip } from "../../shared/tooltip/DocseraTooltip";
import type { WorkspaceIcon, WorkspaceIconUploadResult } from "../../shared/types/docsera";
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
  onUploadIcon?: (input: { file: File }) => Promise<WorkspaceIconUploadResult>;
  open: boolean;
  phase: "idle" | "submitting" | "polling";
};

type FormErrors = {
  name?: string;
  shortDescription?: string;
  icon?: string;
};

type UploadedIconSelection = {
  icon: WorkspaceIcon & { type: "uploaded"; assetPath: string };
  previewUrl: string;
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

export function WorkspaceCreateModal({ errorMessage, onClose, onSubmit, onUploadIcon, open, phase }: WorkspaceCreateModalProps) {
  const [name, setName] = useState("");
  const [shortDescription, setShortDescription] = useState("");
  const [selectedIconKey, setSelectedIconKey] = useState(DEFAULT_BUILT_IN_WORKSPACE_ICON.key);
  const [selectedIconType, setSelectedIconType] = useState<"builtin" | "uploaded">("builtin");
  const [uploadedIcon, setUploadedIcon] = useState<UploadedIconSelection | null>(null);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const uploadSequenceRef = useRef(0);

  useEffect(() => {
    if (!open) {
      setName("");
      setShortDescription("");
      setSelectedIconKey(DEFAULT_BUILT_IN_WORKSPACE_ICON.key);
      setSelectedIconType("builtin");
      setUploadedIcon((current) => {
        if (current?.previewUrl) {
          URL.revokeObjectURL(current.previewUrl);
        }
        return null;
      });
      uploadSequenceRef.current += 1;
      setUploadingIcon(false);
      setErrors({});
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const trimmedName = cleanText(name);
  const trimmedDescription = cleanText(shortDescription);
  const nameInvalid = !trimmedName || trimmedName.length > 80;
  const descriptionInvalid = trimmedDescription.length > 160;
  const iconInvalid = selectedIconType === "uploaded" && !uploadedIcon;
  const pending = phase !== "idle";
  const canClose = phase === "idle" && !uploadingIcon;
  const selectedIcon = findBuiltInWorkspaceIcon(selectedIconKey) ?? DEFAULT_BUILT_IN_WORKSPACE_ICON;
  const controlsDisabled = pending || uploadingIcon;
  const formInvalid = nameInvalid || descriptionInvalid || iconInvalid;
  const createDisabled = controlsDisabled || formInvalid;
  const createDisabledReason = pending ? "pending" : uploadingIcon ? "uploading" : formInvalid ? "invalid" : undefined;

  function validate(): boolean {
    const nextErrors: FormErrors = {};

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

    if (uploadingIcon) {
      setErrors((current) => ({ ...current, icon: "Wait for the workspace icon upload to finish before creating the workspace." }));
      return;
    }

    if (iconInvalid) {
      setErrors((current) => ({ ...current, icon: "Upload a valid workspace icon or choose a built-in icon." }));
      return;
    }

    onSubmit({
      name: cleanText(name),
      shortDescription: cleanText(shortDescription),
      icon: selectedIconType === "uploaded" && uploadedIcon
        ? uploadedIcon.icon
        : toWorkspaceIcon(findBuiltInWorkspaceIcon(selectedIconKey) ?? DEFAULT_BUILT_IN_WORKSPACE_ICON)
    });
  }

  function selectBuiltInIcon(iconKey: string) {
    if (pending || uploadingIcon) return;
    setSelectedIconKey(iconKey);
    setSelectedIconType("builtin");
    setErrors((current) => ({ ...current, icon: undefined }));
  }

  async function handleIconFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file || pending || uploadingIcon) return;

    if (!onUploadIcon) {
      setErrors((current) => ({ ...current, icon: "Workspace icon upload is unavailable." }));
      return;
    }

    const contentType = cleanText(file.type);
    const lowerName = file.name.toLowerCase();
    const acceptedType = ["image/png", "image/jpeg", "image/webp"].includes(contentType);
    const acceptedExtension = [".png", ".jpg", ".jpeg", ".webp"].some((extension) => lowerName.endsWith(extension));
    if ((!acceptedType && !acceptedExtension) || lowerName.endsWith(".gif") || lowerName.endsWith(".svg")) {
      setErrors((current) => ({ ...current, icon: "Use a PNG, JPG, or WebP image." }));
      return;
    }

    if (file.size > 1024 * 1024) {
      setErrors((current) => ({ ...current, icon: "Workspace icon image must be 1 MB or smaller." }));
      return;
    }

    setUploadingIcon(true);
    setErrors((current) => ({ ...current, icon: undefined }));
    const uploadSequence = uploadSequenceRef.current + 1;
    uploadSequenceRef.current = uploadSequence;

    try {
      const result = await onUploadIcon({ file });
      if (uploadSequenceRef.current !== uploadSequence) {
        return;
      }
      if (result.state === "failed") {
        setErrors((current) => ({ ...current, icon: result.errorMessage }));
        return;
      }

      const previewUrl = URL.createObjectURL(file);
      setUploadedIcon((current) => {
        if (current?.previewUrl) {
          URL.revokeObjectURL(current.previewUrl);
        }
        return { icon: result.icon, previewUrl };
      });
      setSelectedIconType("uploaded");
    } catch {
      setErrors((current) => ({
        ...current,
        icon: "Something went wrong while uploading the workspace icon. The file was not saved. Please try again."
      }));
    } finally {
      if (uploadSequenceRef.current === uploadSequence) {
        setUploadingIcon(false);
      }
    }
  }

  return (
    <div className="docsera-modal" role="presentation" onMouseDown={() => (canClose ? onClose() : undefined)}>
      <div
        className="docsera-modal__panel docsera-create-workspace-modal"
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
            <DocseraCompactTooltip label="Close modal">
              <button type="button" className="docsera-modal__close" onClick={onClose} aria-label="Close modal" disabled={!canClose}>
                <DocseraIcon className="docsera-modal__close-icon" icon={docseraIcons.close} />
              </button>
            </DocseraCompactTooltip>
          </div>

          {errorMessage ? (
            <div className="docsera-modal__alert" role="alert">
              {errorMessage}
            </div>
          ) : null}

          <div className="docsera-modal__body">
            <label className="docsera-modal__field">
              <span className="docsera-modal__label" id="docsera-create-workspace-name-label">Name</span>
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
              <span className="docsera-modal__label">
                <span id="docsera-create-workspace-description-label">Description</span>
                <span className="docsera-create-workspace-modal__label-note" aria-hidden="true">(Optional)</span>
              </span>
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
              <legend className="docsera-modal__label">Icon</legend>
              <div className="docsera-workspace-icon-picker__grid">
                {BUILT_IN_WORKSPACE_ICONS.map((icon) => {
                  const selected = selectedIconType === "builtin" && icon.key === selectedIcon.key;
                  return (
                    <button
                      key={icon.key}
                      type="button"
                      className={`docsera-workspace-icon-picker__option${selected ? " docsera-workspace-icon-picker__option--selected" : ""}`}
                      aria-pressed={selected}
                      aria-label={`${icon.label}${selected ? ", selected" : ""}`}
                      disabled={controlsDisabled}
                      onClick={() => selectBuiltInIcon(icon.key)}
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
                {uploadedIcon ? (
                  <button
                    type="button"
                    className={`docsera-workspace-icon-picker__option${selectedIconType === "uploaded" ? " docsera-workspace-icon-picker__option--selected" : ""}`}
                    aria-pressed={selectedIconType === "uploaded"}
                    aria-label={`${uploadedIcon.icon.label}${selectedIconType === "uploaded" ? ", selected" : ""}`}
                    disabled={controlsDisabled}
                    onClick={() => {
                      if (controlsDisabled) return;
                      setSelectedIconType("uploaded");
                      setErrors((current) => ({ ...current, icon: undefined }));
                    }}
                  >
                    <WorkspaceIconBadge workspace={{ icon: { ...uploadedIcon.icon, assetPath: uploadedIcon.previewUrl }, name: uploadedIcon.icon.label }} />
                  </button>
                ) : null}
              </div>
              <div className="docsera-workspace-icon-picker__upload-row">
                <input
                  ref={fileInputRef}
                  className="docsera-workspace-icon-picker__file-input"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp"
                  aria-label="Upload custom workspace icon"
                  onChange={handleIconFileChange}
                  disabled={controlsDisabled}
                />
                <button
                  type="button"
                  className="docsera-workspace-icon-picker__upload-button"
                  disabled={controlsDisabled}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploadedIcon ? "Replace custom icon" : "Upload custom icon"}
                </button>
                <span className="docsera-workspace-icon-picker__constraints">Square, 128x128 min, 1 MB max. PNG, JPG or WebP.</span>
              </div>
              <div className="docsera-workspace-icon-picker__status" role="status" aria-live="polite">
                {uploadingIcon ? "Uploading workspace icon..." : uploadedIcon ? "Custom image uploaded." : ""}
              </div>
              {errors.icon ? <span className="docsera-modal__field-error" role="alert">{errors.icon}</span> : null}
            </fieldset>

          </div>
          <div className="docsera-modal__footer">
            <div className="docsera-modal__actions">
              <button type="button" className="docsera-modal__secondary" onClick={onClose} disabled={!canClose}>
                Cancel
              </button>
              <button
                type="submit"
                className="docsera-modal__primary docsera-create-workspace-modal__primary"
                aria-busy={pending ? "true" : undefined}
                data-disabled-reason={createDisabledReason}
                disabled={createDisabled}
              >
                {pending ? (
                  <span className="docsera-create-workspace-modal__primary-spinner" aria-hidden="true">
                    <span className="docsera-changes-center__spinner" />
                  </span>
                ) : null}
                <span className="docsera-create-workspace-modal__primary-label">Create</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
