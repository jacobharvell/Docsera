# Docsera Agent and Tooling Map

Date: 2026-07-04

## Purpose

This short map points agents to the current source of truth for ServiceNow SDK work in this repo.

## Active Runtime

- `app/docsera-ui/` is the active runtime package.
- `app/docsera-ui/README.md` is the package-level workflow reference.
- `app/docsera-ui/now.config.json` carries the SDK app identity and server TypeScript entry.

## SDK Workflow

- Use `npx @servicenow/sdk --help` to inspect available commands.
- Use `npx @servicenow/sdk explain <topic> --peek --format=raw` before reading full SDK docs.
- Use `npx @servicenow/sdk transform --auth <alias>` and `npx @servicenow/sdk install --auth <alias>` for direct SDK-driven instance workflows.
- Use the repo scripts in `package.json` when you want a stable wrapper around the same SDK path.

## Validation

- `npm run validate` is the repo-level baseline.
- `npm --prefix app/docsera-ui run build` and `npm --prefix app/docsera-ui run verify:sdk-runtime` are the active runtime checks.
- `docs/process/Implementation Notes - SDK Native UI Page Runtime Pipeline.md` records the preferred SDK-native runtime pipeline.

## Guardrails

- Do not treat `snc`-based deployment guidance as the preferred path for the active runtime.
