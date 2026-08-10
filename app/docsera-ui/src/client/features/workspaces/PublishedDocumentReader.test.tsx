/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PublishedDocumentReader } from "./PublishedDocumentReader";
import { buildWorkspacePageView } from "./workspaceViewModels";
import type { WorkspacePageRecord } from "../../shared/types/docsera";
import {
  createDuplicateHeadingDocseraDocumentEnvelope,
  createEmptyHeadingDocseraDocumentEnvelope,
  createEmptyHeadingHierarchyDocseraDocumentEnvelope,
  createExpandedTextFormattingDocseraDocumentEnvelope,
  createHeadingHierarchyDocseraDocumentEnvelope,
  createRelativeLinkDocseraDocumentEnvelope,
  createStandardTableDocseraDocumentEnvelope,
  createSupportedE2DocseraDocumentEnvelope
} from "../../../shared/editor/documentFixtures";
import type { DocseraDocumentEnvelope } from "../../../shared/editor/document";

function createPageRecord(envelope: DocseraDocumentEnvelope): WorkspacePageRecord {
  return {
    sysId: "page-001",
    workspaceSysId: "workspace-001",
    parentPageSysId: null,
    siblingOrder: 1,
    draftTitle: "Overview",
    draftSlug: "overview",
    draftSlugNormalized: "overview",
    draftContentJson: envelope,
    draftRevision: 0,
    draftBodyText: null,
    publishedTitle: "Overview",
    publishedSlug: "overview",
    publishedSlugNormalized: "overview",
    publishedContentJson: envelope,
    publishedBodyText: null,
    publicationState: "published",
    active: true
  };
}

function renderReader(envelope: DocseraDocumentEnvelope) {
  return render(<PublishedDocumentReader envelope={envelope} />);
}

describe("PublishedDocumentReader", () => {
  it("keeps live published links unchanged while the editor link color is corrected", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    );

    expect(source).toContain(".docsera-main__reader a {");
    expect(source).toContain("color: var(--docsera-primary);");
    expect(source).toContain(".docsera-main__reader a:hover {");
    expect(source).toContain("color: color-mix(in srgb, var(--docsera-primary) 84%, black);");
    expect(source).not.toContain(".docsera-main__reader a:visited {");
  });

  it("renders the supported E2 envelope with nested lists, marks, task state, code blocks, and safe links", () => {
    const envelope = createSupportedE2DocseraDocumentEnvelope();
    const page = buildWorkspacePageView(createPageRecord(envelope), "live");
    const view = renderReader(envelope);
    const reader = screen.getByLabelText("Published page content");

    expect(within(reader).getByRole("heading", { name: "Overview", level: 3 })).toHaveAttribute("id", "overview");
    expect(within(reader).getByRole("heading", { name: "Nested content", level: 4 })).toHaveAttribute("id", "nested-content");
    expect(page.tocItems.map((item) => item.anchorId)).toEqual(["overview", "nested-content"]);
    expect(page.tocItems.map((item) => item.title)).toEqual(["Overview", "Nested content"]);

    expect(reader.querySelector("ol.docsera-main__list--ordered[start='3']")?.getAttribute("start")).toBe("3");
    expect(reader.querySelector("ol.docsera-main__list--ordered[start='3']")?.getAttribute("type")).toBeNull();
    expect(reader.querySelector("ul.docsera-main__list--bullet li ol.docsera-main__list--ordered")?.getAttribute("start")).toBe("2");
    expect(reader.querySelector("ul.docsera-main__list--bullet li ol.docsera-main__list--ordered")?.getAttribute("type")).toBe("a");

    expect(within(reader).getByText("Bullet item")).toBeInTheDocument();
    expect(within(reader).getByText("Nested ordered")).toBeInTheDocument();
    expect(within(reader).getByText("Ordered item")).toBeInTheDocument();
    expect(within(reader).getByText("Nested bullet")).toBeInTheDocument();
    expect(within(reader).getByText("Nested task")).toBeInTheDocument();
    expect(within(reader).getByText("Checked task")).toBeInTheDocument();
    expect(within(reader).getByText("Nested checked task")).toBeInTheDocument();

    const checkboxes = within(reader).getAllByRole("checkbox") as HTMLInputElement[];
    expect(checkboxes).toHaveLength(3);
    expect(checkboxes.filter((checkbox) => checkbox.checked)).toHaveLength(1);
    expect(checkboxes.filter((checkbox) => !checkbox.checked)).toHaveLength(2);

    const combinedLink = within(reader).getByRole("link", { name: "Combined" });
    expect(combinedLink).toHaveAttribute("href", "https://example.com/docs");
    expect(combinedLink).toHaveAttribute("target", "_blank");
    expect(combinedLink).toHaveAttribute("rel", "noopener noreferrer nofollow");
    expect(combinedLink.closest("strong")).not.toBeNull();
    expect(combinedLink.closest("em")).not.toBeNull();
    expect(combinedLink.closest("s")).not.toBeNull();

    const inlineCode = reader.querySelector(".docsera-main__inline-code");
    expect(inlineCode?.textContent).toBe(" code");
    expect(reader.querySelector("pre code")?.textContent).toBe("const value = 1;   \n");
    expect(reader.querySelectorAll("br")).toHaveLength(1);
    expect(within(reader).getByRole("link", { name: "link" })).toHaveAttribute("href", "https://example.com/docs");
    expect(within(reader).getAllByRole("link")).toHaveLength(2);

    view.unmount();
  });

  it("renders safe relative links with the canonical safe attributes", () => {
    const envelope = createRelativeLinkDocseraDocumentEnvelope();
    renderReader(envelope);
    const reader = screen.getByLabelText("Published page content");
    const link = within(reader).getByRole("link", { name: "Relative link" });

    expect(link).toHaveAttribute("href", "./getting-started?mode=edit#overview");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer nofollow");
    expect(link).toHaveAttribute("title", "Open guide");
  });

  it("renders body H1 plus underline, highlight, superscript, and subscript without theme data in canonical JSON", () => {
    const envelope = createExpandedTextFormattingDocseraDocumentEnvelope();
    const page = buildWorkspacePageView(createPageRecord(envelope), "live");

    renderReader(envelope);

    const reader = screen.getByLabelText("Published page content");
    expect(within(reader).getByRole("heading", { name: "Getting started", level: 2 })).toHaveClass("docsera-main__body-heading");
    expect(within(reader).getByRole("heading", { name: "Install", level: 3 })).toHaveClass("docsera-main__section-title");
    expect(within(reader).getByRole("heading", { name: "npm", level: 4 })).toHaveClass("docsera-main__subsection-title");
    expect(page.tocItems.map((item) => item.level)).toEqual([1, 2, 3]);

    const underline = within(reader).getByText("Underlined");
    expect(underline.closest("u")).not.toBeNull();

    const highlight = within(reader).getByText("highlighted");
    expect(highlight.closest("mark")).toHaveClass("docsera-main__highlight");

    const superscript = within(reader).getByText("bold superscript");
    expect(superscript.closest("sup")).not.toBeNull();
    expect(superscript.closest("strong")).not.toBeNull();

    const subscript = within(reader).getByText("italic subscript");
    expect(subscript.closest("sub")).not.toBeNull();
    expect(subscript.closest("em")).not.toBeNull();
    expect(JSON.stringify(envelope)).not.toContain("color");
  });

  it("renders supported marks even if the runtime array does not expose entries()", () => {
    const envelope = createSupportedE2DocseraDocumentEnvelope();
    const firstParagraph = envelope.document.content?.[1];
    const firstTextNode =
      firstParagraph && typeof firstParagraph === "object" && !Array.isArray(firstParagraph)
        ? (firstParagraph as { content?: unknown[] }).content?.[0]
        : undefined;

    if (firstTextNode && typeof firstTextNode === "object" && !Array.isArray(firstTextNode)) {
      const marks = (firstTextNode as { marks?: unknown }).marks;
      if (Array.isArray(marks)) {
        Object.defineProperty(marks, "entries", {
          configurable: true,
          value: undefined
        });
      }
    }

    renderReader(envelope);

    const reader = screen.getByLabelText("Published page content");
    expect(within(reader).getByRole("link", { name: "Combined" })).toHaveAttribute("href", "https://example.com/docs");
    expect(reader.textContent).toContain("after break");
  });

  it("renders canonical tables with semantic headers, spans, nested blocks, marks, and reader classes", () => {
    const envelope = createStandardTableDocseraDocumentEnvelope();

    renderReader(envelope);

    const reader = screen.getByLabelText("Published page content");
    const wrapper = reader.querySelector(".docsera-main__table-wrapper");
    const table = within(reader).getByRole("table");
    const headerCells = within(table).getAllByRole("columnheader");
    const cells = within(table).getAllByRole("cell");

    expect(wrapper).not.toBeNull();
    expect(table).toHaveClass("docsera-main__table");
    expect(headerCells).toHaveLength(2);
    expect(headerCells[0]).toHaveTextContent("Plan");
    expect(headerCells[0]).toHaveAttribute("colspan", "2");
    expect(headerCells[1]).toHaveTextContent("Owner");
    expect(headerCells[1]).toHaveAttribute("rowspan", "2");
    expect(cells).toHaveLength(2);
    expect(within(table).getByRole("link", { name: "launch" })).toHaveAttribute("href", "https://example.com/launch");
    expect(within(table).getByText("launch").closest("em")).not.toBeNull();
    expect(within(table).getByText("Nested block").closest("ul")).toHaveClass("docsera-main__list");
  });

  it("shares duplicate heading anchors with the TOC and skips empty headings", () => {
    const duplicateEnvelope = createDuplicateHeadingDocseraDocumentEnvelope();
    const duplicatePage = buildWorkspacePageView(createPageRecord(duplicateEnvelope), "live");
    const duplicateView = renderReader(duplicateEnvelope);
    const duplicateHeadings = screen.getAllByRole("heading");

    expect(duplicateHeadings.map((heading) => heading.id)).toEqual(["overview", "overview-2", "overview-3"]);
    expect(duplicatePage.tocItems.map((item) => item.anchorId)).toEqual(["overview", "overview-2", "overview-3"]);

    duplicateView.unmount();
    cleanup();

    const emptyEnvelope = createEmptyHeadingHierarchyDocseraDocumentEnvelope();
    const emptyPage = buildWorkspacePageView(createPageRecord(emptyEnvelope), "live");
    renderReader(emptyEnvelope);

    expect(screen.getAllByRole("heading").map((heading) => [heading.tagName.toLowerCase(), heading.id])).toEqual([
      ["h2", ""],
      ["h3", ""],
      ["h4", ""]
    ]);
    expect(emptyPage.tocItems).toEqual([]);
  });

  it("keeps body H1, H2, and H3 outline anchors in canonical order", () => {
    const hierarchyEnvelope = createHeadingHierarchyDocseraDocumentEnvelope();
    const hierarchyPage = buildWorkspacePageView(createPageRecord(hierarchyEnvelope), "live");
    renderReader(hierarchyEnvelope);

    expect(screen.getAllByRole("heading").map((heading) => heading.id)).toEqual(["overview", "install", "cli"]);
    expect(hierarchyPage.tocItems.map((item) => item.anchorId)).toEqual(["overview", "install", "cli"]);
  });

  it("renders empty headings when the content array is omitted by the runtime envelope", () => {
    const emptyEnvelope = createEmptyHeadingDocseraDocumentEnvelope();
    const heading = emptyEnvelope.document.content?.[0] as { content?: unknown } | undefined;
    if (!heading) {
      throw new Error("Expected empty heading fixture to include a heading node.");
    }
    delete heading.content;

    const emptyPage = buildWorkspacePageView(createPageRecord(emptyEnvelope), "live");
    renderReader(emptyEnvelope);

    expect(screen.getByRole("heading", { level: 3 })).not.toHaveAttribute("id");
    expect(emptyPage.tocItems).toEqual([]);
  });

  it.each([
    [
      "unsafe link",
      {
        schemaVersion: 1,
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Unsafe",
                  marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }]
                }
              ]
            }
          ]
        }
      }
    ],
    [
      "unexpected node",
      {
        schemaVersion: 1,
        document: {
          type: "doc",
          content: [
            {
              type: "image"
            }
          ]
        }
      }
    ],
    [
      "invalid code block structure",
      {
        schemaVersion: 1,
        document: {
          type: "doc",
          content: [
            {
              type: "codeBlock",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "not code" }]
                }
              ]
            }
          ]
        }
      }
    ],
    [
      "invalid table structure",
      {
        schemaVersion: 1,
        document: {
          type: "doc",
          content: [
            {
              type: "table",
              content: [
                {
                  type: "tableRow",
                  content: []
                }
              ]
            }
          ]
        }
      }
    ]
  ])("shows the contained reader-unavailable experience for %s", (_label, envelope) => {
    renderReader(envelope as DocseraDocumentEnvelope);

    expect(screen.getByRole("status")).toHaveTextContent("Published content unavailable");
    expect(screen.queryByText("Unsafe")).not.toBeInTheDocument();
    expect(screen.queryByText("not code")).not.toBeInTheDocument();
  });
});
