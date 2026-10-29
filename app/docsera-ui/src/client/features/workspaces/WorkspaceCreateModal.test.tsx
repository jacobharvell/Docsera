import "@testing-library/jest-dom/vitest";
import type { ComponentProps } from "react";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BUILT_IN_WORKSPACE_ICONS, DEFAULT_BUILT_IN_WORKSPACE_ICON } from "../../../shared/workspaces/domain";
import { WorkspaceCreateModal } from "./WorkspaceCreateModal";

function mockObjectUrl() {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn()
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn()
  });
}

describe("WorkspaceCreateModal", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps Create disabled until the required workspace name is present", () => {
    const submit = vi.fn();
    render(<WorkspaceCreateModal errorMessage="" onClose={vi.fn()} onSubmit={submit} open phase="idle" />);

    const nameInput = screen.getByLabelText("Name");
    const createButton = screen.getByRole("button", { name: "Create" });
    expect(createButton).toBeDisabled();
    expect(createButton).toHaveAttribute("data-disabled-reason", "invalid");

    fireEvent.change(nameInput, { target: { value: "   " } });
    expect(createButton).toBeDisabled();

    fireEvent.change(nameInput, { target: { value: "HR Docs" } });
    expect(createButton).toBeEnabled();
    expect(createButton).not.toHaveAttribute("data-disabled-reason");

    fireEvent.change(nameInput, { target: { value: "" } });
    expect(createButton).toBeDisabled();
    expect(submit).not.toHaveBeenCalled();
  });

  it("blocks form submission from keyboard paths when required input is empty or whitespace-only", () => {
    const submit = vi.fn();
    render(<WorkspaceCreateModal errorMessage="" onClose={vi.fn()} onSubmit={submit} open phase="idle" />);

    const nameInput = screen.getByLabelText("Name");
    const form = nameInput.closest("form");
    if (!form) {
      throw new Error("Expected workspace create input to be inside a form.");
    }

    fireEvent.submit(form);
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getByText("Workspace name is required.")).toBeInTheDocument();

    fireEvent.change(nameInput, { target: { value: "   " } });
    fireEvent.submit(form);
    expect(submit).not.toHaveBeenCalled();

    fireEvent.change(nameInput, { target: { value: "Keyboard Docs" } });
    fireEvent.submit(form);
    expect(submit).toHaveBeenCalledWith({
      icon: { type: "builtin", key: "docsera-workspace", label: "Docsera workspace icon" },
      name: "Keyboard Docs",
      shortDescription: ""
    });
  });

  it("renders the built-in icon picker as label-free accessible options with a selected state", () => {
    const { container } = render(
      <WorkspaceCreateModal errorMessage="" onClose={vi.fn()} onSubmit={vi.fn()} open phase="idle" />
    );

    const picker = screen.getByRole("group", { name: "Icon" });
    const grid = picker.querySelector(".docsera-workspace-icon-picker__grid");
    if (!grid) {
      throw new Error("Expected workspace icon grid to render.");
    }
    const options = within(grid as HTMLElement).getAllByRole("button");
    const defaultOption = within(picker).getByRole("button", { name: `${DEFAULT_BUILT_IN_WORKSPACE_ICON.label}, selected` });

    expect(options).toHaveLength(BUILT_IN_WORKSPACE_ICONS.length);
    expect(defaultOption).toHaveAttribute("aria-pressed", "true");
    expect(defaultOption).toHaveClass("docsera-workspace-icon-picker__option--selected");
    expect(within(picker).getByRole("button", { name: "Security" })).toHaveAttribute("aria-pressed", "false");
    expect(container.querySelector(".docsera-workspace-icon-picker__label")).not.toBeInTheDocument();
    expect(picker).not.toHaveTextContent(DEFAULT_BUILT_IN_WORKSPACE_ICON.label);
    expect(picker.querySelectorAll(".docsera-workspace-icon-badge")).toHaveLength(BUILT_IN_WORKSPACE_ICONS.length);
  });

  it("uses shared tooltips for compact New Workspace controls", async () => {
    render(<WorkspaceCreateModal errorMessage="" onClose={vi.fn()} onSubmit={vi.fn()} open phase="idle" />);

    const closeButton = screen.getByRole("button", { name: "Close modal" });
    expect(closeButton).not.toHaveAttribute("title");

    fireEvent.focus(closeButton);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Close modal");
    expect(closeButton).toHaveAccessibleName("Close modal");
  });

  it("uses Workspace Settings field labels and keeps the description optional note visual-only", () => {
    render(<WorkspaceCreateModal errorMessage="" onClose={vi.fn()} onSubmit={vi.fn()} open phase="idle" />);

    expect(screen.getByText("Name")).toHaveClass("docsera-modal__label");
    expect(screen.getByText("Description").closest(".docsera-modal__label")).toBeInTheDocument();
    expect(screen.getByText("(Optional)")).toHaveClass("docsera-create-workspace-modal__label-note");
    expect(screen.getByText("(Optional)")).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(screen.getByLabelText("Description")).toBeInTheDocument();
    expect(screen.queryByLabelText("Description (Optional)")).not.toBeInTheDocument();
    expect(screen.queryByText("Workspace name")).not.toBeInTheDocument();
    expect(screen.queryByText("Short description")).not.toBeInTheDocument();
  });

  it("shows upload constraints and accepts only supported custom icon image types", () => {
    render(<WorkspaceCreateModal errorMessage="" onClose={vi.fn()} onSubmit={vi.fn()} open phase="idle" />);

    const input = screen.getByLabelText("Upload custom workspace icon");
    expect(input).toHaveAttribute("accept", "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp");
    expect(screen.getByRole("button", { name: "Upload custom icon" })).toBeInTheDocument();
    expect(screen.getByText("Square, 128x128 min, 1 MB max. PNG, JPG or WebP.")).toBeInTheDocument();
  });

  it("uses the shared compact modal header and preserves picker defaults", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    );
    const panelBlock = source.match(/\.docsera-create-workspace-modal \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const bodyBlock = source.match(/\.docsera-create-workspace-modal \.docsera-modal__body \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const labelBlock = source.match(/\.docsera-create-workspace-modal \.docsera-modal__label \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const inputBlock = source.match(/\.docsera-create-workspace-modal \.docsera-modal__input \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const gridBlock = source.match(/\.docsera-create-workspace-modal \.docsera-workspace-icon-picker__grid \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const optionBlock = source.match(/\.docsera-create-workspace-modal \.docsera-workspace-icon-picker__option \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const badgeBlock = source.match(/\.docsera-create-workspace-modal \.docsera-workspace-icon-picker__option \.docsera-workspace-icon-badge \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const optionHoverBlock = source.match(/\.docsera-create-workspace-modal \.docsera-workspace-icon-picker__option:not\(:disabled\):hover \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const optionSelectedBlock = source.match(/\.docsera-create-workspace-modal \.docsera-workspace-icon-picker__option--selected \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const uploadButtonBlock = source.match(/\.docsera-create-workspace-modal \.docsera-workspace-icon-picker__upload-button \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const uploadRowBlock = source.match(/\.docsera-create-workspace-modal \.docsera-workspace-icon-picker__upload-row \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const constraintsBlock = source.match(/\.docsera-workspace-icon-picker__constraints,\n\.docsera-workspace-icon-picker__status \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const modalConstraintsBlock = source.match(/\.docsera-create-workspace-modal \.docsera-workspace-icon-picker__constraints \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const footerBlock = source.match(/\.docsera-create-workspace-modal \.docsera-modal__footer \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const createDisabledBlock = source.match(/\.docsera-create-workspace-modal__primary:disabled:not\(\[aria-busy="true"\]\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const sharedGridBlock = source.match(/\n\.docsera-workspace-icon-picker__grid \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const sharedOptionBlock = source.match(/\.docsera-workspace-icon-picker__option \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const sharedBadgeBlock = source.match(/\.docsera-workspace-icon-picker__option \.docsera-workspace-icon-badge \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const narrowRules = source.slice(source.indexOf("@media (max-width: 680px)"), source.indexOf("@media (prefers-reduced-motion: reduce)"));
    const narrowModalHeaderBlock = narrowRules.match(/\.docsera-modal__header \{([\s\S]*?)\n\s*\}/)?.[1] ?? "";

    expect(panelBlock).toContain("width: min(100%, 448px);");
    expect(bodyBlock).toContain("gap: 16px;");
    expect(bodyBlock).toContain("padding: 20px;");
    expect(labelBlock).toContain("color: var(--docsera-text);");
    expect(labelBlock).toContain("font-weight: 700;");
    expect(labelBlock).toContain("letter-spacing: 0;");
    expect(labelBlock).toContain("text-transform: none;");
    expect(inputBlock).toContain("background: color-mix(in srgb, var(--docsera-primary) 4%, var(--docsera-surface) 96%);");
    expect(gridBlock).toContain("grid-template-columns: repeat(6, minmax(0, 1fr));");
    expect(optionBlock).toContain("height: 60px;");
    expect(optionBlock).toContain("border-radius: 8px;");
    expect(badgeBlock).toContain("width: 28px;");
    expect(badgeBlock).toContain("height: 28px;");
    expect(optionHoverBlock).toContain("border-color: var(--docsera-primary);");
    expect(optionSelectedBlock).toContain("border-color: var(--docsera-primary);");
    expect(optionSelectedBlock).toContain("box-shadow: inset 0 0 0 1px var(--docsera-primary);");
    expect(uploadButtonBlock).toContain("justify-self: start;");
    expect(uploadRowBlock).toContain("display: flex;");
    expect(uploadRowBlock).toContain("flex-wrap: wrap;");
    expect(uploadRowBlock).toContain("column-gap: 12px;");
    expect(uploadRowBlock).toContain("margin-top: 6px;");
    expect(modalConstraintsBlock).toContain("flex: 1 1 220px;");
    expect(footerBlock).toContain("padding: 14px 20px;");
    expect(footerBlock).toContain("background: color-mix(in srgb, var(--docsera-primary) 4%, var(--docsera-surface-muted) 96%);");
    expect(createDisabledBlock).toContain("background: color-mix(in srgb, var(--docsera-surface-muted) 82%, var(--docsera-border) 18%);");
    expect(createDisabledBlock).toContain("color: var(--docsera-text-soft);");
    expect(createDisabledBlock).toContain("box-shadow: none;");
    expect(sharedGridBlock).toContain("grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));");
    expect(sharedOptionBlock).toContain("min-height: 72px;");
    expect(sharedBadgeBlock).toContain("width: 46px;");
    expect(constraintsBlock).not.toContain("text-align: center;");
    expect(narrowModalHeaderBlock).not.toContain("flex-direction: column;");
    expect(source).toMatch(/\.docsera-modal__header\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*space-between;/s);
  });

  it("uploads a custom image, previews it, switches between uploaded and built-in selections, and submits the returned asset key", async () => {
    mockObjectUrl();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:uploaded-preview");
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const upload = vi.fn(async () => ({
      state: "succeeded" as const,
      icon: {
        type: "uploaded" as const,
        key: "asset-key-001",
        label: "custom.png",
        assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=asset-key-001"
      }
    }));
    const submit = vi.fn();
    render(<WorkspaceCreateModal errorMessage="" onClose={vi.fn()} onSubmit={submit} onUploadIcon={upload} open phase="idle" />);

    fireEvent.change(screen.getByLabelText("Upload custom workspace icon"), {
      target: { files: [new File(["image"], "custom.png", { type: "image/png" })] }
    });

    expect(await screen.findByText("Custom image uploaded.")).toBeInTheDocument();
    expect(upload).toHaveBeenCalledWith({ file: expect.any(File) });
    expect(screen.getByRole("button", { name: "custom.png, selected" })).toHaveAttribute("aria-pressed", "true");
    expect(document.querySelector(".docsera-workspace-icon-badge__uploaded-image")).toHaveAttribute("src", "blob:uploaded-preview");

    fireEvent.click(screen.getByRole("button", { name: "Security" }));
    expect(screen.getByRole("button", { name: "Security, selected" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "custom.png" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Custom Icon Docs" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(submit).toHaveBeenCalledWith({
      name: "Custom Icon Docs",
      shortDescription: "",
      icon: {
        type: "uploaded",
        key: "asset-key-001",
        label: "custom.png",
        assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=asset-key-001"
      }
    });
    expect(revokeSpy).not.toHaveBeenCalled();
  });

  it("preserves form values and previous valid icon selection after upload failure", async () => {
    const upload = vi.fn(async () => ({ state: "failed" as const, errorMessage: "The uploaded workspace icon is not valid." }));
    const submit = vi.fn();
    render(<WorkspaceCreateModal errorMessage="" onClose={vi.fn()} onSubmit={submit} onUploadIcon={upload} open phase="idle" />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "HR Docs" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "People docs" } });
    fireEvent.click(screen.getByRole("button", { name: "Security" }));
    fireEvent.change(screen.getByLabelText("Upload custom workspace icon"), {
      target: { files: [new File(["image"], "broken.webp", { type: "image/webp" })] }
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("The uploaded workspace icon is not valid.");
    expect(screen.getByLabelText("Name")).toHaveValue("HR Docs");
    expect(screen.getByLabelText("Description")).toHaveValue("People docs");
    expect(screen.getByRole("button", { name: "Security, selected" })).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(submit).toHaveBeenCalledWith({
      name: "HR Docs",
      shortDescription: "People docs",
      icon: { type: "builtin", key: "security", label: "Security" }
    });
  });

  it("submits accepted workspace creation fields without membership selection", async () => {
    const submit = vi.fn();
    render(<WorkspaceCreateModal errorMessage="" onClose={vi.fn()} onSubmit={submit} open phase="idle" />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "No Member Docs" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(submit).toHaveBeenCalledWith({
      icon: { type: "builtin", key: "docsera-workspace", label: "Docsera workspace icon" },
      name: "No Member Docs",
      shortDescription: ""
    });
    expect(screen.queryByText("Initial Workspace Admin")).not.toBeInTheDocument();
  });

  it("keeps the create action label stable and separates unavailable from processing states", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    );
    const primaryBlock = source.match(/\.docsera-create-workspace-modal__primary \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const primaryDisabledBlock = source.match(/\.docsera-create-workspace-modal__primary:disabled:not\(\[aria-busy="true"\]\) \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const primaryBusyBlock = source.match(/\.docsera-create-workspace-modal__primary:disabled\[aria-busy="true"\] \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const primarySpinnerBlock = source.match(/\.docsera-create-workspace-modal__primary-spinner \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const primaryLabelBlock = source.match(/\.docsera-create-workspace-modal__primary-label \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const primaryBusyLabelBlock = source.match(/\.docsera-create-workspace-modal__primary\[aria-busy="true"\] \.docsera-create-workspace-modal__primary-label \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(primaryBlock).toContain("display: inline-flex;");
    expect(primaryBlock).toContain("position: relative;");
    expect(primaryBlock).not.toContain("gap:");
    expect(primaryBlock).not.toMatch(/(^|\n)\s*width:/);
    expect(primaryBlock).toContain("min-width: auto;");
    expect(primaryDisabledBlock).toContain("background: color-mix(in srgb, var(--docsera-surface-muted) 82%, var(--docsera-border) 18%);");
    expect(primaryDisabledBlock).toContain("color: var(--docsera-text-soft);");
    expect(primaryBusyBlock).toContain("opacity: 1;");
    expect(primarySpinnerBlock).toContain("display: inline-flex;");
    expect(primarySpinnerBlock).toContain("position: absolute;");
    expect(primarySpinnerBlock).toContain("inset: 0;");
    expect(primarySpinnerBlock).toContain("pointer-events: none;");
    expect(primaryLabelBlock).toContain("display: inline-block;");
    expect(primaryLabelBlock).not.toContain("width: 100%;");
    expect(primaryLabelBlock).toContain("text-align: center;");
    expect(primaryBusyLabelBlock).toContain("color: transparent;");

    const { rerender } = render(<WorkspaceCreateModal errorMessage="" onClose={vi.fn()} onSubmit={vi.fn()} open phase="idle" />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Geometry Docs" } });
    const idleButton = screen.getByRole("button", { name: "Create" });
    expect(idleButton).toHaveClass("docsera-create-workspace-modal__primary");
    expect(idleButton).toBeEnabled();
    expect(idleButton).toHaveTextContent("Create");
    expect(idleButton).not.toHaveTextContent("Create Workspace");
    expect(idleButton).not.toHaveTextContent("Creating...");
    expect(idleButton).not.toHaveTextContent("Provisioning...");
    expect(idleButton).not.toHaveAttribute("aria-busy", "true");
    expect(idleButton.querySelector(".docsera-changes-center__spinner")).not.toBeInTheDocument();
    expect(idleButton.querySelector(".docsera-create-workspace-modal__primary-spinner")).not.toBeInTheDocument();
    expect(idleButton.querySelector(".docsera-create-workspace-modal__primary-label")).toHaveTextContent("Create");

    rerender(<WorkspaceCreateModal errorMessage="" onClose={vi.fn()} onSubmit={vi.fn()} open phase="idle" />);
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "" } });
    const unavailableButton = screen.getByRole("button", { name: "Create" });
    expect(unavailableButton).toBeDisabled();
    expect(unavailableButton).toHaveAttribute("data-disabled-reason", "invalid");
    expect(unavailableButton).not.toHaveAttribute("aria-busy");
    expect(unavailableButton.querySelector(".docsera-create-workspace-modal__primary-spinner")).not.toBeInTheDocument();

    rerender(<WorkspaceCreateModal errorMessage="" onClose={vi.fn()} onSubmit={vi.fn()} open phase="submitting" />);
    const submittingButton = screen.getByRole("button", { name: "Create" });
    expect(submittingButton).toBeDisabled();
    expect(submittingButton).toHaveAttribute("aria-busy", "true");
    expect(submittingButton).toHaveTextContent("Create");
    expect(submittingButton).not.toHaveTextContent("Create Workspace");
    expect(submittingButton).not.toHaveTextContent("Creating...");
    expect(submittingButton.querySelector(".docsera-create-workspace-modal__primary-label")).toHaveTextContent("Create");
    expect(submittingButton.querySelector(".docsera-create-workspace-modal__primary-spinner")).toBeInTheDocument();
    expect(submittingButton.querySelector(".docsera-changes-center__spinner")).toBeInTheDocument();

    rerender(<WorkspaceCreateModal errorMessage="" onClose={vi.fn()} onSubmit={vi.fn()} open phase="polling" />);
    const pollingButton = screen.getByRole("button", { name: "Create" });
    expect(pollingButton).toBeDisabled();
    expect(pollingButton).toHaveAttribute("aria-busy", "true");
    expect(pollingButton).toHaveTextContent("Create");
    expect(pollingButton).not.toHaveTextContent("Create Workspace");
    expect(pollingButton).not.toHaveTextContent("Provisioning...");
    expect(pollingButton.querySelector(".docsera-create-workspace-modal__primary-label")).toHaveTextContent("Create");
    expect(pollingButton.querySelector(".docsera-create-workspace-modal__primary-spinner")).toBeInTheDocument();
    expect(pollingButton.querySelector(".docsera-changes-center__spinner")).toBeInTheDocument();
  });

  it("replaces a successful custom image and cleans up the old object preview URL", async () => {
    mockObjectUrl();
    vi.spyOn(URL, "createObjectURL").mockReturnValueOnce("blob:first").mockReturnValueOnce("blob:second");
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const upload = vi
      .fn()
      .mockResolvedValueOnce({ state: "succeeded", icon: { type: "uploaded", key: "asset-1", label: "one.png", assetPath: "/icons/file?assetKey=asset-1" } })
      .mockResolvedValueOnce({ state: "succeeded", icon: { type: "uploaded", key: "asset-2", label: "two.jpg", assetPath: "/icons/file?assetKey=asset-2" } });
    render(<WorkspaceCreateModal errorMessage="" onClose={vi.fn()} onSubmit={vi.fn()} onUploadIcon={upload} open phase="idle" />);

    fireEvent.change(screen.getByLabelText("Upload custom workspace icon"), { target: { files: [new File(["one"], "one.png", { type: "image/png" })] } });
    expect(await screen.findByRole("button", { name: "one.png, selected" })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Upload custom workspace icon"), { target: { files: [new File(["two"], "two.jpg", { type: "image/jpeg" })] } });

    expect(await screen.findByRole("button", { name: "two.jpg, selected" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "one.png, selected" })).not.toBeInTheDocument();
    expect(revokeSpy).toHaveBeenCalledWith("blob:first");
  });

  it("blocks create submission while a custom icon upload is active", async () => {
    let resolveUpload: ((value: { state: "succeeded"; icon: { type: "uploaded"; key: string; label: string; assetPath: string } }) => void) | undefined;
    const upload = vi.fn(() => new Promise<Awaited<ReturnType<NonNullable<ComponentProps<typeof WorkspaceCreateModal>["onUploadIcon"]>>>>((resolve) => {
      resolveUpload = resolve;
    }));
    const submit = vi.fn();
    render(<WorkspaceCreateModal errorMessage="" onClose={vi.fn()} onSubmit={submit} onUploadIcon={upload} open phase="idle" />);

    fireEvent.change(screen.getByLabelText("Upload custom workspace icon"), { target: { files: [new File(["image"], "custom.png", { type: "image/png" })] } });

    expect(await screen.findByText("Uploading workspace icon...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Create" })).toHaveAttribute("data-disabled-reason", "uploading");
    expect(screen.getByRole("button", { name: "Security" })).toBeDisabled();
    expect(submit).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Upload Docs" } });
    resolveUpload?.({ state: "succeeded", icon: { type: "uploaded", key: "asset-key", label: "custom.png", assetPath: "/icons/file?assetKey=asset-key" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Create" })).not.toBeDisabled());
  });

  it("blocks every modal dismissal path while a custom icon upload is active", async () => {
    let resolveUpload: ((value: { state: "succeeded"; icon: { type: "uploaded"; key: string; label: string; assetPath: string } }) => void) | undefined;
    const upload = vi.fn(() => new Promise<Awaited<ReturnType<NonNullable<ComponentProps<typeof WorkspaceCreateModal>["onUploadIcon"]>>>>((resolve) => {
      resolveUpload = resolve;
    }));
    const close = vi.fn();
    render(<WorkspaceCreateModal errorMessage="" onClose={close} onSubmit={vi.fn()} onUploadIcon={upload} open phase="idle" />);

    fireEvent.change(screen.getByLabelText("Upload custom workspace icon"), { target: { files: [new File(["image"], "custom.png", { type: "image/png" })] } });

    expect(await screen.findByText("Uploading workspace icon...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Close modal" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.mouseDown(screen.getByRole("presentation"));
    expect(close).not.toHaveBeenCalled();

    resolveUpload?.({ state: "succeeded", icon: { type: "uploaded", key: "asset-key", label: "custom.png", assetPath: "/icons/file?assetKey=asset-key" } });
    await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).not.toBeDisabled());
  });
});
