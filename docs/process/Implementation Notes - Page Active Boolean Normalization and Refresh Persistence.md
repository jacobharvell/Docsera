# Implementation Notes - Page Active Boolean Normalization and Refresh Persistence

## Status

Implemented.

## Summary

Docsera page persistence and listing now normalize ServiceNow boolean values at the page-record boundary so created pages remain visible after a refresh-style reload.

## Behavior

- `createPage` now marks new page drafts active explicitly before save.
- `savePageRecord` continues writing the active flag on insert/update.
- `mapPageRecord()` now normalizes `active` from ServiceNow values such as `true`, `"true"`, `1`, and `"1"`.
- `normalizePageRecord()` now uses the same boolean normalization logic for internal page rows.
- `listWorkspacePages()` still filters inactive records out of the nav tree after load.

## Validation

- Added regression tests for create/save/list persistence, active boolean normalization, inactive/deleted exclusion, and empty-workspace create flow coverage.
- No Playwright/browser smoke testing was run for this fix per request.

## Notes

- This change fixes the create-after-refresh regression without reverting the empty-sidebar behavior.
- The client-side refresh behavior depends on the server returning active pages consistently after reload; the server boundary is now normalized for that path.
