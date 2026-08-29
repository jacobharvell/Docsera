Date: 2026-08-28

Status: implementation note

## Purpose

This note records the repository-side behavior added for E8-T3A: a dedicated Markdown source-session boundary and a narrow canonical-document handoff to the existing visual editor session.

It describes implementation boundaries only. Accepted product behavior remains authoritative in `Requirements/40 Editor.md`.

## Source-Session Ownership

- Markdown source editing now has its own session module in `app/docsera-ui/src/client/editor/MarkdownSourceSession.ts`.
- The source session owns raw Markdown text, text-editor-local undo/redo, and converter-backed validity state.
- The session is built on CodeMirror 6 and stays authoring-only code under `src/client/editor`. It is not part of the lightweight reader contract.

## Exact Invalid Text Ownership

- The source session retains the exact raw text currently in the text editor.
- Valid source snapshots expose the exact raw text plus the parsed title, canonical envelope, and normalized Markdown returned by the E8-T2 converter.
- Invalid source snapshots keep the exact raw text and the structured converter failure. They do not emit a replacement title or canonical envelope.

## Canonical Source-To-Editor Handoff

- The existing visual editor status boundary now exposes two additional narrow hooks:
  - `getCanonicalEnvelope()` returns the current canonical envelope from the active TipTap session, including unsaved visual edits.
  - `applyCanonicalEnvelope(envelope)` replaces the current canonical body document in the active TipTap session.
- The shell still exchanges only canonical document envelopes across the boundary. It does not own ProseMirror transactions, selection internals, or editor-history machinery.

## Undo And Synchronization Rules

- Initial source projection uses the E8-T2 serializer and starts clean.
- Programmatic source synchronization resets the CodeMirror state so synchronization does not become a source undo entry and stale source history does not leak across replacements.
- Source-derived visual replacement uses one non-history ProseMirror document replacement. Canonical-identical replacements are explicit no-ops, so they do not create false dirty, save, or autosave behavior.

## Persistence Boundary Reuse

- Source-derived canonical body replacement still flows through the existing visual editor dirty/status/autosave/revision pipeline.
- E8-T3A does not introduce a parallel Markdown body persistence engine.
- Successful source-to-visual replacement is observed by the same autosave and recovery machinery already used by normal visual edits.

## Remaining E8-T3B Work

- E8-T3A does not expose the `[Visual | Markdown]` workspace control.
- E8-T3B still needs to wire workspace-level authoring-surface state, title synchronization, invalid-source navigation behavior, and same-workspace page/session orchestration across the visible UI.
