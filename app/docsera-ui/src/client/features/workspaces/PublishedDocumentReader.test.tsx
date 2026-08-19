/* @vitest-environment jsdom */

import {
  createCanonicalImageDocseraDocumentEnvelope,
  createResponsiveImageDocseraDocumentEnvelope
} from "../../../shared/editor/imageFixtures";

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
  createNestedTableDocseraDocumentEnvelope,
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

function renderReader(
  envelope: DocseraDocumentEnvelope,
  options: {
    resolveMediaSource?: (mediaId: string) => string | null;
    theme?: "dark" | "light";
  } = {}
) {
  return render(
    <PublishedDocumentReader
      envelope={envelope}
      resolveMediaSource={options.resolveMediaSource}
      theme={options.theme}
    />
  );
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

  it("renders table cell and header alignment styles from canonical attrs", () => {
    const envelope: DocseraDocumentEnvelope = {
      schemaVersion: 1,
      document: {
        type: "doc",
        content: [
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [
                  {
                    type: "tableHeader",
                    attrs: { colspan: 1, rowspan: 1, colwidth: null, align: "left" },
                    content: [{ type: "paragraph", content: [{ type: "text", text: "Left header" }] }]
                  },
                  {
                    type: "tableHeader",
                    attrs: { colspan: 1, rowspan: 1, colwidth: null, align: "center" },
                    content: [{ type: "paragraph", content: [{ type: "text", text: "Center header" }] }]
                  },
                  {
                    type: "tableHeader",
                    attrs: { colspan: 1, rowspan: 1, colwidth: null, align: "right" },
                    content: [{ type: "paragraph", content: [{ type: "text", text: "Right header" }] }]
                  }
                ]
              },
              {
                type: "tableRow",
                content: [
                  {
                    type: "tableCell",
                    attrs: { colspan: 1, rowspan: 1, colwidth: null, align: "left" },
                    content: [{ type: "paragraph", content: [{ type: "text", text: "Left body" }] }]
                  },
                  {
                    type: "tableCell",
                    attrs: { colspan: 1, rowspan: 1, colwidth: null, align: "center" },
                    content: [{ type: "paragraph", content: [{ type: "text", text: "Center body" }] }]
                  },
                  {
                    type: "tableCell",
                    attrs: { colspan: 1, rowspan: 1, colwidth: null, align: "right" },
                    content: [{ type: "paragraph", content: [{ type: "text", text: "Right body" }] }]
                  }
                ]
              }
            ]
          }
        ]
      }
    };

    renderReader(envelope);

    const reader = screen.getByLabelText("Published page content");
    const table = within(reader).getByRole("table");
    const headers = within(table).getAllByRole("columnheader");
    const cells = within(table).getAllByRole("cell");

    expect(headers[0]).toHaveStyle({ textAlign: "left" });
    expect(headers[1]).toHaveStyle({ textAlign: "center" });
    expect(headers[2]).toHaveStyle({ textAlign: "right" });
    expect(cells[0]).toHaveStyle({ textAlign: "left" });
    expect(cells[1]).toHaveStyle({ textAlign: "center" });
    expect(cells[2]).toHaveStyle({ textAlign: "right" });
  });

  it("renders supported nested tables recursively inside their containing blocks", () => {
    const envelope = createNestedTableDocseraDocumentEnvelope();

    renderReader(envelope);

    const reader = screen.getByLabelText("Published page content");
    const blockquote = reader.querySelector("blockquote.docsera-main__blockquote");
    expect(blockquote).not.toBeNull();
    expect(within(blockquote as HTMLElement).getByRole("table")).toHaveTextContent("Nested quote table");
    expect(within(reader).getByText("Nested cell table").closest("table")).toHaveClass("docsera-main__table");
    expect(reader.querySelectorAll(".docsera-main__table-wrapper")).toHaveLength(3);
  });

  it("renders canonical image metadata and resolves the light media source in light theme", () => {
    const envelope = createResponsiveImageDocseraDocumentEnvelope();
    const original = JSON.parse(JSON.stringify(envelope));

    renderReader(envelope, {
      theme: "light",
      resolveMediaSource: (mediaId) => {
        if (mediaId === "workspace-media-light") {
          return "https://cdn.example.com/light.png";
        }

        if (mediaId === "workspace-media-dark") {
          return "https://cdn.example.com/dark.png";
        }

        return null;
      }
    });

    const reader = screen.getByLabelText("Published page content");
    const figure = reader.querySelector(".docsera-main__media");

    expect(figure).not.toBeNull();
    expect(figure).toHaveAttribute("data-docsera-image-align", "center");
    expect(figure).toHaveAttribute("data-docsera-image-frame", "false");
    expect(figure).toHaveAttribute("data-docsera-image-width-pct", "80");

    const image = within(reader).getByRole("img", { name: "Architecture diagram" });
    expect(image).toHaveAttribute("src", "https://cdn.example.com/light.png");
    expect(image).toHaveAttribute("alt", "Architecture diagram");
    expect(within(reader).getByText("Published in both light and dark modes")).toHaveClass("docsera-main__media-caption");
    expect(envelope).toEqual(original);
  });

  it("renders an authored-empty alt as an empty img alt when the media resolves", () => {
    const envelope = createCanonicalImageDocseraDocumentEnvelope();

    renderReader(envelope, {
      resolveMediaSource: (mediaId) => (mediaId === "workspace-media-001" ? "https://cdn.example.com/canonical.png" : null)
    });

    const reader = screen.getByLabelText("Published page content");
    const image = reader.querySelector("img.docsera-main__media-image");

    expect(image).not.toBeNull();
    expect(image).toHaveAttribute("src", "https://cdn.example.com/canonical.png");
    expect(image).toHaveAttribute("alt", "");
  });

  it("uses the dark variant in dark theme, falls back to the light media when no dark variant exists, and keeps the configured dark failure contained", () => {
    const darkEnvelope = createResponsiveImageDocseraDocumentEnvelope();
    renderReader(darkEnvelope, {
      theme: "dark",
      resolveMediaSource: (mediaId) => {
        if (mediaId === "workspace-media-dark") {
          return "https://cdn.example.com/dark.png";
        }

        if (mediaId === "workspace-media-light") {
          return "https://cdn.example.com/light.png";
        }

        return null;
      }
    });

    const darkReader = screen.getByLabelText("Published page content");
    expect(within(darkReader).getByRole("img", { name: "Architecture diagram" })).toHaveAttribute(
      "src",
      "https://cdn.example.com/dark.png"
    );

    cleanup();

    const fallbackEnvelope: DocseraDocumentEnvelope = {
      schemaVersion: 1,
      document: {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              mediaId: "workspace-media-001",
              alt: "Architecture diagram",
              caption: "Published in both light and dark modes",
              frame: false,
              align: "center",
              widthPct: 80
            }
          }
        ]
      }
    };
    renderReader(fallbackEnvelope, {
      theme: "dark",
      resolveMediaSource: (mediaId) => {
        if (mediaId === "workspace-media-001") {
          return "https://cdn.example.com/light.png";
        }

        return null;
      }
    });

    const fallbackReader = screen.getByLabelText("Published page content");
    expect(within(fallbackReader).getByRole("img")).toHaveAttribute("src", "https://cdn.example.com/light.png");

    cleanup();

    const containedFailureEnvelope: DocseraDocumentEnvelope = {
      schemaVersion: 1,
      document: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Before" }]
          },
          {
            type: "image",
            attrs: {
              mediaId: "workspace-media-light",
              darkMediaId: "workspace-media-dark",
              alt: "Architecture diagram",
              caption: "Published in both light and dark modes",
              frame: false,
              align: "center",
              widthPct: 80
            }
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "After" }]
          }
        ]
      }
    };

    renderReader(containedFailureEnvelope, {
      theme: "dark",
      resolveMediaSource: (mediaId) => (mediaId === "workspace-media-light" ? "https://cdn.example.com/light.png" : null)
    });

    const containedReader = screen.getByLabelText("Published page content");
    expect(within(containedReader).getByText("Before")).toBeInTheDocument();
    expect(within(containedReader).getByText("After")).toBeInTheDocument();
    expect(within(containedReader).getByRole("status")).toHaveTextContent("Image unavailable");
    expect(within(containedReader).queryByRole("img")).toBeNull();
  });

  it("keeps surrounding blocks visible when a media resolver throws for one image", () => {
    const envelope: DocseraDocumentEnvelope = {
      schemaVersion: 1,
      document: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Before" }]
          },
          {
            type: "image",
            attrs: {
              mediaId: "workspace-media-001",
              alt: "Architecture diagram",
              caption: "Published in both light and dark modes",
              frame: false,
              align: "center",
              widthPct: 80
            }
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "After" }]
          }
        ]
      }
    };

    renderReader(envelope, {
      resolveMediaSource: () => {
        throw new Error("resolver failure");
      }
    });

    const reader = screen.getByLabelText("Published page content");

    expect(within(reader).getByText("Before")).toBeInTheDocument();
    expect(within(reader).getByText("After")).toBeInTheDocument();
    expect(within(reader).getByRole("status")).toHaveTextContent("Image unavailable");
    expect(within(reader).queryByRole("img")).toBeNull();
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


