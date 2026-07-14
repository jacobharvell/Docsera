import "@servicenow/sdk/global";
import { DateTimeColumn, ReferenceColumn, StringColumn, Table } from "@servicenow/sdk/core";

export const x_82900_docsera_page_edit_lock = Table({
  name: "x_82900_docsera_page_edit_lock",
  label: "Docsera Page Edit Lock",
  display: "page_key",
  accessibleFrom: "package_private",
  audit: true,
  createAccessControls: false,
  schema: {
    page_key: StringColumn({
      label: "Page key",
      mandatory: true,
      maxLength: 40
    }),
    page: ReferenceColumn({
      label: "Page",
      mandatory: true,
      referenceTable: "x_82900_docsera_page"
    }),
    workspace: ReferenceColumn({
      label: "Workspace",
      mandatory: true,
      referenceTable: "x_82900_docsera_workspace"
    }),
    holder_user: ReferenceColumn({
      label: "Holder user",
      mandatory: true,
      referenceTable: "sys_user"
    }),
    verifier_digest: StringColumn({
      label: "Verifier digest",
      mandatory: true,
      maxLength: 64
    }),
    acquired_on: DateTimeColumn({
      label: "Acquired on",
      mandatory: true
    }),
    last_seen_on: DateTimeColumn({
      label: "Last seen on",
      mandatory: true
    })
  },
  index: [
    {
      name: "page_key_unique",
      element: "page_key",
      unique: true
    },
    {
      name: "last_seen_on_idx",
      element: "last_seen_on",
      unique: false
    }
  ]
});
