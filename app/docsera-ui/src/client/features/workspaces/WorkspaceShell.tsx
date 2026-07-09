import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import type {
  DemoPage,
  DemoWorkspace,
  DocseraRuntimeContext,
  RuntimeProbeState,
  WorkspacePageRecord,
  WorkspaceViewRecord
} from "../../shared/types/docsera";
import { DocseraHeader } from "./DocseraHeader";
import { findDemoPagePath, getFirstDemoPage, findDemoPage } from "./demoWorkspace";
import type { InlinePageCreateState } from "./PageTree";
import { WorkspaceDevStatus } from "./WorkspaceDevStatus";
import { WorkspaceMainPane } from "./WorkspaceMainPane";
import type { RecentWorkspaceItem } from "./RecentWorkspacesMenu";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { WorkspaceToc } from "./WorkspaceToc";

type WorkspaceShellProps = {
  currentWorkspaceSlug: string;
  runtime: DocseraRuntimeContext;
  onOpenWorkspace: (workspaceSlug: string) => void;
  onOpenWorkspaceSettings: () => void;
  workspace: DemoWorkspace;
  selectedPageId: string;
  onSelectPage: (pageId: string) => void;
  canManagePageSettings: boolean;
  pageSettingsOpenPageId: string;
  onTogglePageSettings: (pageId: string) => void;
  pingState: RuntimeProbeState;
  onOpenMyWorkspaces: () => void;
  workspaceSettingsNotice?: boolean;
  canCreatePage: boolean;
  inlineCreateState: InlinePageCreateState | null;
  isCreatingPage: boolean;
  onCommitInlineCreate: () => void;
  onInlineCreateTitleChange: (value: string) => void;
  onShowCreatePage: () => void;
  recentWorkspaces: RecentWorkspaceItem[];
  showWorkspaceSwitcher: boolean;
  selectedWorkspacePage: WorkspacePageRecord | null;
  onSavePageBody: (input: { pageSysId: string; draftBodyText: string }) => Promise<WorkspacePageRecord>;
  theme: "dark" | "light";
  onToggleTheme: () => void;
  pageSettingsOverlay?: ReactNode;
  onShowChildPageCreate: (parentPageId: string, parentPageTitle: string) => void;
};

const DEFAULT_WORKSPACE_NAV_WIDTH = 280;
const MIN_WORKSPACE_NAV_WIDTH = 180;
const MAX_WORKSPACE_NAV_WIDTH = 480;
const WORKSPACE_NAV_WIDTH_STORAGE_KEY_PREFIX = "docsera.workspace-nav-width.v2";

function clampWorkspaceNavWidth(value: number): number {
  return Math.max(MIN_WORKSPACE_NAV_WIDTH, Math.min(MAX_WORKSPACE_NAV_WIDTH, value));
}

function readStoredWorkspaceNavWidth(workspaceSlug: string): number {
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

function getSelectedPage(workspace: DemoWorkspace, selectedPageId: string): DemoPage | null {
  return findDemoPage(workspace.pages, selectedPageId) ?? getFirstDemoPage(workspace.pages);
}

export function WorkspaceShell({
  currentWorkspaceSlug,
  runtime,
  onOpenWorkspace,
  onOpenWorkspaceSettings,
  workspace,
  selectedPageId,
  onSelectPage,
  canManagePageSettings,
  pageSettingsOpenPageId,
  onTogglePageSettings,
  pingState,
  onOpenMyWorkspaces,
  workspaceSettingsNotice,
  canCreatePage,
  inlineCreateState,
  isCreatingPage,
  onCommitInlineCreate,
  onInlineCreateTitleChange,
  onShowCreatePage,
  recentWorkspaces,
  showWorkspaceSwitcher,
  selectedWorkspacePage,
  onSavePageBody,
  theme,
  onToggleTheme,
  pageSettingsOverlay,
  onShowChildPageCreate
}: WorkspaceShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [workspaceNavWidth, setWorkspaceNavWidth] = useState(() => readStoredWorkspaceNavWidth(currentWorkspaceSlug));
  const [treeFilter, setTreeFilter] = useState("");
  const resizeStateRef = useRef<{ active: boolean }>({ active: false });
  const selectedPage = getSelectedPage(workspace, selectedPageId);
  const pagePath = useMemo(
    () => (selectedPage ? findDemoPagePath(workspace.pages, selectedPage.id) : []),
    [selectedPage, workspace.pages]
  );
  const currentNavWidth = sidebarCollapsed ? 0 : workspaceNavWidth;
  const shellStyle = {
    "--docsera-workspace-nav-resizer-width": sidebarCollapsed ? "0px" : "8px",
    "--docsera-workspace-nav-width": `${currentNavWidth}px`
  } as CSSProperties;

  useEffect(() => {
    setWorkspaceNavWidth(readStoredWorkspaceNavWidth(currentWorkspaceSlug));
    setSidebarCollapsed(false);
  }, [currentWorkspaceSlug]);

  useEffect(() => {
    if (typeof window === "undefined" || sidebarCollapsed) {
      return;
    }

    const normalizedWorkspaceSlug = currentWorkspaceSlug.trim();
    if (!normalizedWorkspaceSlug) {
      return;
    }

    window.localStorage.setItem(`${WORKSPACE_NAV_WIDTH_STORAGE_KEY_PREFIX}:${normalizedWorkspaceSlug}`, String(workspaceNavWidth));
  }, [currentWorkspaceSlug, sidebarCollapsed, workspaceNavWidth]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!resizeStateRef.current.active || sidebarCollapsed) {
        return;
      }

      if (!Number.isFinite(event.clientX)) {
        return;
      }

      setWorkspaceNavWidth(clampWorkspaceNavWidth(event.clientX));
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
  }, [sidebarCollapsed]);

  function startSidebarResize() {
    resizeStateRef.current.active = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  }

  return (
    <div className="docsera-shell" style={shellStyle}>
      <DocseraHeader
        breadcrumbs={pagePath}
        currentWorkspaceSlug={currentWorkspaceSlug}
        identity={{
          kind: "workspace",
          icon:
            workspace.icon ??
            ({
              type: "builtin",
              key: workspace.iconLabel,
              label: workspace.iconLabel
            } satisfies WorkspaceViewRecord["icon"]),
          name: workspace.title
        }}
        mode="workspace"
        onOpenMyWorkspaces={onOpenMyWorkspaces}
        onOpenWorkspace={onOpenWorkspace}
        onOpenWorkspaceSettings={onOpenWorkspaceSettings}
        onSelectBreadcrumb={onSelectPage}
        onToggleSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)}
        recentWorkspaces={recentWorkspaces}
        showWorkspaceSwitcher={showWorkspaceSwitcher}
        showWorkspaceSettings={Boolean(workspace.canManageSettings)}
        sidebarCollapsed={sidebarCollapsed}
        theme={theme}
        onToggleTheme={onToggleTheme}
        workspaceNavWidth={currentNavWidth}
      />

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
              workspace={workspace}
              selectedPageId={selectedPage?.id ?? ""}
              onSelectPage={onSelectPage}
              canManagePageSettings={canManagePageSettings}
              inlineCreateState={inlineCreateState}
              pageSettingsOpenPageId={pageSettingsOpenPageId}
              onCommitInlineCreate={onCommitInlineCreate}
              onInlineCreateTitleChange={onInlineCreateTitleChange}
              onTogglePageSettings={onTogglePageSettings}
              treeFilter={treeFilter}
              onTreeFilterChange={setTreeFilter}
              canCreatePage={canCreatePage}
              isCreatingPage={isCreatingPage}
              onShowCreatePage={onShowCreatePage}
              onShowChildPageCreate={onShowChildPageCreate}
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
          page={selectedPage}
          pagePath={pagePath}
          workspacePage={selectedWorkspacePage}
          canEditPageBody={canCreatePage}
          canCreatePage={canCreatePage}
          onShowCreatePage={onShowCreatePage}
          onSavePageBody={onSavePageBody}
        />

        <div className="docsera-workspace__aside">
          <WorkspaceToc page={selectedPage} />
          <WorkspaceDevStatus runtime={runtime} pingState={pingState} />
        </div>
      </div>

      {pageSettingsOverlay}
    </div>
  );
}
