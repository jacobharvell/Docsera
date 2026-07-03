import type { DemoWorkspace } from "../../shared/types/docsera";
import { flattenDemoPages } from "./demoWorkspace";
import { PageTree } from "./PageTree";

type WorkspaceSidebarProps = {
  workspace: DemoWorkspace;
  selectedPageId: string;
  onSelectPage: (pageId: string) => void;
};

export function WorkspaceSidebar({ workspace, selectedPageId, onSelectPage }: WorkspaceSidebarProps) {
  const flattenedPages = flattenDemoPages(workspace.pages);

  return (
    <aside className="docsera-shell__sidebar" aria-label="Workspace navigation">
      <section className="docsera-shell__panel docsera-shell__panel--sidebar">
        <div className="docsera-shell__workspace-identity">
          <div className="docsera-shell__workspace-icon" aria-hidden="true">
            {workspace.title.charAt(0)}
          </div>
          <div className="docsera-shell__workspace-identity-copy">
            <p className="docsera-shell__eyebrow">Workspace identity</p>
            <h2 className="docsera-shell__sidebar-title">{workspace.title}</h2>
            <p className="docsera-shell__sidebar-copy">{workspace.summary}</p>
          </div>
        </div>

        <div className="docsera-shell__sidebar-meta">
          <span className="docsera-shell__chip">{flattenedPages.length} demo pages</span>
          <span className="docsera-shell__chip">Demo/adaptor-backed</span>
        </div>
      </section>

      <section className="docsera-shell__panel docsera-shell__panel--sidebar">
        <div className="docsera-shell__section-head">
          <div>
            <p className="docsera-shell__eyebrow">Navigation</p>
            <h2 className="docsera-shell__section-title">Page tree</h2>
          </div>
          <p className="docsera-shell__section-copy">
            Select a page to update the central reading surface.
          </p>
        </div>

        <nav aria-label="Demo page tree" className="docsera-shell__tree">
          <PageTree pages={workspace.pages} selectedPageId={selectedPageId} onSelectPage={onSelectPage} />
        </nav>
      </section>
    </aside>
  );
}

