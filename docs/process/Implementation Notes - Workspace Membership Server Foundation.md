# Workspace Membership Server Foundation

Docsera workspace Admin and Editor membership is resolved from the workspace record's native `sys_user_group` references. The scoped runtime does not introduce a custom membership table or queue for direct membership management.

The scoped package owns the product contract:

- load the workspace by sys_id or slug
- evaluate `canManageWorkspaceMembers` server-side for the current user
- merge Admin and Editor group members into an effective member list
- prefer Admin when a user exists in both workspace access groups
- expose user identity, email, effective access level, and active/inactive state for later UI work
- prevent non-Docsera-Admin callers from removing or demoting the last active Workspace Admin

Privileged writes to `sys_user_grmember` remain in the global bridge package. `DocseraGlobalWorkspaceMembershipBridge` is a public Script Include with restricted caller access. Normal deployment must establish both ServiceNow gates for the scoped caller:

- the scoped Docsera package owns an allowed `sys_scope_privilege` execute record for `x_82900_docsera` to call `global.DocseraGlobalWorkspaceMembershipBridge`
- the global companion update-set artifact owns an allowed `sys_restricted_caller_access` scope-to-target relationship from source scope `x_82900_docsera` to target `global.DocseraGlobalWorkspaceMembershipBridge` for Execute API

The `sys_scope_privilege` record does not satisfy Caller Restriction by itself. The global target-owned RCA relationship is required so a fresh PDI install does not rely on manually approving a Requested Restricted Caller Access record.

PDI metadata confirmed the `sys_restricted_caller_access` stored values used by the generated global companion artifact:

- Source Type `Scope` stores as `5`
- Target Type `Script Include` stores as `2`
- Status `Allowed` stores as `2`
- Operation `Execute API` stores as `execute`
- populated existing allowed RCA records use RCA Type `Real RCA`, stored as `real_rca`

The synthetic RCA record therefore writes those stored values directly and sets the RCA record's own `sys_scope` to `global` so ownership belongs to the Global target application scope, not only to a record whose `target_scope` field points at Global.

The bridge accepts only the stored Admin group sys_id, stored Editor group sys_id, target user sys_id, and the requested access level. Before touching `sys_user_grmember`, it queries `x_82900_docsera_workspace` and requires the supplied Admin and Editor group sys_ids to appear together on an existing Docsera workspace record. Non-Docsera or mismatched group pairs fail without membership mutation. Valid pairs only apply the constrained Docsera membership operations:

- set Workspace Admin: add Admin membership and remove redundant Editor membership
- set Editor: add Editor membership and remove Admin membership
- remove workspace access: remove the user from both workspace access groups

The scoped REST routes `/workspaces/members` and `/workspaces/members/remove` call the scoped service. They must not accept client-supplied capability claims; authorization is recomputed from current ServiceNow roles and group membership before every read or mutation.

Docsera Admin recovery authority is enforced in the scoped service before mutation. A Docsera Admin may demote or remove the last active Workspace Admin so broken workspace access can be recovered according to the accepted membership model.
