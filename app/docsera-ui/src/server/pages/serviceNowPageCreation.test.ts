import { describe, expect, it } from "vitest";
import type { WorkspaceRecord } from "../workspaces/serverWorkspaceDomain";
import { createPageCreationService } from "./serviceNowPageCreation";
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
      tocVisibleByDefault: true,
      pageWidth: "readable"
    }
  };
}

describe("service now page creation service", () => {
  it("rejects users without authoring capability", async () => {
    const service = createPageCreationService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: false,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      listWorkspacePages: async () => [],
      savePage: async (page) => page
    });

    const result = await service.createPage({
      title: "Task 33 Page Smoke",
      workspaceSlug: "product-docs"
    });

    expect(result.kind).toBe("forbidden");
    if (result.kind === "forbidden") {
      expect(result.errorMessage).toContain("permission");
    }
  });

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
  });
});
