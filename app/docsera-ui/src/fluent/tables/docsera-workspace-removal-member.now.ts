import "@servicenow/sdk/global";
import { IntegerColumn, ReferenceColumn, StringColumn, Table } from "@servicenow/sdk/core";

export const x_2300756_docsera_workspace_removal_member = Table({
  name: "x_2300756_docsera_workspace_removal_member",
  label: "Docsera Workspace Removal Member",
  display: "batch_page_key",
  accessibleFrom: "package_private",
  audit: true,
  createAccessControls: false,
  allowWebServiceAccess: false,
  schema: {
    removal_batch: ReferenceColumn({ label: "Removal batch", mandatory: true, referenceTable: "x_2300756_docsera_workspace_removal_batch" }),
    page: ReferenceColumn({ label: "Page identity", mandatory: true, referenceTable: "x_2300756_docsera_page" }),
    batch_page_key: StringColumn({ label: "Batch page key", mandatory: true, maxLength: 80, unique: true }),
    first_pending_sequence: IntegerColumn({ label: "First pending sequence", mandatory: true, min: 1 })
  }
});
