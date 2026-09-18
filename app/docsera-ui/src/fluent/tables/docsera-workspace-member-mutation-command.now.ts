import "@servicenow/sdk/global";
import { ChoiceColumn, ReferenceColumn, StringColumn, Table } from "@servicenow/sdk/core";

export const x_82900_docsera_workspace_member_mutation_command = Table({
  name: "x_82900_docsera_workspace_member_mutation_command",
  label: "Docsera Workspace Member Mutation Command",
  display: "workspace",
  actions: ["read", "update"],
  allowWebServiceAccess: false,
  audit: true,
  schema: {
    workspace: ReferenceColumn({
      label: "Workspace",
      mandatory: true,
      referenceTable: "x_82900_docsera_workspace"
    }),
    target_user: ReferenceColumn({
      label: "Target user",
      mandatory: true,
      referenceTable: "sys_user"
    }),
    mutation_kind: ChoiceColumn({
      label: "Mutation kind",
      mandatory: true,
      choices: {
        set: "Set access",
        remove: "Remove access"
      }
    }),
    access_level: ChoiceColumn({
      label: "Access level",
      choices: {
        admin: "Workspace Admin",
        editor: "Editor"
      }
    }),
    requested_by: ReferenceColumn({
      label: "Requested by",
      mandatory: true,
      referenceTable: "sys_user"
    }),
    state: ChoiceColumn({
      label: "Processing state",
      mandatory: true,
      default: "requested",
      choices: {
        requested: "Requested",
        succeeded: "Succeeded",
        failed: "Failed"
      }
    }),
    error_message: StringColumn({
      label: "Error message",
      maxLength: 255
    })
  }
});
