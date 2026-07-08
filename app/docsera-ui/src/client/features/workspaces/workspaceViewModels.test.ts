import { describe, expect, it } from "vitest";
import type { WorkspacePageRecord, WorkspaceViewRecord } from "../../shared/types/docsera";
import { buildWorkspaceShellPage, buildWorkspaceShellPages, buildWorkspaceShellWorkspace } from "./workspaceViewModels";

function createPage(overrides: Partial<WorkspacePageRecord> = {}): WorkspacePageRecord {
  return {
    sysId: "page-001",
    workspaceSysId: "workspace-001",
    parentPageSysId: null,
    siblingOrder: 1,
    draftTitle: "Overview",
    draftSlug: "overview",
    draftSlugNormalized: "overview",
    draftContentJson: {
      type: "doc",
      content: []
    },
    draftBodyText: "Saved draft body",
    publishedTitle: null,
    publishedSlug: null,
    publishedSlugNormalized: null,
    publishedContentJson: null,
    publishedBodyText: null,
    publicationState: "draft",
    active: true,
    ...overrides
  };
}

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

describe("workspace view models", () => {
  it("carries persisted draft body text into the shell view model", () => {
    const livePage = buildWorkspaceShellPage(createPage());

    expect(livePage.body).toBe("Saved draft body");
  });

  it("preserves saved body text when building a workspace shell workspace", () => {
    const workspace = buildWorkspaceShellWorkspace(createWorkspace(), buildWorkspaceShellPages([createPage()]));

    expect(workspace.pages[0]?.body).toBe("Saved draft body");
  });

  it("preserves the source workspace icon identity for the workspace shell header", () => {
    const workspace = buildWorkspaceShellWorkspace(createWorkspace(), buildWorkspaceShellPages([createPage()]));

    expect(workspace.icon?.key).toBe("docsera-workspace");
    expect(workspace.icon?.label).toBe("Docsera workspace icon");
  });
});
