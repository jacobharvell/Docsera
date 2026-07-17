import "@servicenow/sdk/global";
import { ScheduledScript } from "@servicenow/sdk/core";

ScheduledScript({
  $id: Now.ID["docsera-workspace-edit-lease-cleanup"],
  name: "Docsera Workspace Edit Lease Cleanup",
  active: true,
  advanced: true,
  frequency: "periodically",
  executionInterval: Duration({ minutes: 1 }),
  script: Now.include("../../server/scheduled-scripts/docsera-workspace-edit-lease-cleanup.js")
});
