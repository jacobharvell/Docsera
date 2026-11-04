# RR-070 — Owned Global Restricted Caller Access Preflight

Date: 2026-11-03

Status: **Read-only administrator handoff. Do not create, approve, modify, or import an RCA from this task.**

## Decision

The minimum intended authorization is a **Scope-to-Target** Restricted Caller Access (RCA) relationship. It allows the installed Docsera scoped application, as a whole, to execute exactly one Script Include owned by the separately owned Global companion. It is not Scope-to-Scope and it must not be owned by the platform Global application record.

| RCA field | Required value |
| --- | --- |
| RCA owning application / `sys_scope` | `2698dffadc844c00a9f20d67fca177d5` — **Docsera Global Workspace Provisioning Bridge** (runtime scope display: `global`) |
| Source Scope / `source_scope` | `e6e43323accd4c7fb9271525a343850e` — `x_2300756_docsera` |
| Source Table / `source_table` | `sys_scope` |
| Source / `source` | `e6e43323accd4c7fb9271525a343850e` |
| Source Type / `source_type` | Scope (`5`) |
| Target Scope / `target_scope` | `2698dffadc844c00a9f20d67fca177d5` — owned companion, **not** platform `global` |
| Target Table / `target_table` | `sys_script_include` |
| Target / `target` | `bb42e634e203492591a8d18e6953eae1` — `DocseraGlobalWorkspaceMembershipBridge` |
| Target Type / `target_type` | Script Include (`2`) |
| Operation | Execute API (`execute`) |
| Status | Allowed (`2`) |
| RCA type | Real RCA (`real_rca`), if exposed by the form |

Official ServiceNow documentation says an RCA must be present in the target application, so the target scope must match the application scope. The installed target belongs to the new companion application even though its *runtime* scope displays as `global`; both record ownership and `target_scope` must therefore reference `2698dffadc844c00a9f20d67fca177d5`. The platform-owned `global` record is not the target owner.

ServiceNow defines this as Scope-to-Target: all resources in the source scope can access one selected resource. It is the narrowest supported relationship compatible with source Type = Scope; do not broaden the target to Scope or select Global as a generic target.

## Installed target and ownership evidence

RR-069 recorded authenticated, non-browser post-install checks against `https://dev468303.service-now.com/` at approximately 2026-11-03 20:02 UTC:

| Record | Verified RR-069 evidence |
| --- | --- |
| Owned companion application | `2698dffadc844c00a9f20d67fca177d5`, Docsera Global Workspace Provisioning Bridge, active, version `0.1.0`, runtime scope `global` |
| Membership Script Include | `bb42e634e203492591a8d18e6953eae1`, `DocseraGlobalWorkspaceMembershipBridge`, API `global.DocseraGlobalWorkspaceMembershipBridge`, active, public, Caller Restriction |
| Ownership | The 23 companion records, including the Script Include, are owned by `2698dffadc844c00a9f20d67fca177d5` |
| RCA state | The post-install restricted-caller-access query was empty; RR-069 deliberately created no approval |

The committed Fluent source independently declares the target as `accessibleFrom: "public"` and `callerAccess: "restriction"`. Public permits cross-scope evaluation; it does not approve execution.

## Historical update-set reconciliation

Do not reuse the historical update-set generator. It hard-codes the shared-Global ownership model:

```xml
<sys_scope>global</sys_scope>
<target_scope>global</target_scope>
```

It targets prior bridge ID `5bf5c028daaa417d88de36616e4c8300`, not installed target `bb42e634e203492591a8d18e6953eae1`. Its deterministic old RCA ID `449a6d8fb9d6e5b6c84e14c4314d8ccb` is a historical control only—not a record to import, clone, or approve. RR-068 excluded RCA from the SDK package because SDK 4.8.1 has no supported Fluent declaration for this approval.

## Read-only evidence and limitation

This task attempted the following explicit-alias, read-only queries:

```powershell
npx @servicenow/sdk query sys_script_include -q 'sys_id=bb42e634e203492591a8d18e6953eae1' -f 'sys_id,name,api_name,sys_scope,active,access,caller_access' -a docsera-dev468303 -o json
npx @servicenow/sdk query sys_scope -q 'sys_id=2698dffadc844c00a9f20d67fca177d5' -f 'sys_id,scope,name' -a docsera-dev468303 -o json
```

They did not reach the target instance: this workstation has only `docsera-source` for `https://dev437892.service-now.com/`; the SDK returned “Could not find stored credentials for alias: docsera-dev468303.” No query was redirected to the differently named instance. This is a credential-availability limitation, not evidence of a missing or invisible record; no credential was created or changed.

An administrator with target-instance access must run these independent checks before creating or approving anything:

```powershell
# Positive controls: each must return exactly one expected record.
npx @servicenow/sdk query sys_scope -q 'sys_id=2698dffadc844c00a9f20d67fca177d5' -f 'sys_id,scope,name' -a docsera-dev468303 -o json
npx @servicenow/sdk query sys_script_include -q 'sys_id=bb42e634e203492591a8d18e6953eae1' -f 'sys_id,name,api_name,sys_scope,active,access,caller_access' -a docsera-dev468303 -o json

# Historical exact-ID negative control: never treat it as the owned-target relationship.
npx @servicenow/sdk query sys_restricted_caller_access -q 'sys_id=449a6d8fb9d6e5b6c84e14c4314d8ccb' -f 'sys_id,sys_scope,source_scope,target_scope,target,operation,status' -a docsera-dev468303 -o json

# Independent source and target predicates.
npx @servicenow/sdk query sys_restricted_caller_access -q 'source_scope=e6e43323accd4c7fb9271525a343850e' -f 'sys_id,sys_scope,source_scope,source,source_table,source_type,target_scope,target,target_table,target_type,operation,status,rca_type' -a docsera-dev468303 -o json
npx @servicenow/sdk query sys_restricted_caller_access -q 'target=bb42e634e203492591a8d18e6953eae1' -f 'sys_id,sys_scope,source_scope,source,source_table,source_type,target_scope,target,target_table,target_type,operation,status,rca_type' -a docsera-dev468303 -o json
```

Interpret zero RCA rows as “no visible RCA” only after both positive controls return their expected records. A 401/403/404, error envelope, or missing positive control is a query-visibility/authorization limitation, not absence proof. Any returned row must match the Decision table exactly; same-name, Global-owned, scope-to-scope, requested, denied, or different-target rows are not equivalent.

## Administrator procedure

1. Sign in to `https://dev468303.service-now.com/` as `admin` or the companion application administrator. Do not activate a plugin or change cross-scope policy.
2. Run the positive controls. Confirm target Script Include ID `bb42e634e203492591a8d18e6953eae1`, active, public/All application scopes, Caller Access = Caller Restriction.
3. Switch to **Docsera Global Workspace Provisioning Bridge** identified by `2698dffadc844c00a9f20d67fca177d5`, not the platform Global application. Both can display `global` at runtime.
4. Navigate to **System Applications > Application Restricted Caller Access**. Prefer the target application’s Restricted Caller Access Privileges related list, so the record is owned by the companion.
5. Select **New** and enter the Decision-table values. Select Source Type = Scope; Target Type = Script Include; target only the exact bridge ID; Operation = Execute API; Status = Allowed.
6. Before saving, recheck record Application/`sys_scope` and `target_scope` are the companion ID, while source and `source_scope` are the scoped Docsera ID. Confirm no field resolves to platform `global`. Add a concise reason naming this sole membership-bridge execute approval.
7. Save exactly one record. If the form cannot select the owned companion as record owner and target scope, stop and capture the behavior; do not substitute `global` or create a broader authorization.

## Post-save verification and later tests

Immediately rerun the positive controls and both independent RCA predicates. Exactly one matching row must show companion `sys_scope` and `target_scope`, exact target ID, `operation=execute`, and `status=2`/Allowed. Record the server-issued RCA ID and re-query it by that exact ID; do not manufacture an ID.

Membership testing is out of scope here and needs a separately approved non-destructive plan. That plan should exercise, through the scoped app only, a safe-user Editor add/promotion, Editor-to-Admin promotion, Admin demotion while another Admin remains, and removal; verify native group state and command outcome. It must also show that last-active-Admin demotion/removal remains blocked. Do not call the Global Script Include directly or mutate production membership data.

## Sources

- [RR-069 First Owned Global SDK Installation](RR-069%20First%20Owned%20Global%20SDK%20Installation.md)
- [RR-068 Owned Global SDK Package](RR-068%20Owned%20Global%20SDK%20Package.md)
- `app/docsera-global-bridge/src/fluent/script-includes/docsera-global-workspace-provisioning-bridge.now.ts`
- `app/docsera-global-bridge/scripts/generate-update-set-artifact.mjs`
- ServiceNow Brazil documentation: [scope-to-target settings](https://www.servicenow.com/docs/r/pt-BR/application-development/scope-to-target-settings.html), [define cross-scope access](https://www.servicenow.com/docs/r/pt-BR/application-development/set-RCA-level.html), and [RCA fields/target-application rule](https://www.servicenow.com/docs/r/application-development/scope-resource-access.html?contentId=xRjO604b8jmc3N9jNH6Cig).

## Boundary

No RCA record was created, approved, changed, imported, or packaged. No SDK installation/reinstallation, update-set import, security-policy change, membership mutation, browser test, or canonical release-artifact change was performed.
