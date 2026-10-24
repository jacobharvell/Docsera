# Revision-Safe Page Body Autosave

## Runtime state model

The lazy `PageEditorHostRuntime` remains the only owner of the live TipTap document. It derives a serialized document key directly from TipTap and reports plain `Unsaved`, `Saving…`, `Saved`, or `Changes not saved` data to the App shell. Task 46 kept the autosave contract at the editor-runtime boundary; Task 47 moved the current-page visible status into the Edit-mode workspace header immediately before Publish. The runtime still does not mirror the document into React state.

Task 46 corrected a false initialization-mutation regression at the editor-runtime boundary. TipTap can emit one or more mount-time updates before the session is ready for user edits. Those updates are now treated as initialization work instead of autosave-eligible mutations.

- Clean entry keeps a short initialization window through the initial mount burst.
- If a clean session's mounted TipTap document differs from the loaded draft before any user edit, that mounted result becomes the session's clean saved baseline.
- If the session started from restored local recovery content, the mounted document updates only the current in-memory document and remains dirty against the authoritative saved baseline.
- Initialization updates clear stale status or error state and refresh the outline, but they do not schedule autosave, execute autosave, or advance the accepted revision.

## Canonical empty document and paragraph canvas

The one canonical empty representation is `{"schemaVersion":1,"document":{"type":"doc","content":[{"type":"paragraph"}]}}`. Previously stored raw or enveloped `{type:"doc"}` documents and documents with an empty `content` array remain accepted, but parse immediately to that same runtime-compatible representation. Invalid and unsupported documents still fail closed.

Focus, caret movement, selection-only transactions, outline extraction, editable-state setup, and other non-content initialization work do not change the document baseline, schedule a save, or advance the draft revision. The paragraph is immediately usable. Clicking canvas space below content reuses an existing trailing empty paragraph or appends one paragraph at the document end; repeated clicks do not duplicate it. Normal paragraph Enter behavior remains TipTap/ProseMirror-owned, preserving native list, task-list, blockquote, and code-block behavior.

Shadow-root click retargeting on the installed PDI can report ordinary editor clicks through the `ProseMirror` root element instead of the inner text block. The blank-canvas helper therefore only runs for clicks whose client Y position is at or below the last rendered content block. Root-retargeted clicks above that boundary must remain ordinary focus and caret placement, not draft mutations.

Installed-runtime focus loss on Sunday, August 2, 2026 was not caused by `pointerdown` or `mousedown` cancellation. Native `mousedown` did focus the `ProseMirror` root inside the child shadow root, but the focused node was then immediately removed and replaced by a fresh `ProseMirror` instance, which blurred the editor back to `BODY` before typing. The first remount came from `PageEditorHostRuntime` treating callback-prop identity (`onEditorReady`, `onOutlineChange`) as `useEditor(...)` construction dependencies. Parent rerenders that refreshed those callback identities therefore rebuilt the editor instance during ordinary click-to-focus interaction. The correction keeps those callbacks in refs and removes them from the editor-construction dependency list so callback refreshes update behavior without replacing the mounted editor DOM.

The remaining blocking caret-loss defect had a second same-session reconstruction boundary. `PageEditorHostRuntime` also fed mounted-session `initialEnvelope` and `initialSavedEnvelope` document objects into `useEditor(...)` construction dependencies. Autosave acknowledgement and parent draft-projection refresh could therefore supply a new accepted document object for the same page session and reconstruct TipTap again exactly when the header status moved to `Saved`. The accepted fix freezes the mounted session's initial and initial-saved envelopes in refs, keeps save acknowledgement limited to accepted revision and saved-baseline updates inside the active runtime session, and removes initial-document object identity from the editor-construction boundary.

Within one active page editor session, autosave acknowledgement may advance the accepted saved document key and accepted draft revision, but it must not reconstruct TipTap, replace the mounted `ProseMirror` node, blur the editor, reset the current selection, or reload identical accepted content back into the active editor. A new editor instance is valid only when the actual editor session boundary changes, such as a different page, a different session key, or a genuine teardown.

That mounted-session envelope freeze is only correct after the session has been initialized from the authoritative target-mode projection. The Monday, August 3, 2026 Task 47 blocking correction proved that same-workspace shell retention cannot reuse a retained Live page view to initialize a new Edit session, or reuse a retained Edit page view to render Live, while the destination `listPages(...)` request is still loading. Shell retention and content authority are separate concerns: same-mode loading may keep the current mounted editor hidden and stable, but cross-mode loading must wait for the destination projection before a new editor session or reader content is created.

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
- header presentation coverage proving the current-page save state is rendered as a bare 20 x 20 icon-only indicator in the workspace header, hidden in Live mode, with no circle/background/border/shadow treatment and the accepted divider treatment before Publish;
- same-session runtime coverage proving save acknowledgement does not replace the editor instance, the mounted `ProseMirror` node, or the active selection/focus state when parent draft refresh supplies new accepted envelopes;
- same-session queue coverage proving a newer edit made during an in-flight save stays on the current editor instance and selection while the existing serialized save flow accepts both saves in order;
- App-boundary mode-switch coverage proving direct Live -> Edit waits for the authoritative draft projection before the first editor mount, repeated Live -> Edit re-entry keeps using that draft projection without a page hop, and Edit -> Live does not transiently render draft-only content while the published projection reloads;
- the existing command and runtime tests that keep no-op slash or selection behavior clean and preserve first-edit autosave, retry, conflict, and stale-session behavior.

## Failures and session safety

Network interruption, an explicitly classified transient persistence result, and HTTP 408, 429, 502, 503, or 504 retain the in-memory document, report `Changes not saved`, and retry automatically at most four times after the initial attempt: 1.5, 3, 6, and 12 seconds. After the fourth retry fails, no fifth timer or continuing 12-second poll is scheduled. One request remains in flight at most, and the latest document is coalesced serially. A meaningful new document edit resets the finite sequence; an explicit navigation flush may make one immediate attempt without creating an unbounded sequence.

Conflicts, forbidden or access-loss results, validation failures, document-capacity failures, malformed success or persistence results, invariant or configuration failures, known non-transient HTTP 500 responses, and all other unsupported HTTP statuses are terminal. They do not schedule an automatic retry. The page-save API returns sanitized stable codes and a retryable classification while logging internal exceptions only on the server. All failures preserve the local TipTap document, `Changes not saved`, unload or destructive-navigation protection, and published-field isolation. Timers are cancelled on teardown, access loss, page-session replacement, and leaving Edit mode. The runtime ignores completion after disposal, while the App session token prevents stale callbacks from updating a later page.

## Failure presentation and local discard

The Edit header owns the actionable autosave-failure presentation. After bounded automatic retries are exhausted, or after a terminal save result, the failed cloud icon opens a compact popover containing only `Failed to save changes.`, `Retry`, and `Discard edits`. The icon remains keyboard-accessible and reopens the popover; successful save, successful local discard, or editor-session teardown removes it. Retry reuses the existing authoritative stale-generation recovery path before asking the active runtime to flush again. Automatic retries retain the saving indicator so the failure popover does not flash for each scheduled attempt.

`Discard edits` is deliberately local: it first reloads the current page's active Edit projection, verifies the session, mutation context, and lease are still current, and only then supplies that draft envelope and revision to the mounted editor runtime. The runtime refuses the replacement while a body save is in flight, cancels pending local timers only after a valid authoritative envelope is accepted, and resets its local saved baseline without issuing a workspace discard or pending-change undo. If authoritative content cannot be established, the local document and failure affordance remain intact. Autosave failure feedback is not rendered in page content, navigation, or the Changes Center.

## Explicit non-goals

This implementation note does not claim:

- simultaneous multi-tab or multi-user compare-and-save safety;
- collaborative editing, live presence, shared cursors, OT, or CRDT behavior;
- a page-level edit-session lock or lease;
- structural move, reparent, or reorder protection under a future page lock.

Those behaviors remain outside MVP autosave. The planned follow-up is a separate page edit-session guard that blocks editable mounting on already-locked pages while keeping the workspace in Edit mode and the page rendered read-only from the draft projection.
