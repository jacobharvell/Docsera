import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { createEmptyDocseraDocumentEnvelope } from "../../shared/editor/document";
import type {
  DocseraRuntimeContext,
  PageBodySaveResult,
  PageListResult,
  ServiceNowClient,
  WorkspaceMode,
  WorkspacePageRecord,
  WorkspaceViewRecord
} from "../shared/types/docsera";

let deferHostReady = false;
let hostReadyResolvers: Array<() => void> = [];

function resolveDeferredHostReady() {
  const resolvers = [...hostReadyResolvers];
  hostReadyResolvers = [];
  deferHostReady = false;
  resolvers.forEach((resolve) => resolve());
}

afterEach(() => {
  deferHostReady = false;
  hostReadyResolvers = [];
});

vi.mock("../editor/PageEditorHost", () => ({
  PageEditorHost: function MockPageEditorHost({
    canEdit,
    onError,
    onReadyStateChange,
    pageSysId,
    sessionKey,
    onStatusChange
  }: {
    canEdit: boolean;
    onError?: (failure: null) => void;
    onReadyStateChange?: (ready: boolean) => void;
    pageSysId?: string;
    sessionKey?: string;
    onStatusChange?: (state: { isDirty: boolean; isSaving: boolean }) => void;
  }) {
    useEffect(() => {
      onError?.(null);
      onStatusChange?.({ isDirty: false, isSaving: false });
      if (!onReadyStateChange) {
        return;
      }

      if (!deferHostReady) {
        onReadyStateChange(true);
        return;
      }

      const resolveReady = () => {
        onReadyStateChange(true);
      };
      hostReadyResolvers.push(resolveReady);
      return () => {
        hostReadyResolvers = hostReadyResolvers.filter((resolver) => resolver !== resolveReady);
      };
    }, [onError, onReadyStateChange, onStatusChange, pageSysId, sessionKey]);

    return canEdit ? <div data-docsera-page-editor-host="true" /> : null;
  }
}));

function createWorkspace(overrides: Partial<WorkspaceViewRecord> = {}): WorkspaceViewRecord {
  return {
    sysId: "workspace-001",
    slug: "product-docs",
    name: "Product Docs",
    shortDescription: "Product documentation",
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

function createPageRecord(overrides: Partial<WorkspacePageRecord> = {}): WorkspacePageRecord {
  return {
    sysId: "page-001",
    workspaceSysId: "workspace-001",
    parentPageSysId: null,
    siblingOrder: 1,
    draftTitle: "Overview",
    draftSlug: "overview",
    draftSlugNormalized: "overview",
    draftContentJson: createEmptyDocseraDocumentEnvelope(),
    draftRevision: 0,
    draftBodyText: null,
    publishedTitle: "Overview",
    publishedSlug: "overview",
    publishedSlugNormalized: "overview",
    publishedContentJson: createEmptyDocseraDocumentEnvelope(),
    publishedBodyText: null,
    publicationState: "published",
    active: true,
    ...overrides
  };
}

function createPageListResult(mode: WorkspaceMode, items: WorkspacePageRecord[]): PageListResult {
  return {
    items,
    mode,
    workspaceSlug: "product-docs",
    workspaceSysId: "workspace-001",
    totalCount: items.length
  };
}

function createClient(overrides: Partial<ServiceNowClient> = {}): ServiceNowClient {
  const workspace = createWorkspace();
  const publishedOverview = createPageRecord();

  return {
    ping: vi.fn(async () => {
      throw new Error("ping should not be called in these tests");
    }),
    listWorkspaces: vi.fn(async () => ({
      items: [workspace, createWorkspace({ slug: "api-docs", sysId: "workspace-002", name: "API Docs" })],
      page: 1,
      pageSize: 10,
      totalCount: 2,
      hasNextPage: false,
      searchText: ""
    })),
    getWorkspace: vi.fn(async () => ({
      workspace
    })),
    listPages: vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", [publishedOverview])
    ),
    createWorkspace: vi.fn(async () => {
      throw new Error("createWorkspace should not be called in these tests");
    }),
    getWorkspaceProvisioningStatus: vi.fn(async () => {
      throw new Error("getWorkspaceProvisioningStatus should not be called in these tests");
    }),
    createPage: vi.fn(async () => {
      throw new Error("createPage should not be called in these tests");
    }),
    getPageEditLockStatus: vi.fn(async () => ({
      state: "unlocked" as const
    })),
    acquirePageEditLock: vi.fn(async () => ({
      code: "failed" as const,
      errorMessage: "acquirePageEditLock should not be called in these tests",
      retryable: false,
      state: "failed" as const
    })),
    heartbeatPageEditLock: vi.fn(async () => ({
      code: "failed" as const,
      errorMessage: "heartbeatPageEditLock should not be called in these tests",
      retryable: false,
      state: "failed" as const
    })),
    releasePageEditLock: vi.fn(async () => ({
      state: "released" as const
    })),
    savePageBody: vi.fn(async (): Promise<PageBodySaveResult> => ({
      errorMessage: "savePageBody should not be called in these tests",
      state: "failed"
    })),
    publishPage: vi.fn(async () => ({
      errorMessage: "publishPage should not be called in these tests",
      state: "failed" as const
    })),
    savePageSettings: vi.fn(async () => {
      throw new Error("savePageSettings should not be called in these tests");
    }),
    deletePage: vi.fn(async () => {
      throw new Error("deletePage should not be called in these tests");
    }),
    ...overrides
  };
}

function createDeferred<T>() {
  let resolve: ((value: T) => void) | null = null;
  let reject: ((reason?: unknown) => void) | null = null;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return {
    promise,
    resolve: (value: T) => {
      if (!resolve) {
        throw new Error("Deferred value was not initialized.");
      }

      resolve(value);
    },
    reject: (reason?: unknown) => {
      if (!reject) {
        throw new Error("Deferred rejection was not initialized.");
      }

      reject(reason);
      reject = null;
    }
  };
}

function createBreadcrumbPages() {
  return [
    createPageRecord({
      sysId: "page-root",
      draftTitle: "Overview",
      draftSlug: "overview",
      draftSlugNormalized: "overview",
      publishedTitle: "Overview",
      publishedSlug: "overview",
      publishedSlugNormalized: "overview"
    }),
    createPageRecord({
      parentPageSysId: "page-root",
      siblingOrder: 2,
      sysId: "page-child",
      draftTitle: "Child Draft",
      draftSlug: "child",
      draftSlugNormalized: "child",
      publishedTitle: "Child",
      publishedSlug: "child",
      publishedSlugNormalized: "child"
    })
  ];
}

function renderApp(search: string, clientOverrides: Partial<ServiceNowClient> = {}) {
  window.history.replaceState({}, "", search);

  const runtime: DocseraRuntimeContext = {
    mountNode: document.createElement("div"),
    mountNodeId: "docsera-runtime",
    config: {}
  };

  const serviceNowClient = createClient(clientOverrides);
  const view = render(<App runtime={runtime} serviceNowClient={serviceNowClient} />);

  return {
    ...view,
    serviceNowClient
  };
}

function expectWorkspaceSearch(expected: Record<string, string>) {
  const params = new URLSearchParams(window.location.search);
  for (const [key, value] of Object.entries(expected)) {
    expect(params.get(key)).toBe(value);
  }
}

describe("App live and edit routing", () => {
  it("defaults to live mode, requests published pages, and does not mount the editor", async () => {
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", [createPageRecord()])
    );

    renderApp("/?workspace=product-docs&page=overview", { listPages });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(listPages).toHaveBeenCalledWith({
      mode: "live",
      workspaceSlug: "product-docs"
    });
    expect(screen.queryByRole("button", { name: "New page" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).toBeNull();
    expect(window.location.search).toBe("?workspace=product-docs&page=overview");
  });

  it("keeps the workspace shell mounted during initial workspace loading and delays contained loading lines", async () => {
    const deferredWorkspace = createDeferred<{ workspace: WorkspaceViewRecord }>();
    const getWorkspace = vi.fn(() => deferredWorkspace.promise);

    renderApp("/?workspace=product-docs", { getWorkspace });

    expect(await screen.findByLabelText("Workspace navigation")).toBeInTheDocument();
    expect(document.querySelector(".docsera-app__body")).toHaveAttribute("aria-busy", "true");
    expect(document.querySelector(".docsera-shell__progress")).toBeNull();
    expect(document.querySelector(".docsera-shell__progress-pill")).toBeNull();

    await waitFor(() => {
      expect(document.querySelector(".docsera-sidebar__pending")).not.toBeNull();
      expect(document.querySelector(".docsera-main__pending")).not.toBeNull();
      expect(document.querySelector(".docsera-toc__loading")).not.toBeNull();
    });

    await act(async () => {
      deferredWorkspace.resolve({ workspace: createWorkspace() });
      await Promise.resolve();
    });
  });

  it("keeps the shared header mounted across launcher and workspace navigation", async () => {
    renderApp("/");

    const header = document.querySelector(".docsera-header");
    expect(header).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "My Workspaces" })).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("link", { name: /Product Docs/i }));

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(document.querySelector(".docsera-header")).toBe(header);

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "My Workspaces" }));

    expect(await screen.findByRole("heading", { name: "My Workspaces" })).toBeInTheDocument();
    expect(document.querySelector(".docsera-header")).toBe(header);
  });

  it("keeps the workspace shell nodes mounted across page and mode changes", async () => {
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", createBreadcrumbPages())
    );

    renderApp("/?workspace=product-docs&mode=edit&page=child", { listPages });

    await waitFor(() => {
      expect(listPages).toHaveBeenCalled();
    });
    const sidebarNav = await screen.findByLabelText("Workspace navigation");
    const shellNode = document.querySelector(".docsera-workspace");
    const sidebarSearchRow = document.querySelector(".docsera-sidebar__search-row");
    const mainPane = document.querySelector(".docsera-main");
    const tocRail = document.querySelector(".docsera-toc-rail");

    const breadcrumbs = await screen.findByRole("navigation", { name: "Page breadcrumbs" });
    expect(within(breadcrumbs).getByRole("button", { name: "Overview" })).toBeInTheDocument();
    expect(breadcrumbs).toHaveTextContent("Overview");

    fireEvent.click(within(breadcrumbs).getByRole("button", { name: "Overview" }));
    expect(await screen.findByRole("button", { name: "Overview" })).toBeInTheDocument();
    expect(document.querySelector(".docsera-workspace")).toBe(shellNode);
    expect(document.querySelector(".docsera-sidebar__search-row")).toBe(sidebarSearchRow);
    expect(document.querySelector(".docsera-main")).toBe(mainPane);
    expect(document.querySelector(".docsera-toc-rail")).toBe(tocRail);

    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    expect(await screen.findByRole("button", { name: "Overview" })).toBeInTheDocument();
    expect(document.querySelector(".docsera-workspace")).toBe(shellNode);
    expect(document.querySelector(".docsera-sidebar__search-row")).toBe(sidebarSearchRow);
    expect(document.querySelector(".docsera-main")).toBe(mainPane);
    expect(document.querySelector(".docsera-toc-rail")).toBe(tocRail);
    expect(document.querySelector(".docsera-sidebar")).toBe(sidebarNav);
  });

  it("retains the committed shell while same-workspace edit pages are loading and limits pending UI to the body", async () => {
    const deferredEditPages = createDeferred<PageListResult>();
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) => {
      if (mode === "edit") {
        return deferredEditPages.promise;
      }

      return createPageListResult("live", [
        createPageRecord({
          draftTitle: "Overview",
          publishedTitle: "Overview"
        })
      ]);
    });

    renderApp("/?workspace=product-docs&page=overview", { listPages });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    const shellNode = document.querySelector(".docsera-workspace");
    const mainPane = document.querySelector(".docsera-main");
    const sidebarNav = screen.getByLabelText("Workspace navigation");

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading editor" })).toBeInTheDocument();
    expect(screen.getByLabelText("Workspace navigation")).toBe(sidebarNav);
    expect(document.querySelector(".docsera-workspace")).toBe(shellNode);
    expect(document.querySelector(".docsera-main")).toBe(mainPane);
    expect(document.querySelector(".docsera-sidebar__pending")).toBeNull();
    expect(document.querySelector(".docsera-toc__loading")).toBeNull();

    await act(async () => {
      deferredEditPages.resolve(
        createPageListResult("edit", [
          createPageRecord({
            draftTitle: "Overview Draft",
            publicationState: "published_with_unpublished_changes"
          })
        ])
      );
      await Promise.resolve();
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
  });

  it("keeps shell geometry mounted while switching workspaces and shows only contained loading lines when delayed", async () => {
    const deferredWorkspace = createDeferred<{ workspace: WorkspaceViewRecord }>();
    const getWorkspace = vi.fn(async (workspaceSlug: string) =>
      workspaceSlug === "api-docs"
        ? deferredWorkspace.promise
        : {
            workspace: createWorkspace({
              slug: workspaceSlug,
              sysId: workspaceSlug === "api-docs" ? "workspace-002" : "workspace-001",
              name: workspaceSlug === "api-docs" ? "API Docs" : "Product Docs"
            })
          }
    );
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }) => ({
      items: [
        createPageRecord({
          sysId: workspaceSlug === "api-docs" ? "page-api" : "page-001",
          workspaceSysId: workspaceSlug === "api-docs" ? "workspace-002" : "workspace-001",
          draftTitle: workspaceSlug === "api-docs" ? "API Overview" : "Overview",
          draftSlug: workspaceSlug === "api-docs" ? "api-overview" : "overview",
          draftSlugNormalized: workspaceSlug === "api-docs" ? "api-overview" : "overview",
          publishedTitle: workspaceSlug === "api-docs" ? "API Overview" : "Overview",
          publishedSlug: workspaceSlug === "api-docs" ? "api-overview" : "overview",
          publishedSlugNormalized: workspaceSlug === "api-docs" ? "api-overview" : "overview"
        })
      ],
      mode: (mode === "edit" ? "edit" : "live") as WorkspaceMode,
      workspaceSlug,
      workspaceSysId: workspaceSlug === "api-docs" ? "workspace-002" : "workspace-001",
      totalCount: 1
    }));

    renderApp("/?workspace=product-docs", { getWorkspace, listPages });

    expect(await screen.findByRole("button", { name: "Overview" })).toBeInTheDocument();
    const shellNode = document.querySelector(".docsera-workspace");
    const sidebarSearchRow = document.querySelector(".docsera-sidebar__search-row");

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "API Docs" }));

    expect(document.querySelector(".docsera-shell__progress")).toBeNull();
    expect(document.querySelector(".docsera-shell__progress-pill")).toBeNull();

    await waitFor(() => {
      expect(document.querySelector(".docsera-sidebar__pending")).not.toBeNull();
      expect(document.querySelector(".docsera-main__pending")).not.toBeNull();
      expect(document.querySelector(".docsera-toc__loading")).not.toBeNull();
    });

    expect(document.querySelector(".docsera-workspace")).toBe(shellNode);
    expect(document.querySelector(".docsera-sidebar__search-row")).toBe(sidebarSearchRow);

    await act(async () => {
      deferredWorkspace.resolve({ workspace: createWorkspace({ slug: "api-docs", sysId: "workspace-002", name: "API Docs" }) });
      await Promise.resolve();
    });

    expect(await screen.findByRole("heading", { name: "API Overview" })).toBeInTheDocument();
  });

  it("requests workspace detail and edit pages once during direct edit bootstrap", async () => {
    const getWorkspace = vi.fn(async () => ({
      workspace: createWorkspace()
    }));
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(
        mode === "edit" ? "edit" : "live",
        [createPageRecord({ draftTitle: "Overview Draft", publicationState: "published_with_unpublished_changes" })]
      )
    );

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { getWorkspace, listPages });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    expect(getWorkspace).toHaveBeenCalledTimes(1);
    expect(listPages).toHaveBeenCalledTimes(1);
    expect(listPages).toHaveBeenCalledWith({
      mode: "edit",
      workspaceSlug: "product-docs"
    });
  });

  it("requests workspace detail and live pages once during direct live bootstrap", async () => {
    const getWorkspace = vi.fn(async () => ({
      workspace: createWorkspace()
    }));
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", [createPageRecord()])
    );

    renderApp("/?workspace=product-docs", { getWorkspace, listPages });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(getWorkspace).toHaveBeenCalledTimes(1);
    expect(listPages).toHaveBeenCalledTimes(1);
    expect(listPages).toHaveBeenCalledWith({
      mode: "live",
      workspaceSlug: "product-docs"
    });
  });

  it("retains and disables the committed header controls while a workspace switch is unresolved", async () => {
    const apiWorkspaceDeferred = createDeferred<{ workspace: WorkspaceViewRecord }>();
    const secureWorkspaceDeferred = createDeferred<{ workspace: WorkspaceViewRecord }>();
    const getWorkspace = vi.fn(async (workspaceSlug: string) => {
      if (workspaceSlug === "api-docs") {
        return apiWorkspaceDeferred.promise;
      }

      if (workspaceSlug === "secure-docs") {
        return secureWorkspaceDeferred.promise;
      }

      return {
        workspace: createWorkspace()
      };
    });
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }) => {
      if (workspaceSlug === "api-docs") {
        return {
          ...createPageListResult(mode === "edit" ? "edit" : "live", [
            createPageRecord({
              sysId: "page-api",
              workspaceSysId: "workspace-002",
              draftTitle: "API Overview",
              draftSlug: "api-overview",
              draftSlugNormalized: "api-overview",
              publishedTitle: "API Overview",
              publishedSlug: "api-overview",
              publishedSlugNormalized: "api-overview"
            })
          ]),
          workspaceSlug
        };
      }

      if (workspaceSlug === "secure-docs") {
        return {
          ...createPageListResult(mode === "edit" ? "edit" : "live", [
            createPageRecord({
              sysId: "page-secure",
              workspaceSysId: "workspace-003",
              draftTitle: "Secure Overview",
              draftSlug: "secure-overview",
              draftSlugNormalized: "secure-overview",
              publishedTitle: "Secure Overview",
              publishedSlug: "secure-overview",
              publishedSlugNormalized: "secure-overview"
            })
          ]),
          workspaceSlug
        };
      }

      return createPageListResult(mode === "edit" ? "edit" : "live", [createPageRecord()]);
    });
    const listWorkspaces = vi.fn(async () => ({
      items: [
        createWorkspace(),
        createWorkspace({ slug: "api-docs", sysId: "workspace-002", name: "API Docs" }),
        createWorkspace({ slug: "secure-docs", sysId: "workspace-003", name: "Secure Docs" })
      ],
      page: 1,
      pageSize: 10,
      totalCount: 3,
      hasNextPage: false,
      searchText: ""
    }));

    renderApp("/?workspace=product-docs", { getWorkspace, listPages, listWorkspaces });

    expect(await screen.findByRole("button", { name: "Overview" })).toBeInTheDocument();
    const liveToggle = screen.getByRole("button", { name: "Live" });
    const settingsGear = screen.getByRole("button", { name: "Workspace settings" });
    const modeGroup = screen.getByRole("group", { name: "Workspace mode" });
    const listPagesCallCount = listPages.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "API Docs" }));

    expect(screen.getByRole("button", { name: "Live" })).toBe(liveToggle);
    expect(screen.getByRole("button", { name: "Workspace settings" })).toBe(settingsGear);
    expect(screen.getByRole("group", { name: "Workspace mode" })).toBe(modeGroup);
    expect(screen.getByRole("button", { name: "Live" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Workspace settings" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    expect(listPages.mock.calls.length).toBe(listPagesCallCount);

    await act(async () => {
      apiWorkspaceDeferred.resolve({
        workspace: createWorkspace({
          slug: "api-docs",
          sysId: "workspace-002",
          name: "API Docs"
        })
      });
      await Promise.resolve();
    });

    expect(await screen.findByRole("heading", { name: "API Overview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Live" })).toBe(liveToggle);
    expect(screen.getByRole("button", { name: "Workspace settings" })).toBe(settingsGear);
    expect(screen.getByRole("button", { name: "Live" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Workspace settings" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: API Docs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Secure Docs" }));

    expect(screen.getByRole("button", { name: "Live" })).toBe(liveToggle);
    expect(screen.getByRole("button", { name: "Workspace settings" })).toBe(settingsGear);
    expect(screen.getByRole("button", { name: "Live" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Workspace settings" })).toBeDisabled();

    await act(async () => {
      secureWorkspaceDeferred.resolve({
        workspace: createWorkspace({
          canManageSettings: false,
          name: "Secure Docs",
          roleLabel: null,
          slug: "secure-docs",
          sysId: "workspace-003"
        })
      });
      await Promise.resolve();
    });

    expect(await screen.findByRole("heading", { name: "Secure Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Live" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Workspace settings" })).not.toBeInTheDocument();
  });

  it("does not retain header controls during initial loading", async () => {
    const deferredWorkspace = createDeferred<{ workspace: WorkspaceViewRecord }>();
    const getWorkspace = vi.fn(() => deferredWorkspace.promise);

    renderApp("/?workspace=product-docs", { getWorkspace });

    expect(await screen.findByLabelText("Workspace navigation")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Live" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Workspace settings" })).not.toBeInTheDocument();
  });

  it("does not retain header controls after a workspace-load error", async () => {
    const getWorkspace = vi.fn(async () => {
      throw new Error("Unable to load workspace.");
    });

    renderApp("/?workspace=product-docs", { getWorkspace });

    expect(await screen.findByRole("heading", { name: "Workspace unavailable" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Live" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Workspace settings" })).not.toBeInTheDocument();
  });

  it("renders workspace breadcrumbs in the shared header and navigates to the parent page", async () => {
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", createBreadcrumbPages())
    );

    renderApp("/?workspace=product-docs&page=child", { listPages });

    await waitFor(() => {
      expect(listPages).toHaveBeenCalled();
    });
    const breadcrumbs = await screen.findByRole("navigation", { name: "Page breadcrumbs" });
    expect(within(breadcrumbs).getByRole("button", { name: "Overview" })).toBeInTheDocument();
    expect(breadcrumbs).toHaveTextContent("Overview");
    expect(breadcrumbs).toHaveTextContent("Child");

    fireEvent.click(within(breadcrumbs).getByRole("button", { name: "Overview" }));

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Page breadcrumbs" })).toBeInTheDocument();
  });

  it("returns to My Workspaces from workspace load errors without remounting the header", async () => {
    const getWorkspace = vi.fn(async () => ({
      workspace: createWorkspace()
    }));
    const listPages = vi.fn(async () => {
      throw new Error("Unable to load pages.");
    });

    renderApp("/?workspace=product-docs", { getWorkspace, listPages });

    const header = document.querySelector(".docsera-header");
    expect(header).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Pages unavailable" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Return to My Workspaces" });

    fireEvent.click(screen.getByRole("button", { name: "Return to My Workspaces" }));

    expect(await screen.findByRole("heading", { name: "My Workspaces" })).toBeInTheDocument();
    expect(document.querySelector(".docsera-header")).toBe(header);
  });

  it("keeps the create-page control visible but disabled when page loading fails fatally in edit mode", async () => {
    const createPage = vi.fn(async () => {
      throw new Error("createPage should not be called while page loading has failed");
    });
    const listPages = vi.fn(async () => {
      throw new Error("HTTP 500");
    });

    renderApp("/?workspace=product-docs&mode=edit", { createPage, listPages });

    expect(await screen.findByRole("heading", { name: "Pages unavailable" })).toBeInTheDocument();
    const newPageButtons = screen.getAllByRole("button", { name: "New page" });
    expect(newPageButtons.length).toBeGreaterThan(0);
    expect(newPageButtons[0]).toBeDisabled();
    expect(
      screen.getByText("New page is unavailable because the workspace page list failed to load.")
    ).toBeInTheDocument();
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).toBeNull();
    expect(createPage).not.toHaveBeenCalled();
  });

  it("opens the inline create-page flow from a successfully loaded empty workspace in edit mode", async () => {
    const createPage = vi.fn(async () => {
      throw new Error("createPage should not be called before the inline title is committed");
    });
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", [])
    );

    renderApp("/?workspace=product-docs&mode=edit", { createPage, listPages });

    expect(await screen.findByRole("heading", { name: "No pages yet" })).toBeInTheDocument();
    const newPageButtons = screen.getAllByRole("button", { name: "New page" });
    expect(newPageButtons.length).toBeGreaterThan(0);

    fireEvent.click(newPageButtons[0]);

    expect(await screen.findByRole("textbox", { name: "New page title" })).toBeInTheDocument();
    expect(createPage).not.toHaveBeenCalled();
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).toBeNull();
  });

  it("applies the launcher route background class without changing the workspace route class contract", async () => {
    const launcherView = renderApp("/");

    const launcherApp = document.querySelector(".docsera-app");
    expect(launcherApp).toHaveClass("docsera-app--launcher");
    expect(document.querySelector(".docsera-launcher-screen")).toBeInTheDocument();
    expect(document.querySelector(".docsera-workspace")).not.toBeInTheDocument();

    launcherView.unmount();
    renderApp("/?workspace=product-docs");

    expect(document.querySelector(".docsera-app")).not.toHaveClass("docsera-app--launcher");
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(document.querySelector(".docsera-workspace")).toBeInTheDocument();
  });

  it("enters edit mode through the header toggle and lazy-mounts the editor host", async () => {
    const publishedPage = createPageRecord();
    const draftPage = createPageRecord({
      draftTitle: "Overview Draft",
      publicationState: "published_with_unpublished_changes"
    });
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", [mode === "edit" ? draftPage : publishedPage])
    );

    renderApp("/?workspace=product-docs&page=overview", { listPages });

    await screen.findByRole("heading", { name: "Overview" });
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await waitFor(() => {
      expectWorkspaceSearch({
        workspace: "product-docs",
        mode: "edit",
        page: "overview"
      });
    });
    expect(screen.getAllByRole("button", { name: "New page" }).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(document.querySelector("[data-docsera-page-editor-host='true']")).not.toBeNull();
    });
    expect(listPages).toHaveBeenLastCalledWith({
      mode: "edit",
      workspaceSlug: "product-docs"
    });
  });

  it("keeps the shell visible while the edit host bootstraps on a direct edit load", async () => {
    deferHostReady = true;
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", [
        createPageRecord({
          draftTitle: "Overview Draft",
          publicationState: "published_with_unpublished_changes"
        })
      ])
    );

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { listPages });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "Loading editor" })).toBeInTheDocument();
    expect(screen.getByLabelText("Workspace navigation")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Page breadcrumbs" })).toBeInTheDocument();
    expect(document.querySelector(".docsera-sidebar__pending")).toBeNull();
    expect(document.querySelector(".docsera-toc__loading")).toBeNull();

    await act(async () => {
      resolveDeferredHostReady();
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(screen.queryByRole("status", { name: "Loading editor" })).toBeNull();
    });
  });

  it("blocks unauthorized edit entry and canonicalizes back to live without a draft slug", async () => {
    const getWorkspace = vi.fn(async () => ({
      workspace: createWorkspace({
        canManageSettings: false,
        roleLabel: null
      })
    }));
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", [
        createPageRecord({
          draftSlug: "published-overview",
          draftSlugNormalized: "published-overview",
          publishedSlug: "published-overview",
          publishedSlugNormalized: "published-overview",
          draftTitle: "Published Overview",
          publishedTitle: "Published Overview"
        })
      ])
    );

    renderApp("/?workspace=product-docs&mode=edit&page=draft-only", {
      getWorkspace,
      listPages
    });

    expect(await screen.findByRole("heading", { name: "Published Overview" })).toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.search).toBe("?workspace=product-docs&page=published-overview");
    });
    expect(screen.queryByRole("button", { name: "New page" })).not.toBeInTheDocument();
    expect(listPages).toHaveBeenCalledWith({
      mode: "live",
      workspaceSlug: "product-docs"
    });
  });

  it("preserves edit mode during same-workspace navigation and clears search when mode changes", async () => {
    const editPages = [
      createPageRecord({
        sysId: "page-001",
        draftTitle: "Overview Draft",
        publicationState: "published_with_unpublished_changes"
      }),
      createPageRecord({
        sysId: "page-002",
        draftTitle: "Details Draft",
        draftSlug: "details",
        draftSlugNormalized: "details",
        publishedTitle: "Details",
        publishedSlug: "details",
        publishedSlugNormalized: "details",
        siblingOrder: 2,
        publicationState: "published_with_unpublished_changes"
      })
    ];
    const livePages = [
      createPageRecord({
        draftTitle: "Overview",
        publishedTitle: "Overview"
      }),
      createPageRecord({
        sysId: "page-002",
        draftTitle: "Details",
        draftSlug: "details",
        draftSlugNormalized: "details",
        publishedTitle: "Details",
        publishedSlug: "details",
        publishedSlugNormalized: "details",
        siblingOrder: 2
      })
    ];
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", mode === "edit" ? editPages : livePages)
    );

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { listPages });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "draft" } });
    fireEvent.click(screen.getByRole("button", { name: "Details Draft Unpublished" }));

    await waitFor(() => {
      expectWorkspaceSearch({
        workspace: "product-docs",
        mode: "edit",
        page: "details"
      });
    });
    expect(screen.getByRole("searchbox")).toHaveValue("draft");

    fireEvent.click(screen.getByRole("button", { name: "Live" }));

    expect(await screen.findByRole("heading", { name: "Details" })).toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.search).toBe("?workspace=product-docs&page=details");
    });
    expect(screen.getByRole("searchbox")).toHaveValue("");
  });

  it("restores the edit selection after switching back from live", async () => {
    const draftOnlyPage = createPageRecord({
      sysId: "page-003",
      draftTitle: "Draft Only",
      draftSlug: "draft-only",
      draftSlugNormalized: "draft-only",
      publishedTitle: null,
      publishedSlug: null,
      publishedSlugNormalized: null,
      publicationState: "draft"
    });
    const publishedPage = createPageRecord({
      sysId: "page-001",
      draftTitle: "Published Overview",
      publishedTitle: "Published Overview",
      draftSlug: "published-overview",
      draftSlugNormalized: "published-overview",
      publishedSlug: "published-overview",
      publishedSlugNormalized: "published-overview"
    });
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", mode === "edit" ? [publishedPage, draftOnlyPage] : [publishedPage])
    );

    renderApp("/?workspace=product-docs&mode=edit&page=published-overview", { listPages });

    expect(await screen.findByRole("heading", { name: "Published Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Draft Only Draft" }));

    expect(await screen.findByRole("heading", { name: "Draft Only" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Live" }));

    expect(await screen.findByRole("heading", { name: "Published Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(await screen.findByRole("heading", { name: "Draft Only" })).toBeInTheDocument();
    await waitFor(() => {
      expectWorkspaceSearch({
        workspace: "product-docs",
        mode: "edit",
        page: "draft-only"
      });
    });
  });

  it("shows recovery UI for invalid canonical JSON without mounting the editor", async () => {
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", [
        createPageRecord({
          draftContentJson: "{bad-json",
          publicationState: "published_with_unpublished_changes"
        })
      ])
    );

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { listPages });

    expect(await screen.findByRole("heading", { name: "The draft editor is unavailable" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Return to Live" })).toBeInTheDocument();
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).toBeNull();
  });
});
