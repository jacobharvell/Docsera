# Implementation Notes - E5-T2.7 Media Lifecycle Hardening

Status: implementation note

## Purpose

This note records the confirmed repo-side behavior for the E5-T2.7 media lifecycle hardening slice.

## Confirmed Contract

- Canonical image document JSON survives the existing save/load/reload path without resolved URLs or other runtime-only media data entering persisted content.
- Draft and Live projections can carry different image references and metadata until Publish updates the workspace snapshot transition.
- Publish promotes the active draft image JSON through the existing workspace publish path and does not create, copy, replace, or delete workspace media assets.
- Discard restores the authoritative persisted/published document state while leaving workspace media intact.
- Page deletion retires document references through the existing pending-removal path without mutating workspace media assets.
- Workspace media retrieval continues to fail closed on the established access boundaries, including foreign-workspace ownership rejection and no-view access.
- Page/session transitions in the editor runtime clear transient image preview state so it does not leak across sessions.

## Regression Coverage

- `app/docsera-ui/src/server/workspaces/serviceNowWorkspaceChangeSetPersistence.test.ts`
- `app/docsera-ui/src/server/workspaces/serviceNowWorkspaceMedia.test.ts`
- `app/docsera-ui/src/client/editor/PageEditorHostRuntime.core.test.tsx`

