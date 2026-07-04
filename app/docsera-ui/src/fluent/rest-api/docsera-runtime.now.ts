import "@servicenow/sdk/global";
import { RestApi } from "@servicenow/sdk/core";
import { process as createWorkspace } from "../../server/api/docsera-runtime-create-workspace";
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
    }
  ]
});
