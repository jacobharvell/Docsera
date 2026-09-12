import "@servicenow/sdk/global";
import { ScriptInclude } from "@servicenow/sdk/core";

ScriptInclude({
  $id: Now.ID["docsera-global-workspace-provisioning-bridge"],
  name: "DocseraGlobalWorkspaceProvisioningBridge",
  apiName: "global.DocseraGlobalWorkspaceProvisioningBridge",
  active: true,
  accessibleFrom: "package_private",
  description: "Global worker that provisions Docsera workspace groups from queued scoped requests.",
  script: Now.include("../../server/script-includes/docsera-global-workspace-provisioning-bridge.js")
});

ScriptInclude({
  $id: Now.ID["docsera-global-workspace-membership-bridge"],
  name: "DocseraGlobalWorkspaceMembershipBridge",
  apiName: "global.DocseraGlobalWorkspaceMembershipBridge",
  active: true,
  accessibleFrom: "public",
  callerAccess: "restriction",
  description: "Restricted global bridge for Docsera workspace Admin and Editor native group membership mutations.",
  script: Now.include("../../server/script-includes/docsera-global-workspace-membership-bridge.js")
});
