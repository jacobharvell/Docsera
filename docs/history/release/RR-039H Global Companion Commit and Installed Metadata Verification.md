# RR-039H — Global Companion Commit and Installed Metadata Verification

Date: 2026-11-02

## Receiving instance and approved set

- Receiving instance: `https://dev466345.service-now.com/`
- Retrieved update set: `beabd28f94519b6d0e3fb3fbe0c84bdc`
- Artifact revision: `global-base-metadata-safe-r2`
- Artifact inventory: 25 records

## Commit preflight

The Retrieved Update Set form was re-inspected immediately before commit. Its sys_id,
name, state, and counters matched RR-039G: `Previewed`, empty committed date, 25
inserts, 0 updates, 0 deletions, 0 collisions, and 25 total. The filtered preview list
contained the same 25 `Insert` / `Commit` rows with blank Problem Type values. No
`sys_package`, `sys_scope`, or `sys_app` row was present. The retrieved set had not
previously been committed and no changed preview or installation-baseline evidence was
observed since RR-039G.

## Commit evidence

Using Retrieved Update Sets > Commit Update Set Batch, the platform commit was started
only for `beabd28f94519b6d0e3fb3fbe0c84bdc`. The batch progress viewer reported:

- Result: `The Update Set batch was committed - Succeeded in 5 Seconds`
- Set state after completion: `Committed`
- Committed timestamp: `2026-11-02 08:15:59`
- Counters after completion: 25 inserted, 0 updated, 0 deleted, 0 collisions, 25 total

No conflict override, record skip, repair, second import, or second preview was used.
The only visible platform warning was the generic Subscription Management advisory about
mapping unmapped custom tables; it was not an update-set preview or commit error.

## Installed metadata inventory

Administrative inspection was anchored to the committed 25-record inventory and exact
sys_ids from `docsera-global-companion.update-set.json`. The installed set comprises:

| Component group | Expected / observed |
| --- | --- |
| Global Script Includes | 2: `DocseraGlobalWorkspaceMembershipBridge` (`5bf5c028daaa417d88de36616e4c8300`) and `DocseraGlobalWorkspaceProvisioningBridge` (`abf83bf6db1e46dea88c97ec493153bc`) |
| Script Include inspection | Both records exist once in Global scope and are active. Their installed descriptions identify the restricted membership bridge and queued workspace-provisioning worker. |
| Worker Business Rules | 2: Member Mutation Command Worker (`0d2f3146f31d4c439ea6b6cd50a105a2`) and Provision Request Worker (`fa8109eeb6ed4c3e91c11238db780568`) |
| Global runtime modules | 6 exact `sys_module` records, including `e1db765a6cbc4f568b5196435a42ef7b` for `/global/docsera-global-workspace-bridge/0.1.0/package.json`, plus the two Script Include and two worker paths and `d9b48b4fd7c4406583535934478c82db` |
| Cross-scope control | 9 expected `sys_scope_privilege` records and one restricted caller access record `449a6d8fb9d6e5b6c84e14c4314d8ccb` for `global.DocseraGlobalWorkspaceMembershipBridge` |
| Direct host | `sys_ui_page:de3b81474ba94c0a9296d12f9c6bd9cc` named `docsera`; read ACL `sys_security_acl:879785c448564188a54416cb90d18c14`; two expected UX assets (`271d5363931d4b57ac26212e883ed1ab`, `8e4cefdd7fdd40f493c43fd2630de2c8`) |
| Retired ACL-role binding | The only `sys_security_acl_role` customer update is `1416f98418e24c18af184b0300f7793c`; its source `DELETE` operation was committed so the obsolete temporary editor-role binding remains absent. |

The exact committed customer-update inventory contains no `sys_package:global`,
`sys_scope:global`, or `sys_app:global` update. No missing, duplicated, or unexpected
Docsera-provided component was indicated by the committed 25-record inventory; no
shared Global identity metadata was changed by this update set.

## Qualification boundary

This is metadata-installation verification, not runtime qualification. It does not prove
that the six Global package modules resolve under the receiving instance's existing
Global package configuration, that either Script Include or worker executes, or that
first-workspace provisioning works. Those checks, plus later functional workspace
testing, remain required and were deliberately not performed in RR-039H.

## Validation

- Authenticated ServiceNow administrative inspection: preflight, batch commit result,
  set state/counters, and Global Script Include identity/scope/active state verified.
- No interactive Docsera workspace testing or manual Global module/worker execution.
- `npm run validate:docs` and `git diff --check`: run after this report is written.
