import type { ReactNode } from "react";
import { PageEditorHost, type PageEditorHostFailure } from "../../editor/PageEditorHost";
import type { DocseraDocumentEnvelope } from "../../../shared/editor/document";
import type { PageBodySaveResult, WorkspaceMode } from "../../shared/types/docsera";
import type { WorkspacePageView } from "./workspaceViewModels";

type WorkspaceMainPaneProps = {
  page: WorkspacePageView | null;
  pagePath: WorkspacePageView[];
  workspaceMode: WorkspaceMode;
  canCreatePage: boolean;
  canEditPageBody: boolean;
  editAccessLost: boolean;
  stateCopy: string;
  stateTitle: string;
  stateType: "loading" | "error" | "ready";
  showPendingState: boolean;
  onReturnToMyWorkspaces: () => void;
  onReturnToLive: () => void;
  onRetryEditor: () => void;
  onOutlineChange: (pageSysId: string, outline: WorkspacePageView["tocItems"]) => void;
  onSavePageDraft: (input: {
    draftContentJson: DocseraDocumentEnvelope;
    expectedRevision: number;
    pageSysId: string;
  }) => Promise<PageBodySaveResult>;
  onStatusChange: (state: { isDirty: boolean; isSaving: boolean }) => void;
  onShowCreatePage: () => void;
  onAccessLost: () => void;
  sessionKey: string;
  theme: "dark" | "light";
  editorFailure: PageEditorHostFailure | null;
  onEditorFailureChange: (failure: PageEditorHostFailure | null) => void;
};

function readText(node: unknown): string {
  if (!node || typeof node !== "object") {
    return "";
  }

  const candidate = node as Record<string, unknown>;
  if (candidate.type === "text") {
    return typeof candidate.text === "string" ? candidate.text : "";
  }

  if (candidate.type === "hardBreak" || candidate.type === "hard_break") {
    return "\n";
  }

  const content = Array.isArray(candidate.content) ? candidate.content : [];
  return content.map((child) => readText(child)).join("");
}

function renderInlineContent(content: unknown[]): ReactNode {
  return content.map((node, index) => {
    if (!node || typeof node !== "object") {
      return null;
    }

    const candidate = node as Record<string, unknown>;
    if (candidate.type === "text") {
      let element: ReactNode = typeof candidate.text === "string" ? candidate.text : "";
      const marks = Array.isArray(candidate.marks) ? candidate.marks : [];

      for (const mark of marks) {
        if (!mark || typeof mark !== "object") {
          continue;
        }

        const type = (mark as Record<string, unknown>).type;
        if (type === "bold") {
          element = <strong key={`mark-${index}-bold`}>{element}</strong>;
        } else if (type === "italic") {
          element = <em key={`mark-${index}-italic`}>{element}</em>;
        } else if (type === "code") {
          element = <code key={`mark-${index}-code`}>{element}</code>;
        } else if (type === "link") {
          const href = typeof (mark as Record<string, unknown>).attrs === "object"
            ? String(((mark as Record<string, unknown>).attrs as Record<string, unknown>).href ?? "")
            : "";
          element = (
            <a key={`mark-${index}-link`} href={href || "#"}>
              {element}
            </a>
          );
        }
      }

      return <span key={`inline-${index}`}>{element}</span>;
    }

    if (candidate.type === "hardBreak" || candidate.type === "hard_break") {
      return <br key={`inline-${index}`} />;
    }

    return null;
  });
}

function renderDocumentBlocks(envelope: DocseraDocumentEnvelope) {
  const blocks = Array.isArray(envelope.document.content) ? envelope.document.content : [];
  return blocks.map((node, index) => {
    if (!node || typeof node !== "object") {
      return null;
    }

    const candidate = node as Record<string, unknown>;
    const content = Array.isArray(candidate.content) ? candidate.content : [];

    switch (candidate.type) {
      case "heading": {
        const level = Number((candidate.attrs as Record<string, unknown> | undefined)?.level);
        const headingText = readText(candidate).replace(/\s+/g, " ").trim();
        const anchorId =
          headingText &&
          headingText
            .normalize("NFKD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/-{2,}/g, "-")
            .replace(/^-+|-+$/g, "");

        if (level === 2) {
          return (
            <h2 key={`block-${index}`} id={anchorId || undefined} className="docsera-main__section-title">
              {renderInlineContent(content)}
            </h2>
          );
        }

        if (level === 3) {
          return (
            <h3 key={`block-${index}`} id={anchorId || undefined} className="docsera-main__subsection-title">
              {renderInlineContent(content)}
            </h3>
          );
        }

        return (
          <p key={`block-${index}`} className="docsera-main__body">
            {renderInlineContent(content)}
          </p>
        );
      }
      case "bullet_list":
        return (
          <ul key={`block-${index}`} className="docsera-main__list">
            {content.map((item, itemIndex) => (
              <li key={`item-${itemIndex}`}>
                {renderDocumentBlocks({
                  schemaVersion: 1,
                  document: {
                    type: "doc",
                    content: [resolveListItemContent(item)]
                  }
                })}
              </li>
            ))}
          </ul>
        );
      case "ordered_list":
        return (
          <ol key={`block-${index}`} className="docsera-main__list">
            {content.map((item, itemIndex) => (
              <li key={`item-${itemIndex}`}>
                {renderDocumentBlocks({
                  schemaVersion: 1,
                  document: {
                    type: "doc",
                    content: [resolveListItemContent(item)]
                  }
                })}
              </li>
            ))}
          </ol>
        );
      case "blockquote":
        return (
          <blockquote key={`block-${index}`} className="docsera-main__blockquote">
            {content.map((child, childIndex) => (
              <p key={`quote-${childIndex}`} className="docsera-main__body">
                {renderInlineContent(Array.isArray((child as Record<string, unknown>).content) ? ((child as Record<string, unknown>).content as unknown[]) : [])}
              </p>
            ))}
          </blockquote>
        );
      case "code_block":
        return (
          <pre key={`block-${index}`} className="docsera-main__code">
            <code>{readText(candidate)}</code>
          </pre>
        );
      case "horizontal_rule":
        return <hr key={`block-${index}`} className="docsera-main__divider" />;
      case "paragraph":
      default:
        return (
          <p key={`block-${index}`} className="docsera-main__body">
            {renderInlineContent(content)}
          </p>
        );
    }
  });
}

function EditorRecovery({
  message,
  onReturnToLive,
  onRetry
}: {
  message: string;
  onReturnToLive: () => void;
  onRetry: () => void;
}) {
  return (
    <section className="docsera-main__editor-recovery" role="alert">
      <p className="docsera-main__eyebrow">Editor recovery</p>
      <h2 className="docsera-main__recovery-title">The draft editor is unavailable</h2>
      <p className="docsera-main__lede">{message}</p>
      <div className="docsera-main__recovery-actions">
        <button type="button" className="docsera-main__empty-action" onClick={onRetry}>
          Try again
        </button>
        <button type="button" className="docsera-main__secondary-action" onClick={onReturnToLive}>
          Return to Live
        </button>
      </div>
    </section>
  );
}

function WorkspaceStateCard({
  copy,
  onReturnToMyWorkspaces,
  title
}: {
  copy: string;
  onReturnToMyWorkspaces: () => void;
  title: string;
}) {
  return (
    <section className="docsera-main__editor-recovery" role="alert">
      <p className="docsera-main__eyebrow">Workspace</p>
      <h2 id="docsera-workspace-error-title" className="docsera-main__recovery-title">
        {title}
      </h2>
      <p className="docsera-main__lede">{copy}</p>
      <div className="docsera-main__recovery-actions">
        <button type="button" className="docsera-main__secondary-action" onClick={onReturnToMyWorkspaces}>
          Return to My Workspaces
        </button>
      </div>
    </section>
  );
}

function resolveListItemContent(item: unknown): unknown {
  if (!item || typeof item !== "object") {
    return item;
  }

  const content = Array.isArray((item as Record<string, unknown>).content)
    ? ((item as Record<string, unknown>).content as unknown[])
    : [];

  return content[0] ?? item;
}

export function WorkspaceMainPane({
  page,
  pagePath,
  workspaceMode,
  canCreatePage,
  canEditPageBody,
  editAccessLost,
  stateCopy,
  stateTitle,
  stateType,
  showPendingState,
  onReturnToMyWorkspaces,
  onReturnToLive,
  onRetryEditor,
  onOutlineChange,
  onSavePageDraft,
  onStatusChange,
  onShowCreatePage,
  onAccessLost,
  sessionKey,
  theme,
  editorFailure,
  onEditorFailureChange
}: WorkspaceMainPaneProps) {
  if (stateType !== "ready") {
    return (
      <main className="docsera-main" aria-label={stateType === "error" ? "Workspace unavailable" : "Loading workspace"}>
        <article className="docsera-main__surface docsera-main__surface--empty">
          {stateType === "error" ? (
            <WorkspaceStateCard copy={stateCopy} onReturnToMyWorkspaces={onReturnToMyWorkspaces} title={stateTitle} />
          ) : showPendingState ? (
            <div className="docsera-main__pending" aria-hidden="true">
              <span className="docsera-main__pending-line" />
              <span className="docsera-main__pending-line docsera-main__pending-line--wide" />
              <span className="docsera-main__pending-line" />
            </div>
          ) : (
            null
          )}
        </article>
      </main>
    );
  }

  if (!page) {
    const isEditMode = workspaceMode === "edit";

    return (
      <main className="docsera-main" aria-labelledby="docsera-empty-workspace-title">
        <article className="docsera-main__surface docsera-main__surface--empty">
          <div className="docsera-main__intro">
            <p className="docsera-main__eyebrow">Workspace</p>
            <h1 id="docsera-empty-workspace-title" className="docsera-main__title">
              {isEditMode ? "No pages yet" : "No published pages"}
            </h1>
            <p className="docsera-main__lede">
              {isEditMode
                ? "Create the first shared draft page in this workspace to start authoring."
                : "This workspace does not have any published pages yet."}
            </p>
          </div>

          {isEditMode && canCreatePage ? (
            <button type="button" className="docsera-main__empty-action" onClick={onShowCreatePage}>
              New page
            </button>
          ) : null}
        </article>
      </main>
    );
  }

  const introEyebrow = pagePath.length > 1 ? pagePath[0]?.title : workspaceMode === "edit" ? "Edit" : "Live";
  const showEditorRecovery =
    workspaceMode === "edit" &&
    (page.contentState !== "ready" || Boolean(editorFailure));

  return (
    <main className="docsera-main" aria-labelledby="docsera-page-title">
      <article className="docsera-main__surface">
        <div className="docsera-main__intro">
          {introEyebrow ? <p className="docsera-main__eyebrow">{introEyebrow}</p> : null}
          <h1 id="docsera-page-title" className="docsera-main__title">
            {page.title}
          </h1>
          <p className="docsera-main__lede">
            {workspaceMode === "edit"
              ? "The selected page is using the shared workspace draft representation."
              : "The selected page is using the published reader representation."}
          </p>
        </div>

        {workspaceMode === "live" ? (
          page.contentState === "ready" && page.contentEnvelope ? (
            <section className="docsera-main__reader" aria-label="Published page content">
              {renderDocumentBlocks(page.contentEnvelope)}
            </section>
          ) : (
            <section className="docsera-main__editor-recovery" role="status">
              <p className="docsera-main__eyebrow">Reader</p>
              <h2 className="docsera-main__recovery-title">Published content unavailable</h2>
              <p className="docsera-main__lede">{page.contentError || "The published page content could not be loaded."}</p>
            </section>
          )
        ) : showEditorRecovery ? (
          <EditorRecovery
            message={editorFailure?.message || page.contentError || "The draft document could not be loaded safely."}
            onReturnToLive={onReturnToLive}
            onRetry={onRetryEditor}
          />
        ) : page.contentEnvelope ? (
          <>
            {editAccessLost ? (
              <section className="docsera-main__access-loss" role="alert">
                <p className="docsera-main__eyebrow">Access lost</p>
                <h2 className="docsera-main__recovery-title">Authoring access is no longer available</h2>
                <p className="docsera-main__lede">
                  Further draft actions are disabled for this session. Return to Live to reload the published workspace view.
                </p>
                <button type="button" className="docsera-main__secondary-action" onClick={onReturnToLive}>
                  Return to Live
                </button>
              </section>
            ) : null}
            {sessionKey && !editAccessLost ? (
              <div>
                <PageEditorHost
                  canEdit={canEditPageBody && !editAccessLost}
                  initialEnvelope={page.contentEnvelope}
                  initialRevision={page.page.draftRevision ?? 0}
                  onAccessLost={onAccessLost}
                  onError={onEditorFailureChange}
                  onOutlineChange={(outline) => onOutlineChange(page.sysId, outline)}
                  onSaveDraft={onSavePageDraft}
                  onStatusChange={onStatusChange}
                  pageSysId={page.sysId}
                  sessionKey={sessionKey}
                  theme={theme}
                />
              </div>
            ) : null}
          </>
        ) : null}
      </article>
    </main>
  );
}
