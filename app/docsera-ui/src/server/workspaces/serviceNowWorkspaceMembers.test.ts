import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceRecord } from "./serverWorkspaceDomain.ts";

const glideMock = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const rowsByTable = new Map<string, Row[]>();

  class FakeCondition {
    constructor(private readonly group: Array<{ field: string; operator: string; value: unknown }>) {}

    addOrCondition(field: string, operator: string, value: unknown) {
      this.group.push({ field, operator, value });
      return this;
    }
  }

  class FakeGlideRecord {
    private filters: Array<Array<{ field: string; operator: string; value: unknown }>> = [];
    private orderedBy = "";
    private limit = Number.POSITIVE_INFINITY;
    private results: Row[] = [];
    private index = -1;

    constructor(private readonly tableName: string) {}

    addQuery(field: string, operatorOrValue: unknown, maybeValue?: unknown) {
      const condition = {
        field,
        operator: typeof maybeValue === "undefined" ? "=" : String(operatorOrValue),
        value: typeof maybeValue === "undefined" ? operatorOrValue : maybeValue
      };
      const group = [condition];
      this.filters.push(group);
      return new FakeCondition(group);
    }

    orderBy(field: string) {
      this.orderedBy = field;
    }

    setLimit(limit: number) {
      this.limit = limit;
    }

    query() {
      const rows = [...(rowsByTable.get(this.tableName) ?? [])]
        .filter((row) => this.filters.every((group) => group.some((condition) => matchesCondition(row, condition))))
        .sort((a, b) => String(a[this.orderedBy] ?? "").localeCompare(String(b[this.orderedBy] ?? "")));
      this.results = rows.slice(0, this.limit);
      this.index = -1;
    }

    next() {
      this.index += 1;
      return this.index < this.results.length;
    }

    getValue(field: string) {
      return String(this.results[this.index]?.[field] ?? "");
    }

    getDisplayValue(field: string) {
      return this.getValue(field);
    }

    initialize() {
      this.results = [{}];
      this.index = 0;
    }

    setValue(field: string, value: unknown) {
      if (this.index < 0) {
        this.initialize();
      }
      this.results[this.index][field] = value;
    }

    insert() {
      const sysId = `inserted-${(rowsByTable.get(this.tableName) ?? []).length + 1}`;
      rowsByTable.set(this.tableName, [...(rowsByTable.get(this.tableName) ?? []), { ...this.results[this.index], sys_id: sysId }]);
      return sysId;
    }
  }

  function matchesCondition(row: Row, condition: { field: string; operator: string; value: unknown }) {
    const value = row[condition.field];
    if (condition.operator === "CONTAINS") return String(value ?? "").toLowerCase().includes(String(condition.value ?? "").toLowerCase());
    if (condition.operator === "NOT IN") return !String(condition.value ?? "").split(",").includes(String(value ?? ""));
    return value === condition.value;
  }

  return { FakeGlideRecord, rowsByTable };
});

vi.mock("@servicenow/glide", () => ({
  GlideRecord: glideMock.FakeGlideRecord,
  gs: {
    getUserID: vi.fn(() => "current-user")
  }
}));

import {
  DOCSERA_WORKSPACE_MEMBERSHIP_MUTATION_COMMAND_TABLE,
  createMembershipMutationCommand,
  createWorkspaceMembershipService,
  searchActiveUsers,
  type WorkspaceMember
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
  mutateNativeMemberships = true,
  membersByGroup = new Map<string, WorkspaceMember[]>(),
  currentWorkspace = workspace()
}: {
  canManageWorkspaceMembers?: boolean;
  currentWorkspace?: WorkspaceRecord | null;
  docseraAdmin?: boolean;
  mutateNativeMemberships?: boolean;
  membersByGroup?: Map<string, WorkspaceMember[]>;
} = {}) {
  const commands: Array<{ accessLevel: "admin" | "editor" | null; kind: "set" | "remove"; targetUserSysId: string; workspaceSysId: string }> = [];
  function removeFromGroup(groupSysId: string, userSysId: string) {
    membersByGroup.set(groupSysId, (membersByGroup.get(groupSysId) ?? []).filter((entry) => entry.userSysId !== userSysId));
  }
  function addToGroup(groupSysId: string, accessLevel: "admin" | "editor", userSysId: string) {
    if ((membersByGroup.get(groupSysId) ?? []).some((entry) => entry.userSysId === userSysId)) {
      return;
    }
    membersByGroup.set(groupSysId, [
      ...(membersByGroup.get(groupSysId) ?? []),
      member({ accessLevel, displayName: `User ${userSysId}`, userName: userSysId, userSysId })
    ]);
  }
  const dependencies = {
    evaluateWorkspaceCapabilities: vi.fn(() => ({ canManageWorkspaceMembers })),
    hasDocseraAdminAccess: vi.fn(() => docseraAdmin),
    listGroupMembers: vi.fn((groupSysId: string, accessLevel: "admin" | "editor") =>
      (membersByGroup.get(groupSysId) ?? []).map((entry) => ({ ...entry, accessLevel }))
    ),
    loadWorkspaceBySlug: vi.fn(() => currentWorkspace),
    loadWorkspaceBySysId: vi.fn(() => currentWorkspace),
    createMutationCommand: vi.fn((command) => {
      commands.push(command);
      if (mutateNativeMemberships && currentWorkspace) {
        if (command.kind === "remove") {
          removeFromGroup(currentWorkspace.adminGroupSysId, command.targetUserSysId);
          removeFromGroup(currentWorkspace.editorGroupSysId, command.targetUserSysId);
        } else if (command.accessLevel === "admin") {
          addToGroup(currentWorkspace.adminGroupSysId, "admin", command.targetUserSysId);
          removeFromGroup(currentWorkspace.editorGroupSysId, command.targetUserSysId);
        } else if (command.accessLevel === "editor") {
          addToGroup(currentWorkspace.editorGroupSysId, "editor", command.targetUserSysId);
          removeFromGroup(currentWorkspace.adminGroupSysId, command.targetUserSysId);
        }
      }
      return `command-${commands.length}`;
    }),
    searchActiveUsers: vi.fn((term: string, excludedUserSysIds: string[], limit: number) => [
      member({ displayName: `Result ${term}`, userSysId: "search-user" })
    ].filter((entry) => !excludedUserSysIds.includes(entry.userSysId)).slice(0, limit))
  };

  return {
    commands,
    dependencies,
    membershipService: createWorkspaceMembershipService(dependencies)
  };
}

describe("workspace membership service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    glideMock.rowsByTable.clear();
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
      callerCapabilities: {
        canManageWorkspaceMembers: true
      },
      kind: "succeeded",
      members: [
        expect.objectContaining({ accessLevel: "admin", displayName: "Alex Same", userSysId: "user-same" }),
        expect.objectContaining({ accessLevel: "editor", displayName: "Editor Only", userSysId: "user-editor" }),
        expect.objectContaining({ accessLevel: "admin", active: false, displayName: "Inactive Admin" })
      ]
    });
  });

  it("returns an empty member list without creating a mutation command", () => {
    const currentWorkspace = workspace();
    const dependencies = {
      evaluateWorkspaceCapabilities: vi.fn(() => ({ canManageWorkspaceMembers: true })),
      hasDocseraAdminAccess: vi.fn(() => false),
      listGroupMembers: vi.fn(() => []),
      loadWorkspaceBySlug: vi.fn(() => currentWorkspace),
      loadWorkspaceBySysId: vi.fn(() => currentWorkspace),
      createMutationCommand: vi.fn(() => {
        throw new Error("mutation commands should not be created for member reads");
      }),
      searchActiveUsers: vi.fn(() => [])
    };
    const membershipService = createWorkspaceMembershipService(dependencies);

    expect(membershipService.listMembers({ workspaceSysId: "workspace-1" })).toEqual({
      callerCapabilities: {
        canManageWorkspaceMembers: true
      },
      kind: "succeeded",
      members: []
    });
    expect(dependencies.listGroupMembers).toHaveBeenCalledTimes(2);
    expect(dependencies.createMutationCommand).not.toHaveBeenCalled();
  });

  it("browses active users with an empty term only after authorization and excludes current workspace members plus paged users", () => {
    const membersByGroup = new Map<string, WorkspaceMember[]>([
      ["admin-group", [member({ accessLevel: "admin", displayName: "Admin One", userSysId: "admin-1" })]],
      ["editor-group", [member({ accessLevel: "editor", displayName: "Editor One", userSysId: "search-user" })]]
    ]);
    const { dependencies, membershipService } = service({ membersByGroup });

    expect(membershipService.searchUsers({ excludedUserSysIds: ["already-loaded"], term: "", workspaceSysId: "workspace-1" })).toEqual({
      callerCapabilities: {
        canManageWorkspaceMembers: true
      },
      kind: "succeeded",
      users: []
    });
    expect(dependencies.searchActiveUsers).toHaveBeenCalledWith("", ["admin-1", "search-user", "already-loaded"], 10);

    expect(membershipService.searchUsers({ term: "alex", workspaceSysId: "workspace-1" })).toEqual({
      callerCapabilities: {
        canManageWorkspaceMembers: true
      },
      kind: "succeeded",
      users: []
    });
    expect(dependencies.searchActiveUsers).toHaveBeenCalledWith("alex", ["admin-1", "search-user"], 10);
    expect(dependencies.createMutationCommand).not.toHaveBeenCalled();

    const unauthorized = service({ canManageWorkspaceMembers: false });
    expect(unauthorized.membershipService.searchUsers({ term: "alex", workspaceSysId: "workspace-1" })).toMatchObject({ kind: "forbidden" });
    expect(unauthorized.dependencies.searchActiveUsers).not.toHaveBeenCalled();
  });

  it("applies eligible-user exclusions to the active user query before the bounded result limit", () => {
    const firstTen = Array.from({ length: 10 }, (_, index) => ({
      active: true,
      email: `excluded-${index + 1}@example.com`,
      name: `Excluded ${index + 1}`,
      sys_id: `excluded-${index + 1}`,
      user_name: `excluded.${index + 1}`
    }));
    glideMock.rowsByTable.set("sys_user", [
      ...firstTen,
      { active: true, email: "eligible-one@example.com", name: "Eligible One", sys_id: "eligible-1", user_name: "eligible.one" },
      { active: true, email: "eligible-two@example.com", name: "Eligible Two", sys_id: "eligible-2", user_name: "eligible.two" },
      { active: false, email: "inactive@example.com", name: "Inactive Match", sys_id: "inactive-1", user_name: "inactive.match" }
    ]);

    expect(searchActiveUsers("", firstTen.map((user) => String(user.sys_id)), 10).map((user) => user.userSysId)).toEqual([
      "eligible-1",
      "eligible-2"
    ]);
    expect(searchActiveUsers("eligible", [...firstTen.map((user) => String(user.sys_id)), "eligible-1"], 10)).toEqual([
      {
        displayName: "Eligible Two",
        email: "eligible-two@example.com",
        userName: "eligible.two",
        userSysId: "eligible-2"
      }
    ]);
  });

  it("rejects unauthorized member reads and mutations before command creation", () => {
    const { dependencies, membershipService } = service({ canManageWorkspaceMembers: false });

    expect(membershipService.listMembers({ workspaceSysId: "workspace-1" })).toMatchObject({ kind: "forbidden" });
    expect(
      membershipService.setMemberAccess({ accessLevel: "admin", userSysId: "user-1", workspaceSysId: "workspace-1" })
    ).toMatchObject({ kind: "forbidden" });

    expect(dependencies.createMutationCommand).not.toHaveBeenCalled();
  });

  it("adds, promotes, demotes, and removes through constrained mutation commands with exact native group verification", () => {
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
    const { commands, membershipService } = service({ membersByGroup });

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

    expect(commands).toEqual([
      { accessLevel: "editor", kind: "set", targetUserSysId: "new-editor", workspaceSysId: "workspace-1" },
      { accessLevel: "admin", kind: "set", targetUserSysId: "editor-1", workspaceSysId: "workspace-1" },
      { accessLevel: "editor", kind: "set", targetUserSysId: "admin-1", workspaceSysId: "workspace-1" },
      { accessLevel: null, kind: "remove", targetUserSysId: "editor-1", workspaceSysId: "workspace-1" }
    ]);
    expect(membersByGroup.get("admin-group")?.some((entry) => entry.userSysId === "admin-1")).toBe(false);
    expect(membersByGroup.get("editor-group")?.some((entry) => entry.userSysId === "admin-1")).toBe(true);
  });

  it("reports failure when the synchronous command does not produce the exact authoritative group end state", () => {
    const membersByGroup = new Map<string, WorkspaceMember[]>([
      ["admin-group", [member({ accessLevel: "admin", displayName: "Admin One", userSysId: "admin-1" })]],
      ["editor-group", [member({ accessLevel: "editor", displayName: "Editor One", userSysId: "editor-1" })]]
    ]);
    const { membershipService } = service({ membersByGroup, mutateNativeMemberships: false });

    expect(
      membershipService.setMemberAccess({ accessLevel: "admin", userSysId: "editor-1", workspaceSysId: "workspace-1" })
    ).toEqual({
      errorMessage: "Workspace membership could not be updated.",
      kind: "failed",
      status: 500
    });
    expect(membershipService.removeMemberAccess({ userSysId: "editor-1", workspaceSysId: "workspace-1" })).toEqual({
      errorMessage: "Workspace membership could not be removed.",
      kind: "failed",
      status: 500
    });
  });

  it("inserts only the constrained mutation command fields for the ServiceNow handoff", () => {
    expect(
      createMembershipMutationCommand({
        accessLevel: "admin",
        kind: "set",
        targetUserSysId: "target-user",
        workspaceSysId: "workspace-1"
      })
    ).toBe("inserted-1");
    expect(glideMock.rowsByTable.get(DOCSERA_WORKSPACE_MEMBERSHIP_MUTATION_COMMAND_TABLE)).toEqual([
      {
        access_level: "admin",
        mutation_kind: "set",
        requested_by: "current-user",
        state: "requested",
        sys_id: "inserted-1",
        target_user: "target-user",
        workspace: "workspace-1"
      }
    ]);
  });

  it("protects the last active Workspace Admin from demotion or removal for ordinary Workspace Admins and Docsera Admins", () => {
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
    expect(dependencies.createMutationCommand).not.toHaveBeenCalled();

    const docseraAdmin = service({ docseraAdmin: true, membersByGroup });
    expect(
      docseraAdmin.membershipService.setMemberAccess({ accessLevel: "editor", userSysId: "admin-1", workspaceSysId: "workspace-1" })
    ).toMatchObject({ kind: "forbidden" });
    expect(docseraAdmin.membershipService.removeMemberAccess({ userSysId: "admin-1", workspaceSysId: "workspace-1" })).toMatchObject({
      kind: "forbidden"
    });
    expect(docseraAdmin.dependencies.createMutationCommand).not.toHaveBeenCalled();
  });

  it("allows demotion and removal once a second active Workspace Admin exists", () => {
    const demotionMembersByGroup = new Map<string, WorkspaceMember[]>([
      [
        "admin-group",
        [
          member({ accessLevel: "admin", active: true, displayName: "Admin One", userSysId: "admin-1" }),
          member({ accessLevel: "admin", active: true, displayName: "Admin Two", userSysId: "admin-2" })
        ]
      ],
      ["editor-group", []]
    ]);
    const demotion = service({ membersByGroup: demotionMembersByGroup });

    expect(
      demotion.membershipService.setMemberAccess({ accessLevel: "editor", userSysId: "admin-1", workspaceSysId: "workspace-1" })
    ).toMatchObject({ kind: "succeeded" });

    const removalMembersByGroup = new Map<string, WorkspaceMember[]>([
      [
        "admin-group",
        [
          member({ accessLevel: "admin", active: true, displayName: "Admin One", userSysId: "admin-1" }),
          member({ accessLevel: "admin", active: true, displayName: "Admin Two", userSysId: "admin-2" })
        ]
      ],
      ["editor-group", []]
    ]);
    const removal = service({ membersByGroup: removalMembersByGroup });

    expect(removal.membershipService.removeMemberAccess({ userSysId: "admin-2", workspaceSysId: "workspace-1" })).toMatchObject({
      kind: "succeeded"
    });
  });

  it("allows Docsera Admin zero-admin recovery by adding or promoting a replacement Workspace Admin", () => {
    const membersByGroup = new Map<string, WorkspaceMember[]>([
      ["admin-group", []],
      ["editor-group", [member({ accessLevel: "editor", active: true, displayName: "Editor One", userSysId: "editor-1" })]]
    ]);
    const { membershipService } = service({ docseraAdmin: true, membersByGroup });

    expect(
      membershipService.setMemberAccess({ accessLevel: "admin", userSysId: "new-admin", workspaceSysId: "workspace-1" })
    ).toMatchObject({ kind: "succeeded" });
    expect(
      membershipService.setMemberAccess({ accessLevel: "admin", userSysId: "editor-1", workspaceSysId: "workspace-1" })
    ).toMatchObject({ kind: "succeeded" });
  });
});
