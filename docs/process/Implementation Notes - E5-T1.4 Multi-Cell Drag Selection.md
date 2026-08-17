# Implementation Notes - E5-T1.4 Multi-Cell Drag Selection

Status: implemented on `feature/e5-t1-4-multi-cell-drag-selection`

## Scope

E5-T1.4 adds pointer-drag rectangular cell selection to the active TipTap table editor. It builds on the existing standard table integration from E5-T1.2 and the live table overlay contract from E5-T1.3C.

The task keeps the current table control surfaces intact. Row and column rails, the table menu, slash-command behavior, and the single-cell active highlight continue to work alongside the new drag selection behavior.

## Drag Selection Contract

Docsera no longer mounts a second drag-selection controller for ordinary table gestures.

- TipTap `Table` already installs ProseMirror `tableEditing`.
- `tableEditing` owns the ordinary `mousedown -> mousemove -> mouseup` lifecycle for in-cell text selection, promotion to `CellSelection`, live rectangular updates, and settled structural range selection.
- the editor root for that lifecycle is `view.root`, so ShadowRoot-hosted runtimes continue to use the stock ProseMirror listener boundary instead of global `document`/`window` listeners.

Docsera keeps only the presentation layer on top of that stock selection state.

- perimeter-only multi-cell outline decoration still keys off live `CellSelection`;
- top/left row and column pill projection still derives from the normalized selected rectangle;
- row/column pill actions and menus still issue explicit row/column structural selections;
- cross-surface page creation still performs its narrow intentional ownership handoff from a settled `CellSelection` to the inline New page title input.

Docsera no longer runs generic native-selection arbitration for ordinary structural selections. It does not keep a second handoff state machine, does not preserve a collapsed DOM caret while a structural selection remains active, and does not clear browser selection on every ordinary `CellSelection` update. Native selection cleanup remains only on explicit Docsera-owned transitions such as the New page handoff or row/column overlay commands that intentionally replace selection ownership.

## Selection Presentation

Multi-cell selections use a perimeter-only outline decoration instead of filling every cell edge with the default selected-cell pseudo-element.

- single-cell selections keep the existing active-cell highlight contract;
- multi-cell rectangular selections render outline classes only on the outer perimeter cells;
- inner seams are suppressed by clearing the stock `selectedCell::after` presentation and replacing it with a border-only `::before` outline;
- the editor runtime and the lightweight reader both carry the same outline CSS contract for consistent appearance.

This keeps the rectangle legible without creating doubled borders in the interior of the selection.

The live overlay projects multi-cell selections onto the only control-bearing table surfaces: the top-side column pills and the left-side row pills.

- selections containing top-row cells reveal one active column pill for each selected top-row column;
- selections containing leftmost-column cells reveal one active row pill for each selected leftmost-column row;
- selections containing both reveal the union of those top and left pill sets;
- selections touching only the bottom border, only the right border, or only interior cells reveal no structural range pills.

The pill surface now uses an explicit two-state contract:

- muted locator pills keep one shared muted fill/border treatment;
- active pills render as a solid `#4648D4` fill and `#4648D4` border in light mode;
- active pills render as a solid `#7C83FA` fill and `#7C83FA` border in dark mode;
- active pills do not add a second differently colored outline around that primary-colored surface;
- dark-mode active pills render their ellipsis glyph in white for contrast, while the accepted light-mode ellipsis treatment remains unchanged unless visibility requires a contrast correction.

Ordinary single-cell editing keeps the current row and column locator pills visible. Interior cells keep both muted. A top-row cell activates only its column pill, a leftmost-column cell activates only its row pill, the top-left cell activates both, and bottom/right adjacency alone has no activation effect.

Hover-derived locator pills and automatic multi-cell range pills remain deferred. The current overlay keeps pill visibility and activation tied to the accepted selection and menu ownership rules only, and it does not derive extra pills from cell hover state.

Structural rectangular `CellSelection` ranges still derive their visible pill indexes from the normalized live `CellSelection` rectangle and the current live table map rather than drag direction, anchor direction, stale overlay state, or a parallel helper-only visibility calculation. For multi-cell ranges, the overlay now derives its active structural pills from the selected cells themselves:

- every selected cell in table row `0` contributes its column to the active column-pill set;
- every selected cell in table column `0` contributes its row to the active row-pill set;
- fully interior cells do not contribute structural pills on their own.

The Thursday, August 13, 2026 trace correction tightened that contract at the overlay-pass boundary: the runtime now resolves the selected-cell set once for a given overlay pass and derives both the visible and accented pill indexes from that exact resolved set. This avoids a live-browser divergence where the same pass could prove the selected cells correctly in diagnostics while a second helper resolution for the pill projection fell back to an empty structural pill set.

The accepted browser correction on Thursday, August 13, 2026 fixed two separate gaps:

1. the selection-state helper and the prior tests/note still carried the superseded four-border activation contract, so bottom-only and right-only ranges were treated as active when the accepted behavior was top/left adjacency only;
2. pill expansion ownership was conflated with menu-open and retained React hover state, so a rerender could replace the hovered button before `mouseleave` fired and leave a stale `data-docsera-table-handle-expanded="true"` surface behind.

The sticky-expanded-pill root cause was therefore lifecycle ownership, not animation timing or CSS alone: `openMenu` wrote persistent hover state, menu-open state also forced the expanded shape, and the overlay had no transition-time cleanup when selection or menu changes replaced the button under the pointer. The fix keeps expansion hover-owned only, clears hover ownership on selection/menu transitions, and updates document-level pointer cleanup so stale expansion cannot survive a real rerender.

The pill grow/shrink animation remains a shell-owned CSS contract. Compact and expanded row/column sizes are declared on the pill shell selectors themselves, the shell carries the explicit width/height transition contract, and the overlay includes an explicit `prefers-reduced-motion` override that disables those non-essential transitions. Expansion is owned only by actual pill hover; menu-open state, selection rerenders, replaced DOM nodes, and selection changes clear the transient hover-owned expansion so the pill does not stay stuck expanded.

The prior coverage blind spot matched that root cause. The broad edge matrix test asserted selection geometry but not the accepted top/left contract, and the hover coverage only proved that a pill could expand on hover. It did not drive repeated hover, click, menu, and selection-rerender sequences against the live overlay DOM, so the stale expansion path remained unproven.

The row-pill anchor uses the selected row geometry even when the row DOM itself has no usable box in jsdom-style test geometry, so the overlay still resolves correctly from the table geometry fallback.

## Geometry And Hit Testing

The stock ProseMirror drag-selection path remains geometry-aware through the editor view and table plugin. Docsera's overlay still measures the live table wrapper and visible table edges for pill/menu placement, scrolling behavior, and perimeter presentation, but it no longer owns ordinary cross-cell hit testing or drag activation.

## Legacy Baseline

Legacy Docsera reconstruction had carried forward a custom drag-selection controller into the new shell. E5-T1.6C removed that duplicate ownership after confirming the current TipTap/ProseMirror stack already provides the intended delayed promotion, live rectangular updates, and stock rectangular clipboard behavior. The retained legacy-compatible behavior is the visible presentation and table-control layer, not the legacy drag controller itself.

## Regression Coverage

The behavior is covered by `src/client/editor/PageEditorHostRuntime.tableSelection.test.tsx`:

- within-cell mouse gestures remain available until cross-cell intent exists;
- stock `mousedown`/`mousemove`/`mouseup` cross-cell drags promote to `CellSelection`;
- the selected rectangle expands and contracts as the mouse moves;
- the settled drag keeps the structural `CellSelection` after mouseup;
- a ShadowRoot-hosted runtime still uses `view.root` for the stock drag lifecycle;
- clicking back into a selected cell hands ownership from `CellSelection` to a stable in-cell caret, survives selection/focus cleanup, accepts immediate typing, preserves within-cell text selection, and still allows a later cross-cell drag to promote back into `CellSelection`;
- clicking either root-level New page control while a structural `CellSelection` is active releases the table's interaction ownership on the same gesture, resolves a valid in-cell caret without emitting the ProseMirror invalid-selection warning, and allows the inline title input to receive focus immediately without a second click;
- the selected rectangle updates live as the pointer moves and pill visibility expands onto or contracts away from the accepted top-row and leftmost-column boundaries only;
- the perimeter-only outline classes appear on the outer cells only;
- real pointer-drag coverage proves top-only, left-only, top-left, top-right, bottom-left, bottom-only, right-only, bottom-right, reversed-direction, and fully interior post-release DOM states;
- the exact screenshot-equivalent two-by-two top-only drag selection at rows `0-1`, columns `1-2` preserves a live `CellSelection`, renders active column pills `{1, 2}`, and renders no active row pills after pointer release;
- the exact top-left two-by-two drag selection at rows `0-1`, columns `0-1` preserves a live `CellSelection` and renders active row pills `{0, 1}` plus active column pills `{0, 1}` after pointer release;
- the exact annotated two-column by three-row top-left drag produces exactly two active column pills and exactly three active row pills after pointer release;
- single-cell top-row, leftmost-column, top-left, bottom-right, and interior locator pills render the accepted muted-versus-active state, including muted bottom/right-only adjacency;
- assertions verify the rendered shell contract for exact `#4648D4` light-theme active fill/border and `#7C83FA` dark-theme active fill/border versus the shared muted fill/border treatment;
- repeated live-overlay hover, click, menu, and selection-rerender assertions verify that only the currently hovered pill may remain expanded, that the shell keeps the compact-to-expanded size transition contract with reduced-motion coverage, and that stale expansion is cleared immediately on pointer exit, selection transition, or menu transition;
- clicking an active row or column pill after drag release still selects the full row or column and opens the correct menu;
- horizontal scrolling does not break table drag selection or the active overlay contract.

The test file is assigned to the `editor-interactions` suite so it is included in the managed editor regression pass.
