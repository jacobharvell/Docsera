docsera-app-shell
===============================================
Docsera product app shell scaffold

## Scope

- Real product-facing shell surface for Docsera.
- Workspace domain foundation now exists in `src/workspaces/`.
- No My Workspaces UI, routing, page tree, or editor behavior yet.
- The closed PoC stays in `../../poc/tiptap-component/` as a reference artifact only.

## Shell structure

- `src/index.js` is the component entry point.
- `src/docsera-shell/index.js` registers `x-82900-docsera-shell`.
- `src/workspaces/workspace-domain.js` contains the workspace slug and provisioning contract.
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
- there is no custom workspace membership table

The scoped role names used by the domain contract are documented in `docs/process/Workspace Data Model and Group Provisioning.md`.

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

1. Create a workspace through the intended ServiceNow create flow.
2. Confirm the workspace slug is generated from the workspace name.
3. Create a second workspace with the same name and confirm the slug is suffixed silently.
4. Confirm the generated Admin and Editor groups exist.
5. Confirm the workspace record stores the Admin and Editor group sys_ids.
6. Confirm the workspace creator is a member of the Admin group.
7. Place `x-82900-docsera-shell` on a UI Builder runtime page if you want to confirm the shell still mounts.

Expected result:

- The workspace model persists the expected identity fields.
- Group provisioning follows the documented naming rules.
- The creator lands in the Admin group.
- The shell still mounts successfully if you run the optional runtime smoke check.

## Remaining gaps

- Workspace UI and access checks
- Page tree and routing
- Persistence and publishing
- Reader/editor feature work
