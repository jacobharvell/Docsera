# Docsera

Docsera is a ServiceNow-scoped documentation platform focused on a polished reader experience and a block-based authoring workflow.

## Repo surface

- `docs/decisions/` contains public architectural decisions and rationale.
- `app/docsera-shell/` is the real Docsera product shell scaffold.
- `poc/tiptap-component/` is a closed historical PoC reference and should not be renamed into the product shell.

## Internal working material

The following paths are intentionally excluded from the public repo and are used only for local development and validation:

- `AGENTS.md`
- `internal/`
- `poc/`

## Current direction

- ServiceNow-native scoped app
- UI Builder / Next Experience shell
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
