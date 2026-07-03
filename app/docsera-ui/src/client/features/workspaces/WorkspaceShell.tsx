import type { DemoWorkspace, DocseraRuntimeContext, RuntimeProbeState } from "../../shared/types/docsera";
import { getFirstDemoPage, findDemoPage } from "./demoWorkspace";
import { WorkspaceContent } from "./WorkspaceContent";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { WorkspaceStatusRail } from "./WorkspaceStatusRail";

type WorkspaceShellProps = {
  runtime: DocseraRuntimeContext;
  workspace: DemoWorkspace;
  selectedPageId: string;
  onSelectPage: (pageId: string) => void;
  pingState: RuntimeProbeState;
};

export function WorkspaceShell({ runtime, workspace, selectedPageId, onSelectPage, pingState }: WorkspaceShellProps) {
  const fallbackPage = getFirstDemoPage(workspace.pages);
  const selectedPage = findDemoPage(workspace.pages, selectedPageId) ?? fallbackPage;

  if (!selectedPage) {
    return (
      <div className="docsera-shell">
        <WorkspaceHeader workspace={workspace} selectedPageTitle="No demo pages" pingState={pingState} />
        <section className="docsera-shell__panel docsera-shell__panel--empty" role="status">
          <p className="docsera-shell__eyebrow">Workspace shell</p>
          <h2 className="docsera-shell__section-title">No demo pages are available.</h2>
          <p className="docsera-shell__section-copy">
            The shell rendered, but the seeded workspace tree was empty. That should not happen in the checked-in demo data.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="docsera-shell">
      <WorkspaceHeader workspace={workspace} selectedPageTitle={selectedPage.title} pingState={pingState} />

      <div className="docsera-shell__frame">
        <WorkspaceSidebar
          workspace={workspace}
          selectedPageId={selectedPage.id}
          onSelectPage={onSelectPage}
        />
        <WorkspaceContent workspace={workspace} page={selectedPage} />
        <WorkspaceStatusRail workspace={workspace} page={selectedPage} runtime={runtime} pingState={pingState} />
      </div>
    </div>
  );
}

