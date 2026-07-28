import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
    const { container } = render(<DocseraHeader {...baseProps} pendingChanges={pending([])} />);

    expect(screen.getByRole("group", { name: "Workspace mode" })).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: /saved/i })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No pending changes to publish" })).toBeDisabled();
    expect(container.querySelector(".docsera-header__action-slot--mode")).toBeInTheDocument();
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
    expect(within(listItems[0]).getByRole("button", { name: /^Overview/ })).toBeEnabled();
    expect(within(listItems[0]).getByRole("button", { name: "Undo changes to Overview" })).toBeDisabled();
    expect(within(listItems[1]).queryByRole("button", { name: /^Archived API/ })).not.toBeInTheDocument();
    expect(within(listItems[1]).getByRole("button", { name: "Undo changes to Archived API" })).toBeDisabled();
    expect(within(dialog).getByText("Overview")).toBeInTheDocument();
    expect(within(dialog).getByText("P. Writer")).toHaveAttribute("aria-label", "Last changed by Priya Writer");
    expect(within(dialog).getByText("Modified")).toBeInTheDocument();
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
    expect(listItems[0]!.querySelector(".docsera-changes-center__row-action .docsera-changes-center__row-category")).toHaveTextContent("Modified");
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
});
