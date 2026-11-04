import "@servicenow/sdk/global";
import { DateTimeColumn, IntegerColumn, ReferenceColumn, StringColumn, Table } from "@servicenow/sdk/core";

export const x_2300756_docsera_workspace_change_entry = Table({
  name: "x_2300756_docsera_workspace_change_entry",
  label: "Docsera Workspace Change Entry",
  display: "generation_page_key",
  accessibleFrom: "package_private",
  audit: true,
  createAccessControls: false,
  allowWebServiceAccess: false,
  schema: {
    change_set: ReferenceColumn({ label: "Change set", mandatory: true, referenceTable: "x_2300756_docsera_workspace_change_set" }),
    page: ReferenceColumn({ label: "Page identity", mandatory: true, referenceTable: "x_2300756_docsera_page" }),
    generation_page_key: StringColumn({ label: "Generation page key", mandatory: true, maxLength: 80, unique: true }),
    first_pending_sequence: IntegerColumn({ label: "First pending sequence", mandatory: true, min: 1 }),
    first_pending_on: DateTimeColumn({ label: "First pending on", mandatory: true }),
    last_changed_on: DateTimeColumn({ label: "Last changed on", mandatory: true }),
    last_changed_by: ReferenceColumn({ label: "Last changed by", mandatory: true, referenceTable: "sys_user" })
  }
});
