# RR-064 — Incremental SDK Installation

Date: 2026-11-03  
Status: **Installed once and verified. Stop for independent review before Global companion work.**

## Target

- Instance / alias: `https://dev468303.service-now.com/` / `docsera-dev468303`
- SDK: `C:\Dev\Docsera-rr-060-converted-output-20261103-final\app\docsera-ui\node_modules\.bin\now-sdk.cmd`, version `4.8.1`
- Source: `C:\Dev\Docsera-rr-060-converted-output-20261103-final\app\docsera-ui`
- Company key: `2300756`; scope / ID: `x_2300756_docsera` / `e6e43323accd4c7fb9271525a343850e`
- UI Page / endpoint: `c7a040a2d7bb4148b8ce008bc1f8d6c9` / `x_2300756_docsera_docsera_sdk_runtime.do`

At `2026-11-03T18:17:45.294Z`, `auth --list` showed the alias as the default
basic-auth credential for exactly the stated URL. No credential changed.

## Identity preflight evidence

Each command below was run independently with the executable and
`-a docsera-dev468303 -o json --limit 1`. Times are UTC. The following
preserves the exact predicates and successful JSON envelopes.

The exact invocation form for each line was
`& $sdk query <table> -a docsera-dev468303 -q '<predicate>' -f '<fields>' -o json --limit 1`,
where `$sdk` was the absolute executable in **Target**. Fields were exactly:
company `sys_id,name,value`; scope `sys_id,scope,name,active,sys_updated_on,sys_created_on`;
app `sys_id,name,scope,active,version,sys_updated_on,sys_created_on`; and UI Page
`sys_id,name,sys_scope,endpoint,direct,description,sys_updated_on,sys_created_on`
(the two UI positive-control fields were `sys_id,name,sys_scope,endpoint,direct`).

```text
2026-11-03T18:17:50.608Z sys_properties: name=glide.appcreator.company.code
{"ok":true,"hasMore":false,"nextOffset":null,"records":[{"sys_id":"8fc888b2d77311004f6a0eca5e6103e6","name":"glide.appcreator.company.code","value":"2300756"}]}
2026-11-03T18:17:56.168Z sys_scope: scope=global
{"ok":true,"hasMore":false,"nextOffset":null,"records":[{"sys_id":"global","scope":"global","name":"Global","active":"true","sys_updated_on":"2014-06-09 20:25:13"}]}
2026-11-03T18:18:01.286Z sys_app: active=true
{"ok":true,"hasMore":false,"nextOffset":null,"records":[{"sys_id":"e6e43323accd4c7fb9271525a343850e","scope":"x_2300756_docsera","name":"Docsera","active":"true","version":"0.1.0"}]}
2026-11-03T18:18:06.835Z sys_ui_page: sys_idISNOTEMPTY
{"ok":true,"hasMore":true,"nextOffset":1,"records":[{"sys_id":"0029fb510b1312003aa56c4d37673af0","endpoint":"","name":"oauth_login","direct":"false","sys_scope":"global"}]}
2026-11-03T18:18:26.331Z sys_scope: sys_id=e6e43323accd4c7fb9271525a343850e
{"ok":true,"hasMore":false,"nextOffset":null,"records":[{"sys_id":"e6e43323accd4c7fb9271525a343850e","sys_created_on":"2026-11-03 17:35:04","scope":"x_2300756_docsera","name":"Docsera","active":"true","sys_updated_on":"2026-11-03 17:35:04"}]}
2026-11-03T18:18:31.988Z sys_scope: scope=x_2300756_docsera
{"ok":true,"hasMore":false,"nextOffset":null,"records":[{"sys_id":"e6e43323accd4c7fb9271525a343850e","sys_created_on":"2026-11-03 17:35:04","scope":"x_2300756_docsera","name":"Docsera","active":"true","sys_updated_on":"2026-11-03 17:35:04"}]}
2026-11-03T18:18:37.431Z sys_app: sys_id=e6e43323accd4c7fb9271525a343850e
{"ok":true,"hasMore":false,"nextOffset":null,"records":[{"sys_id":"e6e43323accd4c7fb9271525a343850e","sys_created_on":"2026-11-03 17:35:04","scope":"x_2300756_docsera","name":"Docsera","active":"true","sys_updated_on":"2026-11-03 17:35:04","version":"0.1.0"}]}
2026-11-03T18:18:42.321Z sys_app: scope=x_2300756_docsera
{"ok":true,"hasMore":false,"nextOffset":null,"records":[{"sys_id":"e6e43323accd4c7fb9271525a343850e","sys_created_on":"2026-11-03 17:35:04","scope":"x_2300756_docsera","name":"Docsera","active":"true","sys_updated_on":"2026-11-03 17:35:04","version":"0.1.0"}]}
2026-11-03T18:18:47.558Z sys_app: name=Docsera
{"ok":true,"hasMore":false,"nextOffset":null,"records":[{"sys_id":"e6e43323accd4c7fb9271525a343850e","sys_created_on":"2026-11-03 17:35:04","scope":"x_2300756_docsera","name":"Docsera","active":"true","sys_updated_on":"2026-11-03 17:35:04","version":"0.1.0"}]}
2026-11-03T18:19:03.601Z sys_ui_page: sys_id=c7a040a2d7bb4148b8ce008bc1f8d6c9
{"ok":true,"hasMore":false,"nextOffset":null,"records":[{"sys_id":"c7a040a2d7bb4148b8ce008bc1f8d6c9","endpoint":"x_2300756_docsera_docsera_sdk_runtime.do","sys_created_on":"2026-11-03 17:35:38","name":"docsera_sdk_runtime","direct":"true","description":"Docsera SDK-native runtime baseline","sys_scope":"e6e43323accd4c7fb9271525a343850e","sys_updated_on":"2026-11-03 17:35:38"}]}
2026-11-03T18:19:08.886Z sys_ui_page: name=docsera_sdk_runtime
{"ok":true,"hasMore":false,"nextOffset":null,"records":[{"sys_id":"c7a040a2d7bb4148b8ce008bc1f8d6c9","endpoint":"x_2300756_docsera_docsera_sdk_runtime.do","sys_created_on":"2026-11-03 17:35:38","name":"docsera_sdk_runtime","direct":"true","description":"Docsera SDK-native runtime baseline","sys_scope":"e6e43323accd4c7fb9271525a343850e","sys_updated_on":"2026-11-03 17:35:38"}]}
2026-11-03T18:19:13.932Z sys_ui_page: sys_scope=e6e43323accd4c7fb9271525a343850e
{"ok":true,"hasMore":false,"nextOffset":null,"records":[{"sys_id":"c7a040a2d7bb4148b8ce008bc1f8d6c9","endpoint":"x_2300756_docsera_docsera_sdk_runtime.do","sys_created_on":"2026-11-03 17:35:38","name":"docsera_sdk_runtime","direct":"true","description":"Docsera SDK-native runtime baseline","sys_scope":"e6e43323accd4c7fb9271525a343850e","sys_updated_on":"2026-11-03 17:35:38"}]}
```

The fields were RR-063's documented fields: company `sys_id,name,value`;
scope `sys_id,scope,name,active,sys_updated_on,sys_created_on`; app
`sys_id,name,scope,active,version,sys_updated_on,sys_created_on`; and UI
Page `sys_id,name,sys_scope,endpoint,direct,description,sys_updated_on,sys_created_on`.
The first four are positive controls. The remaining single predicates proved
one expected application, scope, and UI Page with the original description.

## Candidate and inventory gates

Pre-install and post-install scoped inventory both were: 13 tables, 162
dictionary records, 3 roles, 49 ACLs, 65 server modules, 1 REST definition, 34
operations, 2 scheduled scripts, 1 UI Page, and 8 UX assets. Dictionary count
used `sys_scope=e6e43323accd4c7fb9271525a343850e`.

- UI Page source SHA-256: `ADDFA23B2864F887A353DA8B6131A074ADF9C42FE6D03B085A5235BCA8A17C78`
- Generated registry SHA-256: `EC4978C8CBC81C3829CBCD6E2672AF8DDF3CD6A9F61B77443F9FD28F0596784D` (605 entries, unchanged)
- UI Page XML SHA-256: `73D33D1D37E01FEFE976CBD9B112AE7C930B0148068976052336923EFDFEA820`
- RR-062 generated package manifest SHA-256: `3576665905FD755190D38ECCEF70F683DC6605F83627CF47F04DE902BB485178`
- Generated update XML: 364; scans found zero DELETE declarations, old-scope
  references, duplicate paths, or metadata-identity changes.

## Single normal installation and runtime result

Exactly once:

```powershell
& 'C:\Dev\Docsera-rr-060-converted-output-20261103-final\app\docsera-ui\node_modules\.bin\now-sdk.cmd' install --source 'C:\Dev\Docsera-rr-060-converted-output-20261103-final\app\docsera-ui' --auth docsera-dev468303
```

No `--reinstall` or retry was used. At `2026-11-03T18:23:06.670Z`, the
same application/scope/UI Page IDs and creation timestamps remained. The UI
Page description is now exactly `Docsera SDK-native runtime baseline (RR-062 incremental-deployment verification)`.
Duplicate checks returned exactly one target app, scope, and UI Page.

The non-browser verifier passed:

```powershell
node .\scripts\verify-sdk-runtime.mjs --instance-url 'https://dev468303.service-now.com/' --auth-alias docsera-dev468303 --page-endpoint x_2300756_docsera_docsera_sdk_runtime.do --ping-path /api/x_2300756_docsera/docsera_runtime/ping --skip-browser
```

It passed authenticated UI Page, bundle, inline CSS, and REST ping checks. Live
and local bundle SHA-256 both were
`dc20f5717417913c6bf7f95766f6b243c8e63c4e877dd6e7089efb5c5cc2840e`.

## Conclusion

The reviewed RR-062 candidate performed one in-place incremental installation.
Browser acceptance, Global companion work, data creation, regeneration,
conversion, and a second installation were intentionally not performed.
