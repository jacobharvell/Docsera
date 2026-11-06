# RR-051 — Global Companion Artifact Integrity and Preview

Date: 2026-11-02

## Result

**Ready for independent commit authorization.** The Global companion retrieved update
set is previewed, clean, and remains uncommitted. This report does not authorize a
commit, preview rerun, collision override, skip, repair, or artifact change.

## Target and worktree

| Item | Value |
| --- | --- |
| Target | `https://dev437892.service-now.com/` (`docsera-source`) |
| Worktree | `C:\\Users\\jacob\\.codex\\worktrees\\rr-043-edit-session-recovery-ui\\Docsera` |
| Branch | `feature/rr-043-edit-session-recovery-ui` |
| Starting / verified HEAD | `8aeff9d5bb43e7a69c1d70a85946ffee9e4bab31` |
| Original base | `e847be1eb796c525425de3c9c2e3bcac7689e7ac` |

The continuation task-worktree guard passed before repository inspection. The remote
retrieved-update-set preflight found no existing `Docsera Global Companion 0.1.0`
record or retrieved set with remote base `beabd28f94519b6d0e3fb3fbe0c84bdc`.
The already committed scoped `Docsera` retrieved set was present and is not a
companion conflict.

## Corrected artifact integrity

The XML was not regenerated or modified. `git ls-files -s` identifies the committed
artifact as blob `c0a2994d51bedfd3ab9a850a48e031ab320c50c8`.

| Representation | SHA-256 |
| --- | --- |
| Repository LF blob | `3aa52f9ae972228b902e2562483e04b544a1f6ad8bb505d6ace11be4d2d5b740` |
| Local Windows CRLF working copy | `2c95b30e954a8e85038dba6be991a3836b6bccd4ea6b06785aba6bfb45391f26` |

The previous `BECB30B0...` expected hash is superseded. The only representation
difference considered here is Git LF versus the Windows CRLF checkout; blob identity
and the supplied corrected hashes establish that the local file is the committed
artifact.

The manifest and XML continue to identify revision `global-base-metadata-safe-r2`,
retrieved update-set sys_id `beabd28f94519b6d0e3fb3fbe0c84bdc`, and 25 customer
updates.

## Import and single preview

The unchanged XML was imported once through **Retrieved Update Sets → Import Update
Set from XML**. The resulting set has the expected sys_id and Global application,
and was previewed once. Preview completed successfully in two seconds.

| Preview field | Observed value |
| --- | ---: |
| State | `Previewed` |
| Inserts | 25 |
| Updates | 0 |
| Deletions | 0 |
| Collisions | 0 |
| Total | 25 |
| Commit date | empty |

All 25 rows in **Show All Preview Records** were reviewed, across both list pages.
Every row had disposition **Insert**, proposed action **Commit**, and an empty
Problem Type. There were no preview problems, skips, repairs, overrides, collisions,
or unresolved records.

Inventory: six `sys_module`, one `sys_restricted_caller_access`, nine
`sys_scope_privilege`, two `sys_script`, two `sys_script_include`, one
`sys_security_acl`, one `sys_security_acl_role`, one `sys_ui_page`, and two
`sys_ux_lib_asset` records. No `sys_package`, `sys_scope`, or `sys_app` record
appears in the preview inventory; therefore, no shared Global package, scope, or
application identity metadata is proposed for update.

The known `sys_security_acl_role:1416f98418e24c18af184b0300f7793c` source payload is
an intentional `DELETE` operation. Because its target binding is absent on this clean
target, ServiceNow previewed it as **Insert / Commit**, producing no target deletion
and no preview problem.

## Read-only ping observation

The configured runtime ping path was opened read-only at
`/api/x_82900_docsera/docsera_runtime/ping`. The visible XML error payload was:

```xml
<response>
  <error>
    <detail>null</detail>
    <message>Requested URI does not represent any resource</message>
  </error>
  <status>failure</status>
</response>
```

No endpoint investigation or modification was performed. The browser-visible response
did not expose an HTTP status line, so this report preserves the observed payload
without independently asserting an HTTP status.

## Boundaries retained

- The update set was not committed.
- No artifact, application version, SDK installation, deployed JavaScript, or source
  map was changed.
- No collision override, repair, or interactive Docsera workspace testing was run.
- RR-039G remains unchanged as historical evidence.

## Validation

- Continuation task-worktree guard: passed.
- Local blob identity, manifest revision/ID/count, and Windows working-copy hash:
  verified.
- Authenticated `dev437892` UI: ownership preflight, one import, one preview, 25-row
  preview inventory, empty Problem Type, and uncommitted `Previewed` state verified.
- No PDI browser acceptance testing was performed beyond the explicitly authorized
  Retrieved Update Sets workflow and read-only ping observation.
