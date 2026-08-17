import { describe, expect, it } from "vitest";
import {
  DOCSERA_DOCUMENT_SCHEMA_VERSION,
  createEmptyDocseraDocumentEnvelope,
  extractPlainTextFromServerDocument,
  parseDocseraDocument,
  parseDocseraDocumentOrThrow,
  serializeDocseraDocument
} from "../../server/pages/serverEditorDocument";
import {
  createDocseraDocumentFixtureCorpus,
  createCodeBlockWhitespaceDocseraDocumentEnvelope,
  createCombinedInlineMarksDocseraDocumentEnvelope,
  createDuplicateHeadingDocseraDocumentEnvelope,
  createEmptyHeadingDocseraDocumentEnvelope,
  createExpandedTextFormattingDocseraDocumentEnvelope,
  createLargeCanonicalDocseraDocumentEnvelope,
  createLegacyDocseraDocument,
  createNestedTableDocseraDocumentEnvelope,
  createNestedTaskListDocseraDocumentEnvelope,
  createStandardTableDocseraDocumentEnvelope,
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

  it.each([
    { schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION, document: { type: "doc" } },
    { schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION, document: { type: "doc", content: [] } },
    { schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION, document: { type: "doc", content: [{ type: "paragraph" }] } },
    { type: "doc" },
    { type: "doc", content: [] },
    { type: "doc", content: [{ type: "paragraph" }] }
  ])("canonicalizes every accepted empty representation to the runtime paragraph document", (input) => {
    const parsed = parseDocseraDocument(input);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.envelope).toEqual(createEmptyDocseraDocumentEnvelope());
      expect(parsed.envelope.document.content).toEqual([{ type: "paragraph" }]);
    }
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
    ["combined inline marks", createCombinedInlineMarksDocseraDocumentEnvelope()],
    ["duplicate headings", createDuplicateHeadingDocseraDocumentEnvelope()],
    ["expanded text formatting", createExpandedTextFormattingDocseraDocumentEnvelope()]
  ])("round-trips %s", (_label, envelope) => {
    const parsed = parseDocseraDocument(serializeDocseraDocument(envelope));

    expect(parsed).toEqual({
      ok: true,
      envelope,
      migratedLegacyDocument: false
    });
  });

  it("canonicalizes empty headings by omitting empty content arrays", () => {
    const envelope = createEmptyHeadingDocseraDocumentEnvelope();
    const parsed = parseDocseraDocument(serializeDocseraDocument(envelope));

    expect(parsed).toEqual({
      ok: true,
      envelope: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 2 }
            }
          ]
        }
      },
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
    expect(source.document.content).toEqual([{ type: "paragraph" }]);
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

  it("canonicalizes standard table structural defaults and preserves table round trips", () => {
    const input = {
      schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
      document: {
        type: "doc",
        content: [
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [
                  {
                    type: "tableCell",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "Defaulted" }]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    };

    const parsed = parseDocseraDocument(input);

    expect(parsed).toEqual({
      ok: true,
      envelope: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
          type: "doc",
          content: [
            {
              type: "table",
              content: [
                {
                  type: "tableRow",
                  content: [
                    {
                      type: "tableCell",
                      attrs: { colspan: 1, rowspan: 1, colwidth: null },
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Defaulted" }]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      },
      migratedLegacyDocument: false
    });

    if (parsed.ok) {
      expect(parseDocseraDocument(serializeDocseraDocument(parsed.envelope))).toEqual(parsed);
    }
  });

  it("preserves table cell and header alignment through canonical round trips", () => {
    const envelope = {
      schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
      document: {
        type: "doc",
        content: [
          {
            type: "table",
            content: [
              {
                type: "tableRow",
                content: [
                  {
                    type: "tableHeader",
                    attrs: { colspan: 1, rowspan: 1, colwidth: null, align: "center" },
                    content: [{ type: "paragraph", content: [{ type: "text", text: "Aligned header" }] }]
                  },
                  {
                    type: "tableCell",
                    attrs: { colspan: 1, rowspan: 1, colwidth: null, align: "right" },
                    content: [{ type: "paragraph", content: [{ type: "text", text: "Aligned cell" }] }]
                  }
                ]
              }
            ]
          }
        ]
      }
    } as const;

    const parsed = parseDocseraDocument(envelope);

    expect(parsed).toEqual({
      ok: true,
      envelope,
      migratedLegacyDocument: false
    });

    if (parsed.ok) {
      expect(parseDocseraDocument(serializeDocseraDocument(parsed.envelope))).toEqual(parsed);
    }
  });

  it("round-trips standard table cells, headers, spans, nested blocks, and inline marks", () => {
    const envelope = createStandardTableDocseraDocumentEnvelope();
    const parsed = parseDocseraDocument(serializeDocseraDocument(envelope));

    expect(parsed).toEqual({
      ok: true,
      envelope,
      migratedLegacyDocument: false
    });
  });

  it("round-trips supported nested table structures without flattening or dropping them", () => {
    const envelope = createNestedTableDocseraDocumentEnvelope();
    const parsed = parseDocseraDocument(serializeDocseraDocument(envelope));

    expect(parsed).toEqual({
      ok: true,
      envelope,
      migratedLegacyDocument: false
    });
    expect(JSON.stringify(parsed.ok ? parsed.envelope.document : {})).toContain("Nested quote table");
    expect(JSON.stringify(parsed.ok ? parsed.envelope.document : {})).toContain("Nested cell table");
  });

  it("collects table cell and header content in extracted plain text", () => {
    const text = extractPlainTextFromServerDocument(createStandardTableDocseraDocumentEnvelope());

    expect(text).toContain("Plan");
    expect(text).toContain("Owner");
    expect(text).toContain("Alpha launch");
    expect(text).toContain("Nested block");
    expect(text).toContain("Beta");
  });
});
