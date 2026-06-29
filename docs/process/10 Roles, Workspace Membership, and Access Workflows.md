# Roles, Workspace Membership, and Access Workflows

Status: accepted requirement reference

## Purpose

This note captures the workspace capability model used by Docsera My Workspaces and the surrounding shell boundary.

## Capability Tiers

- Docsera Admin
- Workspace Admin
- Workspace Editor

## Access Rules

- Docsera Admin counts as Workspace Admin and Workspace Editor.
- Workspace Admin requires the workspace admin role plus membership in the workspace Admin group.
- Workspace Editor requires the workspace editor role plus membership in the workspace Editor group.
- Read-only visibility does not qualify a workspace for My Workspaces.
- Active workspaces may be visible in other shell contexts without appearing in My Workspaces.

## Membership Model

- Workspace capability checks use the generated Admin and Editor group sys_id references stored on the workspace record.
- Group names are diagnostic only.
- No custom workspace membership table is introduced.

## Workflow Notes

- Workspace creation provisions generated Admin and Editor groups.
- The creator is added to the Admin group.
- Workspace settings entry points are visible only for Docsera Admin and Workspace Admin users.
- Workspace Editor users can open the workspace but do not see workspace settings actions.

