# Implementation Notes - Page Settings Panel UI

## Status

Implemented.

## Summary

This task polishes the existing Page Settings overlay and delete confirmation dialog in `app/docsera-ui` without changing the underlying page-settings data model, access rules, or commit-on-dismiss behavior.

## Repo-Side Behavior

### Panel top alignment and shell integration

* The Page Settings overlay now starts at the top of the workspace shell so it visually shares the workspace header band instead of starting below it.
* The panel remains a lightweight right-side overlay with no full modal backdrop.
* The panel still opens beside the workspace sidebar and does not permanently resize the editor/viewer or ToC layout.
* Divider lines are styled to read as continuations of the workspace header/sidebar shell edges rather than as a separate floating card.

### Header convention

* The panel header now renders `Page Settings` once only.
* The title uses the workspace-title scale and color treatment.
* The close button uses the standardized icon system with a smaller neutral default state and a distinct hover state.
* The header helper copy under the title was removed.
* A dedicated divider sits under the header to continue the shell divider visually.

### Field styling

* Title and Slug remain the only editable MVP fields.
* Compact property rows now use clearer input-like surfaces for both display and active edit states.
* Focus, invalid, and disabled/read-only states use Docsera runtime tokens.
* Slug helper text is still not persistent; only inline validation messages appear when invalid.

### Delete section layout

* The old danger-zone block treatment and copy were removed.
* A shortened divider below the fields separates the delete area from the editable rows.
* The delete action now uses the standardized trash icon and remains keyboard accessible as a button.
* Footer helper text now appears below the delete action:
  `Changes are saved automatically when you close this panel or click outside of it.`
* The bottom `Collapse` button was removed. Dismissal still works through the existing close X, outside click, Escape when applicable, and the page-row collapse affordance.

### Delete confirmation modal

* The delete confirmation now reuses the existing modal shell structure and token patterns used by the New Workspace modal.
* The dialog title is now `Confirm deletion`.
* For pages without descendants, the body copy is:
  `This will permanently delete [page name].`
* For pages with descendants, the body copy is:
  `This will permanently delete [page name] and any nested pages underneath it.`
* Page names are rendered through normal React text nodes; no unsafe HTML interpolation is used.

### Nested-page detection rule

* Descendant detection uses the already-hydrated client page tree state that backs the workspace shell.
* The warning copy is shown when the selected page has any descendants in that tree, not only direct children.

## Validation Notes

* Regression coverage was updated in `app/docsera-ui/src/client/app/App.test.tsx` for:
  * single Page Settings title rendering
  * removed header helper copy
  * removed bottom Collapse button
  * footer helper copy presence
  * delete dialog title/copy for both leaf and descendant cases
* Visual alignment, border continuity, and hover feel still require Jacob’s manual PDI verification.

## Limitations

* The panel/header integration is implemented through runtime CSS alignment and divider continuity, so final acceptance still depends on live visual verification in the PDI shell.
