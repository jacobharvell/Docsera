import { getSchema, type Extensions } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Highlight } from "@tiptap/extension-highlight";
import { Link } from "@tiptap/extension-link";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { Underline } from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import type { Schema } from "@tiptap/pm/model";
import {
  DOCSERA_BODY_HEADING_LEVELS,
  canonicalizeDocseraStructuredDocument,
  isDocseraAllowedLinkHref,
  validateDocseraStructuredDocument
} from "../../server/pages/serverEditorDocument";

export {
  DOCSERA_BODY_HEADING_LEVELS,
  canonicalizeDocseraStructuredDocument,
  isDocseraAllowedLinkHref,
  validateDocseraStructuredDocument
};

let cachedDocseraEditorSchema: Schema | null = null;

export function createDocseraEditorExtensions(): Extensions {
  return [
    Document.extend({
      content: "block*"
    }),
    StarterKit.configure({
      document: false,
      heading: { levels: [...DOCSERA_BODY_HEADING_LEVELS] },
      link: false,
      orderedList: {
        keepAttributes: true,
        keepMarks: true
      },
      bulletList: {
        keepAttributes: false,
        keepMarks: true
      },
      underline: false
    }),
    Underline,
    Highlight.configure({
      multicolor: false
    }),
    Superscript,
    Subscript,
    Link.configure({
      autolink: true,
      linkOnPaste: true,
      openOnClick: false,
      isAllowedUri: (url) => isDocseraAllowedLinkHref(url)
    }),
    TaskItem.configure({
      nested: true
    }),
    TaskList.configure({})
  ];
}

export function getDocseraEditorSchema(): Schema {
  if (!cachedDocseraEditorSchema) {
    cachedDocseraEditorSchema = getSchema(createDocseraEditorExtensions());
  }

  return cachedDocseraEditorSchema;
}
