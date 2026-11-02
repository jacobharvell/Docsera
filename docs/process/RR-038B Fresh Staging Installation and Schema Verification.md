# RR-038B — Fresh Staging Installation and Schema Verification

Date: 2026-11-01

Status: **Installed and source-schema verified; the separately authorized scoped export completed under RR-038C.**

## Candidate and target

| Item | Verified value |
| --- | --- |
| Reviewed source | `505f596cb72de44b82ece4a9081c901fe5d41790` |
| Original base | `bc1cf30655928f20df03c195719e52f8920d2ace` |
| Target | `https://dev466253.service-now.com/` |
| Family/build | Brazil Patch 1 Hotfix 1; `glide-brazil-08-25-2026__patch1-hotfix1-10-10-2026_10-12-2026_0745.zip` |
| Identity | Docsera / `x_82900_docsera` / `6997f092c3fd8310c569bf0d0501314d` / `0.1.0` |
| SDK | repository-pinned `@servicenow/sdk` 4.8.1 |

The `docsera-pdi` basic-auth alias was interactively updated to the target and authenticated as `admin`. Pre-install read-only searches found no matching scope, application, tables, application-file metadata, Direct UI Page, or runtime assets. The task worktree guard passed at the reviewed SHA.

## Installation and installed inventory

One `npx --no-install now-sdk install --auth docsera-pdi` was run after the source build and generated-key verification passed. No reinstall, sample data, Global companion, version change, or manual metadata repair was performed.

Installed read-only inventory: 13 scoped tables, 34 REST operations, 49 ACLs, 65 server modules, one `docsera_sdk_runtime` UI Page, eight runtime assets, and two active scheduled jobs. These match the RR-038A candidate baseline. The scheduled jobs are Workspace Edit Lease Cleanup and Abandoned Workspace Icon Cleanup.

## Dictionary uniqueness

Installed `sys_dictionary` reports exactly these ten expected `unique=true` declarations:

1. `workspace.workspace_slug`
2. `workspace_icon_asset.asset_key`
3. `workspace_change_entry.generation_page_key`
4. `workspace_change_set.generation_key`
5. `workspace_edit_lease.workspace_key`
6. `workspace_mutation_claim.generation_key`
7. `workspace_page_snapshot.snapshot_page_key`
8. `workspace_removal_batch.batch_key`
9. `workspace_removal_member.batch_page_key`
10. `workspace_snapshot_set.snapshot_key`

## Physical indexes and qualification gap

`v_db_index` batch predicates returned no records, as documented for this virtual table. Table-scoped reads verified B-tree indexes named for the expected columns for `workspace_slug`, `generation_page_key`, `generation_key` (change set and mutation claim), `workspace_key`, `snapshot_page_key`, `batch_key`, `batch_page_key`, and `snapshot_key`. They also verified the separate `last_seen_on` B-tree index on edit leases. The view exposes table, index name, ordered columns, and access method but **no physical unique flag**. `asset_key` did not complete its table-scoped physical read before this report; its installed dictionary `unique=true` is verified.

Therefore dictionary metadata is installed exactly as expected, but neither the physical uniqueness flag nor duplicate rejection was proven. Do not infer future update-set-target uniqueness enforcement from dictionary presence alone.

## Runtime verification

`node ./scripts/verify-sdk-runtime.mjs --instance-url https://dev466253.service-now.com/ --auth-alias docsera-pdi --skip-browser` passed. It verified authenticated access, the UI Page and bundle HTTP 200 responses, local/live `main.jsdbx` hash equality (`c27c75e7a6a0a8113f35d8c27b16aa701c57d5fd3878ce253cefab349bced350`), inline runtime CSS invariants, no legacy runtime CSS asset, and scoped REST ping. Browser proof was intentionally skipped.

## Disposition

The fresh staging PDI is ready only for independent review and a **separately authorized** scoped-export decision. RR-037 historical export/checksum remains unchanged. Remaining gaps are the virtual-table physical-unique limitation, incomplete `asset_key` physical-index observation, and intentionally unperformed duplicate-record enforcement testing. No unexpected Docsera records or metadata-count discrepancies were observed.

## Validation

- continuation worktree guard — passed
- `npm run build` and generated SDK module-key verification — passed (third-party sourcemap/module-directive warnings only)
- read-only clean-target, installed-inventory, dictionary, and physical-index queries — completed as described
- focused non-browser runtime verification — passed
- `npm run validate:docs` and `git diff --check` — passed after this report edit
