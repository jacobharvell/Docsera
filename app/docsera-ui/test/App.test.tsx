import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

test("renders the workspace shell baseline", () => {
  render(
    <App
      runtime={createRuntime()}
      serviceNowClient={createClient(async () => {
        throw new Error("Unexpected ping");
      })}
    />
  );

  expect(screen.getByRole("heading", { name: "API Guides", level: 1 })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Page tree", level: 2 })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Workspace overview", level: 2 })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Page outline", level: 2 })).toBeInTheDocument();
});

test("switches the selected demo page when a page tree item is chosen", () => {
  render(
    <App
      runtime={createRuntime()}
      serviceNowClient={createClient(async () => {
        throw new Error("Unexpected ping");
      })}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: /Runtime probe/i }));

  expect(screen.getByRole("heading", { name: "Runtime probe", level: 2 })).toBeInTheDocument();
  expect(screen.getByText(/The REST ping is a runtime and platform probe/i)).toBeInTheDocument();
});

test("keeps the workspace shell visible when the backend ping fails", async () => {
  render(
    <App
      runtime={createRuntime({ backendPingPath: "/api/x_82900_docsera/docsera_runtime/ping" })}
      serviceNowClient={createClient(async () => Promise.reject(new Error("HTTP 503")))}
    />
  );

  await waitFor(() => {
    expect(screen.getByText(/Backend ping failed: HTTP 503/i)).toBeInTheDocument();
  });

  expect(screen.getByRole("heading", { name: "API Guides", level: 1 })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Workspace overview", level: 2 })).toBeInTheDocument();
});
