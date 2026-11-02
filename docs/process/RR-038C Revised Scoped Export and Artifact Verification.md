# RR-038C — Revised Scoped Export and Artifact Verification

Date: 2026-11-01

Status: **Scoped export completed and artifact inspected; stop before any clean-target import, preview, or commit.**

## Scope and provenance

The one explicitly authorized publish was performed from the fresh staging PDI at `https://dev466253.service-now.com/` for Docsera / `x_82900_docsera` / application sys_id `6997f092c3fd8310c569bf0d0501314d` / version `0.1.0`. The Publish to Update Set dialog showed **Include demo data** unchecked before submission. The platform completed publication successfully in 19 seconds.

| Item | Value |
| --- | --- |
| Local update set | `158eb22dc31c13100abcf3ddd40131e4` |
| Exported remote update set | `6edef26dc31c13100abcf3ddd40131bb` |
| Update-set state | `complete` |
| Customer updates | 541 |
| Preserved artifact | `C:\Users\jacob\Downloads\sys_remote_update_set_6edef26dc31c13100abcf3ddd40131bb.xml` |
| Artifact size | 10,968,855 bytes |
| SHA-256 | `7DE2729D3F2903EC6A9557A38605CF3E21B95DB62E34FB548C9ECA75199B6207` |

The downloaded XML is deliberately outside the tracked repository and was inspected without modification. No Global companion application or configuration was published. The historical RR-037 artifact remains untouched.

## Artifact inspection

The XML parsed as 541 customer-update records, all `INSERT_OR_UPDATE`; there were zero `DELETE` actions. The record-type inventory is:

| Type | Count |
| --- | ---: |
| Dictionary | 162 |
| Field Label | 162 |
| EcmaScript Module | 65 |
| Access Control | 49 |
| Scripted REST Resource | 34 |
| Choice list | 20 |
| Table | 13 |
| Table Subscription Configuration | 13 |
| UX Asset | 8 |
| Role | 3 |
| Contained Role | 3 |
| Cross scope privilege | 2 |
| Scheduled Script Execution | 2 |
| UI Page; Application Menu; Scripted REST API; Module; Custom Application | 1 each |

This matches the expected application inventory: 13 tables, 34 REST operations, 49 ACLs, 65 server modules, one Direct UI Page with eight assets, and two scheduled jobs. The three roles are `x_82900_docsera.admin`, `x_82900_docsera.workspace_admin`, and `x_82900_docsera.editor`; the three containment records are admin → workspace admin, workspace admin → editor, and admin → editor.

The artifact contains the expected authored privilege for `global.DocseraGlobalWorkspaceMembershipBridge` and the staging-observed runtime privilege for `ScriptableServiceResultBuilder.setBody`, both allowed `execute` privileges against Global. It does not contain the two additional runtime privileges seen in the older RR-037 artifact; this staging export was intentionally produced without executing extra runtime paths merely to manufacture privilege records.

No unexpected legacy target names matching `C3`, `C4`, page-lock, or `rm_member` were found. The retained `workspace_removal_member` records are current scoped schema, not a legacy `rm_member` surface.

## Dictionary uniqueness

Embedded dictionary payload inspection found exactly these ten `unique=true` declarations:

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

This proves that the declarations are serialized in this export. It does not prove physical unique-index enforcement or duplicate rejection after import; those remain a separately authorized clean-target experiment.

A bounded staging `v_db_index` read for `workspace_icon_asset.asset_key` returned no virtual-table records. Together with RR-038B's virtual-table limitation, this leaves physical uniqueness and duplicate rejection explicitly unqualified.

## Disposition and next boundary

The artifact is suitable for an independently authorized clean-target import/preview/commit evaluation only. It is not a customer-release qualification, and no import, preview, commit, reinstall, or duplicate-enforcement test was performed in RR-038C.

## Validation

- bounded preflight reads: identity, application-file count, privileges, dictionary declarations, and empty sample application tables
- supported ServiceNow UI publish and XML export: completed once; demo data excluded
- offline XML parse: 541 records; 0 deletes; inventory, embedded payloads, roles, containment, privileges, and uniqueness declarations inspected
- `npm run validate:docs`: passed
- `git diff --check`: passed
