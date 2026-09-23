# Implementation Notes - Recent Workspaces Client Recency

## Summary

The header Recent Workspaces menu is a client-side MRU projection of successfully accessed workspaces. It is intentionally lightweight browser state and does not add ServiceNow schema, table fields, or server-side recency persistence.

## Client Persistence Boundary

- Recent history is stored in `localStorage` as workspace slugs only.
- Storage is scoped by authenticated `userSysId` from the successful runtime ping so authenticated users sharing a browser do not share one menu history.
- Local runtimes without a configured backend ping use a local-only scope for development and test behavior.
- The list is normalized to unique slugs and capped at 10 entries.

## Access and Resolution Contract

- A workspace is recorded only after `getWorkspace()` resolves it as an accessible workspace for the current route.
- Route changes, failed workspace lookups, missing workspaces, and unauthorized or inaccessible workspace responses do not create recent history.
- Persisted slugs are resolved through `getWorkspace()` and rendered in stored MRU order.
- Persisted slugs that are confirmed inaccessible or missing are pruned from storage.
- The Recent Workspaces menu does not backfill empty slots from `listWorkspaces()`; the full My Workspaces launcher remains the alphabetically sorted workspace list.

## Regression Coverage

`App.workspaceShell.test.tsx` covers direct successful access recording, MRU ordering, re-access deduplication, the 10-entry cap, failed lookup exclusion, recent workspaces outside the first listed workspace page, no alphabetical backfill, pruning inaccessible persisted entries, reload persistence, and authenticated-user separation.
