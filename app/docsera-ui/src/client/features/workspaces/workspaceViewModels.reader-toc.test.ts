import { describe, expect, it } from "vitest";
import type { WorkspacePageRecord } from "../../shared/types/docsera";
import {
  createDuplicateHeadingDocseraDocumentEnvelope,
  createEmptyHeadingDocseraDocumentEnvelope,
  createHeadingHierarchyDocseraDocumentEnvelope
} from "../../../shared/editor/documentFixtures";
import {
  buildWorkspacePageView
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

describe("workspace reader and toc projections", () => {
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
});
