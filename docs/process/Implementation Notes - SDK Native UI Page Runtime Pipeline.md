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

## Preferred Commands

From the repository root:

- `npm run types:sdk-ui-page`
- `npm run build:sdk-ui-page`
- `npm run install:sdk-ui-page`

From `app/docsera-ui/` directly:

- `npm run types:sdk`
- `npm run build`
- `npm run install:sdk`
- `npm run transform:sdk -- --auth <alias>`

For explicit alias-based install and transform, prefer direct SDK commands from `app/docsera-ui/`:

- `npx @servicenow/sdk transform --auth <alias>`
- `npx @servicenow/sdk install --auth <alias>`

## Install Guardrails And Current Blocker

The repository intentionally blocks unsafe SDK installs today.

`app/docsera-ui/scripts/verify-sdk-install-prereqs.mjs` fails `npm run install:sdk` while `now.config.json` still carries the placeholder scope ID:

- `00000000000000000000000000000000`

This is intentional because the current environment does not have SDK auth configured and the repo has not yet synchronized the real Docsera application identity from the target instance.

Required follow-up before a real install:

1. Configure SDK auth for the target instance.
2. Synchronize the actual Docsera application metadata and scope identity with `now-sdk transform --auth <alias>`.
3. Re-run `now-sdk install --auth <alias>`.

The repository now includes `app/docsera-ui/scripts/initialize-sdk-auth.ps1` as a secure local helper for step 1. It prompts for the password at the terminal, pipes it to `now-sdk auth --add ... --password-stdin`, and never writes credentials into repo files.

The SDK 4.8.1 CLI stores auth records in the local OS keychain through `@napi-rs/keyring` using the `ServiceNow` service and `now-sdk` account. That storage is machine-local and reusable across sessions on the same workstation. The repo should still ignore any local `.now-sdk/` cache directory if one is materialized by the CLI on a given platform.

Verified local workflow on this branch:

1. Run `app/docsera-ui/scripts/initialize-sdk-auth.ps1` with the PDI instance URL, `docsera-pdi` alias, and `admin` username.
2. Confirm `npx @servicenow/sdk auth --list` shows `[docsera-pdi]`.
3. Synchronize app identity with `npx @servicenow/sdk transform --auth docsera-pdi`.
4. Update `app/docsera-ui/now.config.json` with the real `scopeId` from `sys_scope`.
5. Run `npm run build`.
6. Run `npx @servicenow/sdk install --auth docsera-pdi`.
7. Verify the installed UI page and REST ping using a locally created ServiceNow login session.

The REST ping handler must use `new GlideDateTime().getDisplayValue()` in scoped code. `gs.nowDateTime()` is rejected by the instance during runtime verification.

For the UI page, raw basic-auth fetches may still land on `session_timeout.do`; create a local login session and reuse its cookies when checking `x_82900_docsera_docsera_sdk_runtime.do`.

## Scope Identity Source Control

The real `scopeId` for `x_82900_docsera` should live in source control once synchronized from the target instance.

Reasoning:

- `now-sdk build` emits `dist/app/scope/sys_app_<scopeId>.xml` and references the same ID throughout update records.
- Leaving a placeholder or requiring per-machine local edits would make a fresh clone produce an invalid installation package by default.
- `scopeId` identifies the scoped app record, but it is not a secret.

Until the real value is synchronized, the placeholder `scopeId` remains an intentional blocker for `npm run install:sdk`.

## Manual Browser Verification After Install

Jacob should open:

- `https://<instance>.service-now.com/x_82900_docsera_docsera_sdk_runtime.do`

Expected visible result:

- the page title and hero copy reference the SDK runtime baseline
- the Direct UI Page shell renders with Docsera styling applied
- the runtime probe shows SDK-managed asset labels rather than manual UI Script or attachment placeholders
- the backend status card reports success for the ping endpoint when the install and session are valid

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
