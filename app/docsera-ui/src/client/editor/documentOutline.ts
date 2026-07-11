import type { DocseraDocumentEnvelope } from "../../shared/editor/document";
import { DOCSERA_BODY_HEADING_LEVELS } from "../../shared/editor/schema";

export type EditorOutlineItem = {
  anchorId: string;
  id: string;
  level: number;
  title: string;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

function extractInlineText(node: unknown): string {
  if (!node || typeof node !== "object") {
    return "";
  }

  const candidate = node as Record<string, unknown>;
  if (candidate.type === "text") {
    return typeof candidate.text === "string" ? candidate.text : "";
  }

  if (candidate.type === "hardBreak" || candidate.type === "hard_break") {
    return "\n";
  }

  const content = Array.isArray(candidate.content) ? candidate.content : [];
  return content.map((child) => extractInlineText(child)).join("");
}

export function extractDocumentOutline(envelope: DocseraDocumentEnvelope): EditorOutlineItem[] {
  const content = Array.isArray(envelope.document.content) ? envelope.document.content : [];
  const countsBySlug = new Map<string, number>();
  const items: EditorOutlineItem[] = [];

  for (const node of content) {
    if (!node || typeof node !== "object") {
      continue;
    }

    const candidate = node as Record<string, unknown>;
    if (candidate.type !== "heading") {
      continue;
    }

    const level = Number((candidate.attrs as Record<string, unknown> | undefined)?.level);
    if (!DOCSERA_BODY_HEADING_LEVELS.includes(level as 2 | 3)) {
      continue;
    }

    const title = extractInlineText(candidate).replace(/\s+/g, " ").trim();
    if (!title) {
      continue;
    }

    const baseId = slugifyHeadingText(title) || "section";
    const nextCount = (countsBySlug.get(baseId) ?? 0) + 1;
    countsBySlug.set(baseId, nextCount);
    const anchorId = nextCount === 1 ? baseId : `${baseId}-${nextCount}`;

    items.push({
      anchorId,
      id: anchorId,
      level,
      title
    });
  }

  return items;
}
