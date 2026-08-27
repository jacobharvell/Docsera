/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublishedDocumentReader } from "./PublishedDocumentReader";
import { buildWorkspacePageView } from "./workspaceViewModels";
import type { DocseraDocumentEnvelope } from "../../../shared/editor/document";
import {
  createFourColumnDocseraDocumentEnvelope,
  createThreeColumnDocseraDocumentEnvelope,
  createTwoColumnDocseraDocumentEnvelope
} from "../../../shared/editor/documentFixtures";
import type { WorkspacePageRecord } from "../../shared/types/docsera";

function createPageRecord(envelope: DocseraDocumentEnvelope): WorkspacePageRecord {
  return {
    sysId: "page-columns-001",
    workspaceSysId: "workspace-columns-001",
    parentPageSysId: null,
    siblingOrder: 1,
    draftTitle: "Columns",
    draftSlug: "columns",
    draftSlugNormalized: "columns",
    draftContentJson: envelope,
    draftRevision: 0,
    draftBodyText: null,
    publishedTitle: "Columns",
    publishedSlug: "columns",
    publishedSlugNormalized: "columns",
    publishedContentJson: envelope,
    publishedBodyText: null,
    publicationState: "published",
    active: true
  };
}

function renderReader(envelope: DocseraDocumentEnvelope) {
  return render(<PublishedDocumentReader envelope={envelope} pageIdentity="page-columns" />);
}

function createAccordionColumnsEnvelope(): DocseraDocumentEnvelope {
  return {
    schemaVersion: 1,
    document: {
      type: "doc",
      content: [
        {
          type: "accordion",
          attrs: { accordionId: "accordion-columns-body" },
          content: [
            {
              type: "accordionItem",
              attrs: { accordionItemId: "accordion-item-columns-body" },
              content: [
                {
                  type: "accordionTitle",
                  content: [{ type: "text", text: "Accordion with columns" }]
                },
                {
                  type: "accordionContent",
                  content: [
                    {
                      type: "columns",
                      content: [
                        {
                          type: "column",
                          content: [
                            {
                              type: "paragraph",
                              content: [{ type: "text", text: "Accordion left" }]
                            }
                          ]
                        },
                        {
                          type: "column",
                          content: [
                            {
                              type: "paragraph",
                              content: [{ type: "text", text: "Accordion right" }]
                            }
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  };
}

function createInvalidNestedColumnsEnvelope(): DocseraDocumentEnvelope {
  return {
    schemaVersion: 1,
    document: {
      type: "doc",
      content: [
        {
          type: "columns",
          content: [
            {
              type: "column",
              content: [
                {
                  type: "blockquote",
                  content: [
                    {
                      type: "columns",
                      content: [
                        {
                          type: "column",
                          content: [{ type: "paragraph", content: [{ type: "text", text: "Nested" }] }]
                        },
                        {
                          type: "column",
                          content: [{ type: "paragraph", content: [{ type: "text", text: "Nested 2" }] }]
                        }
                      ]
                    }
                  ]
                }
              ]
            },
            {
              type: "column",
              content: [{ type: "paragraph", content: [{ type: "text", text: "Valid" }] }]
            }
          ]
        }
      ]
    }
  };
}

describe("PublishedDocumentReader columns", () => {
  it("keeps the reader columns CSS contract on the current responsive boundary", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    );

    expect(source).toContain(".docsera-main__columns {");
    expect(source).toContain("grid-template-columns: repeat(var(--docsera-columns-count), minmax(0, 1fr));");
    expect(source).toContain(".docsera-main__column {");
    expect(source).toContain("overflow-wrap: anywhere;");
    expect(source).toContain("@media (max-width: 920px) {");
    expect(source).toContain(".docsera-main__columns {");
    expect(source).toContain("grid-template-columns: 1fr;");
  });

  it("renders canonical two-column documents with existing heading anchors and nested block content", () => {
    const envelope = createTwoColumnDocseraDocumentEnvelope();
    const page = buildWorkspacePageView(createPageRecord(envelope), "live");

    renderReader(envelope);
    const reader = screen.getByLabelText("Published page content");
    const columns = reader.querySelector(".docsera-main__columns") as HTMLElement | null;

    expect(page.tocItems).toHaveLength(0);
    expect(columns).not.toBeNull();
    expect(columns?.style.getPropertyValue("--docsera-columns-count")).toBe("2");
    expect(reader.querySelectorAll(".docsera-main__column")).toHaveLength(2);
    expect(within(reader).getByRole("heading", { name: "Overview", level: 3 })).toHaveAttribute("id", "overview");
    expect(within(reader).getByText("Left column")).toBeInTheDocument();
    expect(within(reader).getByText("Right column")).toBeInTheDocument();
    expect(within(reader).getByText("Nested list item")).toBeInTheDocument();
  });

  it("renders columns nested inside accordion content after disclosure opens", () => {
    const envelope = createAccordionColumnsEnvelope();

    renderReader(envelope);
    const reader = screen.getByLabelText("Published page content");
    const accordionButton = within(reader).getByRole("button", { name: "Accordion with columns" });

    expect(accordionButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(accordionButton);

    expect(accordionButton).toHaveAttribute("aria-expanded", "true");
    const nestedColumns = reader.querySelector(".docsera-main__accordion-panel .docsera-main__columns") as
      | HTMLElement
      | null;
    expect(nestedColumns).not.toBeNull();
    expect(nestedColumns).toHaveAttribute("data-docsera-columns-count", "2");
    expect(within(reader).getByText("Accordion left")).toBeVisible();
    expect(within(reader).getByText("Accordion right")).toBeVisible();
  });

  it("renders an empty middle column without relying on presentation-only state", () => {
    const envelope = createThreeColumnDocseraDocumentEnvelope();

    renderReader(envelope);
    const reader = screen.getByLabelText("Published page content");
    const columns = Array.from(reader.querySelectorAll(".docsera-main__column")) as HTMLElement[];
    const middleColumn = columns[1];

    expect(reader.querySelector(".docsera-main__columns")?.getAttribute("data-docsera-columns-count")).toBe("3");
    expect(columns).toHaveLength(3);
    expect(middleColumn.querySelectorAll(".docsera-main__body")).toHaveLength(1);
    expect(middleColumn.textContent).toBe("");
    expect(within(reader).getByText("Alpha")).toBeInTheDocument();
    expect(within(reader).getByText("Charlie")).toBeInTheDocument();
  });

  it("preserves source order across four equal-width tracks", () => {
    const envelope = createFourColumnDocseraDocumentEnvelope();

    renderReader(envelope);
    const reader = screen.getByLabelText("Published page content");
    const columnTexts = Array.from(reader.querySelectorAll(".docsera-main__column")).map((column) =>
      column.textContent?.trim() ?? ""
    );

    expect(reader.querySelector(".docsera-main__columns")?.getAttribute("data-docsera-columns-count")).toBe("4");
    expect(columnTexts).toEqual(["North", "East", "South", "West"]);
  });

  it("falls back to the contained invalid-document recovery path for malformed columns", () => {
    renderReader(createInvalidNestedColumnsEnvelope());

    expect(screen.getByRole("heading", { name: "Published content unavailable", level: 2 })).toBeInTheDocument();
    expect(screen.getByText("The published page content could not be rendered safely.")).toBeInTheDocument();
  });
});
