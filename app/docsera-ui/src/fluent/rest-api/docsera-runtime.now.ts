import "@servicenow/sdk/global";
import { RestApi } from "@servicenow/sdk/core";
import { process as createPage } from "../../server/api/docsera-runtime-create-page";
import { process as deletePageAction } from "../../server/api/docsera-runtime-page-delete-action";
import { process as deletePage } from "../../server/api/docsera-runtime-page-delete";
import { process as savePage } from "../../server/api/docsera-runtime-page-save";
import { process as savePageSettings } from "../../server/api/docsera-runtime-page-settings-save";
import { process as createWorkspace } from "../../server/api/docsera-runtime-create-workspace";
import { process as listPages } from "../../server/api/docsera-runtime-pages";
import { process as workspaces } from "../../server/api/docsera-runtime-workspaces";
import { process as workspaceProvisioningStatus } from "../../server/api/docsera-runtime-workspace-provisioning-status";
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
