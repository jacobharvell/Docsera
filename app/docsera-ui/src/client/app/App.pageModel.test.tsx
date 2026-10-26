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
    onStatusChange?: (state: { isDirty: boolean; isSaving: boolean; status: "Saved" }) => void;
  }) {
    useEffect(() => {
      onEditorFailureChange?.(null);
      onStatusChange?.({ isDirty: false, isSaving: false, status: "Saved" });
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
    layout: {
      tocVisible: true
    },
    status: "active",
    roleLabel: "Admin",
    canManageWorkspaceMembers: true,
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
      canCreateWorkspaces: true,
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
    savePageBody: vi.fn(async () => ({ code: "failed" as const, errorMessage: "savePageBody should not be called in these tests", retryable: false, state: "failed" as const })),
    publishPage: vi.fn(async () => { throw new Error("publishPage should not be called in these tests"); }),
    savePageSettings: vi.fn(async () => { throw new Error("savePageSettings should not be called in these tests"); }),
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

function sidebarNewPageButton(): HTMLButtonElement {
  const button = document.querySelector(".docsera-sidebar__icon-button[aria-label='New page']");
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Missing sidebar New page button.");
  }
  return button;
}

function sidebarNewPageIcon(): SVGElement {
  const icon = sidebarNewPageButton().querySelector("svg");
  if (!(icon instanceof SVGElement)) {
    throw new Error("Missing sidebar New page icon.");
  }
  return icon;
}

function treeNewPageButton(): HTMLButtonElement {
  const button = document.querySelector(".docsera-page-tree__new-page");
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Missing tree New page button.");
  }
  return button;
}

function mainEmptyNewPageButton(): HTMLButtonElement {
  const button = document.querySelector(".docsera-main__empty-primary-action");
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error("Missing empty-state New page button.");
  }
  return button;
}

describe("App page model integration", () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    window.history.replaceState({}, "", "/");
    vi.restoreAllMocks();
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
    await waitFor(() => {
      expect(treeNewPageButton()).not.toBeDisabled();
    });
    await act(async () => {
      fireEvent.click(treeNewPageButton());
    });
    const newPageTitle = screen.getByRole("textbox", { name: "New page title" });
    await act(async () => {
      fireEvent.change(newPageTitle, { target: { value: "Fresh Page" } });
      fireEvent.keyDown(newPageTitle, { key: "Enter", code: "Enter" });
    });

    expect(await screen.findByRole("heading", { name: "Fresh Page" })).toBeInTheDocument();
    expect(screen.queryByText(/page (created|staged)|created page|publish workspace changes/i)).toBeNull();
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
    await waitFor(() => {
      expect(mainEmptyNewPageButton()).not.toBeDisabled();
    });
    fireEvent.click(mainEmptyNewPageButton());

    expect(await screen.findByRole("textbox", { name: "New page title" })).toBeInTheDocument();
    expect(createPage).not.toHaveBeenCalled();
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).toBeNull();
  });

  it.each([
    [sidebarNewPageButton] as const,
    [treeNewPageButton] as const
  ])("routes the New page trigger through the canonical inline-create flow", async (getButton) => {
    const createPage = vi.fn(async ({ title }: { parentPageSysId?: string | null; workspaceSlug: string; title: string }) => ({
      page: createPageRecord({
        sysId: "page-002",
        draftTitle: title,
        draftSlug: "fresh-page",
        draftSlugNormalized: "fresh-page",
        publishedTitle: null,
        publishedSlug: null,
        publishedSlugNormalized: null,
        publicationState: "draft"
      }),
      state: "succeeded" as const
    }));

    renderApp("/?workspace=product-docs&page=overview&mode=edit", { createPage });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitFor(() => {
      expect(getButton()).not.toBeDisabled();
    });

    await act(async () => {
      fireEvent.click(getButton());
    });

    const newPageTitle = screen.getByRole("textbox", { name: "New page title" });
    await act(async () => {
      fireEvent.change(newPageTitle, { target: { value: "Fresh Page" } });
      fireEvent.keyDown(newPageTitle, { key: "Enter", code: "Enter" });
    });

    expect(await screen.findByRole("heading", { name: "Fresh Page" })).toBeInTheDocument();
    expect(screen.queryByText(/page (created|staged)|created page|publish workspace changes/i)).toBeNull();
    expect(createPage).toHaveBeenCalledWith({
      title: "Fresh Page",
      workspaceAuthority: {
        changeSetId: "change-set-001",
        changeSetRevision: 9
      },
      workspaceLeaseToken: "workspace-lease-token",
      workspaceSlug: "product-docs"
    });
    expect(createPage.mock.calls[0]?.[0]).not.toHaveProperty("parentPageSysId");
  });

  it("keeps create failure feedback without leaving routine success feedback", async () => {
    const createPage = vi.fn(async (): Promise<PageCreateResult> => ({
      code: "failed",
      errorMessage: "Something went wrong while creating the page. The page was not created. Please try again.",
      state: "failed"
    }));

    renderApp("/?workspace=product-docs&page=overview&mode=edit", { createPage });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitFor(() => {
      expect(treeNewPageButton()).not.toBeDisabled();
    });

    fireEvent.click(treeNewPageButton());
    const newPageTitle = screen.getByRole("textbox", { name: "New page title" });
    fireEvent.change(newPageTitle, { target: { value: "Failed Page" } });
    fireEvent.keyDown(newPageTitle, { key: "Enter", code: "Enter" });

    expect(await screen.findByRole("alert")).toHaveTextContent("Something went wrong while creating the page.");
    expect(screen.getByRole("textbox", { name: "New page title" })).toHaveValue("Failed Page");
    expect(screen.queryByText(/page (created|staged)|created page|publish workspace changes/i)).toBeNull();
  });

  it("routes the header SVG click target through the canonical inline-create flow", async () => {
    const createPage = vi.fn(async ({ title }: { parentPageSysId?: string | null; workspaceSlug: string; title: string }) => ({
      page: createPageRecord({
        sysId: "page-002",
        draftTitle: title,
        draftSlug: "fresh-page",
        draftSlugNormalized: "fresh-page",
        publishedTitle: null,
        publishedSlug: null,
        publishedSlugNormalized: null,
        publicationState: "draft"
      }),
      state: "succeeded" as const
    }));

    renderApp("/?workspace=product-docs&page=overview&mode=edit", { createPage });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitFor(() => {
      expect(sidebarNewPageButton()).not.toBeDisabled();
    });

    Object.defineProperty(sidebarNewPageIcon(), "className", {
      configurable: true,
      value: { baseVal: " docsera-icon   docsera-icon--plus " }
    });

    expect(() => {
      fireEvent.click(sidebarNewPageIcon());
    }).not.toThrow();

    const newPageTitle = screen.getByRole("textbox", { name: "New page title" });
    expect(newPageTitle).toBeInTheDocument();
    await act(async () => {
      fireEvent.change(newPageTitle, { target: { value: "Fresh Page" } });
      fireEvent.keyDown(newPageTitle, { key: "Enter", code: "Enter" });
    });

    expect(await screen.findByRole("heading", { name: "Fresh Page" })).toBeInTheDocument();
    expect(createPage).toHaveBeenCalledTimes(1);
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
