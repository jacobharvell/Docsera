# RR-067 — Global SDK Application Identity Spike

Date: 2026-11-03
Status: **Feasible in SDK 4.8.1 as a separately owned Global application; the current companion is not in that model. Do not install or migrate it in this spike.**

## Decision

ServiceNow SDK 4.8.1 does support a Global-scope application with its own application identity.  It does **not** require every Global project to target the platform-owned `sys_app:global` record.  RR-066's package-composition blocker applies specifically to the converted companion configuration:

```json
{ "scope": "global", "scopeId": "global" }
```

That configuration serializes `scope/sys_app_global.xml` and would update the shared platform Global application.  It was not created by the supported SDK initializer and must not be used for an SDK developer install.

The smallest supported identity change is instead a freshly initialized Global project whose `scope` remains `global` and whose SDK-generated `scopeId` is a distinct 32-character ID.  That ID identifies the companion `sys_app` record, while the records it owns remain Global-scope metadata.  The package therefore targets a companion application record, not the platform's shared `sys_app:global` record.

This establishes a supported *identity model*, not an approved deployment.  The collision/claim behavior for 23 pre-existing converted records can only be proven by a controlled, explicitly authorized instance migration; that remote mutation was out of scope and was not performed.

## Exact local scaffold evidence

An isolated scratch directory outside the repository was initialized with the pinned local SDK 4.8.1:

```text
now-sdk init --appName "RR 067 Global Identity Scratch" \
  --packageName rr-067-global-identity-scratch \
  --scopeName global --template typescript.basic --noUpdate
```

The generated `now.config.json` was:

```json
{
  "scope": "global",
  "scopeId": "b9f66eefa07d46eb8ac9440f7a1ba42a",
  "name": "RR 067 Global Identity Scratch",
  "tsconfigPath": "./src/server/tsconfig.json"
}
```

The ID above is evidence of the local initializer result only; it is not a proposed Docsera ID and must not be copied into the companion.  The initializer's SDK 4.8.1 implementation (`ProjectFactory.createProject`) sets `scopeId` to an SDK GUID whenever the caller provides none.  Its `init` command passes `scope: answers.scopeName`; selecting/providing `global` changes the scope string but does not pass `scopeId: global`.

The scaffold contains the normal Fluent layout (`src/fluent/example.now.ts`, `src/server`, TypeScript configs, `package.json`, and `now.config.json`).  Its package declares `@servicenow/sdk` `4.8.1`, and `now-sdk build` is the supported package builder.  SDK source further establishes the resulting app-record filename contract as `scope/sys_app_<scopeId>.xml` (or `sys_store_app_<scopeId>.xml`), and its pack inventory uses the distinct `scopeId` as the Global build identifier.  Thus this scaffold's app metadata target is `sys_app:b9f66eefa07d46eb8ac9440f7a1ba42a`, not `sys_app:global`.

The scratch dependency install was interrupted by the local command runner and left npm's lockfile damaged; a subsequent build stopped in third-party dependency resolution (`LRU is not a constructor`) before XML output.  This does not weaken the identity finding: it is directly evidenced by the generated config and the pinned SDK's build/filename implementation.  No package was installed on an instance.

## Terminology and current-state distinction

| Term | Meaning in SDK 4.8.1 | Current Docsera companion |
| --- | --- | --- |
| **Global scope** | `scope: "global"`; metadata executes in Global scope. | Yes. |
| **Platform Global application** | Shared, platform-owned `sys_app` identity `global`. | Incorrectly selected by `scopeId: "global"`. |
| **Separately owned Global application** | `scope: "global"` plus a unique SDK-created `scopeId`; package serializes that companion `sys_app` record. | No. This is the supported target model. |

The nine `sys_scope_privilege` records, two Script Includes, two workers, UI Page, ACL, UX assets, and runtime `sys_module` records can remain Global-scope records under the third model.  The unique application identity separates their owning application/package from the platform Global record; it does not turn them into scoped-app metadata.

## Feasibility and a constrained migration path

**Structurally feasible:** a correctly initialized Global project can package a companion-owned `sys_app:<unique-id>` and Global metadata without serializing an update to `sys_app:global`.  This resolves the RR-066 application-identity/package-composition blocker.

Do not edit `scopeId` to a made-up value.  A future approved migration must begin by running the supported SDK initializer in a clean local directory and retain the unique identity it generated.  It should then be performed as a deliberate conversion, not a regeneration of the existing registry:

1. Preserve the 23 converted companion source records, their explicit `$id` entries in `src/fluent/generated/keys.ts`, the two runtime module path identities, and the frozen update-set artifact unchanged as the baseline.
2. Create the new Global scaffold with `now-sdk init` and copy only its generated `now.config.json` application identity into a reviewable conversion branch.  Keep `scope: global`; use the initializer-issued `scopeId` exactly.
3. Rebuild and review the complete package inventory.  It must contain `sys_app:<new-id>` and must contain no `sys_app:global`, `sys_scope:global`, deletes, or canonical `x_82900_docsera` references.  Confirm the 23 intended record IDs and the runtime `sys_module` paths are preserved.
4. Before any installer is used, obtain explicit approval for a one-time receiving-instance migration and a read-only collision inventory.  Existing matching Global records need an ownership/claim plan; a normal package update must not silently replace or orphan them.  The SDK's documented Global workflow advertises `now-sdk move` for moving/claiming instance metadata, but that command requires the separately owned app to exist on the instance and is therefore a remote mutation outside this spike.
5. Only after that migration proof may installation mechanics be reconsidered.  Use neither `--reinstall` nor an update-set import as a shortcut.  Re-run the RR-066 package safety review after every generation.

The retained `$id` values are the appropriate mechanism for controlled continuity of the 23 metadata records.  Changing runtime module source paths would create fresh `sys_module` identities and must be treated as a separate migration decision.

## Restricted Caller Access remains separate

Nothing in the Global-initialization flow creates `sys_restricted_caller_access` metadata.  SDK 4.8.1's Fluent API supports the nine cross-scope privilege records but has no supported Restricted Caller Access entity/API.  The narrow Docsera-scoped-to-Global membership Script Include `execute` authorization still needs the administrator-reviewed procedure described in RR-066, after the target Script Include exists.  A distinct Global application identity does not supply, predict, or authorize that relationship.

## Sources

- `docs/process/RR-066 Global SDK Installation Feasibility.md` — unsafe current package and 23-record inventory.
- `docs/process/RR-060 Real SDK Conversion Validation.md` — converted IDs and runtime module identities.
- Pinned local `@servicenow/sdk` 4.8.1 implementation: `sdk-cli/dist/command/init/{index,prompts}.js`, `sdk-api/dist/project-factory/index.js`, `sdk-api/dist/project.js`, and `sdk-api/dist/orchestrator.js`.
- [ServiceNow Australia release notes](https://downloads.docs.servicenow.com/pdf/enus/servicenow-australia-release-notes-enus.pdf) — SDK 4.4 added creation/conversion of Global applications and moving Global metadata with `now-sdk move`.
- [ServiceNow Developer guidance on creating applications](https://developer.servicenow.com/dev.do?_escaped_fragment_=%2Flearn%2Flearning-plans%2Fxanadu%2Fnew_to_servicenow%2Fapp_store_learnv2_buildneedit_xanadu_creating_an_application) — Global is a selectable application scope and Scope is its unique identifier.

## Validation and scope

- Passed the task-worktree guard at base `48376dfd88112f7f474abd53d2f916324f7aab14`.
- Read the RR-060 and RR-066 records and inspected the actual pinned SDK 4.8.1 init/build/pack source.
- Initialized and inspected an isolated local Global scaffold using `now-sdk init`; no application identity was invented.
- Consulted official ServiceNow release and developer documentation.
- Intentionally did **not** run `now-sdk install`, `--reinstall`, `now-sdk move`, update-set import, PDI mutation, browser test, companion registry regeneration, or accepted-scoped-app modification.
