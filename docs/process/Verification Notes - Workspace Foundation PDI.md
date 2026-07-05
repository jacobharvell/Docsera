# Verification Notes - Workspace Foundation PDI

Date: 2026-07-04

Status: verification note

## Scope

This note records the PDI verification work for the merged workspace foundation on `verify/workspace-foundation-pdi`.

It captures repo-side evidence only. Accepted product behavior remains in the Obsidian requirements and implementation brief.

## Commands Run

Local validation:

- `npm --prefix app/docsera-ui run test`
- `npm --prefix app/docsera-ui run build`

PDI install and runtime verification:

- `npm run install:sdk-ui-page`
- `npm run verify:sdk-ui-page`
- `npm run verify:workspace-foundation`

Targeted live metadata queries:

- `npx @servicenow/sdk query sys_ws_definition -a docsera-pdi -q 'namespace=x_82900_docsera^service_id=docsera_runtime' -f 'sys_id,name,namespace,service_id,base_uri,active' -o json`
- `npx @servicenow/sdk query sys_ws_operation -a docsera-pdi -q 'nameINping,workspaces^operation_uriSTARTSWITH/api/x_82900_docsera/docsera_runtime' -f 'sys_id,name,http_method,operation_uri,relative_path,web_service_definition,active' -o json`
- `npx @servicenow/sdk query sys_user_role -a docsera-pdi -q 'nameINx_82900_docsera.admin,x_82900_docsera.workspace_admin,x_82900_docsera.editor' -f 'sys_id,name' -o json`
- `npx @servicenow/sdk query sys_scope_privilege -a docsera-pdi -q 'source_scope=6997f092c3fd8310c569bf0d0501314d^target_nameINsys_user_group,sys_group_has_role,sys_user_grmember,sys_user_role' -f 'sys_id,target_name,operation,status' -o json`

## Result Summary

### SDK install and existing runtime verifier

- `npm run install:sdk-ui-page` succeeded on the target PDI.
- `npm run verify:sdk-ui-page` passed.
- The installed Direct UI Page returned `200`.
- The installed `main.jsdbx` and runtime CSS assets returned `200`.
- `GET /api/x_82900_docsera/docsera_runtime/ping` returned authenticated `200` JSON with `scope: x_82900_docsera` and `status: ok`.

### Workspace table, roles, and REST metadata

Machine-verified:

- `sys_db_object` contains `x_82900_docsera_workspace`.
- `sys_dictionary` contains `x_82900_docsera_workspace.workspace_slug` with `unique=true`.
- `sys_user_role` contains:
  - `x_82900_docsera.admin`
  - `x_82900_docsera.workspace_admin`
  - `x_82900_docsera.editor`
- `sys_ws_definition` contains the `docsera_runtime` service with base URI `/api/x_82900_docsera/docsera_runtime`.
- `sys_ws_operation` contains:
  - `GET /ping`
  - `POST /workspaces`

### Workspace create route

Result:

- `POST /api/x_82900_docsera/docsera_runtime/workspaces` reached the installed route after targeted hardening.
- The live route still does not complete workspace provisioning on the PDI.
- Current observed response:

```json
{
  "result": {
    "error": {
      "message": "Failed to create ServiceNow group Docsera_Verification_Workspace_Admins."
    }
  }
}
```

### Root cause evidence

Machine-verified blocker:

- The scoped app currently has only `read` access recorded for `sys_user_group`:
  - `target_name=sys_user_group`
  - `operation=read`
  - `status=allowed`
- No `create` or `write` cross-scope privilege records were found for:
  - `sys_user_group`
  - `sys_group_has_role`
  - `sys_user_grmember`

Interpretation:

- The runtime install and REST metadata are present.
- Workspace provisioning is blocked by on-instance global-table access, not by missing route metadata.
- Because the route cannot create the first native group, the task could not machine-verify persisted workspace records, scoped role assignment on created groups, creator membership in the created Admin group, or live slug-allocation/duplicate-insert behavior end-to-end.

## Small Targeted Hardening Applied

Two bounded fixes were made while verifying:

1. Server module imports now use explicit `.ts` paths where the SDK-generated ServiceNow module loader requires exact module names.
2. Workspace domain logic used by server modules now lives under `src/server/workspaces/serverWorkspaceDomain.ts` so the SDK emits it into `sys_module` records for on-instance resolution.

These fixes resolved the initial module-resolution failures and proved that the remaining blocker is platform access to global tables during provisioning.

## Cleanup

- No verification workspace records were created.
- No verification groups were created.
- No cleanup was required on the PDI after the final blocked run.

## Manual Follow-Up For Jacob

To continue live verification on the PDI, review the cross-scope access policy for the Docsera scope:

1. Open `/sys_scope_privilege_list.do?sysparm_query=source_scope=6997f092c3fd8310c569bf0d0501314d^target_nameINsys_user_group,sys_group_has_role,sys_user_grmember,sys_user_role`.
2. Confirm whether Docsera should be allowed to create/write:
   - `sys_user_group`
   - `sys_group_has_role`
   - `sys_user_grmember`
3. If that access is approved, allow the required privileges on the instance.
4. Re-run:
   - `npm run install:sdk-ui-page`
   - `npm run verify:sdk-ui-page`
   - `npm run verify:workspace-foundation`

After that privilege decision, the remaining intended machine verification is:

- successful `POST /workspaces`
- persisted `x_82900_docsera_workspace` record contents
- generated Admin/Editor groups
- group-role assignments
- creator membership in the Admin group
- route-level slug suffix allocation
- direct duplicate `workspace_slug` rejection

## Remaining Risk

- Live workspace provisioning should not be treated as proven on-instance until the global-table access policy is explicitly resolved and the route verification is rerun successfully.
