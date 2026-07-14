import "@servicenow/sdk/global";
import { ScheduledScript } from "@servicenow/sdk/core";

ScheduledScript({
  $id: Now.ID["docsera-page-edit-lock-cleanup"],
  name: "Docsera Page Edit Lock Cleanup",
  active: true,
  advanced: true,
  frequency: "periodically",
  executionInterval: Duration({ minutes: 1 }),
  script: Now.include("../../server/scheduled-scripts/docsera-page-edit-lock-cleanup.js")
});
