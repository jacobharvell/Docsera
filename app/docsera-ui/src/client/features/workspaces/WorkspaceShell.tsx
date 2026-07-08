import { useMemo, useState } from "react";
import type {
  DemoPage,
  DemoWorkspace,
  DocseraRuntimeContext,
  RuntimeProbeState,
  WorkspacePageRecord
} from "../../shared/types/docsera";
import { findDemoPagePath, getFirstDemoPage, findDemoPage } from "./demoWorkspace";
import { WorkspaceDevStatus } from "./WorkspaceDevStatus";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { WorkspaceMainPane } from "./WorkspaceMainPane";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { WorkspaceToc } from "./WorkspaceToc";

type WorkspaceShellProps = {
  runtime: DocseraRuntimeContext;
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
  selectedWorkspacePage: WorkspacePageRecord | null;
  onSavePageBody: (input: { pageSysId: string; draftBodyText: string }) => Promise<WorkspacePageRecord>;
};

function getSelectedPage(workspace: DemoWorkspace, selectedPageId: string): DemoPage | null {
  return findDemoPage(workspace.pages, selectedPageId) ?? getFirstDemoPage(workspace.pages);
}

export function WorkspaceShell({
  runtime,
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
  selectedWorkspacePage,
  onSavePageBody
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
      <WorkspaceHeader
        canManageWorkspaceSettings={Boolean(workspace.canManageSettings)}
        onOpenWorkspaceSettings={onOpenWorkspaceSettings}
        workspace={workspace}
        pagePath={pagePath}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)}
        onSelectPage={onSelectPage}
        onOpenMyWorkspaces={onOpenMyWorkspaces}
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
