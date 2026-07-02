# Implementation Notes - UI Builder Runtime Baggage Cleanup

Date: 2026-07-02

Status: implementation note

## Purpose

Record the repository cleanup that followed the accepted runtime pivot to:

- standalone scoped Direct UI Page hosting from `docs/decisions/ADR-0002-direct-ui-page-host.md`
- React + TypeScript + Vite as the preferred frontend source/build stack from `docs/decisions/ADR-0003-frontend-stack.md`

This note summarizes repo-side cleanup only. It does not reopen the paused UI Builder / Next Experience runtime path.

## Architecture baseline used

- Preferred runtime host: standalone scoped Direct UI Page
- Preferred frontend source/build stack: React + TypeScript + Vite
- ServiceNow remains responsible for scoped app packaging, auth/session, ACLs, records, and backend APIs
- Remaining UI Builder artifacts are historical evidence or reusable migration source only

## Removed as dead runtime baggage

- `app/docsera-shell/now-ui.json` was removed from the active shell package root so the package no longer presents UI Builder registration metadata as current runtime packaging.
- Shell validation no longer treats active UI Builder registration metadata as a required package baseline.
- Package metadata no longer advertises the shell as a `Next Experience UI Component`.

## Quarantined or marked historical

- The old UI Builder metadata now lives under `app/docsera-shell/historical/ui-builder/now-ui.json`.
- `app/docsera-shell/historical/ui-builder/README.md` classifies that metadata as historical evidence only.
- `app/docsera-shell/README.md` now explicitly marks the shell package as historical scaffolding and migration source material.
- `docs/process/Docsera Repo, SDK, and Deployment Baseline.md` now identifies its UI-component deployment guidance as historical context rather than the preferred runtime path.

## Intentionally kept

- `app/docsera-shell/src/workspaces/` domain and capability logic
- `app/docsera-shell/src/pages/` page model, editor-host boundary, and page-shell helpers
- `app/docsera-shell/src/docsera-shell/index.js` and related styles as reusable shell/product behavior reference
- Historical deployability and spike notes under `docs/process/` that explain why the runtime pivot happened

## Why these parts were kept

- They preserve durable workspace and page contracts that still matter after the runtime pivot.
- They preserve editor-host and shell behavior that can be mined during a future React + TypeScript + Vite migration.
- They retain evidence of the paused UI Builder path without letting that path look current.

## Remaining migration work

- Re-author the retained shell/product behavior into the future React + TypeScript + Vite frontend source tree.
- Define the durable ServiceNow packaging target for built static assets loaded by the Direct UI Page.
- Replace the retained custom-element runtime scaffolding once equivalent React/Vite runtime code exists.

## Validation results

- `npm run validate:docs`
- `npm run validate`
- `npm run validate:shell`
- `npm --prefix app/docsera-shell run verify`

All commands passed after the cleanup.
