# RR-062 — Incremental SDK Verification

Date: 2026-11-03  
Status: **Blocked at required pre-install identity gate; no installation was run.**

## Execution outcome — pre-install stop

The authorized RR-062B incremental installation was **not** executed.  Using
the exact preserved-source SDK executable (version `4.8.1`) and the explicit
`docsera-dev468303` alias, the alias credential inventory still resolved to
`https://dev468303.service-now.com/`.  However, read-only authenticated
queries returned zero records for all of the required installed identity
records:

| Required record / query | Result |
| --- | --- |
| `sys_scope` by `sys_id=e6e43323accd4c7fb9271525a343850e` or `scope=x_2300756_docsera` | 0 records |
| `sys_app` by `name=Docsera` or `scope=x_2300756_docsera` | 0 records |
| `sys_ui_page` by `sys_id=c7a040a2d7bb4148b8ce008bc1f8d6c9` or `name=docsera_sdk_runtime` | 0 records |

The same explicit-alias query did return the 13 expected
`x_2300756_docsera_*` `sys_db_object` table records, each carrying scope ID
`e6e43323accd4c7fb9271525a343850e`.  This proves the target is reachable and
contains scoped remnants, but it does not satisfy the required RR-061
application, scope, or UI Page identity baseline.  Consequently the required
original-description, installed-inventory, and runtime-asset gates cannot be
established.

No `now-sdk install`, `--reinstall`, retry, conversion, regeneration, browser
test, Global companion action, or functional-data mutation was performed.
Independent review must reconcile the missing application/scope/UI Page
records before any new installation authorization is considered.

## Target and executable

| Item | Value |
| --- | --- |
| Instance | `https://dev468303.service-now.com/` |
| Explicit credential alias | `docsera-dev468303` |
| Source | `C:\Dev\Docsera-rr-060-converted-output-20261103-final\app\docsera-ui` |
| SDK executable | `C:\Dev\Docsera-rr-060-converted-output-20261103-final\app\docsera-ui\node_modules\.bin\now-sdk.cmd` |
| SDK version | `4.8.1` |
| Scope / scope ID | `x_2300756_docsera` / `e6e43323accd4c7fb9271525a343850e` |

`auth --list` identified `docsera-dev468303` as the explicit, default basic-auth
alias for the stated instance. No credentials were changed or printed.

## Installed pre-update baseline

Read-only SDK 4.8.1 queries using the explicit alias found exactly one active
Docsera application and scope:

| Record | Identity / value |
| --- | --- |
| `sys_scope` / `sys_app` | `e6e43323accd4c7fb9271525a343850e`, `x_2300756_docsera`, `Docsera`, version `0.1.0` |
| `sys_ui_page` | `c7a040a2d7bb4148b8ce008bc1f8d6c9` |
| UI Page name / endpoint | `docsera_sdk_runtime` / `x_2300756_docsera_docsera_sdk_runtime.do` |
| UI Page description | `Docsera SDK-native runtime baseline` |

The installed metadata baseline is the accepted RR-061 inventory: 13 tables,
162 dictionary records, 3 roles, 49 ACLs, 65 server modules, one REST
definition with 34 operations, two scheduled scripts, one UI Page, and eight
UX assets. This RR-062 preparation did not mutate the instance.

## Exact candidate source change

Only the preserved target-specific source changed; the canonical repository
application and the Global companion were not modified. In
`src/fluent/ui-pages/docsera-runtime.now.ts`, the existing UI Page's
description changed exactly as follows:

```diff
-  description: "Docsera SDK-native runtime baseline",
+  description: "Docsera SDK-native runtime baseline (RR-062 incremental-deployment verification)",
```

The endpoint, `Now.ID["docsera-sdk-runtime-page"]`, HTML import, category,
and direct-page setting were unchanged.

## Fingerprints and generated identity review

Before the source edit, the target UI Page source SHA-256 was
`1AF5CF87A4032F54BA681C3BB0F8BFF1E9B12B7DD168FB1E7E61FECFA4661711`.
The accepted RR-060/RR-061 generated registry baseline was 605 entries with
SHA-256 `EC4978C8CBC81C3829CBCD6E2672AF8DDF3CD6A9F61B77443F9FD28F0596784D`.

After the normal local build:

| Candidate item | SHA-256 / count |
| --- | --- |
| UI Page Fluent source | `ADDFA23B2864F887A353DA8B6131A074ADF9C42FE6D03B085A5235BCA8A17C78` |
| Generated `keys.ts` | `EC4978C8CBC81C3829CBCD6E2672AF8DDF3CD6A9F61B77443F9FD28F0596784D` (unchanged) |
| Generated UI Page XML | `73D33D1D37E01FEFE976CBD9B112AE7C930B0148068976052336923EFDFEA820` |
| Deterministic `dist/app/update` path-and-content manifest | `3576665905FD755190D38ECCEF70F683DC6605F83627CF47F04DE902BB485178` |
| Update XML records | 364 |
| Generated registry entries / deleted entries | 605 / 0 |

The rebuilt `sys_ui_page_c7a040a2d7bb4148b8ce008bc1f8d6c9.xml` preserves
the page identity, name, endpoint, and scope ID, and contains:

```xml
<sys_id>c7a040a2d7bb4148b8ce008bc1f8d6c9</sys_id>
<description>Docsera SDK-native runtime baseline (RR-062 incremental-deployment verification)</description>
<endpoint>x_2300756_docsera_docsera_sdk_runtime.do</endpoint>
<name>docsera_sdk_runtime</name>
```

The registry fingerprint exactly matches the accepted pre-update fingerprint;
the generated XML count remains 364. Package scans found zero generated
`<action>DELETE</action>` declarations, zero `x_82900_docsera` or
`6997f092c3fd8310c569bf0d0501314d` references, and no duplicate generated
XML path. The only intentional generated record content change is the UI Page
description above. A normal build rewrites generated output timestamps, so
timestamps were not used as change evidence.

## Validation and installation decision

`npm run build` in the preserved source completed its SDK type check, SDK
build, module-key validation, and bundle-serialization validation. The
standalone converted source is intentionally not a Git checkout, so the
Git-dependent `verify:sdk-module-keys:checkpoint` command is not applicable
there; the normal build's non-checkpoint module-key validation passed. No new
server module was added.

This candidate preserves the application scope ID, the UI Page record ID, and
the generated registry fingerprint. It is safe for **one normal incremental
SDK installation**, subject to independent review. This task intentionally did
not run `now-sdk install`, `--reinstall`, conversion, reinitialization, Global
companion installation, browser testing, or test-data creation.
