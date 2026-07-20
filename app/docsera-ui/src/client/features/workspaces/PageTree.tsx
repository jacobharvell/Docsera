import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent } from "react";
import { DocseraIcon } from "../../shared/icons/DocseraIcon";
import { docseraIcons } from "../../shared/icons/docseraIcons";
import type { WorkspacePageView } from "./workspaceViewModels";

export type InlinePageCreateState = {
  errorMessage: string;
  focusToken: number;
  noticeMessage: string;
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
  onMovePage?: (input: { pageSysId: string; parentPageSysId: string | null; siblingOrder: string | number }) => void;
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
  draggedPageId: string;
  inlineCreateState: InlinePageCreateState | null;
  onCommitInlineCreate: () => void;
  onDragEnd: () => void;
  onDragStart: (pageId: string) => void;
  onDropPage: (event: DragEvent<HTMLElement>, targetPageId: string) => void;
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

function flattenPages(pages: WorkspacePageView[]): WorkspacePageView[] {
  return pages.flatMap((page) => [page, ...flattenPages(page.children ?? [])]);
}

function subtreeHeight(page: WorkspacePageView): number {
  const childHeights = (page.children ?? []).map(subtreeHeight);
  return 1 + (childHeights.length ? Math.max(...childHeights) : 0);
}

function pageDepth(pageId: string | null, pagesById: Map<string, WorkspacePageView>): number {
  if (!pageId) {
    return 0;
  }
  const page = pagesById.get(pageId);
  return page ? pageDepth(page.parentPageSysId, pagesById) + 1 : 0;
}

function pageContainsTarget(page: WorkspacePageView, targetPageId: string): boolean {
  return page.id === targetPageId || Boolean(page.children?.some((child) => pageContainsTarget(child, targetPageId)));
}

function rankBetween(previous: number | null, next: number | null): string {
  if (previous === null && next === null) {
    return "1";
  }
  if (previous === null) {
    return String((next ?? 1) - 1);
  }
  if (next === null) {
    return String(previous + 1);
  }
  return String((previous + next) / 2);
}

function movementRankForSiblingDrop(input: {
  draggedPageId: string;
  parentPageSysId: string | null;
  pagesByParent: Map<string, WorkspacePageView[]>;
  position: "before" | "after";
  targetPageId: string;
}): string {
  const parentKey = input.parentPageSysId ?? "";
  const siblings = (input.pagesByParent.get(parentKey) ?? []).filter((page) => page.id !== input.draggedPageId);
  const targetIndex = siblings.findIndex((page) => page.id === input.targetPageId);
  if (targetIndex < 0) {
    return "1";
  }

  if (input.position === "before") {
    return rankBetween(siblings[targetIndex - 1]?.siblingOrder ?? null, siblings[targetIndex]?.siblingOrder ?? null);
  }

  return rankBetween(siblings[targetIndex]?.siblingOrder ?? null, siblings[targetIndex + 1]?.siblingOrder ?? null);
}

function movementRankForChildDrop(parentPageId: string, pagesByParent: Map<string, WorkspacePageView[]>, draggedPageId: string): string {
  const children = (pagesByParent.get(parentPageId) ?? []).filter((page) => page.id !== draggedPageId);
  const lastOrder = children.length ? children[children.length - 1]?.siblingOrder ?? null : null;
  return rankBetween(lastOrder, null);
}

function dropPosition(event: DragEvent<HTMLElement>): "before" | "after" | "inside" {
  const rect = event.currentTarget.getBoundingClientRect();
  const height = rect.height || 1;
  const offset = event.clientY - rect.top;
  if (offset <= height / 3) {
    return "before";
  }
  if (offset >= (height * 2) / 3) {
    return "after";
  }
  return "inside";
}

function InlineCreateRow({
  depth,
  errorMessage,
  focusToken,
  noticeMessage,
  pending,
  showInput,
  title,
  onCommit,
  onTitleChange
}: {
  depth: number;
  errorMessage: string;
  focusToken: number;
  noticeMessage: string;
  pending: boolean;
  showInput: boolean;
  title: string;
  onCommit: () => void;
  onTitleChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
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
    <li className="docsera-page-tree__item docsera-page-tree__item--inline-create">
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
      {noticeMessage ? (
        <p className="docsera-page-tree__inline-notice" role="status">
          {noticeMessage}
        </p>
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
  draggedPageId,
  filterText,
  inlineCreateState,
  isCreatingPage,
  onCommitInlineCreate,
  onDragEnd,
  onDragStart,
  onDropPage,
  onInlineCreateTitleChange,
  onSelectPage,
  onMovePage,
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
  const canMovePage = Boolean(onMovePage && canManagePageSettings);
  const rowStyle = {
    "--docsera-page-tree-action-count": String(actionCount)
  } as CSSProperties;

  return (
    <li className="docsera-page-tree__item">
      <div
        className={`docsera-page-tree__row${isSelected ? " docsera-page-tree__row--selected" : ""}${
          isPageSettingsOpen ? " docsera-page-tree__row--settings-open" : ""
        }${draggedPageId === page.id ? " docsera-page-tree__row--dragging" : ""}`}
        data-docsera-page-id={page.id}
        draggable={canMovePage}
        onDragEnd={canMovePage ? onDragEnd : undefined}
        onDragOver={
          canMovePage
            ? (event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }
            : undefined
        }
        onDragStart={
          canMovePage
            ? (event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", page.id);
                onDragStart(page.id);
              }
            : undefined
        }
        onDrop={canMovePage ? (event) => onDropPage(event, page.id) : undefined}
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
              draggedPageId={draggedPageId}
              onDragEnd={onDragEnd}
              onDragStart={onDragStart}
              onDropPage={onDropPage}
              onInlineCreateTitleChange={onInlineCreateTitleChange}
              onSelectPage={onSelectPage}
              onMovePage={onMovePage}
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
        </ul>
      ) : null}
      {isInlineCreateParent ? (
        <ul className="docsera-page-tree__children">
          <InlineCreateRow
            depth={depth + 1}
            errorMessage={inlineCreateState.errorMessage}
            focusToken={inlineCreateState.focusToken}
            noticeMessage={inlineCreateState.noticeMessage}
            pending={inlineCreateState.pending}
            showInput={inlineCreateState.showInput}
            title={inlineCreateState.title}
            onCommit={onCommitInlineCreate}
            onTitleChange={onInlineCreateTitleChange}
          />
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
  onMovePage,
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
  const [draggedPageId, setDraggedPageId] = useState("");
  const effectiveCollapsedPageIds = useMemo(() => new Set(collapsedPageIds), [collapsedPageIds]);
  const visiblePages = useMemo(() => pages.filter((page) => matchesTreeFilter(page, filterText)), [filterText, pages]);
  const flatPages = useMemo(() => flattenPages(pages), [pages]);
  const pagesById = useMemo(() => new Map(flatPages.map((page) => [page.id, page])), [flatPages]);
  const pagesByParent = useMemo(() => {
    const groups = new Map<string, WorkspacePageView[]>();
    for (const page of flatPages) {
      const key = page.parentPageSysId ?? "";
      const siblings = groups.get(key) ?? [];
      siblings.push(page);
      groups.set(key, siblings);
    }
    for (const siblings of groups.values()) {
      siblings.sort((left, right) => left.siblingOrder - right.siblingOrder);
    }
    return groups;
  }, [flatPages]);

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

  function completeDrop(event: DragEvent<HTMLElement>, targetPageId: string) {
    if (!onMovePage || !canManagePageSettings || !draggedPageId) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    const draggedPage = pagesById.get(draggedPageId);
    const targetPage = pagesById.get(targetPageId);
    if (!draggedPage || !targetPage || draggedPage.id === targetPage.id || pageContainsTarget(draggedPage, targetPage.id)) {
      setDraggedPageId("");
      return;
    }

    const position = dropPosition(event);
    const parentPageSysId = position === "inside" ? targetPage.id : targetPage.parentPageSysId;
    const parentDepth = pageDepth(parentPageSysId, pagesById);
    if (parentDepth + subtreeHeight(draggedPage) > 6) {
      setDraggedPageId("");
      return;
    }

    const siblingOrder =
      position === "inside"
        ? movementRankForChildDrop(targetPage.id, pagesByParent, draggedPage.id)
        : movementRankForSiblingDrop({
            draggedPageId: draggedPage.id,
            parentPageSysId,
            pagesByParent,
            position,
            targetPageId: targetPage.id
          });

    if (draggedPage.parentPageSysId === parentPageSysId && String(draggedPage.siblingOrder) === siblingOrder) {
      setDraggedPageId("");
      return;
    }

    onMovePage({
      pageSysId: draggedPage.id,
      parentPageSysId,
      siblingOrder
    });
    setDraggedPageId("");
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
          draggedPageId={draggedPageId}
          filterText={filterText}
          inlineCreateState={inlineCreateState}
          isCreatingPage={isCreatingPage}
          onCommitInlineCreate={onCommitInlineCreate}
          onDragEnd={() => setDraggedPageId("")}
          onDragStart={setDraggedPageId}
          onDropPage={completeDrop}
          onInlineCreateTitleChange={onInlineCreateTitleChange}
          onSelectPage={onSelectPage}
          onMovePage={onMovePage}
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
          noticeMessage={inlineCreateState.noticeMessage}
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
