/* @vitest-environment jsdom */

import {
  createCanonicalImageDocseraDocumentEnvelope,
  createResponsiveImageDocseraDocumentEnvelope
} from "../../../shared/editor/imageFixtures";

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PublishedDocumentReader } from "./PublishedDocumentReader";
import { buildWorkspacePageView } from "./workspaceViewModels";
import type { WorkspaceMediaLoader, WorkspacePageRecord } from "../../shared/types/docsera";
import {
  createDuplicateHeadingDocseraDocumentEnvelope,
  createEmptyHeadingDocseraDocumentEnvelope,
  createEmptyHeadingHierarchyDocseraDocumentEnvelope,
  createExpandedTextFormattingDocseraDocumentEnvelope,
  createHeadingHierarchyDocseraDocumentEnvelope,
  createNestedTableDocseraDocumentEnvelope,
  createRelativeLinkDocseraDocumentEnvelope,
  createMultiItemAccordionDocseraDocumentEnvelope,
  createSingleItemAccordionDocseraDocumentEnvelope,
  createStandardTableDocseraDocumentEnvelope,
  createSupportedE2DocseraDocumentEnvelope
} from "../../../shared/editor/documentFixtures";
import type { DocseraDocumentEnvelope } from "../../../shared/editor/document";

type WorkspaceMediaLoadInput = Parameters<WorkspaceMediaLoader>[0];

if (typeof URL.createObjectURL !== "function") {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: () => "blob:reader"
  });
}

if (typeof URL.revokeObjectURL !== "function") {
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: () => undefined
  });
}

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
    loadMedia?: WorkspaceMediaLoader;
    pageIdentity?: string;
    theme?: "dark" | "light";
  } = {}
) {
  return render(
    <PublishedDocumentReader
      envelope={envelope}
      loadMedia={options.loadMedia}
      pageIdentity={options.pageIdentity}
      theme={options.theme}
    />
  );
}

function createMediaBlob(label: string): Blob {
  return new Blob([label], { type: "image/png" });
}

function createDeferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

function expectQuietLoadingMediaPlaceholderContract(status: HTMLElement) {
  expect(status.style.border).toBe("");
  expect(status.style.borderRadius).toBe("inherit");
  expect(status.style.boxShadow).toBe("none");
}

function createAccordionHeadingIsolationEnvelope(): DocseraDocumentEnvelope {
  return {
    schemaVersion: 1,
    document: {
      type: "doc",
      content: [
        {
          type: "accordion",
          attrs: { accordionId: "accordion-heading-isolation" },
          content: [
            {
              type: "accordionItem",
              attrs: { accordionItemId: "accordion-item-heading-isolation" },
              content: [
                {
                  type: "accordionTitle",
                  content: [{ type: "text", text: "Accordion title" }]
                },
                {
                  type: "accordionContent",
                  content: [
                    {
                      type: "heading",
                      attrs: { level: 3 },
                      content: [{ type: "text", text: "Overview" }]
                    },
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Accordion body" }]
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Overview" }]
        }
      ]
    }
  };
}

describe("PublishedDocumentReader", () => {
  it("renders semantic Docsera text and highlight palette colors in the lightweight reader", () => {
    render(
      <PublishedDocumentReader
        envelope={{
          schemaVersion: 1,
          document: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Blue",
                    marks: [{ type: "textColor", attrs: { color: "blue" } }]
                  },
                  {
                    type: "text",
                    text: " highlight",
                    marks: [{ type: "highlightColor", attrs: { color: "yellow" } }]
                  },
                  {
                    type: "text",
                    text: " default",
                    marks: [{ type: "highlight" }]
                  }
                ]
              }
            ]
          }
        }}
      />
    );

    const reader = screen.getByLabelText("Published page content");
    expect(reader.querySelector('[data-docsera-text-color="blue"]')).toHaveTextContent("Blue");
    expect(reader.querySelector('[data-docsera-highlight-color="yellow"]')).toHaveTextContent("highlight");
    expect(reader.querySelector(".docsera-main__highlight")).toHaveTextContent("default");
  });

  it("renders paragraph and heading text alignment without changing heading anchors", () => {
    renderReader({
      schemaVersion: 1,
      document: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { textAlign: "center" },
            content: [{ type: "text", text: "Centered paragraph" }]
          },
          {
            type: "heading",
            attrs: { level: 2, textAlign: "right" },
            content: [{ type: "text", text: "Overview" }]
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Ordinary left" }]
          }
        ]
      }
    });

    const centeredParagraph = screen.getByText("Centered paragraph");
    const rightHeading = screen.getByRole("heading", { name: "Overview" });
    const ordinaryParagraph = screen.getByText("Ordinary left");

    expect(centeredParagraph).toHaveStyle({ textAlign: "center" });
    expect(rightHeading).toHaveStyle({ textAlign: "right" });
    expect(rightHeading).toHaveAttribute("id", "overview");
    expect(ordinaryParagraph).not.toHaveAttribute("style");
  });

  it("uses the shared document-presentation tokens for live core text styling", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    ).replace(/\r\n/g, "\n");
    const readerSource = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/features/workspaces/PublishedDocumentReader.tsx`,
      "utf8"
    );
    const getRuleBody = (selector: string) => {
      const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return source.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`, "s"))?.groups?.body ?? "";
    };
    const readerRule = getRuleBody(".docsera-main__reader");
    const bodyRule = getRuleBody(".docsera-main__body");
    const listRule = getRuleBody(".docsera-main__list");
    const blockquoteRule = getRuleBody(".docsera-main__blockquote");
    const inlineCodeRule = getRuleBody(".docsera-main__inline-code");

    expect(source).toContain("--docsera-document-title-body-gap: 40px;");
    expect(source).toContain("--docsera-document-text-color: #16212f;");
    expect(source).toContain('--docsera-document-heading-font-family: Inter, "Segoe UI", sans-serif;');
    expect(source).not.toContain("--docsera-document-heading-font-family: Geist");
    expect(source).toContain("--docsera-document-body-font-size: 1rem;");
    expect(source).toContain("--docsera-document-body-line-height: 1.7;");
    expect(source).toContain("--docsera-document-heading-margin: 1.4rem 0 0.7rem;");
    expect(source).toContain("--docsera-document-list-padding-left: 1.5rem;");
    expect(source).toContain("--docsera-document-list-item-gap: 0.35rem;");
    expect(source).toContain("--docsera-document-code-block-padding: 0.9rem 1rem;");
    expect(source).toContain("--docsera-document-rule-margin: 1.5rem 0;");
    expect(source).toContain("--docsera-document-highlight-bg:");
    expect(source).toContain(':root[data-docsera-theme="dark"] {');
    expect(source).toContain("--docsera-document-text-color: #eef2f8;");
    expect(source).toContain("--docsera-document-blockquote-color: #a7b3c5;");
    expect(source).toContain("--docsera-document-code-block-bg: color-mix(in srgb, rgba(15, 18, 24, 0.98) 86%, black 14%);");
    expect(source).toContain(".docsera-main__reader {");
    expect(source).toMatch(/\.docsera-main__reader\s*{[^}]*margin-top:\s*calc\(var\(--docsera-document-title-body-gap\) - 28px\);/s);
    expect(source).not.toMatch(/\.docsera-main__reader\s*{[^}]*display:\s*grid;/s);
    expect(source).not.toMatch(/\.docsera-main__reader\s*{[^}]*gap:\s*var\(--docsera-document-block-spacing\);/s);
    expect(source).toContain("margin-top: calc(var(--docsera-document-title-body-gap) - 28px);");
    expect(source).toMatch(/\.docsera-main__reader > :first-child\s*{\s*margin-top:\s*0;\s*}/);
    expect(source).toMatch(/\.docsera-main__reader > :last-child\s*{\s*margin-bottom:\s*0;\s*}/);
    expect(readerRule).toContain("color: var(--docsera-document-text-color);");
    expect(source).not.toMatch(/\.docsera-main__body,\s*\.docsera-main__section-copy\s*{[^}]*color:/s);
    expect(bodyRule).not.toContain("color:");
    expect(listRule).not.toContain("color:");
    expect(inlineCodeRule).not.toContain("color:");
    expect(blockquoteRule).toContain("color: var(--docsera-document-blockquote-color);");
    expect(source).toContain("font-size: var(--docsera-document-body-font-size);");
    expect(source).toContain(".docsera-main__reader a {");
    expect(source).toContain("color: var(--docsera-document-link-color);");
    expect(source).toContain(".docsera-main__reader a:visited {");
    expect(source).toContain("text-decoration-thickness: var(--docsera-document-link-decoration-thickness);");
    expect(source).toContain(".docsera-main__body {\n  margin: 0 0 var(--docsera-document-block-spacing);\n}");
    expect(source).toContain(".docsera-main__body-heading {\n  margin: var(--docsera-document-heading-margin);");
    expect(source).toContain(".docsera-main__section-title {\n  margin: var(--docsera-document-heading-margin);");
    expect(source).toContain(".docsera-main__subsection-title {\n  margin: var(--docsera-document-heading-margin);");
    expect(source).toContain(".docsera-main__list {\n  margin: 0 0 var(--docsera-document-block-spacing);");
    expect(source).toContain("padding-left: var(--docsera-document-list-padding-left);");
    expect(source).toContain(".docsera-main__list-item + .docsera-main__list-item {");
    expect(source).toContain("margin-top: var(--docsera-document-list-item-gap);");
    expect(source).toContain(".docsera-main__blockquote {\n  margin: 0 0 var(--docsera-document-block-spacing);");
    expect(source).toContain(".docsera-main__media {\n  display: grid;\n  gap: 12px;\n  margin: 0;\n}");
    expect(source).toContain(".docsera-main__reader > .docsera-main__media:not(:last-child) {\n  margin-bottom: calc(var(--docsera-document-block-spacing) + 0.25rem);\n}");
    expect(readerSource).not.toContain('margin: "0 0 var(--docsera-document-block-spacing)",');
    expect(source).toContain(".docsera-main__media-caption {\n  margin: 0;");
    expect(source).toContain(".docsera-main__inline-code {\n  padding: var(--docsera-document-code-inline-padding);");
    expect(source).toContain(".docsera-main__code {\n  margin: 0 0 var(--docsera-document-block-spacing);");
    expect(source).toContain(".docsera-main__divider {\n  width: 100%;\n  height: 0;\n  margin: var(--docsera-document-rule-margin);");
    expect(source).toMatch(/\.docsera-main__reader sup,\s*\.docsera-main__reader sub \{/);
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

  it("renders accordions with single-open and zero-open disclosure behavior in the lightweight reader", async () => {
    const envelope = createMultiItemAccordionDocseraDocumentEnvelope();
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:accordion");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    renderReader(envelope, {
      loadMedia: vi.fn(async ({ mediaId }: WorkspaceMediaLoadInput) =>
        mediaId === "workspace-media-001" ? createMediaBlob(mediaId) : null
      )
    });

    const reader = screen.getByLabelText("Published page content");
    const planButton = within(reader).getByRole("button", { name: "Plan" });
    const mediaButton = within(reader).getByRole("button", { name: "Media" });

    expect(planButton).toHaveAttribute("aria-expanded", "false");
    expect(mediaButton).toHaveAttribute("aria-expanded", "false");

    const planIcon = planButton.querySelector(".docsera-main__accordion-toggle-icon");
    expect(planIcon?.querySelector("svg")).toBeInTheDocument();
    expect(planButton.firstElementChild).toBe(planIcon);
    expect(planButton.lastElementChild).toHaveClass("docsera-main__accordion-title");

    fireEvent.click(planButton);
    expect(planButton).toHaveAttribute("aria-expanded", "true");
    expect(mediaButton).toHaveAttribute("aria-expanded", "false");
    expect(within(reader).getByRole("table")).toBeVisible();
    expect(within(reader).getByText("Accordion plan body")).toBeVisible();

    fireEvent.click(mediaButton);
    expect(planButton).toHaveAttribute("aria-expanded", "false");
    expect(mediaButton).toHaveAttribute("aria-expanded", "true");
    await waitFor(() => {
      expect(within(reader).getByRole("img", { name: "Accordion diagram" })).toHaveAttribute("src", "blob:accordion");
    });
    expect(within(reader).queryByRole("table")).toBeNull();
    expect(within(reader).getByText("Accordion media body")).toBeVisible();

    fireEvent.click(mediaButton);
    expect(mediaButton).toHaveAttribute("aria-expanded", "false");
    expect(within(reader).queryByRole("img", { name: "Accordion diagram" })).toBeNull();

    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
  });

  it("resets accordion disclosure state when the page identity or document changes", () => {
    const envelope = createSingleItemAccordionDocseraDocumentEnvelope();
    const renderResult = renderReader(envelope, { pageIdentity: "page-a" });
    const reader = screen.getByLabelText("Published page content");
    const button = within(reader).getByRole("button", { name: "Overview" });

    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-expanded", "true");

    renderResult.rerender(<PublishedDocumentReader envelope={envelope} pageIdentity="page-b" />);

    const rerenderedReader = screen.getByLabelText("Published page content");
    const rerenderedButton = within(rerenderedReader).getByRole("button", { name: "Overview" });
    expect(rerenderedButton).not.toBe(button);
    expect(rerenderedButton).toHaveAttribute("aria-expanded", "false");

    fireEvent.click(rerenderedButton);
    expect(rerenderedButton).toHaveAttribute("aria-expanded", "true");

    const nextEnvelope = JSON.parse(JSON.stringify(envelope)) as typeof envelope;
    const nextAccordion = nextEnvelope.document.content?.[0];
    if (
      nextAccordion &&
      typeof nextAccordion === "object" &&
      !Array.isArray(nextAccordion) &&
      Array.isArray((nextAccordion as { content?: unknown[] }).content)
    ) {
      const nextAccordionItem = (nextAccordion as { content?: unknown[] }).content?.[0];
      if (
        nextAccordionItem &&
        typeof nextAccordionItem === "object" &&
        !Array.isArray(nextAccordionItem) &&
        Array.isArray((nextAccordionItem as { content?: unknown[] }).content)
      ) {
        const titleNode = (nextAccordionItem as { content?: unknown[] }).content?.[0];
        if (
          titleNode &&
          typeof titleNode === "object" &&
          !Array.isArray(titleNode) &&
          Array.isArray((titleNode as { content?: Array<{ text?: string }> }).content)
        ) {
          const textNode = (titleNode as { content?: Array<{ text?: string }> }).content?.[0];
          if (textNode && typeof textNode === "object" && !Array.isArray(textNode)) {
            (textNode as { text?: string }).text = "Updated overview";
          }
        }
      }
    }

    renderResult.rerender(<PublishedDocumentReader envelope={nextEnvelope} pageIdentity="page-b" />);

    const updatedReader = screen.getByLabelText("Published page content");
    const updatedButton = within(updatedReader).getByRole("button", { name: "Updated overview" });
    expect(updatedButton).not.toBe(rerenderedButton);
    expect(updatedButton).toHaveAttribute("aria-expanded", "false");
  });

  it("keeps top-level heading anchors stable when accordion bodies render headings", () => {
    const envelope = createAccordionHeadingIsolationEnvelope();
    renderReader(envelope);

    const reader = screen.getByLabelText("Published page content");
    expect(within(reader).getByRole("heading", { name: "Overview", level: 3 })).toHaveAttribute("id", "overview");

    fireEvent.click(within(reader).getByRole("button", { name: "Accordion title" }));

    expect(within(reader).getByRole("heading", { name: "Overview", level: 3 })).toHaveAttribute("id", "overview");
    expect(within(reader).getByRole("heading", { name: "Overview", level: 4 })).toHaveAttribute(
      "id",
      "docsera-accordion-accordion-heading-isolation-accordion-item-heading-isolation-overview"
    );
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

  it("loads canonical image media ids through the live reader binary loader", async () => {
    const envelope = createResponsiveImageDocseraDocumentEnvelope();
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:reader");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    renderReader(envelope, {
      loadMedia: vi.fn(async ({ mediaId }: WorkspaceMediaLoadInput) => (mediaId === "workspace-media-dark" ? createMediaBlob(mediaId) : null)),
      theme: "dark"
    });

    const reader = screen.getByLabelText("Published page content");
    await waitFor(() => {
      expect(within(reader).getByRole("img", { name: "Architecture diagram" })).toHaveAttribute("src", "blob:reader");
    });
    const figure = reader.querySelector(".docsera-main__media");
    expect(figure).not.toBeNull();
    expect(figure).toHaveAttribute("data-docsera-image-frame", "false");
    const surface = figure?.querySelector(".docsera-main__media-surface");
    expect(surface).toHaveAttribute("data-docsera-image-surface", "true");
    expect(surface).toHaveAttribute("data-docsera-image-frame", "false");
    expect(surface).toHaveClass("docsera-main__media-surface", "docsera-main__media-activation");
    expect(surface?.querySelector("img")).toHaveAttribute("src", "blob:reader");
    expect(within(reader).getByText("Published in both light and dark modes")).toHaveClass("docsera-main__media-caption");
    expect(within(reader).getByText("Published in both light and dark modes")).toBeInTheDocument();
    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
  });

  it("keeps image figures as direct reader blocks so only non-final top-level images receive document spacing", async () => {
    const imageAttrs = {
      mediaId: "workspace-media-001",
      alt: "Spacing diagram",
      caption: "Caption remains attached",
      frame: false,
      align: "center",
      widthPct: 80
    };
    const envelope: DocseraDocumentEnvelope = {
      schemaVersion: 1,
      document: {
        type: "doc",
        content: [
          { type: "image", attrs: imageAttrs },
          { type: "image", attrs: { ...imageAttrs, alt: "Following diagram", align: "right" } },
          { type: "paragraph", content: [{ type: "text", text: "After paragraph" }] },
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "After heading" }] },
          {
            type: "columns",
            content: [
              {
                type: "column",
                content: [{ type: "image", attrs: { ...imageAttrs, alt: "Nested diagram", align: "left" } }]
              },
              {
                type: "column",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Nested companion copy" }] }]
              }
            ]
          },
          { type: "image", attrs: { ...imageAttrs, alt: "Final diagram", align: "right" } }
        ]
      }
    };

    renderReader(envelope, { loadMedia: async ({ mediaId }) => createMediaBlob(mediaId) });

    const reader = screen.getByLabelText("Published page content");
    await waitFor(() => {
      expect(within(reader).getByRole("img", { name: "Spacing diagram" })).toBeInTheDocument();
    });
    const topLevelFigures = Array.from(reader.children).filter(
      (child): child is HTMLElement => child instanceof HTMLElement && child.matches("figure.docsera-main__media")
    );
    const nestedFigure = reader.querySelector(".docsera-main__column figure.docsera-main__media");

    expect(topLevelFigures).toHaveLength(3);
    expect(topLevelFigures[0].nextElementSibling).toBe(topLevelFigures[1]);
    expect(topLevelFigures[1].nextElementSibling).toHaveTextContent("After paragraph");
    expect(within(reader).getByRole("heading", { name: "After heading" }).nextElementSibling).toHaveClass("docsera-main__columns");
    expect(topLevelFigures[2].nextElementSibling).toBeNull();
    expect(topLevelFigures[0]).toHaveStyle({ width: "80%" });
    expect(topLevelFigures[2]).toHaveStyle({ width: "80%" });
    expect(topLevelFigures[0].style.margin).toBe("");
    expect(topLevelFigures[2].style.margin).toBe("");
    expect(within(topLevelFigures[0]).getByText("Caption remains attached")).toHaveClass("docsera-main__media-caption");
    expect(nestedFigure).toBeInstanceOf(HTMLElement);
    if (!(nestedFigure instanceof HTMLElement)) {
      throw new Error("Expected the nested column image figure to render.");
    }
    expect(nestedFigure.parentElement).not.toBe(reader);
    expect(nestedFigure.style.margin).toBe("");
  });

  it("renders a right-aligned framed image with responsive width in the published reader", async () => {
    const envelope = createCanonicalImageDocseraDocumentEnvelope();
    const imageNode = envelope.document.content?.[0] as
      | { attrs?: { alt: string; align: string; frame: boolean; widthPct: number }; type?: string }
      | undefined;
    if (!imageNode || imageNode.type !== "image" || !imageNode.attrs) {
      throw new Error("Expected the canonical image envelope to contain a single image node.");
    }

    imageNode.attrs.frame = true;
    imageNode.attrs.align = "right";
    imageNode.attrs.widthPct = 72;
    imageNode.attrs.alt = "Right aligned diagram";

    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:right-align");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    renderReader(envelope, {
      loadMedia: vi.fn(async ({ mediaId }: WorkspaceMediaLoadInput) => (mediaId === "workspace-media-001" ? createMediaBlob(mediaId) : null))
    });

    const reader = screen.getByLabelText("Published page content");
    await waitFor(() => {
      expect(within(reader).getByRole("img", { name: "Right aligned diagram" })).toHaveAttribute("src", "blob:right-align");
    });
    const figure = reader.querySelector(".docsera-main__media");

    expect(figure).toHaveClass("docsera-main__media--framed", "docsera-main__media--align-right");
    expect(figure).toHaveAttribute("data-docsera-image-align", "right");
    expect(figure).toHaveAttribute("data-docsera-image-frame", "true");
    expect(figure).toHaveAttribute("data-docsera-image-width-pct", "72");
    expect(figure).toHaveStyle({ width: "72%" });
    const surface = figure?.querySelector(".docsera-main__media-surface");
    expect(surface).toHaveClass("docsera-main__media-activation", "docsera-main__media-surface--framed");
    expect(getComputedStyle(surface as HTMLElement).borderTopWidth).toBe("1px");
    expect(getComputedStyle(surface as HTMLElement).borderTopStyle).toBe("solid");
    expect(figure).toHaveStyle({ display: "grid", gap: "12px" });

    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
  });

  it("closes an open fullscreen viewer when the published envelope changes", async () => {
    const envelope = createResponsiveImageDocseraDocumentEnvelope();
    const nextEnvelope = createResponsiveImageDocseraDocumentEnvelope();
    const nextImageNode = nextEnvelope.document.content?.[0] as
      | { attrs?: { alt?: string }; type?: string }
      | undefined;
    if (!nextImageNode || nextImageNode.type !== "image") {
      throw new Error("Expected the alternate envelope to contain an image node.");
    }

    const nextAttrs = nextImageNode.attrs;
    if (nextAttrs) {
      nextAttrs.alt = "Updated architecture diagram";
    }

    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:reader");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const loadMedia = vi.fn(async ({ mediaId }: WorkspaceMediaLoadInput) => (mediaId === "workspace-media-dark" ? createMediaBlob(mediaId) : null));

    const renderResult = renderReader(envelope, {
      loadMedia,
      theme: "dark"
    });

    const reader = screen.getByLabelText("Published page content");
    const imageButton = await waitFor(() => within(reader).getByRole("button", { name: "Open fullscreen viewer for Architecture diagram" }));
    await waitFor(() => {
      expect(within(reader).getByRole("img", { name: "Architecture diagram" })).toHaveAttribute("src", "blob:reader");
    });

    fireEvent.click(imageButton);
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Image viewer" })).toBeInTheDocument();
    });

    renderResult.rerender(
      <PublishedDocumentReader
        envelope={nextEnvelope}
        loadMedia={loadMedia}
        theme="dark"
      />
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Image viewer" })).toBeNull();
    });

    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
  });

  it("closes an open fullscreen viewer when the reader navigates to a different page identity with identical JSON", async () => {
    const envelope = createResponsiveImageDocseraDocumentEnvelope();
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:reader");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const loadMedia = vi.fn(async ({ mediaId }: WorkspaceMediaLoadInput) => (mediaId === "workspace-media-dark" ? createMediaBlob(mediaId) : null));

    const renderResult = renderReader(envelope, {
      loadMedia,
      pageIdentity: "page-a",
      theme: "dark"
    });

    const reader = screen.getByLabelText("Published page content");
    const imageButton = await waitFor(() => within(reader).getByRole("button", { name: "Open fullscreen viewer for Architecture diagram" }));
    await waitFor(() => {
      expect(within(reader).getByRole("img", { name: "Architecture diagram" })).toHaveAttribute("src", "blob:reader");
    });

    fireEvent.click(imageButton);
    await waitFor(() => {
      expect(screen.getByRole("dialog", { name: "Image viewer" })).toBeInTheDocument();
    });

    renderResult.rerender(
      <PublishedDocumentReader
        envelope={envelope}
        loadMedia={loadMedia}
        pageIdentity="page-b"
        theme="dark"
      />
    );

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Image viewer" })).toBeNull();
    });

    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
  });

  it("opens the fullscreen viewer from the live image surface and restores focus on Escape", async () => {
    const envelope = createResponsiveImageDocseraDocumentEnvelope();
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:reader");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    renderReader(envelope, {
      loadMedia: vi.fn(async ({ mediaId }: WorkspaceMediaLoadInput) => (mediaId === "workspace-media-dark" ? createMediaBlob(mediaId) : null)),
      theme: "dark"
    });

    const reader = screen.getByLabelText("Published page content");
    const imageButton = await waitFor(() => within(reader).getByRole("button", { name: "Open fullscreen viewer for Architecture diagram" }));
    await waitFor(() => {
      expect(within(reader).getByRole("img", { name: "Architecture diagram" })).toHaveAttribute("src", "blob:reader");
    });

    fireEvent.click(imageButton);

    const dialog = await waitFor(() => screen.getByRole("dialog", { name: "Image viewer" }));
    expect(dialog).toBeInTheDocument();

    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => {
      expect(document.querySelector(".docsera-image-viewer--closing")).not.toBeNull();
    });
    const viewerSurface = document.querySelector(".docsera-image-viewer__surface") as HTMLElement | null;
    expect(viewerSurface).not.toBeNull();
    fireEvent.transitionEnd(viewerSurface!);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Image viewer" })).not.toBeInTheDocument();
      expect(imageButton).toHaveFocus();
    });

    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
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

  it("loads canonical image media through the binary loader in light theme and keeps the structured metadata intact", async () => {
    const envelope = createResponsiveImageDocseraDocumentEnvelope();
    const original = JSON.parse(JSON.stringify(envelope));
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:light");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    renderReader(envelope, {
      theme: "light",
      loadMedia: vi.fn(async ({ mediaId }: WorkspaceMediaLoadInput) => (mediaId === "workspace-media-light" || mediaId === "workspace-media-dark" ? createMediaBlob(mediaId) : null))
    });

    const reader = screen.getByLabelText("Published page content");
    const figure = reader.querySelector(".docsera-main__media");

    expect(figure).not.toBeNull();
    expect(figure).toHaveAttribute("data-docsera-image-align", "center");
    expect(figure).toHaveAttribute("data-docsera-image-frame", "false");
    expect(figure).toHaveAttribute("data-docsera-image-width-pct", "80");

    await waitFor(() => {
      expect(within(reader).getByRole("img", { name: "Architecture diagram" })).toHaveAttribute("src", "blob:light");
    });

    const image = within(reader).getByRole("img", { name: "Architecture diagram" });
    expect(image).toHaveAttribute("alt", "Architecture diagram");
    expect(within(reader).getByText("Published in both light and dark modes")).toHaveClass("docsera-main__media-caption");
    expect(envelope).toEqual(original);
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);

    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
  });

  it("renders a quiet accessible loading placeholder before the image resolves", async () => {
    const envelope = createResponsiveImageDocseraDocumentEnvelope();
    const loadDeferred = createDeferred<Blob | null>();
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:loading");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    renderReader(envelope, {
      loadMedia: vi.fn(async () => loadDeferred.promise)
    });

    const reader = screen.getByLabelText("Published page content");
    const figure = reader.querySelector(".docsera-main__media");
    if (!(figure instanceof HTMLElement)) {
      throw new Error("Expected the reader to render an image figure.");
    }
    const loadingStatus = within(reader).getByRole("status", { name: "Loading image" });

    expect(figure).toHaveAttribute("data-docsera-image-frame", "false");
    expect(loadingStatus).toHaveAttribute("aria-busy", "true");
    expect(loadingStatus).not.toHaveTextContent("Media");
    expect(loadingStatus).not.toHaveTextContent("Loading image");
    expectQuietLoadingMediaPlaceholderContract(loadingStatus);

    await act(async () => {
      loadDeferred.resolve(createMediaBlob("workspace-media-light"));
    });

    await waitFor(() => {
      expect(within(reader).getByRole("img", { name: "Architecture diagram" })).toHaveAttribute("src", "blob:loading");
    });

    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
  });

  it("renders a framed quiet accessible loading placeholder before the image resolves", async () => {
    const envelope = createCanonicalImageDocseraDocumentEnvelope();
    const loadDeferred = createDeferred<Blob | null>();
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:framed-loading");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    renderReader(envelope, {
      loadMedia: vi.fn(async () => loadDeferred.promise)
    });

    const reader = screen.getByLabelText("Published page content");
    const figure = reader.querySelector(".docsera-main__media");
    if (!(figure instanceof HTMLElement)) {
      throw new Error("Expected the reader to render an image figure.");
    }
    const loadingStatus = within(reader).getByRole("status", { name: "Loading image" });

    expect(figure).toHaveAttribute("data-docsera-image-frame", "true");
    expect(loadingStatus).toHaveAttribute("aria-busy", "true");
    expect(loadingStatus).not.toHaveTextContent("Media");
    expect(loadingStatus).not.toHaveTextContent("Loading image");
    expectQuietLoadingMediaPlaceholderContract(loadingStatus);

    await act(async () => {
      loadDeferred.resolve(createMediaBlob("workspace-media-001"));
    });

    await waitFor(() => {
      expect(figure.querySelector("img")).toHaveAttribute("src", "blob:framed-loading");
    });

    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
  });

  it("renders an authored-empty alt as an empty img alt when the media resolves", async () => {
    const envelope = createCanonicalImageDocseraDocumentEnvelope();
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:canonical");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    renderReader(envelope, {
      loadMedia: vi.fn(async ({ mediaId }: WorkspaceMediaLoadInput) => (mediaId === "workspace-media-001" ? createMediaBlob(mediaId) : null))
    });

    const reader = screen.getByLabelText("Published page content");
    await waitFor(() => {
      expect(reader.querySelector("img.docsera-main__media-image")).toHaveAttribute("src", "blob:canonical");
    });

    const image = reader.querySelector("img.docsera-main__media-image");
    expect(image).not.toBeNull();
    expect(image).toHaveAttribute("alt", "");

    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
  });

  it("uses the dark variant in dark theme, keeps a configured dark failure contained, and falls back to light only when no dark variant exists", async () => {
    const createObjectUrlSpy = vi.spyOn(URL, "createObjectURL").mockReturnValueOnce("blob:dark").mockReturnValueOnce("blob:light");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);

    const darkEnvelope = createResponsiveImageDocseraDocumentEnvelope();
    renderReader(darkEnvelope, {
      theme: "dark",
      loadMedia: vi.fn(async ({ mediaId }: WorkspaceMediaLoadInput) => {
        if (mediaId === "workspace-media-dark") {
          return createMediaBlob(mediaId);
        }

        if (mediaId === "workspace-media-light") {
          return createMediaBlob(mediaId);
        }

        return null;
      })
    });

    const darkReader = screen.getByLabelText("Published page content");
    await waitFor(() => {
      expect(within(darkReader).getByRole("img", { name: "Architecture diagram" })).toHaveAttribute("src", "blob:dark");
    });

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
      loadMedia: vi.fn(async ({ mediaId }: WorkspaceMediaLoadInput) => (mediaId === "workspace-media-001" ? createMediaBlob(mediaId) : null))
    });

    const fallbackReader = screen.getByLabelText("Published page content");
    await waitFor(() => {
      expect(within(fallbackReader).getByRole("img")).toHaveAttribute("src", "blob:light");
    });

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
      loadMedia: vi.fn(async ({ mediaId }: WorkspaceMediaLoadInput) => (mediaId === "workspace-media-light" ? createMediaBlob(mediaId) : null))
    });

    const containedReader = screen.getByLabelText("Published page content");
    expect(within(containedReader).getByText("Before")).toBeInTheDocument();
    expect(within(containedReader).getByText("After")).toBeInTheDocument();
    await waitFor(() => {
      expect(within(containedReader).getByRole("status")).toHaveTextContent("Image unavailable");
    });
    expect(within(containedReader).queryByRole("img")).toBeNull();

    createObjectUrlSpy.mockRestore();
    revokeObjectUrlSpy.mockRestore();
  });

  it("keeps surrounding blocks visible when a media loader throws for one image", async () => {
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
      loadMedia: async () => {
        throw new Error("loader failure");
      }
    });

    const reader = screen.getByLabelText("Published page content");

    expect(within(reader).getByText("Before")).toBeInTheDocument();
    expect(within(reader).getByText("After")).toBeInTheDocument();
    await waitFor(() => {
      expect(within(reader).getByRole("status")).toHaveTextContent("Image unavailable");
    });
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

  it("shows the contained reader-unavailable experience for invalid accordion structure", () => {
    renderReader({
      schemaVersion: 1,
      document: {
        type: "doc",
        content: [
          {
            type: "accordion",
            attrs: { accordionId: "accordion-invalid" },
            content: [
              {
                type: "accordionItem",
                attrs: { accordionItemId: "accordion-item-invalid" },
                content: [
                  {
                    type: "accordionTitle",
                    content: [{ type: "text", text: "Invalid" }]
                  }
                ]
              }
            ]
          }
        ]
      }
    } as DocseraDocumentEnvelope);

    expect(screen.getByRole("status")).toHaveTextContent("Published content unavailable");
  });

  it("keeps the published reader TipTap-free", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/features/workspaces/PublishedDocumentReader.tsx`,
      "utf8"
    );

    expect(source).not.toContain("@tiptap");
    expect(source).not.toContain("prosemirror");
  });
});

