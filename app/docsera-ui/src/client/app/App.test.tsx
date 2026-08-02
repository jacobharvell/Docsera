import "@testing-library/jest-dom/vitest";
import { act, createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { StrictMode, useEffect } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { createEmptyDocseraDocumentEnvelope } from "../../shared/editor/document";
import { createHeadingHierarchyDocseraDocumentEnvelope } from "../../shared/editor/documentFixtures";
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
let mockEditorHostMounts: Array<{ pageSysId: string; sessionKey: string }> = [];
let mockEditorHostHandles = new Map<string, {
  onOutlineChange?: (outline: Array<{ depth: number; id: string; text: string }>) => void;
  onSaveDraft?: (input: {
    draftContentJson: ReturnType<typeof createEmptyDocseraDocumentEnvelope>;
    expectedRevision: number;
    pageSysId: string;
    readLatestDraftContentJson?: () => ReturnType<typeof createEmptyDocseraDocumentEnvelope> | null;
  }) => Promise<PageBodySaveResult>;
  onStatusChange?: (state: { isDirty: boolean; isSaving: boolean }) => void;
  pageSysId: string;
  sessionKey: string;
}>();

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
  mockEditorHostMounts = [];
  mockEditorHostHandles = new Map();
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
    onOutlineChange,
    onReadyStateChange,
    onSaveDraft,
    pageSysId,
    sessionKey,
    onStatusChange
  }: {
    canEdit: boolean;
    onError?: (failure: null) => void;
    onOutlineChange?: (outline: Array<{ depth: number; id: string; text: string }>) => void;
    onReadyStateChange?: (ready: boolean) => void;
    onSaveDraft?: (input: {
      draftContentJson: ReturnType<typeof createEmptyDocseraDocumentEnvelope>;
      expectedRevision: number;
      pageSysId: string;
      readLatestDraftContentJson?: () => ReturnType<typeof createEmptyDocseraDocumentEnvelope> | null;
    }) => Promise<PageBodySaveResult>;
    pageSysId?: string;
    sessionKey?: string;
    onStatusChange?: (state: { isDirty: boolean; isSaving: boolean }) => void;
  }) {
    useEffect(() => {
      const normalizedPageSysId = pageSysId ?? "";
      const normalizedSessionKey = sessionKey ?? "";
      mockEditorHostMounts.push({ pageSysId: normalizedPageSysId, sessionKey: normalizedSessionKey });
      mockEditorHostHandles.set(normalizedSessionKey, {
        onOutlineChange,
        onSaveDraft,
        onStatusChange,
        pageSysId: normalizedPageSysId,
        sessionKey: normalizedSessionKey
      });
      onError?.(null);
      onStatusChange?.({ isDirty: false, isSaving: false });
      if (!onReadyStateChange) {
        return () => {
          mockEditorHostHandles.delete(normalizedSessionKey);
        };
      }

      if (!deferHostReady) {
        onReadyStateChange(true);
        return () => {
          mockEditorHostHandles.delete(normalizedSessionKey);
        };
      }

      const resolveReady = () => {
        onReadyStateChange(true);
      };
      hostReadyResolvers.push(resolveReady);
      return () => {
        mockEditorHostHandles.delete(normalizedSessionKey);
        hostReadyResolvers = hostReadyResolvers.filter((resolver) => resolver !== resolveReady);
      };
    }, [onError, onOutlineChange, onReadyStateChange, onSaveDraft, onStatusChange, pageSysId, sessionKey]);

    return canEdit ? <div data-docsera-page-editor-host="true" data-page-sys-id={pageSysId ?? ""} data-session-key={sessionKey ?? ""} /> : null;
  }
}));

function latestMockEditorHost() {
  const latest = mockEditorHostMounts[mockEditorHostMounts.length - 1];
  if (!latest) {
    throw new Error("Expected a mounted mock editor host.");
  }
  const handle = mockEditorHostHandles.get(latest.sessionKey);
  if (!handle) {
    throw new Error(`Expected mock editor host handle for session ${latest.sessionKey}.`);
  }
  return handle;
}

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

describe("App workspace state integration", () => {
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
    const editPublishedPage = createPageRecord({
      sysId: "page-001",
      draftTitle: "Published Overview",
      publishedTitle: "Published Overview",
      draftSlug: "published-overview",
      draftSlugNormalized: "published-overview",
      publishedSlug: "published-overview",
      publishedSlugNormalized: "published-overview"
    });
    const livePublishedPage = createPageRecord({
      sysId: "page-001",
      draftTitle: "Published Overview",
      publishedTitle: "Published Overview",
      draftSlug: "published-overview",
      draftSlugNormalized: "published-overview",
      publishedSlug: "published-overview",
      publishedSlugNormalized: "published-overview"
    });
    const editReferencePage = createPageRecord({
      sysId: "page-004",
      siblingOrder: 2,
      draftTitle: "Reference Draft",
      draftSlug: "reference-draft",
      draftSlugNormalized: "reference-draft",
      publishedTitle: "Reference",
      publishedSlug: "reference-live",
      publishedSlugNormalized: "reference-live",
      draftContentJson: createHeadingHierarchyDocseraDocumentEnvelope(),
      publishedContentJson: createHeadingHierarchyDocseraDocumentEnvelope()
    });
    const liveReferencePage = createPageRecord({
      sysId: "page-004",
      siblingOrder: 2,
      draftTitle: "Reference",
      draftSlug: "reference-live",
      draftSlugNormalized: "reference-live",
      publishedTitle: "Reference",
      publishedSlug: "reference-live",
      publishedSlugNormalized: "reference-live"
    });
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(
        mode === "edit" ? "edit" : "live",
        mode === "edit" ? [editPublishedPage, draftOnlyPage, editReferencePage] : [livePublishedPage, liveReferencePage]
      )
    );

    renderApp("/?workspace=product-docs&mode=edit&page=published-overview", { listPages });

    expect(await screen.findByRole("heading", { name: "Published Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Draft Only" }));

    expect(await screen.findByRole("heading", { name: "Draft Only" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Live" }));

    expect(await screen.findByRole("heading", { name: "Published Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(await screen.findByRole("heading", { name: "Published Overview" })).toBeInTheDocument();
    await waitFor(() => {
      expectWorkspaceSearch({
        workspace: "product-docs",
        mode: "edit",
        page: "published-overview"
      });
    });

    await act(async () => {
      window.history.back();
      await Promise.resolve();
    });
    expect(await screen.findByRole("heading", { name: "Published Overview" })).toBeInTheDocument();
    await waitFor(() => {
      expectWorkspaceSearch({
        workspace: "product-docs",
        mode: null,
        page: "published-overview"
      });
    });

    await act(async () => {
      window.history.forward();
      await Promise.resolve();
    });
    expect(await screen.findByRole("heading", { name: "Published Overview" })).toBeInTheDocument();
    await waitFor(() => {
      expectWorkspaceSearch({
        workspace: "product-docs",
        mode: "edit",
        page: "published-overview"
      });
    });

    fireEvent.click(within(screen.getByRole("navigation", { name: "Page tree" })).getByRole("button", { name: "Reference Draft" }));

    expect(await screen.findByRole("heading", { name: "Reference Draft" })).toBeInTheDocument();
    expect(screen.getByRole("main", { name: "Reference Draft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reference Draft" })).toHaveAttribute("aria-current", "page");
    expect(within(screen.getByRole("complementary", { name: "Page outline" })).getByRole("link", { name: "Overview" })).toBeInTheDocument();
    await waitFor(() => {
      expectWorkspaceSearch({
        workspace: "product-docs",
        mode: "edit",
        page: "reference-draft"
      });
    });
  });

  it("preserves the current page identity across mode switches when live and edit slugs differ", async () => {
    const livePage = createPageRecord({
      sysId: "page-001",
      draftTitle: "Overview",
      draftSlug: "overview-live",
      draftSlugNormalized: "overview-live",
      publishedTitle: "Overview",
      publishedSlug: "overview-live",
      publishedSlugNormalized: "overview-live"
    });
    const editPage = createPageRecord({
      sysId: "page-001",
      draftTitle: "Overview Draft",
      draftSlug: "overview-draft",
      draftSlugNormalized: "overview-draft",
      publishedTitle: "Overview",
      publishedSlug: "overview-live",
      publishedSlugNormalized: "overview-live",
      publicationState: "published_with_unpublished_changes"
    });
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", mode === "edit" ? [editPage] : [livePage])
    );

    renderApp("/?workspace=product-docs&page=overview-live", { listPages });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await waitFor(() => {
      expectWorkspaceSearch({
        workspace: "product-docs",
        mode: "edit",
        page: "overview-draft"
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Live" }));

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitFor(() => {
      expectWorkspaceSearch({
        workspace: "product-docs",
        mode: null,
        page: "overview-live"
      });
    });
  });

  it("falls back to the nearest visible ancestor when the selected edit page is unavailable in live", async () => {
    const liveRootPage = createPageRecord({
      sysId: "page-root",
      draftTitle: "Overview",
      draftSlug: "overview-live",
      draftSlugNormalized: "overview-live",
      publishedTitle: "Overview",
      publishedSlug: "overview-live",
      publishedSlugNormalized: "overview-live"
    });
    const editRootPage = createPageRecord({
      sysId: "page-root",
      draftTitle: "Overview Draft",
      draftSlug: "overview-draft",
      draftSlugNormalized: "overview-draft",
      publishedTitle: "Overview",
      publishedSlug: "overview-live",
      publishedSlugNormalized: "overview-live",
      publicationState: "published_with_unpublished_changes"
    });
    const liveParentPage = createPageRecord({
      sysId: "page-parent",
      parentPageSysId: "page-root",
      siblingOrder: 1,
      draftTitle: "Parent",
      draftSlug: "parent-live",
      draftSlugNormalized: "parent-live",
      publishedTitle: "Parent",
      publishedSlug: "parent-live",
      publishedSlugNormalized: "parent-live"
    });
    const editParentPage = createPageRecord({
      sysId: "page-parent",
      parentPageSysId: "page-root",
      siblingOrder: 1,
      draftTitle: "Parent Draft",
      draftSlug: "parent-draft",
      draftSlugNormalized: "parent-draft",
      publishedTitle: "Parent",
      publishedSlug: "parent-live",
      publishedSlugNormalized: "parent-live",
      publicationState: "published_with_unpublished_changes"
    });
    const draftOnlyChild = createPageRecord({
      sysId: "page-child",
      parentPageSysId: "page-parent",
      siblingOrder: 1,
      draftTitle: "Child Draft",
      draftSlug: "child-draft",
      draftSlugNormalized: "child-draft",
      publishedTitle: null,
      publishedSlug: null,
      publishedSlugNormalized: null,
      publicationState: "draft"
    });
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(
        mode === "edit" ? "edit" : "live",
        mode === "edit" ? [editRootPage, editParentPage, draftOnlyChild] : [liveRootPage, liveParentPage]
      )
    );

    renderApp("/?workspace=product-docs&mode=edit&page=child-draft", { listPages });

    expect(await screen.findByRole("heading", { name: "Child Draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Live" }));

    expect(await screen.findByRole("heading", { name: "Parent" })).toBeInTheDocument();
    await waitFor(() => {
      expectWorkspaceSearch({
        workspace: "product-docs",
        mode: null,
        page: "parent-live"
      });
    });

    fireEvent.click(within(screen.getByRole("navigation", { name: "Page tree" })).getByRole("button", { name: "Overview" }));

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await waitFor(() => {
      expectWorkspaceSearch({
        workspace: "product-docs",
        mode: null,
        page: "overview-live"
      });
    });
  });

  it("continues ancestor fallback upward before using the first visible top-level page", async () => {
    const liveRootPage = createPageRecord({
      sysId: "page-root",
      draftTitle: "Overview",
      draftSlug: "overview-live",
      draftSlugNormalized: "overview-live",
      publishedTitle: "Overview",
      publishedSlug: "overview-live",
      publishedSlugNormalized: "overview-live"
    });
    const editRootPage = createPageRecord({
      sysId: "page-root",
      draftTitle: "Overview Draft",
      draftSlug: "overview-draft",
      draftSlugNormalized: "overview-draft",
      publishedTitle: "Overview",
      publishedSlug: "overview-live",
      publishedSlugNormalized: "overview-live",
      publicationState: "published_with_unpublished_changes"
    });
    const draftOnlyParent = createPageRecord({
      sysId: "page-parent",
      parentPageSysId: "page-root",
      siblingOrder: 1,
      draftTitle: "Draft Parent",
      draftSlug: "draft-parent",
      draftSlugNormalized: "draft-parent",
      publishedTitle: null,
      publishedSlug: null,
      publishedSlugNormalized: null,
      publicationState: "draft"
    });
    const draftOnlyChild = createPageRecord({
      sysId: "page-child",
      parentPageSysId: "page-parent",
      siblingOrder: 1,
      draftTitle: "Draft Child",
      draftSlug: "draft-child",
      draftSlugNormalized: "draft-child",
      publishedTitle: null,
      publishedSlug: null,
      publishedSlugNormalized: null,
      publicationState: "draft"
    });
    const liveSecondRootPage = createPageRecord({
      sysId: "page-second-root",
      siblingOrder: 2,
      draftTitle: "Reference",
      draftSlug: "reference-live",
      draftSlugNormalized: "reference-live",
      publishedTitle: "Reference",
      publishedSlug: "reference-live",
      publishedSlugNormalized: "reference-live",
      publicationState: "published_with_unpublished_changes"
    });
    const editSecondRootPage = createPageRecord({
      sysId: "page-second-root",
      siblingOrder: 2,
      draftTitle: "Reference Draft",
      draftSlug: "reference-draft",
      draftSlugNormalized: "reference-draft",
      publishedTitle: "Reference",
      publishedSlug: "reference-live",
      publishedSlugNormalized: "reference-live",
      publicationState: "published_with_unpublished_changes"
    });
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(
        mode === "edit" ? "edit" : "live",
        mode === "edit" ? [editRootPage, draftOnlyParent, draftOnlyChild, editSecondRootPage] : [liveRootPage, liveSecondRootPage]
      )
    );

    renderApp("/?workspace=product-docs&mode=edit&page=draft-child", { listPages });

    expect(await screen.findByRole("heading", { name: "Draft Child" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Live" }));

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitFor(() => {
      expectWorkspaceSearch({
        workspace: "product-docs",
        mode: null,
        page: "overview-live"
      });
    });
  });

  it("falls back to the first visible top-level page when no visible ancestor exists", async () => {
    const draftOnlyRoot = createPageRecord({
      sysId: "page-draft-root",
      draftTitle: "Draft Root",
      draftSlug: "draft-root",
      draftSlugNormalized: "draft-root",
      publishedTitle: null,
      publishedSlug: null,
      publishedSlugNormalized: null,
      publicationState: "draft"
    });
    const firstPublishedRoot = createPageRecord({
      sysId: "page-first-root",
      siblingOrder: 1,
      draftTitle: "API",
      draftSlug: "api-live",
      draftSlugNormalized: "api-live",
      publishedTitle: "API",
      publishedSlug: "api-live",
      publishedSlugNormalized: "api-live",
      publicationState: "published_with_unpublished_changes"
    });
    const secondPublishedRoot = createPageRecord({
      sysId: "page-second-root",
      siblingOrder: 2,
      draftTitle: "Reference",
      draftSlug: "reference-live",
      draftSlugNormalized: "reference-live",
      publishedTitle: "Reference",
      publishedSlug: "reference-live",
      publishedSlugNormalized: "reference-live",
      publicationState: "published_with_unpublished_changes"
    });
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(
        mode === "edit" ? "edit" : "live",
        mode === "edit" ? [draftOnlyRoot, firstPublishedRoot, secondPublishedRoot] : [firstPublishedRoot, secondPublishedRoot]
      )
    );

    renderApp("/?workspace=product-docs&mode=edit&page=draft-root", { listPages });

    expect(await screen.findByRole("heading", { name: "Draft Root" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Live" }));

    expect(await screen.findByRole("heading", { name: "API" })).toBeInTheDocument();
    await waitFor(() => {
      expectWorkspaceSearch({
        workspace: "product-docs",
        mode: null,
        page: "api-live"
      });
    });

    fireEvent.click(within(screen.getByRole("navigation", { name: "Page tree" })).getByRole("button", { name: "Reference" }));

    expect(await screen.findByRole("heading", { name: "Reference" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reference" })).toHaveAttribute("aria-current", "page");
    await waitFor(() => {
      expectWorkspaceSearch({
        workspace: "product-docs",
        mode: null,
        page: "reference-live"
      });
    });
  });

  it("consumes the target after a Live-to-Edit fallback and still allows normal Edit navigation", async () => {
    const liveOnlyRoot = createPageRecord({
      sysId: "page-live-only",
      draftTitle: "Live Only",
      draftSlug: "live-only",
      draftSlugNormalized: "live-only",
      publishedTitle: "Live Only",
      publishedSlug: "live-only",
      publishedSlugNormalized: "live-only",
      publicationState: "published_with_unpublished_changes"
    });
    const editFirstRoot = createPageRecord({
      sysId: "page-first-root",
      siblingOrder: 1,
      draftTitle: "API Draft",
      draftSlug: "api-draft",
      draftSlugNormalized: "api-draft",
      publishedTitle: "API",
      publishedSlug: "api-live",
      publishedSlugNormalized: "api-live",
      publicationState: "published_with_unpublished_changes"
    });
    const editSecondRoot = createPageRecord({
      sysId: "page-second-root",
      siblingOrder: 2,
      draftTitle: "Reference Draft",
      draftSlug: "reference-draft",
      draftSlugNormalized: "reference-draft",
      publishedTitle: "Reference",
      publishedSlug: "reference-live",
      publishedSlugNormalized: "reference-live",
      publicationState: "published_with_unpublished_changes"
    });
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(
        mode === "edit" ? "edit" : "live",
        mode === "edit" ? [editFirstRoot, editSecondRoot] : [liveOnlyRoot]
      )
    );

    renderApp("/?workspace=product-docs&page=live-only", { listPages });

    expect(await screen.findByRole("heading", { name: "Live Only" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(await screen.findByRole("heading", { name: "API Draft" })).toBeInTheDocument();
    await waitFor(() => {
      expectWorkspaceSearch({
        workspace: "product-docs",
        mode: "edit",
        page: "api-draft"
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Reference Draft" }));

    expect(await screen.findByRole("heading", { name: "Reference Draft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reference Draft" })).toHaveAttribute("aria-current", "page");
    await waitFor(() => {
      expectWorkspaceSearch({
        workspace: "product-docs",
        mode: "edit",
        page: "reference-draft"
      });
    });
  });

  it("consumes the target after an empty destination and does not contaminate later mode switches", async () => {
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", mode === "edit" ? [] : [createPageRecord()])
    );

    renderApp("/?workspace=product-docs&page=overview", { listPages });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    await waitFor(() => {
      expectWorkspaceSearch({
        workspace: "product-docs",
        mode: "edit",
        page: null
      });
    });
    expect(screen.queryByRole("heading", { name: "Overview" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Live" }));

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Overview" })).toHaveAttribute("aria-current", "page");
    await waitFor(() => {
      expectWorkspaceSearch({
        workspace: "product-docs",
        mode: null,
        page: "overview"
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


  it("ignores an obsolete discard-page success after the user has already navigated to another workspace", async () => {
    const productPages = createBreadcrumbPages();
    const apiPages = [
      createPageRecord({
        sysId: "page-api",
        workspaceSysId: "workspace-002",
        draftSlug: "api-overview",
        draftSlugNormalized: "api-overview",
        draftTitle: "API Overview",
        publishedSlug: "api-overview",
        publishedSlugNormalized: "api-overview",
        publishedTitle: "API Overview"
      })
    ];
    const discardDeferred = createDeferred<{
      changeSetId: string;
      changeSetRevision: number;
      discardedPageSysId: string;
      pages: WorkspacePageRecord[];
      pendingChanges: Extract<WorkspacePendingChangesResult, { state: "succeeded" }>;
      state: "succeeded";
      workspaceStateRevision: number;
    }>();
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }) => {
      if (workspaceSlug === "api-docs") {
        return {
          ...createPageListResult(mode === "edit" ? "edit" : "live", mode === "edit" ? apiPages : [apiPages[0]!]),
          workspaceSlug,
          workspaceSysId: "workspace-002"
        };
      }
      return createPageListResult(mode === "edit" ? "edit" : "live", mode === "edit" ? productPages : [productPages[0]!]);
    });
    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      discardPageWorkspace: vi.fn(() => discardDeferred.promise),
      getWorkspace: vi.fn(async (workspaceSlug: string) => ({
        workspace: workspaceSlug === "api-docs"
          ? createWorkspace({ slug: "api-docs", sysId: "workspace-002", name: "API Docs" })
          : createWorkspace()
      })),
      getWorkspacePendingChanges: vi.fn(async () => createPendingChangesResult([
        {
          attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
          category: "Modified",
          firstPendingSequence: 1,
          lastChangedOn: "2026-07-27 09:00:00",
          navigable: true,
          pageSysId: "page-child",
          title: "Child Draft"
        }
      ])),
      listPages,
      listWorkspaces: vi.fn(async () => ({
        items: [createWorkspace(), createWorkspace({ slug: "api-docs", sysId: "workspace-002", name: "API Docs" })],
        page: 1,
        pageSize: 10,
        totalCount: 2,
        hasNextPage: false,
        searchText: ""
      }))
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo changes to Child Draft" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo changes" }));

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "API Docs" }));
    expect(await screen.findByRole("heading", { name: "API Overview" })).toBeInTheDocument();

    await act(async () => {
      discardDeferred.resolve({
        changeSetId: "change-set-001",
        changeSetRevision: 8,
        discardedPageSysId: "page-child",
        pages: [
          createPageRecord({
            ...productPages[0]!,
            draftTitle: "Obsolete Product Result"
          })
        ],
        pendingChanges: {
          ...createPendingChangesResult([]),
          changeSetRevision: 8
        },
        state: "succeeded",
        workspaceStateRevision: 5
      });
      await Promise.resolve();
    });

    expectWorkspaceSearch({ workspace: "api-docs", mode: null, page: "api-overview" });
    expect(screen.getByRole("heading", { name: "API Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Obsolete Product Result" })).toBeNull();
  }, 15000);

  it("keeps discard recovery blocking writes after cancel or reload and reuses the recovery command on explicit retry", async () => {
    const settle = async () => {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    };
    const createPage = vi.fn(async (): Promise<PageCreateResult> => ({
      code: "failed",
      errorMessage: "createPage should stay blocked during discard recovery",
      state: "failed"
    }));
    const getWorkspacePendingChanges = vi.fn(async (): Promise<WorkspacePendingChangesResult> => ({
      affectedPageCount: 2,
      code: "recovery_required",
      currentChangeSetId: "change-set-successor",
      currentChangeSetRevision: 0,
      errorMessage: "Discard recovery is incomplete. Retry discard all to finish restoring this workspace before making other changes.",
      recoveryCommandId: "discard-001",
      state: "failed"
    }));
    const discardAllWorkspace = vi.fn(async () => ({
      changeSetId: "change-set-successor-2",
      changeSetRevision: 0,
      pages: [createPageRecord()],
      pendingChanges: {
        affectedPageCount: 0,
        changeSetId: "change-set-successor-2",
        changeSetRevision: 0,
        rows: [],
        state: "succeeded" as const,
        workspaceSysId: "workspace-001"
      },
      state: "succeeded" as const,
      workspaceStateRevision: 6
    }));

    const firstView = renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      createPage,
      discardAllWorkspace,
      getWorkspacePendingChanges
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await settle();
    expect(discardAllWorkspace).toHaveBeenCalledTimes(0);
    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Changes Center" })).getByRole("button", { name: "Discard all" }));
    const firstDiscardModal = await screen.findByRole("dialog", { name: "Discard all changes" });
    expect(firstDiscardModal.closest(".docsera-header")).toBeNull();
    expect(firstDiscardModal.closest(".docsera-modal")).toHaveClass("docsera-modal--top-biased");
    expect(firstDiscardModal).toHaveTextContent("Are you sure you want to discard 2 changes? This action cannot be undone.");
    fireEvent.click(within(firstDiscardModal).getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog", { name: "Discard all changes" })).toBeNull();
    expect(screen.getAllByRole("button", { name: "New page" })[0]).toBeDisabled();
    firstView.unmount();

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      createPage,
      discardAllWorkspace,
      getWorkspacePendingChanges
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await settle();
    expect(discardAllWorkspace).toHaveBeenCalledTimes(0);
    expect(getWorkspacePendingChanges.mock.calls.length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByRole("button", { name: "New page" })[0]).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Changes Center" })).getByRole("button", { name: "Discard all" }));
    const secondDiscardModal = await screen.findByRole("dialog", { name: "Discard all changes" });
    expect(secondDiscardModal.closest(".docsera-header")).toBeNull();
    expect(secondDiscardModal).toHaveTextContent("Are you sure you want to discard 2 changes? This action cannot be undone.");
    fireEvent.click(within(secondDiscardModal).getByRole("button", { name: "Retry discard all" }));

    await settle();
    expect(discardAllWorkspace).toHaveBeenCalledTimes(1);
    expect(discardAllWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      commandId: "discard-001",
      workspaceAuthority: expect.objectContaining({ changeSetId: "change-set-successor", changeSetRevision: 0 }),
      workspaceLeaseToken: "workspace-lease-token",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    }));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));
    expect(screen.queryByRole("dialog", { name: "Changes Center" })).toBeNull();
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

