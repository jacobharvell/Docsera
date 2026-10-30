# RR-010 Workspace Edit-Lease Lifecycle Security Review

**Review date:** 2026-10-30  
**Scope:** Workspace Edit-lease acquire, resume, renew, release, status, and end-previous-session paths.  
**Method:** Static, evidence-only review of the scoped server implementation, declared ServiceNow metadata, and focused tests. No PDI/browser probes, impersonation, deployment, or mutation was performed.

## Executive summary

No material security defect was established in the reviewed Edit-lease lifecycle. The server resolves the target workspace, current ServiceNow user, and current workspace capability on every operation. A held lease additionally requires the same current user and SHA-256 digest of the supplied lease verifier. Lease-row mutations re-check the exact row identity, workspace key, holder, and digest before updating or deleting. A unique `workspace_key` index serializes competing acquisitions.

The design deliberately treats the verifier as a short-lived, user-bound bearer credential rather than as a server-verifiable browser-tab identity. Same-tab reload resume and duplicate-tab exclusion are client coordination behavior; they are not an additional server authorization factor. A copied verifier in another authenticated session for the same user is therefore a theoretical same-user credential-replay condition, not evidence that another user can take a lease. No code change is recommended from this review.

## Scope and evidence boundaries

Primary sources reviewed:

- `app/docsera-ui/src/server/workspace-leases/workspaceEditLeaseService.ts`
- `app/docsera-ui/src/server/workspace-leases/serviceNowWorkspaceEditLeases.ts`
- `app/docsera-ui/src/server/workspace-leases/serverWorkspaceEditLeaseDomain.ts`
- `app/docsera-ui/src/server/api/docsera-runtime-workspace-edit-lease.ts`
- `app/docsera-ui/src/fluent/rest-api/docsera-runtime.now.ts`

Supporting control evidence reviewed:

- `app/docsera-ui/src/fluent/tables/docsera-workspace-edit-lease.now.ts`
- `app/docsera-ui/src/fluent/security/docsera-workspace-foundation-table-access.now.ts`
- `app/docsera-ui/src/server/workspaces/serviceNowWorkspaceCapabilities.ts`
- `app/docsera-ui/src/server/workspaces/serverWorkspaceDomain.ts`
- `app/docsera-ui/src/server/scheduled-scripts/docsera-workspace-edit-lease-cleanup.js`
- `app/docsera-ui/src/client/app/App.tsx` and `workspaceLeaseCoordination.ts`, only to assess documented same-tab/duplicate-tab behavior and client token residence.
- Focused service and route tests cited below.

This review can prove the checked-in implementation and declared metadata. It cannot prove live instance REST authentication, ServiceNow session-expiration enforcement, deployed ACL behavior, or whether a different deployment has modified the generated metadata. Those are platform/runtime verification boundaries, not established weaknesses in this source review.

## Authorization model

`context()` is the common authorization gate. It derives the user from the server (`getCurrentUser`), loads the workspace by a supplied sys_id or slug, rejects a conflicting slug/sys_id pair, and requires current edit or admin capability before the lifecycle method proceeds ([`workspaceEditLeaseService.ts:41`](../../app/docsera-ui/src/server/workspace-leases/workspaceEditLeaseService.ts#L41)). The ServiceNow adapter obtains that user from `gs.getUserID()` and computes capability from the current server session, role membership, and workspace group membership ([`serviceNowWorkspaceEditLeases.ts:34`](../../app/docsera-ui/src/server/workspace-leases/serviceNowWorkspaceEditLeases.ts#L34); [`serviceNowWorkspaceCapabilities.ts:27`](../../app/docsera-ui/src/server/workspaces/serviceNowWorkspaceCapabilities.ts#L27)).

Capability evaluation requires either the Docsera admin role, or the appropriate role *and* membership in that workspace's configured group; editor capability inherits admin capability ([`serverWorkspaceDomain.ts:605`](../../app/docsera-ui/src/server/workspaces/serverWorkspaceDomain.ts#L605)). This is re-evaluated for acquire, resume, renew, release, status, and end-previous-session. A user whose workspace membership is revoked cannot renew, release, inspect status, or terminate the lease through these endpoints; a focused test specifically covers revoked-holder renewal ([`workspaceEditLeaseService.test.ts:93`](../../app/docsera-ui/src/server/workspace-leases/workspaceEditLeaseService.test.ts#L93)).

The six registered POST routes are only thin action adapters and all use the common REST processor: acquire, resume, renew, release, end-previous-session, and status ([`docsera-runtime.now.ts:158`](../../app/docsera-ui/src/fluent/rest-api/docsera-runtime.now.ts#L158); [`docsera-runtime-workspace-edit-lease.ts:35`](../../app/docsera-ui/src/server/api/docsera-runtime-workspace-edit-lease.ts#L35)). Client-supplied holder or actor identity is never an input to the processor.

## Operation/control matrix

| Operation | Server authorization and credential controls | Workspace/cross-user control | Record/race control | Evidence and conclusion |
| --- | --- | --- | --- | --- |
| Acquire | Runs common context gate and verifies active change-set generation before examining or creating a lease. A supplied verifier resumes only if it matches the current user and unexpired row. Otherwise a new verifier is generated. | Workspace is resolved server-side; supplied slug must agree with resolved sys_id. A foreign user receives `locked`, not a holder verifier. | Deletes only an exact expired observation, then inserts under unique `workspace_key`; an insert conflict reloads the winner. | [`workspaceEditLeaseService.ts:62`](../../app/docsera-ui/src/server/workspace-leases/workspaceEditLeaseService.ts#L62), [`docsera-workspace-edit-lease.now.ts:22`](../../app/docsera-ui/src/fluent/tables/docsera-workspace-edit-lease.now.ts#L22), service tests at [`:59`](../../app/docsera-ui/src/server/workspace-leases/workspaceEditLeaseService.test.ts#L59) and [`:117`](../../app/docsera-ui/src/server/workspace-leases/workspaceEditLeaseService.test.ts#L117). No unauthorized acquisition established. |
| Resume | Is an alias of `renew`; it requires a non-empty verifier, common context gate, current user + digest match, unexpired row, then exact touch. | A token from another user or workspace fails `matches` or context. | Exact touch verifies sys_id, workspace key, holder user, and digest immediately before update. | [`workspaceEditLeaseService.ts:91`](../../app/docsera-ui/src/server/workspace-leases/workspaceEditLeaseService.ts#L91), [`:117`](../../app/docsera-ui/src/server/workspace-leases/workspaceEditLeaseService.ts#L117), adapter at [`serviceNowWorkspaceEditLeases.ts:57`](../../app/docsera-ui/src/server/workspace-leases/serviceNowWorkspaceEditLeases.ts#L57). No improper resume established. |
| Renew | Same requirements as resume; capability is checked again before touch. A stale, absent, wrong-user, or wrong-digest lease is returned as lost. | Permission removal causes 403 before the row is touched. | Failed exact touch becomes lost, so a replaced/deleted row is not revived. | [`workspaceEditLeaseService.ts:91`](../../app/docsera-ui/src/server/workspace-leases/workspaceEditLeaseService.ts#L91); tests at [`:93`](../../app/docsera-ui/src/server/workspace-leases/workspaceEditLeaseService.test.ts#L93), [`:105`](../../app/docsera-ui/src/server/workspace-leases/workspaceEditLeaseService.test.ts#L105), and [`:191`](../../app/docsera-ui/src/server/workspace-leases/workspaceEditLeaseService.test.ts#L191). No stale-holder renewal established. |
| Release | Requires common context, a verifier, current user + digest match, and a non-expired lease. | A different current user cannot match the holder even with a verifier. | Exact delete verifies sys_id, workspace key, holder, and digest. | [`workspaceEditLeaseService.ts:100`](../../app/docsera-ui/src/server/workspace-leases/workspaceEditLeaseService.ts#L100); [`serviceNowWorkspaceEditLeases.ts:58`](../../app/docsera-ui/src/server/workspace-leases/serviceNowWorkspaceEditLeases.ts#L58); test at [`workspaceEditLeaseService.test.ts:59`](../../app/docsera-ui/src/server/workspace-leases/workspaceEditLeaseService.test.ts#L59). No improper release established. |
| Status | Runs common context and active-generation checks. It does not require a token to reveal locked/unlocked state, but reports `held` only for the current user plus matching verifier. | Unauthorized users fail context; a foreign user cannot receive a verifier or observed lease ID. | Read only; expiry is evaluated from server time. | [`workspaceEditLeaseService.ts:124`](../../app/docsera-ui/src/server/workspace-leases/workspaceEditLeaseService.ts#L124); status response omits plaintext verifier at [`docsera-runtime-workspace-edit-lease.ts:15`](../../app/docsera-ui/src/server/api/docsera-runtime-workspace-edit-lease.ts#L15); route test at [`docsera-runtime-workspace-edit-lease.test.ts:89`](../../app/docsera-ui/src/server/api/docsera-runtime-workspace-edit-lease.test.ts#L89). No authorization bypass established. |
| End previous session | Requires common context and a client-provided observed row ID. The loaded row must have that exact ID and the current user must equal its holder before delete. | The observed row ID is disclosed only to the same holder; other users receive no observed ID and fail the holder equality check if they guess one. | Exact delete also verifies workspace key, holder, and digest read from the current row; replacement races return lost. | [`workspaceEditLeaseService.ts:107`](../../app/docsera-ui/src/server/workspace-leases/workspaceEditLeaseService.ts#L107); holder shaping at [`serverWorkspaceEditLeaseDomain.ts:31`](../../app/docsera-ui/src/server/workspace-leases/serverWorkspaceEditLeaseDomain.ts#L31); service/route tests at [`workspaceEditLeaseService.test.ts:70`](../../app/docsera-ui/src/server/workspace-leases/workspaceEditLeaseService.test.ts#L70) and [`docsera-runtime-workspace-edit-lease.test.ts:45`](../../app/docsera-ui/src/server/api/docsera-runtime-workspace-edit-lease.test.ts#L45). No cross-user termination established. |

## Token and response exposure review

The ServiceNow adapter creates a 48-character secure random verifier using `GlideSecureRandomUtil.getSecureRandomString(48)` and persists only `GlideDigest().getSHA256Hex(verifier)` ([`serviceNowWorkspaceEditLeases.ts:34`](../../app/docsera-ui/src/server/workspace-leases/serviceNowWorkspaceEditLeases.ts#L34)). The schema caps the digest at the SHA-256 hex length of 64 ([`docsera-workspace-edit-lease.now.ts:15`](../../app/docsera-ui/src/fluent/tables/docsera-workspace-edit-lease.now.ts#L15)). Equality is evaluated over the server-derived current user and digest, not by comparing a client holder field ([`workspaceEditLeaseService.ts:35`](../../app/docsera-ui/src/server/workspace-leases/workspaceEditLeaseService.ts#L35)).

The plaintext verifier is returned only in successful held acquire/resume/renew responses. It is explicitly omitted from status responses ([`docsera-runtime-workspace-edit-lease.ts:15`](../../app/docsera-ui/src/server/api/docsera-runtime-workspace-edit-lease.ts#L15)), and no API response returns a stored digest. A lock response exposes `observedLeaseId` only when the requester is already the current holder; for another holder it may expose holder user ID/display data but not the observed record ID ([`serverWorkspaceEditLeaseDomain.ts:31`](../../app/docsera-ui/src/server/workspace-leases/serverWorkspaceEditLeaseDomain.ts#L31); [`docsera-runtime-workspace-edit-lease.test.ts:45`](../../app/docsera-ui/src/server/api/docsera-runtime-workspace-edit-lease.test.ts#L45)).

The client stores the plaintext verifier with its tab-session identity in same-origin `sessionStorage`, not `localStorage` ([`App.tsx:439`](../../app/docsera-ui/src/client/app/App.tsx#L439); [`App.tsx:485`](../../app/docsera-ui/src/client/app/App.tsx#L485)). This is appropriate for reload recovery but means the verifier is not protected from same-origin script execution. That is a normal bearer-token/XSS limitation, not a distinct authorization bypass: the server also requires the current ServiceNow user and current workspace capability. Client diagnostics record only a token fingerprint, with test coverage for token redaction ([`client.ts:1823`](../../app/docsera-ui/src/client/platform/servicenow/client.ts#L1823); [`diagnostics.test.ts:51`](../../app/docsera-ui/src/client/diagnostics.test.ts#L51)).

## Lifecycle, expiration, and concurrency

The heartbeat interval is 60 seconds and stale threshold is five minutes ([`serverWorkspaceEditLeaseDomain.ts:1`](../../app/docsera-ui/src/server/workspace-leases/serverWorkspaceEditLeaseDomain.ts#L1)). Expiration is evaluated with ServiceNow date values; invalid timestamps fail closed as expired ([`serviceNowWorkspaceEditLeases.ts:12`](../../app/docsera-ui/src/server/workspace-leases/serviceNowWorkspaceEditLeases.ts#L12)). A later authorized editor can take over only after expiry. The previous verifier cannot renew after takeover ([`workspaceEditLeaseService.test.ts:105`](../../app/docsera-ui/src/server/workspace-leases/workspaceEditLeaseService.test.ts#L105)). The scheduled cleanup uses the same stale cutoff and exact sys_id/workspace/last-seen predicates before deleting ([`docsera-workspace-edit-lease-cleanup.js:1`](../../app/docsera-ui/src/server/scheduled-scripts/docsera-workspace-edit-lease-cleanup.js#L1)).

The acquire race is handled at two layers: the unique workspace-key index prevents two durable holders, and a loser of a conflicting insert reloads the durable winner and returns locked. The stale-row deletion predicate includes the observed sys_id, workspace key, and last-seen value; if a concurrent renew changed the row, deletion misses and acquisition returns locked rather than deleting a live holder ([`workspaceEditLeaseService.ts:70`](../../app/docsera-ui/src/server/workspace-leases/workspaceEditLeaseService.ts#L70); [`serviceNowWorkspaceEditLeases.ts:45`](../../app/docsera-ui/src/server/workspace-leases/serviceNowWorkspaceEditLeases.ts#L45); [`workspaceEditLeaseService.test.ts:117`](../../app/docsera-ui/src/server/workspace-leases/workspaceEditLeaseService.test.ts#L117)). Renew and release use equivalent exact-record checks. These controls address realistic observe-then-replace/renew/delete races without trusting a stale client observation.

## Same-tab resume and duplicate-tab exclusion

The server supports same-tab resume as the normal verifier-and-user-bound renew operation; it does not accept an anonymous or token-only resume. The client retains `{ tabSessionId, token }` in session storage, maintains a tab identity in `window.name`, and only attempts automatic resume when the stored identity matches. It also probes an active same-origin `BroadcastChannel` responder; a response from a distinct active runtime blocks resume, while a reload with no active responder may resume ([`App.tsx:403`](../../app/docsera-ui/src/client/app/App.tsx#L403); [`App.tsx:3556`](../../app/docsera-ui/src/client/app/App.tsx#L3556); [`workspaceLeaseCoordination.ts:38`](../../app/docsera-ui/src/client/app/workspaceLeaseCoordination.ts#L38)).

This is correct as a UX/exclusivity layer for ordinary same-browser duplicate tabs. It is not a cryptographic browser-session binding at the server. A same user who deliberately copies a live verifier into another authenticated same-user context could use it until expiry or revocation. That requires access to the verifier plus that user's authenticated ServiceNow session and does not let an unauthorized user, a user whose workspace capability was revoked, or another workspace use the verifier. It is therefore recorded as an accepted bearer-credential property/theoretical edge case, not a confirmed vulnerability.

## Findings

### Confirmed vulnerabilities

None.

### Accepted lifecycle behavior

- **Same-user verifier portability (informational):** The server binds the lease to ServiceNow user + verifier + workspace, not to a browser-tab ID. This is necessary for intended reload resume and is bounded by the five-minute stale interval, server-side capability re-evaluation, and verifier invalidation on replacement/release. No evidence shows a different user can exploit it.
- **Lock-state holder information (informational):** A current authorized editor can learn that another user holds the lease and may receive that holder's display name/user sys_id. This supports the documented lock UX. The sensitive observed lease record ID is restricted to the current holder.

### Verification limitations, not findings

- **ServiceNow session expiry:** Source proves request-time identity is obtained from `gs.getUserID()` and rejects missing identity. Whether an expired platform credential reaches a scoped REST processor is a ServiceNow runtime behavior that was intentionally not probed.
- **Deployed metadata:** The source declares package-private, no-web-service table access and deny-unless CRUD ACLs ([`docsera-workspace-edit-lease.now.ts:4`](../../app/docsera-ui/src/fluent/tables/docsera-workspace-edit-lease.now.ts#L4); [`docsera-workspace-foundation-table-access.now.ts:4`](../../app/docsera-ui/src/fluent/security/docsera-workspace-foundation-table-access.now.ts#L4)). This review did not assert those controls on an instance.

## Recommendation

**Recommend no code change.** The reviewed implementation has the required user, workspace, token, expiration, and exact-record controls for the stated threat cases. Keep the focused service and REST tests intact. If a future requirement demands cryptographic distinction between two authenticated sessions of the same user, treat that as a product/security-design change rather than a patch to this lifecycle; it would alter accepted same-tab recovery behavior and needs an explicit session-binding design and PDI validation.

## Validation recorded for this review

- `npm run ensure:task-worktree -- --task-branch release/batch-g1-security-reliability --original-base 33277313d64aa5ea14c1d1293a48f2ede1c9c057 --expected-head 866c6adf681f3ed47e9907f920ee274be5303a0c --mode continuation` — passed before inspection.
- Task-specific documentation validation and diff hygiene are run after this report is added.
- Intentionally not run: SDK builds, application test suites, PDI/browser testing, deployment, impersonation, or mutation probes (out of scope).
