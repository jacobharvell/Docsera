# RR-080 — Global Companion Installation and Functional Acceptance

Date: 2026-11-04

Status: **Completed receiving-instance companion installation and accepted functional smoke.** This concludes the documented scoped-first / Global-second receiving-instance qualification sequence with RR-079. It does not close G4/G5 or approve a public release.

## Candidate and installation order

The RR-074 Global consumer candidate was installed on `https://dev470364.service-now.com/` only after the RR-079 scoped update set had committed successfully.

| Item | Confirmed value |
| --- | --- |
| Global artifact | `app/docsera-global-bridge/update-set/candidates/rr-074-global-consumer-portability/sys_remote_update_set_docsera_global_companion_consumer_candidate_0_1_0.xml` |
| SHA-256 | `cf77c7b1b19f4751b7bf2c12620d697bd7922d4ef7e6ae7c540b7de00ca73bcf` |
| Candidate update count | 24 |
| Required sequence | RR-079 scoped commit first; RR-080 Global companion second |

## Independently verified Global preview XML

The exported retrieved-update-set XML for the RR-074 preview was independently inspected before commit. It confirms:

| Field | Independently verified result |
| --- | --- |
| Retrieved update-set state | `previewed` |
| Inserts | 24 |
| Updates | 0 |
| Deletions | 0 |
| Collisions | 0 |

No preview problems were reported or visible during the native preview. The absence of reported problems is Jacob's PDI observation; the table above is the independent XML evidence.

## Jacob-reported commit and live acceptance

Following the clean preview, Jacob committed the Global companion and reported **100% success without issues**. Jacob then completed the recommended functional smoke on the receiving PDI and reported all of the following as passing:

- Friendly URL and My Workspaces
- Workspace creation and provisioning
- Page creation, editing, and saving
- Publishing and Live mode
- Discarding changes
- Browser refresh and navigation
- Workspace administration

These are Jacob-reported native PDI and browser acceptance results. The post-commit Global retrieved-update-set XML has not been independently inspected, so this report does not represent the Global commit state, counts, or collision state as XML-verified facts.

## Sequence conclusion

The qualification sequence completed in the intended order: the scoped RR-077 candidate was committed first (RR-079), then the RR-074 Global companion previewed cleanly and was committed, followed by accepted core authoring and reader smoke coverage. This is evidence that the paired candidates can be installed and exercised on this receiving instance under the observed conditions.

## Remaining release qualification

Do not infer physical unique-index enforcement, upgrade safety, uninstall behavior, or broader platform compatibility from this sequence. Those release qualifications, together with the remaining G4/G5 criteria, require their own approved evidence. Successful installation and smoke acceptance are not public-release approval.

## Scope and validation

- Reconciled the confirmed RR-074 preview export evidence with Jacob's reported native commit and functional smoke results.
- No PDI interaction, SDK deployment, browser testing, XML regeneration, or artifact modification was performed by this documentation task.
- Documentation-only change; no frontend build or test run is applicable.
