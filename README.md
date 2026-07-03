# Docsera

Docsera is a ServiceNow-scoped documentation platform focused on a polished reader experience and a block-based authoring workflow.

## Repo surface

- `docs/decisions/` contains public architectural decisions and rationale.
- `app/docsera-ui/` is the active ServiceNow SDK-native runtime package for the standalone Direct UI Page host.
- `app/docsera-shell/` is the historical shell scaffold and reusable product/domain logic retained for migration into the accepted runtime direction.
- `docs/process/Requirements Source Map.md` records the Obsidian requirement source map.
- `docs/process/Implementation Notes - SDK Native UI Page Runtime Pipeline.md` records the preferred SDK-native build and install path for the active runtime.
- `docs/process/Implementation Notes - React Vite Direct UI Page Packaging Baseline.md` records the older manual packaging fallback that is now historical.
- `docs/process/Implementation Notes - Workspace Data Model and Group Provisioning.md` records the workspace foundation contract.
- `docs/process/Implementation Notes - Workspace Capability Checks.md` records the workspace access contract.
- `docs/process/Implementation Notes - Page Data Model and Slug Rules.md` records the page foundation contract.
- `docs/process/Implementation Notes - Editor Host Contract.md` records the durable editor-host boundary for future ProseMirror/TipTap integration.
- `docs/process/Implementation Notes - Live Edit Editor Host Boundary.md` records the productized page-level Live/Edit shell boundary and child editor host scaffold.
- `docs/decisions/ADR-0002-direct-ui-page-host.md` records the preferred runtime host decision.
- `docs/decisions/ADR-0003-frontend-stack.md` records the preferred frontend source/build stack decision.
- `poc/tiptap-component/` is a closed historical PoC reference and should not be renamed into the product shell.

## Internal working material

The following paths are intentionally excluded from the public repo and are used only for local development and validation:

- `AGENTS.md`
- `internal/`
- `poc/`

## Current direction

- ServiceNow-native scoped app
- Standalone scoped Direct UI Page host
- React + TypeScript frontend source compiled through ServiceNow SDK / Fluent
- Historical UI Builder / Next Experience scaffolding retained only as reference evidence
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

- `npm run validate:frontend`
- `npm run validate:shell`
- `npm run validate:docs`
- `npm run build:sdk-ui-page`
- `npm run types:sdk-ui-page`
- `npm run install:sdk-ui-page`

Explicit alias-based SDK install from `app/docsera-ui/`:

- `npx @servicenow/sdk transform --auth <alias>`
- `npx @servicenow/sdk install --auth <alias>`

Historical fallback:

- `npm run package:direct-ui-page`

The active runtime package README lives at `app/docsera-ui/README.md`.
The historical shell package README at `app/docsera-shell/README.md` documents the retained migration scaffold.
