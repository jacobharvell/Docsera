import { describe, expect, it } from "vitest";
import type { WorkspacePageRecord } from "../../shared/types/docsera";
import { buildWorkspacePageTree } from "./workspaceViewModels";

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

describe("workspace page tree view model", () => {
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
