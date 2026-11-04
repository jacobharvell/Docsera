# RR-055 — dev466345 Identity and Installation Inventory

Date: 2026-11-02  
Status: **Read-only instance investigation complete. No application, metadata, data, property, or installation state was changed.**

## 1. Verified target identity and SDK compatibility

- A dedicated encrypted SDK 4.8.1 credential alias, `docsera-dev466345`, was added through `now-sdk auth --add`; the SDK lists it with the exact host `https://dev466345.service-now.com`.
- All live evidence in this report used that explicit alias and the pinned 4.8.1 CLI. No `exec`, install, transform, browser test, or server-side script was used.
- `glide.appcreator.company.code` is `82900`. Therefore this PDI owns the `x_82900_` application prefix; it is not an imported third-party prefix on this target.
- `glide.war` reports `glide-brazil-08-25-2026__patch1-hotfix1-10-10-2026_10-12-2026_0745.zip` (Brazil Patch 1 Hotfix 1). The readable application-development prerequisites are the owned company key and authenticated Table API access. No separate readable property established additional allow-list policy.
- SDK 4.8.1 documents the supported creation path: select a free `x_82900_*` scope with an explicit alias, then run `now-sdk init` for a new application. A read-only collision query found `x_82900_docsera2` free; this is a viable provisional new scope name (and remains within the SDK's 18-character scope limit).

## 2. Existing installed application inventory

The installed scoped application is active `Docsera` 0.1.0:

- `sys_app` and `sys_scope`: `6997f092c3fd8310c569bf0d0501314d`, scope `x_82900_docsera`.
- Thirteen scoped tables, three roles, 49 ACLs, 65 server modules, 27 outbound scoped privileges, two scheduled scripts, one Scripted REST definition, and 34 REST operations are present.
- The REST base URI is `/api/x_82900_docsera/docsera_runtime`.
- One Direct UI Page, `docsera_sdk_runtime`, has endpoint `x_82900_docsera_docsera_sdk_runtime.do`.
- Eight scoped `sys_ux_lib_asset` records are present, including the `main` runtime asset and its maps/editor assets.

The 13 tables are the workspace, page, change-set/snapshot/entry, mutation, removal, lease, icon, membership-command, and provisioning-request tables under the `x_82900_docsera_` prefix. These names, the REST namespace, roles, endpoint, assets, server-module identity records, and generated keys are all collision surfaces for source conversion.

### Global companion

The Global companion is installed and tied to the old scope:

- Two active Script Includes: `DocseraGlobalWorkspaceProvisioningBridge` and `DocseraGlobalWorkspaceMembershipBridge`.
- Two active workers over the old provisioning and membership-command tables.
- Nine allowed Global-to-old-scope privileges.
- One Global Direct UI Page: `docsera` (the friendly host), with its read ACL.
- Two Global UX assets, one glider source artifact, three artifact mappings, and six Global server-module records.
- Completed update set: `Docsera Global Companion 0.1.0`.

These records are material collisions: the Global host page `docsera`, its assets, worker table bindings, bridge contracts, privileges, and the old generated sys_ids cannot be reused for a second identity.

## 3. Current test-data inventory

All counts below are live, bounded Table API counts, not historical estimates.

| Record type | Count |
| --- | ---: |
| Workspaces | 2 |
| Pages | 2 |
| Change sets, snapshot sets, page snapshots, change entries | 0 each |
| Mutation claims, removal batches, removal members, edit leases | 0 each |
| Icon assets, membership mutation commands, provisioning requests | 0 each |
| Related native groups | 2 |
| Related native group memberships | 2 |

Potentially valuable retained test data is concentrated in active `Smoke-01` (`52ed42f5c3909310ac26fe3d05013193`): it has the two pages `Page-01-1` (`page-01`) and `Page-02` (`page-02`), its Admins and Editors native groups, and one membership in each. `Smoke-02` is inactive with no associated groups and no pages. No data was changed.

## 4. Coexistence and collision findings

The old application can remain installed while a differently scoped application is created and initially tested. The target owns the prefix and only `x_82900_docsera` currently exists beneath it; `x_82900_docsera2` is free.

Coexistence is safe only if the new scope receives its own scope ID and regenerated metadata IDs, tables, roles, REST namespace, Direct UI Page endpoint, UX asset namespace, and server-module identities. It must not share the Global `docsera` page or companion assets/workers/privileges with the old application. For an initial scoped-only proof, leave the old Global companion intact and defer creation of a renamed new companion until its target scope is established.

Do not retain the old `keys.ts` identities: they point at live installed records and would update/collide with the old app. The old data tables and their `Smoke-*` data cannot be transparently shared by a new scope; preservation/migration is a separate approved decision.

## 5. Recommended next source-conversion step

After approval, create a dedicated conversion branch and initialize a new SDK 4.8.1 skeleton using `docsera-dev466345` and a confirmed-free PDI-owned scope (provisionally `x_82900_docsera2`). Capture the SDK-issued `scopeId`, then perform the one coordinated source mapping:

1. Replace old scope literals and runtime URLs across the scoped application.
2. Regenerate and review the scoped keys registry rather than inventing IDs.
3. Build and verify the new scoped package locally; do not install yet.
4. Map the Global companion separately to the new scope and select a distinct temporary host-page/asset namespace for coexistence.

Only then seek explicit approval for the first scoped install. A subsequent harmless source change followed by a second explicit-alias install is the proof of repeated install ownership.

## 6. Operations requiring explicit approval

- Creating the new scoped application/skeleton and committing the source-identity conversion.
- Any SDK install, reinstall, or deployment to `dev466345`.
- Creating/replacing a Global companion, Global host page, assets, workers, privileges, or ACLs.
- Any old-app or old-companion removal, generated-key reset, data migration, or test-data cleanup.
- Browser/PDI acceptance testing.

## Validation notes

Read-only checks used the pinned SDK 4.8.1 (`auth --list` and bounded `query` calls) with explicit `-a docsera-dev466345`. Queries covered `sys_properties`, `sys_scope`, `sys_app`, scoped metadata tables, REST definitions/operations, UI pages, UX assets, scheduled scripts, privileges, Global companion metadata, update sets, and each Docsera data table. No full frontend validation applies to this documentation-only result.
