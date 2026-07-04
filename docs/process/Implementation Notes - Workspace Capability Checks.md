# Implementation Notes - Workspace Capability Checks

Status: implementation note

## Purpose

This note records the current repo-side workspace capability contract used by the SDK-native Docsera runtime.

It summarizes implementation behavior only. Accepted product requirements remain in the Obsidian requirements notes and the current implementation brief.

## Capability Model

Docsera workspace access is split into three capability tiers:

- Docsera Admin
- Workspace Admin
- Workspace Editor

The current evaluator returns:

- `canViewWorkspace`
- `canEditWorkspace`
- `canAdminWorkspace`
- `canManageWorkspaceMembers`

## Visibility and Access Rules

- active workspaces are viewable by authenticated users by default
- unrelated authenticated users do not get edit or admin capability
- inactive workspaces are not viewable by unrelated authenticated users by default
- users with effective workspace edit or admin capability can still access inactive workspaces

## Role and Group Rules

Default scoped role names:

- `x_82900_docsera.admin`
- `x_82900_docsera.workspace_admin`
- `x_82900_docsera.editor`

Workspace capability is evaluated against the stored workspace group sys_id references:

- `adminGroupSysId`
- `editorGroupSysId`

Rules:

- Docsera Admin short-circuits the workspace-specific checks and grants all four capabilities
- Workspace Admin requires both the scoped workspace-admin role and membership in the stored workspace Admin group
- Workspace Editor requires either admin capability or both the scoped editor role and membership in the stored workspace Editor group
- Workspace Editors are not treated as workspace admins
- missing or broken group references fail safely and do not grant elevated access

## Adapter Boundary

The implementation is split across:

- platform-neutral evaluator: `app/docsera-ui/src/shared/workspaces/domain.ts`
- ServiceNow current-user adapter: `app/docsera-ui/src/server/workspaces/serviceNowWorkspaceCapabilities.ts`

The pure evaluator depends on injected current-user adapters:

- `hasRole(roleName)`
- `isMemberOfGroup(groupSysId)`
- `isAuthenticated`

The live ServiceNow adapter currently binds those checks to:

- `gs.getUserID()`
- `gs.hasRole(...)`
- `sys_user_grmember`

## Validation Coverage

Local validation currently covers:

- default active-workspace viewer access for authenticated users
- inactive workspace restriction for unrelated authenticated users
- Docsera Admin override
- workspace Admin role plus group membership
- workspace Editor role plus group membership
- view-only access for unrelated authenticated users on active workspaces
- safe failure when stored group sys_ids are missing

## Remaining Gaps

- the helper exists server-side, but broad route and ACL consumption is still future work
- no custom workspace membership table is introduced
- no access-request workflow or private workspace model is added in this task
