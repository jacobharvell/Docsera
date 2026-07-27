# Implementation Notes - Publishing Workflow

Status: implementation note

## Purpose

This note records the repo-side publishing workflow contract implemented in `app/docsera-ui`.

It summarizes repository behavior only. Accepted product requirements remain in the Obsidian vault; see `docs/process/Requirements Source Map.md`.

## Workspace Publish Contract

Workspace publishing is an explicit server-backed action exposed at `POST /api/x_82900_docsera/docsera_runtime/workspaces/publish`.

Request contract:

- the client may identify the target workspace by `workspaceSysId` or `workspaceSlug`
- the client must provide the active workspace Edit lease token
- the client must provide the exact current server-issued change-set authority as `expectedChangeSetId` and `expectedChangeSetRevision`
- the client must provide a command id for durable publish-claim ownership
- the client does not provide page rows, pending entries, snapshot content, actor, timestamp, generation, or successor authority values

Response contract:

- success returns the refreshed Edit projection, empty pending-change model, published snapshot id, workspace state revision, and successor active change-set authority
- missing, invalid, expired, or mismatched Edit lease authority fails without publishing
- stale change-set authority returns `409 stale_generation`
- validation, authorization, malformed-content, and persistence failures return safe non-success responses without exposing internal table names, sys_ids, ACL internals, or stacks
- successful publish retains the Edit lease and leaves the user in Edit mode

## Workspace Discard-All Contract

Workspace discard-all is an explicit server-backed action exposed at `POST /api/x_82900_docsera/docsera_runtime/workspaces/discard-all`.

Request contract:

- the client may identify the target workspace by `workspaceSysId` or `workspaceSlug`
- the client must provide the active workspace Edit lease token
- the client must provide the exact current server-issued change-set authority as `expectedChangeSetId` and `expectedChangeSetRevision`
- the client must provide a command id for durable discard-claim ownership
- the client does not provide page rows, pending entries, removal membership, actor, timestamp, generation, or successor authority values

Response contract:

- success returns the restored Edit projection, empty pending-change model, workspace state revision, and successor active change-set authority
- missing, invalid, expired, or mismatched Edit lease authority fails without discarding
- stale change-set authority returns `409 stale_generation`
- successful discard-all retains the Edit lease and leaves the user in Edit mode

## Workspace Snapshot Transition

Workspace publish promotes the complete persisted pending set as one workspace transition.

Repo-side behavior:

- the publish route validates authoring capability, Edit lease authority, and mutation authority before entering the publish persistence boundary
- the persistence service loads the authoritative workspace, active change set, published snapshot selector, selected snapshot, pending entries, and removal overlay on the server
- the service builds the prospective Edit projection with the existing snapshot/change-set domain helpers
- the complete prospective Edit projection is staged into a new ready snapshot set
- a successor active change set is created with revision `0` and no pending entries
- the workspace selectors switch from the old published snapshot and old active pending change set to the new published snapshot and successor active change set in a guarded workspace update
- the old change set is marked superseded only after the selector switch succeeds
- published page rows are reconciled from the new snapshot after the selector switch so legacy/read helpers see the same published title, slug, content, hierarchy, sibling order, and active state

The server, not the client, creates the published snapshot id, successor change-set id, successor revision, and workspace state revision. Client code installs returned authority only; it does not predict, increment, repair, or manufacture generations.

## Workspace Failure Atomicity

Publish failures before the guarded selector switch leave the previous Live snapshot and complete pending set intact.

Repo-side behavior:

- validation happens against the complete persisted pending set before published selectors change
- malformed canonical content, invalid hierarchy, no pending entries, missing capability, invalid lease, stale authority, and injected pre-switch persistence failures fail without clearing pending changes
- durable publish claims serialize requests against one pending generation
- a retry with the same command id can recover an unfinished pre-switch claim after claim ownership expires
- competing publish requests against the same generation cannot both publish; after the winning selector switch, the losing request observes stale authority

The guarded workspace selector update is the observable publication point. If a platform failure occurs after that point, the service treats the publish as committed, completes or recovers post-switch reconciliation where possible, and returns the authoritative published result instead of reporting a false retryable failure for a transition that is already visible.

## Workspace Discard-All Transition

Workspace discard-all restores the entire persisted pending Edit workspace back to the currently selected published snapshot as one workspace transition.

Repo-side behavior:

- the discard-all route validates authoring capability, Edit lease authority, and mutation authority before entering the discard persistence boundary
- the persistence service validates the complete persisted pending set before any selector switch and creates or reuses one durable discard claim for the exact `{workspace, source change-set id, source change-set revision, command id}`
- the successor active change set is created with revision `0` and `recovery_state = staged`, not ready-for-authoring
- before the guarded selector switch, the original pending change set, removal rows, and Edit projection remain authoritative; a failure leaves that source generation intact
- the guarded workspace selector switch changes only the active pending change set, preserving the current published snapshot selector and Live projection
- immediately after the selector switch, the successor change set is marked with a durable discard recovery state and ordinary persisted mutations are rejected until recovery completes
- every post-switch recovery path idempotently converges the source change set to `superseded`, with the discard command correlation id and finalized timestamp persisted before recovery can become ready
- post-switch reconciliation restores draft page title, slug, content, hierarchy, sibling order, publication state, and active state from the selected published snapshot
- draft-only Added pages are deleted, pending change-entry rows are cleared, and removal overlays are removed for the discarded generation with checked update/delete outcomes at each step
- the replay-safe discard result is durably persisted after source supersession and reconciliation but before the successor recovery marker can clear, so the successor never becomes writable while the claim could still rerun destructive cleanup
- if replay-safe result persistence fails, or if clearing the final successor recovery marker fails, the workspace remains recovery-blocked and only an explicit retry of the same command may continue
- the client installs only the returned successor authority; it does not predict, increment, repair, or manufacture generations

The guarded workspace selector update is the observable discard point. Until the user explicitly retries a retryable ambiguous discard, the client never replays discard-all automatically.

## Workspace Discard Recovery Invariant

Discard-all now has one durable post-commit recovery state instead of an ambiguous empty successor generation.

Repo-side behavior:

- once the authoritative selector switch has occurred, the selected published snapshot remains unchanged and the successor generation is not writable while discard recovery is incomplete
- pending-changes reads return one stable `recovery_required` result with the active successor authority, the persisted discard command identity, and the original affected-page count instead of fabricating a stale-generation error
- page body saves, page settings saves, page create, page move, page delete, workspace publish, and another discard-all all reject against that incomplete recovery state
- explicit Retry may resume only the same discard command id against the same workspace and source generation; competing command ids or stale source authority lose
- Cancel may close the modal, but it does not clear the durable recovery marker or reopen ordinary authoring
- page load, pending refresh, lease heartbeat, and other background activity do not automatically replay discard-all
- the durable recovery marker clears only after published-row restoration, draft-only Added-page deletion, pending-entry deletion, removal cleanup, and replay-safe result persistence have all completed successfully
- once replay-safe result persistence has succeeded, same-command retry may only clear the remaining recovery marker, finalize the durable claim, and return the stored result; it must not restore page rows, delete pages, or clean overlays again
- completed-command replay cannot overwrite later authoring because later writes advance newer change-set claims while the completed discard command can only return its stored result for the original source generation
- the original affected-page count is stored with the discard claim and reused through recovery-required responses, hard-reload reconstruction, and modal reopen flows; it is not recalculated from partially cleaned recovery state

Discarded row data cannot reappear because the server does not merely hide old rows in the current projection. Before the successor becomes writable, reconciliation restores the published draft fields onto surviving page rows, deletes draft-only Added rows, and clears the discarded generation's pending/removal overlays. Later body-only, settings-only, move, create, delete, publish, or discard commands therefore start from a fully restored published baseline instead of from stale pre-discard row state.

## Workspace Client Workflow

Workspace publish begins only from the Changes Center footer. The header Publish control opens the Changes Center and does not submit the command.

Client behavior:

- while publish is in flight, the Changes Center remains open
- the footer Publish action is disabled, retains the visible `Publish` label, and shows a spinner to the left of that label
- the Changes Center header owns the `Discard all` text/icon action while the footer owns only the full-width `Publish` action
- discard actions, new authoring mutations, and Live/Edit switching are disabled while publish or discard-all is in flight
- ordinary page navigation remains available where it does not close the publishing Changes Center
- success installs the returned server authority, refreshes the Edit projection and pending model, keeps the Edit lease, keeps the workspace in Edit mode, closes the Changes Center, and shows a compact header-adjacent toast instead of a page-content notice
- failure keeps the Changes Center open, preserves pending changes, preserves the previous published snapshot, shows a concise error, and allows retry for retryable failures
- ambiguous or retryable publish recovery reuses the same command identity only after an explicit user retry action, and the client never automatically replays Publish
- discard-all opens the shared destructive modal, keeps the Changes Center open behind the modal, blocks workspace interaction while in flight, replaces the Edit projection with the returned restored projection on success, and closes without showing a success toast
- ambiguous or retryable discard-all recovery reuses the same command identity only after an explicit user retry action, and the client never automatically replays discard-all

## PDI and Platform Notes

The E3-T12 verifier creates disposable workspaces, drives the runtime routes, publishes a mixed pending set, inspects Edit and Live projections, verifies pending-set clearing and lease retention, verifies a subsequent Edit mutation with returned authority, exercises no-lease and stale-authority failures, and checks competing publish requests.

Platform persistence-failure atomicity is covered by local durable-phase regression tests that inject failures before selector switch. The live PDI verifier does not intentionally corrupt scoped platform writes or table behavior to force a platform failure.

## Legacy Page Publishing Contract

Publishing is an explicit server-backed action exposed at `POST /api/x_82900_docsera/docsera_runtime/pages/publish`.

Request contract:

- the client may identify the target page by `pageSysId` or `pageSlug`
- the client may provide `workspaceSlug` or `workspaceSysId`
- the client must provide `expectedRevision`
- the client must provide the active page edit-session token
- the client does not provide publishable title, slug, content, actor, or timestamp values

Response contract:

- success returns the normalized updated page record used by the existing workspace projections
- stale persisted draft revision returns `409 draft_revision_conflict`
- lost, missing, or invalid edit-session authority returns a safe non-success response without publishing
- authorization failures return a safe `403`
- unexpected failures use the existing safe redaction path and do not expose table names, sys_ids, ACL internals, or stacks

## Persisted Revision Enforcement

Publishing promotes only the persisted draft revision identified by `expectedRevision`.

Repo-side behavior:

- the publish service loads the authoritative workspace and page state on the server
- the publish write helper rechecks `expectedRevision` against the persisted `draft_revision` immediately before the record update
- if the persisted revision changed, publishing fails without mutating published fields
- publishing does not increment `draft_revision`
- the publish correction does not add any cross-session atomicity claim beyond the accepted edit-session and persisted-draft-revision model

## Edit-Session Guard Integration

Publishing reuses the existing single-writer page edit-session boundary.

Repo-side behavior:

- the publish route calls the existing page edit-lock touch path before any promotion
- publish does not introduce a second concurrency mechanism
- missing, invalid, released, expired, or mismatched lock authority fails the publish request
- successful publish does not release the held edit session and does not switch the workspace back to Live

## Authoritative Server Promotion

The server loads the authoritative draft values and promotes them through a field-scoped page-record update, then rereads the record before returning it.

Promoted fields:

- `published_title`
- `published_slug`
- `published_slug_normalized`
- `published_content_json`
- `published_body_text`
- `published_at`
- `published_by`
- derived `publication_state`

Publish does not rewrite:

- `workspace`
- `parent_page`
- `sibling_order`
- `active`
- `draft_title`
- `draft_slug`
- `draft_slug_normalized`
- `draft_content_json`
- `draft_body_text`
- `draft_revision`

The client cannot override publish-time title, slug, JSON, actor, or timestamp.

Because the publish helper rereads the record after update, the returned page reflects the actual persisted hierarchy, draft state, metadata, and platform-normalized values rather than only the earlier in-memory publish candidate.

If hierarchy/order or draft-only settings change after the publish candidate is assembled but before the write, those fields are preserved. `publication_state` is derived from the persisted draft fields plus the promoted published snapshot that was actually written.

## Publishable Ancestry

Publishing is allowed only when the page can be represented in the Live hierarchy.

Repo-side behavior:

- a root Draft page may be published
- a Draft child may be published when every ancestor already has a published representation
- `published_with_unpublished_changes` ancestors remain valid because they still project in Live mode
- publication fails safely if the direct parent or any higher ancestor is Draft-only
- publish does not auto-publish ancestors, move the page, or reparent the page
- the safe validation message is: `This page cannot be published until all ancestor pages are published.`

## Draft / Published Isolation

Autosave and settings edits remain draft-only.

Current repo-side behavior:

- autosave updates `draft_content_json`, `draft_body_text`, `draft_revision`, and derived `publication_state`
- page settings updates only `draft_title`, `draft_slug`, `draft_slug_normalized`, and derived `publication_state`
- page settings does not rewrite published fields, publish metadata, draft content, draft revision, hierarchy, sibling order, workspace, or active state
- page settings rereads the record after update and returns the normalized persisted result
- neither autosave nor settings writes mutate published fields
- Live mode continues reading the published projection until an explicit publish succeeds

## Failure Atomicity and Safe Errors

Publish failure leaves the previous published snapshot intact.

Repo-side behavior:

- published-field promotion is written through one scoped record update so callers cannot observe a partial publish
- stale revisions, lost locks, slug validation failures, capability failures, and invalid canonical draft content fail without partial publish
- publish-route `500` failures map to `persistence_invariant`; validation and not-found failures retain the safe invalid contract
- invalid canonical draft content now returns the safe publish failure instead of bubbling an unexpected runtime error
- route logging follows the existing safe-redaction pattern and does not expose internal persistence details to the client

## Validation Notes

Validated behavior:

- local regression coverage covers first publish, republishing unpublished changes, field-scoped publish promotion, field-scoped Page Settings persistence, ancestry validation, stale revisions, invalid or missing edit-session authority, unauthorized access, invalid canonical drafts, autosave isolation, hierarchy/order preservation, and publish-route/client persistence-failure classification
- `npm --prefix app/docsera-ui run validate` passes
- bounded PDI verification on `docsera-pdi` passed for:
  - first publication of a draft page
  - publishing unpublished changes on an existing published page
  - hierarchy/order remaining unchanged across publish
  - Draft-child rejection beneath a Draft-only parent if disposable setup is available

PDI verification note:

- unauthorized publish was not exercised live because this environment exposes only the authenticated admin credential
- directly corrupting draft JSON in the table still breaks the existing live page-list projection because Live-mode listing currently parses draft JSON; publish now fails safely, but that projection limitation remains outside this task's persistence contract

## Non-Goals

This note does not add:

- version history
- rollback
- approvals
- scheduled publishing
- archive or unpublish
- publish-button placement or status presentation
- discard unpublished changes

