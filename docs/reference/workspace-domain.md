# Workspace domain reference

This reference describes the currently implemented workspace domain. A workspace is Docsera's top-level documentation container. For the runtime shape, package ownership, and the `docsera.do` entry point, see the [architecture overview](../architecture/overview.md).

This document intentionally does not define page hierarchy or page content persistence, publishing and change-set protocol, edit-lease lifecycle, or the detailed authorization audit. Those are separate reference areas.

## Workspace record and identity

The scoped `x_2300756_docsera_workspace` table is the authoritative workspace record. It stores:

- a ServiceNow record ID (`sys_id`), display name, and a unique `workspace_slug`;
- a short description and lifecycle status (`active` or `inactive`);
- the creator reference and standard created/updated audit values;
- icon metadata: type (`builtin` or `uploaded`), key, label, and optional asset path;
- layout defaults: whether the table of contents is visible and page width (`readable` or `full`);
- references to the workspace's Admin and Editor native ServiceNow groups;
- selectors for the active pending change set and published snapshot set; and
- `workspace_state_revision`, a non-negative workspace-selector revision.

The slug is the durable workspace routing and lookup identifier; the name is not. Creation derives a lowercase URL-safe slug from the name. Existing workspace slugs and in-flight provisioning-request slugs are reserved, and collisions receive an incrementing suffix such as `-2`. The table's unique constraint remains the durable enforcement boundary. A workspace name is required and is limited to 160 characters; the short description is limited to 240 characters.

The default workspace is active, uses the controlled built-in Docsera workspace icon, has its table of contents visible, and uses readable page width. Settings mutation currently preserves the slug, both group references, lifecycle status, change-set and snapshot selectors, selector revision, and stored page-width value; its mutable settings fields are narrower than the full record shape.

## Access groups and roles

Each provisioned workspace has two distinct native `sys_user_group` records:

- `Docsera_<Workspace_Key>_Admins`, assigned `x_2300756_docsera.workspace_admin`.
- `Docsera_<Workspace_Key>_Editors`, assigned `x_2300756_docsera.editor`.

The Fluent role declarations also define `x_2300756_docsera.admin`. It contains the workspace-admin and editor roles and is the scoped application's administrator role.

These are different concepts:

- A ServiceNow role supplies the application-level permission component.
- Membership in the particular workspace's stored native group supplies the workspace-specific component.
- `x_2300756_docsera.admin` is a global Docsera application-administration override; it is not membership in every workspace Admin group.

The current server evaluator uses the authenticated user's `gs.hasRole(...)` results and `sys_user_grmember` membership for the group sys_ids stored on the workspace. Its effective capabilities are:

| User state | View | Edit | Admin / manage members |
| --- | --- | --- | --- |
| `x_2300756_docsera.admin` | Yes | Yes | Yes |
| `workspace_admin` role **and** this workspace's Admin-group membership | Yes | Yes | Yes |
| `editor` role **and** this workspace's Editor-group membership | Yes | Yes | No |
| Authenticated user with neither elevated relationship, active workspace | Yes | No | No |
| Authenticated user with neither elevated relationship, inactive workspace | No | No | No |

Missing group references fail closed for elevated access. An editor is not an administrator merely because the declared role hierarchy includes editor capability. The create-workspace operation is restricted to the application administrator role, not to a workspace group.

## Discovery and navigation

`docsera.do` is the intended primary user-facing URL; the scoped Direct UI Page remains a separate host entry point as described in the [architecture overview](../architecture/overview.md).

The workspace catalog queries active workspace rows. It supports a case-insensitive name search, sorts by name and then slug, and paginates at 1–50 items (default 10). Before list construction, it evaluates workspace capability and returns only items with an Admin or Editor role label. Consequently, the current launcher’s accessible-workspace list represents workspaces in which the caller has elevated workspace capability, even though the underlying capability evaluator permits any authenticated user to view an active workspace.

The current single-workspace catalog lookup also limits itself to active rows and returns its server-derived role label and settings/member-management flags. It does not itself turn an inactive workspace into a reader-visible record. Reader and page-state behavior are documented separately.

## Creation and provisioning

Creation begins in the scoped runtime after the server verifies `x_2300756_docsera.admin`. The scoped service derives the slug, group names, defaulted metadata, and creator audit identity from the current ServiceNow user, then writes a `x_2300756_docsera_workspace_provision_request` record. The request has `requested`, `processing`, `succeeded`, or `failed` state and carries the resulting workspace and group references when complete. The API can report an immediate success or a pending request that the client follows through the provisioning-status endpoint.

The scoped app is authoritative for Docsera request shape, validation, workspace data, and authorization. The separately owned Global companion has the deliberately limited responsibility that requires Global access: it processes the queued request, creates the two native groups, assigns their scoped Docsera roles, creates the workspace record with those group references, and records a terminal result. It rolls back partially created groups if provisioning fails before the workspace is created.

Neither access group receives the creator automatically. Creation preserves the creator as audit metadata; Manage Access assigns the first Workspace Admin or Editor later. The Global companion is not a general authorization service and does not replace scoped capability evaluation.

## Membership administration

Membership is authoritative in the workspace record's Admin and Editor group references and the corresponding native `sys_user_grmember` rows; Docsera does not maintain a separate durable membership table.

Only a caller with `canManageWorkspaceMembers` (a Docsera Admin or the effective Workspace Admin) may list members, search eligible users, change a member's access, or remove access. Listing merges the two groups with Admin taking precedence when a user appears in both. User search is server-side, returns active eligible users, excludes current members and caller-supplied exclusions, and is bounded. Existing inactive members remain visible and removable.

The scoped service authorizes each operation, validates the stored group pair, and protects the last active Workspace Admin from demotion or removal. It writes a constrained, non-authoritative member-mutation command; the Global companion synchronously processes that command in Global scope. For a valid stored workspace group pair, the companion can:

- set Admin access by adding Admin membership and removing Editor membership;
- set Editor access by adding Editor membership and removing Admin membership; or
- remove access from both groups.

The scoped service re-reads native group membership and reports success only when the requested end state is exact. The command record is a handoff mechanism, not an authority for membership, authorization, or history. The bridge rejects arbitrary or mismatched group pairs before it touches native membership.

## Settings and deletion lifecycle

Settings changes are server-authorized and require effective workspace-admin capability. The implemented save boundary permits a workspace name, short description, controlled icon metadata, and table-of-contents default visibility. It validates workspace identity by sys_id or slug, preserves unrelated workspace state, and handles uploaded-icon claims only after authorization. A replaced uploaded icon is retired only after the authoritative workspace save succeeds.

Workspace deletion is also workspace-admin-only. The server rechecks capability, validates the owned generated Admin/Editor group pair through the Global boundary, and commits deletion by marking the workspace inactive before cleanup. A failed preflight leaves the workspace active. Once the inactive commit succeeds, a cleanup failure is reported as committed-but-incomplete rather than as a no-op; retrying cleanup uses the inactive tombstone.

Cleanup removes workspace-owned pages, change-set and snapshot records and their dependent records, edit leases, mutation commands and claims, icon assets, and relevant attachments. The Global companion deletes only the validated Docsera-owned group pair. Finalization retains the inactive workspace's slug as a tombstone while clearing group, selector, and uploaded-icon references, so an old URL does not silently become a future workspace.

## Source ownership and verification evidence

The principal current sources are:

- Fluent declarations: `app/docsera-ui/src/fluent/tables/docsera-workspace.now.ts` and `app/docsera-ui/src/fluent/security/docsera-roles.now.ts`.
- Scoped workspace services: `app/docsera-ui/src/server/workspaces/serverWorkspaceDomain.ts`, `serviceNowWorkspaceCapabilities.ts`, `serviceNowWorkspaceCatalog.ts`, `serviceNowWorkspaceProvisioning.ts`, `serviceNowWorkspaceMembers.ts`, `serviceNowWorkspaceSettings.ts`, and `serviceNowWorkspaceDeletion.ts`.
- Scoped request handlers: `app/docsera-ui/src/server/api/docsera-runtime-create-workspace.ts`, `docsera-runtime-workspaces.ts`, and `docsera-runtime-workspace-members.ts`.
- Global companion workers and bridges: `app/docsera-global-bridge/src/server/script-includes/docsera-global-workspace-provisioning-bridge.js`, `docsera-global-workspace-membership-bridge.js`, and the corresponding workspace provisioning and membership business rules.

Focused verification evidence includes `app/docsera-ui/test/workspaceDomain.test.ts`, `workspaceProvisioningTrigger.test.ts`, `globalWorkspaceProvisioningBridge.test.ts`, `globalWorkspaceMembershipBridge.test.ts`, and `globalWorkspaceMembershipWorker.test.ts`, plus the focused server tests for catalog, members, settings, and deletion under `app/docsera-ui/src/server/workspaces/`.

This reference is grounded in the current declarations, services, and tests above. It does not treat historical page-level locking or earlier editor-host arrangements as current architecture.
