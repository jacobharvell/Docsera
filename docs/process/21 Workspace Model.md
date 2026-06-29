# Workspace Model

Status: accepted requirement reference

## Purpose

This note defines the workspace identity contract used by Docsera shell surfaces and provisioning flows.

## Workspace Identity / Generated Fields

### Required user-provided fields

- name

### Optional user-provided fields

- shortDescription

### Required/defaulted fields

- icon
- active

### Generated/platform-managed fields

- workspaceSlug
- createdBy
- createdOn
- adminGroupSysId
- editorGroupSysId

## Rules

- workspaceSlug is the canonical stable identifier for URLs and persistence uniqueness.
- workspace display names do not need to be unique.
- workspace icons are always present, with a built-in Docsera default icon when none is supplied.
- inactive workspaces are excluded from My Workspaces.
- the Admin and Editor group sys_id references are the source of truth for capability checks.
- workspace identity should not rely on display name matching.

## Shell Notes

- The workspace launcher uses workspaceSlug for route targeting.
- The launcher may show the icon, name, description, capability label, and settings entry point.
- Workspace creation should preserve the name, description, icon, slug, and generated group references from the provisioning foundation.
