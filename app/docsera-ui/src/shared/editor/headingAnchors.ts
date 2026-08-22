function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function extractInlineText(node: unknown): string {
  if (!node || typeof node !== "object") {
    return "";
  }

  const candidate = node as Record<string, unknown>;
  if (candidate.type === "text") {
    return typeof candidate.text === "string" ? candidate.text : "";
  }

  if (candidate.type === "hardBreak") {
    return "\n";
  }

  const content = Array.isArray(candidate.content) ? candidate.content : [];
  return content.map((child) => extractInlineText(child)).join("");
}

function slugifyHeadingText(value: string): string {
  return cleanText(value)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function extractCanonicalInlineText(node: unknown): string {
  return extractInlineText(node);
}

export function extractCanonicalHeadingText(node: unknown): string {
  return extractCanonicalInlineText(node).replace(/\s+/g, " ").trim();
}

export function createCanonicalHeadingAnchorResolver(anchorPrefix = ""): (headingText: string) => string {
  const countsBySlug = new Map<string, number>();

  return (headingText: string) => {
    const baseId = slugifyHeadingText(headingText) || "section";
    const nextCount = (countsBySlug.get(baseId) ?? 0) + 1;
    countsBySlug.set(baseId, nextCount);
    const resolvedId = nextCount === 1 ? baseId : `${baseId}-${nextCount}`;
    return anchorPrefix ? `${anchorPrefix}-${resolvedId}` : resolvedId;
  };
}
