# RR-008 — Workspace Administration and Resource Authorization Review

Date: 2026-10-30
Status: evidence-only review; no instance, application, or source behaviour was changed

## Scope and conclusion

This review traced the supported workspace-administration and workspace-resource REST routes from request parsing through the ServiceNow services, workspace resolution, capability evaluation, and attachment ownership checks. It reviewed the focused service and route tests and used RR-005 and RR-007 only for the related server-owned command-table boundary.

**Conclusion: no material authorization or cross-workspace resource-access defect was established. No code change is recommended.**

A caller cannot use a different workspace sys_id, slug, icon asset key, or media attachment id to obtain authority from a workspace they administer and apply it to another workspace. The affected mutation paths resolve the target workspace from request input and calculate the current user's capability against that resolved record. Media retrieval additionally proves the attachment belongs to the requested workspace before streaming it. Settings icon staging/claiming verifies both target workspace and uploading user. Uploading media requires authoring capability and a valid edit lease for that same resolved workspace.

The reader model is intentionally broader than authoring: an authenticated user has `canViewWorkspace` for every active workspace. Thus an authenticated caller can resolve active workspace metadata by slug and can retrieve an icon or supported media belonging to an active workspace when its opaque key/id is known. This is permitted viewing behaviour, not a cross-workspace authorization bypass. The returned workspace projection excludes server-only group references, creator/audit fields, pending/published references, and state revision.

## Route/control matrix

| REST operation | Request-controlled reference | Resolved target and authorization | Ownership / lease control | Result for unauthorized or substituted input |
| --- | --- | --- | --- | --- |
| `POST /workspaces/delete` | `workspaceSysId` preferred; otherwise `workspaceSlug` | `serviceNowWorkspaceDeletion` loads that record, then requires `canAdminWorkspace` for it. | Cleanup queries use the resolved workspace sys_id and schema relationships. | 404 for no resolved workspace; 403 before destructive work for non-Admin. A conflicting slug cannot redirect a supplied sys_id request. |
| `PUT /workspaces/settings` | `workspaceSysId` preferred; otherwise slug | `serviceNowWorkspaceSettings` loads that record and requires `canAdminWorkspace`. `applyWorkspaceSettings` rejects a supplied slug that does not match the loaded sys_id record. | Uploaded-icon claim occurs only after capability authorization and uses the resolved sys_id. | 403 before persistence/claim for Editor or view-only caller; 404 for missing or mismatched identity. |
| `GET /workspaces` and `GET /workspaces?workspaceSlug=` | search text or slug | List returns only Admin/Editor membership items. Single active-workspace lookup constructs an intentional reader projection using `canViewWorkspace`. | None; response uses `toWorkspaceViewRecord`, not the server record. | Inactive/missing slug is 404. Active-workspace reader metadata is available to authenticated users by design. |
| `POST /workspaces/icons` | optional `workspaceSysId` | With a workspace reference, service loads that workspace and requires `canAdminWorkspace`; without one it requires Docsera Admin workspace-creation authority. | Validated staged asset records carry requester identity; settings assets are explicitly tied to the target workspace. | 404 for missing target; 403 before asset/attachment writes for non-Admin. |
| `GET /workspaces/icons/file` | `assetKey`, optional preview `workspaceSysId` | Claimed icon resolves its own workspace and requires its `canViewWorkspace`. Settings preview separately loads supplied target and requires Admin. | Claimed asset must have matching asset key/state/workspace and attachment table/sys_id. Preview also requires staged state, exact target, no provisioning request, and same requester. | 404 for mismatched/unknown resource association; 403 for unauthorized viewer/previewer. |
| `GET /workspaces/media` | `workspaceSysId` | Loads that workspace and requires Admin or Editor authoring capability. | Lists only `sys_attachment` rows whose table and table sys_id equal the resolved workspace. | 403 for view-only/unrelated caller; only supported image records are described. |
| `POST /workspaces/media` | `workspaceSysId`, lease header | Loads that workspace and requires Admin or Editor capability. | Calls `verifyWorkspaceEditLease` with the resolved workspace sys_id and slug before creating an attachment; verifies persisted attachment is attached to that workspace. | 403 before lease verification/persistence for unauthorized caller; 403 for a missing/invalid/wrong-workspace lease. |
| `GET /workspaces/media/file` | `workspaceSysId`, `mediaId` | Loads target then requires `canViewWorkspace`. | Attachment must match both supplied id and `x_82900_docsera_workspace` / supplied workspace sys_id before its stream is opened. | 404 for media belonging to another workspace; 403 before attachment resolution for caller without view capability. |

## Supporting evidence

### Effective workspace capability

`serviceNowWorkspaceCapabilities.ts` derives the user identity from `gs.getUserID()` and delegates to `evaluateWorkspaceCapabilities`. The domain calculation grants:

- `canAdminWorkspace` only to a Docsera Admin or a caller with the workspace-Admin role **and** membership in the resolved workspace's stored Admin group.
- `canEditWorkspace` to that Admin capability or the workspace Editor role plus membership in the resolved workspace's stored Editor group.
- `canViewWorkspace` to an editor/admin, or any authenticated caller when the workspace is active.

The group references used for a capability are taken from the loaded `WorkspaceRecord`; they are never accepted from these REST requests. This preserves the RR-007 pattern: authorization is evaluated after resolution against the exact referenced workspace, rather than against a caller's current or previously selected workspace.

### Deletion and settings

`docsera-runtime-workspace-delete.ts` passes only cleaned slug/sys_id values to `deleteWorkspace`. `serviceNowWorkspaceDeletion.ts` chooses a supplied sys_id before a slug, loads the corresponding workspace, checks `canAdminWorkspace`, and only then enumerates and deletes resources related to its `workspaceSysId`. The focused deletion test explicitly verifies a caller without Workspace Admin authority is rejected before cleanup; cleanup tests assert schema-related page, change-set, snapshot, attachment, icon-asset, lease, command, and claim handling.

`docsera-runtime-workspace-settings-save.ts` similarly passes cleaned values to `saveWorkspaceSettings`. The settings service loads the sys_id when present, otherwise the slug, checks Admin capability before any icon claim or save, and `applyWorkspaceSettings` preserves identity by rejecting a mismatching supplied slug/sys_id pair. Its tests cover Editor/view-only rejection before persistence, mismatched identity rejection, and the post-authorization uploaded-icon claim rollback path.

No edit lease is required for settings or deletion. That is an explicit route contract for workspace administration; Admin authorization is the control, rather than an omitted media-style lease check.

### Discovery and intentional metadata exposure

`serviceNowWorkspaceCatalog.ts` queries only active records. List construction evaluates each candidate and retains only items with an Admin or Editor role label, so the list does not enumerate all active workspaces to an ordinary reader. By contrast, the single-slug path returns an active workspace through `buildAccessibleWorkspaceView`; under the accepted capability rule, an authenticated reader may view it.

`toWorkspaceViewRecord` is the REST projection. It returns sys_id, slug, name, description, icon, ToC visibility, active status, role label, and the two UI-management flags. It does not expose Admin/Editor group sys_ids, creator identity, audit fields, pending/published record references, page-width internals, or state revision. This is the intentionally available workspace metadata discussed in the conclusion.

### Icons and attachment ownership

`serviceNowWorkspaceIcons.ts` uses an opaque generated asset key but does not rely on opacity for authorization. The service checks the asset's lifecycle state, uploader (`requestedBy`), exact staged workspace association, provision request association where relevant, and the attachment's table/sys_id plus stored metadata.

For settings replacement, `uploadWorkspaceIcon` first loads and Admin-authorizes the requested workspace, then persists the staged asset with that exact workspace id. `claimWorkspaceSettingsIcon` calls `validateClaimableAsset` with the same id; a staged asset for another workspace fails. Preview additionally requires the same uploading user and Admin capability on that exact workspace. The cleanup action is bounded to an asset that is still staged, belongs to the caller, is associated with the supplied workspace, and has no provisioning request; it cannot alter workspace settings or delete another user's asset.

For a published icon, `getWorkspaceIconFile` follows the asset's stored workspace association, evaluates view capability for that workspace, and verifies the attachment belongs to the icon-asset record before opening its stream. The icon asset table is also declared with web-service access disabled and source-controlled generic create/read/write/delete deny ACLs, consistent with the server-owned resource model noted in RR-007.

Focused icon tests cover non-Admin upload denial before writes, exact-workspace staged-asset claims, wrong-workspace claim rejection, current-user ownership checks, settings-preview authorization, and attachment ownership/metadata validation.

### Media and attachment-ID substitution

`serviceNowWorkspaceMedia.ts` loads the request workspace before every list, upload, and file operation. List/upload require Admin or Editor capability; file retrieval requires view capability. `loadAttachmentOrFailure` rejects a media id unless the retrieved `sys_attachment` has both the expected workspace table name and exactly the supplied workspace sys_id. It executes after the view check but before `getAttachmentContentStream`.

Media upload constructs its lease validation input from the resolved workspace's stored sys_id and slug, not from any additional caller-controlled workspace property. It writes to the resolved workspace, then verifies that the newly persisted attachment still belongs to that workspace before returning a descriptor. The route test confirms the raw lease header is passed to the service. Focused service tests cover denial of a view-only uploader before lease/persistence, valid view-only retrieval, another-workspace attachment returning 404, unauthorized retrieval before attachment access, and lease-required upload.

## Findings

| Severity | Finding | Evidence and disposition |
| --- | --- | --- |
| None | No confirmed cross-workspace deletion, settings mutation, icon claim/retrieval bypass, or media list/upload/file bypass. | Each relevant service resolves the request's target first and evaluates capability on that target. Media and icon stream paths independently verify stored attachment ownership. No code change recommended. |
| Informational | Active workspace metadata and active-workspace reader assets are available to authenticated users under `canViewWorkspace`. | This is explicit in `evaluateWorkspaceCapabilities`; catalog uses a reduced view projection. It should be reassessed only if accepted requirements later make workspaces/private media membership-only. It is not a defect under current behaviour. |
| Informational | Some 403/404 distinctions reveal whether a caller's referenced workspace or resource association exists. | Responses contain generic messages and no server-only record values. The distinction is not material beyond intentionally available active-workspace metadata; no enumeration vector was established because keys/attachment ids are opaque and list access is authoring-gated. |

## Review limits and later G1 boundaries

This was source/test evidence only. It did not perform PDI mutation, impersonation, attachment probing, deployment, or an effective-user REST test. Consequently, it does not claim that installed ACL/configuration drift cannot alter these route assumptions.

Later G1 work should examine, independently rather than as an extension of this review:

1. Page-authoring, page save/move/delete/publish/discard, and page/media-reference boundaries, including their own edit-lease and workspace-resolution rules.
2. Edit-lease acquire/resume/renew/release/status and recovery endpoints, including token binding, stale context, and cross-workspace replay resistance.
3. Direct Table API/ACL and attachment platform surfaces for the workspace table and `sys_attachment`, with authorized, narrowly scoped installed-instance evidence if such testing is approved.
4. RR-005's separate provisioning-request queue concern and any post-remediation installed metadata verification; this review did not reopen that suspected defect.

## Recommendation

**No code change.** Preserve the existing authorization and resource-ownership controls. Any later change to workspace visibility should update the capability contract and add focused catalog/icon/media regression coverage before changing the current authenticated-reader model.
