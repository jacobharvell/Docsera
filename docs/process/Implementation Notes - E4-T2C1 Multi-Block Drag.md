# Implementation Notes - E4-T2C1 Multi-Block Drag

Date: 2026-08-09

Status: implementation note

## Purpose

This note records the repository-side implementation for E4-T2C1. It describes repo behavior only. Accepted product behavior remains defined by the Obsidian requirements and the MVP implementation plan.

## Summary

Docsera top-level gutter drag now supports moving an already-selected contiguous top-level block range as one unit. The existing E4-T2A pointer-session drag architecture remains the owner of the gesture, destination resolution, cancellation, and cleanup path. E4-T2C1 extends the source resolution and transaction helpers so single-block and multi-block drag share the same canonical drop model, preserves a live contiguous selection long enough for the handle to resolve click-versus-drag ownership, and moves the source span with native ProseMirror content captured from the authoritative pre-delete document.

## Installed-Browser Failure

Jacob reproduced the failure in the installed browser before this correction and then ran an independent browser-level event trace.

- the selected-range source issue was improved, and the drag ghost now showed the expected multi-block preview
- releasing the mouse no longer completed the drop
- the block or selected range stayed visibly grabbed
- the drag state and ghost did not terminate
- the regression affected both single-block and multi-block drag

The trace proved that the browser did deliver the terminal release. A trusted `pointerup` reached the owning window, `handlePointerUpListener` executed, and the drop path entered the shared block-move implementation. The move then threw `Cannot read properties of undefined (reading 'nodeSize')` inside ProseMirror fragment construction before the transaction completed and before drag-session cleanup ran.

The confirmed root cause was the move helper's fragile source reconstruction. It deleted the range in a transaction, recalculated the destination from the post-delete document, then rebuilt the source by re-indexing individual children from `editor.state.doc`, JSON-round-tripping each child, and passing that array to `Fragment.from(...)`. The installed runtime proved that this reconstruction could hand ProseMirror an invalid fragment entry. The correction captures the complete source content from the authoritative pre-delete ProseMirror document with `doc.slice(sourceFrom, sourceTo).content`, deletes the source span, resolves the adjusted insertion point in the transaction document, and inserts the retained native content into the same transaction.

## Runtime Boundary

`PageEditorHostRuntime.tsx` still owns:

- gutter handle rendering
- pointer feedback and insertion-line rendering
- session cleanup on access, page, and lifecycle changes
- wiring between editor runtime state and drag modules

The runtime now resolves the active drag source range from the current transient contiguous block selection when the pressed handle belongs to that range. If the handle is outside the selected range, the drag remains a single-block source. A handle press on an already-selected range no longer allows the capture-phase block-control path to destroy the source before the handle's own pointerup threshold check completes. Drag completion uses the established owner-document pointer lifecycle from E4-T2A, with deterministic cleanup on cancel, lost pointer, page hide, visibility loss, blur, invalid release, and unexpected move failure.

## Drag Modules

`src/client/editor/blockDragReorder.ts` now owns:

- top-level block geometry collection
- canonical drop-index resolution
- source-range validation for single and contiguous multi-block drags
- range-aware preview HTML generation
- single-transaction range move execution

`src/client/editor/useTopLevelBlockDragSession.ts` still owns:

- handle press tracking before drag starts
- 4 px pointer threshold handling and pointer-session lifecycle
- Escape, blur, visibility, cancel, and owner-document release cleanup
- whole-editor drag acceptance before destination resolution
- valid-drop completion and cancellation behavior

## Source Range Contract

The drag source is resolved from the current transient range-selection state:

- if the pressed handle belongs to the active contiguous selection, the complete selected range becomes the drag source;
- if the pressed handle is not inside the active selection, drag behaves as a single-block source;
- the transient range selection remains runtime UI state and is not promoted to document content.

This keeps multi-block drag tied to the existing E4-T2B range-selection contract instead of creating a second selection model.

## Corrected Handle Ownership Contract

The handle gesture now owns its own click-versus-drag disambiguation before transient selection is cleared.

- owner-document capture handling still leaves Quick Add and other non-handle block-control presses on their established path
- a handle press that lands on an already-selected contiguous range preserves that transient selection through the threshold check
- if the pointer never crosses the drag threshold, pointerup collapses the range to the clicked block and opens that block's menu
- if the pointer crosses the drag threshold, the preserved contiguous range becomes the drag source and the ghost contains every selected block in order
- release is observed through the established owner-document `pointerup` listener
- unexpected move failures still surface to the caller, but the transient drag session is cleaned up in a deterministic `finally` boundary
- the fix does not add a second selection model, timing delay, native HTML5 drag behavior, or alternate drag system

## Destination Contract

The existing canonical top-level drop model is reused.

- one destination boundary exists per gap, plus the before-first and after-last boundaries;
- destinations inside the selected source range are invalid;
- destinations that would leave the range in the same place are treated as no-op and do not render an insertion line;
- valid drops still use the existing top-level insertion boundary and a single document-changing transaction.

## Selection And Undo Contract

A successful range move must:

- reorder the document in one document-changing transaction
- create one undo step relative to the current editor history
- preserve the moved contiguous selection at its new location
- continue normal autosave flow without custom replay or recovery behavior
- clear drag state without clearing the successful drop selection

The move transaction captures the complete source span as native ProseMirror content from the pre-delete document, deletes that span, and reinserts the retained content in its original order. The follow-up selection update is non-history UI state.

## Drag Preview Contract

The active drag ghost now represents every selected block in the dragged contiguous range.

- the preview HTML is sanitized to remove interactive and editor-owned attributes
- the preview remains inert and pointer-transparent
- the rendered order matches the selected block order
- the preview uses normal block presentation rather than a synthetic label-only ghost

## Test Placement

Focused regressions live in `src/client/editor/PageEditorHostRuntime.drag.test.tsx` and remain part of the managed editor-interaction coverage.

The new regressions cover:

- dragging from the first, middle, and final handles of a selected contiguous range
- upward, downward, before-first, between-block, and after-last movement
- multi-block ghost presentation
- inside-range and equivalent no-op rejection without insertion-line presentation
- undo restoration and post-drop range preservation
- cancellation cleanup
- unselected-handle single-block drag behavior while a range is already selected
- direct transaction-helper coverage for single-block before-first, between-block, and after-last movement
- direct transaction-helper coverage for heterogeneous heading, list, and blockquote range movement before-first, between-block, and after-last
- native source-content preservation, one document-changing move transaction, one undo step, and invalid/no-op rejection without mutation
- existing single-block click-threshold behavior remains under the established single-block regressions

The companion selection regression in `src/client/editor/PageEditorHostRuntime.selection.test.tsx` keeps Quick Add clearing behavior intact while proving that a selected-range handle press now preserves the range until the handle resolves click-versus-drag ownership.

## Validation

Validation for this task should use the focused editor regressions and the managed frontend validation path already established by the repository.

## Jacob Manual Acceptance

1. In Edit mode, select a contiguous block range using the existing panel-background range gesture.
2. Drag the handle on the first, middle, and final block of that range and confirm the whole range moves as one unit.
3. Confirm a valid drop preserves block order, keeps the moved range selected, and shows a ghost that renders every selected block.
4. Confirm inside-range and equivalent no-op destinations show no insertion line and do not move the document.
5. Confirm Escape, pointer cancel, and invalid release clean up the gesture without moving the range.
6. Confirm a handle outside the selected range still performs the ordinary single-block drag path.
