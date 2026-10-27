import "@servicenow/sdk/global";
import { IntegerColumn, Record, ReferenceColumn, Table } from "@servicenow/sdk/core";

// This fixture is intentionally not imported by app/docsera-ui. It models only
// the proposed replacement metadata and is built from this directory.
export const x_82900_docsera_rm_member = Table({
  name: "x_82900_docsera_rm_member",
  label: "Docsera Removal Member",
  display: "page",
  accessibleFrom: "package_private",
  audit: true,
  createAccessControls: false,
  allowWebServiceAccess: false,
  schema: {
    removal_batch: ReferenceColumn({
      label: "Removal batch",
      mandatory: true,
      referenceTable: "x_82900_docsera_workspace_removal_batch"
    }),
    page: ReferenceColumn({
      label: "Page identity",
      mandatory: true,
      referenceTable: "x_82900_docsera_page"
    }),
    first_pending_sequence: IntegerColumn({ label: "First pending sequence", mandatory: true, min: 1 })
  },
  index: [{ name: "removal_batch_page_unique", element: "removal_batch,page", unique: true }]
});

// Record is the SDK's documented generic metadata fallback. The platform
// sys_m2m table stores endpoints as sys_db_object references, so names are
// deliberately used only to test what the SDK can emit; this is not an
// install-ready registration claim.
export const removalMemberRegistration = Record({
  $id: Now.ID["cto-3b-removal-member-m2m"],
  table: "sys_m2m",
  data: {
    from_table: "x_82900_docsera_workspace_removal_batch",
    to_table: "x_82900_docsera_page",
    m2m_table: x_82900_docsera_rm_member
  }
});
