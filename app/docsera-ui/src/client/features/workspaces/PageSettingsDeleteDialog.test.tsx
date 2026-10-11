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

function readRuntimeShellCss() {
  const nodeProcess = new Function("return process")() as {
    cwd: () => string;
    getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
  };
  return nodeProcess
    .getBuiltinModule("fs")
    .readFileSync(`${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`, "utf8")
    .replace(/\r\n/g, "\n");
}

function readCssRuleBlock(source: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`${escapedSelector} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
}

describe("PageSettingsDeleteDialog", () => {
  it("aligns Page Settings field labels and editable surfaces with Workspace Settings styling", () => {
    render(
      <PageSettingsOverlay
        activeField="slug"
        canManagePageSettings
        generalError=""
        open
        panelRef={{ current: null }}
        pageSlug="Bad Slug"
        pageTitle="Overview"
        slugError="Invalid slug."
        titleError=""
        onCancelField={vi.fn()}
        onChangeField={vi.fn()}
        onFinishField={vi.fn()}
        onRequestClose={vi.fn()}
        onRequestDelete={vi.fn()}
        onStartField={vi.fn()}
      />
    );

    const panel = screen.getByRole("complementary", { name: "Page Settings" });
    const titleLabel = within(panel).getByText("Title").closest(".docsera-page-settings__label");
    const slugLabel = within(panel).getByText("Slug").closest(".docsera-page-settings__label");
    const idleTitle = within(panel).getByRole("button", { name: "Overview" });
    const editingSlug = within(panel).getByDisplayValue("Bad Slug");

    expect(titleLabel).toBeInTheDocument();
    expect(slugLabel).toBeInTheDocument();
    expect(idleTitle).toHaveClass("docsera-page-settings__value");
    expect(editingSlug).toHaveClass("docsera-page-settings__input", "docsera-page-settings__input--invalid");
    expect(within(panel).getByRole("alert")).toHaveClass("docsera-page-settings__field-error");

    const source = readRuntimeShellCss();
    const pageLabelBlock = readCssRuleBlock(source, ".docsera-page-settings__label");
    const workspaceLabelBlock = readCssRuleBlock(source, ".docsera-workspace-settings-overlay__field-label");
    const pageValueInputBlock =
      source.match(/\.docsera-page-settings__value,\n\.docsera-page-settings__input \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const workspaceInputBlock = readCssRuleBlock(source, ".docsera-workspace-settings-overlay__input");
    const darkPageAndCloseBlock =
      source.match(
        /html\[data-docsera-theme="dark"\] \.docsera-page-settings__value,\nhtml\[data-docsera-theme="dark"\] \.docsera-page-settings__input,\nhtml\[data-docsera-theme="dark"\] \.docsera-workspace-settings-overlay__close \{([\s\S]*?)\n\}/
      )?.[1] ?? "";

    expect(pageLabelBlock).toContain("color: var(--docsera-text);");
    expect(pageLabelBlock).toContain("font-size: 0.75rem;");
    expect(pageLabelBlock).toContain("font-weight: 700;");
    expect(pageLabelBlock).toContain("line-height: 1.35;");
    expect(pageLabelBlock).not.toContain("text-transform: uppercase;");
    expect(pageLabelBlock).not.toContain("letter-spacing:");
    expect(workspaceLabelBlock).toContain("color: var(--docsera-text);");
    expect(workspaceLabelBlock).toContain("font-size: 0.75rem;");
    expect(workspaceLabelBlock).toContain("font-weight: 700;");
    expect(workspaceLabelBlock).toContain("line-height: 1.35;");
    expect(pageValueInputBlock).toContain("background: color-mix(in srgb, var(--docsera-primary) 4%, var(--docsera-surface) 96%);");
    expect(workspaceInputBlock).toContain("background: color-mix(in srgb, var(--docsera-primary) 4%, var(--docsera-surface) 96%);");
    expect(darkPageAndCloseBlock).toContain("background: rgba(17, 22, 29, 0.92);");
  });

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
    const deleteButton = within(dialog).getByRole("button", { name: "Delete page" });

    expect(deleteButton).toBeDisabled();
    expect(deleteButton).toHaveAttribute("aria-busy", "true");
    expect(deleteButton).toHaveClass("docsera-delete-confirmation-button");
    const spinnerSlot = deleteButton.querySelector(".docsera-delete-confirmation-button__spinner-slot");
    expect(spinnerSlot).toBeInTheDocument();
    expect(spinnerSlot?.querySelector(".docsera-delete-confirmation-button__spinner")).toBeInTheDocument();
    expect(deleteButton.querySelector(".docsera-delete-confirmation-button__label")).toHaveTextContent("Delete page");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Close delete dialog" })).toBeDisabled();
  });

  it("keeps the pending delete spinner centered over the retained label footprint", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    );
    const buttonBlock = source.match(/\.docsera-delete-confirmation-button \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const spinnerSlotBlock = source.match(/\.docsera-delete-confirmation-button__spinner-slot \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const labelBlock = source.match(/\.docsera-delete-confirmation-button__label \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const busyLabelBlock = source.match(/\.docsera-delete-confirmation-button\[aria-busy="true"\] \.docsera-delete-confirmation-button__label \{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(buttonBlock).toContain("position: relative;");
    expect(buttonBlock).toContain("display: inline-flex;");
    expect(buttonBlock).not.toContain("gap:");
    expect(buttonBlock).not.toMatch(/(^|\n)\s*width:/);
    expect(spinnerSlotBlock).toContain("position: absolute;");
    expect(spinnerSlotBlock).toContain("inset: 0;");
    expect(spinnerSlotBlock).toContain("align-items: center;");
    expect(spinnerSlotBlock).toContain("justify-content: center;");
    expect(spinnerSlotBlock).toContain("pointer-events: none;");
    expect(labelBlock).toContain("display: inline-block;");
    expect(busyLabelBlock).toContain("color: transparent;");
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
