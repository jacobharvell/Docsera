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
      userDisplayName: "System Administrator",
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
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      status: 200,
      text: async () => JSON.stringify(createResponseBody(createPingEnvelope().result, 2))
    })
    .mockResolvedValueOnce({
      status: 200,
      text: async () =>
        JSON.stringify(
          createResponseBody({
            user_avatar: "a5d3c898c3222010ae17dd981840dd8b.iix?t=small",
            user_display_name: "System Administrator",
            user_initials: "SA",
            user_name: "admin",
            user_sys_id: "6816f79cc0a8016401c5a33be04be441"
          })
        )
    });
  globalThis.fetch = fetchMock as typeof fetch;

  const result = await createServiceNowClient(runtime).ping();
  const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  const [currentUserPath, currentUserInit] = fetchMock.mock.calls[1] as [string, RequestInit];

  expect(path).toBe("/api/x_82900_docsera/docsera_runtime/ping");
  expect(init.credentials).toBe("same-origin");
  expect(init.headers).toEqual({
    Accept: "application/json",
    "X-UserToken": "session-token"
  });
  expect(currentUserPath).toBe("/api/now/ui/user/current_user");
  expect(currentUserInit.credentials).toBe("same-origin");
  expect(currentUserInit.headers).toEqual({
    Accept: "application/json",
    "X-UserToken": "session-token"
  });
  expect(result).toMatchObject({
    authenticated: true,
    scope: "x_82900_docsera",
    status: "ok"
  });
  expect(result).toMatchObject({
    userAvatarPath: "/a5d3c898c3222010ae17dd981840dd8b.iix?t=small",
    userDisplayName: "System Administrator",
    userName: "admin",
    userSysId: "6816f79cc0a8016401c5a33be04be441"
  });
});

test("ping merges usable current_user identity over the scoped ping fallback", async () => {
  const pingEnvelope = createPingEnvelope();
  pingEnvelope.result.userDisplayName = "Scoped Fallback";
  pingEnvelope.result.userName = "scoped.fallback";
  pingEnvelope.result.userSysId = "fallback-sys-id";
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      status: 200,
      text: async () => JSON.stringify(createResponseBody(pingEnvelope.result, 2))
    })
    .mockResolvedValueOnce({
      status: 200,
      text: async () =>
        JSON.stringify(
          createResponseBody({
            user_avatar: "/avatar.do?sysparm_user=current-user",
            user_display_name: "System Administrator",
            user_name: "admin",
            user_sys_id: "6816f79cc0a8016401c5a33be04be441"
          })
        )
    });
  globalThis.fetch = fetchMock as typeof fetch;

  await expect(createServiceNowClient(runtime).ping()).resolves.toMatchObject({
    userAvatarPath: "/avatar.do?sysparm_user=current-user",
    userDisplayName: "System Administrator",
    userName: "admin",
    userSysId: "6816f79cc0a8016401c5a33be04be441"
  });
});

test("ping preserves scoped identity and initials fallback when current_user fails", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      status: 200,
      text: async () => JSON.stringify(createResponseBody(createPingEnvelope().result, 2))
    })
    .mockRejectedValueOnce(new Error("current_user unavailable"));
  globalThis.fetch = fetchMock as typeof fetch;

  await expect(createServiceNowClient(runtime).ping()).resolves.toMatchObject({
    userAvatarPath: "",
    userDisplayName: "System Administrator",
    userName: "admin",
    userSysId: "6816f79cc0a8016401c5a33be04be441"
  });
});

test("ping does not synthesize literal unknown identity fallbacks", async () => {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      status: 200,
      text: async () =>
        JSON.stringify(
          createResponseBody(
            {
              authenticated: true,
              scope: "x_82900_docsera",
              status: "ok",
              timestamp: "2026-07-03 11:16:20"
            },
            2
          )
        )
    })
    .mockResolvedValueOnce({
      status: 200,
      text: async () => JSON.stringify(createResponseBody({}))
    });
  globalThis.fetch = fetchMock as typeof fetch;

  await expect(createServiceNowClient(runtime).ping()).resolves.toMatchObject({
    userAvatarPath: "",
    userDisplayName: "",
    userName: "",
    userSysId: ""
  });
});

test("ping follows the error path for a non-success scoped ping response", async () => {
  const fetchMock = vi.fn().mockResolvedValueOnce({
    status: 500,
    text: async () => JSON.stringify({ error: { message: "Scoped runtime failed." } })
  });
  globalThis.fetch = fetchMock as typeof fetch;

  await expect(createServiceNowClient(runtime).ping()).rejects.toThrow("Ping failed with HTTP 500.");
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("listWorkspaces normalizes a double-wrapped live response", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    createFetchResponse(
      200,
      createResponseBody(
        {
          mode: "servicenow",
          canCreateWorkspaces: true,
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
  expect(result.canCreateWorkspaces).toBe(true);
});

test("listWorkspaces defaults missing creation capability to false", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    createFetchResponse(
      200,
      createResponseBody(
        {
          mode: "servicenow",
          items: [],
          page: 1,
          pageSize: 10,
          totalCount: 0,
          hasNextPage: false,
          searchText: ""
        },
        2
      )
    )
  );
  globalThis.fetch = fetchMock as typeof fetch;

  const result = await createServiceNowClient(runtime).listWorkspaces();

  expect(result.canCreateWorkspaces).toBe(false);
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

test("createWorkspace maps unauthorized creation into a safe error state", async () => {
  const fetchMock = vi.fn().mockResolvedValue({
    status: 403,
    text: async () =>
      JSON.stringify(
        createResponseBody(
          {
            error: {
              message: "You do not have permission to create workspaces."
            }
          },
          2
        )
      )
  });
  globalThis.fetch = fetchMock as typeof fetch;

  const result = await createServiceNowClient(runtime).createWorkspace({
    name: "Forbidden Workspace",
    shortDescription: ""
  });

  expect(result).toMatchObject({
    state: "failed",
    errorMessage: "You do not have permission to create workspaces."
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

test("uploadWorkspaceIcon posts the selected file to the workspace icon boundary and normalizes the uploaded icon", async () => {
  const file = new File(["image"], "brand.png", { type: "image/png" });
  const fetchMock = vi.fn().mockResolvedValue(
    createFetchResponse(
      201,
      createResponseBody(
        {
          asset: {
            assetKey: "asset-key-001",
            fileName: "brand.png",
            url: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=asset-key-001",
            contentType: "image/png",
            sizeBytes: 512,
            width: 128,
            height: 128
          }
        },
        2
      )
    )
  );
  globalThis.fetch = fetchMock as typeof fetch;

  const result = await createServiceNowClient(runtime).uploadWorkspaceIcon!({ file });
  const [path, init] = fetchMock.mock.calls[0] as [string, RequestInit];

  expect(path).toBe("/api/x_82900_docsera/docsera_runtime/workspaces/icons?fileName=brand.png");
  expect(init.method).toBe("POST");
  expect(init.body).toBe(file);
  expect(init.headers).toMatchObject({
    Accept: "application/json",
    "Content-Type": "image/png"
  });
  expect(result).toEqual({
    state: "succeeded",
    icon: {
      type: "uploaded",
      key: "asset-key-001",
      label: "brand.png",
      assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=asset-key-001"
    }
  });
});

test("uploadWorkspaceIcon rejects malformed successful upload descriptors safely", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    createFetchResponse(
      201,
      createResponseBody(
        {
          asset: {
            assetKey: "asset-key-001",
            fileName: "brand.png",
            url: "",
            contentType: "image/png",
            sizeBytes: 512,
            width: 128,
            height: 128
          }
        },
        2
      )
    )
  );
  globalThis.fetch = fetchMock as typeof fetch;

  await expect(createServiceNowClient(runtime).uploadWorkspaceIcon!({ file: new File(["image"], "brand.png", { type: "image/png" }) })).resolves.toEqual({
    state: "failed",
    errorMessage: "Something went wrong while uploading the workspace icon. The file was not saved. Please try again.",
    retryable: true
  });
});

test("uploadWorkspaceIcon returns server-safe errors for rejected uploads", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    createFetchResponse(
      415,
      createResponseBody(
        {
          error: {
            message: "Use a PNG, JPG, or WebP image."
          }
        },
        2
      )
    )
  );
  globalThis.fetch = fetchMock as typeof fetch;

  const result = await createServiceNowClient(runtime).uploadWorkspaceIcon!({
    file: new File(["gif"], "animated.gif", { type: "image/gif" })
  });

  expect(result).toEqual({
    state: "failed",
    errorMessage: "Use a PNG, JPG, or WebP image."
  });
});
