import "@testing-library/jest-dom/vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { createPageListResult, createPageRecord, expectWorkspaceSearch, heldLease, renderApp } from "./appTestSupport";
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

describe("App page settings integration", () => {
  it("shows page settings only in edit mode", async () => {
    renderApp(App, "/?workspace=product-docs&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open settings for Overview" })).not.toBeInTheDocument();

    const editButton = screen.getByRole("button", { name: "Edit" });
    await act(async () => {
      fireEvent.click(editButton);
    });

    const settingsButton = await screen.findByRole("button", { name: "Open settings for Overview" });
    await act(async () => {
      fireEvent.click(settingsButton);
    });

    expect(await screen.findByRole("heading", { name: "Page Settings" })).toBeInTheDocument();
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

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
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

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
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

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
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

    renderApp(App, "/?workspace=product-docs&mode=edit&page=overview", {
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
});
