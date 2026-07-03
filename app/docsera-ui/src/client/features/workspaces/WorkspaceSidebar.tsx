import type { DemoWorkspace } from "../../shared/types/docsera";
import { flattenDemoPages } from "./demoWorkspace";
import { PageTree } from "./PageTree";

type WorkspaceSidebarProps = {
  workspace: DemoWorkspace;
  selectedPageId: string;
  onSelectPage: (pageId: string) => void;
  treeFilter: string;
  onTreeFilterChange: (value: string) => void;
};

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 4.5v15m7.5-7.5h-15"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

function ChevronDownIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M19.5 8.25l-7.5 7.5-7.5-7.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

export function WorkspaceSidebar({
  workspace,
  selectedPageId,
  onSelectPage,
  treeFilter,
  onTreeFilterChange
}: WorkspaceSidebarProps) {
  const totalPages = flattenDemoPages(workspace.pages).length;

  return (
    <aside className="docsera-sidebar" aria-label="Workspace navigation">
      <div className="docsera-sidebar__top">
        <div className="docsera-sidebar__search-row">
          <label className="docsera-sidebar__search" htmlFor="docsera-page-filter">
            <span className="docsera-sidebar__search-icon">
              <SearchIcon />
            </span>
            <input
              id="docsera-page-filter"
              className="docsera-sidebar__search-input"
              type="search"
              placeholder="Search"
              value={treeFilter}
              onChange={(event) => onTreeFilterChange(event.target.value)}
            />
          </label>
          <button type="button" className="docsera-sidebar__icon-button" aria-label="New page" disabled>
            <PlusIcon />
          </button>
        </div>

        <div className="docsera-sidebar__tree-head">
          <div className="docsera-sidebar__tree-label">
            <span className="docsera-sidebar__tree-chevron">
              <ChevronDownIcon />
            </span>
            <span>{workspace.homeLabel}</span>
          </div>
        </div>
      </div>

      <nav className="docsera-sidebar__tree" aria-label="Page tree">
        <p className="docsera-sidebar__meta">
          {totalPages} local demo pages / {workspace.roleLabel}
        </p>
        <PageTree
          pages={workspace.pages}
          selectedPageId={selectedPageId}
          onSelectPage={onSelectPage}
          filterText={treeFilter}
        />
      </nav>

      <button type="button" className="docsera-sidebar__new-page" disabled>
        <PlusIcon />
        <span>New page</span>
      </button>
    </aside>
  );
}
