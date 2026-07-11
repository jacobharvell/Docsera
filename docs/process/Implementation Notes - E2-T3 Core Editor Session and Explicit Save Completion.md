# Implementation Notes - E2-T3 Core Editor Session and Explicit Save Completion

Date: 2026-07-11

Status: implementation note

## Purpose

This note records the repo-side behavior hardened for E2-T3: production TipTap session ownership, explicit-save completion, stale-operation protection, and recovery behavior.

It describes implementation behavior only. Accepted product requirements remain defined by the Obsidian notes and the E2 implementation brief.

## Session Ownership And Lifecycle

- The workspace shell owns page identity, mode changes, and the generation token that defines the active editor session.
- The production editor host owns TipTap creation, local document transactions, outline extraction, save requests, and editor-local UI.
- Session identity remains page-scoped plus generation-scoped. Save completion does not create a new session generation.
- Revision updates do not participate in the React session key.
- Page changes, workspace changes, mode changes, retry, and access-loss invalidation terminate the prior session generation.
- Ordinary rerenders for the same page keep the same editor instance and preserve undo history.

## Explicit Save Snapshot And Revision Flow

- Explicit Save remains the only production persistence path for the draft editor in this slice.
- Save requests snapshot the current canonical TipTap JSON and the current persisted draft revision.
- The child host passes canonical document JSON through the parent persistence adapter without converting it to body text or another fallback representation.
- The runtime keeps TipTap as the authority for live document content and undo/redo history.
- A successful save advances the persisted revision using the returned draft revision when present.
- A successful save marks the session clean only when the live document still matches the saved snapshot.
- If newer edits occur while a save is pending, the accepted snapshot still advances and the live document remains dirty.
- Clean documents short-circuit explicit save and do not issue a persistence write.

## Stale-Operation Protection

- The editor runtime uses a save-generation guard plus a page/session guard so obsolete async completions do not mutate the active session.
- Duplicate or overlapping explicit saves are blocked by the runtime in-flight guard and cannot corrupt status or revision state.
- Late save completions from an obsolete page or replaced session are ignored by the parent shell.
- Late outline, status, and mount/load callbacks from an obsolete session are ignored by the parent shell contract.
- Parent page state updates from save completion occur only after the result is confirmed to belong to the active editor session.

## Failure And Recovery

- Failed saves preserve the in-memory TipTap document and leave the session dirty.
- Forbidden save results trigger access-loss recovery.
- Access loss invalidates the current session generation and hides editor-only affordances for the rest of that session.
- The editor runtime surfaces a safe generic save-failure message for unexpected thrown errors.
- Retry after a failed save reuses the same page session only when the parent has not invalidated it.

## Validation Coverage

Automated coverage now includes:

- dirty transition after a real TipTap transaction
- clean explicit save no-op behavior
- save while a request is pending
- save failure and retry
- forbidden/access-loss save result
- conflict preservation after an explicit save failure
- duplicate and overlapping explicit save suppression
- canonical JSON and trailing whitespace preservation through the explicit-save path
- same-page rerender preserving the editor instance
- parent-shell stale callback filtering after page-session replacement
- late successful and failed completion filtering after page-session replacement

Manual PDI verification remains required for:

1. editing and explicitly saving a page
2. refreshing and confirming the saved draft reloads
3. continuing to type after a save begins and confirming newer work remains unsaved
4. switching pages with unsaved changes and confirming the transition guard
5. confirming a successful save does not visibly remount the editor or reset the page session

## Remaining E3 Dependencies

- Atomic compare-and-save remains deferred to E3.
- Autosave remains deferred to E3.
- Conflict recovery remains deferred to E3 beyond the current revision-aware explicit-save behavior.
- Publish-time flush behavior remains deferred to E3.
- Flush-before-navigation and flush-before-publish remain out of scope for E2-T3.
