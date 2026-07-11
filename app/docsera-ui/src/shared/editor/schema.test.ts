import { describe, expect, it } from "vitest";
import {
  createCodeBlockWhitespaceDocseraDocumentEnvelope,
  createCombinedInlineMarksDocseraDocumentEnvelope,
  createNestedTaskListDocseraDocumentEnvelope,
  createSupportedE2DocseraDocumentEnvelope,
  createTaskCheckedStateDocseraDocumentEnvelope
} from "./documentFixtures";
import { validateDocseraStructuredDocument } from "./schema";

describe("Docsera structured document validation", () => {
  it.each([
    ["supported rich E2 document", createSupportedE2DocseraDocumentEnvelope().document],
    ["nested task list document", createNestedTaskListDocseraDocumentEnvelope().document],
    ["checked task state document", createTaskCheckedStateDocseraDocumentEnvelope(true).document],
    ["unchecked task state document", createTaskCheckedStateDocseraDocumentEnvelope(false).document],
    ["code block terminal whitespace", createCodeBlockWhitespaceDocseraDocumentEnvelope().document],
    ["combined inline marks document", createCombinedInlineMarksDocseraDocumentEnvelope().document]
  ])("accepts %s at the raw validation boundary", (_label, document) => {
    expect(validateDocseraStructuredDocument(document)).toEqual({ ok: true });
  });

  it.each([
    [
      "unknown node type",
      {
        type: "doc",
        content: [
          {
            type: "image"
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
                marks: [{ type: "underline" }]
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
            attrs: { level: 1 },
            content: [{ type: "text", text: "Unsupported heading" }]
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
