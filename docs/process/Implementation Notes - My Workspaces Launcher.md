# Implementation Notes - My Workspaces Launcher

Status: implementation note

## Purpose

My Workspaces is the launcher surface for Docsera authors and admins.

## Compact presentation

At viewport widths of 920px and below, the launcher keeps the existing behavior and authorization model while changing only its presentation:

- the shared launcher header remains one constant-height row with Docsera identity and switcher at left, a full-height divider, and theme/account controls at right;
- the page introduction stacks its authorized New Workspace action below the title and description at full content width;
- the list card keeps search directly above rows, removes the visible desktop column-heading row, and hides role labels while retaining the existing role semantics in row markup; at 680px and below the stacked search control uses its intrinsic height and the full toolbar width;
- workspace identity text truncates to one line, optional descriptions remain omitted when absent, Settings stays right-aligned only for authorized rows, rows without Settings give the full compact grid width to identity, and every row keeps a consistent minimum height;
- the pagination summary precedes a full-width two-column Previous/Next action row.

The expanded presentation above 920px remains unchanged. The existing 680px refinement reduces page and row padding without changing the compact header, row, or pagination arrangement.

This note summarizes repo-side implementation behavior only. Accepted product requirements live in the Obsidian vault; see `docs/process/Requirements Source Map.md`.

## Page Behavior

- The page is titled My Workspaces.
- The workspace-list server response exposes `canCreateWorkspaces`, a server-evaluated Docsera Admin capability for the current user.
- The primary New Workspace action appears only when `canCreateWorkspaces` is true.
- The page lists active workspaces where the current user has Docsera Admin, Workspace Admin, or Workspace Editor capability.
- The launcher body uses a single page intro plus a bordered list card that contains the search toolbar, workspace header row, row list, and pagination footer.
- The launcher body follows the authoritative prototype styling for this surface: white page background in light mode, dark app background in dark mode, 1152px max content width, compact 40px primary actions, and a white list card with subtle slate toolbar and footer bands.
- The launcher route now owns its full-page light-theme white background through an explicit launcher surface class so the shared workspace tint does not bleed into My Workspaces.
- Dark-theme launcher rendering keeps the existing dark background contract and does not force white on the launcher surface.
- Workspace rows show a compact icon, name, short description when available, and the current user's effective capability label.
- Workspace settings entry points appear only when the current user has Admin capability for that workspace.
- Role and Settings render together in the same row column with explicit inline spacing; Settings remains an inline text action for Admin rows only.
- The list header keeps the workspace identity column labeled `Workspace Name` and the combined role/settings column labeled `Role`.
- Settings and enabled pagination actions use the shared Docsera secondary-control hover/focus treatment; disabled pagination actions stay visually disabled and do not expose the enabled hover treatment.

## Search and States

- Search stays inside the list card and keeps the `Search workspaces...` placeholder.
- The search field uses the darker prototype icon color and a border-color-only focus treatment with no focus box shadow.
- Ordinary in-place search filtering does not expose a visible `Updating...` or progress label; stale-response protection remains internal.
- A no-results state appears when the search filter matches nothing.
- An empty state appears when the user has no included workspaces.
- The empty state offers workspace creation only when `canCreateWorkspaces` is true; non-admin users are directed to request access instead.
- Initial loading, error, empty, and no-results states all reuse the same launcher card shell instead of swapping to unrelated page layouts.
- Search and page changes keep the toolbar, header row, and list card mounted while the next `listWorkspaces` request resolves.
- Search-triggered refreshes preserve the currently rendered input and row shell, reset pagination to page 1, and ignore stale slower responses so focus and visible results do not jump backward.
- Read-only-only workspaces are excluded from the list.
- Inactive workspaces are excluded from the list.

## Workspace Creation

- New Workspace opens a modal.
- Workspace creation is an authoritative server boundary: `POST /workspaces` rechecks effective Docsera Admin capability and returns HTTP 403 before provisioning when the current user is not authorized.
- Workspace name is required.
- Short description is optional.
- The modal styling follows the authoritative My Workspaces prototype for backdrop, card shell, header, fields, helper note, and footer bands in both light and dark themes.
- Workspace icon selection and upload remain deferred and are intentionally not represented in the modal until approved mockups and requirements exist.
- The modal uses modal-specific button sizing so its `Create Workspace` and `Cancel` actions can match the prototype without affecting the page-level `New Workspace` button.
- Duplicate slugs are handled by the existing workspace domain behavior.
- Workspace creation does not select or assign an Initial Workspace Admin. Provisioning creates the role-bearing Admin and Editor groups with no automatic membership; the creator remains workspace audit metadata only, and Manage access is the supported workflow for assigning the first Workspace Admin or Editor.

## Navigation Boundary

- Clicking a workspace name or row targets the workspace shell boundary as far as the current shell supports.
- Full reader-mode shell behavior now lives in the product shell; My Workspaces remains the launcher entry surface.
- A launcher entry point may also appear in a workspace shell footer or switcher surface when available.
