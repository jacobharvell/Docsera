import type { DemoPage, WorkspacePageRecord } from "../../shared/types/docsera";
import { PageBodyEditor } from "./PageBodyEditor";

type WorkspaceMainPaneProps = {
  page: DemoPage;
  pagePath: DemoPage[];
  workspacePage: WorkspacePageRecord | null;
  canEditPageBody: boolean;
  onSavePageBody: (input: { pageSysId: string; draftBodyText: string }) => Promise<WorkspacePageRecord>;
};

export function WorkspaceMainPane({
  page,
  pagePath,
  workspacePage,
  canEditPageBody,
  onSavePageBody
}: WorkspaceMainPaneProps) {
  return (
    <main className="docsera-main" aria-labelledby="docsera-page-title">
      <article className="docsera-main__surface">
        <div className="docsera-main__intro">
          {pagePath.length > 1 ? <p className="docsera-main__eyebrow">{pagePath[0]?.title}</p> : null}
          <h1 id="docsera-page-title" className="docsera-main__title">
            {page.title}
          </h1>
          <p className="docsera-main__lede">
            Edit the draft body for this live page and save it explicitly back to ServiceNow.
          </p>
        </div>

        <PageBodyEditor
          pageSysId={workspacePage?.sysId ?? page.id}
          initialBodyText={workspacePage?.draftBodyText ?? ""}
          canEdit={canEditPageBody && Boolean(workspacePage?.sysId)}
          onSaveBody={onSavePageBody}
        />
      </article>
    </main>
  );
}
