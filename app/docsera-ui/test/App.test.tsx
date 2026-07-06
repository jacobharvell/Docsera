import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../src/client/app/App";
import type {
  DocseraRuntimeContext,
  PingResult,
  ServiceNowClient,
  WorkspaceCreateResult,
  WorkspaceListResult,
  WorkspaceViewRecord
} from "../src/client/shared/types/docsera";

function createRuntime(
  overrides: Partial<DocseraRuntimeContext["config"]> = {},
  path = "/?view=my-workspaces"
): DocseraRuntimeContext {
  const mountNode = document.createElement("div");

  window.history.replaceState({}, "", path);

  return {
    mountNode,
    mountNodeId: "docsera-root",
    config: {
      backendPingPath: undefined,
      cssPath: undefined,
      scriptPath: undefined,
      workspaceCollectionPath: "/api/x_82900_docsera/docsera_runtime/workspaces",
      workspaceProvisioningStatusPath: "/api/x_82900_docsera/docsera_runtime/workspace-provisioning-status",
      ...overrides
    }
  };
}

function createWorkspace(overrides: Partial<WorkspaceViewRecord> = {}): WorkspaceViewRecord {
  return {
    sysId: "workspace-001",
    slug: "workspace-001",
    name: "Product Docs",
    shortDescription: "Release notes, decisions, and launch guidance.",
    icon: {
      type: "builtin",
      key: "docsera-workspace",
      label: "Docsera workspace icon"
    },
    status: "active",
    roleLabel: "Admin",
    canManageSettings: true,
    ...overrides
  };
}

function createClient(options: {
  createWorkspace?: () => Promise<WorkspaceCreateResult>;
  getWorkspace?: (workspaceSlug: string) => Promise<{ workspace: WorkspaceViewRecord | null }>;
  getWorkspaceProvisioningStatus?: (statusPath: string) => Promise<WorkspaceCreateResult>;
  listWorkspaces?: (input?: { searchText?: string; page?: number; pageSize?: number }) => Promise<WorkspaceListResult>;
  ping?: () => Promise<PingResult>;
} = {}): ServiceNowClient {
  return {
    ping: options.ping ?? (async () => ({
      authenticated: true,
      scope: "x_82900_docsera",
      status: "ok",
      timestamp: "2026-07-06 10:00:00",
      userName: "admin",
      userSysId: "6816f79cc0a8016401c5a33be04be441"
    })),
    listWorkspaces:
      options.listWorkspaces ??
      (async () => ({
        items: [],
        page: 1,
        pageSize: 10,
        totalCount: 0,
        hasNextPage: false,
        searchText: ""
      })),
    getWorkspace: options.getWorkspace ?? (async () => ({ workspace: null })),
    createWorkspace:
      options.createWorkspace ??
      (async () => ({
        state: "failed",
        errorMessage: "Not implemented"
      })),
    getWorkspaceProvisioningStatus:
      options.getWorkspaceProvisioningStatus ??
      (async () => ({
        state: "failed",
        errorMessage: "Not implemented"
      }))
  };
}

test("renders My Workspaces with live rows and hides settings from editor-only rows", async () => {
  const { container } = render(
    <App
      runtime={createRuntime()}
      serviceNowClient={createClient({
        listWorkspaces: async () => ({
          items: [
            createWorkspace({ name: "Admin Docs", roleLabel: "Admin", canManageSettings: true }),
            createWorkspace({
              name: "Editor Docs",
              roleLabel: "Editor",
              canManageSettings: false,
              sysId: "workspace-002",
              slug: "workspace-002"
            })
          ],
          page: 1,
          pageSize: 10,
          totalCount: 2,
          hasNextPage: false,
          searchText: ""
        })
      })}
    />
  );

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "My Workspaces", level: 1 })).toBeInTheDocument();
  });

  expect(container.querySelector(".docsera-app-frame")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Admin Docs" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Editor Docs" })).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Settings" })).toHaveLength(1);
});

test("opening a workspace row switches to the workspace shell in the same app frame", async () => {
  const { container } = render(
    <App
      runtime={createRuntime()}
      serviceNowClient={createClient({
        listWorkspaces: async () => ({
          items: [
            createWorkspace({ name: "Admin Docs", roleLabel: "Admin", canManageSettings: true }),
            createWorkspace({
              name: "Editor Docs",
              roleLabel: "Editor",
              canManageSettings: false,
              sysId: "workspace-002",
              slug: "workspace-002"
            })
          ],
          page: 1,
          pageSize: 10,
          totalCount: 2,
          hasNextPage: false,
          searchText: ""
        }),
        getWorkspace: async (workspaceSlug) => ({
          workspace: createWorkspace({
            name: workspaceSlug === "workspace-002" ? "Editor Docs" : "Admin Docs",
            slug: workspaceSlug
          })
        })
      })}
    />
  );

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "My Workspaces", level: 1 })).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole("link", { name: "Admin Docs" }));

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Workspace switcher: Admin Docs" })).toBeInTheDocument();
  });

  expect(container.querySelector(".docsera-app-frame")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Overview", level: 1 })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "My Workspaces", level: 1 })).not.toBeInTheDocument();
});

test("workspace load failures still render inside the shared app frame", async () => {
  const { container } = render(
    <App
      runtime={createRuntime({}, "/?workspace=workspace-404")}
      serviceNowClient={createClient({
        getWorkspace: async () => {
          throw new Error("ACL denied on x_82900_docsera_docsera_workspace");
        }
      })}
    />
  );

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Workspace unavailable", level: 2 })).toBeInTheDocument();
  });

  expect(container.querySelector(".docsera-app-frame")).toBeInTheDocument();
  expect(screen.getByText("Unable to load workspace.")).toBeInTheDocument();
});

test("workspace creation handles the pending provisioning path and opens the created workspace", async () => {
  const provisionedWorkspace = createWorkspace({
    name: "Team Docs",
    slug: "team-docs",
    sysId: "workspace-003"
  });
  const createMock = vi
    .fn()
    .mockResolvedValueOnce({
      state: "pending",
      requestId: "request-001",
      statusPath: "/api/x_82900_docsera/docsera_runtime/workspace-provisioning-status?requestId=request-001",
      pollAfterMs: 0
    } satisfies WorkspaceCreateResult);
  const statusMock = vi
    .fn()
    .mockResolvedValueOnce({
      state: "succeeded",
      workspace: provisionedWorkspace
    } satisfies WorkspaceCreateResult);

  render(
    <App
      runtime={createRuntime()}
      serviceNowClient={createClient({
        listWorkspaces: async () => ({
          items: [],
          page: 1,
          pageSize: 10,
          totalCount: 0,
          hasNextPage: false,
          searchText: ""
        }),
        createWorkspace: createMock,
        getWorkspaceProvisioningStatus: statusMock,
        getWorkspace: async (workspaceSlug) => ({
          workspace: createWorkspace({
            name: workspaceSlug === "team-docs" ? "Team Docs" : "Unknown",
            slug: workspaceSlug,
            sysId: "workspace-003"
          })
        })
      })}
    />
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "New Workspace" })).toBeInTheDocument();
  });

  fireEvent.click(screen.getAllByRole("button", { name: "New Workspace" })[0]);
  fireEvent.change(screen.getByRole("textbox", { name: "Workspace name" }), { target: { value: "Team Docs" } });
  fireEvent.change(screen.getByRole("textbox", { name: /Short description/ }), { target: { value: "Team workspace" } });
  fireEvent.click(screen.getByRole("button", { name: "Create workspace" }));

  await waitFor(() => {
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(statusMock).toHaveBeenCalledTimes(1);
  });

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Workspace switcher: Team Docs" })).toBeInTheDocument();
  });
});
