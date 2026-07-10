# Implementation Notes - Page Body Draft Persistence and Save Foundation

Status: implementation note

## Purpose

This note records the repo-side draft body save slice for the active Docsera runtime in `app/docsera-ui`.

Accepted product requirements remain in the Obsidian vault; see `docs/process/Requirements Source Map.md`.

## Runtime Boundary

- The SDK-native runtime now exposes a scoped `PATCH /api/x_82900_docsera/docsera_runtime/pages` route for explicit draft body saves.
- The existing `GET /api/x_82900_docsera/docsera_runtime/pages?workspaceSlug=<slug>` route remains the hydration path for live page records after refresh or reopen.
- The browser client uses the same same-origin ServiceNow client wrapper and the same result-envelope normalization path, including double-wrapped `result.result` responses.

## Draft Body Save Behavior

- The selected live page editor is textarea-based for this slice.
- Explicit save updates the selected page record on the ServiceNow side.
- The saved fields are `draft_body_text` and `draft_content_json`.
- `draft_content_json` is stored as a simple document JSON shape derived from the body text, not a full TipTap/Markdown round-trip.
- Canonical page JSON remains stored directly on the page record rather than in attachments, segmented child records, or compressed side channels.
- The canonical JSON fields `draft_content_json` and `published_content_json` use the explicit bounded source contract `StringColumn({ maxLength: 262144 })`.
- The body-text fields `draft_body_text` and `published_body_text` remain temporary compatibility fields at `StringColumn({ maxLength: 4000 })`.
- Canonical JSON is serialized and persisted without generic text trimming; terminal whitespace inside TipTap text nodes is preserved.
- The validated MVP storage boundary for the current PDI is approximately `240k` serialized JavaScript characters for both draft and published canonical version-1 envelopes.
- The selected page remains selected after save.
- Refreshing or reopening the workspace reloads the saved draft body through the live page list hydration path.

## Access Control

- The server save route enforces workspace authoring access before writing anything.
- The server confirms the target page belongs to the workspace being edited before persisting.
- Client-side rendering only exposes the editor in the authoring workspace shell.

## UI Behavior

- The editor tracks `saved`, `dirty`, `saving`, and `failed` states.
- Save is explicit and duplicate submits are blocked while a save is in flight.
- Save failures keep the draft text in place and surface a stable user-facing error.
- Unexpected save-route errors log only safe page/workspace metadata plus draft body length, not the body text itself or `draft_content_json`.
- The browser client maps unexpected save failures and transport exceptions to the same stable generic message.
- Empty draft bodies remain editable and do not masquerade as saved content.

## Deferred Boundary

- Autosave is still deferred.
- Publishing is still deferred.
- Conflict handling is still deferred.
- Markdown/source round-tripping is still deferred.
- Version history is still deferred.

## Validation

The repo-side tests now cover:

- server-side draft body save success and failure cases
- page/workspace ownership enforcement
- client save response normalization, including double-wrapped envelopes
- safe logging and safe user-facing handling for unexpected save failures
- textarea editor dirty/saving/saved/error behavior
