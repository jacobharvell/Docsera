/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceMainPane } from "./WorkspaceMainPane";
import type { WorkspacePageView } from "./workspaceViewModels";

vi.mock("./WorkspaceMarkdownSourcePanel", () => ({
  WorkspaceMarkdownSourcePanel: ({
    authoringSurface,
    visible
  }: {
    authoringSurface: string;
    visible: boolean;
  }) => <div data-testid="markdown-source-panel" data-surface={authoringSurface} data-visible={String(visible)} />
}));

afterEach(() => {
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

describe("WorkspaceMainPane", () => {
  it("renders canonical hardBreak as a visible line break in the live reader", () => {
    const page = createPageView();
    const view = render(
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
      onEditorFailureChange: vi.fn()
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
      onEditorFailureChange: vi.fn()
    };

    const { rerender } = render(<WorkspaceMainPane {...props} workspaceMode="live" />);
    expect(screen.queryByRole("button", { name: "Overview" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Page title" })).toBeNull();

    rerender(<WorkspaceMainPane {...props} workspaceMode="edit" />);
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
      onEditorFailureChange: vi.fn()
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
      onEditorFailureChange: vi.fn()
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
      />
    );

    const pageHeader = document.querySelector(".docsera-main__page-header");
    expect(pageHeader).toBeNull();
    expect(screen.getByRole("main", { name: "Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Page title" })).toBeNull();
    expect(onPageTitleStart).not.toHaveBeenCalled();
  });
});
