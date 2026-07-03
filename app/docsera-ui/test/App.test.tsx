import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../src/client/app/App";
import type { DocseraRuntimeContext, PingResult, ServiceNowClient } from "../src/client/shared/types/docsera";

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

test("renders the prototype-aligned shell with header identity, navigation, main content, and toc", () => {
  render(
    <App
      runtime={createRuntime()}
      serviceNowClient={createClient(async () => {
        throw new Error("Unexpected ping");
      })}
    />
  );

  expect(screen.getByRole("button", { name: "Workspace switcher: OpenDocs Main" })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Page breadcrumbs" })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Page tree" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Overview", level: 1 })).toBeInTheDocument();
  expect(screen.getByRole("complementary", { name: "Page outline" })).toBeInTheDocument();
  expect(screen.getByRole("navigation", { name: "Page breadcrumbs" })).not.toHaveTextContent("OpenDocs Main");
  expect(screen.queryByText(/Install the app, open the workspace/i)).not.toBeInTheDocument();
});

test("selecting a page updates the main pane and breadcrumb path", () => {
  render(
    <App
      runtime={createRuntime()}
      serviceNowClient={createClient(async () => {
        throw new Error("Unexpected ping");
      })}
    />
  );

  fireEvent.click(screen.getByRole("button", { name: /Certification Delivery Model/i }));

  const breadcrumbs = screen.getByRole("navigation", { name: "Page breadcrumbs" });

  expect(screen.getByRole("heading", { name: "Certification Delivery Model", level: 1 })).toBeInTheDocument();
  expect(breadcrumbs).toHaveTextContent("AI Fundamentals eCourse & Certification");
  expect(breadcrumbs).toHaveTextContent("Certification Delivery Model");
  expect(screen.getByRole("link", { name: "Curriculum map" })).toBeInTheDocument();
});

test("keeps the workspace shell visible when the backend ping fails", async () => {
  render(
    <App
      runtime={createRuntime({ backendPingPath: "/api/x_82900_docsera/docsera_runtime/ping" })}
      serviceNowClient={createClient(async () => Promise.reject(new Error("HTTP 503")))}
    />
  );

  await waitFor(() => {
    expect(screen.getByText(/Runtime probe unavailable: HTTP 503/i)).toBeInTheDocument();
  });

  expect(screen.getByRole("button", { name: "Workspace switcher: OpenDocs Main" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Overview", level: 1 })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /AI Fundamentals eCourse & Certification/i })).toBeInTheDocument();
  expect(screen.getByText("Developer status").closest("details")).not.toHaveAttribute("open");
});
