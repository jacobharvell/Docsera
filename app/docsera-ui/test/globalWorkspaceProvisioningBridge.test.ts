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
  "docsera-global-workspace-provisioning-bridge.js"
);

type Row = Record<string, string>;

function createBridge() {
  const inserts: Record<string, Row[]> = {};
  const updates: Record<string, Row[]> = {};
  const tables: Record<string, Row[]> = {
    sys_user: [{ active: "true", sys_id: "creator-user" }],
    sys_user_group: [],
    sys_user_role: [
      { name: "x_82900_docsera.workspace_admin", sys_id: "workspace-admin-role" },
      { name: "x_82900_docsera.editor", sys_id: "editor-role" }
    ],
    sys_group_has_role: [],
    sys_user_grmember: [],
    x_82900_docsera_workspace: [],
    x_82900_docsera_workspace_icon_asset: [],
    x_82900_docsera_workspace_provision_request: [
      {
        admin_group_name: "Docsera_Product_Docs_Admins",
        editor_group_name: "Docsera_Product_Docs_Editors",
        icon_key: "docsera-workspace",
        icon_label: "Docsera",
        icon_type: "builtin",
        name: "Product Docs",
        page_width: "readable",
        requested_by: "creator-user",
        short_description: "Product docs",
        state: "requested",
        sys_id: "request-1",
        toc_default_visible: "true",
        workspace_group_key: "Product_Docs",
        workspace_slug: "product-docs",
        workspace_status: "active"
      }
    ]
  };

  function GlideRecord(this: any, tableName: string) {
    this.tableName = tableName;
    this.queries = [];
    this.current = null;
    this.pending = {};
    this.addQuery = (field: string, operatorOrValue: string, maybeValue?: string) => {
      this.queries.push({ field, value: maybeValue ?? operatorOrValue, operator: maybeValue ? operatorOrValue : "=" });
    };
    this.setLimit = (limit: number) => {
      this.limit = limit;
    };
    this.query = () => {
      const rows = tables[tableName] ?? [];
      const matches = rows.filter((row) =>
        this.queries.every((query: { field: string; operator: string; value: string }) => {
          if (query.operator === "IN") {
            return query.value.split(",").includes(row[query.field]);
          }
          return row[query.field] === query.value;
        })
      );
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
    this.get = (fieldOrSysId: string, maybeValue?: string) => {
      const field = maybeValue ? fieldOrSysId : "sys_id";
      const value = maybeValue ?? fieldOrSysId;
      const row = (tables[tableName] ?? []).find((candidate) => candidate[field] === value);
      if (!row) return false;
      this.current = row;
      return true;
    };
    this.getUniqueValue = () => this.current?.sys_id ?? "";
    this.getValue = (field: string) => this.current?.[field] ?? this.pending[field] ?? "";
    this.initialize = () => {
      this.pending = {};
      this.current = null;
    };
    this.setValue = (field: string, value: string) => {
      if (this.current) {
        this.current[field] = String(value ?? "");
      }
      this.pending[field] = String(value ?? "");
    };
    this.insert = () => {
      const sysId = `${tableName}-${(tables[tableName] ?? []).length + 1}`;
      const row = { ...this.pending, sys_id: sysId };
      tables[tableName] = [...(tables[tableName] ?? []), row];
      inserts[tableName] = [...(inserts[tableName] ?? []), row];
      this.current = row;
      return sysId;
    };
    this.update = () => {
      updates[tableName] = [...(updates[tableName] ?? []), { ...(this.current ?? this.pending) }];
      return true;
    };
    this.updateMultiple = () => true;
    this.deleteRecord = () => true;
  }

  const sandbox = {
    Class: { create: () => function Bridge(this: any) {} },
    GlideRecord,
    gs: { error: vi.fn() }
  };
  vm.runInNewContext(readFileSync(bridgeSourcePath, "utf8"), sandbox);

  return {
    bridge: new (sandbox as any).DocseraGlobalWorkspaceProvisioningBridge(),
    inserts,
    tables,
    updates
  };
}

describe("global workspace provisioning bridge", () => {
  it("creates role-bearing access groups without automatic membership and preserves creator audit metadata", () => {
    const { bridge, inserts, tables } = createBridge();

    expect(bridge.processRequest("request-1")).toMatchObject({ status: "succeeded" });

    const adminGroup = tables.sys_user_group.find((row) => row.name === "Docsera_Product_Docs_Admins");
    const editorGroup = tables.sys_user_group.find((row) => row.name === "Docsera_Product_Docs_Editors");
    expect(adminGroup?.sys_id).toBeTruthy();
    expect(editorGroup?.sys_id).toBeTruthy();
    expect(inserts.sys_group_has_role).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ group: adminGroup?.sys_id, role: "workspace-admin-role" }),
        expect.objectContaining({ group: editorGroup?.sys_id, role: "editor-role" })
      ])
    );
    expect(inserts.sys_user_grmember ?? []).toEqual([]);
    expect(inserts.x_82900_docsera_workspace?.[0]).toMatchObject({
      creator: "creator-user"
    });
  });
});
