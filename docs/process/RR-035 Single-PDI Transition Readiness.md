# RR-035 — Single-PDI Transition Readiness

Date: 2026-11-01
Status: **Ready for reset after independent review and acceptance of this decision.** This is a readiness decision only; it does not release, replace, authenticate to, install on, export from, or otherwise mutate a PDI.

## Baseline reconciled

The packaging baseline is RR-034 at source revision `bc1cf30655928f20df03c195719e52f8920d2ace`: source can reproducibly build the SDK ZIP and has a source-owned metadata inventory, but the ZIP is not yet a customer-import claim. The selected portability experiment is a scoped *Publish to Update Set* export from a source-clean staging PDI, then a clean-target installation experiment. RR-034 expressly excludes the populated development PDI as that export source because RR-018 recorded unowned C3/C4, page-lock, probe, and host-spike metadata, including an active legacy Business Rule.

The accepted G1 task register still says G1 is open, but Git is the current implementation evidence: `1b2261f507053657c733c399182a776e20d7a9ad` (**Merge G1 security and reliability batch**) is an ancestor of this branch and of `main`. It includes the provisioning-queue hardening commit and its focused regression coverage, the G1 security/reliability reports, and the coordinated TipTap dependency update to `3.32.2`. This corrects the implementation-state reading only; it does not change any G1/G3/G4/G5 release-gate acceptance status.

## Existing-PDI dependency disposition

| Dependency or evidence gap | Disposition | Reason |
| --- | --- | --- |
| RR-031/RR-032 Australia Patch 2 metadata, runtime, and authenticated HTTP observations | **Already satisfied / no longer applicable** | The accepted reports are committed evidence. They do not require the source PDI to remain available after their capture. |
| G1 merged queue hardening, authorization/reliability reviews, and focused regression evidence | **Already satisfied / no longer applicable** | The source and tests are merged; historical PDI state is not an input to reproducing them. |
| RR-015 effective limited-role Table API protocol | **Can move to fresh PDI** | It remains a live qualification gap, but its controlled-user/ACL result concerns the installed candidate and is more meaningful on a clean staging or customer-path instance. |
| Remaining G3 interactive host/editor/publish/recovery smoke, least-privilege behavior, and scheduled-job outcome evidence | **Can move to fresh PDI** | RR-033 records these as unverified, not as acceptance tied uniquely to the drifted development instance. Clean candidate instances provide the required current artifact context. |
| G4 source-instance membership inspection and scoped export | **Can move to fresh PDI** | It must move: RR-034 prohibits use of the populated development PDI as export source. The staging PDI is the intended source-clean instance. |
| G5 clean install, initial access, update/recovery, and lifecycle testing | **Can move to fresh PDI** | These are expressly clean-instance/customer-path qualifications and cannot be established by preserving development records. |
| Development workspaces/pages/attachments/test users, experimental records, C3/C4 residue, historical metadata | **Already satisfied / no longer applicable** | The accepted plan classifies them as disposable. They are neither release artifacts nor required evidence. |

**Actual pre-reset blockers: none.** The remaining gates are incomplete qualification work, not work that needs the existing populated PDI. No outstanding live acceptance has been identified that cannot reasonably be repeated on the sequential clean instances.

## Preserve outside the PDI

Retain the source-controlled scoped and Global companion source, manifests, committed Global update-set artifact, RR-018/RR-031/RR-032/RR-033/RR-034 evidence, the frozen candidate SHA/version selected for execution, and the reproducible SDK build/install instructions. For the approved experiment, preserve the produced scoped export unchanged with its checksum, record-identity inventory, source/version/family details, preview/commit results, and warnings outside ServiceNow.

Do **not** back up development content, experimental metadata, attachments, users, or workspaces merely for this transition. The ignored local SDK ZIP/build output is supporting reproducibility evidence, not a final customer artifact and need not survive PDI replacement.

## Sequential single-PDI handoff

1. After this decision is accepted, release the existing development PDI.
2. Obtain a clean staging PDI on the selected supported family; do not assume the former URL, credentials, or configuration persist.
3. Update only local SDK authentication for that staging instance, without committing or exposing credentials.
4. With separately approved execution, install the frozen scoped source through the SDK developer workflow.
5. Verify the installed application/scope identity and source-owned metadata against RR-034 before export; keep staging data-clean.
6. Separately authorize *Publish to Update Set* and produce the scoped export. Preserve it and its checksum/inventory outside ServiceNow.
7. Release staging, obtain a second clean PDI, and use only the frozen artifacts and instructions for customer-path installation testing (scoped first, then Global companion).

Stop the experiment on any RR-034 exclusion, missing source-owned identity, unapproved delete, foreign collision, unresolved preview error, or artifact/hash mismatch. Do not hand-filter update metadata or recreate objects manually.

## Decision and authorization boundary

**Decision: Ready for reset.** The PDI contains no irreplaceable configuration or evidence required for the G4 export experiment; retaining it would preserve only disposable data and known metadata drift. Its release is consistent with the accepted source-clean export strategy.

**Exact next authorized action:** after independent review accepts this readiness decision, Jacob may release the existing development PDI.

Future actions require their own explicit approval: obtaining/using staging, changing SDK authentication, SDK installation, source-instance inspection, scoped export, artifact preservation, and customer-path installation testing. No G1, G3, G4, or G5 gate is closed by this report.
