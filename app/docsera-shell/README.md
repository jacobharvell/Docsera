docsera-app-shell
===============================================
Docsera product app shell scaffold

## Scope

- Real product-facing shell surface for Docsera.
- Preferred runtime host is the standalone scoped Direct UI Page, not UI Builder placement.
- Workspace domain foundation now exists in `src/workspaces/`.
- My Workspaces launcher and self-service workspace creation now live in the shell.
- Workspace reader mode now lives in the shell, with My Workspaces as the launcher entry point.
- Workspace authoring controls now include MVP page creation and page-tree updates inside the shell.
- The closed PoC stays in `../../poc/tiptap-component/` as a reference artifact only.

## Shell structure

- `src/index.js` is the component entry point.
- `src/docsera-shell/index.js` registers `x-82900-docsera-shell`.
- `src/workspaces/workspace-domain.js` contains the workspace slug and provisioning contract.
- `src/pages/page-domain.js` contains the page ownership, ordering, and slug contract.
- `src/docsera-shell/index.js` now includes the local page-creation modal, page-tree selection flow, and the live/edit page-mode boundary.
- `src/pages/page-editor-host.js` owns the dedicated child editor host for ProseMirror runtime lifecycle.
- The thin body editor/autosave baseline is ProseMirror-first by design; TipTap integration remains deferred as an explicit future boundary.
- `src/docsera-shell/styles.scss` defines the Docsera shell token layer and launcher / reader layout conventions.
- `now-ui.json` still carries the historical UI Builder component registration, but it is no longer the preferred runtime entry point.

## Workspace foundation

Workspace identity and provisioning behavior are defined in `src/workspaces/workspace-domain.js`.

Key rules:

- workspace names generate a unique slug / URL key
- duplicate slugs silently suffix with `-2`, `-3`, and so on
- workspace slugs are URL-facing and stay hyphenated
- workspace group keys are separate from slugs and use underscore-based names
- each workspace creates native Admin and Editor groups
- group names use the `Docsera_<Workspace_Key>_<Role>` pattern
- the workspace creator is added to the Admin group
- workspaces always carry an icon, using the Docsera default icon when none is supplied
- Admin and Editor group sys_ids are stored on the workspace record
- workspace capability checks are centralized in `src/workspaces/workspace-capabilities.js`
- there is no custom workspace membership table

My Workspaces list, search, settings gating, and launcher-boundary helpers are defined in `src/workspaces/workspace-launcher.js`.

Accepted product requirements stay in the Obsidian vault; the repo source map is `docs/process/Requirements Source Map.md`.
The scoped role names used by the domain contract are documented in `docs/process/Implementation Notes - Workspace Data Model and Group Provisioning.md`.
The capability-check rules and adapter boundaries are documented in `docs/process/Implementation Notes - Workspace Capability Checks.md`.
The My Workspaces launcher boundary is documented in `docs/process/Implementation Notes - My Workspaces Launcher.md`.
The page persistence, hierarchy, slug, and draft/published rules are documented in `docs/process/Implementation Notes - Page Data Model and Slug Rules.md`.

## Local validation

From a clean checkout, install the shell dependencies first:

```powershell
npm --prefix app/docsera-shell install
```

From `C:\Dev\Docsera`:

```powershell
npm run validate
```

To validate only the shell package:

```powershell
npm run validate:shell
```

To validate only the repo documentation references:

```powershell
npm run validate:docs
```

## Manual PDI validation

The preferred runtime host validation now follows the Direct UI Page spike notes in `docs/process/Implementation Notes - Standalone Scoped UI Page Host Spike.md` and `docs/process/Implementation Notes - Direct UI Page Assets and Backend Ping Spike.md`.

Use the PDI page URL documented there, then confirm:

1. The page renders as a full-viewport Docsera-owned shell.
2. No `macroponent-root`, `sn-polaris-layout`, or `now-appshell` markers are present.
3. Scoped JavaScript and CSS load from instance-hosted assets.
4. Same-origin backend access works when the backend ping is configured.
5. The shell state and workspace/page behaviors still render correctly once the host is wired to this package.

Expected result:

- local validation still fails early if the shell dependency tree or `@servicenow/sass-kit/_host.scss` is missing
- the Direct UI Page host renders without UI Builder/native-frame markers
- instance-hosted JS and CSS load successfully
- same-origin backend access is available when configured
- the page and shell behaviors remain stable while the host runs outside UI Builder

## Remaining gaps

- Live ServiceNow table persistence wiring for page body saves
- Publish workflow
