# RR-074 — Global Consumer Artifact Portability Candidate

Date: 2026-11-04
Status: **Offline candidate for independent review. Do not import, preview, commit, install, or publish.**

## Result

The Global companion consumer artifact is generated at
`app/docsera-global-bridge/update-set/candidates/rr-074-global-consumer-portability/`.
It is distinct from the preserved historical artifact and is not an accepted
release package.

The candidate consumes the accepted Docsera scoped application identity
`x_2300756_docsera` / `e6e43323accd4c7fb9271525a343850e`. It resolves the
current Global bridge identities from `src/fluent/generated/keys.ts`, rather
than retaining the historical membership bridge ID:

| Component | Current identity |
| --- | --- |
| Membership Script Include | `bb42e634e203492591a8d18e6953eae1` |
| Provisioning Script Include | `010930ea12354689b678fc9b37ba0f88` |
| Consumer RCA | `a0af46dbdca9f925ad8704425772c2d7` |

The candidate contains 24 customer updates: six runtime modules, nine scoped
privileges, two workers, two Script Includes, one ACL, one UI Page, two UX
assets, and one RCA. The exact XML SHA-256 and inventory are recorded in the
adjacent manifest. Its source build SHA (the frozen input baseline, not the
artifact-containing commit) is
`16c5f95f4befa109277d1f67a50f8d977faebf17`.

## Consumer ownership model

The installed SDK development package uses companion application identity
`2698dffadc844c00a9f20d67fca177d5`. That identity is deliberately not a
consumer dependency. During consumer artifact generation, development-package
ownership references (`sys_scope`, `sys_package`, and generated BOM references)
are normalized to the receiving instance's existing `global` identity. No
`sys_package:global`, `sys_scope:global`, or `sys_app:global` record is
transported.

This follows the Global-owned consumer metadata model demonstrated by
RR-039G/RR-039H while preserving RR-068's separately owned SDK development
package. The two packages serve different boundaries and are not interchangeable.

The RCA is consumer-owned as Global metadata: its `sys_scope` and
`target_scope` are `global`; its source and `source_scope` are the accepted
scoped application; and its target is the generated-registry membership Script
Include. The generator orders the target Script Include before the RCA update.

## Offline checks

The verifier decodes actual `sys_update_xml` payloads and rejects stale
identities, duplicate targets, development-companion ownership references,
shared-Global identity update rows, unexpected `DELETE` payloads, mismatched
manifest/XML inventory, an invalid RCA boundary, and invalid target-before-RCA
ordering. It also checks the XML SHA-256 recorded in the manifest.

Validated locally:

- `npm run build` (SDK build passed; known informational missing client tsconfig warning)
- `npm run generate:update-set`
- `npm run verify:consumer-candidate`
- `npm run test:friendly-url-host` (6 passing tests)

## RR-074 integrity correction

The initial `r1` candidate was generated in a Windows working tree where SDK
source XML retained CRLF line endings inside escaped payloads. Its manifest
hashed those mixed-EOL working-tree bytes. Git committed the XML as LF text,
so the committed blob differed and the manifest checksum was invalid.

`r2` normalizes generator input to LF before serialization and records the
serialization contract in the manifest. `sourceSha` remains the frozen input
baseline; `generatorRevision` identifies generator output revision and does
not attempt to predict or embed the later Git commit SHA. The corrected
committed XML SHA-256 is `cf77c7b1b19f4751b7bf2c12620d697bd7922d4ef7e6ae7c540b7de00ca73bcf`.

## Remaining qualification boundary

This evidence proves only offline composition and internal references. A clean
instance still requires separately authorized import/preview qualification,
including platform treatment of Global-owned metadata, collisions, and RCA
semantics. No PDI access, SDK installation, update-set import, preview, commit,
browser validation, or metadata change was performed for RR-074.
