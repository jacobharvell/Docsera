import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PageCreateModal } from "./PageCreateModal";

describe("PageCreateModal", () => {
  it("validates required title and trims submission input", () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();

    const { container, rerender } = render(
      <PageCreateModal errorMessage={undefined} onClose={onClose} onSubmit={onSubmit} open phase="idle" />
    );

    const form = container.querySelector("form");
    if (!form) {
      throw new Error("Expected modal form to render.");
    }

    fireEvent.submit(form);
    expect(screen.getByText("Page title is required.")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    const titleInput = screen.getByLabelText("Page title");
    fireEvent.change(titleInput, { target: { value: "  Task 33 Page Smoke  " } });
    fireEvent.submit(form);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit).toHaveBeenCalledWith({
      title: "Task 33 Page Smoke"
    });

    rerender(<PageCreateModal errorMessage="You do not have permission to create pages in this workspace." onClose={onClose} onSubmit={onSubmit} open phase="idle" />);
    expect(screen.getByRole("alert")).toHaveTextContent("You do not have permission to create pages in this workspace.");
  });
});
