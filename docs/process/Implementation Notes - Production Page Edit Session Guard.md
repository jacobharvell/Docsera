# Implementation Notes - Production Page Edit Session Guard

## Purpose

This note records the production scoped page edit-session guard added around the existing Docsera TipTap autosave flow.

The implementation preserves the current editor host, revision-safe autosave contract, dirty/saving route guard, Live/Edit boundary, and SPA session behavior while adding exclusive page-body editing for one active browser session at a time.

## Production Persistence Contract

- Lock table: `x_82900_docsera_page_edit_lock`
- Winner primitive: explicit table-level unique index on `page_key`
- Required persisted fields:
  - `page_key`
  - `page`
  - `workspace`
  - `holder_user`
  - `verifier_digest`
  - `acquired_on`
  - `last_seen_on`
- The winner decision uses the normalized string `page_key`, not field-level `unique=true`.
- The table is declared `accessibleFrom: "package_private"` and does not expose a general client-writable surface.

## Token and Verification Model

- The server issues a new opaque lock token with scoped secure-random generation.
- The platform session token is not used as Docsera’s edit-session identity.
- Only a SHA-256 verifier digest is persisted.
- Plaintext lock tokens are returned only to the owning session and are not persisted.
- All lock operations derive the authenticated user, workspace, and page server-side before evaluating ownership.

## Runtime Lifecycle

### Acquisition

- Entering Edit mode and loading a page do not claim the lock.
- The client keeps the body read-only until first genuine page-body interaction triggers acquisition.
- Direct pointer, focus, keyboard, and paste intent against the page body can start acquisition without a separate lock button.
- Acquisition calls the production REST route backed by the unique-index insert path.
- No persistent unlocked-state lock card, banner, or call-to-action is shown.
- A same-tab refresh keeps the stored token and can re-present it through the status route to resume the same durable lock.
- A different tab or window does not trust copied session storage by itself. The runtime treats copied-token reuse as a separate session and falls back to normal contention.

### Same-Tab Refresh and Tab Identity

- Generic `pagehide`, `beforeunload`, and `unload` release logic was removed.
- Closing, crashing, or abandoning a tab relies on heartbeat expiry plus scheduled cleanup rather than unload heuristics.
- The client persists only the opaque token locally for refresh resume.
- The runtime assigns each browser tab a stable tab-session identity that survives same-tab refresh.
- While a lock is held, the owning runtime publishes a short-lived same-origin owner marker in local storage that includes the lock fingerprint, runtime instance id, tab-session id, and heartbeat timestamp.
- The owning runtime also answers same-origin lock probes through `BroadcastChannel` when available.
- A refreshed document classifies copied-token coordination into three outcomes before it decides whether to re-present the stored token:
  - `confirmed same-tab resume`
  - `confirmed foreign owner`
  - `uncertain`
- Only `confirmed same-tab resume` re-presents the stored token through the status route.
- `confirmed same-tab resume` requires all of these positive signals together:
  - a fresh owner marker for the same lock fingerprint;
  - the same stable tab-session identity;
  - a different runtime instance id than the marker, proving the marker came from the prior document instance;
  - a reload navigation signal from the current browsing context;
  - a working `BroadcastChannel` probe path that does not receive a live-owner response before the probe window closes.
- `confirmed foreign owner` is reached when either:
  - a fresh owner marker shows a different tab-session identity for the same lock fingerprint; or
  - a live owner answers the probe through `BroadcastChannel`.
- A probe timeout is still `uncertain` unless the fresh same-tab marker and reload-only signal above already establish a same-context reload while the `BroadcastChannel` path stays available and silent.
- Missing markers, stale markers, local-storage coordination failures, `BroadcastChannel` unavailability, and all other inconclusive probe outcomes are treated as `uncertain`, not as proof of ownership.
- In `confirmed foreign owner` and `uncertain`, the client clears the copied token locally and asks the server for normal lock status without the token.
- Ordinary browsers with working local-storage and `BroadcastChannel` coordination keep the seamless same-tab refresh path.
- Degraded browsers fail closed: the page may stay read-only until normal expiry or a fresh acquisition path, rather than risking two tabs reusing the same token.

### Heartbeat and Autosave

- Default heartbeat interval: `30000` ms
- Default stale threshold: `180000` ms
- Heartbeat starts only after acquisition succeeds.
- Autosave re-validates the exact held lock before draft persistence.
- Heartbeat and autosave both require the exact page, user, and verifier digest match.
- A missing, replaced, released, or wrong token yields lock loss instead of mutating canonical draft content.
- Current workspace edit capability is re-evaluated on status, heartbeat, and save:
  - acquisition still requires `Editor` or `Workspace Admin`;
  - status does not return `held` after edit capability is removed;
  - heartbeat returns the existing forbidden/access-loss contract and does not refresh `last_seen_on` after capability loss;
  - autosave remains forbidden and does not mutate canonical draft content after capability loss;
  - exact-token release remains allowed after capability loss so the client can relinquish the held row cleanly.
- The client treats a forbidden heartbeat on a held session as access loss, transitions the editor to read-only, and stops heartbeat renewal.
- Revision conflict handling still runs after lock validation and remains unchanged.

### Release and Route Ordering

- Same-SPA destructive transitions continue to use the existing flush/leave guard first.
- After a successful flush or explicit discard, the app releases the exact held lock before committing the transition.
- Failed saves do not release the lock if the user stays on the page.
- Hard refresh does not intentionally release the lock.

### Lock Loss

- The next heartbeat or autosave transitions the editor to a lock-lost state if ownership no longer matches.
- Lock loss makes the editor read-only, stops heartbeat scheduling, and stops new autosave attempts.
- Local unsaved content remains visible in-memory and copyable.
- The existing unsaved-navigation guard still applies while local dirty content remains.

### First Paste After Acquisition

- The first paste into an unlocked page is stored as pending paste intent instead of being reduced to `text/plain` immediately.
- Pending paste intent preserves both sanitized HTML and plain-text representations when the clipboard provides them.
- After acquisition succeeds, the client replays the pending paste through the existing TipTap paste contract, including the existing HTML and text sanitizers.
- Unsafe tags, inline event handlers, unsafe link targets, and unsupported embedded markup are still stripped by the shared paste sanitization path.
- If acquisition fails or the page remains locked, the pending paste is discarded and canonical content is unchanged.

## Scheduled Cleanup

- Scheduled script: `docsera-page-edit-lock-cleanup`
- Cadence: approximately once per minute
- Stale threshold: approximately three minutes of no heartbeat or autosave refresh
- Cleanup uses server time only.
- Cleanup first finds stale candidates and then re-checks `last_seen_on < cutoff` on the exact row before delete.
- That second predicate reduces the race window if a row changes between the first scan and the delete query.
- It is not an atomic conditional delete or compare-and-swap primitive.
- Crossing the stale threshold means the old holder may lose the lease and cannot rely on status, heartbeat, autosave, or release to revive it.

## Client UI States

- `idle`: editable user in Edit mode has not yet claimed the page
- `acquiring`: first body interaction is waiting on the acquisition route
- `held`: editing is enabled and heartbeat is active
- `locked`: another session won; the editor stays read-only and shows holder messaging
- `lost`: the held lock disappeared or no longer matched; local unsaved text remains visible
- `failed`: route-level acquisition or status failure; the body remains read-only and retryable

The lock UX is compact and in-context. It does not remount the editor, reload the SPA shell, introduce a persistent unlocked-state card, or introduce header flicker.

## Header Layout

- The Live/Edit toggle remains in one fixed header position in both modes.
- The header always reserves the save-status slot immediately to the left of the toggle.
- Edit mode can show `Saved`, `Saving…`, `Unsaved`, or `Changes not saved`.
- Live mode keeps that slot visually empty rather than collapsing it, so the toggle and the remaining right-side controls stay stationary.

## Permission and Security Boundaries

- Only users who already have page editing capability attempt acquisition.
- Viewer-mode users and non-edit-capable users never request a lock.
- All page and workspace resolution stays inside the scoped application.
- Release verifies the exact lock row sys_id, page key, holder user, and verifier digest so an old token cannot delete a replacement lock.

## Regression Coverage

Local regression coverage added or updated for the guard:

- `src/server/page-locks/pageEditLockService.test.ts`
  - cold acquisition
  - same-token resume
  - forbidden status after capability loss
  - forbidden heartbeat without `last_seen_on` renewal after capability loss
  - exact-token release after capability loss
  - loser response after contention
  - same-user different-session lock loss
  - old release request vs replacement lock
- `src/fluent/tables/docsera-page-edit-lock-schema.test.ts`
  - unique `page_key` index contract
  - `verifier_digest` and `last_seen_on` metadata contract
- `src/client/platform/servicenow/client.test.ts`
  - acquire/status/heartbeat normalization
  - stale status resume normalization
  - `lock_lost` autosave mapping
- `src/client/editor/PageEditorHostRuntime.locking.test.tsx`
  - read-only pre-acquisition state
  - direct page-body acquisition without an unlocked-state card
  - confirmed same-tab reload resume across acquire, unmount, and remount
  - fail-closed timeout when only a fresh same-tab marker is present
  - fail-closed fresh foreign-marker path
  - fail-closed copied-token behavior when `BroadcastChannel` is unavailable
  - fail-closed copied-token behavior when owner-marker storage is unavailable
  - copied-storage same-user second-page contention behavior
  - first formatted HTML paste after acquisition
  - first plain-text paste after acquisition
  - first-paste sanitization and no-mutation denial behavior
  - single replay of the first pending paste
  - access-loss read-only transition after forbidden heartbeat
  - lock-lost transition after save rejection
- `src/client/editor/PageEditorHostRuntime.core.test.tsx`
  - autosave, retry, conflict, save suppression, and editor-state regression coverage retained after the runtime-suite split
- `src/client/editor/PageEditorHostRuntime.commands.test.tsx`
  - slash-command, link-surface, and editor-command regression coverage retained after the runtime-suite split
- `src/client/editor/PageEditorHostRuntime.testUtils.tsx`
  - shared runtime harness cleanup for roots, TipTap editors, broadcast channels, timers, probes, storage, and `window.name`
- `src/client/features/workspaces/DocseraHeader.test.tsx`
  - fixed status-slot structure in Live and Edit modes

## PDI Verification

Instance-facing verification script:

- `node ./scripts/verify-page-edit-lock-guard.mjs`

Earlier browser-host evidence on `2026-07-13` predates the timeout correction and should be treated only as pre-correction product-shape confirmation.

Corrected-build validation ran on `2026-07-14` after the final `npm run install:sdk` for this fix and before the final commit was created:

- `node ./scripts/verify-page-edit-lock-guard.mjs --contention-rounds 20`
- Outcome: `Result: pass`
- Evidence captured by the corrected-build script run:
  - 20 contention rounds with exactly one durable winner row each round
  - loser responses returned `page_locked` with same-user different-session holder context
  - correct-token heartbeat and autosave succeeded
  - wrong-token heartbeat and autosave returned `edit_lock_lost`
  - old release requests did not delete replacement locks
  - status, heartbeat, and autosave did not revive an already expired token
  - expired-session saves did not mutate canonical draft content
  - stale cleanup removed an abandoned lock
  - cleanup did not remove a lock renewed before the stale threshold

Corrected-build browser verification on `2026-07-14` used the deployed Direct UI Page host with authenticated Playwright session state against the same instance and reset the disposable smoke fixture before and after the check:

- Edit mode opened with no unlocked-state `Ready to edit` card or persistent lock messaging.
- Initial edit-mode load issued a status probe but did not eagerly acquire the lock.
- First page-body interaction acquired the lock and enabled the editor surface.
- The first formatted paste after acquisition preserved supported heading, bold, and link formatting.
- Same-tab hard refresh resumed the held edit session without requiring a second acquisition click.
- A real second browser page seeded with copied `sessionStorage` token data and copied `window.name` still stayed locked out with same-user different-session messaging.
- Live/Edit header measurements stayed stable across mode switch: the toggle left edge remained `1011px` and the adjacent theme control remained `1144px` in both modes while Live mode left the status slot visually empty.
- The browser check finished with no page errors or browser console errors.

The first live run exposed one metadata defect in the scheduled cleanup trigger: the periodic schedule had been declared with a plain object instead of `Duration({ minutes: 1 })`, which serialized into an invalid far-future trigger. The production metadata now uses the SDK duration contract, and the rerun above passed.

The script is intended to verify:

- route metadata is installed
- temporary verification workspace and page creation
- at least 20 acquisition contention rounds with exactly one durable winner
- loser responses with current-holder information
- correct-token and wrong-token behavior for heartbeat, save, and release
- old release requests do not delete replacement locks
- scheduled stale-lock cleanup removes abandoned locks
- scheduled cleanup does not remove a lock renewed near the boundary
- expired tokens cannot be revived through status, heartbeat, or autosave

Manual two-user UI checklist:

1. Open the same page in Edit mode in two separate browser contexts.
2. Confirm there is no unlocked-state `Ready to edit` card or similar lock instruction.
3. In context A, click directly into the page body and confirm editing enables without a reload or second click.
4. Refresh context A while it still owns the lock and confirm the same tab resumes editing without a second lock row.
5. Open or duplicate context B from the same account and confirm it stays read-only with same-user-different-session messaging.
6. Leave the page normally from context A and confirm context B can retry and win only after the guarded save/discard ordering completes.
7. Acquire the lock in context A, abandon the tab without leaving, wait for stale expiry plus cleanup cadence, and confirm context B can retry and win.
8. Force lock loss, confirm the editor becomes read-only, unsaved text remains visible, and a subsequent save attempt is rejected without mutating stored draft content.
9. Confirm the Live/Edit toggle and adjacent right-side header controls do not shift horizontally between modes.

## Retained Artifacts and Limitations

- The earlier serialization-spike proof table, proof REST route, retained rows, and related inert artifacts remain intentionally untouched.
- No manual cleanup of those prior spike artifacts is required for this task.
- Exact browser duplicate-tab cloning remains browser-specific; the corrected-build browser check used a real second page with copied `sessionStorage` token data and copied `window.name` to exercise the duplicated-metadata path without relying on browser-specific duplicate-tab UI automation.
- Degraded-browser copied-token handling is intentionally conservative: the absence of reliable tab coordination can leave the page read-only until expiry or reacquisition instead of automatically resuming a copied token.
- Retained prior PDI proof artifacts remain inert and untouched.
- The disposable smoke workspaces used for corrected-build browser verification were reset before and after the check, so no manual PDI cleanup is required for that validation path.
