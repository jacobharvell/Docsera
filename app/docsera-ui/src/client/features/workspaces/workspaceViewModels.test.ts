import { describe, expect, it } from "vitest";
import type { WorkspacePageRecord, WorkspaceViewRecord } from "../../shared/types/docsera";
import {
  createDuplicateHeadingDocseraDocumentEnvelope,
  createEmptyHeadingDocseraDocumentEnvelope,
  createHeadingHierarchyDocseraDocumentEnvelope
} from "../../../shared/editor/documentFixtures";
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

  it("assigns deterministic unique anchors for duplicate headings", () => {
    const page = buildWorkspacePageView(
      createPage({
        draftContentJson: createDuplicateHeadingDocseraDocumentEnvelope()
      }),
      "edit"
    );

    expect(page.tocItems).toEqual([
      {
        anchorId: "overview",
        id: "overview",
        level: 2,
        title: "Overview"
      },
      {
        anchorId: "overview-2",
        id: "overview-2",
        level: 3,
        title: "Overview"
      },
      {
        anchorId: "overview-3",
        id: "overview-3",
        level: 2,
        title: "Overview"
      }
    ]);
  });

  it("treats body H1 as the top TOC level while preserving H2 and H3 hierarchy", () => {
    const page = buildWorkspacePageView(
      createPage({
        draftContentJson: createHeadingHierarchyDocseraDocumentEnvelope()
      }),
      "edit"
    );

    expect(page.tocItems).toEqual([
      {
        anchorId: "overview",
        id: "overview",
        level: 1,
        title: "Overview"
      },
      {
        anchorId: "install",
        id: "install",
        level: 2,
        title: "Install"
      },
      {
        anchorId: "cli",
        id: "cli",
        level: 3,
        title: "CLI"
      }
    ]);
  });

  it("skips empty headings so the TOC does not get a broken anchor target", () => {
    const page = buildWorkspacePageView(
      createPage({
        draftContentJson: createEmptyHeadingDocseraDocumentEnvelope()
      }),
      "edit"
    );

    expect(page.tocItems).toEqual([]);
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

  it("sorts finite rank zero before positive sibling ranks", () => {
    const pages = buildWorkspacePageTree(
      [
        createPage({ sysId: "page-first", siblingOrder: 1, draftTitle: "First", draftSlug: "first" }),
        createPage({ sysId: "page-second", siblingOrder: 0, draftTitle: "Second", draftSlug: "second" })
      ],
      "edit"
    );

    expect(pages.map((page) => [page.title, page.siblingOrder])).toEqual([
      ["Second", 0],
      ["First", 1]
    ]);
  });
});
