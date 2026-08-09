# Implementation Notes - E4-T2C2 Long-Document Auto-Scroll

Date: 2026-08-09

Status: implementation note

## Purpose

This note records the repository-side implementation for E4-T2C2. It describes repo behavior only. Accepted product behavior remains defined by the Obsidian requirements and the MVP implementation plan.

## Summary

Docsera editor drag and panel-background range selection now share one vertical auto-scroll controller. The controller runs only while an owning gesture is active, uses live measured viewport geometry, scrolls the editor document viewport vertically near the top or bottom edge, and invokes the owning gesture's existing target-refresh path after each scroll frame so stationary pointers continue progressing through newly exposed blocks.

## Scroll Owner And Viewport Boundary

The runtime resolves the scroll owner from the measured editor shell rather than assuming the global window.

- `PageEditorHostRuntime.tsx` resolves the light-DOM owner from the active editor surface.
- `main.docsera-main` is used as the editor document viewport when it is vertically scrollable.
- The owner document scrolling element is a fallback only when the main pane is not scrollable.
- The auto-scroll viewport uses the scroll owner's live `getBoundingClientRect()`, `scrollTop`, `scrollHeight`, and `clientHeight`.

The top activation boundary accounts for fixed-header clearance by reading the measured runtime style contract in this order:

- `scroll-padding-top`
- `--docsera-workspace-heading-scroll-margin`
- `--docsera-header-height`

This keeps top-edge scrolling and refreshed destinations below the fixed application header without hard-coding shell subtraction.

## Shared Auto-Scroll Responsibility

`src/client/editor/editorAutoScroll.ts` owns the shared mechanics:

- edge-zone request calculation
- modest acceleration near the edge
- remaining-scroll clamping
- vertical-only scroll application
- requestAnimationFrame lifecycle
- deterministic stop/cancel behavior

The current implementation detail is a `72px` activation edge zone and an `18px` maximum per-frame scroll delta. These values are not product requirements.

## Drag Integration

`useTopLevelBlockDragSession.ts` keeps owning block-drag pointer lifecycle. Auto-scroll is attached only after the existing drag threshold starts a drag session.

- The source block or selected contiguous range remains the existing drag source.
- Pointer coordinates are stored on the existing gesture ref.
- Each auto-scroll frame recomputes the canonical destination from live block DOM rects using the same `resolveTopLevelBlockDropIndex(...)` path as pointer movement.
- The drag ghost and insertion feedback remain the existing E4-T2A/E4-T2C1 presentation.
- Cleanup runs through the existing drag cleanup path, which also stops any queued auto-scroll frame.

Single-block and multi-block drag share this path; E4-T2C2 did not add a second drag system or another selected-range representation.

## Range Selection Integration

`PageEditorHostRuntime.tsx` keeps owning the panel-background range gesture. Auto-scroll is attached only after the existing range gesture activates.

- The original anchor block remains fixed in `gutterRangeGestureRef`.
- Pointer coordinates are stored on the active gesture.
- Each scroll frame reuses the same range-update routine as pointer movement, so the selected block range expands, contracts, or reverses from the fixed anchor as geometry changes.
- Selection-only auto-scroll updates transient block-selection metadata and marquee geometry only.
- It does not mutate the document, create undo entries, mark the page dirty, or trigger autosave.

Escape now terminates an active range gesture through the owner-document keydown listener, matching the required active-gesture cleanup behavior.

## Stationary Pointer Progression

Auto-scroll frames call back into the owning gesture after every successful scroll. That callback recomputes drag destinations or range targets from live block rectangles even when no new pointermove event occurs. Moving the pointer away from the edge causes the next frame to produce a zero scroll request and the frame loop stops.

## Lifecycle Cleanup

Auto-scroll sessions stop through the existing owning gesture cleanup paths:

- pointer release
- Escape
- pointer cancel
- lost pointer ownership
- invalid or cancelled drag
- access/editability loss
- page/session changes
- visibility/page lifecycle events already owned by each gesture
- window blur where already part of the owning contract
- runtime teardown

No retry loop, delay, watchdog, native HTML drag/drop path, or duplicate termination system was added.

## Legacy Evidence Reviewed

Legacy files/tests inspected:

- `C:\Dev\docsera-editor-reference\studio\src\components\Editor.tsx`
- `C:\Dev\docsera-editor-reference\studio\src\components\editor\useBlockContextDragHandleController.ts`
- `C:\Dev\docsera-editor-reference\studio\tests\e2e\gutter-selection-regressions.spec.ts`

Legacy identified interaction ownership broadly through window/document listeners, the TipTap DragHandle extension, editor DOM geometry, and controller refs. The inspected legacy sources did not contain a dedicated measured scroll-owner auto-scroll loop with `scrollBy`/`scrollTop` ownership for long-document gutter drag or selection. Stationary refresh behavior existed in adjacent form through requestAnimationFrame scheduling for mousemove bridging and post-drag cleanup, while native drag behavior delegated some drag scrolling to browser/extension behavior.

Useful behavior retained:

- top-level block geometry drives drag and selection targets
- range selection keeps a fixed anchor while the active endpoint changes
- frame scheduling can refresh interaction targets without requiring immediate React rerender coupling
- cleanup must clear transient drag/selection presentation deterministically

Obsolete or incompatible behavior not carried forward:

- broad global-DOM ownership
- native browser drag presentation
- DragHandle-extension finalization assumptions
- controller-wide selection and drag coupling
- legacy mousemove bridge assumptions unrelated to the current pointer-session model

## Regression Coverage

Focused coverage was added to:

- `src/client/editor/PageEditorHostRuntime.drag.test.tsx`
- `src/client/editor/PageEditorHostRuntime.selection.test.tsx`

The new tests cover:

- no scrolling outside edge regions
- upward and downward edge activation
- greater scroll requests nearer the edge
- remaining-scroll clamping
- fixed-header top clearance
- measured `main.docsera-main` scroll-owner resolution
- frame lifecycle start/stop behavior
- stationary single-block drag progression while the destination updates after scroll
- upward drag auto-scroll while preserving the source selection
- moving away from the edge stops further scrolling
- release/cancel cleanup leaves no active drag presentation
- panel-background range selection auto-scroll with the original anchor preserved
- range selection expansion/reversal as block geometry changes after scroll
- selection-only scrolling creates no mutation, undo entry, dirty state, or autosave

## Validation

Completed validation:

- `npm ci`
- `npm --prefix app/docsera-ui run test -- src/client/editor/PageEditorHostRuntime.drag.test.tsx src/client/editor/PageEditorHostRuntime.selection.test.tsx`
- `npm --prefix app/docsera-ui run test:suite -- editor-interactions editor-contract`
- `npm --prefix app/docsera-ui run build`
- `npm --prefix app/docsera-ui run verify:editor-runtime-boundary`
- `npm --prefix app/docsera-ui run deploy:sdk`

Established `verify:sdk-runtime` completed as part of the SDK deployment path.

Existing lucide sourcemap warnings and ignored `"use client"` warnings remained non-fatal during validation.

Interactive browser/PDI acceptance remained Jacob-owned and was not performed by Codex.

## Jacob Manual Acceptance

Jacob completed the E4-T2C2 installed-browser manual acceptance successfully on August 9, 2026.

1. In Edit mode, create or open a long document with enough body blocks to require vertical scrolling.
2. Single-block drag downward: drag a single block handle near the bottom edge and hold the pointer still. Expected: the main editor pane scrolls down, the ghost remains intact, and the insertion destination advances as new blocks appear.
3. Single-block drag upward: repeat near the top edge. Expected: scrolling respects the fixed header and destinations do not hide beneath it.
4. Selected-range drag downward and upward: select a contiguous block range, drag any handle in the selected range near each edge, and confirm the whole range stays the source with one intact ghost.
5. Confirm inside-range and equivalent range destinations still show no insertion line and do not move the document.
6. Panel-background range selection downward and upward: drag from blank editor panel background near each edge and hold. Expected: the original anchor stays fixed while the range updates as blocks enter view.
7. Move the pointer away from the edge during drag and range selection. Expected: auto-scroll stops immediately.
8. Release and Escape during each gesture. Expected: auto-scroll stops and no residual gesture state remains.
9. Confirm no horizontal auto-scroll occurs.
10. Confirm normal short-document single drag, selected-range drag, and panel-background range selection still behave unchanged.
