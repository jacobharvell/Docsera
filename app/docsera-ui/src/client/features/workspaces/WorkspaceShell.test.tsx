import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceShell } from "./WorkspaceShell";

vi.mock("./WorkspaceSidebar", () => ({
  WorkspaceSidebar: ({ contentRevealState }: { contentRevealState?: string }) => (
    <aside aria-label="Workspace navigation" data-reveal-state={contentRevealState} />
  )
}));

vi.mock("./WorkspaceMainPane", () => ({
  WorkspaceMainPane: () => <main aria-label="Workspace page" />
}));

vi.mock("./WorkspaceToc", () => ({
  WorkspaceToc: ({ contentRevealState }: { contentRevealState?: string }) => (
    <aside aria-label="Page outline" data-reveal-state={contentRevealState} />
  )
}));

function createShellProps(overrides: Partial<Parameters<typeof WorkspaceShell>[0]> = {}): Parameters<typeof WorkspaceShell>[0] {
  const noop = vi.fn();

  return {
    bodyState: "ready",
    canCreatePage: true,
    createPageDisabledReason: "",
    canEditPageBody: true,
    canManagePageSettings: true,
    collapsedPageIds: [],
    currentWorkspaceSlug: "docs",
    editAccessLost: false,
    editorFailure: null,
    inlineCreateState: null,
    inlineRenameErrorMessage: "",
    inlineRenamePageId: "",
    inlineRenameValue: "",
    isCreatingPage: false,
    mode: "edit",
    onAccessLost: noop,
    onCollapsedPageIdsChange: noop,
    onCancelInlineRename: noop,
    onCommitInlineCreate: noop,
    onCommitInlineRename: () => true,
    onEditorFailureChange: noop,
    onEditorReadyStateChange: noop,
    onInlineCreateTitleChange: noop,
    onInlineRenameTitleChange: noop,
    onModeChange: noop,
    onOutlineChange: noop,
    onPageTitleCancel: noop,
    onPageTitleChange: noop,
    onPageTitleCommit: noop,
    onPageTitleStart: noop,
    onReturnToMyWorkspaces: noop,
    onReturnToLive: noop,
    onRetryEditor: noop,
    onSavePageDraft: vi.fn().mockResolvedValue({ state: "saved" }),
    onStatusChange: noop,
    onSelectPage: noop,
    onRequestDeletePage: noop,
    onStartInlineRename: noop,
    onShowChildPageCreate: noop,
    onShowCreatePage: noop,
    onTogglePageSettings: noop,
    onToggleTheme: noop,
    outlinePage: null,
    pageSettingsOpenPageId: "",
    pageTitleActive: false,
    selectedPage: null,
    selectedPageId: "",
    sidebarCollapsed: false,
    showEditModeToggle: true,
    showCreatePageControls: true,
    sessionKey: "workspace-session",
    shellStatus: "ready",
    shellTitle: "Docs",
    shellCopy: "",
    showPendingState: false,
    workspaceNavWidth: 280,
    onSidebarCollapsedChange: noop,
    onWorkspaceNavWidthChange: noop,
    theme: "light",
    treeFilter: "",
    treePages: [],
    workspaceTocAvailable: false,
    onTreeFilterChange: noop,
    ...overrides
  };
}

function renderShell(overrides: Partial<Parameters<typeof WorkspaceShell>[0]> = {}) {
  return render(<WorkspaceShell {...createShellProps(overrides)} />);
}

describe("WorkspaceShell", () => {
  it("keeps the stored navigation width stable while the animated track collapses", () => {
    const { container, rerender } = renderShell({ sidebarCollapsed: false, workspaceNavWidth: 312 });
    const shell = container.querySelector<HTMLElement>(".docsera-shell");

    expect(shell).toHaveStyle({
      "--docsera-workspace-content-nav-width": "312px",
      "--docsera-workspace-nav-width": "312px",
      "--docsera-workspace-nav-track-width": "312px",
      "--docsera-workspace-nav-resizer-width": "8px"
    });

    rerender(<WorkspaceShell {...createShellProps({ sidebarCollapsed: true, workspaceNavWidth: 312 })} />);

    expect(shell).toHaveStyle({
      "--docsera-workspace-content-nav-width": "0px",
      "--docsera-workspace-nav-width": "312px",
      "--docsera-workspace-nav-track-width": "0px",
      "--docsera-workspace-nav-resizer-width": "0px"
    });
  });

  it("keeps the navigation resizer accessible without a tooltip", async () => {
    renderShell();

    const resizer = screen.getByRole("button", { name: "Resize navigation panel" });

    expect(resizer).toBeEnabled();
    expect(resizer).not.toHaveAttribute("title");

    fireEvent.focus(resizer);
    fireEvent.mouseOver(resizer);
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  });

  it("passes content reveal state only into navigation content regions", () => {
    renderShell({ contentRevealState: "enter", workspaceTocAvailable: true });

    expect(screen.getByRole("complementary", { name: "Workspace navigation" })).toHaveAttribute("data-reveal-state", "enter");
    expect(screen.getByRole("complementary", { name: "Page outline" })).toHaveAttribute("data-reveal-state", "enter");
    expect(screen.getByRole("button", { name: "Resize navigation panel" })).not.toHaveAttribute("data-reveal-state");
  });
});
