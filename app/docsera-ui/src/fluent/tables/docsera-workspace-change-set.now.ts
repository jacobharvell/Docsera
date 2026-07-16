import "@servicenow/sdk/global";
import { ChoiceColumn, DateTimeColumn, IntegerColumn, ReferenceColumn, StringColumn, Table } from "@servicenow/sdk/core";

export const x_82900_docsera_workspace_change_set = Table({
  name: "x_82900_docsera_workspace_change_set",
  label: "Docsera Workspace Change Set",
  display: "generation_key",
  accessibleFrom: "package_private",
  audit: true,
  createAccessControls: false,
  schema: {
    workspace: ReferenceColumn({ label: "Workspace", mandatory: true, referenceTable: "x_82900_docsera_workspace" }),
    generation_key: StringColumn({ label: "Generation key", mandatory: true, maxLength: 80 }),
    change_set_revision: IntegerColumn({ label: "Change set revision", mandatory: true, default: 0, min: 0 }),
    next_pending_sequence: IntegerColumn({ label: "Next pending sequence", mandatory: true, default: 1, min: 1 }),
    lifecycle_state: ChoiceColumn({ label: "Lifecycle state", mandatory: true, default: "active", choices: { active: "Active", superseded: "Superseded", staged: "Staged", retired: "Retired" } }),
    command_correlation_id: StringColumn({ label: "Command correlation ID", maxLength: 80 }),
    recovery_state: ChoiceColumn({ label: "Recovery state", mandatory: true, default: "none", choices: { none: "None", staged: "Staged", switched: "Switched", recovered: "Recovered" } }),
    finalized_on: DateTimeColumn({ label: "Finalized on" })
  },
  index: [{ name: "generation_key_unique", element: "generation_key", unique: true }]
});
