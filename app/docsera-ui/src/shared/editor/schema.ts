import { Extension, Node, getSchema, mergeAttributes, type Editor, type Extensions } from "@tiptap/core";
import { Blockquote as BaseBlockquote } from "@tiptap/extension-blockquote";
import { Document } from "@tiptap/extension-document";
import { Highlight } from "@tiptap/extension-highlight";
import { Link } from "@tiptap/extension-link";
import { ListItem as BaseListItem, TaskItem, TaskList } from "@tiptap/extension-list";
import { Table, TableCell as BaseTableCell, TableHeader as BaseTableHeader, TableRow } from "@tiptap/extension-table";
import { EditorState, Plugin, PluginKey, Selection } from "@tiptap/pm/state";
import { CellSelection, findTable, selectedRect, TableMap } from "@tiptap/pm/tables";
import { Subscript } from "@tiptap/extension-subscript";
import { Superscript } from "@tiptap/extension-superscript";
import { Underline } from "@tiptap/extension-underline";
import StarterKit from "@tiptap/starter-kit";
import type { Node as PMNode, Schema } from "@tiptap/pm/model";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { DOCSERA_IMAGE_DEFAULTS, DOCSERA_IMAGE_ALIGNMENTS, canonicalizeDocseraImageAttrs, type DocseraImageAttrs, type WorkspaceMediaLoader } from "./imageContract";
import { createAccordionIdentity } from "../../client/editor/editorBlockCommands";
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
export const DOCSERA_EMPTY_COLUMN_PARAGRAPH_PLACEHOLDER = "Type here...";
export const DOCSERA_EMPTY_HEADING_PLACEHOLDERS: Record<number, string> = {
  1: "Heading 1",
  2: "Heading 2",
  3: "Heading 3"
};
export const DOCSERA_EMPTY_BLOCKQUOTE_PLACEHOLDER = "Enter a quote";
export const DOCSERA_EMPTY_ACCORDION_TITLE_PLACEHOLDER = "New accordion";
export type AccordionSelectionContext = {
  accordionId: string;
  itemId: string;
  itemIndex: number;
  selectionRegion: "title" | "content";
  titleStartPos: number;
  bodyStartPos: number;
};
export type AccordionDisclosureState = Record<string, string | null>;
export const DOCSERA_ACCORDION_DISCLOSURE_PLUGIN_KEY = new PluginKey<AccordionDisclosureState>(
  "docseraAccordionDisclosure"
);
export const DOCSERA_ACCORDION_DISCLOSURE_DECORATION_PLUGIN_KEY = new PluginKey("docseraAccordionDisclosureDecoration");
const DOCSERA_ACCORDION_NESTED_BLOCK_CONTENT =
  "(paragraph | heading | image | bulletList | orderedList | taskList | blockquote | horizontalRule | codeBlock | table)";
const DOCSERA_ACCORDION_BODY_NESTED_BLOCK_CONTENT = `${DOCSERA_ACCORDION_NESTED_BLOCK_CONTENT} | columns`;
const DOCSERA_COLUMN_NESTED_BLOCK_CONTENT =
  "(paragraph | heading | image | bulletList | orderedList | taskList | blockquote | horizontalRule | codeBlock | table | accordion)";
const DOCSERA_ACCORDION_ITEM_LAST_ATTR = "data-docsera-accordion-item-last";
const DOCSERA_ACCORDION_ITEM_MENU_OPEN_ATTR = "data-docsera-accordion-item-menu-open";
const DOCSERA_ACCORDION_CHEVRON_ICON_SIZE = 18;
const DOCSERA_ACCORDION_CONTROL_ICON_SIZE = 14;
const DOCSERA_ACCORDION_ADD_INTERACTION_LANE_WIDTH = "2.25rem";

function createAccordionSvgIcon(applyAttributes: (icon: SVGSVGElement) => void): SVGSVGElement {
  const icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  icon.setAttribute("viewBox", "0 0 24 24");
  icon.setAttribute("width", String(DOCSERA_ACCORDION_CONTROL_ICON_SIZE));
  icon.setAttribute("height", String(DOCSERA_ACCORDION_CONTROL_ICON_SIZE));
  icon.setAttribute("fill", "none");
  icon.setAttribute("stroke", "currentColor");
  icon.setAttribute("stroke-width", "2.2");
  icon.setAttribute("stroke-linecap", "round");
  icon.setAttribute("stroke-linejoin", "round");
  icon.setAttribute("aria-hidden", "true");
  icon.setAttribute("focusable", "false");
  applyAttributes(icon);
  return icon;
}

function createAccordionChevronIcon() {
  const icon = createAccordionSvgIcon((svg) => {
    svg.setAttribute("width", String(DOCSERA_ACCORDION_CHEVRON_ICON_SIZE));
    svg.setAttribute("height", String(DOCSERA_ACCORDION_CHEVRON_ICON_SIZE));

    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "m9 18 6-6-6-6");
    svg.append(path);
  });

  return icon;
}

function createAccordionPlusIcon() {
  return createAccordionSvgIcon((svg) => {
    const verticalLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
    verticalLine.setAttribute("d", "M12 5v14");
    const horizontalLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
    horizontalLine.setAttribute("d", "M5 12h14");
    svg.append(verticalLine, horizontalLine);
  });
}

function createAccordionEllipsisIcon() {
  return createAccordionSvgIcon((svg) => {
    svg.setAttribute("fill", "currentColor");
    svg.removeAttribute("stroke");
    svg.removeAttribute("stroke-width");
    svg.removeAttribute("stroke-linecap");
    svg.removeAttribute("stroke-linejoin");

    for (const cy of [5, 12, 19]) {
      const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      circle.setAttribute("cx", "12");
      circle.setAttribute("cy", String(cy));
      circle.setAttribute("r", "1.5");
      svg.append(circle);
    }
  });
}

function createAccordionTrashIcon() {
  return createAccordionSvgIcon((svg) => {
    svg.setAttribute("width", "15");
    svg.setAttribute("height", "15");

    const lid = document.createElementNS("http://www.w3.org/2000/svg", "path");
    lid.setAttribute("d", "M3 6h18");
    const handle = document.createElementNS("http://www.w3.org/2000/svg", "path");
    handle.setAttribute("d", "M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2");
    const can = document.createElementNS("http://www.w3.org/2000/svg", "path");
    can.setAttribute("d", "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6");
    const leftLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
    leftLine.setAttribute("d", "M10 11v6");
    const rightLine = document.createElementNS("http://www.w3.org/2000/svg", "path");
    rightLine.setAttribute("d", "M14 11v6");
    svg.append(lid, handle, can, leftLine, rightLine);
  });
}

function getAccordionDisclosureState(state: EditorState): AccordionDisclosureState {
  return DOCSERA_ACCORDION_DISCLOSURE_PLUGIN_KEY.getState(state) ?? {};
}

function getAccordionSelectionContextFromSelection(selection: Selection, _doc: PMNode): AccordionSelectionContext | null {
  const { $from } = selection;

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type.name !== "accordionTitle" && node.type.name !== "accordionContent") {
      continue;
    }

    const itemDepth = depth - 1;
    const accordionDepth = depth - 2;
    if (itemDepth < 0 || accordionDepth < 0) {
      return null;
    }

    const itemNode = $from.node(itemDepth);
    const accordionNode = $from.node(accordionDepth);
    if (itemNode.type.name !== "accordionItem" || accordionNode.type.name !== "accordion") {
      return null;
    }

    const accordionId = typeof accordionNode.attrs.accordionId === "string" ? accordionNode.attrs.accordionId.trim() : "";
    const itemId = typeof itemNode.attrs.accordionItemId === "string" ? itemNode.attrs.accordionItemId.trim() : "";
    if (!accordionId || !itemId) {
      return null;
    }

    const itemPos = $from.before(itemDepth);
    const titleNode = itemNode.child(0);
    const bodyStartPos = itemPos + 1 + titleNode.nodeSize;
    const itemOffset = itemPos - $from.before(accordionDepth) - 1;
    let itemIndex = -1;
    accordionNode.forEach((_child, offset, index) => {
      if (offset === itemOffset) {
        itemIndex = index;
      }
    });

    if (itemIndex < 0) {
      return null;
    }

    return {
      accordionId,
      itemId,
      itemIndex,
      selectionRegion: node.type.name === "accordionTitle" ? "title" : "content",
      titleStartPos: itemPos + 1,
      bodyStartPos
    };
  }

  return null;
}

export function getAccordionOpenItemId(state: EditorState, accordionId: string): string | null {
  const openItemId = getAccordionDisclosureState(state)[accordionId];
  return typeof openItemId === "string" || openItemId === null ? openItemId : null;
}

export function getAccordionSelectionContext(state: EditorState): AccordionSelectionContext | null {
  return getAccordionSelectionContextFromSelection(state.selection, state.doc);
}

function createAccordionDisclosureDecorationPlugin() {
  return new Plugin({
    key: DOCSERA_ACCORDION_DISCLOSURE_DECORATION_PLUGIN_KEY,
    props: {
      decorations(state) {
        const decorations: Decoration[] = [];
        state.doc.descendants((node, pos) => {
          if (node.type.name !== "accordionItem") {
            return;
          }

          const $pos = state.doc.resolve(pos);
          const accordionNode = $pos.parent;
          if (accordionNode.type.name !== "accordion") {
            return;
          }

          const accordionId = typeof accordionNode.attrs.accordionId === "string" ? accordionNode.attrs.accordionId.trim() : "";
          const itemId = typeof node.attrs.accordionItemId === "string" ? node.attrs.accordionItemId.trim() : "";
          if (!accordionId || !itemId) {
            return;
          }

          const isOpen = getAccordionOpenItemId(state, accordionId) === itemId;
          decorations.push(
            Decoration.node(pos, pos + node.nodeSize, {
              "data-docsera-accordion-open": isOpen ? "true" : "false"
            })
          );
        });

        return decorations.length ? DecorationSet.create(state.doc, decorations) : DecorationSet.empty;
      }
    }
  });
}

function createAccordionItemNode(schema: Schema): PMNode {
  return schema.nodes.accordionItem.create(
    {
      accordionItemId: createAccordionIdentity("accordion-item")
    },
    [
      schema.nodes.accordionTitle.create(),
      schema.nodes.accordionContent.create(null, schema.nodes.paragraph.create())
    ]
  );
}

function createAccordionDisclosurePlugin() {
  return new Plugin<AccordionDisclosureState>({
    key: DOCSERA_ACCORDION_DISCLOSURE_PLUGIN_KEY,
    state: {
      init: () => ({}),
      apply(transaction, currentState) {
        const nextDisclosure = transaction.getMeta(DOCSERA_ACCORDION_DISCLOSURE_PLUGIN_KEY) as
          | { accordionId?: string; itemId?: string | null }
          | undefined;
        if (nextDisclosure && typeof nextDisclosure.accordionId === "string") {
          const accordionId = nextDisclosure.accordionId.trim();
          if (!accordionId) {
            return currentState;
          }

          const nextItemId =
            typeof nextDisclosure.itemId === "string" && nextDisclosure.itemId.trim().length > 0
              ? nextDisclosure.itemId.trim()
              : null;

          return {
            ...currentState,
            [accordionId]: nextItemId
          };
        }

        if (!transaction.selectionSet) {
          return currentState;
        }

        const selectionContext = getAccordionSelectionContextFromSelection(transaction.selection, transaction.doc);
        if (!selectionContext) {
          return currentState;
        }

        const currentOpenItemId = currentState[selectionContext.accordionId] ?? null;
        if (currentOpenItemId === selectionContext.itemId) {
          return currentState;
        }

        return {
          ...currentState,
          [selectionContext.accordionId]: selectionContext.itemId
        };
      }
    }
  });
}

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
      defining: true,
      isolating: true,
      draggable: true,
      selectable: true,
      addProseMirrorPlugins() {
        return [createAccordionDisclosurePlugin(), createAccordionDisclosureDecorationPlugin()];
      },
      addAttributes() {
        return {
          accordionId: {
            default: null,
            parseHTML: (element) => {
              const accordionId = element.getAttribute("data-docsera-accordion-id");
              return typeof accordionId === "string" && accordionId.trim().length > 0 ? accordionId.trim() : null;
            },
            renderHTML: (attributes) =>
              typeof attributes.accordionId === "string" && attributes.accordionId.length > 0
                ? { "data-docsera-accordion-id": attributes.accordionId }
                : {}
          }
        };
      },
      parseHTML() {
        return [{ tag: "div[data-docsera-accordion='true']", priority: 1000 }];
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
      defining: true,
      draggable: false,
      selectable: false,
      addNodeView() {
        return ({ node, editor, getPos }) => {
          const itemRoot = document.createElement("div");
          const controlsLayer = document.createElement("div");
          const addInteractionLane = document.createElement("span");
          const toggleButton = document.createElement("button");
          const ellipsisButton = document.createElement("button");
          const addButton = document.createElement("button");
          const menu = document.createElement("div");
          const menuDeleteButton = document.createElement("button");
          const menuDeleteIcon = document.createElement("span");
          const menuDeleteLabel = document.createElement("span");
          const contentDOM = document.createElement("div");
          let destroyed = false;
          let menuOpen = false;
          let documentPointerDownListener: ((event: PointerEvent) => void) | null = null;
          let documentKeyDownListener: ((event: KeyboardEvent) => void) | null = null;

          itemRoot.className = "docsera-editor-accordion__item";
          itemRoot.setAttribute("data-docsera-accordion-item", "true");
          itemRoot.setAttribute("data-docsera-accordion-item-id", node.attrs.accordionItemId ?? "");
          controlsLayer.className = "docsera-editor-accordion__controls";
          controlsLayer.setAttribute("contenteditable", "false");
          addInteractionLane.className = "docsera-editor-accordion__add-lane";
          addInteractionLane.setAttribute("data-docsera-accordion-control", "add-lane");
          addInteractionLane.setAttribute("aria-hidden", "true");
          toggleButton.type = "button";
          toggleButton.className = "docsera-editor-accordion__control docsera-editor-accordion__control--toggle";
          toggleButton.setAttribute("data-docsera-accordion-control", "toggle");
          toggleButton.append(createAccordionChevronIcon());
          ellipsisButton.type = "button";
          ellipsisButton.className = "docsera-editor-accordion__control docsera-editor-accordion__control--ellipsis";
          ellipsisButton.setAttribute("data-docsera-accordion-control", "menu");
          ellipsisButton.append(createAccordionEllipsisIcon());
          addButton.type = "button";
          addButton.className = "docsera-editor-accordion__control docsera-editor-accordion__control--add";
          addButton.setAttribute("data-docsera-accordion-control", "add");
          addButton.style.zIndex = "1";
          addButton.append(createAccordionPlusIcon());
          menu.className = "docsera-compact-menu docsera-editor-accordion__menu";
          menu.hidden = true;
          menu.setAttribute("contenteditable", "false");
          menu.setAttribute("role", "menu");
          menuDeleteButton.type = "button";
          menuDeleteButton.className = "docsera-block-menu__item docsera-block-menu__item--destructive";
          menuDeleteButton.setAttribute("role", "menuitem");
          menuDeleteButton.setAttribute("aria-label", "Delete item");
          menuDeleteIcon.className = "docsera-block-menu__icon";
          menuDeleteIcon.setAttribute("aria-hidden", "true");
          menuDeleteIcon.append(createAccordionTrashIcon());
          menuDeleteLabel.className = "docsera-block-menu__label";
          menuDeleteLabel.textContent = "Delete item";
          menuDeleteButton.append(menuDeleteIcon, menuDeleteLabel);
          contentDOM.className = "docsera-editor-accordion__item-content";

          controlsLayer.append(toggleButton, addInteractionLane, ellipsisButton, addButton);
          menu.append(menuDeleteButton);
          itemRoot.append(controlsLayer, contentDOM, menu);
          contentDOM.setAttribute("data-docsera-accordion-item-content", "true");

          function getBodyElement() {
            return contentDOM.querySelector<HTMLElement>("[data-docsera-accordion-content='true']");
          }

          function resolveItemContext() {
            const position = typeof getPos === "function" ? getPos() : null;
            if (typeof position !== "number") {
              return null;
            }

            const itemNode = editor.state.doc.nodeAt(position);
            if (!itemNode || itemNode.type.name !== "accordionItem") {
              return null;
            }

            const resolved = editor.state.doc.resolve(position);
            const accordionNode = resolved.parent;
            if (accordionNode.type.name !== "accordion") {
              return null;
            }

            const accordionId = typeof accordionNode.attrs.accordionId === "string" ? accordionNode.attrs.accordionId.trim() : "";
            const itemId = typeof itemNode.attrs.accordionItemId === "string" ? itemNode.attrs.accordionItemId.trim() : "";
            if (!accordionId || !itemId) {
              return null;
            }

            let itemIndex = -1;
            accordionNode.forEach((_child, offset, index) => {
              if (offset === resolved.parentOffset) {
                itemIndex = index;
              }
            });

            if (itemIndex < 0) {
              return null;
            }

            if (itemNode.childCount < 2) {
              return null;
            }
            const titleNode = itemNode.child(0);
            const bodyNode = itemNode.child(1);

            const titleStartPos = position + 1;
            const bodyStartPos = position + 1 + titleNode.nodeSize;

            return {
              accordionId,
              accordionNode,
              bodyNode,
              bodyStartPos,
              itemId,
              itemIndex,
              itemNode,
              position,
              titleNode,
              titleStartPos
            };
          }

          function isWithinItem(target: EventTarget | null) {
            return target instanceof globalThis.Node && itemRoot.contains(target);
          }

          function getSelectionPosition(startPos: number): number | null {
            try {
              return Selection.near(editor.state.doc.resolve(startPos), 1).from;
            } catch {
              return null;
            }
          }

          function updateControls() {
            const context = resolveItemContext();
            if (!context) {
              return;
            }

            const openItemId = getAccordionOpenItemId(editor.state, context.accordionId);
            const isOpen = openItemId === context.itemId;
            const panelId = `docsera-editor-accordion-${context.accordionId}-${context.itemId}-panel`;
            const titleText = context.titleNode.textContent.trim();
            const titleLabel = titleText ? `: ${titleText}` : "";
            const itemCount = context.accordionNode.childCount;
            const isLastItem = context.itemIndex === itemCount - 1;

            itemRoot.setAttribute("data-docsera-accordion-id", context.accordionId);
            itemRoot.setAttribute("data-docsera-accordion-item-id", context.itemId);
            itemRoot.setAttribute("data-docsera-accordion-open", isOpen ? "true" : "false");
            itemRoot.setAttribute(DOCSERA_ACCORDION_ITEM_LAST_ATTR, isLastItem ? "true" : "false");
            itemRoot.setAttribute(DOCSERA_ACCORDION_ITEM_MENU_OPEN_ATTR, menuOpen ? "true" : "false");
            toggleButton.setAttribute("aria-controls", panelId);
            toggleButton.setAttribute("aria-expanded", isOpen ? "true" : "false");
            toggleButton.setAttribute(
              "aria-label",
              `${isOpen ? "Collapse" : "Expand"} accordion item${titleLabel}`
            );
            toggleButton.setAttribute("title", `${isOpen ? "Collapse" : "Expand"} accordion item${titleLabel}`);
            ellipsisButton.setAttribute("aria-label", `More accordion item actions${titleLabel}`);
            ellipsisButton.setAttribute("title", `More accordion item actions${titleLabel}`);
            addButton.setAttribute("aria-label", `Add item after${titleLabel}`);
            addButton.setAttribute("title", `Add item after${titleLabel}`);
            addInteractionLane.hidden = !isLastItem;
            addButton.hidden = !isLastItem;
            menu.setAttribute("aria-label", `Accordion item actions${titleLabel}`);
            menu.hidden = !menuOpen;
            menuDeleteButton.disabled = itemCount <= 1;
            const bodyElement = getBodyElement();
            if (bodyElement) {
              bodyElement.id = panelId;
              bodyElement.hidden = !isOpen;
              bodyElement.setAttribute("aria-hidden", isOpen ? "false" : "true");
            }
          }

          function attachMenuDismissListeners() {
            if (documentPointerDownListener || documentKeyDownListener) {
              return;
            }

            const ownerDocument = itemRoot.ownerDocument;
            documentPointerDownListener = (event: PointerEvent) => {
              const path = typeof event.composedPath === "function" ? event.composedPath() : [];
              if (path.includes(itemRoot) || path.includes(menu)) {
                return;
              }

              closeMenu();
            };
            documentKeyDownListener = (event: KeyboardEvent) => {
              if (event.key !== "Escape") {
                return;
              }

              const path = typeof event.composedPath === "function" ? event.composedPath() : [];
              if (!path.includes(itemRoot)) {
                return;
              }

              event.preventDefault();
              closeMenu(true);
            };

            ownerDocument.addEventListener("pointerdown", documentPointerDownListener, true);
            ownerDocument.addEventListener("keydown", documentKeyDownListener, true);
          }

          function detachMenuDismissListeners() {
            if (!documentPointerDownListener && !documentKeyDownListener) {
              return;
            }

            const ownerDocument = itemRoot.ownerDocument;
            if (documentPointerDownListener) {
              ownerDocument.removeEventListener("pointerdown", documentPointerDownListener, true);
              documentPointerDownListener = null;
            }
            if (documentKeyDownListener) {
              ownerDocument.removeEventListener("keydown", documentKeyDownListener, true);
              documentKeyDownListener = null;
            }
          }

          function openMenu() {
            if (destroyed || menuOpen) {
              return;
            }

            menuOpen = true;
            attachMenuDismissListeners();
            updateControls();
            menuDeleteButton.focus();
          }

          function closeMenu(returnFocus = false) {
            if (!menuOpen) {
              return;
            }

            menuOpen = false;
            detachMenuDismissListeners();
            updateControls();
            if (returnFocus) {
              ellipsisButton.focus();
            }
          }

          toggleButton.addEventListener("mousedown", (event) => {
            event.preventDefault();
          });
          ellipsisButton.addEventListener("mousedown", (event) => {
            event.preventDefault();
          });
          addButton.addEventListener("mousedown", (event) => {
            event.preventDefault();
          });
          menuDeleteButton.addEventListener("mousedown", (event) => {
            event.preventDefault();
          });

          itemRoot.addEventListener("focusin", () => {
            itemRoot.setAttribute("data-docsera-accordion-item-affordances-visible", "true");
          });
          itemRoot.addEventListener("focusout", (event) => {
            if (!isWithinItem(event.relatedTarget)) {
              itemRoot.removeAttribute("data-docsera-accordion-item-affordances-visible");
            }
          });

          toggleButton.addEventListener("click", () => {
            const context = resolveItemContext();
            if (!context) {
              return;
            }

            const titleSelectionPos = getSelectionPosition(context.titleStartPos + 1);
            const nextItemId = getAccordionOpenItemId(editor.state, context.accordionId) === context.itemId ? null : context.itemId;
            let transaction = editor.state.tr
              .setMeta(DOCSERA_ACCORDION_DISCLOSURE_PLUGIN_KEY, {
                accordionId: context.accordionId,
                itemId: nextItemId
              })
              .setMeta("addToHistory", false);

            if (titleSelectionPos !== null) {
              try {
                transaction = transaction.setSelection(Selection.near(transaction.doc.resolve(titleSelectionPos), 1));
              } catch {
                // If selection mapping fails, keep the disclosure state update and let the editor retain its prior selection.
              }
            }

            editor.view.dispatch(transaction);
          });

          ellipsisButton.addEventListener("click", () => {
            if (menuOpen) {
              closeMenu();
              return;
            }

            openMenu();
          });

          addButton.addEventListener("click", () => {
            const context = resolveItemContext();
            if (!context) {
              return;
            }

            const newItem = createAccordionItemNode(editor.schema);
            const insertPos = context.position + context.itemNode.nodeSize;
            let transaction = editor.state.tr.insert(insertPos, newItem);
            try {
              transaction = transaction.setSelection(Selection.near(transaction.doc.resolve(insertPos + 2), 1));
            } catch {
              // The insertion still succeeded; selection will remain where the editor can place it safely.
            }

            editor.view.dispatch(transaction);
            editor.view.focus();
          });

          menuDeleteButton.addEventListener("click", () => {
            const context = resolveItemContext();
            if (!context || context.accordionNode.childCount <= 1) {
              return;
            }

            const previousItem = context.itemIndex > 0 ? context.accordionNode.child(context.itemIndex - 1) : null;
            const nextItemExists = context.itemIndex < context.accordionNode.childCount - 1;
            const nextSelectionBasePos = nextItemExists ? context.position : previousItem ? context.position - previousItem.nodeSize : null;
            let transaction = editor.state.tr.delete(context.position, context.position + context.itemNode.nodeSize);

            if (typeof nextSelectionBasePos === "number") {
              try {
                transaction = transaction.setSelection(Selection.near(transaction.doc.resolve(nextSelectionBasePos + 1), 1));
              } catch {
                // The deletion should still proceed even if the fallback selection cannot be resolved.
              }
            }

            closeMenu();
            editor.view.dispatch(transaction);
            editor.view.focus();
          });

          updateControls();

          return {
            dom: itemRoot,
            contentDOM,
            destroy() {
              destroyed = true;
              closeMenu();
            },
            ignoreMutation(mutation) {
              const target = mutation.target as globalThis.Node;
              const bodyElement = getBodyElement();
              if (
              target === itemRoot ||
              target === controlsLayer ||
              target === contentDOM ||
              target === menu ||
              target === bodyElement ||
              (controlsLayer instanceof globalThis.Node && controlsLayer.contains(target)) ||
              (menu instanceof globalThis.Node && menu.contains(target))
              ) {
                return true;
              }

              return !contentDOM.contains(target);
            },
            stopEvent(event) {
              const target = event.target;
              return (
                target instanceof globalThis.Node &&
                ((controlsLayer.contains(target) && !contentDOM.contains(target)) || menu.contains(target))
              );
            },
            update(nextNode) {
              if (nextNode.type.name !== "accordionItem") {
                return false;
              }

              updateControls();
              return true;
            }
          };
        };
      },
      addAttributes() {
        return {
          accordionItemId: {
            default: null,
            parseHTML: (element) => {
              const accordionItemId = element.getAttribute("data-docsera-accordion-item-id");
              return typeof accordionItemId === "string" && accordionItemId.trim().length > 0 ? accordionItemId.trim() : null;
            },
            renderHTML: (attributes) =>
              typeof attributes.accordionItemId === "string" && attributes.accordionItemId.length > 0
                ? { "data-docsera-accordion-item-id": attributes.accordionItemId }
                : {}
          }
        };
      },
      parseHTML() {
        return [
          {
            tag: "div[data-docsera-accordion-item='true']",
            priority: 1000
          }
        ];
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
        return [{ tag: "p[data-docsera-accordion-title='true']", priority: 1000 }];
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
      content: `(${DOCSERA_ACCORDION_BODY_NESTED_BLOCK_CONTENT})+`,
      selectable: false,
      parseHTML() {
        return [{ tag: "div[data-docsera-accordion-content='true']", priority: 1000 }];
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

function isCanonicalEmptyColumnParagraph(node: PMNode, parent: PMNode | null | undefined): boolean {
  return (
    parent?.type.name === "column" &&
    parent.childCount === 1 &&
    parent.firstChild === node &&
    node.content.size === 0
  );
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

            state.doc.descendants((node, offset, parent) => {
              if (node.type.name === "paragraph" && node.content.size === 0) {
                if (isCanonicalEmptyColumnParagraph(node, parent)) {
                  decorations.push(
                    Decoration.node(offset, offset + node.nodeSize, {
                      "data-docsera-empty-paragraph": "true",
                      "data-placeholder": DOCSERA_EMPTY_COLUMN_PARAGRAPH_PLACEHOLDER
                    })
                  );
                  return;
                }

                const $offset = state.doc.resolve(offset);
                for (let depth = $offset.depth; depth > 0; depth -= 1) {
                  const ancestor = $offset.node(depth);

                  if (ancestor.type.name === "accordionContent") {
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

              if (
                parent?.type.name !== "doc" &&
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

function createDocseraColumnsExtensions() {
  return [
    Node.create({
      name: "columns",
      content: "column{2,4}",
      defining: true,
      isolating: true,
      parseHTML() {
        return [{ tag: "div[data-docsera-columns='true']", priority: 1000 }];
      },
      renderHTML({ node, HTMLAttributes }) {
        return [
          "div",
          mergeAttributes(HTMLAttributes, {
            class: "docsera-editor-columns",
            "data-docsera-columns": "true",
            style: `--docsera-columns-count: ${node.childCount};`
          }),
          0
        ];
      }
    }),
    Node.create({
      name: "column",
      content: `${DOCSERA_COLUMN_NESTED_BLOCK_CONTENT}+`,
      defining: true,
      isolating: true,
      parseHTML() {
        return [{ tag: "div[data-docsera-column='true']", priority: 1000 }];
      },
      renderHTML({ HTMLAttributes }) {
        return [
          "div",
          mergeAttributes(HTMLAttributes, {
            class: "docsera-editor-columns__column",
            "data-docsera-column": "true"
          }),
          0
        ];
      }
    })
  ];
}

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
      content: "(block | columns)*"
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
    ...createDocseraColumnsExtensions(),
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
