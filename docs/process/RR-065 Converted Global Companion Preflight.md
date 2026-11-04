# RR-065 — Converted Global Companion Preflight

Date: 2026-11-03
Status: **Generated locally for independent import review. Do not import, preview, commit, or install.**

## Target and preserved source

- Target / alias: `https://dev468303.service-now.com/` / `docsera-dev468303`.
- Installed scoped application: `x_2300756_docsera` / `e6e43323accd4c7fb9271525a343850e`, active, version `0.1.0`.
- Converted source: `C:\Dev\Docsera-rr-060-converted-output-20261103-final\app\docsera-global-bridge`.
- Artifact: `C:\Dev\Docsera-rr-060-converted-output-20261103-final\app\docsera-global-bridge\update-set\sys_remote_update_set_docsera_global_companion_0_1_0.xml`.
- Artifact SHA-256: `77560BAE7438E37D03C50A22603DAFCD155273E354100B1B03646ADB65D9E3BA`.
- Remote update-set sys_id: `beabd28f94519b6d0e3fb3fbe0c84bdc`.

The converted Global registry SHA-256 remains the RR-060 accepted fingerprint:
`85681AF257D9F26621D442DD3068E041667A8367B8CD51B1CA5D4B3FF4826B86`.
The canonical repository registry and frozen update-set artifact were read only and remain separate.

## Bounded converted-output correction

The converted generator, package-content test, ownership preflight contract, and host-artifact verifier still contained canonical Global IDs. In particular, the synthetic restricted-caller-access record would have pointed at the canonical membership bridge rather than the converted bridge.

Only the isolated converted output was corrected. A non-runtime helper now resolves the converted Global bridge, worker, ACL, and host identities from that output's generated registry. The target-specific generator fails if any built payload contains `action="DELETE"`; its verifier likewise rejects DELETE metadata. No application identity was regenerated and the converted registry fingerprint above did not change.

## Target collision and identity preflight

Read-only `now-sdk query` calls used the explicit `docsera-dev468303` alias through the RR-064 project-local SDK 4.8.1 executable.

- Exact `sys_scope` and `sys_app` queries each returned the one expected installed identity above.
- No Global `sys_ui_page` named `docsera` exists.
- No Global `DocseraGlobalWorkspaceMembershipBridge` or `DocseraGlobalWorkspaceProvisioningBridge` Script Include exists.
- No Global provisioning/member-mutation worker, `docsera` UI Page ACL, scoped-target Global privilege, target restricted-caller-access record, or `/global/docsera-global-workspace-bridge/` runtime module exists.

Therefore import would create the target-specific companion identities; it cannot be treated as an in-place upgrade of a pre-existing Global companion.

## Generated record inventory

The XML has one `sys_remote_update_set` and 24 `sys_update_xml` customer-update records, all `INSERT_OR_UPDATE`, with 24 unique target IDs.

| Table | Count |
| --- | ---: |
| `sys_module` | 6 |
| `sys_restricted_caller_access` | 1 |
| `sys_scope_privilege` | 9 |
| `sys_script` | 2 |
| `sys_script_include` | 2 |
| `sys_security_acl` | 1 |
| `sys_ui_page` | 1 |
| `sys_ux_lib_asset` | 2 |

Key target identities are:

- host page `4bb3dc32dcfc4441a57bfce97db77529`; host ACL `b9d7e176310f447ea61072dc4a9fca11`;
- membership/provisioning bridges `bb42e634e203492591a8d18e6953eae1` / `010930ea12354689b678fc9b37ba0f88`;
- member/provision workers `f91e7303f060417e97e9b6ea7d34efbe` / `c7debb094bef4e5093645239504c84b6`;
- restricted caller access `a0af46dbdca9f925ad8704425772c2d7`, whose source is the installed scoped ID and target is the converted membership bridge;
- host assets `7c2ec161a0214744aa75f7d22e6edf59` and `377d32f160d24dafa9959f5d346c042d`.

All nine privilege payloads target scope ID `e6e43323accd4c7fb9271525a343850e`; their target names, Global worker collections, roles, REST paths, and host bootstrap import use `x_2300756_docsera`. The artifact contains no canonical `x_82900_docsera` scope or canonical scope ID.

The generator excludes the `scope/` build directory and package-content checks confirm no `sys_package:global`, `sys_scope:global`, or `sys_app:global` record is transported. Artifact inspection also found no DELETE declaration or unrelated record table.

## Validation and remaining prerequisite

Passed in the isolated converted output:

- `npm run build` (SDK 4.8.1; existing informational missing `src/client/tsconfig.json` warning only);
- `npm run generate:update-set`;
- `npm run test:friendly-url-host` (7 tests);
- `npm run verify:friendly-url-host`;
- independent manifest/XML inventory, target-scope, canonical-reference, shared-Global-identity, DELETE, uniqueness, and SHA-256 checks.

No Global SDK installation, update-set import, retrieved-update-set preview, commit, browser testing, or PDI mutation was performed. The remaining prerequisite is independent review of this exact SHA-256 artifact followed by an explicitly authorized import/preview workflow. Receiving-instance Global package, scope, and app metadata must remain preserved during that later workflow.
