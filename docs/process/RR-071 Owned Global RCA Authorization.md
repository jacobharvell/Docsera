# RR-071 — Owned Global RCA Authorization

Date: 2026-11-03

Status: **Stopped without an RCA mutation: the supported administrator UI did not resolve the required owned companion target scope.**

## Pre-authorization checks

The existing authenticated Chrome tab was confirmed to be the requested
`https://dev468303.service-now.com/` PDI and to display **System Administrator**.
No credentials were changed and no other PDI was used.

The following administrator-UI checks succeeded:

| Check | Result |
| --- | --- |
| Owned companion application | Exact `sys_id` `2698dffadc844c00a9f20d67fca177d5` opened as **Docsera Global Workspace Provisioning Bridge**, version `0.1.0`, runtime Scope `global`. |
| Membership bridge | Exact `sys_id` `bb42e634e203492591a8d18e6953eae1` opened as `DocseraGlobalWorkspaceMembershipBridge`, Application = the owned companion, Active, Accessible from = All application scopes, Caller Access = Caller Restriction. |
| Source-side RCA predicate | `source_scope=e6e43323accd4c7fb9271525a343850e` visibly returned **No records to display**. |
| Target-side RCA predicate | `target=bb42e634e203492591a8d18e6953eae1` visibly returned **No records to display**. |
| Historical control | Exact historical synthetic ID `449a6d8fb9d6e5b6c84e14c4314d8ccb` returned **Record not found**. |

The successful exact-record UI checks are the positive controls that make the
empty source and target filters meaningful. No authenticated SDK query was
attempted because this task used the available browser-administrator path.

## Administrator operation and outcome

The companion application was switched into the current application context
and a new Restricted Caller Access Privilege form was opened through the
standard administrator UI. The form correctly set its read-only Application
field to **Docsera Global Workspace Provisioning Bridge**, rather than the
platform Global application.

The source scope was selected as **Docsera**, and Source Type remained
**Scope**. Before setting the target, the required ownership safeguard was
checked. The Target Scope autocomplete offered only a visible **Docsera**
entry. Selecting it and using the form's target-scope preview opened the
scoped source application:

```text
sys_id: e6e43323accd4c7fb9271525a343850e
name: Docsera
scope: x_2300756_docsera
```

It did **not** resolve to the required owned companion:

```text
sys_id: 2698dffadc844c00a9f20d67fca177d5
name: Docsera Global Workspace Provisioning Bridge
runtime scope: global
```

This is an incorrect target relationship, not proof that the companion can be
used as `target_scope`. In accordance with RR-070 and the RR-071 safety
conditions, the form was not submitted, no alternate `global` record was
selected, and no broader Scope-to-Scope authorization was considered.

## Saved record identity and verification

No record was created or approved. Consequently there is no ServiceNow-issued
RCA `sys_id`, no saved Operation or Status, and no post-save exact-ID query.

The two independent UI filters remain empty as observed before opening the
unsaved form; no pre-existing exact Allowed or Requested record was found.

## UI and credential limitations

The Chrome session provided authenticated administrator access to the intended
instance, so the missing SDK alias noted in RR-070 did not block the
read-only checks. The blocker is the UI reference resolution: its visible
Target Scope choice resolves to the scoped Docsera source instead of the
owned companion ID. The current form did not expose a selectable companion
target scope that could be independently verified before saving.

No application metadata, Script Include, shared Global record, security
setting, update set, credential, installation, workspace, or membership data
was changed.

## Readiness for functional acceptance

Not ready. A follow-up must determine, through a supported administrator UI
path and with the same identity checks, how to select and verify
`2698dffadc844c00a9f20d67fca177d5` as both RCA owner and Target Scope. Only
after that precise Scope-to-Target record is visibly resolved should an
administrator create or approve one Allowed `execute` authorization for
`bb42e634e203492591a8d18e6953eae1`.

Workspace creation and membership functional testing were not performed.
