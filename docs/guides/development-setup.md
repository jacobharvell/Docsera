# Development setup from source

Use this route for Docsera contributors and controlled deployment to a ServiceNow development instance you own. For a consumer installation of the published package, use [the frozen update-set route](update-set-installation.md) instead.

## What this route installs

Source deployment has two cooperating packages:

- app/docsera-ui/ builds and installs the scoped Docsera Direct UI Page, client bundle, records, REST APIs, and scoped server runtime.
- app/docsera-global-bridge/ builds and installs the deliberately narrow Global companion. It provides the Global provisioning and membership boundary plus the authenticated docsera.do host; it does not duplicate the scoped runtime or become a standalone application.

Install the scoped application before the Global companion. The companion's cross-scope privileges and runtime modules depend on the scoped application.

## Prerequisites

- Node.js 22 or later and npm.
- A clean clone of this repository. Use a dedicated clean clone for contributor-owned identity setup; the setup intentionally writes local identity and generated files.
- A ServiceNow development instance you control and an SDK authentication alias for that exact instance. Do not use another contributor's alias, credentials, or instance.
- Permissions to create and install the scoped application and its separate Global companion on that development instance.

From the repository root, install the pinned dependencies for both packages:

~~~powershell
npm ci --prefix app/docsera-ui
npm ci --prefix app/docsera-global-bridge
~~~

Create the SDK authentication alias interactively. The helper reads the password securely and does not put it in repository files:

~~~powershell
.\app\docsera-ui\scripts\initialize-sdk-auth.ps1 -InstanceUrl https://<instance>.service-now.com -Alias <sdk-auth-alias> -Username <username>
~~~

The helper invokes `npx`; before proceeding, the alias must also be visible to the repository-pinned SDK. Confirm that the pinned SDK lists the alias for the intended instance:

~~~powershell
app\docsera-ui\node_modules\.bin\now-sdk.cmd auth --list
~~~

## Establish a contributor-owned identity

The checked-in source represents the canonical Docsera identity:

- scoped application: x_2300756_docsera
- scoped application ID: e6e43323accd4c7fb9271525a343850e
- Global companion: scope: global with its own SDK-generated application ID

Those identities are source facts, not a transferable instruction to install into a contributor instance. A contributor instance must own its own scoped identity and its own Global-companion application identity. The Global companion must never use or overwrite the platform-owned sys_app:global or sys_scope:global records.

In a clean, unconverted clone, run the one-time setup command from the repository root. Substitute your instance URL, authentication alias, and ServiceNow company code:

~~~powershell
npm run setup:developer-instance -- -- --instance https://<instance>.service-now.com --auth <sdk-auth-alias> --company-code <digits>
~~~

The command validates the alias and target, creates SDK-owned scoped and Global identities, converts the local projects, regenerates their generated keys during builds, and applies the resulting local files to that clone. It does **not** install to ServiceNow. It refuses a dirty or already-converted checkout. Treat its changes as local instance configuration: do not commit them to the canonical source branch or use them to replace another contributor's identity.

If this is the canonical development instance with its canonical identity, do not run contributor identity setup. Use only its established, reviewable deployment workflow; do not repurpose it for a different instance.

## Build, install, and verify

Run these commands from the repository root after identity setup. Replace <sdk-auth-alias> with the alias for the development instance.

~~~powershell
npm run build:sdk-ui-page
npm run build:sdk-global-bridge

npm run install:sdk-ui-page -- -- --auth <sdk-auth-alias>

npm run verify:sdk-ui-page -- -- --auth-alias <sdk-auth-alias> --instance-url https://<instance>.service-now.com
~~~

install:sdk-ui-page rebuilds the scoped package before invoking the SDK install and checks that its configured identity is not a placeholder. The scoped verifier checks the local bundle and installed UI Page, current bundle freshness, and authenticated REST ping. It requires both the alias and the exact matching instance URL because its canonical-development defaults are not a contributor target. A passing local build alone is insufficient.

Before installing the Global companion on an instance that might already have a Global docsera page, run its ownership preflight from the companion package:

~~~powershell
npm --prefix app/docsera-global-bridge run preflight:friendly-url-host -- -- --auth-alias <sdk-auth-alias>
~~~

Stop if the preflight reports a collision. Do not delete or overwrite a non-Docsera Global page to make installation proceed.

After the preflight passes, install and verify the Global companion:

~~~powershell
npm run install:sdk-global-bridge -- -- --auth <sdk-auth-alias>
npm run verify:sdk-global-bridge -- -- --auth-alias <sdk-auth-alias>
~~~

The Global verifier checks the installed bridge records, cross-scope privileges, and Global runtime modules. It requires the same instance credentials as the scoped installation and verifier.

## Safety and qualification limits

- Keep credentials, aliases, passwords, and instance-specific identity files out of commits and documentation.
- Do not use npm run deploy:sdk-ui-page for a contributor-owned identity; that command is intentionally bound to the canonical development identity.
- Do not treat app/ update-set output as a consumer release. It requires a separately authorized release qualification.
- Do not treat local tests, builds, or SDK generation as proof of installed runtime behavior. Run the instance verifiers after installation.
- The currently documented release evidence does not establish general compatibility, upgrade safety, uninstall behavior, or complete qualification for arbitrary ServiceNow instances.

For contributor workflow and local validation expectations, see [CONTRIBUTING.md](../../CONTRIBUTING.md).

