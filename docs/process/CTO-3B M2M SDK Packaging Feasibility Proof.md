# CTO-3B — M2M SDK Packaging Feasibility Proof

## Outcome

**Conditional go.** The pinned ServiceNow SDK `4.8.1` reproducibly emits a
packaged three-field link table, a registered `sys_m2m` record, and a genuine
unique composite index. This is an offline packaging proof only. It does not
authorize a Docsera persistence migration, installation, or an entitlement
claim.

## Proof boundary

The self-contained fixture is
`docs/process/fixtures/cto-3b-m2m-sdk-proof`. It is not referenced by
`app/docsera-ui`; its `dist/` and `node_modules/` are ignored. The fixture pins
`@servicenow/sdk` to `4.8.1` and uses Docsera's existing application scope only
to make the generated ownership fields comparable. It must not be installed.

Run only from that fixture:

```powershell
npm install --ignore-scripts
npm run build
```

The build runs `now-sdk build` followed by a generated-artifact verifier. A
second build produced identical SHA-256 values for both the relationship XML
and the table dictionary XML:

- `sys_m2m`: `C89D0AAD732C85E174EED50089A649239027A4FDC5F375A59A27F34E5225124D`
- link-table dictionary: `9AD53553768330FD2350F9150231CB294897F968D481447CA57207B8E449E56F`

## Generated metadata evidence

The Fluent `Table` emitted `x_82900_docsera_rm_member` (26 characters,
including the scoped prefix) with exactly three application-defined columns:
`removal_batch` → `x_82900_docsera_workspace_removal_batch`, `page` →
`x_82900_docsera_page`, and `first_pending_sequence`. It emitted package-private
access, disabled web-service access, and audit enabled.

Despite the public API describing `Table.index[]` as individual column
references, SDK 4.8.1 accepts `element: "removal_batch,page"` and emits:

```xml
<index name="removal_batch_page_unique" unique="true">
  <element name="removal_batch"/>
  <element name="page"/>
</index>
```

The generated key registry also contains a `sys_index` composite key with
`col_name_string: 'removal_batch,page'`; this is not two independent indexes.

There is no dedicated Fluent M2M API in SDK 4.8.1. The documented generic
`Record` fallback successfully emitted a `sys_m2m` update record, with the
expected endpoints and a resolved `m2m_table` reference:

```xml
<from_table>x_82900_docsera_workspace_removal_batch</from_table>
<m2m_table name="x_82900_docsera_rm_member">…</m2m_table>
<to_table>x_82900_docsera_page</to_table>
```

The generated key registry records stable identities for `sys_m2m`,
`sys_db_object`, `sys_dictionary`, and `sys_index`. No unexpected application
metadata was emitted beyond the fixture's generated package/BOM modules and
the expected table, dictionary/documentation, licensing-config, index, and
M2M records.

## Approaches and limits

The initial fixture source was outside the SDK's default `src/fluent` scan
directory and therefore emitted no schema metadata; placing the same source
under `src/fluent` produced the evidence above. No unsupported hand-authored
XML was used. The production `workspace_removal_member` declaration and its
generated identities are unchanged, and the normal `app/docsera-ui` build does
not include this fixture.

The local build cannot prove that an instance will accept the `sys_m2m` record
or classify it as entitlement-exempt. Nor can it prove reference attribution,
ACL behavior after install, index enforcement under concurrent writes, or an
upgrade/data migration.

## Remaining gates before a replacement

- Install this exact generated package in an authorized disposable instance and
  confirm `sys_m2m.m2m_table`, both endpoints, the three-custom-field bound,
  table access, and generated dictionary records.
- Exercise duplicate inserts: reject the same `(removal_batch, page)` pair and
  allow the same page in a different batch.
- Validate the existing removal-batch load/reconcile/recovery, Undo, Discard
  All, publish, retired-batch, and deletion behaviors against a proposed
  migration.
- Design and approve existing-data migration plus upgrade/rollback handling.
- Obtain Subscription Management or ServiceNow licensing confirmation for each
  adopter's contract; the build itself proves no exemption.

Until those gates pass, retain `x_82900_docsera_workspace_removal_member`.
