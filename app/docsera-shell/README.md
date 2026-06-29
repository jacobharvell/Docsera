docsera-app-shell
===============================================
Docsera product app shell scaffold

## Scope

- Real product-facing shell surface for Docsera.
- Workspace domain foundation now exists in `src/workspaces/`.
- My Workspaces launcher and self-service workspace creation now live in the shell.
- Workspace routing remains a shell boundary placeholder until the reader shell lands.
- The closed PoC stays in `../../poc/tiptap-component/` as a reference artifact only.

## Shell structure

- `src/index.js` is the component entry point.
- `src/docsera-shell/index.js` registers `x-82900-docsera-shell`.
- `src/workspaces/workspace-domain.js` contains the workspace slug and provisioning contract.
- `src/pages/page-domain.js` contains the page ownership, ordering, and slug contract.
- `src/docsera-shell/styles.scss` defines the initial Docsera shell token layer and layout conventions.
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

1. Open the shell and confirm the My Workspaces header, search bar, and list render.
2. Confirm active workspaces with admin/editor capability appear and read-only or inactive workspaces do not.
3. Open a workspace row and confirm the shell boundary path updates to `/docsera/:workspaceSlug`.
4. Create a workspace from the modal with a name and optional description.
5. Confirm the new workspace is added to the list and becomes the selected workspace.
6. Confirm the creator is added to the generated Admin group when the PDI provisioning wiring is live.
7. Confirm settings entry points are only visible when the current user has Admin capability for that workspace.

Expected result:

- The workspace list is filtered to active authoring/admin workspaces.
- Search and the no-results state behave as expected.
- Workspace creation preserves the name, description, default icon, and slug behavior.
- The shell still mounts successfully if you run the optional runtime smoke check.

## Remaining gaps

- Live ServiceNow table persistence wiring
- Full workspace shell routing and reader mode
- Page tree and editor feature work
