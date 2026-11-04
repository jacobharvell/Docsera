# Implementation Notes - E3-T10 Page Tree Movement Mutation Contract

E3-T10 converts page movement into the workspace change-set mutation model introduced by E3-T9.

Movement changes only the prospective hierarchy fields for the target page: `parentPageId` and `siblingOrder`. It does not change title, slug, draft body, draft revision, published content, publication state, or unrelated page state. Live projection remains the selected ready snapshot; Edit projection overlays draft page hierarchy and pending removals on top of that snapshot.

Sibling rank values are numeric ranks persisted as strings and projected as numbers; finite values including `0`, negative ranks, and fractional ranks are preserved through ServiceNow persistence, client normalization, and Edit projection ordering.

## Durable Mutation Contract

The runtime route is `POST /api/x_82900_docsera/docsera_runtime/pages/move`, registered in the SDK REST API as `pages_move`.

The route requires the existing workspace authoring gate:

- a held workspace Edit lease;
- authoring capability through the lease service;
- caller-supplied `expectedChangeSetId` and `expectedChangeSetRevision`;
- the active change-set generation pair from the current Edit lease.

Persistence extends the E3-T9 mutation claim table with `mutation_kind = "move"` and a payload containing `pageSysId`, `parentPageSysId`, and `siblingOrder`. Movement reuses the same generation-key uniqueness, claim ownership, owner expiry, takeover, phase replay, and finalized replay behavior as body, settings, creation, and removal mutations.

When no matching movement claim exists, persistence validates the current prospective Edit tree before inserting a claim. Deterministic invalid movement and true no-op movement return without creating or finalizing a mutation claim, without creating pending entries, and without consuming the generation pair.

Successful non-noop movement advances the active change-set revision exactly once. A failed validation, stale generation, lost lease, ownership loss, or no-op does not advance the revision.

The durable phases are:

- `mutation_claim_created`
- `mutation_page_persisted`
- `mutation_entry_persisted`
- `mutation_change_set_row_updated`
- `mutation_change_set_persisted`
- `mutation_result_persisted`
- `mutation_finalized`

If a response is interrupted after page hierarchy persistence, recovery reloads the moved Edit projection and records the pending entry before advancing the change-set row. If the page hierarchy row update succeeds but the `page_persisted` claim marker fails, a retry after owner expiry recognizes that the page row already represents the claimed move, resumes the original mutation, records exactly one pending entry, advances from `N` to `N+1`, and finalizes a replayable result. If `change_set_advancing` claim persistence fails before the change-set row update, retry uses the existing page and pending state and advances exactly once. If interruption occurs after the change-set row update, recovery observes the successor authority and finalizes the replayable result without a second revision increment.

## Hierarchy Validation

Movement validates the complete prospective Edit tree before durable authority advances:

- target page must exist in Edit;
- target parent must be root or an existing Edit page;
- target and parent must not be in an active removal batch;
- circular ancestry is rejected;
- missing parents and mixed orphan hierarchy are rejected by projection validation;
- maximum nesting depth is six total levels, with root pages counted as level 1;
- missing page or sibling placement is rejected;
- no-op placement returns the current authority and Edit projection without revision advancement.

Added parents are valid Edit parents because they exist in the active draft overlay. Removed pages cannot be moved, and removed parents cannot receive children.

## Pending Entries

Movement preserves one pending entry per affected page:

- unchanged published page moved: `Moved`;
- modified page moved: `Modified · Moved`;
- `Modified · Moved` restored to published position: `Modified`;
- movement-only page restored to published position: pending entry removed;
- Added page moved: remains `Added`;
- Removed page: movement rejected and the removal category remains unchanged.

Moving an ancestor does not create descendant entries. Siblings whose numeric order is normalized by a caller are not given pending entries unless their own effective parent/order changed.

## Client Reconciliation

The ServiceNow client exposes `movePage(...)` and normalizes the returned successor authority plus refreshed Edit page projection. `App` uses the same workspace lease recovery coordinator used by body, settings, create, and delete mutations:

- submits current workspace authority and lease token;
- performs a minimal optimistic hierarchy update for the moved page;
- installs returned successor authority on success;
- replaces the Edit page list with the authoritative returned projection;
- rolls back to the previous local page list on rejection or transport failure;
- requests stale-generation refresh on conflict;
- forces the existing Live fallback path on authoring access loss.

The page tree uses native drag/drop in Edit mode when authoring is enabled. Root rows and recursive child rows forward the movement callback. Drop completion resolves to above, below, or inside placement from the pointer position, supporting root reorder, same-parent reorder, cross-parent movement, moving to root, and dropping inside eligible parents through the six-level hierarchy limit. Client-side validation rejects circular or over-depth placements before calling the runtime; the server remains authoritative and reconciliation always uses the returned Edit projection.

## Compact destination picker

The page actions dropdown now exposes one **Move** action. It transitions the same compact dropdown into a searchable, expandable workspace hierarchy and sends the existing move mutation only after a destination is selected. Page destinations mean “append inside this page”; Workspace root means append to the root list. The picker always reads the full hierarchy rather than the sidebar’s active search results, disables the source, its parent, descendants, and over-depth destinations, and keeps expand/collapse controls separate from destination controls. Picker state is reset on every new action-menu opening and outside dismissal. Its portal position is recalculated against its original anchor whenever the picker opens or closes, so its larger surface remains viewport-aware. Back or the first Escape returns focus to **Move**; the next Escape closes the dropdown and restores its trigger focus. Both a rejected movement and a `false` movement result announce failure; only `true` starts successful-movement reconciliation.

The non-drag Move up, Move down, Indent, and Outdent commands were intentionally removed. This leaves sibling reordering available only through native drag-and-drop; it does not make drag operations completely accessible. A keyboard-accessible sibling-ordering interaction remains deferred.

## Regression Coverage

Domain tests cover movement category transitions, Added parents, descendant non-duplication, stale/no-op handling, circular and invalid-parent rejection, removed-page rejection, excessive depth rejection, and Live/Edit separation.

Persistence tests cover successful movement, Live unchanged while Edit changes, invalid and no-op movement rejection without claim rows, one-revision advancement, same-pair contention, page-write/claim-marker recovery, `change_set_advancing` failure recovery, post-change-set-row-update recovery, finalized replay, category transitions, level-6 acceptance, level-7 rejection, and no duplicate pending entries.

Route, tree, App, and client tests cover generation-authority forwarding, response shape, refreshed projection normalization, client request payload shape, actual drag/drop callback invocation, optimistic reconciliation, rollback, stale refresh, and authoring access-loss fallback.

The E3-T10 verifier is a live PDI verifier. It creates disposable workspaces, acquires an Edit lease, calls `/pages/move`, verifies Edit movement and unchanged Live hierarchy, verifies move-before-first rank zero ordering, verifies invalid and stale rejection, checks same-pair contention, confirms direct workflow-table writes remain denied, and cleans up verifier data.
