# Release qualification

This reference states what Docsera 0.1.0 release inputs and installation behavior have been demonstrated, the evidence supporting those statements, and the limits that remain. It is for contributors and technical evaluators; it is not a public-release announcement, a compatibility guarantee, or a release-gate approval.

## Release inputs and installation routes

Docsera has two distinct installation paths.

| Path | Intended use | Inputs and boundary |
| --- | --- | --- |
| Consumer installation | Install the immutable 0.1.0 package on a receiving ServiceNow instance. | Install the scoped application update set first and the Global companion update set second from the frozen [consumer release pair](../../releases/README.md). The [0.1.0 release README](../../releases/0.1.0/README.md) is the authority for artifact identities, checksums, and the exact import sequence. |
| Contributor/source installation | Develop or perform a controlled deployment to an instance the contributor owns. | Establish SDK-owned identities, build and install the scoped application and separately owned Global companion in order, then perform their installed-runtime verification. Follow [development setup](../guides/development-setup.md) and the [ServiceNow runtime reference](../reference/servicenow-runtime.md). |

The routes are not interchangeable. Generated SDK output, historical exports, and diagnostic candidate XML are evidence or development inputs, not supported consumer artifacts. For a consumer install, use [the frozen update-set guide](../guides/update-set-installation.md); for the route-selection boundary, see [Installing Docsera](../guides/installing-docsera.md).

A frozen repository package is also not, by itself, a completed public-release announcement, an approved ServiceNow compatibility matrix, or G8 publication acceptance.

## Artifact provenance

The accepted scoped source application is `Docsera`, scope `x_2300756_docsera`, application sys_id `e6e43323accd4c7fb9271525a343850e`, with source package version `0.1.0`. That identity is the current release contract. Earlier `x_82900_docsera` material is historical evidence and is not promoted into this contract.

| Evidence | What it establishes | Limit |
| --- | --- | --- |
| [RR-077](../history/release/RR-077%20Controlled%20Scoped%20Export%20and%20Artifact%20Inspection.md) | A native scoped export was inspected as 564 `INSERT_OR_UPDATE` payloads. Its decoded inventory reconciled application/schema/runtime metadata, current identity, and the absence of obsolete or unrelated domain/attachment payloads. | It was a diagnostic candidate, not public-release approval or receiving-instance/lifecycle proof. |
| [RR-074](../history/release/RR-074%20Global%20Consumer%20Artifact%20Portability%20Candidate.md) | A 24-update Global consumer candidate was constructed with Global-owned consumer metadata, a restricted-caller authorization, and no dependency on the SDK development companion identity. | Its initial result was offline composition and integrity evidence only. |
| [RR-078](../history/release/RR-078%20Global%20Companion%20Consumer%20Artifact%20Qualification.md) | Independent inspection reconciled the two candidate artifacts, their ordered dependency, non-overlapping targets, update actions, integrity, and the Global-to-scoped authorization boundary. | Matching inventories, versions, or record counts do not establish byte identity, platform preview, or commit behavior. |
| [Frozen 0.1.0 release README](../../releases/0.1.0/README.md) | The immutable consumer pair preserves the qualified RR-077 scoped and RR-074 Global payloads, with consumer-facing outer update-set display names. It is the checksum authority. | It does not transform the package into a completed public release. |

These categories must remain distinct: source commits describe reviewed source; generated candidates describe build or export outputs; native exported artifacts describe an exported payload; frozen release files are the immutable consumer inputs; and installed records describe one instance's result. The documented consumer packaging transformation changes the outer update-set display names; it must not be described as inferred byte-for-byte identity from a shared version or count.

## Receiving-instance qualification

The strongest installation evidence is the scoped-first, Global-second sequence recorded in [RR-079](../history/release/RR-079%20Clean%20Receiving-Instance%20Scoped%20Import%20and%20Preview.md) and [RR-080](../history/release/RR-080%20Global%20Companion%20Installation%20and%20Functional%20Acceptance.md).

For the scoped candidate, Jacob reported native import, preview without reported problems or collisions, and successful commit on a clean receiving instance. Independently inspected retrieved-update-set XML then established a `committed` state, 564 inserts, zero updates, deletes, and collisions, plus the installed allowed scoped bridge privilege. The native PDI observations beyond that XML inspection remain Jacob-reported observations.

For the Global companion, installation followed the scoped commit. Independently inspected preview XML established a `previewed` state, 24 inserts, and zero updates, deletes, and collisions. Jacob then reported successful Global commit and accepted the following functional smoke:

- friendly URL and My Workspaces;
- workspace creation and provisioning;
- page authoring and save;
- publishing and Live mode;
- discard;
- refresh and navigation; and
- workspace administration.

The post-commit Global retrieved-update-set XML was not independently inspected. Therefore, the Global commit's final XML state, counts, and collision state are not XML-verified claims.

Together, this evidence demonstrates that the paired qualified candidates installed in the documented order and supported the listed core smoke on that receiving-instance sequence. It does not establish a general platform guarantee, all authorization paths, all schema/index behavior, an upgrade path, uninstall behavior, or public-release approval.

## Historical and platform evidence index

Historical evidence remains useful only within its stated identity, instance, artifact, and date boundary.

| Evidence group | Bounded finding | Do not infer |
| --- | --- | --- |
| [RR-031](../process/RR-031%20Current-Family%20Platform%20Compatibility%20Baseline.md) through [RR-033](../process/RR-033%20G3%20Compatibility%20Evidence%20Reconciliation.md) | Australia Patch 2 runtime/HTTP and metadata observations, including the Global-host dependency chain. The reports identify development-PDI drift and untested interaction, execution, and least-privilege areas. | A supported family/patch matrix, interactive compatibility, upgrade qualification, or current-identity installation proof. |
| [RR-036](../history/release/RR-036%20Brazil%20Clean%20Scoped%20Staging%20Installation.md) through [RR-040](../process/RR-040%20Clean-Target%20First%20Workspace%20Provisioning%20Verification.md) | Earlier Brazil/clean-target installation, metadata, first-use, and functional observations under the historical application identity. | That those observations qualify the current pair or erase their historical identity boundary. |
| [RR-039D](../process/RR-039D%20Clean-Target%20Unique%20Enforcement%20Probe.md) | Duplicate rejection for the one historical installed `workspace_icon_asset.asset_key` unique field. | Physical unique-index visibility, all ten declared unique fields, or enforcement on the current receiving instance. |
| [RR-030](../process/RR-030%20G2%20Accessibility%20Closeout.md) | Accepted focused accessibility work and a four-state automated audit, with known limitations stated in the report. | Comprehensive accessibility testing or WCAG conformance. |
| [Authorization boundaries](../security/authorization-boundaries.md) and [testing and maintenance](../guides/testing-and-maintenance.md) | Source, focused tests, and selected installed/user-context evidence support the described security and reliability boundaries. | Comprehensive security certification, full penetration-test coverage, or universal effective-access behavior. |

## Qualification snapshot

This is a concise status snapshot from the accepted Release Readiness Plan and Release Execution Log. Passing a batch, merge, artifact check, or smoke step does not complete its release gate.

| Gate | Current qualification state |
| --- | --- |
| G0 — scope and release candidate | Open: final candidate scope and freeze remain pending. |
| G1 — security and reliability | Open pending final reconciliation: source, focused tests, and selected installed/user-context evidence exist; remaining effective-access and gate-wide evidence is not complete. |
| G2 — accessibility | Accepted with documented limitations: focused audit and remediation are accepted, while broader keyboard-only, screen-reader, contrast, zoom/reflow, reduced-motion, and full-surface qualification remain unperformed or unqualified. |
| G3 — platform compatibility | Open: Australia Patch 2 observations and Brazil clean-instance evidence are bounded checkpoints, not a supported compatibility matrix. |
| G4 — distribution | Open with substantial evidence: a two-artifact ordered installation is demonstrated, while final distribution/lifecycle and enforcement qualification remain. |
| G5 — fresh install, update, recovery | Open with functional smoke passed: the receiving-instance smoke is demonstrated; upgrade/data preservation, uninstall/recovery, and remaining role/ACL, media, and index evidence are pending. |
| G6 — public repository | Open: repository/publication readiness is not a consequence of package qualification. |
| G7 — documentation and support | Open: public documentation and support readiness require their own acceptance. |
| G8 — publication | Open: final release execution, publication, and post-release confirmation are still required. |

## Claims not established

Available evidence does not establish any of the following. An absent qualification is not a demonstrated defect.

- Universal ServiceNow-family, patch-level, or arbitrary-instance compatibility.
- Comprehensive effective ACL or least-privilege verification across every access path.
- Physical unique-index visibility or duplicate rejection for every declared unique field on the current receiving instance.
- Safe package upgrade, preservation of installed data during update, uninstall behavior, or rollback behavior.
- Comprehensive accessibility coverage or WCAG conformance.
- Full penetration-test coverage or universal security guarantees.
- Completion of all public release gates.

For implementation and runtime boundaries rather than release evidence, use the [ServiceNow runtime reference](../reference/servicenow-runtime.md) and [authorization boundaries](../security/authorization-boundaries.md). For operational test scope, use [testing and maintenance](../guides/testing-and-maintenance.md).
