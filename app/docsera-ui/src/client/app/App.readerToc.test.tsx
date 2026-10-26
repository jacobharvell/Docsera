import "@testing-library/jest-dom/vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { useEffect } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { createHeadingHierarchyDocseraDocumentEnvelope } from "../../shared/editor/documentFixtures";
import type {
  DocseraRuntimeContext,
  PageBodySaveResult,
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

function createPageRecord(
  overrides: Partial<WorkspacePageRecord> = {},
  envelope = createHeadingHierarchyDocseraDocumentEnvelope()
): WorkspacePageRecord {
  return {
    sysId: "page-001",
    workspaceSysId: "workspace-001",
    parentPageSysId: null,
    siblingOrder: 1,
    draftTitle: "Overview",
    draftSlug: "overview",
    draftSlugNormalized: "overview",
    draftContentJson: envelope,
    draftRevision: 0,
    draftBodyText: null,
    publishedTitle: "Overview",
    publishedSlug: "overview",
    publishedSlugNormalized: "overview",
    publishedContentJson: envelope,
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

describe("App reader toc integration", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("keeps the live workspace route stable when a TOC link is activated", async () => {
    renderApp("/?workspace=product-docs&page=overview");

    const tocLink = await screen.findByRole("link", { name: "Install" });
    await act(async () => {
      fireEvent.click(tocLink);
    });

    expectSearchValues({
      mode: null,
      page: "overview",
      workspace: "product-docs"
    });
  });

  it("keeps the edit workspace route stable when a TOC link is activated", async () => {
    renderApp("/?workspace=product-docs&mode=edit&page=overview");

    const tocLink = await screen.findByRole("link", { name: "Install" });
    await act(async () => {
      fireEvent.click(tocLink);
    });

    expectSearchValues({
      mode: "edit",
      page: "overview",
      workspace: "product-docs"
    });
  });
});
