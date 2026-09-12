import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

const testDir = dirname(fileURLToPath(import.meta.url));
const bridgeSourcePath = resolve(
  testDir,
  "..",
  "..",
  "docsera-global-bridge",
  "src",
  "server",
  "script-includes",
  "docsera-global-workspace-membership-bridge.js"
);

type Row = Record<string, string>;

function createBridge({ workspaces = [], memberships = [] }: { workspaces?: Row[]; memberships?: Row[] }) {
  const inserts: Row[] = [];
  const deletes: Row[] = [];
  const tables: Record<string, Row[]> = {
    sys_user_grmember: memberships,
    x_82900_docsera_workspace: workspaces
  };

  function GlideRecord(this: any, tableName: string) {
    this.tableName = tableName;
    this.queries = [];
    this.current = null;
    this.pending = {};
    this.addQuery = (field: string, value: string) => this.queries.push({ field, value });
    this.setLimit = (limit: number) => {
      this.limit = limit;
    };
    this.query = () => {
      const rows = tables[tableName] ?? [];
      const matches = rows.filter((row) => this.queries.every((query: Row) => row[query.field] === query.value));
      this.results = typeof this.limit === "number" ? matches.slice(0, this.limit) : matches;
      this.index = 0;
    };
    this.next = () => {
      const row = this.results?.[this.index];
      if (!row) return false;
      this.current = row;
      this.index += 1;
      return true;
    };
    this.initialize = () => {
      this.pending = {};
    };
    this.setValue = (field: string, value: string) => {
      this.pending[field] = value;
    };
    this.insert = () => {
      inserts.push({ ...this.pending });
      return "inserted-membership";
    };
    this.deleteRecord = () => {
      deletes.push({ ...this.current });
    };
  }

  const sandbox = {
    Class: { create: () => function Bridge(this: any) {} },
    GlideRecord,
    gs: { error: vi.fn() }
  };
  vm.runInNewContext(readFileSync(bridgeSourcePath, "utf8"), sandbox);

  return {
    bridge: new (sandbox as any).DocseraGlobalWorkspaceMembershipBridge(),
    deletes,
    inserts
  };
}

describe("global workspace membership bridge", () => {
  it("rejects arbitrary non-workspace group pairs before mutating sys_user_grmember", () => {
    const { bridge, deletes, inserts } = createBridge({
      workspaces: [{ admin_group: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", editor_group: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }]
    });

    expect(
      bridge.setWorkspaceMembership(
        "cccccccccccccccccccccccccccccccc",
        "dddddddddddddddddddddddddddddddd",
        "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        "editor"
      )
    ).toMatchObject({ status: "failed" });

    expect(inserts).toEqual([]);
    expect(deletes).toEqual([]);
  });

  it("allows mutations only for a stored Docsera workspace Admin and Editor group pair", () => {
    const { bridge, inserts } = createBridge({
      workspaces: [{ admin_group: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", editor_group: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" }]
    });

    expect(
      bridge.setWorkspaceMembership(
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
        "editor"
      )
    ).toMatchObject({ status: "succeeded" });

    expect(inserts).toEqual([{ group: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb", user: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee" }]);
  });
});
