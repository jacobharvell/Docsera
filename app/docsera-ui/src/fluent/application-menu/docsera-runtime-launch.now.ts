import "@servicenow/sdk/global";
import { ApplicationMenu, Record } from "@servicenow/sdk/core";

export const docseraApplicationMenu = ApplicationMenu({
  $id: Now.ID["docsera-application-menu"],
  title: "Docsera",
  hint: "Open Docsera",
  description: "Docsera standalone documentation workspace runtime.",
  active: true,
  order: 100
});

Record({
  $id: Now.ID["docsera-my-workspaces-module"],
  table: "sys_app_module",
  data: {
    title: "My Workspaces",
    application: docseraApplicationMenu,
    link_type: "DIRECT",
    query: "x_82900_docsera_docsera_sdk_runtime.do",
    hint: "Open Docsera My Workspaces",
    active: true,
    order: 100
  }
});
