import { describe, expect, it } from "vitest";
import { EDITOR_SCROLLBAR_STYLES } from "../../editor/ScrollbarStyles";

const nodeProcess = new Function("return process")() as {
  cwd: () => string;
  getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
};
const css = nodeProcess.getBuiltinModule("fs").readFileSync(`${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`, "utf8");

describe("owned scrollbar presentation", () => {
  it("reveals the navigation thumb from the pane and distinguishes direct hover", () => {
    expect(css).toContain(".docsera-sidebar:hover .docsera-sidebar__tree::-webkit-scrollbar-thumb");
    expect(css).toContain(".docsera-sidebar:focus-within .docsera-sidebar__tree::-webkit-scrollbar-thumb");
    expect(css).toMatch(/\.docsera-sidebar__tree::-webkit-scrollbar-thumb:hover[\s\S]*?60%/);
    expect(css).toMatch(/\.docsera-sidebar__tree\s*\{[^}]*margin-right:\s*-9px/s);
  });
  it("keeps the ToC text anchor and adds a separate scrollbar dead zone", () => {
    expect(css).toMatch(/\.docsera-toc-rail__body\s*\{[^}]*padding:\s*16px 6px 16px 16px/s);
    expect(css).toMatch(/\.docsera-toc__list\s*\{[^}]*padding:\s*0 4px 0 0/s);
    expect(css).toMatch(/\.docsera-toc__list::-webkit-scrollbar\s*\{[^}]*width:\s*4px/s);
  });
  it("styles the actual panel and editor scroll owners with native fallback", () => {
    for (const owner of [".docsera-page-settings__scroll-content", ".docsera-workspace-settings-overlay__body", ".docsera-manage-access__body", ".docsera-manage-access__search-results", ".docsera-manage-access__staged-list", ".docsera-changes-center__list", ".docsera-modal__user-results", ".docsera-header__menu-list"]) expect(css).toContain(owner);
    for (const owner of [".docsera-block-selector__scroll", ".docsera-table-controls-overlay__menu", ".docsera-image-picker__library-scroll", ".docsera-image-options-panel"]) expect(EDITOR_SCROLLBAR_STYLES).toContain(owner);
    for (const styles of [css, EDITOR_SCROLLBAR_STYLES]) {
      expect(styles).toContain("@supports not selector(::-webkit-scrollbar)");
      expect(styles).toContain("@media (hover: none)");
      expect(styles).toContain("::-webkit-scrollbar-button");
      expect(styles).toContain(":focus-within");
      expect(styles).toContain("var(--docsera-text-soft)");
    }
  });
  it("keeps page scrolling native and reveals nested thumbs from their owning panels", () => {
    const shared = css.slice(css.indexOf("/* Docsera-owned vertical scroll regions"), css.indexOf("@media (hover: none) {\n  .docsera-sidebar__tree"));
    expect(shared).not.toContain(".docsera-app__body");
    expect(css).toMatch(/\.docsera-app__body\s*\{[^}]*overflow-y:\s*auto;[^}]*scrollbar-gutter:\s*stable;/s);
    expect(css).toMatch(/\.docsera-page-settings__scroll-content\s*\{[^}]*overflow-y:\s*auto;[^}]*scrollbar-gutter:\s*stable;/s);
    expect(css).toMatch(/\.docsera-page-settings-shell\s*\{[^}]*pointer-events:\s*none/s);
    expect(css).toMatch(/\.docsera-page-settings--open\s*\{[^}]*pointer-events:\s*auto/s);
    for (const state of ["hover", "focus-within"]) {
      expect(shared).toContain(`.docsera-page-settings-shell:${state} .docsera-page-settings__scroll-content::-webkit-scrollbar-thumb`);
      expect(shared).not.toContain(`.docsera-page-settings__scroll-content:${state}::-webkit-scrollbar-thumb`);
    }
    const pairs = [
      [".docsera-workspace-settings-overlay__panel", ".docsera-workspace-settings-overlay__body"],
      [".docsera-manage-access__panel", ".docsera-manage-access__body"],
      [".docsera-manage-access__add-panel", ".docsera-manage-access__add-body"],
      [".docsera-manage-access__add-column", ".docsera-manage-access__search-results"],
      [".docsera-manage-access__add-column", ".docsera-manage-access__staged-list"],
      [".docsera-changes-center", ".docsera-changes-center__list"],
      [".docsera-header__menu", ".docsera-header__menu-list"]
    ];
    for (const [panel, scroll] of pairs) {
      for (const state of ["hover", "focus-within"]) expect(shared).toContain(`${panel}:${state} ${scroll}::-webkit-scrollbar-thumb`);
      expect(shared).toContain(`${panel}:hover ${scroll}::-webkit-scrollbar-thumb:hover`);
      expect(shared).toContain(`${panel} ${scroll}::-webkit-scrollbar-thumb:active`);
    }
    expect(shared).toMatch(/::-webkit-scrollbar-thumb:hover[\s\S]*?60%/);
    expect(shared).toMatch(/::-webkit-scrollbar-thumb:active[\s\S]*?60%/);
    expect(EDITOR_SCROLLBAR_STYLES).toContain(".docsera-image-picker:hover .docsera-image-picker__library-scroll");
    expect(EDITOR_SCROLLBAR_STYLES).toContain(".docsera-image-picker:focus-within .docsera-image-picker__library-scroll");
  });
  it("constrains the recent list while keeping the menu chrome outside its scroll region", () => {
    expect(css).toMatch(/\.docsera-header__menu\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto auto;[^}]*max-height:/s);
    expect(css).toMatch(/\.docsera-header__menu-list\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto/s);
  });
});
