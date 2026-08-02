# Revision-Safe Page Body Autosave

## Runtime state model

The lazy `PageEditorHostRuntime` remains the only owner of the live TipTap document. It derives a serialized document key directly from TipTap and reports plain `Unsaved`, `Saving…`, `Saved`, or `Changes not saved` data to the App shell. The current visible status remains in the page-title/editor area during Task 46; Task 47 is the later header-presentation move. No React document mirror is introduced.

Task 46 corrected a false initialization-mutation regression at the editor-runtime boundary. TipTap can emit one or more mount-time updates before the session is ready for user edits. Those updates are now treated as initialization work instead of autosave-eligible mutations.

- Clean entry keeps a short initialization window through the initial mount burst.
- If a clean session's mounted TipTap document differs from the loaded draft before any user edit, that mounted result becomes the session's clean saved baseline.
- If the session started from restored local recovery content, the mounted document updates only the current in-memory document and remains dirty against the authoritative saved baseline.
- Initialization updates clear stale status or error state and refresh the outline, but they do not schedule autosave, execute autosave, or advance the accepted revision.

## Canonical empty document and paragraph canvas

The one canonical empty representation is `{"schemaVersion":1,"document":{"type":"doc","content":[{"type":"paragraph"}]}}`. Previously stored raw or enveloped `{type:"doc"}` documents and documents with an empty `content` array remain accepted, but parse immediately to that same runtime-compatible representation. Invalid and unsupported documents still fail closed.

Focus, caret movement, selection-only transactions, outline extraction, editable-state setup, and other non-content initialization work do not change the document baseline, schedule a save, or advance the draft revision. The paragraph is immediately usable. Clicking canvas space below content reuses an existing trailing empty paragraph or appends one paragraph at the document end; repeated clicks do not duplicate it. Normal paragraph Enter behavior remains TipTap/ProseMirror-owned, preserving native list, task-list, blockquote, and code-block behavior.

## Debounce, coalescing, and flush

Authorized document transactions restart a 700 ms idle timer. One request is allowed in flight per editor session. A save snapshots the current canonical envelope and expected accepted revision; if editing continues while it is in flight, `flushLatest` serially saves the newest snapshot after the accepted result. A no-op document does not save. Vitest drives this same timer path; there is no test-only Save control or test-mode autosave bypass.

`flushLatest(): Promise<boolean>` is passed through the existing host status boundary. It resolves true only when the current TipTap document is persisted at an accepted revision. App route changes capture the current editor session and transition generation before invoking it: a successful current-session flush commits directly, while failure opens leave protection. Obsolete session or transition completions cannot commit a newer request. The registered flush is cleared when the session is destroyed, replaced, access is lost, or Edit mode ends. Browser close or reload uses the same dirty comparison for its native warning.

The first real post-mount document mutation still follows the normal contract: it marks the page dirty, starts the 700 ms debounce, persists through the existing serialized save path, advances the accepted draft revision only after success, and returns to `Saved` when the in-memory document matches the accepted snapshot.

## Single-session persistence boundary

The client uses the existing `savePageBody` adapter. Production saves require a caller-supplied non-negative safe-integer `expectedRevision`; missing, malformed, fractional, or negative values are rejected and never replaced with the revision loaded by the service. The scoped server authorizes workspace editing, validates the canonical envelope, and calls `savePageDraftRecord`.

The server now uses ordinary scoped `GlideRecord` persistence for autosave. The service loads the page through the existing workspace or page authorization path, compares `expectedRevision` with the currently accepted draft revision as a sequential stale-request guard, then saves only `draft_content_json`, `draft_body_text`, and `draft_revision`. Published fields, title, slug, and publication state are not written by autosave.

`savePageDraftRecord` returns the known accepted request snapshot rather than inferring success from a later readback. The returned revision is the accepted sequential revision for that request. A later same-session save can therefore advance from the accepted revision without depending on a refresh.

This boundary is intentionally scoped to one active editor session per page. The draft revision remains useful for same-session sequencing, stale-request rejection, diagnostics, and future evolution, but it is not represented as atomic simultaneous multi-session protection.

## PDI verification

The earlier GlideQuery experiment proved two things:

- imported `global.GlideQuery` could be invoked successfully from scoped source when cross-scope access was packaged correctly;
- its `rowCount` result was not a safe atomic compare-and-save acceptance boundary for simultaneous autosave requests.

The required concurrency proof therefore failed the original design goal, and the GlideQuery helper, dependency plumbing, and cross-scope privilege metadata were removed. E3-T1 does not replace that failed atomicity claim with another cross-session mechanism. The accepted MVP contract is narrower: one active editor session per page, debounced and serialized within that session.

Focused PDI validation for the supported contract now checks:

- Live -> Edit clean entry issues zero page-body save calls and no false `Unsaved` or `Saving…` sequence.
- direct Edit refresh or reopen on an unchanged persisted draft begins clean.
- repeated Live -> Edit -> Live -> Edit re-entry stays clean until a real mutation occurs.
- first edit persists automatically from revision `0 -> 1`;
- continued typing during an active request coalesces behind the in-flight request and saves the newest document afterward;
- a second sequential edit persists from `1 -> 2`;
- refresh restores the latest saved draft;
- published JSON, body, title, slug, and publication state remain unchanged;
- transient failures follow the finite retry sequence and terminal failures preserve local content without unbounded retry.

Local regression coverage now includes:

- a real `PageEditorHostRuntime` mount test proving restored unsaved recovery input remains dirty and does not autosave on mount;
- a targeted initialization-baseline test that emits controlled mount-time `onUpdate` bursts, proves a clean session stays `Saved` with no autosave and no save request during initialization, and then proves the first real post-initialization update follows the ordinary single autosave path exactly once;
- the existing command and runtime tests that keep no-op slash or selection behavior clean and preserve first-edit autosave, retry, conflict, and stale-session behavior.

## Failures and session safety

Network interruption, an explicitly classified transient persistence result, and HTTP 408, 429, 502, 503, or 504 retain the in-memory document, report `Changes not saved`, and retry automatically at most four times after the initial attempt: 1.5, 3, 6, and 12 seconds. After the fourth retry fails, no fifth timer or continuing 12-second poll is scheduled. One request remains in flight at most, and the latest document is coalesced serially. A meaningful new document edit resets the finite sequence; an explicit navigation flush may make one immediate attempt without creating an unbounded sequence.

Conflicts, forbidden or access-loss results, validation failures, document-capacity failures, malformed success or persistence results, invariant or configuration failures, known non-transient HTTP 500 responses, and all other unsupported HTTP statuses are terminal. They do not schedule an automatic retry. The page-save API returns sanitized stable codes and a retryable classification while logging internal exceptions only on the server. All failures preserve the local TipTap document, `Changes not saved`, unload or destructive-navigation protection, and published-field isolation. Timers are cancelled on teardown, access loss, page-session replacement, and leaving Edit mode. The runtime ignores completion after disposal, while the App session token prevents stale callbacks from updating a later page.

## Explicit non-goals

This implementation note does not claim:

- simultaneous multi-tab or multi-user compare-and-save safety;
- collaborative editing, live presence, shared cursors, OT, or CRDT behavior;
- a page-level edit-session lock or lease;
- structural move, reparent, or reorder protection under a future page lock.

Those behaviors remain outside MVP autosave. The planned follow-up is a separate page edit-session guard that blocks editable mounting on already-locked pages while keeping the workspace in Edit mode and the page rendered read-only from the draft projection.
