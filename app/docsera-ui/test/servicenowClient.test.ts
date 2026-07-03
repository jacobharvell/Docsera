import { afterEach, vi } from "vitest";
import { createServiceNowClient } from "../src/client/platform/servicenow/client";
import type { DocseraRuntimeContext, PingEnvelope } from "../src/client/shared/types/docsera";

const runtime: DocseraRuntimeContext = {
  mountNode: document.createElement("div"),
  mountNodeId: "docsera-root",
  config: {
    backendPingPath: "/api/x_82900_docsera/docsera_runtime/ping",
    cssPath: undefined,
    scriptPath: undefined
  }
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete (window as Window & { g_ck?: string }).g_ck;
  vi.restoreAllMocks();
});

function createPingEnvelope(): PingEnvelope {
  return {
    result: {
      authenticated: true,
      scope: "x_82900_docsera",
      status: "ok",
      timestamp: "2026-07-03 11:16:20",
      userName: "admin",
      userSysId: "6816f79cc0a8016401c5a33be04be441"
    }
  };
}

test("ping sends the ServiceNow user token when one is available", async () => {
  (window as Window & { g_ck?: string }).g_ck = "session-token";
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => createPingEnvelope()
  });
  globalThis.fetch = fetchMock as typeof fetch;

  const result = await createServiceNowClient(runtime).ping();
  const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];

  expect(path).toBe("/api/x_82900_docsera/docsera_runtime/ping");
  expect(init.credentials).toBe("same-origin");
  expect(init.headers).toEqual({
    Accept: "application/json",
    "X-UserToken": "session-token"
  });
  expect(result).toMatchObject({
    authenticated: true,
    scope: "x_82900_docsera",
    status: "ok"
  });
});

test("ping still works without a ServiceNow user token in the page context", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => createPingEnvelope()
  });
  globalThis.fetch = fetchMock as typeof fetch;

  await createServiceNowClient(runtime).ping();
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];

  expect(init.headers).toEqual({
    Accept: "application/json"
  });
});
