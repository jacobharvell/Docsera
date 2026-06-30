docsera-app-shell
===============================================
Docsera product app shell scaffold

## Scope

- Real product-facing shell surface for Docsera.
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
- `src/docsera-shell/index.js` now includes the local page-creation modal and page-tree selection flow.
- `src/docsera-shell/styles.scss` defines the Docsera shell token layer and launcher / reader layout conventions.
- `now-ui.json` exposes the component to UI Builder.

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

The scoped role names used by the domain contract are documented in `docs/process/Workspace Data Model and Group Provisioning.md`.
The capability-check rules and adapter boundaries are documented in `docs/process/Workspace Capability Checks.md`.
The page persistence, hierarchy, slug, and draft/published rules are documented in `docs/process/Page Data Model and Slug Rules.md`.

## Local validation

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

```powershell
cd C:\Dev\Docsera\app\docsera-shell
snc version
snc configure profile list --profile <profile>
snc ui-component deploy --profile <profile> --fetch-assets-from-instance
```

1. Open the shell and confirm the workspace reader header, page tree, breadcrumbs, and ToC render.
2. Confirm the active workspace icon and name render in the header and the workspace short description does not.
3. Confirm the My Workspaces switcher entry point returns to the launcher surface.
4. Select a page in the tree and confirm the visible content, breadcrumbs, ToC, and route target update.
5. Toggle the navigation collapse and theme controls to confirm browser-side shell state updates.
6. If your role grants authoring access, create a root page from the shell and confirm the tree updates, the page is selected, and the route target changes to `/docsera/:workspaceSlug/:pageSlug`.
7. If your role grants authoring access, create a child page from an existing row and confirm it inherits the selected workspace and parent page.
8. Use the My Workspaces surface to create a workspace from the modal with a name and optional description.
9. Confirm the new workspace is added to the list and becomes the selected workspace.
10. Confirm the creator is added to the generated Admin group when the PDI provisioning wiring is live.

Expected result:

- The launcher list is filtered to active authoring/admin workspaces.
- Reader mode shows the active workspace identity, page tree, breadcrumbs, and ToC.
- Authoring roles can create root and child pages without a full refresh.
- Page selection updates the reader content without a full refresh.
- Workspace creation preserves the name, description, default icon, and slug behavior.
- The shell still mounts successfully if you run the optional runtime smoke check.

## Remaining gaps

- Live ServiceNow table persistence wiring
- Page editor, autosave, settings overlay, and publish workflow
