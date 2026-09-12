import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRecord } from "./serverWorkspaceDomain.ts";
import {
  createWorkspaceMembershipService,
  type WorkspaceMember,
  type WorkspaceMemberMutationBridge
} from "./serviceNowWorkspaceMembers.ts";

function workspace(overrides: Partial<WorkspaceRecord> = {}): WorkspaceRecord {
  return {
    adminGroupSysId: "admin-group",
    creatorUserSysId: "creator-1",
    editorGroupSysId: "editor-group",
    icon: { key: "docsera-workspace", label: "Docsera workspace icon", type: "builtin" },
    layout: { pageWidth: "readable", tocVisible: true },
    name: "Platform Docs",
    shortDescription: null,
    slug: "platform-docs",
    status: "active",
    sysId: "workspace-1",
    ...overrides
  };
}

function member(overrides: Partial<WorkspaceMember> = {}): WorkspaceMember {
  return {
    accessLevel: "editor",
    active: true,
    displayName: "Editor One",
    email: "editor@example.com",
    userName: "editor.one",
    userSysId: "user-editor",
    ...overrides
  };
}

function service({
  canManageWorkspaceMembers = true,
  docseraAdmin = false,
  membersByGroup = new Map<string, WorkspaceMember[]>(),
  currentWorkspace = workspace()
}: {
  canManageWorkspaceMembers?: boolean;
  currentWorkspace?: WorkspaceRecord | null;
  docseraAdmin?: boolean;
  membersByGroup?: Map<string, WorkspaceMember[]>;
} = {}) {
  const mutationBridge: WorkspaceMemberMutationBridge = {
    removeWorkspaceMembership: vi.fn(() => ({ status: "succeeded" })),
    setWorkspaceMembership: vi.fn(() => ({ status: "succeeded" }))
  };
  const dependencies = {
    evaluateWorkspaceCapabilities: vi.fn(() => ({ canManageWorkspaceMembers })),
    hasDocseraAdminAccess: vi.fn(() => docseraAdmin),
    listGroupMembers: vi.fn((groupSysId: string, accessLevel: "admin" | "editor") =>
      (membersByGroup.get(groupSysId) ?? []).map((entry) => ({ ...entry, accessLevel }))
    ),
    loadWorkspaceBySlug: vi.fn(() => currentWorkspace),
    loadWorkspaceBySysId: vi.fn(() => currentWorkspace),
    mutationBridge
  };

  return {
    dependencies,
    membershipService: createWorkspaceMembershipService(dependencies)
  };
}

describe("workspace membership service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists workspace members from native Admin and Editor groups with Admin winning duplicates", () => {
    const duplicateEditor = member({
      accessLevel: "editor",
      displayName: "Alex Same",
      userName: "alex.same",
      userSysId: "user-same"
    });
    const duplicateAdmin = member({
      ...duplicateEditor,
      accessLevel: "admin"
    });
    const editorOnly = member({ displayName: "Editor Only", userSysId: "user-editor" });
    const inactiveAdmin = member({
      accessLevel: "admin",
      active: false,
      displayName: "Inactive Admin",
      userSysId: "user-inactive-admin"
    });
    const membersByGroup = new Map([
      ["admin-group", [duplicateAdmin, inactiveAdmin]],
      ["editor-group", [duplicateEditor, editorOnly]]
    ]);
    const { membershipService } = service({ membersByGroup });

    expect(membershipService.listMembers({ workspaceSysId: "workspace-1" })).toEqual({
      kind: "succeeded",
      members: [
        expect.objectContaining({ accessLevel: "admin", displayName: "Alex Same", userSysId: "user-same" }),
        expect.objectContaining({ accessLevel: "editor", displayName: "Editor Only", userSysId: "user-editor" }),
        expect.objectContaining({ accessLevel: "admin", active: false, displayName: "Inactive Admin" })
      ]
    });
  });

  it("rejects unauthorized member reads and mutations before bridge calls", () => {
    const { dependencies, membershipService } = service({ canManageWorkspaceMembers: false });

    expect(membershipService.listMembers({ workspaceSysId: "workspace-1" })).toMatchObject({ kind: "forbidden" });
    expect(
      membershipService.setMemberAccess({ accessLevel: "admin", userSysId: "user-1", workspaceSysId: "workspace-1" })
    ).toMatchObject({ kind: "forbidden" });

    expect(dependencies.mutationBridge.setWorkspaceMembership).not.toHaveBeenCalled();
  });

  it("adds, promotes, demotes, and removes through the native group mutation bridge", () => {
    const membersByGroup = new Map<string, WorkspaceMember[]>([
      [
        "admin-group",
        [
          member({ accessLevel: "admin", displayName: "Admin One", userSysId: "admin-1" }),
          member({ accessLevel: "admin", displayName: "Admin Two", userSysId: "admin-2" })
        ]
      ],
      ["editor-group", [member({ accessLevel: "editor", displayName: "Editor One", userSysId: "editor-1" })]]
    ]);
    const { dependencies, membershipService } = service({ membersByGroup });

    expect(
      membershipService.setMemberAccess({ accessLevel: "editor", userSysId: "new-editor", workspaceSysId: "workspace-1" })
    ).toMatchObject({ kind: "succeeded" });
    expect(
      membershipService.setMemberAccess({ accessLevel: "admin", userSysId: "editor-1", workspaceSysId: "workspace-1" })
    ).toMatchObject({ kind: "succeeded" });
    expect(
      membershipService.setMemberAccess({ accessLevel: "editor", userSysId: "admin-1", workspaceSysId: "workspace-1" })
    ).toMatchObject({ kind: "succeeded" });
    expect(membershipService.removeMemberAccess({ userSysId: "editor-1", workspaceSysId: "workspace-1" })).toMatchObject({
      kind: "succeeded"
    });

    expect(dependencies.mutationBridge.setWorkspaceMembership).toHaveBeenNthCalledWith(
      1,
      "admin-group",
      "editor-group",
      "new-editor",
      "editor"
    );
    expect(dependencies.mutationBridge.setWorkspaceMembership).toHaveBeenNthCalledWith(
      2,
      "admin-group",
      "editor-group",
      "editor-1",
      "admin"
    );
    expect(dependencies.mutationBridge.setWorkspaceMembership).toHaveBeenNthCalledWith(
      3,
      "admin-group",
      "editor-group",
      "admin-1",
      "editor"
    );
    expect(dependencies.mutationBridge.removeWorkspaceMembership).toHaveBeenCalledWith("admin-group", "editor-group", "editor-1");
  });

  it("protects the last active Workspace Admin from demotion or removal unless the caller is a Docsera Admin", () => {
    const membersByGroup = new Map<string, WorkspaceMember[]>([
      ["admin-group", [member({ accessLevel: "admin", active: true, displayName: "Last Admin", userSysId: "admin-1" })]],
      ["editor-group", []]
    ]);
    const { dependencies, membershipService } = service({ membersByGroup });

    expect(
      membershipService.setMemberAccess({ accessLevel: "editor", userSysId: "admin-1", workspaceSysId: "workspace-1" })
    ).toMatchObject({ kind: "forbidden" });
    expect(membershipService.removeMemberAccess({ userSysId: "admin-1", workspaceSysId: "workspace-1" })).toMatchObject({
      kind: "forbidden"
    });
    expect(dependencies.mutationBridge.setWorkspaceMembership).not.toHaveBeenCalled();
    expect(dependencies.mutationBridge.removeWorkspaceMembership).not.toHaveBeenCalled();

    const recovery = service({ docseraAdmin: true, membersByGroup });
    expect(
      recovery.membershipService.setMemberAccess({ accessLevel: "editor", userSysId: "admin-1", workspaceSysId: "workspace-1" })
    ).toMatchObject({ kind: "succeeded" });
    expect(recovery.membershipService.removeMemberAccess({ userSysId: "admin-1", workspaceSysId: "workspace-1" })).toMatchObject({
      kind: "succeeded"
    });
  });
});
