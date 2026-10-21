# E3-T8 Workspace Edit Lease

## Runtime contract

- `x_82900_docsera_workspace_edit_lease` is the sole durable workspace authoring authority. Its unique workspace key permits one holder and its digest stores no plaintext lease token.
- Scoped runtime routes acquire, resume, renew, release, and status the lease. Successful held results now always include the authoritative active E3-T7 generation pair: `changeSetId`, `changeSetRevision`, and optional `workspaceStateRevision`.
- Client transport acceptance is action-specific: `acquire`, `resume`, `renew`, `status`, and `release` only accept the success states allowed by their declared contracts, and malformed 200-state combinations fail terminally without surfacing lease credentials.
- Page create, save, publish, settings, and delete routes renew/verify the workspace lease before mutating records. No active runtime mutation accepts a page-lock token as authority.
- A missing, expired, replaced, unauthorized, inactive, or selector-invalid lease blocks mutations. Expired-row replacement now uses an exact stale-row delete plus unique-key insert instead of an in-place read-then-update takeover.

## Client lifecycle

- Entering Edit acquires or resumes a session-scoped lease. Heartbeats renew it while the workspace is active.
- Deliberate SPA transitions release and clear the bound lease with a keepalive-capable request. This includes leaving Edit for Live, changing workspaces, returning to My Workspaces, losing authoring permission, and authoritative lease-loss or replacement responses.
- Document teardown does not release the server lease or clear the session-stored lease token. The old runtime detaches its same-origin responder and drops in-memory authority only, so a same-tab hard refresh can preserve the tab-session identity, read the stored token, complete the silent duplicate-runtime probe, and resume the exact server lease.
- Unexpected tab close relies on normal lease expiry instead of unload-time release. This leaves a closed-tab lease until expiry, but avoids breaking reliable same-tab refresh recovery.
- Resume is eligible only when a stored non-empty tab-session identity exactly equals the current tab-session identity and a same-origin `BroadcastChannel` probe finds no active responder. Missing/mismatched metadata, unavailable/throwing channels, and malformed or failed probe messages fail closed: the credential is cleared and Edit performs a normal acquisition without it.
- A held runtime retains a persistent same-origin responder for its workspace/tab identity. It answers another runtime's matching probe, so a duplicated tab clears its copied credential and contends normally instead of sharing the lease. The responder closes on deliberate release boundaries, authoritative loss, and document teardown; after a successful same-tab resume, the replacement runtime becomes the only responder. Probe messages are bound to workspace, runtime, and probe IDs so stale/canceled acquisition traffic is ignored.
- Late acquire/resume/renew responses cannot clear or replace newer local authority. Only the exact current binding may clear the stored credential and responder. An obsolete held acquire/resume result may release its own server token only when that token differs from the current same-workspace session-stored credential; an obsolete resume that returns the same token preserved for the replacement same-tab runtime is ignored without release so the replacement responder, heartbeat, and mutation authority remain valid.
- Terminal acquisition failures remain/return Live. Genuine `locked` and `lost` results may use only safe server holder data: the full display name or same-account-in-another-tab flag. Permission failures preserve the safe server permission message. Transient failures use the safe availability message, `Workspace editing is temporarily unavailable. Please try again.` `workspace_foundation_invalid` and any other unknown structured 409 remain terminal failures, not invented contention. The existing access-loss surface does not invent a holder or claim another user is editing for non-contention failures; no login, email, profile data, or links are exposed.

## Active client authority

- The workspace edit lease is the sole active client authoring-session authority. The App-owned workspace lifecycle supplies the authoring boundary before the editor mounts.
- Active editor page-lock status, acquisition, heartbeat, credential persistence, and release behavior has been removed. Retained page-lock server routes, services, metadata, and their direct legacy tests have no production-client dependency and are deferred for retirement.
- This correction line now includes E3-T7 generation-pair transport, scoped status routing, and server-side expired-row concurrency proof. Pending change-entry mutations, Publish/Discard workflow, and legacy page-lock retirement remain deferred.

## Pass 1 correction evidence

- Active runtime mutation contracts use the workspace slug/sys_id plus `workspaceLeaseToken`; active client, publish, delete, body-save, settings, and creation fixtures no longer treat page `lockToken` as mutation authority.
- Route regressions verify the lease boundary runs before publish/delete persistence and prevents the underlying service call when the lease is lost. The client maps workspace lease loss to the existing recoverable access-loss result.
- Focused Pass 1 validation passed: 5 files, 70 tests. The full managed Vitest run passed 49 files and 533 tests; its sole remaining suite failure is the pre-existing, byte-identical `scripts/validation-process.test.mjs` parser syntax error.
- Retained page-lock routes, services, metadata, and direct legacy tests remain isolated for deferred retirement. Silent expiry recovery, E3-T7 generation-pair responses, and expired-row concurrency are not complete.

## Pass 2 correction evidence

- Focused Pass 2 validation passed: `workspaceLeaseCoordination.test.ts` (1 file, 5 tests) and `App.test.tsx` (1 file, 29 tests), for 2 files and 34 tests total.
- The retained Pass 1 focused suite passed: 5 files, 56 tests.
- The final managed Vitest rerun passed 50 files and 543 tests. Its only non-test suite failure remains the pre-existing, byte-identical `scripts/validation-process.test.mjs` parser syntax error; the managed run completed with zero test failures.
- The deterministic fake `BroadcastChannel` covers same-tab timeout resume, mismatched/missing identity rejection, active-holder duplicate response, responder cleanup, and channel/probe fail-closed behavior. App coverage verifies genuine contention notices, permission and availability failures, no-editor fallback to Live, and canonical return to Live.

## Validation boundary

- The pure lease-service tests cover single-holder contention, authorization, expiry takeover, stale-holder mutation rejection, release, and invalid active-generation selectors.
- PDI verification must use the existing `ServiceNow` / `now-sdk` keyring record and `docsera-pdi` alias. Verification scripts must not print credential material and must clean up only their own explicit temporary records.

## Pass 4 server and PDI closeout

- Lease acquisition now resolves the authoritative workspace server-side, loads the active E3-T7 pending change-set selector from `x_82900_docsera_workspace.pending_change_set`, verifies that the selected change-set row exists on the same workspace, requires `lifecycle_state = active`, and returns the exact `changeSetId` plus `changeSetRevision`. `workspaceStateRevision` is carried only as selector/projection metadata and is not treated as mutation authority.
- `acquire`, `resume`, and `status` never return `held` without that exact same-workspace active generation pair. Missing selectors, wrong-workspace selectors, inactive selectors, and other invalid foundation states fail closed as `workspace_foundation_invalid` / `workspace_lease_invalid` and do not leave usable authoring authority behind.
- Held payloads now fail closed on the client transport. `acquire`, `resume`, `renew`, and `status` accept `held` only when the payload includes a non-empty `changeSetId`, safe non-negative integer revisions, positive heartbeat/stale durations, and a plaintext lease token only where allowed. Malformed held payloads become terminal failures and never create an active binding, persisted credential, holder notice, or editor mount.
- `release` is stricter than the other transport actions: a `200` payload whose state is still `held` is treated as a terminal failure instead of being normalized as a renewal or persisted as a binding. Valid `released` responses remain successful, and tokenless `status` held responses remain valid.
- Expired takeover no longer performs `query/get -> compare -> deleteRecord()` as the correctness boundary. The service now:
  1. loads the current row,
  2. proves expiry from server time,
  3. issues a scoped `GlideRecord.deleteMultiple()` against the exact stale predicate set for that observed row: `sys_id + workspace_key + last_seen_on + last_seen_on < contender_now`,
  4. inserts a replacement row under the existing unique `workspace_key` invariant.
  ServiceNow documents scoped `deleteMultiple()` as deleting all records that satisfy the query. In this path, that means the observed stale coordinates must still satisfy the delete predicate at the delete operation itself; a renewal that changes `last_seen_on` before the delete boundary therefore leaves no matching stale row to remove.
- Scheduled cleanup uses the same predicate-driven `deleteMultiple()` rule and remains advisory only. Cleanup scans stale candidates, but each candidate is removed only through the same exact stale predicate boundary. Every active lease operation still performs its own expiry decision from server time, so cleanup is never required for acquire, takeover, renew, release, status, or mutation correctness.
- The scoped runtime now installs all five workspace lease routes:
  - `POST /workspaces/edit-lease/acquire`
  - `POST /workspaces/edit-lease/resume`
  - `POST /workspaces/edit-lease/renew`
  - `POST /workspaces/edit-lease/status`
  - `POST /workspaces/edit-lease/release`
- `status` keeps the existing owner contract shape but does not expose the plaintext lease token. Only `acquire`, `resume`, and `renew` return the owner token. Contention still exposes only the accepted safe holder display name and the same-account/different-session indicator.
- The workflow foundation tables remain package-private and direct generic Table API access remains blocked. In the current PDI proof, denied row access surfaced as `404` on direct GET/PATCH/DELETE to package-private rows and `403` on direct create attempts, which still proves generic CRUD denial at the platform boundary.

## Pass 4 PDI evidence

- On Friday, July 17, 2026, `npm --prefix app/docsera-ui run build` passed. The build still emitted the unchanged non-fatal `lucide-react` sourcemap and `"use client"` bundling warnings.
- On Friday, July 17, 2026, `npm --prefix app/docsera-ui run validate` completed the managed Vitest stage with 54 passed test files and 619 passed tests. Its only remaining suite failure was the unchanged parser-baseline syntax error in `scripts/validation-process.test.mjs`; no test case failed and managed cleanup left 0 lingering processes.
- On Friday, July 17, 2026, `npm --prefix app/docsera-ui run install:sdk` passed and installed the current runtime to `docsera-pdi`. The rollback context created by that final install was `86802207c3c24b90c569bf0d05013160`.
- The repo verifier `node app/docsera-ui/scripts/verify-workspace-edit-lease.mjs` passed on Friday, July 17, 2026 against `docsera-pdi`. It created one owned workspace, seeded one owned foundation through an admin-only background-script path, created one owned page, created one editor user and one viewer-only user, and then cleaned that owned verification data unless `--keep-data` was used deliberately for browser follow-up.
- That verifier proved:
  - one-winner fresh acquisition contention;
  - one-winner expired takeover contention;
  - stale prior holder renew/release rejection after replacement;
  - predicate-delete safety when a contender holds stale row coordinates but the row is refreshed before the delete boundary;
  - cleanup independence and cleanup-versus-renew safety under the same `deleteMultiple()` predicate rule;
  - held acquire/resume/status generation-pair returns;
  - client fail-closed handling for foundation-invalid and malformed-held transport responses through focused regression coverage;
  - invalid-selector failure and selector-repair recovery;
  - same-numeric-revision, different-generation identity handling;
  - representative save/settings/create/delete/publish mutation-gate enforcement;
  - absence of active page-lock authority for mutations;
  - package-private metadata plus direct Table API denial for workspace lease and change-set rows.
- Verifier and browser-smoke output is now routed through one recursive redaction boundary. Generated disposable passwords are created locally in Node, passed only into the owned user-creation background script, never returned through `DOCSERA_RESULT`, and never printed. Lease tokens, page-lock tokens, login/session tokens, cookies, and keyring fields are redacted from structured details before console output or thrown errors.
- The browser smoke `node app/docsera-ui/scripts/workspace-edit-lease-browser-smoke.mjs --workspace-slug <slug> --page-slug <slug>` passed on Friday, July 17, 2026 against an owned disposable verification workspace. It confirmed:
  - same-tab refresh resumed the current edit session;
  - a duplicated tab with copied `window.name` and copied `sessionStorage` still hit `POST /workspaces/edit-lease/acquire` with a `409` same-account/different-session contention result;
  - leaving Edit and returning allowed reacquisition rather than silently retaining stale client binding.
- Verification output safety now redacts non-JSON strings before truncation so lease tokens, passwords, cookies, session/login/user tokens, page-lock tokens, authorization values, keyring values, and secret-labeled values cannot leak through terminal error text or printed detail fallbacks.

## Pass 3 client recovery

- A scheduled, visible, or online renewal now distinguishes uncertainty from confirmed loss. A transient renewal keeps the bound credential and editor available as `uncertain`; an explicit lost lease clears the responder/binding and becomes `recovery_required` without inventing a holder notice or immediately unmounting authoring UI. Forbidden renewal still disables authoring with the safe permission message.
- `WorkspaceLeaseRecoveryCoordinator` provides the shared mutation boundary. The App checks the current Edit workspace/binding generation, renews an uncertain credential or acquires after confirmed loss, shares one recovery promise, and only supplies a token after `held`. The body path retries only one server `lock_lost` race after recovery; conflicts and validation failures do not retry.
- Body, Page Settings, delete, and inline creation invoke the gate before persistence. Failed recovery preserves body/editor state and settings or create input; contention and forbidden recovery switch safely to Live while transient recovery remains retryable in Edit. No blocked operation is replayed automatically after Live fallback.
- Late heartbeat and recovery results are discarded when their binding or operation generation no longer matches. The pass does not add E3-T7 generation-pair server integration, expired-row replacement concurrency, Fluent route repair, or PDI proof; those remain Pass 4.

## Pass 3B recovery and mutation boundary

- Lease-race mutation failures (`workspace_lease_lost` and `workspace_locked`) invalidate the rejected local binding before recovery: the tab responder is stopped, the stored credential is cleared, the lease enters `recovery_required`, and the lease operation generation advances. Recovery therefore performs a fresh acquisition and the only retry uses the newly issued token.
- Mutation-time transient recovery no longer reuses the terminal `blocked` state. The App now records an authoring-capable `transient_failure` lease state with a safe retryable message, so the URL remains in Edit, `activeWorkspaceMode` remains `edit`, Edit pages stay loaded, the editor remains mounted, `editAccessLost` stays false, and no holder notice is shown. A later authoring action may attempt recovery again, but no persistence occurs until a lease is held again.
- `WorkspaceLeaseRecoveryCoordinator.runMutation()` now captures the initial scope, invalidates the rejected binding, captures the exact replacement scope immediately after invalidation, proves that replacement scope differs from the original scope, and retries only while the current scope still exactly equals that captured replacement scope. The scope continues to include route mode, requested workspace mode, workspace slug, workspace sys_id, and lease operation generation. A later scope change returns a stale/transient result and never spends the recovered token.
- Body save/flush, Page Settings save, inline page creation, and page deletion use the common boundary: one first mutation, at most one recovery, and one retry. Structured client failure codes distinguish lease loss from ordinary errors; revision conflicts and non-lease failures are not retried. Mutation operation and route-transition identities suppress late settings/create/delete results; editor-session identity already suppresses late body-save projection updates.
- Focused Pass 3B validation on Friday, July 17, 2026 passed 3 files and 58 tests:
  - `src/client/app/workspaceLeaseRecovery.test.ts` with 8 tests for original-token use, rejected-token invalidation scope change, exact replacement-scope equality, stale replacement suppression, one-retry limit, and non-recovery ordinary conflicts.
  - `src/client/app/App.test.tsx` with 32 tests including transient Page Settings, create, and delete recovery retention plus later retry and existing routing/holder regressions.
  - `src/client/app/App.editorHostBoundary.test.tsx` with 18 tests including transient body-save retention, later retry, contention/forbidden Live fallback, and existing editor-session stale-operation coverage.
- Final managed validation on Friday, July 17, 2026:
  - `npm --prefix app/docsera-ui run build` passed.
  - `npm --prefix app/docsera-ui test` completed the managed run with 51 passed test files and 558 passed tests, zero test failures, and managed-process cleanup reporting 0 lingering processes.
  - The only remaining suite failure is the unchanged branch-baseline parser error in `scripts/validation-process.test.mjs`; this pass does not modify that file or claim to fix it.

`publishPage` remains only in the ServiceNow client transport and its client-contract tests. A source inspection finds no App callback, editor prop, or active UI control that invokes it, so no active legacy publish mutation path exists to wrap in this pass.

## Pass 3C same-session local authoring recovery

- The App now owns an in-memory `AuthoringRecoveryStore` that is scoped to the current SPA session only. It stores one body snapshot per workspace/page identity, one Page Settings snapshot per workspace/page identity, and one inline-create snapshot per workspace identity. Hard refresh, cross-tab restoration, `localStorage`, `sessionStorage`, server persistence, and `BroadcastChannel` replay are intentionally unsupported.
- Snapshot identity is strict. Body and Page Settings snapshots key on workspace sys_id, workspace slug, and page sys_id. Inline-create snapshots key on workspace sys_id and workspace slug. A newer snapshot for the same identity replaces the older snapshot, but another workspace or page cannot read or clear it.
- Every snapshot records a monotonic `captureGeneration`. Body snapshots also retain the blocked editor-session generation, the exact canonical envelope submitted to the save path, and the expected draft revision. Page Settings snapshots retain the unsaved title, slug, saved-title snapshot, saved-slug snapshot, active field, and validation errors. Inline-create snapshots retain the unsaved title, intended parent page sys_id, and focus token.
- Forced Live fallback is now reason-aware before the blocked authoring surface is torn down. Contention captures the active body save, Page Settings form, or inline-create input before the App invalidates the authoring session, clears edit-local state, switches to Live, unmounts the editor, or loads the published projection. Structured permission loss never captures new recovery. Instead it clears current-workspace recovery before teardown. Transient recovery that remains in Edit, successful saves, validation failures, revision conflicts, capacity failures, and ordinary non-lease failures do not create fallback snapshots. The forced-Live boundary does not trigger another dirty-editor flush.
- The centralized forced-Live path is still App-owned, but recovery behavior now depends on the structured reason. `contention` preserves same-SPA recoverable surfaces in one pass before cleanup. `forbidden` clears all body, Page Settings, and inline-create snapshots for the exact current workspace identity, clears matching restored-capture bookkeeping, and removes only recovery notices scoped to that workspace before authoring teardown. One fallback therefore preserves contention recovery across surfaces without allowing permission-loss restoration.
- The editor host now exposes a read-only recovery snapshot getter instead of relying on save-time capture only. The App can read the current canonical envelope, current saved draft revision baseline, page sys_id, editor session key, and dirty state without triggering autosave, another flush, or any persistence side effect. Body capture still happens only when that getter reports a dirty editor state.
- Body restoration occurs only after the user deliberately re-enters Edit, the workspace lease is reacquired, the Edit projection loads, and the current page identity matches the snapshot. When the current draft revision still equals the snapshot baseline revision, the editor starts from the recovered local envelope while retaining the freshly loaded server envelope as the saved baseline. The host/runtime therefore distinguishes the displayed initial envelope from the saved baseline envelope, starts dirty/unsaved, preserves the server revision, shows `Your unsaved changes were restored. Review them before saving.`, and does not autosave.
- Body revision mismatches are cleared rather than retained. If the current server draft revision differs from the snapshot baseline, the App loads the current server draft normally, clears that exact body snapshot plus matching restored-body bookkeeping, does not overwrite or autosave the server draft, and shows `Your earlier unsaved changes could not be restored because the shared draft changed.` No merge UI, comparison UI, download flow, or recovery center is added.
- Page Settings restoration occurs only after the same workspace/page re-enters Edit successfully and the current server title and slug still match the snapshot baselines. When both baselines still match, the App reloads the page normally, reopens Page Settings, restores title and slug as unsaved local values, preserves their relation to the original title/slug snapshots, restores the active field when safe, reapplies current validation, and shows a compact restored-input notice. When either baseline changed, the App clears that exact Page Settings snapshot plus matching restored-bookkeeping, does not reopen the panel, and shows a compact shared-settings-changed notice. It never saves automatically, and another page or replacement record cannot consume the snapshot. If the page is no longer available, the App does not reopen the panel and instead shows a compact missing-page notice.
- Inline page creation restoration occurs only after the same workspace re-enters Edit successfully. The App restores the unsaved title without calling `createPage`, restores the original parent when that parent still exists, and otherwise falls back to a safe root-level create row while preserving the title and showing `The original parent is no longer available. Review the restored title before creating the page.` The snapshot never restores into another workspace.
- Clearing is exact-generation only. Body snapshots clear only after the exact restored document later saves successfully, after the user explicitly chooses the existing dirty-transition discard action for that restored body, or after authoritative Edit-page data proves the referenced page unavailable. A stale discard target cannot clear a newer replacement snapshot because the App records workspace/page identity plus the exact capture generation on the guarded transition and only clears that exact generation. Page Settings snapshots clear only after successful settings save, explicit cancel/discard, or the referenced page is proven unavailable. Inline-create snapshots clear only after successful page creation, explicit cancel, or the workspace is proven unavailable. Entering Live, failed Edit reacquisition, viewing another page, transient recovery failures, late responses, or unrelated successful mutations do not clear snapshots.
- Missing-page cleanup now uses authoritative Edit data only. Live projection absence does not clear body recovery. When the Edit page list proves a page unavailable, the App clears the exact body snapshot, clears matching restored-body bookkeeping, removes any body-recovery notice tied to that page, and bumps recovery state once after cleanup. Successful subtree deletion also clears body and Page Settings snapshots for every deleted page in that workspace without replaying delete intent.
- Stale-result suppression now combines existing session/mutation identities with recovery generations. A late pre-fallback body response cannot clear a newer body snapshot, an older capture cannot overwrite or clear a newer one, page A cannot initialize page B, workspace A cannot initialize workspace B, a successful later save clears only the exact restored snapshot, and late settings/create completions cannot clear newer captured recovery state.
- Delete and publish intent are still intentionally excluded. Forced Live fallback does not reopen delete confirmations, replay deletes, replay publish intent, or otherwise restore destructive intent.

## Pass 3C final closeout: unified permission-loss fallback

- All active permission-loss paths that must tear down authoring still route through one App-owned forced-Live operation. The current workspace, route mode, lease operation generation, optional binding identity, and optional editor-session identity must still match before the fallback proceeds. Late results from an obsolete binding, obsolete editor session, or other workspace therefore cannot capture, clear, or route the current session.
- The forced-Live operation is ordered by reason. `contention` confirms the active session, captures current recoverable surfaces, then clears invalid lease authority, sets the accepted holder notice, marks authoring unavailable, and routes to Live. `forbidden` confirms the active session, skips capture, clears only current-workspace recovery plus matching restored refs/notices, clears invalid lease authority, sets the safe permission notice, marks authoring unavailable, and routes to Live.
- Mutation-time lease recovery contention and forbidden outcomes still preserve the existing replacement-scope checks, one-retry semantics, safe holder or permission messaging, and transient Edit retention. Those outcomes no longer use per-mutation capture callbacks. When the accepted behavior requires Live fallback, the mutation path delegates to the centralized forced-Live operation so contention captures exactly once and structured permission loss discards current-workspace recovery instead of preserving it.
- Scheduled heartbeat, visibility, and online renewal now distinguish explicit permission loss from transient uncertainty. Structured forbidden renewal against a still-current active Edit session does not create recovery, clears current-workspace recovery, stops lease authority, clears the stored credential, sets the safe permission notice, marks edit access lost, and routes explicitly to Live. It does not trigger a dirty-editor flush, does not report the document as saved, and does not replay a mutation. Transient renewal remains `uncertain`, and an ordinary explicit lease loss may still remain `recovery_required` in Edit as accepted earlier.
- Initial and deliberate blocked-state re-entry acquisition still create no new recovery snapshot because no active authoring session exists yet. When those exact-workspace acquisition attempts return structured `forbidden`, they now clear any older body, Page Settings, and inline-create recovery for that workspace identity, clear matching restored refs/notices, clear the stored credential, preserve the safe permission notice, and remain/return Live without loading the Edit projection.
- Direct structured mutation permission loss now uses the same centralized fallback where the active contracts support it. Structured `forbidden` body-save, Page Settings, inline-create, and delete results all route through the same discard path. Validation, conflict, capacity, and other ordinary persistence failures do not infer permission loss and do not trigger forced-Live recovery capture or clearing.
- Delete intent remains excluded. A direct forbidden delete result clears current-workspace recovery if present, but it never restores the delete confirmation or replays destructive intent later.
- Successful workspace loads now treat viewer-only capability loss as authoritative for that exact workspace identity. When a prior authoring workspace reloads successfully with no authoring capability, the App clears only that workspace's body, Page Settings, and inline-create recovery plus matching restored refs/notices. Transient or failed workspace loads do not clear recovery, and loading another workspace as viewer-only does not affect the original workspace's snapshots.
- The exact clearing contract is now consistent: structured permission loss and later viewer-only capability loss both clear only the current workspace's recoverable body, Page Settings, and inline-create state. Neither path clears another workspace's recovery snapshots.
- Stale-result suppression now covers acquisition, scheduled renewal, and direct structured mutation permission loss. A late initial or re-entry acquisition forbidden from an obsolete workspace route or obsolete lease-operation generation cannot clear newer workspace state. A late heartbeat forbidden from an obsolete binding cannot affect a newer workspace session. A late direct forbidden result from an obsolete editor session or newer route cannot capture or clear newer input. Existing live refs and generation identities remain authoritative for these checks.

## Pass 3C validation evidence

- Focused validation on Friday, July 17, 2026 passed these managed runs:
  - `src/client/app/authoringRecovery.test.ts`: 1 file, 9 tests.
  - `src/client/app/workspaceLeaseRecovery.test.ts`: 1 file, 8 tests.
  - `src/client/app/App.editorHostBoundary.test.tsx`: 1 file, 35 tests covering scheduled-renewal forbidden discard, forbidden re-entry body cleanup, preserved contention restoration on repeated blocked re-entry, stale heartbeat suppression, and existing editor-session boundary regressions.
  - `src/client/app/App.test.tsx`: 1 file, 45 tests covering centralized forced-Live routing for direct structured forbidden settings/create/delete results, forbidden re-entry cleanup for Page Settings and inline create, stale acquisition suppression across workspace changes, same-workspace viewer-only recovery clearing, cross-workspace viewer-only isolation, and existing holder/transient routing behavior.
- `npm --prefix app/docsera-ui run build` passed on Friday, July 17, 2026. The build still prints the existing non-fatal `lucide-react` sourcemap and `"use client"` bundle warnings after successful completion.
- The focused managed runs above passed 4 files and 97 tests total.
- `npm --prefix app/docsera-ui test` completed the managed run with 52 passed test files and 597 passed tests. The only remaining failure is the unchanged parser-baseline syntax error in `scripts/validation-process.test.mjs`; no test case failed. Managed-process cleanup reported 0 lingering processes.
- The only remaining suite failure is the unchanged branch-baseline parser error in `scripts/validation-process.test.mjs`; this pass does not modify that file or claim to fix it.

## Remaining limits

- Hard-refresh restoration is unsupported.
- Cross-tab restoration is unsupported.
- No automatic merge, comparison UI, or recovery center exists.
- Delete and publish intent are not restored.
- E3-T9 change-entry mutations, pending-changes APIs, Publish/Discard workflow, and the Changes-panel UI remain out of scope.
- Legacy page-lock server routes, metadata, cleanup, and direct tests remain present for deferred retirement, but no active client lifecycle or mutation authority depends on them.

### Ending an observed session

A same-account lock may include the observed lease record ID. The end-previous-session operation checks the authenticated user's current workspace Edit entitlement, reloads the lease, verifies its record ID and holder, and passes the server-loaded digest to the existing exact-release adapter. A missing or changed record is recoverable and does not authorize releasing its replacement. The client then uses ordinary acquisition and binding; the old token no longer validates. The existing adapter's read and delete are not represented as an atomic transaction.


### Same-account recovery presentation

A same-account lease conflict exposes recovery even when no page is selected. An unsuccessful release remains visible on the requested Edit route until the user retries Edit (a fresh ordinary acquisition) or returns to Live; page-route canonicalization waits during this recovery.


Cross-account locked responses carry the holder user sys_id from the server lease record for the recovery card. The client links a named holder to the core user record only when the ID is a valid ServiceNow sys_id; otherwise it shows plain text. Same-account conflicts retain the observed lease ID for takeover and do not expose a profile link.
