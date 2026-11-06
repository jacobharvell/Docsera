# RR-077 — Controlled Scoped Export and Artifact Inspection

Date: 2026-11-04

Status: **Pass for independent installation qualification; not release approved.** This is a diagnostic scoped candidate only. No receiving-PDI import, preview, commit, functional test, Global-companion action, source cleanup, or manual XML filtering was performed.

## Provenance and publication boundary

The dedicated task worktree began clean at `41464a2825a209d797d13a25416dbbaf6442bd40` on branch `feature/rr-077-controlled-scoped-export`. Chrome was used to inspect and operate the native ServiceNow workflow on `https://dev468303.service-now.com/`; no SDK-generated or manually assembled substitute was used.

Before publication, the native Docsera application form confirmed:

| Property | Confirmed value |
| --- | --- |
| Development PDI | `dev468303` |
| Application | `Docsera` |
| Scope | `x_2300756_docsera` |
| Application sys_id | `e6e43323accd4c7fb9271525a343850e` |
| Application version | `0.1.0` |
| Application-file count shown by the form | 563 |
| Cross-scope privilege count shown by the form | 25 |

The native **Publish to Update Set** dialog retained version `0.1.0`; no release version was selected or incremented. It was submitted with **Include demo data** disabled and description `RR-077 Diagnostic Scoped Export — Not Release Approved`. The platform reported successful publication in 17 seconds and created 564 customer updates.

| Item | Value |
| --- | --- |
| Local update-set name / sys_id | `Docsera` / `f960e1ae1b94d3103b8ba6ca234bcb6f` |
| Local update-set state | `Complete` |
| Local update-set description | `RR-077 Diagnostic Scoped Export — Not Release Approved` |
| Customer updates | 564 |
| Exported remote update-set sys_id | `9af0a1a61b58d3103b8ba6ca234bcbbe` |
| Exported remote state | `loaded` |
| Exported app / scope / version | `Docsera` / `x_2300756_docsera` / `0.1.0` |
| Remote-update-set creation timestamp | `2026-11-04 21:07:39` (instance value) |
| Original Chrome download filename | `sys_remote_update_set_9af0a1a61b58d3103b8ba6ca234bcbbe.xml` |
| Preserved repository artifact | `app/docsera-ui/update-set/candidates/rr-077-controlled-scoped-export/docsera-scoped-v0.1.0-rr-077-diagnostic.xml` |
| Bytes / SHA-256 | 11,043,465 / `C826C5367F42FE1717E158FE5AF9B7AB4A62DF76DA4A174FAA1C059792DF4A18` |

The file was moved from Chrome's Downloads directory with a before/after SHA-256 comparison; the values matched. Its candidate-specific `.gitattributes` rule disables text conversion so the committed blob remains byte-identical to the native download.

## XML and decoded-payload inspection

The artifact has one `sys_remote_update_set` and 564 `sys_update_xml` records. All outer update actions and all decoded record actions are `INSERT_OR_UPDATE`; there are zero `DELETE` actions. All 564 embedded payloads parsed successfully.

| Payload record class | Count | RR-076 comparison |
| --- | ---: | --- |
| `sys_db_object` | 13 | Required 13 tables — pass |
| `sys_dictionary` | 162 | Required generated dictionary declarations — pass |
| `sys_documentation` | 162 | Platform field-label support metadata |
| `sys_ws_operation` | 34 | Required REST operations — pass |
| `sys_security_acl` | 49 | Required ACLs — pass |
| `sys_module` | 65 | Required server modules — pass |
| `sys_ux_lib_asset` | 8 | Required UX assets — pass |
| `sysauto_script` | 2 | Required scheduled scripts — pass |
| `sys_ui_page` | 1 | Required UI Page — pass |
| `sys_scope_privilege` | 25 | Accepted privilege inventory — pass |
| `sys_choice` | 20 | Platform choice metadata |
| `ua_table_licensing_config` | 13 | Platform table-support metadata |
| `sys_user_role` / `sys_user_role_contains` | 3 / 3 | Scoped role and containment metadata |
| `sys_app`, `sys_app_application`, `sys_app_module`, `sys_ws_definition` | 1 each | Application/menu/module/REST-definition metadata |

The 564 update records must not be mechanically compared with the 563 application-file count or RR-076's 364 generated XML containers. The export includes the application record and platform-generated supporting metadata (notably field labels, choices, and table licensing), while the inventory above separates those records from source-generated component families.

The serialized table identities are exactly the 13 expected `x_2300756_docsera_*` definitions: `page`, `workspace`, `workspace_change_entry`, `workspace_change_set`, `workspace_edit_lease`, `workspace_icon_asset`, `workspace_member_mutation_command`, `workspace_mutation_claim`, `workspace_page_snapshot`, `workspace_provision_request`, `workspace_removal_batch`, `workspace_removal_member`, and `workspace_snapshot_set`. The 34 decoded REST-operation payloads have distinct method/name identities; no duplicate update names were found across the 564 records.

### Required dictionary uniqueness declarations

Decoded `sys_dictionary` payloads contain exactly these ten `unique=true` declarations, all in the Docsera table prefix:

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

This proves serialization of the accepted dictionary declarations. As with RR-076, it does not qualify physical-index enforcement or duplicate rejection on a receiving instance.

### Ownership, privileges, and contamination checks

Every decoded payload with `sys_scope` or `sys_package` is owned by Docsera's application sys_id `e6e43323accd4c7fb9271525a343850e`; no foreign- or Global-owned payload metadata was found. The only Global references are the 25 `sys_scope_privilege.target_scope=global` records, which match RR-076's accepted privilege-packaging decision exactly:

- `global.DocseraGlobalWorkspaceMembershipBridge`;
- REST request/response interfaces: `RESTAPIRequest`, `RESTAPIRequestBody`, and the five `ScriptableServiceResult*` targets;
- workspace persistence/maintenance interfaces: the six `GlideRecord` methods, `GlideDigest.getSHA256Hex`, and `Glide API: string utilities`;
- membership interfaces: `sys_user`, `sys_user_group`, `sys_user_grmember`, and `Glide API: user roles and groups`; and
- attachment/media interfaces: `sys_attachment` plus the four `GlideSysAttachment` targets.

All are allowed scoped records targeting Global; none is transported as Global-owned configuration.

Targeted metadata-identity checks found no `x_82900_docsera`, `page_lock`, `C3`, `C4`, `probe`, or `rm_member` legacy identity. The current `workspace_removal_member` schema is present and is not the obsolete `rm_member` identity.

No decoded payload root is an application-domain `x_2300756_docsera_*` table, `sys_attachment`, or `sys_attachment_doc`. Thus this export contains schema/configuration metadata rather than workspace, page, user, demo, or attachment data. References to `sys_attachment` occur only in the accepted privilege and dictionary/configuration metadata, not as transported attachment rows. Native publication had demo data disabled, and no post-publication source-data mutation or cleanup was performed; the development application's observed identity and version remain `Docsera` / `x_2300756_docsera` / `0.1.0`.

## Recommendation

**Pass.** Retain and commit this intact diagnostic artifact and evidence report. It is suitable for a separately authorized independent installation qualification. It remains explicitly **not release approved**: no conclusion is made about receiving-instance import, preview, commit, physical uniqueness enforcement, or functional behavior.

## Validation performed

- Native Chrome/ServiceNow publication and export through **Publish to Update Set** then **Export to XML**.
- SHA-256 before/after artifact relocation and final checksum verification.
- Offline XML parse of the remote-update-set envelope and all 564 decoded customer-update payloads.
- Reconciliation of counts, expected table/unique/REST/ACL/module/asset/job/page families, privilege ownership/targets, actions, duplicate update identities, legacy identities, and data/attachment contamination.
- No frontend build, deployment, receiving-PDI import, preview, commit, or functional testing was run; those are out of scope.
