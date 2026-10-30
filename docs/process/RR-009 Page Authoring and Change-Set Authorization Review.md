# RR-009 — Page Authoring and Change-Set Authorization Review

Date: 2026-10-30  
Status: evidence-only source and test review; no instance, application, or runtime metadata was changed

## Scope and conclusion

This review traced the supported page-authoring and workspace change-set REST routes through workspace resolution, current-user capability evaluation, edit-lease validation, generation validation, and `serviceNowWorkspaceChangeSetPersistence`. It also inspected the page-list projection boundary, body-save recovery route, and legacy page publish/delete routes.

**Conclusion: no material authorization, stale-generation, or cross-workspace substitution defect was established. No code change is recommended.**

The write routes do not treat a supplied workspace, page, parent, change-set id, or revision as authority. The shared lease service resolves the workspace from the supplied sys_id or slug, requires the caller to have Edit or Admin capability on that exact record, verifies the lease token against both the current user and that workspace, and returns the server's active change-set generation. Each ordinary mutation additionally requires the caller's expected generation pair; persistence reloads the workspace state and uses its workspace-scoped projection to select pages and parents. A stale, replaced, expired, cross-user, or cross-workspace lease cannot reach a mutation.

This conclusion concerns the supported scoped REST API and server services. It does not assert installed-instance ACL configuration, direct table API behavior, or the separately scoped full edit-lease lifecycle review.

## Route/control matrix

| REST operation | Workspace and capability control | Lease / generation control | Page and cross-workspace control | Result of unauthorized, stale, or substituted input |
| --- | --- | --- | --- | --- |
| `GET /pages?mode=live` | `serviceNowPageListing` resolves the slug and requires `canViewWorkspace`. | None by design. | Persistence loads the resolved workspace's live projection. | No draft projection is returned; unauthorized viewer receives 403. |
| `GET /pages?mode=edit` | Same resolver, requiring Edit or Admin capability. | No lease requirement on this projection endpoint. | The requested mode is passed only after authorization; persistence loads pages using the resolved workspace sys_id. | Draft/pending page content is denied to a view-only caller. This is accepted authoring-read behavior, not a pending-change route. |
| `POST /pages` | Shared lease resolution requires Edit/Admin on the exact resolved workspace. | Held lease is renewed; `expectedChangeSetId` and non-negative `expectedChangeSetRevision` are required. | `parentPageSysId` enters the workspace's loaded edit state; a non-member parent cannot form a valid hierarchy. | Wrong workspace/token fails before creation; stale generation is rejected; invalid parent fails in the state operation. |
| `PATCH /pages` body save | Same Edit/Admin workspace resolution. | Renewed held lease plus client generation; persistence uses it for its mutation-generation key and state transition. | Page is selected from `loaded.pageRecords`, which were queried for the resolved workspace; sys_id/slug must identify that scoped page. | Foreign page sys_id or slug is not found; stale generation fails rather than mutating current state. |
| `PUT /pages` settings | Same Edit/Admin workspace resolution. | Renewed held lease plus expected generation. | Settings target is found only in workspace-scoped loaded page records; edit projection used for slug validation is also scoped. | Foreign sys_id is 404; stale generation fails. |
| `POST /pages/move` | Same Edit/Admin workspace resolution. | Renewed held lease plus expected generation. | Both target and proposed parent are evaluated through the loaded workspace state and `movePage`. | Foreign target/parent cannot be moved into the workspace; invalid hierarchy/state is rejected. |
| `POST /pages/delete` | Same Edit/Admin workspace resolution. | Renewed held lease plus expected generation. | Target/subtree is collected from the resolved workspace's edit projection before record changes. | Foreign page is not found; only the selected workspace's projected subtree is eligible. |
| `POST /workspaces/pending-changes` | `validateHeld` resolves the workspace and requires Edit/Admin. | Requires the current user's unexpired held token and active server generation, but intentionally does not renew it or accept mutation authority. | `pendingChanges(workspace)` loads the resolved workspace state. | A caller without authoring authority or a valid same-workspace lease cannot read pending entries. |
| `POST /workspaces/publish` | Same Edit/Admin workspace resolution. | Renewed held lease plus expected generation; command id is validated. | Publish loads the resolved workspace state/foundation and writes selectors/snapshots for that workspace id. | Stale authority fails; another workspace's change-set id cannot select a publish target. |
| `POST /workspaces/discard-page` | Same Edit/Admin workspace resolution. | Renewed held lease plus expected generation. | `pageSysId` is categorized and discarded from the resolved workspace state only. | Foreign/no-pending page fails; stale generation fails. |
| `POST /workspaces/discard-all` | Same Edit/Admin workspace resolution. | Renewed held lease plus expected generation and validated command id. | State, snapshot, successor change set, and reconciliation use the loaded workspace sys_id. | Cross-workspace or stale request cannot discard another workspace's changes. |
| `POST /workspaces/recover-body-save` | Same Edit/Admin workspace resolution. | Renewed held lease; deliberately no client generation or body/page authority is accepted. | Recovery finds only the active generation claim whose `workspaceId` equals the loaded workspace, then replays its server-owned payload. | A valid lease for another workspace cannot recover this workspace's claim; active/non-body claims are not replayed. |

## Supporting evidence

### Shared authoring authority boundary

`api/docsera-runtime-workspace-edit-lease.ts` supplies the common boundaries used by every reviewed write route. `verifyWorkspaceEditLease` calls lease-service `renew`; `readWorkspaceMutationAuthority` rejects a missing/invalid expected generation and returns only the supplied pair after the lease service has reported the current held generation. The pending-change read instead calls `validateWorkspaceEditLeaseForRead`, which verifies the held lease without heartbeat mutation and does not construct mutation authority.

`workspace-leases/workspaceEditLeaseService.ts` is the decisive identity/capability binding. Its `context` loads by supplied sys_id when present (otherwise slug), rejects a provided slug that does not match that record, obtains the current user from the service dependency, and requires `canEditWorkspace || canAdminWorkspace` on the resolved workspace. `validateHeld` and `renew` then require the token digest, holder user sys_id, workspace key, and non-expired lease to match. `serviceNowWorkspaceEditLeases.ts` supplies the production current user (`gs.getUserID`), capability evaluator, and active-generation lookup; the latter verifies that the selected active change set belongs to the workspace and is active.

Consequently, a request combining a lease for workspace A with workspace B's slug/sys_id fails during lease context resolution. A request supplying both references with different identities likewise fails before route-local `loadWorkspace` or persistence is used. The route-local loaders repeat the sys_id-preferred and slug-consistency check before calling persistence.

### Scoped persistence selection and generation control

`workspaces/serviceNowWorkspaceChangeSetPersistence.ts` loads workspace state from the route-resolved workspace. `loadWorkspaceState` checks that its active change set and selected snapshot both belong to that workspace, and `listWorkspacePageRecords` queries page rows with `workspace = workspaceSysId`. The edit/live projection therefore begins from a workspace-bounded record set.

The body and settings saves locate a target solely in `loaded.pageRecords`. Delete collects its subtree from the resolved edit projection. Move applies the target and parent through the loaded change-set state. Create passes its parent id into the same state operation. Discard-page derives the pending category from that state. Publish/discard-all construct and validate state, snapshots, claims, selector changes, and successor change sets using the loaded workspace sys_id. The few low-level persistence helpers that take a page sys_id directly are reached only after those higher-level scoped selections; they are not REST-facing authorization boundaries.

Each ordinary write uses `buildMutationGenerationKey(input.authority)` and validates/reloads the current state. Persisted claims bind their workspace id, change-set id/revision, target page, and operation payload. Reuse of the same generation for a different operation/target/payload returns the stale-generation path rather than applying the substituted command. This is concurrency integrity as well as a guard against change-set reference substitution.

### Live, Edit, and pending-content reads

`pages/serviceNowPageListing.ts` resolves the workspace by slug, evaluates the current user's capability on that exact record, and permits Edit projection only to an Editor/Admin. Live projection requires `canViewWorkspace` and calls persistence with `"live"`; it therefore exposes the reader-facing published projection rather than pending draft content. The `serviceNowPageListing.test.ts` cases explicitly cover edit-mode denial and live published-only loading.

Pending-change reads are stricter than Edit page listing: `api/docsera-runtime-workspace-pending-changes.ts` requires the exact caller's held lease and active generation before it loads `pendingChanges(workspace)`. It does not accept a change-set id from the request. A valid reader or Editor without the matching current lease therefore cannot obtain the pending-change read model through this route.

### Abandoned body-save recovery

`processBodySaveRecovery` in `api/docsera-runtime-page-save.ts` first performs the normal held-lease renewal and route workspace resolution. It intentionally has no request page, document, owner, or generation field. `recoverAbandonedBodySave` reloads the workspace state, computes the active server authority, and accepts a claim only when that claim's stored workspace id equals the loaded workspace. It refuses non-body claims and claims whose executor has not expired; the resumed save is constructed entirely from the durable claim payload.

The persistence tests cover recovery of an expired body claim, no-op resolution of finalized/no claim state, refusal of a non-body claim, and concurrent recovery finalizing once. This route is appropriately bounded for its purpose; its omission of a client expected-generation field is an accepted recovery design, not a stale-authority bypass.

### Supporting regression evidence

- `workspace-leases/workspaceEditLeaseService.test.ts` covers denied authoring capability, revoked-holder renewal, exactly-one-holder behavior, expiry/takeover, wrong user, invalid token, replacement token, and wrong-workspace token validation. It also verifies read validation does not renew the lease.
- `pages/serviceNowPageListing.test.ts` covers denied edit projection and live published-only projection.
- `workspaces/serviceNowWorkspaceChangeSetPersistence.test.ts` covers stale-generation rejection, foreign/nonexistent hierarchy targets, page mutation claims, page-scoped discard, publish/discard recovery, and body-save recovery replay/concurrency. The persistence suite exercises the workspace-state operation layer; it deliberately does not replace the route/lease authorization tests.

### Legacy routes

The registered REST definition in `src/fluent/rest-api/docsera-runtime.now.ts` retains two legacy-compatible paths but they do not mutate state. `api/docsera-runtime-page-publish.ts` always returns HTTP 405 (`publish_unavailable`), and `api/docsera-runtime-page-delete.ts` always returns HTTP 405 directing callers to the POST action route. The active deletion route is `POST /pages/delete`, which uses the shared lease and authority boundary; workspace-wide publishing is available only through `POST /workspaces/publish` with the same boundary. No alternate page publish or deletion mutation path was found.

## Findings

| Classification | Finding | Evidence and disposition |
| --- | --- | --- |
| None / no material defect | No confirmed unauthorized pending-content read, page mutation, publish, discard, or body-save recovery across workspaces. | Capability evaluation, holder/token/workspace binding, active generation validation, workspace-scoped projection, and claim/workspace validation all precede or constrain the relevant persistence operations. No code change recommended. |
| None / no material defect | No confirmed stale or substituted change-set mutation. | Ordinary writes require the expected generation pair and are guarded by state/claim generation validation. Recovery deliberately reconstructs authority only from the active server-owned claim after held-lease validation. |
| Accepted behavior | An Edit-authorized user may load the edit page projection without presenting a lease. | `GET /pages?mode=edit` is an authoring read, gated by Editor/Admin capability. It does not expose the pending-change read model, and no accepted requirement states that a read-only edit projection must require the exclusive editing lease. |
| Informational limitation | Source evidence cannot prove deployed ACL/REST configuration equivalence. | No PDI operations, deployment, authentication probes, or mutation probes were authorized for this review. This is not a source-established defect. |

## Recommendation

**No code change.** Preserve the existing shared lease/mutation-authority boundary and workspace-scoped persistence selection. Future changes to a reviewed route should retain its current order: resolve workspace and current-user capability, validate held lease, validate generation when mutating, then select page/change-set state only from that resolved workspace.

The separate lease-lifecycle review should evaluate acquire/resume/renew/release/session-recovery and token handling in depth. Direct table/ACL and installed-runtime verification should remain a separately authorized investigation.
