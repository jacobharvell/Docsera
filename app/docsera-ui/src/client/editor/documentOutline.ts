import type { DocseraDocumentEnvelope } from "../../shared/editor/document";
import { DOCSERA_BODY_HEADING_LEVELS } from "../../shared/editor/schema";
import {
  createCanonicalHeadingAnchorResolver,
  extractCanonicalHeadingText
} from "../../shared/editor/headingAnchors";

export type EditorOutlineItem = {
  anchorId: string;
  id: string;
  level: 1 | 2 | 3;
  title: string;
};

export function extractDocumentOutline(envelope: DocseraDocumentEnvelope): EditorOutlineItem[] {
  const content = Array.isArray(envelope.document.content) ? envelope.document.content : [];
  const resolveAnchorId = createCanonicalHeadingAnchorResolver();
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
    if (!DOCSERA_BODY_HEADING_LEVELS.includes(level as 1 | 2 | 3)) {
      continue;
    }

    const title = extractCanonicalHeadingText(candidate);
    if (!title) {
      continue;
    }

    const anchorId = resolveAnchorId(title);

    items.push({
      anchorId,
      id: anchorId,
      level: level as 1 | 2 | 3,
      title
    });
  }

  return items;
}
