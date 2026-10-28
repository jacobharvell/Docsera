import "@servicenow/sdk/global";
import { UiPage } from "@servicenow/sdk/core";
import docseraFriendlyUrlProof from "../../client/docsera-friendly-url-proof.html";

UiPage({
  $id: Now.ID["docsera-friendly-url-proof-page"],
  endpoint: "docsera.do",
  description: "Docsera production friendly URL host for the installed scoped runtime.",
  category: "general",
  html: docseraFriendlyUrlProof,
  direct: true
});
