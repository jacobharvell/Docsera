# Implementation Notes - Page Settings Overlay Interaction Fix

Status: implementation note

## Purpose

This note records the repo-side interaction fix for the Docsera page settings surface in `app/docsera-ui`.

It summarizes behavior implemented in the local runtime only. Accepted product requirements remain defined in the Obsidian vault; see `docs/process/Requirements Source Map.md`.

## Summary

The page settings panel now behaves as a fixed overlay anchored beside the workspace sidebar rather than as a layout column.

Implemented interaction changes:

- the panel no longer participates in the workspace grid layout
- opening page settings does not resize or reflow the editor/content area
- outside clicks are handled from a document-level pointerdown listener while the panel is open
- clicks anywhere outside the panel close it, including sidebar navigation, search, editor content, header areas, TOC, and blank workspace space
- clicks inside the panel remain inside the overlay containment boundary
- page-row navigation clicks preserve the intended destination page when dismissal and navigation happen together

## Shell Integration

Current repo-side behavior:

- the overlay is rendered as a fixed-position panel with no modal scrim/backdrop
- the panel is anchored to the left side of the workspace content region beside the sidebar
- valid edits still save when the panel is dismissed
- page-row settings triggers are exempted from the generic outside-dismiss capture to avoid open/close races
- at the compact workspace breakpoint, a Page Settings action from an open navigation drawer temporarily replaces that drawer before forwarding the requested page ID to the existing settings/navigation flow; this applies both to the current page and to another page selected by its action
- after a valid local dismissal through the close control, Escape, or an outside click, the shell immediately reopens the originating compact drawer without waiting for a pending settings save; invalid settings remain open and do not restore navigation
- the temporary return intent is app-owned and is cleared when the user leaves the workspace, changes workspace mode, or exits the compact layout, so unrelated transitions do not reopen navigation

## Compact Essential Surfaces

Shared dialogs retain a horizontal title/close-control header at narrow widths. Titles may wrap inside their text space, while the close control keeps its standard fixed button size. Centered dialogs are bounded to the visible viewport and scroll only when their contents exceed that bound, keeping their close, cancel, and confirmation actions reachable. The Add Members dialog keeps its two independently scrolling lists; its outer dialog receives a bounded height and its list viewport contracts on short screens rather than forcing the footer outside the viewport.

## Validation Notes

The local validation harness covers:

- overlay dismissal from outside panel interaction
- inside-panel interaction remaining open
- sidebar navigation dismissal and navigation target preservation

## Non-Goals

This note does not add:

- a modal scrim
- centered dialog behavior
- layout-column placement for the panel
- any new persistence model or platform wiring

