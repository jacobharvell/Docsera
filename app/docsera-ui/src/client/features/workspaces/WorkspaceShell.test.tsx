import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WorkspaceShell } from "./WorkspaceShell";

vi.mock("./WorkspaceSidebar", () => ({
  WorkspaceSidebar: ({ contentRevealState, navigationCollapsed, onSelectPage, onTogglePageSettings }: { contentRevealState?: string; navigationCollapsed?: boolean; onSelectPage?: (pageId: string) => void; onTogglePageSettings?: (pageId: string) => void }) => (
    <aside aria-label="Workspace navigation" data-reveal-state={contentRevealState} data-navigation-collapsed={String(navigationCollapsed)}>
      <button type="button" onClick={() => onSelectPage?.("page-one")}>Page one</button>
      <button type="button" onClick={() => onTogglePageSettings?.("page-one")}>Page one settings</button>
      <button type="button" onClick={() => onTogglePageSettings?.("page-two")}>Page two settings</button>
    </aside>
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
  it("keeps the navigation resizer above the main pane at every side-by-side width without changing scrollbar or stacked-layout behavior", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const css = nodeProcess.getBuiltinModule("fs").readFileSync(`${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`, "utf8").replace(/\r\n/g, "\n");
    expect(css).toMatch(/\.docsera-workspace__nav-frame\s*\{[^}]*position:\s*sticky;[^}]*z-index:\s*1;/);
    expect(css).not.toMatch(/@media \(min-width: 921px\) and \(max-width: 1180px\)\s*\{\s*\.docsera-workspace__nav-frame/);
    expect(css).toMatch(/@media \(max-width: 1180px\)\s*\{[\s\S]*?\.docsera-workspace[\s\S]*?grid-template-columns:\s*var\(--docsera-workspace-nav-track-width\) minmax\(0, 1fr\);/);
    expect(css).toMatch(/@media \(max-width: 920px\)\s*\{[\s\S]*?\.docsera-workspace,[\s\S]*?\.docsera-workspace--sidebar-collapsed\s*\{\s*grid-template-columns:\s*1fr;/);
    expect(css).toMatch(/\.docsera-workspace__nav-resizer\s*\{[^}]*right:\s*-6px;[^}]*width:\s*var\(--docsera-workspace-nav-resizer-width\)/);
    expect(css).toMatch(/\.docsera-sidebar__tree\s*\{[^}]*margin-right:\s*-9px;[^}]*overflow-y:\s*auto;/);
    expect(css).toMatch(/@media \(max-width: 920px\)[\s\S]*?\.docsera-workspace__nav-resizer\s*\{\s*display:\s*none;/);
    expect(css).toMatch(/\.docsera-workspace--sidebar-collapsed \.docsera-workspace__nav-frame:not\(\[data-docsera-compact-navigation-open="true"\]\)\s*\{[^}]*pointer-events:\s*none;/);
    expect(css).toMatch(/@media \(max-width: 920px\)[\s\S]*?\.docsera-workspace__nav-clip\s*\{\s*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*min-height:\s*0;/);
    expect(css).toMatch(/@media \(max-width: 920px\)[\s\S]*?\.docsera-workspace__nav-frame \.docsera-sidebar\s*\{[^}]*width:\s*100%;[^}]*min-height:\s*0;/);
    expect(css).toMatch(/\.docsera-header--compact \.docsera-header__bar,[\s\S]*?\.docsera-header--compact \.docsera-header__actions\s*\{\s*flex-wrap:\s*nowrap;/);
    expect(css).toMatch(/\.docsera-workspace--sidebar-resizing \.docsera-workspace__nav-resizer-pill\s*\{\s*opacity:\s*1;/);
  });

  it.each(["live", "edit"] as const)("resizes and clamps navigation in %s mode", (mode) => {
    const onWorkspaceNavWidthChange = vi.fn();
    const { container, rerender } = renderShell({ mode, onWorkspaceNavWidthChange });
    const resizer = screen.getByRole("button", { name: "Resize navigation panel" });
    fireEvent.mouseDown(resizer);
    expect(container.querySelector(".docsera-workspace")).toHaveClass("docsera-workspace--sidebar-resizing");
    fireEvent.mouseMove(window, { clientX: 100 });
    fireEvent.mouseMove(window, { clientX: 600 });
    expect(onWorkspaceNavWidthChange.mock.calls.map(([width]) => width)).toEqual([180, 480]);
    fireEvent.mouseUp(window);
    expect(container.querySelector(".docsera-workspace")).not.toHaveClass("docsera-workspace--sidebar-resizing");
    rerender(<WorkspaceShell {...createShellProps({ mode, sidebarCollapsed: true, onWorkspaceNavWidthChange })} />);
    fireEvent.mouseDown(resizer);
    fireEvent.mouseMove(window, { clientX: 300 });
    expect(onWorkspaceNavWidthChange).toHaveBeenCalledTimes(2);
  });
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

  it("opens a compact drawer with suppressed initial focus tooltip while preserving intentional focus tooltips", async () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const onDismiss = vi.fn();
    const { container, rerender } = renderShell({ sidebarCollapsed: true, compactNavigationOpen: false, onCompactNavigationDismiss: onDismiss });
    const navFrame = container.querySelector<HTMLElement>(".docsera-workspace__nav-frame")!;

    expect(navFrame).toHaveAttribute("aria-hidden", "true");
    expect(navFrame).toHaveAttribute("inert");
    expect(navFrame).toHaveAttribute("data-docsera-compact-navigation-open", "false");

    rerender(<WorkspaceShell {...createShellProps({ sidebarCollapsed: true, compactNavigationOpen: true, onCompactNavigationDismiss: onDismiss })} />);
    expect(navFrame).not.toHaveAttribute("aria-hidden");
    expect(navFrame).not.toHaveAttribute("inert");
    expect(navFrame).toHaveAttribute("data-docsera-compact-navigation-open", "true");
    const closeButton = container.querySelector<HTMLButtonElement>(".docsera-workspace__compact-nav-header button")!;
    expect(closeButton).toHaveFocus();
    expect(closeButton).not.toHaveAttribute("data-docsera-suppress-focus-tooltip");
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.blur(closeButton);
    fireEvent.focus(closeButton);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Close navigation");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onDismiss).toHaveBeenCalledTimes(1);
    window.matchMedia = originalMatchMedia;
  });

  it("uses a viewport-height compact drawer and scrim with a full-width identity divider", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const css = nodeProcess.getBuiltinModule("fs").readFileSync(`${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`, "utf8");

    expect(css).toMatch(/\.docsera-workspace__nav-scrim\s*\{[^}]*inset:\s*0;/s);
    expect(css).toMatch(/\.docsera-workspace__nav-frame\s*\{[^}]*position:\s*fixed;[^}]*inset:\s*0 auto 0 0;[^}]*height:\s*100dvh;/s);
    expect(css).toMatch(/@media \(max-width: 920px\)[\s\S]*?\.docsera-workspace__nav-frame\s*\{[^}]*background:\s*var\(--docsera-surface\);/);
    expect(css).toMatch(/:root\s*\{[^}]*--docsera-surface:\s*#ffffff;/s);
    expect(css).toMatch(/:root\[data-docsera-theme="dark"\]\s*\{[^}]*--docsera-surface:\s*#161b22;/s);
    expect(css).toMatch(/\.docsera-workspace__nav-frame\s*\{[^}]*background:\s*var\(--docsera-workspace-nav-bg, var\(--docsera-surface-sidebar\)\);/);
    expect(css).toMatch(/\.docsera-workspace__compact-nav-header\s*\{[^}]*min-height:\s*var\(--docsera-header-height\);[^}]*border-bottom:\s*1px solid var\(--docsera-border\);/s);
    expect(css).toMatch(/\.docsera-workspace__compact-nav-header > button\s*\{/);
    expect(css).not.toMatch(/\.docsera-workspace__compact-nav-header button\s*\{/);
  });

  it("keeps a desktop-collapsed compact drawer interactive, sized independently, and restores its trigger only after dismissal", () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const onDismiss = vi.fn();
    const onSelectPage = vi.fn();
    const trigger = document.createElement("button");
    const compactNavigationTriggerRef = { current: trigger };
    document.body.append(trigger);
    const props = { sidebarCollapsed: true, compactNavigationOpen: true, onCompactNavigationDismiss: onDismiss, onSelectPage, compactNavigationTriggerRef, workspaceNavWidth: 480 };
    const { container, rerender, unmount } = renderShell(props);

    try {
      const navFrame = container.querySelector<HTMLElement>(".docsera-workspace__nav-frame")!;
      expect(navFrame).not.toHaveAttribute("inert");
      expect(navFrame).toHaveAttribute("data-docsera-compact-navigation-open", "true");
      expect(screen.getByRole("complementary", { name: "Workspace navigation" })).toHaveAttribute("data-navigation-collapsed", "false");

      fireEvent.keyDown(document, { key: "Escape" });
      expect(onDismiss).toHaveBeenCalledTimes(1);
      expect(trigger).toHaveFocus();
      expect(trigger).toHaveAttribute("data-docsera-suppress-focus-tooltip", "true");

      rerender(<WorkspaceShell {...createShellProps(props)} />);
      fireEvent.click(container.querySelector<HTMLButtonElement>(".docsera-workspace__compact-nav-header button")!);
      expect(trigger).toHaveFocus();

      rerender(<WorkspaceShell {...createShellProps(props)} />);
      fireEvent.click(container.querySelector<HTMLButtonElement>(".docsera-workspace__nav-scrim")!);
      expect(trigger).toHaveFocus();

      rerender(<WorkspaceShell {...createShellProps(props)} />);
      const page = screen.getByRole("button", { name: "Page one" });
      page.focus();
      fireEvent.click(page);
      expect(onSelectPage).toHaveBeenCalledWith("page-one");
      expect(page).toHaveFocus();
    } finally {
      unmount();
      trigger.remove();
      window.matchMedia = originalMatchMedia;
    }
  });

  it("hands compact drawer Page Settings requests to the shell owner for the current or another page", () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const onCompactNavigationDismiss = vi.fn();
    const onCompactPageSettingsOpenFromNavigation = vi.fn();
    const onTogglePageSettings = vi.fn();
    const props = { compactNavigationOpen: true, onCompactNavigationDismiss, onCompactPageSettingsOpenFromNavigation, onTogglePageSettings, selectedPageId: "page-one" };
    const { rerender, unmount } = renderShell(props);

    try {
      fireEvent.click(screen.getByRole("button", { name: "Page one settings" }));
      expect(onCompactPageSettingsOpenFromNavigation).toHaveBeenCalledTimes(1);
      expect(onCompactNavigationDismiss).not.toHaveBeenCalled();
      expect(onTogglePageSettings).toHaveBeenLastCalledWith("page-one");

      rerender(<WorkspaceShell {...createShellProps(props)} />);
      fireEvent.click(screen.getByRole("button", { name: "Page two settings" }));
      expect(onCompactPageSettingsOpenFromNavigation).toHaveBeenCalledTimes(2);
      expect(onCompactNavigationDismiss).not.toHaveBeenCalled();
      expect(onTogglePageSettings).toHaveBeenLastCalledWith("page-two");
    } finally {
      unmount();
      window.matchMedia = originalMatchMedia;
    }
  });

  it("keeps compact modal headers horizontal and bounds short-viewport dialogs without changing settings panels", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const css = nodeProcess.getBuiltinModule("fs").readFileSync(`${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`, "utf8");

    expect(css).toMatch(/\.docsera-modal__title\s*\{[^}]*min-width:\s*0;[^}]*overflow-wrap:\s*anywhere;/s);
    expect(css).toMatch(/\.docsera-modal__close\s*\{[^}]*flex:\s*0 0 auto;/s);
    expect(css).not.toMatch(/@media \(max-width: 680px\)[\s\S]*?\.docsera-modal__header\s*\{[^}]*flex-direction:\s*column;/s);
    expect(css).toMatch(/\.docsera-modal__panel\s*\{[^}]*max-height:\s*calc\(100dvh - 48px\);[^}]*overflow-y:\s*auto;/s);
    expect(css).toMatch(/\.docsera-manage-access__add-panel\s*\{[^}]*height:\s*min\(760px, calc\(100dvh - 48px\)\);/s);
    expect(css).toMatch(/\.docsera-manage-access__add-body\s*\{[^}]*--docsera-manage-access-add-list-height:\s*clamp\(160px, 46dvh, 420px\);/s);
    expect(css).toMatch(/\.docsera-workspace-settings-overlay__body\s*\{[^}]*overflow-x:\s*clip;[^}]*overflow-y:\s*auto;/s);
    expect(css).toMatch(/\.docsera-manage-access__body\s*\{[^}]*overflow:\s*auto;/s);
    expect(css).toMatch(/\.docsera-header--compact\s*\{[^}]*height:\s*var\(--docsera-header-height\);[^}]*min-height:\s*var\(--docsera-header-height\);[^}]*border-bottom-color:\s*color-mix\(in srgb, var\(--docsera-text\) 12%, var\(--docsera-border\)\);/s);
    expect(css).toMatch(/\.docsera-header\s*\{[^}]*border-bottom:\s*1px solid var\(--docsera-border\);/s);
    expect(css).toMatch(/@media \(max-width: 920px\)[\s\S]*?\.docsera-page-settings-shell\s*\{[^}]*inset:\s*0 auto 0 0;/s);
    expect(css).toMatch(/@media \(max-width: 680px\)[\s\S]*?\.docsera-manage-access__add-transfer\s*\{[^}]*flex-direction:\s*row;[^}]*justify-content:\s*center;/s);
    expect(css).toMatch(/\.docsera-manage-access__move-button\[aria-label="Stage selected users"\] \.docsera-manage-access__move-icon\s*\{\s*transform:\s*rotate\(90deg\);\s*\}/);
    expect(css).toMatch(/\.docsera-manage-access__move-button\[aria-label="Remove selected staged members"\] \.docsera-manage-access__move-icon\s*\{\s*transform:\s*rotate\(-90deg\);\s*\}/);
  });

  it("keeps compact drawer identity aligned to the shared switcher without nested padding or width caps", () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
    const { container, unmount } = renderShell({
      compactNavigationHeader: <button type="button" className="docsera-header__workspace-button"><span>Docs</span><span className="docsera-header__workspace-chevron" /></button>,
      compactNavigationOpen: true
    });
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const css = nodeProcess.getBuiltinModule("fs").readFileSync(`${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`, "utf8");

    expect(css).toMatch(/\.docsera-workspace__compact-nav-header\s*\{[^}]*min-height:\s*var\(--docsera-header-height\);[^}]*border-bottom:\s*1px solid var\(--docsera-border\);[^}]*\}/s);
    expect(css).not.toMatch(/\.docsera-workspace__compact-nav-header\s*\{[^}]*padding:/s);
    expect(css).toMatch(/\.docsera-workspace__compact-nav-header > button\s*\{[^}]*margin-left:\s*12px;/s);
    expect(css).toMatch(/\.docsera-workspace__compact-nav-identity\s*\{[^}]*flex:\s*1;/s);
    expect(css).toMatch(/\.docsera-compact-workspace-switcher \.docsera-header__workspace-button\s*\{\s*width:\s*100%;\s*padding-left:\s*8px;\s*\}/);
    expect(css).not.toMatch(/\.docsera-compact-workspace-switcher \.docsera-header__workspace-button\s*\{[^}]*max-width:/s);
    expect(css).toMatch(/\.docsera-compact-workspace-switcher \.docsera-header__workspace-button:not\(:disabled\):hover\s*\{\s*background:\s*transparent;\s*\}/);
    try {
      const closeButton = container.querySelector<HTMLButtonElement>(".docsera-workspace__compact-nav-header > button");
      expect(closeButton).toHaveAccessibleName("Close navigation");
      expect(closeButton).toHaveClass("docsera-header__ghost-button--sidebar-toggle");
      expect(closeButton).not.toHaveTextContent("×");
      expect(container.querySelector(".docsera-workspace__compact-nav-identity .docsera-header__workspace-chevron")).toBeInTheDocument();
    } finally {
      unmount();
      window.matchMedia = originalMatchMedia;
    }
  });
});
