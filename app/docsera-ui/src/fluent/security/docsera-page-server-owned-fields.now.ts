import "@servicenow/sdk/global";
import { Acl } from "@servicenow/sdk/core";

/**
 * These unconditional Deny-Unless ACLs stop every ACL-evaluated caller,
 * including admins. The later package-private scoped server adapter remains
 * the sole owner of writes and must enforce its own narrow capability checks.
 */
export const docseraPageDraftParentServerOwnedWrite = Acl({ $id: Now.ID["docsera_page_draft_parent_server_owned_write"], type: "record", table: "x_2300756_docsera_page", field: "draft_parent_page", operation: "write", decisionType: "deny", adminOverrides: false, script: "return false;", description: "Server-owned prospective hierarchy field." });
export const docseraPageDraftSiblingServerOwnedWrite = Acl({ $id: Now.ID["docsera_page_draft_sibling_server_owned_write"], type: "record", table: "x_2300756_docsera_page", field: "draft_sibling_order", operation: "write", decisionType: "deny", adminOverrides: false, script: "return false;", description: "Server-owned prospective hierarchy field." });
export const docseraPageDraftRemovedServerOwnedWrite = Acl({ $id: Now.ID["docsera_page_draft_removed_server_owned_write"], type: "record", table: "x_2300756_docsera_page", field: "draft_removed", operation: "write", decisionType: "deny", adminOverrides: false, script: "return false;", description: "Server-owned removal field." });
export const docseraPageLastDraftChangedOnServerOwnedWrite = Acl({ $id: Now.ID["docsera_page_last_draft_changed_on_server_owned_write"], type: "record", table: "x_2300756_docsera_page", field: "last_draft_changed_on", operation: "write", decisionType: "deny", adminOverrides: false, script: "return false;", description: "Server-owned attribution field." });
export const docseraPageLastDraftChangedByServerOwnedWrite = Acl({ $id: Now.ID["docsera_page_last_draft_changed_by_server_owned_write"], type: "record", table: "x_2300756_docsera_page", field: "last_draft_changed_by", operation: "write", decisionType: "deny", adminOverrides: false, script: "return false;", description: "Server-owned attribution field." });
