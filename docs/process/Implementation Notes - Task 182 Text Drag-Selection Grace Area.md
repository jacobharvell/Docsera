# Implementation Notes - Task 182 Text Drag-Selection Grace Area

Date: 2026-10-26

## Behavior

The near-block caret strip remains a separate text-intent surface between block controls and text-bearing top-level blocks. A primary click places the caret at the block's editable start. A primary drag now starts an editor-owned text-selection session anchored at that same position; pointer moves resolve the current endpoint through ProseMirror's coordinate-to-position mapping and produce an ordinary `TextSelection`.

The session is cleaned up on release, cancellation, lost pointer capture, page hide, document visibility loss, window blur, access loss, listener disposal, and runtime teardown. It never arms the panel-background marquee or transient structural block selection. Selection-only transactions are excluded from history and do not change canonical content or autosave state.

The host exposes its existing caret-strip classification to `CompactTextToolbar` as the only non-ProseMirror text-selection pointer origin. This lets the toolbar join the same pointer-idle lifecycle without duplicating gutter geometry: it hides while the selection moves, reveals after the existing idle interval or release, hides again on resumed movement, and preserves the final `TextSelection`. Panel background, Quick Add, drag handles, and overlays remain excluded.

Quick Add, drag handles, overlays, document-originated selection, and non-text/atomic blocks retain their existing pointer ownership. The strip continues to use the text cursor and remains block-relative at narrow widths.

## Regression Coverage

`PageEditorHostRuntime.selection.test.tsx` covers click caret placement, drag-created and retained `TextSelection` ranges (including a cross-block endpoint), compact-toolbar hide/idle/release behavior from the caret strip, no marquee/content/autosave/history effects, narrow geometry, and horizontal-rule exclusion. Existing selection tests continue to cover control ownership and background marquee behavior; drag-control tests cover handle behavior.
