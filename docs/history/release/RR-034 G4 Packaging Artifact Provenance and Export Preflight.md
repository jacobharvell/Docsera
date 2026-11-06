# RR-034 — G4 Packaging Artifact Provenance and Export Preflight

Date: 2026-11-01
Status: preflight evidence only — not an installer claim, source-instance export, PDI deployment, or clean-install qualification.

## Decision summary

The current source can reproducibly produce a **developer-installable SDK ZIP**, but that ZIP is not established as a customer-importable ServiceNow artifact. ServiceNow update sets do not transport database-index creation. RR-038A therefore represents single-column uniqueness through transportable `sys_dictionary.unique=true` metadata rather than through named `sys_index` declarations. This removes the former source-level dependency on index transport for the ten one-column unique fields, but does not establish an ordinary customer-installation path or clean-target success.

The existing populated development PDI is **not a credible export source** unless its application-version export membership can first be demonstrated to exclude every unowned installed record. RR-018 found active C3/C4, page-lock, probe, and host-spike residue, including an active legacy Business Rule on a production table. Do not clean, hand-filter, or publish from that PDI for this experiment.

## RR-038A revised source candidate

RR-038A starts from the frozen RR-037 source revision `fa0cd2482d62909d67bb05275111c2c56d67db4d` (whose base is `bc1cf30655928f20df03c195719e52f8920d2ace`) and creates a revised source candidate without interacting with Brazil staging. The original RR-037 export remains immutable historical evidence: remote update set `4c702e61c3505310540433bc05013123`, downloaded XML `sys_remote_update_set_4c702e61c3505310540433bc05013123.xml`, 10,973,157 bytes, SHA-256 `CF5E120AE5703F812E9A4ED8A8D9AC52F7E8FE886FB96ED01E93084B84DD33AD`.

The pinned `@servicenow/sdk` `4.8.1` `Column` contract declares `unique?: boolean` and documents it as creating a unique index on the field. Fresh local generation confirms that column-level `StringColumn({ unique: true })` emits `sys_dictionary` records with `unique=true`. The revised source uses that form for these eight fields and removes their redundant named unique-index declarations:

| Table | Unique field |
| --- | --- |
| `x_82900_docsera_workspace_change_entry` | `generation_page_key` |
| `x_82900_docsera_workspace_change_set` | `generation_key` |
| `x_82900_docsera_workspace_edit_lease` | `workspace_key` |
| `x_82900_docsera_workspace_mutation_claim` | `generation_key` |
| `x_82900_docsera_workspace_page_snapshot` | `snapshot_page_key` |
| `x_82900_docsera_workspace_removal_batch` | `batch_key` |
| `x_82900_docsera_workspace_removal_member` | `batch_page_key` |
| `x_82900_docsera_workspace_snapshot_set` | `snapshot_key` |

The fresh metadata has exactly ten `sys_dictionary` fields with `unique=true`: those eight plus existing `x_82900_docsera_workspace.workspace_slug` and `x_82900_docsera_workspace_icon_asset.asset_key`. The fresh ordinary update output remains 13 tables, 34 REST operations, 49 ACLs, 65 server modules, eight UX assets, and one authored scoped-to-Global privilege. The SDK-generated key registry marks the eight removed named indexes deleted, but the ordinary update output emits no converted `sys_index` action. The only generated `sys_index` artifact remains the historical author-elective `DELETE` for `x_82900_docsera_rm_member(removal_batch,page)`; its absence from the historical RR-037 export is not a required deletion for a clean installation.

`last_seen_on_idx` remains an explicit nonunique index on `x_82900_docsera_workspace_edit_lease.last_seen_on`. Because the update-set limitation also applies to that `sys_index`, an update-set target cannot rely on receiving its query-performance optimization. It is not a uniqueness requirement and was intentionally deferred for a separate portability/performance decision.

Changing an existing Brazil installation is not safe to infer from local generation. Brazil may already have historical physical named indexes and data; applying dictionary uniqueness could collide with an existing index definition, duplicate data, or platform index-reconciliation behavior. An SDK install or reinstall must not be assumed safe. Prove this revised candidate first on a fresh source-clean instance, then separately authorize target import/preview/commit and duplicate-enforcement testing.

## Candidate provenance

| Item | Verified fact |
| --- | --- |
| Source revision | `bc1cf30655928f20df03c195719e52f8920d2ace` (`origin/main` base for this task) |
| Scoped identity | `Docsera`; scope `x_82900_docsera`; scope sys_id `6997f092c3fd8310c569bf0d0501314d` |
| Scoped source package version | `0.1.0` (`docsera-direct-ui-page-runtime`) |
| SDK | `@servicenow/sdk` `4.8.1` (committed lockfile) |
| SDK package | `target/docsera_direct_ui_page_runtime_0_1_0.zip` |
| SDK package size / SHA-256 | 3,975,549 bytes; `419C29313C4C6A78A92D29A49C36F5E6ED708C28805DD6298E2B0379E017E4D2` |
| Generated metadata location | `app/docsera-ui/dist/app/update` |
| Package inventory | `app/docsera-ui/dist/app/package_inventory.csv` |

`now-sdk pack` describes the ZIP as an installable artifact for the SDK workflow. It is **not** evidence that the archive can be imported through the ordinary retrieved-update-set UI, nor evidence of cross-organization entitlement or clean-instance success. The ZIP, build output, and inventory remain ignored local output and are intentionally not committed. A final release must regenerate every artifact from its approved release commit/tag; this technical packaging candidate is not a v1 release designation.

## Scoped generated-metadata reconciliation

### Verified generated contents

The fresh build and explicit XML identity inspection found the following current scoped output. All inspected table and REST-operation records use `INSERT_OR_UPDATE`.

| Family | Fresh result | Reconciliation |
| --- | ---: | --- |
| Production custom tables (`sys_db_object`) | 13 | Matches the active source-owned table set in RR-001. |
| REST definition | 1 (`docsera_runtime`) | Expected. |
| REST operations | 34 | Matches the corrected RR-001 total. The records cover the expected `ping`, workspace, membership, media/icon, change/publish, edit-lease, and page routes. |
| Scoped roles / containment | 3 / 3 | Expected: `.editor`, `.workspace_admin`, `.admin`; containment records preserve the source hierarchy. |
| ACLs | 49 | Current generated result. RR-001's earlier 45-ACL baseline predates four provisioning-request deny ACLs now present in source. This preflight found no legacy family among these 49 generated identities. |
| Scoped-to-Global privilege | 1 | `execute` on `global.DocseraGlobalWorkspaceMembershipBridge`, `allowed`. |
| Scheduled jobs | 2 | `Docsera Workspace Edit Lease Cleanup` and `Docsera Abandoned Workspace Icon Cleanup`. |
| UI pages / runtime assets | 1 / 8 | Direct page `docsera_sdk_runtime`; the emitted asset records and modules accompany the SDK runtime. |
| Server modules | 65 | Matches RR-001's active generated count; the generated-key registry retains 66 identities. |
| Choices / dictionary | Generated as current SDK update metadata | Current output contains standalone `sys_choice`/`sys_dictionary` update records as well as table definitions. Their physical clean-instance creation and enforcement still require target validation. |

The 13 generated table names are exactly: `x_82900_docsera_workspace`, `x_82900_docsera_page`, `x_82900_docsera_workspace_provision_request`, `x_82900_docsera_workspace_member_mutation_command`, `x_82900_docsera_workspace_edit_lease`, `x_82900_docsera_workspace_mutation_claim`, `x_82900_docsera_workspace_change_set`, `x_82900_docsera_workspace_change_entry`, `x_82900_docsera_workspace_snapshot_set`, `x_82900_docsera_workspace_page_snapshot`, `x_82900_docsera_workspace_removal_batch`, `x_82900_docsera_workspace_removal_member`, and `x_82900_docsera_workspace_icon_asset`.

The 34 generated operation identities were checked as method/path pairs under `/api/x_82900_docsera/docsera_runtime`: `GET /ping`; workspace `GET`/`POST /workspaces`, `POST /workspaces/delete`, `PUT /workspaces/settings`, `GET /workspace-provisioning-status`; membership `GET`/`PUT /workspaces/members`, `POST /workspaces/members/remove`, `GET /workspaces/members/search-users`; pending/publish/discard/recovery `POST /workspaces/pending-changes`, `/publish`, `/discard-all`, `/discard-page`, `/recover-body-save`; edit lease `POST /workspaces/edit-lease/{acquire,end-previous-session,release,renew,resume,status}`; media/icon `POST /workspaces/icons`, `GET /workspaces/icons/file`, `GET`/`POST /workspaces/media`, `GET /workspaces/media/file`; and pages `GET`/`POST`/`PATCH`/`PUT`/`DELETE /pages`, plus `POST /pages/delete`, `/pages/move`, and `/pages/publish`.

### Retained identities and exclusions

The generated-key registry still contains historical identities, including the `x_82900_docsera_rm_member` proof table, its ACL identities, an initial-admin-users module, and a historical REST-operation identity. These are registry retention, not emitted production metadata: the fresh output has 13 tables, 65 modules, and 34 operations and contains **no** matching `rm_member` output record.

An explicit scan of generated update metadata found no C3/C4, page-lock, serialization/probe, coordination/authority, or standalone-host-spike record identity/path. This is the required source-artifact exclusion evidence; it does not prove what a populated instance would include in a future platform export.

The generated build retains one historical author-elective `sys_index` `DELETE` record. RR-037C established that the prior platform export omitted all `sys_index` payloads, including that deletion. Do not treat the omitted historical deletion as required for a clean installation. Schema validation on the clean target must inspect actual dictionary, choices, references, unique-field enforcement, and duplicate rejection; filename/layout changes alone do not prove installed enforcement.

## Global companion comparison

The committed Global artifact was inspected without regeneration:

| Item | Verified fact |
| --- | --- |
| Artifact | `app/docsera-global-bridge/update-set/sys_remote_update_set_docsera_global_companion_0_1_0.xml` |
| Manifest identity/version | `Docsera Global Companion 0.1.0` / `0.1.0` |
| Committed repository bytes (GitHub XML, LF) | 119,998 bytes; SHA-256 `b23eb99faaddcbeb380d9ad9341690c8235176b6b0430b80e345d4d90cbfcbc8` |
| Windows working-tree representation (CRLF) | 122,466 bytes; SHA-256 `6dfa17e578b2cbd1a72449de93ad1a389f8864d85f1b809517028c4cf1d23b1b` (2,468 line endings converted) |
| Records | 27: 6 `sys_module`, 9 `sys_scope_privilege`, 2 `sys_script`, 2 `sys_script_include`, 1 each `sys_security_acl`, `sys_security_acl_role`, `sys_ui_page`, `sys_restricted_caller_access`, `sys_package`, and `sys_scope`, plus 2 `sys_ux_lib_asset` |
| Host | Global `sys_ui_page` `docsera` (`docsera.do`), with its authenticated-host ACL and two bootstrap assets |

The focused package-content and friendly-host verification passed. The Global set carries the scoped-to-Global privileges and restricted-caller-access reference required by the membership bridge. It must be imported **after** the scoped application because those references use the scoped app's fixed scope identity and its tables/roles/runtime. Its author-elective `sys_security_acl_role` record is a deletion retiring a temporary editor-only host binding; preview must review it as a deletion. Final release checksums must be calculated from the exact distributed artifact bytes after release packaging; a checkout-dependent checksum is not a universal release identifier.

Before any Global commit, a target must prove that `docsera` is absent or is the documented Docsera-owned identity. A foreign `docsera.do`, non-Docsera ACL, or conflicting bootstrap asset is a hard stop—do not overwrite by name.

## Export-source readiness

### Verified contamination finding

RR-018's read-only development-PDI inventory found accepted metadata plus unowned C3/C4 tables/modules/REST operations, old page-lock and serialization metadata, and a standalone-host spike. Crucially, `Docsera Workspace C4 Origin Provisioning` is an active after-update Business Rule on `x_82900_docsera_workspace_provision_request`; it can write C4-origin state from an accepted workflow. SDK generation from this repository does not remove installed records, and publishing an application to an update set must not be assumed to filter them merely because they are absent from source.

### Recommendation

Use a disposable source-clean staging PDI on the selected target family. Install the frozen candidate using the authenticated SDK/developer workflow only to create the source-instance application/version state, then inspect that instance against the source inventory before considering *Publish to Update Set*. Do not create sample workspaces, pages, attachments, provision requests, or user/group data; configuration export must be demonstrated to exclude data and the source must remain data-clean. Preserve the development PDI unchanged.

Freeze the source SHA and application/version identity before export; do not change the version while exporting. Capture the source app/version record, scope and package records, application files/version membership, table/role/page/asset/REST/job/ACL/privilege inventories, and the absence of sample data before the export. Preserve the exported scoped XML/archive unchanged, hash it, and compare its record identities and any deletes to the source-owned inventory above. Capture the post-export same inventory plus export/update-set membership and all warnings. No manual `sys_update_xml` filtering or historical-record cleanup is authorized.

Stop the export or target experiment if any of the following occurs: membership includes an RR-018 historical identity or other unowned record; a required source-owned family/identity is absent; the source has sample data selected for transport; source app/version/scope identity changes unexpectedly; an unapproved delete is present; a target collision is foreign; preview has an unresolved error/skipped dependency/conflict; or either artifact differs from the recorded hash/manifest.

## Next authorization gate

Jacob's explicit approval is required before any source-instance application installation/version action, publish-to-update-set/export, retrieved-update-set import/preview/commit, or initial role assignment. Those operations can create or change ServiceNow configuration records, application/version metadata, update-set records, and target metadata.

Approved execution would produce only a frozen scoped platform-export artifact and the already committed Global companion as an ordered pair (scoped first, Global second). The developer SDK ZIP is supporting provenance, not the candidate customer-import artifact. Before target installation, compare both artifacts by record identity against the frozen source inventory and capture hashes, source SHA, version, target family/build, preflight searches, previews, and commits.

On a genuinely clean supported target, test the scoped artifact first and the Global companion second: application/scope/fixed-sys-id and `docsera.do` collision behavior; all 13 tables; fields/references/choices; index identity and duplicate enforcement; 34 REST operations; roles/ACLs/containment; privileges/RCA; jobs; direct and friendly hosts including assets/lazy chunks; initial-admin/bootstrap workflow; representative allow and denial paths; update/uninstall behavior; and foreign friendly-URL collision. Do not add records by hand to make a result pass.

## Unresolved questions and technical limits

- A clean-target experiment has not established target-family compatibility, SDK ZIP UI importability, update-set completeness, entitlement, upgrade/uninstall behavior, or a consumer-grade installation experience. The revised dictionary-unique source has not yet been installed, exported, or imported anywhere.
- The retained nonunique `last_seen_on_idx` remains nonportable through update sets; target-side lease-cleanup query performance is unproven and needs a separate portability/performance assessment.
- The current output's 49 ACL count includes four provisioning-request deny ACLs added after RR-001's earlier 45-ACL baseline; standalone choice/dictionary records also differ from its 2026-10-30 observations. This is a documentation-baseline mismatch, not a demonstrated product defect; freeze and reconcile exact identities before release export.
- The official platform material still treats the SDK build/install flow as a developer workflow and update-set publication as an export capability. Update sets remain outside ServiceNow's recommended ordinary application-installation path. See the official [SDK build/install guidance](https://www.servicenow.com/docs/r/application-development/servicenow-sdk/build-deploy-application-now-sdk.html), [application-sharing guidance](https://www.servicenow.com/docs/r/application-development/c_SharingApplications.html), and [update-set planning guidance](https://www.servicenow.com/docs/r/xanadu/application-development/system-update-sets/get-started-update-sets.html).

## Validation record

- `npm ci`, `npm run build`, and `npm run verify:sdk-module-keys` in `app/docsera-ui` — passed. The build reported pre-existing third-party sourcemap/module-directive warnings but completed.
- `npm exec -- now-sdk pack` — passed; emitted the ZIP above.
- Fresh generated-metadata XML/identity and package-inventory inspection — completed.
- `npm ci`, `npm run test:friendly-url-host`, and `npm run verify:friendly-url-host` in `app/docsera-global-bridge` — passed (5 tests).
- Intentionally not run: PDI/browser activity, source export, deployment, clean installation, broad frontend/editor suites, Global regeneration, or release-version changes.
