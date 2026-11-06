# Docsera

Docsera is an open-source, ServiceNow-native documentation application for creating and reading focused product and API documentation. It is a standalone scoped app with a Direct UI Page host, a React and TypeScript client, ServiceNow records for persisted state, and a custom block-oriented editor foundation built around Tiptap/ProseMirror.

The frozen 0.1.0 package has been exercised on a receiving ServiceNow PDI for workspace creation, page authoring and saving, publishing and Live mode, discarding changes, refresh/navigation, and workspace administration. That evidence is limited to the documented receiving-instance sequence; it does not establish general ServiceNow compatibility, upgrade safety, uninstall behavior, or complete release qualification.

Start with the [Docsera documentation index](docs/README.md) for current public references. Historical process notes and ADRs are retained as supporting evidence, not current authority.

## Install Docsera

Docsera has two valid, distinct installation methods:

- **Consumer installation:** import the frozen 0.1.0 update-set pair. Follow [the update-set installation guide](docs/guides/update-set-installation.md). The required order is **scoped-first, Global-second**; verify the published hashes in the immutable [0.1.0 package instructions](releases/0.1.0/README.md).
- **Source development:** build and install the SDK source to a development instance you control. Follow [the development setup guide](docs/guides/development-setup.md) for prerequisites, contributor-owned identities, and instance verification.

Start at [Installing Docsera](docs/guides/installing-docsera.md) to choose the right route. The [consumer release index](releases/README.md) lists the frozen package. Do not install locally generated update-set output from `app/`; it is release-engineering material, not a distributable consumer artifact.

## Source layout

This repository is a ServiceNow source-and-artifact project, not an npm package for general installation.

- [app/docsera-ui/](app/docsera-ui/) is the active ServiceNow SDK source for the scoped Direct UI Page runtime.
- [app/docsera-global-bridge/](app/docsera-global-bridge/) is the source for the narrowly scoped Global companion used by the release workflow; it is not a standalone Docsera app.
- [docs/README.md](docs/README.md) is the current documentation index, including the runtime overview and contributor guidance. [docs/history/decisions/](docs/history/decisions/) retains architectural history; verify it against current source and the overview before treating it as current behavior.
- [docs/process/](docs/process/README.md) retains legacy engineering notes and historical evidence. It is not consumer installation documentation or the current implementation reference index.

## For contributors

Contributor work targets the active source packages above and requires a ServiceNow development environment and SDK configuration. Start with [the development setup guide](docs/guides/development-setup.md), then use the scoped package's focused test or validation commands as appropriate. See [testing and maintenance](docs/guides/testing-and-maintenance.md) for managed suites, validation boundaries, and contributor checkpoints. Do not treat the frozen XML package as an SDK installation, and do not use historical shell procedures as the active deployment path.

See [CONTRIBUTING.md](CONTRIBUTING.md) for prerequisites, active source boundaries, local validation, and pull-request expectations. For installation help, defects, and feature proposals, see [SUPPORT.md](SUPPORT.md). Report security concerns only through the private route described in [SECURITY.md](SECURITY.md), never in a public issue or pull request.

For the current implementation overview, start with [the architecture overview](docs/architecture/overview.md). ADRs are retained as historical decision records, not the current architectural authority.

## License

Docsera is available under the [MIT License](LICENSE).
