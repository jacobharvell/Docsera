import "@testing-library/jest-dom/vitest";
import { describe, expect, it } from "vitest";
import { createEmptyDocseraDocumentEnvelope } from "../../../shared/editor/document";
import {
  resolvePageTreeDropDestination,
  type PageTreeDropDestination,
  type PageTreeDropPosition
} from "./pageTreeDropResolver";
import { resolvePageTreeDropPresentationAnchor } from "./pageTreeDropPresentation";
import type { WorkspacePageView } from "./workspaceViewModels";

function page(overrides: Partial<WorkspacePageView> & Pick<WorkspacePageView, "id" | "title">): WorkspacePageView {
  const sysId = overrides.sysId ?? overrides.id;
  return {
    children: overrides.children,
    contentEnvelope: createEmptyDocseraDocumentEnvelope(),
    contentError: "",
    contentState: "ready",
    id: overrides.id,
    isDraftOnly: false,
    page: {
      sysId,
      workspaceSysId: "workspace-001",
      parentPageSysId: overrides.parentPageSysId ?? null,
      siblingOrder: overrides.siblingOrder ?? 1,
      draftTitle: overrides.title,
      draftSlug: overrides.title.toLowerCase(),
      draftSlugNormalized: overrides.title.toLowerCase(),
      draftContentJson: createEmptyDocseraDocumentEnvelope(),
      draftRevision: 0,
      draftBodyText: null,
      publishedTitle: overrides.title,
      publishedSlug: overrides.title.toLowerCase(),
      publishedSlugNormalized: overrides.title.toLowerCase(),
      publishedContentJson: createEmptyDocseraDocumentEnvelope(),
      publishedBodyText: null,
      publicationState: "published",
      active: true
    },
    parentPageSysId: overrides.parentPageSysId ?? null,
    publicationState: "published",
    siblingOrder: overrides.siblingOrder ?? 1,
    slug: overrides.slug ?? overrides.title.toLowerCase(),
    statusIndicator: null,
    sysId,
    title: overrides.title,
    tocItems: []
  };
}

function flattenPages(pages: WorkspacePageView[]): WorkspacePageView[] {
  return pages.flatMap((current) => [current, ...flattenPages(current.children ?? [])]);
}

function treeLookups(pages: WorkspacePageView[]) {
  const flatPages = flattenPages(pages);
  const pagesById = new Map(flatPages.map((current) => [current.id, current]));
  const pagesByParent = new Map<string, WorkspacePageView[]>();

  for (const current of flatPages) {
    const key = current.parentPageSysId ?? "";
    const siblings = pagesByParent.get(key) ?? [];
    siblings.push(current);
    pagesByParent.set(key, siblings);
  }

  for (const siblings of pagesByParent.values()) {
    siblings.sort((left, right) => Number(left.siblingOrder) - Number(right.siblingOrder));
  }

  return { pagesById, pagesByParent };
}

function resolveDestination(
  pages: WorkspacePageView[],
  input: Omit<Parameters<typeof resolvePageTreeDropDestination>[0], "pagesById" | "pagesByParent">
) {
  const { pagesById, pagesByParent } = treeLookups(pages);
  return resolvePageTreeDropDestination({
    ...input,
    pagesById,
    pagesByParent
  });
}

function expectDestination(destination: PageTreeDropDestination | null, expected: Partial<PageTreeDropDestination>) {
  expect(destination).not.toBeNull();
  expect(destination as PageTreeDropDestination).toMatchObject(expected);
}

describe("pageTreeDropResolver", () => {
  it("normalizes equivalent peer slots to the lower peer before indicator", () => {
    const pages = [
      page({ id: "dragged", title: "Dragged", siblingOrder: 1 }),
      page({ id: "root-a", title: "Root A", siblingOrder: 2 }),
      page({ id: "root-b", title: "Root B", siblingOrder: 3 }),
      page({
        id: "parent",
        title: "Parent",
        siblingOrder: 4,
        children: [
          page({ id: "nested-a", parentPageSysId: "parent", title: "Nested A", siblingOrder: 1 }),
          page({ id: "nested-b", parentPageSysId: "parent", title: "Nested B", siblingOrder: 2 })
        ]
      })
    ];
    const pagesById = new Map(flattenPages(pages).map((current) => [current.id, current] as const));
    const pagesByParent = treeLookups(pages).pagesByParent;

    expect(
      resolvePageTreeDropPresentationAnchor({
        destination: {
          pageSysId: "dragged",
          parentPageSysId: null,
          position: "after",
          siblingOrder: "2.5",
          targetPageId: "root-a"
        },
        draggedPageId: "dragged",
        pagesById,
        pagesByParent,
        rows: [
          { bottom: 30, depth: 0, pageId: "dragged", top: 0 },
          { bottom: 60, depth: 0, pageId: "root-a", top: 30 },
          { bottom: 90, depth: 0, pageId: "root-b", top: 60 },
          { bottom: 120, depth: 0, pageId: "parent", top: 90 },
          { bottom: 150, depth: 1, pageId: "nested-a", top: 120 },
          { bottom: 180, depth: 1, pageId: "nested-b", top: 150 }
        ]
      })
    ).toEqual({ position: "before", targetPageId: "root-b" });

    expect(
      resolvePageTreeDropPresentationAnchor({
        destination: {
          pageSysId: "dragged",
          parentPageSysId: "parent",
          position: "after",
          siblingOrder: "1.5",
          targetPageId: "nested-a"
        },
        draggedPageId: "dragged",
        pagesById,
        pagesByParent,
        rows: [
          { bottom: 30, depth: 0, pageId: "dragged", top: 0 },
          { bottom: 60, depth: 0, pageId: "root-a", top: 30 },
          { bottom: 90, depth: 0, pageId: "root-b", top: 60 },
          { bottom: 120, depth: 0, pageId: "parent", top: 90 },
          { bottom: 150, depth: 1, pageId: "nested-a", top: 120 },
          { bottom: 180, depth: 1, pageId: "nested-b", top: 150 }
        ]
      })
    ).toEqual({ position: "before", targetPageId: "nested-b" });
  });

  it("returns the same final movement input for equivalent peer descriptions", () => {
    const pages = [
      page({ id: "dragged", title: "Dragged", siblingOrder: 1 }),
      page({ id: "root-a", title: "Root A", siblingOrder: 2 }),
      page({ id: "root-b", title: "Root B", siblingOrder: 3 }),
      page({
        id: "parent",
        title: "Parent",
        siblingOrder: 4,
        children: [
          page({ id: "nested-a", parentPageSysId: "parent", title: "Nested A", siblingOrder: 1 }),
          page({ id: "nested-b", parentPageSysId: "parent", title: "Nested B", siblingOrder: 2 })
        ]
      })
    ];

    const rootAfter = resolveDestination(pages, {
      draggedPageId: "dragged",
      position: "after",
      targetPageId: "root-a"
    });
    const rootBefore = resolveDestination(pages, {
      draggedPageId: "dragged",
      position: "before",
      targetPageId: "root-b"
    });
    const nestedAfter = resolveDestination(pages, {
      draggedPageId: "dragged",
      position: "after",
      targetPageId: "nested-a"
    });
    const nestedBefore = resolveDestination(pages, {
      draggedPageId: "dragged",
      position: "before",
      targetPageId: "nested-b"
    });

    expect(rootAfter).toMatchObject({
      pageSysId: "dragged",
      parentPageSysId: null,
      siblingOrder: "2.5"
    });
    expect(rootBefore).toMatchObject({
      pageSysId: "dragged",
      parentPageSysId: null,
      siblingOrder: "2.5"
    });
    expect(nestedAfter).toMatchObject({
      pageSysId: "dragged",
      parentPageSysId: "parent",
      siblingOrder: "1.5"
    });
    expect(nestedBefore).toMatchObject({
      pageSysId: "dragged",
      parentPageSysId: "parent",
      siblingOrder: "1.5"
    });
  });

  it("keeps hierarchy-distinct boundaries and end positions separate", () => {
    const pages = [
      page({
        id: "parent",
        title: "Parent",
        siblingOrder: 1,
        children: [page({ id: "child", parentPageSysId: "parent", title: "Child" })]
      }),
      page({
        id: "branch",
        title: "Branch",
        siblingOrder: 2,
        children: [page({ id: "descendant", parentPageSysId: "branch", title: "Descendant" })]
      }),
      page({ id: "next-root", title: "Next Root", siblingOrder: 3 })
    ];
    const pagesById = new Map(flattenPages(pages).map((current) => [current.id, current] as const));
    const pagesByParent = treeLookups(pages).pagesByParent;

    expect(
      resolvePageTreeDropPresentationAnchor({
        destination: {
          pageSysId: "dragged",
          parentPageSysId: "parent",
          position: "after",
          siblingOrder: "1.5",
          targetPageId: "parent"
        },
        draggedPageId: "dragged",
        pagesById,
        pagesByParent,
        rows: [
          { bottom: 30, depth: 0, pageId: "parent", top: 0 },
          { bottom: 60, depth: 1, pageId: "child", top: 30 },
          { bottom: 90, depth: 0, pageId: "branch", top: 60 },
          { bottom: 120, depth: 1, pageId: "descendant", top: 90 },
          { bottom: 150, depth: 0, pageId: "next-root", top: 120 }
        ]
      })
    ).toEqual({ position: "after", targetPageId: "parent" });

    expect(
      resolvePageTreeDropPresentationAnchor({
        destination: {
          pageSysId: "dragged",
          parentPageSysId: "branch",
          position: "after",
          siblingOrder: "2.5",
          targetPageId: "descendant"
        },
        draggedPageId: "dragged",
        pagesById,
        pagesByParent,
        rows: [
          { bottom: 30, depth: 0, pageId: "parent", top: 0 },
          { bottom: 60, depth: 1, pageId: "child", top: 30 },
          { bottom: 90, depth: 0, pageId: "branch", top: 60 },
          { bottom: 120, depth: 1, pageId: "descendant", top: 90 },
          { bottom: 150, depth: 0, pageId: "next-root", top: 120 }
        ]
      })
    ).toEqual({ position: "after", targetPageId: "descendant" });

    expect(
      resolvePageTreeDropPresentationAnchor({
        destination: {
          pageSysId: "dragged",
          parentPageSysId: null,
          position: "after",
          siblingOrder: "4",
          targetPageId: "next-root"
        },
        draggedPageId: "dragged",
        pagesById,
        pagesByParent,
        rows: [
          { bottom: 30, depth: 0, pageId: "parent", top: 0 },
          { bottom: 60, depth: 1, pageId: "child", top: 30 },
          { bottom: 90, depth: 0, pageId: "branch", top: 60 },
          { bottom: 120, depth: 1, pageId: "descendant", top: 90 },
          { bottom: 150, depth: 0, pageId: "next-root", top: 120 }
        ]
      })
    ).toEqual({ position: "after", targetPageId: "next-root" });
  });

  it("returns the same movement result for preview and final resolution", () => {
    const pages = [
      page({ id: "root-a", title: "Root A", siblingOrder: 1 }),
      page({ id: "source", title: "Source", siblingOrder: 0 }),
      page({ id: "target", title: "Target", siblingOrder: 2 })
    ];

    const input = {
      draggedPageId: "source",
      position: "before" as PageTreeDropPosition,
      targetPageId: "target"
    };

    const preview = resolveDestination(pages, input);
    const final = resolveDestination(pages, input);

    expect(final).toEqual(preview);
    expectDestination(preview, {
      pageSysId: "source",
      parentPageSysId: null,
      position: "before",
      siblingOrder: "1.5",
      targetPageId: "target"
    });
  });

  it("keeps exactly level six valid and rejects a genuine unrelated level seven move", () => {
    const deepPages = [
      page({
        id: "level-1",
        title: "Level 1",
        siblingOrder: 1,
        children: [
          page({
            id: "level-2",
            parentPageSysId: "level-1",
            title: "Level 2",
            children: [
              page({
                id: "level-3",
                parentPageSysId: "level-2",
                title: "Level 3",
                children: [
                  page({
                    id: "level-4",
                    parentPageSysId: "level-3",
                    title: "Level 4",
                    children: [
                      page({
                        id: "level-5",
                        parentPageSysId: "level-4",
                        title: "Level 5",
                        children: [page({ id: "level-6", parentPageSysId: "level-5", title: "Level 6" })]
                      })
                    ]
                  })
                ]
              })
            ]
          })
        ]
      }),
      page({
        id: "source",
        title: "Source",
        siblingOrder: 2,
        children: [page({ id: "source-child", parentPageSysId: "source", title: "Source Child" })]
      }),
      page({ id: "other", title: "Other", siblingOrder: 3 })
    ];

    expectDestination(
      resolveDestination(deepPages, {
        draggedPageId: "other",
        position: "inside",
        targetPageId: "level-5"
      }),
      {
        pageSysId: "other",
        parentPageSysId: "level-5",
        position: "inside",
        siblingOrder: "2",
        targetPageId: "level-5"
      }
    );

    expect(
      resolveDestination(deepPages, {
        draggedPageId: "source",
        position: "inside",
        targetPageId: "level-5"
      })
    ).toBeNull();
  });

  it("rejects self, descendant, and true no-op destinations", () => {
    const pages = [
      page({
        id: "parent",
        title: "Parent",
        siblingOrder: 1,
        children: [page({ id: "child", parentPageSysId: "parent", title: "Child" })]
      }),
      page({ id: "root-a", title: "Root A", siblingOrder: 1 }),
      page({ id: "root-b", title: "Root B", siblingOrder: 2 })
    ];

    expect(
      resolveDestination(pages, {
        draggedPageId: "parent",
        position: "before",
        targetPageId: "parent"
      })
    ).toBeNull();

    expect(
      resolveDestination(pages, {
        draggedPageId: "parent",
        position: "inside",
        targetPageId: "child"
      })
    ).toBeNull();

    expect(
      resolveDestination(
        [
          page({ id: "root-a", title: "Root A", siblingOrder: 1 }),
          page({ id: "root-b", title: "Root B", siblingOrder: 2 })
        ],
        {
          draggedPageId: "root-a",
          position: "before",
          targetPageId: "root-b"
        }
      )
    ).toBeNull();
  });
});
