import { useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import type { PageBodySaveResult, WorkspaceMode, WorkspaceViewRecord } from "../../shared/types/docsera";
import type { PageEditorCanonicalHandoffResult, PageEditorHostFailure, PageEditorRecoverySnapshot } from "../../editor/PageEditorHost";
import type { EditorMediaAdapter } from "../../editor/contracts";
import type { InlinePageCreateState } from "./PageTree";
import { WorkspaceMainPane } from "./WorkspaceMainPane";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { WorkspaceToc } from "./WorkspaceToc";
import { SidebarToggleIcon } from "./DocseraHeaderIcons";
import { DocseraCompactTooltip } from "../../shared/tooltip/DocseraTooltip";
import type { WorkspacePageOutlineItem, WorkspacePageView } from "./workspaceViewModels";
import type { DocseraDocumentEnvelope } from "../../../shared/editor/document";
import type { WorkspaceAuthoringSurface } from "./workspaceAuthoringSurface";
import type { ContentRevealIntent, ContentRevealState } from "./contentReveal";
import type { WorkspaceContentRevealSurface } from "./WorkspaceMainPane";

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
  leaseConflict?: boolean;
  leaseHolder?: { displayName: string | null; userSysId?: string };
  onEndPreviousSession?: () => void;
  onRetryEdit?: () => void;
  endingPreviousSession?: boolean;
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
  inlineRenameErrorMessage: string;
  inlineRenamePageId: string;
  inlineRenameValue: string;
  isCreatingPage: boolean;
  mode: WorkspaceMode;
  onAccessLost: () => void;
  onCollapsedPageIdsChange: (pageIds: string[]) => void;
  onCancelInlineRename: () => void;
  onCommitInlineCreate: () => void;
  onCommitInlineRename: () => Promise<boolean> | boolean;
  onEditorFailureChange: (failure: PageEditorHostFailure | null) => void;
  onEditorReadyStateChange: (ready: boolean) => void;
  onInlineCreateTitleChange: (value: string) => void;
  onInlineRenameTitleChange: (value: string) => void;
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
  onRequestDeletePage: (pageId: string) => void;
  onStartInlineRename: (pageId: string) => void;
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
  compactNavigationOpen?: boolean;
  onCompactNavigationDismiss?: () => void;
  onCompactPageSettingsOpenFromNavigation?: () => void;
  compactNavigationTriggerRef?: RefObject<HTMLButtonElement>;
  compactNavigationTitle?: string;
  compactNavigationHeader?: ReactNode;
  onWorkspaceNavWidthChange: (width: number) => void;
  theme: "dark" | "light";
  treeFilter: string;
  treePages: WorkspacePageView[];
  workspaceSettingsOverlay?: ReactNode;
  workspaceTocAvailable: boolean;
  onTreeFilterChange: (value: string) => void;
  contentRevealState?: ContentRevealState;
  contentRevealIntent?: ContentRevealIntent<WorkspaceContentRevealSurface>;
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
  leaseConflict,
  leaseHolder,
  onEndPreviousSession,
  onRetryEdit,
  endingPreviousSession,
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
  inlineRenameErrorMessage,
  inlineRenamePageId,
  inlineRenameValue,
  isCreatingPage,
  mode,
  onAccessLost,
  onCollapsedPageIdsChange,
  onCancelInlineRename,
  onCommitInlineCreate,
  onCommitInlineRename,
  onEditorFailureChange,
  onEditorReadyStateChange,
  onInlineCreateTitleChange,
  onInlineRenameTitleChange,
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
  onRequestDeletePage,
  onStartInlineRename,
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
  compactNavigationOpen = false,
  onCompactNavigationDismiss,
  onCompactPageSettingsOpenFromNavigation,
  compactNavigationTriggerRef,
  compactNavigationTitle = "Workspace navigation",
  compactNavigationHeader,
  onWorkspaceNavWidthChange,
  theme,
  treeFilter,
  treePages,
  workspaceSettingsOverlay,
  workspaceTocAvailable,
  onTreeFilterChange,
  contentRevealState = "idle",
  contentRevealIntent = null
}: WorkspaceShellProps) {
  const [compactLayout, setCompactLayout] = useState(() => typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia("(max-width: 920px)").matches);
  const [tocCollapsed, setTocCollapsed] = useState(() => readStoredWorkspaceTocCollapsedPreference(currentWorkspaceSlug) ?? false);
  const tocCollapsedHasUserPreferenceRef = useRef(readStoredWorkspaceTocCollapsedPreference(currentWorkspaceSlug) !== null);
  const resizeStateRef = useRef<{ active: boolean }>({ active: false });
  const navFrameRef = useRef<HTMLDivElement>(null);
  const compactCloseButtonRef = useRef<HTMLButtonElement>(null);
  const [sidebarResizing, setSidebarResizing] = useState(false);
  const shellStyle = {
    "--docsera-workspace-content-nav-width": sidebarCollapsed ? "0px" : `${workspaceNavWidth}px`,
    "--docsera-workspace-nav-resizer-width": sidebarCollapsed ? "0px" : "8px",
    "--docsera-workspace-nav-track-width": sidebarCollapsed ? "0px" : `${workspaceNavWidth}px`,
    "--docsera-workspace-nav-width": `${workspaceNavWidth}px`
  } as CSSProperties;

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(max-width: 920px)");
    const update = () => setCompactLayout(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!compactLayout || !compactNavigationOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismissCompactNavigationAndRestoreFocus();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [compactLayout, compactNavigationOpen, onCompactNavigationDismiss, compactNavigationTriggerRef]);

  useEffect(() => {
    if (compactLayout && compactNavigationOpen) {
      const closeButton = compactCloseButtonRef.current;
      if (closeButton) {
        closeButton.dataset.docseraSuppressFocusTooltip = "true";
        closeButton.focus();
      }
    }
  }, [compactLayout, compactNavigationOpen]);

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
      setSidebarResizing(false);
      document.documentElement.classList.remove("docsera-nav-resizing");
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      if (resizeStateRef.current.active) {
        resizeStateRef.current.active = false;
        document.documentElement.classList.remove("docsera-nav-resizing");
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      }
    };
  }, [onWorkspaceNavWidthChange, sidebarCollapsed]);

  useEffect(() => {
    const navFrame = navFrameRef.current;
    if (!navFrame) {
      return;
    }

    const navigationUnavailable = compactLayout ? !compactNavigationOpen : sidebarCollapsed;
    navFrame.inert = navigationUnavailable;
    if (navigationUnavailable) {
      navFrame.setAttribute("inert", "");
      return;
    }

    navFrame.removeAttribute("inert");
  }, [compactLayout, compactNavigationOpen, sidebarCollapsed]);

  useEffect(() => {
    if (!sidebarCollapsed || !resizeStateRef.current.active) {
      return;
    }

    resizeStateRef.current.active = false;
    setSidebarResizing(false);
    document.documentElement.classList.remove("docsera-nav-resizing");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, [sidebarCollapsed]);

  function startSidebarResize() {
    if (sidebarCollapsed) {
      return;
    }

    resizeStateRef.current.active = true;
    setSidebarResizing(true);
    document.documentElement.classList.add("docsera-nav-resizing");
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  function toggleTocCollapsed() {
    tocCollapsedHasUserPreferenceRef.current = true;
    setTocCollapsed((current) => !current);
  }

  function dismissCompactNavigationAndRestoreFocus() {
    onCompactNavigationDismiss?.();
    const trigger = compactNavigationTriggerRef?.current;
    if (trigger) {
      trigger.dataset.docseraSuppressFocusTooltip = "true";
      trigger.focus();
    }
  }

  const selectedPageViewForShell = shellStatus === "ready" ? selectedPage : null;
  const outlinePageForShell = shellStatus === "ready" ? outlinePage : null;
  const showWorkspaceLoading = shellStatus !== "ready";
  const compactNavigationVisible = compactLayout ? compactNavigationOpen : !sidebarCollapsed;

  return (
    <div className="docsera-shell" style={shellStyle}>
      <div
        className={`docsera-workspace${sidebarCollapsed ? " docsera-workspace--sidebar-collapsed" : ""}${
          sidebarResizing ? " docsera-workspace--sidebar-resizing" : ""
        }`}
      >
        {compactLayout && compactNavigationOpen ? <button className="docsera-workspace__nav-scrim" aria-label="Close navigation" onClick={dismissCompactNavigationAndRestoreFocus} /> : null}
        <div
          ref={navFrameRef}
          className="docsera-workspace__nav-frame"
          aria-hidden={!compactNavigationVisible ? "true" : undefined}
          data-docsera-compact-navigation-open={compactLayout ? String(compactNavigationOpen) : undefined}
          data-docsera-nav-collapsed={sidebarCollapsed ? "true" : undefined}
        >
          <div className="docsera-workspace__nav-clip">
            {compactLayout ? <div className="docsera-workspace__compact-nav-header">
              <DocseraCompactTooltip label="Close navigation">
                <button ref={compactCloseButtonRef} type="button" className="docsera-header__ghost-button docsera-header__ghost-button--sidebar-toggle" aria-label="Close navigation" onClick={dismissCompactNavigationAndRestoreFocus}>
                  <SidebarToggleIcon collapsed={false} />
                </button>
              </DocseraCompactTooltip>
              <div className="docsera-workspace__compact-nav-identity">{compactNavigationHeader ?? <strong>{compactNavigationTitle}</strong>}</div>
            </div> : null}
            <WorkspaceSidebar
              canCreatePage={canCreatePage}
              createPageDisabledReason={createPageDisabledReason}
              canManagePageSettings={canManagePageSettings}
              collapsedPageIds={collapsedPageIds}
              navigationCollapsed={!compactLayout && sidebarCollapsed}
              inlineCreateState={inlineCreateState}
              inlineRenameErrorMessage={inlineRenameErrorMessage}
              inlineRenamePageId={inlineRenamePageId}
              inlineRenameValue={inlineRenameValue}
              isCreatingPage={isCreatingPage}
              isLoading={showWorkspaceLoading}
              showPendingState={showPendingState}
              mode={mode}
              onCollapsedPageIdsChange={onCollapsedPageIdsChange}
              onCancelInlineRename={onCancelInlineRename}
              onCommitInlineCreate={onCommitInlineCreate}
              onCommitInlineRename={onCommitInlineRename}
              onInlineCreateTitleChange={onInlineCreateTitleChange}
              onInlineRenameTitleChange={onInlineRenameTitleChange}
              onSelectPage={(pageId) => { onSelectPage(pageId); if (compactLayout) onCompactNavigationDismiss?.(); }}
              onMovePage={onMovePage}
              onRequestDeletePage={onRequestDeletePage}
              onStartInlineRename={onStartInlineRename}
              onShowCreatePage={onShowCreatePage}
              onShowChildPageCreate={onShowChildPageCreate}
              onTogglePageSettings={(pageId) => {
                if (compactLayout && compactNavigationOpen) {
                  if (onCompactPageSettingsOpenFromNavigation) {
                    onCompactPageSettingsOpenFromNavigation();
                  } else {
                    onCompactNavigationDismiss?.();
                  }
                } else if (compactLayout) {
                  onCompactNavigationDismiss?.();
                }
                onTogglePageSettings(pageId);
              }}
              pageSettingsOpenPageId={pageSettingsOpenPageId}
              pages={showWorkspaceLoading ? [] : treePages}
              selectedPageId={selectedPageViewForShell?.id ?? selectedPageId}
              showCreatePageControl={showCreatePageControls}
              treeFilter={treeFilter}
              onTreeFilterChange={onTreeFilterChange}
              contentRevealState={contentRevealState}
            />
          </div>
          <button
            type="button"
            className="docsera-workspace__nav-resizer"
            aria-label="Resize navigation panel"
            data-docsera-nav-resizer="true"
            disabled={sidebarCollapsed}
            onMouseDown={startSidebarResize}
          >
            <span className="docsera-workspace__nav-resizer-pill" aria-hidden="true" />
          </button>
        </div>

        <WorkspaceMainPane
          bodyNotice={bodyNotice}
          bodyState={bodyState}
          editorCanonicalEnvelope={editorCanonicalEnvelope}
          canCreatePage={canCreatePage}
          canEditPageBody={canEditPageBody}
          canManagePageSettings={canManagePageSettings}
          accessLossMessage={accessLossMessage}
          leaseConflict={leaseConflict}
          leaseHolder={leaseHolder}
          onEndPreviousSession={onEndPreviousSession}
          onRetryEdit={onRetryEdit}
          endingPreviousSession={endingPreviousSession}
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
          workspaceIdentity={currentWorkspaceSlug}
          workspaceMode={mode}
          contentRevealIntent={contentRevealIntent}
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
              contentRevealState={contentRevealState}
            />
          </div>
        ) : null}
      </div>

      {pageSettingsOverlay}
      {workspaceSettingsOverlay}
    </div>
  );
}
