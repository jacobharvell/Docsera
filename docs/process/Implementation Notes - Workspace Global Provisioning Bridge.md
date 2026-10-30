# Implementation Notes - Workspace Global Provisioning Bridge

Date: 2026-07-06

Status: finalized request-backed global worker queue

## Summary

Docsera workspace provisioning now uses a request-backed queue boundary instead of a direct scoped-to-global Script Include call.

```text
scoped POST /workspaces
-> insert x_82900_docsera_workspace_provision_request
-> global async worker processes request
-> create empty groups / assign roles
-> create x_82900_docsera_workspace
-> update provisioning request state and refs
```

The direct scoped invocation attempt was abandoned because the PDI rejected custom scoped access to the global resource before the bridge approval path could help.

## Why the Boundary Exists

Observed scoped-side failure from the abandoned direct path:

- `directType=undefined`
- `globalCtorType=undefined`
- `Security restricted: When targeting a global resource, only ServiceNow authored scopes are allowed as sources`

That makes the worker queue the supported implementation boundary for native group provisioning on this PDI.

## Final Runtime Contract

### Scoped side

The scoped app owns:

- `POST /api/x_82900_docsera/docsera_runtime/workspaces`
- `GET /api/x_82900_docsera/docsera_runtime/workspace-provisioning-status`
- `x_82900_docsera_workspace_provision_request`
- `x_82900_docsera_workspace`

The create route returns:

- `201` when the request finishes synchronously enough to return the workspace and groups
- `202` when the request is still `requested` or `processing`
- `400` for validation or provisioning failure

The status route returns:

- `200` with `requested`, `processing`, `succeeded`, or `failed` state data
- `404` when the request does not exist
- `400` for malformed status requests
- `403` before parsing the request ID or loading provisioning data when the current user is not an effective Docsera Admin; it uses the same `canCurrentUserCreateWorkspaces()` authority boundary as workspace creation

### Global side

The companion global package owns:

- `DocseraGlobalWorkspaceProvisioningBridge`
- the async Business Rule on `x_82900_docsera_workspace_provision_request`

The worker is responsible for:

- claiming `requested` rows and moving them to `processing`
- validating the stored workspace naming contract
- creating `Docsera_<Workspace_Key>_Admins`
- creating `Docsera_<Workspace_Key>_Editors`
- assigning `x_82900_docsera.workspace_admin`
- assigning `x_82900_docsera.editor`
- creating the final `x_82900_docsera_workspace` row
- writing request refs and terminal `succeeded`/`failed` state
- rolling back partially created groups when provisioning fails before workspace creation completes

## Data And Boundary

The queue boundary keeps the scoped app from needing direct OOTB global-table writes.

The global worker reads and updates:

- `x_82900_docsera_workspace_provision_request`

The global worker creates or updates:

- `sys_user_group`
- `sys_group_has_role`
- `sys_user_grmember`
- `x_82900_docsera_workspace`

The cross-scope privilege boundary is intentionally narrow:

- scoped code writes only the request row
- global code performs the privileged group and workspace operations
- no OOTB ACL or table-access shortcuts were added

## Companion Update-Set

The supported install path for the global worker is the generated companion update set:

- `app/docsera-global-bridge/update-set/sys_remote_update_set_docsera_global_workspace_provisioning_worker_queue_0_1_0_companion.xml`

Generate or refresh it with:

- `npm --prefix app/docsera-global-bridge run build`
- `npm run build:update-set-global-bridge`

The companion artifact intentionally excludes `sys_app:global` to avoid the duplicate-key failure on current PDIs.

Do not use `npm run install:sdk-global-bridge` as the active PDI install path for this worker. The PDI rejects that path with the rollback-context error, so the companion update-set import is the supported installation path.

## Tables And States

### Request table

`x_82900_docsera_workspace_provision_request` stores:

- `name`
- `workspace_slug`
- `workspace_group_key`
- `admin_group_name`
- `editor_group_name`
- `short_description`
- icon fields
- layout fields
- `requested_by`
- `state`
- `workspace`
- `admin_group`
- `editor_group`
- `error_code`
- `error_message`

Request states:

- `requested`
- `processing`
- `succeeded`
- `failed`

### Workspace table

`x_82900_docsera_workspace` is created only after provisioning succeeds and receives both generated `admin_group` and `editor_group` references from the provisioning bridge. The table columns remain nullable so an inactive workspace tombstone can be persisted after its generated access groups are deleted.

## Verification

Final validation that passed on the PDI:

- `npm --prefix app/docsera-ui run test`
- `npm --prefix app/docsera-ui run build`
- `npm --prefix app/docsera-global-bridge run build`
- `npm run build:update-set-global-bridge`
- `npm run validate:docs`
- `npm run install:sdk-ui-page`
- `npm run verify:sdk-ui-page`
- `npm run verify:sdk-global-bridge`
- `npm run verify:workspace-foundation`

Observed result:

- the provisioning request is persisted first
- the global worker completes group creation and role assignment from global context
- `requested_by` is preserved as workspace creator audit metadata
- generated workspace groups start with no automatic user membership
- the creator is not added to generated workspace groups merely because they created the workspace
- Manage access remains the supported workflow for assigning the first Workspace Admin or Editor after creation
- the workspace row is created only after access provisioning succeeds
- the workspace foundation verifier passes end to end on the PDI

## Platform Guardrails Preserved

- Keep work inside the scoped app and the narrow global companion only.
- Do not change OOTB ACLs.
- Do not change OOTB table application access.
- Do not use a direct scoped-to-global Script Include call path.
- Do not add paid plugin dependencies.
- Keep the global companion update-set as the supported install artifact.
