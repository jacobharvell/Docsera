/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceMainPane } from "./WorkspaceMainPane";
import type { WorkspacePageView } from "./workspaceViewModels";

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
        editAccessLost={false}
        stateCopy=""
        stateTitle=""
        stateType="ready"
        showPendingState={false}
        onReturnToMyWorkspaces={vi.fn()}
        onReturnToLive={vi.fn()}
        onRetryEditor={vi.fn()}
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
          editAccessLost={false}
          stateCopy=""
          stateTitle=""
          stateType="ready"
          showPendingState={false}
          onReturnToMyWorkspaces={vi.fn()}
          onReturnToLive={vi.fn()}
          onRetryEditor={vi.fn()}
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
    expect((pageHeader as HTMLElement).querySelector(".docsera-main__editor-controls")).toBeNull();
    await waitFor(() => {
      expect(host.shadowRoot).not.toBeNull();
      expect(host.shadowRoot?.querySelector(".docsera-editor-runtime")).not.toBeNull();
      expect(host.shadowRoot?.querySelector(".ProseMirror[contenteditable='true']")).not.toBeNull();
    });

    const runtimeRoot = host.shadowRoot?.querySelector(".docsera-editor-runtime");
    const runtimeStyle = host.shadowRoot?.querySelector("style")?.textContent ?? "";
    const proseMirror = host.shadowRoot?.querySelector(".ProseMirror");
    expect(runtimeRoot).toBeInTheDocument();
    expect(proseMirror).toBeInTheDocument();
    expect(host.shadowRoot?.querySelector(".docsera-main__authoring-controls")).toBeNull();
    expect(host.shadowRoot?.textContent ?? "").not.toContain("The selected page is using the shared workspace draft representation.");
    expect(host.shadowRoot?.textContent ?? "").not.toContain("Canonical TipTap content is isolated inside the production child host and saved explicitly during E2.");
    expect(runtimeStyle).not.toContain("padding: 22px");
    expect(runtimeStyle).not.toContain("border-radius: 24px");
    expect(runtimeStyle).not.toContain("box-shadow: 0 18px 48px");
    expect(runtimeStyle).not.toContain("--docsera-editor-surface");
    expect(runtimeStyle).not.toContain(".docsera-editor-runtime__overlay");
    expect(runtimeStyle).not.toContain(".docsera-editor-runtime__overlay-button");
    expect(runtimeStyle).not.toContain(".docsera-editor-runtime__save-button");
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
      editAccessLost: false,
      stateCopy: "",
      stateTitle: "",
      stateType: "ready" as const,
      showPendingState: false,
      onReturnToMyWorkspaces: vi.fn(),
      onReturnToLive: vi.fn(),
      onRetryEditor: vi.fn(),
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
        editAccessLost={false}
        stateCopy=""
        stateTitle=""
        stateType="ready"
        showPendingState={false}
        onReturnToMyWorkspaces={vi.fn()}
        onReturnToLive={vi.fn()}
        onRetryEditor={vi.fn()}
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
});
