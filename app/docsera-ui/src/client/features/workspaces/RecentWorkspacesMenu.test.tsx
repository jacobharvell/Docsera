import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecentWorkspacesMenu, type RecentWorkspaceItem } from "./RecentWorkspacesMenu";

describe("RecentWorkspacesMenu", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps heading and footer outside the scrollable workspace list", () => {
    const items: RecentWorkspaceItem[] = Array.from({ length: 20 }, (_, index) => ({
      icon: { type: "builtin", key: "docs", label: "Docs" }, name: `Workspace ${index}`, slug: `workspace-${index}`
    }));
    const openWorkspace = vi.fn();
    render(<RecentWorkspacesMenu items={items} onOpenMyWorkspaces={vi.fn()} onOpenWorkspace={openWorkspace} />);
    const menu = screen.getByRole("menu", { name: "Recent workspaces" });
    const list = menu.querySelector(".docsera-header__menu-list")!;
    expect(list).toContainElement(screen.getByRole("menuitem", { name: "Workspace 19" }));
    expect(list).not.toContainElement(screen.getByText("Recent workspaces"));
    expect(list).not.toContainElement(screen.getByRole("menuitem", { name: "My Workspaces" }));
    expect(list).not.toContainElement(menu.querySelector(".docsera-header__menu-divider"));
    fireEvent.click(screen.getByRole("menuitem", { name: "Workspace 19" }));
    expect(openWorkspace).toHaveBeenCalledWith("workspace-19", items[19]);
  });

  it("keeps long workspace names within the identity layout and preserves the existing footer and current-state treatment", () => {
    const onOpenMyWorkspaces = vi.fn();
    const onOpenWorkspace = vi.fn();
    const longWorkspace: RecentWorkspaceItem = {
      icon: { type: "builtin", key: "docs", label: "Docs" },
      isCurrent: true,
      name: "Engineering Platform Documentation Workspace for Release Readiness and Partner Enablement",
      slug: "engineering-platform"
    };
    const shortWorkspace: RecentWorkspaceItem = {
      icon: { type: "builtin", key: "api", label: "API" },
      name: "API Docs",
      slug: "api-docs"
    };

    render(
      <RecentWorkspacesMenu
        currentWorkspaceSlug="engineering-platform"
        items={[longWorkspace, shortWorkspace]}
        onOpenMyWorkspaces={onOpenMyWorkspaces}
        onOpenWorkspace={onOpenWorkspace}
      />
    );

    const menu = screen.getByRole("menu", { name: "Recent workspaces" });
    const longItem = screen.getByRole("menuitem", { name: longWorkspace.name });
    const shortItem = screen.getByRole("menuitem", { name: shortWorkspace.name });
    const longIdentity = longItem.querySelector<HTMLElement>(".docsera-header__menu-item-identity");
    const longIcon = longItem.querySelector<HTMLElement>(".docsera-header__menu-item-icon");
    const longLabel = within(longItem).getByText(longWorkspace.name);
    const footer = screen.getByRole("menuitem", { name: "My Workspaces" });

    expect(menu).toBeInTheDocument();
    expect(longItem).toHaveClass("docsera-header__menu-item", "docsera-header__menu-item--current");
    expect(shortItem).toHaveClass("docsera-header__menu-item");
    expect(shortItem).not.toHaveClass("docsera-header__menu-item--current");
    if (!longIdentity || !longIcon) {
      throw new Error("Expected the long workspace identity block and icon to render.");
    }

    expect(longIdentity).toContainElement(longIcon);
    expect(longIdentity).toContainElement(longLabel);
    expect(longLabel).toHaveClass("docsera-header__menu-item-label");
    expect(longLabel).toHaveTextContent(longWorkspace.name);
    expect(longItem).toContainElement(longIdentity);
    expect(footer).toHaveClass("docsera-header__menu-footer");
    expect(footer).toHaveTextContent("My Workspaces");

    fireEvent.click(longItem);
    expect(onOpenWorkspace).toHaveBeenCalledTimes(1);
    expect(onOpenWorkspace).toHaveBeenCalledWith("engineering-platform", longWorkspace);

    fireEvent.click(footer);
    expect(onOpenMyWorkspaces).toHaveBeenCalledTimes(1);
  });

  it("uses shared tooltips for recent workspace items", async () => {
    const onOpenWorkspace = vi.fn();
    const workspace: RecentWorkspaceItem = {
      icon: { type: "builtin", key: "docs", label: "Docs" },
      name: "Platform Docs",
      slug: "platform-docs"
    };

    render(
      <RecentWorkspacesMenu items={[workspace]} onOpenMyWorkspaces={vi.fn()} onOpenWorkspace={onOpenWorkspace} />
    );

    const menuItem = screen.getByRole("menuitem", { name: workspace.name });
    const identity = menuItem.querySelector<HTMLElement>(".docsera-header__menu-item-identity");
    const label = within(menuItem).getByText(workspace.name);
    const menuItemRect = new DOMRect(20, 80, 320, 36);
    const identityRect = new DOMRect(48, 84, 120, 28);

    if (!identity) {
      throw new Error("Expected recent workspace identity block to render.");
    }

    vi.spyOn(menuItem, "getBoundingClientRect").mockReturnValue(menuItemRect);
    vi.spyOn(identity, "getBoundingClientRect").mockReturnValue(identityRect);

    expect(menuItem).toHaveAccessibleName(workspace.name);
    expect(label).toBeVisible();
    expect(menuItem).not.toHaveAttribute("title");
    expect(document.querySelector("[title]")).not.toBeInTheDocument();

    fireEvent.focus(menuItem);
    const tooltip = await screen.findByRole("tooltip");
    expect(tooltip).toHaveTextContent(workspace.name);
    await waitFor(() => expect(tooltip).toHaveStyle({ left: "107.5px", top: "73px" }));

    fireEvent.click(menuItem);
    expect(onOpenWorkspace).toHaveBeenCalledWith(workspace.slug, workspace);
  });

  it("uses the shared authenticated uploaded-icon loader for recent workspace rows", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:recent-workspace-icon")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    const loadUploadedIcon = vi.fn(async () => new Blob(["icon"], { type: "image/png" }));
    render(
      <RecentWorkspacesMenu
        items={[
          {
            icon: { type: "uploaded", key: "asset-key-001", label: "Custom", assetPath: "/icons/file?assetKey=asset-key-001" },
            name: "Custom Docs",
            slug: "custom-docs"
          }
        ]}
        loadUploadedIcon={loadUploadedIcon}
        onOpenMyWorkspaces={vi.fn()}
        onOpenWorkspace={vi.fn()}
      />
    );

    await waitFor(() => expect(document.querySelector(".docsera-workspace-icon-badge__uploaded-image")).toHaveAttribute("src", "blob:recent-workspace-icon"));
    expect(loadUploadedIcon).toHaveBeenCalledWith({
      assetPath: "/icons/file?assetKey=asset-key-001",
      signal: expect.any(AbortSignal)
    });
  });
});
