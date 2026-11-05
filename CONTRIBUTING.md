# Contributing to Docsera

Thanks for helping improve Docsera. This repository is a ServiceNow source-and-artifact project, not a general npm package.

## Before you start

Contributor work on the active application requires:

- Node.js 22 or later.
- npm.
- A contributor-owned ServiceNow development environment and SDK authentication configured for that environment when work needs installation or runtime verification.

Do not use the frozen `releases/0.1.0` XML files as an SDK development installation. They are consumer update-set artifacts; follow [their installation instructions](releases/0.1.0/README.md) only when installing the published release.

## Active source boundaries

- `app/docsera-ui/` is the active scoped-app Direct UI Page runtime and the usual contribution target.
- `app/docsera-global-bridge/` is release and maintenance source for the narrow Global companion; it is not a standalone app.
- `releases/0.1.0/` is frozen consumer-release material. Do not alter it as part of ordinary source contributions.

`AGENTS.md` is local workspace guidance. Public contributors should rely on the checked-in README files, package scripts, and relevant documentation.

## Local validation

Install dependencies for the package you are changing. For the active UI, the basic local checks are:

```powershell
npm --prefix app/docsera-ui install
npm --prefix app/docsera-ui run test
npm --prefix app/docsera-ui run build
npm run validate:docs
```

Run the smallest relevant managed test suite first when one is available; see `app/docsera-ui/package.json` for the named `test:*` scripts. `build` and the local test commands do not install to a ServiceNow instance. SDK installation and deployed-runtime verification require your own configured instance identity; do not use another contributor's alias, credentials, or instance details.

## Issues and pull requests

Before opening an issue, check whether it is installation help, a defect, or a feature proposal in [SUPPORT.md](SUPPORT.md). Never include passwords, API keys, tokens, instance credentials, personal data, or vulnerability details in a public issue or pull request.

Keep pull requests focused. Include:

- A concise description of the user-visible or maintenance outcome.
- The relevant tests or checks run, and anything intentionally not run.
- Documentation updates when durable behavior, contracts, or setup expectations change.
- Manual ServiceNow verification steps when the change affects runtime behavior or visual interaction.

Do not modify frozen release artifacts or make platform/security-setting changes unless the work is explicitly scoped for that purpose.
