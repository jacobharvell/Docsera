import { Fragment } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import {
  createFourColumnDocseraDocumentEnvelope,
  createThreeColumnDocseraDocumentEnvelope,
  createTwoColumnDocseraDocumentEnvelope
} from "./documentFixtures";
import { DOCSERA_DOCUMENT_SCHEMA_VERSION, parseDocseraDocument, serializeDocseraDocument } from "./document";
import { extractPlainTextFromServerDocument, validateDocseraStructuredDocument } from "../../server/pages/serverEditorDocument";
import { getDocseraEditorSchema } from "./schema";

function createColumnNode(content: Record<string, unknown>[] = []): Record<string, unknown> {
  const columnNode: Record<string, unknown> = {
    type: "column"
  };

  if (content.length > 0) {
    columnNode.content = content;
  }

  return columnNode;
}

function createParagraphNode(text: string): Record<string, unknown> {
  return {
    type: "paragraph",
    content: [{ type: "text", text }]
  };
}

function createAccordionNode(title: string, bodyText: string): Record<string, unknown> {
  return {
    type: "accordion",
    attrs: {
      accordionId: "accordion-in-column"
    },
    content: [
      {
        type: "accordionItem",
        attrs: {
          accordionItemId: "accordion-item-in-column"
        },
        content: [
          {
            type: "accordionTitle",
            content: [{ type: "text", text: title }]
          },
          {
            type: "accordionContent",
            content: [createParagraphNode(bodyText)]
          }
        ]
      }
    ]
  };
}

function omitUndefinedAttrs(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(omitUndefinedAttrs);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const entries = Object.entries(value)
    .map(([key, entryValue]) => [key, omitUndefinedAttrs(entryValue)] as const)
    .filter(([key, entryValue]) => {
      if (entryValue === undefined) {
        return false;
      }
      return !(key === "attrs" && typeof entryValue === "object" && entryValue !== null && Object.keys(entryValue).length === 0);
    });

  return Object.fromEntries(entries);
}

function createAccordionColumnsNode(columnCount: 2 | 3 | 4, titlePrefix: string): Record<string, unknown> {
  return {
    type: "accordion",
    attrs: {
      accordionId: `accordion-${titlePrefix.toLowerCase().replace(/\s+/g, "-")}`
    },
    content: [
      {
        type: "accordionItem",
        attrs: {
          accordionItemId: `accordion-item-${titlePrefix.toLowerCase().replace(/\s+/g, "-")}`
        },
        content: [
          {
            type: "accordionTitle",
            content: [{ type: "text", text: `${titlePrefix} ${columnCount}` }]
          },
          {
            type: "accordionContent",
            content: [
              {
                type: "columns",
                content: Array.from({ length: columnCount }, (_, index) =>
                  createColumnNode([
                    createParagraphNode(`${titlePrefix} column ${index + 1}`)
                  ])
                )
              }
            ]
          }
        ]
      }
    ]
  };
}

function createAccordionUnderColumnWithColumnsDocument(): Record<string, unknown> {
  return {
    type: "doc",
    content: [
      {
        type: "columns",
        content: [
          {
            type: "column",
            content: [
              {
                type: "accordion",
                attrs: {
                  accordionId: "accordion-under-column-with-columns"
                },
                content: [
                  {
                    type: "accordionItem",
                    attrs: {
                      accordionItemId: "accordion-item-under-column-with-columns"
                    },
                    content: [
                      {
                        type: "accordionTitle",
                        content: [{ type: "text", text: "Accordion" }]
                      },
                      {
                        type: "accordionContent",
                        content: [
                          {
                            type: "columns",
                            content: [
                              createColumnNode([createParagraphNode("Nested left")]),
                              createColumnNode([createParagraphNode("Nested right")])
                            ]
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          },
          createColumnNode([createParagraphNode("Safe column")])
        ]
      }
    ]
  };
}

function createAccordionColumnsWithNestedAccordionDocument(): Record<string, unknown> {
  return {
    type: "doc",
    content: [
      {
        type: "accordion",
        attrs: {
          accordionId: "accordion-nested-under-columns"
        },
        content: [
          {
            type: "accordionItem",
            attrs: {
              accordionItemId: "accordion-item-nested-under-columns"
            },
            content: [
              {
                type: "accordionTitle",
                content: [{ type: "text", text: "Accordion body" }]
              },
              {
                type: "accordionContent",
                content: [
                  {
                    type: "columns",
                    content: [
                      createColumnNode([createAccordionNode("Nested accordion", "Nested body")]),
                      createColumnNode([createParagraphNode("Safe column")])
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  };
}

function createNestedColumnsDocument(): Record<string, unknown> {
  return {
    type: "doc",
    content: [
      {
        type: "columns",
        content: [
          {
            type: "column",
            content: [
              {
                type: "blockquote",
                content: [
                  {
                    type: "columns",
                    content: [createColumnNode([createParagraphNode("Nested")]), createColumnNode([createParagraphNode("Nested 2")])]
                  }
                ]
              }
            ]
          },
          createColumnNode([createParagraphNode("Valid")])
        ]
      }
    ]
  };
}

function createWrongCountColumnsDocument(columnCount: number): Record<string, unknown> {
  return {
    type: "doc",
    content: [
      {
        type: "columns",
        content: Array.from({ length: columnCount }, (_, index) =>
          createColumnNode([createParagraphNode(`Column ${index + 1}`)])
        )
      }
    ]
  };
}

function createZeroChildColumnsDocument(): Record<string, unknown> {
  return {
    type: "doc",
    content: [
      {
        type: "columns",
        content: [createColumnNode([createParagraphNode("Left")]), createColumnNode(), createColumnNode([createParagraphNode("Right")])]
      }
    ]
  };
}

describe("Docsera columns schema", () => {
  it("registers a top-level-only canonical Columns node family without structural attrs", () => {
    const schema = getDocseraEditorSchema();

    expect(schema.nodes.doc?.spec.content).toBe("(block | columns)*");
    expect(schema.nodes.columns).toBeDefined();
    expect(schema.nodes.column).toBeDefined();
    expect(schema.nodes.columns?.spec.group).toBeUndefined();
    expect(schema.nodes.column?.spec.group).toBeUndefined();
    expect(schema.nodes.columns?.spec.content).toBe("column{2,4}");
    expect(schema.nodes.column?.spec.content).toBe(
      "(paragraph | heading | image | bulletList | orderedList | taskList | blockquote | horizontalRule | codeBlock | table | accordion)+"
    );
  });

  it.each([
    ["two-column document", createTwoColumnDocseraDocumentEnvelope()],
    ["three-column document with an empty middle column", createThreeColumnDocseraDocumentEnvelope()],
    ["four-column document", createFourColumnDocseraDocumentEnvelope()]
  ])("round-trips the canonical %s without changing structure", (_label, envelope) => {
    const parsed = parseDocseraDocument(serializeDocseraDocument(envelope));

    expect(parsed).toEqual({
      ok: true,
      envelope,
      migratedLegacyDocument: false
    });

    expect(validateDocseraStructuredDocument(envelope.document)).toEqual({ ok: true });
  });

  it.each([
    ["two-column document", createTwoColumnDocseraDocumentEnvelope()],
    ["three-column document with an empty middle column", createThreeColumnDocseraDocumentEnvelope()],
    ["four-column document", createFourColumnDocseraDocumentEnvelope()]
  ])("loads the canonical %s through the Docsera editor schema", (_label, envelope) => {
    const schema = getDocseraEditorSchema();
    const node = schema.nodeFromJSON(envelope.document);

    expect(omitUndefinedAttrs(node.toJSON())).toEqual(envelope.document);
    expect(schema.nodes.doc?.validContent(node.content)).toBe(true);
  });

  it.each<[2 | 3 | 4]>([[2], [3], [4]])(
    "accepts canonical %s-column accordion bodies and round-trips them through the Docsera schema",
    (columnCount) => {
      const envelope = {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
          type: "doc",
          content: [
            createAccordionColumnsNode(columnCount, "Accordion body")
          ]
        }
      };
      const schema = getDocseraEditorSchema();
      const parsed = parseDocseraDocument(serializeDocseraDocument(envelope));
      const node = schema.nodeFromJSON(envelope.document);

      expect(validateDocseraStructuredDocument(envelope.document)).toEqual({ ok: true });
      expect(parsed).toEqual({
        ok: true,
        envelope,
        migratedLegacyDocument: false
      });
      expect(omitUndefinedAttrs(node.toJSON())).toEqual(envelope.document);
      expect(schema.nodes.doc?.validContent(node.content)).toBe(true);
      const accordionContentNode = node.firstChild?.firstChild?.lastChild;
      expect(accordionContentNode?.type.name).toBe("accordionContent");
      expect(schema.nodes.accordionContent?.validContent(accordionContentNode?.content ?? Fragment.empty)).toBe(true);
    }
  );

  it("accepts canonical accordion content inside a column and round-trips it through the Docsera schema", () => {
    const envelope = {
      schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
      document: {
        type: "doc",
        content: [
          {
            type: "columns",
            content: [
              {
                type: "column",
                content: [
                  createParagraphNode("Column lead"),
                  createAccordionNode("Column accordion", "Accordion body"),
                  createParagraphNode("Column tail")
                ]
              },
              createColumnNode([createParagraphNode("Second column")])
            ]
          }
        ]
      }
    };
    const schema = getDocseraEditorSchema();
    const parsed = parseDocseraDocument(serializeDocseraDocument(envelope));
    const node = schema.nodeFromJSON(envelope.document);

    expect(validateDocseraStructuredDocument(envelope.document)).toEqual({ ok: true });
    expect(parsed).toEqual({
      ok: true,
      envelope,
      migratedLegacyDocument: false
    });
    expect(omitUndefinedAttrs(node.toJSON())).toEqual(envelope.document);
    expect(schema.nodes.doc?.validContent(node.content)).toBe(true);
  });

  it("rejects accordion-body columns that contain another accordion beneath a column ancestor", () => {
    const document = createAccordionColumnsWithNestedAccordionDocument();

    expect(validateDocseraStructuredDocument(document)).toEqual({
      ok: false,
      message: "The stored page content does not contain a valid TipTap document."
    });
    expect(parseDocseraDocument({ schemaVersion: 1, document })).toMatchObject({
      ok: false,
      reason: "invalid-document"
    });
  });

  it("rejects accordion-body columns beneath a column ancestor", () => {
    const document = createAccordionUnderColumnWithColumnsDocument();

    expect(validateDocseraStructuredDocument(document)).toEqual({
      ok: false,
      message: "The stored page content does not contain a valid TipTap document."
    });
    expect(parseDocseraDocument({ schemaVersion: 1, document })).toMatchObject({
      ok: false,
      reason: "invalid-document"
    });
  });

  it("preserves plain-text traversal order across column tracks", () => {
    const text = extractPlainTextFromServerDocument(createFourColumnDocseraDocumentEnvelope());

    expect(text).toBe("North\nEast\nSouth\nWest");
  });

  it.each([
    ["single-column columns node", createWrongCountColumnsDocument(1)],
    ["five-column columns node", createWrongCountColumnsDocument(5)],
    ["indirect nested columns beneath a blockquote", createNestedColumnsDocument()]
  ])("rejects %s instead of repairing it", (_label, document) => {
    expect(validateDocseraStructuredDocument(document)).toEqual({
      ok: false,
      message: "The stored page content does not contain a valid TipTap document."
    });

    expect(parseDocseraDocument({ schemaVersion: 1, document })).toMatchObject({
      ok: false,
      reason: "invalid-document"
    });
  });

  it("rejects zero-child columns at the validation boundary and through the schema", () => {
    const document = createZeroChildColumnsDocument();
    const schema = getDocseraEditorSchema();

    expect(validateDocseraStructuredDocument(document)).toEqual({
      ok: false,
      message: "The stored page content does not contain a valid TipTap document."
    });

    expect(parseDocseraDocument({ schemaVersion: 1, document })).toMatchObject({
      ok: false,
      reason: "invalid-document"
    });

    expect(() => schema.nodeFromJSON(document).check()).toThrow();
  });
});
