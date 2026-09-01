/* @vitest-environment jsdom */

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useRef, type ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { createEmptyDocseraDocumentEnvelope } from "../../shared/editor/document";
import type {
  DocseraRuntimeContext,
  PageBodySaveResult,
  PageSettingsSaveResult,
  PageListResult,
  ServiceNowClient,
  WorkspaceMode,
  WorkspacePageRecord,
  WorkspaceViewRecord
} from "../shared/types/docsera";
import { createDeferred, createPendingChangesResult } from "./appTestSupport";

let lastMarkdownSourcePanelProps: {
  onBodyChange?: (envelope: ReturnType<typeof createEmptyDocseraDocumentEnvelope>) => unknown;
  onInvalidChange?: (state: { errorMessage: string; isInvalid: boolean; isUnavailable: boolean; pageSysId: string }) => void;
  onTitleChange?: (title: string) => void;
  editable?: boolean;
  handoffRetryNonce?: number;
  visible?: boolean;
} | null = null;
let retainedUnavailableMarkdownEnvelope: ReturnType<typeof createEmptyDocseraDocumentEnvelope> | null = null;
let lastMarkdownRetryNonce = 0;
let lastPageEditorHostProps: {
  applyCanonicalEnvelope?: (envelope: ReturnType<typeof createEmptyDocseraDocumentEnvelope>) => {
    kind: "applied" | "unchanged";
    nextEnvelope: ReturnType<typeof createEmptyDocseraDocumentEnvelope>;
  };
  flush?: () => Promise<boolean>;
  getCanonicalEnvelope?: () => ReturnType<typeof createEmptyDocseraDocumentEnvelope> | null;
  initialEnvelope?: ReturnType<typeof createEmptyDocseraDocumentEnvelope>;
  interactionActive?: boolean;
  onError?: (failure: null) => void;
  onReadyStateChange?: (ready: boolean) => void;
  onStatusChange?: (state: {
    applyCanonicalEnvelope?: (envelope: ReturnType<typeof createEmptyDocseraDocumentEnvelope>) => {
      kind: "applied" | "unchanged";
      nextEnvelope: ReturnType<typeof createEmptyDocseraDocumentEnvelope>;
    };
    flush?: () => Promise<boolean>;
    getCanonicalEnvelope?: () => ReturnType<typeof createEmptyDocseraDocumentEnvelope> | null;
    isDirty: boolean;
    isSaving: boolean;
    status?: string;
  }) => void;
  sessionKey?: string;
} | null = null;
let lastDocseraHeaderProps: {
  authoringSurfaceLocked?: boolean;
  onAuthoringSurfaceChange?: (surface: "visual" | "markdown") => void;
  onWorkspaceModeChange?: (mode: WorkspaceMode) => void;
  showAuthoringSurfaceToggle?: boolean;
  showWorkspaceMode?: WorkspaceMode;
} | null = null;
let mockEditorReady = true;

vi.mock("../editor/PageEditorHost", () => ({
  PageEditorHost: function MockPageEditorHost({
    canEdit,
    applyCanonicalEnvelope,
    initialEnvelope,
    interactionActive,
    onError,
    onReadyStateChange,
    onStatusChange,
    sessionKey
  }: {
    canEdit: boolean;
    applyCanonicalEnvelope?: (envelope: ReturnType<typeof createEmptyDocseraDocumentEnvelope>) => {
      kind: "applied" | "unchanged";
      nextEnvelope: ReturnType<typeof createEmptyDocseraDocumentEnvelope>;
    };
    initialEnvelope: ReturnType<typeof createEmptyDocseraDocumentEnvelope>;
    onError?: (failure: null) => void;
    onReadyStateChange?: (ready: boolean) => void;
    onStatusChange?: (state: {
      applyCanonicalEnvelope?: (envelope: ReturnType<typeof createEmptyDocseraDocumentEnvelope>) => {
        kind: "applied" | "unchanged";
        nextEnvelope: ReturnType<typeof createEmptyDocseraDocumentEnvelope>;
      };
      flush?: () => Promise<boolean>;
      getCanonicalEnvelope?: () => ReturnType<typeof createEmptyDocseraDocumentEnvelope> | null;
      isDirty: boolean;
      isSaving: boolean;
      status?: string;
    }) => void;
    interactionActive?: boolean;
    sessionKey: string;
  }) {
    const canonicalEnvelopeRef = useRef(initialEnvelope);
    const latestPropsRef = useRef({
      initialEnvelope,
      onError,
      onReadyStateChange,
      onStatusChange
    });

    latestPropsRef.current = {
      initialEnvelope,
      onError,
      onReadyStateChange,
      onStatusChange
    };

    const flush = async () => true;
    const getCanonicalEnvelope = () => canonicalEnvelopeRef.current;
    const applyCanonicalEnvelopeToMock = (envelope: ReturnType<typeof createEmptyDocseraDocumentEnvelope>) => {
      const currentEnvelope = canonicalEnvelopeRef.current;
      if (JSON.stringify(currentEnvelope) === JSON.stringify(envelope)) {
        return {
          kind: "unchanged" as const,
          nextEnvelope: currentEnvelope
        };
      }

      canonicalEnvelopeRef.current = envelope;
      return {
        kind: "applied" as const,
        nextEnvelope: envelope
      };
    };

    lastPageEditorHostProps = {
      applyCanonicalEnvelope: applyCanonicalEnvelopeToMock,
      flush,
      getCanonicalEnvelope,
      initialEnvelope,
      interactionActive,
      onError,
      onReadyStateChange,
      onStatusChange,
      sessionKey
    };

    useEffect(() => {
      canonicalEnvelopeRef.current = initialEnvelope;
      const currentProps = latestPropsRef.current;
      currentProps.onError?.(null);
      currentProps.onReadyStateChange?.(false);
      currentProps.onStatusChange?.({
        applyCanonicalEnvelope: applyCanonicalEnvelopeToMock,
        flush,
        getCanonicalEnvelope,
        isDirty: false,
        isSaving: false,
        status: "Saved"
      });
      if (mockEditorReady) {
        currentProps.onReadyStateChange?.(true);
      }
    }, [sessionKey]);

    return canEdit ? <div data-docsera-page-editor-host="true" /> : null;
  }
}));

vi.mock("../features/workspaces/WorkspaceMarkdownSourcePanel", () => ({
  WorkspaceMarkdownSourcePanel: function MockWorkspaceMarkdownSourcePanel(props: {
    onBodyChange?: (envelope: ReturnType<typeof createEmptyDocseraDocumentEnvelope>) => unknown;
    onInvalidChange?: (state: { errorMessage: string; isInvalid: boolean; isUnavailable: boolean; pageSysId: string }) => void;
    onTitleChange?: (title: string) => void;
    editable?: boolean;
    handoffRetryNonce?: number;
    pageSysId?: string;
    visible?: boolean;
  }) {
    const wrappedOnBodyChange = (envelope: ReturnType<typeof createEmptyDocseraDocumentEnvelope>) => {
      const result = props.onBodyChange?.(envelope) as { kind?: string } | null | undefined;
      if (result?.kind === "unavailable") {
        retainedUnavailableMarkdownEnvelope = envelope;
        props.onInvalidChange?.({
          errorMessage: "Markdown source is waiting for the visual editor to become available.",
          isInvalid: false,
          isUnavailable: true,
          pageSysId: props.pageSysId ?? ""
        });
      } else {
        retainedUnavailableMarkdownEnvelope = null;
        props.onInvalidChange?.({
          errorMessage: "",
          isInvalid: false,
          isUnavailable: false,
          pageSysId: props.pageSysId ?? ""
        });
      }
      return result;
    };

    lastMarkdownSourcePanelProps = {
      ...props,
      onBodyChange: wrappedOnBodyChange
    };

    useEffect(() => {
      const nextRetryNonce = props.handoffRetryNonce ?? 0;
      if (nextRetryNonce === lastMarkdownRetryNonce) {
        return;
      }

      lastMarkdownRetryNonce = nextRetryNonce;
      if (!retainedUnavailableMarkdownEnvelope) {
        return;
      }

      wrappedOnBodyChange(retainedUnavailableMarkdownEnvelope);
    }, [props.handoffRetryNonce]);

    return props.visible ? <div data-docsera-markdown-source-panel="true" /> : null;
  }
}));

vi.mock("../features/workspaces/DocseraHeader", async () => {
  const actual = await vi.importActual<typeof import("../features/workspaces/DocseraHeader")>(
    "../features/workspaces/DocseraHeader"
  );

  return {
    ...actual,
    DocseraHeader: function MockDocseraHeader(props: ComponentProps<typeof actual.DocseraHeader>) {
      lastDocseraHeaderProps = props;
      return <actual.DocseraHeader {...(props as ComponentProps<typeof actual.DocseraHeader>)} />;
    }
  };
});

function createRuntime(path = "/?workspace=product-docs&page=overview"): DocseraRuntimeContext {
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
  return {
    items,
    mode,
    workspaceSlug,
    workspaceSysId: workspaceSlug === "api-docs" ? "workspace-002" : "workspace-001",
    totalCount: items.length
  };
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
    getWorkspacePendingChanges: vi.fn(async () => createPendingChangesResult([])),
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

async function settleEditorHostReady() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });

  expect(screen.getByRole("button", { name: "Markdown" })).toBeEnabled();
}

async function settleInitialWorkspaceRender() {
  await act(async () => {
    vi.runOnlyPendingTimers();
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function waitForEditWorkspaceMode() {
  await act(async () => {
    await Promise.resolve();
  });
  const editButton = screen.getByRole("button", { name: "Edit" });
  if (editButton.getAttribute("aria-pressed") !== "true") {
    fireEvent.click(editButton);
  }

  await act(async () => {
    await Promise.resolve();
  });

  expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("aria-pressed", "true");
}

async function waitForEditorHostMounted() {
  await act(async () => {
    await Promise.resolve();
  });

  expect(document.querySelector("[data-docsera-page-editor-host='true']")).not.toBeNull();
}

describe("App editor interactions integration", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    lastMarkdownSourcePanelProps = null;
    lastPageEditorHostProps = null;
    lastDocseraHeaderProps = null;
    mockEditorReady = true;
    retainedUnavailableMarkdownEnvelope = null;
    lastMarkdownRetryNonce = 0;
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    window.localStorage.clear();
    window.sessionStorage.clear();
    lastMarkdownSourcePanelProps = null;
    lastPageEditorHostProps = null;
    lastDocseraHeaderProps = null;
    mockEditorReady = true;
    retainedUnavailableMarkdownEnvelope = null;
    lastMarkdownRetryNonce = 0;
  });

  it("requests workspace detail and edit pages once during direct edit bootstrap", async () => {
    const getWorkspace = vi.fn(async () => ({
      workspace: createWorkspace()
    }));
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", workspaceSlug, [
        createPageRecord({ draftTitle: "Overview Draft", publicationState: "published_with_unpublished_changes" })
      ])
    );

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { getWorkspace, listPages });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    expect(getWorkspace).toHaveBeenCalledTimes(1);
    expect(listPages).toHaveBeenCalledTimes(1);
    expect(listPages).toHaveBeenCalledWith({
      mode: "edit",
      workspaceSlug: "product-docs"
    });
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).not.toBeNull();
  });

  it("requests workspace detail and live pages once during direct live bootstrap", async () => {
    const getWorkspace = vi.fn(async () => ({
      workspace: createWorkspace()
    }));
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", workspaceSlug, [createPageRecord()])
    );

    renderApp("/?workspace=product-docs&page=overview", { getWorkspace, listPages });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(getWorkspace).toHaveBeenCalledTimes(1);
    expect(listPages).toHaveBeenCalledTimes(1);
    expect(listPages).toHaveBeenCalledWith({
      mode: "live",
      workspaceSlug: "product-docs"
    });
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).toBeNull();
  });

  it("enters edit mode through the header toggle and lazy-mounts the editor host", async () => {
    const publishedPage = createPageRecord();
    const draftPage = createPageRecord({
      draftTitle: "Overview Draft",
      publicationState: "published_with_unpublished_changes"
    });
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", workspaceSlug, [mode === "edit" ? draftPage : publishedPage])
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

    renderApp("/?workspace=product-docs&page=overview", {
      acquireWorkspaceEditLease,
      listPages
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(within(screen.getByRole("group", { name: "Workspace mode" })).getByRole("button", { name: "Edit" }));

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open settings for Overview Draft" })).toBeInTheDocument();
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).not.toBeNull();
  });

  it("debounces source title autosave and keeps the latest draft when an older save resolves", async () => {
    vi.useFakeTimers();
    const firstSave = createDeferred<PageSettingsSaveResult>();
    const secondSave = createDeferred<PageSettingsSaveResult>();
    const savePageSettings = vi
      .fn()
      .mockImplementationOnce(async () => firstSave.promise)
      .mockImplementationOnce(async () => secondSave.promise);

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      savePageSettings
    });
    await settleInitialWorkspaceRender();
    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitForEditWorkspaceMode();
    await waitForEditorHostMounted();
    await settleEditorHostReady();
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(lastDocseraHeaderProps?.authoringSurfaceLocked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Markdown" }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(lastMarkdownSourcePanelProps).toMatchObject({ visible: true });

    act(() => {
      lastMarkdownSourcePanelProps?.onTitleChange?.("Overview Draft A");
      lastMarkdownSourcePanelProps?.onTitleChange?.("Overview Draft AB");
    });

    expect(savePageSettings).toHaveBeenCalledTimes(0);

    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });

    expect(savePageSettings).toHaveBeenCalledTimes(1);

    act(() => {
      lastMarkdownSourcePanelProps?.onTitleChange?.("Overview Draft ABC");
    });
    expect(screen.getByRole("main", { name: "Overview Draft ABC" })).toBeInTheDocument();

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      vi.advanceTimersByTime(250);
      await Promise.resolve();
    });

    await act(async () => {
      firstSave.resolve({
        changeSetId: "change-set-001",
        changeSetRevision: 8,
        page: createPageRecord({
          draftTitle: "Overview Draft AB",
          publicationState: "published_with_unpublished_changes"
        }),
        state: "succeeded"
      });
      await Promise.resolve();
    });

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(savePageSettings).toHaveBeenCalledTimes(2);
    expect(screen.getByRole("main", { name: "Overview Draft ABC" })).toBeInTheDocument();

    await act(async () => {
      secondSave.resolve({
        changeSetId: "change-set-001",
        changeSetRevision: 9,
        page: createPageRecord({
          draftTitle: "Overview Draft ABC",
          publicationState: "published_with_unpublished_changes"
        }),
        state: "succeeded"
      });
      await Promise.resolve();
    });

    expect(screen.getByRole("main", { name: "Overview Draft ABC" })).toBeInTheDocument();
  });

  it("keeps the hidden visual host mounted but inactive in markdown and restores interaction when returning to visual", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitForEditWorkspaceMode();
    await waitForEditorHostMounted();
    await settleEditorHostReady();

    expect(lastPageEditorHostProps?.interactionActive).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Markdown" }));
    await waitFor(() => expect(lastMarkdownSourcePanelProps).toMatchObject({ visible: true }));
    await waitFor(() => expect(lastPageEditorHostProps?.interactionActive).toBe(false));
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Visual" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Markdown" })).toBeEnabled());
    await waitFor(() => expect(lastPageEditorHostProps?.interactionActive).toBe(true));
  });

  it("flushes a pending source title change before navigating away from the page", async () => {
    const titleSave = createDeferred<PageSettingsSaveResult>();
    const savePageSettings = vi.fn(async () => titleSave.promise);

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      savePageSettings
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitForEditWorkspaceMode();
    await waitForEditorHostMounted();
    await settleEditorHostReady();
    await waitFor(() => expect(lastDocseraHeaderProps?.authoringSurfaceLocked).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Markdown" }));
    await waitFor(() => expect(lastMarkdownSourcePanelProps).toMatchObject({ visible: true }));

    act(() => {
      lastMarkdownSourcePanelProps?.onTitleChange?.("Overview Draft Pending");
    });
    fireEvent.click(screen.getByRole("button", { name: "Live" }));

    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(1));
    expect(window.location.search).toContain("mode=edit");
    expect(screen.queryByRole("dialog", { name: "Unsaved changes" })).not.toBeInTheDocument();

    await act(async () => {
      titleSave.resolve({
        changeSetId: "change-set-001",
        changeSetRevision: 8,
        page: createPageRecord({
          draftTitle: "Overview Draft Pending",
          publicationState: "published_with_unpublished_changes"
        }),
        state: "succeeded"
      });
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "Live" })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.queryByRole("dialog", { name: "Unsaved changes" })).not.toBeInTheDocument();
  });

  it("flushes body and title work together before leaving the page", async () => {
    const bodyFlush = vi.fn(() => Promise.resolve(true));
    let resolveBodyFlush: ((value: boolean) => void) | null = null;
    bodyFlush.mockImplementation(
      () =>
        new Promise<boolean>((resolve) => {
          resolveBodyFlush = resolve;
        })
    );
    const titleSave = createDeferred<PageSettingsSaveResult>();
    const savePageSettings = vi.fn(async () => titleSave.promise);

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      savePageSettings
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitForEditWorkspaceMode();
    await waitForEditorHostMounted();
    await settleEditorHostReady();
    await waitFor(() => expect(lastDocseraHeaderProps?.authoringSurfaceLocked).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Markdown" }));
    await waitFor(() => expect(lastMarkdownSourcePanelProps).toMatchObject({ visible: true }));

    act(() => {
      lastPageEditorHostProps?.onStatusChange?.({
        flush: bodyFlush,
        isDirty: true,
        isSaving: false,
        status: "Unsaved"
      });
      lastMarkdownSourcePanelProps?.onTitleChange?.("Overview Draft Pending");
    });
    fireEvent.click(screen.getByRole("button", { name: "Live" }));

    expect(bodyFlush).toHaveBeenCalledTimes(1);
    expect(savePageSettings).toHaveBeenCalledTimes(0);

    await act(async () => {
      resolveBodyFlush?.(true);
      await Promise.resolve();
    });

    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(1));
    expect(window.location.search).toContain("mode=edit");

    await act(async () => {
      titleSave.resolve({
        changeSetId: "change-set-001",
        changeSetRevision: 8,
        page: createPageRecord({
          draftTitle: "Overview Draft Pending",
          publicationState: "published_with_unpublished_changes"
        }),
        state: "succeeded"
      });
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "Live" })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.queryByRole("dialog", { name: "Unsaved changes" })).not.toBeInTheDocument();
  });

  it("retries a retained unavailable markdown source snapshot when the editor handoff becomes available again", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitForEditWorkspaceMode();
    await waitForEditorHostMounted();
    await settleEditorHostReady();
    await waitFor(() => expect(lastDocseraHeaderProps?.authoringSurfaceLocked).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Markdown" }));
    await waitFor(() => expect(lastMarkdownSourcePanelProps).toMatchObject({ visible: true, editable: true }));

    const retainedEnvelope = createEmptyDocseraDocumentEnvelope();
    retainedEnvelope.document.content = [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Retained source" }]
      }
    ];

    act(() => {
      lastPageEditorHostProps?.onStatusChange?.({
        isDirty: false,
        isSaving: false,
        status: "Saved"
      });
      lastPageEditorHostProps?.onReadyStateChange?.(false);
    });

    const unavailableResult = lastMarkdownSourcePanelProps?.onBodyChange?.(retainedEnvelope);
    expect(unavailableResult).toMatchObject({ kind: "unavailable" });

    await waitFor(() => expect(screen.getByRole("button", { name: "Markdown" })).toBeDisabled());
    await waitFor(() => expect(lastMarkdownSourcePanelProps?.editable).toBe(false));

    act(() => {
      lastPageEditorHostProps?.onStatusChange?.({
        applyCanonicalEnvelope: lastPageEditorHostProps?.applyCanonicalEnvelope,
        flush: lastPageEditorHostProps?.flush,
        getCanonicalEnvelope: lastPageEditorHostProps?.getCanonicalEnvelope,
        isDirty: false,
        isSaving: false,
        status: "Saved"
      });
      lastPageEditorHostProps?.onReadyStateChange?.(true);
    });

    await waitFor(() => expect(lastMarkdownSourcePanelProps?.handoffRetryNonce ?? 0).toBeGreaterThan(0));
    await waitFor(() => expect(lastMarkdownSourcePanelProps?.editable).toBe(true));
    await waitFor(() => expect(screen.getByRole("button", { name: "Markdown" })).toBeEnabled());
    await waitFor(() => expect(lastDocseraHeaderProps?.authoringSurfaceLocked).toBe(false));
  });

  it("re-arms markdown source retry after the editor readiness lifecycle drops and returns", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitForEditWorkspaceMode();
    await waitForEditorHostMounted();
    await settleEditorHostReady();
    await waitFor(() => expect(lastDocseraHeaderProps?.authoringSurfaceLocked).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Markdown" }));
    await waitFor(() => expect(lastMarkdownSourcePanelProps).toMatchObject({ visible: true, editable: true }));

    const retainedEnvelope = createEmptyDocseraDocumentEnvelope();
    retainedEnvelope.document.content = [
      {
        type: "paragraph",
        content: [{ type: "text", text: "Lifecycle retained source" }]
      }
    ];

    act(() => {
      lastPageEditorHostProps?.onStatusChange?.({
        isDirty: false,
        isSaving: false,
        status: "Saved"
      });
      lastPageEditorHostProps?.onReadyStateChange?.(false);
    });

    const unavailableResult = lastMarkdownSourcePanelProps?.onBodyChange?.(retainedEnvelope);
    expect(unavailableResult).toMatchObject({ kind: "unavailable" });

    await waitFor(() => expect(screen.getByRole("button", { name: "Markdown" })).toBeDisabled());
    await waitFor(() => expect(lastMarkdownSourcePanelProps?.editable).toBe(false));

    act(() => {
      lastPageEditorHostProps?.onStatusChange?.({
        applyCanonicalEnvelope: lastPageEditorHostProps?.applyCanonicalEnvelope,
        flush: lastPageEditorHostProps?.flush,
        getCanonicalEnvelope: lastPageEditorHostProps?.getCanonicalEnvelope,
        isDirty: false,
        isSaving: false,
        status: "Saved"
      });
      lastPageEditorHostProps?.onReadyStateChange?.(true);
    });

    await waitFor(() => expect(lastMarkdownSourcePanelProps?.handoffRetryNonce ?? 0).toBeGreaterThan(0));
    const firstRetryNonce = lastMarkdownSourcePanelProps?.handoffRetryNonce ?? 0;

    act(() => {
      lastPageEditorHostProps?.onReadyStateChange?.(false);
      lastPageEditorHostProps?.onStatusChange?.({
        isDirty: false,
        isSaving: false,
        status: "Saved"
      });
    });

    const staleUnavailableResult = lastMarkdownSourcePanelProps?.onBodyChange?.(retainedEnvelope);
    expect(staleUnavailableResult).toMatchObject({ kind: "unavailable" });

    await waitFor(() => expect(lastMarkdownSourcePanelProps?.editable).toBe(false));
    expect(lastMarkdownSourcePanelProps?.handoffRetryNonce ?? 0).toBe(firstRetryNonce);

    act(() => {
      lastPageEditorHostProps?.onStatusChange?.({
        applyCanonicalEnvelope: lastPageEditorHostProps?.applyCanonicalEnvelope,
        flush: lastPageEditorHostProps?.flush,
        getCanonicalEnvelope: lastPageEditorHostProps?.getCanonicalEnvelope,
        isDirty: false,
        isSaving: false,
        status: "Saved"
      });
      lastPageEditorHostProps?.onReadyStateChange?.(true);
    });

    await waitFor(() => expect(lastMarkdownSourcePanelProps?.handoffRetryNonce ?? 0).toBeGreaterThan(firstRetryNonce));
    await waitFor(() => expect(lastMarkdownSourcePanelProps?.editable).toBe(true));
    await waitFor(() => expect(screen.getByRole("button", { name: "Markdown" })).toBeEnabled());
  });

  it("preserves the current slug draft when Markdown title projection updates the same page settings state", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitForEditWorkspaceMode();
    await waitForEditorHostMounted();
    await settleEditorHostReady();
    await waitFor(() => expect(lastDocseraHeaderProps?.authoringSurfaceLocked).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Markdown" }));
    await waitFor(() => expect(lastMarkdownSourcePanelProps).toMatchObject({ visible: true }));

    fireEvent.click(screen.getByRole("button", { name: /Open settings for Overview/ }));
    const pageSettings = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettings).getByRole("button", { name: "overview" }));

    const slugInput = screen.getByRole("textbox");
    fireEvent.change(slugInput, { target: { value: "overview-custom" } });
    expect(slugInput).toHaveValue("overview-custom");

    act(() => {
      lastMarkdownSourcePanelProps?.onTitleChange?.("Overview Draft Source");
    });

    await waitFor(() => expect(within(pageSettings).getByRole("button", { name: "Overview Draft Source" })).toBeInTheDocument());
    expect(screen.getByRole("textbox")).toHaveValue("overview-custom");
  });

  it("lets navigation proceed when the editor is still initializing, while keeping the surface toggle locked", async () => {
    mockEditorReady = false;

    renderApp("/?workspace=product-docs&mode=edit&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitForEditWorkspaceMode();
    await waitForEditorHostMounted();
    await waitFor(() => expect(lastDocseraHeaderProps?.authoringSurfaceLocked).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "Live" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Live" })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.queryByRole("dialog", { name: "Unsaved changes" })).not.toBeInTheDocument();
  });

  it("keeps saved pending changes rows from locking the surface toggle", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      getWorkspacePendingChanges: vi.fn(async () =>
        createPendingChangesResult([
          {
            attribution: {
              accessibleLabel: "Pending change for Overview",
              displayName: "Jacob",
              fullDisplayName: "Jacob"
            },
            category: "Modified",
            firstPendingSequence: 1,
            lastChangedOn: "2026-08-29T00:00:00Z",
            navigable: true,
            pageSysId: "page-001",
            title: "Overview"
          }
        ] as never)
      )
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitForEditWorkspaceMode();
    await waitForEditorHostMounted();
    await settleEditorHostReady();
    await waitFor(() => expect(lastDocseraHeaderProps?.authoringSurfaceLocked).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Markdown" }));
    await waitFor(() => expect(lastMarkdownSourcePanelProps).toMatchObject({ visible: true }));
  });

  it("blocks silent navigation when the source body handoff is unavailable", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitForEditWorkspaceMode();
    await waitForEditorHostMounted();
    await settleEditorHostReady();
    await waitFor(() => expect(lastDocseraHeaderProps?.authoringSurfaceLocked).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Markdown" }));
    await waitFor(() => expect(lastMarkdownSourcePanelProps).toMatchObject({ visible: true }));

    const handoff = lastMarkdownSourcePanelProps?.onBodyChange?.(createEmptyDocseraDocumentEnvelope());
    expect(handoff).toMatchObject({ kind: "unchanged" });
    act(() => {
      lastMarkdownSourcePanelProps?.onInvalidChange?.({
        errorMessage: "Markdown source is waiting for the visual editor to become available.",
        isInvalid: false,
        isUnavailable: true,
        pageSysId: "page-001"
      });
    });

    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    expect(screen.queryByRole("dialog", { name: "Unsaved changes" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("aria-pressed", "true"));
  });

  it("blocks navigation while markdown source is invalid until the draft is explicitly discarded", async () => {
    const pages = [
      createPageRecord(),
      createPageRecord({
        sysId: "page-002",
        draftTitle: "Reference",
        draftSlug: "reference",
        draftSlugNormalized: "reference",
        publishedTitle: "Reference",
        publishedSlug: "reference",
        publishedSlugNormalized: "reference"
      })
    ];
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", workspaceSlug, pages)
    );

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { listPages });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitForEditWorkspaceMode();
    await waitForEditorHostMounted();
    await settleEditorHostReady();
    fireEvent.click(screen.getByRole("button", { name: "Markdown" }));
    await waitFor(() => expect(lastMarkdownSourcePanelProps).toMatchObject({ visible: true }));

    act(() => {
      lastMarkdownSourcePanelProps?.onInvalidChange?.({
        errorMessage: "Markdown source contains invalid content.",
        isInvalid: true,
        isUnavailable: false,
        pageSysId: "page-001"
      });
    });

    expect(screen.getByRole("button", { name: "Markdown" })).toBeDisabled();
    fireEvent.click(within(screen.getByRole("navigation", { name: "Page tree" })).getByRole("button", { name: "Reference" }));

    const discardDialog = await screen.findByRole("dialog", { name: "Unsaved changes" });
    expect(window.location.search).toContain("page=overview");

    fireEvent.click(within(discardDialog).getByRole("button", { name: "Discard changes" }));

    await waitFor(() => expect(screen.getByRole("main", { name: "Reference" })).toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Markdown" })).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(lastMarkdownSourcePanelProps).toMatchObject({ visible: true }));
  });

});

