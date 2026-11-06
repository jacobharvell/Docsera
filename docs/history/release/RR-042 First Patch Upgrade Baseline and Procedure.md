# RR-042 — First Patch Upgrade Baseline and Procedure

Date: 2026-11-02
Status: **Planning only. Stop for independent review before implementation, merge, or ServiceNow action.**

## Baseline and decision

The candidate consumer baseline is the independently installed Docsera scoped application on `https://dev466345.service-now.com/`:

| Component | Verified baseline |
| --- | --- |
| Scoped app | Docsera / `x_82900_docsera` / application sys_id `6997f092c3fd8310c569bf0d0501314d` / version `0.1.0` |
| Scoped source/export | staging `https://dev466253.service-now.com/`; update set `6edef26dc31c13100abcf3ddd40131bb`; 541 `INSERT_OR_UPDATE`, 0 deletes; SHA-256 `7DE2729D3F2903EC6A9557A38605CF3E21B95DB62E34FB548C9ECA75199B6207` |
| Receiving install | 541 inserts, 0 updates/deletes/collisions; committed 2026-11-01 18:16:33 (RR-039B) |
| Global companion | unchanged 25-record `global-base-metadata-safe-r2`, committed separately (RR-039H); no shared Global identity rows |
| Preservation fixture | `Smoke-01` workspace `52ed42f5c3909310ac26fe3d05013193`, with exact Admin and Editor native-group references recorded in RR-040 |

The active G4 continuation is `release/batch-g4-distribution-packaging` at `2ac6e464bfaa29b1baa52ec5152645e13fac16ed`, 24 commits ahead of, and merged from, `main` baseline `bc1cf30655928f20df03c195719e52f8920d2ace`. It contains the accepted export/installation evidence and the Global-companion correction. The required first checkpoint is an independent review and squash merge of this G4 branch to `main`; only then create a focused patch branch from the accepted merged `main`. Do not use its branch ancestry alone as release proof—record the reviewed merge SHA and the patch source SHA in the patch manifest.

`0.1.1` is a provisional label only. Before implementation, reconcile the application Version field written by **Publish to Update Set**, `app/docsera-ui/package.json` (currently `0.1.0`), the source tag/revision, update-set display name, XML filename, checksum manifest, and release-note label. Publish uses the entered application version both for the application Version field and the update-set name; the artifact name must make the same version and source commit unambiguous. No version or dependency change is authorized by this report.

## Scoped correction boundary

`Post MVP Bug Fixes.md` identifies two related reader-facing defects after a same-user cross-tab takeover:

1. The displaced tab falls into the generic `Authoring access is no longer available` card, including obsolete `Access lost` mini-uppercase presentation and a no-op **Return to Live** action even though it is already in Live.
2. Recovery cards retain top space for the retired mini-uppercase eyebrow, making the message-box vertical spacing asymmetrical.

The intended outcome is that a displaced session is offered the established, explicit Edit-session recovery/takeover path (for example **Retry Edit**, then the existing explicit **End previous session** confirmation when another same-account session holds the lease), rather than a dead-end access-loss card. The card should use the current title treatment and balanced padding, with no mini-uppercase recovery/access label or reserved blank space. It must not silently reacquire/take over a lease.

Likely patch surfaces are `app/docsera-ui/src/client/app/App.tsx` (lost-lease state and mode transition), `app/docsera-ui/src/client/features/workspaces/WorkspaceMainPane.tsx` (access-loss/recovery actions and styling), and the focused `WorkspaceMainPane` and `App.workspaceShell` tests. Inspect the existing `workspaceLeaseCoordination`, `workspaceLeaseRecovery`, and server `workspaceEditLeaseService` tests before changing behavior. Preserve server-issued lease ownership, explicit same-session release, draft recovery, stale-generation handling, and mutation concurrency protections; no server lease semantic change is justified by these findings.

## Export-source preflight and patch creation

The Brazil staging instance may be the patched export source only after a read-only provenance preflight establishes that it is still the verified 0.1.0 source—not merely a similarly named app:

1. Record instance family/patch, app name/scope/application sys_id/version, application-file count, and the active source revision/build identity.
2. Compare its app-file inventory and scoped privileges with RR-038C. Explain any drift, especially extra runtime-generated privileges, unreviewed customer updates, changed application ownership, schema, or application metadata. Do not normalize drift by hand.
3. Confirm the scoped application record and all patch metadata are owned by the intended scope; confirm no accidental Global records or data are selected. Keep **Include demo data** unchecked.
4. Install the reviewed, merged patch source onto the export source through the established scoped SDK deployment process and non-interactive runtime verification required by that implementation task. This is an export-source deployment, not an operation on `dev466345`.
5. Re-read the export-source identity and app-file inventory after deployment. If the deployment changes anything outside the reviewed patch or produces unexplained privileges/metadata, stop.

Only after the version decision is approved, publish the scoped application from that source using the supported **Publish to Update Set** flow. Record local and remote update-set sys_ids, application version, source SHA, timestamp, record count, and whether every customer update is `INSERT_OR_UPDATE`. Export the completed set to XML. Preserve the XML outside the repository, calculate SHA-256, and parse it offline into a type/action inventory. Compare it with the installed 541-record baseline: expected patch metadata should appear as updates to stable application records (and any deliberately required new metadata should be reviewed); unexpected deletes, schema/table/ACL/role/privilege changes, new Global rows, app/scope identity rows, unexplained record-count deltas, or checksum/inventory mismatch are stop conditions.

The established evidence proves a clean install, not a patch delta shape. The exact patched record count, update/insert mix, target-side coalescing/reference rewrites, and whether every stable identity remains intact are questions for the actual export and receiving-preview evidence.

## Consumer upgrade procedure

1. On `dev466345`, take read-only before evidence for `Smoke-01`: workspace sys_id and Admin/Editor group sys_ids and native role relations; pages and published snapshots/content; pending changes/drafts if present; media and memberships if present; app identity/version; friendly URL and scoped runtime availability. Record absence explicitly rather than manufacturing test data.
2. Import the patched scoped XML through **Import Update Set from XML**. This creates a retrieved update set in `Loaded`; it is not an SDK reinstall and must not modify the source baseline through a receiving-side deployment.
3. Run Preview. Review every preview record and preview problem, not only summary counts. Expected metadata records should normally be updates against installed stable identities. A collision is not automatically safe: compare local and remote versions and stop for review. Do not skip, accept a collision, ignore a problem, repair metadata, or commit under this procedure.
4. Block the operation on any preview problem/collision, unexpected delete, missing reference/object, application-scope validation issue, schema or field-type change, ACL/role/cross-scope privilege change, unexpected Global row, changed Global companion dependency, artifact checksum/inventory discrepancy, or an update set that does not target the recorded `x_82900_docsera` application identity.
5. If preview is clean and the evidence matches the reviewed patch, request separate explicit authorization to commit. ServiceNow requires unresolved preview problems to be resolved before commit; commit applies the selected updates and creates the target's local update record. Capture the commit log and final counters.
6. Do not import, preview, or recommit the 0.1.0 Global companion. It stays untouched unless the scoped patch demonstrably changes its contract; that would be a separately reviewed Global artifact and acceptance path.

Update-set transfer is the mechanism expected to retain stable metadata identities and update existing application records; ServiceNow also rewrites applicable coalesced references during retrieve. That does not itself prove preservation of Docsera business data, drafts, attachments, membership, or every sys_id. The before/after evidence below is the required upgrade qualification.

Official platform references: [Publish an application to an Update Set](https://www.servicenow.com/docs/r/application-development/t_PublishApplicationsToAnUpdateSet.html), [Save an update set as XML](https://www.servicenow.com/docs/r/application-development/system-update-sets/t_SaveAnUpdateSetAsAnXMLFile.html), [Preview a remote update set](https://www.servicenow.com/docs/r/application-development/system-update-sets/t_PreviewARemoteUpdateSet.html), [Commit an update set](https://www.servicenow.com/docs/r/application-development/system-update-sets/t_CommitAnUpdateSet.html), and [collision resolution](https://www.servicenow.com/docs/r/application-development/system-update-sets/update-set-collisions.html).

## Post-commit acceptance

After the separately authorized commit, repeat the exact before reads and compare identities, not names alone. Confirm:

- `Smoke-01`, its two native groups and their role relationships remain the exact recorded records; no duplicate workspace is provisioned.
- Existing pages, published content/snapshots, pending changes or drafts (when present), applicable media, and memberships remain available and refer to the same pre-existing records where that relationship was recorded.
- Friendly `docsera.do` and the scoped runtime URL remain available; the app reports the approved patched version.
- Two-tab Edit exercise: acquire in tab A, enter Edit in tab B, explicitly end the prior session, then return to tab A. Tab A presents the corrected recovery/takeover path, does not offer a no-op Live action, requires explicit takeover behavior, and retains recovery/concurrency safeguards. Verify the corrected balanced recovery presentation visually.

Jacob performs this live PDI/browser acceptance. This is a targeted patch and preservation check, not a new workspace provisioning, full media matrix, broad regression, unique-index proof, uninstall test, or claim of universal upgrade safety.

## Gates and remaining decisions

| Checkpoint | Required outcome | Stop boundary |
| --- | --- | --- |
| 1. G4 closeout | Independent review and accepted squash merge; record final baseline SHA | No patch branch/source deployment before acceptance |
| 2. Scoped UI patch | Focused implementation, regression tests, version/naming decision, source review | No PDI action before code review approval |
| 3. Export/artifact inspection | Source provenance preflight; publish/export; XML inventory/checksum/delta review | No receiving import on any discrepancy |
| 4. Receiving import/preview | Import and full preview evidence against `Smoke-01` baseline | No resolution, skip, or commit on any problem/collision |
| 5. Commit authorization | Explicit approval after clean preview and artifact review | One commit only; capture result/log |
| 6. Acceptance | Before/after preservation comparison and Jacob's live targeted acceptance | Regressions return to a new corrective task; do not improvise repair |

Hard prerequisites before implementation are (a) accepted G4 squash-merge checkpoint, (b) approval of the product/application/artifact version semantics and naming policy, and (c) a confirmed reviewed source-deployment path for the Brazil export PDI. The central unresolved technical question is the observed patch update shape and target coalescing behavior; it can only be answered by the controlled export/import/preview test, not inferred from the 0.1.0 clean install.

## Planning validation

- Read and reconciled RR-038C, RR-039B, RR-039H, RR-040, the release plan, and the post-MVP findings.
- Inspected current recovery/lease UI and focused tests; no application code or ServiceNow state changed.
- Consulted current official ServiceNow publication, XML export/import, preview, commit, and collision documentation.
