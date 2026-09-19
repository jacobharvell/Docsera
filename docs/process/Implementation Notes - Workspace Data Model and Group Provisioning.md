# Implementation Notes - Workspace Data Model and Group Provisioning

Status: implementation note

## Purpose

This note records the repo-side workspace persistence and native-group provisioning foundation added for the SDK-native Docsera runtime.

It summarizes repository behavior only. Accepted product behavior remains defined by the Obsidian requirements and current implementation brief.

## Workspace Domain Shape

The shared workspace domain now lives in `app/docsera-ui/src/shared/workspaces/domain.ts`.

The repo-side workspace record shape includes:

- required `name`
- required unique `slug`
- historical shell contract reference: `workspaceSlug`
- optional `shortDescription`
- required `icon` metadata object
- required `status`
- required `adminGroupSysId`
- required `editorGroupSysId`
- required `creatorUserSysId`
- created/updated metadata where the backing adapter can provide it
- required layout defaults:
  - `tocVisible`
  - `pageWidth`

The current default icon is a built-in Docsera icon key:

- Docsera default icon
- `type: builtin`
- `key: docsera-workspace`
- `label: Docsera workspace icon`

Client runtime delivery for that built-in default icon is intentionally different from future custom icons:

- the built-in Docsera workspace icon is imported from `app/docsera-ui/src/client/assets/docsera-default-workspace-icon.png?inline`
- the client ships that default icon as a JS-bundle data URI
- the runtime does not derive a sibling asset URL from `main.jsdbx`, `/uxasset/externals/...`, or other ServiceNow SDK Direct UI Page paths
- this avoids fragile runtime asset URL assumptions in the live PDI shell
- future user-uploaded custom workspace icons should use a ServiceNow-backed storage and delivery model instead of JS-bundle inlining

## Direct UI Page Runtime Asset Guidance

Use JS-bundle inlining only for small built-in runtime assets that must always render, such as the default Docsera workspace icon.

Repo guidance for ServiceNow SDK Direct UI Page runtime work:

- do not derive critical image URLs from `main.jsdbx`
- do not assume `/uxasset/externals/...` sibling paths or `/assets/...` neighbors will be served reliably by the Direct UI Page runtime
- for small built-in assets that must always load, prefer the repo's explicit inline import path such as `?inline`
- do not inline user-provided or runtime data assets into the React bundle
- for uploaded or runtime-managed assets, store only metadata or references in the record and deliver the bytes through a ServiceNow-backed storage path that can enforce workspace access correctly

High-level PDI diagnosis steps for broken image behavior:

1. Inspect the rendered `img src` value.
2. Check Network for the image request status and returned content type.
3. Confirm whether the browser is making a separate image request at all.
4. For intentionally inlined assets, confirm the built runtime bundle contains a `data:` URI instead of a derived runtime asset URL.

The current layout defaults are:

- table of contents visible by default
- readable page width

## Slug Rules

- Workspace display names are not unique identifiers.
- Workspace slugs are the durable routing and lookup identifier.
- Slugs are generated from the workspace name with URL-safe lowercase hyphenation.
- Duplicate generated slugs are silently suffixed with `-2`, `-3`, and so on.
- Example: `hr-docs-2`
- Retained workspace records continue to reserve their slugs.
- The workspace table declares `workspace_slug` as a unique field through Fluent metadata.
- The provisioning flow also rechecks the live reserved slug set immediately before group creation and record insert preparation.
- The repo therefore uses both SDK/table-level unique enforcement and a final server-side reservation recheck.
- Unusable names fall back to the base slug `workspace`.

The final recheck reduces stale-allocation collisions before provisioning continues, but it is still not a full transaction-level retry loop by itself. The unique field on `workspace_slug` is the durable on-instance enforcement boundary.

## Group Provisioning Behavior

Workspace provisioning uses native ServiceNow groups and scoped Docsera roles.

Generated group names follow the accepted underscore-based pattern:

- `Docsera_<Workspace_Key>_Admins`
- `Docsera_<Workspace_Key>_Editors`

The workspace group key is separate from the stored workspace slug and is recalculated if the live slug recheck changes the final suffix before provisioning continues.

The provisioning flow currently does this in order:

1. Create the admin group.
2. Create the editor group.
3. Assign `x_82900_docsera.workspace_admin` to the admin group.
4. Assign `x_82900_docsera.editor` to the editor group.
5. Leave both generated groups empty after role assignment.
6. Preserve the creator as workspace audit metadata without automatically adding the creator to either generated group.
7. Persist the workspace record with group sys_id references.
8. Assign the first Workspace Admin or Editor later through Manage access.

The shared provisioning helper attempts group cleanup if workspace persistence fails and the adapter exposes `deleteGroup`.

## Adapter Boundary

The shared domain/provisioning logic is platform-agnostic.

- Shared domain and provisioning helpers: `app/docsera-ui/src/shared/workspaces/domain.ts`
- Live ServiceNow adapter: `app/docsera-ui/src/server/workspaces/serviceNowWorkspaceProvisioning.ts`
- Create endpoint: `POST /api/x_82900_docsera/docsera_runtime/workspaces`

The live ServiceNow adapter currently uses:

- `x_82900_docsera_workspace` for workspace records
- `sys_user_group` for workspace groups
- `sys_group_has_role` for group-role assignment
- `sys_user_role` lookup by role name
- a server-side current-user capability helper in `app/docsera-ui/src/server/workspaces/serviceNowWorkspaceCapabilities.ts`

The active React shell remains explicitly demo-backed through `app/docsera-ui/src/client/features/workspaces/demoWorkspace.ts`. That demo seed is still the current UI fallback while My Workspaces, live workspace loading, and routing are implemented in later tasks.

## Fluent Metadata Added

The SDK runtime now defines:

- scoped Docsera roles in `app/docsera-ui/src/fluent/security/docsera-roles.now.ts`
- the workspace table in `app/docsera-ui/src/fluent/tables/docsera-workspace.now.ts`
- a workspace create route in `app/docsera-ui/src/fluent/rest-api/docsera-runtime.now.ts`

The workspace table stores the core MVP fields needed for later routing, workspace settings, and capability evaluation. It does not introduce page summary/description fields.

## Validation Strategy

Automated validation currently covers:

- workspace slug generation
- duplicate slug suffixing
- live slug recheck before provisioning
- group naming
- default icon and layout behavior
- workspace provisioning group reference handling
- creator audit metadata versus workspace membership behavior
- empty generated access groups after workspace creation
- rollback cleanup when persistence fails in a test adapter

Validation is local/unit-level for this task because live PDI install and runtime verification still depend on SDK auth plus on-instance metadata installation.

Repository-level follow-up validation reference:

- `npm run validate:shell`

## Manual Verification

When the SDK runtime is installed to a PDI, verify the live provisioning path with:

1. Install the app metadata with the normal SDK flow.
2. Send a same-origin `POST` request to `/api/x_82900_docsera/docsera_runtime/workspaces` as an authenticated user with a JSON body such as:

```json
{
  "name": "HR Docs",
  "shortDescription": "Policies and procedures",
  "icon": {
    "type": "builtin",
    "key": "docsera-workspace",
    "label": "Docsera workspace icon"
  },
  "layout": {
    "tocVisible": true,
    "pageWidth": "readable"
  }
}
```

3. Inspect `x_82900_docsera_workspace` for the new record.
4. Confirm `workspace_slug` is unique and `status` is `active`.
5. Confirm `admin_group` and `editor_group` reference native `sys_user_group` records.
6. Confirm the admin group has `x_82900_docsera.workspace_admin`.
7. Confirm the editor group has `x_82900_docsera.editor`.
8. Confirm the generated Admin and Editor groups have no automatic user membership.
9. Confirm the authenticated creator is stored as `creator` on the workspace record and is not automatically added to the generated Admin or Editor group.
10. Use Manage access to add the first Workspace Admin or Editor after creation.

Expected result:

- one workspace record
- one admin group
- one editor group
- generated Admin and Editor groups have their roles assigned and no automatic user membership
- creator preserved as audit metadata only
- stored group sys_ids on the workspace record

## Remaining Platform Gaps

- No My Workspaces UI reads from the live workspace table yet.
- A server-side capability helper now exists, but broad ACL and route consumption is still future work.
- No workspace settings, archive/delete lifecycle UI, or slug-edit UI is added here.
- Group creation and role assignment are live-adapter code paths, but they still require SDK install and PDI verification before they should be treated as proven on-instance.
