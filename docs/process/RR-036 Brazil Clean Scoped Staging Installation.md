# RR-036 — Brazil Clean Scoped Staging Installation

Date: 2026-11-01

Status: **Partially verified — do not begin the controlled export experiment until independent review resolves the privilege-inventory difference and the index-verification gap.**

## Frozen candidate and target

| Item | Result | Classification |
| --- | --- | --- |
| Source branch / reviewed commit | `release/batch-g4-distribution-packaging` / `417c8f231b0fce6d51437da84fdfb2874bf0530b` | Verified |
| Frozen application-source baseline | `bc1cf30655928f20df03c195719e52f8920d2ace` | Verified |
| Identity | `Docsera`; `x_82900_docsera`; scope sys_id `6997f092c3fd8310c569bf0d0501314d`; version `0.1.0` | Verified |
| Target | `https://dev466136.service-now.com/` | Verified |
| Family/build | Brazil Patch 1 Hotfix 1; `glide-brazil-08-25-2026__patch1-hotfix1-10-10-2026_10-12-2026_0745.zip` | Verified |
| SDK and authentication | committed `@servicenow/sdk` `4.8.1`; basic-auth alias `docsera-pdi` resolving to the target origin | Verified |

The continuation task-worktree guard passed before inspection: clean worktree, expected `HEAD`, and merge-base at the frozen baseline. `now.config.json` carried the required fixed identity.

## Pre-install guard

Bounded authenticated read-only queries found zero existing records for the Docsera scope/application, tables, UI Page, UI assets, ACLs, roles, scheduled jobs, server script includes, or dictionary records. The target was therefore clear of the checked source-owned metadata families before the installation.

No identity, version, or target metadata was modified to obtain that result.

## Installation

The single authorized command was run from `app/docsera-ui`:

```text
npx --no-install now-sdk install --auth docsera-pdi
```

The SDK reported installation start and authenticated as `admin` against the Brazil target. Post-install read-only inventory and runtime evidence below confirm the scoped application was installed. The terminal wrapper detached before the SDK's final summary was available, so a definitive SDK warning/rejected-record summary is **Unverified**; no warning or rejected-record line was observed before detachment. No second install, reinstall, transform, metadata change, sample data operation, export, or Global companion deployment was performed.

## Installed metadata comparison

| Family | Expected from RR-034 | Installed result | Classification |
| --- | ---: | ---: | --- |
| Application/scope/version | fixed identity / `0.1.0` | exact fixed identity / `0.1.0` | Verified |
| Production tables | 13 | 13 | Verified |
| REST operations | 34 method/path identities | 34 under `Docsera Runtime API`; method/path inventory matched | Verified |
| ACLs | 49 | 49 | Verified |
| Scoped roles / containment | 3 / 3 | 3 / 3; `admin` contains `workspace_admin` and `editor`, `workspace_admin` contains `editor` | Verified |
| Server modules | 65 | 65 | Verified |
| Scoped UI Page / generated assets | 1 / 8 | `docsera_sdk_runtime` / 8 | Verified |
| Scheduled jobs | 2 | Edit Lease Cleanup and Abandoned Workspace Icon Cleanup, active | Verified |
| Dictionary / choices / references | generated metadata | 240 dictionary records and 65 choices; inspected installed reference fields | Verified |
| Physical indexes and columns | inspect identities, columns, uniqueness | `sys_index` Table API access returned HTTP 403; `sys_index_columns` is not an available Table API table | Unverified |
| `rm_member`, C3/C4, page-lock, probe tables or REST operations | absent | zero matching scoped table and REST-operation records | Verified |

The eight installed assets were the expected runtime main bundle plus the Markdown source, editor-host, and editor-mount chunks and their source maps. No Global `docsera.do` host was installed or evaluated.

### Scoped privilege observation

RR-034 documents one emitted scoped-to-Global privilege, `global.DocseraGlobalWorkspaceMembershipBridge` / `execute` / `allowed`; it is installed as expected. The installed target also has `ScriptableServiceResultBuilder.setBody` / `execute` / `allowed`. The latter has no matching emitted `sys_scope_privilege` XML in the fresh SDK output. It may be a ServiceNow-generated dependency of the runtime, but that provenance was not established by this task. This is an **Unverified inventory difference**, not a metadata cleanup authorization.

## Scoped runtime verification

The required strict invocation was run with the specified overrides:

```text
node ./scripts/verify-sdk-runtime.mjs --auth-alias docsera-pdi --instance-url https://dev466136.service-now.com --skip-browser
```

It failed before runtime checks because `verify-sdk-runtime.mjs` compares the supplied URL to the credential-store URL as raw strings; the stored canonical URL has a trailing slash. The origins are identical. No source change was made to the frozen candidate.

The same verifier was then run read-only with the stored canonical URL (`https://dev466136.service-now.com/`) and passed. It verified authenticated page HTTP 200, mount/config markers, current local/live `main.jsdbx` SHA-256 equality (`c27c75e7a6a0a8113f35d8c27b16aa701c57d5fd3878ce253cefab349bced350`), inline CSS marker/probe, no legacy runtime CSS asset, and an authenticated scoped REST ping (`scope=x_82900_docsera`, `status=ok`). Browser proof was explicitly skipped.

## Staging disposition

The clean scoped installation, core metadata inventory, and non-browser runtime are **Verified**. The staging instance is **not yet cleared for the next controlled export experiment**: independent review must first classify the unexpected `ScriptableServiceResultBuilder.setBody` privilege and establish a permitted read-only way to verify actual physical index identities, columns, and uniqueness. Duplicate-record enforcement was intentionally not tested.

## Validation record

Run:

- task-worktree guard in continuation mode;
- `npm run verify:sdk-module-keys` and SDK install prerequisite check;
- `npm run build` (fresh SDK output);
- exactly one `now-sdk install` attempt with `--auth docsera-pdi`;
- bounded authenticated read-only metadata queries;
- non-browser runtime verification (strict URL attempt plus canonical-URL evidence run).

Intentionally not run: frontend/editor suites, browser automation, Global host checks, export/update-set operations, sample data creation, role assignment, destructive index enforcement checks, or any second installation attempt.
