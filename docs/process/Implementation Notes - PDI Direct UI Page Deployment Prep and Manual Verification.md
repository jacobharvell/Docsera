# Implementation Notes - PDI Direct UI Page Deployment Prep and Manual Verification

Date: 2026-07-02

Status: historical blocker note after Task 30.5

## Superseded Status

This note records the manual-record deployment blocker from the pre-SDK workflow.

The preferred runtime path is now the SDK-native pipeline documented in `docs/process/Implementation Notes - SDK Native UI Page Runtime Pipeline.md`.

## Purpose

Record the Task 30 deployment-prep findings for the React/Vite Direct UI Page runtime baseline.

This note captures:

- what the repo-side packaging path proves locally
- what generated files must be copied into ServiceNow
- which ServiceNow record types are involved
- why Codex did not complete live PDI record updates from this environment
- what Jacob must verify manually in the browser

This note summarizes repository behavior and deployment-prep findings only. Accepted product behavior remains in the Obsidian requirements notes.

## Repo-Verified Packaging Result

The packaging command completed successfully from the current `main` baseline:

- `npm run package:direct-ui-page`

The generated output exists under `output/direct-ui-page-baseline/`:

- `docsera-runtime.js`
- `docsera-runtime.css`
- `direct-ui-page-host.example.html`
- `manifest.json`

The manifest confirms the expected active runtime source tree:

- `sourcePackage`: `app/docsera-ui`

The generated host template is structurally safe for React mounting:

- `window.DOCSERA_RUNTIME_CONFIG` is defined before the runtime asset loads
- `<div id="docsera-root"></div>` appears in the body before the runtime script tag
- the runtime script tag is the last body child, so `mountDocseraApp()` runs after the mount node exists

## Generated Asset Handoff

The current generated files map to ServiceNow records as follows:

- `output/direct-ui-page-baseline/docsera-runtime.js`
  - target record type: `sys_ui_script`
  - intended API name: `x_82900_docsera.docsera_runtime_bootstrap`
  - expected served path: `/x_82900_docsera.docsera_runtime_bootstrap.jsdbx`

- `output/direct-ui-page-baseline/docsera-runtime.css`
  - target record type: `sys_attachment`
  - intended host: same-origin attachment-backed CSS asset on the target Direct UI Page record or equivalent scoped host record
  - expected served path shape: `/sys_attachment.do?sys_id=<DOCSERA_RUNTIME_CSS_ATTACHMENT_SYS_ID>`

- `output/direct-ui-page-baseline/direct-ui-page-host.example.html`
  - target record type: `sys_ui_page`
  - intended page host: the scoped Direct UI Page HTML field

- `output/direct-ui-page-baseline/manifest.json`
  - repo-side deployment reference only
  - not intended for direct instance import

## Recommended PDI Record Path

Based on the accepted Direct UI Page architecture and the earlier manual PDI proof, the next baseline should remain:

- JavaScript in a scoped UI Script
- CSS in a same-origin attachment-backed asset
- host HTML in a scoped Direct UI Page

The practical record types are:

- `sys_ui_script` for `docsera-runtime.js`
- `sys_attachment` for `docsera-runtime.css`
- `sys_ui_page` for `direct-ui-page-host.example.html`

If Jacob reuses the earlier spike page, the known host record and URL are:

- UI Page name: `docsera_standalone_host_spike`
- URL: `https://dev295482.service-now.com/x_82900_docsera_docsera_standalone_host_spike.do`

If that page is not reused, the same host pattern still applies:

- page route shape: `https://<instance>.service-now.com/x_82900_docsera_<ui_page_name>.do`

## PDI Deployment Attempt Result

PDI profile access is present locally:

- `snc version` reports `snc 1.1.3`
- `snc configure profile list` shows configured profiles including `dev295482`

However, the available CLI surface in this environment is still limited to:

- `ui-component deploy`
- `ui-component develop`
- `ui-component generate-update-set`

No repo-local automation or CLI command was found for safe record-level creation or update of:

- `sys_ui_page`
- `sys_ui_script`
- `sys_attachment`

Result:

- live PDI record deployment was not performed by Codex
- no instance records were changed in this task
- the deployment result is `blocked` at the record-update step, not at packaging

## Smallest Manual PDI Update Path

Jacob should use the generated output bundle and update the instance manually:

1. Run `npm run package:direct-ui-page`.
2. Open the Docsera scoped app in the PDI.
3. Create or update the scoped UI Script record so its script body matches `docsera-runtime.js`.
4. Attach `docsera-runtime.css` to the target UI Page record or another same-origin scoped host record.
5. Note the attachment `sys_id`.
6. Update the Direct UI Page HTML using `direct-ui-page-host.example.html`.
7. Replace `<DOCSERA_RUNTIME_CSS_ATTACHMENT_SYS_ID>` with the real attachment `sys_id`.
8. If the UI Page HTML field rejects `<!doctype html>`, remove only that first line before saving.
9. Open the Direct UI Page URL as an authenticated user in the target scope.

## Jacob Manual Browser Verification Checklist

### Open

- Preferred URL if reusing the known spike page:
  - `https://dev295482.service-now.com/x_82900_docsera_docsera_standalone_host_spike.do`
- Otherwise open the target scoped UI Page route:
  - `https://<instance>.service-now.com/x_82900_docsera_<ui_page_name>.do`

### Session / access assumption

- authenticated ServiceNow session
- Docsera app/page access that can read the scoped UI Page
- admin session is acceptable for this baseline verification

### Expected visible result

- page title: `Docsera Runtime Baseline`
- visible hero heading: `Direct UI Page host, React and Vite source, explicit packaging boundary.`
- visible callout: `Standalone scoped Direct UI Page`
- visible demo workspace card
- styling is visibly applied with the warm paper background and panel layout

### Console checks

- no `Docsera runtime mount node was not found.`
- no failed bootstrap or uncaught React/runtime error
- no missing asset error for the UI Script or CSS URL

### Network checks

- `/<scope>.docsera_runtime_bootstrap.jsdbx` returns `200`
- `/sys_attachment.do?sys_id=<runtime-css-sys-id>` returns `200`
- `/api/x_82900_docsera/docsera_host_spike/ping`
  - either returns `200` with payload data
  - or fails visibly without preventing the React shell from rendering

### DOM / page checks

- `#docsera-root` exists in the page DOM
- React content appears inside `#docsera-root`
- no UI Builder/native frame markers are required for the page to render:
  - `macroponent-root`
  - `sn-polaris-layout`
  - `now-appshell`

### Backend ping checks

- expected configured path: `/api/x_82900_docsera/docsera_host_spike/ping`
- acceptable pass states:
  - success card with payload JSON
  - visible failure message in the adaptor status card while the rest of the shell still renders
- unacceptable state:
  - blank page or bootstrap failure caused by ping behavior

### Failure evidence to capture

- screenshot of the rendered page or blank/error state
- screenshot of browser console errors
- screenshot of failed network requests for JS, CSS, or ping
- the exact UI Page name, UI Script API name, and CSS attachment `sys_id` used

## Recommendation

Keep the current split baseline:

- scoped UI Script for JavaScript
- attachment-backed CSS for same-origin styling
- scoped Direct UI Page for the host markup

That remains the best proven next baseline because it matches the earlier manual PDI asset-loading proof and the current generated host template.

## Remaining Deferred Gaps

- repo-driven publish automation for `sys_ui_page`, `sys_ui_script`, and `sys_attachment`
- final backend API auth and ACL policy
- live ServiceNow persistence instead of demo workspace seed data
- browser-automated PDI verification in this repo workflow
