# Docsera Direct UI Page Runtime

This package is the active SDK-native runtime for Docsera's standalone scoped Direct UI Page host.

Current runtime CSS architecture:

- source: `src/client/styles/runtime-shell.css`
- build import: `./styles/runtime-shell.css?inline`
- output: inline CSS text inside `dist/static/main.jsdbx`
- runtime application: one injected `style[data-docsera-runtime-style="runtime-shell"]`

The runtime does not depend on a deployed `sys_ux_theme_asset` for `runtime-shell.css`.

## Scope

- Keep `src/client/main.tsx` thin.
- Keep ServiceNow-specific URL and session assumptions in `src/client/platform/servicenow/`.
- Keep seed/demo data explicit and separate from future live persistence.
- Treat `app/docsera-shell/` as historical migration material, not the active runtime entry point.

## Local Commands

```powershell
npm --prefix app/docsera-ui install
npm --prefix app/docsera-ui run test
npm --prefix app/docsera-ui run test -- src/client/app/App.test.tsx -t navigation --reporter dot --maxWorkers 1
npm --prefix app/docsera-ui run build
npm --prefix app/docsera-ui run verify:inline-runtime-css-build
npm --prefix app/docsera-ui run validate
```

`test` is the managed Vitest entrypoint. It accepts pass-through Vitest filters and reporters while keeping worker counts bounded by default.

`validate` is local-only. It runs Vitest, SDK build, and inline build-artifact verification in sequence without requiring PDI credentials.

## Deploy Commands

From the repo root:

```powershell
npm run deploy:sdk-ui-page
npm run verify:sdk-ui-page
```

From `app/docsera-ui/`:

```powershell
.\scripts\initialize-sdk-auth.ps1 -InstanceUrl https://<instance>.service-now.com -Alias docsera-pdi -Username <username>
npx @servicenow/sdk transform --auth <alias>
npm run install:sdk
npm run verify:sdk-runtime
```

`deploy:sdk-ui-page` runs clean, build, install, and deployed-runtime verification in sequence. Normal deployment and standalone verification perform non-browser checks and report `Browser proof: skipped`.

Browser proof is separate and requires Jacob's explicit authorization. Run the verifier entrypoint directly when it is authorized:

```powershell
node app/docsera-ui/scripts/verify-sdk-runtime.mjs --browser
```

From `app/docsera-ui/`, use `node ./scripts/verify-sdk-runtime.mjs --browser`. `--skip-browser` remains accepted for compatibility, but is no longer necessary for normal commands.

## What The Runtime Verifier Proves

`verify:sdk-runtime` verifies both local build artifacts and the installed runtime. It checks:

- local `main.jsdbx` still satisfies the inline CSS invariant
- live UI page returns `200`
- live `main.jsdbx` hash matches the local build
- live bundle contains the style injection marker
- REST ping still returns the authenticated scoped payload

With the explicit `--browser` opt-in, it additionally checks browser bundle loading, runtime CSS requests and application, and browser CSP/runtime errors.

The verifier also waits through bounded `uxpcb` propagation after install and fails clearly if stale JS is still being served.

## Historical Fallback

`npm run package:direct-ui-page` remains only as a historical manual packaging path for investigation or rollback comparison.
