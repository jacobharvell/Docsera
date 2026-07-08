import { describe, expect, it } from "vitest";
import { filterActivePageRecords, sortPageRecordsForTree } from "./serviceNowPageQueries";
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
  it("filters inactive pages from the workspace page list", () => {
    const filtered = filterActivePageRecords([
      createPage({ sysId: "page-001", active: true }),
      createPage({ sysId: "page-002", active: false }),
      createPage({ sysId: "page-003", active: true })
    ]);

    expect(filtered.map((page) => page.sysId)).toEqual(["page-001", "page-003"]);
  });

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
