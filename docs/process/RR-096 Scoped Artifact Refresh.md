# RR-096 — Scoped Artifact Refresh

Date: 2026-11-06
Status: **Candidate prepared for independent review; not release approved.**

RR-096 used the repository-pinned Now SDK 4.8.1 and the established `docsera-dev468303` alias for `https://dev468303.service-now.com`; no credentials, identity configuration, application scope, application sys_id, or application version changed.

The SDK build emitted two narrowly targeted `author_elective_update` DELETE records for the retired Docsera-owned UX Assets `c58dabe08ad142cca3f1909a68b0a713` (`mountEditorRuntimeSpike`) and `a03da8513bc94a398b3a3dafcca17dc8` (`mountEditorRuntimeSpike.js.map`). A normal incremental SDK install, not a reinstall, applied those deletes; subsequent exact-ID live queries returned no asset records. The deletion source and generated delete records have focused automated coverage.

The native `Publish to Update Set` workflow published `Docsera` / `x_2300756_docsera` / version `0.1.0` with demo data disabled. Its native update set completed with 564 customer updates. The supported update-set metadata edit then set the consumer-facing name to `Docsera Application 0.1.0` and description to `Docsera Application 0.1.0 release candidate — RR-096 scoped artifact refresh; not release approved.` before exporting the retrieved set. No decoded application payload was manually edited.

## Artifact comparison

| Check | Refreshed scoped artifact | Previous scoped artifact |
| --- | ---: | ---: |
| Customer updates / decoded payloads | 564 / 564 | 564 / 564 |
| Update action | 562 `INSERT_OR_UPDATE`, 2 targeted `DELETE` | all `INSERT_OR_UPDATE` |
| Artifact SHA-256 | `90ef34afdcf48a8b54655b0e60437130120de8b4681bd99cbaa7dd2e75277cc0` | `9657a25db7c4b31eb3b6d7eb46662ed077ed3950a4f877c795629b6baf414848` |
| Domain-table payloads / attachment payloads | 0 / 0 | 0 / 0 |

The application, table, dictionary, documentation, REST, ACL, server-module, UX-asset, scheduled-script, role, choice, and privilege inventories reconcile one-to-one by identity. Relative to the preceding RR-096 candidate, the only non-timestamp decoded payload changes are the two named UX Asset records changing from `INSERT_OR_UPDATE` payloads to the supported scoped `DELETE` payloads; the 20 choice records have timestamp-only rewrites, and the module/scheduled-script wrapper timing fields were regenerated. The current main runtime has no `docsera_editor_spike` query path, and the two retired asset payloads are absent from the installed metadata. There are no unrelated DELETE updates, no imported domain/demo data, and no functional, security, schema, or permission payload change. The Global companion artifact was neither regenerated nor modified; its checksum remains `adae62031698b7b1596b71474defa7fb9889ffa40e30d40ad5ccfd01b64a0c50`.

This evidence does not establish receiving-instance import, preview, commit, lifecycle behavior, or public-release approval. RR-096 stops after committing and pushing the candidate for independent review.

Documentation validation passed. `git diff --check` was run and reports one trailing-whitespace sequence inside the platform-exported minified runtime payload; it was intentionally preserved because changing it would manually alter a decoded application payload.
