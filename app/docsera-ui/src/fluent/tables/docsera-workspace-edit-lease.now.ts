import "@servicenow/sdk/global";
import { DateTimeColumn, ReferenceColumn, StringColumn, Table } from "@servicenow/sdk/core";

/** The sole durable authoring authority for a workspace.  It is intentionally
 * package-private: clients can only operate it through the scoped REST routes. */
export const x_82900_docsera_workspace_edit_lease = Table({
  name: "x_82900_docsera_workspace_edit_lease",
  label: "Docsera Workspace Edit Lease",
  display: "workspace_key",
  accessibleFrom: "package_private",
  audit: true,
  createAccessControls: false,
  allowWebServiceAccess: false,
  schema: {
    workspace_key: StringColumn({ label: "Workspace key", mandatory: true, maxLength: 40, unique: true }),
    workspace: ReferenceColumn({ label: "Workspace", mandatory: true, referenceTable: "x_82900_docsera_workspace" }),
    holder_user: ReferenceColumn({ label: "Holder user", mandatory: true, referenceTable: "sys_user" }),
    verifier_digest: StringColumn({ label: "Verifier digest", mandatory: true, maxLength: 64 }),
    acquired_on: DateTimeColumn({ label: "Acquired on", mandatory: true }),
    last_seen_on: DateTimeColumn({ label: "Last seen on", mandatory: true })
  },
  index: [{ name: "last_seen_on_idx", element: "last_seen_on", unique: false }]
});
