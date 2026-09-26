import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceViewRecord } from "../../shared/types/docsera";
import { WorkspaceSettingsOverlay } from "./WorkspaceSettingsOverlay";

function createWorkspace(overrides: Partial<WorkspaceViewRecord> = {}): WorkspaceViewRecord {
  return {
    sysId: "workspace-001",
    slug: "product-docs",
    name: "Product Docs",
    shortDescription: "Release notes and launch guidance.",
    icon: {
      type: "builtin",
      key: "docsera-workspace",
      label: "Docsera workspace icon"
    },
    layout: {
      tocVisible: true
    },
    status: "active",
    roleLabel: "Admin",
    canManageWorkspaceMembers: true,
    canManageSettings: true,
    ...overrides
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

describe("WorkspaceSettingsOverlay", () => {
  it("shows stable settings action labels and keeps Manage workspace access capability gated", () => {
    const { rerender } = render(
      <WorkspaceSettingsOverlay
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        open
        pending={false}
        workspace={createWorkspace()}
      />
    );

    const panel = screen.getByRole("complementary", { name: "Workspace Settings" });
    expect(within(panel).getByRole("button", { name: "Upload custom workspace icon" })).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Manage workspace access" })).toBeInTheDocument();

    rerender(
      <WorkspaceSettingsOverlay
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        open
        pending={false}
        workspace={createWorkspace({ canManageWorkspaceMembers: false })}
      />
    );

    expect(screen.getByRole("button", { name: "Upload custom workspace icon" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage workspace access" })).not.toBeInTheDocument();
  });

  it("uses shared tooltips for compact Workspace Settings controls", async () => {
    render(
      <WorkspaceSettingsOverlay
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        open
        pending={false}
        workspace={createWorkspace()}
      />
    );

    const panel = screen.getByRole("complementary", { name: "Workspace Settings" });
    const closeButton = within(panel).getByRole("button", { name: "Close workspace settings" });
    expect(closeButton).not.toHaveAttribute("title");

    fireEvent.focus(closeButton);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Close workspace settings");
    expect(closeButton).toHaveAccessibleName("Close workspace settings");
  });

  it("uses shared tooltips for compact Workspace delete-dialog controls", async () => {
    render(
      <WorkspaceSettingsOverlay
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        open
        pending={false}
        workspace={createWorkspace()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete workspace" }));
    const dialog = screen.getByRole("dialog", { name: "Delete workspace" });
    const closeButton = within(dialog).getByRole("button", { name: "Close delete workspace dialog" });
    expect(closeButton).not.toHaveAttribute("title");

    fireEvent.focus(closeButton);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Close delete workspace dialog");
    expect(closeButton).toHaveAccessibleName("Close delete workspace dialog");
  });

  it("gates Danger zone deletion to settings managers", () => {
    const { rerender } = render(
      <WorkspaceSettingsOverlay
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        open
        pending={false}
        workspace={createWorkspace()}
      />
    );

    expect(screen.getByRole("heading", { name: "Danger zone" })).toBeInTheDocument();
    const deleteButton = screen.getByRole("button", { name: "Delete workspace" });
    expect(deleteButton).toBeInTheDocument();
    expect(deleteButton).toHaveClass("docsera-destructive-action", "docsera-workspace-settings-overlay__delete-button");
    expect(deleteButton.querySelector("svg")).toBeInTheDocument();

    rerender(
      <WorkspaceSettingsOverlay
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        open
        pending={false}
        workspace={createWorkspace({ canManageSettings: false })}
      />
    );

    expect(screen.queryByRole("heading", { name: "Danger zone" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete workspace" })).not.toBeInTheDocument();
  });

  it("opens and cancels delete confirmation without saving unrelated settings drafts", () => {
    const onCancel = vi.fn();
    const onConfirmDelete = vi.fn();
    const onSubmit = vi.fn();
    render(
      <WorkspaceSettingsOverlay
        onCancel={onCancel}
        onConfirmDelete={onConfirmDelete}
        onSubmit={onSubmit}
        open
        pending={false}
        workspace={createWorkspace()}
      />
    );

    fireEvent.change(screen.getByLabelText("Workspace name"), { target: { value: "Unsaved Name" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete workspace" }));

    expect(screen.getByRole("dialog", { name: "Delete workspace" })).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    const cancelButton = within(screen.getByRole("dialog", { name: "Delete workspace" })).getByRole("button", { name: "Cancel" });
    fireEvent.pointerDown(cancelButton);
    fireEvent.click(cancelButton);

    expect(screen.queryByRole("dialog", { name: "Delete workspace" })).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Unsaved Name")).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirmDelete).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps delete confirmation pointer and keyboard actions out of Workspace Settings finish editing", () => {
    const onCancel = vi.fn();
    const onConfirmDelete = vi.fn();
    const onSubmit = vi.fn();
    const { rerender } = render(
      <WorkspaceSettingsOverlay
        onCancel={onCancel}
        onConfirmDelete={onConfirmDelete}
        onSubmit={onSubmit}
        open
        pending={false}
        workspace={createWorkspace()}
      />
    );

    fireEvent.change(screen.getByLabelText("Workspace name"), { target: { value: "Unsaved Name" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete workspace" }));

    const firstDialog = screen.getByRole("dialog", { name: "Delete workspace" });
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Delete workspace" })).not.toBeInTheDocument();
    expect(firstDialog).not.toBeInTheDocument();
    expect(screen.getByDisplayValue("Unsaved Name")).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onConfirmDelete).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Delete workspace" }));
    const confirmButton = within(screen.getByRole("dialog", { name: "Delete workspace" })).getByRole("button", { name: "Delete workspace" });
    fireEvent.pointerDown(confirmButton);
    fireEvent.click(confirmButton);

    expect(onConfirmDelete).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();

    rerender(
      <WorkspaceSettingsOverlay
        deletePending
        onCancel={onCancel}
        onConfirmDelete={onConfirmDelete}
        onSubmit={onSubmit}
        open
        pending={false}
        workspace={createWorkspace()}
      />
    );
  });

  it("renders pending delete confirmation with the shared stable button structure", () => {
    const workspace = createWorkspace();
    const { rerender } = render(
      <WorkspaceSettingsOverlay
        onCancel={vi.fn()}
        onConfirmDelete={vi.fn()}
        onSubmit={vi.fn()}
        open
        pending={false}
        workspace={workspace}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Delete workspace" }));
    rerender(
      <WorkspaceSettingsOverlay
        deletePending
        onCancel={vi.fn()}
        onConfirmDelete={vi.fn()}
        onSubmit={vi.fn()}
        open
        pending={false}
        workspace={workspace}
      />
    );

    const dialog = screen.getByRole("dialog", { name: "Delete workspace" });
    const deleteButton = within(dialog).getByRole("button", { name: "Deleting" });

    expect(deleteButton).toBeDisabled();
    expect(deleteButton).toHaveAttribute("aria-busy", "true");
    expect(deleteButton).toHaveClass("docsera-delete-confirmation-button");
    const spinnerSlot = deleteButton.querySelector(".docsera-delete-confirmation-button__spinner-slot");
    expect(spinnerSlot).toBeInTheDocument();
    expect(spinnerSlot?.querySelector(".docsera-delete-confirmation-button__spinner")).toBeInTheDocument();
    expect(deleteButton.querySelector(".docsera-delete-confirmation-button__label")).toHaveTextContent("Deleting");
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Close delete workspace dialog" })).toBeDisabled();
  });

  it("keeps uploaded and built-in icon selection and upload activation intact with the stable upload label", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:workspace-icon")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    const uploadIcon = vi.fn(async () => ({
      state: "succeeded" as const,
      icon: {
        type: "uploaded" as const,
        key: "asset-key-001",
        label: "custom.png",
        assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=asset-key-001"
      }
    }));

    render(
      <WorkspaceSettingsOverlay
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        onUploadIcon={uploadIcon}
        open
        pending={false}
        workspace={createWorkspace()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Security" }));
    expect(screen.getByRole("button", { name: "Security, selected" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(screen.getByLabelText("Upload custom workspace icon"), {
      target: { files: [new File(["image"], "custom.png", { type: "image/png" })] }
    });

    expect(await screen.findByText("Custom image uploaded.")).toBeInTheDocument();
    expect(uploadIcon).toHaveBeenCalledWith({ file: expect.any(File), workspaceSysId: "workspace-001" });
    expect(screen.getByRole("button", { name: "Upload custom workspace icon" })).toBeInTheDocument();

    const uploadedOption = screen.getByRole("button", { name: /current uploaded icon, selected/ });
    expect(uploadedOption).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Documentation" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Documentation, selected" })).toHaveAttribute("aria-pressed", "true"));
  });

  it("scopes compact icon sizing and left-aligned settings actions to Workspace Settings", () => {
    const source = readRuntimeShellCss();
    const settingsGridBlock = source.match(/\.docsera-workspace-settings-overlay \.docsera-workspace-icon-picker__grid \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const settingsOptionBlock = source.match(/\.docsera-workspace-settings-overlay \.docsera-workspace-icon-picker__option \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const settingsBadgeBlock = source.match(/\.docsera-workspace-settings-overlay \.docsera-workspace-icon-picker__option \.docsera-workspace-icon-badge \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const settingsLegendBlock = source.match(/\.docsera-workspace-settings-overlay \.docsera-workspace-icon-picker > \.docsera-workspace-settings-overlay__label \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const settingsOptionHoverBlock = source.match(/\.docsera-workspace-settings-overlay \.docsera-workspace-icon-picker__option:not\(:disabled\):hover \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const settingsOptionFocusBlock = source.match(/\.docsera-workspace-settings-overlay \.docsera-workspace-icon-picker__option:focus-visible \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const settingsOptionSelectedBlock = source.match(/\.docsera-workspace-settings-overlay \.docsera-workspace-icon-picker__option--selected \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const settingsActionBlock = source.match(/\.docsera-workspace-settings-overlay \.docsera-workspace-icon-picker__upload-button,\n\.docsera-workspace-settings-overlay__access-button \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const settingsActionHoverBlock = source.match(/\.docsera-workspace-settings-overlay \.docsera-workspace-icon-picker__upload-button:not\(:disabled\):hover,\n\.docsera-workspace-settings-overlay__access-button:not\(:disabled\):hover \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const settingsActionFocusBlock = source.match(/\.docsera-workspace-settings-overlay \.docsera-workspace-icon-picker__upload-button:focus-visible,\n\.docsera-workspace-settings-overlay__access-button:focus-visible \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const sharedOptionBlock = source.match(/\.docsera-workspace-icon-picker__option \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const sharedOptionHoverBlock = source.match(/\.docsera-workspace-icon-picker__option:not\(:disabled\):hover \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const sharedOptionFocusBlock = source.match(/\.docsera-workspace-icon-picker__option:focus-visible \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const sharedOptionSelectedBlock = source.match(/\.docsera-workspace-icon-picker__option--selected \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const sharedBadgeBlock = source.match(/\.docsera-workspace-icon-picker__option \.docsera-workspace-icon-badge \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const sharedUploadHoverBlock = source.match(/\.docsera-workspace-icon-picker__upload-button:not\(:disabled\):hover \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const sharedUploadFocusBlock = source.match(/\.docsera-workspace-icon-picker__upload-button:focus-visible \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const destructiveActionBlock = source.match(/\.docsera-destructive-action \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const destructiveActionHoverBlock = source.match(/\.docsera-destructive-action:hover:not\(:disabled\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const darkDestructiveActionBlock = source.match(/html\[data-docsera-theme="dark"\] \.docsera-destructive-action \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const deleteConfirmationBlock = source.match(/\.docsera-delete-confirmation-button \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const deleteSpinnerSlotBlock = source.match(/\.docsera-delete-confirmation-button__spinner-slot \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const deleteSpinnerBlock = source.match(/\.docsera-delete-confirmation-button__spinner \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const deleteLabelBlock = source.match(/\.docsera-delete-confirmation-button__label \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const deleteBusyBlock = source.match(/\.docsera-delete-confirmation-button:disabled\[aria-busy="true"\] \{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(settingsGridBlock).toContain("grid-template-columns: repeat(auto-fill, 36px);");
    expect(settingsGridBlock).toContain("justify-content: start;");
    expect(settingsOptionBlock).toContain("width: 36px;");
    expect(settingsOptionBlock).toContain("height: 36px;");
    expect(settingsBadgeBlock).toContain("width: 24px;");
    expect(settingsBadgeBlock).toContain("height: 24px;");
    expect(settingsLegendBlock).toContain("margin-bottom: 8px;");
    expect(settingsActionBlock).toContain("justify-self: start;");
    expect(settingsActionHoverBlock).toContain("border-color: var(--docsera-primary);");
    expect(settingsActionHoverBlock).toContain("color: var(--docsera-primary);");
    expect(settingsActionFocusBlock).toContain("outline: 2px solid color-mix(in srgb, var(--docsera-primary) 32%, transparent);");
    expect(settingsOptionHoverBlock).toContain("border-color: var(--docsera-primary);");
    expect(settingsOptionHoverBlock).toContain("background: color-mix(in srgb, var(--docsera-primary-soft) 30%, var(--docsera-surface) 70%);");
    expect(settingsOptionFocusBlock).toContain("outline: 2px solid color-mix(in srgb, var(--docsera-primary) 32%, transparent);");
    expect(settingsOptionSelectedBlock).toContain("border-color: var(--docsera-primary);");
    expect(settingsOptionSelectedBlock).toContain("background: color-mix(in srgb, var(--docsera-primary-soft) 72%, var(--docsera-surface) 28%);");
    expect(settingsOptionSelectedBlock).toContain("box-shadow: inset 0 0 0 1px var(--docsera-primary);");
    expect(sharedOptionBlock).toContain("min-height: 72px;");
    expect(sharedBadgeBlock).toContain("width: 46px;");
    expect(sharedOptionHoverBlock).toContain("var(--docsera-secondary)");
    expect(sharedOptionFocusBlock).toContain("var(--docsera-secondary)");
    expect(sharedOptionSelectedBlock).toContain("var(--docsera-secondary)");
    expect(sharedUploadHoverBlock).toContain("var(--docsera-secondary)");
    expect(sharedUploadFocusBlock).toContain("var(--docsera-secondary)");
    expect(destructiveActionBlock).toContain("display: inline-flex;");
    expect(destructiveActionBlock).toContain("min-height: 40px;");
    expect(destructiveActionBlock).toContain("border: 1px solid rgba(186, 26, 26, 0.18);");
    expect(destructiveActionBlock).toContain("border-radius: 4px;");
    expect(destructiveActionBlock).toContain("color: var(--docsera-error);");
    expect(destructiveActionHoverBlock).toContain("background: rgba(186, 26, 26, 0.14);");
    expect(darkDestructiveActionBlock).toContain("background: rgba(255, 138, 128, 0.08);");
    expect(darkDestructiveActionBlock).toContain("border-color: rgba(255, 138, 128, 0.2);");
    expect(deleteConfirmationBlock).toContain("width: 164px;");
    expect(deleteConfirmationBlock).toContain("min-width: 164px;");
    expect(deleteSpinnerSlotBlock).toContain("position: absolute;");
    expect(deleteSpinnerSlotBlock).toContain("top: 50%;");
    expect(deleteSpinnerSlotBlock).toContain("left: 12px;");
    expect(deleteSpinnerSlotBlock).toContain("transform: translateY(-50%);");
    expect(deleteSpinnerBlock).not.toContain("position: absolute;");
    expect(deleteSpinnerBlock).not.toContain("translateY");
    expect(deleteSpinnerBlock).toContain("border: 2px solid color-mix(in srgb, currentColor 38%, transparent);");
    expect(deleteSpinnerBlock).toContain("border-top-color: currentColor;");
    expect(deleteSpinnerBlock).toContain("animation: docsera-spin 0.8s linear infinite;");
    expect(deleteLabelBlock).toContain("width: 100%;");
    expect(deleteLabelBlock).toContain("text-align: center;");
    expect(deleteBusyBlock).toContain("opacity: 1;");
  });
});
