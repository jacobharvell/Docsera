# Implementation Notes - E6-T1A Canonical Accordion Contract and Lightweight Reader Foundation

Date: 2026-08-22

Status: implementation note

## Purpose

This note records the repository-side behavior added for E6-T1A: a canonical accordion document contract, server validation/canonicalization for accordion nodes, and a lightweight published-reader render path for accordions that stays outside the editor runtime.

It describes repo behavior only. Accepted product requirements remain defined by the Obsidian notes and the E6 implementation brief.

## Accordion Contract

- The canonical document schema now accepts a top-level `accordion` block.
- Each accordion contains one or more `accordionItem` children.
- Each accordion item contains exactly two children in order: `accordionTitle` followed by `accordionContent`.
- Accordion titles are single-line inline-only content.
- Accordion content supports the existing nested block set already accepted by the document contract, including media and tables.
- Accordion nodes carry stable ids through `accordionId` and `accordionItemId`.
- Accordion ids are normalized and must be unique within the document.
- Accordion-inside-accordion nesting is rejected.
- Empty accordions, malformed item structure, duplicate ids, and unsupported title/body children are rejected.

## Server-Side Validation And Canonicalization

- `src/server/pages/serverEditorDocument.ts` now validates accordion nodes as part of the shared structured-document parser.
- The validator enforces the new accordion structural rules before a document can be accepted as canonical.
- Unsupported accordion attributes are rejected during validation.
- Accepted accordion identity attributes are normalized and preserved during canonicalization.
- Plain-text extraction preserves accordion title and body text in document order so reader/search surfaces can still derive text from accordion content.

## Reader Foundation

- `PublishedDocumentReader` renders accordions without mounting TipTap or ProseMirror.
- Accordion disclosure is local to the reader and uses lightweight React state.
- Only one accordion item can be open at a time within a given accordion group.
- Zero-open state is valid and preserved.
- Reader identity changes remount the lightweight reader so disclosure state cannot leak across pages or documents.
- Accordion-body headings render in an isolated anchor namespace so open accordions do not perturb top-level page heading anchors or ToC links.
- The reader still renders nested supported blocks inside accordion bodies, including tables and media.

## Fixture Coverage

- `src/shared/editor/documentFixtures.ts` now provides canonical single-item and multi-item accordion fixtures.
- The document corpus includes valid accordion cases plus invalid cases for empty groups, malformed item structure, duplicate ids, nested accordions, title hard breaks, embedded line breaks, prohibited title link marks, and unsupported body content.

## Regression Coverage

- `src/shared/editor/document.test.ts` covers canonical round trips and plain-text extraction for accordion content.
- `src/shared/editor/schema.test.ts` covers acceptance and rejection of canonical and malformed accordion documents.
- `src/client/features/workspaces/PublishedDocumentReader.test.tsx` covers reader disclosure behavior, state reset, invalid-structure recovery, and the TipTap-free reader boundary.

## Notes

- This change intentionally does not add authoring UI for accordion creation or editing.
- The reader disclosure state is transient UI state only; it is not serialized into the document contract.
