import { describe, expect, it } from "vitest";
import { sortPageRecordsForTree } from "./serviceNowPageQueries";
import type { PageRecord } from "./serverPageDomain";

function createPage(overrides: Partial<PageRecord> = {}): PageRecord {
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
    draftBodyText: null,
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

describe("page query helpers", () => {
  it("orders pages by root, parent, and sibling order", () => {
    const ordered = sortPageRecordsForTree([
      createPage({ sysId: "child-b", parentPageSysId: "root-a", siblingOrder: 2, draftTitle: "Child B", draftSlug: "child-b" }),
      createPage({ sysId: "root-b", siblingOrder: 2, draftTitle: "Root B", draftSlug: "root-b" }),
      createPage({ sysId: "child-a", parentPageSysId: "root-a", siblingOrder: 1, draftTitle: "Child A", draftSlug: "child-a" }),
      createPage({ sysId: "root-a", siblingOrder: 1, draftTitle: "Root A", draftSlug: "root-a" })
    ]);

    expect(ordered.map((page) => page.sysId)).toEqual(["root-a", "child-a", "child-b", "root-b"]);
  });
});
