import "@servicenow/sdk/global";
import { BooleanColumn, DateTimeColumn, ReferenceColumn, StringColumn, Table } from "@servicenow/sdk/core";

export const x_2300756_docsera_workspace_page_snapshot = Table({
  name: "x_2300756_docsera_workspace_page_snapshot",
  label: "Docsera Workspace Page Snapshot",
  display: "title",
  accessibleFrom: "package_private",
  audit: true,
  createAccessControls: false,
  allowWebServiceAccess: false,
  schema: {
    snapshot_set: ReferenceColumn({ label: "Snapshot set", mandatory: true, referenceTable: "x_2300756_docsera_workspace_snapshot_set" }),
    page: ReferenceColumn({ label: "Page identity", mandatory: true, referenceTable: "x_2300756_docsera_page" }),
    snapshot_page_key: StringColumn({ label: "Snapshot page key", mandatory: true, maxLength: 80, unique: true }),
    parent_page: ReferenceColumn({ label: "Published parent identity", referenceTable: "x_2300756_docsera_page" }),
    sibling_order: StringColumn({ label: "Published sibling order", mandatory: true, maxLength: 16 }),
    title: StringColumn({ label: "Title", mandatory: true, maxLength: 160 }),
    slug: StringColumn({ label: "Slug", mandatory: true, maxLength: 160 }),
    slug_normalized: StringColumn({ label: "Normalized slug", mandatory: true, maxLength: 160 }),
    content_json: StringColumn({ label: "Canonical document JSON", mandatory: true, maxLength: 262144 }),
    body_text: StringColumn({ label: "Body text", maxLength: 4000 }),
    active: BooleanColumn({ label: "Active", mandatory: true, default: true }),
    published_on: DateTimeColumn({ label: "Published on" }),
    published_by: ReferenceColumn({ label: "Published by", referenceTable: "sys_user" })
  }
});
