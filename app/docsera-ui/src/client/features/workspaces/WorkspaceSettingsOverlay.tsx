import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { DocseraIcon } from "../../shared/icons/DocseraIcon";
import { docseraIcons } from "../../shared/icons/docseraIcons";
import { DocseraCompactTooltip } from "../../shared/tooltip/DocseraTooltip";
import type { WorkspaceIcon, WorkspaceIconUploadResult, WorkspaceViewRecord } from "../../shared/types/docsera";
import { BUILT_IN_WORKSPACE_ICONS, DEFAULT_BUILT_IN_WORKSPACE_ICON, findBuiltInWorkspaceIcon, type BuiltInWorkspaceIcon } from "../../../shared/workspaces/domain";
import { WorkspaceIconBadge, type WorkspaceUploadedIconLoader } from "./WorkspacePrimitives";
import { usePanelTransitionPresence } from "./usePanelTransitionPresence";

const WORKSPACE_SETTINGS_NAME_MAX_LENGTH = 160;
const WORKSPACE_SETTINGS_SHORT_DESCRIPTION_MAX_LENGTH = 240;

type WorkspaceSettingsDraft = {
  iconKind: "builtin" | "uploaded";
  name: string;
  selectedBuiltInIconKey: string;
  shortDescription: string;
  persistedUploadedIcon?: (WorkspaceIcon & { type: "uploaded"; assetPath: string }) | null;
  uploadedIcon?: (WorkspaceIcon & { type: "uploaded"; assetPath: string }) | null;
  uploadedPreviewUrl?: string;
  tocVisible: boolean;
};

export type WorkspaceSettingsSubmitInput = {
  icon?: WorkspaceIcon;
  ownedPreviewObjectUrl?: string;
  previewIdentity?: Pick<WorkspaceViewRecord, "icon" | "name">;
  name: string;
  shortDescription: string | null;
  layout: { tocVisible: boolean };
};

type WorkspaceSettingsOverlayProps = {
  deleteErrorMessage?: string;
  deletePending?: boolean;
  errorMessage?: string;
  loadUploadedIcon?: WorkspaceUploadedIconLoader;
  onCleanupStagedIcon?: (input: { assetKey: string; workspaceSysId: string }) => void;
  onCancel: () => void;
  onConfirmDelete?: () => void;
  onDraftIdentityChange?: (identity: Pick<WorkspaceViewRecord, "icon" | "name"> | null) => void;
  onManageAccess?: (input: { waitForSettingsSave: boolean; workspaceSysId: string }) => void;
  onUploadIcon?: (input: { file: File; workspaceSysId?: string }) => Promise<WorkspaceIconUploadResult>;
  onSubmit: (input: WorkspaceSettingsSubmitInput) => void;
  open: boolean;
  pending: boolean;
  recoveryInput?: WorkspaceSettingsSubmitInput;
  workspace: WorkspaceViewRecord | null;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toWorkspaceIcon(icon: BuiltInWorkspaceIcon): WorkspaceIcon {
  return { type: "builtin", key: icon.key, label: icon.label };
}

function draftFromWorkspace(workspace: WorkspaceViewRecord, recoveryInput?: WorkspaceSettingsSubmitInput): WorkspaceSettingsDraft {
  const sourceIcon = recoveryInput?.icon ?? workspace.icon;
  const sourceLayout = recoveryInput?.layout ?? workspace.layout;
  const builtInIcon = workspace.icon.type === "builtin" ? findBuiltInWorkspaceIcon(workspace.icon.key) ?? DEFAULT_BUILT_IN_WORKSPACE_ICON : DEFAULT_BUILT_IN_WORKSPACE_ICON;
  const recoveryBuiltInIcon = sourceIcon.type === "builtin" ? findBuiltInWorkspaceIcon(sourceIcon.key) ?? DEFAULT_BUILT_IN_WORKSPACE_ICON : builtInIcon;
  return {
    iconKind: sourceIcon.type === "uploaded" ? "uploaded" : "builtin",
    name: recoveryInput?.name ?? workspace.name,
    persistedUploadedIcon: workspace.icon.type === "uploaded" && workspace.icon.assetPath ? { ...workspace.icon, type: "uploaded", assetPath: workspace.icon.assetPath } : null,
    selectedBuiltInIconKey: recoveryBuiltInIcon.key,
    shortDescription: recoveryInput?.shortDescription ?? workspace.shortDescription ?? "",
    uploadedIcon: sourceIcon.type === "uploaded" && sourceIcon.assetPath ? { ...sourceIcon, type: "uploaded", assetPath: sourceIcon.assetPath } : null,
    uploadedPreviewUrl: undefined,
    tocVisible: sourceLayout?.tocVisible ?? true
  };
}

function validateDraft(draft: WorkspaceSettingsDraft) {
  const errors: { name?: string; shortDescription?: string } = {};
  const name = cleanText(draft.name);
  const shortDescription = cleanText(draft.shortDescription);
  if (!name) {
    errors.name = "Workspace name is required.";
  } else if (name.length > WORKSPACE_SETTINGS_NAME_MAX_LENGTH) {
    errors.name = "Workspace name must be 160 characters or fewer.";
  }
  if (shortDescription.length > WORKSPACE_SETTINGS_SHORT_DESCRIPTION_MAX_LENGTH) {
    errors.shortDescription = "Short description must be 240 characters or fewer.";
  }
  return errors;
}

function sameDraft(left: WorkspaceSettingsDraft, right: WorkspaceSettingsDraft): boolean {
  const sameEffectiveIcon =
    left.iconKind === right.iconKind &&
    (left.iconKind === "builtin"
      ? left.selectedBuiltInIconKey === right.selectedBuiltInIconKey
      : left.uploadedIcon?.key === right.uploadedIcon?.key);

  return cleanText(left.name) === cleanText(right.name) &&
    cleanText(left.shortDescription) === cleanText(right.shortDescription) &&
    sameEffectiveIcon &&
    left.tocVisible === right.tocVisible;
}

export function WorkspaceSettingsOverlay({ deleteErrorMessage = "", deletePending = false, errorMessage, loadUploadedIcon, onCancel, onCleanupStagedIcon, onConfirmDelete, onDraftIdentityChange, onManageAccess, onSubmit, onUploadIcon, open, pending, recoveryInput, workspace }: WorkspaceSettingsOverlayProps) {
  const { active, present } = usePanelTransitionPresence(open);
  const [draft, setDraft] = useState<WorkspaceSettingsDraft | null>(null);
  const [visualWorkspace, setVisualWorkspace] = useState<WorkspaceViewRecord | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [attemptedDismiss, setAttemptedDismiss] = useState(false);
  const [uploadingIcon, setUploadingIcon] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const deleteDialogRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLElement | null>(null);
  const transferredPreviewUrlRef = useRef("");
  const uploadSequenceRef = useRef(0);
  const renderWorkspace = workspace ?? visualWorkspace;
  const canonicalDraft = useMemo(() => workspace ? draftFromWorkspace(workspace) : null, [workspace]);

  function isSettingsStagedIcon(icon: WorkspaceSettingsDraft["uploadedIcon"]): boolean {
    return Boolean(icon && workspace?.sysId && (workspace.icon.type !== "uploaded" || icon.key !== workspace.icon.key));
  }

  function cleanupSettingsStagedIcon(icon: WorkspaceSettingsDraft["uploadedIcon"]) {
    if (!icon || !isSettingsStagedIcon(icon) || !workspace?.sysId) return;
    onCleanupStagedIcon?.({ assetKey: icon.key, workspaceSysId: workspace.sysId });
  }

  useEffect(() => {
    if (!open) return;
    setDraft((current) => {
      if (current?.uploadedPreviewUrl && current.uploadedPreviewUrl !== transferredPreviewUrlRef.current) {
        URL.revokeObjectURL(current.uploadedPreviewUrl);
      }
      transferredPreviewUrlRef.current = "";
      return workspace ? draftFromWorkspace(workspace, recoveryInput) : null;
    });
    setAttemptedDismiss(false);
    setUploadError("");
    setUploadingIcon(false);
    setDeleteDialogOpen(false);
    uploadSequenceRef.current += 1;
    setVisualWorkspace(workspace);
  }, [open, recoveryInput, workspace]);

  useEffect(() => {
    if (present) return;
    setDraft((current) => {
      if (current?.uploadedPreviewUrl && current.uploadedPreviewUrl !== transferredPreviewUrlRef.current) {
        URL.revokeObjectURL(current.uploadedPreviewUrl);
      }
      transferredPreviewUrlRef.current = "";
      return null;
    });
    setVisualWorkspace(null);
  }, [present]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (deleteDialogOpen) {
          event.preventDefault();
          requestCloseDeleteDialog();
          return;
        }
        requestFinishEditing();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [canonicalDraft, deleteDialogOpen, deletePending, draft, onCancel, open, pending, uploadingIcon]);

  useEffect(() => {
    if (!open) return;
    const ownerDocument = panelRef.current?.ownerDocument ?? document;
    const handlePointerDown = (event: PointerEvent) => {
      const panel = panelRef.current;
      const deleteDialog = deleteDialogRef.current;
      const target = event.target;
      if (deleteDialogOpen) {
        const path = event.composedPath();
        if (deleteDialog && path.includes(deleteDialog)) {
          return;
        }
      }
      if (panel && target instanceof Node && panel.contains(target)) {
        return;
      }
      requestFinishEditing();
    };
    ownerDocument.addEventListener("pointerdown", handlePointerDown, true);
    return () => ownerDocument.removeEventListener("pointerdown", handlePointerDown, true);
  }, [canonicalDraft, deleteDialogOpen, draft, onCancel, open, pending, uploadingIcon]);

  useEffect(() => {
    if (!open || !workspace || !draft) {
      onDraftIdentityChange?.(null);
      return;
    }

    const selectedIcon = findBuiltInWorkspaceIcon(draft.selectedBuiltInIconKey) ?? DEFAULT_BUILT_IN_WORKSPACE_ICON;
    const icon =
      draft.iconKind === "builtin"
        ? toWorkspaceIcon(selectedIcon)
        : draft.uploadedIcon
          ? {
              ...draft.uploadedIcon,
              assetPath: draft.uploadedPreviewUrl ?? (isSettingsStagedIcon(draft.uploadedIcon) ? `${draft.uploadedIcon.assetPath}${draft.uploadedIcon.assetPath.includes("?") ? "&" : "?"}preview=settings&workspaceSysId=${encodeURIComponent(cleanText(workspace.sysId))}` : draft.uploadedIcon.assetPath)
            }
          : workspace.icon;
    onDraftIdentityChange?.({
      icon,
      name: cleanText(draft.name) || workspace.name
    });

    return () => onDraftIdentityChange?.(null);
  }, [draft, onDraftIdentityChange, open, workspace]);

  if (!present || !renderWorkspace || !draft) return null;

  const errors = validateDraft(draft);
  const selectedIcon = findBuiltInWorkspaceIcon(draft.selectedBuiltInIconKey) ?? DEFAULT_BUILT_IN_WORKSPACE_ICON;
  const showErrors = attemptedDismiss || Boolean(errorMessage);

  function requestFinishEditing(): "unchanged" | "submitted" | false {
    if (pending || uploadingIcon) return false;
    const currentDraft = draft;
    const currentCanonicalDraft = canonicalDraft;
    if (!currentDraft || !currentCanonicalDraft) return false;
    const currentWorkspace = workspace;
    if (!currentWorkspace) return false;
    setAttemptedDismiss(true);
    if (Object.keys(errors).length > 0) return false;
    if (sameDraft(currentDraft, currentCanonicalDraft)) {
      onCancel();
      return "unchanged";
    }
    const icon =
      currentDraft.iconKind === "builtin"
        ? toWorkspaceIcon(selectedIcon)
        : currentDraft.uploadedIcon && currentDraft.uploadedIcon.key !== currentCanonicalDraft.uploadedIcon?.key
          ? currentDraft.uploadedIcon
          : undefined;
    const previewIcon =
      currentDraft.iconKind === "builtin"
        ? toWorkspaceIcon(selectedIcon)
        : currentDraft.uploadedIcon
          ? {
              ...currentDraft.uploadedIcon,
              assetPath: currentDraft.uploadedPreviewUrl ?? currentDraft.uploadedIcon.assetPath
            }
          : currentWorkspace.icon;
    if (currentDraft.uploadedPreviewUrl) {
      transferredPreviewUrlRef.current = currentDraft.uploadedPreviewUrl;
    }
    onSubmit({
      name: cleanText(currentDraft.name),
      shortDescription: cleanText(currentDraft.shortDescription) || null,
      icon,
      ownedPreviewObjectUrl: currentDraft.uploadedPreviewUrl,
      previewIdentity: {
        icon: previewIcon,
        name: cleanText(currentDraft.name) || currentWorkspace.name
      },
      layout: { tocVisible: currentDraft.tocVisible }
    });
    return "submitted";
  }

  function requestManageAccess() {
    if (!workspace?.canManageWorkspaceMembers || pending || uploadingIcon) return;
    const result = requestFinishEditing();
    if (!result) return;
    onManageAccess?.({ waitForSettingsSave: result === "submitted", workspaceSysId: cleanText(workspace.sysId) });
  }

  function requestOpenDeleteDialog() {
    if (pending || uploadingIcon || deletePending || !workspace?.canManageSettings) return;
    setDeleteDialogOpen(true);
  }

  function requestCloseDeleteDialog() {
    if (deletePending) return;
    setDeleteDialogOpen(false);
  }

  async function handleIconFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!file || pending || uploadingIcon) return;
    if (!workspace?.sysId || !onUploadIcon) {
      setUploadError("Workspace icon upload is unavailable.");
      return;
    }
    const contentType = cleanText(file.type);
    const lowerName = file.name.toLowerCase();
    const acceptedType = ["image/png", "image/jpeg", "image/webp"].includes(contentType);
    const acceptedExtension = [".png", ".jpg", ".jpeg", ".webp"].some((extension) => lowerName.endsWith(extension));
    if ((!acceptedType && !acceptedExtension) || lowerName.endsWith(".gif") || lowerName.endsWith(".svg")) {
      setUploadError("Use a PNG, JPG, or WebP image.");
      return;
    }
    if (file.size > 1024 * 1024) {
      setUploadError("Workspace icon image must be 1 MB or smaller.");
      return;
    }
    setUploadingIcon(true);
    setUploadError("");
    const uploadSequence = uploadSequenceRef.current + 1;
    uploadSequenceRef.current = uploadSequence;
    try {
      const result = await onUploadIcon({ file, workspaceSysId: workspace.sysId });
      if (uploadSequenceRef.current !== uploadSequence) return;
      if (result.state === "failed") {
        setUploadError(result.errorMessage);
        return;
      }
      const previewUrl = URL.createObjectURL(file);
      setDraft((current) => {
        if (current?.uploadedPreviewUrl) {
          URL.revokeObjectURL(current.uploadedPreviewUrl);
        }
        if (current?.uploadedIcon?.key !== result.icon.key) {
          cleanupSettingsStagedIcon(current?.uploadedIcon ?? null);
        }
        return current ? { ...current, iconKind: "uploaded", uploadedIcon: result.icon, uploadedPreviewUrl: previewUrl } : current;
      });
    } catch {
      setUploadError("Something went wrong while uploading the workspace icon. The file was not saved. Please try again.");
    } finally {
      if (uploadSequenceRef.current === uploadSequence) {
        setUploadingIcon(false);
      }
    }
  }

  const closingAttributes = open ? {} : ({ "aria-hidden": true, inert: "" } as Record<string, unknown>);

  return (
    <div
      className={`docsera-workspace-settings-overlay${active ? " docsera-workspace-settings-overlay--open" : " docsera-workspace-settings-overlay--closing"}`}
      {...closingAttributes}
    >
      <aside ref={panelRef} className="docsera-workspace-settings-overlay__panel" role="complementary" aria-label="Workspace Settings">
        <div className="docsera-workspace-settings-overlay__header">
          <h2 className="docsera-workspace-settings-overlay__title">Workspace Settings</h2>
          <DocseraCompactTooltip label="Close workspace settings">
            <button type="button" className="docsera-modal__close docsera-workspace-settings-overlay__close" aria-label="Close workspace settings" onClick={requestFinishEditing} disabled={pending || uploadingIcon}>
              <DocseraIcon icon={docseraIcons.close} />
            </button>
          </DocseraCompactTooltip>
        </div>
        {errorMessage ? <div className="docsera-workspace-settings-overlay__alert" role="alert">{errorMessage}</div> : null}
        <div className="docsera-workspace-settings-overlay__body">
          <section className="docsera-workspace-settings-overlay__section" aria-labelledby="docsera-workspace-settings-general-title">
            <h3 id="docsera-workspace-settings-general-title" className="docsera-workspace-settings-overlay__section-title">GENERAL</h3>
            <label className="docsera-workspace-settings-overlay__field">
              <span className="docsera-workspace-settings-overlay__field-label">Name</span>
              <input aria-label="Workspace name" className={`docsera-workspace-settings-overlay__input${errors.name ? " docsera-workspace-settings-overlay__input--invalid" : ""}`} type="text" value={draft.name} maxLength={WORKSPACE_SETTINGS_NAME_MAX_LENGTH} disabled={pending} onChange={(event) => setDraft((current) => current ? { ...current, name: event.target.value } : current)} />
              {showErrors && errors.name ? <span className="docsera-workspace-settings-overlay__field-error">{errors.name}</span> : null}
            </label>
            <label className="docsera-workspace-settings-overlay__field">
              <span className="docsera-workspace-settings-overlay__field-label">Description</span>
              <input aria-label="Short description" className={`docsera-workspace-settings-overlay__input${errors.shortDescription ? " docsera-workspace-settings-overlay__input--invalid" : ""}`} type="text" value={draft.shortDescription} maxLength={WORKSPACE_SETTINGS_SHORT_DESCRIPTION_MAX_LENGTH} placeholder="What is this workspace for?" disabled={pending} onChange={(event) => setDraft((current) => current ? { ...current, shortDescription: event.target.value } : current)} />
              {showErrors && errors.shortDescription ? <span className="docsera-workspace-settings-overlay__field-error">{errors.shortDescription}</span> : null}
            </label>
          </section>
          <fieldset className="docsera-workspace-settings-overlay__section docsera-workspace-settings-overlay__section--icon docsera-workspace-icon-picker">
            <legend className="docsera-workspace-settings-overlay__section-title">Icon</legend>
            <div className="docsera-workspace-icon-picker__grid">
              {draft.uploadedIcon ? (
                <button type="button" className={`docsera-workspace-icon-picker__option${draft.iconKind === "uploaded" ? " docsera-workspace-icon-picker__option--selected" : ""}`} aria-pressed={draft.iconKind === "uploaded"} aria-label={`${renderWorkspace.icon.label}, current uploaded icon${draft.iconKind === "uploaded" ? ", selected" : ""}`} disabled={pending} onClick={() => setDraft((current) => current ? { ...current, iconKind: "uploaded" } : current)}>
                  <WorkspaceIconBadge workspace={{ icon: { ...draft.uploadedIcon, assetPath: draft.uploadedPreviewUrl ?? (isSettingsStagedIcon(draft.uploadedIcon) ? `${draft.uploadedIcon.assetPath}${draft.uploadedIcon.assetPath.includes("?") ? "&" : "?"}preview=settings&workspaceSysId=${encodeURIComponent(cleanText(renderWorkspace.sysId))}` : draft.uploadedIcon.assetPath) }, name: draft.uploadedIcon.label }} loadUploadedIcon={loadUploadedIcon} />
                </button>
              ) : null}
              {draft.persistedUploadedIcon && draft.uploadedIcon?.key !== draft.persistedUploadedIcon.key ? (
                <button type="button" className="docsera-workspace-icon-picker__option" aria-pressed={false} aria-label={`${draft.persistedUploadedIcon.label}, persisted uploaded icon`} disabled={pending} onClick={() => setDraft((current) => {
                  cleanupSettingsStagedIcon(current?.uploadedIcon ?? null);
                  return current ? { ...current, iconKind: "uploaded", uploadedIcon: current.persistedUploadedIcon ?? null, uploadedPreviewUrl: undefined } : current;
                })}>
                  <WorkspaceIconBadge workspace={{ icon: draft.persistedUploadedIcon, name: draft.persistedUploadedIcon.label }} loadUploadedIcon={loadUploadedIcon} />
                </button>
              ) : null}
              {BUILT_IN_WORKSPACE_ICONS.map((icon) => {
                const selected = draft.iconKind === "builtin" && icon.key === selectedIcon.key;
                return (
                  <button key={icon.key} type="button" className={`docsera-workspace-icon-picker__option${selected ? " docsera-workspace-icon-picker__option--selected" : ""}`} aria-pressed={selected} aria-label={`${icon.label}${selected ? ", selected" : ""}`} disabled={pending} onClick={() => setDraft((current) => {
                    cleanupSettingsStagedIcon(current?.uploadedIcon ?? null);
                    return current ? { ...current, iconKind: "builtin", selectedBuiltInIconKey: icon.key, uploadedIcon: isSettingsStagedIcon(current.uploadedIcon ?? null) ? null : current.uploadedIcon } : current;
                  })}>
                    <WorkspaceIconBadge workspace={{ icon: toWorkspaceIcon(icon), name: icon.label }} />
                  </button>
                );
              })}
            </div>
            <div className="docsera-workspace-icon-picker__upload-row">
              <input ref={fileInputRef} className="docsera-workspace-icon-picker__file-input" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" aria-label="Upload custom workspace icon" onChange={handleIconFileChange} disabled={pending || uploadingIcon} />
              <button type="button" className="docsera-workspace-icon-picker__upload-button" aria-label="Upload custom workspace icon" disabled={pending || uploadingIcon} onClick={() => fileInputRef.current?.click()}>
                Upload custom Icon
              </button>
              <span className="docsera-workspace-icon-picker__constraints">Square, 128x128 min, 1 MB max. PNG, JPG or WebP.</span>
            </div>
            <div className="docsera-workspace-icon-picker__status" role="status" aria-live="polite">
              {uploadingIcon ? "Uploading workspace icon..." : draft.uploadedIcon ? "Custom image uploaded." : ""}
            </div>
            {uploadError ? <span className="docsera-workspace-settings-overlay__field-error" role="alert">{uploadError}</span> : null}
          </fieldset>
          <section className="docsera-workspace-settings-overlay__section" aria-labelledby="docsera-workspace-settings-preferences-title">
            <h3 id="docsera-workspace-settings-preferences-title" className="docsera-workspace-settings-overlay__section-title">PREFERENCES</h3>
            <div className="docsera-workspace-settings-overlay__preference-group">
              <label className="docsera-workspace-settings-overlay__preference-row">
                <span className="docsera-workspace-settings-overlay__preference-copy">
                  <span className="docsera-workspace-settings-overlay__preference-title">Table of contents</span>
                  <span className="docsera-workspace-settings-overlay__preference-description">Show page outlines.</span>
                </span>
                <span className="docsera-workspace-settings-overlay__switch">
                  <input type="checkbox" aria-label="Show table of contents" checked={draft.tocVisible} disabled={pending} onChange={(event) => setDraft((current) => current ? { ...current, tocVisible: event.target.checked } : current)} />
                  <span aria-hidden="true" className="docsera-workspace-settings-overlay__switch-track">
                    <span className="docsera-workspace-settings-overlay__switch-thumb" />
                  </span>
                </span>
              </label>
              {renderWorkspace.canManageWorkspaceMembers ? (
                <div className="docsera-workspace-settings-overlay__preference-row">
                  <span className="docsera-workspace-settings-overlay__preference-copy">
                    <span className="docsera-workspace-settings-overlay__preference-title">Access</span>
                    <span className="docsera-workspace-settings-overlay__preference-description">Manage workspace Admins and Editors.</span>
                  </span>
                  <button type="button" className="docsera-workspace-icon-picker__upload-button docsera-workspace-settings-overlay__access-button" aria-label="Manage workspace access" disabled={pending || uploadingIcon} onClick={requestManageAccess}>
                    Manage
                  </button>
                </div>
              ) : null}
            </div>
          </section>
          {renderWorkspace.canManageSettings ? (
            <section className="docsera-workspace-settings-overlay__danger-zone" aria-labelledby="docsera-workspace-settings-danger-title">
              <span className="docsera-workspace-settings-overlay__danger-copy">
                <span id="docsera-workspace-settings-danger-title" className="docsera-workspace-settings-overlay__danger-title">Delete workspace</span>
                <span className="docsera-workspace-settings-overlay__danger-description">Permanently removes it and all contents.</span>
              </span>
              <button type="button" className="docsera-destructive-action docsera-workspace-settings-overlay__delete-button" aria-label="Delete workspace" disabled={pending || uploadingIcon || deletePending} onClick={requestOpenDeleteDialog}>
                <DocseraIcon icon={docseraIcons.trash} size={16} />
                <span>Delete</span>
              </button>
            </section>
          ) : null}
        </div>
        <div className="docsera-workspace-settings-overlay__footer">
          <span className="docsera-workspace-settings-overlay__footer-dot" aria-hidden="true" />
          <p className="docsera-workspace-settings-overlay__footer-copy">Changes save automatically when you close this panel.</p>
        </div>
      </aside>
      {deleteDialogOpen ? (
        <div ref={deleteDialogRef} className="docsera-modal" role="presentation" onClick={requestCloseDeleteDialog}>
          <div className="docsera-modal__panel docsera-page-settings__delete-panel" role="dialog" aria-modal="true" aria-labelledby="docsera-delete-workspace-title" onClick={(event) => event.stopPropagation()}>
            <div className="docsera-modal__form">
              <div className="docsera-modal__header">
                <h2 id="docsera-delete-workspace-title" className="docsera-modal__title">Delete workspace</h2>
                <DocseraCompactTooltip label="Close delete workspace dialog">
                  <button type="button" className="docsera-modal__close" disabled={deletePending} onClick={requestCloseDeleteDialog} aria-label="Close delete workspace dialog">
                    <DocseraIcon icon={docseraIcons.close} />
                  </button>
                </DocseraCompactTooltip>
              </div>
              {deleteErrorMessage ? <div className="docsera-modal__alert" role="alert">{deleteErrorMessage}</div> : null}
              <div className="docsera-modal__body">
                <p className="docsera-modal__copy">This will permanently delete {renderWorkspace.name} and its contents. This cannot be undone.</p>
              </div>
              <div className="docsera-modal__footer">
                <div className="docsera-modal__actions">
                  <button type="button" className="docsera-modal__secondary" disabled={deletePending} onClick={requestCloseDeleteDialog}>Cancel</button>
                  <button type="button" className="docsera-modal__primary docsera-modal__primary--destructive docsera-delete-confirmation-button" aria-busy={deletePending ? "true" : undefined} disabled={deletePending} onClick={onConfirmDelete}>
                    {deletePending ? (
                      <span className="docsera-delete-confirmation-button__spinner-slot" aria-hidden="true">
                        <span className="docsera-delete-confirmation-button__spinner" />
                      </span>
                    ) : null}
                    <span className="docsera-delete-confirmation-button__label">Delete</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
