# RR-057 — Clean SDK Bootstrap

Date: 2026-11-03  
Status: **Pre-install review complete. No SDK installation, reinstall, application creation, metadata mutation, Global-companion action, or browser test was performed. The target is not clean, so it is not ready for a first clean SDK installation.**

## 1. Continuation and authentication resolution

The continuation worktree guard passed before task inspection:

| Item | Verified value |
| --- | --- |
| Worktree | `C:\\Users\\jacob\\.codex\\worktrees\\rr-057-clean-sdk-bootstrap\\Docsera` |
| Branch | `feature/rr-057-clean-sdk-bootstrap` |
| Current HEAD | `864e2a13fbb4f5af31ac5f1c2633556cbd45da11` |
| Original base | `e847be1eb796c525425de3c9c2e3bcac7689e7ac` |
| Windows execution identity | `DESKTOP-JIRC0Q8\\admin` |
| Credential-directory override | none (`SN_SDK_CREDENTIALS_DIR` was unset) |
| Default credential-file location | `C:\\Users\\jacob\\.now-sdk\\credentials.enc` (present) |

The repository pins `@servicenow/sdk` `4.8.1` in
`app/docsera-ui/package.json`. The project-local executable
`app/docsera-ui\\node_modules\\.bin\\now-sdk.cmd` reports `4.8.1`; that is
the only SDK executable used for authentication, build, and PDI queries in
this continuation. By contrast, bare `npx @servicenow/sdk --version` resolved
workstation SDK `4.14.0`, so it is not a valid proxy for this pinned project
credential inventory.

The current pinned-4.8.1 inventory contains the exact required alias:

| Alias | Host | Type | User | Default |
| --- | --- | --- | --- | --- |
| `docsera-dev466345` | `https://dev466345.service-now.com` | basic | `admin` | yes |

No alias was added, removed, selected, or changed; no password, token, or
credential value was displayed. RR-047 already established that SDK-version
specific credential-store compatibility can make an alias visible to a newer
workstation SDK but absent to 4.8.1. The current local 4.8.1 result establishes
that the RR-057 blocker is resolved without a credential write. A PDI reset
cannot itself remove this per-user encrypted local credential. The exact
historical moment of the earlier missing inventory cannot be reconstructed
from the credential store, but the observed cause is local SDK/store-version
selection rather than a target-instance identity change.

## 2. Post-reset target inventory (read-only, explicit alias)

Every live request below used pinned SDK 4.8.1 and explicit
`--auth docsera-dev466345`; no default or substitute PDI was used.

- `glide.appcreator.company.code` is `82900`. The PDI therefore owns the
  required `x_82900_` prefix. Source identity was not changed.
- The prior application is **present**, not absent: `Docsera` `0.1.0`, active,
  scope `x_82900_docsera`, and scope/application sys_id
  `6997f092c3fd8310c569bf0d0501314d`.
- All thirteen scoped tables are present: `page`, `workspace`,
  `workspace_change_entry`, `workspace_change_set`, `workspace_edit_lease`,
  `workspace_icon_asset`, `workspace_member_mutation_command`,
  `workspace_mutation_claim`, `workspace_page_snapshot`,
  `workspace_provision_request`, `workspace_removal_batch`,
  `workspace_removal_member`, and `workspace_snapshot_set` (all with the
  `x_82900_docsera_` prefix as applicable).
- Material scoped metadata remains present: 65 server modules, 49 ACLs, eight
  UX assets, one Scripted REST definition, and two active scoped scheduled
  scripts.
- The Global host UI Page `docsera` and the scoped
  `docsera_sdk_runtime` UI Page are absent from the queried `sys_ui_page`
  inventory. This does not make the target clean: both active Global bridge
  Script Includes remain (`DocseraGlobalWorkspaceProvisioningBridge` and
  `DocseraGlobalWorkspaceMembershipBridge`), and the completed Global update
  set `Docsera Global Companion 0.1.0` remains. These are material collision
  residue. The queried old-scope privilege rows and name-filtered Global UX
  asset rows were absent, but their absence does not authorize companion work.

The actual installed state conflicts with the premise of a clean reset target.
It is compatible with the existing-scope incremental-install lineage
documented by RR-055/RR-056, but it is not evidence for the first clean
installation contemplated by this task.

## 3. Local build and generated-key integrity

The repository-pinned `npm run build` completed successfully in the task
worktree. It completed SDK type checking, built all ten runtime assets, then
passed both post-build checks:

```text
SDK module identities verified.
[pass] SDK bundle serialization checks (nine assertions)
```

The only build diagnostics were the known third-party Rollup warnings for
Tiptap/Lucide module directives and sourcemaps plus CodeMirror pure
annotations. They did not fail the build.

`npm run verify:sdk-module-keys:checkpoint` then passed with
`Committed SDK module identities verified.` The build produced no tracked
generated-key diff and no uncommitted source drift. No ID was rewritten,
invented, accepted, or normalized.

## 4. Package, DELETE, and schema preflight

The completed package contains:

- thirteen Fluent `Table()` declarations;
- thirteen `dist/app/dictionary/*.xml` collection bootstrap definitions;
- thirteen `dist/app/update/sys_db_object_*.xml` records; and
- **25** explicit `action="DELETE"` declarations, all and only under
  `dist/app/author_elective_update/`.

The prior report's count of 24 is stale; the completed build has 25. The
declarations comprise one each for `db_image`, `sys_db_object`, `sys_index`,
`sys_m2m`, `sys_module`, `sys_ws_operation`, and
`ua_table_licensing_config`; two `sys_scope_privilege`; four each of
`sys_dictionary`, `sys_documentation`, `sys_security_acl`, and
`sys_ux_lib_asset`. The four dictionary/documentation deletions all refer to
the retired `x_82900_docsera_rm_member` table.

Read-only explicit-alias queries established that all 17 ID-addressed delete
targets are absent from their respective target tables, and that the retired
table plus all of its dictionary and documentation rows are absent. Thus none
of the 25 emitted declarations targets a currently installed Docsera record in
this PDI.

The thirteen bootstrap collection names exactly match the thirteen installed
tables listed above. No bootstrap dictionary XML contains `db_object_id` or
`dbObjectId`; no DELETE XML exists outside `author_elective_update`. This
matches the SDK 4.8.1 name-addressed bootstrap model established in RR-056 and
does not justify rewriting generated table keys to platform table sys_ids.

## 5. Readiness decision

**No-go for the first normal clean SDK installation.** Authentication, company
key, local build, generated-key integrity, package deletion review, and schema
preflight are complete. However, the target is demonstrably not clean: it
already contains the prior Docsera scope, application, thirteen tables, scoped
metadata, and material Global companion residue.

Do not install from this branch as a first clean installation. An independent
review must decide whether the PDI reset was incomplete, whether another
explicitly authorized reset/reconciliation is required, or whether work should
instead proceed under the separate existing-scope incremental-install decision
path. No source-identity conversion, reinstall, Global action, or installation
is authorized by this report.

## 6. Validation record

- `git fetch --prune origin` and continuation task-worktree guard — passed.
- Project-local SDK `4.8.1` credential inventory and explicit-alias hostname
  verification — passed.
- Explicit-alias read-only company-key, application, table, scoped-metadata,
  UI-page, Global bridge, Global update-set, and DELETE-target queries —
  completed as reported.
- `npm --prefix app/docsera-ui run build` — passed.
- `npm --prefix app/docsera-ui run verify:sdk-module-keys:checkpoint` —
  passed.
- Package DELETE and bootstrap-schema inspection — passed.
- Intentionally skipped: SDK install/reinstall, application creation,
  source-identity conversion, Global companion activity, runtime verification,
  browser testing, and full managed frontend validation.
