import {
  BUILT_IN_WORKSPACE_ICONS,
  DEFAULT_WORKSPACE_ICON,
  allocateWorkspaceSlug,
  buildWorkspaceListResult,
  buildWorkspaceGroupNames,
  createWorkspaceDraft,
  deriveWorkspaceGroupKey,
  evaluateWorkspaceCapabilities,
  provisionWorkspace,
  reconcileWorkspaceDraftSlug,
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
    tocVisible: true,
    pageWidth: "readable"
  });
});

test("createWorkspaceDraft canonicalizes supported built-in workspace icons", () => {
  const draft = createWorkspaceDraft({
    name: "Security Docs",
    icon: {
      type: "builtin",
      key: "security",
      label: "Forged label"
    },
    creatorUserSysId: "user-123"
  });

  expect(BUILT_IN_WORKSPACE_ICONS.map((icon) => icon.key)).toContain("security");
  expect(draft.icon).toEqual({
    type: "builtin",
    key: "security",
    label: "Security"
  });
});

test("reconcileWorkspaceDraftSlug refreshes the slug and group names against a live reservation set", () => {
  const originalDraft = createWorkspaceDraft({
    name: "HR Docs",
    creatorUserSysId: "user-123"
  });

  const reconciledDraft = reconcileWorkspaceDraftSlug(originalDraft, ["hr-docs"]);

  expect(reconciledDraft.slug).toBe("hr-docs-2");
  expect(reconciledDraft.workspaceGroupKey).toBe("HR_Docs_2");
  expect(reconciledDraft.adminGroupName).toBe("Docsera_HR_Docs_2_Admins");
  expect(reconciledDraft.editorGroupName).toBe("Docsera_HR_Docs_2_Editors");
});

test("evaluateWorkspaceCapabilities allows authenticated users to view active workspaces by default", () => {
  const capabilities = evaluateWorkspaceCapabilities(
    {
      ...createWorkspaceDraft({
        name: "Platform Docs",
        creatorUserSysId: "user-123"
      }),
      adminGroupSysId: "group-admin",
      editorGroupSysId: "group-editor"
    },
    {
      isAuthenticated: true,
      hasRole: () => false,
      isMemberOfGroup: () => false
    }
  );

  expect(capabilities).toEqual({
    canViewWorkspace: true,
    canEditWorkspace: false,
    canAdminWorkspace: false,
    canManageWorkspaceMembers: false
  });
});

test("buildWorkspaceListResult preserves the server-evaluated creation capability", () => {
  const workspace = {
    ...createWorkspaceDraft({
      name: "Platform Docs",
      creatorUserSysId: "user-123"
    }),
    adminGroupSysId: "group-admin",
    editorGroupSysId: "group-editor"
  };

  const result = buildWorkspaceListResult(
    [workspace],
    new Map([
      [
        "platform-docs",
        {
          canViewWorkspace: true,
          canEditWorkspace: true,
          canAdminWorkspace: true,
          canManageWorkspaceMembers: true
        }
      ]
    ]),
    {},
    true
  );

  expect(result.canCreateWorkspaces).toBe(true);
  expect(result.items).toHaveLength(1);
});

test("evaluateWorkspaceCapabilities restricts inactive workspaces for unrelated authenticated users", () => {
  const capabilities = evaluateWorkspaceCapabilities(
    {
      ...createWorkspaceDraft({
        name: "Archive Docs",
        status: "inactive",
        creatorUserSysId: "user-123"
      }),
      adminGroupSysId: "group-admin",
      editorGroupSysId: "group-editor"
    },
    {
      isAuthenticated: true,
      hasRole: () => false,
      isMemberOfGroup: () => false
    }
  );

  expect(capabilities).toEqual({
    canViewWorkspace: false,
    canEditWorkspace: false,
    canAdminWorkspace: false,
    canManageWorkspaceMembers: false
  });
});

test("evaluateWorkspaceCapabilities gives Docsera Admin full workspace capability override", () => {
  const capabilities = evaluateWorkspaceCapabilities(
    {
      ...createWorkspaceDraft({
        name: "Admin Docs",
        status: "inactive",
        creatorUserSysId: "user-123"
      }),
      adminGroupSysId: "",
      editorGroupSysId: ""
    },
    {
      isAuthenticated: true,
      hasRole: (roleName) => roleName === WORKSPACE_ROLE_NAMES.docseraAdmin,
      isMemberOfGroup: () => false
    }
  );

  expect(capabilities).toEqual({
    canViewWorkspace: true,
    canEditWorkspace: true,
    canAdminWorkspace: true,
    canManageWorkspaceMembers: true
  });
});

test("evaluateWorkspaceCapabilities gives workspace admin group members admin, edit, and member-management access", () => {
  const capabilities = evaluateWorkspaceCapabilities(
    {
      ...createWorkspaceDraft({
        name: "Workspace Admin Docs",
        creatorUserSysId: "user-123"
      }),
      adminGroupSysId: "group-admin",
      editorGroupSysId: "group-editor"
    },
    {
      isAuthenticated: true,
      hasRole: (roleName) => roleName === WORKSPACE_ROLE_NAMES.workspaceAdmin,
      isMemberOfGroup: (groupSysId) => groupSysId === "group-admin"
    }
  );

  expect(capabilities).toEqual({
    canViewWorkspace: true,
    canEditWorkspace: true,
    canAdminWorkspace: true,
    canManageWorkspaceMembers: true
  });
});

test("evaluateWorkspaceCapabilities gives workspace editor group members edit access without admin powers", () => {
  const capabilities = evaluateWorkspaceCapabilities(
    {
      ...createWorkspaceDraft({
        name: "Workspace Editor Docs",
        status: "inactive",
        creatorUserSysId: "user-123"
      }),
      adminGroupSysId: "group-admin",
      editorGroupSysId: "group-editor"
    },
    {
      isAuthenticated: true,
      hasRole: (roleName) => roleName === WORKSPACE_ROLE_NAMES.editor,
      isMemberOfGroup: (groupSysId) => groupSysId === "group-editor"
    }
  );

  expect(capabilities).toEqual({
    canViewWorkspace: true,
    canEditWorkspace: true,
    canAdminWorkspace: false,
    canManageWorkspaceMembers: false
  });
});

test("evaluateWorkspaceCapabilities fails safely when workspace group references are missing", () => {
  const capabilities = evaluateWorkspaceCapabilities(
    {
      ...createWorkspaceDraft({
        name: "Broken Groups",
        creatorUserSysId: "user-123"
      }),
      adminGroupSysId: "",
      editorGroupSysId: ""
    },
    {
      isAuthenticated: true,
      hasRole: (roleName) => roleName !== WORKSPACE_ROLE_NAMES.docseraAdmin,
      isMemberOfGroup: () => true
    }
  );

  expect(capabilities).toEqual({
    canViewWorkspace: true,
    canEditWorkspace: false,
    canAdminWorkspace: false,
    canManageWorkspaceMembers: false
  });
});

test("provisionWorkspace stores group references, assigns scoped roles, and leaves generated groups empty", async () => {
  const assignedRoles: Array<{ groupSysId: string; roleName: string }> = [];
  const groupMemberships: Array<{ groupSysId: string; userSysId: string }> = [];

  const result = await provisionWorkspace(
    {
      name: "HR Docs",
      shortDescription: "Policies and procedures",
      icon: {
        type: "builtin",
        key: "operations",
        label: "Forged operations label"
      },
      creatorUserSysId: "creator-user"
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
  expect(result.workspace.icon).toEqual({
    type: "builtin",
    key: "operations",
    label: "Operations"
  });
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
  ]);
  expect(result.workspace.creatorUserSysId).toBe("creator-user");
});

test("provisionWorkspace rechecks reserved slugs before group creation when the adapter exposes live reservations", async () => {
  const result = await provisionWorkspace(
    {
      name: "HR Docs",
      creatorUserSysId: "user-123"
    },
    {
      listReservedWorkspaceSlugs: async () => ["hr-docs"],
      createGroup: async ({ name }) => ({ sysId: `${name}-sys-id`, name }),
      assignRoleToGroup: async () => undefined,
      saveWorkspace: async (workspace) => ({
        ...workspace,
        sysId: "workspace-001"
      })
    }
  );

  expect(result.draft.slug).toBe("hr-docs-2");
  expect(result.adminGroup.name).toBe("Docsera_HR_Docs_2_Admins");
  expect(result.editorGroup.name).toBe("Docsera_HR_Docs_2_Editors");
});

test("provisionWorkspace accepts a bulk access bridge dependency", async () => {
  const result = await provisionWorkspace(
    {
      name: "Bridge Workspace",
      creatorUserSysId: "user-123"
    },
    {
      provisionAccessGroups: async (draft) => ({
        adminGroup: {
          sysId: `${draft.adminGroupName}-sys-id`,
          name: draft.adminGroupName
        },
        editorGroup: {
          sysId: `${draft.editorGroupName}-sys-id`,
          name: draft.editorGroupName
        }
      }),
      saveWorkspace: async (workspace) => ({
        ...workspace,
        sysId: "workspace-bridge-001"
      })
    }
  );

  expect(result.workspace.adminGroupSysId).toBe("Docsera_Bridge_Workspace_Admins-sys-id");
  expect(result.workspace.editorGroupSysId).toBe("Docsera_Bridge_Workspace_Editors-sys-id");
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

test("provisionWorkspace rolls back bridge-provisioned groups when persistence fails", async () => {
  const deletedProvisionedGroups: string[] = [];

  await expect(
    provisionWorkspace(
      {
        name: "Broken Bridge Workspace",
        creatorUserSysId: "user-123"
      },
      {
        provisionAccessGroups: async (draft) => ({
          adminGroup: {
            sysId: `${draft.adminGroupName}-sys-id`,
            name: draft.adminGroupName
          },
          editorGroup: {
            sysId: `${draft.editorGroupName}-sys-id`,
            name: draft.editorGroupName
          }
        }),
        deleteProvisionedAccessGroups: async (groups) => {
          deletedProvisionedGroups.push(groups.editorGroup.sysId, groups.adminGroup.sysId);
        },
        saveWorkspace: async () => {
          throw new Error("Bridge persistence failed");
        }
      }
    )
  ).rejects.toThrow("Bridge persistence failed");

  expect(deletedProvisionedGroups).toEqual([
    "Docsera_Broken_Bridge_Workspace_Editors-sys-id",
    "Docsera_Broken_Bridge_Workspace_Admins-sys-id"
  ]);
});
