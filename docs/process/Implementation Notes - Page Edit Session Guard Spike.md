# Page Edit Session Guard Spike

## Status / Decision

Complete but unsuccessful. No production page edit-session guard was implemented.
The platform session token is not accepted as Docsera editor-session identity.

## Documented Platform Behavior

- `RESTAPIRequest.body.dataString` is available in the ServiceNow SDK/runtime contract for request-body handling.

## PDI-Observed Evidence

- `String(...)` successfully normalized the platform request-body value.
- Valid JSON returned the controlled allowlisted response.
- Missing and malformed bodies returned controlled `400 invalid_request` responses.
- `GlideSecureRandomUtil` worked in the scoped runtime.
- SHA-256 digest behavior worked in the scoped runtime.
- Plaintext lease credentials were not persisted or exposed during the proof.
- 20 concurrent cold-acquisition rounds were run against the `unique=true` lease-table candidate.
- Every round retained one or two durable lease rows.
- Deterministic one-winner behavior was not established.
- The `unique=true` field declaration did not reliably enforce one durable lease row under contention.
- Ordinary page persistence does not enforce an editor-ownership boundary.

## Inference

- The lease-table acquisition candidate is not safe for a production page edit-session guard.
- E3-T3 is not ready.
- No production guard was implemented from this design.
- No claim is made that the lifecycle remains safely implementable in the current scoped design.
- No claim is made that a global companion is required yet.

## Rejected Design

- The unique-page-row acquisition candidate is rejected.
- The failed acquisition primitive cannot safely gate editable TipTap mounting.
- Renewal, release, takeover, and stale-holder mutation safety do not rescue the failed acquisition primitive.
- The result is a rejected design, not a production-ready implementation path.

## Final PDI State

- All executable and functional proof artifacts were removed.
- Temporary proof-only routes, proof tables, barrier tables, generated proof metadata, proof-only tests, temporary runtime changes, generated keys, and tombstones were removed.
- The only intentionally retained cleanup debt is two inert orphan `sys_db_object` records:
  - `np$x_82900_docsera_lease_spike` / `13512db1c34e8f50c569bf0d0501317e`
  - `np$x_82900_docsera_lease_barrier_spike` / `3e51e9b1c34e8f50c569bf0d0501318c`
- Those two records are not valid functional tables, have no scope, no dictionary fields, no documentation, no package or update names, no underlying table records, and are not executable.
- Production Docsera behavior does not depend on those orphan records.

## Recommendation

The next architecture investigation must identify a different supported single-winner or serialization boundary before production implementation.

## Unresolved Architecture Question

What supported ServiceNow primitive can deterministically serialize one winner per page under concurrent acquisition while remaining scoped and upgrade-safe?
