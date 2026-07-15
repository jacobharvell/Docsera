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
    if (typeof rowValue === "boolean" || typeof queryValue === "boolean") {
      return normalizeBooleanLike(rowValue) === normalizeBooleanLike(queryValue);
    }

    if (typeof rowValue === "number" || typeof queryValue === "number") {
      return Number(rowValue) === Number(queryValue);
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

    get(fieldOrSysId: string, value?: unknown) {
      const row =
        value === undefined
          ? (tables.get(this.tableName)?.find((candidate) => candidate.sysId === cleanText(fieldOrSysId)) ?? null)
          : (tables
              .get(this.tableName)
              ?.find((candidate) =>
                fieldOrSysId === "sys_id"
                  ? candidate.sysId === cleanText(value)
                  : matchField(candidate.fields[fieldOrSysId], value)
              ) ?? null);
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
    getRows(tableName: string) {
      return (tables.get(tableName) ?? []).map((row) => ({
        sysId: row.sysId,
        fields: { ...row.fields }
      }));
    },
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
import { parseServerDocument } from "./serverEditorDocument";
import { DOCSERA_PAGE_TABLE } from "./serverPageDomain";
import {
  buildPublishedPageRecord,
  createPageBodyContentJsonFromText,
  deletePageRecord,
  savePageDraftRecord,
  savePageRecord,
  savePageSettingsRecord,
  savePublishedPageRecord
} from "./serviceNowPagePersistence";
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

function updateStoredPage(pageSysId: string, updater: (record: InstanceType<typeof glideMock.GlideRecord>) => void) {
  const record = new glideMock.GlideRecord(DOCSERA_PAGE_TABLE);
  if (!record.get("sys_id", pageSysId)) {
    throw new Error("Expected saved page row.");
  }

  updater(record);
  record.update();
}

describe("single-session draft saves", () => {
  it("persists only the accepted draft fields, advances the draft revision, and leaves published fields untouched", async () => {
    const persisted = await savePageRecord(
      createPage({
        draftRevision: 4,
        publishedTitle: "Published title",
        publishedBodyText: "Published body",
        publishedContentJson: createLargeEnvelope("Published")
      })
    );
    const revision = persisted.draftRevision ?? 0;
    const accepted = await savePageDraftRecord(
      {
        ...persisted,
        draftRevision: revision + 1,
        draftBodyText: "First"
      },
      revision
    );

    expect(accepted).toMatchObject({ draftRevision: revision + 1, draftBodyText: "First" });

    const rows = glideMock.getRows(DOCSERA_PAGE_TABLE);
    expect(rows[0]?.fields).toMatchObject({
      draft_revision: revision + 1,
      draft_body_text: "First",
      published_title: "Published title",
      published_body_text: "Published body",
      publication_state: "published_with_unpublished_changes"
    });
  });

  it("returns the accepted request snapshot instead of rereading a later document state", async () => {
    const persisted = await savePageRecord(createPage({ draftRevision: 0 }));
    const accepted = await savePageDraftRecord({ ...persisted, draftRevision: 1, draftBodyText: "First" }, 0);
    const later = await savePageDraftRecord({ ...persisted, draftRevision: 2, draftBodyText: "Second" }, 1);

    expect(accepted).toMatchObject({ draftRevision: 1, draftBodyText: "First" });
    expect(later).toMatchObject({ draftRevision: 2, draftBodyText: "Second" });
  });

  it.each([undefined, Number.NaN, -1, 1.5])("rejects an invalid expected revision: %s", async (expectedRevision) => {
    expect(() => savePageDraftRecord(createPage({ sysId: "page-001" }), expectedRevision)).toThrow("expected draft revision");
  });

  it("returns null when the persisted draft revision no longer matches the caller revision", async () => {
    const persisted = await savePageRecord(createPage({ draftRevision: 1 }));

    await savePageDraftRecord({ ...persisted, draftRevision: 2, draftBodyText: "First" }, 1);
    const stale = await savePageDraftRecord({ ...persisted, draftRevision: 2, draftBodyText: "Second" }, 1);

    expect(stale).toBeNull();
  });

  it("publishes the persisted draft snapshot without changing hierarchy, order, or draft revision", async () => {
    const persisted = await savePageRecord(
      createPage({
        draftRevision: 4,
        parentPageSysId: "page-parent",
        siblingOrder: 3,
        draftTitle: "Overview Updated",
        draftSlug: "overview-updated",
        draftSlugNormalized: "overview-updated",
        draftContentJson: createPageBodyContentJsonFromText("Draft body"),
        draftBodyText: "Draft body",
        publishedTitle: "Overview",
        publishedSlug: "overview",
        publishedSlugNormalized: "overview",
        publishedContentJson: createPageBodyContentJsonFromText("Published body"),
        publishedBodyText: "Published body",
        publicationState: "published_with_unpublished_changes"
      })
    );

    const publishCandidate = buildPublishedPageRecord(persisted, {
      publishedAt: "2026-07-15 09:30:00",
      publishedByDisplayName: "Priya Writer",
      publishedBySysId: "user-123"
    });
    updateStoredPage(persisted.sysId ?? "", (record) => {
      record.setValue("parent_page", "page-parent-moved");
      record.setValue("sibling_order", "7");
      record.setValue("draft_title", "Overview Renamed After Candidate");
      record.setValue("draft_slug", "overview-renamed-after-candidate");
      record.setValue("draft_slug_normalized", "overview-renamed-after-candidate");
      record.setValue("active", false);
    });
    const published = await savePublishedPageRecord(publishCandidate, 4);

    expect(published).toMatchObject({
      draftRevision: 4,
      parentPageSysId: "page-parent-moved",
      siblingOrder: 7,
      draftTitle: "Overview Renamed After Candidate",
      draftSlug: "overview-renamed-after-candidate",
      draftSlugNormalized: "overview-renamed-after-candidate",
      publishedTitle: "Overview Updated",
      publishedSlug: "overview-updated",
      publishedBodyText: "Draft body",
      publicationState: "published_with_unpublished_changes",
      publishedAt: "2026-07-15 09:30:00",
      publishedBySysId: "user-123",
      publishedByDisplayName: "user-123",
      active: false
    });

    const rows = glideMock.getRows(DOCSERA_PAGE_TABLE);
    expect(rows[0]?.fields).toMatchObject({
      parent_page: "page-parent-moved",
      sibling_order: "7",
      draft_title: "Overview Renamed After Candidate",
      draft_slug: "overview-renamed-after-candidate",
      draft_slug_normalized: "overview-renamed-after-candidate",
      draft_revision: 4,
      published_title: "Overview Updated",
      published_slug: "overview-updated",
      published_body_text: "Draft body",
      published_at: "2026-07-15 09:30:00",
      published_by: "user-123",
      publication_state: "published_with_unpublished_changes",
      active: false
    });
  });

  it("rejects a stale persisted revision during publish without partially mutating published fields", async () => {
    const persisted = await savePageRecord(
      createPage({
        draftRevision: 2,
        draftTitle: "New draft",
        draftSlug: "new-draft",
        draftSlugNormalized: "new-draft",
        draftContentJson: createPageBodyContentJsonFromText("New draft body"),
        draftBodyText: "New draft body",
        publishedTitle: "Published title",
        publishedSlug: "published-title",
        publishedSlugNormalized: "published-title",
        publishedContentJson: createPageBodyContentJsonFromText("Published body"),
        publishedBodyText: "Published body",
        publicationState: "published_with_unpublished_changes"
      })
    );

    await savePageDraftRecord({ ...persisted, draftRevision: 3, draftBodyText: "Later draft" }, 2);

    const stalePublish = await savePublishedPageRecord(
      buildPublishedPageRecord(persisted, {
        publishedAt: "2026-07-15 09:35:00",
        publishedByDisplayName: "Priya Writer",
        publishedBySysId: "user-123"
      }),
      2
    );

    expect(stalePublish).toBeNull();

    const rows = glideMock.getRows(DOCSERA_PAGE_TABLE);
    expect(rows[0]?.fields).toMatchObject({
      published_title: "Published title",
      published_slug: "published-title",
      published_body_text: "Published body",
      draft_revision: 3
    });
  });

  it("fails closed when the stored draft revision is malformed", async () => {
    const persisted = await savePageRecord(createPage({ draftRevision: 1 }));
    const record = new glideMock.GlideRecord(DOCSERA_PAGE_TABLE);
    if (!record.get("sys_id", persisted.sysId)) {
      throw new Error("Expected saved page row.");
    }
    record.setValue("draft_revision", "not-a-number");
    record.update();

    expect(() => savePageDraftRecord({ ...persisted, draftRevision: 2 }, 1)).toThrow(
      "Page record has an invalid persisted draft revision."
    );
  });

  it("saves page settings through a field-scoped write and preserves newer published and hierarchy state", async () => {
    const persisted = await savePageRecord(
      createPage({
        draftRevision: 4,
        parentPageSysId: "page-parent",
        siblingOrder: 3,
        draftTitle: "Overview Draft",
        draftSlug: "overview-draft",
        draftSlugNormalized: "overview-draft",
        draftContentJson: createPageBodyContentJsonFromText("Draft body"),
        draftBodyText: "Draft body",
        publishedTitle: "Overview",
        publishedSlug: "overview",
        publishedSlugNormalized: "overview",
        publishedContentJson: createPageBodyContentJsonFromText("Published body"),
        publishedBodyText: "Published body",
        publishedAt: "2026-07-15 09:30:00",
        publishedBySysId: "user-111",
        publicationState: "published_with_unpublished_changes"
      })
    );

    updateStoredPage(persisted.sysId ?? "", (record) => {
      record.setValue("parent_page", "page-parent-moved");
      record.setValue("sibling_order", "8");
      record.setValue("published_title", "Published Renamed After Load");
      record.setValue("published_slug", "published-renamed-after-load");
      record.setValue("published_slug_normalized", "published-renamed-after-load");
      record.setValue("published_content_json", JSON.stringify(createPageBodyContentJsonFromText("Published body newer")));
      record.setValue("published_body_text", "Published body newer");
      record.setValue("published_at", "2026-07-15 10:00:00");
      record.setValue("published_by", "user-222");
      record.setValue("active", false);
    });

    const saved = await savePageSettingsRecord({
      ...persisted,
      draftTitle: "Updated Overview",
      draftSlug: "updated-overview",
      draftSlugNormalized: "updated-overview"
    });

    expect(saved).toMatchObject({
      draftTitle: "Updated Overview",
      draftSlug: "updated-overview",
      draftSlugNormalized: "updated-overview",
      draftRevision: 4,
      draftBodyText: "Draft body",
      parentPageSysId: "page-parent-moved",
      siblingOrder: 8,
      publishedTitle: "Published Renamed After Load",
      publishedSlug: "published-renamed-after-load",
      publishedBodyText: "Published body newer",
      publishedAt: "2026-07-15 10:00:00",
      publishedBySysId: "user-222",
      publicationState: "published_with_unpublished_changes",
      active: false
    });

    const rows = glideMock.getRows(DOCSERA_PAGE_TABLE);
    expect(rows[0]?.fields).toMatchObject({
      parent_page: "page-parent-moved",
      sibling_order: "8",
      draft_title: "Updated Overview",
      draft_slug: "updated-overview",
      draft_slug_normalized: "updated-overview",
      draft_revision: 4,
      draft_body_text: "Draft body",
      published_title: "Published Renamed After Load",
      published_slug: "published-renamed-after-load",
      published_slug_normalized: "published-renamed-after-load",
      published_body_text: "Published body newer",
      published_at: "2026-07-15 10:00:00",
      published_by: "user-222",
      publication_state: "published_with_unpublished_changes",
      active: false
    });
  });
});

function createLargeEnvelope(prefix: string) {
  return {
    schemaVersion: 1 as const,
    document: {
      type: "doc" as const,
      content: Array.from({ length: 3000 }, (_, index) => ({
        type: "paragraph",
        content: [
          {
            type: "text",
            text: `${prefix} 容量🙂 paragraph ${index + 1}${index === 2999 ? "   \n" : ""}`
          }
        ]
      }))
    }
  };
}

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

  it("preserves large multi-byte draft and published canonical JSON payloads through save and readback", async () => {
    const draftEnvelope = createLargeEnvelope("Draft capacity");
    const publishedEnvelope = createLargeEnvelope("Published capacity");

    const savedPage = await savePageRecord(
      createPage({
        draftTitle: "Capacity Probe",
        draftSlug: "capacity-probe",
        draftSlugNormalized: "capacity-probe",
        draftContentJson: draftEnvelope,
        publishedTitle: "Capacity Probe",
        publishedSlug: "capacity-probe",
        publishedSlugNormalized: "capacity-probe",
        publishedContentJson: publishedEnvelope,
        publicationState: "published_with_unpublished_changes"
      })
    );

    const storedRow = glideMock.getRows("x_82900_docsera_page")[0];
    const storedDraftJson = String(storedRow?.fields.draft_content_json ?? "");
    const storedPublishedJson = String(storedRow?.fields.published_content_json ?? "");

    expect(savedPage.sysId).toBeTruthy();
    expect(storedDraftJson.length).toBeGreaterThan(240000);
    expect(storedPublishedJson.length).toBeGreaterThan(240000);
    expect(parseServerDocument(storedDraftJson)).toEqual(draftEnvelope);
    expect(parseServerDocument(storedPublishedJson)).toEqual(publishedEnvelope);

    const listedPages = await listWorkspacePages("workspace-001");

    expect(listedPages).toHaveLength(1);
    expect(listedPages[0]?.draftContentJson).toEqual(draftEnvelope);
    expect(listedPages[0]?.publishedContentJson).toEqual(publishedEnvelope);
    expect(listedPages[0]?.publishedContentJson?.document.content?.[2999]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "Published capacity 容量🙂 paragraph 3000   \n" }]
    });
  });

  it("keeps published canonical JSON optional when the stored field is empty", async () => {
    const savedPage = await savePageRecord(createPage());
    const listedPages = await listWorkspacePages("workspace-001");

    expect(savedPage.publishedContentJson).toBeNull();
    expect(listedPages[0]?.publishedContentJson).toBeNull();

    const storedRow = glideMock.getRows("x_82900_docsera_page")[0];
    expect(storedRow?.fields.published_content_json).toBe("");
    expect(storedRow?.fields.published_body_text).toBe("");
  });
});
