import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type { WorkspaceMode, WorkspaceViewRecord } from "../../shared/types/docsera";
import type { PageEditorHostFailure } from "../../editor/PageEditorHost";
import type { InlinePageCreateState } from "./PageTree";
import { WorkspaceMainPane } from "./WorkspaceMainPane";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { WorkspaceToc } from "./WorkspaceToc";
import type { WorkspacePageOutlineItem, WorkspacePageView } from "./workspaceViewModels";
import type { PageBodySaveResult } from "../../shared/types/docsera";
import type { DocseraDocumentEnvelope } from "../../../shared/editor/document";

type WorkspaceShellProps = {
  bodyState: "loading" | "ready";
  breadcrumbs: WorkspacePageView[];
  canCreatePage: boolean;
  createPageDisabledReason: string;
  canEditPageBody: boolean;
  canManagePageSettings: boolean;
  collapsedPageIds: string[];
  currentWorkspaceSlug: string;
  editAccessLost: boolean;
  editorFailure: PageEditorHostFailure | null;
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
  onReturnToMyWorkspaces: () => void;
  onReturnToLive: () => void;
  onRetryEditor: () => void;
  onSavePageDraft: (input: {
    draftContentJson: DocseraDocumentEnvelope;
    expectedRevision: number;
    pageSysId: string;
  }) => Promise<PageBodySaveResult>;
  onStatusChange: (state: { flush?: () => Promise<boolean>; isDirty: boolean; isSaving: boolean; status: "Unsaved" | "Saving…" | "Saved" | "Changes not saved" }) => void;
  onSelectPage: (pageId: string) => void;
  onShowChildPageCreate: (parentPageId: string, parentPageTitle: string) => void;
  onShowCreatePage: () => void;
  onTogglePageSettings: (pageId: string) => void;
  onToggleTheme: () => void;
  outlinePage: WorkspacePageView | null;
  pageSettingsOpenPageId: string;
  pageSettingsOverlay?: ReactNode;
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
  workspaceSettingsNotice?: boolean;
  onTreeFilterChange: (value: string) => void;
};

export const DEFAULT_WORKSPACE_NAV_WIDTH = 280;
const MIN_WORKSPACE_NAV_WIDTH = 180;
const MAX_WORKSPACE_NAV_WIDTH = 480;
const WORKSPACE_NAV_WIDTH_STORAGE_KEY_PREFIX = "docsera.workspace-nav-width.v2";
const WORKSPACE_TOC_COLLAPSED_STORAGE_KEY_PREFIX = "docsera.workspace-toc-collapsed.v1";

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

function readStoredWorkspaceTocCollapsed(workspaceSlug: string): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const normalizedWorkspaceSlug = workspaceSlug.trim();
  if (!normalizedWorkspaceSlug) {
    return false;
  }

  return window.localStorage.getItem(`${WORKSPACE_TOC_COLLAPSED_STORAGE_KEY_PREFIX}:${normalizedWorkspaceSlug}`) === "true";
}

export function WorkspaceShell({
  bodyState,
  breadcrumbs,
  canCreatePage,
  createPageDisabledReason,
  canEditPageBody,
  canManagePageSettings,
  collapsedPageIds,
  currentWorkspaceSlug,
  editAccessLost,
  editorFailure,
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
  onReturnToMyWorkspaces,
  onReturnToLive,
  onRetryEditor,
  onSavePageDraft,
  onStatusChange,
  onSelectPage,
  onShowChildPageCreate,
  onShowCreatePage,
  onTogglePageSettings,
  onToggleTheme,
  outlinePage,
  pageSettingsOpenPageId,
  pageSettingsOverlay,
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
  workspaceSettingsNotice,
  onTreeFilterChange
}: WorkspaceShellProps) {
  const [tocCollapsed, setTocCollapsed] = useState(() => readStoredWorkspaceTocCollapsed(currentWorkspaceSlug));
  const resizeStateRef = useRef<{ active: boolean }>({ active: false });
  const currentNavWidth = sidebarCollapsed ? 0 : workspaceNavWidth;
  const shellStyle = {
    "--docsera-workspace-nav-resizer-width": sidebarCollapsed ? "0px" : "8px",
    "--docsera-workspace-nav-width": `${currentNavWidth}px`
  } as CSSProperties;

  useEffect(() => {
    setTocCollapsed(readStoredWorkspaceTocCollapsed(currentWorkspaceSlug));
  }, [currentWorkspaceSlug]);

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

    window.localStorage.setItem(`${WORKSPACE_TOC_COLLAPSED_STORAGE_KEY_PREFIX}:${normalizedWorkspaceSlug}`, String(tocCollapsed));
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

  const selectedPageViewForShell = shellStatus === "ready" ? selectedPage : null;
  const outlinePageForShell = shellStatus === "ready" ? outlinePage : null;
  const showWorkspaceLoading = shellStatus !== "ready";

  return (
    <div className="docsera-shell" style={shellStyle}>
      {workspaceSettingsNotice ? (
        <div className="docsera-shell__notice" role="status">
          <p className="docsera-shell__notice-eyebrow">Workspace settings</p>
          <p className="docsera-shell__notice-copy">
            The settings route was preserved, but the full settings surface is not implemented in this slice.
          </p>
        </div>
      ) : null}

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
          bodyState={bodyState}
          canCreatePage={canCreatePage}
          canEditPageBody={canEditPageBody}
          editAccessLost={editAccessLost}
          editorFailure={editorFailure}
          onAccessLost={onAccessLost}
          onEditorFailureChange={onEditorFailureChange}
          onEditorReadyStateChange={onEditorReadyStateChange}
          onOutlineChange={onOutlineChange}
          onReturnToMyWorkspaces={onReturnToMyWorkspaces}
          onReturnToLive={onReturnToLive}
          onRetryEditor={onRetryEditor}
          onSavePageDraft={onSavePageDraft}
          onStatusChange={onStatusChange}
          onShowCreatePage={onShowCreatePage}
          page={selectedPageViewForShell}
          pagePath={breadcrumbs}
          stateCopy={shellCopy}
          stateTitle={shellTitle}
          stateType={shellStatus}
          showPendingState={showPendingState}
          sessionKey={sessionKey}
          theme={theme}
          workspaceMode={mode}
        />

        <div className={`docsera-workspace__aside${tocCollapsed ? " docsera-workspace__aside--collapsed" : ""}`}>
          <WorkspaceToc
            collapsed={tocCollapsed}
            isLoading={showWorkspaceLoading}
            showPendingState={showPendingState}
            page={outlinePageForShell}
            panelId={`docsera-workspace-toc-${currentWorkspaceSlug || "workspace"}`}
            onToggleCollapsed={() => setTocCollapsed((current) => !current)}
          />
        </div>
      </div>

      {pageSettingsOverlay}
    </div>
  );
}
