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
          <p className="eyebrow">Docsera SDK Runtime Baseline</p>
          <h1>Direct UI Page host, React source, SDK-managed runtime pipeline.</h1>
          <p className="lede">
            This baseline is built through ServiceNow SDK and Fluent. The UI Page host, static
            frontend assets, and same-origin REST proof all live in source control while
            `app/docsera-shell` stays historical and ServiceNow assumptions remain behind a small
            adaptor layer.
          </p>
        </div>
        <div className="hero-callout">
          <p className="callout-label">Preferred runtime</p>
          <p className="callout-value">SDK-native scoped Direct UI Page</p>
          <p className="callout-meta">No UI Builder, macroponent, or manual record copy/paste.</p>
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
              <dd>{runtime.config.scriptPath ?? "SDK-managed static JavaScript asset"}</dd>
            </div>
            <div>
              <dt>CSS asset</dt>
              <dd>{runtime.config.cssPath ?? "SDK-managed static stylesheet asset"}</dd>
            </div>
            <div>
              <dt>Backend ping</dt>
              <dd>{runtime.config.backendPingPath ?? "Not configured"}</dd>
            </div>
          </dl>
        </article>

        <article className="panel">
          <h2>Runtime pipeline</h2>
          <ul className="bullet-list">
            <li>Define the Direct UI Page host with Fluent `UiPage` metadata.</li>
            <li>Bundle React, CSS, and static assets through `now-sdk build`.</li>
            <li>Probe same-origin ServiceNow access through a Fluent `RestApi` ping.</li>
            <li>Keep the legacy manual packaging path repo-local and non-preferred.</li>
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
