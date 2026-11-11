# Docsera 0.1.0

This versioned package contains two ServiceNow update sets for a new Docsera installation. Use the release assets when they are available through [GitHub Releases](https://github.com/jacobharvell/Docsera/releases); this directory records their package identities and integrity values.

Install the update sets separately and in this order:

1. Import, preview, and commit `docsera_application_0.1.0.xml` (564 updates).
2. Import, preview, and commit `docsera_global_companion_0.1.0.xml` (24 updates).

The scoped application must be installed first. It owns the Docsera runtime and authorizes the companion's narrow Global boundary.

| Artifact | SHA-256 |
| --- | --- |
| `docsera_application_0.1.0.xml` | `90ef34afdcf48a8b54655b0e60437130120de8b4681bd99cbaa7dd2e75277cc0` |
| `docsera_global_companion_0.1.0.xml` | `adae62031698b7b1596b71474defa7fb9889ffa40e30d40ad5ccfd01b64a0c50` |

Follow the [consumer installation guide](../../docs/guides/update-set-installation.md) for prerequisites, import and preview steps, conflict handling, and post-install verification. The package is not documented as an upgrade, migration, rollback, or uninstall path.
