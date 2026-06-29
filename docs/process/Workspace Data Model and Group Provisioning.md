# Workspace Data Model and Group Provisioning

Status: implementation foundation

## Purpose

This note defines the Docsera workspace foundation that now exists in the app shell package.

It is the canonical reference for the workspace identity model, generated group behavior, slug rules, and the platform setup that still has to be completed in the PDI.

## Workspace Model

Docsera workspaces are the root container for documentation content and workspace-level settings.

The current canonical workspace model is represented in `app/docsera-shell/src/workspaces/workspace-domain.js`.

Required workspace identity fields:

- `name`
- `workspaceSlug`
- `shortDescription`
- `icon`
- `active`
- `createdBy`
- `createdOn`
- `adminGroupSysId`
- `editorGroupSysId`

Model notes:

- `workspaceSlug` is the canonical URL key and uniqueness field.
- `workspaceSlug` stays hyphenated and the workspace group key is separate from it.
- `adminGroupSysId` and `editorGroupSysId` are the stored references that future capability checks should use.
- `createdBy` and `createdOn` can rely on ServiceNow platform metadata where that is more natural, but the domain contract keeps them explicit.
- workspaces always have an icon, and the domain contract fills in a Docsera default icon when none is supplied.

## Slug Behavior

Slug generation rules:

- workspace names are normalized to lowercase slug fragments
- non-alphanumeric separators collapse to `-`
- empty or punctuation-only names fall back to `workspace`
- duplicate slugs are silently suffixed with `-2`, `-3`, and so on

Examples:

- `HR Docs` -> `hr-docs`
- `HR Docs` with `hr-docs` already retained -> `hr-docs-2`
- `HR Docs` with `hr-docs` and `hr-docs-2` already retained -> `hr-docs-3`

The group key is derived separately from the workspace name and slug so that ServiceNow group names stay underscore-based:

- `HR Docs` -> `HR_Docs`
- `HR Docs` with `hr-docs-2` -> `HR_Docs_2`

## Generated Group Behavior

Each workspace generates two native ServiceNow groups:

- `Docsera_<Workspace_Key>_Admins`
- `Docsera_<Workspace_Key>_Editors`

Behavior:

- the workspace creator is added to the generated Admin group
- group sys_ids are stored on the workspace record as the source of truth
- capability checks should use the stored group references rather than group names
- no custom workspace membership table is introduced
- group names never rely on the URL slug directly

Scoped role assignment:

- the domain layer includes role names for the generated Admin and Editor groups
- if the app roles exist in the PDI, the provisioning flow should assign them during workspace creation
- if the roles are not yet configured, the rest of the provisioning flow can still run and the manual setup note below should be followed

## Persistence Model

The current code establishes the domain contract in `app/docsera-shell/src/workspaces/workspace-domain.js`.

The module currently treats workspace persistence as a platform-backed record with:

- a unique workspace slug
- optional description and icon metadata
- active lifecycle state
- stored Admin and Editor group references
- creator metadata

The exact ServiceNow table and field implementation still needs to be wired in the PDI if it is not already present.

## Local Validation

From `C:\Dev\Docsera`:

```powershell
npm run validate:shell
npm run validate
```

Validation currently covers:

- workspace slug generation
- duplicate slug suffixing
- generated group naming
- draft workspace construction
- provisioning call sequence using fake adapters
- repository-level docs validation

## Manual PDI Verification

Use these steps after the workspace table and on-instance script wiring are in place:

1. Create a workspace record through the intended ServiceNow creation path.
2. Enter the workspace name `HR Docs`.
3. Save the record.
4. Create a second workspace with the same name.
5. Confirm the second record receives the next available slug.
6. Confirm the Admin and Editor groups are created with the expected names.
7. Confirm the workspace creator is a member of the Admin group.
8. Confirm the workspace record stores the Admin and Editor group sys_ids.

Expected result:

- the first workspace gets `hr-docs`
- the second workspace gets `hr-docs-2`
- the generated groups follow the `Docsera_<Workspace_Key>_<Role>` pattern
- the creator is in the Admin group
- capability checks can read group sys_ids from the workspace record

## Remaining Platform Setup

The repository now has the domain contract, but the following PDI work may still be needed:

- create or map the actual workspace table
- wire the workspace create flow to the domain contract
- create the scoped roles referenced by the provisioning module if they do not already exist
- connect group creation, group-role assignment, and creator membership to the on-instance implementation

## Non-Goals

This task does not add:

- a custom workspace membership table
- workspace archive/delete/restore behavior
- My Workspaces UI
- page persistence
- page tree behavior
- editor behavior
- autosave
- publishing
