import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PageSettingsDeleteDialog } from "./PageSettingsDeleteDialog";
import { PageSettingsOverlay } from "./PageSettingsOverlay";

function renderDeleteDialog(overrides: Partial<Parameters<typeof PageSettingsDeleteDialog>[0]> = {}) {
  const props = {
    errorMessage: "",
    hasDescendants: false,
    onConfirm: vi.fn(),
    onRequestClose: vi.fn(),
    open: true,
    pageTitle: "Overview",
    pending: false,
    ...overrides
  };

  return {
    ...render(<PageSettingsDeleteDialog {...props} />),
    props
  };
}

describe("PageSettingsDeleteDialog", () => {
  it("uses the shared destructive action treatment for the Page Settings delete entry point", () => {
    render(
      <PageSettingsOverlay
        activeField=""
        canManagePageSettings
        generalError=""
        open
        panelRef={{ current: null }}
        pageSlug="overview"
        pageTitle="Overview"
        slugError=""
        titleError=""
        onCancelField={vi.fn()}
        onChangeField={vi.fn()}
        onFinishField={vi.fn()}
        onRequestClose={vi.fn()}
        onRequestDelete={vi.fn()}
        onStartField={vi.fn()}
      />
    );

    const deleteButton = screen.getByRole("button", { name: "Delete page" });

    expect(deleteButton).toHaveClass("docsera-destructive-action", "docsera-page-settings__destructive");
    expect(deleteButton.querySelector("svg")).toBeInTheDocument();
  });

  it("uses shared tooltips for compact Page Settings controls", async () => {
    render(
      <PageSettingsOverlay
        activeField=""
        canManagePageSettings
        generalError=""
        open
        panelRef={{ current: null }}
        pageSlug="overview"
        pageTitle="Overview"
        slugError=""
        titleError=""
        onCancelField={vi.fn()}
        onChangeField={vi.fn()}
        onFinishField={vi.fn()}
        onRequestClose={vi.fn()}
        onRequestDelete={vi.fn()}
        onStartField={vi.fn()}
      />
    );

    const closeButton = screen.getByRole("button", { name: "Close page settings" });
    expect(closeButton).not.toHaveAttribute("title");

    fireEvent.focus(closeButton);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Close page settings");
    expect(closeButton).toHaveAccessibleName("Close page settings");
  });

  it("uses shared tooltips for compact Delete Page dialog controls", async () => {
    renderDeleteDialog();

    const closeButton = screen.getByRole("button", { name: "Close delete dialog" });
    expect(closeButton).not.toHaveAttribute("title");

    fireEvent.focus(closeButton);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Close delete dialog");
    expect(closeButton).toHaveAccessibleName("Close delete dialog");
  });

  it("renders pending delete progress with spinner, busy state, and disabled controls", () => {
    renderDeleteDialog({ pending: true });

    const dialog = screen.getByRole("dialog", { name: "Confirm deletion" });
    const deleteButton = within(dialog).getByRole("button", { name: "Deleting" });

    expect(deleteButton).toBeDisabled();
    expect(deleteButton).toHaveAttribute("aria-busy", "true");
    expect(deleteButton).toHaveClass("docsera-delete-confirmation-button");
    const spinnerSlot = deleteButton.querySelector(".docsera-delete-confirmation-button__spinner-slot");
    expect(spinnerSlot).toBeInTheDocument();
    expect(spinnerSlot?.querySelector(".docsera-delete-confirmation-button__spinner")).toBeInTheDocument();
    expect(deleteButton.querySelector(".docsera-delete-confirmation-button__label")).toHaveTextContent("Deleting");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Close delete dialog" })).toBeDisabled();
  });

  it("restores the normal delete action presentation when a failed delete leaves the dialog open", () => {
    const { props, rerender } = renderDeleteDialog({ pending: true });

    rerender(
      <PageSettingsDeleteDialog
        {...props}
        errorMessage="Unable to delete the page. Please try again."
        pending={false}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Confirm deletion" });
    const deleteButton = within(dialog).getByRole("button", { name: "Delete page" });

    expect(within(dialog).getByRole("alert")).toHaveTextContent("Unable to delete the page. Please try again.");
    expect(deleteButton).toBeEnabled();
    expect(deleteButton).not.toHaveAttribute("aria-busy");
    expect(deleteButton).toHaveClass("docsera-delete-confirmation-button");
    expect(deleteButton.querySelector(".docsera-delete-confirmation-button__spinner-slot")).not.toBeInTheDocument();
    expect(deleteButton.querySelector(".docsera-delete-confirmation-button__spinner")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeEnabled();
    expect(within(dialog).getByRole("button", { name: "Close delete dialog" })).toBeEnabled();
  });

  it("keeps the normal delete action actionable when not pending", () => {
    const { props } = renderDeleteDialog();

    const dialog = screen.getByRole("dialog", { name: "Confirm deletion" });
    const deleteButton = within(dialog).getByRole("button", { name: "Delete page" });
    fireEvent.click(deleteButton);

    expect(deleteButton).toBeEnabled();
    expect(deleteButton).not.toHaveAttribute("aria-busy");
    expect(deleteButton).toHaveClass("docsera-delete-confirmation-button");
    expect(deleteButton.querySelector(".docsera-delete-confirmation-button__spinner-slot")).not.toBeInTheDocument();
    expect(deleteButton.querySelector(".docsera-delete-confirmation-button__spinner")).not.toBeInTheDocument();
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });
});
