import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRecord } from "../workspaces/serverWorkspaceDomain.ts";
import type { PageRecord } from "./serverPageDomain.ts";
import { createStandardTableDocseraDocumentEnvelope } from "../../shared/editor/documentFixtures.ts";
import { createPageBodyContentJsonFromText } from "./serviceNowPagePersistence.ts";
import { createPagePublishService } from "./serviceNowPagePublishing.ts";

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
    draftContentJson: createPageBodyContentJsonFromText("Draft body"),
    draftRevision: 4,
    draftBodyText: "Draft body",
    publishedTitle: null,
    publishedSlug: null,
    publishedSlugNormalized: null,
    publishedContentJson: null,
    publishedBodyText: null,
    publishedAt: null,
    publishedBySysId: null,
    publishedByDisplayName: null,
    publicationState: "draft",
    active: true,
    ...overrides
  };
}

describe("page publish service", () => {
  it("publishes a never-published draft from the expected persisted revision", async () => {
    const publishPage = vi.fn(async (page: PageRecord) => page);
    const service = createPagePublishService({
      currentTimestamp: () => "2026-07-15 09:30:00",
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      getCurrentUser: () => ({
        displayName: "Priya Writer",
        sysId: "user-123"
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [createPage()],
      publishPage
    });

    const result = await service.publishPage({
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      expectedRevision: 4
    });

    expect(result.kind).toBe("succeeded");
    expect(publishPage).toHaveBeenCalledWith(
      expect.objectContaining({
        draftRevision: 4,
        publishedTitle: "Overview",
        publishedSlug: "overview",
        publishedBodyText: "Draft body",
        publicationState: "published",
        publishedAt: "2026-07-15 09:30:00",
        publishedBySysId: "user-123",
        publishedByDisplayName: "Priya Writer"
      }),
      4
    );
  });

  it("publishes updated title, slug, and content without changing parent or sibling order", async () => {
    const publishPage = vi.fn(async (page: PageRecord) => page);
    const service = createPagePublishService({
      currentTimestamp: () => "2026-07-15 09:45:00",
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      getCurrentUser: () => ({
        displayName: "Priya Writer",
        sysId: "user-123"
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [
        createPage({
          sysId: "page-parent",
          draftTitle: "Parent",
          draftSlug: "parent",
          draftSlugNormalized: "parent",
          draftContentJson: createPageBodyContentJsonFromText("Parent body"),
          draftBodyText: "Parent body",
          publishedTitle: "Parent",
          publishedSlug: "parent",
          publishedSlugNormalized: "parent",
          publishedContentJson: createPageBodyContentJsonFromText("Parent body"),
          publishedBodyText: "Parent body",
          publicationState: "published"
        }),
        createPage({
          parentPageSysId: "page-parent",
          siblingOrder: 3,
          draftTitle: "Overview Updated",
          draftSlug: "overview-updated",
          draftSlugNormalized: "overview-updated",
          draftContentJson: createPageBodyContentJsonFromText("Updated draft body"),
          draftBodyText: "Updated draft body",
          publishedTitle: "Overview",
          publishedSlug: "overview",
          publishedSlugNormalized: "overview",
          publishedContentJson: createPageBodyContentJsonFromText("Published body"),
          publishedBodyText: "Published body",
          publicationState: "published_with_unpublished_changes"
        })
      ],
      publishPage
    });

    const result = await service.publishPage({
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      expectedRevision: 4
    });

    expect(result.kind).toBe("succeeded");
    expect(publishPage).toHaveBeenCalledWith(
      expect.objectContaining({
        parentPageSysId: "page-parent",
        siblingOrder: 3,
        publishedTitle: "Overview Updated",
        publishedSlug: "overview-updated",
        publishedBodyText: "Updated draft body",
        publicationState: "published"
      }),
      4
    );
  });

  it("allows publishing a draft child beneath a published parent", async () => {
    const publishPage = vi.fn(async (page: PageRecord) => page);
    const service = createPagePublishService({
      currentTimestamp: () => "2026-07-15 09:45:00",
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      getCurrentUser: () => ({
        displayName: "Priya Writer",
        sysId: "user-123"
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [
        createPage({
          sysId: "page-parent",
          draftTitle: "Parent",
          draftSlug: "parent",
          draftSlugNormalized: "parent",
          publishedTitle: "Parent",
          publishedSlug: "parent",
          publishedSlugNormalized: "parent",
          publishedContentJson: createPageBodyContentJsonFromText("Parent body"),
          publishedBodyText: "Parent body",
          publicationState: "published"
        }),
        createPage({
          parentPageSysId: "page-parent"
        })
      ],
      publishPage
    });

    const result = await service.publishPage({
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      expectedRevision: 4
    });

    expect(result.kind).toBe("succeeded");
    expect(publishPage).toHaveBeenCalledTimes(1);
  });

  it("allows publishing a draft child beneath a parent with unpublished changes", async () => {
    const publishPage = vi.fn(async (page: PageRecord) => page);
    const service = createPagePublishService({
      currentTimestamp: () => "2026-07-15 09:45:00",
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      getCurrentUser: () => ({
        displayName: "Priya Writer",
        sysId: "user-123"
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [
        createPage({
          sysId: "page-parent",
          draftTitle: "Parent Draft",
          draftSlug: "parent-draft",
          draftSlugNormalized: "parent-draft",
          publishedTitle: "Parent",
          publishedSlug: "parent",
          publishedSlugNormalized: "parent",
          publishedContentJson: createPageBodyContentJsonFromText("Parent body"),
          publishedBodyText: "Parent body",
          publicationState: "published_with_unpublished_changes"
        }),
        createPage({
          parentPageSysId: "page-parent"
        })
      ],
      publishPage
    });

    const result = await service.publishPage({
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      expectedRevision: 4
    });

    expect(result.kind).toBe("succeeded");
    expect(publishPage).toHaveBeenCalledTimes(1);
  });

  it("rejects publishing a draft child beneath a draft-only parent", async () => {
    const publishPage = vi.fn(async (page: PageRecord) => page);
    const service = createPagePublishService({
      currentTimestamp: () => "2026-07-15 09:45:00",
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      getCurrentUser: () => ({
        displayName: "Priya Writer",
        sysId: "user-123"
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [
        createPage({
          sysId: "page-parent",
          publicationState: "draft"
        }),
        createPage({
          parentPageSysId: "page-parent"
        })
      ],
      publishPage
    });

    const result = await service.publishPage({
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      expectedRevision: 4
    });

    expect(result).toEqual({
      kind: "failed",
      errorMessage: "This page cannot be published until all ancestor pages are published.",
      status: 400
    });
    expect(publishPage).not.toHaveBeenCalled();
  });

  it("rejects publishing when a deeper ancestor is draft-only", async () => {
    const publishPage = vi.fn(async (page: PageRecord) => page);
    const service = createPagePublishService({
      currentTimestamp: () => "2026-07-15 09:45:00",
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      getCurrentUser: () => ({
        displayName: "Priya Writer",
        sysId: "user-123"
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [
        createPage({
          sysId: "page-grandparent",
          publicationState: "draft"
        }),
        createPage({
          sysId: "page-parent",
          parentPageSysId: "page-grandparent",
          draftTitle: "Parent",
          draftSlug: "parent",
          draftSlugNormalized: "parent",
          publishedTitle: "Parent",
          publishedSlug: "parent",
          publishedSlugNormalized: "parent",
          publishedContentJson: createPageBodyContentJsonFromText("Parent body"),
          publishedBodyText: "Parent body",
          publicationState: "published"
        }),
        createPage({
          parentPageSysId: "page-parent"
        })
      ],
      publishPage
    });

    const result = await service.publishPage({
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      expectedRevision: 4
    });

    expect(result).toEqual({
      kind: "failed",
      errorMessage: "This page cannot be published until all ancestor pages are published.",
      status: 400
    });
    expect(publishPage).not.toHaveBeenCalled();
  });

  it("rejects a stale expected revision without publishing", async () => {
    const publishPage = vi.fn(async (page: PageRecord) => page);
    const service = createPagePublishService({
      currentTimestamp: () => "2026-07-15 09:45:00",
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      getCurrentUser: () => ({
        displayName: "Priya Writer",
        sysId: "user-123"
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [createPage({ draftRevision: 5 })],
      publishPage
    });

    const result = await service.publishPage({
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      expectedRevision: 4
    });

    expect(result).toEqual({
      kind: "conflict",
      currentRevision: 5,
      errorMessage: "This page has a newer saved draft. Reload before publishing again."
    });
    expect(publishPage).not.toHaveBeenCalled();
  });

  it("does not use legacy page-lock authority in the publish persistence service", async () => {
    const publishPage = vi.fn(async (page: PageRecord) => page);
    const service = createPagePublishService({
      currentTimestamp: () => "2026-07-15 09:45:00",
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      getCurrentUser: () => ({
        displayName: "Priya Writer",
        sysId: "user-123"
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [createPage()],
      publishPage
    });

    const result = await service.publishPage({
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      expectedRevision: 4
    });

    expect(result.kind).toBe("succeeded");
    expect(publishPage).toHaveBeenCalledTimes(1);
  });

  it("rejects unauthorized callers before publishing", async () => {
    const publishPage = vi.fn(async (page: PageRecord) => page);
    const service = createPagePublishService({
      currentTimestamp: () => "2026-07-15 09:45:00",
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: false,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      getCurrentUser: () => ({
        displayName: "Priya Writer",
        sysId: "user-123"
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [createPage()],
      publishPage
    });

    const result = await service.publishPage({
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      expectedRevision: 4
    });

    expect(result.kind).toBe("forbidden");
    expect(publishPage).not.toHaveBeenCalled();
  });

  it("rejects invalid canonical draft content without mutating the published state", async () => {
    const publishPage = vi.fn(async (page: PageRecord) => page);
    const service = createPagePublishService({
      currentTimestamp: () => "2026-07-15 09:45:00",
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      getCurrentUser: () => ({
        displayName: "Priya Writer",
        sysId: "user-123"
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [
        createPage({
          draftContentJson: {
            schemaVersion: 9,
            document: { type: "doc", content: [] }
          } as never,
          publicationState: "published_with_unpublished_changes",
          publishedTitle: "Published title",
          publishedSlug: "published-title",
          publishedSlugNormalized: "published-title",
          publishedContentJson: createPageBodyContentJsonFromText("Published body"),
          publishedBodyText: "Published body"
        })
      ],
      publishPage
    });

    const result = await service.publishPage({
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      expectedRevision: 4
    });

    expect(result).toEqual({
      kind: "failed",
      errorMessage: "The current draft content cannot be published.",
      status: 400
    });
    expect(publishPage).not.toHaveBeenCalled();
  });

  it("accepts a valid canonical table envelope when publishing persisted draft content", async () => {
    const tableEnvelope = createStandardTableDocseraDocumentEnvelope();
    const publishPage = vi.fn(async (page: PageRecord) => page);
    const service = createPagePublishService({
      currentTimestamp: () => "2026-07-15 09:45:00",
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      getCurrentUser: () => ({
        displayName: "Priya Writer",
        sysId: "user-123"
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [
        createPage({
          draftContentJson: tableEnvelope,
          draftBodyText: "Plan\nOwner\nAlpha launch\nNested block\nBeta"
        })
      ],
      publishPage
    });

    const result = await service.publishPage({
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      expectedRevision: 4
    });

    expect(result.kind).toBe("succeeded");
    expect(publishPage).toHaveBeenCalledWith(
      expect.objectContaining({
        publishedContentJson: tableEnvelope,
        publishedBodyText: "Plan\nOwner\nAlpha launch\nNested block\nBeta"
      }),
      4
    );
  });

  it("rejects malformed table draft content through the existing invalid-document publish path", async () => {
    const publishPage = vi.fn(async (page: PageRecord) => page);
    const service = createPagePublishService({
      currentTimestamp: () => "2026-07-15 09:45:00",
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      getCurrentUser: () => ({
        displayName: "Priya Writer",
        sysId: "user-123"
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [
        createPage({
          draftContentJson: {
            schemaVersion: 1,
            document: {
              type: "doc",
              content: [{ type: "table", content: [] }]
            }
          } as never
        })
      ],
      publishPage
    });

    const result = await service.publishPage({
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      expectedRevision: 4
    });

    expect(result).toEqual({
      kind: "failed",
      errorMessage: "The current draft content cannot be published.",
      status: 400
    });
    expect(publishPage).not.toHaveBeenCalled();
  });

  it("rejects invalid canonical draft content surfaced while loading the draft", async () => {
    const publishPage = vi.fn(async (page: PageRecord) => page);
    const service = createPagePublishService({
      currentTimestamp: () => "2026-07-15 09:45:00",
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      getCurrentUser: () => ({
        displayName: "Priya Writer",
        sysId: "user-123"
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => { throw new Error("The stored page content is not valid JSON."); },
      publishPage
    });

    const result = await service.publishPage({
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      expectedRevision: 4
    });

    expect(result).toEqual({
      kind: "failed",
      errorMessage: "The current draft content cannot be published.",
      status: 400
    });
    expect(publishPage).not.toHaveBeenCalled();
  });

  it("preserves the prior published snapshot when the record write rejects the publish", async () => {
    const originalPage = createPage({
      draftTitle: "Updated title",
      draftSlug: "updated-title",
      draftSlugNormalized: "updated-title",
      draftContentJson: createPageBodyContentJsonFromText("Updated draft body"),
      draftBodyText: "Updated draft body",
      publishedTitle: "Published title",
      publishedSlug: "published-title",
      publishedSlugNormalized: "published-title",
      publishedContentJson: createPageBodyContentJsonFromText("Published body"),
      publishedBodyText: "Published body",
      publicationState: "published_with_unpublished_changes"
    });
    const publishPage = vi.fn(async () => null);
    const service = createPagePublishService({
      currentTimestamp: () => "2026-07-15 09:45:00",
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      getCurrentUser: () => ({
        displayName: "Priya Writer",
        sysId: "user-123"
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [originalPage],
      publishPage
    });

    const result = await service.publishPage({
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      expectedRevision: 4
    });

    expect(result).toEqual({
      kind: "conflict",
      currentRevision: 4,
      errorMessage: "This page has a newer saved draft. Reload before publishing again."
    });
    expect(originalPage.publishedTitle).toBe("Published title");
    expect(originalPage.publishedSlug).toBe("published-title");
    expect(originalPage.publishedBodyText).toBe("Published body");
    expect(originalPage.publicationState).toBe("published_with_unpublished_changes");
  });
});
