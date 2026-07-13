# Implementation Notes - Scoped Page Serialization Boundary Spike

Date: 2026-07-13

Status: Gate 1 passed for deterministic page-lock cold acquisition

## Clarified Requirement

This spike only needed to settle Docsera's practical page-entry lock requirement:

- when the first user clicks into a page body, Docsera acquires one exclusive page-edit lock for that page;
- if two users contend at the same time, exactly one wins and the loser remains read-only with a controlled notification;
- Docsera does not require immediate user-driven takeover of an existing lock;
- abandoned locks may expire through scheduled cleanup before another normal cold-acquisition attempt;
- this is a collaborative-editing guard, not a general-purpose distributed transaction serialization requirement.

## Documented ServiceNow Behavior

Documented SDK/runtime behavior used in this spike:

- Fluent `Table.index` is a supported table-level property.
- The `Table` API documents `index` as a list of column references that generates table indexes in metadata XML.
- Scoped `GlideRecord.insert()` returns the inserted `sys_id` or `null`.
- Scoped `GlideRecord.getLastErrorMessage()` remains available to scoped server code after the insert attempt.

This spike did not establish any official documentation that a `sys_index` query is the authoritative physical-index verification boundary for SDK-declared table indexes.

## PDI-Observed Evidence

### Proof surface

The spike used one proof table and one proof REST route:

- table: `x_82900_docsera_spike_claim`
- REST API: `Docsera Serialization Spike API`
- route: `POST /api/x_82900_docsera/docsera_serialization_spike/gate1/acquire`

The proof table declared:

- field-level `page_key.unique = false`
- table-level `index: [{ name: "page_key_unique", element: "page_key", unique: true }]`

### Generated metadata evidence

Repo-side generated XML for `x_82900_docsera_spike_claim` contained an explicit unique index block:

- `<index name="page_key_unique" unique="true">`
- `<element name="page_key"/>`

This is sufficient repo-side evidence that the supported SDK declaration emitted the intended table-level index metadata.

### Instance inspection evidence

Observed after install on the PDI:

- `sys_db_object` returned `x_82900_docsera_spike_claim`
- `sys_dictionary` for `x_82900_docsera_spike_claim.page_key` returned `unique=false`
- the attempted `sys_index` query for `logical_table_name=x_82900_docsera_spike_claim` returned zero rows

Interpretation:

- `sys_dictionary.unique=false` does not invalidate this proof because the spike intentionally used a table-level index rather than field-level uniqueness;
- the missing `sys_index` query result is an unresolved metadata-inspection limitation;
- this note does not treat that missing query result as proof that the supported SDK index was absent or unsuitable.

### Contention evidence

Gate 1 ran 20 rounds with 10 concurrent contenders per round.

Observed in every round:

- exactly one durable row remained for the page key;
- one request returned controlled `201 winner`;
- nine requests returned controlled `409` loser responses;
- loser inserts returned `null`;
- `getLastErrorMessage()` remained readable;
- scoped follow-up reads and logging still ran in the same request.

Representative loser path behavior:

- `insertResultSysId=null`
- `code=insert_returned_null`
- `lastErrorMessage` contained the insert failure for `x_82900_docsera_spike_claim`

Observed conclusion from Gate 1:

- the explicit table-level SDK unique index behaved differently from the prior field-level `unique=true` candidate;
- on this PDI, it provided deterministic one-winner cold acquisition for simultaneous page entry.

## Conclusion

Gate 1 passed for deterministic page-lock cold acquisition.

This spike supports the clarified business requirement because:

- the SDK declaration was supported;
- the generated XML contained the explicit unique index;
- the PDI contention runs produced one durable winner and nine controlled losers in all 20 rounds.

The missing `sys_index` query result remains unresolved, but it is recorded as an inspection limitation rather than as a rejection criterion.

Gates 2 and 3 were not required to settle simultaneous page-entry acquisition and were not attempted:

- Gate 2: immutable successor serialization
- Gate 3: stale-safe page mutation boundary

No conclusion is made here that immutable successor serialization was either proven or disproven.

No global single-consumer worker is required or recommended from this spike.

No immediate user-driven expired-lock takeover is required.

## Proposed Production Lifecycle

The supported next production shape for the clarified requirement is:

1. Acquire a page lock by inserting one unique lock row per page.
2. Return an immutable lock ID/token to the winning browser.
3. Return a controlled locked response and current-holder information to losing browsers.
4. Maintain the lock with a heartbeat independent of content changes.
5. Require the exact lock ID/token for heartbeat, autosave, and release.
6. Release only the exact lock held by the requesting browser.
7. Remove abandoned locks through scheduled stale-lock cleanup.
8. Do not allow a browser to directly delete or take over another holder's existing lock.
9. Reject an old browser's later heartbeat or autosave when its lock no longer exists or no longer matches.

This lifecycle is a proposed production design derived from Gate 1. It was not implemented in this spike.

## Repo Closeout

The branch removes all proof-only executable and generated repo artifacts from this spike:

- harness script
- proof REST API Fluent definition
- proof table Fluent source
- proof route source and tests
- proof schema tests
- generated key entries attributable only to those proof artifacts

The retained repo artifact is this implementation note.

## Retained PDI Proof Artifacts

The already-installed PDI proof artifacts are intentionally left in place:

- table: `x_82900_docsera_spike_claim`
- REST definition: `Docsera Serialization Spike API` / `264b64b319ad4a56abd1e22439443e55`
- REST route: `gate1_acquire` / `c3ac01de5411478a870f70ad2a3e259a`
- retained proof rows from the final run under page-key prefix `20260713211822-gate1-page-`
- `syslog` entries with prefix `[Docsera serialization spike][gate1]`

These retained PDI artifacts are inert for production Docsera behavior:

- no production editor path reads them;
- they are isolated to the proof table and proof REST endpoint;
- they do not affect current page persistence behavior.

No manual PDI cleanup is required from this repo correction.
