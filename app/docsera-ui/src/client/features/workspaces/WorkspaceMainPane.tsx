import { useEffect, useRef, useState } from "react";
import {
  PageEditorHost,
  type PageEditorCanonicalHandoffResult,
  type PageEditorHostFailure,
  type PageEditorRecoverySnapshot,
  type PageEditorStatusState
} from "../../editor/PageEditorHost";
import type { EditorMediaAdapter } from "../../editor/contracts";
import type { DocseraDocumentEnvelope } from "../../../shared/editor/document";
import { PublishedDocumentReader } from "./PublishedDocumentReader";
import type { PageBodySaveResult, WorkspaceMode } from "../../shared/types/docsera";
import type { WorkspaceMediaLoader } from "../../shared/types/docsera";
import type { WorkspacePageView } from "./workspaceViewModels";
import type { WorkspaceAuthoringSurface } from "./workspaceAuthoringSurface";
import { WorkspaceMarkdownSourcePanel } from "./WorkspaceMarkdownSourcePanel";

type WorkspaceMainPaneProps = {
  bodyNotice?: {
    eyebrow: string;
    kind: "alert" | "status";
    message: string;
  } | null;
  bodyState: "loading" | "ready";
  editorInitialSavedEnvelope?: DocseraDocumentEnvelope;
  editorCanonicalEnvelope?: DocseraDocumentEnvelope | null;
  mediaAdapter?: EditorMediaAdapter;
  loadMedia?: WorkspaceMediaLoader;
  page: WorkspacePageView | null;
  workspaceMode: WorkspaceMode;
  canCreatePage: boolean;
  canEditPageBody: boolean;
  canManagePageSettings: boolean;
  editAccessLost: boolean;
  accessLossMessage?: string;
  pageTitleActive: boolean;
  pageTitleSaveError?: string;
  pageTitleValidationError?: string;
  pageTitleValue?: string;
  stateCopy: string;
  stateTitle: string;
  stateType: "loading" | "error" | "ready";
  showPendingState: boolean;
  onReturnToMyWorkspaces: () => void;
  onReturnToLive: () => void;
  onRetryWorkspace?: () => void;
  onRetryEditor: () => void;
  onPageTitleCancel: () => void;
  onPageTitleChange: (value: string) => void;
  onPageTitleCommit: () => void | Promise<void>;
  onPageTitleStart: (pageSysId: string) => void;
  onEditorReadyStateChange: (ready: boolean) => void;
  onOutlineChange: (pageSysId: string, outline: WorkspacePageView["tocItems"]) => void;
  onSavePageDraft: (input: {
    draftContentJson: DocseraDocumentEnvelope;
    expectedRevision: number;
    pageSysId: string;
    readLatestDraftContentJson?: () => DocseraDocumentEnvelope | null;
  }) => Promise<PageBodySaveResult>;
  onStatusChange: (state: PageEditorStatusState & {
    release?: (options?: { keepalive?: boolean }) => Promise<void>;
  }) => void;
  onShowCreatePage: () => void;
  onAccessLost: () => void;
  authoringSurface?: WorkspaceAuthoringSurface;
  markdownSourceEditable?: boolean;
  markdownSourceRetryNonce?: number;
  sourceDiscardNonce?: number;
  sourceSessionPageSysId?: string;
  onSourceBodyChange?: (envelope: DocseraDocumentEnvelope) => PageEditorCanonicalHandoffResult;
  onSourceDiscardComplete?: () => void;
  onSourceDiscardInvalidDraft?: () => void;
  onSourceInvalidChange?: (state: { errorMessage: string; isInvalid: boolean; isUnavailable: boolean; pageSysId: string }) => void;
  onSourceTitleChange?: (title: string) => void;
  sessionKey: string;
  theme: "dark" | "light";
  editorFailure: PageEditorHostFailure | null;
  onEditorFailureChange: (failure: PageEditorHostFailure | null) => void;
};

function InlinePageTitle({
  active,
  canEdit,
  saveError,
  validationError,
  onCancel,
  onChange,
  onCommit,
  onStart,
  pageSysId,
  title
}: {
  active: boolean;
  canEdit: boolean;
  saveError?: string;
  validationError?: string;
  onCancel: () => void;
  onChange: (value: string) => void;
  onCommit: () => void | Promise<void>;
  onStart: (pageSysId: string) => void;
  pageSysId: string;
  title: string;
}) {
  const errorMessage = validationError || saveError;
  const errorId = errorMessage ? "docsera-page-title-error" : undefined;
  const pendingTrailingWhitespaceActivationRef = useRef(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const titleTextRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    if (!active || !pendingTrailingWhitespaceActivationRef.current) {
      return;
    }

    pendingTrailingWhitespaceActivationRef.current = false;
    const input = titleInputRef.current;
    if (!input) {
      return;
    }

    const caretPosition = title.length;
    input.focus();
    input.setSelectionRange(caretPosition, caretPosition);
  }, [active, title]);

  function isWithinRect(rect: DOMRect, clientX: number, clientY: number): boolean {
    return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
  }

  function shouldPlaceCaretAtTitleEnd(event: React.MouseEvent<HTMLButtonElement>): boolean {
    const titleText = titleTextRef.current;
    if (!titleText || event.detail === 0) {
      return false;
    }

    const clientX = event.clientX;
    const clientY = event.clientY;
    const textRects = Array.from(titleText.getClientRects());
    if (textRects.length === 0) {
      return false;
    }

    return !textRects.some((rect) => isWithinRect(rect, clientX, clientY));
  }

  return (
    <div className="docsera-main__title-editor">
      <h1 id="docsera-page-title" className="docsera-main__title" aria-label={title || "Untitled page"}>
        {active ? (
          <input
            aria-describedby={errorId}
            aria-invalid={validationError ? "true" : "false"}
            aria-label="Page title"
            autoFocus
            className={`docsera-main__title-input${validationError ? " docsera-main__title-input--invalid" : ""}`}
            ref={titleInputRef}
            type="text"
            value={title}
            onBlur={() => void onCommit()}
            onChange={(event) => onChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.stopPropagation();
                void onCommit();
                return;
              }

              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                onCancel();
              }
            }}
          />
        ) : canEdit ? (
          <button
            type="button"
            className="docsera-main__title-button"
            onClick={(event) => {
              pendingTrailingWhitespaceActivationRef.current = shouldPlaceCaretAtTitleEnd(event);
              onStart(pageSysId);
            }}
          >
            <span ref={titleTextRef}>{title}</span>
          </button>
        ) : (
          title
        )}
      </h1>
      {errorMessage ? (
        <div id={errorId} className="docsera-page-settings__field-error docsera-main__title-error" role="alert">
          {errorMessage}
        </div>
      ) : null}
    </div>
  );
}

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
  editorCanonicalEnvelope,
  mediaAdapter,
  loadMedia,
  page,
  workspaceMode,
  canCreatePage,
  canEditPageBody,
  canManagePageSettings,
  editAccessLost,
  accessLossMessage,
  pageTitleActive,
  pageTitleSaveError,
  pageTitleValidationError,
  pageTitleValue,
  stateCopy,
  stateTitle,
  stateType,
  showPendingState,
  onReturnToMyWorkspaces,
  onReturnToLive,
  onRetryWorkspace,
  onRetryEditor,
  onPageTitleCancel,
  onPageTitleChange,
  onPageTitleCommit,
  onPageTitleStart,
  onEditorReadyStateChange,
  onOutlineChange,
  onSavePageDraft,
  onStatusChange,
  onShowCreatePage,
  onAccessLost,
  authoringSurface = "visual",
  markdownSourceEditable = true,
  markdownSourceRetryNonce = 0,
  sourceDiscardNonce = 0,
  sourceSessionPageSysId = "",
  onSourceBodyChange,
  onSourceDiscardComplete,
  onSourceDiscardInvalidDraft,
  onSourceInvalidChange,
  onSourceTitleChange,
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
  const canEditPageTitle = workspaceMode === "edit" && canManagePageSettings && !editAccessLost && authoringSurface === "visual";
  const displayPageTitle = pageTitleValue !== undefined ? pageTitleValue : page.title || "Untitled page";
  const sourceEnvelope = editorCanonicalEnvelope ?? editorInitialSavedEnvelope ?? page.contentEnvelope;
  const mainLabelProps =
    authoringSurface === "markdown"
      ? { "aria-label": displayPageTitle }
      : { "aria-labelledby": "docsera-page-title" };
  const showMarkdownSource =
    workspaceMode === "edit" &&
    Boolean(page.contentEnvelope) &&
    Boolean(sourceEnvelope) &&
    Boolean(sourceSessionPageSysId) &&
    page.sysId === sourceSessionPageSysId &&
    Boolean(onSourceBodyChange) &&
    Boolean(onSourceInvalidChange) &&
    Boolean(onSourceTitleChange) &&
    Boolean(onSourceDiscardInvalidDraft);

  return (
    <main className="docsera-main" {...mainLabelProps}>
      <article className={`docsera-main__surface${workspaceMode === "edit" ? " docsera-main__surface--editor" : ""}`}>
        {authoringSurface === "visual" ? (
          <div className="docsera-main__intro">
            <div className="docsera-main__page-header">
              <InlinePageTitle
                active={canEditPageTitle && !showBodyPending && pageTitleActive}
                canEdit={canEditPageTitle}
                saveError={pageTitleSaveError}
                onCancel={onPageTitleCancel}
                onChange={onPageTitleChange}
                onCommit={onPageTitleCommit}
                onStart={onPageTitleStart}
                pageSysId={page.sysId}
                title={displayPageTitle}
                validationError={pageTitleValidationError}
              />
            </div>
          </div>
        ) : null}

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
            <PublishedDocumentReader
              envelope={page.contentEnvelope}
              loadMedia={loadMedia}
              pageIdentity={page.sysId}
              theme={theme}
            />
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
            {showMarkdownSource ? (
              <WorkspaceMarkdownSourcePanel
                authoringSurface={authoringSurface}
                canonicalEnvelope={sourceEnvelope ?? page.contentEnvelope}
                canonicalTitle={displayPageTitle}
                discardNonce={sourceDiscardNonce}
                editable={markdownSourceEditable}
                handoffRetryNonce={markdownSourceRetryNonce ?? 0}
                pageSysId={page.sysId}
                visible={authoringSurface === "markdown"}
                onBodyChange={onSourceBodyChange}
                onDiscardComplete={onSourceDiscardComplete}
                onDiscardInvalidDraft={onSourceDiscardInvalidDraft}
                onInvalidChange={onSourceInvalidChange}
                onTitleChange={onSourceTitleChange}
              />
            ) : null}
            {sessionKey ? (
              <div className="docsera-main__editor-host" hidden={showBodyPending || authoringSurface === "markdown"}>
                <PageEditorHost
                  canEdit={canEditPageBody && !editAccessLost}
                  interactionActive={authoringSurface === "visual"}
                  initialEnvelope={page.contentEnvelope}
                  initialSavedEnvelope={editorInitialSavedEnvelope}
                  initialRevision={page.page.draftRevision ?? 0}
                  onAccessLost={onAccessLost}
                  onError={onEditorFailureChange}
                  onOutlineChange={(outline) => onOutlineChange(page.sysId, outline)}
                  onReadyStateChange={onEditorReadyStateChange}
                  onSaveDraft={onSavePageDraft}
                  onStatusChange={onStatusChange}
                  mediaAdapter={mediaAdapter}
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






