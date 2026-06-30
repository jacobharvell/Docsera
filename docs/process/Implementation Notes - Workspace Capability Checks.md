# Implementation Notes - Workspace Capability Checks

Status: implementation note

## Purpose

This note records the Docsera workspace capability contract that now exists in the app shell package.

It summarizes repo-side implementation behavior only. Accepted product requirements live in the Obsidian vault; see `docs/process/Requirements Source Map.md`.

## Capability Model

Docsera workspace access is split into three capability tiers:

- Docsera Admin
- Workspace Admin
- Workspace Editor

Visibility is separate from authoring capability:

- active workspaces remain visible to authenticated users by default
- absence from workspace Admin or Editor groups does not block read-only visibility
- inactive workspaces may be hidden by the caller’s view logic

## Capability Rules

### Docsera Admin

A user has Docsera Admin capability when they hold the effective Docsera admin role.

Docsera Admin capability short-circuits the workspace checks:

- Docsera Admin implies Workspace Admin
- Docsera Admin implies Workspace Editor

### Workspace Admin

A user has Workspace Admin capability when both of the following are true:

- they hold the effective workspace admin role
- they are a member of the workspace Admin group stored on the workspace record

Docsera Admin also counts as Workspace Admin.

### Workspace Editor

A user has Workspace Editor capability when any of the following are true:

- they have Docsera Admin capability
- they have Workspace Admin capability for the workspace
- they hold the effective workspace editor role and are a member of the workspace Editor group stored on the workspace record

## Source of Truth

Capability checks use the stored workspace group sys_id references as the primary access boundary.

Required workspace fields:

- `adminGroupSysId`
- `editorGroupSysId`

Notes:

- group names are useful for diagnostics but are not the access reference
- capability logic should not fall back to name matching when sys_id references are present or expected
- missing or broken sys_id references fail safely

## Adapter Boundary

The repository implementation uses an injected service contract in `app/docsera-shell/src/workspaces/workspace-capabilities.js`.

The current contract expects two current-user-scoped adapters:

- `hasRole(roleName)`
- `isMemberOfGroup(groupSysId)`

Assumptions:

- the adapters resolve the current user in the surrounding ServiceNow runtime
- the service layer does not reach directly into ServiceNow APIs in local validation
- PDI wiring can later bind these adapters to `gs.hasRole`, group membership utilities, Script Include helpers, or a similar platform-specific implementation

Role-name assumptions are also injectable:

- `docseraAdminRoleName`
- `workspaceAdminRoleName`
- `workspaceEditorRoleName`

The local service ships with default scoped role-name constants so fake adapters can be exercised without platform wiring.

## Validation Coverage

Local validation currently covers:

- Docsera Admin returns true for all workspace admin/editor checks
- Workspace Admin requires the admin role and Admin group membership
- Workspace Editor requires the editor role and Editor group membership
- Workspace Admin implies Workspace Editor
- role-only access does not grant workspace-specific capability
- group membership alone does not grant workspace-specific capability
- broken or missing group sys_id references fail safely
- active workspace visibility is not blocked by lack of membership
- no custom workspace membership table appears in the workspace domain surface

The validation harness also continues to cover the existing workspace slug and provisioning behavior.

## Remaining PDI Wiring

The repository now has the capability contract, but the following on-instance work may still be needed:

- confirm the final Docsera admin role name in the PDI if it differs from the current default constant
- bind the capability service to live ServiceNow role and group membership APIs
- decide where the service is consumed first, likely workspace settings, page creation, editor access, and publishing guardrails
- preserve the current read-only visibility rule for active workspaces in UI and server-side callers

## Non-Goals

This task does not add:

- a custom workspace membership table
- access request workflows
- private or restricted workspace visibility
- My Workspaces launcher and settings gating
- page or editor behavior
- autosave
- publishing
