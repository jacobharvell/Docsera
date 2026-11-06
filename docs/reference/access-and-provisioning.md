# Access and provisioning reference

This reference describes the implemented authorization, workspace-provisioning, and membership-administration boundaries. It is a current implementation reference, not an ACL inventory or a security assessment. For the workspace record and lifecycle, see the [workspace domain reference](workspace-domain.md); for page and publishing authority, see [page state and hierarchy](page-state-and-hierarchy.md) and [publishing and change sets](publishing-and-change-sets.md).

## Authorization model

Docsera declares three scoped roles:

- `x_2300756_docsera.admin` (Docsera Admin) contains `workspace_admin` and `editor`.
- `x_2300756_docsera.workspace_admin` (Workspace Admin) contains `editor`.
- `x_2300756_docsera.editor` (Editor) has no further declared containment.

Each provisioned workspace also has two distinct native ServiceNow groups: `Docsera_<Workspace_Key>_Admins`, which is assigned the Workspace Admin role, and `Docsera_<Workspace_Key>_Editors`, which is assigned the Editor role. A role is only the application-level part of ordinary workspace authority. The scoped server evaluates the current authenticated user with `gs.hasRole(...)` and checks `sys_user_grmember` for membership in the particular workspace's stored Admin or Editor group.

| Caller state for the requested active workspace | Read | Author/edit | Workspace settings, members, or deletion |
| --- | --- | --- | --- |
| Docsera Admin | Yes | Yes | Yes |
| Workspace Admin role and membership in that workspace's Admin group | Yes | Yes | Yes |
| Editor role and membership in that workspace's Editor group | Yes | Yes | No |
| Authenticated caller without an elevated relationship | Yes | No | No |

Docsera Admin is an application-wide override, not membership in every workspace Admin group. Conversely, holding a Workspace Admin or Editor role does not grant access to every workspace: the matching workspace-specific native group membership is required. Missing workspace group references fail closed for elevated access. Workspace creation requires Docsera Admin; settings, membership administration, and deletion require effective workspace-admin capability; authoring requires effective editor capability (which includes workspace-admin capability).

An unaffiliated authenticated caller receives reader capability for active workspaces only. Effective Admins and Editors retain view capability for inactive workspace records. Separately, the workspace catalog filters inactive workspaces from discovery, independent of capability evaluation.

## Workspace provisioning

The scoped create-workspace route first checks the current user for Docsera Admin capability. Its service validates the proposed workspace, derives a collision-safe slug and generated group key/names, applies default metadata, and records the current user as the creator audit identity. It then writes a durable `x_2300756_docsera_workspace_provision_request` in `requested` state. Request states are `requested`, `processing`, `succeeded`, and `failed`.

The separately owned Global companion processes that constrained request. After validating its payload and the expected Docsera group-name contract, it creates the Admin and Editor native groups, assigns their respective scoped roles, and creates the scoped workspace record with references to both groups. It records the resulting workspace and group identifiers on a successful request. The create response may therefore be an immediate success, or a pending result with a status URL for the authorized status route to poll.

If provisioning fails before workspace creation, the worker rolls back groups that it created. It records a bounded safe failure code/message on the request. A failed request is not a workspace, and callers receive the supported failure/status outcome rather than an invented retry or client-side reconstruction.

The creator field is audit metadata only. Provisioning does **not** add the creator to either native access group and does not create an initial Workspace Admin; an authorized Manage Access action must assign the first member.

## Membership administration

Manage Access is available only to a Docsera Admin or an effective Workspace Admin for the target workspace. The scoped service resolves the workspace, evaluates that capability, validates that both stored group references are present, and then performs the supported operation:

- list the workspace's members from the native Admin and Editor groups;
- search active eligible users on the server, with bounded results and exclusions for existing or caller-supplied users;
- assign Editor or Admin access, including promotion and demotion; or
- remove both forms of workspace access.

`sys_user_grmember` is the membership authority. When a user appears in both groups, member presentation gives Admin precedence. Inactive existing members remain visible so an authorized administrator can remove them. The service prevents removal or demotion of the last active Workspace Admin, while still allowing a Docsera Admin to recover a zero-admin workspace by adding or promoting a replacement.

The scoped service does not mutate native membership directly. It creates a constrained workspace-member mutation command after validation. The Global membership bridge validates that the group IDs are distinct and belong to a Docsera workspace, then synchronously processes the validated pair: an Admin assignment adds Admin membership and removes Editor membership; an Editor assignment does the inverse; removal deletes membership from both groups. The scoped service then rereads native membership and reports success only when the authoritative end state is exact. The command record is a handoff mechanism, not the authority for membership, authorization, or membership history.

## Scoped and Global responsibilities

The scoped application owns Docsera authorization decisions, request validation, and workspace data. The Global companion exists for the narrow native ServiceNow operations that the scoped app cannot safely own: creating the provisioned groups, assigning their scoped roles, changing their native membership, and deleting validated workspace groups.

Provisioning requests and membership commands are the explicit handoffs between those responsibilities. The Global workers validate payloads and targets before touching native groups; the membership bridge verifies that the Admin/Editor pair belongs to a Docsera workspace, and group deletion also verifies the generated Docsera group naming contract. These bridges are not arbitrary group-management APIs and do not replace the scoped capability evaluator. Existing cross-scope privileges enable these specific interactions; this reference does not imply broader cross-scope access.

## Deletion and installation ownership

Deleting a workspace requires effective workspace-admin capability. Before the scoped service commits deletion, it asks the Global boundary to validate the stored, owned Admin/Editor group pair. A failed or unresolved preflight leaves the workspace active. Once preflight succeeds, the scoped service marks the workspace inactive as a tombstone before cleanup. It removes workspace-owned records and relevant attachments, and the Global companion deletes only the validated workspace groups.

If cleanup fails after the inactive commit, the supported outcome is committed-but-incomplete; later cleanup can retry against the inactive tombstone. Finalization clears deleted references while preserving the slug so a prior route is not silently reused.

Native groups and `sys_user_grmember` rows are ServiceNow group/membership data. They are not SDK application ownership records. The scoped application and the Global companion are separately installed, separately owned application identities; neither identity is a Docsera user role or a workspace membership. Follow the existing [source installation guide](../guides/development-setup.md) or [0.1.0 update-set installation guide](../guides/update-set-installation.md) for their tested procedures.

## Enforcement boundaries and limitations

Authorization is enforced in server services and route handlers, not by client state. Generic record access to server-owned provisioning, membership-command, lease, change-set, snapshot, and related workflow tables is explicitly denied; supported API/service paths perform capability checks and validate command inputs. The server returns safe supported failures rather than exposing arbitrary native-group operations or relying on a caller-provided identity.

This reference deliberately does not claim unrestricted platform-administrator access, universal portability, or a complete security guarantee. It also does not enumerate every ACL or model threat paths. The planned `docs/security/authorization-boundaries.md` is the place for the comprehensive ACL inventory, security audit, and threat analysis.

## Implementation evidence

Principal implementation sources:

- `app/docsera-ui/src/fluent/security/docsera-roles.now.ts`
- `app/docsera-ui/src/fluent/security/docsera-workspace-foundation-table-access.now.ts`
- `app/docsera-ui/src/server/workspaces/serviceNowWorkspaceCapabilities.ts`
- `app/docsera-ui/src/server/workspaces/serviceNowWorkspaceProvisioning.ts`
- `app/docsera-ui/src/server/workspaces/serviceNowWorkspaceMembers.ts`
- `app/docsera-ui/src/server/workspaces/serviceNowWorkspaceDeletion.ts`
- `app/docsera-global-bridge/src/server/script-includes/docsera-global-workspace-provisioning-bridge.js`
- `app/docsera-global-bridge/src/server/script-includes/docsera-global-workspace-membership-bridge.js`
- the companion provisioning and member-command business rules under `app/docsera-global-bridge/src/server/business-rules/`

Focused regression evidence includes `app/docsera-ui/test/workspaceProvisioningTrigger.test.ts`, the workspace members and deletion tests under `app/docsera-ui/src/server/workspaces/`, and the Global companion provisioning, membership-bridge, and membership-worker tests. Those tests cover the no-initial-admin provisioning contract, exact membership end-state verification, Admin precedence, last-active-admin protection, validated group operations, and inactive-tombstone cleanup behavior.
