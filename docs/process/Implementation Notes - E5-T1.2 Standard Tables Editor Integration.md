# Implementation Notes - E5-T1.2 Standard Tables Editor Integration

Status: implemented on `feature/e5-t1-2-standard-table-editor`

## Scope

E5-T1.2 activates standard TipTap table authoring in the Docsera editor. It builds on the E5-T1.1 canonical table and reader contract without adding E7 advanced table controls.

## Active TipTap Configuration

The active editor schema now registers the TipTap table node family from `@tiptap/extension-table@3.27.3`:

- `table`
- `tableRow`
- `tableCell`
- `tableHeader`

The table extension is configured with `resizable: false`, `renderWrapper: true`, `cellMinWidth: 80`, and no table node selection. The active table node uses the stock TipTap `block` group, and table cells/headers inherit the stock `block+` content expression. Docsera does not add a table-specific top-level-only schema group.

Cell and header nodes are extended at the schema boundary so they support only the canonical structural attrs `colspan`, `rowspan`, and `colwidth`; the stock TipTap `align` attr is not registered. Standard TipTap-compatible block nesting is allowed wherever the active schema permits it, including tables nested through blockquotes, list/task items, table cells, and table headers.

## Creation Contract

Slash and Quick Add share the existing block-command registry. Quick Add remains a top-level gutter insertion surface and continues to expose `Table`. Slash exposes the shared `Table` command from schema-valid contexts, including nested contexts where the standard table schema permits a table. Both creation paths create one `3 x 3` table with no header row and empty paragraphs in each cell. Focus is restored into the first cell after creation.

Table creation stays inside the normal TipTap transaction, undo, dirty, and autosave boundary. Final-block insertion does not add a trailing placeholder paragraph.

Selector option pointer activation preserves the same shared `executeCommand` entry point as keyboard activation. Options prevent default focus transfer starting at `pointerdown` as well as `mousedown`, which fixed the shared Blockquote pointer activation failure. Slash commands apply selector-owner selection offsets only when the slash owner is the top-level page-body block; nested Slash commands keep the command's current nested selection so TipTap can resolve insertion through the active schema.

Quick Add still inserts the temporary top-level paragraph so the selector has a stable anchor, but Table now reuses the shared TipTap `insertTable(...)` command in the active selection context instead of round-tripping through registry JSON. Slash table creation also uses the shared TipTap `insertTable(...)` command in the active selection context.

## In-Cell Commands And Placeholders

Slash invocation inside a table cell remains available and uses the same supported block-command registry as other schema-valid nested Slash contexts. Table creation, blockquote, code block, horizontal rule, and other block commands are not filtered by a Docsera-specific cell-safe list; their execution follows the active TipTap schema. Empty paragraphs inside cells do not receive the top-level empty-paragraph helper text.

## Paste Boundary

HTML paste still flows through the existing paste sanitizer and TipTap paste parser. Ordinary sanitized external `<table>` content can parse into canonical table JSON at valid top-level positions. Unsafe paste content remains governed by the existing sanitizer; unsafe links and unsafe elements are removed or neutralized before TipTap sees the HTML.

Nested table paste is not blocked solely because the table is nested. The sanitizer still removes unsafe tags, unsafe attributes, and unsafe links before TipTap sees the HTML. No unsanitized table ingestion path, internal structured clipboard payload, alignment persistence, row/column clipboard behavior, or rectangular range paste behavior is introduced.

## Top-Level Block Behavior

TipTap renders editable tables through `.tableWrapper`. A table at the page-body root is treated as one top-level editor block by the existing gutter, Quick Add, selection, duplicate, delete, and drag machinery. The wrapper label resolves to `Table`, so whole-table block actions expose the generic Duplicate and Delete actions without a table-specific menu or Turn into path.

Nested tables and table cells are not independent gutter targets. The shared gutter, block actions, selection, and drag/drop remain owned by the outermost page-body block even when that block contains nested tables or other nested supported content. Text selection and the compact text-selection toolbar continue to operate inside cells through normal TipTap selection state.

## Legacy Baseline And Corrections

Legacy Docsera registered the standard TipTap table family in `editorTiptapConfig.ts` without a schema-level top-level-only table group. Its slash-command surface filtered `Table` to root contexts in `CommandList.tsx` and `SlashCommand.ts`, and its Playwright coverage included in-cell command filtering in `table-content-block-v1.spec.ts`. E5-T1.2 keeps the standard schema behavior and intentionally does not carry forward the root-only slash filtering, because the accepted correction removed the artificial Docsera table nesting restriction.

Diagnostic `[DOCSERA_TABLE_TRACE]` logging used during the review correction was removed from the runtime after the selector and command contracts were covered by regression tests.

## Styling Baseline

Editor table styling carries forward the Legacy table geometry with current Docsera runtime tokens:

- horizontal `.tableWrapper` overflow
- `1rem 0` wrapper margin
- collapsed table borders
- `table-layout: auto`
- `width: max-content`
- inherited text size and line height
- `80px` minimum cell width
- `0.38rem 0.75rem` cell padding
- thin tokenized borders
- lightweight active-cell inset cue

No invisible E7 rail lane is reserved, and no row/column pills, add rails, resize handles, perimeter multi-cell selection styling, or advanced context menu chrome is rendered.

## Explicit E7 Exclusions

The following remain deferred to later standard-operation or E7 tasks:

- row/column add/delete UI
- header toggle UI
- row/column move
- row/column context menus
- rails or pills
- structured row/column/table clipboard
- cross-cell drag selection
- advanced multi-cell selection presentation
- column alignment controls or `align` persistence
- resize handles
