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
    layout: {
      tocVisible: true
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

async function openPageSettingsFromPageTree(pageTitle: string) {
  const pageTree = screen.getByRole("navigation", { name: "Page tree" });
  fireEvent.click(await within(pageTree).findByRole("button", { name: new RegExp(`^Page actions for ${pageTitle}`, "i") }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Page settings" }));
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
      canCreateWorkspaces: true,
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
    saveWorkspaceSettings: vi.fn(async () => {
      throw new Error("saveWorkspaceSettings should not be called in these tests");
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
  it("renders the header as a sibling outside the body scroll container without inline reserve styles", () => {
    renderApp("/?workspace=product-docs&page=overview");

    const app = document.querySelector<HTMLElement>(".docsera-app");
    const header = document.querySelector<HTMLElement>(".docsera-header");
    const body = document.querySelector<HTMLElement>(".docsera-app__body");

    expect(app).toBeInTheDocument();
    expect(header).toBeInTheDocument();
    expect(body).toBeInTheDocument();
    expect(app?.children[0]).toBe(header);
    expect(app?.children[1]).toBe(body);
    expect(header?.parentElement).toBe(app);
    expect(body?.parentElement).toBe(app);
    expect(app?.style.getPropertyValue("--docsera-document-scrollbar-reserve")).toBe("");
  });

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

  it("opens page deletion from the page-tree context menu without opening Page Settings or changing selection", async () => {
    const pages = [
      createPageRecord({
        sysId: "page-selected",
        draftTitle: "Selected",
        draftSlug: "selected",
        draftSlugNormalized: "selected",
        publishedTitle: "Selected",
        publishedSlug: "selected",
        publishedSlugNormalized: "selected"
      }),
      createPageRecord({
        sysId: "page-target",
        draftTitle: "Target",
        draftSlug: "target",
        draftSlugNormalized: "target",
        publishedTitle: "Target",
        publishedSlug: "target",
        publishedSlugNormalized: "target",
        siblingOrder: 2
      })
    ];
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", workspaceSlug, pages)
    );
    const deletePage = vi.fn(async () => ({
      state: "succeeded" as const,
      nextPageSysId: "page-selected"
    }));

    renderApp("/?workspace=product-docs&mode=edit&page=selected", { deletePage, listPages });

    expect(await screen.findByRole("heading", { name: "Selected" })).toBeInTheDocument();
    fireEvent.contextMenu(screen.getByRole("button", { name: "Target" }).closest(".docsera-page-tree__row")!, { clientX: 20, clientY: 30 });
    expect(await screen.findByRole("menu", { name: "Page actions for Target" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(screen.queryByRole("complementary", { name: "Page Settings" })).not.toBeInTheDocument();
    const deleteDialog = await screen.findByRole("dialog", { name: "Confirm deletion" });
    expect(within(deleteDialog).getByText("This will permanently delete Target.")).toBeInTheDocument();

    fireEvent.click(within(deleteDialog).getByRole("button", { name: "Delete page" }));

    await waitFor(() => expect(deletePage).toHaveBeenCalledTimes(1));
    expect(deletePage).toHaveBeenCalledWith(expect.objectContaining({ pageSysId: "page-target" }));
    expect(screen.getByRole("heading", { name: "Selected" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Page Settings" })).not.toBeInTheDocument();
  });

  it("opens page deletion from the real Page Settings delete button without discarding settings state", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await openPageSettingsFromPageTree("Overview");
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });

    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview" }));
    const titleInput = within(pageSettingsPanel).getByDisplayValue("Overview");
    fireEvent.change(titleInput, { target: { value: "Overview Pending Delete" } });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Delete page" }));

    const deleteDialog = await screen.findByRole("dialog", { name: "Confirm deletion" });
    expect(within(deleteDialog).getByText("This will permanently delete Overview Pending Delete.")).toBeInTheDocument();
    expect(within(pageSettingsPanel).getByDisplayValue("Overview Pending Delete")).toBeInTheDocument();
  });

  it("keeps the workspace shell mounted during initial workspace loading and delays contained loading lines", async () => {
    let resolveListWorkspaces: (() => void) | undefined;
    const listWorkspaces = vi.fn(
      (): Promise<WorkspaceListResult> =>
        new Promise((resolve) => {
          resolveListWorkspaces = () => {
            resolve({
              canCreateWorkspaces: true,
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
      canCreateWorkspaces: true,
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

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { getWorkspace, listPages, listWorkspaces });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    const liveToggle = screen.getByRole("button", { name: "Live" });
    const modeGroup = screen.getByRole("group", { name: "Workspace mode" });
    const listPagesCallCount = listPages.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "API Docs" }));

    expect(screen.getByRole("button", { name: "Live" })).toBe(liveToggle);
    expect(screen.getByRole("group", { name: "Workspace mode" })).toBe(modeGroup);
    expect(screen.getByRole("button", { name: "Live" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Workspace settings" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Live" }));
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
    expect(screen.getByRole("button", { name: "Live" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Workspace settings" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: API Docs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Secure Docs" }));

    expect(screen.getByRole("button", { name: "Live" })).toBe(liveToggle);
    expect(screen.getByRole("button", { name: "Live" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Workspace settings" })).not.toBeInTheDocument();

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
    expect(await screen.findByRole("button", { name: "Page actions for Overview" })).toBeInTheDocument();

    const workspaceSwitcherButton = screen.getByRole("button", { name: "Workspace switcher: Product Docs" });
    await act(async () => {
      fireEvent.click(workspaceSwitcherButton);
    });
    const apiDocsMenuItem = await screen.findByRole("menuitem", { name: "API Docs" });
    await act(async () => {
      fireEvent.click(apiDocsMenuItem);
    });

    expect(await screen.findByRole("heading", { name: "API Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Page actions for API Overview" })).not.toBeInTheDocument();
  });

  it("opens Workspace Settings from the header and saves core settings through the workspace boundary", async () => {
    const saveWorkspaceSettings = vi.fn(async (input) => ({
      state: "succeeded" as const,
      workspace: createWorkspace({
        name: input.name,
        shortDescription: input.shortDescription,
        icon: input.icon,
        layout: input.layout
      })
    }));

    renderApp("/?workspace=product-docs&page=overview&mode=edit", { saveWorkspaceSettings });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));

    const panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    expect(within(panel).getByDisplayValue("Product Docs")).toBeInTheDocument();
    expect(within(panel).getByDisplayValue("Release notes and launch guidance.")).toBeInTheDocument();
    expect(within(panel).getByLabelText("Upload custom workspace icon")).toBeInTheDocument();

    fireEvent.change(within(panel).getByDisplayValue("Product Docs"), { target: { value: "Platform Docs" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Business" }));
    fireEvent.click(within(panel).getByRole("checkbox", { name: "Show table of contents" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));

    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1));
    expect(saveWorkspaceSettings).toHaveBeenCalledWith({
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001",
      name: "Platform Docs",
      shortDescription: "Release notes and launch guidance.",
      icon: { type: "builtin", key: "business", label: "Business" },
      layout: { tocVisible: false }
    });
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Workspace switcher: Platform Docs/i })).toBeInTheDocument();
  });

  it("opens Workspace Settings from Edit without changing mode, page context, or the edit lease", async () => {
    const pages = createBreadcrumbPages();
    const acquireWorkspaceEditLease = vi.fn(async () => ({
      changeSetId: "change-set-001",
      changeSetRevision: 9,
      heartbeatIntervalMs: 60_000,
      leaseToken: "workspace-lease-token",
      staleAfterMs: 300_000,
      state: "held" as const
    }));
    const releaseWorkspaceEditLease = vi.fn(async () => ({ state: "released" as const }));
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", workspaceSlug, pages)
    );

    renderApp("/?workspace=product-docs&mode=edit&page=child", {
      acquireWorkspaceEditLease,
      listPages,
      releaseWorkspaceEditLease
    });

    expect(await screen.findByRole("heading", { name: "Child Draft" })).toBeInTheDocument();
    const acquireCountBeforeOpen = acquireWorkspaceEditLease.mock.calls.length;
    const releaseCountBeforeOpen = releaseWorkspaceEditLease.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));

    expect(await screen.findByRole("complementary", { name: "Workspace Settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Child Draft" })).toBeInTheDocument();
    expect(window.location.search).toContain("mode=edit");
    expect(window.location.search).toContain("page=child");
    expect(window.location.search).not.toContain("settings=1");
    expect(acquireWorkspaceEditLease).toHaveBeenCalledTimes(acquireCountBeforeOpen);
    expect(releaseWorkspaceEditLease).toHaveBeenCalledTimes(releaseCountBeforeOpen);

    fireEvent.click(screen.getByRole("button", { name: "Close workspace settings" }));

    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Child Draft" })).toBeInTheDocument();
    expect(acquireWorkspaceEditLease).toHaveBeenCalledTimes(acquireCountBeforeOpen);
    expect(releaseWorkspaceEditLease).toHaveBeenCalledTimes(releaseCountBeforeOpen);
  });

  it("previews Workspace Settings identity drafts in the header without changing canonical workspace data", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:staged-workspace-icon")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    const loadWorkspaceIcon = vi.fn(async () => new Blob(["persisted"], { type: "image/png" }));
    const uploadWorkspaceIcon = vi.fn(async () => ({
      icon: {
        type: "uploaded" as const,
        key: "wsi_staged",
        label: "Uploaded workspace icon",
        assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=wsi_staged"
      },
      state: "succeeded" as const
    }));
    const saveWorkspaceSettings = vi.fn(async () => {
      throw new Error("saveWorkspaceSettings should not be called before dismissal");
    });

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      loadWorkspaceIcon,
      saveWorkspaceSettings,
      uploadWorkspaceIcon
    });

    expect(await screen.findByRole("button", { name: /Workspace switcher: Product Docs/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const panel = await screen.findByRole("complementary", { name: "Workspace Settings" });

    fireEvent.change(within(panel).getByDisplayValue("Product Docs"), { target: { value: "Preview Docs" } });
    expect(screen.getByRole("button", { name: /Workspace switcher: Preview Docs/i })).toBeInTheDocument();
    expect(saveWorkspaceSettings).not.toHaveBeenCalled();

    fireEvent.change(within(panel).getByDisplayValue("Preview Docs"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i })).toBeInTheDocument();

    fireEvent.change(within(panel).getByLabelText("Workspace name"), { target: { value: "Product Docs" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Business" }));
    expect(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }).querySelector("svg")).toBeInTheDocument();

    const file = new File(["icon"], "icon.png", { type: "image/png" });
    fireEvent.change(within(panel).getByLabelText("Upload custom workspace icon"), { target: { files: [file] } });

    await waitFor(() => expect(uploadWorkspaceIcon).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.querySelectorAll("img[src='blob:staged-workspace-icon']").length).toBeGreaterThanOrEqual(2));
    expect(loadWorkspaceIcon).not.toHaveBeenCalledWith(expect.objectContaining({ assetPath: "blob:staged-workspace-icon" }));
    expect(saveWorkspaceSettings).not.toHaveBeenCalled();

    await waitFor(() => expect(within(panel).getByRole("button", { name: "Close workspace settings" })).toBeEnabled());
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Workspace switcher: Preview Docs/i })).not.toBeInTheDocument();
  });

  it("opens Workspace Settings from a transient My Workspaces intent and canonicalizes the URL", async () => {
    renderApp("/?view=my-workspaces");

    expect(await screen.findByRole("heading", { name: "My Workspaces" })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("link", { name: "Settings" })[0]);

    expect(await screen.findByRole("complementary", { name: "Workspace Settings" })).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).not.toContain("settings=1"));
  });

  it("does not open Workspace Settings for users without management capability", async () => {
    renderApp("/?workspace=product-docs&settings=1", {
      getWorkspace: vi.fn(async () => ({
        workspace: createWorkspace({
          canManageSettings: false,
          roleLabel: "Editor"
        })
      }))
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Workspace settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument();
    await waitFor(() => expect(window.location.search).not.toContain("settings=1"));
  });

  it("closes unchanged Workspace Settings without mutation and saves valid changed drafts on close", async () => {
    const saveWorkspaceSettings = vi.fn(async (input) => ({
      state: "succeeded" as const,
      workspace: createWorkspace({ name: input.name })
    }));
    renderApp("/?workspace=product-docs&mode=edit&page=overview", { saveWorkspaceSettings });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    let panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    expect(saveWorkspaceSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Workspace settings" }));
    panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    expect(within(panel).getByDisplayValue("Product Docs")).toBeInTheDocument();
    fireEvent.change(within(panel).getByDisplayValue("Product Docs"), { target: { value: "Renamed Docs" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1));
    expect(saveWorkspaceSettings.mock.calls[0][0].name).toBe("Renamed Docs");
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument());
  });

  it("finishes Workspace Settings from the real outside surface without dismissing inside-panel interaction", async () => {
    const saveWorkspaceSettings = vi.fn(async (input) => ({
      state: "succeeded" as const,
      workspace: createWorkspace({ name: input.name })
    }));
    renderApp("/?workspace=product-docs&mode=edit&page=overview", { saveWorkspaceSettings });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(panel).getByDisplayValue("Product Docs"), { target: { value: "Outside Saved Docs" } });
    fireEvent.pointerDown(panel);
    expect(screen.getByRole("complementary", { name: "Workspace Settings" })).toBeInTheDocument();
    expect(saveWorkspaceSettings).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Workspace switcher: Outside Saved Docs" }));
    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1));
    expect(saveWorkspaceSettings.mock.calls[0][0].name).toBe("Outside Saved Docs");
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument());
  });

  it("keeps failed Workspace Settings drafts dismissed and restores them on reopen", async () => {
    const saveWorkspaceSettings = vi.fn(async () => ({
      errorMessage: "Use a different workspace name.",
      state: "failed" as const
    }));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { saveWorkspaceSettings });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(panel).getByDisplayValue("Product Docs"), { target: { value: "Taken Docs" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));

    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Workspace settings" }));
    const reopenedPanel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    expect(await within(reopenedPanel).findByRole("alert")).toHaveTextContent("Use a different workspace name.");
    expect(within(reopenedPanel).getByDisplayValue("Taken Docs")).toBeInTheDocument();
  });

  it("preserves the current uploaded icon unless a built-in icon is selected", async () => {
    const uploadedWorkspace = createWorkspace({
      icon: {
        type: "uploaded",
        key: "custom",
        label: "Custom docs",
        assetPath: "/api/x_82900_docsera/icon/custom"
      }
    });
    const loadWorkspaceIcon = vi.fn(async () => new Blob(["icon"], { type: "image/png" }));
    const saveWorkspaceSettings = vi.fn(async (input) => ({
      state: "succeeded" as const,
      workspace: createWorkspace({
        ...uploadedWorkspace,
        name: input.name,
        icon: input.icon ?? uploadedWorkspace.icon
      })
    }));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      getWorkspace: vi.fn(async () => ({ workspace: uploadedWorkspace })),
      loadWorkspaceIcon,
      saveWorkspaceSettings
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    await waitFor(() => expect(loadWorkspaceIcon).toHaveBeenCalledWith({
      assetPath: "/api/x_82900_docsera/icon/custom",
      signal: expect.any(AbortSignal)
    }));
    fireEvent.change(within(panel).getByDisplayValue("Product Docs"), { target: { value: "Uploaded Docs" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1));
    expect(saveWorkspaceSettings.mock.calls[0][0]).not.toHaveProperty("icon");

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Workspace settings" }));
    const reopenedPanel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.click(within(reopenedPanel).getByRole("button", { name: "Engineering" }));
    fireEvent.click(within(reopenedPanel).getByRole("button", { name: "Close workspace settings" }));
    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(2));
    expect(saveWorkspaceSettings.mock.calls[1][0].icon).toEqual({ type: "builtin", key: "engineering", label: "Engineering" });
  });

  it("keeps an uploaded icon form clean after selecting a built-in icon and then the persisted uploaded icon again", async () => {
    const uploadedWorkspace = createWorkspace({
      icon: {
        type: "uploaded",
        key: "custom",
        label: "Custom docs",
        assetPath: "/api/x_82900_docsera/icon/custom"
      }
    });

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      getWorkspace: vi.fn(async () => ({ workspace: uploadedWorkspace }))
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const panel = await screen.findByRole("complementary", { name: "Workspace Settings" });

    fireEvent.click(within(panel).getByRole("button", { name: "Engineering" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Custom docs, current uploaded icon" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument();
  });

  it("blocks same-workspace Settings reopen while a dismissed save is pending and reconciles the save result", async () => {
    const deferredSave = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>>>();
    const saveWorkspaceSettings = vi.fn<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>(() => deferredSave.promise);

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { saveWorkspaceSettings });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(panel).getByDisplayValue("Product Docs"), { target: { value: "Pending Docs" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));

    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Workspace switcher: Pending Docs" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument();
    expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Workspace switcher: Pending Docs" })).toBeInTheDocument();

    await act(async () => {
      deferredSave.resolve({
        state: "succeeded" as const,
        workspace: createWorkspace({ name: "Pending Docs" })
      });
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Workspace switcher: Pending Docs" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Workspace switcher: Product Docs" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Workspace settings" }));
    const reopenedPanel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    expect(within(reopenedPanel).getByDisplayValue("Pending Docs")).toBeInTheDocument();
  });

  it("keeps a staged custom Workspace Settings icon visible throughout a dismissed pending save", async () => {
    const deferredSave = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>>>();
    const deferredCanonicalIcon = createDeferred<Blob | null>();
    const createObjectUrlSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:staged-workspace-icon")
      .mockReturnValueOnce("blob:canonical-workspace-icon");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const loadWorkspaceIcon = vi.fn(() => deferredCanonicalIcon.promise);
    const uploadWorkspaceIcon = vi.fn(async () => ({
      icon: {
        type: "uploaded" as const,
        key: "wsi_staged",
        label: "staged.png",
        assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=wsi_staged"
      },
      state: "succeeded" as const
    }));
    const saveWorkspaceSettings = vi.fn<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>(() => deferredSave.promise);

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      loadWorkspaceIcon,
      saveWorkspaceSettings,
      uploadWorkspaceIcon
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(panel).getByLabelText("Upload custom workspace icon"), {
      target: { files: [new File(["image"], "staged.png", { type: "image/png" })] }
    });

    await waitFor(() => expect(uploadWorkspaceIcon).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }).querySelector("img[src='blob:staged-workspace-icon']")).toBeInTheDocument());
    expect(loadWorkspaceIcon).not.toHaveBeenCalledWith(expect.objectContaining({ assetPath: "blob:staged-workspace-icon" }));

    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));

    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveWorkspaceSettings).mock.calls[0]?.[0].icon).toMatchObject({
      assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=wsi_staged",
      key: "wsi_staged",
      type: "uploaded"
    });
    expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument();
    const pendingHeader = screen.getByRole("button", { name: /Workspace switcher: Product Docs/i });
    expect(pendingHeader.querySelector("img[src='blob:staged-workspace-icon']")).toBeInTheDocument();
    expect(pendingHeader.querySelector(".docsera-workspace-icon-badge--uploaded")).toBeInTheDocument();
    expect(pendingHeader.querySelector(".docsera-workspace-icon-badge")?.textContent).toBe("");
    expect(revokeObjectUrlSpy).not.toHaveBeenCalledWith("blob:staged-workspace-icon");

    await act(async () => {
      deferredSave.resolve({
        state: "succeeded" as const,
        workspace: createWorkspace({
          icon: {
            type: "uploaded",
            key: "wsi_staged",
            label: "staged.png",
            assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=wsi_staged"
          }
        })
      });
      await Promise.resolve();
    });

    expect(loadWorkspaceIcon).toHaveBeenCalledWith({
      assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=wsi_staged",
      signal: expect.any(AbortSignal)
    });
    const canonicalLoadingHeader = screen.getByRole("button", { name: /Workspace switcher: Product Docs/i });
    expect(canonicalLoadingHeader.querySelector("img[src='blob:staged-workspace-icon']")).toBeInTheDocument();
    expect(canonicalLoadingHeader.querySelector(".docsera-workspace-icon-badge")?.textContent).toBe("");
    expect(revokeObjectUrlSpy).not.toHaveBeenCalledWith("blob:staged-workspace-icon");

    await act(async () => {
      deferredCanonicalIcon.resolve(new Blob(["canonical"], { type: "image/png" }));
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }).querySelector("img[src='blob:canonical-workspace-icon']")).toBeInTheDocument());
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(2);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:staged-workspace-icon");
  });

  it("releases a transferred Workspace Settings preview when switching workspaces before the pending save completes", async () => {
    const deferredSave = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>>>();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:staged-workspace-icon");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const uploadWorkspaceIcon = vi.fn(async () => ({
      icon: {
        type: "uploaded" as const,
        key: "wsi_staged",
        label: "staged.png",
        assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=wsi_staged"
      },
      state: "succeeded" as const
    }));
    const saveWorkspaceSettings = vi.fn<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>(() => deferredSave.promise);

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      saveWorkspaceSettings,
      uploadWorkspaceIcon
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(panel).getByLabelText("Upload custom workspace icon"), {
      target: { files: [new File(["image"], "staged.png", { type: "image/png" })] }
    });
    await waitFor(() => expect(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }).querySelector("img[src='blob:staged-workspace-icon']")).toBeInTheDocument());

    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1));
    expect(revokeObjectUrlSpy).not.toHaveBeenCalledWith("blob:staged-workspace-icon");

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "API Docs" }));
    expect(await screen.findByRole("heading", { name: "API Overview" })).toBeInTheDocument();
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:staged-workspace-icon");

    await act(async () => {
      deferredSave.resolve({
        state: "succeeded" as const,
        workspace: createWorkspace({
          icon: {
            type: "uploaded",
            key: "wsi_staged",
            label: "staged.png",
            assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=wsi_staged"
          }
        })
      });
      await Promise.resolve();
    });

    expect(revokeObjectUrlSpy.mock.calls.filter(([value]) => value === "blob:staged-workspace-icon")).toHaveLength(1);
  });

  it("releases a transferred Workspace Settings preview when authenticated canonical icon loading fails", async () => {
    const deferredSave = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>>>();
    const deferredCanonicalIcon = createDeferred<Blob | null>();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:staged-workspace-icon");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const loadWorkspaceIcon = vi.fn(() => deferredCanonicalIcon.promise);
    const uploadWorkspaceIcon = vi.fn(async () => ({
      icon: {
        type: "uploaded" as const,
        key: "wsi_staged",
        label: "staged.png",
        assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=wsi_staged"
      },
      state: "succeeded" as const
    }));
    const saveWorkspaceSettings = vi.fn<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>(() => deferredSave.promise);

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      loadWorkspaceIcon,
      saveWorkspaceSettings,
      uploadWorkspaceIcon
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(panel).getByLabelText("Upload custom workspace icon"), {
      target: { files: [new File(["image"], "staged.png", { type: "image/png" })] }
    });
    await waitFor(() => expect(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }).querySelector("img[src='blob:staged-workspace-icon']")).toBeInTheDocument());

    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1));
    await act(async () => {
      deferredSave.resolve({
        state: "succeeded" as const,
        workspace: createWorkspace({
          icon: {
            type: "uploaded",
            key: "wsi_staged",
            label: "staged.png",
            assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=wsi_staged"
          }
        })
      });
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }).querySelector("img[src='blob:staged-workspace-icon']")).toBeInTheDocument();
    expect(revokeObjectUrlSpy).not.toHaveBeenCalledWith("blob:staged-workspace-icon");

    await act(async () => {
      deferredCanonicalIcon.resolve(null);
      await Promise.resolve();
    });

    await waitFor(() => expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:staged-workspace-icon"));
  });

  it("preserves a failed dismissed Workspace Settings save for same-workspace recovery after blocked reopen", async () => {
    const deferredSave = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>>>();
    const saveWorkspaceSettings = vi.fn(() => deferredSave.promise);

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { saveWorkspaceSettings });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(panel).getByDisplayValue("Product Docs"), { target: { value: "Failed Pending Docs" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));

    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Workspace switcher: Failed Pending Docs" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Workspace switcher: Failed Pending Docs" })).toBeInTheDocument();

    await act(async () => {
      deferredSave.resolve({
        errorMessage: "Settings save failed.",
        state: "failed" as const
      });
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Workspace switcher: Product Docs" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Workspace switcher: Failed Pending Docs" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Workspace settings" }));
    const reopenedPanel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    expect(await within(reopenedPanel).findByRole("alert")).toHaveTextContent("Settings save failed.");
    expect(within(reopenedPanel).getByDisplayValue("Failed Pending Docs")).toBeInTheDocument();
  });

  it("keeps concurrent dismissed Workspace Settings saves isolated across workspaces", async () => {
    const saveA = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>>>();
    const saveB = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>>>();
    const workspaces: Record<string, WorkspaceViewRecord> = {
      "api-docs": createWorkspace({ sysId: "workspace-002", slug: "api-docs", name: "API Docs" }),
      "product-docs": createWorkspace()
    };
    const getWorkspace = vi.fn(async (workspaceSlug: string) => ({ workspace: workspaces[workspaceSlug] ?? null }));
    const listWorkspaces = vi.fn(async (): Promise<WorkspaceListResult> => ({
      canCreateWorkspaces: true,
      hasNextPage: false,
      items: [workspaces["product-docs"], workspaces["api-docs"]],
      page: 1,
      pageSize: 10,
      searchText: "",
      totalCount: 2
    }));
    const saveWorkspaceSettings = vi.fn((input) => (input.workspaceSysId === "workspace-001" ? saveA.promise : saveB.promise));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { getWorkspace, listWorkspaces, saveWorkspaceSettings });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    let panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(panel).getByDisplayValue("Product Docs"), { target: { value: "Workspace A Saved" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Workspace A Saved/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "API Docs" }));
    expect(await screen.findByRole("heading", { name: "API Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("button", { name: "Page actions for API Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(panel).getByDisplayValue("API Docs"), { target: { value: "Workspace B Saved" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(2));

    await act(async () => {
      workspaces["api-docs"] = createWorkspace({ sysId: "workspace-002", slug: "api-docs", name: "Workspace B Saved" });
      saveB.resolve({ state: "succeeded" as const, workspace: workspaces["api-docs"] });
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Workspace switcher: Workspace B Saved" })).toBeInTheDocument();

    await act(async () => {
      workspaces["product-docs"] = createWorkspace({ name: "Workspace A Saved" });
      saveA.resolve({ state: "succeeded" as const, workspace: workspaces["product-docs"] });
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Workspace B Saved/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Workspace A Saved" }));
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("button", { name: "Page actions for Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    expect(within(panel).getByDisplayValue("Workspace A Saved")).toBeInTheDocument();
  });

  it("keeps another workspace's active Settings draft open when a dismissed save succeeds", async () => {
    const saveA = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>>>();
    const workspaces: Record<string, WorkspaceViewRecord> = {
      "api-docs": createWorkspace({ sysId: "workspace-002", slug: "api-docs", name: "API Docs" }),
      "product-docs": createWorkspace()
    };
    const getWorkspace = vi.fn(async (workspaceSlug: string) => ({ workspace: workspaces[workspaceSlug] ?? null }));
    const listWorkspaces = vi.fn(async (): Promise<WorkspaceListResult> => ({
      canCreateWorkspaces: true,
      hasNextPage: false,
      items: [workspaces["product-docs"], workspaces["api-docs"]],
      page: 1,
      pageSize: 10,
      searchText: "",
      totalCount: 2
    }));
    const saveWorkspaceSettings = vi.fn((input) => {
      if (input.workspaceSysId === "workspace-001") {
        return saveA.promise;
      }

      throw new Error("Workspace B settings should remain as an open draft.");
    });

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { getWorkspace, listWorkspaces, saveWorkspaceSettings });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    let panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(panel).getByDisplayValue("Product Docs"), { target: { value: "Workspace A Saved" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Workspace A Saved/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "API Docs" }));
    expect(await screen.findByRole("heading", { name: "API Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("button", { name: "Page actions for API Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(panel).getByDisplayValue("API Docs"), { target: { value: "Workspace B Draft" } });

    await act(async () => {
      workspaces["product-docs"] = createWorkspace({ name: "Workspace A Saved" });
      saveA.resolve({ state: "succeeded" as const, workspace: workspaces["product-docs"] });
      await Promise.resolve();
    });

    panel = screen.getByRole("complementary", { name: "Workspace Settings" });
    expect(within(panel).getByDisplayValue("Workspace B Draft")).toBeInTheDocument();
    expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1);
  });

  it("keeps a failed dismissed Workspace Settings draft recoverable after another workspace saves", async () => {
    const saveA = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>>>();
    const saveB = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>>>();
    const workspaces: Record<string, WorkspaceViewRecord> = {
      "api-docs": createWorkspace({ sysId: "workspace-002", slug: "api-docs", name: "API Docs" }),
      "product-docs": createWorkspace()
    };
    const getWorkspace = vi.fn(async (workspaceSlug: string) => ({ workspace: workspaces[workspaceSlug] ?? null }));
    const saveWorkspaceSettings = vi.fn((input) => (input.workspaceSysId === "workspace-001" ? saveA.promise : saveB.promise));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { getWorkspace, saveWorkspaceSettings });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    let panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(panel).getByDisplayValue("Product Docs"), { target: { value: "Workspace A Failed Draft" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Workspace A Failed Draft/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "API Docs" }));
    expect(await screen.findByRole("heading", { name: "API Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("button", { name: "Page actions for API Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(panel).getByDisplayValue("API Docs"), { target: { value: "Workspace B Saved" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(2));

    await act(async () => {
      workspaces["api-docs"] = createWorkspace({ sysId: "workspace-002", slug: "api-docs", name: "Workspace B Saved" });
      saveB.resolve({ state: "succeeded" as const, workspace: workspaces["api-docs"] });
      saveA.resolve({ errorMessage: "Workspace A failed.", state: "failed" as const });
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Workspace B Saved/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Product Docs" }));
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("button", { name: "Page actions for Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    expect(await within(panel).findByRole("alert")).toHaveTextContent("Workspace A failed.");
    expect(within(panel).getByDisplayValue("Workspace A Failed Draft")).toBeInTheDocument();
  });

  it("cleans abandoned settings-staged uploaded icons when replaced or dismissed for the canonical icon", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:workspace-icon") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const cleanupWorkspaceSettingsIcon = vi.fn(async () => {
      throw new Error("cleanup failed");
    });
    const uploadWorkspaceIcon = vi
      .fn()
      .mockResolvedValueOnce({
        icon: { type: "uploaded" as const, key: "wsi_first", label: "first.png", assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=wsi_first" },
        state: "succeeded" as const
      })
      .mockResolvedValueOnce({
        icon: { type: "uploaded" as const, key: "wsi_second", label: "second.png", assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=wsi_second" },
        state: "succeeded" as const
      });

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      cleanupWorkspaceSettingsIcon,
      uploadWorkspaceIcon
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    const fileInput = within(panel).getByLabelText("Upload custom workspace icon");
    fireEvent.change(fileInput, { target: { files: [new File(["one"], "first.png", { type: "image/png" })] } });
    await waitFor(() => expect(uploadWorkspaceIcon).toHaveBeenCalledTimes(1));
    await within(panel).findByText("Custom image uploaded.");
    fireEvent.change(fileInput, { target: { files: [new File(["two"], "second.png", { type: "image/png" })] } });
    await waitFor(() => expect(uploadWorkspaceIcon).toHaveBeenCalledTimes(2));
    expect(cleanupWorkspaceSettingsIcon).toHaveBeenCalledWith({ assetKey: "wsi_first", workspaceSysId: "workspace-001" });

    fireEvent.click(within(panel).getByRole("button", { name: "Docsera workspace icon" }));
    expect(cleanupWorkspaceSettingsIcon).toHaveBeenCalledWith({ assetKey: "wsi_second", workspaceSysId: "workspace-001" });
  });

  it("aligns Workspace Settings field limits to the 55A mutation boundary", async () => {
    const saveWorkspaceSettings = vi.fn(async (input) => ({
      state: "succeeded" as const,
      workspace: createWorkspace({
        name: input.name,
        shortDescription: input.shortDescription
      })
    }));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { saveWorkspaceSettings });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    const nameInput = within(panel).getByDisplayValue("Product Docs");
    const descriptionInput = within(panel).getByDisplayValue("Release notes and launch guidance.");
    const validName = "N".repeat(160);
    const validDescription = "D".repeat(240);

    fireEvent.change(nameInput, { target: { value: validName } });
    fireEvent.change(descriptionInput, { target: { value: validDescription } });
    expect(within(panel).queryByText("Workspace name must be 160 characters or fewer.")).not.toBeInTheDocument();
    expect(within(panel).queryByText("Short description must be 240 characters or fewer.")).not.toBeInTheDocument();

    fireEvent.change(nameInput, { target: { value: `${validName}X` } });
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    expect(within(panel).getByText("Workspace name must be 160 characters or fewer.")).toBeInTheDocument();

    fireEvent.change(nameInput, { target: { value: validName } });
    fireEvent.change(descriptionInput, { target: { value: `${validDescription}X` } });
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    expect(within(panel).getByText("Short description must be 240 characters or fewer.")).toBeInTheDocument();
  });

  it("removes the workspace ToC surface while preserving explicit collapsed preference for re-enable", async () => {
    window.localStorage.setItem("docsera.workspace-toc-collapsed.v1:product-docs", "false");
    const getWorkspace = vi.fn(async () => ({
      workspace: createWorkspace({
        layout: { tocVisible: false }
      })
    }));

    const firstRender = renderApp("/?workspace=product-docs", {
      getWorkspace
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /table of contents/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Page outline" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("docsera.workspace-toc-collapsed.v1:product-docs")).toBe("false");
    expect(window.localStorage.getItem("docsera.workspace-toc-collapsed-explicit.v2:product-docs")).toBeNull();

    firstRender.unmount();
    const secondRender = renderApp("/?workspace=product-docs", {
      getWorkspace: vi.fn(async () => ({
        workspace: createWorkspace({
          layout: { tocVisible: false }
        })
      }))
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /table of contents/i })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("docsera.workspace-toc-collapsed-explicit.v2:product-docs")).toBeNull();

    secondRender.unmount();
    window.localStorage.setItem("docsera.workspace-toc-collapsed-explicit.v2:product-docs", "true");
    const thirdRender = renderApp("/?workspace=product-docs", {
      getWorkspace: vi.fn(async () => ({
        workspace: createWorkspace({
          layout: { tocVisible: false }
        })
      }))
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /table of contents/i })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("docsera.workspace-toc-collapsed-explicit.v2:product-docs")).toBe("true");

    thirdRender.unmount();
    renderApp("/?workspace=product-docs", {
      getWorkspace: vi.fn(async () => ({
        workspace: createWorkspace({
          layout: { tocVisible: true }
        })
      }))
    });

    expect(await screen.findByRole("button", { name: "Expand table of contents" })).toBeInTheDocument();
  });
});
