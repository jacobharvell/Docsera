import "@servicenow/sdk/global";
import { UiPage } from "@servicenow/sdk/core";
import docseraRuntimePage from "../../client/index.html";

UiPage({
  $id: Now.ID["docsera-sdk-runtime-page"],
  endpoint: "x_2300756_docsera_docsera_sdk_runtime.do",
  description: "Docsera SDK-native runtime baseline",
  category: "general",
  html: docseraRuntimePage,
  direct: true
});
