import { describe, expect, it } from "vitest";
import {
  allocatePageSiblingOrder,
  allocatePageSlug,
  collectPageSubtreeSysIds,
  createPageDraft,
  pickNextVisiblePageAfterDelete,
  validatePageSettingsSlug,
  validatePageSettingsTitle
} from "./serverPageDomain";

function createPage(overrides: Partial<{
  sysId: string;
  workspaceSysId: string;
  parentPageSysId: string | null;
  siblingOrder: number;
  draftSlug: string;
  draftSlugNormalized: string;
  publishedSlug: string | null;
  publishedSlugNormalized: string | null;
}> = {}) {
  return {
    sysId: "page-001",
    workspaceSysId: "workspace-001",
    parentPageSysId: null,
    siblingOrder: 1,
    draftSlug: "overview",
    draftSlugNormalized: "overview",
    publishedSlug: null,
    publishedSlugNormalized: null,
    ...overrides
  };
}

describe("server page domain", () => {
  it("validates title and slug rules", () => {
    expect(validatePageSettingsTitle("").valid).toBe(false);
    expect(validatePageSettingsTitle("Updated Title").value).toBe("Updated Title");

    const invalidFormat = validatePageSettingsSlug("Bad/Slug", [createPage()], "workspace-001", "page-001");
    expect(invalidFormat.valid).toBe(false);
    expect(invalidFormat.error).toBe("Invalid slug. Slug must only include letters, numbers, dashes, periods, or underscores.");

    const duplicate = validatePageSettingsSlug("OVERVIEW", [createPage()], "workspace-001", "page-002");
    expect(duplicate.valid).toBe(false);
    expect(duplicate.error).toBe("Slug must be unique within this workspace.");

    const unchanged = validatePageSettingsSlug("overview", [createPage()], "workspace-001", "page-001");
    expect(unchanged.valid).toBe(true);
    expect(unchanged.normalizedValue).toBe("overview");

    const valid = validatePageSettingsSlug("Updated.Slug_1", [createPage()], "workspace-001", "page-002");
    expect(valid.valid).toBe(true);
    expect(valid.normalizedValue).toBe("updated.slug_1");
  });

  it("collects subtree ids and resolves the next visible page after delete", () => {
    const pages = [
      createPage({ sysId: "page-001", siblingOrder: 1, draftSlug: "overview" }),
      createPage({ sysId: "page-002", parentPageSysId: "page-001", siblingOrder: 1, draftSlug: "child-a" }),
      createPage({ sysId: "page-003", parentPageSysId: "page-001", siblingOrder: 2, draftSlug: "child-b" }),
      createPage({ sysId: "page-004", siblingOrder: 2, draftSlug: "details" })
    ];

    expect(collectPageSubtreeSysIds(pages, "page-001")).toEqual(["page-001", "page-002", "page-003"]);
    expect(pickNextVisiblePageAfterDelete(pages, "page-001")).toBe("page-004");
    expect(pickNextVisiblePageAfterDelete(pages, "page-004")).toBe("page-003");
  });

  it("allocates workspace-scoped page slugs", () => {
    const retainedPages = [
      {
        workspaceSysId: "workspace-001",
        draftSlug: "benefits",
        draftSlugNormalized: "benefits"
      },
      {
        workspaceSysId: "workspace-001",
        publishedSlug: "benefits-1",
        publishedSlugNormalized: "benefits-1"
      },
      {
        workspaceSysId: "workspace-002",
        draftSlug: "benefits",
        draftSlugNormalized: "benefits"
      }
    ];

    expect(allocatePageSlug("Benefits", retainedPages, "workspace-001")).toBe("benefits-2");
    expect(allocatePageSlug("Benefits", retainedPages, "workspace-002")).toBe("benefits-1");
  });

  it("allocates sibling order per workspace and parent", () => {
    const retainedPages = [
      {
        workspaceSysId: "workspace-001",
        parentPageSysId: null,
        siblingOrder: 1
      },
      {
        workspaceSysId: "workspace-001",
        parentPageSysId: null,
        siblingOrder: 2
      },
      {
        workspaceSysId: "workspace-001",
        parentPageSysId: "page-parent",
        siblingOrder: 1
      }
    ];

    expect(allocatePageSiblingOrder(retainedPages, "workspace-001", "")).toBe(3);
    expect(allocatePageSiblingOrder(retainedPages, "workspace-001", "page-parent")).toBe(2);
  });

  it("creates root and child drafts with workspace validation", () => {
    const retainedPages = [
      {
        sysId: "page-root-1",
        workspaceSysId: "workspace-001",
        parentPageSysId: null,
        siblingOrder: 1,
        draftSlug: "overview",
        draftSlugNormalized: "overview"
      },
      {
        sysId: "page-root-2",
        workspaceSysId: "workspace-001",
        parentPageSysId: null,
        siblingOrder: 2,
        draftSlug: "guides",
        draftSlugNormalized: "guides"
      },
      {
        sysId: "page-parent",
        workspaceSysId: "workspace-001",
        parentPageSysId: null,
        siblingOrder: 3,
        draftSlug: "release-notes",
        draftSlugNormalized: "release-notes"
      }
    ];

    const rootDraft = createPageDraft(
      {
        workspaceSysId: "workspace-001",
        title: "Release Notes"
      },
      retainedPages
    );

    expect(rootDraft.parentPageSysId).toBeNull();
    expect(rootDraft.siblingOrder).toBe(4);
    expect(rootDraft.draftSlug).toBe("release-notes-1");

    const childDraft = createPageDraft(
      {
        workspaceSysId: "workspace-001",
        parentPageSysId: "page-parent",
        parentPageWorkspaceSysId: "workspace-001",
        title: "Troubleshooting"
      },
      retainedPages
    );

    expect(childDraft.parentPageSysId).toBe("page-parent");
    expect(childDraft.siblingOrder).toBe(1);
    expect(childDraft.draftSlug).toBe("troubleshooting");

    expect(() =>
      createPageDraft({
        workspaceSysId: "workspace-001",
        parentPageSysId: "page-parent",
        parentPageWorkspaceSysId: "workspace-002",
        title: "Broken"
      })
    ).toThrow("A parent page must belong to the same workspace.");
  });
});
