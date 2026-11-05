import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { recordDocseraDiagnosticEvent } from "./diagnostics";
import { createServiceNowClient } from "./platform/servicenow/client";
import { resolveRuntimeContext } from "./platform/servicenow/runtime";

const DOCSERA_MOUNTED_ATTRIBUTE = "data-docsera-mounted";

export function mountDocseraApp(): void {
  recordDocseraDiagnosticEvent("bootstrap.mountDocseraApp.start", {
    locationHref: window.location.href,
    locationSearch: window.location.search,
    windowNameBeforeMount: window.name
  });
  const runtime = resolveRuntimeContext();
  const client = createServiceNowClient(runtime);
  const mountNode = runtime.mountNode;

  if (!mountNode) {
    throw new Error("Docsera runtime mount node was not found.");
  }

  if (mountNode.getAttribute(DOCSERA_MOUNTED_ATTRIBUTE) === "true") {
    recordDocseraDiagnosticEvent("bootstrap.mountDocseraApp.skip", {
      mountNodeId: runtime.mountNodeId,
      reason: "mount_node_already_marked"
    });
    return;
  }

  mountNode.setAttribute(DOCSERA_MOUNTED_ATTRIBUTE, "true");
  recordDocseraDiagnosticEvent("bootstrap.reactRoot.render", {
    mountNodeId: runtime.mountNodeId
  });

  ReactDOM.createRoot(mountNode).render(
    <React.StrictMode>
      <App runtime={runtime} serviceNowClient={client} />
    </React.StrictMode>
  );
}
