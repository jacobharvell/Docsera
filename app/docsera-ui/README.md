# Docsera Direct UI Page Runtime

This package is the active repo-managed frontend baseline for Docsera's preferred runtime path:

- runtime host: standalone scoped Direct UI Page
- source stack: React + TypeScript + Vite
- delivery target: static JavaScript and CSS assets hosted by ServiceNow

## Scope

- Keep `src/main.tsx` thin. It mounts the app and imports global styles.
- Keep ServiceNow-specific URL and session assumptions in `src/platform/servicenow/`.
- Keep seed/demo data explicit and separate from future live persistence.
- Treat `app/docsera-shell/` as historical migration source material, not the active runtime entry point.

## Local commands

```powershell
npm --prefix app/docsera-ui install
npm --prefix app/docsera-ui run validate
npm run package:direct-ui-page
```

## Packaging shape

`npm run package:direct-ui-page` builds the Vite bundle and writes a repeatable packaging output to `output/direct-ui-page-baseline/`:

- `docsera-runtime.js` for scoped UI Script delivery
- `docsera-runtime.css` for same-origin attachment-backed CSS delivery
- `direct-ui-page-host.example.html` as the Direct UI Page host template
- `manifest.json` with the packaging metadata and placeholders

That output is a repo-side packaging baseline. Final on-instance automation and final auth/ACL wiring remain deferred.
