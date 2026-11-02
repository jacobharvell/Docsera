# RR-039E — Clean-Target Global Companion Import and Preview

Date: 2026-11-02

Current status: **Commit blocker identified after the clean preview. Do not commit the currently Previewed 27-record update set.** It contains two unsafe synthetic updates to the receiving instance's shared Global package/scope identity. RR-039F corrects the source artifact for a future independent review; it does not alter the retrieved update set or diminish the historical clean-preview evidence below.

Revised status: **Blocked by unavailable browser-control capability. No Global update set was imported, previewed, committed, or otherwise changed.**

Status: **Inconclusive — target preflight could not be safely established. No Global update set was imported, previewed, committed, or otherwise changed.**

## Scope and decision

RR-039E was resumed after Jacob confirmed that an authenticated administrator browser session was open. This Codex execution environment nevertheless exposes neither the Computer Use skill's required persistent `node_repl` / `@oai/sky` interface nor an attachable browser-automation capability in its callable tool inventory. Therefore it cannot attach to or operate that already authenticated session. This is an execution-capability blocker, not an SDK-authentication blocker; SDK authentication was neither requested nor attempted.

This task was limited to qualifying the committed Global companion for installation alongside the already installed Docsera scoped application on `https://dev466345.service-now.com/`. The required target preflight could not be performed through an authenticated, supported read-only administrative channel in this execution environment:

- `npx @servicenow/sdk auth --list` returned `No credentials found`, so the supported read-only `now-sdk query` path could not inspect the target.
- No authenticated administrative browser-control session was available to use the standard Retrieved Update Sets workflow.

Consequently, the receiving PDI identity, the installed `x_82900_docsera` scope, existing `docsera.do` page and ACL, Global membership bridge, provisioning workers, restricted-caller-access record, and Global collision state were **not inspected in this task**. In particular, a foreign-owned `docsera.do` collision could not be ruled out. The task therefore stopped before import, exactly as required when safe inspection is unavailable.

## Resumed execution — authenticated-browser preflight, import, and preview

The former execution-capability blocker is superseded. On 2026-11-02, the authenticated administrator browser session on `https://dev466345.service-now.com/` was used to perform the required receiving-instance preflight, import the unchanged committed XML once, and run Preview Update Set once. No commit, override, skip action, manual metadata repair, or artifact regeneration was performed.

### Receiving-instance preflight

The target contains the expected installed scoped dependency: `Docsera`, scope `x_82900_docsera`, sys_id `6997f092c3fd8310c569bf0d0501314d`. The Global collision/ownership checks returned no records for the `docsera` UI Page, its known host ACL `879785c448564188a54416cb90d18c14`, the two Global bridge Script Includes, or the two Global worker Business Rules. No retrieved update set named `Docsera Global Companion 0.1.0` existed before import. Therefore no foreign-owned `docsera.do` collision or pre-existing Docsera Global companion was found.

### Import and preview result

The unchanged `sys_remote_update_set_docsera_global_companion_0_1_0.xml` was imported through **Retrieved Update Sets → Import Update Set from XML**. The retrieved record is `9ba0df893a5160bb44e3b129e6080e04`, named **Docsera Global Companion 0.1.0**, in **Global** scope. Preview Update Set was run exactly once and completed successfully in 3 seconds. The set is now **Previewed**.

| Preview field | Observed value |
| --- | ---: |
| Inserts | 27 |
| Updates | 0 |
| Deletions | 0 |
| Collisions | 0 |
| Total | 27 |
| Preview problems | 0 |

The only visible form warning was the generic Subscription Management advisory shown after preview; it was not an update-set preview problem and required no action. There were no collision, dependency, update, deletion, or override warnings in the filtered preview-problems list.

The known source `DELETE` entry for `sys_security_acl_role:1416f98418e24c18af184b0300f7793c` was inspected in the filtered preview records. It is proposed as **Insert / Commit** on this clean target, because the temporary ACL-role binding is absent; the preview therefore has zero deletions. This behavior is understood and is not a preview problem.

### Revised qualification and authorization boundary

The receiving-instance preflight and the one permitted preview were clean, but that preview does **not** qualify the retrieved artifact for commit. Independent artifact review subsequently found that its two synthetic Global base records would update `sys_package:global` and `sys_scope:global` with Docsera development-package values. The retrieved update set remains **Previewed**, not committed; it must not be committed. This report preserves the successful preview as historical evidence only and does not authorize a Global update-set commit.

## Artifact provenance and local verification

The existing committed artifact was inspected without regeneration or modification:

`app/docsera-global-bridge/update-set/sys_remote_update_set_docsera_global_companion_0_1_0.xml`

| Item | Observed value |
| --- | --- |
| Update-set name | `Docsera Global Companion 0.1.0` |
| Version | `0.1.0` |
| Artifact revision | `friendly-url-host-companion-r1` |
| Source / remote update-set sys_id | `9ba0df893a5160bb44e3b129e6080e04` |
| Application | Global |
| SHA-256 | `6DFA17E578B2CBD1A72449DE93AD1A389F8864D85F1B809517028C4CF1D23B1B` (unsafe superseded artifact) |
| `sys_update_xml` inventory | 27 records |

The committed manifest at `app/docsera-global-bridge/update-set/docsera-global-companion.update-set.json` also lists 27 records. Its inventory agrees with RR-001, but is now known to include the two unsafe shared-Global base records:

| Table | Count |
| --- | ---: |
| `sys_module` | 6 |
| `sys_scope_privilege` | 9 |
| `sys_script` | 2 |
| `sys_script_include` | 2 |
| `sys_security_acl` | 1 |
| `sys_security_acl_role` | 1 |
| `sys_ui_page` | 1 |
| `sys_ux_lib_asset` | 2 |
| `sys_restricted_caller_access` | 1 |
| `sys_package` | 1 |
| `sys_scope` | 1 |

`npm --prefix app/docsera-global-bridge run verify:friendly-url-host` passed. It confirms the expected Global `docsera` UI page (`de3b81474ba94c0a9296d12f9c6bd9cc`), its read ACL (`879785c448564188a54416cb90d18c14`), both bootstrap assets, the Direct UI host markup, scoped runtime-asset import, and logged-in ACL expression. It also confirms that the obsolete `gs.getUser().isLoggedIn()` expression is absent.

## Metadata-operation and dependency review

All 27 enclosing `sys_update_xml` records are `INSERT_OR_UPDATE`. Their payloads contain one intentional destructive operation: `sys_security_acl_role:1416f98418e24c18af184b0300f7793c` is `DELETE`. This is the known author-elective retirement of the temporary `x_82900_docsera.editor` role binding from the companion host ACL. It is not an active role requirement and must be independently examined during preview before any commit.

The artifact contains no `dev[0-9]+` instance hostname or direct development-instance URL. It deliberately depends on the already installed scoped Docsera identity:

- source/target scope `x_82900_docsera` / `6997f092c3fd8310c569bf0d0501314d`;
- Docsera workspace and provisioning tables;
- the scoped runtime asset at `/uxasset/externals/x_82900_docsera/main.jsdbx`;
- the scoped `x_82900_docsera.editor` and `x_82900_docsera.workspace_admin` roles.

These are expected ordered-install dependencies, not proof that the target contains the required matching records. The target preflight must prove that the installed scoped app has this identity before the artifact can be considered safe to import.

## Import and preview evidence

Superseded by the resumed-execution evidence above. One import and one preview were run, producing retrieved update set `9ba0df893a5160bb44e3b129e6080e04` in `Previewed` state with the recorded clean result.

No platform-owned Global record was committed, overridden, skipped, changed by hand, or repaired. RR-039D's automatically generated scoped privileges were not changed, deleted, or repaired.

## Next authorization boundary

Revised qualification: **Blocked pending a browser-control-capable execution environment.** The companion is not ready for commit review.

The previewed companion is **not ready for commit review**. A future candidate must be regenerated without shared-Global base records, independently reviewed, and imported into a fresh retrieved update set before it can be previewed. The existing Previewed set must remain untouched.

Before any import, an administrator with supported read-only access must record the receiving instance identity and inspect the installed Docsera scope and each relevant Global identity: `docsera` UI page, its ACL, both bridge Script Includes, both provisioning/membership workers, restricted caller access, and retrieved-update-set state. A foreign-owned `docsera.do` is a blocking collision and must not be overwritten.

Only if that preflight is clean may a separately controlled follow-up import this unchanged XML once and run Preview Update Set once. That follow-up must record the retrieved set identity, all insert/update/delete and collision counts, preview problems/warnings/dependencies, and independently review every material Global update or deletion — especially the `sys_security_acl_role` deletion — before stopping for an independent commit authorization. This report grants no authority to commit the Global update set.

## Validation

- Authenticated-browser PDI administration: completed. Target preflight confirmed the expected scoped Docsera dependency and no Global-host collisions; the unchanged Global XML was imported once and previewed once.
- Preview completion: succeeded in 3 seconds. Retrieved update set `9ba0df893a5160bb44e3b129e6080e04` is `Previewed`, with 27 inserts, 0 updates, 0 deletions, 0 collisions, 27 total, and 0 preview problems.
- Known ACL-role source deletion: inspected in filtered preview records; it is an Insert / Commit proposal because the target binding is absent, so it does not add a target deletion.
- `npm run validate:docs` and `git diff --check`: pending after this report update.

- Resumed-task continuation guard: passed at expected HEAD `2892ac3340a2172d7bf29cf8ab8c844fdbb57a69` from base `bc1cf30655928f20df03c195719e52f8920d2ace`.
- Browser-control capability check: no callable persistent `node_repl` / `@oai/sky` or browser-automation capability was exposed. Target inspection, import, preview, and commit were not attempted.

- Task-worktree continuation guard: passed at expected HEAD `a2f6a12b3733d0f277718ad06ad6d71675f218a7` from base `bc1cf30655928f20df03c195719e52f8920d2ace`.
- SHA-256 calculation: completed; value recorded above.
- Manifest/XML inventory comparison: 27 records in each; table inventory recorded above.
- Friendly-URL host artifact verification: passed.
- Target inspection, import, preview, commit, deployment, SDK build, and browser/runtime testing: intentionally not run because no authenticated supported administrative inspection path was available.
