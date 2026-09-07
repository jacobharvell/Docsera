import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PageSettingsDeleteDialog } from "./PageSettingsDeleteDialog";

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
  it("renders pending delete progress with spinner, busy state, and disabled controls", () => {
    renderDeleteDialog({ pending: true });

    const dialog = screen.getByRole("dialog", { name: "Confirm deletion" });
    const deleteButton = within(dialog).getByRole("button", { name: "Deleting" });

    expect(deleteButton).toBeDisabled();
    expect(deleteButton).toHaveAttribute("aria-busy", "true");
    expect(deleteButton.querySelector(".docsera-changes-center__spinner")).toBeInTheDocument();
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
    expect(deleteButton.querySelector(".docsera-changes-center__spinner")).not.toBeInTheDocument();
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
    expect(deleteButton.querySelector(".docsera-changes-center__spinner")).not.toBeInTheDocument();
    expect(props.onConfirm).toHaveBeenCalledTimes(1);
  });
});
