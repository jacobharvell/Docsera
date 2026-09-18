import "@servicenow/sdk/global";
import { BusinessRule } from "@servicenow/sdk/core";

BusinessRule({
  $id: Now.ID["docsera-workspace-member-mutation-command-worker"],
  name: "Docsera Workspace Member Mutation Command Worker",
  table: "x_82900_docsera_workspace_member_mutation_command",
  when: "after",
  action: ["insert"],
  order: 100,
  filterCondition: "state=requested",
  script: Now.include("../../server/business-rules/process-workspace-member-mutation-command.js")
});
