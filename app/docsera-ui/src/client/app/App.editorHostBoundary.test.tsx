/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect, useRef, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { EditorOutlineItem } from "../editor/documentOutline";
import { createEmptyDocseraDocumentEnvelope, type DocseraDocumentEnvelope } from "../../shared/editor/document";
import type {
  DocseraRuntimeContext,
  PageBodySaveResult,
  PageListResult,
  ServiceNowClient,
  WorkspaceMode,
  WorkspacePageRecord,
  WorkspaceViewRecord
} from "../shared/types/docsera";

type MockHostProps = {
  initialRevision: number;
  onAccessLost: () => void;
  onError: (failure: { kind: "load_failed" | "mount_failed"; message: string } | null) => void;
  onReadyStateChange?: (ready: boolean) => void;
  onOutlineChange: (outline: EditorOutlineItem[]) => void;
  onSaveDraft: (input: {
    draftContentJson: DocseraDocumentEnvelope;
    expectedRevision: number;
    pageSysId: string;
  }) => Promise<PageBodySaveResult>;
  onStatusChange: (state: {
    flush?: () => Promise<boolean>;
    isDirty: boolean;
    isSaving: boolean;
    status: "Unsaved" | "Saving…" | "Saved" | "Changes not saved";
  }) => void;
  pageSysId: string;
  sessionKey: string;
};

type MockHostStatus = {
  flush?: () => Promise<boolean>;
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
});

function createDeferredFlush(): DeferredFlush {
  let resolve: (value: boolean) => void = () => undefined;
  const promise = new Promise<boolean>((nextResolve) => {
    resolve = nextResolve;
  });

  return { promise, resolve };
}

vi.mock("../editor/PageEditorHost", () => {
  function MockPageEditorHost(props: MockHostProps) {
    const mountId = useRef(++mountSequence).current;
    const propsRef = useRef(props);
    const [text, setText] = useState("");
    const [savedText, setSavedText] = useState(() => savedSnapshots.get(props.pageSysId) ?? "");
    const [manualSaving, setManualSaving] = useState(false);
    const [flushMode, setFlushMode] = useState<"success" | "failure" | "deferred">("success");
    const [lastFailure, setLastFailure] = useState(false);
    const textRef = useRef(text);
    const savedTextRef = useRef(savedText);
    const deferredFlushRef = useRef<DeferredFlush | null>(null);
    const controlRef = useRef<MockHostControl | null>(null);

    propsRef.current = props;
    textRef.current = text;
    savedTextRef.current = savedText;

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
        pageSysId: props.pageSysId,
        sessionKey: props.sessionKey
      };
    }

    async function flushDocument() {
      if (flushMode === "failure") {
        setLastFailure(true);
        setManualSaving(false);
        return false;
      }

      if (flushMode === "deferred") {
        const deferred = deferredFlushRef.current ?? createDeferredFlush();
        deferredFlushRef.current = deferred;
        setManualSaving(true);
        const saved = await deferred.promise;
        setManualSaving(false);
        if (saved) {
          const nextSavedText = textRef.current;
          savedSnapshots.set(propsRef.current.pageSysId, nextSavedText);
          savedTextRef.current = nextSavedText;
          setSavedText(nextSavedText);
          setLastFailure(false);
        } else {
          setLastFailure(true);
        }
        if (deferredFlushRef.current === deferred) {
          deferredFlushRef.current = null;
        }
        return saved;
      }

      const nextSavedText = textRef.current;
      savedSnapshots.set(propsRef.current.pageSysId, nextSavedText);
      savedTextRef.current = nextSavedText;
      setSavedText(nextSavedText);
      setLastFailure(false);
      setManualSaving(false);
      return true;
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
      const nextStatus: MockHostStatus = {
        flush: flushDocument,
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

async function waitForHostControl() {
  await waitFor(() => {
    expect(latestHostControl).not.toBeNull();
    expect(latestHostControl?.status?.flush).toEqual(expect.any(Function));
  });
}

describe("App editor-host session boundary", () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Child Draft Unpublished" }));

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
    expect(window.location.search).toBe("?workspace=product-docs&page=overview");
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
    expect(window.location.search).toContain("workspace=api-docs");
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
    expect(window.location.search).toBe("?view=my-workspaces");
  });

  it("uses the same flush boundary for browser back and forward navigation", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register successful flush" });
    await waitForHostControl();

    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Register successful flush" }));
    fireEvent.click(screen.getByRole("button", { name: "Child Draft Unpublished" }));

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

    const searchBeforeResolve = window.location.search;
    staleControl?.resolveDeferredFlushes();

    await waitFor(() => {
      expect(window.location.search).toBe(searchBeforeResolve);
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
    expect(window.location.search).toContain("workspace=api-docs");
  });

  it("clears flush registration when the page changes", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Register successful flush" });
    await waitForHostControl();

    const priorSessionKey = latestHostControl?.sessionKey;
    fireEvent.click(screen.getByRole("button", { name: "Make dirty" }));
    fireEvent.click(screen.getByRole("button", { name: "Register successful flush" }));
    fireEvent.click(screen.getByRole("button", { name: "Child Draft Unpublished" }));

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
    expect(window.location.search).toBe("?workspace=product-docs&page=overview");
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
});
