# Technical Spike - Workspace Change Set and Edit Lock Architecture

Date: 2026-07-16
Status: recommendation; no production behavior is implemented by this spike.

## Scope and Current Constraints

This note records repository findings and the recommended implementation shape for the accepted workspace-wide publishing decision. It does not replace the accepted requirements in the Obsidian vault.

Current `x_82900_docsera_page` records already separate draft and published title, slug, canonical JSON, and body fields. They do **not** separate hierarchy: `parent_page` and `sibling_order` are the one shared tree. `serviceNowPageListing.ts` projects Live content from the published content fields but deliberately uses those shared hierarchy values. Consequently, a persisted move would currently change the Live tree before publication.

The current page lock is a reusable lease foundation, not a reusable contract. `x_82900_docsera_page_edit_lock` has a supported table-level unique index and the PDI contention proof showed exactly one winner among simultaneous inserts. Its key is page-specific, however, and autosave, publish, and discard require that page token. This must be replaced, not layered with a workspace lease.

The current publish route promotes fields on one page. The current delete action hard-deletes the selected subtree leaf-first. Page drag/drop is still local/demo-backed; no server move mutation exists. Page Settings persists only title and slug. These are useful UI and validation boundaries, but their page-level workflow contracts are superseded.

The repo has no documented or proved scoped API for an atomic transaction spanning multiple `GlideRecord` writes. The earlier GlideQuery experiment was explicitly rejected as a simultaneous compare-and-save boundary in `Implementation Notes - Revision-Safe Page Body Autosave.md`. The page-lock spike proved only a unique-index insert winner, not immutable-successor or multi-record serialization. Do not use an undocumented transaction API or infer atomicity from sequential `update()` calls.

## Requirements That Now Conflict

The task brief intentionally supersedes these accepted notes; they need product-note updates before the production work is accepted:

- `Requirements/41 Publishing Model.md`: E3-T5's page-specific publish/discard controls, per-page publish action, and page-level lifecycle wording.
- `Requirements/22 Workspace Shell.md`: page-title-row ownership of the unified page Publish control and page autosave/publish status placement.
- `Requirements/30 Page Model.md`: its statements that movement/reparenting/order apply to readers immediately and do not create unpublished changes; its page-specific discard description must be extended for workspace discard, Added pages, and removal batches.
- `Requirements/31 Page Settings.md`: the page-level Publish/Discard interaction details and immediate hard deletion behavior for published pages conflict with pending subtree removal. Its Page Settings title/slug editing boundary itself remains valid.

The role note remains compatible: capability is evaluated from current native group membership server-side. This change adds no workspace-specific roles or membership table.

## Recommended Durable Model

Use a hybrid model: explicit workspace change entries for ordering, attribution, and operation identity; derived categories from authoritative draft-versus-published state. Do not derive the entire pending list only from page fields, and do not persist a freely mutable category as the source of truth.

### Workspace and lease

Add these workspace-owned records/fields (names are illustrative):

- `x_82900_docsera_workspace_edit_lease`: package-private table with a unique `workspace_key` index, workspace reference, holder user reference, verifier digest, acquired/last-seen timestamps, and an opaque server-issued token. It is the direct successor to the page-lock row.
- Workspace: `pending_change_set` reference, `published_snapshot_set` reference, and an optional monotonic `workspace_state_revision`. Only the workspace command service changes either pointer. `workspace_state_revision`, if retained, is a pointer/lifecycle and projection-refresh version: it tells a client that the workspace selectors changed. It is not an authoring-mutation authority and must not be accepted in place of a change-set token.
- `x_82900_docsera_workspace_change_set`: one row per **pending-overlay generation**, with a generation identity, `change_set_revision`, `next_pending_sequence`, command/recovery state, and lifecycle metadata. A workspace points to exactly one active, empty-or-pending generation. A generation owns its entries, allocator, revision, command state, and recovery metadata; it is never emptied and reused. Finalized/discarded generations are immutable to user-facing commands and may be cleaned asynchronously.

The new-generation rule is deliberate. It gives Publish and Discard all one observable workspace-record commit boundary instead of combining a reusable row with a pointer that is sometimes cleared or redirected. The server creates and initializes the successor empty generation before the command reaches its commit point. Publish then performs one guarded workspace-record update that switches both `published_snapshot_set` to the ready staged set and `pending_change_set` to that successor. Discard all performs one guarded workspace-record update that switches only `pending_change_set` to its successor and leaves `published_snapshot_set` unchanged. The guard includes the expected active generation identity/revision and current lease. The exact repository/PDI-safe compare-and-update mechanism remains a production proof item; this spike does not claim a multi-record transaction.

Acquisition, resume, heartbeat, and release keep the existing token design: secure random plaintext token returned only to the owner; SHA-256 verifier digest persisted; authenticated user and workspace resolved on the server. Browser-side tab identity is not sent as authority. It is only the conservative same-tab-resume coordination signal already used by the page lock (session-local token, stable tab id, owner marker, and BroadcastChannel probe). A different tab must clear a copied token and contend normally.

Renew after 60 seconds and immediately on `visibilitychange` to visible and `online`. The server computes five-minute expiry from server time. Expiry is ordinary and silent. The next authoring mutation first renews/reacquires; if another holder won, return holder-safe conflict data, reject the mutation, and make the client return to Live. A scheduled cleanup may remove stale rows, but every operation must independently treat stale rows as expired; cleanup is not correctness authority.

### Page state and snapshots

Retain page identity and draft content fields, but add separate draft and published hierarchy/removal state:

- `draft_parent_page`, `draft_sibling_order`, and `draft_removed` (or equivalent removal-batch reference) are used only by Edit projection.
- Published hierarchy must no longer read draft/shared `parent_page` or `sibling_order`.
- `last_draft_changed_on` and `last_draft_changed_by` are authoritative server-set fields on the page identity/draft state. The user reference is never client supplied.

For safe workspace-wide publication, add `x_82900_docsera_workspace_page_snapshot`. A snapshot row contains the complete reader projection for one page: stable page identity, title/slug/normalized slug, canonical document/body, parent identity, sibling order, active state, publisher/time, and a `snapshot_set` reference. A snapshot set is complete only after all pages in the prospective tree have staged rows.

Live queries read only the workspace's one `published_snapshot_set` pointer. They never read draft fields and never mix snapshot sets. A publish may write many staging rows, but none is observable to Live until one workspace record update changes the pointer. This is the smallest defensible scoped-app commit protocol when a multi-record database transaction is not evidenced. It deliberately materializes a complete workspace snapshot at each successful publish; an overlay-chain design was rejected because resolving inherited snapshots makes validation, removal, and recovery materially more complex.

The Edit projection is the current published snapshot plus the workspace's active change-set overlay. Added pages exist only in that overlay. Removed published pages are excluded by an active removal batch. Thus Live keeps the prior tree and URLs until the pointer switch; Edit sees prospective content, settings, hierarchy, additions, and removals.

### Change entries and invariants

Use `x_82900_docsera_workspace_change_entry` with change-set generation, page identity, `first_pending_sequence`, `first_pending_on`, `last_changed_on`, `last_changed_by`, and optional removal-overlay reference. It has one durable base pending entry per page per generation; that entry is not replaced when the page is removed. The server allocates `first_pending_sequence` from the generation only when a page first becomes pending. It retains that sequence, prior derived Modified/Moved state, and last-change attribution for subsequent edits and removal/undo. A fully discarded clean entry may be retired, so a later change receives the next sequence.

Category is derived on read in this precedence order:

1. `Added` when the page has no base published snapshot.
2. `Removed` when it belongs to an active removal batch.
3. `Modified · Moved` when draft content/settings differ and draft parent/order differs from the base snapshot.
4. `Moved` when only parent/order differs.
5. `Modified` when only content/settings differ.

This prevents contradictory persisted categories. A moved parent's descendants retain their own unchanged parent/order values and receive no move entry. A removal batch records its root page, immutable affected-page identity membership records (or an equivalently immutable identity set), remover attribution/timestamp, and `active`/`retired` state. It does not replace a page's base pending entry: clean affected pages can have a batch membership with no base entry, while already-pending affected pages keep their original entry intact. While the batch is active, the pending-list projection emits `Removed` and the batch remover attribution for every affected page. On retirement, its membership overlay disappears: a prior pending page reappears with its original sequence, category, and last-change attribution; a page clean before removal has no base entry and disappears from the list. This is compatible with one base pending entry per page because removal is a batch overlay on that entry, not a second entry or a category rewrite.

Discarding (undoing) any Removed row resolves its active batch and retires the entire batch through one logical state switch. The command returns the complete affected identity set and no authoring projection may expose a partially retired membership set. A retry observes the retired batch and returns the same recovered result. An Added subtree must likewise be discarded as a subtree: all descendant added identities and their generation entries are marked retired as part of one logical discard operation before physical cleanup. The active generation's Edit/pending projections exclude the whole set immediately, so asynchronous identity deletion cannot leave an observable orphan. An individual discard of `Modified · Moved` clears both overlay dimensions and restores base snapshot values.

## Mutation, Publish, and Discard Protocols

### Active change-set command token

Every protected mutation first resolves workspace, current capabilities, and the exact workspace lease. It then loads the workspace's current pending generation and validates the composite command token `{ expectedChangeSetId, expectedChangeSetRevision }` against that active generation's identity and revision. `changeSetRevision` is monotonic only within one generation; it is not globally unique and must never authorize a mutation against whichever generation happens to be active. Every persisted authoring mutation--autosave, Page Settings, create, move, remove, Publish, Discard all, and individual discard--validates both values and advances the active generation revision when it succeeds.

A mismatch in either value fails without mutation and returns the current safe `{ changeSetId, changeSetRevision }` pair needed for client refresh. A new command must match that expected generation pair. Idempotent `commandId` handling does not relax the rule: only a retry of an already-recorded command returns that command's recorded result, rather than being evaluated as a new command against the current generation. The server, not the client, calculates page differences, entry sequence, contributor, timestamps, and revision increment. `workspace_state_revision`, where exposed, remains pointer/lifecycle and projection-refresh metadata; it is not a substitute command token or aggregate mutation authority.

- Autosave retains the canonical-document parser, debounce/coalescing, per-page `draft_revision`, and flush boundary. It additionally requires the workspace lease and records a change-set mutation only after a successful persisted draft save.
- Page Settings retains title/slug validation and its local transient-state behavior. Its persisted mutation requires the lease and changes the workspace token.
- Create validates parent against the Edit projection and creates an Added overlay/page identity plus an entry.
- Move validates the complete Edit tree (same workspace, no self/descendant cycle, depth/order rules), writes only draft hierarchy, and changes the token. It never writes a published snapshot.
- Remove creates a removal batch instead of hard deleting a published identity. Draft-only additions are removed from the overlay/identity after confirmation.

Publish all first validates the complete effective Edit projection: lease/capability, unchanged active-generation identity/revision pair, canonical content, workspace-wide slug uniqueness, parent existence, acyclic/depth-valid tree, sibling ordering, and removal/addition integrity. It stages a complete snapshot set and marks it ready, then creates a new empty pending generation with recovery correlation to the command. Immediately before the one guarded workspace-record update it rereads and guards the exact lease plus both expected active-generation values. If either generation value or the lease changed, it abandons the staged set/successor. That one update switches both selectors. After success, Live and Edit resolve to the newly published snapshot plus the new empty generation; the lease remains held. Only afterwards may cleanup retire draft/staging/entry/identity material. A cleanup failure is recoverable and cannot make old changes reappear because ordinary authoring queries follow only the workspace's active pointer.

Discard all must not rewrite every page before telling readers/editors which state is active. It creates a new empty pending generation, then immediately before the guarded workspace-record update rereads and guards the exact lease plus both expected active-generation values. The update switches `pending_change_set` while retaining the published snapshot pointer. A mismatch in either generation value fails without mutation. After success, Edit resolves to the unchanged published snapshot plus the new empty generation, and the lease remains held. Added identities, entries, removal memberships, and old drafts are finalized/cleaned only after the pointer switch; failure there cannot expose a half-discard or resurrect an old overlay.

Each command records a stable command/correlation identifier and enough generation/snapshot state to determine whether the pointer switch occurred. A retry with that identifier, or server recovery after an uncertain client response, returns the already-completed result rather than reapplying the mutation. This protocol guarantees observable all-or-nothing behavior through one workspace record update, but cannot claim that no internal staging/cleanup write ever fails. Live/public queries ignore non-ready snapshot sets and non-active generations; ordinary authoring queries ignore every generation other than the workspace pointer.

## API Contracts

All responses return normalized safe codes, current aggregate revision where applicable, and only authorized holder attribution.

- `POST /workspaces/edit-lease/acquire|resume|renew|release`: workspace reference and opaque token where applicable. Acquire/resume success returns token, expiry/renewal intervals, active `changeSetId` and `changeSetRevision`, and optional `workspaceStateRevision`; contention returns `workspace_locked` with safe holder summary. Only acquire/resume returns plaintext token.
- `GET /workspaces/{workspace}/pending-changes`: authoring capability required; returns `changeSetId`, `changeSetRevision`, ordered entries, derived category, last-change timestamp, compact contributor, and authorized native-profile link metadata.
- `POST /workspaces/{workspace}/publish`: `{ leaseToken, expectedChangeSetId, expectedChangeSetRevision, commandId }`; returns `{ publishedSnapshotSetId, changeSetId: newEmptyGenerationId, changeSetRevision: initialRevision, workspaceStateRevision }`. `409` distinguishes stale change set, lost lease, or an item-specific validation failure without exposing internals; a stale response includes the current safe `changeSetId` and `changeSetRevision` for refresh.
- `POST /workspaces/{workspace}/discard-all`: `{ leaseToken, expectedChangeSetId, expectedChangeSetRevision, commandId }`; returns `{ changeSetId: newEmptyGenerationId, changeSetRevision: initialRevision, workspaceStateRevision }` and an Edit-projection refresh marker.
- `POST /workspaces/{workspace}/pending-changes/{page}/discard`: `{ leaseToken, expectedChangeSetId, expectedChangeSetRevision, commandId }` plus page identity; resolves a removal batch or page overlay server-side and returns affected identities plus the next revision of the same active generation.

Publish/discard commands intentionally do not accept document/title/slug/Page Settings payloads and do not flush local transient editor state. The client must use the existing editor flush and settings-save completion boundaries before requesting them.

Contributor output is generated from the server-owned `sys_user` reference. The domain API returns only a compact display name and a native profile record/link descriptor when the requester passes a server-side policy check for that profile; otherwise it returns no sys_id/link. Never accept actor fields or expose arbitrary `sys_user` attributes through these endpoints.

## Reuse and Retirement

Reuse:

- unique-index lease acquisition, opaque verifier-digest handling, server-time expiry, exact-token touch/release, and conservative same-tab coordination from the production page lock;
- canonical document validation, body autosave debounce/coalescing, `flushLatest`, sequential page revision checks, safe error mapping, capability evaluation, slug allocator, page-tree validation helpers, and selected-page fallback tests;
- E3-T5's editor callback stabilization: single-flight acquire promise, flush-before-command behavior, and the editor publish/discard barrier/freeze repair are useful only after being generalized from page commands to a workspace command barrier.

Retire or replace:

- page-lock table/routes/scheduled cleanup/client storage keys and every autosave/settings/create/move/remove/publish/discard dependency on a page token;
- the current page publish route and E3-T5 page-discard route/persistence helper, page-title-row Publish popover, and page-specific status semantics;
- shared `parent_page`/`sibling_order` as Live hierarchy and hard delete for a published subtree;
- E3-T5's per-page expected revision as the authority for workspace Publish/Discard all. Page revisions remain autosave guards; the active generation's `{ changeSetId, changeSetRevision }` pair is the workspace command token.

Do not cherry-pick E3-T5. Its `PageAuthoringControls`, page-popover copy/layout, page publish/discard endpoints, per-page service methods, and E3-T5 smoke assets are coupled to superseded UX and contracts. Selectively reimplement the generic runtime fixes with tests in the new workspace-command boundary.

## Bounded Production Sequence

1. **Data/projection foundation (recommended first task):** add schema/domain tests for generation-specific change sets, the workspace active-change-set pointer, the composite `{ changeSetId, changeSetRevision }` command token, separate `changeSetRevision` and pointer/lifecycle revision roles, one-base-entry-per-page removal-batch overlays, separate draft hierarchy, and published snapshot projection. Prove rejection without mutation when either expected generation value is stale, including a stale command whose old revision numerically matches the revision of a new active generation. Prove the Publish and Discard-all atomic pointer-switch invariants (including recovery from an uncertain response) with server/domain tests; no UI command surface. Include migration/backfill plan from current published fields/tree into the first snapshot set.
2. **Workspace lease replacement:** install workspace lease routes/client lifecycle; gate existing authoring mutations; remove page-lock requirements only once all mutations use the workspace lease. Exercise PDI contention and same-tab resume.
3. **Draft overlay mutations:** convert autosave, Page Settings, create, persisted move, and remove into change-set mutations; add pending-list API and regression coverage for order/category/attribution/removal undo.
4. **Snapshot publish and discard-all command service:** implement staging, validation, single-pointer publication, discard switch, recovery cleanup, and failure-injection tests. Verify on PDI that a reader never observes a partial tree.
5. **Individual discard and UI integration:** connect workspace pending changes, page discard, selection fallback, routing/breadcrumb/tree projections, and generalized editor freeze behavior. Conduct the required authoring/manual visual verification.
6. **Retirement/migration:** remove legacy page publish/discard/lock routes and records only after migration telemetry/diagnostics confirm no active legacy leases; leave a narrowly scoped server-side compatibility rejection during one release if needed.

The first production task should be step 1. It resolves the necessary durable model and read projections before changing a live editing path, is independently reviewable, and gives later lease and command work a stable server contract.

## Validation and Risks

This spike performed no PDI deployment and made no proof-only runtime changes. Findings are grounded in the checked-out `main` source, the E3-T5 reference at `389e4b4c87fa0a20ae7819b03b6df9486c39269b`, current implementation notes, and the previously recorded PDI contention/GlideQuery evidence.

Open risks to resolve in the production slices: snapshot storage growth and retention policy; migration of existing pages with duplicate draft/published tree fields; a PDI proof that one workspace pointer update is the only Live-observable selector; and ACL design for snapshots, change sets, lease rows, and profile-link descriptors. None of these justify exposing draft data through generic table/web-service access; custom tables should be package-private where possible and all domain reads/writes must remain behind scoped server routes and capability checks.
