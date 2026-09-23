import "@servicenow/sdk/global";
import { RestApi } from "@servicenow/sdk/core";
import { process as createPage } from "../../server/api/docsera-runtime-create-page";
import { process as deletePageAction } from "../../server/api/docsera-runtime-page-delete-action";
import { process as deletePage } from "../../server/api/docsera-runtime-page-delete";
import { process as acquirePageEditLock } from "../../server/api/docsera-runtime-page-lock-acquire";
import { process as heartbeatPageEditLock } from "../../server/api/docsera-runtime-page-lock-heartbeat";
import { process as publishPage } from "../../server/api/docsera-runtime-page-publish";
import { process as movePage } from "../../server/api/docsera-runtime-page-move";
import { process as releasePageEditLock } from "../../server/api/docsera-runtime-page-lock-release";
import { process as pageEditLockStatus } from "../../server/api/docsera-runtime-page-lock-status";
import { process as savePage } from "../../server/api/docsera-runtime-page-save";
import { process as savePageSettings } from "../../server/api/docsera-runtime-page-settings-save";
import { process as createWorkspace } from "../../server/api/docsera-runtime-create-workspace";
import { process as listPages } from "../../server/api/docsera-runtime-pages";
import { process as workspaces } from "../../server/api/docsera-runtime-workspaces";
import { process as listWorkspaceMedia } from "../../server/api/docsera-runtime-workspace-media.ts";
import { process as uploadWorkspaceMedia } from "../../server/api/docsera-runtime-workspace-media-upload.ts";
import { process as getWorkspaceMediaFile } from "../../server/api/docsera-runtime-workspace-media-file.ts";
import { process as uploadWorkspaceIcon } from "../../server/api/docsera-runtime-workspace-icon-upload.ts";
import { process as getWorkspaceIconFile } from "../../server/api/docsera-runtime-workspace-icon-file.ts";
import { process as workspaceProvisioningStatus } from "../../server/api/docsera-runtime-workspace-provisioning-status";
import {
  listWorkspaceMembers,
  removeWorkspaceMemberAccess,
  searchWorkspaceMemberUsers,
  setWorkspaceMemberAccess
} from "../../server/api/docsera-runtime-workspace-members.ts";
import { process as workspaceDiscardAll } from "../../server/api/docsera-runtime-workspace-discard-all";
import { process as workspaceDiscardPage } from "../../server/api/docsera-runtime-workspace-discard-page";
import { process as deleteWorkspace } from "../../server/api/docsera-runtime-workspace-delete.ts";
import { process as workspacePendingChanges } from "../../server/api/docsera-runtime-workspace-pending-changes";
import { process as workspacePublish } from "../../server/api/docsera-runtime-workspace-publish";
import { process as saveWorkspaceSettings } from "../../server/api/docsera-runtime-workspace-settings-save.ts";
import { process as acquireWorkspaceEditLease } from "../../server/api/docsera-runtime-workspace-edit-lease-acquire";
import { process as resumeWorkspaceEditLease } from "../../server/api/docsera-runtime-workspace-edit-lease-resume";
import { process as renewWorkspaceEditLease } from "../../server/api/docsera-runtime-workspace-edit-lease-renew";
import { process as releaseWorkspaceEditLease } from "../../server/api/docsera-runtime-workspace-edit-lease-release";
import { process as statusWorkspaceEditLease } from "../../server/api/docsera-runtime-workspace-edit-lease-status";
import { process } from "../../server/api/docsera-runtime-ping";

RestApi({
  $id: Now.ID["docsera-runtime-api"],
  name: "Docsera Runtime API",
  serviceId: "docsera_runtime",
  consumes: "application/json",
  produces: "application/json",
  shortDescription: "Baseline same-origin endpoints for the SDK-native Docsera runtime.",
  routes: [
    {
      $id: Now.ID["docsera-runtime-ping-get"],
      name: "ping",
      path: "/ping",
      method: "GET",
      produces: "application/json",
      shortDescription: "Return basic session and scope data for runtime verification.",
      script: process
    },
    {
      $id: Now.ID["docsera-runtime-workspaces-post"],
      name: "workspaces",
      path: "/workspaces",
      method: "POST",
      consumes: "application/json",
      produces: "application/json",
      shortDescription: "Create a workspace record and provision native ServiceNow access groups.",
      script: createWorkspace
    },
    {
      $id: Now.ID["docsera-runtime-workspaces-get"],
      name: "workspaces",
      path: "/workspaces",
      method: "GET",
      produces: "application/json",
      shortDescription: "List accessible workspaces or resolve a workspace by slug.",
      script: workspaces
    },
    {
      $id: Now.ID["docsera-runtime-workspace-provisioning-status-get"],
      name: "workspace_provisioning_status",
      path: "/workspace-provisioning-status",
      method: "GET",
      produces: "application/json",
      shortDescription: "Return the current status of a workspace provisioning request.",
      script: workspaceProvisioningStatus
    },
    {
      $id: Now.ID["docsera-runtime-workspace-settings-put"],
      name: "workspace_settings_save",
      path: "/workspaces/settings",
      method: "PUT",
      consumes: "application/json",
      produces: "application/json",
      shortDescription: "Persist authorized workspace identity and layout defaults without requiring the Edit lease.",
      script: saveWorkspaceSettings
    },
    {
      $id: Now.ID["docsera-runtime-workspace-delete-post"],
      name: "workspace_delete",
      path: "/workspaces/delete",
      method: "POST",
      consumes: "application/json",
      produces: "application/json",
      shortDescription: "Permanently delete a workspace's owned resources and retain an inactive slug tombstone.",
      script: deleteWorkspace
    },
    {
      $id: Now.ID["docsera-runtime-workspace-members-get"],
      name: "workspace_members",
      path: "/workspaces/members",
      method: "GET",
      produces: "application/json",
      shortDescription: "List authorized workspace Admin and Editor members from native ServiceNow groups.",
      script: listWorkspaceMembers
    },
    {
      $id: Now.ID["docsera-runtime-workspace-members-search-get"],
      name: "workspace_members_user_search",
      path: "/workspaces/members/search-users",
      method: "GET",
      produces: "application/json",
      shortDescription: "Search active ServiceNow users for authorized workspace member assignment.",
      script: searchWorkspaceMemberUsers
    },
    {
      $id: Now.ID["docsera-runtime-workspace-members-put"],
      name: "workspace_members_set_access",
      path: "/workspaces/members",
      method: "PUT",
      consumes: "application/json",
      produces: "application/json",
      shortDescription: "Set a user's workspace Admin or Editor access through native ServiceNow groups.",
      script: setWorkspaceMemberAccess
    },
    {
      $id: Now.ID["docsera-runtime-workspace-members-remove-post"],
      name: "workspace_members_remove_access",
      path: "/workspaces/members/remove",
      method: "POST",
      consumes: "application/json",
      produces: "application/json",
      shortDescription: "Remove a user's workspace Admin and Editor access through native ServiceNow groups.",
      script: removeWorkspaceMemberAccess
    },
    {
      $id: Now.ID["docsera-runtime-workspace-pending-changes-post"], name: "workspace_pending_changes", path: "/workspaces/pending-changes", method: "POST", consumes: "application/json", produces: "application/json", shortDescription: "Read the active workspace pending changes through the held Edit lease.", script: workspacePendingChanges
    },
    {
      $id: Now.ID["docsera-runtime-workspace-publish-post"], name: "workspace_publish", path: "/workspaces/publish", method: "POST", consumes: "application/json", produces: "application/json", shortDescription: "Publish the complete workspace pending change set through the held Edit lease.", script: workspacePublish
    },
    {
      $id: Now.ID["docsera-runtime-workspace-discard-page-post"], name: "workspace_discard_page", path: "/workspaces/discard-page", method: "POST", consumes: "application/json", produces: "application/json", shortDescription: "Discard the current pending change represented by a specific workspace page row through the held Edit lease.", script: workspaceDiscardPage
    },
    {
      $id: Now.ID["docsera-runtime-workspace-discard-all-post"], name: "workspace_discard_all", path: "/workspaces/discard-all", method: "POST", consumes: "application/json", produces: "application/json", shortDescription: "Discard the complete workspace pending change set through the held Edit lease.", script: workspaceDiscardAll
    },
    {
      $id: Now.ID["docsera-runtime-workspace-edit-lease-acquire-post"], name: "workspace_edit_lease_acquire", path: "/workspaces/edit-lease/acquire", method: "POST", consumes: "application/json", produces: "application/json", shortDescription: "Acquire the exclusive workspace authoring lease.", script: acquireWorkspaceEditLease
    },
    {
      $id: Now.ID["docsera-runtime-workspace-edit-lease-resume-post"], name: "workspace_edit_lease_resume", path: "/workspaces/edit-lease/resume", method: "POST", consumes: "application/json", produces: "application/json", shortDescription: "Resume the current tab's workspace authoring lease.", script: resumeWorkspaceEditLease
    },
    {
      $id: Now.ID["docsera-runtime-workspace-edit-lease-renew-post"], name: "workspace_edit_lease_renew", path: "/workspaces/edit-lease/renew", method: "POST", consumes: "application/json", produces: "application/json", shortDescription: "Renew the exclusive workspace authoring lease.", script: renewWorkspaceEditLease
    },
    {
      $id: Now.ID["docsera-runtime-workspace-edit-lease-release-post"], name: "workspace_edit_lease_release", path: "/workspaces/edit-lease/release", method: "POST", consumes: "application/json", produces: "application/json", shortDescription: "Release the exclusive workspace authoring lease.", script: releaseWorkspaceEditLease
    },
    {
      $id: Now.ID["docsera-runtime-workspace-edit-lease-status-post"], name: "workspace_edit_lease_status", path: "/workspaces/edit-lease/status", method: "POST", consumes: "application/json", produces: "application/json", shortDescription: "Report the current workspace authoring lease status.", script: statusWorkspaceEditLease
    },
    {
      $id: Now.ID["docsera-runtime-workspace-media-get"], name: "workspace_media_list", path: "/workspaces/media", method: "GET", produces: "application/json", shortDescription: "List the supported workspace-owned image library.", script: listWorkspaceMedia
    },
    {
      $id: Now.ID["docsera-runtime-workspace-media-post"], name: "workspace_media_upload", path: "/workspaces/media", method: "POST", consumes: "image/*", produces: "application/json", shortDescription: "Upload a workspace-owned image attachment through the held workspace edit lease.", script: uploadWorkspaceMedia
    },
    {
      $id: Now.ID["docsera-runtime-workspace-media-file-get"], name: "workspace_media_file", path: "/workspaces/media/file", method: "GET", produces: "image/*", shortDescription: "Stream a workspace-owned image attachment through the authorized media boundary.", script: getWorkspaceMediaFile
    },
    {
      $id: Now.ID["docsera-runtime-workspace-icon-post"], name: "workspace_icon_upload", path: "/workspaces/icons", method: "POST", consumes: "image/*", produces: "application/json", shortDescription: "Upload a validated custom workspace icon asset.", script: uploadWorkspaceIcon
    },
    {
      $id: Now.ID["docsera-runtime-workspace-icon-file-get"], name: "workspace_icon_file", path: "/workspaces/icons/file", method: "GET", produces: "image/*", shortDescription: "Stream an uploaded workspace icon through workspace view authorization.", script: getWorkspaceIconFile
    },
    {
      $id: Now.ID["docsera-runtime-pages-post"],
      name: "pages_create",
      path: "/pages",
      method: "POST",
      consumes: "application/json",
      produces: "application/json",
      shortDescription: "Create a workspace page record.",
      script: createPage
    },
    {
      $id: Now.ID["docsera-runtime-pages-get"],
      name: "pages_list",
      path: "/pages",
      method: "GET",
      produces: "application/json",
      shortDescription: "List workspace page records for authoring shells.",
      script: listPages
    },
    {
      $id: Now.ID["docsera-runtime-pages-patch"],
      name: "pages_save",
      path: "/pages",
      method: "PATCH",
      consumes: "application/json",
      produces: "application/json",
      shortDescription: "Persist draft body changes to an existing workspace page record.",
      script: savePage
    },
    {
      $id: Now.ID["docsera-runtime-pages-publish-post"],
      name: "pages_publish",
      path: "/pages/publish",
      method: "POST",
      consumes: "application/json",
      produces: "application/json",
      shortDescription: "Promote the current persisted draft revision into the reader-facing published page state.",
      script: publishPage
    },
    {
      $id: Now.ID["docsera-runtime-pages-move-post"],
      name: "pages_move",
      path: "/pages/move",
      method: "POST",
      consumes: "application/json",
      produces: "application/json",
      shortDescription: "Move a workspace page within the active Edit hierarchy.",
      script: movePage
    },
    {
      $id: Now.ID["docsera-runtime-pages-put"],
      name: "pages_settings_save",
      path: "/pages",
      method: "PUT",
      consumes: "application/json",
      produces: "application/json",
      shortDescription: "Persist page title and slug settings to an existing workspace page record.",
      script: savePageSettings
    },
    {
      $id: Now.ID["docsera-runtime-page-lock-status-post"],
      name: "page_lock_status",
      path: "/pages/edit-lock/status",
      method: "POST",
      consumes: "application/json",
      produces: "application/json",
      shortDescription: "Resolve the current edit-session status for a page.",
      script: pageEditLockStatus
    },
    {
      $id: Now.ID["docsera-runtime-page-lock-acquire-post"],
      name: "page_lock_acquire",
      path: "/pages/edit-lock/acquire",
      method: "POST",
      consumes: "application/json",
      produces: "application/json",
      shortDescription: "Acquire the exclusive page edit session for a page.",
      script: acquirePageEditLock
    },
    {
      $id: Now.ID["docsera-runtime-page-lock-heartbeat-post"],
      name: "page_lock_heartbeat",
      path: "/pages/edit-lock/heartbeat",
      method: "POST",
      consumes: "application/json",
      produces: "application/json",
      shortDescription: "Refresh the active page edit session.",
      script: heartbeatPageEditLock
    },
    {
      $id: Now.ID["docsera-runtime-page-lock-release-post"],
      name: "page_lock_release",
      path: "/pages/edit-lock/release",
      method: "POST",
      consumes: "application/json",
      produces: "application/json",
      shortDescription: "Release the active page edit session.",
      script: releasePageEditLock
    },
    {
      $id: Now.ID["docsera-runtime-pages-delete-action-post"],
      name: "pages_delete_action",
      path: "/pages/delete",
      method: "POST",
      consumes: "application/json",
      produces: "application/json",
      shortDescription: "Hard-delete a workspace page record and its descendant subtree through a ServiceNow-compatible action route.",
      script: deletePageAction
    },
    {
      $id: Now.ID["docsera-runtime-pages-delete"],
      name: "pages_delete",
      path: "/pages",
      method: "DELETE",
      produces: "application/json",
      shortDescription: "Legacy delete route kept body-free because ServiceNow runtime scripts cannot access DELETE request bodies.",
      script: deletePage
    }
  ]
});
