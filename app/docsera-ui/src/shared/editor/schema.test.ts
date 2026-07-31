import { isAllowedUri } from "@tiptap/extension-link";
import { describe, expect, it } from "vitest";
import {
  createCodeBlockWhitespaceDocseraDocumentEnvelope,
  createCombinedInlineMarksDocseraDocumentEnvelope,
  createDuplicateHeadingDocseraDocumentEnvelope,
  createEmptyHeadingDocseraDocumentEnvelope,
  createExpandedTextFormattingDocseraDocumentEnvelope,
  createNestedTaskListDocseraDocumentEnvelope,
  createSupportedE2DocseraDocumentEnvelope,
  createTaskCheckedStateDocseraDocumentEnvelope
} from "./documentFixtures";
import { isDocseraAllowedLinkHref, validateDocseraStructuredDocument } from "./schema";

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
    ["expanded text formatting document", createExpandedTextFormattingDocseraDocumentEnvelope().document]
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
    ]
  ])("rejects %s at the raw validation boundary", (_label, document) => {
    expect(validateDocseraStructuredDocument(document)).toEqual({
      ok: false,
      message: "The stored page content does not contain a valid TipTap document."
    });
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
