import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { App } from "../src/client/app/App";
import type {
  DocseraRuntimeContext,
  PingResult,
  PageBodySaveResult,
  PageListResult,
  ServiceNowClient,
  WorkspaceCreateResult,
  WorkspaceListResult,
  WorkspacePageRecord,
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
  createPage?: (input: { workspaceSlug: string; title: string }) => Promise<{ state: "failed"; errorMessage: string } | { state: "succeeded"; page: WorkspacePageRecord }>;
  listPages?: (input: { workspaceSlug: string }) => Promise<PageListResult>;
  getWorkspace?: (workspaceSlug: string) => Promise<{ workspace: WorkspaceViewRecord | null }>;
  getWorkspaceProvisioningStatus?: (statusPath: string) => Promise<WorkspaceCreateResult>;
  listWorkspaces?: (input?: { searchText?: string; page?: number; pageSize?: number }) => Promise<WorkspaceListResult>;
  ping?: () => Promise<PingResult>;
  savePageBody?: (input: { workspaceSlug?: string; workspaceSysId?: string; pageSysId?: string; pageSlug?: string; draftBodyText: string }) => Promise<PageBodySaveResult>;
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
    listPages:
      options.listPages ??
      (async () => ({
        items: [],
        totalCount: 0,
        workspaceSlug: "",
        workspaceSysId: ""
      })),
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
      })),
    createPage: options.createPage ?? (async () => ({
      state: "failed",
      errorMessage: "Not implemented"
    })),
    savePageBody:
      options.savePageBody ??
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
        }),
        listPages: async () => ({
          items: [
            {
              sysId: "page-001",
              workspaceSysId: "workspace-001",
              parentPageSysId: null,
              siblingOrder: 1,
              draftTitle: "Overview",
              draftSlug: "overview",
              draftSlugNormalized: "overview",
              draftContentJson: {
                type: "doc",
                content: []
              },
              draftBodyText: null,
              publishedTitle: null,
              publishedSlug: null,
              publishedSlugNormalized: null,
              publishedContentJson: null,
              publishedBodyText: null,
              publicationState: "draft",
              active: true
            }
          ],
          totalCount: 1,
          workspaceSlug: "workspace-001",
          workspaceSysId: "workspace-001"
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

test("workspace shell hydrates live pages and keeps a newly created page visible after reopen", async () => {
  const livePages: WorkspacePageRecord[] = [
    {
      sysId: "page-001",
      workspaceSysId: "workspace-001",
      parentPageSysId: null,
      siblingOrder: 1,
      draftTitle: "Overview",
      draftSlug: "overview",
      draftSlugNormalized: "overview",
      draftContentJson: {
        type: "doc",
        content: []
      },
      draftBodyText: null,
      publishedTitle: null,
      publishedSlug: null,
      publishedSlugNormalized: null,
      publishedContentJson: null,
      publishedBodyText: null,
      publicationState: "draft",
      active: true
    }
  ];
  const pageListMock = vi.fn(async () => ({
    items: [...livePages],
    totalCount: livePages.length,
    workspaceSlug: "workspace-001",
    workspaceSysId: "workspace-001"
  } satisfies PageListResult));
  const createPageMock = vi.fn(async () => {
    const createdPage: WorkspacePageRecord = {
      sysId: "page-002",
      workspaceSysId: "workspace-001",
      parentPageSysId: null,
      siblingOrder: 2,
      draftTitle: "Task 33 Refresh Smoke",
      draftSlug: "task-33-refresh-smoke",
      draftSlugNormalized: "task-33-refresh-smoke",
      draftContentJson: {
        type: "doc",
        content: []
      },
      draftBodyText: null,
      publishedTitle: null,
      publishedSlug: null,
      publishedSlugNormalized: null,
      publishedContentJson: null,
      publishedBodyText: null,
      publicationState: "draft",
      active: false
    };

    livePages.push(createdPage);
    return {
      state: "succeeded",
      page: createdPage
    } satisfies WorkspaceCreateResult;
  });

  render(
    <App
      runtime={createRuntime()}
      serviceNowClient={createClient({
        listWorkspaces: async () => ({
          items: [
            createWorkspace({
              name: "Product Docs",
              roleLabel: "Admin",
              canManageSettings: true,
              slug: "workspace-001"
            })
          ],
          page: 1,
          pageSize: 10,
          totalCount: 1,
          hasNextPage: false,
          searchText: ""
        }),
        getWorkspace: async () => ({
          workspace: createWorkspace({
            name: "Product Docs",
            roleLabel: "Admin",
            canManageSettings: true,
            slug: "workspace-001"
          })
        }),
        listPages: pageListMock,
        createPage: createPageMock
      })}
    />
  );

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "My Workspaces", level: 1 })).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole("link", { name: "Product Docs" }));

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Overview", level: 1 })).toBeInTheDocument();
  });

  expect(screen.getByRole("button", { name: "Overview" })).toBeInTheDocument();
  expect(pageListMock).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getAllByRole("button", { name: "New page" })[0]);
  fireEvent.change(screen.getByRole("textbox", { name: "Page title" }), { target: { value: "Task 33 Refresh Smoke" } });
  fireEvent.click(screen.getByRole("button", { name: "Create page" }));

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Task 33 Refresh Smoke", level: 1 })).toBeInTheDocument();
  });
  expect(screen.getByRole("button", { name: "Task 33 Refresh Smoke" })).toBeInTheDocument();
  expect(pageListMock).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getByRole("button", { name: "Workspace switcher: Product Docs" }));
  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "My Workspaces", level: 1 })).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole("link", { name: "Product Docs" }));

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Task 33 Refresh Smoke", level: 1 })).toBeInTheDocument();
  });

  expect(pageListMock).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: "Task 33 Refresh Smoke" })).toBeInTheDocument();
});

test("page body save failures from thrown client errors show a generic message and keep draft text", async () => {
  const { container } = render(
    <App
      runtime={createRuntime({}, "/?workspace=workspace-001")}
      serviceNowClient={createClient({
        getWorkspace: async () => ({
          workspace: createWorkspace({
            name: "Product Docs",
            roleLabel: "Admin",
            canManageSettings: true,
            slug: "workspace-001"
          })
        }),
        listPages: async () => ({
          items: [
            {
              sysId: "page-001",
              workspaceSysId: "workspace-001",
              parentPageSysId: null,
              siblingOrder: 1,
              draftTitle: "Overview",
              draftSlug: "overview",
              draftSlugNormalized: "overview",
              draftContentJson: {
                type: "doc",
                content: []
              },
              draftBodyText: "Initial body",
              publishedTitle: null,
              publishedSlug: null,
              publishedSlugNormalized: null,
              publishedContentJson: null,
              publishedBodyText: null,
              publicationState: "draft",
              active: true
            }
          ],
          totalCount: 1,
          workspaceSlug: "workspace-001",
          workspaceSysId: "workspace-001"
        }),
        savePageBody: async () => {
          throw new Error("GlideRecord failed for x_82900_docsera_docsera_page");
        }
      })}
    />
  );

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Overview", level: 1 })).toBeInTheDocument();
  });

  const textarea = screen.getByLabelText("Body");
  fireEvent.change(textarea, { target: { value: "Updated body" } });
  fireEvent.click(screen.getByRole("button", { name: "Save draft body" }));

  await waitFor(() => {
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Something went wrong while saving the page body. Please try again."
    );
  });

  expect(textarea).toHaveValue("Updated body");
  expect(screen.getByText("Save failed")).toBeInTheDocument();
  expect(container.querySelector(".docsera-app-frame")).toBeInTheDocument();
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
