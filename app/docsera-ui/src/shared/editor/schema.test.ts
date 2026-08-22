import { isAllowedUri } from "@tiptap/extension-link";
import { DOMParser, Fragment } from "@tiptap/pm/model";
import { describe, expect, it } from "vitest";
import { createCanonicalImageDocseraDocumentEnvelope } from "./imageFixtures";
import {
  createCodeBlockWhitespaceDocseraDocumentEnvelope,
  createCombinedInlineMarksDocseraDocumentEnvelope,
  createDuplicateHeadingDocseraDocumentEnvelope,
  createEmptyHeadingDocseraDocumentEnvelope,
  createExpandedTextFormattingDocseraDocumentEnvelope,
  createMultiItemAccordionDocseraDocumentEnvelope,
  createNestedTableDocseraDocumentEnvelope,
  createNestedTaskListDocseraDocumentEnvelope,
  createSingleItemAccordionDocseraDocumentEnvelope,
  createSupportedE2DocseraDocumentEnvelope,
  createTaskCheckedStateDocseraDocumentEnvelope
} from "./documentFixtures";
import { getDocseraEditorSchema, isDocseraAllowedLinkHref, validateDocseraStructuredDocument } from "./schema";

describe("Docsera structured document validation", () => {
  it.each([
    ["supported rich E2 document", createSupportedE2DocseraDocumentEnvelope().document],
    ["nested task list document", createNestedTaskListDocseraDocumentEnvelope().document],
    ["checked task state document", createTaskCheckedStateDocseraDocumentEnvelope(true).document],
    ["unchecked task state document", createTaskCheckedStateDocseraDocumentEnvelope(false).document],
    ["code block terminal whitespace", createCodeBlockWhitespaceDocseraDocumentEnvelope().document],
    ["combined inline marks document", createCombinedInlineMarksDocseraDocumentEnvelope().document],
    ["duplicate heading document", createDuplicateHeadingDocseraDocumentEnvelope().document],
    ["empty heading document", createEmptyHeadingDocseraDocumentEnvelope().document],
    ["expanded text formatting document", createExpandedTextFormattingDocseraDocumentEnvelope().document],
    ["canonical image document", createCanonicalImageDocseraDocumentEnvelope().document],
    ["nested table document", createNestedTableDocseraDocumentEnvelope().document],
    ["single-item accordion document", createSingleItemAccordionDocseraDocumentEnvelope().document],
    ["multi-item accordion document", createMultiItemAccordionDocseraDocumentEnvelope().document]
  ])("accepts %s at the raw validation boundary", (_label, document) => {
    expect(validateDocseraStructuredDocument(document)).toEqual({ ok: true });
  });

  it.each([
    [
      "malformed image node",
      {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              mediaId: "",
              src: "https://example.com/image.png"
            }
          }
        ]
      }
    ],
    [
      "image child content rejected",
      {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              mediaId: "workspace-media-001"
            },
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Nested image content" }]
              }
            ]
          }
        ]
      }
    ],
    [
      "URL-backed image attrs rejected",
      {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              mediaId: "workspace-media-001",
              src: "https://example.com/image.png",
              title: "Uploaded image"
            }
          }
        ]
      }
    ],
    [
      "legacy image attrs rejected",
      {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              mediaId: "workspace-media-001",
              lightSrc: "https://example.com/light.png",
              darkSrc: "https://example.com/dark.png",
              lightAlt: "Light alt",
              darkAlt: "Dark alt"
            }
          }
        ]
      }
    ],
    [
      "native pixel image attrs rejected",
      {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              mediaId: "workspace-media-001",
              width: 640,
              height: 480
            }
          }
        ]
      }
    ],
    [
      "invalid width percentage rejected",
      {
        type: "doc",
        content: [
          {
            type: "image",
            attrs: {
              mediaId: "workspace-media-001",
              widthPct: Infinity
            }
          }
        ]
      }
    ],
    [
      "unknown node attribute",
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { unknown: "value" }
          }
        ]
      }
    ],
    [
      "superscript and subscript overlap",
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Unsupported mark combination",
                marks: [{ type: "superscript" }, { type: "subscript" }]
              }
            ]
          }
        ]
      }
    ],
    [
      "highlight color attribute rejected",
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Theme-specific highlight",
                marks: [{ type: "highlight", attrs: { color: "#ff0" } }]
              }
            ]
          }
        ]
      }
    ],
    [
      "unknown mark type",
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Unsupported mark",
                marks: [{ type: "rainbow" }]
              }
            ]
          }
        ]
      }
    ],
    [
      "unknown mark attribute",
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Bad mark attr",
                marks: [{ type: "bold", attrs: { unknown: true } }]
              }
            ]
          }
        ]
      }
    ],
    [
      "malformed link attributes",
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Bad link",
                marks: [
                  {
                    type: "link",
                    attrs: {
                      href: "https://example.com",
                      target: 123
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    ],
    [
      "unsafe link destination",
      {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Unsafe",
                marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }]
              }
            ]
          }
        ]
      }
    ],
    [
      "invalid ordered list start",
      {
        type: "doc",
        content: [
          {
            type: "orderedList",
            attrs: { start: 0, type: "a" },
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Invalid start" }]
                  }
                ]
              }
            ]
          }
        ]
      }
    ],
    [
      "unsupported ordered list type",
      {
        type: "doc",
        content: [
          {
            type: "orderedList",
            attrs: { start: 1, type: "roman" },
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Invalid type" }]
                  }
                ]
              }
            ]
          }
        ]
      }
    ],
    [
      "invalid task checked value",
      {
        type: "doc",
        content: [
          {
            type: "taskList",
            content: [
              {
                type: "taskItem",
                attrs: { checked: "yes" },
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Invalid attribute" }]
                  }
                ]
              }
            ]
          }
        ]
      }
    ],
    [
      "invalid nested list content",
      {
        type: "doc",
        content: [
          {
            type: "bulletList",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Invalid nesting" }]
              }
            ]
          }
        ]
      }
    ],
    [
      "invalid nested task list content",
      {
        type: "doc",
        content: [
          {
            type: "taskList",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Invalid nesting" }]
              }
            ]
          }
        ]
      }
    ],
    [
      "invalid code block language",
      {
        type: "doc",
        content: [
          {
            type: "codeBlock",
            attrs: { language: 123 },
            content: [{ type: "text", text: "const value = 1;" }]
          }
        ]
      }
    ],
    [
      "invalid heading level",
      {
        type: "doc",
        content: [
          {
            type: "heading",
            attrs: { level: 4 },
            content: [{ type: "text", text: "Unsupported heading" }]
          }
        ]
      }
    ],
    [
      "empty accordion",
      {
        type: "doc",
        content: [
          {
            type: "accordion",
            attrs: { accordionId: "accordion-empty" },
            content: []
          }
        ]
      }
    ],
    [
      "malformed accordion item structure",
      {
        type: "doc",
        content: [
          {
            type: "accordion",
            attrs: { accordionId: "accordion-missing-body" },
            content: [
              {
                type: "accordionItem",
                attrs: { accordionItemId: "accordion-item-missing-body" },
                content: [
                  {
                    type: "accordionTitle",
                    content: [{ type: "text", text: "Missing body" }]
                  }
                ]
              }
            ]
          }
        ]
      }
    ],
    [
      "duplicate accordion identity",
      {
        type: "doc",
        content: [
          {
            type: "accordion",
            attrs: { accordionId: "accordion-duplicate" },
            content: [
              {
                type: "accordionItem",
                attrs: { accordionItemId: "accordion-item-duplicate" },
                content: [
                  {
                    type: "accordionTitle",
                    content: [{ type: "text", text: "First" }]
                  },
                  {
                    type: "accordionContent",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "First body" }]
                      }
                    ]
                  }
                ]
              }
            ]
          },
          {
            type: "accordion",
            attrs: { accordionId: "accordion-duplicate" },
            content: [
              {
                type: "accordionItem",
                attrs: { accordionItemId: "accordion-item-duplicate-2" },
                content: [
                  {
                    type: "accordionTitle",
                    content: [{ type: "text", text: "Second" }]
                  },
                  {
                    type: "accordionContent",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "Second body" }]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ],
    [
      "nested accordion content",
      {
        type: "doc",
        content: [
          {
            type: "accordion",
            attrs: { accordionId: "accordion-nested" },
            content: [
              {
                type: "accordionItem",
                attrs: { accordionItemId: "accordion-item-nested" },
                content: [
                  {
                    type: "accordionTitle",
                    content: [{ type: "text", text: "Nested" }]
                  },
                  {
                    type: "accordionContent",
                    content: [
                      {
                        type: "accordion",
                        attrs: { accordionId: "accordion-inner" },
                        content: [
                          {
                            type: "accordionItem",
                            attrs: { accordionItemId: "accordion-item-inner" },
                            content: [
                              {
                                type: "accordionTitle",
                                content: [{ type: "text", text: "Inner" }]
                              },
                              {
                                type: "accordionContent",
                                content: [
                                  {
                                    type: "paragraph",
                                    content: [{ type: "text", text: "Inner body" }]
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
            ]
          }
        ]
      }
    ],
    [
      "accordion title structural hardBreak",
      {
        type: "doc",
        content: [
          {
            type: "accordion",
            attrs: { accordionId: "accordion-unsupported-title-break" },
            content: [
              {
                type: "accordionItem",
                attrs: { accordionItemId: "accordion-item-unsupported-title-break" },
                content: [
                  {
                    type: "accordionTitle",
                    content: [
                      { type: "text", text: "Line one" },
                      { type: "hardBreak" }
                    ]
                  },
                  {
                    type: "accordionContent",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "Accordion body" }]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ],
    [
      "accordion title embedded CR/LF",
      {
        type: "doc",
        content: [
          {
            type: "accordion",
            attrs: { accordionId: "accordion-unsupported-title-text" },
            content: [
              {
                type: "accordionItem",
                attrs: { accordionItemId: "accordion-item-unsupported-title-text" },
                content: [
                  {
                    type: "accordionTitle",
                    content: [{ type: "text", text: "Line one\r\nLine two" }]
                  },
                  {
                    type: "accordionContent",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "Accordion body" }]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ],
    [
      "accordion title link mark",
      {
        type: "doc",
        content: [
          {
            type: "accordion",
            attrs: { accordionId: "accordion-unsupported-title-mark" },
            content: [
              {
                type: "accordionItem",
                attrs: { accordionItemId: "accordion-item-unsupported-title-mark" },
                content: [
                  {
                    type: "accordionTitle",
                    content: [
                      {
                        type: "text",
                        text: "Linked title",
                        marks: [
                          {
                            type: "link",
                            attrs: {
                              href: "https://example.com/title",
                              target: "_blank",
                              rel: "noopener noreferrer nofollow",
                              class: null,
                              title: null
                            }
                          }
                        ]
                      }
                    ]
                  },
                  {
                    type: "accordionContent",
                    content: [
                      {
                        type: "paragraph",
                        content: [{ type: "text", text: "Accordion body" }]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    ],
    [
      "accordion content columns",
      {
        type: "doc",
        content: [
          {
            type: "accordion",
            attrs: { accordionId: "accordion-unsupported-body" },
            content: [
              {
                type: "accordionItem",
                attrs: { accordionItemId: "accordion-item-unsupported-body" },
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
                        content: []
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
  ])("rejects %s at the raw validation boundary", (_label, document) => {
    expect(validateDocseraStructuredDocument(document)).toEqual({
      ok: false,
      message: "The stored page content does not contain a valid TipTap document."
    });
  });
});

describe("Docsera active table schema", () => {
  it("registers the canonical table node family with upstream cell and header alignment attributes", () => {
    const schema = getDocseraEditorSchema();
    const cell = schema.nodes.tableCell.createAndFill();
    const header = schema.nodes.tableHeader.createAndFill();

    expect(schema.nodes.table).toBeDefined();
    expect(schema.nodes.tableRow).toBeDefined();
    expect(cell?.attrs).toEqual({
      colspan: 1,
      rowspan: 1,
      colwidth: null,
      align: null
    });
    expect(header?.attrs).toEqual({
      colspan: 1,
      rowspan: 1,
      colwidth: null,
      align: null
    });
  });

  it("keeps tables in the standard block group so supported containers can nest them", () => {
    const schema = getDocseraEditorSchema();
    const table = schema.nodes.table.createAndFill();
    const paragraph = schema.nodes.paragraph.create();

    expect(table).not.toBeNull();
    if (!table) {
      throw new Error("Expected table schema to create a default table.");
    }

    expect(table.type.spec.group).toBe("block");
    expect(schema.nodes.doc.validContent(Fragment.from(table))).toBe(true);
    expect(schema.nodes.blockquote.validContent(Fragment.from(paragraph))).toBe(true);
    expect(schema.nodes.blockquote.validContent(Fragment.from(table))).toBe(true);
    expect(schema.nodes.listItem.validContent(Fragment.from(paragraph))).toBe(true);
    expect(schema.nodes.listItem.validContent(Fragment.fromArray([paragraph, table]))).toBe(true);
    expect(schema.nodes.taskItem.validContent(Fragment.from(paragraph))).toBe(true);
    expect(schema.nodes.taskItem.validContent(Fragment.fromArray([paragraph, table]))).toBe(true);
    expect(schema.nodes.tableCell.validContent(Fragment.from(table))).toBe(true);
  });

  it("accepts indirect nested table structures allowed by the standard block schema", () => {
    const schema = getDocseraEditorSchema();
    const table = schema.nodes.table.createAndFill();
    const paragraph = schema.nodes.paragraph.create();
    const blockquoteWithParagraph = schema.nodes.blockquote.create(null, paragraph);

    expect(table).not.toBeNull();
    if (!table) {
      throw new Error("Expected table schema to create a default table.");
    }

    expect(schema.nodes.tableCell.validContent(Fragment.from(blockquoteWithParagraph))).toBe(true);
    expect(schema.nodes.blockquote.validContent(Fragment.from(table))).toBe(true);
    expect(() =>
      schema
        .nodeFromJSON({
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
                          type: "blockquote",
                          content: [table.toJSON()]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        })
        .check()
    ).not.toThrow();
  });

  it("preserves native table alignment attrs while dropping malformed pasted column widths", () => {
    const schema = getDocseraEditorSchema();
    const container = window.document.createElement("div");
    container.innerHTML = "<table><tbody><tr><td align=\"center\" colwidth=\"bad\">Cell</td></tr></tbody></table>";

    const document = DOMParser.fromSchema(schema).parse(container);
    const tableCell = document.firstChild?.firstChild?.firstChild;

    expect(tableCell?.type.name).toBe("tableCell");
    expect(tableCell?.attrs).toEqual({
      colspan: 1,
      rowspan: 1,
      colwidth: null,
      align: "center"
    });
  });
});

describe("Docsera image schema", () => {
  it("exposes the canonical Docsera image attrs on a normal draggable block node", () => {
    const schema = getDocseraEditorSchema();
    const image = schema.nodes.image;

    expect(image).toBeDefined();
    expect(image?.spec.group).toBe("block");
    expect(image?.spec.draggable).toBe(true);
    expect(Object.keys(image?.spec.attrs ?? {}).sort()).toEqual(
      ["align", "alt", "caption", "darkMediaId", "frame", "mediaId", "widthPct"].sort()
    );
    expect(Object.keys(image?.spec.attrs ?? {})).not.toEqual(
      expect.arrayContaining(["src", "title", "width", "height", "lightSrc", "darkSrc", "lightAlt", "darkAlt"])
    );
  });

  it("keeps the canonical image node valid in the existing block-capable nested schema contexts", () => {
    const schema = getDocseraEditorSchema();
    const image = schema.nodes.image.create({ mediaId: "workspace-media-001" });
    const paragraph = schema.nodes.paragraph.create();

    expect(schema.nodes.doc.validContent(Fragment.from(image))).toBe(true);
    expect(schema.nodes.blockquote.validContent(Fragment.from(image))).toBe(true);
    expect(schema.nodes.listItem.validContent(Fragment.fromArray([paragraph, image]))).toBe(true);
    expect(schema.nodes.taskItem.validContent(Fragment.fromArray([paragraph, image]))).toBe(true);
    expect(schema.nodes.tableCell.validContent(Fragment.from(image))).toBe(true);
    expect(() => schema.nodeFromJSON(createCanonicalImageDocseraDocumentEnvelope().document).check()).not.toThrow();
  });

  it.each([
    ["raw img/src markup", "<img src=\"https://example.com/image.png\" alt=\"Raw image\">", "https://example.com/image.png"],
    [
      "figure-based media markup",
      "<figure data-docsera-media-id=\"workspace-media-001\"></figure>",
      "workspace-media-001"
    ]
  ])("does not establish a raw HTML image ingestion path for %s", (_label, html, forbiddenSnippet) => {
    const schema = getDocseraEditorSchema();
    const container = window.document.createElement("div");
    container.innerHTML = html;

    const document = DOMParser.fromSchema(schema).parse(container);
    const serialized = JSON.stringify(document.toJSON());

    expect(serialized).not.toContain("\"type\":\"image\"");
    expect(serialized).not.toContain(forbiddenSnippet);
  });
});

describe("Docsera link policy parity", () => {
  it.each([
    ["https URL", "https://example.com/docs"],
    ["relative URL", "./getting-started"],
    ["anchor URL", "#overview"],
    ["mailto URL", "mailto:docs@example.com"],
    ["unsupported file scheme", "file:///tmp/docsera.txt"],
    ["unsafe javascript scheme", "javascript:alert(1)"],
    ["whitespace-obfuscated javascript scheme", "java\nscript:alert(1)"],
    ["custom scheme", "git://example.com/repo.git"]
  ])("matches TipTap default URI policy for %s", (_label, href) => {
    expect(isDocseraAllowedLinkHref(href)).toBe(Boolean(isAllowedUri(href, [])));
  });
});

