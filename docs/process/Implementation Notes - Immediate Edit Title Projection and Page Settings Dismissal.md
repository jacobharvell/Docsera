# Implementation Notes - Immediate Edit Title Projection and Page Settings Dismissal

## Status

Implemented.

## Summary

This note records the repo-side fix for immediate Edit-mode title projection and non-blocking Page Settings dismissal in `app/docsera-ui`.

## Repo-Side Behavior

### Edit title projection remains presentation-only

* `workspacePagesState` remains server-authoritative and is not updated optimistically just to accelerate shell rendering.
* In Edit mode, the workspace shell derives its presented page title from authoritative page records plus the existing shared `pageSettingsState` title draft when that local title is valid for the matching page.
* The shared draft projection updates the selected heading, page tree, and breadcrumb/path surfaces together so the shell does not split title state across separate local stores.
* Invalid local title input does not replace the tree or breadcrumb label.
* Slug and route canonicalization remain authoritative and are not projected optimistically from local title edits.

### Direct title activation keeps title-line ownership local

* The editable title surface stays inside the existing `InlinePageTitle` header row rather than adding a separate overlay or document-level handler.
* In Edit mode, the title row now stretches horizontally within the page header so empty space to the right of the rendered H1 text remains part of the same inline activation surface.
* Clicks on rendered title glyphs keep the existing direct-title activation path.
* Clicks in trailing title-line whitespace enter the same inline title edit mode, explicitly focus the input, and place the caret at `title.length`.
* The forgiving hit area remains bounded to the title row only. Live mode remains read-only.

### Page Settings dismissal is visually synchronous

* Clicking the Page Settings close button or outside the panel still runs the existing local field-finish and validation contract first.
* If local validation fails, the panel stays open and shows the existing validation feedback.
* If local validation succeeds, the panel closes immediately before any later persistence readiness or `savePageSettings` outcome is resolved.
* The shared Page Settings draft remains in memory while the background save is pending so failure and retry state can be recovered without retyping.
* If persistence is temporarily blocked by existing workspace-write preflight rules, the closed shared draft retains its normalized values and blocking error so the user can reopen Page Settings and recover or retry later.
* Successful save still rebases or clears draft state through the existing late-result and interaction-version protections.

### Failure and readiness semantics stay unchanged

* Publish and Discard readiness still treats unsaved, saving, and failed Page Settings state as blocking.
* Save failure preserves the local title draft and reopenable Page Settings state instead of snapping presentation back to stale server data.
* Navigation that depends on successful Page Settings persistence may still wait for save completion before the route transition commits.

## Validation Notes

* Regression coverage was updated in `app/docsera-ui/src/client/app/App.pageSettings.test.tsx` for:
  * immediate direct-title tree projection before save resolution
  * immediate Page Settings close and outside-click dismissal before save resolution
  * retained projected title after background save failure
  * invalid close blocking with unchanged tree projection
  * cancel restoring the prior projected title
* Regression coverage was updated in `app/docsera-ui/src/client/features/workspaces/WorkspaceMainPane.test.tsx` for:
  * normal inline title activation in Edit mode
  * trailing-whitespace activation and end-caret placement
  * read-only Live-mode title behavior
* Managed validation passed for `page-settings` and `workspace-shell`.
