import {
  createEmptyDocseraDocumentEnvelope,
  DOCSERA_DOCUMENT_SCHEMA_VERSION,
  type DocseraDocumentEnvelope,
  type DocseraTiptapDocument
} from "./document";

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
      input: createSupportedE2DocseraDocumentEnvelope(),
      label: "supported rich E2 document",
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
              type: "image"
            }
          ]
        }
      },
      label: "unknown node type",
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
                  text: "Unsupported mark",
                  marks: [{ type: "underline" }]
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
              attrs: { level: 1 },
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
