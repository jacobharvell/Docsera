# RR-061 — First Scoped SDK Installation

Date: 2026-11-03
Status: **Installed and verified against the scoped application only.**

## Task identity and executable

| Item | Verified value |
| --- | --- |
| Target | `https://dev468303.service-now.com/` |
| SDK executable | `C:\Dev\Docsera-rr-060-converted-output-20261103-final\app\docsera-ui\node_modules\.bin\now-sdk.cmd` |
| SDK version | `4.8.1` |
| Explicit alias | `docsera-dev468303` |
| Company key | `2300756` |
| Scope / ID | `x_2300756_docsera` / `e6e43323accd4c7fb9271525a343850e` |
| Installation source | `C:\Dev\Docsera-rr-060-converted-output-20261103-final\app\docsera-ui` |

This task deliberately did not use bare `npx`. The local SDK `auth --list`
reported `docsera-dev468303` as basic authentication for exactly
`https://dev468303.service-now.com/` (with a trailing slash in its stored URL).
No credentials, tokens, or passwords were printed or changed.

## Fresh read-only preflight

All target queries used the executable and explicit alias above.

- `sys_properties` returned `glide.appcreator.company.code = 2300756`.
- `sys_scope` returned no `x_2300756_docsera` or historical `x_82900_docsera` record.
- `sys_app` returned no Docsera, target-scope, or historical-scope application record.
- `sys_db_object` returned no table beginning `x_2300756_docsera`.

The target was therefore clean for the accepted scoped identity. No alias was
substituted and no credential restoration was needed.

## Preserved package recheck

The preserved RR-060 converted output was inspected without rebuilding,
reconverting, or regenerating it.

- Scope and scope ID remain `x_2300756_docsera` / `e6e43323accd4c7fb9271525a343850e`.
- `dist/app/update` contains 364 generated XML records.
- `src/fluent/generated/keys.ts` SHA-256 remains `EC4978C8CBC81C3829CBCD6E2672AF8DDF3CD6A9F61B77443F9FD28F0596784D`, matching the accepted RR-060 inventory.
- The installable generated output has zero old-scope (`x_82900_docsera`) or old scope-ID (`6997f092c3fd8310c569bf0d0501314d`) references and zero generated `<action>DELETE</action>` declarations.
- The candidate inventory remains 13 tables, 162 dictionary records, 3 roles, 49 ACLs, 65 server modules, 1 REST definition with 34 operations, 2 scheduled scripts, 1 UI Page, and 8 UX assets.

## Installation

After every preflight gate passed, the single authorized normal scoped install
was executed exactly once:

```powershell
& 'C:\Dev\Docsera-rr-060-converted-output-20261103-final\app\docsera-ui\node_modules\.bin\now-sdk.cmd' install `
  --source 'C:\Dev\Docsera-rr-060-converted-output-20261103-final\app\docsera-ui' `
  --auth docsera-dev468303
```

No `--reinstall`, incremental retry, Global companion installation, or
update-set import was used.

## Installed metadata evidence

Read-only explicit-alias queries confirmed the installed application and scope
are both `Docsera`, active, version `0.1.0`, with the expected scope ID
`e6e43323accd4c7fb9271525a343850e`. All 13 installed scoped tables have that
scope ID. The installed inventory matches the package candidate:

| Metadata | Installed count |
| --- | ---: |
| Tables (`sys_db_object`) | 13 |
| Dictionary records | 162 |
| Roles | 3 |
| ACLs | 49 |
| Server modules | 65 |
| REST definitions | 1 |
| REST operations | 34 |
| Scheduled scripts | 2 |
| UI Pages | 1 |
| UX assets | 8 |

## Scoped installed-runtime verification

The established `verify-sdk-runtime.mjs` script was run without its browser
proof, using the verified alias, exact stored instance URL (including its
trailing slash), scoped UI Page endpoint, and scoped REST ping path. It passed:

- authenticated SDK session and alias-to-instance match;
- UI Page HTTP 200, expected Docsera root/config markers, and current SDK-managed `main.jsdbx` asset HTTP 200;
- live `main.jsdbx` SHA-256 `dc20f5717417913c6bf7f95766f6b243c8e63c4e877dd6e7089efb5c5cc2840e` matched the local built bundle on the first propagation attempt;
- inline runtime CSS markers/probe were present and no legacy runtime-shell theme asset was found; and
- scoped REST ping returned HTTP 200 with the authenticated `x_2300756_docsera` status payload.

An initial verifier invocation without the trailing slash was rejected only by
its strict URL-string equality check; the same read-only verifier passed after
using the alias's exact stored URL. No browser proof was run. The absent Global
companion was not installed, imported, queried as a dependency, or used as
evidence.

## Validation boundaries

- Passed: task-worktree continuation guard; local SDK version and credential inventory; fresh target preflight; preserved-package/registry checks; one normal install; installed metadata counts; non-browser scoped runtime verification.
- Intentionally skipped: browser testing, live test-data creation, Global companion installation/import, `--reinstall`, a second installation, source conversion/regeneration, and full frontend validation.
