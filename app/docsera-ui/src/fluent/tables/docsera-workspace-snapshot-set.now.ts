import "@servicenow/sdk/global";
import { ChoiceColumn, DateTimeColumn, IntegerColumn, ReferenceColumn, StringColumn, Table } from "@servicenow/sdk/core";

export const x_2300756_docsera_workspace_snapshot_set = Table({
  name: "x_2300756_docsera_workspace_snapshot_set",
  label: "Docsera Workspace Snapshot Set",
  display: "snapshot_key",
  accessibleFrom: "package_private",
  audit: true,
  createAccessControls: false,
  allowWebServiceAccess: false,
  schema: {
    workspace: ReferenceColumn({ label: "Workspace", mandatory: true, referenceTable: "x_2300756_docsera_workspace" }),
    snapshot_key: StringColumn({ label: "Snapshot key", mandatory: true, maxLength: 80, unique: true }),
    readiness_state: ChoiceColumn({ label: "Readiness state", mandatory: true, default: "staging", choices: { staging: "Staging", ready: "Ready", retired: "Retired" } }),
    command_correlation_id: StringColumn({ label: "Command correlation ID", maxLength: 80 }),
    command_kind: ChoiceColumn({ label: "Command kind", choices: { publish: "Publish", discard_all: "Discard all" } }),
    source_change_set: ReferenceColumn({ label: "Source change set", referenceTable: "x_2300756_docsera_workspace_change_set" }),
    source_change_set_revision: IntegerColumn({ label: "Source change set revision", min: 0 }),
    published_on: DateTimeColumn({ label: "Published on" })
  }
});
