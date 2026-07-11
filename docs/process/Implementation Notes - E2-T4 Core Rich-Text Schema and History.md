# Implementation Notes - E2-T4 Core Rich-Text Schema and History

Date: 2026-07-11

Status: implementation note

## Purpose

This note records the repository-side behavior hardened for E2-T4: the production rich-text schema registry, bounded paste handling, canonical validation, and page-scoped undo/redo.

It describes implementation behavior only. Accepted product requirements remain defined by the Obsidian notes and the E2 implementation brief.

## Authoritative Schema Registry

- `src/shared/editor/schema.ts` is the single registry source for the production editor schema.
- The registry is used by both editor creation and structural validation.
- The supported production E2 editor surface is built from:
  - `Document` with empty-doc support via `block*`
  - paragraph
  - heading levels `H2` and `H3` only
  - bullet and ordered lists
  - task lists and task items
  - blockquotes
  - horizontal rules
  - code blocks
  - links
  - bold, italic, strike, inline code
  - hard breaks
- The editor keeps `UndoRedo` behavior in the active TipTap session.
- `Underline` remains disabled.

## Canonical Document Validation

- `src/shared/editor/schema.ts` is the single contract source for the supported rich-text node and mark shapes.
- `src/shared/editor/document.ts` validates raw structured content against that contract before any canonicalization runs.
- The raw validator rejects:
  - unsupported node and mark types
  - unknown node and mark attributes
  - malformed supported attributes
  - invalid content expressions and nesting
  - unsupported heading levels
  - invalid task checked state
  - invalid ordered-list `start` values
  - unsupported ordered-list `type` values
  - invalid code-block language values
  - unsafe link destinations
- Canonicalization now runs only after raw validation succeeds and produces a defensive normalized copy.
- Empty canonical docs remain valid.
- Legacy raw `doc` documents continue to normalize in memory and do not require a persistence rewrite during load.
- The accepted ordered-list `type` values are `null`, `1`, `a`, `A`, `i`, and `I`.
- The accepted link attributes are `href`, `target`, `rel`, `class`, and `title`, with `href` required and the other attributes limited to `string` or `null`.

## Paste Handling

- `src/client/editor/pasteSanitizer.ts` strips unsafe pasted markup before the TipTap parser runs.
- Unsafe script-like and style-like nodes are removed.
- Unsafe attributes such as event handlers and `style` are stripped.
- Unsafe link destinations are rejected before they can become interactive or persisted links.
- Supported structure from rich HTML paste is preserved instead of being flattened.
- The sanitizer intentionally stays semantic: unsupported active or embedded markup is removed, but CSS-only fidelity from sources such as Word or Google Docs is not preserved.
- Plain-text paste remains plain text, with normal line handling and URL autolink support.

## History And Save Behavior

- The production editor host keeps a single page-scoped TipTap session alive across ordinary rerenders.
- Explicit save does not remount the editor or clear the undo stack.
- Undo and redo continue to operate after a successful save.
- Changing pages still replaces the session, so history remains isolated per page session.

## Validation Coverage

Automated coverage now includes:

- raw validation of the supported rich E2 document, nested task lists, checked and unchecked task state, code-block terminal whitespace, and combined inline marks
- rejection of unknown node types, unknown mark types, unknown node attributes, unknown mark attributes, malformed link attributes, unsafe links, invalid ordered-list `start` values, unsupported ordered-list `type` values, invalid task checked values, invalid nested list or task-list content, invalid code-block language values, and invalid heading levels
- canonical round-trip fixtures for the supported rich E2 document, nested task lists, task checked-state round trips, code-block terminal whitespace, and combined inline marks
- supported empty and legacy document loads
- client, server, and ServiceNow record-mapping document-parsing parity
- rich HTML paste preserving supported structure while stripping unsupported active and embedded markup
- plain-text paste preserving line structure and autolink behavior
- explicit save of canonical rich content
- undo and redo through real TipTap transactions
- undo history surviving explicit save
- page-session replacement remaining isolated in the shell boundary
- hard-break compatibility in the lightweight reader helper for both `hardBreak` and legacy `hard_break`

## Remaining Dependencies

- E2-T5 still owns user-facing slash commands, link UI, and formatting controls.
- E2-T6 still owns the lightweight reader implementation for the full rich schema.
- This note does not claim Markdown/source mode, collaboration, publishing, or conflict recovery.
