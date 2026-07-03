import type { DocseraRuntimeContext, RuntimeProbeState } from "../../shared/types/docsera";

type WorkspaceDevStatusProps = {
  runtime: DocseraRuntimeContext;
  pingState: RuntimeProbeState;
};

function getPingSummary(pingState: RuntimeProbeState): string {
  switch (pingState.status) {
    case "success":
      return `Connected as ${pingState.payload.userName}.`;
    case "error":
      return `Runtime probe unavailable: ${pingState.message}.`;
    case "loading":
      return "Checking runtime probe.";
    default:
      return "Runtime probe not configured.";
  }
}

export function WorkspaceDevStatus({ runtime, pingState }: WorkspaceDevStatusProps) {
  return (
    <details className="docsera-dev-status">
      <summary className="docsera-dev-status__summary">
        <span>Developer status</span>
        <span className={`docsera-dev-status__badge docsera-dev-status__badge--${pingState.status}`}>
          {pingState.status}
        </span>
      </summary>
      <div className="docsera-dev-status__body">
        <p className="docsera-dev-status__copy">{getPingSummary(pingState)}</p>
        <dl className="docsera-dev-status__list">
          <div>
            <dt>Mount node</dt>
            <dd>{runtime.mountNodeId}</dd>
          </div>
          <div>
            <dt>Ping endpoint</dt>
            <dd>{runtime.config.backendPingPath ?? "Not configured"}</dd>
          </div>
          <div>
            <dt>Script asset</dt>
            <dd>{runtime.config.scriptPath ?? "SDK-managed bundle"}</dd>
          </div>
          <div>
            <dt>CSS asset</dt>
            <dd>{runtime.config.cssPath ?? "SDK-managed stylesheet"}</dd>
          </div>
        </dl>
      </div>
    </details>
  );
}
