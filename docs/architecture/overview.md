# Docsera Architecture Overview

Docsera is a ServiceNow-native documentation application made of two cooperating, separately owned ServiceNow applications:

- The **scoped Docsera application** is the product runtime. It owns the Direct UI Page, React client, Scripted REST API, scoped services, roles, and Docsera records.
- The **Global companion** is a deliberately narrow, separately owned application. It provides the authenticated `docsera.do` host and the Global-only provisioning and membership operations that cannot safely live in the scoped application.

The companion is **not** ServiceNow's platform-owned Global application. It has its own SDK-generated application identity while its artifacts execute in Global scope. The scoped application remains authoritative for Docsera behavior, data, and authorization decisions.

## Runtime composition

The scoped application's Direct UI Page is declared in `app/docsera-ui/src/fluent/ui-pages/docsera-runtime.now.ts` and loads the React and TypeScript runtime from `app/docsera-ui/src/client/`. The Global companion's separately declared `docsera.do` page in `app/docsera-global-bridge/src/fluent/ui-pages/` directly loads that installed scoped runtime bundle; it does not route through the scoped Direct UI Page.

The ServiceNow SDK builds the client into deployable UX assets. The main bundle bootstraps the application and injects the runtime stylesheet before React mounts. This keeps the shell CSS in the same deployed JavaScript bundle rather than depending on a separately requested runtime CSS asset. Editor code is loaded as a runtime chunk; its local build boundary is verified separately.

```text
authenticated ServiceNow user
            |\
            | \
            v  v
scoped Direct UI Page       Global companion: docsera.do host
            |                         |
            +------------+------------+
                         v
              installed scoped React/TypeScript runtime
                         |                         |
                         | same-origin HTTP         | transient UI/editor state
                         v                         v
scoped Scripted REST API -> scoped services -> ServiceNow records
                                  |
                                  +-> narrow Global bridge for native-group work
```

## Client and server boundary

The client communicates with the scoped `docsera_runtime` Scripted REST API over the current ServiceNow origin. The API declarations in `app/docsera-ui/src/fluent/rest-api/docsera-runtime.now.ts` connect route handlers to server modules under `app/docsera-ui/src/server/`. Those services validate requests, calculate capabilities, enforce leases and mutation generations, and read or write the authoritative ServiceNow state.

The client may retain unsaved input and UI recovery data while a person is editing. It does not own durable workspace, page, publishing, hierarchy, permission, or concurrency state. After a stale or obsolete context result, it reloads the relevant server projection rather than manufacturing a new generation or replaying a non-idempotent command.

## Workspace and page state

A workspace is the top-level documentation container. It records its identity and presentation defaults, references its Admin and Editor groups, and selects its active pending change set and published snapshot set. Pages belong to one workspace and form a tree through parent and sibling-order fields.

Each page carries a draft representation and a published representation. Draft content and hierarchy changes form the workspace's Edit projection; the selected snapshot set forms the reader-facing Live projection. Workspace change sets, change entries, snapshot sets, and page snapshots persist the staged state and publication history needed to switch those projections as a unit.

This is a workspace-level model: changes to page content, settings, creation, movement, and deletion are pending changes in the active workspace change set. The data model and persistence services are located primarily in:

- `app/docsera-ui/src/fluent/tables/`
- `app/docsera-ui/src/server/workspaces/`
- `app/docsera-ui/src/server/pages/`
- `app/docsera-ui/src/shared/workspaces/` and `app/docsera-ui/src/shared/pages/`

## Editing and publishing

In **Live** mode, the client renders the published workspace snapshot. In **Edit** mode, it renders the server-projected draft/change-set overlay. Entering Edit requires a server-issued, exclusive workspace edit lease; the client acquires, renews, resumes, and releases that lease through dedicated API routes. The lease is workspace-wide, not a historical page-level lock.

The editor is a custom React surface built on TipTap/ProseMirror. Its client implementation lives in `app/docsera-ui/src/client/editor/`, while canonical document, schema, Markdown, and related contracts live in `app/docsera-ui/src/shared/editor/`. It produces structured document content that is persisted through the scoped server boundary; it is not a ServiceNow rich-text-editor integration.

Publishing is also workspace-wide. With the held Edit lease and current server-issued change-set generation, the server stages a snapshot of the Edit projection, makes that snapshot the published selector, and starts a successor pending change set. Discarding operates on the active pending state, either for an individual page change or for the workspace set. The server owns generation values and command recovery; clients pass values returned by the server and do not predict or repair them.

## Authorization and the Global boundary

The scoped app defines Docsera roles and uses its server services to evaluate the authenticated user's workspace capabilities. Native ServiceNow groups represent each workspace's Admin and Editor membership, and the scoped services enforce those capabilities before exposing or mutating Docsera records.

Creating groups, assigning the scoped roles to those groups, and changing native group membership require the Global boundary. The scoped app records and validates a constrained request or command; the Global companion's Script Includes and business rules perform the limited native operations, validate that targets belong to the specified Docsera workspace, and report a safe result. The Global companion does not become a general authorization layer or duplicate the scoped runtime.

## Repository layout

| Location | Responsibility |
| --- | --- |
| `app/docsera-ui/` | Active scoped application source: Fluent declarations, client, shared contracts, server services, tests, and SDK scripts. |
| `app/docsera-global-bridge/` | Separately owned Global companion: narrow bridge modules, Global host, package verification, and update-set generation. |
| `docs/` | Contributor documentation, implementation notes, decision history, and verification evidence. |
| `releases/0.1.0/` | Immutable consumer update-set pair and its release instructions. |
| `scripts/` | Repository-level identity and documentation/worktree validation utilities. |

## Installation architecture

The repository supports two different installation paths. **SDK/source installation** is for contributors and controlled development instances: it builds the source packages after instance-owned identity setup and installs the scoped application and Global companion separately. **Frozen update-set installation** is for consumers of the immutable 0.1.0 release: it imports the scoped update set first and the Global companion second.

These paths have different inputs, ownership rules, and verification steps. Follow [Installing Docsera](../guides/installing-docsera.md), [development setup](../guides/development-setup.md), or [the frozen update-set guide](../guides/update-set-installation.md) rather than treating generated source output as a consumer release artifact.

## Reading this overview

This overview intentionally describes boundaries and component interaction, not every API route, table, or editor extension. Use current source and focused tests as implementation truth; retained ADRs and process notes provide supporting historical context only.

For the implemented workspace record, capability, provisioning, membership, and lifecycle contract, see the [workspace domain reference](../reference/workspace-domain.md).

For the authorization model, workspace provisioning, membership-administration, and scoped-to-Global operational boundary, see the [access and provisioning reference](../reference/access-and-provisioning.md).

For the current security authority model, ACL inventory, resource authorization, content-safety boundaries, and evidence limits, see [authorization boundaries](../security/authorization-boundaries.md).

For release inputs, artifact provenance, receiving-instance qualification, gate status, and explicit release-claim limits, see [release qualification](../release/qualification.md).

For the implemented page record, hierarchy, projections, and page-operation contract, see the [page state and hierarchy reference](../reference/page-state-and-hierarchy.md).

For the implemented workspace-level pending-change, publishing, discard, mutation-authority, and recovery contract, see [publishing and change sets](../reference/publishing-and-change-sets.md).

For the canonical persisted editor JSON, supported blocks and marks, structural validation, and reader/editor document boundary, see [editor document model and blocks](../reference/editor/document-model-and-blocks.md).

For Markdown conversion, CodeMirror source mode, canonical handoff, diagnostics, and supported fidelity limits, see [editor Markdown and source](../reference/editor/markdown-and-source.md).

For workspace-owned page-image attachments, media authorization, canonical image references, rendering, and lifecycle, see [editor media](../reference/editor/media.md).

For Visual Edit command surfaces, selection, block controls, drag/drop, formatting, structured-block controls, history, clipboard, and session boundaries, see [editor interactions](../reference/editor-interactions.md).

For ServiceNow application composition, entry points, SDK asset packaging, REST and Global operational boundaries, identity portability, and installation verification, see the [ServiceNow runtime reference](../reference/servicenow-runtime.md).
