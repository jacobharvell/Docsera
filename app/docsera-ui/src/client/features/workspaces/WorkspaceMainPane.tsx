import type { DemoPage, WorkspacePageRecord } from "../../shared/types/docsera";
import { PageBodyEditor } from "./PageBodyEditor";

type WorkspaceMainPaneProps = {
  page: DemoPage | null;
  pagePath: DemoPage[];
  workspacePage: WorkspacePageRecord | null;
  canEditPageBody: boolean;
  canCreatePage: boolean;
  onShowCreatePage: () => void;
  onSavePageBody: (input: { pageSysId: string; draftBodyText: string }) => Promise<WorkspacePageRecord>;
};

export function WorkspaceMainPane({
  page,
  pagePath,
  workspacePage,
  canEditPageBody,
  canCreatePage,
  onShowCreatePage,
  onSavePageBody
}: WorkspaceMainPaneProps) {
  if (!page) {
    return (
      <main className="docsera-main" aria-labelledby="docsera-empty-workspace-title">
        <article className="docsera-main__surface docsera-main__surface--empty">
          <div className="docsera-main__intro">
            <p className="docsera-main__eyebrow">Workspace</p>
            <h1 id="docsera-empty-workspace-title" className="docsera-main__title">
              No pages yet
            </h1>
            <p className="docsera-main__lede">
              This workspace is empty. Use New page in the sidebar to create the first page and start the tree.
            </p>
          </div>

          {canCreatePage ? (
            <button type="button" className="docsera-main__empty-action" onClick={onShowCreatePage}>
              New page
            </button>
          ) : null}
        </article>
      </main>
    );
  }

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
