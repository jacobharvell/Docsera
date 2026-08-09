import type { Editor } from "@tiptap/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import type { BlockDragState, TopLevelBlockDragSourceRange } from "./blockDragReorder";
import {
  getTopLevelBlockDragPreview,
  isPointWithinTopLevelBlockDropZone,
  isValidBlockDragDestinationIndex,
  moveTopLevelBlocks,
  resolveTopLevelBlockDropIndex
} from "./blockDragReorder";

type BlockHandleGestureState = {
  blockIndex: number;
  dragIntent: boolean;
  lastClientX: number;
  lastClientY: number;
  originX: number;
  originY: number;
  pointerId: number;
};

type UseTopLevelBlockDragSessionInput = {
  clearTransientBlockSelection: () => void;
  closeBlockActionMenus: (options?: { focusEditor?: boolean; syncHoverFromPointer?: boolean }) => void;
  closeCommandSelector: (options?: { syncHoverFromPointer?: boolean }) => void;
  editableRef: RefObject<boolean>;
  editorRef: RefObject<Editor | null>;
  focusTopLevelBlockSelection: (editor: Editor, blockIndex: number) => void;
  getTopLevelBlockRange: (editor: Editor, blockIndex: number) => { from: number; to: number } | null;
  gestureThresholdPx: number;
  gutterWidth: number;
  resolveDragSourceRange: (editor: Editor, blockIndex: number) => TopLevelBlockDragSourceRange;
  openBlockActionMenu: (blockIndex: number, source: "handle" | "keyboard", anchorRect: DOMRect) => void;
  scheduleOverlayMeasurement: () => void;
  selectTopLevelBlockRange: (startBlockIndex: number, endBlockIndex: number) => void;
  selectBlockFromHandle: (blockIndex: number) => void;
};

type HandlePointerDownInput = {
  blockIndex: number;
  event: ReactPointerEvent<HTMLButtonElement>;
  targetRect: DOMRect;
};

export function useTopLevelBlockDragSession(input: UseTopLevelBlockDragSessionInput) {
  const {
    clearTransientBlockSelection,
    closeBlockActionMenus,
    closeCommandSelector,
    editableRef,
    editorRef,
    focusTopLevelBlockSelection,
    getTopLevelBlockRange,
    gestureThresholdPx,
    gutterWidth,
    resolveDragSourceRange,
    openBlockActionMenu,
    scheduleOverlayMeasurement,
    selectTopLevelBlockRange,
    selectBlockFromHandle
  } = input;
  const [blockDragState, setBlockDragState] = useState<BlockDragState | null>(null);
  const [blockHandleGestureState, setBlockHandleGestureState] = useState<BlockHandleGestureState | null>(null);
  const blockDragStateRef = useRef<BlockDragState | null>(null);
  const blockHandleGestureRef = useRef<BlockHandleGestureState | null>(null);
  const blockHandleGestureCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    blockDragStateRef.current = blockDragState;
  }, [blockDragState]);

  const clearBlockHandleGesture = useCallback(() => {
    blockHandleGestureRef.current = null;
    setBlockHandleGestureState(null);
    if (blockHandleGestureCleanupRef.current) {
      blockHandleGestureCleanupRef.current();
      blockHandleGestureCleanupRef.current = null;
    }
  }, []);

  const clearBlockDragSession = useCallback(
    (options: { clearSelection?: boolean } = {}) => {
      const { clearSelection = true } = options;
      blockDragStateRef.current = null;
      setBlockDragState(null);
      clearBlockHandleGesture();
      if (clearSelection) {
        clearTransientBlockSelection();
      }
    },
    [clearBlockHandleGesture, clearTransientBlockSelection]
  );

  const startBlockDragSession = useCallback(
    (blockIndex: number, clientX: number, clientY: number) => {
      const runtimeEditor = editorRef.current;
      if (!runtimeEditor || runtimeEditor.isDestroyed) {
        return false;
      }

      const dragSourceRange = resolveDragSourceRange(runtimeEditor, blockIndex);
      const preview = getTopLevelBlockDragPreview(
        runtimeEditor,
        dragSourceRange.startBlockIndex,
        dragSourceRange.endBlockIndex
      );
      if (!preview) {
        return false;
      }

      if (blockDragStateRef.current?.sourceBlockIndex === blockIndex) {
        return true;
      }

      closeBlockActionMenus({ focusEditor: false, syncHoverFromPointer: true });
      closeCommandSelector({ syncHoverFromPointer: true });
      selectTopLevelBlockRange(dragSourceRange.startBlockIndex, dragSourceRange.endBlockIndex);

      const nextDragState: BlockDragState = {
        clientX,
        clientY,
        destinationIndex: blockIndex,
        pointerOffsetX: Math.max(0, clientX - preview.sourceBlockRect.left),
        pointerOffsetY: Math.max(0, clientY - preview.sourceBlockRect.top),
        previewHtml: preview.previewHtml,
        previewLabel: preview.previewLabel,
        sourceBlockEndIndex: dragSourceRange.endBlockIndex,
        sourceBlockRect: preview.sourceBlockRect,
        sourceBlockIndex: dragSourceRange.startBlockIndex
      };
      blockDragStateRef.current = nextDragState;
      setBlockDragState(nextDragState);
      return true;
    },
    [closeBlockActionMenus, closeCommandSelector, editorRef, resolveDragSourceRange, selectTopLevelBlockRange]
  );

  const updateBlockDragSession = useCallback((inputUpdate: {
    clientX: number;
    clientY: number;
    destinationIndex: number | null;
  }) => {
    const currentDragState = blockDragStateRef.current;
    if (
      !currentDragState ||
      currentDragState.clientX === inputUpdate.clientX &&
        currentDragState.clientY === inputUpdate.clientY &&
        currentDragState.destinationIndex === inputUpdate.destinationIndex
    ) {
      return;
    }

    const nextDragState: BlockDragState = {
      ...currentDragState,
      clientX: inputUpdate.clientX,
      clientY: inputUpdate.clientY,
      destinationIndex: inputUpdate.destinationIndex
    };
    blockDragStateRef.current = nextDragState;
    setBlockDragState(nextDragState);
  }, []);

  const finishBlockDragSession = useCallback(
    (options: { clientX: number; clientY: number; cancelled?: boolean }) => {
      const runtimeEditor = editorRef.current;
      const currentDragState = blockDragStateRef.current;
      if (!runtimeEditor || runtimeEditor.isDestroyed || !currentDragState) {
        clearBlockDragSession();
        return false;
      }

      const destinationIndex =
        options.cancelled || !isPointWithinTopLevelBlockDropZone(runtimeEditor, options.clientX, gutterWidth)
          ? null
          : resolveTopLevelBlockDropIndex(runtimeEditor, options.clientY);
      if (
        destinationIndex === null ||
        !isValidBlockDragDestinationIndex(
          runtimeEditor.state.doc.childCount,
          currentDragState.sourceBlockIndex,
          currentDragState.sourceBlockEndIndex,
          destinationIndex
        )
      ) {
        clearBlockDragSession();
        return false;
      }

      let didMove = false;
      try {
        didMove = moveTopLevelBlocks(
          runtimeEditor,
          currentDragState.sourceBlockIndex,
          currentDragState.sourceBlockEndIndex,
          destinationIndex,
          {
            focusTopLevelBlockSelection,
            getTopLevelBlockRange,
            selectTopLevelBlockRange
          }
        );
        return didMove;
      } finally {
        clearBlockDragSession({ clearSelection: !didMove });
        if (didMove) {
          scheduleOverlayMeasurement();
        }
      }
    },
    [
      clearBlockDragSession,
      editorRef,
      focusTopLevelBlockSelection,
      getTopLevelBlockRange,
      gutterWidth,
      scheduleOverlayMeasurement,
      selectTopLevelBlockRange
    ]
  );

  const handleBlockHandlePointerDown = useCallback(
    ({ blockIndex, event, targetRect }: HandlePointerDownInput) => {
      event.preventDefault();
      event.stopPropagation();

      const runtimeEditor = editorRef.current;
      if (!runtimeEditor || !editableRef.current || runtimeEditor.isDestroyed) {
        return;
      }

      if (event.button !== 0) {
        return;
      }

      clearBlockHandleGesture();

      const gesture: BlockHandleGestureState = {
        blockIndex,
        dragIntent: false,
        lastClientX: event.clientX,
        lastClientY: event.clientY,
        originX: event.clientX,
        originY: event.clientY,
        pointerId: event.pointerId
      };
      blockHandleGestureRef.current = gesture;
      setBlockHandleGestureState(gesture);

      const ownerDocument = event.currentTarget.ownerDocument;
      const ownerWindow = ownerDocument.defaultView;

      const cleanup = () => {
        ownerDocument.removeEventListener("keydown", handleKeyDown, true);
        ownerDocument.removeEventListener("pointermove", handlePointerMove, true);
        ownerDocument.removeEventListener("pointerup", handlePointerUp, true);
        ownerDocument.removeEventListener("pointercancel", handlePointerCancel, true);
        ownerDocument.removeEventListener("lostpointercapture", handleLostPointerCapture, true);
        ownerDocument.removeEventListener("pagehide", handlePageHide, true);
        ownerDocument.removeEventListener("visibilitychange", handleVisibilityChange, true);
        ownerWindow?.removeEventListener("blur", handleWindowBlur);
      };

      const handleKeyDown = (keyEvent: KeyboardEvent) => {
        const currentGesture = blockHandleGestureRef.current;
        if (!currentGesture) {
          return;
        }

        if (keyEvent.key !== "Escape") {
          return;
        }

        keyEvent.preventDefault();
        keyEvent.stopPropagation();
        clearBlockDragSession();
      };

      const finishGesture = (shouldSelect: boolean) => {
        if (shouldSelect) {
          selectBlockFromHandle(gesture.blockIndex);
          openBlockActionMenu(gesture.blockIndex, "handle", targetRect);
        }

        clearBlockHandleGesture();
      };

      const handlePointerMove = (pointerEvent: PointerEvent) => {
        const currentGesture = blockHandleGestureRef.current;
        if (!currentGesture || currentGesture.pointerId !== pointerEvent.pointerId) {
          return;
        }

        currentGesture.lastClientX = pointerEvent.clientX;
        currentGesture.lastClientY = pointerEvent.clientY;
        const distance = Math.hypot(pointerEvent.clientX - currentGesture.originX, pointerEvent.clientY - currentGesture.originY);
        if (distance >= gestureThresholdPx) {
          currentGesture.dragIntent = true;
          if (!blockDragStateRef.current) {
            startBlockDragSession(currentGesture.blockIndex, pointerEvent.clientX, pointerEvent.clientY);
          }
          const destinationIndex = isPointWithinTopLevelBlockDropZone(runtimeEditor, pointerEvent.clientX, gutterWidth)
            ? resolveTopLevelBlockDropIndex(runtimeEditor, pointerEvent.clientY)
            : null;
          updateBlockDragSession({
            clientX: pointerEvent.clientX,
            clientY: pointerEvent.clientY,
            destinationIndex
          });
        }
      };

      const handlePointerUp = (pointerEvent: PointerEvent) => {
        const currentGesture = blockHandleGestureRef.current;
        if (!currentGesture || currentGesture.pointerId !== pointerEvent.pointerId) {
          return;
        }

        if (currentGesture.dragIntent || blockDragStateRef.current) {
          finishBlockDragSession({ clientX: pointerEvent.clientX, clientY: pointerEvent.clientY });
          return;
        }

        finishGesture(true);
      };

      const handlePointerCancel = (pointerEvent: PointerEvent) => {
        const currentGesture = blockHandleGestureRef.current;
        if (!currentGesture || currentGesture.pointerId !== pointerEvent.pointerId) {
          return;
        }

        clearBlockDragSession();
      };

      const handleLostPointerCapture = (pointerEvent: PointerEvent) => {
        const currentGesture = blockHandleGestureRef.current;
        if (!currentGesture || currentGesture.pointerId !== pointerEvent.pointerId) {
          return;
        }

        clearBlockDragSession();
      };

      const handleWindowBlur = () => {
        clearBlockDragSession();
      };

      const handlePageHide = () => {
        clearBlockDragSession();
      };

      const handleVisibilityChange = () => {
        if (ownerDocument.visibilityState === "hidden") {
          clearBlockDragSession();
        }
      };

      ownerDocument.addEventListener("pointermove", handlePointerMove, true);
      ownerDocument.addEventListener("pointerup", handlePointerUp, true);
      ownerDocument.addEventListener("pointercancel", handlePointerCancel, true);
      ownerDocument.addEventListener("lostpointercapture", handleLostPointerCapture, true);
      ownerDocument.addEventListener("pagehide", handlePageHide, true);
      ownerDocument.addEventListener("keydown", handleKeyDown, true);
      ownerDocument.addEventListener("visibilitychange", handleVisibilityChange, true);
      ownerWindow?.addEventListener("blur", handleWindowBlur);
      blockHandleGestureCleanupRef.current = cleanup;
    },
    [
      clearBlockDragSession,
      clearBlockHandleGesture,
      editableRef,
      editorRef,
      finishBlockDragSession,
      gestureThresholdPx,
      gutterWidth,
      openBlockActionMenu,
      selectBlockFromHandle,
      startBlockDragSession,
      updateBlockDragSession
    ]
  );

  useEffect(() => () => clearBlockHandleGesture(), [clearBlockHandleGesture]);

  return {
    blockDragState,
    clearBlockDragSession,
    handleBlockHandlePointerDown,
    blockHandleGesture: blockHandleGestureState
  };
}
