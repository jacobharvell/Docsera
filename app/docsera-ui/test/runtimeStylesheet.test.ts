import { readFileSync } from "node:fs";
import { ensureRuntimeStylesheet } from "../src/client/runtimeStylesheet";

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
  expect(css).toContain("--docsera-workspace-heading-scroll-margin: calc(var(--docsera-header-height) + 16px);");
  expect(css).toContain("--docsera-workspace-toc-top-gap: 8px;");
  expect(css).toContain("--docsera-editor-block-gutter-width: 69px;");
  expect(css).toContain("align-items: stretch;");
  expect(css).toContain(".docsera-workspace__aside {");
  expect(css).toContain("display: flex;");
  expect(css).toMatch(/\.docsera-workspace__aside\s*{[^}]*border-left:\s*1px solid var\(--docsera-border\);/s);
  expect(css).toContain(".docsera-toc-rail {");
  expect(css).toMatch(/\.docsera-toc-rail\s*{[^}]*align-self:\s*flex-start;[^}]*height:\s*calc\(100vh - var\(--docsera-header-height\) - var\(--docsera-workspace-toc-top-gap\)\);/s);
  expect(css).not.toMatch(/\.docsera-toc-rail\s*{[^}]*height:\s*100%;/s);
  expect(css).toContain("top: calc(var(--docsera-header-height) + var(--docsera-workspace-toc-top-gap));");
  expect(css).toMatch(/\.docsera-toc-rail__body\s*{[^}]*height:\s*100%;[^}]*min-height:\s*0;/s);
  expect(css).not.toMatch(/\.docsera-toc-rail__body\s*{[^}]*border-left:/s);
  expect(css).toContain(".docsera-main__body-heading,");
  expect(css).toContain("scroll-margin-block-start: var(--docsera-workspace-heading-scroll-margin);");
  expect(css).toMatch(/\.docsera-main__surface\s*{[^}]*margin-inline-start:\s*clamp\([^}]*var\(--docsera-toc-panel-width\)/s);
  expect(css).toMatch(/\.docsera-main__surface\s*{[^}]*display:\s*grid;[^}]*align-content:\s*start;[^}]*gap:\s*28px;/s);
  expect(css).toMatch(/\.docsera-main__surface--editor\s*{[^}]*gap:\s*0;[^}]*padding-left:\s*calc\(24px \+ var\(--docsera-editor-block-gutter-width\)\);/s);
  expect(css).toMatch(/\.docsera-main__editor-host\s*{[^}]*margin-top:\s*40px;/s);
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

test("centers workspace mode control and keeps the save status in the header before Publish", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");

  expect(css).toMatch(/\.docsera-header__action-slot--mode\s*{[^}]*position:\s*absolute;[^}]*left:\s*50%;[^}]*transform:\s*translate\(-50%, -50%\);/s);
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

  expect(shellCss).toMatch(/\.docsera-modal\s*{[^}]*z-index:\s*150;/s);
  expect(shellCss).toMatch(/\.docsera-changes-center--portal\s*{[^}]*z-index:\s*140;/s);
  expect(shellCss).toContain(".docsera-modal__panel {");
  expect(tableOverlaySource).toContain("const TABLE_CONTROL_OVERLAY_Z_INDEX = 126;");
  expect(tableOverlaySource).toContain("const TABLE_CONTROL_MENU_Z_INDEX = 130;");
});

test("keeps reader table styling aligned to the E5 Legacy geometry without advanced-control spacing", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");

  expect(css).toMatch(/\.docsera-main__table-wrapper\s*{[^}]*overflow-x:\s*auto;[^}]*overflow-y:\s*visible;[^}]*margin:\s*1rem 0;/s);
  expect(css).not.toMatch(/\.docsera-main__table-wrapper\s*{[^}]*padding-bottom:/s);
  expect(css).toMatch(/\.docsera-main__table\s*{[^}]*width:\s*max-content;[^}]*border-collapse:\s*collapse;[^}]*table-layout:\s*auto;/s);
  expect(css).toMatch(/\.docsera-main__table\s*{[^}]*font-size:\s*inherit;[^}]*line-height:\s*inherit;/s);
  expect(css).toMatch(/\.docsera-main__table-cell\s*{[^}]*min-width:\s*80px;[^}]*padding:\s*0\.38rem 0\.75rem;[^}]*border:\s*1px solid/s);
  expect(css).toMatch(/\.docsera-main__table-cell\s*{[^}]*vertical-align:\s*top;/s);
});
