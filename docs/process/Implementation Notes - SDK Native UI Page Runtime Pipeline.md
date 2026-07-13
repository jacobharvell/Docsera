# Implementation Notes - SDK Native UI Page Runtime Pipeline

Date: 2026-07-07

Status: implementation note

## Purpose

Record the production runtime asset pipeline for Docsera's standalone scoped Direct UI Page host.

This note documents repo-side implementation behavior only. Accepted product behavior remains in the Obsidian requirements notes.

## Final Runtime CSS Architecture

Docsera now uses JS-injected runtime CSS for the SDK-native Direct UI Page runtime.

Final source-to-runtime chain:

- `src/client/styles/runtime-shell.css`
- `import runtimeShellCssText from "./styles/runtime-shell.css?inline"`
- `main.jsdbx` string module
- one injected `style[data-docsera-runtime-style="runtime-shell"]`
- computed style on the live page

The CSS is injected before React mount from `src/client/main.tsx` through `ensureRuntimeStylesheet(...)`.

Runtime invariants:

- exactly one runtime style tag is present
- reinvocation updates the text instead of adding duplicates
- `main.jsdbx` contains the CSS text and the injection marker
- no runtime CSS request is made for `runtime-shell.css`

## Why This Was Chosen

JS-injected CSS was selected because it gives Docsera a single deployable runtime artifact for the Direct UI Page shell and avoids the prior SDK theme-asset churn.

Rejected normal pipelines:

- Stable `/uxta` identity:
  it still required `sys_ux_theme_asset` records and made CSS freshness separate from JS freshness.
- Hashed `/uxta` filenames:
  it removed the stable-name mismatch, but it still kept runtime CSS as a second deployed asset, created extra metadata churn, and continued coupling CSS-only edits to theme-asset packaging behavior.

The current architecture keeps runtime freshness tied to one deploy target: `main.jsdbx`.

## Build Plugin Behavior

`app/docsera-ui/inlineCssTextPlugin.mjs` is the only custom CSS pipeline extension.

Behavior:

- resolves `*.css?inline`
- reads the target file as UTF-8
- exports the CSS as a JS string
- throws immediately if the CSS file is missing

`now.prebuild.mjs` and `now.dev.mjs` both use the plugin so SDK build and SDK dev stay aligned.

The prebuild hook still keeps a narrow path-normalization pass for backslash-shaped asset query paths. That normalization remains for non-CSS asset stability only; it no longer renames, hashes, or patches runtime CSS assets.

## Removed / Rejected Behavior

The production branch does not use the old fallback runtime CSS asset path:

- no runtime CSS rename to `runtime-shell.<hash>.css`
- no postbuild patching of `/uxta/...assetx?path=...runtime-shell...`
- no runtime-shell `sys_ux_theme_asset` emission in the build package
- no `dist/static/styles/runtime-shell*.css`
- no verifier assumption that runtime CSS resolves from `/uxta`

Historical deleted `sys_ux_theme_asset` key entries were removed from `src/fluent/generated/keys.ts` so CSS-only edits no longer create theme-asset cleanup churn in the generated key registry.

## Build Outputs And Local Validation

`npm --prefix app/docsera-ui run validate` is intentionally local-only and does not require PDI credentials.

It runs:

- `npm run test`
- `npm run build`
- `npm run verify:inline-runtime-css-build`

The local build verifier checks:

- `dist/static/main.jsdbx` exists
- the runtime style injection marker is present
- the inline CSS probe value is present in `main.jsdbx`
- no runtime-shell `sys_ux_theme_asset` XML exists anywhere under `dist/app`
- no `runtime-shell*.css` file exists under `dist/static`
- `src/fluent/generated/keys.ts` has no runtime-shell explicit asset entry
- `main.jsdbx` contains no runtime CSS asset URL

## Deploy Command

`now-sdk build` is the only supported application build and ServiceNow SDK installation is the only supported deployment path. Vite and its React plugin remain test-transformation infrastructure for Vitest only; the former standalone Vite/IIFE build, `build:legacy`, `dev:legacy`, and Vite preview are removed and unsupported.

Preferred repo command:

- `npm run deploy:sdk-ui-page`

It runs, in order:

1. `clean`
2. `build`
3. `install`
4. deployed runtime verification

The app-level script is `npm --prefix app/docsera-ui run deploy:sdk`.

`npm --prefix app/docsera-ui run install:sdk` now also runs a build before `now-sdk install` so direct install usage does not depend on stale local artifacts.

## Runtime Verification Chain

`npm run verify:sdk-ui-page` / `npm --prefix app/docsera-ui run verify:sdk-runtime` now verify the inline-CSS architecture, not the legacy theme-asset path.

The verifier proves:

- the local build still satisfies the inline runtime CSS invariant
- the UI page returns `200`
- the live page exposes the current `main.jsdbx` reference
- the live `main.jsdbx` hash matches the local built `main.jsdbx`
- the live bundle contains the style injection marker
- the live bundle contains the inline CSS probe value
- the live bundle contains no runtime CSS asset URL
- the browser requests `main.jsdbx`
- the browser does not request a runtime-shell CSS asset
- the browser has exactly one `style[data-docsera-runtime-style="runtime-shell"]`
- computed style on `#docsera-root` matches the probe value
- browser console has no CSP/style-injection violations
- no uncaught browser runtime errors occur
- the authenticated REST ping still returns the expected scoped payload

## `uxpcb` Propagation Retry Behavior

The live page can briefly continue serving a prior `uxpcb` / `main.jsdbx` after install.

The verifier now treats that as a freshness problem and retries before success:

- default window: 10 attempts
- delay: 3 seconds between attempts
- success condition:
  page HTML, referenced `main.jsdbx`, and fetched JS hash all align with the current local build
- failure behavior:
  the verifier reports the last observed hash and `uxpcb` instead of silently passing

Observed behavior on 2026-07-07:

- the deploy-integrated verifier succeeded once the page referenced `uxpcb=1783472521717`
- a second verifier started in parallel with deploy remained pinned to the prior `uxpcb=1783472377483` for its full retry window and failed
- rerunning the verifier after deploy completion passed immediately

That failure mode is intentional: deploy success is not reported while stale JS is still being served.

## CSP Finding

PDI browser verification on 2026-07-07 showed the injected runtime style tag works without CSP or style-injection console violations.

No console messages were observed for:

- Content Security Policy violations
- refused inline style application
- uncaught runtime bootstrap errors

## Legacy Theme Asset Inventory

Old runtime-shell theme assets still exist on the current PDI instance and were observed during verification:

- `68629ad37dcb406f80aef6c243c82e79` -> `styles/runtime-shell.mrb67au3.4a39c753.css`
- `e8bdafb97eee48cab1db9caf0a4d9bfa` -> `styles/runtime-shell.mrb6rku3.4a39c753.css`

Current live runtime behavior does not reference them:

- live `main.jsdbx` contains no runtime CSS asset URL
- browser network verification made no runtime-shell CSS request

Safe cleanup recommendation:

- inventory the stale `sys_ux_theme_asset` records on the target instance
- confirm no current page or lib asset references them
- remove them with an explicit, manual, instance-scoped cleanup step if Jacob wants the instance metadata cleaned

Normal deploy does not delete them automatically.

## Manual Do-Not-Do List

Do not:

- reintroduce `import "./styles/runtime-shell.css"` in the runtime entry
- add postbuild runtime CSS patching back into the SDK pipeline
- rely on `/uxta/...runtime-shell...css` as a success signal
- hand-edit deployed page HTML to inject CSS
- assume a successful install means the live page has already advanced to the current `uxpcb`

## Known Risks

- The instance can continue to serve a prior `uxpcb` briefly after install; keep the freshness retry in place.
- Legacy runtime-shell theme-asset records still exist on the PDI and may confuse manual instance inspection until they are cleaned up deliberately.
- Browser verification depends on a locally launchable Chromium-family browser via `playwright-core`.
