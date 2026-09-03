import "@servicenow/sdk/global";
import { CrossScopePrivilege } from "@servicenow/sdk/core";

CrossScopePrivilege({
  $id: Now.ID["docsera-workspace-provision-request-read"],
  operation: "read",
  status: "allowed",
  targetName: "x_82900_docsera_workspace_provision_request",
  targetScope: "x_82900_docsera",
  targetType: "sys_db_object"
});

CrossScopePrivilege({
  $id: Now.ID["docsera-workspace-provision-request-write"],
  operation: "write",
  status: "allowed",
  targetName: "x_82900_docsera_workspace_provision_request",
  targetScope: "x_82900_docsera",
  targetType: "sys_db_object"
});

CrossScopePrivilege({
  $id: Now.ID["docsera-workspace-read"],
  operation: "read",
  status: "allowed",
  targetName: "x_82900_docsera_workspace",
  targetScope: "x_82900_docsera",
  targetType: "sys_db_object"
});

CrossScopePrivilege({
  $id: Now.ID["docsera-workspace-create"],
  operation: "create",
  status: "allowed",
  targetName: "x_82900_docsera_workspace",
  targetScope: "x_82900_docsera",
  targetType: "sys_db_object"
});

CrossScopePrivilege({
  $id: Now.ID["docsera-workspace-delete"],
  operation: "delete",
  status: "allowed",
  targetName: "x_82900_docsera_workspace",
  targetScope: "x_82900_docsera",
  targetType: "sys_db_object"
});

CrossScopePrivilege({
  $id: Now.ID["docsera-workspace-icon-asset-read"],
  operation: "read",
  status: "allowed",
  targetName: "x_82900_docsera_workspace_icon_asset",
  targetScope: "x_82900_docsera",
  targetType: "sys_db_object"
});

CrossScopePrivilege({
  $id: Now.ID["docsera-workspace-icon-asset-write"],
  operation: "write",
  status: "allowed",
  targetName: "x_82900_docsera_workspace_icon_asset",
  targetScope: "x_82900_docsera",
  targetType: "sys_db_object"
});
