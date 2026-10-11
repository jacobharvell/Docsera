import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LauncherSearchToolbar, WorkspaceList, WorkspaceListHeader } from "./MyWorkspacesScreenSections";

function mockObjectUrl() {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:my-workspaces-icon")
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn()
  });
}

describe("WorkspaceList", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([null, "Documentation and release guidance."])("keeps the name line separate from descriptions (%s) for every icon type", (shortDescription) => {
    const icons = [
      { type: "builtin" as const, key: "docsera-workspace", label: "Docsera" },
      { type: "builtin" as const, key: "documentation", label: "Documentation" },
      { type: "uploaded" as const, key: "custom", label: "Custom", assetPath: "blob:custom" }
    ];
    const { container } = render(
      <WorkspaceList
        items={icons.map((icon, index) => ({
          sysId: `workspace-${index}`, slug: `docs-${index}`, name: `Docs ${index}`,
          icon, shortDescription, roleLabel: null, layout: { tocVisible: true }, status: "active" as const,
          canManageSettings: false, canManageWorkspaceMembers: false
        }))}
        onOpenWorkspace={vi.fn()} onOpenWorkspaceSettings={vi.fn()}
      />
    );
    expect(container.querySelectorAll(".docsera-workspace-row__identity")).toHaveLength(3);
    expect(container.querySelector(".docsera-workspace-row__icon .docsera-workspace-icon-badge__artwork")).toBeInTheDocument();
    expect(container.querySelector(".docsera-workspace-row__icon .docsera-workspace-icon-badge__glyph")).toBeInTheDocument();
    expect(container.querySelector(".docsera-workspace-row__icon .docsera-workspace-icon-badge__uploaded-image")).toBeInTheDocument();
    for (const identity of container.querySelectorAll(".docsera-workspace-row__identity")) {
      expect(identity.firstElementChild).toHaveClass("docsera-workspace-row__icon");
      const copy = identity.querySelector(".docsera-workspace-row__copy");
      expect(copy?.firstElementChild).toHaveClass("docsera-workspace-row__name");
      expect(copy?.querySelector(".docsera-workspace-row__description")?.textContent ?? null).toBe(shortDescription);
    }
  });

  it("uses the shared authenticated uploaded-icon loader for My Workspaces rows", async () => {
    mockObjectUrl();
    const loadUploadedIcon = vi.fn(async () => new Blob(["icon"], { type: "image/png" }));
    const { container } = render(
      <WorkspaceList
        items={[
          {
            canManageSettings: false,
            canManageWorkspaceMembers: false,
            icon: { type: "uploaded", key: "asset-key-001", label: "Custom", assetPath: "/icons/file?assetKey=asset-key-001" },
            name: "Custom Docs",
            layout: {
              tocVisible: true
            },
            roleLabel: "Admin",
            shortDescription: null,
            slug: "custom-docs",
            status: "active",
            sysId: "workspace-001"
          }
        ]}
        loadUploadedIcon={loadUploadedIcon}
        onOpenWorkspace={vi.fn()}
        onOpenWorkspaceSettings={vi.fn()}
      />
    );

    await waitFor(() => expect(container.querySelector(".docsera-workspace-icon-badge__uploaded-image")).toHaveAttribute("src", "blob:my-workspaces-icon"));
    expect(loadUploadedIcon).toHaveBeenCalledWith({
      assetPath: "/icons/file?assetKey=asset-key-001",
      signal: expect.any(AbortSignal)
    });
  });

  it("keeps Workspace Name and Role headings aligned in the My Workspaces list header", () => {
    render(<WorkspaceListHeader />);

    expect(screen.getByText("Workspace Name")).toHaveClass("docsera-workspace-list__workspace-heading");
    expect(screen.getByText("Role")).toHaveClass("docsera-workspace-list__role-heading");
  });

  it("uses shared tooltips for compact My Workspaces controls", async () => {
    render(<LauncherSearchToolbar searchText="api" onSearchTextChange={vi.fn()} />);

    const clearSearchButton = screen.getByRole("button", { name: "Clear search" });
    expect(clearSearchButton).not.toHaveAttribute("title");

    fireEvent.focus(clearSearchButton);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Clear search");
    expect(clearSearchButton).toHaveAccessibleName("Clear search");
  });

  it("keeps Settings as a navigation link that opens the settings intent", () => {
    const onOpenWorkspaceSettings = vi.fn();

    render(
      <WorkspaceList
        items={[
          {
            canManageSettings: true,
            canManageWorkspaceMembers: true,
            icon: { type: "builtin", key: "book", label: "Book" },
            name: "Admin Docs",
            layout: {
              tocVisible: true
            },
            roleLabel: "Admin",
            shortDescription: null,
            slug: "admin-docs",
            status: "active",
            sysId: "workspace-002"
          }
        ]}
        onOpenWorkspace={vi.fn()}
        onOpenWorkspaceSettings={onOpenWorkspaceSettings}
      />
    );

    const settingsLink = screen.getByRole("link", { name: "Settings" });
    expect(settingsLink).toHaveClass("docsera-workspace-row__settings");
    expect(settingsLink).toHaveAttribute("href", "/#/admin-docs?settings=1");

    fireEvent.click(settingsLink);

    expect(onOpenWorkspaceSettings).toHaveBeenCalledWith("admin-docs");
  });

  it("keeps workspace row links accessible without redundant tooltips", async () => {
    const onOpenWorkspace = vi.fn();
    const onOpenWorkspaceSettings = vi.fn();

    render(
      <WorkspaceList
        items={[
          {
            canManageSettings: true,
            canManageWorkspaceMembers: true,
            icon: { type: "builtin", key: "book", label: "Book" },
            name: "Admin Docs",
            layout: {
              tocVisible: true
            },
            roleLabel: "Admin",
            shortDescription: "Operational documentation",
            slug: "admin-docs",
            status: "active",
            sysId: "workspace-002"
          }
        ]}
        onOpenWorkspace={onOpenWorkspace}
        onOpenWorkspaceSettings={onOpenWorkspaceSettings}
      />
    );

    const workspaceLink = screen.getByRole("link", { name: "Admin Docs" });
    const settingsLink = screen.getByRole("link", { name: "Settings" });

    expect(workspaceLink).toBeVisible();
    expect(settingsLink).toBeVisible();
    expect(workspaceLink).not.toHaveAttribute("title");
    expect(settingsLink).not.toHaveAttribute("title");
    expect(document.querySelector("[title]")).not.toBeInTheDocument();

    fireEvent.focus(workspaceLink);
    fireEvent.mouseOver(workspaceLink);
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());

    fireEvent.blur(workspaceLink);
    fireEvent.focus(settingsLink);
    fireEvent.mouseOver(settingsLink);
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());

    fireEvent.click(workspaceLink);
    expect(onOpenWorkspace).toHaveBeenCalledWith("admin-docs", expect.objectContaining({ name: "Admin Docs" }));

    fireEvent.click(settingsLink);
    expect(onOpenWorkspaceSettings).toHaveBeenCalledWith("admin-docs");
  });
});
