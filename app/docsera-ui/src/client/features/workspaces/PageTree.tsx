import type { DemoPage } from "../../shared/types/docsera";

type PageTreeProps = {
  pages: DemoPage[];
  selectedPageId: string;
  onSelectPage: (pageId: string) => void;
  filterText: string;
};

type PageTreeNodeProps = {
  page: DemoPage;
  depth: number;
  selectedPageId: string;
  onSelectPage: (pageId: string) => void;
  filterText: string;
};

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

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
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

function matchesTreeFilter(page: DemoPage, filterText: string): boolean {
  if (!filterText) {
    return true;
  }

  const normalizedFilter = filterText.toLowerCase();
  if (page.title.toLowerCase().includes(normalizedFilter)) {
    return true;
  }

  return page.children ? page.children.some((child) => matchesTreeFilter(child, filterText)) : false;
}

function PageTreeNode({ page, depth, selectedPageId, onSelectPage, filterText }: PageTreeNodeProps) {
  if (!matchesTreeFilter(page, filterText)) {
    return null;
  }

  const isSelected = page.id === selectedPageId;

  return (
    <li className="docsera-page-tree__item">
      <div className={`docsera-page-tree__row${isSelected ? " docsera-page-tree__row--selected" : ""}`}>
        <button
          type="button"
          className="docsera-page-tree__button"
          onClick={() => onSelectPage(page.id)}
          aria-current={isSelected ? "page" : undefined}
          style={{ paddingInlineStart: `${12 + depth * 18}px` }}
        >
          <span className="docsera-page-tree__title">{page.title}</span>
        </button>
        <div className="docsera-page-tree__actions" aria-hidden="true">
          <button type="button" className="docsera-page-tree__action-button" tabIndex={-1} disabled>
            <PlusIcon />
          </button>
          <button type="button" className="docsera-page-tree__action-button" tabIndex={-1} disabled>
            <GearIcon />
          </button>
        </div>
      </div>

      {page.children?.length ? (
        <ul className="docsera-page-tree__list">
          {page.children.map((child) => (
            <PageTreeNode
              key={child.id}
              page={child}
              depth={depth + 1}
              selectedPageId={selectedPageId}
              onSelectPage={onSelectPage}
              filterText={filterText}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function PageTree({ pages, selectedPageId, onSelectPage, filterText }: PageTreeProps) {
  return (
    <ul className="docsera-page-tree__list">
      {pages.map((page) => (
        <PageTreeNode
          key={page.id}
          page={page}
          depth={0}
          selectedPageId={selectedPageId}
          onSelectPage={onSelectPage}
          filterText={filterText}
        />
      ))}
    </ul>
  );
}
