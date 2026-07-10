# Technical Spike - TipTap Editor E1 Platform Contracts

Date: 2026-07-10

Status: PDI host, lazy-asset, canonical-document, practical-capacity, and sequential-revision evidence recorded; storage-type decision and atomic concurrency remain bounded follow-ups.

## Purpose

Record the E1 evidence used to reduce TipTap integration risk before production editor implementation. This is a technical spike note, not the definitive editor architecture note and not a product-requirements source.

The authoritative editor MVP scope and sequencing remain in the accepted Obsidian requirements.

## Dependency Compatibility

The local spike pins a coherent TipTap `3.27.3` dependency set:

- `@tiptap/core`
- `@tiptap/pm`
- `@tiptap/react`
- `@tiptap/starter-kit`

Local evidence:

- TipTap's current React adapter declares React 18 compatibility.
- A headless editor creates, accepts JSON, normalizes content, and destroys successfully.
- `EditorContent` mounts through the current React 18 runtime and destroys through effect cleanup.
- The Studio React 19 patch is not present and has not been shown to be necessary.
- The Now SDK build type-checks successfully with the pinned dependencies.

TipTap may normalize a trailing paragraph after `setContent`. Future schema and round-trip tests must assert semantic document behavior rather than assume an unnormalized input array is returned byte-for-byte.

## Lazy Asset Delivery and Child Host

The retained E1 query-gated child-host probe is available at `?docsera_editor_spike=1`.

PDI validation passed:

- A normal Docsera runtime load does not request the lazy TipTap editor asset.
- Adding `docsera_editor_spike=1` requests the separate SDK-managed editor asset.
- The normal shell remains mounted while the probe loads.
- The TipTap editor mounts inside the child shadow root.
- The editor-local overlay displays and behaves correctly inside that root.
- Removing the query parameter removes the spike and avoids requesting its asset.

The local SDK build emitted a separate TipTap probe chunk (approximately 572 KB) alongside the main shell. E1 therefore proves lazy delivery, a child-shadow-root mount, and an editor-local overlay strategy. Production editor host integration remains E2 work.

This does not yet validate real-editor selection geometry, dropcursor, pointer capture, drag/drop, clipping, zoom, or all ServiceNow-host interactions.

## Document Contract

The spike uses a versioned canonical envelope:

```json
{
  "schemaVersion": 1,
  "document": {
    "type": "doc",
    "content": []
  }
}
```

Current behavior:

- Schema version 1 round-trips deterministically.
- Existing raw `{ "type": "doc" }` content is recognized as legacy input and wrapped in version 1.
- Malformed JSON, unsupported versions, invalid envelopes, and invalid document roots return explicit failures.
- Invalid stored content is not converted to an editable empty document by the boundary.
- Parsing returns a defensive copy.
- Canonical JSON is serialized directly; generic text trimming is not applied to it. The regression test includes multi-byte content and a terminal newline in a text node.

Full TipTap-schema validation and migration of the current page DTOs remain E2 work after the physical storage decision is settled.

## Capacity Evidence

### Temporary body-text path

Jacob saved the following textarea input:

```js
const value = "Docsera capacity 容量🙂\n".repeat(3000);
```

- JavaScript input length: `66000`.
- Readback length after save and refresh: `65999`.
- Practical large-text capacity passed well beyond 4,000 characters.
- The one-character difference is the final newline removed by the existing temporary body-text normalization path.
- The visible content was complete; this is not evidence of physical storage truncation.

The temporary text rule must not be reused for canonical TipTap JSON.

### Canonical JSON readback

The same PDI page's persisted `draft_content_json` was queried directly through the Now SDK and parsed through the current version-1 document-envelope boundary.

- The stored serialized canonical envelope is `240057` JavaScript characters: materially larger than 4,000.
- It contains 3,000 multi-byte `Docsera capacity 容量🙂` paragraphs.
- Stored text length is `65999`, matching the expected terminal-whitespace-normalized temporary input.
- The stored canonical JSON parsed successfully as schema version 1 with a `doc` root.
- Its semantic content exactly equals the expected normalized envelope (all 3,000 paragraphs); it was neither trimmed nor silently converted to an empty document.
- The save advanced the test page from its initial revision to revision `1`; the persisted record reports revision `1` on readback.

The focused regression test exercises the direct `draftContentJson` branch with a large, multi-byte canonical envelope and verifies exact serialized preservation, current-envelope parsing, and revision advancement. It is deliberately separate from the temporary body-text conversion.

Exact canonical JSON capacity remains proven for this PDI payload and code path, but not as a documented ServiceNow field-capacity guarantee.

## Storage Conclusion

**Conclusion: the physical storage decision remains unresolved and needs one bounded follow-up before E2.**

Current repository and PDI evidence conflict:

- The repository defines `draft_content_json`, `published_content_json`, and the temporary body-text fields as `StringColumn({ maxLength: 4000 })`.
- The deployed PDI dictionary reports `internal_type=string` and `max_length=4000` for those fields.
- That same deployed `draft_content_json` field retained the verified 240,057-character canonical envelope without truncation.
- The local Now SDK documentation identifies `JsonColumn` as the dedicated JSON field type, accepts serialized string values, and also exposes `maxLength`; it does not establish a supported physical limit or migration behavior for this deployed field.

The E1 evidence rules out the apparent 4,000-character physical truncation concern for the tested same-page record. It does not establish what the source declaration should promise, whether `StringColumn` is the supported long-term JSON type, or the safe deployed migration path. The smallest next task is to make and verify only that schema decision: confirm the supported field type and explicit capacity with ServiceNow documentation/PDI metadata, migrate the two canonical JSON fields if warranted, and repeat this readback test. No broad storage redesign, compression, segmentation, or related-table work is implied.

## Session and Revision Status

The local session-generation utility establishes one page identity per editor generation, invalidation when another page session begins, revision advancement only for the current generation, teardown invalidation, and a basis for rejecting stale load and save completions.

PDI validation passed for sequential two-tab stale-revision behavior. The current read-check-write flow protects sequential stale saves, but it may still race under truly simultaneous writes; it is not a fully atomic compare-and-save mechanism. Atomic compare-and-save must be resolved before E3 autosave and publishing. It does not block the TipTap compatibility and host work proven in E1 unless an accepted E1 gate explicitly requires it.

## Deferred PDI Checks

- Reader-only/non-authoring role validation is deferred. It was not performed in this closeout task.
- Deliberately corrupted stored-document validation in the PDI is deferred. The local boundary regression coverage remains in place.
- Truly simultaneous atomic compare-and-save behavior remains unresolved.

## Local Validation

Passed:

- Document-envelope tests.
- Page-save and revision tests, including large direct canonical JSON preservation.
- React 18 / TipTap compatibility tests.
- Shadow-root and editor-local-overlay test.
- Frontend validation.
- Now SDK build/type-check with pinned TipTap dependencies.
- Repository documentation validation.

## Gate to E2

E2 is not started by this branch. Before it begins, complete the bounded physical storage-type/capacity decision above. Resolve atomic compare-and-save before E3 autosave and publishing. The reader-only role and corrupted-document PDI checks remain deferred E1 validation items.
