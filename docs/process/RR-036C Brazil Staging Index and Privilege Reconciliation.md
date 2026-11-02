# RR-036C — Brazil Staging Index and Privilege Reconciliation

Date: 2026-11-01  
Status: **Read-only physical-index verification is partial — stop for independent review before export.**

## Scope and method

This report reconciles frozen source `bc1cf30655928f20df03c195719e52f8920d2ace` and the RR-036 Brazil baseline against the installed Brazil staging instance, `https://dev466136.service-now.com/`. No installation, deployment, export, mutation, duplicate-record test, or privilege/index/dictionary change was performed.

The repository-pinned SDK `4.8.1` alias `docsera-pdi` resolved to Brazil and read-only `now-sdk query` calls confirmed the installed Docsera scope (`6997f092c3fd8310c569bf0d0501314d`) and Docsera tables. This supersedes the earlier RR-036C alias-target mismatch statement.

The virtual table `v_db_index` is available to the Table API. Its installed dictionary defines `table_name`, `index_name`, `column_names`, and `access_method`, but no unique property. A bounded query on `x_82900_docsera_workspace` succeeded, then each relevant table was inspected separately (the virtual table did not return the equivalent `IN`/`STARTSWITH` batch predicates). The authenticated administrator UI was also read without edits: **System Definition → Tables → selected table → Database Indexes**. Its `v_index_creator` form likewise exposes index, access method, table, and column, but not a unique flag.

Therefore, this report treats physical index/table/column evidence as confirmed, dictionary `unique` values as confirmed only for column declarations, and named-index uniqueness as unverified. It does not infer uniqueness from a name, source declaration, or generated XML.

## Physical-index evidence

All listed physical entries were returned by installed `v_db_index` as `btree` indexes with the stated single ordered column. The `v_index_creator` administrator form independently showed the `generation_page_key` entry on `x_82900_docsera_workspace_change_entry` with the same table, column, and B-tree access method.

| Table | Frozen declaration | Installed `v_db_index` identity | Ordered installed column(s) | Unique evidence / disposition |
| --- | --- | --- | --- | --- |
| `x_82900_docsera_workspace` | column declaration `workspace_slug` | `workspace_slug` | `workspace_slug` | Dictionary `unique=true`: **verified** |
| `x_82900_docsera_workspace_change_entry` | `generation_page_key_unique` | `generation_page_key` | `generation_page_key` | Physical index verified; named-index unique flag **unverified** |
| `x_82900_docsera_workspace_change_set` | `generation_key_unique` | `generation_key` | `generation_key` | Physical index verified; named-index unique flag **unverified** |
| `x_82900_docsera_workspace_edit_lease` | `workspace_key_unique` | `workspace_key` | `workspace_key` | Physical index verified; named-index unique flag **unverified** |
| `x_82900_docsera_workspace_edit_lease` | `last_seen_on_idx` | `last_seen_on` | `last_seen_on` | Physical index verified; source declares `unique=false`; virtual/UI views do not independently expose that flag |
| `x_82900_docsera_workspace_mutation_claim` | `generation_key_unique` | `generation_key` | `generation_key` | Physical index verified; named-index unique flag **unverified** |
| `x_82900_docsera_workspace_page_snapshot` | `snapshot_page_key_unique` | `snapshot_page_key` | `snapshot_page_key` | Physical index verified; named-index unique flag **unverified** |
| `x_82900_docsera_workspace_removal_batch` | `batch_key_unique` | `batch_key` | `batch_key` | Physical index verified; named-index unique flag **unverified** |
| `x_82900_docsera_workspace_removal_member` | `batch_page_key_unique` | `batch_page_key` | `batch_page_key` | Physical index verified; named-index unique flag **unverified** |
| `x_82900_docsera_workspace_snapshot_set` | `snapshot_key_unique` | `snapshot_key` | `snapshot_key` | Physical index verified; named-index unique flag **unverified** |
| `x_82900_docsera_workspace_icon_asset` | column declaration `asset_key` | `asset_key` | `asset_key` | Dictionary `unique=true`: **verified** |

### Identity reconciliation

The eight source-declared names ending in `_unique` and the nonunique `last_seen_on_idx` do **not** appear verbatim in Brazil's physical-index view. The installed physical identities are the respective column names. This is a confirmed source-to-installed naming difference, not proof of missing indexes: every expected physical indexed column is present on its expected table. The current virtual-table/UI evidence cannot establish whether the platform normalized the physical names during installation or whether a source declaration was otherwise transformed.

The read-only dictionary query reported `unique=false` for the eight named-index columns. That field is a column-level declaration, not an authoritative representation of a named index's unique flag; it must not be used to call those physical indexes nonunique. Conversely, `workspace_slug` and `asset_key` are explicitly column-level unique declarations and report `unique=true`.

## Cross-scope privilege

Installed `sys_scope_privilege` metadata confirms one additional allowed privilege:

| Field | Installed Brazil value |
| --- | --- |
| Record sys_id | `efa3ca2dc35c1310540433bc05013124` |
| Source scope / owning app | `x_82900_docsera` / Docsera (`6997f092c3fd8310c569bf0d0501314d`) |
| Target scope | Global (`global`) |
| Target name / type | `ScriptableServiceResultBuilder.setBody` / `scriptable` |
| Operation / status | `execute` / `allowed` |
| Created / updated | `2026-11-01 21:05:21` UTC by `admin`; unchanged (`sys_mod_count=0`) |
| Application-file membership | Installed `sys_update_xml` `7ba3ca2dc35c1310540433bc05013129`, name `sys_scope_privilege_efa3ca2dc35c1310540433bc05013124`, application Docsera, action `INSERT_OR_UPDATE`, update domain `global` |

The `sys_metadata` row has class `sys_scope_privilege` and Docsera scope. The installed update record establishes membership in the application’s recorded metadata; it does **not** establish whether a future scoped export preview will include the record. Frozen source has no authored definition for it, while 29 REST handlers call `response.setBody(...)`. The privilege is therefore a plausible platform-generated runtime dependency, consistent with Runtime Access Tracking, but its creation mechanism is still inference rather than a directly observed platform event. Do not create, delete, modify, or manually package it.

## Export-readiness disposition

- Physical index presence, table association, ordered columns, and B-tree access method: **verified** for all 11 expected constraints.
- Column-level uniqueness: **verified** for `workspace_slug` and `asset_key`.
- Named-index uniqueness: **unverified** for the eight expected unique indexes; the nonunique `last_seen_on` physical index is present, but the physical unique flag is not exposed by either permitted inspection path.
- Source-to-installed index names: all nine named declarations differ from installed physical identities as described above; no expected indexed column is missing.
- Additional cross-scope privilege: installed values, source/target ownership, status, sys_id, and installed application-file/update membership are **verified**. Its runtime-tracking provenance and future export inclusion remain **inference / export-preview checks**.

Brazil staging can proceed only to the separately authorized RR-037 **controlled export experiment**, not as a fully qualified physical-index installation. RR-037's scoped export preview must explicitly check: (1) whether the `ScriptableServiceResultBuilder.setBody` update record is included and classified as expected; (2) the reason/behavior behind the source-to-physical index-name normalization; and (3) the unique flag for each of the eight named indexes. If export preview cannot establish those facts, stop before export/install approval and retain the unverified disposition.

## Validation

Required after this report edit: `npm run validate:docs` and `git diff --check`. No product tests, build, deployment, export, or duplicate-key enforcement tests are applicable to this documentation-only, read-only task.
