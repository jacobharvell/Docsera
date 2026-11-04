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

function createPageRecord(envelope: DocseraDocumentEnvelope, overrides: Partial<WorkspacePageRecord> = {}): WorkspacePageRecord {
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
    active: true,
    ...overrides
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

function renderTocForPage(page: ReturnType<typeof buildWorkspacePageView>) {
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

function mockReducedMotionPreference(matches: boolean) {
  const matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn()
  }));

  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: matchMedia
  });

  return matchMedia;
}

function readRuntimeShellCss(): string {
  const nodeProcess = new Function("return process")() as {
    cwd: () => string;
    getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
  };
  return nodeProcess.getBuiltinModule("fs").readFileSync(`${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`, "utf8");
}

function readCssRuleBlock(css: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escapedSelector}\\s*\\{(?<block>[^}]*)\\}`, "s"))?.groups?.block ?? "";
}

afterEach(() => {
  cleanup();
  document.querySelector("[data-docsera-page-editor-host='true']")?.remove();
  Reflect.deleteProperty(window, "matchMedia");
  window.history.replaceState({}, "", "/x_2300756_docsera_docsera_sdk_runtime.do");
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
    expect(screen.getByRole("button", { name: "Collapse table of contents" })).toHaveClass("docsera-toc-rail__toggle");
    const runtimeShellCss = readRuntimeShellCss();
    expect(runtimeShellCss).toMatch(/\.docsera-toc-rail__toggle\s*\{[^}]*top:\s*36px;/s);
    expect(runtimeShellCss).toMatch(/\.docsera-toc-rail__toggle:hover\s*\{[^}]*color:\s*var\(--docsera-primary\);/s);
    expect(runtimeShellCss).not.toMatch(/docsera-toc-rail--lower-toggle/);
    expect(runtimeShellCss).not.toMatch(/\.docsera-toc-rail__body\s*\{[^}]*top:\s*40px;/s);
  });

  it("keeps the panel chrome stable without placeholder rows while loading headings", () => {
    const page = buildWorkspacePageView(createPageRecord(createHeadingHierarchyDocseraDocumentEnvelope()), "live");
    render(
      <WorkspaceToc
        collapsed={false}
        isLoading={true}
        page={page}
        panelId="docsera-workspace-toc"
        showPendingState={true}
        onToggleCollapsed={() => undefined}
      />
    );

    expect(screen.getByText("On this page")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Collapse table of contents" })).toBeInTheDocument();
    expect(document.querySelector(".docsera-toc__loading")).toBeNull();
    expect(screen.queryByRole("link", { name: "Overview" })).not.toBeInTheDocument();
  });

  it("does not render ToC placeholder rows while loading an outline that resolves empty", () => {
    const emptyPage = buildWorkspacePageView(
      createPageRecord(
        createEnvelope([
          {
            type: "paragraph",
            content: [{ type: "text", text: "No headings on this page." }]
          }
        ]),
        { sysId: "page-empty" }
      ),
      "live"
    );
    const { rerender } = render(
      <WorkspaceToc
        collapsed={false}
        isLoading={true}
        page={emptyPage}
        panelId="docsera-workspace-toc"
        showPendingState={true}
        onToggleCollapsed={() => undefined}
      />
    );

    expect(screen.getByText("On this page")).toBeInTheDocument();
    expect(document.querySelector(".docsera-toc__loading")).toBeNull();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    rerender(
      <WorkspaceToc
        collapsed={false}
        isLoading={false}
        page={emptyPage}
        panelId="docsera-workspace-toc"
        showPendingState={true}
        onToggleCollapsed={() => undefined}
      />
    );

    expect(screen.getByText("On this page")).toBeInTheDocument();
    expect(document.querySelector(".docsera-toc__loading")).toBeNull();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("keeps the heading and toggle outside a shrinkable native outline scroller", () => {
    renderTocOnly(createHeadingHierarchyDocseraDocumentEnvelope());
    const list = document.querySelector(".docsera-toc__list");
    const heading = screen.getByText("On this page");
    const toggle = screen.getByRole("button", { name: "Collapse table of contents" });
    expect(list).toContainElement(screen.getAllByRole("link")[0]);
    expect(list).not.toContainElement(heading);
    expect(list).not.toContainElement(toggle);

    const css = readRuntimeShellCss();
    const toc = readCssRuleBlock(css, ".docsera-toc");
    const outline = readCssRuleBlock(css, ".docsera-toc__list");
    expect(toc).toMatch(/display:\s*flex;[\s\S]*flex-direction:\s*column;/);
    expect(toc).toMatch(/height:\s*100%;[\s\S]*min-height:\s*0;/);
    expect(outline).toMatch(/flex:\s*0 1 auto;[\s\S]*min-height:\s*0;/);
    expect(outline).toMatch(/overflow-y:\s*auto;/);
    expect(outline).toMatch(/scrollbar-gutter:\s*stable;/);
    expect(outline).not.toMatch(/scrollbar-(?:width|color):/);
    expect(readCssRuleBlock(css, ".docsera-toc-rail__clip")).toMatch(/width:\s*calc\(100% \+ 2px\);/);
    expect(readCssRuleBlock(css, ".docsera-toc-rail__body")).toMatch(/padding:\s*16px 6px 16px 16px;/);
    expect(readCssRuleBlock(css, ".docsera-toc__list::-webkit-scrollbar-thumb")).toMatch(/background:\s*transparent;/);
    expect(css).toMatch(/\.docsera-toc-rail__body:hover \.docsera-toc__list::-webkit-scrollbar-thumb/);
    expect(css).toMatch(/\.docsera-toc-rail__body:focus-within \.docsera-toc__list::-webkit-scrollbar-thumb/);
    expect(css).toMatch(/\.docsera-toc__list::-webkit-scrollbar-thumb:active/);
    expect(css).toMatch(/@supports not selector\(::-webkit-scrollbar\)/);
    expect(readCssRuleBlock(css, ".docsera-toc__list::-webkit-scrollbar")).toMatch(/width:\s*4px;/);
    expect(readCssRuleBlock(css, ".docsera-toc__list::-webkit-scrollbar-button")).toMatch(/display:\s*none;/);
    expect(css).toMatch(/\.docsera-toc__link\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
  });

  it("reserves matching top and bottom viewport clearance for the sticky ToC rail", () => {
    const runtimeShellCss = readRuntimeShellCss();
    const railRule = readCssRuleBlock(runtimeShellCss, ".docsera-toc-rail");

    expect(railRule).toMatch(/position:\s*sticky;/);
    expect(railRule).toMatch(/top:\s*var\(--docsera-workspace-toc-top-gap\);/);
    expect(railRule).toMatch(
      /height:\s*calc\(\s*100dvh\s*-\s*var\(--docsera-header-height\)\s*-\s*var\(--docsera-workspace-toc-top-gap\)\s*-\s*var\(--docsera-workspace-toc-top-gap\)\s*\);/
    );
    expect(railRule).toMatch(
      /max-height:\s*calc\(\s*100dvh\s*-\s*var\(--docsera-header-height\)\s*-\s*var\(--docsera-workspace-toc-top-gap\)\s*-\s*var\(--docsera-workspace-toc-top-gap\)\s*\);/
    );
  });

  it("smoothly scrolls to the canonical live heading anchor without mutating the workspace route", () => {
    const envelope = createDuplicateHeadingDocseraDocumentEnvelope();
    window.history.replaceState({}, "", "/x_2300756_docsera_docsera_sdk_runtime.do#/product-docs/overview?mode=edit");
    const matchMedia = mockReducedMotionPreference(false);
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
    expect(secondScroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start", inline: "nearest" });
    expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
    expect(firstScroll).not.toHaveBeenCalled();
    expect(thirdScroll).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#/product-docs/overview?mode=edit");
    expect(links[0]).not.toHaveClass("docsera-toc__link--active");
    expect(links[1]).toHaveClass("docsera-toc__link--active");
  });

  it("supports keyboard activation with the same smooth in-page scroll behavior", () => {
    const envelope = createHeadingHierarchyDocseraDocumentEnvelope();
    window.history.replaceState({}, "", "/x_2300756_docsera_docsera_sdk_runtime.do#/product-docs/overview");
    mockReducedMotionPreference(false);
    renderToc(envelope);

    const installHeading = screen.getByRole("heading", { name: "Install", level: 3 });
    const scrollIntoView = mockScrollIntoView(installHeading);
    const installLink = screen.getByRole("link", { name: "Install" });
    const overviewLink = screen.getByRole("link", { name: "Overview" });

    fireEvent.keyDown(installLink, { code: "Enter", key: "Enter" });

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start", inline: "nearest" });
    expect(window.location.hash).toBe("#/product-docs/overview");
    expect(overviewLink).not.toHaveClass("docsera-toc__link--active");
    expect(installLink).toHaveClass("docsera-toc__link--active");
  });

  it("uses immediate scrolling when reduced motion is preferred", () => {
    const envelope = createHeadingHierarchyDocseraDocumentEnvelope();
    mockReducedMotionPreference(true);
    renderToc(envelope);

    const installHeading = screen.getByRole("heading", { name: "Install", level: 3 });
    const scrollIntoView = mockScrollIntoView(installHeading);
    const installLink = screen.getByRole("link", { name: "Install" });

    fireEvent.click(installLink);

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", block: "start", inline: "nearest" });
  });

  it("marks the first ToC item active on initial presentation", () => {
    const envelope = createHeadingHierarchyDocseraDocumentEnvelope();
    renderTocOnly(envelope);

    const overviewLink = screen.getByRole("link", { name: "Overview" });
    const installLink = screen.getByRole("link", { name: "Install" });

    expect(overviewLink).toHaveClass("docsera-toc__link--active");
    expect(installLink).not.toHaveClass("docsera-toc__link--active");
  });

  it("resets active state to the first item when the page changes", () => {
    const firstPage = buildWorkspacePageView(createPageRecord(createDuplicateHeadingDocseraDocumentEnvelope(), { sysId: "page-one" }), "live");
    const secondPage = buildWorkspacePageView(createPageRecord(createHeadingHierarchyDocseraDocumentEnvelope(), { sysId: "page-two" }), "live");
    const { rerender } = renderTocForPage(firstPage);

    const duplicateOverviewLinks = screen.getAllByRole("link", { name: "Overview" });
    fireEvent.click(duplicateOverviewLinks[1]);
    expect(duplicateOverviewLinks[1]).toHaveClass("docsera-toc__link--active");

    rerender(
      <WorkspaceToc collapsed={false} page={secondPage} panelId="docsera-workspace-toc" showPendingState={false} onToggleCollapsed={() => undefined} />
    );

    expect(screen.getByRole("link", { name: "Overview" })).toHaveClass("docsera-toc__link--active");
    expect(screen.getByRole("link", { name: "Install" })).not.toHaveClass("docsera-toc__link--active");
  });

  it("falls back to the first available item when the active heading leaves the same page outline", () => {
    const originalPage = buildWorkspacePageView(createPageRecord(createHeadingHierarchyDocseraDocumentEnvelope()), "live");
    const changedEnvelope = createEnvelope([
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Overview" }]
      },
      {
        type: "heading",
        attrs: { level: 2 },
        content: [{ type: "text", text: "Usage" }]
      }
    ]);
    const changedPage = buildWorkspacePageView(createPageRecord(changedEnvelope), "live");
    const { rerender } = renderTocForPage(originalPage);

    const installLink = screen.getByRole("link", { name: "Install" });
    fireEvent.click(installLink);
    expect(installLink).toHaveClass("docsera-toc__link--active");

    rerender(
      <WorkspaceToc collapsed={false} page={changedPage} panelId="docsera-workspace-toc" showPendingState={false} onToggleCollapsed={() => undefined} />
    );

    expect(screen.getByRole("link", { name: "Overview" })).toHaveClass("docsera-toc__link--active");
    expect(screen.getByRole("link", { name: "Usage" })).not.toHaveClass("docsera-toc__link--active");
  });

  it("keeps the ToC rail continuous while preserving row spacing and link dimensions", () => {
    const runtimeShellCss = readRuntimeShellCss();

    expect(runtimeShellCss).toMatch(/\.docsera-toc__list\s*\{[^}]*position:\s*relative;[^}]*gap:\s*4px;/s);
    expect(runtimeShellCss).toMatch(
      /\.docsera-toc__list::before\s*\{[^}]*content:\s*"";[^}]*position:\s*absolute;[^}]*inset:\s*0 auto 0 0;[^}]*width:\s*1px;[^}]*background:\s*var\(--docsera-border\);/s
    );
    expect(runtimeShellCss).toMatch(/\.docsera-toc__link\s*\{[^}]*padding:\s*6px 0 6px 13px;[^}]*font-weight:\s*500;[^}]*line-height:\s*1\.4286;/s);
    expect(runtimeShellCss).toMatch(/\.docsera-toc__link\[data-level="2"\]\s*\{[^}]*padding-left:\s*23px;/s);
    expect(runtimeShellCss).toMatch(/\.docsera-toc__link\[data-level="3"\]\s*\{[^}]*padding-left:\s*33px;/s);
  });

  it("keeps hover and active presentation paint-only on top of the neutral baseline", () => {
    const runtimeShellCss = readRuntimeShellCss();
    const hoverRule = readCssRuleBlock(runtimeShellCss, ".docsera-toc__link:hover");
    const activeRule = readCssRuleBlock(runtimeShellCss, ".docsera-toc__link--active");

    expect(runtimeShellCss).toMatch(/\.docsera-toc__link\s*\{[^}]*font-weight:\s*500;/s);
    expect(runtimeShellCss).not.toMatch(/\.docsera-toc__link\s*\{[^}]*border-left/s);
    expect(hoverRule).toMatch(/color:\s*var\(--docsera-primary\);/);
    expect(hoverRule).not.toMatch(/padding|border|font-weight|line-height/);
    expect(activeRule).toMatch(/color:\s*var\(--docsera-primary\);/);
    expect(activeRule).not.toMatch(/padding|border|font-weight|line-height/);
    expect(runtimeShellCss).not.toMatch(/\.docsera-toc__link--active\[data-level="[23]"\]/);
    expect(runtimeShellCss).toMatch(
      /\.docsera-toc__link::before\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*0 auto 0 0;[^}]*width:\s*2px;[^}]*background:\s*var\(--docsera-primary\);[^}]*opacity:\s*0;/s
    );
    expect(runtimeShellCss).toMatch(
      /\.docsera-toc__link:hover::before,\s*\.docsera-toc__link--active::before\s*\{[^}]*opacity:\s*1;/s
    );
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
    window.history.replaceState({}, "", "/x_2300756_docsera_docsera_sdk_runtime.do#/product-docs/overview?mode=edit");
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

  it("smoothly scrolls to the editor shadow-root heading while skipping empty headings during pointer activation", () => {
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
    window.history.replaceState({}, "", "/x_2300756_docsera_docsera_sdk_runtime.do#/product-docs/overview?mode=edit");
    mockReducedMotionPreference(false);
    renderTocOnly(envelope);

    const { headingElements } = mountEditorHeadings([
      { tagName: "h1" },
      { tagName: "h2", text: "Install" },
      { tagName: "h3", text: "CLI" }
    ]);
    expect(screen.getByRole("link", { name: "Install" })).toHaveAttribute("href", "#install");
    expect(resolveWorkspaceHeadingTarget("install", 0)).toBe(headingElements[1]);
    expect(resolveWorkspaceHeadingTarget("cli", 1)).toBe(headingElements[2]);

    const scrollIntoView = mockScrollIntoView(headingElements[1]);
    fireEvent.click(screen.getByRole("link", { name: "Install" }));

    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start", inline: "nearest" });
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
    window.history.replaceState({}, "", "/x_2300756_docsera_docsera_sdk_runtime.do#/product-docs/overview");
    mockReducedMotionPreference(false);
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

    const firstScroll = mockScrollIntoView(headingElements[0]);
    const secondScroll = mockScrollIntoView(headingElements[2]);
    fireEvent.keyDown(links[1], { code: "Enter", key: "Enter" });

    expect(secondScroll).toHaveBeenCalledTimes(1);
    expect(secondScroll).toHaveBeenCalledWith({ behavior: "smooth", block: "start", inline: "nearest" });
    expect(firstScroll).not.toHaveBeenCalled();
    expect(window.location.hash).toBe("#/product-docs/overview");
  });
});
