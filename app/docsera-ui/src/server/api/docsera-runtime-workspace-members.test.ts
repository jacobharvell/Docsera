import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ gsError: vi.fn(), listMembers: vi.fn(), searchUsers: vi.fn() }));

vi.mock("@servicenow/glide", () => ({ gs: { error: mocks.gsError } }));
vi.mock("../workspaces/serviceNowWorkspaceMembers.ts", () => ({
  createServiceNowWorkspaceMembershipService: () => ({ listMembers: mocks.listMembers, searchUsers: mocks.searchUsers })
}));

import { listWorkspaceMembers, searchWorkspaceMemberUsers } from "./docsera-runtime-workspace-members.ts";

function responseRecorder() {
  return { body: undefined as unknown, status: undefined as number | undefined, setBody(payload: unknown) { this.body = payload; }, setStatus(status: number) { this.status = status; } };
}

describe("workspace membership error logging", () => {
  beforeEach(() => { mocks.gsError.mockReset(); mocks.listMembers.mockReset(); mocks.searchUsers.mockReset(); });

  it("redacts query data while retaining bounded list and search metadata", () => {
    mocks.listMembers.mockImplementation(() => { throw new Error("list failure"); });
    mocks.searchUsers.mockImplementation(() => { throw new Error("search failure"); });
    const request = { queryString: "workspaceSysId=QUERY-WORKSPACE-MARKER&q=QUERY-TERM-MARKER&exclude=user-1,user-2&unexpected=UNEXPECTED-QUERY-MARKER" };

    listWorkspaceMembers(request, responseRecorder());
    searchWorkspaceMemberUsers(request, responseRecorder());

    const logs = mocks.gsError.mock.calls.map(([entry]) => String(entry)).join("\n");
    expect(logs).toContain("\"workspaceSysIdLength\":22");
    expect(logs).toContain("\"termLength\":17");
    expect(logs).toContain("\"excludedUserCount\":2");
    expect(logs).not.toContain("QUERY-WORKSPACE-MARKER");
    expect(logs).not.toContain("QUERY-TERM-MARKER");
    expect(logs).not.toContain("UNEXPECTED-QUERY-MARKER");
  });
});
