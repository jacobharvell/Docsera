import { useMemo, useState } from "react";
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
  isCreatingPage: boolean;
  onShowCreatePage: () => void;
  recentWorkspaces: RecentWorkspaceItem[];
  showWorkspaceSwitcher: boolean;
  selectedWorkspacePage: WorkspacePageRecord | null;
  onSavePageBody: (input: { pageSysId: string; draftBodyText: string }) => Promise<WorkspacePageRecord>;
  theme: "dark" | "light";
  onToggleTheme: () => void;
};

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
  isCreatingPage,
  onShowCreatePage,
  recentWorkspaces,
  showWorkspaceSwitcher,
  selectedWorkspacePage,
  onSavePageBody,
  theme,
  onToggleTheme
}: WorkspaceShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [treeFilter, setTreeFilter] = useState("");
  const selectedPage = getSelectedPage(workspace, selectedPageId);
  const pagePath = useMemo(
    () => (selectedPage ? findDemoPagePath(workspace.pages, selectedPage.id) : []),
    [selectedPage, workspace.pages]
  );

  return (
    <div className="docsera-shell">
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
          <WorkspaceSidebar
            workspace={workspace}
            selectedPageId={selectedPage?.id ?? ""}
            onSelectPage={onSelectPage}
            canManagePageSettings={canManagePageSettings}
            pageSettingsOpenPageId={pageSettingsOpenPageId}
            onTogglePageSettings={onTogglePageSettings}
            treeFilter={treeFilter}
            onTreeFilterChange={setTreeFilter}
            canCreatePage={canCreatePage}
            isCreatingPage={isCreatingPage}
            onShowCreatePage={onShowCreatePage}
          />
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
    </div>
  );
}
