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

  it("renders the centered mode toggle without global save status and keeps empty Publish disabled", () => {
    const { container } = render(<DocseraHeader {...baseProps} pendingChanges={{ affectedPageCount: 0, changeSetId: "change-set-001", changeSetRevision: 2, rows: [], state: "succeeded", workspaceSysId: "workspace-001" }} />);

    expect(screen.getByRole("group", { name: "Workspace mode" })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /saved/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No pending changes to publish" })).toBeDisabled();
    expect(container.querySelector(".docsera-header__action-slot--mode")).toBeInTheDocument();
  });
});
