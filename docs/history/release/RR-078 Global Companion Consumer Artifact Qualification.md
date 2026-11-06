# RR-078 — Global Companion Consumer Artifact Qualification

Date: 2026-11-04

Status: **Pass for a separately authorized clean receiving-instance installation qualification, as an ordered two-artifact candidate. Not release approved.** This is an offline review of committed bytes; it authorizes neither import nor any ServiceNow action.

## Candidate identity and order

Install the pair only in this order:

1. `app/docsera-ui/update-set/candidates/rr-077-controlled-scoped-export/docsera-scoped-v0.1.0-rr-077-diagnostic.xml` — Docsera `x_2300756_docsera`, application sys_id `e6e43323accd4c7fb9271525a343850e`, version `0.1.0`; 11,043,465 bytes; SHA-256 `c826c5367f42fe1717e158fe5af9b7ab4a62df76da4a174faa1c059792df4a18`; 564 updates.
2. `app/docsera-global-bridge/update-set/candidates/rr-074-global-consumer-portability/sys_remote_update_set_docsera_global_companion_consumer_candidate_0_1_0.xml` — `Docsera Global Companion Consumer Candidate 0.1.0`, remote update-set sys_id `4445b2ab4cb38ddfed7eb063c7511239`; 115,435 bytes; SHA-256 `cf77c7b1b19f4751b7bf2c12620d697bd7922d4ef7e6ae7c540b7de00ca73bcf`; 24 updates.

The scoped artifact establishes the Docsera application and the tables that the companion's Global-to-scoped grants name. The companion then supplies Global-owned runtime metadata, the direct host, and the restricted-caller authorization. There are no overlapping `target_sys_id` values between the two artifacts.

## Independent XML findings

The RR-074 XML checksum equals its committed manifest and its outer envelope contains exactly 24 `sys_update_xml` records. All outer actions are `INSERT_OR_UPDATE`; decoded record actions are also `INSERT_OR_UPDATE`. The decoded inventory is six `sys_module`, nine `sys_scope_privilege`, two `sys_script`, two `sys_script_include`, one each of `sys_security_acl`, `sys_ui_page`, and `sys_restricted_caller_access`, and two `sys_ux_lib_asset` records. Target identities are unique.

The payloads use Global ownership where ownership is represented (`sys_scope`/`sys_package` = `global`) and contain no transported `sys_package:global`, `sys_scope:global`, or `sys_app:global` update. There are no payload deletes, no development-companion identity `2698dffadc844c00a9f20d67fca177d5`, and none of the checked obsolete identities (`5bf5c028daaa417d88de36616e4c8300`, `x_82900_docsera`, or `6997f092c3fd8310c569bf0d0501314d`). The companion contains no unrelated scoped, application-domain, or destructive update.

The Global-to-scoped privilege payloads are all `allowed`, source Global, target Docsera application `e6e43323accd4c7fb9271525a343850e`: workspace `create`, `read`, and `delete`; provision-request `read` and `write`; member-mutation-command `read` and `write`; and icon-asset `read` and `write`. This matches the companion bridge's ownership boundary and requires the scoped artifact's named tables to exist first.

The membership Script Include is `bb42e634e203492591a8d18e6953eae1` (`DocseraGlobalWorkspaceMembershipBridge`) and precedes the consumer RCA in the Global XML. The RCA is `a0af46dbdca9f925ad8704425772c2d7`: Global-owned, source/source-scope Docsera `e6e43323accd4c7fb9271525a343850e`, target Global membership bridge `bb42e634e203492591a8d18e6953eae1`, `execute`, real RCA, allowed. The provisioning bridge is `010930ea12354689b678fc9b37ba0f88`.

The actual RR-077 XML has 564 outer `INSERT_OR_UPDATE` updates and no `DELETE` outer action. Its published identity is the same Docsera app/scope above. It contains the expected scoped-to-Global privilege named `global.DocseraGlobalWorkspaceMembershipBridge`, while it does not contain the companion's new Global Script Include sys_id, RCA sys_id, UI Page sys_id, or any historical membership Script Include sys_id. This is coherent rather than a duplicate: the scoped privilege names the Global callable boundary; the second artifact creates its Global target and RCA. The Global companion's `docsera` UI Page (`4bb3dc32dcfc4441a57bfce97db77529`), its ACL, runtime modules, workers, and assets do not collide with scoped targets.

## Baseline and historical reconciliation

RR-074's frozen source baseline is `16c5f95f4befa109277d1f67a50f8d977faebf17`. Comparing it with this task base (`b504f706c59bb40b9f30c70bfc3c9b2aaeee8ec5`) shows no post-baseline change to the Global runtime source or generated Global component identities; the intervening Global changes are candidate generation, verification, manifest, and documentation work. RR-077 adds the native scoped export evidence and the intervening product change is scoped page-move work, not a competing Global bridge or host identity. The candidate's Global-owned consumer model is consistent with RR-039G/RR-039H's successful model, but RR-039 used older record identities and a 25-record historical artifact; it is evidence for the ownership pattern, not installation evidence for this 24-record candidate.

## Risks and next test

No concrete offline artifact defect was found. The dependency is intentionally ordered, but two platform behaviors remain material and unverified: whether a clean receiver can preview/commit the scoped privilege naming a not-yet-installed Global bridge, and whether the later companion import resolves that target/RCA/runtime-module graph without collision or platform-added dependency handling. The absence of same-target collisions in XML does not prove preview dispositions.

The next separately authorized test should use a clean receiving instance: import, preview, and commit RR-077 without overrides/skips, then import, preview, and commit RR-074 without overrides/skips; capture preview/commit counts and collisions for both; then inspect installed application, Global bridge/RCA/privilege/UI Page/runtime-module identities. Only after that may a separately authorized runtime qualification test exercise the host and first workspace provisioning. This report does **not** establish clean-instance installation, preview, commit, runtime execution, ACL effectiveness, module resolution, or physical unique-index enforcement, and neither artifact is publicly release approved.

## Validation

- Computed SHA-256 for both committed XML files.
- Decoded and inspected RR-074's actual 24 embedded payloads; ran `npm run verify:consumer-candidate` in `app/docsera-global-bridge`.
- Parsed/reconciled the RR-077 XML envelope and directly checked the scoped bridge privilege and identity non-overlap against RR-074.
- Compared source baseline-to-task-base changes for Global component compatibility.
- No build, SDK installation/deployment, PDI import, preview, commit, browser test, or runtime execution was run; all are out of scope.
