# Docsera

Docsera is a ServiceNow-scoped documentation platform focused on a polished reader experience and a block-based authoring workflow.

## Repo surface

- `docs/decisions/` contains public architectural decisions and rationale.
- `app/docsera-shell/` is the reusable Docsera shell scaffold and asset layer.
- `docs/process/Requirements Source Map.md` records the Obsidian requirement source map.
- `docs/process/Implementation Notes - Workspace Data Model and Group Provisioning.md` records the workspace foundation contract.
- `docs/process/Implementation Notes - Workspace Capability Checks.md` records the workspace access contract.
- `docs/process/Implementation Notes - Page Data Model and Slug Rules.md` records the page foundation contract.
- `docs/process/Implementation Notes - Editor Host Contract.md` records the durable editor-host boundary for future ProseMirror/TipTap integration.
- `docs/process/Implementation Notes - Live Edit Editor Host Boundary.md` records the productized page-level Live/Edit shell boundary and child editor host scaffold.
- `docs/decisions/ADR-0002-direct-ui-page-host.md` records the preferred runtime host decision.
- `poc/tiptap-component/` is a closed historical PoC reference and should not be renamed into the product shell.

## Internal working material

The following paths are intentionally excluded from the public repo and are used only for local development and validation:

- `AGENTS.md`
- `internal/`
- `poc/`

## Current direction

- ServiceNow-native scoped app
- Standalone scoped Direct UI Page host
- Scoped ServiceNow-hosted assets and same-origin backend calls
- Workspace data model and native group provisioning
- Page data model, hierarchy, and slug rules
- Tiptap / ProseMirror-oriented editor foundation
- Block-based authoring with Markdown/source support

## Validation

From the repository root:

```powershell
npm run validate
```

Additional commands:

- `npm run validate:shell`
- `npm run validate:docs`

The shell package README at `app/docsera-shell/README.md` documents the local and PDI validation flow for the current scaffold.
