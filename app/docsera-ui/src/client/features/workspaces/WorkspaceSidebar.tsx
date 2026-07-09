import type { DemoWorkspace } from "../../shared/types/docsera";
import { DocseraIcon } from "../../shared/icons/DocseraIcon";
import { docseraIcons } from "../../shared/icons/docseraIcons";
import { flattenDemoPages } from "./demoWorkspace";
import { PageTree, type InlinePageCreateState } from "./PageTree";

type WorkspaceSidebarProps = {
  workspace: DemoWorkspace;
  selectedPageId: string;
  onSelectPage: (pageId: string) => void;
  canManagePageSettings: boolean;
  inlineCreateState: InlinePageCreateState | null;
  pageSettingsOpenPageId: string;
  onCommitInlineCreate: () => void;
  onInlineCreateTitleChange: (value: string) => void;
  onTogglePageSettings: (pageId: string) => void;
  treeFilter: string;
  onTreeFilterChange: (value: string) => void;
  canCreatePage: boolean;
  isCreatingPage: boolean;
  onShowCreatePage: () => void;
  onShowChildPageCreate: (parentPageId: string, parentPageTitle: string) => void;
};

function SearchIcon() {
  return <DocseraIcon icon={docseraIcons.search} />;
}

function PlusIcon() {
  return <DocseraIcon icon={docseraIcons.plus} />;
}

export function WorkspaceSidebar({
  workspace,
  selectedPageId,
  onSelectPage,
  canManagePageSettings,
  inlineCreateState,
  pageSettingsOpenPageId,
  onCommitInlineCreate,
  onInlineCreateTitleChange,
  onTogglePageSettings,
  treeFilter,
  onTreeFilterChange,
  canCreatePage,
  isCreatingPage,
  onShowCreatePage,
  onShowChildPageCreate
}: WorkspaceSidebarProps) {
  const totalPages = flattenDemoPages(workspace.pages).length;

  return (
    <aside className="docsera-sidebar" aria-label="Workspace navigation">
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

      <nav className="docsera-sidebar__tree" aria-label="Page tree">
        {totalPages === 0 ? (
          <p className="docsera-sidebar__empty">
            This workspace has no pages yet. Use New page to create the first one.
          </p>
        ) : null}
        <PageTree
          canCreatePage={canCreatePage}
          canManagePageSettings={canManagePageSettings}
          filterText={treeFilter}
          inlineCreateState={inlineCreateState}
          isCreatingPage={isCreatingPage}
          onCommitInlineCreate={onCommitInlineCreate}
          onInlineCreateTitleChange={onInlineCreateTitleChange}
          onSelectPage={onSelectPage}
          onShowCreatePage={onShowCreatePage}
          onShowChildPageCreate={onShowChildPageCreate}
          onTogglePageSettings={onTogglePageSettings}
          pageSettingsOpenPageId={pageSettingsOpenPageId}
          pages={workspace.pages}
          selectedPageId={selectedPageId}
        />
      </nav>
    </aside>
  );
}
