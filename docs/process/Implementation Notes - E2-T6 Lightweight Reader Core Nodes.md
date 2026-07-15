# Implementation Notes - E2-T6 Lightweight Reader Core Nodes

Date: 2026-07-14

Status: implementation note

## Purpose

This note records the repository-side behavior added for E2-T6: the lightweight published reader, its shared heading-anchor behavior, and the Live/Edit runtime boundary that keeps the reader free of TipTap/ProseMirror.

It describes repo behavior only. Accepted product requirements remain defined by the Obsidian notes and the E2 implementation brief.

## Lightweight Reader Ownership

- Live mode renders the published page through `PublishedDocumentReader` inside the workspace shell.
- The parent shell owns routing, page identity, and mode selection.
- The reader owns only published-content rendering and validation; it does not create or own an editor session.
- Live mode does not mount the editor host and does not request the TipTap/ProseMirror runtime.
- Live mode therefore stays on the lightweight reader path even when Edit mode uses the isolated child editor host.

## Supported Reader Content

The reader now renders the E2 node and mark set that is expected in the current smoke corpus:

- paragraphs
- heading level 2
- heading level 3
- bold
- italic
- strike
- inline code
- links
- hard breaks
- blockquotes
- horizontal rules
- code blocks
- unordered lists
- ordered lists
- task lists

The reader preserves the published document structure for supported content instead of flattening it into plain text.

## Shared Heading Anchors And TOC Alignment

- Heading anchors come from the shared canonical resolver in `src/shared/editor/headingAnchors.ts`.
- The reader and the workspace outline both use the same heading text normalization and duplicate-anchor suffixing rules.
- Duplicate headings therefore produce deterministic unique anchors.
- The table of contents links target the same anchor ids the reader assigns to rendered headings.
- Empty headings stay renderable without generating a broken anchor.

## Recursive Nested List Rendering

- Nested bullet lists render recursively inside list items.
- Nested ordered lists render recursively inside list items.
- Nested task lists also render recursively instead of stopping at the first list boundary.
- The list renderer preserves child block structure while keeping unsupported children out of the live document surface.

## Ordered-List Attributes

- Ordered lists preserve supported `start` and `type` attributes.
- `start` remains the rendered list start index when it is a positive integer.
- `type` remains the rendered list style when it is one of `1`, `a`, `A`, `i`, or `I`.
- Invalid ordered-list attributes are rejected rather than coerced into an unrelated list style.

## Read-Only Task Lists

- Task lists render as disabled checkboxes plus content rows.
- Checked and unchecked task items remain visibly distinct.
- Nested task items remain renderable in the same recursive tree.
- The reader does not turn task items into interactive editor controls.

## Safe-Link Handling

- Links are rendered only when the href passes the shared safe-link policy.
- Safe links open in a new tab with opener protection.
- The reader preserves the accepted `rel` and `target` attributes for safe outbound links.
- Unsafe or malformed links do not fall through to an unsafe clickable surface.

## Contained Unsupported Content

- Unsupported or invalid structures stay contained to the reader boundary.
- Invalid published content surfaces the reader recovery state instead of trying to improvise a partial render.
- The reader never falls back to loading the editor runtime just because published content is invalid.

## Live-Mode Boundary

- Live mode does not expose save, autosave, page-lock, slash, formatting, or link-editing controls.
- Live mode does not mount the ProseMirror editor host.
- Edit-mode-only runtime requests stay out of the Live-mode reader path.
- The Live reader therefore stays lightweight even while Edit mode keeps the isolated child editor session.

## Windows Spawn And Lifecycle Protection

- The managed validation lifecycle keeps Windows stages attached to the invoking console by using `windowsHide: true`.
- POSIX stage roots continue to use detached process-group behavior.
- The watchdog, scoped stage-tree cleanup, and owner-checked release semantics remain unchanged.
