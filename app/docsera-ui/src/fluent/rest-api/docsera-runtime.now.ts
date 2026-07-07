import "@servicenow/sdk/global";
import { RestApi } from "@servicenow/sdk/core";
import { process as createPage } from "../../server/api/docsera-runtime-create-page";
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
    }
  ]
});
