import { Extension, type Editor, type JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import * as React from "react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Fragment } from "@tiptap/pm/model";
import type { DocseraDocumentEnvelope, DocseraTiptapDocument } from "../../shared/editor/document";
import { DOCSERA_DOCUMENT_SCHEMA_VERSION, parseDocseraDocumentOrThrow } from "../../shared/editor/document";
import { createDocseraEditorExtensions } from "../../shared/editor/schema";
import { extractDocumentOutline, type EditorOutlineItem } from "./documentOutline";
import {
  EDITOR_BLOCK_COMMANDS,
  getEditorBlockCommandMatches,
  getGroupedEditorBlockCommandMatches,
  type EditorBlockCommandContext,
  type EditorBlockCommand,
  type EditorBlockCommandId
} from "./editorBlockCommands";
import { resolveHoverTargetBlockIndex } from "./editorBlockHover";
import { sanitizeDocseraPastedHTML, sanitizeDocseraPastedText } from "./pasteSanitizer";
import type { PageBodySaveResult } from "../shared/types/docsera";
import { NodeSelection, Plugin, PluginKey, Selection, TextSelection, type Transaction } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { CompactTextToolbar } from "./CompactTextToolbar";
import { subscribeToPageOwnershipHandoff } from "../pageOwnershipHandoff";
import {
  buildTopLevelBlockDragFeedbackStyle,
  buildTopLevelBlockDropIndicatorStyle,
  isValidBlockDragDestinationIndex
} from "./blockDragReorder";
import {
  createEditorAutoScrollSession,
  resolveEditorAutoScrollTopClearancePx,
  resolveEditorDocumentAutoScrollViewport
} from "./editorAutoScroll";
import { useTopLevelBlockDragSession } from "./useTopLevelBlockDragSession";
import {
  Check,
  Code2,
  Copy,
  ChevronRight,
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
  Table2,
  Trash2,
} from "lucide-react";
import { BLOCK_SELECTOR_STYLES } from "./BlockSelectorStyles";
import TableControlsOverlay from "./TableControlsOverlay";

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
  gutterRect: DOMRect;
  gutterWidth: number;
  mainPaneRect: DOMRect;
  mainPaneStyleTarget: HTMLElement | null;
  hostContainerRect: DOMRect | null;
  hostSurfaceRect: DOMRect | null;
  laneRect: DOMRect;
  pageTitleRect: DOMRect | null;
  pageTitleTextRects: DOMRect[];
  proseMirrorRect: DOMRect;
  surfaceRect: DOMRect;
};

type PanelPointerZone =
  | "panel-background"
  | "title-text"
  | "content-block"
  | "caret-strip"
  | "block-control"
  | "overlay"
  | "outside-panel";

type TopLevelBlockEntry = {
  accessibleLabel: string;
  blockIndex: number;
  node: Editor["state"]["doc"]["content"]["content"][number];
  rect: DOMRect;
};

type PanelPointerClassification = {
  anchorBlockIndex: number | null;
  caretBlockIndex: number | null;
  mainPaneRect: DOMRect;
  pageTitleRect: DOMRect | null;
  pageTitleTextRects: DOMRect[];
  zone: PanelPointerZone;
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
      surfaceContext: EditorBlockCommandContext;
      query: string;
      source: "quickAdd";
    }
  | {
      activeIndex: number;
      anchorRect: DOMRect;
      ownerBlockIndex: number;
      placement: CommandSelectorPlacement;
      surfaceContext: EditorBlockCommandContext;
      query: string;
      source: "slash";
      ownerPos: number;
    };

type BlockActionMenuState = {
  activeIndex: number;
  anchorRect: DOMRect;
  blockIndex: number;
  placement: CommandSelectorPlacement;
  source: "handle" | "keyboard";
};

type BlockTurnIntoMenuState = {
  activeIndex: number;
  anchorRect: DOMRect;
  blockIndex: number;
  placement: CommandSelectorPlacement;
  source: "handle" | "keyboard";
};

type BlockSelectionState = {
  ownerPos: number;
  rangeEndPos?: number;
};

type SlashTriggerSelection = {
  blockIndex: number;
  from: number;
  ownerPos: number;
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
const BLOCK_DRAG_LINE_HEIGHT = 2;
const BLOCK_HANDLE_GESTURE_THRESHOLD_PX = 4;
const BLOCK_ACTION_MENU_WIDTH = 182;
const BLOCK_ACTION_MENU_HEIGHT = 144;
const BLOCK_TURN_INTO_MENU_WIDTH = 198;
const BLOCK_TURN_INTO_MENU_HEIGHT = 280;
const TIPTAP_SKIP_TRAILING_NODE_META = "skipTrailingNode";
const COMMAND_QUERY_PRESENTATION_PLUGIN_KEY = new PluginKey<CommandQueryPresentationState | null>("docseraCommandQueryPresentation");
const BLOCK_SELECTION_PLUGIN_KEY = new PluginKey<BlockSelectionState | null>("docseraBlockSelection");
const EDITOR_MAIN_PANE_SELECTOR = "main.docsera-main";
const EDITOR_SHELL_SURFACE_SELECTOR = ".docsera-main__surface--editor";
const EDITOR_HOST_CONTAINER_SELECTOR = ".docsera-main__editor-host";
const EDITOR_PAGE_TITLE_SELECTOR = "#docsera-page-title";
const TITLE_TEXT_HITBOX_PADDING_X = 4;
const TITLE_TEXT_HITBOX_PADDING_Y = 4;
const FLOATING_THEME_TOKEN_NAMES = [
  "--docsera-editor-muted",
  "--docsera-editor-panel",
  "--docsera-editor-panel-border",
  "--docsera-editor-primary",
  "--docsera-editor-block-selection",
  "--docsera-editor-text"
] as const;

export function getAutosaveRetryDelay(attempt: number): number | null {
  return Number.isInteger(attempt) && attempt >= 0 && attempt < AUTOSAVE_RETRY_DELAYS_MS.length
    ? AUTOSAVE_RETRY_DELAYS_MS[attempt]
    : null;
}

function clearEditorNativeSelection(editor: Editor): void {
  const selection = editor.view.dom.ownerDocument.getSelection();
  if (selection && selection.rangeCount > 0) {
    selection.removeAllRanges();
  }
}

function resolveStructuralCellCaretSelection(editor: Editor, selection: CellSelection): Selection | null {
  const cellNode = selection.$headCell.nodeAfter;
  const cellContentStart = Math.min(selection.$headCell.pos + 1, Math.max(1, editor.state.doc.content.size));
  if (!cellNode) {
    return Selection.findFrom(editor.state.doc.resolve(cellContentStart), 1, true)
      ?? Selection.near(editor.state.doc.resolve(cellContentStart), 1);
  }

  let resolvedSelection: Selection | null = null;
  cellNode.descendants((node, pos) => {
    if (!node.isTextblock) {
      return true;
    }

    const candidate = Math.min(cellContentStart + pos + 1, editor.state.doc.content.size);
    resolvedSelection = Selection.findFrom(editor.state.doc.resolve(candidate), 1, true);
    return resolvedSelection === null;
  });

  if (resolvedSelection) {
    return resolvedSelection;
  }

  return Selection.findFrom(editor.state.doc.resolve(cellContentStart), 1, true)
    ?? Selection.near(editor.state.doc.resolve(cellContentStart), 1);
}

function releaseStructuralCellSelectionOwnership(editor: Editor): boolean {
  const selection = editor.state.selection;
  if (!(selection instanceof CellSelection)) {
    return false;
  }

  const nextSelection = resolveStructuralCellCaretSelection(editor, selection);
  if (!nextSelection) {
    return false;
  }

  let transaction = editor.state.tr.setMeta("addToHistory", false);
  transaction = transaction.setSelection(nextSelection.map(transaction.doc, transaction.mapping));

  editor.view.dispatch(transaction);
  clearEditorNativeSelection(editor);
  if (editor.view.dom === editor.view.dom.ownerDocument.activeElement) {
    editor.view.dom.blur();
  }
  return true;
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

function resolveEditorBlockCommandContext(selection: TextSelection): EditorBlockCommandContext {
  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    const nodeName = selection.$from.node(depth).type.name;
    if (nodeName === "tableCell" || nodeName === "tableHeader") {
      return {
        isInsideTableCellOrHeader: true
      };
    }
  }

  return {
    isInsideTableCellOrHeader: false
  };
}

function getBlockSelectionState(editor: Editor): BlockSelectionState | null {
  return BLOCK_SELECTION_PLUGIN_KEY.getState(editor.state) ?? null;
}

function resolveBlockSelectionState(editor: Editor, blockIndex: number): BlockSelectionState | null {
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

function resolveBlockSelectionRangeState(
  editor: Editor,
  anchorBlockIndex: number,
  focusBlockIndex: number
): BlockSelectionState | null {
  const anchorSelection = resolveBlockSelectionState(editor, anchorBlockIndex);
  const focusSelection = resolveBlockSelectionState(editor, focusBlockIndex);
  if (!anchorSelection || !focusSelection) {
    return null;
  }

  if (anchorSelection.ownerPos === focusSelection.ownerPos) {
    return anchorSelection;
  }

  return {
    ownerPos: anchorSelection.ownerPos,
    rangeEndPos: focusSelection.ownerPos
  };
}

function resolveTopLevelBlockDragSourceRange(
  editor: Editor,
  blockIndex: number
): {
  endBlockIndex: number;
  startBlockIndex: number;
} {
  const activeSelection = getBlockSelectionState(editor);
  if (activeSelection) {
    const selectedBounds = resolveTopLevelBlockSelectionBoundsFromState(editor.state.doc, activeSelection);
    if (
      selectedBounds &&
      blockIndex >= selectedBounds.startBlockIndex &&
      blockIndex <= selectedBounds.endBlockIndex
    ) {
      return selectedBounds;
    }
  }

  return {
    endBlockIndex: blockIndex,
    startBlockIndex: blockIndex
  };
}

function isBlockSelectionRangeState(state: BlockSelectionState | null): state is BlockSelectionState & {
  rangeEndPos: number;
} {
  return Boolean(state && typeof state.rangeEndPos === "number");
}

function resolveTopLevelBlockIndexFromDocPosition(doc: Editor["state"]["doc"], position: number): number | null {
  let blockIndex: number | null = null;

  doc.forEach((_node, offset, index) => {
    if (offset === position) {
      blockIndex = index;
    }
  });

  return blockIndex;
}

function resolveTopLevelBlockSelectionBoundsFromState(
  doc: Editor["state"]["doc"],
  state: BlockSelectionState
): { endBlockIndex: number; startBlockIndex: number } | null {
  const ownerBlockIndex = resolveTopLevelBlockIndexFromDocPosition(doc, state.ownerPos);
  if (ownerBlockIndex === null) {
    return null;
  }

  const endBlockIndex = isBlockSelectionRangeState(state)
    ? resolveTopLevelBlockIndexFromDocPosition(doc, state.rangeEndPos)
    : ownerBlockIndex;
  if (endBlockIndex === null) {
    return null;
  }

  return ownerBlockIndex <= endBlockIndex
    ? { startBlockIndex: ownerBlockIndex, endBlockIndex }
    : { startBlockIndex: endBlockIndex, endBlockIndex: ownerBlockIndex };
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

  if (!isBlockSelectionRangeState(state)) {
    return {
      ownerPos: mappedBlock.from
    };
  }

  const mappedRangeEndPosResult = transaction.mapping.mapResult(state.rangeEndPos, 1);
  if (mappedRangeEndPosResult.deleted) {
    return null;
  }

  const mappedRangeEndPos = mappedRangeEndPosResult.pos;
  const mappedRangeEndBlock = getTopLevelBlockAtPosition(transaction.doc, mappedRangeEndPos);
  if (!mappedRangeEndBlock || !mappedRangeEndBlock.node.isBlock) {
    return null;
  }

  return {
    ownerPos: mappedBlock.from,
    rangeEndPos: mappedRangeEndBlock.from
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

              const selectedBounds = resolveTopLevelBlockSelectionBoundsFromState(state.doc, selection);
              if (!selectedBounds) {
                return DecorationSet.empty;
              }

              const decorations: Decoration[] = [];
              for (let blockIndex = selectedBounds.startBlockIndex; blockIndex <= selectedBounds.endBlockIndex; blockIndex += 1) {
                const selectedBlock = getTopLevelBlockRangeFromDoc(state.doc, blockIndex);
                if (!selectedBlock) {
                  return DecorationSet.empty;
                }

                decorations.push(
                  Decoration.node(selectedBlock.from, selectedBlock.to, {
                    class: "docsera-editor-runtime__block--selected",
                    "data-docsera-block-selected": "true"
                  })
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

function getTopLevelBlockRangeFromDoc(
  doc: Editor["state"]["doc"],
  blockIndex: number
): { from: number; to: number } | null {
  if (blockIndex < 0 || blockIndex >= doc.childCount) {
    return null;
  }

  let blockRange: { from: number; to: number } | null = null;
  doc.forEach((node, offset, index) => {
    if (index === blockIndex) {
      blockRange = {
        from: offset,
        to: offset + node.nodeSize
      };
    }
  });

  return blockRange;
}

function getTopLevelBlockNodeFromDoc(
  doc: Editor["state"]["doc"],
  blockIndex: number
): Editor["state"]["doc"]["content"]["content"][number] | null {
  if (blockIndex < 0 || blockIndex >= doc.childCount) {
    return null;
  }

  return doc.child(blockIndex);
}

function resolveBlockSelectionStateFromDoc(
  doc: Editor["state"]["doc"],
  blockIndex: number
): BlockSelectionState | null {
  const ownerPos = getTopLevelBlockPositionFromDoc(doc, blockIndex);
  if (ownerPos === null) {
    return null;
  }

  const ownerBlock = getTopLevelBlockNodeFromDoc(doc, blockIndex);
  if (!ownerBlock || !ownerBlock.isBlock) {
    return null;
  }

  return {
    ownerPos
  };
}

function getTopLevelBlockSelectionOffset(
  node: Editor["state"]["doc"]["content"]["content"][number]
): number | "continuation" {
  switch (node.type.name) {
    case "blockquote":
      return 2;
    case "table":
      return 4;
    case "bulletList":
    case "orderedList":
      return 3;
    case "horizontalRule":
      return "continuation";
    default:
      return 1;
  }
}

function getTopLevelBlockInlineContent(
  node: Editor["state"]["doc"]["content"]["content"][number]
): Fragment {
  if (node.type.name === "blockquote") {
    const paragraph = node.firstChild;
    if (paragraph?.type.name === "paragraph") {
      return paragraph.content;
    }
  }

  if (node.type.name === "bulletList" || node.type.name === "orderedList") {
    const listItem = node.firstChild;
    const paragraph = listItem?.firstChild;
    if (paragraph?.type.name === "paragraph") {
      return paragraph.content;
    }
  }

  return node.content;
}

function applyTopLevelBlockSelectionToTransaction(
  transaction: Transaction,
  blockIndex: number
): Transaction | null {
  const blockRange = getTopLevelBlockRangeFromDoc(transaction.doc, blockIndex);
  const targetNode = getTopLevelBlockNodeFromDoc(transaction.doc, blockIndex);
  if (!blockRange || !targetNode) {
    return null;
  }

  const selectionOffset = getTopLevelBlockSelectionOffset(targetNode);
  let nextTransaction = transaction;
  const nextSelection = resolveBlockSelectionStateFromDoc(transaction.doc, blockIndex);
  if (nextSelection) {
    nextTransaction = nextTransaction.setMeta(BLOCK_SELECTION_PLUGIN_KEY, nextSelection);
  }

  const selectionAnchor =
    selectionOffset === "continuation"
      ? Math.min(blockRange.from + targetNode.nodeSize + 1, Math.max(1, transaction.doc.content.size))
      : Math.min(blockRange.from + selectionOffset, Math.max(1, transaction.doc.content.size));

  try {
    nextTransaction = nextTransaction.setSelection(TextSelection.create(nextTransaction.doc, selectionAnchor));
  } catch {
    nextTransaction = nextTransaction.setSelection(Selection.near(nextTransaction.doc.resolve(selectionAnchor), 1));
  }

  return nextTransaction;
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

  const ownerPos =
    selector.source === "slash" ? selector.ownerPos : getTopLevelBlockPosition(editor, selector.ownerBlockIndex);
  if (ownerPos === null) {
    return null;
  }

  const ownerBlock = getCommandQueryPresentationOwnerAtPosition(editor.state.doc, ownerPos);
  if (!ownerBlock) {
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
  const mappedOwnerBlock = getCommandQueryPresentationOwnerAtPosition(transaction.doc, mappedOwnerPos);
  if (!mappedOwnerBlock) {
    return null;
  }

  return {
    ...state,
    ownerPos: mappedOwnerPos
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

              const ownerBlock = getCommandQueryPresentationOwnerAtPosition(state.doc, presentation.ownerPos);
              if (!ownerBlock) {
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

function getCommandQueryPresentationOwnerAtPosition(
  doc: Editor["state"]["doc"],
  position: number
): {
  from: number;
  node: (typeof doc)["content"]["content"][number];
  to: number;
} | null {
  const node = doc.nodeAt(position);
  if (!node || !node.isTextblock) {
    return null;
  }

  return {
    from: position,
    node,
    to: position + node.nodeSize
  };
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
    ownerPos: $from.before($from.depth),
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
  const gutterLeft = targetRect.left - BLOCK_GUTTER_WIDTH;
  return new DOMRect(
    Math.max(VIEWPORT_GUTTER, gutterLeft),
    Math.max(VIEWPORT_GUTTER, targetRect.top + BLOCK_TARGET_TOP_OFFSET),
    QUICK_ADD_BUTTON_SIZE,
    Math.max(1, targetRect.bottom - (targetRect.top + BLOCK_TARGET_TOP_OFFSET))
  );
}

function buildGutterButtonStyle(anchorRect: DOMRect): CSSProperties {
  return {
    position: "fixed",
    left: `${anchorRect.left}px`,
    top: `${anchorRect.top}px`,
    width: `${QUICK_ADD_BUTTON_SIZE}px`,
    height: `${QUICK_ADD_BUTTON_SIZE}px`
  };
}

function buildGutterHandleStyle(anchorRect: DOMRect): CSSProperties {
  return {
    position: "fixed",
    left: `${anchorRect.left + QUICK_ADD_BUTTON_SIZE + BLOCK_HANDLE_BUTTON_GAP}px`,
    top: `${anchorRect.top}px`,
    width: `${QUICK_ADD_BUTTON_SIZE}px`,
    height: `${QUICK_ADD_BUTTON_SIZE}px`
  };
}

function buildBlockActionMenuSurfaceStyle(
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
    Math.max(VIEWPORT_GUTTER, rect.left - QUICK_ADD_BUTTON_SIZE),
    Math.max(VIEWPORT_GUTTER, viewportWidth - clampedWidth - VIEWPORT_GUTTER)
  );
  const preferredTop = placement === "above" ? rect.top - clampedHeight - POPOVER_GAP : rect.bottom + POPOVER_GAP;
  const top = Math.min(Math.max(VIEWPORT_GUTTER, preferredTop), Math.max(VIEWPORT_GUTTER, viewportHeight - clampedHeight - VIEWPORT_GUTTER));

  return {
    position: "fixed",
    left,
    top,
    width: `${clampedWidth}px`,
    maxWidth: `${maxSurfaceWidth}px`
  };
}

function buildBlockTurnIntoMenuSurfaceStyle(
  ownerDocument: Document,
  rect: DOMRect,
  width: number,
  height: number,
  placement: CommandSelectorPlacement,
  parentRect?: DOMRect | null
): CSSProperties {
  const ownerWindow = ownerDocument.defaultView;
  const viewportWidth = ownerWindow?.innerWidth ?? ownerDocument.documentElement.clientWidth;
  const viewportHeight = ownerWindow?.innerHeight ?? ownerDocument.documentElement.clientHeight;
  const maxSurfaceWidth = Math.max(1, viewportWidth - VIEWPORT_GUTTER * 2);
  const clampedWidth = Math.max(1, Math.min(width, maxSurfaceWidth));
  const clampedHeight = resolveConstrainedSurfaceHeight(ownerDocument, rect, height, placement);
  const left = Math.min(
    Math.max(VIEWPORT_GUTTER, (parentRect?.right ?? rect.right) + BLOCK_SELECTOR_PLACEMENT_GAP),
    Math.max(VIEWPORT_GUTTER, viewportWidth - clampedWidth - VIEWPORT_GUTTER)
  );
  const preferredTop = parentRect ? parentRect.top : placement === "above" ? rect.top - clampedHeight - POPOVER_GAP : rect.bottom + POPOVER_GAP;
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

function buildBlockActionMenuAnchorRect(targetRect: DOMRect): DOMRect {
  const anchorRect = buildQuickAddAnchorRect(targetRect);
  return new DOMRect(
    anchorRect.left + QUICK_ADD_BUTTON_SIZE + BLOCK_HANDLE_BUTTON_GAP,
    anchorRect.top,
    QUICK_ADD_BUTTON_SIZE,
    Math.max(1, targetRect.bottom - (targetRect.top + BLOCK_TARGET_TOP_OFFSET))
  );
}

function getTurnIntoBlockCommandIdFromNode(
  node: Editor["state"]["doc"]["content"]["content"][number]
): TurnIntoEditorBlockCommandId | null {
  const sourceCommandId = getTopLevelBlockCommandId(node);
  return sourceCommandId && isTurnIntoEditorBlockCommandId(sourceCommandId) ? sourceCommandId : null;
}

function parsePixelValue(value: string | null | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function resolveLightDomEditorOwner(surfaceElement: HTMLElement): {
  hostElement: HTMLElement | null;
  hostContainerElement: HTMLElement | null;
  mainPaneElement: HTMLElement | null;
  pageTitleElement: HTMLElement | null;
  shellSurfaceElement: HTMLElement | null;
} {
  const rootNode = surfaceElement.getRootNode();
  const hostElement = rootNode instanceof ShadowRoot && rootNode.host instanceof HTMLElement ? rootNode.host : null;
  const mainPaneCandidate = hostElement?.closest(EDITOR_MAIN_PANE_SELECTOR) ?? surfaceElement.closest(EDITOR_MAIN_PANE_SELECTOR);
  const mainPaneElement =
    mainPaneCandidate instanceof HTMLElement
      ? mainPaneCandidate
      : null;
  const hostContainerCandidate = hostElement?.closest(EDITOR_HOST_CONTAINER_SELECTOR) ?? surfaceElement.closest(EDITOR_HOST_CONTAINER_SELECTOR);
  const hostContainerElement =
    hostContainerCandidate instanceof HTMLElement
      ? hostContainerCandidate
      : null;
  const shellSurfaceCandidate = hostElement?.closest(EDITOR_SHELL_SURFACE_SELECTOR) ?? surfaceElement.closest(EDITOR_SHELL_SURFACE_SELECTOR);
  const shellSurfaceElement =
    shellSurfaceCandidate instanceof HTMLElement
      ? shellSurfaceCandidate
      : null;
  const pageTitleElement =
    shellSurfaceElement?.querySelector(EDITOR_PAGE_TITLE_SELECTOR) instanceof HTMLElement
      ? (shellSurfaceElement.querySelector(EDITOR_PAGE_TITLE_SELECTOR) as HTMLElement)
      : null;

  return {
    hostElement,
    hostContainerElement,
    mainPaneElement,
    pageTitleElement,
    shellSurfaceElement
  };
}

function resolveConfiguredGutterWidth(surfaceElement: HTMLElement): number {
  const { hostElement, shellSurfaceElement } = resolveLightDomEditorOwner(surfaceElement);
  const ownerWindow = surfaceElement.ownerDocument.defaultView ?? window;
  const styleTargets = [shellSurfaceElement, hostElement, surfaceElement.ownerDocument.documentElement, surfaceElement];

  for (const target of styleTargets) {
    if (!(target instanceof HTMLElement)) {
      continue;
    }

    const width = parsePixelValue(ownerWindow.getComputedStyle(target).getPropertyValue("--docsera-editor-block-gutter-width"));
    if (width !== null && width > 0) {
      return width;
    }
  }

  return BLOCK_GUTTER_WIDTH;
}

function resolveEditorLaneGeometry(surfaceElement: HTMLElement, proseMirror: HTMLElement): EditorLaneGeometry {
  const ownerWindow = surfaceElement.ownerDocument.defaultView ?? window;
  const surfaceRect = surfaceElement.getBoundingClientRect();
  const proseMirrorRect = proseMirror.getBoundingClientRect();
  const gutterWidth = resolveConfiguredGutterWidth(surfaceElement);
  const { hostContainerElement, mainPaneElement, pageTitleElement, shellSurfaceElement } = resolveLightDomEditorOwner(surfaceElement);
  const hostContainerRect = hostContainerElement?.getBoundingClientRect() ?? null;
  const mainPaneRect = mainPaneElement?.getBoundingClientRect() ?? null;
  const hostSurfaceRect = shellSurfaceElement?.getBoundingClientRect() ?? null;
  const pageTitleRect = pageTitleElement?.getBoundingClientRect() ?? null;
  const pageTitleTextRects = resolvePageTitleTextRects(pageTitleElement);
  const mainPaneStyleTarget = mainPaneElement ?? shellSurfaceElement;
  const shellSurfaceStyle = mainPaneStyleTarget ? ownerWindow.getComputedStyle(mainPaneStyleTarget) : null;
  const hostContainerStyle = hostContainerElement ? ownerWindow.getComputedStyle(hostContainerElement) : null;
  const shellPaddingLeft = parsePixelValue(shellSurfaceStyle?.paddingLeft ?? null);
  const shellPaddingRight = parsePixelValue(shellSurfaceStyle?.paddingRight ?? null);
  const hostMarginTop = parsePixelValue(hostContainerStyle?.marginTop ?? null) ?? 0;
  const hostMarginBottom = parsePixelValue(hostContainerStyle?.marginBottom ?? null) ?? 0;

  const gutterLeftFallback = proseMirrorRect.left - gutterWidth;
  const gutterLeftFromShell =
    hostSurfaceRect && shellPaddingLeft !== null ? hostSurfaceRect.left + Math.max(0, shellPaddingLeft - gutterWidth) : null;
  const laneLeft = gutterLeftFromShell ?? gutterLeftFallback;
  const laneRight =
    hostSurfaceRect && shellPaddingRight !== null ? hostSurfaceRect.right - shellPaddingRight : proseMirrorRect.right;
  const laneTop = hostContainerRect ? Math.min(surfaceRect.top, hostContainerRect.top - hostMarginTop) : surfaceRect.top;
  const laneBottom = hostContainerRect ? Math.max(surfaceRect.bottom, hostContainerRect.bottom + hostMarginBottom) : surfaceRect.bottom;
  const laneHeight = Math.max(1, laneBottom - laneTop);
  const gutterRect = new DOMRect(laneLeft, laneTop, Math.max(1, proseMirrorRect.left - laneLeft), laneHeight);

  return {
    gutterRect,
    gutterWidth,
    mainPaneRect: mainPaneRect ?? hostSurfaceRect ?? new DOMRect(laneLeft, laneTop, Math.max(1, laneRight - laneLeft), laneHeight),
    mainPaneStyleTarget,
    hostContainerRect,
    hostSurfaceRect,
    surfaceRect,
    laneRect: new DOMRect(laneLeft, laneTop, Math.max(1, laneRight - laneLeft), laneHeight),
    pageTitleRect,
    pageTitleTextRects,
    proseMirrorRect
  };
}

function resolveNearestVerticalBlockTarget(editor: Editor, clientY: number): HoverTarget | null {
  const elements = getTopLevelBlockElements(editor);
  if (!elements.length) {
    return null;
  }

  const blockRects = elements.map((element) => element.getBoundingClientRect());
  let targetIndex = blockRects.length - 1;
  for (let index = 0; index < blockRects.length; index += 1) {
    const currentRect = blockRects[index]!;
    const nextRect = blockRects[index + 1] ?? null;
    const boundary = nextRect ? currentRect.bottom + (nextRect.top - currentRect.bottom) / 2 : Number.POSITIVE_INFINITY;
    if (clientY < boundary) {
      targetIndex = index;
      break;
    }
  }

  return {
    accessibleLabel: getTopLevelBlockLabel(elements[targetIndex]!),
    blockIndex: targetIndex
  };
}

function getTopLevelBlockLabel(element: HTMLElement): string {
  if (element.classList.contains("tableWrapper")) {
    return "Table";
  }

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

  return Array.from(proseMirror.children).filter(
    (child): child is HTMLElement =>
      child instanceof HTMLElement &&
      !child.classList.contains("ProseMirror-dropcursor") &&
      !child.classList.contains("docsera-dropcursor")
  );
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

function getTopLevelBlockEntries(editor: Editor): TopLevelBlockEntry[] {
  const elements = getTopLevelBlockElements(editor);
  const entries: TopLevelBlockEntry[] = [];

  editor.state.doc.forEach((node, _offset, index) => {
    const element = elements[index];
    if (!(element instanceof HTMLElement) || !node.isBlock) {
      return;
    }

    entries.push({
      accessibleLabel: getTopLevelBlockLabel(element),
      blockIndex: index,
      node,
      rect: element.getBoundingClientRect()
    });
  });

  return entries;
}

function isPointInsideRect(rect: DOMRect | null | undefined, clientX: number, clientY: number): boolean {
  return Boolean(
    rect &&
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
  );
}

function inflateRect(rect: DOMRect, horizontalPadding: number, verticalPadding: number): DOMRect {
  return new DOMRect(
    rect.left - horizontalPadding,
    rect.top - verticalPadding,
    rect.width + horizontalPadding * 2,
    rect.height + verticalPadding * 2
  );
}

function getTextNodeClientRects(textNode: Text): DOMRect[] {
  const ownerDocument = textNode.ownerDocument;
  if (!ownerDocument) {
    return [];
  }

  const range = ownerDocument.createRange();
  range.selectNodeContents(textNode);
  return Array.from(range.getClientRects()).filter((rect) => rect.width > 0 && rect.height > 0);
}

function resolvePageTitleTextRects(pageTitleElement: HTMLElement | null): DOMRect[] {
  if (!pageTitleElement) {
    return [];
  }

  const ownerDocument = pageTitleElement.ownerDocument;
  const walker = ownerDocument.createTreeWalker(pageTitleElement, NodeFilter.SHOW_TEXT);
  const rects: DOMRect[] = [];
  let currentNode = walker.nextNode();
  while (currentNode) {
    if (
      currentNode instanceof Text &&
      currentNode.textContent?.trim()
    ) {
      for (const rect of getTextNodeClientRects(currentNode)) {
        rects.push(inflateRect(rect, TITLE_TEXT_HITBOX_PADDING_X, TITLE_TEXT_HITBOX_PADDING_Y));
      }
    }
    currentNode = walker.nextNode();
  }

  if (rects.length > 0) {
    return rects;
  }

  const leafRects = Array.from(pageTitleElement.querySelectorAll("*"))
    .filter((element): element is HTMLElement => element instanceof HTMLElement && !element.children.length && Boolean(element.textContent?.trim()))
    .flatMap((element) =>
      Array.from(element.getClientRects())
        .filter((rect) => rect.width > 0 && rect.height > 0)
        .map((rect) => inflateRect(rect, TITLE_TEXT_HITBOX_PADDING_X, TITLE_TEXT_HITBOX_PADDING_Y))
    );

  return leafRects;
}

function isPointInsideAnyRect(rects: readonly DOMRect[], clientX: number, clientY: number): boolean {
  return rects.some((rect) => isPointInsideRect(rect, clientX, clientY));
}

function getTopLevelCaretSelectionOffset(
  node: Editor["state"]["doc"]["content"]["content"][number]
): number | null {
  switch (node.type.name) {
    case "blockquote":
      return 2;
    case "bulletList":
    case "orderedList":
    case "taskList":
      return 3;
    case "paragraph":
    case "heading":
    case "codeBlock":
      return 1;
    default:
      return null;
  }
}

function buildCaretStripRect(entry: TopLevelBlockEntry): DOMRect | null {
  const caretOffset = getTopLevelCaretSelectionOffset(entry.node);
  if (caretOffset === null) {
    return null;
  }

  const stripLeft = entry.rect.left - BLOCK_GUTTER_CONTENT_GAP;
  const stripRight = entry.rect.left;
  if (stripRight <= stripLeft) {
    return null;
  }

  return new DOMRect(stripLeft, entry.rect.top, stripRight - stripLeft, entry.rect.height);
}

function resolvePanelPointerClassification(
  editor: Editor,
  surfaceElement: HTMLElement,
  clientX: number,
  clientY: number
): PanelPointerClassification {
  const proseMirror = editor.view.dom;
  if (!(proseMirror instanceof HTMLElement)) {
    return {
      anchorBlockIndex: null,
      caretBlockIndex: null,
      mainPaneRect: new DOMRect(clientX, clientY, 1, 1),
      pageTitleRect: null,
      pageTitleTextRects: [],
      zone: "outside-panel"
    };
  }

  const laneGeometry = resolveEditorLaneGeometry(surfaceElement, proseMirror);
  const entries = getTopLevelBlockEntries(editor);
  const nearestVerticalTarget = resolveNearestVerticalBlockTarget(editor, clientY);

  if (!isPointInsideRect(laneGeometry.mainPaneRect, clientX, clientY)) {
    return {
      anchorBlockIndex: nearestVerticalTarget?.blockIndex ?? null,
      caretBlockIndex: null,
      mainPaneRect: laneGeometry.mainPaneRect,
      pageTitleRect: laneGeometry.pageTitleRect,
      pageTitleTextRects: laneGeometry.pageTitleTextRects,
      zone: "outside-panel"
    };
  }

  if (isPointInsideAnyRect(laneGeometry.pageTitleTextRects, clientX, clientY)) {
    return {
      anchorBlockIndex: null,
      caretBlockIndex: null,
      mainPaneRect: laneGeometry.mainPaneRect,
      pageTitleRect: laneGeometry.pageTitleRect,
      pageTitleTextRects: laneGeometry.pageTitleTextRects,
      zone: "title-text"
    };
  }

  for (const entry of entries) {
    const caretStripRect = buildCaretStripRect(entry);
    if (isPointInsideRect(caretStripRect, clientX, clientY)) {
      return {
        anchorBlockIndex: entry.blockIndex,
        caretBlockIndex: entry.blockIndex,
        mainPaneRect: laneGeometry.mainPaneRect,
        pageTitleRect: laneGeometry.pageTitleRect,
        pageTitleTextRects: laneGeometry.pageTitleTextRects,
        zone: "caret-strip"
      };
    }

    if (isPointInsideRect(entry.rect, clientX, clientY)) {
      return {
        anchorBlockIndex: entry.blockIndex,
        caretBlockIndex: null,
        mainPaneRect: laneGeometry.mainPaneRect,
        pageTitleRect: laneGeometry.pageTitleRect,
        pageTitleTextRects: laneGeometry.pageTitleTextRects,
        zone: "content-block"
      };
    }
  }

  return {
    anchorBlockIndex: nearestVerticalTarget?.blockIndex ?? null,
    caretBlockIndex: null,
    mainPaneRect: laneGeometry.mainPaneRect,
    pageTitleRect: laneGeometry.pageTitleRect,
    pageTitleTextRects: laneGeometry.pageTitleTextRects,
    zone: "panel-background"
  };
}

function resolveHoverTargetFromPointer(editor: Editor, clientX: number, clientY: number): HoverTarget | null {
  const elements = getTopLevelBlockElements(editor);
  const proseMirror = editor.view.dom;
  if (!elements.length) {
    return null;
  }

  if (!(proseMirror instanceof HTMLElement)) {
    return null;
  }

  const targetIndex = resolveHoverTargetBlockIndex(elements.map((element) => element.getBoundingClientRect()), { clientX, clientY }, BLOCK_GUTTER_WIDTH);
  if (targetIndex === null) {
    return null;
  }

  return {
    accessibleLabel: getTopLevelBlockLabel(elements[targetIndex]),
    blockIndex: targetIndex
  };
}

function resolveBlankGutterSelectionAnchor(
  editor: Editor,
  surfaceElement: HTMLElement,
  clientX: number,
  clientY: number
): HoverTarget | null {
  const classification = resolvePanelPointerClassification(editor, surfaceElement, clientX, clientY);
  if (classification.zone !== "panel-background" || classification.anchorBlockIndex === null) {
    return null;
  }

  const node = getTopLevelBlockNodeFromDoc(editor.state.doc, classification.anchorBlockIndex);
  return node
    ? {
        accessibleLabel: getTopLevelBlockLabelFromNode(node),
        blockIndex: classification.anchorBlockIndex
      }
    : null;
}

function resolveActiveBlankGutterSelectionTarget(
  editor: Editor,
  clientY: number
): HoverTarget | null {
  return resolveNearestVerticalBlockTarget(editor, clientY);
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

function isBlockHandleTarget(target: EventTarget | null): boolean {
  const targetElement =
    target instanceof HTMLElement ? target : target instanceof Node ? target.parentElement : null;
  return targetElement?.closest(".docsera-editor-floating__handle") instanceof HTMLElement;
}

function isInteractiveEditorOverlayTarget(target: EventTarget | null): boolean {
  const targetElement =
    target instanceof HTMLElement ? target : target instanceof Node ? target.parentElement : null;
  return Boolean(
    targetElement?.closest(
      "[data-surface], [role='menu'], [role='listbox'], [role='toolbar'], button, input, select, textarea, [data-docsera-table-add-rail-kind]"
    ) instanceof HTMLElement
  );
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
    return resolveHoverTargetFromPointer(editor, clientX, clientY);
  }

  const target = resolvePointerEventTarget(event);
  if (!(target instanceof Node) || (!surfaceElement.contains(target) && !isGutterControlTarget(target))) {
    return null;
  }

  return resolveHoverTargetFromPointer(editor, clientX, clientY);
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
    case "table":
      return <Table2 size={16} strokeWidth={2} />;
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

function applySlashCommand(editor: Editor, selector: Extract<CommandSelectorState, { source: "slash" }>, command: EditorBlockCommand): boolean {
  editor.commands.focus(undefined, { scrollIntoView: false });
  applyBlockCommand(editor, command);
  const topLevelOwnerPos = getTopLevelBlockPositionFromDoc(editor.state.doc, selector.ownerBlockIndex);
  if (topLevelOwnerPos !== selector.ownerPos) {
    return true;
  }

  return applyCommandSelectionOffset(editor, selector.ownerBlockIndex, command.slashSelectionOffset);
}

const TURN_INTO_EDITOR_BLOCK_COMMAND_IDS = [
  "text",
  "heading1",
  "heading2",
  "heading3",
  "blockquote",
  "bulletedList",
  "numberedList"
 ] as const;

type TurnIntoEditorBlockCommandId = (typeof TURN_INTO_EDITOR_BLOCK_COMMAND_IDS)[number];

type TurnIntoEditorBlockCommand = Omit<EditorBlockCommand, "id"> & {
  id: TurnIntoEditorBlockCommandId;
};

function isTurnIntoEditorBlockCommandId(commandId: EditorBlockCommandId): commandId is TurnIntoEditorBlockCommandId {
  return TURN_INTO_EDITOR_BLOCK_COMMAND_IDS.includes(commandId as TurnIntoEditorBlockCommandId);
}

function isTurnIntoEditorBlockCommand(command: EditorBlockCommand): command is TurnIntoEditorBlockCommand {
  return isTurnIntoEditorBlockCommandId(command.id);
}

const TURN_INTO_EDITOR_BLOCK_COMMANDS = EDITOR_BLOCK_COMMANDS.filter(isTurnIntoEditorBlockCommand);

function getTopLevelBlockCommandId(
  node: Editor["state"]["doc"]["content"]["content"][number]
): EditorBlockCommandId | null {
  switch (node.type.name) {
    case "paragraph":
      return "text";
    case "heading":
      switch (node.attrs.level) {
        case 1:
          return "heading1";
        case 2:
          return "heading2";
        case 3:
          return "heading3";
        default:
          return null;
      }
    case "blockquote":
      return "blockquote";
    case "bulletList":
      return "bulletedList";
    case "orderedList":
      return "numberedList";
    case "codeBlock":
      return "codeBlock";
    case "horizontalRule":
      return "horizontalRule";
    default:
      return null;
  }
}

function getTopLevelBlockLabelFromNode(
  node: Editor["state"]["doc"]["content"]["content"][number]
): string {
  switch (node.type.name) {
    case "heading":
      switch (node.attrs.level) {
        case 1:
          return "Heading 1";
        case 2:
          return "Heading 2";
        case 3:
          return "Heading 3";
        default:
          return "Heading";
      }
    case "bulletList":
      return "Bulleted List";
    case "orderedList":
      return "Numbered List";
    case "blockquote":
      return "Blockquote";
    case "codeBlock":
      return "Code Block";
    case "horizontalRule":
      return "Horizontal Rule";
    case "table":
      return "Table";
    case "paragraph":
    default:
      return "Text";
  }
}

function getTurnIntoBlockCommandsForBlock(
  node: Editor["state"]["doc"]["content"]["content"][number]
): TurnIntoEditorBlockCommand[] {
  if (!getTurnIntoBlockCommandIdFromNode(node)) {
    return [];
  }

  return TURN_INTO_EDITOR_BLOCK_COMMANDS;
}

type BlockActionMenuEntry =
  | {
      kind: "duplicate";
    }
  | {
      kind: "delete";
    }
  | {
      commands: TurnIntoEditorBlockCommand[];
      kind: "turnInto";
    };

function getBlockActionMenuEntries(
  node: Editor["state"]["doc"]["content"]["content"][number]
): BlockActionMenuEntry[] {
  const turnIntoCommands = getTurnIntoBlockCommandsForBlock(node);
  const entries: BlockActionMenuEntry[] = [];
  if (turnIntoCommands.length) {
    entries.push({
      kind: "turnInto",
      commands: turnIntoCommands
    });
  }

  entries.push(
    {
      kind: "duplicate"
    },
    {
      kind: "delete"
    }
  );

  return entries;
}

function createConvertedTopLevelBlockNode(
  editor: Editor,
  sourceNode: Editor["state"]["doc"]["content"]["content"][number],
  targetCommandId: TurnIntoEditorBlockCommandId
): Editor["state"]["doc"]["content"]["content"][number] | null {
  const inlineContent = getTopLevelBlockInlineContent(sourceNode);

  switch (targetCommandId) {
    case "text":
      return editor.schema.nodes.paragraph.create(null, inlineContent);
    case "heading1":
      return editor.schema.nodes.heading.create({ level: 1 }, inlineContent);
    case "heading2":
      return editor.schema.nodes.heading.create({ level: 2 }, inlineContent);
    case "heading3":
      return editor.schema.nodes.heading.create({ level: 3 }, inlineContent);
    case "blockquote":
      return editor.schema.nodes.blockquote.create(null, editor.schema.nodes.paragraph.create(null, inlineContent));
    case "bulletedList":
      return editor.schema.nodes.bulletList.create(
        null,
        editor.schema.nodes.listItem.create(null, editor.schema.nodes.paragraph.create(null, inlineContent))
      );
    case "numberedList":
      return editor.schema.nodes.orderedList.create(
        null,
        editor.schema.nodes.listItem.create(null, editor.schema.nodes.paragraph.create(null, inlineContent))
      );
    default:
      return null;
  }
}

function applyTopLevelBlockConversion(
  editor: Editor,
  blockIndex: number,
  targetCommandId: TurnIntoEditorBlockCommandId
): boolean {
  const blockRange = getTopLevelBlockRange(editor, blockIndex);
  const sourceNode = blockIndex >= 0 && blockIndex < editor.state.doc.childCount ? editor.state.doc.child(blockIndex) : null;
  const convertedNode = sourceNode ? createConvertedTopLevelBlockNode(editor, sourceNode, targetCommandId) : null;
  if (!blockRange || !sourceNode || !convertedNode) {
    return false;
  }

  if (getTopLevelBlockCommandId(sourceNode) === targetCommandId) {
    return false;
  }

  const transaction = applyTopLevelBlockSelectionToTransaction(
    editor.state.tr.delete(blockRange.from, blockRange.to).insert(blockRange.from, convertedNode),
    blockIndex
  );
  if (!transaction) {
    return false;
  }

  editor.view.dispatch(transaction);
  return true;
}

function duplicateTopLevelBlock(editor: Editor, blockIndex: number): boolean {
  const blockRange = getTopLevelBlockRange(editor, blockIndex);
  const sourceNode = blockIndex >= 0 && blockIndex < editor.state.doc.childCount ? editor.state.doc.child(blockIndex) : null;
  if (!blockRange || !sourceNode) {
    return false;
  }

  const duplicateNode = editor.schema.nodeFromJSON(sourceNode.toJSON());
  const transaction = applyTopLevelBlockSelectionToTransaction(
    editor.state.tr.insert(blockRange.to, duplicateNode),
    blockIndex + 1
  );
  if (!transaction) {
    return false;
  }

  editor.view.dispatch(transaction);
  return true;
}

function deleteTopLevelBlock(editor: Editor, blockIndex: number): boolean {
  return deleteTopLevelBlockSelection(editor, blockIndex, blockIndex);
}

function deleteTopLevelBlockSelection(editor: Editor, startBlockIndex: number, endBlockIndex: number): boolean {
  const start = Math.min(startBlockIndex, endBlockIndex);
  const end = Math.max(startBlockIndex, endBlockIndex);
  const startRange = getTopLevelBlockRange(editor, start);
  const endRange = getTopLevelBlockRange(editor, end);
  if (!startRange || !endRange) {
    return false;
  }

  let transaction = editor.state.tr.delete(startRange.from, endRange.to);
  let nextBlockIndex = start;

  if (transaction.doc.childCount === 0) {
    transaction = transaction.insert(0, editor.schema.nodes.paragraph.create());
    nextBlockIndex = 0;
  } else if (nextBlockIndex >= transaction.doc.childCount) {
    nextBlockIndex = transaction.doc.childCount - 1;
  }

  const nextBlockRange = getTopLevelBlockRangeFromDoc(transaction.doc, nextBlockIndex);
  const nextBlock = getTopLevelBlockNodeFromDoc(transaction.doc, nextBlockIndex);
  if (!nextBlockRange || !nextBlock) {
    return false;
  }

  const selectionOffset = getTopLevelBlockSelectionOffset(nextBlock);
  const selectionAnchor =
    selectionOffset === "continuation"
      ? Math.min(nextBlockRange.from + nextBlock.nodeSize + 1, Math.max(1, transaction.doc.content.size))
      : Math.min(nextBlockRange.from + selectionOffset, Math.max(1, transaction.doc.content.size));
  let nextTransaction = transaction;
  try {
    nextTransaction = nextTransaction.setSelection(TextSelection.create(nextTransaction.doc, selectionAnchor));
  } catch {
    try {
      nextTransaction = nextTransaction.setSelection(Selection.near(nextTransaction.doc.resolve(selectionAnchor), 1));
    } catch {
      return false;
    }
  }

  editor.view.dispatch(nextTransaction);
  editor.view.focus();
  return true;
}

function replaceEmptyParagraphWithBlockquote(
  editor: Editor,
  blockIndex: number
): boolean {
  return replaceEmptyParagraphWithCommandOutput(
    editor,
    blockIndex,
    [
      {
        type: "blockquote",
        content: [{ type: "paragraph" }]
      }
    ],
    2
  );
}

function replaceEmptyParagraphWithCommandOutput(
  editor: Editor,
  blockIndex: number,
  content: JSONContent[],
  selectionOffset: number | "continuation" | undefined
): boolean {
  const blockRange = getTopLevelBlockRange(editor, blockIndex);
  const targetNode = blockIndex >= 0 && blockIndex < editor.state.doc.childCount ? editor.state.doc.child(blockIndex) : null;
  if (
    !blockRange ||
    !targetNode ||
    targetNode.type.name !== "paragraph" ||
    targetNode.content.size !== 0 ||
    selectionOffset === undefined
  ) {
    return false;
  }

  const nextNodes = content.map((node) => editor.schema.nodeFromJSON(node));

  let transaction = editor.state.tr.delete(blockRange.from, blockRange.to).insert(blockRange.from, Fragment.fromArray(nextNodes));
  if (selectionOffset !== "continuation") {
    transaction = transaction.setMeta(TIPTAP_SKIP_TRAILING_NODE_META, true);
  }

  if (selectionOffset === "continuation") {
    const continuationAnchor = Math.min(blockRange.from + nextNodes[0].nodeSize + 1, Math.max(1, transaction.doc.content.size));
    try {
      transaction = transaction.setSelection(TextSelection.create(transaction.doc, continuationAnchor));
    } catch {
      transaction = transaction.setSelection(Selection.near(transaction.doc.resolve(continuationAnchor), 1));
    }
  } else {
    const selectionAnchor = Math.min(blockRange.from + selectionOffset, Math.max(1, transaction.doc.content.size));
    try {
      transaction = transaction.setSelection(TextSelection.create(transaction.doc, selectionAnchor));
    } catch {
      transaction = transaction.setSelection(Selection.near(transaction.doc.resolve(selectionAnchor), 1));
    }
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

function focusTopLevelBlockSelection(editor: Editor, blockIndex: number): void {
  const blockRange = getTopLevelBlockRange(editor, blockIndex);
  if (!blockRange) {
    return;
  }

  if (editor.isDestroyed) {
    return;
  }

  let transaction = editor.state.tr.setMeta("addToHistory", false);
  try {
    transaction = transaction.setSelection(NodeSelection.create(transaction.doc, blockRange.from));
  } catch {
    try {
      transaction = transaction.setSelection(Selection.near(transaction.doc.resolve(blockRange.from), 1));
    } catch {
      return;
    }
  }

  if (!editor.state.selection.eq(transaction.selection)) {
    editor.view.dispatch(transaction);
  }

  editor.view.focus();
}

function focusTopLevelBlockStart(editor: Editor, blockIndex: number): void {
  const blockRange = getTopLevelBlockRange(editor, blockIndex);
  if (!blockRange) {
    return;
  }

  if (editor.isDestroyed) {
    return;
  }

  const selectionAnchor = Math.min(blockRange.from + 1, Math.max(1, editor.state.doc.content.size));
  let transaction = editor.state.tr.setMeta("addToHistory", false);
  try {
    transaction = transaction.setSelection(TextSelection.create(transaction.doc, selectionAnchor));
  } catch {
    try {
      transaction = transaction.setSelection(Selection.near(transaction.doc.resolve(selectionAnchor), 1));
    } catch {
      return;
    }
  }

  if (!editor.state.selection.eq(transaction.selection)) {
    editor.view.dispatch(transaction);
  }

  editor.view.focus();
}

function focusTopLevelCaretIntent(editor: Editor, blockIndex: number): boolean {
  const blockRange = getTopLevelBlockRange(editor, blockIndex);
  const node = getTopLevelBlockNodeFromDoc(editor.state.doc, blockIndex);
  const selectionOffset = node ? getTopLevelCaretSelectionOffset(node) : null;
  if (!blockRange || selectionOffset === null || editor.isDestroyed) {
    return false;
  }

  const selectionAnchor = Math.min(blockRange.from + selectionOffset, Math.max(1, editor.state.doc.content.size));
  let transaction = editor.state.tr.setMeta("addToHistory", false);
  try {
    transaction = transaction.setSelection(TextSelection.create(transaction.doc, selectionAnchor));
  } catch {
    try {
      transaction = transaction.setSelection(Selection.near(transaction.doc.resolve(selectionAnchor), 1));
    } catch {
      return false;
    }
  }

  if (!editor.state.selection.eq(transaction.selection)) {
    editor.view.dispatch(transaction);
  }
  editor.view.focus();
  return true;
}

function clampMarqueeRectToPanel(
  originX: number,
  originY: number,
  currentX: number,
  currentY: number,
  boundaryRect: DOMRect
): DOMRect {
  const left = Math.max(boundaryRect.left, Math.min(originX, currentX));
  const right = Math.min(boundaryRect.right, Math.max(originX, currentX));
  const top = Math.max(boundaryRect.top, Math.min(originY, currentY));
  const bottom = Math.min(boundaryRect.bottom, Math.max(originY, currentY));
  return new DOMRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
}

function setEditorPanelCursor(surfaceElement: HTMLElement | null, cursor: string): void {
  if (!surfaceElement) {
    return;
  }

  const { hostContainerElement, shellSurfaceElement } = resolveLightDomEditorOwner(surfaceElement);
  const cursorValue = cursor.trim();
  const targets = [surfaceElement, hostContainerElement, shellSurfaceElement];
  for (const target of targets) {
    if (!(target instanceof HTMLElement)) {
      continue;
    }

    if (cursorValue) {
      target.style.cursor = cursorValue;
    } else {
      target.style.removeProperty("cursor");
    }
  }
}

function replaceQuickAddParagraph(
  editor: Editor,
  blockIndex: number,
  command: EditorBlockCommand
): boolean {
  return replaceEmptyParagraphWithCommandOutput(editor, blockIndex, command.quickAdd.content, command.quickAdd.selectionOffset);
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
  const [blockActionMenu, setBlockActionMenu] = useState<BlockActionMenuState | null>(null);
  const [blockTurnIntoMenu, setBlockTurnIntoMenu] = useState<BlockTurnIntoMenuState | null>(null);
  const [selectorScrollMetrics, setSelectorScrollMetrics] = useState({ hasOverflow: false, scrollbarWidth: 0 });
  const [overlayMeasurementVersion, setOverlayMeasurementVersion] = useState(0);
  const selectorListboxId = useId();
  const selectorQueryStateId = useId();
  const blockActionMenuId = useId();
  const blockTurnIntoMenuId = useId();
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
  const commandSelectorItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const blockActionMenuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const blockTurnIntoMenuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const blockTurnIntoTriggerRef = useRef<HTMLButtonElement | null>(null);
  const blockActionMenuSurfaceRef = useRef<HTMLDivElement | null>(null);

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
          const selectorMatches = getEditorBlockCommandMatches(activeSelector.query, activeSelector.surfaceContext);

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
        const activeBlockSelectionBounds = activeBlockSelection
          ? resolveTopLevelBlockSelectionBoundsFromState(runtimeEditor.state.doc, activeBlockSelection)
          : null;
        if (activeBlockSelection && (event.key === "Delete" || event.key === "Backspace")) {
          event.preventDefault();
          if (!activeBlockSelectionBounds) {
            closeAllBlockSurfaces({ focusEditor: true });
            return true;
          }

          if (
            !deleteTopLevelBlockSelection(
              runtimeEditor,
              activeBlockSelectionBounds.startBlockIndex,
              activeBlockSelectionBounds.endBlockIndex
            )
          ) {
            closeAllBlockSurfaces({ focusEditor: true });
            return true;
          }

          closeAllBlockSurfaces({ focusEditor: false });
          return true;
        }

        const activeBlockActionMenu = blockActionMenuRef.current;
        const activeBlockTurnIntoMenu = blockTurnIntoMenuRef.current;
        if (activeBlockTurnIntoMenu) {
          const menuState = activeBlockTurnIntoMenu;
          const menuNode = getTopLevelBlockNodeFromDoc(runtimeEditor.state.doc, menuState.blockIndex);
          if (!menuNode) {
            event.preventDefault();
            closeAllBlockSurfaces({ focusEditor: true });
            return true;
          }

          const submenuCommands = getTurnIntoBlockCommandsForBlock(menuNode);
          if (!submenuCommands.length) {
            event.preventDefault();
            closeAllBlockSurfaces({ focusEditor: true });
            return true;
          }

          const nextIndex = Math.max(0, Math.min(menuState.activeIndex, submenuCommands.length - 1));

          if (event.key === "Escape" || event.key === "ArrowLeft") {
            event.preventDefault();
            closeBlockTurnIntoMenu({ focusParent: true });
            return true;
          }

          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setBlockTurnIntoMenu((current) =>
              current
                ? {
                    ...current,
                    activeIndex:
                      submenuCommands.length > 0
                        ? event.key === "ArrowDown"
                          ? (current.activeIndex + 1) % submenuCommands.length
                          : (current.activeIndex - 1 + submenuCommands.length) % submenuCommands.length
                        : 0
                  }
                : current
            );
            return true;
          }

          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            const activeCommand = submenuCommands[nextIndex];
            if (activeCommand && applyTopLevelBlockConversion(runtimeEditor, menuState.blockIndex, activeCommand.id)) {
              closeBlockActionMenus({ focusEditor: true });
            }
            return true;
          }

          return true;
        } else if (activeBlockActionMenu) {
          const menuState = activeBlockActionMenu;
          const menuNode = getTopLevelBlockNodeFromDoc(runtimeEditor.state.doc, menuState.blockIndex);
          if (!menuNode) {
            event.preventDefault();
            closeAllBlockSurfaces({ focusEditor: true });
            return true;
          }

          const menuEntries = getBlockActionMenuEntries(menuNode);
          const nextIndex = Math.max(0, Math.min(menuState.activeIndex, menuEntries.length - 1));

          if (event.key === "Escape") {
            event.preventDefault();
            closeAllBlockSurfaces({ focusEditor: true });
            return true;
          }

          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            setBlockActionMenu((current) =>
              current
                ? {
                    ...current,
                    activeIndex:
                      menuEntries.length > 0
                        ? event.key === "ArrowDown"
                          ? (current.activeIndex + 1) % menuEntries.length
                          : (current.activeIndex - 1 + menuEntries.length) % menuEntries.length
                        : 0
                  }
                : current
            );
            return true;
          }

          if (event.key === "ArrowRight") {
            const activeEntry = menuEntries[nextIndex];
            if (activeEntry?.kind === "turnInto") {
              event.preventDefault();
              openBlockTurnIntoMenu(menuState.blockIndex, menuState.source, menuState.anchorRect);
              return true;
            }
          }

          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            const activeEntry = menuEntries[nextIndex];
            if (!activeEntry) {
              return true;
            }

            if (activeEntry.kind === "turnInto") {
              openBlockTurnIntoMenu(menuState.blockIndex, menuState.source, menuState.anchorRect);
              return true;
            }

            if (activeEntry.kind === "duplicate") {
              if (duplicateTopLevelBlock(runtimeEditor, menuState.blockIndex)) {
                closeBlockActionMenus({ focusEditor: true });
              }
              return true;
            }

            if (activeEntry.kind === "delete") {
              if (deleteTopLevelBlock(runtimeEditor, menuState.blockIndex)) {
                closeBlockActionMenus({ focusEditor: true });
              }
              return true;
            }
          }

          return true;
        }

        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
          if (activeBlockSelection && isBlockSelectionRangeState(activeBlockSelection)) {
            event.preventDefault();
            return true;
          }

          const selectedBlockIndex = activeBlockSelection
            ? resolveTopLevelBlockIndexForPosition(runtimeEditor, activeBlockSelection.ownerPos)
            : null;
          const selectionBlockIndex =
            selectedBlockIndex ??
            (isTextSelection(runtimeEditor.state.selection)
              ? resolveTopLevelBlockIndexForPosition(runtimeEditor, runtimeEditor.state.selection.from)
              : null);
          if (selectionBlockIndex !== null) {
            event.preventDefault();
            openBlockActionMenuFromSelection("keyboard");
            return true;
          }
        }

        if (activeBlockSelection) {
          const isModifierOnlyKey = event.key === "Shift" || event.key === "Control" || event.key === "Alt" || event.key === "Meta";
          if (!isModifierOnlyKey) {
            if (event.key === "Escape") {
              event.preventDefault();
              clearTransientBlockSelection();
              return true;
            }

            if (
              event.key === "Enter" ||
              event.key === "ArrowUp" ||
              event.key === "ArrowDown" ||
              event.key === "ArrowLeft" ||
              event.key === "ArrowRight" ||
              (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey)
            ) {
              event.preventDefault();
              clearTransientBlockSelection();
              return true;
            }
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
  const [activeRangeMarqueeRect, setActiveRangeMarqueeRect] = useState<DOMRect | null>(null);
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
  const blockActionMenuRef = useRef<BlockActionMenuState | null>(null);
  const blockTurnIntoMenuRef = useRef<BlockTurnIntoMenuState | null>(null);
  const lastPointerSnapshotRef = useRef<{ clientX: number; clientY: number; insideEditorLane: boolean } | null>(null);
  const gutterRangeGestureRef = useRef<{
    activated: boolean;
    anchorBlockIndex: number;
    currentBlockIndex: number;
    lastClientX: number;
    lastClientY: number;
    pointerId: number;
    startClientX: number;
    startClientY: number;
  } | null>(null);
  const gutterRangeGestureCleanupRef = useRef<(() => void) | null>(null);
  const gutterRangeAutoScrollRef = useRef<ReturnType<typeof createEditorAutoScrollSession> | null>(null);
  const gutterRangeClickSuppressionReleaseTimerRef = useRef<number | null>(null);
  const suppressSurfaceClickUntilPointerUpRef = useRef(false);
  const panelCursorZoneRef = useRef<PanelPointerZone | null>(null);
  const overlayMeasurementFrameRef = useRef<number | null>(null);
  const onEditorReadyRef = useRef(onEditorReady);
  const onOutlineChangeRef = useRef(onOutlineChange);
  const activeRangeMarqueeRectRef = useRef<DOMRect | null>(null);
  const clearGutterRangeGestureUnmountRef = useRef<((options?: { clearSelection?: boolean; reason?: string; releaseClickSuppression?: boolean }) => void) | null>(null);
  const clearSurfaceClickSuppressionReleaseTimerUnmountRef = useRef<(() => void) | null>(null);
  const clearTransientBlockSelectionUnmountRef = useRef<((reason?: string) => void) | null>(null);
  const isEditable = canEdit;
  const overlayOwnerDocument = overlayRoot.ownerDocument;
  const overlayOwnerWindow = overlayOwnerDocument.defaultView;
  const commandGroups = useMemo(
    () =>
      commandSelector
        ? getGroupedEditorBlockCommandMatches(commandSelector.query, commandSelector.surfaceContext)
        : [],
    [commandSelector]
  );
  const commandMatches = useMemo(
    () => commandGroups.flatMap((group) => group.commands),
    [commandGroups]
  );
  const clearTransientBlockSelection = useCallback((reason?: string) => {
    const runtimeEditor = editorRef.current;
    if (!runtimeEditor || runtimeEditor.isDestroyed) {
      return;
    }

    const currentSelection = getBlockSelectionState(runtimeEditor);
    if (!currentSelection) {
      return;
    }

    runtimeEditor.view.dispatch(runtimeEditor.state.tr.setMeta(BLOCK_SELECTION_PLUGIN_KEY, null).setMeta("addToHistory", false));
  }, []);

  const clearSurfaceClickSuppressionReleaseTimer = useCallback(() => {
    if (gutterRangeClickSuppressionReleaseTimerRef.current === null) {
      return;
    }

    window.clearTimeout(gutterRangeClickSuppressionReleaseTimerRef.current);
    gutterRangeClickSuppressionReleaseTimerRef.current = null;
  }, []);

  const scheduleSurfaceClickSuppressionRelease = useCallback(() => {
    clearSurfaceClickSuppressionReleaseTimer();
    gutterRangeClickSuppressionReleaseTimerRef.current = window.requestAnimationFrame(() => {
      gutterRangeClickSuppressionReleaseTimerRef.current = null;
      suppressSurfaceClickUntilPointerUpRef.current = false;
    });
  }, [clearSurfaceClickSuppressionReleaseTimer]);

  const setTransientBlockSelectionRange = useCallback((anchorBlockIndex: number, focusBlockIndex: number) => {
    const runtimeEditor = editorRef.current;
    if (!runtimeEditor || runtimeEditor.isDestroyed) {
      return;
    }

    const nextSelection = resolveBlockSelectionRangeState(runtimeEditor, anchorBlockIndex, focusBlockIndex);
    if (!nextSelection) {
      return;
    }

    const currentSelection = getBlockSelectionState(runtimeEditor);
    if (
      currentSelection?.ownerPos === nextSelection.ownerPos &&
      currentSelection?.rangeEndPos === nextSelection.rangeEndPos
    ) {
      return;
    }

    runtimeEditor.view.dispatch(
      runtimeEditor.state.tr.setMeta(BLOCK_SELECTION_PLUGIN_KEY, nextSelection).setMeta("addToHistory", false)
    );
  }, []);

  const setTransientBlockSelection = useCallback((blockIndex: number) => {
    setTransientBlockSelectionRange(blockIndex, blockIndex);
  }, [setTransientBlockSelectionRange]);

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
      resolveHoverTargetFromPointer(runtimeEditor, pointerSnapshot.clientX, pointerSnapshot.clientY)
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

  const closeBlockActionMenus = useCallback(
    (options: { focusEditor?: boolean; syncHoverFromPointer?: boolean } = {}) => {
      const { focusEditor = false, syncHoverFromPointer = true } = options;
      setBlockTurnIntoMenu(null);
      setBlockActionMenu(null);
      if (syncHoverFromPointer) {
        syncHoverTargetFromLastPointer();
      } else {
        setOwnedHoverTarget(null);
      }
      if (focusEditor) {
        const runtimeEditor = editorRef.current;
        if (runtimeEditor && !runtimeEditor.isDestroyed) {
          runtimeEditor.view.focus();
        }
      }
    },
    [syncHoverTargetFromLastPointer]
  );

  const openBlockActionMenu = useCallback(
    (blockIndex: number, source: BlockActionMenuState["source"], anchorRect?: DOMRect) => {
      const runtimeEditor = editorRef.current;
      if (!runtimeEditor || runtimeEditor.isDestroyed) {
        return;
      }

      const targetRect = anchorRect ?? getTopLevelBlockRect(runtimeEditor, blockIndex);
      if (!targetRect) {
        return;
      }

      closeCommandSelector({ syncHoverFromPointer: false });
      setBlockTurnIntoMenu(null);
      setBlockActionMenu({
        activeIndex: 0,
        anchorRect: buildBlockActionMenuAnchorRect(targetRect),
        blockIndex,
        placement: resolveCommandSelectorPlacement(overlayOwnerDocument, buildBlockActionMenuAnchorRect(targetRect), BLOCK_ACTION_MENU_HEIGHT),
        source
      });
    },
    [closeCommandSelector, overlayOwnerDocument]
  );

  const getEditorAutoScrollViewport = useCallback(() => {
    const surfaceElement = surfaceRef.current;
    const runtimeEditor = editorRef.current;
    if (!surfaceElement || !runtimeEditor || !(runtimeEditor.view.dom instanceof HTMLElement)) {
      return null;
    }

    const { mainPaneElement } = resolveLightDomEditorOwner(surfaceElement);
    return resolveEditorDocumentAutoScrollViewport({
      mainPaneElement,
      ownerDocument: surfaceElement.ownerDocument
    });
  }, []);

  const getEditorAutoScrollTopClearancePx = useCallback(() => {
    const surfaceElement = surfaceRef.current;
    if (!surfaceElement) {
      return 0;
    }

    const { mainPaneStyleTarget } =
      surfaceElement.querySelector(".ProseMirror") instanceof HTMLElement
        ? resolveEditorLaneGeometry(surfaceElement, surfaceElement.querySelector(".ProseMirror") as HTMLElement)
        : { mainPaneStyleTarget: null };
    return resolveEditorAutoScrollTopClearancePx({
      ownerDocument: surfaceElement.ownerDocument,
      styleTarget: mainPaneStyleTarget
    });
  }, []);

  const {
    blockHandleGesture,
    blockDragState,
    clearBlockDragSession,
    handleBlockHandlePointerDown
  } = useTopLevelBlockDragSession({
    clearTransientBlockSelection,
    closeBlockActionMenus,
    closeCommandSelector,
    editableRef,
    editorRef,
    focusTopLevelBlockSelection,
    getAutoScrollTopClearancePx: getEditorAutoScrollTopClearancePx,
    getAutoScrollViewport: getEditorAutoScrollViewport,
    getTopLevelBlockRange,
    gestureThresholdPx: BLOCK_HANDLE_GESTURE_THRESHOLD_PX,
    gutterWidth: BLOCK_GUTTER_WIDTH,
    resolveDragSourceRange: resolveTopLevelBlockDragSourceRange,
    openBlockActionMenu,
    scheduleOverlayMeasurement,
    selectBlockFromHandle: setTransientBlockSelection,
    selectTopLevelBlockRange: setTransientBlockSelectionRange
  });

  const openBlockTurnIntoMenu = useCallback(
    (blockIndex: number, source: BlockTurnIntoMenuState["source"], anchorRect?: DOMRect) => {
      const runtimeEditor = editorRef.current;
      if (!runtimeEditor || runtimeEditor.isDestroyed) {
        return;
      }

      const targetRect = blockTurnIntoTriggerRef.current?.getBoundingClientRect() ?? anchorRect ?? getTopLevelBlockRect(runtimeEditor, blockIndex);
      const sourceNode = getTopLevelBlockNodeFromDoc(runtimeEditor.state.doc, blockIndex);
      const sourceCommandId = sourceNode ? getTurnIntoBlockCommandIdFromNode(sourceNode) : null;
      if (!targetRect) {
        return;
      }

      const nextAnchorRect = targetRect;
      setBlockTurnIntoMenu({
        activeIndex: Math.max(0, TURN_INTO_EDITOR_BLOCK_COMMANDS.findIndex((command) => command.id === sourceCommandId)),
        anchorRect: nextAnchorRect,
        blockIndex,
        placement: resolveCommandSelectorPlacement(overlayOwnerDocument, nextAnchorRect, BLOCK_TURN_INTO_MENU_HEIGHT),
        source
      });
    },
    [overlayOwnerDocument]
  );

  const closeBlockTurnIntoMenu = useCallback((options: { focusParent?: boolean } = {}) => {
    const { focusParent = false } = options;
    setBlockTurnIntoMenu(null);
    if (focusParent) {
      blockTurnIntoTriggerRef.current?.focus();
    }
  }, []);

  const executeBlockTurnIntoCommand = useCallback(
    (command: TurnIntoEditorBlockCommand) => {
      const runtimeEditor = editorRef.current;
      const activeMenu = blockTurnIntoMenuRef.current;
      if (!runtimeEditor || !activeMenu) {
        return;
      }

      if (applyTopLevelBlockConversion(runtimeEditor, activeMenu.blockIndex, command.id)) {
        closeBlockActionMenus({ focusEditor: false });
        focusTopLevelBlockSelection(runtimeEditor, activeMenu.blockIndex);
      }
    },
    [closeBlockActionMenus]
  );

  const executeBlockActionMenuEntry = useCallback(
    (entry: BlockActionMenuEntry) => {
      const runtimeEditor = editorRef.current;
      const activeMenu = blockActionMenuRef.current;
      if (!runtimeEditor || !activeMenu) {
        return;
      }

      if (entry.kind === "turnInto") {
        openBlockTurnIntoMenu(activeMenu.blockIndex, activeMenu.source, activeMenu.anchorRect);
        return;
      }

      const didExecute =
        entry.kind === "duplicate"
          ? duplicateTopLevelBlock(runtimeEditor, activeMenu.blockIndex)
          : deleteTopLevelBlock(runtimeEditor, activeMenu.blockIndex);
      if (didExecute) {
        closeBlockActionMenus({ focusEditor: false });
        if (entry.kind === "duplicate") {
          focusTopLevelBlockSelection(runtimeEditor, activeMenu.blockIndex + 1);
        }
      }
    },
    [closeBlockActionMenus, openBlockTurnIntoMenu]
  );

  const openBlockActionMenuFromSelection = useCallback(
    (source: BlockActionMenuState["source"]) => {
      const runtimeEditor = editorRef.current;
      if (!runtimeEditor || runtimeEditor.isDestroyed) {
        return;
      }

      const activeSelection = getBlockSelectionState(runtimeEditor);
      if (activeSelection && isBlockSelectionRangeState(activeSelection)) {
        return;
      }

      const blockIndex = activeSelection ? resolveTopLevelBlockIndexForPosition(runtimeEditor, activeSelection.ownerPos) : null;
      const resolvedBlockIndex =
        blockIndex ?? (isTextSelection(runtimeEditor.state.selection) ? resolveTopLevelBlockIndexForPosition(runtimeEditor, runtimeEditor.state.selection.from) : null);
      if (resolvedBlockIndex === null) {
        return;
      }

      setTransientBlockSelection(resolvedBlockIndex);
      openBlockActionMenu(resolvedBlockIndex, source);
    },
    [openBlockActionMenu, setTransientBlockSelection]
  );

  const closeAllBlockSurfaces = useCallback(
    (options: { focusEditor?: boolean; syncHoverFromPointer?: boolean } = {}) => {
      const { focusEditor = false, syncHoverFromPointer = true } = options;
      closeBlockActionMenus({ focusEditor, syncHoverFromPointer });
      clearTransientBlockSelection();
    },
    [clearTransientBlockSelection, closeBlockActionMenus]
  );

  const handleBlockActionMenuKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      const runtimeEditor = editorRef.current;
      const activeMenu = blockActionMenuRef.current;
      if (!runtimeEditor || !activeMenu) {
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (!deleteTopLevelBlock(runtimeEditor, activeMenu.blockIndex)) {
          closeAllBlockSurfaces({ focusEditor: true });
          return true;
        }

        closeAllBlockSurfaces({ focusEditor: false });
        return true;
      }

      const menuNode = getTopLevelBlockNodeFromDoc(runtimeEditor.state.doc, activeMenu.blockIndex);
      if (!menuNode) {
        event.preventDefault();
        closeAllBlockSurfaces({ focusEditor: true });
        return;
      }

      const menuEntries = getBlockActionMenuEntries(menuNode);
      const nextIndex = Math.max(0, Math.min(activeMenu.activeIndex, menuEntries.length - 1));

      if (event.key === "Escape") {
        event.preventDefault();
        closeAllBlockSurfaces({ focusEditor: true });
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setBlockActionMenu((current) =>
          current
            ? {
                ...current,
                activeIndex:
                  menuEntries.length > 0
                    ? event.key === "ArrowDown"
                      ? (current.activeIndex + 1) % menuEntries.length
                      : (current.activeIndex - 1 + menuEntries.length) % menuEntries.length
                    : 0
              }
            : current
        );
        return;
      }

      if (event.key === "ArrowRight") {
        const activeEntry = menuEntries[nextIndex];
        if (activeEntry?.kind === "turnInto") {
          event.preventDefault();
          openBlockTurnIntoMenu(activeMenu.blockIndex, activeMenu.source, activeMenu.anchorRect);
        }
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const activeEntry = menuEntries[nextIndex];
        if (activeEntry) {
          executeBlockActionMenuEntry(activeEntry);
        }
      }
    },
    [closeAllBlockSurfaces, executeBlockActionMenuEntry, openBlockTurnIntoMenu]
  );

  const handleBlockTurnIntoMenuKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      const runtimeEditor = editorRef.current;
      const activeMenu = blockTurnIntoMenuRef.current;
      if (!runtimeEditor || !activeMenu) {
        return;
      }

      if (event.key === "Delete" || event.key === "Backspace") {
        event.preventDefault();
        if (!deleteTopLevelBlock(runtimeEditor, activeMenu.blockIndex)) {
          closeAllBlockSurfaces({ focusEditor: true });
          return true;
        }

        closeAllBlockSurfaces({ focusEditor: false });
        return true;
      }

      const menuNode = getTopLevelBlockNodeFromDoc(runtimeEditor.state.doc, activeMenu.blockIndex);
      const turnIntoCommands = menuNode ? getTurnIntoBlockCommandsForBlock(menuNode) : [];
      if (!turnIntoCommands.length) {
        event.preventDefault();
        closeAllBlockSurfaces({ focusEditor: true });
        return;
      }

      const nextIndex = Math.max(0, Math.min(activeMenu.activeIndex, turnIntoCommands.length - 1));

      if (event.key === "Escape" || event.key === "ArrowLeft") {
        event.preventDefault();
        closeBlockTurnIntoMenu({ focusParent: true });
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setBlockTurnIntoMenu((current) =>
          current
            ? {
                ...current,
                activeIndex:
                  turnIntoCommands.length > 0
                    ? event.key === "ArrowDown"
                      ? (current.activeIndex + 1) % turnIntoCommands.length
                      : (current.activeIndex - 1 + turnIntoCommands.length) % turnIntoCommands.length
                    : 0
              }
            : current
        );
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const activeCommand = turnIntoCommands[nextIndex];
        if (activeCommand) {
          executeBlockTurnIntoCommand(activeCommand);
        }
      }
    },
    [closeAllBlockSurfaces, closeBlockTurnIntoMenu, executeBlockTurnIntoCommand]
  );

  useEffect(() => {
    blockActionMenuRef.current = blockActionMenu;
  }, [blockActionMenu]);

  useEffect(() => {
    blockTurnIntoMenuRef.current = blockTurnIntoMenu;
  }, [blockTurnIntoMenu]);

  useEffect(() => {
    if (!blockActionMenu) {
      return;
    }

    const runtimeEditor = editorRef.current;
    if (!runtimeEditor) {
      return;
    }

    const targetRect = getTopLevelBlockRect(runtimeEditor, blockActionMenu.blockIndex);
    if (!targetRect) {
      closeAllBlockSurfaces({ focusEditor: true });
      return;
    }

    const nextAnchorRect = buildBlockActionMenuAnchorRect(targetRect);
    const nextPlacement = resolveCommandSelectorPlacement(overlayOwnerDocument, nextAnchorRect, BLOCK_ACTION_MENU_HEIGHT);
    if (areDomRectsEqual(blockActionMenu.anchorRect, nextAnchorRect) && blockActionMenu.placement === nextPlacement) {
      return;
    }

    setBlockActionMenu((current) =>
      current
        ? {
            ...current,
            anchorRect: nextAnchorRect,
            placement: nextPlacement
          }
        : current
    );
  }, [blockActionMenu, closeAllBlockSurfaces, overlayMeasurementVersion, overlayOwnerDocument]);

  useEffect(() => {
    if (!blockTurnIntoMenu) {
      return;
    }

    const triggerElement = blockTurnIntoTriggerRef.current;
    if (!triggerElement) {
      return;
    }

    const nextAnchorRect = triggerElement.getBoundingClientRect();
    const nextPlacement = resolveCommandSelectorPlacement(overlayOwnerDocument, nextAnchorRect, BLOCK_TURN_INTO_MENU_HEIGHT);
    if (areDomRectsEqual(blockTurnIntoMenu.anchorRect, nextAnchorRect) && blockTurnIntoMenu.placement === nextPlacement) {
      return;
    }

    setBlockTurnIntoMenu((current) =>
      current
        ? {
            ...current,
            anchorRect: nextAnchorRect,
            placement: nextPlacement
          }
        : current
    );
  }, [blockTurnIntoMenu, overlayMeasurementVersion, overlayOwnerDocument]);

  useLayoutEffect(() => {
    if (!blockActionMenu) {
      return;
    }

    blockActionMenuItemRefs.current[blockActionMenu.activeIndex]?.focus();
  }, [blockActionMenu]);

  useLayoutEffect(() => {
    if (!blockTurnIntoMenu) {
      return;
    }

    blockTurnIntoMenuItemRefs.current[blockTurnIntoMenu.activeIndex]?.focus();
  }, [blockTurnIntoMenu]);

  useLayoutEffect(() => {
    if (!commandSelector) {
      commandSelectorItemRefs.current = [];
      return;
    }

    const activeCommandSelectorItem = commandSelectorItemRefs.current[commandSelector.activeIndex];
    if (typeof activeCommandSelectorItem?.scrollIntoView === "function") {
      activeCommandSelectorItem.scrollIntoView({ block: "nearest", inline: "nearest" });
    }
  }, [commandMatches, commandSelector]);

  function openSlashSelector(runtimeEditor: Editor, triggerSelection: SlashTriggerSelection) {
    clearTransientBlockSelection();
    const anchorRect = getCaretBounds(runtimeEditor) ?? new DOMRect(12, 12, 1, 1);

    setCommandSelector({
      activeIndex: 0,
      anchorRect,
      ownerBlockIndex: triggerSelection.blockIndex,
      surfaceContext: resolveEditorBlockCommandContext(runtimeEditor.state.selection as TextSelection),
      placement: resolveCommandSelectorPlacement(overlayOwnerDocument, anchorRect, BLOCK_SELECTOR_HEIGHT),
      query: "",
      source: "slash",
      ownerPos: triggerSelection.ownerPos
    });
    return true;
  }

  function openQuickAddSelector(target: HoverTarget) {
    const runtimeEditor = editorRef.current;
    if (!runtimeEditor) {
      return;
    }

    closeBlockActionMenus({ syncHoverFromPointer: false });
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
    const fallbackAnchorRect = buildQuickAddAnchorRect(insertedBlockRect);
    setCommandSelector({
      activeIndex: 0,
      fallbackAnchorRect,
      historyTime,
      insertedBlockIndex,
      ownerBlockIndex: insertedBlockIndex,
      ownerLabel: target.accessibleLabel,
      surfaceContext: {
        isInsideTableCellOrHeader: false
      },
      placement: resolveCommandSelectorPlacement(overlayOwnerDocument, fallbackAnchorRect, BLOCK_SELECTOR_HEIGHT),
      query: "",
      source: "quickAdd"
    });
  }

  const stopGutterRangeAutoScroll = useCallback(() => {
    gutterRangeAutoScrollRef.current?.stop();
    gutterRangeAutoScrollRef.current = null;
  }, []);

  const clearGutterRangeGesture = useCallback(
    (options: { clearSelection?: boolean; reason?: string; releaseClickSuppression?: boolean } = {}) => {
      const { clearSelection = true, reason = "session-change", releaseClickSuppression = false } = options;
      const runtimeEditor = editorRef.current;
      const surfaceElement = surfaceRef.current;
      const cleanup = gutterRangeGestureCleanupRef.current;
      gutterRangeGestureCleanupRef.current = null;
      gutterRangeGestureRef.current = null;
      stopGutterRangeAutoScroll();
      cleanup?.();
      setActiveRangeMarqueeRect(null);
      panelCursorZoneRef.current = null;
      setEditorPanelCursor(surfaceElement, "");
      if (clearSelection) {
        clearTransientBlockSelection(reason);
      }
      if (releaseClickSuppression) {
        scheduleSurfaceClickSuppressionRelease();
      } else {
        clearSurfaceClickSuppressionReleaseTimer();
        suppressSurfaceClickUntilPointerUpRef.current = false;
      }
    },
    [clearSurfaceClickSuppressionReleaseTimer, clearTransientBlockSelection, scheduleSurfaceClickSuppressionRelease, stopGutterRangeAutoScroll]
  );

  useEffect(() => {
    activeRangeMarqueeRectRef.current = activeRangeMarqueeRect;
  }, [activeRangeMarqueeRect]);

  useEffect(() => {
    clearGutterRangeGestureUnmountRef.current = clearGutterRangeGesture;
  }, [clearGutterRangeGesture]);

  useEffect(() => {
    clearSurfaceClickSuppressionReleaseTimerUnmountRef.current = clearSurfaceClickSuppressionReleaseTimer;
  }, [clearSurfaceClickSuppressionReleaseTimer]);

  useEffect(() => {
    clearTransientBlockSelectionUnmountRef.current = clearTransientBlockSelection;
  }, [clearTransientBlockSelection]);

  const startBlankGutterRangeGesture = useCallback(
    (event: PointerEvent, anchorBlockIndex: number) => {
      const runtimeEditor = editorRef.current;
      const surfaceElement = surfaceRef.current;
      if (!runtimeEditor || !surfaceElement) {
        return false;
      }

      clearGutterRangeGesture({ clearSelection: false, reason: "session-change" });
      closeCommandSelector({ syncHoverFromPointer: false });
      closeBlockActionMenus({ focusEditor: false, syncHoverFromPointer: false });
      suppressSurfaceClickUntilPointerUpRef.current = true;
      clearSurfaceClickSuppressionReleaseTimer();

      const ownerDocument = surfaceElement.ownerDocument;
      const ownerWindow = ownerDocument.defaultView;
      const applyRangeGesturePoint = (clientX: number, clientY: number) => {
        const gesture = gutterRangeGestureRef.current;
        if (!gesture) {
          return;
        }

        gesture.lastClientX = clientX;
        gesture.lastClientY = clientY;
        const target = resolveActiveBlankGutterSelectionTarget(runtimeEditor, clientY);
        if (target === null) {
          return;
        }

        const distance = Math.max(
          Math.abs(clientX - gesture.startClientX),
          Math.abs(clientY - gesture.startClientY)
        );
        if (!gesture.activated && distance < BLOCK_HANDLE_GESTURE_THRESHOLD_PX) {
          return;
        }

        if (!gesture.activated) {
          gesture.activated = true;
          setActiveRangeMarqueeRect(
            clampMarqueeRectToPanel(
              gesture.startClientX,
              gesture.startClientY,
              clientX,
              clientY,
              resolveEditorLaneGeometry(surfaceElement, runtimeEditor.view.dom as HTMLElement).mainPaneRect
            )
          );
          runtimeEditor.view.focus();
        }

        if (gesture.activated && runtimeEditor.view.dom instanceof HTMLElement) {
          setActiveRangeMarqueeRect(
            clampMarqueeRectToPanel(
              gesture.startClientX,
              gesture.startClientY,
              clientX,
              clientY,
              resolveEditorLaneGeometry(surfaceElement, runtimeEditor.view.dom).mainPaneRect
            )
          );
        }

        if (gesture.currentBlockIndex !== target.blockIndex || getBlockSelectionState(runtimeEditor) === null) {
          gesture.currentBlockIndex = target.blockIndex;
          setTransientBlockSelectionRange(gesture.anchorBlockIndex, target.blockIndex);
        }
      };
      const ensureRangeAutoScroll = () => {
        if (gutterRangeAutoScrollRef.current) {
          return gutterRangeAutoScrollRef.current;
        }

        gutterRangeAutoScrollRef.current = createEditorAutoScrollSession({
          getPointerY: () => gutterRangeGestureRef.current?.lastClientY ?? null,
          getTopClearancePx: getEditorAutoScrollTopClearancePx,
          getViewport: getEditorAutoScrollViewport,
          onScroll: () => {
            const gesture = gutterRangeGestureRef.current;
            if (!gesture?.activated) {
              return;
            }
            applyRangeGesturePoint(gesture.lastClientX, gesture.lastClientY);
            scheduleOverlayMeasurement();
          },
          ownerWindow
        });
        return gutterRangeAutoScrollRef.current;
      };
      const cleanup = () => {
        ownerDocument.removeEventListener("keydown", handleKeyDown, true);
        ownerDocument.removeEventListener("pointermove", handlePointerMove, true);
        ownerDocument.removeEventListener("pointerup", handlePointerUp, true);
        ownerDocument.removeEventListener("pointercancel", handlePointerCancel, true);
        ownerDocument.removeEventListener("gotpointercapture", handleGotPointerCapture, true);
        ownerDocument.removeEventListener("lostpointercapture", handleLostPointerCapture, true);
        ownerWindow?.removeEventListener("pagehide", handlePageHide);
        ownerWindow?.removeEventListener("visibilitychange", handleVisibilityChange);
        ownerWindow?.removeEventListener("blur", handleWindowBlur);
      };

      const handlePointerMove = (pointerEvent: PointerEvent) => {
        const gesture = gutterRangeGestureRef.current;
        const pointerIdMatches = gesture?.pointerId === pointerEvent.pointerId;
        if (!gesture || !pointerIdMatches) {
          return;
        }

        if (pointerEvent.buttons === 0) {
          clearGutterRangeGesture({ clearSelection: true, reason: "pointerup-nonactivated" });
          return;
        }

        pointerEvent.preventDefault();
        applyRangeGesturePoint(pointerEvent.clientX, pointerEvent.clientY);
        if (gutterRangeGestureRef.current?.activated) {
          ensureRangeAutoScroll().update();
        }
      };

      const handleKeyDown = (keyEvent: KeyboardEvent) => {
        const gesture = gutterRangeGestureRef.current;
        if (!gesture || keyEvent.key !== "Escape") {
          return;
        }

        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        clearGutterRangeGesture({ clearSelection: true, reason: "escape" });
      };

      const handlePointerUp = (pointerEvent: PointerEvent) => {
        const gesture = gutterRangeGestureRef.current;
        if (!gesture || gesture.pointerId !== pointerEvent.pointerId) {
          return;
        }

        pointerEvent.preventDefault();
        clearGutterRangeGesture({
          clearSelection: !gesture.activated,
          reason: "pointerup",
          releaseClickSuppression: true
        });
      };

      const handlePointerCancel = (pointerEvent: PointerEvent) => {
        const gesture = gutterRangeGestureRef.current;
        if (!gesture || gesture.pointerId !== pointerEvent.pointerId) {
          return;
        }

        pointerEvent.preventDefault();
        clearGutterRangeGesture({ clearSelection: true, reason: "pointercancel" });
      };

      const handleGotPointerCapture = (pointerEvent: PointerEvent) => {
        if (pointerEvent.pointerId !== event.pointerId) {
          return;
        }
      };

      const handleLostPointerCapture = (pointerEvent: PointerEvent) => {
        const gesture = gutterRangeGestureRef.current;
        if (!gesture || gesture.pointerId !== pointerEvent.pointerId) {
          return;
        }

        pointerEvent.preventDefault();
        clearGutterRangeGesture({ clearSelection: true, reason: "lostpointercapture" });
      };

      const handlePageHide = () => {
        clearGutterRangeGesture({ clearSelection: true, reason: "pagehide" });
      };

      const handleVisibilityChange = () => {
        if (ownerDocument.visibilityState === "hidden") {
          clearGutterRangeGesture({ clearSelection: true, reason: "visibility-hidden" });
        }
      };

      const handleWindowBlur = () => {
        clearGutterRangeGesture({ clearSelection: true, reason: "window-blur" });
      };

      gutterRangeGestureRef.current = {
        activated: false,
        anchorBlockIndex,
        currentBlockIndex: anchorBlockIndex,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        pointerId: event.pointerId,
        startClientX: event.clientX,
        startClientY: event.clientY
      };
      gutterRangeGestureCleanupRef.current = cleanup;

      ownerDocument.addEventListener("pointermove", handlePointerMove, true);
      ownerDocument.addEventListener("pointerup", handlePointerUp, true);
      ownerDocument.addEventListener("pointercancel", handlePointerCancel, true);
      ownerDocument.addEventListener("gotpointercapture", handleGotPointerCapture, true);
      ownerDocument.addEventListener("lostpointercapture", handleLostPointerCapture, true);
      ownerDocument.addEventListener("keydown", handleKeyDown, true);
      ownerWindow?.addEventListener("pagehide", handlePageHide);
      ownerWindow?.addEventListener("visibilitychange", handleVisibilityChange);
      ownerWindow?.addEventListener("blur", handleWindowBlur);

      event.preventDefault();
      return true;
    },
    [
      clearGutterRangeGesture,
      clearSurfaceClickSuppressionReleaseTimer,
      closeBlockActionMenus,
      closeCommandSelector,
      getEditorAutoScrollTopClearancePx,
      getEditorAutoScrollViewport,
      scheduleOverlayMeasurement,
      scheduleSurfaceClickSuppressionRelease,
      setTransientBlockSelectionRange
    ]
  );

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
      if (command.id === "table") {
        command.run(runtimeEditor);
        return true;
      }
      return replaceQuickAddParagraph(runtimeEditor, activeSelector.insertedBlockIndex, command);
    });
  } else {
      if (command.id === "blockquote") {
        didExecute = replaceEmptyParagraphWithBlockquote(runtimeEditor, activeSelector.ownerBlockIndex);
      } else {
        didExecute = applySlashCommand(runtimeEditor, activeSelector, command);
      }
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
      setBlockActionMenu(null);
      setBlockTurnIntoMenu(null);
      clearTransientBlockSelection();
      clearBlockDragSession();
    }
  }, [clearBlockDragSession, clearTransientBlockSelection, isEditable]);

  useEffect(() => {
    setOwnedHoverTarget(null);
    setCommandSelector(null);
    setBlockActionMenu(null);
    setBlockTurnIntoMenu(null);
    clearTransientBlockSelection();
    clearBlockDragSession();
  }, [clearBlockDragSession, clearTransientBlockSelection, pageSysId, sessionKey]);

  useEffect(() => {
    commandSelectorRef.current = commandSelector;
  }, [commandSelector]);

  useEffect(() => {
    const runtimeEditor = editorRef.current;
    if (!commandSelector || !runtimeEditor) {
      return;
    }

    if (commandSelector.source === "slash") {
      let nextAnchorRect: DOMRect;
      try {
        nextAnchorRect = getCaretBounds(runtimeEditor) ?? commandSelector.anchorRect;
      } catch {
        return;
      }
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

    let insertedBlockRect: DOMRect | null;
    try {
      insertedBlockRect = getTopLevelBlockRect(runtimeEditor, commandSelector.insertedBlockIndex);
    } catch {
      return;
    }
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
    clearBlockDragSession();
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
      clearGutterRangeGesture({ clearSelection: true, reason: "access-loss" });
      return;
    }

    if (typeof (editor as Editor & { on?: unknown; off?: unknown }).on !== "function" || typeof (editor as Editor & { on?: unknown; off?: unknown }).off !== "function") {
      return;
    }

    const handleTransaction = ({ transaction }: { transaction: Transaction }) => {
      if (transaction.selectionSet && transaction.getMeta(BLOCK_SELECTION_PLUGIN_KEY) === undefined) {
        clearTransientBlockSelection("transaction-selection-set");
      }
    };

    editor.on("transaction", handleTransaction);
    return () => {
      editor.off("transaction", handleTransaction);
    };
  }, [clearGutterRangeGesture, clearTransientBlockSelection, editor, isEditable]);

  useEffect(() => {
    if (!editor || !isEditable) {
      clearGutterRangeGesture({ clearSelection: true, reason: "access-loss" });
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const surfaceElement = surfaceRef.current;
      if (!surfaceElement) {
        return;
      }

      if (event.button !== 0) {
        return;
      }

      const runtimeEditor = editorRef.current;
      if (!runtimeEditor || runtimeEditor.isDestroyed) {
        return;
      }

      const insideOverlay = isPointerEventInsideElement(event, overlayRoot);
      const insideEditorLane = isPointerEventInsideEditorLane(event, surfaceElement);
      const insideRuntimeSurfaceByPath = isPointerEventInsideElement(event, surfaceElement);
      const target = resolvePointerEventTarget(event);
      const insideRuntimeSurfaceByTarget = target instanceof Node ? surfaceElement.contains(target) : false;
      const insideProseMirror = isPointerEventInsideElement(event, runtimeEditor.view.dom as HTMLElement);
      const gutterControlTarget = isGutterControlTarget(target);
      const interactiveOverlayTarget = isInteractiveEditorOverlayTarget(target);
      const classification = resolvePanelPointerClassification(runtimeEditor, surfaceElement, event.clientX, event.clientY);
      const anchorTarget = resolveBlankGutterSelectionAnchor(runtimeEditor, surfaceElement, event.clientX, event.clientY);
      const resolvedZone: PanelPointerZone = insideOverlay
        ? "overlay"
        : gutterControlTarget
          ? "block-control"
          : interactiveOverlayTarget
            ? "overlay"
            : classification.zone;
      const finalDecision = resolvedZone === "panel-background" && anchorTarget ? "arm" : "ignore-zone";

      if (insideOverlay) {
        return;
      }

      if (resolvedZone === "outside-panel") {
        clearGutterRangeGesture({ clearSelection: true, reason: "outside-editor" });
        clearTransientBlockSelection("outside-editor");
        return;
      }

      if (resolvedZone === "block-control") {
        if (isBlockHandleTarget(target)) {
          return;
        }
        clearTransientBlockSelection("control-pointerdown");
        return;
      }

      if (resolvedZone === "overlay") {
        return;
      }

      if (resolvedZone === "caret-strip") {
        clearTransientBlockSelection("caret-strip-pointerdown");
        if (classification.caretBlockIndex !== null && focusTopLevelCaretIntent(runtimeEditor, classification.caretBlockIndex)) {
          event.preventDefault();
        }
        return;
      }

      if (anchorTarget) {
        startBlankGutterRangeGesture(event, anchorTarget.blockIndex);
        return;
      }

      clearTransientBlockSelection(resolvedZone === "content-block" ? "content-pointerdown" : resolvedZone);
    };

    overlayOwnerDocument.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      overlayOwnerDocument.removeEventListener("pointerdown", handlePointerDown, true);
      clearGutterRangeGesture({ clearSelection: true, reason: "listener-disposal" });
    };
  }, [
    clearGutterRangeGesture,
    clearTransientBlockSelection,
    editor,
    isEditable,
    overlayOwnerDocument,
    overlayRoot,
    startBlankGutterRangeGesture
  ]);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      initializingRef.current = false;
      cancelPendingTimers();
      clearGutterRangeGestureUnmountRef.current?.({ clearSelection: true, reason: "runtime-teardown" });
      clearSurfaceClickSuppressionReleaseTimerUnmountRef.current?.();
      suppressSurfaceClickUntilPointerUpRef.current = false;
      clearTransientBlockSelectionUnmountRef.current?.("runtime-teardown");
      editorRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!editor) {
      return;
    }

    const ownerDocument = overlayRoot.ownerDocument;
    return subscribeToPageOwnershipHandoff(ownerDocument, (detail) => {
      if (detail.reason !== "page-create-inline-title" || detail.pageSysId !== pageSysId) {
        return;
      }

      if (!(editor.state.selection instanceof CellSelection)) {
        return;
      }

      releaseStructuralCellSelectionOwnership(editor);
    });
  }, [editor, overlayRoot, pageSysId]);

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
        panelCursorZoneRef.current = null;
        setEditorPanelCursor(null, "");
        setOwnedHoverTarget(null);
        return;
      }

      const insideEditorLane = isPointerEventInsideEditorLane(event, surfaceElement);
      const classification = resolvePanelPointerClassification(editor, surfaceElement, event.clientX, event.clientY);
      lastPointerSnapshotRef.current = {
        clientX: event.clientX,
        clientY: event.clientY,
        insideEditorLane
      };
      if (panelCursorZoneRef.current !== classification.zone) {
        panelCursorZoneRef.current = classification.zone;
        setEditorPanelCursor(surfaceElement, classification.zone === "caret-strip" ? "text" : "");
      }

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
    if (!commandSelector && !blockActionMenu && !blockTurnIntoMenu) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (isPointerEventInsideElement(event, overlayRoot)) {
        return;
      }

      if (isPointerEventInsideElement(event, surfaceRef.current)) {
        if (commandSelector) {
          closeCommandSelector();
        }
        if (blockActionMenu || blockTurnIntoMenu) {
          closeAllBlockSurfaces({ focusEditor: false, syncHoverFromPointer: false });
        }
        return;
      }

      if (commandSelector) {
        closeCommandSelector();
      }
      if (blockActionMenu || blockTurnIntoMenu) {
        closeAllBlockSurfaces({ focusEditor: false, syncHoverFromPointer: false });
      }
    };

    overlayOwnerDocument.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      overlayOwnerDocument.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [blockActionMenu, blockTurnIntoMenu, closeAllBlockSurfaces, closeCommandSelector, commandSelector, overlayOwnerDocument, overlayRoot]);

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

  const activeBlockControlTarget =
    editor && blockHandleGesture && !blockDragState
      ? (() => {
          const gestureNode = getTopLevelBlockNodeFromDoc(editor.state.doc, blockHandleGesture.blockIndex);
          return gestureNode
            ? {
                accessibleLabel: getTopLevelBlockLabelFromNode(gestureNode),
                blockIndex: blockHandleGesture.blockIndex
              }
            : hoverTarget;
        })()
      : editor && (blockTurnIntoMenu || blockActionMenu)
        ? (() => {
            const menuBlockIndex = blockTurnIntoMenu?.blockIndex ?? blockActionMenu?.blockIndex ?? null;
            if (menuBlockIndex === null) {
              return hoverTarget;
            }

            const menuNode = getTopLevelBlockNodeFromDoc(editor.state.doc, menuBlockIndex);
            return menuNode
              ? {
                  accessibleLabel: getTopLevelBlockLabelFromNode(menuNode),
                  blockIndex: menuBlockIndex
                }
              : hoverTarget;
          })()
        : hoverTarget;
  const hoverTargetRect = editor && activeBlockControlTarget ? getTopLevelBlockRect(editor, activeBlockControlTarget.blockIndex) : null;
  const gutterAnchorRect = hoverTargetRect ? buildQuickAddAnchorRect(hoverTargetRect) : null;
  const gutterButtonStyle = gutterAnchorRect ? buildGutterButtonStyle(gutterAnchorRect) : undefined;
  const gutterHandleStyle = gutterAnchorRect ? buildGutterHandleStyle(gutterAnchorRect) : undefined;
  const blockDragDropIndicatorStyle =
    editor &&
    blockDragState &&
    blockDragState.destinationIndex !== null &&
    isValidBlockDragDestinationIndex(
      editor.state.doc.childCount,
      blockDragState.sourceBlockIndex,
      blockDragState.sourceBlockEndIndex,
      blockDragState.destinationIndex
    )
      ? buildTopLevelBlockDropIndicatorStyle(editor, blockDragState.destinationIndex, {
        lineHeight: BLOCK_DRAG_LINE_HEIGHT,
        viewportGutter: VIEWPORT_GUTTER
      })
      : null;
  const blockDragFeedbackStyle = blockDragState
    ? buildTopLevelBlockDragFeedbackStyle({
        clientX: blockDragState.clientX,
        clientY: blockDragState.clientY
      })
    : null;
  const isPressedHandleTarget =
    Boolean(blockHandleGesture && activeBlockControlTarget && blockHandleGesture.blockIndex === activeBlockControlTarget.blockIndex && !blockDragState);
  const blockActionMenuNode = editor && blockActionMenu ? getTopLevelBlockNodeFromDoc(editor.state.doc, blockActionMenu.blockIndex) : null;
  const blockActionMenuEntries = blockActionMenuNode ? getBlockActionMenuEntries(blockActionMenuNode) : [];
  const blockActionMenuStyle =
    editor && blockActionMenu
      ? buildBlockActionMenuSurfaceStyle(
          overlayOwnerDocument,
          blockActionMenu.anchorRect,
          BLOCK_ACTION_MENU_WIDTH,
          BLOCK_ACTION_MENU_HEIGHT,
          blockActionMenu.placement
        )
      : undefined;
  const blockTurnIntoCommands = blockActionMenuNode ? getTurnIntoBlockCommandsForBlock(blockActionMenuNode) : [];
  const blockTurnIntoSelectedCommandId = blockActionMenuNode ? getTurnIntoBlockCommandIdFromNode(blockActionMenuNode) : null;
  const blockActionMenuSurfaceRect = blockActionMenuSurfaceRef.current?.getBoundingClientRect() ?? null;
  const blockTurnIntoMenuStyle =
    editor && blockTurnIntoMenu
      ? buildBlockTurnIntoMenuSurfaceStyle(
          overlayOwnerDocument,
          blockTurnIntoMenu.anchorRect,
          BLOCK_TURN_INTO_MENU_WIDTH,
          BLOCK_TURN_INTO_MENU_HEIGHT,
          blockTurnIntoMenu.placement,
          blockActionMenuSurfaceRect
        )
      : undefined;
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
          --docsera-table-control-primary: #4648D4;
          --docsera-table-control-active-icon: var(--docsera-editor-panel);
          --docsera-editor-block-selection: color-mix(in srgb, var(--docsera-editor-primary) 7%, transparent);
        }
        .docsera-editor-runtime--dark {
          --docsera-editor-muted: #a7b3c5;
          --docsera-editor-panel: rgba(15, 18, 24, 0.98);
          --docsera-editor-panel-border: rgba(122, 139, 167, 0.22);
          --docsera-editor-text: #eef2f8;
          --docsera-editor-primary: #58a6ff;
          --docsera-table-control-primary: #7C83FA;
          --docsera-table-control-active-icon: #ffffff;
          --docsera-editor-block-selection: color-mix(in srgb, var(--docsera-editor-primary) 12%, transparent);
        }
        .docsera-editor-runtime__surface {
          position: relative;
          width: 100%;
          min-width: 0;
        }
        .docsera-editor-runtime__surface--block-dragging,
        .docsera-editor-runtime__surface--block-dragging *,
        .docsera-editor-overlay-root--block-dragging,
        .docsera-editor-overlay-root--block-dragging * {
          cursor: grabbing !important;
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
          min-width: 0;
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
        .docsera-editor-runtime__surface .ProseMirror .tableWrapper {
          --docsera-table-scrollbar-height: 8px;
          --docsera-table-row-rail-height: 22px;
          --docsera-table-rail-gap: 4px;
          --docsera-table-bottom-lane: calc(
            var(--docsera-table-row-rail-height) + var(--docsera-table-scrollbar-height) + var(--docsera-table-rail-gap) * 2
          );
          position: relative;
          overflow-x: auto;
          overflow-y: visible;
          min-width: 0;
          margin: 1rem 0;
          padding-bottom: var(--docsera-table-bottom-lane);
          scrollbar-gutter: stable;
          scrollbar-width: thin;
          scrollbar-color: color-mix(in srgb, var(--docsera-editor-muted) 72%, transparent)
            color-mix(in srgb, var(--docsera-editor-panel-border) 70%, transparent);
        }
        .docsera-editor-runtime__surface .ProseMirror .tableWrapper::-webkit-scrollbar {
          height: 8px;
        }
        .docsera-editor-runtime__surface .ProseMirror .tableWrapper::-webkit-scrollbar-track {
          border-radius: 999px;
          background: color-mix(in srgb, var(--docsera-editor-panel-border) 70%, transparent);
        }
        .docsera-editor-runtime__surface .ProseMirror .tableWrapper::-webkit-scrollbar-thumb {
          border-radius: 999px;
          background: color-mix(in srgb, var(--docsera-editor-muted) 72%, transparent);
        }
        .docsera-editor-runtime__surface .ProseMirror .tableWrapper::-webkit-scrollbar-thumb:hover {
          background: color-mix(in srgb, var(--docsera-editor-muted) 88%, var(--docsera-editor-text));
        }
        .docsera-editor-runtime__surface .ProseMirror table {
          width: max-content;
          margin: 0;
          border-collapse: collapse;
          table-layout: auto;
          font-size: inherit;
          line-height: inherit;
        }
        .docsera-editor-runtime__surface .ProseMirror table td,
        .docsera-editor-runtime__surface .ProseMirror table th {
          position: relative;
          min-width: 80px;
          padding: 0.38rem 0.75rem;
          border: 1px solid color-mix(in srgb, var(--docsera-editor-panel-border) 82%, var(--docsera-editor-muted));
          color: var(--docsera-editor-text);
          text-align: left;
          vertical-align: top;
        }
        .docsera-editor-runtime__surface .ProseMirror table th {
          font-weight: 700;
        }
        .docsera-editor-runtime__surface .ProseMirror .tableWrapper[data-docsera-table-drag-selection-active="true"],
        .docsera-editor-runtime__surface .ProseMirror .tableWrapper[data-docsera-table-drag-selection-active="true"] * {
          -webkit-user-select: none;
          user-select: none;
        }
        .docsera-editor-runtime__surface .ProseMirror table td.selectedCell::after,
        .docsera-editor-runtime__surface .ProseMirror table th.selectedCell::after,
        .docsera-editor-runtime__surface .ProseMirror table td.docsera-table-selection-outline::after,
        .docsera-editor-runtime__surface .ProseMirror table th.docsera-table-selection-outline::after {
          content: none;
        }
        .docsera-editor-runtime__surface .ProseMirror table td.docsera-table-selection-outline::before,
        .docsera-editor-runtime__surface .ProseMirror table th.docsera-table-selection-outline::before {
          content: "";
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 2;
          box-sizing: border-box;
          border-style: solid;
          border-color: var(--docsera-table-control-primary);
          border-top-width: 0;
          border-right-width: 0;
          border-bottom-width: 0;
          border-left-width: 0;
        }
        .docsera-editor-runtime__surface .ProseMirror table td.docsera-table-selection-outline--top::before,
        .docsera-editor-runtime__surface .ProseMirror table th.docsera-table-selection-outline--top::before {
          border-top-width: 1.5px;
        }
        .docsera-editor-runtime__surface .ProseMirror table td.docsera-table-selection-outline--right::before,
        .docsera-editor-runtime__surface .ProseMirror table th.docsera-table-selection-outline--right::before {
          border-right-width: 1.5px;
        }
        .docsera-editor-runtime__surface .ProseMirror table td.docsera-table-selection-outline--bottom::before,
        .docsera-editor-runtime__surface .ProseMirror table th.docsera-table-selection-outline--bottom::before {
          border-bottom-width: 1.5px;
        }
        .docsera-editor-runtime__surface .ProseMirror table td.docsera-table-selection-outline--left::before,
        .docsera-editor-runtime__surface .ProseMirror table th.docsera-table-selection-outline--left::before {
          border-left-width: 1.5px;
        }
        .docsera-editor-runtime__surface .ProseMirror table td > :first-child,
        .docsera-editor-runtime__surface .ProseMirror table th > :first-child {
          margin-top: 0;
        }
        .docsera-editor-runtime__surface .ProseMirror table td > :last-child,
        .docsera-editor-runtime__surface .ProseMirror table th > :last-child {
          margin-bottom: 0;
        }
        .docsera-editor-runtime__surface .ProseMirror table td.docsera-table-cell-active,
        .docsera-editor-runtime__surface .ProseMirror table th.docsera-table-cell-active {
          box-shadow: inset 0 0 0 1.5px var(--docsera-table-control-primary);
        }
        .docsera-editor-floating-layer {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 30;
        }
        .docsera-editor-floating-layer--block-dragging,
        .docsera-editor-floating-layer--block-dragging * {
          cursor: grabbing !important;
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
        .docsera-editor-floating__block-drag-feedback {
          position: fixed;
          pointer-events: none;
          z-index: 2;
          display: block;
          max-width: min(24rem, calc(100vw - 24px));
          border: 0;
          background: transparent;
          border-radius: 0;
          color: var(--docsera-editor-text);
          box-shadow: none;
          font-size: 1rem;
          font-weight: 400;
          line-height: 1.7;
          letter-spacing: 0;
          user-select: none;
          overflow: visible;
        }
        .docsera-editor-floating__block-drag-preview {
          display: block;
          max-width: 100%;
          color: inherit;
          font-size: 1rem;
          font-weight: 400;
          line-height: 1.7;
          letter-spacing: 0;
          overflow-wrap: anywhere;
          word-break: normal;
          opacity: 0.56;
          filter: saturate(0.76);
        }
        .docsera-editor-floating__block-drag-preview > :first-child {
          margin-top: 0;
        }
        .docsera-editor-floating__block-drag-preview > :last-child {
          margin-bottom: 0;
        }
        .docsera-editor-floating__block-drag-preview p {
          margin: 0 0 1rem;
        }
        .docsera-editor-floating__block-drag-preview h1,
        .docsera-editor-floating__block-drag-preview h2,
        .docsera-editor-floating__block-drag-preview h3 {
          margin: 1.4rem 0 0.7rem;
          line-height: 1.2;
          scroll-margin-block-start: var(--docsera-workspace-heading-scroll-margin);
          scroll-margin-top: var(--docsera-workspace-heading-scroll-margin);
        }
        .docsera-editor-floating__block-drag-preview h1 {
          font-size: 1.9rem;
          letter-spacing: -0.025em;
        }
        .docsera-editor-floating__block-drag-preview h2 {
          font-size: 1.65rem;
          letter-spacing: -0.02em;
        }
        .docsera-editor-floating__block-drag-preview h3 {
          font-size: 1.25rem;
        }
        .docsera-editor-floating__block-drag-preview ul,
        .docsera-editor-floating__block-drag-preview ol {
          margin: 0 0 1rem;
          padding-left: 1.5rem;
        }
        .docsera-editor-floating__block-drag-preview li + li {
          margin-top: 0.35rem;
        }
        .docsera-editor-floating__block-drag-preview blockquote {
          margin: 0 0 1rem;
          padding-left: 1rem;
          border-left: 3px solid color-mix(in srgb, var(--docsera-editor-primary) 24%, transparent);
          color: var(--docsera-editor-muted);
        }
        .docsera-editor-floating__block-drag-preview pre {
          margin: 0 0 1rem;
          padding: 0.9rem 1rem;
          border-radius: 14px;
          background: color-mix(in srgb, var(--docsera-editor-panel) 86%, black 14%);
          color: var(--docsera-editor-text);
          overflow-x: auto;
        }
        .docsera-editor-floating__block-drag-preview code {
          font-family: "JetBrains Mono", "Fira Code", Consolas, monospace;
          font-size: 0.92em;
        }
        .docsera-editor-floating__block-drag-preview p code {
          padding: 0.12rem 0.35rem;
          border-radius: 0.4rem;
          background: color-mix(in srgb, var(--docsera-editor-panel) 88%, black 12%);
        }
        .docsera-editor-floating__block-drag-preview hr {
          margin: 1.5rem 0;
          border: 0;
          border-top: 1px solid color-mix(in srgb, var(--docsera-editor-muted) 28%, transparent);
        }
        .docsera-editor-floating__block-drag-preview a {
          color: var(--docsera-editor-primary);
          text-decoration-thickness: 0.08em;
          text-underline-offset: 0.12em;
        }
        .docsera-editor-floating__block-drag-preview mark {
          background: color-mix(in srgb, var(--docsera-editor-primary) 16%, transparent);
          color: inherit;
        }
        .docsera-editor-floating__block-drag-preview sup,
        .docsera-editor-floating__block-drag-preview sub {
          font-size: 0.72em;
          line-height: 0;
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
        .docsera-editor-floating__handle svg {
          width: ${QUICK_ADD_ICON_SIZE}px;
          height: ${QUICK_ADD_ICON_SIZE}px;
          flex: 0 0 auto;
        }
        .docsera-editor-floating__block-drop-indicator {
          pointer-events: none;
          border-radius: 999px;
          background: var(--docsera-primary);
          box-shadow: 0 0 0 1px color-mix(in srgb, var(--docsera-primary) 24%, transparent);
        }
        .docsera-editor-floating__selection-marquee {
          pointer-events: none;
          border: 1px solid color-mix(in srgb, var(--docsera-editor-primary) 58%, white 18%);
          background: color-mix(in srgb, var(--docsera-editor-primary) 12%, transparent);
          box-shadow: inset 0 0 0 1px color-mix(in srgb, white 22%, transparent);
        }
        .docsera-block-action-menu,
        .docsera-block-turn-into-menu {
          border: 1px solid color-mix(in srgb, var(--docsera-border) 92%, white 8%);
          border-radius: 12px;
          background: color-mix(in srgb, var(--docsera-surface) 96%, white 4%);
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.16), 0 3px 12px rgba(15, 23, 42, 0.08);
          overflow: hidden;
        }
        .docsera-block-action-menu__list,
        .docsera-block-turn-into-menu__list {
          display: grid;
          gap: 0;
          padding: 8px;
        }
        .docsera-block-menu__item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          min-height: 38px;
          padding: 0 10px;
          border: 0;
          border-radius: 8px;
          background: transparent;
          color: var(--docsera-text-muted);
          cursor: pointer;
          text-align: left;
          transition: background-color 0.16s ease, color 0.16s ease;
        }
        .docsera-block-menu__item:hover,
        .docsera-block-menu__item:focus-visible,
        .docsera-block-menu__item--active {
          background: color-mix(in srgb, var(--docsera-primary) 10%, var(--docsera-surface));
          color: var(--docsera-primary);
          outline: none;
        }
        .docsera-block-menu__item--selected {
          color: var(--docsera-primary);
        }
        .docsera-block-menu__item--selected .docsera-block-menu__label {
          font-weight: 700;
        }
        .docsera-block-menu__item--destructive {
          color: #d92d20;
        }
        .docsera-block-menu__item--destructive:hover,
        .docsera-block-menu__item--destructive:focus-visible,
        .docsera-block-menu__item--destructive.docsera-block-menu__item--active {
          background: color-mix(in srgb, #d92d20 10%, var(--docsera-surface));
          color: #d92d20;
        }
        .docsera-block-menu__icon,
        .docsera-block-action-menu__chevron,
        .docsera-block-menu__check {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex: 0 0 auto;
          width: 18px;
          height: 18px;
          color: currentColor;
        }
        .docsera-block-action-menu__chevron,
        .docsera-block-menu__check {
          margin-left: auto;
        }
        .docsera-block-menu__label {
          min-width: 0;
          color: inherit;
          display: inline-flex;
          align-items: center;
          min-height: 18px;
          font-size: 14px;
          font-weight: 500;
          line-height: 1.2;
        }
        .docsera-block-action-menu__divider {
          height: 1px;
          margin: 6px 2px;
          background: color-mix(in srgb, var(--docsera-border) 88%, transparent);
        }
        .docsera-block-menu__icon svg,
        .docsera-block-action-menu__chevron svg,
        .docsera-block-menu__check svg {
          width: 16px;
          height: 16px;
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
        className={`docsera-editor-runtime__surface${blockDragState ? " docsera-editor-runtime__surface--block-dragging" : ""}`}
        onClick={(event) => {
          if (!editor || !isEditable || !(event.target instanceof HTMLElement)) return;
          if (suppressSurfaceClickUntilPointerUpRef.current) {
            event.preventDefault();
            event.stopPropagation();
            clearSurfaceClickSuppressionReleaseTimer();
            suppressSurfaceClickUntilPointerUpRef.current = false;
            return;
          }
          const proseMirror = event.currentTarget.querySelector(".ProseMirror");
          if (!(proseMirror instanceof HTMLElement) || (event.target !== event.currentTarget && event.target !== proseMirror)) return;
          clearTransientBlockSelection();
          const { shellSurfaceElement } = resolveLightDomEditorOwner(event.currentTarget);
          if (event.target === event.currentTarget && shellSurfaceElement) {
            return;
          }
          if (event.target === proseMirror && !isBelowEditorContentCanvasClick(event, proseMirror)) return;
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
          <div
            className={`docsera-editor-floating-layer ${overlayThemeClass}${blockDragState ? " docsera-editor-floating-layer--block-dragging" : ""}`}
            aria-hidden={!editor}
          >
            {blockDragDropIndicatorStyle ? (
              <div
                className="docsera-editor-floating__block-drop-indicator"
                style={blockDragDropIndicatorStyle}
                aria-hidden="true"
              />
            ) : null}
            {activeRangeMarqueeRect ? (
              <div
                className="docsera-editor-floating__selection-marquee"
                style={{
                  position: "fixed",
                  left: activeRangeMarqueeRect.left,
                  top: activeRangeMarqueeRect.top,
                  width: activeRangeMarqueeRect.width,
                  height: activeRangeMarqueeRect.height
                }}
                aria-hidden="true"
              />
            ) : null}
            {blockDragState && blockDragFeedbackStyle ? (
              <div
                className="docsera-editor-floating__block-drag-feedback"
                style={blockDragFeedbackStyle}
                aria-hidden="true"
              >
                <div
                  className="docsera-editor-floating__block-drag-preview"
                  aria-hidden="true"
                  dangerouslySetInnerHTML={{ __html: blockDragState.previewHtml }}
                />
              </div>
            ) : null}
            {activeBlockControlTarget && gutterButtonStyle && !commandSelector && !blockDragState ? (
              <button
                type="button"
                className="docsera-editor-floating__quick-add"
                style={gutterButtonStyle}
                aria-haspopup="listbox"
                aria-controls={selectorListboxId}
                aria-expanded={false}
                aria-label={`Add block after ${activeBlockControlTarget.accessibleLabel}`}
                data-docsera-block-gutter="true"
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={() => {
                  openQuickAddSelector(activeBlockControlTarget);
                }}
              >
                <Plus size={QUICK_ADD_ICON_SIZE} strokeWidth={2.2} aria-hidden="true" focusable="false" />
              </button>
            ) : null}

            {activeBlockControlTarget && hoverTargetRect && gutterHandleStyle && !commandSelector && !blockDragState ? (
              <button
                type="button"
                className="docsera-editor-floating__handle"
                style={{
                  ...gutterHandleStyle,
                  cursor: isPressedHandleTarget ? "grabbing" : "grab"
                }}
                tabIndex={-1}
                draggable={false}
                aria-label={`Select block: ${activeBlockControlTarget.accessibleLabel}`}
                data-docsera-block-gutter="true"
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onPointerDown={(event) => {
                  handleBlockHandlePointerDown({
                    blockIndex: activeBlockControlTarget.blockIndex,
                    event,
                    targetRect: hoverTargetRect
                  });
                }}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                <GripVertical size={QUICK_ADD_ICON_SIZE} strokeWidth={2.2} aria-hidden="true" focusable="false" />
              </button>
            ) : null}

            {blockActionMenu && blockActionMenuStyle && blockActionMenuNode ? (
              <div
                ref={blockActionMenuSurfaceRef}
                className="docsera-editor-floating docsera-block-selector docsera-block-action-menu"
                style={blockActionMenuStyle}
                role="menu"
                id={blockActionMenuId}
                aria-label={`Block actions for ${getTopLevelBlockLabelFromNode(blockActionMenuNode)}`}
                data-surface="block-actions"
                onKeyDown={handleBlockActionMenuKeyDown}
              >
                <div className="docsera-block-action-menu__list">
                  {blockActionMenuEntries.map((entry) => {
                    if (entry.kind === "turnInto") {
                      const turnIntoItemIndex = 0;
                      return (
                        <React.Fragment key="turnInto">
                          <button
                            ref={(element) => {
                              blockActionMenuItemRefs.current[turnIntoItemIndex] = element;
                              blockTurnIntoTriggerRef.current = element;
                            }}
                            type="button"
                            className={`docsera-block-menu__item${blockActionMenu.activeIndex === turnIntoItemIndex ? " docsera-block-menu__item--active" : ""}`}
                            role="menuitem"
                            aria-label="Turn into"
                            aria-haspopup="menu"
                            aria-controls={blockTurnIntoMenuId}
                            aria-expanded={blockTurnIntoMenu !== null}
                            onMouseDown={(event) => {
                              event.preventDefault();
                            }}
                            onMouseEnter={() => {
                              setBlockActionMenu((current) =>
                                current
                                  ? {
                                      ...current,
                                      activeIndex: turnIntoItemIndex
                                    }
                                  : current
                              );
                            }}
                            onClick={() => {
                              openBlockTurnIntoMenu(blockActionMenu.blockIndex, blockActionMenu.source, blockActionMenu.anchorRect);
                            }}
                          >
                            <span className="docsera-block-menu__icon" aria-hidden="true">
                              <Pilcrow size={15} strokeWidth={2.1} aria-hidden="true" focusable="false" />
                            </span>
                            <span className="docsera-block-menu__label">Turn into</span>
                            <span className="docsera-block-action-menu__chevron" aria-hidden="true">
                              <ChevronRight size={14} strokeWidth={2.2} aria-hidden="true" focusable="false" />
                            </span>
                          </button>
                          {blockActionMenuEntries.length > 1 ? <div className="docsera-block-action-menu__divider" role="separator" aria-orientation="horizontal" /> : null}
                        </React.Fragment>
                      );
                    }

                    const directActionIndex = entry.kind === "duplicate" ? (blockActionMenuEntries[0]?.kind === "turnInto" ? 1 : 0) : blockActionMenuEntries.length - 1;
                    const icon = entry.kind === "duplicate" ? <Copy size={15} strokeWidth={2.2} aria-hidden="true" focusable="false" /> : <Trash2 size={15} strokeWidth={2.2} aria-hidden="true" focusable="false" />;
                    const label = entry.kind === "duplicate" ? "Duplicate" : "Delete";

                    return (
                      <button
                        key={entry.kind}
                        ref={(element) => {
                          blockActionMenuItemRefs.current[directActionIndex] = element;
                        }}
                        type="button"
                        className={`docsera-block-menu__item${blockActionMenu.activeIndex === directActionIndex ? " docsera-block-menu__item--active" : ""}${entry.kind === "delete" ? " docsera-block-menu__item--destructive" : ""}`}
                        role="menuitem"
                        aria-label={label}
                        onMouseDown={(event) => {
                          event.preventDefault();
                        }}
                        onMouseEnter={() => {
                          setBlockActionMenu((current) =>
                            current
                              ? {
                                  ...current,
                                  activeIndex: directActionIndex
                                }
                              : current
                          );
                        }}
                        onClick={() => {
                          executeBlockActionMenuEntry(entry);
                        }}
                      >
                        <span className="docsera-block-menu__icon" aria-hidden="true">
                          {icon}
                        </span>
                        <span className="docsera-block-menu__label">{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {blockTurnIntoMenu && blockTurnIntoMenuStyle && blockActionMenuNode && blockTurnIntoCommands.length ? (
              <div
                className="docsera-editor-floating docsera-block-selector docsera-block-turn-into-menu"
                style={blockTurnIntoMenuStyle}
                role="menu"
                id={blockTurnIntoMenuId}
                aria-label={`Turn into ${getTopLevelBlockLabelFromNode(blockActionMenuNode)}`}
                data-surface="block-turn-into"
                onKeyDown={handleBlockTurnIntoMenuKeyDown}
              >
                <div className="docsera-block-turn-into-menu__list">
                  {blockTurnIntoCommands.map((command, index) => {
                    const isSelected = blockTurnIntoSelectedCommandId === command.id;
                    return (
                      <button
                        key={command.id}
                        ref={(element) => {
                          blockTurnIntoMenuItemRefs.current[index] = element;
                        }}
                        type="button"
                        className={`docsera-block-menu__item${blockTurnIntoMenu.activeIndex === index ? " docsera-block-menu__item--active" : ""}${isSelected ? " docsera-block-menu__item--selected" : ""}`}
                        role="menuitemradio"
                        aria-label={command.label}
                        aria-checked={isSelected}
                        onMouseDown={(event) => {
                          event.preventDefault();
                        }}
                        onMouseEnter={() => {
                          setBlockTurnIntoMenu((current) =>
                            current
                              ? {
                                  ...current,
                                  activeIndex: index
                                }
                              : current
                          );
                        }}
                        onClick={() => {
                          executeBlockTurnIntoCommand(command);
                        }}
                      >
                        <span className="docsera-block-menu__icon" aria-hidden="true">
                          <BlockCommandIcon id={command.id} />
                        </span>
                        <span className="docsera-block-menu__label">{command.label}</span>
                        {isSelected ? (
                          <span className="docsera-block-menu__check" aria-hidden="true">
                            <Check size={14} strokeWidth={2.4} aria-hidden="true" focusable="false" />
                          </span>
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
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
                                ref={(element) => {
                                  commandSelectorItemRefs.current[index] = element;
                                }}
                                onPointerDown={(event) => {
                                  event.preventDefault();
                                }}
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
            <TableControlsOverlay editor={editor} overlayRoot={overlayRoot} />
          </div>,
          overlayRoot
        )}
      </div>

    </section>
  );
}
