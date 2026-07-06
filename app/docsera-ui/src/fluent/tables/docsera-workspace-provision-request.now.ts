import "@servicenow/sdk/global";
import {
  BooleanColumn,
  ChoiceColumn,
  ReferenceColumn,
  StringColumn,
  Table
} from "@servicenow/sdk/core";

export const x_82900_docsera_workspace_provision_request = Table({
  name: "x_82900_docsera_workspace_provision_request",
  label: "Docsera Workspace Provision Request",
  display: "name",
  actions: ["read", "update"],
  allowWebServiceAccess: true,
  audit: true,
  schema: {
    name: StringColumn({
      label: "Workspace name",
      mandatory: true,
      maxLength: 160
    }),
    workspace_slug: StringColumn({
      label: "Workspace slug",
      mandatory: true,
      maxLength: 160
    }),
    workspace_group_key: StringColumn({
      label: "Workspace group key",
      mandatory: true,
      maxLength: 160
    }),
    admin_group_name: StringColumn({
      label: "Admin group name",
      mandatory: true,
      maxLength: 200
    }),
    editor_group_name: StringColumn({
      label: "Editor group name",
      mandatory: true,
      maxLength: 200
    }),
    short_description: StringColumn({
      label: "Short description",
      maxLength: 240
    }),
    icon_type: ChoiceColumn({
      label: "Icon type",
      mandatory: true,
      default: "builtin",
      choices: {
        builtin: "Built-in",
        uploaded: "Uploaded"
      }
    }),
    icon_key: StringColumn({
      label: "Icon key",
      mandatory: true,
      maxLength: 160
    }),
    icon_label: StringColumn({
      label: "Icon label",
      mandatory: true,
      maxLength: 160
    }),
    icon_asset_path: StringColumn({
      label: "Icon asset path",
      maxLength: 255
    }),
    workspace_status: ChoiceColumn({
      label: "Workspace status",
      mandatory: true,
      default: "active",
      choices: {
        active: "Active",
        inactive: "Inactive"
      }
    }),
    toc_default_visible: BooleanColumn({
      label: "Table of contents visible by default",
      mandatory: true,
      default: true
    }),
    page_width: ChoiceColumn({
      label: "Page width",
      mandatory: true,
      default: "readable",
      choices: {
        readable: "Readable",
        full: "Full width"
      }
    }),
    requested_by: ReferenceColumn({
      label: "Requested by",
      mandatory: true,
      referenceTable: "sys_user"
    }),
    state: ChoiceColumn({
      label: "Provisioning state",
      mandatory: true,
      default: "requested",
      choices: {
        requested: "Requested",
        processing: "Processing",
        succeeded: "Succeeded",
        failed: "Failed"
      }
    }),
    workspace: ReferenceColumn({
      label: "Workspace",
      referenceTable: "x_82900_docsera_workspace"
    }),
    admin_group: ReferenceColumn({
      label: "Admin group",
      referenceTable: "sys_user_group"
    }),
    editor_group: ReferenceColumn({
      label: "Editor group",
      referenceTable: "sys_user_group"
    }),
    error_code: StringColumn({
      label: "Error code",
      maxLength: 80
    }),
    error_message: StringColumn({
      label: "Error message",
      maxLength: 255
    })
  }
});
