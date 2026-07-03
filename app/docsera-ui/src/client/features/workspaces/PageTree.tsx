import type { DemoPage } from "../../shared/types/docsera";

type PageTreeProps = {
  pages: DemoPage[];
  selectedPageId: string;
  onSelectPage: (pageId: string) => void;
};

type PageTreeNodeProps = {
  page: DemoPage;
  depth: number;
  selectedPageId: string;
  onSelectPage: (pageId: string) => void;
};

function PageTreeNode({ page, depth, selectedPageId, onSelectPage }: PageTreeNodeProps) {
  const isSelected = page.id === selectedPageId;

  return (
    <li className="docsera-shell__tree-item">
      <button
        type="button"
        className={`docsera-shell__tree-button${isSelected ? " docsera-shell__tree-button--selected" : ""}`}
        onClick={() => onSelectPage(page.id)}
        aria-current={isSelected ? "page" : undefined}
        style={{ paddingInlineStart: `${12 + depth * 14}px` }}
      >
        <span className="docsera-shell__tree-button-label">
          <span className="docsera-shell__tree-button-title">{page.title}</span>
          <span className="docsera-shell__tree-button-summary">{page.summary}</span>
        </span>
        <span className="docsera-shell__tree-button-slug">{page.slug}</span>
      </button>

      {Array.isArray(page.children) && page.children.length > 0 ? (
        <ul className="docsera-shell__tree-list">
          {page.children.map((child) => (
            <PageTreeNode
              key={child.id}
              page={child}
              depth={depth + 1}
              selectedPageId={selectedPageId}
              onSelectPage={onSelectPage}
            />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function PageTree({ pages, selectedPageId, onSelectPage }: PageTreeProps) {
  return (
    <ul className="docsera-shell__tree-list">
      {pages.map((page) => (
        <PageTreeNode
          key={page.id}
          page={page}
          depth={0}
          selectedPageId={selectedPageId}
          onSelectPage={onSelectPage}
        />
      ))}
    </ul>
  );
}
