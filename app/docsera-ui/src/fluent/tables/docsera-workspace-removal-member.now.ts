import "@servicenow/sdk/global";
import { IntegerColumn, ReferenceColumn, StringColumn, Table } from "@servicenow/sdk/core";

export const x_82900_docsera_workspace_removal_member = Table({
  name: "x_82900_docsera_workspace_removal_member",
  label: "Docsera Workspace Removal Member",
  display: "batch_page_key",
  accessibleFrom: "package_private",
  audit: true,
  createAccessControls: false,
  allowWebServiceAccess: false,
  schema: {
    removal_batch: ReferenceColumn({ label: "Removal batch", mandatory: true, referenceTable: "x_82900_docsera_workspace_removal_batch" }),
    page: ReferenceColumn({ label: "Page identity", mandatory: true, referenceTable: "x_82900_docsera_page" }),
    batch_page_key: StringColumn({ label: "Batch page key", mandatory: true, maxLength: 80 })
    ,first_pending_sequence: IntegerColumn({ label: "First pending sequence", mandatory: true, min: 1 })
  },
  index: [{ name: "batch_page_key_unique", element: "batch_page_key", unique: true }]
});
