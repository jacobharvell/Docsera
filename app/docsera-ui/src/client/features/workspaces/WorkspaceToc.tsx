import type { DemoPage } from "../../shared/types/docsera";

type WorkspaceTocProps = {
  page: DemoPage | null;
};

export function WorkspaceToc({ page }: WorkspaceTocProps) {
  return (
    <aside className="docsera-toc" aria-label="Page outline">
      <p className="docsera-toc__eyebrow">On this page</p>
      {!page ? (
        <p className="docsera-toc__empty">No page selected yet.</p>
      ) : page.sections.length > 0 ? (
        <ol className="docsera-toc__list">
          {page.sections.map((section, index) => (
            <li key={section.id} className="docsera-toc__item">
              <a
                className={`docsera-toc__link${index === 0 ? " docsera-toc__link--active" : ""}`}
                href={`#${section.id}`}
              >
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      ) : (
        <p className="docsera-toc__empty">No headings yet.</p>
      )}
    </aside>
  );
}
