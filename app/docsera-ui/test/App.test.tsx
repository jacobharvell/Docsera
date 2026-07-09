import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "../src/client/app/App";
import type {
  DocseraRuntimeContext,
  PingResult,
  PageCreateResult,
  PageBodySaveResult,
  PageDeleteResult,
  PageListResult,
  PageSettingsSaveResult,
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
  createPage?: (input: { parentPageSysId?: string | null; workspaceSlug: string; title: string }) => Promise<{ state: "failed"; errorMessage: string } | { state: "succeeded"; page: WorkspacePageRecord }>;
  listPages?: (input: { workspaceSlug: string }) => Promise<PageListResult>;
  getWorkspace?: (workspaceSlug: string) => Promise<{ workspace: WorkspaceViewRecord | null }>;
  getWorkspaceProvisioningStatus?: (statusPath: string) => Promise<WorkspaceCreateResult>;
  listWorkspaces?: (input?: { searchText?: string; page?: number; pageSize?: number }) => Promise<WorkspaceListResult>;
  ping?: () => Promise<PingResult>;
  savePageBody?: (input: { workspaceSlug?: string; workspaceSysId?: string; pageSysId?: string; pageSlug?: string; draftBodyText: string }) => Promise<PageBodySaveResult>;
  savePageSettings?: (input: { workspaceSlug: string; workspaceSysId: string; pageSysId: string; title: string; slug: string }) => Promise<PageSettingsSaveResult>;
  deletePage?: (input: { workspaceSlug: string; workspaceSysId: string; pageSysId: string }) => Promise<PageDeleteResult>;
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
      })),
    savePageSettings:
      options.savePageSettings ??
      (async () => ({
        state: "failed",
        errorMessage: "Not implemented"
      })),
    deletePage:
      options.deletePage ??
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

  expect(container.querySelectorAll(".docsera-header")).toHaveLength(1);
  expect(container.querySelectorAll(".docsera-launcher-screen")).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Toggle theme" })).toBeInTheDocument();
  expect(container.querySelector(".docsera-launcher-panel")).not.toBeNull();
  expect(screen.getByPlaceholderText("Search workspaces...")).toBeInTheDocument();
  expect(screen.getByText("Workspace")).toBeInTheDocument();
  expect(screen.getByText("Role")).toBeInTheDocument();
  expect(screen.getByText("Showing 1-2 of 2")).toBeInTheDocument();
  expect(screen.queryByText("Updating...")).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Admin Docs" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Editor Docs" })).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "Settings" })).toHaveLength(1);
  expect(container.querySelectorAll(".docsera-workspace-row__role-cell")).toHaveLength(2);
  expect(container.querySelectorAll(".docsera-workspace-row__settings")).toHaveLength(1);
  expect(container.querySelectorAll(".docsera-workspace-row__icon")).toHaveLength(2);
});

test("launcher empty state keeps the list-card shell and create action", async () => {
  const { container } = render(<App runtime={createRuntime()} serviceNowClient={createClient()} />);

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "No workspaces to show", level: 2 })).toBeInTheDocument();
  });

  expect(container.querySelector(".docsera-launcher-panel")).not.toBeNull();
  expect(screen.getByText(/request access from a workspace admin/i)).toBeInTheDocument();
  expect(screen.getAllByRole("button", { name: "New Workspace" })).toHaveLength(2);
});

test("launcher no-results state keeps search inside the card and shows concise copy", async () => {
  const listWorkspaces = vi.fn(async (input?: { searchText?: string; page?: number; pageSize?: number }) => {
    const searchText = input?.searchText ?? "";

    if (searchText) {
      return {
        items: [],
        page: 1,
        pageSize: 10,
        totalCount: 0,
        hasNextPage: false,
        searchText
      } satisfies WorkspaceListResult;
    }

    return {
      items: [createWorkspace()],
      page: 1,
      pageSize: 10,
      totalCount: 1,
      hasNextPage: false,
      searchText
    } satisfies WorkspaceListResult;
  });

  const { container } = render(<App runtime={createRuntime()} serviceNowClient={createClient({ listWorkspaces })} />);

  await waitFor(() => {
    expect(screen.getByRole("link", { name: "Product Docs" })).toBeInTheDocument();
  });

  fireEvent.change(screen.getByPlaceholderText("Search workspaces..."), { target: { value: "zzz" } });

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "No matching workspaces", level: 2 })).toBeInTheDocument();
  });

  expect(screen.getByText("Try a different search term.")).toBeInTheDocument();
  expect(screen.getByPlaceholderText("Search workspaces...")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Clear search" })).toBeInTheDocument();
  expect(container.querySelector(".docsera-launcher-panel")).not.toBeNull();

  fireEvent.click(screen.getByRole("button", { name: "Clear search" }));

  await waitFor(() => {
    expect(screen.getByRole("link", { name: "Product Docs" })).toBeInTheDocument();
  });

  expect(screen.queryByRole("heading", { name: "No matching workspaces", level: 2 })).not.toBeInTheDocument();
});

test("typing in workspace search keeps the input mounted and focused while results refresh", async () => {
  let resolveSearch: ((value: WorkspaceListResult) => void) | null = null;
  const listWorkspaces = vi.fn((input?: { searchText?: string; page?: number; pageSize?: number }) => {
    const searchText = input?.searchText ?? "";

    if (!searchText) {
      return Promise.resolve({
        items: [createWorkspace()],
        page: 1,
        pageSize: 10,
        totalCount: 1,
        hasNextPage: false,
        searchText: ""
      } satisfies WorkspaceListResult);
    }

    return new Promise<WorkspaceListResult>((resolve) => {
      resolveSearch = resolve;
    });
  });

  render(<App runtime={createRuntime()} serviceNowClient={createClient({ listWorkspaces })} />);

  await waitFor(() => {
    expect(screen.getByRole("link", { name: "Product Docs" })).toBeInTheDocument();
  });

  const searchInput = screen.getByPlaceholderText("Search workspaces...");
  searchInput.focus();
  fireEvent.change(searchInput, { target: { value: "prod" } });

  expect(screen.getByPlaceholderText("Search workspaces...")).toBe(searchInput);
  expect(document.activeElement).toBe(searchInput);
  expect(screen.getByRole("link", { name: "Product Docs" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Loading workspaces", level: 2 })).not.toBeInTheDocument();
  expect(screen.queryByText("Updating...")).not.toBeInTheDocument();

  resolveSearch?.({
    items: [createWorkspace()],
    page: 1,
    pageSize: 10,
    totalCount: 1,
    hasNextPage: false,
    searchText: "prod"
  });

  await waitFor(() => {
    expect(listWorkspaces).toHaveBeenCalledWith(
      expect.objectContaining({
        page: 1,
        pageSize: 10,
        searchText: "prod"
      })
    );
  });
});

test("opening a workspace row switches to the workspace shell with a single shared header", async () => {
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

  expect(container.querySelectorAll(".docsera-header")).toHaveLength(1);
  expect(screen.getByRole("heading", { name: "Overview", level: 1 })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "My Workspaces", level: 1 })).not.toBeInTheDocument();
});

test("workspace shell hydrates live pages and keeps a newly created page visible after refresh", async () => {
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
    } satisfies PageCreateResult;
  });

  const firstRender = render(
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
  expect(screen.getAllByRole("button", { name: "New page" })).toHaveLength(2);
  expect(pageListMock).toHaveBeenCalledTimes(1);

  fireEvent.click(screen.getAllByRole("button", { name: "New page" })[0]);
  expect(screen.queryByRole("dialog", { name: /create page/i })).not.toBeInTheDocument();

  const inlineInput = screen.getByRole("textbox", { name: "New page title" });
  expect(inlineInput).toHaveValue("untitled-page");
  expect(document.activeElement).toBe(inlineInput);
  expect((inlineInput as HTMLInputElement).selectionStart).toBe(0);
  expect((inlineInput as HTMLInputElement).selectionEnd).toBe("untitled-page".length);

  fireEvent.change(inlineInput, { target: { value: "Task 33 Refresh Smoke" } });
  fireEvent.keyDown(inlineInput, { key: "Enter", code: "Enter" });

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Task 33 Refresh Smoke", level: 1 })).toBeInTheDocument();
  });
  expect(screen.getByRole("button", { name: "Task 33 Refresh Smoke" })).toBeInTheDocument();
  expect(window.location.search).toBe("?workspace=workspace-001&page_id=page-002");
  expect(pageListMock).toHaveBeenCalledTimes(1);

  const refreshedPath = `${window.location.pathname}${window.location.search}`;
  firstRender.unmount();

  render(
    <App
      runtime={createRuntime({}, refreshedPath)}
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
    expect(screen.getByRole("heading", { name: "Task 33 Refresh Smoke", level: 1 })).toBeInTheDocument();
  });

  expect(pageListMock).toHaveBeenCalledTimes(2);
  expect(screen.getByRole("button", { name: "Task 33 Refresh Smoke" })).toBeInTheDocument();
});

test("workspace page tree ignores first-pass width storage, keeps the bottom new-page row last, and supports inline root and child creation", async () => {
  window.localStorage.clear();
  window.localStorage.setItem("docsera.workspace-nav-width:workspace-001", "220");

  const livePages: WorkspacePageRecord[] = [
    {
      sysId: "page-parent",
      workspaceSysId: "workspace-001",
      parentPageSysId: null,
      siblingOrder: 1,
      draftTitle: "Overview",
      draftSlug: "overview",
      draftSlugNormalized: "overview",
      draftContentJson: { type: "doc", content: [] },
      draftBodyText: null,
      publishedTitle: null,
      publishedSlug: null,
      publishedSlugNormalized: null,
      publishedContentJson: null,
      publishedBodyText: null,
      publicationState: "draft",
      active: true
    },
    {
      sysId: "page-child",
      workspaceSysId: "workspace-001",
      parentPageSysId: "page-parent",
      siblingOrder: 1,
      draftTitle: "Child Page",
      draftSlug: "child-page",
      draftSlugNormalized: "child-page",
      draftContentJson: { type: "doc", content: [] },
      draftBodyText: null,
      publishedTitle: null,
      publishedSlug: null,
      publishedSlugNormalized: null,
      publishedContentJson: null,
      publishedBodyText: null,
      publicationState: "draft",
      active: true
    },
    {
      sysId: "page-leaf",
      workspaceSysId: "workspace-001",
      parentPageSysId: null,
      siblingOrder: 2,
      draftTitle: "Leaf Page",
      draftSlug: "leaf-page",
      draftSlugNormalized: "leaf-page",
      draftContentJson: { type: "doc", content: [] },
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

  const createPageMock = vi.fn(async (input: { parentPageSysId?: string | null; workspaceSlug: string; title: string }) => {
    const isChildCreate = input.parentPageSysId === "page-parent";

    return {
      state: "succeeded",
      page: {
        sysId: isChildCreate ? "page-new-child" : "page-new-root",
        workspaceSysId: "workspace-001",
        parentPageSysId: input.parentPageSysId ?? null,
        siblingOrder: isChildCreate ? 3 : 4,
        draftTitle: input.title,
        draftSlug: isChildCreate ? "new-child" : "untitled-page",
        draftSlugNormalized: isChildCreate ? "new-child" : "untitled-page",
        draftContentJson: { type: "doc", content: [] },
        draftBodyText: null,
        publishedTitle: null,
        publishedSlug: null,
        publishedSlugNormalized: null,
        publishedContentJson: null,
        publishedBodyText: null,
        publicationState: "draft",
        active: true
      }
    } satisfies PageCreateResult;
  });

  const { container } = render(
    <App
      runtime={createRuntime({}, "/?workspace=workspace-001&page_id=page-parent")}
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
          items: livePages,
          totalCount: livePages.length,
          workspaceSlug: "workspace-001",
          workspaceSysId: "workspace-001"
        }),
        createPage: createPageMock
      })}
    />
  );

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Overview", level: 1 })).toBeInTheDocument();
  });

  expect(container.querySelector(".docsera-sidebar__tree-label")).toBeNull();
  expect(container.querySelector(".docsera-sidebar__meta")).toBeNull();
  expect(screen.queryByText("pages / Admin")).not.toBeInTheDocument();
  expect(container.querySelector(".docsera-shell")).toHaveStyle("--docsera-workspace-nav-width: 280px");

  const pageTree = screen.getByRole("navigation", { name: "Page tree" });
  const treeButtons = within(pageTree).getAllByRole("button");
  expect(treeButtons[treeButtons.length - 1]).toHaveTextContent("New page");

  expect(screen.getByLabelText("Open settings for Overview")).toBeInTheDocument();
  expect(screen.getByLabelText("Open settings for Leaf Page")).toBeInTheDocument();
  expect(screen.getByLabelText("Add child page to Overview")).toBeInTheDocument();
  expect(screen.queryByLabelText("Add child page to Leaf Page")).not.toBeInTheDocument();

  fireEvent.mouseDown(screen.getByRole("button", { name: "Resize navigation panel" }));
  fireEvent.mouseMove(window, { clientX: 420 });
  fireEvent.mouseUp(window);
  expect(container.querySelector(".docsera-shell")).toHaveStyle("--docsera-workspace-nav-width: 420px");
  expect(window.localStorage.getItem("docsera.workspace-nav-width:workspace-001")).toBe("220");
  expect(window.localStorage.getItem("docsera.workspace-nav-width.v2:workspace-001")).toBe("420");

  fireEvent.click(screen.getAllByRole("button", { name: "New page" })[0]);
  expect(screen.queryByRole("dialog", { name: /create page/i })).not.toBeInTheDocument();

  const rootInlineInput = screen.getByRole("textbox", { name: "New page title" });
  expect(rootInlineInput).toHaveValue("untitled-page");
  expect(document.activeElement).toBe(rootInlineInput);

  const rootButtonsDuringCreate = within(pageTree).getAllByRole("button");
  expect(rootButtonsDuringCreate[rootButtonsDuringCreate.length - 1]).toHaveTextContent("New page");

  fireEvent.change(rootInlineInput, { target: { value: "   " } });
  fireEvent.blur(rootInlineInput);

  await waitFor(() => {
    expect(screen.queryByRole("textbox", { name: "New page title" })).not.toBeInTheDocument();
  });
  expect(createPageMock).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "Collapse Overview" }));
  expect(screen.queryByRole("button", { name: "Child Page" })).not.toBeInTheDocument();

  fireEvent.click(screen.getAllByRole("button", { name: "New page" })[0]);
  fireEvent.keyDown(screen.getByRole("textbox", { name: "New page title" }), { key: "Enter", code: "Enter" });

  await waitFor(() => {
    expect(createPageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "untitled-page",
        workspaceSlug: "workspace-001"
      })
    );
  });

  fireEvent.click(screen.getByLabelText("Add child page to Overview"));

  const childInlineInput = screen.getByRole("textbox", { name: "New page title" });
  expect(screen.getByRole("button", { name: "Child Page" })).toBeInTheDocument();
  fireEvent.change(childInlineInput, { target: { value: "New Child" } });
  fireEvent.keyDown(childInlineInput, { key: "Enter", code: "Enter" });

  await waitFor(() => {
    expect(createPageMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        parentPageSysId: "page-parent",
        title: "New Child",
        workspaceSlug: "workspace-001"
      })
    );
  });
});

test("inline page creation removes the temporary row and shows a safe error when creation fails", async () => {
  render(
    <App
      runtime={createRuntime({}, "/?workspace=workspace-001&page_id=page-parent")}
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
              sysId: "page-parent",
              workspaceSysId: "workspace-001",
              parentPageSysId: null,
              siblingOrder: 1,
              draftTitle: "Overview",
              draftSlug: "overview",
              draftSlugNormalized: "overview",
              draftContentJson: { type: "doc", content: [] },
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
        }),
        createPage: async () => ({
          state: "failed",
          errorMessage: "Unable to create page right now."
        })
      })}
    />
  );

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Overview", level: 1 })).toBeInTheDocument();
  });

  fireEvent.click(screen.getAllByRole("button", { name: "New page" })[0]);
  const inlineInput = screen.getByRole("textbox", { name: "New page title" });
  fireEvent.blur(inlineInput);

  await waitFor(() => {
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to create page right now.");
  });

  expect(screen.queryByRole("textbox", { name: "New page title" })).not.toBeInTheDocument();
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
  expect(container.querySelectorAll(".docsera-header")).toHaveLength(1);
});

test("workspace load failures still render inside the shared header shell", async () => {
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

  expect(container.querySelectorAll(".docsera-header")).toHaveLength(1);
  expect(screen.getByText("Unable to load workspace.")).toBeInTheDocument();
});

test("switching from the recent workspace menu keeps the destination workspace identity during load", async () => {
  let resolveWorkspace: ((value: { workspace: WorkspaceViewRecord | null }) => void) | null = null;

  render(
    <App
      runtime={createRuntime({}, "/?workspace=workspace-001")}
      serviceNowClient={createClient({
        listWorkspaces: async () => ({
          items: [
            createWorkspace({ name: "Admin Docs", slug: "workspace-001" }),
            createWorkspace({ name: "Editor Docs", slug: "workspace-002", sysId: "workspace-002", canManageSettings: false })
          ],
          page: 1,
          pageSize: 10,
          totalCount: 2,
          hasNextPage: false,
          searchText: ""
        }),
        getWorkspace: (workspaceSlug) =>
          new Promise((resolve) => {
            if (workspaceSlug === "workspace-002") {
              resolveWorkspace = resolve;
              return;
            }

            resolve({
              workspace: createWorkspace({
                name: "Admin Docs",
                slug: workspaceSlug
              })
            });
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
    expect(screen.getByRole("button", { name: "Workspace switcher: Admin Docs" })).toBeInTheDocument();
  });

  fireEvent.click(screen.getByRole("button", { name: "Workspace switcher: Admin Docs" }));
  fireEvent.click(screen.getByRole("menuitem", { name: "Editor Docs" }));

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Workspace switcher: Editor Docs" })).toBeInTheDocument();
  });

  expect(screen.queryByRole("button", { name: "Workspace switcher: Workspace" })).not.toBeInTheDocument();

  resolveWorkspace?.({
    workspace: createWorkspace({
      name: "Editor Docs",
      slug: "workspace-002",
      sysId: "workspace-002",
      canManageSettings: false
    })
  });

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Workspace switcher: Editor Docs" })).toBeInTheDocument();
  });
});

test("direct workspace navigation shows a loading identity instead of a generic workspace name", async () => {
  let resolveWorkspace: ((value: { workspace: WorkspaceViewRecord | null }) => void) | null = null;

  render(
    <App
      runtime={createRuntime({}, "/?workspace=workspace-unknown")}
      serviceNowClient={createClient({
        getWorkspace: () =>
          new Promise((resolve) => {
            resolveWorkspace = resolve;
          })
      })}
    />
  );

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Loading workspace" })).toBeInTheDocument();
  });

  expect(screen.queryByRole("button", { name: "Workspace" })).not.toBeInTheDocument();
  expect(document.querySelector(".docsera-header__workspace-name-skeleton")).not.toBeNull();

  resolveWorkspace?.({
    workspace: createWorkspace({
      name: "Loaded Docs",
      slug: "workspace-unknown"
    })
  });

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Loaded Docs" })).toBeInTheDocument();
  });
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
  fireEvent.click(screen.getByRole("button", { name: "Create Workspace" }));

  await waitFor(() => {
    expect(createMock).toHaveBeenCalledTimes(1);
    expect(statusMock).toHaveBeenCalledTimes(1);
  });

  await waitFor(() => {
    expect(screen.getByRole("button", { name: "Workspace switcher: Team Docs" })).toBeInTheDocument();
  });
});

test("viewer workspace header hides admin controls and editor entry points", async () => {
  render(
    <App
      runtime={createRuntime({}, "/?workspace=viewer-docs&page_id=page-001")}
      serviceNowClient={createClient({
        listWorkspaces: async () => ({
          items: [],
          page: 1,
          pageSize: 10,
          totalCount: 0,
          hasNextPage: false,
          searchText: ""
        }),
        getWorkspace: async () => ({
          workspace: createWorkspace({
            name: "Viewer Docs",
            slug: "viewer-docs",
            roleLabel: null,
            canManageSettings: false
          })
        }),
        listPages: async () => ({
          items: [
            {
              sysId: "page-001",
              workspaceSysId: "workspace-001",
              parentPageSysId: null,
              siblingOrder: 1,
              draftTitle: "Read Me",
              draftSlug: "read-me",
              draftSlugNormalized: "read-me",
              draftContentJson: {
                type: "doc",
                content: []
              },
              draftBodyText: "Viewer body",
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
          workspaceSlug: "viewer-docs",
          workspaceSysId: "workspace-001"
        })
      })}
    />
  );

  await waitFor(() => {
    expect(screen.getByRole("heading", { name: "Read Me", level: 1 })).toBeInTheDocument();
  });

  expect(screen.getByRole("button", { name: "Collapse navigation" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Workspace settings" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "New page" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Workspace switcher: Viewer Docs" })).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Open settings for Read Me")).not.toBeInTheDocument();
});
