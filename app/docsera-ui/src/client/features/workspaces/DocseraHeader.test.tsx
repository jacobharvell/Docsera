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

describe("DocseraHeader save status placement", () => {
  it.each(["Unsaved", "Saving…", "Saved", "Changes not saved"] as const)(
    "renders %s before the stable mode toggle without Save or Retry controls",
    (saveStatus) => {
      const { container } = render(<DocseraHeader {...baseProps} saveStatus={saveStatus} />);
      const status = screen.getByRole("status");
      const toggle = screen.getByRole("group", { name: "Workspace mode" });

      expect(status.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(status.parentElement).toHaveClass("docsera-header__action-slot--mode");
      expect(screen.queryByRole("button", { name: /save|retry/i })).not.toBeInTheDocument();
      expect(container.querySelectorAll(".docsera-header__mode-toggle")).toHaveLength(1);
    }
  );

  it("does not render save status in Live mode", () => {
    render(<DocseraHeader {...baseProps} saveStatus={undefined} showWorkspaceMode="live" />);
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
