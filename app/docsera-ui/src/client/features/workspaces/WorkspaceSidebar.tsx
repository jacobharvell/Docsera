import { useRef } from "react";
import { DocseraIcon } from "../../shared/icons/DocseraIcon";
import { docseraIcons } from "../../shared/icons/docseraIcons";
import { PageTree, type InlinePageCreateState } from "./PageTree";
import type { WorkspaceMode } from "../../shared/types/docsera";
import type { WorkspacePageView } from "./workspaceViewModels";
import { DocseraCompactTooltip } from "../../shared/tooltip/DocseraTooltip";

type WorkspaceSidebarProps = {
  mode: WorkspaceMode;
  pages: WorkspacePageView[];
  selectedPageId: string;
  isLoading?: boolean;
  showPendingState: boolean;
  onSelectPage: (pageId: string) => void;
  onMovePage?: (input: { pageSysId: string; parentPageSysId: string | null; siblingOrder: string | number }) => void;
  onRequestDeletePage: (pageId: string) => void;
  canManagePageSettings: boolean;
  inlineCreateState: InlinePageCreateState | null;
  inlineRenameErrorMessage?: string;
  inlineRenamePageId?: string;
  inlineRenameValue?: string;
  pageSettingsOpenPageId: string;
  onCancelInlineRename?: () => void;
  onCommitInlineCreate: () => void;
  onCommitInlineRename?: () => Promise<boolean> | boolean;
  onInlineCreateTitleChange: (value: string) => void;
  onInlineRenameTitleChange?: (value: string) => void;
  onStartInlineRename?: (pageId: string) => void;
  onTogglePageSettings: (pageId: string) => void;
  treeFilter: string;
  onTreeFilterChange: (value: string) => void;
  canCreatePage: boolean;
  createPageDisabledReason?: string;
  isCreatingPage: boolean;
  onShowCreatePage: () => void;
  onShowChildPageCreate: (parentPageId: string, parentPageTitle: string) => void;
  collapsedPageIds: string[];
  onCollapsedPageIdsChange: (pageIds: string[]) => void;
  showCreatePageControl: boolean;
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
  onMovePage,
  onRequestDeletePage,
  canManagePageSettings,
  inlineCreateState,
  inlineRenameErrorMessage = "",
  inlineRenamePageId = "",
  inlineRenameValue = "",
  pageSettingsOpenPageId,
  onCancelInlineRename = () => undefined,
  onCommitInlineCreate,
  onCommitInlineRename = () => true,
  onInlineCreateTitleChange,
  onInlineRenameTitleChange = () => undefined,
  onStartInlineRename = () => undefined,
  onTogglePageSettings,
  treeFilter,
  onTreeFilterChange,
  canCreatePage,
  createPageDisabledReason = "",
  isCreatingPage,
  onShowCreatePage,
  onShowChildPageCreate,
  collapsedPageIds,
  onCollapsedPageIdsChange,
  showCreatePageControl
}: WorkspaceSidebarProps) {
  const totalPages = pages.length;
  const showLoadingState = Boolean(isLoading);
  const createPageReasonId = createPageDisabledReason ? "docsera-create-page-reason" : undefined;
  const showPageTree = totalPages > 0 || Boolean(canCreatePage && inlineCreateState);
  const sidebarRef = useRef<HTMLElement>(null);
  const treeViewportRef = useRef<HTMLElement>(null);

  return (
    <aside ref={sidebarRef} className="docsera-sidebar" aria-label="Workspace navigation" aria-busy={showLoadingState}>
      <div className="docsera-sidebar__search-row">
        <label className="docsera-sidebar__search" htmlFor="docsera-page-filter">
          <span className="docsera-sidebar__search-icon">
            <SearchIcon />
          </span>
          <input
            id="docsera-page-filter"
            className="docsera-sidebar__search-input"
            type="search"
            autoComplete="off"
            placeholder="Search"
            value={treeFilter}
            disabled={showLoadingState}
            onChange={(event) => onTreeFilterChange(event.target.value)}
          />
        </label>
        {showCreatePageControl ? (
          <DocseraCompactTooltip label="New page">
            <button
              type="button"
              className="docsera-sidebar__icon-button"
              aria-label="New page"
              aria-describedby={createPageReasonId}
              onClick={onShowCreatePage}
              disabled={isCreatingPage || showLoadingState || !canCreatePage}
              title={createPageDisabledReason || undefined}
            >
              <PlusIcon />
            </button>
          </DocseraCompactTooltip>
        ) : null}
      </div>
      {createPageDisabledReason ? (
        <p id={createPageReasonId} className="docsera-sidebar__status-note" role="note">
          {createPageDisabledReason}
        </p>
      ) : null}

      <nav ref={treeViewportRef} className="docsera-sidebar__tree" aria-label="Page tree">
        {showLoadingState && showPendingState ? (
          <div className="docsera-sidebar__pending" aria-hidden="true">
            <span className="docsera-sidebar__pending-line" />
            <span className="docsera-sidebar__pending-line docsera-sidebar__pending-line--wide" />
            <span className="docsera-sidebar__pending-line" />
          </div>
        ) : showLoadingState ? null : !showPageTree ? (
          <p className="docsera-sidebar__empty">
            {mode === "edit"
              ? "This workspace has no pages yet. Use New page to create the first one."
              : "This workspace does not have any published pages yet."}
          </p>
        ) : (
          <PageTree
            canCreatePage={canCreatePage}
            canManagePageSettings={canManagePageSettings}
            dragSurfaceRef={sidebarRef}
            collapsedPageIds={collapsedPageIds}
            filterText={treeFilter}
            inlineCreateState={inlineCreateState}
            inlineRenameErrorMessage={inlineRenameErrorMessage}
            inlineRenamePageId={inlineRenamePageId}
            inlineRenameValue={inlineRenameValue}
            isCreatingPage={isCreatingPage}
            onCancelInlineRename={onCancelInlineRename}
            onCollapsedPageIdsChange={onCollapsedPageIdsChange}
            onCommitInlineCreate={onCommitInlineCreate}
            onCommitInlineRename={onCommitInlineRename}
            onInlineCreateTitleChange={onInlineCreateTitleChange}
            onInlineRenameTitleChange={onInlineRenameTitleChange}
            onSelectPage={onSelectPage}
            onMovePage={onMovePage}
            onRequestDeletePage={onRequestDeletePage}
            onShowCreatePage={onShowCreatePage}
            onShowChildPageCreate={onShowChildPageCreate}
            onStartInlineRename={onStartInlineRename}
            onTogglePageSettings={onTogglePageSettings}
            pageSettingsOpenPageId={pageSettingsOpenPageId}
            pages={pages}
            selectedPageId={selectedPageId}
            treeViewportRef={treeViewportRef}
          />
        )}
      </nav>
    </aside>
  );
}
