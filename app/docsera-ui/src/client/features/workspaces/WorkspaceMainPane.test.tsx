/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceMainPane } from "./WorkspaceMainPane";
import type { WorkspacePageView } from "./workspaceViewModels";

function createPageView(breakType: "hardBreak" | "hard_break"): WorkspacePageView {
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
              { type: breakType },
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

describe("WorkspaceMainPane", () => {
  it.each([
    ["canonical hardBreak", "hardBreak" as const],
    ["legacy hard_break", "hard_break" as const]
  ])("renders %s as a visible line break in the live reader", (_label, breakType) => {
    const page = createPageView(breakType);
    const view = render(
      <WorkspaceMainPane
        page={page}
        pagePath={[]}
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
    expect(within(reader).getByText("Alpha")).toBeInTheDocument();
    expect(within(reader).getByText("Beta")).toBeInTheDocument();
    expect(reader.querySelectorAll("br")).toHaveLength(1);

    view.unmount();
  });
});
