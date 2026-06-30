# Implementation Notes - Page Tree Drag and Drop

Status: implementation note

## Purpose

This note records the repo-side MVP implementation of page tree drag/drop in `app/docsera-shell`.

Accepted product requirements live in the Obsidian vault; see `docs/process/Requirements Source Map.md`.

## Summary

The workspace shell now supports local page-tree drag/drop for users with effective authoring capability.

Implemented behavior:

- draggable page rows for Workspace Admin, Workspace Editor, and Docsera Admin users
- no drag/drop affordances for viewer-only users
- floating drag preview / drag pill using the page title
- before, inside, and after drop targets
- invalid feedback for self-drops, descendant drops, workspace mismatches, and depth violations
- immediate in-memory save of the reordered page tree on a valid drop
- source and destination sibling normalization after a successful move
- preserved selection state through page slug routing after a move

## Domain Support

The page domain now exposes move and depth helpers that the shell uses for validation and mutation:

- `PAGE_TREE_MAX_DEPTH`
- `collectPageAncestorSysIds`
- `resolvePageDepth`
- `resolvePageSubtreeDepth`
- `isPageDescendantOf`
- `validatePageMoveTarget`
- `applyPageMove`

These helpers keep the same-workspace parent constraint in one place and reject circular or over-deep moves before the shell mutates state.

## Shell Integration

The shell currently performs drag/drop against the local demo-backed page array.

Current repo-side behavior:

- drag state is tracked in the shell component state
- the current drop target is resolved from pointer position over the page tree
- successful drops update the local page array immediately
- selected page slug and route target are recomputed from the updated tree
- page settings and page creation remain separate behaviors
- live ServiceNow persistence remains deferred and is not claimed here

## Validation Notes

The local validation harness covers:

- authoring-user drag/drop gating
- viewer-only drag affordance suppression
- page depth and subtree depth helpers
- valid before / after / inside move validation
- self-drop and descendant-drop rejection
- workspace mismatch rejection
- five-level depth rejection
- local shell view model updates after a move

## Non-Goals

This note does not add:

- live ServiceNow persistence
- server-side ACL enforcement
- auto-expanding parents during drag
- page settings parent editing
- publish workflow
- version history
- collaboration or comments
