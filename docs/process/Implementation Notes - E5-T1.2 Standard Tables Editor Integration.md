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

Slash and Quick Add share the existing block-command registry. Quick Add remains a top-level gutter insertion surface and continues to expose `Table`. Slash exposes the shared `Table` command from schema-valid contexts except when the slash owner is inside a `tableCell` or `tableHeader`, where `Table` is suppressed at the command surface. Both creation paths create one `3 x 3` table with no header row and empty paragraphs in each cell. Focus is restored into the first cell after creation.

Table creation stays inside the normal TipTap transaction, undo, dirty, and autosave boundary. Final-block insertion does not add a trailing placeholder paragraph.

Selector option pointer activation preserves the same shared `executeCommand` entry point as keyboard activation. Options prevent default focus transfer starting at `pointerdown` as well as `mousedown`, which fixed the shared Blockquote pointer activation failure. Slash commands apply selector-owner selection offsets only when the slash owner is the top-level page-body block; nested Slash commands keep the command's current nested selection so TipTap can resolve insertion through the active schema.

Quick Add still inserts the temporary top-level paragraph so the selector has a stable anchor, but Table now reuses the shared TipTap `insertTable(...)` command in the active selection context instead of round-tripping through registry JSON. Slash table creation also uses the shared TipTap `insertTable(...)` command in the active selection context.

## In-Cell Commands And Placeholders

Slash invocation inside a table cell remains available and uses the same supported block-command registry as other schema-valid nested Slash contexts. Table creation is hidden from that in-cell slash surface, but blockquote, code block, horizontal rule, and other block commands remain available and continue to follow the active TipTap schema. Empty paragraphs inside cells do not receive the top-level empty-paragraph helper text.

## Paste Boundary

HTML paste still flows through the existing paste sanitizer and TipTap paste parser. Ordinary sanitized external `<table>` content can parse into canonical table JSON at valid top-level positions. Unsafe paste content remains governed by the existing sanitizer; unsafe links and unsafe elements are removed or neutralized before TipTap sees the HTML.

Nested table paste is not blocked solely because the table is nested. The sanitizer still removes unsafe tags, unsafe attributes, and unsafe links before TipTap sees the HTML. No unsanitized table ingestion path, internal structured clipboard payload, alignment persistence, row/column clipboard behavior, or rectangular range paste behavior is introduced.

## Top-Level Block Behavior

TipTap renders editable tables through `.tableWrapper`. A table at the page-body root is treated as one top-level editor block by the existing gutter, Quick Add, selection, duplicate, delete, and drag machinery. The wrapper label resolves to `Table`, so whole-table block actions expose the generic Duplicate and Delete actions without a table-specific menu or Turn into path.

Nested tables and table cells are not independent gutter targets. The shared gutter, block actions, selection, and drag/drop remain owned by the outermost page-body block even when that block contains nested tables or other nested supported content. Text selection and the compact text-selection toolbar continue to operate inside cells through normal TipTap selection state.

## T1.3B Table Controls Overlay

The table controls overlay is a live active-table surface, not a structural reconstruction layer.

- the normal editor/document content lane remains authoritative, and a wide table must not widen the surrounding workspace article, editor host, or sibling blocks;
- overlay geometry is owned by the active table selection and derived from the live table and wrapper DOM rectangles;
- table-control viewport bounds, clipping, and menu placement use the owning editor realm rather than the ambient global window;
- the table wrapper owns horizontal overflow inside that fixed content lane, while the table itself remains `width: max-content`;
- the Add Column rail is placed in the wrapper's scroll-content coordinates from the table's logical right edge plus the established compact gap, so the wrapper scroll range can reveal the full rail without reserving a permanent right-side lane;
- when the table edge is offscreen, the rail is offscreen too until horizontal scrolling brings the logical table edge and rail back into view;
- adjacent sticky ToC and workspace chrome are not part of table scroll content;
- the bottom rail still appends exactly one final row at the bottom edge, regardless of the currently active interior cell;
- overlay lifecycle uses the owning `Document` and `Window` for scheduling, scroll, resize, pane-resize observation, and viewport measurements;
- the right rail appends exactly one final column at the far-right edge, regardless of the currently active interior cell;
- the wrapper bottom lane keeps the row rail separated from the horizontal scrollbar lane;
- this overlay is the foundation that T1.3C extends with legacy row/column pills and basic structural menus;
- move, copy, alignment, cell-range selection, structured clipboard, and resize handles stay deferred.

## T1.3C Legacy Row/Column Pills and Basic Structural Menus

E5-T1.3C layers the legacy row/column control affordances onto the live overlay geometry from T1.3B.

- a table selection exposes the active row pill and column pill for the current row and column, centered on the table's outer left and top borders respectively;
- each pill keeps a compact, visibly bordered surface centered inside its larger hitbox before hover reveals the ellipsis treatment;
- hover and menu-open expansion stay centered on the same border anchor instead of drifting away from the table edge;
- the rendered outer border stroke on the first cell of the selected row owns the row-pill anchor, while the selected row center continues to own the orthogonal axis;
- the rendered top border stroke on the first-row cell of the selected column owns the column-pill anchor, while the selected column center continues to own the orthogonal axis;
- the fixed ellipsis layer owns the icon center and stays stationary while the shell grows underneath it;
- clicking a pill opens a compact menu with `Insert before`, `Insert after`, and `Delete row` or `Delete column` actions;
- the active pill remains visible while its menu is open, and Escape or an outside pointerdown closes the menu without mutating the table;
- row and column structural menu clicks capture the current target, run the TipTap mutation synchronously, and close the menu deterministically without delayed replay;
- the menu surface keeps using the live row and column centers derived from the active table DOM, so offscreen controls stay hidden when horizontal scrolling clips them;
- the Add Row and Add Column rails from T1.3B remain in place and continue to honor wrapper scroll-content coordinates.

## Legacy Baseline And Corrections

Legacy Docsera registered the standard TipTap table family in `editorTiptapConfig.ts` without a schema-level top-level-only table group. Its slash-command surface filtered `Table` out of `tableCell` and `tableHeader` contexts in `CommandList.tsx` and `SlashCommand.ts`, and its Playwright coverage included in-cell command filtering in `table-content-block-v1.spec.ts`. E5-T1.2 keeps the standard schema behavior and restores the legacy command-surface suppression without adding a schema-level nested-table prohibition.

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
- compact table pills remain `8x18` and `18x8`, and the expanded pill dimensions are `8x28` and `28x8`

The overlay keeps the Add Column rail aligned to the logical table edge in wrapper scroll-content coordinates, lets the wrapper own the horizontal overflow for that rail, and restores it when horizontal scrolling brings the edge back into view. It does not introduce a hidden E7 rail lane, while resize handles, perimeter multi-cell selection styling, and advanced context menu chrome remain deferred.

The table-control surface now uses explicit current Docsera runtime tokens and local overlay CSS classes for the pill and rail chrome, rather than relying on legacy utility-only presentation assumptions.

## Explicit E7 Exclusions

The following remain deferred to later standard-operation or E7 tasks:

- header toggle UI
- row/column move
- structured row/column/table clipboard
- cross-cell drag selection
- advanced multi-cell selection presentation
- column alignment controls or `align` persistence
- resize handles
