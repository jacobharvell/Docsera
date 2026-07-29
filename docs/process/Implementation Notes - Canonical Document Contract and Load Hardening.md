# Implementation Notes - Canonical Document Contract and Load Hardening

This note records the repository-side document contract that E2-T2 hardened.

## Contract Summary

- Supported canonical schema version: `1`
- Supported document envelope shape: `{ schemaVersion: 1, document: { type: "doc", content?: [] } }`
- Supported legacy input: a raw TipTap-style root document with `type: "doc"`
- Valid empty canonical documents remain first-class and round-trip without mutation
- Canonical serialization preserves supported structure, multi-byte text, and terminal whitespace
- Persisted published content treats blank or absent values as nullable only for draft-only pages; any nonblank value is parsed through the shared canonical parser and fails closed on malformed JSON, unsupported schema versions, or invalid document structure

## Validation Boundaries

- Client parsing uses `parseDocseraDocument` and returns explicit failure categories instead of substituting empty content
- Server parsing uses the same shared parser through `parseServerDocument`
- ServiceNow persisted-record mapping rejects blank, whitespace-only, null, absent, malformed, or unsupported `draft_content_json` instead of creating editable empty content
- Draft-only records may still carry nullable published canonical content when the published field is truly blank or absent
- Nonblank persisted `published_content_json` values are never normalized to `null`; malformed or unsupported values fail during load instead of being rewritten silently
- Save handling rejects unsupported `draftContentJson` values instead of coercing them into a body-text save
- Live projection loading does not validate or depend on non-authoritative draft canonical JSON
- Live projection loading does not validate or depend on current page-row published canonical JSON once a selected ready snapshot already exists
- Edit projection loading continues to validate persisted draft canonical JSON strictly and still rejects malformed drafts instead of substituting an empty editable document
- Published-list projection fails closed when published canonical content is missing, malformed, or unsupported

## Failure Taxonomy

- `invalid-json`
- `invalid-envelope`
- `invalid-document`
- `unsupported-schema-version`

## Load and Recovery Behavior

- Invalid draft content stays out of the editable ready state
- Existing E2-T1 recovery UI remains the fallback for invalid draft loads
- New page creation still initializes an explicit empty canonical envelope through the page-creation/domain path
- Legacy foundation establishment still validates page-row published canonical JSON strictly because it constructs the initial ready snapshot
- Live mode never falls back to draft content when published canonical content is invalid
- Unsupported or malformed persisted content remains non-destructive; it is surfaced as a load failure instead of being rewritten silently

## Fixture Strategy

- Shared fixture builders live in `src/shared/editor/documentFixtures.ts`
- The corpus covers current-envelope, legacy, malformed JSON, unsupported versions, missing envelope data, invalid roots, invalid content shapes, and large canonical documents
- Large-document storage validation remains bounded to the existing E1 capacity evidence

## Remaining Dependencies

- Complete node-level validation still depends on the final E2-T4 extension registry
- Fresh-install portability is still a validation gap unless separately exercised in a clean ServiceNow environment
- This note does not claim autosave, publishing workflow expansion, conflict UX, or richer editor-node support
