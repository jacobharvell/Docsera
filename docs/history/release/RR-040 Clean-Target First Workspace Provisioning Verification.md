# RR-040 — Clean-Target First Workspace Provisioning Verification

Date: 2026-11-02

## Scope and acceptance context

Receiving PDI: `https://dev466345.service-now.com/`

Jacob completed the live product acceptance before this inspection: he created
**Smoke-01**, saw it in My Workspaces, and opened it successfully. This report is
the separate, read-only administrative record inspection required after that
acceptance. It neither created nor changed a workspace, group, membership, role,
request, or Global configuration.

RR-039H is the installation baseline only. It established that the Global
provisioning companion was installed; it did not establish a successful runtime
request-to-workspace record chain.

## Verified runtime records

The exact `x_82900_docsera_workspace` record filtered by `name=Smoke-01` returned
one row:

| Relationship | Verified identity |
| --- | --- |
| Workspace | `Smoke-01` — `52ed42f5c3909310ac26fe3d05013193` |
| Workspace Admin group | `Docsera_Smoke_01_01_Admins` — `d6ed42f5c3909310ac26fe3d05013103` |
| Workspace Editor group | `Docsera_Smoke_01_01_Editors` — `52ed42f5c3909310ac26fe3d05013187` |

The workspace row references those exact group sys_ids; this is an identity-based
check, not a name-only correlation.

The native `sys_group_has_role` query filtered by those two exact group sys_ids
returned exactly two rows, both created `2026-11-02 08:28:32`:

| Group sys_id | Native role relationship | Result |
| --- | --- | --- |
| `d6ed42f5c3909310ac26fe3d05013103` | `x_82900_docsera.workspace_admin` (`bed03ee93aa74f62aedc3ee7d9419ca6`) | Present; inherits `true` |
| `52ed42f5c3909310ac26fe3d05013187` | `x_82900_docsera.editor` (`4b00751fca4346129d38f205fda047c5`) | Present; inherits `true` |

No membership assertion is made. The verification deliberately did not assume that
the creator was automatically added to either group.

## Provisioning-request traceability discrepancy

The installed Global provisioning bridge contract writes the request's `workspace`,
`admin_group`, `editor_group`, and terminal `state=succeeded` fields after it creates
the workspace and native groups. The runtime workspace and group-role results above
are consistent with that provisioning outcome, but they cannot substitute for the
required request-record verification.

The following read-only administrative checks returned zero records:

| Check | Result |
| --- | --- |
| `x_82900_docsera_workspace_provision_request` filtered by `workspace=52ed42f5c3909310ac26fe3d05013193` | No record |
| Same table filtered by `name=Smoke-01` | No record |
| Same table filtered by `state=succeeded` | No records returned |
| `sys_audit` filtered to request-table `name` changes with new value `Smoke-01` | No record |

Consequently, the originating request sys_id, terminal `succeeded` state, and its
links back to the exact workspace and group records are **not verified**. The same
exact-name query also returned no `requested`, `processing`, or `failed` record for
this smoke test, so no failed or stranded request was observed; because the expected
originating request itself was absent from read-only inspection, that is a limited
negative finding rather than proof that no request ever existed.

## RR-040A follow-up — authoritative read-only query

RR-040A repeated the lookup on 2026-11-02 through the receiving instance's native
Background Script page as System Administrator. The script ran in Global scope with
rollback recording disabled and performed one `GlideRecord` query constrained to
`workspace=52ed42f5c3909310ac26fe3d05013193`. It inserted, updated, deleted, replayed,
or provisioned nothing.

That administrative server-side query returned exactly one request:

| Request field | Verified value |
| --- | --- |
| `sys_id` | `02edceb5c3909310ac26fe3d050131a8` |
| `state` | `succeeded` |
| `workspace` | `52ed42f5c3909310ac26fe3d05013193` |
| `admin_group` | `d6ed42f5c3909310ac26fe3d05013103` |
| `editor_group` | `52ed42f5c3909310ac26fe3d05013187` |

All three references exactly match the runtime records verified above. The initial
scoped attempt also reached the request table, but ServiceNow rejected `gs.print()`
in scoped Background Scripts before it could display the result; the Global read
path was used only to display the same bounded query output. This establishes that
the earlier administrative list/Table API zero-row observations were a
visibility/query-method limitation, not physical request absence or a product
persistence defect.

## Bounded error inspection

Because request traceability was inconsistent with the installed worker contract,
the System Log was inspected read-only for 2026-11-02. Both of these focused searches
returned no rows:

- messages containing `Docsera workspace provisioning`;
- messages containing `Smoke-01`.

No relevant server error was found. This absence does not explain the missing request
record and does not establish request success.

## Original RR-040 qualification decision

**Partially qualified; do not treat RR-040 as clean-target first-workspace
provisioning qualification.**

Verified runtime behavior is limited to successful creation of the workspace, its
two linked native groups, and their expected Docsera role relationships, together
with Jacob's passed live acceptance. Installed Global metadata remains established by
RR-039H. The required durable provisioning-request evidence is missing from this
inspection, so the scoped-to-Global provisioning chain is not fully qualified until a
read-only administrative method can locate the originating request and show its
terminal state plus the exact workspace/admin-group/editor-group links.

No repair, replay, or additional workspace creation was attempted.

## RR-040A qualification decision

**Qualified.** The originating provisioning request exists in terminal
`succeeded` state and links to the exact Smoke-01 workspace, admin group, and editor
group. RR-040's historical list-query result remains accurate as observed, but it
cannot establish existence for this server-owned queue; the supported administrative
server-side query provides the required durable trace instead.

## Validation

- Authenticated administrative browser workflow: workspace, native groups,
  `sys_group_has_role`, provision-request table, audit, and focused system-log
  inspection.
- RR-040A: read-only Global Background Script query constrained to the exact
  workspace identity; rollback recording disabled.
- `npm run validate:docs` and `git diff --check` run after this report is written.
