# Developer Instance Identity Setup

Use this one-time command after cloning or forking the canonical Docsera
repository when you want the checkout to own application identities on your
own ServiceNow developer instance. It does not install or deploy anything.

The canonical repository identity is already installed on the primary
development PDI, `https://dev468303.service-now.com`, as
`x_2300756_docsera`. Do not run this one-time setup workflow for that
environment. Use `npm run deploy:sdk-ui-page` from a task worktree after
review instead; it uses the `docsera-dev468303` alias and checks the installed
identity before installation.

## Prerequisites

- Node.js 22 or later.
- A clean canonical Docsera checkout. Commit, stash, or discard local changes
  before beginning.
- Dependencies installed in the scoped application once, so the pinned SDK is
  available:

  ```powershell
  npm ci --prefix app/docsera-ui
  ```

- An SDK authentication alias for the exact target instance. Confirm it first:

  ```powershell
  app\docsera-ui\node_modules\.bin\now-sdk.cmd auth --list
  ```

## One-time setup

Run this from the repository root, supplying the exact instance URL, its SDK
authentication alias, and its company code:

```powershell
npm run setup:developer-instance -- -- `
  --instance https://dev123456.service-now.com `
  --auth docsera-dev123456 `
  --company-code 123456
```

The command validates the clean checkout and authentication selection, uses
the pinned ServiceNow SDK to initialize a scoped `x_123456_docsera`
application and a separate Global companion application, converts both local
projects, regenerates their `src/fluent/generated/keys.ts` registries through
SDK builds, and applies the successful candidate directly to this checkout.
The Global companion keeps `scope: global` but receives its own SDK-generated
32-character application identity; it never targets the platform-owned
`sys_app:global` record.

It refuses to run if the checkout is dirty, has already been converted, the
SDK executable is missing, the alias does not identify the selected instance,
or SDK initialization does not produce the required identities. It also builds
both candidate projects before altering the checkout, then runs `npm ci` and
the normal build in each applied project. No `now-sdk install`, `move`,
update-set action, or other instance mutation is performed.

The resulting identity files and generated registries are deliberately local
working-tree changes. Do not re-run setup to change identities; start from a
fresh canonical checkout instead.

## Normal SDK development afterward

Use the repository commands as usual:

```powershell
npm run build:sdk-ui-page
npm run build:sdk-global-bridge
npm run install:sdk-ui-page -- --auth docsera-dev123456
npm run install:sdk-global-bridge -- --auth docsera-dev123456
```

Installation remains a separate developer decision and is not part of setup.
