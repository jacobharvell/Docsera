# Docsera Global Worker Companion Update Set

This folder contains the generated companion update-set artifact for the global Docsera workspace provisioning worker queue.

Generate or refresh the artifact from the current SDK build output:

```bash
npm run build:update-set-global-bridge
```

Generated files:

- `sys_remote_update_set_docsera_global_workspace_provisioning_worker_queue_0_1_0_companion.xml`
- `docsera-global-workspace-bridge.update-set.json`

The XML artifact wraps the built global worker runtime records into a retrieved update set import file for `System Update Sets > Retrieved Update Sets > Import Update Set from XML`.

Important PDI cleanup note:

- if you previously imported the older companion update set that included `sys_app:global`, delete that old retrieved update set before importing this companion artifact
- otherwise ServiceNow may keep replaying the stale `sys_update_xml` rows and continue failing with `Duplicate entry 'global' for key 'PRIMARY'`
- if the PDI already has a Docsera-owned global Script Include named `DocseraGlobalWorkspaceProvisioningBridge` from the earlier manual bridge flow and the update set import reports a duplicate-name conflict, remove or replace only that Docsera-owned Script Include and retry the import
- do not delete OOTB `global` package or scope records, and do not change OOTB ACLs or application access as part of this install path

Included worker records:

- `sys_package:global`
- `sys_scope:global`
- `sys_script_include:DocseraGlobalWorkspaceProvisioningBridge`
- `sys_script:Docsera Workspace Provision Request Worker`
- `sys_scope_privilege` rows for:
  - `x_82900_docsera_workspace_provision_request` read/write
  - `x_82900_docsera_workspace` read/create
- `sys_module:/global/docsera-global-workspace-bridge/0.1.0/package.json`
- `sys_module:/global/docsera-global-workspace-bridge/0.1.0/bom.json`
- `sys_module:/global/docsera-global-workspace-bridge/0.1.0/src/server/script-includes/docsera-global-workspace-provisioning-bridge.js`
- `sys_module:/global/docsera-global-workspace-bridge/0.1.0/src/server/business-rules/process-workspace-provision-request.js`

Excluded on purpose:

- `sys_app:global`
  - importing the subclass record against the OOTB `global` base rows causes duplicate-key failures on current PDIs

Supported verification path after import:

- `npm run verify:sdk-global-bridge`
- `npm run verify:workspace-foundation`

Do not use `npm run install:sdk-global-bridge` as the PDI install path for this worker. The PDI rejects that path with the rollback-context error, so the companion update-set import above is the supported install path.
