import "@testing-library/jest-dom/vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import {
  createDeferred,
  createPageListResult,
  createPageRecord,
  createPendingChangesResult,
  expectWorkspaceSearch,
  heldLease,
  renderApp
} from "./appTestSupport";
import type { PageSettingsSaveResult, WorkspaceMode } from "../shared/types/docsera";

vi.mock("../editor/PageEditorHost", () => ({
  PageEditorHost: function MockPageEditorHost({
    canEdit,
    onError,
    onReadyStateChange,
    onStatusChange
  }: {
    canEdit: boolean;
    onError?: (failure: null) => void;
    onReadyStateChange?: (ready: boolean) => void;
    onStatusChange?: (state: { isDirty: boolean; isSaving: boolean }) => void;
  }) {
    useEffect(() => {
      onError?.(null);
      onStatusChange?.({ isDirty: false, isSaving: false });
      onReadyStateChange?.(true);
    }, [onError, onReadyStateChange, onStatusChange]);

    return canEdit ? <div data-docsera-page-editor-host="true" /> : null;
  }
}));

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.name = "";
});

async function openPageSettingsFromPageTree(pageTitle: string) {
  const pageTree = screen.getByRole("navigation", { name: "Page tree" });
  fireEvent.click(await within(pageTree).findByRole("button", { name: new RegExp(`^Page actions for ${pageTitle}`, "i") }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Page settings" }));
}

describe("App page settings integration", () => {
  it("shows page settings only in edit mode", async () => {
    renderApp(App, "/?workspace=product-docs&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Page actions for Overview" })).not.toBeInTheDocument();

    const editButton = screen.getByRole("button", { name: "Edit" });
    await act(async () => {
      fireEvent.click(editButton);
    });

    await openPageSettingsFromPageTree("Overview");

    expect(await screen.findByRole("heading", { name: "Page Settings" })).toBeInTheDocument();
  });

  it("retains the dismissed Page Settings draft after a transient mutation recovery failure", async () => {
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

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      savePageSettings
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await openPageSettingsFromPageTree("Overview");
    expect(await screen.findByRole("heading", { name: "Page Settings" })).toBeInTheDocument();
    const pageSettingsPanel = screen.getByRole("complementary", { name: "Page Settings" });

    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview" }));
    const titleInput = within(pageSettingsPanel).getByDisplayValue("Overview");
    fireEvent.change(titleInput, { target: { value: "Overview Draft Retained" } });
    fireEvent.blur(titleInput);
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));

    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(1));
    expect(savePageSettings).toHaveBeenCalledWith(expect.objectContaining({ workspaceLeaseToken: "workspace-lease-token" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Workspace editing is temporarily unavailable. Please try again.");
    expect(screen.queryByRole("heading", { name: "Page Settings" })).toBeNull();
    expect(within(screen.getByRole("main", { name: "Overview Draft Retained" })).getByRole("button", { name: "Overview Draft Retained" })).toBeInTheDocument();
    await openPageSettingsFromPageTree("Overview Draft Retained");
    const reopenedPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    expect(within(reopenedPanel).getByRole("button", { name: "Overview Draft Retained" })).toBeInTheDocument();
    expect(within(reopenedPanel).getByRole("button", { name: "overview" })).toBeInTheDocument();
    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" });
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).not.toBeNull();
    expect(screen.queryByText(/currently being edited by another user/i)).toBeNull();
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

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      savePageSettings
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await openPageSettingsFromPageTree("Overview");
    expect(await screen.findByRole("heading", { name: "Page Settings" })).toBeInTheDocument();
    const pageSettingsPanel = screen.getByRole("complementary", { name: "Page Settings" });

    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview" }));
    const titleInput = within(pageSettingsPanel).getByDisplayValue("Overview");
    fireEvent.change(titleInput, { target: { value: "Overview Restored" } });
    fireEvent.blur(titleInput);
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "overview" }));
    const slugInput = within(pageSettingsPanel).getByDisplayValue("overview");
    fireEvent.change(slugInput, { target: { value: "overview-restored" } });
    fireEvent.blur(slugInput);
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));

    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("alert")).toHaveTextContent("This workspace is currently being edited by: Priya Writer");
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

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      savePageSettings
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await openPageSettingsFromPageTree("Overview");
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview" }));
    const titleInput = within(pageSettingsPanel).getByDisplayValue("Overview");
    fireEvent.change(titleInput, { target: { value: "Overview Forbidden Re-entry" } });
    fireEvent.blur(titleInput);
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This workspace is currently being edited by: Priya Writer");
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
            draftTitle: acquireWorkspaceEditLease.mock.calls.length >= 3 ? "Overview Server Changed" : "Overview Draft",
            publishedTitle: acquireWorkspaceEditLease.mock.calls.length >= 3 ? "Overview Server Changed" : "Overview"
          })
        ]
      )
    );

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      listPages,
      savePageSettings
    });

    await openPageSettingsFromPageTree("Overview");
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview Draft" }));
    const titleInput = within(pageSettingsPanel).getByDisplayValue("Overview Draft");
    fireEvent.change(titleInput, { target: { value: "Overview Restored" } });
    fireEvent.blur(titleInput);
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This workspace is currently being edited by: Priya Writer");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));
    expect(await screen.findByText("Your earlier Page Settings changes could not be restored because the shared page settings changed.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Page Settings" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    expect((await screen.findAllByText("Overview Server Changed")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Your earlier Page Settings changes could not be restored because the shared page settings changed.")).toBeNull();
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

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      acquireWorkspaceEditLease,
      listPages,
      savePageSettings
    });

    await openPageSettingsFromPageTree("Overview");
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "overview" }));
    const slugInput = within(pageSettingsPanel).getByDisplayValue("overview");
    fireEvent.change(slugInput, { target: { value: "overview-restored" } });
    fireEvent.blur(slugInput);
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("This workspace is currently being edited by: Priya Writer");
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" }));
    expect(await screen.findByText("Your earlier Page Settings changes could not be restored because the shared page settings changed.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Page Settings" })).toBeNull();
  });

  it("commits a direct Edit-mode title change on blur and reprojects the heading and tree without changing the slug", async () => {
    const deferredSave = createDeferred<PageSettingsSaveResult>();
    const savePageSettings = vi.fn(() => deferredSave.promise);

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      savePageSettings
    });

    const main = await screen.findByRole("main", { name: "Overview" });
    fireEvent.click(within(main).getByRole("button", { name: "Overview" }));
    const titleInput = await screen.findByRole("textbox", { name: "Page title" });
    fireEvent.change(titleInput, { target: { value: "Overview Inline" } });
    fireEvent.blur(titleInput);

    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(1));
    expect(savePageSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "overview",
        title: "Overview Inline"
      })
    );

    expect(screen.getByRole("main", { name: "Overview Inline" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Page tree" })).getByRole("button", { name: "Overview Inline" })).toBeInTheDocument();
    expect(within(screen.getByRole("main", { name: "Overview Inline" })).getByRole("button", { name: "Overview Inline" })).toBeInTheDocument();
    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" });

    await act(async () => {
      deferredSave.resolve({
        page: createPageRecord({
          draftSlug: "overview",
          draftSlugNormalized: "overview",
          draftTitle: "Overview Inline",
          publishedSlug: "overview",
          publishedSlugNormalized: "overview",
          publishedTitle: "Overview"
        }),
        state: "succeeded"
      });
    });

    expect(screen.getByRole("main", { name: "Overview Inline" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Page tree" })).getByRole("button", { name: "Overview Inline" })).toBeInTheDocument();
  });

  it("commits sidebar Rename through the existing Page Settings save path while preserving the slug", async () => {
    const savePageSettings = vi.fn(async (): Promise<PageSettingsSaveResult> => ({
      page: createPageRecord({
        draftSlug: "overview",
        draftSlugNormalized: "overview",
        draftTitle: "Overview Tree Rename",
        publishedSlug: "overview",
        publishedSlugNormalized: "overview",
        publishedTitle: "Overview"
      }),
      state: "succeeded"
    }));

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      savePageSettings
    });

    await screen.findByRole("main", { name: "Overview" });
    const pageTree = await screen.findByRole("navigation", { name: "Page tree" });
    fireEvent.click(within(pageTree).getByRole("button", { name: "Page actions for Overview" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));

    const renameInput = await within(pageTree).findByRole("textbox");
    expect(renameInput).toHaveAccessibleName("Rename Overview");
    expect(renameInput).toHaveFocus();
    expect(renameInput).toHaveValue("Overview");
    expect((renameInput as HTMLInputElement).selectionStart).toBe(0);
    expect((renameInput as HTMLInputElement).selectionEnd).toBe("Overview".length);

    fireEvent.change(renameInput, { target: { value: "Overview Tree Rename" } });
    fireEvent.keyDown(renameInput, { key: "Enter" });

    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(1));
    expect(savePageSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        pageSysId: "page-001",
        slug: "overview",
        title: "Overview Tree Rename"
      })
    );
    expect(within(pageTree).getByRole("button", { name: "Overview Tree Rename" })).toBeInTheDocument();
    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" });
  });

  it("commits sidebar Rename once when the user pointer-interacts with non-focusable workspace content", async () => {
    const savePageSettings = vi.fn(async (): Promise<PageSettingsSaveResult> => ({
      page: createPageRecord({
        draftSlug: "overview",
        draftSlugNormalized: "overview",
        draftTitle: "Overview Outside Commit",
        publishedSlug: "overview",
        publishedSlugNormalized: "overview",
        publishedTitle: "Overview"
      }),
      state: "succeeded"
    }));

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      savePageSettings
    });

    const main = await screen.findByRole("main", { name: "Overview" });
    const pageTree = await screen.findByRole("navigation", { name: "Page tree" });
    fireEvent.click(within(pageTree).getByRole("button", { name: "Page actions for Overview" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));

    const renameInput = await within(pageTree).findByRole("textbox", { name: "Rename Overview" });
    fireEvent.change(renameInput, { target: { value: "Overview Outside Commit" } });
    fireEvent.pointerDown(main);
    fireEvent.blur(renameInput);

    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(1));
    expect(savePageSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        pageSysId: "page-001",
        slug: "overview",
        title: "Overview Outside Commit"
      })
    );
    expect(within(pageTree).queryByRole("textbox", { name: "Rename Overview" })).toBeNull();
    expect(within(pageTree).getByRole("button", { name: "Overview Outside Commit" })).toBeInTheDocument();
  });

  it("does not open Page Settings when selecting an unselected page after sidebar Rename succeeds", async () => {
    const savePageSettings = vi.fn(async (): Promise<PageSettingsSaveResult> => ({
      page: createPageRecord({
        sysId: "page-002",
        draftTitle: "Reference Renamed",
        draftSlug: "reference",
        draftSlugNormalized: "reference",
        publishedTitle: "Reference",
        publishedSlug: "reference",
        publishedSlugNormalized: "reference",
        siblingOrder: 2
      }),
      state: "succeeded"
    }));

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      listPages: vi.fn(async ({ mode }: { mode?: WorkspaceMode }) =>
        createPageListResult(mode === "edit" ? "edit" : "live", [
          createPageRecord(),
          createPageRecord({
            sysId: "page-002",
            draftTitle: "Reference",
            draftSlug: "reference",
            draftSlugNormalized: "reference",
            publishedTitle: "Reference",
            publishedSlug: "reference",
            publishedSlugNormalized: "reference",
            siblingOrder: 2
          })
        ])
      ),
      savePageSettings
    });

    await screen.findByRole("main", { name: "Overview" });
    const pageTree = screen.getByRole("navigation", { name: "Page tree" });
    fireEvent.click(within(pageTree).getByRole("button", { name: "Page actions for Reference" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));

    const renameInput = await within(pageTree).findByRole("textbox", { name: "Rename Reference" });
    fireEvent.change(renameInput, { target: { value: "Reference Renamed" } });
    fireEvent.keyDown(renameInput, { key: "Enter" });

    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(1));
    fireEvent.click(await within(pageTree).findByRole("button", { name: "Reference Renamed" }));

    expect(await screen.findByRole("main", { name: "Reference Renamed" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Page Settings" })).toBeNull();
    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "reference" });
  });

  it("does not open Page Settings when selecting an unselected page after sidebar Rename is canceled", async () => {
    const savePageSettings = vi.fn(async (): Promise<PageSettingsSaveResult> => ({
      page: createPageRecord(),
      state: "succeeded"
    }));

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      listPages: vi.fn(async ({ mode }: { mode?: WorkspaceMode }) =>
        createPageListResult(mode === "edit" ? "edit" : "live", [
          createPageRecord(),
          createPageRecord({
            sysId: "page-002",
            draftTitle: "Reference",
            draftSlug: "reference",
            draftSlugNormalized: "reference",
            publishedTitle: "Reference",
            publishedSlug: "reference",
            publishedSlugNormalized: "reference",
            siblingOrder: 2
          })
        ])
      ),
      savePageSettings
    });

    await screen.findByRole("main", { name: "Overview" });
    const pageTree = screen.getByRole("navigation", { name: "Page tree" });
    fireEvent.click(within(pageTree).getByRole("button", { name: "Page actions for Reference" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));

    const renameInput = await within(pageTree).findByRole("textbox", { name: "Rename Reference" });
    fireEvent.change(renameInput, { target: { value: "Reference Canceled" } });
    fireEvent.keyDown(renameInput, { key: "Escape" });
    fireEvent.click(within(pageTree).getByRole("button", { name: "Reference" }));

    expect(await screen.findByRole("main", { name: "Reference" })).toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Page Settings" })).toBeNull();
    expect(savePageSettings).not.toHaveBeenCalled();
    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "reference" });
  });

  it("keeps another page's invalid Page Settings draft when sidebar Rename is requested", async () => {
    const savePageSettings = vi.fn(async (): Promise<PageSettingsSaveResult> => ({
      page: createPageRecord(),
      state: "succeeded"
    }));

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      listPages: vi.fn(async ({ mode }: { mode?: WorkspaceMode }) =>
        createPageListResult(mode === "edit" ? "edit" : "live", [
          createPageRecord(),
          createPageRecord({
            sysId: "page-002",
            draftTitle: "Reference",
            draftSlug: "reference",
            draftSlugNormalized: "reference",
            publishedTitle: "Reference",
            publishedSlug: "reference",
            publishedSlugNormalized: "reference",
            siblingOrder: 2
          })
        ])
      ),
      savePageSettings
    });

    await screen.findByRole("main", { name: "Overview" });
    await openPageSettingsFromPageTree("Overview");
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview" }));
    const titleInput = within(pageSettingsPanel).getByDisplayValue("Overview");
    fireEvent.change(titleInput, { target: { value: "   " } });

    const pageTree = screen.getByRole("navigation", { name: "Page tree" });
    fireEvent.click(within(pageTree).getByRole("button", { name: "Page actions for Reference" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));

    expect(await screen.findByRole("complementary", { name: "Page Settings" })).toBe(pageSettingsPanel);
    expect(within(pageSettingsPanel).getByRole("textbox")).toHaveValue("   ");
    expect(within(pageSettingsPanel).getByText("Page title is required.")).toBeInTheDocument();
    expect(within(pageTree).queryByRole("textbox", { name: "Rename Reference" })).toBeNull();
    expect(savePageSettings).not.toHaveBeenCalled();
  });

  it("saves another page's valid Page Settings draft before sidebar Rename begins", async () => {
    const deferredSave = createDeferred<PageSettingsSaveResult>();
    const savePageSettings = vi.fn(() => deferredSave.promise);

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      listPages: vi.fn(async ({ mode }: { mode?: WorkspaceMode }) =>
        createPageListResult(mode === "edit" ? "edit" : "live", [
          createPageRecord(),
          createPageRecord({
            sysId: "page-002",
            draftTitle: "Reference",
            draftSlug: "reference",
            draftSlugNormalized: "reference",
            publishedTitle: "Reference",
            publishedSlug: "reference",
            publishedSlugNormalized: "reference",
            siblingOrder: 2
          })
        ])
      ),
      savePageSettings
    });

    await screen.findByRole("main", { name: "Overview" });
    await openPageSettingsFromPageTree("Overview");
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview" }));
    const titleInput = within(pageSettingsPanel).getByDisplayValue("Overview");
    fireEvent.change(titleInput, { target: { value: "Overview Settings Draft" } });

    const pageTree = screen.getByRole("navigation", { name: "Page tree" });
    fireEvent.click(within(pageTree).getByRole("button", { name: "Page actions for Reference" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));

    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(1));
    expect(savePageSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        pageSysId: "page-001",
        slug: "overview",
        title: "Overview Settings Draft"
      })
    );
    expect(within(pageTree).queryByRole("textbox", { name: "Rename Reference" })).toBeNull();
    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" });

    await act(async () => {
      deferredSave.resolve({
        page: createPageRecord({
          draftSlug: "overview",
          draftSlugNormalized: "overview",
          draftTitle: "Overview Settings Draft",
          publishedSlug: "overview",
          publishedSlugNormalized: "overview",
          publishedTitle: "Overview"
        }),
        state: "succeeded"
      });
    });

    const renameInput = await within(pageTree).findByRole("textbox", { name: "Rename Reference" });
    expect(renameInput).toHaveFocus();
    expect(renameInput).toHaveValue("Reference");
    expect(screen.getByRole("main", { name: "Overview Settings Draft" })).toBeInTheDocument();
    expect(within(pageTree).getByRole("button", { name: "Overview Settings Draft" })).toHaveAttribute("aria-current", "page");
    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" });
  });

  it("cancels a direct Edit-mode title change on Escape without saving", async () => {
    const savePageSettings = vi.fn(async (): Promise<PageSettingsSaveResult> => ({
      page: createPageRecord(),
      state: "succeeded"
    }));

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      savePageSettings
    });

    const main = await screen.findByRole("main", { name: "Overview" });
    fireEvent.click(within(main).getByRole("button", { name: "Overview" }));
    const titleInput = await screen.findByRole("textbox", { name: "Page title" });
    fireEvent.change(titleInput, { target: { value: "Overview Cancelled" } });
    fireEvent.keyDown(titleInput, { key: "Escape" });

    expect(savePageSettings).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox", { name: "Page title" })).toBeNull();
    expect(within(screen.getByRole("main", { name: "Overview" })).getByRole("button", { name: "Overview" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Page tree" })).getByRole("button", { name: "Overview" })).toBeInTheDocument();
    expectWorkspaceSearch({ workspace: "product-docs", mode: "edit", page: "overview" });
  });

  it("retains invalid direct title input and reuses the same draft in Page Settings", async () => {
    const savePageSettings = vi.fn(async (): Promise<PageSettingsSaveResult> => ({
      page: createPageRecord(),
      state: "succeeded"
    }));

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      savePageSettings
    });

    const main = await screen.findByRole("main", { name: "Overview" });
    fireEvent.click(within(main).getByRole("button", { name: "Overview" }));
    const titleInput = await screen.findByRole("textbox", { name: "Page title" });
    fireEvent.change(titleInput, { target: { value: "   " } });
    fireEvent.blur(titleInput);

    expect(savePageSettings).not.toHaveBeenCalled();
    expect(await screen.findByRole("textbox", { name: "Page title" })).toHaveValue("   ");
    expect(screen.getByText("Page title is required.")).toBeInTheDocument();

    await openPageSettingsFromPageTree("Overview");
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    expect(within(pageSettingsPanel).getByRole("textbox")).toHaveValue("   ");
    expect(within(pageSettingsPanel).getByText("Page title is required.")).toBeInTheDocument();
  });

  it("retries a failed inline title save against the original persisted baseline", async () => {
    const savePageSettings = vi
      .fn()
      .mockResolvedValueOnce({
        errorMessage: "Something went wrong while saving page settings. Your changes were not saved. Please try again.",
        state: "failed" as const
      })
      .mockResolvedValueOnce({
        page: createPageRecord({
          draftTitle: "Overview Retry",
          publishedTitle: "Overview",
          draftSlug: "overview",
          draftSlugNormalized: "overview"
        }),
        state: "succeeded" as const
      });

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      savePageSettings
    });

    const main = await screen.findByRole("main", { name: "Overview" });
    fireEvent.click(within(main).getByRole("button", { name: "Overview" }));
    const titleInput = await screen.findByRole("textbox", { name: "Page title" });
    fireEvent.change(titleInput, { target: { value: "Overview Retry" } });
    fireEvent.blur(titleInput);

    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(1));
    expect(within(screen.getByRole("main", { name: "Overview Retry" })).getByRole("button", { name: "Overview Retry" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Page tree" })).getByRole("button", { name: "Overview Retry" })).toBeInTheDocument();
    expect(screen.getByText("Something went wrong while saving page settings. Your changes were not saved. Please try again.")).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("main", { name: "Overview Retry" })).getByRole("button", { name: "Overview Retry" }));
    expect(await screen.findByRole("textbox", { name: "Page title" })).toHaveAttribute("aria-invalid", "false");
    fireEvent.blur(await screen.findByRole("textbox", { name: "Page title" }));

    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(2));
    expect(savePageSettings).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        slug: "overview",
        title: "Overview Retry"
      })
    );
    expect(await screen.findByRole("main", { name: "Overview Retry" })).toBeInTheDocument();
  });

  it("dismisses Page Settings immediately on close while a valid title save is still pending", async () => {
    const deferredSave = createDeferred<PageSettingsSaveResult>();
    const savePageSettings = vi.fn(() => deferredSave.promise);

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      savePageSettings
    });

    await openPageSettingsFromPageTree("Overview");
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview" }));
    const titleInput = within(pageSettingsPanel).getByRole("textbox");
    fireEvent.change(titleInput, { target: { value: "Overview Panel Draft" } });
    fireEvent.blur(titleInput);
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));

    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Page Settings" })).toBeNull());
    expect(screen.getByRole("main", { name: "Overview Panel Draft" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Page tree" })).getByRole("button", { name: "Overview Panel Draft" })).toBeInTheDocument();

    await act(async () => {
      deferredSave.resolve({
        page: createPageRecord({
          draftSlug: "overview",
          draftSlugNormalized: "overview",
          draftTitle: "Overview Panel Draft",
          publishedSlug: "overview",
          publishedSlugNormalized: "overview",
          publishedTitle: "Overview"
        }),
        state: "succeeded"
      });
    });

    expect(screen.getByRole("main", { name: "Overview Panel Draft" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Page tree" })).getByRole("button", { name: "Overview Panel Draft" })).toBeInTheDocument();
  });

  it("dismisses Page Settings immediately on outside click while a valid title save is still pending", async () => {
    const deferredSave = createDeferred<PageSettingsSaveResult>();
    const savePageSettings = vi.fn(() => deferredSave.promise);

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      savePageSettings
    });

    await openPageSettingsFromPageTree("Overview");
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview" }));
    const titleInput = within(pageSettingsPanel).getByRole("textbox");
    fireEvent.change(titleInput, { target: { value: "Overview Outside Draft" } });
    fireEvent.blur(titleInput);

    fireEvent.pointerDown(document.body);

    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Page Settings" })).toBeNull());
    expect(screen.getByRole("main", { name: "Overview Outside Draft" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Page tree" })).getByRole("button", { name: "Overview Outside Draft" })).toBeInTheDocument();

    await act(async () => {
      deferredSave.resolve({
        page: createPageRecord({
          draftSlug: "overview",
          draftSlugNormalized: "overview",
          draftTitle: "Overview Outside Draft",
          publishedSlug: "overview",
          publishedSlugNormalized: "overview",
          publishedTitle: "Overview"
        }),
        state: "succeeded"
      });
    });

    expect(screen.getByRole("main", { name: "Overview Outside Draft" })).toBeInTheDocument();
  });

  it("dismisses Page Settings immediately and retains the draft when stale refresh blocks persistence dispatch", async () => {
    const staleRefreshDeferred = createDeferred<ReturnType<typeof createPageListResult>>();
    let editListCount = 0;
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) => {
      if (mode !== "edit") {
        return createPageListResult("live", [createPageRecord({ publishedTitle: "Overview", draftTitle: "Overview" })]);
      }
      editListCount += 1;
      if (editListCount === 1) {
        return createPageListResult("edit", [
          createPageRecord({
            draftTitle: "Overview Draft",
            publicationState: "published_with_unpublished_changes"
          })
        ]);
      }
      return staleRefreshDeferred.promise;
    });
    const savePageSettings = vi.fn(async (): Promise<PageSettingsSaveResult> => ({
      code: "conflict",
      currentChangeSetId: "change-set-001",
      currentChangeSetRevision: 8,
      errorMessage: "The active draft generation changed. Reload before saving again.",
      state: "failed"
    }));
    const getWorkspacePendingChanges = vi.fn(async () =>
      createPendingChangesResult([
        {
          attribution: {
            accessibleLabel: "Last changed by Priya Writer",
            displayName: "P. Writer",
            fullDisplayName: "Priya Writer"
          },
          category: "Modified",
          firstPendingSequence: 1,
          lastChangedOn: "2026-07-18 00:00:00",
          navigable: true,
          pageSysId: "page-001",
          title: "Overview"
        }
      ]));

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      getWorkspacePendingChanges,
      listPages,
      savePageSettings
    });

    await screen.findByRole("heading", { name: "Overview Draft" });
    await openPageSettingsFromPageTree("Overview Draft");
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview Draft" }));
    const titleInput = within(pageSettingsPanel).getByRole("textbox");
    fireEvent.change(titleInput, { target: { value: "Overview Pending Refresh" } });
    fireEvent.blur(titleInput);
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));

    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Page Settings" })).toBeNull());
    expect(screen.getByRole("main", { name: "Overview Pending Refresh" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("navigation", { name: "Page tree" })).getByRole("button", { name: "Overview Pending Refresh" })
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByText("Reloading the latest draft projection. Saving is temporarily unavailable.").length).toBeGreaterThan(0)
    );

    await openPageSettingsFromPageTree("Overview Pending Refresh");
    const blockedPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(blockedPanel).getByRole("button", { name: "Close page settings" }));

    await waitFor(() => expect(screen.queryByRole("heading", { name: "Page Settings" })).toBeNull());
    expect(savePageSettings).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("main", { name: "Overview Pending Refresh" })).toBeInTheDocument();
    expect(
      within(screen.getByRole("navigation", { name: "Page tree" })).getByRole("button", { name: "Overview Pending Refresh" })
    ).toBeInTheDocument();
    expect(screen.getAllByText("Reloading the latest draft projection. Saving is temporarily unavailable.").length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Open Changes Center" }));
    const changesCenter = await screen.findByRole("dialog", { name: "Changes Center" });
    expect(within(changesCenter).getByText("The visual editor is still getting ready.")).toBeInTheDocument();
    expect(within(changesCenter).getByRole("button", { name: "Publish" })).toBeDisabled();
    expect(within(changesCenter).getByRole("button", { name: "Discard all" })).toBeDisabled();

    await openPageSettingsFromPageTree("Overview Pending Refresh");
    const reopenedPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(reopenedPanel).getByRole("button", { name: "Overview Pending Refresh" }));
    expect(within(reopenedPanel).getByRole("textbox")).toHaveValue("Overview Pending Refresh");

    await act(async () => {
      staleRefreshDeferred.resolve(createPageListResult("edit", [
        createPageRecord({
          draftTitle: "Overview Refreshed",
          publicationState: "published_with_unpublished_changes"
        })
      ]));
      await Promise.resolve();
    });

    expect(savePageSettings).toHaveBeenCalledTimes(1);
  });

  it("keeps the projected title draft and error state after a background Page Settings save fails", async () => {
    const savePageSettings = vi.fn(async (): Promise<PageSettingsSaveResult> => ({
      errorMessage: "Something went wrong while saving page settings. Your changes were not saved. Please try again.",
      state: "failed"
    }));

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      savePageSettings
    });

    await openPageSettingsFromPageTree("Overview");
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview" }));
    const titleInput = within(pageSettingsPanel).getByRole("textbox");
    fireEvent.change(titleInput, { target: { value: "Overview Failed Draft" } });
    fireEvent.blur(titleInput);
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));

    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(
        screen.getByText("Something went wrong while saving page settings. Your changes were not saved. Please try again.")
      ).toBeInTheDocument()
    );
    expect(within(screen.getByRole("main", { name: "Overview Failed Draft" })).getByRole("button", { name: "Overview Failed Draft" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Page tree" })).getByRole("button", { name: "Overview Failed Draft" })).toBeInTheDocument();

    await openPageSettingsFromPageTree("Overview Failed Draft");
    const reopenedPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    expect(within(reopenedPanel).getByText("Something went wrong while saving page settings. Your changes were not saved. Please try again.")).toBeInTheDocument();
    fireEvent.click(within(reopenedPanel).getByRole("button", { name: "Overview Failed Draft" }));
    expect(within(reopenedPanel).getByRole("textbox")).toHaveValue("Overview Failed Draft");
  });

  it("keeps Page Settings open and preserves the existing tree title when the title is invalid on close", async () => {
    const savePageSettings = vi.fn(async (): Promise<PageSettingsSaveResult> => ({
      page: createPageRecord(),
      state: "succeeded"
    }));

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      savePageSettings
    });

    await openPageSettingsFromPageTree("Overview");
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview" }));
    const titleInput = within(pageSettingsPanel).getByRole("textbox");
    fireEvent.change(titleInput, { target: { value: "   " } });
    fireEvent.blur(titleInput);
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));

    expect(savePageSettings).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Page Settings" })).toBeInTheDocument();
    expect(within(screen.getByRole("complementary", { name: "Page Settings" })).getByText("Page title is required.")).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Page tree" })).getByRole("button", { name: "Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Overview Failed Draft" })).toBeNull();
  });

  it("rebases the persisted baseline when an older inline title save succeeds after a newer inline edit", async () => {
    const firstSave = createDeferred<PageSettingsSaveResult>();
    const savePageSettings = vi.fn().mockImplementationOnce(() => firstSave.promise);

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      savePageSettings
    });

    const main = await screen.findByRole("main", { name: "Overview" });
    fireEvent.click(within(main).getByRole("button", { name: "Overview" }));
    let titleInput = await screen.findByRole("textbox", { name: "Page title" });
    fireEvent.change(titleInput, { target: { value: "Overview First" } });
    fireEvent.blur(titleInput);

    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(1));

    fireEvent.click(within(screen.getByRole("main", { name: "Overview First" })).getByRole("button", { name: "Overview First" }));
    titleInput = await screen.findByRole("textbox", { name: "Page title" });
    fireEvent.change(titleInput, { target: { value: "Overview Second" } });

    await act(async () => {
      firstSave.resolve({
        page: createPageRecord({
          draftTitle: "Overview First",
          publishedTitle: "Overview",
          draftSlug: "overview",
          draftSlugNormalized: "overview"
        }),
        state: "succeeded"
      });
    });

    expect(await screen.findByRole("textbox", { name: "Page title" })).toHaveValue("Overview Second");
    expect(within(screen.getByRole("main", { name: "Overview Second" })).getByRole("textbox", { name: "Page title" })).toHaveValue("Overview Second");
    fireEvent.keyDown(await screen.findByRole("textbox", { name: "Page title" }), { key: "Escape" });

    expect(screen.queryByRole("textbox", { name: "Page title" })).toBeNull();
    const restoredMain = await screen.findByRole("main", { name: "Overview First" });
    expect(restoredMain).toBeInTheDocument();
    expect(within(restoredMain).getByRole("button", { name: "Overview First" })).toBeInTheDocument();

    await openPageSettingsFromPageTree("Overview First");
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    expect(within(pageSettingsPanel).getByRole("button", { name: "Overview First" })).toBeInTheDocument();
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));

    await waitFor(() => expect(screen.queryByRole("heading", { name: "Page Settings" })).toBeNull());
    expect(savePageSettings).toHaveBeenCalledTimes(1);
  });

  it("rebases the persisted baseline when Page Settings becomes the newer title interaction", async () => {
    const firstSave = createDeferred<PageSettingsSaveResult>();
    const savePageSettings = vi.fn().mockImplementationOnce(() => firstSave.promise);

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
      savePageSettings
    });

    const main = await screen.findByRole("main", { name: "Overview" });
    fireEvent.click(within(main).getByRole("button", { name: "Overview" }));
    let titleInput = await screen.findByRole("textbox", { name: "Page title" });
    fireEvent.change(titleInput, { target: { value: "Overview First" } });
    fireEvent.blur(titleInput);

    await waitFor(() => expect(savePageSettings).toHaveBeenCalledTimes(1));

    await openPageSettingsFromPageTree("Overview First");
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview First" }));
    titleInput = within(pageSettingsPanel).getByRole("textbox");
    fireEvent.change(titleInput, { target: { value: "Overview Second" } });

    await act(async () => {
      firstSave.resolve({
        page: createPageRecord({
          draftTitle: "Overview First",
          publishedTitle: "Overview",
          draftSlug: "overview",
          draftSlugNormalized: "overview"
        }),
        state: "succeeded"
      });
    });

    expect(within(pageSettingsPanel).getByRole("textbox")).toHaveValue("Overview Second");
    fireEvent.keyDown(within(pageSettingsPanel).getByRole("textbox"), { key: "Escape" });

    expect(within(pageSettingsPanel).getByRole("button", { name: "Overview First" })).toBeInTheDocument();
    expect(await screen.findByRole("main", { name: "Overview First" })).toBeInTheDocument();

    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Close page settings" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Page Settings" })).toBeNull());
    expect(savePageSettings).toHaveBeenCalledTimes(1);
  });

  it("keeps an exact empty-string direct title draft visible while invalid", async () => {
    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview");

    const main = await screen.findByRole("main", { name: "Overview" });
    fireEvent.click(within(main).getByRole("button", { name: "Overview" }));
    const titleInput = await screen.findByRole("textbox", { name: "Page title" });
    fireEvent.change(titleInput, { target: { value: "" } });
    fireEvent.blur(titleInput);

    expect(await screen.findByRole("textbox", { name: "Page title" })).toHaveValue("");
    expect(screen.getByText("Page title is required.")).toBeInTheDocument();

    await openPageSettingsFromPageTree("Overview");
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });
    expect(within(pageSettingsPanel).getByRole("textbox")).toHaveValue("");
    expect(within(pageSettingsPanel).getByText("Page title is required.")).toBeInTheDocument();
  });
});
