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

function readZIndex(source: string, selector: string) {
  const body = getRuleBody(source, selector);
  const value = /z-index:\s*(\d+);/.exec(body)?.[1];
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
  const anchorMinimum = Math.max(input.pagePadding, input.gutterWidth - input.pagePadding);
  const centeredAnchor = (input.viewportWidth - input.navWidth - input.tocWidth - input.maxSurfaceWidth) / 2;
  const liveAnchor = clamp(
    input.responsiveSurface ? anchorMinimum : centeredAnchor,
    anchorMinimum,
    input.viewportWidth - input.navWidth - input.pagePadding
  );
  const liveOuterWidth = Math.min(
    input.responsiveSurface ? input.viewportWidth - liveAnchor : input.viewportWidth,
    input.maxSurfaceWidth
  );
  const liveContentLeft = liveAnchor + input.pagePadding;
  const liveContentWidth = liveOuterWidth - input.pagePadding * 2;
  const liveRight = liveAnchor + liveOuterWidth;
  const editOuterWidth = liveOuterWidth + input.gutterWidth;
  const editAnchor = liveAnchor - input.gutterWidth;
  const editRight = editAnchor + editOuterWidth;
  const editGutterLeft = editAnchor + input.pagePadding;
  const editContentLeft = editAnchor + input.pagePadding + input.gutterWidth;
  const editContentWidth = editOuterWidth - (input.pagePadding + input.gutterWidth) - input.pagePadding;

  return {
    anchorMinimum,
    centeredAnchor,
    liveAnchor,
    editAnchor,
    liveOuterWidth,
    editOuterWidth,
    liveRight,
    editRight,
    liveContentLeft,
    editContentLeft,
    editGutterLeft,
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

test("keeps Markdown source typography and semantic token colors readable in both themes", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");

  expect(css).toContain('font-family: "Paper Mono";');
  expect(css).toContain('font-weight: 100 800;');
  expect(css).toContain('src: url("__DOCSERA_PAPER_MONO_VARIABLE_WOFF2__") format("woff2");');
  expect(css).toContain("JetBrains+Mono:wght@500;700");
  expect(css).toContain('--docsera-document-mono-font-family: "JetBrains Mono", "Fira Code", Consolas, monospace;');
  expect(css).toMatch(/\.docsera-main__source-editor \.cm-editor \.cm-content\s*{[^}]*font-family:\s*var\(--docsera-markdown-source-font-family\);[^}]*font-size:\s*14px;[^}]*font-weight:\s*400;[^}]*line-height:\s*1\.65;/s);
  expect(css).toMatch(/\.docsera-main__source-editor \.cm-editor \.docsera-markdown-source-token--heading\s*{[^}]*color:\s*var\(--docsera-document-text-color, var\(--docsera-text\)\) !important;[^}]*font-weight:\s*700;/s);
  expect(css).toMatch(/\.docsera-main__source-editor \.cm-editor \.docsera-markdown-source-token--heading-marker,[\s\S]*?font-weight:\s*400;/s);
  expect(css).toMatch(/\.docsera-main__source-editor \.cm-editor \.docsera-markdown-source-token--strikethrough\s*{[^}]*text-decoration:\s*line-through;/s);
  expect(css).toMatch(/\.docsera-main__source-editor \.cm-editor \.docsera-markdown-source-token--link\s*{[^}]*color:\s*var\(--docsera-markdown-source-link\);[^}]*text-decoration:\s*underline;/s);
  expect(css).toMatch(/\.docsera-main__source-editor \.cm-editor \.docsera-markdown-source-token--marker\s*{[^}]*color:\s*var\(--docsera-markdown-source-marker\);/s);
  expect(css).toMatch(/\.docsera-main__source-editor \.cm-editor \.docsera-markdown-source-token--strong-content\s*{[^}]*font-weight:\s*700;/s);
  expect(css).toMatch(/\.docsera-main__source-editor \.cm-editor \.docsera-markdown-source-token--strong-delimiter\s*{[^}]*color:\s*var\(--docsera-markdown-source-marker\);[^}]*font-weight:\s*500;/s);
  expect(css).toMatch(/\.docsera-main__source-editor \.cm-editor \.docsera-markdown-source-token--plain,[\s\S]*?\.docsera-main__source-editor \.cm-editor \.docsera-markdown-source-token--directive-label\s*{[^}]*color:\s*var\(--docsera-document-text-color, var\(--docsera-text\)\);[^}]*text-decoration:\s*none;/s);
  expect(css).toMatch(/\.docsera-main__source-editor \.cm-editor \.docsera-markdown-source-token--frontmatter-delimiter,[\s\S]*?\.docsera-main__source-editor \.cm-editor \.docsera-markdown-source-token--directive-identifier\s*{[^}]*color:\s*var\(--docsera-markdown-source-marker\);/s);
  expect(css).toMatch(/\.docsera-main__source-editor \.cm-editor \.docsera-markdown-source-token--frontmatter-delimiter,[\s\S]*?color:\s*var\(--docsera-markdown-source-marker\) !important;[^}]*font-weight:\s*400;/s);
  expect(css).toMatch(/\.docsera-main__source-editor \.cm-editor \.docsera-markdown-source-token--frontmatter-neutral,[\s\S]*?color:\s*var\(--docsera-document-text-color, var\(--docsera-text\)\) !important;/s);
  expect(css).toMatch(/:root\s*{[^}]*--docsera-markdown-source-heading:\s*#[0-9a-f]{6};/s);
  expect(css).toMatch(/:root\[data-docsera-theme="dark"\]\s*{[^}]*--docsera-markdown-source-heading:\s*#[0-9a-f]{6};[^}]*--docsera-markdown-source-url:\s*#[0-9a-f]{6};/s);
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
  expect(css).toMatch(/\.docsera-app__body\s*{[^}]*background:\s*var\(--docsera-workspace-bg, var\(--docsera-surface\)\);/s);
  expect(css).toMatch(/html\[data-docsera-theme="dark"\] \.docsera-app__body\s*{\s*background:\s*var\(--docsera-bg\);\s*}/s);
  expect(css).toContain("--docsera-workspace-heading-scroll-margin: 16px;");
  expect(css).toContain("--docsera-workspace-toc-top-gap: 8px;");
  expect(css).toContain("--docsera-editor-block-gutter-width: 69px;");
  expect(css).toContain("align-items: stretch;");
  expect(css).toContain(".docsera-workspace__aside {");
  expect(css).toContain("display: flex;");
  expect(css).toMatch(/\.docsera-workspace__aside\s*{[^}]*border-left:\s*1px solid var\(--docsera-border\);/s);
  expect(css).toContain(".docsera-toc-rail {");
  expect(css).toMatch(
    /\.docsera-toc-rail\s*{[^}]*align-self:\s*flex-start;[^}]*height:\s*calc\(\s*100dvh\s*-\s*var\(--docsera-header-height\)\s*-\s*var\(--docsera-workspace-toc-top-gap\)\s*-\s*var\(--docsera-workspace-toc-top-gap\)\s*\);/s
  );
  expect(css).not.toMatch(/\.docsera-toc-rail\s*{[^}]*height:\s*100%;/s);
  expect(css).toContain("top: var(--docsera-workspace-toc-top-gap);");
  expect(css).toMatch(/\.docsera-toc-rail__body\s*{[^}]*height:\s*100%;[^}]*min-height:\s*0;/s);
  expect(css).not.toMatch(/\.docsera-toc-rail__body\s*{[^}]*border-left:/s);
  expect(css).toContain(".docsera-main__body-heading,");
  expect(css).toContain("scroll-margin-block-start: var(--docsera-workspace-heading-scroll-margin);");
  expect(css).toMatch(/\.docsera-main__surface\s*{[^}]*--docsera-main-surface-anchor-offset:\s*clamp\([^}]*var\(--docsera-main-surface-max-width\)[^}]*\);/s);
  expect(css).toMatch(/\.docsera-main__surface\s*{[^}]*margin-inline-start:\s*clamp\([^}]*var\(--docsera-toc-panel-width\)/s);
  expect(css).toMatch(/\.docsera-main__surface\s*{[^}]*display:\s*grid;[^}]*align-content:\s*start;[^}]*gap:\s*28px;/s);
  expect(css).toMatch(/\.docsera-main__surface--editor\s*{[^}]*gap:\s*0;[^}]*width:\s*calc\(var\(--docsera-main-surface-inline-size\) \+ var\(--docsera-editor-block-gutter-width\)\);[^}]*margin-inline-start:\s*calc\(var\(--docsera-main-surface-anchor-offset\) - var\(--docsera-editor-block-gutter-width\)\);[^}]*padding-left:\s*calc\(24px \+ var\(--docsera-editor-block-gutter-width\)\);/s);
  expect(css).toMatch(/\.docsera-main__editor-host\s*{[^}]*margin-top:\s*40px;/s);
});

test("scopes empty-workspace primary styling without changing standard primary or recovery action styles", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");
  const emptyPrimaryBlock = getRuleBody(css, ".docsera-main__empty-primary-action");
  const recoveryActionBlock = getRuleBody(css, ".docsera-main__empty-action");
  const modalPrimaryBlock = getRuleBody(css, ".docsera-modal__primary");

  expect(emptyPrimaryBlock).toContain("min-width: 134px;");
  expect(modalPrimaryBlock).toContain("background: var(--docsera-primary);");
  expect(modalPrimaryBlock).toContain("border-radius: 4px;");
  expect(recoveryActionBlock).toContain("border-radius: 999px;");
  expect(recoveryActionBlock).toContain("background: linear-gradient(135deg, var(--docsera-primary), #004fa8);");
});

test("keeps the edit gutter outside the reader-equivalent content lane at constrained and responsive widths", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");

  const mainSurfaceMaxWidth = readPixelCustomProperty(css, "--docsera-main-surface-max-width");
  const gutterWidth = readPixelCustomProperty(css, "--docsera-editor-block-gutter-width");
  const navWidth = readPixelCustomProperty(css, "--docsera-workspace-nav-width");
  const tocWidth = readPixelCustomProperty(css, "--docsera-toc-panel-width");

  expect(mainSurfaceMaxWidth).toBe(768);
  expect(gutterWidth).toBe(69);
  expect(css).toMatch(/\.docsera-main__surface\s*{[^}]*--docsera-main-surface-inline-size:\s*min\(100%, var\(--docsera-main-surface-max-width\)\);[^}]*width:\s*var\(--docsera-main-surface-inline-size\);/s);
  expect(css).toMatch(/\.docsera-main__surface\s*{[^}]*padding:\s*32px 24px 72px;/s);
  expect(css).toMatch(
    /\.docsera-main__surface\s*{[^}]*--docsera-main-surface-inline-padding:\s*24px;[^}]*--docsera-main-surface-anchor-min:\s*max\(\s*var\(--docsera-main-surface-inline-padding\),\s*calc\(var\(--docsera-editor-block-gutter-width\) - var\(--docsera-main-surface-inline-padding\)\)\s*\);/s
  );
  expect(css).toMatch(
    /\.docsera-main__surface\s*{[^}]*--docsera-main-surface-anchor-offset:\s*clamp\(\s*var\(--docsera-main-surface-anchor-min\),/s
  );
  expect(css).toMatch(
    /\.docsera-main__surface--editor\s*{[^}]*width:\s*calc\(var\(--docsera-main-surface-inline-size\) \+ var\(--docsera-editor-block-gutter-width\)\);/s
  );
  expect(css).toMatch(
    /\.docsera-main__surface--editor\s*{[^}]*margin-inline-start:\s*calc\(var\(--docsera-main-surface-anchor-offset\) - var\(--docsera-editor-block-gutter-width\)\);/s
  );
  expect(css).toMatch(
    /\.docsera-main__surface--editor\s*{[^}]*padding-left:\s*calc\(24px \+ var\(--docsera-editor-block-gutter-width\)\);/s
  );
  const responsive920 = getCssSlice(css, "@media (max-width: 920px)", "@media (max-width: 680px)");
  const responsive680 = getCssSlice(css, "@media (max-width: 680px)", "@media (prefers-reduced-motion: reduce)");
  expect(responsive920).toMatch(/\.docsera-main__surface\s*{[^}]*margin-inline-start:\s*var\(--docsera-main-surface-anchor-min\);/s);
  expect(responsive920).toMatch(
    /\.docsera-main__surface\s*{[^}]*--docsera-main-surface-inline-size:\s*min\(\s*calc\(100% - var\(--docsera-main-surface-anchor-min\)\),\s*var\(--docsera-main-surface-max-width\)\s*\);/s
  );
  expect(responsive920).toMatch(
    /\.docsera-main__surface--editor\s*{[^}]*margin-inline-start:\s*calc\(var\(--docsera-main-surface-anchor-min\) - var\(--docsera-editor-block-gutter-width\)\);/s
  );
  expect(responsive680).toMatch(/\.docsera-main__surface\s*{[^}]*padding:\s*24px 16px 48px;/s);
  expect(responsive680).toMatch(/\.docsera-main__surface\s*{[^}]*--docsera-main-surface-inline-padding:\s*16px;/s);
  expect(responsive680).toMatch(/\.docsera-main__surface--editor\s*{[^}]*padding-left:\s*calc\(16px \+ var\(--docsera-editor-block-gutter-width\)\);/s);

  const cases = [
    {
      name: "normal desktop keeps the roomy centered anchor",
      viewportWidth: 1440,
      navWidth,
      pagePadding: 24,
      responsiveSurface: false,
      expectedAnchorMinimum: 45,
      expectedLiveAnchor: 76
    },
    {
      name: "minimum 180px nav desktop where normal anchor would cross the main boundary",
      viewportWidth: 1060,
      navWidth: 180,
      pagePadding: 24,
      responsiveSurface: false,
      expectedAnchorMinimum: 45,
      expectedLiveAnchor: 45
    },
    {
      name: "responsive <= 920px",
      viewportWidth: 900,
      navWidth,
      pagePadding: 24,
      responsiveSurface: true,
      expectedAnchorMinimum: 45,
      expectedLiveAnchor: 45
    },
    {
      name: "responsive <= 680px",
      viewportWidth: 640,
      navWidth,
      pagePadding: 16,
      responsiveSurface: true,
      expectedAnchorMinimum: 53,
      expectedLiveAnchor: 53
    }
  ];

  for (const currentCase of cases) {
    const geometry = resolveContentLaneGeometry({
      viewportWidth: currentCase.viewportWidth,
      navWidth: currentCase.navWidth,
      tocWidth,
      maxSurfaceWidth: mainSurfaceMaxWidth,
      gutterWidth,
      pagePadding: currentCase.pagePadding,
      responsiveSurface: currentCase.responsiveSurface
    });

    expect(geometry.editContentLeft, currentCase.name).toBe(geometry.liveContentLeft);
    expect(geometry.editContentWidth, currentCase.name).toBe(geometry.liveContentWidth);
    expect(geometry.liveRight, currentCase.name).toBeLessThanOrEqual(currentCase.viewportWidth);
    expect(geometry.editRight, currentCase.name).toBeLessThanOrEqual(currentCase.viewportWidth);
    expect(geometry.editOuterWidth, currentCase.name).toBe(geometry.liveOuterWidth + gutterWidth);
    expect(geometry.editGutterWidth, currentCase.name).toBe(69);
    expect(geometry.editGutterLeft, currentCase.name).toBeGreaterThanOrEqual(0);
    expect(geometry.editContentLeft - geometry.editGutterLeft, currentCase.name).toBe(gutterWidth);
    expect(geometry.pagePadding, currentCase.name).toBe(currentCase.pagePadding);
    expect(geometry.anchorMinimum, currentCase.name).toBe(currentCase.expectedAnchorMinimum);
    expect(geometry.liveAnchor, currentCase.name).toBe(currentCase.expectedLiveAnchor);
  }
});

test("keeps published reader blocks on the same content lane as the visual editor", () => {
  const runtimeCss = readFileSync("src/client/styles/runtime-shell.css", "utf8");
  const editorRuntimeSource = readFileSync("src/client/editor/PageEditorHostRuntime.tsx", "utf8");
  const editorImageSource = readFileSync("src/client/editor/EditorImageStyles.ts", "utf8");

  const mainSurfaceMaxWidth = readPixelCustomProperty(runtimeCss, "--docsera-main-surface-max-width");
  const gutterWidth = readPixelCustomProperty(runtimeCss, "--docsera-editor-block-gutter-width");
  const navWidth = readPixelCustomProperty(runtimeCss, "--docsera-workspace-nav-width");
  const tocWidth = readPixelCustomProperty(runtimeCss, "--docsera-toc-panel-width");

  const representativeViewports = [
    { name: "desktop", viewportWidth: 1440, pagePadding: 24, responsiveSurface: false },
    { name: "narrow", viewportWidth: 640, pagePadding: 16, responsiveSurface: true }
  ];

  for (const viewport of representativeViewports) {
    const geometry = resolveContentLaneGeometry({
      viewportWidth: viewport.viewportWidth,
      navWidth,
      tocWidth,
      maxSurfaceWidth: mainSurfaceMaxWidth,
      gutterWidth,
      pagePadding: viewport.pagePadding,
      responsiveSurface: viewport.responsiveSurface
    });

    expect(geometry.liveContentLeft, viewport.name).toBe(geometry.editContentLeft);
    expect(geometry.liveContentWidth, viewport.name).toBe(geometry.editContentWidth);
  }

  const readerRule = getRuleBody(runtimeCss, ".docsera-main__reader");
  const paragraphRule = getRuleBody(runtimeCss, ".docsera-main__body");
  const h1Rule = getRuleBody(runtimeCss, ".docsera-main__body-heading");
  const h2Rule = getRuleBody(runtimeCss, ".docsera-main__section-title");
  const h3Rule = getRuleBody(runtimeCss, ".docsera-main__subsection-title");
  const mediaRule = getRuleBody(runtimeCss, ".docsera-main__media");
  const mediaSurfaceRule = getRuleBody(runtimeCss, ".docsera-main__media-surface");
  const tableWrapperRule = getRuleBody(runtimeCss, ".docsera-main__table-wrapper");
  const columnsRule = getRuleBody(runtimeCss, ".docsera-main__columns");
  const calloutRule = getRuleBody(runtimeCss, ".docsera-main__callout");
  const accordionRule = getRuleBody(runtimeCss, ".docsera-main__accordion");

  for (const [label, body] of [
    ["reader", readerRule],
    ["paragraph", paragraphRule],
    ["h1", h1Rule],
    ["h2", h2Rule],
    ["h3", h3Rule],
    ["media", mediaRule],
    ["table wrapper", tableWrapperRule],
    ["columns", columnsRule],
    ["accordion", accordionRule]
  ] as const) {
    expect(body, label).not.toContain("max-width:");
  }

  expect(readerRule).not.toMatch(/(?:^|\n)\s*width:/);
  expect(paragraphRule).not.toMatch(/(?:^|\n)\s*width:/);
  expect(h1Rule).not.toMatch(/(?:^|\n)\s*width:/);
  expect(h2Rule).not.toMatch(/(?:^|\n)\s*width:/);
  expect(h3Rule).not.toMatch(/(?:^|\n)\s*width:/);
  expect(mediaRule).not.toMatch(/(?:^|\n)\s*width:/);
  expect(tableWrapperRule).not.toMatch(/(?:^|\n)\s*width:/);
  expect(columnsRule).not.toMatch(/(?:^|\n)\s*width:/);
  expect(accordionRule).not.toMatch(/(?:^|\n)\s*width:/);

  expect(mediaSurfaceRule).toContain("width: 100%;");
  expect(mediaSurfaceRule).toContain("min-width: 0;");
  expect(editorImageSource).toContain(".docsera-editor-image__surface");
  expect(editorImageSource).toMatch(/\.docsera-editor-image__surface\s*{[^}]*width:\s*100%;[^}]*min-width:\s*0;/s);

  expect(tableWrapperRule).toContain("overflow-x: auto;");
  expect(tableWrapperRule).not.toContain("padding-bottom:");
  expect(editorRuntimeSource).toMatch(
    /\.docsera-editor-runtime__surface \.ProseMirror \.tableWrapper\s*{[^}]*overflow-x:\s*auto;[^}]*min-width:\s*0;/s
  );

  expect(columnsRule).toContain("grid-template-columns: repeat(var(--docsera-columns-count), minmax(0, 1fr));");
  expect(editorRuntimeSource).toMatch(
    /\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-columns\s*{[^}]*grid-template-columns:\s*repeat\(var\(--docsera-columns-count\), minmax\(0, 1fr\)\);/s
  );

  expect(calloutRule).toContain("width: 100%;");
  expect(editorRuntimeSource).toMatch(
    /\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-callout\s*{[^}]*width:\s*100%;/s
  );
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

test("uses the shared primary-and-border accent token for Blockquote in both themes", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");
  const blockquoteRule = getRuleBody(css, ".docsera-main__blockquote");
  const accent = "color-mix(in srgb, var(--docsera-primary) 38%, var(--docsera-border))";

  expect(css.match(/--docsera-document-blockquote-border-color:/g)).toHaveLength(2);
  expect(css.match(/--docsera-document-blockquote-border-color: color-mix\(in srgb, var\(--docsera-primary\) 38%, var\(--docsera-border\)\);/g)).toHaveLength(2);
  expect(css).toContain(`--docsera-document-blockquote-border-color: ${accent};`);
  expect(css).not.toMatch(/--docsera-document-blockquote-border-color:\s*[^;]*(?:#015ec2|#58a6ff)/i);
  expect(blockquoteRule).toContain("border-left: 3px solid var(--docsera-document-blockquote-border-color);");
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
    /\.docsera-page-settings-shell\s*{[^}]*inset:\s*0 auto 0 var\(--docsera-workspace-nav-width\);[^}]*width:\s*min\(432px, calc\(100vw - var\(--docsera-workspace-nav-width\)\)\);[^}]*overflow:\s*clip;/s
  );
  expect(css).toMatch(
    /\.docsera-page-settings\s*{[^}]*position:\s*absolute;[^}]*inset:\s*0 auto 0 0;[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*gap:\s*18px;[^}]*width:\s*100%;[^}]*overflow-x:\s*clip;[^}]*overflow-y:\s*auto;/s
  );
  expect(css).toMatch(
    /\.docsera-page-settings__header\s*{[^}]*flex:\s*0 0 auto;[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*height:\s*var\(--docsera-header-height\);[^}]*min-height:\s*var\(--docsera-header-height\);/s
  );
  expect(css).toMatch(
    /\.docsera-page-settings__header-divider\s*{[^}]*height:\s*1px;[^}]*margin:\s*-19px -20px 0;[^}]*background:\s*var\(--docsera-border\);/s
  );
  expect(css).not.toMatch(/\.docsera-page-settings__header-divider\s*{[^}]*margin:\s*-18px -20px -1px;/s);
  expect(css).toMatch(/\.docsera-page-settings__rows\s*{[^}]*display:\s*grid;[^}]*gap:\s*14px;[^}]*min-width:\s*0;/s);
});

test("keeps Page Settings shell usable across the 920px responsive breakpoint", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");
  const responsive920 = getCssSlice(css, "@media (max-width: 920px)", "@media (max-width: 680px)");

  expect(responsive920).toMatch(
    /\.docsera-page-settings-shell\s*{[^}]*inset:\s*var\(--docsera-header-height\) auto 0 0;[^}]*width:\s*min\(456px, 100vw\);/s
  );
  expect(responsive920).toMatch(/\.docsera-page-settings\s*{[^}]*inset:\s*0 auto 0 0;[^}]*width:\s*100%;/s);
  expect(responsive920).not.toMatch(
    /\.docsera-page-settings-shell\s*{[^}]*var\(--docsera-workspace-nav-width\)[^}]*calc\(100vw - var\(--docsera-workspace-nav-width\)\)/s
  );
});

test("keeps settings and access panel header dividers aligned to the workspace header baseline", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");

  expect(css).toMatch(/\.docsera-header\s*{[^}]*min-height:\s*var\(--docsera-header-height\);[^}]*border-bottom:\s*1px solid var\(--docsera-border\);/s);
  expect(css).toMatch(
    /\.docsera-page-settings__header\s*{[^}]*height:\s*var\(--docsera-header-height\);[^}]*min-height:\s*var\(--docsera-header-height\);/s
  );
  expect(css).toMatch(
    /\.docsera-page-settings__header-divider\s*{[^}]*height:\s*1px;[^}]*margin:\s*-19px -20px 0;[^}]*background:\s*var\(--docsera-border\);/s
  );
  expect(css).not.toMatch(/\.docsera-page-settings__header-divider\s*{[^}]*margin:\s*-18px -20px -1px;/s);
  expect(css).not.toMatch(/\.docsera-page-settings__header-divider\s*{[^}]*margin:\s*-18px -20px 0;/s);
  expect(css).toMatch(
    /\.docsera-workspace-settings-overlay__header\s*{[^}]*box-sizing:\s*border-box;[^}]*height:\s*var\(--docsera-header-height\);[^}]*padding:\s*0 20px;[^}]*min-height:\s*var\(--docsera-header-height\);[^}]*border-bottom:\s*1px solid var\(--docsera-border\);/s
  );
  expect(css).toMatch(
    /\.docsera-manage-access__header\s*{[^}]*align-items:\s*center;[^}]*border-bottom:\s*1px solid var\(--docsera-border\);[^}]*box-sizing:\s*border-box;[^}]*height:\s*var\(--docsera-header-height\);[^}]*min-height:\s*var\(--docsera-header-height\);[^}]*padding:\s*0 20px;/s
  );
  expect(css).not.toMatch(/\.docsera-manage-access__header\s*{[^}]*padding:\s*22px 24px 18px;/s);
});

test("keeps vertical scrolling owned by the app body below the full-width header", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");
  const mainRule = getRuleBody(css, ".docsera-main");

  expect(css).toMatch(/html,\s*body\s*{[^}]*height:\s*100%;[^}]*overflow:\s*hidden;/s);
  expect(css).toMatch(/body\s*{[^}]*background:\s*var\(--docsera-bg\);/s);
  expect(css).not.toMatch(/html\s*{[^}]*scrollbar-gutter:\s*stable;/s);
  expect(css).not.toContain("html:has(.docsera-header)");
  expect(css).toMatch(/\.docsera-app\s*{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*height:\s*100dvh;[^}]*overflow:\s*hidden;/s);
  expect(css).toMatch(/\.docsera-app__body\s*{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*background:\s*var\(--docsera-workspace-bg, var\(--docsera-surface\)\);[^}]*overflow-x:\s*clip;[^}]*overflow-y:\s*auto;[^}]*scrollbar-gutter:\s*stable;[^}]*scroll-padding-top:\s*var\(--docsera-workspace-heading-scroll-margin\);/s);
  expect(css).toMatch(/html\[data-docsera-theme="dark"\] \.docsera-app__body\s*{\s*background:\s*var\(--docsera-bg\);\s*}/s);
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
  expect(mainRule).not.toMatch(/\boverflow-y\s*:/);
  expect(mainRule).not.toMatch(/\boverflow\s*:/);
  expect(css).not.toMatch(/\.docsera-main\s*{[^}]*overflow-y:\s*(?:auto|scroll|hidden|clip);/s);
});

test("keeps left workspace navigation sticky with internally scrolling tree overflow", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");

  expect(css).toMatch(
    /\.docsera-workspace__nav-frame\s*{[^}]*position:\s*sticky;[^}]*top:\s*0;[^}]*align-self:\s*start;[^}]*height:\s*calc\(100dvh - var\(--docsera-header-height\)\);[^}]*border-right:\s*1px solid var\(--docsera-border\);/s
  );
  expect(css).toMatch(
    /\.docsera-sidebar\s*{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*gap:\s*14px;[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s
  );
  expect(css).toMatch(/\.docsera-workspace__nav-clip\s*{[^}]*width:\s*100%;[^}]*height:\s*100%;[^}]*overflow:\s*hidden;/s);
  expect(css).toMatch(/\.docsera-sidebar\s*{[^}]*width:\s*var\(--docsera-workspace-nav-width\);/s);
  expect(css).not.toMatch(/\.docsera-sidebar\s*{[^}]*overflow-y:\s*auto;/s);
  expect(css).toMatch(
    /\.docsera-sidebar__search-row\s*{[^}]*flex:\s*0 0 auto;/s
  );
  expect(css).toMatch(
    /\.docsera-sidebar__tree\s*{[^}]*flex:\s*1 1 auto;[^}]*min-height:\s*0;[^}]*margin-right:\s*-10px;[^}]*padding-right:\s*2px;[^}]*overflow-x:\s*hidden;[^}]*overflow-y:\s*auto;[^}]*scrollbar-gutter:\s*stable;[^}]*scrollbar-width:\s*thin;[^}]*scrollbar-color:[^;}]+ transparent;/s
  );
  expect(css).toMatch(/\.docsera-sidebar__tree::-webkit-scrollbar\s*{\s*width:\s*8px;\s*}/s);
  expect(css).toMatch(/\.docsera-sidebar__tree::-webkit-scrollbar-thumb\s*{[^}]*border:\s*2px solid transparent;[^}]*border-radius:\s*999px;[^}]*background-clip:\s*content-box;/s);
  expect(css).toMatch(
    /\.docsera-workspace__nav-resizer\s*{[^}]*right:\s*-6px;[^}]*width:\s*var\(--docsera-workspace-nav-resizer-width\);/s
  );
  expect(css).toMatch(
    /\.docsera-workspace__nav-resizer-pill\s*{[^}]*position:\s*absolute;[^}]*left:\s*calc\(2px - 1\.5px\);[^}]*width:\s*3px;/s
  );
});

test("animates workspace navigation collapse while keeping resize immediate and collapsed content inert", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");
  const shellSource = readFileSync("src/client/features/workspaces/WorkspaceShell.tsx", "utf8");

  expect(css).toMatch(
    /\.docsera-header\s*{[^}]*grid-template-columns:\s*var\(--docsera-workspace-nav-track-width\) minmax\(0, 1fr\);[^}]*transition:\s*grid-template-columns 200ms cubic-bezier\(0\.4, 0, 0\.2, 1\);/s
  );
  expect(css).toMatch(
    /\.docsera-workspace\s*{[^}]*grid-template-columns:\s*var\(--docsera-workspace-nav-track-width\) minmax\(0, 1fr\) auto;[^}]*transition:\s*grid-template-columns 200ms cubic-bezier\(0\.4, 0, 0\.2, 1\);/s
  );
  expect(css).toContain("--docsera-workspace-nav-track-width: var(--docsera-workspace-nav-width);");
  expect(css).toContain("--docsera-workspace-content-nav-width: var(--docsera-workspace-nav-width);");
  expect(css).toMatch(
    /\.docsera-main__surface\s*{[^}]*--docsera-main-surface-anchor-offset:\s*clamp\(\s*var\(--docsera-main-surface-anchor-min\),\s*calc\(\(100vw - var\(--docsera-workspace-content-nav-width\) - var\(--docsera-toc-panel-width\) - var\(--docsera-main-surface-max-width\)\) \/ 2\),\s*calc\(100vw - var\(--docsera-workspace-content-nav-width\) - var\(--docsera-main-surface-inline-padding\)\)\s*\);[^}]*margin-inline-start:\s*clamp\(\s*var\(--docsera-main-surface-anchor-min\),\s*calc\(\(100vw - var\(--docsera-workspace-content-nav-width\) - var\(--docsera-toc-panel-width\) - var\(--docsera-main-surface-max-width\)\) \/ 2\),\s*calc\(100vw - var\(--docsera-workspace-content-nav-width\) - var\(--docsera-main-surface-inline-padding\)\)\s*\);[^}]*transition:\s*margin-inline-start 200ms cubic-bezier\(0\.4, 0, 0\.2, 1\);/s
  );
  expect(css).toMatch(
    /\.docsera-main__surface--editor\s*{[^}]*margin-inline-start:\s*calc\(var\(--docsera-main-surface-anchor-offset\) - var\(--docsera-editor-block-gutter-width\)\);/s
  );
  expect(css).toMatch(/\.docsera-workspace--sidebar-collapsed\s*{\s*grid-template-columns:\s*0 minmax\(0, 1fr\) auto;/s);
  expect(css).toMatch(/\.docsera-workspace__nav-frame\s*{[^}]*overflow:\s*visible;[^}]*transition:[^}]*border-color 200ms cubic-bezier\(0\.4, 0, 0\.2, 1\);/s);
  expect(css).not.toMatch(/\.docsera-workspace__nav-frame\s*{[^}]*transition:[^}]*opacity 200ms cubic-bezier\(0\.4, 0, 0\.2, 1\);/s);
  expect(css).toMatch(
    /\.docsera-workspace--sidebar-collapsed \.docsera-workspace__nav-frame\s*{[^}]*border-right-color:\s*transparent;[^}]*pointer-events:\s*none;/s
  );
  expect(css).not.toMatch(/\.docsera-workspace--sidebar-collapsed \.docsera-workspace__nav-frame\s*{[^}]*opacity:\s*0;/s);
  expect(css).not.toMatch(/\.docsera-workspace--sidebar-collapsed \.docsera-workspace__nav-frame\s*{[^}]*overflow:\s*hidden;/s);
  expect(css).toMatch(/html\.docsera-nav-resizing \.docsera-header\s*{\s*transition:\s*none;/s);
  expect(css).toMatch(/\.docsera-workspace--sidebar-resizing\s*{\s*transition:\s*none;/s);
  expect(css).toMatch(/\.docsera-workspace--sidebar-resizing \.docsera-main__surface\s*{\s*transition:\s*none;/s);
  expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.docsera-header,\s*\.docsera-workspace,\s*\.docsera-workspace__nav-frame,\s*\.docsera-main__surface,[\s\S]*?transition:\s*none;/s);
  expect(css).toMatch(/@media \(max-width: 1180px\)[\s\S]*?\.docsera-workspace--sidebar-collapsed\s*{\s*grid-template-columns:\s*0 minmax\(0, 1fr\);/s);
  expect(shellSource).toContain('"--docsera-workspace-content-nav-width": sidebarCollapsed ? "0px" : `${workspaceNavWidth}px`');
  expect(shellSource).toContain("navFrame.inert = sidebarCollapsed;");
  expect(shellSource).toContain('aria-hidden={sidebarCollapsed ? "true" : undefined}');
  expect(shellSource).not.toContain("{!sidebarCollapsed ? (");
});

test("keeps narrow workspace navigation in normal stacked flow", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");

  expect(css).toMatch(
    /@media \(max-width: 920px\)[\s\S]*?\.docsera-workspace,\s*\.docsera-workspace--sidebar-collapsed\s*{[\s\S]*?grid-template-columns:\s*1fr;[\s\S]*?\.docsera-workspace__nav-resizer\s*{[\s\S]*?display:\s*none;[\s\S]*?\.docsera-workspace__nav-frame\s*{[\s\S]*?position:\s*relative;[\s\S]*?top:\s*auto;[\s\S]*?align-self:\s*stretch;[\s\S]*?height:\s*auto;[\s\S]*?border-right:\s*0;[\s\S]*?\.docsera-workspace--sidebar-collapsed \.docsera-workspace__nav-frame\s*{[\s\S]*?height:\s*0;/s
  );
});

test("keeps the collapsed workspace ToC tab outside the outer aside clip boundary", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");

  expect(css).toMatch(/\.docsera-workspace__aside\s*{[^}]*overflow:\s*visible;/s);
  expect(css).toMatch(/\.docsera-workspace__aside--collapsed\s*{[^}]*width:\s*0;[^}]*border-left-color:\s*transparent;/s);
  expect(css).not.toMatch(/\.docsera-workspace__aside--collapsed\s*{[^}]*overflow:\s*hidden;/s);
  expect(css).toMatch(/\.docsera-toc-rail__toggle\s*{[^}]*left:\s*-24px;[^}]*border:\s*1px solid var\(--docsera-border\);[^}]*border-right:\s*0;/s);
  expect(css).toMatch(/\.docsera-toc-rail--collapsed \.docsera-toc-rail__toggle\s*{\s*border-right:\s*1px solid var\(--docsera-border\);\s*}/s);
  expect(css).toMatch(/\.docsera-toc-rail__clip\s*{[^}]*position:\s*relative;[^}]*overflow:\s*hidden;/s);
  expect(css).toMatch(
    /\.docsera-toc-rail__body\s*{[^}]*position:\s*absolute;[^}]*inset:\s*0 0 0 auto;[^}]*flex:\s*0 0 var\(--docsera-toc-panel-width\);[^}]*width:\s*var\(--docsera-toc-panel-width\);/s
  );
  expect(css).not.toMatch(/\.docsera-workspace__aside--collapsed \.docsera-toc(?:,|\s)*[\s\S]*?visibility:\s*hidden;/s);
  expect(css).not.toMatch(/\.docsera-workspace__aside--collapsed \.docsera-toc-rail__body(?:,|\s)*[\s\S]*?visibility:\s*hidden;/s);
});

test("keeps workspace mode controls in the right-side header cluster with matched heights", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");

  expect(css).toMatch(/\.docsera-header__action-slot--mode\s*{[^}]*z-index:\s*1;[^}]*min-width:\s*0;/s);
  expect(css).not.toMatch(/\.docsera-header__action-slot--mode\s*{[^}]*position:\s*absolute;/s);
  expect(css).not.toMatch(/\.docsera-header__action-slot--mode\s*{[^}]*transform:\s*translate\(-50%, -50%\);/s);
  expect(css).toMatch(/\.docsera-header__action-divider\s*{[^}]*width:\s*1px;[^}]*height:\s*26px;[^}]*background:\s*var\(--docsera-border\);/s);
  expect(css).toMatch(/\.docsera-header__action-divider--mode-surface\s*{[^}]*margin-inline:\s*-2px;/s);
  expect(css).toMatch(/\.docsera-header__actions::before\s*{[^}]*content:\s*"";[^}]*width:\s*1px;[^}]*height:\s*26px;[^}]*background:\s*var\(--docsera-border\);/s);
  expect(css).toMatch(/\.docsera-header--live \.docsera-header__actions::before,\s*\.docsera-header--launcher \.docsera-header__actions::before\s*{[^}]*background:\s*transparent;/s);
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

test("keeps authenticated header avatars clipped to a neutral circular viewport", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");
  const profileRule = getRuleBody(css, ".docsera-header__profile--avatar");
  const profileHoverRule = getRuleBody(css, ".docsera-header__profile--avatar:hover");
  const avatarImageRule = getRuleBody(css, ".docsera-header__profile-avatar");

  expect(profileRule).toContain("width: 32px;");
  expect(profileRule).toContain("height: 32px;");
  expect(profileRule).toContain("padding: 0;");
  expect(profileRule).toContain("border-radius: 999px;");
  expect(profileRule).toContain("background: var(--docsera-surface-muted);");
  expect(profileRule).toContain("box-shadow: none;");
  expect(profileRule).toContain("overflow: hidden;");
  expect(profileHoverRule).toContain("background: var(--docsera-surface-muted);");
  expect(profileHoverRule).toContain("box-shadow: 0 0 0 2px color-mix(in srgb, var(--docsera-primary) 32%, transparent);");
  expect(avatarImageRule).toContain("display: block;");
  expect(avatarImageRule).toContain("width: 100%;");
  expect(avatarImageRule).toContain("height: 100%;");
  expect(avatarImageRule).toContain("border-radius: inherit;");
  expect(avatarImageRule).toContain("object-fit: cover;");
  expect(avatarImageRule).toContain("object-position: center;");
  expect(profileRule).not.toContain("background: transparent;");
  expect(profileHoverRule).not.toContain("background: transparent;");
});

test("keeps shell navigation icon hover and focus states on the Docsera primary accent", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");

  expect(css).toMatch(
    /\.docsera-header__workspace-button:not\(:disabled\):hover \.docsera-header__workspace-chevron,\s*\.docsera-header__workspace-button:focus-visible \.docsera-header__workspace-chevron\s*{[^}]*color:\s*var\(--docsera-primary\);/s
  );
  expect(css).toMatch(
    /\.docsera-header__workspace-button:focus-visible\s*{[^}]*outline:\s*2px solid color-mix\(in srgb, var\(--docsera-primary\) 32%, transparent\);/s
  );
  expect(css).toMatch(
    /\.docsera-header__ghost-button:hover:not\(:disabled\),\s*\.docsera-header__ghost-button:focus-visible,\s*\.docsera-sidebar__icon-button:hover:not\(:disabled\),\s*\.docsera-sidebar__icon-button:focus-visible\s*{[^}]*background:\s*var\(--docsera-surface-muted\);[^}]*color:\s*var\(--docsera-primary\);/s
  );
  expect(css).toMatch(
    /\.docsera-header__ghost-button:focus-visible,\s*\.docsera-sidebar__icon-button:focus-visible\s*{[^}]*outline:\s*2px solid color-mix\(in srgb, var\(--docsera-primary\) 32%, transparent\);[^}]*outline-offset:\s*2px;/s
  );
  expect(css).toMatch(
    /\.docsera-header__menu-item:hover,\s*\.docsera-header__menu-footer:hover\s*{[^}]*background:\s*var\(--docsera-surface-muted\);/s
  );
  expect(css).toMatch(
    /\.docsera-header__menu-item:focus-visible,\s*\.docsera-header__menu-footer:focus-visible\s*{[^}]*outline:\s*none;[^}]*background:\s*var\(--docsera-surface-muted\);[^}]*box-shadow:\s*inset 0 0 0 2px color-mix\(in srgb, var\(--docsera-primary\) 72%, transparent\);/s
  );
  expect(css).toMatch(
    /\.docsera-header__menu-item:hover \.docsera-header__menu-item-label,\s*\.docsera-header__menu-item:focus-visible \.docsera-header__menu-item-label\s*{[^}]*color:\s*var\(--docsera-primary\);/s
  );
  expect(css).toMatch(
    /\.docsera-header__menu-item--current \.docsera-header__menu-item-label\s*{[^}]*color:\s*var\(--docsera-primary\);[^}]*font-weight:\s*700;/s
  );
  const menuHoverRule = getRuleBody(css, ".docsera-header__menu-item:hover,\n.docsera-header__menu-footer:hover");
  const menuFocusRule = getRuleBody(css, ".docsera-header__menu-item:focus-visible,\n.docsera-header__menu-footer:focus-visible");
  expect(menuHoverRule).not.toContain("color: var(--docsera-primary);");
  expect(menuFocusRule).not.toContain("color: var(--docsera-primary);");
  expect(css).not.toMatch(/\.docsera-header__menu-item(?::hover|:focus-visible) \.docsera-header__menu-item-icon\s*{[^}]*color:/s);
  expect(css).not.toMatch(/\.docsera-header__menu-footer(?::hover|:focus-visible)[^{]*\{[^}]*color:\s*var\(--docsera-text\);/s);
  expect(css).toMatch(/html\[data-docsera-theme="light"\] \.docsera-header__ghost-button--theme:focus-visible\s*{[^}]*color:\s*rgb\(79 70 229 \/ var\(--tw-text-opacity, 1\)\);/s);
  expect(css).toMatch(/html\[data-docsera-theme="dark"\] \.docsera-header__ghost-button--theme:focus-visible\s*{[^}]*color:\s*rgb\(245 158 11 \/ var\(--tw-text-opacity, 1\)\);/s);
  expect(css).toMatch(
    /\.docsera-page-tree__action-button:hover,\s*\.docsera-page-tree__row--menu-open \.docsera-page-tree__action-button--actions\s*{[^}]*color:\s*var\(--docsera-primary\);/s
  );
  expect(getRuleBody(css, ".docsera-toc-rail__toggle:hover")).toContain("color: var(--docsera-primary);");
  expect(getRuleBody(css, ".docsera-page-tree__context-menu-item--destructive")).toContain("color: var(--docsera-error);");
});

test("keeps the staged My Workspaces list chrome normalized", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");
  const launcherHeaderRowRule = css.match(/\.docsera-launcher-panel__header-row\s*{(?<body>[^}]*)}/s)?.groups?.body ?? "";

  expect(launcherHeaderRowRule).toMatch(/border-bottom:\s*1px solid var\(--docsera-border-soft\);/);
  expect(css).toMatch(/\.docsera-workspace-list__item \+ \.docsera-workspace-list__item\s*{[^}]*border-top:\s*1px solid var\(--docsera-border-soft\);/s);
  expect(css).toMatch(/\.docsera-launcher-panel__footer\s*{[^}]*border-top:\s*1px solid var\(--docsera-border-soft\);/s);
  expect(css).toMatch(/\.docsera-workspace-list__header\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 160px;/s);
  expect(css).toMatch(/\.docsera-workspace-list__workspace-heading\s*{[^}]*grid-column:\s*1;/s);
  expect(css).toMatch(/\.docsera-workspace-list__role-heading\s*{[^}]*grid-column:\s*2;/s);
  expect(css).toMatch(/\.docsera-workspace-row__role-cell\s*{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*gap:\s*32px;[^}]*min-height:\s*28px;/s);
  expect(css).not.toMatch(/\.docsera-workspace-row__role-cell\s*{[^}]*align-items:\s*flex-start;/s);
  expect(css).not.toMatch(/\.docsera-workspace-row__role-cell\s*{[^}]*padding-top:\s*2px;/s);
  expect(css).toMatch(
    /\.docsera-launcher-state__secondary,\s*\.docsera-workspace-row__settings,\s*\.docsera-modal__secondary,\s*\.docsera-modal__close,\s*\.docsera-launcher-pagination__button\s*{[^}]*padding:\s*8px 12px;[^}]*border:\s*1px solid var\(--docsera-border\);[^}]*border-radius:\s*4px;[^}]*background:\s*var\(--docsera-surface\);[^}]*color:\s*var\(--docsera-text\);/s
  );
  expect(css).toMatch(
    /\.docsera-launcher-state__secondary:hover:not\(:disabled\),\s*\.docsera-workspace-row__settings:hover,\s*\.docsera-modal__close:hover:not\(:disabled\),\s*\.docsera-launcher-pagination__button:hover:not\(:disabled\)\s*{[^}]*background:\s*var\(--docsera-surface-muted\);[^}]*text-decoration:\s*none;/s
  );
  expect(css).toMatch(
    /\.docsera-workspace-row__settings:hover,\s*\.docsera-workspace-row__settings:focus-visible,\s*\.docsera-launcher-pagination__button:hover:not\(:disabled\),\s*\.docsera-launcher-pagination__button:focus-visible:not\(:disabled\)\s*{[^}]*border-color:\s*var\(--docsera-primary\);[^}]*color:\s*var\(--docsera-primary\);/s
  );
  const primarySecondaryTreatmentSelectors = [
    ...css.matchAll(
      /(?<selectors>[^{}]+)\s*{\s*(?<body>[^{}]*border-color:\s*var\(--docsera-primary\);[^{}]*color:\s*var\(--docsera-primary\);[^{}]*)}/g
    )
  ].map((match) => match.groups?.selectors ?? "");
  expect(css).toMatch(
    /\.docsera-launcher-toolbar__clear:focus-visible,\s*\.docsera-launcher-state__secondary:focus-visible,\s*\.docsera-workspace-row__settings:focus-visible,\s*\.docsera-modal__close:focus-visible,\s*\.docsera-modal__secondary:focus-visible,\s*\.docsera-launcher-pagination__button:focus-visible,\s*\.docsera-modal__primary:focus-visible\s*{[^}]*outline:\s*2px solid color-mix\(in srgb, var\(--docsera-primary\) 32%, transparent\);[^}]*outline-offset:\s*2px;/s
  );
  expect(css).toMatch(/\.docsera-launcher-pagination__button:disabled\s*{[^}]*opacity:\s*0\.6;[^}]*cursor:\s*not-allowed;/s);
  expect(css).not.toMatch(/\.docsera-launcher-pagination__button:hover\s*{/s);
  expect(css).not.toMatch(/\.docsera-launcher-pagination__button:disabled:hover/s);
  expect(css).not.toMatch(/\.docsera-launcher-pagination__button:focus-visible\s*{[^}]*color:\s*var\(--docsera-primary\);/s);
  expect(css).not.toMatch(/\.docsera-workspace-row__settings\s*{[^}]*border:\s*0;/s);
  expect(css).not.toMatch(/\.docsera-workspace-row__settings\s*{[^}]*color:\s*var\(--docsera-primary\);/s);
  expect(primarySecondaryTreatmentSelectors.join("\n")).not.toContain(".docsera-modal__close");
  expect(primarySecondaryTreatmentSelectors.join("\n")).not.toContain(".docsera-launcher-state__secondary");
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
  const tooltipSource = readFileSync("src/client/shared/tooltip/DocseraTooltip.tsx", "utf8");
  const tooltipLayer = Number(/--docsera-tooltip-z-index:\s*(\d+);/.exec(shellCss)?.[1]);
  const fullscreenViewerLayer = Number(/\.docsera-image-viewer\s*{[^}]*z-index:\s*(\d+);/s.exec(fullscreenViewerStyles)?.[1]);

  expect(shellCss).toMatch(/\.docsera-modal\s*{[^}]*z-index:\s*150;/s);
  expect(shellCss).toMatch(/\.docsera-changes-center--portal\s*{[^}]*z-index:\s*140;/s);
  expect(shellCss).toMatch(/\.docsera-main__media-surface\s*{[^}]*border-radius:\s*0;[^}]*overflow:\s*hidden;/s);
  expect(shellCss).not.toMatch(/\.docsera-main__media-activation\s*{[^}]*all:\s*unset;/s);
  expect(shellCss).toContain(".docsera-modal__panel {");
  expect(tableOverlaySource).toContain("const TABLE_CONTROL_OVERLAY_Z_INDEX = 126;");
  expect(tableOverlaySource).toContain("const TABLE_CONTROL_MENU_Z_INDEX = 130;");
  expect(fullscreenViewerStyles).toContain(".docsera-image-viewer {");
  expect(fullscreenViewerStyles).toMatch(/\.docsera-image-viewer\s*{[^}]*z-index:\s*160;/s);
  expect(tooltipLayer).toBeGreaterThan(160);
  expect(tooltipLayer).toBeGreaterThan(fullscreenViewerLayer);
  expect(shellCss).toMatch(/\.docsera-tooltip\s*{[^}]*z-index:\s*var\(--docsera-tooltip-z-index,\s*200\);/s);
  expect(tooltipSource).toContain("z-index: var(--docsera-tooltip-z-index, 200);");
});

test("keeps the editor block-control floating layer below the workspace header", () => {
  const shellCss = readFileSync("src/client/styles/runtime-shell.css", "utf8");
  const editorRuntimeSource = readFileSync("src/client/editor/PageEditorHostRuntime.tsx", "utf8");
  const tableOverlaySource = readFileSync("src/client/editor/TableControlsOverlay.tsx", "utf8");
  const imagePickerStyles = readFileSync("src/client/editor/ImagePickerStyles.ts", "utf8");
  const fullscreenViewerStyles = readFileSync("src/client/shared/media/ImageFullscreenViewerStyles.ts", "utf8");

  const headerLayer = readZIndex(shellCss, ".docsera-header");
  const editorFloatingLayer = readZIndex(editorRuntimeSource, ".docsera-editor-floating-layer");

  expect(headerLayer).toBe(30);
  expect(editorFloatingLayer).toBeLessThan(headerLayer);
  expect(editorRuntimeSource).toMatch(/\.docsera-editor-floating-layer\s*{[^}]*position:\s*fixed;[^}]*inset:\s*0;[^}]*pointer-events:\s*none;[^}]*z-index:\s*29;/s);
  expect(tableOverlaySource).toContain("const TABLE_CONTROL_OVERLAY_Z_INDEX = 126;");
  expect(tableOverlaySource).toContain("const TABLE_CONTROL_MENU_Z_INDEX = 130;");
  expect(shellCss).toMatch(/\.docsera-changes-center--portal\s*{[^}]*z-index:\s*140;/s);
  expect(shellCss).toMatch(/\.docsera-modal\s*{[^}]*z-index:\s*150;/s);
  expect(imagePickerStyles).toMatch(/z-index:\s*150;/);
  expect(fullscreenViewerStyles).toMatch(/\.docsera-image-viewer\s*{[^}]*z-index:\s*160;/s);
  expect(shellCss).toMatch(/--docsera-tooltip-z-index:\s*200;/);
});

test("keeps shared destructive modal warnings and buttons on the semantic destructive theme treatment", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");
  const deleteConfirmationRule = getRuleBody(css, ".docsera-delete-confirmation-button");

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
  expect(css).toMatch(
    /\.docsera-modal__primary--destructive \.docsera-changes-center__spinner\s*{[^}]*border-color:\s*color-mix\(in srgb, currentColor 38%, transparent\);[^}]*border-top-color:\s*currentColor;/s
  );
  expect(css).toMatch(
    /\.docsera-changes-center__spinner\s*{[^}]*border:\s*2px solid rgba\(255, 255, 255, 0\.45\);[^}]*border-top-color:\s*#fff;/s
  );
  expect(deleteConfirmationRule).toContain("min-width: auto;");
});

test("keeps New Workspace modal styling scoped to its compact settings-aligned surface", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");
  const labelRule = getRuleBody(css, ".docsera-create-workspace-modal .docsera-modal__label");
  const inputRule = getRuleBody(css, ".docsera-create-workspace-modal .docsera-modal__input");
  const gridRule = getRuleBody(css, ".docsera-create-workspace-modal .docsera-workspace-icon-picker__grid");
  const optionRule = getRuleBody(css, ".docsera-create-workspace-modal .docsera-workspace-icon-picker__option");
  const selectedRule = getRuleBody(css, ".docsera-create-workspace-modal .docsera-workspace-icon-picker__option--selected");
  const uploadRowRule = getRuleBody(css, ".docsera-create-workspace-modal .docsera-workspace-icon-picker__upload-row");
  const footerRule = getRuleBody(css, ".docsera-create-workspace-modal .docsera-modal__footer");
  const primaryRule = getRuleBody(css, ".docsera-create-workspace-modal__primary");
  const sharedGridRule = css.match(/\n\.docsera-workspace-icon-picker__grid\s*{(?<body>[^}]*)}/s)?.groups?.body ?? "";
  const sharedOptionRule = getRuleBody(css, ".docsera-workspace-icon-picker__option");

  expect(labelRule).toContain("color: var(--docsera-text);");
  expect(labelRule).toContain("font-weight: 700;");
  expect(labelRule).toContain("letter-spacing: 0;");
  expect(labelRule).toContain("text-transform: none;");
  expect(inputRule).toContain("background: color-mix(in srgb, var(--docsera-primary) 4%, var(--docsera-surface) 96%);");
  expect(gridRule).toContain("grid-template-columns: repeat(6, minmax(0, 1fr));");
  expect(optionRule).toContain("height: 60px;");
  expect(selectedRule).toContain("border-color: var(--docsera-primary);");
  expect(selectedRule).toContain("box-shadow: inset 0 0 0 1px var(--docsera-primary);");
  expect(uploadRowRule).toContain("display: flex;");
  expect(uploadRowRule).toContain("flex-wrap: wrap;");
  expect(footerRule).toContain("padding: 14px 20px;");
  expect(footerRule).toContain("background: color-mix(in srgb, var(--docsera-primary) 4%, var(--docsera-surface-muted) 96%);");
  expect(primaryRule).toContain("min-width: auto;");
  expect(sharedGridRule).toContain("grid-template-columns: repeat(auto-fit, minmax(72px, 1fr));");
  expect(sharedOptionRule).toContain("min-height: 72px;");
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
  expect(css).toMatch(
    /\.docsera-manage-access__panel\s*{[^}]*width:\s*min\(456px, 100vw\);/s
  );
  expect(css).toMatch(/\.docsera-manage-access__header-title\s*{[^}]*display:\s*flex;[^}]*gap:\s*10px;/s);
  expect(css).toMatch(/\.docsera-manage-access__back\s*{[^}]*background:\s*transparent;[^}]*border:\s*0;[^}]*width:\s*28px;/s);
  expect(css).toMatch(/\.docsera-manage-access__toolbar\s*{[^}]*align-items:\s*center;[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 132px;/s);
  expect(css).toMatch(/\.docsera-manage-access__filter-input\s*{[^}]*min-height:\s*40px;[^}]*padding:\s*8px 12px 8px 32px;/s);
  expect(css).toMatch(/\.docsera-manage-access__add-button\s*{[^}]*display:\s*inline-flex;[^}]*gap:\s*7px;/s);
  expect(css).toMatch(
    /\.docsera-manage-access__member-headings\s*{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) 164px;[^}]*text-transform:\s*uppercase;/s
  );
  expect(css).toMatch(
    /\.docsera-manage-access__list\s*{[^}]*border:\s*1px solid var\(--docsera-border-soft\);[^}]*border-radius:\s*12px;[^}]*overflow:\s*clip;/s
  );
  expect(css).toMatch(
    /\.docsera-manage-access__member\s*{[^}]*grid-template-columns:\s*40px minmax\(0, 1fr\) 174px;[^}]*min-height:\s*60px;/s
  );
  expect(css).toMatch(
    /\.docsera-manage-access__member-name\s*{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s
  );
  expect(css).toMatch(
    /\.docsera-manage-access__member-meta\s*{[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s
  );
  expect(css).toMatch(/\.docsera-manage-access__restriction\s*{[^}]*overflow-wrap:\s*anywhere;/s);
  expect(css).not.toMatch(/\.docsera-manage-access__restriction\s*{[^}]*text-overflow:\s*ellipsis;/s);
  expect(css).toMatch(/\.docsera-manage-access__avatar\s*{[^}]*border-radius:\s*999px;[^}]*height:\s*34px;[^}]*width:\s*34px;/s);
  expect(css).toMatch(/\.docsera-manage-access__permissions-copy\s*{[^}]*font-size:\s*0\.75rem;[^}]*line-height:\s*1\.45;/s);
  expect(css).not.toMatch(/\.docsera-manage-access__title\s*{[^}]*font-size:\s*1\.25rem;/s);
  expect(css).not.toMatch(/\.docsera-manage-access__title\s*{[^}]*line-height:\s*1\.2;/s);
  expect(css).toMatch(
    /\.docsera-manage-access__search-results\s*{[^}]*height:\s*var\(--docsera-manage-access-add-list-height\);[^}]*min-height:\s*0;[^}]*overflow:\s*auto;/s
  );
  expect(css).toMatch(/\.docsera-manage-access__list-align-spacer\s*{[^}]*min-height:\s*34px;/s);
  expect(css).not.toMatch(/\.docsera-manage-access__add-primary\s*{[^}]*(?:width|min-width):\s*134px;/s);
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
    /\.docsera-manage-access__user-option span\s*{[^}]*font-size:\s*0\.75rem;[^}]*line-height:\s*1\.25;/s
  );
  expect(css).toMatch(
    /\.docsera-manage-access__user-option small\s*{[^}]*font-size:\s*0\.75rem;/s
  );
  expect(css).toMatch(
    /\.docsera-manage-access__staged-member \.docsera-manage-access__member-name\s*{[^}]*font-size:\s*0\.75rem;[^}]*line-height:\s*1\.25;/s
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
  const removeButtonHover = ".docsera-manage-access .docsera-manage-access__remove-button:not(:disabled):hover";
  const darkRemoveButtonHover = `html[data-docsera-theme="dark"] ${removeButtonHover}`;
  expect(css).toMatch(
    /\.docsera-manage-access \.docsera-manage-access__remove-button:not\(:disabled\):hover\s*{[^}]*border-color:\s*rgba\(186, 26, 26, 0\.28\);[^}]*background:\s*rgba\(186, 26, 26, 0\.14\);[^}]*color:\s*var\(--docsera-error\);/s
  );
  expect(css).toMatch(
    /html\[data-docsera-theme="dark"\] \.docsera-manage-access \.docsera-manage-access__remove-button:not\(:disabled\):hover\s*{[^}]*border-color:\s*rgba\(255, 138, 128, 0\.28\);[^}]*background:\s*rgba\(255, 138, 128, 0\.14\);[^}]*color:\s*var\(--docsera-error\);/s
  );
  expect(compareSpecificity(selectorSpecificity(removeButtonHover), selectorSpecificity(genericSecondaryHover))).toBeGreaterThan(0);
  expect(compareSpecificity(selectorSpecificity(darkRemoveButtonHover), selectorSpecificity(genericSecondaryHover))).toBeGreaterThan(0);
  expect(css.indexOf(genericSecondaryHover)).toBeGreaterThan(-1);
  expect(css.indexOf(removeButtonHover)).toBeGreaterThan(-1);
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
    /\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__control--toggle\s*{[^}]*transform:\s*translateY\(-50%\);/s
  );
  expect(css).toMatch(
    /\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__control--toggle \.docsera-editor-accordion__chevron\s*{[^}]*transform:\s*rotate\(0deg\);[^}]*transition:\s*transform 0\.16s ease;/s
  );
  expect(css).toMatch(
    /\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__item\[data-docsera-accordion-open="true"\] \.docsera-editor-accordion__control--toggle \.docsera-editor-accordion__chevron\s*{[^}]*transform:\s*rotate\(90deg\);/s
  );
  expect(css).toMatch(
    /@media \(prefers-reduced-motion: reduce\)\s*{[^}]*\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__control--toggle \.docsera-editor-accordion__chevron\s*{[^}]*transition:\s*none;/s
  );
  expect(css).toMatch(
    /\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__menu\s*{[^}]*top:\s*calc\(\s*var\(--docsera-editor-accordion-title-row-center\)\s*\+\s*\(var\(--docsera-editor-accordion-control-size\) \/ 2\)\s*\+\s*var\(--docsera-editor-accordion-menu-gap\)\s*\);/s
  );
  expect(css).toContain(".docsera-block-menu__item:disabled,");
  expect(css).toContain(".docsera-block-menu__item--destructive:disabled,");
  expect(css).toContain(".docsera-block-menu__item--destructive:disabled.docsera-block-menu__item--active {");
  expect(css).toMatch(
    /\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__delete-item\s*{[^}]*color:\s*var\(--docsera-error\);/s
  );
  expect(css).toMatch(
    /\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__delete-item:hover,[\s\S]*\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__delete-item:focus-visible,[\s\S]*\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__delete-item\.docsera-block-menu__item--active\s*{[^}]*background:\s*color-mix\(in srgb, var\(--docsera-error\) 10%, var\(--docsera-surface\)\);[^}]*color:\s*var\(--docsera-error\);/s
  );
  expect(css).toMatch(
    /\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__delete-item:disabled,[\s\S]*\.docsera-editor-runtime__surface \.ProseMirror \.docsera-editor-accordion__delete-item:disabled\.docsera-block-menu__item--active\s*{[^}]*color:\s*var\(--docsera-text-soft\);[^}]*background:\s*transparent;/s
  );
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
