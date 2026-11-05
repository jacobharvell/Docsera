# Installing Docsera

Docsera has two supported installation routes. Choose one before beginning; they serve different purposes and are not interchangeable.

| Route | Use it when | Result |
| --- | --- | --- |
| [Install the frozen 0.1.0 release](update-set-installation.md) | You want the published consumer package on a receiving ServiceNow instance. | Imports the immutable scoped-app and Global-companion update sets. |
| [Set up development from source](development-setup.md) | You are contributing to Docsera or controlling an SDK-based deployment to your own development instance. | Builds and installs source with identities owned by that instance. |

## Choose the release route for a consumer installation

The frozen release route is the only route for the published 0.1.0 package. It imports the artifacts in releases/0.1.0/ in a required order: the scoped Docsera application first, then the Global companion. Verify the artifact hashes from the immutable [0.1.0 release README](../../releases/0.1.0/README.md) before importing them.

Do not use XML generated under app/ as a consumer installation artifact. That output is for release engineering and is not a qualified distribution.

## Choose the SDK route for source work

The source route is for contributors and controlled development deployments. It requires Node.js, the pinned ServiceNow SDK dependencies, an SDK authentication alias for an instance you control, and a clean checkout for one-time contributor identity setup. It is not an npm package installation, and it is not a substitute for importing the frozen release.

The SDK route manages two source packages:

- app/docsera-ui/ is the scoped Direct UI Page application and runtime.
- app/docsera-global-bridge/ is the narrow Global companion that supplies the required Global boundary; it is not a standalone Docsera application.

Follow [development setup](development-setup.md) for the identity, build, install, and verification sequence.

## Important limits

The frozen 0.1.0 package has receiving-instance evidence for its documented sequence, but it does not establish general ServiceNow compatibility, upgrade safety, uninstall behavior, or complete release qualification. The SDK route likewise requires instance-specific authorization and verification; a local build does not prove that an instance installation is correct.

For the release index, see [consumer releases](../../releases/README.md).

