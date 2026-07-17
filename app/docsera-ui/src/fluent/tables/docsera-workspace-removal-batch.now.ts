import "@servicenow/sdk/global";
import { ChoiceColumn, DateTimeColumn, ReferenceColumn, StringColumn, Table } from "@servicenow/sdk/core";

export const x_82900_docsera_workspace_removal_batch = Table({
  name: "x_82900_docsera_workspace_removal_batch",
  label: "Docsera Workspace Removal Batch",
  display: "batch_key",
  accessibleFrom: "package_private",
  audit: true,
  createAccessControls: false,
  allowWebServiceAccess: false,
  schema: {
    change_set: ReferenceColumn({ label: "Change set", mandatory: true, referenceTable: "x_82900_docsera_workspace_change_set" }),
    root_page: ReferenceColumn({ label: "Root page", mandatory: true, referenceTable: "x_82900_docsera_page" }),
    batch_key: StringColumn({ label: "Batch key", mandatory: true, maxLength: 80 }),
    lifecycle_state: ChoiceColumn({ label: "Lifecycle state", mandatory: true, default: "active", choices: { active: "Active", retired: "Retired" } }),
    removed_on: DateTimeColumn({ label: "Removed on", mandatory: true }),
    removed_by: ReferenceColumn({ label: "Removed by", mandatory: true, referenceTable: "sys_user" })
  },
  index: [{ name: "batch_key_unique", element: "batch_key", unique: true }]
});
