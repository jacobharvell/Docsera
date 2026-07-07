import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRecord } from "../workspaces/serverWorkspaceDomain.ts";
import type { PageRecord } from "./serverPageDomain.ts";
import { createPageBodySaveService } from "./serviceNowPageDraftPersistence.ts";

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

describe("page body save service", () => {
  it("saves draft body content and persistence fields", async () => {
    const savePage = vi.fn(async (page: PageRecord) => page);
    const service = createPageBodySaveService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [createPage()],
      savePage
    });

    const result = await service.savePageBody({
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      draftBodyText: "Updated draft body"
    });

    expect(result.kind).toBe("succeeded");
    expect(savePage).toHaveBeenCalledTimes(1);
    expect(savePage).toHaveBeenCalledWith(
      expect.objectContaining({
        draftBodyText: "Updated draft body",
        draftContentJson: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                {
                  type: "text",
                  text: "Updated draft body"
                }
              ]
            }
          ]
        }
      })
    );
    if (result.kind === "succeeded") {
      expect(result.page.draftBodyText).toBe("Updated draft body");
    }
  });

  it("rejects missing workspace references", async () => {
    const service = createPageBodySaveService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: async () => null,
      loadWorkspaceBySysId: async () => null,
      listWorkspacePages: async () => [],
      savePage: async (page) => page
    });

    const result = await service.savePageBody({
      workspaceSlug: "",
      pageSysId: "page-001",
      draftBodyText: "Updated draft body"
    });

    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.status).toBe(400);
      expect(result.errorMessage).toContain("workspace");
    }
  });

  it("rejects missing page references", async () => {
    const service = createPageBodySaveService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [],
      savePage: async (page) => page
    });

    const result = await service.savePageBody({
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      draftBodyText: "Updated draft body"
    });

    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.status).toBe(404);
      expect(result.errorMessage).toContain("Page");
    }
  });

  it("rejects page-workspace mismatches", async () => {
    const service = createPageBodySaveService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [
        createPage({
          sysId: "page-002",
          workspaceSysId: "workspace-002"
        })
      ],
      savePage: async (page) => page
    });

    const result = await service.savePageBody({
      workspaceSlug: "product-docs",
      pageSysId: "page-002",
      draftBodyText: "Updated draft body"
    });

    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.status).toBe(400);
      expect(result.errorMessage).toContain("workspace");
    }
  });

  it("rejects users without authoring capability", async () => {
    const service = createPageBodySaveService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: false,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [createPage()],
      savePage: async (page) => page
    });

    const result = await service.savePageBody({
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      draftBodyText: "Updated draft body"
    });

    expect(result.kind).toBe("forbidden");
    if (result.kind === "forbidden") {
      expect(result.errorMessage).toContain("permission");
    }
  });
});
