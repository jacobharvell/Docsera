# RR-007 Membership and Global Bridge Security Review

## Scope and conclusion

This is an evidence-only review of the four workspace-membership REST operations and the related privileged Global command worker/Script Include boundary. No PDI data, configuration, queue command, deployment, or source behaviour was changed.

**Conclusion: no material authorization defect was established. No code change is recommended.** An unauthorised authenticated caller cannot create a membership or group-deletion command through the supported REST paths, including by naming another workspace, because each path resolves that workspace and recalculates its capability before the command is created. The command table is also a source-controlled, installed server-owned handoff: web-service access is disabled and active deny ACLs block generic create/read/write/delete, including admin overrides. The Global worker consequently may rely on a trusted command boundary; its lack of a second end-user capability evaluation is not, on the evidence reviewed, a vulnerability.

The only meaningful follow-up is installation-drift verification after future package/update-set changes. The read-only checks below used an administrator-configured SDK connection and prove installed metadata, not an ordinary-user effective-ACL result.

## Authorization path

| REST operation | Source path and pre-command control | Command / worker result |
| --- | --- | --- |
| `GET /workspaces/members` | Resolves the supplied sys_id (preferred) or slug, then `ensureCanManageMembers` calls `evaluateCurrentUserWorkspaceCapabilities` for that resolved record. No command is created. | Reads only the workspace's stored Admin/Editor group memberships. |
| `GET /workspaces/members/search-users` | Same workspace-specific capability check, then bounded active-user search excluding existing members. No command is created. | Returns user-search data only. |
| `PUT /workspaces/members` | Validates target/access level, resolves workspace, requires capability, validates both stored group references, and prevents demotion of the last active Admin. | Creates only a `set` command; after synchronous worker return, succeeds only if native group state exactly matches requested role. |
| `POST /workspaces/members/remove` | Validates target, resolves workspace, requires capability, validates group references, and prevents removal of the last active Admin. | Creates only a `remove` command; succeeds only if target is absent from both native groups. |

`serviceNowWorkspaceCapabilities.ts` derives the caller from `gs.getUserID()`, uses `gs.hasRole` for `x_82900_docsera.admin`, and verifies native membership in the specific workspace's Admin/Editor group. `canManageWorkspaceMembers` equals `canAdminWorkspace`: Docsera Admin, or a user holding the workspace-admin role and membership in that workspace's stored Admin group. A workspace reference for another workspace therefore causes authorization to be evaluated against that other workspace; it cannot reuse authority from the caller's current workspace.

For `set` and `remove`, `createMembershipMutationCommand` sets `requested_by` from `gs.getUserID()`; neither request body nor query string supplies it. It creates only `set`/`remove`, with a server-resolved workspace reference, target, accepted access level, and initial `requested` state. The deletion service separately creates only `validate_workspace_group_deletion` and `delete_workspace_groups` after rechecking `canAdminWorkspace` for the resolved workspace. It also uses `gs.getUserID()` for both target/requester. The `hasDocseraAdminAccess` dependency declared by the membership service is not used as an alternate authorization route.

## Last active Admin and timing controls

Before either role transition or removal, the scoped service counts active native Admin-group members and rejects a non-Admin result for the sole active Admin. Promotion/addition is allowed, including recovery from zero active Admins. The test coverage exercises unauthorised callers, last-active-Admin demotion/removal, promotions, native end-state failure, and the Global worker/bridge ownership guards.

This is intentionally a **pre-command** control. The Global worker does not repeat caller capability or last-admin checks; it consumes a command that has already crossed the protected queue boundary. It loads the workspace itself using the command workspace reference, ignores client-provided group ids (there are none), and derives the stored Admin/Editor groups. It accepts only the four enumerated mutation kinds and changes the command to succeeded/failed after bridge execution. `requested_by` is retained attribution and is not used as worker authorization. That design is acceptable only while arbitrary command insertion/update remains denied; the installed queue controls below establish that boundary for the reviewed configuration.

## Command table security

Source declaration `docsera-workspace-member-mutation-command.now.ts` sets `allowWebServiceAccess: false`. `docsera-workspace-foundation-table-access.now.ts` declares four table-level deny ACLs for create, read, write, and delete. Each has `decisionType: deny`, `adminOverrides: false`, and `return false;`.

Installed PDI metadata, queried read-only on 2026-10-30:

| Installed subject | Evidence | Assessment |
| --- | --- | --- |
| `sys_db_object` command table | `access=public`, `create_access=false`, `read_access=true`, `update_access=true`, `delete_access=false`, `ws_access=false` | `ws_access=false` matches source. The cross-scope application-access values permit the needed Global bridge path; they are not an end-user grant. |
| `sys_security_acl` table ACLs | Four active Docsera-scope records for create/read/write/delete; every record is deny, `admin_overrides=false`, `script=return false;` | Confirms the source-controlled server-owned queue protection is installed. |
| Global-to-scoped privileges | Two allowed `sys_scope_privilege` records for this table: Global source → Docsera scope, `read` and `write` | Narrow permission for the Global worker, not an ordinary caller. |

The review did not inspect command rows and did not attempt Table API writes, replay, or impersonation. It therefore does not claim a live ordinary-user ACL execution result. Given disabled web-service access and explicit unconditional deny ACLs, no realistic supported direct-command-injection path was established.

## Global worker and group-deletion boundary

The installed active Global Business Rule targets only `x_82900_docsera_workspace_member_mutation_command`, runs after insert, and filters `state=requested`. Its installed script matches the source worker. It reloads the referenced workspace and passes its stored group pair—not command-controlled group identifiers—to `DocseraGlobalWorkspaceMembershipBridge`.

The bridge validates 32-character identifiers and requires the Admin/Editor pair to appear together on an existing Docsera workspace before membership mutation. For deletion validation/deletion it additionally requires both targets to be distinct, stored on that workspace, and named exactly as Docsera-generated `Docsera_<key>_Admins` / `..._Editors` groups. Validation is non-destructive; actual deletion checks both targets before deleting either, and committed cleanup tolerates an already-missing target only after ownership/name validation of targets that remain. This prevents a command from selecting arbitrary native groups.

The worker does not validate `requested_by`, nor does it reauthorise its original user. That would be a defect only if an untrusted actor could inject a command; RR-007 found no such route through the supported paths or installed queue metadata. It should remain documented as a trust-boundary assumption rather than be replaced with speculative duplicate checks.

## Public restricted Script Include and caller approval

Source declares `global.DocseraGlobalWorkspaceMembershipBridge` as active, `accessibleFrom: "public"`, `callerAccess: "restriction"`. The scoped package declares one allowed execute privilege for that exact target. The generated Global companion manifest includes the restricted-caller record and the membership worker/bridge artifacts.

Installed read-only records identify the actual relationship, rather than merely showing an approval exists:

| Relationship | Installed identity/evidence |
| --- | --- |
| Target | `sys_script_include` `5bf5c028daaa417d88de36616e4c8300`, Global `DocseraGlobalWorkspaceMembershipBridge`, API `global.DocseraGlobalWorkspaceMembershipBridge`, active, public, `caller_access=2` (restriction). |
| Scoped execute privilege | `sys_scope_privilege` `6f11653b8d5047f696e45c5f533c3d56`: source scope `6997f092c3fd8310c569bf0d0501314d` (`x_82900_docsera`, Docsera), target Global Script Include, operation `execute`, status allowed. |
| Restricted caller approval | `sys_restricted_caller_access` `449a6d8fb9d6e5b6c84e14c4314d8ccb`: Global-owned, source scope/table `6997f092c3fd8310c569bf0d0501314d` / `sys_scope`, source type Scope (`5`), target table/id `sys_script_include` / `5bf5c028daaa417d88de36616e4c8300`, target type Script Include (`2`), operation Execute API, status Allowed (`2`), `rca_type=real_rca`. |

Thus “public” exposes the Script Include to cross-scope approval evaluation; it does not by itself approve arbitrary scopes. The worker invokes it locally in Global scope. The scoped runtime's membership mutation service does not construct or invoke it directly; it uses the protected command handoff.

## Findings and recommended action

| Classification | Finding | Impact / action |
| --- | --- | --- |
| No material defect established | Supported membership and deletion paths reauthorise the resolved workspace before any command is created; the protected command table is the worker trust boundary. | **No code change.** |
| No material defect established | The Global bridge's public/restricted configuration has a concrete scoped execute privilege and matching Global-owned restricted-caller approval for the installed target. | **No code change.** |
| Verification gap, low operational risk | This review did not perform user-context/impersonation or write probes, and source/installed evidence cannot prove every future ACL-engine interaction or package drift. | On a future Global companion or security-metadata release, rerun the read-only checks for table `ws_access`, four deny ACLs, worker filter, Global→scoped privileges, bridge identity, execute privilege, and RCA source/target IDs. Any user-context mutation test requires a separately approved non-destructive plan. |

## Evidence boundaries

Reviewed source: membership REST handlers; `serviceNowWorkspaceMembers.ts`, capabilities, and deletion service; command-table and foundation-security declarations; Global worker and membership bridge; Fluent declarations; generated companion manifest; and focused membership/worker/bridge regression tests.

Read-only installed queries covered `sys_db_object`, `sys_security_acl`, `sys_script_include`, `sys_scope_privilege`, `sys_restricted_caller_access`, and the worker `sys_script`. No queue records were read or modified. This review did not audit unrelated REST operations, reopen RR-004/RR-006, or assert functional browser/PDI acceptance.
