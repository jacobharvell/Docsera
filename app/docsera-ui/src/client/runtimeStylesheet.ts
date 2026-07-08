export function ensureRuntimeStylesheet(cssText: string, targetDocument: Document = document): HTMLStyleElement {
  const selector = 'style[data-docsera-runtime-style="runtime-shell"]';
  let styleElement = targetDocument.head.querySelector(selector);

  if (!(styleElement instanceof HTMLStyleElement)) {
    styleElement = targetDocument.createElement("style");
    styleElement.setAttribute("data-docsera-runtime-style", "runtime-shell");
    targetDocument.head.appendChild(styleElement);
  }

  if (styleElement.textContent !== cssText) {
    styleElement.textContent = cssText;
  }

  return styleElement as HTMLStyleElement;
}
