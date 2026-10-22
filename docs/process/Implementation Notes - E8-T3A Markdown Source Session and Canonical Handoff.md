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


### Source diagnostics

Conversion failures may include a half-open `range` (`from`, `to`) in UTF-16 offsets into the complete authored Markdown string. Ranges come from YAML or Markdown parser positions or an unambiguous malformed delimiter line, and are omitted when a reliable non-empty location is unavailable. Newline normalization is translated back to authored offsets. The Source session decorates the current range without changing text or selection and recomputes it on document changes; replacing or destroying a session removes its decorations. Failure messages and invalid-draft recovery remain authoritative even without a range.

The Source editor displays CodeMirror line numbers, including one number per logical source line when text wraps. A ranged failure provides a zero-width triangular marker at the diagnostic start and a hover tooltip positioned above first, with an Error badge and the converter message. The compact recovery area provides fixed instructions and a separate discard button; its converter explanation remains accessible to keyboard and screen-reader users, and is visible for unlocated failures. Locations continue to come only from converter-provided ranges; literal text is not inferred to be malformed. Document changes dismiss open tooltips; canonical replacement and session teardown remove them with the editor state.

The diagnostic-only collector uses the strict converter's validators, shared body AST, and offset mapping to inspect independently parsed nested blocks and table cells. It retains parent failures, deduplicates propagated failures, and retains strict document-level failures. Invalid frontmatter can be reported alongside body failures when exact delimiters establish a boundary, when a malformed opening is followed by one or more recognizable metadata lines and an exact closing delimiter, or when a single title field lies between an exact opening and an identifiable malformed closing delimiter. Missing or conflicting boundaries do not trigger speculative body inspection. Strict whole-document conversion alone controls canonical updates and switching to Visual; collection never produces a canonical document.

Invalid frontmatter is projected as one block-wide `Malformed frontmatter` diagnostic with a formatting example in its tooltip. The collector inspects independent body errors only when its existing delimiter rules establish a trustworthy boundary; strict conversion remains authoritative for canonical updates.
