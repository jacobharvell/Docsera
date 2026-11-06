# Global companion artifact generation

This source package can generate a temporary Global companion update set for
release engineering. It is not a consumer installation artifact. The only
supported consumer import pair is provided in
[`releases/0.1.0/`](../../../releases/0.1.0/).

Generate a temporary artifact after an SDK build:

```powershell
npm run build
npm run generate:update-set
npm run verify:generated-update-set
```

The generated XML and manifest are written to ignored
`app/docsera-global-bridge/output/update-set/`. Run
`npm run verify:friendly-url-host` after generation when checking the host
artifact. Do not import generated output without a separately authorized
release qualification.

## Friendly URL ownership

The generated companion owns the direct Global page `sys_ui_page:4bb3dc32dcfc4441a57bfce97db77529`,
its `ui_page/read` ACL `sys_security_acl:b9d7e176310f447ea61072dc4a9fca11`, and the
small SDK bootstrap asset and source map. The host imports the existing scoped runtime;
it does not duplicate React, CSS, or server APIs.

The page ACL uses the supported GlideSystem authentication API and ACL answer contract:
`answer = gs.isLoggedIn();`. It admits all
authenticated ServiceNow users, including viewer-only users, and excludes anonymous
visitors. Scoped REST authorization remains authoritative for edit, publish, workspace
administration, and every other protected action.

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
