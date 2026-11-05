# Docsera

Docsera is an open-source, ServiceNow-native documentation application for creating and reading focused product and API documentation. It is a standalone scoped app with a Direct UI Page host, a React and TypeScript client, ServiceNow records for persisted state, and a custom block-oriented editor foundation built around Tiptap/ProseMirror.

The frozen 0.1.0 package has been exercised on a receiving ServiceNow PDI for workspace creation, page authoring and saving, publishing and Live mode, discarding changes, refresh/navigation, and workspace administration. That evidence is limited to the documented receiving-instance sequence; it does not establish general ServiceNow compatibility, upgrade safety, uninstall behavior, or complete release qualification.

## Install Docsera 0.1.0

For a consumer installation, use only the frozen artifacts in [releases/0.1.0/](releases/0.1.0/). The package contains two ServiceNow update sets and their SHA-256 checksums:

1. Import, preview, and commit the **scoped Docsera application** update set first.
2. Import, preview, and commit the **Global companion** update set second.

The scoped-first, Global-second order is required because the scoped application authorizes and uses the companion boundary. See the [0.1.0 package instructions](releases/0.1.0/README.md) for the exact artifact names and checksums, and [releases/README.md](releases/README.md) for the consumer-release index.

Do not install locally generated update-set output from `app/`; it is release-engineering material, not a distributable consumer artifact.

## Source layout

This repository is a ServiceNow source-and-artifact project, not an npm package for general installation.

- [app/docsera-ui/](app/docsera-ui/) is the active ServiceNow SDK source for the scoped Direct UI Page runtime.
- [app/docsera-global-bridge/](app/docsera-global-bridge/) is the source for the narrowly scoped Global companion used by the release workflow; it is not a standalone Docsera app.
- [docs/decisions/](docs/decisions/) contains the active architectural decisions. Relevant implementation context includes the [SDK-native runtime pipeline](docs/process/Implementation%20Notes%20-%20SDK%20Native%20UI%20Page%20Runtime%20Pipeline.md), [workspace data model](docs/process/Implementation%20Notes%20-%20Workspace%20Data%20Model%20and%20Group%20Provisioning.md), and [page model](docs/process/Implementation%20Notes%20-%20Page%20Data%20Model%20and%20Slug%20Rules.md).
- [docs/process/](docs/process/README.md) indexes current engineering contracts, validation guidance, and retained release evidence. It is not consumer installation documentation.

## For contributors

Contributor work targets the active source packages above and requires a ServiceNow development environment and SDK configuration. Start with [app/docsera-ui/README.md](app/docsera-ui/README.md), then use the scoped package's focused test or validation commands as appropriate. Do not treat the frozen XML package as an SDK installation, and do not use historical shell procedures as the active deployment path.

See [CONTRIBUTING.md](CONTRIBUTING.md) for prerequisites, active source boundaries, local validation, and pull-request expectations. For installation help, defects, and feature proposals, see [SUPPORT.md](SUPPORT.md). Report security concerns only through the private route described in [SECURITY.md](SECURITY.md), never in a public issue or pull request.

Current architecture decisions are [ADR-0001](docs/decisions/ADR-0001-editor-architecture.md), [ADR-0002](docs/decisions/ADR-0002-direct-ui-page-host.md), and [ADR-0003](docs/decisions/ADR-0003-frontend-stack.md).

## License

Docsera is available under the [MIT License](LICENSE).
