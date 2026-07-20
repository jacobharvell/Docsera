# Implementation Notes - E3-T11 Workspace Changes Center Foundation

E3-T11 adds the first workspace-level Changes Center read path and Edit-mode header UI. It does not execute workspace Publish, Discard all, or individual Undo.

## Authoritative Pending Read Model

`POST /api/x_82900_docsera/docsera_runtime/workspaces/pending-changes` reads the active workspace pending set through the current held workspace Edit lease. The route validates the lease server-side before reading and returns the active change-set ID, active change-set revision, affected-page count, and ordered rows. This read-specific lease boundary resolves the exact workspace, enforces authoring capability, requires the current caller to hold the supplied non-expired token, and returns the current active generation pair without renewing the lease.

The read path creates no mutation claim, does not advance the active generation revision or next pending sequence, and does not update lease or workflow rows. It does not touch `last_seen_on`, insert/update/delete lease rows, create claims, change pending entries, change removal overlays, change snapshots/selectors, or mutate page records. It uses `workspaceChangeSetDomain.pendingEntries(...)` over persisted change entries, active removal batches, draft overlays, and the selected ready published snapshot.

Rows are ordered by persisted `firstPendingSequence` from oldest to newest. Each affected page identity appears once. Categories remain server-derived and limited to `Added`, `Modified`, `Moved`, `Modified · Moved`, and `Removed`, with Added/Removed precedence preserved by the domain model.

## Titles, Categories, and Attribution

Non-Removed rows use the current persisted Edit projection title. Removed rows use the selected published snapshot title so a page absent from Edit can still be reviewed safely.

Attribution is resolved server-side from the persisted last-changed actor. The display format prefers first initial plus surname, then a safe ServiceNow display value, then `Unknown user`. The response includes an accessible label/full display value for tooltips or assistive text. Login IDs and email addresses are not returned.

Missing page, snapshot, category, or user data fails closed to safe labels such as `Untitled page` and `Unknown user`, or returns a scoped pending-read error when the foundation is invalid. Pending attribution is resolved through an ACL-respecting `sys_user` read boundary. The resolver checks record-level read access and field-level access for every user field used in the response. If the user record or usable name fields are inaccessible, or if the available display value is an email, login ID, email-containing string, sys_id, or other privacy-unsafe identifier, the response uses `Unknown user`.

## Access Boundary

The pending read is not authorized by client mode. The runtime route requires:

- workspace authoring capability through the existing workspace Edit lease service;
- a valid current lease token for the workspace;
- native ACL behavior on the records read by the scoped server code.

Package-private workflow tables remain hidden from generic Table API access. This task does not change OOTB tables, baseline ACLs, or baseline application access.

## Client Refresh and Late Responses

The client calls `getWorkspacePendingChanges(...)` only while Edit mode has a held workspace lease. Pending reads are scoped by workspace slug, workspace sys_id, mode, and lease token. Late responses are ignored if any of those identities no longer match.

Successful persisted body saves, Page Settings saves, page creation, page movement, pending removals, and stale-generation projection recovery request a pending-read refresh. Failed mutations do not locally invent or clear rows. Refresh keeps the prior successful list while a non-destructive read is in flight.

Pending-read failure is not treated as zero changes. The header can open a scoped error state with Retry.

## Header and Dropdown

In Edit mode for users with authoring capability, the header shows a stable Publish control. It remains visible but disabled when the persisted pending set is empty. It does not show a header count.

The Live/Edit toggle is centered in the workspace header area outside the navigation-pane segment. A vertical divider separates Publish from the right-side theme/settings/profile controls. The Publish chevron rotates smoothly between closed and open states.

The Changes Center dropdown is anchored to Publish and contains:

- fixed header: `Changes 1 page` or `Changes N pages`;
- internally scrolling pending-row list;
- row layout with page title, attribution, and category;
- fixed footer positions for disabled `Discard all` and disabled `Publish`.

Non-Removed rows navigate by stable page identity and close the dropdown. Removed rows are not navigable. The dropdown closes on Escape, outside pointer interaction, workspace change, transition to Live, and successful row navigation.

## Save Readiness

The current-page save status moved out of the global header and into the Edit-mode page title row. Live mode and viewer-only users do not show it.

The Changes Center presents a local blocking status when the active editor or Page Settings state is unsaved, saving, or failed. Because commands are deferred, this status only explains why future command controls remain disabled; it does not flush transient state.

## Deferrals

E3-T11 intentionally defers:

- workspace Publish execution and spinner to E3-T12;
- Discard all hover/action/dialog/spinner to E3-T13;
- individual Undo hover replacement/action/dialog to E3-T14.

The E3-T11 layout keeps the final control positions so later command tasks can attach behavior without replacing the dropdown structure.
