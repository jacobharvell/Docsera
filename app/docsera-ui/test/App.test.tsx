import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../src/client/app/App";
import { createEmptyDocseraDocumentEnvelope } from "../src/shared/editor/document";
import type {
  DocseraRuntimeContext,
  PageBodySaveResult,
  PageCreateResult,
  PageListResult,
  ServiceNowClient,
  WorkspaceMode,
  WorkspacePageRecord,
  WorkspaceViewRecord
} from "../src/client/shared/types/docsera";

vi.mock("../src/client/editor/PageEditorHost", () => ({
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
    savePageBody: vi.fn(async (): Promise<PageBodySaveResult> => ({
      errorMessage: "savePageBody should not be called in these tests",
      state: "failed"
    })),
    publishPage: vi.fn(async () => ({
      errorMessage: "publishPage should not be called in these tests",
      state: "failed"
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

function readRouteValues(): Record<string, string | null> {
  const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : window.location.hash;
  const [rawPath = "", rawQuery = ""] = hash.split("?", 2);
  const path = rawPath.startsWith("/") ? rawPath.slice(1) : rawPath;
  const segments = path.split("/").filter(Boolean).map((segment) => decodeURIComponent(segment));
  const params = new URLSearchParams(rawQuery || window.location.search);
  return {
    mode: params.get("mode"),
    page: segments[1] ?? params.get("page"),
    workspace: segments[0] ?? params.get("workspace")
  };
}

function expectSearchValues(expected: Record<string, string | null>) {
  const values = readRouteValues();
  for (const [key, value] of Object.entries(expected)) {
    expect(values[key]).toBe(value);
  }
}

describe("workspace integration flows", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("renders My Workspaces with workspace rows and admin-only settings links", async () => {
    renderApp("/?view=my-workspaces");

    expect(await screen.findByRole("heading", { name: "My Workspaces" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Product Docs" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "API Docs" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Settings" })).toHaveLength(2);
  });

  it("opens a workspace in live mode from the launcher", async () => {
    renderApp("/?view=my-workspaces");

    const productDocsLink = await screen.findByRole("link", { name: "Product Docs" });
    await act(async () => {
      fireEvent.click(productDocsLink);
    });

    expect(await screen.findByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Open settings for Overview" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "New page" })).not.toBeInTheDocument();
    expect(document.querySelector("[data-docsera-page-editor-host='true']")).toBeNull();
    expectSearchValues({
      mode: null,
      page: "overview",
      workspace: "product-docs"
    });
  });
});
