import { describe, expect, it } from "vitest";
import { createPageCreationService } from "./serviceNowPageCreation";
import type { WorkspaceRecord } from "../workspaces/serverWorkspaceDomain";
import type { PageRecord } from "./serverPageDomain";

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
      tocVisible: true,
      pageWidth: "readable"
    }
  };
}

describe("service now page creation service", () => {
  it("allocates a live root page with workspace-scoped slug uniqueness", async () => {
    const savedPages: PageRecord[] = [];
    const service = createPageCreationService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      listWorkspacePages: async () => [
        {
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
          active: true
        },
        {
          sysId: "page-002",
          workspaceSysId: "workspace-001",
          parentPageSysId: null,
          siblingOrder: 2,
          draftTitle: "Benefits",
          draftSlug: "benefits",
          draftSlugNormalized: "benefits",
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
          active: true
        }
      ],
      savePage: async (page) => {
        const nextPage = {
          ...page,
          sysId: "page-003"
        };
        savedPages.push(nextPage);
        return nextPage;
      }
    });

    const result = await service.createPage({
      title: "Benefits",
      workspaceSlug: "product-docs"
    });

    expect(result.kind).toBe("succeeded");
    if (result.kind === "succeeded") {
      expect(result.page.sysId).toBe("page-003");
      expect(result.page.draftSlug).toBe("benefits-1");
      expect(result.page.siblingOrder).toBe(3);
    }

    expect(savedPages).toHaveLength(1);
    expect(savedPages[0]?.draftTitle).toBe("Benefits");
    expect(savedPages[0]?.active).toBe(true);
  });

  it("creates the first page in an empty workspace with an active record", async () => {
    const savedPages: PageRecord[] = [];
    const service = createPageCreationService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      listWorkspacePages: async () => [],
      savePage: async (page) => {
        const nextPage = {
          ...page,
          sysId: "page-010"
        };
        savedPages.push(nextPage);
        return nextPage;
      }
    });

    const result = await service.createPage({
      title: "Getting Started",
      workspaceSlug: "product-docs"
    });

    expect(result.kind).toBe("succeeded");
    if (result.kind === "succeeded") {
      expect(result.page.sysId).toBe("page-010");
      expect(result.page.active).toBe(true);
      expect(result.page.siblingOrder).toBe(1);
      expect(result.page.draftSlug).toBe("getting-started");
    }

    expect(savedPages).toHaveLength(1);
    expect(savedPages[0]?.active).toBe(true);
  });
});
