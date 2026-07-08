# Implementation Notes - Header UI Parity Foundation

## Summary

The active React runtime now uses a single Docsera header foundation for both `My Workspaces` and workspace routes.

The historical app-frame header and the separate workspace-only header were removed from the live route path to stop duplicated header surfaces and to bring the runtime closer to the accepted shell prototypes.

## Current Repo-Side Behavior

- `My Workspaces` renders the shared Docsera header with:
  - Docsera brand identity on the left
  - browser-side recent workspace switcher when accessible workspaces are available
  - theme toggle
  - avatar button
- Workspace routes render the same header foundation with:
  - current workspace identity
  - recent workspace switcher
  - page-tree breadcrumbs
  - navigation collapse / expand control
  - theme toggle
  - workspace settings entry point only when `canManageSettings` is true
- The header no longer displays workspace short description text on either route.

## Recent Workspace Switcher

- The switcher reads from the existing `listWorkspaces` client adapter with `pageSize: 10`.
- Ordering is browser-side:
  - recently opened workspace slugs are stored in `localStorage`
  - returned accessible workspaces are re-ordered against that local recent list
- No new server-side recent-access field or persistence model was added in this task.
- If switcher data is unavailable, the header degrades to the current identity without breaking navigation.
- Workspace-route transition state is centralized in the shared header identity model:
  - if the destination workspace identity is already known from the selected recent workspace item or cached switcher data, the header shows that optimistic icon/name while the full workspace record loads
  - if the destination identity is still unknown, the header renders a loading treatment across the icon slot and title slot instead of showing a generic `Workspace` label
- The same loading identity fallback is used for direct workspace URL navigation so the header does not briefly imply a fake workspace name before the real record resolves.

## Theme Toggle

- Theme state is browser-side only.
- The current runtime stores the selected theme in `localStorage` and applies it through the document root `data-docsera-theme` attribute.
- No ServiceNow user preference or server persistence was introduced.

## Role-Sensitive Header Controls

- Workspace settings visibility still depends only on the existing `canManageSettings` value from workspace state.
- Editor/admin-only header actions were not broadened beyond existing runtime role data.
- The Visual/Markdown header toggle remains deferred because the current runtime does not have a real markdown/source editing mode to bind to safely.

## Validation Coverage Added

- App-level regression coverage now checks:
  - single-header rendering on launcher and workspace routes
  - workspace switcher visibility after route changes and workspace creation
  - viewer workspace header hiding admin/editor controls
