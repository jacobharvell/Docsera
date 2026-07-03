import type { DemoWorkspace, RuntimeProbeState } from "../../shared/types/docsera";

type WorkspaceHeaderProps = {
  workspace: DemoWorkspace;
  selectedPageTitle: string;
  pingState: RuntimeProbeState;
};

function getPingLabel(pingState: RuntimeProbeState): string {
  switch (pingState.status) {
    case "success":
      return "Ping healthy";
    case "error":
      return "Ping failed";
    case "loading":
      return "Checking adapter";
    default:
      return "Ping idle";
  }
}

export function WorkspaceHeader({ workspace, selectedPageTitle, pingState }: WorkspaceHeaderProps) {
  return (
    <header className="docsera-shell__header">
      <div className="docsera-shell__brand">
        <div className="docsera-shell__brand-mark" aria-hidden="true">
          D
        </div>
        <div className="docsera-shell__brand-copy">
          <p className="docsera-shell__eyebrow">Docsera</p>
          <h1 className="docsera-shell__header-title">{workspace.title}</h1>
        </div>
      </div>

      <div className="docsera-shell__header-summary">
        <p className="docsera-shell__header-kicker">{workspace.subtitle}</p>
        <p className="docsera-shell__header-copy">{workspace.summary}</p>
      </div>

      <div className="docsera-shell__header-meta" aria-label="Workspace status">
        <span className="docsera-shell__chip docsera-shell__chip--solid">{workspace.status}</span>
        <span className="docsera-shell__chip">{workspace.routeLabel}</span>
        <span className={`docsera-shell__chip docsera-shell__chip--${pingState.status}`} aria-live="polite">
          {getPingLabel(pingState)}
        </span>
        <span className="docsera-shell__header-selected">Selected: {selectedPageTitle}</span>
      </div>
    </header>
  );
}

