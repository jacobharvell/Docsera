import { describe, expect, it } from "vitest";
import type { WorkspacePageRecord } from "../../shared/types/docsera";
import { buildWorkspacePageView } from "./workspaceViewModels";

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

describe("workspace invalid canonical document projection", () => {
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
});
