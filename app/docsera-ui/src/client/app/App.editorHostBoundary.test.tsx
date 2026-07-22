/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { PageEditorRecoverySnapshot } from "../editor/PageEditorHost";
import type { EditorOutlineItem } from "../editor/documentOutline";
import { createEmptyDocseraDocumentEnvelope, type DocseraDocumentEnvelope } from "../../shared/editor/document";
import type {
  DocseraRuntimeContext,
  PageBodySaveResult,
  PageCreateResult,
  PageListResult,
  PageSettingsSaveResult,
  ServiceNowClient,
  WorkspaceEditLeaseRenewResult,
  WorkspacePendingChangesResult,
  WorkspaceMode,
  WorkspacePageRecord,
  WorkspaceViewRecord
} from "../shared/types/docsera";

type MockHostProps = {
  initialEnvelope: DocseraDocumentEnvelope;
  initialSavedEnvelope?: DocseraDocumentEnvelope;
  initialRevision: number;
  onAccessLost: () => void;
  onError: (failure: { kind: "load_failed" | "mount_failed"; message: string } | null) => void;
  onReadyStateChange?: (ready: boolean) => void;
  onOutlineChange: (outline: EditorOutlineItem[]) => void;
  onSaveDraft: (input: {
    draftContentJson: DocseraDocumentEnvelope;
    expectedRevision: number;
    pageSysId: string;
    readLatestDraftContentJson?: () => DocseraDocumentEnvelope | null;
  }) => Promise<PageBodySaveResult>;
  onStatusChange: (state: {
    flush?: () => Promise<boolean>;
    getRecoverySnapshot?: () => PageEditorRecoverySnapshot | null;
    isDirty: boolean;
    isSaving: boolean;
    status: "Unsaved" | "Saving…" | "Saved" | "Changes not saved";
  }) => void;
  pageSysId: string;
  sessionKey: string;
};

type MockHostStatus = {
  flush?: () => Promise<boolean>;
  getRecoverySnapshot?: () => PageEditorRecoverySnapshot | null;
  isDirty: boolean;
  isSaving: boolean;
  status: "Unsaved" | "Saving…" | "Saved" | "Changes not saved";
};

type MockHostControl = {
  emitAccessLost: () => void;
  emitError: (message: string) => void;
  emitOutline: (text: string) => void;
  emitStatus: (state: MockHostStatus) => void;
  makeDirty: () => void;
  keepTyping: () => void;
  markSaving: () => void;
  clearSaving: () => void;
  registerSuccessfulFlush: () => void;
  registerFailedFlush: () => void;
  registerDeferredFlush: () => void;
  resolveDeferredFlushes: () => void;
  status: MockHostStatus | null;
  mountId: number;
  generation: number;
  initialEnvelopeText: string;
  initialSavedEnvelopeText: string;
  pageSysId: string;
  sessionKey: string;
};

type DeferredFlush = {
  promise: Promise<boolean>;
  resolve: (value: boolean) => void;
};

const hostControls = new Map<string, MockHostControl>();
const savedSnapshots = new Map<string, string>();
let latestHostControl: MockHostControl | null = null;
let mountSequence = 0;

afterEach(() => {
  cleanup();
  hostControls.clear();
  savedSnapshots.clear();
  latestHostControl = null;
  mountSequence = 0;
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.name = "";
  vi.useRealTimers();
});

function createDeferredFlush(): DeferredFlush {
  let resolve: (value: boolean) => void = () => undefined;
  const promise = new Promise<boolean>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
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

function createEnvelopeForMockText(text: string): DocseraDocumentEnvelope {
  if (!text) {
    return createEmptyDocseraDocumentEnvelope();
  }

  const envelope = createEmptyDocseraDocumentEnvelope();
  envelope.document.content = [
    {
      type: "paragraph",
      content: [{ text, type: "text" }]
    }
  ];
  return envelope;
}

vi.mock("../editor/PageEditorHost", () => {
  function MockPageEditorHost(props: MockHostProps) {
    const mountId = useRef(++mountSequence).current;
    const propsRef = useRef(props);
    const initialEnvelopeText = JSON.stringify(props.initialEnvelope.document);
    const initialSavedEnvelopeText = JSON.stringify((props.initialSavedEnvelope ?? props.initialEnvelope).document);
    const [text, setText] = useState(() => initialEnvelopeText);
    const [savedText, setSavedText] = useState(() => savedSnapshots.get(props.pageSysId) ?? initialSavedEnvelopeText);
    const [manualSaving, setManualSaving] = useState(false);
    const [flushMode, setFlushMode] = useState<"success" | "failure" | "deferred">("success");
    const [lastFailure, setLastFailure] = useState(false);
    const textRef = useRef(text);
    const savedTextRef = useRef(savedText);
    const revisionRef = useRef(props.initialRevision);
    const deferredFlushRef = useRef<DeferredFlush | null>(null);
    const controlRef = useRef<MockHostControl | null>(null);

    propsRef.current = props;
    textRef.current = text;
    savedTextRef.current = savedText;
    revisionRef.current = props.initialRevision;

    if (!controlRef.current) {
      controlRef.current = {
        emitAccessLost: () => propsRef.current.onAccessLost(),
        emitError: (message) => propsRef.current.onError({ kind: "mount_failed", message }),
        emitOutline: (headingText) =>
          propsRef.current.onOutlineChange([
            {
              anchorId: headingText.toLowerCase().replace(/\s+/g, "-"),
              id: headingText.toLowerCase().replace(/\s+/g, "-"),
              level: 2,
              title: headingText
            }
          ]),
        emitStatus: (state) => propsRef.current.onStatusChange(state),
        makeDirty: () => {
          setLastFailure(false);
          setText("Draft change");
        },
        keepTyping: () => {
          setLastFailure(false);
          setText("Draft change 2");
        },
        markSaving: () => setManualSaving(true),
        clearSaving: () => setManualSaving(false),
        registerSuccessfulFlush: () => {
          setFlushMode("success");
          setLastFailure(false);
        },
        registerFailedFlush: () => {
          setFlushMode("failure");
          setLastFailure(false);
        },
        registerDeferredFlush: () => {
          setFlushMode("deferred");
          setLastFailure(false);
        },
        resolveDeferredFlushes: () => {
          const deferred = deferredFlushRef.current;
          if (!deferred) {
            return;
          }

          const nextSavedText = textRef.current;
          savedSnapshots.set(propsRef.current.pageSysId, nextSavedText);
          savedTextRef.current = nextSavedText;
          setSavedText(nextSavedText);
          setLastFailure(false);
          setManualSaving(false);
          deferredFlushRef.current = null;
          deferred.resolve(true);
        },
        status: null,
        mountId,
        generation: mountId,
        initialEnvelopeText,
        initialSavedEnvelopeText,
        pageSysId: props.pageSysId,
        sessionKey: props.sessionKey
      };
    }

    async function flushDocument() {
      const commitDraft = async () => {
        const result = await propsRef.current.onSaveDraft({
          draftContentJson: createEnvelopeForMockText(textRef.current),
          expectedRevision: revisionRef.current,
          pageSysId: propsRef.current.pageSysId,
          readLatestDraftContentJson: () => createEnvelopeForMockText(textRef.current)
        });
        if (result.state !== "succeeded") {
          setLastFailure(true);
          setManualSaving(false);
          return false;
        }

        revisionRef.current = result.page.draftRevision ?? revisionRef.current;
        const nextSavedText = textRef.current;
        savedSnapshots.set(propsRef.current.pageSysId, nextSavedText);
        savedTextRef.current = nextSavedText;
        setSavedText(nextSavedText);
        setLastFailure(false);
        setManualSaving(false);
        return true;
      };

      if (flushMode === "failure") {
        setLastFailure(true);
        setManualSaving(false);
        return false;
      }

      if (flushMode === "deferred") {
        const deferred = deferredFlushRef.current ?? createDeferredFlush();
        deferredFlushRef.current = deferred;
        setManualSaving(true);
        const shouldCommit = await deferred.promise;
        setManualSaving(false);
        if (!shouldCommit) {
          setLastFailure(true);
          if (deferredFlushRef.current === deferred) {
            deferredFlushRef.current = null;
          }
          return false;
        }

        const saved = await commitDraft();
        if (deferredFlushRef.current === deferred) {
          deferredFlushRef.current = null;
        }
        return saved;
      }

      return commitDraft();
    }

    useEffect(() => {
      const control = controlRef.current;
      if (!control) {
        return;
      }

      control.pageSysId = props.pageSysId;
      control.sessionKey = props.sessionKey;
      hostControls.set(props.sessionKey, control);
      latestHostControl = control;
      props.onReadyStateChange?.(true);
      props.onError(null);
      return () => {
        hostControls.delete(props.sessionKey);
        if (latestHostControl?.sessionKey === props.sessionKey) {
          latestHostControl = null;
        }
        props.onReadyStateChange?.(false);
      };
    }, [props.onAccessLost, props.onError, props.onOutlineChange, props.onReadyStateChange, props.onStatusChange, props.pageSysId, props.sessionKey]);

    useEffect(() => {
      if (!props.sessionKey.includes(":recovery:")) {
        return;
      }

      const nextSavedText = savedSnapshots.get(props.pageSysId) ?? initialSavedEnvelopeText;
      setText(initialEnvelopeText);
      setSavedText(nextSavedText);
      setLastFailure(false);
      setManualSaving(false);
    }, [initialEnvelopeText, initialSavedEnvelopeText, props.pageSysId, props.sessionKey]);

    useEffect(() => {
      const nextStatus: MockHostStatus = {
        flush: flushDocument,
        getRecoverySnapshot: () => ({
          envelope: createEnvelopeForMockText(textRef.current),
          isDirty: textRef.current !== savedTextRef.current,
          pageSysId: props.pageSysId,
          savedRevision: revisionRef.current,
          sessionKey: props.sessionKey
        }),
        isDirty: text !== savedText,
        isSaving: manualSaving,
        status: lastFailure ? "Changes not saved" : manualSaving ? "Saving…" : text === savedText ? "Saved" : "Unsaved"
      };

      const control = controlRef.current;
      if (control) {
        control.status = nextStatus;
      }

      props.onStatusChange(nextStatus);
    }, [flushDocument, lastFailure, manualSaving, props.onStatusChange, savedText, text]);

    return (
      <section aria-label="Mock draft editor" data-docsera-page-editor-host="true">
        <p>Mount {mountId}</p>
        <p>Generation {mountId}</p>
        <p>Session {props.sessionKey}</p>
        <p>Page {props.pageSysId}</p>
        <p>Initial {initialEnvelopeText}</p>
        <p>Baseline {initialSavedEnvelopeText}</p>
        <p>Text {text || "(empty)"}</p>
        <p>Saved {savedText || "(empty)"}</p>
        <p>Status {lastFailure ? "Changes not saved" : manualSaving ? "Saving…" : text === savedText ? "Saved" : "Unsaved"}</p>
        <button type="button" onClick={() => { setLastFailure(false); setText("Draft change"); }}>
          Make dirty
        </button>
        <button type="button" onClick={() => { setLastFailure(false); setText("Draft change 2"); }}>
          Keep typing
        </button>
        <button type="button" onClick={() => setManualSaving(true)}>
          Mark saving
        </button>
        <button type="button" onClick={() => setManualSaving(false)}>
          Clear saving
        </button>
        <button type="button" onClick={() => { setFlushMode("success"); setLastFailure(false); }}>
          Register successful flush
        </button>
        <button type="button" onClick={() => { setFlushMode("failure"); setLastFailure(false); }}>
          Register failed flush
        </button>
        <button type="button" onClick={() => { setFlushMode("deferred"); setLastFailure(false); }}>
          Register deferred flush
        </button>
        <button type="button" onClick={() => controlRef.current?.resolveDeferredFlushes()}>
          Resolve deferred flushes
        </button>
      </section>
    );
  }

  return {
    PageEditorHost: MockPageEditorHost
  };
});

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
    draftTitle: "Overview Draft",
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
    publicationState: "published_with_unpublished_changes",
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

function createPendingChangesResult(rows: Extract<WorkspacePendingChangesResult, { state: "succeeded" }>["rows"]): WorkspacePendingChangesResult {
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
  const editPages = [
    createPageRecord(),
    createPageRecord({
      sysId: "page-002",
      draftTitle: "Child Draft",
      draftSlug: "child",
      draftSlugNormalized: "child",
      siblingOrder: 2,
      parentPageSysId: "page-001",
      publishedTitle: "Child"
    }),
    createPageRecord({
      sysId: "page-003",
      draftTitle: "Draft Only",
      draftSlug: "draft-only",
      draftSlugNormalized: "draft-only",
      publishedTitle: null,
      publishedSlug: null,
      publishedSlugNormalized: null,
      publicationState: "draft",
      siblingOrder: 3
    })
  ];
  const livePages = [
    createPageRecord({
      draftTitle: "Overview",
      publicationState: "published"
    }),
    createPageRecord({
      sysId: "page-002",
      draftTitle: "Child",
      draftSlug: "child",
      draftSlugNormalized: "child",
      siblingOrder: 2,
      parentPageSysId: "page-001",
      publicationState: "published"
    })
  ];

  return {
    ping: vi.fn(async () => {
      throw new Error("ping should not be called");
    }),
    listWorkspaces: vi.fn(async () => ({
      items: [workspace, createWorkspace({ slug: "api-docs", sysId: "workspace-002", name: "API Docs" })],
      page: 1,
      pageSize: 10,
      totalCount: 2,
      hasNextPage: false,
      searchText: ""
    })),
    getWorkspace: vi.fn(async (workspaceSlug: string) => ({
      workspace: workspaceSlug === "api-docs" ? createWorkspace({ slug: "api-docs", sysId: "workspace-002", name: "API Docs" }) : workspace
    })),
    listPages: vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }): Promise<PageListResult> => {
      if (workspaceSlug === "api-docs") {
        return {
          items: [createPageRecord({ workspaceSysId: "workspace-002", draftTitle: "API Overview", draftSlug: "api-overview", draftSlugNormalized: "api-overview" })],
          mode: mode === "edit" ? "edit" : "live",
          workspaceSlug,
          workspaceSysId: "workspace-002",
          totalCount: 1
        };
      }

      return createPageListResult(mode === "edit" ? "edit" : "live", mode === "edit" ? editPages : livePages);
    }),
    createWorkspace: vi.fn(async () => {
      throw new Error("createWorkspace should not be called");
    }),
    getWorkspaceProvisioningStatus: vi.fn(async () => {
      throw new Error("getWorkspaceProvisioningStatus should not be called");
    }),
    createPage: vi.fn(async () => {
      throw new Error("createPage should not be called");
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
      errorMessage: "acquirePageEditLock should not be called",
      retryable: false,
      state: "failed" as const
    })),
    heartbeatPageEditLock: vi.fn(async () => ({
      code: "failed" as const,
      errorMessage: "heartbeatPageEditLock should not be called",
      retryable: false,
      state: "failed" as const
    })),
    releasePageEditLock: vi.fn(async () => ({
      state: "released" as const
    })),
    savePageBody: vi.fn(async (): Promise<PageBodySaveResult> => ({
      state: "succeeded",
      page: createPageRecord({ draftRevision: 1 })
    })),
    publishPage: vi.fn(async () => ({
      errorMessage: "publishPage should not be called",
      state: "failed" as const
    })),
    savePageSettings: vi.fn(async () => {
      throw new Error("savePageSettings should not be called");
    }),
    deletePage: vi.fn(async () => {
      throw new Error("deletePage should not be called");
    }),
    ...overrides
  };
}

function renderApp(search: string, clientOverrides: Partial<ServiceNowClient> = {}) {
  hostControls.clear();
  latestHostControl = null;
  mountSequence = 0;
  window.history.replaceState({}, "", search);

  const runtime: DocseraRuntimeContext = {
    mountNode: document.createElement("div"),
    mountNodeId: "docsera-runtime",
    config: {}
  };

  const serviceNowClient = createClient(clientOverrides);
  return {
    serviceNowClient,
    ...render(<App runtime={runtime} serviceNowClient={serviceNowClient} />)
  };
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

async function waitForHostControl() {
  await waitFor(() => {
    expect(latestHostControl).not.toBeNull();
    expect(latestHostControl?.status?.flush).toEqual(expect.any(Function));
  });
}

describe("App editor-host session boundary", () => {
  it("serializes pending body autosave before child creation and advances mutation authority", async () => {
    const saveDeferred = createDeferred<PageBodySaveResult>();
    const createdChild = createPageRecord({
      sysId: "page-created-child",
      draftTitle: "Queued Child",
      draftSlug: "queued-child",
      draftSlugNormalized: "queued-child",
      parentPageSysId: "page-001",
      siblingOrder: 4,
      publicationState: "draft"
    });
    const savePageBody = vi.fn(() => saveDeferred.promise);
    const createPage = vi.fn(async (): Promise<PageCreateResult> => ({
      changeSetId: "change-set-001",
      changeSetRevision: 9,
      page: createdChild,
      state: "succeeded"
    }));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      createPage,
      savePageBody
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await waitForHostControl();
    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    const flushPromise = latestHostControl?.status?.flush?.();
    await waitFor(() => expect(savePageBody).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Add child page to Overview Draft" }));
    const titleInput = await screen.findByRole("textbox", { name: "New page title" });
    fireEvent.change(titleInput, { target: { value: "Queued Child" } });
    fireEvent.keyDown(titleInput, { key: "Enter" });

    expect(createPage).not.toHaveBeenCalled();
    await act(async () => {
      saveDeferred.resolve({
        changeSetId: "change-set-001",
        changeSetRevision: 8,
        page: createPageRecord({ draftRevision: 1 }),
        state: "succeeded"
      });
      await flushPromise;
    });

    await waitFor(() => expect(createPage).toHaveBeenCalledTimes(1));
    expect(savePageBody).toHaveBeenCalledWith(expect.objectContaining({
      workspaceAuthority: expect.objectContaining({ changeSetId: "change-set-001", changeSetRevision: 7 })
    }));
    expect(createPage).toHaveBeenCalledWith(expect.objectContaining({
      title: "Queued Child",
      workspaceAuthority: expect.objectContaining({ changeSetId: "change-set-001", changeSetRevision: 8 })
    }));
    expect(screen.queryByText("The active draft generation changed. Reload before saving again.")).toBeNull();
  });

  it("keeps Publish visually active while body autosave and pending changes refresh run", async () => {
    const pendingRow = {
      attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
      category: "Modified" as const,
      firstPendingSequence: 1,
      lastChangedOn: "2026-07-18 00:00:00",
      navigable: true,
      pageSysId: "page-001",
      title: "Overview Draft"
    };
    const saveDeferred = createDeferred<PageBodySaveResult>();
    const pendingRefresh = createDeferred<WorkspacePendingChangesResult>();
    let pendingChangesResponse: Promise<WorkspacePendingChangesResult> = Promise.resolve(createPendingChangesResult([pendingRow]));
    const getWorkspacePendingChanges = vi.fn(() => pendingChangesResponse);
    const savePageBody = vi.fn(() => saveDeferred.promise);

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      getWorkspacePendingChanges,
      savePageBody
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await waitForHostControl();
    await waitFor(() => expect(getWorkspacePendingChanges).toHaveBeenCalledTimes(1));
    let publish = screen.getByRole("button", { name: "Open Changes Center" });
    expect(publish).toBeEnabled();
    expect(publish).toHaveClass("docsera-header__publish-button--active");

    pendingChangesResponse = pendingRefresh.promise;
    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Mark saving" }));
    const flushPromise = latestHostControl?.status?.flush?.();
    await waitFor(() => expect(savePageBody).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/Status Saving/)).toBeInTheDocument();
    publish = screen.getByRole("button", { name: "Open Changes Center" });
    expect(publish).toHaveClass("docsera-header__publish-button--active");
    expect(publish).toHaveTextContent("Publish");

    await act(async () => {
      saveDeferred.resolve({
        changeSetId: "change-set-001",
        changeSetRevision: 8,
        page: createPageRecord({ draftRevision: 1, publicationState: "published_with_unpublished_changes" }),
        state: "succeeded"
      });
      await flushPromise;
    });

    await waitFor(() => expect(getWorkspacePendingChanges.mock.calls.length).toBeGreaterThanOrEqual(2));
    publish = screen.getByRole("button", { name: "Open Changes Center" });
    expect(publish).toHaveClass("docsera-header__publish-button--active");

    await act(async () => {
      pendingRefresh.resolve(createPendingChangesResult([pendingRow]));
    });
    await waitFor(() => expect(screen.getByText("Status Saved")).toBeInTheDocument());
    publish = screen.getByRole("button", { name: "Open Changes Center" });
    expect(publish).toBeEnabled();
    expect(publish).toHaveClass("docsera-header__publish-button--active");
  });

  it("retains the active editor generation across repeated rerenders of the same page", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register successful flush" });
    await waitForHostControl();

    const initialMountId = latestHostControl?.mountId;
    const initialSessionKey = latestHostControl?.sessionKey;

    fireEvent.click(screen.getByRole("button", { name: "Toggle theme" }));

    await waitFor(() => {
      expect(screen.getByText("Mount 1")).toBeInTheDocument();
    });
    expect(latestHostControl?.mountId).toBe(initialMountId);
    expect(latestHostControl?.sessionKey).toBe(initialSessionKey);
  });

  it("commits a page navigation after a successful flush without opening leave dialog", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register successful flush" });
    await waitForHostControl();

    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Register successful flush" }));
    fireEvent.click(screen.getByRole("button", { name: "Child Draft" }));

    expect(await screen.findByRole("heading", { name: "Child Draft" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Unsaved changes" })).not.toBeInTheDocument();

    await waitFor(() => {
      expect(latestHostControl?.pageSysId).toBe("page-002");
    });
  });

  it("opens leave dialog after a failed flush", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register successful flush" });
    await waitForHostControl();

    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Register failed flush" }));
    fireEvent.click(screen.getByRole("button", { name: "Live" }));

    expect(await screen.findByRole("dialog", { name: "Unsaved changes" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
  });

  it("commits Edit to Live after a successful flush without opening leave dialog", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register successful flush" });
    await waitForHostControl();

    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Register successful flush" }));
    fireEvent.click(screen.getByRole("button", { name: "Live" }));

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Unsaved changes" })).not.toBeInTheDocument();
    expectWorkspaceSearch({ workspace: "product-docs", page: "overview", mode: null });
  });

  it("commits workspace switch transitions after a successful flush", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=child");

    expect(await screen.findByRole("heading", { name: "Child Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register successful flush" });
    await waitForHostControl();

    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Register successful flush" }));
    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /API Docs/i }));

    expect(await screen.findByRole("heading", { name: "API Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Unsaved changes" })).not.toBeInTheDocument();
    expectWorkspaceSearch({ workspace: "api-docs", page: "api-overview" });
  });

  it("commits launcher transitions after a successful flush", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=child");

    expect(await screen.findByRole("heading", { name: "Child Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register successful flush" });
    await waitForHostControl();

    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Register successful flush" }));
    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "My Workspaces" }));

    expect(await screen.findByRole("heading", { name: "My Workspaces" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Unsaved changes" })).not.toBeInTheDocument();
    expect(readRouteValues()).toMatchObject({ workspace: null, page: null, mode: null });
  });

  it("uses the same flush boundary for browser back and forward navigation", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register successful flush" });
    await waitForHostControl();

    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Register successful flush" }));
    fireEvent.click(screen.getByRole("button", { name: "Child Draft" }));

    expect(await screen.findByRole("heading", { name: "Child Draft" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Register successful flush" }));

    await act(async () => {
      window.history.back();
      await Promise.resolve();
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Unsaved changes" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Register successful flush" }));

    await act(async () => {
      window.history.forward();
      await Promise.resolve();
    });

    expect(await screen.findByRole("heading", { name: "Child Draft" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Unsaved changes" })).not.toBeInTheDocument();
  });

  it("waits for the latest local document before a deferred flush resolves", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register deferred flush" });
    await waitForHostControl();

    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Register deferred flush" }));
    fireEvent.click(screen.getByRole("button", { name: "Live" }));

    await waitFor(() => {
      expect(latestHostControl?.status?.isSaving).toBe(true);
      expect(screen.queryByRole("dialog", { name: "Unsaved changes" })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Keep typing" }));
    fireEvent.click(screen.getByRole("button", { name: "Resolve deferred flushes" }));

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(savedSnapshots.get("page-001")).toBe("Draft change 2");
    expect(screen.queryByRole("dialog", { name: "Unsaved changes" })).not.toBeInTheDocument();
  });

  it("keeps a late flush from an invalidated prior page session from committing", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register deferred flush" });
    await waitForHostControl();

    const staleControl = latestHostControl;
    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Register deferred flush" }));
    fireEvent.click(screen.getByRole("button", { name: "Live" }));

    await waitFor(() => {
      expect(latestHostControl?.status?.isSaving).toBe(true);
    });

    staleControl?.emitAccessLost();
    expect(await screen.findByRole("heading", { name: "Authoring access is no longer available" })).toBeInTheDocument();

    const routeBeforeResolve = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    staleControl?.resolveDeferredFlushes();

    await waitFor(() => {
      expect(`${window.location.pathname}${window.location.search}${window.location.hash}`).toBe(routeBeforeResolve);
    });
    expect(screen.getByRole("heading", { name: "Authoring access is no longer available" })).toBeInTheDocument();
    expect(latestHostControl).toBeNull();
  });

  it("prevents an older transition from committing after a newer one supersedes it", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register deferred flush" });
    await waitForHostControl();

    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Register deferred flush" }));
    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: /API Docs/i }));

    fireEvent.click(screen.getByRole("button", { name: "Resolve deferred flushes" }));

    expect(await screen.findByRole("heading", { name: "API Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Unsaved changes" })).not.toBeInTheDocument();
    expectWorkspaceSearch({ workspace: "api-docs", page: "api-overview" });
  });

  it("clears flush registration when the page changes", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register successful flush" });
    await waitForHostControl();

    const priorSessionKey = latestHostControl?.sessionKey;
    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Register successful flush" }));
    fireEvent.click(screen.getByRole("button", { name: "Child Draft" }));

    expect(await screen.findByRole("heading", { name: "Child Draft" })).toBeInTheDocument();
    expect(latestHostControl?.sessionKey).not.toBe(priorSessionKey);
    expect(priorSessionKey ? hostControls.has(priorSessionKey) : false).toBe(false);
    expect(latestHostControl?.status?.flush).toEqual(expect.any(Function));
  });

  it("clears flush registration when Edit mode ends", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register successful flush" });
    await waitForHostControl();

    const priorSessionKey = latestHostControl?.sessionKey;
    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Register successful flush" }));
    fireEvent.click(screen.getByRole("button", { name: "Live" }));

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(latestHostControl).toBeNull();
    expect(priorSessionKey ? hostControls.has(priorSessionKey) : false).toBe(false);
    expectWorkspaceSearch({ workspace: "product-docs", page: "overview", mode: null });
  });

  it("clears flush registration after access loss", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=draft-only");

    expect(await screen.findByRole("heading", { name: "Draft Only" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register successful flush" });
    await waitForHostControl();

    const priorSessionKey = latestHostControl?.sessionKey;
    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Register successful flush" }));

    latestHostControl?.emitAccessLost();

    expect(await screen.findByRole("heading", { name: "Authoring access is no longer available" })).toBeInTheDocument();
    expect(latestHostControl).toBeNull();
    expect(priorSessionKey ? hostControls.has(priorSessionKey) : false).toBe(false);
  });

  it("clears flush registration when the host tears down", async () => {
    const view = renderApp("/?workspace=product-docs&mode=edit&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register successful flush" });
    await waitForHostControl();

    const priorSessionKey = latestHostControl?.sessionKey;

    view.unmount();

    expect(latestHostControl).toBeNull();
    expect(priorSessionKey ? hostControls.has(priorSessionKey) : false).toBe(false);
  });

  it("keeps the Edit URL, mounted editor, and failed-save state after a transient body-save recovery failure", async () => {
    const savePageBody = vi.fn(async ({ workspaceLeaseToken }: { workspaceLeaseToken?: string }): Promise<PageBodySaveResult> => (
      workspaceLeaseToken === "workspace-lease-token"
        ? {
            code: "lock_lost",
            errorMessage: "Workspace lease lost.",
            state: "failed"
          }
        : {
            errorMessage: "The stale token should not be retried.",
            state: "failed"
          }
    ));
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
      savePageBody
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register successful flush" });
    await waitForHostControl();

    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    await act(async () => {
      await latestHostControl?.status?.flush?.();
    });

    await waitFor(() => expect(savePageBody).toHaveBeenCalledTimes(1));
    expect(savePageBody.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ workspaceLeaseToken: "workspace-lease-token" }));
    expect(acquireWorkspaceEditLease).toHaveBeenCalledTimes(2);
    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" });
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).not.toBeNull();
    expect(await screen.findByText("Status Changes not saved")).toBeInTheDocument();
    expect(latestHostControl?.status?.isDirty).toBe(true);
    expect(screen.queryByText(/currently being edited by another user/i)).toBeNull();
  });

  it("can recover again on a later body-save action after a transient recovery failure", async () => {
    const savePageBody = vi
      .fn()
      .mockImplementation(async ({ workspaceLeaseToken }: { workspaceLeaseToken?: string }): Promise<PageBodySaveResult> => {
        if (workspaceLeaseToken === "workspace-lease-token") {
          return {
            code: "lock_lost",
            errorMessage: "Workspace lease lost.",
            state: "failed"
          };
        }

        if (workspaceLeaseToken === "replacement-lease-token") {
          return {
            page: createPageRecord({ draftRevision: 1 }),
            state: "succeeded"
          };
        }

        return {
          errorMessage: "Unexpected lease token.",
          state: "failed"
        };
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
      savePageBody
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register successful flush" });
    await waitForHostControl();

    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    await act(async () => {
      await latestHostControl?.status?.flush?.();
    });
    expect(await screen.findByText("Status Changes not saved")).toBeInTheDocument();

    await act(async () => {
      await latestHostControl?.status?.flush?.();
    });

    await waitFor(() => expect(savePageBody).toHaveBeenCalledTimes(2));
    expect(savePageBody.mock.calls.map(([input]) => input.workspaceLeaseToken)).toEqual([
      "workspace-lease-token",
      "replacement-lease-token"
    ]);
    expect(acquireWorkspaceEditLease).toHaveBeenCalledTimes(3);
    expect(await screen.findByText("Status Saved")).toBeInTheDocument();
    expect(latestHostControl?.status?.isDirty).toBe(false);
    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" });
  });

  it("blocks repeat body persistence until a stale-generation refresh installs the refreshed workspace authority", async () => {
    const refreshDeferred = createDeferred<PageListResult>();
    let editListCount = 0;
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) => {
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
        return refreshDeferred.promise;
      }

      return createPageListResult("live", [
        createPageRecord({
          draftTitle: "Overview",
          publishedTitle: "Overview"
        })
      ]);
    });
    const savePageBody = vi
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
          draftRevision: 1,
          draftTitle: "Overview Refreshed",
          publicationState: "published_with_unpublished_changes"
        }),
        state: "succeeded" as const
      });

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      listPages,
      savePageBody
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register successful flush" });
    await waitForHostControl();

    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    const staleFlushPromise = latestHostControl?.status?.flush?.();

    await waitFor(() => expect(savePageBody).toHaveBeenCalledTimes(1));
    expect(savePageBody.mock.calls[0]?.[0]).toEqual(expect.objectContaining({
      workspaceAuthority: expect.objectContaining({ changeSetId: "change-set-001", changeSetRevision: 7 }),
      workspaceLeaseToken: "workspace-lease-token"
    }));
    expect(listPages).toHaveBeenCalledTimes(2);

    await act(async () => {
      void latestHostControl?.status?.flush?.();
      await Promise.resolve();
    });

    expect(savePageBody).toHaveBeenCalledTimes(1);

    await act(async () => {
      refreshDeferred.resolve(createPageListResult("edit", [
        createPageRecord({
          draftTitle: "Overview Refreshed",
          publicationState: "published_with_unpublished_changes"
        })
      ]));
      await staleFlushPromise;
      await Promise.resolve();
    });

    expect(savePageBody).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("Status Changes not saved")).toBeInTheDocument();
    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" });
    expect(await screen.findByRole("heading", { name: "Overview Refreshed" })).toBeInTheDocument();

    await act(async () => {
      await latestHostControl?.status?.flush?.();
    });

    await waitFor(() => expect(savePageBody).toHaveBeenCalledTimes(2));
    expect(savePageBody.mock.calls[1]?.[0]).toEqual(expect.objectContaining({
      workspaceAuthority: expect.objectContaining({ changeSetId: "change-set-001", changeSetRevision: 8 }),
      workspaceLeaseToken: "workspace-lease-token"
    }));
    expect(await screen.findByText("Status Saved")).toBeInTheDocument();
  });

  it.each([
    {
      expectedAlert: "This workspace is currently being edited by Priya Writer.",
      recoveryResult: {
        holderDisplayName: "Priya Writer",
        sameUserDifferentSession: false,
        state: "locked" as const
      }
    },
    {
      expectedAlert: "You do not have permission to edit this workspace.",
      recoveryResult: {
        errorMessage: "You do not have permission to edit this workspace.",
        failure: "forbidden" as const,
        retryable: false,
        state: "failed" as const
      }
    }
  ])("returns to Live after a $expectedAlert recovery outcome during body save", async ({ expectedAlert, recoveryResult }) => {
    const savePageBody = vi.fn(async (): Promise<PageBodySaveResult> => ({
      code: "lock_lost",
      errorMessage: "Workspace lease lost.",
      state: "failed"
    }));
    const acquireWorkspaceEditLease = vi
      .fn()
      .mockResolvedValueOnce(heldLease("workspace-lease-token"))
      .mockResolvedValueOnce(recoveryResult);

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      savePageBody
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register successful flush" });
    await waitForHostControl();

    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    await act(async () => {
      await latestHostControl?.status?.flush?.();
    });

    expect(await screen.findByRole("alert")).toHaveTextContent(expectedAlert);
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", page: "overview" }));
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).toBeNull();
  });

  it("restores the captured body on deliberate Edit re-entry when the draft revision still matches", async () => {
    const restoredPage = createPageRecord({ draftRevision: 1 });
    const savePageBody = vi
      .fn()
      .mockResolvedValueOnce({
        code: "lock_lost",
        errorMessage: "Workspace lease lost.",
        state: "failed" as const
      })
      .mockResolvedValueOnce({
        page: restoredPage,
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
      savePageBody
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register successful flush" });
    await waitForHostControl();

    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    await act(async () => {
      await latestHostControl?.status?.flush?.();
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("This workspace is currently being edited by Priya Writer.");
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", page: "overview", mode: null }));
    expect(savePageBody).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));
    expect(await screen.findByText("Your unsaved changes were restored. Review them before saving.")).toBeInTheDocument();
    await waitFor(() => expect(latestHostControl?.status?.isDirty).toBe(true));
    expect(screen.getAllByText(/Draft change/).length).toBeGreaterThan(0);
    expect(savePageBody).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Register successful flush" }));
    await act(async () => {
      await latestHostControl?.status?.flush?.();
    });

    await waitFor(() => expect(savePageBody).toHaveBeenCalledTimes(2));
    expect(savePageBody.mock.calls[1]?.[0]).toEqual(expect.objectContaining({ workspaceLeaseToken: "replacement-lease-token" }));
    expect(await screen.findByText("Status Saved")).toBeInTheDocument();
  });

  it("clears the stale body snapshot when the shared draft revision changed before Edit re-entry", async () => {
    const savePageBody = vi.fn(async (): Promise<PageBodySaveResult> => ({
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
            draftRevision: mode === "edit" && acquireWorkspaceEditLease.mock.calls.length >= 3 ? 1 : 0
          })
        ]
      )
    );

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      listPages,
      savePageBody
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register successful flush" });
    await waitForHostControl();

    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    await act(async () => {
      await latestHostControl?.status?.flush?.();
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("This workspace is currently being edited by Priya Writer.");
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", page: "overview" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));
    expect(await screen.findByText("Your earlier unsaved changes could not be restored because the shared draft changed.")).toBeInTheDocument();
    await waitFor(() => expect(latestHostControl?.status?.isDirty).toBe(false));
    expect(screen.queryByText(/Draft change/)).toBeNull();
    expect(savePageBody).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));
    expect(screen.queryByText("Your earlier unsaved changes could not be restored because the shared draft changed.")).toBeNull();
    expect(screen.queryByText(/Draft change/)).toBeNull();
  });

  it("clears the exact restored body snapshot after explicit discard and does not restore it on later Edit re-entry", async () => {
    const savePageBody = vi
      .fn()
      .mockResolvedValueOnce({
        code: "lock_lost",
        errorMessage: "Workspace lease lost.",
        state: "failed" as const
      })
      .mockResolvedValue({
        errorMessage: "Something went wrong while saving the page body. Please try again.",
        state: "failed" as const
      });
    const acquireWorkspaceEditLease = vi
      .fn()
      .mockResolvedValueOnce(heldLease("workspace-lease-token"))
      .mockResolvedValueOnce({
        holderDisplayName: "Priya Writer",
        sameUserDifferentSession: false,
        state: "locked" as const
      })
      .mockResolvedValueOnce(heldLease("replacement-lease-token"))
      .mockResolvedValueOnce(heldLease("replacement-lease-token-2"));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      savePageBody
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register failed flush" });
    await waitForHostControl();

    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    await act(async () => {
      await latestHostControl?.status?.flush?.();
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("This workspace is currently being edited by Priya Writer.");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByText("Your unsaved changes were restored. Review them before saving.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Register failed flush" }));
    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    const discardDialog = await screen.findByRole("dialog", { name: "Unsaved changes" });
    fireEvent.click(within(discardDialog).getByRole("button", { name: "Discard changes" }));

    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", page: "overview" }));
    expect(screen.queryByText("Your unsaved changes were restored. Review them before saving.")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));
    expect(screen.queryByText("Your unsaved changes were restored. Review them before saving.")).toBeNull();
    await waitFor(() => expect(latestHostControl?.status?.isDirty).toBe(false));
  });

  it("captures both the dirty body and Page Settings before a settings-triggered forced Live fallback", async () => {
    const savePageSettings = vi.fn(async (): Promise<PageSettingsSaveResult> => ({
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

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      savePageSettings
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await waitForHostControl();
    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview Draft" }));
    const panel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(panel).getByRole("button", { name: "Overview Draft" }));
    const titleInput = screen.getByDisplayValue("Overview Draft");
    fireEvent.change(titleInput, { target: { value: "Overview Draft Restored" } });
    fireEvent.blur(titleInput);
    fireEvent.click(within(panel).getByRole("button", { name: "Close page settings" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This workspace is currently being edited by Priya Writer.");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));
    expect(await screen.findByText("Your unsaved changes were restored. Review them before saving.")).toBeInTheDocument();
    expect(screen.getByText("Your unsaved Page Settings changes were restored. Review them before saving.")).toBeInTheDocument();
    expect(within(screen.getByRole("complementary", { name: "Page Settings" })).getByRole("button", { name: "Overview Draft Restored" })).toBeInTheDocument();
    await waitFor(() => expect(latestHostControl?.status?.isDirty).toBe(true));
  });

  it("captures both the dirty body and inline-create input before a create-triggered forced Live fallback", async () => {
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

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      createPage
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await waitForHostControl();
    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Add child page to Overview Draft" }));
    const titleInput = await screen.findByRole("textbox", { name: "New page title" });
    fireEvent.change(titleInput, { target: { value: "Nested draft" } });
    fireEvent.keyDown(titleInput, { key: "Enter" });

    expect(await screen.findByRole("alert")).toHaveTextContent("This workspace is currently being edited by Priya Writer.");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));
    expect(await screen.findByText("Your unsaved changes were restored. Review them before saving.")).toBeInTheDocument();
    expect(await screen.findByRole("textbox", { name: "New page title" })).toHaveValue("Nested draft");
    await waitFor(() => expect(latestHostControl?.status?.isDirty).toBe(true));
  });

  it("captures both body and Page Settings when the settings mutation forces Live while the body save is already in flight", async () => {
    const savePageSettings = vi.fn(async (): Promise<PageSettingsSaveResult> => ({
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

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      savePageSettings
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register deferred flush" });
    await waitForHostControl();

    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Register deferred flush" }));
    await act(async () => {
      void latestHostControl?.status?.flush?.();
      await Promise.resolve();
    });
    await waitFor(() => expect(latestHostControl?.status?.isSaving).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview Draft" }));
    const panel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(panel).getByRole("button", { name: "Overview Draft" }));
    const titleInput = screen.getByDisplayValue("Overview Draft");
    fireEvent.change(titleInput, { target: { value: "Overview Draft Pending" } });
    fireEvent.blur(titleInput);
    fireEvent.click(within(panel).getByRole("button", { name: "Close page settings" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This workspace is currently being edited by Priya Writer.");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));
    expect(await screen.findByText("Your unsaved changes were restored. Review them before saving.")).toBeInTheDocument();
    expect(screen.getByText("Your unsaved Page Settings changes were restored. Review them before saving.")).toBeInTheDocument();
    expect(within(screen.getByRole("complementary", { name: "Page Settings" })).getByRole("button", { name: "Overview Draft Pending" })).toBeInTheDocument();
  });

  it("discards the current body recovery when a direct forbidden body-save forces Live", async () => {
    const savePageBody = vi.fn(async (): Promise<PageBodySaveResult> => ({
      code: "forbidden",
      errorMessage: "You do not have permission to edit this workspace.",
      state: "failed"
    }));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { savePageBody });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register successful flush" });
    await waitForHostControl();

    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep typing" }));
    await act(async () => {
      await latestHostControl?.status?.flush?.();
    });

    await waitFor(() => expect(savePageBody).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission to edit this workspace.");
    expect(savedSnapshots.get("page-001")).toBeUndefined();
    expect(screen.queryByText("Status Saved")).toBeNull();
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", page: "overview" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));

    expect(screen.queryByText("Your unsaved changes were restored. Review them before saving.")).toBeNull();
    expect(screen.queryByText(/Draft change 2/)).toBeNull();
    expect(savePageBody).toHaveBeenCalledTimes(1);
  });

  it("clears an existing contention body recovery when Edit re-entry acquisition returns forbidden", async () => {
    const savePageBody = vi.fn(async (): Promise<PageBodySaveResult> => ({
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
      savePageBody
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register successful flush" });
    await waitForHostControl();

    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep typing" }));
    await act(async () => {
      await latestHostControl?.status?.flush?.();
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("This workspace is currently being edited by Priya Writer.");
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", page: "overview" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission to edit this workspace.");
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", page: "overview" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));

    expect(screen.queryByText("Your unsaved changes were restored. Review them before saving.")).toBeNull();
    expect(screen.queryByText(/Draft change 2/)).toBeNull();
    expect(savePageBody).toHaveBeenCalledTimes(1);
  });

  it("preserves an existing contention body recovery when Edit re-entry acquisition is blocked again", async () => {
    const savePageBody = vi.fn(async (): Promise<PageBodySaveResult> => ({
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
        holderDisplayName: "Priya Writer",
        sameUserDifferentSession: false,
        state: "locked" as const
      })
      .mockResolvedValueOnce(heldLease("replacement-lease-token"));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      savePageBody
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register successful flush" });
    await waitForHostControl();

    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    await act(async () => {
      await latestHostControl?.status?.flush?.();
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("This workspace is currently being edited by Priya Writer.");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("This workspace is currently being edited by Priya Writer.");
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", page: "overview" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));

    expect(await screen.findByText("Your unsaved changes were restored. Review them before saving.")).toBeInTheDocument();
  });

  it("clears Page Settings recovery alongside a direct forbidden body-save fallback", async () => {
    const savePageBody = vi.fn(async (): Promise<PageBodySaveResult> => ({
      code: "forbidden",
      errorMessage: "You do not have permission to edit this workspace.",
      state: "failed"
    }));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { savePageBody });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await waitForHostControl();
    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview Draft" }));
    const panel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(panel).getByRole("button", { name: "Overview Draft" }));
    const titleInput = screen.getByDisplayValue("Overview Draft");
    fireEvent.change(titleInput, { target: { value: "Overview Draft Forbidden" } });
    fireEvent.blur(titleInput);

    await act(async () => {
      await latestHostControl?.status?.flush?.();
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission to edit this workspace.");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));
    expect(screen.queryByText("Your unsaved changes were restored. Review them before saving.")).toBeNull();
    expect(screen.queryByText("Your unsaved Page Settings changes were restored. Review them before saving.")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Page Settings" })).toBeNull();
  });

  it("clears inline-create recovery alongside a direct forbidden body-save fallback", async () => {
    const savePageBody = vi.fn(async (): Promise<PageBodySaveResult> => ({
      code: "forbidden",
      errorMessage: "You do not have permission to edit this workspace.",
      state: "failed"
    }));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { savePageBody });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await waitForHostControl();
    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Add child page to Overview Draft" }));
    const titleInput = await screen.findByRole("textbox", { name: "New page title" });
    fireEvent.change(titleInput, { target: { value: "Body forbidden child" } });

    await act(async () => {
      await latestHostControl?.status?.flush?.();
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission to edit this workspace.");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));
    expect(screen.queryByText("Your unsaved changes were restored. Review them before saving.")).toBeNull();
    expect(screen.queryByRole("textbox", { name: "New page title" })).toBeNull();
  });

  it("creates no body recovery when scheduled renewal forbidden forces Live", async () => {
    const renewDeferred = createDeferred<WorkspaceEditLeaseRenewResult>();
    const renewWorkspaceEditLease = vi.fn(() => renewDeferred.promise);

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { renewWorkspaceEditLease });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await waitForHostControl();
    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Keep typing" }));

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });
    await waitFor(() => expect(renewWorkspaceEditLease).toHaveBeenCalledTimes(1));

    await act(async () => {
      renewDeferred.resolve({
        errorMessage: "You do not have permission to edit this workspace.",
        failure: "forbidden",
        retryable: false,
        state: "failed"
      });
      await Promise.resolve();
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission to edit this workspace.");
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", page: "overview" }));
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));
    expect(screen.queryByText("Your unsaved changes were restored. Review them before saving.")).toBeNull();
    expect(screen.queryByText(/Draft change 2/)).toBeNull();
  });

  it("creates no body recovery when the initial Edit acquisition is forbidden", async () => {
    const acquireWorkspaceEditLease = vi
      .fn()
      .mockResolvedValueOnce({
        errorMessage: "You do not have permission to edit this workspace.",
        failure: "forbidden" as const,
        retryable: false,
        state: "failed" as const
      })
      .mockResolvedValueOnce(heldLease("workspace-lease-token"));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { acquireWorkspaceEditLease });

    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission to edit this workspace.");
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", page: "overview" }));

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));

    expect(screen.queryByText("Your unsaved changes were restored. Review them before saving.")).toBeNull();
    expect(screen.queryByText(/Draft change/)).toBeNull();
  });

  it("clears open Page Settings recovery when scheduled renewal forbidden forces Live", async () => {
    const renewDeferred = createDeferred<WorkspaceEditLeaseRenewResult>();
    const renewWorkspaceEditLease = vi.fn(() => renewDeferred.promise);

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { renewWorkspaceEditLease });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await waitForHostControl();
    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview Draft" }));
    const panel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(panel).getByRole("button", { name: "Overview Draft" }));
    const titleInput = screen.getByDisplayValue("Overview Draft");
    fireEvent.change(titleInput, { target: { value: "Renewal Forbidden Title" } });
    fireEvent.blur(titleInput);

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });
    await waitFor(() => expect(renewWorkspaceEditLease).toHaveBeenCalledTimes(1));

    await act(async () => {
      renewDeferred.resolve({
        errorMessage: "You do not have permission to edit this workspace.",
        failure: "forbidden",
        retryable: false,
        state: "failed"
      });
      await Promise.resolve();
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission to edit this workspace.");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));
    expect(screen.queryByText("Your unsaved Page Settings changes were restored. Review them before saving.")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Page Settings" })).toBeNull();
  });

  it("clears inline-create recovery when scheduled renewal forbidden forces Live", async () => {
    const renewDeferred = createDeferred<WorkspaceEditLeaseRenewResult>();
    const renewWorkspaceEditLease = vi.fn(() => renewDeferred.promise);

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { renewWorkspaceEditLease });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await waitForHostControl();
    fireEvent.click(screen.getByRole("button", { name: "Add child page to Overview Draft" }));
    const titleInput = await screen.findByRole("textbox", { name: "New page title" });
    fireEvent.change(titleInput, { target: { value: "Renewal child" } });

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });
    await waitFor(() => expect(renewWorkspaceEditLease).toHaveBeenCalledTimes(1));

    await act(async () => {
      renewDeferred.resolve({
        errorMessage: "You do not have permission to edit this workspace.",
        failure: "forbidden",
        retryable: false,
        state: "failed"
      });
      await Promise.resolve();
    });

    expect(await screen.findByRole("alert")).toHaveTextContent("You do not have permission to edit this workspace.");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));
    expect(screen.queryByRole("textbox", { name: "New page title" })).toBeNull();
  });

  it("keeps Edit active and creates no recovery snapshot for transient scheduled renewal failures", async () => {
    const renewWorkspaceEditLease = vi.fn(async (): Promise<WorkspaceEditLeaseRenewResult> => ({
      errorMessage: "Workspace editing is temporarily unavailable. Please try again.",
      failure: "transient",
      retryable: true,
      state: "failed"
    }));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { renewWorkspaceEditLease });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await waitForHostControl();
    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });
    await waitFor(() => expect(renewWorkspaceEditLease).toHaveBeenCalledTimes(1));

    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" });
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).not.toBeNull();
    expect(latestHostControl?.status?.isDirty).toBe(true);
    expect(screen.queryByText("Your unsaved changes were restored. Review them before saving.")).toBeNull();
  });

  it("ignores a stale forbidden heartbeat result after a newer binding replaces the old one", async () => {
    const renewDeferred = createDeferred<WorkspaceEditLeaseRenewResult>();
    const renewWorkspaceEditLease = vi.fn(() => renewDeferred.promise);
    const acquireWorkspaceEditLease = vi
      .fn()
      .mockResolvedValueOnce(heldLease("workspace-lease-token"))
      .mockResolvedValueOnce(heldLease("replacement-lease-token"));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      renewWorkspaceEditLease
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await waitForHostControl();
    const initialSessionKey = latestHostControl?.sessionKey;

    await act(async () => {
      window.dispatchEvent(new Event("online"));
      await Promise.resolve();
    });
    await waitFor(() => expect(renewWorkspaceEditLease).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await waitForHostControl();
    expect(latestHostControl?.sessionKey).not.toBe(initialSessionKey);
    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));

    await act(async () => {
      renewDeferred.resolve({
        errorMessage: "You do not have permission to edit this workspace.",
        failure: "forbidden",
        retryable: false,
        state: "failed"
      });
      await Promise.resolve();
    });

    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" });
    expect(latestHostControl?.status?.isDirty).toBe(true);
    expect(screen.queryByText("You do not have permission to edit this workspace.")).toBeNull();
  });
});
