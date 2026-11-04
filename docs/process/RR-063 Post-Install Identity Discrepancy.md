# RR-063 — Post-Install Identity Discrepancy

Date: 2026-11-03  
Status: **Investigation complete; no instance mutation was performed. Independent review required before RR-062 resumes.**

## Conclusion

The Docsera application, scope, and UI Page are currently **present and
readable** through the required explicit authentication context.  The current
evidence does not corroborate a metadata deletion or any other metadata-state
change after RR-061.  The most likely explanation for RR-062B's conflicting
zero-record observations is a transient or otherwise unrecorded read/query
visibility anomaly; its precise cause cannot be established retrospectively
from the available read-only evidence.

This is deliberately not a conclusion that no deletion could ever have
occurred. It is a conclusion that no actual absence was reproduced, while the
same identities and their installed runtime are now consistently observable.

## Method and authenticated target

All instance queries used the preserved SDK 4.8.1 executable and an explicit
alias on every request:

```powershell
& 'C:\Dev\Docsera-rr-060-converted-output-20261103-final\app\docsera-ui\node_modules\.bin\now-sdk.cmd' query <table> `
  -a docsera-dev468303 -q '<encoded query>' -f '<fields>' -o json
```

`auth --list` reported `docsera-dev468303` as the default **basic** alias for
`https://dev468303.service-now.com/`, user `admin`. The read-only
`sys_properties` control returned
`{"ok":true,"records":[{"name":"glide.appcreator.company.code","value":"2300756"}]}`.
The established runtime verifier also checked the alias's stored URL with its
trailing slash, established an authenticated basic session, and received an
authenticated `x_2300756_docsera` ping response. Together, these checks verify
the target, company key, and authenticated user context without treating the
alias hostname alone as proof.

For this report, each `{"ok":true,...}` query envelope is the SDK's
machine-readable success result (the SDK documents this as a successful Table
API response); no query returned an error envelope or non-success status.

The concrete command form used for the identity and positive-control probes
was the following (each line was executed independently with `$alias` set to
`docsera-dev468303`):

```powershell
$sdk = 'C:\Dev\Docsera-rr-060-converted-output-20261103-final\app\docsera-ui\node_modules\.bin\now-sdk.cmd'
$alias = 'docsera-dev468303'
& $sdk query sys_properties -a $alias -q 'name=glide.appcreator.company.code' -f 'sys_id,name,value' -o json
& $sdk query sys_scope -a $alias -q 'scope=global' -f 'sys_id,scope,name,active,sys_updated_on' -o json
& $sdk query sys_app -a $alias -q 'active=true' -f 'sys_id,name,scope,active,version' -o json --limit 1
& $sdk query sys_ui_page -a $alias -q 'sys_idISNOTEMPTY' -f 'sys_id,name,sys_scope,endpoint,direct' -o json --limit 1
& $sdk query sys_scope -a $alias -q 'sys_id=e6e43323accd4c7fb9271525a343850e' -f 'sys_id,scope,name,active,sys_updated_on,sys_created_on' -o json
& $sdk query sys_scope -a $alias -q 'scope=x_2300756_docsera' -f 'sys_id,scope,name,active,sys_updated_on,sys_created_on' -o json
& $sdk query sys_app -a $alias -q 'sys_id=e6e43323accd4c7fb9271525a343850e' -f 'sys_id,name,scope,active,version,sys_updated_on,sys_created_on' -o json
& $sdk query sys_app -a $alias -q 'scope=x_2300756_docsera' -f 'sys_id,name,scope,active,version,sys_updated_on,sys_created_on' -o json
& $sdk query sys_app -a $alias -q 'name=Docsera' -f 'sys_id,name,scope,active,version,sys_updated_on,sys_created_on' -o json
& $sdk query sys_ui_page -a $alias -q 'sys_id=c7a040a2d7bb4148b8ce008bc1f8d6c9' -f 'sys_id,name,sys_scope,endpoint,direct,description,sys_updated_on,sys_created_on' -o json
& $sdk query sys_ui_page -a $alias -q 'name=docsera_sdk_runtime' -f 'sys_id,name,sys_scope,endpoint,direct,description,sys_updated_on,sys_created_on' -o json
& $sdk query sys_ui_page -a $alias -q 'sys_scope=e6e43323accd4c7fb9271525a343850e' -f 'sys_id,name,sys_scope,endpoint,direct,description,sys_updated_on,sys_created_on' -o json
```

## Positive controls

The following independent platform records were readable with the same alias:

| Table / exact query | Result (machine-readable record excerpt) |
| --- | --- |
| `sys_scope`, `scope=global` | `{"ok":true,"records":[{"sys_id":"global","scope":"global","name":"Global","active":"true"}]}` |
| `sys_app`, `active=true`, limit 1 | `{"ok":true,"records":[{"sys_id":"e6e43323accd4c7fb9271525a343850e","name":"Docsera","scope":"x_2300756_docsera","active":"true","version":"0.1.0"}]}` |
| `sys_ui_page`, `sys_idISNOTEMPTY`, limit 1 | `{"ok":true,"records":[{"sys_id":"0029fb510b1312003aa56c4d37673af0","name":"oauth_login","sys_scope":"global","direct":"false"}]}` |

The attempted name controls `sys_app name=Global` and `sys_ui_page name=login`
returned valid successful empty envelopes. They are not evidence of an access
failure: the non-empty controls above establish that all three tables are
readable under this context.

## Required identity reproduction

The reported RR-062B predicates were repeated separately, rather than folded
into an OR query. All returned HTTP-success SDK envelopes with one record.

| Table / query expression | Machine-readable result |
| --- | --- |
| `sys_scope` / `sys_id=e6e43323accd4c7fb9271525a343850e` | `{"ok":true,"records":[{"sys_id":"e6e43323accd4c7fb9271525a343850e","scope":"x_2300756_docsera","name":"Docsera","active":"true","sys_created_on":"2026-11-03 17:35:04","sys_updated_on":"2026-11-03 17:35:04"}]}` |
| `sys_scope` / `scope=x_2300756_docsera` | Same one record and fields as the exact-ID query. |
| `sys_app` / `sys_id=e6e43323accd4c7fb9271525a343850e` | `{"ok":true,"records":[{"sys_id":"e6e43323accd4c7fb9271525a343850e","name":"Docsera","scope":"x_2300756_docsera","active":"true","version":"0.1.0","sys_created_on":"2026-11-03 17:35:04","sys_updated_on":"2026-11-03 17:35:04"}]}` |
| `sys_app` / `scope=x_2300756_docsera` | Same one record and fields as the exact-ID query. |
| `sys_app` / `name=Docsera` | Same one record and fields as the exact-ID query. |
| `sys_ui_page` / `sys_id=c7a040a2d7bb4148b8ce008bc1f8d6c9` | `{"ok":true,"records":[{"sys_id":"c7a040a2d7bb4148b8ce008bc1f8d6c9","name":"docsera_sdk_runtime","sys_scope":"e6e43323accd4c7fb9271525a343850e","endpoint":"x_2300756_docsera_docsera_sdk_runtime.do","direct":"true","description":"Docsera SDK-native runtime baseline","sys_created_on":"2026-11-03 17:35:38","sys_updated_on":"2026-11-03 17:35:38"}]}` |
| `sys_ui_page` / `name=docsera_sdk_runtime` | Same one record and fields as the exact-ID query. |
| `sys_ui_page` / `sys_scope=e6e43323accd4c7fb9271525a343850e` | Same one record and fields as the exact-ID query. |

The `sys_app` result is also the appropriate parent-metadata lookup for the
scope identity: it has the same sys_id, scope string, application name, active
state, and `0.1.0` version as the `sys_scope` record. This rules out a
reference-display or parent-table discoverability problem in the current
authenticated context.

## Surviving scoped metadata

`sys_db_object` queried with
`nameSTARTSWITHx_2300756_docsera` (limit 20) returned exactly 13 records. Each
has `sys_scope=e6e43323accd4c7fb9271525a343850e`, has no superclass, and has
creation/update times from `17:35:05` through `17:35:12` on 2026-11-03:

```
x_2300756_docsera_page
x_2300756_docsera_workspace
x_2300756_docsera_workspace_change_entry
x_2300756_docsera_workspace_change_set
x_2300756_docsera_workspace_edit_lease
x_2300756_docsera_workspace_icon_asset
x_2300756_docsera_workspace_member_mutation_command
x_2300756_docsera_workspace_mutation_claim
x_2300756_docsera_workspace_page_snapshot
x_2300756_docsera_workspace_provision_request
x_2300756_docsera_workspace_removal_batch
x_2300756_docsera_workspace_removal_member
x_2300756_docsera_workspace_snapshot_set
```

Bounded samples establish that the observation is not limited to table
metadata:

| Type / query | Result |
| --- | --- |
| Server modules: `sys_module`, `sys_scope=e6e...850e`, limit 5 | Successful envelope, five records returned, `hasMore:true`; each has that scope and `2026-11-03 17:35:34` timestamps. |
| REST definition: `sys_ws_definition`, `sys_scope=e6e...850e` | One active `Docsera Runtime API` (`731376395fa94a9c910a223b8ef62a4f`), created/updated `17:35:45`. |
| REST operations: `sys_ws_operation`, `web_service_definition=731376395fa94a9c910a223b8ef62a4f`, limit 5 | Successful envelope, five active scoped operations returned, `hasMore:true`, including `pages_delete`, `pages_move`, and `workspace_provisioning_status`. |
| ACLs: `sys_security_acl`, `sys_scope=e6e...850e`, limit 5 | Successful envelope, five active scoped ACLs returned, `hasMore:true`. |
| UX assets: `sys_ux_lib_asset`, `nameSTARTSWITHx_2300756_docsera/` | Eight records, all with that scope: `main`, `main.js.map`, `MarkdownSourceSession`, `MarkdownSourceSession.js.map`, `mountEditorRuntimeSpike`, its map, `PageEditorHostRuntime`, and its map. |

This matches the RR-061 installed inventory shape (13 tables, 65 modules, one
REST definition, 34 operations, 49 ACLs, and eight UX assets) without needing
to rerun a full inventory count.

## Non-browser installed-runtime verification

The established, authenticated non-browser verifier was invoked exactly as
follows (no browser option was used):

```powershell
node .\scripts\verify-sdk-runtime.mjs `
  --instance-url 'https://dev468303.service-now.com/' `
  --auth-alias docsera-dev468303 `
  --page-endpoint x_2300756_docsera_docsera_sdk_runtime.do `
  --ping-path /api/x_2300756_docsera/docsera_runtime/ping `
  --skip-browser
```

It passed: explicit alias/URL/basic-auth checks; authenticated session;
UI Page HTTP 200; `docsera-root` and runtime-config markers; SDK `main.jsdbx`
HTTP 200; and REST ping HTTP 200 with the authenticated scope/status payload.
The live and local bundle SHA-256 values both were
`dc20f5717417913c6bf7f95766f6b243c8e63c4e877dd6e7089efb5c5cc2840e`.

## Reconciliation and root-cause assessment

### Confirmed facts

- RR-061 recorded the same scope ID, application identity, UI Page ID, and a
  successful authenticated runtime check after the one authorized install.
- RR-062B reported successful empty envelopes for those identities while the
  13 scoped tables remained visible; it made no installation or recovery
  mutation.
- RR-063 reproduces each reported predicate as non-empty using the preserved
  SDK 4.8.1 executable and the same explicit alias, and verifies the live
  runtime endpoints with a fresh authenticated session.
- All returned Docsera records retain their RR-061-era creation and update
  times. There is no read-only evidence here of deletion, recreation, or an
  intervening RR-062 installation.

### Unresolved possibilities

The available evidence cannot distinguish a temporary Table API/query-path
inconsistency, a transient platform visibility/cache condition, or an
unrecorded difference in the RR-062 execution context. The records' presence
now means the conditional deletion-history investigation is not triggered: an
actual absence was not corroborated. Absence of deletion audit evidence would
not, in any event, prove that no deletion occurred.

## Recommended next action

Do **not** resume RR-062 installation under this report alone. Have an
independent reviewer verify the captured RR-062 command transcript/environment
against this report. If the identity gate is repeated, run the exact
single-predicate commands above first, retain their JSON envelopes and UTC
timestamps, and stop again on any inconsistency. Only after that independent
review confirms a stable identity baseline should a separately authorized
RR-062 installation decision be considered.

## Validation boundary

- Performed: task-worktree guard; preserved SDK 4.8.1/help/query-contract
review; explicit-alias read-only metadata queries; positive controls; bounded
scoped-metadata sampling; and established non-browser runtime verification.
- Intentionally skipped: SDK install/reinstall/transform/init; source or
generated-identity changes; browser automation; manual repair; deletion or
history mutation; and full frontend validation. This task changed only this
diagnostic report.
