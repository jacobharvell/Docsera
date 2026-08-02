import type { Editor } from "@tiptap/core";
import { getMarkRange } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { createPortal, flushSync } from "react-dom";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent, ReactNode, RefObject } from "react";
import { NodeSelection, TextSelection } from "@tiptap/pm/state";
import { findWrapping, liftTarget } from "@tiptap/pm/transform";
import { Bold, Code2, Copy, ExternalLink, Heading1, Heading2, Heading3, Italic, Link2, List, ListOrdered, Strikethrough, Trash2, Underline } from "lucide-react";
import { DocseraIcon } from "../shared/icons/DocseraIcon";
import { docseraIcons } from "../shared/icons/docseraIcons";
import { isDocseraAllowedLinkHref } from "../../shared/editor/schema";

type ToolbarMenuId = "blockType" | "more";
type ToolbarBlockTypeId = "text" | "heading1" | "heading2" | "heading3" | "bulletedList" | "numberedList";
type ToolbarMoreItemId = "blockquote" | "superscript" | "subscript" | "highlight";

type ToolbarSelectionSnapshot = {
  from: number;
  key: string;
  rect: DOMRect;
  to: number;
};

type LinkSurfaceState =
  | {
      anchorRect: DOMRect;
      draftHref: string;
      commandFrom: number;
      mode: "create";
      source: "toolbar" | "link-click";
      commandTo: number;
      selectionFrom: number;
      selectionTo: number;
    }
  | {
      anchorRect: DOMRect;
      draftHref: string;
      commandFrom: number;
      mode: "edit";
      source: "toolbar" | "link-click";
      commandTo: number;
      selectionFrom: number;
      selectionTo: number;
    };

type ToolbarTooltipState = {
  anchorRect: DOMRect;
  label: string;
  shortcut?: string | null;
};

export type CompactTextToolbarProps = {
  canEdit: boolean;
  editor: Editor | null;
  ownerDocument: Document;
  ownerWindow: Window | null;
  overlayRoot: HTMLElement;
};

const TOOLBAR_POINTER_IDLE_MS = 90;
const TOOLBAR_TOOLTIP_DELAY_MS = 180;
const EDITOR_DRAG_INTENT_THRESHOLD_PX = 4;
const VIEWPORT_GUTTER = 12;
const POPOVER_GAP = 10;
const TOOLBAR_MENU_GAP = 4;
const TOOLBAR_MENU_TARGET_WIDTH = 170;
const TOOLBAR_MENU_MAX_WIDTH = 256;
const LINK_MENU_CREATE_WIDTH = 324;
const LINK_MENU_EDIT_WIDTH = 388;

const BLOCK_TYPE_MENU_ITEMS: Array<{ id: ToolbarBlockTypeId; label: string }> = [
  { id: "text", label: "Text" },
  { id: "heading1", label: "Heading 1" },
  { id: "heading2", label: "Heading 2" },
  { id: "heading3", label: "Heading 3" },
  { id: "bulletedList", label: "Unordered List" },
  { id: "numberedList", label: "Numbered List" }
];

const MORE_MENU_ITEMS: Array<{ id: ToolbarMoreItemId; label: string }> = [
  { id: "blockquote", label: "Blockquote" },
  { id: "superscript", label: "Superscript" },
  { id: "subscript", label: "Subscript" },
  { id: "highlight", label: "Highlight" }
];

const TOOLBAR_SHORTCUTS: Record<string, string> = {
  bold: "Mod+B",
  italic: "Mod+I",
  underline: "Mod+U",
  strike: "Mod+Shift+S",
  code: "Mod+E",
  link: "Mod+K"
};

function isTextSelection(selection: unknown): selection is TextSelection {
  return selection instanceof TextSelection;
}

function isNodeSelection(selection: unknown): selection is NodeSelection {
  return selection instanceof NodeSelection;
}

function getShortcutModifierLabel(ownerWindow: Window | null | undefined): "Ctrl" | "Command" {
  const platform = ownerWindow?.navigator?.platform ?? "";
  return /mac|iphone|ipad|ipod/i.test(platform) ? "Command" : "Ctrl";
}

export function formatToolbarShortcutLabel(shortcut: string, ownerWindow: Window | null | undefined): string {
  return shortcut.replace(/\bMod\b/g, getShortcutModifierLabel(ownerWindow));
}

function getToolbarActionTitle(label: string, shortcut: string | null | undefined, ownerWindow: Window | null | undefined): string {
  return shortcut ? `${label} (${formatToolbarShortcutLabel(shortcut, ownerWindow)})` : label;
}

function hasUrlScheme(value: string): boolean {
  return /^[a-z][a-z\d+.-]*:/i.test(value);
}

function normalizeLinkHref(rawHref: string): string {
  const trimmed = rawHref.trim();
  if (!trimmed) {
    return "";
  }

  if (
    hasUrlScheme(trimmed) ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("#")
  ) {
    return trimmed;
  }

  if (trimmed.startsWith("www.") || /^[^\s/]+\.[^\s/]+/.test(trimmed)) {
    return `https://${trimmed}`;
  }

  return trimmed;
}

function sameStyle(left: CSSProperties | undefined, right: CSSProperties): boolean {
  return (
    left?.left === right.left &&
    left?.top === right.top &&
    left?.width === right.width &&
    left?.maxWidth === right.maxWidth &&
    left?.maxHeight === right.maxHeight &&
    left?.visibility === right.visibility
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(min, value), max);
}

function getElementRect(element: HTMLElement | null): DOMRect | null {
  if (!element) {
    return null;
  }

  const rect = element.getBoundingClientRect();
  if (!Number.isFinite(rect.left) || !Number.isFinite(rect.top)) {
    return null;
  }

  return new DOMRect(rect.left, rect.top, Math.max(1, rect.width), Math.max(1, rect.height));
}

function isNodeFromOwnerWindow(value: unknown, ownerWindow: Window | null | undefined): value is Node {
  const ownerNode = (ownerWindow as (Window & typeof globalThis) | null | undefined)?.Node;
  if (ownerNode && value instanceof ownerNode) {
    return true;
  }

  return typeof Node !== "undefined" && value instanceof Node;
}

function isElementNodeFromOwnerWindow(value: unknown, ownerWindow: Window | null | undefined): value is Element {
  if (!isNodeFromOwnerWindow(value, ownerWindow)) {
    return false;
  }

  const ownerNode = (ownerWindow as (Window & typeof globalThis) | null | undefined)?.Node;
  return value.nodeType === (ownerNode?.ELEMENT_NODE ?? Node.ELEMENT_NODE);
}

function getEventPathNodes(event: Event, ownerWindow: Window | null | undefined): Node[] {
  if (typeof event.composedPath !== "function") {
    return [];
  }

  return event
    .composedPath()
    .filter((entry): entry is Node => isNodeFromOwnerWindow(entry, ownerWindow));
}

function resolveEventTargetNode(event: Event, ownerWindow: Window | null | undefined): Node | null {
  const pathNodes = getEventPathNodes(event, ownerWindow);
  if (pathNodes.length > 0) {
    return pathNodes[0];
  }

  return isNodeFromOwnerWindow(event.target, ownerWindow) ? event.target : null;
}

export function resolveEditorLinkElementFromEvent(
  event: Event,
  editorDom: HTMLElement,
  ownerWindow: Window | null | undefined
): Element | null {
  const ownerNode = (ownerWindow as (Window & typeof globalThis) | null | undefined)?.Node;
  const pathNodes = getEventPathNodes(event, ownerWindow);
  for (const node of pathNodes) {
    if (isElementNodeFromOwnerWindow(node, ownerWindow)) {
      const linkElement = node.closest("a[href]");
      if (linkElement && editorDom.contains(linkElement)) {
        return linkElement;
      }
    }
  }

  const target = event.target;
  if (!isNodeFromOwnerWindow(target, ownerWindow)) {
    return null;
  }

  const targetElement =
    target.nodeType === (ownerNode?.ELEMENT_NODE ?? Node.ELEMENT_NODE)
      ? (target as Element)
      : (target as Node & { parentElement: Element | null }).parentElement;

  if (!targetElement || !editorDom.contains(targetElement)) {
    return null;
  }

  const linkElement = targetElement.closest("a[href]");
  return linkElement && editorDom.contains(linkElement) ? linkElement : null;
}

export function isEventWithinEditor(event: Event, editorElement: HTMLElement, ownerWindow: Window | null | undefined): boolean {
  if (isNodeFromOwnerWindow(event.target, ownerWindow) && editorElement.contains(event.target)) {
    return true;
  }

  return getEventPathNodes(event, ownerWindow).some((node) => editorElement.contains(node));
}

export function resolveCenteredSurfaceStyle(
  ownerDocument: Document,
  anchorRect: DOMRect,
  surfaceRect: Pick<DOMRect, "height" | "width">,
  preferAbove = false
): CSSProperties {
  const ownerWindow = ownerDocument.defaultView;
  const viewportWidth = ownerWindow?.innerWidth ?? ownerDocument.documentElement.clientWidth;
  const viewportHeight = ownerWindow?.innerHeight ?? ownerDocument.documentElement.clientHeight;
  const maxSurfaceWidth = Math.max(1, viewportWidth - VIEWPORT_GUTTER * 2);
  const maxSurfaceHeight = Math.max(1, viewportHeight - VIEWPORT_GUTTER * 2);
  const clampedWidth = Math.max(1, Math.min(surfaceRect.width, maxSurfaceWidth));
  const clampedHeight = Math.max(1, Math.min(surfaceRect.height, maxSurfaceHeight));
  const centeredLeft = anchorRect.left + anchorRect.width / 2 - clampedWidth / 2;
  const left = clamp(centeredLeft, VIEWPORT_GUTTER, Math.max(VIEWPORT_GUTTER, viewportWidth - clampedWidth - VIEWPORT_GUTTER));
  const aboveTop = anchorRect.top - clampedHeight - POPOVER_GAP;
  const belowTop = anchorRect.bottom + POPOVER_GAP;
  const top = preferAbove && aboveTop >= VIEWPORT_GUTTER ? aboveTop : clamp(belowTop, VIEWPORT_GUTTER, Math.max(VIEWPORT_GUTTER, viewportHeight - clampedHeight - VIEWPORT_GUTTER));

  return {
    position: "fixed",
    left: `${left}px`,
    top: `${top}px`,
    width: `${clampedWidth}px`,
    maxWidth: `${maxSurfaceWidth}px`,
    maxHeight: `${maxSurfaceHeight}px`
  };
}

export function resolveToolbarSurfaceStyle(
  ownerDocument: Document,
  anchorRect: DOMRect,
  surfaceRect: Pick<DOMRect, "height" | "width">
): CSSProperties {
  const ownerWindow = ownerDocument.defaultView;
  const viewportWidth = ownerWindow?.innerWidth ?? ownerDocument.documentElement.clientWidth;
  const viewportHeight = ownerWindow?.innerHeight ?? ownerDocument.documentElement.clientHeight;
  const maxSurfaceWidth = Math.max(1, viewportWidth - VIEWPORT_GUTTER * 2);
  const maxSurfaceHeight = Math.max(1, viewportHeight - VIEWPORT_GUTTER * 2);
  const clampedWidth = Math.max(1, Math.min(surfaceRect.width, maxSurfaceWidth));
  const clampedHeight = Math.max(1, Math.min(surfaceRect.height, maxSurfaceHeight));
  const centeredLeft = anchorRect.left + anchorRect.width / 2 - clampedWidth / 2;
  const left = clamp(
    centeredLeft,
    VIEWPORT_GUTTER,
    Math.max(VIEWPORT_GUTTER, viewportWidth - clampedWidth - VIEWPORT_GUTTER)
  );
  const aboveTop = anchorRect.top - clampedHeight - POPOVER_GAP;
  const belowTop = anchorRect.bottom + POPOVER_GAP;
  const top =
    aboveTop >= VIEWPORT_GUTTER
      ? aboveTop
      : clamp(
          belowTop,
          VIEWPORT_GUTTER,
          Math.max(VIEWPORT_GUTTER, viewportHeight - clampedHeight - VIEWPORT_GUTTER)
        );

  return {
    position: "fixed",
    left: `${left}px`,
    top: `${top}px`,
    maxWidth: `${maxSurfaceWidth}px`,
    maxHeight: `${maxSurfaceHeight}px`,
    ...(surfaceRect.width > maxSurfaceWidth ? { width: `${maxSurfaceWidth}px` } : {})
  };
}

export function resolveToolbarMenuSurfaceStyle(
  ownerDocument: Document,
  toolbarRect: DOMRect,
  triggerRect: DOMRect,
  surfaceRect: Pick<DOMRect, "height" | "width">,
  align: "start" | "end" = "start"
): CSSProperties {
  const ownerWindow = ownerDocument.defaultView;
  const viewportWidth = ownerWindow?.innerWidth ?? ownerDocument.documentElement.clientWidth;
  const viewportHeight = ownerWindow?.innerHeight ?? ownerDocument.documentElement.clientHeight;
  const maxSurfaceWidth = Math.max(1, viewportWidth - VIEWPORT_GUTTER * 2);
  const maxSurfaceHeight = Math.max(1, viewportHeight - VIEWPORT_GUTTER * 2);
  const clampedWidth = Math.max(1, Math.min(surfaceRect.width, maxSurfaceWidth));
  const clampedHeight = Math.max(1, Math.min(surfaceRect.height, maxSurfaceHeight));
  const anchoredLeft =
    align === "end"
      ? triggerRect.right - clampedWidth
      : triggerRect.left;
  const left = clamp(
    anchoredLeft,
    VIEWPORT_GUTTER,
    Math.max(VIEWPORT_GUTTER, viewportWidth - clampedWidth - VIEWPORT_GUTTER)
  );
  const top = clamp(
    toolbarRect.bottom + TOOLBAR_MENU_GAP,
    VIEWPORT_GUTTER,
    Math.max(VIEWPORT_GUTTER, viewportHeight - clampedHeight - VIEWPORT_GUTTER)
  );

  return {
    position: "fixed",
    left: `${left}px`,
    top: `${top}px`,
    maxWidth: `${maxSurfaceWidth}px`,
    maxHeight: `${maxSurfaceHeight}px`,
    ...(surfaceRect.width > maxSurfaceWidth ? { width: `${maxSurfaceWidth}px` } : {})
  };
}

export function getToolbarBlockTypeLabel(blockType: ToolbarBlockTypeId): string {
  switch (blockType) {
    case "heading1":
      return "Heading 1";
    case "heading2":
      return "Heading 2";
    case "heading3":
      return "Heading 3";
    case "bulletedList":
      return "Unordered List";
    case "numberedList":
      return "Numbered List";
    case "text":
    default:
      return "Text";
  }
}

export function getToolbarBlockType(editor: Editor): ToolbarBlockTypeId {
  const { selection } = editor.state;
  if (!isTextSelection(selection) || selection.empty) {
    return "text";
  }

  for (let depth = selection.$from.depth; depth >= 0; depth -= 1) {
    const node = selection.$from.node(depth);
    if (node.type.name === "heading") {
      switch (node.attrs.level) {
        case 1:
          return "heading1";
        case 2:
          return "heading2";
        case 3:
          return "heading3";
      }
    }

    if (node.type.name === "bulletList") {
      return "bulletedList";
    }

    if (node.type.name === "orderedList") {
      return "numberedList";
    }
  }

  return "text";
}

export function applyToolbarBlockTypeCommand(editor: Editor, target: ToolbarBlockTypeId): boolean {
  const current = getToolbarBlockType(editor);
  if (current === target) {
    return false;
  }

  let applied = false;

  editor
    .chain()
    .command(({ state, tr, dispatch }) => {
      const { selection, schema } = state;
      if (!isTextSelection(selection) || selection.empty || isNodeSelection(selection)) {
        return false;
      }

      const range = selection.$from.blockRange(selection.$to);
      if (!range) {
        return false;
      }

      const paragraphType = schema.nodes.paragraph;
      const headingType = schema.nodes.heading;
      const bulletListType = schema.nodes.bulletList;
      const orderedListType = schema.nodes.orderedList;
      const currentIsList = current === "bulletedList" || current === "numberedList";
      const targetIsList = target === "bulletedList" || target === "numberedList";
      const targetListType = target === "bulletedList" ? bulletListType : orderedListType;
      const targetAttrs = target === "heading1" ? { level: 1 } : target === "heading2" ? { level: 2 } : target === "heading3" ? { level: 3 } : {};

      function setTextblockTypeFromSelection(nodeType: typeof paragraphType | typeof headingType, attrs?: Record<string, unknown>) {
        const depth = tr.selection.$from.depth;
        const node = tr.selection.$from.node(depth);
        const pos = tr.selection.$from.before(depth);
        const attrsChanged = !!attrs && Object.keys(attrs).some((key) => node.attrs[key] !== attrs[key]);
        if (node.isTextblock && (node.type !== nodeType || attrsChanged)) {
          tr.setNodeMarkup(pos, nodeType, attrs);
        }
      }

      const listNode = currentIsList
        ? (() => {
            for (let depth = selection.$from.depth; depth >= 0; depth -= 1) {
              const node = selection.$from.node(depth);
              if (node.type === bulletListType || node.type === orderedListType) {
                return {
                  depth,
                  node,
                  pos: selection.$from.before(depth)
                };
              }
            }

            return null;
          })()
        : null;

      if (currentIsList && listNode) {
        if (targetIsList) {
          tr.setNodeMarkup(listNode.pos, targetListType);
          applied = true;
          return true;
        }

        const targetLift = liftTarget(range);
        if (targetLift == null) {
          return false;
        }

        tr.lift(range, targetLift);
        if (target === "text") {
          setTextblockTypeFromSelection(paragraphType);
        } else {
          setTextblockTypeFromSelection(headingType, targetAttrs);
        }

        applied = true;
        return true;
      }

      if (targetIsList) {
        setTextblockTypeFromSelection(paragraphType);
        const wrappedRange = tr.selection.$from.blockRange(tr.selection.$to);
        if (!wrappedRange) {
          return false;
        }

        const wrappers = findWrapping(wrappedRange, targetListType);
        if (!wrappers) {
          return false;
        }

        tr.wrap(wrappedRange, wrappers);
        applied = true;
        return true;
      }

      if (target === "text") {
        setTextblockTypeFromSelection(paragraphType);
        applied = true;
        return true;
      }

      setTextblockTypeFromSelection(headingType, targetAttrs);
      applied = true;
      return true;
    })
    .run();

  return applied;
}

export function getToolbarMarkState(editor: Editor) {
  return {
    blockquote: editor.isActive("blockquote"),
    bold: editor.isActive("bold"),
    code: editor.isActive("code"),
    highlight: editor.isActive("highlight"),
    italic: editor.isActive("italic"),
    link: editor.isActive("link"),
    strike: editor.isActive("strike"),
    subscript: editor.isActive("subscript"),
    superscript: editor.isActive("superscript"),
    underline: editor.isActive("underline")
  };
}

function toggleUnderlineMark(editor: Editor) {
  return editor.chain().focus(undefined, { scrollIntoView: false }).toggleUnderline().run();
}

function toggleHighlightMark(editor: Editor) {
  return editor.chain().focus(undefined, { scrollIntoView: false }).toggleHighlight().run();
}

function toggleSuperscriptMark(editor: Editor) {
  return editor
    .chain()
    .focus(undefined, { scrollIntoView: false })
    .unsetSubscript()
    .toggleSuperscript()
    .run();
}

function toggleSubscriptMark(editor: Editor) {
  return editor
    .chain()
    .focus(undefined, { scrollIntoView: false })
    .unsetSuperscript()
    .toggleSubscript()
    .run();
}

function getToolbarSelectionSnapshot(editor: Editor): ToolbarSelectionSnapshot | null {
  const { selection } = editor.state;
  if (!editor.isEditable || !isTextSelection(selection) || selection.empty || isNodeSelection(selection)) {
    return null;
  }

  const rect = getSelectionAnchorRect(editor);
  if (!rect) {
    return null;
  }

  const from = Math.min(selection.from, selection.to);
  const to = Math.max(selection.from, selection.to);
  return {
    from,
    key: `${from}:${to}`,
    rect,
    to
  };
}

function getSelectionAnchorRect(editor: Editor): DOMRect | null {
  const { selection } = editor.state;
  if (!editor.isEditable || !isTextSelection(selection) || selection.empty || isNodeSelection(selection) || !editor.view) {
    return null;
  }

  const ownerDocument = editor.view.dom.ownerDocument;
  try {
    const selectionApi = ownerDocument.getSelection();
    if (selectionApi?.rangeCount) {
      const range = selectionApi.getRangeAt(0);
      if (!range.collapsed) {
        const rects = Array.from(range.getClientRects()).filter((rect) => rect.width > 0 || rect.height > 0);
        if (rects.length > 0) {
          const orderedRects = selection.anchor <= selection.head ? rects : [...rects].reverse();
          const preferredRect = orderedRects.reduce<DOMRect | null>((best, candidate) => {
            if (!best) {
              return new DOMRect(candidate.left, candidate.top, Math.max(1, candidate.width), Math.max(1, candidate.height));
            }

            if (candidate.width < best.width - 0.5) {
              return new DOMRect(candidate.left, candidate.top, Math.max(1, candidate.width), Math.max(1, candidate.height));
            }

            if (Math.abs(candidate.width - best.width) <= 0.5 && candidate.top < best.top) {
              return new DOMRect(candidate.left, candidate.top, Math.max(1, candidate.width), Math.max(1, candidate.height));
            }

            return best;
          }, null);

          if (preferredRect) {
            return preferredRect;
          }
        }
      }
    }
  } catch {
    // Fall back to coordsAtPos below.
  }

  try {
    const fromRect = editor.view.coordsAtPos(Math.min(selection.from, selection.to));
    const toRect = editor.view.coordsAtPos(Math.max(selection.from, selection.to));
    const left = Math.min(fromRect.left, toRect.left);
    const right = Math.max(fromRect.right, toRect.right);
    const top = Math.min(fromRect.top, toRect.top);
    const bottom = Math.max(fromRect.bottom, toRect.bottom);
    return new DOMRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
  } catch {
    return null;
  }
}

function getSelectionRangeRect(editor: Editor, from: number, to: number): DOMRect | null {
  if (!editor.view) {
    return null;
  }

  try {
    const startRect = editor.view.coordsAtPos(Math.min(from, to));
    const endRect = editor.view.coordsAtPos(Math.max(from, to));
    const left = Math.min(startRect.left, endRect.left);
    const right = Math.max(startRect.right, endRect.right);
    const top = Math.min(startRect.top, endRect.top);
    const bottom = Math.max(startRect.bottom, endRect.bottom);
    return new DOMRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
  } catch {
    return null;
  }
}

function findLinkRange(editor: Editor): { from: number; to: number; href: string } | null {
  const { selection } = editor.state;
  const linkType = editor.schema.marks.link;
  if (!linkType) {
    return null;
  }

  const range = getMarkRange(selection.$from, linkType);
  if (!range) {
    return null;
  }

  const attrs = editor.getAttributes("link");
  const href = typeof attrs.href === "string" ? attrs.href : "";
  return {
    from: range.from,
    to: range.to,
    href
  };
}

function findLinkRangeAtPosition(editor: Editor, position: number): { from: number; to: number; href: string } | null {
  const linkType = editor.schema.marks.link;
  if (!linkType) {
    return null;
  }

  const resolvedPosition = editor.state.doc.resolve(position);
  const range = getMarkRange(resolvedPosition, linkType);
  if (!range) {
    return null;
  }

  const linkMark = resolvedPosition.marks().find((mark) => mark.type === linkType)
    ?? resolvedPosition.nodeAfter?.marks.find((mark) => mark.type === linkType)
    ?? resolvedPosition.nodeBefore?.marks.find((mark) => mark.type === linkType);
  const href = typeof linkMark?.attrs.href === "string" ? linkMark.attrs.href : "";

  return {
    from: range.from,
    to: range.to,
    href
  };
}

function buildSelectionSnapshot(editor: Editor): ToolbarSelectionSnapshot | null {
  return getToolbarSelectionSnapshot(editor);
}

function getMoreItemActiveState(editor: Editor, id: ToolbarMoreItemId): boolean {
  switch (id) {
    case "blockquote":
      return editor.isActive("blockquote");
    case "superscript":
      return editor.isActive("superscript");
    case "subscript":
      return editor.isActive("subscript");
    case "highlight":
      return editor.isActive("highlight");
  }
}

function applyMoreItemCommand(editor: Editor, id: ToolbarMoreItemId): boolean {
  switch (id) {
    case "blockquote":
      return editor.chain().focus(undefined, { scrollIntoView: false }).toggleBlockquote().run();
    case "superscript":
      return toggleSuperscriptMark(editor);
    case "subscript":
      return toggleSubscriptMark(editor);
    case "highlight":
      return toggleHighlightMark(editor);
  }
}

function CompactToolbarSeparator() {
  return <span className="docsera-text-toolbar__divider" aria-hidden="true" />;
}

function CompactToolbarIconButton({
  active,
  children,
  label,
  onTooltipShow,
  onTooltipHide,
  onClick,
  shortcut,
  title
}: {
  active?: boolean;
  children: ReactNode;
  label: string;
  onTooltipHide: () => void;
  onTooltipShow: (anchorRect: DOMRect, label: string, shortcut?: string | null, immediate?: boolean) => void;
  onClick: () => void;
  shortcut?: string | null;
  title: string;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  function showTooltip(immediate = false) {
    const rect = getElementRect(buttonRef.current);
    if (rect) {
      onTooltipShow(rect, label, shortcut, immediate);
    }
  }

  return (
    <button
      ref={buttonRef}
      type="button"
      className={`docsera-text-toolbar__button${active ? " docsera-text-toolbar__button--active" : ""}`}
      aria-label={label}
      aria-pressed={Boolean(active)}
      onBlur={onTooltipHide}
      onClick={() => {
        onTooltipHide();
        onClick();
      }}
      onFocus={() => showTooltip(true)}
      onMouseDown={(event) => event.preventDefault()}
      onMouseEnter={() => showTooltip(false)}
      onMouseLeave={onTooltipHide}
      data-shortcut={shortcut ?? ""}
    >
      {children}
      <span className="docsera-text-toolbar__sr-only">{title}</span>
    </button>
  );
}

function CompactToolbarMenuItem({
  active,
  id,
  label,
  onSelect,
  role
}: {
  active: boolean;
  id?: string;
  label: string;
  onSelect: () => void;
  role: "menuitemcheckbox" | "menuitemradio";
}) {
  const pointerActivationRef = useRef(false);

  return (
    <button
      type="button"
      id={id}
      role={role}
      className={`docsera-text-toolbar__menu-item${active ? " docsera-text-toolbar__menu-item--active" : ""}`}
      aria-checked={active}
      onClick={(event) => {
        if (pointerActivationRef.current) {
          pointerActivationRef.current = false;
          event.preventDefault();
          return;
        }
        onSelect();
      }}
      onMouseDown={(event) => {
        event.preventDefault();
        pointerActivationRef.current = true;
        onSelect();
      }}
    >
      <span>{label}</span>
      <span className="docsera-text-toolbar__menu-check" aria-hidden="true">
        {active ? <DocseraIcon icon={docseraIcons.check} size={14} /> : <span className="docsera-text-toolbar__menu-check-placeholder" />}
      </span>
    </button>
  );
}

function ToolbarTooltip({
  anchorRect,
  label,
  ownerDocument,
  ownerWindow,
  shortcut,
  tooltipRef
}: {
  anchorRect: DOMRect;
  label: string;
  ownerDocument: Document;
  ownerWindow: Window | null;
  shortcut?: string | null;
  tooltipRef: RefObject<HTMLDivElement>;
}) {
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties | null>(null);
  const formattedShortcut = shortcut ? formatToolbarShortcutLabel(shortcut, ownerWindow) : null;

  useLayoutEffect(() => {
    const tooltipElement = tooltipRef.current;
    if (!tooltipElement) {
      setTooltipStyle(null);
      return;
    }

    const size = tooltipElement.getBoundingClientRect();
    const width = Math.max(1, size.width);
    const height = Math.max(1, size.height);
    const nextStyle = resolveCenteredSurfaceStyle(ownerDocument, anchorRect, { width, height }, true);
    const style: CSSProperties = {
      ...nextStyle,
      visibility: "visible"
    };

    setTooltipStyle((current) => (sameStyle(current ?? undefined, style) ? current : style));
  }, [anchorRect, ownerDocument, tooltipRef]);

  return (
    <div
      ref={tooltipRef}
      className="docsera-text-toolbar__tooltip"
      role="tooltip"
      style={tooltipStyle ?? { visibility: "hidden" }}
    >
      <span className="docsera-text-toolbar__tooltip-label">{label}</span>
      {formattedShortcut ? <span className="docsera-text-toolbar__tooltip-shortcut">{formattedShortcut}</span> : null}
    </div>
  );
}

function LinkSurface({
  canEdit,
  linkSurface,
  layoutTick,
  onChangeHref,
  onCopy,
  onDismiss,
  onFollow,
  onKeyDown,
  onRemove,
  ownerDocument,
  surfaceRef
}: {
  canEdit: boolean;
  linkSurface: LinkSurfaceState;
  layoutTick: number;
  onChangeHref: (href: string) => void;
  onCopy: () => void;
  onDismiss: () => void;
  onFollow: () => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLInputElement>) => void;
  onRemove: () => void;
  ownerDocument: Document;
  surfaceRef: RefObject<HTMLDivElement>;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [surfaceStyle, setSurfaceStyle] = useState<CSSProperties | null>(null);
  const surfaceWidth = linkSurface.mode === "edit" ? LINK_MENU_EDIT_WIDTH : LINK_MENU_CREATE_WIDTH;
  const normalizedHref = normalizeLinkHref(linkSurface.draftHref);
  const hasDraftHref = linkSurface.draftHref.trim().length > 0;
  const canFollow = Boolean(normalizedHref) && isDocseraAllowedLinkHref(normalizedHref);
  const showExistingLinkActions = linkSurface.mode === "edit";

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [linkSurface.anchorRect, linkSurface.mode, linkSurface.source]);

  useLayoutEffect(() => {
    const element = surfaceRef.current;
    if (!element) {
      setSurfaceStyle(null);
      return;
    }

    const rect = element.getBoundingClientRect();
    const nextStyle = resolveCenteredSurfaceStyle(ownerDocument, linkSurface.anchorRect, {
      height: Math.max(1, rect.height),
      width: surfaceWidth
    });

    setSurfaceStyle((current) => (sameStyle(current ?? undefined, nextStyle) ? current : nextStyle));
  }, [layoutTick, linkSurface.anchorRect, linkSurface.mode, ownerDocument, surfaceRef, surfaceWidth]);

  return (
    <div
      ref={surfaceRef}
      className="docsera-text-toolbar__link-surface"
      role="dialog"
      aria-label={linkSurface.mode === "edit" ? "Edit link" : "Create link"}
      style={surfaceStyle ? { width: `${surfaceWidth}px`, ...surfaceStyle } : { visibility: "hidden", width: `${surfaceWidth}px` }}
    >
      <div className="docsera-text-toolbar__link-row">
        <div className="docsera-text-toolbar__link-input-shell">
          <Link2 size={14} strokeWidth={2} aria-hidden="true" />
          <input
            ref={inputRef}
            className="docsera-text-toolbar__link-input"
            type="text"
            value={linkSurface.draftHref}
            placeholder="Paste or type link"
            aria-label="Link URL"
            onChange={(event) => onChangeHref(event.target.value)}
            onKeyDown={onKeyDown}
            disabled={!canEdit}
          />
        </div>
        <div className="docsera-text-toolbar__link-actions">
          <button
            type="button"
            className="docsera-text-toolbar__button"
            aria-label="Open link"
            title="Open link"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onFollow}
            disabled={!canFollow}
              >
            <ExternalLink size={14} strokeWidth={2} />
          </button>
          {showExistingLinkActions ? (
            <>
              <button
                type="button"
                className="docsera-text-toolbar__button"
                aria-label="Copy URL"
                title="Copy URL"
                onMouseDown={(event) => event.preventDefault()}
                onClick={onCopy}
                disabled={!hasDraftHref}
              >
                <Copy size={14} strokeWidth={2} />
              </button>
              <button
                type="button"
                className="docsera-text-toolbar__button"
                aria-label="Remove link"
                title="Remove link"
                onMouseDown={(event) => event.preventDefault()}
                onClick={onRemove}
              >
                <Trash2 size={14} strokeWidth={2} />
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function CompactTextToolbar({ canEdit, editor, ownerDocument, ownerWindow, overlayRoot }: CompactTextToolbarProps) {
  const selectionSnapshot = useEditorState({
    editor,
    selector: ({ editor: snapshotEditor, transactionNumber }) =>
      snapshotEditor
        ? {
            transactionNumber,
            selectionEmpty: snapshotEditor.state.selection.empty,
            selectionFrom: snapshotEditor.state.selection.from,
            selectionInCodeBlock: isTextSelection(snapshotEditor.state.selection) && snapshotEditor.state.selection.$from.parent.type.spec.code,
            selectionRole: isTextSelection(snapshotEditor.state.selection)
              ? "text"
              : isNodeSelection(snapshotEditor.state.selection)
                ? "node"
                : "other",
            selectionTo: snapshotEditor.state.selection.to,
            editable: snapshotEditor.isEditable
          }
        : {
            transactionNumber,
            selectionEmpty: true,
            selectionFrom: 0,
            selectionInCodeBlock: false,
            selectionRole: "other" as const,
            selectionTo: 0,
            editable: false
          }
  });

  const [pointerSelectionHidden, setPointerSelectionHidden] = useState(false);
  const [toolbarDismissedSelectionKey, setToolbarDismissedSelectionKey] = useState("");
  const [openMenu, setOpenMenu] = useState<ToolbarMenuId | null>(null);
  const [displaySelection, setDisplaySelection] = useState<ToolbarSelectionSnapshot | null>(null);
  const [interactionSelection, setInteractionSelection] = useState<ToolbarSelectionSnapshot | null>(null);
  const [linkSurface, setLinkSurface] = useState<LinkSurfaceState | null>(null);
  const [tooltip, setTooltip] = useState<ToolbarTooltipState | null>(null);
  const [layoutTick, setLayoutTick] = useState(0);
  const [toolbarStyle, setToolbarStyle] = useState<CSSProperties | null>(null);
  const [blockMenuStyle, setBlockMenuStyle] = useState<CSSProperties | null>(null);
  const [moreMenuStyle, setMoreMenuStyle] = useState<CSSProperties | null>(null);

  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const blockTriggerRef = useRef<HTMLButtonElement | null>(null);
  const moreTriggerRef = useRef<HTMLButtonElement | null>(null);
  const blockMenuRef = useRef<HTMLDivElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);
  const linkSurfaceRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const interactionSelectionRef = useRef<ToolbarSelectionSnapshot | null>(null);
  const pointerSessionRef = useRef<{
    active: boolean;
    dragIntent: boolean;
    hasSettledSelection: boolean;
    origin: { x: number; y: number } | null;
    idleTimer: number | null;
    revealTimer: number | null;
  }>({
    active: false,
    dragIntent: false,
    hasSettledSelection: false,
    origin: null,
    idleTimer: null,
    revealTimer: null
  });
  const tooltipTimerRef = useRef<number | null>(null);
  const blockTypeMenuId = useId();
  const moreMenuId = useId();

  const liveSelection = useMemo(() => {
    if (!editor) {
      return null;
    }

    return buildSelectionSnapshot(editor);
  }, [editor, selectionSnapshot?.transactionNumber]);

  const isSelectionEligible =
    Boolean(editor) &&
    canEdit &&
    editor!.isEditable &&
    selectionSnapshot?.selectionRole === "text" &&
    !selectionSnapshot?.selectionEmpty &&
    !selectionSnapshot?.selectionInCodeBlock;

  const currentSelectionKey = isSelectionEligible ? `${selectionSnapshot.selectionFrom}:${selectionSnapshot.selectionTo}` : "";
  const isToolbarLinkSurfaceOpen = linkSurface?.source === "toolbar";
  const toolbarSelection = (openMenu || isToolbarLinkSurfaceOpen ? interactionSelection : displaySelection) ?? liveSelection ?? null;
  const toolbarBlockType = editor ? getToolbarBlockType(editor) : "text";
  const toolbarMarks = editor ? getToolbarMarkState(editor) : null;
  const toolbarVisible =
    Boolean(editor) &&
    linkSurface?.source !== "link-click" &&
    (
      Boolean(isToolbarLinkSurfaceOpen && interactionSelection) ||
      (
        isSelectionEligible &&
        !pointerSelectionHidden &&
        currentSelectionKey !== toolbarDismissedSelectionKey
      )
    );
  const isBlockTypeMenuOpen = openMenu === "blockType" && toolbarVisible;
  const isMoreMenuOpen = openMenu === "more" && toolbarVisible;

  function clearIdleTimer() {
    const session = pointerSessionRef.current;
    if (session.idleTimer !== null) {
      ownerWindow?.clearTimeout(session.idleTimer);
      session.idleTimer = null;
    }
  }

  function clearRevealTimer() {
    const session = pointerSessionRef.current;
    if (session.revealTimer !== null) {
      ownerWindow?.clearTimeout(session.revealTimer);
      session.revealTimer = null;
    }
  }

  function clearTooltipTimer() {
    if (tooltipTimerRef.current !== null) {
      ownerWindow?.clearTimeout(tooltipTimerRef.current);
      tooltipTimerRef.current = null;
    }
  }

  function clearTooltip() {
    clearTooltipTimer();
    setTooltip(null);
  }

  function clearInteractionSelection() {
    interactionSelectionRef.current = null;
    setInteractionSelection(null);
  }

  function setInteractionSelectionSnapshot(snapshot: ToolbarSelectionSnapshot | null) {
    interactionSelectionRef.current = snapshot;
    setInteractionSelection(snapshot);
  }

  function closeMenusAndTooltip() {
    setOpenMenu(null);
    clearTooltip();
  }

  function snapshotCurrentSelection() {
    if (!editor) {
      return null;
    }

    const snapshot = buildSelectionSnapshot(editor);
    if (!snapshot) {
      return null;
    }

    return snapshot;
  }

  function captureDisplaySelection() {
    const snapshot = snapshotCurrentSelection();
    setDisplaySelection(snapshot);
    return snapshot;
  }

  function restoreInteractionSelection(selection: ToolbarSelectionSnapshot) {
    if (!editor || !editor.isEditable) {
      return false;
    }

    const didRestore = editor
      .chain()
      .focus(undefined, { scrollIntoView: false })
      .setTextSelection({ from: selection.from, to: selection.to })
      .run();
    if (!didRestore) {
      return false;
    }

    const restoredSelection = snapshotCurrentSelection();
    return Boolean(
      restoredSelection &&
        restoredSelection.from === selection.from &&
        restoredSelection.to === selection.to
    );
  }

  function runMenuCommandWithInteractionSelection(
    command: () => boolean,
    options?: { allowNoDocumentChange?: boolean }
  ) {
    if (!editor) {
      return false;
    }

    const selection = interactionSelectionRef.current ?? toolbarSelection ?? snapshotCurrentSelection();
    if (!selection) {
      return false;
    }

    const previousDoc = editor.state.doc;
    const didRestoreSelection = restoreInteractionSelection(selection);
    if (!didRestoreSelection) {
      return false;
    }

    const didApply = command();
    if (!didApply) {
      return false;
    }

    const didDocumentChange = !previousDoc.eq(editor.state.doc);
    if (!didDocumentChange && !options?.allowNoDocumentChange) {
      return false;
    }

    setOpenMenu(null);
    clearInteractionSelection();
    clearTooltip();
    return true;
  }

  function dismissToolbarForCurrentSelection() {
    if (currentSelectionKey) {
      setToolbarDismissedSelectionKey(currentSelectionKey);
    }
    setOpenMenu(null);
    clearTooltip();
  }

  function toggleMenu(menuId: ToolbarMenuId) {
    if (!toolbarVisible) {
      return;
    }

    setLinkSurface(null);
    clearTooltip();
    const snapshot = captureDisplaySelection();
    if (!snapshot) {
      return;
    }

    setInteractionSelection(snapshot);
    setOpenMenu((current) => {
      if (current === menuId) {
        clearInteractionSelection();
        return null;
      }

      return menuId;
    });
  }

  function openLinkSurfaceFromEditor() {
    if (!editor || !canEdit || linkSurface) {
      return;
    }

    clearTooltip();
    setOpenMenu(null);
    const selectedLink = findLinkRange(editor);
    const selectionRange = captureDisplaySelection() ?? (selectedLink
      ? {
          from: selectedLink.from,
          key: `${selectedLink.from}:${selectedLink.to}`,
          rect: getSelectionRangeRect(editor, selectedLink.from, selectedLink.to) ?? getSelectionAnchorRect(editor) ?? new DOMRect(12, 12, 1, 1),
          to: selectedLink.to
        }
      : null);
    if (!selectionRange) {
      return;
    }

    setInteractionSelectionSnapshot(selectionRange);
    const href = selectedLink?.href ?? (typeof editor.getAttributes("link").href === "string" ? String(editor.getAttributes("link").href) : "");
    const mode: LinkSurfaceState["mode"] = selectedLink || editor.isActive("link") ? "edit" : "create";
    setLinkSurface({
      anchorRect: selectionRange.rect,
      draftHref: href,
      commandFrom: selectedLink?.from ?? selectionRange.from,
      mode,
      source: "toolbar",
      commandTo: selectedLink?.to ?? selectionRange.to,
      selectionFrom: selectionRange.from,
      selectionTo: selectionRange.to
    });
  }

  function dismissLinkSurface() {
    if (editor && linkSurface?.source === "toolbar") {
      editor
        .chain()
        .focus(undefined, { scrollIntoView: false })
        .setTextSelection({ from: linkSurface.selectionFrom, to: linkSurface.selectionTo })
        .run();
      setDisplaySelection(snapshotCurrentSelection());
    }

    setLinkSurface(null);
    clearInteractionSelection();
  }

  function suppressToolbarAfterLinkMutation() {
    const selection = snapshotCurrentSelection();
    const selectionKey = selection?.key ?? (linkSurface ? `${linkSurface.commandFrom}:${linkSurface.commandTo}` : "");

    if (selectionKey) {
      setToolbarDismissedSelectionKey(selectionKey);
    }

    closeMenusAndTooltip();
    clearInteractionSelection();
    setDisplaySelection(null);
  }

  function applyLinkSurface() {
    if (!editor || !linkSurface) {
      return;
    }

    const href = normalizeLinkHref(linkSurface.draftHref);
    if (!href) {
      dismissLinkSurface();
      return;
    }

    if (!editor.isEditable || !isDocseraAllowedLinkHref(href)) {
      return;
    }

    editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection({ from: linkSurface.commandFrom, to: linkSurface.commandTo }).run();
    if (editor.commands.setLink({ href, target: "_blank", rel: "noopener noreferrer nofollow", class: null, title: null })) {
      suppressToolbarAfterLinkMutation();
      setLinkSurface(null);
    }
  }

  function removeLinkSurfaceLink() {
    if (!editor || !linkSurface) {
      return;
    }

    editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection({ from: linkSurface.commandFrom, to: linkSurface.commandTo }).unsetLink().run();
    suppressToolbarAfterLinkMutation();
    setLinkSurface(null);
  }

  function followLinkSurfaceLink() {
    if (!linkSurface) {
      return;
    }

    const href = normalizeLinkHref(linkSurface.draftHref);
    if (!href || !isDocseraAllowedLinkHref(href)) {
      return;
    }

    const externalWindow = ownerWindow?.open(href, "_blank", "noopener,noreferrer") ?? null;
    if (externalWindow) {
      externalWindow.opener = null;
    }
  }

  async function copyLinkSurfaceLink() {
    if (!linkSurface) {
      return;
    }

    const href = normalizeLinkHref(linkSurface.draftHref);
    if (!href) {
      return;
    }

    try {
      await ownerWindow?.navigator.clipboard.writeText(href);
    } catch {
      // Clipboard failures are non-fatal for toolbar behavior.
    }
  }

  function handleLinkSurfaceInputKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      dismissLinkSurface();
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      applyLinkSurface();
    }
  }

  function onTooltipShow(anchorRect: DOMRect, label: string, shortcut?: string | null, immediate = false) {
    if (openMenu || linkSurface) {
      return;
    }

    clearTooltipTimer();
    setTooltip(null);
    if (immediate) {
      setTooltip({
        anchorRect,
        label,
        shortcut
      });
      return;
    }

    tooltipTimerRef.current = ownerWindow?.setTimeout(() => {
      tooltipTimerRef.current = null;
      setTooltip({
        anchorRect,
        label,
        shortcut
      });
    }, TOOLBAR_TOOLTIP_DELAY_MS) ?? null;
  }

  function onTooltipHide() {
    clearTooltip();
  }

  function revealToolbarForCurrentSelection() {
    const snapshot = snapshotCurrentSelection();
    setDisplaySelection(snapshot);
    setPointerSelectionHidden(false);
    pointerSessionRef.current.hasSettledSelection = Boolean(snapshot);
    if (snapshot) {
      setToolbarDismissedSelectionKey("");
    }
  }

  function scheduleToolbarRevealAfterSelectionCommit() {
    clearRevealTimer();
    pointerSessionRef.current.revealTimer =
      ownerWindow?.setTimeout(() => {
        pointerSessionRef.current.revealTimer = null;
        revealToolbarForCurrentSelection();
        setLayoutTick((current) => current + 1);
      }, 0) ?? null;
  }

  useEffect(() => {
    if (!editor || !canEdit || !editor.isEditable) {
      setOpenMenu(null);
      setLinkSurface(null);
      setTooltip(null);
      setDisplaySelection(null);
      setInteractionSelection(null);
      setPointerSelectionHidden(false);
      pointerSessionRef.current.hasSettledSelection = false;
      clearIdleTimer();
      clearRevealTimer();
      clearTooltipTimer();
      return;
    }
  }, [canEdit, editor]);

  useLayoutEffect(() => {
    if (
      pointerSelectionHidden ||
      openMenu ||
      linkSurface ||
      !toolbarVisible ||
      (pointerSessionRef.current.active && pointerSessionRef.current.dragIntent)
    ) {
      return;
    }

    const snapshot = snapshotCurrentSelection();
    if (snapshot) {
      setDisplaySelection((current) => (current?.key === snapshot.key ? current : snapshot));
    }
  }, [currentSelectionKey, linkSurface, openMenu, pointerSelectionHidden, toolbarVisible]);

  useEffect(() => {
    if (!currentSelectionKey || currentSelectionKey !== toolbarDismissedSelectionKey) {
      setToolbarDismissedSelectionKey("");
    }
  }, [currentSelectionKey, toolbarDismissedSelectionKey]);

  useEffect(() => {
    if (pointerSelectionHidden) {
      closeMenusAndTooltip();
    }
  }, [pointerSelectionHidden]);

  useEffect(() => {
    if (!openMenu && !linkSurface) {
      clearInteractionSelection();
    }
  }, [linkSurface, openMenu]);

  useEffect(() => {
    if (!toolbarVisible && openMenu) {
      setOpenMenu(null);
      clearInteractionSelection();
    }
  }, [openMenu, toolbarVisible]);

  useEffect(() => {
    return () => {
      clearIdleTimer();
      clearRevealTimer();
      clearTooltipTimer();
    };
  }, []);

  useLayoutEffect(() => {
    if (!toolbarVisible || !toolbarSelection || !toolbarRef.current) {
      setToolbarStyle(null);
      return;
    }

    const size = toolbarRef.current.getBoundingClientRect();
    const nextStyle = resolveToolbarSurfaceStyle(ownerDocument, toolbarSelection.rect, {
      height: Math.max(1, size.height),
      width: Math.max(1, size.width)
    });
    setToolbarStyle((current) => (sameStyle(current ?? undefined, nextStyle) ? current : nextStyle));
  }, [currentSelectionKey, layoutTick, ownerDocument, toolbarBlockType, toolbarSelection, toolbarVisible, pointerSelectionHidden, openMenu, linkSurface]);

  useLayoutEffect(() => {
    if (!isBlockTypeMenuOpen || !toolbarRef.current || !blockTriggerRef.current || !blockMenuRef.current) {
      setBlockMenuStyle(null);
      return;
    }

    const toolbarRect = toolbarRef.current.getBoundingClientRect();
    const triggerRect = blockTriggerRef.current.getBoundingClientRect();
    const menuRect = blockMenuRef.current.getBoundingClientRect();
    const nextStyle = resolveToolbarMenuSurfaceStyle(ownerDocument, toolbarRect, triggerRect, {
      height: Math.max(1, menuRect.height),
      width: Math.max(TOOLBAR_MENU_TARGET_WIDTH, Math.min(TOOLBAR_MENU_MAX_WIDTH, menuRect.width || 1))
    }, "start");
    setBlockMenuStyle((current) => (sameStyle(current ?? undefined, nextStyle) ? current : nextStyle));
  }, [blockMenuRef, blockTriggerRef, currentSelectionKey, isBlockTypeMenuOpen, layoutTick, ownerDocument, toolbarBlockType]);

  useLayoutEffect(() => {
    if (!isMoreMenuOpen || !toolbarRef.current || !moreTriggerRef.current || !moreMenuRef.current) {
      setMoreMenuStyle(null);
      return;
    }

    const toolbarRect = toolbarRef.current.getBoundingClientRect();
    const triggerRect = moreTriggerRef.current.getBoundingClientRect();
    const menuRect = moreMenuRef.current.getBoundingClientRect();
    const nextStyle = resolveToolbarMenuSurfaceStyle(ownerDocument, toolbarRect, triggerRect, {
      height: Math.max(1, menuRect.height),
      width: Math.max(TOOLBAR_MENU_TARGET_WIDTH, Math.min(TOOLBAR_MENU_MAX_WIDTH, menuRect.width || 1))
    }, "end");
    setMoreMenuStyle((current) => (sameStyle(current ?? undefined, nextStyle) ? current : nextStyle));
  }, [currentSelectionKey, isMoreMenuOpen, layoutTick, moreMenuRef, moreTriggerRef, ownerDocument]);

  useEffect(() => {
    if (!editor || (!toolbarVisible && !openMenu && !linkSurface && !tooltip)) {
      return;
    }

    const handleViewportChange = () => {
      setLayoutTick((current) => current + 1);
    };

    ownerDocument.addEventListener("scroll", handleViewportChange, true);
    ownerWindow?.addEventListener("resize", handleViewportChange, { passive: true });
    return () => {
      ownerDocument.removeEventListener("scroll", handleViewportChange, true);
      ownerWindow?.removeEventListener("resize", handleViewportChange);
    };
  }, [editor, linkSurface, openMenu, ownerDocument, ownerWindow, toolbarVisible, tooltip]);

  useEffect(() => {
    if (!editor || !canEdit || !editor.isEditable) {
      return;
    }

    const startPointerSelectionSession = (event: MouseEvent | PointerEvent) => {
      if (event.button !== 0) {
        return;
      }

      if (!isEventWithinEditor(event, editor.view.dom, ownerWindow)) {
        return;
      }

      pointerSessionRef.current.active = true;
      pointerSessionRef.current.dragIntent = false;
      pointerSessionRef.current.hasSettledSelection = false;
      pointerSessionRef.current.origin = { x: event.clientX, y: event.clientY };
      clearIdleTimer();
      clearRevealTimer();
      clearTooltipTimer();
      flushSync(() => {
        setPointerSelectionHidden(true);
        setDisplaySelection(null);
        setOpenMenu(null);
        setLinkSurface(null);
        clearInteractionSelection();
        setTooltip(null);
      });
    };

    const onPointerSelectionMove = (event: MouseEvent | PointerEvent) => {
      if (!pointerSessionRef.current.active) {
        return;
      }

      const origin = pointerSessionRef.current.origin;
      if (!origin) {
        return;
      }

      if (!pointerSessionRef.current.dragIntent) {
        const distance = Math.hypot(event.clientX - origin.x, event.clientY - origin.y);
        if (distance < EDITOR_DRAG_INTENT_THRESHOLD_PX) {
          return;
        }
        pointerSessionRef.current.dragIntent = true;
      }

      if (!pointerSessionRef.current.hasSettledSelection) {
        setPointerSelectionHidden(true);
        setDisplaySelection(null);
      }
      clearIdleTimer();
      pointerSessionRef.current.idleTimer =
        ownerWindow?.setTimeout(() => {
          pointerSessionRef.current.idleTimer = null;
          if (!pointerSessionRef.current.active || !pointerSessionRef.current.dragIntent) {
            return;
          }
          revealToolbarForCurrentSelection();
          setLayoutTick((current) => current + 1);
        }, TOOLBAR_POINTER_IDLE_MS) ?? null;
    };

    const endMouseSelectionSession = () => {
      if (!pointerSessionRef.current.active) {
        return;
      }

      pointerSessionRef.current.active = false;
      pointerSessionRef.current.dragIntent = false;
      pointerSessionRef.current.hasSettledSelection = false;
      pointerSessionRef.current.origin = null;
      clearIdleTimer();
      scheduleToolbarRevealAfterSelectionCommit();
    };

    ownerWindow?.addEventListener("pointerdown", startPointerSelectionSession, true);
    ownerWindow?.addEventListener("pointermove", onPointerSelectionMove);
    ownerWindow?.addEventListener("pointerup", endMouseSelectionSession, true);
    ownerWindow?.addEventListener("mousedown", startPointerSelectionSession, true);
    ownerWindow?.addEventListener("mousemove", onPointerSelectionMove);
    ownerWindow?.addEventListener("mouseup", endMouseSelectionSession, true);
    ownerWindow?.addEventListener("blur", endMouseSelectionSession);

    return () => {
      ownerWindow?.removeEventListener("pointerdown", startPointerSelectionSession, true);
      ownerWindow?.removeEventListener("pointermove", onPointerSelectionMove);
      ownerWindow?.removeEventListener("pointerup", endMouseSelectionSession, true);
      ownerWindow?.removeEventListener("mousedown", startPointerSelectionSession, true);
      ownerWindow?.removeEventListener("mousemove", onPointerSelectionMove);
      ownerWindow?.removeEventListener("mouseup", endMouseSelectionSession, true);
      ownerWindow?.removeEventListener("blur", endMouseSelectionSession);
      clearIdleTimer();
      clearRevealTimer();
    };
  }, [canEdit, editor, ownerDocument, ownerWindow]);

  useEffect(() => {
    if (!editor || (!toolbarVisible && !openMenu && !linkSurface && !tooltip)) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = resolveEventTargetNode(event, ownerWindow);
      if (!target) {
        return;
      }

      if (overlayRoot.contains(target)) {
        return;
      }

      if (tooltip) {
        clearTooltip();
        return;
      }

      if (linkSurface) {
        if (editor.view.dom.contains(target)) {
          setLinkSurface(null);
          clearInteractionSelection();
        } else {
          dismissLinkSurface();
        }
        return;
      }

      if (openMenu) {
        setOpenMenu(null);
        clearInteractionSelection();
      }
    };

    ownerDocument.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      ownerDocument.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [dismissLinkSurface, editor, linkSurface, openMenu, ownerDocument, ownerWindow, overlayRoot, toolbarVisible, tooltip]);

  useEffect(() => {
    if (!editor || !canEdit || !editor.isEditable) {
      return;
    }

    const handleOpenLinkSurface = () => {
      openLinkSurfaceFromEditor();
    };

    ownerDocument.addEventListener("docsera-open-link-surface", handleOpenLinkSurface);
    return () => {
      ownerDocument.removeEventListener("docsera-open-link-surface", handleOpenLinkSurface);
    };
  }, [canEdit, editor, openLinkSurfaceFromEditor, ownerDocument]);

  useEffect(() => {
    if (!editor || !canEdit || !editor.isEditable) {
      return;
    }

    let editorDom: HTMLElement;
    try {
      editorDom = editor.view.dom;
    } catch {
      return;
    }

    const handleEditorLinkClick = (event: MouseEvent) => {
      if (event.button !== 0 || linkSurface) {
        return;
      }

      const linkElement = resolveEditorLinkElementFromEvent(event, editorDom, ownerWindow);
      if (!linkElement) {
        return;
      }

      const clickPos = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
      if (!clickPos) {
        return;
      }

      const clickedLink = findLinkRangeAtPosition(editor, clickPos.pos);
      if (!clickedLink) {
        return;
      }

      event.preventDefault();
      closeMenusAndTooltip();
      clearInteractionSelection();
      setPointerSelectionHidden(false);
      setDisplaySelection(null);
      editor
        .chain()
        .focus(undefined, { scrollIntoView: false })
        .setTextSelection({ from: clickPos.pos, to: clickPos.pos })
        .run();
      setLinkSurface({
        anchorRect:
          getSelectionRangeRect(editor, clickedLink.from, clickedLink.to) ??
          new DOMRect(
            linkElement.getBoundingClientRect().left,
            linkElement.getBoundingClientRect().top,
            Math.max(1, linkElement.getBoundingClientRect().width),
            Math.max(1, linkElement.getBoundingClientRect().height)
          ),
        draftHref: clickedLink.href,
        commandFrom: clickedLink.from,
        mode: "edit",
        source: "link-click",
        commandTo: clickedLink.to,
        selectionFrom: clickedLink.from,
        selectionTo: clickedLink.to
      });
    };

    editorDom.addEventListener("mouseup", handleEditorLinkClick);
    return () => {
      editorDom.removeEventListener("mouseup", handleEditorLinkClick);
    };
  }, [canEdit, closeMenusAndTooltip, editor, linkSurface, ownerWindow]);

  useEffect(() => {
    if (!editor || (!toolbarVisible && !openMenu && !linkSurface && !tooltip)) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target;

      if (event.key === "Escape") {
        if (tooltip) {
          event.preventDefault();
          clearTooltip();
          return;
        }

        if (linkSurface) {
          event.preventDefault();
          dismissLinkSurface();
          return;
        }

        if (openMenu) {
          event.preventDefault();
          setOpenMenu(null);
          clearInteractionSelection();
          return;
        }

        if (toolbarVisible) {
          event.preventDefault();
          dismissToolbarForCurrentSelection();
        }
        return;
      }
    };

    ownerDocument.addEventListener("keydown", handleKeyDown, true);
    return () => {
      ownerDocument.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [clearTooltip, dismissLinkSurface, editor, linkSurface, openMenu, ownerDocument, toolbarVisible, tooltip]);

  if (!editor) {
    return null;
  }

  const toolbarNode = (
    <div className="docsera-text-toolbar-layer" aria-hidden={!toolbarVisible && !openMenu && !linkSurface && !tooltip}>
    {toolbarVisible && toolbarSelection ? (
        <div
          ref={toolbarRef}
          className="docsera-text-toolbar"
          role="toolbar"
          aria-label="Text formatting"
          style={toolbarStyle ?? { visibility: "hidden" }}
          data-surface="text-toolbar"
        >
          <div className="docsera-text-toolbar__group" role="presentation">
              <button
                ref={blockTriggerRef}
                type="button"
                className={`docsera-text-toolbar__trigger docsera-text-toolbar__trigger--text${isBlockTypeMenuOpen ? " docsera-text-toolbar__trigger--active" : ""}`}
              aria-haspopup="menu"
              aria-controls={blockTypeMenuId}
              aria-expanded={isBlockTypeMenuOpen}
              aria-label={getToolbarBlockTypeLabel(toolbarBlockType)}
              onClick={() => toggleMenu("blockType")}
              onMouseDown={(event) => event.preventDefault()}
              onFocus={() => {
                const triggerRect = getElementRect(blockTriggerRef.current);
                if (triggerRect) {
                  onTooltipShow(triggerRect, "Change to", undefined, true);
                }
              }}
              onBlur={onTooltipHide}
              onMouseEnter={() => {
                const triggerRect = getElementRect(blockTriggerRef.current);
                if (triggerRect) {
                  onTooltipShow(triggerRect, "Change to");
                }
              }}
              onMouseLeave={onTooltipHide}
              title=""
            >
              <span>{getToolbarBlockTypeLabel(toolbarBlockType)}</span>
              <DocseraIcon icon={isBlockTypeMenuOpen ? docseraIcons.chevronUp : docseraIcons.chevronDown} size={13} />
            </button>
            <CompactToolbarSeparator />
            <CompactToolbarIconButton
              label="Bold"
              active={toolbarMarks?.bold}
              shortcut={TOOLBAR_SHORTCUTS.bold}
              title={getToolbarActionTitle("Bold", TOOLBAR_SHORTCUTS.bold, ownerWindow)}
              onTooltipShow={onTooltipShow}
              onTooltipHide={onTooltipHide}
              onClick={() => {
                closeMenusAndTooltip();
                if (toolbarSelection) {
                  editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection({ from: toolbarSelection.from, to: toolbarSelection.to }).toggleBold().run();
                }
              }}
            >
              <Bold size={14} strokeWidth={2} />
            </CompactToolbarIconButton>
            <CompactToolbarIconButton
              label="Italic"
              active={toolbarMarks?.italic}
              shortcut={TOOLBAR_SHORTCUTS.italic}
              title={getToolbarActionTitle("Italic", TOOLBAR_SHORTCUTS.italic, ownerWindow)}
              onTooltipShow={onTooltipShow}
              onTooltipHide={onTooltipHide}
              onClick={() => {
                closeMenusAndTooltip();
                if (toolbarSelection) {
                  editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection({ from: toolbarSelection.from, to: toolbarSelection.to }).toggleItalic().run();
                }
              }}
            >
              <Italic size={14} strokeWidth={2} />
            </CompactToolbarIconButton>
            <CompactToolbarIconButton
              label="Underline"
              active={toolbarMarks?.underline}
              shortcut={TOOLBAR_SHORTCUTS.underline}
              title={getToolbarActionTitle("Underline", TOOLBAR_SHORTCUTS.underline, ownerWindow)}
              onTooltipShow={onTooltipShow}
              onTooltipHide={onTooltipHide}
              onClick={() => {
                closeMenusAndTooltip();
                if (toolbarSelection) {
                  editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection({ from: toolbarSelection.from, to: toolbarSelection.to }).run();
                  toggleUnderlineMark(editor);
                }
              }}
            >
              <Underline size={14} strokeWidth={2} />
            </CompactToolbarIconButton>
            <CompactToolbarIconButton
              label="Strikethrough"
              active={toolbarMarks?.strike}
              shortcut={TOOLBAR_SHORTCUTS.strike}
              title={getToolbarActionTitle("Strikethrough", TOOLBAR_SHORTCUTS.strike, ownerWindow)}
              onTooltipShow={onTooltipShow}
              onTooltipHide={onTooltipHide}
              onClick={() => {
                closeMenusAndTooltip();
                if (toolbarSelection) {
                  editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection({ from: toolbarSelection.from, to: toolbarSelection.to }).toggleStrike().run();
                }
              }}
            >
              <Strikethrough size={14} strokeWidth={2} />
            </CompactToolbarIconButton>
            <CompactToolbarIconButton
              label="Inline code"
              active={toolbarMarks?.code}
              shortcut={TOOLBAR_SHORTCUTS.code}
              title={getToolbarActionTitle("Inline code", TOOLBAR_SHORTCUTS.code, ownerWindow)}
              onTooltipShow={onTooltipShow}
              onTooltipHide={onTooltipHide}
              onClick={() => {
                closeMenusAndTooltip();
                if (toolbarSelection) {
                  editor.chain().focus(undefined, { scrollIntoView: false }).setTextSelection({ from: toolbarSelection.from, to: toolbarSelection.to }).toggleCode().run();
                }
              }}
            >
              <Code2 size={14} strokeWidth={2} />
            </CompactToolbarIconButton>
            <CompactToolbarIconButton
              label="Link"
              active={toolbarMarks?.link}
              shortcut={TOOLBAR_SHORTCUTS.link}
              title={getToolbarActionTitle("Link", TOOLBAR_SHORTCUTS.link, ownerWindow)}
              onTooltipShow={onTooltipShow}
              onTooltipHide={onTooltipHide}
              onClick={() => {
                if (toolbarSelection) {
                  openLinkSurfaceFromEditor();
                }
              }}
            >
              <Link2 size={14} strokeWidth={2} />
            </CompactToolbarIconButton>
            <CompactToolbarSeparator />
            <button
              ref={moreTriggerRef}
              type="button"
              className={`docsera-text-toolbar__trigger docsera-text-toolbar__trigger--more${isMoreMenuOpen ? " docsera-text-toolbar__trigger--active" : ""}`}
              aria-haspopup="menu"
              aria-controls={moreMenuId}
              aria-expanded={isMoreMenuOpen}
              aria-label="More"
              onClick={() => toggleMenu("more")}
              onMouseDown={(event) => event.preventDefault()}
              onFocus={() => {
                const triggerRect = getElementRect(moreTriggerRef.current);
                if (triggerRect) {
                  onTooltipShow(triggerRect, "More", undefined, true);
                }
              }}
              onBlur={onTooltipHide}
              onMouseEnter={() => {
                const triggerRect = getElementRect(moreTriggerRef.current);
                if (triggerRect) {
                  onTooltipShow(triggerRect, "More");
                }
              }}
              onMouseLeave={onTooltipHide}
              title=""
            >
              <DocseraIcon icon={docseraIcons.ellipsisVertical} size={14} />
            </button>
          </div>
        </div>
      ) : null}

      {isBlockTypeMenuOpen && toolbarSelection ? (
        <div ref={blockMenuRef} className="docsera-text-toolbar__menu" role="menu" aria-label="Change to" id={blockTypeMenuId} style={blockMenuStyle ?? { visibility: "hidden" }} data-surface="text-toolbar-menu">
          <p className="docsera-text-toolbar__surface-heading">Change to</p>
          <div className="docsera-text-toolbar__menu-list" role="presentation">
            {BLOCK_TYPE_MENU_ITEMS.map((item) => (
              <CompactToolbarMenuItem
                key={item.id}
                active={toolbarBlockType === item.id}
                label={item.label}
                role="menuitemradio"
                onSelect={() => {
                  if (!editor) {
                    return;
                  }

                  const current = getToolbarBlockType(editor);
                  if (current === item.id) {
                    setOpenMenu(null);
                    clearInteractionSelection();
                    clearTooltip();
                    return;
                  }

                  runMenuCommandWithInteractionSelection(() =>
                    applyToolbarBlockTypeCommand(editor, item.id)
                  );
                }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {isMoreMenuOpen && toolbarSelection ? (
        <div ref={moreMenuRef} className="docsera-text-toolbar__menu" role="menu" aria-label="More" id={moreMenuId} style={moreMenuStyle ?? { visibility: "hidden" }} data-surface="text-toolbar-menu">
          <p className="docsera-text-toolbar__surface-heading">More</p>
          <div className="docsera-text-toolbar__menu-list" role="presentation">
            {MORE_MENU_ITEMS.map((item) => (
              <CompactToolbarMenuItem
                key={item.id}
                active={getMoreItemActiveState(editor, item.id)}
                label={item.label}
                role="menuitemcheckbox"
                onSelect={() => {
                  if (!editor) {
                    return;
                  }

                  runMenuCommandWithInteractionSelection(() =>
                    applyMoreItemCommand(editor, item.id)
                  );
                }}
              />
            ))}
          </div>
        </div>
      ) : null}

      {linkSurface && editor ? (
        <LinkSurface
          canEdit={canEdit}
          linkSurface={linkSurface}
          layoutTick={layoutTick}
          onChangeHref={(draftHref) => {
            setLinkSurface((current) => (current ? { ...current, draftHref } : current));
          }}
          onCopy={() => {
            void copyLinkSurfaceLink();
          }}
          onDismiss={dismissLinkSurface}
          onFollow={followLinkSurfaceLink}
          onKeyDown={handleLinkSurfaceInputKeyDown}
          onRemove={removeLinkSurfaceLink}
          ownerDocument={ownerDocument}
          surfaceRef={linkSurfaceRef}
        />
      ) : null}

      {tooltip ? (
        <ToolbarTooltip
          anchorRect={tooltip.anchorRect}
          label={tooltip.label}
          ownerDocument={ownerDocument}
          ownerWindow={ownerWindow}
          shortcut={tooltip.shortcut}
          tooltipRef={tooltipRef}
        />
      ) : null}

      <style>{`
        .docsera-text-toolbar-layer {
          position: fixed;
          inset: 0;
          z-index: 30;
          pointer-events: none;
        }

        .docsera-text-toolbar,
        .docsera-text-toolbar__menu,
        .docsera-text-toolbar__link-surface,
        .docsera-text-toolbar__tooltip {
          pointer-events: auto;
        }

        .docsera-text-toolbar {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          inline-size: max-content;
          max-inline-size: calc(100vw - ${VIEWPORT_GUTTER * 2}px);
          min-height: 36px;
          padding: 3px 5px;
          border: 1px solid var(--docsera-border);
          border-radius: 10px;
          background: var(--docsera-surface);
          color: var(--docsera-text);
          box-shadow: var(--docsera-shadow);
          white-space: nowrap;
        }

        .docsera-text-toolbar__group {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          white-space: nowrap;
        }

        .docsera-text-toolbar__divider {
          width: 1px;
          height: 16px;
          flex: 0 0 auto;
          background: var(--docsera-border);
        }

        .docsera-text-toolbar__button,
        .docsera-text-toolbar__trigger,
        .docsera-text-toolbar__menu-item {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 28px;
          border: 1px solid transparent;
          border-radius: 8px;
          background: transparent;
          color: var(--docsera-text-muted);
          font-size: 0.75rem;
          font-weight: 500;
          line-height: 1;
          cursor: pointer;
          transition: background-color 0.16s ease, border-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
        }

        .docsera-text-toolbar__button,
        .docsera-text-toolbar__trigger {
          padding: 0 7px;
          min-width: 28px;
        }

        .docsera-text-toolbar__trigger {
          gap: 4px;
          color: var(--docsera-text-muted);
        }

        .docsera-text-toolbar__trigger--text,
        .docsera-text-toolbar__trigger--more {
          padding-left: 9px;
          padding-right: 9px;
        }

        .docsera-text-toolbar__trigger:hover,
        .docsera-text-toolbar__trigger:focus-visible,
        .docsera-text-toolbar__button:hover,
        .docsera-text-toolbar__button:focus-visible,
        .docsera-text-toolbar__menu-item:hover,
        .docsera-text-toolbar__menu-item:focus-visible {
          border-color: var(--docsera-border);
          background: var(--docsera-surface-muted);
          color: var(--docsera-primary);
          outline: none;
        }

        .docsera-text-toolbar__trigger:focus-visible,
        .docsera-text-toolbar__button:focus-visible,
        .docsera-text-toolbar__menu-item:focus-visible {
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--docsera-primary) 22%, transparent);
        }

        .docsera-text-toolbar__button--active,
        .docsera-text-toolbar__trigger--active,
        .docsera-text-toolbar__menu-item--active {
          border-color: color-mix(in srgb, var(--docsera-primary) 22%, var(--docsera-border));
          background: var(--docsera-primary-soft);
          color: var(--docsera-primary);
        }

        .docsera-text-toolbar__button svg,
        .docsera-text-toolbar__trigger svg,
        .docsera-text-toolbar__menu-check svg {
          width: 14px;
          height: 14px;
          flex: 0 0 auto;
        }

        .docsera-text-toolbar__menu {
          display: grid;
          gap: 4px;
          inline-size: max-content;
          min-width: ${TOOLBAR_MENU_TARGET_WIDTH}px;
          padding: 6px;
          border: 1px solid var(--docsera-border);
          border-radius: 8px;
          background: var(--docsera-surface);
          box-shadow: var(--docsera-shadow);
          max-width: min(${TOOLBAR_MENU_MAX_WIDTH}px, calc(100vw - ${VIEWPORT_GUTTER * 2}px));
        }

        .docsera-text-toolbar__surface-heading {
          margin: 0;
          padding: 0 4px 1px;
          color: var(--docsera-text-soft);
          font-size: 0.68rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }

        .docsera-text-toolbar__menu-list {
          display: grid;
          gap: 2px;
        }

        .docsera-text-toolbar__menu-item {
          justify-content: space-between;
          gap: 8px;
          width: 100%;
          min-height: 28px;
          padding: 0 8px;
          text-align: left;
          color: var(--docsera-text);
        }

        .docsera-text-toolbar__menu-check {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          width: 14px;
          height: 14px;
          color: var(--docsera-primary);
        }

        .docsera-text-toolbar__menu-check-placeholder {
          display: block;
          width: 14px;
          height: 14px;
        }

        .docsera-text-toolbar__link-surface {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          max-inline-size: min(${LINK_MENU_EDIT_WIDTH}px, calc(100vw - ${VIEWPORT_GUTTER * 2}px));
          padding: 8px 10px;
          border: 1px solid var(--docsera-border);
          border-radius: 12px;
          background: var(--docsera-surface);
          box-shadow: var(--docsera-shadow);
        }

        .docsera-text-toolbar__link-row {
          display: flex;
          align-items: center;
          gap: 8px;
          width: 100%;
          min-width: 0;
        }

        .docsera-text-toolbar__link-input-shell {
          display: flex;
          align-items: center;
          flex: 1 1 auto;
          gap: 8px;
          min-width: 220px;
          padding: 0 10px;
          min-height: 30px;
          border: 1px solid var(--docsera-border);
          border-radius: 8px;
          background: var(--docsera-surface);
          color: var(--docsera-text-soft);
        }

        .docsera-text-toolbar__tooltip-shortcut {
          color: var(--docsera-text-soft);
          font-size: 0.75rem;
          font-weight: 700;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .docsera-text-toolbar__link-input {
          width: 100%;
          min-width: 0;
          border: 0;
          background: transparent;
          color: var(--docsera-text);
          font: inherit;
          outline: none;
        }

        .docsera-text-toolbar__link-input::placeholder {
          color: var(--docsera-text-soft);
        }

        .docsera-text-toolbar__link-actions {
          display: flex;
          align-items: center;
          flex: 0 0 auto;
          gap: 4px;
        }

        .docsera-text-toolbar__button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .docsera-text-toolbar__tooltip {
          display: inline-flex;
          flex-direction: column;
          gap: 2px;
          padding: 6px 8px;
          border: 1px solid var(--docsera-border);
          border-radius: 8px;
          background: var(--docsera-surface);
          color: var(--docsera-text);
          box-shadow: var(--docsera-shadow);
          max-width: min(260px, calc(100vw - ${VIEWPORT_GUTTER * 2}px));
        }

        .docsera-text-toolbar__tooltip-label {
          font-size: 0.75rem;
          font-weight: 700;
          line-height: 1.2;
        }

        .docsera-text-toolbar__sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
      `}</style>
    </div>
  );

  return createPortal(toolbarNode, overlayRoot);
}
