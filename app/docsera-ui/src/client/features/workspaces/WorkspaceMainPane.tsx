import type { DemoPage } from "../../shared/types/docsera";

type WorkspaceMainPaneProps = {
  page: DemoPage;
  pagePath: DemoPage[];
};

export function WorkspaceMainPane({ page, pagePath }: WorkspaceMainPaneProps) {
  return (
    <main className="docsera-main" aria-labelledby="docsera-page-title">
      <article className="docsera-main__surface">
        <div className="docsera-main__intro">
          {pagePath.length > 1 ? <p className="docsera-main__eyebrow">{pagePath[0]?.title}</p> : null}
          <h1 id="docsera-page-title" className="docsera-main__title">
            {page.title}
          </h1>
        </div>

        <div className="docsera-main__body">
          <p>{page.body}</p>
        </div>

        <div className="docsera-main__sections">
          {page.sections.map((section) => (
            <section key={section.id} id={section.id} className="docsera-main__section">
              <h3 className="docsera-main__section-title">{section.title}</h3>
              {section.body ? <p className="docsera-main__section-copy">{section.body}</p> : null}
            </section>
          ))}
        </div>
      </article>
    </main>
  );
}
