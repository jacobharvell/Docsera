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
