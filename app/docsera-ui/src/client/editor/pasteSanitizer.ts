import { isDocseraAllowedLinkHref } from "../../shared/editor/schema";
import { isDocseraPaletteKey, isDocseraTextAlignment } from "../../server/editor/colorContract";

const UNSAFE_PASTE_TAGS = new Set(["script", "style", "noscript", "iframe", "object", "embed", "canvas", "img", "picture", "source"]);

function cleanText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isTextAlignPasteElement(tagName: string): boolean {
  return tagName === "p" || /^h[1-6]$/.test(tagName);
}

function getSupportedPastedTextAlign(styleValue: string): string | null {
  for (const declaration of styleValue.split(";")) {
    const separatorIndex = declaration.indexOf(":");
    if (separatorIndex < 0) {
      continue;
    }

    const property = declaration.slice(0, separatorIndex).trim().toLowerCase();
    const value = declaration.slice(separatorIndex + 1).trim().toLowerCase();
    if (property === "text-align" && isDocseraTextAlignment(value)) {
      return value;
    }
  }

  return null;
}

function sanitizeElementAttributes(element: Element): void {
  const tagName = element.tagName.toLowerCase();
  const textAlign = isTextAlignPasteElement(tagName) && element.hasAttribute("style")
    ? getSupportedPastedTextAlign(element.getAttribute("style") ?? "")
    : null;

  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    const value = attribute.value;
    if (name.startsWith("on") || name === "srcdoc") {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (name === "style") {
      if (textAlign) {
        element.setAttribute("style", `text-align: ${textAlign};`);
      } else {
        element.removeAttribute(attribute.name);
      }
      continue;
    }

    if (tagName === "a" && name === "href" && !isDocseraAllowedLinkHref(value)) {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (name === "data-docsera-text-color") {
      if (tagName !== "span" || !isDocseraPaletteKey(value)) {
        element.removeAttribute(attribute.name);
      }
      continue;
    }

    if (name === "data-docsera-highlight-color") {
      if (tagName !== "mark" || !isDocseraPaletteKey(value)) {
        element.removeAttribute(attribute.name);
      }
      continue;
    }
  }
}

function sanitizeElementTree(root: ParentNode): void {
  const elements = Array.from(root.querySelectorAll("*"));
  for (const element of elements) {
    const lowerTagName = element.tagName.toLowerCase();
    if (UNSAFE_PASTE_TAGS.has(lowerTagName)) {
      element.remove();
      continue;
    }

    sanitizeElementAttributes(element);
  }
}

export function sanitizeDocseraPastedHTML(html: string): string {
  const source = cleanText(html);
  if (!source || typeof DOMParser === "undefined") {
    return source;
  }

  const parser = new DOMParser();
  const parsedDocument = parser.parseFromString(source, "text/html");
  sanitizeElementTree(parsedDocument.body);

  return parsedDocument.body.innerHTML;
}

export function sanitizeDocseraPastedText(text: string): string {
  return cleanText(text).replace(/\r\n?/g, "\n");
}
