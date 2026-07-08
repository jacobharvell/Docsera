# Implementation Notes - Page Settings Foundation - Title, Slug, and Delete

## Status

Implemented.

## Summary

This task adds the first page-settings surface for the Docsera workspace shell.

The selected page in the workspace tree now exposes a settings affordance that opens a right-side overlay for editing page title and slug, and a delete flow for removing the current page subtree.

The delete root cause was client-side event ordering, not ServiceNow delete mechanics. The delete confirm button lived in a dialog rendered outside the Page Settings overlay subtree, so the document-level `pointerdown` outside-click handler could classify the confirm interaction as outside the overlay, schedule panel close, and unmount the dialog before the later `click` task reached `confirmDeletePageSettings()`.

## Behavior

* The page settings panel opens from the selected page row gear button in the workspace tree.
* The panel is a lightweight right-side overlay with outside-click dismissal, not a full modal-style scrim.
* Title and slug are editable in-place.
* Title and slug changes commit when the panel is dismissed.
* The current page slug is allowed to remain unchanged while saving title edits.
* Slug validation is workspace-scoped and rejects invalid characters and duplicates.
* The delete action opens a confirmation dialog before deletion.
* MVP Delete Page is hard delete, not soft delete.
* Deleting a page removes the selected page and its descendant subtree from `x_82900_docsera_page`.
* After delete, the app navigates to the next visible page when one exists, otherwise it falls back to the nearest visible page in the tree.
* Delete dialog interactions are excluded from Page Settings outside-click closing so confirm can complete before panel teardown.

## Platform Wiring

* Client calls now use dedicated `PUT /pages` and `POST /pages/delete` runtime routes.
* ServiceNow delete uses a POST action route because runtime server scripts cannot safely access request bodies on `DELETE`.
* Server-side page settings handling uses the current workspace capability checks before saving or deleting.
* Page deletion is performed leaf-first for the selected subtree and re-checks the live page list before returning success.
* The server delete path validates the mutation result and re-reads page state before reporting success, rather than trusting optimistic client state.
* The `active` field remains available for general list filtering, but inactive filtering is not the delete mechanism.
* Nav-tree state reconciles delete through immediate subtree removal plus a live page-list refetch.
* The Page Settings overlay styles ship through the SDK-managed runtime stylesheet, so install verification must confirm the CSS asset content as well as the JS bundle.

## Root Cause and Fix

Manual PDI evidence showed normal page-load network traffic but no new Fetch/XHR request when the delete confirmation was clicked. That boundary proved the failure was in the React event/state path before any ServiceNow route was reached.

The durable fix was to keep delete-dialog interactions out of the Page Settings outside-click close path so the confirm action can invoke `serviceNowClient.deletePage()` before any overlay teardown.

## Validation

* `npm --prefix app/docsera-ui run test`
* `npm --prefix app/docsera-ui run validate`
* `npm --prefix app/docsera-ui run install:sdk`

## Regression Coverage

The current regression coverage protects the fix at the app, client, and server layers:

* `app/docsera-ui/src/client/app/App.test.tsx`
  * keeps the delete dialog open through the confirm `pointerdown` path and calls delete once with the selected sysId
  * keeps the delete dialog open until the delete request resolves
  * keeps page settings open and shows a safe error when delete fails
* `app/docsera-ui/src/client/platform/servicenow/client.test.ts`
  * verifies the delete mutation uses the expected POST route, path, and JSON body shape
* `app/docsera-ui/src/server/pages/serviceNowPageSettings.test.ts`
  * verifies subtree deletion, next-page selection, and failure when the deleted subtree remains loadable

## Notes

* This note covers repo-side behavior only.
* It does not change accepted product requirements.
