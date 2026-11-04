import "@servicenow/sdk/global";
import { ChoiceColumn, DateTimeColumn, IntegerColumn, ReferenceColumn, StringColumn, Table } from "@servicenow/sdk/core";

export const x_2300756_docsera_workspace_mutation_claim = Table({
  name: "x_2300756_docsera_workspace_mutation_claim",
  label: "Docsera Workspace Mutation Claim",
  display: "generation_key",
  accessibleFrom: "package_private",
  audit: true,
  createAccessControls: false,
  allowWebServiceAccess: false,
  schema: {
    workspace: ReferenceColumn({ label: "Workspace", mandatory: true, referenceTable: "x_2300756_docsera_workspace" }),
    change_set: ReferenceColumn({ label: "Change set", mandatory: true, referenceTable: "x_2300756_docsera_workspace_change_set" }),
    generation_key: StringColumn({ label: "Generation key", mandatory: true, maxLength: 80, unique: true }),
    mutation_key: StringColumn({ label: "Mutation key", mandatory: true, maxLength: 64 }),
    mutation_kind: ChoiceColumn({
      label: "Mutation kind",
      mandatory: true,
      choices: { body: "Body", create: "Create", delete: "Delete", move: "Move", publish: "Publish", settings: "Settings" }
    }),
    mutation_state: ChoiceColumn({
      label: "Mutation state",
      mandatory: true,
      default: "claimed",
      choices: { applied: "Applied", claimed: "Claimed", finalized: "Finalized", rolled_back: "Rolled back" }
    }),
    claim_owner_key: StringColumn({ label: "Claim owner key", mandatory: true, maxLength: 80 }),
    owner_expires_on: DateTimeColumn({ label: "Owner expires on", mandatory: true }),
    execution_phase: ChoiceColumn({
      label: "Execution phase",
      mandatory: true,
      default: "claimed",
      choices: {
        claimed: "Claimed",
        page_persisted: "Page persisted",
        entry_persisted: "Entry persisted",
        removal_persisted: "Removal persisted",
        change_set_advancing: "Change set advancing",
        change_set_persisted: "Change set persisted",
        result_persisted: "Result persisted",
        finalized: "Finalized"
      }
    }),
    mutation_payload_json: StringColumn({ label: "Mutation payload JSON", mandatory: true, maxLength: 262144 }),
    mutation_result_json: StringColumn({ label: "Mutation result JSON", maxLength: 262144 }),
    result_change_set: ReferenceColumn({ label: "Result change set", referenceTable: "x_2300756_docsera_workspace_change_set" }),
    result_change_set_revision: IntegerColumn({ label: "Result change set revision", min: 0 }),
    target_page_sys_id: ReferenceColumn({ label: "Target page identity", referenceTable: "x_2300756_docsera_page" }),
    target_next_page_sys_id: ReferenceColumn({ label: "Target next page identity", referenceTable: "x_2300756_docsera_page" }),
    target_removal_batch_key: StringColumn({ label: "Target removal batch key", maxLength: 80 }),
    error_message: StringColumn({ label: "Error message", maxLength: 4000 }),
    claimed_on: DateTimeColumn({ label: "Claimed on", mandatory: true }),
    applied_on: DateTimeColumn({ label: "Applied on" }),
    finalized_on: DateTimeColumn({ label: "Finalized on" })
  }
});
