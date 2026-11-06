# RR-037 — Controlled Scoped Export and Artifact Inspection

Date: 2026-11-01

Status: **Historical controlled-export report. RR-037C's exported XML and its defect are preserved evidence, not the current source-candidate status. RR-038A independently established the distribution-path limitation that update sets do not transport database-index creation and revised source-level single-column uniqueness to dictionary metadata. No revised artifact has been published, imported, previewed, or committed.**

## Execution boundary

This task began from the required dedicated worktree on
`release/batch-g4-distribution-packaging` at
`cb5d70ef64c8980619b737148986bb7f0c6b1ddc`. Its verified frozen application
source baseline is `bc1cf30655928f20df03c195719e52f8920d2ace`.

The configured staging instance was read through the supported ServiceNow
administration interface. The application record identified `Docsera`, scope
`x_82900_docsera`, scope sys_id `6997f092c3fd8310c569bf0d0501314d`, and active
status. The source reports establish application version `0.1.0`, Brazil Patch
1 Hotfix 1, and SDK `4.8.1` with the `docsera-pdi` alias. No application
configuration was intentionally edited during this inspection. The original
administrator inspection did, however, show platform information messages that
the two additional privileges had been granted and added. Those messages are
evidence of platform-generated metadata activity, not of an intentional Docsera
configuration edit; this follow-up did not change any instance state.

## Original blocking pre-publication result

The required cross-scope privilege inventory returned four allowed privileges
owned by the Docsera scope:

| Target name | Operation | Expected disposition |
| --- | --- | --- |
| `global.DocseraGlobalWorkspaceMembershipBridge` | Execute API | Expected authored bridge privilege |
| `ScriptableServiceResultBuilder.setBody` | Execute API | Expected previously reconciled runtime privilege |
| `Glide API: user roles and groups` | Execute API | **Unexpected** |
| `RESTAPIRequest` | Execute API | **Unexpected** |

RR-036 recorded the authored bridge privilege and the additional
`ScriptableServiceResultBuilder.setBody` privilege. RR-036C recorded the
`setBody` record's application-file membership and required RR-037 to determine
whether it would be included in an export. Neither source report establishes
`Glide API: user roles and groups` or `RESTAPIRequest` as expected source-owned
application metadata. The ServiceNow UI also emitted information messages that
these two privileges had been granted and added to Docsera cross-scope
privileges.

RR-037 requires investigation of any unowned identity and an immediate stop
before publishing. Therefore the supported **Publish to Update Set** action was
not invoked. No update-set identity, sys_id, state, export record count, warning
set, artifact path, file size, or SHA-256 can be truthfully recorded.

## RR-037A read-only reconciliation

### Installed-record evidence boundary

RR-037A was authorized to query the installed `sys_scope_privilege`,
`sys_metadata`, and `sys_update_xml` records through SDK alias `docsera-pdi`.
The repository-pinned SDK is present at `4.8.1`, but `npx @servicenow/sdk auth
--list` from `app/docsera-ui` returned **"No credentials found"**. No credential
setup, browser fallback, metadata mutation, or publication was attempted.

Consequently, the following required installed facts are **not verified** for
either `Glide API: user roles and groups` or `RESTAPIRequest`:

- privilege sys_id; source/target scope; target type; operation; status; and
  exact target name as stored on the record;
- creation/modification timestamps, creating/updating user, and modification
  count;
- the associated `sys_metadata` identity/class/scope; and
- `sys_update_xml` sys_id, application/file membership, update action, update
  domain, and any relevant export membership facts.

The original RR-037 administrator inventory remains the only installed evidence
available in this worktree: it reported both target names as Docsera-owned,
allowed `execute` privileges. It is insufficient to fill the record-level
fields above or to establish application-file ownership.

### Source dependency correspondence

Frozen source `bc1cf30655928f20df03c195719e52f8920d2ace` establishes a narrow,
behavioral correspondence for both names:

| Installed target name | Frozen Docsera use | Reconciliation | Scope limit |
| --- | --- | --- | --- |
| `Glide API: user roles and groups` | `src/server/workspaces/serviceNowWorkspaceCapabilities.ts` calls `gs.hasRole(...)` when resolving workspace capability and workspace-creation authorization. | Expected runtime dependency of the implemented role/group authorization boundary. | This is not evidence for unrelated user/group mutation access; membership lookup remains the separate `sys_user_grmember` table read in the same module. |
| `RESTAPIRequest` | `src/server/api/docsera-runtime-request.ts` reads request query, headers, and body stream. The runtime route handlers also receive `RESTAPIRequest` objects, including the provisioning-status handler's explicit type import. | Expected runtime dependency of the Scripted REST request-handling boundary. | It does not establish any broader REST administration or outbound-integration access. |

ServiceNow documents that `RESTAPIRequest` objects are created by the platform
for Scripted REST resource scripts and exposes `body`, `getHeader`, `headers`,
and `queryParams`, which matches Docsera's use. The Runtime Access Tracking
documentation further says that, while developing, the platform creates a
cross-scope privilege for each runtime access request and marks it Allowed in
Tracking mode. See [RESTAPIRequest API](https://www.servicenow.com/docs/r/zurich/api-reference/server-api-reference/c_ScriptableServiceRequest.html) and [Runtime access tracking](https://www.servicenow.com/docs/r/application-development/building-applications/c_RuntimeAccessTracking.html?contentId=JQ6FvH~zOpHYBQZn8WEoIA).

These facts make both records **plausible, source-dependent, platform-generated
runtime privileges**, rather than unexpected product behavior. They do not make
the installed records source-authored: the frozen Fluent source contains no
explicit cross-scope privilege declaration for either target.

### Timing and provenance

RR-036 records one initial SDK installation, followed by a successful
non-browser runtime verification, before RR-037's administrator inspection.
The live creation timestamps and audit users necessary to compare those events
are unavailable in this session. Therefore RR-037A cannot determine whether
the initial install, a runtime-verification request, another prior execution,
or the RR-037 inspection coincided with creation.

The administrator inspection was read-only and no application route execution
was authorized as part of it. The information messages are compatible with
automatic Runtime Access Tracking, but timestamps alone would not prove
causation in any event. RR-037A makes **no claim** that the inspection itself
created either record.

### Packaging disposition

The source correspondence supports treating the records as expected runtime
dependencies *if* a renewed authenticated inspection verifies that they are
Docsera-scope `sys_scope_privilege` application metadata with ordinary
application-file/update membership. Normal scoped publication is then the
appropriate mechanism; no manual privilege creation, deletion, approval,
filtering, or update-record manipulation is warranted.

That ownership/membership condition is not met by the available evidence.
Before a separately authorized controlled export, a credentialed, read-only
query must capture both privilege rows and their matching `sys_metadata` and
`sys_update_xml` rows, including update action. The resulting export XML must
then confirm the corresponding privilege update records are present and retain
the existing checks for `ScriptableServiceResultBuilder.setBody`, physical-index
uniqueness, update-action inventory, and contamination/warnings.

**Disposition:** the original "unexpected privilege" classification is resolved
at the source-dependency level, but the preflight blocker is **not fully
resolved** because required installed provenance and export-membership evidence
could not be read. Do not publish until independent review obtains that evidence.

## RR-037B browser-based installed-record verification

RR-037B used the already authenticated Brazil administrator Chrome session for
read-only list and form inspection. No credentials were created or changed, and
no ServiceNow record was changed. The inspection confirms that both records have
the same ordinary Docsera application-file and Default-update-set pattern
previously reconciled for `ScriptableServiceResultBuilder.setBody`.

| Target | Privilege sys_id / identity | Scope and access | System evidence | `sys_metadata` ownership | Matching `sys_update_xml` membership |
| --- | --- | --- | --- | --- | --- |
| `Glide API: user roles and groups` | `b20992e1c3105310540433bc05013123`; `sys_scope_privilege`; target type `Scriptable` | Source/application `Docsera` (`6997f092c3fd8310c569bf0d0501314d`); target `Global`; `Execute API`; `Allowed` | Paired customer-update created and updated `2026-11-01 14:38:41` by `admin` (0 updates); the application-file row is updated at the same time by `admin`. | Same sys_id; display name `Glide API: user roles and groups`; class `Cross scope privilege`; update name `sys_scope_privilege_b20992e1c3105310540433bc05013123`; application `Docsera`. | `fa0992e1c3105310540433bc05013125`; type `Cross scope privilege`; target name matches; name matches metadata update name; action `INSERT_OR_UPDATE`; created/updated `2026-11-01 14:38:41` by `admin`; update set `Default` (`1d549a833cb7031054699bda642808f8`), application `Global`, state `In progress`; remote update set empty. |
| `RESTAPIRequest` | `f60992e1c3105310540433bc0501311e`; `sys_scope_privilege`; target type `Scriptable` | Source/application `Docsera` (`6997f092c3fd8310c569bf0d0501314d`); target `Global`; `Execute API`; `Allowed` | Paired customer-update created and updated `2026-11-01 14:38:41` by `admin` (0 updates); the application-file row is updated at the same time by `admin`. | Same sys_id; display name `RESTAPIRequest`; class `Cross scope privilege`; update name `sys_scope_privilege_f60992e1c3105310540433bc0501311e`; application `Docsera`. | `b60992e1c3105310540433bc05013121`; type `Cross scope privilege`; target name matches; name matches metadata update name; action `INSERT_OR_UPDATE`; created/updated `2026-11-01 14:38:41` by `admin`; update set `Default` (`1d549a833cb7031054699bda642808f8`), application `Global`, state `In progress`; remote update set empty. |

The `sys_scope_privilege` form and the corresponding `sys_metadata` list agree
on the application identity and shared record sys_id. The `sys_update_xml` forms
show the creation and modification audit fields directly; their zero update
counts and matching timestamps are consistent with the application-file rows.
The shared Default update set being Global is not a conflicting ownership claim:
the privileges themselves and their `sys_metadata` rows are Docsera-owned, and
this is the same platform-generated update-set pattern already reconciled for
`ScriptableServiceResultBuilder.setBody`.

**Disposition:** the two records are ordinary, source-dependent Docsera runtime
dependencies eligible for normal scoped publication. The privilege
pre-publication issue is resolved. This does not establish their presence in a
future export artifact and does not authorize publication.

## Artifact inspection disposition

There is no exported XML to parse. Consequently, the following required
artifact checks remain unperformed rather than inferred:

- exported membership of all 13 tables, dictionary/reference/choice metadata,
  34 REST operations, 49 ACLs, roles/containments, 65 server modules, UI page
  and eight assets, jobs, indices, and deletes;
- presence of the `ScriptableServiceResultBuilder.setBody` update record;
- index declaration unique-property evidence for the eight named indexes;
- update-record action inventory, including the known source-owned `sys_index`
  `DELETE` identified by RR-034;
- data-contamination and export-warning review.

The prior RR-036C conclusion remains unchanged: physical indexed columns are
observed, but named-index uniqueness is not established by the installed views.
It is explicitly not evidence of physical uniqueness enforcement.

## Export-readiness disposition

| Area | Disposition |
| --- | --- |
| Application identity/source baseline | Read-only evidence consistent with the frozen candidate |
| Expected privilege set | Installed ownership and update membership reconciled; normal scoped publication eligible; **export-artifact membership still unverified** |
| Scoped update-set publication | Not performed |
| XML preservation and integrity | Not applicable; no artifact created |
| Export membership completeness | Unverified; no artifact exists |
| Clean-target import/preview experiment | Not authorized and not suitable to begin |

## Exact next authorization boundary

Before any subsequent Publish to Update Set attempt, independently review the
resulting export XML to confirm the corresponding privilege update records are
present, alongside `ScriptableServiceResultBuilder.setBody`, the update-action
inventory, contamination/warnings, and physical-index qualification. Do not
delete, modify, hand-filter, approve, or manually package either privilege. A
separate explicit approval is required before publishing from staging. Any
future target import, preview, commit, duplicate-enforcement testing, or
staging-PDI release remains outside this task and requires separate
authorization.

## Validation

This report records the original bounded read-only staging UI inspection, the
RR-037A bounded source/documentation reconciliation, and RR-037B's read-only
browser inspection of the two privilege forms, application-file rows,
customer-update rows/forms, and the shared update-set form. No intentional ServiceNow
configuration, application version, update set, XML artifact, sample data, or
PDI lifecycle state was changed. The original platform messages indicate
platform-generated privilege additions, which are distinguished above from
intentional changes. The documentation checks and whitespace check listed in
the implementation brief are run with this report change.

## RR-037C controlled publication and exported-artifact inspection

Date: 2026-11-01
Status: **Blocked by a material exported-artifact defect. Preserve the XML; do not republish, filter, repair, import, preview, or commit it.**

### Completed publication and preservation

Following RR-037B reconciliation and explicit operator confirmation, Brazil staging published the scoped `Docsera` application using **Publish to Update Set**. Version remained `0.1.0`; **Include demo data** was unchecked. The platform completed the job successfully in 16 seconds.

| Item | Recorded value |
| --- | --- |
| Staging target | `https://dev466136.service-now.com/` (Brazil Patch 1 Hotfix 1) |
| App / scope | `Docsera` / `x_82900_docsera` (`6997f092c3fd8310c569bf0d0501314d`) |
| Source commit / frozen baseline | `012fbe5c1e94dbfa70f3905b1f8d66c22632f457` / `bc1cf30655928f20df03c195719e52f8920d2ace` |
| Completed update set | `Docsera`; sys_id `a7006a21c3505310540433bc050131a3`; state `Complete`; 543 customer updates |
| Exported remote update set | sys_id `4c702e61c3505310540433bc05013123`; state `loaded` |
| Original downloaded XML | `C:\\Users\\jacob\\Downloads\\sys_remote_update_set_4c702e61c3505310540433bc05013123.xml` |
| Exact bytes / SHA-256 | 10,973,157 bytes / `CF5E120AE5703F812E9A4ED8A8D9AC52F7E8FE886FB96ED01E93084B84DD33AD` |

The downloaded file is outside the repository and was parsed read-only. It was not renamed, normalized, filtered, regenerated, or copied into tracked source.

### Actual exported manifest

The XML has 543 `sys_update_xml` records, all `INSERT_OR_UPDATE`: 13 tables, 162 dictionary records, 162 field labels, 20 choice lists, 49 ACLs, 3 roles, 3 contained-role records, 65 server modules, 1 scripted REST API, 34 scripted REST resources, 1 UI page, 8 UX assets, and 2 scheduled jobs. It also contains the application/menu/module records and 13 table-subscription configuration records. The 13 production tables and all 34 required method/path identities are present; no sample-record payloads, Global-scope companion records, or identified C3/C4/page-lock/serialization/probe/coordination/standalone-host legacy identities were found.

All four reconciled privileges are present as allowed cross-scope privilege updates: `global.DocseraGlobalWorkspaceMembershipBridge`, `ScriptableServiceResultBuilder.setBody`, `Glide API: user roles and groups`, and `RESTAPIRequest`. This is direct exported-artifact evidence, rather than an inference from installed application-file membership.

### Material discrepancy and DELETE inventory

The exact XML contains **zero** `sys_index` payload records and **zero** `action="DELETE"` records. In particular, it omits the known source-owned author-elective `sys_index` `DELETE` identified in RR-034. This prevents the artifact from carrying the expected physical-index declarations and deletion. It is a material export defect, not a permission or source-contamination finding.

Consequently, the XML cannot provide authoritative named-index definitions or unique flags. It cannot establish target-side unique-index enforcement; that would require separately approved target testing even if index declarations had been present. The previously recorded installed source-to-physical index-name differences remain unresolved, but they do not explain away the complete absence of exported index metadata.

### Disposition and next authorization boundary

**Blocked by a material artifact defect.** The candidate is not suitable for a clean-target import/preview test. Preserve it as evidence. A separately authorized investigation may inspect ServiceNow publication/export behavior and the missing `sys_index` metadata boundary; it must not automatically republish or alter this update set. Any new publication, target import, preview, commit, duplicate-key test, source repair, Global companion action, or staging release requires independent authorization.

## RR-038A source-only portability correction

Date: 2026-11-01
Status: **Revised source candidate generated locally; independent code review required before any ServiceNow instance change.**

RR-038A did not modify Brazil staging, publish an update set, or alter the RR-037C XML. It preserves the original remote-update-set identity `4c702e61c3505310540433bc05013123` and original XML SHA-256 `CF5E120AE5703F812E9A4ED8A8D9AC52F7E8FE886FB96ED01E93084B84DD33AD` as immutable provenance.

The defect reported by RR-037C was an observed fact about that historical export: it contained zero `sys_index` payload records. Independently, the update-set distribution path does not transport database-index creation. The latter is the durable portability boundary; it is not dependent on, nor repaired by reinterpreting, the historical export defect.

The pinned SDK `4.8.1` supports `Column.unique`, and a fresh local build proves `StringColumn({ unique: true })` produces `sys_dictionary.unique=true`. The revised source converts these fields: change entry `generation_page_key`; change set `generation_key`; edit lease `workspace_key`; mutation claim `generation_key`; page snapshot `snapshot_page_key`; removal batch `batch_key`; removal member `batch_page_key`; and snapshot set `snapshot_key`. Their named unique `sys_index` declarations were removed. Fresh output contains exactly ten dictionary-unique fields, adding the eight conversions to existing `workspace_slug` and `asset_key`.

The unaffected ordinary update inventory remains 13 tables, 34 REST operations, 49 ACLs, 65 server modules, eight UX assets, and one authored scoped-to-Global privilege. The generated-key registry marks the eight removed named indexes deleted, while the ordinary update output contains no converted `sys_index` action. The sole generated `sys_index` artifact is still an author-elective `DELETE` for the historical `x_82900_docsera_rm_member(removal_batch,page)` index. Its omission from RR-037C is not a deletion a clean installation needs.

The nonunique edit-lease `last_seen_on_idx` remains source-declared for now. It shares the update-set index-transport limitation, so target lease-cleanup performance remains unproven even though uniqueness no longer depends on named indexes.

No inference is made that it is safe to SDK-install or reinstall this candidate on Brazil. Existing Brazil indexes, dictionary state, and data may conflict with a dictionary-unique transition or platform physical-index reconciliation. A fresh source-clean instance is the appropriate first installation proof; update-set export and target import/preview/commit remain separate, explicitly authorized work.
