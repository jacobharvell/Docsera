import type { DemoPage, DemoWorkspace, DocseraRuntimeContext, RuntimeProbeState } from "../../shared/types/docsera";

type WorkspaceStatusRailProps = {
  workspace: DemoWorkspace;
  page: DemoPage;
  runtime: DocseraRuntimeContext;
  pingState: RuntimeProbeState;
};

function renderPingMessage(pingState: RuntimeProbeState): string {
  switch (pingState.status) {
    case "success":
      return `Connected as ${pingState.payload.userName} in ${pingState.payload.scope}.`;
    case "error":
      return `Backend ping failed: ${pingState.message}`;
    case "loading":
      return "Checking the same-origin runtime probe.";
    default:
      return "No backend ping path was configured for this runtime.";
  }
}

export function WorkspaceStatusRail({ workspace, page, runtime, pingState }: WorkspaceStatusRailProps) {
  return (
    <aside className="docsera-shell__rail" aria-label="Page context and runtime status">
      <section className="docsera-shell__panel docsera-shell__panel--rail">
        <p className="docsera-shell__eyebrow">Table of contents</p>
        <h2 className="docsera-shell__section-title">Page outline</h2>
        <p className="docsera-shell__section-copy">
          {page.title} keeps its own outline here without taking over the workspace.
        </p>

        {page.sections.length > 0 ? (
          <ol className="docsera-shell__toc-list">
            {page.sections.map((section) => (
              <li key={section.id} className="docsera-shell__toc-item">
                <a className="docsera-shell__toc-link" href={`#${section.id}`}>
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        ) : (
          <p className="docsera-shell__rail-copy">This demo page does not define any sections yet.</p>
        )}
      </section>

      <section className="docsera-shell__panel docsera-shell__panel--rail">
        <p className="docsera-shell__eyebrow">Runtime probe</p>
        <h2 className="docsera-shell__section-title">SDK delivery</h2>
        <p className="docsera-shell__section-copy">
          The host stays SDK-managed, and the REST ping only verifies the platform boundary.
        </p>

        <div className="docsera-shell__stack">
          <div>
            <div className="docsera-shell__field-label">Mount node</div>
            <div className="docsera-shell__value">{runtime.mountNodeId}</div>
          </div>
          <div>
            <div className="docsera-shell__field-label">Script asset</div>
            <div className="docsera-shell__value">{runtime.config.scriptPath ?? "SDK-managed bundle"}</div>
          </div>
          <div>
            <div className="docsera-shell__field-label">CSS asset</div>
            <div className="docsera-shell__value">{runtime.config.cssPath ?? "SDK-managed stylesheet"}</div>
          </div>
          <div>
            <div className="docsera-shell__field-label">Ping endpoint</div>
            <div className="docsera-shell__value">{runtime.config.backendPingPath ?? "Not configured"}</div>
          </div>
        </div>

        <div className={`docsera-shell__runtime-status docsera-shell__runtime-status--${pingState.status}`}>
          {renderPingMessage(pingState)}
        </div>
      </section>

      <section className="docsera-shell__panel docsera-shell__panel--rail">
        <p className="docsera-shell__eyebrow">Boundary</p>
        <h2 className="docsera-shell__section-title">Out of scope</h2>
        <p className="docsera-shell__rail-copy">
          Live persistence, page CRUD, editor integration, publishing, and permissions stay in later tasks.
        </p>
        <div className="docsera-shell__stack">
          <span className="docsera-shell__chip">Demo data only</span>
          <span className="docsera-shell__chip">No CRUD</span>
          <span className="docsera-shell__chip">No editor</span>
          <span className="docsera-shell__chip">{workspace.status}</span>
        </div>
      </section>
    </aside>
  );
}
