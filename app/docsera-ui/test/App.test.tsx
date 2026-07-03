import { render, screen, waitFor } from "@testing-library/react";
import { App } from "../src/client/app/App";
import type {
  DocseraRuntimeContext,
  PingResult,
  ServiceNowClient
} from "../src/client/shared/types/docsera";

function createRuntime(overrides: Partial<DocseraRuntimeContext["config"]> = {}): DocseraRuntimeContext {
  const mountNode = document.createElement("div");

  return {
    mountNode,
    mountNodeId: "docsera-root",
    config: {
      backendPingPath: undefined,
      cssPath: undefined,
      scriptPath: undefined,
      ...overrides
    }
  };
}

function createClient(pingImpl: () => Promise<PingResult>): ServiceNowClient {
  return {
    ping: pingImpl
  };
}

test("renders the runtime baseline heading", () => {
  render(<App runtime={createRuntime()} serviceNowClient={createClient(async () => Promise.reject())} />);

  expect(screen.getByText(/Docsera SDK Runtime Baseline/i)).toBeInTheDocument();
  expect(screen.getByText(/Direct UI Page host, React source, SDK-managed runtime pipeline/i)).toBeInTheDocument();
});

test("shows successful backend ping payloads when configured", async () => {
  render(
    <App
      runtime={createRuntime({ backendPingPath: "/api/x_82900_docsera/docsera_runtime/ping" })}
      serviceNowClient={createClient(async () => ({
        authenticated: true,
        scope: "x_82900_docsera",
        status: "ok",
        timestamp: "2026-07-02 16:00:00",
        userName: "admin",
        userSysId: "6816f79cc0a8016401c5a33be04be441"
      }))}
    />
  );

  await waitFor(() => {
    expect(screen.getByText(/Backend ping succeeded for admin/i)).toBeInTheDocument();
  });

  expect(screen.getByText(/"authenticated": true/)).toBeInTheDocument();
});
