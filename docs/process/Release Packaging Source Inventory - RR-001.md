# RR-001 — Release Packaging Source Inventory

Date: 2026-10-30
Candidate base: `origin/main` at `2b5faa0f0830df0f46b0fdb43d2d44e4e1859955`
Status: investigation only; this is not an installer or portability claim.

## Result

The smallest plausible administrator-facing release is an ordered pair:

1. a versioned exported scoped Docsera application built from `app/docsera-ui`; then
2. `app/docsera-global-bridge/update-set/sys_remote_update_set_docsera_global_companion_0_1_0.xml`, imported as a Global retrieved update set.

The Global artifact is not optional today: it provides the provisioning/membership bridge and owns authenticated `docsera.do`. The scoped menu opens that URL; its direct UI page is the scoped fallback/runtime asset owner. No exported scoped-app artifact, clean-install record, or consumer install guide is committed. Thus this is a packaging hypothesis, not a selected portable mechanism.

This matches the Release Readiness Plan: G0 requires a named/versioned candidate, and G4 requires a reproducible installer with no manual application-object creation. Local generation alone satisfies neither gate.

## Evidence and boundaries

| Evidence | Establishes | Does not establish |
| --- | --- | --- |
| `app/docsera-ui/now.config.json` | Scope `x_82900_docsera`, scope ID `6997f092c3fd8310c569bf0d0501314d`, app name `Docsera`. | Cross-instance import, entitlement, or dependency behavior. |
| Scoped Fluent source, `src/fluent/generated/keys.ts`, and fresh local `dist/app/update` build output | Declared metadata families, generated records, and retained identities. | Cross-instance import or installed-record behavior. |
| Global XML and JSON manifest | A committed update set with 27 update records, including the Global host. | Import/preview/commit on a clean instance. |
| `CTO-3B M2M SDK Packaging Feasibility Proof.md` | SDK 4.8.1 offline generation of an M2M record/composite index in its isolated fixture. | Instance acceptance, entitlement, enforcement, or upgrade behavior. |

## Scoped application inventory

### Required source metadata

The Fluent source declares 13 active custom tables:

- `x_82900_docsera_workspace`, `x_82900_docsera_page`
- `x_82900_docsera_workspace_provision_request`, `x_82900_docsera_workspace_member_mutation_command`
- `x_82900_docsera_workspace_edit_lease`, `x_82900_docsera_workspace_mutation_claim`
- `x_82900_docsera_workspace_change_set`, `x_82900_docsera_workspace_change_entry`
- `x_82900_docsera_workspace_snapshot_set`, `x_82900_docsera_workspace_page_snapshot`
- `x_82900_docsera_workspace_removal_batch`, `x_82900_docsera_workspace_removal_member`
- `x_82900_docsera_workspace_icon_asset`.

They define dictionary fields, choice sets/choices, references, auditing, and table/web-service access. Source declares unique constraints for workspace slug; snapshot, removal-member, mutation, page-snapshot, change-entry, change-set, and removal-batch keys; icon asset key; and edit-lease workspace key. It also defines an edit-lease last-seen nonunique index. Install validation must check actual installed index identity, column set, and enforcement.

Security source declares `x_82900_docsera.editor`, `x_82900_docsera.workspace_admin` (contains editor), and `x_82900_docsera.admin` (scoped admin; contains both). It declares field-level server-owned page denies and foundation-table generic CRUD denies.

The `docsera_runtime` REST definition has 34 active operations: ping; workspace create/list/status/settings/delete/member management; pending-change/recovery/publish/discard; six edit-lease operations; media/icon operations; and page create/list/save/publish/move/settings/delete. Their handlers and support modules must travel as deployed ServiceNow modules.

Other required metadata: direct scoped UI page `x_82900_docsera_docsera_sdk_runtime.do`; application/menu and My Workspaces module (opens `docsera.do`); and scheduled icon-asset and edit-lease cleanup jobs. The runtime is an SDK `main.jsdbx` asset with CSS inlined into JavaScript, so the UI page and generated asset must be packaged together.

### Fresh generated metadata comparison

`app/docsera-ui/src/fluent/generated/keys.ts` is an identity registry, not an install artifact. It contains: 14 `sys_db_object` identities, 167 each `sys_dictionary`/`sys_documentation`, 65 `sys_choice`, 20 `sys_choice_set`, 10 `sys_index`, 49 `sys_security_acl`, 35 `sys_ws_operation`, one REST definition, two scheduled scripts, one UI page, three roles, three role-containment records, three scoped privileges, one `sys_m2m`, UI assets/source links, and 66 `sys_module` identities.

The 2026-10-30 scoped SDK build completed successfully. Its `dist/app/update` output contains 13 `sys_db_object` records matching all 13 active tables, 45 `sys_security_acl` records, 34 `sys_ws_operation` records, one REST definition, two scheduled scripts, one UI page, three roles, three role-containment records, 65 server modules, and eight UI asset records. Every generated table and REST operation record inspected is `INSERT_OR_UPDATE`; the generated REST names, methods, and paths match the active route declarations.

The registry includes every active table above and the server module graph, but also retained identities. Confirmed examples are the historical `x_82900_docsera_rm_member` M2M proof table and its four ACLs, an initial-admin-users module, and one historical REST-operation identity. That explains the key differences for tables (14 registry versus 13 generated), ACLs (49 versus 45), modules (66 versus 65), and REST operations (35 versus 34). The corrected active REST count is **34**, not 35. No genuine omission in those active generated families was found.

The SDK encodes some table-derived metadata differently from the identity registry: the fresh output includes table/dictionary records but no standalone `sys_index`, `sys_choice`, `sys_choice_set`, or `sys_documentation` update XML files. The source still declares the 11 unique/secondary constraints and choice/schema behavior. This is not evidence that those records are absent on installation, but it means a clean-instance verification must inspect installed dictionary, choice, and index records—especially index identity, columns, uniqueness, and enforcement—rather than infer them from filename counts alone.

## Global companion inventory, dependency, and ownership

The committed manifest lists 27 update records:

| Table | Count | Purpose |
| --- | ---: | --- |
| `sys_module` | 6 | Global package/runtime source modules |
| `sys_scope_privilege` | 9 | scoped-to-Global bridge permissions |
| `sys_script` / `sys_script_include` | 2 / 2 | provisioning and membership workers/bridges |
| `sys_security_acl` / `sys_security_acl_role` | 1 / 1 | host access and retired role-binding update |
| `sys_ui_page` / `sys_ux_lib_asset` | 1 / 2 | Global host plus bootstrap asset/source map |
| `sys_restricted_caller_access` | 1 | scoped execution of membership bridge |
| `sys_package` / `sys_scope` | 1 / 1 | Global base records |

The `sys_security_acl_role` record is an author-elective deletion retiring the temporary editor-only host restriction; preview must treat it as a deletion, not an active requirement.

The generator reads the scoped app configuration, rewrites scoped privilege target-scope values to its scope ID, and synthesizes restricted caller access. The scoped app must therefore install first. The Global host owns `sys_ui_page:de3b81474ba94c0a9296d12f9c6bd9cc`, read ACL `sys_security_acl:879785c448564188a54416cb90d18c14`, and two bootstrap assets. The preflight must fail closed unless `docsera` is absent or a known Docsera-owned record. Clean testing must cover both creation and a foreign `docsera.do` collision; never overwrite by name alone.

## Proven, unproven, and risks

Pinned dependencies were installed with `npm ci` in both SDK packages. The scoped build completed and its module-key verification passed. The Global build completed, regenerated the update set with 27 records, and passed the friendly-URL artifact verification. The only Global generated-file changes were volatile timestamps, archive UUID/checksum/attachment content, and line endings; they were restored rather than committed. No substantive Global packaging difference was found.

No PDI transform, deployment, import, preview, or instance inspection was performed. The fresh local generated output proves only SDK compilation and local artifact composition; it does not prove instance acceptance, entitlement, ACL behavior, index enforcement, or upgrade behavior.

The CTO-3B fixture is offline-only: it does not prove instance acceptance, licensing/entitlement classification, reference attribution, ACL behavior, index enforcement under concurrency, or upgrade/data migration. These remain cross-instance release risks for the complete product.

## Required next verification

1. Select and export the actual scoped-app artifact for the target ServiceNow family. Prove it transports modules, UI assets, schema/dictionaries/choices/indexes, ACLs, 34 REST operations, roles, scheduled jobs, and navigation.
2. On a genuinely clean supported PDI, use only published artifacts: scoped artifact first, then Global update set. Record every import/preview/commit warning, skipped record, and required privilege.
3. Verify all schema/index constraints, representative duplicate rejection, ACL/role behavior, scoped-to-Global caller access, both hosts/deep links/assets (including lazy editor chunk), REST routes, scheduled jobs, bootstrap, core workflows, and denial paths.
4. Test foreign friendly-URL collision plus update/uninstall behavior. Decide whether an ordered pair is acceptable or a single package is feasible.

Open distribution questions: target-family compatibility, cross-organization eligibility/entitlement, administrator privileges, update/uninstall semantics, and whether the two-step flow is consumer-grade. Until resolved, GitHub Releases may be the delivery channel but must not promise a single-step install; assets need versioning, SHA-256 checksums, and exact clean-instance instructions.

## Commands run

- `git fetch --prune origin` and the task-worktree guard from the stated base.
- `npm ci` in `app/docsera-ui` and `app/docsera-global-bridge` — completed; npm reported the packages' existing audit advisories.
- `npm run build` and `npm run verify:sdk-module-keys` in `app/docsera-ui` — passed; fresh scoped metadata inspected in `dist/app/update`.
- `npm run build`, `npm run generate:update-set`, and `npm run verify:friendly-url-host` in `app/docsera-global-bridge` — passed; update-set generation reported 27 records.

Intentionally skipped: frontend/editor/repository suites, live transform/deployment, PDI/browser checks, update-set import, and destructive metadata operations.
