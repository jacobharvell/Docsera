# RR-054 — SDK Identity Recovery and Conversion Feasibility

Date: 2026-11-02
Status: **Investigation complete. No ServiceNow instance or canonical source identity was changed.**

## Recommendation

Use a new scoped identity whose prefix is actually assigned to `dev466345`, then adapt Docsera once in a dedicated source branch. This is the smallest reliable route to repeated SDK install cycles. Do not rely on adding the old `82900` company key: that is a protected-instance operation, has not been shown available on this PDI, and is not proof that install/update works.

For contributors, start with a documented one-time conversion. A setup command is feasible after one successful proof: the deterministic work is small, but the PDI-issued prefix and SDK-generated identities must remain inputs/outputs, not hard-coded guesses.

## Verified PDI state and limitation

The current local credential inventory was read with both the workstation SDK and a disposable exact SDK 4.8.1 environment. It contains `docsera-source` for `https://dev437892.service-now.com` (and the retired `docsera-pdi` for `dev466253` in the 4.8.1 store), but **no credential for `dev466345`**. No credential was added, selected, or changed. Therefore no current request was made to `dev466345`; its current company key, authorized prefixes, release/patch, auth state, and test-data counts remain unverified. A read-only explicit alias for that host is required before claiming those facts.

Historical target evidence is not a current inventory, but establishes the replacement collision set:

- RR-039B recorded `Docsera` / `x_82900_docsera` / `6997f092c3fd8310c569bf0d0501314d` / `0.1.0`: 13 tables, 34 REST operations, 49 ACLs, 65 server modules, 3 roles, one Direct UI Page, 8 runtime assets, and 2 scheduled jobs.
- RR-039H recorded the 25-record Global companion: 2 Script Includes, 2 workers, 6 Global modules, 9 scoped privileges, a `docsera` host page, and 2 host assets, all tied to the old scope.
- RR-040/RR-040A records one evidenced test workspace, `Smoke-01` (`52ed42f5c3909310ac26fe3d05013193`), two native groups, and one succeeded provisioning request. It is not a current count.

Before any replacement/cleanup approval, use read-only SDK 4.8.1 `query` against `sys_properties` (company code and readable policy), `sys_scope`, `sys_app`, scoped metadata, Global companion, update sets, and all Docsera data tables. Record counts and confirm any data Jacob wants retained. No Scripts - Background or SDK `exec` is needed.

## Pinned SDK 4.8.1 evidence

A bare `npx` resolves workstation SDK 4.14.0, so it is not valid task evidence. A disposable local 4.8.1 installation (with its missing `sass` peer supplied) confirmed that `auth --list`, `query`, `init`, `transform`, and `install` exist. `query` is read-only and supports explicit aliases and JSON output.

The local proof ran 4.8.1 `init --scopeName x_123456_docsera --template typescript.basic`. It authenticated to the default alias, read that instance's vendor prefix (`x_2299961_`), warned that the supplied prefix differed, and created a local `now.config.json` with a fresh SDK-generated `scopeId`. It did not prove installation ownership on another PDI. Important version distinction: 4.8.1 accepts `typescript.basic`; the newer `partial.typescript.basic` template is rejected.

SDK 4.8.1 documentation confirms that `keys.ts` maps Fluent keys to stable sys_ids: retaining a key updates that record, while a missing key receives a new SDK-generated ID at build. Generated identities must therefore be regenerated/reviewed, never invented.

## Approach comparison

| Approach | Required ServiceNow operations | Repository change / repeatability | Deployment assessment |
| --- | --- | --- | --- |
| A. Retain `x_82900_docsera` | Read key/release; if the PDI owns `82900`, authenticate and install. Otherwise a protected company-key change needs separate approval. | None if it works; not portable to a PDI with another prefix. | Unproven. `dev437892` could import the old app but SDK installation failed as third-party. Download/import permission is not update authority. |
| B. New PDI-owned identity | Read `dev466345` prefix; create/init a matching scope; capture its scope/scopeId; build then install after approval. | One coordinated conversion; each developer needs an own-PDI mapping. | Recommended. SDK warns on prefix mismatch; two successive explicit-alias installs remain required proof. |
| C. Automate B | Command reads/accepts prefix, scaffolds identity, generates mapping, rewrites mechanical references, and stops before destructive/install actions. | Feasible after B proof; generated IDs must come from SDK build. | Plausible, not proven; preserve build/key checkpoints and explicit install. |

### A — actual feasibility

The supplied recovery plan records that `dev437892` (`2299961`) could import the app but failed SDK installation of the old scope. SDK discussion #131 confirms installer-side company-key checks. Its stated later relaxation applies specifically to **`sys_app` download** at Australia Patch 6 / Zurich Patch 13; it is not proof of repeated mismatched-scope installation on this unverified target. Community reports describe key-property changes as workarounds, not an assured PDI path. A is conditional, not the recovery plan.

### B — conversion surface and generated identities

The scope string appears in 88 tracked `app/` files. Conversion must update:

- `app/docsera-ui/now.config.json` (scope and scopeId), 13 Fluent tables, roles/ACLs, REST namespace, Direct UI Page endpoint (`x_82900_docsera_docsera_sdk_runtime.do`), menu, scheduled jobs, UI assets, server module paths, and client/server URLs.
- Scoped table and role literals. REST route suffixes can remain unless the live collision inventory says otherwise.
- Global companion workers/bridges, scoped privileges, host page/assets, source/target scope IDs, generated keys, verification scripts, and exported XML. Install order remains scoped app first, then a regenerated/reviewed companion.

The UI registry currently includes identities for 14 `sys_db_object`, 53 ACL, 35 REST-operation, 66 `sys_module`, 12 UX-asset, and 3 role records; the Global registry has 6 modules, 2 Script Includes, 2 workers, 9 privileges, a page, and 2 assets. Old IDs collide with the installed old app. Do not retain them blindly, but do not text-generate replacements: perform a controlled keys-registry reset/regeneration through the SDK and review it.

## Recommended implementation sequence and approval gates

1. Restore an approved, explicit local `dev466345` alias; run the bounded read-only inventory and record prefix, patch, collision set, and data counts.
2. Obtain approval to remove/replace the old scoped app and 25-record companion after Jacob reviews retained data.
3. In one conversion branch, initialize a matching-scope skeleton, record its scope/scopeId, apply the mapping, regenerate metadata identities, update companion contracts, build, and run key verification.
4. Obtain approval for first scoped install, then companion replacement. Do not use `--reinstall` without explicit loss-scope approval.
5. Make one harmless source change and complete a second explicit-alias SDK install. Run non-interactive runtime verification; Jacob performs live workspace/editor acceptance.
6. Only then implement an optional contributor setup command/runbook. It should refuse known-identity overwrite and deployment without an explicit alias.

## Validation and constraints

- Passed: task-worktree guard at `c397334721465c78eb0bb39e72090b05bd8fdf8f`; SDK 4.8.1 CLI/help/query docs; disposable 4.8.1 init proof; source/keys/companion inventory; historical-report and supplied-plan review.
- Intentionally skipped: `dev466345` access, install/transform/download, Scripts - Background, SDK `exec`, cleanup, source-identity edits, Global replacement, browser acceptance, and a production converter.
- Risk: target facts may have drifted since RR-039/RR-040; they are historical evidence only. Exact target release/patch determines whether later platform changes apply.

## Sources

- [SDK discussion #131](https://github.com/ServiceNow/sdk/discussions/131)
- [ServiceNow SDK application creation](https://www.servicenow.com/docs/r/zurich/application-development/servicenow-sdk/create-application-now-sdk.html)
- [ServiceNow SDK 4.8.1 documentation](https://servicenow.github.io/sdk/4.8.1)
- Supplied “Docsera SDK Development Identity Recovery — Current Plan”; RR-039B, RR-039H, RR-040/RR-040A, RR-045; task-base repository source.
