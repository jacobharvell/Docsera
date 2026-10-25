# Implementation Notes - Workspace Navigation Resizer Stacking

Status: implementation note

## Purpose

This note records the repo-side stacking boundary for the workspace navigation resize control. Accepted shell behavior remains defined by the Obsidian requirements.

## Behavior

- The navigation frame has `z-index: 1` at every side-by-side workspace width.
- The resize button intentionally extends six pixels into the adjacent main-pane grid track. Its parent stacking context therefore must sit above that sibling so the extended target and primary-colored indicator remain visible and pointer-reachable.
- This applies in both Live and Edit. It does not alter the resizer dimensions, persisted width, navigation scrollbar geometry, editor controls, or collapsed-navigation behavior.
- At `920px` and below, the existing stacked layout remains authoritative and hides the resize button.

## Root Cause And Regression Coverage

The prior stacking rule was scoped only to `921px` through `1180px`. Above `1180px`, the adjacent main pane could paint over the portion of the resize target outside the navigation frame, which made the handle unavailable at otherwise side-by-side desktop widths. `WorkspaceShell.test.tsx` protects the shared stacking rule, the desktop and stacked responsive ranges, the extended hit target, native scrollbar spacing, Live/Edit resizing, and collapsed navigation.
