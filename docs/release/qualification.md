# Release qualification

This reference states what Docsera 0.1.0 release inputs and installation behavior have been demonstrated, the evidence supporting those statements, and the limits that remain. It is for contributors and technical evaluators; it is not a public-release announcement, a compatibility guarantee, or a release-gate approval.

## Release inputs and installation routes

Docsera has two distinct installation paths.

| Path | Intended use | Inputs and boundary |
| --- | --- | --- |
| Consumer installation | Install the immutable 0.1.0 package on a receiving ServiceNow instance. | Install the scoped application update set first and the Global companion update set second from the [0.1.0 consumer release pair](../../releases/README.md). The [0.1.0 release README](../../releases/0.1.0/README.md) is the authority for artifact identities, checksums, and the exact import sequence. |
| Contributor/source installation | Develop or perform a controlled deployment to an instance the contributor owns. | Establish SDK-owned identities, build and install the scoped application and separately owned Global companion in order, then perform their installed-runtime verification. Follow [development setup](../guides/development-setup.md) and the [ServiceNow runtime reference](../reference/servicenow-runtime.md). |

The routes are not interchangeable. Generated SDK output, historical exports, and diagnostic candidate XML are evidence or development inputs, not supported consumer artifacts. For a consumer install, use [the 0.1.0 update-set guide](../guides/update-set-installation.md); for the route-selection boundary, see [Installing Docsera](../guides/installing-docsera.md).

An immutable repository package is also not, by itself, a completed public-release announcement, an approved ServiceNow compatibility matrix, or G8 publication acceptance.

## Artifact provenance

The accepted scoped source application is `Docsera`, scope `x_2300756_docsera`, application sys_id `e6e43323accd4c7fb9271525a343850e`, with source package version `0.1.0`. That identity is the current release contract. Earlier `x_82900_docsera` material is historical evidence and is not promoted into this contract.

| Evidence | What it establishes | Limit |
| --- | --- | --- |
| Scoped artifact provenance | The RR-096 corrected native scoped export contains the main-runtime refresh that removed the diagnostic query path and updated runtime assets, followed by two targeted diagnostic-asset `DELETE` updates; its 564 updates comprise 562 `INSERT_OR_UPDATE` and two `DELETE` updates. Its decoded inventory reconciled application/schema/runtime metadata, current identity, and the absence of obsolete or unrelated domain/attachment payloads. | It is the accepted `0.1.0` candidate artifact, not public-release approval or receiving-instance/lifecycle proof. |
| Global artifact provenance | A 24-update Global consumer candidate was constructed with Global-owned consumer metadata, a restricted-caller authorization, and no dependency on the SDK development companion identity. | Its initial result was offline composition and integrity evidence only. |
| Paired-artifact inspection | Independent inspection reconciled the two candidate artifacts, their ordered dependency, non-overlapping targets, update actions, integrity, and the Global-to-scoped authorization boundary. | Matching inventories, versions, or record counts do not establish byte identity, platform preview, or commit behavior. |
| [Docsera 0.1.0 release README](../../releases/0.1.0/README.md) | The immutable consumer pair preserves the RR-096 corrected scoped artifact and unchanged Global payload, with consumer-facing outer update-set display names. It is the checksum authority. | It does not transform the package into a completed public release or receiving-instance qualification of the corrected scoped artifact. |

These categories must remain distinct: source commits describe reviewed source; generated candidates describe build or export outputs; native exported artifacts describe an exported payload; 0.1.0 release files are the immutable consumer inputs; and installed records describe one instance's result. The documented consumer packaging transformation changes the outer update-set display names; it must not be described as inferred byte-for-byte identity from a shared version or count.

## Receiving-instance qualification

The strongest installation evidence is the documented scoped-first, Global-second receiving-instance sequence.

For the earlier scoped artifact, Jacob reported native import, preview without reported problems or collisions, and successful commit on a clean receiving instance. Independently inspected retrieved-update-set XML then established a `committed` state, 564 inserts, zero updates, deletes, and collisions, plus the installed allowed scoped bridge privilege. The native PDI observations beyond that XML inspection remain Jacob-reported observations.

For the Global companion, installation followed the scoped commit. Independently inspected preview XML established a `previewed` state, 24 inserts, and zero updates, deletes, and collisions. Jacob then reported successful Global commit and accepted the following functional smoke:

- friendly URL and My Workspaces;
- workspace creation and provisioning;
- page authoring and save;
- publishing and Live mode;
- discard;
- refresh and navigation; and
- workspace administration.

The post-commit Global retrieved-update-set XML was not independently inspected. Therefore, the Global commit's final XML state, counts, and collision state are not XML-verified claims.

Together, RR-079/RR-080 demonstrate that the earlier scoped artifact and unchanged Global artifact installed in the documented order and supported the listed core smoke on that receiving-instance sequence. The RR-096 corrected scoped artifact is the accepted `0.1.0` candidate: it incorporates the main-runtime refresh that removed the diagnostic query path and updated runtime assets, followed by two targeted retired-asset deletion updates. Jacob accepted that no repeat import, reinstall, or installation smoke is required for the corrected candidate. Do not extend this decision into a general platform guarantee, all authorization paths, all schema/index behavior, an upgrade path, uninstall behavior, or public-release approval.

## Prior evidence and platform limitations

Prior evidence is bounded by its stated identity, instance, artifact, and date boundary.

| Evidence group | Bounded finding | Do not infer |
| --- | --- | --- |
| Australia Patch 2 observations | Runtime/HTTP and metadata observations, including the Global-host dependency chain, identified development-PDI drift and untested interaction, execution, and least-privilege areas. | A supported family/patch matrix, interactive compatibility, upgrade qualification, or current-identity installation proof. |
| Earlier Brazil and clean-target observations | Earlier installation, metadata, first-use, and functional observations used the historical application identity. | That those observations qualify the current pair or erase their historical identity boundary. |
| Earlier unique-field probe | Duplicate rejection was observed for the historical installed `workspace_icon_asset.asset_key` unique field. | Physical unique-index visibility, all ten declared unique fields, or enforcement on the current receiving instance. |
| Focused accessibility evidence | Accepted focused accessibility work and a four-state automated audit had known limitations. | Comprehensive accessibility testing or WCAG conformance. |
| [Authorization boundaries](../security/authorization-boundaries.md) and [testing and maintenance](../guides/testing-and-maintenance.md) | Source, focused tests, and selected installed/user-context evidence support the described security and reliability boundaries. | Comprehensive security certification, full penetration-test coverage, or universal effective-access behavior. |

## Qualification snapshot

This is a concise status snapshot from the accepted Release Readiness Plan and Release Execution Log. Passing a batch, merge, artifact check, or smoke step does not complete its release gate.

| Gate | Current qualification state |
| --- | --- |
| G0 — scope and release candidate | Ready pending Jacob's publication decision: candidate claims are reconciled and no repeat import, reinstall, or installation smoke is required for the RR-096 correction. |
| G1 — security and reliability | Open: accepted source, focused tests, and selected installed/user-context evidence exist; initial-admin/effective-access acceptance remains. |
| G2 — accessibility | Accepted with documented limitations: focused audit and remediation are accepted, while broader keyboard-only, screen-reader, contrast, zoom/reflow, reduced-motion, and full-surface qualification remain unperformed or unqualified. |
| G3 — platform compatibility | Open: record the receiving instance's exact family/patch/build and accept only a narrow statement; existing Australia/Brazil evidence is bounded. |
| G4 — distribution | Open: the immutable pair and instructions are reconciled; physical unique-index enforcement remains to be observed. |
| G5 — fresh install, update, recovery | Open: initial-admin/effective-access and unique-index checks remain. No upgrade/data-preservation, uninstall, or recovery promise is made. |
| G6 — public repository | Ready pending repository-owner activation of GitHub private vulnerability reporting; the final source/history and documentation review found no material repository blocker. |
| G7 — documentation and support | Open: screenshots and newcomer consumer-install/first-use acceptance remain manual actions. |
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
