import { Extension, Node, getSchema, mergeAttributes, type Extensions } from "@tiptap/core";
import { Document } from "@tiptap/extension-document";
import { Highlight } from "@tiptap/extension-highlight";
import { Link } from "@tiptap/extension-link";
import { TaskItem, TaskList } from "@tiptap/extension-list";
import { Table, TableCell as BaseTableCell, TableHeader as BaseTableHeader, TableRow } from "@tiptap/extension-table";
import { EditorState, Plugin } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { CellSelection, findTable, selectedRect, TableMap } from "@tiptap/pm/tables";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { Underline } from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import type { Schema } from "@tiptap/pm/model";
import { DOCSERA_IMAGE_DEFAULTS, DOCSERA_IMAGE_ALIGNMENTS, canonicalizeDocseraImageAttrs, type DocseraImageAttrs, type WorkspaceMediaLoader } from "./imageContract";
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

function normalizeTableColumnWidths(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  return value.every((width) => Number.isInteger(width) && Number(width) > 0) ? (value as number[]) : null;
}

function createUnavailableMediaView(attrs: DocseraImageAttrs): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "docsera-main__editor-recovery docsera-main__media-unavailable docsera-editor-image__unavailable";
  wrapper.setAttribute("role", "status");

  const eyebrow = document.createElement("p");
  eyebrow.className = "docsera-main__eyebrow";
  eyebrow.textContent = "Media";

  const title = document.createElement("h3");
  title.className = "docsera-main__recovery-title";
  title.textContent = "Image unavailable";

  const lede = document.createElement("p");
  lede.className = "docsera-main__lede";
  lede.textContent = attrs.alt || "The referenced image could not be resolved.";

  wrapper.append(eyebrow, title, lede);
  return wrapper;
}

function createLoadingMediaView(attrs: DocseraImageAttrs): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "docsera-main__editor-recovery docsera-main__media-loading docsera-editor-image__loading";
  wrapper.setAttribute("role", "status");

  const eyebrow = document.createElement("p");
  eyebrow.className = "docsera-main__eyebrow";
  eyebrow.textContent = "Media";

  const title = document.createElement("h3");
  title.className = "docsera-main__recovery-title";
  title.textContent = "Loading image";

  const lede = document.createElement("p");
  lede.className = "docsera-main__lede";
  lede.textContent = attrs.alt || "The image is being loaded through the authenticated media boundary.";

  wrapper.append(eyebrow, title, lede);
  return wrapper;
}

function createDocseraImageExtension(loadMedia: WorkspaceMediaLoader) {
  return Node.create({
    name: "image",
    group: "block",
    atom: true,
    draggable: true,
    selectable: true,
    addAttributes() {
      return {
        mediaId: {
          default: null,
          renderHTML: (attributes) =>
            typeof attributes.mediaId === "string" && attributes.mediaId.length > 0
              ? { "data-docsera-media-id": attributes.mediaId }
              : {}
        },
        darkMediaId: {
          default: null,
          renderHTML: (attributes) =>
            typeof attributes.darkMediaId === "string" && attributes.darkMediaId.length > 0
              ? { "data-docsera-dark-media-id": attributes.darkMediaId }
              : {}
        },
        alt: {
          default: DOCSERA_IMAGE_DEFAULTS.alt,
          renderHTML: (attributes) => ({ "data-docsera-alt": typeof attributes.alt === "string" ? attributes.alt : DOCSERA_IMAGE_DEFAULTS.alt })
        },
        caption: {
          default: DOCSERA_IMAGE_DEFAULTS.caption,
          renderHTML: (attributes) => ({
            "data-docsera-caption": typeof attributes.caption === "string" ? attributes.caption : DOCSERA_IMAGE_DEFAULTS.caption
          })
        },
        frame: {
          default: DOCSERA_IMAGE_DEFAULTS.frame,
          renderHTML: (attributes) => ({ "data-docsera-frame": attributes.frame === false ? "false" : "true" })
        },
        align: {
          default: DOCSERA_IMAGE_DEFAULTS.align,
          renderHTML: (attributes) => ({
            "data-docsera-align":
              typeof attributes.align === "string" && DOCSERA_IMAGE_ALIGNMENTS.includes(attributes.align as DocseraImageAttrs["align"])
                ? attributes.align
                : DOCSERA_IMAGE_DEFAULTS.align
          })
        },
        widthPct: {
          default: DOCSERA_IMAGE_DEFAULTS.widthPct,
          renderHTML: (attributes) => ({
            "data-docsera-width-pct": String(
              Number.isFinite(Number(attributes.widthPct))
                ? Math.min(100, Math.max(20, Number(attributes.widthPct)))
                : DOCSERA_IMAGE_DEFAULTS.widthPct
            )
          })
        }
      };
    },
    addNodeView() {
      return ({ node, editor }) => {
        const figure = document.createElement("figure");
        let activeLoadId = 0;
        let activeMediaId = "";
        let activeObjectUrl: string | null = null;
        let activeController: AbortController | null = null;
        let destroyed = false;

        function revokeActiveObjectUrl(): void {
          if (activeObjectUrl && typeof URL.revokeObjectURL === "function") {
            URL.revokeObjectURL(activeObjectUrl);
          }
          activeObjectUrl = null;
        }

        function renderState(attrs: DocseraImageAttrs, state: "loading" | "ready" | "unavailable"): void {
          figure.className = "docsera-editor-image";
          figure.dataset.docseraImageAlign = attrs.align;
          figure.dataset.docseraImageFrame = attrs.frame ? "true" : "false";
          figure.dataset.docseraImageWidthPct = String(attrs.widthPct);
          figure.style.width = `${attrs.widthPct}%`;
          figure.style.marginInlineStart = attrs.align === "center" || attrs.align === "right" ? "auto" : "0";
          figure.style.marginInlineEnd = attrs.align === "center" || attrs.align === "left" ? "auto" : "0";
          figure.replaceChildren();

          if (state === "loading") {
            figure.append(createLoadingMediaView(attrs));
            return;
          }

          if (state === "unavailable" || !activeObjectUrl) {
            figure.append(createUnavailableMediaView(attrs));
            return;
          }

          const image = document.createElement("img");
          image.className = "docsera-editor-image__image docsera-main__media-image";
          image.alt = attrs.alt;
          image.src = activeObjectUrl;
          image.draggable = false;
          figure.append(image);

          if (attrs.caption) {
            const caption = document.createElement("figcaption");
            caption.className = "docsera-editor-image__caption docsera-main__media-caption";
            caption.textContent = attrs.caption;
            figure.append(caption);
          }
        }

        const render = () => {
          if (destroyed) {
            return;
          }

          const attrs = canonicalizeDocseraImageAttrs(node.attrs);
          const nextMediaId = attrs.mediaId;
          if (nextMediaId === activeMediaId && activeObjectUrl) {
            renderState(attrs, "ready");
            return;
          }

          activeLoadId += 1;
          const loadId = activeLoadId;
          activeMediaId = nextMediaId;
          activeController?.abort();
          const controller = new AbortController();
          activeController = controller;
          revokeActiveObjectUrl();
          renderState(attrs, "loading");

          if (!nextMediaId) {
            renderState(attrs, "unavailable");
            return;
          }

          void loadMedia({ mediaId: nextMediaId, signal: controller.signal })
            .then((blob) => {
              if (destroyed || loadId !== activeLoadId || controller.signal.aborted) {
                return;
              }

              if (!blob) {
                renderState(attrs, "unavailable");
                return;
              }

              if (typeof URL.createObjectURL !== "function") {
                renderState(attrs, "unavailable");
                return;
              }

              activeObjectUrl = URL.createObjectURL(blob);
              renderState(attrs, "ready");
            })
            .catch(() => {
              if (destroyed || loadId !== activeLoadId || controller.signal.aborted) {
                return;
              }

              renderState(attrs, "unavailable");
            });
        };

        render();

        return {
          dom: figure,
          update(updatedNode) {
            if (destroyed || updatedNode.type.name !== node.type.name) {
              return false;
            }

            node = updatedNode;
            render();
            return true;
          },
          destroy() {
            destroyed = true;
            activeLoadId += 1;
            activeController?.abort();
            activeController = null;
            revokeActiveObjectUrl();
          }
        };
      };
    },
    renderHTML({ HTMLAttributes }) {
      return ["figure", mergeAttributes(HTMLAttributes, { class: "docsera-image" })];
    }
  });
}

const TableCell = BaseTableCell.extend({
  addAttributes() {
    const parentAttributes = (this.parent?.() ?? {}) as {
      colwidth?: {
        default?: unknown;
        parseHTML?: (element: HTMLElement) => unknown;
      };
    };
    const parentColwidth = parentAttributes.colwidth as
      | {
          default?: unknown;
          parseHTML?: (element: HTMLElement) => unknown;
        }
      | undefined;

    return {
      ...parentAttributes,
      colwidth: {
        ...parentColwidth,
        default: null,
        parseHTML: (element: HTMLElement) => normalizeTableColumnWidths(parentColwidth?.parseHTML?.(element))
      }
    };
  }
});

const TableHeader = BaseTableHeader.extend({
  addAttributes() {
    const parentAttributes = (this.parent?.() ?? {}) as {
      colwidth?: {
        default?: unknown;
        parseHTML?: (element: HTMLElement) => unknown;
      };
    };
    const parentColwidth = parentAttributes.colwidth as
      | {
          default?: unknown;
          parseHTML?: (element: HTMLElement) => unknown;
        }
      | undefined;

    return {
      ...parentAttributes,
      colwidth: {
        ...parentColwidth,
        default: null,
        parseHTML: (element: HTMLElement) => normalizeTableColumnWidths(parentColwidth?.parseHTML?.(element))
      }
    };
  }
});

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

type CellOutlineEdges = {
  bottom: boolean;
  left: boolean;
  right: boolean;
  top: boolean;
};

function createEmptyCellOutlineEdges(): CellOutlineEdges {
  return {
    bottom: false,
    left: false,
    right: false,
    top: false
  };
}

function buildPerimeterDecorations(
  state: EditorState,
  activeTable: NonNullable<ReturnType<typeof findTable>>,
  currentRect: NonNullable<ReturnType<typeof selectedRect>>
): DecorationSet {
  const map = TableMap.get(activeTable.node);
  const outlineEdgesByCellPos = new Map<number, CellOutlineEdges>();

  for (let rowIndex = currentRect.top; rowIndex < currentRect.bottom; rowIndex += 1) {
    for (let columnIndex = currentRect.left; columnIndex < currentRect.right; columnIndex += 1) {
      const relativeCellPos = map.map[rowIndex * map.width + columnIndex];
      if (typeof relativeCellPos !== "number") {
        continue;
      }

      const cellPos = activeTable.start + relativeCellPos;
      const nextEdges = outlineEdgesByCellPos.get(cellPos) ?? createEmptyCellOutlineEdges();
      if (rowIndex === currentRect.top) {
        nextEdges.top = true;
      }
      if (rowIndex === currentRect.bottom - 1) {
        nextEdges.bottom = true;
      }
      if (columnIndex === currentRect.left) {
        nextEdges.left = true;
      }
      if (columnIndex === currentRect.right - 1) {
        nextEdges.right = true;
      }
      outlineEdgesByCellPos.set(cellPos, nextEdges);
    }
  }

  const decorations: Decoration[] = [];
  for (const [cellPos, edges] of outlineEdgesByCellPos.entries()) {
    const classNames = ["docsera-table-selection-outline"];
    if (edges.top) classNames.push("docsera-table-selection-outline--top");
    if (edges.right) classNames.push("docsera-table-selection-outline--right");
    if (edges.bottom) classNames.push("docsera-table-selection-outline--bottom");
    if (edges.left) classNames.push("docsera-table-selection-outline--left");

    if (classNames.length === 1) {
      continue;
    }

    const cellNode = state.doc.nodeAt(cellPos);
    if (!cellNode) {
      continue;
    }

    decorations.push(
      Decoration.node(cellPos, cellPos + cellNode.nodeSize, {
        class: classNames.join(" ")
      })
    );
  }

  return decorations.length ? DecorationSet.create(state.doc, decorations) : DecorationSet.empty;
}

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

            if (!rect) {
              return DecorationSet.empty;
            }

            if (
              state.selection instanceof CellSelection &&
              (rect.bottom - rect.top > 1 || rect.right - rect.left > 1)
            ) {
              return buildPerimeterDecorations(state, activeTable, rect);
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
  return createDocseraEditorExtensionsWithOptions();
}

type CreateDocseraEditorExtensionsOptions = {
  loadMedia?: WorkspaceMediaLoader;
};

export function createDocseraEditorExtensionsWithOptions(options: CreateDocseraEditorExtensionsOptions = {}): Extensions {
  const loadMedia = options.loadMedia ?? (async () => null);

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
    createDocseraImageExtension(loadMedia),
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
