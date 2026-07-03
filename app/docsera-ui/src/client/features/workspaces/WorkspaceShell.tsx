import { useMemo, useState } from "react";
import type { DemoPage, DemoWorkspace, DocseraRuntimeContext, RuntimeProbeState } from "../../shared/types/docsera";
import { findDemoPagePath, getFirstDemoPage, findDemoPage } from "./demoWorkspace";
import { WorkspaceDevStatus } from "./WorkspaceDevStatus";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { WorkspaceMainPane } from "./WorkspaceMainPane";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { WorkspaceToc } from "./WorkspaceToc";

type WorkspaceShellProps = {
  runtime: DocseraRuntimeContext;
  workspace: DemoWorkspace;
  selectedPageId: string;
  onSelectPage: (pageId: string) => void;
  pingState: RuntimeProbeState;
};

function getSelectedPage(workspace: DemoWorkspace, selectedPageId: string): DemoPage | null {
  return findDemoPage(workspace.pages, selectedPageId) ?? getFirstDemoPage(workspace.pages);
}

export function WorkspaceShell({ runtime, workspace, selectedPageId, onSelectPage, pingState }: WorkspaceShellProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [treeFilter, setTreeFilter] = useState("");
  const selectedPage = getSelectedPage(workspace, selectedPageId);
  const pagePath = useMemo(
    () => (selectedPage ? findDemoPagePath(workspace.pages, selectedPage.id) : []),
    [selectedPage, workspace.pages]
  );

  if (!selectedPage) {
    return (
      <div className="docsera-shell">
        <WorkspaceHeader
          workspace={workspace}
          pagePath={[]}
          sidebarCollapsed={sidebarCollapsed}
          onToggleSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)}
          onSelectPage={onSelectPage}
        />
        <section className="docsera-shell__empty-state" role="status">
          <p className="docsera-shell__eyebrow">Workspace shell</p>
          <h2 className="docsera-shell__empty-title">No pages are available.</h2>
          <p className="docsera-shell__empty-copy">
            The demo shell rendered, but the seeded page tree is empty. Restore the demo data before continuing.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="docsera-shell">
      <WorkspaceHeader
        workspace={workspace}
        pagePath={pagePath}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((collapsed) => !collapsed)}
        onSelectPage={onSelectPage}
      />

      <div className={`docsera-workspace${sidebarCollapsed ? " docsera-workspace--sidebar-collapsed" : ""}`}>
        {!sidebarCollapsed ? (
          <WorkspaceSidebar
            workspace={workspace}
            selectedPageId={selectedPage.id}
            onSelectPage={onSelectPage}
            treeFilter={treeFilter}
            onTreeFilterChange={setTreeFilter}
          />
        ) : null}

        <WorkspaceMainPane page={selectedPage} pagePath={pagePath} />

        <div className="docsera-workspace__aside">
          <WorkspaceToc page={selectedPage} />
          <WorkspaceDevStatus runtime={runtime} pingState={pingState} />
        </div>
      </div>
    </div>
  );
}
