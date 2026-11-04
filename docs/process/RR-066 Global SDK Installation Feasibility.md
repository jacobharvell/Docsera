# RR-066 — Global SDK Installation Feasibility

Date: 2026-11-03
Status: **Not feasible with SDK 4.8.1. Do not run `now-sdk install` for the Global companion.**

## Decision

The Global companion cannot use the SDK-native developer installation channel with ServiceNow SDK 4.8.1 as it is currently generated. This is a package-composition limitation, not a build failure or an identity collision that a preflight query can solve.

`app/docsera-global-bridge/now.config.json` deliberately declares `scope: global` and `scopeId: global`. An SDK 4.8.1 build consequently emits `dist/app/scope/sys_app_global.xml`. The converted RR-060 build contains the same file: an `INSERT_OR_UPDATE` for `sys_app` with `sys_id` and `sys_scope` both equal to `global`, plus the companion name, package path, version, resolver version, and other Global-application fields. The receiving instance already owns that shared Global application identity.

`now-sdk install` is documented by the SDK as “Install or update application on instance”; it has no allow-list, exclude-scope-record, or dry-run option. A normal install would therefore submit this shared-record update with the companion package. `--reinstall` is expressly worse: its help warns that instance metadata absent from the package will be lost. Neither mode is acceptable for a developer installation that must preserve existing Global system metadata.

Do not remove the generated `scope/` XML after a build or hand-edit an SDK package. That is an unverified alteration of the installer contract, not a repeatable SDK-native method.

## Evidence and package coverage

The investigation used the repository SDK dependency pinned to 4.8.1 and the RR-060 isolated converted Global output. `now-sdk build` succeeded (only the existing informational missing `src/client/tsconfig.json` warning). Its installable output is:

| Generated metadata | Count | Result |
| --- | ---: | --- |
| `sys_module` | 6 | Present: package manifest plus the four bridge/worker runtime modules. |
| `sys_scope_privilege` | 9 | Present and target `x_2300756_docsera` / `e6e43323accd4c7fb9271525a343850e` in the converted build. |
| `sys_script` | 2 | Present: both worker rules. |
| `sys_script_include` | 2 | Present: provisioning and membership bridges. |
| `sys_security_acl` | 1 | Present: `docsera` host-page read ACL. |
| `sys_ui_page` | 1 | Present: Global `docsera.do` host page. |
| `sys_ux_lib_asset` | 2 | Present: host asset and source map. |
| `sys_app` scope record | 1 | **Present and unsafe:** `scope/sys_app_global.xml` updates shared Global metadata. |
| `sys_restricted_caller_access` | 0 | Not represented by SDK Fluent output. |

Thus the SDK build has 23 companion update records with the converted RR-060 identities, including the two Script Includes, two workers, host UI Page, ACL, UX assets, and nine cross-scope privileges. Their stable identities are retained by `src/fluent/generated/keys.ts`. The build also adds the unsafe Global `sys_app` record, so it is not safe to install those 23 records as a unit. The canonical registry and frozen update-set were not changed.

The SDK `CrossScopePrivilege` API supports the nine `sys_scope_privilege` records; its documented fields are operation, status, target name, target scope, and target type. SDK 4.8.1 exposes no Fluent API or generated metadata for `sys_restricted_caller_access`. Repository searches of the installed SDK API/docs found `CrossScopePrivilege`, but no Restricted Caller Access entity. The 24th record in the release update set is deliberately synthetic rather than SDK-generated for that reason.

## Restricted Caller Access contract

The membership bridge has `callerAccess: "restriction"`. It requires an RCA relationship from the installed Docsera scoped application to the Global membership Script Include: source scope `e6e43323accd4c7fb9271525a343850e`, source type `sys_scope`, target type `sys_script_include`, operation `execute`, target equal to the installed membership bridge, and status `allowed`.

SDK 4.8.1 cannot declare or install that relationship. The smallest safe developer setup is an explicit administrator authorization step after the companion exists: have an admin review the requested record in **System Applications > Application Restricted Caller Access** and set the exact Docsera-to-membership-bridge `execute` request to Allowed (or create the exact relationship only through an approved, auditable platform procedure). Do not broadly allow Global caller access and do not pre-create an RCA against a guessed Script Include sys_id. ServiceNow's RCA guidance requires admin/application-admin review for requested privileges.

This step is independent of the nine Global-to-scoped `sys_scope_privilege` records: both directions must permit their respective operations.

## Required receiving-instance preflight (if a future supported installer is available)

No installation sequence is approved for SDK 4.8.1. Before a future supported Global installation mechanism is evaluated, an administrator must perform read-only checks for:

1. Exactly one active `sys_scope` with `sys_id=global`, scope `global`, and the platform-owned Global identity; do not permit a package that changes it.
2. The RR-064 scoped application exactly once: scope `x_2300756_docsera`, scope/sys_app ID `e6e43323accd4c7fb9271525a343850e`, active, expected version.
3. Absence of collisions for the converted Global target identities: the `docsera` UI Page/endpoint, two Script Includes, two worker rules, host ACL, two UX asset names, nine Global-source privileges, runtime modules, and RCA relationship. Existing matching records require an upgrade/migration review, not a create install.
4. An authenticated account with the necessary administrator permissions to install metadata and approve the narrow RCA. Authentication alone does not prove the privilege to update Global metadata safely.
5. A package inventory containing only intended companion records and no `sys_app:global`, `sys_scope:global`, deletes, canonical `x_82900_docsera` references, or non-Docsera Global records.

If a later SDK release provides a supported way to build/install Global metadata without serializing `sys_app_global`, rebuild with that exact version, freeze and review the registry, compare the complete inventory to this table, run the preflight above, and use one normal install (never `--reinstall`). Then perform the separate RCA approval and non-interactive installed-runtime verification. That is a future investigation; it is not authorization to deploy this candidate.

## Sources

- `docs/process/RR-060 Real SDK Conversion Validation.md` — converted identities and 23-record build inventory.
- `docs/process/RR-064 Incremental SDK Installation.md` — installed scoped application identity.
- `docs/process/RR-065 Converted Global Companion Preflight.md` — 24-record update-set inventory and preserved-artifact contract.
- ServiceNow SDK 4.8.1 local `explain` documentation: `now-config-reference`, `developing-apps-guide`, `cross-scope-privilege-guide`, and `crossscopeprivilege-api`; plus `now-sdk install --help`.
- ServiceNow official Restricted Caller Access guidance: https://docs.servicenow.com/bundle/zurich-platform-security/page/administer/cross-application-apis/task/configure-restricted-caller-access.html

## Validation and scope

- Ran the task-worktree guard from base `bd46c4298bfc33d4d1a4b9465ac140272bfaf7a4`.
- Ran `npm ci` and `npm run build` only in `app/docsera-global-bridge`; the SDK 4.8.1 build passed.
- Inspected the complete local and RR-060 converted `dist/app` inventories and `scope/sys_app_global.xml`.
- Read SDK CLI/API documentation and inspected the installed 4.8.1 API/docs for RCA support.
- No `now-sdk install`, `--reinstall`, update-set import, PDI mutation, browser test, scoped reinstall, or release-artifact regeneration was run.
