# Docsera Global Companion Update Set

This folder contains the generated Global companion update set for Docsera's workspace
provisioning bridge and the authenticated `docsera.do` production host.

Generate it after an SDK build:

```powershell
npm run build
npm run generate:update-set
npm run verify:friendly-url-host
```

The generated `sys_remote_update_set_docsera_global_companion_0_1_0.xml` is imported
through **System Update Sets > Retrieved Update Sets > Import Update Set from XML**.

## Install and upgrade

1. Install or upgrade the scoped Docsera application first. It owns the SDK runtime,
   REST APIs, and the supported fallback page
   `x_82900_docsera_docsera_sdk_runtime.do`.
2. Run `npm run preflight:friendly-url-host -- --auth-alias <configured-sdk-alias>`.
   This read-only query fails closed unless the Global `docsera` page is absent or is the
   exact known Docsera-owned legacy/prod host record.
3. Import and preview the Global companion, then stop for independent review before any
   commit. It upgrades the stable Docsera-owned host and bridge records in place; clean
   installs create them. No manual record edits are required.
4. The scoped application menu opens `docsera.do`; deep links remain
   `docsera.do#/<route>`. The legacy scoped endpoint remains available during transition.

## Friendly URL ownership

The companion owns the direct Global page `sys_ui_page:de3b81474ba94c0a9296d12f9c6bd9cc`,
its `ui_page/read` ACL `sys_security_acl:879785c448564188a54416cb90d18c14`, and the
small SDK bootstrap asset and source map. The host imports the existing scoped runtime;
it does not duplicate React, CSS, or server APIs.

The page ACL uses the supported GlideSystem authentication API and ACL answer contract:
`answer = gs.isLoggedIn();`. It admits all
authenticated ServiceNow users, including viewer-only users, and excludes anonymous
visitors. Scoped REST authorization remains authoritative for edit, publish, workspace
administration, and every other protected action. The temporary editor-only ACL-role
binding is retired on upgrade.

The companion continues to include the existing Global provisioning and membership bridge
records, including their Global `sys_module` runtime records and the required scoped-app
privileges. It intentionally excludes the shared Global identity records
`sys_package:global`, `sys_scope:global`, and `sys_app:global`: an installation must never
overwrite the receiving instance's Global package or scope configuration. The generator and
artifact regression test fail if any of those records are reintroduced.

The package runtime modules remain a qualification requirement. Before accepting a commit,
verify on the receiving instance that the expected Global `sys_module` paths were installed
and that the Global Script Includes and workers resolve and execute under the instance's
existing Global package configuration. This artifact does not claim that its former
development package JSON path or Global scope settings are portable prerequisites.

## Safe removal

Do not remove the currently installed proof before the production replacement is reviewed
and approved. After an approved production deployment, uninstall only verified
companion-owned records by their exact sys_ids: the host page, host ACL, bootstrap assets,
their source-artifact children, and the documented bridge records. Never delete by the
`docsera` name alone, never remove a non-Docsera Global page, and never remove the scoped
runtime or baseline Global records. Removing a retrieved update set does not uninstall its
installed records.
