# Implementation Notes - E5-T1.6D Table Column Alignment

Status: implemented on `feature/e5-t1-6d-table-column-alignment`

## Scope

E5-T1.6D adds durable column-alignment controls to the existing table pill menu without introducing a Docsera-owned alignment model.

The column menu now exposes one contiguous alignment group:

- `Align left`
- `Align center`
- `Align right`

The row menu keeps the existing structural actions only.

## Alignment Contract

Docsera extends TipTap's upstream table-cell / table-header schema instead of recreating that schema locally.

- `tableCell` and `tableHeader` extend the stock TipTap table node definitions.
- The upstream `align` attribute and renderer remain intact.
- Docsera only overrides the `colwidth` parser so malformed pasted widths normalize to `null` instead of leaking `NaN`.
- The editor writes `style="text-align: ..."` for aligned cells and headers through TipTap's upstream renderer.
- The reader renderer maps the canonical `align` attr back to inline text alignment.
- Unset/default alignment remains implicit and is treated as left.

## Column Semantics

- alignment actions apply to the clicked column as a whole
- header cells participate in the same column-level alignment state
- the active menu state is derived from the complete column
- uniform center and uniform right columns show the matching active label
- left, unset/default, or mixed columns show `Align left`

## Persistence And Live Rendering

The alignment state is part of normal persisted document content.

- autosave and reload preserve alignment
- workspace publish preserves alignment
- the lightweight live reader renders aligned table cells without TipTap
- undo restores the prior alignment state in one normal editor history step

## Protected Table Behavior

This task does not replace or bypass the accepted stock ProseMirror table-selection contract.

- ordinary mouse-driven rectangular `CellSelection` remains owned by `tableEditing`
- rectangular copy/paste remains on the stock TipTap / ProseMirror path
- Docsera only owns the structural pill menu actions and the explicit column-alignment commands

## Validation

Covered by:

- `src/client/editor/PageEditorHostRuntime.commands.test.tsx`
- `src/client/editor/tiptapRuntimeCompatibility.test.tsx`
- `src/client/features/workspaces/PublishedDocumentReader.test.tsx`
- `src/shared/editor/document.test.ts`

The regression set proves:

- column alignment survives canonical round-trip persistence
- header cells are included in the alignment column
- mixed/default columns remain left-active
- reader rendering honors the canonical alignment attr
- the runtime overlay does not throw when a table menu closes through editor teardown
- the overlay teardown guard is a separate editor-lifecycle fix, not the HTTP 500 root cause
- malformed pasted table widths normalize to `null` before they can cross the server validation boundary
- stock table selection and rectangular clipboard behavior remain intact
