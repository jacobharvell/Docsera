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
import {
  canonicalizeDocseraStructuredDocument,
  getDocseraEditorSchema,
  isDocseraAllowedLinkHref,
  validateDocseraStructuredDocument
} from "./schema";

function addActiveEditorTableDefaults<T extends Record<string, unknown>>(value: T): T {
  const cloned = JSON.parse(JSON.stringify(value)) as T;

  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object") {
      return;
    }

    const record = node as Record<string, unknown>;
    if (record.type === "tableCell" || record.type === "tableHeader") {
      const attrs = (record.attrs as Record<string, unknown> | undefined) ?? {};
      record.attrs = {
        align: null,
        ...attrs
      };
    }

    const content = record.content;
    if (Array.isArray(content)) {
      for (const child of content) {
        visit(child);
      }
    }
  };

  visit(cloned);
  return cloned;
}

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
      "accordion body empty columns",
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

describe("Docsera active accordion schema", () => {
  it("registers the canonical accordion node family with top-level-only block ownership", () => {
    const schema = getDocseraEditorSchema();

    expect(schema.nodes.accordion).toBeDefined();
    expect(schema.nodes.accordionItem).toBeDefined();
    expect(schema.nodes.accordionTitle).toBeDefined();
    expect(schema.nodes.accordionContent).toBeDefined();
    expect(schema.nodes.accordion?.spec.group).toBe("block");
    expect(schema.nodes.accordionItem?.spec.content).toBe("accordionTitle accordionContent");
    expect(schema.nodes.accordionTitle?.spec.content).toBe("text*");
    expect(schema.nodes.accordionTitle?.spec.marks).toBe(
      "bold italic strike code underline highlight textColor highlightColor superscript subscript"
    );
    expect(schema.nodes.accordionContent?.spec.content).toBe(
      "((paragraph | heading | image | bulletList | orderedList | taskList | blockquote | horizontalRule | codeBlock | table) | columns | callout)+"
    );
  });

  it.each([
    ["single-item accordion document", createSingleItemAccordionDocseraDocumentEnvelope().document],
    [
      "multi-item accordion document",
      addActiveEditorTableDefaults(createMultiItemAccordionDocseraDocumentEnvelope().document)
    ]
  ])("round-trips the canonical %s through the active schema without mutation", (_label, document) => {
    const schema = getDocseraEditorSchema();
    const node = schema.nodeFromJSON(document);

    expect(canonicalizeDocseraStructuredDocument(node.toJSON())).toEqual(canonicalizeDocseraStructuredDocument(document));
    expect(schema.nodes.doc.validContent(node.content)).toBe(true);
  });

  it("keeps accordion out of unrelated nested containers while allowing columns only in accordion content", () => {
    const schema = getDocseraEditorSchema();
    const accordion = schema.nodeFromJSON(createSingleItemAccordionDocseraDocumentEnvelope().document).firstChild;
    const paragraph = schema.nodes.paragraph.create();
    const columns = schema.nodeFromJSON({
      type: "columns",
      content: [
        {
          type: "column",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Left" }] }]
        },
        {
          type: "column",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Right" }] }]
        }
      ]
    });

    expect(accordion).not.toBeNull();
    if (!accordion) {
      throw new Error("Expected the canonical accordion schema to create a top-level accordion.");
    }

    expect(schema.nodes.doc.validContent(Fragment.from(accordion))).toBe(true);
    expect(schema.nodes.accordionContent.validContent(Fragment.from(columns))).toBe(true);
    expect(schema.nodes.blockquote.validContent(Fragment.fromArray([paragraph, accordion]))).toBe(false);
    expect(schema.nodes.listItem.validContent(Fragment.fromArray([paragraph, accordion]))).toBe(false);
    expect(schema.nodes.taskItem.validContent(Fragment.fromArray([paragraph, accordion]))).toBe(false);
    expect(schema.nodes.tableCell.validContent(Fragment.fromArray([paragraph, accordion]))).toBe(false);
    expect(schema.nodes.tableHeader.validContent(Fragment.fromArray([paragraph, accordion]))).toBe(false);
    expect(schema.nodes.accordionContent.validContent(Fragment.from(accordion))).toBe(false);
    expect(schema.nodes.column.validContent(Fragment.from(columns))).toBe(false);
    expect(schema.nodes.blockquote.validContent(Fragment.from(columns))).toBe(false);
    expect(schema.nodes.listItem.validContent(Fragment.from(columns))).toBe(false);
    expect(schema.nodes.taskItem.validContent(Fragment.from(columns))).toBe(false);
    expect(schema.nodes.tableCell.validContent(Fragment.from(columns))).toBe(false);
    expect(schema.nodes.tableHeader.validContent(Fragment.from(columns))).toBe(false);
  });

  it("keeps Tab sinking available for nested task items while still excluding accordion content", async () => {
    const { Editor } = await import("@tiptap/core");
    const { createDocseraEditorExtensions } = await import("./schema");
    const initialDocument = {
      type: "doc",
      content: [
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "First task"
                    }
                  ]
                }
              ]
            },
            {
              type: "taskItem",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "Second task"
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    } satisfies import("@tiptap/core").JSONContent;
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: createDocseraEditorExtensions(),
      content: initialDocument
    });

    try {
      let selectionPosition: number | null = null;

      editor.state.doc.descendants((node, pos) => {
        if (selectionPosition !== null) {
          return false;
        }

        if (node.isText && typeof node.text === "string" && node.text.includes("Second task")) {
          selectionPosition = pos + 1;
          return false;
        }

        return true;
      });

      if (selectionPosition === null) {
        throw new Error("Expected to find the second task text in the editor document.");
      }

      editor.commands.setTextSelection(selectionPosition);
      editor.commands.focus();
      editor.view.dom.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", code: "Tab", bubbles: true, cancelable: true }));

      expect(editor.getJSON()).toMatchObject({
        type: "doc",
        content: [
          {
            type: "taskList",
            content: [
              {
                type: "taskItem",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: "First task"
                      }
                    ]
                  },
                  {
                    type: "taskList",
                    content: [
                      {
                        type: "taskItem",
                        content: [
                          {
                            type: "paragraph",
                            content: [
                              {
                                type: "text",
                                text: "Second task"
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
      });
    } finally {
      editor.destroy();
    }
  });

  it("registers semantic Docsera text and colored-highlight marks without changing default Highlight", () => {
    const schema = getDocseraEditorSchema();

    expect(schema.marks.highlight).toBeDefined();
    expect(schema.marks.textColor).toBeDefined();
    expect(schema.marks.highlightColor).toBeDefined();
    expect(schema.marks.highlight?.spec.attrs).toBeUndefined();
    expect(schema.marks.textColor?.spec.attrs).toHaveProperty("color");
    expect(schema.marks.highlightColor?.spec.attrs).toHaveProperty("color");

    const document = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Styled",
              marks: [
                { type: "bold" },
                { type: "textColor", attrs: { color: "blue" } },
                { type: "highlightColor", attrs: { color: "yellow" } }
              ]
            },
            {
              type: "text",
              text: " default highlight",
              marks: [{ type: "highlight" }]
            }
          ]
        },
        {
          type: "accordion",
          attrs: { accordionId: "accordion-colors" },
          content: [
            {
              type: "accordionItem",
              attrs: { accordionItemId: "accordion-item-colors" },
              content: [
                {
                  type: "accordionTitle",
                  content: [
                    {
                      type: "text",
                      text: "Title",
                      marks: [{ type: "textColor", attrs: { color: "purple" } }]
                    }
                  ]
                },
                {
                  type: "accordionContent",
                  content: [{ type: "paragraph" }]
                }
              ]
            }
          ]
        }
      ]
    };

    expect(validateDocseraStructuredDocument(document)).toEqual({ ok: true });
    expect(canonicalizeDocseraStructuredDocument(schema.nodeFromJSON(document).toJSON())).toEqual(document);
  });

  it("accepts canonical callouts in supported parent contexts and normalizes absent titles to null", () => {
    const document = {
      type: "doc",
      content: [
        {
          type: "callout",
          attrs: { type: "info", title: null },
          content: [{ type: "paragraph", content: [{ type: "text", text: "Info body" }] }]
        },
        {
          type: "columns",
          content: [
            {
              type: "column",
              content: [
                {
                  type: "callout",
                  attrs: { type: "warning", title: "Column warning" },
                  content: [{ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Nested heading" }] }]
                }
              ]
            },
            {
              type: "column",
              content: [{ type: "paragraph" }]
            }
          ]
        },
        {
          type: "accordion",
          attrs: { accordionId: "accordion-callout" },
          content: [
            {
              type: "accordionItem",
              attrs: { accordionItemId: "accordion-item-callout" },
              content: [
                { type: "accordionTitle", content: [{ type: "text", text: "Callout" }] },
                {
                  type: "accordionContent",
                  content: [
                    {
                      type: "callout",
                      attrs: { type: "success", title: "Accordion success" },
                      content: [{ type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "Quote" }] }] }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };

    expect(validateDocseraStructuredDocument(document)).toEqual({ ok: true });
    expect(canonicalizeDocseraStructuredDocument(document)).toEqual(document);
  });

  it("rejects malformed callout types, titles, descendants, and nesting", () => {
    const validBody = [{ type: "paragraph", content: [{ type: "text", text: "Body" }] }];
    for (const callout of [
      { type: "callout", attrs: { type: "tip", title: null }, content: validBody },
      { type: "callout", attrs: { type: "info", title: "Line\nbreak" }, content: validBody },
      { type: "callout", attrs: { type: "info", title: null, icon: "info" }, content: validBody },
      { type: "callout", attrs: { type: "info", title: null }, content: [] },
      { type: "callout", attrs: { type: "info", title: null }, content: [{ type: "image", attrs: { mediaId: "workspace-media-001" } }] },
      {
        type: "callout",
        attrs: { type: "info", title: null },
        content: [{ type: "callout", attrs: { type: "warning", title: null }, content: validBody }]
      },
      {
        type: "callout",
        attrs: { type: "info", title: null },
        content: [{ type: "columns", content: [{ type: "column", content: validBody }, { type: "column", content: validBody }] }]
      },
      {
        type: "callout",
        attrs: { type: "info", title: null },
        content: [{ type: "table", content: [{ type: "tableRow", content: [{ type: "tableCell", attrs: { colspan: 1, rowspan: 1, colwidth: null }, content: validBody }] }] }]
      }
    ]) {
      expect(validateDocseraStructuredDocument({ type: "doc", content: [callout] }).ok).toBe(false);
    }
  });

  it("registers callout as a structural TipTap node only in supported containers", () => {
    const schema = getDocseraEditorSchema();
    const callout = schema.nodes.callout.create(
      { type: "error", title: "Error title" },
      schema.nodes.paragraph.create(null, schema.text("Error body"))
    );
    const paragraph = schema.nodes.paragraph.create();

    expect(schema.nodes.callout?.spec.group).toBe("block");
    expect(schema.nodes.callout?.spec.content).toBe(
      "(paragraph | heading | bulletList | orderedList | taskList | blockquote | horizontalRule | codeBlock)+"
    );
    expect(schema.nodes.doc.validContent(Fragment.from(callout))).toBe(true);
    expect(schema.nodes.column.validContent(Fragment.from(callout))).toBe(true);
    expect(schema.nodes.accordionContent.validContent(Fragment.from(callout))).toBe(true);
    expect(schema.nodes.blockquote.validContent(Fragment.from(callout))).toBe(false);
    expect(schema.nodes.listItem.validContent(Fragment.fromArray([paragraph, callout]))).toBe(false);
    expect(schema.nodes.tableCell.validContent(Fragment.from(callout))).toBe(false);
  });
});

describe("Docsera semantic color contract", () => {
  it("round-trips constrained Docsera text and highlight colors without widening the canonical contract", () => {
    const document = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Color",
              marks: [
                { type: "textColor", attrs: { color: "blue" } },
                { type: "highlightColor", attrs: { color: "yellow" } },
                { type: "underline" }
              ]
            },
            {
              type: "text",
              text: " default",
              marks: [{ type: "highlight" }]
            }
          ]
        }
      ]
    };

    expect(validateDocseraStructuredDocument(document)).toEqual({ ok: true });
    expect(canonicalizeDocseraStructuredDocument(document)).toEqual(document);

    for (const mark of [
      { type: "textColor" },
      { type: "textColor", attrs: {} },
      { type: "textColor", attrs: { color: "teal" } },
      { type: "textColor", attrs: { color: "#175cd3" } },
      { type: "textColor", attrs: { color: "rgb(23, 92, 211)" } },
      { type: "textColor", attrs: { color: "blue", style: "color:red" } },
      { type: "highlightColor", attrs: { color: "var(--docsera-primary)" } },
      { type: "highlight", attrs: { color: "yellow" } }
    ]) {
      expect(
        validateDocseraStructuredDocument({
          type: "doc",
          content: [{ type: "paragraph", content: [{ type: "text", text: "Invalid", marks: [mark] }] }]
        }).ok
      ).toBe(false);
    }

    expect(
      validateDocseraStructuredDocument({
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              {
                type: "text",
                text: "Overlap",
                marks: [{ type: "highlight" }, { type: "highlightColor", attrs: { color: "pink" } }]
              }
            ]
          }
        ]
      }).ok
    ).toBe(false);
  });
});

describe("Docsera paragraph and heading alignment contract", () => {
  it("registers TextAlign only on paragraph and heading nodes", () => {
    const schema = getDocseraEditorSchema();

    expect(schema.nodes.paragraph?.spec.attrs).toHaveProperty("textAlign");
    expect(schema.nodes.heading?.spec.attrs).toHaveProperty("textAlign");
    expect(schema.nodes.tableCell?.spec.attrs).toHaveProperty("align");
    expect(schema.nodes.tableCell?.spec.attrs).not.toHaveProperty("textAlign");
    expect(schema.nodes.blockquote?.spec.attrs ?? {}).not.toHaveProperty("textAlign");
    expect(schema.nodes.codeBlock?.spec.attrs ?? {}).not.toHaveProperty("textAlign");
  });

  it("round-trips center and right alignment while normalizing default left away", () => {
    const schema = getDocseraEditorSchema();
    const alignedDocument = {
      type: "doc",
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
        }
      ]
    };
    const leftDocument = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { textAlign: "left" },
          content: [{ type: "text", text: "Left paragraph" }]
        },
        {
          type: "heading",
          attrs: { level: 3, textAlign: "left" },
          content: [{ type: "text", text: "Left heading" }]
        }
      ]
    };

    expect(validateDocseraStructuredDocument(alignedDocument)).toEqual({ ok: true });
    expect(canonicalizeDocseraStructuredDocument(alignedDocument)).toEqual(alignedDocument);
    expect(schema.nodeFromJSON(alignedDocument).toJSON()).toEqual(alignedDocument);

    expect(validateDocseraStructuredDocument(leftDocument)).toEqual({ ok: true });
    expect(canonicalizeDocseraStructuredDocument(leftDocument)).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Left paragraph" }]
        },
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "Left heading" }]
        }
      ]
    });
  });

  it("rejects unsupported paragraph and heading alignment values and attrs on unsupported nodes", () => {
    for (const attrs of [
      { textAlign: "justify" },
      { textAlign: "start" },
      { textAlign: "center", class: "extra" }
    ]) {
      expect(validateDocseraStructuredDocument({
        type: "doc",
        content: [{ type: "paragraph", attrs, content: [{ type: "text", text: "Invalid" }] }]
      }).ok).toBe(false);
    }

    expect(validateDocseraStructuredDocument({
      type: "doc",
      content: [{ type: "heading", attrs: { level: 2, textAlign: "justify" }, content: [{ type: "text", text: "Invalid" }] }]
    }).ok).toBe(false);

    expect(validateDocseraStructuredDocument({
      type: "doc",
      content: [{ type: "blockquote", attrs: { textAlign: "center" }, content: [{ type: "paragraph" }] }]
    }).ok).toBe(false);

    expect(validateDocseraStructuredDocument({
      type: "doc",
      content: [{ type: "tableCell", attrs: { colspan: 1, rowspan: 1, colwidth: null, textAlign: "right" }, content: [{ type: "paragraph" }] }]
    }).ok).toBe(false);
  });

  it("uses direct TipTap text-alignment commands on supported paragraph and heading nodes only", async () => {
    const { Editor } = await import("@tiptap/core");
    const { createDocseraEditorExtensions } = await import("./schema");
    const editor = new Editor({
      element: document.createElement("div"),
      extensions: createDocseraEditorExtensions(),
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Paragraph" }] },
          { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Heading" }] },
          { type: "codeBlock", attrs: { language: null }, content: [{ type: "text", text: "Code" }] }
        ]
      }
    });

    try {
      editor.commands.setTextSelection(2);
      expect(editor.commands.setTextAlign("center")).toBe(true);

      let headingPosition = 0;
      let codePosition = 0;
      editor.state.doc.descendants((node, pos) => {
        if (node.type.name === "heading") {
          headingPosition = pos + 1;
        }
        if (node.type.name === "codeBlock") {
          codePosition = pos + 1;
        }
      });

      editor.commands.setTextSelection(headingPosition);
      expect(editor.commands.setTextAlign("right")).toBe(true);
      editor.commands.setTextSelection(codePosition);
      expect(editor.commands.setTextAlign("center")).toBe(false);
      expect(editor.commands.setTextAlign("justify")).toBe(false);

      expect(editor.getJSON()).toEqual({
        type: "doc",
        content: [
          { type: "paragraph", attrs: { textAlign: "center" }, content: [{ type: "text", text: "Paragraph" }] },
          { type: "heading", attrs: { level: 2, textAlign: "right" }, content: [{ type: "text", text: "Heading" }] },
          { type: "codeBlock", attrs: { language: null }, content: [{ type: "text", text: "Code" }] }
        ]
      });

      editor.commands.setTextSelection(2);
      expect(editor.commands.setTextAlign("left")).toBe(true);
      expect(canonicalizeDocseraStructuredDocument(editor.getJSON()).content?.[0]).toEqual({
        type: "paragraph",
        content: [{ type: "text", text: "Paragraph" }]
      });
    } finally {
      editor.destroy();
    }
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

