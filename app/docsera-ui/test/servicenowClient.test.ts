import { afterEach, vi } from "vitest";
import { createServiceNowClient } from "../src/client/platform/servicenow/client";
import type { DocseraRuntimeContext, PingEnvelope, WorkspaceCreateResult } from "../src/client/shared/types/docsera";

const runtime: DocseraRuntimeContext = {
  mountNode: document.createElement("div"),
  mountNodeId: "docsera-root",
  config: {
    backendPingPath: "/api/x_82900_docsera/docsera_runtime/ping",
    cssPath: undefined,
    scriptPath: undefined,
    workspaceCollectionPath: "/api/x_82900_docsera/docsera_runtime/workspaces",
    workspaceProvisioningStatusPath: "/api/x_82900_docsera/docsera_runtime/workspace-provisioning-status"
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

function createWorkspaceView(name = "Admin Docs", slug = "admin-docs") {
  return {
    sysId: "workspace-001",
    slug,
    name,
    shortDescription: "Release notes and launch guidance.",
    icon: {
      type: "builtin",
      key: "docsera-workspace",
      label: "Docsera workspace icon"
    },
    status: "active",
    roleLabel: "Admin" as const,
    canManageSettings: true
  };
}

test("ping sends the ServiceNow user token when one is available", async () => {
  (window as Window & { g_ck?: string }).g_ck = "session-token";
  const fetchMock = vi.fn().mockResolvedValue({
    status: 200,
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

test("listWorkspaces sends paging and search query parameters", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    status: 200,
    json: async () => ({
      result: {
        items: [createWorkspaceView()],
        page: 2,
        pageSize: 10,
        totalCount: 1,
        hasNextPage: false,
        searchText: "admin"
      }
    })
  });
  globalThis.fetch = fetchMock as typeof fetch;

  const result = await createServiceNowClient(runtime).listWorkspaces({
    searchText: "admin",
    page: 2,
    pageSize: 10
  });

  expect(fetchMock).toHaveBeenCalledWith(
    "/api/x_82900_docsera/docsera_runtime/workspaces?q=admin&page=2&pageSize=10",
    expect.objectContaining({
      credentials: "same-origin",
      headers: expect.objectContaining({
        Accept: "application/json"
      })
    })
  );
  expect(result.items[0]).toMatchObject({
    name: "Admin Docs",
    roleLabel: "Admin",
    canManageSettings: true
  });
});

test("createWorkspace returns pending results and the provisioning status endpoint resolves success", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      status: 202,
      json: async () => ({
        result: {
          mode: "servicenow",
          provisioning: {
            pollAfterMs: 1000,
            requestId: "request-001",
            state: "requested",
            statusPath: "/api/x_82900_docsera/docsera_runtime/workspace-provisioning-status?requestId=request-001"
          }
        }
      })
    })
    .mockResolvedValueOnce({
      status: 200,
      json: async () => ({
        result: {
          mode: "servicenow",
          provisioning: {
            requestId: "request-001",
            state: "succeeded",
            statusPath: "/api/x_82900_docsera/docsera_runtime/workspace-provisioning-status?requestId=request-001"
          },
          workspace: createWorkspaceView("Team Docs", "team-docs")
        }
      })
    });
  globalThis.fetch = fetchMock as typeof fetch;

  const client = createServiceNowClient(runtime);
  const pending = await client.createWorkspace({
    name: "Team Docs",
    shortDescription: "Planning"
  });
  const resolved = await client.getWorkspaceProvisioningStatus(
    pending.state === "pending" ? pending.statusPath : "/api/x_82900_docsera/docsera_runtime/workspace-provisioning-status?requestId=request-001"
  );

  expect(pending).toMatchObject({
    state: "pending",
    requestId: "request-001"
  });
  expect(resolved).toMatchObject({
    state: "succeeded",
    workspace: expect.objectContaining({
      name: "Team Docs",
      slug: "team-docs"
    })
  } satisfies WorkspaceCreateResult);
});

test("createWorkspace maps provisioning failures into a safe error state", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    status: 400,
    json: async () => ({
      error: {
        message: "Workspace creation failed."
      }
    })
  });
  globalThis.fetch = fetchMock as typeof fetch;

  const result = await createServiceNowClient(runtime).createWorkspace({
    name: "Broken Workspace",
    shortDescription: ""
  });

  expect(result).toMatchObject({
    state: "failed",
    errorMessage: "Workspace creation failed."
  });
});

