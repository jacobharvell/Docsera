import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { WorkspaceToc } from "../features/workspaces/WorkspaceToc";
import type {
  DemoPage,
  DocseraRuntimeContext,
  PageCreateResult,
  PageListResult,
  ServiceNowClient,
  WorkspacePageRecord,
  WorkspaceViewRecord
} from "../shared/types/docsera";

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
    }),
    savePageSettings: vi.fn(async () => {
      throw new Error("savePageSettings should not be called in these tests");
    }),
    deletePage: vi.fn(async () => {
      throw new Error("deletePage should not be called in these tests");
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

function createDeferredPromise<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

function getPageSettingsValueButton(label: string): HTMLElement {
  const button = Array.from(document.querySelectorAll<HTMLButtonElement>(".docsera-page-settings__value")).find(
    (candidate) => candidate.textContent?.trim() === label
  );
  if (!button) {
    throw new Error(`Expected the Page Settings value button for "${label}" to render.`);
  }

  return button;
}

describe("App workspace routing", () => {
  it("renders a clean table-of-contents rail and keeps the collapse control accessible", async () => {
    const { container } = renderApp("/?workspace=product-docs&page_id=page-001");

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.queryByText("No headings yet.")).not.toBeInTheDocument();
    expect(screen.queryByText(/Developer status/i)).not.toBeInTheDocument();
    expect(screen.queryByText("SUCCESS")).not.toBeInTheDocument();

    const collapseButton = screen.getByRole("button", { name: "Collapse table of contents" });
    expect(collapseButton).toHaveAttribute("aria-expanded", "true");
    expect(collapseButton.querySelector(".docsera-toc-rail__toggle-icon--prototype-exception")).not.toBeNull();
    expect(collapseButton.querySelector(".docsera-icon")).toBeNull();
    expect(collapseButton.querySelector(".docsera-toc-rail__toggle-icon--collapsed")).toBeNull();
    expect(container.querySelector(".docsera-toc-rail__clip")).not.toBeNull();
    expect(container.querySelector(".docsera-toc-rail__clip .docsera-toc-rail__body")).not.toBeNull();
    expect(container.querySelector(".docsera-toc-rail--collapsed")).toBeNull();
    expect(container.querySelector(".docsera-workspace__aside--collapsed")).toBeNull();

    fireEvent.click(collapseButton);

    expect(screen.getByRole("button", { name: "Expand table of contents" })).toHaveAttribute("aria-expanded", "false");
    expect(document.getElementById("docsera-workspace-toc-product-docs")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".docsera-workspace__aside--collapsed")).not.toBeNull();
    expect(container.querySelector(".docsera-toc-rail--collapsed")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Expand table of contents" }).querySelector(".docsera-toc-rail__toggle-icon--prototype-exception")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Expand table of contents" }).querySelector(".docsera-toc-rail__toggle-icon--collapsed")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Expand table of contents" }));

    expect(screen.getByRole("button", { name: "Collapse table of contents" })).toHaveAttribute("aria-expanded", "true");
    expect(container.querySelector(".docsera-workspace__aside--collapsed")).toBeNull();
  });

  it("renders prototype-style toc links when section data is available", () => {
    const page: DemoPage = {
      id: "page-001",
      title: "Overview",
      slug: "overview",
      body: "Overview body",
      sections: [
        { id: "overview-section", title: "Overview" },
        { id: "details-section", title: "Details" }
      ]
    };

    render(<WorkspaceToc collapsed={false} page={page} panelId="test-workspace-toc" onToggleCollapsed={() => undefined} />);

    const activeLink = screen.getByRole("link", { name: "Overview" });
    expect(activeLink).toHaveClass("docsera-toc__link--active");
    expect(activeLink).not.toHaveClass("docsera-dev-status__badge--success");
    expect(document.querySelector(".docsera-toc-rail__toggle-icon--prototype-exception")).not.toBeNull();
    expect(document.querySelector(".docsera-toc-rail__toggle .docsera-icon")).toBeNull();
    expect(document.querySelector(".docsera-toc-rail__clip")).not.toBeNull();
    expect(document.querySelector(".docsera-toc-rail__clip .docsera-toc-rail__body")).not.toBeNull();
    expect(document.querySelector(".docsera-toc-rail__body")).not.toBeNull();
    expect(screen.getByRole("link", { name: "Details" })).toBeInTheDocument();
    expect(screen.queryByText("No headings yet.")).not.toBeInTheDocument();
  });

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

    fireEvent.click(screen.getAllByRole("button", { name: "New page" })[0]!);
    fireEvent.change(screen.getByRole("textbox", { name: "New page title" }), { target: { value: "Disposable Page" } });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "New page title" }), { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(window.location.search).toBe("?workspace=product-docs&page_id=page-003");
    });
    expect(await screen.findByRole("heading", { name: "Disposable Page" })).toBeInTheDocument();
    expect(serviceNowClient.createPage).toHaveBeenCalledWith({
      title: "Disposable Page",
      workspaceSlug: "product-docs"
    });
  });

  it("keeps the sidebar shell and add-page flow available when a workspace has no pages", async () => {
    const createPage = vi.fn(async () => ({
      state: "succeeded",
      page: createPageRecord({
        sysId: "page-003",
        draftTitle: "Starter Page",
        draftSlug: "starter-page",
        draftBodyText: "",
        siblingOrder: 1
      })
    })) as ServiceNowClient["createPage"];

    const listPages = vi.fn(async (): Promise<PageListResult> => ({
      items: [],
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001",
      totalCount: 0
    })) as ServiceNowClient["listPages"];

    const { container } = renderApp("/?workspace=product-docs", {
      createPage,
      listPages
    });

    expect(await screen.findByRole("navigation", { name: "Page tree" })).toBeInTheDocument();
    expect(screen.getByText("This workspace has no pages yet. Use New page to create the first one.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "No pages yet" })).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "New page" })[0]!);
    fireEvent.change(screen.getByRole("textbox", { name: "New page title" }), { target: { value: "Starter Page" } });
    fireEvent.keyDown(screen.getByRole("textbox", { name: "New page title" }), { key: "Enter", code: "Enter" });

    expect(await screen.findByRole("heading", { name: "Starter Page" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open settings for Starter Page" })).toBeInTheDocument();
    expect(createPage).toHaveBeenCalledWith({
      title: "Starter Page",
      workspaceSlug: "product-docs"
    });
  });

  it("commits page settings when the panel is dismissed", async () => {
    const savePageSettings = vi.fn(async () => ({
      state: "succeeded",
      page: createPageRecord({
        draftTitle: "Updated Overview",
        draftSlug: "overview",
        draftSlugNormalized: "overview"
      })
    })) as ServiceNowClient["savePageSettings"];

    renderApp("/?workspace=product-docs&page_id=page-001", {
      savePageSettings
    });

    await screen.findByRole("heading", { name: "Overview" });

    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview" }));
    expect(screen.queryByDisplayValue("Overview")).not.toBeInTheDocument();
    fireEvent.click(getPageSettingsValueButton("Overview"));
    fireEvent.change(screen.getByDisplayValue("Overview"), { target: { value: "Updated Overview" } });
    fireEvent.click(screen.getByRole("button", { name: "Close page settings" }));

    await waitFor(() => {
      expect(savePageSettings).toHaveBeenCalledWith({
        workspaceSlug: "product-docs",
        workspaceSysId: "workspace-001",
        pageSysId: "page-001",
        title: "Updated Overview",
        slug: "overview"
      });
    });
    expect(await screen.findByRole("heading", { name: "Updated Overview" })).toBeInTheDocument();
  });

  it("opens page settings from an unselected row and keeps the panel open for that page", async () => {
    renderApp("/?workspace=product-docs&page_id=page-001");

    await screen.findByRole("heading", { name: "Overview" });

    fireEvent.click(screen.getByRole("button", { name: "Open settings for Details" }));

    await waitFor(() => {
      expect(window.location.search).toBe("?workspace=product-docs&page_id=page-002");
    });
    expect(await screen.findByRole("heading", { name: "Details" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Page Settings" })).toBeInTheDocument();
    expect(screen.getAllByText("Page Settings")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Collapse settings for Details" })).toBeInTheDocument();
    expect(screen.queryByText("Edit the selected page title and slug. Changes save when you leave the panel.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /collapse$/i })).not.toBeInTheDocument();
    expect(
      screen.getByText("Changes are saved automatically when you close this panel or click outside of it.")
    ).toBeInTheDocument();
    expect(document.querySelector(".docsera-page-settings__input")).toBeNull();
  });

  it("keeps page settings open when slug validation fails on dismiss", async () => {
    const savePageSettings = vi.fn(async () => ({
      state: "succeeded",
      page: createPageRecord()
    })) as ServiceNowClient["savePageSettings"];

    renderApp("/?workspace=product-docs&page_id=page-001", {
      savePageSettings
    });

    await screen.findByRole("heading", { name: "Overview" });

    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview" }));
    fireEvent.click(screen.getByRole("button", { name: "overview" }));
    fireEvent.change(screen.getByDisplayValue("overview"), { target: { value: "bad/slug" } });
    fireEvent.click(screen.getByRole("button", { name: "Close page settings" }));

    expect(savePageSettings).not.toHaveBeenCalled();
    expect(await screen.findByText("Invalid slug. Slug must only include letters, numbers, dashes, periods, or underscores.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Page Settings" })).toBeInTheDocument();
  });

  it("saves and closes page settings when the sidebar tree is clicked outside the panel", async () => {
    const savePageSettings = vi.fn(async () => ({
      state: "succeeded",
      page: createPageRecord({
        draftTitle: "Updated Overview",
        draftSlug: "updated-overview",
        draftSlugNormalized: "updated-overview"
      })
    })) as ServiceNowClient["savePageSettings"];

    renderApp("/?workspace=product-docs&page_id=page-001", {
      savePageSettings
    });

    await screen.findByRole("heading", { name: "Overview" });

    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview" }));
    fireEvent.click(getPageSettingsValueButton("Overview"));
    expect(screen.getByRole("button", { name: "Collapse settings for Overview" })).toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("Overview"), { target: { value: "Updated Overview" } });
    fireEvent.pointerDown(screen.getByRole("button", { name: "Details" }));
    fireEvent.click(screen.getByRole("button", { name: "Details" }));

    await waitFor(() => {
      expect(savePageSettings).toHaveBeenCalledWith({
        workspaceSlug: "product-docs",
        workspaceSysId: "workspace-001",
        pageSysId: "page-001",
        title: "Updated Overview",
        slug: "overview"
      });
    });
    await waitFor(() => {
      expect(window.location.search).toBe("?workspace=product-docs&page_id=page-002");
    });
    expect(await screen.findByRole("heading", { name: "Details" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Page Settings" })).not.toBeInTheDocument();
  });

  it("saves and closes page settings when the editor content is clicked outside the panel", async () => {
    const savePageSettings = vi.fn(async () => ({
      state: "succeeded",
      page: createPageRecord({
        draftTitle: "Updated Overview",
        draftSlug: "updated-overview",
        draftSlugNormalized: "updated-overview"
      })
    })) as ServiceNowClient["savePageSettings"];

    renderApp("/?workspace=product-docs&page_id=page-001", {
      savePageSettings
    });

    await screen.findByRole("heading", { name: "Overview" });

    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview" }));
    fireEvent.click(getPageSettingsValueButton("Overview"));
    fireEvent.change(screen.getByDisplayValue("Overview"), { target: { value: "Updated Overview" } });
    fireEvent.pointerDown(screen.getByRole("heading", { name: "Overview" }));

    await waitFor(() => {
      expect(savePageSettings).toHaveBeenCalledWith({
        workspaceSlug: "product-docs",
        workspaceSysId: "workspace-001",
        pageSysId: "page-001",
        title: "Updated Overview",
        slug: "overview"
      });
    });
    expect(await screen.findByRole("heading", { name: "Updated Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Page Settings" })).not.toBeInTheDocument();
  });

  it("keeps page settings open when interacting inside the panel", async () => {
    renderApp("/?workspace=product-docs&page_id=page-001");

    await screen.findByRole("heading", { name: "Overview" });

    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview" }));

    const panelValueButton = document.querySelector<HTMLElement>(".docsera-page-settings__value");
    if (!panelValueButton) {
      throw new Error("Expected the page settings value button to render.");
    }

    fireEvent.click(panelValueButton);

    expect(screen.getByRole("heading", { name: "Page Settings" })).toBeInTheDocument();
  });

  it("preserves pending edits when delete is canceled", async () => {
    renderApp("/?workspace=product-docs&page_id=page-001");

    await screen.findByRole("heading", { name: "Overview" });

    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview" }));
    fireEvent.click(getPageSettingsValueButton("Overview"));
    fireEvent.change(screen.getByDisplayValue("Overview"), { target: { value: "Updated Overview" } });
    fireEvent.click(screen.getByRole("button", { name: "Delete page" }));

    expect(await screen.findByRole("dialog", { name: "Confirm deletion" })).toBeInTheDocument();
    expect(screen.getByText("This will permanently delete Updated Overview.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.getByRole("heading", { name: "Page Settings" })).toBeInTheDocument();
    expect(screen.getByDisplayValue("Updated Overview")).toBeInTheDocument();
  });

  it("uses the nested-page delete warning when the selected page has descendants", async () => {
    const root = createPageRecord({ sysId: "page-001", draftTitle: "Overview", draftSlug: "overview", siblingOrder: 1 });
    const child = createPageRecord({
      sysId: "page-002",
      parentPageSysId: "page-001",
      draftTitle: "Child Page",
      draftSlug: "child-page",
      draftBodyText: "Child body",
      siblingOrder: 1
    });
    const listPages = vi.fn(async (): Promise<PageListResult> => ({
      items: [root, child],
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001",
      totalCount: 2
    })) as ServiceNowClient["listPages"];

    renderApp("/?workspace=product-docs&page_id=page-001", {
      listPages
    });

    await screen.findByRole("heading", { name: "Overview" });

    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete page" }));

    expect(await screen.findByRole("dialog", { name: "Confirm deletion" })).toBeInTheDocument();
    expect(
      screen.getByText("This will permanently delete Overview and any nested pages underneath it.")
    ).toBeInTheDocument();
  });

  it("deletes the selected page and navigates to the next visible page", async () => {
    const deletePage = vi.fn(async () => ({
      state: "succeeded",
      nextPageSysId: "page-002"
    })) as ServiceNowClient["deletePage"];
    let listPagesCallCount = 0;
    const listPages = vi.fn(async () => {
      listPagesCallCount += 1;

      return {
        items:
          listPagesCallCount === 1
            ? [createPageRecord(), createPageRecord({ sysId: "page-002", draftTitle: "Details", draftSlug: "details", draftBodyText: "Details body", siblingOrder: 2 })]
            : [createPageRecord({ sysId: "page-002", draftTitle: "Details", draftSlug: "details", draftBodyText: "Details body", siblingOrder: 2 })],
        workspaceSlug: "product-docs",
        workspaceSysId: "workspace-001",
        totalCount: listPagesCallCount === 1 ? 2 : 1
      };
    }) as ServiceNowClient["listPages"];

    const { serviceNowClient } = renderApp("/?workspace=product-docs&page_id=page-001", {
      deletePage,
      listPages
    });

    await screen.findByRole("heading", { name: "Overview" });

    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete page" }));
    const deleteButtons = await screen.findAllByRole("button", { name: "Delete page" });
    fireEvent.click(deleteButtons[1] ?? deleteButtons[0]);

    await waitFor(() => {
      expect(window.location.search).toBe("?workspace=product-docs&page_id=page-002");
    });
    expect(await screen.findByRole("heading", { name: "Details" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Overview" })).not.toBeInTheDocument();
    expect(deletePage).toHaveBeenCalledWith({
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001",
      pageSysId: "page-001"
    });
    expect(serviceNowClient.listPages).toHaveBeenCalledTimes(2);
  });

  it("deleting the selected page keeps the first remaining tree page selected even if the server suggests another page", async () => {
    const first = createPageRecord({ sysId: "page-001", draftTitle: "Overview", draftSlug: "overview", siblingOrder: 1 });
    const second = createPageRecord({ sysId: "page-002", draftTitle: "Details", draftSlug: "details", draftBodyText: "Details body", siblingOrder: 2 });
    const third = createPageRecord({ sysId: "page-003", draftTitle: "Appendix", draftSlug: "appendix", draftBodyText: "Appendix body", siblingOrder: 3 });
    const deletePage = vi.fn(async () => ({
      state: "succeeded",
      nextPageSysId: "page-003"
    })) as ServiceNowClient["deletePage"];
    let listPagesCallCount = 0;
    const listPages = vi.fn(async () => {
      listPagesCallCount += 1;

      return {
        items: listPagesCallCount === 1 ? [first, second, third] : [second, third],
        workspaceSlug: "product-docs",
        workspaceSysId: "workspace-001",
        totalCount: listPagesCallCount === 1 ? 3 : 2
      };
    }) as ServiceNowClient["listPages"];

    renderApp("/?workspace=product-docs&page_id=page-001", {
      deletePage,
      listPages
    });

    await screen.findByRole("heading", { name: "Overview" });

    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete page" }));
    const deleteButtons = await screen.findAllByRole("button", { name: "Delete page" });
    fireEvent.click(deleteButtons[1] ?? deleteButtons[0]);

    await waitFor(() => {
      expect(window.location.search).toBe("?workspace=product-docs&page_id=page-002");
    });
    expect(await screen.findByRole("heading", { name: "Details" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Appendix" })).not.toBeInTheDocument();
  });

  it("keeps inline page creation active when cleared, cancels safely on empty submit or blur, and still creates unchanged untitled-page", async () => {
    const createPage = vi
      .fn(async () => ({
        state: "succeeded",
        page: createPageRecord({
          sysId: "page-003",
          draftTitle: "untitled-page",
          draftSlug: "untitled-page",
          draftBodyText: "",
          siblingOrder: 3
        })
      })) as ServiceNowClient["createPage"];

    renderApp("/?workspace=product-docs&page_id=page-001", {
      createPage
    });

    await screen.findByRole("heading", { name: "Overview" });

    fireEvent.click(screen.getAllByRole("button", { name: "New page" })[0]!);
    const initialInput = screen.getByRole("textbox", { name: "New page title" });
    fireEvent.keyDown(initialInput, { key: "Backspace", code: "Backspace" });
    fireEvent.change(initialInput, { target: { value: "" } });

    expect(screen.getByRole("textbox", { name: "New page title" })).toHaveValue("");

    fireEvent.keyDown(screen.getByRole("textbox", { name: "New page title" }), { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(screen.queryByRole("textbox", { name: "New page title" })).not.toBeInTheDocument();
    });
    expect(createPage).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: "New page" })[0]!);
    const blurInput = screen.getByRole("textbox", { name: "New page title" });
    fireEvent.change(blurInput, { target: { value: "" } });
    fireEvent.blur(blurInput);

    await waitFor(() => {
      expect(screen.queryByRole("textbox", { name: "New page title" })).not.toBeInTheDocument();
    });
    expect(createPage).not.toHaveBeenCalled();

    fireEvent.click(screen.getAllByRole("button", { name: "New page" })[0]!);
    fireEvent.keyDown(screen.getByRole("textbox", { name: "New page title" }), { key: "Enter", code: "Enter" });

    await waitFor(() => {
      expect(createPage).toHaveBeenCalledWith({
        title: "untitled-page",
        workspaceSlug: "product-docs"
      });
    });
    expect(await screen.findByRole("heading", { name: "untitled-page" })).toBeInTheDocument();
  });

  it("removes the deleted subtree from the rendered nav tree and keeps it absent after refresh", async () => {
    const root = createPageRecord({ sysId: "page-001", draftTitle: "Overview", draftSlug: "overview", siblingOrder: 1 });
    const child = createPageRecord({
      sysId: "page-002",
      parentPageSysId: "page-001",
      draftTitle: "Child Page",
      draftSlug: "child-page",
      draftBodyText: "Child body",
      siblingOrder: 1
    });
    const sibling = createPageRecord({
      sysId: "page-003",
      draftTitle: "Details",
      draftSlug: "details",
      draftBodyText: "Details body",
      siblingOrder: 2
    });
    const deletePage = vi.fn(async () => ({
      state: "succeeded",
      nextPageSysId: "page-003"
    })) as ServiceNowClient["deletePage"];
    let listPagesCallCount = 0;
    const listPages = vi.fn(async () => {
      listPagesCallCount += 1;

      return {
        items: listPagesCallCount === 1 ? [root, child, sibling] : [sibling],
        workspaceSlug: "product-docs",
        workspaceSysId: "workspace-001",
        totalCount: listPagesCallCount === 1 ? 3 : 1
      };
    }) as ServiceNowClient["listPages"];

    const { serviceNowClient } = renderApp("/?workspace=product-docs&page_id=page-001", {
      deletePage,
      listPages
    });

    await screen.findByRole("heading", { name: "Overview" });

    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete page" }));
    const deleteButtons = await screen.findAllByRole("button", { name: "Delete page" });
    fireEvent.click(deleteButtons[1] ?? deleteButtons[0]);

    await waitFor(() => {
      expect(window.location.search).toBe("?workspace=product-docs&page_id=page-003");
    });
    expect(await screen.findByRole("heading", { name: "Details" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Overview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Child Page" })).not.toBeInTheDocument();
    expect(serviceNowClient.listPages).toHaveBeenCalledTimes(2);
  });

  it("keeps the delete dialog open through the confirm pointerdown path and calls delete once with the selected sysId", async () => {
    vi.useRealTimers();

    const deletePage = vi.fn(async () => ({
      state: "succeeded",
      nextPageSysId: "page-002"
    })) as ServiceNowClient["deletePage"];

    renderApp("/?workspace=product-docs&page_id=page-001", {
      deletePage
    });

    await screen.findByRole("heading", { name: "Overview" });

    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete page" }));

    const confirmButton = screen.getAllByRole("button", { name: "Delete page" })[1];
    if (!confirmButton) {
      throw new Error("Expected the delete confirmation button to render.");
    }

    fireEvent.pointerDown(confirmButton);
    await new Promise((resolve) => window.setTimeout(resolve, 0));

    expect(screen.getByRole("dialog", { name: "Confirm deletion" })).toBeInTheDocument();
    expect(screen.getByText("This will permanently delete Overview.")).toBeInTheDocument();

    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(deletePage).toHaveBeenCalledTimes(1);
    });
    expect(deletePage).toHaveBeenCalledWith({
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001",
      pageSysId: "page-001"
    });
  });

  it("keeps page settings open and shows a safe error when delete fails", async () => {
    vi.useRealTimers();

    const deletePage = vi.fn(async () => ({
      state: "failed",
      errorMessage: "Something went wrong while deleting the page. The page was not deleted. Please try again."
    })) as ServiceNowClient["deletePage"];

    renderApp("/?workspace=product-docs&page_id=page-001", {
      deletePage
    });

    await screen.findByRole("heading", { name: "Overview" });

    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete page" }));
    const deleteButtons = await screen.findAllByRole("button", { name: "Delete page" });
    fireEvent.click(deleteButtons[1] ?? deleteButtons[0]);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Something went wrong while deleting the page. The page was not deleted. Please try again."
    );
    expect(screen.getByRole("heading", { name: "Page Settings" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Confirm deletion" })).toBeInTheDocument();
    expect(window.location.search).toBe("?workspace=product-docs&page_id=page-001");
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(deletePage).toHaveBeenCalledWith({
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001",
      pageSysId: "page-001"
    });
  });

  it("keeps the delete dialog open until the delete request resolves", async () => {
    vi.useRealTimers();

    const deferredDelete = createDeferredPromise<Awaited<ReturnType<ServiceNowClient["deletePage"]>>>();
    const deletePage = vi.fn(() => deferredDelete.promise) as ServiceNowClient["deletePage"];

    renderApp("/?workspace=product-docs&page_id=page-001", {
      deletePage
    });

    await screen.findByRole("heading", { name: "Overview" });

    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete page" }));
    const confirmButton = screen.getAllByRole("button", { name: "Delete page" })[1];
    if (!confirmButton) {
      throw new Error("Expected the delete confirmation button to render.");
    }

    fireEvent.click(confirmButton);

    await waitFor(() => {
      expect(deletePage).toHaveBeenCalledTimes(1);
    });
    const dialog = screen.getByRole("dialog", { name: "Confirm deletion" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Delete page" })).toBeDisabled();
    expect(within(dialog).getByRole("button", { name: "Cancel" })).toBeDisabled();

    deferredDelete.resolve({
      state: "succeeded",
      nextPageSysId: "page-002"
    });

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Confirm deletion" })).not.toBeInTheDocument();
    });
  });

  it("closes the delete dialog from the backdrop without calling delete", async () => {
    vi.useRealTimers();

    const deletePage = vi.fn(async () => ({
      state: "succeeded",
      nextPageSysId: "page-002"
    })) as ServiceNowClient["deletePage"];

    renderApp("/?workspace=product-docs&page_id=page-001", {
      deletePage
    });

    await screen.findByRole("heading", { name: "Overview" });

    fireEvent.click(screen.getByRole("button", { name: "Open settings for Overview" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete page" }));

    const backdrop = document.querySelector(".docsera-modal");
    if (!(backdrop instanceof HTMLElement)) {
      throw new Error("Expected the delete dialog backdrop to render.");
    }

    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);

    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Confirm deletion" })).not.toBeInTheDocument();
    });
    expect(screen.getByRole("heading", { name: "Page Settings" })).toBeInTheDocument();
    expect(deletePage).not.toHaveBeenCalled();
  });
});
