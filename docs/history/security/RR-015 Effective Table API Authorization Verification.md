# RR-015 — Effective Table API Authorization Verification

Date: 2026-10-30
Status: prepared protocol; awaiting Jacob's live PDI execution

## Purpose and boundary

This is a read-only, user-context qualification of direct ServiceNow Table API authorization. It closes the evidence gap identified by RR-011: installed table and ACL metadata do not prove what the ACL engine returns to an authenticated limited-permission caller. It does **not** validate Docsera's supported REST projections, which RR-008 and RR-009 reviewed separately.

Jacob executes this protocol with an API client. Do not use a browser-impersonated request, a 401 response, an administrator-authenticated SDK request, or an administrator session as evidence of limited-user access. Do not add roles, alter ACLs/table settings, relax authentication policy, provision an account, or make any mutating request for this qualification.

ServiceNow's Australia documentation states that Table API callers need sufficient table access, that Table API web-service access still enforces applicable ACLs, and that fields for which the caller lacks ACL rights are omitted from a REST query response. The platform also requires request authentication before endpoint/table authorization is meaningful. [Table API](https://www.servicenow.com/docs/r/api-reference/rest-apis/c_TableAPI.html) and [REST API security and table access](https://www.servicenow.com/docs/r/api-reference/rest-api-explorer/c_RESTAPI.html).

## Preconditions and safe evidence rules

1. Select one existing **active** workspace and record its workspace sys_id only in Jacob's local, access-controlled test notes. The workspace must have a safe public name; its supported reader projection is intentionally available to authenticated callers.
2. Select one existing page in that workspace with both published content and a harmless, distinguishable pending/draft change. Record the page sys_id privately. Use short markers such as `RR015 published marker` and `RR015 draft marker`; do not put document bodies in this report or captured evidence.
3. Select one existing provisioning-request record and one existing internal workflow record, preferring a workspace change set; record their sys_ids privately. If an internal change set does not exist, use an existing edit lease or membership-command record instead. Do not create records to make this test possible.
4. Use an existing genuine limited-permission account that is active and intentionally has no Docsera workspace Editor, Workspace Admin, or scoped application-admin capability for the selected workspace. Classify it in evidence only as `authenticated limited viewer` (or the actual non-personal capability class); do not record its user name, email, sys_id, password, token, cookie, or authorization header.
5. Configure the API client to authenticate directly as that account, using the PDI's approved supported authentication method. Keep its credential material only in the client secret store. Send `Accept: application/json`; use GET only; do not enable response/body logging that stores sensitive values.

For every Table API request below, use the default endpoint form `GET /api/now/table/{tableName}/{sys_id}` and add `sysparm_fields` plus `sysparm_display_value=false`. The single-record form avoids interpreting a broad list query as access evidence. Use a minimal field list and preserve only HTTP status, result-array/object shape, returned field *names*, and a redacted/boolean marker-presence result.

## Authentication preflight

Before any Docsera table request, make a direct authenticated GET to the PDI's approved current-session/current-user endpoint, using the same authentication configuration that will be used for every later request. Confirm its returned current-user identifier matches the preselected limited account in Jacob's private setup note. Capture only:

- response status;
- `current user confirmed: yes/no`; and
- capability classification (`authenticated limited viewer`, or equivalent).

If the endpoint is unavailable to the account, stop and resolve the API-client authentication setup with the instance owner; do not substitute browser impersonation or an administrator request. A 401/403 here is an authentication/preflight failure, not ACL evidence. Once the current caller is positively established, preserve the same client authentication configuration for the entire matrix.

## Small test matrix

Replace values in angle brackets locally; do not save those values in this document or the committed evidence.

| ID | Direct read-only request | Minimal `sysparm_fields` | Expected safe interpretation |
| --- | --- | --- | --- |
| A1 | current-session/current-user positive control | endpoint-specific identifier only | Authenticated effective caller is confirmed as the intended limited account. |
| W1 | `/api/now/table/x_82900_docsera_workspace/<workspace_sys_id>` | `sys_id,name,admin_group,editor_group,pending_change_set,published_snapshot_set,workspace_state_revision` | `name` may be returned; it is intentionally reader-visible through the supported projection. `admin_group`, `editor_group`, `pending_change_set`, `published_snapshot_set`, and `workspace_state_revision` must not be exposed to this view-only caller. |
| P1 | `/api/now/table/x_82900_docsera_page/<page_sys_id>` | `sys_id,published_title,draft_title,draft_content_json,publication_state` | A view-only caller must not obtain `draft_title` or `draft_content_json`. Do not request published content JSON or body fields. `published_title`/publication metadata alone are not a finding. |
| Q1 | `/api/now/table/x_82900_docsera_workspace_provision_request/<provision_request_sys_id>` | `sys_id,state` | Effective access should be denied. This table is source-declared with web-service access disabled and a read Deny-Unless ACL. |
| I1 | `/api/now/table/x_82900_docsera_workspace_change_set/<change_set_sys_id>` (or existing `x_82900_docsera_workspace_edit_lease` / `x_82900_docsera_workspace_member_mutation_command`) | `sys_id` | Effective access should be denied. These representative internal workflow tables are not direct reader surfaces. |

## Execution procedure

1. Complete A1. If it does not positively identify the directly authenticated limited account, stop; record `authentication/preflight failure` and do not interpret any later result.
2. Issue W1 exactly once. Record the status and the returned field-name set only. If `name` is returned without any server-only reference/revision field, record it as expected public reader metadata, not as a defect.
3. Issue P1 exactly once. Inspect field names and, only if a prohibited field is present, verify marker presence without copying its value. Never retain `draft_content_json` or another document body in screenshots, client histories, logs, or this report.
4. Issue Q1 and I1 exactly once each against known existing records. No retries with altered roles, query conditions, endpoint forms, or elevated credentials. If one designated record has legitimately disappeared, mark it `record unavailable — inconclusive`, do not infer denial, and do not substitute an unknown record.
5. Redact/discard any API-client console/history entries that accidentally contain credentials, identifiers, or content. Record the compact evidence worksheet below in a separately access-controlled review record, not in source control.

## Evidence worksheet and interpretation

| Test | HTTP status | Result shape | Returned field names / safe marker observation | Classification | Outcome |
| --- | --- | --- | --- | --- | --- |
| A1 |  |  | `current user confirmed: yes/no` |  |  |
| W1 |  |  | `name: present/absent`; server-only fields: present/absent by name |  |  |
| P1 |  |  | prohibited draft fields: present/absent; marker presence only if present |  |  |
| Q1 |  |  | no body retained |  |  |
| I1 |  |  | no body retained |  |  |

Classify each response precisely:

- **Authentication failure:** 401, login/challenge response, or A1 cannot confirm the intended caller. No ACL conclusion.
- **Authenticated ACL/endpoint denial:** after A1 succeeds, an authorization-style 403/404/error response attributable to denied table/web-service access. Record status and the platform error code/message category only; do not generalize it beyond this request.
- **Field masking:** a successful response for a known record where the safe public fields are present but an explicitly requested protected field is absent. This is evidence of field-level protection for that field, not proof that the entire record is hidden.
- **Empty result / missing record:** a 200 empty `result` array, a not-found result, or another response that could arise because the record no longer exists, query selection failed, or ACL filtering occurred. It is inconclusive unless an independent, non-sensitive setup note confirms the same record existed immediately before the test and platform semantics make the denial unambiguous. A 200 empty result is never sufficient by itself to prove an ACL denial.
- **Unexpected exposure:** a successful response containing an internal-only workspace reference/revision, a protected draft field/value, or any provisioning/internal workflow record field for the limited caller.

## Stop conditions and disposition

Stop all further probing immediately if W1 returns `admin_group`, `editor_group`, `pending_change_set`, `published_snapshot_set`, or `workspace_state_revision`; if P1 returns `draft_title` or `draft_content_json`; or if Q1/I1 returns a protected workflow record. Identify only the affected table, field class, HTTP status, and limited-user capability classification in the handoff. Preserve no sensitive values.

Do not change source, ACLs, schema, users, roles, table web-service settings, or authentication policy during qualification. Open a separately reviewed correction task with the minimal safe evidence instead. Do not claim effective authorization has passed until Jacob supplies the live results for all applicable rows; an unavailable record leaves that row inconclusive rather than passed.

## Source basis

- `docs/history/security/RR-011 Production Table Security and Legacy Role Assessment.md`: source/installed metadata agreement and the explicit effective-access evidence gap.
- `docs/history/security/RR-008 Workspace Administration and Resource Authorization Review.md`: active workspace reader metadata is intentionally available only through a constrained supported projection; group, pending/published references, creator/audit fields, and state revision are excluded there.
- `docs/history/security/RR-009 Page Authoring and Change-Set Authorization Review.md`: supported live page projections are published-only and view-only callers are denied edit projections; this protocol independently tests direct Table API behavior.
- `app/docsera-ui/src/fluent/tables/docsera-workspace.now.ts`: direct web-service access enabled; defines workspace server-only group/change-set/snapshot/revision references examined by W1.
- `app/docsera-ui/src/fluent/tables/docsera-page.now.ts`: direct web-service access enabled; defines the draft fields examined by P1.
- `app/docsera-ui/src/fluent/tables/docsera-workspace-provision-request.now.ts`, `docsera-workspace-change-set.now.ts`, and `src/fluent/security/docsera-workspace-foundation-table-access.now.ts`: workflow-table web-service/ACL boundary examined by Q1/I1.
