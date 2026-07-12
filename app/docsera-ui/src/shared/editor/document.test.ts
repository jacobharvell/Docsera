import { describe, expect, it } from "vitest";
import {
  DOCSERA_DOCUMENT_SCHEMA_VERSION,
  createEmptyDocseraDocumentEnvelope,
  parseDocseraDocument,
  parseDocseraDocumentOrThrow,
  serializeDocseraDocument
} from "./document";
import {
  createDocseraDocumentFixtureCorpus,
  createCodeBlockWhitespaceDocseraDocumentEnvelope,
  createCombinedInlineMarksDocseraDocumentEnvelope,
  createLargeCanonicalDocseraDocumentEnvelope,
  createLegacyDocseraDocument,
  createNestedTaskListDocseraDocumentEnvelope,
  createTaskCheckedStateDocseraDocumentEnvelope,
  createSupportedE2DocseraDocumentEnvelope
} from "./documentFixtures";

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
    const legacyDocument = createLegacyDocseraDocument("Legacy");
    const parsed = parseDocseraDocument(legacyDocument);

    expect(parsed).toEqual({
      ok: true,
      envelope: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: legacyDocument
      },
      migratedLegacyDocument: true
    });
  });

  it("round-trips the supported E2 rich-text schema without losing marks, lists, or code attributes", () => {
    const envelope = createSupportedE2DocseraDocumentEnvelope();
    const parsed = parseDocseraDocument(serializeDocseraDocument(envelope));

    expect(parsed).toEqual({
      ok: true,
      envelope,
      migratedLegacyDocument: false
    });
  });

  it.each([
    ["nested task lists", createNestedTaskListDocseraDocumentEnvelope()],
    ["checked task state", createTaskCheckedStateDocseraDocumentEnvelope(true)],
    ["unchecked task state", createTaskCheckedStateDocseraDocumentEnvelope(false)],
    ["code block terminal whitespace", createCodeBlockWhitespaceDocseraDocumentEnvelope()],
    ["combined inline marks", createCombinedInlineMarksDocseraDocumentEnvelope()]
  ])("round-trips %s", (_label, envelope) => {
    const parsed = parseDocseraDocument(serializeDocseraDocument(envelope));

    expect(parsed).toEqual({
      ok: true,
      envelope,
      migratedLegacyDocument: false
    });
  });

  it.each(createDocseraDocumentFixtureCorpus())(
    "classifies $label",
    ({ input, expected }) => {
      const parsed = parseDocseraDocument(input);
      expect(parsed.ok).toBe(expected.ok);

      if (!expected.ok) {
        expect(parsed).toMatchObject({
          ok: false,
          reason: expected.reason
        });
        return;
      }

      expect(parsed).toMatchObject({
        ok: true,
        migratedLegacyDocument: expected.migratedLegacyDocument
      });
    }
  );

  it("rejects malformed raw document roots instead of treating them as unsupported versions", () => {
    expect(parseDocseraDocument({ type: "doc", content: {} })).toMatchObject({
      ok: false,
      reason: "invalid-document"
    });
  });

  it("throws from the strict helper for invalid content", () => {
    expect(() => parseDocseraDocumentOrThrow("not-json")).toThrow("not valid JSON");
  });

  it("returns a defensive copy so consumers cannot mutate the parsed source", () => {
    const source = createEmptyDocseraDocumentEnvelope();
    const parsed = parseDocseraDocument(source);

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    parsed.envelope.document.content?.push({ type: "paragraph" });
    expect(source.document.content).toBeUndefined();
  });

  it("round-trips a large canonical document without trimming or schema mutation", () => {
    const envelope = createLargeCanonicalDocseraDocumentEnvelope();
    const parsed = parseDocseraDocument(serializeDocseraDocument(envelope));

    expect(parsed).toEqual({
      ok: true,
      envelope,
      migratedLegacyDocument: false
    });
  });
});
