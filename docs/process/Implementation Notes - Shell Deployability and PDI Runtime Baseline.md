# Implementation Notes - Shell Deployability and PDI Runtime Baseline

Date: 2026-07-01

## Purpose

This note records the repo-side deployability baseline for `app/docsera-shell`.

It does not change accepted product behavior. The shell remains demo-backed client state until later wiring tasks land.

This note is retained as historical UI Builder component baseline context. The preferred runtime host later moved to the standalone Direct UI Page and is documented in `docs/decisions/ADR-0002-direct-ui-page-host.md`.

## Durable Repo Baseline

- `app/docsera-shell/package.json` now pins `@servicenow/sass-kit` to `19.8.2-ecd` instead of floating on `latest`.
- `app/docsera-shell/package-lock.json` is now part of the repo so a normal checkout can resolve the same shell dependency tree used for deploy validation.
- `npm --prefix app/docsera-shell run verify` now fails early when:
  - `app/docsera-shell/package-lock.json` is missing
  - the shell dependency tree is not installed cleanly
  - `node_modules/@servicenow/sass-kit/_host.scss` is missing

This keeps the known Sass/import blocker in local validation instead of discovering it during `snc ui-component deploy`.

## Verified Command Baseline

From `C:\Dev\Docsera`:

```powershell
npm --prefix app/docsera-shell install
npm --prefix app/docsera-shell run verify
npm run validate:docs
npm run validate
```

From `C:\Dev\Docsera\app\docsera-shell`:

```powershell
snc version
snc configure profile list
snc ui-component deploy --profile dev295482 --fetch-assets-from-instance
```

Observed result:

- local validation passed
- the ServiceNow CLI completed the local webpack build and deployed `x-82900-docsera-shell` successfully after the PDI was awakened
- the deploy created the component and associated assets on `dev295482`
- `snc configure profile list` shows both `dev295482` and `dev376586` configured with basic auth and JSON output

## Runtime Mount Status

- Runtime mount was not verified in this task run.
- `x-82900-docsera-shell` is now available as historical component scaffolding because the deploy completed successfully.
- The repo still does not expose a live Docsera route/module/page record. The preferred runtime host is now the Direct UI Page proof path, not a UI Builder placement.

## Runtime Placement Finding

- The deploy created the component and toolbox records, plus the `sys_ux_macroponent` wrapper for `Docsera My Workspaces`.
- No repo-visible Docsera `sys_ux_page_registry` or `sys_ux_app_route` record exists yet.
- The minimal runtime placement for the preferred architecture is the standalone Direct UI Page proof path documented in the spike notes.
- The instance already exposes UI Builder routes such as `build/ui` and `builder/ui`, but those are the builder entry points, not the preferred Docsera runtime route.
- In this environment, browser-style probing of the UI Builder route still fell back to `session_timeout.do`, so the older host path could not be confirmed here.

## Current Manual Next Step

1. Use the Direct UI Page host proof notes to validate the preferred runtime host.
2. Treat the UI Builder deployment path as historical context unless a later cleanup or repurposing task explicitly reopens it.
