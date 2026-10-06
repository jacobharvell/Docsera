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
  createMultiItemAccordionDocseraDocumentEnvelope,
  createDuplicateHeadingDocseraDocumentEnvelope,
  createEmptyHeadingDocseraDocumentEnvelope,
  createEmptyHeadingHierarchyDocseraDocumentEnvelope,
  createExpandedTextFormattingDocseraDocumentEnvelope,
  createLargeCanonicalDocseraDocumentEnvelope,
  createLegacyDocseraDocument,
  createNestedTableDocseraDocumentEnvelope,
  createNestedTaskListDocseraDocumentEnvelope,
  createStandardTableDocseraDocumentEnvelope,
  createSingleItemAccordionDocseraDocumentEnvelope,
  createTaskCheckedStateDocseraDocumentEnvelope,
  createSupportedE2DocseraDocumentEnvelope
} from "./documentFixtures";
import {
  createCanonicalImageDocseraDocumentEnvelope,
  createResponsiveImageDocseraDocumentEnvelope
} from "./imageFixtures";
import { extractPlainTextFromServerDocument } from "../../server/pages/serverEditorDocument";

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
    { schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION, document: { type: "doc", content: [{ type: "paragraph" }] } },
    { type: "doc" },
    { type: "doc", content: [{ type: "paragraph" }] }
  ])("canonicalizes every accepted empty representation to the runtime paragraph document", (input) => {
    const parsed = parseDocseraDocument(input);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.envelope).toEqual(createEmptyDocseraDocumentEnvelope());
      expect(parsed.envelope.document.content).toEqual([{ type: "paragraph" }]);
    }
  });

  it.each([
    { schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION, document: { type: "doc", content: [] } },
    { type: "doc", content: [] }
  ])("preserves an explicit zero-child document", (input) => {
    const parsed = parseDocseraDocument(input);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.envelope.document).toEqual({ type: "doc", content: [] });
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

  it("round-trips the canonical default image envelope without widening the image contract", () => {
    const envelope = createCanonicalImageDocseraDocumentEnvelope();
    const parsed = parseDocseraDocument(serializeDocseraDocument(envelope));

    expect(parsed).toEqual({
      ok: true,
      envelope,
      migratedLegacyDocument: false
    });
  });

  it("canonicalizes image defaults and clamps width percentage without preserving URL-backed attrs", () => {
    const parsed = parseDocseraDocument({
      schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
      document: {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              mediaId: "  workspace-media-001  ",
              darkMediaId: "workspace-media-dark",
              alt: "Architecture diagram",
              caption: "Published in both light and dark modes",
              frame: false,
              align: "center",
              widthPct: 15
            }
          }
        ]
      }
    });

    expect(parsed).toEqual({
      ok: true,
      envelope: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
          type: "doc",
          content: [
            {
              type: "image",
              attrs: {
                mediaId: "workspace-media-001",
                darkMediaId: "workspace-media-dark",
                alt: "Architecture diagram",
                caption: "Published in both light and dark modes",
                frame: false,
                align: "center",
                widthPct: 20
              }
            }
          ]
        }
      },
      migratedLegacyDocument: false
    });
  });

  it("round-trips canonical image documents without introducing URL or pixel attrs", () => {
    const envelope = createResponsiveImageDocseraDocumentEnvelope();
    const parsed = parseDocseraDocument(serializeDocseraDocument(envelope));

    expect(parsed).toEqual({
      ok: true,
      envelope,
      migratedLegacyDocument: false
    });
    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain('"src"');
    expect(serialized).not.toContain('"title"');
    expect(serialized).not.toContain('"height"');
    expect(serialized).not.toContain('"lightSrc"');
    expect(serialized).not.toContain('"darkSrc"');
    expect(serialized).not.toContain('"lightAlt"');
    expect(serialized).not.toContain('"darkAlt"');
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

  it("preserves paragraph and heading center/right alignment through parse and serialize", () => {
    const envelope = {
      schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
      document: {
        type: "doc" as const,
        content: [
          {
            type: "paragraph",
            attrs: { textAlign: "center" },
            content: [{ type: "text", text: "Centered" }]
          },
          {
            type: "heading",
            attrs: { level: 2, textAlign: "right" },
            content: [{ type: "text", text: "Right" }]
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

  it("keeps existing and explicit-left documents valid without persisting default alignment state", () => {
    const parsed = parseDocseraDocument({
      schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
      document: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "No alignment" }] },
          { type: "paragraph", attrs: { textAlign: "left" }, content: [{ type: "text", text: "Explicit left" }] },
          { type: "heading", attrs: { level: 1, textAlign: "left" }, content: [{ type: "text", text: "Left heading" }] }
        ]
      }
    });

    expect(parsed).toEqual({
      ok: true,
      envelope: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
          type: "doc",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "No alignment" }] },
            { type: "paragraph", content: [{ type: "text", text: "Explicit left" }] },
            { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Left heading" }] }
          ]
        }
      },
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

  it("canonicalizes empty heading levels 1, 2, and 3 by omitting empty content arrays", () => {
    const envelope = createEmptyHeadingHierarchyDocseraDocumentEnvelope();
    const parsed = parseDocseraDocument(serializeDocseraDocument(envelope));

    expect(parsed).toEqual({
      ok: true,
      envelope: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
          type: "doc",
          content: [
            { type: "heading", attrs: { level: 1 } },
            { type: "heading", attrs: { level: 2 } },
            { type: "heading", attrs: { level: 3 } }
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

  it.each([
    ["single-item accordion", createSingleItemAccordionDocseraDocumentEnvelope()],
    ["multi-item accordion", createMultiItemAccordionDocseraDocumentEnvelope()]
  ])("round-trips the canonical %s without transient disclosure state", (_label, envelope) => {
    const parsed = parseDocseraDocument(serializeDocseraDocument(envelope));

    expect(parsed).toEqual({
      ok: true,
      envelope,
      migratedLegacyDocument: false
    });

    const serialized = JSON.stringify(envelope);
    expect(serialized).not.toContain("\"open\"");
    expect(serialized).not.toContain("\"name\"");
    expect(serialized).not.toContain("\"groupName\"");
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

  it("collects accordion title and body text in order during plain-text extraction", () => {
    const text = extractPlainTextFromServerDocument(createSingleItemAccordionDocseraDocumentEnvelope());

    expect(text).toBe("Overview\nAccordion body");
  });
});


