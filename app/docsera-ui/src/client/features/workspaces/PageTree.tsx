import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { DocseraIcon } from "../../shared/icons/DocseraIcon";
import { docseraIcons } from "../../shared/icons/docseraIcons";
import type { WorkspacePageView } from "./workspaceViewModels";

export type InlinePageCreateState = {
  errorMessage: string;
  focusToken: number;
  parentPageSysId: string;
  pending: boolean;
  showInput: boolean;
  title: string;
};

type PageTreeProps = {
  canCreatePage: boolean;
  canManagePageSettings: boolean;
  filterText: string;
  inlineCreateState: InlinePageCreateState | null;
  isCreatingPage: boolean;
  onCommitInlineCreate: () => void;
  onInlineCreateTitleChange: (value: string) => void;
  onSelectPage: (pageId: string) => void;
  onShowCreatePage: () => void;
  onShowChildPageCreate: (parentPageId: string, parentPageTitle: string) => void;
  onTogglePageSettings: (pageId: string) => void;
  pageSettingsOpenPageId: string;
  pages: WorkspacePageView[];
  selectedPageId: string;
  collapsedPageIds?: string[];
  onCollapsedPageIdsChange?: (pageIds: string[]) => void;
};

type PageTreeNodeProps = Omit<PageTreeProps, "collapsedPageIds"> & {
  collapsedPageIds: ReadonlySet<string>;
  depth: number;
  inlineCreateState: InlinePageCreateState | null;
  onCommitInlineCreate: () => void;
  onInlineCreateTitleChange: (value: string) => void;
  onToggleCollapsed: (pageId: string) => void;
  page: WorkspacePageView;
};

function GearIcon() {
  return <DocseraIcon icon={docseraIcons.settings} size={14} />;
}

function CollapseIcon() {
  return <DocseraIcon icon={docseraIcons.chevronRight} size={14} />;
}

function PlusIcon() {
  return <DocseraIcon icon={docseraIcons.plus} size={14} />;
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <DocseraIcon
      className={`docsera-page-tree__chevron-icon${expanded ? " docsera-page-tree__chevron-icon--expanded" : ""}`}
      icon={docseraIcons.chevronRight}
      size={14}
    />
  );
}

function matchesTreeFilter(page: WorkspacePageView, filterText: string): boolean {
  if (!filterText) {
    return true;
  }

  const normalizedFilter = filterText.toLowerCase();
  if (page.title.toLowerCase().includes(normalizedFilter) || page.slug.toLowerCase().includes(normalizedFilter)) {
    return true;
  }

  return page.children ? page.children.some((child) => matchesTreeFilter(child, filterText)) : false;
}

function pageContainsId(page: WorkspacePageView, pageId: string): boolean {
  if (!pageId) {
    return false;
  }

  if (page.id === pageId) {
    return true;
  }

  return page.children ? page.children.some((child) => pageContainsId(child, pageId)) : false;
}

function pageHasSelectedDescendant(page: WorkspacePageView, selectedPageId: string): boolean {
  return page.children ? page.children.some((child) => pageContainsId(child, selectedPageId)) : false;
}

function InlineCreateRow({
  depth,
  errorMessage,
  focusToken,
  pending,
  showInput,
  title,
  onCommit,
  onTitleChange
}: {
  depth: number;
  errorMessage: string;
  focusToken: number;
  pending: boolean;
  showInput: boolean;
  title: string;
  onCommit: () => void;
  onTitleChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const rowStyle = {
    "--docsera-page-tree-depth": String(depth)
  } as CSSProperties;

  useEffect(() => {
    if (pending || !showInput) {
      return;
    }

    const input = inputRef.current;
    if (!input) {
      return;
    }

    input.focus();
    input.select();
  }, [focusToken, pending]);

  return (
    <li className="docsera-page-tree__item docsera-page-tree__item--inline-create" style={rowStyle}>
      {showInput ? (
        <div className="docsera-page-tree__row docsera-page-tree__row--selected docsera-page-tree__row--inline-create">
          <div className="docsera-page-tree__row-main">
            <span className="docsera-page-tree__chevron-spacer" aria-hidden="true" />
            <label className="docsera-page-tree__inline-field">
              <span className="docsera-page-tree__inline-field-label">New page title</span>
              <input
                ref={inputRef}
                aria-label="New page title"
                className="docsera-page-tree__inline-input"
                disabled={pending}
                onBlur={onCommit}
                onChange={(event) => onTitleChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onCommit();
                  }
                }}
                type="text"
                value={title}
              />
            </label>
          </div>
        </div>
      ) : null}
      {errorMessage ? (
        <p className="docsera-page-tree__inline-error" role="alert">
          {errorMessage}
        </p>
      ) : null}
    </li>
  );
}

function PageTreeNode({
  canCreatePage,
  canManagePageSettings,
  collapsedPageIds,
  depth,
  filterText,
  inlineCreateState,
  isCreatingPage,
  onCommitInlineCreate,
  onInlineCreateTitleChange,
  onSelectPage,
  onShowChildPageCreate,
  onToggleCollapsed,
  onTogglePageSettings,
  page,
  pageSettingsOpenPageId,
  selectedPageId
}: PageTreeNodeProps) {
  if (!matchesTreeFilter(page, filterText)) {
    return null;
  }

  const hasChildren = Boolean(page.children?.length);
  const isSelected = page.id === selectedPageId;
  const isPageSettingsOpen = page.id === pageSettingsOpenPageId;
  const isInlineCreateParent = inlineCreateState?.parentPageSysId === page.id;
  const mustStayExpanded =
    hasChildren &&
    (
      pageHasSelectedDescendant(page, selectedPageId) ||
      isInlineCreateParent ||
      Boolean(filterText && page.children?.some((child) => matchesTreeFilter(child, filterText)))
    );
  const isExpanded = hasChildren ? !collapsedPageIds.has(page.id) || mustStayExpanded : false;
  const showChildCreateButton = canCreatePage && hasChildren;
  const showSettingsButton = canManagePageSettings;
  const actionCount = [showChildCreateButton, showSettingsButton].filter(Boolean).length;
  const rowStyle = {
    "--docsera-page-tree-action-count": String(actionCount),
    "--docsera-page-tree-depth": String(depth)
  } as CSSProperties;

  return (
    <li className="docsera-page-tree__item">
      <div
        className={`docsera-page-tree__row${isSelected ? " docsera-page-tree__row--selected" : ""}${
          isPageSettingsOpen ? " docsera-page-tree__row--settings-open" : ""
        }`}
        style={rowStyle}
      >
        <div className="docsera-page-tree__row-main">
          {hasChildren ? (
            <button
              type="button"
              className="docsera-page-tree__chevron"
              aria-label={isExpanded ? `Collapse ${page.title}` : `Expand ${page.title}`}
              onClick={() => onToggleCollapsed(page.id)}
            >
              <ChevronIcon expanded={isExpanded} />
            </button>
          ) : (
            <span className="docsera-page-tree__chevron-spacer" aria-hidden="true" />
          )}
          <button
            type="button"
            className="docsera-page-tree__button"
            onClick={() => onSelectPage(page.id)}
            aria-current={isSelected ? "page" : undefined}
            title={page.title}
          >
            <span className="docsera-page-tree__title">{page.title}</span>
            {page.statusIndicator ? <span className="docsera-page-tree__status-indicator">{page.statusIndicator}</span> : null}
          </button>
        </div>

        {actionCount > 0 ? (
          <div className="docsera-page-tree__actions">
            {showChildCreateButton ? (
              <button
                type="button"
                className="docsera-page-tree__action-button"
                aria-label={`Add child page to ${page.title}`}
                onClick={() => onShowChildPageCreate(page.id, page.title)}
                disabled={isCreatingPage}
              >
                <PlusIcon />
              </button>
            ) : null}
            {showSettingsButton ? (
              <button
                type="button"
                className="docsera-page-tree__action-button docsera-page-tree__action-button--settings"
                aria-label={isPageSettingsOpen ? `Collapse settings for ${page.title}` : `Open settings for ${page.title}`}
                data-docsera-page-settings-trigger="true"
                onClick={() => onTogglePageSettings(page.id)}
              >
                {isPageSettingsOpen ? <CollapseIcon /> : <GearIcon />}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {hasChildren && isExpanded ? (
        <ul className="docsera-page-tree__children">
          {page.children?.map((child) => (
            <PageTreeNode
              key={child.id}
              canCreatePage={canCreatePage}
              canManagePageSettings={canManagePageSettings}
              collapsedPageIds={collapsedPageIds}
              depth={depth + 1}
              filterText={filterText}
              inlineCreateState={inlineCreateState}
              isCreatingPage={isCreatingPage}
              onCommitInlineCreate={onCommitInlineCreate}
              onInlineCreateTitleChange={onInlineCreateTitleChange}
              onSelectPage={onSelectPage}
              onShowChildPageCreate={onShowChildPageCreate}
              onShowCreatePage={() => undefined}
              onToggleCollapsed={onToggleCollapsed}
              onTogglePageSettings={onTogglePageSettings}
              page={child}
              pageSettingsOpenPageId={pageSettingsOpenPageId}
              pages={[]}
              selectedPageId={selectedPageId}
            />
          ))}
          {isInlineCreateParent ? (
            <InlineCreateRow
              depth={depth + 1}
              errorMessage={inlineCreateState.errorMessage}
              focusToken={inlineCreateState.focusToken}
              pending={inlineCreateState.pending}
              showInput={inlineCreateState.showInput}
              title={inlineCreateState.title}
              onCommit={onCommitInlineCreate}
              onTitleChange={onInlineCreateTitleChange}
            />
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

export function PageTree({
  canCreatePage,
  canManagePageSettings,
  filterText,
  inlineCreateState,
  isCreatingPage,
  onCommitInlineCreate,
  onInlineCreateTitleChange,
  onSelectPage,
  onShowCreatePage,
  onShowChildPageCreate,
  onTogglePageSettings,
  pageSettingsOpenPageId,
  pages,
  selectedPageId,
  collapsedPageIds = [],
  onCollapsedPageIdsChange
}: PageTreeProps) {
  const [localCollapsedPageIds, setLocalCollapsedPageIds] = useState<Set<string>>(() => new Set(collapsedPageIds));
  const effectiveCollapsedPageIds = useMemo(() => new Set(collapsedPageIds), [collapsedPageIds]);
  const visiblePages = useMemo(() => pages.filter((page) => matchesTreeFilter(page, filterText)), [filterText, pages]);

  useEffect(() => {
    setLocalCollapsedPageIds(new Set(collapsedPageIds));
  }, [collapsedPageIds]);

  function toggleCollapsed(pageId: string) {
    setLocalCollapsedPageIds((current) => {
      const next = new Set(current);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }

      onCollapsedPageIdsChange?.([...next]);
      return next;
    });
  }

  return (
    <ul className="docsera-page-tree__list">
      {visiblePages.map((page) => (
        <PageTreeNode
          key={page.id}
          canCreatePage={canCreatePage}
          canManagePageSettings={canManagePageSettings}
          collapsedPageIds={effectiveCollapsedPageIds.size > 0 ? effectiveCollapsedPageIds : localCollapsedPageIds}
          depth={0}
          filterText={filterText}
          inlineCreateState={inlineCreateState}
          isCreatingPage={isCreatingPage}
          onCommitInlineCreate={onCommitInlineCreate}
          onInlineCreateTitleChange={onInlineCreateTitleChange}
          onSelectPage={onSelectPage}
          onShowChildPageCreate={onShowChildPageCreate}
          onShowCreatePage={onShowCreatePage}
          onToggleCollapsed={toggleCollapsed}
          onTogglePageSettings={onTogglePageSettings}
          page={page}
          pageSettingsOpenPageId={pageSettingsOpenPageId}
          pages={pages}
          selectedPageId={selectedPageId}
        />
      ))}
      {canCreatePage && inlineCreateState && !inlineCreateState.parentPageSysId ? (
        <InlineCreateRow
          depth={0}
          errorMessage={inlineCreateState.errorMessage}
          focusToken={inlineCreateState.focusToken}
          pending={inlineCreateState.pending}
          showInput={inlineCreateState.showInput}
          title={inlineCreateState.title}
          onCommit={onCommitInlineCreate}
          onTitleChange={onInlineCreateTitleChange}
        />
      ) : null}
      {canCreatePage ? (
        <li className="docsera-page-tree__item docsera-page-tree__item--new-page">
          <button
            type="button"
          className="docsera-page-tree__new-page"
          onClick={onShowCreatePage}
          disabled={isCreatingPage}
        >
          <span className="docsera-page-tree__new-page-icon-slot" aria-hidden="true">
            <PlusIcon />
          </span>
          <span>New page</span>
        </button>
      </li>
      ) : null}
    </ul>
  );
}
