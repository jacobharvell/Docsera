import "@testing-library/jest-dom/vitest";
import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkspaceList } from "./MyWorkspacesScreenSections";

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
            icon: { type: "uploaded", key: "asset-key-001", label: "Custom", assetPath: "/icons/file?assetKey=asset-key-001" },
            name: "Custom Docs",
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
});
