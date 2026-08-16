# Implementation Notes - Frontend ServiceNow Runtime Communication

## Status

Reference note.

## Purpose

This note captures durable lessons for React UI actions that mutate ServiceNow-backed state in Docsera.

It is repo-side guidance only. Accepted product behavior remains defined elsewhere.

## Rules

### Evidence-First Mutation Debugging

When a React action is expected to call ServiceNow, verify the browser Network request first.

* If no Fetch/XHR request appears, debug the React event path, guard conditions, state refs, portal or dialog containment, and stale bundle possibility before looking at server code.
* If a request does appear, inspect method, URL, payload, status, and response body before changing code.

### React Overlay and Dialog Containment

Document-level outside-click handlers, especially `pointerdown`, can run before `click`.

* Portals or dialogs rendered outside an overlay subtree must be included in containment checks or explicitly marked safe.
* A confirm button must not be treated as an outside click.
* Regression coverage should model realistic ordering, including `pointerdown`, timer boundaries, and `click`.
* When a portaled menu or dialog owns a user action, the regression harness must render through the real container, install the real owner-document dismissal listener, and exercise the actual activation event used by the component. Do not require a fabricated compatibility `mousedown` step when the production handler runs on `click`.

### Async Mutation UI Contract

Destructive dialogs should not close as success before the async mutation succeeds.

* Failure keeps the dialog or panel open and shows a safe error.
* Pending state should prevent duplicate or conflicting actions where practical.
* Cancel or backdrop dismissal may close without calling the mutation.
* Confirm must call the mutation exactly once with the intended record `sys_id`.

### React-to-ServiceNow API Contract

For ServiceNow actions that need JSON request bodies, use routes that support bodies.

* Avoid `DELETE` routes that depend on reading a JSON request body.
* For action-style destructive operations, a `POST` action route is acceptable when the operation requires a structured body.
* Client tests should verify method, path, and body shape for each mutation route.

### Server-Side Mutation Verification

Server routes should validate authorization and record ownership.

* Delete logic should check `deleteRecord()` results and re-query or verify the target records are gone before returning success.
* Do not rely on optimistic client state as proof of server mutation.
* For Docsera Page Delete MVP, hard delete is the accepted behavior; `active=false` is not the delete mechanism.

### Regression Expectations

Regression coverage should exercise the full user path, not only lower-level helper normalization.

For a new or fixed ServiceNow mutation, coverage should prove:

* user interaction reaches the client API call
* the correct `sys_id` or body is sent
* the dialog or panel does not close before success
* failure preserves visible error state
* successful server response reconciles local or refetched state
* portaled menu actions execute once against the real transaction path when the installed runtime can dismiss the surface before `click`

### PDI Manual Validation

When behavior is unclear, manual PDI validation should include a Network check.

Capture:

* request method
* request URL
* payload
* status
* response body
* post-action list or refetch behavior when relevant

If no request appears, report that explicitly and stop server-side troubleshooting.

## Notes

This guidance is intended to keep future React-to-ServiceNow debugging rooted in observable browser evidence and durable mutation contracts.
