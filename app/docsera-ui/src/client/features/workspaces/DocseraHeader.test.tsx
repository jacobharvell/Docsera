/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DocseraHeader } from "./DocseraHeader";
import type { WorkspacePendingChangesResult } from "../../shared/types/docsera";
import type { WorkspacePageView } from "./workspaceViewModels";
type PendingRow = Extract<WorkspacePendingChangesResult, { state: "succeeded" }>["rows"][number];

const baseProps = {
  identity: { kind: "workspace" as const, icon: { type: "builtin" as const, key: "docs", label: "Docs" }, name: "Docs" },
  mode: "workspace" as const,
  onOpenMyWorkspaces: vi.fn(),
  onOpenWorkspace: vi.fn(),
  onToggleTheme: vi.fn(),
  onWorkspaceModeChange: vi.fn(),
  recentWorkspaces: [],
  showEditModeToggle: true,
  showWorkspaceMode: "edit" as const,
  theme: "light" as const
};

function pending(rows: PendingRow[]): WorkspacePendingChangesResult {
  return {
    affectedPageCount: Array.isArray(rows) ? rows.length : 0,
    changeSetId: "change-set-001",
    changeSetRevision: 2,
    rows,
    state: "succeeded",
    workspaceSysId: "workspace-001"
  };
}

describe("DocseraHeader publishing changes", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps breadcrumbs unanimated even while content regions reveal", () => {
    render(
      <DocseraHeader
        {...baseProps}
        breadcrumbs={[
          { id: "parent", title: "Parent" },
          { id: "child", title: "Child" }
        ] as unknown as WorkspacePageView[]}
        contentRevealState="enter"
      />
    );

    expect(screen.getByRole("navigation", { name: "Page breadcrumbs" })).not.toHaveAttribute("data-docsera-chrome-reveal-state");
    expect(screen.getByRole("button", { name: "Parent" })).toBeInTheDocument();
  });

  it("shows a neutral account placeholder before authenticated identity is available", () => {
    const { container } = render(<DocseraHeader {...baseProps} currentUser={null} />);

    const trigger = screen.getByRole("button", { name: "Current user loading" });
    expect(trigger).toHaveClass("docsera-header__profile");
    expect(trigger).toHaveClass("docsera-header__profile--placeholder");
    expect(trigger).not.toHaveTextContent("J");
    expect(container.querySelector(".docsera-header__profile-placeholder-dot")).toBeInTheDocument();
  });

  it("uses deterministic current-user initials from display name with username fallback", () => {
    const { rerender } = render(
      <DocseraHeader
        {...baseProps}
        currentUser={{ userDisplayName: "Priya Writer", userName: "pwriter" }}
      />
    );

    expect(screen.getByRole("button", { name: "Current user: Priya Writer" })).toHaveTextContent("PW");

    rerender(
      <DocseraHeader
        {...baseProps}
        currentUser={{ userDisplayName: "", userName: "api.editor@example.com" }}
      />
    );

    expect(screen.getByRole("button", { name: "Current user: api.editor@example.com" })).toHaveTextContent("AC");
    expect(screen.queryByText("J")).not.toBeInTheDocument();
  });

  it("renders the current-user avatar image inside the existing account control when supplied", () => {
    render(
      <DocseraHeader
        {...baseProps}
        currentUser={{
          userAvatarPath: "/avatar.do?sysparm_user=6816f79cc0a8016401c5a33be04be441",
          userDisplayName: "Priya Writer",
          userName: "pwriter"
        }}
      />
    );

    const trigger = screen.getByRole("button", { name: "Current user: Priya Writer" });
    const avatar = trigger.querySelector<HTMLImageElement>(".docsera-header__profile-avatar");
    expect(avatar).toHaveAttribute("src", "/avatar.do?sysparm_user=6816f79cc0a8016401c5a33be04be441");
    expect(avatar).toHaveAttribute("alt", "");
    expect(avatar).toHaveAttribute("aria-hidden", "true");
    expect(trigger).not.toHaveTextContent("PW");
    expect(trigger).not.toHaveClass("docsera-header__profile--placeholder");
    expect(trigger).toHaveClass("docsera-header__profile--avatar");
  });

  it("clips supplied profile images inside a neutral circular account viewport", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    );
    const avatarProfileBlock = source.match(/\.docsera-header__profile--avatar \{([\s\S]*?)\r?\n\}/)?.[1] ?? "";
    const avatarHoverBlock = source.match(/\.docsera-header__profile--avatar:hover \{([\s\S]*?)\r?\n\}/)?.[1] ?? "";
    const avatarImageBlock = source.match(/\.docsera-header__profile-avatar \{([\s\S]*?)\r?\n\}/)?.[1] ?? "";

    expect(avatarProfileBlock).toContain("width: 32px;");
    expect(avatarProfileBlock).toContain("height: 32px;");
    expect(avatarProfileBlock).toContain("padding: 0;");
    expect(avatarProfileBlock).toContain("border-radius: 999px;");
    expect(avatarProfileBlock).toContain("background: var(--docsera-surface-muted);");
    expect(avatarProfileBlock).toContain("box-shadow: none;");
    expect(avatarProfileBlock).toContain("overflow: hidden;");
    expect(avatarHoverBlock).toContain("background: var(--docsera-surface-muted);");
    expect(avatarHoverBlock).toContain("box-shadow: 0 0 0 2px color-mix(in srgb, var(--docsera-primary) 32%, transparent);");
    expect(avatarImageBlock).toContain("width: 100%;");
    expect(avatarImageBlock).toContain("height: 100%;");
    expect(avatarImageBlock).toContain("border-radius: inherit;");
    expect(avatarImageBlock).toContain("object-fit: cover;");
    expect(avatarImageBlock).toContain("object-position: center;");
  });

  it("falls back to deterministic initials when the supplied current-user avatar fails to load", () => {
    render(
      <DocseraHeader
        {...baseProps}
        currentUser={{
          userAvatarPath: "/broken-avatar.do?sysparm_user=6816f79cc0a8016401c5a33be04be441",
          userDisplayName: "Priya Writer",
          userName: "pwriter"
        }}
      />
    );

    const trigger = screen.getByRole("button", { name: "Current user: Priya Writer" });
    const avatar = trigger.querySelector<HTMLImageElement>(".docsera-header__profile-avatar");
    expect(avatar).not.toBeNull();

    fireEvent.error(avatar as HTMLImageElement);

    expect(trigger.querySelector(".docsera-header__profile-avatar")).toBeNull();
    expect(trigger).toHaveTextContent("PW");
  });

  it("retains an inert account menu for exit and cancels removal on reopen", () => {
    vi.useFakeTimers();
    try {
      render(<DocseraHeader {...baseProps} currentUser={{ userDisplayName: "Priya Writer", userName: "pwriter" }} />);
      const trigger = screen.getByRole("button", { name: "Current user: Priya Writer" });
      fireEvent.click(trigger);
      const menu = screen.getByRole("menu", { name: "Account menu" });
      expect(menu).toHaveAttribute("data-docsera-dropdown-motion", "enter");
      fireEvent.click(trigger);
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(menu).toHaveAttribute("inert");
      expect(menu).toHaveAttribute("aria-hidden", "true");
      fireEvent.click(trigger);
      act(() => vi.advanceTimersByTime(130));
      expect(menu).toBeInTheDocument();
      expect(menu).not.toHaveAttribute("inert");
      fireEvent.click(trigger);
      act(() => vi.advanceTimersByTime(130));
      expect(menu).not.toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });

  it("switches header menus while the previous surface exits", () => {
    vi.useFakeTimers();
    try {
      render(<DocseraHeader {...baseProps} showWorkspaceSwitcher currentUser={{ userDisplayName: "Priya Writer", userName: "pwriter" }} />);
      fireEvent.click(screen.getByRole("button", { name: "Workspace switcher: Docs" }));
      const recent = screen.getByRole("menu", { name: "Recent workspaces" });
      fireEvent.click(screen.getByRole("button", { name: "Current user: Priya Writer" }));
      expect(recent).toHaveAttribute("inert");
      expect(screen.getByRole("menu", { name: "Account menu" })).toHaveAttribute("data-docsera-dropdown-motion", "enter");
      act(() => vi.advanceTimersByTime(130));
      expect(recent).not.toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });

  it("removes the account menu immediately with reduced motion", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({ matches: true }));
    render(<DocseraHeader {...baseProps} currentUser={{ userDisplayName: "Priya Writer", userName: "pwriter" }} />);
    const trigger = screen.getByRole("button", { name: "Current user: Priya Writer" });
    fireEvent.click(trigger);
    const menu = screen.getByRole("menu", { name: "Account menu" });
    fireEvent.click(trigger);
    expect(menu).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("opens an accessible account menu with session identity and native Sign out", () => {
    const assign = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, assign }
    });
    render(
      <DocseraHeader
        {...baseProps}
        currentUser={{ userDisplayName: "Priya Writer", userName: "pwriter" }}
      />
    );

    const trigger = screen.getByRole("button", { name: "Current user: Priya Writer" });
    fireEvent.click(trigger);

    const menu = screen.getByRole("menu", { name: "Account menu" });
    expect(menu).toHaveTextContent("Priya Writer");
    expect(menu).toHaveTextContent("pwriter");
    expect(within(menu).getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();

    fireEvent.click(within(menu).getByRole("menuitem", { name: "Sign out" }));
    expect(assign).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/logout.do");
  });

  it("dismisses the account menu on outside pointer and Escape while returning focus on Escape", async () => {
    render(
      <div>
        <DocseraHeader
          {...baseProps}
          currentUser={{ userDisplayName: "Priya Writer", userName: "pwriter" }}
        />
        <button type="button">Outside</button>
      </div>
    );

    const trigger = screen.getByRole("button", { name: "Current user: Priya Writer" });
    fireEvent.click(trigger);
    expect(screen.getByRole("menu", { name: "Account menu" })).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Outside" }));
    expect(screen.queryByRole("menu", { name: "Account menu" })).not.toBeInTheDocument();

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("menu", { name: "Account menu" })).not.toBeInTheDocument());
    expect(trigger).toHaveFocus();
  });

  it("renders non-default built-in workspace icons as transparent primary glyphs in the header identity", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    );
    const headerBuiltInBlock =
      source.match(
        /\.docsera-header__workspace-icon\.docsera-workspace-icon-badge--builtin:not\(\.docsera-workspace-icon-badge--artwork\) \{([\s\S]*?)\r?\n\}/
      )?.[1] ?? "";
    const headerGlyphBlock =
      source.match(
        /\.docsera-header__workspace-icon\.docsera-workspace-icon-badge--builtin:not\(\.docsera-workspace-icon-badge--artwork\) \.docsera-workspace-icon-badge__glyph \{([\s\S]*?)\r?\n\}/
      )?.[1] ?? "";

    const { container } = render(
      <DocseraHeader
        {...baseProps}
        identity={{
          kind: "workspace",
          icon: { type: "builtin", key: "security", label: "Security" },
          name: "Security"
        }}
      />
    );

    const headerIcon = container.querySelector(".docsera-header__workspace-icon");
    expect(headerIcon).toHaveClass("docsera-workspace-icon-badge--builtin");
    expect(headerIcon).not.toHaveClass("docsera-workspace-icon-badge--artwork");
    expect(headerIcon?.querySelector(".docsera-workspace-icon-badge__glyph")).toBeInTheDocument();
    expect(headerBuiltInBlock).toContain("background: transparent;");
    expect(headerBuiltInBlock).toContain("color: var(--docsera-primary);");
    expect(headerBuiltInBlock).toContain("box-shadow: none;");
    expect(headerBuiltInBlock).not.toContain("linear-gradient");
    expect(headerBuiltInBlock).not.toContain("color: #ffffff;");
    expect(headerGlyphBlock).toContain("width: 82%;");
    expect(headerGlyphBlock).toContain("height: 82%;");
    expect(headerGlyphBlock).not.toContain("18px");
  });

  it("uses the shared authenticated uploaded-icon loader for the header identity", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:header-workspace-icon")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    const loadUploadedIcon = vi.fn(async () => new Blob(["icon"], { type: "image/png" }));
    const { container } = render(
      <DocseraHeader
        {...baseProps}
        identity={{
          kind: "workspace",
          icon: { type: "uploaded", key: "asset-key-001", label: "Custom", assetPath: "/icons/file?assetKey=asset-key-001" },
          name: "Custom Docs"
        }}
        loadUploadedIcon={loadUploadedIcon}
      />
    );

    await waitFor(() => expect(container.querySelector(".docsera-workspace-icon-badge__uploaded-image")).toHaveAttribute("src", "blob:header-workspace-icon"));
    expect(loadUploadedIcon).toHaveBeenCalledWith({
      assetPath: "/icons/file?assetKey=asset-key-001",
      signal: expect.any(AbortSignal)
    });
  });

  it("uses a bare 20px save-status icon treatment and disables the saving animation under reduced motion", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    );
    const statusBlock = source.match(/\.docsera-header__save-status \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const iconSlotBlock = source.match(/\.docsera-header__save-status-icon-slot \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const iconBlock = source.match(/\.docsera-header__save-status-icon \{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(statusBlock).toContain("width: 20px;");
    expect(statusBlock).toContain("height: 20px;");
    expect(statusBlock).not.toContain("border:");
    expect(statusBlock).not.toContain("border-radius:");
    expect(statusBlock).not.toContain("background:");
    expect(statusBlock).not.toContain("box-shadow:");
    expect(iconSlotBlock).toContain("width: 20px;");
    expect(iconSlotBlock).toContain("height: 20px;");
    expect(iconBlock).toContain("width: 20px;");
    expect(iconBlock).toContain("height: 20px;");
    expect(source).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.docsera-header__save-status-sync \{\s*animation: none;/);
  });

  it("shows the workspace authoring surface toggle in edit mode and forwards surface changes", () => {
    const onAuthoringSurfaceChange = vi.fn();
    render(
      <DocseraHeader
        {...baseProps}
        authoringSurface="visual"
        onAuthoringSurfaceChange={onAuthoringSurfaceChange}
        showAuthoringSurfaceToggle
      />
    );

    const toggle = screen.getByRole("group", { name: "Authoring surface" });
    const visual = within(toggle).getByRole("button", { name: "Visual" });
    const markdown = within(toggle).getByRole("button", { name: "Markdown" });
    const indicator = toggle.querySelectorAll(".docsera-header__segmented-indicator");

    expect(indicator).toHaveLength(1);
    expect(toggle).toHaveClass("docsera-header__surface-toggle--visual");
    expect(visual).toHaveAccessibleName("Visual");
    expect(markdown).toHaveAccessibleName("Markdown");
    expect(visual).toHaveAttribute("aria-pressed", "true");
    expect(markdown).toHaveAttribute("aria-pressed", "false");
    expect(visual).toHaveTextContent("");
    expect(markdown).toHaveTextContent("");
    expect(visual.querySelector("svg")).toBeInTheDocument();
    expect(markdown.querySelector("svg")).toBeInTheDocument();

    fireEvent.click(markdown);
    expect(onAuthoringSurfaceChange).toHaveBeenCalledTimes(1);
    expect(onAuthoringSurfaceChange).toHaveBeenCalledWith("markdown");
  });

  it("renders one sliding selected-state indicator for each segmented header toggle", () => {
    const { container, rerender } = render(
      <DocseraHeader
        {...baseProps}
        authoringSurface="visual"
        onAuthoringSurfaceChange={vi.fn()}
        showAuthoringSurfaceToggle
        showWorkspaceMode="edit"
      />
    );

    const workspaceToggle = screen.getByRole("group", { name: "Workspace mode" });
    const surfaceToggle = screen.getByRole("group", { name: "Authoring surface" });

    expect(workspaceToggle.querySelectorAll(".docsera-header__segmented-indicator")).toHaveLength(1);
    expect(surfaceToggle.querySelectorAll(".docsera-header__segmented-indicator")).toHaveLength(1);
    expect(workspaceToggle).toHaveClass("docsera-header__mode-toggle--edit");
    expect(surfaceToggle).toHaveClass("docsera-header__surface-toggle--visual");
    expect(within(workspaceToggle).getByRole("button", { name: "Edit" })).toHaveClass("docsera-header__mode-segment--active");
    expect(within(surfaceToggle).getByRole("button", { name: "Visual" })).toHaveClass("docsera-header__surface-segment--active");

    rerender(
      <DocseraHeader
        {...baseProps}
        authoringSurface="markdown"
        onAuthoringSurfaceChange={vi.fn()}
        showAuthoringSurfaceToggle
        showWorkspaceMode="live"
      />
    );

    expect(screen.getByRole("group", { name: "Workspace mode" })).toHaveClass("docsera-header__mode-toggle--live");
    expect(container.querySelector(".docsera-header__surface-toggle")).toHaveClass("docsera-header__surface-toggle--markdown");
    expect(container.querySelectorAll(".docsera-header__mode-toggle .docsera-header__segmented-indicator")).toHaveLength(1);
    expect(container.querySelectorAll(".docsera-header__surface-toggle .docsera-header__segmented-indicator")).toHaveLength(1);
  });

  it("keeps Live and Edit controls accessible without redundant tooltips", async () => {
    const onWorkspaceModeChange = vi.fn();

    render(
      <DocseraHeader
        {...baseProps}
        onWorkspaceModeChange={onWorkspaceModeChange}
        showWorkspaceMode="edit"
      />
    );

    const workspaceToggle = screen.getByRole("group", { name: "Workspace mode" });
    const liveButton = within(workspaceToggle).getByRole("button", { name: "Live" });
    const editButton = within(workspaceToggle).getByRole("button", { name: "Edit" });

    expect(liveButton).toBeVisible();
    expect(editButton).toBeVisible();
    expect(liveButton).toHaveAttribute("aria-pressed", "false");
    expect(editButton).toHaveAttribute("aria-pressed", "true");
    expect(liveButton).not.toHaveAttribute("title");
    expect(editButton).not.toHaveAttribute("title");
    expect(workspaceToggle.querySelector("[title]")).not.toBeInTheDocument();

    fireEvent.focus(liveButton);
    fireEvent.mouseOver(liveButton);
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());

    fireEvent.blur(liveButton);
    fireEvent.focus(editButton);
    fireEvent.mouseOver(editButton);
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());

    fireEvent.click(liveButton);
    expect(onWorkspaceModeChange).toHaveBeenCalledWith("live");
  });

  it("keeps the workspace mode and surface toggles aligned, separated, and free of source-editor perimeter chrome", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    );
    const rootThemeBlock = source.match(/:root \{([\s\S]*?)\r?\n\}/)?.[1] ?? "";
    const darkThemeBlock = source.match(/:root\[data-docsera-theme="dark"\] \{([\s\S]*?)\r?\n\}/)?.[1] ?? "";
    const actionSlotModeBlock = source.match(/\.docsera-header__action-slot--mode \{([\s\S]*?)\r?\n\}/)?.[1] ?? "";
    const actionDividerBlock = source.match(/\.docsera-header__action-divider \{([\s\S]*?)\r?\n\}/)?.[1] ?? "";
    const actionDividerVariantBlock = source.match(/\.docsera-header__action-divider--mode-surface \{([\s\S]*?)\r?\n\}/)?.[1] ?? "";
    const actionDividerHiddenBlock = source.match(/\.docsera-header__action-divider--hidden \{([\s\S]*?)\r?\n\}/)?.[1] ?? "";
    const modeToggleBlock = source.match(/\.docsera-header__mode-toggle \{([\s\S]*?)\r?\n\}/)?.[1] ?? "";
    const surfaceToggleBlock = source.match(/\.docsera-header__surface-toggle \{([\s\S]*?)\r?\n\}/)?.[1] ?? "";
    const indicatorBlock = source.match(/\.docsera-header__segmented-indicator \{([\s\S]*?)\r?\n\}/)?.[1] ?? "";
    const indicatorSecondPositionBlock =
      source.match(
        /\.docsera-header__mode-toggle--edit \.docsera-header__segmented-indicator,\r?\n\.docsera-header__surface-toggle--markdown \.docsera-header__segmented-indicator \{([\s\S]*?)\r?\n\}/
      )?.[1] ?? "";
    const surfaceToggleHiddenBlock = source.match(/\.docsera-header__surface-toggle--hidden \{([\s\S]*?)\r?\n\}/)?.[1] ?? "";
    const modeSegmentBlock = source.match(/\.docsera-header__mode-segment,\r?\n\.docsera-header__surface-segment \{([\s\S]*?)\r?\n\}/)?.[1] ?? "";
    const activeSegmentBlock =
      source.match(/\.docsera-header__mode-segment--active,\r?\n\.docsera-header__surface-segment--active \{([\s\S]*?)\r?\n\}/)?.[1] ?? "";
    const surfaceSegmentBlock =
      source.match(/\.docsera-header__surface-segment \{([\s\S]*?)\r?\n\}\r?\n\r?\n\.docsera-header__surface-segment svg/)?.[1] ?? "";
    const publishPanelBlock = source.match(/\.docsera-header__publish-panel \{([\s\S]*?)\r?\n\}/)?.[1] ?? "";
    const publishPanelHiddenBlock = source.match(/\.docsera-header__publish-panel--hidden \{([\s\S]*?)\r?\n\}/)?.[1] ?? "";
    const sourceEditorFocusedBlock = source.match(/\.docsera-main__source-editor \.cm-editor\.cm-focused \{([\s\S]*?)\r?\n\}/)?.[1] ?? "";

    expect(rootThemeBlock).toContain(
      "--docsera-segmented-track: color-mix(in srgb, var(--docsera-surface) 72%, var(--docsera-surface-muted) 28%);"
    );
    expect(rootThemeBlock).not.toContain("--docsera-segmented-indicator:");
    expect(darkThemeBlock).not.toContain("--docsera-segmented-indicator:");
    expect(actionSlotModeBlock).not.toContain("position: absolute;");
    expect(actionSlotModeBlock).not.toContain("transform: translate(-50%, -50%);");
    expect(actionDividerBlock).toContain("width: 1px;");
    expect(actionDividerBlock).toContain("height: 26px;");
    expect(actionDividerVariantBlock).toContain("margin-inline: -2px;");
    expect(actionDividerHiddenBlock).toContain("visibility: hidden;");
    expect(modeToggleBlock).toContain("height: 32px;");
    expect(surfaceToggleBlock).toContain("height: 32px;");
    expect(modeToggleBlock).toContain("position: relative;");
    expect(surfaceToggleBlock).toContain("position: relative;");
    expect(modeToggleBlock).toContain("background: var(--docsera-segmented-track);");
    expect(surfaceToggleBlock).toContain("background: var(--docsera-segmented-track);");
    expect(modeToggleBlock).not.toContain("background: var(--docsera-primary");
    expect(surfaceToggleBlock).not.toContain("background: var(--docsera-primary");
    expect(surfaceToggleHiddenBlock).toContain("visibility: hidden;");
    expect(surfaceToggleHiddenBlock).toContain("pointer-events: none;");
    expect(modeToggleBlock).toContain("box-sizing: border-box;");
    expect(surfaceToggleBlock).toContain("box-sizing: border-box;");
    expect(modeToggleBlock).not.toContain("gap:");
    expect(surfaceToggleBlock).not.toContain("gap:");
    expect(indicatorBlock).toContain("position: absolute;");
    expect(indicatorBlock).toContain("inset-block: 2px;");
    expect(indicatorBlock).toContain("left: 2px;");
    expect(indicatorBlock).toContain("width: calc((100% - 4px) / 2);");
    expect(indicatorBlock).toContain("border-radius: 4px;");
    expect(indicatorBlock).toContain("background: var(--docsera-primary);");
    expect(indicatorBlock).not.toContain("box-shadow:");
    expect(indicatorBlock).toContain("transition: transform 0.16s ease;");
    expect(indicatorSecondPositionBlock).toContain("transform: translateX(100%);");
    expect(modeSegmentBlock).toContain("border-radius: 4px;");
    expect(modeSegmentBlock).toContain("position: relative;");
    expect(modeSegmentBlock).toContain("z-index: 1;");
    expect(modeSegmentBlock).toContain("display: inline-flex;");
    expect(modeSegmentBlock).toContain("align-items: center;");
    expect(modeSegmentBlock).toContain("justify-content: center;");
    expect(modeSegmentBlock).toContain("transition: color 0.16s ease;");
    expect(activeSegmentBlock).toContain("color: #ffffff;");
    expect(activeSegmentBlock).not.toContain("background:");
    expect(activeSegmentBlock).not.toContain("box-shadow:");
    expect(source).toMatch(
      /\.docsera-header__mode-segment--active:hover,\r?\n\.docsera-header__surface-segment--active:hover \{\s*color: #ffffff;\s*\}/
    );
    expect(surfaceSegmentBlock).toContain("min-width: 32px;");
    expect(surfaceSegmentBlock).toContain("padding: 6px;");
    expect(publishPanelBlock).toContain("display: inline-flex;");
    expect(publishPanelHiddenBlock).toContain("visibility: hidden;");
    expect(publishPanelHiddenBlock).toContain("pointer-events: none;");
    expect(sourceEditorFocusedBlock).toContain("outline: none;");
    expect(sourceEditorFocusedBlock).toContain("box-shadow: none;");
    expect(sourceEditorFocusedBlock).not.toContain("0 0 0 1px");
    expect(source).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.docsera-header__segmented-indicator \{\s*transition: none;/);
  });

  it("opens a compact dropdown with singular/plural count, rows, footer publish, and navigation only for non-removed rows", () => {
    const onOpenPendingPage = vi.fn();
    const onDiscardAllPendingChanges = vi.fn();
    const onPublishPendingChanges = vi.fn();
    render(
      <DocseraHeader
        {...baseProps}
        onDiscardAllPendingChanges={onDiscardAllPendingChanges}
        onOpenPendingPage={onOpenPendingPage}
        onPublishPendingChanges={onPublishPendingChanges}
        pendingChanges={pending([
          {
            attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
            category: "Modified · Moved",
            firstPendingSequence: 1,
            lastChangedOn: "2026-07-18 00:00:00",
            navigable: true,
            pageSysId: "page-001",
            title: "Overview"
          },
          {
            attribution: { accessibleLabel: "Last changed by Unknown user", displayName: "Unknown user", fullDisplayName: "Unknown user" },
            category: "Removed",
            firstPendingSequence: 2,
            lastChangedOn: "2026-07-18 00:01:00",
            navigable: false,
            pageSysId: "page-002",
            title: "Archived API"
          }
        ])}
      />
    );

    expect(screen.getByRole("button", { name: "Open Changes Center" })).toBeEnabled();
    expect(screen.queryByText(/\b2 pages\b/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));

    const dialog = screen.getByRole("dialog", { name: "Changes Center" });
    const list = within(dialog).getByRole("list", { name: "Pending pages" });
    const listItems = within(list).getAllByRole("listitem");
    expect(dialog).toHaveTextContent("Changes 2 pages");
    expect(listItems).toHaveLength(2);
    expect(within(listItems[0]).getByRole("button", { name: /^Overview/ })).toBeEnabled();
    expect(within(listItems[0]).getByRole("button", { name: "Undo changes to Overview" })).toBeDisabled();
    expect(within(listItems[1]).queryByRole("button", { name: /^Archived API/ })).not.toBeInTheDocument();
    expect(within(listItems[1]).getByRole("button", { name: "Undo changes to Archived API" })).toBeDisabled();
    expect(within(dialog).getByText("Overview")).toBeInTheDocument();
    expect(within(dialog).getByText("P. Writer")).toHaveAttribute("aria-label", "Last changed by Priya Writer");
    expect(within(dialog).getByText("Modified · Moved")).toBeInTheDocument();
    expect(within(dialog).getByText("Archived API")).toBeInTheDocument();
    expect(within(dialog).getByText("Removed")).toBeInTheDocument();
    expect(within(dialog).queryByText(/^Undo$/)).toBeNull();
    const overviewUndoButton = within(listItems[0]!).getByRole("button", { name: "Undo changes to Overview" });
    expect(overviewUndoButton).not.toHaveTextContent("Undo");
    expect(overviewUndoButton).toHaveAccessibleName("Undo changes to Overview");
    expect(overviewUndoButton).toHaveClass("docsera-changes-center__row-undo");
    expect(overviewUndoButton.parentElement).toHaveClass("docsera-changes-center__row-action");
    expect(listItems[0]!.querySelector(".docsera-changes-center__row-action .docsera-changes-center__row-undo")).toBe(overviewUndoButton);
    expect(listItems[0]!.querySelector(".docsera-changes-center__row-action .docsera-changes-center__row-undo-icon")).toBeInTheDocument();
    expect(listItems[0]!.querySelector(".docsera-changes-center__row-action .docsera-changes-center__row-category")).toHaveTextContent("Modified · Moved");
    const discardButton = within(dialog).getByRole("button", { name: "Discard all" });
    expect(discardButton).toBeEnabled();
    expect(discardButton).toHaveClass("docsera-changes-center__header-action");
    expect(discardButton.querySelector("svg")).toHaveClass("lucide-undo-2");
    const footerPublish = within(dialog).getByRole("button", { name: "Publish" });
    expect(footerPublish).toHaveClass("docsera-modal__primary");
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));
    expect(onPublishPendingChanges).toHaveBeenCalledTimes(1);

    fireEvent.click(within(dialog).getByRole("button", { name: /^Overview/ }));
    expect(onOpenPendingPage).toHaveBeenCalledWith("page-001");
    expect(screen.queryByRole("dialog", { name: "Changes Center" })).not.toBeInTheDocument();
  });

  it("retains Changes Center coordinates while inert and removes it after exit", () => {
    vi.useFakeTimers();
    try {
      render(<DocseraHeader {...baseProps} onDiscardAllPendingChanges={vi.fn()} onPublishPendingChanges={vi.fn()} pendingChanges={pending([{ attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" }, category: "Modified", firstPendingSequence: 1, lastChangedOn: "2026-07-18 00:00:00", navigable: true, pageSysId: "page-001", title: "Overview" }])} />);
      const trigger = screen.getByRole("button", { name: "Open Changes Center" });
      fireEvent.click(trigger);
      const dialog = screen.getByRole("dialog", { name: "Changes Center" });
      const position = dialog.style.cssText;
      expect(dialog).toHaveAttribute("data-docsera-dropdown-motion", "enter");
      fireEvent.pointerDown(document.body);
      expect(dialog).toHaveAttribute("inert");
      expect(dialog).toHaveAttribute("aria-hidden", "true");
      fireEvent.scroll(window);
      expect(dialog.style.cssText).toBe(position);
      act(() => vi.advanceTimersByTime(130));
      expect(dialog).not.toBeInTheDocument();
    } finally { vi.useRealTimers(); }
  });

  it("portals the Changes Center to the document body as a top-level shell surface", () => {
    render(
      <DocseraHeader
        {...baseProps}
        onDiscardAllPendingChanges={vi.fn()}
        onPublishPendingChanges={vi.fn()}
        pendingChanges={pending([
          {
            attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
            category: "Modified",
            firstPendingSequence: 1,
            lastChangedOn: "2026-07-18 00:00:00",
            navigable: true,
            pageSysId: "page-001",
            title: "Overview"
          }
        ])}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));

    const dialog = screen.getByRole("dialog", { name: "Changes Center" });
    const header = screen.getAllByRole("banner")[0];
    expect(dialog).toHaveClass("docsera-changes-center--portal");
    expect(dialog.parentElement).toBe(document.body);
    expect(header).not.toContainElement(dialog);
    expect(dialog.style.position).toBe("fixed");
  });

  it("keeps the portaled Changes Center mounted through inside pointerdown and dismisses on outside pointerdown", () => {
    const onPublishPendingChanges = vi.fn();
    render(
      <DocseraHeader
        {...baseProps}
        onDiscardAllPendingChanges={vi.fn()}
        onPublishPendingChanges={onPublishPendingChanges}
        pendingChanges={pending([
          {
            attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
            category: "Modified",
            firstPendingSequence: 1,
            lastChangedOn: "2026-07-18 00:00:00",
            navigable: true,
            pageSysId: "page-001",
            title: "Overview"
          }
        ])}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));

    const dialog = screen.getByRole("dialog", { name: "Changes Center" });
    const publishButton = within(dialog).getByRole("button", { name: "Publish" });

    fireEvent.pointerDown(publishButton);
    expect(screen.getByRole("dialog", { name: "Changes Center" })).toBeInTheDocument();

    fireEvent.click(publishButton);
    expect(onPublishPendingChanges).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("dialog", { name: "Changes Center" })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole("dialog", { name: "Changes Center" })).toBeNull();
  });

  it("keeps the Changes Center open with a spinner and disabled controls while publishing", () => {
    const onOpenPendingPage = vi.fn();
    const onWorkspaceModeChange = vi.fn();
    render(
      <DocseraHeader
        {...baseProps}
        onOpenPendingPage={onOpenPendingPage}
        onWorkspaceModeChange={onWorkspaceModeChange}
        pendingChangesPublishing
        workspaceControlsLocked
        pendingChanges={pending([
          {
            attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
            category: "Modified",
            firstPendingSequence: 1,
            lastChangedOn: "2026-07-18 00:00:00",
            navigable: true,
            pageSysId: "page-001",
            title: "Overview"
          }
        ])}
      />
    );

    const publish = screen.getByRole("button", { name: "Open Changes Center" });
    fireEvent.click(publish);
    const dialog = screen.getByRole("dialog", { name: "Changes Center" });
    const footerPublish = within(dialog).getByRole("button", { name: "Publish" });
    expect(footerPublish).toBeDisabled();
    expect(footerPublish).toHaveAttribute("aria-busy", "true");
    expect(footerPublish).toHaveTextContent("Publish");
    expect(footerPublish.querySelector(".docsera-changes-center__spinner")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Discard all" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Live" })).toBeDisabled();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Changes Center" })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: /^Overview/ }));
    expect(onOpenPendingPage).toHaveBeenCalledTimes(0);
    expect(screen.getByRole("dialog", { name: "Changes Center" })).toBeInTheDocument();
  });

  it("centers processing spinners over retained Changes Center action labels without changing button widths", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    );
    const footerPrimaryBlocks = Array.from(source.matchAll(/\.docsera-changes-center__footer-primary \{([\s\S]*?)\n\}/g), (match) => match[1]);
    const footerLabelBlocks = Array.from(source.matchAll(/\.docsera-changes-center__footer-primary-label \{([\s\S]*?)\n\}/g), (match) => match[1]);
    const footerPrimaryBlock = footerPrimaryBlocks.find((block) => block.includes("width: 100%;")) ?? "";
    const footerLabelBlock = footerLabelBlocks.find((block) => block.includes("position: relative;")) ?? "";
    const overlaidSpinnerBlock = source.match(/\.docsera-changes-center__footer-primary-label > \.docsera-changes-center__spinner \{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(footerPrimaryBlock).toContain("position: relative;");
    expect(footerPrimaryBlock).toContain("width: 100%;");
    expect(footerLabelBlock).toContain("position: relative;");
    expect(footerLabelBlock).toContain("display: inline-flex;");
    expect(footerLabelBlock).toContain("align-items: center;");
    expect(footerLabelBlock).toContain("justify-content: center;");
    expect(footerLabelBlock).toContain("gap: 0;");
    expect(overlaidSpinnerBlock).toContain("position: absolute;");
    expect(overlaidSpinnerBlock).toContain("top: 50%;");
    expect(overlaidSpinnerBlock).toContain("left: 50%;");
    expect(overlaidSpinnerBlock).toContain("margin-block-start: -8px;");
    expect(overlaidSpinnerBlock).toContain("margin-inline-start: -8px;");
    expect(overlaidSpinnerBlock).toContain("pointer-events: none;");
    expect(source).toContain('.docsera-changes-center__footer-primary[aria-busy="true"] .docsera-changes-center__footer-primary-label > span:not(.docsera-changes-center__spinner),');
    expect(source).toContain('.docsera-modal__primary[aria-busy="true"] .docsera-changes-center__footer-primary-label > span:not(.docsera-changes-center__spinner)');
    expect(source).toContain("color: transparent;");

    render(
      <DocseraHeader
        {...baseProps}
        pendingChangesPublishing
        pendingChanges={pending([
          {
            attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
            category: "Modified",
            firstPendingSequence: 1,
            lastChangedOn: "2026-07-18 00:00:00",
            navigable: true,
            pageSysId: "page-001",
            title: "Overview"
          }
        ])}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    const publishButton = within(screen.getByRole("dialog", { name: "Changes Center" })).getByRole("button", { name: "Publish" });
    expect(publishButton).toHaveAccessibleName("Publish");
    expect(publishButton).toHaveAttribute("aria-busy", "true");
    expect(publishButton.querySelector(".docsera-changes-center__footer-primary-label > span:not(.docsera-changes-center__spinner)")).toHaveTextContent("Publish");
    expect(publishButton.querySelector(".docsera-changes-center__spinner")).toBeInTheDocument();
  });

  it("opens the individual undo confirmation modal without triggering row navigation and keeps Removed rows non-navigable", () => {
    const onOpenPendingPage = vi.fn();
    const onDiscardPendingPage = vi.fn();
    render(
      <DocseraHeader
        {...baseProps}
        onDiscardPendingPage={onDiscardPendingPage}
        onOpenPendingPage={onOpenPendingPage}
        pendingChanges={pending([
          {
            attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
            category: "Modified",
            firstPendingSequence: 1,
            lastChangedOn: "2026-07-18 00:00:00",
            navigable: true,
            pageSysId: "page-001",
            title: "Overview"
          },
          {
            attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
            category: "Removed",
            firstPendingSequence: 2,
            lastChangedOn: "2026-07-18 00:01:00",
            navigable: false,
            pageSysId: "page-002",
            title: "Archived API"
          }
        ])}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    const dialog = screen.getByRole("dialog", { name: "Changes Center" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Undo changes to Overview" }));

    expect(onOpenPendingPage).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Undo page changes" })).toHaveTextContent("Are you sure you want to discard changes to “Overview”? This action cannot be undone.");
    expect(within(dialog).getByText("Removed")).toBeInTheDocument();
    expect(within(dialog).queryByRole("button", { name: /^Archived API/ })).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Undo changes to Archived API" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Undo changes to Archived API" }).parentElement).toHaveClass("docsera-changes-center__row-action");
    expect(within(dialog).queryByText(/^Undo$/)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Undo changes" }));
    expect(onDiscardPendingPage).toHaveBeenCalledWith("page-001");
  });

  it("disables individual undo for the blocked current page and leaves other rows available", () => {
    render(
      <DocseraHeader
        {...baseProps}
        onDiscardPendingPage={vi.fn()}
        pendingChangesReadinessMessage="Current page is unsaved. Publish and discard actions stay disabled until local changes are saved."
        pendingChangesUndoBlockedPageSysId="page-001"
        pendingChanges={pending([
          {
            attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
            category: "Modified",
            firstPendingSequence: 1,
            lastChangedOn: "2026-07-18 00:00:00",
            navigable: true,
            pageSysId: "page-001",
            title: "Overview"
          },
          {
            attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
            category: "Moved",
            firstPendingSequence: 2,
            lastChangedOn: "2026-07-18 00:01:00",
            navigable: true,
            pageSysId: "page-002",
            title: "API"
          }
        ])}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    const blockedUndoButton = screen.getByRole("button", { name: "Undo changes to Overview" });
    expect(blockedUndoButton).toBeDisabled();
    expect(blockedUndoButton).toHaveAccessibleName("Undo changes to Overview");
    expect(blockedUndoButton.querySelector(".docsera-changes-center__row-undo-icon")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo changes to API" })).toBeEnabled();
    expect(screen.getByRole("status")).toHaveTextContent("Current page is unsaved. Publish and discard actions stay disabled until local changes are saved.");
  });

  it("opens the discard-all confirmation modal with singular and plural copy and keeps the changes center open on cancel", () => {
    const onDiscardAllPendingChanges = vi.fn();
    const { rerender } = render(
      <DocseraHeader
        {...baseProps}
        onDiscardAllPendingChanges={onDiscardAllPendingChanges}
        pendingChanges={pending([
          {
            attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
            category: "Modified",
            firstPendingSequence: 1,
            lastChangedOn: "2026-07-18 00:00:00",
            navigable: true,
            pageSysId: "page-001",
            title: "Overview"
          }
        ])}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Changes Center" })).getByRole("button", { name: "Discard all" }));
    expect(screen.getByRole("dialog", { name: "Changes Center" })).toBeInTheDocument();
    const discardModal = screen.getByRole("dialog", { name: "Discard all changes" });
    expect(discardModal.closest(".docsera-header")).toBeNull();
    expect(discardModal.closest(".docsera-modal")).toHaveClass("docsera-modal--top-biased");
    expect(discardModal).toHaveTextContent("Are you sure you want to discard 1 change? This action cannot be undone.");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Discard all changes" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Changes Center" })).toBeInTheDocument();

    rerender(
      <DocseraHeader
        {...baseProps}
        onDiscardAllPendingChanges={onDiscardAllPendingChanges}
        pendingChanges={pending([
          {
            attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
            category: "Modified",
            firstPendingSequence: 1,
            lastChangedOn: "2026-07-18 00:00:00",
            navigable: true,
            pageSysId: "page-001",
            title: "Overview"
          },
          {
            attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
            category: "Moved",
            firstPendingSequence: 2,
            lastChangedOn: "2026-07-18 00:01:00",
            navigable: true,
            pageSysId: "page-002",
            title: "API"
          }
        ])}
      />
    );
    fireEvent.click(within(screen.getByRole("dialog", { name: "Changes Center" })).getByRole("button", { name: "Discard all" }));
    expect(screen.getByRole("dialog", { name: "Discard all changes" })).toHaveTextContent("Are you sure you want to discard 2 changes? This action cannot be undone.");
  });

  it("traps focus inside the discard-all modal and restores focus to the header action on cancel", async () => {
    render(
      <DocseraHeader
        {...baseProps}
        onDiscardAllPendingChanges={vi.fn()}
        pendingChanges={pending([
          {
            attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
            category: "Modified",
            firstPendingSequence: 1,
            lastChangedOn: "2026-07-18 00:00:00",
            navigable: true,
            pageSysId: "page-001",
            title: "Overview"
          }
        ])}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    const discardAction = within(screen.getByRole("dialog", { name: "Changes Center" })).getByRole("button", { name: "Discard all" });
    fireEvent.click(discardAction);

    const modal = screen.getByRole("dialog", { name: "Discard all changes" });
    const retryButton = within(modal).getByRole("button", { name: "Discard all" });
    expect(retryButton).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab" });
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(retryButton).toHaveFocus();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(discardAction).toHaveFocus());
  });

  it("keeps the discard-all modal open and ignores Escape while discard processing is active", () => {
    render(
      <DocseraHeader
        {...baseProps}
        onDiscardAllPendingChanges={vi.fn()}
        pendingChangesDiscarding
        pendingChanges={pending([
          {
            attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
            category: "Modified",
            firstPendingSequence: 1,
            lastChangedOn: "2026-07-18 00:00:00",
            navigable: true,
            pageSysId: "page-001",
            title: "Overview"
          }
        ])}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    expect(screen.getByRole("dialog", { name: "Changes Center" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getByRole("dialog", { name: "Changes Center" })).toBeInTheDocument();
  });

  it("keeps discard confirmation labels accessible while showing only the centered spinner during processing", () => {
    const { rerender } = render(
      <DocseraHeader
        {...baseProps}
        onDiscardAllPendingChanges={vi.fn()}
        pendingChanges={pending([
          {
            attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
            category: "Modified",
            firstPendingSequence: 1,
            lastChangedOn: "2026-07-18 00:00:00",
            navigable: true,
            pageSysId: "page-001",
            title: "Overview"
          }
        ])}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Changes Center" })).getByRole("button", { name: "Discard all" }));

    rerender(
      <DocseraHeader
        {...baseProps}
        onDiscardAllPendingChanges={vi.fn()}
        pendingChangesDiscarding
        pendingChanges={pending([
          {
            attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
            category: "Modified",
            firstPendingSequence: 1,
            lastChangedOn: "2026-07-18 00:00:00",
            navigable: true,
            pageSysId: "page-001",
            title: "Overview"
          }
        ])}
      />
    );

    const discardModal = screen.getByRole("dialog", { name: "Discard all changes" });
    const discardButton = within(discardModal).getByRole("button", { name: "Discard all" });
    expect(discardButton).toBeDisabled();
    expect(discardButton).toHaveAttribute("aria-busy", "true");
    expect(discardButton).toHaveAccessibleName("Discard all");
    expect(discardButton.querySelector(".docsera-changes-center__footer-primary-label > span:not(.docsera-changes-center__spinner)")).toHaveTextContent("Discard all");
    expect(discardButton.querySelector(".docsera-changes-center__spinner")).toBeInTheDocument();
  });

  it("allows retryable discard recovery to reopen the modal while workspace controls are locked", () => {
    render(
      <DocseraHeader
        {...baseProps}
        onDiscardAllPendingChanges={vi.fn()}
        pendingChanges={{ state: "failed", affectedPageCount: 2, errorMessage: "Discard recovery is incomplete.", code: "recovery_required", recoveryCommandId: "discard-001" }}
        pendingChangesDiscardAllAffectedPageCount={2}
        pendingChangesDiscardAllErrorMessage="Discard recovery is incomplete. Retry discard all to finish restoring this workspace before making other changes."
        pendingChangesDiscardAllRetryable
        workspaceControlsLocked
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Changes Center" })).getByRole("button", { name: "Discard all" }));
    expect(screen.getByRole("dialog", { name: "Discard all changes" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Discard all changes" })).toHaveTextContent("Are you sure you want to discard 2 changes? This action cannot be undone.");
    expect(screen.getByRole("button", { name: "Retry discard all" })).toBeEnabled();
  });

  it("keeps the Changes Center open when the header Publish control is pressed during discard processing", () => {
    render(
      <DocseraHeader
        {...baseProps}
        pendingChangesDiscarding
        pendingChanges={pending([
          {
            attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
            category: "Modified",
            firstPendingSequence: 1,
            lastChangedOn: "2026-07-18 00:00:00",
            navigable: true,
            pageSysId: "page-001",
            title: "Overview"
          }
        ])}
      />
    );

    const publish = screen.getByRole("button", { name: "Open Changes Center" });
    fireEvent.click(publish);
    expect(screen.getByRole("dialog", { name: "Changes Center" })).toBeInTheDocument();
    fireEvent.click(publish);
    expect(screen.getByRole("dialog", { name: "Changes Center" })).toBeInTheDocument();
  });

  it("keeps the Changes Center open after publish failure, shows the header toast, and closes on zero-pending success", () => {
    const onPublishPendingChanges = vi.fn();
    const onDismissPendingChangesPublishToast = vi.fn();
    const { rerender } = render(
      <DocseraHeader
        {...baseProps}
        onDismissPendingChangesPublishToast={onDismissPendingChangesPublishToast}
        onPublishPendingChanges={onPublishPendingChanges}
        pendingChangesPublishing
        pendingChanges={pending([
          {
            attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
            category: "Modified",
            firstPendingSequence: 1,
            lastChangedOn: "2026-07-18 00:00:00",
            navigable: true,
            pageSysId: "page-001",
            title: "Overview"
          }
        ])}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    expect(screen.getByRole("dialog", { name: "Changes Center" })).toBeInTheDocument();

    rerender(
      <DocseraHeader
        {...baseProps}
        onDismissPendingChangesPublishToast={onDismissPendingChangesPublishToast}
        onPublishPendingChanges={onPublishPendingChanges}
        pendingChanges={pending([
          {
            attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
            category: "Modified",
            firstPendingSequence: 1,
            lastChangedOn: "2026-07-18 00:00:00",
            navigable: true,
            pageSysId: "page-001",
            title: "Overview"
          }
        ])}
        pendingChangesPublishErrorMessage="Unable to publish this workspace right now. Please try again."
        pendingChangesPublishRetryable
      />
    );

    expect(screen.getByRole("dialog", { name: "Changes Center" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to publish this workspace right now. Please try again.");
    expect(within(screen.getByRole("dialog", { name: "Changes Center" })).getByRole("button", { name: "Publish" })).toBeEnabled();
    expect(screen.queryByRole("status", { name: "Workspace changes published." })).not.toBeInTheDocument();

    rerender(
      <DocseraHeader
        {...baseProps}
        onDismissPendingChangesPublishToast={onDismissPendingChangesPublishToast}
        onPublishPendingChanges={onPublishPendingChanges}
        pendingChanges={pending([
          {
            attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
            category: "Modified",
            firstPendingSequence: 1,
            lastChangedOn: "2026-07-18 00:00:00",
            navigable: true,
            pageSysId: "page-001",
            title: "Overview"
          }
        ])}
        pendingChangesPublishErrorMessage="Unable to publish this workspace right now. Please try again."
      />
    );

    expect(within(screen.getByRole("dialog", { name: "Changes Center" })).getByRole("button", { name: "Publish" })).toBeDisabled();

    rerender(
      <DocseraHeader
        {...baseProps}
        onDismissPendingChangesPublishToast={onDismissPendingChangesPublishToast}
        onPublishPendingChanges={onPublishPendingChanges}
        pendingChanges={pending([])}
        pendingChangesPublishToastMessage="Workspace changes published."
      />
    );

    const toast = screen.getByRole("status");
    expect(toast).toHaveAttribute("aria-live", "polite");
    expect(toast).toHaveTextContent("Workspace changes published.");
    expect(toast.querySelector(".docsera-header__publish-toast-icon")).toBeInTheDocument();
    fireEvent.click(within(toast).getByRole("button", { name: "Dismiss publish success" }));
    expect(onDismissPendingChangesPublishToast).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog", { name: "Changes Center" })).not.toBeInTheDocument();
  });

  it("keeps active Publish presentation while workspace controls are temporarily locked", () => {
    render(
      <DocseraHeader
        {...baseProps}
        pendingChanges={pending([
          {
            attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
            category: "Modified",
            firstPendingSequence: 1,
            lastChangedOn: "2026-07-18 00:00:00",
            navigable: true,
            pageSysId: "page-001",
            title: "Overview"
          }
        ])}
        pendingChangesReadinessMessage="Current page is saving. Publish and discard actions stay disabled until local changes are saved."
        pendingChangesRefreshing
        workspaceControlsLocked
      />
    );

    const publish = screen.getByRole("button", { name: "Open Changes Center" });
    expect(publish).toBeDisabled();
    expect(publish).toHaveClass("docsera-header__publish-button--active");
    expect(publish).toHaveTextContent("Publish");
    expect(publish.querySelector(".docsera-header__publish-chevron")).toBeInTheDocument();
  });

  it("returns focus on Escape and exposes a retryable error state", () => {
    const onRetryPendingChanges = vi.fn();
    render(
      <DocseraHeader
        {...baseProps}
        onRetryPendingChanges={onRetryPendingChanges}
        pendingChanges={{ state: "failed", errorMessage: "Unable to load pending changes.", code: "transient" }}
      />
    );

    const publish = screen.getByRole("button", { name: "Open Changes Center" });
    fireEvent.click(publish);
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to load pending changes.");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetryPendingChanges).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Changes Center" })).not.toBeInTheDocument();
    expect(publish).toHaveFocus();
  });

  it("renders the current-page save status indicator with the accepted icon mappings and live-region text updates", () => {
    const states = [
      {
        label: "Current page has unsaved changes",
        saveStatus: "Unsaved" as const,
        statusClass: "docsera-header__save-status--unsaved",
        iconSelector: ".lucide-cloud-off"
      },
      {
        label: "Saving current page",
        saveStatus: "Saving…" as const,
        statusClass: "docsera-header__save-status--saving",
        iconSelector: ".docsera-header__save-status-sync"
      },
      {
        label: "Current page changes saved",
        saveStatus: "Saved" as const,
        statusClass: "docsera-header__save-status--saved",
        iconSelector: ".lucide-cloud-check"
      },
      {
        label: "Current page changes could not be saved",
        saveStatus: "Changes not saved" as const,
        statusClass: "docsera-header__save-status--failed",
        iconSelector: ".lucide-cloud-alert"
      }
    ];

    const { container, rerender } = render(
      <DocseraHeader {...baseProps} onPublishPendingChanges={vi.fn()} pendingChanges={pending([])} saveStatus={states[0].saveStatus} />
    );

    const publish = within(container).getByRole("button", { name: "No pending changes to publish" });
    const indicator = within(container).getByRole("status", { name: states[0].label });

    for (const [index, state] of states.entries()) {
      if (index > 0) {
        rerender(<DocseraHeader {...baseProps} onPublishPendingChanges={vi.fn()} pendingChanges={pending([])} saveStatus={state.saveStatus} />);
      }

      expect(indicator).toHaveTextContent(state.label);
      expect(indicator).toHaveAttribute("aria-label", state.label);
      expect(indicator).not.toHaveAttribute("title");
      expect(indicator).toHaveAttribute("aria-live", "polite");
      expect(indicator).toHaveAttribute("aria-atomic", "true");
      expect(indicator).toHaveAttribute("tabindex", "0");
      fireEvent.focus(indicator);
      expect(screen.getByRole("tooltip")).toHaveTextContent(state.label);
      fireEvent.blur(indicator);
      expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
      expect(indicator).toHaveClass(state.statusClass);
      expect(indicator.querySelector(".docsera-header__save-status-icon-slot")).toBeInTheDocument();
      expect(indicator.querySelector(".docsera-header__save-status-sr-only")).toHaveTextContent(state.label);
      expect(indicator.querySelector(state.iconSelector)).toBeInTheDocument();
      expect(within(container).getByRole("status", { name: state.label })).toBe(indicator);
      expect(indicator.querySelector(".docsera-header__save-status-icon-slot")).toHaveAttribute("aria-hidden", "true");
      expect((indicator.querySelector("svg")?.getAttribute("width")) ?? "").toBe("20");
      expect((indicator.querySelector("svg")?.getAttribute("height")) ?? "").toBe("20");

      if (state.saveStatus === "Saving…") {
        expect(indicator.querySelector(".docsera-header__save-status-cloud")).toBeInTheDocument();
      } else {
        expect(indicator.querySelector(".docsera-header__save-status-cloud")).toBeNull();
      }
    }

    fireEvent.focus(indicator);
    rerender(<DocseraHeader {...baseProps} onPublishPendingChanges={vi.fn()} pendingChanges={pending([])} saveStatus="Unsaved" />);
    expect(screen.getByRole("tooltip")).toHaveTextContent(states[0].label);
    fireEvent.blur(indicator);
    vi.useFakeTimers();
    fireEvent.mouseEnter(indicator);
    act(() => vi.advanceTimersByTime(180));
    expect(screen.getByRole("tooltip")).toHaveTextContent(states[0].label);
    fireEvent.mouseLeave(indicator);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    vi.useRealTimers();

    expect(container.querySelector(".docsera-header__publish-divider")).toBeInTheDocument();
    expect(publish).toHaveTextContent("Publish");
  });

  it("reserves the live save-status geometry without exposing an accessible status", () => {
    const { container } = render(
      <DocseraHeader
        {...baseProps}
        onPublishPendingChanges={vi.fn()}
        pendingChanges={pending([])}
        showWorkspaceMode="live"
      />
    );

    expect(within(container).queryByRole("status", { name: "Current page changes saved" })).not.toBeInTheDocument();

    const reservedSaveStatus = container.querySelector<HTMLElement>(".docsera-header__save-status");
    expect(reservedSaveStatus).not.toBeNull();
    expect(reservedSaveStatus).toHaveClass("docsera-header__save-status--reserved");
    expect(reservedSaveStatus).toHaveAttribute("aria-hidden", "true");
    fireEvent.mouseEnter(reservedSaveStatus!);
    fireEvent.focus(reservedSaveStatus!);
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    expect(container.querySelector(".docsera-header__publish-divider")).toBeInTheDocument();
  });

  it("omits the publish panel geometry when edit controls are disabled", () => {
    const { container } = render(
      <DocseraHeader
        {...baseProps}
        onPublishPendingChanges={vi.fn()}
        pendingChanges={pending([])}
        saveStatus="Saved"
        showEditModeToggle={false}
      />
    );

    expect(within(container).queryByRole("status", { name: "Current page changes saved" })).not.toBeInTheDocument();
    expect(container.querySelector(".docsera-header__save-status")).toBeNull();
    expect(container.querySelector(".docsera-header__publish-divider")).toBeNull();
  });

});
