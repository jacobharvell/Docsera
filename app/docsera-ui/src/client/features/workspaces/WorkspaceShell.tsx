import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { PageBodySaveResult, WorkspaceMode, WorkspaceViewRecord } from "../../shared/types/docsera";
import type { PageEditorCanonicalHandoffResult, PageEditorHostFailure, PageEditorRecoverySnapshot } from "../../editor/PageEditorHost";
import type { EditorMediaAdapter } from "../../editor/contracts";
import type { InlinePageCreateState } from "./PageTree";
import { WorkspaceMainPane } from "./WorkspaceMainPane";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { WorkspaceToc } from "./WorkspaceToc";
import type { WorkspacePageOutlineItem, WorkspacePageView } from "./workspaceViewModels";
import type { DocseraDocumentEnvelope } from "../../../shared/editor/document";
import type { WorkspaceAuthoringSurface } from "./workspaceAuthoringSurface";

type WorkspaceShellProps = {
  bodyNotice?: {
    eyebrow: string;
    kind: "alert" | "status";
    message: string;
  } | null;
  bodyState: "loading" | "ready";
  canCreatePage: boolean;
  createPageDisabledReason: string;
  canEditPageBody: boolean;
  canManagePageSettings: boolean;
  collapsedPageIds: string[];
  currentWorkspaceSlug: string;
  editorInitialSavedEnvelope?: DocseraDocumentEnvelope;
  editorCanonicalEnvelope?: DocseraDocumentEnvelope | null;
  mediaAdapter?: EditorMediaAdapter;
  loadMedia?: (input: { mediaId: string; signal?: AbortSignal }) => Promise<Blob | null>;
  editAccessLost: boolean;
  accessLossMessage?: string;
  editorFailure: PageEditorHostFailure | null;
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
  inlineCreateState: InlinePageCreateState | null;
  isCreatingPage: boolean;
  mode: WorkspaceMode;
  onAccessLost: () => void;
  onCollapsedPageIdsChange: (pageIds: string[]) => void;
  onCommitInlineCreate: () => void;
  onEditorFailureChange: (failure: PageEditorHostFailure | null) => void;
  onEditorReadyStateChange: (ready: boolean) => void;
  onInlineCreateTitleChange: (value: string) => void;
  onModeChange: (mode: WorkspaceMode) => void;
  onOutlineChange: (pageSysId: string, outline: WorkspacePageOutlineItem[]) => void;
  onPageTitleCancel: () => void;
  onPageTitleChange: (value: string) => void;
  onPageTitleCommit: () => void | Promise<void>;
  onPageTitleStart: (pageId: string) => void;
  onReturnToMyWorkspaces: () => void;
  onReturnToLive: () => void;
  onRetryWorkspace?: () => void;
  onRetryEditor: () => void;
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
  onSelectPage: (pageId: string) => void;
  onMovePage?: (input: { pageSysId: string; parentPageSysId: string | null; siblingOrder: string | number }) => void;
  onShowChildPageCreate: (parentPageId: string, parentPageTitle: string) => void;
  onShowCreatePage: () => void;
  onTogglePageSettings: (pageId: string) => void;
  onToggleTheme: () => void;
  outlinePage: WorkspacePageView | null;
  pageSettingsOpenPageId: string;
  pageSettingsOverlay?: ReactNode;
  pageTitleActive: boolean;
  pageTitleSaveError?: string;
  pageTitleValidationError?: string;
  pageTitleValue?: string;
  selectedPage: WorkspacePageView | null;
  selectedPageId: string;
  sidebarCollapsed: boolean;
  showEditModeToggle: boolean;
  showCreatePageControls: boolean;
  sessionKey: string;
  shellStatus: "loading" | "error" | "ready";
  shellTitle: string;
  shellCopy: string;
  showPendingState: boolean;
  workspaceNavWidth: number;
  onSidebarCollapsedChange: (collapsed: boolean) => void;
  onWorkspaceNavWidthChange: (width: number) => void;
  theme: "dark" | "light";
  treeFilter: string;
  treePages: WorkspacePageView[];
  workspaceSettingsOverlay?: ReactNode;
  workspaceTocAvailable: boolean;
  onTreeFilterChange: (value: string) => void;
};

export const DEFAULT_WORKSPACE_NAV_WIDTH = 280;
const MIN_WORKSPACE_NAV_WIDTH = 180;
const MAX_WORKSPACE_NAV_WIDTH = 480;
const WORKSPACE_NAV_WIDTH_STORAGE_KEY_PREFIX = "docsera.workspace-nav-width.v2";
const WORKSPACE_TOC_COLLAPSED_EXPLICIT_STORAGE_KEY_PREFIX = "docsera.workspace-toc-collapsed-explicit.v2";

export function clampWorkspaceNavWidth(value: number): number {
  return Math.max(MIN_WORKSPACE_NAV_WIDTH, Math.min(MAX_WORKSPACE_NAV_WIDTH, value));
}

export function readStoredWorkspaceNavWidth(workspaceSlug: string): number {
  if (typeof window === "undefined") {
    return DEFAULT_WORKSPACE_NAV_WIDTH;
  }

  const normalizedWorkspaceSlug = workspaceSlug.trim();
  if (!normalizedWorkspaceSlug) {
    return DEFAULT_WORKSPACE_NAV_WIDTH;
  }

  const storedWidth = window.localStorage.getItem(`${WORKSPACE_NAV_WIDTH_STORAGE_KEY_PREFIX}:${normalizedWorkspaceSlug}`);
  if (!storedWidth) {
    return DEFAULT_WORKSPACE_NAV_WIDTH;
  }

  const storedValue = Number(storedWidth);
  return Number.isFinite(storedValue) ? clampWorkspaceNavWidth(storedValue) : DEFAULT_WORKSPACE_NAV_WIDTH;
}

function readStoredWorkspaceTocCollapsedPreference(workspaceSlug: string): boolean | null {
  if (typeof window === "undefined") {
    return null;
  }

  const normalizedWorkspaceSlug = workspaceSlug.trim();
  if (!normalizedWorkspaceSlug) {
    return null;
  }

  const storedValue = window.localStorage.getItem(`${WORKSPACE_TOC_COLLAPSED_EXPLICIT_STORAGE_KEY_PREFIX}:${normalizedWorkspaceSlug}`);
  return storedValue === null ? null : storedValue === "true";
}

export function WorkspaceShell({
  bodyNotice,
  bodyState,
  canCreatePage,
  createPageDisabledReason,
  canEditPageBody,
  canManagePageSettings,
  collapsedPageIds,
  currentWorkspaceSlug,
  editorInitialSavedEnvelope,
  editorCanonicalEnvelope,
  mediaAdapter,
  loadMedia,
  editAccessLost,
  accessLossMessage,
  editorFailure,
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
  inlineCreateState,
  isCreatingPage,
  mode,
  onAccessLost,
  onCollapsedPageIdsChange,
  onCommitInlineCreate,
  onEditorFailureChange,
  onEditorReadyStateChange,
  onInlineCreateTitleChange,
  onModeChange,
  onOutlineChange,
  onPageTitleCancel,
  onPageTitleChange,
  onPageTitleCommit,
  onPageTitleStart,
  onReturnToMyWorkspaces,
  onReturnToLive,
  onRetryWorkspace,
  onRetryEditor,
  onSavePageDraft,
  onStatusChange,
  onSelectPage,
  onMovePage,
  onShowChildPageCreate,
  onShowCreatePage,
  onTogglePageSettings,
  onToggleTheme,
  outlinePage,
  pageSettingsOpenPageId,
  pageSettingsOverlay,
  pageTitleActive,
  pageTitleSaveError,
  pageTitleValidationError,
  pageTitleValue,
  selectedPage,
  selectedPageId,
  sidebarCollapsed,
  showCreatePageControls,
  sessionKey,
  showEditModeToggle,
  shellStatus,
  shellTitle,
  shellCopy,
  showPendingState,
  workspaceNavWidth,
  onSidebarCollapsedChange,
  onWorkspaceNavWidthChange,
  theme,
  treeFilter,
  treePages,
  workspaceSettingsOverlay,
  workspaceTocAvailable,
  onTreeFilterChange
}: WorkspaceShellProps) {
  const [tocCollapsed, setTocCollapsed] = useState(() => readStoredWorkspaceTocCollapsedPreference(currentWorkspaceSlug) ?? false);
  const tocCollapsedHasUserPreferenceRef = useRef(readStoredWorkspaceTocCollapsedPreference(currentWorkspaceSlug) !== null);
  const resizeStateRef = useRef<{ active: boolean }>({ active: false });
  const currentNavWidth = sidebarCollapsed ? 0 : workspaceNavWidth;
  const shellStyle = {
    "--docsera-workspace-nav-resizer-width": sidebarCollapsed ? "0px" : "8px",
    "--docsera-workspace-nav-width": `${currentNavWidth}px`
  } as CSSProperties;

  useEffect(() => {
    const storedPreference = readStoredWorkspaceTocCollapsedPreference(currentWorkspaceSlug);
    tocCollapsedHasUserPreferenceRef.current = storedPreference !== null;
    setTocCollapsed(storedPreference ?? false);
  }, [currentWorkspaceSlug, workspaceTocAvailable]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const normalizedWorkspaceSlug = currentWorkspaceSlug.trim();
    if (!normalizedWorkspaceSlug) {
      return;
    }

    window.localStorage.setItem(`${WORKSPACE_NAV_WIDTH_STORAGE_KEY_PREFIX}:${normalizedWorkspaceSlug}`, String(workspaceNavWidth));
  }, [currentWorkspaceSlug, workspaceNavWidth]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const normalizedWorkspaceSlug = currentWorkspaceSlug.trim();
    if (!normalizedWorkspaceSlug) {
      return;
    }

    if (tocCollapsedHasUserPreferenceRef.current) {
      window.localStorage.setItem(`${WORKSPACE_TOC_COLLAPSED_EXPLICIT_STORAGE_KEY_PREFIX}:${normalizedWorkspaceSlug}`, String(tocCollapsed));
    }
  }, [currentWorkspaceSlug, tocCollapsed]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!resizeStateRef.current.active || sidebarCollapsed) {
        return;
      }

      if (!Number.isFinite(event.clientX)) {
        return;
      }

      onWorkspaceNavWidthChange(clampWorkspaceNavWidth(event.clientX));
    };

    const handleMouseUp = () => {
      if (!resizeStateRef.current.active) {
        return;
      }

      resizeStateRef.current.active = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [onWorkspaceNavWidthChange, sidebarCollapsed]);

  function startSidebarResize() {
    resizeStateRef.current.active = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function toggleTocCollapsed() {
    tocCollapsedHasUserPreferenceRef.current = true;
    setTocCollapsed((current) => !current);
  }

  const selectedPageViewForShell = shellStatus === "ready" ? selectedPage : null;
  const outlinePageForShell = shellStatus === "ready" ? outlinePage : null;
  const showWorkspaceLoading = shellStatus !== "ready";

  return (
    <div className="docsera-shell" style={shellStyle}>
      <div className={`docsera-workspace${sidebarCollapsed ? " docsera-workspace--sidebar-collapsed" : ""}`}>
        {!sidebarCollapsed ? (
          <div className="docsera-workspace__nav-frame">
            <WorkspaceSidebar
              canCreatePage={canCreatePage}
              createPageDisabledReason={createPageDisabledReason}
              canManagePageSettings={canManagePageSettings}
              collapsedPageIds={collapsedPageIds}
              inlineCreateState={inlineCreateState}
              isCreatingPage={isCreatingPage}
              isLoading={showWorkspaceLoading}
              showPendingState={showPendingState}
              mode={mode}
              onCollapsedPageIdsChange={onCollapsedPageIdsChange}
              onCommitInlineCreate={onCommitInlineCreate}
              onInlineCreateTitleChange={onInlineCreateTitleChange}
              onSelectPage={onSelectPage}
              onMovePage={onMovePage}
              onShowCreatePage={onShowCreatePage}
              onShowChildPageCreate={onShowChildPageCreate}
              onTogglePageSettings={onTogglePageSettings}
              pageSettingsOpenPageId={pageSettingsOpenPageId}
              pages={showWorkspaceLoading ? [] : treePages}
              selectedPageId={selectedPageViewForShell?.id ?? selectedPageId}
              showCreatePageControl={showCreatePageControls}
              treeFilter={treeFilter}
              onTreeFilterChange={onTreeFilterChange}
            />
            <button
              type="button"
              className="docsera-workspace__nav-resizer"
              aria-label="Resize navigation panel"
              data-docsera-nav-resizer="true"
              onMouseDown={startSidebarResize}
            >
              <span className="docsera-workspace__nav-resizer-pill" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        <WorkspaceMainPane
          bodyNotice={bodyNotice}
          bodyState={bodyState}
          editorCanonicalEnvelope={editorCanonicalEnvelope}
          canCreatePage={canCreatePage}
          canEditPageBody={canEditPageBody}
          canManagePageSettings={canManagePageSettings}
          accessLossMessage={accessLossMessage}
          editorInitialSavedEnvelope={editorInitialSavedEnvelope}
          authoringSurface={authoringSurface}
          markdownSourceEditable={markdownSourceEditable}
          markdownSourceRetryNonce={markdownSourceRetryNonce}
          sourceDiscardNonce={sourceDiscardNonce}
          sourceSessionPageSysId={sourceSessionPageSysId}
          onSourceBodyChange={onSourceBodyChange}
          onSourceDiscardComplete={onSourceDiscardComplete}
          onSourceDiscardInvalidDraft={onSourceDiscardInvalidDraft}
          onSourceInvalidChange={onSourceInvalidChange}
          onSourceTitleChange={onSourceTitleChange}
          mediaAdapter={mediaAdapter}
          loadMedia={loadMedia}
          editAccessLost={editAccessLost}
          editorFailure={editorFailure}
          pageTitleActive={pageTitleActive}
          pageTitleSaveError={pageTitleSaveError}
          pageTitleValidationError={pageTitleValidationError}
          pageTitleValue={pageTitleValue}
          onAccessLost={onAccessLost}
          onEditorFailureChange={onEditorFailureChange}
          onEditorReadyStateChange={onEditorReadyStateChange}
          onOutlineChange={onOutlineChange}
          onPageTitleCancel={onPageTitleCancel}
          onPageTitleChange={onPageTitleChange}
          onPageTitleCommit={onPageTitleCommit}
          onPageTitleStart={onPageTitleStart}
          onReturnToMyWorkspaces={onReturnToMyWorkspaces}
          onReturnToLive={onReturnToLive}
          onRetryWorkspace={onRetryWorkspace}
          onRetryEditor={onRetryEditor}
          onSavePageDraft={onSavePageDraft}
          onStatusChange={onStatusChange}
          onShowCreatePage={onShowCreatePage}
          page={selectedPageViewForShell}
          stateCopy={shellCopy}
          stateTitle={shellTitle}
          stateType={shellStatus}
          showPendingState={showPendingState}
          sessionKey={sessionKey}
          theme={theme}
          workspaceMode={mode}
        />

        {workspaceTocAvailable ? (
          <div className={`docsera-workspace__aside${tocCollapsed ? " docsera-workspace__aside--collapsed" : ""}`}>
            <WorkspaceToc
              collapsed={tocCollapsed}
              isLoading={showWorkspaceLoading}
              showPendingState={showPendingState}
              page={outlinePageForShell}
              panelId={`docsera-workspace-toc-${currentWorkspaceSlug || "workspace"}`}
              onToggleCollapsed={toggleTocCollapsed}
            />
          </div>
        ) : null}
      </div>

      {pageSettingsOverlay}
      {workspaceSettingsOverlay}
    </div>
  );
}
