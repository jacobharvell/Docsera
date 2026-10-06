/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DocseraDocumentEnvelope } from "../../../shared/editor/document";
import {
  createDuplicateHeadingDocseraDocumentEnvelope,
  createHeadingHierarchyDocseraDocumentEnvelope
} from "../../../shared/editor/documentFixtures";
import { PublishedDocumentReader } from "./PublishedDocumentReader";
import type { WorkspacePageRecord } from "../../shared/types/docsera";
import { resolveWorkspaceHeadingTarget, WorkspaceToc } from "./WorkspaceToc";
import { buildWorkspacePageView } from "./workspaceViewModels";

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

function createEnvelope(content: NonNullable<DocseraDocumentEnvelope["document"]["content"]>): DocseraDocumentEnvelope {
  return {
    schemaVersion: 1,
    document: {
      type: "doc",
      content
    }
  };
}

function renderToc(envelope: DocseraDocumentEnvelope) {
  const page = buildWorkspacePageView(createPageRecord(envelope), "live");

  return render(
    <div>
      <PublishedDocumentReader envelope={envelope} />
      <WorkspaceToc collapsed={false} page={page} panelId="docsera-workspace-toc" showPendingState={false} onToggleCollapsed={() => undefined} />
    </div>
  );
}

function renderTocOnly(envelope: DocseraDocumentEnvelope) {
  const page = buildWorkspacePageView(createPageRecord(envelope), "live");

  return render(
    <WorkspaceToc collapsed={false} page={page} panelId="docsera-workspace-toc" showPendingState={false} onToggleCollapsed={() => undefined} />
  );
}

function mountEditorHeadings(
  headings: Array<{
    tagName: "h1" | "h2" | "h3";
    text?: string;
  }>
) {
  const editorHost = document.createElement("div");
  editorHost.setAttribute("data-docsera-page-editor-host", "true");
  const shadowRoot = editorHost.attachShadow({ mode: "open" });
  const headingElements = headings.map(({ tagName, text }) => {
    const heading = document.createElement(tagName);
    if (text !== undefined) {
      heading.textContent = text;
    }
    return heading;
  });

  shadowRoot.append(...headingElements);
  document.body.append(editorHost);

  return {
    headingElements,
    shadowRoot
  };
}

function mockScrollIntoView(target: Element) {
  const scrollIntoView = vi.fn();
  Object.defineProperty(target, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView
  });
  return scrollIntoView;
}

function readRuntimeShellCss(): string {
  const nodeProcess = new Function("return process")() as {
    cwd: () => string;
    getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
  };
  return nodeProcess.getBuiltinModule("fs").readFileSync(`${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`, "utf8");
}

afterEach(() => {
  cleanup();
  document.querySelector("[data-docsera-page-editor-host='true']")?.remove();
  window.history.replaceState({}, "", "/x_82900_docsera_docsera_sdk_runtime.do");
});

describe("WorkspaceToc", () => {
  it("renders the decorative table-of-contents icon inline with the heading text", () => {
    const envelope = createHeadingHierarchyDocseraDocumentEnvelope();
    renderTocOnly(envelope);

    const heading = screen.getByText("On this page");
    expect(heading).toBeInTheDocument();

    const eyebrow = heading.closest(".docsera-toc__eyebrow");
    expect(eyebrow).toBeInTheDocument();

    const icon = eyebrow?.querySelector(".docsera-toc__eyebrow-icon");
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveAttribute("aria-hidden", "true");
    expect(icon).not.toHaveAttribute("aria-label");
    expect(icon).toHaveAttribute("width", "14");
    expect(icon).toHaveAttribute("height", "14");
    expect(Array.from(icon?.querySelectorAll("path") ?? []).map((path) => path.getAttribute("d"))).toEqual([
      "M16 5H3",
      "M16 12H3",
      "M16 19H3",
      "M21 5h.01",
      "M21 12h.01",
      "M21 19h.01"
    ]);

    expect(screen.queryByRole("img", { name: /on this page/i })).not.toBeInTheDocument();
  });

  it("keeps the ToC eyebrow icon aligned with compact inline spacing", () => {
    const runtimeShellCss = readRuntimeShellCss();

    expect(runtimeShellCss).toMatch(
      /\.docsera-toc__eyebrow\s*\{[^}]*display:\s*inline-flex;[^}]*align-items:\s*center;[^}]*gap:\s*6px;[^}]*color:\s*var\(--docsera-text-muted\);/s
    );
    expect(runtimeShellCss).toMatch(
      /\.docsera-toc__eyebrow-icon\s*\{[^}]*flex:\s*0 0 14px;[^}]*width:\s*14px;[^}]*height:\s*14px;/s
    );
  });

  it("keeps one permanent ToC toggle position without mode-dependent modifiers", () => {
    const envelope = createHeadingHierarchyDocseraDocumentEnvelope();
    renderTocOnly(envelope);

    expect(document.querySelector(".docsera-toc-rail")).not.toHaveClass("docsera-toc-rail--lower-toggle");
    const runtimeShellCss = readRuntimeShellCss();
    expect(runtimeShellCss).toMatch(/\.docsera-toc-rail__toggle\s*\{[^}]*top:\s*36px;/s);
    expect(runtimeShellCss).not.toMatch(/docsera-toc-rail--lower-toggle/);
    expect(runtimeShellCss).not.toMatch(/\.docsera-toc-rail__body\s*\{[^}]*top:\s*40px;/s);
  });

  it("scrolls to the canonical heading anchor without mutating the workspace route", () => {
    const envelope = createDuplicateHeadingDocseraDocumentEnvelope();
    window.history.replaceState({}, "", "/x_82900_docsera_docsera_sdk_runtime.do#/product-docs/overview?mode=edit");
    renderToc(envelope);

    const headings = screen.getAllByRole("heading");
    expect(headings.map((heading) => heading.id)).toEqual(["overview", "overview-2", "overview-3"]);
    const firstScroll = mockScrollIntoView(headings[0] as Element);
    const secondScroll = mockScrollIntoView(headings[1] as Element);
    const thirdScroll = mockScrollIntoView(headings[2] as Element);

    const links = screen.getAllByRole("link", { name: "Overview" });
    expect(links.map((link) => link.getAttribute("href"))).toEqual(["#overview", "#overview-2", "#overview-3"]);

    fireEvent.click(links[1]);

    expect(secondScroll).toHaveBeenCalledTimes(1);
    expect(firstScroll).not.toHaveBeenCalled();
    expect(thirdScroll).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#/product-docs/overview?mode=edit");
  });

  it("supports keyboard activation with the same in-page scroll behavior", () => {
    const envelope = createHeadingHierarchyDocseraDocumentEnvelope();
    window.history.replaceState({}, "", "/x_82900_docsera_docsera_sdk_runtime.do#/product-docs/overview");
    renderToc(envelope);

    const installHeading = screen.getByRole("heading", { name: "Install", level: 3 });
    const scrollIntoView = mockScrollIntoView(installHeading);
    const installLink = screen.getByRole("link", { name: "Install" });

    fireEvent.keyDown(installLink, { code: "Enter", key: "Enter" });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(window.location.hash).toBe("#/product-docs/overview");
  });

  it("resolves headings inside the editor shadow root by outline order without mutating the workspace route", () => {
    const envelope = createEnvelope([
      {
        type: "heading",
        attrs: { level: 1 },
        content: []
      },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Install" }]
      },
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "CLI" }]
      }
    ]);
    window.history.replaceState({}, "", "/x_82900_docsera_docsera_sdk_runtime.do#/product-docs/overview?mode=edit");
    renderTocOnly(envelope);

    const editorHost = document.createElement("div");
    editorHost.setAttribute("data-docsera-page-editor-host", "true");
    const shadowRoot = editorHost.attachShadow({ mode: "open" });
    const overviewHeading = document.createElement("h1");
    const installHeading = document.createElement("h2");
    installHeading.textContent = "Install";
    const npmHeading = document.createElement("h3");
    npmHeading.textContent = "CLI";
    shadowRoot.append(overviewHeading, installHeading, npmHeading);
    document.body.append(editorHost);

    expect(screen.getByRole("link", { name: "Install" })).toHaveAttribute("href", "#install");
    expect(resolveWorkspaceHeadingTarget("install", 0)).toBe(installHeading);
    expect(resolveWorkspaceHeadingTarget("cli", 1)).toBe(npmHeading);
    expect(window.location.hash).toBe("#/product-docs/overview?mode=edit");
  });

  it("skips empty editor headings when the first populated heading is targeted by pointer activation", () => {
    const envelope = createEnvelope([
      {
        type: "heading",
        attrs: { level: 1 },
        content: []
      },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Install" }]
      },
      {
        type: "heading",
        attrs: { level: 3 },
        content: [{ type: "text", text: "CLI" }]
      }
    ]);
    window.history.replaceState({}, "", "/x_82900_docsera_docsera_sdk_runtime.do#/product-docs/overview?mode=edit");
    renderTocOnly(envelope);

    const { headingElements } = mountEditorHeadings([
      { tagName: "h1" },
      { tagName: "h2", text: "Install" },
      { tagName: "h3", text: "CLI" }
    ]);
    expect(screen.getByRole("link", { name: "Install" })).toHaveAttribute("href", "#install");
    expect(resolveWorkspaceHeadingTarget("install", 0)).toBe(headingElements[1]);
    expect(resolveWorkspaceHeadingTarget("cli", 1)).toBe(headingElements[2]);
    expect(window.location.hash).toBe("#/product-docs/overview?mode=edit");
  });

  it("keeps duplicate editor headings targetable in order when an empty heading is interleaved during keyboard activation", () => {
    const envelope = createEnvelope([
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
      }
    ]);
    window.history.replaceState({}, "", "/x_82900_docsera_docsera_sdk_runtime.do#/product-docs/overview");
    renderTocOnly(envelope);

    const { headingElements } = mountEditorHeadings([
      { tagName: "h2", text: "Overview" },
      { tagName: "h2" },
      { tagName: "h3", text: "Overview" }
    ]);
    const links = screen.getAllByRole("link", { name: "Overview" });

    expect(links[0]).toHaveAttribute("href", "#overview");
    expect(links[1]).toHaveAttribute("href", "#overview-2");
    expect(resolveWorkspaceHeadingTarget("overview", 0)).toBe(headingElements[0]);
    expect(resolveWorkspaceHeadingTarget("overview-2", 1)).toBe(headingElements[2]);
    expect(window.location.hash).toBe("#/product-docs/overview");
  });
});
