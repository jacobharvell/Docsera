# RR-056 — Existing-Scope SDK Deployment Preflight

Date: 2026-11-03
Status: **Corrected read-only preflight. No install, reinstall, deployment, PDI metadata/data change, Global-companion change, or browser test was performed.**

## Recommendation: **Conditional go for a normal incremental install; do not rewrite table keys**

The prior no-go conclusion based solely on the thirteen `sys_db_object` sys_id
mismatches was unsupported. In SDK 4.8.1, a Fluent `Table()` produces a
name-addressed bootstrap dictionary definition and a separate source keys
registry entry. The bootstrap XML does not carry the source registry ID as a
table `sys_id`. The platform creates/retains the installed `sys_db_object`
identity while applying the bootstrap schema by table name.

Consequently, the thirteen differing IDs are **expected bootstrap behavior**,
not evidence that the source and installed tables are inconsistent. Do not
rewrite `src/fluent/generated/keys.ts` to match the PDI table IDs. SDK 4.13
later added explicit `dbObjectId`/`db_object_id` support precisely to pin this
otherwise platform-assigned identity; that capability is not present in the
pinned 4.8.1 SDK. [SDK 4.13 Table API](https://servicenow.github.io/sdk/4.13.0/api/table/table-api)

The remaining prerequisite is narrow: after a fresh pinned-4.8.1 build, review
the resulting package's explicit DELETE declarations against the current PDI
and obtain approval for the ordinary incremental install. This is a package
safety gate, not table-ID reconciliation.

## 1. Existing-identity compatibility

Read-only pinned-SDK 4.8.1 queries using the explicit
`docsera-dev466345` alias found the repository and PDI identity match exactly:

| Field | Repository | Installed PDI application |
| --- | --- | --- |
| Scope | `x_82900_docsera` | `x_82900_docsera` |
| sys_id / scopeId | `6997f092c3fd8310c569bf0d0501314d` | `6997f092c3fd8310c569bf0d0501314d` |
| Name | `Docsera` | `Docsera` |
| Version | `0.1.0` | `0.1.0` |
| Active | n/a | `true` |

RR-055 already verified the PDI company key is `82900`; it is the owned
prefix for this scope. The sampled installed `sys_scope`, `sys_app`,
`sys_package`, and metadata records are owned by this scope/package. Nothing
in the available fields indicates a protection, ownership, or development-state
block on an SDK update.

## 2. What SDK 4.8.1 actually emits

`app/docsera-ui` pins `@servicenow/sdk` to `4.8.1`. Its installed local SDK
implementation and 4.8.1 Table type expose no `dbObjectId` property. A source
search finds no `db_object_id` support in that SDK version.

The current build contains thirteen table bootstrap files under
`dist/app/dictionary/`. Each uses the table name as its collection element, for
example:

```xml
<element name="x_82900_docsera_workspace" type="collection" ...>
```

None contains `db_object_id` or a table `<sys_id>`. Column references are also
serialized as table names, e.g. `reference="x_82900_docsera_workspace_change_set"`,
not as generated registry IDs.

The same build separately has thirteen
`update/sys_db_object_<id>.xml` files and thirteen matching
`sys_db_object` entries in `src/fluent/generated/keys.ts`. Those IDs are the
SDK's source-side registry/update-record identities. They are not instructions
in the bootstrap dictionary to replace the installed table's `sys_id`.

This distinction is independently corroborated by the SDK discussion of a
later dictionary-reference regression: it describes the platform assigning a
`sys_db_object` ID when the table is installed, while dictionary `reference`
values resolve by table name. The report also states that typed `Table()`
declarations are not affected by that raw-`Record()` regression.
[SDK discussion #116](https://github.com/ServiceNow/sdk/discussions/116)

## 3. Installed table and dictionary evidence

The previously verified exact identities remain unchanged: all 65 `sys_module`
records, 8 `sys_ux_lib_asset` records, 34 REST operations, the REST definition,
49 ACLs, 3 roles, and 2 scheduled scripts match source records.

The PDI has exactly thirteen `x_82900_docsera*` tables corresponding one-for-one
with the thirteen current package bootstrap table names. All are in
`x_82900_docsera`; there is no duplicate same-name table and no missing package
table.

All thirteen installed `sys_db_object.sys_id` values differ from the generated
registry values. For example, `x_82900_docsera_workspace` is installed as
`4d8a2665c39813100abcf3ddd4013101`, while the source registry records
`a58cf7c84e0f48cca450fc37d769fa54`. Given the 4.8.1 bootstrap form above,
this is expected and is not a source/instance inconsistency.

Read-only `sys_dictionary` queries for the installed workspace and page tables
confirm that column references use names, including `sys_user`,
`sys_user_group`, `x_82900_docsera_workspace`,
`x_82900_docsera_workspace_change_set`, and
`x_82900_docsera_workspace_snapshot_set`. Their type, mandatory, default, and
length metadata are populated normally. Therefore the table-ID difference does
not leave dangling dictionary references or indicate a second schema lineage.

## 4. Concrete package risk, independently of table IDs

The package contains 24 explicit `author_elective_update` DELETE declarations.
The previously inspected targets are absent from the installed application. In
particular, the retired deletion is for `x_82900_docsera_rm_member`; the PDI
does not have that table or its fields (its current table is the differently
named `x_82900_docsera_workspace_removal_member`). This snapshot therefore
shows no package declaration to delete an installed Docsera table.

That finding does not make DELETE declarations harmless: a future build can
produce new deletion intent. Inspect them again immediately before installation.
`--reinstall` remains excluded because the 4.8.1 CLI documents it as an
uninstall/reinstall path that can discard metadata created on the instance but
not present in the package.

The existing `Smoke-01` workspace, its pages, and `Smoke-02` remain normal
application data in those named tables. Their presence is not evidence of a
table-ID hazard; nevertheless, recording data selected for preservation before
any approved install remains prudent operational rollback preparation.

## 5. First-install command validity and bounded procedure

The pinned SDK 4.8.1 `now-sdk install --help` confirms that both `--auth` and
`--async` are valid options. `--async` defaults to `true`, so including it is
valid but redundant. `--reinstall` is valid syntactically but must not be used.
From `app/docsera-ui`, the proposed ordinary install sequence is therefore
valid:

```powershell
npm run build
.\node_modules\.bin\now-sdk.cmd install --auth docsera-dev466345 --async
```

Before executing it, perform only these gates:

1. Run the fresh pinned-4.8.1 build and inspect the produced
   `author_elective_update` DELETE declarations, including their targets in the
   current PDI.
2. Confirm the thirteen bootstrap files still name the current tables and have
   no unexpected `db_object_id`/schema changes.
3. Obtain explicit approval for the install. Do not add `--reinstall`, use the
   default credential, or install the Global companion in this step.
4. If installation fails or reports unexpected schema metadata, stop; do not
   retry with `--reinstall`.

## Validation record

- Continuation worktree guard passed at
  `49c7c96a06be77fdb9160f5942cbfa2928ab7336` from base
  `e847be1eb796c525425de3c9c2e3bcac7689e7ac`.
- Pinned local SDK inspected: `@servicenow/sdk` 4.8.1, including Table type,
  generated keys, bootstrap dictionary XML, `sys_db_object` update XML, and
  4.8.1 CLI help.
- Read-only PDI queries with explicit alias: installed `sys_db_object` names
  and IDs plus representative `sys_dictionary` rows for workspace and page.
- Preserved prior verified package finding: current DELETE targets are absent
  from the installed application snapshot.
- Intentionally skipped: build, install, reinstall, transform/download, PDI
  mutation, Global work, runtime/browser verification, and full frontend
  validation. This correction changes documentation/preflight reasoning only.
