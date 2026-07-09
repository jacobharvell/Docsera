# Implementation Notes - Workspace Page Tree UI Parity

Status: implementation note

## Summary

The active workspace shell in `app/docsera-ui` now follows the workspace visual prototype more closely in the left navigation/page-tree area without changing accepted Docsera page-tree behavior.

Implemented behavior:

- removed sidebar-only demo/test nav identity and page-count artifacts from the page-tree body
- kept both root-level page creation entry points:
  - top icon-only toolbar button beside search
  - `+ New page` row inside the tree flow after the final visible page row
- restored real parent/child tree rendering from live `parentPageSysId` data
- added parent-page chevron expand/collapse affordances
- added hover Page Settings gear visibility for editable users across editable rows
- added parent-only child-page `+` hover control for pages that already have children
- aligned the visual nav divider and resize handle in the same coordinate space
- replaced modal page creation in the workspace shell with inline `untitled-page` creation rows
- page-row settings from an unselected row first selects the target page, then opens Page Settings after target selection is stable
- this keeps the selected row visually aligned with the page whose settings panel is open and avoids panel flash or close/reopen behavior
- selected rows now keep their tree action icons visible without requiring hover
- row action icon hover is direct-icon-only: no filled hover chip/background, primary-color icon tint only
- workspace-shell dark mode now uses `#0B0E14` for the main workspace background and `#0F1218` for the left nav tree area

## Page Tree Parity Conventions

- Page tree titles render at `14px`.
- Parent pages are not styled in all caps.
- Parent pages remain normal selectable pages; the visual distinction is hierarchy and chevron affordance only.
- Hover action space is reserved so row titles do not shift when controls appear.
- Viewer-only users do not see authoring controls in the tree.
- Page-row hover uses a selected-state-adjacent tint instead of a white hover fill.
- Page-row hover changes the page title to the Docsera primary color without changing layout.
- Gear and child-page `+` actions only change color on direct icon hover; row hover alone does not add icon fill or auto-highlight the icons.
- Selected rows always show their available action icons.

## Nav Cleanup

- The sidebar no longer renders the redundant workspace/home label block above the real page rows.
- The sidebar no longer renders `pages / role` metadata in the page-tree body.
- The old bottom-pinned sidebar footer button was removed.
- The bottom `+ New page` action is now part of the tree/list flow and moves with the visible list content.

## Resize Behavior

- Width is browser-side and workspace-scoped through versioned localStorage.
- Chosen values:
  - minimum: `180px`
  - default: `280px`
  - maximum: `480px`
- The active storage key is `docsera.workspace-nav-width.v2:{workspaceSlug}`.
- The first-pass key is intentionally ignored so stale narrow saved widths do not override the corrected `280px` default.
- The live workspace nav width drives:
  - left navigation width
  - workspace header identity segment width
  - Page Settings overlay left inset / available width
- The resize handle is centered over the visible divider so the hover/active purple indicator stays attached to the divider line.

## Inline Page Creation

- The top icon button and the bottom `+ New page` row both insert a temporary root-level `untitled-page` row immediately before the bottom `+ New page` row.
- The bottom `+ New page` row remains the final visible row during root-level inline creation.
- The parent-page hover `+` inserts a temporary row as the last child under that parent and forces that parent open if needed.
- Inline creation focuses the title immediately, selects the full `untitled-page` value, and keeps the inline input mounted when the title is cleared back to empty.
- Leaving the default `untitled-page` value unchanged and submitting still creates a page named `untitled-page`.
- Blank or whitespace-only inline titles now cancel creation on `Enter` or blur instead of falling back to `untitled-page`.
- Create failures remove the temporary input row and leave a concise inline error at the same insertion point.

## Page Settings and Delete Behavior

- If Page Settings is launched from an editable row that is not currently selected, the workspace first selects that page and then opens Page Settings for that same page.
- Page Settings opens only after target selection is stable, which prevents flash or close/reopen behavior and keeps the selected row visually aligned with the open settings target.
- Deleting the currently selected page now selects the first remaining page in the rendered tree.
- Delete routing no longer trusts a later server-suggested page if that would override the required client-side selection rule for the current tree state.

## Known Limitations

- Width persistence is browser-side only and resets if localStorage is cleared.
- Collapse state is still session-local and is not persisted browser-side in this pass.
- Inline creation supports one temporary create row at a time in the workspace tree.
