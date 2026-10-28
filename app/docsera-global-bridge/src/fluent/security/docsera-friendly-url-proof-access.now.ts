import "@servicenow/sdk/global";
import { Acl } from "@servicenow/sdk/core";

Acl({
  $id: Now.ID["docsera-friendly-url-proof-page-read"],
  type: "ui_page",
  name: "docsera",
  operation: "read",
  decisionType: "allow",
  adminOverrides: true,
  script: "answer = gs.isLoggedIn();",
  description: "Allow authenticated ServiceNow users to read the Docsera Global friendly URL host."
});
