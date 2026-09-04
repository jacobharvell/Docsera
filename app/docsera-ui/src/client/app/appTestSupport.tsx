import { act, createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import { useEffect } from "react";
import { expect, vi } from "vitest";
import { createEmptyDocseraDocumentEnvelope } from "../../shared/editor/document";
import type {
  DocseraRuntimeContext,
  PageBodySaveResult,
  PageCreateResult,
  PageListResult,
  PageMoveResult,
  PageSettingsSaveResult,
  ServiceNowClient,
  WorkspaceMode,
  WorkspacePageRecord,
  WorkspacePendingChangesResult,
  WorkspaceViewRecord
} from "../shared/types/docsera";

type MockEditorHostHandle = {
  onOutlineChange?: (outline: Array<{ depth: number; id: string; text: string }>) => void;
  onSaveDraft?: (input: {
    draftContentJson: ReturnType<typeof createEmptyDocseraDocumentEnvelope>;
    expectedRevision: number;
    pageSysId: string;
    readLatestDraftContentJson?: () => ReturnType<typeof createEmptyDocseraDocumentEnvelope> | null;
  }) => Promise<PageBodySaveResult>;
  onStatusChange?: (state: { isDirty: boolean; isSaving: boolean; status?: string }) => void;
  pageSysId: string;
  sessionKey: string;
};

type BroadcastMessage = Record<string, unknown>;

let deferHostReady = false;
let hostReadyResolvers: Array<() => void> = [];
export let mockEditorHostMounts: Array<{ pageSysId: string; sessionKey: string }> = [];
export let mockEditorHostHandles = new Map<string, MockEditorHostHandle>();

export class FakeBroadcastChannel {
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

export function resetAppTestSupport() {
  deferHostReady = false;
  hostReadyResolvers = [];
  mockEditorHostMounts = [];
  mockEditorHostHandles = new Map();
  FakeBroadcastChannel.peers.clear();
}

export function setDeferredHostReady(value: boolean) {
  deferHostReady = value;
}

export function resolveDeferredHostReady() {
  const resolvers = [...hostReadyResolvers];
  hostReadyResolvers = [];
  deferHostReady = false;
  resolvers.forEach((resolve) => resolve());
}

export function createPageEditorHostMock() {
  return function MockPageEditorHost({
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
    onStatusChange?: (state: { isDirty: boolean; isSaving: boolean; status?: string }) => void;
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
      onStatusChange?.({ isDirty: false, isSaving: false, status: "Saved" });
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
  };
}

export function latestMockEditorHost() {
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

export function createDeferred<T>() {
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

export function createWorkspace(overrides: Partial<WorkspaceViewRecord> = {}): WorkspaceViewRecord {
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
    layout: {
      tocVisible: true
    },
    status: "active",
    roleLabel: "Admin",
    canManageSettings: true,
    ...overrides
  };
}

export function createPageRecord(overrides: Partial<WorkspacePageRecord> = {}): WorkspacePageRecord {
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

export function createPageListResult(mode: WorkspaceMode, items: WorkspacePageRecord[]): PageListResult {
  return {
    items,
    mode,
    workspaceSlug: "product-docs",
    workspaceSysId: "workspace-001",
    totalCount: items.length
  };
}

export function createPendingChangesResult(rows: Extract<WorkspacePendingChangesResult, { state: "succeeded" }>["rows"]): Extract<WorkspacePendingChangesResult, { state: "succeeded" }> {
  return {
    affectedPageCount: rows.length,
    changeSetId: "change-set-001",
    changeSetRevision: 7,
    rows,
    state: "succeeded",
    workspaceSysId: "workspace-001"
  };
}

export function createClient(overrides: Partial<ServiceNowClient> = {}): ServiceNowClient {
  const workspace = createWorkspace();
  const publishedOverview = createPageRecord();

  return {
    ping: vi.fn(async () => {
      throw new Error("ping should not be called in these tests");
    }),
    listWorkspaces: vi.fn(async () => ({
      canCreateWorkspaces: true,
      items: [workspace, createWorkspace({ slug: "api-docs", sysId: "workspace-002", name: "API Docs" })],
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
      createPageListResult(mode === "edit" ? "edit" : "live", [
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
      changeSetRevision: 7,
      heartbeatIntervalMs: 60_000,
      leaseToken: "workspace-lease-token",
      staleAfterMs: 300_000,
      state: "held" as const
    })),
    resumeWorkspaceEditLease: vi.fn(async () => ({
      changeSetId: "change-set-001",
      changeSetRevision: 7,
      heartbeatIntervalMs: 60_000,
      leaseToken: "workspace-lease-token",
      staleAfterMs: 300_000,
      state: "held" as const
    })),
    renewWorkspaceEditLease: vi.fn(async () => ({
      changeSetId: "change-set-001",
      changeSetRevision: 7,
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
    getWorkspacePendingChanges: vi.fn(async () => createPendingChangesResult([])),
    movePage: vi.fn(async (): Promise<PageMoveResult> => ({
      errorMessage: "movePage should not be called in these tests",
      state: "failed" as const
    })),
    publishWorkspace: vi.fn(async () => ({
      errorMessage: "publishWorkspace should not be called in these tests",
      state: "failed" as const
    })),
    ...overrides
  };
}

export function createRuntime(path = "/?workspace=product-docs&page=overview"): DocseraRuntimeContext {
  window.history.replaceState({}, "", path);

  return {
    mountNode: document.createElement("div"),
    mountNodeId: "docsera-root",
    config: {}
  };
}

export function renderApp(
  AppComponent: (props: { runtime: DocseraRuntimeContext; serviceNowClient: ServiceNowClient }) => JSX.Element,
  path: string,
  clientOverrides: Partial<ServiceNowClient> = {}
) {
  const serviceNowClient = createClient(clientOverrides);
  return {
    serviceNowClient,
    ...render(<AppComponent runtime={createRuntime(path)} serviceNowClient={serviceNowClient} />)
  };
}

export function createBreadcrumbPages() {
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

export function installFakeBroadcastChannel() {
  Object.defineProperty(window, "BroadcastChannel", {
    configurable: true,
    value: FakeBroadcastChannel
  });
}

export function mockNavigationType(type: PerformanceNavigationTiming["type"]) {
  const original = window.performance.getEntriesByType.bind(window.performance);
  vi.spyOn(window.performance, "getEntriesByType").mockImplementation((entryType: string) => {
    if (entryType === "navigation") {
      return [{ type } as PerformanceNavigationTiming];
    }

    return original(entryType);
  });
  return () => {
    vi.restoreAllMocks();
  };
}

export function workspaceLeaseStorageKey(workspaceSysId = "workspace-001"): string {
  return `docsera.workspace-edit-lease.${workspaceSysId}`;
}

export function readStoredWorkspaceLease(workspaceSysId = "workspace-001"): { tabSessionId: string; token: string } {
  const raw = window.sessionStorage.getItem(workspaceLeaseStorageKey(workspaceSysId));
  if (!raw) {
    throw new Error(`Expected stored workspace lease for ${workspaceSysId}.`);
  }

  return JSON.parse(raw) as { tabSessionId: string; token: string };
}

export function readRouteValues(): Record<string, string | null> {
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

export function expectWorkspaceSearch(expected: Record<string, string | null>) {
  const values = readRouteValues();
  for (const [key, value] of Object.entries(expected)) {
    expect(values[key]).toBe(value);
  }
}

export function heldLease(leaseToken: string) {
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

export function treeRow(title: string): HTMLElement {
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

export function dragTreePage(sourceTitle: string, targetTitle: string, clientY: number) {
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

export function pageTreeButtonLabels(): string[] {
  const tree = screen.getByRole("navigation", { name: "Page tree" });
  return within(tree)
    .getAllByRole("button")
    .map((button) => button.textContent?.trim() ?? "");
}
