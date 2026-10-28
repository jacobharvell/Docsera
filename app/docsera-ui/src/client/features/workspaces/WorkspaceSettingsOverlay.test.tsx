import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import type { WorkspaceViewRecord } from "../../shared/types/docsera";
import { PageSettingsOverlay } from "./PageSettingsOverlay";
import { WorkspaceManageAccessOverlay } from "./WorkspaceManageAccessOverlay";
import { WorkspaceSettingsOverlay } from "./WorkspaceSettingsOverlay";
import { DOCSERA_PANEL_TRANSITION_MS } from "./usePanelTransitionPresence";

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

function readCssRuleBlock(source: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return source.match(new RegExp(`${escapedSelector} \\{([\\s\\S]*?)\\n\\}`))?.[1] ?? "";
}

describe("WorkspaceSettingsOverlay", () => {
  it("mounts each opening panel in its initial visual state before activating the entry transition", async () => {
    vi.useFakeTimers();
    try {
      const workspace = createWorkspace();
      const pagePanelRef = createRef<HTMLElement>();
      const { container, rerender } = render(
        <WorkspaceSettingsOverlay
          onCancel={vi.fn()}
          onSubmit={vi.fn()}
          open={false}
          pending={false}
          workspace={workspace}
        />
      );

      rerender(
        <WorkspaceSettingsOverlay
          onCancel={vi.fn()}
          onSubmit={vi.fn()}
          open
          pending={false}
          workspace={workspace}
        />
      );

      expect(container.querySelector(".docsera-workspace-settings-overlay")).toHaveClass("docsera-workspace-settings-overlay--closing");
      await act(async () => {
        vi.advanceTimersByTime(16);
      });
      expect(container.querySelector(".docsera-workspace-settings-overlay")).toHaveClass("docsera-workspace-settings-overlay--closing");
      await act(async () => {
        vi.advanceTimersByTime(16);
      });
      expect(container.querySelector(".docsera-workspace-settings-overlay")).toHaveClass("docsera-workspace-settings-overlay--open");

      rerender(
        <WorkspaceManageAccessOverlay
          loadMembers={vi.fn(async () => ({ status: "success" as const, callerCapabilities: { canManageWorkspaceMembers: true }, members: [] }))}
          onBack={vi.fn()}
          onClose={vi.fn()}
          onMutationCommitted={vi.fn()}
          open={false}
          removeMemberAccess={vi.fn()}
          searchUsers={vi.fn()}
          setMemberAccess={vi.fn()}
          workspace={workspace}
        />
      );
      rerender(
        <WorkspaceManageAccessOverlay
          loadMembers={vi.fn(async () => ({ status: "success" as const, callerCapabilities: { canManageWorkspaceMembers: true }, members: [] }))}
          onBack={vi.fn()}
          onClose={vi.fn()}
          onMutationCommitted={vi.fn()}
          open
          removeMemberAccess={vi.fn()}
          searchUsers={vi.fn()}
          setMemberAccess={vi.fn()}
          workspace={workspace}
        />
      );

      expect(container.querySelector(".docsera-manage-access")).toHaveClass("docsera-manage-access--closing");
      await act(async () => {
        vi.advanceTimersByTime(16);
      });
      expect(container.querySelector(".docsera-manage-access")).toHaveClass("docsera-manage-access--closing");
      await act(async () => {
        vi.advanceTimersByTime(16);
      });
      expect(container.querySelector(".docsera-manage-access")).toHaveClass("docsera-manage-access--open");

      rerender(
        <PageSettingsOverlay
          activeField=""
          canManagePageSettings
          generalError=""
          open={false}
          panelRef={pagePanelRef}
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
      rerender(
        <PageSettingsOverlay
          activeField=""
          canManagePageSettings
          generalError=""
          open
          panelRef={pagePanelRef}
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

      expect(container.querySelector(".docsera-page-settings")).toHaveClass("docsera-page-settings--closing");
      await act(async () => {
        vi.advanceTimersByTime(16);
      });
      expect(container.querySelector(".docsera-page-settings")).toHaveClass("docsera-page-settings--closing");
      await act(async () => {
        vi.advanceTimersByTime(16);
      });
      expect(container.querySelector(".docsera-page-settings")).toHaveClass("docsera-page-settings--open");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps Workspace Settings visually mounted only for the shared exit transition window", async () => {
    vi.useFakeTimers();
    try {
      const firstWorkspace = createWorkspace();
      const freshWorkspace = createWorkspace({ name: "API Docs", shortDescription: "Fresh workspace settings." });
      const { container, rerender } = render(
        <WorkspaceSettingsOverlay
          onCancel={vi.fn()}
          onSubmit={vi.fn()}
          open
          pending={false}
          workspace={firstWorkspace}
        />
      );

      await act(async () => {
        vi.advanceTimersByTime(32);
      });
      expect(container.querySelector(".docsera-workspace-settings-overlay")).toHaveClass("docsera-workspace-settings-overlay--open");
      expect(screen.getByDisplayValue("Product Docs")).toBeInTheDocument();

      rerender(
        <WorkspaceSettingsOverlay
          onCancel={vi.fn()}
          onSubmit={vi.fn()}
          open={false}
          pending={false}
          workspace={null}
        />
      );

      const closingOverlay = container.querySelector(".docsera-workspace-settings-overlay");
      expect(closingOverlay).toHaveClass("docsera-workspace-settings-overlay--closing");
      expect(closingOverlay).toHaveAttribute("aria-hidden", "true");
      expect(closingOverlay).toHaveAttribute("inert");
      expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument();
      expect(screen.getByDisplayValue("Product Docs")).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(DOCSERA_PANEL_TRANSITION_MS - 1);
      });
      expect(container.querySelector(".docsera-workspace-settings-overlay")).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(1);
      });
      expect(container.querySelector(".docsera-workspace-settings-overlay")).not.toBeInTheDocument();

      rerender(
        <WorkspaceSettingsOverlay
          onCancel={vi.fn()}
          onSubmit={vi.fn()}
          open
          pending={false}
          workspace={freshWorkspace}
        />
      );

      await act(async () => {
        vi.advanceTimersByTime(32);
      });
      expect(screen.getByDisplayValue("API Docs")).toBeInTheDocument();
      expect(screen.queryByDisplayValue("Product Docs")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps invalid Workspace Settings drafts logically open instead of starting the exit transition", () => {
    const onCancel = vi.fn();
    const onSubmit = vi.fn();
    const { container } = render(
      <WorkspaceSettingsOverlay
        onCancel={onCancel}
        onSubmit={onSubmit}
        open
        pending={false}
        workspace={createWorkspace()}
      />
    );

    fireEvent.change(screen.getByLabelText("Workspace name"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Close workspace settings" }));

    expect(screen.getByRole("complementary", { name: "Workspace Settings" })).toBeInTheDocument();
    expect(container.querySelector(".docsera-workspace-settings-overlay")).toHaveClass("docsera-workspace-settings-overlay--open");
    expect(screen.getByText("Workspace name is required.")).toBeInTheDocument();
    expect(onCancel).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("keeps Page Settings visually mounted during valid close while invalid drafts stay open", async () => {
    vi.useFakeTimers();
    try {
      const panelRef = createRef<HTMLElement>();
      const onRequestClose = vi.fn();
      const { container, rerender } = render(
        <PageSettingsOverlay
          activeField=""
          canManagePageSettings
          generalError=""
          open
          panelRef={panelRef}
          pageSlug="overview"
          pageTitle="Overview"
          slugError=""
          titleError=""
          onCancelField={vi.fn()}
          onChangeField={vi.fn()}
          onFinishField={vi.fn()}
          onRequestClose={onRequestClose}
          onRequestDelete={vi.fn()}
          onStartField={vi.fn()}
        />
      );

      await act(async () => {
        vi.advanceTimersByTime(32);
      });
      expect(container.querySelector(".docsera-page-settings")).toHaveClass("docsera-page-settings--open");

      rerender(
        <PageSettingsOverlay
          activeField=""
          canManagePageSettings
          generalError=""
          open={false}
          panelRef={panelRef}
          pageSlug=""
          pageTitle=""
          slugError=""
          titleError=""
          onCancelField={vi.fn()}
          onChangeField={vi.fn()}
          onFinishField={vi.fn()}
          onRequestClose={onRequestClose}
          onRequestDelete={vi.fn()}
          onStartField={vi.fn()}
        />
      );

      expect(container.querySelector(".docsera-page-settings")).toHaveClass("docsera-page-settings--closing");
      expect(screen.queryByRole("complementary", { name: "Page Settings" })).not.toBeInTheDocument();
      expect(screen.getByText("Overview")).toBeInTheDocument();
      expect(screen.getByText("overview")).toBeInTheDocument();
      expect(screen.queryByText("Untitled page")).not.toBeInTheDocument();
      expect(screen.queryByText("page-slug")).not.toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(DOCSERA_PANEL_TRANSITION_MS);
      });
      expect(container.querySelector(".docsera-page-settings")).not.toBeInTheDocument();

      rerender(
        <PageSettingsOverlay
          activeField=""
          canManagePageSettings
          generalError=""
          open
          panelRef={panelRef}
          pageSlug="getting-started"
          pageTitle="Getting Started"
          slugError=""
          titleError=""
          onCancelField={vi.fn()}
          onChangeField={vi.fn()}
          onFinishField={vi.fn()}
          onRequestClose={onRequestClose}
          onRequestDelete={vi.fn()}
          onStartField={vi.fn()}
        />
      );

      await act(async () => {
        vi.advanceTimersByTime(32);
      });
      expect(screen.getByText("Getting Started")).toBeInTheDocument();
      expect(screen.getByText("getting-started")).toBeInTheDocument();
      expect(screen.queryByText("Overview")).not.toBeInTheDocument();

      rerender(
        <PageSettingsOverlay
          activeField=""
          canManagePageSettings
          generalError=""
          open
          panelRef={panelRef}
          pageSlug="overview"
          pageTitle="Overview"
          slugError=""
          titleError="Title is required."
          onCancelField={vi.fn()}
          onChangeField={vi.fn()}
          onFinishField={vi.fn()}
          onRequestClose={onRequestClose}
          onRequestDelete={vi.fn()}
          onStartField={vi.fn()}
        />
      );

      await act(async () => {
        vi.advanceTimersByTime(32);
      });
      fireEvent.click(screen.getByRole("button", { name: "Close page settings" }));
      expect(onRequestClose).toHaveBeenCalledTimes(1);
      expect(container.querySelector(".docsera-page-settings")).toHaveClass("docsera-page-settings--open");
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps Manage Access mounted for Back and direct close transitions without exposing closing controls", async () => {
    vi.useFakeTimers();
    try {
      const workspace = createWorkspace();
      const { container, rerender } = render(
        <WorkspaceManageAccessOverlay
          loadMembers={vi.fn(async () => ({ status: "success" as const, callerCapabilities: { canManageWorkspaceMembers: true }, members: [] }))}
          onBack={vi.fn()}
          onClose={vi.fn()}
          onMutationCommitted={vi.fn()}
          open
          removeMemberAccess={vi.fn()}
          searchUsers={vi.fn()}
          setMemberAccess={vi.fn()}
          workspace={workspace}
        />
      );

      await act(async () => {
        vi.advanceTimersByTime(32);
      });
      expect(container.querySelector(".docsera-manage-access")).toHaveClass("docsera-manage-access--open");

      rerender(
        <WorkspaceManageAccessOverlay
          loadMembers={vi.fn()}
          onBack={vi.fn()}
          onClose={vi.fn()}
          onMutationCommitted={vi.fn()}
          open={false}
          removeMemberAccess={vi.fn()}
          searchUsers={vi.fn()}
          setMemberAccess={vi.fn()}
          workspace={workspace}
        />
      );

      const closingOverlay = container.querySelector(".docsera-manage-access");
      expect(closingOverlay).toHaveClass("docsera-manage-access--closing");
      expect(closingOverlay).toHaveAttribute("aria-hidden", "true");
      expect(closingOverlay).toHaveAttribute("inert");
      expect(screen.queryByRole("complementary", { name: "Manage access" })).not.toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(DOCSERA_PANEL_TRANSITION_MS);
      });
      expect(container.querySelector(".docsera-manage-access")).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("renders the accepted settings presentation while preserving single-line fields and stable accessible labels", () => {
    const { container } = render(
      <WorkspaceSettingsOverlay
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        open
        pending={false}
        workspace={createWorkspace()}
      />
    );

    const panel = screen.getByRole("complementary", { name: "Workspace Settings" });
    expect(within(panel).getByRole("heading", { name: "GENERAL" })).toBeInTheDocument();
    expect(within(panel).getByRole("group", { name: "Icon" })).toHaveClass("docsera-workspace-settings-overlay__section--icon");
    expect(within(panel).getByRole("heading", { name: "PREFERENCES" })).toBeInTheDocument();

    const nameInput = within(panel).getByLabelText("Workspace name");
    expect(nameInput).toHaveAttribute("type", "text");
    expect(nameInput).toHaveValue("Product Docs");
    expect(nameInput).toHaveClass("docsera-workspace-settings-overlay__input");
    expect(nameInput).not.toHaveClass("docsera-workspace-settings-overlay__input--description");
    expect(within(panel).getByText("Name")).toHaveClass("docsera-workspace-settings-overlay__field-label");

    const descriptionInput = within(panel).getByLabelText("Short description");
    expect(descriptionInput.tagName).toBe("INPUT");
    expect(descriptionInput).toHaveAttribute("type", "text");
    expect(descriptionInput).toHaveAttribute("placeholder", "What is this workspace for?");
    expect(descriptionInput).toHaveClass("docsera-workspace-settings-overlay__input");
    expect(descriptionInput).not.toHaveClass("docsera-workspace-settings-overlay__input--description");
    expect(within(panel).getByText("Description")).toHaveClass("docsera-workspace-settings-overlay__field-label");

    expect(container.querySelector(".docsera-workspace-settings-overlay__body .docsera-workspace-settings-overlay__footer-copy")).not.toBeInTheDocument();
    expect(container.querySelector(".docsera-workspace-settings-overlay__footer")).toHaveTextContent("Changes save automatically when you close this panel.");
    expect(container.querySelector(".docsera-workspace-settings-overlay__footer-dot")).toBeInTheDocument();
  });

  it("shows accepted settings action copy while keeping stable accessible action names capability gated", () => {
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
    expect(within(panel).getByText("Upload custom Icon")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: "Manage workspace access" })).toBeInTheDocument();
    expect(within(panel).getByText("Manage")).toBeInTheDocument();

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

  it("gates the standalone destructive card to settings managers", () => {
    const { rerender } = render(
      <WorkspaceSettingsOverlay
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        open
        pending={false}
        workspace={createWorkspace()}
      />
    );

    expect(screen.queryByRole("heading", { name: "Danger zone" })).not.toBeInTheDocument();
    expect(screen.getByText("Delete workspace")).toHaveClass("docsera-workspace-settings-overlay__danger-title");
    expect(screen.getByText("Permanently removes it and all contents.")).toHaveClass("docsera-workspace-settings-overlay__danger-description");
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
    expect(screen.queryByText("Permanently removes it and all contents.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete workspace" })).not.toBeInTheDocument();
  });

  it("presents preferences as separated rows while preserving the ToC checkbox behavior and access transition", () => {
    const onManageAccess = vi.fn();
    render(
      <WorkspaceSettingsOverlay
        onCancel={vi.fn()}
        onManageAccess={onManageAccess}
        onSubmit={vi.fn()}
        open
        pending={false}
        workspace={createWorkspace()}
      />
    );

    const panel = screen.getByRole("complementary", { name: "Workspace Settings" });
    const preferenceGroup = panel.querySelector(".docsera-workspace-settings-overlay__preference-group");
    expect(preferenceGroup).toBeInTheDocument();
    expect(preferenceGroup?.querySelectorAll(".docsera-workspace-settings-overlay__preference-row")).toHaveLength(2);

    expect(within(panel).getByText("Table of contents")).toBeInTheDocument();
    expect(within(panel).getByText("Show page outlines.")).toBeInTheDocument();
    const tocCheckbox = within(panel).getByRole("checkbox", { name: "Show table of contents" });
    expect(tocCheckbox).toBeChecked();
    expect(tocCheckbox.closest(".docsera-workspace-settings-overlay__switch")).toBeInTheDocument();
    fireEvent.click(tocCheckbox);
    expect(tocCheckbox).not.toBeChecked();

    expect(within(panel).getByText("Access")).toBeInTheDocument();
    expect(within(panel).getByText("Manage workspace Admins and Editors.")).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole("button", { name: "Manage workspace access" }));
    expect(onManageAccess).toHaveBeenCalledWith({ waitForSettingsSave: true, workspaceSysId: "workspace-001" });
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
    const confirmButton = within(screen.getByRole("dialog", { name: "Delete workspace" })).getByRole("button", { name: "Delete" });
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
    const deleteButton = within(dialog).getByRole("button", { name: "Delete" });

    expect(deleteButton).toBeDisabled();
    expect(deleteButton).toHaveAttribute("aria-busy", "true");
    expect(deleteButton).toHaveClass("docsera-delete-confirmation-button");
    const spinnerSlot = deleteButton.querySelector(".docsera-delete-confirmation-button__spinner-slot");
    expect(spinnerSlot).toBeInTheDocument();
    expect(spinnerSlot?.querySelector(".docsera-delete-confirmation-button__spinner")).toBeInTheDocument();
    expect(deleteButton.querySelector(".docsera-delete-confirmation-button__label")).toHaveTextContent("Delete");
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

    fireEvent.change(screen.getByLabelText("Upload custom workspace icon", { selector: "input" }), {
      target: { files: [new File(["image"], "custom.png", { type: "image/png" })] }
    });

    await waitFor(() => expect(screen.getByRole("button", { name: /current uploaded icon, selected/ })).toBeInTheDocument());
    expect(screen.queryByText("Custom image uploaded.")).not.toBeInTheDocument();
    expect(uploadIcon).toHaveBeenCalledWith({ file: expect.any(File), workspaceSysId: "workspace-001" });
    expect(screen.getByRole("button", { name: "Upload custom workspace icon" })).toBeInTheDocument();
    expect(screen.getByText("Upload custom Icon")).toBeInTheDocument();

    const uploadedOption = screen.getByRole("button", { name: /current uploaded icon, selected/ });
    expect(uploadedOption).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Documentation" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Documentation, selected" })).toHaveAttribute("aria-pressed", "true"));
  });

  it("shows invalid icon uploads in a dismissible modal without losing the settings draft", async () => {
    render(
      <WorkspaceSettingsOverlay
        onCancel={vi.fn()}
        onSubmit={vi.fn()}
        onUploadIcon={vi.fn()}
        open
        pending={false}
        workspace={createWorkspace()}
      />
    );

    fireEvent.change(screen.getByLabelText("Workspace name"), { target: { value: "Draft name" } });
    fireEvent.change(screen.getByLabelText("Upload custom workspace icon", { selector: "input" }), {
      target: { files: [new File(["not an image"], "icon.svg", { type: "image/svg+xml" })] }
    });

    const dialog = await screen.findByRole("dialog", { name: "Unable to upload icon" });
    expect(dialog).toHaveTextContent("Use a PNG, JPG, or WebP image.");
    fireEvent.click(within(dialog).getByRole("button", { name: "OK" }));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Unable to upload icon" })).not.toBeInTheDocument());
    expect(screen.getByLabelText("Workspace name")).toHaveValue("Draft name");
    expect(screen.getByRole("complementary", { name: "Workspace Settings" })).toBeInTheDocument();
  });

  it("scopes the larger settings icon grid and left-aligned settings actions to Workspace Settings", () => {
    const source = readRuntimeShellCss();
    const pageSettingsShellBlock = readCssRuleBlock(source, ".docsera-page-settings-shell");
    const pageSettingsBlock = readCssRuleBlock(source, ".docsera-page-settings");
    const pageSettingsOpenBlock = readCssRuleBlock(source, ".docsera-page-settings--open");
    const workspaceOverlayBlock = readCssRuleBlock(source, ".docsera-workspace-settings-overlay");
    const panelBlock = source.match(/\.docsera-workspace-settings-overlay__panel \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const workspaceOverlayOpenBlock = readCssRuleBlock(source, ".docsera-workspace-settings-overlay--open");
    const workspacePanelOpenBlock = readCssRuleBlock(source, ".docsera-workspace-settings-overlay--open .docsera-workspace-settings-overlay__panel");
    const manageAccessBlock = readCssRuleBlock(source, ".docsera-manage-access");
    const manageAccessBackdropBlock = readCssRuleBlock(source, ".docsera-manage-access::after");
    const manageAccessPanelBlock = readCssRuleBlock(source, ".docsera-manage-access__panel");
    const manageAccessOpenBackdropBlock = readCssRuleBlock(source, ".docsera-manage-access--open::after");
    const manageAccessOpenPanelBlock = readCssRuleBlock(source, ".docsera-manage-access--open .docsera-manage-access__panel");
    const reducedMotionBlock = source.match(/@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}\n\n\.docsera-editor-runtime-spike/)?.[1] ?? "";
    const bodyBlock = source.match(/\.docsera-workspace-settings-overlay__body \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const settingsGridBlock = source.match(/\.docsera-workspace-settings-overlay \.docsera-workspace-icon-picker__grid \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const settingsOptionBlock = source.match(/\.docsera-workspace-settings-overlay \.docsera-workspace-icon-picker__option \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const settingsBadgeBlock = source.match(/\.docsera-workspace-settings-overlay \.docsera-workspace-icon-picker__option \.docsera-workspace-icon-badge \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const settingsLegendBlock = source.match(/\.docsera-workspace-settings-overlay \.docsera-workspace-icon-picker > \.docsera-workspace-settings-overlay__section-title \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const settingsOptionHoverBlock = source.match(/\.docsera-workspace-settings-overlay \.docsera-workspace-icon-picker__option:not\(:disabled\):hover \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const settingsOptionFocusBlock = source.match(/\.docsera-workspace-settings-overlay \.docsera-workspace-icon-picker__option:focus-visible \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const settingsOptionSelectedBlock = source.match(/\.docsera-workspace-settings-overlay \.docsera-workspace-icon-picker__option--selected \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const settingsActionBlock = source.match(/\.docsera-workspace-settings-overlay \.docsera-workspace-icon-picker__upload-button,\n\.docsera-workspace-settings-overlay__access-button \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const settingsConstraintBlock = source.match(/\.docsera-workspace-settings-overlay \.docsera-workspace-icon-picker__constraints \{([\s\S]*?)\n\}/)?.[1] ?? "";
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
    const deleteBusyLabelBlock =
      source.match(
        /\.docsera-delete-confirmation-button\[aria-busy="true"\] \.docsera-delete-confirmation-button__label \{([\s\S]*?)\n\}/
      )?.[1] ?? "";
    const deleteBusyBlock = source.match(/\.docsera-delete-confirmation-button:disabled\[aria-busy="true"\] \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const destructiveBusyBlock = source.match(/\.docsera-modal__primary--destructive:disabled\[aria-busy="true"\] \{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(pageSettingsShellBlock).toContain("inset: 0 auto 0 var(--docsera-workspace-nav-width);");
    expect(pageSettingsShellBlock).toContain("width: min(432px, calc(100vw - var(--docsera-workspace-nav-width)));");
    expect(pageSettingsShellBlock).toContain("overflow: clip;");
    expect(pageSettingsBlock).toContain("position: absolute;");
    expect(pageSettingsBlock).toContain("inset: 0 auto 0 0;");
    expect(pageSettingsBlock).toContain("width: 100%;");
    expect(pageSettingsBlock).toContain("transform: translateX(-100%);");
    expect(pageSettingsBlock).toContain("opacity 200ms cubic-bezier(0.4, 0, 0.2, 1)");
    expect(pageSettingsBlock).toContain("transform 200ms cubic-bezier(0.4, 0, 0.2, 1)");
    expect(pageSettingsOpenBlock).toContain("pointer-events: auto;");
    expect(pageSettingsOpenBlock).toContain("transform: translateX(0);");
    expect(workspaceOverlayBlock).toContain("pointer-events: none;");
    expect(panelBlock).toContain("box-sizing: border-box;");
    expect(panelBlock).toContain("transform: translateX(100%);");
    expect(panelBlock).toContain("opacity 200ms cubic-bezier(0.4, 0, 0.2, 1)");
    expect(workspaceOverlayOpenBlock).toContain("pointer-events: auto;");
    expect(workspacePanelOpenBlock).toContain("transform: translateX(0);");
    expect(manageAccessBlock).toContain("pointer-events: none;");
    expect(manageAccessBackdropBlock).toContain("opacity: 0;");
    expect(manageAccessBackdropBlock).toContain("transition: opacity 200ms cubic-bezier(0.4, 0, 0.2, 1);");
    expect(manageAccessPanelBlock).toContain("transform: translateX(100%);");
    expect(manageAccessPanelBlock).toContain("opacity 200ms cubic-bezier(0.4, 0, 0.2, 1)");
    expect(manageAccessOpenBackdropBlock).toContain("opacity: 1;");
    expect(manageAccessOpenPanelBlock).toContain("transform: translateX(0);");
    expect(reducedMotionBlock).toContain(".docsera-page-settings");
    expect(reducedMotionBlock).toContain(".docsera-workspace-settings-overlay__panel");
    expect(reducedMotionBlock).toContain(".docsera-manage-access::after");
    expect(reducedMotionBlock).toContain(".docsera-manage-access__panel");
    expect(bodyBlock).toContain("overflow-x: clip;");
    expect(bodyBlock).toContain("scrollbar-gutter: stable;");
    expect(settingsGridBlock).toContain("grid-template-columns: repeat(6, minmax(0, 1fr));");
    expect(settingsGridBlock).toContain("justify-content: stretch;");
    expect(settingsOptionBlock).toContain("width: 100%;");
    expect(settingsOptionBlock).toContain("min-height: 60px;");
    expect(settingsOptionBlock).toContain("height: 60px;");
    expect(settingsOptionBlock).toContain("border-radius: 8px;");
    expect(settingsBadgeBlock).toContain("width: 28px;");
    expect(settingsBadgeBlock).toContain("height: 28px;");
    expect(settingsLegendBlock).toContain("color: var(--docsera-text);");
    expect(settingsLegendBlock).toContain("font-weight: 700;");
    expect(settingsLegendBlock).toContain("letter-spacing: 0;");
    expect(settingsLegendBlock).toContain("margin-bottom: 0;");
    expect(settingsLegendBlock).toContain("text-transform: none;");
    expect(settingsActionBlock).toContain("justify-self: start;");
    expect(settingsConstraintBlock).toContain("max-width: none;");
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
    expect(deleteConfirmationBlock).toContain("position: relative;");
    expect(deleteConfirmationBlock).toContain("display: inline-flex;");
    expect(deleteConfirmationBlock).toContain("align-items: center;");
    expect(deleteConfirmationBlock).toContain("justify-content: center;");
    expect(deleteConfirmationBlock).not.toContain("gap:");
    expect(deleteConfirmationBlock).not.toMatch(/(^|\n)\s*width:/);
    expect(deleteConfirmationBlock).toContain("min-width: auto;");
    expect(deleteSpinnerSlotBlock).toContain("position: absolute;");
    expect(deleteSpinnerSlotBlock).toContain("inset: 0;");
    expect(deleteSpinnerSlotBlock).toContain("align-items: center;");
    expect(deleteSpinnerSlotBlock).toContain("justify-content: center;");
    expect(deleteSpinnerSlotBlock).toContain("pointer-events: none;");
    expect(deleteSpinnerBlock).toContain("border: 2px solid color-mix(in srgb, currentColor 38%, transparent);");
    expect(deleteSpinnerBlock).toContain("border-top-color: currentColor;");
    expect(deleteSpinnerBlock).toContain("animation: docsera-spin 0.8s linear infinite;");
    expect(deleteLabelBlock).toContain("display: inline-block;");
    expect(deleteLabelBlock).not.toContain("width: 100%;");
    expect(deleteLabelBlock).toContain("text-align: center;");
    expect(deleteBusyLabelBlock).toContain("color: transparent;");
    expect(deleteBusyBlock).toContain("opacity: 1;");
    expect(destructiveBusyBlock).toContain("opacity: 1;");
  });

  it("uses the Workspace Settings token-derived control surface and preserves related dark overrides", () => {
    const source = readRuntimeShellCss();
    const workspaceInputBlock = source.match(/\.docsera-workspace-settings-overlay__input \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const darkPageAndCloseBlock =
      source.match(
        /html\[data-docsera-theme="dark"\] \.docsera-page-settings__value,\nhtml\[data-docsera-theme="dark"\] \.docsera-page-settings__input,\nhtml\[data-docsera-theme="dark"\] \.docsera-workspace-settings-overlay__close \{([\s\S]*?)\n\}/
      )?.[1] ?? "";

    expect(workspaceInputBlock).toContain("min-height: 34px;");
    expect(workspaceInputBlock).toContain("background: color-mix(in srgb, var(--docsera-primary) 4%, var(--docsera-surface) 96%);");
    expect(source).not.toContain(".docsera-workspace-settings-overlay__input--description");
    expect(source).not.toContain("min-height: 68px;");
    expect(source).not.toMatch(
      /html\[data-docsera-theme="dark"\][^{]*\.docsera-workspace-settings-overlay__input[^{]*\{\s*background: rgba\(17, 22, 29, 0\.92\);/
    );
    expect(darkPageAndCloseBlock).toContain("background: rgba(17, 22, 29, 0.92);");
  });

  it("keeps the native ToC checkbox as the full switch hit target while preserving visible token-derived states", () => {
    const source = readRuntimeShellCss();
    const switchBlock = readCssRuleBlock(source, ".docsera-workspace-settings-overlay__switch");
    const disabledSwitchBlock = readCssRuleBlock(source, ".docsera-workspace-settings-overlay__switch:has(input:disabled)");
    const inputBlock = readCssRuleBlock(source, ".docsera-workspace-settings-overlay__switch input");
    const disabledInputBlock = readCssRuleBlock(source, ".docsera-workspace-settings-overlay__switch input:disabled");
    const trackBlock = readCssRuleBlock(source, ".docsera-workspace-settings-overlay__switch-track");
    const thumbBlock = readCssRuleBlock(source, ".docsera-workspace-settings-overlay__switch-thumb");
    const checkedTrackBlock = readCssRuleBlock(source, ".docsera-workspace-settings-overlay__switch input:checked + .docsera-workspace-settings-overlay__switch-track");
    const focusBlock = readCssRuleBlock(source, ".docsera-workspace-settings-overlay__switch input:focus-visible + .docsera-workspace-settings-overlay__switch-track");
    const disabledTrackBlock = readCssRuleBlock(source, ".docsera-workspace-settings-overlay__switch input:disabled + .docsera-workspace-settings-overlay__switch-track");

    expect(switchBlock).toContain("width: 38px;");
    expect(switchBlock).toContain("height: 22px;");
    expect(switchBlock).toContain("cursor: pointer;");
    expect(disabledSwitchBlock).toContain("cursor: not-allowed;");

    expect(inputBlock).toContain("position: absolute;");
    expect(inputBlock).toContain("inset: 0;");
    expect(inputBlock).toContain("z-index: 1;");
    expect(inputBlock).toContain("width: 100%;");
    expect(inputBlock).toContain("height: 100%;");
    expect(inputBlock).toContain("opacity: 0;");
    expect(inputBlock).toContain("cursor: pointer;");
    expect(disabledInputBlock).toContain("cursor: not-allowed;");

    expect(trackBlock).toContain("width: 38px;");
    expect(trackBlock).toContain("height: 22px;");
    expect(trackBlock).toContain("border: 1px solid color-mix(in srgb, var(--docsera-text-soft) 44%, var(--docsera-border) 56%);");
    expect(trackBlock).toContain("background: color-mix(in srgb, var(--docsera-text-soft) 28%, var(--docsera-surface) 72%);");
    expect(trackBlock).toContain("pointer-events: none;");
    expect(trackBlock).not.toContain("color-mix(in srgb, var(--docsera-surface-muted) 82%, var(--docsera-surface) 18%)");

    expect(thumbBlock).toContain("background: var(--docsera-surface);");
    expect(thumbBlock).toContain("box-shadow: 0 0 0 1px color-mix(in srgb, var(--docsera-text-soft) 28%, transparent), 0 1px 2px rgba(15, 23, 42, 0.22);");
    expect(thumbBlock).toContain("pointer-events: none;");

    expect(checkedTrackBlock).toContain("border-color: var(--docsera-primary);");
    expect(checkedTrackBlock).toContain("background: var(--docsera-primary);");
    expect(focusBlock).toContain("outline: 2px solid color-mix(in srgb, var(--docsera-primary) 32%, transparent);");
    expect(disabledTrackBlock).toContain("opacity: 0.62;");
  });
});
