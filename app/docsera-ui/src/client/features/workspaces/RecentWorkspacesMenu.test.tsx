import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RecentWorkspacesMenu, type RecentWorkspaceItem } from "./RecentWorkspacesMenu";

describe("RecentWorkspacesMenu", () => {
  afterEach(() => {
    vi.restoreAllMocks();
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
    const longLabel = screen.getByTitle(longWorkspace.name);
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
    expect(longLabel.parentElement).toHaveClass("docsera-header__menu-item-identity");
    expect(longItem).toContainElement(longIdentity);
    expect(footer).toHaveClass("docsera-header__menu-footer");
    expect(footer).toHaveTextContent("My Workspaces");

    fireEvent.click(longItem);
    expect(onOpenWorkspace).toHaveBeenCalledTimes(1);
    expect(onOpenWorkspace).toHaveBeenCalledWith("engineering-platform", longWorkspace);

    fireEvent.click(footer);
    expect(onOpenMyWorkspaces).toHaveBeenCalledTimes(1);
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
