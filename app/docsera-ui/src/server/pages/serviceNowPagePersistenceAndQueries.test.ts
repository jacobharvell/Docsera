import { beforeEach, describe, expect, it, vi } from "vitest";

type TableRow = {
  sysId: string;
  fields: Record<string, unknown>;
};

const glideMock = vi.hoisted(() => {
  const tables = new Map<string, TableRow[]>();
  let nextSysId = 1;

  function cleanText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
  }

  function normalizeBooleanLike(value: unknown): boolean {
    if (typeof value === "boolean") {
      return value;
    }

    if (typeof value === "number") {
      if (value === 1) {
        return true;
      }

      if (value === 0) {
        return false;
      }
    }

    const candidate = cleanText(value).toLowerCase();
    if (candidate === "true" || candidate === "1") {
      return true;
    }

    if (candidate === "false" || candidate === "0") {
      return false;
    }

    return Boolean(candidate);
  }

  function matchField(rowValue: unknown, queryValue: unknown): boolean {
    if (typeof rowValue === "boolean" || typeof rowValue === "number" || typeof queryValue === "boolean" || typeof queryValue === "number") {
      return normalizeBooleanLike(rowValue) === normalizeBooleanLike(queryValue);
    }

    return cleanText(rowValue) === cleanText(queryValue);
  }

  class MockGlideRecord {
    private readonly tableName: string;
    private currentRow: TableRow | null = null;
    private pendingQueries: Array<{ fieldName: string; value: unknown }> = [];
    private queryResults: TableRow[] = [];
    private queryIndex = -1;
    private limit: number | null = null;

    constructor(tableName: string) {
      this.tableName = tableName;

      if (!tables.has(tableName)) {
        tables.set(tableName, []);
      }
    }

    initialize() {
      this.currentRow = {
        sysId: "",
        fields: {}
      };
    }

    get(sysId: string) {
      const row = tables.get(this.tableName)?.find((candidate) => candidate.sysId === cleanText(sysId)) ?? null;
      this.currentRow = row ? row : null;
      return Boolean(row);
    }

    addQuery(fieldName: string, value: unknown) {
      this.pendingQueries.push({ fieldName, value });
    }

    setLimit(limit: number) {
      this.limit = limit;
    }

    query() {
      const rows = tables.get(this.tableName) ?? [];
      const filtered = rows.filter((row) =>
        this.pendingQueries.every(({ fieldName, value }) => matchField(row.fields[fieldName], value))
      );

      this.queryResults = this.limit ? filtered.slice(0, this.limit) : filtered;
      this.queryIndex = -1;
      this.currentRow = null;
    }

    next() {
      const nextIndex = this.queryIndex + 1;
      if (nextIndex >= this.queryResults.length) {
        return false;
      }

      this.queryIndex = nextIndex;
      this.currentRow = this.queryResults[nextIndex] ?? null;
      return Boolean(this.currentRow);
    }

    getValue(fieldName: string) {
      if (!this.currentRow) {
        return "";
      }

      const value = this.currentRow.fields[fieldName];
      if (fieldName === "active") {
        return normalizeBooleanLike(value) ? 1 : 0;
      }

      return value ?? "";
    }

    getDisplayValue(fieldName: string) {
      return this.getValue(fieldName);
    }

    getUniqueValue() {
      return this.currentRow?.sysId ?? "";
    }

    setValue(fieldName: string, value: unknown) {
      if (!this.currentRow) {
        throw new Error("No current record is loaded.");
      }

      this.currentRow.fields[fieldName] = value;
    }

    insert() {
      if (!this.currentRow) {
        throw new Error("No current record is loaded.");
      }

      const sysId = `${this.tableName}-${nextSysId.toString().padStart(3, "0")}`;
      nextSysId += 1;
      this.currentRow.sysId = sysId;
      tables.get(this.tableName)?.push(this.currentRow);
      return sysId;
    }

    update() {
      if (!this.currentRow) {
        throw new Error("No current record is loaded.");
      }

      if (!this.currentRow.sysId) {
        return this.insert();
      }

      const rows = tables.get(this.tableName) ?? [];
      const row = rows.find((candidate) => candidate.sysId === this.currentRow?.sysId);
      if (row) {
        row.fields = { ...this.currentRow.fields };
      }

      return this.currentRow.sysId;
    }

    deleteRecord() {
      if (!this.currentRow) {
        return false;
      }

      const rows = tables.get(this.tableName) ?? [];
      const index = rows.findIndex((candidate) => candidate.sysId === this.currentRow?.sysId);
      if (index < 0) {
        return false;
      }

      rows.splice(index, 1);
      this.currentRow = null;
      return true;
    }
  }

  return {
    GlideRecord: MockGlideRecord,
    reset() {
      tables.clear();
      nextSysId = 1;
    }
  };
});

vi.mock("@servicenow/glide", () => ({
  GlideRecord: glideMock.GlideRecord
}));

import type { PageRecord } from "./serverPageDomain";
import { deletePageRecord, savePageRecord } from "./serviceNowPagePersistence";
import { listWorkspacePages } from "./serviceNowPageQueries";

function createPage(overrides: Partial<PageRecord> = {}): PageRecord {
  return {
    sysId: undefined,
    workspaceSysId: "workspace-001",
    parentPageSysId: null,
    siblingOrder: 1,
    draftTitle: "Overview",
    draftSlug: "overview",
    draftSlugNormalized: "overview",
    draftContentJson: {
      type: "doc",
      content: []
    },
    draftBodyText: null,
    publishedTitle: null,
    publishedSlug: null,
    publishedSlugNormalized: null,
    publishedContentJson: null,
    publishedBodyText: null,
    publicationState: "draft",
    active: true,
    ...overrides
  };
}

beforeEach(() => {
  glideMock.reset();
});

describe("page persistence and listing", () => {
  it("keeps a newly created active page visible after save and refresh-style list loading", async () => {
    const savedPage = await savePageRecord(
      createPage({
        draftTitle: "Launch Notes",
        draftSlug: "launch-notes",
        draftSlugNormalized: "launch-notes"
      })
    );

    expect(savedPage.active).toBe(true);
    expect(savedPage.sysId).toBeTruthy();

    const listedPages = await listWorkspacePages("workspace-001");

    expect(listedPages).toHaveLength(1);
    expect(listedPages[0]?.sysId).toBe(savedPage.sysId);
    expect(listedPages[0]?.active).toBe(true);
  });

  it("excludes inactive pages and deleted pages from workspace listing", async () => {
    const activePage = await savePageRecord(
      createPage({
        draftTitle: "Active Page",
        draftSlug: "active-page",
        draftSlugNormalized: "active-page",
        siblingOrder: 1,
        active: true
      })
    );

    const inactivePage = await savePageRecord(
      createPage({
        draftTitle: "Inactive Page",
        draftSlug: "inactive-page",
        draftSlugNormalized: "inactive-page",
        siblingOrder: 2,
        active: false
      })
    );

    const allPages = await listWorkspacePages("workspace-001", { activeOnly: false });
    expect(allPages.map((page) => page.sysId)).toEqual([activePage.sysId]);
    expect(allPages.find((page) => page.sysId === inactivePage.sysId)).toBeUndefined();

    await deletePageRecord(activePage.sysId ?? "");

    const listedPages = await listWorkspacePages("workspace-001");
    expect(listedPages.map((page) => page.sysId)).toEqual([]);
  });

});
