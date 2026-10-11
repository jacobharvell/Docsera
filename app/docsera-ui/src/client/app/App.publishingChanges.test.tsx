import "@testing-library/jest-dom/vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useEffect, useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import {
  createDeferred,
  createBreadcrumbPages,
  createPageListResult,
  createPageRecord,
  createPendingChangesResult,
  expectWorkspaceSearch,
  heldLease,
  renderApp,
} from "./appTestSupport";
import { createEmptyDocseraDocumentEnvelope } from "../../shared/editor/document";
import type {
  PageBodySaveResult,
  ServiceNowClient,
  WorkspaceMode,
  WorkspacePageRecord,
  WorkspacePendingChangesResult
} from "../shared/types/docsera";

let deferHostReady = false;
let hostReadyResolvers: Array<() => void> = [];
let lastMarkdownSourcePanelProps: {
  onInvalidChange?: (state: { errorMessage: string; isInvalid: boolean; isUnavailable: boolean; pageSysId: string }) => void;
  visible?: boolean;
} | null = null;
let mockEditorHostMounts: Array<{ pageSysId: string; sessionKey: string }> = [];
let mockEditorHostHandles = new Map<string, {
  applyCanonicalEnvelope?: (envelope: ReturnType<typeof createEmptyDocseraDocumentEnvelope>) => {
    kind: "applied" | "unchanged";
    nextEnvelope: ReturnType<typeof createEmptyDocseraDocumentEnvelope>;
  };
  flush?: () => Promise<boolean>;
  getCanonicalEnvelope?: () => ReturnType<typeof createEmptyDocseraDocumentEnvelope> | null;
  onOutlineChange?: (outline: Array<{ depth: number; id: string; text: string }>) => void;
  onSaveDraft?: (input: {
    draftContentJson: ReturnType<typeof createEmptyDocseraDocumentEnvelope>;
    expectedRevision: number;
    pageSysId: string;
    readLatestDraftContentJson?: () => ReturnType<typeof createEmptyDocseraDocumentEnvelope> | null;
  }) => Promise<PageBodySaveResult>;
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
  pageSysId: string;
  sessionKey: string;
}>();

function resolveDeferredHostReady() {
  const resolvers = [...hostReadyResolvers];
  hostReadyResolvers = [];
  deferHostReady = false;
  resolvers.forEach((resolve) => resolve());
}

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

function currentPageMockEditorHost(pageSysId = "page-001") {
  const match = [...mockEditorHostMounts]
    .reverse()
    .find((mount) => mount.pageSysId === pageSysId && mount.sessionKey);
  if (!match) {
    throw new Error(`Expected a mounted mock editor host for page ${pageSysId}.`);
  }

  const handle = mockEditorHostHandles.get(match.sessionKey);
  if (!handle) {
    throw new Error(`Expected mock editor host handle for session ${match.sessionKey}.`);
  }

  return handle;
}

async function openPageSettingsFor(pageTitle: string) {
  fireEvent.click(await screen.findByRole("button", { name: `Page actions for ${pageTitle}` }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Page settings" }));
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
  }) {
    const emittedInitialSavedStatusRef = useRef("");

    useEffect(() => {
      const flush = async () => true;
      const getCanonicalEnvelope = () => createEmptyDocseraDocumentEnvelope();
      const applyCanonicalEnvelope = (envelope: ReturnType<typeof createEmptyDocseraDocumentEnvelope>) => ({
        kind: "applied" as const,
        nextEnvelope: envelope
      });
      const normalizedPageSysId = pageSysId ?? "";
      const normalizedSessionKey = sessionKey ?? "";
      mockEditorHostMounts.push({ pageSysId: normalizedPageSysId, sessionKey: normalizedSessionKey });
      mockEditorHostHandles.set(normalizedSessionKey, {
        applyCanonicalEnvelope,
        flush,
        getCanonicalEnvelope,
        onOutlineChange,
        onSaveDraft,
        onStatusChange,
        pageSysId: normalizedPageSysId,
        sessionKey: normalizedSessionKey
      });
      onError?.(null);
      if (emittedInitialSavedStatusRef.current !== normalizedSessionKey) {
        emittedInitialSavedStatusRef.current = normalizedSessionKey;
        onStatusChange?.({
          applyCanonicalEnvelope,
          flush,
          getCanonicalEnvelope,
          isDirty: false,
          isSaving: false,
          status: "Saved"
        });
      }
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

vi.mock("../features/workspaces/WorkspaceMarkdownSourcePanel", () => ({
  WorkspaceMarkdownSourcePanel: function MockWorkspaceMarkdownSourcePanel(props: {
    onInvalidChange?: (state: { errorMessage: string; isInvalid: boolean; isUnavailable: boolean; pageSysId: string }) => void;
    visible?: boolean;
  }) {
    lastMarkdownSourcePanelProps = props;
    return props.visible ? <div data-docsera-markdown-source-panel="true" /> : null;
  }
}));

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  deferHostReady = false;
  hostReadyResolvers = [];
  lastMarkdownSourcePanelProps = null;
  mockEditorHostMounts = [];
  mockEditorHostHandles = new Map();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.name = "";
});

describe("App publishing changes integration", () => {
  async function enterMarkdownSourceForPublishingTest() {
    expect(await screen.findByRole("heading", { name: /Overview|New Guide/ })).toBeInTheDocument();
    await waitFor(() => expect(currentPageMockEditorHost().sessionKey).toBeTruthy());
    const markdownButton = await screen.findByRole("button", { name: "Markdown" });
    await waitFor(() => expect(markdownButton).toBeEnabled());
    fireEvent.click(markdownButton);
    await waitFor(() => expect(lastMarkdownSourcePanelProps).toMatchObject({ visible: true }));
  }

  function markCurrentSourceInvalid(state: Partial<{ errorMessage: string; isInvalid: boolean; isUnavailable: boolean }> = {}) {
    act(() => {
      lastMarkdownSourcePanelProps?.onInvalidChange?.({
        errorMessage: state.errorMessage ?? "Markdown source contains invalid content.",
        isInvalid: state.isInvalid ?? true,
        isUnavailable: state.isUnavailable ?? false,
        pageSysId: "page-001"
      });
    });
  }

  function emitCurrentEditorStatus(state: { isDirty: boolean; isSaving: boolean; status: string }) {
    const host = currentPageMockEditorHost();
    host.onStatusChange?.({
      applyCanonicalEnvelope: host.applyCanonicalEnvelope,
      flush: host.flush,
      getCanonicalEnvelope: host.getCanonicalEnvelope,
      ...state
    });
  }

  async function deleteFinalPageForEmptyWorkspaceCommandTest() {
    const initialPages = [
      createPageRecord({
        draftTitle: "Only Page",
        draftSlug: "only-page",
        draftSlugNormalized: "only-page",
        publicationState: "published_with_unpublished_changes"
      })
    ];
    const removedPendingChanges = createPendingChangesResult([
      {
        attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
        category: "Removed",
        firstPendingSequence: 1,
        lastChangedOn: "2026-09-14 00:00:00",
        navigable: false,
        pageSysId: "page-001",
        title: "Only Page"
      }
    ]);
    let editListCount = 0;
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) => {
      if (mode !== "edit") {
        return createPageListResult("live", initialPages);
      }

      editListCount += 1;
      return createPageListResult("edit", editListCount === 1 ? initialPages : []);
    });
    const deletePage = vi.fn(async () => ({
      changeSetId: "change-set-001",
      changeSetRevision: 8,
      nextPageSysId: "",
      state: "succeeded" as const
    }));
    const getWorkspacePendingChanges = vi
      .fn()
      .mockResolvedValueOnce(createPendingChangesResult([]))
      .mockResolvedValue(removedPendingChanges);

    return {
      deletePage,
      getWorkspacePendingChanges,
      listPages,
      removedPendingChanges
    };
  }

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

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      getWorkspacePendingChanges,
      savePageSettings
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitFor(() => expect(getWorkspacePendingChanges).toHaveBeenCalledTimes(1));
    let publish = screen.getByRole("button", { name: "Open Changes Center" });
    expect(publish).toBeEnabled();
    expect(publish).toHaveClass("docsera-header__publish-button--active");

    pendingChangesResponse = pendingRefresh.promise;
    await openPageSettingsFor("Overview");
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview" }));
    fireEvent.change(within(pageSettingsPanel).getByDisplayValue("Overview"), { target: { value: "Overview Updated" } });
    fireEvent.blur(within(pageSettingsPanel).getByDisplayValue("Overview Updated"));
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
    await openPageSettingsFor("Overview Updated");
    const updatedSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(updatedSettingsPanel).getByRole("button", { name: "Overview Updated" }));
    fireEvent.change(within(updatedSettingsPanel).getByDisplayValue("Overview Updated"), { target: { value: "Overview Clean" } });
    fireEvent.blur(within(updatedSettingsPanel).getByDisplayValue("Overview Clean"));
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

    const firstView = renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
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
    const newPageButton = screen.getByRole("button", { name: "New page" });
    expect(newPageButton).toBeDisabled();
    fireEvent.click(newPageButton);
    expect(screen.queryByRole("textbox", { name: "New page title" })).toBeNull();
    expect(screen.queryByText("Publishing is in progress. Authoring actions are temporarily unavailable.")).not.toBeInTheDocument();
    expect(screen.queryByText("Workspace authoring is locked while another command is in progress.")).not.toBeInTheDocument();
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

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
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

  it.each([
    ["invalid source", () => markCurrentSourceInvalid()],
    ["unavailable source", () => markCurrentSourceInvalid({
      errorMessage: "Markdown source is waiting for the visual editor to become available.",
      isInvalid: false,
      isUnavailable: true
    })],
    ["Unsaved editor status", () => emitCurrentEditorStatus({ isDirty: true, isSaving: false, status: "Unsaved" })],
    ["Saving... editor status", () => emitCurrentEditorStatus({ isDirty: false, isSaving: true, status: "Saving…" })],
    ["Changes not saved editor status", () => emitCurrentEditorStatus({ isDirty: true, isSaving: false, status: "Changes not saved" })]
  ])("blocks workspace commands while the current page authoring state is %s", async (_label, markUnsettled) => {
    const publishWorkspace = vi.fn(async () => {
      throw new Error("publishWorkspace should not run while current-page authoring is unsettled.");
    });
    const discardAllWorkspace = vi.fn(async () => {
      throw new Error("discardAllWorkspace should not run while current-page authoring is unsettled.");
    });
    const discardPageWorkspace = vi.fn(async () => {
      throw new Error("discardPageWorkspace should not run while current-page authoring is unsettled.");
    });

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      discardAllWorkspace,
      discardPageWorkspace,
      getWorkspacePendingChanges: vi.fn(async () => createPendingChangesResult([
        {
          attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
          category: "Modified",
          firstPendingSequence: 1,
          lastChangedOn: "2026-08-31 00:00:00",
          navigable: true,
          pageSysId: "page-001",
          title: "Overview"
        }
      ])),
      publishWorkspace
    });

    await enterMarkdownSourceForPublishingTest();
    await waitFor(() => expect(currentPageMockEditorHost().sessionKey).toBeTruthy());

    act(() => {
      markUnsettled();
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    const dialog = await screen.findByRole("dialog", { name: "Changes Center" });
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Publish" })).toBeDisabled());
    expect(within(dialog).getByRole("button", { name: "Discard all" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Undo changes to Overview" })).toBeDisabled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard all" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Undo changes to Overview" }));

    expect(publishWorkspace).not.toHaveBeenCalled();
    expect(discardAllWorkspace).not.toHaveBeenCalled();
    expect(discardPageWorkspace).not.toHaveBeenCalled();
  }, 15000);

  it("blocks workspace commands while pending changes are loaded but the edit page list is unresolved", async () => {
    const editPageList = createDeferred<ReturnType<typeof createPageListResult>>();
    const pendingChanges = createPendingChangesResult([
      {
        attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
        category: "Removed",
        firstPendingSequence: 1,
        lastChangedOn: "2026-09-14 00:00:00",
        navigable: false,
        pageSysId: "page-001",
        title: "Only Page"
      }
    ]);
    const publishWorkspace = vi.fn(async () => {
      throw new Error("publishWorkspace should not run before the edit page list resolves.");
    });
    const discardAllWorkspace = vi.fn(async () => {
      throw new Error("discardAllWorkspace should not run before the edit page list resolves.");
    });
    const listPages = vi.fn(({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) => {
      if (mode === "edit") {
        return editPageList.promise;
      }

      return Promise.resolve(createPageListResult("live", []));
    });

    renderApp(App, "/?workspace=product-docs&mode=edit", {
      discardAllWorkspace,
      getWorkspacePendingChanges: vi.fn(async () => pendingChanges),
      listPages,
      publishWorkspace
    });

    await waitFor(() => expect(listPages).toHaveBeenCalledWith(expect.objectContaining({ mode: "edit" })));
    await waitFor(() => expect(screen.getByRole("button", { name: "Open Changes Center" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    const dialog = await screen.findByRole("dialog", { name: "Changes Center" });
    expect(within(dialog).getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Discard all" })).toBeDisabled();
    expect(within(dialog).getByText("The workspace page list is still loading.")).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard all" }));
    expect(publishWorkspace).not.toHaveBeenCalled();
    expect(discardAllWorkspace).not.toHaveBeenCalled();

    await act(async () => {
      editPageList.resolve(createPageListResult("edit", []));
      await editPageList.promise;
    });

    await waitFor(() => expect(within(dialog).getByRole("button", { name: "Publish" })).toBeEnabled());
    expect(within(dialog).getByRole("button", { name: "Discard all" })).toBeEnabled();
    expect(within(dialog).queryByText("The workspace page list is still loading.")).toBeNull();
  }, 15000);

  it("keeps settled saved source from blocking publish while persisted draft changes remain pending", async () => {
    const publishWorkspace = vi.fn(async () => ({
      changeSetId: "change-set-002",
      changeSetRevision: 8,
      pages: [
        createPageRecord({
          publicationState: "published",
          publishedTitle: "Overview"
        })
      ],
      pendingChanges: createPendingChangesResult([]),
      publishedSnapshotSetId: "workspace-001-snapshot",
      state: "succeeded" as const,
      workspaceStateRevision: 4
    }));

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      getWorkspacePendingChanges: vi.fn(async () => createPendingChangesResult([
        {
          attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
          category: "Modified",
          firstPendingSequence: 1,
          lastChangedOn: "2026-08-31 00:00:00",
          navigable: true,
          pageSysId: "page-001",
          title: "Overview"
        }
      ])),
      publishWorkspace
    });

    await enterMarkdownSourceForPublishingTest();

    act(() => {
      markCurrentSourceInvalid({ errorMessage: "", isInvalid: false, isUnavailable: false });
      emitCurrentEditorStatus({ isDirty: false, isSaving: false, status: "Saved" });
    });

    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    const dialog = await screen.findByRole("dialog", { name: "Changes Center" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(publishWorkspace).toHaveBeenCalledTimes(1));
  }, 15000);

  it("publishes pending workspace deletion after deleting the final page without waiting for an editor", async () => {
    const setup = await deleteFinalPageForEmptyWorkspaceCommandTest();
    const publishWorkspace = vi.fn(async () => ({
      changeSetId: "change-set-002",
      changeSetRevision: 0,
      pages: [],
      pendingChanges: createPendingChangesResult([]),
      publishedSnapshotSetId: "workspace-001-snapshot",
      state: "succeeded" as const,
      workspaceStateRevision: 5
    }));

    renderApp(App, "/?workspace=product-docs&mode=edit&page=only-page", {
      deletePage: setup.deletePage,
      getWorkspacePendingChanges: setup.getWorkspacePendingChanges,
      listPages: setup.listPages,
      publishWorkspace
    });

    expect(await screen.findByRole("heading", { name: "Only Page" })).toBeInTheDocument();
    await openPageSettingsFor("Only Page");
    fireEvent.click(screen.getByRole("button", { name: "Delete page" }));
    const deleteDialog = await screen.findByRole("dialog", { name: "Confirm deletion" });
    fireEvent.click(within(deleteDialog).getByRole("button", { name: "Delete page" }));

    await waitFor(() => expect(setup.deletePage).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("heading", { name: "No pages yet" })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Only Page" })).not.toBeInTheDocument());
    await waitFor(() => expect(setup.getWorkspacePendingChanges.mock.calls.length).toBeGreaterThanOrEqual(2));

    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    const dialog = await screen.findByRole("dialog", { name: "Changes Center" });
    expect(within(dialog).getByText("Removed")).toBeInTheDocument();
    expect(within(dialog).queryByText("The visual editor is still getting ready.")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Publish" }));

    await waitFor(() => expect(publishWorkspace).toHaveBeenCalledTimes(1));
    expect(publishWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      workspaceAuthority: expect.objectContaining({ changeSetId: "change-set-001", changeSetRevision: 8 }),
      workspaceLeaseToken: "workspace-lease-token",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    }));
  }, 15000);

  it("discards all pending workspace deletion after deleting the final page without waiting for an editor", async () => {
    const setup = await deleteFinalPageForEmptyWorkspaceCommandTest();
    const discardAllWorkspace = vi.fn(async () => ({
      changeSetId: "change-set-002",
      changeSetRevision: 0,
      pages: [],
      pendingChanges: createPendingChangesResult([]),
      state: "succeeded" as const,
      workspaceStateRevision: 5
    }));

    renderApp(App, "/?workspace=product-docs&mode=edit&page=only-page", {
      deletePage: setup.deletePage,
      discardAllWorkspace,
      getWorkspacePendingChanges: setup.getWorkspacePendingChanges,
      listPages: setup.listPages
    });

    expect(await screen.findByRole("heading", { name: "Only Page" })).toBeInTheDocument();
    await openPageSettingsFor("Only Page");
    fireEvent.click(screen.getByRole("button", { name: "Delete page" }));
    const deleteDialog = await screen.findByRole("dialog", { name: "Confirm deletion" });
    fireEvent.click(within(deleteDialog).getByRole("button", { name: "Delete page" }));

    await waitFor(() => expect(setup.deletePage).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("heading", { name: "No pages yet" })).toBeInTheDocument();
    await waitFor(() => expect(setup.getWorkspacePendingChanges.mock.calls.length).toBeGreaterThanOrEqual(2));

    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    const dialog = await screen.findByRole("dialog", { name: "Changes Center" });
    expect(within(dialog).getByText("Removed")).toBeInTheDocument();
    expect(within(dialog).queryByText("The visual editor is still getting ready.")).toBeNull();
    fireEvent.click(within(dialog).getByRole("button", { name: "Discard all" }));
    const discardModal = await screen.findByRole("dialog", { name: "Discard all changes" });
    fireEvent.click(within(discardModal).getByRole("button", { name: "Discard all" }));

    await waitFor(() => expect(discardAllWorkspace).toHaveBeenCalledTimes(1));
    expect(discardAllWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      workspaceAuthority: expect.objectContaining({ changeSetId: "change-set-001", changeSetRevision: 8 }),
      workspaceLeaseToken: "workspace-lease-token",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    }));
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

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      getWorkspacePendingChanges: vi.fn(async () => createPendingChangesResult([{
        attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
        category: "Modified",
        firstPendingSequence: 1,
        lastChangedOn: "2026-07-21 10:00:00",
        navigable: true,
        pageSysId: "page-001",
        title: "Overview"
      }])) as ServiceNowClient["getWorkspacePendingChanges"],
      publishWorkspace: vi.fn(async () => ({
        changeSetId: "change-set-001-published",
        changeSetRevision: 8,
        pages: [createPageRecord()],
        pendingChanges: createPendingChangesResult([]),
        publishedSnapshotSetId: "workspace-001-snapshot",
        state: "succeeded" as const,
        workspaceStateRevision: 5
      })) as ServiceNowClient["publishWorkspace"]
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
    expect(secondToastTimerId).not.toBe(firstToastTimerId);

    fireEvent.click(toast!.querySelector("button") as HTMLElement);
    await settle();
    expect(readToast()).toBeNull();
    expect(clearTimeoutSpy).toHaveBeenCalledWith(secondToastTimerId);
    expect(setTimeoutSpy).toHaveBeenCalled();
  });

  it("clears the publish success toast when the active workspace changes", async () => {
    window.localStorage.setItem("docsera.recent-workspaces:__local__", JSON.stringify(["product-docs", "api-docs"]));

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
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

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    fireEvent.click(screen.getByRole("button", { name: "Publish" }));
    expect(await screen.findByText("Workspace changes published.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "API Docs" }));

    await waitFor(() => expect(screen.getByRole("button", { name: /Workspace switcher: API Docs/i })).toBeInTheDocument());
    expect(document.querySelector(".docsera-header__publish-toast")).toBeNull();
  }, 15000);

  it("discards all pending changes, installs the returned authority, and falls back from a discarded added page", async () => {
    const settle = async () => {
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
    };
    const editPages = [
      createPageRecord({
        draftTitle: "Overview Draft",
        publicationState: "published_with_unpublished_changes"
      }),
      createPageRecord({
        sysId: "page-002",
        draftTitle: "New Guide",
        draftSlug: "new-guide",
        draftSlugNormalized: "new-guide",
        publishedTitle: null,
        publishedSlug: null,
        publishedSlugNormalized: null,
        publicationState: "draft"
      })
    ];
    const restoredPages = [
      createPageRecord({
        draftTitle: "Overview",
        publicationState: "published"
      })
    ];
    const discardAllWorkspace = vi.fn(async () => ({
      changeSetId: "change-set-successor",
      changeSetRevision: 0,
      pages: restoredPages,
      pendingChanges: {
        affectedPageCount: 0,
        changeSetId: "change-set-successor",
        changeSetRevision: 0,
        rows: [],
        state: "succeeded" as const,
        workspaceSysId: "workspace-001"
      },
      state: "succeeded" as const,
      workspaceStateRevision: 5
    }));

    renderApp(App, "/?workspace=product-docs&mode=edit&page=new-guide", {
      discardAllWorkspace,
      getWorkspacePendingChanges: vi.fn(async () => createPendingChangesResult([
        {
          attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
          category: "Added",
          firstPendingSequence: 2,
          lastChangedOn: "2026-07-21 10:05:00",
          navigable: true,
          pageSysId: "page-002",
          title: "New Guide"
        },
        {
          attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
          category: "Modified",
          firstPendingSequence: 1,
          lastChangedOn: "2026-07-21 10:00:00",
          navigable: true,
          pageSysId: "page-001",
          title: "Overview"
        }
      ])),
      listPages: vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
        createPageListResult(mode === "edit" ? "edit" : "live", mode === "edit" ? editPages : restoredPages)
      )
    });

    expect(await screen.findByRole("heading", { name: "New Guide" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    fireEvent.click(within(screen.getByRole("dialog", { name: "Changes Center" })).getByRole("button", { name: "Discard all" }));
    const discardModal = await screen.findByRole("dialog", { name: "Discard all changes" });
    expect(discardModal.closest(".docsera-header")).toBeNull();
    expect(discardModal.closest(".docsera-modal")).toHaveClass("docsera-modal--top-biased");
    fireEvent.click(within(discardModal).getByRole("button", { name: "Discard all" }));

    await settle();
    expect(discardAllWorkspace).toHaveBeenCalledTimes(1);
    expect(discardAllWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      commandId: expect.any(String),
      workspaceAuthority: expect.objectContaining({ changeSetId: "change-set-001", changeSetRevision: 7 }),
      workspaceLeaseToken: "workspace-lease-token",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    }));
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Open Changes Center" })).toBeEnabled());
    expect(screen.queryByRole("dialog", { name: "Discard all changes" })).toBeNull();
    expect(screen.queryByRole("dialog", { name: "Changes Center" })).toBeNull();
    expect(screen.queryByText("Workspace changes published.")).toBeNull();
    expect(document.querySelector(".docsera-header__publish-toast")).toBeNull();
  }, 15000);

  it("rebinds the selected editor, Page Settings, and route to the authoritative undo result without pushing history", async () => {
    const initialPages = [
      createPageRecord({
        sysId: "page-001",
        draftRevision: 3,
        draftSlug: "overview-draft",
        draftSlugNormalized: "overview-draft",
        draftTitle: "Overview Draft",
        publicationState: "published_with_unpublished_changes"
      }),
      createPageRecord({
        sysId: "page-002",
        parentPageSysId: "page-001",
        siblingOrder: 2,
        draftRevision: 1,
        draftSlug: "api",
        draftSlugNormalized: "api",
        draftTitle: "API Draft",
        publishedSlug: "api",
        publishedSlugNormalized: "api",
        publishedTitle: "API",
        publicationState: "published_with_unpublished_changes"
      })
    ];
    const restoredPages = [
      createPageRecord({
        sysId: "page-001",
        draftRevision: 4,
        draftSlug: "overview-restored",
        draftSlugNormalized: "overview-restored",
        draftTitle: "Overview Restored",
        publicationState: "published"
      }),
      initialPages[1]
    ];
    const initialPendingChanges = createPendingChangesResult([
      {
        attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
        category: "Modified",
        firstPendingSequence: 1,
        lastChangedOn: "2026-07-27 09:00:00",
        navigable: true,
        pageSysId: "page-001",
        title: "Overview Draft"
      },
      {
        attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
        category: "Modified",
        firstPendingSequence: 2,
        lastChangedOn: "2026-07-27 09:05:00",
        navigable: true,
        pageSysId: "page-002",
        title: "API Draft"
      }
    ]);
    const discardDeferred = createDeferred<{
      changeSetId: string;
      changeSetRevision: number;
      discardedPageSysId: string;
      pages: WorkspacePageRecord[];
      pendingChanges: Extract<WorkspacePendingChangesResult, { state: "succeeded" }>;
      state: "succeeded";
      workspaceStateRevision: number;
    }>();
    const discardPageWorkspace = vi.fn(() => discardDeferred.promise);
    const savePageBody = vi.fn(async (): Promise<PageBodySaveResult> => ({
      errorMessage: "stale session should not save",
      state: "failed"
    }));
    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview-draft", {
      discardPageWorkspace,
      getWorkspacePendingChanges: vi.fn(async () => initialPendingChanges),
      listPages: vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
        createPageListResult(mode === "edit" ? "edit" : "live", mode === "edit" ? initialPages : [createPageRecord()])
      ),
      savePageBody
    });

    expect(await screen.findByRole("heading", { name: "Overview Draft" })).toBeInTheDocument();
    await openPageSettingsFor("Overview Draft");
    expect(await screen.findByRole("heading", { name: "Page Settings" })).toBeInTheDocument();
    const initialEditorHost = latestMockEditorHost();
    const supersededSave = initialEditorHost.onSaveDraft;
    expect(supersededSave).toBeDefined();
    const initialSessionKey = initialEditorHost.sessionKey;
    const replaceSpy = vi.spyOn(window.history, "replaceState");
    const pushSpy = vi.spyOn(window.history, "pushState");
    const replaceCallsBeforeUndo = replaceSpy.mock.calls.length;
    const pushCallsBeforeUndo = pushSpy.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo changes to Overview Draft" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo changes" }));

    await waitFor(() => expect(discardPageWorkspace).toHaveBeenCalledTimes(1));
    expect(discardPageWorkspace).toHaveBeenCalledWith(expect.objectContaining({
      pageSysId: "page-001",
      workspaceAuthority: expect.objectContaining({ changeSetId: "change-set-001", changeSetRevision: 7 }),
      workspaceLeaseToken: "workspace-lease-token",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    }));

    await act(async () => {
      discardDeferred.resolve({
        changeSetId: "change-set-001",
        changeSetRevision: 8,
        discardedPageSysId: "page-001",
        pages: restoredPages,
        pendingChanges: {
          ...createPendingChangesResult([initialPendingChanges.rows[1]!]),
          changeSetRevision: 8
        },
        state: "succeeded",
        workspaceStateRevision: 5
      });
      await Promise.resolve();
    });

    expect(await screen.findByRole("heading", { name: "Overview Restored" })).toBeInTheDocument();
    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview-restored" });
    expect(mockEditorHostMounts[mockEditorHostMounts.length - 1]?.sessionKey).not.toBe(initialSessionKey);
    const pageSettings = screen.getByRole("complementary", { name: "Page Settings" });
    expect(within(pageSettings).getByRole("heading", { name: "Page Settings" })).toBeInTheDocument();
    expect(within(pageSettings).getByRole("button", { name: "Overview Restored" })).toBeInTheDocument();
    expect(within(pageSettings).getByRole("button", { name: "overview-restored" })).toBeInTheDocument();
    expect(replaceSpy.mock.calls.length).toBeGreaterThan(replaceCallsBeforeUndo);
    expect(pushSpy.mock.calls.length).toBe(pushCallsBeforeUndo);

    await act(async () => {
      const staleResult = await supersededSave?.({
        draftContentJson: createEmptyDocseraDocumentEnvelope(),
        expectedRevision: 3,
        pageSysId: "page-001"
      });
      expect(staleResult).toEqual({
        errorMessage: "The editing session changed.",
        state: "failed"
      });
    });
    expect(savePageBody).not.toHaveBeenCalled();
  }, 15000);

  it("does not remount the selected editor when individual undo targets another page", async () => {
    const editPages = createBreadcrumbPages().map((page) =>
      page.sysId === "page-root"
        ? createPageRecord({ ...page, draftRevision: 2, publicationState: "published_with_unpublished_changes" })
        : createPageRecord({ ...page, draftRevision: 1, publicationState: "published_with_unpublished_changes" })
    );
    const restoredPages = [
      editPages[0]!,
      createPageRecord({
        ...editPages[1]!,
        draftRevision: 2,
        draftTitle: "Child Restored",
        publicationState: "published"
      })
    ];
    const discardPageWorkspace = vi.fn(async () => ({
      changeSetId: "change-set-001",
      changeSetRevision: 8,
      discardedPageSysId: "page-child",
      pages: restoredPages,
      pendingChanges: {
        ...createPendingChangesResult([]),
        changeSetRevision: 8
      },
      state: "succeeded" as const,
      workspaceStateRevision: 5
    }));

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      discardPageWorkspace,
      getWorkspacePendingChanges: vi.fn(async () => createPendingChangesResult([
        {
          attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
          category: "Modified",
          firstPendingSequence: 1,
          lastChangedOn: "2026-07-27 09:05:00",
          navigable: true,
          pageSysId: "page-child",
          title: "Child Draft"
        }
      ])),
      listPages: vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
        createPageListResult(mode === "edit" ? "edit" : "live", mode === "edit" ? editPages : [editPages[0]!])
      )
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    const initialSessionKey = latestMockEditorHost().sessionKey;

    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo changes to Child Draft" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo changes" }));

    await waitFor(() => expect(discardPageWorkspace).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" });
    expect((document.querySelector("[data-docsera-page-editor-host='true']") as HTMLElement | null)?.dataset.pageSysId).toBe("page-root");
    expect(latestMockEditorHost().sessionKey).toBe(initialSessionKey);
  }, 15000);

  it("falls back to a valid page and closes Page Settings when selected Added subtree undo removes the current selection", async () => {
    const editPages = [
      createPageRecord({
        sysId: "page-root",
        draftSlug: "overview",
        draftSlugNormalized: "overview",
        draftTitle: "Overview",
        publicationState: "published"
      }),
      createPageRecord({
        sysId: "page-added-parent",
        parentPageSysId: "page-root",
        siblingOrder: 2,
        draftSlug: "new-guide",
        draftSlugNormalized: "new-guide",
        draftTitle: "New Guide",
        publishedSlug: null,
        publishedSlugNormalized: null,
        publishedTitle: null,
        publicationState: "draft"
      }),
      createPageRecord({
        sysId: "page-added-child",
        parentPageSysId: "page-added-parent",
        siblingOrder: 1,
        draftSlug: "new-guide-child",
        draftSlugNormalized: "new-guide-child",
        draftTitle: "New Guide Child",
        publishedSlug: null,
        publishedSlugNormalized: null,
        publishedTitle: null,
        publicationState: "draft"
      })
    ];
    const discardPageWorkspace = vi.fn(async () => ({
      changeSetId: "change-set-001",
      changeSetRevision: 8,
      discardedPageSysId: "page-added-parent",
      pages: [editPages[0]!],
      pendingChanges: {
        ...createPendingChangesResult([]),
        changeSetRevision: 8
      },
      state: "succeeded" as const,
      workspaceStateRevision: 5
    }));

    renderApp(App, "/?workspace=product-docs&mode=edit&page=new-guide-child", {
      discardPageWorkspace,
      getWorkspacePendingChanges: vi.fn(async () => createPendingChangesResult([
        {
          attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
          category: "Added",
          firstPendingSequence: 1,
          lastChangedOn: "2026-07-27 09:00:00",
          navigable: true,
          pageSysId: "page-added-parent",
          title: "New Guide"
        },
        {
          attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
          category: "Added",
          firstPendingSequence: 2,
          lastChangedOn: "2026-07-27 09:05:00",
          navigable: true,
          pageSysId: "page-added-child",
          title: "New Guide Child"
        }
      ])),
      listPages: vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
        createPageListResult(mode === "edit" ? "edit" : "live", mode === "edit" ? editPages : [editPages[0]!])
      )
    });

    expect(await screen.findByRole("heading", { name: "New Guide Child" })).toBeInTheDocument();
    await openPageSettingsFor("New Guide Child");
    expect(await screen.findByRole("heading", { name: "Page Settings" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo changes to New Guide" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo changes" }));

    await waitFor(() => expect(discardPageWorkspace).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" });
    expect(screen.queryByRole("heading", { name: "Page Settings" })).toBeNull();
    expect((document.querySelector("[data-docsera-page-editor-host='true']") as HTMLElement | null)?.dataset.pageSysId).toBe("page-root");
  }, 15000);

  it("replaces the route with the empty Edit workspace route when the final Added subtree is undone", async () => {
    const onlyDraftPage = createPageRecord({
      sysId: "page-added-parent",
      draftSlug: "new-guide",
      draftSlugNormalized: "new-guide",
      draftTitle: "New Guide",
      publishedSlug: null,
      publishedSlugNormalized: null,
      publishedTitle: null,
      publicationState: "draft"
    });
    const discardPageWorkspace = vi.fn(async () => ({
      changeSetId: "change-set-001",
      changeSetRevision: 8,
      discardedPageSysId: "page-added-parent",
      pages: [],
      pendingChanges: {
        ...createPendingChangesResult([]),
        changeSetRevision: 8
      },
      state: "succeeded" as const,
      workspaceStateRevision: 5
    }));

    renderApp(App, "/?workspace=product-docs&mode=edit&page=new-guide", {
      discardPageWorkspace,
      getWorkspacePendingChanges: vi.fn(async () => createPendingChangesResult([
        {
          attribution: { accessibleLabel: "Last changed by Priya Writer", displayName: "P. Writer", fullDisplayName: "Priya Writer" },
          category: "Added",
          firstPendingSequence: 1,
          lastChangedOn: "2026-07-27 09:00:00",
          navigable: true,
          pageSysId: "page-added-parent",
          title: "New Guide"
        }
      ])),
      listPages: vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
        createPageListResult(mode === "edit" ? "edit" : "live", mode === "edit" ? [onlyDraftPage] : [])
      )
    });

    expect(await screen.findByRole("heading", { name: "New Guide" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo changes to New Guide" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo changes" }));

    await waitFor(() => expect(discardPageWorkspace).toHaveBeenCalledTimes(1));
    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: null });
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).toBeNull();
  }, 15000);
});
