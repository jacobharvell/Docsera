import "@servicenow/sdk/global";
import { Role } from "@servicenow/sdk/core";

export const docseraEditor = Role({
  name: "x_2300756_docsera.editor",
  description: "Docsera workspace editor role."
});

export const docseraWorkspaceAdmin = Role({
  name: "x_2300756_docsera.workspace_admin",
  description: "Docsera workspace admin role.",
  containsRoles: [docseraEditor]
});

export const docseraAdmin = Role({
  name: "x_2300756_docsera.admin",
  description: "Docsera application administrator role.",
  containsRoles: [docseraWorkspaceAdmin, docseraEditor],
  scopedAdmin: true
});
