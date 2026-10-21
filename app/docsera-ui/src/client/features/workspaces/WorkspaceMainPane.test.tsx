/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceMainPane } from "./WorkspaceMainPane";
import type { WorkspacePageView } from "./workspaceViewModels";

vi.mock("./WorkspaceMarkdownSourcePanel", () => ({
  WorkspaceMarkdownSourcePanel: ({
    authoringSurface,
    onReadyStateChange,
    visible
  }: {
    authoringSurface: string;
    onReadyStateChange?: (ready: boolean) => void;
    visible: boolean;
  }) => (
    <div data-testid="markdown-source-panel" data-surface={authoringSurface} data-visible={String(visible)}>
      <button type="button" onClick={() => onReadyStateChange?.(true)}>
        Mark Markdown ready
      </button>
    </div>
  )
}));

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

function createPageView(): WorkspacePageView {
  return {
    id: "page-001",
    isDraftOnly: false,
    page: {
      sysId: "page-001",
      workspaceSysId: "workspace-001",
      parentPageSysId: null,
      siblingOrder: 1,
      draftTitle: "Overview",
      draftSlug: "overview",
      draftSlugNormalized: "overview",
      draftContentJson: null,
      draftRevision: 0,
      draftBodyText: null,
      publishedTitle: "Overview",
      publishedSlug: "overview",
      publishedSlugNormalized: "overview",
      publishedContentJson: null,
      publishedBodyText: null,
      publicationState: "published",
      active: true
    },
    contentEnvelope: {
      schemaVersion: 1,
      document: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "Alpha" },
              { type: "hardBreak" },
              { type: "text", text: "Beta" }
            ]
          }
        ]
      }
    },
    contentError: "",
    contentState: "ready",
    publicationState: "published",
    siblingOrder: 1,
    slug: "overview",
    statusIndicator: null,
    sysId: "page-001",
    title: "Overview",
    tocItems: [],
    parentPageSysId: null
  } as WorkspacePageView;
}

function getEditorHost(): HTMLElement {
  const host = document.querySelector("[data-docsera-page-editor-host='true']");
  expect(host).toBeInstanceOf(HTMLElement);
  return host as HTMLElement;
}

function createDomRect({
  height,
  left,
  top,
  width
}: {
  height: number;
  left: number;
  top: number;
  width: number;
}): DOMRect {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
    x: left,
    y: top,
    toJSON: () => ({ height, left, top, width })
  } as DOMRect;
}

function mockElementGeometry(element: Element, rects: DOMRect[]): void {
  Object.defineProperty(element, "getClientRects", {
    configurable: true,
    value: () => rects
  });
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => rects[0] ?? createDomRect({ height: 0, left: 0, top: 0, width: 0 })
  });
}

function createEmptyWorkspaceProps(
  overrides: Partial<ComponentProps<typeof WorkspaceMainPane>> = {}
): ComponentProps<typeof WorkspaceMainPane> {
  return {
    bodyState: "ready",
    page: null,
    workspaceMode: "edit",
    canCreatePage: true,
    canEditPageBody: false,
    canManagePageSettings: false,
    editAccessLost: false,
    pageTitleActive: false,
    pageTitleSaveError: "",
    pageTitleValidationError: "",
    pageTitleValue: "",
    stateCopy: "",
    stateTitle: "",
    stateType: "ready",
    showPendingState: false,
    onReturnToMyWorkspaces: vi.fn(),
    onReturnToLive: vi.fn(),
    onRetryEditor: vi.fn(),
    onPageTitleCancel: vi.fn(),
    onPageTitleChange: vi.fn(),
    onPageTitleCommit: vi.fn(),
    onPageTitleStart: vi.fn(),
    onEditorReadyStateChange: vi.fn(),
    onOutlineChange: vi.fn(),
    onSavePageDraft: vi.fn(async () => ({
      state: "succeeded" as const,
      page: createPageView().page
    })),
    onStatusChange: vi.fn(),
    onShowCreatePage: vi.fn(),
    onAccessLost: vi.fn(),
    sessionKey: "session-001",
    theme: "light",
    editorFailure: null,
    onEditorFailureChange: vi.fn(),
    workspaceIdentity: "workspace-a",
    ...overrides
  };
}

describe("empty workspace session recovery", () => {
  it("shows recovery controls without a selected page", () => {
    const end = vi.fn();
    render(<WorkspaceMainPane {...createEmptyWorkspaceProps({ workspaceMode: "live", editAccessLost: true, leaseConflict: true, onEndPreviousSession: end })} />);
    fireEvent.click(screen.getByRole("button", { name: "End previous session" }));
    expect(end).toHaveBeenCalledOnce();
    expect(screen.queryByText("No published pages")).not.toBeInTheDocument();
  });

  it("preserves normal empty views without a conflict", () => {
    const view = render(<WorkspaceMainPane {...createEmptyWorkspaceProps({ workspaceMode: "live" })} />);
    expect(screen.getByText("No published pages")).toBeInTheDocument();
    view.rerender(<WorkspaceMainPane {...createEmptyWorkspaceProps()} />);
    expect(screen.getByText("No pages yet")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New page" })).toBeInTheDocument();
  });
});

function mockReducedMotion(matches: boolean): () => void {
  const originalMatchMedia = window.matchMedia;
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      addEventListener: vi.fn(),
      matches: query === "(prefers-reduced-motion: reduce)" ? matches : false,
      media: query,
      removeEventListener: vi.fn()
    }))
  });

  return () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      writable: true,
      value: originalMatchMedia
    });
  };
}

describe("WorkspaceMainPane", () => {
  it("renders the edit no-page empty state without the workspace eyebrow and keeps New page wired to creation", () => {
    const onShowCreatePage = vi.fn();

    render(<WorkspaceMainPane {...createEmptyWorkspaceProps({ onShowCreatePage })} />);

    expect(screen.getByRole("heading", { level: 1, name: "No pages yet" })).toBeInTheDocument();
    expect(screen.queryByText("Workspace")).not.toBeInTheDocument();

    const newPageButton = screen.getByRole("button", { name: "New page" });
    expect(newPageButton).toHaveClass("docsera-modal__primary");
    expect(newPageButton).toHaveClass("docsera-main__empty-primary-action");
    expect(newPageButton).not.toHaveClass("docsera-main__empty-action");

    fireEvent.click(newPageButton);

    expect(onShowCreatePage).toHaveBeenCalledTimes(1);
  });

  it("renders the live no-page empty state without the workspace eyebrow or New page action", () => {
    render(<WorkspaceMainPane {...createEmptyWorkspaceProps({ workspaceMode: "live", canCreatePage: true })} />);

    expect(screen.getByRole("heading", { level: 1, name: "No published pages" })).toBeInTheDocument();
    expect(screen.queryByText("Workspace")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New page" })).not.toBeInTheDocument();
  });

  it("does not add the New page action when the edit empty state cannot create pages", () => {
    render(<WorkspaceMainPane {...createEmptyWorkspaceProps({ canCreatePage: false })} />);

    expect(screen.getByRole("heading", { level: 1, name: "No pages yet" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New page" })).not.toBeInTheDocument();
  });

  it("keeps workspace recovery presentation on the legacy recovery action treatment", () => {
    render(
      <WorkspaceMainPane
        {...createEmptyWorkspaceProps({
          stateType: "error",
          stateTitle: "Workspace unavailable",
          stateCopy: "Try again when the workspace is reachable.",
          onRetryWorkspace: vi.fn()
        })}
      />
    );

    expect(screen.getByText("Workspace")).toHaveClass("docsera-main__eyebrow");
    const retryButton = screen.getByRole("button", { name: "Try again" });
    expect(retryButton).toHaveClass("docsera-main__empty-action");
    expect(retryButton).not.toHaveClass("docsera-modal__primary");
    expect(retryButton).not.toHaveClass("docsera-main__empty-primary-action");
  });

  it("renders canonical hardBreak as a visible line break in the live reader", () => {
    const page = createPageView();
    const view = render(
      <WorkspaceMainPane
        bodyState="ready"
        page={page}
        workspaceIdentity="workspace-a"
        workspaceMode="live"
        canCreatePage={false}
        canEditPageBody={false}
        canManagePageSettings={false}
        editAccessLost={false}
        pageTitleActive={false}
        pageTitleSaveError=""
        pageTitleValidationError=""
        pageTitleValue={page.title}
        stateCopy=""
        stateTitle=""
        stateType="ready"
        showPendingState={false}
        onReturnToMyWorkspaces={vi.fn()}
        onReturnToLive={vi.fn()}
        onRetryEditor={vi.fn()}
        onPageTitleCancel={vi.fn()}
        onPageTitleChange={vi.fn()}
        onPageTitleCommit={vi.fn()}
        onPageTitleStart={vi.fn()}
        onEditorReadyStateChange={vi.fn()}
        onOutlineChange={vi.fn()}
        onSavePageDraft={vi.fn(async () => ({
          state: "succeeded" as const,
          page: page.page
        }))}
        onStatusChange={vi.fn()}
        onShowCreatePage={vi.fn()}
        onAccessLost={vi.fn()}
        sessionKey="session-001"
        theme="light"
        editorFailure={null}
        onEditorFailureChange={vi.fn()}
      />
    );

    const reader = screen.getByLabelText("Published page content");
    expect(reader).toHaveTextContent("AlphaBeta");
    expect(reader).toHaveTextContent("Beta");
    expect(reader.querySelectorAll("br")).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Save draft" })).not.toBeInTheDocument();
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
    expect(screen.queryByText("The selected page is using the published reader representation.")).not.toBeInTheDocument();
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).toBeNull();

    view.unmount();
  });

  it("renders the real edit host without diagnostic card chrome and keeps the overlay root separate from the page header", async () => {
    const page = createPageView();
    let view!: ReturnType<typeof render>;
    await act(async () => {
      view = render(
        <WorkspaceMainPane
          bodyState="ready"
          page={page}
          workspaceIdentity="workspace-a"
          workspaceMode="edit"
          canCreatePage={false}
          canEditPageBody={true}
          canManagePageSettings={true}
          editAccessLost={false}
          pageTitleActive={false}
          pageTitleSaveError=""
          pageTitleValidationError=""
          pageTitleValue={page.title}
          stateCopy=""
          stateTitle=""
          stateType="ready"
          showPendingState={false}
          onReturnToMyWorkspaces={vi.fn()}
          onReturnToLive={vi.fn()}
          onRetryEditor={vi.fn()}
          onPageTitleCancel={vi.fn()}
          onPageTitleChange={vi.fn()}
          onPageTitleCommit={vi.fn()}
          onPageTitleStart={vi.fn()}
          onEditorReadyStateChange={vi.fn()}
          onOutlineChange={vi.fn()}
          onSavePageDraft={vi.fn(async () => ({
            state: "succeeded" as const,
            page: page.page
          }))}
          onStatusChange={vi.fn()}
          onShowCreatePage={vi.fn()}
          onAccessLost={vi.fn()}
          sessionKey="session-001"
          theme="light"
          editorFailure={null}
          onEditorFailureChange={vi.fn()}
        />
      );
    });
    await act(async () => {
      await Promise.resolve();
    });

    const pageHeader = document.querySelector(".docsera-main__page-header");
    expect(pageHeader).toBeInTheDocument();
    const host = getEditorHost();

    expect(within(pageHeader as HTMLElement).getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(within(pageHeader as HTMLElement).getByRole("button", { name: "Overview" })).toBeInTheDocument();
    expect((pageHeader as HTMLElement).querySelector(".docsera-main__editor-controls")).toBeNull();
    await waitFor(() => {
      expect(host).toBeInTheDocument();
    });

    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
    expect(screen.queryByText("The selected page is using the shared workspace draft representation.")).not.toBeInTheDocument();
    expect(screen.queryByText("Canonical TipTap content is isolated inside the production child host and saved explicitly during E2.")).not.toBeInTheDocument();
    expect(document.querySelector(".docsera-main__editor")).toBeNull();
    expect(document.querySelector(".docsera-main__editor-header")).toBeNull();
    expect(document.querySelector(".docsera-main__editor-copy")).toBeNull();
    expect(document.querySelector(".docsera-main__status-pill")).toBeNull();

    view.unmount();
  });

  it("keeps editor readiness separate from decorative editor placeholders", () => {
    const page = createPageView();
    const { rerender } = render(
      <WorkspaceMainPane
        {...createEmptyWorkspaceProps({
          bodyState: "loading",
          canEditPageBody: true,
          canManagePageSettings: true,
          page,
          pageTitleValue: page.title,
          showPendingState: false
        })}
      />
    );

    expect(screen.queryByRole("status", { name: "Loading editor" })).not.toBeInTheDocument();
    expect(document.querySelector(".docsera-main__editor-host")).toHaveAttribute("hidden");

    rerender(
      <WorkspaceMainPane
        {...createEmptyWorkspaceProps({
          bodyState: "loading",
          canEditPageBody: true,
          canManagePageSettings: true,
          page,
          pageTitleValue: page.title,
          showPendingState: true
        })}
      />
    );

    expect(screen.getByRole("status", { name: "Loading editor" })).toBeInTheDocument();
    expect(document.querySelector(".docsera-main__editor-host")).toHaveAttribute("hidden");
  });

  it("does not let delayed live content placeholders control reader readiness", () => {
    const page = createPageView();
    const { rerender } = render(
      <WorkspaceMainPane
        {...createEmptyWorkspaceProps({
          bodyState: "loading",
          page,
          workspaceMode: "live",
          showPendingState: false
        })}
      />
    );

    expect(screen.queryByRole("status", { name: "Loading page content" })).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Published page content")).not.toBeInTheDocument();

    rerender(
      <WorkspaceMainPane
        {...createEmptyWorkspaceProps({
          bodyState: "ready",
          page,
          workspaceMode: "live",
          showPendingState: false
        })}
      />
    );

    expect(screen.getByLabelText("Published page content")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Loading page content" })).not.toBeInTheDocument();
  });

  it("keeps current-page save status out of the page body", async () => {
    const page = createPageView();
    const baseProps = {
      bodyState: "ready" as const,
      page,
      canCreatePage: false,
      canEditPageBody: true,
      canManagePageSettings: true,
      editAccessLost: false,
      pageTitleActive: false,
      pageTitleSaveError: "",
      pageTitleValidationError: "",
      pageTitleValue: page.title,
      stateCopy: "",
      stateTitle: "",
      stateType: "ready" as const,
      showPendingState: false,
      onReturnToMyWorkspaces: vi.fn(),
      onReturnToLive: vi.fn(),
      onRetryEditor: vi.fn(),
      onPageTitleCancel: vi.fn(),
      onPageTitleChange: vi.fn(),
      onPageTitleCommit: vi.fn(),
      onPageTitleStart: vi.fn(),
      onEditorReadyStateChange: vi.fn(),
      onOutlineChange: vi.fn(),
      onSavePageDraft: vi.fn(async () => ({
        state: "succeeded" as const,
        page: page.page
      })),
      onStatusChange: vi.fn(),
      onShowCreatePage: vi.fn(),
      onAccessLost: vi.fn(),
      sessionKey: "session-001",
      theme: "light" as const,
      editorFailure: null,
      onEditorFailureChange: vi.fn(),
      workspaceIdentity: "workspace-a"
    };

    const { rerender, unmount } = render(<WorkspaceMainPane {...baseProps} workspaceMode="edit" />);
    rerender(<WorkspaceMainPane {...baseProps} workspaceMode="live" />);
    expect(screen.queryByRole("status", { name: /saving/i })).not.toBeInTheDocument();
    expect(document.querySelector(".docsera-main__save-status")).toBeNull();

    unmount();
  });

  it("mounts the markdown source panel for the active page, hides the visual editor host, and removes the visual page title while markdown is selected", async () => {
    const page = createPageView();
    render(
      <WorkspaceMainPane
        bodyState="ready"
        page={page}
        workspaceMode="edit"
        canCreatePage={false}
        canEditPageBody={true}
        canManagePageSettings={true}
        editAccessLost={false}
        pageTitleActive={false}
        pageTitleSaveError=""
        pageTitleValidationError=""
        pageTitleValue={page.title}
        stateCopy=""
        stateTitle=""
        stateType="ready"
        showPendingState={false}
        onReturnToMyWorkspaces={vi.fn()}
        onReturnToLive={vi.fn()}
        onRetryEditor={vi.fn()}
        onPageTitleCancel={vi.fn()}
        onPageTitleChange={vi.fn()}
        onPageTitleCommit={vi.fn()}
        onPageTitleStart={vi.fn()}
        onEditorReadyStateChange={vi.fn()}
        onOutlineChange={vi.fn()}
        onSavePageDraft={vi.fn(async () => ({
          state: "succeeded" as const,
          page: page.page
        }))}
        onStatusChange={vi.fn()}
        onShowCreatePage={vi.fn()}
        onAccessLost={vi.fn()}
        sessionKey="session-001"
        theme="light"
        editorFailure={null}
        onEditorFailureChange={vi.fn()}
        editorCanonicalEnvelope={page.contentEnvelope}
        authoringSurface="markdown"
        workspaceIdentity="workspace-a"
        sourceSessionPageSysId="page-001"
        onSourceBodyChange={vi.fn()}
        onSourceDiscardInvalidDraft={vi.fn()}
        onSourceInvalidChange={vi.fn()}
        onSourceTitleChange={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("markdown-source-panel")).toBeInTheDocument();
    });

    const sourcePanel = screen.getByTestId("markdown-source-panel");
    expect(sourcePanel).toHaveAttribute("data-surface", "markdown");
    expect(sourcePanel).toHaveAttribute("data-visible", "true");
    expect(screen.getByRole("main", { name: "Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Overview" })).toBeNull();
    expect(document.querySelector(".docsera-main__page-header")).toBeNull();
    expect(document.querySelector(".docsera-main__editor-host[hidden]")).toBeInTheDocument();
  });

  it("keeps the markdown source caret and CodeMirror cursor layer on Docsera theme text color", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    );

    expect(source).toMatch(
      /\.docsera-main__source-editor \.cm-editor \.cm-content \{\s*caret-color: var\(--docsera-document-text-color, var\(--docsera-text\)\);\s*\}/
    );
    expect(source).toMatch(
      /\.docsera-main__source-editor \.cm-editor \.cm-content ::selection \{\s*background: color-mix\(in srgb, var\(--docsera-primary\) 22%, transparent\);\s*\}/
    );
    expect(source).toMatch(
      /\.docsera-main__source-editor \.cm-editor \.cm-cursor,\s*\.docsera-main__source-editor \.cm-editor \.cm-dropCursor \{\s*border-left-color: var\(--docsera-document-text-color, var\(--docsera-text\)\);\s*\}/
    );
    expect(source).toMatch(
      /\.docsera-main__source-editor \.cm-editor \.cm-selectionBackground,\s*\.docsera-main__source-editor \.cm-editor\.cm-focused \.cm-selectionBackground \{\s*background: color-mix\(in srgb, var\(--docsera-primary\) 22%, transparent\);\s*\}/
    );
  });

  it("moves mode reveals without transforming the editor and keeps surface reveals opacity-only", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    );
    const style = document.createElement("style");
    style.textContent = source;
    document.head.append(style);
    const fixture = document.createElement("div");
    document.body.append(fixture);
    const matchingPropertyValues = (element: Element, property: string): string[] =>
      Array.from(style.sheet?.cssRules ?? []).flatMap((rule) => {
        if (!(rule instanceof CSSStyleRule)) {
          return [];
        }
        const selectorMatches = rule.selectorText.split(",").some((selector) => {
          try {
            return element.matches(selector.trim());
          } catch {
            return false;
          }
        });
        return selectorMatches ? [rule.style.getPropertyValue(property)].filter(Boolean) : [];
      });
    const lastValue = (values: string[]): string | undefined => values[values.length - 1];

    const editorSurface = document.createElement("article");
    editorSurface.className = "docsera-main__surface docsera-main__surface--editor docsera-main__content-reveal";
    editorSurface.dataset.docseraContentRevealScope = "workspace";
    editorSurface.dataset.docseraContentRevealPending = "true";
    editorSurface.dataset.docseraContentRevealState = "enter";
    fixture.append(editorSurface);

    const liveSurface = document.createElement("article");
    liveSurface.className = "docsera-main__surface docsera-main__content-reveal";
    liveSurface.dataset.docseraContentRevealPending = "true";
    liveSurface.dataset.docseraContentRevealState = "enter";
    fixture.append(liveSurface);

    const launcherContent = document.createElement("section");
    launcherContent.className = "docsera-launcher__content-reveal";
    launcherContent.dataset.docseraLauncherRevealPending = "true";
    launcherContent.dataset.docseraLauncherRevealState = "enter";
    fixture.append(launcherContent);

    const sidebarTree = document.createElement("nav");
    sidebarTree.className = "docsera-sidebar__tree";
    sidebarTree.dataset.docseraChromeRevealState = "enter";
    const sidebarRow = document.createElement("button");
    sidebarRow.className = "docsera-page-tree__row";
    sidebarTree.append(sidebarRow);
    fixture.append(sidebarTree);

    const tocList = document.createElement("ol");
    tocList.className = "docsera-toc__list";
    tocList.dataset.docseraChromeRevealState = "pending";
    const tocLink = document.createElement("a");
    tocLink.className = "docsera-toc__link";
    tocList.append(tocLink);
    fixture.append(tocList);

    try {
      expect(editorSurface.matches(".docsera-main__surface--editor.docsera-main__content-reveal")).toBe(true);
      expect(editorSurface.matches(".docsera-main__surface--editor .docsera-main__content-reveal")).toBe(false);

      expect(getComputedStyle(editorSurface).transform).toBe("none");
      expect(getComputedStyle(editorSurface).top).toBe("16px");
      expect(lastValue(matchingPropertyValues(editorSurface, "animation"))).toBe(
        "docsera-editor-mode-reveal 400ms cubic-bezier(0.22, 1, 0.36, 1)"
      );
      editorSurface.dataset.docseraContentRevealScope = "authoring-surface";
      expect(getComputedStyle(editorSurface).transform).toBe("none");
      expect(lastValue(matchingPropertyValues(editorSurface, "animation"))).toBe(
        "docsera-content-opacity-reveal 400ms cubic-bezier(0.22, 1, 0.36, 1)"
      );
      expect(source).toMatch(/@keyframes docsera-editor-mode-reveal\s*\{\s*from\s*\{\s*opacity:\s*0;\s*top:\s*16px;\s*\}\s*to\s*\{\s*opacity:\s*1;\s*top:\s*0;/s);
      expect(getComputedStyle(liveSurface).transform).toBe("translateY(16px)");
      expect(lastValue(matchingPropertyValues(liveSurface, "animation"))).toBe(
        "docsera-content-reveal 400ms cubic-bezier(0.22, 1, 0.36, 1)"
      );
      expect(getComputedStyle(launcherContent).transform).toBe("translateY(16px)");
      expect(lastValue(matchingPropertyValues(launcherContent, "animation"))).toBe(
        "docsera-content-reveal 400ms cubic-bezier(0.22, 1, 0.36, 1)"
      );
      expect(lastValue(matchingPropertyValues(sidebarRow, "animation"))).toBe(
        "docsera-content-reveal 400ms cubic-bezier(0.22, 1, 0.36, 1)"
      );
      expect(getComputedStyle(tocLink).transform).toBe("translateY(16px)");
      expect(source).toMatch(
        /@keyframes docsera-content-reveal\s*\{\s*from\s*\{\s*opacity:\s*0;\s*transform:\s*translateY\(16px\);\s*\}\s*to\s*\{\s*opacity:\s*1;\s*transform:\s*translateY\(0\);/s
      );
      expect(source).toMatch(
        /@keyframes docsera-content-opacity-reveal\s*\{\s*from\s*\{\s*opacity:\s*0;\s*\}\s*to\s*\{\s*opacity:\s*1;\s*\}\s*\}/s
      );
      expect(source).toMatch(
        /\.docsera-sidebar__tree\[data-docsera-chrome-reveal-state="enter"\] \.docsera-page-tree__row,\s*\.docsera-toc__list\[data-docsera-chrome-reveal-state="enter"\] \.docsera-toc__link\s*\{\s*animation:\s*docsera-content-reveal 400ms cubic-bezier\(0\.22, 1, 0\.36, 1\);/s
      );
      expect(source).toMatch(
        /\.docsera-sidebar__tree\[data-docsera-chrome-reveal-state="pending"\] \.docsera-page-tree__row,\s*\.docsera-toc__list\[data-docsera-chrome-reveal-state="pending"\] \.docsera-toc__link\s*\{\s*opacity:\s*0;\s*transform:\s*translateY\(16px\);/s
      );
      expect(source).not.toContain("docsera-content-chrome-reveal");
      expect(source).not.toContain(".docsera-breadcrumbs[data-docsera-chrome-reveal-state");
      expect(source).toMatch(
        /\.docsera-main__surface\[data-docsera-content-reveal-state="enter"\]\s*\{\s*transition:\s*none;\s*\}/
      );
      expect(source).not.toMatch(/animation-fill-mode:\s*(forwards|both)/);
    } finally {
      fixture.remove();
      style.remove();
    }
  });

  it("renders a nested page title without an ancestor label above the title", () => {
    const rootPage = createPageView();
    rootPage.id = "page-root";
    rootPage.sysId = "page-root";
    rootPage.title = "Overview";
    const nestedPage = createPageView();
    nestedPage.id = "page-child";
    nestedPage.sysId = "page-child";
    nestedPage.parentPageSysId = "page-root";
    nestedPage.title = "Install Guide";

    const { unmount } = render(
      <WorkspaceMainPane
        bodyState="ready"
        page={nestedPage}
        workspaceMode="live"
        canCreatePage={false}
        canEditPageBody={false}
        canManagePageSettings={false}
        editAccessLost={false}
        pageTitleActive={false}
        pageTitleSaveError=""
        pageTitleValidationError=""
        pageTitleValue={nestedPage.title}
        stateCopy=""
        stateTitle=""
        stateType="ready"
        showPendingState={false}
        onReturnToMyWorkspaces={vi.fn()}
        onReturnToLive={vi.fn()}
        onRetryEditor={vi.fn()}
        onPageTitleCancel={vi.fn()}
        onPageTitleChange={vi.fn()}
        onPageTitleCommit={vi.fn()}
        onPageTitleStart={vi.fn()}
        onEditorReadyStateChange={vi.fn()}
        onOutlineChange={vi.fn()}
        onSavePageDraft={vi.fn(async () => ({
          state: "succeeded" as const,
          page: nestedPage.page
        }))}
        onStatusChange={vi.fn()}
        onShowCreatePage={vi.fn()}
        onAccessLost={vi.fn()}
        sessionKey="session-001"
        theme="light"
        editorFailure={null}
        onEditorFailureChange={vi.fn()}
        workspaceIdentity="workspace-a"
      />
    );

    const main = screen.getByRole("main", { name: "Install Guide" });
    const pageHeader = document.querySelector(".docsera-main__page-header");
    expect(within(pageHeader as HTMLElement).getByRole("heading", { level: 1, name: "Install Guide" })).toBeInTheDocument();
    expect(within(main).queryByText("Overview")).not.toBeInTheDocument();
    expect(document.querySelector(".docsera-main__intro > .docsera-main__eyebrow")).toBeNull();

    unmount();
  });

  it("keeps the title read-only in live mode and exposes an inline title trigger in edit mode", () => {
    const page = createPageView();
    const props = {
      bodyState: "ready" as const,
      canCreatePage: false,
      canEditPageBody: true,
      canManagePageSettings: true,
      editAccessLost: false,
      page,
      pageTitleActive: false,
      pageTitleSaveError: "",
      pageTitleValidationError: "",
      pageTitleValue: page.title,
      stateCopy: "",
      stateTitle: "",
      stateType: "ready" as const,
      showPendingState: false,
      onReturnToMyWorkspaces: vi.fn(),
      onReturnToLive: vi.fn(),
      onRetryEditor: vi.fn(),
      onPageTitleCancel: vi.fn(),
      onPageTitleChange: vi.fn(),
      onPageTitleCommit: vi.fn(),
      onPageTitleStart: vi.fn(),
      onEditorReadyStateChange: vi.fn(),
      onOutlineChange: vi.fn(),
      onSavePageDraft: vi.fn(async () => ({
        state: "succeeded" as const,
        page: page.page
      })),
      onStatusChange: vi.fn(),
      onShowCreatePage: vi.fn(),
      onAccessLost: vi.fn(),
      sessionKey: "session-001",
      theme: "light" as const,
      editorFailure: null,
      onEditorFailureChange: vi.fn(),
      workspaceIdentity: "workspace-a"
    };

    const { rerender } = render(<WorkspaceMainPane {...props} workspaceMode="live" />);
    expect(screen.queryByRole("button", { name: "Overview" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Page title" })).toBeNull();

    rerender(<WorkspaceMainPane {...props} contentRevealIntent={{ destination: "visual", key: 1 }} workspaceMode="edit" />);
    expect(screen.getByRole("button", { name: "Overview" })).toBeInTheDocument();
  });

  it("activates inline title editing from the normal title surface in edit mode", () => {
    const page = createPageView();
    const onPageTitleStart = vi.fn();
    const props = {
      bodyState: "ready" as const,
      canCreatePage: false,
      canEditPageBody: true,
      canManagePageSettings: true,
      editAccessLost: false,
      page,
      pageTitleSaveError: "",
      pageTitleValidationError: "",
      pageTitleValue: page.title,
      stateCopy: "",
      stateTitle: "",
      stateType: "ready" as const,
      showPendingState: false,
      onReturnToMyWorkspaces: vi.fn(),
      onReturnToLive: vi.fn(),
      onRetryEditor: vi.fn(),
      onPageTitleCancel: vi.fn(),
      onPageTitleChange: vi.fn(),
      onPageTitleCommit: vi.fn(),
      onPageTitleStart,
      onEditorReadyStateChange: vi.fn(),
      onOutlineChange: vi.fn(),
      onSavePageDraft: vi.fn(async () => ({
        state: "succeeded" as const,
        page: page.page
      })),
      onStatusChange: vi.fn(),
      onShowCreatePage: vi.fn(),
      onAccessLost: vi.fn(),
      sessionKey: "session-001",
      theme: "light" as const,
      editorFailure: null,
      onEditorFailureChange: vi.fn(),
      workspaceIdentity: "workspace-a"
    };

    const { rerender } = render(<WorkspaceMainPane {...props} workspaceMode="edit" pageTitleActive={false} />);

    fireEvent.click(screen.getByRole("button", { name: "Overview" }));

    expect(onPageTitleStart).toHaveBeenCalledWith("page-001");

    rerender(<WorkspaceMainPane {...props} workspaceMode="edit" pageTitleActive={true} />);

    expect(screen.getByRole("textbox", { name: "Page title" })).toHaveValue("Overview");
  });

  it("activates inline title editing from trailing title whitespace and places the caret at the end", () => {
    const page = createPageView();
    const onPageTitleStart = vi.fn();
    const props = {
      bodyState: "ready" as const,
      canCreatePage: false,
      canEditPageBody: true,
      canManagePageSettings: true,
      editAccessLost: false,
      page,
      pageTitleSaveError: "",
      pageTitleValidationError: "",
      pageTitleValue: page.title,
      stateCopy: "",
      stateTitle: "",
      stateType: "ready" as const,
      showPendingState: false,
      onReturnToMyWorkspaces: vi.fn(),
      onReturnToLive: vi.fn(),
      onRetryEditor: vi.fn(),
      onPageTitleCancel: vi.fn(),
      onPageTitleChange: vi.fn(),
      onPageTitleCommit: vi.fn(),
      onPageTitleStart,
      onEditorReadyStateChange: vi.fn(),
      onOutlineChange: vi.fn(),
      onSavePageDraft: vi.fn(async () => ({
        state: "succeeded" as const,
        page: page.page
      })),
      onStatusChange: vi.fn(),
      onShowCreatePage: vi.fn(),
      onAccessLost: vi.fn(),
      sessionKey: "session-001",
      theme: "light" as const,
      editorFailure: null,
      onEditorFailureChange: vi.fn(),
      workspaceIdentity: "workspace-a"
    };

    const { rerender } = render(<WorkspaceMainPane {...props} workspaceMode="edit" pageTitleActive={false} />);

    const titleButton = screen.getByRole("button", { name: "Overview" });
    const titleText = within(titleButton).getByText("Overview");
    mockElementGeometry(titleButton, [createDomRect({ height: 48, left: 0, top: 0, width: 320 })]);
    mockElementGeometry(titleText, [createDomRect({ height: 48, left: 0, top: 0, width: 140 })]);

    fireEvent.click(titleButton, { clientX: 280, clientY: 24, detail: 1 });

    expect(onPageTitleStart).toHaveBeenCalledWith("page-001");

    rerender(<WorkspaceMainPane {...props} workspaceMode="edit" pageTitleActive={true} />);

    const titleInput = screen.getByRole("textbox", { name: "Page title" }) as HTMLInputElement;
    expect(titleInput).toHaveFocus();
    expect(titleInput).toHaveValue("Overview");
    expect(titleInput.selectionStart).toBe("Overview".length);
    expect(titleInput.selectionEnd).toBe("Overview".length);
  });

  it("keeps trailing title whitespace read-only in live mode", () => {
    const page = createPageView();
    const onPageTitleStart = vi.fn();

    render(
      <WorkspaceMainPane
        bodyState="ready"
        page={page}
        workspaceMode="live"
        canCreatePage={false}
        canEditPageBody={false}
        canManagePageSettings={false}
        editAccessLost={false}
        pageTitleActive={false}
        pageTitleSaveError=""
        pageTitleValidationError=""
        pageTitleValue={page.title}
        stateCopy=""
        stateTitle=""
        stateType="ready"
        showPendingState={false}
        onReturnToMyWorkspaces={vi.fn()}
        onReturnToLive={vi.fn()}
        onRetryEditor={vi.fn()}
        onPageTitleCancel={vi.fn()}
        onPageTitleChange={vi.fn()}
        onPageTitleCommit={vi.fn()}
        onPageTitleStart={onPageTitleStart}
        onEditorReadyStateChange={vi.fn()}
        onOutlineChange={vi.fn()}
        onSavePageDraft={vi.fn(async () => ({
          state: "succeeded" as const,
          page: page.page
        }))}
        onStatusChange={vi.fn()}
        onShowCreatePage={vi.fn()}
        onAccessLost={vi.fn()}
        sessionKey="session-001"
        theme="light"
        editorFailure={null}
        onEditorFailureChange={vi.fn()}
        workspaceIdentity="workspace-a"
      />
    );

    expect(screen.queryByRole("button", { name: "Overview" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Page title" })).toBeNull();
    expect(onPageTitleStart).not.toHaveBeenCalled();
  });

  it("keeps the title read-only in markdown mode", () => {
    const page = createPageView();
    const onPageTitleStart = vi.fn();

    render(
      <WorkspaceMainPane
        bodyState="ready"
        page={page}
        workspaceMode="edit"
        canCreatePage={false}
        canEditPageBody={true}
        canManagePageSettings={true}
        editAccessLost={false}
        pageTitleActive={false}
        pageTitleSaveError=""
        pageTitleValidationError=""
        pageTitleValue={page.title}
        stateCopy=""
        stateTitle=""
        stateType="ready"
        showPendingState={false}
        onReturnToMyWorkspaces={vi.fn()}
        onReturnToLive={vi.fn()}
        onRetryEditor={vi.fn()}
        onPageTitleCancel={vi.fn()}
        onPageTitleChange={vi.fn()}
        onPageTitleCommit={vi.fn()}
        onPageTitleStart={onPageTitleStart}
        onEditorReadyStateChange={vi.fn()}
        onOutlineChange={vi.fn()}
        onSavePageDraft={vi.fn(async () => ({
          state: "succeeded" as const,
          page: page.page
        }))}
        onStatusChange={vi.fn()}
        onShowCreatePage={vi.fn()}
        onAccessLost={vi.fn()}
        sessionKey="session-001"
        theme="light"
        editorFailure={null}
        onEditorFailureChange={vi.fn()}
        authoringSurface="markdown"
        workspaceIdentity="workspace-a"
      />
    );

    const pageHeader = document.querySelector(".docsera-main__page-header");
    expect(pageHeader).toBeNull();
    expect(screen.getByRole("main", { name: "Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Page title" })).toBeNull();
    expect(onPageTitleStart).not.toHaveBeenCalled();
  });

  it("reveals only the destination content on successful live and edit mode switches", async () => {
    const restoreMotion = mockReducedMotion(false);
    const page = createPageView();
    const props = createEmptyWorkspaceProps({
      canEditPageBody: true,
      canManagePageSettings: true,
      page,
      pageTitleValue: page.title,
      workspaceMode: "live"
    });

    const { rerender } = render(<WorkspaceMainPane {...props} />);
    expect(screen.getByLabelText("Published page content")).toBeInTheDocument();
    expect(document.querySelector("[data-docsera-content-reveal-state='enter']")).toBeNull();

    rerender(<WorkspaceMainPane {...props} contentRevealIntent={{ destination: "visual", key: 1 }} workspaceMode="edit" />);
    expect(document.querySelector(".docsera-main__editor-host")).not.toHaveAttribute("hidden");
    expect(document.querySelector("[data-docsera-content-reveal='visual']")).toHaveAttribute("data-docsera-content-reveal-state", "enter");
    expect(screen.getByRole("button", { name: "Overview" }).closest("[data-docsera-content-reveal='visual']")).toHaveAttribute(
      "data-docsera-content-reveal-state",
      "enter"
    );
    expect(document.querySelector(".docsera-main__editor-host")).not.toHaveAttribute("hidden");
    expect(screen.queryByLabelText("Published page content")).not.toBeInTheDocument();

    rerender(<WorkspaceMainPane {...props} contentRevealIntent={{ destination: "live", key: 2 }} workspaceMode="live" />);
    expect(document.querySelector("[data-docsera-content-reveal='live']")).toHaveAttribute("data-docsera-content-reveal-state", "enter");
    expect(document.querySelector(".docsera-main__editor-host")).toBeNull();

    restoreMotion();
  });

  it("keeps the reveal state active for the full 400ms animation lifetime without a final snap", async () => {
    vi.useFakeTimers();
    const restoreMotion = mockReducedMotion(false);
    const page = createPageView();
    const props = createEmptyWorkspaceProps({
      canEditPageBody: true,
      canManagePageSettings: true,
      page,
      pageTitleValue: page.title,
      workspaceMode: "live"
    });

    const { rerender } = render(<WorkspaceMainPane {...props} />);
    rerender(<WorkspaceMainPane {...props} contentRevealIntent={{ destination: "visual", key: 1 }} workspaceMode="edit" />);

    expect(document.querySelector("[data-docsera-content-reveal='visual']")).toHaveAttribute("data-docsera-content-reveal-state", "enter");

    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(document.querySelector("[data-docsera-content-reveal='visual']")).toHaveAttribute("data-docsera-content-reveal-state", "enter");

    act(() => {
      vi.advanceTimersByTime(1);
    });
    const revealSurface = document.querySelector("[data-docsera-content-reveal='visual']");
    expect(revealSurface).toHaveAttribute("data-docsera-content-reveal-state", "idle");
    expect(revealSurface).toHaveClass("docsera-main__surface");

    restoreMotion();
  });

  it("does not reveal destination content for ordinary same-mode page navigation", () => {
    const firstPage = createPageView();
    const secondPage = {
      ...createPageView(),
      id: "page-002",
      page: {
        ...createPageView().page,
        sysId: "page-002",
        draftTitle: "Install",
        draftSlug: "install",
        draftSlugNormalized: "install",
        publishedTitle: "Install",
        publishedSlug: "install",
        publishedSlugNormalized: "install"
      },
      slug: "install",
      sysId: "page-002",
      title: "Install"
    } as WorkspacePageView;
    const props = createEmptyWorkspaceProps({
      canEditPageBody: true,
      canManagePageSettings: true,
      page: firstPage,
      pageTitleValue: firstPage.title,
      workspaceMode: "live"
    });

    const { rerender } = render(<WorkspaceMainPane {...props} />);
    rerender(<WorkspaceMainPane {...props} page={secondPage} pageTitleValue={secondPage.title} />);

    expect(screen.getByRole("main", { name: "Install" })).toBeInTheDocument();
    expect(document.querySelector("[data-docsera-content-reveal='live']")).toHaveAttribute("data-docsera-content-reveal-state", "idle");
    expect(document.querySelector("[data-docsera-content-reveal-state='enter']")).toBeNull();
  });

  it("does not reveal destination content when initial workspace loading becomes ready", () => {
    const page = createPageView();
    const props = createEmptyWorkspaceProps({
      canEditPageBody: true,
      canManagePageSettings: true,
      page,
      pageTitleValue: page.title,
      stateType: "loading",
      stateTitle: "Loading",
      stateCopy: "Loading workspace",
      workspaceMode: "live"
    });

    const { rerender } = render(<WorkspaceMainPane {...props} />);
    rerender(<WorkspaceMainPane {...props} stateType="ready" />);

    expect(screen.getByLabelText("Published page content")).toBeInTheDocument();
    expect(document.querySelector("[data-docsera-content-reveal='live']")).toHaveAttribute("data-docsera-content-reveal-state", "idle");
    expect(document.querySelector("[data-docsera-content-reveal-state='enter']")).toBeNull();
  });

  it("reveals a successful mode switch after temporary loading resolves", async () => {
    const page = createPageView();
    const props = createEmptyWorkspaceProps({
      canEditPageBody: true,
      canManagePageSettings: true,
      page,
      pageTitleValue: page.title,
      workspaceMode: "live"
    });

    const { rerender } = render(<WorkspaceMainPane {...props} />);
    rerender(<WorkspaceMainPane {...props} bodyState="loading" contentRevealIntent={{ destination: "visual", key: 1 }} showPendingState={true} workspaceMode="edit" />);
    expect(screen.getByRole("status", { name: "Loading editor" })).toBeInTheDocument();
    expect(document.querySelector("[data-docsera-content-reveal-state='enter']")).toBeNull();
    expect(screen.getByRole("button", { name: "Overview" }).closest("[data-docsera-content-reveal='visual']")).toHaveAttribute(
      "data-docsera-content-reveal-pending",
      "true"
    );

    rerender(<WorkspaceMainPane {...props} contentRevealIntent={{ destination: "visual", key: 1 }} workspaceMode="edit" />);

    await waitFor(() => {
      expect(document.querySelector("[data-docsera-content-reveal='visual']")).toHaveAttribute("data-docsera-content-reveal-state", "enter");
    });
    expect(document.querySelector(".docsera-main__editor-host")).not.toHaveAttribute("hidden");
  });

  it("does not reveal when switching directly from edit in one workspace to delayed live content in another", () => {
    const sourcePage = createPageView();
    const destinationPage = {
      ...createPageView(),
      id: "workspace-b-page",
      page: {
        ...createPageView().page,
        sysId: "workspace-b-page",
        draftTitle: "Workspace B Overview",
        draftSlug: "workspace-b-overview",
        draftSlugNormalized: "workspace-b-overview",
        publishedTitle: "Workspace B Overview",
        publishedSlug: "workspace-b-overview",
        publishedSlugNormalized: "workspace-b-overview"
      },
      slug: "workspace-b-overview",
      sysId: "workspace-b-page",
      title: "Workspace B Overview"
    } as WorkspacePageView;
    const props = createEmptyWorkspaceProps({
      canEditPageBody: true,
      canManagePageSettings: true,
      page: sourcePage,
      pageTitleValue: sourcePage.title,
      workspaceIdentity: "workspace-a",
      workspaceMode: "edit"
    });

    const { rerender } = render(<WorkspaceMainPane {...props} />);
    expect(document.querySelector(".docsera-main__editor-host")).not.toHaveAttribute("hidden");

    rerender(
      <WorkspaceMainPane
        {...props}
        bodyState="loading"
        page={destinationPage}
        pageTitleValue={destinationPage.title}
        showPendingState={true}
        workspaceIdentity="workspace-b"
        workspaceMode="live"
      />
    );
    expect(screen.getByRole("status", { name: "Loading page content" })).toBeInTheDocument();
    expect(document.querySelector("[data-docsera-content-reveal-state='enter']")).toBeNull();

    rerender(
      <WorkspaceMainPane
        {...props}
        page={destinationPage}
        pageTitleValue={destinationPage.title}
        workspaceIdentity="workspace-b"
        workspaceMode="live"
      />
    );

    expect(screen.getByRole("main", { name: "Workspace B Overview" })).toBeInTheDocument();
    expect(document.querySelector("[data-docsera-content-reveal='live']")).toHaveAttribute("data-docsera-content-reveal-state", "idle");
    expect(document.querySelector("[data-docsera-content-reveal-state='enter']")).toBeNull();
  });

  it("does not start a reveal for blocked or pending destination content", () => {
    const page = createPageView();
    const props = createEmptyWorkspaceProps({
      bodyState: "loading",
      canEditPageBody: true,
      canManagePageSettings: true,
      page,
      pageTitleValue: page.title,
      showPendingState: true,
      workspaceMode: "live"
    });

    const { rerender } = render(<WorkspaceMainPane {...props} />);
    expect(screen.getByRole("status", { name: "Loading page content" })).toBeInTheDocument();
    expect(document.querySelector("[data-docsera-content-reveal-state='enter']")).toBeNull();

    rerender(<WorkspaceMainPane {...props} contentRevealIntent={{ destination: "visual", key: 1 }} workspaceMode="edit" />);
    expect(screen.getByRole("status", { name: "Loading editor" })).toBeInTheDocument();
    expect(document.querySelector("[data-docsera-content-reveal-state='enter']")).toBeNull();
    expect(document.querySelector(".docsera-main__editor-host")).toHaveAttribute("hidden");
  });

  it("waits for the lazy Markdown source session before revealing Markdown content", async () => {
    const page = createPageView();
    const props = createEmptyWorkspaceProps({
      canEditPageBody: true,
      canManagePageSettings: true,
      editorCanonicalEnvelope: page.contentEnvelope,
      page,
      pageTitleValue: page.title,
      sourceSessionPageSysId: page.sysId,
      onSourceBodyChange: vi.fn(),
      onSourceDiscardInvalidDraft: vi.fn(),
      onSourceInvalidChange: vi.fn(),
      onSourceTitleChange: vi.fn(),
      workspaceMode: "edit"
    });

    const { rerender } = render(<WorkspaceMainPane {...props} authoringSurface="visual" />);
    rerender(<WorkspaceMainPane {...props} authoringSurface="markdown" contentRevealIntent={{ destination: "markdown", key: 1 }} />);

    const sourcePanel = await screen.findByTestId("markdown-source-panel");
    expect(sourcePanel).toHaveAttribute("data-visible", "true");
    expect(document.querySelector("[data-docsera-content-reveal='markdown']")).toHaveAttribute("data-docsera-content-reveal-state", "pending");
    expect(document.querySelector("[data-docsera-content-reveal='markdown']")).toHaveAttribute("data-docsera-content-reveal-pending", "true");

    fireEvent.click(screen.getByRole("button", { name: "Mark Markdown ready" }));

    expect(document.querySelector("[data-docsera-content-reveal='markdown']")).toHaveAttribute("data-docsera-content-reveal-state", "enter");
    expect(document.querySelector("[data-docsera-content-reveal='markdown']")).not.toHaveAttribute("data-docsera-content-reveal-pending");
    expect(document.querySelector(".docsera-main__editor-host[hidden]")).toBeInTheDocument();
  });

  it("re-enters Markdown smoothly when a preserved source session becomes visible again", () => {
    const page = createPageView();
    const props = createEmptyWorkspaceProps({
      canEditPageBody: true,
      canManagePageSettings: true,
      editorCanonicalEnvelope: page.contentEnvelope,
      page,
      pageTitleValue: page.title,
      sourceSessionPageSysId: page.sysId,
      onSourceBodyChange: vi.fn(),
      onSourceDiscardInvalidDraft: vi.fn(),
      onSourceInvalidChange: vi.fn(),
      onSourceTitleChange: vi.fn(),
      workspaceMode: "edit"
    });

    const { rerender } = render(<WorkspaceMainPane {...props} authoringSurface="visual" />);
    rerender(<WorkspaceMainPane {...props} authoringSurface="markdown" contentRevealIntent={{ destination: "markdown", key: 1 }} />);
    fireEvent.click(screen.getByRole("button", { name: "Mark Markdown ready" }));
    expect(document.querySelector("[data-docsera-content-reveal='markdown']")).toHaveAttribute("data-docsera-content-reveal-state", "enter");

    rerender(<WorkspaceMainPane {...props} authoringSurface="visual" contentRevealIntent={{ destination: "visual", key: 2 }} />);
    expect(document.querySelector("[data-docsera-content-reveal='visual']")).toHaveAttribute("data-docsera-content-reveal-state", "enter");

    rerender(<WorkspaceMainPane {...props} authoringSurface="markdown" contentRevealIntent={{ destination: "markdown", key: 3 }} />);
    expect(screen.getByTestId("markdown-source-panel")).toHaveAttribute("data-visible", "true");
    expect(document.querySelector("[data-docsera-content-reveal='markdown']")).toHaveAttribute("data-docsera-content-reveal-state", "enter");
    expect(document.querySelector("[data-docsera-content-reveal='markdown']")).not.toHaveAttribute("data-docsera-content-reveal-pending");
  });

  it("keeps only the latest rapid mode-transition destination in reveal state", () => {
    const page = createPageView();
    const props = createEmptyWorkspaceProps({
      canEditPageBody: true,
      canManagePageSettings: true,
      page,
      pageTitleValue: page.title,
      workspaceMode: "live"
    });

    const { rerender } = render(<WorkspaceMainPane {...props} />);
    rerender(<WorkspaceMainPane {...props} contentRevealIntent={{ destination: "visual", key: 1 }} workspaceMode="edit" />);
    rerender(<WorkspaceMainPane {...props} contentRevealIntent={{ destination: "live", key: 2 }} workspaceMode="live" />);
    rerender(<WorkspaceMainPane {...props} contentRevealIntent={{ destination: "visual", key: 3 }} workspaceMode="edit" />);

    expect(document.querySelector("[data-docsera-content-reveal='visual']")).toHaveAttribute("data-docsera-content-reveal-state", "enter");
    expect(document.querySelectorAll("[data-docsera-content-reveal-state='enter']")).toHaveLength(1);
    expect(screen.queryByLabelText("Published page content")).not.toBeInTheDocument();
  });

  it("keeps stale rapid switches from retaining an interactive obsolete editor surface", () => {
    const page = createPageView();
    const props = createEmptyWorkspaceProps({
      canEditPageBody: true,
      canManagePageSettings: true,
      editorCanonicalEnvelope: page.contentEnvelope,
      page,
      pageTitleValue: page.title,
      sourceSessionPageSysId: page.sysId,
      onSourceBodyChange: vi.fn(),
      onSourceDiscardInvalidDraft: vi.fn(),
      onSourceInvalidChange: vi.fn(),
      onSourceTitleChange: vi.fn(),
      workspaceMode: "edit"
    });

    const { rerender } = render(<WorkspaceMainPane {...props} authoringSurface="visual" />);
    rerender(<WorkspaceMainPane {...props} authoringSurface="markdown" contentRevealIntent={{ destination: "markdown", key: 1 }} />);
    rerender(<WorkspaceMainPane {...props} authoringSurface="visual" contentRevealIntent={{ destination: "visual", key: 2 }} />);

    expect(document.querySelector("[data-docsera-content-reveal='visual']")).toBeInTheDocument();
    expect(document.querySelector(".docsera-main__editor-host")).not.toHaveAttribute("hidden");
    expect(screen.queryByTestId("markdown-source-panel")).toBeInTheDocument();
    expect(screen.getByTestId("markdown-source-panel")).toHaveAttribute("data-visible", "false");
  });

  it("displays destination content immediately when reduced motion is requested", () => {
    const restoreMotion = mockReducedMotion(true);
    const page = createPageView();
    const props = createEmptyWorkspaceProps({
      canEditPageBody: true,
      canManagePageSettings: true,
      page,
      pageTitleValue: page.title,
      workspaceMode: "live"
    });

    const { rerender } = render(<WorkspaceMainPane {...props} />);
    rerender(<WorkspaceMainPane {...props} contentRevealIntent={{ destination: "visual", key: 1 }} workspaceMode="edit" />);

    expect(document.querySelector("[data-docsera-content-reveal='visual']")).toHaveAttribute("data-docsera-content-reveal-state", "idle");
    expect(document.querySelector(".docsera-main__editor-host")).not.toHaveAttribute("hidden");

    restoreMotion();
  });
});
