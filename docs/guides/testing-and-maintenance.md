# Testing and maintenance

This guide describes the current contributor checks for the active scoped runtime in `app/docsera-ui/`. It explains what each check proves; it does not replace the source-install procedure in [development setup](development-setup.md), the installation choices in [Installing Docsera](installing-docsera.md), or the runtime boundaries in the [architecture overview](../architecture/overview.md).

## Choose evidence proportional to the change

Start with the smallest focused test file or named suite that covers the behavior changed. Add adjacent suites when a change crosses a contract boundary: for example, a page-tree move can also affect page-model and workspace-state behavior. Use the full local validation command as a broader checkpoint, not as the only development loop.

Local tests cover isolated client, shared-contract, and server-contract behavior. The SDK build checks packaging and generated-module contracts. Installed-instance scripts check the installed artifact and service boundary. Live PDI testing establishes interactive behavior and visual acceptance. No one of these checks establishes general instance compatibility, upgrade safety, or release qualification.

Codex should select and run proportionate automated checks for implementation work, add or update regression coverage, and report what was intentionally omitted. Jacob performs live PDI/browser acceptance when runtime behavior, authorization, or visual interaction needs confirmation. Interactive browser automation is not a default contributor requirement.

The historical validation-area identifiers in process notes are planning categories, not executable suite names. Use the maintained suite manifest and package scripts below.

## Managed Vitest suites

`app/docsera-ui/scripts/test-suite-manifest.mjs` owns the assignment of every Vitest-managed test file to exactly one named suite. It deliberately excludes the standalone Node-native tests in `scripts/serviceNowSafeMarkupPlugin.test.mjs`, `scripts/verify-sdk-bundle-serialization.test.mjs`, and `scripts/verify-sdk-module-keys.test.mjs`. Run those with Node's test runner when they are relevant; they are not selected by a Vitest suite.

From the repository root, inspect or validate the manifest:

```powershell
npm --prefix app/docsera-ui run test:suites:list
npm --prefix app/docsera-ui run test:suites:check
```

Run one or more suites with the managed runner. The `--` is npm argument forwarding; suite names follow it:

```powershell
npm --prefix app/docsera-ui run test:suite -- editor-contract
npm --prefix app/docsera-ui run test:suite -- nav-tree page-model workspace-state
```

Convenience scripts exist for commonly selected suites, for example:

```powershell
npm --prefix app/docsera-ui run test:editor-interactions
npm --prefix app/docsera-ui run test:publishing-changes
npm --prefix app/docsera-ui run test:access-security
npm --prefix app/docsera-ui run test:shared-runtime
```

Use the manifest rather than this guide for the current suite inventory and file assignments. Practical selection examples include:

- Editor document/schema or Markdown work: `editor-contract`; add `reader-toc` or `editor-interactions` when the reader or editor host is affected.
- Workspace hierarchy work: `nav-tree` and `page-model`; add `workspace-state` for persisted projections, leases, or mutation authority.
- Publish, discard, or undo work: `publishing-changes`, plus `workspace-state` for server workflow changes.
- Role, capability, or scoped/Global boundary work: `access-security` and affected consumer suites.
- Shared runtime, bootstrap, stylesheet, or validation-runner work: `shared-runtime`, plus affected feature suites.

To run an individual Vitest-managed file while developing, use the managed full-test entrypoint and forward its Vitest arguments:

```powershell
npm --prefix app/docsera-ui run test -- src/shared/editor/document.test.ts
```

For a complete managed Vitest run, use:

```powershell
npm --prefix app/docsera-ui run test
```

When adding, renaming, or retiring a Vitest test, update the manifest and run `test:suites:check`. Do not silently leave a discovered file unassigned.

## Local managed validation

The scoped package's full local checkpoint is:

```powershell
npm --prefix app/docsera-ui run validate
```

It runs three stages sequentially and stops at the first failure, timeout, or interruption:

1. Managed Vitest
2. ServiceNow SDK build
3. Inline-runtime-CSS build verification

Each stage completes its scoped cleanup before the next begins. By default, managed Vitest uses a maximum of two workers, a minimum of one worker, and disabled file parallelism. `--workers <count>` sets the wrapper default; explicitly forwarded Vitest worker flags remain supported. The managed validation runner also accepts stage-specific overrides:

```powershell
npm --prefix app/docsera-ui run validate -- --test-timeout-ms 900000 --build-timeout-ms 600000 --css-timeout-ms 300000
```

Default limits are 15 minutes for Vitest, 10 minutes for the SDK build, and 5 minutes for CSS verification. The runner owns a run lock, excludes concurrent managed runs, and recovers a stale lock only when its recorded owner is safely shown to be dead or replaced. It handles interruption cooperatively, uses a watchdog for unexpected parent loss, and verifies process identity before cleaning up a managed stage tree. Do not delete locks manually, terminate all Node processes, or bypass these safeguards.

## Command reference

| Need | Command | Boundary |
| --- | --- | --- |
| Repository documentation validation | `npm run validate:docs` | Verifies the repository's current documentation contract and required Markdown references. It is not application validation. |
| Repository-wide baseline | `npm run validate` | Runs scoped frontend validation followed by documentation validation. |
| Focused UI tests | `npm --prefix app/docsera-ui run test:suite -- <suite> [<suite> ...]` | Managed Vitest files assigned by the suite manifest. |
| Complete scoped test run | `npm --prefix app/docsera-ui run test` | All Vitest-managed tests; no instance installation. |
| Full scoped local checkpoint | `npm --prefix app/docsera-ui run validate` | Vitest, SDK build, and inline-runtime-CSS verification; no PDI credentials required. |
| Scoped SDK build/contracts | `npm run build:sdk-ui-page` | Builds the scoped application and checks SDK module keys and bundle serialization. |
| Scoped installed-runtime check | `npm run verify:sdk-ui-page -- -- --auth-alias <sdk-auth-alias> --instance-url https://<instance>.service-now.com` | Requires a matching authenticated SDK alias, local build output, and installed scoped application. |
| Global companion check | `npm run verify:sdk-global-bridge -- -- --auth-alias <sdk-auth-alias>` | Requires instance authentication and a previously installed Global companion. |

For SDK source installation, the verified order, the Global friendly-URL ownership preflight, and the exact npm forwarding forms, follow [development setup](development-setup.md). Instance-dependent commands require an alias for an instance the contributor controls and appropriate installation permissions; never put credentials, tokens, aliases, instance-specific data, or private output in commits or handoffs.

Local tests and builds do not install Docsera or prove live ServiceNow behavior. The scoped runtime verifier checks local build output, the installed UI Page and bundle freshness, and an authenticated REST ping. The Global verifier checks installed bridge records, cross-scope privileges, and Global runtime modules. These checks are stronger packaging and boundary evidence, but cannot replace live PDI validation of authorization, scoped/Global interaction, or browser-specific rendering and interaction.

Documentation-only work normally needs Markdown-link and documentation validation, not application builds, installation, or PDI verification. The documentation validator verifies the current public documentation structure, 0.1.0 consumer-release references, and local Markdown links; it is not application validation.

## Regression and maintenance expectations

Coded behavior changes require new or appropriately updated regression coverage. A bug fix should include a test that would have caught the defect. Keep the coverage proportional to the changed behavior and its realistic nearby risks; update obsolete expectations when behavior intentionally changes, and never remove a failing test merely to obtain a passing run. Once a durable behavior is covered, consolidate redundant or temporary tests rather than preserving diagnostic scaffolding.

In an implementation handoff, state the tests added or updated, the commands run, the evidence those commands establish, and any intentionally omitted validation. Keep test assignments synchronized with the manifest, preserve SDK-generated module identity and build contracts, and keep tests and documentation aligned with accepted implementation behavior.

Use isolated task worktrees and preserve a clean, reviewable working state. Keep immutable consumer-release artifacts separate from development-generated output. Treat verification output as potentially sensitive: do not commit credentials, tokens, instance-specific information, or private data.

For the underlying runtime, deployment boundaries, and scoped/Global distinction, see the [ServiceNow runtime reference](../reference/servicenow-runtime.md). For source installation and authenticated verification prerequisites, return to [development setup](development-setup.md).
