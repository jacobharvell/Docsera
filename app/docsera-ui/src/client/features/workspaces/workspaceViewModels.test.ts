import { describe, expect, it } from "vitest";
import type { WorkspacePageRecord, WorkspaceViewRecord } from "../../shared/types/docsera";
import {
  buildWorkspacePageTree,
  buildWorkspacePageView,
  buildWorkspaceShellViewModel
} from "./workspaceViewModels";

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
      schemaVersion: 1,
      document: {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 2 },
            content: [{ type: "text", text: "Overview" }]
          }
        ]
      }
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
  it("builds a compact shell identity view model", () => {
    const shell = buildWorkspaceShellViewModel(createWorkspace());

    expect(shell.title).toBe("Product Docs");
    expect(shell.roleLabel).toBe("Editor");
    expect(shell.icon.key).toBe("docsera-workspace");
  });

  it("builds toc items from canonical heading content", () => {
    const page = buildWorkspacePageView(createPage(), "edit");

    expect(page.contentState).toBe("ready");
    expect(page.tocItems).toEqual([
      {
        anchorId: "overview",
        id: "overview",
        level: 2,
        title: "Overview"
      }
    ]);
    expect(page.statusIndicator).toBe("Draft");
  });

  it("keeps invalid canonical documents out of the editable ready state", () => {
    const page = buildWorkspacePageView(
      createPage({
        draftContentJson: "{not-json"
      }),
      "edit"
    );

    expect(page.contentState).toBe("invalid");
    expect(page.contentEnvelope).toBeNull();
    expect(page.contentError).toContain("valid JSON");
  });

  it("preserves parent-child relationships from workspace pages", () => {
    const pages = buildWorkspacePageTree(
      [
        createPage({
          sysId: "page-parent",
          draftTitle: "Parent",
          draftSlug: "parent",
          publicationState: "published"
        }),
        createPage({
          sysId: "page-child",
          parentPageSysId: "page-parent",
          siblingOrder: 2,
          draftTitle: "Child",
          draftSlug: "child",
          publicationState: "published_with_unpublished_changes"
        })
      ],
      "edit"
    );

    expect(pages).toHaveLength(1);
    expect(pages[0]?.title).toBe("Parent");
    expect(pages[0]?.children?.[0]?.title).toBe("Child");
    expect(pages[0]?.children?.[0]?.statusIndicator).toBe("Unpublished");
  });
});
