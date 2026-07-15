# Implementation Notes - Publishing Workflow

Status: implementation note

## Purpose

This note records the repo-side publishing workflow contract implemented in `app/docsera-ui`.

It summarizes repository behavior only. Accepted product requirements remain in the Obsidian vault; see `docs/process/Requirements Source Map.md`.

## Publishing Contract

Publishing is an explicit server-backed action exposed at `POST /api/x_82900_docsera/docsera_runtime/pages/publish`.

Request contract:

- the client may identify the target page by `pageSysId` or `pageSlug`
- the client may provide `workspaceSlug` or `workspaceSysId`
- the client must provide `expectedRevision`
- the client must provide the active page edit-session token
- the client does not provide publishable title, slug, content, actor, or timestamp values

Response contract:

- success returns the normalized updated page record used by the existing workspace projections
- stale persisted draft revision returns `409 draft_revision_conflict`
- lost, missing, or invalid edit-session authority returns a safe non-success response without publishing
- authorization failures return a safe `403`
- unexpected failures use the existing safe redaction path and do not expose table names, sys_ids, ACL internals, or stacks

## Persisted Revision Enforcement

Publishing promotes only the persisted draft revision identified by `expectedRevision`.

Repo-side behavior:

- the publish service loads the authoritative workspace and page state on the server
- the publish write helper rechecks `expectedRevision` against the persisted `draft_revision` immediately before the record update
- if the persisted revision changed, publishing fails without mutating published fields
- publishing does not increment `draft_revision`
- the publish correction does not add any cross-session atomicity claim beyond the accepted edit-session and persisted-draft-revision model

## Edit-Session Guard Integration

Publishing reuses the existing single-writer page edit-session boundary.

Repo-side behavior:

- the publish route calls the existing page edit-lock touch path before any promotion
- publish does not introduce a second concurrency mechanism
- missing, invalid, released, expired, or mismatched lock authority fails the publish request
- successful publish does not release the held edit session and does not switch the workspace back to Live

## Authoritative Server Promotion

The server loads the authoritative draft values and promotes them through a field-scoped page-record update, then rereads the record before returning it.

Promoted fields:

- `published_title`
- `published_slug`
- `published_slug_normalized`
- `published_content_json`
- `published_body_text`
- `published_at`
- `published_by`
- derived `publication_state`

Publish does not rewrite:

- `workspace`
- `parent_page`
- `sibling_order`
- `active`
- `draft_title`
- `draft_slug`
- `draft_slug_normalized`
- `draft_content_json`
- `draft_body_text`
- `draft_revision`

The client cannot override publish-time title, slug, JSON, actor, or timestamp.

Because the publish helper rereads the record after update, the returned page reflects the actual persisted hierarchy, draft state, metadata, and platform-normalized values rather than only the earlier in-memory publish candidate.

If hierarchy/order or draft-only settings change after the publish candidate is assembled but before the write, those fields are preserved. `publication_state` is derived from the persisted draft fields plus the promoted published snapshot that was actually written.

## Publishable Ancestry

Publishing is allowed only when the page can be represented in the Live hierarchy.

Repo-side behavior:

- a root Draft page may be published
- a Draft child may be published when every ancestor already has a published representation
- `published_with_unpublished_changes` ancestors remain valid because they still project in Live mode
- publication fails safely if the direct parent or any higher ancestor is Draft-only
- publish does not auto-publish ancestors, move the page, or reparent the page
- the safe validation message is: `This page cannot be published until all ancestor pages are published.`

## Draft / Published Isolation

Autosave and settings edits remain draft-only.

Current repo-side behavior:

- autosave updates `draft_content_json`, `draft_body_text`, `draft_revision`, and derived `publication_state`
- page settings updates only `draft_title`, `draft_slug`, `draft_slug_normalized`, and derived `publication_state`
- page settings does not rewrite published fields, publish metadata, draft content, draft revision, hierarchy, sibling order, workspace, or active state
- page settings rereads the record after update and returns the normalized persisted result
- neither autosave nor settings writes mutate published fields
- Live mode continues reading the published projection until an explicit publish succeeds

## Failure Atomicity and Safe Errors

Publish failure leaves the previous published snapshot intact.

Repo-side behavior:

- published-field promotion is written through one scoped record update so callers cannot observe a partial publish
- stale revisions, lost locks, slug validation failures, capability failures, and invalid canonical draft content fail without partial publish
- publish-route `500` failures map to `persistence_invariant`; validation and not-found failures retain the safe invalid contract
- invalid canonical draft content now returns the safe publish failure instead of bubbling an unexpected runtime error
- route logging follows the existing safe-redaction pattern and does not expose internal persistence details to the client

## Validation Notes

Validated behavior:

- local regression coverage covers first publish, republishing unpublished changes, field-scoped publish promotion, field-scoped Page Settings persistence, ancestry validation, stale revisions, invalid or missing edit-session authority, unauthorized access, invalid canonical drafts, autosave isolation, hierarchy/order preservation, and publish-route/client persistence-failure classification
- `npm --prefix app/docsera-ui run validate` passes
- bounded PDI verification on `docsera-pdi` passed for:
  - first publication of a draft page
  - publishing unpublished changes on an existing published page
  - hierarchy/order remaining unchanged across publish
  - Draft-child rejection beneath a Draft-only parent if disposable setup is available

PDI verification note:

- unauthorized publish was not exercised live because this environment exposes only the authenticated admin credential
- directly corrupting draft JSON in the table still breaks the existing live page-list projection because Live-mode listing currently parses draft JSON; publish now fails safely, but that projection limitation remains outside this task's persistence contract

## Non-Goals

This note does not add:

- version history
- rollback
- approvals
- scheduled publishing
- archive or unpublish
- publish-button placement or status presentation
- discard unpublished changes

