# RR-076 — Scoped Consumer Export Readiness

Date: 2026-11-04
Status: **Ready for controlled export — the complete installed privilege inventory is Docsera-owned runtime/application metadata; no privilege-specific blocker remains. Stop before publication.**

## Decision

`dev468303` is **ready for a separately authorized, controlled Publish to Update Set**. The focused review accounts for every one of the 25 installed cross-scope privileges: the authored Global membership bridge plus 24 Docsera-owned, Allowed runtime/application records. Every runtime record has matching `sys_metadata` ownership and ordinary Docsera `sys_update_xml` membership (`Cross scope privilege`, `INSERT_OR_UPDATE`). This is the same ownership/membership pattern accepted in RR-037 for runtime-generated privileges; it is not historical contamination merely because Fluent does not declare the privilege.

This is a pre-publication recommendation only. No publication, export, import, data cleanup, or PDI mutation was performed.

The earlier alias failure is no longer reproducible. The repository-pinned executable is `app/docsera-ui/node_modules/.bin/now-sdk.cmd` at SDK `4.8.1`; it listed `docsera-dev468303` as the default basic-auth alias for exactly `https://dev468303.service-now.com` (without a trailing slash in the current stored value). It ran as Windows identity `DESKTOP-JIRC0Q8\admin` with `SN_SDK_CREDENTIALS_DIR` unset, matching the RR-061 / previously successful installation context: same pinned SDK version, explicit alias, administrator identity, and default credential-store location. No credential contents were read, changed, printed, or saved.

The prior observation that only `docsera-source` was listed cannot be attributed from available evidence to process identity, environment override, or an absent alias: all currently observable context matches the successful one. It may have been a transient/local credential-store state change outside this task; its timing and cause are **Unverified**. No credential reconfiguration is required now.

## Frozen source provenance

| Property | Observed source value |
| --- | --- |
| Repository / task base | `C:\Dev\Docsera`, `origin/main` = `b91bc389e4f66c5a49130988fc5a2eac28a9dffa` |
| Task branch | `feature/rr-076-scoped-consumer-export-readiness` |
| Scoped application | `Docsera` |
| Scope | `x_2300756_docsera` |
| Application sys_id | `e6e43323accd4c7fb9271525a343850e` |
| Source package version | `0.1.0` (`app/docsera-ui/package.json`); explicitly not an approved public-release version |
| Current Global-consumer boundary | RR-074 independently references the same scope and application sys_id; its Global companion is separate and was not regenerated or inspected on a PDI |

`app/docsera-ui/now.config.json`, the committed generated key registry, and the current source agree on the scoped identity above.

## Source-generated inventory

The task-local `npm run build` completed Fluent type checking and generated `app/docsera-ui/dist/app/update`. The source-only build reported the known non-fatal Tiptap sourcemap/module-directive warnings. The generated update metadata had the following scoped inventory:

| Family | Expected / observed generated count |
| --- | ---: |
| Custom tables (`sys_db_object`) | 13 |
| Dictionary rows | 162 |
| Required `unique=true` dictionary declarations | 10 |
| Scripted REST resources | 34 |
| ACLs | 49 |
| Server modules | 65 |
| UX assets | 8 |
| Scheduled scripts | 2 |
| UI Pages | 1 |

The ten generated unique declarations are `workspace.workspace_slug`, `workspace_icon_asset.asset_key`, `workspace_change_entry.generation_page_key`, `workspace_change_set.generation_key`, `workspace_edit_lease.workspace_key`, `workspace_mutation_claim.generation_key`, `workspace_page_snapshot.snapshot_page_key`, `workspace_removal_batch.batch_key`, `workspace_removal_member.batch_page_key`, and `workspace_snapshot_set.snapshot_key` (all under the `x_2300756_docsera` table prefix). This satisfies the task-specific source-generation check.

The generated output contained 364 update XML files, all carrying the current scope identity, and no `<action>DELETE</action>` record. The source contains the expected scoped-to-Global membership-bridge privilege. Its one `Record(...)` declaration is the application-menu launch configuration, not workspace/page/user sample data; no source-defined demo workspace, page, user, or attachment records were identified.

The counts reconcile with the current accepted component model and the prior successful scoped-export model in RR-038C, while recognizing that RR-038C used the earlier `x_82900_docsera` identity and is historical evidence only.

## Installed-PDI evidence matrix

All reads used the pinned SDK, explicit `docsera-dev468303` alias, `-o json`, explicit fields, and bounded pagination. No query mutated the PDI.

| Required read-only check | Result | Interpretation |
| --- | --- | --- |
| Installed `sys_scope` / application identity and version | **Confirmed:** one active `Docsera` scope and application, `x_2300756_docsera` / `e6e43323accd4c7fb9271525a343850e`, version `0.1.0`. | Matches the frozen source identity. |
| Application-file membership | **Confirmed:** the complete scoped `sys_metadata` read contains 563 records, including all 25 `sys_scope_privilege` rows. | The count includes platform-generated/supporting classes (162 documentation rows, 20 choices, 13 table-licensing rows, etc.); it must not be compared mechanically to the 364 generated XML containers. The 24 non-Fluent privileges are owned application metadata, not an unowned surplus. |
| Current recorded application updates | **Confirmed:** 24 `sys_update_xml` records reference this application; all are `Cross scope privilege` / `INSERT_OR_UPDATE`. No matching `DELETE` record was returned. | Each row matches one of the 24 runtime privileges below. The authored membership bridge is installed application metadata but is not a current update row. This is ordinary runtime tracking/update membership, not a security or export-contamination indication. |
| Export-version membership | **Confirmed:** no `sys_remote_update_set` row references this application. | No prior scoped Publish-to-Update-Set candidate exists to qualify; this task did not create one. |
| Tables, dictionary/unique declarations, roles, ACLs, REST API/resources, modules, UI Page/assets, and jobs | **Confirmed:** 13 tables; 240 dictionary rows including the exact ten expected `unique=true` declarations; 3 roles; 49 ACLs; 1 REST definition / 34 operations; 65 modules; 8 UX assets; 2 scheduled scripts; 1 UI Page. | All task-specific source families reconcile. The 240 dictionary rows include platform system columns; the source-generated custom declaration count remains 162. |
| Installed cross-scope privileges | **Confirmed and reconciled:** 25 Allowed Global privileges, with exact ownership and matching update membership checked below. | One is the authored `global.DocseraGlobalWorkspaceMembershipBridge`; the other 24 are normal runtime tracking generated by implemented workspace, page, publishing, REST, and media behavior. No unrelated target, denied status, foreign scope, or nonstandard update action was returned. |
| Historical obsolete identities | **Partially confirmed:** no `x_82900_docsera` scope was returned, and the scoped `sys_metadata` query returned no update names matching `page_lock`, `C3`, `C4`, or `probe`. | This targeted naming check is not a full semantic proof that every legacy residue is absent; broader historical cleanliness remains **Unverified**. |
| Workspace/page/user/sample-data transport exposure | **Confirmed limited result:** the workspace and page tables contain data; the icon-asset table is empty. None of the 24 current application updates is domain/sample data. | This does not prove that a future platform publish cannot select data. No user table is source-defined, and future export selection remains **Unverified**. |

## Relationship to prior evidence

- RR-034 warns that a populated development PDI must not be treated as export-safe without installed application-file membership evidence; it specifically requires rejecting unowned historical residue rather than assuming source absence filters a future platform export.
- RR-038C proved one earlier, differently scoped staging export with 541 all-`INSERT_OR_UPDATE` updates and no export deletes. It is a useful export model, not evidence about `dev468303`.
- RR-074 confirms the current `x_2300756_docsera` / `e6e43323accd4c7fb9271525a343850e` identity and maintains a separate Global consumer-artifact boundary. It neither licenses a scoped export nor proves installed scoped metadata.

## Focused cross-scope privilege inventory

All 25 `sys_scope_privilege` records have source/application ownership `Docsera` / `x_2300756_docsera` / `e6e43323accd4c7fb9271525a343850e`, target scope `Global`, and status `Allowed`. The 24 runtime rows each have a same-sys-id `sys_metadata` application-file record and a matching Docsera `sys_update_xml` row of type `Cross scope privilege` with action `INSERT_OR_UPDATE`; the authored bridge has the same `sys_metadata` ownership but no current update row. Thus the inventory is accounted for exactly once.

| Purpose | Exact targets (type; operation) | Count | Finding |
| --- | --- | ---: | --- |
| Authored integration | `global.DocseraGlobalWorkspaceMembershipBridge` (Script Include; Execute API) | 1 | Expected scoped-to-Global bridge. |
| REST request/response runtime | `RESTAPIRequest`, `RESTAPIRequestBody`, `ScriptableServiceResultBuilder.setBody`, `.setStatus`, `.setHeaders`, `.getStreamWriter`, `ScriptableServiceResultStreamWriter.writeStream` (Scriptable; Execute API) | 7 | Normal scripted REST inputs and responses. `RESTAPIRequest` and `.setBody` reuse RR-037's accepted runtime conclusions. |
| Workspace persistence and maintenance | `GlideRecord.insert`, `.setValue`, `.update`, `.updateMultiple`, `.deleteRecord`, `.deleteMultiple`, `GlideDigest.getSHA256Hex`, `Glide API: string utilities` (Scriptable; Execute API) | 8 | Matches server persistence, publishing/discard, cleanup, and digest/token logic. Destructive methods are used for Docsera-scoped record cleanup, not access to an unrelated Global domain. |
| Workspace membership tables | `sys_user`, `sys_user_group`, `sys_user_grmember` (Table; Read) and `Glide API: user roles and groups` (Scriptable; Execute API) | 4 | Read-only identity/group membership lookups required by workspace roles and provisioning; RR-037 already reconciled the roles/groups API. |
| Attachment and media operations | `sys_attachment` (Table; Read), `GlideSysAttachment.getContentBase64`, `.getContentStream`, `.writeContentStream`, `.deleteAttachment` (Scriptable; Execute API) | 5 | Matches implemented workspace icon/media upload, download, replacement, and removal. |

The timestamps form compatible runtime-use clusters (principally 2026-11-03, plus attachment deletion on 2026-11-04), but timestamp proximity alone is not asserted as causal proof. The source search independently supports the listed product-purpose mappings. Normal development use of workspaces, pages, publishing, and media plausibly explains these accesses; no exhaustive execution tracing was needed or performed.

## Publication recommendation

**Ready for controlled export.** The actual 25-record inventory does not materially prevent a normal scoped export. When an authorized operator opens Publish to Update Set, leave **Include demo data** disabled so existing development workspace/page content is excluded. Do not alter or delete that demo data. The export remains subject to the existing separate authorization and post-export artifact review; this recommendation does not authorize publication.

No SDK deployment/reinstall, version change, publication/export, data cleanup, Global artifact action, receiving-PDI operation, or interactive browser/PDI testing was performed.

## Validation record

- Passed: task-worktree guard against the stated base and task branch.
- Passed: source `npm run build` (including `verify:sdk-module-keys` and bundle serialization), followed by generated XML inventory/identity/unique/deletion inspection.
- Passed: `git diff --ignore-space-at-eol` reconciliation after SDK generation; no source/generated-key content drift was retained.
- Passed: pinned-SDK credential/context preflight. SDK `4.8.1` resolved `docsera-dev468303` to exactly `https://dev468303.service-now.com`; current Windows identity and credential-directory setting match the RR-061 successful context.
- Passed: focused read-only `sys_scope_privilege` (25 rows), `sys_metadata` (same 25 sys_ids), and `sys_update_xml` (24 runtime rows) queries using the explicit alias. Exact targets, types, operations, statuses, application ownership, and update actions reconcile as documented above.
- Intentionally not run: any PDI mutation, publication/export, PDI/browser acceptance, receiver import/preview/commit, or full frontend validation.

## Post-testing cross-scope privilege comparison

Date: 2026-11-04

This is a read-only comparison after additional development-PDI use. It preserves
the 25-record inventory above as the accepted RR-076 baseline; it does not repeat
the broader export-readiness investigation.

| Comparison | Result |
| --- | ---: |
| Previous accepted inventory | 25 |
| Current Docsera-scoped inventory | 25 |
| Newly generated privileges | 0 |
| Previously recorded privileges with changed target, type, operation, status, or ownership | 0 |

The complete bounded query filtered `sys_scope_privilege.sys_scope` to Docsera's
application sys_id (`e6e43323accd4c7fb9271525a343850e`) and returned one page
(`hasMore=false`). Every row remains `Global` / `Allowed` and matches the prior
inventory by target, target type, and operation: the authored
`global.DocseraGlobalWorkspaceMembershipBridge` execute privilege, the seven REST
request/response execute privileges, eight workspace persistence/maintenance
execute privileges, four membership lookup privileges (three table reads and one
scriptable execute), and five attachment/media privileges (one table read and four
scriptable executes). No row had a later `sys_updated_on` value than its creation
time, so the current read also found no evidence of an in-place change to a
previously recorded privilege.

The companion bounded `sys_update_xml` query returned the same 24 runtime
privilege update rows: each is application `Docsera`
(`e6e43323accd4c7fb9271525a343850e`), type `Cross scope privilege`, action
`INSERT_OR_UPDATE`, in update set `Default`
(`1d549a833cb7031054699bda642808f8`). As in the baseline, the authored bridge
has no current runtime update row. Because no new privilege exists, there is no
new target/type/operation/status/timestamp/ownership/update-set inventory to
assess and no new concrete cross-scope security concern identified.

Validation was limited to the two complete, read-only SDK queries above, using
the explicit `docsera-dev468303` alias and machine-readable output. No deployment,
installation, publication, export, PDI configuration change, or additional
Docsera operation was performed.
