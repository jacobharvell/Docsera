# Implementation Notes - Editor Shell and Autosave

Status: implementation note

## Purpose

This note records the repo-side editor shell and autosave contract implemented in `app/docsera-shell`.

It summarizes repository behavior only. Accepted product requirements remain in the Obsidian vault; see `docs/process/Requirements Source Map.md`.

## Editor Baseline

The current editor boundary is a thin, ProseMirror-first shell integration.

Implemented editor behavior:

- the editor host owns a ProseMirror-based document surface
- the editor writes draft body content into the local page model
- the editor surface remains separate from the reader/viewer surface
- TipTap/full editor behavior remains deferred by the existing architecture boundary

## Autosave Behavior

Autosave is a draft-only working-state mechanism.

Current repo-side behavior:

- autosave tracks saved, dirty, saving, and failed states
- autosave updates draft body content only
- autosave never publishes a page
- autosave may retry after further edits when a prior save fails
- navigation and unload protection preserve in-flight draft work where practical

## Visibility Boundary

Viewer-only users do not see editor or autosave controls.

Current shell behavior:

- reader mode shows published content only
- authoring mode exposes the body editor and autosave state
- viewer-only users do not get draft body editing affordances

## Adapter Boundary

The current implementation is local/demo adapter based.

Repo-side notes:

- autosave persists through the local shell state and adapter hooks
- live ServiceNow persistence is not claimed here
- server-side ACL enforcement remains deferred to the platform implementation

## Validation Notes

The local validation harness covers:

- autosave state transitions
- draft-only body updates
- autosave retry behavior after failure
- body editor session cleanup
- authoring-vs-reader shell visibility differences

## Non-Goals

This note does not add:

- version history
- rollback
- comments or reactions
- real-time collaboration
- external AI assistance
- live ServiceNow persistence

