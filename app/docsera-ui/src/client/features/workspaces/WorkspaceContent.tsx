import type { DemoPage, DemoWorkspace } from "../../shared/types/docsera";

type WorkspaceContentProps = {
  workspace: DemoWorkspace;
  page: DemoPage;
};

export function WorkspaceContent({ workspace, page }: WorkspaceContentProps) {
  return (
    <main className="docsera-shell__content" aria-labelledby="docsera-selected-page-title">
      <section className="docsera-shell__panel docsera-shell__panel--content">
        <div className="docsera-shell__content-head">
          <div>
            <p className="docsera-shell__eyebrow">Selected page</p>
            <h2 id="docsera-selected-page-title" className="docsera-shell__content-title">
              {page.title}
            </h2>
            <p className="docsera-shell__content-summary">{page.summary}</p>
          </div>
          <div className="docsera-shell__content-meta">
            <span className="docsera-shell__chip docsera-shell__chip--solid">{page.slug}</span>
            <span className="docsera-shell__chip">{workspace.routeLabel}</span>
          </div>
        </div>

        <div className="docsera-shell__content-body">
          <p className="docsera-shell__content-prose">{page.body}</p>

          {Array.isArray(page.sections) && page.sections.length > 0 ? (
            <div className="docsera-shell__content-sections">
              {page.sections.map((section) => (
                <section key={section.id} className="docsera-shell__content-section" id={section.id}>
                  <h3 className="docsera-shell__content-section-title">{section.title}</h3>
                  {section.body ? <p className="docsera-shell__content-section-copy">{section.body}</p> : null}
                </section>
              ))}
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}

