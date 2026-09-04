import { describe, expect, it } from "vitest";
import { createPageCreationService } from "./serviceNowPageCreation";
import type { WorkspaceRecord } from "../workspaces/serverWorkspaceDomain";

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

describe("service now page creation service access control", () => {
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
});
