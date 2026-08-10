# Technical Spike - E5 Standard Table Legacy Reconstruction and E5-E7 Boundary

Status: technical spike  
Branch: `feature/e5-t1a-table-reconstruction-spike`  
Base: `c3433f83901abd336643e82a9ea84592a2f8b175`

## Purpose

This spike defines how current Docsera should reconstruct the proven Legacy Docsera table implementation for E5 standard tables without redesigning the widget and without importing E7 advanced-table interactions early.

The conclusion is: E5 should first add a publishable standard TipTap table foundation with Legacy-faithful table geometry and cell styling, then add the minimal accepted creation and standard row/column/header controls. E7 should retain the Legacy rails, contextual pills, advanced row/column menus, drag cell selection, structured clipboard, and related overlay behavior.

## Sources Inspected

Accepted requirement source:

- `C:\Users\jacob\OneDrive\Documents\Obsidian Vault\Docsera\Requirements\40 Editor.md`

Current Docsera repository sources:

- `app/docsera-ui/package.json`
- `app/docsera-ui/src/shared/editor/schema.ts`
- `app/docsera-ui/src/server/pages/serverEditorDocument.ts`
- `app/docsera-ui/src/shared/editor/document.ts`
- `app/docsera-ui/src/client/features/workspaces/PublishedDocumentReader.tsx`
- `app/docsera-ui/src/client/editor/PageEditorHostRuntime.tsx`
- `app/docsera-ui/src/client/editor/editorBlockCommands.ts`
- `app/docsera-ui/src/client/editor/blockDragReorder.ts`
- `app/docsera-ui/src/client/editor/pasteSanitizer.ts`
- `app/docsera-ui/src/client/editor/CompactTextToolbar.tsx`
- `app/docsera-ui/src/client/styles/runtime-shell.css`
- `docs/process/Editor Runtime Interaction Contract.md`
- `docs/process/Test Strategy and Validation Areas.md`

Legacy Docsera sources under `C:\Dev\docsera-editor-reference\studio`:

- `package.json`
- `src/components/Editor.tsx`
- `src/components/editor/editorTiptapConfig.ts`
- `src/components/editor/TableControlsOverlay.tsx`
- `src/components/editor/ActiveTableCellHighlight.ts`
- `src/components/editor/useTableDragSelectionController.ts`
- `src/components/editor/tableClipboard.ts`
- `src/components/editor/SlashCommand.ts`
- `src/components/editor/BlockContextMenu.tsx`
- `src/components/editor/editorBlockSelectionUtils.ts`
- `src/app/globals.css`
- `tests/e2e/table-content-block-v1.spec.ts`
- Adjacent reference tests: `tests/e2e/accordion-content-block-v1.spec.ts`, `slash-lifecycle-regressions.spec.ts`, `gutter-selection-regressions.spec.ts`

External primary source checked:

- TipTap 3.x table docs at `https://tiptap.dev/docs/editor/extensions/nodes/table`
- npm package metadata for `@tiptap/extension-table@3.27.3`

No Legacy table screenshots were found in `studio/tests/e2e/**-snapshots`; only accordion snapshots were present. The table visual baseline therefore comes from Legacy CSS plus Playwright assertions in `table-content-block-v1.spec.ts`.

## Current TipTap Version Findings

Current Docsera uses TipTap `3.27.3` for `@tiptap/core`, `@tiptap/react`, `@tiptap/pm`, and current extensions. It does not yet declare `@tiptap/extension-table`.

Legacy used TipTap `^3.20.0` table packages:

- `@tiptap/extension-table`
- `@tiptap/extension-table-row`
- `@tiptap/extension-table-cell`
- `@tiptap/extension-table-header`

For current Docsera, when active editor table support begins, prefer adding only `@tiptap/extension-table@3.27.3`. TipTap 3 repackaged table row/cell/header into the table package and recommends `TableKit` for the whole table family, while still allowing separate `Table`, `TableRow`, `TableCell`, and `TableHeader` exports for more control. If Docsera later keeps Legacy-style cell/header attribute extension for `align`, the likely editor implementation should use named exports from `@tiptap/extension-table`, not the older separate packages.

TipTap 3.27 table settings and commands relevant to E5:

- Settings: `resizable`, `renderWrapper`, `cellMinWidth`, `allowTableNodeSelection`, `HTMLAttributes`.
- Commands: `insertTable`, `addColumnBefore`, `addColumnAfter`, `deleteColumn`, `addRowBefore`, `addRowAfter`, `deleteRow`, `deleteTable`, `toggleHeaderRow`, `toggleHeaderColumn`, `toggleHeaderCell`, `goToNextCell`, `goToPreviousCell`, `fixTables`.

Commands such as `mergeCells`, `splitCell`, `mergeOrSplit`, structured row/column move commands from `@tiptap/pm/tables`, and custom row/column clipboard are E7 unless a later requirement explicitly moves them.

## Legacy Table Architecture

### Schema and Editor Configuration

`src/components/editor/editorTiptapConfig.ts` owns the Legacy table schema and base editor wiring.

Legacy imports:

- `Table` from `@tiptap/extension-table`
- `TableRow` from `@tiptap/extension-table-row`
- `BaseTableHeader` from `@tiptap/extension-table-header`
- `BaseTableCell` from `@tiptap/extension-table-cell`
- `ActiveTableCellHighlight`
- `handleDocseraTableClipboardPaste`

Legacy extends `BaseTableCell` and `BaseTableHeader` with an `align` attr. Parsing checks inline `style.textAlign` first, then `align`. Rendering always emits `style: text-align: <left|center|right>;`.

Legacy table config:

```ts
Table.configure({
  resizable: false,
  renderWrapper: true,
  cellMinWidth: 80,
})
```

Important table-related editor config:

- StarterKit trailing-node excludes `table` so insertion at document end does not create a ghost placeholder block.
- Placeholder suppresses placeholder text inside `tableCell` and `tableHeader`, including paragraph placeholders inside table descendants.
- Slash commands detect table-cell ancestry and filter the in-cell command list.
- `handleDOMEvents.paste` delegates to `handleDocseraTableClipboardPaste`.
- Markdown support keeps HTML enabled because complex tables may serialize as HTML in Legacy.

### Visual Styling

`src/app/globals.css` owns the static table visual baseline. The central E5-reusable parts are the actual table wrapper/table/cell geometry:

- `.tableWrapper`
  - `overflow-x: auto`
  - `overflow-y: visible`
  - `margin: 1rem 0`
  - `padding-bottom: var(--docsera-table-bottom-lane)`
  - stable thin scrollbar styles
- `.ProseMirror table`
  - `border-collapse: collapse`
  - `table-layout: auto`
  - `width: max-content`
  - `font-size: inherit`
  - `line-height: inherit`
  - `margin: 0`
- `td`, `th`
  - `position: relative`
  - `border: 1px solid rgba(148, 163, 184, 0.7)` in light mode
  - dark border `rgba(75, 85, 99, 0.9)`
  - `vertical-align: top`
  - `min-width: 80px`
  - `padding: 0.38rem 0.75rem`
- active cell
  - `box-shadow: inset 0 0 0 1.5px rgb(var(--docsera-selection-rgb))`
- multi-cell selection
  - Legacy suppresses TipTap per-cell `selectedCell::after` seams and uses perimeter-only decorations.

E5 should carry forward the wrapper/table/cell geometry and active-cell cue, remapped to current Docsera tokens. It should not carry forward the bottom rail lane unless E5 exposes no rails; if no E5 rail is present, the extra bottom padding should be omitted or minimized so the table does not reserve invisible advanced-control space.

### Overlay, Rails, Pills, and Menus

`src/components/editor/TableControlsOverlay.tsx` is a large advanced interaction system. It measures the active table, tracks visible wrapper/table edges, derives row/column centers, renders fixed-position row/column pills, renders add rails, anchors row/column menus, selects rows/columns, applies column alignment, moves rows/columns, and copies row/column content.

Key behaviors:

- Uses `findTable`, `TableMap`, `selectedRect`, `CellSelection`, `moveTableRow`, and `moveTableColumn` from `@tiptap/pm/tables`.
- Renders compact 8px-thick pills with 18px compact and 34px expanded dimensions.
- Renders row/column add rails outside visible table edges.
- Context menus include insert before/after, move, copy, delete, and column alignment.
- Visibility is contextual: selected axis, edge hover, menu state, and border-adjacent selection.
- Off-screen handles are hidden when horizontal table scrolling clips columns.
- Uses fixed overlays and global `document`/`window` listeners.

This file is E7, except its visual constants are evidence for later advanced-table reconstruction. E5 should not enable rails, advanced context menus, row/column move, structured copy, or advanced hover/selection behavior.

### Active Cell and Multi-Cell Selection Decorations

`src/components/editor/ActiveTableCellHighlight.ts` is a ProseMirror decoration extension.

Shared foundation:

- Single active cell receives `docsera-table-cell-active`.
- The implementation fails closed if `selectedRect` temporarily throws.

E7 behavior:

- `CellSelection` spanning multiple cells receives perimeter-only classes:
  - `docsera-table-selection-outline`
  - `--top`
  - `--right`
  - `--bottom`
  - `--left`

E5 should preserve active-cell highlighting for caret orientation. Perimeter multi-cell selection can be deferred to E7 unless standard TipTap selection styling looks broken enough to block E5 usability.

### Drag Cell Selection

`src/components/editor/useTableDragSelectionController.ts` implements explicit cross-cell drag selection.

Key behaviors:

- Captures pointer gestures from table cells.
- Converts cross-cell pointer movement into `CellSelection`.
- Suppresses native DOM selection only after the gesture becomes a table-range gesture.
- Excludes table overlay controls from drag-selection ownership.
- Uses global `window` and `document` listeners and `document.elementFromPoint`.

This is E7 advanced selection. Do not carry it into E5.

### Structured Clipboard

`src/components/editor/tableClipboard.ts` owns Legacy row/column/table clipboard state.

Key behaviors:

- Maintains module-level in-memory payload with `kind: "row" | "column" | "table"`.
- Writes plaintext fallback through `navigator.clipboard.writeText`.
- Replaces cell inner content for compatible row/column/selected-cell paste paths.
- Replaces selection with a copied table node for table paste.
- Expires payload after five minutes.

This is E7 structured clipboard. The accepted requirement explicitly says the known Studio structured-row-clipboard regressions must be corrected, and the clipboard state must be editor/session-scoped. Therefore E5 must not copy this module-level architecture.

### Editor Integration and Block Context

`src/components/Editor.tsx` wires table overlay rendering and advanced block-menu integration:

- Tracks `tableControlsOverlayRef`.
- Passes table overlay refs into block/context handling so table pills do not cover block handles.
- Renders `<TableControlsOverlay />` near the editor floating stack.
- Uses `isSelectedBlockTable` to show `Copy table` and hide `Turn into` in `BlockContextMenu`.

`src/components/editor/BlockContextMenu.tsx` includes table-specific `Copy table`, `Duplicate`, and `Delete` paths. The copy path is E7 structured clipboard; duplicate/delete are shared top-level block behavior that current Docsera already has for all top-level blocks.

### Legacy Tests

`tests/e2e/table-content-block-v1.spec.ts` is the primary table regression source.

E5-preserve scenarios:

- Slash insertion creates a default 3x3 table with caret in first cell.
- Quick Add inserts a table block.
- Default table density keeps compact width with usable text-entry breathing room.
- In-cell slash only shows table-safe commands.
- Root slash keeps non-table commands available outside table cells.
- Slash and Quick Add insertion at document end leave no trailing placeholder block.
- Empty table cells show no default placeholder and slash hint appears inline.
- Bubble toolbar appears for text selected in cells and formatting applies.
- Link popup behavior remains correct for selections in table cells.
- Table wrapper adds horizontal scroll once columns overflow the content lane.

E7-preserve or later-review scenarios:

- Table pills contextual visibility and hover-only ellipsis expansion.
- Pill accent color only on border-adjacent selection axes.
- Interior hover does not reveal pills.
- Multi-cell selection only reveals pills on owning edge.
- Multi-cell drag selection clears native DOM selection.
- Add rails do not synthesize broad row/column pill visibility.
- Row/column menus anchor to the correct side of pills.
- Table drag-handle menu shows `Copy table`, `Duplicate`, `Delete`, and hides `Turn into`.
- Active and multi-cell selections render perimeter-only accent borders.
- Row/column controls support add actions, menus, and row copy/paste semantics.
- Column add rail stays outside the table right border.
- Off-screen handles are hidden after horizontal scroll.
- Row rail sits above horizontal scrollbar lane.
- Column/row rail drag is a no-op and does not resize the table.

The E7 tests are still valuable as later parity evidence, but should not drive E5 scope.

## Current Docsera Integration Inventory

### Dependency and Schema Registration

Current `app/docsera-ui/package.json` has no table extension dependency.

`app/docsera-ui/src/shared/editor/schema.ts` registers current core nodes and marks through `createDocseraEditorExtensions`. It uses `Document.extend({ content: "block*" })`, StarterKit, links, inline marks, task list extensions, and a placeholder extension. There are no `table`, `tableRow`, `tableCell`, or `tableHeader` nodes.

E5 must add table nodes to this shared schema before any table document is considered valid or publishable.

### Canonical Validation and Canonicalization

`app/docsera-ui/src/server/pages/serverEditorDocument.ts` is the server-side and shared document contract. It defines:

- allowed block nodes in `DOCSERA_BLOCK_NODE_TYPES`
- allowed top-level doc children in `DOCSERA_DOC_CHILD_TYPES`
- allowed inline nodes
- allowed marks
- node attribute validation
- structured child validation
- canonicalization and serialization
- plain-text extraction

Tables are currently invalid everywhere. E5 must add:

- `table`, `tableRow`, `tableCell`, `tableHeader` to allowed node sets.
- top-level `table` as a doc child.
- table child rules: `table` -> non-empty `tableRow[]`; `tableRow` -> non-empty `tableCell|tableHeader[]`; `tableCell/tableHeader` -> block content, probably same broad block set as list items but with explicit exclusions if needed.
- table attrs: initially no attrs for `table` and `tableRow`; cell/header attrs should include the standard structural attrs needed by the canonical table representation, at least `colspan`, `rowspan`, and `colwidth`. Keep Docsera-specific `align` unresolved unless later product review or editor implementation explicitly requires it.
- canonical defaulting for table cell/header attrs so saved JSON is stable.
- plain-text extraction through cell content.

### Server Document Contract, Draft Save, Reload, and Publish

Server save/publish paths parse and serialize through the same document contract. `serviceNowPagePublishing.ts` rejects current drafts when parsing/canonicalization fails. Workspace publish also depends on persisted draft state.

Therefore E5 cannot ship editor-only table insertion first. A table inserted in Edit mode must be valid through:

- draft autosave body save
- draft reload
- page publish validation
- workspace publish projection
- Live reader rendering

### Lightweight Reader

`PublishedDocumentReader.tsx` validates with `validateDocseraStructuredDocument` and throws on unknown block nodes. It currently renders paragraphs, headings, blockquote, horizontal rule, code block, bullet/ordered/task lists, and inline marks.

E5 must add table rendering before tables are publishable. Reader rendering must stay TipTap-free. It should render semantic HTML:

- wrapper div with Docsera reader table class
- `<table>`
- `<tbody>` or direct rows; direct rows are acceptable but `<tbody>` is cleaner
- `<tr>`
- `<td>` / `<th>` with supported `colSpan`, `rowSpan`, and `style.textAlign` or class/token mapping
- nested block content inside cells using existing block renderer

Reader CSS should match the editor table visual baseline without editor-only selection or control styling.

### Paste Sanitization

`pasteSanitizer.ts` removes unsafe tags and event/style/srcdoc attributes, but does not currently whitelist or normalize table structures. Because current sanitization does not remove ordinary table elements, registering active table nodes in the editor schema would make pasted HTML tables potentially parseable and would implicitly answer an unresolved product question.

Recommended decomposition boundary:

- Do not register active TipTap table nodes in `E5-T1.1`.
- Do not add a temporary paste guard merely to compensate for activating table schema early.
- Resolve whether pasted HTML tables are accepted before briefing `E5-T1.2` active editor integration.
- Keep any pasted alignment handling unresolved with the broader table-paste decision.

### Editor Runtime, Block Targeting, and Drag

`PageEditorHostRuntime.tsx` treats editor body children as top-level blocks through ProseMirror child indexes and DOM children:

- `getTopLevelBlockElements` returns `editor.view.dom.children`.
- block selection decorations apply to top-level block ranges.
- block drag preview clones top-level elements.
- block action menu currently offers `Turn into`, `Duplicate`, and `Delete` based on existing block command support.

Once `renderWrapper: true` is used, the top-level DOM child for a table is expected to be `.tableWrapper`; this is compatible with the current top-level child model if the wrapper remains one child for one table node. E5 tests must prove table cells are not independent gutter targets and the table wrapper is selected/dragged as one top-level block.

### Slash and Quick Add

`editorBlockCommands.ts` currently exposes only core blocks. E5 needs a table command if table creation is in scope for E5-T1:

- `id: "table"`
- `label: "Table"`
- `keywords: ["table", "grid"]`
- quick add content or command execution that inserts a 3x3 table.
- slash execution that uses `editor.commands.insertTable({ rows: 3, cols: 3, withHeaderRow: false })` to match Legacy's proven default, unless Jacob later chooses header row by default.

The current command model stores quick-add static JSON plus `selectionOffset`; tables likely require a command-specific quick-add insertion path because a valid table JSON is deeper and selection should land in the first cell. This is a small implementation pressure point for E5-T1.

### Text Selection Toolbar

`CompactTextToolbar.tsx` operates on TipTap selections and current mark/block commands. E5 must preserve text-selection toolbar behavior inside table cells, matching Legacy tests around formatting and link popup behavior.

### Undo/Redo and Autosave Boundaries

Current runtime serializes the complete TipTap JSON envelope after doc changes. E5 table transactions should remain ordinary TipTap transactions:

- insert table is one undo step
- row/column/header operations are one undo step each
- transient hover/control state must not mark dirty
- autosave persists only canonical valid JSON

Do not add client recovery or generation manipulation for tables.

## E5/E7 Feature Classification

| Legacy feature | Classification | Notes |
| --- | --- | --- |
| Table schema nodes: `table`, `tableRow`, `tableCell`, `tableHeader` | Shared foundation | Required before E5 tables can save, reload, publish, or render. |
| `Table.configure({ resizable: false, renderWrapper: true, cellMinWidth: 80 })` | E5 standard table behavior | Matches Legacy visual baseline and avoids unaccepted resize handles. |
| 3x3 default insertion with `withHeaderRow: false` | E5 standard table behavior | Proven by Legacy tests; accepted creation still needs final UX placement only if not slash/Quick Add. |
| Caret lands in first cell after insertion | E5 standard table behavior | Proven by Legacy test. |
| Header row/column/cell toggles | E5 standard table behavior | Accepted E5 says headers; UI surface can be simple and not rail-based. |
| Add row/column before/after, delete row/column, delete table | E5 standard table behavior | Accepted standard row/column operations. |
| Keyboard tab navigation / `goToNextCell` / `goToPreviousCell` | E5 standard table behavior | Standard table navigation. |
| Cell/header `align` attr | Unclear product behavior requiring later review | Legacy supports it only through advanced column menu. Do not require a Docsera-specific `align` attr in the T1.1 canonical contract merely for future E7 compatibility. |
| Active-cell highlight | Shared foundation | Useful for E5 orientation; not an advanced control by itself. |
| Perimeter-only multi-cell selection outlines | E7 advanced table behavior | Tied to advanced `CellSelection` UX. May be foundation if default selection looks unacceptable. |
| Fixed overlay root for table controls | E7 advanced table behavior | Must be redesigned for current shadow/overlay contracts later. |
| Row/column pills | E7 advanced table behavior | Explicitly advanced rails/control UI. |
| Add rails | E7 advanced table behavior | Rails are assigned to E7. |
| Row/column context menus | E7 advanced table behavior | Requirement assigns advanced context menus and structured operations to E7. |
| Row/column move operations | E7 advanced table behavior | Uses `moveTableRow`/`moveTableColumn`; not basic E5. |
| Column alignment menu | E7 advanced table behavior or later product question | Legacy menu lives in advanced overlay. |
| Row/column copy and paste | E7 advanced table behavior | Structured clipboard is explicitly E7 and currently has known defects. |
| Whole-table copy through block menu | E7 advanced table behavior | Uses Legacy structured clipboard module. |
| Cross-cell drag selection | E7 advanced table behavior | Explicitly advanced selection. |
| In-cell slash command filtering | E5 standard table behavior | Prevents invalid nested top-level structures in cells. |
| Empty-cell placeholder suppression | E5 standard table behavior | Visual/interaction baseline. |
| Table wrapper horizontal scrolling | E5 standard table behavior | Needed for overflow and visual fidelity. |
| Off-screen handle hiding | E7 advanced table behavior | Only relevant to advanced handles. |
| Row rail above scrollbar lane | E7 advanced table behavior | Only relevant to rails. |
| Module-level table clipboard payload | Legacy defect/obsolete behavior not to preserve | Must become session-scoped if E7 implements structured clipboard. |
| Global `document` / `window` event ownership in table overlay | Legacy-only architectural assumption | Must be adapted to current owner-document/shadow contracts in E7. |
| Tailwind class strings in overlay/menu styling | Legacy-only architectural assumption | Current Docsera uses runtime CSS tokens; do not copy Tailwind dependency. |
| Next.js shell, filesystem APIs, Markdown canonical storage | Legacy-only architectural assumption | Current ServiceNow JSON envelope remains authoritative. |

## Legacy-to-Docsera Visual Reconstruction Map

E5 should be visually faithful for the table itself, not for advanced controls.

| Visual area | Legacy value/source | E5 Docsera mapping |
| --- | --- | --- |
| Wrapper | `.tableWrapper`, `overflow-x: auto`, `overflow-y: visible`, `margin: 1rem 0` | Copy behavior into runtime CSS under current editor class names. |
| Bottom lane | `padding-bottom: var(--docsera-table-bottom-lane)` with 22px rail and 8px scrollbar | Do not copy full lane unless E5 includes a visible non-advanced control. Use only scrollbar-safe padding if needed. |
| Table layout | `border-collapse: collapse`, `table-layout: auto`, `width: max-content`, `margin: 0` | Copy unchanged. |
| Text sizing | `font-size: inherit`, `line-height: inherit` | Copy unchanged. |
| Cell min width | `80px`; test asserts `minWidth === "80px"` | Copy unchanged and set TipTap `cellMinWidth: 80`. |
| Cell padding | `0.38rem 0.75rem`; test expects top 5.5-7px and left 10-13px | Copy unchanged initially. |
| Cell border | light `rgba(148, 163, 184, 0.7)`, dark `rgba(75, 85, 99, 0.9)` | Map to current Docsera border tokens or token-mixed equivalents. Do not hard-code Legacy palette if current tokens cover it. |
| Header cells | Same geometry as cells; no separate Legacy header fill in inspected CSS | Use same geometry. If later accepted, add tokenized subtle header background. |
| Active cell | inset 1.5px selection color | Preserve with current `--docsera-editor-primary` or selection token. |
| Multi-cell selected outline | perimeter-only decoration classes | Defer to E7 unless required for E5 usability. |
| Table controls pills | 8px thick, 18/34px compact/expanded, 26/42px hitboxes, tokenized overlay colors | E7 only. Do not show in E5. |
| Add rails | 22px rail, 4px gap, outside visible table edges | E7 only. Do not reserve invisible rail space in E5. |
| Scrollbar styling | thin horizontal scrollbar with light/dark thumb/track | Recreate with current tokens if needed; do not rely on Tailwind/global theme classes. |

## Obsolete Legacy Assumptions Not To Carry Forward

- Do not copy separate table row/cell/header packages into current Docsera; use `@tiptap/extension-table@3.27.3` exports.
- Do not copy Tailwind utility class styling into current runtime components.
- Do not use Legacy global `document` and `window` assumptions for overlay or gestures; current runtime requires owner-document/shadow-aware event handling.
- Do not copy Next.js shell assumptions, filesystem image routes, Markdown canonical storage, or `tiptap-markdown` table behavior into E5.
- Do not copy module-level structured clipboard state. E7 must scope clipboard payload to editor/session and respect unrelated later clipboard content.
- Do not copy known advanced Legacy regressions around handle expansion or structured row clipboard.
- Do not let table cells become independent top-level gutter/drag targets.
- Do not add table resizing in E5. Legacy intentionally set `resizable: false`, and E5 requirements do not accept resize handles.

## Unresolved Product Questions

- Should initial table creation be available through both slash and Quick Add in E5, or is one accepted creation path enough for the first implementation task? Legacy supports both, but current requirement only says creation.
- Should a new E5 table default to no header row like Legacy (`withHeaderRow: false`) or should E5 expose an explicit header default? Recommendation: use no header row initially for Legacy parity and provide header toggles.
- What exact E5 UI should expose header and row/column operations without E7 rails/context menus? Recommendation: a small editor-local table toolbar or simple block-action table submenu can be scoped to standard operations, but this needs an implementation brief decision.
- Should cell/column text alignment be a supported E5 capability? Legacy has schema support and an advanced column menu, but accepted E5 does not mention alignment.
- Should pasted HTML tables be accepted when active editor table support begins, or deferred until after explicit product approval for that input path?
- What maximum supported table dimensions should be enforced? The requirement notes this remains before E7, but E5 may still need a practical guard for paste or programmatic insertion.

## Ordered E5-T1 Implementation Decomposition

### E5-T1.1 - Canonical Table Contract and Lightweight Reader Foundation

Goal: make table JSON a defined canonical, server-valid, and reader-renderable document shape without adding active editor table support.

Scope:

- Add server validation/canonicalization for `table`, `tableRow`, `tableCell`, `tableHeader`.
- Define valid table child structure and the standard TipTap structural attrs required by the canonical representation.
- Add document fixtures for a minimal table, header table, and malformed table cases.
- Add lightweight reader rendering and Legacy-faithful reader-side table geometry/styling using current Docsera color/theme tokens.
- Add plain-text extraction through table cells.
- Add relevant document, publishing-contract, and reader regression coverage.

Explicitly out of scope:

- Do not register the table nodes in the active TipTap editor schema.
- Do not add author-facing table creation, editing, or paste capability.
- Do not add `@tiptap/extension-table` in T1.1 unless later implementation evidence shows the server/document/reader foundation genuinely requires it.
- Do not introduce a temporary paste guard merely to compensate for early schema activation.

Validation:

- `editor-contract` suite or exact shared document tests.
- Reader tests for table rendering.
- Publishing/page contract tests that prove table envelopes are not rejected.

Why first:

- It preserves ServiceNow/server authority and establishes the canonical document and reader contract without prematurely deciding unresolved editor paste or authoring scope.

### E5-T1.2 - Table Creation and Basic Editor Behavior

Goal: add active TipTap table integration only after the material product/scope questions affecting authoring have been resolved.

Scope:

- Add `@tiptap/extension-table@3.27.3`.
- Register table nodes in the active editor schema.
- Add table command to slash and Quick Add if accepted by brief.
- Insert a 3x3 table with no header row and caret in the first cell.
- Suppress empty paragraph placeholders inside table cells.
- Keep in-cell slash filtered to table-safe nested content.
- Preserve no trailing placeholder block after table insertion at document end.
- Add basic table editor CSS matching Legacy geometry.
- Prove table is one top-level block for gutter selection, duplicate/delete, and drag.
- Preserve text-toolbar behavior inside cells.

Before briefing this task, resolve at least:

- whether pasted HTML tables are accepted at this stage;
- which creation entry point or entry points are required initially;
- initial header-row behavior where necessary.

Validation:

- Focused editor interaction tests modeled from Legacy E5-preserve scenarios.
- Current block targeting/drag tests updated with table fixture.

### E5-T1.3 - Standard Header, Row, Column, and Delete Operations

Goal: expose accepted standard table operations without E7 rails/advanced menus.

Scope:

- Implement the chosen non-rail E5 control surface.
- Support add row before/after, add column before/after, delete row, delete column, delete table.
- Support toggle header row/column/cell as accepted by the implementation brief.
- Preserve undo/autosave one-transaction behavior.
- Keep E7 move/copy/structured paste/advanced selection out.

Validation:

- Focused editor tests for each operation and undo/save/reload round trip.
- Reader validation after header operations.

### E5-T1.4 - Legacy-Faithful Visual Integration Pass

Goal: tune the actual current Docsera table rendering against Legacy baseline after behavior is present.

Scope:

- Verify wrapper/table/cell dimensions and spacing.
- Map light/dark colors to current tokens.
- Confirm horizontal overflow behavior.
- Confirm active-cell cue.
- Remove any accidental E7 visual affordances.

Validation:

- CSS/runtime stylesheet tests for stable table rules.
- Jacob-facing manual PDI/browser verification steps for visual acceptance.

### E7-T1 Later - Advanced Table Interaction Reconstruction

Goal: reconstruct Legacy advanced controls after E5 standard tables are stable.

Scope:

- Owner-document/shadow-safe table overlay.
- Row/column pills and add rails.
- Advanced context menus.
- Corrected advanced selection.
- Session-scoped structured clipboard.
- Row/column move, alignment, off-screen handle behavior, rail/scrollbar stacking.

This should be a separate E7 implementation sequence.

## Recommended First Implementation Task

Start with `E5-T1.1 - Canonical Table Contract and Lightweight Reader Foundation`.

Observable completion criteria:

- A canonical document envelope containing a 3x3 table with paragraphs in cells parses, canonicalizes, serializes, saves through current contract tests, and is accepted by publish validation.
- Malformed table documents are rejected with the existing safe invalid-document behavior.
- The lightweight reader renders table HTML without importing TipTap or ProseMirror.
- Reader and editor contract fixtures cover standard cells, header cells, row/column spans where supported, and nested inline marks inside table cells.
- No active editor table schema registration, author-facing creation UI, paste acceptance, rails, context menus, structured clipboard, or advanced selection is added in this first task.

This decomposition prevents the client from becoming a second durable authority, keeps the first task a true non-authoring document/reader foundation, and avoids implicitly deciding unresolved pasted-table product scope by activating the editor schema too early.
