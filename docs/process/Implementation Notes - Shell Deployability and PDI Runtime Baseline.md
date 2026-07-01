# Implementation Notes - Shell Deployability and PDI Runtime Baseline

Date: 2026-07-01

## Purpose

This note records the repo-side deployability baseline for `app/docsera-shell`.

It does not change accepted product behavior. The shell remains demo-backed client state until later wiring tasks land.

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
- `x-82900-docsera-shell` is now available for UI Builder placement because the deploy completed successfully.
- The repo still does not expose a live Docsera route/module/page record. The current shell remains a UI Builder component that must be placed on a runtime page manually.

## Current Manual Next Step

1. Place `x-82900-docsera-shell` on the target UI Builder runtime page and verify the shell mount.
2. If runtime still fails after placement, use `internal/runbooks/RUNTIME_EDITOR_DIAGNOSTICS.md` as the closest existing runtime triage sequence, adapting only the tag lookup to `x-82900-docsera-shell`.
