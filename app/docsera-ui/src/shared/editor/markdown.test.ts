import {
  parseDocseraMarkdownDocument,
  serializeDocseraMarkdownDocument
} from "./markdown";
import {
  createCanonicalDocseraDocumentEnvelope,
  createCodeBlockWhitespaceDocseraDocumentEnvelope,
  createCombinedInlineMarksDocseraDocumentEnvelope,
  createExpandedTextFormattingDocseraDocumentEnvelope,
  createFourColumnDocseraDocumentEnvelope,
  createMultiItemAccordionDocseraDocumentEnvelope,
  createNestedTableDocseraDocumentEnvelope,
  createNestedTaskListDocseraDocumentEnvelope,
  createOrderedListDefaultAttrsDocseraDocumentEnvelope,
  createRelativeLinkDocseraDocumentEnvelope,
  createSingleItemAccordionDocseraDocumentEnvelope,
  createStandardTableDocseraDocumentEnvelope,
  createSupportedE2DocseraDocumentEnvelope,
  createThreeColumnDocseraDocumentEnvelope,
  createTwoColumnDocseraDocumentEnvelope
} from "./documentFixtures";
import {
  createCanonicalImageDocseraDocumentEnvelope,
  createResponsiveImageDocseraDocumentEnvelope
} from "./imageFixtures";

function createEmptyDocumentEnvelope() {
  return {
    schemaVersion: 1 as const,
    document: {
      type: "doc" as const,
      content: []
    }
  };
}

function createImageEscapingEnvelope() {
  return {
    schemaVersion: 1 as const,
    document: {
      type: "doc" as const,
      content: [
        {
          type: "image" as const,
          attrs: {
            mediaId: "workspace-media-escape",
            darkMediaId: "workspace-media-dark",
            alt: "Quote \" and ampersand & and newline\nvalue",
            caption: "Tab\tand return\rvalue",
            frame: false,
            align: "right" as const,
            widthPct: 75
          }
        }
      ]
    }
  };
}

function createNonDefaultLinkEnvelope() {
  return {
    schemaVersion: 1 as const,
    document: {
      type: "doc" as const,
      content: [
        {
          type: "paragraph" as const,
          content: [
            {
              type: "text" as const,
              text: "Custom link",
              marks: [
                {
                  type: "link" as const,
                  attrs: {
                    href: "https://example.com/custom",
                    target: "_self",
                    rel: "nofollow",
                    class: "docsera-link",
                    title: "Custom"
                  }
                }
              ]
            }
          ]
        }
      ]
    }
  };
}

function createNullMetadataLinkEnvelope() {
  return {
    schemaVersion: 1 as const,
    document: {
      type: "doc" as const,
      content: [
        {
          type: "paragraph" as const,
          content: [
            {
              type: "text" as const,
              text: "Null metadata link",
              marks: [
                {
                  type: "link" as const,
                  attrs: {
                    href: "https://example.com/nulls",
                    target: null,
                    rel: null,
                    class: null,
                    title: null
                  }
                }
              ]
            }
          ]
        }
      ]
    }
  };
}

function createOrderedListTypeOneEnvelope() {
  return {
    schemaVersion: 1 as const,
    document: {
      type: "doc" as const,
      content: [
        {
          type: "orderedList" as const,
          attrs: { start: 4, type: "1" as const },
          content: [
            {
              type: "listItem" as const,
              content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "Numeric type preserved" }] }]
            }
          ]
        }
      ]
    }
  };
}

function createOrdinaryGfmTableEnvelope() {
  return {
    schemaVersion: 1 as const,
    document: {
      type: "doc" as const,
      content: [
        {
          type: "table" as const,
          content: [
            {
              type: "tableRow" as const,
              content: [
                {
                  type: "tableHeader" as const,
                  attrs: { colspan: 1, rowspan: 1, colwidth: null },
                  content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "Name" }] }]
                },
                {
                  type: "tableHeader" as const,
                  attrs: { colspan: 1, rowspan: 1, colwidth: null, align: "center" as const },
                  content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "Status" }] }]
                }
              ]
            },
            {
              type: "tableRow" as const,
              content: [
                {
                  type: "tableCell" as const,
                  attrs: { colspan: 1, rowspan: 1, colwidth: null },
                  content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "Alpha | Beta" }] }]
                },
                {
                  type: "tableCell" as const,
                  attrs: { colspan: 1, rowspan: 1, colwidth: null, align: "center" as const },
                  content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "Ready" }] }]
                }
              ]
            }
          ]
        }
      ]
    }
  };
}

function createGfmCompatibleTableWithParagraphAlignmentEnvelope() {
  return {
    schemaVersion: 1 as const,
    document: {
      type: "doc" as const,
      content: [
        {
          type: "table" as const,
          content: [
            {
              type: "tableRow" as const,
              content: [
                {
                  type: "tableHeader" as const,
                  attrs: { colspan: 1, rowspan: 1, colwidth: null },
                  content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "Feature" }] }]
                },
                {
                  type: "tableHeader" as const,
                  attrs: { colspan: 1, rowspan: 1, colwidth: null, align: "right" as const },
                  content: [
                    {
                      type: "paragraph" as const,
                      attrs: { textAlign: "center" as const },
                      content: [{ type: "text" as const, text: "Status" }]
                    }
                  ]
                }
              ]
            },
            {
              type: "tableRow" as const,
              content: [
                {
                  type: "tableCell" as const,
                  attrs: { colspan: 1, rowspan: 1, colwidth: null },
                  content: [
                    {
                      type: "paragraph" as const,
                      attrs: { textAlign: "right" as const },
                      content: [{ type: "text" as const, text: "Alpha" }]
                    }
                  ]
                },
                {
                  type: "tableCell" as const,
                  attrs: { colspan: 1, rowspan: 1, colwidth: null, align: "right" as const },
                  content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "Ready" }] }]
                }
              ]
            }
          ]
        }
      ]
    }
  };
}

function createMarkdownDocumentSource(title: string, body: string): string {
  return `---\ntitle: ${JSON.stringify(title)}\n---\n${body}`;
}

function createCodeBlockEnvelope(text: string, language: string | null = "typescript") {
  return {
    schemaVersion: 1 as const,
    document: {
      type: "doc" as const,
      content: [
        {
          type: "codeBlock" as const,
          attrs: { language },
          content: text.length > 0 ? [{ type: "text" as const, text }] : []
        }
      ]
    }
  };
}

function createDirectiveLookingProseEnvelope(text: string) {
  return {
    schemaVersion: 1 as const,
    document: {
      type: "doc" as const,
      content: [
        {
          type: "paragraph" as const,
          content: [{ type: "text" as const, text }]
        }
      ]
    }
  };
}

function createEscapingHeavyLinkEnvelope() {
  return {
    schemaVersion: 1 as const,
    document: {
      type: "doc" as const,
      content: [
        {
          type: "paragraph" as const,
          content: [
            {
              type: "text" as const,
              text: "Anchor metadata",
              marks: [
                {
                  type: "link" as const,
                  attrs: {
                    href: "https://example.com/query?left=1&right=2",
                    target: 'quote "target"\nline\tcolumn\rslash\\ampersand &',
                    rel: 'rel "value"\nnext\trow\r\\\\',
                    class: 'class "value"\nnext\trow\r\\\\',
                    title: 'title "value"\nnext\trow\r\\\\&'
                  }
                }
              ]
            }
          ]
        }
      ]
    }
  };
}

function createMarkedTextEnvelope(
  text: string,
  marks: readonly { type: string; attrs?: Record<string, unknown> }[]
) {
  return {
    schemaVersion: 1 as const,
    document: {
      type: "doc" as const,
      content: [
        {
          type: "paragraph" as const,
          content: [
            {
              type: "text" as const,
              text,
              marks
            }
          ]
        }
      ]
    }
  };
}

function createBoldUnderlineEnvelope() {
  return createMarkedTextEnvelope("Mixed mark", [{ type: "bold" as const }, { type: "underline" as const }]);
}

function createUnderlineBoldEnvelope() {
  return createMarkedTextEnvelope("Mixed mark", [{ type: "underline" as const }, { type: "bold" as const }]);
}

function createBoldLinkEnvelope() {
  return createMarkedTextEnvelope("Mixed link", [
    { type: "bold" as const },
    {
      type: "link" as const,
      attrs: {
        href: "https://example.com/mixed",
        target: "_self",
        rel: "nofollow",
        class: "docsera-link",
        title: "Custom"
      }
    }
  ]);
}

function createLinkBoldEnvelope() {
  return createMarkedTextEnvelope("Mixed link", [
    {
      type: "link" as const,
      attrs: {
        href: "https://example.com/mixed",
        target: "_self",
        rel: "nofollow",
        class: "docsera-link",
        title: "Custom"
      }
    },
    { type: "bold" as const }
  ]);
}

function createReverseOrderedMarksEnvelope() {
  return {
    schemaVersion: 1 as const,
    document: {
      type: "doc" as const,
      content: [
        {
          type: "paragraph" as const,
          content: [
            {
              type: "text" as const,
              text: "Reverse ordered marks",
              marks: [{ type: "strike" as const }, { type: "italic" as const }, { type: "bold" as const }]
            }
          ]
        }
      ]
    }
  };
}

function createEmptyHeadingEnvelope(level: 1 | 2 | 3) {
  return {
    schemaVersion: 1 as const,
    document: {
      type: "doc" as const,
      content: [
        {
          type: "heading" as const,
          attrs: { level }
        }
      ]
    }
  };
}

function createNestedColumnsInAccordionEnvelope() {
  return {
    schemaVersion: 1 as const,
    document: {
      type: "doc" as const,
      content: [
        {
          type: "accordion" as const,
          attrs: { accordionId: "accordion-columns-body" },
          content: [
            {
              type: "accordionItem" as const,
              attrs: { accordionItemId: "accordion-item-columns-body" },
              content: [
                {
                  type: "accordionTitle" as const,
                  content: [{ type: "text" as const, text: "Accordion" }]
                },
                {
                  type: "accordionContent" as const,
                  content: [
                    {
                      type: "columns" as const,
                      content: [
                        {
                          type: "column" as const,
                          content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "Left" }] }]
                        },
                        {
                          type: "column" as const,
                          content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "Right" }] }]
                        }
                      ]
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
}

function createAccordionInColumnEnvelope() {
  return {
    schemaVersion: 1 as const,
    document: {
      type: "doc" as const,
      content: [
        {
          type: "columns" as const,
          content: [
            {
              type: "column" as const,
              content: [
                {
                  type: "accordion" as const,
                  attrs: { accordionId: "accordion-columns-under-column" },
                  content: [
                    {
                      type: "accordionItem" as const,
                      attrs: { accordionItemId: "accordion-item-columns-under-column" },
                      content: [
                        {
                          type: "accordionTitle" as const,
                          content: [{ type: "text" as const, text: "Accordion" }]
                        },
                        {
                          type: "accordionContent" as const,
                          content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "Accordion body" }] }]
                        }
                      ]
                    }
                  ]
                }
              ]
            },
            {
              type: "column" as const,
              content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "Safe column" }] }]
            }
          ]
        }
      ]
    }
  };
}

function createNullLanguageCodeBlockEnvelope() {
  return {
    schemaVersion: 1 as const,
    document: {
      type: "doc" as const,
      content: [
        {
          type: "codeBlock" as const,
          attrs: { language: null },
          content: [{ type: "text" as const, text: "plain text\n" }]
        }
      ]
    }
  };
}

function createCalloutEnvelope(type: "info" | "warning" | "success" | "error", title: string | null) {
  return {
    schemaVersion: 1 as const,
    document: {
      type: "doc" as const,
      content: [
        {
          type: "callout" as const,
          attrs: { type, title },
          content: [
            {
              type: "paragraph" as const,
              content: [{ type: "text" as const, text: `${type} body` }]
            },
            {
              type: "bulletList" as const,
              content: [
                {
                  type: "listItem" as const,
                  content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "Nested item" }] }]
                }
              ]
            },
            {
              type: "codeBlock" as const,
              attrs: { language: "ts" },
              content: [{ type: "text" as const, text: "const safe = true;" }]
            }
          ]
        }
      ]
    }
  };
}

function createEscapedAccordionIdsEnvelope() {
  return {
    schemaVersion: 1 as const,
    document: {
      type: "doc" as const,
      content: [
        {
          type: "accordion" as const,
          attrs: { accordionId: "accordion-\"&\n\t\r-root" },
          content: [
            {
              type: "accordionItem" as const,
              attrs: { accordionItemId: "item-\"&\n\t\r-child" },
              content: [
                {
                  type: "accordionTitle" as const,
                  content: [{ type: "text" as const, text: "Escaped ids" }]
                },
                {
                  type: "accordionContent" as const,
                  content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "Body" }] }]
                }
              ]
            }
          ]
        }
      ]
    }
  };
}

function createDirectiveFenceStressEnvelope() {
  return {
    schemaVersion: 1 as const,
    document: {
      type: "doc" as const,
      content: [
        {
          type: "columns" as const,
          content: [
            {
              type: "column" as const,
              content: [
                {
                  type: "codeBlock" as const,
                  attrs: { language: "md" },
                  content: [{ type: "text" as const, text: ":::docsera-image\n:::\n" }]
                }
              ]
            },
            {
              type: "column" as const,
              content: [
                {
                  type: "paragraph" as const,
                  content: [{ type: "text" as const, text: "Safe sibling" }]
                }
              ]
            }
          ]
        }
      ]
    }
  };
}

describe("Docsera Markdown conversion contract", () => {
  it("round-trips Docsera text and highlight palette colors losslessly through Markdown Source", () => {
    const envelope = {
      schemaVersion: 1 as const,
      document: {
        type: "doc" as const,
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Color",
                marks: [
                  { type: "bold" },
                  { type: "textColor", attrs: { color: "blue" } },
                  { type: "highlightColor", attrs: { color: "yellow" } }
                ]
              },
              {
                type: "text",
                text: " and default",
                marks: [{ type: "highlight" }]
              }
            ]
          }
        ]
      }
    };

    const serialized = serializeDocseraMarkdownDocument("Markdown Contract", envelope);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) {
      return;
    }
    expect(serialized.markdown).toContain('<span data-docsera-text-color="blue">');
    expect(serialized.markdown).toContain('<mark data-docsera-highlight-color="yellow">');
    expect(serialized.markdown).toContain("<mark> and default</mark>");

    const parsed = parseDocseraMarkdownDocument(serialized.markdown);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }
    expect(parsed.envelope).toEqual(envelope);

    for (const markdown of [
      '---\ntitle: "Bad"\n---\n<span style="color:red">Nope</span>\n',
      '---\ntitle: "Bad"\n---\n<span data-docsera-text-color="teal">Nope</span>\n',
      '---\ntitle: "Bad"\n---\n<span data-docsera-text-color="blue" class="x">Nope</span>\n',
      '---\ntitle: "Bad"\n---\n<mark data-docsera-highlight-color="#ff0">Nope</mark>\n',
      '---\ntitle: "Bad"\n---\n<mark data-docsera-text-color="blue">Nope</mark>\n'
    ]) {
      expect(parseDocseraMarkdownDocument(markdown).ok).toBe(false);
    }
  });

  it("round-trips non-default paragraph and heading alignment through docsera-text-align directives", () => {
    const envelope = {
      schemaVersion: 1 as const,
      document: {
        type: "doc" as const,
        content: [
          {
            type: "paragraph",
            attrs: { textAlign: "center" },
            content: [{ type: "text", text: "Centered paragraph" }]
          },
          {
            type: "heading",
            attrs: { level: 2, textAlign: "right" },
            content: [{ type: "text", text: "Right heading" }]
          },
          {
            type: "paragraph",
            content: [{ type: "text", text: "Ordinary left paragraph" }]
          },
          {
            type: "heading",
            attrs: { level: 3 },
            content: [{ type: "text", text: "Ordinary left heading" }]
          }
        ]
      }
    };

    const serialized = serializeDocseraMarkdownDocument(title, envelope);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) {
      return;
    }

    expect(serialized.markdown).toContain(':::docsera-text-align{align="center"}');
    expect(serialized.markdown).toContain(':::docsera-text-align{align="right"}');
    expect(serialized.markdown).not.toContain('align="left"');
    expect(serialized.markdown).toContain("Centered paragraph");
    expect(serialized.markdown).toContain("## Right heading");

    expect(parseDocseraMarkdownDocument(serialized.markdown)).toEqual({
      ok: true,
      title,
      markdown: serialized.markdown,
      envelope: serialized.envelope
    });
  });

  it("normalizes an explicit-left docsera-text-align directive back to ordinary Markdown", () => {
    const parsed = parseDocseraMarkdownDocument(
      createMarkdownDocumentSource(
        "Left wrapper",
        ":::docsera-text-align{align=\"left\"}\nLeft paragraph\n:::\n"
      )
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.envelope.document).toEqual({
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "Left paragraph" }] }]
    });
    expect(parsed.markdown).not.toContain("docsera-text-align");
  });

  it("rejects malformed or unsupported docsera-text-align directives", () => {
    for (const body of [
      ":::docsera-text-align{align=\"justify\"}\nNope\n:::\n",
      ":::docsera-text-align{align=\"center\" extra=\"1\"}\nNope\n:::\n",
      ":::docsera-text-align{align=\"center\"}\n* List\n:::\n",
      ":::docsera-text-align{align=\"center\"}\nFirst\n\nSecond\n:::\n",
      ":::docsera-text-align{align=\"right\"}\n:::\n"
    ]) {
      expect(parseDocseraMarkdownDocument(createMarkdownDocumentSource("Bad alignment", body))).toMatchObject({
        ok: false,
        reason: "invalid-directive"
      });
    }
  });

  const title = "Markdown Contract";

  it.each([
    createCanonicalDocseraDocumentEnvelope(),
    createSupportedE2DocseraDocumentEnvelope(),
    createExpandedTextFormattingDocseraDocumentEnvelope(),
    createNestedTaskListDocseraDocumentEnvelope(),
    createCodeBlockWhitespaceDocseraDocumentEnvelope(),
    createCodeBlockEnvelope("plain text"),
    createCodeBlockEnvelope("plain text\n"),
    createCodeBlockEnvelope("plain text\n\n"),
    createCodeBlockEnvelope("", null),
    createCombinedInlineMarksDocseraDocumentEnvelope(),
    createCanonicalImageDocseraDocumentEnvelope(),
    createResponsiveImageDocseraDocumentEnvelope(),
    createSingleItemAccordionDocseraDocumentEnvelope(),
    createMultiItemAccordionDocseraDocumentEnvelope(),
    createEmptyHeadingEnvelope(1),
    createEmptyHeadingEnvelope(2),
    createEmptyHeadingEnvelope(3),
    createTwoColumnDocseraDocumentEnvelope(),
    createThreeColumnDocseraDocumentEnvelope(),
    createFourColumnDocseraDocumentEnvelope(),
    createRelativeLinkDocseraDocumentEnvelope(),
    createOrderedListDefaultAttrsDocseraDocumentEnvelope(),
    createStandardTableDocseraDocumentEnvelope(),
    createNestedTableDocseraDocumentEnvelope(),
    createImageEscapingEnvelope(),
    createNonDefaultLinkEnvelope(),
    createNullMetadataLinkEnvelope(),
    createOrderedListTypeOneEnvelope(),
    createOrdinaryGfmTableEnvelope(),
    createNullLanguageCodeBlockEnvelope(),
    createCalloutEnvelope("info", null),
    createCalloutEnvelope("warning", "Watch this"),
    createCalloutEnvelope("success", "Done"),
    createCalloutEnvelope("error", "Broken"),
    createEscapedAccordionIdsEnvelope(),
    createEscapingHeavyLinkEnvelope(),
    createBoldUnderlineEnvelope(),
    createUnderlineBoldEnvelope(),
    createBoldLinkEnvelope(),
    createLinkBoldEnvelope(),
    createDirectiveLookingProseEnvelope("::docsera-empty-document"),
    createDirectiveLookingProseEnvelope("::unknown"),
    createDirectiveLookingProseEnvelope(":::unknown"),
    createDirectiveLookingProseEnvelope("::hello"),
    createDirectiveLookingProseEnvelope("::docsera-column"),
    createDirectiveLookingProseEnvelope(":::docsera-table-cell"),
    createNestedColumnsInAccordionEnvelope(),
    createAccordionInColumnEnvelope(),
    createDirectiveFenceStressEnvelope(),
    createEmptyDocumentEnvelope()
  ])("round-trips canonical title and envelope %#", (envelope) => {
    const serialized = serializeDocseraMarkdownDocument(title, envelope);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) {
      return;
    }

    const parsed = parseDocseraMarkdownDocument(serialized.markdown);
    expect(parsed).toEqual({
      ok: true,
      title,
      envelope: serialized.envelope,
      markdown: serialized.markdown
    });
  });

  it("serializes the normal empty page as frontmatter plus an empty body and parses it back to one empty paragraph", () => {
    const serialized = serializeDocseraMarkdownDocument(title, {
      schemaVersion: 1,
      document: { type: "doc", content: [{ type: "paragraph" }] }
    });

    expect(serialized).toMatchObject({
      ok: true,
      markdown: "---\ntitle: \"Markdown Contract\"\n---\n"
    });
    if (!serialized.ok) {
      return;
    }

    expect(parseDocseraMarkdownDocument(serialized.markdown)).toEqual({
      ok: true,
      title,
      markdown: serialized.markdown,
      envelope: {
        schemaVersion: 1,
        document: { type: "doc", content: [{ type: "paragraph" }] }
      }
    });
  });

  it("parses a lone markdown marker as editable prose instead of an invalid empty list", () => {
    const parsed = parseDocseraMarkdownDocument(createMarkdownDocumentSource("Standalone marker", "*\n"));

    expect(parsed).toMatchObject({
      ok: true,
      title: "Standalone marker",
      envelope: {
        schemaVersion: 1,
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "*" }]
            }
          ]
        }
      }
    });
    if (!parsed.ok) {
      return;
    }

    expect(parsed.markdown).toContain('title: "Standalone marker"');
    expect(parsed.markdown).toContain("\\*");
  });

  it("serializes a true zero-child document with the explicit empty-document directive", () => {
    const serialized = serializeDocseraMarkdownDocument(title, createEmptyDocumentEnvelope());
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) {
      return;
    }

    expect(serialized.markdown).toContain("::docsera-empty-document");
  });

  it("preserves interstitial and consecutive empty paragraphs", () => {
    const envelope = {
      schemaVersion: 1 as const,
      document: {
        type: "doc" as const,
        content: [
          { type: "paragraph" as const, content: [{ type: "text" as const, text: "Before" }] },
          { type: "paragraph" as const },
          { type: "paragraph" as const },
          { type: "paragraph" as const, content: [{ type: "text" as const, text: "After" }] }
        ]
      }
    };

    const serialized = serializeDocseraMarkdownDocument(title, envelope);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) {
      return;
    }

    expect(serialized.markdown.match(/docsera-empty-paragraph/g)).toHaveLength(2);
    expect(parseDocseraMarkdownDocument(serialized.markdown)).toEqual({
      ok: true,
      title,
      markdown: serialized.markdown,
      envelope
    });
  });

  it("uses normal Markdown links for default Docsera link metadata and HTML anchors for non-default metadata", () => {
    const defaultLink = serializeDocseraMarkdownDocument(title, createRelativeLinkDocseraDocumentEnvelope());
    const customLink = serializeDocseraMarkdownDocument(title, createNonDefaultLinkEnvelope());
    const nullMetadataLink = serializeDocseraMarkdownDocument(title, createNullMetadataLinkEnvelope());

    expect(defaultLink.ok).toBe(true);
    expect(customLink.ok).toBe(true);
    expect(nullMetadataLink.ok).toBe(true);
    if (!defaultLink.ok || !customLink.ok || !nullMetadataLink.ok) {
      return;
    }

    expect(defaultLink.markdown).toContain("[Relative link](./getting-started?mode=edit#overview \"Open guide\")");
    expect(customLink.markdown).toContain("<a ");
    expect(customLink.markdown).toContain("target=\"_self\"");
    expect(customLink.markdown).toContain("class=\"docsera-link\"");
    expect(nullMetadataLink.markdown).toContain("target=null");
    expect(nullMetadataLink.markdown).toContain("rel=null");
    expect(nullMetadataLink.markdown).toContain("title=null");
  });

  it("round-trips escaping-sensitive non-default link metadata losslessly", () => {
    const serialized = serializeDocseraMarkdownDocument(title, createEscapingHeavyLinkEnvelope());

    expect(serialized.ok).toBe(true);
    if (!serialized.ok) {
      return;
    }

    expect(serialized.markdown).toContain('target="quote &quot;target&quot;&#10;line&#9;column&#13;slash&#92;ampersand &amp;"');
    expect(serialized.markdown).toContain('rel="rel &quot;value&quot;&#10;next&#9;row&#13;&#92;&#92;"');
    expect(serialized.markdown).toContain('class="class &quot;value&quot;&#10;next&#9;row&#13;&#92;&#92;"');
    expect(serialized.markdown).toContain('title="title &quot;value&quot;&#10;next&#9;row&#13;&#92;&#92;&amp;"');
    expect(parseDocseraMarkdownDocument(serialized.markdown)).toEqual({
      ok: true,
      title,
      markdown: serialized.markdown,
      envelope: createEscapingHeavyLinkEnvelope()
    });
  });

  it("round-trips canonical mark arrays without converter-owned reordering", () => {
    const envelope = createReverseOrderedMarksEnvelope();
    const serialized = serializeDocseraMarkdownDocument(title, envelope);

    expect(serialized.ok).toBe(true);
    if (!serialized.ok) {
      return;
    }

    expect(serialized.envelope).toEqual(envelope);
    expect(serialized.markdown).toContain("~~_**Reverse ordered marks**_~~");
    expect(parseDocseraMarkdownDocument(serialized.markdown)).toEqual({
      ok: true,
      title,
      markdown: serialized.markdown,
      envelope: serialized.envelope
    });
  });

  it.each([
    {
      source: createMarkdownDocumentSource("Markdown Contract", "**<u>Mixed mark</u>**\n"),
      expected: createBoldUnderlineEnvelope()
    },
    {
      source: createMarkdownDocumentSource("Markdown Contract", "<u>**Mixed mark**</u>\n"),
      expected: createUnderlineBoldEnvelope()
    },
    {
      source: createMarkdownDocumentSource(
        "Markdown Contract",
        "**<a href=\"https://example.com/mixed\" target=\"_self\" rel=\"nofollow\" class=\"docsera-link\" title=\"Custom\">Mixed link</a>**\n"
      ),
      expected: createBoldLinkEnvelope()
    },
    {
      source: createMarkdownDocumentSource(
        "Markdown Contract",
        "<a href=\"https://example.com/mixed\" target=\"_self\" rel=\"nofollow\" class=\"docsera-link\" title=\"Custom\">**Mixed link**</a>\n"
      ),
      expected: createLinkBoldEnvelope()
    }
  ])("parses mixed markdown and HTML-backed mark order case %#", ({ source, expected }) => {
    const serialized = serializeDocseraMarkdownDocument("Markdown Contract", expected);
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) {
      return;
    }

    expect(parseDocseraMarkdownDocument(source)).toEqual({
      ok: true,
      title: "Markdown Contract",
      markdown: serialized.markdown,
      envelope: serialized.envelope
    });
  });

  it.each([
    "::docsera-empty-document[label]\n",
    ":::docsera-column[label]\n:::\n"
  ])("rejects unexpected directive labels on strict directive shapes %#", (body) => {
    const parsed = parseDocseraMarkdownDocument(createMarkdownDocumentSource("Bad directive label", body));

    expect(parsed).toMatchObject({
      ok: false,
      reason: "invalid-directive"
    });
  });

  it("rejects mixed task and plain list items rather than coercing the list shape", () => {
    const parsed = parseDocseraMarkdownDocument(
      createMarkdownDocumentSource("Mixed list", "- [x] Task item\n- Plain item\n")
    );

    expect(parsed).toMatchObject({
      ok: false,
      reason: "invalid-markdown"
    });
  });

  it("uses Docsera directive wrappers for canonical ordered-list types and rich tables while ordinary GFM tables stay ordinary", () => {
    const orderedList = serializeDocseraMarkdownDocument(title, {
      schemaVersion: 1,
      document: {
        type: "doc",
        content: [
          {
            type: "orderedList",
            attrs: { start: 3, type: "a" },
            content: [
              {
                type: "listItem",
                content: [{ type: "paragraph", content: [{ type: "text", text: "Lettered list" }] }]
              }
            ]
          }
        ]
      }
    });
    const orderedListTypeOne = serializeDocseraMarkdownDocument(title, createOrderedListTypeOneEnvelope());
    const richTable = serializeDocseraMarkdownDocument(title, createStandardTableDocseraDocumentEnvelope());
    const ordinaryTable = serializeDocseraMarkdownDocument(title, createOrdinaryGfmTableEnvelope());

    expect(orderedList.ok).toBe(true);
    expect(orderedListTypeOne.ok).toBe(true);
    expect(richTable.ok).toBe(true);
    expect(ordinaryTable.ok).toBe(true);
    if (!orderedList.ok || !orderedListTypeOne.ok || !richTable.ok || !ordinaryTable.ok) {
      return;
    }

    expect(orderedList.markdown).toContain("docsera-ordered-list");
    expect(orderedListTypeOne.markdown).toContain("docsera-ordered-list");
    expect(richTable.markdown).toContain("docsera-table");
    expect(richTable.markdown).toContain("docsera-table-header");
    expect(richTable.markdown).toContain("docsera-table-cell");
    expect(ordinaryTable.markdown).not.toContain("docsera-table");
    expect(ordinaryTable.markdown).toContain("| Name | Status |");
    expect(ordinaryTable.markdown).toContain("| Alpha \\| Beta | Ready |");
    expect(parseDocseraMarkdownDocument(ordinaryTable.markdown)).toEqual({
      ok: true,
      title,
      markdown: ordinaryTable.markdown,
      envelope: ordinaryTable.envelope
    });
  });

  it("uses rich Docsera tables when GFM-compatible cell paragraphs carry non-default text alignment", () => {
    const envelope = createGfmCompatibleTableWithParagraphAlignmentEnvelope();
    const serialized = serializeDocseraMarkdownDocument(title, envelope);

    expect(serialized.ok).toBe(true);
    if (!serialized.ok) {
      return;
    }

    expect(serialized.markdown).toContain("docsera-table");
    expect(serialized.markdown).toContain("docsera-table-header");
    expect(serialized.markdown).toContain("docsera-table-cell");
    expect(serialized.markdown).toContain('docsera-table-header{colspan=1 rowspan=1 colwidth=null align="right"}');
    expect(serialized.markdown).toContain('docsera-table-cell{colspan=1 rowspan=1 colwidth=null align="right"}');
    expect(serialized.markdown).toContain(':::docsera-text-align{align="center"}');
    expect(serialized.markdown).toContain(':::docsera-text-align{align="right"}');
    expect(serialized.markdown).not.toContain("| Feature | Status |");

    expect(parseDocseraMarkdownDocument(serialized.markdown)).toEqual({
      ok: true,
      title,
      markdown: serialized.markdown,
      envelope
    });
  });

  it("serializes unlabeled code blocks as unlabeled fences and preserves canonical null language", () => {
    const serialized = serializeDocseraMarkdownDocument(title, createNullLanguageCodeBlockEnvelope());
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) {
      return;
    }

    expect(serialized.markdown).toContain("```\nplain text\n\n```");
    expect(parseDocseraMarkdownDocument(serialized.markdown)).toEqual({
      ok: true,
      title,
      markdown: serialized.markdown,
      envelope: createNullLanguageCodeBlockEnvelope()
    });
  });

  it("uses sufficiently long directive fences when nested code contains directive-looking colon fences", () => {
    const serialized = serializeDocseraMarkdownDocument(title, createDirectiveFenceStressEnvelope());
    expect(serialized.ok).toBe(true);
    if (!serialized.ok) {
      return;
    }

    expect(serialized.markdown).toContain("::::docsera-columns");
    expect(serialized.markdown).toContain(":::docsera-image");
  });

  it("treats ordinary colon prose as ordinary text", () => {
    const parsed = parseDocseraMarkdownDocument(
      "---\n" +
        'title: "Colon prose"\n' +
        "---\n" +
        "\n" +
        "This stays prose: docsera-image and :: not-a-directive.\n"
    );

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      return;
    }

    expect(parsed.envelope.document).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "This stays prose: docsera-image and :: not-a-directive." }]
        }
      ]
    });
  });

  it.each(["::unknown", "::hello", "::unknown[label]{key=\"value\"}"])(
    "preserves non-Docsera leaf directive source as literal text: %s",
    (text) => {
      const parsed = parseDocseraMarkdownDocument(createMarkdownDocumentSource("Literal", `${text}\n`));
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;
      expect(parsed.envelope).toEqual(createDirectiveLookingProseEnvelope(text));
      const reparsed = parseDocseraMarkdownDocument(parsed.markdown);
      expect(reparsed).toEqual(parsed);
    }
  );

  it("preserves unknown container-looking text and subsequent paragraphs", () => {
    const source = createMarkdownDocumentSource("Literal", ":::unknown\n\nNext paragraph\n");
    const parsed = parseDocseraMarkdownDocument(source);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.envelope.document).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: ":::unknown" }] },
        { type: "paragraph", content: [{ type: "text", text: "Next paragraph" }] }
      ]
    });
    expect(parseDocseraMarkdownDocument(parsed.markdown)).toEqual(parsed);
    const serialized = serializeDocseraMarkdownDocument("Literal", parsed.envelope);
    expect(serialized.ok && serialized.markdown).toContain("\\:::unknown");
  });

  it("still rejects unknown Docsera directives after literal container-looking text", () => {
    const source = createMarkdownDocumentSource("Literal", ":::unknown\n\n:::docsera-unknown\n");
    const start = source.indexOf(":::docsera-unknown");
    expect(parseDocseraMarkdownDocument(source)).toMatchObject({
      ok: false, reason: "unknown-directive", range: { from: start, to: source.length }
    });
  });

  it("fails atomically on malformed frontmatter, unsupported HTML, and malformed Docsera directives", () => {
    expect(parseDocseraMarkdownDocument("title: nope\n")).toMatchObject({
      ok: false,
      reason: "invalid-frontmatter"
    });
    expect(
      parseDocseraMarkdownDocument("---\n" + 'title: "Bad html"\n' + "---\n\n" + "<span>unsupported</span>\n")
    ).toMatchObject({
      ok: false,
      reason: "unsupported-html"
    });
    expect(
      parseDocseraMarkdownDocument(
        "---\n" +
          'title: "Bad directive"\n' +
          "---\n\n" +
          ":::docsera-ordered-list{start=\"2\" type=\"a\"}\n" +
          "- item\n" +
          ":::\n"
      )
    ).toMatchObject({
      ok: false
    });
    expect(
      parseDocseraMarkdownDocument(
        "---\n" + 'title: "Bad inline html"\n' + "---\n\n" + "<u class=\"extra\">text</u>\n"
      )
    ).toMatchObject({
      ok: false,
      reason: "unsupported-html"
    });
    expect(
      parseDocseraMarkdownDocument("---\n" + 'title: "Bad closing html"\n' + "---\n\n" + "<u>text</u class=\"extra\">\n")
    ).toMatchObject({
      ok: false,
      reason: "unsupported-html"
    });
    expect(
      parseDocseraMarkdownDocument(
        "---\n" + 'title: "Bad image value"\n' + "---\n\n" + "::docsera-image{media-id=\"m1\" alt=\"\" caption=\"\" frame=\"garbage\" align=\"left\" width-pct=\"100\"}\n"
      )
    ).toMatchObject({
      ok: false,
      reason: "invalid-directive"
    });
    expect(
      parseDocseraMarkdownDocument(
        "---\n" + 'title: "Unexpected attrs"\n' + "---\n\n" + "::docsera-empty-paragraph{bad=\"1\"}\n"
      )
    ).toMatchObject({
      ok: false,
      reason: "invalid-directive"
    });
    expect(
      parseDocseraMarkdownDocument(
        "---\n" +
          'title: "Mismatched ordered list"\n' +
          "---\n\n" +
          ":::docsera-ordered-list{start=\"2\" type=\"1\"}\n" +
          "3. item\n" +
          ":::\n"
      )
    ).toMatchObject({
      ok: false,
      reason: "invalid-directive"
    });
    expect(
      parseDocseraMarkdownDocument(
        "---\n" +
          'title: "Bad colwidth"\n' +
          "---\n\n" +
          ":::docsera-table\n" +
          "::::docsera-table-row\n" +
          ":::::docsera-table-cell{align=null colspan=\"1\" colwidth=\"[\" rowspan=\"1\"}\n" +
          "Cell\n" +
          ":::::\n" +
          "::::\n" +
          ":::\n"
      )
    ).toMatchObject({
      ok: false,
      reason: "invalid-directive"
    });
  });

  it("returns structured failures instead of throwing for malformed source input", () => {
    const malformedInputs = [
      "---\n" +
        'title: "Bad colwidth"\n' +
        "---\n\n" +
        ":::docsera-table\n" +
        "::::docsera-table-row\n" +
        ":::::docsera-table-cell{align=null colspan=\"1\" colwidth=\"[\" rowspan=\"1\"}\n" +
        "Cell\n" +
        ":::::\n" +
        "::::\n" +
        ":::\n",
      "---\n" +
        'title: "Bad html link"\n' +
        "---\n\n" +
        "<a href=\"https://example.com\" target=null>text</a>\n"
    ];

    for (const markdown of malformedInputs) {
      expect(() => parseDocseraMarkdownDocument(markdown)).not.toThrow();
      expect(parseDocseraMarkdownDocument(markdown)).toMatchObject({ ok: false });
    }
  });

  it("fails when the parsed canonical document violates the existing boundary", () => {
    const parsed = parseDocseraMarkdownDocument(
      "---\n" +
        'title: "Bad nesting"\n' +
        "---\n\n" +
        ":::docsera-columns\n" +
        "::::docsera-column\n" +
        "::::docsera-columns\n" +
        ":::::docsera-column\n" +
        "Nested left\n" +
        ":::::\n" +
        ":::::docsera-column\n" +
        "Nested right\n" +
        ":::::\n" +
        "::::\n" +
        "::::\n" +
        "::::docsera-column\n" +
        "Safe sibling\n" +
        "::::\n" +
        ":::\n"
    );

    expect(parsed).toMatchObject({
      ok: false,
      reason: "invalid-canonical-document"
    });
  });

  it("serializes callouts with required type and optional title attributes", () => {
    const withoutTitle = serializeDocseraMarkdownDocument(title, createCalloutEnvelope("info", null));
    const withTitle = serializeDocseraMarkdownDocument(title, createCalloutEnvelope("warning", "Watch this"));

    expect(withoutTitle.ok).toBe(true);
    expect(withTitle.ok).toBe(true);
    if (!withoutTitle.ok || !withTitle.ok) {
      return;
    }

    expect(withoutTitle.markdown).toContain(':::docsera-callout{type="info"}');
    expect(withoutTitle.markdown).not.toContain("title=");
    expect(withTitle.markdown).toContain(':::docsera-callout{type="warning" title="Watch this"}');
    expect(parseDocseraMarkdownDocument(withoutTitle.markdown)).toEqual({
      ok: true,
      title,
      markdown: withoutTitle.markdown,
      envelope: withoutTitle.envelope
    });
  });

  it("rejects malformed callout directives and disallowed nested structures", () => {
    for (const body of [
      ":::docsera-callout{type=\"tip\"}\nNope\n:::\n",
      ":::docsera-callout{type=\"info\" extra=\"1\"}\nNope\n:::\n",
      ":::docsera-callout\nNope\n:::\n",
      ":::docsera-callout{type=\"info\"}\n::docsera-image{media-id=\"workspace-media-001\" alt=\"\" caption=\"\" frame=true align=\"center\" width-pct=100}\n:::\n",
      ":::docsera-callout{type=\"info\"}\n::::docsera-callout{type=\"warning\"}\nNested\n::::\n:::\n",
      ":::docsera-callout{type=\"info\"}\n::::docsera-columns\n:::::docsera-column\nLeft\n:::::\n:::::docsera-column\nRight\n:::::\n::::\n:::\n"
    ]) {
      expect(parseDocseraMarkdownDocument(createMarkdownDocumentSource("Bad callout", body)).ok).toBe(false);
    }
  });
});


describe("Markdown source diagnostic ranges", () => {
  it.each([
    ["---\ntitle: ''\n---\n", "''", "invalid-title"],
    ["---\ntitle: a\ntitle: b\n---\n", "t", "invalid-frontmatter"],
    ["---\ntitle: Test\n---\n`<bad>` then <bad>", "<bad>", "unsupported-html"],
    ["---\ntitle: Test\n---\n`::docsera-unknown`\n\n::docsera-unknown", "::docsera-unknown", "unknown-directive"],
    ["---\ntitle: Test\n---\n`::docsera-image`\n\n::docsera-image", "::docsera-image", "invalid-directive"]
  ])("locates the actual failure for %s", (source, token, reason) => {
    const result = parseDocseraMarkdownDocument(source);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe(reason);
    expect(result.range).toBeDefined();
    expect(source.slice(result.range!.from, result.range!.to)).toContain(token);
    expect(result.range!.from).toBe(token === "t" ? source.lastIndexOf("title:") : source.lastIndexOf(token));
  });

  it("explains required frontmatter delimiters and accepts ordinary punctuation", () => {
    expect(parseDocseraMarkdownDocument('--\ntitle: Test\n---\n')).toMatchObject({ ok: false, message: expect.stringContaining('opening delimiter: ---') });
    expect(parseDocseraMarkdownDocument('---\ntitle: Test\n')).toMatchObject({ ok: false, message: expect.stringContaining('closing delimiter: ---') });
    expect(parseDocseraMarkdownDocument(createMarkdownDocumentSource("Test", "~*7$?."))).toMatchObject({ ok: true });
  });

  it.each([
    ["--\ntitle: Test\n---\n", "--"],
    ["---\ntitle: Test\n--\nBody text", "--"],
    ["---\r\ntitle: Test\r\n----\r\n", "----"]
  ])("locates a malformed delimiter in %s", (source, delimiter) => {
    const result = parseDocseraMarkdownDocument(source);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(source.slice(result.range!.from, result.range!.to)).toBe(delimiter);
  });

  it("does not invent a location for missing frontmatter", () => {
    expect(parseDocseraMarkdownDocument("plain text")).not.toHaveProperty("range");
    expect(parseDocseraMarkdownDocument("---\ntitle: Test\nbody text")).not.toHaveProperty("range");
  });

  it("uses original document offsets with CRLF", () => {
    const source = "---\r\ntitle: Test\r\n---\r\ntext <bad>";
    const result = parseDocseraMarkdownDocument(source);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(source.slice(result.range!.from, result.range!.to)).toBe("<bad>");
  });
});
