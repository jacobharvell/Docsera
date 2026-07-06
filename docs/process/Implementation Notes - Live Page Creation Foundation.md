# Implementation Notes - Live Page Creation Foundation

Status: implementation note

## Purpose

This note records the repo-side behavior added for live page creation inside a workspace shell.

Accepted product requirements live in the Obsidian vault; see `docs/process/Requirements Source Map.md`.

## Runtime Boundary

- The SDK-native runtime now exposes a scoped `POST /api/x_82900_docsera/docsera_runtime/pages` route for page creation.
- The browser client calls the runtime through the same same-origin ServiceNow client wrapper used by workspace loading and provisioning.
- The live workspace shell keeps the existing demo shell frame, but newly created pages are appended into the current tree view so the user can select them immediately.

## Page Creation Behavior

- Page creation requires a workspace slug and a non-empty title.
- The server resolves the current workspace, enforces authoring capability, and rejects page creation for users without workspace Admin or Editor access.
- Root-level creation is the current UI path; the server route still accepts an optional parent page reference for the workspace model boundary, but the UI does not expose parent selection yet.
- The created page is persisted as a scoped ServiceNow record with workspace ownership, sibling order, draft title/slug fields, and empty draft body content.

## Slug and Order Assumptions

- Page slugs are generated from the title when a page is created.
- Slug allocation is workspace-scoped and reserves both draft and published slug values already in the workspace.
- Sibling order is allocated within the same workspace and parent page bucket.
- Root-level pages append after the current root-level siblings for the first live slice.

## Access Control

- The server-side create route checks the current user's workspace capability before saving anything.
- Client-side rendering hides the `New page` action for users without authoring capability, but the server remains the source of truth.

## Deferred Boundary

- Body/editor persistence is still deferred.
- The live tree selection uses a small demo-page projection so the created page can be opened immediately without introducing the editor save flow in this task.

