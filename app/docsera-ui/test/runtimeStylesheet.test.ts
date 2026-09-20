import { readFileSync } from "node:fs";
import { ensureRuntimeStylesheet } from "../src/client/runtimeStylesheet";

function selectorSpecificity(selector: string) {
  return [
    (selector.match(/#[\w-]+/g) ?? []).length,
    (selector.match(/(\.[\w-]+|\[[^\]]+\]|:[\w-]+(?:\([^)]*\))?)/g) ?? []).length,
    (selector.replace(/#[\w-]+|(\.[\w-]+|\[[^\]]+\]|:[\w-]+(?:\([^)]*\))?)/g, "").match(/\b[a-zA-Z][\w-]*\b/g) ?? []).length
  ] as const;
}

function compareSpecificity(first: readonly number[], second: readonly number[]) {
  for (let index = 0; index < Math.max(first.length, second.length); index += 1) {
    const difference = (first[index] ?? 0) - (second[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

function getRuleBody(css: string, selector: string) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return css.match(new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]*)\\}`, "s"))?.groups?.body ?? "";
}

function getCssSlice(css: string, startMarker: string, endMarker?: string) {
  const start = css.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = endMarker ? css.indexOf(endMarker, start + startMarker.length) : css.length;
  expect(end).toBeGreaterThan(start);
  return css.slice(start, end);
}

function readPixelCustomProperty(css: string, propertyName: string) {
  const escapedPropertyName = propertyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const value = css.match(new RegExp(`${escapedPropertyName}:\\s*(\\d+)px;`))?.[1];
  return value ? Number.parseInt(value, 10) : Number.NaN;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum);
}

function resolveContentLaneGeometry(input: {
  viewportWidth: number;
  navWidth: number;
  tocWidth: number;
  maxSurfaceWidth: number;
  gutterWidth: number;
  pagePadding: number;
  responsiveSurface: boolean;
}) {
  const liveOuterWidth = Math.min(input.viewportWidth, input.maxSurfaceWidth);
  const liveAnchor = input.responsiveSurface
    ? 0
    : clamp(
        (input.viewportWidth - input.navWidth - input.tocWidth - input.maxSurfaceWidth) / 2,
        input.pagePadding,
        input.viewportWidth - input.navWidth - input.pagePadding
      );
  const liveContentLeft = liveAnchor + input.pagePadding;
  const liveContentWidth = liveOuterWidth - input.pagePadding * 2;
  const editOuterWidth = Math.min(input.viewportWidth + input.gutterWidth, input.maxSurfaceWidth + input.gutterWidth);
  const editAnchor = liveAnchor - input.gutterWidth;
  const editContentLeft = editAnchor + input.pagePadding + input.gutterWidth;
  const editContentWidth = editOuterWidth - (input.pagePadding + input.gutterWidth) - input.pagePadding;

  return {
    liveContentLeft,
    editContentLeft,
    liveContentWidth,
    editContentWidth,
    editGutterWidth: input.gutterWidth,
    pagePadding: input.pagePadding
  };
}

test("injects one runtime style tag and reuses it on repeat calls", () => {
  ensureRuntimeStylesheet("body { color: red; }");
  ensureRuntimeStylesheet("body { color: red; }");

  const styleTags = document.head.querySelectorAll('style[data-docsera-runtime-style="runtime-shell"]');
  expect(styleTags).toHaveLength(1);
  expect(styleTags[0]?.textContent).toBe("body { color: red; }");
});

test("replaces runtime style text when the css changes", () => {
  ensureRuntimeStylesheet("body { color: red; }");
  const styleElement = ensureRuntimeStylesheet("body { color: blue; }");

  expect(styleElement.textContent).toBe("body { color: blue; }");
  expect(document.head.querySelectorAll('style[data-docsera-runtime-style="runtime-shell"]')).toHaveLength(1);
});

test("keeps launcher background ownership explicit without changing workspace background contract", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");

  expect(css).toContain(".docsera-app--launcher {");
  expect(css).toContain("background: var(--docsera-surface);");
  expect(css).toContain("html[data-docsera-theme=\"dark\"] .docsera-app--launcher {");
  expect(css).toContain("background: var(--docsera-bg);");
  expect(css).toContain(".app-shell,");
  expect(css).toContain(".docsera-app {");
  expect(css).not.toMatch(/\.docsera-shell\s*\{[^}]*min-height:\s*100vh;/s);
  expect(css).toContain(".docsera-workspace {");
  expect(css).toContain("background: var(--docsera-workspace-bg, var(--docsera-surface));");
  expect(css).toContain("--docsera-workspace-heading-scroll-margin: 16px;");
  expect(css).toContain("--docsera-workspace-toc-top-gap: 8px;");
  expect(css).toContain("--docsera-editor-block-gutter-width: 69px;");
  expect(css).toContain("align-items: stretch;");
  expect(css).toContain(".docsera-workspace__aside {");
  expect(css).toContain("display: flex;");
  expect(css).toMatch(/\.docsera-workspace__aside\s*{[^}]*border-left:\s*1px solid var\(--docsera-border\);/s);
  expect(css).toContain(".docsera-toc-rail {");
  expect(css).toMatch(/\.docsera-toc-rail\s*{[^}]*align-self:\s*flex-start;[^}]*height:\s*calc\(100dvh - var\(--docsera-header-height\) - var\(--docsera-workspace-toc-top-gap\)\);/s);
  expect(css).not.toMatch(/\.docsera-toc-rail\s*{[^}]*height:\s*100%;/s);
  expect(css).toContain("top: var(--docsera-workspace-toc-top-gap);");
  expect(css).toMatch(/\.docsera-toc-rail__body\s*{[^}]*height:\s*100%;[^}]*min-height:\s*0;/s);
  expect(css).not.toMatch(/\.docsera-toc-rail__body\s*{[^}]*border-left:/s);
  expect(css).toContain(".docsera-main__body-heading,");
  expect(css).toContain("scroll-margin-block-start: var(--docsera-workspace-heading-scroll-margin);");
  expect(css).toMatch(/\.docsera-main__surface\s*{[^}]*--docsera-main-surface-anchor-offset:\s*clamp\([^}]*var\(--docsera-main-surface-max-width\)[^}]*\);/s);
  expect(css).toMatch(/\.docsera-main__surface\s*{[^}]*margin-inline-start:\s*clamp\([^}]*var\(--docsera-toc-panel-width\)/s);
  expect(css).toMatch(/\.docsera-main__surface\s*{[^}]*display:\s*grid;[^}]*align-content:\s*start;[^}]*gap:\s*28px;/s);
  expect(css).toMatch(/\.docsera-main__surface--editor\s*{[^}]*gap:\s*0;[^}]*width:\s*min\(calc\(100% \+ var\(--docsera-editor-block-gutter-width\)\), calc\(var\(--docsera-main-surface-max-width\) \+ var\(--docsera-editor-block-gutter-width\)\)\);[^}]*margin-inline-start:\s*calc\(var\(--docsera-main-surface-anchor-offset\) - var\(--docsera-editor-block-gutter-width\)\);[^}]*padding-left:\s*calc\(24px \+ var\(--docsera-editor-block-gutter-width\)\);/s);
  expect(css).toMatch(/\.docsera-main__editor-host\s*{[^}]*margin-top:\s*40px;/s);
});

test("keeps the edit gutter outside the reader-equivalent content lane at constrained and responsive widths", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");

  const mainSurfaceMaxWidth = readPixelCustomProperty(css, "--docsera-main-surface-max-width");
  const gutterWidth = readPixelCustomProperty(css, "--docsera-editor-block-gutter-width");
  const navWidth = readPixelCustomProperty(css, "--docsera-workspace-nav-width");
  const tocWidth = readPixelCustomProperty(css, "--docsera-toc-panel-width");

  expect(mainSurfaceMaxWidth).toBe(768);
  expect(gutterWidth).toBe(69);
  expect(css).toMatch(/\.docsera-main__surface\s*{[^}]*padding:\s*32px 24px 72px;/s);
  expect(css).toMatch(
    /\.docsera-main__surface--editor\s*{[^}]*width:\s*min\(calc\(100% \+ var\(--docsera-editor-block-gutter-width\)\), calc\(var\(--docsera-main-surface-max-width\) \+ var\(--docsera-editor-block-gutter-width\)\)\);/s
  );
  expect(css).toMatch(
    /\.docsera-main__surface--editor\s*{[^}]*margin-inline-start:\s*calc\(var\(--docsera-main-surface-anchor-offset\) - var\(--docsera-editor-block-gutter-width\)\);/s
  );
  expect(css).toMatch(
    /\.docsera-main__surface--editor\s*{[^}]*padding-left:\s*calc\(24px \+ var\(--docsera-editor-block-gutter-width\)\);/s
  );
  const responsive920 = getCssSlice(css, "@media (max-width: 920px)", "@media (max-width: 680px)");
  const responsive680 = getCssSlice(css, "@media (max-width: 680px)", "@media (prefers-reduced-motion: reduce)");
  expect(responsive920).toMatch(/\.docsera-main__surface\s*{[^}]*margin-inline-start:\s*0;/s);
  expect(responsive920).toMatch(
    /\.docsera-main__surface--editor\s*{[^}]*margin-inline-start:\s*calc\(0px - var\(--docsera-editor-block-gutter-width\)\);/s
  );
  expect(responsive680).toMatch(/\.docsera-main__surface\s*{[^}]*padding:\s*24px 16px 48px;/s);
  expect(responsive680).toMatch(/\.docsera-main__surface--editor\s*{[^}]*padding-left:\s*calc\(16px \+ var\(--docsera-editor-block-gutter-width\)\);/s);

  const cases = [
    { name: "normal desktop where anchor >= gutter", viewportWidth: 1440, pagePadding: 24, responsiveSurface: false },
    { name: "constrained desktop where anchor < gutter", viewportWidth: 1060, pagePadding: 24, responsiveSurface: false },
    { name: "responsive <= 920px", viewportWidth: 900, pagePadding: 24, responsiveSurface: true },
    { name: "responsive <= 680px", viewportWidth: 640, pagePadding: 16, responsiveSurface: true }
  ];

  for (const currentCase of cases) {
    const geometry = resolveContentLaneGeometry({
      viewportWidth: currentCase.viewportWidth,
      navWidth,
      tocWidth,
      maxSurfaceWidth: mainSurfaceMaxWidth,
      gutterWidth,
      pagePadding: currentCase.pagePadding,
      responsiveSurface: currentCase.responsiveSurface
    });

    expect(geometry.editContentLeft, currentCase.name).toBe(geometry.liveContentLeft);
    expect(geometry.editContentWidth, currentCase.name).toBe(geometry.liveContentWidth);
    expect(geometry.editGutterWidth, currentCase.name).toBe(69);
    expect(geometry.pagePadding, currentCase.name).toBe(currentCase.pagePadding);
  }
});

test("keeps live reader core text on edit-mode typography and normal block flow", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");

  const readerRule = getRuleBody(css, ".docsera-main__reader");
  const bodyRule = getRuleBody(css, ".docsera-main__body");
  const listRule = getRuleBody(css, ".docsera-main__list");
  const blockquoteRule = getRuleBody(css, ".docsera-main__blockquote");
  const inlineCodeRule = getRuleBody(css, ".docsera-main__inline-code");
  const codeBlockRule = getRuleBody(css, ".docsera-main__code");

  expect(css).toContain('--docsera-document-heading-font-family: Inter, "Segoe UI", sans-serif;');
  expect(css).not.toContain("--docsera-document-heading-font-family: Geist");
  expect(css).toMatch(/\.docsera-main__reader\s*{[^}]*margin-top:\s*calc\(var\(--docsera-document-title-body-gap\) - 28px\);/s);
  expect(readerRule).toContain("color: var(--docsera-document-text-color);");
  expect(css).not.toMatch(/\.docsera-main__reader\s*{[^}]*display:\s*grid;/s);
  expect(css).not.toMatch(/\.docsera-main__reader\s*{[^}]*gap:\s*var\(--docsera-document-block-spacing\);/s);
  expect(css).toMatch(/\.docsera-main__body\s*{\s*margin:\s*0 0 var\(--docsera-document-block-spacing\);\s*}/s);
  expect(css).not.toMatch(/\.docsera-main__body,\s*\.docsera-main__section-copy\s*{[^}]*color:/s);
  expect(bodyRule).not.toContain("color:");
  expect(listRule).not.toContain("color:");
  expect(inlineCodeRule).not.toContain("color:");
  expect(blockquoteRule).toContain("color: var(--docsera-document-blockquote-color);");
  expect(codeBlockRule).toContain("color: var(--docsera-document-text-color);");
  expect(css).toMatch(/\.docsera-main__reader > :first-child\s*{\s*margin-top:\s*0;\s*}/s);
  expect(css).toMatch(/\.docsera-main__reader > :last-child\s*{\s*margin-bottom:\s*0;\s*}/s);
  expect(css).toMatch(/\.docsera-main__surface\s*{[^}]*gap:\s*28px;/s);
  expect(css).toContain("--docsera-document-title-body-gap: 40px;");
});

test("keeps the same main-surface anchor contract when the ToC auto-hides at the responsive breakpoint", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");
  const responsive = css.slice(css.indexOf("@media (max-width: 1180px)"), css.indexOf("@media (max-width: 920px)"));
  expect(responsive).toContain(".docsera-workspace__aside");
  expect(responsive).toContain("display: none;");
  expect(responsive).not.toContain("grid-column: 1 / -1");
  expect(responsive).not.toContain(".docsera-toc-rail__body");
  expect(responsive).not.toContain("margin: 0 auto;");
});

test("keeps Page Settings flex spacing and header divider alignment", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");

  expect(css).toMatch(
    /\.docsera-page-settings\s*{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*gap:\s*18px;[^}]*width:\s*min\(432px, calc\(100vw - var\(--docsera-workspace-nav-width\)\)\);[^}]*overflow-x:\s*clip;[^}]*overflow-y:\s*auto;/s
  );
  expect(css).toMatch(
    /\.docsera-page-settings__header\s*{[^}]*flex:\s*0 0 auto;[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*min-height:\s*var\(--docsera-header-height\);/s
  );
  expect(css).toMatch(
    /\.docsera-page-settings__header-divider\s*{[^}]*height:\s*1px;[^}]*margin:\s*-18px -20px 0;[^}]*background:\s*var\(--docsera-border\);/s
  );
  expect(css).toMatch(/\.docsera-page-settings__rows\s*{[^}]*display:\s*grid;[^}]*gap:\s*14px;[^}]*min-width:\s*0;/s);
});

test("keeps vertical scrolling owned by the app body below the full-width header", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");

  expect(css).toMatch(/html,\s*body\s*{[^}]*height:\s*100%;[^}]*overflow:\s*hidden;/s);
  expect(css).toMatch(/body\s*{[^}]*background:\s*var\(--docsera-bg\);/s);
  expect(css).not.toMatch(/html\s*{[^}]*scrollbar-gutter:\s*stable;/s);
  expect(css).not.toContain("html:has(.docsera-header)");
  expect(css).toMatch(/\.docsera-app\s*{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s);
  expect(css).toMatch(/\.docsera-app__body\s*{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*overflow-x:\s*clip;[^}]*overflow-y:\s*auto;[^}]*scrollbar-gutter:\s*stable;[^}]*scroll-padding-top:\s*var\(--docsera-workspace-heading-scroll-margin\);/s);
  expect(css).toMatch(/\.docsera-header\s*{[^}]*flex:\s*0 0 auto;[^}]*border-bottom:\s*1px solid var\(--docsera-border\);/s);
  expect(css).not.toMatch(/\.docsera-header\s*{[^}]*position:\s*sticky;/s);
  expect(css).not.toMatch(/\.docsera-header\s*{[^}]*margin-inline-end:/s);
  expect(css).toMatch(/\.docsera-header\s*{[^}]*border-bottom:\s*1px solid var\(--docsera-border\);/s);
  expect(css).toMatch(/\.docsera-header__bar\s*{[^}]*padding:\s*0 16px;/s);
  expect(css).not.toMatch(/html:has\(\.docsera-header\) body\s*{[^}]*background:\s*transparent;/s);
  expect(css).not.toContain(".docsera-header::after");
  expect(css).not.toContain("100vw - 100%");
  expect(css).not.toContain("--docsera-document-scrollbar-reserve");
  expect(css).not.toMatch(/html\s*{[^}]*overflow-y:\s*scroll;/s);
  expect(css).not.toMatch(/body\s*{[^}]*overflow-y:\s*scroll;/s);
  expect(css).not.toMatch(/\.docsera-workspace\s*{[^}]*overflow-y:\s*auto;/s);
});

test("keeps the collapsed workspace ToC tab outside the outer aside clip boundary", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");

  expect(css).toMatch(/\.docsera-workspace__aside\s*{[^}]*overflow:\s*visible;/s);
  expect(css).toMatch(/\.docsera-workspace__aside--collapsed\s*{[^}]*width:\s*0;[^}]*border-left-color:\s*transparent;/s);
  expect(css).not.toMatch(/\.docsera-workspace__aside--collapsed\s*{[^}]*overflow:\s*hidden;/s);
  expect(css).toMatch(/\.docsera-toc-rail__toggle\s*{[^}]*left:\s*-24px;/s);
  expect(css).toMatch(/\.docsera-toc-rail__clip\s*{[^}]*overflow:\s*hidden;/s);
});

test("keeps workspace mode controls in the right-side header cluster with matched heights", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");

  expect(css).toMatch(/\.docsera-header__action-slot--mode\s*{[^}]*z-index:\s*1;[^}]*min-width:\s*0;/s);
  expect(css).not.toMatch(/\.docsera-header__action-slot--mode\s*{[^}]*position:\s*absolute;/s);
  expect(css).not.toMatch(/\.docsera-header__action-slot--mode\s*{[^}]*transform:\s*translate\(-50%, -50%\);/s);
  expect(css).toMatch(/\.docsera-header__action-divider\s*{[^}]*width:\s*1px;[^}]*height:\s*20px;[^}]*background:\s*var\(--docsera-border\);/s);
  expect(css).toMatch(/\.docsera-header__action-divider--mode-surface\s*{[^}]*margin-inline:\s*-2px;/s);
  expect(css).toMatch(/\.docsera-header__actions::before\s*{[^}]*content:\s*"";[^}]*width:\s*1px;[^}]*height:\s*26px;[^}]*background:\s*var\(--docsera-border\);/s);
  expect(css).toMatch(/\.docsera-header--live \.docsera-header__actions::before\s*{[^}]*background:\s*transparent;/s);
  expect(css).toMatch(/\.docsera-header__mode-toggle\s*{[^}]*height:\s*32px;[^}]*box-sizing:\s*border-box;/s);
  expect(css).toMatch(/\.docsera-header__surface-toggle\s*{[^}]*height:\s*32px;[^}]*box-sizing:\s*border-box;/s);
  expect(css).toMatch(/\.docsera-header__mode-segment,\s*\.docsera-header__surface-segment\s*{[^}]*height:\s*100%;[^}]*box-sizing:\s*border-box;/s);
  expect(css).toMatch(/\.docsera-header__save-status\s*{[^}]*position:\s*relative;[^}]*width:\s*20px;[^}]*height:\s*20px;/s);
  expect(css).toContain(".docsera-header__save-status-sr-only {");
  expect(css).not.toContain(".docsera-main__save-status");
  expect(css).toMatch(/\.docsera-header__save-status-sync\s*{[^}]*animation:\s*docsera-header-save-status-spin 1\.1s linear infinite;/s);
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.docsera-header__save-status-sync\s*{[\s\S]*?animation:\s*none;/);
  expect(css).toMatch(/\.docsera-main__page-header \.docsera-main__title\s*{[^}]*font-size:\s*2\.5rem;[^}]*line-height:\s*1\.1;/s);
  expect(css).not.toMatch(/\.docsera-main__page-header \.docsera-main__title\s*{[^}]*vw/s);
  expect(css).not.toMatch(/\.docsera-main__page-header \.docsera-main__title\s*{[^}]*clamp\(/s);
  expect(css).toContain(".docsera-header__publish-button");
  expect(css).toContain(".docsera-changes-center--portal {");
  expect(css).toMatch(/\.docsera-changes-center--portal\s*{[^}]*z-index:\s*140;/s);
  expect(css).toContain(".docsera-changes-center__list");
});

test("keeps the publish success toast as a layered header card with viewport-safe width and interactive dismissal", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");

  expect(css).toMatch(/\.docsera-header__publish-panel\s*{[^}]*position:\s*relative;/s);
  expect(css).toMatch(/\.docsera-header__publish-toast\s*{[^}]*position:\s*absolute;[^}]*right:\s*0;[^}]*top:\s*calc\(100% \+ 8px\);[^}]*z-index:\s*35;/s);
  expect(css).toMatch(/\.docsera-header__publish-toast\s*{[^}]*grid-template-columns:\s*auto minmax\(0, 1fr\) auto;[^}]*align-items:\s*center;/s);
  expect(css).toMatch(/\.docsera-header__publish-toast\s*{[^}]*width:\s*clamp\(300px, 24vw, 320px\);[^}]*max-width:\s*min\(320px, calc\(100vw - 24px\)\);/s);
  expect(css).toMatch(/\.docsera-header__publish-toast-dismiss\s*{[^}]*width:\s*26px;[^}]*height:\s*26px;[^}]*background:\s*transparent;/s);
  expect(css).toMatch(/\.docsera-header__publish-toast-dismiss:hover\s*{[^}]*background:/s);
  expect(css).toMatch(/\.docsera-header__publish-toast-dismiss:focus-visible\s*{[^}]*box-shadow:/s);
});

test("keeps modal surfaces above the Changes Center portal and the Changes Center portal above table overlays", () => {
  const shellCss = readFileSync("src/client/styles/runtime-shell.css", "utf8");
  const tableOverlaySource = readFileSync("src/client/editor/TableControlsOverlay.tsx", "utf8");
  const fullscreenViewerStyles = readFileSync("src/client/shared/media/ImageFullscreenViewerStyles.ts", "utf8");

  expect(shellCss).toMatch(/\.docsera-modal\s*{[^}]*z-index:\s*150;/s);
  expect(shellCss).toMatch(/\.docsera-changes-center--portal\s*{[^}]*z-index:\s*140;/s);
  expect(shellCss).toMatch(/\.docsera-main__media-surface\s*{[^}]*border-radius:\s*0;[^}]*overflow:\s*hidden;/s);
  expect(shellCss).not.toMatch(/\.docsera-main__media-activation\s*{[^}]*all:\s*unset;/s);
  expect(shellCss).toContain(".docsera-modal__panel {");
  expect(tableOverlaySource).toContain("const TABLE_CONTROL_OVERLAY_Z_INDEX = 126;");
  expect(tableOverlaySource).toContain("const TABLE_CONTROL_MENU_Z_INDEX = 130;");
  expect(fullscreenViewerStyles).toContain(".docsera-image-viewer {");
  expect(fullscreenViewerStyles).toMatch(/\.docsera-image-viewer\s*{[^}]*z-index:\s*160;/s);
});

test("keeps shared destructive modal warnings and buttons on the semantic destructive theme treatment", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");

  expect(css).toMatch(/\.docsera-modal__copy--warning\s*{\s*color:\s*var\(--docsera-error\);\s*}/s);
  expect(css).not.toMatch(/\.docsera-modal__copy--warning\s*{[^}]*#[0-9a-fA-F]{3,8}/s);
  expect(css).toMatch(/:root\s*{[^}]*--docsera-error:\s*#ba1a1a;/s);
  expect(css).toMatch(/:root\[data-docsera-theme="dark"\]\s*{[^}]*--docsera-error:\s*#ff8a80;/s);

  expect(css).toMatch(
    /\.docsera-modal__primary--destructive\s*{[^}]*background:\s*#c81e1e;[^}]*box-shadow:\s*0 12px 24px rgba\(200, 30, 30, 0\.18\);/s
  );
  expect(css).toMatch(
    /\.docsera-modal__primary--destructive\s*{[^}]*border-color:\s*rgba\(186, 26, 26, 0\.18\);[^}]*background:\s*rgba\(186, 26, 26, 0\.1\);[^}]*color:\s*var\(--docsera-error\);[^}]*box-shadow:\s*none;/s
  );
  expect(css).toMatch(
    /\.docsera-modal__primary--destructive:not\(:disabled\):hover\s*{[^}]*background:\s*rgba\(186, 26, 26, 0\.14\);[^}]*border-color:\s*rgba\(186, 26, 26, 0\.28\);/s
  );
  expect(css).toMatch(
    /html\[data-docsera-theme="dark"\] \.docsera-modal__primary--destructive\s*{[^}]*background:\s*rgba\(255, 138, 128, 0\.08\);[^}]*border-color:\s*rgba\(255, 138, 128, 0\.2\);[^}]*color:\s*var\(--docsera-error\);/s
  );
  expect(css).toMatch(
    /html\[data-docsera-theme="dark"\] \.docsera-modal__primary--destructive:hover\s*{[^}]*background:\s*rgba\(255, 138, 128, 0\.14\);/s
  );
});

test("keeps manage access Add Members visual states on defined theme tokens", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");

  expect(css).toMatch(/\.docsera-modal__panel\s*{[^}]*width:\s*min\(100%, 448px\);/s);
  expect(css).toMatch(
    /\.docsera-manage-access__add-panel\s*{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*width:\s*min\(960px, calc\(100vw - 48px\)\);[^}]*max-height:\s*min\(760px, calc\(100vh - 80px\)\);/s
  );
  expect(css).toMatch(
    /\.docsera-manage-access__add-panel \.docsera-modal__header,\s*\.docsera-manage-access__add-panel \.docsera-modal__footer\s*{[^}]*flex:\s*0 0 auto;/s
  );
  expect(css).toMatch(
    /\.docsera-manage-access__add-body\s*{[^}]*--docsera-manage-access-add-list-height:\s*clamp\(280px, 46vh, 420px\);[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*overflow:\s*auto;/s
  );
  expect(css).toMatch(
    /\.docsera-workspace-settings-overlay__title\s*{[^}]*color:\s*var\(--docsera-text\);[^}]*font-family:\s*Geist, Inter, "Segoe UI", sans-serif;[^}]*font-size:\s*1rem;[^}]*font-weight:\s*700;[^}]*line-height:\s*1\.25;/s
  );
  expect(css).toMatch(
    /\.docsera-manage-access__title\s*{[^}]*color:\s*var\(--docsera-text\);[^}]*font-family:\s*Geist, Inter, "Segoe UI", sans-serif;[^}]*font-size:\s*1rem;[^}]*font-weight:\s*700;[^}]*line-height:\s*1\.25;/s
  );
  expect(css).not.toMatch(/\.docsera-manage-access__title\s*{[^}]*font-size:\s*1\.25rem;/s);
  expect(css).not.toMatch(/\.docsera-manage-access__title\s*{[^}]*line-height:\s*1\.2;/s);
  expect(css).toMatch(
    /\.docsera-manage-access__search-results\s*{[^}]*height:\s*var\(--docsera-manage-access-add-list-height\);[^}]*min-height:\s*0;[^}]*overflow:\s*auto;/s
  );
  expect(css).toMatch(/\.docsera-manage-access__list-align-spacer\s*{[^}]*min-height:\s*34px;/s);
  expect(css).toMatch(
    /\.docsera-manage-access__staged-list\s*{[^}]*height:\s*var\(--docsera-manage-access-add-list-height\);[^}]*min-height:\s*0;[^}]*overflow:\s*auto;/s
  );
  expect(css).toMatch(/\.docsera-manage-access__user-option\s*{[^}]*cursor:\s*pointer;/s);
  expect(css).toMatch(/\.docsera-manage-access__staged-member\s*{[^}]*cursor:\s*pointer;/s);
  expect(css).toMatch(
    /\.docsera-manage-access__staged-member \.docsera-manage-access__member-main,\s*\.docsera-manage-access__staged-member \.docsera-manage-access__member-name,\s*\.docsera-manage-access__staged-member \.docsera-manage-access__member-meta\s*{[^}]*cursor:\s*pointer;/s
  );
  expect(css).toMatch(/\.docsera-manage-access__role-select\s*{[^}]*cursor:\s*auto;/s);
  expect(css).toMatch(
    /\.docsera-manage-access__user-option span\s*{[^}]*font-size:\s*0\.8125rem;[^}]*line-height:\s*1\.25;/s
  );
  expect(css).toMatch(
    /\.docsera-manage-access__user-option small\s*{[^}]*font-size:\s*0\.75rem;/s
  );
  expect(css).toMatch(
    /\.docsera-manage-access__staged-member \.docsera-manage-access__member-name\s*{[^}]*font-size:\s*0\.8125rem;[^}]*line-height:\s*1\.25;/s
  );
  expect(css).toMatch(
    /\.docsera-manage-access__staged-member \.docsera-manage-access__member-actions select\s*{[^}]*min-height:\s*32px;[^}]*font-size:\s*0\.8125rem;/s
  );
  expect(css).toMatch(
    /\.docsera-manage-access__user-option:hover\s*{[^}]*background:\s*color-mix\(in srgb, var\(--docsera-surface-muted\) 72%, var\(--docsera-surface\) 28%\);[^}]*border-color:\s*color-mix\(in srgb, var\(--docsera-primary\) 14%, var\(--docsera-border-soft\)\);/s
  );
  expect(css).toMatch(
    /\.docsera-manage-access__user-option--selected\s*{[^}]*background:\s*color-mix\(in srgb, var\(--docsera-primary-soft\) 72%, var\(--docsera-surface\) 28%\);[^}]*border-color:\s*color-mix\(in srgb, var\(--docsera-primary\) 42%, var\(--docsera-border-soft\)\);/s
  );
  expect(css).toMatch(/\.docsera-manage-access__user-option--selected\s*{[^}]*box-shadow:\s*inset 3px 0 0 var\(--docsera-primary\);/s);
  expect(css).toMatch(
    /\.docsera-manage-access__staged-member--error\s*{[^}]*border-color:\s*color-mix\(in srgb, var\(--docsera-error\) 62%, var\(--docsera-border-soft\)\);[^}]*background:\s*color-mix\(in srgb, var\(--docsera-error\) 8%, var\(--docsera-surface\)\);/s
  );
  expect(css).toMatch(/\.docsera-manage-access__staged-error\s*{[^}]*color:\s*var\(--docsera-error\);/s);
  const genericSecondaryHover = ".docsera-modal__secondary:hover:not(:disabled)";
  const removeButtonHover = ".docsera-modal__secondary.docsera-manage-access__remove-button:not(:disabled):hover";
  const darkRemoveButtonHover = `html[data-docsera-theme="dark"] ${removeButtonHover}`;
  expect(css).toMatch(
    /\.docsera-modal__secondary\.docsera-manage-access__remove-button:not\(:disabled\):hover\s*{[^}]*border-color:\s*rgba\(186, 26, 26, 0\.28\);[^}]*background:\s*rgba\(186, 26, 26, 0\.14\);[^}]*color:\s*var\(--docsera-error\);/s
  );
  expect(css).toMatch(
    /html\[data-docsera-theme="dark"\] \.docsera-modal__secondary\.docsera-manage-access__remove-button:not\(:disabled\):hover\s*{[^}]*border-color:\s*rgba\(255, 138, 128, 0\.28\);[^}]*background:\s*rgba\(255, 138, 128, 0\.14\);[^}]*color:\s*var\(--docsera-error\);/s
  );
  expect(compareSpecificity(selectorSpecificity(removeButtonHover), selectorSpecificity(genericSecondaryHover))).toBeGreaterThan(0);
  expect(compareSpecificity(selectorSpecificity(darkRemoveButtonHover), selectorSpecificity(genericSecondaryHover))).toBeGreaterThan(0);
  expect(css.indexOf(genericSecondaryHover)).toBeGreaterThan(css.indexOf(removeButtonHover));
  expect(css).not.toMatch(/\.docsera-manage-access__remove-button:hover\s*{/);
  expect(css).not.toMatch(/\.docsera-manage-access__remove-button\s*{[^}]*rgba\(186, 26, 26/s);

  const manageAccessSection = css.slice(css.indexOf(".docsera-manage-access__user-option"), css.indexOf(".docsera-modal__form"));
  expect(manageAccessSection).not.toMatch(/--docsera-(?:accent|surface-raised|danger)\b/);
});

test("keeps reader table styling aligned to the E5 Legacy geometry without advanced-control spacing", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");

  expect(css).toMatch(/\.docsera-main__table-wrapper\s*{[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*visible;[^}]*margin:\s*1rem 0;/s);
  expect(css).not.toMatch(/\.docsera-main__table-wrapper\s*{[^}]*padding-bottom:/s);
  expect(css).toMatch(/\.docsera-main__table\s*{[^}]*width:\s*max-content;[^}]*border-collapse:\s*collapse;[^}]*table-layout:\s*auto;/s);
  expect(css).toMatch(/\.docsera-main__table\s*{[^}]*font-size:\s*inherit;[^}]*line-height:\s*inherit;/s);
  expect(css).toMatch(/\.docsera-main__table-cell\s*{[^}]*min-width:\s*80px;[^}]*padding:\s*0\.38rem 0\.75rem;[^}]*border:\s*1px solid/s);
  expect(css).toMatch(/\.docsera-main__table-cell\s*{[^}]*vertical-align:\s*top;/s);
  expect(css).toMatch(/\.docsera-main__accordion-panel\[hidden\]\s*{\s*display:\s*none;/s);
});

test("keeps editor accordion affordances anchored to the title row and hides closed menus explicitly", () => {
  const css = readFileSync("src/client/editor/PageEditorHostRuntime.tsx", "utf8");
  const runtimeCss = readFileSync("src/client/styles/runtime-shell.css", "utf8");
  const editAccordionSelector = ".docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion";
  const editFirstAccordionSelector = ".docsera-editor-runtime__surface .ProseMirror > .docsera-editor-accordion:first-child";
  const liveAccordionSelector = ".docsera-main__accordion";
  const liveFirstBlockSelector = ".docsera-main__reader > :first-child";

  expect(css).toMatch(
    /\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion\s*{[^}]*margin:\s*1rem 0;[^}]*border:\s*1px solid color-mix\(in srgb, var\(--docsera-border\) 82%, var\(--docsera-text-soft\)\);[^}]*border-radius:\s*18px;[^}]*background:\s*color-mix\(in srgb, var\(--docsera-surface\) 94%, var\(--docsera-surface-muted\) 6%\);/s
  );
  expect(css).toMatch(
    /\.docsera-editor-runtime__surface \.ProseMirror > \.docsera-editor-accordion:first-child\s*{\s*margin-top:\s*0;\s*}/s
  );
  expect(css.indexOf(editFirstAccordionSelector)).toBeGreaterThan(css.indexOf(editAccordionSelector));
  expect(compareSpecificity(selectorSpecificity(editFirstAccordionSelector), selectorSpecificity(editAccordionSelector))).toBeGreaterThan(0);
  expect(getRuleBody(css, editAccordionSelector)).toContain("margin: 1rem 0;");
  expect(getRuleBody(css, editFirstAccordionSelector)).toContain("margin-top: 0;");
  expect(runtimeCss).toMatch(/\.docsera-main__reader > :first-child\s*{\s*margin-top:\s*0;\s*}/s);
  expect(runtimeCss).toMatch(/\.docsera-main__accordion\s*{[^}]*margin:\s*1rem 0;/s);
  expect(compareSpecificity(selectorSpecificity(liveFirstBlockSelector), selectorSpecificity(liveAccordionSelector))).toBeGreaterThan(0);
  expect(css).toMatch(
    /\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__item\s*{[^}]*display:\s*grid;[^}]*--docsera-editor-accordion-title-row-height:\s*3\.4rem;[^}]*--docsera-editor-accordion-title-row-center:\s*calc\(var\(--docsera-editor-accordion-title-row-height\) \/ 2\);[^}]*--docsera-editor-accordion-control-size:\s*1\.7rem;[^}]*--docsera-editor-accordion-chevron-size:\s*18px;[^}]*--docsera-editor-accordion-toggle-left:\s*calc\(\s*1\.1rem\s*-\s*\(\(var\(--docsera-editor-accordion-control-size\) - var\(--docsera-editor-accordion-chevron-size\)\) \/ 2\)\s*\);[^}]*--docsera-editor-accordion-menu-gap:\s*0\.35rem;/s
  );
  expect(css).toMatch(
    /\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__item \+ \.docsera-editor-accordion__item\s*{[^}]*border-top:\s*1px solid color-mix\(in srgb, var\(--docsera-border\) 82%, var\(--docsera-text-soft\)\);/s
  );
  expect(css).toMatch(
    /\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__control\s*{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*font:\s*inherit;/s
  );
  expect(css).toMatch(
    /\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__add-lane\s*{[^}]*position:\s*absolute;[^}]*left:\s*100%;[^}]*top:\s*0;[^}]*width:\s*2\.25rem;[^}]*height:\s*100%;[^}]*pointer-events:\s*auto;[^}]*background:\s*transparent;[^}]*cursor:\s*pointer;[^}]*z-index:\s*0;/s
  );
  expect(css).toMatch(
    /\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__control--ellipsis,\s*\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__control--add\s*{[^}]*top:\s*var\(--docsera-editor-accordion-title-row-center\);[^}]*transform:\s*translateY\(-50%\);/s
  );
  expect(css).toMatch(
    /\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__control--ellipsis:hover,[\s\S]*\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__control--add:focus-visible\s*{[^}]*background:\s*var\(--docsera-surface-muted\);[^}]*outline:\s*none;/s
  );
  expect(css).toMatch(
    /\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__control--toggle:hover\s*{[^}]*background:\s*transparent;[^}]*color:\s*var\(--docsera-text-soft\);[^}]*box-shadow:\s*none;[^}]*outline:\s*none;/s
  );
  expect(css).toMatch(
    /\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__control--toggle:focus-visible\s*{[^}]*background:\s*transparent;[^}]*color:\s*var\(--docsera-text-soft\);[^}]*outline:\s*none;[^}]*box-shadow:\s*0 0 0 2px color-mix\(in srgb, var\(--docsera-primary\) 18%, white 20%\);/s
  );
  expect(css).toMatch(/\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__control--toggle\s*{[^}]*left:\s*var\(--docsera-editor-accordion-toggle-left\);[^}]*top:\s*var\(--docsera-editor-accordion-title-row-center\);[^}]*color:\s*var\(--docsera-text-soft\);[^}]*visibility:\s*visible;/s);
  expect(css).toMatch(
    /\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__menu\s*{[^}]*top:\s*calc\(\s*var\(--docsera-editor-accordion-title-row-center\)\s*\+\s*\(var\(--docsera-editor-accordion-control-size\) \/ 2\)\s*\+\s*var\(--docsera-editor-accordion-menu-gap\)\s*\);/s
  );
  expect(css).toContain(".docsera-block-menu__item:disabled,");
  expect(css).toContain(".docsera-block-menu__item--destructive:disabled,");
  expect(css).toContain(".docsera-block-menu__item--destructive:disabled.docsera-block-menu__item--active {");
  expect(css).toMatch(/\.docsera-block-menu__item:disabled,\s*\.docsera-block-menu__item:disabled:hover,\s*\.docsera-block-menu__item:disabled:focus-visible\s*{[^}]*cursor:\s*not-allowed;[^}]*color:\s*var\(--docsera-text-soft\);[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
  expect(css).toMatch(/\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__menu\[hidden\]\s*{\s*display:\s*none;/s);
  expect(css).toMatch(
    /\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__title\s*{[^}]*padding:\s*1rem 1\.1rem 1rem calc\(1\.1rem \+ var\(--docsera-editor-accordion-chevron-size\) \+ 16px\);[^}]*font-family:\s*Geist, Inter, "Segoe UI", sans-serif;[^}]*font-size:\s*1rem;[^}]*font-weight:\s*700;[^}]*line-height:\s*1\.4;[^}]*color:\s*var\(--docsera-text\);/s
  );
  expect(css).not.toMatch(
    /\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__title\s*{[^}]*padding:[^;}]*var\(--docsera-editor-accordion-control-size\)/s
  );
  expect(css).toMatch(
    /\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__content\s*{[^}]*display:\s*grid;[^}]*gap:\s*12px;[^}]*margin-top:\s*0;[^}]*padding:\s*0 1\.1rem 1rem;[^}]*color:\s*var\(--docsera-text-muted\);/s
  );
  expect(css).toMatch(/\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__content\[hidden\]\s*{\s*display:\s*none;/s);
  expect(css).toContain(".docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__content > :first-child {");
  expect(css).toContain(".docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__content > :last-child {");
  expect(css).not.toMatch(/\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__control:hover/);
  expect(css).not.toMatch(/\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__control:focus-visible/);
});

test("keeps compact menu hover and icon chrome off disabled items", () => {
  const css = readFileSync("src/client/editor/CompactMenuStyles.ts", "utf8");

  expect(css).toContain(":is(.docsera-text-toolbar__menu-item, .docsera-compact-menu__item):not(:disabled):hover,");
  expect(css).toContain(":is(.docsera-text-toolbar__menu-item, .docsera-compact-menu__item):not(:disabled):focus-visible {");
  expect(css).toContain(".docsera-compact-menu__item:not(:disabled):hover .docsera-compact-menu__item-icon,");
  expect(css).toContain(".docsera-compact-menu__item:not(:disabled):focus-visible .docsera-compact-menu__item-icon,");
  expect(css).toMatch(/:is\(\.docsera-text-toolbar__menu-item, \.docsera-compact-menu__item\):disabled\s*{[^}]*cursor:\s*not-allowed;[^}]*color:\s*var\(--docsera-text-soft\);[^}]*box-shadow:\s*none;/s);
  expect(css).not.toMatch(/:is\(\.docsera-text-toolbar__menu-item, \.docsera-compact-menu__item\):hover,\s*:is\(\.docsera-text-toolbar__menu-item, \.docsera-compact-menu__item\):focus-visible/);
});
