# Authorization boundaries

This is the current, source-backed reference for Docsera's implemented authorization and content-safety boundaries. It describes the security controls the application declares and exercises; it is not a penetration-test report or a claim of universal ServiceNow-instance parity. For workspace provisioning and the detailed membership workflow, see [access and provisioning](../reference/access-and-provisioning.md). For publishing recovery, see [publishing and change sets](../reference/publishing-and-change-sets.md).

## Authority model

Docsera layers several authorities rather than treating a visible control or a client-side capability flag as permission:

- ServiceNow authenticates the current user and supplies native role and group records.
- The scoped server capability evaluator reads that user context, the requested workspace's stored Admin/Editor group IDs, and native `sys_user_grmember` membership.
- Fluent table declarations and ACLs restrict generic record access; scripted REST handlers and services separately validate each supported operation.
- A workspace Edit lease, server-issued change-set revision, and server-owned mutation claim constrain authoring commands after authorization succeeds.
- The separately owned Global companion performs only the narrow native-group operations for which it has declared cross-scope access.

UI visibility is therefore not the enforcement boundary. Platform metadata describes declared protection, source and tests show intended service behavior, and effective permissions in an installed user context are separate evidence. This document does not equate any one of those forms of evidence with the others.

## Roles and workspace capabilities

The scoped application declares three roles with this containment:

| Role | Contains | Effective purpose |
| --- | --- | --- |
| `x_2300756_docsera.editor` | — | Workspace authoring when paired with the requested workspace's Editor-group membership. |
| `x_2300756_docsera.workspace_admin` | Editor | Workspace administration and authoring when paired with the requested workspace's Admin-group membership. |
| `x_2300756_docsera.admin` | Workspace Admin, Editor | Application-wide Docsera override. |

For ordinary Workspace Admin and Editor authority, both the relevant role and membership in the requested workspace's corresponding native group are required. The evaluator fails closed when an elevated group's stored reference is missing. It does not accept a role, workspace ID, or membership assertion supplied by the client as proof.

Docsera Admin is the application-wide override: it can create workspaces and is effective for workspace administration without membership in every workspace group. Effective Workspace Admins can manage settings, members, and deletion for their workspace; effective Editors can author there. Any authenticated user can view an active workspace. Elevated users retain view capability for a workspace that is inactive, while the catalog independently filters inactive workspaces from ordinary discovery. Workspaces are consequently not all private to members.

Provisioned Admin and Editor groups are native ServiceNow membership records and are the authority for ordinary workspace access. The group-pair naming and lifecycle model is documented in [access and provisioning](../reference/access-and-provisioning.md), rather than repeated here.

## ACL and table-access boundary

Eleven server-owned workflow tables have table-level generic `create`, `read`, `write`, and `delete` Deny-Unless ACLs. Each declaration has `adminOverrides: false` and an unconditional `return false;` script:

| Server-owned table |
| --- |
| Workspace Edit Lease |
| Workspace Change Set |
| Workspace Mutation Claim |
| Workspace Snapshot Set |
| Workspace Page Snapshot |
| Workspace Change Entry |
| Workspace Removal Batch |
| Workspace Removal Member |
| Workspace Icon Asset |
| Workspace Member Mutation Command |
| Workspace Provision Request |

The page table also has five unconditional, non-admin-overridable field-write denies: `draft_parent_page`, `draft_sibling_order`, `draft_removed`, `last_draft_changed_on`, and `last_draft_changed_by`. They protect server-owned prospective hierarchy, removal, and attribution fields from generic ACL-evaluated writes.

These protections are distinct from the `workspace` and `page` table declarations, which declare their own supported actions and web-service access. Most workflow tables are package-private and set `allowWebServiceAccess: false`; the workspace and page declarations set `allowWebServiceAccess: true`. The Icon Asset and command/request records have their own declaration details, but their generic CRUD is still denied by the ACL inventory above. `allowWebServiceAccess`, `accessibleFrom`, and application-access flags describe a platform/module boundary; they do not grant an end user permission. The supported path is a scoped server module that performs its own resource and capability checks, not generic Table API access.

## REST and resource authorization

For supported routes, the service resolves the workspace from the requested slug or stable identifier, evaluates the current user's capability on that resolved record, and then resolves any dependent page, attachment, lease, or command. It verifies that the dependent resource belongs to that workspace before acting. This pattern prevents a caller from substituting a page or attachment ID from another workspace after passing a workspace reference.

Representative enforced boundaries are:

| Operation family | Server boundary |
| --- | --- |
| Workspace discovery, settings, creation, and deletion | Catalog/list projections expose only permitted records; creation requires Docsera Admin; settings and deletion require effective workspace-admin capability. |
| Page creation, body/settings mutation, move, and delete | The target workspace is resolved and requires effective authoring capability; parent, page, and destination references must belong to it. Mutations also require the workspace lease and current server projection where applicable. |
| Publish and discard | These are workspace-level commands, not page-level publishing. They require the active edit authority and current server-issued change-set state. |
| Members | Listing, bounded search, assignment, promotion/demotion, and removal require effective workspace-admin capability on the resolved workspace. The service verifies the resulting native membership. |
| Workspace icon and page media | Icon and media identifiers are resolved as resources owned by the requested workspace. Media retrieval requires viewing capability, while authoring-library listing and upload require authoring capability and upload also requires the Edit lease. |
| Edit leases | Acquire, renew, resume, release, and subsequent authoring mutations are tied to the resolved workspace and authenticated holder; a client cannot establish authority by inventing lease data. |

Reader access to a supported published image is deliberately narrower than authoring access: it can retrieve that workspace-owned attachment through the authorized Blob route, but does not permit listing the media library or uploading. See [editor media](../reference/editor/media.md) for attachment validation and lifecycle.

## Lease, mutations, and publishing

An exclusive workspace Edit lease is the prerequisite for authoring. It is workspace-wide, not a historical page lock. The server creates and returns the active change-set identity and revision, owns mutation-command identity/claims, and rejects stale-generation or obsolete-context mutations. Client-provided lease or generation values are inputs to validate against the server state; they are not credentials and must not be predicted, incremented, repaired, or used to replay non-idempotent commands.

The client can retain transient unsaved input and optimistic display state, but those projections do not become an independent authorization or persistence authority. Supported recovery reloads the authoritative projection after an obsolete or stale result. Publish and discard are server-owned workspace operations; Docsera does not implement page-level publishing. The complete concurrency, mutation, and recovery contract is in [publishing and change sets](../reference/publishing-and-change-sets.md).

## Scoped-to-Global boundary

The Global companion is separately owned and intentionally narrow. The scoped application validates and records a provisioning request or a member-mutation command; the companion's asynchronous workers perform the protected native operations:

- provisioning creates the generated Admin/Editor group pair, assigns their scoped roles, and records the resulting workspace/group identities;
- membership changes validate the pair, add/remove the target user in the appropriate native groups, and let the scoped service reread the authoritative outcome; and
- deletion validates generated-group ownership and only deletes the validated workspace pair.

The provisioning Script Include is package-private. The membership Script Include is public for the necessary call shape but has restricted caller access; the scoped app declares the allowed execute privilege. The companion has only the declared Global-to-scoped read/write/create/delete table privileges required for queue/command and workspace/icon processing. Cross-scope declarations allow those application interactions; they neither confer end-user workspace capability nor turn the companion into a general native-group management API.

The bridge validates the Admin/Editor pair as distinct and owned by a Docsera workspace, applies the generated-group contract, and rejects unsuitable targets before touching native membership. The protected command boundary keeps caller-controlled inputs from becoming arbitrary Global group-management requests. See [access and provisioning](../reference/access-and-provisioning.md) and [ServiceNow runtime](../reference/servicenow-runtime.md) for the operational details.

## Content and input safety

Persisted version-1 editor content is structured JSON, not an arbitrary HTML payload. The server validates the canonical envelope before persistence using closed node, mark, nesting, and attribute contracts, then canonicalizes accepted data. Markdown/source conversion uses a constrained parser and a limited inline-HTML path before the same canonical contract is used. This does not mean all HTML is forbidden: supported, constrained inline HTML and sanitized pasted HTML can contribute to the structured document.

Paste handling removes unsafe elements such as scripts, frames, embedded content, images, event handlers, and unsupported styling; it preserves only supported attributes such as validated link URLs and limited text/palette attributes. The resulting ProseMirror content is still constrained by the canonical schema. Link validation is shared by editor, paste, and reader paths. It permits the documented safe protocol set (including HTTP(S), `mailto`, `tel`, and other supported non-JavaScript protocols), rather than HTTP(S) alone. The published reader revalidates the document and renders known structures through React; its rendered links use `_blank` with `noopener noreferrer nofollow`.

Images carry authorized workspace media IDs rather than arbitrary author-supplied source URLs. The reader obtains them through an authorized Blob retrieval route. The editor drag preview does use `dangerouslySetInnerHTML`; its input is built from the constrained editor document/preview path and sanitization boundary, rather than an unconstrained remote HTML source. That localized sink is a limitation worth preserving in review: the safety claim is bounded by the canonical document, paste, and preview-construction contracts, not by an assertion that no HTML sink exists.

For the full structured-document, Markdown/source, and media contracts, see [editor document model and blocks](../reference/editor/document-model-and-blocks.md), [editor Markdown and source](../reference/editor/markdown-and-source.md), and [editor media](../reference/editor/media.md).

## Errors, privacy, and failure boundaries

The reviewed route/service paths return supported invalid, missing-resource, forbidden, conflict/stale, and bounded processing failures rather than trusting caller-supplied identity or returning raw native records. Services obtain requester identity from the ServiceNow user context and set server-owned audit/attribution fields; pending-change projections use privacy-safe attribution rather than making command internals a normal API response.

Provisioning and membership handoffs retain bounded status/failure codes or messages so clients can render a supported outcome without reconstructing privileged work. Media and other expected validation failures similarly use safe route results, while unexpected failures are logged with bounded request metadata. This is evidence for the handlers and projections reviewed here, not a universal claim that every error path in every installed configuration is sanitized.

## Evidence and limits

Current evidence for this reference includes:

- Fluent role, ACL, table-access, and cross-scope declarations under `app/docsera-ui/src/fluent/` and `app/docsera-global-bridge/src/fluent/`;
- scoped capability, workspace, page, lease, publishing, membership, icon, media, and deletion services and their API handlers;
- focused authorization, negative-path, ownership, lease, mutation, Global bridge/worker, canonical document, paste, link, and reader tests; and
- the read-only installed-instance observations in `docs/history/security/RR-007` through `RR-012`, used only as historical supporting evidence.

The current source identity is `x_2300756_docsera`. Historical RR material can mention the superseded `x_82900_docsera` identity and does not establish present installed-instance ACL parity. Neither that historical evidence nor source-focused tests establish arbitrary-instance compatibility, a comprehensive penetration test, complete protection against every integration path, or universal security guarantees. Findings or defense-in-depth ideas from historical reviews are not treated here as confirmed vulnerabilities or as implementation work.

## Source map

Primary implementation locations include:

- `app/docsera-ui/src/fluent/security/` and `app/docsera-ui/src/fluent/tables/`;
- `app/docsera-ui/src/server/workspaces/serviceNowWorkspaceCapabilities.ts` and `serverWorkspaceDomain.ts`;
- scoped workspace, page, lease, publishing, media, icon, and API modules under `app/docsera-ui/src/server/`; and
- Global companion declarations, Script Includes, and workers under `app/docsera-global-bridge/src/`.

Cross-reference [access and provisioning](../reference/access-and-provisioning.md), [publishing and change sets](../reference/publishing-and-change-sets.md), [ServiceNow runtime](../reference/servicenow-runtime.md), and the editor references above when implementing or assessing a specific boundary.
