## Status

Accepted implementation note.

## Summary

Docsera top-level gutter drag now supports single-block reordering with one canonical destination per gap, a single pointer-following drag presentation anchored to the pressed block, and a primary-color insertion line that stays within the content column. The active drag presentation uses the closed-fist `grabbing` cursor plus an inert faded snapshot of the dragged block instead of a second interactive editor instance.

## Runtime Boundary

`PageEditorHostRuntime.tsx` owns drag integration only:

- gutter handle rendering
- pointer-feedback and insertion-line rendering
- session cleanup on access, page, and lifecycle changes
- `grab` hover, `grabbing` press, and the single-state pointer-following drag feedback while the gutter handle is hidden during active drag
- wiring between editor runtime state and drag modules

Substantial drag mechanics do not belong in the runtime host.

## Drag Modules

`src/client/editor/blockDragReorder.ts` owns:

- top-level block geometry collection
- canonical drop-index resolution
- equivalent-position and invalid-destination rejection
- source-block geometry capture, drag-feedback geometry, inert preview sanitization, and insertion-line geometry
- single-transaction block move execution

`src/client/editor/useTopLevelBlockDragSession.ts` owns:

- handle press tracking before drag starts
- 4 px pointer threshold handling and pointer-session lifecycle
- Escape, blur, visibility, and cancel cleanup
- whole-editor drag acceptance before destination resolution
- valid-drop completion and cancellation behavior

## Pointer Session Contract

The restored contract is:

- pointerdown on the gutter handle records the gesture, prevents editor focus and text-selection interference, and does not mutate the document;
- document-level pointermove crosses the 4 px threshold and starts the drag session;
- the drag session selects the source block when it starts and then keeps updating the canonical destination as the pointer moves;
- pointerup completes either the ordinary click path or the reorder;
- pointercancel, Escape, visibility changes, page/session/access teardown, and window blur clear the session;
- the source handle may disappear after drag starts without affecting the active session.

## Selection And Undo Contract

A successful drag move must:

- reorder the document in one document-changing transaction
- create one new undo step relative to the current editor history
- preserve whole-block selection on the moved block
- continue normal autosave flow without custom replay or recovery behavior
- clear drag state without clearing the successful drop selection

Post-drop block selection is applied through the existing runtime selection helpers after the move dispatch, with non-history selection follow-up kept separate from the single reorder transaction. Successful drops and active drags keep the whole-block selection visible until explicit cleanup, and the insertion line is centered in shared gaps without extending into the gutter controls. The gutter handle now presents `grab` on hover, `grabbing` while pressed before drag initiation, and `grabbing` plus an inert ghost snapshot while the source block is moving.

## Test Placement

Focused drag regressions live in `src/client/editor/PageEditorHostRuntime.drag.test.tsx` and are assigned to the `editor-interactions` managed suite.

The pointer-sequence regressions now explicitly guard:

- pointerdown is prevented and still keeps the ordinary click path available when the threshold is not crossed;
- movement past the 4 px threshold starts the single-state drag feedback and the canonical insertion indicator;
- the `grabbing` cursor and ghost preview remain visually identical while the pointer moves over block content, gutter, insertion-line, whitespace, and other-block regions;
- no active-drag plus badge or patterned marker is rendered;
- the ghost preview keeps the dragged block's rendered structure and fades as an inert snapshot rather than collapsing to a label;
- the source block is selected when drag begins;
- a successful pointerup reorder produces one transaction, one undo step, and the expected autosave behavior;
- invalid or outside releases cancel without mutation;
- Escape, lifecycle changes, and teardown clean up the session;
- controls return immediately after drop or cancellation.
