# Docsera Repo, SDK, and Deployment Baseline

Date: 2026-06-29

## Purpose
This note records the current implementation baseline for the Docsera repository before product scaffolding begins.

It is a discovery snapshot, not a design decision record.

## Current Repo Structure

- Root repo is mostly documentation, runbooks, and a ServiceNow PoC under `poc/`.
- Public-facing docs live in `docs/`.
- Working ServiceNow guidance and validation notes live in `internal/`.
- The only executable app artifact currently present is `poc/tiptap-component/`.

Key paths:
- `README.md`
- `docs/decisions/ADR-0001-editor-architecture.md`
- `docs/process/Test Strategy and Validation Areas.md`
- `internal/runbooks/PDI_UI_COMPONENT_DEPLOYMENT.md`
- `internal/runbooks/RUNTIME_EDITOR_DIAGNOSTICS.md`
- `internal/qa/GATE2_BASELINE_VALIDATION.md`
- `poc/tiptap-component/`

## Confirmed ServiceNow Scope/App Information

- `now-ui.json` sets `scopeName` to `x_82900_odoc2`.
- `now-ui.json` registers one component: `x-82900-opendocs-tiptap-poc`.
- The UI Builder metadata labels it `Docsera Tiptap PoC`.
- The component is described as a feasibility spike for editable and preview Tiptap rendering.
- `package.json` names the package `docsera-tiptap-poc`.
- `pom.xml` uses artifact id `opendocs-tiptap-poc`.

The current naming is PoC-oriented and not yet aligned to a finalized product app shell.

## App Entry Point Pattern

- `src/index.js` only imports the component module.
- `src/docsera-tiptap-poc/index.js` defines a single custom element via `createCustomElement`.
- Rendering uses `@servicenow/ui-core` with `@servicenow/ui-renderer-snabbdom`.
- There is no app router, no multi-page shell, and no shell-level navigation scaffold yet.

Current state is a single component surface with internal edit/preview and light/dark toggles.

## Existing Client Component Structure

- The component owns its editor instance in a `WeakMap` keyed by host element.
- The editor is mounted into a shadow-DOM surface marked `data-editor="primary"`.
- Editor lifecycle is tied to `COMPONENT_RENDERED` and `COMPONENT_DISCONNECTED`.
- Local state currently tracks `mode`, `theme`, and `content`.
- `data-editor-error`, `data-editor-surface`, and `data-editor-prosemirror` are used as runtime diagnostics.

The structure is intentionally minimal and still PoC-shaped.

## Existing Data-Operation Pattern

- There is no ServiceNow table persistence yet.
- Content lives entirely in component state and ProseMirror document JSON.
- `dispatchTransaction` writes back to local state only.
- No server-side CRUD layer, record API, or draft/publish model exists in the repo yet.

This is the clearest gap before feature work begins.

## Existing Permission / Access Pattern

- No ACL, role, group, or ownership logic is present in the repo.
- No permission-aware UI branching exists in the current component.
- No server-side access-check pattern is implemented yet.

Access control is therefore still completely unscaffolded.

## Existing Design-System / Token Pattern

- Styling is local SCSS from `src/docsera-tiptap-poc/styles.scss`.
- The stylesheet imports `@servicenow/sass-kit/host`.
- The rest of the styling is hard-coded CSS values.
- No shared token set, design-system abstraction, or theme-variable layer is visible yet.

## Confirmed Local Commands

There is no repository-root script surface yet.

Confirmed existing command references:
- `npm run verify --if-present` is referenced in `pom.xml` as `node.verify_cmd`.
- `snc version`
- `snc configure profile list --profile <profile>`
- `snc ui-component deploy --profile <profile> --fetch-assets-from-instance`
- `snc ui-component deploy --profile <profile> --fetch-assets-from-instance --force`

Important note:
- `poc/tiptap-component/package.json` currently has no `scripts` block, so the referenced `verify` command is effectively a no-op unless future scaffolding adds it.

## Confirmed Deployment Process

The current PDI deployment workflow is documented in `internal/runbooks/PDI_UI_COMPONENT_DEPLOYMENT.md`:

1. Work from `C:\Dev\Docsera\poc\tiptap-component`
2. Verify CLI and profile:
   - `snc version`
   - `snc configure profile list --profile <profile>`
3. Deploy non-destructively:
   - `snc ui-component deploy --profile <profile> --fetch-assets-from-instance`
4. Use force only when overwrite or sync conflict requires it:
   - `snc ui-component deploy --profile <profile> --fetch-assets-from-instance --force`
5. Run runtime sanity probes from `internal/runbooks/RUNTIME_EDITOR_DIAGNOSTICS.md`

The retrospective in `poc/tiptap-component/GATE2_RETROSPECTIVE.md` confirms that deploy success alone is not considered runtime success.

## Validation Guidance

Validation guidance already exists and should be reused:
- `docs/process/Test Strategy and Validation Areas.md`
- `internal/runbooks/PDI_UI_COMPONENT_DEPLOYMENT.md`
- `internal/runbooks/RUNTIME_EDITOR_DIAGNOSTICS.md`
- `internal/qa/GATE2_BASELINE_VALIDATION.md`

Current validation model:
- use the smallest practical build/lint/type/test check available
- validate runtime mount behavior separately from deploy success
- use manual browser/PDI probes when automation is not practical

## Manual Verification Steps

Use these steps when local automation is unavailable or incomplete:

1. Open `C:\Dev\Docsera\poc\tiptap-component`.
2. Verify the CLI/profile baseline:
   - `snc version`
   - `snc configure profile list --profile <profile>`
3. Deploy the component:
   - `snc ui-component deploy --profile <profile> --fetch-assets-from-instance`
4. Open the target runtime page in the PDI and run the diagnostics from `internal/runbooks/RUNTIME_EDITOR_DIAGNOSTICS.md`.

Expected result:
- `hasHost=true`
- `hasSurface=true`
- `hasProseMirror=true`
- `editorError=null`

## Gaps and Risks Before Feature Implementation

- No app shell or routing scaffold exists yet.
- No ServiceNow persistence layer exists yet.
- No permission/ownership model exists yet.
- No shared design-system token layer exists yet.
- No repo-level standard build/lint/test commands exist yet.
- The current package/artifact naming still reads as a PoC, not a product baseline.
- Runtime validation still depends on the authenticated PDI and `snc` CLI being available locally.

## Recommended Next Implementation Task

Proceed with:

`Scaffolding — Docsera App Shell and Validation Baseline`

Recommended focus for that task:
- create the shell structure for the product app
- establish a repeatable repo-level validation command surface
- keep persistence and permission scaffolding explicit but minimal

## Blockers / Uncertainties

- No blocker prevents starting shell scaffolding now.
- The main uncertainty is how much of the current PoC should be retained versus renamed when the product shell is introduced.
- The repo still needs a deliberate decision on whether to standardize local validation commands before or during shell scaffolding.
