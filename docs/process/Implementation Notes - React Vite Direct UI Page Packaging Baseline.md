# Implementation Notes - React Vite Direct UI Page Packaging Baseline

Date: 2026-07-02

Status: historical fallback after Task 30.5

## Superseded Status

This note now describes the older manual packaging fallback only.

The preferred runtime path is documented in `docs/process/Implementation Notes - SDK Native UI Page Runtime Pipeline.md`.

## Purpose

Record the first durable repo-managed frontend source, build, and packaging baseline for Docsera's preferred standalone scoped Direct UI Page runtime.

This note summarizes repository behavior only. Accepted product requirements remain in the Obsidian vault.

## Active Runtime Baseline

- Active frontend source tree: `app/docsera-ui/`
- Preferred runtime host: standalone scoped Direct UI Page
- Preferred source stack at the time of this note: React + TypeScript + Vite
- Historical migration source: `app/docsera-shell/`
- Historical UI Builder / Next Experience runtime artifacts: paused and retained only as historical context

## Source Structure

The active runtime package is intentionally small and split by responsibility:

- `src/main.tsx`: thin entry point that imports global styles and mounts the app
- `src/bootstrap.tsx`: runtime bootstrap and React root creation
- `src/app/`: minimal runtime baseline UI
- `src/features/workspaces/`: explicit demo/seed content boundary
- `src/platform/servicenow/`: ServiceNow runtime/config and same-origin client adaptor
- `src/shared/types/`: shared TypeScript contracts for runtime and ping payload shapes

This keeps the runtime entry thin and avoids putting application UI or ServiceNow calls into one large entry file.

## Build And Packaging Path

Local frontend validation and build now use:

- `npm --prefix app/docsera-ui run validate`
- `npm --prefix app/docsera-ui run build`

Repo-level validation now includes:

- `npm run validate:frontend`
- `npm run validate`

The first durable packaging command is:

- `npm run package:direct-ui-page`

That command:

1. Builds `app/docsera-ui` with Vite.
2. Produces a stable runtime bundle at `app/docsera-ui/dist/docsera-runtime.js`.
3. Produces a stable stylesheet at `app/docsera-ui/dist/docsera-runtime.css`.
4. Writes a repeatable packaging bundle to `output/direct-ui-page-baseline/`.

The output bundle contains:

- `docsera-runtime.js`
- `docsera-runtime.css`
- `direct-ui-page-host.example.html`
- `manifest.json`

## Direct UI Page Asset-Loading Strategy

The current repo-side packaging strategy is:

- JavaScript is built as one browser-ready bundle intended for scoped UI Script delivery.
- CSS is built as one stylesheet intended for same-origin attachment-backed delivery.
- The Direct UI Page HTML stays small and only:
  - defines the mount node
  - defines `window.DOCSERA_RUNTIME_CONFIG`
  - links the CSS asset
  - loads the scoped UI Script URL

The example host template lives at:

- `output/direct-ui-page-baseline/direct-ui-page-host.example.html`

The example asset manifest lives at:

- `output/direct-ui-page-baseline/manifest.json`

## Runtime Behavior In Scope

The baseline runtime intentionally proves only the new host path:

- a React/Vite page renders through the Direct UI Page host
- the page states that it is the runtime baseline
- ServiceNow URL/session/backend assumptions are isolated behind `src/platform/servicenow/`
- demo workspace/page content is explicit seed data, not live persistence
- backend ping remains optional and spike-oriented

This baseline does not claim:

- final on-instance asset publishing automation
- final backend auth/ACL enforcement
- live workspace/page persistence
- editor integration

## Validation

Commands run for this baseline:

- `npm --prefix app/docsera-ui run test`
- `npm --prefix app/docsera-ui run build`
- `npm run package:direct-ui-page`

Repo-level validation should also use:

- `npm run validate`

## Manual PDI Verification

Use these steps when validating the Direct UI Page host in the PDI:

1. Build and package from the repo root:
   - `npm run package:direct-ui-page`
2. Create or update a scoped UI Script with `output/direct-ui-page-baseline/docsera-runtime.js`.
3. Attach `output/direct-ui-page-baseline/docsera-runtime.css` to the target Direct UI Page or equivalent same-origin asset record.
4. Update the Direct UI Page HTML with `output/direct-ui-page-baseline/direct-ui-page-host.example.html`.
5. Open the scoped Direct UI Page as an authenticated admin or other authorized user.

Practical deployment clarifications from Task 30:

- the generated host template is safe for React mounting because `#docsera-root` appears before the runtime script tag
- the generated host intentionally sets `window.DOCSERA_RUNTIME_CONFIG` before the runtime asset loads
- the current repo still does not automate updates to `sys_ui_page`, `sys_ui_script`, or `sys_attachment`
- the current local `snc` workflow in this repo exposes `ui-component` deployment only, so Direct UI Page runtime record updates remain a manual PDI step for now
- if the UI Page HTML field rejects `<!doctype html>`, remove only that first line before saving the host HTML
- replace `<DOCSERA_RUNTIME_CSS_ATTACHMENT_SYS_ID>` with the real attachment `sys_id` before saving the page

Expected result:

- the page renders a full-page Docsera-owned React shell
- the page states that it is the Direct UI Page runtime baseline
- no UI Builder/native-frame markers are required
- the configured backend ping either succeeds and shows payload data or stays visibly unconfigured
- the demo workspace card renders without claiming live ServiceNow persistence

For subjective UI changes, add a Jacob-facing manual review step that checks layout, interaction feel, drag/drop behavior, editor behavior, and visual polish against the accepted requirements or prototypes.

## Remaining Gaps

- The repo now has a repeatable build and packaging path, but not on-instance publish automation.
- The backend ping path still references the earlier spike endpoint until a real API surface replaces it.
- The bundle remains demo-data-backed until live ServiceNow adapters are implemented.
- Browser-visible PDI verification still depends on Jacob opening the page and checking console, network, and rendered output.

These gaps are the reason this path is now a fallback instead of the preferred deployment workflow.
