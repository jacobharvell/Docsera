import { isDocseraAllowedLinkHref } from "../../shared/editor/schema";

const UNSAFE_PASTE_TAGS = new Set(["script", "style", "noscript", "iframe", "object", "embed", "canvas"]);

function cleanText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function sanitizeElementAttributes(element: Element): void {
  for (const attribute of Array.from(element.attributes)) {
    const name = attribute.name.toLowerCase();
    if (name.startsWith("on") || name === "style" || name === "srcdoc") {
      element.removeAttribute(attribute.name);
      continue;
    }

    if (element.tagName.toLowerCase() === "a" && name === "href" && !isDocseraAllowedLinkHref(attribute.value)) {
      element.removeAttribute(attribute.name);
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
