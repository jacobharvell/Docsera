import "@servicenow/sdk/global";
import {
  ChoiceColumn,
  IntegerColumn,
  ReferenceColumn,
  StringColumn,
  Table
} from "@servicenow/sdk/core";

export const x_82900_docsera_workspace_icon_asset = Table({
  name: "x_82900_docsera_workspace_icon_asset",
  label: "Docsera Workspace Icon Asset",
  display: "asset_key",
  actions: ["read", "create", "update", "delete"],
  allowWebServiceAccess: false,
  audit: true,
  schema: {
    asset_key: StringColumn({ label: "Asset key", mandatory: true, maxLength: 80, unique: true }),
    state: ChoiceColumn({
      label: "State",
      mandatory: true,
      default: "staged",
      choices: {
        staged: "Staged",
        cleaning: "Cleaning",
        claimed: "Claimed",
        invalid: "Invalid"
      }
    }),
    requested_by: ReferenceColumn({ label: "Requested by", mandatory: true, referenceTable: "sys_user" }),
    workspace: ReferenceColumn({ label: "Workspace", referenceTable: "x_82900_docsera_workspace" }),
    provision_request: ReferenceColumn({ label: "Provision request", referenceTable: "x_82900_docsera_workspace_provision_request" }),
    attachment: ReferenceColumn({ label: "Attachment", referenceTable: "sys_attachment" }),
    file_name: StringColumn({ label: "File name", maxLength: 255 }),
    content_type: StringColumn({ label: "Content type", maxLength: 80 }),
    size_bytes: IntegerColumn({ label: "Size bytes", min: 0 }),
    width: IntegerColumn({ label: "Width", min: 0 }),
    height: IntegerColumn({ label: "Height", min: 0 })
  }
});
