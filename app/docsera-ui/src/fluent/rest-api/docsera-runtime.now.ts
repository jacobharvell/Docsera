import "@servicenow/sdk/global";
import { RestApi } from "@servicenow/sdk/core";
import { process } from "../../server/api/docsera-runtime-ping";

RestApi({
  $id: Now.ID["docsera-runtime-api"],
  name: "Docsera Runtime API",
  serviceId: "docsera_runtime",
  consumes: "application/json",
  produces: "application/json",
  shortDescription: "Baseline same-origin endpoints for the SDK-native Docsera runtime.",
  routes: [
    {
      $id: Now.ID["docsera-runtime-ping-get"],
      name: "ping",
      path: "/ping",
      method: "GET",
      produces: "application/json",
      shortDescription: "Return basic session and scope data for runtime verification.",
      script: process
    }
  ]
});
