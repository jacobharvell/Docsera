import { DOCSERA_DOCUMENT_SCHEMA_VERSION, type DocseraDocumentEnvelope } from "./document";
import type { DocseraImageAttrs } from "./imageContract";

function createCanonicalImageNode(
  mediaId = "workspace-media-001",
  overrides: Partial<Omit<DocseraImageAttrs, "mediaId">> = {}
): { attrs: DocseraImageAttrs; type: "image" } {
  return {
    type: "image",
    attrs: {
      mediaId,
      darkMediaId: overrides.darkMediaId ?? null,
      alt: overrides.alt ?? "",
      caption: overrides.caption ?? "",
      frame: overrides.frame ?? true,
      align: overrides.align ?? "left",
      widthPct: overrides.widthPct ?? 100
    }
  };
}

export function createCanonicalImageDocseraDocumentEnvelope(): DocseraDocumentEnvelope {
  return {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: {
      type: "doc",
      content: [createCanonicalImageNode()]
    }
  };
}

export function createResponsiveImageDocseraDocumentEnvelope(): DocseraDocumentEnvelope {
  return {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: {
      type: "doc",
      content: [
        createCanonicalImageNode("workspace-media-light", {
          darkMediaId: "workspace-media-dark",
          alt: "Architecture diagram",
          caption: "Published in both light and dark modes",
          frame: false,
          align: "center",
          widthPct: 80
        })
      ]
    }
  };
}
