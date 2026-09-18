import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const workerSourcePath = resolve(
  testDir,
  "..",
  "..",
  "docsera-global-bridge",
  "src",
  "server",
  "business-rules",
  "process-workspace-member-mutation-command.js"
);
const scopedServiceSourcePath = resolve(testDir, "..", "src", "server", "workspaces", "serviceNowWorkspaceMembers.ts");

type Row = Record<string, string>;

function runWorker({
  bridgeResult = { status: "succeeded" },
  command = {
    access_level: "admin",
    mutation_kind: "set",
    state: "requested",
    target_user: "target-user",
    workspace: "workspace-1"
  },
  workspace = {
    admin_group: "admin-group",
    editor_group: "editor-group",
    sys_id: "workspace-1"
  }
}: {
  bridgeResult?: { status: string; errorMessage?: string };
  command?: Row;
  workspace?: Row | null;
} = {}) {
  const calls: Array<Record<string, string>> = [];
  const updates: Row[] = [];
  const current = {
    data: { ...command },
    getValue(field: string) {
      return this.data[field] ?? "";
    },
    setValue(field: string, value: string) {
      this.data[field] = value;
    },
    update() {
      updates.push({ ...this.data });
    }
  };

  function GlideRecord(this: any) {
    this.get = (sysId: string) => {
      if (!workspace || workspace.sys_id !== sysId) return false;
      this.current = workspace;
      return true;
    };
    this.getValue = (field: string) => this.current?.[field] ?? "";
  }

  function DocseraGlobalWorkspaceMembershipBridge(this: any) {
    this.setWorkspaceMembership = (adminGroupSysId: string, editorGroupSysId: string, userSysId: string, accessLevel: string) => {
      calls.push({ accessLevel, adminGroupSysId, editorGroupSysId, kind: "set", userSysId });
      return bridgeResult;
    };
    this.removeWorkspaceMembership = (adminGroupSysId: string, editorGroupSysId: string, userSysId: string) => {
      calls.push({ adminGroupSysId, editorGroupSysId, kind: "remove", userSysId });
      return bridgeResult;
    };
  }

  vm.runInNewContext(readFileSync(workerSourcePath, "utf8"), {
    current,
    DocseraGlobalWorkspaceMembershipBridge,
    GlideRecord,
    previous: null
  });

  return { calls, current: current.data, updates };
}

describe("global workspace membership mutation command worker", () => {
  it("synchronously invokes the existing Global membership bridge with workspace-owned groups", () => {
    expect(runWorker().calls).toEqual([
      {
        accessLevel: "admin",
        adminGroupSysId: "admin-group",
        editorGroupSysId: "editor-group",
        kind: "set",
        userSysId: "target-user"
      }
    ]);
  });

  it("records failure diagnostics when the bridge rejects the mutation", () => {
    const result = runWorker({ bridgeResult: { errorMessage: "Workspace membership could not be updated.", status: "failed" } });

    expect(result.current).toMatchObject({
      error_message: "Workspace membership could not be updated.",
      state: "failed"
    });
    expect(result.updates).toHaveLength(1);
  });

  it("keeps scoped membership service free of direct Global Script Include construction", () => {
    const source = readFileSync(scopedServiceSourcePath, "utf8");

    expect(source).not.toContain("@servicenow/glide/global");
    expect(source).not.toContain("DocseraGlobalWorkspaceMembershipBridge");
    expect(source).not.toContain("new global.");
  });
});
