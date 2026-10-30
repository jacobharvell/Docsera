# RR-011 — Production Table Security and Legacy Role Assessment

Date: 2026-10-30
Status: evidence-only review; no application or PDI change made

## Disposition

**No material production-table security drift or current permission defect was established. No code change is recommended.**

The source-controlled definitions and the installed development PDI agree for all 13 active production tables' application-access and web-service flags. The installed PDI also has every source-controlled generic CRUD deny expected for the eleven server-owned workflow tables, plus all five page server-owned-field denies. `x_82900_docsera.user` is installed historical metadata, but it has no current source declaration or generated-key identity, no ACL role binding, no role-containment relationship, and no direct `sys_user_has_role` grant returned by the bounded query. It is not evidence of current Docsera access.

This conclusion is about metadata, not effective access. A limited-role authenticated test remains required before claiming how the platform ACL engine treats a particular direct Table API request.

## Scope and method

This assessment compares the active Fluent table/security declarations with narrowly filtered, read-only installed metadata on the configured development PDI. It follows the boundaries already established by RR-005 through RR-010 and does not repeat REST-route investigations, read production-table rows, impersonate a user, call a direct Table API endpoint, or change PDI records.

Source reviewed:

- `app/docsera-ui/src/fluent/tables/*.now.ts`
- `app/docsera-ui/src/fluent/security/docsera-roles.now.ts`
- `app/docsera-ui/src/fluent/security/docsera-workspace-foundation-table-access.now.ts`
- `app/docsera-ui/src/fluent/security/docsera-page-server-owned-fields.now.ts`
- `app/docsera-ui/src/fluent/generated/keys.ts`
- RR-003 and the accepted RR-005 through RR-010 reports.

Installed metadata was queried with `now-sdk query`, scoped to the 13 exact table names, their exact table ACL names, the five `x_82900_docsera_page.*` field ACLs, the four Docsera role names, and the historical-role relationship/grant records. The SDK connection is administrator-configured; it is not an effective-access test.

## Source versus installed table controls

`actions` below is the source declaration. Installed `sys_db_object` values are rendered as application access followed by `C/R/U/D; WS`. All 13 returned one Docsera-scope record, with no superclass, and match the source declarations.

| Active production table | Source actions / web service | Installed `sys_db_object` | Disposition |
| --- | --- | --- | --- |
| `x_82900_docsera_workspace` | `read, create, update, delete`; enabled | `public`; `T/T/T/T; T` | Match |
| `x_82900_docsera_page` | `read, create`; enabled | `public`; `T/T/F/F; T` | Match |
| `x_82900_docsera_workspace_provision_request` | `read, update`; disabled | `public`; `F/T/T/F; F` | Match; server-owned CRUD denies installed |
| `x_82900_docsera_workspace_member_mutation_command` | `read, update`; disabled | `public`; `F/T/T/F; F` | Match; server-owned CRUD denies installed |
| `x_82900_docsera_workspace_icon_asset` | `read, create, update, delete`; disabled | `public`; `T/T/T/T; F` | Match; server-owned CRUD denies installed |
| `x_82900_docsera_workspace_edit_lease` | package-private default actions; disabled | `package_private`; `F/T/F/F; F` | Match; server-owned CRUD denies installed |
| `x_82900_docsera_workspace_mutation_claim` | package-private default actions; disabled | `package_private`; `F/T/F/F; F` | Match; server-owned CRUD denies installed |
| `x_82900_docsera_workspace_change_set` | package-private default actions; disabled | `package_private`; `F/T/F/F; F` | Match; server-owned CRUD denies installed |
| `x_82900_docsera_workspace_change_entry` | package-private default actions; disabled | `package_private`; `F/T/F/F; F` | Match; server-owned CRUD denies installed |
| `x_82900_docsera_workspace_snapshot_set` | package-private default actions; disabled | `package_private`; `F/T/F/F; F` | Match; server-owned CRUD denies installed |
| `x_82900_docsera_workspace_page_snapshot` | package-private default actions; disabled | `package_private`; `F/T/F/F; F` | Match; server-owned CRUD denies installed |
| `x_82900_docsera_workspace_removal_batch` | package-private default actions; disabled | `package_private`; `F/T/F/F; F` | Match; server-owned CRUD denies installed |
| `x_82900_docsera_workspace_removal_member` | package-private default actions; disabled | `package_private`; `F/T/F/F; F` | Match; server-owned CRUD denies installed |

`public` application access is a cross-scope setting, not an end-user authorization grant. Likewise, a table's `WS` flag is only one part of direct Table API exposure. The table ACLs below are the relevant source-owned user-access backstop for the server-owned tables.

## ACL reconciliation

The active source declares 44 table-level Deny-Unless records: create/read/write/delete for each of eleven server-owned workflow tables (all except `workspace` and `page`). Every declaration has `adminOverrides: false` and `script: "return false;"`. The PDI returned exactly 44 records for those exact table names: four active denies per table, with the same operation set, `admin_overrides=false`, and false script.

The active source separately declares five `x_82900_docsera_page` field-write denies for `draft_parent_page`, `draft_sibling_order`, `draft_removed`, `last_draft_changed_on`, and `last_draft_changed_by`. The PDI returned exactly those five active `write` Deny-Unless records, each with `admin_overrides=false` and `return false;`.

No installed allow/permissive ACL was returned for any of the eleven exact server-owned production-table ACL names or the five source-controlled page-field names. The 44 table deny ACLs have no role binding; their unconditional deny behavior is source-owned and role-independent. This confirms the remediation boundary later than RR-005: the provisioning queue now has `WS=false` and four installed generic CRUD denies, matching source.

`workspace` and `page` intentionally do not have these generic table CRUD denies. Their table/web-service values are deliberate source declarations, while supported access is controlled by the reviewed server routes and their capability checks. This report does not reopen those route assessments.

## Legacy `x_82900_docsera.user` assessment

| Check | Evidence | Assessment |
| --- | --- | --- |
| Source ownership | `docsera-roles.now.ts` declares only editor, workspace-admin, and scoped application-admin. No `x_82900_docsera.user` reference occurs in active Fluent security/table source. | Not source-owned active behavior. |
| Generated identity registry | `keys.ts` has identities for the three active roles and their three containment records; it has no `x_82900_docsera.user` identity. RR-001 explains that retained keys are historical identities, so absence here reinforces—but does not itself delete—installed metadata. | Historical installed record, not a retained active declaration. |
| Installed role record | Role exists in Docsera scope as `Default user role`; it is not scoped-admin. | Confirms RR-003's preservation observation only. |
| Role inclusion | Exact query of the four relevant role IDs returned the three expected active edges: admin → workspace-admin, admin → editor, and workspace-admin → editor. No edge includes the legacy role. | No inheritance path from the legacy role to an active Docsera role, or vice versa. |
| ACL references | Query for `sys_security_acl_role` records referencing the legacy role returned zero. The 44 production-table deny ACLs have no role bindings. | No installed ACL grant was found through the legacy role. |
| Direct grants | Query of `sys_user_has_role` for the legacy role ID, returning no user identity fields, returned zero records. | No direct user grant exists in the queried PDI at assessment time. |

These findings do not prove that a future custom script, group assignment, or unrelated global artifact cannot use the role. They do establish that the retained role currently has no observed Docsera table ACL, role-inclusion, or direct-user-grant path to supported Docsera behavior. Per RR-003, it should be preserved unless a separately approved retirement task establishes its provenance and safe removal.

## Installed-instance drift and risk classification

| Classification | Evidence | Impact / disposition |
| --- | --- | --- |
| Source-owned controls match installed state | All 13 active `sys_db_object` records match source actions and WS settings; 44 workflow-table denies and five page-field denies match source. | No correction. Recheck after a future install/export. |
| Historical unused metadata | `x_82900_docsera.user` is installed but absent from active declarations/keys and has no observed containment, ACL binding, or direct grant. | Preserve; no cleanup or security change in this task. |
| Non-production historical PDI artifact | One additional installed scoped ACL, `x_82900_docsera_docsera_standalone_host_spike` read allow, is bound to platform `admin`. It is not an ACL on any active production table, is not bound to `x_82900_docsera.user`, and is outside this table-security review. | Record as historical host-spike drift, not a production-table permission risk. Any host retirement belongs to a separately scoped cleanup/release task. |
| Effective-access evidence gap | Metadata cannot establish the ACL engine's result for a particular non-Admin session, including interactions with platform/global ACLs. | Deferred authorized limited-role qualification; no inference of a defect. |

## Required later effective-access qualification

Metadata inspection is sufficient to rule out the claimed source-versus-installed drift, but not to prove user-context behavior. The already deferred, properly authenticated non-Admin provisioning-queue Table API qualification remains the relevant next test. It should use a limited-role user and a separate approved plan, record only status/count-safe evidence, and not create, mutate, replay, or inspect queue data.

If a future security qualification covers other production tables, it should separately validate a user without Docsera authority against representative `workspace`/`page` read and mutation surfaces, and confirm that an appropriately authorized workspace member still succeeds through the supported REST/UI flow. It must not treat `public` application access or `WS=true` as an effective-access result.

## Validation and evidence boundary

Read-only evidence collected:

- exact-name `sys_db_object` query for the 13 active tables;
- exact-name table ACL and page field-ACL queries, including ACL attributes and role bindings;
- exact-name active/historical `sys_user_role`, `sys_user_role_contains`, and legacy-role `sys_user_has_role` queries; and
- source review of the active declarations, generated registry, RR-003, RR-001, and the accepted RR reports.

Intentionally excluded: package generation/deployment, SDK builds, application tests, PDI mutation, record inspection, impersonation, direct Table API probes, role/user changes, and browser acceptance. This report neither retires historical metadata nor certifies all effective permissions.
