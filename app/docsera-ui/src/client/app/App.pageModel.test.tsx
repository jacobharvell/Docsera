import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { createEmptyDocseraDocumentEnvelope } from "../../shared/editor/document";
import type {
  DocseraRuntimeContext,
  PageBodySaveResult,
  PageCreateResult,
  PageListResult,
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
    onStatusChange?: (state: { isDirty: boolean; isSaving: boolean }) => void;
  }) {
    useEffect(() => {
      onEditorFailureChange?.(null);
      onStatusChange?.({ isDirty: false, isSaving: false });
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

describe("App page model integration", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("creates a new page only after entering edit mode", async () => {
    const editPages = [createPageRecord()];
    let createdPage: WorkspacePageRecord | null = null;
    const createPage = vi.fn(async ({ title }: { parentPageSysId?: string | null; workspaceSlug: string; title: string }) => {
      createdPage = createPageRecord({
        sysId: "page-002",
        draftTitle: title,
        draftSlug: "fresh-page",
        draftSlugNormalized: "fresh-page",
        publishedTitle: null,
        publishedSlug: null,
        publishedSlugNormalized: null,
        publicationState: "draft"
      });

      return {
        page: createdPage,
        state: "succeeded"
      } satisfies PageCreateResult;
    });
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(
        mode === "edit" ? "edit" : "live",
        workspaceSlug,
        mode === "edit" ? (createdPage ? [...editPages, createdPage] : editPages) : [editPages[0]!]
      )
    );

    renderApp("/?workspace=product-docs&page=overview", {
      createPage,
      listPages
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    const editButton = screen.getByRole("button", { name: "Edit" });
    await act(async () => {
      fireEvent.click(editButton);
    });
    const newPageButton = (await screen.findAllByRole("button", { name: "New page" }))[0]!;
    await act(async () => {
      fireEvent.click(newPageButton);
    });
    const newPageTitle = screen.getByRole("textbox", { name: "New page title" });
    await act(async () => {
      fireEvent.change(newPageTitle, { target: { value: "Fresh Page" } });
      fireEvent.keyDown(newPageTitle, { key: "Enter", code: "Enter" });
    });

    expect(await screen.findByRole("heading", { name: "Fresh Page" })).toBeInTheDocument();
    expect(createPage).toHaveBeenCalledWith({
      title: "Fresh Page",
      workspaceAuthority: {
        changeSetId: "change-set-001",
        changeSetRevision: 9
      },
      workspaceLeaseToken: "workspace-lease-token",
      workspaceSlug: "product-docs"
    });
  });

  it("opens the inline create-page flow from a successfully loaded empty workspace in edit mode", async () => {
    const createPage = vi.fn(async () => {
      throw new Error("createPage should not be called before the inline title is committed");
    });
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", workspaceSlug, [])
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
    expect(screen.getByText("New page is unavailable because the workspace page list failed to load.")).toBeInTheDocument();
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).toBeNull();
    expect(createPage).not.toHaveBeenCalled();
  });
});
