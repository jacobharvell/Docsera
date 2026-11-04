# RR-045 — New Source PDI Bootstrap

Date: 2026-11-02

Status: **Reconciled source checkpoint; stopped before installation. Independent review is required before any instance change.**

## Candidate and worktree

| Item | Verified value |
| --- | --- |
| Worktree | `C:\\Users\\jacob\\.codex\\worktrees\\rr-043-edit-session-recovery-ui\\Docsera` |
| Branch | `feature/rr-043-edit-session-recovery-ui` |
| Reviewed candidate HEAD | `351f87ef97304d31cd9477dc2ef98d04f037a3c5` |
| Original base | `e847be1eb796c525425de3c9c2e3bcac7689e7ac` |
| App identity | Docsera / `x_82900_docsera` / `6997f092c3fd8310c569bf0d0501314d` / `0.1.0` |
| SDK required by the candidate | repository-pinned `@servicenow/sdk` `4.8.1` |

Before any source inspection, the continuation task-worktree guard passed. The worktree was clean at the reviewed candidate HEAD, its merge base matched the stated base, and it was one commit ahead of `origin/main` with no divergence from the reviewed patch branch.

## Source PDI preflight

The SDK credential inventory contained one credential only:

| Alias | Host | Type | User | Result |
| --- | --- | --- | --- | --- |
| `docsera-source` | `https://dev437892.service-now.com` | basic | `admin` | Authenticated read-only SDK queries succeeded |

No authentication alias was added, changed, selected, or removed. Every live query used `--auth docsera-source`; `dev466345` was never addressed.

The PDI reported `glide.war` as `glide-brazil-08-25-2026__patch1-09-21-2026_10-05-2026_1244.zip`: Brazil Patch 1. This differs from RR-038B's Brazil Patch 1 Hotfix 1 source baseline. The only queried product-name property was the platform-default `ServiceNow` browser-tab title.

Read-only clean-target checks found no conflicting Docsera ownership:

- `sys_scope`: no `x_82900_docsera` scope and no scope named like Docsera.
- `sys_app`: no application named like Docsera and no application associated with `x_82900_docsera`.
- `sys_ui_page`: no `docsera_sdk_runtime` or Docsera-named page.
- `sys_db_object`: no table named `x_82900_docsera_*`.

These checks establish that the new PDI can be treated as a clean prospective source target. They do not constitute an installed scoped-metadata inventory, because no installation was authorized after the source verification failure below.

## Build and installation stop condition

The app dependencies were restored from the committed `package-lock.json`. The repository npm script could not find its local SDK shim in this environment, so the pinned SDK executable was invoked directly from `node_modules/@servicenow/sdk/bin/index.js`; it identified itself as version `4.8.1`.

The SDK build completed successfully: type checking passed and it produced the current runtime assets. It emitted only pre-existing third-party Rollup diagnostics for Tiptap/Lucide module directives, sourcemaps, and CodeMirror pure annotations.

Immediately after that build, the mandatory `verify:sdk-module-keys:checkpoint` failed. The build had changed the tracked `app/docsera-ui/src/fluent/generated/keys.ts` by adding `deleted: false` to six `sys_ux_lib_asset` identities:

- `x_82900_docsera/mountEditorRuntimeSpike`
- `x_82900_docsera/MarkdownSourceSession.js.map`
- `x_82900_docsera/PageEditorHostRuntime.js.map`
- `x_82900_docsera/MarkdownSourceSession`
- `x_82900_docsera/mountEditorRuntimeSpike.js.map`
- `x_82900_docsera/PageEditorHostRuntime`

That generated drift means the freshly built artifact is not exactly the independently reviewed RR-043 source candidate. The generated-file change was restored without modification, and no source application code or generated identity was committed as part of RR-045.

## RR-045A generated-registry reconciliation

On 2026-11-02, the stated RR-043 continuation worktree was revalidated at `e0fb89a7837e92973d6bdb894ac870ccbe054415` (reviewed application commit `351f87ef97304d31cd9477dc2ef98d04f037a3c5`, base `e847be1eb796c525425de3c9c2e3bcac7689e7ac`). The task-worktree guard passed and the tree was clean.

The repository-pinned SDK `4.8.1` build was then run twice. Both builds regenerated the UX registry without any tracked diff. The working-tree registry blob hash remained `d6e994f6a3b58070100d1dd8e4dc0613652061df`, which is also the registry blob hash at the reviewed application commit. Therefore this controlled reproduction did **not** reproduce the previously reported six `deleted: false` additions.

The complete `keys.ts` comparison against the reviewed application commit was byte-identical: no table name, key, sys_id, deletion state, or other generated metadata changed. In particular, the six named `sys_ux_lib_asset` records retain their existing stable IDs and no `deleted` state was introduced. This result distinguishes a prior observed, uncommitted generated-registry normalization report from an actual committed asset-identity change; no replacement identity was fabricated and no registry edit was required.

After the second build, `verify:sdk-module-keys` and `verify:sdk-module-keys:checkpoint` both passed with a clean tracked registry. This is the verified source checkpoint for independent review; it is not authorization to install to a PDI.

Consequently, the required immediately-before-install target-identity check and the SDK install were not run. In particular, there was no `now-sdk install`, no `--reinstall`, no metadata removal, no Global companion action, no version change, no update-set export/publication, and no browser/PDI interaction. The post-install application/scope, material scoped-metadata, runtime, and asset verification steps remain unperformed.

## Disposition and unresolved qualification questions

The generated-registry checkpoint is now clean in the controlled RR-045A reproduction. Do not install to `dev437892` until independent review accepts this reconciliation and explicitly authorizes the separate installation workflow.

Once a corrected/re-reviewed candidate exists, repeat the clean-target identity check immediately before exactly one explicit-alias SDK install, then compare the installed inventory to RR-038C: 13 tables, 34 REST operations, 49 ACLs, 65 server modules, one Direct UI Page, eight UX assets, two scheduled jobs, the three roles and containment records, and the two scoped-to-Global privileges described there. The non-interactive runtime verifier must receive both `--instance-url https://dev437892.service-now.com` and `--auth-alias docsera-source`, with `--skip-browser`.

Successful SDK installation would still be installation evidence only, not functional qualification. The known physical-unique-enforcement gap, and any Brazil Patch 1 versus Patch 1 Hotfix 1 behavior difference, require separate assessment.

## Validation

- `npm run ensure:task-worktree -- --task-branch feature/rr-043-edit-session-recovery-ui --original-base e847be1eb796c525425de3c9c2e3bcac7689e7ac --expected-head 351f87ef97304d31cd9477dc2ef98d04f037a3c5 --mode continuation` — passed.
- `npx @servicenow/sdk auth --list` and explicit `--auth docsera-source` read-only queries — passed.
- Pinned SDK build — passed, with known third-party Rollup warnings.
- `npm run verify:sdk-module-keys:checkpoint` after build — failed as described; restored build-generated drift.
- RR-045A: task-worktree guard at `e0fb89a7837e92973d6bdb894ac870ccbe054415` — passed.
- RR-045A: two repository-pinned SDK `4.8.1` builds — both left `src/fluent/generated/keys.ts` byte-identical to the reviewed application commit and produced no tracked diff.
- RR-045A: `npm --prefix app/docsera-ui run verify:sdk-module-keys` and `npm --prefix app/docsera-ui run verify:sdk-module-keys:checkpoint` — passed after the second build.
- SDK installation, installed metadata comparison, runtime/asset verification, browser verification, Global companion activity, version change, and update-set activity — intentionally not run.

## RR-045B installation preflight — stopped before source-PDI access

Date: 2026-11-02

RR-045B resumed the stated continuation worktree at source commit
`c6b7822d46ee02dbabdc5e4879b942dddfd7392d` (reviewed application commit
`351f87ef97304d31cd9477dc2ef98d04f037a3c5`; accepted main/base
`e847be1eb796c525425de3c9c2e3bcac7689e7ac`). The continuation task-worktree
guard passed, the worktree was clean, and
`feature/rr-043-edit-session-recovery-ui` was synchronized with its upstream.

The repository-pinned SDK executable was confirmed as `4.8.1`. Its
read-only credential inventory unexpectedly listed only the default
`docsera-pdi` alias targeting `https://dev466253.service-now.com/`.
`docsera-source`, which RR-045B requires to target only
`https://dev437892.service-now.com/`, was absent. Consequently it was not
possible to authenticate that explicit alias or run even a read-only query
against the authorized source PDI without creating or changing local
credential state, which is outside this task's authorization.

No implicit/default alias was used for ServiceNow access. No request was sent
to `dev437892` or `dev466345`; no build, generated-registry check, SDK
install, reinstall, transform, metadata query, runtime verification, Global
companion action, publication, export, or browser activity was performed in
this RR-045B attempt. The RR-045A build/registry evidence remains the latest
completed build checkpoint; it was not re-run after the authentication stop.

There is therefore no RR-045B installation status, installed application
identity, material metadata inventory, or installed-runtime result to record.
The previously documented Brazil Patch 1 versus Brazil Patch 1 Hotfix 1
difference is unchanged and unassessed in this attempt. Restore the existing
`docsera-source` credential through the approved local setup path, then repeat
RR-045B from the immediate pre-install clean-target checks; do not substitute
`docsera-pdi`.

RR-045B validation:

- `npm run ensure:task-worktree -- --task-branch feature/rr-043-edit-session-recovery-ui --original-base e847be1eb796c525425de3c9c2e3bcac7689e7ac --expected-head c6b7822d46ee02dbabdc5e4879b942dddfd7392d --mode continuation` — passed.
- `node .\\node_modules\\@servicenow\\sdk\\bin\\index.js --version` — passed (`4.8.1`).
- `node .\\node_modules\\@servicenow\\sdk\\bin\\index.js auth --list` — failed the required alias-presence preflight: only `docsera-pdi` / `dev466253` was listed.

## RR-047 source-SDK readiness — stopped before deployment

Date: 2026-11-02

RR-047 resumed the same continuation worktree at `af167ba3e609b826dfe995230d5ca7bfd675072d` (accepted base `e847be1eb796c525425de3c9c2e3bcac7689e7ac`). The task-worktree guard passed and the tree was clean before this documentation update.

### Source PDI application controls

Through the authorized `https://dev437892.service-now.com/` UI, the installed
Docsera application (`x_82900_docsera`, sys_id
`6997f092c3fd8310c569bf0d0501314d`, version `0.1.0`) was opened. While
Global was selected in the application picker, ServiceNow presented the
application as read-only and offered **Switch to Docsera**. Selecting Docsera
made the application form editable (including Update/Delete controls) and
displayed **Publish to Update Set...** as a related link. Publication was not
invoked and no application metadata was changed.

### Credential diagnosis and explicit-alias verification

The SDK ran under the non-elevated `DESKTOP-JIRC0Q8\\admin` Windows profile
with no `SN_SDK_CREDENTIALS_DIR` override. The workstation-level SDK 4.14.0
could see `docsera-source`, whereas the repository-pinned SDK 4.8.1 initially
saw only the retired `docsera-pdi` alias for `dev466253`. This was a
version-specific local credential-store compatibility issue, not an instance
or project identity issue.

After the repository-pinned SDK's secure credential flow added the alias,
its credential inventory showed:

| Alias | Host | Type | User | Default |
| --- | --- | --- | --- | --- |
| `docsera-source` | `https://dev437892.service-now.com` | basic | `admin` | Yes |

`docsera-pdi` remains present but is non-default and was not used. With the
target hostname verified from that inventory, the pinned SDK 4.8.1 executed
the following read-only, explicit-alias query successfully:

```text
now-sdk query sys_scope -q "sys_id=6997f092c3fd8310c569bf0d0501314d" \
  -f "sys_id,scope,name" -a docsera-source -o json
```

It returned Docsera / `x_82900_docsera` / `6997f092c3fd8310c569bf0d0501314d`.
This confirms that later installation can use the explicit form
`npm --prefix app/docsera-ui run install:sdk -- --auth docsera-source`; the
SDK's documented `--auth` flag selects the alias directly and does not depend
on the retired default configuration. That install command was intentionally
not run.

### Build readiness and disposition

The repository-pinned local SDK build was run without installation or
transformation and completed without a tracked change. It emitted only the
known third-party Rollup diagnostics for Tiptap module directives/sourcemaps.
`npm --prefix app/docsera-ui run verify:sdk-module-keys:checkpoint` passed:
**Committed SDK module identities verified.**

No SDK install or reinstall, metadata transformation, Global companion
change, version change, update-set publication, protected-target request, or
interactive Docsera product test occurred. Source-PDI development and
update-set publication controls are ready for independent review; stop before
deployment.

RR-047 validation:

- continuation task-worktree guard at `af167ba3e609b826dfe995230d5ca7bfd675072d` — passed;
- repository-pinned `now-sdk` `4.8.1` credential inventory — `docsera-source` / `dev437892` present and default;
- explicit `--auth docsera-source` read-only `sys_scope` query — passed;
- repository-pinned local SDK build — completed with known third-party Rollup warnings and no tracked diff;
- `npm --prefix app/docsera-ui run verify:sdk-module-keys:checkpoint` — passed.
