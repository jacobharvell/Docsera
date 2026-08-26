# Implementation Notes - E6-T2A Canonical Columns Contract and Lightweight Reader Foundation

Date: 2026-08-25

Status: implementation note

## Purpose

This note records the repository-side behavior added for E6-T2A: a canonical Columns document contract, server validation and canonicalization for `columns` / `column`, and a lightweight published-reader render path that stays outside TipTap and ProseMirror.

It describes repo behavior only. Accepted product requirements remain defined by the Obsidian notes and the E6 implementation brief.

## Canonical Columns Contract

The canonical document schema now accepts a top-level `columns` block that contains exactly 2, 3, or 4 `column` children.

`column` is a structural block container:

- it must contain at least one supported nested block;
- the canonical empty-column sentinel is a single empty paragraph;
- it may contain the column-supported nested block set, including canonical `accordion` blocks;
- it does not carry stable item identity metadata;
- it does not rely on presentation-only state to represent emptiness.

The canonical runtime schema allows `columns` at document root and directly inside an Accordion body. `columns` is not a generic nested block. A `columns` block is rejected anywhere beneath a `column` ancestor, including indirect nesting through another block or Accordion body.

## Validation And Canonicalization

`src/server/pages/serverEditorDocument.ts` now validates `columns` and `column` nodes as part of the shared structured-document parser.

The validator enforces:

- `columns` must contain 2-4 children;
- every `columns` child must be a `column`;
- `column` must contain at least one child block;
- `column` may only contain the column-supported nested block set, including `accordion`;
- `accordionContent` may contain the normal accordion-body block set plus `columns`;
- `accordion` keeps its own nested-content restrictions unchanged;
- any `columns` node with a `column` ancestor is rejected by the canonical validator, even when the ProseMirror content expression cannot encode that ancestor-dependent restriction directly;
- malformed `columns` structures are rejected rather than repaired by dropping content.

Canonicalization keeps valid Columns structure intact and does not add persistent per-column ids or transient state fields.

Plain-text extraction now traverses `columns` and `column` in document order so reader/search surfaces preserve text from inside columns.

## Reader Foundation

`PublishedDocumentReader` renders canonical Columns JSON without mounting TipTap or ProseMirror.

Reader behavior:

- `columns` renders as equal-width tracks at normal widths, including when nested inside accordion content;
- `column` renders as a normal block container for nested reader content;
- nested supported blocks inside columns use the existing reader behavior for those block types;
- headings inside columns keep the existing heading-anchor behavior;
- invalid Columns documents fail through the existing contained invalid-document reader recovery path.

## Responsive Contract

The reader uses the current Docsera responsive boundary, not a copied legacy breakpoint, to stack Columns into a single vertical track at narrow application widths.

The current stylesheet contract uses the reader columns wrapper plus a narrow-width stack rule at `920px`.

## Fixture And Test Coverage

`src/shared/editor/documentFixtures.ts` now provides canonical 2-, 3-, and 4-column fixtures.

Focused regression coverage lives in:

- `src/shared/editor/columns.test.ts`
- `src/client/features/workspaces/PublishedDocumentReader.columns.test.tsx`

These tests cover:

- canonical schema shape;
- round-trip preservation;
- empty-column sentinel preservation;
- plain-text traversal order;
- invalid count and indirect nesting rejection;
- reader rendering and recovery;
- responsive stylesheet contract.

## Validation

Validation performed for this change:

- focused `editor-columns` managed Vitest suite;
- frontend SDK build.

Validation intentionally skipped:

- full test suite;
- `editor-interactions`;
- broad `editor-contract`;
- broad `reader-toc`;
- interactive PDI/browser testing;
- deployment.
