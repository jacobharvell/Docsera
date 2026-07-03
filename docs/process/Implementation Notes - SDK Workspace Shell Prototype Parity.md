# Implementation Notes - SDK Workspace Shell Prototype Parity

Status: implementation note

## Purpose

This note records the repo-side workspace shell adjustments made in `app/docsera-ui` to move the SDK-native runtime closer to the accepted HTML prototype.

Accepted product requirements in the Obsidian vault remain the source of truth for behavior.

## Summary

The active React/Vite workspace shell now follows the prototype more directly in layout and density.

Implemented behavior:

- split header with workspace identity on the left and breadcrumbs plus controls on the right
- tighter sidebar density with prototype-style search, top new-page affordance, and bottom new-page affordance
- compact page tree rows that render title-only labels
- selected and hover states tuned toward the prototype instead of card-like row treatment
- main content rendered in a centered reading well without the old diagnostic-style toolbar
- right-side table of contents kept as a desktop-oriented structural rail
- developer status retained as a collapsed secondary details block

## Demo Data Boundary

The local demo page model used by the SDK shell no longer implies a persisted page short-description field.

Current repo-side demo page shape:

- `id`
- `title`
- `slug`
- `body`
- `sections`
- `children`

Lead-in copy belongs in page body content, not in the navigation tree.

## Validation Notes

Local tests now cover:

- workspace identity rendering in the header
- breadcrumbs excluding the workspace name
- title-only page tree rows
- selected page updates in the main pane and breadcrumbs
- table of contents updates for the selected page
- ping failure remaining non-blocking while developer status stays secondary

## Non-Goals

This note does not add:

- live ServiceNow persistence
- page CRUD behavior
- page settings behavior
- drag and drop
- TipTap or markdown editing
- publishing workflow
- runtime permission enforcement
