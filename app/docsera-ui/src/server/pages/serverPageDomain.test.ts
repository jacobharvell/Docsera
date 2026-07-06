import { describe, expect, it } from "vitest";
import { allocatePageSiblingOrder, allocatePageSlug, createPageDraft } from "./serverPageDomain";

describe("server page domain", () => {
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
