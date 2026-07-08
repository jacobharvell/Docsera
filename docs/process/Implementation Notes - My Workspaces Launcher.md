# Implementation Notes - My Workspaces Launcher

Status: implementation note

## Purpose

My Workspaces is the launcher surface for Docsera authors and admins.

This note summarizes repo-side implementation behavior only. Accepted product requirements live in the Obsidian vault; see `docs/process/Requirements Source Map.md`.

## Page Behavior

- The page is titled My Workspaces.
- A primary New Workspace action is always available.
- The page lists active workspaces where the current user has Docsera Admin, Workspace Admin, or Workspace Editor capability.
- The launcher body uses a single page intro plus a bordered list card that contains the search toolbar, workspace header row, row list, and pagination footer.
- The launcher body follows the authoritative prototype styling for this surface: white page background in light mode, dark app background in dark mode, 1152px max content width, compact 40px primary actions, and a white list card with subtle slate toolbar and footer bands.
- Workspace rows show a compact icon, name, short description when available, and the current user's effective capability label.
- Workspace settings entry points appear only when the current user has Admin capability for that workspace.
- Role and Settings render together in the same row column with explicit inline spacing; Settings remains an inline text action for Admin rows only.

## Search and States

- Search stays inside the list card and keeps the `Search workspaces...` placeholder.
- The search field uses the darker prototype icon color and a border-color-only focus treatment with no focus box shadow.
- Ordinary in-place search filtering does not expose a visible `Updating...` or progress label; stale-response protection remains internal.
- A no-results state appears when the search filter matches nothing.
- An empty state appears when the user has no included workspaces.
- Initial loading, error, empty, and no-results states all reuse the same launcher card shell instead of swapping to unrelated page layouts.
- Search and page changes keep the toolbar, header row, and list card mounted while the next `listWorkspaces` request resolves.
- Search-triggered refreshes preserve the currently rendered input and row shell, reset pagination to page 1, and ignore stale slower responses so focus and visible results do not jump backward.
- Read-only-only workspaces are excluded from the list.
- Inactive workspaces are excluded from the list.

## Workspace Creation

- New Workspace opens a modal.
- Workspace name is required.
- Short description is optional.
- The modal styling follows the authoritative My Workspaces prototype for backdrop, card shell, header, fields, helper note, and footer bands in both light and dark themes.
- Workspace icon selection and upload remain deferred and are intentionally not represented in the modal until approved mockups and requirements exist.
- The modal uses modal-specific button sizing so its `Create Workspace` and `Cancel` actions can match the prototype without affecting the page-level `New Workspace` button.
- Duplicate slugs are handled by the existing workspace domain behavior.
- The creator becomes a Workspace Admin when the provisioning foundation is wired.

## Navigation Boundary

- Clicking a workspace name or row targets the workspace shell boundary as far as the current shell supports.
- Full reader-mode shell behavior now lives in the product shell; My Workspaces remains the launcher entry surface.
- A launcher entry point may also appear in a workspace shell footer or switcher surface when available.
