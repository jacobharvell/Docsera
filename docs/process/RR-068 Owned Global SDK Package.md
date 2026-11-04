# RR-068 — Owned Global SDK Package

Date: 2026-11-03
Status: **Candidate generated for independent review. Do not install, move, import, or otherwise mutate the PDI.**

## Result

The SDK 4.8.1 Global initializer issued a new Docsera companion application
identity:

```text
2698dffadc844c00a9f20d67fca177d5
```

An isolated copy of the accepted RR-060 converted Global companion was built
with that identity. The package contains one companion-owned `sys_app` record
and does not contain `sys_app:global`, `sys_scope:global`, shared Global
package metadata, old canonical-scope references, DELETE declarations, or
duplicate target identities. The complete identity inventory is committed in
[`RR-068-owned-global-package-manifest.json`](evidence/RR-068-owned-global-package-manifest.json);
the generated application-record XML is committed separately in
[`RR-068-owned-global-sys-app.xml`](evidence/RR-068-owned-global-sys-app.xml).

This resolves the specific RR-066 package-composition defect: the candidate
does not transport an update to the platform-owned `sys_app:global` record.
It is **not** installation authorization. A receiving instance still needs an
explicit ownership/collision migration decision for the pre-existing Global
metadata before any SDK installation is considered.

## Isolated procedure

The accepted converted output at
`C:\Dev\Docsera-rr-060-converted-output-20261103-final\app\docsera-global-bridge`
was read only. A separate scratch directory was initialized with the converted
output's pinned SDK executable (`@servicenow/sdk` 4.8.1):

```text
now-sdk init --appName "Docsera Global Workspace Provisioning Bridge" \
  --packageName "docsera-global-workspace-bridge" \
  --scopeName global --template typescript.basic --noUpdate
```

The initializer-generated `now.config.json` supplied the ID above. Its
`scopeId` was copied exactly into a separately copied candidate; no GUID was
invented and the RR-067 disposable ID was not used. The candidate config
preserved all other converted configuration:

```json
{
  "scope": "global",
  "scopeId": "2698dffadc844c00a9f20d67fca177d5",
  "name": "Docsera Global Workspace Provisioning Bridge",
  "tsconfigPath": "./src/server/tsconfig.json"
}
```

The copy excluded `.now`, `node_modules`, prior `dist`/`target`, the frozen
update-set artifact, and logs. It did not modify the accepted RR-060/RR-065
source, the canonical repository application, or the installed scoped app.
After `npm ci`, the candidate was built once with `npm run build`; generated
XML was inspected but never hand-edited.

## Generated package evidence

- Application XML: `scope/sys_app_2698dffadc844c00a9f20d67fca177d5.xml`
- Application XML SHA-256:
  `D64514522FCA99C7E106BF4D07A3F74EBFC1AF19F0372EC8BF867F19DEF613D8`
- Application record: one `sys_app`, target ID
  `2698dffadc844c00a9f20d67fca177d5`, action `INSERT_OR_UPDATE`.
- Companion metadata: 23 records, 23 unique target IDs, matching the RR-060
  converted registry fingerprint
  `85681AF257D9F26621D442DD3068E041667A8367B8CD51B1CA5D4B3FF4826B86`.
- Table counts: six `sys_module`, nine `sys_scope_privilege`, two `sys_script`,
  two `sys_script_include`, one `sys_security_acl`, one `sys_ui_page`, and two
  `sys_ux_lib_asset` records.
- The six preserved module target IDs and paths are recorded in the manifest.
  Their package paths remain under
  `/global/docsera-global-workspace-bridge/0.1.0/`.
- The host page, ACL, both Script Includes, both workers, both UX assets, and
  all nine scoped privileges retain their RR-060 target IDs and converted
  Docsera references. Each privilege still targets
  `x_2300756_docsera` / `e6e43323accd4c7fb9271525a343850e` as appropriate.

The normalized comparison against RR-060's generated 23 update records found
no semantic difference except the expected owning-application references and
the generated CycloneDX BOM's timestamp/UUID. The source registry was unchanged
by the build. The manifest records the full record inventory and checks.

## Ownership-reference change: material, not assumed harmless

The SDK does more than change the scope application record. In each of the 23
metadata XML records it emits:

```xml
<sys_scope display_value="global">2698dffadc844c00a9f20d67fca177d5</sys_scope>
```

Previously the converted Global package emitted `global` as that reference.
The candidate application record itself keeps `<scope>global</scope>`, so the
runtime scope remains Global; source paths, runtime module identities, script
code, UX asset references, and the nine scoped privileges remain converted
Docsera behavior. However, `sys_scope` is ownership/package metadata, and the
new target refers to the newly owned application record. This is the necessary
SDK representation of a separately owned Global companion, but it changes the
ownership association of every companion record.

Consequently it cannot be treated as a harmless package-only rewrite. A normal
installation still requires an independently approved plan to claim or create
the 23 Global records without collision, orphaning, or unintended replacement.
No such plan was executed in RR-068.

## Restricted Caller Access

No `sys_restricted_caller_access` record was added. SDK 4.8.1 still has no
supported Fluent declaration for the required Docsera-scoped-to-Global
membership Script Include `execute` approval. The narrowly reviewed
administrator procedure remains separate from this package and must not be
replaced by broader permissions.

## Validation

- Passed the task-worktree guard from base
  `4febb7c0d1e29b439f3d92fd987688fde1cf5ec0`.
- Ran `npm ci` in the isolated candidate (completed; npm reported its standard
  dependency audit findings, none changed or were accepted by this task).
- Ran `npm run build` in the isolated candidate: passed. The SDK emitted its
  known informational warning that `src/client/tsconfig.json` is absent and
  default client compiler options were used.
- Inspected all 24 generated XML files, application XML hash, table counts,
  target-ID uniqueness, Registry SHA-256 continuity, module paths, actions,
  old-scope references, shared-Global targets, and DELETE declarations.
- Intentionally did not run `now-sdk install`, `now-sdk move`, update-set
  generation/import, any PDI mutation, browser test, scoped-app reinstall, or
  canonical release-artifact modification.

## Remaining limitations before installation

1. An administrator must approve a one-time, read-only collision and ownership
   review of the receiving PDI before a deployment mechanism is considered.
2. The receiving-instance migration/claim semantics for these existing 23
   Global record IDs remain unproven; do not use installation to discover them.
3. Restricted Caller Access remains an administrator-reviewed, exact
   relationship after the target Script Include exists.
4. The candidate has not been installed or runtime-tested; its evidence proves
   package composition, not live acceptance.
