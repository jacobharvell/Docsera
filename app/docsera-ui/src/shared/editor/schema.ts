import { Extension, getSchema, type Extensions } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Highlight } from "@tiptap/extension-highlight";
import { Link } from "@tiptap/extension-link";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
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
export const DOCSERA_EMPTY_PARAGRAPH_PLACEHOLDER = "Start typing or press '/' for commands";
export const DOCSERA_EMPTY_HEADING_PLACEHOLDERS: Record<number, string> = {
  1: "Heading 1",
  2: "Heading 2",
  3: "Heading 3"
};
export const DOCSERA_EMPTY_BLOCKQUOTE_PLACEHOLDER = "Enter a quote";

const EmptyParagraphPlaceholder = Extension.create({
  name: "docseraEmptyParagraphPlaceholder",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];

            state.doc.forEach((node, offset) => {
              if (node.type.name === "paragraph" && node.content.size === 0) {
                decorations.push(
                  Decoration.node(offset, offset + node.nodeSize, {
                    "data-docsera-empty-paragraph": "true",
                    "data-placeholder": DOCSERA_EMPTY_PARAGRAPH_PLACEHOLDER
                  })
                );
                return;
              }

              if (node.type.name === "heading" && node.content.size === 0) {
                const placeholder = DOCSERA_EMPTY_HEADING_PLACEHOLDERS[node.attrs.level as number];
                if (placeholder) {
                  decorations.push(
                    Decoration.node(offset, offset + node.nodeSize, {
                      "data-docsera-empty-heading": "true",
                      "data-placeholder": placeholder
                    })
                  );
                }
                return;
              }

              if (
                node.type.name === "blockquote" &&
                node.childCount === 1 &&
                node.firstChild?.type.name === "paragraph" &&
                node.firstChild.content.size === 0
              ) {
                decorations.push(
                  Decoration.node(offset + 1, offset + node.nodeSize - 1, {
                    "data-docsera-empty-blockquote": "true",
                    "data-placeholder": DOCSERA_EMPTY_BLOCKQUOTE_PLACEHOLDER
                  })
                );
              }
            });

            return decorations.length ? DecorationSet.create(state.doc, decorations) : DecorationSet.empty;
          }
        }
      })
    ];
  }
});

export function createDocseraEditorExtensions(): Extensions {
  return [
    Document.extend({
      content: "block*"
    }),
    StarterKit.configure({
      document: false,
      heading: { levels: [...DOCSERA_BODY_HEADING_LEVELS] },
      link: false,
      trailingNode: false,
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
    TaskList.configure({}),
    EmptyParagraphPlaceholder
  ];
}

export function getDocseraEditorSchema(): Schema {
  if (!cachedDocseraEditorSchema) {
    cachedDocseraEditorSchema = getSchema(createDocseraEditorExtensions());
  }

  return cachedDocseraEditorSchema;
}
