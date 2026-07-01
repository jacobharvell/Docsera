# Implementation Notes - Publishing Workflow

Status: implementation note

## Purpose

This note records the repo-side publishing workflow contract implemented in `app/docsera-shell`.

It summarizes repository behavior only. Accepted product requirements remain in the Obsidian vault; see `docs/process/Requirements Source Map.md`.

## Publishing Contract

Publishing is an explicit action that promotes the current draft into the published fields.

Implemented workflow behavior:

- draft records publish to published records through an explicit publish action
- `draft` transitions to `published`
- `published_with_unpublished_changes` transitions to `published`
- draft title, slug, body content, and body text are promoted into published fields
- empty draft body text publishes as an empty published body text

## Visibility Boundary

Viewer-only users see published content only.

Repo-side behavior:

- viewer-only page selection uses published title, slug, body content, and body text
- draft fields stay in the authoring path
- draft content JSON is not exposed through viewer-only tree, breadcrumb, or reader body state

## Interaction With Other Shell Workflows

Publishing is separate from autosave and page settings edits.

Current repo-side behavior:

- autosave updates draft body content only and does not publish
- page settings title and slug edits update draft fields only
- navigation does not publish
- publish attempts should flush pending body autosave where practical before commit
- if publish fails, draft and working content remain intact

## Adapter Boundary

The current implementation is local/demo adapter based.

Repo-side notes:

- published field promotion is handled in the shell/domain layer
- live ServiceNow persistence remains deferred
- server-side ACL enforcement remains deferred to the platform implementation

## Validation Notes

The local validation harness covers:

- draft-to-published promotion behavior
- published_with_unpublished_changes transition behavior
- empty draft body publishing
- viewer-only published-content visibility
- publish action state resolution

## Non-Goals

This note does not add:

- version history
- rollback
- approvals
- scheduled publishing
- archive or unpublish
- live ServiceNow persistence
- server-side ACL wiring

