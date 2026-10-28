import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocseraHeader } from "./DocseraHeader";

const baseProps = {
  identity: { kind: "workspace" as const, icon: { type: "builtin" as const, key: "docs", label: "Docs" }, name: "Docs" },
  mode: "workspace" as const,
  onOpenMyWorkspaces: vi.fn(),
  onOpenWorkspace: vi.fn(),
  onToggleTheme: vi.fn(),
  onWorkspaceModeChange: vi.fn(),
  currentUser: { userDisplayName: "Priya Writer", userName: "pwriter" },
  recentWorkspaces: [],
  showEditModeToggle: true,
  showAuthoringSurfaceToggle: true,
  showWorkspaceMode: "edit" as const,
  theme: "light" as const
};

describe("DocseraHeader workspace shell", () => {
  it("uses shared tooltips for compact workspace header controls", async () => {
    render(
      <DocseraHeader
        {...baseProps}
        authoringSurface="visual"
        onAuthoringSurfaceChange={vi.fn()}
        onOpenWorkspaceSettings={vi.fn()}
        onToggleSidebar={vi.fn()}
        showWorkspaceSettings
      />
    );

    const collapseButton = screen.getByRole("button", { name: "Collapse navigation" });
    const visualButton = screen.getByRole("button", { name: "Visual" });
    const settingsButton = screen.getByRole("button", { name: "Workspace settings" });
    const themeButton = screen.getByRole("button", { name: "Toggle theme" });

    expect(collapseButton).not.toHaveAttribute("title");
    expect(visualButton).not.toHaveAttribute("title");
    expect(settingsButton).not.toHaveAttribute("title");
    expect(themeButton).not.toHaveAttribute("title");

    fireEvent.focus(settingsButton);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Workspace settings");
    expect(settingsButton).toHaveAccessibleName("Workspace settings");
  });

  it("renders ordinary navigation controls with the classes covered by primary-accent hover styles", () => {
    const { container } = render(
      <DocseraHeader
        {...baseProps}
        onOpenWorkspaceSettings={vi.fn()}
        onToggleSidebar={vi.fn()}
        recentWorkspaces={[{ icon: { type: "builtin", key: "docs", label: "Docs" }, name: "Docs", slug: "docs" }]}
        showWorkspaceSettings
        showWorkspaceSwitcher
      />
    );

    const workspaceButton = screen.getByRole("button", { name: "Workspace switcher: Docs" });
    expect(workspaceButton).toHaveClass("docsera-header__workspace-button");
    expect(workspaceButton.querySelector(".docsera-header__workspace-icon")).toBeInTheDocument();
    expect(workspaceButton.querySelector(".docsera-header__workspace-chevron")).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "Collapse navigation" })).toHaveClass(
      "docsera-header__ghost-button",
      "docsera-header__ghost-button--sidebar-toggle"
    );
    expect(screen.getByRole("button", { name: "Workspace settings" })).toHaveClass("docsera-header__ghost-button");
    expect(screen.getByRole("button", { name: "Toggle theme" })).toHaveClass(
      "docsera-header__ghost-button",
      "docsera-header__ghost-button--theme"
    );
    expect(container.querySelector(".docsera-header__profile")).toBeInTheDocument();
  });

  it("keeps the workspace icon slot empty while workspace identity is unresolved", () => {
    const { container } = render(
      <DocseraHeader
        {...baseProps}
        identity={{ kind: "workspace-loading" }}
      />
    );

    const workspaceButton = screen.getByRole("button", { name: "Loading workspace" });
    const iconSlot = workspaceButton.querySelector(".docsera-header__workspace-icon");

    expect(iconSlot).toHaveClass("docsera-header__workspace-icon--empty");
    expect(iconSlot).not.toHaveClass("docsera-header__workspace-icon--loading");
    expect(iconSlot).toBeEmptyDOMElement();
    expect(iconSlot?.querySelector("img, svg")).not.toBeInTheDocument();
    expect(container.querySelector(".docsera-header__workspace-name-skeleton")).toBeInTheDocument();
  });

  it("shows the leading action-cluster divider in edit and hides only its paint in live", () => {
    const editRender = render(<DocseraHeader {...baseProps} showWorkspaceMode="edit" />);
    expect(editRender.container.querySelector(".docsera-header")).not.toHaveClass("docsera-header--live");
    expect(editRender.container.querySelector(".docsera-header")).not.toHaveClass("docsera-header--launcher");
    editRender.unmount();

    const liveRender = render(<DocseraHeader {...baseProps} showWorkspaceMode="live" />);
    expect(liveRender.container.querySelector(".docsera-header")).toHaveClass("docsera-header--live");
    expect(liveRender.container.querySelector(".docsera-header")).not.toHaveClass("docsera-header--launcher");
  });

  it("fades retained edit controls without leaving them interactive in Live mode", () => {
    const openSettings = vi.fn();
    const { rerender } = render(
      <DocseraHeader
        {...baseProps}
        authoringSurface="visual"
        onAuthoringSurfaceChange={vi.fn()}
        onOpenWorkspaceSettings={openSettings}
        saveStatus="Saved"
        showWorkspaceSettings
      />
    );

    const surface = screen.getByRole("group", { name: "Authoring surface" });
    const publishPanel = document.querySelector(".docsera-header__publish-panel");
    const settings = screen.getByRole("button", { name: "Workspace settings" });
    const settingsControl = settings.closest<HTMLElement>(".docsera-header__contextual-control");
    expect(settingsControl).not.toBeNull();
    expect(surface).not.toHaveAttribute("inert");
    expect(publishPanel).not.toHaveAttribute("inert");
    expect(settings).toBeEnabled();

    rerender(
      <DocseraHeader
        {...baseProps}
        authoringSurface="visual"
        onAuthoringSurfaceChange={vi.fn()}
        onOpenWorkspaceSettings={openSettings}
        saveStatus="Saved"
        showWorkspaceMode="live"
      />
    );

    expect(surface).toHaveAttribute("inert");
    expect(surface).toHaveAttribute("aria-hidden", "true");
    expect(publishPanel).toHaveAttribute("inert");
    expect(publishPanel).toHaveAttribute("aria-hidden", "true");
    expect(settings).toBeDisabled();
    expect(settingsControl).toHaveAttribute("inert");
    fireEvent.click(settings);
    expect(openSettings).not.toHaveBeenCalled();
  });

  it("computes retained Settings opacity for both workspace modes", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(`${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`, "utf8");
    const style = document.createElement("style");
    style.textContent = source;
    document.head.append(style);
    const { rerender } = render(
      <DocseraHeader {...baseProps} onOpenWorkspaceSettings={vi.fn()} showWorkspaceSettings />
    );
    const settings = screen.getByRole("button", { name: "Workspace settings" });
    const settingsControl = settings.closest<HTMLElement>(".docsera-header__contextual-control");
    expect(settingsControl).not.toBeNull();

    try {
      expect(getComputedStyle(settingsControl!).opacity).toBe("1");

      rerender(<DocseraHeader {...baseProps} onOpenWorkspaceSettings={vi.fn()} showWorkspaceMode="live" />);
      expect(getComputedStyle(settingsControl!).opacity).toBe("0");
    } finally {
      style.remove();
    }
  });

  it("keeps contextual-control transitions scoped away from mode and account controls under reduced motion", () => {
    const nodeProcess = new Function("return process")() as { cwd: () => string; getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string } };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(`${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`, "utf8");
    expect(source).toContain("opacity 180ms ease");
    expect(source).toContain("animation: docsera-contextual-control-enter 260ms ease-out both;");
    expect(source).toContain(".docsera-header__contextual-control");
    expect(source).toContain(".docsera-main__editor-history-controls-mount[data-docsera-contextual-control-presentation=\"pending\"]");
    expect(source).toContain(".docsera-main__editor-history-controls-mount[data-docsera-contextual-control-presentation=\"enter\"]");
    expect(source).toContain("animation: none;");
  });

  it("keeps the header navigation track aligned to a non-default workspace navigation width", () => {
    const { container, rerender } = render(
      <DocseraHeader
        {...baseProps}
        onToggleSidebar={vi.fn()}
        workspaceNavWidth={344}
      />
    );

    const header = container.querySelector<HTMLElement>(".docsera-header");
    expect(header).toHaveStyle({
      "--docsera-workspace-nav-track-width": "344px",
      "--docsera-workspace-nav-width": "344px"
    });
    expect(header).not.toHaveClass("docsera-header--sidebar-collapsed");

    rerender(
      <DocseraHeader
        {...baseProps}
        onToggleSidebar={vi.fn()}
        sidebarCollapsed
        workspaceNavWidth={344}
      />
    );

    expect(header).toHaveStyle({
      "--docsera-workspace-nav-track-width": "0px",
      "--docsera-workspace-nav-width": "344px"
    });
    expect(header).toHaveClass("docsera-header--sidebar-collapsed");

    rerender(
      <DocseraHeader
        {...baseProps}
        onToggleSidebar={vi.fn()}
        workspaceNavWidth={344}
      />
    );

    expect(header).toHaveStyle({
      "--docsera-workspace-nav-track-width": "344px",
      "--docsera-workspace-nav-width": "344px"
    });
    expect(header).not.toHaveClass("docsera-header--sidebar-collapsed");
  });

  it("marks launcher headers so their account divider paint can be suppressed", () => {
    const { container } = render(
      <DocseraHeader
        {...baseProps}
        identity={{ kind: "docsera", icon: { type: "builtin", key: "docsera-workspace", label: "Docsera" }, name: "Docsera" }}
        mode="launcher"
        showEditModeToggle={false}
      />
    );

    expect(container.querySelector(".docsera-header")).toHaveClass("docsera-header--launcher");
    expect(container.querySelector(".docsera-header")).not.toHaveClass("docsera-header--live");
  });

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
      "docsera-header__action-slot docsera-header__action-slot--settings",
      "docsera-header__ghost-button docsera-header__ghost-button--theme",
      "docsera-header__account"
    ]);
    expect(Array.from(editPublishPanel?.children ?? []).map((child) => (child as HTMLElement).className)).toEqual([
      "docsera-header__save-status docsera-header__save-status--saved",
      "docsera-header__publish-divider",
      "docsera-header__publish-button"
    ]);
    expect(editPublishPanel).toContainElement(editSaveStatus);
    expect(editPublishPanel).toContainElement(editPublishDivider);
    expect(editPublishPanel).toContainElement(editPublishButton);
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const runtimeShellCss = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    );
    expect(runtimeShellCss).toMatch(/\.docsera-header__account\s*{[^}]*flex:\s*0 0 32px;[^}]*order:\s*3;[^}]*width:\s*32px;[^}]*height:\s*32px;/s);

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
      "docsera-header__action-slot docsera-header__action-slot--settings",
      "docsera-header__ghost-button docsera-header__ghost-button--theme",
      "docsera-header__account"
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

  it("keeps launcher and workspace account menus separate from Docsera identity and route state", () => {
    const beforeRoute = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const launcherRender = render(
      <DocseraHeader
        {...baseProps}
        identity={{ kind: "docsera", icon: { type: "builtin", key: "docsera-workspace", label: "Docsera" }, name: "Docsera" }}
        mode="launcher"
        showEditModeToggle={false}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Current user: Priya Writer" }));
    expect(screen.getByRole("menu", { name: "Account menu" })).toHaveTextContent("Priya Writer");
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(beforeRoute);
    launcherRender.unmount();

    const onWorkspaceModeChange = vi.fn();
    render(
      <DocseraHeader
        {...baseProps}
        currentWorkspaceSlug="docs"
        onWorkspaceModeChange={onWorkspaceModeChange}
        recentWorkspaces={[
          { icon: { type: "builtin", key: "docs", label: "Docs" }, name: "Docs", slug: "docs" },
          { icon: { type: "builtin", key: "api", label: "API" }, name: "API", slug: "api" }
        ]}
        showWorkspaceSwitcher
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Workspace switcher: Docs" }));
    expect(screen.getByRole("menu", { name: "Recent workspaces" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Current user: Priya Writer" }));
    expect(screen.queryByRole("menu", { name: "Recent workspaces" })).not.toBeInTheDocument();
    expect(screen.getByRole("menu", { name: "Account menu" })).toBeInTheDocument();
    expect(onWorkspaceModeChange).not.toHaveBeenCalled();
    expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(beforeRoute);
  });
});
