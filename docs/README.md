# Docsera documentation

This is the public starting point for Docsera documentation. It links to the current, source-grounded references for installation, development, architecture, and operation. Approved historical evidence remains available in [the history archive](history/), but does not replace the references below.

For dated architectural rationale that does not define current implementation behavior, see the [historical architecture decisions](history/decisions/README.md). Dated [release](history/release/README.md), [security, accessibility, and compatibility](history/security/README.md), and [platform feasibility](history/platform-and-installation/README.md) evidence is retained separately and does not define current behavior.

The [historical generated evidence](history/evidence/README.md) preserves three immutable JSON/XML artifacts for their dated evidence purpose only; their superseded task narratives remain in Git history.

## Installation

- [Installing Docsera](guides/installing-docsera.md) helps choose the correct route: contributor/source development or the frozen consumer package.
- [Frozen 0.1.0 update-set installation](guides/update-set-installation.md) covers the qualified consumer import route. It is distinct from SDK/source development and does not establish universal compatibility, upgrade or uninstall safety, or public-release approval.
- [Development setup](guides/development-setup.md) covers the SDK/source route for a contributor-controlled ServiceNow development instance.

## Architecture

- [Runtime overview](architecture/overview.md) describes the active packages, runtime shape, and authority boundaries.
- [Workspace domain](reference/workspace-domain.md) covers workspaces, membership, capabilities, and ownership.
- [Page state and hierarchy](reference/page-state-and-hierarchy.md) covers page identity, tree structure, drafts, settings, and recovery.
- [Publishing and change sets](reference/publishing-and-change-sets.md) describes workspace changes, publishing, discard, undo, and concurrency boundaries.
- [Access and provisioning](reference/access-and-provisioning.md) documents authorization, group provisioning, and the narrow Global boundary.
- [ServiceNow runtime](reference/servicenow-runtime.md) covers Direct UI Page assets, SDK identities, server modules, and the Global companion.

## Editor

- [Document model and blocks](reference/editor/document-model-and-blocks.md) describes the canonical document envelope, block model, and reader/editor behavior.
- [Markdown and source](reference/editor/markdown-and-source.md) covers conversion and source-mode handoff.
- [Media](reference/editor/media.md) documents authorized media persistence and lifecycle behavior.
- [Editor interactions](reference/editor-interactions.md) covers gutters, selection, drag and drop, overlays, focus, keyboard behavior, and scrolling.

## Security

- [Authorization boundaries](security/authorization-boundaries.md) explains roles, workspace capability checks, server authority, and protected workflow data.

## Testing and maintenance

- [Testing and maintenance](guides/testing-and-maintenance.md) provides current contributor validation guidance and managed test-suite selection.

## Release evidence

- [Release qualification](release/qualification.md) states the demonstrated 0.1.0 release evidence and its limits.
- [Immutable consumer release instructions](../releases/0.1.0/README.md) are the authority for the frozen update-set pair, checksums, and import order.
- [Historical release evidence](history/release/README.md) preserves the dated construction, inspection, and receiving-instance qualification reports; it does not define current installation instructions or release approval.

## Contributing and support

- [Contributing](../CONTRIBUTING.md) explains contributor prerequisites and pull-request expectations.
- [Support](../SUPPORT.md) explains installation help, defects, and feature requests.
- [Security reporting](../SECURITY.md) describes the private vulnerability-reporting route and its activation boundary.
