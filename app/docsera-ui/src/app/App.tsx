import { useEffect, useState } from "react";
import { demoWorkspace } from "../features/workspaces/demoWorkspace";
import type { DocseraRuntimeContext, PingResult, ServiceNowClient } from "../shared/types/docsera";

type AppProps = {
  runtime: DocseraRuntimeContext;
  serviceNowClient: ServiceNowClient;
};

type PingState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; payload: PingResult }
  | { status: "error"; message: string };

function statusTone(status: PingState["status"]): string {
  switch (status) {
    case "success":
      return "ok";
    case "error":
      return "error";
    case "loading":
      return "loading";
    default:
      return "idle";
  }
}

export function App({ runtime, serviceNowClient }: AppProps) {
  const [pingState, setPingState] = useState<PingState>(
    runtime.config.backendPingPath ? { status: "loading" } : { status: "idle" }
  );

  useEffect(() => {
    if (!runtime.config.backendPingPath) {
      return;
    }

    let canceled = false;

    serviceNowClient
      .ping()
      .then((payload) => {
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
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy">
          <p className="eyebrow">Docsera Runtime Baseline</p>
          <h1>Direct UI Page host, React and Vite source, explicit packaging boundary.</h1>
          <p className="lede">
            This is the first repo-managed runtime baseline for the standalone scoped Direct UI Page.
            It keeps the React entry thin, leaves `app/docsera-shell` historical, and isolates
            ServiceNow assumptions behind a small adaptor layer.
          </p>
        </div>
        <div className="hero-callout">
          <p className="callout-label">Preferred runtime</p>
          <p className="callout-value">Standalone scoped Direct UI Page</p>
          <p className="callout-meta">No UI Builder, macroponent, or Polaris shell dependency.</p>
        </div>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>Runtime probe</h2>
          <dl className="key-values">
            <div>
              <dt>Mount node</dt>
              <dd>{runtime.mountNodeId}</dd>
            </div>
            <div>
              <dt>Script asset</dt>
              <dd>{runtime.config.scriptPath ?? "Defined by the UI Script URL"}</dd>
            </div>
            <div>
              <dt>CSS asset</dt>
              <dd>{runtime.config.cssPath ?? "Attachment-backed CSS placeholder"}</dd>
            </div>
            <div>
              <dt>Backend ping</dt>
              <dd>{runtime.config.backendPingPath ?? "Not configured"}</dd>
            </div>
          </dl>
        </article>

        <article className="panel">
          <h2>Packaging intent</h2>
          <ul className="bullet-list">
            <li>Bundle the Vite build into one UI Script-ready JavaScript asset.</li>
            <li>Ship the extracted stylesheet as a same-origin ServiceNow attachment.</li>
            <li>Keep Direct UI Page HTML small and declarative.</li>
            <li>Keep final API auth and ACL enforcement outside this baseline.</li>
          </ul>
        </article>
      </section>

      <section className="grid">
        <article className="panel">
          <h2>ServiceNow adaptor status</h2>
          <div className={`status-card ${statusTone(pingState.status)}`}>
            {pingState.status === "idle" && "Backend ping not configured for this host."}
            {pingState.status === "loading" && "Calling the configured same-origin backend ping."}
            {pingState.status === "error" && `Backend ping failed: ${pingState.message}`}
            {pingState.status === "success" &&
              `Backend ping succeeded for ${pingState.payload.userName} at ${pingState.payload.timestamp}.`}
          </div>
          {pingState.status === "success" ? (
            <pre>{JSON.stringify(pingState.payload, null, 2)}</pre>
          ) : null}
        </article>

        <article className="panel">
          <h2>Demo content boundary</h2>
          <div className="workspace-card">
            <p className="workspace-label">Demo workspace</p>
            <h3>{demoWorkspace.title}</h3>
            <p>{demoWorkspace.summary}</p>
            <ol className="page-list">
              {demoWorkspace.pages.map((page) => (
                <li key={page.id}>
                  <strong>{page.title}</strong>
                  <span>{page.slug}</span>
                </li>
              ))}
            </ol>
          </div>
        </article>
      </section>
    </main>
  );
}
