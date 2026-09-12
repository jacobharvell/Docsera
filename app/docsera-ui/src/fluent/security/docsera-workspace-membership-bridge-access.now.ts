import "@servicenow/sdk/global";
import { CrossScopePrivilege } from "@servicenow/sdk/core";

CrossScopePrivilege({
  $id: Now.ID["docsera-global-workspace-membership-bridge-execute"],
  operation: "execute",
  status: "allowed",
  targetName: "global.DocseraGlobalWorkspaceMembershipBridge",
  targetScope: "global",
  targetType: "sys_script_include"
});
