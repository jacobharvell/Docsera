import { describe, expect, it } from "vitest";
import {
  createHeadingHierarchyDocseraDocumentEnvelope,
  createHeadingPairDocseraDocumentEnvelope
} from "../../shared/editor/documentFixtures";
import { extractDocumentOutline } from "./documentOutline";

describe("extractDocumentOutline", () => {
  it("treats body H1 as the highest outline level and nests H2 and H3 beneath it", () => {
    expect(extractDocumentOutline(createHeadingHierarchyDocseraDocumentEnvelope())).toEqual([
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

  it("keeps previously supported H2 and H3 outline documents valid", () => {
    expect(extractDocumentOutline(createHeadingPairDocseraDocumentEnvelope())).toEqual([
      {
        anchorId: "section-heading",
        id: "section-heading",
        level: 2,
        title: "Section heading"
      },
      {
        anchorId: "subsection-heading",
        id: "subsection-heading",
        level: 3,
        title: "Subsection heading"
      }
    ]);
  });

  it("skips empty headings without consuming canonical duplicate anchor order", () => {
    expect(
      extractDocumentOutline({
        schemaVersion: 1,
        document: {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 2 },
              content: [{ type: "text", text: "Overview" }]
            },
            {
              type: "heading",
              attrs: { level: 2 },
              content: []
            },
            {
              type: "heading",
              attrs: { level: 3 },
              content: [{ type: "text", text: "Overview" }]
            },
            {
              type: "heading",
              attrs: { level: 2 },
              content: [{ type: "text", text: "Overview" }]
            }
          ]
        }
      })
    ).toEqual([
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
});
