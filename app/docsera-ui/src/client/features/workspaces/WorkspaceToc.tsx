import type { WorkspacePageView } from "./workspaceViewModels";

type WorkspaceTocProps = {
  collapsed: boolean;
  isLoading?: boolean;
  showPendingState: boolean;
  page: WorkspacePageView | null;
  panelId: string;
  onToggleCollapsed: () => void;
};

function WorkspaceTocChevron({ collapsed }: { collapsed: boolean }) {
  return (
    // Local prototype-parity exception: the TOC uses custom chevron geometry instead of Lucide.
    <svg
      className={`docsera-toc-rail__toggle-icon docsera-toc-rail__toggle-icon--prototype-exception${
        collapsed ? " docsera-toc-rail__toggle-icon--collapsed" : ""
      }`}
      viewBox="0 0 14 14"
      width="14"
      height="14"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4.25 2.75L9.25 7l-5 4.25"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

export function WorkspaceToc({ collapsed, isLoading = false, showPendingState, page, panelId, onToggleCollapsed }: WorkspaceTocProps) {
  const hasSections = Boolean(page && page.tocItems.length > 0);

  return (
    <div className={`docsera-toc-rail${collapsed ? " docsera-toc-rail--collapsed" : ""}`}>
      <button
        type="button"
        className="docsera-toc-rail__toggle"
        aria-controls={panelId}
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expand table of contents" : "Collapse table of contents"}
        onClick={onToggleCollapsed}
      >
        <WorkspaceTocChevron collapsed={collapsed} />
      </button>

      <div className="docsera-toc-rail__clip">
        <div className="docsera-toc-rail__body">
          <aside
            id={panelId}
            className="docsera-toc"
            aria-hidden={collapsed}
            aria-label="Page outline"
          >
            <p className="docsera-toc__eyebrow">On this page</p>
            {isLoading && showPendingState ? (
              <div className="docsera-toc__loading" aria-hidden="true">
                <span className="docsera-toc__loading-line" />
                <span className="docsera-toc__loading-line docsera-toc__loading-line--wide" />
                <span className="docsera-toc__loading-line" />
              </div>
            ) : !isLoading && hasSections ? (
              <ol className="docsera-toc__list">
                {page!.tocItems.map((section, index) => (
                  <li key={section.id} className="docsera-toc__item">
                    <a
                      className={`docsera-toc__link${index === 0 ? " docsera-toc__link--active" : ""}`}
                      href={`#${section.anchorId}`}
                      tabIndex={collapsed ? -1 : undefined}
                    >
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            ) : null}
          </aside>
        </div>
      </div>
    </div>
  );
}
