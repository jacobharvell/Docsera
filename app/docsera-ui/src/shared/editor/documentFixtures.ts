import {
  createEmptyDocseraDocumentEnvelope,
  DOCSERA_DOCUMENT_SCHEMA_VERSION,
  type DocseraDocumentEnvelope,
  type DocseraTiptapDocument
} from "./document";
import { createCanonicalImageDocseraDocumentEnvelope } from "./imageFixtures";

export type DocseraDocumentFixtureCase = {
  input: unknown;
  label: string;
  expected: {
    migratedLegacyDocument?: boolean;
    ok: boolean;
    reason?: "invalid-json" | "invalid-envelope" | "invalid-document" | "unsupported-schema-version";
  };
};

export function createLegacyDocseraDocument(text = "Legacy canonical content"): DocseraTiptapDocument {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text
          }
        ]
      }
    ]
  };
}

export function createCanonicalDocseraDocumentEnvelope(text = "Canonical content"): DocseraDocumentEnvelope {
  return {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: createLegacyDocseraDocument(text)
  };
}

export function createSupportedE2DocseraDocumentEnvelope(): DocseraDocumentEnvelope {
  return {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Overview" }]
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Combined",
              marks: [
                {
                  type: "link",
                  attrs: {
                    href: "https://example.com/docs",
                    target: "_blank",
                    rel: "noopener noreferrer nofollow",
                    class: null,
                    title: null
                  }
                },
                { type: "bold" },
                { type: "italic" },
                { type: "strike" }
              ]
            },
            { type: "text", text: " inline" },
            { type: "text", text: " code", marks: [{ type: "code" }] },
            {
              type: "text",
              text: " link",
              marks: [
                {
                  type: "link",
                  attrs: {
                    href: "https://example.com/docs",
                    target: "_blank",
                    rel: "noopener noreferrer nofollow",
                    class: null,
                    title: null
                  }
                }
              ]
            },
            { type: "hardBreak" },
            { type: "text", text: "after break" }
          ]
        },
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "Nested content" }]
        },
        {
          type: "bulletList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Bullet item" }]
                },
                {
                  type: "orderedList",
                  attrs: { start: 2, type: "a" },
                  content: [
                    {
                      type: "listItem",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Nested ordered" }]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          type: "orderedList",
          attrs: { start: 3, type: null },
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Ordered item" }]
                },
                {
                  type: "bulletList",
                  content: [
                    {
                      type: "listItem",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Nested bullet" }]
                        }
                      ]
                    }
                  ]
                },
                {
                  type: "taskList",
                  content: [
                    {
                      type: "taskItem",
                      attrs: { checked: false },
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Nested task" }]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: true },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Checked task" }]
                },
                {
                  type: "taskList",
                  content: [
                    {
                      type: "taskItem",
                      attrs: { checked: false },
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Nested checked task" }]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Quoted text" }]
            }
          ]
        },
        { type: "horizontalRule" },
        {
          type: "codeBlock",
          attrs: { language: "typescript" },
          content: [{ type: "text", text: "const value = 1;   \n" }]
        },
        {
          type: "paragraph",
          content: [{ type: "text", text: "Closing paragraph" }]
        }
      ]
    }
  };
}

export function createExpandedTextFormattingDocseraDocumentEnvelope(): DocseraDocumentEnvelope {
  return {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Getting started" }]
        },
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Underlined",
              marks: [{ type: "underline" }]
            },
            { type: "text", text: " and " },
            {
              type: "text",
              text: "highlighted",
              marks: [{ type: "highlight" }]
            },
            { type: "text", text: " text with " },
            {
              type: "text",
              text: "bold superscript",
              marks: [{ type: "bold" }, { type: "superscript" }]
            },
            { type: "text", text: " and " },
            {
              type: "text",
              text: "italic subscript",
              marks: [{ type: "italic" }, { type: "subscript" }]
            }
          ]
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Install" }]
        },
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "npm" }]
        }
      ]
    }
  };
}

export function createNestedTaskListDocseraDocumentEnvelope(): DocseraDocumentEnvelope {
  return {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: {
      type: "doc",
      content: [
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked: true },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Parent task" }]
                },
                {
                  type: "taskList",
                  content: [
                    {
                      type: "taskItem",
                      attrs: { checked: false },
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Child task" }]
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

export function createTaskCheckedStateDocseraDocumentEnvelope(checked: boolean): DocseraDocumentEnvelope {
  return {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: {
      type: "doc",
      content: [
        {
          type: "taskList",
          content: [
            {
              type: "taskItem",
              attrs: { checked },
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: checked ? "Checked task" : "Unchecked task" }]
                }
              ]
            }
          ]
        }
      ]
    }
  };
}

export function createCodeBlockWhitespaceDocseraDocumentEnvelope(): DocseraDocumentEnvelope {
  return {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: {
      type: "doc",
      content: [
        {
          type: "codeBlock",
          attrs: { language: "typescript" },
          content: [{ type: "text", text: "const padded = true;   \n" }]
        }
      ]
    }
  };
}

export function createCombinedInlineMarksDocseraDocumentEnvelope(): DocseraDocumentEnvelope {
  return {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Combined marks",
              marks: [
                {
                  type: "link",
                  attrs: {
                    href: "https://example.com/combined",
                    target: "_blank",
                    rel: "noopener noreferrer nofollow",
                    class: null,
                    title: null
                  }
                },
                { type: "bold" },
                { type: "italic" },
                { type: "strike" }
              ]
            }
          ]
        }
      ]
    }
  };
}

export function createHeadingPairDocseraDocumentEnvelope(): DocseraDocumentEnvelope {
  return {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Section heading" }]
        },
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "Subsection heading" }]
        }
      ]
    }
  };
}

export function createHeadingHierarchyDocseraDocumentEnvelope(): DocseraDocumentEnvelope {
  return {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: [{ type: "text", text: "Overview" }]
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Install" }]
        },
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "CLI" }]
        }
      ]
    }
  };
}

export function createEmptyHeadingHierarchyDocseraDocumentEnvelope(): DocseraDocumentEnvelope {
  return {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 1 },
          content: []
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: []
        },
        {
          type: "heading",
          attrs: { level: 3 },
          content: []
        }
      ]
    }
  };
}

export function createDuplicateHeadingDocseraDocumentEnvelope(): DocseraDocumentEnvelope {
  return {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Overview" }]
        },
        {
          type: "heading",
          attrs: { level: 3 },
          content: [{ type: "text", text: "Overview" }]
        },
        {
          type: "heading",
          attrs: { level: 2 },
          content: [{ type: "text", text: "Overview" }]
        }
      ]
    }
  };
}

export function createEmptyHeadingDocseraDocumentEnvelope(): DocseraDocumentEnvelope {
  return {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { level: 2 },
          content: []
        }
      ]
    }
  };
}

function createAccordionTitleNode(title: string): Record<string, unknown> {
  return {
    type: "accordionTitle",
    content: title ? [{ type: "text", text: title }] : []
  };
}

function createAccordionBodyParagraph(text: string): Record<string, unknown> {
  return {
    type: "paragraph",
    content: [{ type: "text", text }]
  };
}

function createCanonicalAccordionItemNode(
  accordionItemId: string,
  title: string,
  content: Record<string, unknown>[]
): Record<string, unknown> {
  return {
    type: "accordionItem",
    attrs: { accordionItemId },
    content: [createAccordionTitleNode(title), { type: "accordionContent", content }]
  };
}

export function createSingleItemAccordionDocseraDocumentEnvelope(): DocseraDocumentEnvelope {
  return {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: {
      type: "doc",
      content: [
        {
          type: "accordion",
          attrs: { accordionId: "accordion-overview" },
          content: [
            createCanonicalAccordionItemNode("accordion-item-overview", "Overview", [
              createAccordionBodyParagraph("Accordion body")
            ])
          ]
        }
      ]
    }
  };
}

export function createMultiItemAccordionDocseraDocumentEnvelope(): DocseraDocumentEnvelope {
  return {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: {
      type: "doc",
      content: [
        {
          type: "accordion",
          attrs: { accordionId: "accordion-reference" },
          content: [
            createCanonicalAccordionItemNode("accordion-item-plan", "Plan", [
              createAccordionBodyParagraph("Accordion plan body"),
              {
                type: "table",
                content: [
                  {
                    type: "tableRow",
                    content: [
                      {
                        type: "tableHeader",
                        attrs: { colspan: 1, rowspan: 1, colwidth: null },
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text: "Stage" }]
                          }
                        ]
                      },
                      {
                        type: "tableCell",
                        attrs: { colspan: 1, rowspan: 1, colwidth: null },
                        content: [
                          {
                            type: "paragraph",
                            content: [{ type: "text", text: "Discovery" }]
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]),
            createCanonicalAccordionItemNode("accordion-item-media", "Media", [
              createAccordionBodyParagraph("Accordion media body"),
              {
                type: "image",
                attrs: {
                  mediaId: "workspace-media-001",
                  darkMediaId: null,
                  alt: "Accordion diagram",
                  caption: "Accordion item media",
                  frame: true,
                  align: "center",
                  widthPct: 60
                }
              }
            ])
          ]
        }
      ]
    }
  };
}

function createColumnsParagraph(text: string): Record<string, unknown> {
  return {
    type: "paragraph",
    content: [{ type: "text", text }]
  };
}

function createColumnsHeading(level: 1 | 2 | 3, text: string): Record<string, unknown> {
  return {
    type: "heading",
    attrs: { level },
    content: [{ type: "text", text }]
  };
}

function createColumnsColumnNode(content: Record<string, unknown>[] = []): Record<string, unknown> {
  const columnNode: Record<string, unknown> = {
    type: "column"
  };

  columnNode.content = content.length > 0 ? content : [{ type: "paragraph" }];

  return columnNode;
}

function createColumnsDocumentEnvelope(columns: Record<string, unknown>[][]): DocseraDocumentEnvelope {
  return {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: {
      type: "doc",
      content: [
        {
          type: "columns",
          content: columns.map((columnContent) => createColumnsColumnNode(columnContent))
        }
      ]
    }
  };
}

export function createTwoColumnDocseraDocumentEnvelope(): DocseraDocumentEnvelope {
  return createColumnsDocumentEnvelope([
    [
      createColumnsHeading(2, "Overview"),
      createColumnsParagraph("Left column")
    ],
    [
      createColumnsParagraph("Right column"),
      {
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "Nested list item" }]
              }
            ]
          }
        ]
      }
    ]
  ]);
}

export function createThreeColumnDocseraDocumentEnvelope(): DocseraDocumentEnvelope {
  return createColumnsDocumentEnvelope([
    [createColumnsParagraph("Alpha")],
    [],
    [createColumnsParagraph("Charlie")]
  ]);
}

export function createFourColumnDocseraDocumentEnvelope(): DocseraDocumentEnvelope {
  return createColumnsDocumentEnvelope([
    [createColumnsParagraph("North")],
    [createColumnsParagraph("East")],
    [createColumnsParagraph("South")],
    [createColumnsParagraph("West")]
  ]);
}

export function createRelativeLinkDocseraDocumentEnvelope(): DocseraDocumentEnvelope {
  return {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "Relative link",
              marks: [
                {
                  type: "link",
                  attrs: {
                    href: "./getting-started?mode=edit#overview",
                    target: "_blank",
                    rel: "noopener noreferrer nofollow",
                    class: null,
                    title: "Open guide"
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

export function createOrderedListDefaultAttrsDocseraDocumentEnvelope(): DocseraDocumentEnvelope {
  return {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: {
      type: "doc",
      content: [
        {
          type: "orderedList",
          content: [
            {
              type: "listItem",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Default ordered list item" }]
                }
              ]
            }
          ]
        }
      ]
    }
  };
}

export function createStandardTableDocseraDocumentEnvelope(): DocseraDocumentEnvelope {
  return {
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
                  attrs: { colspan: 2, rowspan: 1, colwidth: [120, 140] },
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        {
                          type: "text",
                          text: "Plan",
                          marks: [{ type: "bold" }]
                        }
                      ]
                    }
                  ]
                },
                {
                  type: "tableHeader",
                  attrs: { colspan: 1, rowspan: 2, colwidth: null },
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Owner" }]
                    }
                  ]
                }
              ]
            },
            {
              type: "tableRow",
              content: [
                {
                  type: "tableCell",
                  attrs: { colspan: 1, rowspan: 1, colwidth: null },
                  content: [
                    {
                      type: "paragraph",
                      content: [
                        { type: "text", text: "Alpha " },
                        {
                          type: "text",
                          text: "launch",
                          marks: [
                            {
                              type: "link",
                              attrs: {
                                href: "https://example.com/launch",
                                target: "_blank",
                                rel: "noopener noreferrer nofollow",
                                class: null,
                                title: null
                              }
                            },
                            { type: "italic" }
                          ]
                        }
                      ]
                    },
                    {
                      type: "bulletList",
                      content: [
                        {
                          type: "listItem",
                          content: [
                            {
                              type: "paragraph",
                              content: [{ type: "text", text: "Nested block" }]
                            }
                          ]
                        }
                      ]
                    }
                  ]
                },
                {
                  type: "tableCell",
                  attrs: { colspan: 1, rowspan: 1, colwidth: null },
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Beta" }]
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

export function createNestedTableDocseraDocumentEnvelope(): DocseraDocumentEnvelope {
  return {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: {
      type: "doc",
      content: [
        {
          type: "blockquote",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Quote before table" }]
            },
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
                          content: [{ type: "text", text: "Nested quote table" }]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        },
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
                                      content: [{ type: "text", text: "Nested cell table" }]
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
      ]
    }
  };
}

export function createLargeCanonicalDocseraDocumentEnvelope(paragraphCount = 1200): DocseraDocumentEnvelope {
  return {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: {
      type: "doc",
      content: Array.from({ length: paragraphCount }, (_, index) => ({
        type: "paragraph",
        content: [
          {
            type: "text",
            text: `Docsera canonical capacity caf\u00e9 na\u00efve paragraph ${index + 1}${index === paragraphCount - 1 ? "\n" : ""}`
          }
        ]
      }))
    }
  };
}

export function createDocseraDocumentFixtureCorpus(): DocseraDocumentFixtureCase[] {
  const currentEnvelope = createEmptyDocseraDocumentEnvelope();

  return [
    {
      input: currentEnvelope,
      label: "current envelope",
      expected: {
        ok: true,
        migratedLegacyDocument: false
      }
    },
    {
      input: createLegacyDocseraDocument(),
      label: "legacy raw document",
      expected: {
        ok: true,
        migratedLegacyDocument: true
      }
    },
    {
      input: createCanonicalDocseraDocumentEnvelope(),
      label: "paragraph document",
      expected: {
        ok: true,
        migratedLegacyDocument: false
      }
    },
    {
      input: createSingleItemAccordionDocseraDocumentEnvelope().document,
      label: "raw single-item accordion document",
      expected: {
        ok: true,
        migratedLegacyDocument: true
      }
    },
    {
      input: createSingleItemAccordionDocseraDocumentEnvelope(),
      label: "single-item accordion document",
      expected: {
        ok: true,
        migratedLegacyDocument: false
      }
    },
    {
      input: createMultiItemAccordionDocseraDocumentEnvelope(),
      label: "multi-item accordion document",
      expected: {
        ok: true,
        migratedLegacyDocument: false
      }
    },
    {
      input: createHeadingPairDocseraDocumentEnvelope(),
      label: "heading pair document",
      expected: {
        ok: true,
        migratedLegacyDocument: false
      }
    },
    {
      input: createDuplicateHeadingDocseraDocumentEnvelope(),
      label: "duplicate heading document",
      expected: {
        ok: true,
        migratedLegacyDocument: false
      }
    },
    {
      input: createEmptyHeadingDocseraDocumentEnvelope(),
      label: "empty heading document",
      expected: {
        ok: true,
        migratedLegacyDocument: false
      }
    },
    {
      input: createSupportedE2DocseraDocumentEnvelope(),
      label: "supported rich E2 document",
      expected: {
        ok: true,
        migratedLegacyDocument: false
      }
    },
    {
      input: createExpandedTextFormattingDocseraDocumentEnvelope(),
      label: "expanded text formatting document",
      expected: {
        ok: true,
        migratedLegacyDocument: false
      }
    },
    {
      input: createRelativeLinkDocseraDocumentEnvelope(),
      label: "safe relative link document",
      expected: {
        ok: true,
        migratedLegacyDocument: false
      }
    },
    {
      input: createOrderedListDefaultAttrsDocseraDocumentEnvelope(),
      label: "ordered list default attributes document",
      expected: {
        ok: true,
        migratedLegacyDocument: false
      }
    },
    {
      input: createNestedTaskListDocseraDocumentEnvelope(),
      label: "nested task list document",
      expected: {
        ok: true,
        migratedLegacyDocument: false
      }
    },
    {
      input: createTaskCheckedStateDocseraDocumentEnvelope(true),
      label: "checked task document",
      expected: {
        ok: true,
        migratedLegacyDocument: false
      }
    },
    {
      input: createTaskCheckedStateDocseraDocumentEnvelope(false),
      label: "unchecked task document",
      expected: {
        ok: true,
        migratedLegacyDocument: false
      }
    },
    {
      input: createCodeBlockWhitespaceDocseraDocumentEnvelope(),
      label: "code block with terminal whitespace",
      expected: {
        ok: true,
        migratedLegacyDocument: false
      }
    },
    {
      input: createCombinedInlineMarksDocseraDocumentEnvelope(),
      label: "combined inline marks document",
      expected: {
        ok: true,
        migratedLegacyDocument: false
      }
    },
    {
      input: createStandardTableDocseraDocumentEnvelope(),
      label: "standard table document",
      expected: {
        ok: true,
        migratedLegacyDocument: false
      }
    },
    {
      input: createNestedTableDocseraDocumentEnvelope(),
      label: "nested table document",
      expected: {
        ok: true,
        migratedLegacyDocument: false
      }
    },
    {
      input: createCanonicalImageDocseraDocumentEnvelope(),
      label: "canonical image document",
      expected: {
        ok: true,
        migratedLegacyDocument: false
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
          type: "doc",
          content: [
            {
              type: "blockquote",
              content: [
                {
                  type: "paragraph",
                  content: [{ type: "text", text: "Ordinary quote" }]
                },
                {
                  type: "bulletList",
                  content: [
                    {
                      type: "listItem",
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Nested quote list item" }]
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
      label: "ordinary blockquote document",
      expected: {
        ok: true,
        migratedLegacyDocument: false
      }
    },
    {
      input: "not-json",
      label: "malformed JSON",
      expected: {
        ok: false,
        reason: "invalid-json"
      }
    },
    {
      input: {
        schemaVersion: 0,
        document: { type: "doc", content: [] }
      },
      label: "unsupported lower schema version",
      expected: {
        ok: false,
        reason: "unsupported-schema-version"
      }
    },
    {
      input: {
        schemaVersion: 2,
        document: { type: "doc", content: [] }
      },
      label: "unsupported higher schema version",
      expected: {
        ok: false,
        reason: "unsupported-schema-version"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: null
      },
      label: "missing document root",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
          type: "doc",
          content: [
            {
              type: "accordion",
              attrs: { accordionId: "accordion-empty" },
              content: []
            }
          ]
        }
      },
      label: "empty accordion rejected",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
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
      },
      label: "malformed accordion item structure",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
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
      },
      label: "duplicate accordion identity rejected",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
          type: "doc",
          content: [
            {
              type: "accordion",
              attrs: { accordionId: "accordion-duplicate-item" },
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
                },
                {
                  type: "accordionItem",
                  attrs: { accordionItemId: "accordion-item-duplicate" },
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
      },
      label: "duplicate accordion item identity rejected",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
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
      },
      label: "nested accordion rejected",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
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
      },
      label: "accordion title structural hardBreak rejected",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
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
      },
      label: "accordion title embedded CR/LF rejected",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
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
      },
      label: "accordion title link mark rejected",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
          type: "doc",
          content: [
            {
              type: "accordion",
              attrs: { accordionId: "accordion-columns-body" },
              content: [
                {
                  type: "accordionItem",
                  attrs: { accordionItemId: "accordion-item-columns-body" },
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
                            {
                              type: "column",
                              content: [
                                {
                                  type: "paragraph",
                                  content: [{ type: "text", text: "Left" }]
                                }
                              ]
                            },
                            {
                              type: "column",
                              content: [
                                {
                                  type: "paragraph",
                                  content: [{ type: "text", text: "Right" }]
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
      },
      label: "accordion body columns document",
      expected: {
        ok: true,
        migratedLegacyDocument: false
      }
    },
    {
      input: {
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
                    {
                      type: "accordion",
                      attrs: { accordionId: "accordion-columns-under-column" },
                      content: [
                        {
                          type: "accordionItem",
                          attrs: { accordionItemId: "accordion-item-columns-under-column" },
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
                                    {
                                      type: "column",
                                      content: [
                                        {
                                          type: "paragraph",
                                          content: [{ type: "text", text: "Nested left" }]
                                        }
                                      ]
                                    },
                                    {
                                      type: "column",
                                      content: [
                                        {
                                          type: "paragraph",
                                          content: [{ type: "text", text: "Nested right" }]
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
                },
                {
                  type: "column",
                  content: [
                    {
                      type: "paragraph",
                      content: [{ type: "text", text: "Safe column" }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      },
      label: "columns beneath a column ancestor rejected through accordion content",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
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
      },
      label: "malformed image node",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
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
      },
      label: "image child content rejected",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
          type: "doc",
          content: [
            {
              type: "blockquote",
              content: [
                {
                  type: "table",
                  content: [
                    {
                      type: "tableRow",
                      content: [
                        {
                          type: "tableCell",
                          content: [{ type: "paragraph", content: [{ type: "text", text: "Nested table" }] }]
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
      label: "table inside blockquote",
      expected: {
        ok: true,
        migratedLegacyDocument: false
      }
    },
    {
      input: {
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
                          type: "blockquote",
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
                                          content: [{ type: "text", text: "Indirect nested table" }]
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
          ]
        }
      },
      label: "table cell blockquote containing table",
      expected: {
        ok: true,
        migratedLegacyDocument: false
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "" }]
            }
          ]
        }
      },
      label: "empty text node rejected by schema",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              attrs: { unknown: "value" }
            }
          ]
        }
      },
      label: "unknown node attribute",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Unsupported absolute scheme",
                  marks: [{ type: "link", attrs: { href: "file:///tmp/docsera.txt" } }]
                }
              ]
            }
          ]
        }
      },
      label: "unsupported absolute URI scheme",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Whitespace-obfuscated javascript",
                  marks: [{ type: "link", attrs: { href: "java\nscript:alert(1)" } }]
                }
              ]
            }
          ]
        }
      },
      label: "whitespace-obfuscated unsafe URI scheme",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
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
      },
      label: "superscript and subscript overlap",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
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
      },
      label: "highlight color attribute rejected",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
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
      },
      label: "unknown mark type",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
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
      },
      label: "unknown mark attribute",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
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
      },
      label: "malformed link attributes",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
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
      },
      label: "unsafe link destination",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
          type: "doc",
          content: [
            {
              type: "heading",
              attrs: { level: 4 },
              content: [{ type: "text", text: "Unsupported heading" }]
            }
          ]
        }
      },
      label: "invalid heading level",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
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
      },
      label: "invalid ordered list start",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
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
      },
      label: "unsupported ordered list type",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
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
      },
      label: "invalid task item attribute",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
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
      },
      label: "invalid nested list content",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
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
      },
      label: "invalid nested task list content",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
          type: "doc",
          content: [{ type: "table" }]
        }
      },
      label: "table without rows",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
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
                      type: "paragraph",
                      content: [{ type: "text", text: "Invalid row child" }]
                    }
                  ]
                }
              ]
            }
          ]
        }
      },
      label: "invalid table row child",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
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
                      attrs: { colspan: 2, rowspan: 1, colwidth: [120] },
                      content: [
                        {
                          type: "paragraph",
                          content: [{ type: "text", text: "Invalid span attrs" }]
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
      label: "invalid table structural attributes",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
        document: {
          type: "doc",
          content: [
            {
              type: "codeBlock",
              attrs: { language: 123 },
              content: [{ type: "text", text: "const value = 1;" }]
            }
          ]
        }
      },
      label: "invalid code block language",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        type: "doc",
        content: {}
      },
      label: "invalid legacy content shape",
      expected: {
        ok: false,
        reason: "invalid-document"
      }
    },
    {
      input: {
        document: {
          type: "doc",
          content: []
        }
      },
      label: "missing envelope version",
      expected: {
        ok: false,
        reason: "invalid-envelope"
      }
    }
  ];
}
