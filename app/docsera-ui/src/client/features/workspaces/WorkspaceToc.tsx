import { useEffect, useState, type KeyboardEvent } from "react";
import { DocseraIcon } from "../../shared/icons/DocseraIcon";
import { docseraIcons } from "../../shared/icons/docseraIcons";
import type { WorkspacePageView } from "./workspaceViewModels";
import { DocseraCompactTooltip } from "../../shared/tooltip/DocseraTooltip";
import type { ContentRevealState } from "./contentReveal";

type WorkspaceTocProps = {
  collapsed: boolean;
  isLoading?: boolean;
  showPendingState: boolean;
  page: WorkspacePageView | null;
  panelId: string;
  onToggleCollapsed: () => void;
  contentRevealState?: ContentRevealState;
};

type WorkspaceTocActiveState = {
  anchorId: string | null;
  pageSysId: string | null;
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

export function resolveWorkspaceHeadingTarget(anchorId: string, ordinal: number): HTMLElement | null {
  if (typeof document === "undefined") {
    return null;
  }

  const directTarget = document.getElementById(anchorId);
  if (directTarget instanceof HTMLElement) {
    return directTarget;
  }

  const editorHost = document.querySelector<HTMLElement>("[data-docsera-page-editor-host='true']");
  const shadowTarget = editorHost?.shadowRoot?.getElementById(anchorId);
  if (shadowTarget instanceof HTMLElement) {
    return shadowTarget;
  }

  const shadowHeadings = editorHost?.shadowRoot?.querySelectorAll<HTMLElement>("h1, h2, h3");
  const populatedShadowHeadings = Array.from(shadowHeadings ?? []).filter((heading) => {
    return Boolean(heading.textContent?.replace(/\s+/g, " ").trim());
  });
  const fallbackTarget = populatedShadowHeadings[ordinal];
  return fallbackTarget instanceof HTMLElement ? fallbackTarget : null;
}

function scrollToWorkspaceHeading(anchorId: string, ordinal: number): void {
  const target = resolveWorkspaceHeadingTarget(anchorId, ordinal);
  if (!target) {
    return;
  }

  const ownerWindow = target.ownerDocument.defaultView ?? window;
  const behavior = ownerWindow.matchMedia?.("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
  target.scrollIntoView({ behavior, block: "start", inline: "nearest" });
}

function activateWorkspaceHeading(anchorId: string, ordinal: number, event: { preventDefault: () => void }): void {
  event.preventDefault();
  scrollToWorkspaceHeading(anchorId, ordinal);
}

function isWorkspaceTocKeyboardActivation(event: KeyboardEvent<HTMLAnchorElement>): boolean {
  return event.key === "Enter" || event.key === " ";
}

function resolveInitialActiveAnchorId(page: WorkspacePageView | null): string | null {
  return page?.tocItems[0]?.anchorId ?? null;
}

export function WorkspaceToc({ collapsed, contentRevealState = "idle", isLoading = false, page, panelId, onToggleCollapsed }: WorkspaceTocProps) {
  const hasSections = Boolean(page && page.tocItems.length > 0);
  const [activeState, setActiveState] = useState<WorkspaceTocActiveState>(() => ({
    anchorId: resolveInitialActiveAnchorId(page),
    pageSysId: page?.sysId ?? null
  }));

  useEffect(() => {
    const firstAnchorId = resolveInitialActiveAnchorId(page);

    if (!page || !firstAnchorId) {
      setActiveState({ anchorId: null, pageSysId: null });
      return;
    }

    setActiveState((currentState) => {
      if (currentState.pageSysId === page.sysId && currentState.anchorId && page.tocItems.some((section) => section.anchorId === currentState.anchorId)) {
        return currentState;
      }

      return { anchorId: firstAnchorId, pageSysId: page.sysId };
    });
  }, [page?.sysId, page?.tocItems]);

  return (
    <div className={`docsera-toc-rail${collapsed ? " docsera-toc-rail--collapsed" : ""}`}>
      <DocseraCompactTooltip label={collapsed ? "Expand table of contents" : "Collapse table of contents"}>
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
      </DocseraCompactTooltip>

      <div className="docsera-toc-rail__clip">
        <div className="docsera-toc-rail__body">
          <aside
            id={panelId}
            className="docsera-toc"
            aria-hidden={collapsed}
            aria-label="Page outline"
          >
            <p className="docsera-toc__eyebrow">
              <DocseraIcon className="docsera-toc__eyebrow-icon" icon={docseraIcons.tableOfContents} size={14} />
              <span>On this page</span>
            </p>
            {!isLoading && hasSections ? (
              <ol className="docsera-toc__list" data-docsera-chrome-reveal-state={contentRevealState}>
                {page!.tocItems.map((section, index) => (
                  <li key={section.id} className="docsera-toc__item">
                    <a
                      className={`docsera-toc__link${section.anchorId === activeState.anchorId ? " docsera-toc__link--active" : ""}`}
                      data-level={section.level}
                      href={`#${section.anchorId}`}
                      onClick={(event) => {
                        activateWorkspaceHeading(section.anchorId, index, event);
                        setActiveState({ anchorId: section.anchorId, pageSysId: page!.sysId });
                      }}
                      onKeyDown={(event) => {
                        if (!isWorkspaceTocKeyboardActivation(event)) {
                          return;
                        }

                        activateWorkspaceHeading(section.anchorId, index, event);
                        setActiveState({ anchorId: section.anchorId, pageSysId: page!.sysId });
                      }}
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
