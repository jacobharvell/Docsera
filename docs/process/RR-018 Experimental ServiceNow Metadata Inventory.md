# RR-018 — Experimental ServiceNow Metadata Inventory

Date: 2026-10-30
Scope: bounded, read-only inspection of the `docsera-pdi` development PDI. This is an installed-metadata qualification, not a cleanup, export, deployment, or release-candidate approval.

## Result

The PDI contains substantial metadata from the abandoned page-centric C3/C4 collaborative-authoring experiment. Most is inert from the accepted application's perspective and is absent from current production source. One installed Business Rule is an active production-path side effect: **`Docsera Workspace C4 Origin Provisioning`** (`sys_script:084b7a426ff24f2c95bc5e588d52abf5`) runs *after update* on `x_82900_docsera_workspace_provision_request` and writes C4-origin state. It is not declared by current source.

This is development-PDI residue, not evidence that the accepted production package requires C3/C4. It is a release qualification concern for any candidate derived from, or upgraded on, this PDI: untracked scoped metadata can survive an upgrade and must not be implicitly accepted into an export. A clean source-built installation remains the appropriate packaging proof. No installed record was changed.

## Comparison basis

`RR-001` defines the accepted scoped footprint as 13 active tables, `docsera_runtime` with 34 operations, three roles, 45 ACLs, one scoped Direct UI Page, and two cleanup jobs. The current `app/docsera-ui/src` production definitions contain none of the C3/C4, page-lock, serialization-spike, or host-spike identifiers listed below. `RR-003` had already established that the PDI held extra scoped tables; this inspection resolves the relevant identities and runtime activity.

## Classified installed objects

| Family / identities (installed) | Classification | Evidence and effect |
| --- | --- | --- |
| The 13 RR-001 tables; `Docsera Runtime API` (`sys_ws_definition:814e0e79e0734df7af652df1e048a18f`); `docsera_sdk_runtime` UI page; roles `.editor`, `.workspace_admin`, `.admin`; `Docsera Workspace Edit Lease Cleanup` and `Docsera Abandoned Workspace Icon Cleanup` | Required production metadata | Present in current source inventory. These are not experiment residue. |
| `workspace_c4_origin`, `page_authoring_event`, `workspace_publication_seal`, `page_event`, `page_ownership_event`, `workspace_publication_candidate`, `workspace_structural_event`, `workspace_legacy_fence_arbitration`, `workspace_publication_snapshot_page`, `workspace_publication_decision`, `workspace_authority`, `workspace_coordination_probe`; C4 probe tables `pub_candidate`, `pub_decision`, `pub_snapshot_seal`, `pub_snapshot_page`, `mutation_ownership_probe` | Confirmed experiment-only residue | All are scope-owned active tables created 2026-10-15 through 2026-10-19, absent from the accepted 13-table source inventory. Their dictionaries are also installed. No matching production ACLs were returned by the scoped ACL inventory. |
| C4 server modules, including `serviceNowWorkspaceC4Origin.ts` (`fdac1b…`), `serviceNowWorkspaceAuthority.ts` (`5508db…`), publication/structural-event modules, C4 page creation, and probe modules | Confirmed experiment-only residue | Installed `sys_module` rows retain the historical runtime paths; current source has no matching paths. They are a packaging-drift risk if metadata is selected from the populated PDI rather than generated from accepted source. |
| `Docsera Workspace C4 Origin Provisioning` Business Rule | Confirmed experiment-only residue; **active dependency** | Active after-update rule on the production provisioning-request table. It is the demonstrated link from an accepted workflow into C4 residue. No claim is made that it exposes data externally, but it can create/update non-production C4 state during normal provisioning. |
| C4 REST operations: `page_authoring`, `c4_draft_pages`, `c4_page_create`, `page_ownership_probe`, `page_event_probe`, `publication_decision_probe` (two installed operations), `legacy_fence_arbitration_probe`, `workspace_coordination_probe`, `mutation_ownership_probe` | Confirmed experiment-only residue | Active operations exist in the scoped PDI and their module paths are experiment-only. They are outside the 34 current `docsera_runtime` operations and are a surplus HTTP surface on this PDI. Their exact route ACL/effective authorization was not probed; do not call this a demonstrated external exposure. |
| `x_82900_docsera_page_edit_lock`, `x_82900_docsera_spike_claim`; `Docsera Page Edit Lock Cleanup` (`sysauto_script:06461d…`); `Docsera Serialization Spike API` with `gate1_acquire` | Confirmed experiment-only residue | The active workspace lease replaced the page-lock design. The source does not declare these old tables/job/API. The serialization API has one active operation. They have no observed dependency from current production source. |
| `docsera_standalone_host_spike` UI page; `Docsera Host Spike` API; its UI-page-read and REST-execute ACLs (`4ad8b816…`, `7e05955e…`) and platform-admin role bindings | Confirmed experiment-only residue | The installed spike host/API remain active with admin-only ACL bindings. It is not a production-table permission issue, but it is an obsolete reachable admin surface and a packaging-drift concern. |
| `x_82900_docsera_rm_member` | Unrelated historical metadata | RR-001 identifies it as the retained CTO-3B M2M packaging-proof identity, not C3/C4 production scope. It is not in the active 13 tables. |
| `x_82900_docsera.user` | Unrelated historical metadata | Present without role containment; RR-003/RR-011 already classify it as historical and outside the three current roles. |
| Script Includes | Required-production Script Includes are Global-companion artifacts; no scoped `sys_script_include` rows were returned | The scoped query returned zero. This does not assess Global companion records, which are outside this experiment-focused inventory. |

Abbreviated sys_ids above are only used where the identity is otherwise long and unambiguous; the bounded query log established full IDs for the active Business Rule, jobs, APIs, ACLs, UI pages, and tables.

## Security, dependency, and packaging assessment

- **Demonstrated active dependency:** the C4 provisioning Business Rule is active on a production table and therefore makes C4 writes during provisioning possible. This is the only direct production-to-experiment dependency demonstrated by the read-only metadata inspection.
- **Surplus surface:** the C4/probe REST operations, serialization spike endpoint, and host-spike endpoint are active. The inspection did not make HTTP calls, impersonate users, or evaluate endpoint scripts, so it does not establish exploitability or effective authorization. The host-spike ACLs are admin-bound.
- **No experiment ACL family was found:** the scoped ACL inventory contained the accepted production ACLs plus the two host-spike ACLs; no C4/page-lock table ACL was returned. This is not an assurance about server-side Business Rule activity.
- **Release implication:** residue is harmless only for a clean installation assembled from the accepted source/manifest. It is a release blocker for any packaging path that cannot prove it excludes untracked installed scope metadata, and a PDI-maintenance issue for continued use of this populated instance. It does not independently block a source-built clean-install qualification.

## Accepted disposition and release-relevance rule (2026-10-30)

RR-018's inventory is sufficient for this checkpoint. **RR-019 (proposed C4 Business Rule impact investigation) is cancelled.** Do not investigate, disable, delete, or clean up experiment-only metadata on the disposable development PDI merely because it remains installed. The historical C4 Business Rule is absent from accepted source; investigating its script is not justified by a demonstrated shipped-product defect.

For subsequent release-readiness work, require a credible, concrete connection to at least one of:

1. Accepted production source and its supported behavior.
2. The actual artifact customers will install or the supported installation/upgrade path.
3. Realistic security, reliability, data-integrity, or user-visible impact in shipped Docsera workflows.
4. An explicit required release gate or qualification result.

Orphaned development-PDI objects, abandoned experiments, speculative failures, and unrelated tooling findings **must not spawn new investigation or cleanup tasks** without that connection. Keep distinctions between source evidence, installed development-instance residue, and actual release artifact contents clear.

**Required later packaging check, not a new C4 investigation:** verify the final generated release artifact excludes abandoned C3/C4 and other unowned historical metadata; confirm their absence in a clean target installation. Revisit a legacy object only if the actual artifact/upgrade path includes it or new evidence demonstrates meaningful impact on the accepted application. Proceed next with E9 integrated reliability qualification; G1 remains open.

## Evidence and validation

Read-only `now-sdk query -a docsera-pdi` inspection covered scope-owned `sys_db_object`, REST definitions/operations, `sys_script`, `sysauto_script`, roles/containment, ACLs/role bindings, UI pages, dictionaries, and dated `sys_module` identities. Queries deliberately excluded script bodies, document data, users, browser interaction, deployment, build, exports, and all mutations. Current source and RR-001/RR-003 were reconciled by identity/path, not by inferred behavior.

Validation intentionally skipped: automated tests, SDK build/deploy, Global companion regeneration, and browser/PDI functional testing; this is documentation-only evidence work.
