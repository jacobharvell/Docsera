import {
  DEFAULT_WORKSPACE_ICON,
  allocateWorkspaceSlug,
  buildWorkspaceGroupNames,
  createWorkspaceDraft,
  deriveWorkspaceGroupKey,
  provisionWorkspace,
  slugifyWorkspaceName,
  WORKSPACE_ROLE_NAMES
} from "../src/shared/workspaces/domain";

test("slugifyWorkspaceName normalizes names into url-safe slugs", () => {
  expect(slugifyWorkspaceName("HR Docs")).toBe("hr-docs");
  expect(slugifyWorkspaceName("  Caf\u00e9 Team / Docs  ")).toBe("cafe-team-docs");
});

test("slugifyWorkspaceName falls back when the name has no usable slug characters", () => {
  expect(slugifyWorkspaceName("!!!")).toBe("workspace");
});

test("allocateWorkspaceSlug silently suffixes duplicates and treats retained slugs as reserved", () => {
  expect(allocateWorkspaceSlug("HR Docs", ["hr-docs", "hr-docs-2"])).toBe("hr-docs-3");
  expect(allocateWorkspaceSlug("HR Docs", [{ slug: "hr-docs" }, { workspaceSlug: "hr-docs-2" }])).toBe("hr-docs-3");
});

test("group names use the accepted underscore pattern derived from the workspace key", () => {
  const key = deriveWorkspaceGroupKey("HR Docs", "hr-docs-2");
  expect(key).toBe("HR_Docs_2");
  expect(buildWorkspaceGroupNames(key)).toEqual({
    admin: "Docsera_HR_Docs_2_Admins",
    editor: "Docsera_HR_Docs_2_Editors"
  });
});

test("createWorkspaceDraft applies default icon, active status, and layout defaults", () => {
  const draft = createWorkspaceDraft({
    name: "Platform Docs",
    shortDescription: "SDK runtime workspace",
    creatorUserSysId: "user-123"
  });

  expect(draft.slug).toBe("platform-docs");
  expect(draft.shortDescription).toBe("SDK runtime workspace");
  expect(draft.icon).toEqual(DEFAULT_WORKSPACE_ICON);
  expect(draft.status).toBe("active");
  expect(draft.layout).toEqual({
    tocVisibleByDefault: true,
    pageWidth: "readable"
  });
});

test("provisionWorkspace stores group references, assigns scoped roles, and adds the creator to the admin group", async () => {
  const assignedRoles: Array<{ groupSysId: string; roleName: string }> = [];
  const groupMemberships: Array<{ groupSysId: string; userSysId: string }> = [];

  const result = await provisionWorkspace(
    {
      name: "HR Docs",
      shortDescription: "Policies and procedures",
      creatorUserSysId: "user-123"
    },
    {
      createGroup: async ({ name }) => ({ sysId: `${name}-sys-id`, name }),
      assignRoleToGroup: async (groupSysId, roleName) => {
        assignedRoles.push({ groupSysId, roleName });
      },
      addUserToGroup: async ({ groupSysId, userSysId }) => {
        groupMemberships.push({ groupSysId, userSysId });
      },
      saveWorkspace: async (workspace) => ({
        ...workspace,
        sysId: "workspace-001"
      })
    },
    ["hr-docs"]
  );

  expect(result.workspace.slug).toBe("hr-docs-2");
  expect(result.workspace.adminGroupSysId).toBe("Docsera_HR_Docs_2_Admins-sys-id");
  expect(result.workspace.editorGroupSysId).toBe("Docsera_HR_Docs_2_Editors-sys-id");
  expect(assignedRoles).toEqual([
    {
      groupSysId: "Docsera_HR_Docs_2_Admins-sys-id",
      roleName: WORKSPACE_ROLE_NAMES.workspaceAdmin
    },
    {
      groupSysId: "Docsera_HR_Docs_2_Editors-sys-id",
      roleName: WORKSPACE_ROLE_NAMES.editor
    }
  ]);
  expect(groupMemberships).toEqual([
    {
      groupSysId: "Docsera_HR_Docs_2_Admins-sys-id",
      userSysId: "user-123"
    }
  ]);
});

test("provisionWorkspace rolls back created groups when persistence fails and deleteGroup is available", async () => {
  const deletedGroupSysIds: string[] = [];

  await expect(
    provisionWorkspace(
      {
        name: "Broken Workspace",
        creatorUserSysId: "user-123"
      },
      {
        createGroup: async ({ name }) => ({ sysId: `${name}-sys-id`, name }),
        assignRoleToGroup: async () => undefined,
        addUserToGroup: async () => undefined,
        saveWorkspace: async () => {
          throw new Error("Insert failed");
        },
        deleteGroup: async (groupSysId) => {
          deletedGroupSysIds.push(groupSysId);
        }
      }
    )
  ).rejects.toThrow("Insert failed");

  expect(deletedGroupSysIds).toEqual([
    "Docsera_Broken_Workspace_Editors-sys-id",
    "Docsera_Broken_Workspace_Admins-sys-id"
  ]);
});
