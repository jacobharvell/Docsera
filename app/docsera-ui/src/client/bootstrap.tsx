import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { EditorRuntimeSpikeOutlet } from "./editor/spikes/EditorRuntimeSpikeOutlet";
import { createServiceNowClient } from "./platform/servicenow/client";
import { resolveRuntimeContext } from "./platform/servicenow/runtime";

const DOCSERA_MOUNTED_ATTRIBUTE = "data-docsera-mounted";

export function mountDocseraApp(): void {
  const runtime = resolveRuntimeContext();
  const client = createServiceNowClient(runtime);
  const mountNode = runtime.mountNode;

  if (!mountNode) {
    throw new Error("Docsera runtime mount node was not found.");
  }

  if (mountNode.getAttribute(DOCSERA_MOUNTED_ATTRIBUTE) === "true") {
    return;
  }

  mountNode.setAttribute(DOCSERA_MOUNTED_ATTRIBUTE, "true");

  ReactDOM.createRoot(mountNode).render(
    <React.StrictMode>
      <App runtime={runtime} serviceNowClient={client} />
      {new URLSearchParams(window.location.search).get("docsera_editor_spike") === "1" ? (
        <EditorRuntimeSpikeOutlet />
      ) : null}
    </React.StrictMode>
  );
}
