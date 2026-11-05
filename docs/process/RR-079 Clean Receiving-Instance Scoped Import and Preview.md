# RR-079 — Clean Receiving-Instance Scoped Import and Preview

Date: 2026-11-04

Status: **Completed scoped installation evidence.** RR-079 is the first half of the completed receiving-instance qualification sequence on `https://dev470364.service-now.com/`; RR-080 records the Global companion and functional acceptance that followed. This evidence does not close G4/G5 or approve a public release.

## Candidate and evidence boundary

| Item | Confirmed value |
| --- | --- |
| Scoped artifact | `app/docsera-ui/update-set/candidates/rr-077-controlled-scoped-export/docsera-scoped-v0.1.0-rr-077-diagnostic.xml` |
| SHA-256 | `c826c5367f42fe1717e158fe5af9b7ab4a62df76da4a174faa1c059792df4a18` |
| Envelope | `Docsera`, scope `x_2300756_docsera`, application sys_id `e6e43323accd4c7fb9271525a343850e`, version `0.1.0` |
| Customer updates | 564 |
| Privilege under test | `sys_scope_privilege` `41cfc3a240b54130bd9d4388d5d8c881`: `execute` on `global.DocseraGlobalWorkspaceMembershipBridge` (`target_type=sys_script_include`) |

The artifact was not regenerated or modified for this qualification. RR-077 establishes that its authored updates are `INSERT_OR_UPDATE` records.

## Jacob-reported native PDI results

Jacob imported and previewed the RR-077 scoped XML on `dev470364`. The preview completed with no reported problems or collisions, and Jacob then completed the native commit successfully. Before the later RR-080 companion installation, Jacob also confirmed that the Global `DocseraGlobalWorkspaceMembershipBridge` Script Include was absent.

These are receiving-instance observations reported by Jacob. They are not presented as independently parsed XML evidence except where explicitly stated below.

## Independently verified retrieved-update-set XML

The exported scoped retrieved-update-set XML was independently inspected after commit. It confirms:

| Field | Independently verified result |
| --- | --- |
| Retrieved update-set state | `committed` |
| Inserts | 564 |
| Updates | 0 |
| Deletions | 0 |
| Collisions | 0 |
| Scoped privilege identity | `41cfc3a240b54130bd9d4388d5d8c881` |
| Privilege owner | Docsera (`x_2300756_docsera`) |
| Target | Global membership bridge |
| Operation / status | `execute` / `allowed` |

The independent inspection verifies the committed scoped result and the installed cross-scope authorization record. It does not by itself establish the later Global companion commit, runtime behavior, or broad platform compatibility.

## Sequence conclusion

The receiving instance accepted the scoped candidate first, while the Global membership Script Include was still absent, without reported preview problems or collisions. The scoped update set was then committed successfully. This preserves the intended installation order for the RR-080 Global companion: scoped first, Global second.

## Remaining release qualification

RR-079 installation work is complete and is not reopened by the remaining items. Still required for release qualification are the outstanding G4/G5 criteria and any separately approved evidence for physical unique-index enforcement, upgrade safety, uninstall behavior, and broader platform compatibility. The functional smoke recorded in RR-080 is acceptance evidence only; it does not establish those broader claims.

## Scope and validation

- Reconciled the confirmed scoped import, preview, commit, bridge absence, and independently inspected exported retrieved-update-set evidence supplied for this sequence.
- No PDI interaction, SDK deployment, XML regeneration, or artifact modification was performed by this documentation task.
- Documentation-only change; no frontend build or test run is applicable.
