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
    createEscapedAccordionIdsEnvelope(),
    createEscapingHeavyLinkEnvelope(),
    createBoldUnderlineEnvelope(),
    createUnderlineBoldEnvelope(),
    createBoldLinkEnvelope(),
    createLinkBoldEnvelope(),
    createDirectiveLookingProseEnvelope("::docsera-empty-document"),
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
});
