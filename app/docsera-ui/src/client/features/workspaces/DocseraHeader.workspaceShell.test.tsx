import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocseraHeader } from "./DocseraHeader";

const baseProps = {
  identity: { kind: "workspace" as const, icon: { type: "builtin" as const, key: "docs", label: "Docs" }, name: "Docs" },
  mode: "workspace" as const,
  onOpenMyWorkspaces: vi.fn(),
  onOpenWorkspace: vi.fn(),
  onToggleTheme: vi.fn(),
  onWorkspaceModeChange: vi.fn(),
  recentWorkspaces: [],
  showEditModeToggle: true,
  showAuthoringSurfaceToggle: true,
  showWorkspaceMode: "edit" as const,
  theme: "light" as const
};

describe("DocseraHeader workspace shell", () => {
  it("keeps the persistent workspace label truncated inside the header identity block", () => {
    const longName = "Engineering Platform Documentation Workspace for Release Readiness and Partner Enablement";

    render(
      <DocseraHeader
        {...baseProps}
        identity={{
          kind: "workspace",
          icon: { type: "builtin", key: "docs", label: "Docs" },
          name: longName
        }}
      />
    );

    const workspaceButton = screen.getByRole("button", { name: longName });
    const workspaceName = screen.getByTitle(longName);

    expect(workspaceButton).toContainElement(workspaceName);
    expect(workspaceName).toHaveClass("docsera-header__workspace-name");
    expect(workspaceName.parentElement).toHaveClass("docsera-header__workspace-copy");
    expect(workspaceButton.querySelector(".docsera-header__workspace-copy")).toContainElement(workspaceName);
  });

  it("renders the workspace mode control beside the surface toggle inside the right-side header cluster", () => {
    const { container } = render(
      <DocseraHeader
        {...baseProps}
        authoringSurface="markdown"
        onAuthoringSurfaceChange={vi.fn()}
        pendingChanges={{ affectedPageCount: 0, changeSetId: "change-set-001", changeSetRevision: 2, rows: [], state: "succeeded", workspaceSysId: "workspace-001" }}
      />
    );

    expect(screen.getByRole("group", { name: "Workspace mode" })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /saved/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No pending changes to publish" })).toBeDisabled();

    const actions = container.querySelector(".docsera-header__actions");
    const modeSlot = container.querySelector<HTMLElement>(".docsera-header__action-slot--mode");
    const divider = container.querySelector<HTMLElement>(".docsera-header__action-divider--mode-surface");
    const surfaceSlot = container.querySelector<HTMLElement>(".docsera-header__action-slot--surface");

    expect(actions).toContainElement(modeSlot);
    expect(actions).toContainElement(divider);
    expect(actions).toContainElement(surfaceSlot);

    const actionChildren = Array.from(actions?.children ?? []);
    const modeIndex = actionChildren.indexOf(modeSlot as Element);
    const dividerIndex = actionChildren.indexOf(divider as Element);
    const surfaceIndex = actionChildren.indexOf(surfaceSlot as Element);

    expect(modeIndex).toBeGreaterThanOrEqual(0);
    expect(dividerIndex).toBeGreaterThan(modeIndex);
    expect(surfaceIndex).toBeGreaterThan(dividerIndex);
  });

  it("reserves the authoring-control footprint in live while hiding edit-only controls from accessibility", () => {
    const editRender = render(
      <DocseraHeader
        {...baseProps}
        authoringSurface="visual"
        onAuthoringSurfaceChange={vi.fn()}
        pendingChanges={{ affectedPageCount: 0, changeSetId: "change-set-001", changeSetRevision: 2, rows: [], state: "succeeded", workspaceSysId: "workspace-001" }}
        saveStatus="Saved"
        showWorkspaceMode="edit"
      />
    );

    expect(editRender.getByRole("group", { name: "Workspace mode" })).toBeInTheDocument();
    expect(editRender.getByRole("status", { name: "Current page changes saved" })).toBeInTheDocument();

    const editActionChildren = Array.from(editRender.container.querySelector(".docsera-header__actions")?.children ?? []);
    const editPublishPanel = editRender.container.querySelector<HTMLElement>(".docsera-header__publish-panel");
    const editSaveStatus = editRender.container.querySelector<HTMLElement>(".docsera-header__save-status");
    const editPublishDivider = editRender.container.querySelector<HTMLElement>(".docsera-header__publish-divider");
    const editPublishButton = editRender.container.querySelector<HTMLElement>(".docsera-header__publish-button");
    const editModeSlot = editRender.container.querySelector<HTMLElement>(".docsera-header__action-slot--mode");
    const editDivider = editRender.container.querySelector<HTMLElement>(".docsera-header__action-divider--mode-surface");
    const editSurfaceSlot = editRender.container.querySelector<HTMLElement>(".docsera-header__action-slot--surface");

    expect(editModeSlot).not.toBeNull();
    expect(editDivider).not.toBeNull();
    expect(editSurfaceSlot).not.toBeNull();
    expect(editPublishPanel).not.toBeNull();
    expect(editSaveStatus).not.toBeNull();
    expect(editPublishDivider).not.toBeNull();
    expect(editPublishButton).not.toBeNull();
    expect(editRender.container.querySelector(".docsera-header__publish-panel")).not.toHaveClass("docsera-header__publish-panel--hidden");
    expect(editPublishPanel).not.toHaveAttribute("aria-hidden", "true");

    expect(editActionChildren.map((child) => (child as HTMLElement).className)).toEqual([
      "docsera-header__action-slot docsera-header__action-slot--mode",
      "docsera-header__action-divider docsera-header__action-divider--mode-surface",
      "docsera-header__action-slot docsera-header__action-slot--surface",
      "docsera-header__publish-panel",
      "docsera-header__ghost-button docsera-header__ghost-button--theme",
      "docsera-header__action-slot docsera-header__action-slot--settings",
      "docsera-header__profile"
    ]);
    expect(Array.from(editPublishPanel?.children ?? []).map((child) => (child as HTMLElement).className)).toEqual([
      "docsera-header__save-status docsera-header__save-status--saved",
      "docsera-header__publish-divider",
      "docsera-header__publish-button"
    ]);
    expect(editPublishPanel).toContainElement(editSaveStatus);
    expect(editPublishPanel).toContainElement(editPublishDivider);
    expect(editPublishPanel).toContainElement(editPublishButton);

    editRender.unmount();

    const liveRender = render(
      <DocseraHeader
        {...baseProps}
        authoringSurface="visual"
        onAuthoringSurfaceChange={vi.fn()}
        pendingChanges={{ affectedPageCount: 0, changeSetId: "change-set-001", changeSetRevision: 2, rows: [], state: "succeeded", workspaceSysId: "workspace-001" }}
        showAuthoringSurfaceToggle={false}
        showWorkspaceMode="live"
      />
    );

    expect(screen.getByRole("group", { name: "Workspace mode" })).toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Authoring surface" })).not.toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Current page changes saved" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Publish" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Visual" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Markdown" })).not.toBeInTheDocument();

    const liveActionChildren = Array.from(liveRender.container.querySelector(".docsera-header__actions")?.children ?? []);
    const livePublishPanel = liveRender.container.querySelector<HTMLElement>(".docsera-header__publish-panel");
    const liveSaveStatus = liveRender.container.querySelector<HTMLElement>(".docsera-header__save-status");
    const livePublishDivider = liveRender.container.querySelector<HTMLElement>(".docsera-header__publish-divider");
    const livePublishButton = liveRender.container.querySelector<HTMLElement>(".docsera-header__publish-button");
    const liveModeSlot = liveRender.container.querySelector<HTMLElement>(".docsera-header__action-slot--mode");
    const liveDivider = liveRender.container.querySelector<HTMLElement>(".docsera-header__action-divider--mode-surface");
    const liveSurfaceSlot = liveRender.container.querySelector<HTMLElement>(".docsera-header__action-slot--surface");

    expect(liveModeSlot).not.toBeNull();
    expect(liveDivider).not.toBeNull();
    expect(liveSurfaceSlot).not.toBeNull();
    expect(livePublishPanel).not.toBeNull();
    expect(liveSaveStatus).not.toBeNull();
    expect(livePublishDivider).not.toBeNull();
    expect(livePublishButton).not.toBeNull();
    expect(livePublishPanel).toHaveClass("docsera-header__publish-panel--hidden");
    expect(livePublishPanel).toHaveAttribute("aria-hidden", "true");
    expect(liveSaveStatus).toHaveClass("docsera-header__save-status--reserved");
    expect(liveSaveStatus).toHaveAttribute("aria-hidden", "true");
    expect(liveActionChildren.map((child) => (child as HTMLElement).className)).toEqual([
      "docsera-header__action-slot docsera-header__action-slot--mode",
      "docsera-header__action-divider docsera-header__action-divider--mode-surface docsera-header__action-divider--hidden",
      "docsera-header__action-slot docsera-header__action-slot--surface",
      "docsera-header__publish-panel docsera-header__publish-panel--hidden",
      "docsera-header__ghost-button docsera-header__ghost-button--theme",
      "docsera-header__action-slot docsera-header__action-slot--settings",
      "docsera-header__profile"
    ]);
    expect(Array.from(livePublishPanel?.children ?? []).map((child) => (child as HTMLElement).className)).toEqual([
      "docsera-header__save-status docsera-header__save-status--reserved",
      "docsera-header__publish-divider",
      "docsera-header__publish-button"
    ]);
    expect(livePublishPanel).toContainElement(liveSaveStatus);
    expect(livePublishPanel).toContainElement(livePublishDivider);
    expect(livePublishPanel).toContainElement(livePublishButton);
    expect(livePublishButton).toBeDisabled();
    for (const button of liveRender.container.querySelectorAll<HTMLButtonElement>(".docsera-header__surface-segment")) {
      expect(button).toBeDisabled();
    }
  });
});
