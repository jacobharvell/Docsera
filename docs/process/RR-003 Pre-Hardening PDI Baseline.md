# RR-003 — Pre-Hardening PDI Baseline

Date: 2026-10-30
Status: preliminary preservation checkpoint; **not** a release-candidate freeze, export, backup, or portability proof.

## Purpose and boundary

This report records read-only evidence for the populated Docsera development PDI before release hardening, a possible Australia upgrade, an application export, or PDI replacement. It does not authorize or perform an export, deployment, update-set operation, platform upgrade, reset, deletion, or live browser smoke test.

“Confirmed” below means that a bounded, read-only `now-sdk query` response established the fact on the development PDI on 2026-10-30. “Source expectation” means committed source only; it is not evidence that the record is installed or portable. “Unavailable” is deliberately not a pass.

## Repository and package baseline

| Item | Evidence |
| --- | --- |
| Repository commit / base | `60f571158c9f41de3e1528438655f581a874935d` (`origin/main`; task branch began exactly here) |
| Scoped app | `app/docsera-ui`, package `docsera-direct-ui-page-runtime`, version `0.1.0` |
| Scoped identity | scope `x_82900_docsera`; scope ID `6997f092c3fd8310c569bf0d0501314d`; name `Docsera` |
| Global companion | `app/docsera-global-bridge`, package/version `0.1.0`; Global companion artifact manifest version `0.1.0` |
| SDK / platform developer dependencies | `@servicenow/sdk` `4.8.1`; `@servicenow/glide` `27.0.5`; TypeScript `^5.6.3`; Node `>=22` |
| Editor/runtime dependencies | Tiptap packages pinned to `3.27.3`; React `^18.3.1`; Vite `^5.4.10` |
| Known deployment relationship | The scoped Fluent project is the source for the scoped app. It owns the fallback Direct UI Page `x_82900_docsera_docsera_sdk_runtime.do`, SDK runtime assets, 13 active tables, REST API, roles/ACLs, and scheduled jobs. The separate Global companion owns authenticated `docsera.do` and provisioning/membership bridging. Scoped installation must precede the Global companion. |

Source evidence: `app/docsera-ui/now.config.json`, both package manifests/locks, `docs/process/Release Packaging Source Inventory - RR-001.md`, and `docs/process/RR-002 Native Scoped Installer Feasibility.md`.

## Confirmed development-PDI identity

Read-only SDK metadata queries confirmed:

| Observation | Confirmed value |
| --- | --- |
| ServiceNow family / build | `glide-australia-02-11-2026__patch2-04-17-2026_04-29-2026_2044.zip` (Australia, Patch 2) |
| Scope record | `x_82900_docsera`, `Docsera`, sys_id `6997f092c3fd8310c569bf0d0501314d`, version `0.1.0`, last updated `2026-07-02 16:51:24` |
| Application record | `Docsera`, scope `x_82900_docsera`, active, version `0.1.0`, sys_id `6997f092c3fd8310c569bf0d0501314d` |
| Global companion identity from committed artifact | Global scope; `Docsera Global Companion 0.1.0`; artifact revision `friendly-url-host-companion-r1`; remote update-set sys_id `9ba0df893a5160bb44e3b129e6080e04` |

The `sys_app` query also returned a separate historical application, `opendocs-tiptap-poc` (`x_82900_odoc2`). It is not treated as Docsera metadata, but it is a preservation consideration for any whole-PDI operation.

## Scoped footprint: expected versus observed

### Source expectation

RR-001 identifies 13 active production tables:

`workspace`, `page`, `workspace_provision_request`, `workspace_member_mutation_command`, `workspace_edit_lease`, `workspace_mutation_claim`, `workspace_change_set`, `workspace_change_entry`, `workspace_snapshot_set`, `workspace_page_snapshot`, `workspace_removal_batch`, `workspace_removal_member`, and `workspace_icon_asset` (all prefixed `x_82900_docsera_`).

The source additionally declares 20 choice sets, 65 choices, 45 active ACLs, three active scoped roles with three containment records, one REST definition with 34 active operations, two cleanup jobs, one scoped Direct UI Page, eight UI assets, and 65 active server modules in RR-001's fresh local-generation comparison. Those counts are source expectations, not PDI parity evidence.

### Instance evidence and preservation finding

The read-only `sys_db_object` query found all 13 source-active table names **and at least 21 additional scope-owned tables**. The extra records include historical/probe/legacy identities such as `x_82900_docsera_rm_member`, `x_82900_docsera_spike_claim`, C3/C4 probe tables, authority/fence/publication-candidate tables, and page-event/lock tables. This PDI is therefore not equivalent to the current active 13-table source footprint.

The `sys_user_role` query found the three source-active roles:

- `x_82900_docsera.editor`
- `x_82900_docsera.workspace_admin`
- `x_82900_docsera.admin`

It also found `x_82900_docsera.user` (“Default user role”), which is outside the current three-role source inventory. Preserve it and its role/membership relationships until a separately approved retirement decision exists.

The first broad REST query used an incorrect display-name predicate and returned no record; it does **not** establish REST absence. The actual source display name is `Docsera Runtime API` and service ID is `docsera_runtime`. No follow-on live enumeration was performed because the evidence task remains bounded. Treat REST operation parity as unavailable pending Jacob’s collection or a separately approved read-only evidence pass.

Dictionary/choice/ACL/job/UI-asset parity was not fully enumerated. The source file inventory remains the comparison basis, but the installed state must be preserved and independently captured before an instance-changing operation.

## Physical-index baseline

The source-grounded expected constraints are eight named unique indexes, one named nonunique index, and two column-level unique declarations:

| Source table | Expected physical index / column | Expected uniqueness |
| --- | --- | --- |
| workspace change entry | `generation_page_key_unique` on `generation_page_key` | unique |
| workspace change set | `generation_key_unique` on `generation_key` | unique |
| workspace edit lease | `workspace_key_unique` on `workspace_key` | unique |
| workspace edit lease | `last_seen_on_idx` on `last_seen_on` | nonunique |
| workspace mutation claim | `generation_key_unique` on `generation_key` | unique |
| workspace page snapshot | `snapshot_page_key_unique` on `snapshot_page_key` | unique |
| workspace removal batch | `batch_key_unique` on `batch_key` | unique |
| workspace removal member | `batch_page_key_unique` on `batch_page_key` | unique |
| workspace snapshot set | `snapshot_key_unique` on `snapshot_key` | unique |
| workspace | column `workspace_slug` | unique declaration |
| workspace icon asset | column `asset_key` | unique declaration |

This is source expectation, not a conclusion about installed physical index records. A read-only attempt to query `sys_db_index` was rejected by the instance as an invalid Table API table. A `sys_index` response did not expose the requested index-name/unique fields and was not sufficient to identify Docsera records or their columns. Consequently, **actual index sys_ids, tables, unique flags, ordered columns, active state, scope, and enforcement are unavailable**. Do not infer them from index names or source declarations.

Before an upgrade/export/replacement, Jacob should capture the index list and each index’s column relationship from the supported platform UI/export for all 11 entries above. Duplicate-rejection evidence is intentionally out of scope for this populated preservation PDI; it belongs on an explicitly approved disposable target.

## Global companion and bridge baseline

Source and RR-001 establish that the Global companion is a distinct, non-optional dependency today: it owns `docsera.do`, its host ACL, two bootstrap assets/source links, and membership/provisioning bridge artifacts. The committed manifest lists 27 update records, including nine scoped-to-Global privileges, one restricted caller access grant, two workers, two Script Includes, six modules, and the Global UI page/assets.

Installed Global record parity, the current ownership of `docsera.do`, its ACL, Global assets, scoped privileges, restricted caller access, and bridge worker state were **not queried**. These must be captured manually without disclosing scripts, tokens, or document/user content. A foreign `docsera.do` collision is a hard stop for any later Global import.

## Preservation set before any instance-changing operation

Metadata documentation is not a complete PDI backup. Before any Australia upgrade, scoped-app export, PDI replacement, reset, or other write operation, preserve:

1. A timestamped platform backup/snapshot or ServiceNow-supported recovery route for the whole PDI, confirmed by Jacob.
2. The application/scope records, app version, application files, update-set/application history, and the full scoped metadata inventory (including historical/probe records, not just active source).
3. All Docsera table data and attachments via an approved, secure export path; record only counts/checksums/manifests in shared evidence, never page/document bodies or user data.
4. Dictionary, choices, ACLs/role containment, REST definitions/operations, scheduled jobs, UI pages, UI assets, server modules, indexes and their columns, application/menu/modules, and Global bridge records.
5. Workspace-related ServiceNow groups and membership assignments; keep personal/user data out of this report and store any export securely.
6. Friendly-URL ownership (`docsera` page, ACL, assets) and Global scoped-privilege/restricted-caller-access state.
7. Source commit/package locks and hashes of every subsequently exported artifact. Do not hand-edit `sys_update_xml`.

## Jacob manual smoke checklist (not yet performed)

Perform after preservation, using suitable non-sensitive test content and recording pass/fail plus timestamp:

1. Open the scoped fallback host and `docsera.do`; hard-refresh each and confirm runtime assets load.
2. Open My Workspaces, navigate a workspace and page tree, and verify friendly URL routing/deep link.
3. Enter and leave Edit mode; confirm Live mode presents only published state.
4. Create/edit a test page, save draft, publish workspace/page as applicable, then verify reader-facing result.
5. Make a disposable pending change and exercise individual discard and discard-all; verify authoritative post-action state.
6. Check workspace admin/editor membership assignment/removal and expected permission denial for a user without access.
7. Exercise editor basics: block entry, formatting, Markdown/source mode switch and return, table/media behavior used by the accepted workflow, and unsaved-input warning/recovery behavior.
8. Confirm the friendly URL does not expose a foreign host, wrong application, stale asset, or unauthorized workspace.

Do not turn a smoke failure into an on-instance repair during this baseline task; capture it and stop for a separate scoped fix.

## Remaining evidence gaps and proceed conditions

This checkpoint is incomplete until Jacob supplies, at minimum:

- screenshots/exports of the supported platform pages showing family/build, application/scope/version, Global `docsera` host ownership, and application metadata counts;
- a redacted metadata inventory covering dictionary/choices, ACLs, REST definition plus 34 operations, jobs, UI pages/assets, server modules, navigation, roles/containment, Global bridge records, and all physical index definitions/columns;
- safe counts/checksums for records and attachments in each Docsera table, plus workspace groups/memberships, with no content or personal data copied into this report;
- smoke-check results above and any observed incompatibility; and
- confirmation that a recoverable PDI backup/snapshot/export set exists and where its secure retention owner is recorded.

An instance-changing operation may proceed only after the preservation set is retained, the evidence gaps are resolved or explicitly accepted by Jacob, the exact source/export candidate is named and hashed, and the operation has separate explicit approval. This report alone is not that approval.

## Evidence and validation

Read-only commands executed in the dedicated task worktree:

- `git fetch --prune origin`; task-worktree guard against the required base SHA.
- SDK help and query documentation review, then `now-sdk auth --list` and bounded `now-sdk query` calls against scope/application, platform build, tables, and roles. No credential/token output is recorded here.
- Focused source inspection of RR-001/RR-002, config/package metadata, Fluent table/index declarations, REST/scheduled-job declarations, and Global companion manifest.

Intentionally not run: SDK build/pack/install/transform, deployment, browser/PDI interaction testing, exports, update-set actions, index enforcement writes, test suites, or full frontend validation.
