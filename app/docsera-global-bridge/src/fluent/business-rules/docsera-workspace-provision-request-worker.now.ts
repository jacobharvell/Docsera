import "@servicenow/sdk/global";
import { BusinessRule } from "@servicenow/sdk/core";

BusinessRule({
  $id: Now.ID["docsera-workspace-provision-request-worker"],
  name: "Docsera Workspace Provision Request Worker",
  table: "x_2300756_docsera_workspace_provision_request",
  when: "async",
  action: ["insert"],
  order: 100,
  filterCondition: "state=requested",
  script: Now.include("../../server/business-rules/process-workspace-provision-request.js")
});
