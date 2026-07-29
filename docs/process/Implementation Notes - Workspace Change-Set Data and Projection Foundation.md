# Implementation Notes - Workspace Change-Set Data and Projection Foundation

## Scope

E3-T7 adds an internal, scoped data and domain foundation only. Current page routes, page locks, shared hierarchy, page publishing, and hard deletion remain active until their later conversion/retirement tasks. No workspace lease, pending-changes API, Publish/Discard route, or UI is introduced here.

## Schema and selectors

`x_82900_docsera_workspace` now has `pending_change_set`, `published_snapshot_set`, and `workspace_state_revision`. The two references are the authoritative workspace selectors. `workspace_state_revision` changes when selectors change and is a projection-refresh/lifecycle value only; it is never mutation authority.

All workflow records are application-owned and package-private with no generic web-service access:

- `x_82900_docsera_workspace_change_set`: generation identity, local revision, pending-sequence allocator, lifecycle, correlation, and recovery state.
- `x_82900_docsera_workspace_snapshot_set` and `x_82900_docsera_workspace_page_snapshot`: a complete, ready reader projection with snapshot-local hierarchy and content. A staged set stores source change-set identity/revision, command correlation, and command kind. Snapshot-page identities have a synthetic snapshot/page unique key, so an identity can occur once per set.
- `x_82900_docsera_workspace_change_entry`: exactly one base entry per page identity per generation, enforced by a generation/page key.
- `x_82900_docsera_workspace_removal_batch` and `x_82900_docsera_workspace_removal_member`: immutable affected identity membership and active/retired removal overlay. Each member carries its first-pending sequence, including removal-only pages.

`x_82900_docsera_page` retains legacy fields and now reserves `draft_parent_page`, `draft_sibling_order`, `draft_removed`, and server-owned last-draft attribution fields for the later mutation conversion. They are not read by the production listing yet. Both draft and snapshot sibling order remain persisted rank strings; this foundation does not numerically coerce them. Each reserved field has an unconditional false-predicate Deny-Unless field ACL with admin override disabled, so ACL-evaluated generic writes (including administrator Table API writes) are denied. The later mutation-conversion task must provide the narrowly-authorized package-private scoped server mutation path and its full capability checks; no generic client mutation path is exposed here.

## Domain contracts

`src/server/workspaces/workspaceChangeSetDomain.ts` is a pure internal contract with tests. An authoring command requires the composite `{ expectedChangeSetId, expectedChangeSetRevision }` token. Both fields must match the selected active generation; a stale result exposes only the current safe pair and performs no mutation. A numeric revision alone, `workspace_state_revision`, and page `draft_revision` cannot authorize workspace mutations.

Generation revisions and pending sequences are local to a generation. A generation is never emptied and reused. Successful staging creates a successor empty generation; old active generations become superseded.

Live projection reads only the workspace-selected same-workspace snapshot set when it is `ready`. It never reads drafts, non-selected snapshots, or incomplete/staging snapshots, and the normal Live loader uses only minimal current page-row metadata after the ready selector exists. The ready snapshot remains the source of truth for Live title, slug, content, hierarchy, ordering, and active state. Edit starts with that selected snapshot, applies sparse content/metadata/hierarchy draft overrides by identity, adds new draft identities, and excludes active removal members. Missing published identities, incomplete Added rows, duplicate identities, and parent references outside the effective set are rejected rather than silently dropped. This permits an Added parent and a moved published child without changing Live hierarchy.

Pending categories are derived, not stored as client-mutable truth: Added, Removed, Modified · Moved, Moved, then Modified. Added has precedence over Removed. A removal batch is valid only when its non-empty, unique member set includes its root and every identity (including the root) exists in the workspace-selected ready published snapshot; draft-only Added and arbitrary missing identities are rejected. Creation performs this check before cloning, sequence allocation, entry/batch creation, selector changes, or revision changes. Persisted active batches are revalidated before pending-list projection and Edit staging, so invalid memberships fail closed rather than producing ghost Removed rows or staging a projection. A base entry retains first sequence/time while later changes update server attribution/time. A removal batch overlays all affected published identities without replacing their base entries; a clean removal member receives a sequence from the generation allocator at removal time. Retiring the batch restores pre-existing base entries and removes removal-only rows without creating base entries.

## Staging, recovery, and cleanup

The domain models the intended production observable boundary: staging first captures the exact active change-set ID/revision and command identity, then validates the full effective Edit projection before the set becomes `ready`. Publish switches both selectors only when the caller token, ready same-workspace snapshot, command kind/correlation, and snapshot source pair all match the active generation. A persisted mutation after staging therefore requires restaging. Duplicate snapshot/successor IDs and command-ID reuse across command kinds fail. Discard-all switches only the pending-generation selector. A command correlation records the switched result so an uncertain-response retry of the same command kind returns it without a second selector update. Cleanup occurs only after the selector switch and is not correctness authority; failed cleanup cannot reactivate retired state.

This is not a claim of an undocumented multi-record ServiceNow transaction. The future persistence adapter must prove its guarded single workspace-record update and lease check in the PDI.

## Backfill and operational gap

The pure `backfillWorkspaceFoundation` contract defines a rerunnable migration boundary: create a complete ready initial snapshot from legacy published fields/shared hierarchy, separately retain current draft hierarchy state, and create one empty active generation. Completion means the selectors point to exact existing same-workspace records, the snapshot is `ready`, and the change set is `active`. If valid target records exist but a selector is absent, recovery repairs those selectors. Missing, wrong-workspace, staging, or inactive targets return a structured `recovery_required` result and leave the legacy runtime authoritative. Repeated runs after successful recovery are no-ops. A production migration must run in repeatable batches, record partial progress before retry, never expose a staging snapshot through the workspace selector, and must not destructively alter PDI data in this task.

E3-T8 and later must supply the package-private Glide adapters, ACL/capability/lease enforcement, guarded workspace compare-and-update proof, and conversion of page mutations. They must retire legacy `parent_page`/`sibling_order` Live reliance, page-level publish/lock routes, and hard-delete behavior only after the new paths are verified.
