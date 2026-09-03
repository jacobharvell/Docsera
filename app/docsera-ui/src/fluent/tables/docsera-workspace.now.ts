import "@servicenow/sdk/global";
import {
  BooleanColumn,
  ChoiceColumn,
  IntegerColumn,
  ReferenceColumn,
  StringColumn,
  Table
} from "@servicenow/sdk/core";

export const x_82900_docsera_workspace = Table({
  name: "x_82900_docsera_workspace",
  label: "Docsera Workspace",
  display: "name",
  actions: ["read", "create", "delete"],
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
      maxLength: 160,
      unique: true
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
    status: ChoiceColumn({
      label: "Status",
      mandatory: true,
      default: "active",
      choices: {
        active: "Active",
        inactive: "Inactive"
      }
    }),
    admin_group: ReferenceColumn({
      label: "Admin group",
      mandatory: true,
      referenceTable: "sys_user_group"
    }),
    editor_group: ReferenceColumn({
      label: "Editor group",
      mandatory: true,
      referenceTable: "sys_user_group"
    }),
    creator: ReferenceColumn({
      label: "Creator",
      mandatory: true,
      referenceTable: "sys_user"
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
    pending_change_set: ReferenceColumn({
      label: "Active pending change set",
      referenceTable: "x_82900_docsera_workspace_change_set"
    }),
    published_snapshot_set: ReferenceColumn({
      label: "Published snapshot set",
      referenceTable: "x_82900_docsera_workspace_snapshot_set"
    }),
    workspace_state_revision: IntegerColumn({
      label: "Workspace selector revision",
      mandatory: true,
      default: 0,
      min: 0
    })
  }
});
