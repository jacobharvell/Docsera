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

That failure occurs before the runtime path can complete workspace persistence, role assignment, or membership storage.

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

For runtime workspace provisioning, the minimal cross-scope privileges needed on the native global tables are:

| Target table | Runtime operation needed | Why it is needed | Current PDI state |
|---|---|---|---|
| `sys_user_group` | `create`, `write` | Create and persist the workspace Admin/Editor groups | `read`, `create`, and `write` are allowed |
| `sys_group_has_role` | `create`, `write` | Attach pre-existing Docsera-scoped roles to the generated groups | `read`, `create`, and `write` are allowed |
| `sys_user_grmember` | `create`, `write` | Add the creator to the generated admin group | `read`, `create`, and `write` are allowed |

Delete access should be treated separately from create/write access.

Delete privileges are only needed for cleanup or rollback behavior. They should not be assumed when approving the runtime provisioning path.

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
- the runtime route can create Docsera-owned groups, assign pre-existing Docsera roles, add creator membership, and persist the workspace record

The PDI is ready for development/operator test-data work when the configured credential can still install, verify, and create/delete temporary test records safely, even if the runtime route is blocked.

## Accepted Direction

Changing OOTB `sys_user_group` application access is not the accepted direction for Docsera.

For workspace provisioning, the accepted platform-safe direction is a constrained global provisioning bridge, or another explicitly approved boundary with the same safety properties:

- only provisions Docsera-owned workspace groups
- validates the Docsera workspace group naming convention
- assigns only pre-existing Docsera scoped roles
- adds only the workspace creator to the generated Admin group during workspace creation
- does not expose general-purpose group administration behavior to the scoped app

Future self-service workspace creation remains separate from this provisioning boundary.

## Current Conclusion

Current status is:

- ready for SDK/runtime verification
- ready for temporary operator test-data management
- not yet ready for end-to-end runtime workspace provisioning because the scoped runtime route still cannot create `sys_user_group` records while `sys_user_group.create_access` remains `false`
- not approved to solve the problem by changing OOTB `sys_user_group` application access

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

## Blocker

The remaining blocker is a native table application-access decision, not a missing cross-scope privilege record.

The Docsera runtime route can authenticate, resolve the current admin session, and reach `group.insert()`, but `sys_user_group` still reports `create_access=false` in `sys_db_object`. The direct operator/Table API probe can create and delete the same group name, which confirms the user session itself is not the blocker.

To complete end-to-end runtime workspace provisioning, the project needs the constrained global bridge or another explicitly approved platform-safe provisioning boundary, then PDI proof of:

- bridge installation and tracking path
- scoped execute privilege to the bridge
- caller restriction behavior or equivalent boundary control
- end-to-end workspace verifier success without OOTB table application-access changes
