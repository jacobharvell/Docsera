# Implementation Notes - E3-T9 Generation Pair Mutation Guard

## Scope

This note records the completed repo-side E3-T9 mutation-conversion slice implemented on Saturday, July 18, 2026.

It supersedes the earlier guard-only note. The current implementation now covers:

- lease-bound mutation entry for body save, Page Settings save, create, and delete;
- a persisted, generation-scoped mutation claim row with single-owner execution, bounded recovery, and finalized replay;
- persisted change-set revision advancement with authoritative next-pair transport on successful mutations;
- stale-generation failure responses that return the current active pair for client refresh without blind replay;
- snapshot-relative sparse draft overlay persistence on page records for body and Page Settings mutations;
- added-page draft identity creation inside the active change set;
- published-subtree delete conversion into persisted removal batches and removal members instead of physical delete;
- selected ready snapshot plus active-overlay Edit projection;
- selected ready snapshot-only Live projection;
- safe, rerunnable initial legacy workspace foundation convergence when selectors are absent and the deterministic seed rows are still staging or explicitly in recovery;
- valid same-workspace selector preservation for later successor generations and ready snapshots during ordinary listing and mutation;
- explicit stale-refresh write blocking in the App until projection and authority are resynchronized.

The following remain explicitly out of scope for this slice:

- workspace Publish;
- discard-all, individual discard, and pending-entry cleanup UX;
- Changes-center UI and pending-entry workflow surfaces;
- Undo changes beyond the editor-local behavior already in scope before E3-T9;
- page movement persistence conversion;
- physical page-lock retirement.

## Persistence model used by this slice

The active runtime now treats the workspace change-set tables as the mutation authority and projection source.

- `x_82900_docsera_workspace_change_set`
  - owns the active change-set identity, revision, and pending entry sequence.
- `x_82900_docsera_workspace_snapshot_set`
  - owns the selected ready snapshot identity used as the stable baseline.
- `x_82900_docsera_workspace_page_snapshot`
  - stores the selected published page tree used for both Live projection and Edit baseline comparison.
- `x_82900_docsera_workspace_change_entry`
  - stores the active pending change-entry set derived from the current sparse overlay state.
- `x_82900_docsera_workspace_removal_batch`
  - stores logical published-subtree removals.
- `x_82900_docsera_workspace_removal_member`
  - stores the members of each logical removal batch.
- `x_82900_docsera_workspace_mutation_claim`
  - stores the durable generation-scoped claim, owner, replay result, and recovery markers for the current mutation pair.

This slice does not introduce a dedicated overlay table. Sparse overlay persistence currently uses the existing page record draft fields:

- body updates persist to `draft_content_json` and derived draft text fields on the page row;
- Page Settings updates persist to draft title and slug fields on the page row;
- added pages are created as active page rows with draft identity only and no published identity.
- Live/Edit projection output is sourced from the selected ready snapshot; legacy page `published_*` fields are not used as the projection authority.

The workspace change-set tables remain the authority for:

- whether a page is pending Added/Edited/Removed;
- which published nodes are hidden in Edit due to logical deletion;
- the currently active mutation revision;
- the selected baseline snapshot from which Edit and Live are projected.

Mutation claims are persisted in `x_82900_docsera_workspace_mutation_claim`.

- One generation-scoped claim row serializes requests for a given `{changeSetId, changeSetRevision}` pair.
- `mutation_key` is a bounded SHA-256 fingerprint over `mutation kind + generation identity + canonical normalized payload`.
- The complete canonical payload remains stored in `mutation_payload_json`.
- Claim ownership is explicit through `claim_owner_key` plus `owner_expires_on`.
- A caller may execute only when it created the claim, recovered an abandoned claim, or resumed a claim after the change-set advance is already durably complete.
- A later request with the same pair and a different mutation fingerprint fails closed with the authoritative current pair.
- A repeated request with the same pair and a finalized claim replays the stored result instead of reapplying the write.
- The claim row is package-private and only written by the scoped persistence service.

## Claim ownership and recovery protocol

The runtime now implements one durable executor per generation pair.

- Unique insert on `generation_key` decides the first owner.
- A unique-index insert loser reloads the winning row immediately and returns one of:
  - stale-generation for a different fingerprint;
  - finalized replay for the same finalized fingerprint;
  - safe in-progress `409` for the same in-flight fingerprint.
- A caller never proceeds merely because a `claimed` row exists.
- Claim takeover is bounded by `owner_expires_on`.
- Expired ownership recovery uses a compare-and-swap update against the prior `claim_owner_key`, `mutation_state`, and `execution_phase`.
- Recovery is deterministic: exactly one recoverer can replace an abandoned owner, and losers return the same safe in-progress response.

Durable claim phases are:

- `claimed`
- `page_persisted`
- `entry_persisted`
- `removal_persisted`
- `change_set_advancing`
- `change_set_persisted`
- `result_persisted`
- `finalized`

Recovery rules are phase-specific:

- after `claimed`: retry either becomes the owner, waits with safe `409`, or replays if another caller already finalized;
- after `page_persisted`: retry reuses the persisted page identity and does not apply the page write twice;
- after `entry_persisted`: retry finishes change-set advancement and result persistence without duplicating the pending entry lifecycle;
- after `removal_persisted`: retry reuses the stable removal batch identity and does not create duplicate removal rows;
- after `change_set_advancing`: retry uses the prepared result plus the exact intended `N -> N+1` authority to recognize that this claim advanced the row;
- after `change_set_persisted`: retry persists/finalizes the stored result without reapplying the mutation;
- after `result_persisted`: retry finalizes the existing stored result without reapplying the mutation;
- after `finalized`: retry replays the stored result.

Generated durable identities are persisted into the claim before the corresponding object becomes ambiguous:

- create-page target sys_id;
- delete target removal `batch_key`;
- delete next-page identity when present.
- body/settings/create/delete result JSON is prepared before the change-set row update so exact-boundary recovery does not reread mutable page state.

Ownership is request-local:

- each request keeps the executor owner key it originally won or recovered;
- owner-sensitive page, entry, removal, and change-set writes re-check that exact owner key before the next durable write;
- if another request takes ownership, the former executor stops immediately and does not adopt the replacement owner from a reload;
- once the change-set row is already advanced and no mutation side effects remain, result persistence/finalized replay may complete owner-independently.

## Route and client authority contract

The persisted mutation routes:

- `docsera-runtime-page-save.ts`
- `docsera-runtime-page-settings-save.ts`
- `docsera-runtime-create-page.ts`
- `docsera-runtime-page-delete-action.ts`

now all require:

- a held E3-T8 workspace lease token; and
- a well-formed caller-supplied `{ expectedChangeSetId, expectedChangeSetRevision }` pair.

The route boundary now works as follows:

- the route renews the workspace lease to prove the caller still owns the edit session;
- the route does not substitute the renewed lease's latest generation pair into the mutation;
- the route passes the caller's claimed pair into the persistence service;
- the persistence service decides replay, in-progress recovery, stale-generation, or execution.

Each successful mutation response now returns the authoritative next pair:

- `changeSetId`
- `changeSetRevision`

Each stale-generation failure returns:

- `currentChangeSetId`
- `currentChangeSetRevision`

The App now:

- sends the current held mutation authority with every persisted mutation;
- installs the returned next pair after successful body/settings/create/delete mutations;
- refreshes the current workspace page projection on stale-generation conflicts instead of blindly replaying the mutation;
- preserves the existing E3-T8 lease lifecycle and lease-loss recovery surface.
- keeps stale-refresh in an explicit `refresh_required` flow rather than continuing to write against the rejected pair;
- blocks body, Page Settings, create, and delete persistence while refresh is required or in flight;
- preserves unsaved local input while the refresh is blocked;
- installs refreshed authority only as part of a successful projection refresh transition;
- uses the existing authoring error/retry surface if the refresh load fails;
- never auto-replays the rejected mutation.

## Pending-entry derivation

Pending-entry lifecycle is now derived from the proposed post-mutation overlay before `recordPendingChange` and `refreshEntriesForPage` run.

Proven behavior for body and Page Settings mutations:

- the first effective change creates one pending entry;
- later changes on the same page preserve `firstPendingSequence`;
- attribution and `last_changed_on` update on later changes;
- exact return to the selected snapshot removes the entry;
- a later new change gets a new pending sequence;
- combined body and Page Settings changes remain one page entry;
- failed or interrupted mutations do not advance the effective entry lifecycle.

The persisted page overlay, pending entry, sequence state, and next authority are therefore one recoverable logical outcome.

## Projection behavior

Live mode is now a snapshot-only projection.

- Live reads only the selected ready snapshot tree.
- Active draft overlays, added pages, and removal batches are ignored in Live.
- page-row `published_*` fields are ignored as projection inputs.

Edit mode is now a projected view.

- Edit starts from the selected ready snapshot tree.
- draft overlays on page rows are compared against the selected snapshot and applied sparsely;
- active added pages are projected into the working tree;
- persisted removal batches hide published subtrees without physically deleting the underlying published rows.

This gives the runtime a stable published baseline and a separate projected authoring surface without requiring page-level draft state to stand in for the selected published tree.

## Workspace foundation convergence

The ServiceNow change-set persistence service now separates ordinary valid-selector loading from initial legacy foundation construction.

Ordinary loading:

- if the workspace selectors already reference one valid same-workspace active change set and one valid same-workspace ready snapshot, those exact selectors are preserved;
- Live/Edit listing and mutations do not rewrite that selected ready snapshot from page-row `published_*` fields;
- later successor generations are not reset back to deterministic seed rows.

Initial legacy foundation construction:

- runs only when the workspace selectors are absent;
- uses deterministic seed identities:
  - change set `generation_key = {workspaceSysId}:change-set`
  - snapshot set `snapshot_key = {workspaceSysId}:snapshot`
  - snapshot page `snapshot_page_key = {snapshotSetSysId}:{pageSysId}`
- uses legacy page-row `published_*` fields only while building or repairing that initial seed snapshot;
- inserts missing snapshot pages only while the seed snapshot is `staging` or the deterministic seed change set is explicitly in `foundation_recovery`;
- marks the seed snapshot `ready` only after the expected page set is complete and valid;
- repairs selectors only after that ready seed snapshot and active deterministic change set are both valid;
- fails closed on partial selectors, mismatched selectors, duplicate candidate rows, or attempts to mutate a completed ready snapshot during ordinary runtime work.

## Removal identity

Logical delete now preserves removal-domain identity by treating `batch_key` as the durable batch identity.

- Removal reload uses `batch_key`, not the removal-batch row `sys_id`, as the domain identity.
- The claim stores `target_removal_batch_key`.
- Unrelated body/settings/create mutations do not replace the active removal batch.
- Delete retry reuses the same batch and member keys and does not create duplicate rows.
- Member cleanup affects only the intended stable batch identity.

## Validation

Local validation now passes with the current implementation:

- `npx vitest run src/server/api/docsera-runtime-workspace-edit-lease.test.ts src/server/api/docsera-runtime-mutation-routes.test.ts`
- `npx vitest run test/runtimeApiErrors.test.ts test/pageDeleteRoute.test.ts`
- `npm --prefix app/docsera-ui run validate`
  - managed SDK build succeeded
  - inline runtime CSS verification succeeded
- `npm --prefix app/docsera-ui run install:sdk`
- `npm --prefix app/docsera-ui run verify:sdk-runtime`
- `npm --prefix app/docsera-ui run verify:workspace-foundation`
- `npm --prefix app/docsera-ui run verify:workspace-edit-lease`
- `npm --prefix app/docsera-ui run verify:e3-t9-mutation-conversion`

Regression coverage added or updated in this slice covers:

- service-level mutation claim ownership, replay, bounded fingerprinting, interruption recovery, pending-entry lifecycle, deterministic foundation convergence, and stable removal identity;
- route-level mutation authority handoff for stale-generation replay and lease-loss blocking;
- selected-snapshot-only projection behavior;
- workspace mutation-claim schema and ACL coverage;
- explicit stale-refresh write blocking and retry behavior;
- dedicated PDI verification of same-pair concurrent body/create/delete mutation contention.

## Known limits

- Body and Page Settings sparse overlay persistence currently reuses page draft fields rather than a separate overlay table.
- Publish/discard lifecycle flows are still deferred, so active pending entries accumulate until a later workflow slice provides resolution paths.
- Page movement persistence has not been converted into change-entry/removal-batch semantics in this slice.
- Claim recovery is intentionally narrow and centered on the generation-scoped claim row; it is not a general-purpose transaction log.

## Fresh page insertion materialization

A newly acquired create claim that inserts its page reuses the initially validated workspace projection after re-reading the workspace selectors and active change-set lifecycle, revision, sequence, and recovery fields. The added draft is converted with the same sparse-overlay rules as a full load. Changed authority or selectors fall back to fresh materialization; resumed claims, pre-existing page rows, and interrupted phases always retain the full recovery path. Claim ownership and durable write ordering are unchanged.
