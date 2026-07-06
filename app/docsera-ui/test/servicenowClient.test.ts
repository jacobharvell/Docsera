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

function createResponseBody(payload: unknown, depth = 1): unknown {
  let current = payload;

  for (let index = 0; index < depth; index += 1) {
    current = { result: current };
  }

  return current;
}

function createFetchResponse(status: number, payload: unknown) {
  return {
    status,
    text: async () => JSON.stringify(payload)
  };
}

test("ping sends the ServiceNow user token when one is available", async () => {
  (window as Window & { g_ck?: string }).g_ck = "session-token";
  const fetchMock = vi.fn().mockResolvedValue({
    status: 200,
    text: async () => JSON.stringify(createResponseBody(createPingEnvelope().result, 2))
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

test("listWorkspaces normalizes a double-wrapped live response", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    createFetchResponse(
      200,
      createResponseBody(
        {
          mode: "servicenow",
          items: [createWorkspaceView()],
          page: 2,
          pageSize: 10,
          totalCount: 1,
          hasNextPage: false,
          searchText: "admin"
        },
        2
      )
    )
  );
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

test("getWorkspace still accepts the one-layer response contract", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    createFetchResponse(
      200,
      createResponseBody(
        {
          mode: "servicenow",
          workspace: createWorkspaceView("Viewer Docs", "viewer-docs")
        },
        1
      )
    )
  );
  globalThis.fetch = fetchMock as typeof fetch;

  const result = await createServiceNowClient(runtime).getWorkspace("viewer-docs");

  expect(result.workspace).toMatchObject({
    name: "Viewer Docs",
    slug: "viewer-docs"
  });
});

test("createWorkspace resolves pending workspaces and the status endpoint resolves success from double-wrapped responses", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(
      createFetchResponse(
        202,
        createResponseBody(
          {
            mode: "servicenow",
            provisioning: {
              pollAfterMs: 1000,
              requestId: "request-001",
              state: "requested",
              statusPath: "/api/x_82900_docsera/docsera_runtime/workspace-provisioning-status?requestId=request-001"
            },
            roleNames: {
              docseraAdmin: "x_82900_docsera.admin",
              editor: "x_82900_docsera.editor",
              workspaceAdmin: "x_82900_docsera.workspace_admin"
            }
          },
          2
        )
      )
    )
    .mockResolvedValueOnce(
      createFetchResponse(
        200,
        createResponseBody(
          {
            mode: "servicenow",
            provisioning: {
              requestId: "request-001",
              state: "succeeded",
              statusPath: "/api/x_82900_docsera/docsera_runtime/workspace-provisioning-status?requestId=request-001"
            },
            workspace: createWorkspaceView("Team Docs", "team-docs"),
            groups: {
              admin: {
                sysId: "group-admin-001",
                name: "Docsera_Team_Docs_Admins"
              },
              editor: {
                sysId: "group-editor-001",
                name: "Docsera_Team_Docs_Editors"
              }
            }
          },
          2
        )
      )
    );
  globalThis.fetch = fetchMock as typeof fetch;

  const client = createServiceNowClient(runtime);
  const pending = await client.createWorkspace({
    name: "Team Docs",
    shortDescription: "Planning"
  });
  const resolved = await client.getWorkspaceProvisioningStatus(
    pending.state === "pending"
      ? pending.statusPath
      : "/api/x_82900_docsera/docsera_runtime/workspace-provisioning-status?requestId=request-001"
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

test("provisioning status normalizes double-wrapped failed responses", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    createFetchResponse(
      200,
      createResponseBody(
        {
          mode: "servicenow",
          error: {
            code: "provisioning_failed",
            message: "Workspace provisioning failed."
          },
          provisioning: {
            requestId: "request-002",
            state: "failed",
            statusPath: "/api/x_82900_docsera/docsera_runtime/workspace-provisioning-status?requestId=request-002"
          },
          roleNames: {
            docseraAdmin: "x_82900_docsera.admin",
            editor: "x_82900_docsera.editor",
            workspaceAdmin: "x_82900_docsera.workspace_admin"
          }
        },
        2
      )
    )
  );
  globalThis.fetch = fetchMock as typeof fetch;

  const result = await createServiceNowClient(runtime).getWorkspaceProvisioningStatus(
    "/api/x_82900_docsera/docsera_runtime/workspace-provisioning-status?requestId=request-002"
  );

  expect(result).toMatchObject({
    state: "failed",
    errorMessage: "Workspace provisioning failed."
  });
});

test("createWorkspace maps provisioning failures into a safe error state", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    status: 400,
    text: async () =>
      JSON.stringify(
        createResponseBody(
          {
            error: {
              message: "Workspace creation failed."
            }
          },
          2
        )
      )
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

test("createWorkspace rejects invalid payloads safely", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    status: 201,
    text: async () => "not-json"
  });
  globalThis.fetch = fetchMock as typeof fetch;

  await expect(
    createServiceNowClient(runtime).createWorkspace({
      name: "Broken Workspace",
      shortDescription: ""
    })
  ).rejects.toThrow("Workspace creation payload was invalid.");
});
