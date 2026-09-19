# Implementation Notes - Workspace Provisioning Governance and PDI Readiness

Date: 2026-07-05

Status: readiness note

## Scope

This note records the current repository-side readiness boundary for Docsera workspace provisioning work.

It separates:

- Docsera runtime authority inside the installed scoped app
- development/operator authority using Jacob's configured PDI credentials for install, verification, and temporary test-data management

Accepted product behavior remains defined by the Obsidian requirements vault.

## Platform Guardrail

Docsera should remain a safe, upgrade-friendly ServiceNow scoped application.

As a general rule, Docsera should avoid modifying out-of-the-box platform behavior, core global tables, baseline ACLs, baseline table application access, or other core platform metadata unless an explicit architecture decision accepts that risk.

When Docsera needs behavior that touches protected platform resources, the preferred direction is a narrowly constrained, documented provisioning boundary rather than changing OOTB platform settings.

## PDI and Auth Assumptions

The current SDK auth alias is `docsera-pdi`.

The verification scripts read the alias from:

- `DOCSERA_SDK_AUTH_ALIAS`
- `SN_SDK_AUTH_ALIAS`

The instance URL can also be overridden with:

- `DOCSERA_SDK_INSTANCE_URL`
- `SN_SDK_INSTANCE_URL`

The local SDK keyring store uses the `ServiceNow` service and `now-sdk` account. No credentials, tokens, or password material belong in the repo.

## Authority Split

### Docsera Runtime Authority

Runtime authority is limited to what the installed scoped app can do on-instance.

For workspace provisioning, the runtime path is the server-side route:

- `POST /api/x_82900_docsera/docsera_runtime/workspaces`

That runtime path must create Docsera-owned groups, assign only pre-existing Docsera-scoped roles, and store the resulting group references on the workspace record.

### Development / Operator Authority

Development/operator authority is the authority Jacob and Codex have while working with the configured PDI credentials.

That authority is used for:

- installing the SDK runtime
- verifying the runtime installation
- querying instance metadata
- creating and deleting temporary test data
- confirming whether the PDI is ready for runtime workspace provisioning work

Operator success does not prove Docsera runtime authority.

## Verified Current State

### Local Checks

The following repo commands currently pass on this checkout and PDI:

- `npm run install:sdk-ui-page`
- `npm run verify:sdk-ui-page`

### Workspace Foundation Check

The workspace foundation verifier still fails at the first live workspace create attempt:

- `npm run verify:workspace-foundation`

Observed failure:

```text
Failed to create ServiceNow group Docsera_Verification_Workspace_Admins.
```

That failure occurs before the runtime path can complete workspace persistence or role assignment.

### Runtime Group Create Probe

A direct temporary probe against `sys_user_group` now succeeds with the same authenticated admin session and the same group name used by the verifier:

- create temporary `sys_user_group`
- query the exact verification group name `Docsera_Verification_Workspace_Admins`
- create that group directly through the table API
- confirm the record is created and readable
- delete the temporary verification group after the probe

This shows the development/operator credential can create the group directly, while the workspace verifier route still fails inside the runtime provisioning path.

Cross-scope privileges alone are therefore insufficient. The runtime path can hold allowed privilege records and still fail if the target native table blocks scoped create access through its own application-access boundary.

### Operator Probe

A direct temporary-data probe using the configured admin session succeeded and was cleaned up immediately:

- create temporary `sys_user_group`
- assign `x_82900_docsera.editor` through `sys_group_has_role`
- add the current admin user to the temporary group through `sys_user_grmember`
- delete the membership row
- delete the role row
- delete the temporary group

This proves the configured development credential can manage temporary test data directly, but it does not prove the runtime provisioning route is authorized.

### Runtime Route Diagnostics

The installed runtime route now emits server-side diagnostics during the first workspace create attempt.

Observed context from the route logs:

- current user name: `admin`
- current user sys_id: `6816f79cc0a8016401c5a33be04be441`
- `gs.hasRole("admin")`: `true`
- `gs.hasRole("x_82900_docsera.admin")`: `true`
- `gs.hasRole("x_82900_docsera.workspace_admin")`: `true`
- `gs.hasRole("x_82900_docsera.editor")`: `true`
- target group did not already exist before insert
- `createGroup insert begin` was reached for `Docsera_Verification_Workspace_Admins`
- `group.insert()` returned an empty sys_id instead of creating the record

The instance log now shows the runtime route failure as:

- `[Docsera workspace provisioning] Failed to create ServiceNow group Docsera_Verification_Workspace_Admins. ...`

The workspace verifier also queries the native table metadata directly and confirms:

- `sys_user_group.create_access = false`
- `sys_user_grmember.create_access = true`
- `sys_group_has_role.create_access = true`

That is the key mismatch between the direct operator/Table API probe and the scoped runtime route.

## Required Cross-Scope Privileges

Current Docsera source scope:

- `6997f092c3fd8310c569bf0d0501314d`

For workspace creation and later Manage access membership management, the minimal cross-scope privileges needed on the native global tables are:

| Target table | Runtime operation needed | Why it is needed | Current PDI state |
|---|---|---|---|
| `sys_user_group` | `create`, `write` | Create and persist the workspace Admin/Editor groups | `read`, `create`, and `write` are allowed |
| `sys_group_has_role` | `create`, `write` | Attach pre-existing Docsera-scoped roles to the generated groups | `read`, `create`, and `write` are allowed |
| `sys_user_grmember` | `create`, `write` | Manage access can add workspace group membership after creation | `read`, `create`, and `write` are allowed |

Delete access should be treated separately from create/write access.

Delete privileges are only needed for cleanup, rollback, or future access-removal behavior. They should not be assumed when approving the runtime provisioning path.

If Docsera calls a future global bridge script include instead of creating groups directly, the scoped app will also need an `execute` cross-scope privilege for that script include.

## Manual Jacob Steps

If the instance requires explicit approval, Jacob should:

1. Open the cross-scope privilege list for the Docsera scope:
   - `/sys_scope_privilege_list.do?sysparm_query=source_scope=6997f092c3fd8310c569bf0d0501314d^target_nameINsys_user_group,sys_group_has_role,sys_user_grmember`
2. Review or create cross-scope privilege records for:
   - source scope: Docsera
   - target table: `sys_user_group`
   - target table: `sys_group_has_role`
   - target table: `sys_user_grmember`
3. Approve the needed operations:
   - `create`
   - `write`
   - `delete` only if rollback/cleanup support must be approved as part of the runtime path
4. Re-run:
   - `npm run install:sdk-ui-page`
   - `npm run verify:sdk-ui-page`
   - `npm run verify:workspace-foundation`

Expected status for the provisioning records is `allowed`.

Current live state: those records now exist and are allowed, so no additional manual approval is needed for the three runtime tables at this time.

## Readiness Meaning

The PDI is ready for workspace provisioning tasks when all of the following are true:

- the SDK install succeeds
- the SDK runtime verifier passes
- the workspace foundation verifier reaches the live route and completes end to end
- the runtime route can create Docsera-owned groups, assign pre-existing Docsera roles, preserve creator audit metadata, leave generated groups empty, and persist the workspace record

The PDI is ready for development/operator test-data work when the configured credential can still install, verify, and create/delete temporary test records safely, even if the runtime route is blocked.

## Accepted Direction

Changing OOTB `sys_user_group` application access is not the accepted direction for Docsera.

For workspace provisioning, the accepted platform-safe direction is a constrained global provisioning bridge, or another explicitly approved boundary with the same safety properties:

- only provisions Docsera-owned workspace groups
- validates the Docsera workspace group naming convention
- assigns only pre-existing Docsera scoped roles
- leaves the generated Admin and Editor groups empty during workspace creation
- preserves the creating Docsera Admin as audit metadata without automatically adding that creator to generated workspace access groups
- relies on Manage access for assigning the first Workspace Admin or Editor after creation
- does not expose general-purpose group administration behavior to the scoped app

Future self-service workspace creation remains separate from this provisioning boundary.

## Pre-Bridge Conclusion

Current status is:

- ready for SDK/runtime verification
- ready for temporary operator test-data management
- not yet ready for end-to-end runtime workspace provisioning because the scoped runtime route still cannot create `sys_user_group` records while `sys_user_group.create_access` remains `false`
- not approved to solve the problem by changing OOTB `sys_user_group` application access

This section reflects the earlier direct scoped-insert phase before the bridge spike below.

## Bridge Feasibility in the Current Toolchain

The current SDK/toolchain can represent the scoped side of the bridge cleanly:

- Fluent supports `ScriptInclude(...)` metadata with `accessibleFrom: 'public'` and `callerAccess: 'restriction'`.
- Fluent supports `CrossScopePrivilege(...)` records with `operation: 'execute'` and `targetType: 'sys_script_include'`.
- The current repo already packages and installs those Fluent metadata types from source.

The current repo does not yet contain a companion global package.

The active runtime package at `app/docsera-ui` is a single scoped app with `scope: "x_82900_docsera"` in `now.config.json`. A true global bridge cannot be installed as part of that same scoped package. It would need one of these boundaries:

- a separate Fluent project/package in this repo with `scope: "global"` and its own install flow
- a companion global update set / manual install artifact tracked separately and documented in repo docs

Inference from current SDK docs: restricted caller access can be modeled on the Script Include record, but one-time instance approval and exact install-time handling for restricted-caller records still need to be proven on the PDI.

## Pre-Bridge Blocker

The remaining blocker is a native table application-access decision, not a missing cross-scope privilege record.

The Docsera runtime route can authenticate, resolve the current admin session, and reach `group.insert()`, but `sys_user_group` still reports `create_access=false` in `sys_db_object`. The direct operator/Table API probe can create and delete the same group name, which confirms the user session itself is not the blocker.

To complete end-to-end runtime workspace provisioning, the project needs the constrained global bridge or another explicitly approved platform-safe provisioning boundary, then PDI proof of:

- bridge installation and tracking path
- scoped execute privilege to the bridge
- caller restriction behavior or equivalent boundary control
- end-to-end workspace verifier success without OOTB table application-access changes

This section reflects the earlier direct scoped-insert phase before the bridge spike below.

## 2026-07-05 Bridge Spike Update

The repo now contains a companion global bridge package:

- `app/docsera-global-bridge`

The scoped runtime package previously contained the scoped side of the bridge; that direct-call path is now retired in favor of the request-backed worker queue:

- cross-scope execute privilege source: `app/docsera-ui/src/fluent/security/docsera-workspace-global-bridge.now.ts`
- scoped bridge client source: retired
- runtime workspace provisioning now uses `POST /workspaces` + the request queue instead of a direct global bridge call

### Current Spike Result

Local repo validation now proves:

- `npm --prefix app/docsera-ui run test` passes
- `npm --prefix app/docsera-ui run build` passes
- `npm run build:sdk-global-bridge` passes
- `npm run validate:docs` passes

PDI validation now proves:

- `npm run install:sdk-ui-page` succeeds
- the scoped app installs an allowed `execute` privilege for `DocseraGlobalWorkspaceProvisioningBridge`
- `npm run install:sdk-global-bridge` does **not** succeed

Observed global install failure:

```text
Exception occurred while installing application
java.lang.IllegalStateException: RollbackContext is in invalid state
Application install failed
```

Direct instance queries after the failed global install originally confirmed:

- no `sys_script_include` named `DocseraGlobalWorkspaceProvisioningBridge` exists on the PDI
- the scoped `sys_scope_privilege` execute record does exist and is `allowed`
- no `sys_restricted_caller_access` record exists yet for the bridge call path

That was the earlier absent-record failure mode.

### Updated Live Bridge State

Jacob then manually installed and corrected the global bridge record.

Current verified live metadata:

- `sys_script_include.sys_id=61f7e453c3b98b10c569bf0d0501313f`
- `name=DocseraGlobalWorkspaceProvisioningBridge`
- `api_name=global.DocseraGlobalWorkspaceProvisioningBridge`
- `access=public`
- `caller_access=2`
- `active=true`
- `sys_scope=global`

Current verified execute privilege state:

- `sys_scope_privilege.sys_id=b523541000134b7ba376fb9302a1857f`
- `operation=execute`
- `target_name=DocseraGlobalWorkspaceProvisioningBridge`
- `status=allowed`

Current RCA state:

- no `sys_restricted_caller_access` rows exist for the Docsera scope
- repeated live route calls did not cause the platform to create an RCA row

### Updated Invocation Result

Even with the manual bridge record present and the execute privilege allowed, the scoped SDK runtime still fails on the first workspace create attempt.

Current live verifier result:

```text
HTTP 400
Failed to provision workspace access groups.
```

The REST response is now safely sanitized, but the remaining blocker is invocation, not metadata presence.

Scoped caller diagnostics from the live route show:

```text
[Docsera workspace bridge caller] stage=constructor.inspect directType=undefined globalType=object globalCtorType=undefined
```

That proves the scoped caller cannot resolve either:

- `DocseraGlobalWorkspaceProvisioningBridge`
- `global.DocseraGlobalWorkspaceProvisioningBridge`

from the installed on-instance runtime context.

No global bridge method-entry logs appear during the failing route call, so the failure occurs before constructor creation and before the global bridge method body runs.

### Updated Feasibility Finding

The current SDK/toolchain can represent both sides of the bridge in source, but it cannot yet cleanly complete the **global install** path on this PDI through `now-sdk install`.

The practical current outcome is therefore:

- keep the bridge source in-repo under `app/docsera-global-bridge`
- treat the global bridge as a companion manual global install artifact for metadata verification only for now
- keep the scoped app repo-packaged and SDK-installed
- treat the scoped runtime invocation path as still blocked until the global companion package can expose a supported runtime binding

### Companion Manual Install Artifact

The smallest current companion artifact is the single global Script Include record represented by either of these local files:

- source script body: `app/docsera-global-bridge/src/server/script-includes/docsera-global-workspace-provisioning-bridge.js`
- built record XML: `app/docsera-global-bridge/dist/app/update/sys_script_include_abf83bf6db1e46dea88c97ec493153bc.xml`

The built XML contains the full script body inline, which is enough to create the manual Script Include record itself.

Current live evidence shows that this manual record alone is **not** enough to make the bridge callable from the scoped SDK-emitted runtime path.

### Manual Jacob Steps

1. Build the companion bridge artifact locally:
   - `npm run build:sdk-global-bridge`
2. On the PDI, create a **global** Script Include with:
   - Name: `DocseraGlobalWorkspaceProvisioningBridge`
   - API name: `global.DocseraGlobalWorkspaceProvisioningBridge`
   - Accessible from: `public`
   - Caller access: `restriction`
   - Active: `true`
   - Client callable: `false`
   - Mobile callable: `false`
   - Sandbox callable: `false`
3. Paste the script body from:
   - `app/docsera-global-bridge/src/server/script-includes/docsera-global-workspace-provisioning-bridge.js`
   - or load the built XML record from `app/docsera-global-bridge/dist/app/update/sys_script_include_abf83bf6db1e46dea88c97ec493153bc.xml`
4. Re-run:
   - `npm run install:sdk-ui-page`
   - `npm run verify:sdk-global-bridge`
   - `npm run verify:sdk-ui-page`
   - `npm run verify:workspace-foundation`
5. If the first live bridge call generates a restricted-caller approval record, review and allow it at:
   - `/sys_restricted_caller_access_list.do?sysparm_query=source_scope=6997f092c3fd8310c569bf0d0501314d^operation=execute`
6. Re-run:
   - `npm run verify:sdk-global-bridge`
   - `npm run verify:workspace-foundation`

Current result after those steps:

- `npm run verify:sdk-global-bridge` passes
- `npm run verify:sdk-ui-page` passes
- `npm run verify:workspace-foundation` still fails on scoped runtime invocation

### OOTB Table Access Position

This spike does **not** change the accepted platform position:

- `sys_user_group.create_access` remains unchanged
- no OOTB table application-access change is required in source
- the scoped app now depends on a narrow global provisioning boundary instead of direct scoped inserts into `sys_user_group`

## Current Conclusion

Current status is:

- ready for SDK/runtime verification
- ready for manual bridge metadata verification
- not yet ready for end-to-end runtime workspace provisioning
- not approved to solve the problem by changing OOTB `sys_user_group` application access

The remaining blocker is no longer missing global bridge metadata.

The remaining blocker is that the scoped SDK runtime cannot currently resolve the manually installed global Script Include as an executable constructor, even though:

- the Script Include record exists
- the execute privilege is allowed
- no RCA row is being generated

## Smallest Next Technical Option

The smallest next technical option is to get the companion global package install path working, or otherwise produce the generated on-instance runtime artifacts that expose a supported binding for the global bridge to scoped SDK-emitted code.
