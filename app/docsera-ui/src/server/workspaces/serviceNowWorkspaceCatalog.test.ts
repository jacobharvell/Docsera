import { beforeEach, describe, expect, it, vi } from "vitest";

const glideMock = vi.hoisted(() => {
  type Row = Record<string, unknown>;
  const rowsByTable = new Map<string, Row[]>();
  const operations: Array<{ table: string; filters: Array<{ field: string; value: unknown }> }> = [];

  class FakeGlideRecord {
    private filters: Array<{ field: string; value: unknown }> = [];
    private orderedBy = "";
    private limit = Number.POSITIVE_INFINITY;
    private results: Row[] = [];
    private index = -1;

    constructor(private readonly table: string) {}

    addQuery(field: string, operatorOrValue: unknown, maybeValue?: unknown) {
      this.filters.push({ field, value: maybeValue === undefined ? operatorOrValue : maybeValue });
      return this;
    }

    orderBy(field: string) {
      this.orderedBy = field;
    }

    setLimit(limit: number) {
      this.limit = limit;
    }

    query() {
      operations.push({ table: this.table, filters: [...this.filters] });
      this.results = [...(rowsByTable.get(this.table) ?? [])]
        .filter((row) => this.filters.every((filter) => row[filter.field] === filter.value))
        .sort((left, right) => String(left[this.orderedBy] ?? "").localeCompare(String(right[this.orderedBy] ?? "")))
        .slice(0, this.limit);
      this.index = -1;
    }

    next() {
      this.index += 1;
      return this.index < this.results.length;
    }

    getUniqueValue() {
      return String(this.results[this.index]?.sys_id ?? "");
    }

    getValue(field: string) {
      return String(this.results[this.index]?.[field] ?? "");
    }

    getDisplayValue(field: string) {
      return this.getValue(field);
    }
  }

  return { FakeGlideRecord, operations, rowsByTable };
});

vi.mock("@servicenow/glide", () => ({
  GlideRecord: glideMock.FakeGlideRecord,
  gs: {
    getUserID: vi.fn(() => "current-user"),
    hasRole: vi.fn((roleName: string) => roleName === "x_2300756_docsera.workspace_admin" || roleName === "x_2300756_docsera.editor")
  }
}));

import { createServiceNowWorkspaceCatalogService } from "./serviceNowWorkspaceCatalog.ts";

const WORKSPACE_TABLE = "x_2300756_docsera_workspace";
const MEMBERSHIP_TABLE = "sys_user_grmember";

function workspaceRow(index: number, name: string) {
  return {
    admin_group: `admin-${index}`,
    creator: "creator",
    editor_group: `editor-${index}`,
    icon_key: "docsera-workspace",
    icon_label: "Docsera workspace icon",
    icon_type: "builtin",
    name,
    page_width: "readable",
    status: "active",
    sys_id: `workspace-${index}`,
    toc_default_visible: "1",
    workspace_slug: `workspace-${index}`,
    workspace_state_revision: "0"
  };
}

function membershipQueryCount() {
  return glideMock.operations.filter((operation) => operation.table === MEMBERSHIP_TABLE).length;
}

function installOneHundredWorkspaceFixture() {
  const namedWorkspaces = ["Needle Alpha", "Needle Bravo", "Needle Charlie", "Needle Delta"];
  const otherWorkspaces = Array.from({ length: 96 }, (_, index) => `Workspace ${String(index + 1).padStart(3, "0")}`);
  glideMock.rowsByTable.set(WORKSPACE_TABLE, [...namedWorkspaces, ...otherWorkspaces].map((name, index) => workspaceRow(index, name)));
  glideMock.rowsByTable.set(MEMBERSHIP_TABLE, [
    { group: "admin-0", user: "current-user" },
    { group: "editor-1", user: "current-user" },
    { group: "editor-3", user: "current-user" }
  ]);
}

describe("ServiceNow workspace catalog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    glideMock.operations.length = 0;
    glideMock.rowsByTable.clear();
    installOneHundredWorkspaceFixture();
  });

  it("filters by canonical name before capability evaluation while preserving authorized search pagination", async () => {
    const result = await createServiceNowWorkspaceCatalogService().listWorkspaces({ page: 1, pageSize: 1, searchText: "  nEeDlE  " });

    expect(membershipQueryCount()).toBe(7);
    expect(result).toEqual({
      canCreateWorkspaces: false,
      hasNextPage: true,
      items: [expect.objectContaining({ name: "Needle Alpha", roleLabel: "Admin" })],
      page: 1,
      pageSize: 1,
      searchText: "needle",
      totalCount: 3
    });

    const secondPage = await createServiceNowWorkspaceCatalogService().listWorkspaces({ page: 2, pageSize: 1, searchText: "NEEDLE" });
    expect(secondPage).toMatchObject({
      hasNextPage: true,
      items: [expect.objectContaining({ name: "Needle Bravo", roleLabel: "Editor" })],
      page: 2,
      pageSize: 1,
      totalCount: 3
    });
    expect(membershipQueryCount()).toBe(14);
  });

  it("performs no workspace-specific membership queries when no names match", async () => {
    const result = await createServiceNowWorkspaceCatalogService().listWorkspaces({ searchText: "absent" });

    expect(membershipQueryCount()).toBe(0);
    expect(result).toEqual({
      canCreateWorkspaces: false,
      hasNextPage: false,
      items: [],
      page: 1,
      pageSize: 10,
      searchText: "absent",
      totalCount: 0
    });
  });

  it("retains unfiltered capability evaluation and results", async () => {
    const result = await createServiceNowWorkspaceCatalogService().listWorkspaces();

    expect(membershipQueryCount()).toBe(199);
    expect(result).toMatchObject({
      hasNextPage: false,
      items: [
        expect.objectContaining({ name: "Needle Alpha", roleLabel: "Admin" }),
        expect.objectContaining({ name: "Needle Bravo", roleLabel: "Editor" }),
        expect.objectContaining({ name: "Needle Delta", roleLabel: "Editor" })
      ],
      page: 1,
      pageSize: 10,
      searchText: "",
      totalCount: 3
    });
  });
});
