import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { createEmptyDocseraDocumentEnvelope } from "../../shared/editor/document";
import type {
  DocseraRuntimeContext,
  PageBodySaveResult,
  PageListResult,
  WorkspaceListResult,
  WorkspaceMemberRecord,
  ServiceNowClient,
  WorkspaceMode,
  WorkspacePageRecord,
  WorkspaceViewRecord
} from "../shared/types/docsera";

const editorHostMockState = vi.hoisted(() => ({
  readyDelayMs: 0
}));

vi.mock("../editor/PageEditorHost", () => ({
  PageEditorHost: function MockPageEditorHost({
    canEdit,
    onEditorFailureChange,
    onReadyStateChange,
    onStatusChange
  }: {
    canEdit: boolean;
    onEditorFailureChange?: (failure: null) => void;
    onReadyStateChange?: (ready: boolean) => void;
    onStatusChange?: (state: { isDirty: boolean; isSaving: boolean; status: "Saved" }) => void;
  }) {
    useEffect(() => {
      onEditorFailureChange?.(null);
      onStatusChange?.({
        isDirty: false,
        isSaving: false,
        status: "Saved"
      });
      onReadyStateChange?.(false);

      const timeout = window.setTimeout(() => {
        onReadyStateChange?.(true);
      }, editorHostMockState.readyDelayMs);

      return () => {
        window.clearTimeout(timeout);
      };
    }, []);

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
  const workspaceSysId =
    workspaceSlug === "api-docs" ? "workspace-002" : workspaceSlug === "secure-docs" ? "workspace-003" : "workspace-001";

  return {
    items,
    mode,
    workspaceSlug,
    workspaceSysId,
    totalCount: items.length
  };
}

function createMember(overrides: Partial<WorkspaceMemberRecord> = {}): WorkspaceMemberRecord {
  return {
    accessLevel: "editor",
    active: true,
    displayName: "Editor One",
    email: "editor@example.com",
    userName: "editor.one",
    userSysId: "user-editor",
    ...overrides
  };
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

async function openPageSettingsFromPageTree(pageTitle: string) {
  const pageTree = screen.getByRole("navigation", { name: "Page tree" });
  fireEvent.click(await within(pageTree).findByRole("button", { name: new RegExp(`^Page actions for ${pageTitle}`, "i") }));
  fireEvent.click(await screen.findByRole("menuitem", { name: "Page settings" }));
}

function createBreadcrumbPages() {
  return [
    createPageRecord({
      sysId: "page-root",
      draftTitle: "Overview",
      draftSlug: "overview",
      draftSlugNormalized: "overview",
      publishedTitle: "Overview",
      publishedSlug: "overview",
      publishedSlugNormalized: "overview"
    }),
    createPageRecord({
      parentPageSysId: "page-root",
      siblingOrder: 2,
      sysId: "page-child",
      draftTitle: "Child Draft",
      draftSlug: "child",
      draftSlugNormalized: "child",
      publishedTitle: "Child",
      publishedSlug: "child",
      publishedSlugNormalized: "child"
    })
  ];
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
    saveWorkspaceSettings: vi.fn(async () => {
      throw new Error("saveWorkspaceSettings should not be called in these tests");
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

function seedRecentWorkspaceSlugs(...slugs: string[]) {
  window.localStorage.setItem("docsera.recent-workspaces:__local__", JSON.stringify(slugs));
}

function recentWorkspaceStorageKey(userSysId: string) {
  return `docsera.recent-workspaces:${userSysId}`;
}

function renderAuthenticatedApp(path: string, userSysId: string, clientOverrides: Partial<ServiceNowClient> = {}) {
  const serviceNowClient = createClient({
    ping: vi.fn(async () => ({
      authenticated: true,
      scope: "x_82900_docsera",
      status: "ok",
      timestamp: "2026-09-22 10:15:00",
      userAvatarPath: "",
      userDisplayName: `User ${userSysId}`,
      userName: `${userSysId}@example.com`,
      userSysId
    })),
    ...clientOverrides
  });

  return {
    serviceNowClient,
    ...render(
      <App
        runtime={{ ...createRuntime(path), config: { backendPingPath: "/api/x_82900_docsera/docsera_runtime/ping" } }}
        serviceNowClient={serviceNowClient}
      />
    )
  };
}

function readRecentWorkspaceSlugs(userSysId: string): string[] {
  return JSON.parse(window.localStorage.getItem(recentWorkspaceStorageKey(userSysId)) ?? "[]") as string[];
}

function createWorkspaceMap(slugs: string[]) {
  return Object.fromEntries(
    slugs.map((slug, index) => [
      slug,
      createWorkspace({
        name: slug
          .split("-")
          .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
          .join(" "),
        slug,
        sysId: `workspace-${String(index + 1).padStart(3, "0")}`
      })
    ])
  ) as Record<string, WorkspaceViewRecord>;
}

describe("App workspace shell integration", () => {
  it("renders the header as a sibling outside the body scroll container without inline reserve styles", () => {
    renderApp("/?workspace=product-docs&page=overview");

    const app = document.querySelector<HTMLElement>(".docsera-app");
    const header = document.querySelector<HTMLElement>(".docsera-header");
    const body = document.querySelector<HTMLElement>(".docsera-app__body");

    expect(app).toBeInTheDocument();
    expect(header).toBeInTheDocument();
    expect(body).toBeInTheDocument();
    expect(app?.children[0]).toBe(header);
    expect(app?.children[1]).toBe(body);
    expect(header?.parentElement).toBe(app);
    expect(body?.parentElement).toBe(app);
    expect(app?.style.getPropertyValue("--docsera-document-scrollbar-reserve")).toBe("");
  });

  beforeEach(() => {
    window.localStorage.clear();
    editorHostMockState.readyDelayMs = 0;
  });

  it("records successful direct workspace access as user-scoped MRU history with dedupe and a ten-entry cap", async () => {
    const slugs = Array.from({ length: 12 }, (_, index) => `workspace-${index + 1}`);
    const workspaces = createWorkspaceMap(slugs);
    const getWorkspace = vi.fn(async (workspaceSlug: string) => ({ workspace: workspaces[workspaceSlug] ?? null }));
    const userSysId = "user-recency";

    let view = renderAuthenticatedApp("/?workspace=workspace-1&page=overview", userSysId, { getWorkspace });
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitFor(() => expect(readRecentWorkspaceSlugs(userSysId)).toEqual(["workspace-1"]));
    view.unmount();

    for (const slug of ["workspace-2", "workspace-3", "workspace-2", ...slugs.slice(3)]) {
      view = renderAuthenticatedApp(`/?workspace=${slug}&page=overview`, userSysId, { getWorkspace });
      expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
      view.unmount();
    }

    expect(readRecentWorkspaceSlugs(userSysId)).toEqual([
      "workspace-12",
      "workspace-11",
      "workspace-10",
      "workspace-9",
      "workspace-8",
      "workspace-7",
      "workspace-6",
      "workspace-5",
      "workspace-4",
      "workspace-2"
    ]);
  });

  it("does not record failed workspace access", async () => {
    const userSysId = "user-failed";
    renderAuthenticatedApp("/?workspace=missing-docs&page=overview", userSysId, {
      getWorkspace: vi.fn(async () => ({ workspace: null }))
    });

    expect(await screen.findByText("Workspace could not be found.")).toBeInTheDocument();
    expect(readRecentWorkspaceSlugs(userSysId)).toEqual([]);
  });

  it("resolves persisted recent workspaces by slug, omits alphabetical backfill, preserves transient failures, and prunes inaccessible entries", async () => {
    const userSysId = "user-resolve";
    window.localStorage.setItem(recentWorkspaceStorageKey(userSysId), JSON.stringify(["zulu-docs", "flaky-docs", "missing-docs", "api-docs"]));
    const workspaces = createWorkspaceMap(["api-docs", "product-docs", "zulu-docs"]);
    const getWorkspace = vi.fn(async (workspaceSlug: string) => {
      if (workspaceSlug === "flaky-docs") {
        throw new Error("temporary lookup failure");
      }

      return {
        workspace: workspaceSlug === "missing-docs" ? null : workspaces[workspaceSlug] ?? null
      };
    });
    const listWorkspaces = vi.fn(async (): Promise<WorkspaceListResult> => ({
      canCreateWorkspaces: true,
      hasNextPage: true,
      items: [workspaces["api-docs"], workspaces["product-docs"]],
      page: 1,
      pageSize: 2,
      searchText: "",
      totalCount: 3
    }));

    renderAuthenticatedApp("/?view=my-workspaces", userSysId, { getWorkspace, listWorkspaces });

    const switcher = await screen.findByRole("button", { name: "Workspace switcher: Docsera" });
    fireEvent.click(switcher);
    const menu = await screen.findByRole("menu", { name: "Recent workspaces" });
    const menuItems = within(menu).getAllByRole("menuitem").map((item) => item.textContent?.trim());

    expect(menuItems).toEqual(["Zulu Docs", "Api Docs", "My Workspaces"]);
    expect(menuItems).not.toContain("Flaky Docs");
    expect(menuItems).not.toContain("Product Docs");
    await waitFor(() => expect(readRecentWorkspaceSlugs(userSysId)).toEqual(["zulu-docs", "flaky-docs", "api-docs"]));
  });

  it("hides My Workspaces only after unfiltered eligibility confirms a read-only user has no authoring access, while retaining recent navigation", async () => {
    const userSysId = "user-read-only";
    const readOnlyWorkspace = createWorkspace({
      canManageSettings: false,
      canManageWorkspaceMembers: false,
      name: "Reader Docs",
      roleLabel: null,
      slug: "reader-docs"
    });
    window.localStorage.setItem(recentWorkspaceStorageKey(userSysId), JSON.stringify([readOnlyWorkspace.slug]));
    const getWorkspace = vi.fn(async () => ({ workspace: readOnlyWorkspace }));
    const listWorkspaces = vi.fn(async (): Promise<WorkspaceListResult> => ({
      canCreateWorkspaces: false,
      hasNextPage: false,
      items: [],
      page: 1,
      pageSize: 10,
      searchText: "",
      totalCount: 0
    }));

    renderAuthenticatedApp("/?view=my-workspaces", userSysId, { getWorkspace, listWorkspaces });

    fireEvent.click(await screen.findByRole("button", { name: "Workspace switcher: Docsera" }));
    const menu = await screen.findByRole("menu", { name: "Recent workspaces" });
    expect(within(menu).getByRole("menuitem", { name: "Reader Docs" })).toBeInTheDocument();
    expect(within(menu).queryByRole("menuitem", { name: "My Workspaces" })).not.toBeInTheDocument();
    expect(menu.querySelector(".docsera-header__menu-divider")).not.toBeInTheDocument();

    fireEvent.click(within(menu).getByRole("menuitem", { name: "Reader Docs" }));
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
  });

  it("uses only the unfiltered switcher eligibility, retaining the footer for non-recent authoring access and global creation capability", async () => {
    const userSysId = "user-authoring-elsewhere";
    const readOnlyWorkspace = createWorkspace({ name: "Reader Docs", roleLabel: null, slug: "reader-docs" });
    window.localStorage.setItem(recentWorkspaceStorageKey(userSysId), JSON.stringify([readOnlyWorkspace.slug]));
    const getWorkspace = vi.fn(async () => ({ workspace: readOnlyWorkspace }));
    const listWorkspaces = vi.fn(async ({ pageSize, searchText }: { pageSize?: number; searchText?: string } = {}): Promise<WorkspaceListResult> => {
      if (pageSize === 10 && !searchText) {
        return {
          canCreateWorkspaces: false,
          hasNextPage: true,
          items: [createWorkspace({ name: "Editor Elsewhere", slug: "editor-elsewhere" })],
          page: 1,
          pageSize: 10,
          searchText: "",
          totalCount: 2
        };
      }

      return {
        canCreateWorkspaces: false,
        hasNextPage: false,
        items: [],
        page: 1,
        pageSize: pageSize ?? 10,
        searchText: searchText ?? "",
        totalCount: 0
      };
    });

    renderAuthenticatedApp("/?view=my-workspaces", userSysId, { getWorkspace, listWorkspaces });
    fireEvent.click(await screen.findByRole("button", { name: "Workspace switcher: Docsera" }));
    expect(await screen.findByRole("menuitem", { name: "My Workspaces" })).toBeInTheDocument();
    expect(listWorkspaces).toHaveBeenCalledWith({ page: 1, pageSize: 10 });

    fireEvent.click(screen.getByRole("menuitem", { name: "My Workspaces" }));
    expect(await screen.findByRole("heading", { name: "My Workspaces" })).toBeInTheDocument();
  });

  it("retains My Workspaces for a global Docsera Admin with no authoring memberships", async () => {
    const userSysId = "user-global-admin";
    const readOnlyWorkspace = createWorkspace({ name: "Reader Docs", roleLabel: null, slug: "reader-docs" });
    window.localStorage.setItem(recentWorkspaceStorageKey(userSysId), JSON.stringify([readOnlyWorkspace.slug]));

    renderAuthenticatedApp("/?view=my-workspaces", userSysId, {
      getWorkspace: vi.fn(async () => ({ workspace: readOnlyWorkspace })),
      listWorkspaces: vi.fn(async (): Promise<WorkspaceListResult> => ({
        canCreateWorkspaces: true,
        hasNextPage: false,
        items: [],
        page: 1,
        pageSize: 10,
        searchText: "",
        totalCount: 0
      }))
    });

    fireEvent.click(await screen.findByRole("button", { name: "Workspace switcher: Docsera" }));
    expect(await screen.findByRole("menuitem", { name: "My Workspaces" })).toBeInTheDocument();
  });

  it("keeps the footer visible while eligibility is unknown after initial failure or refresh, then applies confirmed refresh eligibility", async () => {
    const userSysId = "user-eligibility-refresh";
    const readOnlyWorkspace = createWorkspace({ name: "Reader Docs", roleLabel: null, slug: "reader-docs" });
    window.localStorage.setItem(recentWorkspaceStorageKey(userSysId), JSON.stringify([readOnlyWorkspace.slug]));
    const getWorkspace = vi.fn(async () => ({ workspace: readOnlyWorkspace }));
    const failedClient = createClient({
      getWorkspace,
      listWorkspaces: vi.fn(async () => {
        throw new Error("temporary list failure");
      }),
      ping: vi.fn(async () => ({
        authenticated: true, scope: "x_82900_docsera", status: "ok", timestamp: "2026-09-22 10:15:00", userAvatarPath: "", userDisplayName: "Reader", userName: "reader", userSysId
      }))
    });
    const runtime = { ...createRuntime("/?view=my-workspaces"), config: { backendPingPath: "/api/x_82900_docsera/docsera_runtime/ping" } };
    const view = render(<App runtime={runtime} serviceNowClient={failedClient} />);

    fireEvent.click(await screen.findByRole("button", { name: "Workspace switcher: Docsera" }));
    expect(await screen.findByRole("menuitem", { name: "My Workspaces" })).toBeInTheDocument();

    const refreshedEligibility = createDeferred<WorkspaceListResult>();
    const refreshingClient = createClient({
      getWorkspace,
      listWorkspaces: vi.fn(({ pageSize }: { pageSize?: number } = {}) =>
        pageSize === 10
          ? refreshedEligibility.promise
          : Promise.resolve({ canCreateWorkspaces: false, hasNextPage: false, items: [], page: 1, pageSize: pageSize ?? 10, searchText: "", totalCount: 0 })
      ),
      ping: failedClient.ping
    });
    view.rerender(<App runtime={runtime} serviceNowClient={refreshingClient} />);

    expect(screen.getByRole("menuitem", { name: "My Workspaces" })).toBeInTheDocument();
    await act(async () => {
      refreshedEligibility.resolve({ canCreateWorkspaces: false, hasNextPage: false, items: [], page: 1, pageSize: 10, searchText: "", totalCount: 0 });
    });
    await waitFor(() => expect(screen.queryByRole("menuitem", { name: "My Workspaces" })).not.toBeInTheDocument());
  });

  it("persists recent workspaces across remounts and keeps authenticated users separated", async () => {
    const workspaces = createWorkspaceMap(["api-docs", "product-docs"]);
    const getWorkspace = vi.fn(async (workspaceSlug: string) => ({ workspace: workspaces[workspaceSlug] ?? null }));
    const firstUser = "user-one";
    const secondUser = "user-two";

    const firstVisit = renderAuthenticatedApp("/?workspace=api-docs&page=overview", firstUser, { getWorkspace });
    expect(await screen.findByRole("heading", { name: "API Overview" })).toBeInTheDocument();
    await waitFor(() => expect(readRecentWorkspaceSlugs(firstUser)).toEqual(["api-docs"]));
    firstVisit.unmount();

    const secondUserView = renderAuthenticatedApp("/?view=my-workspaces", secondUser, { getWorkspace });
    expect(await screen.findByRole("heading", { name: "My Workspaces" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Docsera" })).toBeDisabled();
    expect(readRecentWorkspaceSlugs(secondUser)).toEqual([]);
    secondUserView.unmount();

    renderAuthenticatedApp("/?view=my-workspaces", firstUser, { getWorkspace });
    fireEvent.click(await screen.findByRole("button", { name: "Workspace switcher: Docsera" }));
    expect(await screen.findByRole("menuitem", { name: "Api Docs" })).toBeInTheDocument();
  });

  it("surfaces the successful runtime ping user to the shared launcher header", async () => {
    const client = createClient({
      ping: vi.fn(async () => ({
        authenticated: true,
        scope: "x_82900_docsera",
        status: "ok",
        timestamp: "2026-09-07 10:15:00",
        userAvatarPath: "/avatar.do?sysparm_user=6816f79cc0a8016401c5a33be04be441",
        userDisplayName: "Priya Writer",
        userName: "pwriter",
        userSysId: "6816f79cc0a8016401c5a33be04be441"
      }))
    });

    render(
      <App
        runtime={{ ...createRuntime(), config: { backendPingPath: "/api/x_82900_docsera/docsera_runtime/ping" } }}
        serviceNowClient={client}
      />
    );

    expect(screen.getByRole("button", { name: "Current user loading" })).toBeInTheDocument();
    const accountTrigger = await screen.findByRole("button", { name: "Current user: Priya Writer" });
    expect(accountTrigger.querySelector(".docsera-header__profile-avatar")).toHaveAttribute(
      "src",
      "/avatar.do?sysparm_user=6816f79cc0a8016401c5a33be04be441"
    );
  });

  it("defaults to live mode, requests published pages, and does not mount the editor", async () => {
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", "product-docs", [createPageRecord()])
    );

    renderApp("/?workspace=product-docs&page=overview", { listPages });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(listPages).toHaveBeenCalledWith({
      mode: "live",
      workspaceSlug: "product-docs"
    });
    expect(screen.queryByRole("button", { name: "New page" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).toBeNull();
  });

  it.each([true, false])("shows the other editor profile in recovery with selected page: %s", async (selected) => {
    const acquireWorkspaceEditLease = vi.fn().mockResolvedValue({ state: "locked", holderDisplayName: "System Administrator", holderUserSysId: "6816f79cc0a8016401c5a33be04be441", sameUserDifferentSession: false });
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) => createPageListResult(mode === "edit" ? "edit" : "live", "product-docs", selected ? [createPageRecord()] : []));
    renderApp(selected ? "/?workspace=product-docs&mode=edit&page=overview" : "/?workspace=product-docs&mode=edit", { acquireWorkspaceEditLease, listPages });
    expect(await screen.findByRole("heading", { name: "Editing session already active" })).toBeInTheDocument();
    expect(screen.queryByText("Access lost")).not.toBeInTheDocument();
    const link = screen.getByRole("link", { name: "System Administrator" });
    expect(link).toHaveAttribute("href", "/nav_to.do?uri=sys_user.do%3Fsys_id%3D6816f79cc0a8016401c5a33be04be441");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(screen.getByRole("button", { name: "Return to Live" })).toHaveClass("docsera-modal__secondary");
  });

  it.each([undefined, "invalid"])("renders a safe holder name without a valid ID: %s", async (holderUserSysId) => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview", { acquireWorkspaceEditLease: vi.fn().mockResolvedValue({ state: "locked", holderDisplayName: "System Administrator", holderUserSysId, sameUserDifferentSession: false }) });
    expect(await screen.findByText("This workspace is currently being edited by: System Administrator")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "System Administrator" })).not.toBeInTheDocument();
  });

  it("ends an observed same-account session once and reacquires editing", async () => {
    const release = createDeferred<{ state: "released" }>();
    const endPreviousWorkspaceEditSession = vi.fn(() => release.promise);
    const acquireWorkspaceEditLease = vi.fn().mockResolvedValueOnce({ state: "locked", holderDisplayName: "Editor", sameUserDifferentSession: true, observedLeaseId: "lease-1" }).mockResolvedValue({ state: "held", leaseToken: "new-token", heartbeatIntervalMs: 60000, staleAfterMs: 300000, changeSetId: "change-set-001", changeSetRevision: 9 });
    renderApp("/?workspace=product-docs&mode=edit&page=overview", { acquireWorkspaceEditLease, endPreviousWorkspaceEditSession });
    const button = await screen.findByRole("button", { name: "End previous session" });
    expect(screen.getByRole("heading", { name: "Editing session already active" })).toBeInTheDocument();
    expect(screen.queryByText("Access lost")).not.toBeInTheDocument();
    expect(button).toHaveClass("docsera-modal__primary");
    fireEvent.click(button); fireEvent.click(button);
    expect(endPreviousWorkspaceEditSession).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
    await act(async () => { release.resolve({ state: "released" }); });
    await waitFor(() => expect(acquireWorkspaceEditLease).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(document.querySelector("[data-docsera-page-editor-host='true']")).toBeInTheDocument());
  });

  it("recovers a same-account session when there are no published pages", async () => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    const acquireWorkspaceEditLease = vi.fn().mockResolvedValueOnce({ state: "locked", holderDisplayName: "Editor", sameUserDifferentSession: true, observedLeaseId: "lease-1" }).mockResolvedValue({ state: "held", leaseToken: "new-token", heartbeatIntervalMs: 60000, staleAfterMs: 300000, changeSetId: "change-set-001", changeSetRevision: 9 });
    const listPages = vi.fn(async ({ mode }: { mode?: WorkspaceMode; workspaceSlug: string }) => createPageListResult(mode === "edit" ? "edit" : "live", "product-docs", []));
    renderApp("/?workspace=product-docs&mode=edit", { acquireWorkspaceEditLease, listPages, endPreviousWorkspaceEditSession: vi.fn().mockResolvedValue({ state: "released" }) });
    fireEvent.click(await screen.findByRole("button", { name: "End previous session" }));
    await waitFor(() => expect(acquireWorkspaceEditLease).toHaveBeenCalledTimes(2));
    expect(await screen.findByText("No pages yet")).toBeInTheDocument();
  });

  it("shows release failure and allows returning to Live", async () => {
    window.sessionStorage.clear();
    window.localStorage.clear();
    const acquireWorkspaceEditLease = vi.fn().mockResolvedValue({ state: "locked", holderDisplayName: "Editor", sameUserDifferentSession: true, observedLeaseId: "lease-1" });
    const endPreviousWorkspaceEditSession = vi.fn().mockResolvedValue({ state: "lost", errorMessage: "The session changed.", holderDisplayName: null, sameUserDifferentSession: false });
    renderApp("/?workspace=product-docs&mode=edit&page=overview", { acquireWorkspaceEditLease, endPreviousWorkspaceEditSession });
    fireEvent.click(await screen.findByRole("button", { name: "End previous session" }));
    expect(await screen.findByText("The session changed.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "End previous session" })).not.toBeInTheDocument();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
    expect(screen.getByText("The session changed.")).toBeInTheDocument();
    expect(window.location.search).toContain("mode=edit");
    fireEvent.click(screen.getByRole("button", { name: "Retry Edit" }));
    expect(await screen.findByRole("button", { name: "End previous session" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "End previous session" }));
    expect(await screen.findByText("The session changed.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Return to Live" }));
    await waitFor(() => expect(window.location.search).not.toContain("mode=edit"));
  });

  it("animates direct refresh into Edit once after the lease and editor become ready", async () => {
    editorHostMockState.readyDelayMs = 25;
    const lease = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["acquireWorkspaceEditLease"]>>>>();
    const acquireWorkspaceEditLease = vi.fn(() => lease.promise);

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { acquireWorkspaceEditLease });

    expect(await screen.findByRole("button", { name: "Workspace switcher: Product Docs" })).toBeInTheDocument();
    expect(document.querySelector("[data-docsera-content-reveal-state='enter']")).toBeNull();
    expect(document.querySelector("[data-docsera-content-reveal-state='pending']")).toBeNull();

    await act(async () => {
      lease.resolve({
        changeSetId: "change-set-001",
        changeSetRevision: 9,
        heartbeatIntervalMs: 60_000,
        leaseToken: "workspace-lease-token",
        staleAfterMs: 300_000,
        state: "held"
      });
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitFor(() => expect(document.querySelector("[data-docsera-page-editor-host='true']")).toBeInTheDocument());
    await waitFor(() => expect(document.querySelector(".docsera-main__editor-host")).not.toHaveAttribute("hidden"));
    expect(document.querySelector("[data-docsera-content-reveal='visual']")).toHaveAttribute("data-docsera-content-reveal-state", "enter");
    expect(document.querySelectorAll("[data-docsera-content-reveal-state='enter']")).toHaveLength(1);
  });

  it("suppresses workspace placeholders during a prolonged Edit to Live transition and reveals Live when ready", async () => {
    const livePages = createDeferred<PageListResult>();
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      mode === "live" ? livePages.promise : createPageListResult("edit", workspaceSlug, [createPageRecord()])
    );

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { listPages });
    await waitFor(() => expect(document.querySelector(".docsera-main__editor-host")).not.toHaveAttribute("hidden"));
    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    await waitFor(() => expect(listPages).toHaveBeenCalledWith({ mode: "live", workspaceSlug: "product-docs" }));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)); });
    expect(document.querySelector(".docsera-sidebar__pending")).toBeNull();
    expect(document.querySelector(".docsera-main__pending")).toBeNull();
    expect(screen.getByLabelText("Workspace navigation")).toHaveAttribute("aria-busy", "true");

    await act(async () => { livePages.resolve(createPageListResult("live", "product-docs", [createPageRecord()])); });
    await waitFor(() => expect(document.querySelector("[data-docsera-content-reveal='live']")).toHaveAttribute("data-docsera-content-reveal-state", "enter"));
    expect(document.querySelector(".docsera-sidebar__tree")).toHaveAttribute("data-docsera-chrome-reveal-state", "enter");
  }, 10_000);

  it("preserves a Live to Edit reveal intent until delayed lease acquisition, draft loading, and editor readiness complete", async () => {
    editorHostMockState.readyDelayMs = 500;
    const lease = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["acquireWorkspaceEditLease"]>>>>();
    const editPages = createDeferred<PageListResult>();
    const acquireWorkspaceEditLease = vi.fn(() => lease.promise);
    const resumeWorkspaceEditLease = vi.fn(
      () => lease.promise as ReturnType<NonNullable<ServiceNowClient["resumeWorkspaceEditLease"]>>
    );
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }) => {
      if (mode === "edit") {
        return editPages.promise;
      }

      return createPageListResult("live", workspaceSlug, [createPageRecord()]);
    });

    renderApp("/?workspace=product-docs&page=overview", { acquireWorkspaceEditLease, listPages, resumeWorkspaceEditLease });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await waitFor(
      () => expect(document.querySelector("[data-docsera-content-reveal='live']")).toHaveAttribute("data-docsera-content-reveal-state", "idle"),
      { timeout: 1000 }
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    await waitFor(() => expect(acquireWorkspaceEditLease.mock.calls.length + resumeWorkspaceEditLease.mock.calls.length).toBe(1));
    expect(document.querySelector("[data-docsera-content-reveal='live']")).toHaveAttribute("data-docsera-content-reveal-state", "idle");
    expect(document.querySelector("[data-docsera-content-reveal-state='enter']")).toBeNull();
    expect(document.querySelector("[data-docsera-content-reveal-state='pending']")).toBeNull();

    await act(async () => {
      lease.resolve({
        changeSetId: "change-set-001",
        changeSetRevision: 9,
        heartbeatIntervalMs: 60_000,
        leaseToken: "workspace-lease-token",
        staleAfterMs: 300_000,
        state: "held"
      });
    });

    await waitFor(() => expect(listPages).toHaveBeenCalledWith({ mode: "edit", workspaceSlug: "product-docs" }));
    expect(document.querySelector("[data-docsera-content-reveal-state='enter']")).toBeNull();
    expect(document.querySelector(".docsera-sidebar__tree")).toHaveAttribute("data-docsera-chrome-reveal-state", "pending");

    await act(async () => {
      editPages.resolve(createPageListResult("edit", "product-docs", [createPageRecord()]));
    });

    await waitFor(() => expect(document.querySelector("[data-docsera-page-editor-host='true']")).toBeInTheDocument());
    expect(document.querySelector("[data-docsera-content-reveal='visual']")).toHaveAttribute("data-docsera-content-reveal-state", "pending");
    expect(document.querySelector("[data-docsera-content-reveal='visual']")).toHaveAttribute("data-docsera-content-reveal-pending", "true");
    expect(document.querySelector(".docsera-sidebar__tree")).toHaveAttribute("data-docsera-chrome-reveal-state", "pending");
    expect(document.querySelector("[data-docsera-content-reveal-state='enter']")).toBeNull();

    const placeholder = await screen.findByRole("status", { name: "Loading editor" });
    expect(placeholder).toBeVisible();
    expect(placeholder.closest("[data-docsera-content-reveal-pending='true']")).toBeNull();
    expect(document.querySelector("[data-docsera-content-reveal='visual']")).toHaveAttribute("data-docsera-content-reveal-pending", "true");

    await waitFor(() =>
      expect(document.querySelector("[data-docsera-content-reveal='visual']")).toHaveAttribute("data-docsera-content-reveal-state", "enter")
    );
    expect(screen.queryByRole("status", { name: "Loading editor" })).not.toBeInTheDocument();
    expect(document.querySelector(".docsera-sidebar__tree")).toHaveAttribute("data-docsera-chrome-reveal-state", "enter");
    expect(document.querySelector("[data-docsera-content-reveal='visual']")).not.toHaveAttribute("data-docsera-content-reveal-pending");
    expect(document.querySelectorAll("[data-docsera-content-reveal-state='enter']")).toHaveLength(1);

    await waitFor(
      () => {
        expect(document.querySelector("[data-docsera-content-reveal='visual']")).toHaveAttribute("data-docsera-content-reveal-state", "idle");
        expect(document.querySelector("[data-docsera-content-reveal-state='enter']")).toBeNull();
      },
      { timeout: 1000 }
    );
  }, 10_000);

  it("does not reactivate a completed Live to Edit reveal during later delayed Edit page navigation", async () => {
    editorHostMockState.readyDelayMs = 25;
    const pages = [
      createPageRecord(),
      createPageRecord({
        sysId: "page-reference",
        siblingOrder: 2,
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

    renderApp("/?workspace=product-docs&page=overview", { listPages });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    await waitFor(() =>
      expect(document.querySelector("[data-docsera-content-reveal='visual']")).toHaveAttribute("data-docsera-content-reveal-state", "enter")
    );
    await waitFor(
      () => {
        expect(document.querySelector("[data-docsera-content-reveal='visual']")).toHaveAttribute("data-docsera-content-reveal-state", "idle");
        expect(document.querySelector(".docsera-sidebar__tree")).toHaveAttribute("data-docsera-chrome-reveal-state", "idle");
        expect(document.querySelector("[data-docsera-content-reveal-state='enter']")).toBeNull();
      },
      { timeout: 1000 }
    );

    editorHostMockState.readyDelayMs = 300;
    fireEvent.click(within(screen.getByRole("navigation", { name: "Page tree" })).getByRole("button", { name: "Reference" }));

    expect(await screen.findByRole("heading", { name: "Reference" })).toBeInTheDocument();
    expect(within(screen.getByRole("navigation", { name: "Page tree" })).getByRole("button", { name: "Reference" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Collapse table of contents" })).toBeInTheDocument();
    expect(document.querySelector("[data-docsera-content-reveal='visual']")).toHaveAttribute("data-docsera-content-reveal-state", "idle");
    expect(document.querySelector("[data-docsera-content-reveal='visual']")).not.toHaveAttribute("data-docsera-content-reveal-pending");
    expect(document.querySelector(".docsera-sidebar__tree")).toHaveAttribute("data-docsera-chrome-reveal-state", "idle");
    expect(document.querySelector("[data-docsera-content-reveal-state='pending']")).toBeNull();
  }, 10_000);

  it("invalidates the Live to Edit reveal intent when edit lease acquisition fails", async () => {
    const lease = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["acquireWorkspaceEditLease"]>>>>();
    const acquireWorkspaceEditLease = vi.fn(() => lease.promise);
    const resumeWorkspaceEditLease = vi.fn(
      () => lease.promise as ReturnType<NonNullable<ServiceNowClient["resumeWorkspaceEditLease"]>>
    );

    renderApp("/?workspace=product-docs&page=overview", { acquireWorkspaceEditLease, resumeWorkspaceEditLease });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    await waitFor(() => expect(acquireWorkspaceEditLease.mock.calls.length + resumeWorkspaceEditLease.mock.calls.length).toBe(1));

    await act(async () => {
      lease.resolve({
        errorMessage: "Workspace editing is locked.",
        failure: "transient",
        retryable: true,
        state: "failed"
      });
    });

    expect(await screen.findByText("Workspace editing is locked.")).toBeInTheDocument();
    expect(document.querySelector("[data-docsera-content-reveal-state='enter']")).toBeNull();
    expect(document.querySelector("[data-docsera-content-reveal-state='pending']")).toBeNull();
  });

  it("opens page deletion from the page-tree context menu without opening Page Settings or changing selection", async () => {
    const pages = [
      createPageRecord({
        sysId: "page-selected",
        draftTitle: "Selected",
        draftSlug: "selected",
        draftSlugNormalized: "selected",
        publishedTitle: "Selected",
        publishedSlug: "selected",
        publishedSlugNormalized: "selected"
      }),
      createPageRecord({
        sysId: "page-target",
        draftTitle: "Target",
        draftSlug: "target",
        draftSlugNormalized: "target",
        publishedTitle: "Target",
        publishedSlug: "target",
        publishedSlugNormalized: "target",
        siblingOrder: 2
      })
    ];
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", workspaceSlug, pages)
    );
    const deletePage = vi.fn(async () => ({
      state: "succeeded" as const,
      nextPageSysId: "page-selected"
    }));

    renderApp("/?workspace=product-docs&mode=edit&page=selected", { deletePage, listPages });

    expect(await screen.findByRole("heading", { name: "Selected" })).toBeInTheDocument();
    fireEvent.contextMenu(screen.getByRole("button", { name: "Target" }).closest(".docsera-page-tree__row")!, { clientX: 20, clientY: 30 });
    expect(await screen.findByRole("menu", { name: "Page actions for Target" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("menuitem", { name: "Delete" }));

    expect(screen.queryByRole("complementary", { name: "Page Settings" })).not.toBeInTheDocument();
    const deleteDialog = await screen.findByRole("dialog", { name: "Confirm deletion" });
    expect(within(deleteDialog).getByText("This will permanently delete Target.")).toBeInTheDocument();

    fireEvent.click(within(deleteDialog).getByRole("button", { name: "Delete page" }));

    await waitFor(() => expect(deletePage).toHaveBeenCalledTimes(1));
    expect(deletePage).toHaveBeenCalledWith(expect.objectContaining({ pageSysId: "page-target" }));
    expect(screen.getByRole("heading", { name: "Selected" })).toBeInTheDocument();
    expect(screen.queryByText(/page (deleted|staged)|deleted page|publish workspace changes/i)).toBeNull();
    expect(screen.queryByRole("complementary", { name: "Page Settings" })).not.toBeInTheDocument();
  });

  it("closes the portaled page-tree context menu when workspace navigation collapses and restores normally", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    const pageTree = screen.getByRole("navigation", { name: "Page tree" });
    const overviewRow = within(pageTree).getByRole("button", { name: "Overview" }).closest(".docsera-page-tree__row");
    expect(overviewRow).not.toBeNull();
    fireEvent.contextMenu(overviewRow!, { clientX: 24, clientY: 32 });
    expect(await screen.findByRole("menu", { name: "Page actions for Overview" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Collapse navigation" }));

    await waitFor(() => expect(screen.queryByRole("menu", { name: "Page actions for Overview" })).not.toBeInTheDocument());
    expect(document.querySelector(".docsera-workspace__nav-frame")).toHaveAttribute("data-docsera-nav-collapsed", "true");
    expect(screen.getByRole("button", { name: "Expand navigation" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Expand navigation" }));

    expect(screen.getByRole("button", { name: "Collapse navigation" })).toBeInTheDocument();
    expect(document.querySelector(".docsera-workspace__nav-frame")).not.toHaveAttribute("data-docsera-nav-collapsed");
    fireEvent.contextMenu(within(pageTree).getByRole("button", { name: "Overview" }).closest(".docsera-page-tree__row")!, { clientX: 24, clientY: 32 });
    expect(await screen.findByRole("menu", { name: "Page actions for Overview" })).toBeInTheDocument();
  });

  it("opens page deletion from the real Page Settings delete button without discarding settings state", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    await openPageSettingsFromPageTree("Overview");
    const pageSettingsPanel = await screen.findByRole("complementary", { name: "Page Settings" });

    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Overview" }));
    const titleInput = within(pageSettingsPanel).getByDisplayValue("Overview");
    fireEvent.change(titleInput, { target: { value: "Overview Pending Delete" } });
    fireEvent.click(within(pageSettingsPanel).getByRole("button", { name: "Delete page" }));

    const deleteDialog = await screen.findByRole("dialog", { name: "Confirm deletion" });
    expect(within(deleteDialog).getByText("This will permanently delete Overview Pending Delete.")).toBeInTheDocument();
    expect(within(pageSettingsPanel).getByDisplayValue("Overview Pending Delete")).toBeInTheDocument();
  });

  it("keeps the workspace shell mounted during initial workspace loading and delays contained loading lines", async () => {
    let resolveListWorkspaces: (() => void) | undefined;
    const listWorkspaces = vi.fn(
      (): Promise<WorkspaceListResult> =>
        new Promise((resolve) => {
          resolveListWorkspaces = () => {
            resolve({
              canCreateWorkspaces: true,
              items: [],
              page: 1,
              pageSize: 10,
              totalCount: 0,
              hasNextPage: false,
              searchText: ""
            });
          };
        })
    );

    renderApp("/?view=my-workspaces", { listWorkspaces });

    expect(document.querySelector(".docsera-header")).toBeInTheDocument();
    expect(screen.queryByText("Loading workspaces")).not.toBeInTheDocument();
    await act(async () => {
      resolveListWorkspaces?.();
    });
    expect(await screen.findByText("No workspaces to show")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Docsera" })).toBeInTheDocument();
  });

  it("does not show decorative workspace loading lines when loading completes before the threshold", async () => {
    vi.useFakeTimers();
    try {
      const deferredWorkspace = createDeferred<{ workspace: WorkspaceViewRecord }>();
      const getWorkspace = vi.fn(() => deferredWorkspace.promise);

      renderApp("/?workspace=product-docs&page=overview", { getWorkspace });

      expect(screen.getByLabelText("Workspace navigation")).toHaveAttribute("aria-busy", "true");
      expect(document.querySelector(".docsera-sidebar__pending")).toBeNull();
      expect(document.querySelector(".docsera-main__pending")).toBeNull();
      expect(document.querySelector(".docsera-toc__loading")).toBeNull();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(349);
      });
      expect(document.querySelector(".docsera-sidebar__pending")).toBeNull();
      expect(document.querySelector(".docsera-main__pending")).toBeNull();
      expect(document.querySelector(".docsera-toc__loading")).toBeNull();

      await act(async () => {
        deferredWorkspace.resolve({ workspace: createWorkspace() });
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
      expect(document.querySelector(".docsera-sidebar__pending")).toBeNull();
      expect(document.querySelector(".docsera-main__pending")).toBeNull();
      expect(document.querySelector(".docsera-toc__loading")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows decorative workspace loading lines after the threshold without adding ToC placeholders", async () => {
    vi.useFakeTimers();
    try {
      const deferredWorkspace = createDeferred<{ workspace: WorkspaceViewRecord }>();
      const getWorkspace = vi.fn(() => deferredWorkspace.promise);

      renderApp("/?workspace=product-docs&page=overview", { getWorkspace });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });

      expect(document.querySelector(".docsera-sidebar__pending")).toBeInTheDocument();
      expect(document.querySelector(".docsera-main__pending")).toBeInTheDocument();
      expect(document.querySelector(".docsera-toc__loading")).toBeNull();
      expect(screen.getByText("On this page")).toBeInTheDocument();

      await act(async () => {
        deferredWorkspace.resolve({ workspace: createWorkspace() });
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
      expect(document.querySelector(".docsera-sidebar__pending")).toBeNull();
      expect(document.querySelector(".docsera-main__pending")).toBeNull();
      expect(document.querySelector(".docsera-toc__loading")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("starts a fresh editor placeholder delay after prolonged workspace loading resolves", async () => {
    vi.useFakeTimers();
    try {
      editorHostMockState.readyDelayMs = 300;
      const deferredWorkspace = createDeferred<{ workspace: WorkspaceViewRecord }>();
      const getWorkspace = vi.fn(() => deferredWorkspace.promise);

      renderApp("/?workspace=product-docs&mode=edit&page=overview", { getWorkspace });

      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });

      expect(document.querySelector(".docsera-sidebar__pending")).toBeInTheDocument();
      expect(document.querySelector(".docsera-main__pending")).toBeInTheDocument();
      expect(screen.queryByRole("status", { name: "Loading editor" })).not.toBeInTheDocument();

      await act(async () => {
        deferredWorkspace.resolve({ workspace: createWorkspace() });
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(document.querySelector(".docsera-sidebar__pending")).toBeNull();
      expect(screen.queryByRole("status", { name: "Loading editor" })).not.toBeInTheDocument();
      expect(document.querySelector(".docsera-main__editor-host")).toHaveAttribute("hidden");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(300);
      });

      expect(screen.queryByRole("status", { name: "Loading editor" })).not.toBeInTheDocument();
      expect(document.querySelector(".docsera-main__editor-host")).not.toHaveAttribute("hidden");
    } finally {
      editorHostMockState.readyDelayMs = 0;
      vi.useRealTimers();
    }
  });

  it("shows decorative editor loading lines after the editor threshold and removes them promptly when ready", async () => {
    vi.useFakeTimers();
    try {
      editorHostMockState.readyDelayMs = 400;

      renderApp("/?workspace=product-docs&mode=edit&page=overview");
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
      expect(screen.queryByRole("status", { name: "Loading editor" })).not.toBeInTheDocument();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(350);
      });

      const placeholder = screen.getByRole("status", { name: "Loading editor" });
      expect(placeholder).toBeVisible();
      expect(placeholder.closest("[data-docsera-content-reveal-pending='true']")).toBeNull();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });

      expect(screen.queryByRole("status", { name: "Loading editor" })).not.toBeInTheDocument();
      expect(document.querySelector(".docsera-main__editor-host")).not.toHaveAttribute("hidden");
    } finally {
      editorHostMockState.readyDelayMs = 0;
      vi.useRealTimers();
    }
  });

  it("keeps the shared header mounted across launcher and workspace navigation", async () => {
    renderApp("/?view=my-workspaces");

    expect(await screen.findByRole("heading", { name: "My Workspaces" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Docsera" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Docsera" })).toBeDisabled();
  });

  it("reveals My Workspaces as one content region after initial launcher loading completes", async () => {
    const deferredList = createDeferred<WorkspaceListResult>();
    const listWorkspaces = vi.fn(() => deferredList.promise);

    renderApp("/?view=my-workspaces", { listWorkspaces });

    const launcherContent = document.querySelector(".docsera-launcher__content-reveal");
    expect(launcherContent).toHaveAttribute("data-docsera-launcher-reveal-state", "pending");
    expect(launcherContent).toHaveAttribute("data-docsera-launcher-reveal-pending", "true");
    expect(document.querySelector(".docsera-launcher")).not.toHaveAttribute("data-docsera-launcher-reveal-state");
    expect(document.querySelector(".docsera-header")).not.toHaveAttribute("data-docsera-launcher-reveal-state");

    await act(async () => {
      deferredList.resolve({
        canCreateWorkspaces: true,
        items: [createWorkspace()],
        page: 1,
        pageSize: 10,
        totalCount: 1,
        hasNextPage: false,
        searchText: ""
      });
      await Promise.resolve();
    });

    expect(await screen.findByRole("heading", { name: "My Workspaces" })).toBeInTheDocument();
    expect(document.querySelector(".docsera-launcher__content-reveal")).toHaveAttribute("data-docsera-launcher-reveal-state", "enter");
  });

  it("keeps delayed My Workspaces loading feedback visible while the loaded launcher content waits to reveal", async () => {
    const deferredList = createDeferred<WorkspaceListResult>();
    const listWorkspaces = vi.fn(() => deferredList.promise);

    renderApp("/?view=my-workspaces", { listWorkspaces });

    const loadingHeading = await screen.findByRole("heading", { name: "Loading workspaces" });
    expect(loadingHeading).toBeVisible();
    expect(screen.getByText("Fetching your active workspace list from ServiceNow.")).toBeInTheDocument();
    const pendingLauncherContent = document.querySelector(".docsera-launcher__content-reveal");
    expect(pendingLauncherContent).toHaveAttribute("data-docsera-launcher-reveal-state", "pending");
    expect(pendingLauncherContent).toHaveAttribute("data-docsera-launcher-reveal-pending", "true");
    expect(loadingHeading.closest(".docsera-launcher__content-reveal")).toBeNull();
    expect(document.querySelector(".docsera-launcher")).not.toHaveAttribute("data-docsera-launcher-reveal-pending");

    await act(async () => {
      deferredList.resolve({
        canCreateWorkspaces: true,
        items: [createWorkspace()],
        page: 1,
        pageSize: 10,
        totalCount: 1,
        hasNextPage: false,
        searchText: ""
      });
      await Promise.resolve();
    });

    expect(await screen.findByRole("heading", { name: "My Workspaces" })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Search workspaces...")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Product Docs" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Loading workspaces" })).not.toBeInTheDocument();
    expect(document.querySelector(".docsera-launcher__content-reveal")).toHaveAttribute("data-docsera-launcher-reveal-state", "enter");
    expect(document.querySelectorAll(".docsera-launcher__content-reveal[data-docsera-launcher-reveal-state='enter']")).toHaveLength(1);
    expect(document.querySelectorAll("[data-docsera-content-reveal-state='enter']")).toHaveLength(0);
  });

  it("reveals a workspace once after navigating from My Workspaces with delayed destination loading", async () => {
    const deferredWorkspace = createDeferred<{ workspace: WorkspaceViewRecord }>();
    const getWorkspace = vi.fn(() => deferredWorkspace.promise);

    renderApp("/?view=my-workspaces", { getWorkspace });

    expect(await screen.findByRole("heading", { name: "My Workspaces" })).toBeInTheDocument();
    const header = document.querySelector(".docsera-header");
    await waitFor(
      () => expect(document.querySelector(".docsera-launcher__content-reveal")).toHaveAttribute("data-docsera-launcher-reveal-state", "idle"),
      { timeout: 1000 }
    );

    fireEvent.click(screen.getByRole("link", { name: "Product Docs" }));
    expect(screen.getByLabelText("Workspace navigation")).toHaveAttribute("aria-busy", "true");
    expect(document.querySelector("[data-docsera-content-reveal-state='enter']")).toBeNull();

    await act(async () => {
      deferredWorkspace.resolve({ workspace: createWorkspace() });
      await Promise.resolve();
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(document.querySelector("[data-docsera-content-reveal='live']")).toHaveAttribute("data-docsera-content-reveal-state", "enter");
    expect(document.querySelector(".docsera-sidebar__tree")).toHaveAttribute("data-docsera-chrome-reveal-state", "enter");
    expect(document.querySelector(".docsera-header")).toBe(header);
  });

  it("reveals My Workspaces once after returning from a workspace with delayed launcher loading", async () => {
    const deferredList = createDeferred<WorkspaceListResult>();
    const listWorkspaces = vi.fn(() => deferredList.promise);

    renderApp("/?workspace=product-docs&page=overview", { listWorkspaces });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    const header = document.querySelector(".docsera-header");
    await waitFor(
      () => expect(document.querySelector("[data-docsera-content-reveal='live']")).toHaveAttribute("data-docsera-content-reveal-state", "idle"),
      { timeout: 1000 }
    );

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "My Workspaces" }));

    expect(document.querySelector(".docsera-launcher__content-reveal")).toHaveAttribute("data-docsera-launcher-reveal-state", "pending");
    await act(async () => {
      deferredList.resolve({
        canCreateWorkspaces: true,
        items: [createWorkspace()],
        page: 1,
        pageSize: 10,
        totalCount: 1,
        hasNextPage: false,
        searchText: ""
      });
      await Promise.resolve();
    });

    expect(await screen.findByRole("heading", { name: "My Workspaces" })).toBeInTheDocument();
    expect(document.querySelector(".docsera-launcher__content-reveal")).toHaveAttribute("data-docsera-launcher-reveal-state", "enter");
    expect(document.querySelector(".docsera-header")).toBe(header);
  });

  it("reveals an initially loaded empty workspace once", async () => {
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", workspaceSlug, [])
    );

    renderApp("/?workspace=product-docs&mode=edit", { listPages });

    expect(await screen.findByRole("heading", { name: "No pages yet" })).toBeInTheDocument();
    expect(document.querySelector("[data-docsera-content-reveal='visual']")).toHaveAttribute("data-docsera-content-reveal-state", "enter");
    expect(document.querySelectorAll("[data-docsera-content-reveal-state='enter']")).toHaveLength(1);

    await waitFor(
      () => expect(document.querySelector("[data-docsera-content-reveal='visual']")).toHaveAttribute("data-docsera-content-reveal-state", "idle"),
      { timeout: 1000 }
    );
  });

  it("reveals an empty workspace after navigation from My Workspaces", async () => {
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }) => {
      if (workspaceSlug === "api-docs") {
        return createPageListResult(mode === "edit" ? "edit" : "live", workspaceSlug, []);
      }

      return createPageListResult(mode === "edit" ? "edit" : "live", workspaceSlug, [createPageRecord()]);
    });

    renderApp("/?view=my-workspaces", { listPages });

    expect(await screen.findByRole("heading", { name: "My Workspaces" })).toBeInTheDocument();
    await waitFor(
      () => expect(document.querySelector(".docsera-launcher__content-reveal")).toHaveAttribute("data-docsera-launcher-reveal-state", "idle"),
      { timeout: 1000 }
    );

    fireEvent.click(screen.getByRole("link", { name: "API Docs" }));

    expect(await screen.findByRole("heading", { name: "No published pages" })).toBeInTheDocument();
    expect(document.querySelector("[data-docsera-content-reveal='live']")).toHaveAttribute("data-docsera-content-reveal-state", "enter");
  });

  it("does not replay an empty-workspace entry reveal when creating the first page", async () => {
    const createdPage = createPageRecord({
      sysId: "page-created",
      draftTitle: "Fresh Page",
      draftSlug: "fresh-page",
      draftSlugNormalized: "fresh-page",
      publishedTitle: null,
      publishedSlug: null,
      publishedSlugNormalized: null,
      publicationState: "draft"
    });
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", workspaceSlug, [])
    );
    const createPage = vi.fn(async () => ({
      page: createdPage,
      state: "succeeded" as const
    }));

    renderApp("/?workspace=product-docs&mode=edit", { createPage, listPages });

    expect(await screen.findByRole("heading", { name: "No pages yet" })).toBeInTheDocument();
    expect(document.querySelector("[data-docsera-content-reveal='visual']")).toHaveAttribute("data-docsera-content-reveal-state", "enter");
    await waitFor(
      () => expect(document.querySelector("[data-docsera-content-reveal='visual']")).toHaveAttribute("data-docsera-content-reveal-state", "idle"),
      { timeout: 1000 }
    );

    fireEvent.click(within(screen.getByRole("main", { name: "No pages yet" })).getByRole("button", { name: "New page" }));
    const newPageTitle = screen.getByRole("textbox", { name: "New page title" });
    fireEvent.change(newPageTitle, { target: { value: "Fresh Page" } });
    fireEvent.keyDown(newPageTitle, { key: "Enter", code: "Enter" });

    expect(await screen.findByRole("heading", { name: "Fresh Page" })).toBeInTheDocument();
    expect(document.querySelector("[data-docsera-content-reveal='visual']")).toHaveAttribute("data-docsera-content-reveal-state", "idle");
    expect(document.querySelector("[data-docsera-content-reveal-state='enter']")).toBeNull();
  });

  it("retains and disables the committed header controls while a workspace switch is unresolved", async () => {
    seedRecentWorkspaceSlugs("api-docs", "secure-docs");
    const apiWorkspaceDeferred = createDeferred<{ workspace: WorkspaceViewRecord }>();
    const secureWorkspaceDeferred = createDeferred<{ workspace: WorkspaceViewRecord }>();
    let apiWorkspaceLookupCount = 0;
    let secureWorkspaceLookupCount = 0;
    const getWorkspace = vi.fn(async (workspaceSlug: string) => {
      if (workspaceSlug === "api-docs") {
        apiWorkspaceLookupCount += 1;
        if (apiWorkspaceLookupCount === 1) {
          return {
            workspace: createWorkspace({
              slug: "api-docs",
              sysId: "workspace-002",
              name: "API Docs"
            })
          };
        }
        return apiWorkspaceDeferred.promise;
      }

      if (workspaceSlug === "secure-docs") {
        secureWorkspaceLookupCount += 1;
        if (secureWorkspaceLookupCount === 1) {
          return {
            workspace: createWorkspace({
              name: "Secure Docs",
              slug: "secure-docs",
              sysId: "workspace-003"
            })
          };
        }
        return secureWorkspaceDeferred.promise;
      }

      return {
        workspace: createWorkspace()
      };
    });
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }) => {
      if (workspaceSlug === "api-docs") {
        return createPageListResult(mode === "edit" ? "edit" : "live", workspaceSlug, [
          createPageRecord({
            sysId: "page-api",
            workspaceSysId: "workspace-002",
            draftTitle: "API Overview",
            draftSlug: "api-overview",
            draftSlugNormalized: "api-overview",
            publishedTitle: "API Overview",
            publishedSlug: "api-overview",
            publishedSlugNormalized: "api-overview"
          })
        ]);
      }

      if (workspaceSlug === "secure-docs") {
        return createPageListResult(mode === "edit" ? "edit" : "live", workspaceSlug, [
          createPageRecord({
            sysId: "page-secure",
            workspaceSysId: "workspace-003",
            draftTitle: "Secure Overview",
            draftSlug: "secure-overview",
            draftSlugNormalized: "secure-overview",
            publishedTitle: "Secure Overview",
            publishedSlug: "secure-overview",
            publishedSlugNormalized: "secure-overview"
          })
        ]);
      }

      return createPageListResult(mode === "edit" ? "edit" : "live", workspaceSlug, [createPageRecord()]);
    });
    const listWorkspaces = vi.fn(async () => ({
      canCreateWorkspaces: true,
      items: [
        createWorkspace(),
        createWorkspace({ slug: "api-docs", sysId: "workspace-002", name: "API Docs" }),
        createWorkspace({ slug: "secure-docs", sysId: "workspace-003", name: "Secure Docs" })
      ],
      page: 1,
      pageSize: 10,
      totalCount: 3,
      hasNextPage: false,
      searchText: ""
    }));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { getWorkspace, listPages, listWorkspaces });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    const liveToggle = screen.getByRole("button", { name: "Live" });
    const modeGroup = screen.getByRole("group", { name: "Workspace mode" });
    const listPagesCallCount = listPages.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "API Docs" }));

    expect(screen.getByRole("button", { name: "Live" })).toBe(liveToggle);
    expect(screen.getByRole("group", { name: "Workspace mode" })).toBe(modeGroup);
    expect(screen.getByRole("button", { name: "Live" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Workspace settings" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Live" }));
    expect(listPages.mock.calls.length).toBe(listPagesCallCount);

    await act(async () => {
      apiWorkspaceDeferred.resolve({
        workspace: createWorkspace({
          slug: "api-docs",
          sysId: "workspace-002",
          name: "API Docs"
        })
      });
      await Promise.resolve();
    });

    expect(await screen.findByRole("heading", { name: "API Overview" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Live" })).toBe(liveToggle);
    expect(screen.getByRole("button", { name: "Live" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "Workspace settings" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: API Docs/i }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Secure Docs" }));

    expect(screen.getByRole("button", { name: "Live" })).toBe(liveToggle);
    expect(screen.getByRole("button", { name: "Live" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Workspace settings" })).not.toBeInTheDocument();

    await act(async () => {
      secureWorkspaceDeferred.resolve({
        workspace: createWorkspace({
          canManageSettings: false,
          name: "Secure Docs",
          roleLabel: null,
          slug: "secure-docs",
          sysId: "workspace-003"
        })
      });
      await Promise.resolve();
    });

    expect(await screen.findByRole("heading", { name: "Secure Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Live" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Workspace settings" })).not.toBeInTheDocument();
  });

  it("does not retain header controls during initial loading", async () => {
    const deferredWorkspace = createDeferred<{ workspace: WorkspaceViewRecord }>();
    const getWorkspace = vi.fn(() => deferredWorkspace.promise);

    renderApp("/?workspace=product-docs", { getWorkspace });

    expect(await screen.findByLabelText("Workspace navigation")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Live" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Workspace settings" })).not.toBeInTheDocument();
  });

  it("does not retain header controls after a workspace-load error", async () => {
    const getWorkspace = vi.fn(async () => {
      throw new Error("Unable to load workspace.");
    });

    renderApp("/?workspace=product-docs", { getWorkspace });

    expect(await screen.findByRole("heading", { name: "Workspace unavailable" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Live" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Workspace settings" })).not.toBeInTheDocument();
  });

  it("returns to My Workspaces from workspace load errors without remounting the header", async () => {
    const getWorkspace = vi.fn(async () => ({
      workspace: createWorkspace()
    }));
    const listPages = vi.fn(async () => {
      throw new Error("Unable to load pages.");
    });

    renderApp("/?workspace=product-docs", { getWorkspace, listPages });

    const header = document.querySelector(".docsera-header");
    expect(header).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Pages unavailable" })).toBeInTheDocument();
    await screen.findByRole("button", { name: "Return to My Workspaces" });

    fireEvent.click(screen.getByRole("button", { name: "Return to My Workspaces" }));

    expect(await screen.findByRole("heading", { name: "My Workspaces" })).toBeInTheDocument();
    expect(document.querySelector(".docsera-header")).toBe(header);
  });

  it("renders workspace breadcrumbs in the shared header and navigates to the parent page", async () => {
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", workspaceSlug, createBreadcrumbPages())
    );

    renderApp("/?workspace=product-docs&page=child", { listPages });

    await waitFor(() => {
      expect(listPages).toHaveBeenCalled();
    });
    const breadcrumbs = await screen.findByRole("navigation", { name: "Page breadcrumbs" });
    expect(within(breadcrumbs).getByRole("button", { name: "Overview" })).toBeInTheDocument();
    expect(breadcrumbs).toHaveTextContent("Overview");
    expect(breadcrumbs).toHaveTextContent("Child");
    const main = screen.getByRole("main", { name: "Child Draft" });
    expect(within(main).getByRole("heading", { level: 1, name: "Child Draft" })).toBeInTheDocument();
    expect(within(main).queryByText("Overview")).not.toBeInTheDocument();

    fireEvent.click(within(breadcrumbs).getByRole("button", { name: "Overview" }));

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Page breadcrumbs" })).toBeInTheDocument();
  });

  it("applies the launcher route background class without changing the workspace route class contract", async () => {
    const launcherView = renderApp("/");

    const launcherApp = document.querySelector(".docsera-app");
    expect(launcherApp).toHaveClass("docsera-app--launcher");
    expect(document.querySelector(".docsera-launcher-screen")).toBeInTheDocument();
    expect(document.querySelector(".docsera-workspace")).not.toBeInTheDocument();

    launcherView.unmount();
    renderApp("/?workspace=product-docs");

    expect(document.querySelector(".docsera-app")).not.toHaveClass("docsera-app--launcher");
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(document.querySelector(".docsera-workspace")).toBeInTheDocument();
  });

  it("keeps the workspace shell nodes mounted across page and mode changes", async () => {
    renderApp("/?workspace=product-docs&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("retains the committed shell while same-workspace edit pages are loading and limits pending UI to the body", async () => {
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", workspaceSlug, [createPageRecord()])
    );

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { listPages });

    expect(await screen.findByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Workspace switcher: Product Docs" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
  });

  it("keeps shell geometry mounted while switching workspaces and shows only contained loading lines when delayed", async () => {
    renderApp("/?workspace=product-docs&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    const workspaceSwitcherButton = screen.getByRole("button", { name: "Workspace switcher: Product Docs" });
    await act(async () => {
      fireEvent.click(workspaceSwitcherButton);
    });

    expect(document.querySelector(".docsera-header")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });

  it("resets to live mode when switching workspaces from the header menu", async () => {
    seedRecentWorkspaceSlugs("api-docs");
    renderApp("/?workspace=product-docs&page=overview");

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    const editButton = screen.getByRole("button", { name: "Edit" });
    await act(async () => {
      fireEvent.click(editButton);
    });
    expect(await screen.findByRole("button", { name: "Page actions for Overview" })).toBeInTheDocument();

    const workspaceSwitcherButton = screen.getByRole("button", { name: "Workspace switcher: Product Docs" });
    await act(async () => {
      fireEvent.click(workspaceSwitcherButton);
    });
    const apiDocsMenuItem = await screen.findByRole("menuitem", { name: "API Docs" });
    await act(async () => {
      fireEvent.click(apiDocsMenuItem);
    });

    expect(await screen.findByRole("heading", { name: "API Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Page actions for API Overview" })).not.toBeInTheDocument();
  });

  it("opens Workspace Settings from the header and saves core settings through the workspace boundary", async () => {
    const saveWorkspaceSettings = vi.fn(async (input) => ({
      state: "succeeded" as const,
      workspace: createWorkspace({
        name: input.name,
        shortDescription: input.shortDescription,
        icon: input.icon,
        layout: input.layout
      })
    }));

    renderApp("/?workspace=product-docs&page=overview&mode=edit", { saveWorkspaceSettings });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));

    const panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    expect(within(panel).getByDisplayValue("Product Docs")).toBeInTheDocument();
    expect(within(panel).getByDisplayValue("Release notes and launch guidance.")).toBeInTheDocument();
    expect(within(panel).getByLabelText("Upload custom workspace icon", { selector: "input" })).toBeInTheDocument();

    fireEvent.change(within(panel).getByDisplayValue("Product Docs"), { target: { value: "Platform Docs" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Business" }));
    fireEvent.click(within(panel).getByRole("checkbox", { name: "Show table of contents" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));

    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1));
    expect(saveWorkspaceSettings).toHaveBeenCalledWith({
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001",
      name: "Platform Docs",
      shortDescription: "Release notes and launch guidance.",
      icon: { type: "builtin", key: "business", label: "Business" },
      layout: { tocVisible: false }
    });
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Workspace switcher: Platform Docs/i })).toBeInTheDocument();
  });

  it("opens Workspace Settings from Edit without changing mode, page context, or the edit lease", async () => {
    const pages = createBreadcrumbPages();
    const acquireWorkspaceEditLease = vi.fn(async () => ({
      changeSetId: "change-set-001",
      changeSetRevision: 9,
      heartbeatIntervalMs: 60_000,
      leaseToken: "workspace-lease-token",
      staleAfterMs: 300_000,
      state: "held" as const
    }));
    const releaseWorkspaceEditLease = vi.fn(async () => ({ state: "released" as const }));
    const listPages = vi.fn(async ({ mode, workspaceSlug }: { mode?: WorkspaceMode; workspaceSlug: string }) =>
      createPageListResult(mode === "edit" ? "edit" : "live", workspaceSlug, pages)
    );

    renderApp("/?workspace=product-docs&mode=edit&page=child", {
      acquireWorkspaceEditLease,
      listPages,
      releaseWorkspaceEditLease
    });

    expect(await screen.findByRole("heading", { name: "Child Draft" })).toBeInTheDocument();
    const acquireCountBeforeOpen = acquireWorkspaceEditLease.mock.calls.length;
    const releaseCountBeforeOpen = releaseWorkspaceEditLease.mock.calls.length;

    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));

    expect(await screen.findByRole("complementary", { name: "Workspace Settings" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Child Draft" })).toBeInTheDocument();
    expect(window.location.search).toContain("mode=edit");
    expect(window.location.search).toContain("page=child");
    expect(window.location.search).not.toContain("settings=1");
    expect(acquireWorkspaceEditLease).toHaveBeenCalledTimes(acquireCountBeforeOpen);
    expect(releaseWorkspaceEditLease).toHaveBeenCalledTimes(releaseCountBeforeOpen);

    fireEvent.click(screen.getByRole("button", { name: "Close workspace settings" }));

    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Child Draft" })).toBeInTheDocument();
    expect(acquireWorkspaceEditLease).toHaveBeenCalledTimes(acquireCountBeforeOpen);
    expect(releaseWorkspaceEditLease).toHaveBeenCalledTimes(releaseCountBeforeOpen);
  });

  it("previews Workspace Settings identity drafts in the header without changing canonical workspace data", async () => {
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:staged-workspace-icon")
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn()
    });
    const loadWorkspaceIcon = vi.fn(async () => new Blob(["persisted"], { type: "image/png" }));
    const uploadWorkspaceIcon = vi.fn(async () => ({
      icon: {
        type: "uploaded" as const,
        key: "wsi_staged",
        label: "Uploaded workspace icon",
        assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=wsi_staged"
      },
      state: "succeeded" as const
    }));
    const saveWorkspaceSettings = vi.fn(async () => {
      throw new Error("saveWorkspaceSettings should not be called before dismissal");
    });

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      loadWorkspaceIcon,
      saveWorkspaceSettings,
      uploadWorkspaceIcon
    });

    expect(await screen.findByRole("button", { name: /Workspace switcher: Product Docs/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const panel = await screen.findByRole("complementary", { name: "Workspace Settings" });

    fireEvent.change(within(panel).getByDisplayValue("Product Docs"), { target: { value: "Preview Docs" } });
    expect(screen.getByRole("button", { name: /Workspace switcher: Preview Docs/i })).toBeInTheDocument();
    expect(saveWorkspaceSettings).not.toHaveBeenCalled();

    fireEvent.change(within(panel).getByDisplayValue("Preview Docs"), { target: { value: "   " } });
    expect(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i })).toBeInTheDocument();

    fireEvent.change(within(panel).getByLabelText("Workspace name"), { target: { value: "Product Docs" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Business" }));
    expect(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }).querySelector("svg")).toBeInTheDocument();

    const file = new File(["icon"], "icon.png", { type: "image/png" });
    fireEvent.change(within(panel).getByLabelText("Upload custom workspace icon", { selector: "input" }), { target: { files: [file] } });

    await waitFor(() => expect(uploadWorkspaceIcon).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(document.querySelectorAll("img[src='blob:staged-workspace-icon']").length).toBeGreaterThanOrEqual(2));
    expect(loadWorkspaceIcon).not.toHaveBeenCalledWith(expect.objectContaining({ assetPath: "blob:staged-workspace-icon" }));
    expect(saveWorkspaceSettings).not.toHaveBeenCalled();

    await waitFor(() => expect(within(panel).getByRole("button", { name: "Close workspace settings" })).toBeEnabled());
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Workspace switcher: Preview Docs/i })).not.toBeInTheDocument();
  });

  it("opens Workspace Settings from a transient My Workspaces intent and canonicalizes the URL", async () => {
    renderApp("/?view=my-workspaces");

    expect(await screen.findByRole("heading", { name: "My Workspaces" })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("link", { name: "Settings" })[0]);

    expect(await screen.findByRole("complementary", { name: "Workspace Settings" })).toBeInTheDocument();
    await waitFor(() => expect(window.location.search).not.toContain("settings=1"));
  });

  it("does not open Workspace Settings for users without management capability", async () => {
    renderApp("/?workspace=product-docs&settings=1", {
      getWorkspace: vi.fn(async () => ({
        workspace: createWorkspace({
          canManageSettings: false,
          roleLabel: "Editor"
        })
      }))
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Workspace settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument();
    await waitFor(() => expect(window.location.search).not.toContain("settings=1"));
  });

  it("closes unchanged Workspace Settings without mutation and saves valid changed drafts on close", async () => {
    const saveWorkspaceSettings = vi.fn(async (input) => ({
      state: "succeeded" as const,
      workspace: createWorkspace({ name: input.name })
    }));
    renderApp("/?workspace=product-docs&mode=edit&page=overview", { saveWorkspaceSettings });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    let panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    expect(saveWorkspaceSettings).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Workspace settings" }));
    panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    expect(within(panel).getByDisplayValue("Product Docs")).toBeInTheDocument();
    fireEvent.change(within(panel).getByDisplayValue("Product Docs"), { target: { value: "Renamed Docs" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1));
    expect(saveWorkspaceSettings.mock.calls[0][0].name).toBe("Renamed Docs");
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument());
  });

  it("opens Manage access from Workspace Settings only for member managers and lists searchable members", async () => {
    const listWorkspaceMembers = vi.fn(async () => ({
      callerCapabilities: {
        canManageWorkspaceMembers: true
      },
      members: [
        createMember({ accessLevel: "admin", displayName: "Admin One", email: "admin@example.com", userSysId: "user-admin" }),
        createMember({ active: false, displayName: "Inactive Editor", email: "inactive@example.com", userSysId: "user-inactive" })
      ],
      state: "succeeded" as const
    }));

    renderApp("/?workspace=product-docs&page=overview&mode=edit", { listWorkspaceMembers });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const settings = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.click(within(settings).getByRole("button", { name: "Manage workspace access" }));

    const pane = await screen.findByRole("complementary", { name: "Manage access" });
    expect(within(pane).getByRole("heading", { name: "Manage access" })).toBeInTheDocument();
    expect(within(pane).queryByText("Members")).not.toBeInTheDocument();
    expect(within(pane).getByRole("button", { name: "Back to workspace settings" })).toBeInTheDocument();
    expect(within(pane).getByText("2 members")).toBeInTheDocument();
    expect(within(pane).getByText("ROLE")).toBeInTheDocument();
    expect(within(pane).getByText("AO")).toBeInTheDocument();
    expect(within(pane).getByText("IE")).toBeInTheDocument();
    expect(within(pane).getByText("Admin One")).toBeInTheDocument();
    expect(within(pane).getByText(/Inactive Editor/)).toBeInTheDocument();
    expect(within(pane).getByText(/inactive/)).toBeInTheDocument();
    expect(within(pane).getByText("Admins change settings and manage access. Editors can create and edit documents.")).toBeInTheDocument();

    expect(within(pane).getByPlaceholderText("Filter member list")).toHaveAccessibleName("Filter member list");
    expect(within(pane).queryByRole("textbox", { name: "Search members" })).not.toBeInTheDocument();
    fireEvent.change(within(pane).getByRole("textbox", { name: "Filter member list" }), { target: { value: "admin@example.com" } });
    expect(within(pane).getByText("Admin One")).toBeInTheDocument();
    expect(within(pane).queryByText("Inactive Editor")).not.toBeInTheDocument();
  });

  it("uses shared tooltips for compact Manage Access controls", async () => {
    const listWorkspaceMembers = vi.fn(async () => ({
      callerCapabilities: { canManageWorkspaceMembers: true },
      members: [createMember({ accessLevel: "admin", displayName: "Admin One", userSysId: "user-admin" })],
      state: "succeeded" as const
    }));
    const searchWorkspaceMemberUsers = vi.fn(async () => ({
      callerCapabilities: { canManageWorkspaceMembers: true },
      state: "succeeded" as const,
      users: [{ displayName: "New Editor", email: "new@example.com", userName: "new.editor", userSysId: "user-new" }]
    }));

    renderApp("/?workspace=product-docs&page=overview&mode=edit", { listWorkspaceMembers, searchWorkspaceMemberUsers });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    fireEvent.click(within(await screen.findByRole("complementary", { name: "Workspace Settings" })).getByRole("button", { name: "Manage workspace access" }));

    const pane = await screen.findByRole("complementary", { name: "Manage access" });
    const manageAccessBack = within(pane).getByRole("button", { name: "Back to workspace settings" });
    const manageAccessClose = within(pane).getByRole("button", { name: "Close manage access" });
    expect(manageAccessBack).not.toHaveAttribute("title");
    expect(manageAccessClose).not.toHaveAttribute("title");
    fireEvent.focus(manageAccessBack);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Back to workspace settings");
    expect(manageAccessBack).toHaveAccessibleName("Back to workspace settings");
    fireEvent.blur(manageAccessBack);
    fireEvent.focus(manageAccessClose);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Close manage access");
    expect(manageAccessClose).toHaveAccessibleName("Close manage access");

    fireEvent.blur(manageAccessClose);
    fireEvent.click(within(pane).getByRole("button", { name: "Add members" }));
    const dialog = await screen.findByRole("dialog", { name: "Add members" });
    const addMembersClose = within(dialog).getByRole("button", { name: "Close add members" });
    const stageButton = within(dialog).getByRole("button", { name: "Stage selected users" });
    const unstageButton = within(dialog).getByRole("button", { name: "Remove selected staged members" });

    expect(addMembersClose).not.toHaveAttribute("title");
    expect(stageButton).toBeDisabled();
    expect(stageButton).not.toHaveAttribute("title");
    expect(unstageButton).toBeDisabled();
    expect(unstageButton).not.toHaveAttribute("title");

    fireEvent.focus(addMembersClose);
    expect(await screen.findByRole("tooltip")).toHaveTextContent("Close add members");
    expect(addMembersClose).toHaveAccessibleName("Close add members");
  });

  it("returns from Manage access with Back and dismisses both panels with Close", async () => {
    const listWorkspaceMembers = vi.fn(async () => ({
      callerCapabilities: { canManageWorkspaceMembers: true },
      members: [createMember({ accessLevel: "admin", displayName: "Admin One", userSysId: "user-admin" })],
      state: "succeeded" as const
    }));

    renderApp("/?workspace=product-docs&page=overview&mode=edit", { listWorkspaceMembers });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    fireEvent.click(within(await screen.findByRole("complementary", { name: "Workspace Settings" })).getByRole("button", { name: "Manage workspace access" }));
    let pane = await screen.findByRole("complementary", { name: "Manage access" });
    fireEvent.click(within(pane).getByRole("button", { name: "Back to workspace settings" }));
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Manage access" })).not.toBeInTheDocument());
    expect(screen.getByRole("complementary", { name: "Workspace Settings" })).toBeInTheDocument();

    fireEvent.click(within(screen.getByRole("complementary", { name: "Workspace Settings" })).getByRole("button", { name: "Manage workspace access" }));
    pane = await screen.findByRole("complementary", { name: "Manage access" });
    fireEvent.click(within(pane).getByRole("button", { name: "Close manage access" }));
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Manage access" })).not.toBeInTheDocument());
    expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument();
  });

  it("reserves scrollbar gutter in the Manage access scroll body", () => {
    const nodeProcess = new Function("return process")() as {
      cwd: () => string;
      getBuiltinModule: (name: string) => { readFileSync: (path: string, encoding: string) => string };
    };
    const source = nodeProcess.getBuiltinModule("fs").readFileSync(
      `${nodeProcess.cwd()}/src/client/styles/runtime-shell.css`,
      "utf8"
    );
    const bodyBlock = source.match(/\.docsera-manage-access__body \{([\s\S]*?)\n\}/)?.[1] ?? "";

    expect(bodyBlock).toContain("overflow: auto;");
    expect(bodyBlock).toContain("scrollbar-gutter: stable;");
  });

  it("dismisses Manage access on outside pointer-down without closing for inside-panel or nested modal interaction", async () => {
    const listWorkspaceMembers = vi.fn(async () => ({
      callerCapabilities: { canManageWorkspaceMembers: true },
      members: [
        createMember({ accessLevel: "admin", displayName: "Admin One", userSysId: "user-admin" }),
        createMember({ accessLevel: "editor", displayName: "Editor One", userSysId: "user-editor" })
      ],
      state: "succeeded" as const
    }));
    const searchWorkspaceMemberUsers = vi.fn(async () => ({
      callerCapabilities: { canManageWorkspaceMembers: true },
      state: "succeeded" as const,
      users: [{ displayName: "New Editor", email: "new@example.com", userName: "new.editor", userSysId: "user-new" }]
    }));

    renderApp("/?workspace=product-docs&page=overview&mode=edit", { listWorkspaceMembers, searchWorkspaceMemberUsers });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    fireEvent.click(within(await screen.findByRole("complementary", { name: "Workspace Settings" })).getByRole("button", { name: "Manage workspace access" }));
    let pane = await screen.findByRole("complementary", { name: "Manage access" });

    fireEvent.pointerDown(pane);
    expect(screen.getByRole("complementary", { name: "Manage access" })).toBeInTheDocument();

    fireEvent.click(within(pane).getByRole("button", { name: "Add members" }));
    expect(await screen.findByRole("dialog", { name: "Add members" })).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Workspace switcher: Product Docs" }));
    expect(screen.getByRole("dialog", { name: "Add members" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Manage access" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add members" })).not.toBeInTheDocument());
    expect(screen.getByRole("complementary", { name: "Manage access" })).toBeInTheDocument();

    pane = screen.getByRole("complementary", { name: "Manage access" });
    fireEvent.click(within(pane).getAllByRole("button", { name: /Remove access for/ }).find((button) => !button.hasAttribute("disabled"))!);
    expect(await screen.findByRole("dialog", { name: "Remove access" })).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("button", { name: "Workspace switcher: Product Docs" }));
    expect(screen.getByRole("dialog", { name: "Remove access" })).toBeInTheDocument();
    expect(screen.getByRole("complementary", { name: "Manage access" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Remove access" })).not.toBeInTheDocument());
    expect(screen.getByRole("complementary", { name: "Manage access" })).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Workspace switcher: Product Docs" }));
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Manage access" })).not.toBeInTheDocument());
  });

  it("waits for a valid Workspace Settings save before opening Manage access", async () => {
    const deferredSave = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>>>();
    const saveWorkspaceSettings = vi.fn<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>(() => deferredSave.promise);
    const listWorkspaceMembers = vi.fn(async () => ({
      callerCapabilities: { canManageWorkspaceMembers: true },
      members: [createMember({ accessLevel: "admin", displayName: "Admin One", userSysId: "user-admin" })],
      state: "succeeded" as const
    }));

    renderApp("/?workspace=product-docs&page=overview&mode=edit", { listWorkspaceMembers, saveWorkspaceSettings });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const settings = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(settings).getByDisplayValue("Product Docs"), { target: { value: "Access Docs" } });
    fireEvent.click(within(settings).getByRole("button", { name: "Manage workspace access" }));

    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("complementary", { name: "Manage access" })).not.toBeInTheDocument();

    await act(async () => {
      deferredSave.resolve({ state: "succeeded", workspace: createWorkspace({ name: "Access Docs" }) });
      await deferredSave.promise;
    });

    expect(await screen.findByRole("complementary", { name: "Manage access" })).toBeInTheDocument();
    expect(listWorkspaceMembers).toHaveBeenCalled();
  });

  it("does not open Manage access for another workspace when a deferred settings save resolves after navigation", async () => {
    seedRecentWorkspaceSlugs("api-docs");
    const deferredSave = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>>>();
    const workspaces: Record<string, WorkspaceViewRecord> = {
      "api-docs": createWorkspace({ sysId: "workspace-002", slug: "api-docs", name: "API Docs" }),
      "product-docs": createWorkspace()
    };
    const getWorkspace = vi.fn(async (workspaceSlug: string) => ({ workspace: workspaces[workspaceSlug] ?? null }));
    const listWorkspaces = vi.fn(async (): Promise<WorkspaceListResult> => ({
      canCreateWorkspaces: true,
      hasNextPage: false,
      items: [workspaces["product-docs"], workspaces["api-docs"]],
      page: 1,
      pageSize: 10,
      searchText: "",
      totalCount: 2
    }));
    const saveWorkspaceSettings = vi.fn<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>(() => deferredSave.promise);
    const listWorkspaceMembers = vi.fn(async () => ({
      callerCapabilities: { canManageWorkspaceMembers: true },
      members: [createMember({ accessLevel: "admin", displayName: "Admin One", userSysId: "user-admin" })],
      state: "succeeded" as const
    }));

    renderApp("/?workspace=product-docs&page=overview&mode=edit", { getWorkspace, listWorkspaceMembers, listWorkspaces, saveWorkspaceSettings });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const settings = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(settings).getByDisplayValue("Product Docs"), { target: { value: "Access Docs" } });
    fireEvent.click(within(settings).getByRole("button", { name: "Manage workspace access" }));

    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("complementary", { name: "Manage access" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Access Docs/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "API Docs" }));
    expect(await screen.findByRole("heading", { name: "API Overview" })).toBeInTheDocument();

    await act(async () => {
      workspaces["product-docs"] = createWorkspace({ name: "Access Docs" });
      deferredSave.resolve({ state: "succeeded", workspace: workspaces["product-docs"] });
      await deferredSave.promise;
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "Workspace switcher: API Docs" })).toBeInTheDocument());
    expect(screen.queryByRole("complementary", { name: "Manage access" })).not.toBeInTheDocument();
    expect(listWorkspaceMembers).not.toHaveBeenCalled();
  });

  it("loads eligible users immediately, searches from the server, and stages selected users with independent access levels", async () => {
    const getWorkspace = vi.fn(async () => ({ workspace: createWorkspace() }));
    const listWorkspaceMembers = vi.fn(async () => ({
      callerCapabilities: { canManageWorkspaceMembers: true },
      members: [createMember({ accessLevel: "admin", displayName: "Admin One", userSysId: "user-admin" })],
      state: "succeeded" as const
    }));
    const searchWorkspaceMemberUsers = vi.fn(async (input: { excludedUserSysIds?: string[]; term: string }) => {
      const users = input.term === "admin"
        ? [{ displayName: "New Admin", email: "admin@example.com", userName: "new.admin", userSysId: "user-new-admin" }]
        : [
            { displayName: "New Editor", email: "new@example.com", userName: "new.editor", userSysId: "user-new" },
            { displayName: "New Writer", email: "writer@example.com", userName: "new.writer", userSysId: "user-writer" },
            { displayName: "New Admin", email: "admin@example.com", userName: "new.admin", userSysId: "user-new-admin" },
            ...Array.from({ length: 7 }, (_, index) => ({
              displayName: `Paged User ${index + 1}`,
              email: `paged-${index + 1}@example.com`,
              userName: `paged.${index + 1}`,
              userSysId: `user-paged-${index + 1}`
            }))
          ];
      return {
        callerCapabilities: { canManageWorkspaceMembers: true },
        state: "succeeded" as const,
        users: users.filter((user) => !(input.excludedUserSysIds ?? []).includes(user.userSysId))
      };
    });
    const setWorkspaceMemberAccess = vi.fn(async () => ({
      callerCapabilities: { canManageWorkspaceMembers: true },
      members: [],
      state: "succeeded" as const
    }));

    renderApp("/?workspace=product-docs&page=overview&mode=edit", { getWorkspace, listWorkspaceMembers, searchWorkspaceMemberUsers, setWorkspaceMemberAccess });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    fireEvent.click(within(await screen.findByRole("complementary", { name: "Workspace Settings" })).getByRole("button", { name: "Manage workspace access" }));
    const pane = await screen.findByRole("complementary", { name: "Manage access" });
    fireEvent.click(within(pane).getByRole("button", { name: "Add members" }));
    const dialog = await screen.findByRole("dialog", { name: "Add members" });
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();
    expect(within(dialog).getByRole("heading", { name: "Users" })).toBeInTheDocument();
    expect(dialog.querySelector(".docsera-manage-access__list-align-spacer")).toBeInTheDocument();
    expect(within(dialog).queryByText("Search active users")).not.toBeInTheDocument();
    expect(within(dialog).queryByText("Searching users...")).not.toBeInTheDocument();
    expect(await within(dialog).findByRole("option", { name: /New Editor/ })).toBeInTheDocument();
    expect(searchWorkspaceMemberUsers).toHaveBeenCalledWith({
      excludedUserSysIds: [],
      term: "",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    });
    const usersList = within(dialog).getByRole("listbox", { name: "Users" });
    Object.defineProperty(usersList, "clientHeight", { configurable: true, value: 100 });
    Object.defineProperty(usersList, "scrollHeight", { configurable: true, value: 100 });
    Object.defineProperty(usersList, "scrollTop", { configurable: true, value: 100 });
    fireEvent.scroll(usersList);
    await waitFor(() => expect(searchWorkspaceMemberUsers).toHaveBeenCalledWith({
      excludedUserSysIds: expect.arrayContaining(["user-new", "user-writer", "user-new-admin", "user-paged-7"]),
      term: "",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    }));

    const newEditorOption = within(dialog).getByRole("option", { name: /New Editor/ });
    const newWriterOption = within(dialog).getByRole("option", { name: /New Writer/ });
    const newAdminOption = within(dialog).getByRole("option", { name: /New Admin/ });
    fireEvent.click(newEditorOption);
    fireEvent.click(newAdminOption, { shiftKey: true });
    expect(newEditorOption).toHaveAttribute("aria-selected", "true");
    expect(newWriterOption).toHaveAttribute("aria-selected", "true");
    expect(newAdminOption).toHaveAttribute("aria-selected", "true");
    fireEvent.click(newEditorOption);
    fireEvent.click(newWriterOption, { ctrlKey: true });
    expect(setWorkspaceMemberAccess).not.toHaveBeenCalled();
    expect(newEditorOption).toHaveAttribute("aria-selected", "true");
    expect(newWriterOption).toHaveAttribute("aria-selected", "true");
    fireEvent.click(within(dialog).getByRole("button", { name: "Stage selected users" }));
    expect(within(dialog).getByText("New Editor")).toBeInTheDocument();
    expect(within(dialog).getByText("New Writer")).toBeInTheDocument();
    expect(within(usersList).queryByRole("option", { name: /New Editor/ })).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByPlaceholderText("Search"), { target: { value: "admin" } });
    await waitFor(() => expect(searchWorkspaceMemberUsers).toHaveBeenLastCalledWith({
      excludedUserSysIds: [],
      term: "admin",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    }));
    expect(within(dialog).getByText("New Editor")).toBeInTheDocument();
    fireEvent.click(await within(dialog).findByRole("option", { name: /New Admin/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Stage selected users" }));
    fireEvent.change(within(dialog).getByLabelText("Access level for New Admin"), { target: { value: "admin" } });
    expect(within(dialog).getByText("New Admin").closest(".docsera-manage-access__staged-member")).not.toHaveAttribute("aria-selected", "true");

    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(setWorkspaceMemberAccess).toHaveBeenCalledWith({
      accessLevel: "editor",
      userSysId: "user-new",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    }));
    expect(setWorkspaceMemberAccess).toHaveBeenCalledWith({
      accessLevel: "editor",
      userSysId: "user-writer",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    });
    expect(setWorkspaceMemberAccess).toHaveBeenCalledWith({
      accessLevel: "admin",
      userSysId: "user-new-admin",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    });
    await waitFor(() => expect(getWorkspace).toHaveBeenCalledWith("product-docs"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add members" })).not.toBeInTheDocument());
  });

  it("moves staged users back and discards staging on cancel without mutating membership", async () => {
    const listWorkspaceMembers = vi.fn(async () => ({
      callerCapabilities: { canManageWorkspaceMembers: true },
      members: [createMember({ accessLevel: "admin", displayName: "Admin One", userSysId: "user-admin" })],
      state: "succeeded" as const
    }));
    const searchWorkspaceMemberUsers = vi.fn(async () => ({
      callerCapabilities: { canManageWorkspaceMembers: true },
      state: "succeeded" as const,
      users: [
        { displayName: "New Editor", email: "new@example.com", userName: "new.editor", userSysId: "user-new" },
        { displayName: "Second Editor", email: "second@example.com", userName: "second.editor", userSysId: "user-second" }
      ]
    }));
    const setWorkspaceMemberAccess = vi.fn();

    renderApp("/?workspace=product-docs&page=overview&mode=edit", { listWorkspaceMembers, searchWorkspaceMemberUsers, setWorkspaceMemberAccess });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    fireEvent.click(within(await screen.findByRole("complementary", { name: "Workspace Settings" })).getByRole("button", { name: "Manage workspace access" }));
    const pane = await screen.findByRole("complementary", { name: "Manage access" });
    fireEvent.click(within(pane).getByRole("button", { name: "Add members" }));
    let dialog = await screen.findByRole("dialog", { name: "Add members" });
    fireEvent.click(await within(dialog).findByRole("option", { name: /New Editor/ }));
    fireEvent.click(within(dialog).getByRole("option", { name: /Second Editor/ }), { shiftKey: true });
    fireEvent.click(within(dialog).getByRole("button", { name: "Stage selected users" }));
    expect(within(dialog).queryByRole("button", { name: /Remove New Editor from members to add/ })).not.toBeInTheDocument();
    const stagedList = dialog.querySelector<HTMLElement>(".docsera-manage-access__staged-list");
    expect(stagedList).toBeInTheDocument();
    fireEvent.click(within(stagedList!).getByRole("option", { name: /New Editor/ }));
    fireEvent.click(within(stagedList!).getByRole("option", { name: /Second Editor/ }), { shiftKey: true });
    expect(within(stagedList!).getByRole("option", { name: /New Editor/ })).toHaveAttribute("aria-selected", "true");
    expect(within(stagedList!).getByRole("option", { name: /Second Editor/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove selected staged members" }));
    expect(within(stagedList!).queryByText("New Editor")).not.toBeInTheDocument();
    expect(within(stagedList!).queryByText("Second Editor")).not.toBeInTheDocument();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeDisabled();

    fireEvent.click(await within(dialog).findByRole("option", { name: /New Editor/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Stage selected users" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(setWorkspaceMemberAccess).not.toHaveBeenCalled();

    fireEvent.click(within(pane).getByRole("button", { name: "Add members" }));
    dialog = await screen.findByRole("dialog", { name: "Add members" });
    expect(within(dialog).queryByText("New Editor")).not.toBeInTheDocument();
  });

  it("shows the established busy spinner on the Add members primary action while add submission is running", async () => {
    const deferredAdd = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["setWorkspaceMemberAccess"]>>>>();
    const getWorkspace = vi.fn(async () => ({ workspace: createWorkspace() }));
    const listWorkspaceMembers = vi.fn(async () => ({
      callerCapabilities: { canManageWorkspaceMembers: true },
      members: [createMember({ accessLevel: "admin", displayName: "Admin One", userSysId: "user-admin" })],
      state: "succeeded" as const
    }));
    const searchWorkspaceMemberUsers = vi.fn(async () => ({
      callerCapabilities: { canManageWorkspaceMembers: true },
      state: "succeeded" as const,
      users: [{ displayName: "New Editor", email: "new@example.com", userName: "new.editor", userSysId: "user-new" }]
    }));
    const setWorkspaceMemberAccess = vi.fn<NonNullable<ServiceNowClient["setWorkspaceMemberAccess"]>>(() => deferredAdd.promise);

    renderApp("/?workspace=product-docs&page=overview&mode=edit", { getWorkspace, listWorkspaceMembers, searchWorkspaceMemberUsers, setWorkspaceMemberAccess });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    fireEvent.click(within(await screen.findByRole("complementary", { name: "Workspace Settings" })).getByRole("button", { name: "Manage workspace access" }));
    fireEvent.click(within(await screen.findByRole("complementary", { name: "Manage access" })).getByRole("button", { name: "Add members" }));
    const dialog = await screen.findByRole("dialog", { name: "Add members" });
    fireEvent.click(await within(dialog).findByRole("option", { name: /New Editor/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Stage selected users" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    const addButton = within(dialog).getByRole("button", { name: "Save" });
    expect(addButton).toBeDisabled();
    expect(addButton).toHaveAttribute("aria-busy", "true");
    expect(addButton).toHaveTextContent("Save");
    expect(addButton.querySelector(".docsera-create-workspace-modal__primary-spinner")).toBeInTheDocument();
    expect(addButton.querySelector(".docsera-changes-center__spinner")).toBeInTheDocument();

    await act(async () => {
      deferredAdd.resolve({ callerCapabilities: { canManageWorkspaceMembers: true }, members: [], state: "succeeded" });
      await deferredAdd.promise;
    });

    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Add members" })).not.toBeInTheDocument());
    expect(getWorkspace).toHaveBeenCalledWith("product-docs");
  });

  it("keeps failed staged additions visible with row feedback after successful additions refresh", async () => {
    const blockedAdd = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["setWorkspaceMemberAccess"]>>>>();
    const getWorkspace = vi.fn(async () => ({ workspace: createWorkspace() }));
    const listWorkspaceMembers = vi.fn(async () => ({
      callerCapabilities: { canManageWorkspaceMembers: true },
      members: [createMember({ accessLevel: "admin", displayName: "Admin One", userSysId: "user-admin" })],
      state: "succeeded" as const
    }));
    const searchWorkspaceMemberUsers = vi.fn(async () => ({
      callerCapabilities: { canManageWorkspaceMembers: true },
      state: "succeeded" as const,
      users: [
        { displayName: "New Editor", email: "new@example.com", userName: "new.editor", userSysId: "user-new" },
        { displayName: "Blocked Editor", email: "blocked@example.com", userName: "blocked.editor", userSysId: "user-blocked" }
      ]
    }));
    const setWorkspaceMemberAccess = vi.fn((input: { userSysId: string }) => input.userSysId === "user-blocked"
      ? blockedAdd.promise
      : Promise.resolve({ callerCapabilities: { canManageWorkspaceMembers: true }, members: [], state: "succeeded" as const })
    );

    renderApp("/?workspace=product-docs&page=overview&mode=edit", { getWorkspace, listWorkspaceMembers, searchWorkspaceMemberUsers, setWorkspaceMemberAccess });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    fireEvent.click(within(await screen.findByRole("complementary", { name: "Workspace Settings" })).getByRole("button", { name: "Manage workspace access" }));
    fireEvent.click(within(await screen.findByRole("complementary", { name: "Manage access" })).getByRole("button", { name: "Add members" }));
    const dialog = await screen.findByRole("dialog", { name: "Add members" });
    fireEvent.click(await within(dialog).findByRole("option", { name: /New Editor/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Stage selected users" }));
    fireEvent.click(within(dialog).getByRole("option", { name: /Blocked Editor/ }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Stage selected users" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));

    const addButton = within(dialog).getByRole("button", { name: "Save" });
    await waitFor(() => expect(addButton).toHaveAttribute("aria-busy", "true"));
    expect(addButton.querySelector(".docsera-changes-center__spinner")).toBeInTheDocument();

    await act(async () => {
      blockedAdd.resolve({ errorMessage: "Blocked Editor could not be added.", state: "failed" });
      await blockedAdd.promise;
    });

    const stagedList = dialog.querySelector<HTMLElement>(".docsera-manage-access__staged-list");
    expect(stagedList).toBeInTheDocument();
    await waitFor(() => expect(within(stagedList!).queryByText("New Editor")).not.toBeInTheDocument());
    expect(within(dialog).getByText("Blocked Editor")).toBeInTheDocument();
    expect(within(dialog).getByText("Blocked Editor could not be added.")).toBeInTheDocument();
    await waitFor(() => expect(addButton).not.toHaveAttribute("aria-busy"));
    expect(addButton).toBeEnabled();
    expect(addButton.querySelector(".docsera-changes-center__spinner")).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Add members" })).toBeInTheDocument();
    await waitFor(() => expect(getWorkspace).toHaveBeenCalledWith("product-docs"));
  });

  it("removes an existing member through the confirmation dialog and refreshes capabilities", async () => {
    const getWorkspace = vi.fn(async () => ({ workspace: createWorkspace() }));
    const listWorkspaceMembers = vi.fn(async () => ({
      callerCapabilities: { canManageWorkspaceMembers: true },
      members: [
        createMember({ accessLevel: "admin", displayName: "Admin One", userSysId: "user-admin" }),
        createMember({ accessLevel: "editor", displayName: "Editor One", userSysId: "user-editor" })
      ],
      state: "succeeded" as const
    }));
    const removeWorkspaceMemberAccess = vi.fn(async () => ({
      callerCapabilities: { canManageWorkspaceMembers: true },
      members: [],
      state: "succeeded" as const
    }));

    renderApp("/?workspace=product-docs&page=overview&mode=edit", { getWorkspace, listWorkspaceMembers, removeWorkspaceMemberAccess });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    fireEvent.click(within(await screen.findByRole("complementary", { name: "Workspace Settings" })).getByRole("button", { name: "Manage workspace access" }));
    const pane = await screen.findByRole("complementary", { name: "Manage access" });
    const editorRow = within(pane).getByText("Editor One").closest(".docsera-manage-access__member");
    expect(editorRow).toBeInTheDocument();
    fireEvent.click(within(editorRow as HTMLElement).getByRole("button", { name: "Remove access for Editor One" }));
    const dialog = await screen.findByRole("dialog", { name: "Remove access" });
    expect(dialog.closest(".docsera-modal--top-biased")).toBeInTheDocument();
    expect(dialog.querySelector(".docsera-modal__form")).toBeInTheDocument();
    expect(dialog.querySelector(".docsera-modal__header")).toBeInTheDocument();
    expect(dialog.querySelector(".docsera-modal__body")).toBeInTheDocument();
    expect(dialog.querySelector(".docsera-modal__footer")).toBeInTheDocument();
    expect(within(dialog).getByText(/Remove workspace access for Editor One/)).toHaveClass("docsera-modal__copy--warning");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove access" }));

    await waitFor(() => expect(removeWorkspaceMemberAccess).toHaveBeenCalledWith({
      userSysId: "user-editor",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    }));
    await waitFor(() => expect(getWorkspace).toHaveBeenCalledWith("product-docs"));
  });

  it("protects the last active Workspace Admin until a second active Admin exists", async () => {
    const listWorkspaceMembers = vi
      .fn()
      .mockResolvedValueOnce({
        callerCapabilities: { canManageWorkspaceMembers: true },
        members: [createMember({ accessLevel: "admin", displayName: "Last Admin", userSysId: "user-admin" })],
        state: "succeeded"
      })
      .mockResolvedValue({
        callerCapabilities: { canManageWorkspaceMembers: true },
        members: [
          createMember({ accessLevel: "admin", displayName: "Last Admin", userSysId: "user-admin" }),
          createMember({ accessLevel: "admin", displayName: "Second Admin", userSysId: "user-second-admin" })
        ],
        state: "succeeded"
      });

    renderApp("/?workspace=product-docs&page=overview&mode=edit", { listWorkspaceMembers });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    fireEvent.click(within(await screen.findByRole("complementary", { name: "Workspace Settings" })).getByRole("button", { name: "Manage workspace access" }));
    let pane = await screen.findByRole("complementary", { name: "Manage access" });
    expect(within(pane).getByText("Last active Admin")).toBeInTheDocument();
    expect(within(pane).getByRole("button", { name: "Remove access for Last Admin" })).toBeDisabled();
    expect(within(pane).getByLabelText("Access level for Last Admin")).toBeDisabled();

    fireEvent.click(within(pane).getByRole("button", { name: "Back to workspace settings" }));
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    fireEvent.click(within(await screen.findByRole("complementary", { name: "Workspace Settings" })).getByRole("button", { name: "Manage workspace access" }));
    pane = await screen.findByRole("complementary", { name: "Manage access" });
    await waitFor(() => expect(within(pane).getAllByRole("button", { name: /Remove access for/ })[0]).toBeEnabled());
    expect(within(pane).getByLabelText("Access level for Last Admin")).toBeEnabled();
  });

  it("finishes Workspace Settings from the real outside surface without dismissing inside-panel interaction", async () => {
    const saveWorkspaceSettings = vi.fn(async (input) => ({
      state: "succeeded" as const,
      workspace: createWorkspace({ name: input.name })
    }));
    renderApp("/?workspace=product-docs&mode=edit&page=overview", { saveWorkspaceSettings });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(panel).getByDisplayValue("Product Docs"), { target: { value: "Outside Saved Docs" } });
    fireEvent.pointerDown(panel);
    expect(screen.getByRole("complementary", { name: "Workspace Settings" })).toBeInTheDocument();
    expect(saveWorkspaceSettings).not.toHaveBeenCalled();

    fireEvent.pointerDown(screen.getByRole("button", { name: "Workspace switcher: Outside Saved Docs" }));
    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1));
    expect(saveWorkspaceSettings.mock.calls[0][0].name).toBe("Outside Saved Docs");
    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument());
  });

  it("keeps failed Workspace Settings drafts dismissed and restores them on reopen", async () => {
    const saveWorkspaceSettings = vi.fn(async () => ({
      errorMessage: "Use a different workspace name.",
      state: "failed" as const
    }));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { saveWorkspaceSettings });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(panel).getByDisplayValue("Product Docs"), { target: { value: "Taken Docs" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));

    await waitFor(() => expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    fireEvent.click(await screen.findByRole("button", { name: "Workspace settings" }));
    const reopenedPanel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    expect(await within(reopenedPanel).findByRole("alert")).toHaveTextContent("Use a different workspace name.");
    expect(within(reopenedPanel).getByDisplayValue("Taken Docs")).toBeInTheDocument();
  });

  it("preserves the current uploaded icon unless a built-in icon is selected", async () => {
    const uploadedWorkspace = createWorkspace({
      icon: {
        type: "uploaded",
        key: "custom",
        label: "Custom docs",
        assetPath: "/api/x_82900_docsera/icon/custom"
      }
    });
    const loadWorkspaceIcon = vi.fn(async () => new Blob(["icon"], { type: "image/png" }));
    const saveWorkspaceSettings = vi.fn(async (input) => ({
      state: "succeeded" as const,
      workspace: createWorkspace({
        ...uploadedWorkspace,
        name: input.name,
        icon: input.icon ?? uploadedWorkspace.icon
      })
    }));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      getWorkspace: vi.fn(async () => ({ workspace: uploadedWorkspace })),
      loadWorkspaceIcon,
      saveWorkspaceSettings
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    await waitFor(() => expect(loadWorkspaceIcon).toHaveBeenCalledWith({
      assetPath: "/api/x_82900_docsera/icon/custom",
      signal: expect.any(AbortSignal)
    }));
    fireEvent.change(within(panel).getByDisplayValue("Product Docs"), { target: { value: "Uploaded Docs" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1));
    expect(saveWorkspaceSettings.mock.calls[0][0]).not.toHaveProperty("icon");

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Workspace settings" }));
    const reopenedPanel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.click(within(reopenedPanel).getByRole("button", { name: "Engineering" }));
    fireEvent.click(within(reopenedPanel).getByRole("button", { name: "Close workspace settings" }));
    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(2));
    expect(saveWorkspaceSettings.mock.calls[1][0].icon).toEqual({ type: "builtin", key: "engineering", label: "Engineering" });
  });

  it("keeps an uploaded icon form clean after selecting a built-in icon and then the persisted uploaded icon again", async () => {
    const uploadedWorkspace = createWorkspace({
      icon: {
        type: "uploaded",
        key: "custom",
        label: "Custom docs",
        assetPath: "/api/x_82900_docsera/icon/custom"
      }
    });

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      getWorkspace: vi.fn(async () => ({ workspace: uploadedWorkspace }))
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const panel = await screen.findByRole("complementary", { name: "Workspace Settings" });

    fireEvent.click(within(panel).getByRole("button", { name: "Engineering" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Custom docs, current uploaded icon" }));
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument();
  });

  it("blocks same-workspace Settings reopen while a dismissed save is pending and reconciles the save result", async () => {
    const deferredSave = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>>>();
    const saveWorkspaceSettings = vi.fn<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>(() => deferredSave.promise);

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { saveWorkspaceSettings });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(panel).getByDisplayValue("Product Docs"), { target: { value: "Pending Docs" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));

    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Workspace switcher: Pending Docs" })).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument();
    expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: "Workspace switcher: Pending Docs" })).toBeInTheDocument();

    await act(async () => {
      deferredSave.resolve({
        state: "succeeded" as const,
        workspace: createWorkspace({ name: "Pending Docs" })
      });
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Workspace switcher: Pending Docs" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Workspace switcher: Product Docs" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Workspace settings" }));
    const reopenedPanel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    expect(within(reopenedPanel).getByDisplayValue("Pending Docs")).toBeInTheDocument();
  });

  it("keeps a staged custom Workspace Settings icon visible throughout a dismissed pending save", async () => {
    const deferredSave = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>>>();
    const deferredCanonicalIcon = createDeferred<Blob | null>();
    const createObjectUrlSpy = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValueOnce("blob:staged-workspace-icon")
      .mockReturnValueOnce("blob:canonical-workspace-icon");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const loadWorkspaceIcon = vi.fn(() => deferredCanonicalIcon.promise);
    const uploadWorkspaceIcon = vi.fn(async () => ({
      icon: {
        type: "uploaded" as const,
        key: "wsi_staged",
        label: "staged.png",
        assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=wsi_staged"
      },
      state: "succeeded" as const
    }));
    const saveWorkspaceSettings = vi.fn<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>(() => deferredSave.promise);

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      loadWorkspaceIcon,
      saveWorkspaceSettings,
      uploadWorkspaceIcon
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(panel).getByLabelText("Upload custom workspace icon", { selector: "input" }), {
      target: { files: [new File(["image"], "staged.png", { type: "image/png" })] }
    });

    await waitFor(() => expect(uploadWorkspaceIcon).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }).querySelector("img[src='blob:staged-workspace-icon']")).toBeInTheDocument());
    expect(loadWorkspaceIcon).not.toHaveBeenCalledWith(expect.objectContaining({ assetPath: "blob:staged-workspace-icon" }));

    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));

    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1));
    expect(vi.mocked(saveWorkspaceSettings).mock.calls[0]?.[0].icon).toMatchObject({
      assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=wsi_staged",
      key: "wsi_staged",
      type: "uploaded"
    });
    expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument();
    const pendingHeader = screen.getByRole("button", { name: /Workspace switcher: Product Docs/i });
    expect(pendingHeader.querySelector("img[src='blob:staged-workspace-icon']")).toBeInTheDocument();
    expect(pendingHeader.querySelector(".docsera-workspace-icon-badge--uploaded")).toBeInTheDocument();
    expect(pendingHeader.querySelector(".docsera-workspace-icon-badge")?.textContent).toBe("");
    expect(revokeObjectUrlSpy).not.toHaveBeenCalledWith("blob:staged-workspace-icon");

    await act(async () => {
      deferredSave.resolve({
        state: "succeeded" as const,
        workspace: createWorkspace({
          icon: {
            type: "uploaded",
            key: "wsi_staged",
            label: "staged.png",
            assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=wsi_staged"
          }
        })
      });
      await Promise.resolve();
    });

    expect(loadWorkspaceIcon).toHaveBeenCalledWith({
      assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=wsi_staged",
      signal: expect.any(AbortSignal)
    });
    const canonicalLoadingHeader = screen.getByRole("button", { name: /Workspace switcher: Product Docs/i });
    expect(canonicalLoadingHeader.querySelector("img[src='blob:staged-workspace-icon']")).not.toBeInTheDocument();
    expect(canonicalLoadingHeader.querySelector(".docsera-workspace-icon-badge")?.textContent).toBe("");
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:staged-workspace-icon");

    await act(async () => {
      deferredCanonicalIcon.resolve(new Blob(["canonical"], { type: "image/png" }));
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }).querySelector("img[src='blob:canonical-workspace-icon']")).toBeInTheDocument());
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(2);
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:staged-workspace-icon");
  });

  it("releases a transferred Workspace Settings preview when switching workspaces before the pending save completes", async () => {
    seedRecentWorkspaceSlugs("api-docs");
    const deferredSave = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>>>();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:staged-workspace-icon");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const uploadWorkspaceIcon = vi.fn(async () => ({
      icon: {
        type: "uploaded" as const,
        key: "wsi_staged",
        label: "staged.png",
        assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=wsi_staged"
      },
      state: "succeeded" as const
    }));
    const saveWorkspaceSettings = vi.fn<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>(() => deferredSave.promise);

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      saveWorkspaceSettings,
      uploadWorkspaceIcon
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(panel).getByLabelText("Upload custom workspace icon", { selector: "input" }), {
      target: { files: [new File(["image"], "staged.png", { type: "image/png" })] }
    });
    await waitFor(() => expect(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }).querySelector("img[src='blob:staged-workspace-icon']")).toBeInTheDocument());

    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1));
    expect(revokeObjectUrlSpy).not.toHaveBeenCalledWith("blob:staged-workspace-icon");

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "API Docs" }));
    expect(await screen.findByRole("heading", { name: "API Overview" })).toBeInTheDocument();
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:staged-workspace-icon");

    await act(async () => {
      deferredSave.resolve({
        state: "succeeded" as const,
        workspace: createWorkspace({
          icon: {
            type: "uploaded",
            key: "wsi_staged",
            label: "staged.png",
            assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=wsi_staged"
          }
        })
      });
      await Promise.resolve();
    });

    expect(revokeObjectUrlSpy.mock.calls.filter(([value]) => value === "blob:staged-workspace-icon")).toHaveLength(1);
  });

  it("releases a transferred Workspace Settings preview when authenticated canonical icon loading fails", async () => {
    const deferredSave = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>>>();
    const deferredCanonicalIcon = createDeferred<Blob | null>();
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:staged-workspace-icon");
    const revokeObjectUrlSpy = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    const loadWorkspaceIcon = vi.fn(() => deferredCanonicalIcon.promise);
    const uploadWorkspaceIcon = vi.fn(async () => ({
      icon: {
        type: "uploaded" as const,
        key: "wsi_staged",
        label: "staged.png",
        assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=wsi_staged"
      },
      state: "succeeded" as const
    }));
    const saveWorkspaceSettings = vi.fn<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>(() => deferredSave.promise);

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      loadWorkspaceIcon,
      saveWorkspaceSettings,
      uploadWorkspaceIcon
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(panel).getByLabelText("Upload custom workspace icon", { selector: "input" }), {
      target: { files: [new File(["image"], "staged.png", { type: "image/png" })] }
    });
    await waitFor(() => expect(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }).querySelector("img[src='blob:staged-workspace-icon']")).toBeInTheDocument());

    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1));
    await act(async () => {
      deferredSave.resolve({
        state: "succeeded" as const,
        workspace: createWorkspace({
          icon: {
            type: "uploaded",
            key: "wsi_staged",
            label: "staged.png",
            assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=wsi_staged"
          }
        })
      });
      await Promise.resolve();
    });

    expect(screen.getByRole("button", { name: /Workspace switcher: Product Docs/i }).querySelector("img[src='blob:staged-workspace-icon']")).not.toBeInTheDocument();
    expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:staged-workspace-icon");

    await act(async () => {
      deferredCanonicalIcon.resolve(null);
      await Promise.resolve();
    });

    await waitFor(() => expect(revokeObjectUrlSpy).toHaveBeenCalledWith("blob:staged-workspace-icon"));
  });

  it("preserves a failed dismissed Workspace Settings save for same-workspace recovery after blocked reopen", async () => {
    const deferredSave = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>>>();
    const saveWorkspaceSettings = vi.fn(() => deferredSave.promise);

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { saveWorkspaceSettings });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(panel).getByDisplayValue("Product Docs"), { target: { value: "Failed Pending Docs" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));

    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: "Workspace switcher: Failed Pending Docs" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.queryByRole("complementary", { name: "Workspace Settings" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Workspace switcher: Failed Pending Docs" })).toBeInTheDocument();

    await act(async () => {
      deferredSave.resolve({
        errorMessage: "Settings save failed.",
        state: "failed" as const
      });
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Workspace switcher: Product Docs" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Workspace switcher: Failed Pending Docs" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(await screen.findByRole("button", { name: "Workspace settings" }));
    const reopenedPanel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    expect(await within(reopenedPanel).findByRole("alert")).toHaveTextContent("Settings save failed.");
    expect(within(reopenedPanel).getByDisplayValue("Failed Pending Docs")).toBeInTheDocument();
  });

  it("keeps concurrent dismissed Workspace Settings saves isolated across workspaces", async () => {
    seedRecentWorkspaceSlugs("api-docs");
    const saveA = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>>>();
    const saveB = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>>>();
    const workspaces: Record<string, WorkspaceViewRecord> = {
      "api-docs": createWorkspace({ sysId: "workspace-002", slug: "api-docs", name: "API Docs" }),
      "product-docs": createWorkspace()
    };
    const getWorkspace = vi.fn(async (workspaceSlug: string) => ({ workspace: workspaces[workspaceSlug] ?? null }));
    const listWorkspaces = vi.fn(async (): Promise<WorkspaceListResult> => ({
      canCreateWorkspaces: true,
      hasNextPage: false,
      items: [workspaces["product-docs"], workspaces["api-docs"]],
      page: 1,
      pageSize: 10,
      searchText: "",
      totalCount: 2
    }));
    const saveWorkspaceSettings = vi.fn((input) => (input.workspaceSysId === "workspace-001" ? saveA.promise : saveB.promise));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { getWorkspace, listWorkspaces, saveWorkspaceSettings });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    let panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(panel).getByDisplayValue("Product Docs"), { target: { value: "Workspace A Saved" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Workspace A Saved/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "API Docs" }));
    expect(await screen.findByRole("heading", { name: "API Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("button", { name: "Page actions for API Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(panel).getByDisplayValue("API Docs"), { target: { value: "Workspace B Saved" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(2));

    await act(async () => {
      workspaces["api-docs"] = createWorkspace({ sysId: "workspace-002", slug: "api-docs", name: "Workspace B Saved" });
      saveB.resolve({ state: "succeeded" as const, workspace: workspaces["api-docs"] });
      await Promise.resolve();
    });
    expect(screen.getByRole("button", { name: "Workspace switcher: Workspace B Saved" })).toBeInTheDocument();

    await act(async () => {
      workspaces["product-docs"] = createWorkspace({ name: "Workspace A Saved" });
      saveA.resolve({ state: "succeeded" as const, workspace: workspaces["product-docs"] });
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Workspace B Saved/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Workspace A Saved" }));
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("button", { name: "Page actions for Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    expect(within(panel).getByDisplayValue("Workspace A Saved")).toBeInTheDocument();
  });

  it("keeps another workspace's active Settings draft open when a dismissed save succeeds", async () => {
    seedRecentWorkspaceSlugs("api-docs");
    const saveA = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>>>();
    const workspaces: Record<string, WorkspaceViewRecord> = {
      "api-docs": createWorkspace({ sysId: "workspace-002", slug: "api-docs", name: "API Docs" }),
      "product-docs": createWorkspace()
    };
    const getWorkspace = vi.fn(async (workspaceSlug: string) => ({ workspace: workspaces[workspaceSlug] ?? null }));
    const listWorkspaces = vi.fn(async (): Promise<WorkspaceListResult> => ({
      canCreateWorkspaces: true,
      hasNextPage: false,
      items: [workspaces["product-docs"], workspaces["api-docs"]],
      page: 1,
      pageSize: 10,
      searchText: "",
      totalCount: 2
    }));
    const saveWorkspaceSettings = vi.fn((input) => {
      if (input.workspaceSysId === "workspace-001") {
        return saveA.promise;
      }

      throw new Error("Workspace B settings should remain as an open draft.");
    });

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { getWorkspace, listWorkspaces, saveWorkspaceSettings });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    let panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(panel).getByDisplayValue("Product Docs"), { target: { value: "Workspace A Saved" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Workspace A Saved/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "API Docs" }));
    expect(await screen.findByRole("heading", { name: "API Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("button", { name: "Page actions for API Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(panel).getByDisplayValue("API Docs"), { target: { value: "Workspace B Draft" } });

    await act(async () => {
      workspaces["product-docs"] = createWorkspace({ name: "Workspace A Saved" });
      saveA.resolve({ state: "succeeded" as const, workspace: workspaces["product-docs"] });
      await Promise.resolve();
    });

    panel = screen.getByRole("complementary", { name: "Workspace Settings" });
    expect(within(panel).getByDisplayValue("Workspace B Draft")).toBeInTheDocument();
    expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1);
  });

  it("keeps a failed dismissed Workspace Settings draft recoverable after another workspace saves", async () => {
    seedRecentWorkspaceSlugs("api-docs");
    const saveA = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>>>();
    const saveB = createDeferred<Awaited<ReturnType<NonNullable<ServiceNowClient["saveWorkspaceSettings"]>>>>();
    const workspaces: Record<string, WorkspaceViewRecord> = {
      "api-docs": createWorkspace({ sysId: "workspace-002", slug: "api-docs", name: "API Docs" }),
      "product-docs": createWorkspace()
    };
    const getWorkspace = vi.fn(async (workspaceSlug: string) => ({ workspace: workspaces[workspaceSlug] ?? null }));
    const saveWorkspaceSettings = vi.fn((input) => (input.workspaceSysId === "workspace-001" ? saveA.promise : saveB.promise));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { getWorkspace, saveWorkspaceSettings });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    let panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(panel).getByDisplayValue("Product Docs"), { target: { value: "Workspace A Failed Draft" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Workspace A Failed Draft/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "API Docs" }));
    expect(await screen.findByRole("heading", { name: "API Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("button", { name: "Page actions for API Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    fireEvent.change(within(panel).getByDisplayValue("API Docs"), { target: { value: "Workspace B Saved" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    await waitFor(() => expect(saveWorkspaceSettings).toHaveBeenCalledTimes(2));

    await act(async () => {
      workspaces["api-docs"] = createWorkspace({ sysId: "workspace-002", slug: "api-docs", name: "Workspace B Saved" });
      saveB.resolve({ state: "succeeded" as const, workspace: workspaces["api-docs"] });
      saveA.resolve({ errorMessage: "Workspace A failed.", state: "failed" as const });
      await Promise.resolve();
    });

    fireEvent.click(screen.getByRole("button", { name: /Workspace switcher: Workspace B Saved/i }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Product Docs" }));
    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByRole("button", { name: "Page actions for Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    expect(await within(panel).findByRole("alert")).toHaveTextContent("Workspace A failed.");
    expect(within(panel).getByDisplayValue("Workspace A Failed Draft")).toBeInTheDocument();
  });

  it("cleans abandoned settings-staged uploaded icons when replaced or dismissed for the canonical icon", async () => {
    Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:workspace-icon") });
    Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
    const cleanupWorkspaceSettingsIcon = vi.fn(async () => {
      throw new Error("cleanup failed");
    });
    const uploadWorkspaceIcon = vi
      .fn()
      .mockResolvedValueOnce({
        icon: { type: "uploaded" as const, key: "wsi_first", label: "first.png", assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=wsi_first" },
        state: "succeeded" as const
      })
      .mockResolvedValueOnce({
        icon: { type: "uploaded" as const, key: "wsi_second", label: "second.png", assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=wsi_second" },
        state: "succeeded" as const
      });

    renderApp("/?workspace=product-docs&mode=edit&page=overview", {
      cleanupWorkspaceSettingsIcon,
      uploadWorkspaceIcon
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    const fileInput = within(panel).getByLabelText("Upload custom workspace icon", { selector: "input" });
    fireEvent.change(fileInput, { target: { files: [new File(["one"], "first.png", { type: "image/png" })] } });
    await waitFor(() => expect(uploadWorkspaceIcon).toHaveBeenCalledTimes(1));
    await within(panel).findByRole("button", { name: /current uploaded icon, selected/ });
    fireEvent.change(fileInput, { target: { files: [new File(["two"], "second.png", { type: "image/png" })] } });
    await waitFor(() => expect(uploadWorkspaceIcon).toHaveBeenCalledTimes(2));
    expect(cleanupWorkspaceSettingsIcon).toHaveBeenCalledWith({ assetKey: "wsi_first", workspaceSysId: "workspace-001" });

    fireEvent.click(within(panel).getByRole("button", { name: "Docsera workspace icon" }));
    expect(cleanupWorkspaceSettingsIcon).toHaveBeenCalledWith({ assetKey: "wsi_second", workspaceSysId: "workspace-001" });
  });

  it("aligns Workspace Settings field limits to the 55A mutation boundary", async () => {
    const saveWorkspaceSettings = vi.fn(async (input) => ({
      state: "succeeded" as const,
      workspace: createWorkspace({
        name: input.name,
        shortDescription: input.shortDescription
      })
    }));

    renderApp("/?workspace=product-docs&mode=edit&page=overview", { saveWorkspaceSettings });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Workspace settings" }));
    const panel = await screen.findByRole("complementary", { name: "Workspace Settings" });
    const nameInput = within(panel).getByDisplayValue("Product Docs");
    const descriptionInput = within(panel).getByDisplayValue("Release notes and launch guidance.");
    const validName = "N".repeat(160);
    const validDescription = "D".repeat(240);

    fireEvent.change(nameInput, { target: { value: validName } });
    fireEvent.change(descriptionInput, { target: { value: validDescription } });
    expect(within(panel).queryByText("Workspace name must be 160 characters or fewer.")).not.toBeInTheDocument();
    expect(within(panel).queryByText("Short description must be 240 characters or fewer.")).not.toBeInTheDocument();

    fireEvent.change(nameInput, { target: { value: `${validName}X` } });
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    expect(within(panel).getByText("Workspace name must be 160 characters or fewer.")).toBeInTheDocument();

    fireEvent.change(nameInput, { target: { value: validName } });
    fireEvent.change(descriptionInput, { target: { value: `${validDescription}X` } });
    fireEvent.click(within(panel).getByRole("button", { name: "Close workspace settings" }));
    expect(within(panel).getByText("Short description must be 240 characters or fewer.")).toBeInTheDocument();
  });

  it("removes the workspace ToC surface while preserving explicit collapsed preference for re-enable", async () => {
    window.localStorage.setItem("docsera.workspace-toc-collapsed.v1:product-docs", "false");
    const getWorkspace = vi.fn(async () => ({
      workspace: createWorkspace({
        layout: { tocVisible: false }
      })
    }));

    const firstRender = renderApp("/?workspace=product-docs", {
      getWorkspace
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /table of contents/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("complementary", { name: "Page outline" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("docsera.workspace-toc-collapsed.v1:product-docs")).toBe("false");
    expect(window.localStorage.getItem("docsera.workspace-toc-collapsed-explicit.v2:product-docs")).toBeNull();

    firstRender.unmount();
    const secondRender = renderApp("/?workspace=product-docs", {
      getWorkspace: vi.fn(async () => ({
        workspace: createWorkspace({
          layout: { tocVisible: false }
        })
      }))
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /table of contents/i })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("docsera.workspace-toc-collapsed-explicit.v2:product-docs")).toBeNull();

    secondRender.unmount();
    window.localStorage.setItem("docsera.workspace-toc-collapsed-explicit.v2:product-docs", "true");
    const thirdRender = renderApp("/?workspace=product-docs", {
      getWorkspace: vi.fn(async () => ({
        workspace: createWorkspace({
          layout: { tocVisible: false }
        })
      }))
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /table of contents/i })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("docsera.workspace-toc-collapsed-explicit.v2:product-docs")).toBe("true");

    thirdRender.unmount();
    renderApp("/?workspace=product-docs", {
      getWorkspace: vi.fn(async () => ({
        workspace: createWorkspace({
          layout: { tocVisible: true }
        })
      }))
    });

    expect(await screen.findByRole("button", { name: "Expand table of contents" })).toBeInTheDocument();
  });
});
