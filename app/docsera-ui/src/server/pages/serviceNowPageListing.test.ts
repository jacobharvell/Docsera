import { describe, expect, it, vi } from "vitest";
import { createPageListingService } from "./serviceNowPageListing";
import type { WorkspaceRecord } from "../workspaces/serverWorkspaceDomain";
import type { PageRecord } from "./serverPageDomain";

function createWorkspace(overrides: Partial<WorkspaceRecord> = {}): WorkspaceRecord {
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
    },
    ...overrides
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

describe("page listing service", () => {
  it("rejects missing workspace slugs with a safe validation failure", async () => {
    const service = createPageListingService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: vi.fn(),
      listWorkspacePages: vi.fn()
    });

    const result = await service.listPages({ workspaceSlug: "" });

    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.status).toBe(400);
      expect(result.errorMessage).toContain("workspace");
    }
  });

  it("returns not found for an unknown workspace slug", async () => {
    const service = createPageListingService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: () => null,
      listWorkspacePages: vi.fn()
    });

    const result = await service.listPages({ workspaceSlug: "missing-workspace" });

    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.status).toBe(404);
      expect(result.errorMessage).toBe("Workspace could not be found.");
    }
  });

  it("rejects users without workspace authoring access", async () => {
    const service = createPageListingService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: false,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: () => createWorkspace(),
      listWorkspacePages: vi.fn()
    });

    const result = await service.listPages({ workspaceSlug: "product-docs" });

    expect(result.kind).toBe("forbidden");
    if (result.kind === "forbidden") {
      expect(result.errorMessage).toContain("permission");
    }
  });

  it("loads authoring pages for a workspace and passes through the workspace sys_id", async () => {
    const listWorkspacePages = vi.fn().mockResolvedValue([createPage({ sysId: "page-002", siblingOrder: 2 })]);
    const service = createPageListingService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: true,
        canEditWorkspace: true,
        canManageWorkspaceMembers: true,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: () => createWorkspace(),
      listWorkspacePages
    });

    const result = await service.listPages({ workspaceSlug: "product-docs" });

    expect(result.kind).toBe("succeeded");
    if (result.kind === "succeeded") {
      expect(result.workspace.sysId).toBe("workspace-001");
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0]?.sysId).toBe("page-002");
    }

    expect(listWorkspacePages).toHaveBeenCalledWith("workspace-001");
  });
});
