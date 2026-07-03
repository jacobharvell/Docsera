# Docsera Direct UI Page Runtime

This package is the active SDK-native runtime baseline for Docsera's preferred host path:

- runtime host: standalone scoped Direct UI Page
- source stack: React + TypeScript
- delivery target: ServiceNow SDK-managed static assets and Fluent metadata

## Scope

- Keep `src/client/main.tsx` thin. It mounts the app and imports global styles.
- Keep ServiceNow-specific URL and session assumptions in `src/client/platform/servicenow/`.
- Keep seed/demo data explicit and separate from future live persistence.
- Treat `app/docsera-shell/` as historical migration source material, not the active runtime entry point.

## Local commands

```powershell
npm --prefix app/docsera-ui install
npm --prefix app/docsera-ui run types:sdk
npm --prefix app/docsera-ui run validate
npm --prefix app/docsera-ui run build
npm --prefix app/docsera-ui run verify:sdk-runtime
```

Preferred install commands after SDK auth and scope metadata are configured:

```powershell
cd app/docsera-ui
.\scripts\initialize-sdk-auth.ps1 -InstanceUrl https://<instance>.service-now.com -Alias docsera-pdi -Username <username>
npx @servicenow/sdk transform --auth <alias>
npx @servicenow/sdk install --auth <alias>
```

`npm --prefix app/docsera-ui run install:sdk` remains useful only after a default SDK auth alias has already been selected on the machine.

Runtime verification after install:

```powershell
npm --prefix app/docsera-ui run verify:sdk-runtime
npm --prefix app/docsera-ui run verify:sdk-runtime -- --instance-url https://<instance>.service-now.com --auth-alias <alias>
npm run verify:sdk-ui-page
```

The verifier checks the installed Direct UI Page over HTTP using the locally stored SDK auth alias. It confirms the alias exists, the page returns `200`, the runtime HTML contains the Docsera mount node and config markers, the SDK-managed `main.jsdbx` asset resolves, and the REST ping returns the authenticated `x_82900_docsera` payload.

It does not execute client-side React in a browser, so it does not prove visual rendering, CSS layout, console cleanliness, or runtime bootstrap errors.

The real `scopeId` for `x_82900_docsera` should be synchronized from the target instance with `transform` and committed once confirmed. It is application identity metadata, not a credential, and the SDK build output bakes it into emitted `sys_app` and update records.

The SDK 4.8.1 auth helper stores credentials in the local OS keychain through `@napi-rs/keyring`. The repo should not contain auth material, and any local `.now-sdk/` cache directory should remain ignored if the CLI creates one on this platform.

## Runtime shape

The preferred runtime pipeline is:

- `src/client/` for the React client entry and styles
- `src/fluent/` for ServiceNow Fluent metadata such as `UiPage` and `RestApi`
- `src/server/` for server-side handler modules used by Fluent metadata
- `now-sdk build` for frontend bundling plus metadata compilation
- `now-sdk install` for instance deployment when SDK auth is configured

## Historical fallback

`npm run package:direct-ui-page` remains available at the repo root only as the older manual packaging fallback. It is no longer the preferred deployment path.

That fallback still emits:

- `docsera-runtime.js`
- `docsera-runtime.css`
- `direct-ui-page-host.example.html`
- `manifest.json`

Use it only if the SDK-native path needs comparison or rollback during investigation.
