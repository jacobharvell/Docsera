# Implementation Notes - E4-T1B1 Single-Block Handle and Selection Gesture

Date: 2026-08-04

Status: implementation note

## Purpose

This note records the repository-side correction for E4-T1B1 after the installed-runtime pass added a compact single-block handle and transient block selection behavior to the shared gutter runtime.

It describes repo behavior only. Accepted product behavior remains defined by the Obsidian requirements and the MVP implementation plan.

## Corrected Gutter Geometry

The visible controls now share one fixed editor-owned gutter geometry contract.

- the gutter reserves `69px` total: `24px` Quick Add, `6px` between the controls, `24px` handle, and `15px` between the handle and document content
- Quick Add is positioned first and the drag handle is positioned second inside that reserved lane
- the shell-reserved gutter width, the runtime hit-test lane, and the floating-control positioning all read from the same `BLOCK_GUTTER_WIDTH` contract
- the handle is not part of document flow and does not reserve a separate layout lane
- the handle is rendered as a compact icon button with a `Select block: ...` label
- the handle is not tab-stop focusable in the normal document flow
- the handle remains pointer-owned only; no menu surface opens from the handle in this task

The original `60px` gutter and Quick Add offset combination was too narrow for the two-control group, so the handle extended into the content column. The corrected contract moves Quick Add left far enough to contain both controls while preserving the content column position, and this follow-up widens the control gap by `2px` for slightly more breathing room.

The attached annotated screenshot was used as manual visual evidence. Its current examples marked bad showed the overlap and capsule selection treatment; the Legacy example marked good showed the intended flat gutter separation and rectangular selection tint.

## Gesture Ownership

Pointer down on the handle now starts a short-lived selection gesture instead of a reorder or menu interaction.

- pointer down records the block index, pointer id, origin point, and a drag-intent flag
- movement beyond the 4 px threshold marks the session as drag intent only
- pointer up below the threshold selects the whole top-level block
- pointer up after drag intent does not mutate the document and does not open a menu
- pointer cancel, lost pointer capture, page hide, visibility change, or window blur clears the gesture without mutating content

This preserves the accepted distinction between a click gesture that selects a block and a drag gesture that must not produce accidental menu or mutation behavior.

## Transient Selection State

Block selection is transient runtime state, not durable document content.

- the selected block is stored as editor plugin metadata and is remapped through document changes
- the selection is cleared when the owner block disappears
- the selection is cleared on ordinary selection changes that are not produced by the block-selection plugin itself
- the selection is cleared when the editor is disabled, the session identity changes, or the surface loses ownership outside the editor/overlay roots
- the transient selection does not create undo history, dirty state, or autosave activity

The correction keeps the runtime selection local to the editor lifecycle so it can survive harmless document mapping changes without becoming a second persisted state source.

## Selected Block Presentation

The selected top-level block now uses a flat, theme-aware tint only.

- the selected-block decoration keeps the existing top-level block selection model
- the visible treatment is background-only; there is no inset ring, no visible border, and no rounded selection capsule
- the tint spans the usable content width of the selected top-level block and does not include the gutter controls
- the selection styling does not change layout, margins, padding, line wrapping, document flow, or gutter alignment
- the tint uses current Docsera theme tokens rather than copying Legacy colors directly

This changes the presentation only. It does not replace the functional selection model, the transaction mapping, or the cleanup behavior.

## Deliberate Non-Goals

This task does not add the later block-action surface.

- no `Turn into` menu
- no Duplicate or Delete action
- no block reordering
- no multi-select
- no keyboard menu opening
- no drag/drop preview or auto-scroll

Those behaviors remain for later follow-on tasks in the E4 block-control series.

## Validation

The installed-runtime correction was validated with:

- `npm --prefix app/docsera-ui run test -- src/client/editor/PageEditorHostRuntime.commands.test.tsx src/client/editor/PageEditorHostRuntime.core.test.tsx`
- `npm --prefix app/docsera-ui run test:suite -- editor-interactions editor-contract`
- `npm --prefix app/docsera-ui run build`
- `npm --prefix app/docsera-ui run deploy:sdk`
- `npm --prefix app/docsera-ui run verify:sdk-runtime`

The regression coverage now proves the shared gutter is wide enough for both controls, the click-versus-drag threshold is respected, gesture cancellation is clean, the transient block selection maps through document edits, the non-durable state boundary remains intact, and the selected-block presentation is background-only without a ring or rounded capsule.
