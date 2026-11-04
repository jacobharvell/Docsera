import "@servicenow/sdk/global";
import { BooleanColumn, ChoiceColumn, DateTimeColumn, IntegerColumn, ReferenceColumn, StringColumn, Table } from "@servicenow/sdk/core";

export const x_2300756_docsera_page = Table({
  name: "x_2300756_docsera_page",
  label: "Docsera Page",
  display: "draft_title",
  actions: ["read", "create"],
  allowWebServiceAccess: true,
  audit: true,
  schema: {
    workspace: ReferenceColumn({
      label: "Workspace",
      mandatory: true,
      referenceTable: "x_2300756_docsera_workspace"
    }),
    parent_page: ReferenceColumn({
      label: "Parent page",
      referenceTable: "x_2300756_docsera_page"
    }),
    sibling_order: StringColumn({
      label: "Sibling order",
      mandatory: true,
      maxLength: 16
    }),
    draft_parent_page: ReferenceColumn({
      label: "Draft parent page",
      referenceTable: "x_2300756_docsera_page"
    }),
    draft_sibling_order: StringColumn({
      label: "Draft sibling order",
      maxLength: 16
    }),
    draft_removed: BooleanColumn({
      label: "Draft removed",
      mandatory: true,
      default: false
    }),
    last_draft_changed_on: DateTimeColumn({
      label: "Last draft changed on"
    }),
    last_draft_changed_by: ReferenceColumn({
      label: "Last draft changed by",
      referenceTable: "sys_user"
    }),
    draft_title: StringColumn({
      label: "Draft title",
      mandatory: true,
      maxLength: 160
    }),
    draft_slug: StringColumn({
      label: "Draft slug",
      mandatory: true,
      maxLength: 160
    }),
    draft_slug_normalized: StringColumn({
      label: "Draft slug normalized",
      mandatory: true,
      maxLength: 160
    }),
    draft_content_json: StringColumn({
      label: "Draft content JSON",
      maxLength: 262144
    }),
    draft_revision: IntegerColumn({
      label: "Draft revision",
      mandatory: true,
      default: 0,
      min: 0
    }),
    draft_body_text: StringColumn({
      label: "Draft body text",
      maxLength: 4000
    }),
    published_title: StringColumn({
      label: "Published title",
      maxLength: 160
    }),
    published_slug: StringColumn({
      label: "Published slug",
      maxLength: 160
    }),
    published_slug_normalized: StringColumn({
      label: "Published slug normalized",
      maxLength: 160
    }),
    published_content_json: StringColumn({
      label: "Published content JSON",
      maxLength: 262144
    }),
    published_body_text: StringColumn({
      label: "Published body text",
      maxLength: 4000
    }),
    published_at: DateTimeColumn({
      label: "Published at"
    }),
    published_by: ReferenceColumn({
      label: "Published by",
      referenceTable: "sys_user"
    }),
    publication_state: ChoiceColumn({
      label: "Publication state",
      mandatory: true,
      default: "draft",
      choices: {
        draft: "Draft",
        published: "Published",
        published_with_unpublished_changes: "Published with unpublished changes"
      }
    }),
    active: BooleanColumn({
      label: "Active",
      mandatory: true,
      default: true
    })
  }
});
