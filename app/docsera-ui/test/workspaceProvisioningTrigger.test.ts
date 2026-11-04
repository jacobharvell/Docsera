import { beforeEach, describe, expect, it, vi } from "vitest";

const { claimWorkspaceIcon, restoreWorkspaceIconClaim, operationLog, records } = vi.hoisted(() => ({
  claimWorkspaceIcon: vi.fn(),
  operationLog: [] as Array<{ fields?: Record<string, string>; name: string; table: string; value?: string }>,
  records: new Map<string, Record<string, string>>(),
  restoreWorkspaceIconClaim: vi.fn()
}));

vi.mock("@servicenow/glide", () => {
  class FakeGlideRecord {
    private fields: Record<string, string> = {};
    private index = -1;
    private newGuidValue = "";
    private queryRows: Array<Record<string, string>> = [];

    constructor(private readonly table: string) {}

    addQuery() {}

    get(fieldName: string, value: string) {
      const row = records.get(`${this.table}:${fieldName}:${value}`);
      if (!row) {
        return false;
      }
      this.fields = { ...row };
      return true;
    }

    getLastErrorMessage() {
      return "";
    }

    getUniqueValue() {
      return this.fields.sys_id ?? "";
    }

    getValue(fieldName: string) {
      return this.fields[fieldName] ?? "";
    }

    initialize() {
      this.fields = {};
      this.newGuidValue = "";
      operationLog.push({ name: "initialize", table: this.table });
    }

    insert() {
      const sysId = this.newGuidValue || `${this.table}-inserted`;
      this.fields.sys_id = sysId;
      records.set(`${this.table}:sys_id:${sysId}`, { ...this.fields });
      operationLog.push({ fields: { ...this.fields }, name: "insert", table: this.table, value: sysId });
      this.newGuidValue = "";
      return sysId;
    }

    next() {
      this.index += 1;
      const row = this.queryRows[this.index];
      if (!row) {
        return false;
      }
      this.fields = { ...row };
      return true;
    }

    query() {
      this.index = -1;
      this.queryRows = [];
      operationLog.push({ name: "query", table: this.table });
    }

    setLimit() {}

    setNewGuidValue(value: string) {
      this.newGuidValue = value;
      operationLog.push({ name: "setNewGuidValue", table: this.table, value });
    }

    setValue(fieldName: string, value: unknown) {
      this.fields[fieldName] = String(value ?? "");
      operationLog.push({ name: `setValue:${fieldName}`, table: this.table, value: String(value ?? "") });
    }

    update() {
      operationLog.push({ fields: { ...this.fields }, name: "update", table: this.table });
      return true;
    }
  }

  return {
    GlideDateTime: vi.fn(() => ({ getDisplayValue: () => "2026-09-02 10:00:00" })),
    GlideRecord: FakeGlideRecord,
    gs: {
      error: vi.fn(),
      generateGUID: vi.fn(() => "request-uploaded-001"),
      getUserID: vi.fn(() => "user-001"),
      getUserName: vi.fn(() => "Jacob")
    }
  };
});

vi.mock("../src/server/workspaces/serviceNowWorkspaceIcons.ts", () => ({
  createServiceNowWorkspaceIconService: () => ({
    claimWorkspaceIcon,
    restoreWorkspaceIconClaim
  })
}));

import { createServiceNowWorkspaceProvisioningService } from "../src/server/workspaces/serviceNowWorkspaceProvisioning.ts";

const requestTable = "x_2300756_docsera_workspace_provision_request";

describe("workspace provisioning trigger contract", () => {
  beforeEach(() => {
    operationLog.length = 0;
    records.clear();
    claimWorkspaceIcon.mockReset();
    restoreWorkspaceIconClaim.mockReset();
    claimWorkspaceIcon.mockImplementation((assetKey: string, provisionRequestSysId: string) => {
      operationLog.push({ name: "claimWorkspaceIcon", table: "workspace-icon-service", value: `${assetKey}:${provisionRequestSysId}` });
      return {
      asset: { sysId: "asset-001" },
      icon: {
        assetPath: "/api/x_2300756_docsera/docsera_runtime/workspaces/icons/file?assetKey=asset-key-001",
        key: "asset-key-001",
        label: "Canonical uploaded icon.png",
        type: "uploaded"
      },
      kind: "succeeded"
      };
    });
  });

  it("claims and canonicalizes uploaded icon metadata before the single requested insert", async () => {
    const service = createServiceNowWorkspaceProvisioningService();

    const outcome = await service.createWorkspace({
      icon: {
        key: "asset-key-001",
        type: "uploaded"
      },
      name: "Uploaded Icon Workspace",
      shortDescription: "Uses an uploaded icon."
    });

    expect(outcome).toMatchObject({
      kind: "pending",
      requestId: "request-uploaded-001",
      state: "requested"
    });
    expect(claimWorkspaceIcon).toHaveBeenCalledWith("asset-key-001", "request-uploaded-001");
    expect(restoreWorkspaceIconClaim).not.toHaveBeenCalled();

    const provisioningOperations = operationLog.filter((entry) => entry.table === requestTable);
    expect(provisioningOperations.filter((entry) => entry.name === "insert")).toHaveLength(1);
    expect(provisioningOperations.some((entry) => entry.name === "update")).toBe(false);
    expect(provisioningOperations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: "setNewGuidValue", value: "request-uploaded-001" }),
        expect.objectContaining({ name: "setValue:state", value: "requested" }),
        expect.objectContaining({ name: "setValue:icon_label", value: "Canonical uploaded icon.png" }),
        expect.objectContaining({
          name: "setValue:icon_asset_path",
          value: "/api/x_2300756_docsera/docsera_runtime/workspaces/icons/file?assetKey=asset-key-001"
        })
      ])
    );

    const claimOrder = operationLog.findIndex((entry) => entry.name === "claimWorkspaceIcon");
    const insertOrder = operationLog.findIndex((entry) => entry.table === requestTable && entry.name === "insert");
    const canonicalPathOrder = operationLog.findIndex((entry) => entry.table === requestTable && entry.name === "setValue:icon_asset_path");
    expect(canonicalPathOrder).toBeGreaterThanOrEqual(0);
    expect(claimOrder).toBeGreaterThanOrEqual(0);
    expect(insertOrder).toBeGreaterThan(canonicalPathOrder);
    expect(claimOrder).toBeLessThan(insertOrder);

    const insert = provisioningOperations.find((entry) => entry.name === "insert");
    expect(insert?.fields).toMatchObject({
      icon_asset_path: "/api/x_2300756_docsera/docsera_runtime/workspaces/icons/file?assetKey=asset-key-001",
      icon_key: "asset-key-001",
      icon_label: "Canonical uploaded icon.png",
      icon_type: "uploaded",
      requested_by: "user-001",
      state: "requested",
      sys_id: "request-uploaded-001"
    });
    expect(provisioningOperations).not.toContainEqual(expect.objectContaining({ name: "setValue:state", value: "processing" }));
  });

  it("keeps built-in icon provisioning on the direct requested insert path", async () => {
    const service = createServiceNowWorkspaceProvisioningService();

    const outcome = await service.createWorkspace({
      name: "Built In Icon Workspace",
      shortDescription: "Uses the default icon."
    });

    expect(outcome).toMatchObject({
      kind: "pending",
      requestId: `${requestTable}-inserted`,
      state: "requested"
    });
    expect(claimWorkspaceIcon).not.toHaveBeenCalled();
    expect(operationLog).not.toContainEqual(expect.objectContaining({ name: "setNewGuidValue", table: requestTable }));
    expect(operationLog).not.toContainEqual(expect.objectContaining({ name: "update", table: requestTable }));

    const inserts = operationLog.filter((entry) => entry.table === requestTable && entry.name === "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]?.fields).toMatchObject({
      icon_type: "builtin",
      requested_by: "user-001",
      state: "requested"
    });
  });

  it("queues workspace creation without an initial Workspace Admin", async () => {
    const service = createServiceNowWorkspaceProvisioningService();

    await expect(service.createWorkspace({ name: "No Initial Admin" })).resolves.toMatchObject({
      kind: "pending",
      state: "requested"
    });

    const insert = operationLog.find((entry) => entry.table === requestTable && entry.name === "insert");
    expect(insert?.fields).toMatchObject({
      requested_by: "user-001",
      state: "requested"
    });
    expect(insert?.fields).not.toHaveProperty("initial_admin_user");
  });
});
