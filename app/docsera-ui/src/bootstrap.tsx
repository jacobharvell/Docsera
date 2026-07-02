import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./app/App";
import { createServiceNowClient } from "./platform/servicenow/client";
import { resolveRuntimeContext } from "./platform/servicenow/runtime";

export function mountDocseraApp(): void {
  const runtime = resolveRuntimeContext();
  const client = createServiceNowClient(runtime);
  const mountNode = runtime.mountNode;

  if (!mountNode) {
    throw new Error("Docsera runtime mount node was not found.");
  }

  ReactDOM.createRoot(mountNode).render(
    <React.StrictMode>
      <App runtime={runtime} serviceNowClient={client} />
    </React.StrictMode>
  );
}
