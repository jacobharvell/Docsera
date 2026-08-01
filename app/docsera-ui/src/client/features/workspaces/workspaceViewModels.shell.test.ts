import { describe, expect, it } from "vitest";
import type { WorkspaceViewRecord } from "../../shared/types/docsera";
import { buildWorkspaceShellViewModel } from "./workspaceViewModels";

function createWorkspace(): WorkspaceViewRecord {
  return {
    sysId: "workspace-001",
    slug: "product-docs",
    name: "Product Docs",
    shortDescription: "Product documentation",
    icon: {
      type: "builtin",
      key: "docsera-workspace",
      label: "Docsera workspace icon"
    },
    status: "active",
    roleLabel: "Editor",
    canManageSettings: false
  };
}

describe("workspace shell view model", () => {
  it("builds a compact shell identity view model", () => {
    const shell = buildWorkspaceShellViewModel(createWorkspace());

    expect(shell.title).toBe("Product Docs");
    expect(shell.roleLabel).toBe("Editor");
    expect(shell.icon.key).toBe("docsera-workspace");
  });
});
