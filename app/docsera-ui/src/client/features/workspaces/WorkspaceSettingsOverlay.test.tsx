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
    expect(within(panel).getByRole("button", { name: "Upload Custom workspace icon" })).toBeInTheDocument();
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

    expect(screen.getByRole("button", { name: "Upload Custom workspace icon" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Manage workspace access" })).not.toBeInTheDocument();
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
    expect(screen.getByRole("button", { name: "Upload Custom workspace icon" })).toBeInTheDocument();

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
  });
});
