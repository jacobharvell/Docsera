# Implementation Notes - Page Tree Drag and Drop

Status: implementation note

## Purpose

This note records the repo-side page tree drag/drop implementation in `app/docsera-ui`.

Accepted product requirements live in the Obsidian vault; see `docs/process/Requirements Source Map.md`.

## Summary

The workspace shell supports page-tree drag/drop for users with effective authoring capability.

Implemented behavior:

- draggable page rows for Workspace Admin, Workspace Editor, and Docsera Admin users
- no drag/drop affordances for viewer-only users
- sidebar-panel drag acceptance on `aside.docsera-sidebar`, with tree geometry still resolved from the page-tree viewport
- capture-phase `dragenter` / `dragover` browser acceptance on the sidebar drag surface for internal page drags
- tree-level drag geometry that continuously owns the useful vertical tree area, including row thirds, gap midpoints, and virtual root-level top/bottom destinations
- top destination ownership includes the search row and other sidebar chrome above the first visible root row
- floating drag preview / drag pill using the page title
- before, inside, and after drop targets
- overlay root insertion lines above the first visible page and after the final visible branch
- presentation-anchor normalization that keeps equivalent peer insertion slots on the lower peer's before indicator while leaving movement resolution authoritative
- drag-inside row hover keeps the title color highlight without switching to the selected-state bold weight
- invalid feedback for self-drops, descendant drops, workspace mismatches, and depth violations
- optimistic local hierarchy updates while the workspace mutation boundary runs
- ServiceNow-backed draft movement through the workspace move route and change-set persistence
- source and destination sibling normalization after a successful move
- preserved selection state through page slug routing after a move
- tree geometry and indicator state are transient client UI state
- keyboard page movement through the existing page-actions menu: valid Move up, Move down, Indent, and Outdent commands use the same destination resolver as drag/drop
- movement commands are omitted for filtered trees, viewer-only users, no-op placements, circular placements, and placements that exceed the six-level limit
- `onMovePage` resolves `true` only after the mutation installs the authoritative refreshed hierarchy; the tree then announces a keyboard move and restores focus to the moved page

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

Current repo-side behavior:

- drag state is tracked in the shell component state
- the complete sidebar panel is the browser drag surface during an internal page drag, while the page-tree viewport still supplies geometry and indicator anchor bounds
- tree geometry resolves the current page-tree destination before movement validation
- preview and final drop share the same movement resolver path
- the shell applies an optimistic hierarchy update, then forwards the move through `moveWorkspacePage` to `serviceNowClient.movePage`
- the ServiceNow client calls the runtime `pages_move` route, which persists the draft hierarchy through the workspace change-set service
- the move path enforces the six-level hierarchy limit, with root pages counted as level 1
- selected page slug and route target are recomputed from the updated tree
- page settings and page creation remain separate behaviors
- tree geometry and indicator state remain transient client UI state
- the page-actions menu derives keyboard move destinations from the complete hierarchy, never from the filtered visible rows
- keyboard movement invokes the existing `onMovePage` contract with the resolver-derived parent and sibling rank; it does not create a second mutation path

## Validation Notes

The local validation harness covers:

- authoring-user drag/drop gating
- viewer-only drag affordance suppression
- capture-phase drag acceptance across sidebar descendant transitions
- drop-inside hover retains the base title weight
- page depth and subtree depth helpers
- valid before / after / inside move validation
- self-drop and descendant-drop rejection
- workspace mismatch rejection
- six-level depth rejection
- local shell view model updates after a move
- keyboard movement command availability, resolver-derived destinations, filtered-tree suppression, rejected hierarchy commands, delayed status feedback, and post-update focus restoration

## Non-Goals

This note does not add:

- direct mutation of the published Live projection from drag/drop
- server-side ACL enforcement
- auto-expanding parents during drag
- page settings parent editing
- publish workflow
- version history
- collaboration or comments
