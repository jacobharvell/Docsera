# RR-039D — Clean-Target Unique Enforcement Probe

Date: 2026-11-01

Status: **One-field runtime qualification complete: `workspace_icon_asset.asset_key` rejects duplicates on the receiving PDI. This does not establish enforcement for the other nine declared Unique fields.**

## Target and scope

The controlled probe ran on `https://dev466345.service-now.com/` in **Scripts - Background**, with scope explicitly selected as `x_82900_docsera` (Docsera). It used `x_82900_docsera_workspace_icon_asset`, whose source definition requires `asset_key`, `state`, and `requested_by`; `asset_key` is the field declared `unique: true`.

The script was an ad-hoc, one-time background execution only. It did not create a permanent script, test endpoint, application source file, update-set record, workspace attachment, or change existing workspace data. The default **Record for rollback?** setting remained selected, preserving the execution-history rollback context as a fallback; no rollback was used because the script's `finally` cleanup completed.

ServiceNow documents that a Dictionary **Unique** field requires the field value to be unique and that the system will not allow two records with the same value. It also documents Scripts - Background as a server-side, scope-selectable execution surface with a rollback-context option. [Require unique values](https://www.servicenow.com/docs/r/platform-administration/t_RequiringUniqueValuesForAField.html) and [Scripts - Background](https://www.servicenow.com/docs/r/api-reference/scripts/c_ScriptsBackground.html).

## Post-first-use cross-scope privilege observation

Jacob confirmed that the installed Docsera UI opened and **My Workspaces** loaded without errors. Before the database probe, a scoped-privilege list query for source scope `x_82900_docsera` returned exactly these two Allowed / Execute API records:

| Target name | Target scope | Status |
| --- | --- | --- |
| `global.DocseraGlobalWorkspaceMembershipBridge` | Global | Allowed |
| `ScriptableServiceResultBuilder.setBody` | Global | Allowed |

Neither `Glide API: user roles and groups` nor `RESTAPIRequest` appeared after that first use. No privilege was manually changed.

## Controlled probe execution

The script generated the distinct prefix `rr039d_1793586889306_6816f79c`, set `requested_by` to the current administrator (`6816f79cc0a8016401c5a33be04be441`), and executed `try/finally` cleanup.

| Step | Result |
| --- | --- |
| Insert key A: `rr039d_1793586889306_6816f79c_a` | Succeeded; sys_id `b51f032dc3d81310ac26fe3d050131bb` |
| Insert key B: `rr039d_1793586889306_6816f79c_b` | Succeeded; sys_id `791f032dc3d81310ac26fe3d050131bc` |
| Insert a distinct third record using key A | Rejected; no sys_id returned |
| Query key A after the duplicate attempt | Exactly 1 record |
| `finally` cleanup | Removed 2 records; remaining count 0 |
| Independent prefix-filtered list query | `No records to display` |

The platform logged the relevant error:

> Unique Key violation detected by database ... Duplicate entry `rr039d_1793586889306_6816f79c_a` for key `asset_key`.

The script's structured result was:

```text
outcome=duplicate_rejected
inserts.a.sysId=b51f032dc3d81310ac26fe3d050131bb
inserts.b.sysId=791f032dc3d81310ac26fe3d050131bc
duplicate.sysId=""
duplicate.keyACount=1
cleanup.removed=2
cleanup.remaining=0
```

## Result and qualification boundary

**Duplicate rejected after successful ordinary inserts.** The observed database unique-key violation, the absent third sys_id, and the post-attempt count of one for key A establish that the installed Unique declaration enforces uniqueness for `x_82900_docsera_workspace_icon_asset.asset_key` on this PDI.

This is a one-field runtime result only. It does not prove physical-index visibility through `v_db_index`, nor enforcement for the other nine Docsera fields whose Dictionary `unique=true` declarations were recorded in RR-039B.

## Automatic platform side effect

Although no privilege was manually changed, the scoped background execution automatically created five Allowed / Execute API cross-scope privilege records: `Glide API: scripting`, `GlideRecord.deleteRecord`, `GlideRecord.insert`, `GlideRecord.setValue`, and `ResourceSupport`. The post-probe list therefore contained seven records total, including the original two. `Glide API: user roles and groups` and `RESTAPIRequest` still did not appear.

This automatic access-tracking behavior means the strict “no application metadata changes” condition was not achievable with this supported scoped execution path on this PDI. No attempt was made to modify, delete, or otherwise repair those automatically generated privilege records. Their presence is a platform side effect that requires independent review; it is not evidence of application-runtime privilege needs.

## Validation

- Focused PDI reads: pre-probe and post-probe cross-scope privilege inventories; source-scope confirmation; background-script output; prefix-filtered cleanup query.
- Focused PDI mutation: one scoped, bounded `try/finally` probe only.
- Cleanup: script reported 2 removed and 0 remaining; an independent filtered list showed no records.
- No interactive Docsera UI/browser acceptance, SDK build, update-set operation, index or ACL modification, or testing of other unique fields was performed.
