import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import type { DocseraRuntimeContext, PageCreateResult, PageListResult, ServiceNowClient, WorkspacePageRecord, WorkspaceViewRecord } from "../shared/types/docsera";

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
    roleLabel: "Editor",
    canManageSettings: false,
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
    draftContentJson: {
      type: "doc",
      content: []
    },
    draftBodyText: "Overview body",
    publishedTitle: null,
    publishedSlug: null,
    publishedSlugNormalized: null,
    publishedContentJson: null,
    publishedBodyText: null,
    publicationState: "draft",
    active: true,
    ...overrides
  };
}

function createClient(overrides: Partial<ServiceNowClient> = {}): ServiceNowClient {
  const workspace = createWorkspace();
  const pages = [
    createPageRecord(),
    createPageRecord({ sysId: "page-002", draftTitle: "Details", draftSlug: "details", draftBodyText: "Details body", siblingOrder: 2 })
  ];

  const defaultClient: ServiceNowClient = {
    ping: vi.fn(async () => {
      throw new Error("ping should not be called in these tests");
    }),
    listWorkspaces: vi.fn(async () => ({
      items: [],
      page: 1,
      pageSize: 10,
      totalCount: 0,
      hasNextPage: false,
      searchText: ""
    })),
    getWorkspace: vi.fn(async () => ({
      workspace
    })),
    listPages: vi.fn(async (): Promise<PageListResult> => ({
      items: pages,
      workspaceSlug: workspace.slug,
      workspaceSysId: workspace.sysId ?? "",
      totalCount: pages.length
    })),
    createWorkspace: vi.fn(async () => {
      throw new Error("createWorkspace should not be called in these tests");
    }),
    getWorkspaceProvisioningStatus: vi.fn(async () => {
      throw new Error("getWorkspaceProvisioningStatus should not be called in these tests");
    }),
    createPage: vi.fn(async (): Promise<PageCreateResult> => {
      throw new Error("createPage should not be called in these tests");
    }),
    savePageBody: vi.fn(async () => {
      throw new Error("savePageBody should not be called in these tests");
    })
  };

  return {
    ...defaultClient,
    ...overrides
  };
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

describe("App workspace routing", () => {
  it("restores the selected page from page_id on hydration", async () => {
    renderApp("/?workspace=product-docs&page_id=page-002");

    expect(await screen.findByRole("heading", { name: "Details" })).toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.search).toBe("?workspace=product-docs&page_id=page-002");
    });
  });

  it("updates the URL when a page is selected from the tree", async () => {
    renderApp("/?workspace=product-docs&page_id=page-001");

    await screen.findByRole("heading", { name: "Overview" });

    fireEvent.click(screen.getByRole("button", { name: "Details" }));

    await waitFor(() => {
      expect(window.location.search).toBe("?workspace=product-docs&page_id=page-002");
    });
    expect(screen.getByRole("heading", { name: "Details" })).toBeInTheDocument();
  });

  it("falls back safely to the first visible page when page_id is invalid", async () => {
    renderApp("/?workspace=product-docs&page_id=not-a-real-page");

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitFor(() => {
      expect(window.location.search).toBe("?workspace=product-docs&page_id=page-001");
    });
  });

  it("selects a newly created page and updates the route", async () => {
    const createPage = vi.fn(async () => ({
      state: "succeeded",
      page: createPageRecord({
        sysId: "page-003",
        draftTitle: "Disposable Page",
        draftSlug: "disposable-page",
        draftBodyText: "",
        siblingOrder: 3
      })
    })) as ServiceNowClient["createPage"];

    const { container, serviceNowClient } = renderApp("/?workspace=product-docs&page_id=page-001", {
      createPage
    });

    await screen.findByRole("heading", { name: "Overview" });

    const newPageButton = container.querySelector<HTMLButtonElement>(".docsera-sidebar__new-page");
    if (!newPageButton) {
      throw new Error("Expected the workspace sidebar new page button to render.");
    }

    fireEvent.click(newPageButton);
    fireEvent.change(screen.getByLabelText("Page title"), { target: { value: "Disposable Page" } });
    fireEvent.click(screen.getByRole("button", { name: "Create page" }));

    await waitFor(() => {
      expect(window.location.search).toBe("?workspace=product-docs&page_id=page-003");
    });
    expect(await screen.findByRole("heading", { name: "Disposable Page" })).toBeInTheDocument();
    expect(serviceNowClient.createPage).toHaveBeenCalledWith({
      title: "Disposable Page",
      workspaceSlug: "product-docs"
    });
  });
});
