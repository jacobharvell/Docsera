docsera-app-shell
===============================================
Docsera product app shell scaffold

## Scope

- Real product-facing shell surface for Docsera.
- No workspace persistence, permissions, routing, page tree, or editor behavior yet.
- The closed PoC stays in `../../poc/tiptap-component/` as a reference artifact only.

## Shell structure

- `src/index.js` is the component entry point.
- `src/docsera-shell/index.js` registers `x-82900-docsera-shell`.
- `src/docsera-shell/styles.scss` defines the initial Docsera shell token layer and layout conventions.
- `now-ui.json` exposes the component to UI Builder.

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

1. Place `x-82900-docsera-shell` on a UI Builder runtime page.
2. Confirm the component renders a header, navigation rail, and main shell region.
3. Confirm the shell renders without editor or persistence errors.

Expected result:

- The component mounts successfully.
- The shell layout renders.
- No PoC editor behavior is required at this stage.

## Remaining gaps

- Workspace data model
- Group provisioning and access checks
- Page tree and routing
- Persistence and publishing
- Reader/editor feature work
