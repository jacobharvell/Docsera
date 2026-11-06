# Legacy engineering and release documentation

For current, source-grounded implementation documentation, start at the public [Docsera documentation index](../README.md). This directory retains legacy engineering notes and historical evidence pending disposition. It is not consumer installation guidance and does not replace accepted product requirements, which remain in the Docsera Obsidian requirements vault. Historical ADRs and implementation notes do not supersede the current references.

## Retained navigation

- [Architecture decisions](../history/decisions/) preserve dated architectural decisions and their rationale; they are not necessarily current implementation authority. In particular, ADR-0001's ProseMirror-first baseline was superseded by the active TipTap implementation.
- [Editor Runtime Interaction Contract](Editor%20Runtime%20Interaction%20Contract.md) is required reading before changing editor pointer, selection, gutter, drag, overlay, focus, or transient-selection behavior.
- [Test Strategy and Validation Areas](Test%20Strategy%20and%20Validation%20Areas.md) defines the proportional validation approach and named test suites.
- [Docsera Agent and Tooling Map](Docsera%20Agent%20and%20Tooling%20Map.md) and [Managed Frontend Validation Lifecycle](Implementation%20Notes%20-%20Managed%20Frontend%20Validation%20Lifecycle.md) cover local task workflow.

## Current implementation contracts

Legacy implementation notes may provide useful historical detail, but begin with the current, source-grounded documentation at the public [Docsera documentation index](../README.md) when understanding implemented behavior. Then use the retained note closest to the change and its referenced contracts for applicable historical detail:

- Runtime and platform: [Direct UI Page Host Architecture Baseline](Implementation%20Notes%20-%20Direct%20UI%20Page%20Host%20Architecture%20Baseline.md), [SDK Native UI Page Runtime Pipeline](Implementation%20Notes%20-%20SDK%20Native%20UI%20Page%20Runtime%20Pipeline.md), and [Frontend ServiceNow Runtime Communication](Implementation%20Notes%20-%20Frontend%20ServiceNow%20Runtime%20Communication.md).
- Workspace and page authority: [Workspace Data Model and Group Provisioning](Implementation%20Notes%20-%20Workspace%20Data%20Model%20and%20Group%20Provisioning.md), [Page Data Model and Slug Rules](Implementation%20Notes%20-%20Page%20Data%20Model%20and%20Slug%20Rules.md), [Workspace Mutation Coordination](Implementation%20Notes%20-%20Workspace%20Mutation%20Coordination.md), and [Publishing Workflow](Implementation%20Notes%20-%20Publishing%20Workflow.md).
- Editor and content: [Canonical Document Contract and Load Hardening](Implementation%20Notes%20-%20Canonical%20Document%20Contract%20and%20Load%20Hardening.md), [Editor Host Contract](Implementation%20Notes%20-%20Editor%20Host%20Contract.md), and the feature-specific E4–E8 notes.
- ServiceNow module and media boundaries: [SDK Generated Module Identity Completion](Implementation%20Notes%20-%20SDK%20Generated%20Module%20Identity%20Completion.md), [Server Runtime Module Boundary and Exact Specifier Safety](Implementation%20Notes%20-%20E5-T2.1%20Server%20Runtime%20Module%20Boundary%20and%20Exact%20Specifier%20Safety.md), and [ServiceNow Media Boundary and TipTap Ownership Spike](Implementation%20Notes%20-%20E5-T2A%20ServiceNow%20Media%20Boundary%20and%20TipTap%20Ownership%20Spike.md).

## Release, security, and historical evidence

The `RR-*` reports and `evidence/` files are retained engineering evidence. They include security reviews, SDK identity and packaging investigations, and the scoped/Global qualification sequence for the frozen 0.1.0 release. They are historical records, not current installation instructions.

For the consumer import pair and checksums, use [releases/README.md](../../releases/README.md) and the frozen [0.1.0 instructions](../../releases/0.1.0/README.md). Generated update-set output under `app/` is release-engineering material, not consumer installation input.

Older implementation notes may record the rationale for still-supported behavior. A note is retained when it documents a current contract, a security or regression boundary, or release-artifact provenance. Proof-only notes for rejected body-save recovery, the original Direct UI Page host/asset experiments, rejected page-lock acquisition, and the superseded SDK shell prototype were removed in RR-089; their current replacements are the contracts listed above.
