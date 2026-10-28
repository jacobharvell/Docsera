import "@servicenow/sdk/global";
import { ScheduledScript } from "@servicenow/sdk/core";

ScheduledScript({
  $id: Now.ID["docsera-workspace-icon-cleanup"],
  name: "Docsera Abandoned Workspace Icon Cleanup",
  active: true,
  advanced: true,
  frequency: "daily",
  executionTime: { hours: 2, minutes: 17, seconds: 0 },
  script: Now.include("../../server/scheduled-scripts/docsera-workspace-icon-cleanup.js")
});
