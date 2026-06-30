# Implementation Notes - My Workspaces Launcher

Status: implementation note

## Purpose

My Workspaces is the launcher surface for Docsera authors and admins.

This note summarizes repo-side implementation behavior only. Accepted product requirements live in the Obsidian vault; see `docs/process/Requirements Source Map.md`.

## Page Behavior

- The page is titled My Workspaces.
- A primary New Workspace action is always available.
- The page lists active workspaces where the current user has Docsera Admin, Workspace Admin, or Workspace Editor capability.
- Workspace rows show the icon, name, short description when available, and the current user's effective capability label.
- Workspace settings entry points appear only when the current user has Admin capability for that workspace.

## Search and States

- The list can be filtered by workspace name or short description.
- A no-results state appears when the search filter matches nothing.
- An empty state appears when the user has no included workspaces.
- Read-only-only workspaces are excluded from the list.
- Inactive workspaces are excluded from the list.

## Workspace Creation

- New Workspace opens a modal.
- Workspace name is required.
- Short description is optional.
- A default Docsera icon may satisfy the icon requirement until the icon picker exists.
- Duplicate slugs are handled by the existing workspace domain behavior.
- The creator becomes a Workspace Admin when the provisioning foundation is wired.

## Navigation Boundary

- Clicking a workspace name or row targets the workspace shell boundary as far as the current shell supports.
- Full reader-mode shell behavior now lives in the product shell; My Workspaces remains the launcher entry surface.
- A launcher entry point may also appear in a workspace shell footer or switcher surface when available.
