# RR-005 — Privileged Provisioning Queue Access Review

Date: 2026-10-30
Status: evidence-only review; no instance or application changes made

## Scope and conclusion

The workspace provisioning request table (`x_82900_docsera_workspace_provision_request`) is a privileged command queue. A successful `requested` insert invokes a Global async worker which can create Docsera access groups, assign the Docsera workspace roles to those groups, and create a workspace record.

The installed PDI metadata exposes a concerning combination: the table has public application access, `read_access=true`, `update_access=true`, and `ws_access=true`; the review found no installed table or field ACL for this table and no source-controlled queue deny ACL. This is sufficient to establish an incomplete defense-in-depth boundary, but it is **not** sufficient to establish that an ordinary authenticated non-Admin can read, create, or update a row through the Table API. Application access, cross-scope privileges, Table API/web-service exposure, and user ACL evaluation are distinct mechanisms.

**Finding classification: suspected security defect; High severity if ordinary-user queue mutation is permitted.** The missing effective-user test is the material evidence gap. If only direct reads are permitted, the impact is lower (request metadata disclosure) but still contradicts the server-owned queue model. RR-004's accepted status-endpoint correction remains out of scope and was not reopened.

## Source-controlled evidence

### Intended paths

| Actor/path | Source evidence | Intended access |
| --- | --- | --- |
| Docsera Admin calling `POST /workspaces` | `docsera-runtime-create-workspace.ts` checks `canCurrentUserCreateWorkspaces()`; the capability requires `x_82900_docsera.docsera_admin`. | The only supported human-facing command path. |
| Scoped server writer | `serviceNowWorkspaceProvisioning.ts` validates/canonicalizes a draft, resolves `gs.getUserID()` itself, then inserts one request with `state=requested`. | Internal queue creation only. |
| Global async worker | `docsera-workspace-provision-request-worker.now.ts` is insert-only and filters `state=requested`; it invokes `DocseraGlobalWorkspaceProvisioningBridge`. | Read/update queue rows and perform privileged Global operations. |
| Scoped status polling | `docsera-runtime-workspace-provisioning-status.ts` checks the same Docsera Admin capability before parsing an ID or reading a request. | Supported polling path; RR-004 control. |

No runtime source path uses the direct Table API for queue reads or writes. The repository's direct table calls are server `GlideRecord` operations in the scoped service and Global worker. Some verifier/reset scripts use table APIs, but those are operator/test tooling, not supported product functionality. Direct Table API access is therefore not required by the supported Docsera workflow.

### Queue and cross-scope declarations

`docsera-workspace-provision-request.now.ts` declares:

- `actions: ["read", "update"]`;
- `allowWebServiceAccess: true`; and
- no source declaration restricting generic user/table access.

The Global companion declares allowed Global-to-scoped `read` and `write` `sys_db_object` privileges for this table in `docsera-workspace-provisioning-queue-access.now.ts`. Those privileges are required for the Global worker; they do not grant ordinary users access.

The scoped foundation security file deliberately supplies deny-unless, `adminOverrides: false`, `return false;` ACLs for the membership mutation command table and several other server-owned tables. It contains no corresponding ACLs for the provisioning request table. The membership command table also declares `allowWebServiceAccess: false`, unlike this queue.

## Installed PDI evidence (read-only)

Queries used the existing `@servicenow/sdk query` connection and did not read queue rows or create, update, delete, deploy, or export anything.

| Subject | Installed evidence | Interpretation limit |
| --- | --- | --- |
| Table definition | One `sys_db_object` row: `access=public`, `create_access=false`, `read_access=true`, `update_access=true`, `delete_access=false`, `ws_access=true`, and no superclass. | This confirms installed application-access/web-service metadata. It does not decide a user's ACL result. |
| Queue ACLs | Direct query for ACL names beginning `x_82900_docsera_workspace_provision_request` returned zero rows. A query of all active ACLs in the Docsera scope showed deny ACLs for comparable workflow/command tables but none for this queue. | No installed table-level or field-level queue ACL was found by those queries. This does not prove there is no unrelated platform/global ACL affecting evaluation. |
| ACL role bindings | Query for bindings of queue-named ACLs returned zero rows. | There are no queue ACL role bindings because no queue ACL rows were returned. |
| Cross-scope privileges | Two installed, allowed `sys_scope_privilege` rows have `source_scope=global`, target the queue in `x_82900_docsera`, and allow `read` and `write`. | Confirms the Global worker's cross-scope bridge permission, not end-user authorization. |
| Global bridge | Installed active, package-private `global.DocseraGlobalWorkspaceProvisioningBridge` Script Include was found. | Confirms the bridge exists. A query for a specifically named installed Business Rule returned no row, so this review does not claim installed-worker metadata was independently confirmed. |

The PDI metadata was queried through an administrator-configured SDK connection. It must not be interpreted as an ordinary-user Table API result.

## Authorization boundary assessment

### Read exposure

The direct status REST operation is role-gated in source, but `ws_access=true` leaves a separate direct Table API surface. With `read_access=true` and no identified queue ACL, ordinary-user read access is a realistic concern, especially because request rows contain workspace/group names, requesting-user reference, state, error data, and resulting record references. Effective read access remains unproven without a non-Admin session test.

### Write and command injection exposure

The installed table metadata does not advertise cross-scope create access (`create_access=false`), but that setting is not evidence that a direct Table API caller fails user ACL authorization. The requested queue row is the worker trigger: the Global Business Rule is insert-only and filters `state=requested`.

The worker's independent checks reduce, but do not eliminate, the impact of an untrusted queued command:

- it claims only a `requested` row before processing;
- it requires a nonempty `requested_by`, valid workspace name/slug/group-key shape, and exact derived `Docsera_<key>_Admins`/`Editors` names;
- it prevents duplicate group names, assigns only the two fixed Docsera roles, and rolls back groups/workspace on failure;
- it does **not** check that `requested_by` exists, that the requester is the authenticated queue writer, or that the requester has `docsera_admin`; and
- it creates no automatic user-to-group membership.

Thus, a forged accepted row is constrained rather than arbitrary code execution or immediate group membership escalation. It could still cause privileged creation of Docsera-named role-bearing groups and workspace records, request metadata spoofing, collision/denial-of-service effects, and potentially misleading ownership/audit state. The control that must prevent this is untrusted mutation of the queue itself; the Global worker is intentionally a processor, not the end-user authorization boundary.

An update to an existing request does not itself meet the installed source worker's insert trigger. It can nevertheless be material if an attacker can alter a newly inserted `requested` row before asynchronous processing, or if another installed rule/path differs from the active source. This race and any unsupported installed metadata are not proven here.

## Minimum justified correction proposal

Because no supported feature needs direct Table API access and the queue reaches privileged Global operations, the smallest defensible correction is to make the queue server-owned in source control:

1. Set `allowWebServiceAccess: false` on the provisioning-request table.
2. Add source-controlled table-level deny-unless ACLs for `create`, `read`, `write`, and `delete`, with `adminOverrides: false` and a false script, following the existing membership-command pattern.
3. Before deployment, verify the legitimate scoped server writer, Global worker (including its installed cross-scope read/write privileges), and role-gated status route still operate. Do not assume how ACL evaluation applies to these server-side paths; prove it in the approved remediation task.

Both measures are warranted: web-service disablement removes the direct API surface, while deny ACLs provide a user-authorization backstop against direct generic access and future exposure changes. This is a proposal only; RR-005 made no metadata change.

## Narrow manual user-context checks for Jacob

No browser testing, impersonation, queue probe, or user-context test was performed in this review. If Jacob authorizes a follow-up validation, use a pre-existing ordinary authenticated user with no Admin or Docsera Admin role and perform only this read-only check:

1. Call the direct Table API list endpoint for the queue with `sysparm_limit=1` and `sysparm_fields=sys_id`; record only HTTP status and returned row count, not identifiers or payloads.
2. Separately call the role-gated provisioning-status REST endpoint with a syntactically valid but nonexistent request ID; record status only.
3. Do not POST, PATCH, PUT, DELETE, replay, or modify a queue row. A write-authority conclusion cannot be made from this non-destructive check; it requires a separately approved controlled test plan.

After a remediation is installed, repeat step 1. The expected result is denial before queue data is returned. The status endpoint result must continue to match its accepted RR-004 authorization behavior.

## Unresolved evidence gaps

- No ordinary-user effective ACL/Table API test was authorized or performed.
- No queue-row data was read, so no existing state or race window was inspected.
- The installed Global Script Include was confirmed, but the queried Business Rule name did not return a row; this report does not infer why.
- No exhaustive review of unrelated/global ACL inheritance or all REST operations was performed.
