import { describe, expect, it, vi } from "vitest";
import * as document from "../../../shared/editor/document";
import * as outline from "../../editor/documentOutline";
import type { WorkspacePageRecord } from "../../shared/types/docsera";
import { buildWorkspacePageTree, buildWorkspacePageView } from "./workspaceViewModels";

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
  it.each([2, 500])("processes only the selected document among %i pages", (count) => {
    const parse = vi.spyOn(document, "parseDocseraDocument");
    const extract = vi.spyOn(outline, "extractDocumentOutline");
    const records = Array.from({ length: count }, (_, index) => createPage({
      sysId: `page-${index}`,
      parentPageSysId: index === 1 ? "page-0" : null,
      draftContentJson: index === 0 ? createPage().draftContentJson : "invalid"
    }));
    const tree = buildWorkspacePageTree(records, "edit");
    expect(tree.find((page) => page.sysId === "page-0")?.children?.[0]?.sysId).toBe("page-1");
    expect(parse).not.toHaveBeenCalled();
    expect(extract).not.toHaveBeenCalled();
    const selected = buildWorkspacePageView(records[0]!, "edit");
    expect(selected.contentState).toBe("ready");
    expect(selected.tocItems[0]?.title).toBe("Overview");
    expect(parse).toHaveBeenCalledTimes(1);
    expect(extract).toHaveBeenCalledTimes(1);
    parse.mockRestore();
    extract.mockRestore();
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
