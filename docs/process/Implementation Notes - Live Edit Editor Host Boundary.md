# Implementation Notes - Live Edit Editor Host Boundary

Date: 2026-07-02

Status: implementation note

## Purpose

This note records the durable repo-side implementation boundary for Docsera's productized Live/Edit page mode split and child editor host scaffold.

It summarizes current repository behavior only. Accepted product behavior remains defined by the Obsidian requirements, especially the Live/Edit separation, workspace shell, editor placeholder, and publishing model notes.

## Current Repo Behavior

The Docsera shell now models page view mode explicitly:

- `live` is the default page experience
- `edit` is available only when the current shell state has effective editing capability and a selected page

Viewer-only users stay in Live mode only and do not see the page-level Edit control.

## Parent Shell Responsibilities

The parent shell remains responsible for:

- workspace selection, page selection, navigation state, breadcrumbs, page tree, and table of contents
- the page-level Live/Edit switch and viewer-only hiding of Edit controls
- deciding whether the page content well renders the lightweight reader surface or the child editor host
- autosave session orchestration, local/demo draft updates, publish action wiring, and shell-visible status copy
- preserving the selected workspace and selected page when switching between Live and Edit

The parent shell does not create or own a ProseMirror `EditorView`.

## Child Editor Host Responsibilities

The dedicated child host is `x-82900-docsera-page-editor-host`.

It is responsible for:

- owning the ProseMirror runtime lifecycle
- watching parent-provided editor input attributes
- mounting inside its own shadow-root-scoped surface and passing that shadow root into ProseMirror runtime initialization
- tearing down the editor runtime when disconnected
- emitting narrow upward events for ready, content-change, and host-error signals
- containing initialization failure so the surrounding shell remains mounted

## Current Handoff Shape

The parent shell passes editor inputs through host attributes:

- `data-page-sys-id`
- `data-editor-content-json`
- `data-shell-theme`

The child host emits:

- `docsera-editor-host-ready`
- `docsera-editor-host-change`
- `docsera-editor-host-error`

This keeps the shell data-oriented while avoiding parent reach-in to child-owned editor DOM or runtime objects.

## Live Mode Behavior

Live mode is intentionally separate from publishing state.

- reader-only users continue seeing only published content
- editors/admins keep the authoring/navigation shell, but Live mode renders the reader surface instead of the editor host
- for published pages with unpublished changes, Live mode uses the published reader-facing content
- for draft-only pages selected by an editor/admin, the current local/demo repo behavior still shows the draft page in the shell; this remains a temporary implementation detail until the open requirement question is resolved

## Current Local/Demo Limitations

The current implementation remains local/demo/adaptor-backed:

- autosave updates local in-memory demo page state only
- capability checks still use the local/demo capability service in the executable shell
- server-side ACL enforcement, live persistence, and instance-backed routing are still deferred
- the child host is registered with the shell bundle, but Live mode does not mount or initialize the child editor host unless the user enters Edit mode
- Markdown/source editing remains deferred; the shell exposes Visual editor status only in Edit mode

## Validation Status

Validated locally through repository shell validation.

PDI runtime smoke for the new Live/Edit boundary and child host remains manual follow-up unless explicitly run in a later task.

## Deferred Work

This task does not claim completion of:

- TipTap integration
- Markdown/source editing
- full toolbar behavior
- live ServiceNow persistence
- server-side ACL enforcement
- production publish workflow hardening
- iframe isolation
