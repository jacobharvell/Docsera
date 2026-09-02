import "@testing-library/jest-dom/vitest";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { BUILT_IN_WORKSPACE_ICONS, DEFAULT_BUILT_IN_WORKSPACE_ICON } from "../../../shared/workspaces/domain";
import { WorkspaceCreateModal } from "./WorkspaceCreateModal";

describe("WorkspaceCreateModal", () => {
  it("renders the built-in icon picker as label-free accessible options with a selected state", () => {
    const { container } = render(
      <WorkspaceCreateModal errorMessage="" onClose={vi.fn()} onSubmit={vi.fn()} open phase="idle" />
    );

    const picker = screen.getByRole("group", { name: "Workspace icon" });
    const options = within(picker).getAllByRole("button");
    const defaultOption = within(picker).getByRole("button", { name: `${DEFAULT_BUILT_IN_WORKSPACE_ICON.label}, selected` });

    expect(options).toHaveLength(BUILT_IN_WORKSPACE_ICONS.length);
    expect(defaultOption).toHaveAttribute("aria-pressed", "true");
    expect(defaultOption).toHaveClass("docsera-workspace-icon-picker__option--selected");
    expect(within(picker).getByRole("button", { name: "Security" })).toHaveAttribute("aria-pressed", "false");
    expect(container.querySelector(".docsera-workspace-icon-picker__label")).not.toBeInTheDocument();
    expect(picker).not.toHaveTextContent(DEFAULT_BUILT_IN_WORKSPACE_ICON.label);
    expect(picker.querySelectorAll(".docsera-workspace-icon-badge")).toHaveLength(BUILT_IN_WORKSPACE_ICONS.length);
  });
});
