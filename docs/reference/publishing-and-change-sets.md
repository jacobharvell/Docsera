# Publishing and change sets

Docsera publishes a workspace, not individual pages. This reference describes the implemented change-set, publish, discard, and recovery boundaries. It complements the [workspace domain reference](workspace-domain.md) and [page state and hierarchy](page-state-and-hierarchy.md), which define the workspace selectors, page records, and Live/Edit projections in more detail.

## Workspace publishing model

Each workspace selects both a ready published snapshot set and one active pending change set. The selected snapshot is the complete Live projection. The active change set produces Edit by applying sparse draft overlays for published page identities, including added draft-only pages, and excluding members of active removal batches.

The page row is durable input to this model, but it is not the complete reader-facing authority. A published row may be reconciled around publish or discard, yet Live stays tied to the selected ready snapshot set until the server switches that workspace selector. Thus draft title, content, hierarchy, and active-state changes can be visible in Edit while Live remains unchanged.

Snapshot sets contain immutable-shaped page projections for a particular publish command. A snapshot must be ready, belong to the workspace, and have unique page identities with valid projected parent references before it can be selected. Draft overlays for published identities are sparse; added identities carry their complete draft state. Removal batches identify a published root and its affected published identities, so they can be absent from Edit without being removed from the selected Live snapshot.

## Pending changes

The server derives the displayed category for each affected page from the active change set and the selected snapshot:

| Displayed category | Derived condition |
| --- | --- |
| `Added` | A draft-only identity has no selected published identity. |
| `Removed` | The identity is a member of an active removal batch. |
| `Modified` | Draft content, title, slug, body text, or active state differs from the selected snapshot. |
| `Moved` | Draft parent or sibling order differs from the selected snapshot. |
| `Modified · Moved` | Both the modified and moved comparisons differ. |

These labels are a current server projection, not separate persisted page states. Change-entry rows hold a page identity, first-pending sequence and time, and last-change attribution. A removal batch and its members hold removal-specific attribution and first-pending sequences. The pending model combines those sources, removes entries whose effective category is now clean, and orders results oldest first by first-pending sequence (with page identity as the deterministic tie-breaker).

The Changes Center receives a server-provided model containing the active change-set identity and revision, affected-page count, rows, normalized category, navigability, title, last-change timestamp, and privacy-safe attribution. For non-removed rows, titles come from the Edit projection; removed rows use the selected published projection, with the durable page row only as a fallback. A removed row is not navigable.

Pending-change reads require a held workspace Edit lease and its authorization boundary. The read path validates the held lease without renewing it or creating mutation authority; it does not accept a client-supplied pending model.

## Mutation authority and concurrency

The active change set has a server-owned identity and revision. A mutation supplies the generation pair that the server previously returned, and the server compares that pair with the active generation. A successful ordinary change advances the active change-set revision; publishing and Discard all supersede that generation and select a successor at revision zero. The workspace selector revision separately advances when a selector switch occurs.

The workspace Edit lease is an independent prerequisite. A held lease establishes the workspace, current generation, and authorization context; it does not make a stale client generation current. Publish, Discard all, and individual discard require both a valid renewed lease and a current generation pair. Pending reads require the held lease but no mutation pair. Missing, expired, replaced, or unauthorized lease state is reported before the mutation service runs.

Durable mutation claims record the generation key, mutation fingerprint, kind, payload, execution phase, result authority, and replayable result when available. They coordinate a command for a given generation, preserve enough information to continue supported interrupted work, and return a completed command's stored result for an identical replay. They do not authorize the client to manufacture revisions, infer successor IDs, or automatically repeat non-idempotent commands.

## Publish workspace

Publishing requires an Edit-capable caller with a held lease, a current change-set pair, and a valid command identity. The service rejects an empty pending set. For a current generation, it derives the Edit projection, stages a publish snapshot bound to that exact command and source generation, validates it as ready, and creates a successor pending change set.

The publish transition then switches both workspace selectors: the staged ready snapshot becomes the published snapshot, and the successor becomes the active pending change set. The source change set is superseded. The response returns the authoritative successor pair, workspace selector revision, selected published snapshot ID, refreshed Edit projection, and an empty pending model. Page-row publication reconciliation occurs after the selector transition; it preserves the selector as the Live authority rather than replacing it with page fields.

The persistence service tracks phases before advancing the change set and can recognize an already-switched workspace or replay a completed matching command. Focused tests cover a failure before selector switching, competing publish requests, and completed-command replay. The implementation does not promise a general all-or-nothing transaction across snapshot writes, selector changes, row reconciliation, result persistence, and claim finalization. In particular, selector advancement can be authoritative while later reconciliation or claim-finalization work still needs server-side follow-up.

## Discard operations

### Discard all

Discard all is a workspace-wide pending-state reset. It requires the same lease, current authority, and validated command identity as publish, and rejects a change set with no pending changes. It retains the currently selected published snapshot, creates and selects a successor pending change set, supersedes the old generation, and returns the published projection as the restored Edit state with no pending rows.

After selector switching, the server reconciles page rows and cleans the discarded generation's pending entries and removal data. A durable command claim and recovery marker prevent unrelated later mutations while an interrupted discard-all recovery remains active. The same discard-all command identity can resume the supported recovery path or replay its persisted result; a different command is not accepted as a substitute. This recovery path is distinct from individual discard.

### Individual discard

Individual discard targets a page identity and its current derived category. It requires a held Edit lease and current authority, but does not take a publish/discard-all command identity. On success it returns a fresh authoritative Edit projection, pending model, and successor mutation authority.

- `Modified` restores content, settings, and active state from the selected snapshot while retaining a pending move, if any.
- `Moved` restores hierarchy and sibling placement while retaining a pending modification, if any.
- `Modified · Moved` restores both sets of fields.
- `Added` removes the draft-only page and its dependent Added subtree. It is rejected if the subtree contains a published identity that still depends on the Added parent.
- `Removed` retires the applicable removal batch, restoring that batch's members to Edit. A descendant row can target its containing removal batch.

The operation rejects a page that no longer has a pending category and rejects unsupported dependency combinations. It updates the authoritative pending state only after its supported persistence path completes; it should not be interpreted as having Discard all's selector-switch and recovery semantics.

## Recovery and failure boundaries

The routes distinguish several outcomes:

| Outcome | Meaning and client boundary |
| --- | --- |
| `stale_generation` | The supplied generation is absent or no longer active. The response can include the current server pair; reload authoritative state rather than incrementing or synthesizing it. |
| Lease or capability failure | The caller lacks a valid held Edit lease or required capability. It does not establish mutation authority. |
| `invalid` / unsupported operation | Inputs, target state, command identity, empty pending state, or a dependent/obsolete discard target are invalid. The command is not made valid by a client retry. |
| `recovery_required` | The server has identified a supported interrupted discard-all recovery boundary and reports its command and successor authority. Pending reads and later mutations can be blocked until that recovery is resolved through the existing command path. |
| Completed command replay | An identical completed claimed command can return its stored authoritative result without a second selector switch. |

An interrupted publish can use its durable claim to recognize completed or already-switched work; an interrupted discard-all has the explicit recovery-required boundary described above. These mechanisms are server-side recovery behavior, not permission for automatic client retries. Clients retain the command identity for an explicit retry where the current UI supports it, use returned authority, and reload on stale or obsolete context. They do not automatically replay create, move, delete, publish, Discard all, or undo.

Snapshot staging precedes publish selector switching. Selector switching establishes which snapshot is Live; subsequent page-row reconciliation, result persistence, recovery-marker clearing, and claim finalization have their own observed recovery behavior. The current implementation and tests support only those named paths and do not establish a broader guarantee that every persistence failure is automatically recoverable.

## Principal sources and focused verification

Current implementation sources include:

- `app/docsera-ui/src/server/workspaces/workspaceChangeSetDomain.ts`
- `app/docsera-ui/src/server/workspaces/serviceNowWorkspaceChangeSetPersistence.ts`
- `app/docsera-ui/src/server/api/docsera-runtime-workspace-pending-changes.ts`
- `app/docsera-ui/src/server/api/docsera-runtime-workspace-publish.ts`
- `app/docsera-ui/src/server/api/docsera-runtime-workspace-discard-all.ts`
- `app/docsera-ui/src/server/api/docsera-runtime-workspace-discard-page.ts`
- `app/docsera-ui/src/server/api/docsera-runtime-workspace-edit-lease.ts`
- `app/docsera-ui/src/fluent/tables/docsera-workspace-change-set.now.ts`, `docsera-workspace-change-entry.now.ts`, `docsera-workspace-snapshot-set.now.ts`, `docsera-workspace-page-snapshot.now.ts`, `docsera-workspace-removal-batch.now.ts`, `docsera-workspace-removal-member.now.ts`, and `docsera-workspace-mutation-claim.now.ts`

Focused verification evidence is in `app/docsera-ui/src/server/workspaces/workspaceChangeSetDomain.test.ts`, `serviceNowWorkspaceChangeSetPersistence.test.ts`, `app/docsera-ui/src/server/api/docsera-runtime-mutation-routes.test.ts`, `app/docsera-ui/src/server/workspace-leases/workspaceEditLeaseService.test.ts`, and `app/docsera-ui/src/client/app/App.publishingChanges.test.tsx`.

This reference is grounded in the current source and focused tests listed above.
