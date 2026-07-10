# Technical Spike - TipTap Editor E1 Platform Contracts

Date: 2026-07-10

Status: PDI host, lazy-asset, canonical-document, bounded JSON storage contract, practical-capacity, and sequential-revision evidence recorded; atomic concurrency remains a bounded follow-up.

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

Exact canonical JSON capacity remains proven for this PDI payload and code path, but not as an unlimited or permanent product guarantee.

## Storage Conclusion

The bounded MVP storage decision is now implemented and validated for the active PDI.

Accepted source declaration:

- `draft_content_json`: `StringColumn({ maxLength: 262144 })`
- `published_content_json`: `StringColumn({ maxLength: 262144 })`
- `draft_body_text`: unchanged `StringColumn({ maxLength: 4000 })`
- `published_body_text`: unchanged `StringColumn({ maxLength: 4000 })`

Live deployed dictionary result after `npm run deploy:sdk-ui-page`:

- `draft_content_json`: `internal_type=string`, `max_length=262144`
- `published_content_json`: `internal_type=string`, `max_length=262144`
- `draft_body_text`: `internal_type=string`, `max_length=4000`
- `published_body_text`: `internal_type=string`, `max_length=4000`
- No replacement fields, duplicate dictionary rows, or field-type changes were created for those four fields on the tested PDI.

Existing-record preservation evidence:

- Preserved page record: `x_82900_docsera_page:cd0ee2b4c30ac750c569bf0d050131a7`
- Serialized `draft_content_json` length after deployment: `240057`
- Schema version after deployment: `1`
- Semantic fingerprint after deployment: `3000` paragraphs, first/last paragraph text still `Docsera capacity 容量🙂`
- Draft revision after deployment: `1`

Validated bounded-capacity probes on the same upgraded PDI:

- New large draft canonical envelope saved through the live Docsera draft-save route:
  - serialized length: `240062`
  - readback length: `240062`
  - parsed schema version: `1`
  - semantic equality: exact
  - trailing text-node whitespace: preserved
  - empty-document fallback: not triggered
  - revision advanced from `0` to `1`
- Large `published_content_json` probe written directly through the table API on a disposable page:
  - serialized length: `240062`
  - readback length: `240062`
  - parse: successful
  - semantic equality: exact
  - trailing text-node whitespace: preserved
  - unrelated draft/page fields: unchanged
- The disposable probe page was deleted after validation.

Current conclusion:

- Canonical TipTap/ProseMirror JSON remains on the Docsera page record.
- The accepted bounded repository contract is now `StringColumn({ maxLength: 262144 })` for the two canonical JSON fields.
- The tested PDI preserves and reads back canonical envelopes near the validated `~240k` MVP target on both draft and published paths without trimming.
- This evidence supports the bounded MVP decision only. It should not be presented as a broader ServiceNow storage guarantee, an unlimited-content guarantee, or proof of higher-capacity behavior on fresh installs or different instances.

## Session and Revision Status

The local session-generation utility establishes one page identity per editor generation, invalidation when another page session begins, revision advancement only for the current generation, teardown invalidation, and a basis for rejecting stale load and save completions.

PDI validation passed for sequential two-tab stale-revision behavior. The current read-check-write flow protects sequential stale saves, but it may still race under truly simultaneous writes; it is not a fully atomic compare-and-save mechanism. Atomic compare-and-save must be resolved before E3 autosave and publishing. It does not block the TipTap compatibility and host work proven in E1 unless an accepted E1 gate explicitly requires it.

## Deferred PDI Checks

- Reader-only/non-authoring role validation is deferred. It was not performed in this closeout task.
- Deliberately corrupted stored-document validation in the PDI is deferred. The local boundary regression coverage remains in place.
- Truly simultaneous atomic compare-and-save behavior remains unresolved.
- Fresh-install evidence for a brand-new instance with this same dictionary contract remains outstanding. The validated path in this task is an upgrade of the current PDI plus disposable record probes after install.

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

E2 is not started by this branch. The bounded physical storage-type/capacity decision above is complete for the current MVP contract. Resolve atomic compare-and-save before E3 autosave and publishing. The reader-only role, corrupted-document PDI check, and fresh-install evidence remain deferred validation items.
