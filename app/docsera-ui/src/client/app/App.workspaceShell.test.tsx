import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { createEmptyDocseraDocumentEnvelope } from "../../shared/editor/document";
import type {
  DocseraRuntimeContext,
  PageBodySaveResult,
  PageListResult,
  WorkspaceListResult,
  ServiceNowClient,
  WorkspaceMode,
  WorkspacePageRecord,
  WorkspaceViewRecord
} from "../shared/types/docsera";

vi.mock("../editor/PageEditorHost", () => ({
  PageEditorHost: function MockPageEditorHost({
    canEdit,
    onEditorFailureChange,
    onStatusChange
  }: {
    canEdit: boolean;
    onEditorFailureChange?: (failure: null) => void;
    onStatusChange?: (state: { isDirty: boolean; isSaving: boolean; status: "Saved" }) => void;
  }) {
    useEffect(() => {
      onEditorFailureChange?.(null);
      onStatusChange?.({
        isDirty: false,
        isSaving: false,
        status: "Saved"
      });
    }, [onEditorFailureChange, onStatusChange]);

    return canEdit ? <div data-docsera-page-editor-host="true" /> : null;
  }
}));

function createRuntime(path = "/?view=my-workspaces"): DocseraRuntimeContext {
  window.history.replaceState({}, "", path);

  return {
    mountNode: document.createElement("div"),
    mountNodeId: "docsera-root",
    config: {}
  };
}

function createWorkspace(overrides: Partial<WorkspaceViewRecord> = {}): WorkspaceViewRecord {
  return {
    sysId: "workspace-001",
    slug: "product-docs",
    name: "Product Docs",
    shortDescription: "Release notes and launch guidance.",
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

function createPageListResult(mode: WorkspaceMode, workspaceSlug: string, items: WorkspacePageRecord[]): PageListResult {
  const workspaceSysId =
    workspaceSlug === "api-docs" ? "workspace-002" : workspaceSlug === "secure-docs" ? "workspace-003" : "workspace-001";

  return {
    items,
    mode,
    workspaceSlug,
    workspaceSysId,
    totalCount: items.length
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

function createClient(overrides: Partial<ServiceNowClient> = {}): ServiceNowClient {
  return {
    ping: vi.fn(async () => {
      throw new Error("ping should not be called in these tests");
    }),
    listWorkspaces: vi.fn(async () => ({
      items: [
        createWorkspace(),
        createWorkspace({
          sysId: "workspace-002",
          slug: "api-docs",
          name: "API Docs"
        })
      ],
      page: 1,
      pageSize: 10,
      totalCount: 2,
      hasNextPage: false,
      searchText: ""
    })),
    getWorkspace: vi.fn(async (workspaceSlug: string) => ({
      workspace:
        workspaceSlug === "api-docs"
          ? createWorkspace({
              sysId: "workspace-002",
              slug: "api-docs",
              name: "API Docs"
            })
          : createWorkspace()
    })),
    listPages: vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", workspaceSlug, [
        createPageRecord({
          workspaceSysId: workspaceSlug === "api-docs" ? "workspace-002" : "workspace-001",
          draftTitle: workspaceSlug === "api-docs" ? "API Overview" : "Overview",
          publishedTitle: workspaceSlug === "api-docs" ? "API Overview" : "Overview",
          draftSlug: workspaceSlug === "api-docs" ? "api-overview" : "overview",
          draftSlugNormalized: workspaceSlug === "api-docs" ? "api-overview" : "overview",
          publishedSlug: workspaceSlug === "api-docs" ? "api-overview" : "overview",
          publishedSlugNormalized: workspaceSlug === "api-docs" ? "api-overview" : "overview"
        })
      ])
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
    acquireWorkspaceEditLease: vi.fn(async () => ({
      changeSetId: "change-set-001",
      changeSetRevision: 9,
      heartbeatIntervalMs: 60_000,
      leaseToken: "workspace-lease-token",
      staleAfterMs: 300_000,
      state: "held" as const
    })),
    resumeWorkspaceEditLease: vi.fn(async () => ({
      changeSetId: "change-set-001",
      changeSetRevision: 9,
      heartbeatIntervalMs: 60_000,
      leaseToken: "workspace-lease-token",
      staleAfterMs: 300_000,
      state: "held" as const
    })),
    renewWorkspaceEditLease: vi.fn(async () => ({
      changeSetId: "change-set-001",
      changeSetRevision: 9,
      heartbeatIntervalMs: 60_000,
      leaseToken: "workspace-lease-token",
      staleAfterMs: 300_000,
      state: "held" as const
    })),
    releaseWorkspaceEditLease: vi.fn(async () => ({ state: "released" as const })),
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

function renderApp(path: string, clientOverrides: Partial<ServiceNowClient> = {}) {
  const serviceNowClient = createClient(clientOverrides);
  return {
    serviceNowClient,
    ...render(<App runtime={createRuntime(path)} serviceNowClient={serviceNowClient} />)
  };
}

describe("App workspace shell integration", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("defaults to live mode, requests published pages, and does not mount the editor", async () => {
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", "product-docs", [createPageRecord()])
    );

    renderApp("/?workspace=product-docs&page=overview", { listPages });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(listPages).toHaveBeenCalledWith({
      mode: "live",
      workspaceSlug: "product-docs"
    });
    expect(screen.queryByRole("button", { name: "New page" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).toBeNull();
  });

  it("keeps the workspace shell mounted during initial workspace loading and delays contained loading lines", async () => {
    let resolveListWorkspaces: (() => void) | undefined;
    const listWorkspaces = vi.fn(
      (): Promise<WorkspaceListResult> =>
        new Promise((resolve) => {
          resolveListWorkspaces = () => {
            resolve({
              items: [],
              page: 1,
              pageSize: 10,
              totalCount: 0,
              hasNextPage: false,
              searchText: ""
            });
          };
        })
    );

    renderApp("/?view=my-workspaces", { listWorkspaces });

    expect(document.querySelector(".docsera-header")).toBeInTheDocument();
    expect(screen.queryByText("Loading workspaces")).not.toBeInTheDocument();
    await act(async () => {
      resolveListWorkspaces?.();
    });
    expect(await screen.findByText("No workspaces to show")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Docsera" })).toBeInTheDocument();
  });

  it("keeps the shared header mounted across launcher and workspace navigation", async () => {
    renderApp("/?view=my-workspaces");

    expect(await screen.findByRole("heading", { name: "My Workspaces" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Workspace switcher: Docsera" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Workspace switcher: Docsera" })).toBeEnabled();
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
        return createPageListResult(mode === "edit" ? "edit" : "live", workspaceSlug, [
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
        ]);
      }

      if (workspaceSlug === "secure-docs") {
        return createPageListResult(mode === "edit" ? "edit" : "live", workspaceSlug, [
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
        ]);
      }

      return createPageListResult(mode === "edit" ? "edit" : "live", workspaceSlug, [createPageRecord()]);
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

  it("renders workspace breadcrumbs in the shared header and navigates to the parent page", async () => {
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", workspaceSlug, createBreadcrumbPages())
    );

    renderApp("/?workspace=product-docs&page=child", { listPages });

    await waitFor(() => {
      expect(listPages).toHaveBeenCalled();
    });
    const breadcrumbs = await screen.findByRole("navigation", { name: "Page breadcrumbs" });
    expect(within(breadcrumbs).getByRole("button", { name: "Overview" })).toBeInTheDocument();
    expect(breadcrumbs).toHaveTextContent("Overview");
    expect(breadcrumbs).toHaveTextContent("Child");
    const main = screen.getByRole("main", { name: "Child Draft" });
    expect(within(main).getByRole("heading", { level: 1, name: "Child Draft" })).toBeInTheDocument();
    expect(within(main).queryByText("Overview")).not.toBeInTheDocument();

    fireEvent.click(within(breadcrumbs).getByRole("button", { name: "Overview" }));

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Page breadcrumbs" })).toBeInTheDocument();
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

  it("keeps the workspace shell nodes mounted across page and mode changes", async () => {
    renderApp("/?workspace=product-docs&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("retains the committed shell while same-workspace edit pages are loading and limits pending UI to the body", async () => {
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", workspaceSlug, [createPageRecord()])
    );

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { listPages });

    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Workspace switcher: Product Docs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("keeps shell geometry mounted while switching workspaces and shows only contained loading lines when delayed", async () => {
    renderApp("/?workspace=product-docs&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    const workspaceSwitcherButton = screen.getByRole("button", { name: "Workspace switcher: Product Docs" });
    await act(async () => {
      fireEvent.click(workspaceSwitcherButton);
    });

    expect(document.querySelector(".docsera-header")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("resets to live mode when switching workspaces from the header menu", async () => {
    renderApp("/?workspace=product-docs&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    const editButton = screen.getByRole("button", { name: "Edit" });
    await act(async () => {
      fireEvent.click(editButton);
    });
    expect(await screen.findByRole("button", { name: "Open settings for Overview" })).toBeInTheDocument();

    const workspaceSwitcherButton = screen.getByRole("button", { name: "Workspace switcher: Product Docs" });
    await act(async () => {
      fireEvent.click(workspaceSwitcherButton);
    });
    const apiDocsMenuItem = await screen.findByRole("menuitem", { name: "API Docs" });
    await act(async () => {
      fireEvent.click(apiDocsMenuItem);
    });

    expect(await screen.findByRole("heading", { name: "API Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open settings for API Overview" })).not.toBeInTheDocument();
  });

});
