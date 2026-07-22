import "@testing-library/jest-dom/vitest";
import { act, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { createEmptyDocseraDocumentEnvelope } from "../../shared/editor/document";
import type {
  DocseraRuntimeContext,
  PageBodySaveResult,
  PageCreateResult,
  PageListResult,
  PageMoveResult,
  PageSettingsSaveResult,
  ServiceNowClient,
  WorkspacePendingChangesResult,
  WorkspaceMode,
  WorkspacePageRecord,
  WorkspaceViewRecord
} from "../shared/types/docsera";

let deferHostReady = false;
let hostReadyResolvers: Array<() => void> = [];
let restoreNavigationEntries = () => {};

type BroadcastMessage = Record<string, unknown>;

class FakeBroadcastChannel {
  static peers = new Map<string, Set<FakeBroadcastChannel>>();
  closed = false;
  onmessage: ((event: MessageEvent<BroadcastMessage>) => void) | null = null;

  constructor(readonly name: string) {
    const peers = FakeBroadcastChannel.peers.get(name) ?? new Set<FakeBroadcastChannel>();
    peers.add(this);
    FakeBroadcastChannel.peers.set(name, peers);
  }

  postMessage(message: BroadcastMessage) {
    for (const peer of FakeBroadcastChannel.peers.get(this.name) ?? []) {
      if (peer !== this && !peer.closed) {
        peer.onmessage?.({ data: message } as MessageEvent<BroadcastMessage>);
      }
    }
  }

  close() {
    this.closed = true;
    const peers = FakeBroadcastChannel.peers.get(this.name);
    peers?.delete(this);
    if (peers?.size === 0) {
      FakeBroadcastChannel.peers.delete(this.name);
    }
  }
}

function resolveDeferredHostReady() {
  const resolvers = [...hostReadyResolvers];
  hostReadyResolvers = [];
  deferHostReady = false;
  resolvers.forEach((resolve) => resolve());
}

afterEach(() => {
  vi.useRealTimers();
  restoreNavigationEntries();
  restoreNavigationEntries = () => {};
  FakeBroadcastChannel.peers.clear();
  Reflect.deleteProperty(window, "BroadcastChannel");
  window.localStorage.clear();
  deferHostReady = false;
  hostReadyResolvers = [];
  window.sessionStorage.clear();
  window.name = "";
});

function mockNavigationType(type: PerformanceNavigationTiming["type"]) {
  const original = window.performance.getEntriesByType.bind(window.performance);
  vi.spyOn(window.performance, "getEntriesByType").mockImplementation((entryType: string) => {
    if (entryType === "navigation") {
      return [{ type } as PerformanceNavigationTiming];
    }

    return original(entryType);
  });
  restoreNavigationEntries = () => {
    vi.restoreAllMocks();
  };
}

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

function createPendingChangesResult(rows: Extract<WorkspacePendingChangesResult, { state: "succeeded" }>["rows"]): Extract<WorkspacePendingChangesResult, { state: "succeeded" }> {
  return {
    affectedPageCount: rows.length,
    changeSetId: "change-set-001",
    changeSetRevision: 7,
    rows,
    state: "succeeded",
    workspaceSysId: "workspace-001"
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
    acquireWorkspaceEditLease: vi.fn(async () => ({
      changeSetId: "change-set-001",
      changeSetRevision: 7,
      heartbeatIntervalMs: 60_000,
      leaseToken: "workspace-lease-token",
      staleAfterMs: 300_000,
      workspaceStateRevision: 3,
      state: "held" as const
    })),
    resumeWorkspaceEditLease: vi.fn(async () => ({
      changeSetId: "change-set-001",
      changeSetRevision: 7,
      heartbeatIntervalMs: 60_000,
      leaseToken: "workspace-lease-token",
      staleAfterMs: 300_000,
      workspaceStateRevision: 3,
      state: "held" as const
    })),
    renewWorkspaceEditLease: vi.fn(async () => ({
      changeSetId: "change-set-001",
      changeSetRevision: 7,
      heartbeatIntervalMs: 60_000,
      leaseToken: "workspace-lease-token",
      staleAfterMs: 300_000,
      workspaceStateRevision: 3,
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

function readRouteValues(): Record<string, string | null> {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const [rawPath = "", rawQuery = ""] = hash.split("?", 2);
  const path = rawPath.startsWith("/") ? rawPath.slice(1) : rawPath;
  const segments = path.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  const params = new URLSearchParams(rawQuery || window.location.search);
  return {
    mode: params.get("mode"),
    page: segments[1] ?? params.get("page"),
    workspace: segments[0] ?? params.get("workspace")
  };
}

function expectWorkspaceSearch(expected: Record<string, string | null>) {
  const values = readRouteValues();
  for (const [key, value] of Object.entries(expected)) {
    expect(values[key]).toBe(value);
  }
}

function heldLease(leaseToken: string) {
  return {
    changeSetId: "change-set-001",
    changeSetRevision: 7,
    heartbeatIntervalMs: 60_000,
    leaseToken,
    staleAfterMs: 300_000,
    workspaceStateRevision: 3,
    state: "held" as const
  };
}

function installFakeBroadcastChannel() {
  Object.defineProperty(window, "BroadcastChannel", {
    configurable: true,
    value: FakeBroadcastChannel
  });
}

function workspaceLeaseStorageKey(workspaceSysId = "workspace-001"): string {
  return `docsera.workspace-edit-lease.${workspaceSysId}`;
}

function readStoredWorkspaceLease(workspaceSysId = "workspace-001"): { tabSessionId: string; token: string } {
  const raw = window.sessionStorage.getItem(workspaceLeaseStorageKey(workspaceSysId));
  expect(raw).toBeTruthy();
  return JSON.parse(raw ?? "{}") as { tabSessionId: string; token: string };
}

function treeRow(title: string): HTMLElement {
  const tree = screen.getByRole("navigation", { name: "Page tree" });
  const element = within(tree).getByRole("button", { name: title }).closest(".docsera-page-tree__row");
  if (!element) {
    throw new Error(`Missing tree row for ${title}.`);
  }
  Object.defineProperty(element, "getBoundingClientRect", {
    configurable: true,
    value: () => ({ bottom: 90, height: 90, left: 0, right: 200, top: 0, width: 200, x: 0, y: 0, toJSON: () => ({}) })
  });
  return element as HTMLElement;
}

function dragTreePage(sourceTitle: string, targetTitle: string, clientY: number) {
  const dataTransfer = {
    dropEffect: "move",
    effectAllowed: "move",
    getData: vi.fn(() => ""),
    setData: vi.fn()
  };
  fireEvent.dragStart(treeRow(sourceTitle), { dataTransfer });
  fireEvent.dragOver(treeRow(targetTitle), { clientY, dataTransfer });
  const drop = createEvent.drop(treeRow(targetTitle), { dataTransfer });
  Object.defineProperty(drop, "clientY", { value: clientY });
  fireEvent(treeRow(targetTitle), drop);
}

function pageTreeButtonLabels(): string[] {
  const tree = screen.getByRole("navigation", { name: "Page tree" });
  return within(tree)
    .getAllByRole("button")
    .map((button) => button.textContent?.trim() ?? "");
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
    expectWorkspaceSearch({ workspace: "product-docs", page: "overview" });
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

  it("returns safely to Live when initial Edit acquisition fails with workspace foundation invalid", async () => {
    const acquireWorkspaceEditLease = vi.fn(async () => ({
      errorMessage: "Workspace editing is unavailable for this workspace.",
      failure: "terminal" as const,
      retryable: false,
      state: "failed" as const
    }));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { acquireWorkspaceEditLease });

    expect(await screen.findByRole("alert")).toHaveTextContent("Workspace editing is unavailable for this workspace.");
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", page: "overview" }));
    expect(screen.queryByText(/currently being edited/i)).toBeNull();
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
  });

  it("keeps malformed-held failures out of Edit and does not invent holder metadata", async () => {
    const acquireWorkspaceEditLease = vi.fn(async () => ({
      errorMessage: "Workspace editing is unavailable.",
      failure: "terminal" as const,
      retryable: false,
      state: "failed" as const
    }));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { acquireWorkspaceEditLease });

    expect(await screen.findByRole("alert")).toHaveTextContent("Workspace editing is unavailable.");
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", page: "overview" }));
    expect(screen.queryByText(/Priya Writer/i)).toBeNull();
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
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
    const main = screen.getByRole("main", { name: "Child Draft" });
    expect(within(main).getByRole("heading", { level: 1, name: "Child Draft" })).toBeInTheDocument();
    expect(within(main).queryByText("Overview")).not.toBeInTheDocument();

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

    const acquireWorkspaceEditLease = vi.fn(async () => ({
      changeSetId: "change-set-001",
      changeSetRevision: 7,
      heartbeatIntervalMs: 60_000,
      leaseToken: "workspace-lease-token",
      staleAfterMs: 300_000,
      workspaceStateRevision: 3,
      state: "held" as const
    }));
    const getPageEditLockStatus = vi.fn(async () => {
      throw new Error("active client must not request page-lock status");
    });
    const acquirePageEditLock = vi.fn(async () => {
      throw new Error("active client must not acquire a page lock");
    });
    const heartbeatPageEditLock = vi.fn(async () => {
      throw new Error("active client must not heartbeat a page lock");
    });
    const releasePageEditLock = vi.fn(async () => {
      throw new Error("active client must not release a page lock");
    });

    renderApp("/?workspace=product-docs&page=overview", {
      acquireWorkspaceEditLease,
      acquirePageEditLock,
      getPageEditLockStatus,
      heartbeatPageEditLock,
      listPages,
      releasePageEditLock
    });

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
    expect(acquireWorkspaceEditLease).toHaveBeenCalledWith(expect.objectContaining({ workspaceSysId: "workspace-001" }));
    expect(getPageEditLockStatus).not.toHaveBeenCalled();
    expect(acquirePageEditLock).not.toHaveBeenCalled();
    expect(heartbeatPageEditLock).not.toHaveBeenCalled();
    expect(releasePageEditLock).not.toHaveBeenCalled();
    expect(listPages).toHaveBeenLastCalledWith({
      mode: "edit",
      workspaceSlug: "product-docs"
    });
  });

  it("moves a page from the Edit tree through the movement client contract and reconciles returned pages", async () => {
    const initialPages = createBreadcrumbPages();
    const movedPages = [
      initialPages[0],
      createPageRecord({
        ...initialPages[1],
        parentPageSysId: null,
        siblingOrder: 2,
        draftTitle: "Child Moved"
      })
    ];
    const movePage = vi.fn(async (): Promise<PageMoveResult> => ({
      changeSetId: "change-set-001",
      changeSetRevision: 8,
      pages: movedPages,
      state: "succeeded"
    }));
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", mode === "edit" ? initialPages : [initialPages[0]])
    );

    renderApp("/?workspace=product-docs&mode=edit&page=child", { listPages, movePage });
    expect(await screen.findByRole("button", { name: "Child Draft" })).toBeInTheDocument();

    dragTreePage("Child Draft", "Overview", 89);

    await waitFor(() => expect(movePage).toHaveBeenCalledTimes(1));
    expect(movePage).toHaveBeenCalledWith(expect.objectContaining({
      pageSysId: "page-child",
      parentPageSysId: null,
      siblingOrder: "2",
      workspaceAuthority: expect.objectContaining({ changeSetId: "change-set-001", changeSetRevision: 7 }),
      workspaceLeaseToken: "workspace-lease-token"
    }));
    expect(await screen.findByRole("button", { name: "Child Moved" })).toBeInTheDocument();
  });

  it("lets an earlier Page Settings save complete before a later queued move uses its authority", async () => {
    const initialPages = createBreadcrumbPages();
    const savedOverview = createPageRecord({
      ...initialPages[0],
      draftTitle: "Overview Saved",
      publicationState: "published_with_unpublished_changes"
    });
    const movedPages = [
      savedOverview,
      createPageRecord({
        ...initialPages[1],
        parentPageSysId: null,
        siblingOrder: 2,
        draftTitle: "Child Moved"
      })
    ];
    const settingsDeferred = createDeferred<PageSettingsSaveResult>();
    const savePageSettings = vi.fn(() => settingsDeferred.promise);
    const movePage = vi.fn(async (): Promise<PageMoveResult> => ({
      changeSetId: "change-set-001",
      changeSetRevision: 9,
      pages: movedPages,
      state: "succeeded"
    }));
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", mode === "edit" ? initialPages : [initialPages[0]])
    );

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { listPages, movePage, savePageSettings });
    expect(await screen.findByRole("button", { name: "Child Draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview" }));
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview" }));
    const titleInput = screen.getByDisplayValue("Overview");
    fireEvent.change(titleInput, { target: { value: "Overview Saved" } });
    fireEvent.blur(titleInput);
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));
    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(1));

    dragTreePage("Child Draft", "Overview", 89);
    expect(movePage).not.toHaveBeenCalled();

    await act(async () => {
      settingsDeferred.resolve({
        changeSetId: "change-set-001",
        changeSetRevision: 8,
        page: savedOverview,
        state: "succeeded"
      });
      await Promise.resolve();
    });

    await waitFor(() => expect(movePage).toHaveBeenCalledTimes(1));
    expect(movePage).toHaveBeenCalledWith(expect.objectContaining({
      workspaceAuthority: expect.objectContaining({ changeSetId: "change-set-001", changeSetRevision: 8 })
    }));
    expect((await screen.findAllByText("Overview Saved")).length).toBeGreaterThan(0);
    expect(await screen.findByRole("button", { name: "Child Moved" })).toBeInTheDocument();
  });

  it("keeps a workspace-level page creation valid when the selected page changes before it completes", async () => {
    const pages = createBreadcrumbPages();
    const createdPage = createPageRecord({
      sysId: "page-new",
      parentPageSysId: null,
      siblingOrder: 3,
      draftTitle: "Queued workspace page",
      draftSlug: "queued-workspace-page",
      draftSlugNormalized: "queued-workspace-page",
      publishedTitle: null,
      publishedSlug: null,
      publishedSlugNormalized: null,
      publicationState: "draft"
    });
    const createDeferredResult = createDeferred<PageCreateResult>();
    const createPage = vi.fn(() => createDeferredResult.promise);
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", mode === "edit" ? pages : [pages[0]])
    );

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { createPage, listPages });
    expect(await screen.findByRole("button", { name: "Child Draft" })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "New page" })[0]);
    const titleInput = await screen.findByRole("textbox", { name: "New page title" });
    fireEvent.change(titleInput, { target: { value: "Queued workspace page" } });
    fireEvent.keyDown(titleInput, { key: "Enter" });
    await waitFor(() => expect(createPage).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Child Draft" }));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "child" }));

    await act(async () => {
      createDeferredResult.resolve({
        changeSetId: "change-set-001",
        changeSetRevision: 8,
        page: createdPage,
        state: "succeeded"
      });
      await Promise.resolve();
    });

    expect(await screen.findByRole("heading", { name: "Queued workspace page" })).toBeInTheDocument();
    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "queued-workspace-page" });
  });

  it("preserves rank zero when moving the second root page before the first in Edit while Live stays published", async () => {
    const returnedMove = createDeferred<PageMoveResult>();
    const editPages = [
      createPageRecord({ sysId: "page-first", draftTitle: "First", draftSlug: "first", siblingOrder: 1 }),
      createPageRecord({ sysId: "page-second", draftTitle: "Second", draftSlug: "second", siblingOrder: 2 })
    ];
    const returnedEditPages = [
      createPageRecord({ sysId: "page-second", draftTitle: "Second", draftSlug: "second", siblingOrder: 0 }),
      createPageRecord({ sysId: "page-first", draftTitle: "First", draftSlug: "first", siblingOrder: 1 })
    ];
    const livePages = [
      createPageRecord({ sysId: "page-first", draftTitle: "First", draftSlug: "first", siblingOrder: 1 }),
      createPageRecord({ sysId: "page-second", draftTitle: "Second", draftSlug: "second", siblingOrder: 2 })
    ];
    const movePage = vi.fn(() => returnedMove.promise);
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", mode === "edit" ? editPages : livePages)
    );

    renderApp("/?workspace=product-docs&mode=edit&page=first", { listPages, movePage });
    expect(await screen.findByRole("button", { name: "Second" })).toBeInTheDocument();
    expect(pageTreeButtonLabels()).toEqual(expect.arrayContaining(["First", "Second"]));

    dragTreePage("Second", "First", 1);

    await waitFor(() => expect(movePage).toHaveBeenCalledTimes(1));
    expect(movePage).toHaveBeenCalledWith(expect.objectContaining({
      pageSysId: "page-second",
      parentPageSysId: null,
      siblingOrder: "0"
    }));
    await waitFor(() => expect(pageTreeButtonLabels().indexOf("Second")).toBeLessThan(pageTreeButtonLabels().indexOf("First")));

    returnedMove.resolve({
      changeSetId: "change-set-001",
      changeSetRevision: 8,
      pages: returnedEditPages,
      state: "succeeded"
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "Second" })).toBeInTheDocument());
    expect(pageTreeButtonLabels().indexOf("Second")).toBeLessThan(pageTreeButtonLabels().indexOf("First"));
    expect(livePages.map((page) => [page.sysId, page.siblingOrder])).toEqual([
      ["page-first", 1],
      ["page-second", 2]
    ]);
  });

  it("rolls back a rejected movement and starts stale refresh for conflict authority", async () => {
    const refreshDeferred = createDeferred<PageListResult>();
    const initialPages = createBreadcrumbPages();
    let editListCount = 0;
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) => {
      if (mode === "edit") {
        editListCount += 1;
        if (editListCount > 1) {
          return refreshDeferred.promise;
        }
        return createPageListResult("edit", initialPages);
      }
      return createPageListResult("live", [initialPages[0]]);
    });
    const movePage = vi.fn(async (): Promise<PageMoveResult> => ({
      code: "conflict",
      currentChangeSetId: "change-set-001",
      currentChangeSetRevision: 8,
      errorMessage: "The active draft generation changed. Reload before moving again.",
      state: "failed"
    }));

    renderApp("/?workspace=product-docs&mode=edit&page=child", { listPages, movePage });
    expect(await screen.findByRole("button", { name: "Child Draft" })).toBeInTheDocument();

    dragTreePage("Child Draft", "Overview", 89);

    await waitFor(() => expect(movePage).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Child Draft" })).toBeInTheDocument();
    refreshDeferred.resolve(createPageListResult("edit", initialPages));
  });

  it("rolls back movement and returns to Live when the Edit lease or access is lost", async () => {
    const initialPages = createBreadcrumbPages();
    const movePage = vi.fn(async (): Promise<PageMoveResult> => ({
      code: "forbidden",
      errorMessage: "Workspace editing is no longer available.",
      state: "failed"
    }));
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", mode === "edit" ? initialPages : [initialPages[0]])
    );

    renderApp("/?workspace=product-docs&mode=edit&page=child", { listPages, movePage });
    expect(await screen.findByRole("button", { name: "Child Draft" })).toBeInTheDocument();

    dragTreePage("Child Draft", "Overview", 89);

    await waitFor(() => expect(movePage).toHaveBeenCalledTimes(1));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", page: "overview" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Workspace editing is no longer available.");
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).toBeNull();
  });

  it("retains a direct Edit intent until the workspace lease is held", async () => {
    const deferredLease = createDeferred<{
      changeSetId: string;
      changeSetRevision: number;
      heartbeatIntervalMs: number;
      leaseToken: string;
      staleAfterMs: number;
      workspaceStateRevision: number;
      state: "held";
    }>();
    const acquireWorkspaceEditLease = vi.fn(() => deferredLease.promise);
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", [createPageRecord({ draftTitle: "Overview Draft" })])
    );

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { acquireWorkspaceEditLease, listPages });

    await waitFor(() => expect(acquireWorkspaceEditLease).toHaveBeenCalledTimes(1));
    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" });
    expect(listPages).not.toHaveBeenCalledWith({ mode: "edit", workspaceSlug: "product-docs" });
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).toBeNull();

    await act(async () => {
      deferredLease.resolve({
        changeSetId: "change-set-001",
        changeSetRevision: 7,
        heartbeatIntervalMs: 60_000,
        leaseToken: "workspace-lease-token",
        staleAfterMs: 300_000,
        workspaceStateRevision: 3,
        state: "held"
      });
    });

    await waitFor(() => expect(listPages).toHaveBeenCalledWith({ mode: "edit", workspaceSlug: "product-docs" }));
    await waitFor(() => expect(document.querySelector("[data-docsera-page-editor-host='true']")).not.toBeNull());
  });

  it("preserves the workspace lease token and resumes after a same-tab hard refresh", async () => {
    installFakeBroadcastChannel();
    const acquireWorkspaceEditLease = vi.fn(async () => heldLease("workspace-lease-token"));
    const resumeWorkspaceEditLease = vi.fn(async () => heldLease("workspace-lease-token"));
    const releaseWorkspaceEditLease = vi.fn(async () => ({ state: "released" as const }));
    const pages = [
      createPageRecord(),
      createPageRecord({
        draftTitle: "Refresh Target",
        draftSlug: "refresh-target",
        draftSlugNormalized: "refresh-target",
        publishedTitle: "Refresh Target",
        publishedSlug: "refresh-target",
        publishedSlugNormalized: "refresh-target",
        sysId: "page-refresh"
      })
    ];
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", pages)
    );

    const firstView = renderApp("/?workspace=product-docs&mode=edit&page=refresh-target", {
      acquireWorkspaceEditLease,
      listPages,
      releaseWorkspaceEditLease,
      resumeWorkspaceEditLease
    });

    expect(await screen.findByRole("heading", { name: "Refresh Target" })).toBeInTheDocument();
    await waitFor(() => expect(acquireWorkspaceEditLease).toHaveBeenCalledTimes(1));
    const originalStoredLease = readStoredWorkspaceLease();
    expect(originalStoredLease.token).toBe("workspace-lease-token");
    expect(originalStoredLease.tabSessionId).toBeTruthy();
    expect(window.name).toBe(`docsera.workspace-edit-lease-tab:${originalStoredLease.tabSessionId}`);
    expect(FakeBroadcastChannel.peers.get("docsera.workspace-edit-lease.v1")?.size).toBe(1);

    window.dispatchEvent(new Event("pagehide"));
    await waitFor(() => expect(FakeBroadcastChannel.peers.get("docsera.workspace-edit-lease.v1")?.size ?? 0).toBe(0));
    expect(window.sessionStorage.getItem(workspaceLeaseStorageKey())).toBe(JSON.stringify(originalStoredLease));
    expect(releaseWorkspaceEditLease).not.toHaveBeenCalled();

    firstView.unmount();

    await waitFor(() => expect(FakeBroadcastChannel.peers.get("docsera.workspace-edit-lease.v1")?.size ?? 0).toBe(0));
    expect(window.sessionStorage.getItem(workspaceLeaseStorageKey())).toBe(JSON.stringify(originalStoredLease));
    expect(releaseWorkspaceEditLease).not.toHaveBeenCalled();

    renderApp("/?workspace=product-docs&mode=edit&page=refresh-target", {
      acquireWorkspaceEditLease,
      listPages,
      releaseWorkspaceEditLease,
      resumeWorkspaceEditLease
    });

    expect(await screen.findByRole("heading", { name: "Refresh Target" })).toBeInTheDocument();
    await waitFor(() => expect(resumeWorkspaceEditLease).toHaveBeenCalledTimes(1));
    expect(resumeWorkspaceEditLease).toHaveBeenCalledWith({
      leaseToken: "workspace-lease-token",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    });
    expect(acquireWorkspaceEditLease).toHaveBeenCalledTimes(1);
    expect(releaseWorkspaceEditLease).not.toHaveBeenCalled();
    expect(screen.queryByText("This workspace is already being edited in another tab or window for your account.")).toBeNull();
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).not.toBeNull();
    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "refresh-target" });
    expect(readStoredWorkspaceLease()).toEqual(originalStoredLease);
  });

  it("resumes a same-tab hard reload from the browser navigation type even when the previous document still answers probes", async () => {
    installFakeBroadcastChannel();
    mockNavigationType("reload");
    const tabSessionId = "tab-reload";
    window.name = `docsera.workspace-edit-lease-tab:${tabSessionId}`;
    window.sessionStorage.setItem(workspaceLeaseStorageKey(), JSON.stringify({ tabSessionId, token: "workspace-lease-token" }));

    const lingeringPreviousDocument = new FakeBroadcastChannel("docsera.workspace-edit-lease.v1");
    lingeringPreviousDocument.onmessage = (event) => {
      const message = event.data;
      if (message?.kind === "probe" && message.probeId) {
        lingeringPreviousDocument.postMessage({
          kind: "active",
          bindingId: "previous-binding",
          probeId: message.probeId,
          runtimeId: "previous-runtime",
          tabSessionId,
          workspaceSysId: "workspace-001"
        });
      }
    };

    const acquireWorkspaceEditLease = vi.fn(async () => heldLease("unexpected-acquire"));
    const resumeWorkspaceEditLease = vi.fn(async () => heldLease("workspace-lease-token"));
    const releaseWorkspaceEditLease = vi.fn(async () => ({ state: "released" as const }));

    renderApp("/#/product-docs/overview?mode=edit", {
      acquireWorkspaceEditLease,
      releaseWorkspaceEditLease,
      resumeWorkspaceEditLease
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitFor(() => expect(resumeWorkspaceEditLease).toHaveBeenCalledTimes(1));
    expect(resumeWorkspaceEditLease).toHaveBeenCalledWith({
      leaseToken: "workspace-lease-token",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    });
    expect(acquireWorkspaceEditLease).not.toHaveBeenCalled();
    expect(releaseWorkspaceEditLease).not.toHaveBeenCalled();
    expect(screen.queryByText("This workspace is already being edited in another tab or window for your account.")).toBeNull();
    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" });
  });

  it("releases and clears the workspace lease when leaving edit mode", async () => {
    const releaseWorkspaceEditLease = vi.fn(async () => ({ state: "released" as const }));
    renderApp("/?workspace=product-docs&mode=edit&page=overview", { releaseWorkspaceEditLease });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitFor(() => expect(releaseWorkspaceEditLease).not.toHaveBeenCalled());
    expect(readStoredWorkspaceLease().token).toBe("workspace-lease-token");

    fireEvent.click(screen.getByRole("button", { name: "Live" }));

    await waitFor(() => expect(releaseWorkspaceEditLease).toHaveBeenCalledTimes(1));
    expect(releaseWorkspaceEditLease).toHaveBeenLastCalledWith(expect.objectContaining({ keepalive: true, workspaceSysId: "workspace-001" }));
    expect(window.sessionStorage.getItem(workspaceLeaseStorageKey())).toBeNull();
  });

  it("releases and clears the original workspace lease when switching workspaces", async () => {
    const releaseWorkspaceEditLease = vi.fn(async () => ({ state: "released" as const }));
    renderApp("/?workspace=product-docs&mode=edit&page=overview", { releaseWorkspaceEditLease });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(readStoredWorkspaceLease("workspace-001").token).toBe("workspace-lease-token");

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "API Docs" }));

    await waitFor(() => expect(releaseWorkspaceEditLease).toHaveBeenCalledTimes(1));
    expect(releaseWorkspaceEditLease).toHaveBeenLastCalledWith(expect.objectContaining({
      keepalive: true,
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    }));
    expect(window.sessionStorage.getItem(workspaceLeaseStorageKey("workspace-001"))).toBeNull();
  });

  it("blocks resume while another active runtime responds with the copied tab identity", async () => {
    installFakeBroadcastChannel();
    const firstAcquireWorkspaceEditLease = vi.fn(async () => heldLease("workspace-lease-token"));
    const secondAcquireWorkspaceEditLease = vi.fn(async () => ({
      holderDisplayName: "Ignored Name",
      sameUserDifferentSession: true,
      state: "locked" as const
    }));
    const secondResumeWorkspaceEditLease = vi.fn(async () => heldLease("workspace-lease-token"));

    const firstView = renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease: firstAcquireWorkspaceEditLease
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitFor(() => expect(FakeBroadcastChannel.peers.get("docsera.workspace-edit-lease.v1")?.size).toBe(1));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease: secondAcquireWorkspaceEditLease,
      resumeWorkspaceEditLease: secondResumeWorkspaceEditLease
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("This workspace is already being edited in another tab or window for your account.");
    expect(secondResumeWorkspaceEditLease).not.toHaveBeenCalled();
    expect(secondAcquireWorkspaceEditLease).toHaveBeenCalledTimes(1);
    expect(firstAcquireWorkspaceEditLease).toHaveBeenCalledTimes(1);

    firstView.unmount();
  });

  it("clears an invalid stored lease token and fails safely after resume rejection", async () => {
    installFakeBroadcastChannel();
    window.name = "docsera.workspace-edit-lease-tab:tab-a";
    window.sessionStorage.setItem(workspaceLeaseStorageKey(), JSON.stringify({ tabSessionId: "tab-a", token: "replaced-token" }));
    const acquireWorkspaceEditLease = vi.fn(async () => heldLease("should-not-acquire"));
    const resumeWorkspaceEditLease = vi.fn(async () => ({
      errorMessage: "Workspace lease lost.",
      holderDisplayName: null,
      sameUserDifferentSession: true,
      state: "lost" as const
    }));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      resumeWorkspaceEditLease
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("This workspace is already being edited in another tab or window for your account.");
    expect(resumeWorkspaceEditLease).toHaveBeenCalledWith({
      leaseToken: "replaced-token",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    });
    expect(acquireWorkspaceEditLease).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem(workspaceLeaseStorageKey())).toBeNull();
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).toBeNull();
  });

  it("does not release or duplicate the workspace lease during StrictMode effect cleanup replay", async () => {
    installFakeBroadcastChannel();
    const acquireWorkspaceEditLease = vi.fn(async () => heldLease("workspace-lease-token"));
    const releaseWorkspaceEditLease = vi.fn(async () => ({ state: "released" as const }));
    window.history.replaceState({}, "", "/?workspace=product-docs&mode=edit&page=overview");
    const runtime: DocseraRuntimeContext = {
      mountNode: document.createElement("div"),
      mountNodeId: "docsera-runtime",
      config: {}
    };
    const serviceNowClient = createClient({ acquireWorkspaceEditLease, releaseWorkspaceEditLease });

    render(
      <StrictMode>
        <App runtime={runtime} serviceNowClient={serviceNowClient} />
      </StrictMode>
    );

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitFor(() => expect(acquireWorkspaceEditLease).toHaveBeenCalledTimes(1));
    expect(releaseWorkspaceEditLease).not.toHaveBeenCalled();
    expect(readStoredWorkspaceLease().token).toBe("workspace-lease-token");
  });

  it("keeps a resumed binding when an obsolete acquisition responds late", async () => {
    installFakeBroadcastChannel();
    const deferredAcquire = createDeferred<ReturnType<typeof heldLease>>();
    const acquireWorkspaceEditLease = vi.fn(() => deferredAcquire.promise);
    const resumeWorkspaceEditLease = vi.fn(async () => heldLease("resumed-token"));
    const renewWorkspaceEditLease = vi.fn(async () => heldLease("resumed-token"));
    const releaseWorkspaceEditLease = vi.fn(async () => ({ state: "released" as const }));

    const firstView = renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      releaseWorkspaceEditLease,
      renewWorkspaceEditLease,
      resumeWorkspaceEditLease
    });

    await waitFor(() => expect(acquireWorkspaceEditLease).toHaveBeenCalledTimes(1));
    window.name = "docsera.workspace-edit-lease-tab:tab-a";
    window.sessionStorage.setItem(workspaceLeaseStorageKey(), JSON.stringify({ tabSessionId: "tab-a", token: "resumed-token" }));
    firstView.unmount();

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      releaseWorkspaceEditLease,
      renewWorkspaceEditLease,
      resumeWorkspaceEditLease
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitFor(() => expect(resumeWorkspaceEditLease).toHaveBeenCalledTimes(1));

    await act(async () => {
      deferredAcquire.resolve(heldLease("late-token"));
    });

    await waitFor(() => expect(releaseWorkspaceEditLease).toHaveBeenCalledTimes(1));
    expect(releaseWorkspaceEditLease).toHaveBeenCalledWith(expect.objectContaining({ leaseToken: "late-token" }));
    expect(releaseWorkspaceEditLease).not.toHaveBeenCalledWith(expect.objectContaining({ leaseToken: "resumed-token" }));
    expect(readStoredWorkspaceLease()).toEqual({ tabSessionId: "tab-a", token: "resumed-token" });
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).not.toBeNull();
    expect(screen.queryByText("This workspace is already being edited in another tab or window for your account.")).toBeNull();

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(renewWorkspaceEditLease).toHaveBeenCalledWith(expect.objectContaining({ leaseToken: "resumed-token" })));
  });

  it("keeps a replacement resume when an obsolete resume returns the shared token late", async () => {
    installFakeBroadcastChannel();
    window.name = "docsera.workspace-edit-lease-tab:tab-a";
    window.sessionStorage.setItem(workspaceLeaseStorageKey(), JSON.stringify({ tabSessionId: "tab-a", token: "resumed-token" }));
    const deferredResume = createDeferred<ReturnType<typeof heldLease>>();
    const acquireWorkspaceEditLease = vi.fn(async () => heldLease("should-not-acquire"));
    const resumeWorkspaceEditLease = vi.fn()
      .mockReturnValueOnce(deferredResume.promise)
      .mockResolvedValueOnce(heldLease("resumed-token"));
    const renewWorkspaceEditLease = vi.fn(async () => heldLease("resumed-token"));
    const releaseWorkspaceEditLease = vi.fn(async () => ({ state: "released" as const }));
    const pages = [
      createPageRecord(),
      createPageRecord({
        draftTitle: "Resume Target",
        draftSlug: "resume-target",
        draftSlugNormalized: "resume-target",
        publishedTitle: "Resume Target",
        publishedSlug: "resume-target",
        publishedSlugNormalized: "resume-target",
        sysId: "page-resume"
      })
    ];
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", pages)
    );

    const firstView = renderApp("/?workspace=product-docs&mode=edit&page=resume-target", {
      acquireWorkspaceEditLease,
      listPages,
      releaseWorkspaceEditLease,
      renewWorkspaceEditLease,
      resumeWorkspaceEditLease
    });

    await waitFor(() => expect(resumeWorkspaceEditLease).toHaveBeenCalledTimes(1));
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).toBeNull();

    firstView.unmount();

    renderApp("/?workspace=product-docs&mode=edit&page=resume-target", {
      acquireWorkspaceEditLease,
      listPages,
      releaseWorkspaceEditLease,
      renewWorkspaceEditLease,
      resumeWorkspaceEditLease
    });

    expect(await screen.findByRole("heading", { name: "Resume Target" })).toBeInTheDocument();
    await waitFor(() => expect(resumeWorkspaceEditLease).toHaveBeenCalledTimes(2));
    expect(readStoredWorkspaceLease()).toEqual({ tabSessionId: "tab-a", token: "resumed-token" });
    expect(FakeBroadcastChannel.peers.get("docsera.workspace-edit-lease.v1")?.size).toBe(1);

    await act(async () => {
      deferredResume.resolve(heldLease("resumed-token"));
    });

    await waitFor(() => expect(releaseWorkspaceEditLease).not.toHaveBeenCalled());
    expect(readStoredWorkspaceLease()).toEqual({ tabSessionId: "tab-a", token: "resumed-token" });
    expect(FakeBroadcastChannel.peers.get("docsera.workspace-edit-lease.v1")?.size).toBe(1);
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Resume Target" })).toBeInTheDocument();
    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "resume-target" });
    expect(screen.queryByText("This workspace is already being edited in another tab or window for your account.")).toBeNull();
    expect(screen.queryByText("Workspace editing is no longer available.")).toBeNull();
    expect(acquireWorkspaceEditLease).not.toHaveBeenCalled();

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
    });

    await waitFor(() => expect(renewWorkspaceEditLease).toHaveBeenCalledWith(expect.objectContaining({ leaseToken: "resumed-token" })));
  });

  it("returns to Live and retains another holder's display name after blocked Edit entry", async () => {
    const acquireWorkspaceEditLease = vi.fn(async () => ({
      holderDisplayName: "Priya Writer",
      sameUserDifferentSession: false,
      state: "locked" as const
    }));
    renderApp("/?workspace=product-docs&mode=edit&page=overview", { acquireWorkspaceEditLease });

    expect(await screen.findByRole("alert")).toHaveTextContent("This workspace is currently being edited by Priya Writer.");
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", page: "overview", mode: null }));
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).toBeNull();
  });

  it("renders the same-account tab/window holder notice after blocked Edit entry", async () => {
    const acquireWorkspaceEditLease = vi.fn(async () => ({
      holderDisplayName: "Ignored Name",
      sameUserDifferentSession: true,
      state: "locked" as const
    }));
    renderApp("/?workspace=product-docs&mode=edit&page=overview", { acquireWorkspaceEditLease });

    expect(await screen.findByRole("alert")).toHaveTextContent("This workspace is already being edited in another tab or window for your account.");
  });

  it("returns to Live with the safe server permission message after a forbidden acquisition", async () => {
    const acquireWorkspaceEditLease = vi.fn(async () => ({
      errorMessage: "You do not have permission to edit this workspace.",
      failure: "forbidden" as const,
      retryable: false,
      state: "failed" as const
    }));
    renderApp("/?workspace=product-docs&mode=edit&page=overview", { acquireWorkspaceEditLease });

    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission to edit this workspace.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("another user is editing");
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", page: "overview", mode: null }));
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).toBeNull();
  });

  it("returns to Live with the safe availability message after a transient acquisition failure", async () => {
    const acquireWorkspaceEditLease = vi.fn(async () => ({
      errorMessage: "Workspace editing is temporarily unavailable. Please try again.",
      failure: "transient" as const,
      retryable: true,
      state: "failed" as const
    }));
    renderApp("/?workspace=product-docs&mode=edit&page=overview", { acquireWorkspaceEditLease });

    expect(await screen.findByRole("alert")).toHaveTextContent("Workspace editing is temporarily unavailable. Please try again.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("another user is editing");
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", page: "overview", mode: null }));
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).toBeNull();
  });

  it("returns to Live with a safe terminal server failure without inventing a holder", async () => {
    const acquireWorkspaceEditLease = vi.fn(async () => ({
      errorMessage: "Workspace editing is unavailable for this workspace.",
      failure: "terminal" as const,
      retryable: false,
      state: "failed" as const
    }));
    renderApp("/?workspace=product-docs&mode=edit&page=overview", { acquireWorkspaceEditLease });

    expect(await screen.findByRole("alert")).toHaveTextContent("Workspace editing is unavailable for this workspace.");
    expect(screen.getByRole("alert")).not.toHaveTextContent("another user is editing");
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", page: "overview", mode: null }));
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).toBeNull();
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
      expectWorkspaceSearch({ workspace: "product-docs", page: "published-overview", mode: null });
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
    fireEvent.click(screen.getByRole("button", { name: "Details Draft" }));

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
      expectWorkspaceSearch({ workspace: "product-docs", page: "details", mode: null });
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
    fireEvent.click(screen.getByRole("button", { name: "Draft Only" }));

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

  it("keeps Page Settings open with retained values after a transient mutation recovery failure", async () => {
    const savePageSettings = vi
      .fn()
      .mockResolvedValueOnce({
        code: "lock_lost",
        errorMessage: "Workspace lease lost.",
        state: "failed" as const
      });
    const acquireWorkspaceEditLease = vi
      .fn()
      .mockResolvedValueOnce(heldLease("workspace-lease-token"))
      .mockResolvedValueOnce({
        errorMessage: "Workspace editing is temporarily unavailable. Please try again.",
        failure: "transient" as const,
        retryable: true,
        state: "failed" as const
      });

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      savePageSettings
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview" }));
    expect(await screen.findByRole("heading", { name: "Page Settings" })).toBeInTheDocument();
    const pageSettingsPanel = screen.getByRole("complementary", { name: "Page Settings" });

    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview" }));
    const titleInput = screen.getByDisplayValue("Overview");
    fireEvent.change(titleInput, { target: { value: "Overview Draft Retained" } });
    fireEvent.blur(titleInput);
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));

    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(1));
    expect(savePageSettings).toHaveBeenCalledWith(expect.objectContaining({ workspaceLeaseToken: "workspace-lease-token" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Workspace editing is temporarily unavailable. Please try again.");
    expect(screen.getByRole("heading", { name: "Page Settings" })).toBeInTheDocument();
    expect(within(pageSettingsPanel).getByRole("button", { name: "Overview Draft Retained" })).toBeInTheDocument();
    expect(within(pageSettingsPanel).getByRole("button", { name: "overview" })).toBeInTheDocument();
    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" });
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).not.toBeNull();
    expect(screen.queryByText(/currently being edited by another user/i)).toBeNull();
  });

  it("keeps Publish visually active while Page Settings save refreshes pending changes", async () => {
    const pendingRow = {
      attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
      category: "Modified" as const,
      firstPendingSequence: 1,
      lastChangedOn: "2026-07-18 00:00:00",
      navigable: true,
      pageSysId: "page-001",
      title: "Overview"
    };
    const pendingRefresh = createDeferred<WorkspacePendingChangesResult>();
    let pendingChangesResponse: Promise<WorkspacePendingChangesResult> = Promise.resolve(createPendingChangesResult([pendingRow]));
    const getWorkspacePendingChanges = vi.fn(() => pendingChangesResponse);
    const savePageSettings = vi
      .fn()
      .mockResolvedValueOnce({
        changeSetId: "change-set-001",
        changeSetRevision: 8,
        page: createPageRecord({
          draftRevision: 1,
          draftTitle: "Overview Updated",
          draftSlug: "overview-updated",
          draftSlugNormalized: "overview-updated",
          publicationState: "published_with_unpublished_changes"
        }),
        state: "succeeded" as const
      })
      .mockResolvedValueOnce({
        changeSetId: "change-set-001",
        changeSetRevision: 9,
        page: createPageRecord({
          draftRevision: 2,
          draftTitle: "Overview Clean",
          draftSlug: "overview-clean",
          draftSlugNormalized: "overview-clean",
          publicationState: "published_with_unpublished_changes"
        }),
        state: "succeeded" as const
      });

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      getWorkspacePendingChanges,
      savePageSettings
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitFor(() => expect(getWorkspacePendingChanges).toHaveBeenCalledTimes(1));
    let publish = screen.getByRole("button", { name: "Open Changes Center" });
    expect(publish).toBeEnabled();
    expect(publish).toHaveClass("docsera-header__publish-button--active");

    pendingChangesResponse = pendingRefresh.promise;
    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview" }));
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview" }));
    fireEvent.change(screen.getByDisplayValue("Overview"), { target: { value: "Overview Updated" } });
    fireEvent.blur(screen.getByDisplayValue("Overview Updated"));
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));

    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getWorkspacePendingChanges.mock.calls.length).toBeGreaterThanOrEqual(2));
    publish = screen.getByRole("button", { name: "Open Changes Center" });
    expect(publish).toHaveClass("docsera-header__publish-button--active");

    pendingRefresh.resolve(createPendingChangesResult([pendingRow]));
    await waitFor(() => expect(screen.getByRole("button", { name: "Open Changes Center" })).toBeEnabled());
    publish = screen.getByRole("button", { name: "Open Changes Center" });
    expect(publish).toHaveClass("docsera-header__publish-button--active");

    pendingChangesResponse = Promise.resolve(createPendingChangesResult([]));
    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview Updated" }));
    const updatedSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(updatedSettingsPanel).getByRole("button", { name: "Overview Updated" }));
    fireEvent.change(screen.getByDisplayValue("Overview Updated"), { target: { value: "Overview Clean" } });
    fireEvent.blur(screen.getByDisplayValue("Overview Clean"));
    fireEvent.click(within(updatedSettingsPanel).getByRole("button", { name: "Close page settings" }));
    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole("button", { name: "No pending changes to publish" })).toBeDisabled());
    expect(screen.getByRole("button", { name: "No pending changes to publish" })).not.toHaveClass("docsera-header__publish-button--active");
  }, 15000);

  it("reuses the publish command ID for a retryable failure and resets it for an independent later publish", async () => {
    const flushMicrotasks = async () => {
      await Promise.resolve();
      await Promise.resolve();
    };
    const firstPublishDeferred = createDeferred<void>();
    const pendingChanges = createPendingChangesResult([
      {
        attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
        category: "Modified",
        firstPendingSequence: 1,
        lastChangedOn: "2026-07-18 00:00:00",
        navigable: true,
        pageSysId: "page-001",
        title: "Overview"
      }
    ]);
    const publishSuccess = {
      changeSetId: "change-set-002",
      changeSetRevision: 8,
      pages: [
        createPageRecord({
          draftTitle: "Overview Published",
          draftSlug: "overview-published",
          draftSlugNormalized: "overview-published",
          publishedTitle: "Overview Published",
          publishedSlug: "overview-published",
          publishedSlugNormalized: "overview-published"
        })
      ],
      pendingChanges: createPendingChangesResult([]),
      publishedSnapshotSetId: "snapshot-set-002",
      state: "succeeded" as const,
      workspaceStateRevision: 4
    };
    const retryableFailure = {
      errorMessage: "This publish can be retried.",
      retryable: true,
      state: "failed" as const
    };
    const publishWorkspace = vi
      .fn()
      .mockImplementationOnce(() => firstPublishDeferred.promise as Promise<unknown>)
      .mockResolvedValueOnce(retryableFailure)
      .mockResolvedValueOnce(publishSuccess)
      .mockResolvedValueOnce(publishSuccess);
    const getWorkspacePendingChanges = vi.fn(async () => pendingChanges);
    const renewWorkspaceEditLease = vi.fn(async () => heldLease("workspace-lease-token-2"));

    const firstView = renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      getWorkspacePendingChanges,
      publishWorkspace,
      renewWorkspaceEditLease
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    const dialog = screen.getByRole("dialog", { name: "Changes Center" });
    const publishButton = within(dialog).getByRole("button", { name: "Publish" });
    expect(publishButton).toBeEnabled();
    fireEvent.click(publishButton);

    await act(async () => {
      await flushMicrotasks();
    });
    expect(publishWorkspace).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "New page" })).toBeDisabled();
    expect(screen.queryByText("Publishing is in progress. Authoring actions are temporarily unavailable.")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Publish" })).toHaveAttribute("aria-busy", "true");
    expect(within(dialog).getByRole("button", { name: "Publish" }).querySelector(".docsera-changes-center__spinner")).toBeInTheDocument();

    await act(async () => {
      firstPublishDeferred.reject(new Error("Transient transport failure."));
      await flushMicrotasks();
    });
    expect(screen.getByRole("alert")).toHaveTextContent("Unable to publish this workspace right now. Please try again.");
    expect(screen.getByRole("dialog", { name: "Changes Center" })).toBeInTheDocument();
    expect(screen.queryByText("Workspace changes published.")).not.toBeInTheDocument();
    expect(document.querySelector(".docsera-shell__notice")).toBeNull();
    expect(publishWorkspace).toHaveBeenCalledTimes(1);
    const firstCall = publishWorkspace.mock.calls[0][0];
    expect(firstCall).toEqual(expect.objectContaining({
      commandId: expect.any(String),
      workspaceLeaseToken: "workspace-lease-token",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    }));

    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await Promise.resolve();
    });

    await act(async () => {
      await flushMicrotasks();
    });
    expect(renewWorkspaceEditLease).toHaveBeenCalledTimes(1);
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));

    await act(async () => {
      await flushMicrotasks();
    });
    expect(publishWorkspace).toHaveBeenCalledTimes(2);
    const secondCall = publishWorkspace.mock.calls[1][0];
    expect(secondCall).toEqual(expect.objectContaining({
      commandId: firstCall.commandId,
      workspaceLeaseToken: "workspace-lease-token-2",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    }));
    expect(screen.getByRole("alert")).toHaveTextContent("This publish can be retried.");
    expect(within(dialog).getByRole("button", { name: "Publish" })).toBeEnabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));

    await act(async () => {
      await flushMicrotasks();
    });
    expect(publishWorkspace).toHaveBeenCalledTimes(3);
    const thirdCall = publishWorkspace.mock.calls[2][0];
    expect(thirdCall).toEqual(expect.objectContaining({
      commandId: firstCall.commandId,
      workspaceLeaseToken: "workspace-lease-token-2",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    }));

    const toast = document.querySelector(".docsera-header__publish-toast") as HTMLElement | null;
    expect(toast).not.toBeNull();
    expect(toast).toHaveAttribute("aria-live", "polite");
    expect(toast).toHaveTextContent("Workspace changes published.");
    expect(within(toast as HTMLElement).getByRole("button", { name: "Dismiss publish success" })).toBeInTheDocument();
    expect(toast?.querySelector(".docsera-header__publish-toast-icon")).toBeInTheDocument();
    expect(document.querySelector(".docsera-shell__notice")).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Changes Center" })).not.toBeInTheDocument();
    expect(screen.queryByText("Workspace changes published.")).toBeInTheDocument();

    firstView.unmount();

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      getWorkspacePendingChanges,
      publishWorkspace,
      renewWorkspaceEditLease
    });

    await act(async () => {
      await flushMicrotasks();
    });
    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));

    await act(async () => {
      await flushMicrotasks();
    });
    expect(publishWorkspace).toHaveBeenCalledTimes(4);
    const fourthCall = publishWorkspace.mock.calls[3][0];
    expect(fourthCall.commandId).not.toBe(firstCall.commandId);
  }, 15000);

  it("keeps publish success toast dismissal and timers scoped to the active toast", async () => {
    const readToast = () => document.querySelector(".docsera-header__publish-toast");
    const settle = async () => {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    };
    const realSetTimeout = window.setTimeout.bind(window);
    const realClearTimeout = window.clearTimeout.bind(window);
    let nextToastTimerId = 1;
    const toastTimerCallbacks = new Map<number, () => void>();
    const capturedToastTimerIds: number[] = [];

    const setTimeoutSpy = vi.spyOn(window, "setTimeout").mockImplementation(((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
      if (timeout === 3000 && typeof handler === "function") {
        const timerId = nextToastTimerId++;
        capturedToastTimerIds.push(timerId);
        toastTimerCallbacks.set(timerId, () => handler(...args));
        return timerId;
      }

      return realSetTimeout(handler, timeout, ...args);
    }) as typeof window.setTimeout);

    const clearTimeoutSpy = vi.spyOn(window, "clearTimeout").mockImplementation(((timeoutId?: number) => {
      if (typeof timeoutId === "number") {
        toastTimerCallbacks.delete(timeoutId);
      }

      return realClearTimeout(timeoutId);
    }) as typeof window.clearTimeout);

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      getWorkspacePendingChanges: vi.fn(async () => createPendingChangesResult([{
        attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
        category: "Modified",
        firstPendingSequence: 1,
        lastChangedOn: "2026-07-21 10:00:00",
        navigable: true,
        pageSysId: "page-001",
        title: "Overview"
      }])),
      publishWorkspace: vi.fn(async () => ({
        changeSetId: "change-set-001-published",
        changeSetRevision: 8,
        pages: [createPageRecord()],
        pendingChanges: createPendingChangesResult([]),
        publishedSnapshotSetId: "workspace-001-snapshot",
        state: "succeeded" as const,
        workspaceStateRevision: 5
      }))
    });

    await settle();
    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await settle();

    let toast = readToast() as HTMLElement | null;
    expect(toast).not.toBeNull();
    const firstToastTimerId = capturedToastTimerIds[capturedToastTimerIds.length - 1];
    expect(firstToastTimerId).toBeDefined();

    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    await settle();
    expect(readToast()).toBeNull();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(firstToastTimerId);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await settle();

    toast = readToast() as HTMLElement | null;
    expect(toast).not.toBeNull();
    const secondToastTimerId = capturedToastTimerIds[capturedToastTimerIds.length - 1];
    expect(secondToastTimerId).toBeDefined();
    expect(secondToastTimerId).not.toBe(firstToastTimerId);

    await act(async () => {
      toastTimerCallbacks.get(firstToastTimerId!)?.();
    });
    expect(readToast()).not.toBeNull();

    fireEvent.click(within(toast as HTMLElement).getByRole("button", { name: "Dismiss publish success" }));
    expect(readToast()).toBeNull();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(secondToastTimerId);
    await act(async () => {
      toastTimerCallbacks.get(secondToastTimerId!)?.();
    });
    expect(readToast()).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await settle();
    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    await settle();
    const thirdToastTimerId = capturedToastTimerIds[capturedToastTimerIds.length - 1];
    expect(thirdToastTimerId).toBeDefined();

    await act(async () => {
      toastTimerCallbacks.get(thirdToastTimerId!)?.();
    });
    expect(readToast()).toBeNull();

    setTimeoutSpy.mockRestore();
    clearTimeoutSpy.mockRestore();
  }, 15000);

  it("clears the publish success toast when the active workspace changes", async () => {
    const getWorkspace = vi.fn(async (workspaceSlug: string) => ({
      workspace: workspaceSlug === "api-docs"
        ? createWorkspace({ slug: "api-docs", sysId: "workspace-002", name: "API Docs" })
        : createWorkspace({ slug: "product-docs", sysId: "workspace-001", name: "Product Docs" })
    }));
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }): Promise<PageListResult> => ({
      items: [
        workspaceSlug === "api-docs"
          ? createPageRecord({
              sysId: "page-101",
              workspaceSysId: "workspace-002",
              draftTitle: "API Overview",
              publishedTitle: "API Overview"
            })
          : createPageRecord()
      ],
      mode: (mode === "edit" ? "edit" : "live") as WorkspaceMode,
      totalCount: 1,
      workspaceSlug,
      workspaceSysId: workspaceSlug === "api-docs" ? "workspace-002" : "workspace-001"
    }));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      getWorkspace,
      getWorkspacePendingChanges: vi.fn(async () => createPendingChangesResult([{
        attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
        category: "Modified",
        firstPendingSequence: 1,
        lastChangedOn: "2026-07-21 10:00:00",
        navigable: true,
        pageSysId: "page-001",
        title: "Overview"
      }])),
      listPages,
      publishWorkspace: vi.fn(async () => ({
        changeSetId: "change-set-001-published",
        changeSetRevision: 8,
        pages: [createPageRecord()],
        pendingChanges: createPendingChangesResult([]),
        publishedSnapshotSetId: "workspace-001-snapshot",
        state: "succeeded" as const,
        workspaceStateRevision: 5
      }))
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("Workspace changes published.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "API Docs" }));

    expect(await screen.findByRole("heading", { name: "API Overview" })).toBeInTheDocument();
    expect(document.querySelector(".docsera-header__publish-toast")).toBeNull();
  }, 15000);

  it("blocks Page Settings, inline create, and delete persistence until stale refresh succeeds", async () => {
    const refreshDeferred = createDeferred<PageListResult>();
    let editListCount = 0;
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }): Promise<PageListResult> => {
      if (mode === "edit") {
        editListCount += 1;
        if (editListCount === 1) {
          return createPageListResult("edit", [
            createPageRecord({
              draftTitle: "Overview Draft",
              publicationState: "published_with_unpublished_changes"
            }),
            createPageRecord({
              sysId: "page-002",
              parentPageSysId: "page-001",
              siblingOrder: 2,
              draftTitle: "Child Draft",
              draftSlug: "child",
              draftSlugNormalized: "child",
              publishedTitle: "Child",
              publishedSlug: "child",
              publishedSlugNormalized: "child",
              publicationState: "published_with_unpublished_changes"
            })
          ]);
        }
        return refreshDeferred.promise;
      }

      return createPageListResult("live", [
        createPageRecord({
          draftTitle: "Overview",
          publishedTitle: "Overview"
        })
      ]);
    });
    const savePageSettings = vi
      .fn()
      .mockResolvedValueOnce({
        code: "conflict" as const,
        currentChangeSetId: "change-set-001",
        currentChangeSetRevision: 8,
        errorMessage: "The active draft generation changed. Reload before saving again.",
        state: "failed" as const
      })
      .mockResolvedValueOnce({
        changeSetId: "change-set-001",
        changeSetRevision: 9,
        page: createPageRecord({
          draftTitle: "Overview Refreshed",
          publicationState: "published_with_unpublished_changes"
        }),
        state: "succeeded" as const
      });
    const createPage = vi.fn(async (): Promise<PageCreateResult> => ({
      code: "failed",
      errorMessage: "createPage should stay blocked during stale refresh",
      state: "failed"
    }));
    const deletePage = vi.fn(async () => ({
      code: "failed" as const,
      errorMessage: "deletePage should stay blocked during stale refresh",
      state: "failed" as const
    }));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      createPage,
      deletePage,
      listPages,
      savePageSettings
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview Draft" }));
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview Draft" }));
    const titleInput = screen.getByDisplayValue("Overview Draft");
    fireEvent.change(titleInput, { target: { value: "Overview Pending Refresh" } });
    fireEvent.blur(titleInput);
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));

    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(1));
    expect(savePageSettings).toHaveBeenCalledWith(expect.objectContaining({
      workspaceAuthority: expect.objectContaining({ changeSetId: "change-set-001", changeSetRevision: 7 }),
      workspaceLeaseToken: "workspace-lease-token"
    }));
    expect(await screen.findByRole("heading", { name: "Page Settings" })).toBeInTheDocument();
    expect(within(pageSettingsPanel).getByRole("button", { name: "Overview Pending Refresh" })).toBeInTheDocument();

    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));
    expect(savePageSettings).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("alert")).toHaveTextContent("Reloading the latest draft projection. Saving is temporarily unavailable.");

    fireEvent.click(screen.getAllByRole("button", { name: "New page" })[0]);
    expect(createPage).toHaveBeenCalledTimes(0);
    expect(screen.queryByRole("textbox", { name: "New page title" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Delete page" }));
    const deleteDialog = await screen.findByRole("dialog", { name: "Confirm deletion" });
    fireEvent.click(within(deleteDialog).getByRole("button", { name: "Delete page" }));
    expect(deletePage).toHaveBeenCalledTimes(0);
    expect(await within(deleteDialog).findByRole("alert")).toHaveTextContent("Reloading the latest draft projection. Saving is temporarily unavailable.");

    await act(async () => {
      refreshDeferred.resolve(createPageListResult("edit", [
        createPageRecord({
          draftTitle: "Overview Refreshed",
          publicationState: "published_with_unpublished_changes"
        }),
        createPageRecord({
          sysId: "page-002",
          parentPageSysId: "page-001",
          siblingOrder: 2,
          draftTitle: "Child Draft",
          draftSlug: "child",
          draftSlugNormalized: "child",
          publishedTitle: "Child",
          publishedSlug: "child",
          publishedSlugNormalized: "child",
          publicationState: "published_with_unpublished_changes"
        })
      ]));
      await Promise.resolve();
    });

    expect(savePageSettings).toHaveBeenCalledTimes(1);
    expect(await screen.findByRole("heading", { name: "Overview Refreshed" })).toBeInTheDocument();
    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" });

    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));
    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(2));
    expect(savePageSettings).toHaveBeenLastCalledWith(expect.objectContaining({
      workspaceAuthority: expect.objectContaining({ changeSetId: "change-set-001", changeSetRevision: 8 }),
      workspaceLeaseToken: "workspace-lease-token"
    }));
  });

  it("surfaces stale-refresh reload failure through the existing retry flow without replaying the rejected Page Settings save", async () => {
    const refreshRetryDeferred = createDeferred<PageListResult>();
    let editListCount = 0;
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }): Promise<PageListResult> => {
      if (mode === "edit") {
        editListCount += 1;
        if (editListCount === 1) {
          return createPageListResult("edit", [
            createPageRecord({
              draftTitle: "Overview Draft",
              publicationState: "published_with_unpublished_changes"
            })
          ]);
        }
        if (editListCount === 2) {
          throw new Error("Refresh failed.");
        }
        return refreshRetryDeferred.promise;
      }

      return createPageListResult("live", [
        createPageRecord({
          draftTitle: "Overview",
          publishedTitle: "Overview"
        })
      ]);
    });
    const savePageSettings = vi
      .fn()
      .mockResolvedValueOnce({
        code: "conflict" as const,
        currentChangeSetId: "change-set-001",
        currentChangeSetRevision: 8,
        errorMessage: "The active draft generation changed. Reload before saving again.",
        state: "failed" as const
      })
      .mockResolvedValueOnce({
        changeSetId: "change-set-001",
        changeSetRevision: 9,
        page: createPageRecord({
          draftTitle: "Overview After Retry",
          publicationState: "published_with_unpublished_changes"
        }),
        state: "succeeded" as const
      });

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      listPages,
      savePageSettings
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview Draft" }));
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview Draft" }));
    const titleInput = screen.getByDisplayValue("Overview Draft");
    fireEvent.change(titleInput, { target: { value: "Overview Retry Pending" } });
    fireEvent.blur(titleInput);
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));

    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("heading", { name: "Pages unavailable" })).toBeInTheDocument();

    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));
    expect(savePageSettings).toHaveBeenCalledTimes(1);
    expect(listPages).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(listPages).toHaveBeenCalledTimes(3));

    await act(async () => {
      refreshRetryDeferred.resolve(createPageListResult("edit", [
        createPageRecord({
          draftTitle: "Overview After Retry",
          publicationState: "published_with_unpublished_changes"
        })
      ]));
      await Promise.resolve();
    });

    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));
    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(2));
    expect(savePageSettings).toHaveBeenLastCalledWith(expect.objectContaining({
      workspaceAuthority: expect.objectContaining({ changeSetId: "change-set-001", changeSetRevision: 8 }),
      workspaceLeaseToken: "workspace-lease-token"
    }));
  });

  it("ignores stale projection recovery success after the same workspace gets a replacement lease", async () => {
    const staleRefreshDeferred = createDeferred<PageListResult>();
    let editListCount = 0;
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }): Promise<PageListResult> => {
      if (mode !== "edit") {
        return createPageListResult("live", [createPageRecord({ publishedTitle: "Overview", draftTitle: "Overview" })]);
      }
      editListCount += 1;
      if (editListCount === 1) {
        return createPageListResult("edit", [createPageRecord({ draftTitle: "Overview A" })]);
      }
      if (editListCount === 2) {
        return staleRefreshDeferred.promise;
      }
      return createPageListResult("edit", [createPageRecord({ draftTitle: "Overview B" })]);
    });
    const acquireWorkspaceEditLease = vi
      .fn()
      .mockResolvedValueOnce(heldLease("workspace-lease-token"))
      .mockResolvedValueOnce({ ...heldLease("replacement-lease-token"), changeSetRevision: 20 });
    const releaseWorkspaceEditLease = vi.fn(async () => ({ state: "released" as const }));
    const savePageSettings = vi
      .fn()
      .mockResolvedValueOnce({
        code: "conflict" as const,
        currentChangeSetId: "change-set-001",
        currentChangeSetRevision: 8,
        errorMessage: "The active draft generation changed. Reload before saving again.",
        state: "failed" as const
      })
      .mockResolvedValueOnce({
        changeSetId: "change-set-001",
        changeSetRevision: 21,
        page: createPageRecord({ draftTitle: "Overview B Saved" }),
        state: "succeeded" as const
      });

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      listPages,
      releaseWorkspaceEditLease,
      savePageSettings
    });

    expect(await screen.findByRole("heading", { name: "Overview A" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview A" }));
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview A" }));
    fireEvent.change(screen.getByDisplayValue("Overview A"), { target: { value: "Overview A Pending" } });
    fireEvent.blur(screen.getByDisplayValue("Overview A Pending"));
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));
    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("heading", { name: "Overview B" })).toBeInTheDocument();

    await act(async () => {
      staleRefreshDeferred.resolve(createPageListResult("edit", [createPageRecord({ draftTitle: "Old Recovery Projection" })]));
      await Promise.resolve();
    });

    expect(screen.queryByRole("heading", { name: "Old Recovery Projection" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Overview B" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview B" }));
    const replacementPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(replacementPanel).getByRole("button", { name: "Overview B" }));
    fireEvent.change(screen.getByDisplayValue("Overview B"), { target: { value: "Overview B Saved" } });
    fireEvent.blur(screen.getByDisplayValue("Overview B Saved"));
    fireEvent.click(within(replacementPanel).getByRole("button", { name: "Close page settings" }));

    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(2));
    expect(savePageSettings).toHaveBeenLastCalledWith(expect.objectContaining({
      workspaceAuthority: expect.objectContaining({ changeSetId: "change-set-001", changeSetRevision: 20 }),
      workspaceLeaseToken: "replacement-lease-token"
    }));
  });

  it("ignores stale projection recovery failure after the same workspace gets a replacement lease", async () => {
    const staleRefreshDeferred = createDeferred<PageListResult>();
    let editListCount = 0;
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }): Promise<PageListResult> => {
      if (mode !== "edit") {
        return createPageListResult("live", [createPageRecord({ publishedTitle: "Overview", draftTitle: "Overview" })]);
      }
      editListCount += 1;
      if (editListCount === 1) {
        return createPageListResult("edit", [createPageRecord({ draftTitle: "Overview A" })]);
      }
      if (editListCount === 2) {
        return staleRefreshDeferred.promise;
      }
      return createPageListResult("edit", [createPageRecord({ draftTitle: "Overview B" })]);
    });
    const acquireWorkspaceEditLease = vi
      .fn()
      .mockResolvedValueOnce(heldLease("workspace-lease-token"))
      .mockResolvedValueOnce({ ...heldLease("replacement-lease-token"), changeSetRevision: 20 });
    const savePageSettings = vi.fn(async (): Promise<PageSettingsSaveResult> => ({
      code: "conflict",
      currentChangeSetId: "change-set-001",
      currentChangeSetRevision: 8,
      errorMessage: "The active draft generation changed. Reload before saving again.",
      state: "failed"
    }));
    const createPage = vi.fn(async (): Promise<PageCreateResult> => ({
      changeSetId: "change-set-001",
      changeSetRevision: 21,
      page: createPageRecord({ draftSlug: "replacement-page", draftTitle: "Replacement page" }),
      state: "succeeded"
    }));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      createPage,
      listPages,
      savePageSettings
    });

    expect(await screen.findByRole("heading", { name: "Overview A" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview A" }));
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview A" }));
    fireEvent.change(screen.getByDisplayValue("Overview A"), { target: { value: "Overview A Pending" } });
    fireEvent.blur(screen.getByDisplayValue("Overview A Pending"));
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));
    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("heading", { name: "Overview B" })).toBeInTheDocument();

    await act(async () => {
      staleRefreshDeferred.reject(new Error("Old recovery failed."));
      await Promise.resolve();
    });

    expect(screen.queryByRole("heading", { name: "Pages unavailable" })).toBeNull();
    expect(screen.getByRole("heading", { name: "Overview B" })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "New page" })[0]);
    const titleInput = await screen.findByRole("textbox", { name: "New page title" });
    fireEvent.change(titleInput, { target: { value: "Replacement page" } });
    fireEvent.keyDown(titleInput, { key: "Enter" });
    await waitFor(() => expect(createPage).toHaveBeenCalledWith(expect.objectContaining({
      workspaceAuthority: expect.objectContaining({ changeSetId: "change-set-001", changeSetRevision: 20 }),
      workspaceLeaseToken: "replacement-lease-token"
    })));
  });

  it("captures Page Settings before forced Live and restores them only after deliberate Edit re-entry", async () => {
    const savePageSettings = vi
      .fn()
      .mockResolvedValueOnce({
        code: "lock_lost",
        errorMessage: "Workspace lease lost.",
        state: "failed" as const
      })
      .mockResolvedValueOnce({
        page: createPageRecord({
          draftSlug: "overview-restored",
          draftSlugNormalized: "overview-restored",
          draftTitle: "Overview Restored"
        }),
        state: "succeeded" as const
      });
    const acquireWorkspaceEditLease = vi
      .fn()
      .mockResolvedValueOnce(heldLease("workspace-lease-token"))
      .mockResolvedValueOnce({
        holderDisplayName: "Priya Writer",
        sameUserDifferentSession: false,
        state: "locked" as const
      })
      .mockResolvedValueOnce(heldLease("replacement-lease-token"));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      savePageSettings
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview" }));
    expect(await screen.findByRole("heading", { name: "Page Settings" })).toBeInTheDocument();
    const pageSettingsPanel = screen.getByRole("complementary", { name: "Page Settings" });

    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview" }));
    const titleInput = screen.getByDisplayValue("Overview");
    fireEvent.change(titleInput, { target: { value: "Overview Restored" } });
    fireEvent.blur(titleInput);
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "overview" }));
    const slugInput = screen.getByDisplayValue("overview");
    fireEvent.change(slugInput, { target: { value: "overview-restored" } });
    fireEvent.blur(slugInput);
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));

    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveTextContent("This workspace is currently being edited by Priya Writer.");
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", page: "overview" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));

    expect(await screen.findByRole("heading", { name: "Page Settings" })).toBeInTheDocument();
    expect(screen.getByText("Your unsaved Page Settings changes were restored. Review them before saving.")).toBeInTheDocument();
    expect(within(screen.getByRole("complementary", { name: "Page Settings" })).getByRole("button", { name: "Overview Restored" })).toBeInTheDocument();
    expect(within(screen.getByRole("complementary", { name: "Page Settings" })).getByRole("button", { name: "overview-restored" })).toBeInTheDocument();
    expect(savePageSettings).toHaveBeenCalledTimes(1);
  });

  it("clears existing Page Settings recovery when Edit re-entry acquisition returns forbidden", async () => {
    const savePageSettings = vi.fn(async (): Promise<PageSettingsSaveResult> => ({
      code: "lock_lost",
      errorMessage: "Workspace lease lost.",
      state: "failed"
    }));
    const acquireWorkspaceEditLease = vi
      .fn()
      .mockResolvedValueOnce(heldLease("workspace-lease-token"))
      .mockResolvedValueOnce({
        holderDisplayName: "Priya Writer",
        sameUserDifferentSession: false,
        state: "locked" as const
      })
      .mockResolvedValueOnce({
        errorMessage: "You do not have permission to edit this workspace.",
        failure: "forbidden" as const,
        retryable: false,
        state: "failed" as const
      })
      .mockResolvedValueOnce(heldLease("replacement-lease-token"));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      savePageSettings
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview" }));
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview" }));
    const titleInput = screen.getByDisplayValue("Overview");
    fireEvent.change(titleInput, { target: { value: "Overview Forbidden Re-entry" } });
    fireEvent.blur(titleInput);
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This workspace is currently being edited by Priya Writer.");
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", page: "overview" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission to edit this workspace.");
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", page: "overview" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));

    expect(screen.queryByText("Your unsaved Page Settings changes were restored. Review them before saving.")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Page Settings" })).toBeNull();
  });

  it("clears the stale Page Settings snapshot when the server title changed before Edit re-entry", async () => {
    const savePageSettings = vi.fn(async (): Promise<PageSettingsSaveResult> => ({
      code: "lock_lost",
      errorMessage: "Workspace lease lost.",
      state: "failed"
    }));
    const acquireWorkspaceEditLease = vi
      .fn()
      .mockResolvedValueOnce(heldLease("workspace-lease-token"))
      .mockResolvedValueOnce({
        holderDisplayName: "Priya Writer",
        sameUserDifferentSession: false,
        state: "locked" as const
      })
      .mockResolvedValueOnce(heldLease("replacement-lease-token"));
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(
        mode === "edit" && acquireWorkspaceEditLease.mock.calls.length >= 3 ? "edit" : mode === "edit" ? "edit" : "live",
        [
          createPageRecord({
            draftTitle: mode === "edit" && acquireWorkspaceEditLease.mock.calls.length >= 3 ? "Overview Server Changed" : "Overview Draft",
            publishedTitle: mode === "edit" && acquireWorkspaceEditLease.mock.calls.length >= 3 ? "Overview Server Changed" : "Overview"
          })
        ]
      )
    );

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      listPages,
      savePageSettings
    });

    expect(await screen.findByRole("button", { name: /Open settings for Overview/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Open settings for Overview/i }));
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview Draft" }));
    const titleInput = screen.getByDisplayValue("Overview Draft");
    fireEvent.change(titleInput, { target: { value: "Overview Restored" } });
    fireEvent.blur(titleInput);
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This workspace is currently being edited by Priya Writer.");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));
    expect(await screen.findByText("Your earlier Page Settings changes could not be restored because the shared page settings changed.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Page Settings" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    expect(await screen.findByRole("heading", { name: "Overview Server Changed" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));
    expect(screen.queryByText("Your earlier Page Settings changes could not be restored because the shared page settings changed.")).toBeNull();
  });

  it("clears the stale Page Settings snapshot when the server slug changed before Edit re-entry", async () => {
    const savePageSettings = vi.fn(async (): Promise<PageSettingsSaveResult> => ({
      code: "lock_lost",
      errorMessage: "Workspace lease lost.",
      state: "failed"
    }));
    const acquireWorkspaceEditLease = vi
      .fn()
      .mockResolvedValueOnce(heldLease("workspace-lease-token"))
      .mockResolvedValueOnce({
        holderDisplayName: "Priya Writer",
        sameUserDifferentSession: false,
        state: "locked" as const
      })
      .mockResolvedValueOnce(heldLease("replacement-lease-token"));
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(
        mode === "edit" && acquireWorkspaceEditLease.mock.calls.length >= 3 ? "edit" : mode === "edit" ? "edit" : "live",
        [
          createPageRecord({
            draftSlug: mode === "edit" && acquireWorkspaceEditLease.mock.calls.length >= 3 ? "overview-server-changed" : "overview",
            draftSlugNormalized: mode === "edit" && acquireWorkspaceEditLease.mock.calls.length >= 3 ? "overview-server-changed" : "overview",
            publishedSlug: mode === "edit" && acquireWorkspaceEditLease.mock.calls.length >= 3 ? "overview-server-changed" : "overview",
            publishedSlugNormalized: mode === "edit" && acquireWorkspaceEditLease.mock.calls.length >= 3 ? "overview-server-changed" : "overview"
          })
        ]
      )
    );

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      listPages,
      savePageSettings
    });

    expect(await screen.findByRole("button", { name: /Open settings for Overview/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Open settings for Overview/i }));
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "overview" }));
    const slugInput = screen.getByDisplayValue("overview");
    fireEvent.change(slugInput, { target: { value: "overview-restored" } });
    fireEvent.blur(slugInput);
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This workspace is currently being edited by Priya Writer.");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));
    expect(await screen.findByText("Your earlier Page Settings changes could not be restored because the shared page settings changed.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Page Settings" })).toBeNull();
  });

  it("retains inline page-create title and parent after a transient recovery failure, then retries on a later action", async () => {
    const createdChild = createPageRecord({
      sysId: "page-003",
      parentPageSysId: "page-001",
      draftTitle: "Nested draft",
      draftSlug: "nested-draft",
      draftSlugNormalized: "nested-draft",
      publishedTitle: null,
      publishedSlug: null,
      publishedSlugNormalized: null,
      publicationState: "draft"
    });
    const createPage = vi
      .fn()
      .mockResolvedValueOnce({
        code: "lock_lost",
        errorMessage: "Workspace lease lost.",
        state: "failed" as const
      })
      .mockResolvedValueOnce({
        page: createdChild,
        state: "succeeded" as const
      });
    const acquireWorkspaceEditLease = vi
      .fn()
      .mockResolvedValueOnce(heldLease("workspace-lease-token"))
      .mockResolvedValueOnce({
        errorMessage: "Workspace editing is temporarily unavailable. Please try again.",
        failure: "transient" as const,
        retryable: true,
        state: "failed" as const
      })
      .mockResolvedValueOnce(heldLease("replacement-lease-token"));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      createPage,
      listPages: vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
        createPageListResult(mode === "edit" ? "edit" : "live", [
          createPageRecord({ draftTitle: "Overview Draft", publicationState: "published_with_unpublished_changes" }),
          createPageRecord({
            sysId: "page-002",
            parentPageSysId: "page-001",
            siblingOrder: 2,
            draftTitle: "Child Draft",
            draftSlug: "child",
            draftSlugNormalized: "child",
            publishedTitle: "Child",
            publishedSlug: "child",
            publishedSlugNormalized: "child",
            publicationState: "published_with_unpublished_changes"
          })
        ])
      )
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add child page to Overview Draft" }));

    const titleInput = await screen.findByRole("textbox", { name: "New page title" });
    fireEvent.change(titleInput, { target: { value: "Nested draft" } });
    fireEvent.keyDown(titleInput, { key: "Enter" });

    await waitFor(() => expect(createPage).toHaveBeenCalledTimes(1));
    expect(createPage).toHaveBeenCalledWith(expect.objectContaining({
      parentPageSysId: "page-001",
      title: "Nested draft",
      workspaceLeaseToken: "workspace-lease-token"
    }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Workspace editing is temporarily unavailable. Please try again.");
    expect(screen.getByRole("textbox", { name: "New page title" })).toHaveValue("Nested draft");
    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" });

    fireEvent.keyDown(screen.getByRole("textbox", { name: "New page title" }), { key: "Enter" });

    await waitFor(() => expect(createPage).toHaveBeenCalledTimes(2));
    expect(createPage).toHaveBeenLastCalledWith(expect.objectContaining({
      parentPageSysId: "page-001",
      title: "Nested draft",
      workspaceLeaseToken: "replacement-lease-token"
    }));
    expect(await screen.findByRole("heading", { name: "Nested draft" })).toBeInTheDocument();
    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "nested-draft" });
  });

  it("restores inline-create input after forced Live and falls back to the root when the original parent is gone", async () => {
    const createPage = vi.fn(async (): Promise<PageCreateResult> => ({
      code: "lock_lost",
      errorMessage: "Workspace lease lost.",
      state: "failed" as const
    }));
    const acquireWorkspaceEditLease = vi
      .fn()
      .mockResolvedValueOnce(heldLease("workspace-lease-token"))
      .mockResolvedValueOnce({
        holderDisplayName: "Priya Writer",
        sameUserDifferentSession: false,
        state: "locked" as const
      })
      .mockResolvedValueOnce(heldLease("replacement-lease-token"));
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(
        mode === "edit" && acquireWorkspaceEditLease.mock.calls.length >= 3
          ? "edit"
          : mode === "edit"
            ? "edit"
            : "live",
        mode === "edit" && acquireWorkspaceEditLease.mock.calls.length >= 3
          ? [createPageRecord({ draftTitle: "Overview Draft", publicationState: "published_with_unpublished_changes" })]
          : [
              createPageRecord({ draftTitle: "Overview Draft", publicationState: "published_with_unpublished_changes" }),
              createPageRecord({
                sysId: "page-002",
                parentPageSysId: "page-001",
                siblingOrder: 2,
                draftTitle: "Child Draft",
                draftSlug: "child",
                draftSlugNormalized: "child",
                publishedTitle: "Child",
                publishedSlug: "child",
                publishedSlugNormalized: "child",
                publicationState: "published_with_unpublished_changes"
              }),
              createPageRecord({
                sysId: "page-003",
                parentPageSysId: "page-002",
                siblingOrder: 1,
                draftTitle: "Grandchild Draft",
                draftSlug: "grandchild",
                draftSlugNormalized: "grandchild",
                publishedTitle: "Grandchild",
                publishedSlug: "grandchild",
                publishedSlugNormalized: "grandchild",
                publicationState: "published_with_unpublished_changes"
              })
            ]
      )
    );

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      createPage,
      listPages
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add child page to Child Draft" }));
    const titleInput = await screen.findByRole("textbox", { name: "New page title" });
    fireEvent.change(titleInput, { target: { value: "Nested draft" } });
    fireEvent.keyDown(titleInput, { key: "Enter" });

    await waitFor(() => expect(createPage).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveTextContent("This workspace is currently being edited by Priya Writer.");
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", page: "overview" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));

    expect(await screen.findByRole("textbox", { name: "New page title" })).toHaveValue("Nested draft");
    expect(screen.getByText("The original parent is no longer available. Review the restored title before creating the page.")).toBeInTheDocument();
    expect(createPage).toHaveBeenCalledTimes(1);
  });

  it("clears existing inline-create recovery when Edit re-entry acquisition returns forbidden", async () => {
    const createPage = vi.fn(async (): Promise<PageCreateResult> => ({
      code: "lock_lost",
      errorMessage: "Workspace lease lost.",
      state: "failed"
    }));
    const acquireWorkspaceEditLease = vi
      .fn()
      .mockResolvedValueOnce(heldLease("workspace-lease-token"))
      .mockResolvedValueOnce({
        holderDisplayName: "Priya Writer",
        sameUserDifferentSession: false,
        state: "locked" as const
      })
      .mockResolvedValueOnce({
        errorMessage: "You do not have permission to edit this workspace.",
        failure: "forbidden" as const,
        retryable: false,
        state: "failed" as const
      })
      .mockResolvedValueOnce(heldLease("replacement-lease-token"));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      createPage,
      listPages: vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
        createPageListResult(mode === "edit" ? "edit" : "live", [
          createPageRecord({ draftTitle: "Overview Draft", publicationState: "published_with_unpublished_changes" })
        ])
      )
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "New page" })[0]);
    const titleInput = await screen.findByRole("textbox", { name: "New page title" });
    fireEvent.change(titleInput, { target: { value: "Forbidden recovery child" } });
    fireEvent.keyDown(titleInput, { key: "Enter" });

    expect(await screen.findByRole("alert")).toHaveTextContent("This workspace is currently being edited by Priya Writer.");
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", page: "overview" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission to edit this workspace.");
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", page: "overview" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));

    expect(screen.queryByRole("textbox", { name: "New page title" })).toBeNull();
  });

  it("ignores a stale forbidden re-entry acquisition after navigation changes the active workspace", async () => {
    const staleAcquireDeferred = createDeferred<{
      errorMessage: string;
      failure: "forbidden";
      retryable: false;
      state: "failed";
    }>();
    const savePageSettings = vi.fn(async (): Promise<PageSettingsSaveResult> => ({
      code: "lock_lost",
      errorMessage: "Workspace lease lost.",
      state: "failed"
    }));
    const acquireWorkspaceEditLease = vi
      .fn()
      .mockResolvedValueOnce(heldLease("workspace-lease-token"))
      .mockResolvedValueOnce({
        holderDisplayName: "Priya Writer",
        sameUserDifferentSession: false,
        state: "locked" as const
      })
      .mockImplementationOnce(() => staleAcquireDeferred.promise)
      .mockResolvedValueOnce(heldLease("replacement-lease-token"));
    const getWorkspace = vi.fn(async (workspaceSlug: string) => ({
      workspace:
        workspaceSlug === "api-docs"
          ? createWorkspace({
              name: "API Docs",
              slug: "api-docs",
              sysId: "workspace-002"
            })
          : createWorkspace()
    }));
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }): Promise<PageListResult> => {
      if (workspaceSlug === "api-docs") {
        const apiMode: WorkspaceMode = mode === "edit" ? "edit" : "live";
        return {
          items: [
            createPageRecord({
              draftSlug: "api-overview",
              draftSlugNormalized: "api-overview",
              draftTitle: "API Overview",
              publishedSlug: "api-overview",
              publishedSlugNormalized: "api-overview",
              publishedTitle: "API Overview",
              workspaceSysId: "workspace-002"
            })
          ],
          mode: apiMode,
          totalCount: 1,
          workspaceSlug: "api-docs",
          workspaceSysId: "workspace-002"
        };
      }

      return createPageListResult(mode === "edit" ? "edit" : "live", [
        createPageRecord({
          draftTitle: "Overview Draft",
          publicationState: "published_with_unpublished_changes"
        })
      ]);
    });

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      getWorkspace,
      listPages,
      savePageSettings
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview Draft" }));
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview Draft" }));
    const titleInput = screen.getByDisplayValue("Overview Draft");
    fireEvent.change(titleInput, { target: { value: "Recovered after stale forbidden" } });
    fireEvent.blur(titleInput);
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This workspace is currently being edited by Priya Writer.");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expect(acquireWorkspaceEditLease).toHaveBeenCalledTimes(3));

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "API Docs" }));
    expect(await screen.findByRole("heading", { name: "API Overview" })).toBeInTheDocument();

    await act(async () => {
      staleAcquireDeferred.resolve({
        errorMessage: "You do not have permission to edit this workspace.",
        failure: "forbidden",
        retryable: false,
        state: "failed"
      });
      await Promise.resolve();
    });

    expectWorkspaceSearch({ workspace: "api-docs", page: "api-overview" });
    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: API Docs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Product Docs" }));
    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));
    expect(await screen.findByRole("heading", { name: "Page Settings" })).toBeInTheDocument();
    expect(screen.getByText("Your unsaved Page Settings changes were restored. Review them before saving.")).toBeInTheDocument();
  });

  it("clears prior workspace recovery when that same workspace loads as viewer-only", async () => {
    const savePageSettings = vi.fn(async (): Promise<PageSettingsSaveResult> => ({
      code: "lock_lost",
      errorMessage: "Workspace lease lost.",
      state: "failed"
    }));
    const getWorkspace = vi
      .fn()
      .mockResolvedValueOnce({
        workspace: createWorkspace()
      })
      .mockResolvedValueOnce({
        workspace: createWorkspace({
          name: "API Docs",
          slug: "api-docs",
          sysId: "workspace-002"
        })
      })
      .mockResolvedValueOnce({
        workspace: createWorkspace({
          canManageSettings: false,
          roleLabel: null,
          slug: "product-docs",
          sysId: "workspace-001"
        })
      })
      .mockResolvedValueOnce({
        workspace: createWorkspace({
          name: "API Docs",
          slug: "api-docs",
          sysId: "workspace-002"
        })
      })
      .mockResolvedValueOnce({
        workspace: createWorkspace()
      })
      .mockImplementation(async (workspaceSlug: string) => ({
        workspace:
          workspaceSlug === "api-docs"
            ? createWorkspace({
                name: "API Docs",
                slug: "api-docs",
                sysId: "workspace-002"
              })
            : createWorkspace()
      }));
    const acquireWorkspaceEditLease = vi
      .fn()
      .mockResolvedValueOnce(heldLease("workspace-lease-token"))
      .mockResolvedValueOnce({
        holderDisplayName: "Priya Writer",
        sameUserDifferentSession: false,
        state: "locked" as const
      })
      .mockResolvedValueOnce(heldLease("replacement-lease-token"));
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }): Promise<PageListResult> => {
      if (workspaceSlug === "api-docs") {
        const apiMode: WorkspaceMode = mode === "edit" ? "edit" : "live";
        return {
          items: [
            createPageRecord({
              draftSlug: "api-overview",
              draftSlugNormalized: "api-overview",
              draftTitle: "API Overview",
              publishedSlug: "api-overview",
              publishedSlugNormalized: "api-overview",
              publishedTitle: "API Overview",
              workspaceSysId: "workspace-002"
            })
          ],
          mode: apiMode,
          totalCount: 1,
          workspaceSlug: "api-docs",
          workspaceSysId: "workspace-002"
        };
      }

      return createPageListResult(mode === "edit" ? "edit" : "live", [
        createPageRecord({
          draftTitle: mode === "edit" ? "Overview Draft" : "Overview",
          publicationState: mode === "edit" ? "published_with_unpublished_changes" : "published"
        })
      ]);
    });

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      getWorkspace,
      listPages,
      savePageSettings
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview Draft" }));
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview Draft" }));
    const titleInput = screen.getByDisplayValue("Overview Draft");
    fireEvent.change(titleInput, { target: { value: "Viewer cleared title" } });
    fireEvent.blur(titleInput);
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This workspace is currently being edited by Priya Writer.");

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "API Docs" }));
    expect(await screen.findByRole("heading", { name: "API Overview" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: API Docs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Product Docs" }));
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "API Docs" }));
    expect(await screen.findByRole("heading", { name: "API Overview" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: API Docs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Product Docs" }));
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));

    expect(screen.queryByText("Your unsaved Page Settings changes were restored. Review them before saving.")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Page Settings" })).toBeNull();
  });

  it("does not clear another workspace's recovery when a different workspace loads as viewer-only", async () => {
    const savePageSettings = vi.fn(async (): Promise<PageSettingsSaveResult> => ({
      code: "lock_lost",
      errorMessage: "Workspace lease lost.",
      state: "failed"
    }));
    const getWorkspace = vi.fn(async (workspaceSlug: string) => ({
      workspace:
        workspaceSlug === "api-docs"
          ? createWorkspace({
              canManageSettings: false,
              name: "API Docs",
              roleLabel: null,
              slug: "api-docs",
              sysId: "workspace-002"
            })
          : createWorkspace()
    }));
    const acquireWorkspaceEditLease = vi
      .fn()
      .mockResolvedValueOnce(heldLease("workspace-lease-token"))
      .mockResolvedValueOnce({
        holderDisplayName: "Priya Writer",
        sameUserDifferentSession: false,
        state: "locked" as const
      })
      .mockResolvedValueOnce(heldLease("replacement-lease-token"));
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }): Promise<PageListResult> => {
      if (workspaceSlug === "api-docs") {
        const apiMode: WorkspaceMode = mode === "edit" ? "edit" : "live";
        return {
          items: [
            createPageRecord({
              draftSlug: "api-overview",
              draftSlugNormalized: "api-overview",
              draftTitle: "API Overview",
              publishedSlug: "api-overview",
              publishedSlugNormalized: "api-overview",
              publishedTitle: "API Overview",
              workspaceSysId: "workspace-002"
            })
          ],
          mode: apiMode,
          totalCount: 1,
          workspaceSlug: "api-docs",
          workspaceSysId: "workspace-002"
        };
      }

      return createPageListResult(mode === "edit" ? "edit" : "live", [
        createPageRecord({
          draftTitle: mode === "edit" ? "Overview Draft" : "Overview",
          publicationState: mode === "edit" ? "published_with_unpublished_changes" : "published"
        })
      ]);
    });

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      getWorkspace,
      listPages,
      savePageSettings
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview Draft" }));
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview Draft" }));
    const titleInput = screen.getByDisplayValue("Overview Draft");
    fireEvent.change(titleInput, { target: { value: "Still restorable title" } });
    fireEvent.blur(titleInput);
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This workspace is currently being edited by Priya Writer.");

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "API Docs" }));
    expect(await screen.findByRole("heading", { name: "API Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: API Docs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Product Docs" }));
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));

    expect(await screen.findByRole("heading", { name: "Page Settings" })).toBeInTheDocument();
    expect(screen.getByText("Your unsaved Page Settings changes were restored. Review them before saving.")).toBeInTheDocument();
  });

  it("keeps the page tree unchanged and clears delete pending after a transient recovery failure", async () => {
    const deletePage = vi
      .fn()
      .mockResolvedValueOnce({
        code: "lock_lost",
        errorMessage: "Workspace lease lost.",
        state: "failed" as const
      });
    const acquireWorkspaceEditLease = vi
      .fn()
      .mockResolvedValueOnce(heldLease("workspace-lease-token"))
      .mockResolvedValueOnce({
        errorMessage: "Workspace editing is temporarily unavailable. Please try again.",
        failure: "transient" as const,
        retryable: true,
        state: "failed" as const
      });

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      deletePage,
      listPages: vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
        createPageListResult(mode === "edit" ? "edit" : "live", [
          createPageRecord({ draftTitle: "Overview Draft", publicationState: "published_with_unpublished_changes" }),
          createPageRecord({
            sysId: "page-002",
            parentPageSysId: "page-001",
            siblingOrder: 2,
            draftTitle: "Child Draft",
            draftSlug: "child",
            draftSlugNormalized: "child",
            publishedTitle: "Child",
            publishedSlug: "child",
            publishedSlugNormalized: "child",
            publicationState: "published_with_unpublished_changes"
          })
        ])
      )
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview Draft" }));
    expect(await screen.findByRole("heading", { name: "Page Settings" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete page" }));

    const deleteDialog = await screen.findByRole("dialog", { name: "Confirm deletion" });
    const confirmDelete = within(deleteDialog).getByRole("button", { name: "Delete page" });
    fireEvent.click(confirmDelete);

    await waitFor(() => expect(deletePage).toHaveBeenCalledTimes(1));
    expect(deletePage).toHaveBeenCalledWith(expect.objectContaining({
      pageSysId: "page-001",
      workspaceLeaseToken: "workspace-lease-token"
    }));
    expect(await within(deleteDialog).findByRole("alert")).toHaveTextContent("Workspace editing is temporarily unavailable. Please try again.");
    expect(confirmDelete).toBeEnabled();
    expect(treeRow("Overview Draft")).toBeInTheDocument();
    expect(treeRow("Child Draft")).toBeInTheDocument();
    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" });
  });

  it("uses centralized fallback for direct forbidden Page Settings saves and clears recovery", async () => {
    const savePageSettings = vi.fn(async () => ({
      code: "forbidden" as const,
      errorMessage: "You do not have permission to edit this workspace.",
      state: "failed" as const
    }));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { savePageSettings });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview" }));
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview" }));
    const titleInput = screen.getByDisplayValue("Overview");
    fireEvent.change(titleInput, { target: { value: "Overview Forbidden" } });
    fireEvent.blur(titleInput);
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));

    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission to edit this workspace.");
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", page: "overview" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));
    expect(screen.queryByText("Your unsaved Page Settings changes were restored. Review them before saving.")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Page Settings" })).toBeNull();
  });

  it("uses centralized fallback for direct forbidden inline creation and clears recovery", async () => {
    const createPage = vi.fn(async (): Promise<PageCreateResult> => ({
      code: "forbidden",
      errorMessage: "You do not have permission to edit this workspace.",
      state: "failed"
    }));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      createPage,
      listPages: vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
        createPageListResult(mode === "edit" ? "edit" : "live", [
          createPageRecord({ draftTitle: "Overview Draft", publicationState: "published_with_unpublished_changes" })
        ])
      )
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: "New page" })[0]);
    const titleInput = await screen.findByRole("textbox", { name: "New page title" });
    fireEvent.change(titleInput, { target: { value: "Forbidden child" } });
    fireEvent.keyDown(titleInput, { key: "Enter" });

    await waitFor(() => expect(createPage).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission to edit this workspace.");
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", page: "overview" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));
    expect(screen.queryByRole("textbox", { name: "New page title" })).toBeNull();
  });

  it("does not restore delete intent after a direct forbidden delete result", async () => {
    const deletePage = vi.fn(async () => ({
      code: "forbidden" as const,
      errorMessage: "You do not have permission to edit this workspace.",
      state: "failed" as const
    }));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      deletePage,
      listPages: vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
        createPageListResult(mode === "edit" ? "edit" : "live", [
          createPageRecord({ draftTitle: "Overview Draft", publicationState: "published_with_unpublished_changes" })
        ])
      )
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview Draft" }));
    expect(await screen.findByRole("heading", { name: "Page Settings" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete page" }));

    const deleteDialog = await screen.findByRole("dialog", { name: "Confirm deletion" });
    fireEvent.click(within(deleteDialog).getByRole("button", { name: "Delete page" }));

    await waitFor(() => expect(deletePage).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission to edit this workspace.");
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", page: "overview" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));
    expect(screen.queryByRole("dialog", { name: "Confirm deletion" })).toBeNull();
    expect(screen.queryByText("Your unsaved Page Settings changes were restored. Review them before saving.")).toBeNull();
  });

  it("ignores a stale direct forbidden settings result after navigation changes the active session", async () => {
    const deferredSave = createDeferred<{
      code: "forbidden";
      errorMessage: string;
      state: "failed";
    }>();
    const apiWorkspaceDeferred = createDeferred<{ workspace: WorkspaceViewRecord }>();
    const savePageSettings = vi.fn(() => deferredSave.promise);
    const getWorkspace = vi.fn(async (workspaceSlug: string) => {
      if (workspaceSlug === "api-docs") {
        return apiWorkspaceDeferred.promise;
      }

      return {
        workspace: createWorkspace()
      };
    });
    const listWorkspaces = vi.fn(async () => ({
      items: [
        createWorkspace(),
        createWorkspace({ slug: "api-docs", sysId: "workspace-002", name: "API Docs" })
      ],
      page: 1,
      pageSize: 10,
      totalCount: 2,
      hasNextPage: false,
      searchText: ""
    }));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      getWorkspace,
      listWorkspaces,
      savePageSettings,
      listPages: vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }) => {
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

        return createPageListResult(mode === "edit" ? "edit" : "live", [
          createPageRecord({ draftTitle: "Overview Draft", publicationState: "published_with_unpublished_changes" }),
          createPageRecord({
            sysId: "page-002",
            parentPageSysId: "page-001",
            siblingOrder: 2,
            draftTitle: "Child Draft",
            draftSlug: "child",
            draftSlugNormalized: "child",
            publishedTitle: "Child",
            publishedSlug: "child",
            publishedSlugNormalized: "child",
            publicationState: "published_with_unpublished_changes"
          })
        ]);
      })
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview Draft" }));
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview Draft" }));
    const titleInput = screen.getByDisplayValue("Overview Draft");
    fireEvent.change(titleInput, { target: { value: "Stale forbidden title" } });
    fireEvent.blur(titleInput);
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));

    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "API Docs" }));

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

    await act(async () => {
      deferredSave.resolve({
        code: "forbidden",
        errorMessage: "You do not have permission to edit this workspace.",
        state: "failed"
      });
      await Promise.resolve();
    });

    expectWorkspaceSearch({ workspace: "api-docs", page: "api-overview" });
    expect(screen.getByRole("heading", { name: "API Overview" })).toBeInTheDocument();
    expect(screen.queryByText("You do not have permission to edit this workspace.")).toBeNull();
  });
});
