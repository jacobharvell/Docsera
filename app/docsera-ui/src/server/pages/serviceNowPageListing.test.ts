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

  it("rejects unauthorized edit-mode page loads", async () => {
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

    const result = await service.listPages({ mode: "edit", workspaceSlug: "product-docs" });

    expect(result.kind).toBe("forbidden");
    if (result.kind === "forbidden") {
      expect(result.errorMessage).toContain("draft");
    }
  });

  it("loads published-only live pages for viewers", async () => {
    const listWorkspacePages = vi.fn().mockResolvedValue([
      createPage({ sysId: "page-001", publicationState: "draft", draftTitle: "Draft only", draftSlug: "draft-only" }),
      createPage({
        sysId: "page-002",
        draftTitle: "Draft title",
        draftSlug: "draft-title",
        draftContentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "draft" }] }] },
        publishedTitle: "Published title",
        publishedSlug: "published-title",
        publishedSlugNormalized: "published-title",
        publishedContentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "published" }] }] },
        publicationState: "published_with_unpublished_changes"
      })
    ]);
    const service = createPageListingService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: false,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: () => createWorkspace(),
      listWorkspacePages
    });

    const result = await service.listPages({ mode: "live", workspaceSlug: "product-docs" });

    expect(result.kind).toBe("succeeded");
    if (result.kind === "succeeded") {
      expect(result.mode).toBe("live");
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0]).toMatchObject({
        draftSlug: "published-title",
        draftTitle: "Published title",
        publicationState: "published"
      });
      expect(result.pages[0]?.draftContentJson).toEqual({
        type: "doc",
        content: [{ type: "paragraph", content: [{ type: "text", text: "published" }] }]
      });
    }
  });

  it("fails closed when published title metadata is incomplete", async () => {
    const service = createPageListingService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: false,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: () => createWorkspace(),
      listWorkspacePages: async () => [
        createPage({
          draftTitle: "Hidden draft title",
          draftSlug: "hidden-draft-title",
          draftContentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "hidden draft" }] }] },
          publishedTitle: null,
          publishedSlug: "published-title",
          publishedSlugNormalized: "published-title",
          publishedContentJson: { type: "doc", content: [] },
          publicationState: "published_with_unpublished_changes"
        })
      ]
    });

    const result = await service.listPages({ mode: "live", workspaceSlug: "product-docs" });

    expect(result.kind).toBe("succeeded");
    if (result.kind === "succeeded") {
      expect(result.pages).toEqual([]);
    }
  });

  it("fails closed when published slug or published content are incomplete", async () => {
    const service = createPageListingService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: false,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: () => createWorkspace(),
      listWorkspacePages: async () => [
        createPage({
          sysId: "page-002",
          draftTitle: "Draft slug fallback",
          draftSlug: "draft-slug-fallback",
          publishedTitle: "Published slug missing",
          publishedSlug: null,
          publishedSlugNormalized: null,
          publishedContentJson: { type: "doc", content: [] },
          publicationState: "published"
        }),
        createPage({
          sysId: "page-003",
          draftTitle: "Draft content fallback",
          draftSlug: "draft-content-fallback",
          publishedTitle: "Published content missing",
          publishedSlug: "published-content-missing",
          publishedSlugNormalized: "published-content-missing",
          publishedContentJson: null,
          publicationState: "published_with_unpublished_changes"
        })
      ]
    });

    const result = await service.listPages({ mode: "live", workspaceSlug: "product-docs" });

    expect(result.kind).toBe("succeeded");
    if (result.kind === "succeeded") {
      expect(result.pages).toEqual([]);
    }
  });

  it("fails closed when published canonical content is malformed even if the draft content is valid", async () => {
    const service = createPageListingService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: false,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: () => createWorkspace(),
      listWorkspacePages: async () => [
        createPage({
          draftTitle: "Valid draft fallback",
          draftSlug: "valid-draft-fallback",
          draftContentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "valid draft" }] }] },
          publishedTitle: "Malformed published",
          publishedSlug: "malformed-published",
          publishedSlugNormalized: "malformed-published",
          publishedContentJson: "{bad-json",
          publicationState: "published_with_unpublished_changes"
        })
      ]
    });

    const result = await service.listPages({ mode: "live", workspaceSlug: "product-docs" });

    expect(result.kind).toBe("succeeded");
    if (result.kind === "succeeded") {
      expect(result.pages).toEqual([]);
    }
  });

  it("never exposes draft metadata in the live payload", async () => {
    const service = createPageListingService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: false,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: () => createWorkspace(),
      listWorkspacePages: async () => [
        createPage({
          draftRevision: 12,
          draftTitle: "Secret draft title",
          draftSlug: "secret-draft-slug",
          draftSlugNormalized: "secret-draft-slug",
          draftContentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "secret draft" }] }] },
          draftBodyText: "secret draft body",
          publishedTitle: "Published title",
          publishedSlug: "published-title",
          publishedSlugNormalized: "published-title",
          publishedContentJson: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "published body" }] }] },
          publishedBodyText: "published body",
          publicationState: "published_with_unpublished_changes"
        })
      ]
    });

    const result = await service.listPages({ mode: "live", workspaceSlug: "product-docs" });

    expect(result.kind).toBe("succeeded");
    if (result.kind === "succeeded") {
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0]).toMatchObject({
        draftTitle: "Published title",
        draftSlug: "published-title",
        draftSlugNormalized: "published-title",
        draftBodyText: "published body",
        publicationState: "published"
      });
      expect(Object.prototype.hasOwnProperty.call(result.pages[0], "draftRevision")).toBe(false);
      expect(JSON.stringify(result.pages[0])).not.toContain("Secret draft title");
      expect(JSON.stringify(result.pages[0])).not.toContain("secret-draft-slug");
      expect(JSON.stringify(result.pages[0])).not.toContain("secret draft body");
      expect(JSON.stringify(result.pages[0])).not.toContain("secret draft");
      expect(JSON.stringify(result.pages[0])).not.toContain("12");
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

    const result = await service.listPages({ mode: "edit", workspaceSlug: "product-docs" });

    expect(result.kind).toBe("succeeded");
    if (result.kind === "succeeded") {
      expect(result.mode).toBe("edit");
      expect(result.workspace.sysId).toBe("workspace-001");
      expect(result.pages).toHaveLength(1);
      expect(result.pages[0]?.sysId).toBe("page-002");
    }

    expect(listWorkspacePages).toHaveBeenCalledWith("workspace-001");
  });
});
