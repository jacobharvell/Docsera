import { Extension, Node, getSchema, mergeAttributes, type Extensions } from "@tiptap/core";
import { Blockquote as BaseBlockquote } from "@tiptap/extension-blockquote";
import { Document } from "@tiptap/extension-document";
import { Highlight } from "@tiptap/extension-highlight";
import { Link } from "@tiptap/extension-link";
import { ListItem as BaseListItem, TaskItem, TaskList } from "@tiptap/extension-list";
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
  resolveDocseraImageDisplayTheme,
  subscribeDocseraImageDisplayState
} from "../../client/shared/editor/imageDisplayState";
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
export const DOCSERA_EMPTY_ACCORDION_TITLE_PLACEHOLDER = "New accordion";
const DOCSERA_ACCORDION_NESTED_BLOCK_CONTENT =
  "(paragraph | heading | image | bulletList | orderedList | taskList | blockquote | horizontalRule | codeBlock | table)";

function normalizeTableColumnWidths(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  return value.every((width) => Number.isInteger(width) && Number(width) > 0) ? (value as number[]) : null;
}

function createUnavailableMediaView(attrs: DocseraImageAttrs): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "docsera-main__editor-recovery docsera-main__media-unavailable docsera-editor-image__surface docsera-editor-image__unavailable";
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

function createDocseraAccordionExtensions() {
  const accordionRenderAttrs = {
    class: "docsera-editor-accordion"
  };
  const accordionItemRenderAttrs = {
    class: "docsera-editor-accordion__item"
  };
  const accordionTitleRenderAttrs = {
    class: "docsera-editor-accordion__title"
  };
  const accordionContentRenderAttrs = {
    class: "docsera-editor-accordion__content"
  };
  const DocseraBlockquote = BaseBlockquote.extend({
    content: `${DOCSERA_ACCORDION_NESTED_BLOCK_CONTENT}+`
  });

  const DocseraListItem = BaseListItem.extend({
    content: `paragraph ${DOCSERA_ACCORDION_NESTED_BLOCK_CONTENT}*`
  });

  const DocseraTaskItem = TaskItem.extend({
    content: `paragraph ${DOCSERA_ACCORDION_NESTED_BLOCK_CONTENT}*`
  }).configure({
    nested: true
  });

  const DocseraTableCell = BaseTableCell.extend({
    content: `${DOCSERA_ACCORDION_NESTED_BLOCK_CONTENT}+`,
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

  const DocseraTableHeader = BaseTableHeader.extend({
    content: `${DOCSERA_ACCORDION_NESTED_BLOCK_CONTENT}+`,
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

  return [
    Node.create({
      name: "accordion",
      group: "block",
      content: "accordionItem+",
      draggable: true,
      selectable: true,
      addAttributes() {
        return {
          accordionId: {
            default: null,
            renderHTML: (attributes) =>
              typeof attributes.accordionId === "string" && attributes.accordionId.length > 0
                ? { "data-docsera-accordion-id": attributes.accordionId }
                : {}
          }
        };
      },
      parseHTML() {
        return [{ tag: "div[data-docsera-accordion='true']" }];
      },
      renderHTML({ HTMLAttributes }) {
        return [
          "div",
          mergeAttributes(HTMLAttributes, {
            ...accordionRenderAttrs,
            "data-docsera-accordion": "true"
          }),
          0
        ];
      }
    }),
    Node.create({
      name: "accordionItem",
      content: "accordionTitle accordionContent",
      draggable: false,
      selectable: false,
      addAttributes() {
        return {
          accordionItemId: {
            default: null,
            renderHTML: (attributes) =>
              typeof attributes.accordionItemId === "string" && attributes.accordionItemId.length > 0
                ? { "data-docsera-accordion-item-id": attributes.accordionItemId }
                : {}
          }
        };
      },
      parseHTML() {
        return [{ tag: "div[data-docsera-accordion-item='true']" }];
      },
      renderHTML({ HTMLAttributes }) {
        return [
          "div",
          mergeAttributes(HTMLAttributes, {
            ...accordionItemRenderAttrs,
            "data-docsera-accordion-item": "true"
          }),
          0
        ];
      }
    }),
    Node.create({
      name: "accordionTitle",
      content: "text*",
      marks: "bold italic strike code underline highlight superscript subscript",
      selectable: false,
      parseHTML() {
        return [{ tag: "p[data-docsera-accordion-title='true']" }];
      },
      renderHTML({ HTMLAttributes }) {
        return [
          "p",
          mergeAttributes(HTMLAttributes, {
            ...accordionTitleRenderAttrs,
            "data-docsera-accordion-title": "true"
          }),
          0
        ];
      }
    }),
    Node.create({
      name: "accordionContent",
      content: `${DOCSERA_ACCORDION_NESTED_BLOCK_CONTENT}+`,
      selectable: false,
      parseHTML() {
        return [{ tag: "div[data-docsera-accordion-content='true']" }];
      },
      renderHTML({ HTMLAttributes }) {
        return [
          "div",
          mergeAttributes(HTMLAttributes, {
            ...accordionContentRenderAttrs,
            "data-docsera-accordion-content": "true"
          }),
          0
        ];
      }
    }),
    DocseraBlockquote,
    DocseraListItem,
    DocseraTaskItem,
    DocseraTableCell,
    DocseraTableHeader
  ];
}

function createLoadingMediaView(): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "docsera-main__media-loading docsera-editor-image__surface docsera-editor-image__loading";
  wrapper.setAttribute("role", "status");
  wrapper.setAttribute("aria-label", "Loading image");
  wrapper.setAttribute("aria-busy", "true");
  wrapper.style.display = "block";
  wrapper.style.minHeight = "8rem";
  wrapper.style.padding = "0";
  wrapper.style.borderRadius = "inherit";
  wrapper.style.background = "color-mix(in srgb, var(--docsera-editor-panel) 90%, var(--docsera-editor-muted) 10%)";
  wrapper.style.boxShadow = "none";
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
      return ({ node, editor, getPos }) => {
        const figure = document.createElement("figure");
        const surface = document.createElement("div");
        const mediaStateById = new Map<
          string,
          {
            controller: AbortController | null;
            loadId: number;
            objectUrl: string | null;
            status: "idle" | "loading" | "ready" | "unavailable";
          }
        >();
        let destroyed = false;

        function revokeObjectUrl(objectUrl: string | null): void {
          if (objectUrl && typeof URL.revokeObjectURL === "function") {
            URL.revokeObjectURL(objectUrl);
          }
        }

        function getBlockIndex(): number | null {
          const position = typeof getPos === "function" ? getPos() : null;
          if (typeof position !== "number") {
            return null;
          }

          let blockIndex: number | null = null;
          editor.state.doc.forEach((_block, offset, index) => {
            if (offset === position) {
              blockIndex = index;
            }
          });
          return blockIndex;
        }

        function getMediaState(mediaId: string): {
          objectUrl: string | null;
          status: "idle" | "loading" | "ready" | "unavailable";
        } {
          return mediaStateById.get(mediaId) ?? { objectUrl: null, status: "idle" };
        }

        function ensureMediaState(mediaId: string): void {
          const state = mediaStateById.get(mediaId) ?? {
            controller: null,
            loadId: 0,
            objectUrl: null,
            status: "idle" as const
          };

          if (state.status === "loading" || state.status === "ready") {
            mediaStateById.set(mediaId, state);
            return;
          }

          state.loadId += 1;
          const loadId = state.loadId;
          state.status = "loading";
          state.controller?.abort();
          state.controller = new AbortController();
          revokeObjectUrl(state.objectUrl);
          state.objectUrl = null;
          mediaStateById.set(mediaId, state);

          void loadMedia({ mediaId, signal: state.controller.signal })
            .then((blob) => {
              if (destroyed || state.controller?.signal.aborted || mediaStateById.get(mediaId)?.loadId !== loadId) {
                return;
              }

              if (!blob || typeof URL.createObjectURL !== "function") {
                state.status = "unavailable";
                state.objectUrl = null;
                render();
                return;
              }

              state.objectUrl = URL.createObjectURL(blob);
              state.status = "ready";
              render();
            })
            .catch(() => {
              if (destroyed || state.controller?.signal.aborted || mediaStateById.get(mediaId)?.loadId !== loadId) {
                return;
              }

              state.status = "unavailable";
              state.objectUrl = null;
              render();
            });
        }

        function renderState(attrs: DocseraImageAttrs): void {
          const blockIndex = getBlockIndex();
          const resolvedTheme = resolveDocseraImageDisplayTheme(blockIndex);
          const useDarkMedia = resolvedTheme === "dark" && attrs.darkMediaId !== null;
          const lightState = getMediaState(attrs.mediaId);
          const darkMediaId = attrs.darkMediaId && attrs.darkMediaId !== attrs.mediaId ? attrs.darkMediaId : null;
          const darkState = darkMediaId ? getMediaState(darkMediaId) : lightState;
          const activeState = useDarkMedia ? darkState : lightState;

          figure.className = "docsera-editor-image";
          figure.dataset.docseraImageAlign = attrs.align;
          figure.dataset.docseraImageFrame = attrs.frame ? "true" : "false";
          figure.dataset.docseraImagePreviewTheme = resolvedTheme;
          figure.dataset.docseraImageWidthPct = String(attrs.widthPct);
          figure.style.width = `${attrs.widthPct}%`;
          figure.style.marginInlineStart = attrs.align === "center" || attrs.align === "right" ? "auto" : "0";
          figure.style.marginInlineEnd = attrs.align === "center" || attrs.align === "left" ? "auto" : "0";

          surface.className = "docsera-editor-image__surface";
          surface.dataset.docseraImageSurface = "true";
          surface.dataset.docseraImageFrame = attrs.frame ? "true" : "false";
          surface.replaceChildren();

          if (activeState.status === "loading" || activeState.status === "idle") {
            surface.append(createLoadingMediaView());
          } else if (activeState.status === "unavailable" || !activeState.objectUrl) {
            surface.append(createUnavailableMediaView(attrs));
          } else {
            const image = document.createElement("img");
            image.className = "docsera-editor-image__image docsera-main__media-image";
            image.alt = attrs.alt;
            image.src = activeState.objectUrl;
            image.draggable = false;
            surface.append(image);
          }

          figure.replaceChildren(surface);

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
          if (attrs.mediaId) {
            ensureMediaState(attrs.mediaId);
          }
          if (attrs.darkMediaId && attrs.darkMediaId !== attrs.mediaId) {
            ensureMediaState(attrs.darkMediaId);
          }

          renderState(attrs);
        };

        const unsubscribe = subscribeDocseraImageDisplayState(() => {
          if (!destroyed) {
            render();
          }
        });

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
            unsubscribe();
            for (const mediaState of mediaStateById.values()) {
              mediaState.controller?.abort();
              revokeObjectUrl(mediaState.objectUrl);
            }
            mediaStateById.clear();
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
                return;
              }

              if (
                node.type.name === "accordionTitle" &&
                node.content.size === 0
              ) {
                decorations.push(
                  Decoration.node(offset, offset + node.nodeSize, {
                    "data-docsera-empty-accordion-title": "true",
                    "data-placeholder": DOCSERA_EMPTY_ACCORDION_TITLE_PLACEHOLDER
                  })
                );
              }
            });

            state.doc.descendants((node, offset) => {
              if (node.type.name === "paragraph" && node.content.size === 0) {
                const $offset = state.doc.resolve(offset);
                for (let depth = $offset.depth; depth > 0; depth -= 1) {
                  if ($offset.node(depth).type.name === "accordionContent") {
                    decorations.push(
                      Decoration.node(offset, offset + node.nodeSize, {
                        "data-docsera-empty-paragraph": "true",
                        "data-placeholder": DOCSERA_EMPTY_PARAGRAPH_PLACEHOLDER
                      })
                    );
                    break;
                  }
                }
              }

              if (node.type.name === "accordionTitle" && node.content.size === 0) {
                decorations.push(
                  Decoration.node(offset, offset + node.nodeSize, {
                    "data-docsera-empty-accordion-title": "true",
                    "data-placeholder": DOCSERA_EMPTY_ACCORDION_TITLE_PLACEHOLDER
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
      blockquote: false,
      heading: { levels: [...DOCSERA_BODY_HEADING_LEVELS] },
      link: false,
      listItem: false,
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
    ...createDocseraAccordionExtensions(),
    TaskList.configure({}),
    Table.configure({
      resizable: false,
      renderWrapper: true,
      cellMinWidth: 80,
      allowTableNodeSelection: false
    }),
    TableRow,
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
