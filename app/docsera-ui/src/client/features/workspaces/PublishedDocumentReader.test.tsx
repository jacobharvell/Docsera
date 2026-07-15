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
  createRelativeLinkDocseraDocumentEnvelope,
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
  it("renders the supported E2 envelope with nested lists, marks, task state, code blocks, and safe links", () => {
    const envelope = createSupportedE2DocseraDocumentEnvelope();
    const page = buildWorkspacePageView(createPageRecord(envelope), "live");
    const view = renderReader(envelope);
    const reader = screen.getByLabelText("Published page content");

    expect(within(reader).getByRole("heading", { name: "Overview", level: 2 })).toHaveAttribute("id", "overview");
    expect(within(reader).getByRole("heading", { name: "Nested content", level: 3 })).toHaveAttribute("id", "nested-content");
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

  it("shares duplicate heading anchors with the TOC and skips empty headings", () => {
    const duplicateEnvelope = createDuplicateHeadingDocseraDocumentEnvelope();
    const duplicatePage = buildWorkspacePageView(createPageRecord(duplicateEnvelope), "live");
    const duplicateView = renderReader(duplicateEnvelope);
    const duplicateHeadings = screen.getAllByRole("heading");

    expect(duplicateHeadings.map((heading) => heading.id)).toEqual(["overview", "overview-2", "overview-3"]);
    expect(duplicatePage.tocItems.map((item) => item.anchorId)).toEqual(["overview", "overview-2", "overview-3"]);

    duplicateView.unmount();
    cleanup();

    const emptyEnvelope = createEmptyHeadingDocseraDocumentEnvelope();
    const emptyPage = buildWorkspacePageView(createPageRecord(emptyEnvelope), "live");
    renderReader(emptyEnvelope);

    expect(screen.getByRole("heading", { level: 2 })).not.toHaveAttribute("id");
    expect(emptyPage.tocItems).toEqual([]);
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

    expect(screen.getByRole("heading", { level: 2 })).not.toHaveAttribute("id");
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
    ]
  ])("shows the contained reader-unavailable experience for %s", (_label, envelope) => {
    renderReader(envelope as DocseraDocumentEnvelope);

    expect(screen.getByRole("status")).toHaveTextContent("Published content unavailable");
    expect(screen.queryByText("Unsafe")).not.toBeInTheDocument();
    expect(screen.queryByText("not code")).not.toBeInTheDocument();
  });
});
