# RR-069 — Durable Owned Global SDK Candidate Recovery

Date: 2026-11-03

Status: **Installed once and verified by authenticated non-browser metadata checks. Stop for independent review before functional testing or Restricted Caller Access work.**

## Result

RR-068's scratch directory was unavailable, but its accepted source and identity evidence were recoverable. The durable local candidate is:

```text
C:\Dev\Docsera-rr-069-owned-global-sdk-candidate
```

Its pinned executable is:

```text
C:\Dev\Docsera-rr-069-owned-global-sdk-candidate\node_modules\.bin\now-sdk.cmd
```

The executable reports SDK `4.8.1`. The reconstructed `now.config.json` preserves the SDK-issued companion identity exactly:

```json
{
  "scope": "global",
  "scopeId": "2698dffadc844c00a9f20d67fca177d5",
  "name": "Docsera Global Workspace Provisioning Bridge",
  "tsconfigPath": "./src/server/tsconfig.json"
}
```

No initializer was run and no identity was generated or substituted.

## Recovered source and provenance

The source was copied read-only from the accepted RR-060 final converted Global output:

```text
C:\Dev\Docsera-rr-060-converted-output-20261103-final\app\docsera-global-bridge
```

The source registry at `src/fluent/generated/keys.ts` had SHA-256 `85681AF257D9F26621D442DD3068E041667A8367B8CD51B1CA5D4B3FF4826B86`, matching the RR-060 record and the RR-068 accepted manifest before use. The same hash remained after the candidate build. The candidate was copied without `.now`, `node_modules`, `dist`, `target`, `update-set`, or log files, so it does not rely on transient Codex worktree content or frozen release artifacts.

The only source configuration change was replacement of the converted `scopeId: "global"` with RR-068's accepted SDK-issued companion ID above. The package lock retains the pinned `@servicenow/sdk` 4.8.1 dependency.

## Reproducible recovery procedure

1. Verify the RR-060 source registry hash above and the committed `docs/process/evidence/RR-068-owned-global-package-manifest.json`.
2. Create `C:\Dev\Docsera-rr-069-owned-global-sdk-candidate` from the RR-060 Global source, excluding `.now`, `node_modules`, `dist`, `target`, `update-set`, and logs.
3. Change only `now.config.json` `scopeId` to `2698dffadc844c00a9f20d67fca177d5`; retain `scope: "global"` and all converted source and generated registry content.
4. From that directory, run `npm ci`, then `npm run build` using its local `node_modules\\.bin\\now-sdk.cmd`.
5. Re-run the fingerprints and identity checks below. Stop if any check fails; do not initialize a replacement identity or use `now-sdk install`.

## Build and fingerprint validation

`npm ci` completed (520 packages; npm reported its standard audit findings). `npm run build` passed with SDK 4.8.1. The SDK's only informational output was the existing absence of `src/client/tsconfig.json`, for which default client compiler options were used.

| Check | Result |
| --- | --- |
| Companion application XML | `dist/app/scope/sys_app_2698dffadc844c00a9f20d67fca177d5.xml` |
| Application XML SHA-256 | `D64514522FCA99C7E106BF4D07A3F74EBFC1AF19F0372EC8BF867F19DEF613D8` — matches RR-068 |
| Generated registry SHA-256 | `85681AF257D9F26621D442DD3068E041667A8367B8CD51B1CA5D4B3FF4826B86` — matches RR-060/RR-068 |
| Generated XML files | 24: one companion `sys_app` plus 23 metadata files |
| Metadata identity set | Exact match with all 23 accepted RR-068 IDs |
| Runtime modules | Exact match with all six accepted IDs and `/global/docsera-global-workspace-bridge/0.1.0/` paths |
| DELETE declarations | 0 |
| New record identities | 0 beyond the accepted companion application ID and accepted metadata set |

The regenerated table counts are six `sys_module`, nine `sys_scope_privilege`, two `sys_script`, two `sys_script_include`, one `sys_security_acl`, one `sys_ui_page`, and two `sys_ux_lib_asset` records.

## Payload and ownership comparison

The 23 regenerated metadata XML files have the same filenames and target IDs as the preserved RR-060 generated output. Normalizing only the expected ownership values and CycloneDX nondeterminism produces an exact payload match. The expected ownership rewrites are:

- `sys_scope` from `global` to `2698dffadc844c00a9f20d67fca177d5` on the companion records and generated UX mapping records;
- `source_scope` on the nine scoped privileges;
- `sys_package` on the two UX assets; and
- the BOM's `sys_scope_id` references.

The BOM also changes only its generated timestamp and UUID. Runtime scope remains `global`; all six runtime module paths, script payloads, scoped target references, page/ACL identities, and UX asset identities remain preserved.

The generated files contain no `sys_app:global` update, shared Global identity modification, canonical `x_82900_docsera` reference, old canonical asset ID, or DELETE action. The companion application record has action `INSERT_OR_UPDATE`, ID `2698dffadc844c00a9f20d67fca177d5`, and `<scope>global</scope>`.

## Deliberate non-actions and handoff

No PDI authentication, query, installation, `now-sdk move`, update-set import, Restricted Caller Access change, browser check, or canonical release-artifact modification was performed. This verifies a durable local installation candidate only; it does not resolve receiving-instance collision/ownership semantics or authorize installation.

Stop here for independent review. Any future installation work must use the documented candidate and repeat the two accepted fingerprints before touching the PDI.

## RR-069B installation record

Date: 2026-11-03

### Pre-installation gates

The continuation worktree guard passed in
`C:\Users\jacob\.codex\worktrees\rr-069-first-owned-global-install\Docsera`
on `feature/rr-069-first-owned-global-sdk-install` at
`3d4e7974277d094c1440ec3840faae78cd3ec822` (original base
`e847be1eb796c525425de3c9c2e3bcac7689e7ac`). The recovered source was
exactly `C:\Dev\Docsera-rr-069-owned-global-sdk-candidate`; its local
`node_modules\.bin\now-sdk.cmd` reported 4.8.1, and its `now.config.json`
specified `global` / `2698dffadc844c00a9f20d67fca177d5` / `Docsera Global
Workspace Provisioning Bridge`.

`auth --list` identified `docsera-dev468303` as the default basic-auth alias
for exactly `https://dev468303.service-now.com/` (admin). The explicit alias
was nevertheless supplied to every instance command. The regenerated
application XML SHA-256 was
`D64514522FCA99C7E106BF4D07A3F74EBFC1AF19F0372EC8BF867F19DEF613D8`; the
registry `src/fluent/generated/keys.ts` SHA-256 was
`85681AF257D9F26621D442DD3068E041667A8367B8CD51B1CA5D4B3FF4826B86`.
Both match RR-068/RR-069A. There were 24 XML files: the accepted companion
`sys_app` plus the 23 accepted metadata identities (6 modules, 9 privileges,
2 business rules, 2 Script Includes, ACL, UI Page, and 2 UX assets). Every
top-level metadata action was `INSERT_OR_UPDATE`; no `action="DELETE"`
declaration, shared `sys_app=global` update, old canonical-scope reference, or
unexpected metadata identity was present. All six module paths matched the
accepted `/global/docsera-global-workspace-bridge/0.1.0/` inventory.

Authenticated SDK query positive controls succeeded: the company property was
`2300756`; the longstanding platform Global scope was exactly
`global` / `Global`, created and updated `2014-06-09 20:25:13`; and the scoped
application, scope, and runtime UI Page remained exactly
`e6e43323accd4c7fb9271525a343850e`, `x_2300756_docsera`, and
`c7a040a2d7bb4148b8ce008bc1f8d6c9`. The scoped page retained its existing
RR-062 description and timestamps.

Before installation, successful explicit-alias queries showed zero records for
the companion application/scope ID and name, every accepted metadata ID, the
Global `docsera` UI Page name, both Script Include names, both business-rule
names, ACL `docsera`, both UX asset names, all six runtime paths, and the
targeted scoped-table privilege relationships. Thus no target identity or
logical collision was present. The native Global identity was recorded before
the install as above and was not a package target.

The established scoped runtime verifier could not be launched from this task
worktree because its local `@napi-rs/keyring` dependency is not installed;
dependencies were not changed as a workaround. Its authenticated app/scope/UI
Page positive controls above did succeed. This is a validation limitation, not
an installation retry or environment mutation.

### One authorized installation

At 2026-11-03 approximately 20:02 UTC, exactly one normal SDK installation
was run from the recovered candidate:

```powershell
& 'C:\Dev\Docsera-rr-069-owned-global-sdk-candidate\node_modules\.bin\now-sdk.cmd' install `
  --source 'C:\Dev\Docsera-rr-069-owned-global-sdk-candidate' `
  --auth docsera-dev468303
```

It completed successfully. The SDK issued rollback context
`1c780c5e1b1053103b8ba6ca234bcbbf` and reported the installed application as
`2698dffadc844c00a9f20d67fca177d5`. No `--reinstall`, retry, move,
update-set import, manual repair, or Restricted Caller Access modification was
used.

### Post-installation verification

Authenticated explicit-alias queries found the companion application and its
scope exactly once, under `2698dffadc844c00a9f20d67fca177d5`, with Global
runtime scope, active state, version `0.1.0`, and creation/update time
`2026-11-03 20:02:21`. The `scope=global` query now returns precisely two
expected scopes: the unchanged platform-owned `global` / `Global` record and
the new owned companion. The original scoped Docsera application and runtime
page retained their pre-install IDs, timestamps, and description.

All 23 accepted records exist under their accepted IDs and the owned companion
application reference: six `sys_module` records at the exact accepted paths
(created `20:02:22`), nine allowed scoped privileges to
`x_2300756_docsera` (created `20:02:22`), two active business rules, two
active Script Includes, the active Global `docsera` read ACL, the direct
Global `docsera` host page, and the two expected UX assets (created
`20:02:23`). The two Script Includes have their intended API names and access
settings: provisioning is `package_private`; membership is `public` with
restricted caller access. The host page's bootstrap description is `Docsera
production friendly URL host for the installed scoped runtime.`

Exact-ID and path queries returned no omissions or duplicates. The Global host
name, Script Include names, ACL name, UX asset names, and module-path prefix
each returned only the accepted companion records after installation. A
reverse `source_scope=<companion-id>` encoded query returned an empty envelope
despite the nine exact-ID records each returning that same raw
`source_scope`; the exact-ID record evidence is retained as the authoritative
post-install relationship proof, and no retry or mutation was performed.

The two business-rule `name` values are stored by the platform in their
field-length-truncated forms (`Docsera Workspace Provision Request Work` and
`Docsera Workspace Member Mutation Comman`), while their accepted IDs,
collections, active states, `state=requested` filter conditions, and timing
(`async_always` / `after`) are correct. This is platform storage behavior, not
an identity replacement.

The Global host/bootstrap and existing scoped runtime were verified through
authenticated non-browser record checks. Browser acceptance, functional data
creation, and Restricted Caller Access authorization remain intentionally
deferred. In particular, the post-install restricted-caller-access query is
empty; no record was created or broadened by this task.
