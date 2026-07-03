import { useEffect, useState } from "react";
import { demoWorkspace } from "../features/workspaces/demoWorkspace";
import { WorkspaceShell } from "../features/workspaces/WorkspaceShell";
import type {
  DocseraRuntimeContext,
  PingResult,
  RuntimeProbeState,
  ServiceNowClient
} from "../shared/types/docsera";

type AppProps = {
  runtime: DocseraRuntimeContext;
  serviceNowClient: ServiceNowClient;
};

function createInitialPingState(runtime: DocseraRuntimeContext): RuntimeProbeState {
  return runtime.config.backendPingPath ? { status: "loading" } : { status: "idle" };
}

export function App({ runtime, serviceNowClient }: AppProps) {
  const [selectedPageId, setSelectedPageId] = useState(demoWorkspace.defaultPageId);
  const [pingState, setPingState] = useState<RuntimeProbeState>(() => createInitialPingState(runtime));

  useEffect(() => {
    if (!runtime.config.backendPingPath) {
      setPingState({ status: "idle" });
      return;
    }

    let canceled = false;

    serviceNowClient
      .ping()
      .then((payload: PingResult) => {
        if (!canceled) {
          setPingState({ status: "success", payload });
        }
      })
      .catch((error: unknown) => {
        if (!canceled) {
          const message = error instanceof Error ? error.message : "Unknown ping failure";
          setPingState({ status: "error", message });
        }
      });

    return () => {
      canceled = true;
    };
  }, [runtime.config.backendPingPath, serviceNowClient]);

  return (
    <div className="app-shell">
      <WorkspaceShell
        runtime={runtime}
        workspace={demoWorkspace}
        selectedPageId={selectedPageId}
        onSelectPage={setSelectedPageId}
        pingState={pingState}
      />
    </div>
  );
}
