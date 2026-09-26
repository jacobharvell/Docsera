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

  it("renders the built-in icon picker as label-free accessible options with a selected state", () => {
    const { container } = render(
      <WorkspaceCreateModal errorMessage="" onClose={vi.fn()} onSubmit={vi.fn()} open phase="idle" />
    );

    const picker = screen.getByRole("group", { name: "Workspace icon" });
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

  it("shows upload constraints and accepts only supported custom icon image types", () => {
    render(<WorkspaceCreateModal errorMessage="" onClose={vi.fn()} onSubmit={vi.fn()} open phase="idle" />);

    const input = screen.getByLabelText("Upload custom workspace icon");
    expect(input).toHaveAttribute("accept", "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp");
    expect(screen.getByText("Square image, minimum 128x128, maximum 1 MB. PNG, JPG, or WebP only.")).toBeInTheDocument();
  });

  it("centers the custom icon upload action without changing the constraint text layout", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    );
    const uploadButtonBlock = source.match(/\.docsera-workspace-icon-picker__upload-button \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const uploadRowBlock = source.match(/\.docsera-workspace-icon-picker__upload-row \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const constraintsBlock = source.match(/\.docsera-workspace-icon-picker__constraints,\n\.docsera-workspace-icon-picker__status \{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(uploadButtonBlock).toContain("justify-self: center;");
    expect(uploadRowBlock).toContain("gap: 8px;");
    expect(uploadRowBlock).not.toContain("margin-top:");
    expect(constraintsBlock).not.toContain("text-align: center;");
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
    fireEvent.change(screen.getByLabelText("Workspace name"), { target: { value: "Custom Icon Docs" } });
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

    fireEvent.change(screen.getByLabelText("Workspace name"), { target: { value: "HR Docs" } });
    fireEvent.change(screen.getByLabelText("Short description"), { target: { value: "People docs" } });
    fireEvent.click(screen.getByRole("button", { name: "Security" }));
    fireEvent.change(screen.getByLabelText("Upload custom workspace icon"), {
      target: { files: [new File(["image"], "broken.webp", { type: "image/webp" })] }
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("The uploaded workspace icon is not valid.");
    expect(screen.getByLabelText("Workspace name")).toHaveValue("HR Docs");
    expect(screen.getByLabelText("Short description")).toHaveValue("People docs");
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

    fireEvent.change(screen.getByLabelText("Workspace name"), { target: { value: "No Member Docs" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(submit).toHaveBeenCalledWith({
      icon: { type: "builtin", key: "docsera-workspace", label: "Docsera workspace icon" },
      name: "No Member Docs",
      shortDescription: ""
    });
    expect(screen.queryByText("Initial Workspace Admin")).not.toBeInTheDocument();
  });

  it("keeps the create action label, geometry, and text position stable across idle, submitting, and polling states", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    );
    const primaryBlock = source.match(/\.docsera-create-workspace-modal__primary \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const primarySpinnerBlock = source.match(/\.docsera-create-workspace-modal__primary-spinner \{([\s\S]*?)\n\}/)?.[1] ?? "";
    const primaryLabelBlock = source.match(/\.docsera-create-workspace-modal__primary-label \{([\s\S]*?)\n\}/)?.[1] ?? "";
    expect(primaryBlock).toContain("position: relative;");
    expect(primaryBlock).toContain("width: 112px;");
    expect(primaryBlock).toContain("min-width: 112px;");
    expect(primarySpinnerBlock).toContain("position: absolute;");
    expect(primarySpinnerBlock).toContain("left: 12px;");
    expect(primarySpinnerBlock).toContain("transform: translateY(-50%);");
    expect(primaryLabelBlock).toContain("width: 100%;");
    expect(primaryLabelBlock).toContain("text-align: center;");
    const spinnerRightEdge = 12 + 16;
    const createLabelLeftEdge = 36;
    expect(spinnerRightEdge).toBeLessThan(createLabelLeftEdge);

    const { rerender } = render(<WorkspaceCreateModal errorMessage="" onClose={vi.fn()} onSubmit={vi.fn()} open phase="idle" />);
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
    expect(screen.getByRole("button", { name: "Security" })).toBeDisabled();
    expect(submit).not.toHaveBeenCalled();

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
