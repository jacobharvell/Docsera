# Docsera

Docsera is an open-source documentation platform built natively for ServiceNow. Create and organize pages in workspaces, edit content visually or with Markdown, and publish changes through a workspace-wide review workflow—all within your ServiceNow instance.

**[Read the published Docsera documentation](https://docsera.mintlify.site/)** for end-user guidance and product documentation.

## Features

- ServiceNow-native workspaces and hierarchical page trees.
- Visual editing and Markdown Source for page content.
- Rich content blocks, including text, lists, links, code, tables, media, and layout-oriented blocks.
- Workspace-level Live and Edit views, with publishing, discard, and change-management workflows.
- ServiceNow-native authorization and workspace membership controls.

## Documentation

The [published Docsera documentation](https://docsera.mintlify.site/) is the primary destination for using Docsera. Repository documentation supplies technical references, installation-package details, and contributor workflows in the [documentation index](docs/README.md).

## Install Docsera

Use the versioned scoped application and Global companion update-set pair for a consumer installation. The required order is **scoped-first, Global-second**. Availability of a versioned package is determined by the [GitHub Releases page](https://github.com/jacobharvell/Docsera/releases); see the [installation guide](docs/guides/update-set-installation.md), [0.1.0 package README](releases/0.1.0/README.md), and [consumer release index](releases/README.md) for the required order, prerequisites, and optional integrity checks.

For a contributor-controlled ServiceNow development instance, use the separate [source development setup](docs/guides/development-setup.md). The release package is intended for a new installation; it does not establish an upgrade path.

## Development and contributing

Docsera has a scoped application source package at [app/docsera-ui/](app/docsera-ui/) and a narrowly scoped Global companion at [app/docsera-global-bridge/](app/docsera-global-bridge/). Start with the [development setup](docs/guides/development-setup.md), [architecture overview](docs/architecture/overview.md), and [contribution guide](CONTRIBUTING.md).

## Support and security

For installation help, defects, and feature requests, see [SUPPORT.md](SUPPORT.md). For private vulnerability-reporting boundaries, see [SECURITY.md](SECURITY.md); do not disclose vulnerabilities in public issues or pull requests.

## License

Docsera is available under the [MIT License](LICENSE).
