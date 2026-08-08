# Implementation Notes - E4-T2B Gutter Multi-Block Selection and Range Delete

Date: 2026-08-08

Status: implementation note

## Purpose

This note records the repository-side implementation for E4-T2B. It describes repo behavior only. Accepted product behavior remains defined by the Obsidian requirements and the MVP implementation plan.

## Installed-Browser Findings

Jacob's August 6 installed trace and follow-on manual check corrected the remaining boundary interpretation for E4-T2B.

- the retained trace showed that the rejected press exposed `MAIN.docsera-main`
- the composed path still could not be required to contain the constrained article, editor host, runtime surface, or `.ProseMirror`
- the already-installed correction had the marquee, persistent block highlights, and near-block caret strip working from currently recognized regions
- the remaining failure was specific to presses in the empty left and right workspace-main side bands outside the constrained article
- the accepted full-pane selection surface and marquee presentation had already passed manual verification and remained unchanged by this follow-up

The important correction was that the accepted range-selection surface was the full workspace main pane, not a measured gutter lane and not the constrained document article. The existing marquee, persistent-highlight, and caret-strip behavior therefore had to be preserved while changing only the authoritative outer boundary.

## Historical Diagnostic Gate

The temporary trace gate was used only during diagnosis and was removed before merge.

- the trace had been gated by `localStorage.getItem("docsera:gutter-trace") === "1"`
- every emitted line had been prefixed with `[docsera-gutter-trace]`
- tracing stayed off by default, exposed no buffer when disabled, and was removed on runtime teardown
- when enabled, the runtime had exposed a bounded in-memory buffer at `window.__DOCSERA_GUTTER_TRACE__`
- the buffer had reset on each new primary pointerdown and did not control runtime behavior
- the final production implementation contains no `docsera:gutter-trace` localStorage gate and no `__DOCSERA_GUTTER_TRACE__` window buffer

## Trace Coverage

The temporary gutter trace had covered accepted and rejected primary pointerdown classifications plus exactly one accepted gesture from pointerdown through cleanup and next-frame final state.

- listener installation and removal
- pointerdown payload and classification
- sanitized geometry for `arm` and `ignore-zone` before returning
- accepted gesture arming
- geometry snapshots at accepted pointerdown and threshold crossing
- pointermove arrival, pointer identity, button state, activation threshold, and movement target resolution
- focus calls around `runtimeEditor.view.focus()`
- range metadata dispatch before and after the plugin transaction
- relevant ProseMirror transactions during the trace window
- explicit transient-selection clear requests and cleanup reasons
- pointerup, pointer-capture observation, and post-cleanup final state

For the classified pointerdown cases, the trace recorded:

- pointer coordinates
- runtime surface rect
- ProseMirror rect
- authoritative gutter rect
- current lane rect
- control-group rect when an anchor block is available
- nearest vertical block candidate
- relevant light-DOM host container and shell surface rects
- final classification
- resolved zone vocabulary:
  - `panel-background`
  - `title-text`
  - `content-block`
  - `caret-strip`
  - `block-control`
  - `overlay`
  - `outside-panel`

When tracing is enabled during an active marquee gesture, the runtime also records narrow marquee evidence:

- marquee element count
- marquee client rectangle
- computed display, visibility, opacity, border, background, and z-index
- resolved floating-layer theme tokens on the marquee, its portal parent when present, and the overlay root

This is intentionally narrow diagnostic support, not a second tracing framework. Runtime behavior is unchanged when the gate is off.

Jacob completed the final installed-browser acceptance on August 8, 2026, and the remaining question became branch review and merge rather than further diagnostic capture.

## Corrected Root Cause

The earlier E4-T2B implementation still solved the wrong outer boundary.

- it correctly separated panel-background selection from caret-strip intent and block/control exclusions
- but it still measured the constrained editor article as the authoritative `panelRect`
- it did not resolve the containing shell owner `main.docsera-main`
- the empty side bands were therefore rejected before gesture activation even though they are accepted workspace-main background

The corrected repository-side root cause is therefore product-hit-testing, not just gutter width drift. Shell/editor geometry still matters, but only as authoritative panel and child measurement used to classify the panel into separate contracts.

The August 6 follow-up correction also confirmed one additional installed-runtime root cause for the invisible marquee:

- the marquee element existed in code, but its portaled floating layer did not reliably inherit the runtime-scoped editor theme tokens across the portal boundary

The final fix applied the same runtime theme class to the floating layer itself and kept the trace focused on proving the resolved token contract at that boundary.

## Main Pane Geometry Contract

`src/client/editor/PageEditorHostRuntime.tsx` now resolves separate shell and document geometry through `resolveEditorLaneGeometry(...)`.

- the light-DOM ownership resolver now identifies `main.docsera-main` as the authoritative shell-owned main pane
- the resolver records distinct `mainPaneRect`, `hostSurfaceRect`, `hostContainerRect`, `surfaceRect`, and `proseMirrorRect`
- the constrained article remains `hostSurfaceRect` and is still used for document layout and child geometry
- the complete workspace main pane now owns range-selection eligibility and marquee clamping
- the shell gutter width and lane geometry remain separate placement contracts for hover, controls, and the caret strip

The runtime now classifies one coherent editor-panel partition:

- `panel-background`
  - left and right panel side areas
  - panel space above the first body block
  - panel space below the final body block
  - blank space to the left and right of rendered title text inside the title row
  - blank space above and below rendered title text inside the panel
  - blank space between the title and first body block
  - side-area positions vertically aligned with or between blocks
- `title-text`
- `content-block`
- `caret-strip`
  - the narrow breathing-room strip between controls and a text-bearing block
- `block-control`
- `overlay`
- `outside-panel`

This partition now uses authoritative main-pane and child geometry instead of requiring the runtime surface to appear in the composed path.

The runtime preserves the earlier accepted title-text-only exclusion and caret-strip behavior, but it no longer lets the constrained article define the outer selection boundary.

## Test Realism Correction

The focused selection regression now uses a realistic shell hierarchy instead of a single article-only host.

- tests build the accepted `nav -> main.docsera-main -> article.docsera-main__surface--editor -> editor host` structure plus the workspace aside
- side-band activation is exercised with `MAIN.docsera-main` as the exposed target
- the composed path intentionally omits the constrained article, host container, runtime surface, and `.ProseMirror` for the shell-owned cases
- geometry recomputation is exercised by changing the mocked main-pane and article rectangles through the same owner resolver used by the runtime

## Selection State Ownership

`src/client/editor/PageEditorHostRuntime.tsx` remains the single owner of transient block-selection state.

- the selection plugin now stores a transient top-level block anchor plus an optional contiguous range end
- a single block still uses the existing one-block transient state
- a contiguous range is represented as top-level block start positions only
- the state is remapped through doc changes and cleared if either endpoint is deleted or no longer resolves to a top-level block
- the transient state does not become canonical document content and does not introduce a second persistence path

This keeps range selection local to the editor runtime while preserving the existing single-block selection surface for handle/menu behavior.

## Separate Hover And Selection Contracts

Hover ownership and range-selection eligibility are now separate on purpose.

- block-control hover can still resolve a block across the control lane, controls, and nearby shared gutter space
- range selection can start only from `panel-background`
- a point may own block hover without being eligible to arm a range gesture
- the fixed gutter width remains a placement/control contract, not the range-selection boundary

## Block-Control Geometry Repair

The remaining E4-T2B regression was in the block-control contract, not in the accepted range-selection surface.

- the first and final hover ranges were too broad because the hover resolver still treated the shared lane as the ownership surface instead of bounded per-block rows
- the Quick Add and handle positions drifted because their anchor still followed the shared gutter rect instead of the owning block rect
- the caret strip also needed to stay block-relative so hover persistence, text-intent, and control placement all shared one block-owned row

The repaired contract is now block-relative end to end.

- `controlGroupLeft = blockRect.left - BLOCK_GUTTER_WIDTH`
- Quick Add starts at `controlGroupLeft`
- the handle starts `24px + 6px` to the right of Quick Add
- the handle's right edge stays `15px` from the block content edge
- `resolveHoverTargetBlockIndex(...)` now evaluates bounded per-block rows using the rendered block rects plus the fixed gutter width
- Quick Add, the handle, the block actions anchor, and the caret strip now derive from the owning block rect rather than the shared lane rect

## Panel-Background Range Gesture

The range gesture is now panel-background only.

- primary-button pointerdown can arm only from `panel-background`
- the existing 4 px activation threshold is preserved
- before activation, the runtime does not create a range selection, insert content, or open a menu
- rendered title text remains ordinary title interaction because the runtime now excludes only measured rendered title-text geometry rather than the full title element rectangle
- above-first origins anchor the first top-level block
- below-last origins anchor the final top-level block
- empty central inter-block background is eligible panel background rather than a separate ineligible zone
- side-area origins between adjacent blocks resolve through one stable shared vertical boundary
- after activation, the initial anchor stays fixed while the contiguous range expands, contracts, and reverses
- reasonable horizontal drift remains captured after activation

## Near-Block Caret Intent

The narrow strip immediately between controls and a text-bearing body block is now a separate caret-intent zone.

- the strip resolves to `caret-strip`
- pointer hover uses the text cursor
- pointerdown from that strip does not arm multi-block selection
- a normal click focuses the nearest valid text-start position for the top-level block
- paragraph, heading, blockquote, list, and code-block roots use the nearest valid editable start
- atomic or non-text structural blocks do not receive a fabricated caret
- accepted block-handle click and drag behavior is unchanged

Native/browser text selection is still suppressed only during an active panel-background range gesture.

## Toolbar Dismissal

The compact toolbar now owns its own outside-dismissal behavior on the owner-document pointerdown path.

- pointerdown inside the toolbar surface or its nested surfaces returns early so button, menu, tooltip, and link interactions are not preempted
- pointerdown outside those owned surfaces clears the nested surface state first and then dismisses the toolbar for the current selection
- outside-dismissal does not mutate the document, create undo history, or force a remount
- the editor still owns ordinary caret and text-selection behavior after the dismissal path runs

The surface click fallback is also guarded so a shell-owned panel-background click clears selection without falling into the standalone below-canvas paragraph-insertion path.

## Click-Suppression Review Conclusion

The runtime-adjacent click-suppression change introduced during instrumentation was reviewed against `98e539564d9fd78e87c01d48b6148e4f0f6d0ae9`.

- conclusion: necessary correction exposed by instrumentation
- retained change: releasing blank-gutter click suppression on the next animation frame instead of the earlier zero-delay timeout
- reason: the accepted blank-gutter clear path must suppress the trailing surface click long enough to avoid the empty-paragraph insertion fallback while still releasing immediately for later interactions
- focused regression support: `PageEditorHostRuntime.selection.test.tsx` keeps the persisted-range clear path stable without document mutation, menu opening, or autosave

This was not unrelated behavioral drift, so it remains in place with explicit regression coverage.

## Mapping And Lifecycle Cleanup

The transient range survives harmless mapping, and it clears when the runtime or owning session is no longer valid.

- both the anchor and range end remap through doc changes
- if a mapped endpoint is deleted or no longer lands on a top-level block, the transient range clears
- autosave acknowledgement does not clear a still-valid range
- access loss, editability loss, page/session replacement, runtime teardown, pointer cancellation, lost pointer ownership, visibility loss, page hide, and window blur clear the transient range and gesture state
- blank-gutter click suppression is released after the pointer sequence completes so the click guard does not leak to later interactions

The cleanup path stays local to the runtime host and does not introduce new document-level selection suppression.

## Range Delete Contract

Delete and Backspace now delete the full contiguous range in one document-changing transaction.

- the deletion uses one transaction for the entire selected range
- the deleted range is removed immediately without confirmation
- the transaction produces one undo step
- the transaction enters the normal dirty/autosave flow once
- after deletion, the caret lands in the following surviving top-level block when one exists
- otherwise the caret falls back to the preceding surviving block
- if the entire body is deleted, the runtime leaves exactly one valid empty paragraph using the ordinary empty-paragraph fallback
- undo restores the complete deleted range in original order, content, marks, formatting, and attributes

Single-block delete continues to work through the same helper path, but the range delete path is the new contiguous-range branch.

## Marquee And Persistent Highlights

The active gesture now uses two concurrent visuals.

- while dragging from `panel-background`, the runtime draws a pointer-inert selection marquee with a lightweight theme-aware border and translucent fill
- the floating layer now carries the runtime theme class directly so the marquee's editor tokens resolve inside the portal in the installed runtime
- the marquee appears only after the activation threshold is crossed
- it is clamped to the measured editor panel and never becomes document content or layout
- selected top-level blocks are still highlighted during the drag
- on release, the marquee disappears while the contiguous block highlights persist

The marquee is transient UI only. It does not create dirty state, autosave, or undo history.

## Test Placement

Focused regressions live in `src/client/editor/PageEditorHostRuntime.selection.test.tsx` and are assigned to the managed `editor-interactions` suite in `scripts/test-suite-manifest.mjs`.

The new regressions cover:

- rejected shell-owned pointerdown geometry tracing
- right-panel background activation
- above-first and below-last panel-background anchoring
- title-text-only exclusion inside a full-width title row
- title-geometry recomputation when title content/layout changes
- central inter-block background activation without broadening actual block rectangles
- eligible blank-gutter activation and threshold behavior
- range expansion, contraction, and reversal around a fixed anchor
- horizontal drift while a gesture is active
- active marquee visibility, cleanup, and floating-layer token resolution
- near-block caret-strip cursor and caret placement
- Quick Add, handle, document content, menu, toolbar, and shell-space non-arming
- blank-gutter click clearing
- Escape, content click, printable typing, Enter, and arrow-key clearing
- Delete and Backspace range deletion
- following-block and preceding-block caret fallback
- all-block deletion and undo restoration
- harmless mapping plus autosave acknowledgement
- pointer cancellation and session/access cleanup

## Legacy Evidence Inspected

Legacy behavior was reviewed in:

- `C:\Dev\docsera-editor-reference\studio\src\components\editor\useBlockContextDragHandleController.ts`
- `C:\Dev\docsera-editor-reference\studio\src\components\editor\editorBlockSelectionUtils.ts`
- `C:\Dev\docsera-editor-reference\studio\tests\e2e\gutter-selection-regressions.spec.ts`

Useful Legacy behavior retained:

- editor-owned side/background selection is distinct from content clicking
- top-level block ownership is resolved from geometry shared across the gutter lane
- range intent is separate from document mutation
- transient selection survives harmless mapping but clears on invalidation

Obsolete or incompatible Legacy architecture deliberately not copied:

- broad controller ownership
- global-DOM assumptions
- native drag machinery
- `NodeRangeSelection` dependency
- multi-block drag ghosts or drag preview presentation
- additive or noncontiguous selection construction

The later selected-range drag presentation remains out of scope for E4-T2B.

## Validation

Validation performed for this task includes:

- exact changed coverage:
  - `npm --prefix app/docsera-ui run test -- src/client/editor/editorBlockHover.test.ts src/client/editor/PageEditorHostRuntime.commands.test.tsx src/client/editor/PageEditorHostRuntime.selection.test.tsx src/client/editor/PageEditorHostRuntime.drag.test.tsx src/client/editor/PageEditorHostRuntime.core.test.tsx`
- the affected managed suites:
  - `npm --prefix app/docsera-ui run test:suite -- editor-interactions editor-contract`
- current frontend build:
  - `npm --prefix app/docsera-ui run build`
- established runtime-boundary verification:
  - `npm --prefix app/docsera-ui run verify:editor-runtime-boundary`
- SDK deployment and installed-runtime verification:
  - `npm --prefix app/docsera-ui run deploy:sdk`
  - `npm --prefix app/docsera-ui run verify:sdk-runtime`
- inline runtime CSS verification was intentionally skipped because this follow-up did not change runtime CSS

Jacob completed the final installed-browser acceptance on Saturday, August 8, 2026. The temporary diagnostic gate was removed before merge, and E4-T2B remains unmerged pending final branch review and merge.

## Jacob Manual Acceptance

1. In Edit mode, drag from the empty left outer band of the workspace main pane and confirm the marquee begins at the actual press point, appears after threshold, and leaves the expected contiguous highlights after release.
2. Repeat from the empty right outer band of the workspace main pane and confirm the same behavior.
3. Drag from one outer band across the constrained article into the opposite outer band and confirm the marquee stays clamped to the main pane and the gesture remains contiguous.
4. Start from above the first body block and below the final body block while still inside the main pane and confirm the first or final block anchors correctly.
5. Confirm the navigation panel, navigation resizer, ToC rail, attached ToC toggle, and page-settings or other shell overlays do not arm the range gesture.
6. Confirm the same side-band behavior still holds with navigation resized or collapsed and with the ToC expanded or collapsed.
7. Confirm rendered title text, body blocks, the near-block caret strip, Quick Add, the handle, menus, selectors, the text toolbar, and other overlays remain excluded.
8. Confirm the marquee still disappears on release while block highlights persist, and that reversal, contraction, and horizontal drift still behave as accepted.
9. Confirm the near-block caret strip still uses text intent and places the caret at the valid block start.
10. Confirm Delete, Backspace, Undo, ordinary text selection, Quick Add, handle menu, single-block drag, and toolbar outside dismissal still behave as accepted.
