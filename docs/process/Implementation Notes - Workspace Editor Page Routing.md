# Implementation Notes - Workspace Editor Page Routing

Status: implementation note

## Purpose

This note records the repo-side editor routing behavior for the active Docsera runtime in `app/docsera-ui`.

Accepted product requirements remain in the Obsidian vault; see `docs/process/Requirements Source Map.md`.

## Route Contract

- Workspace editor URLs now support `?workspace=<workspace_slug>&page_id=<page_sys_id>`.
- `page_id` is the ServiceNow page `sys_id` used for editor selection only.
- Published/read slug routing remains deferred.
- `page_id` is not an authorization grant and does not bypass server-side access checks.

## Selection Behavior

- The browser URL is the source of truth for the selected editor page when `page_id` is present.
- Clicking a page in the workspace tree or breadcrumb updates the URL with `page_id` through client-side history only.
- The app restores the selected page from `page_id` after workspace/page hydration.
- Missing, invalid, inactive, or cross-workspace `page_id` values fall back to the first visible page.
- When the URL is normalized to a fallback page, the app uses `replaceState` so broken route entries do not accumulate.

## Create-Page Behavior

- Creating a page selects the new live page record.
- The URL updates to the new page's `page_id` after creation.

## Deferred Boundary

- Friendly editor slugs are still deferred.
- Published/read routing is still deferred.
- Page slug editing is still deferred.
- Title editing, settings, autosave, conflict handling, publishing, and access-control rewrites remain deferred.

## Validation

The repo-side tests now cover:

- workspace route parsing and query construction
- initial selected-page restoration from `page_id`
- invalid `page_id` fallback and normalization
- tree selection updating the URL
- create-page selection updating the URL

