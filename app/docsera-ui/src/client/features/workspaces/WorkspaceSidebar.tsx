import { DocseraIcon } from "../../shared/icons/DocseraIcon";
import { docseraIcons } from "../../shared/icons/docseraIcons";
import { PageTree, type InlinePageCreateState } from "./PageTree";
import type { WorkspaceMode } from "../../shared/types/docsera";
import type { WorkspacePageView } from "./workspaceViewModels";

type WorkspaceSidebarProps = {
  mode: WorkspaceMode;
  pages: WorkspacePageView[];
  selectedPageId: string;
  isLoading?: boolean;
  showPendingState: boolean;
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
  collapsedPageIds: string[];
  onCollapsedPageIdsChange: (pageIds: string[]) => void;
};

function SearchIcon() {
  return <DocseraIcon icon={docseraIcons.search} />;
}

function PlusIcon() {
  return <DocseraIcon icon={docseraIcons.plus} />;
}

export function WorkspaceSidebar({
  mode,
  pages,
  selectedPageId,
  isLoading = false,
  showPendingState,
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
  onShowChildPageCreate,
  collapsedPageIds,
  onCollapsedPageIdsChange
}: WorkspaceSidebarProps) {
  const totalPages = pages.length;
  const showLoadingState = Boolean(isLoading);

  return (
    <aside className="docsera-sidebar" aria-label="Workspace navigation" aria-busy={showLoadingState}>
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
            disabled={showLoadingState}
            onChange={(event) => onTreeFilterChange(event.target.value)}
          />
        </label>
        {canCreatePage ? (
          <button
            type="button"
            className="docsera-sidebar__icon-button"
            aria-label="New page"
            onClick={onShowCreatePage}
            disabled={isCreatingPage || showLoadingState}
          >
            <PlusIcon />
          </button>
        ) : null}
      </div>

      <nav className="docsera-sidebar__tree" aria-label="Page tree">
        {showLoadingState && showPendingState ? (
          <div className="docsera-sidebar__pending" aria-hidden="true">
            <span className="docsera-sidebar__pending-line" />
            <span className="docsera-sidebar__pending-line docsera-sidebar__pending-line--wide" />
            <span className="docsera-sidebar__pending-line" />
          </div>
        ) : showLoadingState ? null : totalPages === 0 ? (
          <p className="docsera-sidebar__empty">
            {mode === "edit"
              ? "This workspace has no pages yet. Use New page to create the first one."
              : "This workspace does not have any published pages yet."}
          </p>
        ) : (
          <PageTree
            canCreatePage={canCreatePage}
            canManagePageSettings={canManagePageSettings}
            collapsedPageIds={collapsedPageIds}
            filterText={treeFilter}
            inlineCreateState={inlineCreateState}
            isCreatingPage={isCreatingPage}
            onCollapsedPageIdsChange={onCollapsedPageIdsChange}
            onCommitInlineCreate={onCommitInlineCreate}
            onInlineCreateTitleChange={onInlineCreateTitleChange}
            onSelectPage={onSelectPage}
            onShowCreatePage={onShowCreatePage}
            onShowChildPageCreate={onShowChildPageCreate}
            onTogglePageSettings={onTogglePageSettings}
            pageSettingsOpenPageId={pageSettingsOpenPageId}
            pages={pages}
            selectedPageId={selectedPageId}
          />
        )}
      </nav>
    </aside>
  );
}
