import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceList, WorkspaceListHeader } from "./MyWorkspacesScreenSections";

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

  it("keeps only the Role heading in the My Workspaces list header", () => {
    render(<WorkspaceListHeader />);

    expect(screen.queryByText("Workspace")).not.toBeInTheDocument();
    expect(screen.getByText("Role")).toHaveClass("docsera-workspace-list__role-heading");
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
});
