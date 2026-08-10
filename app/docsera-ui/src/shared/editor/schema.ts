import { Extension, getSchema, type Extensions } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Highlight } from "@tiptap/extension-highlight";
import { Link } from "@tiptap/extension-link";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Table, TableCell as BaseTableCell, TableHeader as BaseTableHeader, TableRow } from "@tiptap/extension-table";
import { Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { findTable, selectedRect, TableMap } from "@tiptap/pm/tables";
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

function parseTableColumnWidths(element: HTMLElement): number[] | null {
  const colwidth = element.getAttribute("colwidth");
  if (!colwidth) {
    return null;
  }

  const widths = colwidth.split(",").map((width) => Number.parseInt(width, 10));
  return widths.length > 0 && widths.every((width) => Number.isInteger(width) && width > 0) ? widths : null;
}

const TableCell = BaseTableCell.extend({
  addAttributes() {
    return {
      colspan: {
        default: 1
      },
      rowspan: {
        default: 1
      },
      colwidth: {
        default: null,
        parseHTML: parseTableColumnWidths
      }
    };
  }
});

const TableHeader = BaseTableHeader.extend({
  addAttributes() {
    return {
      colspan: {
        default: 1
      },
      rowspan: {
        default: 1
      },
      colwidth: {
        default: null,
        parseHTML: parseTableColumnWidths
      }
    };
  }
});

const ActiveTableCellHighlight = Extension.create({
  name: "docseraActiveTableCellHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        props: {
          decorations(state) {
            const activeTable = findTable(state.selection.$from);
            if (!activeTable) {
              return DecorationSet.empty;
            }

            let rect: ReturnType<typeof selectedRect> | null = null;
            try {
              rect = selectedRect(state);
            } catch {
              return DecorationSet.empty;
            }

            const map = TableMap.get(activeTable.node);
            const rowIndex = Math.max(0, Math.min(rect.top, map.height - 1));
            const columnIndex = Math.max(0, Math.min(rect.left, map.width - 1));
            const cellPos = activeTable.start + map.positionAt(rowIndex, columnIndex, activeTable.node);
            const cellNode = state.doc.nodeAt(cellPos);
            if (!cellNode) {
              return DecorationSet.empty;
            }

            return DecorationSet.create(state.doc, [
              Decoration.node(cellPos, cellPos + cellNode.nodeSize, {
                class: "docsera-table-cell-active"
              })
            ]);
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
    Table.configure({
      resizable: false,
      renderWrapper: true,
      cellMinWidth: 80,
      allowTableNodeSelection: false
    }),
    TableRow,
    TableHeader,
    TableCell,
    ActiveTableCellHighlight,
    EmptyParagraphPlaceholder
  ];
}

export function getDocseraEditorSchema(): Schema {
  if (!cachedDocseraEditorSchema) {
    cachedDocseraEditorSchema = getSchema(createDocseraEditorExtensions());
  }

  return cachedDocseraEditorSchema;
}
