# Installing Docsera

Choose the route that matches your goal. The routes are separate and are not interchangeable.

| Route | Use it when | Start here |
| --- | --- | --- |
| Release installation | You are installing a versioned Docsera package on a receiving ServiceNow instance. | [Update-set installation](update-set-installation.md) |
| Source development | You are contributing to Docsera or installing source into a development instance you control. | [Development setup](development-setup.md) |

## Release installation

Install the official versioned update-set pair when its assets are available through [GitHub Releases](https://github.com/jacobharvell/Docsera/releases). Import the scoped Docsera application first and the Global companion second. The [update-set installation guide](update-set-installation.md) covers ServiceNow access prerequisites, the import and preview sequence, post-install checks, and optional SHA-256 verification. Package filenames and checksums are maintained in the [0.1.0 package README](../../releases/0.1.0/README.md).

The versioned package is intended for a new installation; it does not establish an upgrade, migration, rollback, or uninstall procedure.

## Source development

Build and install source packages only into a contributor-controlled ServiceNow development instance. [Development setup](development-setup.md) covers contributor-owned identities, SDK authentication, package order, collision protection, installation, and installed-runtime verification.

For end-user product guidance, visit the [published Docsera documentation](https://docsera.mintlify.site/).
