import { useState } from "react";
import { PageEditorHost, type PageEditorHostFailure, type PageEditorRecoverySnapshot } from "../../editor/PageEditorHost";
import type { DocseraDocumentEnvelope } from "../../../shared/editor/document";
import { PublishedDocumentReader } from "./PublishedDocumentReader";
import type { PageBodySaveResult, WorkspaceMode } from "../../shared/types/docsera";
import type { WorkspacePageView } from "./workspaceViewModels";

type WorkspaceMainPaneProps = {
  bodyNotice?: {
    eyebrow: string;
    kind: "alert" | "status";
    message: string;
  } | null;
  bodyState: "loading" | "ready";
  editorInitialSavedEnvelope?: DocseraDocumentEnvelope;
  page: WorkspacePageView | null;
  workspaceMode: WorkspaceMode;
  canCreatePage: boolean;
  canEditPageBody: boolean;
  editAccessLost: boolean;
  accessLossMessage?: string;
  stateCopy: string;
  stateTitle: string;
  stateType: "loading" | "error" | "ready";
  showPendingState: boolean;
  onReturnToMyWorkspaces: () => void;
  onReturnToLive: () => void;
  onRetryWorkspace?: () => void;
  onRetryEditor: () => void;
  onEditorReadyStateChange: (ready: boolean) => void;
  onOutlineChange: (pageSysId: string, outline: WorkspacePageView["tocItems"]) => void;
  onSavePageDraft: (input: {
    draftContentJson: DocseraDocumentEnvelope;
    expectedRevision: number;
    pageSysId: string;
    readLatestDraftContentJson?: () => DocseraDocumentEnvelope | null;
  }) => Promise<PageBodySaveResult>;
  onStatusChange: (state: {
    flush?: () => Promise<boolean>;
    getRecoverySnapshot?: () => PageEditorRecoverySnapshot | null;
    release?: (options?: { keepalive?: boolean }) => Promise<void>;
    isDirty: boolean;
    isSaving: boolean;
    status: "Unsaved" | "Saving…" | "Saved" | "Changes not saved";
  }) => void;
  saveStatus?: "Unsaved" | "Saving…" | "Saved" | "Changes not saved";
  onShowCreatePage: () => void;
  onAccessLost: () => void;
  sessionKey: string;
  theme: "dark" | "light";
  editorFailure: PageEditorHostFailure | null;
  onEditorFailureChange: (failure: PageEditorHostFailure | null) => void;
};

function EditorRecovery({
  message,
  onReturnToLive,
  onRetry
}: {
  message: string;
  onReturnToLive: () => void;
  onRetry: () => void;
}) {
  return (
    <section className="docsera-main__editor-recovery" role="alert">
      <p className="docsera-main__eyebrow">Editor recovery</p>
      <h2 className="docsera-main__recovery-title">The draft editor is unavailable</h2>
      <p className="docsera-main__lede">{message}</p>
      <div className="docsera-main__recovery-actions">
        <button type="button" className="docsera-main__empty-action" onClick={onRetry}>
          Try again
        </button>
        <button type="button" className="docsera-main__secondary-action" onClick={onReturnToLive}>
          Return to Live
        </button>
      </div>
    </section>
  );
}

function WorkspaceStateCard({
  copy,
  onRetry,
  onReturnToMyWorkspaces,
  title
}: {
  copy: string;
  onRetry?: () => void;
  onReturnToMyWorkspaces: () => void;
  title: string;
}) {
  return (
    <section className="docsera-main__editor-recovery" role="alert">
      <p className="docsera-main__eyebrow">Workspace</p>
      <h2 id="docsera-workspace-error-title" className="docsera-main__recovery-title">
        {title}
      </h2>
      <p className="docsera-main__lede">{copy}</p>
      <div className="docsera-main__recovery-actions">
        {onRetry ? (
          <button type="button" className="docsera-main__empty-action" onClick={onRetry}>
            Try again
          </button>
        ) : null}
        <button type="button" className="docsera-main__secondary-action" onClick={onReturnToMyWorkspaces}>
          Return to My Workspaces
        </button>
      </div>
    </section>
  );
}

export function WorkspaceMainPane({
  bodyNotice,
  bodyState,
  editorInitialSavedEnvelope,
  page,
  workspaceMode,
  canCreatePage,
  canEditPageBody,
  editAccessLost,
  accessLossMessage,
  stateCopy,
  stateTitle,
  stateType,
  showPendingState,
  onReturnToMyWorkspaces,
  onReturnToLive,
  onRetryWorkspace,
  onRetryEditor,
  onEditorReadyStateChange,
  onOutlineChange,
  onSavePageDraft,
  onStatusChange,
  saveStatus,
  onShowCreatePage,
  onAccessLost,
  sessionKey,
  theme,
  editorFailure,
  onEditorFailureChange
}: WorkspaceMainPaneProps) {

  if (stateType !== "ready") {
    return (
      <main className="docsera-main" aria-label={stateType === "error" ? "Workspace unavailable" : "Loading workspace"}>
        <article className="docsera-main__surface docsera-main__surface--empty">
          {stateType === "error" ? (
            <WorkspaceStateCard
              copy={stateCopy}
              onRetry={onRetryWorkspace}
              onReturnToMyWorkspaces={onReturnToMyWorkspaces}
              title={stateTitle}
            />
          ) : showPendingState ? (
            <div className="docsera-main__pending" aria-hidden="true">
              <span className="docsera-main__pending-line" />
              <span className="docsera-main__pending-line docsera-main__pending-line--wide" />
              <span className="docsera-main__pending-line" />
            </div>
          ) : (
            null
          )}
        </article>
      </main>
    );
  }

  if (!page) {
    const isEditMode = workspaceMode === "edit";

    return (
      <main className="docsera-main" aria-labelledby="docsera-empty-workspace-title">
        <article className="docsera-main__surface docsera-main__surface--empty">
          <div className="docsera-main__intro">
            <p className="docsera-main__eyebrow">Workspace</p>
            <h1 id="docsera-empty-workspace-title" className="docsera-main__title">
              {isEditMode ? "No pages yet" : "No published pages"}
            </h1>
            <p className="docsera-main__lede">
              {isEditMode
                ? "Create the first shared draft page in this workspace to start authoring."
                : "This workspace does not have any published pages yet."}
            </p>
          </div>

          {isEditMode && canCreatePage ? (
            <button type="button" className="docsera-main__empty-action" onClick={onShowCreatePage}>
              New page
            </button>
          ) : null}
        </article>
      </main>
    );
  }

  const showBodyPending = bodyState === "loading";
  const showEditorRecovery =
    workspaceMode === "edit" &&
    !showBodyPending &&
    (page.contentState !== "ready" || Boolean(editorFailure));

  return (
    <main className="docsera-main" aria-labelledby="docsera-page-title">
      <article className={`docsera-main__surface${workspaceMode === "edit" ? " docsera-main__surface--editor" : ""}`}>
        <div className="docsera-main__intro">
          <div className="docsera-main__page-header">
            <h1 id="docsera-page-title" className="docsera-main__title">
              {page.title}
            </h1>
            {workspaceMode === "edit" && saveStatus ? (
              <span className="docsera-main__save-status" aria-live="polite" role="status">
                {saveStatus}
              </span>
            ) : null}
          </div>
        </div>

        {bodyNotice ? (
          <section className="docsera-main__reader-notice" role={bodyNotice.kind}>
            <p className="docsera-main__eyebrow">{bodyNotice.eyebrow}</p>
            <p className="docsera-main__lede">{bodyNotice.message}</p>
          </section>
        ) : null}

        {editAccessLost ? (
          <section className="docsera-main__access-loss" role="alert">
            <p className="docsera-main__eyebrow">Access lost</p>
            <h2 className="docsera-main__recovery-title">Authoring access is no longer available</h2>
            <p className="docsera-main__lede">
              {accessLossMessage || "Further draft actions are disabled for this session. Return to Live to reload the published workspace view."}
            </p>
            <button type="button" className="docsera-main__secondary-action" onClick={onReturnToLive}>
              Return to Live
            </button>
          </section>
        ) : workspaceMode === "live" ? (
          showBodyPending ? (
            <section className="docsera-main__pending" aria-label="Loading page content" role="status">
              <span className="docsera-main__pending-line" />
              <span className="docsera-main__pending-line docsera-main__pending-line--wide" />
              <span className="docsera-main__pending-line" />
            </section>
          ) : page.contentState === "ready" && page.contentEnvelope ? (
            <PublishedDocumentReader envelope={page.contentEnvelope} />
          ) : (
            <section className="docsera-main__editor-recovery" role="status">
              <p className="docsera-main__eyebrow">Reader</p>
              <h2 className="docsera-main__recovery-title">Published content unavailable</h2>
              <p className="docsera-main__lede">{page.contentError || "The published page content could not be loaded."}</p>
            </section>
          )
        ) : showEditorRecovery ? (
          <EditorRecovery
            message={editorFailure?.message || page.contentError || "The draft document could not be loaded safely."}
            onReturnToLive={onReturnToLive}
            onRetry={onRetryEditor}
          />
        ) : page.contentEnvelope ? (
          <>
            {sessionKey ? (
              <div hidden={showBodyPending}>
                <PageEditorHost
                  canEdit={canEditPageBody && !editAccessLost}
                  initialEnvelope={page.contentEnvelope}
                  initialSavedEnvelope={editorInitialSavedEnvelope}
                  initialRevision={page.page.draftRevision ?? 0}
                  onAccessLost={onAccessLost}
                  onError={onEditorFailureChange}
                  onOutlineChange={(outline) => onOutlineChange(page.sysId, outline)}
                  onReadyStateChange={onEditorReadyStateChange}
                  onSaveDraft={onSavePageDraft}
                  onStatusChange={onStatusChange}
                  pageSysId={page.sysId}
                  sessionKey={sessionKey}
                  theme={theme}
                />
              </div>
            ) : null}
            {showBodyPending ? (
              <section className="docsera-main__pending" aria-label="Loading editor" role="status">
                <span className="docsera-main__pending-line" />
                <span className="docsera-main__pending-line docsera-main__pending-line--wide" />
                <span className="docsera-main__pending-line" />
              </section>
            ) : null}
          </>
        ) : null}
      </article>
    </main>
  );
}
