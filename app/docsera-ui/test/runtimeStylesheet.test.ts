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
  expect(css).toContain(".docsera-workspace {");
  expect(css).toContain("background: var(--docsera-workspace-bg, var(--docsera-surface));");
});

test("hides the complete ToC rail at the responsive breakpoint instead of stacking it below the document", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");
  const responsive = css.slice(css.indexOf("@media (max-width: 1180px)"), css.indexOf("@media (max-width: 920px)"));
  expect(responsive).toContain(".docsera-workspace__aside");
  expect(responsive).toContain("display: none;");
  expect(responsive).not.toContain("grid-column: 1 / -1");
  expect(responsive).not.toContain(".docsera-toc-rail__body");
});

test("centers workspace mode control and moves save status into the page title row", () => {
  const css = readFileSync("src/client/styles/runtime-shell.css", "utf8");

  expect(css).toMatch(/\.docsera-header__action-slot--mode\s*{[^}]*position:\s*absolute;[^}]*left:\s*50%;[^}]*transform:\s*translate\(-50%, -50%\);/s);
  expect(css).toMatch(/\.docsera-main__save-status\s*{[^}]*white-space:\s*nowrap;/s);
  expect(css).toContain(".docsera-header__publish-button");
  expect(css).toContain(".docsera-changes-center__list");
});
