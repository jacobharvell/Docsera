import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRecord } from "../workspaces/serverWorkspaceDomain.ts";
import type { PageRecord } from "./serverPageDomain.ts";
import { createPageSettingsService } from "./serviceNowPageSettings.ts";

function createWorkspace(): WorkspaceRecord {
  return {
    sysId: "workspace-001",
    name: "Product Docs",
    slug: "product-docs",
    shortDescription: "Product documentation",
    icon: {
      type: "builtin",
      key: "docsera-workspace",
      label: "Docsera workspace icon"
    },
    status: "active",
    adminGroupSysId: "group-admin",
    editorGroupSysId: "group-editor",
    creatorUserSysId: "user-001",
    layout: {
      tocVisibleByDefault: true,
      pageWidth: "readable"
    }
  };
}

function createPage(overrides: Partial<PageRecord> = {}): PageRecord {
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
    draftBodyText: null,
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

describe("page settings service", () => {
  it("rejects users without page management capability", async () => {
    const service = createPageSettingsService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: false,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [createPage()],
      savePage: async (page) => page,
      deletePage: async () => undefined
    });

    const result = await service.savePageSettings({
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001",
      pageSysId: "page-001",
      title: "Updated Overview",
      slug: "updated-overview"
    });

    expect(result.kind).toBe("forbidden");
  });

  it("saves title and slug changes with lowercase slug storage", async () => {
    const savePage = vi.fn(async (page: PageRecord) => page);
    const service = createPageSettingsService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [
        createPage(),
        createPage({
          sysId: "page-002",
          draftSlug: "details",
          draftSlugNormalized: "details"
        })
      ],
      savePage,
      deletePage: async () => undefined
    });

    const result = await service.savePageSettings({
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001",
      pageSysId: "page-001",
      title: "Updated Overview",
      slug: "UPDATED-OVERVIEW"
    });

    expect(result.kind).toBe("succeeded");
    if (result.kind === "succeeded") {
      expect(result.page.draftTitle).toBe("Updated Overview");
      expect(result.page.draftSlug).toBe("updated-overview");
      expect(result.page.draftSlugNormalized).toBe("updated-overview");
    }
    expect(savePage).toHaveBeenCalledWith(
      expect.objectContaining({
        draftTitle: "Updated Overview",
        draftSlug: "updated-overview",
        draftSlugNormalized: "updated-overview"
      })
    );
  });

  it("rejects duplicate slugs with a workspace-scoped validation error", async () => {
    const service = createPageSettingsService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [
        createPage(),
        createPage({
          sysId: "page-002",
          draftSlug: "details",
          draftSlugNormalized: "details"
        })
      ],
      savePage: async (page) => page,
      deletePage: async () => undefined
    });

    const result = await service.savePageSettings({
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001",
      pageSysId: "page-001",
      title: "Updated Overview",
      slug: "DETAILS"
    });

    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.status).toBe(400);
      expect(result.errorMessage).toBe("Slug must be unique within this workspace.");
    }
  });

  it("deletes a selected subtree and returns the next visible page", async () => {
    const table = [
      createPage({ sysId: "page-001" }),
      createPage({ sysId: "page-002", parentPageSysId: "page-001", siblingOrder: 1, draftSlug: "child-a" }),
      createPage({ sysId: "page-003", parentPageSysId: "page-001", siblingOrder: 2, draftSlug: "child-b" }),
      createPage({ sysId: "page-004", siblingOrder: 2, draftSlug: "details" })
    ];
    const deletePage = vi.fn(async (pageSysId: string) => {
      const index = table.findIndex((page) => page.sysId === pageSysId);
      if (index >= 0) {
        table.splice(index, 1);
      }
    });
    const service = createPageSettingsService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => table.slice(),
      savePage: async (page) => page,
      deletePage
    });

    const result = await service.deletePage({
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001",
      pageSysId: "page-001"
    });

    expect(result.kind).toBe("succeeded");
    if (result.kind === "succeeded") {
      expect(result.deletedPageSysId).toBe("page-001");
      expect(result.nextPageSysId).toBe("page-004");
    }
    expect(deletePage).toHaveBeenCalledTimes(3);
    expect(deletePage).toHaveBeenNthCalledWith(1, "page-003");
    expect(deletePage).toHaveBeenNthCalledWith(2, "page-002");
    expect(deletePage).toHaveBeenNthCalledWith(3, "page-001");
    expect(table.map((page) => page.sysId)).toEqual(["page-004"]);
  });

  it("does not report success when the deleted subtree remains loadable", async () => {
    const pages = [
      createPage({ sysId: "page-001" }),
      createPage({ sysId: "page-002", parentPageSysId: "page-001", siblingOrder: 1, draftSlug: "child-a" }),
      createPage({ sysId: "page-003", siblingOrder: 2, draftSlug: "details" })
    ];
    const deletePage = vi.fn(async () => undefined);
    const service = createPageSettingsService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => pages.slice(),
      savePage: async (page) => page,
      deletePage
    });

    const result = await service.deletePage({
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001",
      pageSysId: "page-001"
    });

    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.status).toBe(500);
      expect(result.errorMessage).toBe("Something went wrong while deleting the page. The page was not deleted. Please try again.");
    }
  });
});
