import { describe, expect, it } from "vitest";
import {
  DOCSERA_DOCUMENT_SCHEMA_VERSION,
  createEmptyDocseraDocumentEnvelope,
  parseDocseraDocument,
  serializeDocseraDocument
} from "./document";

describe("Docsera document envelope", () => {
  it("creates and round-trips the current canonical envelope", () => {
    const envelope = createEmptyDocseraDocumentEnvelope();
    const parsed = parseDocseraDocument(serializeDocseraDocument(envelope));

    expect(parsed).toEqual({
      ok: true,
      envelope,
      migratedLegacyDocument: false
    });
  });

  it("preserves terminal whitespace inside TipTap text nodes", () => {
    const envelope = {
      schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
      document: {
        type: "doc" as const,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Trailing spaces stay here   \n" }]
          }
        ]
      }
    };

    const parsed = parseDocseraDocument(serializeDocseraDocument(envelope));

    expect(parsed).toEqual({
      ok: true,
      envelope,
      migratedLegacyDocument: false
    });
  });

  it("migrates the existing raw TipTap document shape into schema version one", () => {
    const parsed = parseDocseraDocument({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Legacy" }] }]
    });

    expect(parsed).toEqual({
      ok: true,
      envelope: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Legacy" }] }]
        }
      },
      migratedLegacyDocument: true
    });
  });

  it("rejects malformed and unsupported content instead of replacing it with an empty document", () => {
    expect(parseDocseraDocument("not-json")).toMatchObject({ ok: false, reason: "invalid-json" });
    expect(parseDocseraDocument({ schemaVersion: 2, document: { type: "doc", content: [] } })).toMatchObject({
      ok: false,
      reason: "unsupported-schema-version"
    });
    expect(parseDocseraDocument({ schemaVersion: 1, document: { type: "paragraph" } })).toMatchObject({
      ok: false,
      reason: "invalid-document"
    });
  });

  it("returns a defensive copy so consumers cannot mutate the parsed source", () => {
    const source = createEmptyDocseraDocumentEnvelope();
    const parsed = parseDocseraDocument(source);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    parsed.envelope.document.content?.push({ type: "paragraph" });
    expect(source.document.content).toEqual([]);
  });
});
