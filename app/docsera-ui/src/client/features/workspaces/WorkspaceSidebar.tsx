import type { DemoWorkspace } from "../../shared/types/docsera";
import { flattenDemoPages } from "./demoWorkspace";
import { PageTree } from "./PageTree";

type WorkspaceSidebarProps = {
  workspace: DemoWorkspace;
  selectedPageId: string;
  onSelectPage: (pageId: string) => void;
  canManagePageSettings: boolean;
  pageSettingsOpenPageId: string;
  onTogglePageSettings: (pageId: string) => void;
  treeFilter: string;
  onTreeFilterChange: (value: string) => void;
  canCreatePage: boolean;
  isCreatingPage: boolean;
  onShowCreatePage: () => void;
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
  canManagePageSettings,
  pageSettingsOpenPageId,
  onTogglePageSettings,
  treeFilter,
  onTreeFilterChange,
  canCreatePage,
  isCreatingPage,
  onShowCreatePage
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
          {canCreatePage ? (
            <button
              type="button"
              className="docsera-sidebar__icon-button"
              aria-label="New page"
              onClick={onShowCreatePage}
              disabled={isCreatingPage}
            >
              <PlusIcon />
            </button>
          ) : null}
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
          {totalPages} pages / {workspace.roleLabel}
        </p>
        {totalPages === 0 ? (
          <p className="docsera-sidebar__empty">
            This workspace has no pages yet. Use New page to create the first one.
          </p>
        ) : null}
        <PageTree
          pages={workspace.pages}
          canManagePageSettings={canManagePageSettings}
          pageSettingsOpenPageId={pageSettingsOpenPageId}
          selectedPageId={selectedPageId}
          onSelectPage={onSelectPage}
          onTogglePageSettings={onTogglePageSettings}
          filterText={treeFilter}
        />
      </nav>

      {canCreatePage ? (
        <button type="button" className="docsera-sidebar__new-page" onClick={onShowCreatePage} disabled={isCreatingPage}>
          <PlusIcon />
          <span>{isCreatingPage ? "Creating..." : "New page"}</span>
        </button>
      ) : null}
    </aside>
  );
}
