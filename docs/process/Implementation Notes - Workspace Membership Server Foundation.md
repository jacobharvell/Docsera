# Workspace Membership Server Foundation

Docsera workspace Admin and Editor membership is resolved from the workspace record's native `sys_user_group` references and native `sys_user_grmember` rows. The scoped runtime does not introduce a custom authoritative membership table, membership queue, or membership history store.

The scoped package owns the product contract:

- load the workspace by sys_id or slug
- evaluate `canManageWorkspaceMembers` server-side for the current user
- merge Admin and Editor group members into an effective member list
- prefer Admin when a user exists in both workspace access groups
- expose user identity, email, effective access level, and active/inactive state for later UI work
- prevent all Docsera-managed mutations from removing or demoting the last active Workspace Admin

Privileged writes to `sys_user_grmember` remain in the global bridge package, but the scoped server runtime does not directly construct or import `DocseraGlobalWorkspaceMembershipBridge`. Live PDI evidence showed that direct scoped SDK-module invocation failed before the bridge body executed. Membership mutations therefore use the same constrained command-handoff shape already proven by workspace provisioning:

- the scoped service performs authorization, group-reference validation, and last-active-Workspace-Admin enforcement
- the scoped service inserts one non-authoritative `x_82900_docsera_workspace_member_mutation_command` row containing only workspace, target user, mutation kind, accepted access level, requester, and diagnostic state/error fields
- a Global synchronous after-insert Business Rule on that command table runs in Global scope
- the Global worker loads the workspace's stored Admin and Editor group references and invokes the existing `DocseraGlobalWorkspaceMembershipBridge` locally in Global scope
- after the insert returns, the scoped service re-reads native Admin and Editor group memberships and reports success only when the exact requested end state is present

The bridge accepts only the stored Admin group sys_id, stored Editor group sys_id, target user sys_id, and the requested access level. Before touching `sys_user_grmember`, it queries `x_82900_docsera_workspace` and requires the supplied Admin and Editor group sys_ids to appear together on an existing Docsera workspace record. Non-Docsera or mismatched group pairs fail without membership mutation. Valid pairs only apply the constrained Docsera membership operations:

- set Workspace Admin: add Admin membership and remove redundant Editor membership
- set Editor: add Editor membership and remove Admin membership
- remove workspace access: remove the user from both workspace access groups

The scoped REST routes `/workspaces/members` and `/workspaces/members/remove` call the scoped service. They must not accept client-supplied capability claims; authorization is recomputed from current ServiceNow roles and group membership before every read or mutation.

The command record is a protected execution handoff only. It must never be used to determine effective membership, authorization, member lists, access requests, approvals, or historical membership state. Native ServiceNow group membership remains the sole authoritative workspace-membership state.

Read-only member listing and Add Member user search must not create mutation commands or invoke the Global worker. A workspace with zero Admin or Editor group members can still return a successful empty member list from server-side ServiceNow data.

Mutation success is verified against native group state after the synchronous command insert returns:

- set Workspace Admin requires presence in the Admin group and absence from the Editor group
- set Editor requires presence in the Editor group and absence from the Admin group
- remove requires absence from both groups

Any failed or partial end state returns the contained membership-mutation failure instead of reporting success.

Last-active-Workspace-Admin protection is enforced in the scoped service before mutation for all callers, including Docsera Admins. Adding or promoting a Workspace Admin is never blocked by this protection, so a Docsera Admin can recover a workspace that has zero active Workspace Admins after out-of-band ServiceNow changes by adding or promoting a replacement Admin first.

Task 63 adds the Workspace Settings to Manage Access Members integration on top of this boundary. Workspace projections now include the server-derived `canManageWorkspaceMembers` capability so the client can show or remove the Manage access entry point without inferring authority from a role label. Workspace member responses also include a minimal `callerCapabilities` envelope:

- `canManageWorkspaceMembers`
No separate last-active-admin caller capability is exposed to the browser. The client derives disabled demote/remove controls from the current authoritative member list, and the server remains authoritative for every mutation.

The Members UI is a workspace-level right-side pane opened from Workspace Settings after the existing settings finish-editing/save boundary completes. Invalid Workspace Settings drafts keep the administrator in Workspace Settings. Valid changed settings are saved first; Manage Access opens only after the save succeeds.

The pane loads `/workspaces/members` as the authoritative member list, filters the loaded members locally by display name, email, username, and sys_id, and refreshes members plus the current workspace projection after every add, role change, or removal. Failed mutations leave the last authoritative member list in place and surface a contained error.

User browsing/search for Add Members is server-backed at `/workspaces/members/search-users`. The browser supplies the workspace reference, a bounded result limit, the current search term, and already-loaded or staged user sys_ids to exclude. An empty search term is valid and returns the first ordered bounded page of eligible active non-members; a non-empty term searches the full eligible active-user population server-side. The server re-resolves membership-management authorization, bounds results, queries active `sys_user` records server-side, excludes current workspace members, and returns only sys_id, display name, username, and email. Inactive users are not offered for new membership, while inactive existing memberships remain listed and removable through the existing removal boundary.

The Members UI enforces the accepted last-active-Workspace-Admin restriction for all callers using the current authoritative member list, while the server remains authoritative for the same restriction on every mutation.
