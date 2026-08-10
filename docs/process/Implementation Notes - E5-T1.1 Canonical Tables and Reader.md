# Implementation Notes - E5-T1.1 Canonical Tables and Reader

Status: implemented on `feature/e5-t1-1-table-contract-reader`

## Scope

E5-T1.1 defines the non-authoring standard table foundation. It makes canonical table JSON valid through the shared/server document contract, plain-text extraction, publish validation, and the lightweight reader.

The active TipTap editor schema is intentionally unchanged in this task. No table extension dependency, editor command, slash or Quick Add creation path, paste policy, row/column controls, rails, table selection, resizing, or structured clipboard behavior is introduced here.

## Canonical Node Hierarchy

Supported table nodes:

- `table`
- `tableRow`
- `tableCell`
- `tableHeader`

Valid structure:

- `doc` may contain `table` as a top-level block.
- `table` must contain one or more `tableRow` children.
- `tableRow` must contain one or more `tableCell` or `tableHeader` children.
- `tableCell` and `tableHeader` must contain one or more supported nested block nodes.

Cells use the existing nested block set used for standard non-table document content: paragraphs, headings, bullet lists, ordered lists, task lists, blockquotes, horizontal rules, and code blocks. E5-T1.1 does not make tables valid inside cells, lists, or blockquotes.

## Structural Attributes

`table` and `tableRow` have no supported attributes.

`tableCell` and `tableHeader` support the standard TipTap/ProseMirror structural attributes:

- `colspan`: positive integer, canonical default `1`
- `rowspan`: positive integer, canonical default `1`
- `colwidth`: `null` or an array of positive integers whose length equals `colspan`, canonical default `null`

Docsera-specific alignment is not part of this contract. The Legacy `align` attribute remains deferred with the later authoring and advanced table decisions.

## Reader Representation

The lightweight reader renders canonical table JSON without importing TipTap or ProseMirror:

- wrapper: `div.docsera-main__table-wrapper`
- table: semantic `<table>` with `<tbody>`
- rows: `<tr>`
- cells: `<td>`
- headers: `<th>`

Supported `colspan` and `rowspan` values are reflected through `colSpan` and `rowSpan` in the rendered HTML. Cell and header content is rendered through the existing nested block and inline rendering paths, so supported marks and links work the same inside table cells as elsewhere in the reader.

## Plain Text

Plain-text extraction now traverses `table`, `tableRow`, `tableCell`, and `tableHeader`. Cell/header block content contributes to extracted body text in document order.

## Visual Baseline

Reader table styling carries forward the Legacy table geometry where compatible:

- horizontal overflow wrapper
- `1rem 0` vertical table margin
- collapsed borders
- auto table layout
- `width: max-content`
- inherited text size and line height
- `80px` minimum cell width
- `0.38rem 0.75rem` cell padding
- thin tokenized cell borders

The styling uses current Docsera theme tokens instead of copying Legacy palette values. It does not reserve space for E7 rails or render advanced table-control chrome.

## Deferred T1.2 Questions

E5-T1.2 owns active TipTap table integration and must still resolve:

- whether pasted HTML tables are accepted when table nodes are registered in the editor;
- which creation paths are exposed first;
- whether newly created tables default to headers;
- how basic header, row, column, and delete operations are surfaced without E7 rails.
