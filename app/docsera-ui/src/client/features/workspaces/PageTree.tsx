import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import type { DemoPage } from "../../shared/types/docsera";

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
  pages: DemoPage[];
  selectedPageId: string;
};

type PageTreeNodeProps = PageTreeProps & {
  collapsedPageIds: Set<string>;
  depth: number;
  inlineCreateState: InlinePageCreateState | null;
  onCommitInlineCreate: () => void;
  onInlineCreateTitleChange: (value: string) => void;
  onToggleCollapsed: (pageId: string) => void;
  page: DemoPage;
};

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
      <path
        d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function CollapseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
      <path
        d="M9.75 4.5L16.5 12l-6.75 7.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
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

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`docsera-page-tree__chevron-icon${expanded ? " docsera-page-tree__chevron-icon--expanded" : ""}`}
      viewBox="0 0 24 24"
      width="14"
      height="14"
      aria-hidden="true"
    >
      <path
        d="M9.75 4.5L16.5 12l-6.75 7.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

function matchesTreeFilter(page: DemoPage, filterText: string): boolean {
  if (!filterText) {
    return true;
  }

  const normalizedFilter = filterText.toLowerCase();
  if (page.title.toLowerCase().includes(normalizedFilter) || page.slug.toLowerCase().includes(normalizedFilter)) {
    return true;
  }

  return page.children ? page.children.some((child) => matchesTreeFilter(child, filterText)) : false;
}

function pageContainsId(page: DemoPage, pageId: string): boolean {
  if (!pageId) {
    return false;
  }

  if (page.id === pageId) {
    return true;
  }

  return page.children ? page.children.some((child) => pageContainsId(child, pageId)) : false;
}

function pageHasSelectedDescendant(page: DemoPage, selectedPageId: string): boolean {
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
  selectedPageId
}: PageTreeProps) {
  const [collapsedPageIds, setCollapsedPageIds] = useState<Set<string>>(() => new Set());
  const visiblePages = useMemo(() => pages.filter((page) => matchesTreeFilter(page, filterText)), [filterText, pages]);

  function toggleCollapsed(pageId: string) {
    setCollapsedPageIds((current) => {
      const next = new Set(current);
      if (next.has(pageId)) {
        next.delete(pageId);
      } else {
        next.add(pageId);
      }

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
          collapsedPageIds={collapsedPageIds}
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
