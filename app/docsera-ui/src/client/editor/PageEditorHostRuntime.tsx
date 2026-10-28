import { EDITOR_SCROLLBAR_STYLES } from "./ScrollbarStyles";
import { Extension, type Editor, type JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import { createPortal } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import * as React from "react";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Fragment, Slice, type Node as PMNode } from "@tiptap/pm/model";
import type { DocseraDocumentEnvelope, DocseraTiptapDocument } from "../../shared/editor/document";
import {
  DOCSERA_ACCORDION_DISCLOSURE_PLUGIN_KEY,
  getAccordionSelectionContext,
} from "../../shared/editor/schema";
import { DOCSERA_IMAGE_ALIGNMENTS, canonicalizeDocseraImageAttrs, type DocseraImageAttrs } from "../../shared/editor/imageContract";
import { DOCSERA_DOCUMENT_SCHEMA_VERSION, parseDocseraDocumentOrThrow } from "../../shared/editor/document";
import { createDocseraEditorExtensionsWithOptions } from "../../shared/editor/schema";
import { extractDocumentOutline, type EditorOutlineItem } from "./documentOutline";
import { closeHistory } from "@tiptap/pm/history";
import {
  EDITOR_BLOCK_COMMANDS,
  createAccordionIdentity,
  getEditorBlockCommandMatches,
  getGroupedEditorBlockCommandMatches,
  getEditorBlockCommandQuickAddContent,
  type EditorBlockCommandContext,
  type EditorBlockCommand,
  type EditorBlockCommandId
} from "./editorBlockCommands";
import { resolveHoverTargetBlockIndex } from "./editorBlockHover";
import { sanitizeDocseraPastedHTML, sanitizeDocseraPastedText } from "./pasteSanitizer";
import {
  createStructuredTableClipboardPayload,
  createStructuredTableClipboardItemData,
  doesStructuredTableClipboardDataMatchPayload,
  isFreshStructuredTableClipboardPayload,
  tryApplyStructuredTableClipboardPaste,
  type StructuredTableClipboardPayload
} from "./tableStructuredClipboard";
import type { PageBodySaveResult } from "../shared/types/docsera";
import { NodeSelection, Plugin, PluginKey, Selection, TextSelection, type Transaction } from "@tiptap/pm/state";
import { CellSelection } from "@tiptap/pm/tables";
import { Decoration, DecorationSet } from "@tiptap/pm/view";
import { CompactTextToolbar } from "./CompactTextToolbar";
import { resolveToolbarMenuSurfaceStyle } from "./CompactTextToolbar";
import { COMPACT_MENU_STYLES, EDITOR_DROPDOWN_MOTION_STYLES } from "./CompactMenuStyles";
import { EditorHistoryControls } from "./EditorHistoryControls";
import { EmojiPickerControls } from "./EmojiPickerControls";
import {
  DOCSERA_TOOLTIP_DELAY_MS,
  DOCSERA_TOOLTIP_STYLES,
  DocseraCompactTooltip,
  DocseraTooltip
} from "./DocseraTooltip";
import { EDITOR_IMAGE_STYLES } from "./EditorImageStyles";
import { ImagePickerDialog } from "./ImagePickerDialog";
import { ImageOptionsPanel } from "./ImageOptionsPanel";
import { IMAGE_OPTIONS_STYLES } from "./ImageOptionsStyles";
import { IMAGE_PICKER_STYLES } from "./ImagePickerStyles";
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
import {
  ImageFullscreenViewer,
  type ImageFullscreenViewerSession,
  createImageFullscreenViewerSession
} from "../shared/media/ImageFullscreenViewer";
import {
  clearDocseraImagePreviewState,
  getDocseraImageDisplayState,
  resetDocseraImageDisplayState,
  setDocseraImageDisplayTheme,
  setDocseraImagePreviewState,
  subscribeDocseraImageDisplayState
} from "../shared/editor/imageDisplayState";
import { useTopLevelBlockDragSession } from "./useTopLevelBlockDragSession";
import { getTaskListProgressStorageKey, readTaskListProgress, writeTaskListProgress } from "../shared/taskListProgress";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  Check,
  Code2,
  CircleAlert,
  ChevronDown,
  Copy,
  ChevronRight,
  EllipsisVertical,
  Image,
  Heading1,
  Heading2,
  Heading3,
  GripVertical,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Moon,
  Pilcrow,
  Plus,
  Quote,
  SunMedium,
  Table2,
  Frame as FrameIcon,
  ZoomIn,
  Trash2,
} from "lucide-react";
import { BLOCK_SELECTOR_STYLES } from "./BlockSelectorStyles";
import TableControlsOverlay from "./TableControlsOverlay";
import type { EditorMediaAdapter, EditorMediaReference } from "./contracts";
import type { PageEditorCanonicalHandoffResult, PageEditorRecoveredDraftReconciliationResult } from "./PageEditorHost";

type PageEditorHostRuntimeProps = {
  canEdit: boolean;
  interactionActive?: boolean;
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
  onEditorCommandTargetChange?: (editor: Editor | null) => void;
  onStatusChange: (state: {
    applyCanonicalEnvelope?: (envelope: DocseraDocumentEnvelope) => PageEditorCanonicalHandoffResult;
    discardLocalEdits?: (input: { envelope: DocseraDocumentEnvelope; revision: number }) => boolean;
    reconcileRecoveredDraft?: (input: {
      envelope: DocseraDocumentEnvelope;
      revision: number;
      preserveConflictUnlessTrusted?: boolean;
    }) => PageEditorRecoveredDraftReconciliationResult;
    flush?: () => Promise<boolean>;
    getCanonicalEnvelope?: () => DocseraDocumentEnvelope | null;
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
  mediaAdapter?: EditorMediaAdapter;
  historyControlsMount?: HTMLElement | null;
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

function getTaskItemOrdinal(document: PMNode, position: number): number | null {
  let ordinal = 0;
  let found: number | null = null;
  document.descendants((node, nodePosition) => {
    if (node.type.name !== "taskItem") {
      return;
    }
    if (nodePosition === position) {
      found = ordinal;
    }
    ordinal += 1;
  });
  return found;
}

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
      ownerFrom: number;
      ownerTo: number;
      ownerBlockIndex: number;
      placement: CommandSelectorPlacement;
      surfaceContext: EditorBlockCommandContext;
      query: string;
      source: "slash";
      ownerPos: number;
    };

type ImagePickerSessionState = {
  historyTime: number | null;
  insertedBlockIndex: number | null;
  targetFrom: number | null;
  targetTo: number | null;
  restoreSelectionPos: number;
  sessionId: string;
  source: "quickAdd" | "slash";
};

type ImageOptionsSessionState = {
  anchorRect: DOMRect;
  blockIndex: number;
  initialAttrs: DocseraImageAttrs;
  placement: CommandSelectorPlacement;
  sessionId: string;
};

type ImageAlignmentMenuState = {
  anchorRect: DOMRect;
  activeIndex: number;
  blockIndex: number;
  placement: CommandSelectorPlacement;
  sessionId: string;
};

type ImageAlignmentPickerMenuState = ImageAlignmentMenuState;

type ImageControlPresentation = "standard" | "compact";

type ImageResizeSessionState = {
  activeWidthPct: number;
  anchorRect: DOMRect;
  blockIndex: number;
  containerWidth: number;
  edge: "left" | "right";
  initialAttrs: DocseraImageAttrs;
  initialFigureRect: DOMRect;
  pointerId: number;
  sessionId: string;
  startClientX: number;
  startWidthPct: number;
  targetRect: DOMRect;
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

type GutterTooltipState = {
  anchorRect: DOMRect;
  id: "handle" | "quickAdd";
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
const IMAGE_OPTIONS_CONTROL_INSET = 8;
const IMAGE_OPTIONS_CONTROL_TOP_OFFSET = 8;
const IMAGE_OPTIONS_PANEL_WIDTH = 372;
const IMAGE_OPTIONS_PANEL_HEIGHT = 428;
const IMAGE_ALIGNMENT_MENU_WIDTH = 236;
const IMAGE_ALIGNMENT_MENU_HEIGHT = 240;
const IMAGE_RESIZE_HANDLE_WIDTH = 12;
const IMAGE_RESIZE_HANDLE_INSET = 6;
const BLOCK_ACTION_MENU_WIDTH = 182;
const BLOCK_ACTION_MENU_HEIGHT = 144;
const BLOCK_TURN_INTO_MENU_WIDTH = 198;
const BLOCK_MENU_ITEM_MIN_HEIGHT = 38;
const BLOCK_MENU_LIST_PADDING = 8;
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
  const isTopLevelBlock = selection.$from.depth === 1;
  const insertionContainerType = selection.$from.depth > 0 ? selection.$from.node(selection.$from.depth - 1).type.name : "doc";
  let isInsideAccordion = false;
  let isInsideAccordionContent = false;
  let isInsideCallout = false;
  let isInsideColumn = false;
  let isInsideTableCellOrHeader = false;
  for (let depth = selection.$from.depth; depth > 0; depth -= 1) {
    const nodeName = selection.$from.node(depth).type.name;
    if (nodeName === "accordion") {
      isInsideAccordion = true;
    }
    if (nodeName === "accordionContent") {
      isInsideAccordionContent = true;
    }
    if (nodeName === "callout") {
      isInsideCallout = true;
    }
    if (nodeName === "column") {
      isInsideColumn = true;
    }
    if (nodeName === "tableCell" || nodeName === "tableHeader") {
      isInsideTableCellOrHeader = true;
    }
  }

  return {
    insertionContainerType,
    isInsideAccordion,
    isInsideAccordionContent,
    isInsideCallout,
    isInsideColumn,
    isInsideTableCellOrHeader,
    isTopLevelBlock
  };
}

function isPositionInsideNodeType(doc: PMNode, position: number, nodeTypeName: string): boolean {
  const resolved = doc.resolve(Math.max(0, Math.min(position, doc.content.size)));
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    if (resolved.node(depth).type.name === nodeTypeName) {
      return true;
    }
  }
  return false;
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

function getTopLevelImageNodePositionFromDoc(doc: Editor["state"]["doc"], blockIndex: number): number | null {
  const node = getTopLevelBlockNodeFromDoc(doc, blockIndex);
  if (!node || node.type.name !== "image") {
    return null;
  }

  return getTopLevelBlockPositionFromDoc(doc, blockIndex);
}

function updateTopLevelImageAttrs(
  editor: Editor,
  blockIndex: number,
  updater: (attrs: DocseraImageAttrs) => DocseraImageAttrs
): boolean {
  const runtimeNode = getTopLevelBlockNodeFromDoc(editor.state.doc, blockIndex);
  if (!runtimeNode || runtimeNode.type.name !== "image") {
    return false;
  }

  const position = getTopLevelImageNodePositionFromDoc(editor.state.doc, blockIndex);
  if (position === null) {
    return false;
  }

  const liveAttrs = canonicalizeDocseraImageAttrs(runtimeNode.attrs);
  const nextAttrs = updater(liveAttrs);
  if (
    liveAttrs.mediaId === nextAttrs.mediaId &&
    liveAttrs.darkMediaId === nextAttrs.darkMediaId &&
    liveAttrs.alt === nextAttrs.alt &&
    liveAttrs.caption === nextAttrs.caption &&
    liveAttrs.frame === nextAttrs.frame &&
    liveAttrs.align === nextAttrs.align &&
    liveAttrs.widthPct === nextAttrs.widthPct
  ) {
    return false;
  }

  let didUpdate = false;
  editor
    .chain()
    .focus(undefined, { scrollIntoView: false })
    .command(({ tr, dispatch }) => {
      tr.setNodeMarkup(position, undefined, nextAttrs);
      dispatch?.(tr);
      didUpdate = true;
      return true;
    })
    .run();
  return didUpdate;
}

function getImageControlGroupRect(overlayRoot: HTMLElement, blockIndex: number): DOMRect | null {
  const trigger = overlayRoot.querySelector(
    `[data-docsera-image-controls="true"][data-docsera-image-controls-block-index="${blockIndex}"]`
  );
  if (!(trigger instanceof HTMLElement)) {
    return null;
  }

  return trigger.getBoundingClientRect();
}

function getImageControlButtonRect(overlayRoot: HTMLElement, blockIndex: number, kind: string): DOMRect | null {
  const trigger = overlayRoot.querySelector(
    `[data-docsera-image-control-kind="${kind}"][data-docsera-image-controls-block-index="${blockIndex}"]`
  );
  if (!(trigger instanceof HTMLElement)) {
    return null;
  }

  return trigger.getBoundingClientRect();
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
    case "accordion":
      return 3;
    case "blockquote":
      return 2;
    case "table":
      return 4;
    case "bulletList":
    case "orderedList":
    case "taskList":
      return 3;
    case "horizontalRule":
      return "continuation";
    default:
      return 1;
  }
}

function isTopLevelListBlock(
  node: Editor["state"]["doc"]["content"]["content"][number]
): boolean {
  return node.type.name === "bulletList" || node.type.name === "orderedList" || node.type.name === "taskList";
}

function canSafelyConvertTopLevelListToNonList(
  node: Editor["state"]["doc"]["content"]["content"][number]
): boolean {
  if (!isTopLevelListBlock(node) || node.childCount !== 1) {
    return false;
  }

  const listItem = node.firstChild;
  return listItem?.childCount === 1 && listItem.firstChild?.type.name === "paragraph";
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

  if (isTopLevelListBlock(node)) {
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

  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === "accordionTitle") {
      return null;
    }
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

function getBlockTurnIntoMenuHeight(commandCount: number): number {
  return Math.max(1, commandCount) * BLOCK_MENU_ITEM_MIN_HEIGHT + BLOCK_MENU_LIST_PADDING * 2;
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

function buildQuickAddSelectorSurfaceStyle(
  ownerDocument: Document,
  rect: DOMRect,
  width: number,
  height: number,
  placement: CommandSelectorPlacement
): CSSProperties {
  const clampedHeight = resolveConstrainedSurfaceHeight(ownerDocument, rect, height, placement);

  return {
    position: "fixed",
    ...clampSurfacePosition(ownerDocument, rect, width, clampedHeight, placement === "above"),
    maxHeight: `${clampedHeight}px`
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

function buildQuickAddSelectorAnchorRect(targetRect: DOMRect): DOMRect {
  const top = Math.max(VIEWPORT_GUTTER, targetRect.top + BLOCK_TARGET_TOP_OFFSET);
  return new DOMRect(targetRect.left, top, Math.max(1, targetRect.width), Math.max(1, targetRect.bottom - top));
}

function buildSlashSelectorAnchorRect(ownerBlockRect: DOMRect, caretRect: DOMRect): DOMRect {
  return new DOMRect(
    ownerBlockRect.left,
    caretRect.top,
    Math.max(1, ownerBlockRect.width),
    Math.max(1, caretRect.height)
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

function buildImageOptionsControlGroupStyle(anchorRect: DOMRect): CSSProperties {
  return {
    position: "fixed",
    left: `${Math.max(VIEWPORT_GUTTER, anchorRect.right - IMAGE_OPTIONS_CONTROL_INSET)}px`,
    top: `${Math.max(VIEWPORT_GUTTER, anchorRect.top + IMAGE_OPTIONS_CONTROL_TOP_OFFSET)}px`,
    transform: "translateX(-100%)"
  };
}

function buildImagePreviewControlGroupStyle(anchorRect: DOMRect): CSSProperties {
  return {
    position: "fixed",
    left: `${Math.max(VIEWPORT_GUTTER, anchorRect.left + IMAGE_OPTIONS_CONTROL_INSET)}px`,
    top: `${Math.max(VIEWPORT_GUTTER, anchorRect.top + IMAGE_OPTIONS_CONTROL_TOP_OFFSET)}px`
  };
}

function buildImageResizeHandleStyle(anchorRect: DOMRect, edge: "left" | "right"): CSSProperties {
  return {
    position: "fixed",
    left:
      edge === "left"
        ? `${Math.max(VIEWPORT_GUTTER, anchorRect.left - IMAGE_RESIZE_HANDLE_INSET)}px`
        : `${Math.max(VIEWPORT_GUTTER, anchorRect.right - IMAGE_RESIZE_HANDLE_WIDTH + IMAGE_RESIZE_HANDLE_INSET)}px`,
    top: `${anchorRect.top}px`,
    width: `${IMAGE_RESIZE_HANDLE_WIDTH}px`,
    height: `${Math.max(1, anchorRect.height)}px`
  };
}

function getImageFigureRect(editor: Editor, blockIndex: number): DOMRect | null {
  const element = getTopLevelBlockElement(editor, blockIndex);
  if (!element) {
    return null;
  }

  return element.getBoundingClientRect();
}

function getImageOptionsControlGroupRect(overlayRoot: HTMLElement, blockIndex: number): DOMRect | null {
  const trigger = overlayRoot.querySelector(
    `[data-docsera-image-controls="true"][data-docsera-image-controls-block-index="${blockIndex}"]`
  );
  if (!(trigger instanceof HTMLElement)) {
    return null;
  }

  return trigger.getBoundingClientRect();
}

function buildImageOptionsPanelStyle(
  ownerDocument: Document,
  rect: DOMRect,
  placement: CommandSelectorPlacement
): CSSProperties {
  const ownerWindow = ownerDocument.defaultView;
  const viewportWidth = ownerWindow?.innerWidth ?? ownerDocument.documentElement.clientWidth;
  const viewportHeight = ownerWindow?.innerHeight ?? ownerDocument.documentElement.clientHeight;
  const maxSurfaceWidth = Math.max(1, viewportWidth - VIEWPORT_GUTTER * 2);
  const clampedWidth = Math.max(1, Math.min(IMAGE_OPTIONS_PANEL_WIDTH, maxSurfaceWidth));
  const clampedHeight = resolveConstrainedSurfaceHeight(ownerDocument, rect, IMAGE_OPTIONS_PANEL_HEIGHT, placement);
  const preferredLeft = rect.right - clampedWidth;
  const left = Math.min(
    Math.max(VIEWPORT_GUTTER, preferredLeft),
    Math.max(VIEWPORT_GUTTER, viewportWidth - clampedWidth - VIEWPORT_GUTTER)
  );
  const preferredTop = placement === "above" ? rect.top - clampedHeight - POPOVER_GAP : rect.bottom + POPOVER_GAP;
  const top = Math.min(
    Math.max(VIEWPORT_GUTTER, preferredTop),
    Math.max(VIEWPORT_GUTTER, viewportHeight - clampedHeight - VIEWPORT_GUTTER)
  );

  return {
    position: "fixed",
    left: `${left}px`,
    top: `${top}px`,
    width: `${clampedWidth}px`,
    maxWidth: `${maxSurfaceWidth}px`,
    maxHeight: `${clampedHeight}px`
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
    height: `${clampedHeight}px`,
    maxHeight: `${clampedHeight}px`
  };
}

function buildBlockActionMenuAnchorRect(targetRect: DOMRect): DOMRect {
  const anchorRect = buildQuickAddAnchorRect(targetRect);
  return new DOMRect(
    anchorRect.left + QUICK_ADD_BUTTON_SIZE + BLOCK_HANDLE_BUTTON_GAP,
    anchorRect.top,
    QUICK_ADD_BUTTON_SIZE,
    QUICK_ADD_BUTTON_SIZE
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
  if (element.classList.contains("docsera-editor-columns")) {
    return "Columns";
  }

  if (element.classList.contains("docsera-editor-accordion")) {
    return "Accordion";
  }

  if (element.classList.contains("docsera-editor-callout")) {
    return "Callout";
  }

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

function isPointInsideHorizontalBounds(rect: DOMRect | null | undefined, clientX: number): boolean {
  return Boolean(rect && clientX >= rect.left && clientX <= rect.right);
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
    case "accordion":
      return 3;
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
    case "taskList":
      return <ListChecks size={16} strokeWidth={2} />;
    case "blockquote":
      return <Quote size={16} strokeWidth={2} />;
    case "accordion":
      return <ChevronDown size={16} strokeWidth={2} />;
    case "callout":
      return <CircleAlert size={16} strokeWidth={2} />;
    case "columns2":
      return (
        <svg aria-hidden="true" fill="currentColor" focusable="false" height="16" viewBox="0 0 16 16" width="16">
          <rect height="12" rx="1.25" width="6.25" x="0" y="2" />
          <rect height="12" rx="1.25" width="6.25" x="9.75" y="2" />
        </svg>
      );
    case "columns3":
      return (
        <svg aria-hidden="true" fill="currentColor" focusable="false" height="16" viewBox="0 0 16 16" width="16">
          <rect height="12" rx="1.25" width="3.67" x="0" y="2" />
          <rect height="12" rx="1.25" width="3.67" x="6.17" y="2" />
          <rect height="12" rx="1.25" width="3.67" x="12.33" y="2" />
        </svg>
      );
    case "columns4":
      return (
        <svg aria-hidden="true" fill="currentColor" focusable="false" height="16" viewBox="0 0 16 16" width="16">
          <rect height="12" rx="1.25" width="2.25" x="0" y="2" />
          <rect height="12" rx="1.25" width="2.25" x="4.58" y="2" />
          <rect height="12" rx="1.25" width="2.25" x="9.17" y="2" />
          <rect height="12" rx="1.25" width="2.25" x="13.75" y="2" />
        </svg>
      );
    case "horizontalRule":
      return <Minus size={16} strokeWidth={2} />;
    case "table":
      return <Table2 size={16} strokeWidth={2} />;
    case "image":
      return <Image size={16} strokeWidth={2} />;
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

function applySlashCommand(
  editor: Editor,
  selector: Extract<CommandSelectorState, { source: "slash" }>,
  command: EditorBlockCommand
): boolean {
  editor.commands.focus(undefined, { scrollIntoView: false });
  if (
    command.id === "accordion" ||
    command.id === "callout" ||
    command.id === "columns2" ||
    command.id === "columns3" ||
    command.id === "columns4"
  ) {
    const content = getEditorBlockCommandQuickAddContent(command);
    return replaceEmptySlashOwnerParagraphWithCommandOutput(
      editor,
      selector,
      content,
      command.quickAdd.selectionOffset
    );
  }
  if (
    command.id === "horizontalRule" &&
    (selector.surfaceContext.isInsideColumn || selector.surfaceContext.isInsideAccordionContent)
  ) {
    return replaceEmptySlashOwnerParagraphWithCommandOutput(
      editor,
      selector,
      [{ type: "horizontalRule" }],
      "node"
    );
  }
  applyBlockCommand(editor, command);
  const topLevelOwnerPos = getTopLevelBlockPositionFromDoc(editor.state.doc, selector.ownerBlockIndex);
  if (topLevelOwnerPos !== selector.ownerPos) {
    return true;
  }

  // Block conversion has completed even if restoring the command-specific
  // caret cannot resolve. Selector lifecycle must not depend on this best-
  // effort selection refinement.
  applyCommandSelectionOffset(editor, selector.ownerBlockIndex, command.slashSelectionOffset);
  return true;
}

const TURN_INTO_EDITOR_BLOCK_COMMAND_IDS = [
  "text",
  "heading1",
  "heading2",
  "heading3",
  "blockquote",
  "bulletedList",
  "numberedList",
  "taskList"
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
    case "accordion":
      return "accordion";
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
    case "taskList":
      return "taskList";
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
    case "accordion":
      return "Accordion";
    case "callout":
      return "Callout";
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
    case "taskList":
      return "Task List";
    case "blockquote":
      return "Blockquote";
    case "columns2":
    case "columns3":
    case "columns4":
      return "Columns";
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

  if (isTopLevelListBlock(node) && !canSafelyConvertTopLevelListToNonList(node)) {
    return TURN_INTO_EDITOR_BLOCK_COMMANDS.filter(
      (command) => command.id === "bulletedList" || command.id === "numberedList" || command.id === "taskList"
    );
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

  entries.push({
    kind: "duplicate"
  });

  entries.push({
    kind: "delete"
  });

  return entries;
}

function createConvertedTopLevelBlockNode(
  editor: Editor,
  sourceNode: Editor["state"]["doc"]["content"]["content"][number],
  targetCommandId: TurnIntoEditorBlockCommandId
): Editor["state"]["doc"]["content"]["content"][number] | null {
  if (isTopLevelListBlock(sourceNode)) {
    if (targetCommandId === "bulletedList" || targetCommandId === "numberedList" || targetCommandId === "taskList") {
      const targetListType =
        targetCommandId === "bulletedList"
          ? editor.schema.nodes.bulletList
          : targetCommandId === "numberedList"
            ? editor.schema.nodes.orderedList
            : editor.schema.nodes.taskList;
      const targetItemType = targetCommandId === "taskList" ? editor.schema.nodes.taskItem : editor.schema.nodes.listItem;
      const targetItemAttrs = targetCommandId === "taskList" ? { checked: false } : null;
      const items: PMNode[] = [];
      sourceNode.forEach((item) => {
        items.push(targetItemType.create(targetItemAttrs, item.content));
      });
      return targetListType.create(null, items);
    }

    if (!canSafelyConvertTopLevelListToNonList(sourceNode)) {
      return null;
    }
  }

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
    case "taskList":
      return editor.schema.nodes.taskList.create(
        null,
        editor.schema.nodes.taskItem.create({ checked: false }, editor.schema.nodes.paragraph.create(null, inlineContent))
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

  const sourceJson = sourceNode.toJSON() as JSONContent;
  const duplicateNode = editor.schema.nodeFromJSON(
    sourceNode.type.name === "accordion" ? regenerateAccordionJsonIdentities(sourceJson) : sourceJson
  );
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
  return replaceEmptyParagraphWithCommandOutput(editor, blockIndex, createBlockquoteCommandOutput(), 2);
}

function createBlockquoteCommandOutput(): JSONContent[] {
  return [
    {
      type: "blockquote",
      content: [{ type: "paragraph" }]
    }
  ];
}

function replaceEmptySlashOwnerParagraphWithCommandOutput(
  editor: Editor,
  selector: Extract<CommandSelectorState, { source: "slash" }>,
  content: JSONContent[],
  selectionOffset: number | "continuation" | "node" | undefined
): boolean {
  editor.view.dispatch(closeHistory(editor.state.tr));
  return replaceEmptyParagraphAtPositionWithCommandOutput(editor, selector.ownerPos, content, selectionOffset);
}

function replaceEmptyParagraphAtPositionWithCommandOutput(
  editor: Editor,
  nodePos: number,
  content: JSONContent[],
  selectionOffset: number | "continuation" | "node" | undefined
): boolean {
  const targetNode = editor.state.doc.nodeAt(nodePos);
  if (
    !targetNode ||
    targetNode.type.name !== "paragraph" ||
    targetNode.content.size !== 0 ||
    selectionOffset === undefined
  ) {
    return false;
  }

  const nextNodes = content.map((node) => editor.schema.nodeFromJSON(node));

  let transaction = editor.state.tr.replaceWith(nodePos, nodePos + targetNode.nodeSize, Fragment.fromArray(nextNodes));
  const accordionDisclosure = getInitialAccordionDisclosure(content);
  if (accordionDisclosure) {
    transaction = transaction.setMeta(DOCSERA_ACCORDION_DISCLOSURE_PLUGIN_KEY, accordionDisclosure);
  }
  if (selectionOffset !== "continuation") {
    transaction = transaction.setMeta(TIPTAP_SKIP_TRAILING_NODE_META, true);
  }

  if (selectionOffset === "node") {
    try {
      transaction = transaction.setSelection(NodeSelection.create(transaction.doc, nodePos));
    } catch {
      const nearbyAnchor = Math.min(nodePos + nextNodes[0].nodeSize, Math.max(1, transaction.doc.content.size));
      try {
        transaction = transaction.setSelection(Selection.near(transaction.doc.resolve(nearbyAnchor), 1));
      } catch {
        return false;
      }
    }
    editor.view.dispatch(transaction);
    return true;
  }

  if (selectionOffset === "continuation") {
    const continuationAnchor = Math.min(nodePos + nextNodes[0].nodeSize + 1, Math.max(1, transaction.doc.content.size));
    try {
      transaction = transaction.setSelection(TextSelection.create(transaction.doc, continuationAnchor));
    } catch {
      transaction = transaction.setSelection(Selection.near(transaction.doc.resolve(continuationAnchor), 1));
    }
  } else {
    const selectionAnchor = Math.min(nodePos + selectionOffset, Math.max(1, transaction.doc.content.size));
    try {
      transaction = transaction.setSelection(TextSelection.create(transaction.doc, selectionAnchor));
    } catch {
      transaction = transaction.setSelection(Selection.near(transaction.doc.resolve(selectionAnchor), 1));
    }
  }

  editor.view.dispatch(transaction);
  return true;
}

function getInitialAccordionDisclosure(content: JSONContent[]): { accordionId: string; itemId: string } | null {
  const accordion = content.find((node) => node.type === "accordion");
  if (!accordion || !Array.isArray(accordion.content)) {
    return null;
  }

  const accordionId = typeof accordion.attrs?.accordionId === "string" ? accordion.attrs.accordionId.trim() : "";
  const firstItem = accordion.content.find((node) => node.type === "accordionItem");
  const itemId = typeof firstItem?.attrs?.accordionItemId === "string" ? firstItem.attrs.accordionItemId.trim() : "";
  return accordionId && itemId ? { accordionId, itemId } : null;
}

function replaceEmptySlashOwnerParagraphWithBlockquote(
  editor: Editor,
  selector: Extract<CommandSelectorState, { source: "slash" }>
): boolean {
  editor.view.dispatch(closeHistory(editor.state.tr));
  return replaceEmptyParagraphAtPositionWithCommandOutput(editor, selector.ownerPos, createBlockquoteCommandOutput(), 2);
}

function replaceEmptyParagraphWithCommandOutput(
  editor: Editor,
  blockIndex: number,
  content: JSONContent[],
  selectionOffset: number | "continuation" | undefined
): boolean {
  const blockRange = getTopLevelBlockRange(editor, blockIndex);
  if (!blockRange) {
    return false;
  }

  return replaceEmptyParagraphAtPositionWithCommandOutput(editor, blockRange.from, content, selectionOffset);
}

function createCanonicalImageNodeJson(mediaId: string): JSONContent {
  return {
    type: "image",
    attrs: {
      mediaId,
      darkMediaId: null,
      alt: "",
      caption: "",
      frame: true,
      align: "left",
      widthPct: 100
    }
  };
}

function replaceEmptyParagraphWithCanonicalImage(
  editor: Editor,
  blockIndex: number,
  mediaId: string
): boolean {
  const blockRange = getTopLevelBlockRange(editor, blockIndex);
  if (!blockRange) {
    return false;
  }

  return replaceEmptyParagraphWithCanonicalImageInRange(editor, blockRange.from, blockRange.to, mediaId);
}

function replaceEmptyParagraphWithCanonicalImageInRange(
  editor: Editor,
  from: number,
  to: number,
  mediaId: string
): boolean {
  const targetNode = editor.state.doc.nodeAt(from);
  if (!targetNode || targetNode.type.name !== "paragraph" || targetNode.content.size !== 0) {
    return false;
  }

  return replaceEmptyParagraphAtPositionWithCommandOutput(
    editor,
    from,
    [createCanonicalImageNodeJson(mediaId)],
    "node"
  );
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

function resolveTopLevelCaretIntentPosition(editor: Editor, blockIndex: number): number | null {
  const blockRange = getTopLevelBlockRange(editor, blockIndex);
  const node = getTopLevelBlockNodeFromDoc(editor.state.doc, blockIndex);
  const selectionOffset = node ? getTopLevelCaretSelectionOffset(node) : null;
  if (!blockRange || selectionOffset === null || editor.isDestroyed) {
    return null;
  }

  return Math.min(blockRange.from + selectionOffset, Math.max(1, editor.state.doc.content.size));
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
  return replaceEmptyParagraphWithCommandOutput(
    editor,
    blockIndex,
    getEditorBlockCommandQuickAddContent(command),
    command.quickAdd.selectionOffset
  );
}

function regenerateAccordionJsonIdentities(node: JSONContent): JSONContent {
  const nextNode: JSONContent = {
    ...node,
    attrs: node.attrs ? { ...node.attrs } : node.attrs,
    content: Array.isArray(node.content) ? node.content.map((child) => regenerateAccordionJsonIdentities(child)) : node.content
  };

  if (nextNode.type === "accordion") {
    nextNode.attrs = {
      ...(nextNode.attrs ?? {}),
      accordionId: createAccordionIdentity("accordion")
    };
  }

  if (nextNode.type === "accordionItem") {
    nextNode.attrs = {
      ...(nextNode.attrs ?? {}),
      accordionItemId: createAccordionIdentity("accordion-item")
    };
  }

  return nextNode;
}

function regenerateAccordionPastedNodeIdentities(node: PMNode): PMNode {
  const nextContent = node.content.size ? regenerateAccordionPastedFragmentIdentities(node.content) : node.content;

  if (node.type.name === "accordion") {
    return node.type.create(
      {
        ...node.attrs,
        accordionId: createAccordionIdentity("accordion")
      },
      nextContent,
      node.marks
    );
  }

  if (node.type.name === "accordionItem") {
    return node.type.create(
      {
        ...node.attrs,
        accordionItemId: createAccordionIdentity("accordion-item")
      },
      nextContent,
      node.marks
    );
  }

  return node.copy(nextContent);
}

function regenerateAccordionPastedFragmentIdentities(fragment: Fragment): Fragment {
  const nextChildren: PMNode[] = [];
  fragment.forEach((child) => {
    nextChildren.push(regenerateAccordionPastedNodeIdentities(child));
  });
  return Fragment.fromArray(nextChildren);
}

export function regenerateAccordionPastedSliceIdentities(slice: Slice): Slice {
  return new Slice(regenerateAccordionPastedFragmentIdentities(slice.content), slice.openStart, slice.openEnd);
}

export function transformAccordionPastedSliceIdentities(
  slice: Slice,
  view?: { dragging: { move: boolean } | null } | null
): Slice {
  return view?.dragging?.move === true ? slice : regenerateAccordionPastedSliceIdentities(slice);
}

const CALLOUT_PASTE_DISALLOWED_NODE_TYPES = new Set(["image", "table", "accordion", "columns", "callout"]);

function removeUnsupportedCalloutPastedNode(node: PMNode): PMNode | null {
  if (CALLOUT_PASTE_DISALLOWED_NODE_TYPES.has(node.type.name)) {
    return null;
  }

  if (!node.content.size) {
    return node;
  }

  const nextChildren: PMNode[] = [];
  node.content.forEach((child) => {
    const nextChild = removeUnsupportedCalloutPastedNode(child);
    if (nextChild) {
      nextChildren.push(nextChild);
    }
  });

  const nextContent = Fragment.fromArray(nextChildren);
  if (!node.type.validContent(nextContent)) {
    return null;
  }

  return node.copy(nextContent);
}

function removeUnsupportedCalloutPastedContent(slice: Slice, view: Editor["view"]): Slice {
  if (!isPositionInsideNodeType(view.state.doc, view.state.selection.from, "callout")) {
    return slice;
  }

  const nextChildren: PMNode[] = [];
  slice.content.forEach((node) => {
    const nextNode = removeUnsupportedCalloutPastedNode(node);
    if (nextNode) {
      nextChildren.push(nextNode);
    }
  });

  return new Slice(Fragment.fromArray(nextChildren), slice.openStart, slice.openEnd);
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

function getCurrentEnvelope(editor: Editor): DocseraDocumentEnvelope {
  return createEnvelope(editor.getJSON() as DocseraTiptapDocument);
}

function replaceEditorDocument(editor: Editor, envelope: DocseraDocumentEnvelope): PageEditorCanonicalHandoffResult {
  const parsedEnvelope = parseDocseraDocumentOrThrow(envelope);
  const nextDocumentKey = serializeDocument(parsedEnvelope.document);
  const currentDocumentKey = serializeDocument(editor.getJSON() as DocseraTiptapDocument);
  if (currentDocumentKey === nextDocumentKey) {
    return { kind: "unchanged", nextEnvelope: parsedEnvelope };
  }

  const nextDocument = editor.state.schema.nodeFromJSON(parsedEnvelope.document);
  let transaction = editor.state.tr
    .replaceWith(0, editor.state.doc.content.size, nextDocument.content)
    .setMeta("addToHistory", false);
  try {
    transaction = transaction.setSelection(Selection.atStart(transaction.doc));
  } catch {
    // Leave the mapped selection in place when the replacement cannot resolve
    // a stable start selection.
  }

  editor.view.dispatch(closeHistory(transaction));
  return { kind: "applied", nextEnvelope: parsedEnvelope };
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

function isEndOfPageInsertionPoint(editor: Editor, surfaceElement: HTMLElement, clientX: number, clientY: number): boolean {
  if (!(editor.view.dom instanceof HTMLElement)) {
    return false;
  }

  const classification = resolvePanelPointerClassification(editor, surfaceElement, clientX, clientY);
  if (classification.zone !== "panel-background") {
    return false;
  }

  const { laneRect } = resolveEditorLaneGeometry(surfaceElement, editor.view.dom);
  if (!isPointInsideHorizontalBounds(laneRect, clientX)) {
    return false;
  }

  const entries = getTopLevelBlockEntries(editor);
  const finalEntry = entries[entries.length - 1] ?? null;
  return finalEntry ? clientY >= finalEntry.rect.bottom : true;
}

function focusOrAppendEditableFinalParagraph(editor: Editor): boolean {
  const lastChild = editor.state.doc.lastChild;
  if (lastChild?.type.name === "paragraph" && lastChild.content.size === 0) {
    const focused = editor.commands.focus("end", { scrollIntoView: false });
    editor.view.focus();
    return focused;
  }

  const inserted = editor
    .chain()
    .insertContentAt(editor.state.doc.content.size, { type: "paragraph" })
    .focus("end", { scrollIntoView: false })
    .run();
  editor.view.focus();
  return inserted;
}

function trySetEditorTabIndex(editor: Editor, isEditable: boolean): boolean {
  try {
    editor.view.dom.tabIndex = isEditable ? 0 : -1;
    return true;
  } catch {
    return false;
  }
}

function exposeEditableDiagnostics(editor: Editor, input: { canEdit: boolean; interactionActive: boolean }): void {
  if (!(globalThis as { __DOCSERA_EDITOR_DIAGNOSTICS__?: boolean }).__DOCSERA_EDITOR_DIAGNOSTICS__) {
    return;
  }

  try {
    Object.defineProperty(editor.view.dom, "__docseraEditableState", {
      configurable: true,
      value: () => ({
        canEdit: input.canEdit,
        domContentEditable: editor.view.dom.contentEditable,
        editorIsEditable: editor.isEditable,
        interactionActive: input.interactionActive,
        optionsEditable: editor.options.editable,
        viewEditable: editor.view.editable
      })
    });
  } catch {
    // Diagnostics are best-effort and must not affect authoring.
  }
}

export function PageEditorHostRuntime({
  canEdit,
  interactionActive = true,
  initialEnvelope,
  initialSavedEnvelope,
  initialRevision,
  onAccessLost,
  onOutlineChange,
  onSaveDraft,
  onEditorReady,
  onEditorCommandTargetChange,
  onStatusChange,
  mediaAdapter,
  historyControlsMount,
  overlayRoot,
  pageSysId,
  sessionKey = "",
  theme
}: PageEditorHostRuntimeProps) {
  const [errorMessage, setErrorMessage] = useState("");
  const [hoverTarget, setHoverTarget] = useState<HoverTarget | null>(null);
  const [commandSelector, setCommandSelector] = useState<CommandSelectorState | null>(null);
  const [imagePickerSession, setImagePickerSession] = useState<ImagePickerSessionState | null>(null);
  const [imageOptionsSession, setImageOptionsSession] = useState<ImageOptionsSessionState | null>(null);
  const [imageAlignmentMenu, setImageAlignmentMenu] = useState<ImageAlignmentMenuState | null>(null);
  const [imageAlignmentPickerMenu, setImageAlignmentPickerMenu] = useState<ImageAlignmentPickerMenuState | null>(null);
  const [imageResizeSession, setImageResizeSession] = useState<ImageResizeSessionState | null>(null);
  const [imageFullscreenSession, setImageFullscreenSession] = useState<ImageFullscreenViewerSession | null>(null);
  const [imageFullscreenOpen, setImageFullscreenOpen] = useState(false);
  const [imageDisplayState, setImageDisplayState] = useState(() => getDocseraImageDisplayState());
  const [blockActionMenu, setBlockActionMenu] = useState<BlockActionMenuState | null>(null);
  const [blockTurnIntoMenu, setBlockTurnIntoMenu] = useState<BlockTurnIntoMenuState | null>(null);
  const [gutterTooltip, setGutterTooltip] = useState<GutterTooltipState | null>(null);
  const [selectorScrollMetrics, setSelectorScrollMetrics] = useState({ hasOverflow: false, scrollbarWidth: 0 });
  const [overlayMeasurementVersion, setOverlayMeasurementVersion] = useState(0);
  const selectorListboxId = useId();
  const selectorQueryStateId = useId();
  const blockActionMenuId = useId();
  const blockTurnIntoMenuId = useId();
  const imageOptionsPanelId = useId();
  const imageAlignmentMenuId = useId();
  const imageAlignmentPickerMenuId = useId();
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
  const commandSelectorItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const imagePickerSessionRef = useRef<ImagePickerSessionState | null>(null);
  const imagePickerSessionCounterRef = useRef(0);
  const imageOptionsSessionRef = useRef<ImageOptionsSessionState | null>(null);
  const imageOptionsSessionCounterRef = useRef(0);
  const imageAlignmentMenuRef = useRef<ImageAlignmentMenuState | null>(null);
  const imageAlignmentMenuCounterRef = useRef(0);
  const imageAlignmentPickerMenuRef = useRef<ImageAlignmentPickerMenuState | null>(null);
  const imageAlignmentPickerMenuCounterRef = useRef(0);
  const imageResizeSessionRef = useRef<ImageResizeSessionState | null>(null);
  const imageResizeSessionCounterRef = useRef(0);
  const imageResizeCleanupRef = useRef<(() => void) | null>(null);
  const blockActionMenuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const blockTurnIntoMenuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const blockTurnIntoTriggerRef = useRef<HTMLButtonElement | null>(null);
  const blockActionMenuSurfaceRef = useRef<HTMLDivElement | null>(null);
  const gutterTooltipRef = useRef<HTMLDivElement | null>(null);
  const gutterTooltipTimerRef = useRef<number | null>(null);
  const imageAlignmentMenuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const imageAlignmentPickerMenuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const structuredTableClipboardRef = useRef<StructuredTableClipboardPayload | null>(null);
  const taskProgressStorageKeyRef = useRef("");
  const taskProgressRef = useRef<Record<string, boolean>>({});
  const getTaskProgress = useCallback((documentNode: PMNode, position: number) => {
    const ordinal = getTaskItemOrdinal(documentNode, position);
    if (ordinal === null) {
      return false;
    }
    const document = documentNode.toJSON() as JSONContent;
    const storageKey = getTaskListProgressStorageKey(pageSysId, document);
    if (taskProgressStorageKeyRef.current !== storageKey) {
      taskProgressStorageKeyRef.current = storageKey;
      taskProgressRef.current = readTaskListProgress(pageSysId, document);
    }
    return taskProgressRef.current[String(ordinal)] === true;
  }, [pageSysId]);
  const setTaskProgress = useCallback((documentNode: PMNode, position: number, checked: boolean) => {
    const ordinal = getTaskItemOrdinal(documentNode, position);
    if (ordinal === null) {
      return;
    }
    const document = documentNode.toJSON() as JSONContent;
    const storageKey = getTaskListProgressStorageKey(pageSysId, document);
    if (taskProgressStorageKeyRef.current !== storageKey) {
      taskProgressStorageKeyRef.current = storageKey;
      taskProgressRef.current = readTaskListProgress(pageSysId, document);
    }
    taskProgressRef.current = { ...taskProgressRef.current, [String(ordinal)]: checked };
    writeTaskListProgress(pageSysId, document, taskProgressRef.current);
  }, [pageSysId]);
  const editorExtensions = useMemo(
    () => [
      ...createDocseraEditorExtensionsWithOptions({
        loadMedia: mediaAdapter?.load,
        taskItemProgress: {
          getChecked: ({ document, position }) => getTaskProgress(document, position),
          setChecked: ({ checked, document, position }) => setTaskProgress(document, position, checked)
        }
      }),
      createCommandQueryPresentationExtension(),
      createBlockSelectionExtension()
    ],
    [getTaskProgress, mediaAdapter, setTaskProgress]
  );
  const editorCoreExtensionOptions = useMemo(
    () => ({
      tabindex: {
        value: canEdit && interactionActive ? undefined : "-1"
      }
    }),
    [canEdit, interactionActive]
  );

  const handleStructuredTableClipboardCopy = useCallback(
    (payload: { cells: JSONContent[][]; kind: "column" | "row" }) => {
      const nextPayload = createStructuredTableClipboardPayload(payload.kind, payload.cells);
      structuredTableClipboardRef.current = nextPayload;

      const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
      if (!clipboard) {
        return;
      }

      void (async () => {
        if (typeof clipboard.write === "function" && typeof ClipboardItem === "function") {
          try {
            await clipboard.write([new ClipboardItem(createStructuredTableClipboardItemData(nextPayload))]);
            return;
          } catch {
            // Fall back to the plain-text clipboard path when structured clipboard writing is unavailable.
          }
        }

        if (typeof clipboard.writeText === "function") {
          await clipboard.writeText(nextPayload.clipboardText).catch(() => undefined);
        }
      })();
    },
    []
  );

  const editorProps = useMemo(
    () => ({
      transformPastedHTML: sanitizeDocseraPastedHTML,
      transformPastedText: sanitizeDocseraPastedText,
      transformPasted: (slice: Slice, view: Editor["view"]) =>
        removeUnsupportedCalloutPastedContent(transformAccordionPastedSliceIdentities(slice, view), view),
      handleDOMEvents: {
        paste: (view: Editor["view"], event: ClipboardEvent) => {
          if (!editorRef.current || !editableRef.current) {
            return false;
          }

          const clipboardPayload = structuredTableClipboardRef.current;
          if (!clipboardPayload) {
            return false;
          }

          if (!isFreshStructuredTableClipboardPayload(clipboardPayload)) {
            structuredTableClipboardRef.current = null;
            return false;
          }

          if (!doesStructuredTableClipboardDataMatchPayload(event.clipboardData, clipboardPayload)) {
            return false;
          }

          if (!tryApplyStructuredTableClipboardPaste(view, clipboardPayload)) {
            return false;
          }

          event.preventDefault();
          return true;
        }
      },
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

        const accordionSelectionContext = getAccordionSelectionContext(runtimeEditor.state);
        if (
          accordionSelectionContext &&
          accordionSelectionContext.selectionRegion === "title" &&
          event.key === "Enter" &&
          !event.shiftKey &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey
        ) {
          event.preventDefault();
          const bodySelectionPos = accordionSelectionContext.bodyStartPos + 2;
          let transaction = runtimeEditor.state.tr
            .setMeta(DOCSERA_ACCORDION_DISCLOSURE_PLUGIN_KEY, {
              accordionId: accordionSelectionContext.accordionId,
              itemId: accordionSelectionContext.itemId
            })
            .setMeta("addToHistory", false);

          try {
            transaction = transaction.setSelection(Selection.near(transaction.doc.resolve(bodySelectionPos), 1));
          } catch {
            // Keep the disclosure state change even if the body selection cannot be resolved.
          }

          runtimeEditor.view.dispatch(transaction);
          runtimeEditor.view.focus();
          return true;
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
    [canEdit, interactionActive]
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
  const reconciliationVersionRef = useRef(0);
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
    endOfPageInsertionCandidate: boolean;
    lastClientX: number;
    lastClientY: number;
    pointerId: number;
    startClientX: number;
    startClientY: number;
  } | null>(null);
  const gutterRangeGestureCleanupRef = useRef<(() => void) | null>(null);
  const caretStripTextGestureRef = useRef<{ anchor: number; hasMoved: boolean; pointerId: number } | null>(null);
  const caretStripTextGestureCleanupRef = useRef<(() => void) | null>(null);
  const gutterRangeAutoScrollRef = useRef<ReturnType<typeof createEditorAutoScrollSession> | null>(null);
  const gutterRangeClickSuppressionReleaseTimerRef = useRef<number | null>(null);
  const suppressSurfaceClickUntilPointerUpRef = useRef(false);
  const panelCursorZoneRef = useRef<PanelPointerZone | null>(null);
  const overlayMeasurementFrameRef = useRef<number | null>(null);
  const onEditorReadyRef = useRef(onEditorReady);
  const onOutlineChangeRef = useRef(onOutlineChange);
  const activeRangeMarqueeRectRef = useRef<DOMRect | null>(null);
  const clearGutterRangeGestureUnmountRef = useRef<((options?: { clearSelection?: boolean; reason?: string; releaseClickSuppression?: boolean }) => void) | null>(null);
  const clearCaretStripTextGestureUnmountRef = useRef<(() => void) | null>(null);
  const clearSurfaceClickSuppressionReleaseTimerUnmountRef = useRef<(() => void) | null>(null);
  const clearTransientBlockSelectionUnmountRef = useRef<((reason?: string) => void) | null>(null);
  const isEditable = canEdit;
  const isInteractionActive = interactionActive && isEditable;
  editableRef.current = isEditable;
  const overlayOwnerDocument = overlayRoot.ownerDocument;
  const overlayOwnerWindow = overlayOwnerDocument.defaultView;
  const clearGutterTooltip = useCallback(() => {
    if (gutterTooltipTimerRef.current !== null) {
      overlayOwnerWindow?.clearTimeout(gutterTooltipTimerRef.current);
      gutterTooltipTimerRef.current = null;
    }
    setGutterTooltip(null);
  }, [overlayOwnerWindow]);
  useEffect(() => {
    setDocseraImageDisplayTheme(theme);
  }, [theme]);
  useEffect(() => () => {
    clearGutterTooltip();
  }, [clearGutterTooltip]);
  useEffect(
    () => () => {
      resetDocseraImageDisplayState();
    },
    []
  );
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

  const closeImagePicker = useCallback(
    (options: { restoreSelection?: boolean } = {}) => {
      const { restoreSelection = true } = options;
      const session = imagePickerSessionRef.current;
      imagePickerSessionRef.current = null;
      setImagePickerSession(null);
      if (!restoreSelection || !session) {
        return;
      }

      const runtimeEditor = editorRef.current;
      if (!runtimeEditor || runtimeEditor.isDestroyed) {
        return;
      }

      restoreEditorSelectionFocus(runtimeEditor, session.restoreSelectionPos);
    },
    []
  );

  const closeImageOptions = useCallback(
    (options: { focusEditor?: boolean } = {}) => {
      const { focusEditor = true } = options;
      imageOptionsSessionRef.current = null;
      setImageOptionsSession(null);
      if (!focusEditor) {
        return;
      }

      const runtimeEditor = editorRef.current;
      if (runtimeEditor && !runtimeEditor.isDestroyed) {
        runtimeEditor.view.focus();
      }
    },
    []
  );

  const closeImageAlignmentMenu = useCallback(
    (options: { clearPickerMenu?: boolean; focusEditor?: boolean } = {}) => {
      const { clearPickerMenu = true, focusEditor = true } = options;
      imageAlignmentMenuRef.current = null;
      setImageAlignmentMenu(null);
      if (clearPickerMenu) {
        imageAlignmentPickerMenuRef.current = null;
        setImageAlignmentPickerMenu(null);
      }
      if (!focusEditor) {
        return;
      }

      const runtimeEditor = editorRef.current;
      if (runtimeEditor && !runtimeEditor.isDestroyed) {
        runtimeEditor.view.focus();
      }
    },
    []
  );

  const closeImageAlignmentPickerMenu = useCallback(
    (options: { focusEditor?: boolean } = {}) => {
      const { focusEditor = true } = options;
      imageAlignmentPickerMenuRef.current = null;
      setImageAlignmentPickerMenu(null);
      if (!focusEditor) {
        return;
      }

      const runtimeEditor = editorRef.current;
      if (runtimeEditor && !runtimeEditor.isDestroyed) {
        runtimeEditor.view.focus();
      }
    },
    []
  );

  const openImagePicker = useCallback(
    (selector: CommandSelectorState) => {
      const runtimeEditor = editorRef.current;
      if (!runtimeEditor || runtimeEditor.isDestroyed) {
        return;
      }

      const nextSession: ImagePickerSessionState = {
        historyTime: selector.source === "quickAdd" ? selector.historyTime : null,
        insertedBlockIndex: selector.source === "quickAdd" ? selector.insertedBlockIndex : null,
        targetFrom: selector.source === "slash" ? selector.ownerFrom : null,
        targetTo: selector.source === "slash" ? selector.ownerTo : null,
        restoreSelectionPos: selector.source === "quickAdd" ? runtimeEditor.state.selection.from : selector.ownerPos,
        sessionId: `image-picker-${imagePickerSessionCounterRef.current + 1}`,
        source: selector.source
      };
      imagePickerSessionCounterRef.current += 1;
      imagePickerSessionRef.current = nextSession;
      setImagePickerSession(nextSession);
      closeCommandSelector({ syncHoverFromPointer: false });
    },
    [closeCommandSelector]
  );

  const insertImageFromPicker = useCallback(
    (reference: EditorMediaReference) => {
      const runtimeEditor = editorRef.current;
      const session = imagePickerSessionRef.current;
      if (!runtimeEditor || runtimeEditor.isDestroyed || !session) {
        return;
      }

      let didInsert = false;
      if (session.source === "quickAdd" && session.insertedBlockIndex !== null) {
        const runInsert = () => replaceEmptyParagraphWithCanonicalImage(runtimeEditor, session.insertedBlockIndex as number, reference.mediaId);
        didInsert = session.historyTime !== null ? runEditorCommandWithHistoryTime(runtimeEditor, session.historyTime, runInsert) : runInsert();
      } else if (session.targetFrom !== null && session.targetTo !== null) {
        didInsert = replaceEmptyParagraphWithCanonicalImageInRange(runtimeEditor, session.targetFrom, session.targetTo, reference.mediaId);
      }
      if (!didInsert) {
        return;
      }

      imagePickerSessionRef.current = null;
      setImagePickerSession(null);
      runtimeEditor.view.focus();
    },
    []
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

      clearGutterTooltip();
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
    [clearGutterTooltip, closeCommandSelector, overlayOwnerDocument]
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

  const showGutterTooltip = useCallback(
    (tooltip: GutterTooltipState, immediate = false) => {
      if (commandSelector || blockActionMenu || blockTurnIntoMenu || blockDragState) {
        return;
      }

      if (gutterTooltipTimerRef.current !== null) {
        overlayOwnerWindow?.clearTimeout(gutterTooltipTimerRef.current);
        gutterTooltipTimerRef.current = null;
      }
      setGutterTooltip(null);

      if (immediate) {
        setGutterTooltip(tooltip);
        return;
      }

      gutterTooltipTimerRef.current =
        overlayOwnerWindow?.setTimeout(() => {
          gutterTooltipTimerRef.current = null;
          setGutterTooltip(tooltip);
        }, DOCSERA_TOOLTIP_DELAY_MS) ?? null;
    },
    [blockActionMenu, blockDragState, blockTurnIntoMenu, commandSelector, overlayOwnerWindow]
  );

  useEffect(() => {
    if (commandSelector || blockActionMenu || blockTurnIntoMenu || blockDragState) {
      clearGutterTooltip();
    }
  }, [blockActionMenu, blockDragState, blockTurnIntoMenu, clearGutterTooltip, commandSelector]);

  const openBlockTurnIntoMenu = useCallback(
    (blockIndex: number, source: BlockTurnIntoMenuState["source"], anchorRect?: DOMRect) => {
      const runtimeEditor = editorRef.current;
      if (!runtimeEditor || runtimeEditor.isDestroyed) {
        return;
      }

      const targetRect = blockTurnIntoTriggerRef.current?.getBoundingClientRect() ?? anchorRect ?? getTopLevelBlockRect(runtimeEditor, blockIndex);
      const sourceNode = getTopLevelBlockNodeFromDoc(runtimeEditor.state.doc, blockIndex);
      const sourceCommandId = sourceNode ? getTurnIntoBlockCommandIdFromNode(sourceNode) : null;
      const turnIntoMenuHeight = sourceNode ? getBlockTurnIntoMenuHeight(getTurnIntoBlockCommandsForBlock(sourceNode).length) : 0;
      if (!targetRect) {
        return;
      }

      const nextAnchorRect = targetRect;
      setBlockTurnIntoMenu({
        activeIndex: Math.max(0, TURN_INTO_EDITOR_BLOCK_COMMANDS.findIndex((command) => command.id === sourceCommandId)),
        anchorRect: nextAnchorRect,
        blockIndex,
        placement: resolveCommandSelectorPlacement(overlayOwnerDocument, nextAnchorRect, turnIntoMenuHeight),
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
      closeImageOptions({ focusEditor });
      clearTransientBlockSelection();
    },
    [clearTransientBlockSelection, closeBlockActionMenus, closeImageOptions]
  );

  const openImageOptions = useCallback(
    (blockIndex: number, anchorRect: DOMRect) => {
      const runtimeEditor = editorRef.current;
      if (!runtimeEditor || runtimeEditor.isDestroyed) {
        return;
      }

      const imageNode = getTopLevelBlockNodeFromDoc(runtimeEditor.state.doc, blockIndex);
      if (!imageNode || imageNode.type.name !== "image") {
        return;
      }

      const initialAttrs = canonicalizeDocseraImageAttrs(imageNode.attrs);
      imageOptionsSessionCounterRef.current += 1;
      const nextSession: ImageOptionsSessionState = {
        anchorRect,
        blockIndex,
        initialAttrs,
        placement: resolveCommandSelectorPlacement(overlayOwnerDocument, anchorRect, IMAGE_OPTIONS_PANEL_HEIGHT),
        sessionId: `image-options-${imageOptionsSessionCounterRef.current}`
      };
      imageOptionsSessionRef.current = nextSession;
      setImageOptionsSession(nextSession);
      closeCommandSelector({ syncHoverFromPointer: false });
      closeBlockActionMenus({ focusEditor: false, syncHoverFromPointer: false });
      closeBlockTurnIntoMenu({ focusParent: false });
      closeImageAlignmentMenu({ focusEditor: false });
      closeImagePicker({ restoreSelection: false });
      clearTransientBlockSelection();
    },
    [
      clearTransientBlockSelection,
      closeBlockActionMenus,
      closeBlockTurnIntoMenu,
      closeCommandSelector,
      closeImageAlignmentMenu,
      closeImagePicker,
      overlayOwnerDocument
    ]
  );

  const openImageAlignmentMenu = useCallback(
    (blockIndex: number) => {
      const runtimeEditor = editorRef.current;
      if (!runtimeEditor || runtimeEditor.isDestroyed) {
        return;
      }

      const controlGroupRect = getImageControlGroupRect(overlayRoot, blockIndex);
      const triggerRect = getImageControlButtonRect(overlayRoot, blockIndex, "actions");
      if (!controlGroupRect || !triggerRect) {
        return;
      }
      imageAlignmentMenuCounterRef.current += 1;
      const nextMenu: ImageAlignmentMenuState = {
        activeIndex: 0,
        anchorRect: triggerRect,
        blockIndex,
        placement: resolveCommandSelectorPlacement(overlayOwnerDocument, controlGroupRect, IMAGE_ALIGNMENT_MENU_HEIGHT),
        sessionId: `image-alignment-${imageAlignmentMenuCounterRef.current}`
      };
      imageAlignmentMenuRef.current = nextMenu;
      setImageAlignmentMenu(nextMenu);
      closeCommandSelector({ syncHoverFromPointer: false });
      closeBlockActionMenus({ focusEditor: false, syncHoverFromPointer: false });
      closeBlockTurnIntoMenu({ focusParent: false });
      closeImageOptions({ focusEditor: false });
      closeImagePicker({ restoreSelection: false });
    },
    [
      closeBlockActionMenus,
      closeBlockTurnIntoMenu,
      closeCommandSelector,
      closeImageOptions,
      closeImagePicker,
      overlayOwnerDocument,
      overlayRoot
    ]
  );

  const openImageAlignmentPickerMenu = useCallback(
    (blockIndex: number, anchorRect: DOMRect) => {
      const runtimeEditor = editorRef.current;
      if (!runtimeEditor || runtimeEditor.isDestroyed) {
        return;
      }

      imageAlignmentPickerMenuCounterRef.current += 1;
      const nextMenu: ImageAlignmentPickerMenuState = {
        activeIndex: 0,
        anchorRect,
        blockIndex,
        placement: resolveCommandSelectorPlacement(overlayOwnerDocument, anchorRect, IMAGE_ALIGNMENT_MENU_HEIGHT),
        sessionId: `image-alignment-picker-${imageAlignmentPickerMenuCounterRef.current}`
      };
      imageAlignmentPickerMenuRef.current = nextMenu;
      setImageAlignmentPickerMenu(nextMenu);
      closeImageAlignmentMenu({ clearPickerMenu: false, focusEditor: false });
      closeCommandSelector({ syncHoverFromPointer: false });
      closeBlockActionMenus({ focusEditor: false, syncHoverFromPointer: false });
      closeBlockTurnIntoMenu({ focusParent: false });
      closeImagePicker({ restoreSelection: false });
      closeImageOptions({ focusEditor: false });
      clearTransientBlockSelection();
    },
    [
      clearTransientBlockSelection,
      closeBlockActionMenus,
      closeBlockTurnIntoMenu,
      closeCommandSelector,
      closeImageAlignmentMenu,
      closeImageOptions,
      closeImagePicker,
      overlayOwnerDocument
    ]
  );

  const openImageFullscreenFromBlock = useCallback(
    (blockIndex: number, restoreFocusElement: HTMLElement | null) => {
      const runtimeEditor = editorRef.current;
      if (!runtimeEditor || runtimeEditor.isDestroyed) {
        return;
      }

      const blockElement = getTopLevelBlockElement(runtimeEditor, blockIndex);
      if (!(blockElement instanceof HTMLElement)) {
        return;
      }

      const surfaceElement =
        blockElement.querySelector<HTMLElement>("[data-docsera-image-surface='true']") ?? blockElement;
      const imageElement = surfaceElement.querySelector("img");
      if (!(imageElement instanceof HTMLImageElement)) {
        return;
      }

      const nextSession = createImageFullscreenViewerSession({
        alt: imageElement.alt,
        imageElement,
        restoreFocusElement,
        sourceElement: surfaceElement
      });

      setImageFullscreenSession(nextSession);
      setImageFullscreenOpen(true);
      closeImageAlignmentMenu({ focusEditor: false });
      closeImageAlignmentPickerMenu({ focusEditor: false });
      closeImageOptions({ focusEditor: false });
      closeImagePicker({ restoreSelection: false });
    },
    [closeImageAlignmentMenu, closeImageAlignmentPickerMenu, closeImageOptions, closeImagePicker]
  );

  const applyImageAlignment = useCallback(
    (blockIndex: number, align: DocseraImageAttrs["align"]) => {
      const runtimeEditor = editorRef.current;
      if (!runtimeEditor || runtimeEditor.isDestroyed) {
        return;
      }

      const imageNode = getTopLevelBlockNodeFromDoc(runtimeEditor.state.doc, blockIndex);
      if (!imageNode || imageNode.type.name !== "image") {
        return;
      }

      const liveAttrs = canonicalizeDocseraImageAttrs(imageNode.attrs);
      if (liveAttrs.align === align) {
        closeImageAlignmentPickerMenu({ focusEditor: true });
        return;
      }

      const position = getTopLevelImageNodePositionFromDoc(runtimeEditor.state.doc, blockIndex);
      if (position === null) {
        return;
      }

      const nextAttrs = {
        ...liveAttrs,
        align
      };

      runtimeEditor
        ?.chain()
        .focus(undefined, { scrollIntoView: false })
        .command(({ tr, dispatch }) => {
          tr.setNodeMarkup(position, undefined, nextAttrs);
          dispatch?.(tr);
          return true;
        })
        .run();
      closeImageAlignmentPickerMenu({ focusEditor: true });
    },
    [closeImageAlignmentPickerMenu]
  );

  const toggleImageFrame = useCallback(
    (blockIndex: number) => {
      const runtimeEditor = editorRef.current;
      if (!runtimeEditor || runtimeEditor.isDestroyed) {
        return;
      }

      const imageNode = getTopLevelBlockNodeFromDoc(runtimeEditor.state.doc, blockIndex);
      if (!imageNode || imageNode.type.name !== "image") {
        return;
      }

      const liveAttrs = canonicalizeDocseraImageAttrs(imageNode.attrs);
      const position = getTopLevelImageNodePositionFromDoc(runtimeEditor.state.doc, blockIndex);
      if (position === null) {
        return;
      }

      const nextAttrs = {
        ...liveAttrs,
        frame: !liveAttrs.frame
      };

      runtimeEditor
        .chain()
        .focus(undefined, { scrollIntoView: false })
        .command(({ tr, dispatch }) => {
          tr.setNodeMarkup(position, undefined, nextAttrs);
          dispatch?.(tr);
          return true;
        })
        .run();
      closeImageAlignmentMenu({ focusEditor: false });
      closeImageAlignmentPickerMenu({ focusEditor: false });
    },
    [closeImageAlignmentMenu, closeImageAlignmentPickerMenu]
  );

  const executeImageControlMenuAction = useCallback(
    (blockIndex: number, actionIndex: number) => {
      const runtimeEditor = editorRef.current;
      if (!runtimeEditor || runtimeEditor.isDestroyed) {
        return;
      }

      const controlGroupRect = getImageControlGroupRect(overlayRoot, blockIndex);
      const restoreFocusElement =
        overlayRoot.querySelector<HTMLElement>(
          `[data-docsera-image-control-kind="actions"][data-docsera-image-controls-block-index="${blockIndex}"]`
        ) ?? null;

      switch (actionIndex) {
        case 0:
          openImageFullscreenFromBlock(blockIndex, restoreFocusElement);
          return;
        case 1:
          toggleImageFrame(blockIndex);
          return;
        case 2:
          {
            const triggerRect = imageAlignmentMenuItemRefs.current[actionIndex]?.getBoundingClientRect() ?? controlGroupRect;
            closeImageAlignmentMenu({ clearPickerMenu: false, focusEditor: false });
            if (triggerRect) {
              openImageAlignmentPickerMenu(blockIndex, triggerRect);
            }
            return;
          }
        case 3:
          if (controlGroupRect) {
            openImageOptions(blockIndex, controlGroupRect);
          }
          return;
        default:
          return;
      }
    },
    [openImageAlignmentPickerMenu, openImageFullscreenFromBlock, openImageOptions, overlayRoot, toggleImageFrame]
  );

  const restoreImageResizePreview = useCallback((session: ImageResizeSessionState) => {
    const runtimeEditor = editorRef.current;
    if (!runtimeEditor || runtimeEditor.isDestroyed) {
      return;
    }

    const figureElement = getTopLevelBlockElement(runtimeEditor, session.blockIndex);
    if (!(figureElement instanceof HTMLElement)) {
      return;
    }

    figureElement.dataset.docseraImageAlign = session.initialAttrs.align;
    figureElement.dataset.docseraImageFrame = session.initialAttrs.frame ? "true" : "false";
    figureElement.dataset.docseraImageWidthPct = String(session.initialAttrs.widthPct);
    figureElement.style.width = `${session.initialAttrs.widthPct}%`;
    figureElement.style.marginInlineStart = session.initialAttrs.align === "center" || session.initialAttrs.align === "right" ? "auto" : "0";
    figureElement.style.marginInlineEnd = session.initialAttrs.align === "center" || session.initialAttrs.align === "left" ? "auto" : "0";
  }, []);

  const finalizeImageResizeSession = useCallback(
    (options: { commit: boolean }) => {
      const session = imageResizeSessionRef.current;
      imageResizeCleanupRef.current?.();
      imageResizeCleanupRef.current = null;
      imageResizeSessionRef.current = null;
      setImageResizeSession(null);

      if (!session) {
        return;
      }

      if (!options.commit) {
        restoreImageResizePreview(session);
        const runtimeEditor = editorRef.current;
        if (runtimeEditor && !runtimeEditor.isDestroyed) {
          runtimeEditor.view.focus();
        }
        return;
      }

      if (session.activeWidthPct === session.initialAttrs.widthPct) {
        restoreImageResizePreview(session);
        const runtimeEditor = editorRef.current;
        if (runtimeEditor && !runtimeEditor.isDestroyed) {
          runtimeEditor.view.focus();
        }
        return;
      }

      const runtimeEditor = editorRef.current;
      if (!runtimeEditor || runtimeEditor.isDestroyed) {
        restoreImageResizePreview(session);
        return;
      }

      const imageNode = getTopLevelBlockNodeFromDoc(runtimeEditor.state.doc, session.blockIndex);
      if (!imageNode || imageNode.type.name !== "image") {
        restoreImageResizePreview(session);
        return;
      }

      const position = getTopLevelImageNodePositionFromDoc(runtimeEditor.state.doc, session.blockIndex);
      if (position === null) {
        restoreImageResizePreview(session);
        return;
      }

      const nextAttrs = {
        ...canonicalizeDocseraImageAttrs(imageNode.attrs),
        widthPct: session.activeWidthPct
      };

      const historyTime = Date.now() + imageResizeSessionCounterRef.current * 1000;
      runEditorCommandWithHistoryTime(runtimeEditor, historyTime, () =>
        runtimeEditor
          .chain()
          .focus(undefined, { scrollIntoView: false })
          .command(({ tr, dispatch }) => {
            tr.setNodeMarkup(position, undefined, nextAttrs);
            dispatch?.(tr);
            return true;
          })
          .run()
      );
      runtimeEditor.view.focus();
    },
    [restoreImageResizePreview]
  );

  const startImageResizeSession = useCallback(
    (blockIndex: number, edge: "left" | "right", event: React.PointerEvent<HTMLButtonElement>) => {
      const runtimeEditor = editorRef.current;
      if (!runtimeEditor || runtimeEditor.isDestroyed) {
        return;
      }

      const figureElement = getTopLevelBlockElement(runtimeEditor, blockIndex);
      if (!(figureElement instanceof HTMLElement)) {
        return;
      }

      const imageNode = getTopLevelBlockNodeFromDoc(runtimeEditor.state.doc, blockIndex);
      if (!imageNode || imageNode.type.name !== "image") {
        return;
      }

      const initialAttrs = canonicalizeDocseraImageAttrs(imageNode.attrs);
      const figureRect = figureElement.getBoundingClientRect();
      const containerWidth = Math.max(1, figureElement.parentElement?.getBoundingClientRect().width ?? figureRect.width);
      const startWidthPct = Math.min(100, Math.max(20, initialAttrs.widthPct));
      const sessionId = `image-resize-${imageResizeSessionCounterRef.current + 1}`;
      imageResizeSessionCounterRef.current += 1;
      const nextSession: ImageResizeSessionState = {
        activeWidthPct: startWidthPct,
        anchorRect: figureRect,
        blockIndex,
        containerWidth,
        edge,
        initialAttrs,
        initialFigureRect: figureRect,
        pointerId: event.pointerId,
        sessionId,
        startClientX: event.clientX,
        startWidthPct,
        targetRect: figureRect
      };

      imageResizeSessionRef.current = nextSession;
      setImageResizeSession(nextSession);
      closeImageAlignmentMenu({ focusEditor: false });

      const ownerDocument = figureElement.ownerDocument;
      const ownerWindow = ownerDocument.defaultView;
      const applyResizePoint = (clientX: number) => {
        const activeSession = imageResizeSessionRef.current;
        if (!activeSession || activeSession.sessionId !== sessionId) {
          return;
        }

        const delta = clientX - activeSession.startClientX;
        const nextWidthPx =
          activeSession.edge === "right"
            ? activeSession.startWidthPct / 100 * activeSession.containerWidth + delta
            : activeSession.startWidthPct / 100 * activeSession.containerWidth - delta;
        const clampedWidthPx = Math.max(activeSession.containerWidth * 0.2, Math.min(activeSession.containerWidth, nextWidthPx));
        const nextWidthPct = Math.min(100, Math.max(20, Math.round((clampedWidthPx / activeSession.containerWidth) * 100)));
        const currentFigureElement = getTopLevelBlockElement(runtimeEditor, activeSession.blockIndex);
        if (!(currentFigureElement instanceof HTMLElement)) {
          return;
        }

        currentFigureElement.dataset.docseraImageAlign = activeSession.initialAttrs.align;
        currentFigureElement.dataset.docseraImageFrame = activeSession.initialAttrs.frame ? "true" : "false";
        currentFigureElement.dataset.docseraImageWidthPct = String(nextWidthPct);
        currentFigureElement.style.width = `${nextWidthPct}%`;
        currentFigureElement.style.marginInlineStart =
          activeSession.initialAttrs.align === "center" || activeSession.initialAttrs.align === "right" ? "auto" : "0";
        currentFigureElement.style.marginInlineEnd =
          activeSession.initialAttrs.align === "center" || activeSession.initialAttrs.align === "left" ? "auto" : "0";
        const nextFigureRect = currentFigureElement.getBoundingClientRect();
        const updatedSession: ImageResizeSessionState = {
          ...activeSession,
          activeWidthPct: nextWidthPct,
          anchorRect: nextFigureRect,
          targetRect: nextFigureRect
        };
        imageResizeSessionRef.current = updatedSession;
        setImageResizeSession(updatedSession);
      };

      const handlePointerMove = (pointerEvent: PointerEvent) => {
        if (pointerEvent.pointerId !== event.pointerId) {
          return;
        }

        pointerEvent.preventDefault();
        applyResizePoint(pointerEvent.clientX);
      };

      const handlePointerUp = (pointerEvent: PointerEvent) => {
        if (pointerEvent.pointerId !== event.pointerId) {
          return;
        }

        pointerEvent.preventDefault();
        applyResizePoint(pointerEvent.clientX);
        finalizeImageResizeSession({ commit: true });
      };

      const handlePointerCancel = (pointerEvent: PointerEvent) => {
        if (pointerEvent.pointerId !== event.pointerId) {
          return;
        }

        pointerEvent.preventDefault();
        finalizeImageResizeSession({ commit: false });
      };

      const handleBlur = () => {
        finalizeImageResizeSession({ commit: false });
      };

      const handlePageHide = () => {
        finalizeImageResizeSession({ commit: false });
      };

      imageResizeCleanupRef.current = () => {
        ownerDocument.removeEventListener("pointermove", handlePointerMove, true);
        ownerDocument.removeEventListener("pointerup", handlePointerUp, true);
        ownerDocument.removeEventListener("pointercancel", handlePointerCancel, true);
        ownerWindow?.removeEventListener("blur", handleBlur, true);
        ownerWindow?.removeEventListener("pagehide", handlePageHide, true);
      };

      ownerDocument.addEventListener("pointermove", handlePointerMove, true);
      ownerDocument.addEventListener("pointerup", handlePointerUp, true);
      ownerDocument.addEventListener("pointercancel", handlePointerCancel, true);
      ownerWindow?.addEventListener("blur", handleBlur, true);
      ownerWindow?.addEventListener("pagehide", handlePageHide, true);

      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Pointer capture is a best-effort enhancement; the document listeners keep the gesture stable without it.
      }

      event.preventDefault();
      event.stopPropagation();
    },
    [closeImageAlignmentMenu, finalizeImageResizeSession]
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

  const handleImageAlignmentMenuKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      const activeMenu = imageAlignmentMenuRef.current;
      if (!activeMenu) {
        return;
      }

      const menuItemCount = 4;
      const nextIndex = Math.max(0, Math.min(activeMenu.activeIndex, menuItemCount - 1));

      if (event.key === "Escape") {
        event.preventDefault();
        closeImageAlignmentMenu({ focusEditor: true });
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setImageAlignmentMenu((current) =>
          current
            ? {
                ...current,
                activeIndex:
                  menuItemCount > 0
                    ? event.key === "ArrowDown"
                      ? (current.activeIndex + 1) % menuItemCount
                      : (current.activeIndex - 1 + menuItemCount) % menuItemCount
                    : 0
              }
            : current
        );
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        executeImageControlMenuAction(activeMenu.blockIndex, nextIndex);
      }
    },
    [closeImageAlignmentMenu, executeImageControlMenuAction]
  );

  const handleImageAlignmentPickerMenuKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLElement>) => {
      const activeMenu = imageAlignmentPickerMenuRef.current;
      if (!activeMenu) {
        return;
      }

      const menuItemCount = 3;
      const nextIndex = Math.max(0, Math.min(activeMenu.activeIndex, menuItemCount - 1));

      if (event.key === "Escape") {
        event.preventDefault();
        closeImageAlignmentPickerMenu({ focusEditor: true });
        return;
      }

      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        setImageAlignmentPickerMenu((current) =>
          current
            ? {
                ...current,
                activeIndex:
                  menuItemCount > 0
                    ? event.key === "ArrowDown"
                      ? (current.activeIndex + 1) % menuItemCount
                      : (current.activeIndex - 1 + menuItemCount) % menuItemCount
                    : 0
              }
            : current
        );
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const activeAlignment = ["left", "center", "right"][nextIndex] as DocseraImageAttrs["align"] | undefined;
        if (activeAlignment) {
          applyImageAlignment(activeMenu.blockIndex, activeAlignment);
        }
      }
    },
    [applyImageAlignment, closeImageAlignmentPickerMenu]
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
    const runtimeEditor = editorRef.current;
    const sourceNode = runtimeEditor && !runtimeEditor.isDestroyed
      ? getTopLevelBlockNodeFromDoc(runtimeEditor.state.doc, blockTurnIntoMenu.blockIndex)
      : null;
    const nextPlacement = resolveCommandSelectorPlacement(
      overlayOwnerDocument,
      nextAnchorRect,
      getBlockTurnIntoMenuHeight(sourceNode ? getTurnIntoBlockCommandsForBlock(sourceNode).length : 0)
    );
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
    if (!imageAlignmentMenu) {
      imageAlignmentMenuItemRefs.current = [];
      return;
    }

    imageAlignmentMenuItemRefs.current[imageAlignmentMenu.activeIndex]?.focus();
  }, [imageAlignmentMenu]);

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
    const caretRect = getCaretBounds(runtimeEditor) ?? new DOMRect(12, 12, 1, 1);
    const ownerBlockRect = getTopLevelBlockRect(runtimeEditor, triggerSelection.blockIndex);
    const anchorRect = ownerBlockRect ? buildSlashSelectorAnchorRect(ownerBlockRect, caretRect) : caretRect;
    const targetNode = runtimeEditor.state.doc.nodeAt(triggerSelection.ownerPos);
    const targetTo = triggerSelection.ownerPos + (targetNode?.nodeSize ?? 0);

    setCommandSelector({
      activeIndex: 0,
      anchorRect,
      ownerBlockIndex: triggerSelection.blockIndex,
      surfaceContext: {
        ...resolveEditorBlockCommandContext(runtimeEditor.state.selection as TextSelection),
        isInsideCallout:
          isPositionInsideNodeType(runtimeEditor.state.doc, triggerSelection.ownerPos, "callout") ||
          isPositionInsideNodeType(runtimeEditor.state.doc, runtimeEditor.state.selection.from, "callout")
      },
      placement: resolveCommandSelectorPlacement(overlayOwnerDocument, anchorRect, BLOCK_SELECTOR_HEIGHT),
      query: "",
      source: "slash",
      ownerPos: triggerSelection.ownerPos,
      ownerFrom: triggerSelection.ownerPos,
      ownerTo: targetTo
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
    const fallbackAnchorRect = buildQuickAddSelectorAnchorRect(insertedBlockRect);
    setCommandSelector({
      activeIndex: 0,
      fallbackAnchorRect,
      historyTime,
      insertedBlockIndex,
      ownerBlockIndex: insertedBlockIndex,
      ownerLabel: target.accessibleLabel,
      surfaceContext: {
        insertionContainerType: "doc",
        isInsideAccordion: false,
        isInsideAccordionContent: false,
        isInsideCallout: false,
        isInsideColumn: false,
        isInsideTableCellOrHeader: false,
        isTopLevelBlock: true
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

  const clearCaretStripTextGesture = useCallback(() => {
    const cleanup = caretStripTextGestureCleanupRef.current;
    caretStripTextGestureCleanupRef.current = null;
    caretStripTextGestureRef.current = null;
    cleanup?.();
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
    clearCaretStripTextGestureUnmountRef.current = clearCaretStripTextGesture;
  }, [clearCaretStripTextGesture]);

  useEffect(() => {
    clearSurfaceClickSuppressionReleaseTimerUnmountRef.current = clearSurfaceClickSuppressionReleaseTimer;
  }, [clearSurfaceClickSuppressionReleaseTimer]);

  useEffect(() => {
    clearTransientBlockSelectionUnmountRef.current = clearTransientBlockSelection;
  }, [clearTransientBlockSelection]);

  const startCaretStripTextGesture = useCallback(
    (event: PointerEvent, blockIndex: number) => {
      const runtimeEditor = editorRef.current;
      const surfaceElement = surfaceRef.current;
      if (!runtimeEditor || !surfaceElement || !focusTopLevelCaretIntent(runtimeEditor, blockIndex)) {
        return false;
      }

      const anchor = resolveTopLevelCaretIntentPosition(runtimeEditor, blockIndex);
      if (anchor === null) {
        return false;
      }

      clearCaretStripTextGesture();
      const ownerDocument = surfaceElement.ownerDocument;
      const ownerWindow = ownerDocument.defaultView;
      const applyTextSelectionPoint = (clientX: number, clientY: number) => {
        const gesture = caretStripTextGestureRef.current;
        if (!gesture || runtimeEditor.isDestroyed) {
          return;
        }

        const resolved = runtimeEditor.view.posAtCoords({ left: clientX, top: clientY });
        if (!resolved) {
          return;
        }

        let transaction = runtimeEditor.state.tr.setMeta("addToHistory", false);
        try {
          transaction = transaction.setSelection(TextSelection.create(transaction.doc, gesture.anchor, resolved.pos));
        } catch {
          return;
        }
        if (!runtimeEditor.state.selection.eq(transaction.selection)) {
          runtimeEditor.view.dispatch(transaction);
        }
      };
      const cleanup = () => {
        ownerDocument.removeEventListener("pointermove", handlePointerMove, true);
        ownerDocument.removeEventListener("pointerup", handlePointerUp, true);
        ownerDocument.removeEventListener("pointercancel", handlePointerCancel, true);
        ownerDocument.removeEventListener("lostpointercapture", handleLostPointerCapture, true);
        ownerWindow?.removeEventListener("pagehide", handleLifecycleEnd);
        ownerWindow?.removeEventListener("blur", handleLifecycleEnd);
        ownerDocument.removeEventListener("visibilitychange", handleVisibilityChange, true);
      };
      const handlePointerMove = (pointerEvent: PointerEvent) => {
        const gesture = caretStripTextGestureRef.current;
        if (!gesture || gesture.pointerId !== pointerEvent.pointerId) {
          return;
        }
        if (pointerEvent.buttons === 0) {
          clearCaretStripTextGesture();
          return;
        }
        pointerEvent.preventDefault();
        gesture.hasMoved = true;
        applyTextSelectionPoint(pointerEvent.clientX, pointerEvent.clientY);
      };
      const handlePointerUp = (pointerEvent: PointerEvent) => {
        const gesture = caretStripTextGestureRef.current;
        if (!gesture || gesture.pointerId !== pointerEvent.pointerId) {
          return;
        }
        pointerEvent.preventDefault();
        if (gesture.hasMoved) {
          applyTextSelectionPoint(pointerEvent.clientX, pointerEvent.clientY);
        }
        clearCaretStripTextGesture();
      };
      const handlePointerCancel = (pointerEvent: PointerEvent) => {
        if (caretStripTextGestureRef.current?.pointerId === pointerEvent.pointerId) {
          clearCaretStripTextGesture();
        }
      };
      const handleLostPointerCapture = (pointerEvent: PointerEvent) => {
        if (caretStripTextGestureRef.current?.pointerId === pointerEvent.pointerId) {
          clearCaretStripTextGesture();
        }
      };
      const handleLifecycleEnd = () => clearCaretStripTextGesture();
      const handleVisibilityChange = () => {
        if (ownerDocument.visibilityState === "hidden") {
          clearCaretStripTextGesture();
        }
      };

      caretStripTextGestureRef.current = { anchor, hasMoved: false, pointerId: event.pointerId };
      caretStripTextGestureCleanupRef.current = cleanup;
      ownerDocument.addEventListener("pointermove", handlePointerMove, true);
      ownerDocument.addEventListener("pointerup", handlePointerUp, true);
      ownerDocument.addEventListener("pointercancel", handlePointerCancel, true);
      ownerDocument.addEventListener("lostpointercapture", handleLostPointerCapture, true);
      ownerWindow?.addEventListener("pagehide", handleLifecycleEnd);
      ownerWindow?.addEventListener("blur", handleLifecycleEnd);
      ownerDocument.addEventListener("visibilitychange", handleVisibilityChange, true);
      event.preventDefault();
      return true;
    },
    [clearCaretStripTextGesture]
  );

  const isCaretStripTextSelectionPointerOrigin = useCallback(
    (event: MouseEvent | PointerEvent) => {
      const runtimeEditor = editorRef.current;
      const surfaceElement = surfaceRef.current;
      if (!runtimeEditor || runtimeEditor.isDestroyed || !surfaceElement) {
        return false;
      }

      const pointerEvent = event as PointerEvent;
      const target = resolvePointerEventTarget(pointerEvent);
      if (
        isPointerEventInsideElement(pointerEvent, overlayRoot) ||
        isGutterControlTarget(target) ||
        isInteractiveEditorOverlayTarget(target)
      ) {
        return false;
      }

      return resolvePanelPointerClassification(runtimeEditor, surfaceElement, event.clientX, event.clientY).zone === "caret-strip";
    },
    [overlayRoot]
  );

  const startBlankGutterRangeGesture = useCallback(
    (event: PointerEvent, anchorBlockIndex: number, options: { endOfPageInsertionCandidate?: boolean } = {}) => {
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
        const shouldInsertFinalParagraph = !gesture.activated && gesture.endOfPageInsertionCandidate;
        clearGutterRangeGesture({
          clearSelection: !gesture.activated,
          reason: "pointerup",
          releaseClickSuppression: true
        });
        if (shouldInsertFinalParagraph && !runtimeEditor.isDestroyed) {
          focusOrAppendEditableFinalParagraph(runtimeEditor);
        }
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
        endOfPageInsertionCandidate: Boolean(options.endOfPageInsertionCandidate),
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

    if (command.id === "image") {
      openImagePicker(activeSelector);
      return;
    }

    // The selector session is consumed by choosing a command, not by the
    // follow-up caret adjustment. Preserve the session above for command
    // execution, then clear each selector-owned presentation immediately.
    clearTransientBlockSelection();
    closeCommandSelector();
    syncCommandQueryPresentation(null);

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
        didExecute = replaceEmptySlashOwnerParagraphWithBlockquote(runtimeEditor, activeSelector);
      } else {
        didExecute = applySlashCommand(runtimeEditor, activeSelector, command);
      }
    }
    if (!didExecute) {
      return;
    }
    const selectionAnchor = runtimeEditor.state.selection.from;
    if (activeSelector.source === "quickAdd" || activeSelector.source === "slash") {
      if (editorRef.current === runtimeEditor && !runtimeEditor.isDestroyed) {
        const shouldPreserveSelection =
          activeSelector.source === "slash" &&
          command.id === "horizontalRule" &&
          (activeSelector.surfaceContext.isInsideColumn || activeSelector.surfaceContext.isInsideAccordionContent);
        if (shouldPreserveSelection) {
          runtimeEditor.view.focus();
        } else {
          restoreEditorSelectionFocus(runtimeEditor, selectionAnchor);
        }
      }
    }
  }

  useEffect(() => {
    if (isInteractionActive) {
      return;
    }

    cancelPendingTimers();
    setOwnedHoverTarget(null);
    setCommandSelector(null);
    closeImagePicker({ restoreSelection: false });
    closeImageOptions({ focusEditor: false });
    closeImageAlignmentMenu({ focusEditor: false });
    clearDocseraImagePreviewState();
    setImageFullscreenOpen(false);
    setImageFullscreenSession(null);
    finalizeImageResizeSession({ commit: false });
    setBlockActionMenu(null);
    setBlockTurnIntoMenu(null);
    clearTransientBlockSelection();
    clearBlockDragSession();
  }, [
    clearBlockDragSession,
    clearTransientBlockSelection,
    closeImageAlignmentMenu,
    closeImageOptions,
    closeImagePicker,
    finalizeImageResizeSession,
    isInteractionActive,
    isEditable
  ]);

  useEffect(() => {
    setOwnedHoverTarget(null);
    setCommandSelector(null);
    closeImagePicker({ restoreSelection: false });
    closeImageOptions({ focusEditor: false });
    closeImageAlignmentMenu({ focusEditor: false });
    clearDocseraImagePreviewState();
    setImageFullscreenOpen(false);
    setImageFullscreenSession(null);
    finalizeImageResizeSession({ commit: false });
    setBlockActionMenu(null);
    setBlockTurnIntoMenu(null);
    clearTransientBlockSelection();
    clearBlockDragSession();
  }, [
    clearBlockDragSession,
    clearTransientBlockSelection,
    closeImageAlignmentMenu,
    closeImageOptions,
    closeImagePicker,
    finalizeImageResizeSession,
    pageSysId,
    sessionKey
  ]);

  useEffect(() => {
    return subscribeDocseraImageDisplayState(() => {
      const nextState = getDocseraImageDisplayState();
      setImageDisplayState({
        preview: nextState.preview ? { ...nextState.preview } : null,
        theme: nextState.theme
      });
    });
  }, []);

  useEffect(() => {
    commandSelectorRef.current = commandSelector;
  }, [commandSelector]);

  useEffect(() => {
    imagePickerSessionRef.current = imagePickerSession;
  }, [imagePickerSession]);

  useEffect(() => {
    imageOptionsSessionRef.current = imageOptionsSession;
  }, [imageOptionsSession]);

  useEffect(() => {
    imageAlignmentMenuRef.current = imageAlignmentMenu;
  }, [imageAlignmentMenu]);

  useEffect(() => {
    imageAlignmentPickerMenuRef.current = imageAlignmentPickerMenu;
  }, [imageAlignmentPickerMenu]);

  useEffect(() => {
    imageResizeSessionRef.current = imageResizeSession;
  }, [imageResizeSession]);

  useLayoutEffect(() => {
    if (!imageOptionsSession) {
      return;
    }

    const targetRect = getImageOptionsControlGroupRect(overlayRoot, imageOptionsSession.blockIndex);
    if (!targetRect) {
      closeImageOptions({ focusEditor: true });
      return;
    }

    const nextPlacement = resolveCommandSelectorPlacement(overlayOwnerDocument, targetRect, IMAGE_OPTIONS_PANEL_HEIGHT);
    if (areDomRectsEqual(imageOptionsSession.anchorRect, targetRect) && imageOptionsSession.placement === nextPlacement) {
      return;
    }

    setImageOptionsSession((current) =>
      current
        ? {
            ...current,
            anchorRect: targetRect,
            placement: nextPlacement
          }
        : current
    );
  }, [closeImageOptions, imageOptionsSession, overlayMeasurementVersion, overlayRoot]);

  useLayoutEffect(() => {
    if (!imageAlignmentMenu) {
      return;
    }

    const controlGroupRect = getImageControlGroupRect(overlayRoot, imageAlignmentMenu.blockIndex);
    const triggerRect = getImageControlButtonRect(overlayRoot, imageAlignmentMenu.blockIndex, "actions");
    if (!controlGroupRect || !triggerRect) {
      closeImageAlignmentMenu({ focusEditor: true });
      return;
    }

    const nextPlacement = resolveCommandSelectorPlacement(overlayOwnerDocument, controlGroupRect, IMAGE_ALIGNMENT_MENU_HEIGHT);
    if (
      areDomRectsEqual(imageAlignmentMenu.anchorRect, triggerRect) &&
      imageAlignmentMenu.placement === nextPlacement
    ) {
      return;
    }

    setImageAlignmentMenu((current) =>
      current
        ? {
            ...current,
            anchorRect: triggerRect,
            placement: nextPlacement
          }
        : current
    );
  }, [closeImageAlignmentMenu, imageAlignmentMenu, overlayMeasurementVersion, overlayOwnerDocument, overlayRoot]);

  useLayoutEffect(() => {
    if (!imageAlignmentPickerMenu) {
      return;
    }

    const controlGroupRect = getImageControlGroupRect(overlayRoot, imageAlignmentPickerMenu.blockIndex);
    const triggerRect = getImageControlButtonRect(overlayRoot, imageAlignmentPickerMenu.blockIndex, "alignment");
    const nextAnchorRect = triggerRect ?? imageAlignmentPickerMenu.anchorRect;
    if (!controlGroupRect || !nextAnchorRect) {
      closeImageAlignmentPickerMenu({ focusEditor: true });
      return;
    }

    const nextPlacement = resolveCommandSelectorPlacement(overlayOwnerDocument, controlGroupRect, IMAGE_ALIGNMENT_MENU_HEIGHT);
    if (
      areDomRectsEqual(imageAlignmentPickerMenu.anchorRect, nextAnchorRect) &&
      imageAlignmentPickerMenu.placement === nextPlacement
    ) {
      return;
    }

    setImageAlignmentPickerMenu((current) =>
      current
        ? {
            ...current,
            anchorRect: nextAnchorRect,
            placement: nextPlacement
          }
        : current
    );
  }, [
    closeImageAlignmentPickerMenu,
    imageAlignmentPickerMenu,
    overlayMeasurementVersion,
    overlayOwnerDocument,
    overlayRoot
  ]);

  useLayoutEffect(() => {
    if (!imageAlignmentPickerMenu) {
      imageAlignmentPickerMenuItemRefs.current = [];
      return;
    }

    imageAlignmentPickerMenuItemRefs.current[imageAlignmentPickerMenu.activeIndex]?.focus();
  }, [imageAlignmentPickerMenu]);

  useEffect(() => {
    const runtimeEditor = editorRef.current;
    if (!commandSelector || !runtimeEditor) {
      return;
    }

    if (commandSelector.source === "slash") {
      let nextAnchorRect: DOMRect | null;
      try {
        const ownerBlockRect = getTopLevelBlockRect(runtimeEditor, commandSelector.ownerBlockIndex);
        const caretRect = getCaretBounds(runtimeEditor);
        nextAnchorRect = ownerBlockRect && caretRect ? buildSlashSelectorAnchorRect(ownerBlockRect, caretRect) : null;
      } catch {
        return;
      }
      if (!nextAnchorRect) {
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

    const nextFallbackAnchorRect = buildQuickAddSelectorAnchorRect(insertedBlockRect);
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
      applyCanonicalEnvelope: (nextEnvelope) => {
        const runtimeEditor = editorRef.current;
        if (!runtimeEditor || runtimeEditor.isDestroyed || disposedRef.current || !editableRef.current) {
          return { kind: "unavailable" };
        }

        try {
          return replaceEditorDocument(runtimeEditor, nextEnvelope);
        } catch {
          return { kind: "unavailable" };
        }
      },
      discardLocalEdits: ({ envelope, revision }) => {
        const runtimeEditor = editorRef.current;
        if (
          !runtimeEditor ||
          runtimeEditor.isDestroyed ||
          disposedRef.current ||
          !editableRef.current ||
          saveInFlightRef.current ||
          !Number.isSafeInteger(revision) ||
          revision < 0
        ) {
          return false;
        }

        try {
          const replacement = replaceEditorDocument(runtimeEditor, envelope);
          if (replacement.kind === "unavailable") {
            return false;
          }
          const savedDocumentKey = serializeDocument(replacement.nextEnvelope.document);
          currentDocumentKeyRef.current = savedDocumentKey;
          savedDocumentKeyRef.current = savedDocumentKey;
          savedRevisionRef.current = revision;
          setSavedDocumentKey(savedDocumentKey);
          setSavedRevision(revision);
          setErrorMessage("");
          retryAttemptRef.current = 0;
          cancelPendingTimers();
          setStatus("saved");
          return true;
        } catch {
          return false;
        }
      },
      reconcileRecoveredDraft: ({ envelope, revision, preserveConflictUnlessTrusted = false }) => {
        const runtimeEditor = editorRef.current;
        if (!runtimeEditor || runtimeEditor.isDestroyed || disposedRef.current || !editableRef.current || !Number.isSafeInteger(revision) || revision < 0) {
          return { kind: "unavailable" };
        }

        try {
          const recoveredDocumentKey = serializeDocument(parseDocseraDocumentOrThrow(envelope).document);
          const localDocumentKey = currentDocumentKeyRef.current;
          const savedDocumentKey = savedDocumentKeyRef.current;
          const matchesKnownSavedBaseline = recoveredDocumentKey === savedDocumentKey;
          const matchesCurrentDocument = recoveredDocumentKey === localDocumentKey;
          if (preserveConflictUnlessTrusted && !matchesKnownSavedBaseline && !matchesCurrentDocument) {
            setStatus("conflict");
            return { kind: "preserved_conflict" };
          }
          const preservesLocalChanges = !matchesCurrentDocument;
          if (saveInFlightRef.current) {
            reconciliationVersionRef.current += 1;
          }
          savedDocumentKeyRef.current = recoveredDocumentKey;
          savedRevisionRef.current = revision;
          setSavedDocumentKey(recoveredDocumentKey);
          setSavedRevision(revision);
          setErrorMessage("");
          retryAttemptRef.current = 0;
          if (retryTimerRef.current !== null) {
            window.clearTimeout(retryTimerRef.current);
            retryTimerRef.current = null;
          }
          const reconciledStatus = preservesLocalChanges ? "dirty" : "saved";
          statusRef.current = reconciledStatus;
          setStatus(reconciledStatus);
          return { kind: preservesLocalChanges ? "preserved_local_changes" : "saved" };
        } catch {
          return { kind: "unavailable" };
        }
      },
      flush: flushLatest,
      getCanonicalEnvelope: () => {
        const runtimeEditor = editorRef.current;
        if (!runtimeEditor) {
          return null;
        }

        return getCurrentEnvelope(runtimeEditor);
      },
      getRecoverySnapshot: () => {
        const runtimeEditor = editorRef.current;
        if (!runtimeEditor) {
          return null;
        }

        return {
          envelope: getCurrentEnvelope(runtimeEditor),
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
    coreExtensionOptions: editorCoreExtensionOptions,
    editable: isEditable,
    editorProps,
    extensions: editorExtensions,
    content: validatedInitialEnvelope.document as unknown as Record<string, unknown>,
    immediatelyRender: false,
    onCreate: ({ editor: runtimeEditor }) => {
      editorRef.current = runtimeEditor;
      runtimeEditor.setEditable(editableRef.current, false);
      void trySetEditorTabIndex(runtimeEditor, isInteractionActive && editableRef.current);
      exposeEditableDiagnostics(runtimeEditor, { canEdit: editableRef.current, interactionActive });
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
  }, [editorExtensions]);
  const mountedEditor = editor && editorRef.current === editor && !editor.isDestroyed ? editor : null;
  const historyControlsEditor = editor && !editor.isDestroyed ? editor : null;

  useEffect(() => {
    if (!historyControlsMount) return;
    onEditorCommandTargetChange?.(isInteractionActive && isEditable ? historyControlsEditor : null);
    return () => onEditorCommandTargetChange?.(null);
  }, [historyControlsEditor, historyControlsMount, isEditable, isInteractionActive, onEditorCommandTargetChange]);

  useEffect(() => {
    if (!editor || !isInteractionActive) {
      clearCaretStripTextGesture();
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
  }, [clearCaretStripTextGesture, clearGutterRangeGesture, clearTransientBlockSelection, editor, isInteractionActive]);

  useEffect(() => {
    if (!editor || !isInteractionActive) {
      clearCaretStripTextGesture();
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
        if (classification.caretBlockIndex !== null) {
          startCaretStripTextGesture(event, classification.caretBlockIndex);
        }
        return;
      }

      if (anchorTarget) {
        startBlankGutterRangeGesture(event, anchorTarget.blockIndex, {
          endOfPageInsertionCandidate: isEndOfPageInsertionPoint(runtimeEditor, surfaceElement, event.clientX, event.clientY)
        });
        return;
      }

      clearTransientBlockSelection(resolvedZone === "content-block" ? "content-pointerdown" : resolvedZone);
    };

    overlayOwnerDocument.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      overlayOwnerDocument.removeEventListener("pointerdown", handlePointerDown, true);
      clearCaretStripTextGesture();
      clearGutterRangeGesture({ clearSelection: true, reason: "listener-disposal" });
    };
  }, [
    clearCaretStripTextGesture,
    clearGutterRangeGesture,
    clearTransientBlockSelection,
    editor,
    isInteractionActive,
    overlayOwnerDocument,
    overlayRoot,
    startBlankGutterRangeGesture,
    startCaretStripTextGesture
  ]);

  useEffect(() => {
    disposedRef.current = false;
    return () => {
      disposedRef.current = true;
      initializingRef.current = false;
      cancelPendingTimers();
      clearCaretStripTextGestureUnmountRef.current?.();
      clearGutterRangeGestureUnmountRef.current?.({ clearSelection: true, reason: "runtime-teardown" });
      clearSurfaceClickSuppressionReleaseTimerUnmountRef.current?.();
      suppressSurfaceClickUntilPointerUpRef.current = false;
      clearTransientBlockSelectionUnmountRef.current?.("runtime-teardown");
      closeImageAlignmentMenu({ focusEditor: false });
      finalizeImageResizeSession({ commit: false });
      editorRef.current = null;
    };
  }, [closeImageAlignmentMenu, finalizeImageResizeSession]);

  useEffect(() => {
    if (!mountedEditor) {
      return;
    }

    const ownerDocument = overlayRoot.ownerDocument;
    if (!isInteractionActive) {
      return undefined;
    }

    return subscribeToPageOwnershipHandoff(ownerDocument, (detail) => {
      if (detail.reason !== "page-create-inline-title" || detail.pageSysId !== pageSysId) {
        return;
      }

      if (!(mountedEditor.state.selection instanceof CellSelection)) {
        return;
      }

      releaseStructuralCellSelectionOwnership(mountedEditor);
    });
  }, [isInteractionActive, mountedEditor, overlayRoot, pageSysId]);

  useEffect(() => {
    if (!mountedEditor) {
      return;
    }

    const desiredTabIndex = isInteractionActive && isEditable;
    const applyTabIndex = () => {
      if (disposedRef.current || (mountedEditor as Editor & { isDestroyed?: boolean }).isDestroyed) {
        return;
      }

      void trySetEditorTabIndex(mountedEditor, desiredTabIndex);
    };

    mountedEditor.setEditable(isEditable, false);
    exposeEditableDiagnostics(mountedEditor, { canEdit: isEditable, interactionActive });
    applyTabIndex();
    queueMicrotask(applyTabIndex);
  }, [isEditable, isInteractionActive, mountedEditor]);

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
    if (!editor || (!hoverTarget && !commandSelector && !imageOptionsSession)) {
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
  }, [commandSelector, editor, hoverTarget, imageOptionsSession, overlayOwnerDocument, overlayOwnerWindow, scheduleOverlayMeasurement]);

  useEffect(() => {
    if (!editor || !commandSelector) {
      return;
    }

    const ResizeObserverConstructor = overlayOwnerWindow?.ResizeObserver ?? window.ResizeObserver;
    if (!ResizeObserverConstructor) {
      return;
    }

    const observedElements = new Set<Element>();
    const observer = new ResizeObserverConstructor(() => {
      scheduleOverlayMeasurement();
    });
    const observeElement = (element: Element | null | undefined) => {
      if (!element || observedElements.has(element)) {
        return;
      }
      observedElements.add(element);
      observer.observe(element);
    };

    observeElement(surfaceRef.current);
    observeElement(editor.view.dom);
    if (commandSelector.source === "slash") {
      observeElement(getTopLevelBlockElement(editor, commandSelector.ownerBlockIndex));
    } else {
      observeElement(getTopLevelBlockElement(editor, commandSelector.insertedBlockIndex));
    }

    return () => {
      observer.disconnect();
    };
  }, [commandSelector, editor, overlayOwnerWindow, scheduleOverlayMeasurement]);

  useEffect(() => {
    if (!editor || !isInteractionActive) {
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
  }, [editor, isInteractionActive, overlayOwnerDocument, scheduleOverlayMeasurement]);

  useEffect(() => {
    if (
      !isInteractionActive ||
      (!commandSelector &&
        !blockActionMenu &&
        !blockTurnIntoMenu &&
        !imageOptionsSession &&
        !imageAlignmentMenu &&
        !imageAlignmentPickerMenu)
    ) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      const alignmentMenuElement =
        imageAlignmentMenu && overlayRoot.querySelector<HTMLElement>(`[id="${imageAlignmentMenuId}"]`);
      const alignmentTriggerElement =
        imageAlignmentMenu && overlayRoot.querySelector<HTMLElement>(`[aria-controls="${imageAlignmentMenuId}"]`);
      const isInsideAlignmentSurface =
        isPointerEventInsideElement(event, alignmentMenuElement) || isPointerEventInsideElement(event, alignmentTriggerElement);

      const alignmentPickerMenuElement =
        imageAlignmentPickerMenu && overlayRoot.querySelector<HTMLElement>(`[id="${imageAlignmentPickerMenuId}"]`);
      const alignmentPickerTriggerElement =
        imageAlignmentPickerMenu && overlayRoot.querySelector<HTMLElement>(`[aria-controls="${imageAlignmentPickerMenuId}"]`);
      const isInsideAlignmentPickerSurface =
        isPointerEventInsideElement(event, alignmentPickerMenuElement) ||
        isPointerEventInsideElement(event, alignmentPickerTriggerElement);

      if (isInsideAlignmentSurface || isInsideAlignmentPickerSurface) {
        return;
      }

      if (isPointerEventInsideElement(event, overlayRoot)) {
        if (imageAlignmentMenu) {
          closeImageAlignmentMenu({ focusEditor: false });
        }
        if (imageAlignmentPickerMenu) {
          closeImageAlignmentPickerMenu({ focusEditor: false });
        }
        return;
      }

      if (isPointerEventInsideElement(event, surfaceRef.current)) {
        if (commandSelector) {
          closeCommandSelector();
        }
        if (blockActionMenu || blockTurnIntoMenu) {
          closeAllBlockSurfaces({ focusEditor: false, syncHoverFromPointer: false });
        }
        if (imageOptionsSession) {
          closeImageOptions({ focusEditor: false });
        }
        if (imageAlignmentMenu) {
          closeImageAlignmentMenu({ focusEditor: false });
        }
        if (imageAlignmentPickerMenu) {
          closeImageAlignmentPickerMenu({ focusEditor: false });
        }
        return;
      }

      if (commandSelector) {
        closeCommandSelector();
      }
      if (blockActionMenu || blockTurnIntoMenu) {
        closeAllBlockSurfaces({ focusEditor: false, syncHoverFromPointer: false });
      }
      if (imageOptionsSession) {
        closeImageOptions({ focusEditor: false });
      }
      if (imageAlignmentMenu) {
        closeImageAlignmentMenu({ focusEditor: false });
      }
      if (imageAlignmentPickerMenu) {
        closeImageAlignmentPickerMenu({ focusEditor: false });
      }
    };

    overlayOwnerDocument.addEventListener("pointerdown", handlePointerDown, true);
    return () => {
      overlayOwnerDocument.removeEventListener("pointerdown", handlePointerDown, true);
    };
  }, [
    blockActionMenu,
    blockTurnIntoMenu,
    closeAllBlockSurfaces,
    closeCommandSelector,
    closeImageAlignmentMenu,
    closeImageAlignmentPickerMenu,
    closeImageOptions,
    commandSelector,
    imageAlignmentMenu,
    imageAlignmentMenuId,
    imageAlignmentPickerMenu,
    imageAlignmentPickerMenuId,
    imageOptionsSession,
    isInteractionActive,
    overlayOwnerDocument,
    overlayRoot
  ]);

  useEffect(() => {
    if (!isInteractionActive || !imageOptionsSession || !imageAlignmentMenu) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      closeImageAlignmentMenu({ focusEditor: false });
    };

      overlayOwnerDocument.addEventListener("keydown", handleKeyDown, true);
    return () => {
      overlayOwnerDocument.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [closeImageAlignmentMenu, imageAlignmentMenu, imageOptionsSession, isInteractionActive, overlayOwnerDocument]);

  useEffect(() => {
    if (!isInteractionActive || !imageOptionsSession || !imageAlignmentPickerMenu) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      closeImageAlignmentPickerMenu({ focusEditor: false });
    };

    overlayOwnerDocument.addEventListener("keydown", handleKeyDown, true);
    return () => {
      overlayOwnerDocument.removeEventListener("keydown", handleKeyDown, true);
    };
  }, [closeImageAlignmentPickerMenu, imageAlignmentPickerMenu, imageOptionsSession, isInteractionActive, overlayOwnerDocument]);

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

  function scheduleRetry(): boolean {
    if (retryTimerRef.current !== null || statusRef.current === "conflict" || disposedRef.current) return false;
    const delay = getAutosaveRetryDelay(retryAttemptRef.current);
    if (delay === null) return false;
    retryAttemptRef.current += 1;
    retryTimerRef.current = window.setTimeout(() => {
      retryTimerRef.current = null;
      void flushLatest();
    }, delay);
    return true;
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
    const reconciliationVersion = reconciliationVersionRef.current;
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

      if (reconciliationVersionRef.current !== reconciliationVersion) {
        return currentDocumentKeyRef.current === savedDocumentKeyRef.current;
      }

      if (disposedRef.current || saveGenerationRef.current !== saveGeneration) {
        return false;
      }

      if (result.state === "failed") {
        const isConflict = result.code === "conflict";
        const retryScheduled = !isConflict && result.retryable && scheduleRetry();
        setStatus(isConflict ? "conflict" : retryScheduled ? "saving" : "failed");
        setErrorMessage(retryScheduled ? "" : result.errorMessage || (isConflict ? "This page has a newer saved draft. Reload before saving again." : SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE));

        if (result.code === "forbidden") {
          onAccessLost();
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
      if (reconciliationVersionRef.current !== reconciliationVersion) {
        return currentDocumentKeyRef.current === savedDocumentKeyRef.current;
      }

      if (disposedRef.current || saveGenerationRef.current !== saveGeneration) {
        return false;
      }

      const retryScheduled = scheduleRetry();
      setStatus(retryScheduled ? "saving" : "failed");
      setErrorMessage(retryScheduled ? "" : SAFE_PAGE_BODY_SAVE_ERROR_MESSAGE);
      return false;
    } finally {
      if (saveGenerationRef.current === saveGeneration) {
        saveInFlightRef.current = false;
      }
    }
  }

  const activeBlockControlTarget =
    mountedEditor && blockHandleGesture && !blockDragState
      ? (() => {
          const gestureNode = getTopLevelBlockNodeFromDoc(mountedEditor.state.doc, blockHandleGesture.blockIndex);
          return gestureNode
            ? {
                accessibleLabel: getTopLevelBlockLabelFromNode(gestureNode),
                blockIndex: blockHandleGesture.blockIndex
              }
            : hoverTarget;
        })()
      : mountedEditor && (blockTurnIntoMenu || blockActionMenu)
        ? (() => {
            const menuBlockIndex = blockTurnIntoMenu?.blockIndex ?? blockActionMenu?.blockIndex ?? null;
            if (menuBlockIndex === null) {
              return hoverTarget;
            }

            const menuNode = getTopLevelBlockNodeFromDoc(mountedEditor.state.doc, menuBlockIndex);
            return menuNode
              ? {
                  accessibleLabel: getTopLevelBlockLabelFromNode(menuNode),
                  blockIndex: menuBlockIndex
                }
              : hoverTarget;
          })()
        : hoverTarget;
  const hoveredImageTarget =
    mountedEditor && hoverTarget
      ? (() => {
          const node = getTopLevelBlockNodeFromDoc(mountedEditor.state.doc, hoverTarget.blockIndex);
          return node?.type.name === "image" ? hoverTarget : null;
        })()
      : null;
  const imageOptionsBlockIndex =
    imageResizeSession?.blockIndex ??
    imageAlignmentMenu?.blockIndex ??
    imageAlignmentPickerMenu?.blockIndex ??
    imageOptionsSession?.blockIndex ??
    hoveredImageTarget?.blockIndex ??
    null;
  const imageOptionsBlockRect =
    mountedEditor && imageOptionsBlockIndex !== null ? getTopLevelBlockRect(mountedEditor, imageOptionsBlockIndex) : null;
  const activeImageNode =
    mountedEditor && imageOptionsBlockIndex !== null
      ? getTopLevelBlockNodeFromDoc(mountedEditor.state.doc, imageOptionsBlockIndex)
      : null;
  const activeImageAttrs = activeImageNode?.type.name === "image" ? canonicalizeDocseraImageAttrs(activeImageNode.attrs) : null;
  const activeImagePreviewTheme =
    imageOptionsBlockIndex !== null && imageDisplayState.preview?.blockIndex === imageOptionsBlockIndex
      ? imageDisplayState.preview.theme
      : imageDisplayState.theme;
  const imageControlPresentation: ImageControlPresentation = "standard";
  const imageAlignmentMenuItems = [
    {
      kind: "zoom",
      label: "Zoom",
      description: "Open a fullscreen viewer",
      Icon: ZoomIn,
      role: "menuitem"
    },
    {
      kind: "frame",
      label: activeImageAttrs?.frame !== false ? "Frame image off" : "Frame image on",
      description: "Toggle the frame around the image surface",
      Icon: FrameIcon,
      role: "menuitem"
    },
    {
      kind: "alignment",
      label: `Alignment: ${activeImageAttrs?.align === "center" ? "Center" : activeImageAttrs?.align === "right" ? "Right" : "Left"}`,
      description: "Choose left, center, or right alignment",
      Icon: AlignCenter,
      role: "menuitem"
    },
    {
      kind: "options",
      label: "Image options",
      description: "Open the image settings panel",
      Icon: EllipsisVertical,
      role: "menuitem"
    }
  ] as const;
  const imageAlignmentPickerMenuItems = [
    {
      kind: "left",
      label: "Left",
      description: "Move the image to the left",
      Icon: AlignLeft
    },
    {
      kind: "center",
      label: "Center",
      description: "Center the image",
      Icon: AlignCenter
    },
    {
      kind: "right",
      label: "Right",
      description: "Move the image to the right",
      Icon: AlignRight
    }
  ] as const;
  const imagePreviewControlGroupStyle =
    imageOptionsBlockRect ? buildImagePreviewControlGroupStyle(imageOptionsBlockRect) : undefined;
  const imageOptionsControlGroupStyle =
    imageOptionsBlockRect ? buildImageOptionsControlGroupStyle(imageOptionsBlockRect) : undefined;
  const imageAlignmentMenuRect =
    editor && imageAlignmentMenu ? getImageControlGroupRect(overlayRoot, imageAlignmentMenu.blockIndex) : null;
  const imageAlignmentMenuTriggerRect =
    editor && imageAlignmentMenu ? getImageControlButtonRect(overlayRoot, imageAlignmentMenu.blockIndex, "actions") : null;
  const imageAlignmentMenuStyle =
    editor && imageAlignmentMenu && imageAlignmentMenuRect && imageAlignmentMenuTriggerRect
      ? resolveToolbarMenuSurfaceStyle(
          overlayOwnerDocument,
          imageAlignmentMenuRect,
          imageAlignmentMenuTriggerRect,
          { width: IMAGE_ALIGNMENT_MENU_WIDTH, height: IMAGE_ALIGNMENT_MENU_HEIGHT },
          "start"
        )
      : undefined;
  const imageAlignmentPickerMenuRect =
    editor && imageAlignmentPickerMenu ? getImageControlGroupRect(overlayRoot, imageAlignmentPickerMenu.blockIndex) : null;
  const imageAlignmentPickerMenuTriggerRect =
    editor && imageAlignmentPickerMenu
      ? getImageControlButtonRect(overlayRoot, imageAlignmentPickerMenu.blockIndex, "alignment")
      : null;
  const imageAlignmentPickerMenuStyle =
    editor && imageAlignmentPickerMenu && imageAlignmentPickerMenuRect
      ? resolveToolbarMenuSurfaceStyle(
          overlayOwnerDocument,
          imageAlignmentPickerMenuRect,
          imageAlignmentPickerMenuTriggerRect ?? imageAlignmentPickerMenu.anchorRect,
          { width: IMAGE_ALIGNMENT_MENU_WIDTH, height: IMAGE_ALIGNMENT_MENU_HEIGHT },
          "start"
        )
      : undefined;
  const imageResizeBlockRect = imageResizeSession?.targetRect ?? imageOptionsBlockRect;
  const imageResizeHandleLeftStyle =
    imageResizeBlockRect && imageOptionsBlockIndex !== null ? buildImageResizeHandleStyle(imageResizeBlockRect, "left") : undefined;
  const imageResizeHandleRightStyle =
    imageResizeBlockRect && imageOptionsBlockIndex !== null ? buildImageResizeHandleStyle(imageResizeBlockRect, "right") : undefined;
  const imageOptionsPanelStyle =
    editor && imageOptionsSession
      ? buildImageOptionsPanelStyle(overlayOwnerDocument, imageOptionsSession.anchorRect, imageOptionsSession.placement)
      : undefined;
  useEffect(() => {
    if (imageOptionsBlockIndex === null) {
      clearDocseraImagePreviewState();
      return;
    }

    setDocseraImagePreviewState({
      blockIndex: imageOptionsBlockIndex,
      theme
    });
  }, [imageOptionsBlockIndex, theme]);
  const hoverTargetRect =
    mountedEditor && activeBlockControlTarget ? getTopLevelBlockRect(mountedEditor, activeBlockControlTarget.blockIndex) : null;
  const gutterAnchorRect = hoverTargetRect ? buildQuickAddAnchorRect(hoverTargetRect) : null;
  const gutterButtonStyle = gutterAnchorRect ? buildGutterButtonStyle(gutterAnchorRect) : undefined;
  const gutterHandleStyle = gutterAnchorRect ? buildGutterHandleStyle(gutterAnchorRect) : undefined;
  const blockDragDropIndicatorStyle =
    mountedEditor &&
    blockDragState &&
    blockDragState.destinationIndex !== null &&
    isValidBlockDragDestinationIndex(
      mountedEditor.state.doc.childCount,
      blockDragState.sourceBlockIndex,
      blockDragState.sourceBlockEndIndex,
      blockDragState.destinationIndex
    )
      ? buildTopLevelBlockDropIndicatorStyle(mountedEditor, blockDragState.destinationIndex, {
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
  const blockActionMenuNode =
    mountedEditor && blockActionMenu ? getTopLevelBlockNodeFromDoc(mountedEditor.state.doc, blockActionMenu.blockIndex) : null;
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
  const blockTurnIntoMenuHeight = getBlockTurnIntoMenuHeight(blockTurnIntoCommands.length);
  const blockTurnIntoSelectedCommandId = blockActionMenuNode ? getTurnIntoBlockCommandIdFromNode(blockActionMenuNode) : null;
  const blockActionMenuSurfaceRect = blockActionMenuSurfaceRef.current?.getBoundingClientRect() ?? null;
  const blockTurnIntoMenuStyle =
    editor && blockTurnIntoMenu
      ? buildBlockTurnIntoMenuSurfaceStyle(
          overlayOwnerDocument,
          blockTurnIntoMenu.anchorRect,
          BLOCK_TURN_INTO_MENU_WIDTH,
          blockTurnIntoMenuHeight,
          blockTurnIntoMenu.placement,
          blockActionMenuSurfaceRect
        )
      : undefined;
  const quickAddAnchorRect =
    commandSelector && commandSelector.source === "quickAdd" && mountedEditor
      ? getTopLevelBlockRect(mountedEditor, commandSelector.insertedBlockIndex)
        ? buildQuickAddSelectorAnchorRect(getTopLevelBlockRect(mountedEditor, commandSelector.insertedBlockIndex)!)
        : commandSelector.fallbackAnchorRect
      : null;
  const slashAnchorRect =
    commandSelector && commandSelector.source === "slash" && mountedEditor
      ? (() => {
          const ownerBlockRect = getTopLevelBlockRect(mountedEditor, commandSelector.ownerBlockIndex);
          const caretRect = getCaretBounds(mountedEditor);
          return ownerBlockRect && caretRect ? buildSlashSelectorAnchorRect(ownerBlockRect, caretRect) : commandSelector.anchorRect;
        })()
      : null;
  const selectorStyle =
    commandSelector && mountedEditor
      ? commandSelector.source === "slash"
        ? buildSurfaceStyle(
            overlayOwnerDocument,
            slashAnchorRect ?? commandSelector.anchorRect,
            BLOCK_SELECTOR_WIDTH,
            BLOCK_SELECTOR_HEIGHT,
            commandSelector.placement
          )
        : buildQuickAddSelectorSurfaceStyle(
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
          --docsera-palette-gray-text: #475569;
          --docsera-palette-red-text: #b42318;
          --docsera-palette-orange-text: #b54708;
          --docsera-palette-yellow-text: #8a6100;
          --docsera-palette-green-text: #067647;
          --docsera-palette-blue-text: #175cd3;
          --docsera-palette-purple-text: #6941c6;
          --docsera-palette-pink-text: #c11574;
          --docsera-palette-gray-highlight: color-mix(in srgb, #cbd5e1 48%, transparent);
          --docsera-palette-red-highlight: color-mix(in srgb, #fda29b 48%, transparent);
          --docsera-palette-orange-highlight: color-mix(in srgb, #fdba74 48%, transparent);
          --docsera-palette-yellow-highlight: color-mix(in srgb, #fde68a 58%, transparent);
          --docsera-palette-green-highlight: color-mix(in srgb, #86efac 48%, transparent);
          --docsera-palette-blue-highlight: color-mix(in srgb, #93c5fd 48%, transparent);
          --docsera-palette-purple-highlight: color-mix(in srgb, #c4b5fd 48%, transparent);
          --docsera-palette-pink-highlight: color-mix(in srgb, #f9a8d4 48%, transparent);
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
          --docsera-palette-gray-text: #cbd5e1;
          --docsera-palette-red-text: #fda29b;
          --docsera-palette-orange-text: #fdba74;
          --docsera-palette-yellow-text: #fde68a;
          --docsera-palette-green-text: #86efac;
          --docsera-palette-blue-text: #93c5fd;
          --docsera-palette-purple-text: #c4b5fd;
          --docsera-palette-pink-text: #f9a8d4;
          --docsera-palette-gray-highlight: color-mix(in srgb, #94a3b8 34%, transparent);
          --docsera-palette-red-highlight: color-mix(in srgb, #b42318 46%, transparent);
          --docsera-palette-orange-highlight: color-mix(in srgb, #b54708 46%, transparent);
          --docsera-palette-yellow-highlight: color-mix(in srgb, #8a6100 52%, transparent);
          --docsera-palette-green-highlight: color-mix(in srgb, #067647 46%, transparent);
          --docsera-palette-blue-highlight: color-mix(in srgb, #175cd3 46%, transparent);
          --docsera-palette-purple-highlight: color-mix(in srgb, #6941c6 46%, transparent);
          --docsera-palette-pink-highlight: color-mix(in srgb, #c11574 46%, transparent);
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
          color: var(--docsera-document-text-color, var(--docsera-editor-text));
          caret-color: var(--docsera-editor-primary);
          font-family: var(--docsera-document-body-font-family, Inter, "Segoe UI", sans-serif);
          font-size: var(--docsera-document-body-font-size, 1rem);
          line-height: var(--docsera-document-body-line-height, 1.7);
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
          margin: 0 0 var(--docsera-document-block-spacing, 1rem);
        }
        .docsera-editor-runtime__surface .ProseMirror > p[data-docsera-empty-paragraph="true"] {
          position: relative;
        }
        .docsera-editor-runtime__surface .ProseMirror p[data-placeholder]:not([data-docsera-command-query-owner])::before,
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
          margin: var(--docsera-document-heading-margin, 1.4rem 0 0.7rem);
          font-family: var(--docsera-document-heading-font-family, Inter, "Segoe UI", sans-serif);
          line-height: var(--docsera-document-heading-line-height, 1.2);
          scroll-margin-block-start: var(--docsera-workspace-heading-scroll-margin);
          scroll-margin-top: var(--docsera-workspace-heading-scroll-margin);
        }
        .docsera-editor-runtime__surface .ProseMirror h1 {
          font-size: var(--docsera-document-h1-font-size, 1.9rem);
          letter-spacing: var(--docsera-document-h1-letter-spacing, -0.025em);
        }
        .docsera-editor-runtime__surface .ProseMirror h2 {
          font-size: var(--docsera-document-h2-font-size, 1.65rem);
          letter-spacing: var(--docsera-document-h2-letter-spacing, -0.02em);
        }
        .docsera-editor-runtime__surface .ProseMirror h3 {
          font-size: var(--docsera-document-h3-font-size, 1.25rem);
        }
        .docsera-editor-runtime__surface .ProseMirror ul,
        .docsera-editor-runtime__surface .ProseMirror ol {
          margin: 0 0 var(--docsera-document-block-spacing, 1rem);
          padding-left: var(--docsera-document-list-padding-left, 1.5rem);
        }
        .docsera-editor-runtime__surface .ProseMirror li + li {
          margin-top: var(--docsera-document-list-item-gap, 0.35rem);
        }
        .docsera-editor-runtime__surface .ProseMirror ul[data-type="taskList"] {
          padding-left: 0;
          list-style: none;
        }
        .docsera-editor-runtime__surface .ProseMirror li[data-type="taskItem"] {
          display: grid !important;
          grid-template-columns: auto minmax(0, 1fr);
          align-items: flex-start;
          gap: 0.5rem;
        }
        .docsera-editor-runtime__surface .ProseMirror li[data-type="taskItem"] > label {
          display: block;
          grid-column: 1;
          margin-top: 0.25em;
        }
        .docsera-editor-runtime__surface .ProseMirror li[data-type="taskItem"] > label input[type="checkbox"] {
          width: 1rem;
          height: 1rem;
          margin: 0;
          accent-color: var(--docsera-primary) !important;
          cursor: pointer;
        }
        .docsera-editor-runtime__surface .ProseMirror li[data-type="taskItem"] > div {
          grid-column: 2;
          min-width: 0;
        }
        .docsera-editor-runtime__surface .ProseMirror li[data-type="taskItem"][data-checked="true"] > div > p {
          color: var(--docsera-editor-muted);
          text-decoration: line-through;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-runtime__block--selected {
          background: var(--docsera-editor-block-selection);
          box-shadow: none;
          border-radius: 0;
        }
        .docsera-editor-runtime__surface .ProseMirror blockquote {
          margin: 0 0 var(--docsera-document-block-spacing, 1rem);
          padding-left: var(--docsera-document-blockquote-padding-left, 1rem);
          border-left: 3px solid var(--docsera-document-blockquote-border-color, color-mix(in srgb, var(--docsera-primary) 38%, var(--docsera-border)));
          color: var(--docsera-document-blockquote-color, var(--docsera-editor-muted));
        }
        .docsera-editor-runtime__surface .ProseMirror blockquote > p[data-placeholder]::before {
          content: attr(data-placeholder);
          float: left;
          height: 0;
          color: var(--docsera-editor-muted);
          font-style: italic;
          pointer-events: none;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion {
          margin: 1rem 0;
          border: 1px solid color-mix(in srgb, var(--docsera-border) 82%, var(--docsera-text-soft));
          border-radius: 18px;
          overflow: visible;
          background: color-mix(in srgb, var(--docsera-surface) 94%, var(--docsera-surface-muted) 6%);
        }
        .docsera-editor-runtime__surface .ProseMirror > .docsera-editor-accordion:first-child {
          margin-top: 0;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion.docsera-editor-runtime__block--selected {
          background: var(--docsera-editor-block-selection);
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__item {
          position: relative;
          display: grid;
          --docsera-editor-accordion-title-row-height: 3.4rem;
          --docsera-editor-accordion-title-row-center: calc(var(--docsera-editor-accordion-title-row-height) / 2);
          --docsera-editor-accordion-control-size: 1.7rem;
          --docsera-editor-accordion-chevron-size: 18px;
          --docsera-editor-accordion-toggle-left: calc(
            1.1rem - ((var(--docsera-editor-accordion-control-size) - var(--docsera-editor-accordion-chevron-size)) / 2)
          );
          --docsera-editor-accordion-menu-gap: 0.35rem;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__item + .docsera-editor-accordion__item {
          border-top: 1px solid color-mix(in srgb, var(--docsera-border) 82%, var(--docsera-text-soft));
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__controls {
          position: absolute;
          inset: 0;
          pointer-events: none;
          z-index: 2;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__add-lane {
          position: absolute;
          left: 100%;
          top: 0;
          width: 2.25rem;
          height: 100%;
          pointer-events: auto;
          background: transparent;
          cursor: pointer;
          z-index: 0;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__control {
          position: absolute;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: var(--docsera-editor-accordion-control-size);
          height: var(--docsera-editor-accordion-control-size);
          padding: 0;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: var(--docsera-text-muted);
          font: inherit;
          cursor: pointer;
          pointer-events: auto;
          transition: background-color 0.16s ease, color 0.16s ease, box-shadow 0.16s ease, opacity 0.16s ease,
            transform 0.16s ease, visibility 0.16s ease;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__control--ellipsis:hover,
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__control--ellipsis:focus-visible,
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__control--add:hover,
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__control--add:focus-visible {
          background: var(--docsera-surface-muted);
          color: var(--docsera-primary);
          outline: none;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__control--ellipsis:focus-visible,
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__control--add:focus-visible {
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--docsera-primary) 18%, white 20%);
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__control--ellipsis svg,
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__control--add svg {
          width: 14px;
          height: 14px;
          flex: 0 0 auto;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__control--toggle {
          left: var(--docsera-editor-accordion-toggle-left);
          top: var(--docsera-editor-accordion-title-row-center);
          transform: translateY(-50%);
          color: var(--docsera-text-soft);
          opacity: 1;
          visibility: visible;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__control--toggle .docsera-editor-accordion__chevron {
          transform: rotate(0deg);
          transition: transform 0.16s ease;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__control--toggle:hover {
          background: transparent;
          color: var(--docsera-text-soft);
          box-shadow: none;
          outline: none;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__control--toggle:focus-visible {
          background: transparent;
          color: var(--docsera-text-soft);
          outline: none;
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--docsera-primary) 18%, white 20%);
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__item[data-docsera-accordion-open="true"] .docsera-editor-accordion__control--toggle {
          transform: translateY(-50%);
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__item[data-docsera-accordion-open="true"] .docsera-editor-accordion__control--toggle .docsera-editor-accordion__chevron {
          transform: rotate(90deg);
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__delete-item {
          color: var(--docsera-error);
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__delete-item:hover,
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__delete-item:focus-visible,
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__delete-item.docsera-block-menu__item--active {
          background: color-mix(in srgb, var(--docsera-error) 10%, var(--docsera-surface));
          color: var(--docsera-error);
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__delete-item:disabled,
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__delete-item:disabled:hover,
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__delete-item:disabled:focus-visible,
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__delete-item:disabled.docsera-block-menu__item--active {
          color: var(--docsera-text-soft);
          background: transparent;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__control--ellipsis,
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__control--add {
          opacity: 0;
          visibility: hidden;
          pointer-events: none;
          top: var(--docsera-editor-accordion-title-row-center);
          transform: translateY(-50%);
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__item:hover .docsera-editor-accordion__control--ellipsis,
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__item:focus-within .docsera-editor-accordion__control--ellipsis,
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__item[data-docsera-accordion-item-affordances-visible="true"] .docsera-editor-accordion__control--ellipsis,
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__item[data-docsera-accordion-item-menu-open="true"] .docsera-editor-accordion__control--ellipsis {
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion:hover .docsera-editor-accordion__item[data-docsera-accordion-item-last="true"] .docsera-editor-accordion__control--add,
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion:focus-within .docsera-editor-accordion__item[data-docsera-accordion-item-last="true"] .docsera-editor-accordion__control--add,
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__item[data-docsera-accordion-item-affordances-visible="true"][data-docsera-accordion-item-last="true"] .docsera-editor-accordion__control--add {
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__control--ellipsis {
          right: 1.1rem;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__control--add {
          right: -2.25rem;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__menu {
          position: absolute;
          right: 1.1rem;
          top: calc(
            var(--docsera-editor-accordion-title-row-center) +
              (var(--docsera-editor-accordion-control-size) / 2) +
              var(--docsera-editor-accordion-menu-gap)
          );
          z-index: 3;
          pointer-events: auto;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__menu[hidden] {
          display: none;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__title {
          margin: 0;
          padding: 1rem 1.1rem 1rem calc(1.1rem + var(--docsera-editor-accordion-chevron-size) + 16px);
          font-family: Geist, Inter, "Segoe UI", sans-serif;
          font-size: 1rem;
          font-weight: 700;
          line-height: 1.4;
          color: var(--docsera-text);
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__title[data-placeholder]::before {
          content: attr(data-placeholder);
          float: left;
          height: 0;
          color: var(--docsera-editor-muted);
          font-style: italic;
          pointer-events: none;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__content {
          display: grid;
          gap: 12px;
          margin-top: 0;
          padding: 0 1.1rem 1rem;
          color: var(--docsera-text-muted);
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__content[hidden] {
          display: none;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__content > :first-child {
          margin-top: 0;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__content > :last-child {
          margin-bottom: 0;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-callout {
          --docsera-callout-accent: #3B82F6;
          --docsera-callout-icon-color: #2563EB;
          --docsera-callout-icon-row-offset: calc((var(--docsera-document-body-font-size) * var(--docsera-document-body-line-height) - 20px) / 2);
          width: 100%;
          margin: 1rem 0;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-callout__frame {
          display: grid;
          grid-template-columns: 20px minmax(0, 1fr);
          gap: 12px;
          box-sizing: border-box;
          width: 100%;
          padding: 16px 18px;
          border-left: 4px solid var(--docsera-callout-accent);
          border-radius: 6px;
          background: color-mix(in srgb, var(--docsera-callout-accent) 5%, var(--docsera-surface));
          color: var(--docsera-text);
        }
        .docsera-editor-runtime__surface .ProseMirror > .docsera-editor-callout:first-child {
          margin-top: 0;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-callout.docsera-editor-runtime__block--selected .docsera-editor-callout__frame {
          background: var(--docsera-editor-block-selection);
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-callout__icon {
          display: inline-flex;
          align-items: flex-start;
          justify-content: center;
          width: 20px;
          height: 20px;
          margin-top: var(--docsera-callout-icon-row-offset);
          color: var(--docsera-callout-icon-color);
          line-height: 1;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-callout__icon svg {
          width: 20px;
          height: 20px;
          flex: 0 0 20px;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-callout__content,
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-callout__body {
          min-width: 0;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-callout__content {
          position: relative;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-callout__controls {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 4px;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-callout__title,
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-callout__type {
          min-width: 0;
          background: transparent;
          color: var(--docsera-text);
          font-family: inherit;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-callout__title {
          display: block;
          box-sizing: border-box;
          width: 100%;
          min-height: calc(var(--docsera-document-body-font-size) * var(--docsera-document-body-line-height));
          resize: none;
          overflow: hidden;
          padding: 0;
          border: 0;
          border-radius: 0;
          font-size: var(--docsera-document-body-font-size);
          font-weight: 700;
          line-height: var(--docsera-document-body-line-height);
          white-space: pre-wrap;
          overflow-wrap: anywhere;
          outline: none;
          cursor: text;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-callout__title::placeholder {
          color: color-mix(in srgb, var(--docsera-text-muted) 58%, transparent);
          font-weight: 500;
          opacity: 1;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-callout[data-docsera-callout-has-title="true"] .docsera-editor-callout__title {
          margin-bottom: 8px;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-callout__type {
          padding: 0.08rem 1.35rem 0.08rem 0.35rem;
          border: 1px solid transparent;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 500;
          line-height: 1.3;
          color: var(--docsera-text-muted);
          cursor: pointer;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-callout[data-docsera-callout-has-title="false"] .docsera-editor-callout__title {
          margin-bottom: 8px;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-callout__type:hover,
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-callout__type:focus {
          border-color: color-mix(in srgb, var(--docsera-callout-accent) 45%, var(--docsera-border));
          background: color-mix(in srgb, var(--docsera-surface) 78%, white 22%);
          outline: none;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-callout__body > :first-child {
          margin-top: 0;
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-callout__body > :last-child {
          margin-bottom: 0;
        }
        html[data-docsera-theme="dark"] .docsera-editor-runtime__surface .ProseMirror .docsera-editor-callout__frame {
          background: color-mix(in srgb, var(--docsera-callout-accent) 12%, var(--docsera-surface) 88%);
        }
        html[data-docsera-theme="dark"] .docsera-editor-runtime__surface .ProseMirror .docsera-editor-callout__icon {
          color: var(--docsera-callout-accent);
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-columns {
          margin: 1rem 0;
          display: grid;
          gap: 24px;
          align-items: start;
          grid-template-columns: repeat(var(--docsera-columns-count), minmax(0, 1fr));
        }
        .docsera-editor-runtime__surface .ProseMirror .docsera-editor-columns__column {
          min-width: 0;
          display: grid;
          gap: 12px;
          overflow-wrap: anywhere;
        }
        @media (max-width: 920px) {
          .docsera-editor-runtime__surface .ProseMirror .docsera-editor-columns {
            grid-template-columns: 1fr;
          }
        }
        .docsera-editor-runtime__surface .ProseMirror pre {
          margin: 0 0 var(--docsera-document-block-spacing, 1rem);
          padding: var(--docsera-document-code-block-padding, 0.9rem 1rem);
          border-radius: var(--docsera-document-code-block-radius, 14px);
          background: var(--docsera-document-code-block-bg, color-mix(in srgb, var(--docsera-editor-panel) 86%, black 14%));
          color: var(--docsera-document-text-color, var(--docsera-editor-text));
          overflow-x: auto;
        }
        .docsera-editor-runtime__surface .ProseMirror code {
          font-family: var(--docsera-document-mono-font-family, "JetBrains Mono", "Fira Code", Consolas, monospace);
          font-size: var(--docsera-document-code-font-size, 0.92em);
        }
        .docsera-editor-runtime__surface .ProseMirror p code {
          padding: var(--docsera-document-code-inline-padding, 0.12rem 0.35rem);
          border-radius: var(--docsera-document-code-inline-radius, 0.4rem);
          background: var(--docsera-document-code-inline-bg, color-mix(in srgb, var(--docsera-editor-panel) 88%, black 12%));
        }
        .docsera-editor-runtime__surface .ProseMirror hr {
          margin: var(--docsera-document-rule-margin, 1.5rem 0);
          border: 0;
          border-top: 1px solid var(--docsera-document-rule-border-color, color-mix(in srgb, var(--docsera-editor-panel-border) 88%, transparent));
        }
        .docsera-editor-runtime__surface .ProseMirror a {
          color: var(--docsera-document-link-color, var(--docsera-primary));
          text-decoration-line: underline;
          text-decoration-color: currentColor;
          text-decoration-thickness: var(--docsera-document-link-decoration-thickness, 0.08em);
          text-underline-offset: var(--docsera-document-link-underline-offset, 0.16em);
        }
        .docsera-editor-runtime__surface .ProseMirror a:visited {
          color: var(--docsera-document-link-color, var(--docsera-primary));
          text-decoration-color: currentColor;
        }
        .docsera-editor-runtime__surface .ProseMirror a:hover,
        .docsera-editor-runtime__surface .ProseMirror a:focus-visible {
          text-decoration-thickness: var(--docsera-document-link-hover-decoration-thickness, 0.12em);
        }
        .docsera-editor-runtime__surface .ProseMirror mark {
          padding: 0.08em 0.2em;
          border-radius: 0.28em;
          background: var(--docsera-document-highlight-bg, color-mix(in srgb, #f6d84e 58%, var(--docsera-editor-panel)));
          color: inherit;
        }
        .docsera-editor-runtime__surface .ProseMirror mark[data-docsera-highlight-color] {
          background: transparent;
        }
        .docsera-editor-runtime__surface .ProseMirror [data-docsera-text-color="gray"] {
          color: var(--docsera-palette-gray-text);
        }
        .docsera-editor-runtime__surface .ProseMirror [data-docsera-text-color="red"] {
          color: var(--docsera-palette-red-text);
        }
        .docsera-editor-runtime__surface .ProseMirror [data-docsera-text-color="orange"] {
          color: var(--docsera-palette-orange-text);
        }
        .docsera-editor-runtime__surface .ProseMirror [data-docsera-text-color="yellow"] {
          color: var(--docsera-palette-yellow-text);
        }
        .docsera-editor-runtime__surface .ProseMirror [data-docsera-text-color="green"] {
          color: var(--docsera-palette-green-text);
        }
        .docsera-editor-runtime__surface .ProseMirror [data-docsera-text-color="blue"] {
          color: var(--docsera-palette-blue-text);
        }
        .docsera-editor-runtime__surface .ProseMirror [data-docsera-text-color="purple"] {
          color: var(--docsera-palette-purple-text);
        }
        .docsera-editor-runtime__surface .ProseMirror [data-docsera-text-color="pink"] {
          color: var(--docsera-palette-pink-text);
        }
        .docsera-editor-runtime__surface .ProseMirror [data-docsera-highlight-color="gray"] {
          background: var(--docsera-palette-gray-highlight);
        }
        .docsera-editor-runtime__surface .ProseMirror [data-docsera-highlight-color="red"] {
          background: var(--docsera-palette-red-highlight);
        }
        .docsera-editor-runtime__surface .ProseMirror [data-docsera-highlight-color="orange"] {
          background: var(--docsera-palette-orange-highlight);
        }
        .docsera-editor-runtime__surface .ProseMirror [data-docsera-highlight-color="yellow"] {
          background: var(--docsera-palette-yellow-highlight);
        }
        .docsera-editor-runtime__surface .ProseMirror [data-docsera-highlight-color="green"] {
          background: var(--docsera-palette-green-highlight);
        }
        .docsera-editor-runtime__surface .ProseMirror [data-docsera-highlight-color="blue"] {
          background: var(--docsera-palette-blue-highlight);
        }
        .docsera-editor-runtime__surface .ProseMirror [data-docsera-highlight-color="purple"] {
          background: var(--docsera-palette-purple-highlight);
        }
        .docsera-editor-runtime__surface .ProseMirror [data-docsera-highlight-color="pink"] {
          background: var(--docsera-palette-pink-highlight);
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
          z-index: 29;
        }
        .docsera-editor-floating-layer--block-dragging,
        .docsera-editor-floating-layer--block-dragging * {
          cursor: grabbing !important;
        }
        ${EDITOR_SCROLLBAR_STYLES}
        ${BLOCK_SELECTOR_STYLES}
        ${COMPACT_MENU_STYLES}
        ${EDITOR_DROPDOWN_MOTION_STYLES}
        ${IMAGE_PICKER_STYLES}
        ${IMAGE_OPTIONS_STYLES}
        ${EDITOR_IMAGE_STYLES}
        ${DOCSERA_TOOLTIP_STYLES}

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
          border-left: 3px solid var(--docsera-document-blockquote-border-color, color-mix(in srgb, var(--docsera-primary) 38%, var(--docsera-border)));
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
          --docsera-editor-menu-row-hover-bg: color-mix(in srgb, var(--docsera-primary-soft) 58%, #ffffff 42%);
          --docsera-editor-menu-row-hover-fg: var(--docsera-primary);
          border: 1px solid color-mix(in srgb, var(--docsera-border) 92%, white 8%);
          border-radius: 12px;
          background: color-mix(in srgb, var(--docsera-surface) 96%, white 4%);
          box-shadow: 0 18px 40px rgba(15, 23, 42, 0.16), 0 3px 12px rgba(15, 23, 42, 0.08);
          overflow: hidden;
        }
        :host-context(html[data-docsera-theme="dark"]) .docsera-block-action-menu,
        :host-context(html[data-docsera-theme="dark"]) .docsera-block-turn-into-menu {
          --docsera-editor-menu-row-hover-bg: rgba(70, 72, 212, 0.16);
        }
        .docsera-block-action-menu__list,
        .docsera-block-turn-into-menu__list {
          display: grid;
          gap: 0;
          padding: 8px;
        }
        .docsera-block-turn-into-menu__list {
          min-height: 0;
          overflow-y: auto;
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
          background: var(--docsera-editor-menu-row-hover-bg);
          color: var(--docsera-editor-menu-row-hover-fg);
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
        .docsera-block-menu__item:disabled,
        .docsera-block-menu__item:disabled:hover,
        .docsera-block-menu__item:disabled:focus-visible {
          opacity: 0.45;
          cursor: not-allowed;
          color: var(--docsera-text-soft);
          background: transparent;
          box-shadow: none;
          outline: none;
        }
        .docsera-block-menu__item--destructive:disabled,
        .docsera-block-menu__item--destructive:disabled:hover,
        .docsera-block-menu__item--destructive:disabled:focus-visible,
        .docsera-block-menu__item--destructive:disabled.docsera-block-menu__item--active {
          color: var(--docsera-text-soft);
          background: transparent;
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
        @media (prefers-reduced-motion: reduce) {
          .docsera-editor-runtime__surface .ProseMirror .docsera-editor-accordion__control--toggle .docsera-editor-accordion__chevron {
            transition: none;
          }
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
          if (!editor || !isInteractionActive || !(event.target instanceof HTMLElement)) return;
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
          focusOrAppendEditableFinalParagraph(editor);
        }}
      >
        <EditorContent editor={editor} />
        {isInteractionActive && historyControlsEditor && !historyControlsMount ? (
          <div className="docsera-editor-command-controls">
            <EditorHistoryControls canEdit={isEditable} editor={historyControlsEditor} ownerDocument={overlayOwnerDocument} />
            <EmojiPickerControls canEdit={isEditable} editor={historyControlsEditor} ownerDocument={overlayOwnerDocument} />
          </div>
        ) : null}
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
                onMouseEnter={(event) => {
                  showGutterTooltip({
                    anchorRect: event.currentTarget.getBoundingClientRect(),
                    id: "quickAdd"
                  });
                }}
                onMouseLeave={clearGutterTooltip}
                onFocus={(event) => {
                  showGutterTooltip(
                    {
                      anchorRect: event.currentTarget.getBoundingClientRect(),
                      id: "quickAdd"
                    },
                    true
                  );
                }}
                onBlur={clearGutterTooltip}
                onMouseDown={(event) => {
                  clearGutterTooltip();
                  event.preventDefault();
                }}
                onClick={() => {
                  clearGutterTooltip();
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
                onMouseEnter={(event) => {
                  showGutterTooltip({
                    anchorRect: event.currentTarget.getBoundingClientRect(),
                    id: "handle"
                  });
                }}
                onMouseLeave={clearGutterTooltip}
                onMouseDown={(event) => {
                  clearGutterTooltip();
                  event.preventDefault();
                }}
                onPointerDown={(event) => {
                  clearGutterTooltip();
                  handleBlockHandlePointerDown({
                    blockIndex: activeBlockControlTarget.blockIndex,
                    event,
                    targetRect: hoverTargetRect
                  });
                }}
                onClick={(event) => {
                  clearGutterTooltip();
                  event.preventDefault();
                  event.stopPropagation();
                }}
              >
                <GripVertical size={QUICK_ADD_ICON_SIZE} strokeWidth={2.2} aria-hidden="true" focusable="false" />
              </button>
            ) : null}

            {gutterTooltip ? (
              <DocseraTooltip
                anchorRect={gutterTooltip.anchorRect}
                className={`docsera-editor-floating__gutter-tooltip docsera-editor-floating__gutter-tooltip--${gutterTooltip.id}`}
                ownerDocument={overlayOwnerDocument}
                tooltipRef={gutterTooltipRef}
              >
                {gutterTooltip.id === "handle" ? (
                  <>
                    <span className="docsera-tooltip__line">
                      <span className="docsera-tooltip__label">Drag </span>
                      <span className="docsera-tooltip__label docsera-tooltip__muted">to move</span>
                    </span>
                    <span className="docsera-tooltip__line">
                      <span className="docsera-tooltip__label">Click </span>
                      <span className="docsera-tooltip__label docsera-tooltip__muted">for actions</span>
                    </span>
                  </>
                ) : (
                  <span className="docsera-tooltip__label">Insert block</span>
                )}
              </DocseraTooltip>
            ) : null}

            {editor && imageOptionsBlockIndex !== null && imagePreviewControlGroupStyle ? (
              <div
                className={`docsera-image-preview-group${imageOptionsSession?.blockIndex === imageOptionsBlockIndex ? " docsera-image-preview-group--active" : ""}`}
                style={imagePreviewControlGroupStyle}
                data-docsera-image-preview-controls="true"
                data-docsera-image-preview-controls-block-index={imageOptionsBlockIndex}
              >
                <DocseraCompactTooltip label="Light preview" ownerDocument={overlayOwnerDocument}>
                  <button
                    type="button"
                    className={`docsera-image-controls-button${activeImagePreviewTheme === "light" ? " docsera-image-controls-button--selected" : ""}`}
                    aria-pressed={activeImagePreviewTheme === "light"}
                    aria-label="Light preview"
                    data-docsera-image-preview-control="true"
                    data-docsera-image-preview-control-kind="light"
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onClick={() => {
                      if (imageOptionsBlockIndex === null) {
                        return;
                      }

                      setDocseraImagePreviewState({
                        blockIndex: imageOptionsBlockIndex,
                        theme: "light"
                      });
                    }}
                  >
                    <SunMedium size={14} strokeWidth={2.2} aria-hidden="true" focusable="false" />
                  </button>
                </DocseraCompactTooltip>
                <DocseraCompactTooltip label="Dark preview" ownerDocument={overlayOwnerDocument}>
                  <button
                    type="button"
                    className={`docsera-image-controls-button${activeImagePreviewTheme === "dark" ? " docsera-image-controls-button--selected" : ""}`}
                    aria-pressed={activeImagePreviewTheme === "dark"}
                    aria-label="Dark preview"
                    data-docsera-image-preview-control="true"
                    data-docsera-image-preview-control-kind="dark"
                    onMouseDown={(event) => {
                      event.preventDefault();
                    }}
                    onClick={() => {
                      if (imageOptionsBlockIndex === null) {
                        return;
                      }

                      setDocseraImagePreviewState({
                        blockIndex: imageOptionsBlockIndex,
                        theme: "dark"
                      });
                    }}
                  >
                    <Moon size={14} strokeWidth={2.2} aria-hidden="true" focusable="false" />
                  </button>
                </DocseraCompactTooltip>
              </div>
            ) : null}

            {editor && imageOptionsBlockIndex !== null && imageOptionsControlGroupStyle ? (
              <div
                className={`docsera-image-controls-group${imageOptionsSession?.blockIndex === imageOptionsBlockIndex ? " docsera-image-controls-group--active" : ""} docsera-image-controls-group--${imageControlPresentation}`}
                style={imageOptionsControlGroupStyle}
                data-docsera-image-controls="true"
                data-docsera-image-controls-block-index={imageOptionsBlockIndex}
                data-docsera-image-controls-presentation={imageControlPresentation}
              >
                {imageControlPresentation === "standard" ? (
                  <>
                    <DocseraCompactTooltip label="Zoom" ownerDocument={overlayOwnerDocument}>
                      <button
                        type="button"
                        className="docsera-image-controls-button"
                        aria-haspopup="dialog"
                        aria-label="Zoom"
                      data-docsera-image-control="true"
                      data-docsera-image-controls-block-index={imageOptionsBlockIndex}
                      data-docsera-image-control-kind="zoom"
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onClick={(event) => {
                        openImageFullscreenFromBlock(imageOptionsBlockIndex, event.currentTarget);
                      }}
                      >
                        <ZoomIn size={14} strokeWidth={2.2} aria-hidden="true" focusable="false" />
                      </button>
                    </DocseraCompactTooltip>
                    <DocseraCompactTooltip label="Frame" ownerDocument={overlayOwnerDocument}>
                      <button
                        type="button"
                        className={`docsera-image-controls-button${activeImageAttrs?.frame !== false ? " docsera-image-controls-button--selected" : ""}`}
                        aria-pressed={activeImageAttrs?.frame !== false}
                        aria-label={`Frame image ${activeImageAttrs?.frame !== false ? "on" : "off"}`}
                      data-docsera-image-control="true"
                      data-docsera-image-controls-block-index={imageOptionsBlockIndex}
                      data-docsera-image-control-kind="frame"
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onClick={() => {
                        toggleImageFrame(imageOptionsBlockIndex);
                      }}
                      >
                        <FrameIcon size={14} strokeWidth={2.2} aria-hidden="true" focusable="false" />
                      </button>
                    </DocseraCompactTooltip>
                    <DocseraCompactTooltip label={`Alignment: ${activeImageAttrs?.align === "center" ? "Center" : activeImageAttrs?.align === "right" ? "Right" : "Left"}`} ownerDocument={overlayOwnerDocument}>
                      <button
                        type="button"
                        className="docsera-image-controls-button"
                        aria-haspopup="menu"
                        aria-controls={imageAlignmentPickerMenuId}
                        aria-expanded={imageAlignmentPickerMenu?.blockIndex === imageOptionsBlockIndex}
                        aria-label={`Alignment: ${activeImageAttrs?.align === "center" ? "Center" : activeImageAttrs?.align === "right" ? "Right" : "Left"}`}
                      data-docsera-image-control="true"
                      data-docsera-image-controls-block-index={imageOptionsBlockIndex}
                      data-docsera-image-control-kind="alignment"
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onClick={(event) => {
                        if (imageAlignmentPickerMenu?.blockIndex === imageOptionsBlockIndex) {
                          closeImageAlignmentPickerMenu({ focusEditor: false });
                          return;
                        }

                        openImageAlignmentPickerMenu(imageOptionsBlockIndex, event.currentTarget.getBoundingClientRect());
                      }}
                      >
                        <AlignCenter size={14} strokeWidth={2.2} aria-hidden="true" focusable="false" />
                      </button>
                    </DocseraCompactTooltip>
                    <DocseraCompactTooltip label="Image options" ownerDocument={overlayOwnerDocument}>
                      <button
                        type="button"
                        className="docsera-image-controls-button docsera-image-options-trigger"
                        aria-haspopup="dialog"
                        aria-controls={imageOptionsPanelId}
                        aria-expanded={imageOptionsSession !== null}
                        aria-label="Image options"
                      data-docsera-image-options="true"
                      data-docsera-image-controls-block-index={imageOptionsBlockIndex}
                      data-docsera-image-options-block-index={imageOptionsBlockIndex}
                      data-docsera-image-control-kind="options"
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onClick={(event) => {
                        const controlGroup = event.currentTarget.closest<HTMLElement>("[data-docsera-image-controls='true']");
                        if (!controlGroup) {
                          return;
                        }

                        openImageOptions(imageOptionsBlockIndex, controlGroup.getBoundingClientRect());
                      }}
                      >
                        <EllipsisVertical size={14} strokeWidth={2.2} aria-hidden="true" focusable="false" />
                      </button>
                    </DocseraCompactTooltip>
                  </>
                ) : (
                  <>
                    <DocseraCompactTooltip label="More image actions" ownerDocument={overlayOwnerDocument}>
                      <button
                        type="button"
                        className="docsera-image-controls-button"
                        aria-haspopup="menu"
                        aria-controls={imageAlignmentMenuId}
                        aria-expanded={imageAlignmentMenu?.blockIndex === imageOptionsBlockIndex}
                        aria-label="More image actions"
                      data-docsera-image-control="true"
                      data-docsera-image-controls-block-index={imageOptionsBlockIndex}
                      data-docsera-image-control-kind="actions"
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onClick={() => {
                        if (imageAlignmentMenu?.blockIndex === imageOptionsBlockIndex) {
                          closeImageAlignmentMenu({ focusEditor: false });
                          return;
                        }

                        openImageAlignmentMenu(imageOptionsBlockIndex);
                      }}
                      >
                        <EllipsisVertical size={14} strokeWidth={2.2} aria-hidden="true" focusable="false" />
                      </button>
                    </DocseraCompactTooltip>
                  </>
                )}
              </div>
            ) : null}

            {editor && imageOptionsBlockIndex !== null && activeImageAttrs && imageResizeHandleLeftStyle && imageResizeHandleRightStyle ? (
              <div className="docsera-image-resize-group" data-docsera-image-resize-group="true" data-docsera-image-resize-block-index={imageOptionsBlockIndex}>
                <button
                  type="button"
                  className="docsera-image-resize-handle docsera-image-resize-handle--left"
                  aria-label="Resize image from left edge"
                  tabIndex={-1}
                  data-docsera-image-resize-handle="true"
                  data-docsera-image-resize-handle-edge="left"
                  style={imageResizeHandleLeftStyle}
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onPointerDown={(event) => {
                    startImageResizeSession(imageOptionsBlockIndex, "left", event);
                  }}
                />
                <button
                  type="button"
                  className="docsera-image-resize-handle docsera-image-resize-handle--right"
                  aria-label="Resize image from right edge"
                  tabIndex={-1}
                  data-docsera-image-resize-handle="true"
                  data-docsera-image-resize-handle-edge="right"
                  style={imageResizeHandleRightStyle}
                  onMouseDown={(event) => {
                    event.preventDefault();
                  }}
                  onPointerDown={(event) => {
                    startImageResizeSession(imageOptionsBlockIndex, "right", event);
                  }}
                />
              </div>
            ) : null}

            {editor && imageAlignmentMenu && imageAlignmentMenuStyle ? (
              <div
                className={`docsera-compact-menu docsera-image-alignment-menu docsera-editor-dropdown--enter${imageAlignmentMenu.blockIndex === imageOptionsBlockIndex ? " docsera-image-alignment-menu--active" : ""}`}
                style={imageAlignmentMenuStyle}
                role="menu"
                id={imageAlignmentMenuId}
                aria-label="Image actions"
                data-docsera-image-alignment-menu="true"
                data-docsera-image-alignment-menu-block-index={imageAlignmentMenu.blockIndex}
                onKeyDown={handleImageAlignmentMenuKeyDown}
              >
                {imageAlignmentMenuItems.map((option, index) => {
                  const isSelected =
                    option.kind === "frame"
                      ? activeImageAttrs?.frame !== false
                      : false;
                  const isActive = imageAlignmentMenu.activeIndex === index;
                  return (
                    <button
                      key={option.kind}
                      ref={(element) => {
                        imageAlignmentMenuItemRefs.current[index] = element;
                      }}
                      type="button"
                      className={`docsera-compact-menu__item${isActive ? " docsera-compact-menu__item--active" : ""}${isSelected ? " docsera-compact-menu__item--selected" : ""}`}
                      role={option.role}
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onClick={() => {
                        executeImageControlMenuAction(imageAlignmentMenu.blockIndex, index);
                      }}
                    >
                      <span className="docsera-compact-menu__item-icon" aria-hidden="true">
                        <option.Icon size={14} strokeWidth={2.2} focusable="false" />
                      </span>
                      <span className="docsera-compact-menu__item-copy">
                        <span className="docsera-compact-menu__item-title">{option.label}</span>
                        <span className="docsera-compact-menu__item-description">{option.description}</span>
                      </span>
                      {isSelected ? <Check size={14} strokeWidth={2.2} aria-hidden="true" focusable="false" /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {editor && imageAlignmentPickerMenu && imageAlignmentPickerMenuStyle ? (
              <div
                className={`docsera-compact-menu docsera-image-alignment-menu docsera-image-alignment-menu--picker docsera-editor-dropdown--enter${imageAlignmentPickerMenu.blockIndex === imageOptionsBlockIndex ? " docsera-image-alignment-menu--active" : ""}`}
                style={imageAlignmentPickerMenuStyle}
                role="menu"
                id={imageAlignmentPickerMenuId}
                aria-label="Alignment options"
                data-docsera-image-alignment-menu="true"
                data-docsera-image-alignment-menu-block-index={imageAlignmentPickerMenu.blockIndex}
                onKeyDown={handleImageAlignmentPickerMenuKeyDown}
              >
                {imageAlignmentPickerMenuItems.map((option, index) => {
                  const isSelected = activeImageAttrs?.align === option.kind;
                  const isActive = imageAlignmentPickerMenu.activeIndex === index;
                  return (
                    <button
                      key={option.kind}
                      ref={(element) => {
                        imageAlignmentPickerMenuItemRefs.current[index] = element;
                      }}
                      type="button"
                      className={`docsera-compact-menu__item${isActive ? " docsera-compact-menu__item--active" : ""}${isSelected ? " docsera-compact-menu__item--selected" : ""}`}
                      role="menuitemradio"
                      aria-checked={isSelected}
                      onMouseDown={(event) => {
                        event.preventDefault();
                      }}
                      onClick={() => {
                        applyImageAlignment(imageAlignmentPickerMenu.blockIndex, option.kind);
                      }}
                    >
                      <span className="docsera-compact-menu__item-icon" aria-hidden="true">
                        <option.Icon size={14} strokeWidth={2.2} focusable="false" />
                      </span>
                      <span className="docsera-compact-menu__item-copy">
                        <span className="docsera-compact-menu__item-title">{option.label}</span>
                        <span className="docsera-compact-menu__item-description">{option.description}</span>
                      </span>
                      {isSelected ? <Check size={14} strokeWidth={2.2} aria-hidden="true" focusable="false" /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}

            {blockActionMenu && blockActionMenuStyle && blockActionMenuNode ? (
              <div
                ref={blockActionMenuSurfaceRef}
                className="docsera-editor-floating docsera-block-selector docsera-block-action-menu docsera-editor-dropdown--fade-enter"
                style={blockActionMenuStyle}
                role="menu"
                id={blockActionMenuId}
                aria-label={`Block actions for ${getTopLevelBlockLabelFromNode(blockActionMenuNode)}`}
                data-surface="block-actions"
                onKeyDown={handleBlockActionMenuKeyDown}
              >
                <div className="docsera-block-action-menu__list docsera-editor-dropdown--shift-enter">
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
                className="docsera-editor-floating docsera-block-selector docsera-block-turn-into-menu docsera-editor-dropdown--enter"
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
                className="docsera-editor-floating docsera-block-selector docsera-editor-dropdown--enter"
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

            {isInteractionActive && mountedEditor && imageOptionsSession && imageOptionsPanelStyle ? (
              <ImageOptionsPanel
                blockIndex={imageOptionsSession.blockIndex}
                editor={mountedEditor}
                initialAttrs={imageOptionsSession.initialAttrs}
                isEscapeDismissalDeferred={imageAlignmentMenu !== null}
                mediaAdapter={mediaAdapter}
                onClose={() => {
                  closeImageOptions({ focusEditor: true });
                }}
                overlayRoot={overlayRoot}
                panelId={imageOptionsPanelId}
                panelStyle={imageOptionsPanelStyle}
                sessionId={imageOptionsSession.sessionId}
              />
            ) : null}

            {isInteractionActive && mountedEditor ? (
              <CompactTextToolbar
                canEdit={isEditable}
                editor={mountedEditor}
                isTextSelectionPointerOrigin={isCaretStripTextSelectionPointerOrigin}
                ownerDocument={overlayOwnerDocument}
                ownerWindow={overlayOwnerWindow}
                overlayRoot={overlayRoot}
              />
            ) : null}
            {isInteractionActive && mountedEditor ? (
              <TableControlsOverlay
                editor={mountedEditor}
                onStructuredTableClipboardCopy={handleStructuredTableClipboardCopy}
                overlayRoot={overlayRoot}
              />
            ) : null}
            {isInteractionActive ? (
              <ImagePickerDialog
                isOpen={imagePickerSession !== null}
                mediaAdapter={mediaAdapter}
                onClose={() => {
                  closeImagePicker({ restoreSelection: true });
                }}
                onInsert={insertImageFromPicker}
                overlayRoot={overlayRoot}
                sessionId={imagePickerSession?.sessionId ?? ""}
              />
            ) : null}
            {isInteractionActive && imageFullscreenSession ? (
              <ImageFullscreenViewer
                overlayRoot={overlayRoot}
                isOpen={imageFullscreenOpen}
                onDismissed={() => {
                  setImageFullscreenSession(null);
                }}
                onRequestClose={() => {
                  setImageFullscreenOpen(false);
                }}
                session={imageFullscreenSession}
                theme={theme}
              />
            ) : null}
          </div>,
          overlayRoot
        )}
      </div>
    </section>
  );
}
