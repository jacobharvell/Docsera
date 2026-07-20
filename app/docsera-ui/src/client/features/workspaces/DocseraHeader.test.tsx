import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DocseraHeader } from "./DocseraHeader";
import type { WorkspacePendingChangesResult } from "../../shared/types/docsera";
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

describe("DocseraHeader Changes Center", () => {
  it("renders the centered mode toggle without global save status and keeps empty Publish disabled", () => {
    const { container } = render(<DocseraHeader {...baseProps} pendingChanges={pending([])} />);

    expect(screen.getByRole("group", { name: "Workspace mode" })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /saved/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No pending changes to publish" })).toBeDisabled();
    expect(container.querySelector(".docsera-header__action-slot--mode")).toBeInTheDocument();
  });

  it("opens a compact dropdown with singular/plural count, rows, disabled footer commands, and navigation only for non-removed rows", () => {
    const onOpenPendingPage = vi.fn();
    render(
      <DocseraHeader
        {...baseProps}
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
    expect(within(listItems[0]).getByRole("button", { name: /Overview/ })).toBeEnabled();
    expect(within(listItems[1]).queryByRole("button")).not.toBeInTheDocument();
    expect(within(dialog).getByText("Overview")).toBeInTheDocument();
    expect(within(dialog).getByText("P. Writer")).toHaveAttribute("aria-label", "Last changed by Priya Writer");
    expect(within(dialog).getByText("Modified")).toBeInTheDocument();
    expect(within(dialog).getByText("Archived API")).toBeInTheDocument();
    expect(within(dialog).getByText("Removed")).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Discard all" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Publish" })).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("button", { name: /Overview/ }));
    expect(onOpenPendingPage).toHaveBeenCalledWith("page-001");
    expect(screen.queryByRole("dialog", { name: "Changes Center" })).not.toBeInTheDocument();
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
});
