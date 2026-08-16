# Implementation Notes - E5-T1.6A Legacy Row and Column Move Actions

Status: accepted on `feature/e5-t1-6a-pill-move-actions`; live PDI acceptance passed

## Scope

E5-T1.6A adds the legacy row and column move actions to the existing Docsera pill menus without changing the accepted row/column selection-on-open behavior introduced earlier.

The current menu now exposes only the in-scope actions:

- `Insert before`
- `Insert after`
- `Move up` / `Move left`
- `Move down` / `Move right`
- `Delete row` / `Delete column`

No copy, alignment, divider, or placeholder actions are included here.

## Provenance

The move actions use the supported TipTap / ProseMirror table helper surface instead of an app-owned reorder algorithm.

- current Docsera stack: `@tiptap/pm@3.27.3`
- current resolved helper source: `prosemirror-tables@1.8.5`
- legacy reference stack: `@tiptap/pm@3.20.1`
- legacy resolved helper source: `prosemirror-tables@1.8.5`
- supported import path: `@tiptap/pm/tables`

The published `@tiptap/pm/tables` entry point re-exports `prosemirror-tables`, which exports `moveTableRow` and `moveTableColumn`. Both packages are MIT licensed, so no extra repo-side license text was required beyond preserving provenance in this note.

## Movement Contract

- `Move up` and `Move down` move the selected row exactly one row.
- `Move left` and `Move right` move the selected column exactly one column.
- The moved row or column remains selected at the new position.
- The command runs as one normal ProseMirror transaction and remains undoable with a single undo step.
- Undo restores the prior row or column order, the cell content, the cell type, and the stored cell attributes.
- The move commands operate on explicit `tablePos` plus `from` and `to` indexes. They do not derive a target from rails, hover state, or caret location.

## Shared Action Boundary

The pill menu keeps one shared ownership boundary for row and column actions.

- the menu surface owns dismissal
- the menu-item button owns the user action on `click`
- regression coverage exercises the protective `pointerdown` first, then the real `click`
- insert, move, and delete all stay on the same synchronous activation path
- move actions still delegate to `moveTableRow` and `moveTableColumn`
- disabled boundary items remain present but do not dispatch a transaction

The production regression now uses the real overlay root, the real owner-document outside-dismiss listener, and the component's actual activation event. Coverage must not depend on a fabricated compatibility `mousedown` path that the browser may suppress after the protected `pointerdown`.

## Root Cause

The deployed runtime was already serving the current editor chunk, so asset freshness was not the missing proof.

The actual bug was Shadow DOM event ownership at the menu boundary:

- `PageEditorHost` owns the runtime and overlay inside an open ShadowRoot
- owner-document capture events from inside that shadow tree expose a retargeted `event.target` at the document boundary
- the previous outside-dismiss handler relied on `event.target` containment
- a menu-item `pointerdown` was therefore misclassified as outside the menu
- `setMenuState(null)` ran during `pointerdown` and unmounted the menu before click activation
- the row and column move helpers themselves were not the failure

The correction is to use the real event composed path for ownership checks that cross the Shadow DOM boundary so internal menu, overlay, and editor surfaces remain recognizable.

## Selection And Focus

The menu keeps the accepted current behavior on open: clicking a pill selects the full row or column first, then opens the menu for that structural target.

Successful move commands:

- dispatch the helper transaction with `select: true`;
- restore focus to the editor;
- clear any native selection left behind by the structural `CellSelection`;
- close the menu after the action completes.

Disabled boundary items do not dispatch a transaction and do not change the selection.

## Boundary Rules

- `Move up` is disabled for the first row.
- `Move down` is disabled for the last row.
- `Move left` is disabled for the first column.
- `Move right` is disabled for the last column.

Horizontal scrolling only affects menu visibility and placement. It does not change the structural row or column target used by the move command.

## Validation Note

The local regression now proves:

- an actual open ShadowRoot plus a composed event produces a document-level retargeted target while `composedPath()` retains the internal menu item
- inside `pointerdown` remains owned
- click executes once
- genuine outside `pointerdown` dismisses
- the live editor runtime chunk was current, so this was not an asset-freshness failure

The exact console warnings reported in PDI were found in `@servicenow/ui-analytics-bundle/bundled-assets.jsdbx`. The page-warning path only logs and returns; it does not own the pill-menu mutation boundary.

Live PDI acceptance passed.

## Separation From Other Table Behavior

This task is intentionally separate from:

- row and column rails;
- row/column copy and clipboard behavior;
- column alignment;
- multi-cell drag selection;
- hover-derived locator pills.

The legacy row/column move helpers are now wired into the existing pill menus only.
