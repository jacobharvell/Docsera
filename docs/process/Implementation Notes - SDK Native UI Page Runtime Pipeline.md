# Implementation Notes - SDK Native UI Page Runtime Pipeline

Date: 2026-07-02

Status: implementation note

## Purpose

Record the preferred ServiceNow SDK-native runtime pipeline for Docsera's standalone scoped Direct UI Page host.

This note summarizes repository behavior only. Accepted product behavior remains in the Obsidian requirements notes.

## Preferred Runtime Package

The active runtime package remains `app/docsera-ui/`, but it now follows the SDK-native structure:

- `src/client/`: React client entry, styles, and browser-facing runtime code
- `src/fluent/`: Fluent metadata such as `UiPage` and `RestApi`
- `src/server/`: server-side handler modules referenced by Fluent metadata
- `now.config.json`: SDK application identity and server TypeScript entry
- `now.prebuild.mjs`: SDK front-end bundling hook

This keeps `app/docsera-ui` as the active source tree while aligning it to the supported ServiceNow SDK layout instead of introducing a second runtime package.

## Workspace Shell Baseline

The SDK-native UI Page now renders a prototype-aligned Docsera workspace skeleton instead of a proof-oriented runtime page.

The shell is intentionally demo-backed and reads from explicit seed data in `src/client/features/workspaces/`:

- top application/workspace header
- workspace icon and name in the header
- page-tree sidebar/navigation
- selected page content surface
- right-side table of contents/context column
- compact developer-status disclosure for runtime diagnostics

This keeps the runtime visually useful while preserving the future boundaries:

- no live persistence
- no page or workspace CRUD
- no editor integration
- no publishing workflow
- no permissions enforcement beyond the existing runtime probe

The REST ping remains a secondary host/platform probe. It verifies same-origin access and authenticated instance wiring, but it is not the product data model and should not dominate the visible shell.

## Runtime Artifacts Proven By Local Build

`npm --prefix app/docsera-ui run build` now runs `now-sdk build`.

The local build emits:

- `dist/static/index.html`
- `dist/static/main.jsdbx`
- `dist/app/update/sys_ui_page_*.xml`
- `dist/app/update/sys_ux_lib_asset_*.xml`
- `dist/app/update/sys_ws_definition_*.xml`
- `dist/app/update/sys_ws_operation_*.xml`

From the generated output, the SDK-native path is proven locally to compile:

- a classic/scoped `sys_ui_page` host
- SDK-managed static frontend assets through `sys_ux_lib_asset`
- a same-origin scripted REST surface through `sys_ws_definition` and `sys_ws_operation`

## Fluent Metadata Baseline

The baseline Fluent runtime definitions are:

- UI Page endpoint: `x_82900_docsera_docsera_sdk_runtime.do`
- Scripted REST base URI: `/api/x_82900_docsera/docsera_runtime`
- Scripted REST probe route: `/api/x_82900_docsera/docsera_runtime/ping`

The current React client imports CSS in code and is bundled by the SDK-managed Rollup path. The intended architecture is no longer raw `sys_attachment` CSS links or pasted `sys_ui_script` JavaScript.

The repo-side prebuild wrapper normalizes SDK explicit asset keys to forward-slash paths before registration. This avoids a Windows-only failure mode where `styles\global.css` can be emitted into the JavaScript bundle, producing a `sys_ux_theme_asset` lookup that does not match the installed `styles/global.css` record and results in a CSS `404`.

Browser-side REST probes from the classic ServiceNow shell must also send the current ServiceNow user token. The runtime client now reads `g_ck` or `NOW.user.token` from the current window and same-origin parent window, then forwards that value as `X-UserToken` on the ping request so the authenticated browser shell does not produce a false `401`.

## Preferred Commands

From the repository root:

- `npm run types:sdk-ui-page`
- `npm run build:sdk-ui-page`
- `npm run install:sdk-ui-page`
- `npm run verify:sdk-ui-page`

From `app/docsera-ui/` directly:

- `npm run types:sdk`
- `npm run build`
- `npm run install:sdk`
- `npm run verify:sdk-runtime`
- `npm run transform:sdk -- --auth <alias>`

For explicit alias-based install and transform, prefer direct SDK commands from `app/docsera-ui/`:

- `npx @servicenow/sdk transform --auth <alias>`
- `npx @servicenow/sdk install --auth <alias>`

## Reusable Runtime Verification

`npm run verify:sdk-runtime` in `app/docsera-ui/` and the repo-level wrapper `npm run verify:sdk-ui-page` provide a repeatable HTTP-only verification command for the installed SDK-native runtime.

The command reads the stored SDK auth alias from the local `ServiceNow` / `now-sdk` keyring entry, opens a local authenticated session with the same login flow used by the SDK CLI, and verifies:

- the auth alias exists
- the Direct UI Page returns `200` and does not redirect to `session_timeout.do`
- the page HTML contains the `docsera-root` mount node, the runtime title/config marker, and the SDK-managed `main.jsdbx` reference
- the SDK-managed `main.jsdbx` asset resolves with `200` and includes the `#docsera-root` selector
- the SDK-managed runtime CSS asset referenced by `main.jsdbx` resolves with `200` and contains Docsera style markers
- the scripted REST ping returns authenticated JSON with `scope: x_82900_docsera` and `status: ok`

This command proves install integrity, endpoint accessibility, HTML markers, asset reachability, and REST ping behavior.

This command does not execute the React app in a browser. It does not prove client-side rendering, CSS layout, runtime console cleanliness, or React bootstrap error handling.

Use a browser smoke test separately when visual rendering or client-side runtime behavior becomes the thing that needs to be proven. For this shell-alignment baseline, the unit tests in `app/docsera-ui/test/App.test.tsx` cover the workspace skeleton, page selection, ToC presence, and ping failure tolerance.

## Install Guardrails And Current Workflow

`app/docsera-ui/scripts/verify-sdk-install-prereqs.mjs` still guards `npm run install:sdk` against an incorrect or fresh setup by refusing to install if `now.config.json` contains the placeholder scope ID:

- `00000000000000000000000000000000`

The current repo baseline commits the real `scopeId` for `x_82900_docsera`, so the guard now serves as a safety check rather than an active blocker in the checked-in state.

Local reusable SDK auth alias `docsera-pdi` is configured on Jacob's workstation through the OS keychain-backed SDK auth store used by `@servicenow/sdk`.

Fresh machines still need to establish SDK auth before transform/install/verify. The secure local helper remains:

- `app/docsera-ui/scripts/initialize-sdk-auth.ps1`

It prompts for the password at the terminal, pipes it to `now-sdk auth --add ... --password-stdin`, and never writes credentials into repo files.

The SDK 4.8.1 CLI stores auth records in the local OS keychain through `@napi-rs/keyring` using the `ServiceNow` service and `now-sdk` account. That storage is machine-local and reusable across sessions on the same workstation. The repo should still ignore any local `.now-sdk/` cache directory if one is materialized by the CLI on a given platform.

Normal current workflow:

1. `npm run build:sdk-ui-page`
2. `npm run install:sdk-ui-page`
3. `npm run verify:sdk-ui-page`

Explicit alias workflow remains available when the machine does not have a default SDK auth alias selected:

- `npx @servicenow/sdk transform --auth <alias>`
- `npx @servicenow/sdk install --auth <alias>`
- `npm run verify:sdk-runtime -- --auth-alias <alias>`

The REST ping handler must use `new GlideDateTime().getDisplayValue()` in scoped code. `gs.nowDateTime()` is rejected by the instance during runtime verification.

For the UI page, raw basic-auth fetches may still land on `session_timeout.do`; create a local login session and reuse its cookies when checking `x_82900_docsera_docsera_sdk_runtime.do`.

## Scope Identity Source Control

The real `scopeId` for `x_82900_docsera` lives in source control and is part of the checked-in runtime baseline.

Reasoning:

- `now-sdk build` emits `dist/app/scope/sys_app_<scopeId>.xml` and references the same ID throughout update records.
- Leaving a placeholder or requiring per-machine local edits would make a fresh clone produce an invalid installation package by default.
- `scopeId` identifies the scoped app record, but it is not a secret.

The placeholder `scopeId` remains only a guard condition for incorrect or fresh setup, not the current repo baseline.

## Manual Browser Verification After Install

Jacob should open:

- `https://<instance>.service-now.com/x_82900_docsera_docsera_sdk_runtime.do`

Expected visible result:

- the Direct UI Page renders a Docsera workspace skeleton rather than a runtime smoke page
- the header shows the workspace icon/name without long description copy
- the left page tree, main content well, and right table of contents are visible
- runtime diagnostics are compact and secondary
- the backend probe can fail without making the workspace shell appear broken

Console checks:

- no `Docsera runtime mount node was not found.`
- no uncaught React/runtime bootstrap error
- no failed `main.jsdbx` asset request

Network checks:

- `/uxasset/externals/x_82900_docsera/main.jsdbx?...` returns `200`
- `/api/x_82900_docsera/docsera_runtime/ping` returns `200`

DOM/root checks:

- `#docsera-root` exists
- React content mounts inside `#docsera-root`

## Historical Fallback

`npm run package:direct-ui-page` remains only as the older manual handoff bundle for comparison or rollback investigation.

That path is now historical because it still assumes manual `sys_ui_page` / `sys_ui_script` / attachment publishing, which is no longer the preferred architecture.
