import { Extension, type Editor } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import * as React from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Fragment } from "@tiptap/pm/model";
import type { DocseraDocumentEnvelope, DocseraTiptapDocument } from "../../shared/editor/document";
import { DOCSERA_DOCUMENT_SCHEMA_VERSION, parseDocseraDocumentOrThrow } from "../../shared/editor/document";
import { createDocseraEditorExtensions } from "../../shared/editor/schema";
import { extractDocumentOutline, type EditorOutlineItem } from "./documentOutline";
import {
  getEditorBlockCommandMatches,
  getGroupedEditorBlockCommandMatches,
  type EditorBlockCommand,
  type EditorBlockCommandId
} from "./editorBlockCommands";
import { resolveHoverTargetBlockIndex } from "./editorBlockHover";
import { sanitizeDocseraPastedHTML, sanitizeDocseraPastedText } from "./pasteSanitizer";
import type { PageBodySaveResult } from "../shared/types/docsera";
import { Plugin, PluginKey, Selection, TextSelection, type Transaction } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { CompactTextToolbar } from "./CompactTextToolbar";
import {
  Code2,
  Heading1,
  Heading2,
  Heading3,
  GripVertical,
  List,
  ListOrdered,
  Minus,
  Pilcrow,
  Plus,
  Quote,
} from "lucide-react";
import { BLOCK_SELECTOR_STYLES } from "./BlockSelectorStyles";

type PageEditorHostRuntimeProps = {
  canEdit: boolean;
  initialEnvelope: DocseraDocumentEnvelope;
  initialSavedEnvelope?: DocseraDocumentEnvelope;
  initialRevision: number;
  onAccessLost: () => void;
  onOutlineChange: (outline: EditorOutlineItem[]) => void;
  onRuntimeError?: () => void;
  onSaveDraft: (input: {
    draftContentJson: DocseraDocumentEnvelope;
    expectedRevision: number;
    pageSysId: string;
    readLatestDraftContentJson?: () => DocseraDocumentEnvelope | null;
  }) => Promise<PageBodySaveResult>;
  onEditorReady?: (editor: Editor) => void;
  onStatusChange: (state: {
    flush?: () => Promise<boolean>;
    getRecoverySnapshot?: () => {
      envelope: DocseraDocumentEnvelope;
      isDirty: boolean;
      pageSysId: string;
      savedRevision: number;
      sessionKey: string;
    } | null;
    isDirty: boolean;
    isSaving: boolean;
    status: "Unsaved" | "Saving…" | "Saved" | "Changes not saved";
  }) => void;
  overlayRoot: HTMLElement;
  pageSysId: string;
  sessionKey?: string;
  theme: "dark" | "light";
};

export type PageEditorHostRuntimeHandle = {
  destroy: () => void;
  update: (nextProps: PageEditorHostRuntimeProps) => void;
};

type RuntimeBoundaryProps = {
  children: React.ReactNode;
  onRuntimeError: (error: unknown) => void;
};

type RuntimeBoundaryState = {
  hasError: boolean;
};

type RuntimeStatus = "conflict" | "dirty" | "failed" | "saved" | "saving";

type HoverTarget = {
  accessibleLabel: string;
  blockIndex: number;
};

type EditorLaneGeometry = {
  laneRect: DOMRect;
  surfaceRect: DOMRect;
};

type CommandSelectorPlacement = "above" | "below";

type CommandSelectorState =
  | {
      activeIndex: number;
      fallbackAnchorRect: DOMRect;
      historyTime: number;
      insertedBlockIndex: number;
      ownerBlockIndex: number;
      ownerLabel: string;
      placement: CommandSelectorPlacement;
      query: string;
      source: "quickAdd";
    }
  | {
      activeIndex: number;
      anchorRect: DOMRect;
      ownerBlockIndex: number;
      placement: CommandSelectorPlacement;
      query: string;
      source: "slash";
    };

type BlockSelectionState = {
  ownerPos: number;
};

type BlockHandleGestureState = {
  blockIndex: number;
  originX: number;
  originY: number;
  pointerId: number;
  startedAt: number;
  dragIntent: boolean;
};

type SlashTriggerSelection = {
  blockIndex: number;
  from: number;
  to: number;
};

export type CommandQueryPresentationState = {
  ownerPos: number;
  query: string;
  source: CommandSelectorState["source"];
};

const AUTOSAVE_RETRY_DELAYS_MS = [1500, 3000, 6000, 12000] as const;
const QUICK_ADD_BUTTON_SIZE = 24;
const BLOCK_HANDLE_BUTTON_GAP = 6;
const BLOCK_GUTTER_CONTENT_GAP = 15;
const BLOCK_GUTTER_CONTROL_GROUP_WIDTH = QUICK_ADD_BUTTON_SIZE * 2 + BLOCK_HANDLE_BUTTON_GAP;
const BLOCK_GUTTER_WIDTH = BLOCK_GUTTER_CONTROL_GROUP_WIDTH + BLOCK_GUTTER_CONTENT_GAP;
const QUICK_ADD_ICON_SIZE = 14;
const BLOCK_SELECTOR_HEIGHT = 288;
const BLOCK_SELECTOR_WIDTH = 320;
const BLOCK_SELECTOR_PLACEMENT_GAP = 6;
const BLOCK_TARGET_TOP_OFFSET = 1;
const BLOCK_HANDLE_GESTURE_THRESHOLD_PX = 4;
const TIPTAP_SKIP_TRAILING_NODE_META = "skipTrailingNode";
const COMMAND_QUERY_PRESENTATION_PLUGIN_KEY = new PluginKey<CommandQueryPresentationState | null>("docseraCommandQueryPresentation");
const BLOCK_SELECTION_PLUGIN_KEY = new PluginKey<BlockSelectionState | null>("docseraBlockSelection");

export function getAutosaveRetryDelay(attempt: number): number | null {
  return Number.isInteger(attempt) && attempt >= 0 && attempt < AUTOSAVE_RETRY_DELAYS_MS.length
    ? AUTOSAVE_RETRY_DELAYS_MS[attempt]
    : null;
}
const POPOVER_GAP = 10;
const VIEWPORT_GUTTER = 12;

const SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE = "Something went wrong while saving the page body. Please try again.";
const AUTOSAVE_IDLE_MS = 700;

class RuntimeBoundary extends React.Component<RuntimeBoundaryProps, RuntimeBoundaryState> {
  state: RuntimeBoundaryState = { hasError: false };

  static getDerivedStateFromError(): RuntimeBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    this.props.onRuntimeError(error);
  }

  render() {
    return this.state.hasError ? null : this.props.children;
  }
}

function renderRuntimeRoot(reactRoot: Root, props: PageEditorHostRuntimeProps): void {
  reactRoot.render(
    <RuntimeBoundary
      onRuntimeError={() => {
        props.onRuntimeError?.();
      }}
    >
      <PageEditorHostRuntime {...props} />
    </RuntimeBoundary>
  );
}

export function mountPageEditorHostRuntime(input: {
  props: PageEditorHostRuntimeProps;
  runtimeRoot: HTMLElement;
}): PageEditorHostRuntimeHandle {
  const reactRoot = createRoot(input.runtimeRoot);
  let currentProps = input.props;

  renderRuntimeRoot(reactRoot, currentProps);

  return {
    destroy() {
      reactRoot.unmount();
    },
    update(nextProps) {
      currentProps = nextProps;
      renderRuntimeRoot(reactRoot, currentProps);
    }
  };
}

function cloneEnvelope(envelope: DocseraDocumentEnvelope): DocseraDocumentEnvelope {
  return JSON.parse(JSON.stringify(envelope)) as DocseraDocumentEnvelope;
}

function isTextSelection(selection: unknown): selection is TextSelection {
  return selection instanceof TextSelection;
}

function getBlockSelectionState(editor: Editor): BlockSelectionState | null {
  return BLOCK_SELECTION_PLUGIN_KEY.getState(editor.state) ?? null;
}

function resolveBlockSelectionState(
  editor: Editor,
  blockIndex: number
): BlockSelectionState | null {
  const ownerPos = getTopLevelBlockPosition(editor, blockIndex);
  if (ownerPos === null) {
    return null;
  }

  const ownerBlock = getTopLevelBlockAtPosition(editor.state.doc, ownerPos);
  if (!ownerBlock || !ownerBlock.node.isBlock) {
    return null;
  }

  return {
    ownerPos: ownerBlock.from
  };
}

function mapBlockSelectionState(
  transaction: Transaction,
  state: BlockSelectionState | null
): BlockSelectionState | null {
  if (!state) {
    return null;
  }

  const mappedOwnerPosResult = transaction.mapping.mapResult(state.ownerPos, -1);
  if (mappedOwnerPosResult.deleted) {
    return null;
  }

  const mappedOwnerPos = mappedOwnerPosResult.pos;
  const mappedBlock = getTopLevelBlockAtPosition(transaction.doc, mappedOwnerPos);
  if (!mappedBlock || !mappedBlock.node.isBlock) {
    return null;
  }

  return {
    ownerPos: mappedBlock.from
  };
}

function createBlockSelectionExtension() {
  return Extension.create({
    name: "docseraBlockSelection",
    addProseMirrorPlugins() {
      return [
        new Plugin<BlockSelectionState | null>({
          key: BLOCK_SELECTION_PLUGIN_KEY,
          state: {
            init: () => null,
            apply(transaction, value) {
              const meta = transaction.getMeta(BLOCK_SELECTION_PLUGIN_KEY);
              if (meta === null) {
                return null;
              }
              if (meta) {
                return mapBlockSelectionState(transaction, meta satisfies BlockSelectionState);
              }

              if (transaction.selectionSet) {
                return null;
              }

              return transaction.docChanged ? mapBlockSelectionState(transaction, value) : value;
            }
          },
          props: {
            decorations(state) {
              const selection = BLOCK_SELECTION_PLUGIN_KEY.getState(state);
              if (!selection) {
                return DecorationSet.empty;
              }

              const selectedBlock = getTopLevelBlockAtPosition(state.doc, selection.ownerPos);
              if (!selectedBlock || !selectedBlock.node.isBlock) {
                return DecorationSet.empty;
              }

              return DecorationSet.create(state.doc, [
                Decoration.node(selectedBlock.from, selectedBlock.to, {
                  class: "docsera-editor-runtime__block--selected",
                  "data-docsera-block-selected": "true"
                })
              ]);
            }
          }
        })
      ];
    }
  });
}

function resolveTopLevelBlockIndexForPosition(editor: Editor, position: number): number | null {
  let blockIndex: number | null = null;

  editor.state.doc.forEach((node, offset, index) => {
    const blockStart = offset + 1;
    const blockEnd = offset + node.nodeSize - 1;
    if (position >= blockStart && position <= blockEnd) {
      blockIndex = index;
    }
  });

  return blockIndex;
}

function getTopLevelBlockAtPosition(doc: Editor["state"]["doc"], position: number): {
  from: number;
  node: (typeof doc)["content"]["content"][number];
  to: number;
} | null {
  let block: {
    from: number;
    node: (typeof doc)["content"]["content"][number];
    to: number;
  } | null = null;

  doc.forEach((node, offset) => {
    if (offset === position) {
      block = {
        from: offset,
        node,
        to: offset + node.nodeSize
      };
    }
  });

  return block;
}

function getTopLevelBlockPositionFromDoc(doc: Editor["state"]["doc"], blockIndex: number): number | null {
  let blockPosition: number | null = null;

  doc.forEach((_node, offset, index) => {
    if (index === blockIndex) {
      blockPosition = offset;
    }
  });

  return blockPosition;
}

function getTopLevelBlockPosition(editor: Editor, blockIndex: number): number | null {
  return getTopLevelBlockPositionFromDoc(editor.state.doc, blockIndex);
}

function resolveBlockquoteExitBackspaceBoundary(editor: Editor): {
  blockquote: NonNullable<ReturnType<typeof getTopLevelBlockAtPosition>>;
  paragraph: NonNullable<ReturnType<typeof getTopLevelBlockAtPosition>>;
} | null {
  const selection = editor.state.selection;
  if (!isTextSelection(selection) || !selection.empty) {
    return null;
  }

  const { $from } = selection;
  if (
    $from.depth !== 1 ||
    $from.parent.type.name !== "paragraph" ||
    $from.parent.content.size !== 0 ||
    $from.parentOffset !== 0
  ) {
    return null;
  }

  const blockIndex = $from.index(0);
  if (blockIndex <= 0) {
    return null;
  }

  const paragraphPosition = getTopLevelBlockPositionFromDoc(editor.state.doc, blockIndex);
  const blockquotePosition = getTopLevelBlockPositionFromDoc(editor.state.doc, blockIndex - 1);
  if (paragraphPosition === null || blockquotePosition === null) {
    return null;
  }

  const paragraph = getTopLevelBlockAtPosition(editor.state.doc, paragraphPosition);
  const blockquote = getTopLevelBlockAtPosition(editor.state.doc, blockquotePosition);
  if (!paragraph || paragraph.node.type.name !== "paragraph" || !blockquote || blockquote.node.type.name !== "blockquote") {
    return null;
  }

  return {
    blockquote,
    paragraph
  };
}

function handleBlockquoteExitBackspace(editor: Editor): boolean {
  const boundary = resolveBlockquoteExitBackspaceBoundary(editor);
  if (!boundary) {
    return false;
  }

  let transaction = editor.state.tr.delete(boundary.paragraph.from, boundary.paragraph.to);
  const selectionAnchor = Math.max(1, Math.min(boundary.blockquote.from + boundary.blockquote.node.nodeSize - 1, transaction.doc.content.size));
  const resolvedSelection = Selection.findFrom(transaction.doc.resolve(selectionAnchor), -1, true);
  if (!(resolvedSelection instanceof TextSelection)) {
    return false;
  }

  transaction = transaction.setSelection(TextSelection.create(transaction.doc, resolvedSelection.from)).scrollIntoView();
  editor.view.dispatch(transaction);
  return true;
}

function resolveCommandQueryPresentationState(
  editor: Editor,
  selector: CommandSelectorState | null
): CommandQueryPresentationState | null {
  if (!selector) {
    return null;
  }

  const ownerPos = getTopLevelBlockPosition(editor, selector.ownerBlockIndex);
  if (ownerPos === null) {
    return null;
  }

  const ownerBlock = getTopLevelBlockAtPosition(editor.state.doc, ownerPos);
  if (!ownerBlock || ownerBlock.node.type.name !== "paragraph") {
    return null;
  }

  return {
    ownerPos,
    query: selector.query,
    source: selector.source
  };
}

function mapCommandQueryPresentationState(
  transaction: Transaction,
  state: CommandQueryPresentationState | null
): CommandQueryPresentationState | null {
  if (!state) {
    return null;
  }

  const mappedOwnerPos = transaction.mapping.map(state.ownerPos, -1);
  const mappedBlock = getTopLevelBlockAtPosition(transaction.doc, mappedOwnerPos);
  if (!mappedBlock || mappedBlock.node.type.name !== "paragraph") {
    return null;
  }

  return {
    ...state,
    ownerPos: mappedBlock.from
  };
}

function createCommandQueryPresentationExtension() {
  return Extension.create({
    name: "docseraCommandQueryPresentation",
    addProseMirrorPlugins() {
      return [
        new Plugin<CommandQueryPresentationState | null>({
          key: COMMAND_QUERY_PRESENTATION_PLUGIN_KEY,
          state: {
            init: () => null,
            apply(transaction, value) {
              const meta = transaction.getMeta(COMMAND_QUERY_PRESENTATION_PLUGIN_KEY);
              if (meta === null) {
                return null;
              }
              if (meta) {
                return mapCommandQueryPresentationState(transaction, meta satisfies CommandQueryPresentationState);
              }

              return transaction.docChanged ? mapCommandQueryPresentationState(transaction, value) : value;
            }
          },
          props: {
            decorations(state) {
              const presentation = COMMAND_QUERY_PRESENTATION_PLUGIN_KEY.getState(state);
              if (!presentation) {
                return DecorationSet.empty;
              }

              const ownerBlock = getTopLevelBlockAtPosition(state.doc, presentation.ownerPos);
              if (!ownerBlock || ownerBlock.node.type.name !== "paragraph") {
                return DecorationSet.empty;
              }

              const decorations: Decoration[] = [
                Decoration.node(ownerBlock.from, ownerBlock.to, {
                  class: "docsera-command-query-owner",
                  "data-docsera-command-query-owner": "true"
                })
              ];
              const queryPosition = ownerBlock.from + 1;

              if (presentation.query.length) {
                decorations.push(
                  Decoration.widget(
                    queryPosition,
                    () => {
                      const element = document.createElement("span");
                      element.className = "docsera-command-query-inline";
                      element.setAttribute("data-docsera-command-query", `/${presentation.query}`);
                      element.setAttribute("contenteditable", "false");
                      element.textContent = `/${presentation.query}`;
                      return element;
                    },
                    { side: -1 }
                  )
                );
              } else {
                decorations.push(
                  Decoration.widget(
                    queryPosition,
                    () => {
                      const slashElement = document.createElement("span");
                      slashElement.className = "docsera-command-query-inline";
                      slashElement.setAttribute("data-docsera-command-query-slash", "/");
                      slashElement.setAttribute("contenteditable", "false");
                      slashElement.textContent = "/";
                      return slashElement;
                    },
                    { side: -1 }
                  ),
                  Decoration.widget(
                    queryPosition,
                    () => {
                      const helperElement = document.createElement("span");
                      helperElement.className = "docsera-command-query-inline docsera-command-query-inline--helper";
                      helperElement.setAttribute("data-docsera-command-query-helper", "Type to search");
                      helperElement.setAttribute("contenteditable", "false");
                      helperElement.textContent = "Type to search";
                      return helperElement;
                    },
                    { side: 1 }
                  )
                );
              }

              return DecorationSet.create(state.doc, decorations);
            }
          }
        })
      ];
    }
  });
}

export function getCommandQueryPresentationState(editor: Editor): CommandQueryPresentationState | null {
  return COMMAND_QUERY_PRESENTATION_PLUGIN_KEY.getState(editor.state) ?? null;
}

function getSlashTriggerSelection(editor: Editor): SlashTriggerSelection | null {
  const { selection } = editor.state;
  if (!isTextSelection(selection) || !selection.empty || !editor.isEditable) {
    return null;
  }

  const { $from } = selection;
  const parent = $from.parent;
  if (!parent.isTextblock || parent.type.spec.code) {
    return null;
  }

  const text = parent.textBetween(0, $from.parentOffset, "", "");
  if (text.length > 0) {
    return null;
  }

  const blockIndex = resolveTopLevelBlockIndexForPosition(editor, selection.from);
  if (blockIndex === null) {
    return null;
  }

  return {
    blockIndex,
    from: selection.from,
    to: selection.to
  };
}

function getCaretBounds(editor: Editor): DOMRect | null {
  const { selection } = editor.state;
  if (!editor.isEditable || !isTextSelection(selection)) {
    return null;
  }

  try {
    const rect = editor.view.coordsAtPos(selection.from);
    return new DOMRect(rect.left, rect.top, Math.max(1, rect.right - rect.left), Math.max(1, rect.bottom - rect.top));
  } catch {
    return null;
  }
}

function clampSurfacePosition(ownerDocument: Document, rect: DOMRect, width: number, height: number, preferAbove = false): CSSProperties {
  const ownerWindow = ownerDocument.defaultView;
  const viewportWidth = ownerWindow?.innerWidth ?? ownerDocument.documentElement.clientWidth;
  const viewportHeight = ownerWindow?.innerHeight ?? ownerDocument.documentElement.clientHeight;
  const maxSurfaceWidth = Math.max(1, viewportWidth - VIEWPORT_GUTTER * 2);
  const maxSurfaceHeight = Math.max(1, viewportHeight - VIEWPORT_GUTTER * 2);
  const clampedWidth = Math.max(1, Math.min(width, maxSurfaceWidth));
  const clampedHeight = Math.max(1, Math.min(height, maxSurfaceHeight));
  const left = Math.min(Math.max(VIEWPORT_GUTTER, rect.left), Math.max(VIEWPORT_GUTTER, viewportWidth - clampedWidth - VIEWPORT_GUTTER));
  const belowTop = rect.bottom + POPOVER_GAP;
  const aboveTop = rect.top - clampedHeight - POPOVER_GAP;
  const top = preferAbove && aboveTop >= VIEWPORT_GUTTER ? aboveTop : Math.min(Math.max(VIEWPORT_GUTTER, belowTop), Math.max(VIEWPORT_GUTTER, viewportHeight - clampedHeight - VIEWPORT_GUTTER));

  return {
    left,
    top,
    width: `${clampedWidth}px`,
    maxWidth: `${maxSurfaceWidth}px`
  };
}

function resolveCommandSelectorPlacement(ownerDocument: Document, rect: DOMRect, height: number): CommandSelectorPlacement {
  const ownerWindow = ownerDocument.defaultView;
  const viewportHeight = ownerWindow?.innerHeight ?? ownerDocument.documentElement.clientHeight;
  const maxSurfaceHeight = Math.max(1, Math.min(height, viewportHeight - VIEWPORT_GUTTER * 2));
  const belowRoom = Math.max(0, viewportHeight - VIEWPORT_GUTTER - rect.bottom - POPOVER_GAP);
  const aboveRoom = Math.max(0, rect.top - VIEWPORT_GUTTER - POPOVER_GAP);

  if (belowRoom >= maxSurfaceHeight) {
    return "below";
  }
  if (aboveRoom >= maxSurfaceHeight) {
    return "above";
  }

  return aboveRoom > belowRoom ? "above" : "below";
}

function resolveConstrainedSurfaceHeight(
  ownerDocument: Document,
  rect: DOMRect,
  height: number,
  placement: CommandSelectorPlacement
) {
  const ownerWindow = ownerDocument.defaultView;
  const viewportHeight = ownerWindow?.innerHeight ?? ownerDocument.documentElement.clientHeight;
  const viewportAvailableHeight = Math.max(1, viewportHeight - VIEWPORT_GUTTER * 2);
  const sideAvailableHeight =
    placement === "above"
      ? Math.max(1, rect.top - VIEWPORT_GUTTER - POPOVER_GAP)
      : Math.max(1, viewportHeight - VIEWPORT_GUTTER - rect.bottom - POPOVER_GAP);

  return Math.max(1, Math.min(height, viewportAvailableHeight, sideAvailableHeight));
}

function buildSurfaceStyle(
  ownerDocument: Document,
  rect: DOMRect,
  width: number,
  height: number,
  placement: CommandSelectorPlacement
): CSSProperties {
  return {
    position: "fixed",
    ...clampSurfacePosition(
      ownerDocument,
      rect,
      width,
      resolveConstrainedSurfaceHeight(ownerDocument, rect, height, placement),
      placement === "above"
    )
  };
}

function buildRightAnchoredSurfaceStyle(
  ownerDocument: Document,
  rect: DOMRect,
  width: number,
  height: number,
  placement: CommandSelectorPlacement
): CSSProperties {
  const ownerWindow = ownerDocument.defaultView;
  const viewportWidth = ownerWindow?.innerWidth ?? ownerDocument.documentElement.clientWidth;
  const viewportHeight = ownerWindow?.innerHeight ?? ownerDocument.documentElement.clientHeight;
  const maxSurfaceWidth = Math.max(1, viewportWidth - VIEWPORT_GUTTER * 2);
  const clampedWidth = Math.max(1, Math.min(width, maxSurfaceWidth));
  const clampedHeight = resolveConstrainedSurfaceHeight(ownerDocument, rect, height, placement);
  const left = Math.min(
    Math.max(VIEWPORT_GUTTER, rect.right + BLOCK_SELECTOR_PLACEMENT_GAP),
    Math.max(VIEWPORT_GUTTER, viewportWidth - clampedWidth - VIEWPORT_GUTTER)
  );
  const preferredTop = placement === "above" ? rect.top - clampedHeight - POPOVER_GAP : rect.bottom + POPOVER_GAP;
  const top = Math.min(Math.max(VIEWPORT_GUTTER, preferredTop), Math.max(VIEWPORT_GUTTER, viewportHeight - clampedHeight - VIEWPORT_GUTTER));

  return {
    position: "fixed",
    left,
    top,
    width: `${clampedWidth}px`,
    maxWidth: `${maxSurfaceWidth}px`,
    maxHeight: `${clampedHeight}px`
  };
}

function buildQuickAddAnchorRect(targetRect: DOMRect): DOMRect {
  return new DOMRect(
    Math.max(VIEWPORT_GUTTER, targetRect.left - BLOCK_GUTTER_WIDTH),
    Math.max(VIEWPORT_GUTTER, targetRect.top + BLOCK_TARGET_TOP_OFFSET),
    QUICK_ADD_BUTTON_SIZE,
    Math.max(1, targetRect.bottom - (targetRect.top + BLOCK_TARGET_TOP_OFFSET))
  );
}

function buildGutterButtonStyle(targetRect: DOMRect): CSSProperties {
  const anchorRect = buildQuickAddAnchorRect(targetRect);
  return {
    position: "fixed",
    left: `${anchorRect.left}px`,
    top: `${anchorRect.top}px`,
    width: `${QUICK_ADD_BUTTON_SIZE}px`,
    height: `${QUICK_ADD_BUTTON_SIZE}px`
  };
}

function buildBlockHandleButtonStyle(targetRect: DOMRect): CSSProperties {
  const anchorRect = buildQuickAddAnchorRect(targetRect);
  return {
    position: "fixed",
    left: `${anchorRect.left + QUICK_ADD_BUTTON_SIZE + BLOCK_HANDLE_BUTTON_GAP}px`,
    top: `${anchorRect.top}px`,
    width: `${QUICK_ADD_BUTTON_SIZE}px`,
    height: `${QUICK_ADD_BUTTON_SIZE}px`
  };
}

function resolveEditorLaneGeometry(surfaceElement: HTMLElement, proseMirror: HTMLElement): EditorLaneGeometry {
  const surfaceRect = surfaceElement.getBoundingClientRect();
  const proseMirrorRect = proseMirror.getBoundingClientRect();

  return {
    surfaceRect,
    laneRect: new DOMRect(
      proseMirrorRect.left - BLOCK_GUTTER_WIDTH,
      surfaceRect.top,
      proseMirrorRect.width + BLOCK_GUTTER_WIDTH,
      surfaceRect.height
    )
  };
}

function getTopLevelBlockLabel(element: HTMLElement): string {
  switch (element.tagName) {
    case "H1":
      return "Heading 1";
    case "H2":
      return "Heading 2";
    case "H3":
      return "Heading 3";
    case "UL":
      return element.dataset.type === "taskList" ? "Task list" : "Bulleted List";
    case "OL":
      return "Numbered List";
    case "BLOCKQUOTE":
      return "Blockquote";
    case "PRE":
      return "Code Block";
    case "HR":
      return "Horizontal Rule";
    case "P":
    default:
      return "Text";
  }
}

function getTopLevelBlockElements(editor: Editor): HTMLElement[] {
  const proseMirror = editor.view.dom;
  if (!(proseMirror instanceof HTMLElement)) {
    return [];
  }

  return Array.from(proseMirror.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
}

function getTopLevelBlockRange(editor: Editor, blockIndex: number): { from: number; to: number } | null {
  let blockRange: { from: number; to: number } | null = null;

  editor.state.doc.forEach((node, offset, index) => {
    if (index === blockIndex) {
      blockRange = {
        from: offset,
        to: offset + node.nodeSize
      };
    }
  });

  return blockRange;
}

function getTopLevelBlockRect(editor: Editor, blockIndex: number): DOMRect | null {
  const element = getTopLevelBlockElements(editor)[blockIndex];
  return element ? element.getBoundingClientRect() : null;
}

function getTopLevelBlockElement(editor: Editor, blockIndex: number): HTMLElement | null {
  return getTopLevelBlockElements(editor)[blockIndex] ?? null;
}

function resolveHoverTargetFromPointer(editor: Editor, surfaceElement: HTMLElement, clientX: number, clientY: number): HoverTarget | null {
  const elements = getTopLevelBlockElements(editor);
  const proseMirror = editor.view.dom;
  if (!elements.length) {
    return null;
  }

  if (!(proseMirror instanceof HTMLElement)) {
    return null;
  }

  const { laneRect } = resolveEditorLaneGeometry(surfaceElement, proseMirror);
  const targetIndex = resolveHoverTargetBlockIndex(
    laneRect,
    elements.map((element) => element.getBoundingClientRect()),
    { clientX, clientY }
  );
  if (targetIndex === null) {
    return null;
  }

  return {
    accessibleLabel: getTopLevelBlockLabel(elements[targetIndex]),
    blockIndex: targetIndex
  };
}

function areHoverTargetsEqual(left: HoverTarget | null, right: HoverTarget | null): boolean {
  return left?.blockIndex === right?.blockIndex && left?.accessibleLabel === right?.accessibleLabel;
}

function areDomRectsEqual(left: DOMRect, right: DOMRect): boolean {
  return left.left === right.left && left.top === right.top && left.width === right.width && left.height === right.height;
}

function isGutterControlTarget(target: EventTarget | null): boolean {
  const targetElement =
    target instanceof HTMLElement ? target : target instanceof Node ? target.parentElement : null;
  return targetElement?.closest("[data-docsera-block-gutter='true']") instanceof HTMLElement;
}

function getPointerEventPathNodes(event: PointerEvent): Node[] {
  if (typeof event.composedPath !== "function") {
    return [];
  }

  return event.composedPath().filter((entry): entry is Node => entry instanceof Node);
}

function resolvePointerEventTarget(event: PointerEvent): EventTarget | null {
  const pathNodes = getPointerEventPathNodes(event);
  if (pathNodes.length > 0) {
    return pathNodes[0];
  }

  return event.target;
}

function isPointerEventInsideElement(event: PointerEvent, element: HTMLElement | null): boolean {
  if (!element) {
    return false;
  }

  const pathNodes = getPointerEventPathNodes(event);
  if (pathNodes.some((node) => node === element || element.contains(node))) {
    return true;
  }

  const target = event.target;
  return target instanceof Node ? target === element || element.contains(target) : false;
}

function isPointerEventInsideEditorLane(
  event: PointerEvent,
  surfaceElement: HTMLElement
): boolean {
  const proseMirror = surfaceElement.querySelector(".ProseMirror");
  if (proseMirror instanceof HTMLElement) {
    const { laneRect } = resolveEditorLaneGeometry(surfaceElement, proseMirror);
    if (
      event.clientX >= laneRect.left &&
      event.clientX <= laneRect.right &&
      event.clientY >= laneRect.top &&
      event.clientY <= laneRect.bottom
    ) {
      return true;
    }
  }

  const pathNodes = getPointerEventPathNodes(event);
  if (pathNodes.some((node) => surfaceElement.contains(node))) {
    return true;
  }

  if (pathNodes.some((node) => isGutterControlTarget(node))) {
    return true;
  }

  return false;
}

function resolvePointerOwnedHoverTarget(
  editor: Editor,
  surfaceElement: HTMLElement,
  event: PointerEvent,
  clientX: number,
  clientY: number
): HoverTarget | null {
  if (isPointerEventInsideEditorLane(event, surfaceElement)) {
    return resolveHoverTargetFromPointer(editor, surfaceElement, clientX, clientY);
  }

  const target = resolvePointerEventTarget(event);
  if (!(target instanceof Node) || (!surfaceElement.contains(target) && !isGutterControlTarget(target))) {
    return null;
  }

  return resolveHoverTargetFromPointer(editor, surfaceElement, clientX, clientY);
}

function BlockCommandIcon({ id }: { id: EditorBlockCommandId }) {
  switch (id) {
    case "text":
      return <Pilcrow size={16} strokeWidth={2} />;
    case "heading1":
      return <Heading1 size={16} strokeWidth={2} />;
    case "heading2":
      return <Heading2 size={16} strokeWidth={2} />;
    case "heading3":
      return <Heading3 size={16} strokeWidth={2} />;
    case "bulletedList":
      return <List size={16} strokeWidth={2} />;
    case "numberedList":
      return <ListOrdered size={16} strokeWidth={2} />;
    case "blockquote":
      return <Quote size={16} strokeWidth={2} />;
    case "horizontalRule":
      return <Minus size={16} strokeWidth={2} />;
    case "codeBlock":
    default:
      return <Code2 size={16} strokeWidth={2} />;
  }
}

function applyBlockCommand(editor: Editor, command: EditorBlockCommand) {
  command.run(editor);
}

function applyCommandSelectionOffset(
  editor: Editor,
  blockIndex: number,
  selectionOffset: number | "continuation" | undefined
): boolean {
  if (selectionOffset === undefined) {
    return true;
  }

  const blockRange = getTopLevelBlockRange(editor, blockIndex);
  const targetNode = blockIndex >= 0 && blockIndex < editor.state.doc.childCount ? editor.state.doc.child(blockIndex) : null;
  if (!blockRange || !targetNode) {
    return false;
  }

  const selectionAnchor =
    selectionOffset === "continuation"
      ? Math.min(blockRange.from + targetNode.nodeSize + 1, Math.max(1, editor.state.doc.content.size))
      : Math.min(blockRange.from + selectionOffset, Math.max(1, editor.state.doc.content.size));

  let transaction = editor.state.tr.setMeta("addToHistory", false);
  try {
    transaction = transaction.setSelection(TextSelection.create(transaction.doc, selectionAnchor));
  } catch {
    transaction = transaction.setSelection(Selection.near(transaction.doc.resolve(selectionAnchor), 1));
  }
  editor.view.dispatch(transaction);
  return true;
}

function applySlashCommand(editor: Editor, ownerBlockIndex: number, command: EditorBlockCommand): boolean {
  editor.commands.focus(undefined, { scrollIntoView: false });
  applyBlockCommand(editor, command);
  return applyCommandSelectionOffset(editor, ownerBlockIndex, command.slashSelectionOffset);
}

function replaceEmptyParagraphWithBlockquote(
  editor: Editor,
  blockIndex: number
): boolean {
  const blockRange = getTopLevelBlockRange(editor, blockIndex);
  const targetNode = blockIndex >= 0 && blockIndex < editor.state.doc.childCount ? editor.state.doc.child(blockIndex) : null;
  if (!blockRange || !targetNode || targetNode.type.name !== "paragraph" || targetNode.content.size !== 0) {
    return false;
  }

  const blockquoteNode = editor.schema.nodeFromJSON({
    type: "blockquote",
    content: [{ type: "paragraph" }]
  });
  let transaction = editor.state.tr
    .delete(blockRange.from, blockRange.to)
    .insert(blockRange.from, blockquoteNode)
    .setMeta(TIPTAP_SKIP_TRAILING_NODE_META, true);

  const selectionAnchor = Math.min(blockRange.from + 2, Math.max(1, transaction.doc.content.size));
  try {
    transaction = transaction.setSelection(TextSelection.create(transaction.doc, selectionAnchor));
  } catch {
    transaction = transaction.setSelection(Selection.near(transaction.doc.resolve(selectionAnchor), 1));
  }

  editor.view.dispatch(transaction);
  return true;
}

function restoreEditorSelectionFocus(
  editor: Editor,
  selectionAnchor: number
): void {
  if (editor.isDestroyed) {
    return;
  }

  const resolvedAnchor = Math.min(selectionAnchor, Math.max(1, editor.state.doc.content.size));
  let transaction = editor.state.tr.setMeta("addToHistory", false);
  try {
    transaction = transaction.setSelection(TextSelection.create(transaction.doc, resolvedAnchor));
  } catch {
    transaction = transaction.setSelection(Selection.near(transaction.doc.resolve(resolvedAnchor), 1));
  }

  if (!editor.state.selection.eq(transaction.selection)) {
    editor.view.dispatch(transaction);
  }

  editor.view.focus();
}

function replaceQuickAddParagraph(
  editor: Editor,
  blockIndex: number,
  command: EditorBlockCommand
): boolean {
  const blockRange = getTopLevelBlockRange(editor, blockIndex);
  const targetNode = blockIndex >= 0 && blockIndex < editor.state.doc.childCount ? editor.state.doc.child(blockIndex) : null;
  if (!blockRange || !targetNode || targetNode.type.name !== "paragraph" || targetNode.content.size !== 0) {
    return false;
  }

  const nextNodes = command.quickAdd.content.map((node) => editor.schema.nodeFromJSON(node));
  let transaction = editor.state.tr.delete(blockRange.from, blockRange.to).insert(blockRange.from, Fragment.fromArray(nextNodes));
  if (command.quickAdd.selectionOffset !== "continuation") {
    transaction = transaction.setMeta(TIPTAP_SKIP_TRAILING_NODE_META, true);
  }
  if (command.quickAdd.selectionOffset === "continuation") {
    const continuationAnchor = Math.min(blockRange.from + nextNodes[0].nodeSize + 1, Math.max(1, transaction.doc.content.size));
    try {
      transaction = transaction.setSelection(TextSelection.create(transaction.doc, continuationAnchor));
    } catch {
      transaction = transaction.setSelection(Selection.near(transaction.doc.resolve(continuationAnchor), 1));
    }
  } else {
    const selectionAnchor = Math.min(
      blockRange.from + command.quickAdd.selectionOffset,
      Math.max(1, transaction.doc.content.size)
    );
    try {
      transaction = transaction.setSelection(TextSelection.create(transaction.doc, selectionAnchor));
    } catch {
      transaction = transaction.setSelection(Selection.near(transaction.doc.resolve(selectionAnchor), 1));
    }
  }

  editor.view.dispatch(transaction);
  return true;
}

function runEditorCommandWithHistoryTime(editor: Editor, historyTime: number, run: () => boolean | void): boolean {
  const originalDispatch = editor.view.dispatch.bind(editor.view);
  let didRun = false;

  editor.view.dispatch = (transaction) => {
    transaction.time = historyTime;
    originalDispatch(transaction);
  };

  try {
    const result = run();
    didRun = result !== false;
  } finally {
    editor.view.dispatch = originalDispatch;
  }

  return didRun;
}

function normalizeDocument(document: DocseraTiptapDocument): DocseraTiptapDocument {
  const cloned = JSON.parse(JSON.stringify(document)) as DocseraTiptapDocument;
  return {
    ...cloned,
    content: Array.isArray(cloned.content) ? cloned.content : []
  };
}

function serializeDocument(document: DocseraTiptapDocument): string {
  return JSON.stringify(
    parseDocseraDocumentOrThrow({
      schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
      document: normalizeDocument(document)
    })
  );
}

function createEnvelope(document: DocseraTiptapDocument): DocseraDocumentEnvelope {
  const envelope = {
    schemaVersion: DOCSERA_DOCUMENT_SCHEMA_VERSION,
    document: normalizeDocument(document)
  };

  return parseDocseraDocumentOrThrow(envelope);
}

function statusLabel(status: RuntimeStatus): "Unsaved" | "Saving…" | "Saved" | "Changes not saved" {
  switch (status) {
    case "dirty":
      return "Unsaved";
    case "saving":
      return "Saving…";
    case "conflict":
      return "Changes not saved";
    case "failed":
      return "Changes not saved";
    case "saved":
    default:
      return "Saved";
  }
}

function createSyntheticClipboardData(input: { html: string; text: string }) {
  const html = sanitizeDocseraPastedHTML(input.html);
  const text = sanitizeDocseraPastedText(input.text);

  return {
    getData(type: string) {
      if (type === "text/html") {
        return html;
      }

      if (type === "text/plain") {
        return text;
      }

      return "";
    },
    types: [html ? "text/html" : "", text ? "text/plain" : ""].filter(Boolean)
  };
}

function dispatchSyntheticPaste(editor: Editor, input: { html: string; text: string }): void {
  const clipboardData = createSyntheticClipboardData(input);
  const pasteEvent =
    typeof ClipboardEvent === "function"
      ? new ClipboardEvent("paste", {
          bubbles: true,
          cancelable: true
        })
      : new Event("paste", {
          bubbles: true,
          cancelable: true
        });

  Object.defineProperty(pasteEvent, "clipboardData", {
    configurable: true,
    value: clipboardData
  });

  const wasHandled = !editor.view.dom.dispatchEvent(pasteEvent);
  if (!wasHandled && !pasteEvent.defaultPrevented) {
    const fallbackValue = clipboardData.getData("text/html") || clipboardData.getData("text/plain");
    if (fallbackValue) {
      editor.commands.insertContent(fallbackValue, {
        applyPasteRules: true
      });
    }
  }
}

function findLastCanvasContentElement(proseMirror: HTMLElement): HTMLElement | null {
  const directChildren = Array.from(proseMirror.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
  if (directChildren.length === 0) {
    return null;
  }

  for (let index = directChildren.length - 1; index >= 0; index -= 1) {
    const candidate = directChildren[index];
    if (candidate.getBoundingClientRect().height > 0) {
      return candidate;
    }
  }

  return directChildren[directChildren.length - 1] ?? null;
}

function isBelowEditorContentCanvasClick(event: React.MouseEvent<HTMLElement>, proseMirror: HTMLElement): boolean {
  const lastContentElement = findLastCanvasContentElement(proseMirror);
  if (!lastContentElement) {
    return true;
  }

  const lastContentRect = lastContentElement.getBoundingClientRect();
  return event.clientY >= lastContentRect.bottom;
}

function trySetEditorTabIndex(editor: Editor, isEditable: boolean): boolean {
  try {
    editor.view.dom.tabIndex = isEditable ? 0 : -1;
    return true;
  } catch {
    return false;
  }
}

export function PageEditorHostRuntime({
  canEdit,
  initialEnvelope,
  initialSavedEnvelope,
  initialRevision,
  onAccessLost,
  onOutlineChange,
  onSaveDraft,
  onEditorReady,
  onStatusChange,
  overlayRoot,
  pageSysId,
  sessionKey = "",
  theme
}: PageEditorHostRuntimeProps) {
  const [errorMessage, setErrorMessage] = useState("");
  const [hoverTarget, setHoverTarget] = useState<HoverTarget | null>(null);
  const [commandSelector, setCommandSelector] = useState<CommandSelectorState | null>(null);
  const [selectorScrollMetrics, setSelectorScrollMetrics] = useState({ hasOverflow: false, scrollbarWidth: 0 });
  const [overlayMeasurementVersion, setOverlayMeasurementVersion] = useState(0);
  const selectorListboxId = useId();
  const selectorQueryStateId = useId();
  const incomingInitialEnvelope = useMemo(() => parseDocseraDocumentOrThrow(initialEnvelope), [initialEnvelope]);
  const incomingInitialSavedEnvelope = useMemo(
    () => parseDocseraDocumentOrThrow(initialSavedEnvelope ?? initialEnvelope),
    [initialEnvelope, initialSavedEnvelope]
  );
  const mountedInitialEnvelopeRef = useRef<DocseraDocumentEnvelope | null>(null);
  const mountedInitialSavedEnvelopeRef = useRef<DocseraDocumentEnvelope | null>(null);
  if (mountedInitialEnvelopeRef.current === null) {
    mountedInitialEnvelopeRef.current = incomingInitialEnvelope;
  }
  if (mountedInitialSavedEnvelopeRef.current === null) {
    mountedInitialSavedEnvelopeRef.current = incomingInitialSavedEnvelope;
  }
  const validatedInitialEnvelope = mountedInitialEnvelopeRef.current;
  const validatedInitialSavedEnvelope = mountedInitialSavedEnvelopeRef.current;
  const initialDocumentKey = useMemo(() => serializeDocument(validatedInitialEnvelope.document), [validatedInitialEnvelope]);
  const initialSavedDocumentKey = useMemo(() => serializeDocument(validatedInitialSavedEnvelope.document), [validatedInitialSavedEnvelope]);
  const initialSessionIsClean = initialDocumentKey === initialSavedDocumentKey;
  const editorExtensions = useMemo(
    () => [...createDocseraEditorExtensions(), createCommandQueryPresentationExtension(), createBlockSelectionExtension()],
    []
  );
  const editorProps = useMemo(
    () => ({
      transformPastedHTML: sanitizeDocseraPastedHTML,
      transformPastedText: sanitizeDocseraPastedText,
      handleKeyDown: (_view: unknown, event: KeyboardEvent) => {
        const runtimeEditor = editorRef.current;
        if (!runtimeEditor || !editableRef.current) {
          return false;
        }

        if (
          (event.ctrlKey || event.metaKey) &&
          !event.altKey &&
          !event.shiftKey &&
          event.key.toLowerCase() === "k"
        ) {
          event.preventDefault();
          overlayOwnerDocument.dispatchEvent(new CustomEvent("docsera-open-link-surface"));
          return true;
        }

        const activeSelector = commandSelectorRef.current;
        if (activeSelector) {
          const selectorMatches = getEditorBlockCommandMatches(activeSelector.query);

          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setCommandSelector((current) =>
              current
                ? {
                    ...current,
                    activeIndex: selectorMatches.length
                      ? event.key === "ArrowDown"
                        ? (current.activeIndex + 1) % selectorMatches.length
                        : (current.activeIndex - 1 + selectorMatches.length) % selectorMatches.length
                      : 0
                  }
                : current
            );
            return true;
          }

          if (event.key === "Enter" || event.key === "Tab") {
            const activeCommand =
              selectorMatches[Math.max(0, Math.min(activeSelector.activeIndex, selectorMatches.length - 1))] ?? selectorMatches[0];
            if (activeCommand) {
              event.preventDefault();
              executeCommand(activeCommand);
              return true;
            }
          }

          if (event.key === "Escape") {
            event.preventDefault();
            closeCommandSelector();
            return true;
          }

          if (event.key === "Backspace") {
            event.preventDefault();
            if (!activeSelector.query.length) {
              closeCommandSelector();
            } else {
              setCommandSelector((current) =>
                current
                  ? {
                      ...current,
                      activeIndex: 0,
                      query: current.query.slice(0, -1)
                    }
                  : current
              );
            }
            return true;
          }

          if (event.key.length === 1 && /^[a-z0-9 -]$/i.test(event.key)) {
            event.preventDefault();
            setCommandSelector((current) =>
              current
                  ? {
                      ...current,
                      activeIndex: 0,
                      query: `${current.query}${event.key}`
                    }
                  : current
            );
            return true;
          }
        }

        const activeBlockSelection = getBlockSelectionState(runtimeEditor);
        if (activeBlockSelection) {
          const isModifierOnlyKey = event.key === "Shift" || event.key === "Control" || event.key === "Alt" || event.key === "Meta";
          if (!isModifierOnlyKey) {
            if (event.key === "Escape") {
              event.preventDefault();
              clearTransientBlockSelection();
              return true;
            }

            clearTransientBlockSelection();
          }
        }

        if (event.key === "/") {
          const triggerSelection = getSlashTriggerSelection(runtimeEditor);
          if (triggerSelection) {
            event.preventDefault();
            return openSlashSelector(runtimeEditor, triggerSelection);
          }
        }

        if (event.key === "Backspace" && handleBlockquoteExitBackspace(runtimeEditor)) {
          event.preventDefault();
          return true;
        }

        return false;
      },
      handleClickOn: (
        view: Editor["view"],
        _incomingDocPos: number,
        node: { type: { name: string }; childCount: number; firstChild?: { type: { name: string }; content: { size: number } } | null },
        nodePos: number,
        _event?: MouseEvent,
        _direct?: boolean
      ) => {
        if (!editableRef.current) {
          return false;
        }

        if (
          node.type.name !== "blockquote" ||
          node.childCount !== 1 ||
          node.firstChild?.type.name !== "paragraph" ||
          node.firstChild.content.size !== 0
        ) {
          return false;
        }

        const selectionAnchor = Math.min(nodePos + 2, Math.max(1, view.state.doc.content.size));
        let transaction = view.state.tr.setMeta("addToHistory", false);
        try {
          transaction = transaction.setSelection(TextSelection.create(transaction.doc, selectionAnchor));
        } catch {
          transaction = transaction.setSelection(Selection.near(transaction.doc.resolve(selectionAnchor), 1));
        }

        view.dispatch(transaction);
        view.focus();
        return true;
      }
    }),
    []
  );
  const [savedDocumentKey, setSavedDocumentKey] = useState(() => initialSavedDocumentKey);
  const [savedRevision, setSavedRevision] = useState(initialRevision);
  const [status, setStatus] = useState<RuntimeStatus>(() => (initialDocumentKey === initialSavedDocumentKey ? "saved" : "dirty"));
  const disposedRef = useRef(false);
  const saveInFlightRef = useRef(false);
  const savePromiseRef = useRef<Promise<boolean> | null>(null);
  const autosaveTimerRef = useRef<number | null>(null);
  const retryTimerRef = useRef<number | null>(null);
  const retryAttemptRef = useRef(0);
  const saveGenerationRef = useRef(0);
  const currentDocumentKeyRef = useRef(initialDocumentKey);
  const savedDocumentKeyRef = useRef(savedDocumentKey);
  const savedRevisionRef = useRef(initialRevision);
  const statusRef = useRef<RuntimeStatus>("saved");
  const initializingRef = useRef(true);
  const editorRef = useRef<Editor | null>(null);
  const editableRef = useRef(false);
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const selectorScrollRef = useRef<HTMLDivElement | null>(null);
  const hoverTargetRef = useRef<HoverTarget | null>(null);
  const commandSelectorRef = useRef<CommandSelectorState | null>(null);
  const blockHandleGestureRef = useRef<BlockHandleGestureState | null>(null);
  const lastPointerSnapshotRef = useRef<{ clientX: number; clientY: number; insideEditorLane: boolean } | null>(null);
  const overlayMeasurementFrameRef = useRef<number | null>(null);
  const onEditorReadyRef = useRef(onEditorReady);
  const onOutlineChangeRef = useRef(onOutlineChange);
  const isEditable = canEdit;
  const overlayOwnerDocument = overlayRoot.ownerDocument;
  const overlayOwnerWindow = overlayOwnerDocument.defaultView;
  const commandGroups = useMemo(
    () => (commandSelector ? getGroupedEditorBlockCommandMatches(commandSelector.query) : []),
    [commandSelector]
  );
  const commandMatches = useMemo(
    () => commandGroups.flatMap((group) => group.commands),
    [commandGroups]
  );
  const blockHandleGestureCleanupRef = useRef<(() => void) | null>(null);

  const clearTransientBlockSelection = useCallback(() => {
    const runtimeEditor = editorRef.current;
    if (!runtimeEditor || runtimeEditor.isDestroyed) {
      return;
    }

    if (!getBlockSelectionState(runtimeEditor)) {
      return;
    }

    runtimeEditor.view.dispatch(runtimeEditor.state.tr.setMeta(BLOCK_SELECTION_PLUGIN_KEY, null).setMeta("addToHistory", false));
  }, []);

  const setTransientBlockSelection = useCallback((blockIndex: number) => {
    const runtimeEditor = editorRef.current;
    if (!runtimeEditor || runtimeEditor.isDestroyed) {
      return;
    }

    const nextSelection = resolveBlockSelectionState(runtimeEditor, blockIndex);
    if (!nextSelection) {
      return;
    }

    const currentSelection = getBlockSelectionState(runtimeEditor);
    if (currentSelection?.ownerPos === nextSelection.ownerPos) {
      return;
    }

    runtimeEditor.view.dispatch(
      runtimeEditor.state.tr.setMeta(BLOCK_SELECTION_PLUGIN_KEY, nextSelection).setMeta("addToHistory", false)
    );
  }, []);

  const clearBlockHandleGesture = useCallback(() => {
    blockHandleGestureRef.current = null;
    if (blockHandleGestureCleanupRef.current) {
      blockHandleGestureCleanupRef.current();
      blockHandleGestureCleanupRef.current = null;
    }
  }, []);

  const selectBlockFromHandle = useCallback(
    (blockIndex: number) => {
      setTransientBlockSelection(blockIndex);
    },
    [setTransientBlockSelection]
  );

  const scheduleOverlayMeasurement = useCallback(() => {
    const requestAnimationFrameFn =
      overlayOwnerWindow?.requestAnimationFrame?.bind(overlayOwnerWindow) ?? window.requestAnimationFrame.bind(window);
    if (overlayMeasurementFrameRef.current !== null) {
      return;
    }

    overlayMeasurementFrameRef.current = requestAnimationFrameFn(() => {
      overlayMeasurementFrameRef.current = null;
      setOverlayMeasurementVersion((current) => current + 1);
    });
  }, [overlayOwnerWindow]);

  function setOwnedHoverTarget(nextTarget: HoverTarget | null) {
    if (areHoverTargetsEqual(hoverTargetRef.current, nextTarget)) {
      return;
    }

    hoverTargetRef.current = nextTarget;
    setHoverTarget(nextTarget);
  }

  const syncHoverTargetFromLastPointer = useCallback(() => {
    const runtimeEditor = editorRef.current;
    const surfaceElement = surfaceRef.current;
    const pointerSnapshot = lastPointerSnapshotRef.current;
    if (!runtimeEditor || !surfaceElement || !pointerSnapshot?.insideEditorLane) {
      setOwnedHoverTarget(null);
      return;
    }

    setOwnedHoverTarget(
      resolveHoverTargetFromPointer(
        runtimeEditor,
        surfaceElement,
        pointerSnapshot.clientX,
        pointerSnapshot.clientY
      )
    );
  }, []);

  const closeCommandSelector = useCallback(
    (options: { syncHoverFromPointer?: boolean } = {}) => {
      const { syncHoverFromPointer = true } = options;
      setCommandSelector(null);
      if (syncHoverFromPointer) {
        syncHoverTargetFromLastPointer();
      } else {
        setOwnedHoverTarget(null);
      }
    },
    [syncHoverTargetFromLastPointer]
  );

  function openSlashSelector(runtimeEditor: Editor, triggerSelection: SlashTriggerSelection) {
    clearTransientBlockSelection();
    const anchorRect = getCaretBounds(runtimeEditor) ?? new DOMRect(12, 12, 1, 1);

    setCommandSelector({
      activeIndex: 0,
      anchorRect,
      ownerBlockIndex: triggerSelection.blockIndex,
      placement: resolveCommandSelectorPlacement(overlayOwnerDocument, anchorRect, BLOCK_SELECTOR_HEIGHT),
      query: "",
      source: "slash"
    });
    return true;
  }

  function openQuickAddSelector(target: HoverTarget) {
    const runtimeEditor = editorRef.current;
    if (!runtimeEditor) {
      return;
    }

    clearTransientBlockSelection();

    let afterPos = runtimeEditor.state.doc.content.size;
    runtimeEditor.state.doc.forEach((node, offset, index) => {
      if (index === target.blockIndex) {
        afterPos = offset + node.nodeSize;
      }
    });

    const targetRect = getTopLevelBlockRect(runtimeEditor, target.blockIndex);
    if (!targetRect) {
      return;
    }
    const insertedBlockIndex = target.blockIndex + 1;

    const historyTime = Date.now();
    if (
      !runEditorCommandWithHistoryTime(runtimeEditor, historyTime, () =>
        runtimeEditor
          .chain()
          .focus(undefined, { scrollIntoView: false })
          .insertContentAt(afterPos, { type: "paragraph" })
          .setTextSelection(afterPos + 1)
          .run()
      )
    ) {
      return;
    }

    const insertedBlockRect = getTopLevelBlockRect(runtimeEditor, insertedBlockIndex) ?? targetRect;
    setCommandSelector({
      activeIndex: 0,
      fallbackAnchorRect: buildQuickAddAnchorRect(insertedBlockRect),
      historyTime,
      insertedBlockIndex,
      ownerBlockIndex: insertedBlockIndex,
      ownerLabel: target.accessibleLabel,
      placement: resolveCommandSelectorPlacement(
        overlayOwnerDocument,
        buildQuickAddAnchorRect(insertedBlockRect),
        BLOCK_SELECTOR_HEIGHT
      ),
      query: "",
      source: "quickAdd"
    });
  }

  const syncCommandQueryPresentation = useCallback(
    (nextSelector: CommandSelectorState | null) => {
      const runtimeEditor = editorRef.current;
      if (!runtimeEditor) {
        return;
      }

      const nextPresentation = resolveCommandQueryPresentationState(runtimeEditor, nextSelector);
      const currentPresentation = getCommandQueryPresentationState(runtimeEditor);
      if (
        currentPresentation?.ownerPos === nextPresentation?.ownerPos &&
        currentPresentation?.query === nextPresentation?.query &&
        currentPresentation?.source === nextPresentation?.source
      ) {
        return;
      }

      runtimeEditor.view.dispatch(
        runtimeEditor.state.tr
          .setMeta(COMMAND_QUERY_PRESENTATION_PLUGIN_KEY, nextPresentation)
          .setMeta("addToHistory", false)
      );
    },
    []
  );

  function executeCommand(command: EditorBlockCommand) {
    const runtimeEditor = editorRef.current;
    const activeSelector = commandSelectorRef.current;
    if (!runtimeEditor || !activeSelector) {
      return;
    }

    let didExecute = false;
    if (activeSelector.source === "quickAdd") {
      didExecute = runEditorCommandWithHistoryTime(runtimeEditor, activeSelector.historyTime, () => {
        if (command.id === "blockquote") {
          return replaceEmptyParagraphWithBlockquote(runtimeEditor, activeSelector.insertedBlockIndex);
        }
        return replaceQuickAddParagraph(runtimeEditor, activeSelector.insertedBlockIndex, command);
      });
    } else {
      didExecute =
        command.id === "blockquote"
          ? replaceEmptyParagraphWithBlockquote(runtimeEditor, activeSelector.ownerBlockIndex)
          : applySlashCommand(runtimeEditor, activeSelector.ownerBlockIndex, command);
    }
    if (!didExecute) {
      return;
    }
    const selectionAnchor = runtimeEditor.state.selection.from;
    clearTransientBlockSelection();
    closeCommandSelector();
    if (activeSelector.source === "quickAdd" || activeSelector.source === "slash") {
      if (editorRef.current === runtimeEditor && !runtimeEditor.isDestroyed) {
        restoreEditorSelectionFocus(runtimeEditor, selectionAnchor);
      }
    }
  }

  useEffect(() => {
    editableRef.current = isEditable;
    if (!isEditable) {
      cancelPendingTimers();
      setOwnedHoverTarget(null);
      setCommandSelector(null);
      clearTransientBlockSelection();
      clearBlockHandleGesture();
    }
  }, [clearBlockHandleGesture, clearTransientBlockSelection, isEditable]);

  useEffect(() => {
    setOwnedHoverTarget(null);
    setCommandSelector(null);
    clearTransientBlockSelection();
    clearBlockHandleGesture();
  }, [clearBlockHandleGesture, clearTransientBlockSelection, pageSysId, sessionKey]);

  useEffect(() => {
    commandSelectorRef.current = commandSelector;
  }, [commandSelector]);

  useEffect(() => {
    const runtimeEditor = editorRef.current;
    if (!commandSelector || !runtimeEditor) {
      return;
    }

    if (commandSelector.source === "slash") {
      const nextAnchorRect = getCaretBounds(runtimeEditor) ?? commandSelector.anchorRect;
      const nextPlacement = resolveCommandSelectorPlacement(overlayOwnerDocument, nextAnchorRect, BLOCK_SELECTOR_HEIGHT);

      if (areDomRectsEqual(commandSelector.anchorRect, nextAnchorRect) && commandSelector.placement === nextPlacement) {
        return;
      }

      setCommandSelector((current) =>
        current && current.source === "slash"
          ? {
              ...current,
              anchorRect: nextAnchorRect,
              placement: nextPlacement
            }
          : current
      );
      return;
    }

    const insertedBlockRect = getTopLevelBlockRect(runtimeEditor, commandSelector.insertedBlockIndex);
    if (!insertedBlockRect) {
      return;
    }

    const nextFallbackAnchorRect = buildQuickAddAnchorRect(insertedBlockRect);
    const nextPlacement = resolveCommandSelectorPlacement(overlayOwnerDocument, nextFallbackAnchorRect, BLOCK_SELECTOR_HEIGHT);
    if (areDomRectsEqual(commandSelector.fallbackAnchorRect, nextFallbackAnchorRect) && commandSelector.placement === nextPlacement) {
      return;
    }

    setCommandSelector((current) =>
      current && current.source === "quickAdd"
        ? {
            ...current,
            fallbackAnchorRect: nextFallbackAnchorRect,
            placement: nextPlacement
          }
        : current
    );
  }, [commandSelector, overlayMeasurementVersion, overlayOwnerDocument]);

  useEffect(() => {
    const scrollElement = selectorScrollRef.current;
    if (!commandSelector || !scrollElement) {
      setSelectorScrollMetrics({ hasOverflow: false, scrollbarWidth: 0 });
      return;
    }

    setSelectorScrollMetrics({
      hasOverflow: scrollElement.scrollHeight > scrollElement.clientHeight + 1,
      scrollbarWidth: Math.max(0, scrollElement.offsetWidth - scrollElement.clientWidth)
    });
  }, [commandGroups, commandSelector, overlayMeasurementVersion]);

  useEffect(() => {
    onEditorReadyRef.current = onEditorReady;
  }, [onEditorReady]);

  useEffect(() => {
    onOutlineChangeRef.current = onOutlineChange;
  }, [onOutlineChange]);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    savedDocumentKeyRef.current = savedDocumentKey;
  }, [savedDocumentKey]);

  useEffect(() => {
    savedRevisionRef.current = savedRevision;
  }, [savedRevision]);

  useEffect(() => {
    onStatusChange({
      flush: flushLatest,
      getRecoverySnapshot: () => {
        const runtimeEditor = editorRef.current;
        if (!runtimeEditor) {
          return null;
        }

        return {
          envelope: createEnvelope(runtimeEditor.getJSON() as DocseraTiptapDocument),
          isDirty: currentDocumentKeyRef.current !== savedDocumentKeyRef.current,
          pageSysId,
          savedRevision: savedRevisionRef.current,
          sessionKey
        };
      },
      isDirty: currentDocumentKeyRef.current !== savedDocumentKeyRef.current,
      isSaving: status === "saving",
      status: statusLabel(status)
    });
  }, [onStatusChange, pageSysId, savedDocumentKey, sessionKey, status]);

  useEffect(() => () => {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
    }
    clearBlockHandleGesture();
  }, []);

  useEffect(() => {
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      if (currentDocumentKeyRef.current !== savedDocumentKeyRef.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, []);

  const editor = useEditor({
    editable: isEditable,
    editorProps,
    extensions: editorExtensions,
    content: validatedInitialEnvelope.document as unknown as Record<string, unknown>,
    immediatelyRender: false,
    onCreate: ({ editor: runtimeEditor }) => {
      editorRef.current = runtimeEditor;
      const envelope = createEnvelope(runtimeEditor.getJSON() as DocseraTiptapDocument);
      const mountedDocumentKey = serializeDocument(envelope.document);
      currentDocumentKeyRef.current = mountedDocumentKey;
      if (initialSessionIsClean && mountedDocumentKey !== savedDocumentKeyRef.current) {
        savedDocumentKeyRef.current = mountedDocumentKey;
        setSavedDocumentKey(mountedDocumentKey);
      }
      onEditorReadyRef.current?.(runtimeEditor);
      onOutlineChangeRef.current(extractDocumentOutline(envelope));
      queueMicrotask(() => {
        if (!disposedRef.current) {
          initializingRef.current = false;
        }
      });
    },
    onUpdate: ({ editor: runtimeEditor }) => {
      const envelope = createEnvelope(runtimeEditor.getJSON() as DocseraTiptapDocument);
      const nextDocumentKey = serializeDocument(envelope.document);
      currentDocumentKeyRef.current = nextDocumentKey;
      onOutlineChangeRef.current(extractDocumentOutline(envelope));

       if (initializingRef.current) {
        if (initialSessionIsClean && nextDocumentKey !== savedDocumentKeyRef.current) {
          savedDocumentKeyRef.current = nextDocumentKey;
          setSavedDocumentKey(nextDocumentKey);
        }
        if (statusRef.current !== "saving" && statusRef.current !== "conflict") {
          setStatus(nextDocumentKey === savedDocumentKeyRef.current ? "saved" : "dirty");
        }
        if (errorMessage) {
          setErrorMessage("");
        }
        return;
      }

      if (statusRef.current !== "saving" && statusRef.current !== "conflict") {
        setStatus(nextDocumentKey === savedDocumentKeyRef.current ? "saved" : "dirty");
      }

      if (errorMessage) {
        setErrorMessage("");
      }

      if (nextDocumentKey !== savedDocumentKeyRef.current && statusRef.current !== "conflict") {
        retryAttemptRef.current = 0;
        if (retryTimerRef.current !== null) {
          window.clearTimeout(retryTimerRef.current);
          retryTimerRef.current = null;
        }
        scheduleAutosave();
      }
    }
  }, [editorExtensions, editorProps, initialSessionIsClean, isEditable]);

  useEffect(() => {
    if (!editor || !isEditable) {
      return;
    }

    if (typeof (editor as Editor & { on?: unknown; off?: unknown }).on !== "function" || typeof (editor as Editor & { on?: unknown; off?: unknown }).off !== "function") {
      return;
    }

    const handleTransaction = ({ transaction }: { transaction: Transaction }) => {
      if (transaction.selectionSet && transaction.getMeta(BLOCK_SELECTION_PLUGIN_KEY) === undefined) {
        clearTransientBlockSelection();
      }
    };

    editor.on("transaction", handleTransaction);
    return () => {
      editor.off("transaction", handleTransaction);
    };
  }, [clearTransientBlockSelection, editor, isEditable]);

  useEffect(() => {
    if (!editor || !isEditable) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const surfaceElement = surfaceRef.current;
      if (!surfaceElement) {
        return;
      }

      if (isPointerEventInsideElement(event, surfaceElement) || isPointerEventInsideElement(event, overlayRoot)) {
        return;
      }

      clearTransientBlockSelection();
    };

    overlayOwnerDocument.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      overlayOwnerDocument.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [clearTransientBlockSelection, editor, isEditable, overlayOwnerDocument, overlayRoot]);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      initializingRef.current = false;
      cancelPendingTimers();
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!editor) {
      return;
    }

    editor.setEditable(isEditable);
    if (trySetEditorTabIndex(editor, isEditable)) {
      return;
    }

    queueMicrotask(() => {
      if (disposedRef.current || (editor as Editor & { isDestroyed?: boolean }).isDestroyed) {
        return;
      }
      void trySetEditorTabIndex(editor, isEditable);
    });
  }, [editor, isEditable]);

  const overlayThemeClass = useMemo(
    () => (theme === "dark" ? "docsera-editor-runtime--dark" : "docsera-editor-runtime--light"),
    [theme]
  );
  useEffect(() => {
    if (!commandSelector) {
      return;
    }

    setCommandSelector((current) =>
      current
        ? (() => {
            const nextIndex = Math.max(0, Math.min(current.activeIndex, Math.max(0, commandMatches.length - 1)));
            return nextIndex === current.activeIndex ? current : { ...current, activeIndex: nextIndex };
          })()
        : current
    );
  }, [commandMatches.length, commandSelector]);

  useEffect(() => {
    syncCommandQueryPresentation(commandSelector);
  }, [commandSelector, syncCommandQueryPresentation]);

  useEffect(() => {
    if (!editor || (!hoverTarget && !commandSelector)) {
      return;
    }

    const handleViewportChange = () => {
      scheduleOverlayMeasurement();
    };

    overlayOwnerDocument.addEventListener("scroll", handleViewportChange, true);
    overlayOwnerWindow?.addEventListener("resize", handleViewportChange, { passive: true });
    return () => {
      overlayOwnerDocument.removeEventListener("scroll", handleViewportChange, true);
      overlayOwnerWindow?.removeEventListener("resize", handleViewportChange);
    };
  }, [commandSelector, editor, hoverTarget, overlayOwnerDocument, overlayOwnerWindow, scheduleOverlayMeasurement]);

  useEffect(() => {
    if (!editor || !isEditable) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const surfaceElement = surfaceRef.current;
      if (!surfaceElement) {
        lastPointerSnapshotRef.current = null;
        setOwnedHoverTarget(null);
        return;
      }

      const insideEditorLane = isPointerEventInsideEditorLane(event, surfaceElement);
      lastPointerSnapshotRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        insideEditorLane
      };

      const nextTarget = resolvePointerOwnedHoverTarget(editor, surfaceElement, event, event.clientX, event.clientY);
      const didChange = !areHoverTargetsEqual(hoverTargetRef.current, nextTarget);
      setOwnedHoverTarget(nextTarget);
      if (didChange) {
        scheduleOverlayMeasurement();
      }
    };

    overlayOwnerDocument.addEventListener("pointermove", handlePointerMove, true);
    return () => {
      overlayOwnerDocument.removeEventListener("pointermove", handlePointerMove, true);
    };
  }, [editor, isEditable, overlayOwnerDocument, scheduleOverlayMeasurement]);

  useEffect(() => {
    if (!commandSelector) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (isPointerEventInsideElement(event, overlayRoot)) {
        return;
      }

      if (isPointerEventInsideElement(event, surfaceRef.current)) {
        closeCommandSelector();
        return;
      }

      closeCommandSelector();
    };

    overlayOwnerDocument.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      overlayOwnerDocument.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [closeCommandSelector, commandSelector, overlayOwnerDocument, overlayRoot]);

  useEffect(() => () => {
    if (overlayMeasurementFrameRef.current !== null) {
      const cancelAnimationFrameFn =
        overlayOwnerWindow?.cancelAnimationFrame?.bind(overlayOwnerWindow) ?? window.cancelAnimationFrame.bind(window);
      cancelAnimationFrameFn(overlayMeasurementFrameRef.current);
      overlayMeasurementFrameRef.current = null;
    }
  }, [overlayOwnerWindow]);

  function scheduleAutosave() {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
    }
    autosaveTimerRef.current = window.setTimeout(() => {
      autosaveTimerRef.current = null;
      void flushLatest();
    }, AUTOSAVE_IDLE_MS);
  }

  function scheduleRetry() {
    if (retryTimerRef.current !== null || statusRef.current === "conflict" || disposedRef.current) return;
    const delay = getAutosaveRetryDelay(retryAttemptRef.current);
    if (delay === null) return;
    retryAttemptRef.current += 1;
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      void flushLatest();
    }, delay);
  }

  function cancelPendingTimers() {
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }

  async function flushLatest(): Promise<boolean> {
    if (!editor || !editableRef.current || disposedRef.current || statusRef.current === "conflict") {
      return currentDocumentKeyRef.current === savedDocumentKeyRef.current;
    }
    if (autosaveTimerRef.current !== null) {
      window.clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    if (retryTimerRef.current !== null) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    while (currentDocumentKeyRef.current !== savedDocumentKeyRef.current) {
      const savePromise = savePromiseRef.current ?? persistLatest();
      savePromiseRef.current = savePromise;
      try {
        if (!(await savePromise)) {
          return false;
        }
      } finally {
        if (savePromiseRef.current === savePromise) {
          savePromiseRef.current = null;
        }
      }
    }
    setStatus("saved");
    setErrorMessage("");
    return true;
  }

  async function persistLatest(): Promise<boolean> {
    if (!editor || !editableRef.current || saveInFlightRef.current) {
      return currentDocumentKeyRef.current === savedDocumentKeyRef.current;
    }

    let envelope: DocseraDocumentEnvelope;
    try {
      envelope = createEnvelope(editor.getJSON() as DocseraTiptapDocument);
    } catch {
      setStatus("failed");
      setErrorMessage("The page document is invalid.");
      return false;
    }

    let submittedDocumentKey = serializeDocument(envelope.document);
    const pendingDocumentKey = submittedDocumentKey;
    if (pendingDocumentKey === savedDocumentKeyRef.current) {
      setStatus("saved");
      setErrorMessage("");
      return true;
    }

    setStatus("saving");
    setErrorMessage("");
    const saveGeneration = saveGenerationRef.current + 1;
    saveGenerationRef.current = saveGeneration;
    saveInFlightRef.current = true;
    try {
      const saveInput: {
        draftContentJson: DocseraDocumentEnvelope;
        expectedRevision: number;
        pageSysId: string;
        readLatestDraftContentJson?: () => DocseraDocumentEnvelope | null;
      } = {
        draftContentJson: cloneEnvelope(envelope),
        expectedRevision: savedRevisionRef.current,
        pageSysId
      };
      Object.defineProperty(saveInput, "readLatestDraftContentJson", {
        configurable: true,
        enumerable: false,
        value: () => {
          if (!editor || disposedRef.current) return null;
          try {
            const latestEnvelope = createEnvelope(editor.getJSON() as DocseraTiptapDocument);
            submittedDocumentKey = serializeDocument(latestEnvelope.document);
            return cloneEnvelope(latestEnvelope);
          } catch {
            return null;
          }
        }
      });
      const result = await onSaveDraft(saveInput);

      if (disposedRef.current || saveGenerationRef.current !== saveGeneration) {
        return false;
      }

      if (result.state === "failed") {
        const isConflict = result.code === "conflict";
        setStatus(isConflict ? "conflict" : "failed");
        setErrorMessage(result.errorMessage || (isConflict ? "This page has a newer saved draft. Reload before saving again." : SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE));

        if (result.code === "forbidden") {
          onAccessLost();
        } else if (!isConflict && result.retryable) {
          scheduleRetry();
        }

        return false;
      }

      const nextSavedKey = submittedDocumentKey;
      savedDocumentKeyRef.current = nextSavedKey;
      setSavedDocumentKey(nextSavedKey);
      const acceptedRevision = result.page.draftRevision ?? savedRevisionRef.current + 1;
      savedRevisionRef.current = acceptedRevision;
      setSavedRevision(acceptedRevision);
      setErrorMessage("");
      retryAttemptRef.current = 0;
      const isClean = currentDocumentKeyRef.current === nextSavedKey;
      setStatus(isClean ? "saved" : "dirty");
      return true;
    } catch {
      if (disposedRef.current || saveGenerationRef.current !== saveGeneration) {
        return false;
      }

      setStatus("failed");
      setErrorMessage(SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE);
      scheduleRetry();
      return false;
    } finally {
      if (saveGenerationRef.current === saveGeneration) {
        saveInFlightRef.current = false;
      }
    }
  }

  const handleBlockHandlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>, blockIndex: number) => {
      event.preventDefault();
      event.stopPropagation();

      const runtimeEditor = editorRef.current;
      if (!runtimeEditor || !editableRef.current || runtimeEditor.isDestroyed) {
        return;
      }

      clearBlockHandleGesture();

      const gesture: BlockHandleGestureState = {
        blockIndex,
        dragIntent: false,
        originX: event.clientX,
        originY: event.clientY,
        pointerId: event.pointerId,
        startedAt: Date.now()
      };
      blockHandleGestureRef.current = gesture;

      const ownerDocument = event.currentTarget.ownerDocument;
      const ownerWindow = ownerDocument.defaultView;

      const handlePointerMove = (pointerEvent: PointerEvent) => {
        const currentGesture = blockHandleGestureRef.current;
        if (!currentGesture || currentGesture.pointerId !== pointerEvent.pointerId) {
          return;
        }

        const distance = Math.hypot(pointerEvent.clientX - currentGesture.originX, pointerEvent.clientY - currentGesture.originY);
        if (distance >= BLOCK_HANDLE_GESTURE_THRESHOLD_PX) {
          currentGesture.dragIntent = true;
        }
      };

      const cleanup = () => {
        ownerDocument.removeEventListener("pointermove", handlePointerMove, true);
        ownerDocument.removeEventListener("pointerup", handlePointerUp, true);
        ownerDocument.removeEventListener("pointercancel", handlePointerCancel, true);
        ownerDocument.removeEventListener("lostpointercapture", handleLostPointerCapture, true);
        ownerDocument.removeEventListener("pagehide", handlePageHide, true);
        ownerDocument.removeEventListener("visibilitychange", handleVisibilityChange, true);
        ownerWindow?.removeEventListener("blur", handleWindowBlur);
      };

      const finishGesture = (shouldSelect: boolean) => {
        if (shouldSelect) {
          selectBlockFromHandle(gesture.blockIndex);
        }

        clearBlockHandleGesture();
      };

      const handlePointerUp = (pointerEvent: PointerEvent) => {
        const currentGesture = blockHandleGestureRef.current;
        if (!currentGesture || currentGesture.pointerId !== pointerEvent.pointerId) {
          return;
        }

        finishGesture(!currentGesture.dragIntent);
      };

      const handlePointerCancel = (pointerEvent: PointerEvent) => {
        const currentGesture = blockHandleGestureRef.current;
        if (!currentGesture || currentGesture.pointerId !== pointerEvent.pointerId) {
          return;
        }

        finishGesture(false);
      };

      const handleLostPointerCapture = (pointerEvent: PointerEvent) => {
        const currentGesture = blockHandleGestureRef.current;
        if (!currentGesture || currentGesture.pointerId !== pointerEvent.pointerId) {
          return;
        }

        finishGesture(false);
      };

      const handleWindowBlur = () => {
        finishGesture(false);
      };

      const handlePageHide = () => {
        finishGesture(false);
      };

      const handleVisibilityChange = () => {
        if (ownerDocument.visibilityState === "hidden") {
          finishGesture(false);
        }
      };

      ownerDocument.addEventListener("pointermove", handlePointerMove, true);
      ownerDocument.addEventListener("pointerup", handlePointerUp, true);
      ownerDocument.addEventListener("pointercancel", handlePointerCancel, true);
      ownerDocument.addEventListener("lostpointercapture", handleLostPointerCapture, true);
      ownerDocument.addEventListener("pagehide", handlePageHide, true);
      ownerDocument.addEventListener("visibilitychange", handleVisibilityChange, true);
      ownerWindow?.addEventListener("blur", handleWindowBlur);
      blockHandleGestureCleanupRef.current = cleanup;
    },
    [clearBlockHandleGesture, selectBlockFromHandle]
  );

  const hoverTargetRect = editor && hoverTarget ? getTopLevelBlockRect(editor, hoverTarget.blockIndex) : null;
  const gutterButtonStyle = hoverTargetRect ? buildGutterButtonStyle(hoverTargetRect) : undefined;
  const handleButtonStyle = hoverTargetRect ? buildBlockHandleButtonStyle(hoverTargetRect) : undefined;
  const quickAddAnchorRect =
    commandSelector && commandSelector.source === "quickAdd" && editor
      ? getTopLevelBlockRect(editor, commandSelector.insertedBlockIndex)
        ? buildQuickAddAnchorRect(getTopLevelBlockRect(editor, commandSelector.insertedBlockIndex)!)
        : commandSelector.fallbackAnchorRect
      : null;
  const selectorStyle =
    commandSelector && editor
      ? commandSelector.source === "slash"
        ? buildSurfaceStyle(
            overlayOwnerDocument,
            getCaretBounds(editor) ?? commandSelector.anchorRect,
            BLOCK_SELECTOR_WIDTH,
            BLOCK_SELECTOR_HEIGHT,
            commandSelector.placement
          )
        : buildRightAnchoredSurfaceStyle(
            overlayOwnerDocument,
            quickAddAnchorRect ?? commandSelector.fallbackAnchorRect,
            BLOCK_SELECTOR_WIDTH,
            BLOCK_SELECTOR_HEIGHT,
            commandSelector.placement
          )
      : undefined;
  const selectorSurfaceStyle =
    selectorStyle && commandSelector
      ? {
          ...selectorStyle,
          "--docsera-block-selector-scrollbar-gap": selectorScrollMetrics.hasOverflow ? `${selectorScrollMetrics.scrollbarWidth}px` : "0px"
        }
      : undefined;

  return (
    <section className={`docsera-editor-runtime ${overlayThemeClass}`} aria-label="Draft editor">
      <style>{`
        .docsera-editor-runtime {
          display: block;
          color: var(--docsera-editor-text);
          font-family: Inter, "Segoe UI", sans-serif;
        }
        .docsera-editor-runtime--light {
          --docsera-editor-muted: #5f6b7c;
          --docsera-editor-panel: rgba(255, 255, 255, 0.98);
          --docsera-editor-panel-border: rgba(140, 156, 178, 0.22);
          --docsera-editor-text: #16212f;
          --docsera-editor-primary: #015ec2;
          --docsera-editor-block-selection: color-mix(in srgb, var(--docsera-editor-primary) 7%, transparent);
        }
        .docsera-editor-runtime--dark {
          --docsera-editor-muted: #a7b3c5;
          --docsera-editor-panel: rgba(15, 18, 24, 0.98);
          --docsera-editor-panel-border: rgba(122, 139, 167, 0.22);
          --docsera-editor-text: #eef2f8;
          --docsera-editor-primary: #58a6ff;
          --docsera-editor-block-selection: color-mix(in srgb, var(--docsera-editor-primary) 12%, transparent);
        }
        .docsera-editor-runtime__surface {
          position: relative;
          width: 100%;
        }
        .docsera-editor-runtime__lock-banner {
          display: grid;
          gap: 0.45rem;
          margin: 0 0 1rem;
          padding: 0.95rem 1rem;
          border: 1px solid color-mix(in srgb, var(--docsera-editor-primary) 18%, var(--docsera-editor-panel-border));
          border-radius: 1rem;
          background: color-mix(in srgb, var(--docsera-editor-panel) 94%, transparent);
        }
        .docsera-editor-runtime__lock-banner[data-state="lost"],
        .docsera-editor-runtime__lock-banner[data-state="failed"] {
          border-color: rgba(186, 26, 26, 0.22);
        }
        .docsera-editor-runtime__lock-title {
          margin: 0;
          font-size: 0.82rem;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--docsera-editor-muted);
        }
        .docsera-editor-runtime__lock-copy {
          margin: 0;
          color: var(--docsera-editor-text);
          font-size: 0.94rem;
          line-height: 1.55;
        }
        .docsera-editor-runtime__lock-actions {
          display: flex;
          gap: 0.75rem;
          flex-wrap: wrap;
        }
        .docsera-editor-runtime__lock-action,
        .docsera-editor-runtime__lock-secondary {
          min-height: 2.4rem;
          padding: 0.65rem 0.95rem;
          border-radius: 0.9rem;
          border: 1px solid var(--docsera-editor-panel-border);
          background: var(--docsera-editor-panel);
          color: var(--docsera-editor-text);
          font: inherit;
          font-weight: 700;
        }
        .docsera-editor-runtime__lock-action {
          border-color: rgba(1, 94, 194, 0.26);
          background: linear-gradient(135deg, var(--docsera-editor-primary), #004fa8);
          color: #fff;
        }
        .docsera-editor-runtime__lock-progress {
          position: absolute;
          top: 0.75rem;
          right: 0.75rem;
          z-index: 2;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding: 0.55rem 0.8rem;
          border: 1px solid color-mix(in srgb, var(--docsera-editor-primary) 18%, var(--docsera-editor-panel-border));
          border-radius: 999px;
          background: color-mix(in srgb, var(--docsera-editor-panel) 96%, transparent);
          box-shadow: 0 8px 24px rgba(15, 23, 42, 0.1);
          pointer-events: none;
        }
        .docsera-editor-runtime__lock-progress-dot {
          width: 0.55rem;
          height: 0.55rem;
          border-radius: 999px;
          background: var(--docsera-editor-primary);
          animation: docsera-editor-lock-pulse 1s ease-in-out infinite;
        }
        .docsera-editor-runtime__lock-progress-copy {
          margin: 0;
          color: var(--docsera-editor-text);
          font-size: 0.82rem;
          font-weight: 700;
          line-height: 1.2;
        }
        .docsera-editor-runtime__surface .ProseMirror {
          color: var(--docsera-editor-text);
          caret-color: var(--docsera-editor-primary);
          font-size: 1rem;
          line-height: 1.7;
          outline: none;
          scroll-padding-top: var(--docsera-workspace-heading-scroll-margin);
        }
        .docsera-editor-runtime__surface .ProseMirror ::selection {
          background: color-mix(in srgb, var(--docsera-editor-primary) 22%, transparent);
        }
        .docsera-editor-runtime__surface .ProseMirror > :first-child {
          margin-top: 0;
        }
        .docsera-editor-runtime__surface .ProseMirror > :last-child {
          margin-bottom: 0;
        }
        .docsera-editor-runtime__surface .ProseMirror p {
          margin: 0 0 1rem;
        }
        .docsera-editor-runtime__surface .ProseMirror > p[data-docsera-empty-paragraph="true"] {
          position: relative;
        }
        .docsera-editor-runtime__surface .ProseMirror > p[data-placeholder]:not([data-docsera-command-query-owner])::before,
        .docsera-editor-runtime__surface .ProseMirror > h1[data-placeholder]::before,
        .docsera-editor-runtime__surface .ProseMirror > h2[data-placeholder]::before,
        .docsera-editor-runtime__surface .ProseMirror > h3[data-placeholder]::before {
          content: attr(data-placeholder);
          float: left;
          height: 0;
          color: var(--docsera-editor-muted);
          pointer-events: none;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-command-query-inline {
          display: inline;
          color: var(--docsera-editor-muted);
          pointer-events: none;
          user-select: none;
          white-space: pre-wrap;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-command-query-inline--helper {
          margin-left: 0.1ch;
        }
        .docsera-editor-runtime__surface .ProseMirror h1,
        .docsera-editor-runtime__surface .ProseMirror h2,
        .docsera-editor-runtime__surface .ProseMirror h3 {
          margin: 1.4rem 0 0.7rem;
          line-height: 1.2;
          scroll-margin-block-start: var(--docsera-workspace-heading-scroll-margin);
          scroll-margin-top: var(--docsera-workspace-heading-scroll-margin);
        }
        .docsera-editor-runtime__surface .ProseMirror h1 {
          font-size: 1.9rem;
          letter-spacing: -0.025em;
        }
        .docsera-editor-runtime__surface .ProseMirror h2 {
          font-size: 1.65rem;
          letter-spacing: -0.02em;
        }
        .docsera-editor-runtime__surface .ProseMirror h3 {
          font-size: 1.25rem;
        }
        .docsera-editor-runtime__surface .ProseMirror ul,
        .docsera-editor-runtime__surface .ProseMirror ol {
          margin: 0 0 1rem;
          padding-left: 1.5rem;
        }
        .docsera-editor-runtime__surface .ProseMirror li + li {
          margin-top: 0.35rem;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-runtime__block--selected {
          background: var(--docsera-editor-block-selection);
          box-shadow: none;
          border-radius: 0;
        }
        .docsera-editor-runtime__surface .ProseMirror blockquote {
          margin: 0 0 1rem;
          padding-left: 1rem;
          border-left: 3px solid color-mix(in srgb, var(--docsera-editor-primary) 24%, transparent);
          color: var(--docsera-editor-muted);
        }
        .docsera-editor-runtime__surface .ProseMirror blockquote > p[data-placeholder]::before {
          content: attr(data-placeholder);
          float: left;
          height: 0;
          color: var(--docsera-editor-muted);
          font-style: italic;
          pointer-events: none;
        }
        .docsera-editor-runtime__surface .ProseMirror pre {
          margin: 0 0 1rem;
          padding: 0.9rem 1rem;
          border-radius: 14px;
          background: color-mix(in srgb, var(--docsera-editor-panel) 86%, black 14%);
          color: var(--docsera-editor-text);
          overflow-x: auto;
        }
        .docsera-editor-runtime__surface .ProseMirror code {
          font-family: "JetBrains Mono", "Fira Code", Consolas, monospace;
          font-size: 0.92em;
        }
        .docsera-editor-runtime__surface .ProseMirror p code {
          padding: 0.12rem 0.35rem;
          border-radius: 0.4rem;
          background: color-mix(in srgb, var(--docsera-editor-panel) 88%, black 12%);
        }
        .docsera-editor-runtime__surface .ProseMirror hr {
          margin: 1.5rem 0;
          border: 0;
          border-top: 1px solid color-mix(in srgb, var(--docsera-editor-panel-border) 88%, transparent);
        }
        .docsera-editor-runtime__surface .ProseMirror a {
          color: var(--docsera-primary);
          text-decoration-line: underline;
          text-decoration-color: currentColor;
          text-decoration-thickness: 0.08em;
          text-underline-offset: 0.16em;
        }
        .docsera-editor-runtime__surface .ProseMirror a:visited {
          color: var(--docsera-primary);
          text-decoration-color: currentColor;
        }
        .docsera-editor-runtime__surface .ProseMirror a:hover,
        .docsera-editor-runtime__surface .ProseMirror a:focus-visible {
          text-decoration-thickness: 0.12em;
        }
        .docsera-editor-runtime__surface .ProseMirror mark {
          padding: 0.08em 0.2em;
          border-radius: 0.28em;
          background: color-mix(in srgb, #f6d84e 58%, var(--docsera-editor-panel));
          color: inherit;
        }
        .docsera-editor-runtime__surface .ProseMirror sup,
        .docsera-editor-runtime__surface .ProseMirror sub {
          font-size: 0.72em;
          line-height: 0;
        }
        .docsera-editor-floating-layer {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 30;
        }
        ${BLOCK_SELECTOR_STYLES}

        .docsera-editor-floating {
          pointer-events: auto;
        }
        .docsera-editor-floating--bubble {
          width: min(100vw - 24px, 456px);
        }
        .docsera-editor-floating__label {
          margin: 0;
          color: var(--docsera-editor-muted);
          font-size: 0.72rem;
          font-weight: 700;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .docsera-editor-floating__quick-add {
          pointer-events: auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: ${QUICK_ADD_BUTTON_SIZE}px;
          height: ${QUICK_ADD_BUTTON_SIZE}px;
          padding: 0;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: var(--docsera-text-soft);
          cursor: pointer;
          box-shadow: none;
          transition: background-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
        }
        .docsera-editor-floating__quick-add:hover,
        .docsera-editor-floating__quick-add:focus-visible {
          background: var(--docsera-surface-muted);
          color: var(--docsera-primary);
          outline: none;
        }
        .docsera-editor-floating__quick-add:focus-visible {
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--docsera-primary) 22%, transparent);
        }
        .docsera-editor-floating__quick-add svg {
          width: ${QUICK_ADD_ICON_SIZE}px;
          height: ${QUICK_ADD_ICON_SIZE}px;
          flex: 0 0 auto;
        }
        .docsera-editor-floating__handle {
          pointer-events: auto;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: ${QUICK_ADD_BUTTON_SIZE}px;
          height: ${QUICK_ADD_BUTTON_SIZE}px;
          padding: 0;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: var(--docsera-text-soft);
          cursor: grab;
          box-shadow: none;
          transition: background-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
        }
        .docsera-editor-floating__handle:hover,
        .docsera-editor-floating__handle:focus-visible {
          background: var(--docsera-surface-muted);
          color: var(--docsera-primary);
          outline: none;
        }
        .docsera-editor-floating__handle:focus-visible {
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--docsera-primary) 22%, transparent);
        }
        .docsera-editor-floating__handle:active {
          cursor: grabbing;
        }
        .docsera-editor-floating__handle svg {
          width: ${QUICK_ADD_ICON_SIZE}px;
          height: ${QUICK_ADD_ICON_SIZE}px;
          flex: 0 0 auto;
        }
        @keyframes docsera-editor-lock-pulse {
          0%, 100% {
            opacity: 0.35;
            transform: scale(0.85);
          }
          50% {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
      <div
        ref={surfaceRef}
        className="docsera-editor-runtime__surface"
        onClick={(event) => {
          if (!editor || !isEditable || !(event.target instanceof HTMLElement)) return;
          const proseMirror = event.currentTarget.querySelector(".ProseMirror");
          if (!(proseMirror instanceof HTMLElement) || (event.target !== event.currentTarget && event.target !== proseMirror)) return;
          if (event.target === proseMirror && !isBelowEditorContentCanvasClick(event, proseMirror)) return;
          clearTransientBlockSelection();
          const lastChild = editor.state.doc.lastChild;
          if (lastChild?.type.name === "paragraph" && lastChild.content.size === 0) {
            editor.commands.focus("end", { scrollIntoView: false });
            return;
          }
          editor.chain().insertContentAt(editor.state.doc.content.size, { type: "paragraph" }).focus("end", { scrollIntoView: false }).run();
        }}
      >
        <EditorContent editor={editor} />
        {createPortal(
          <div className="docsera-editor-floating-layer" aria-hidden={!editor}>
            {hoverTarget && gutterButtonStyle && !commandSelector ? (
              <button
                type="button"
                className="docsera-editor-floating__quick-add"
                style={gutterButtonStyle}
                aria-haspopup="listbox"
                aria-controls={selectorListboxId}
                aria-expanded={false}
                aria-label={`Add block after ${hoverTarget.accessibleLabel}`}
                data-docsera-block-gutter="true"
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  openQuickAddSelector(hoverTarget);
                }}
              >
                <Plus size={QUICK_ADD_ICON_SIZE} strokeWidth={2.2} aria-hidden="true" focusable="false" />
              </button>
            ) : null}

            {hoverTarget && handleButtonStyle && !commandSelector ? (
              <button
                type="button"
                className="docsera-editor-floating__handle"
                style={handleButtonStyle}
                tabIndex={-1}
                draggable={false}
                aria-label={`Select block: ${hoverTarget.accessibleLabel}`}
                data-docsera-block-gutter="true"
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onPointerDown={(event) => {
                  handleBlockHandlePointerDown(event, hoverTarget.blockIndex);
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                <GripVertical size={QUICK_ADD_ICON_SIZE} strokeWidth={2.2} aria-hidden="true" focusable="false" />
              </button>
            ) : null}

            {commandSelector && selectorStyle ? (
              <div
                className="docsera-editor-floating docsera-block-selector"
                style={selectorSurfaceStyle}
                role="listbox"
                id={selectorListboxId}
                aria-label={commandSelector.source === "quickAdd" ? `Insert block after ${commandSelector.ownerLabel}` : "Slash command menu"}
                aria-activedescendant={commandMatches[commandSelector.activeIndex]?.id ? `slash-command-${commandMatches[commandSelector.activeIndex].id}` : undefined}
                data-surface="slash"
              >
                <div ref={selectorScrollRef} className="docsera-block-selector__scroll">
                  <div id={selectorQueryStateId} aria-live="polite" aria-atomic="true" hidden>
                    {commandSelector.query ? `Search query ${commandSelector.query}` : "Type to search"}
                  </div>
                  {commandGroups.length ? (
                    commandGroups.map((group) => (
                      <section key={group.category} className="docsera-block-selector__group" aria-label={group.category}>
                        <p className="docsera-block-selector__heading">{group.category}</p>
                        <div className="docsera-block-selector__options">
                          {group.commands.map((command) => {
                            const index = commandMatches.findIndex((candidate) => candidate.id === command.id);
                            return (
                              <button
                                key={command.id}
                                id={`slash-command-${command.id}`}
                                type="button"
                                className={`docsera-block-selector__item${index === commandSelector.activeIndex ? " docsera-block-selector__item--active" : ""}`}
                                role="option"
                                aria-label={command.label}
                                aria-selected={index === commandSelector.activeIndex}
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                }}
                                onMouseEnter={() => {
                                  setCommandSelector((current) =>
                                    current
                                      ? {
                                          ...current,
                                          activeIndex: index
                                        }
                                      : current
                                  );
                                }}
                                onClick={() => {
                                  executeCommand(command);
                                }}
                              >
                                <span className="docsera-block-selector__icon" aria-hidden="true">
                                  <BlockCommandIcon id={command.id} />
                                </span>
                                <span className="docsera-block-selector__copy">
                                  <span className="docsera-block-selector__title">{command.label}</span>
                                  <span className="docsera-block-selector__description">{command.description}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </section>
                    ))
                  ) : (
                    <p className="docsera-block-selector__empty">No matching commands</p>
                  )}
                </div>
              </div>
            ) : null}

            <CompactTextToolbar
              canEdit={isEditable}
              editor={editor}
              ownerDocument={overlayOwnerDocument}
              ownerWindow={overlayOwnerWindow}
              overlayRoot={overlayRoot}
            />
          </div>,
          overlayRoot
        )}
      </div>

    </section>
  );
}
