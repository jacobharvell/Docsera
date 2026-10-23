import { createHash } from "node:crypto";
import * as changeSetDomain from "./workspaceChangeSetDomain.ts";
import * as serverDocument from "../pages/serverEditorDocument.ts";
import * as pageDomain from "../pages/serverPageDomain.ts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCanonicalImageDocseraDocumentEnvelope } from "../../shared/editor/imageFixtures.ts";
import { createNestedTableDocseraDocumentEnvelope, createStandardTableDocseraDocumentEnvelope } from "../../shared/editor/documentFixtures.ts";

type TableRow = {
  sysId: string;
  fields: Record<string, unknown>;
};

const glideMock = vi.hoisted(() => {
  const tables = new Map<string, TableRow[]>();
  const iterations = new Map<string, number>();
  const gets = new Map<string, number>();
  const queries = new Map<string, number>();
  const queryConditions = new Map<string, Array<Array<{ fieldName: string; value: unknown; operator?: string }>>>();
  const fieldReadAccess = new Map<string, boolean>();
  const deleteHooks = new Map<string, (row: TableRow) => boolean>();
  const insertHooks = new Map<string, (row: TableRow) => void>();
  const recordReadAccess = new Map<string, boolean>();
  const updateHooks = new Map<string, (row: TableRow) => boolean>();
  let nextSysId = 1;
  let nextRandom = 1;
  const uniqueFields = new Map<string, string[]>([
    ["x_82900_docsera_workspace_change_set", ["generation_key"]],
    ["x_82900_docsera_workspace_snapshot_set", ["snapshot_key"]],
    ["x_82900_docsera_workspace_page_snapshot", ["snapshot_page_key"]],
    ["x_82900_docsera_workspace_change_entry", ["generation_page_key"]],
    ["x_82900_docsera_workspace_mutation_claim", ["generation_key"]],
    ["x_82900_docsera_workspace_removal_batch", ["batch_key"]],
    ["x_82900_docsera_workspace_removal_member", ["batch_page_key"]]
  ]);

  function cleanText(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
  }

  function matchField(rowValue: unknown, queryValue: unknown): boolean {
    if (typeof rowValue === "boolean" || typeof queryValue === "boolean") {
      return Boolean(rowValue) === Boolean(queryValue);
    }
    if (typeof rowValue === "number" || typeof queryValue === "number") {
      return Number(rowValue) === Number(queryValue);
    }
    return cleanText(rowValue) === cleanText(queryValue);
  }

  function cloneRow(row: TableRow): TableRow {
    return { sysId: row.sysId, fields: { ...row.fields } };
  }

  function accessKey(tableName: string, sysId: string, fieldName = "") {
    return `${tableName}:${sysId}:${fieldName}`;
  }

  class MockGlideRecord {
    private readonly tableName: string;
    private currentRow: TableRow | null = null;
    private pendingQueries: Array<{ fieldName: string; value: unknown; operator?: string }> = [];
    private queryResults: TableRow[] = [];
    private queryIndex = -1;
    private limit: number | null = null;
    private newGuidValue = "";

    constructor(tableName: string) {
      this.tableName = tableName;
      if (!tables.has(tableName)) {
        tables.set(tableName, []);
      }
    }

    initialize() {
      this.currentRow = { sysId: "", fields: {} };
    }

    get(fieldOrSysId: string, value?: unknown) {
      gets.set(this.tableName, (gets.get(this.tableName) ?? 0) + 1);
      const row =
        value === undefined
          ? (tables.get(this.tableName)?.find((candidate) => candidate.sysId === cleanText(fieldOrSysId)) ?? null)
          : (tables
              .get(this.tableName)
              ?.find((candidate) =>
                fieldOrSysId === "sys_id" ? candidate.sysId === cleanText(value) : matchField(candidate.fields[fieldOrSysId], value)
              ) ?? null);
      this.currentRow = row ? cloneRow(row) : null;
      return Boolean(row);
    }

    addQuery(fieldName: string, valueOrOperator: unknown, operand?: unknown) {
      this.pendingQueries.push(operand === undefined
        ? { fieldName, value: valueOrOperator }
        : { fieldName, operator: String(valueOrOperator), value: operand });
    }

    setLimit(limit: number) {
      this.limit = limit;
    }

    query() {
      queries.set(this.tableName, (queries.get(this.tableName) ?? 0) + 1);
      queryConditions.set(this.tableName, [...(queryConditions.get(this.tableName) ?? []), [...this.pendingQueries]]);
      const rows = tables.get(this.tableName) ?? [];
      const filtered = rows.filter((row) => this.pendingQueries.every(({ fieldName, value, operator }) => operator === "IN"
        ? String(value).split(",").some((candidate) => matchField(row.fields[fieldName], candidate))
        : matchField(row.fields[fieldName], value)));
      this.queryResults = (this.limit ? filtered.slice(0, this.limit) : filtered).map(cloneRow);
      this.queryIndex = -1;
      this.currentRow = null;
      this.pendingQueries = [];
    }

    next() {
      const nextIndex = this.queryIndex + 1;
      if (nextIndex >= this.queryResults.length) {
        return false;
      }
      iterations.set(this.tableName, (iterations.get(this.tableName) ?? 0) + 1);
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
        return Boolean(value) ? 1 : 0;
      }
      return value ?? "";
    }

    getDisplayValue(fieldName: string) {
      return this.getValue(fieldName);
    }

    canRead(fieldName?: string) {
      if (!this.currentRow) {
        return false;
      }
      if (fieldName) {
        return fieldReadAccess.get(accessKey(this.tableName, this.currentRow.sysId, fieldName)) ?? true;
      }
      return recordReadAccess.get(accessKey(this.tableName, this.currentRow.sysId)) ?? true;
    }

    getElement(fieldName: string) {
      return {
        canRead: () => this.canRead(fieldName)
      };
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

    setNewGuidValue(guid: string) {
      this.newGuidValue = cleanText(guid);
    }

    insert() {
      if (!this.currentRow) {
        throw new Error("No current record is loaded.");
      }
      insertHooks.get(this.tableName)?.(this.currentRow);
      for (const fieldName of uniqueFields.get(this.tableName) ?? []) {
        const nextValue = cleanText(this.currentRow.fields[fieldName]);
        if (!nextValue) {
          continue;
        }
        const duplicate = tables.get(this.tableName)?.find((candidate) => cleanText(candidate.fields[fieldName]) === nextValue);
        if (duplicate) {
          throw new Error(`Duplicate value for ${this.tableName}.${fieldName}`);
        }
      }
      const sysId = this.newGuidValue || `${this.tableName}-${nextSysId.toString().padStart(3, "0")}`;
      nextSysId += 1;
      this.currentRow.sysId = sysId;
      tables.get(this.tableName)?.push(this.currentRow);
      this.newGuidValue = "";
      return sysId;
    }

    update() {
      if (!this.currentRow) {
        throw new Error("No current record is loaded.");
      }
      if (!this.currentRow.sysId) {
        return this.insert();
      }
      if (updateHooks.get(this.tableName)?.(this.currentRow) === false) {
        return "";
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
      if (deleteHooks.get(this.tableName)?.(this.currentRow) === false) {
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
    GlideDateTime: class {
      getValue() {
        return "2026-07-18 00:00:00";
      }
    },
    GlideDigest: class {
      getSHA256Hex(value: string) {
        return createHash("sha256").update(String(value)).digest("hex");
      }
    },
    GlideSecureRandomUtil: {
      getSecureRandomString(length: number) {
        const suffix = String(nextRandom++).padStart(4, "0");
        return `${"x".repeat(Math.max(0, length - suffix.length))}${suffix}`;
      }
    },
    gs: {
      getUserID: () => "user-1",
      error: vi.fn()
    },
    getCount(tableName: string) { return gets.get(tableName) ?? 0; },
    clearGets() { gets.clear(); },
    queryCount(tableName: string) { return queries.get(tableName) ?? 0; },
    clearQueries() { queries.clear(); queryConditions.clear(); },
    queryConditions(tableName: string) { return queryConditions.get(tableName) ?? []; },
    iterationCount(tableName: string) { return iterations.get(tableName) ?? 0; },
    clearIterations() { iterations.clear(); },
    getRows(tableName: string) {
      return (tables.get(tableName) ?? []).map((row) => ({ sysId: row.sysId, fields: { ...row.fields } }));
    },
    insertRow(tableName: string, sysId: string, fields: Record<string, unknown>) {
      if (!tables.has(tableName)) {
        tables.set(tableName, []);
      }
      tables.get(tableName)?.push({ sysId, fields: { ...fields } });
    },
    setInsertHook(tableName: string, hook: ((row: TableRow) => void) | null) {
      if (!hook) {
        insertHooks.delete(tableName);
        return;
      }
      insertHooks.set(tableName, hook);
    },
    setFieldReadable(tableName: string, sysId: string, fieldName: string, readable: boolean) {
      fieldReadAccess.set(accessKey(tableName, sysId, fieldName), readable);
    },
    setDeleteHook(tableName: string, hook: ((row: TableRow) => boolean) | null) {
      if (!hook) {
        deleteHooks.delete(tableName);
        return;
      }
      deleteHooks.set(tableName, hook);
    },
    setUpdateHook(tableName: string, hook: ((row: TableRow) => boolean) | null) {
      if (!hook) {
        updateHooks.delete(tableName);
        return;
      }
      updateHooks.set(tableName, hook);
    },
    setRecordReadable(tableName: string, sysId: string, readable: boolean) {
      recordReadAccess.set(accessKey(tableName, sysId), readable);
    },
    updateRow(tableName: string, sysId: string, fields: Record<string, unknown>) {
      const row = tables.get(tableName)?.find((candidate) => candidate.sysId === sysId);
      if (!row) {
        throw new Error(`Missing ${tableName}:${sysId}`);
      }
      row.fields = { ...fields };
    },
    reset() {
      tables.clear();
      iterations.clear();
      gets.clear();
      queries.clear();
      queryConditions.clear();
      fieldReadAccess.clear();
      deleteHooks.clear();
      insertHooks.clear();
      recordReadAccess.clear();
      updateHooks.clear();
      nextSysId = 1;
      nextRandom = 1;
    }
  };
});

vi.mock("@servicenow/glide", () => ({
  GlideRecord: glideMock.GlideRecord,
  GlideDateTime: glideMock.GlideDateTime,
  GlideDigest: glideMock.GlideDigest,
  GlideSecureRandomUtil: glideMock.GlideSecureRandomUtil,
  gs: glideMock.gs
}));

import { createServiceNowWorkspaceChangeSetPersistenceService } from "./serviceNowWorkspaceChangeSetPersistence.ts";

const workspaceTable = "x_82900_docsera_workspace";
const changeSetTable = "x_82900_docsera_workspace_change_set";
const snapshotSetTable = "x_82900_docsera_workspace_snapshot_set";
const pageSnapshotTable = "x_82900_docsera_workspace_page_snapshot";
const pageTable = "x_82900_docsera_page";
const changeEntryTable = "x_82900_docsera_workspace_change_entry";
const mutationClaimTable = "x_82900_docsera_workspace_mutation_claim";
const removalBatchTable = "x_82900_docsera_workspace_removal_batch";
const removalMemberTable = "x_82900_docsera_workspace_removal_member";
const UNKNOWN_USER_ATTRIBUTION_FOR_TEST = {
  accessibleLabel: "Last changed by Unknown user",
  displayName: "Unknown user",
  fullDisplayName: "Unknown user"
};

type FailurePhase = Parameters<Parameters<typeof createServiceNowWorkspaceChangeSetPersistenceService>[0]["afterDurablePhase"]>[0];
type DurablePhaseHandler = NonNullable<Parameters<typeof createServiceNowWorkspaceChangeSetPersistenceService>[0]["afterDurablePhase"]>;

type SeedPage = {
  active?: boolean;
  draftBodyText?: string;
  draftContentJson?: unknown;
  draftRevision?: number;
  draftSlug?: string;
  draftTitle?: string;
  pageId: string;
  parentPageId?: string | null;
  publishedBodyText?: string;
  publishedContentJson?: unknown;
  publishedSlug?: string;
  publishedTitle?: string;
  siblingOrder?: string;
};

function createDocument(text: string) {
  return {
    type: "doc",
    content: [{
      type: "paragraph",
      content: [{
        type: "text",
        text
      }]
    }]
  };
}

function createDocumentEnvelope(text: string) {
  return {
    schemaVersion: 1,
    document: createDocument(text)
  };
}

function createImageDocumentEnvelope(
  attrs: Partial<{
    align: "left" | "center" | "right";
    alt: string;
    caption: string;
    darkMediaId: string | null;
    frame: boolean;
    mediaId: string;
    widthPct: number;
  }> & {
    mediaId: string;
  }
) {
  const envelope = createCanonicalImageDocseraDocumentEnvelope();
  const imageNode = envelope.document.content?.[0];
  if (!imageNode || typeof imageNode !== "object" || Array.isArray(imageNode) || (imageNode as { type?: string }).type !== "image") {
    throw new Error("Expected the canonical image fixture to contain one image node.");
  }

  (imageNode as {
    attrs: {
      align: "left" | "center" | "right";
      alt: string;
      caption: string;
      darkMediaId: string | null;
      frame: boolean;
      mediaId: string;
      widthPct: number;
    };
  }).attrs = {
    align: attrs.align ?? "left",
    alt: attrs.alt ?? "",
    caption: attrs.caption ?? "",
    darkMediaId: attrs.darkMediaId ?? null,
    frame: attrs.frame ?? true,
    mediaId: attrs.mediaId,
    widthPct: attrs.widthPct ?? 100
  };

  return envelope;
}

function createSeedPage(overrides: Partial<SeedPage> & Pick<SeedPage, "pageId">): SeedPage {
  const title = overrides.draftTitle ?? overrides.publishedTitle ?? `Draft ${overrides.pageId}`;
  const slug = overrides.draftSlug ?? overrides.publishedSlug ?? title.toLowerCase().replace(/\s+/g, "-");
  const publishedTitle = overrides.publishedTitle ?? title.replace(/^Draft /, "");
  const publishedSlug = overrides.publishedSlug ?? slug;
  return {
    active: overrides.active ?? true,
    draftBodyText: overrides.draftBodyText ?? `${title} draft body`,
    draftContentJson: overrides.draftContentJson ?? createDocument(`${title} draft body`),
    draftRevision: overrides.draftRevision ?? 0,
    draftSlug: slug,
    draftTitle: title,
    pageId: overrides.pageId,
    parentPageId: overrides.parentPageId ?? null,
    publishedBodyText: overrides.publishedBodyText ?? `${publishedTitle} published body`,
    publishedContentJson: overrides.publishedContentJson ?? createDocument(`${publishedTitle} published body`),
    publishedSlug,
    publishedTitle,
    siblingOrder: overrides.siblingOrder ?? "1"
  };
}

function workspaceRef(
  overrides: Partial<{ pendingChangeSetSysId: string; publishedSnapshotSetSysId: string; sysId: string; workspaceStateRevision: number }> = {}
) {
  return {
    sysId: overrides.sysId ?? "workspace-001",
    pendingChangeSetSysId: overrides.pendingChangeSetSysId ?? "change-set-001",
    publishedSnapshotSetSysId: overrides.publishedSnapshotSetSysId ?? "snapshot-set-001",
    workspaceStateRevision: overrides.workspaceStateRevision ?? 0
  } as never;
}

function currentWorkspaceRef() {
  const row = getRows(workspaceTable)[0];
  if (!row) {
    throw new Error("Missing workspace row.");
  }
  return workspaceRef({
    pendingChangeSetSysId: String(row.fields.pending_change_set ?? ""),
    publishedSnapshotSetSysId: String(row.fields.published_snapshot_set ?? ""),
    workspaceStateRevision: Number(row.fields.workspace_state_revision ?? 0)
  });
}

function pendingRows(service = createService(), workspace = workspaceRef()) {
  const result = service.pendingChanges(workspace);
  expect(result.kind).toBe("succeeded");
  return result.kind === "succeeded" ? result.pending.rows : [];
}

function seedWorkspaceFoundation(options: {
  changeSetId?: string;
  includeChangeSet?: boolean;
  includeSnapshot?: boolean;
  pages?: SeedPage[];
  snapshotSetId?: string;
  workspaceId?: string;
} = {}) {
  const workspaceId = options.workspaceId ?? "workspace-001";
  const changeSetId = options.changeSetId ?? "change-set-001";
  const snapshotSetId = options.snapshotSetId ?? "snapshot-set-001";
  const pages = options.pages ?? [
    createSeedPage({
      pageId: "page-001",
      draftBodyText: "Draft body",
      draftTitle: "Draft title",
      publishedBodyText: "Snapshot body",
      publishedSlug: "snapshot-slug",
      publishedTitle: "Snapshot title"
    })
  ];

  glideMock.insertRow(workspaceTable, workspaceId, {
    name: "Workspace",
    workspace_slug: "workspace",
    status: "active",
    icon_type: "builtin",
    icon_key: "docsera-workspace",
    icon_label: "Docsera workspace icon",
    pending_change_set: options.includeChangeSet === false ? "" : changeSetId,
    published_snapshot_set: options.includeSnapshot === false ? "" : snapshotSetId,
    workspace_state_revision: 0,
    toc_default_visible: true,
    page_width: "readable"
  });

  if (options.includeChangeSet !== false) {
    glideMock.insertRow(changeSetTable, changeSetId, {
      workspace: workspaceId,
      generation_key: `${workspaceId}:change-set`,
      change_set_revision: 0,
      next_pending_sequence: 1,
      lifecycle_state: "active",
      recovery_state: "none"
    });
  }

  if (options.includeSnapshot !== false) {
    glideMock.insertRow(snapshotSetTable, snapshotSetId, {
      workspace: workspaceId,
      snapshot_key: `${workspaceId}:snapshot`,
      readiness_state: "ready"
    });
  }

  for (const page of pages) {
    glideMock.insertRow(pageTable, page.pageId, {
      workspace: workspaceId,
      parent_page: page.parentPageId ?? "",
      sibling_order: page.siblingOrder ?? "1",
      draft_title: page.draftTitle ?? "",
      draft_slug: page.draftSlug ?? "",
      draft_slug_normalized: page.draftSlug ?? "",
      draft_content_json: JSON.stringify(page.draftContentJson ?? createDocument("draft")),
      draft_body_text: page.draftBodyText ?? "",
      draft_revision: page.draftRevision ?? 0,
      published_title: page.publishedTitle ?? "",
      published_slug: page.publishedSlug ?? "",
      published_slug_normalized: page.publishedSlug ?? "",
      published_content_json: JSON.stringify(page.publishedContentJson ?? createDocument("published")),
      published_body_text: page.publishedBodyText ?? "",
      publication_state: page.publishedTitle ? "published" : "draft",
      active: page.active ?? true
    });

    if (options.includeSnapshot !== false && page.publishedTitle && page.publishedSlug && page.publishedContentJson) {
      glideMock.insertRow(pageSnapshotTable, `snapshot:${snapshotSetId}:${page.pageId}`, {
        snapshot_set: snapshotSetId,
        page: page.pageId,
        snapshot_page_key: `${snapshotSetId}:${page.pageId}`,
        parent_page: page.parentPageId ?? "",
        sibling_order: page.siblingOrder ?? "1",
        title: page.publishedTitle,
        slug: page.publishedSlug,
        slug_normalized: page.publishedSlug,
        content_json: JSON.stringify(page.publishedContentJson),
        body_text: page.publishedBodyText ?? "",
        active: page.active ?? true
      });
    }
  }
}

function insertSnapshotPageRow(
  snapshotSetId: string,
  pageId: string,
  fields: Partial<{
    active: boolean;
    bodyText: string;
    contentJson: unknown;
    parentPageId: string | null;
    siblingOrder: string;
    slug: string;
    title: string;
  }>
) {
  glideMock.insertRow(pageSnapshotTable, `snapshot:${snapshotSetId}:${pageId}`, {
    snapshot_set: snapshotSetId,
    page: pageId,
    snapshot_page_key: `${snapshotSetId}:${pageId}`,
    parent_page: fields.parentPageId ?? "",
    sibling_order: fields.siblingOrder ?? "1",
    title: fields.title ?? `Snapshot ${pageId}`,
    slug: fields.slug ?? pageId,
    slug_normalized: fields.slug ?? pageId,
    content_json: JSON.stringify(fields.contentJson ?? createDocument(`Snapshot ${pageId} body`)),
    body_text: fields.bodyText ?? `Snapshot ${pageId} body`,
    active: fields.active ?? true
  });
}

function seedValidNonSeedSelectors() {
  const workspaceId = "workspace-001";
  const selectedChangeSetId = "change-set-successor";
  const selectedSnapshotSetId = "snapshot-set-selected";
  const seedChangeSetId = "change-set-seed";
  const seedSnapshotSetId = "snapshot-set-seed";

  glideMock.insertRow(workspaceTable, workspaceId, {
    name: "Workspace",
    workspace_slug: "workspace",
    status: "active",
    icon_type: "builtin",
    icon_key: "docsera-workspace",
    icon_label: "Docsera workspace icon",
    pending_change_set: selectedChangeSetId,
    published_snapshot_set: selectedSnapshotSetId,
    workspace_state_revision: 7,
    toc_default_visible: true,
    page_width: "readable"
  });

  glideMock.insertRow(changeSetTable, selectedChangeSetId, {
    workspace: workspaceId,
    generation_key: "workspace-001:successor",
    change_set_revision: 4,
    next_pending_sequence: 3,
    lifecycle_state: "active",
    recovery_state: "none"
  });
  glideMock.insertRow(changeSetTable, seedChangeSetId, {
    workspace: workspaceId,
    generation_key: "workspace-001:change-set",
    change_set_revision: 0,
    next_pending_sequence: 1,
    lifecycle_state: "active",
    recovery_state: "none"
  });

  glideMock.insertRow(snapshotSetTable, selectedSnapshotSetId, {
    workspace: workspaceId,
    snapshot_key: "workspace-001:selected",
    readiness_state: "ready"
  });
  glideMock.insertRow(snapshotSetTable, seedSnapshotSetId, {
    workspace: workspaceId,
    snapshot_key: "workspace-001:snapshot",
    readiness_state: "ready"
  });

  const pages = [
    {
      pageId: "page-001",
      draftTitle: "Draft Root",
      draftSlug: "draft-root",
      draftContentJson: createDocument("Draft root body"),
      draftBodyText: "Draft root body",
      publishedTitle: "Legacy Root",
      publishedSlug: "legacy-root",
      publishedContentJson: createDocument("Legacy root body"),
      publishedBodyText: "Legacy root body",
      siblingOrder: "1"
    },
    {
      pageId: "page-002",
      parentPageId: "page-001",
      draftTitle: "Draft Child",
      draftSlug: "draft-child",
      draftContentJson: createDocument("Draft child body"),
      draftBodyText: "Draft child body",
      publishedTitle: "Legacy Child",
      publishedSlug: "legacy-child",
      publishedContentJson: createDocument("Legacy child body"),
      publishedBodyText: "Legacy child body",
      siblingOrder: "1"
    },
    {
      pageId: "page-003",
      draftTitle: "Draft Sibling",
      draftSlug: "draft-sibling",
      draftContentJson: createDocument("Draft sibling body"),
      draftBodyText: "Draft sibling body",
      publishedTitle: "Legacy Sibling",
      publishedSlug: "legacy-sibling",
      publishedContentJson: createDocument("Legacy sibling body"),
      publishedBodyText: "Legacy sibling body",
      siblingOrder: "2"
    }
  ] satisfies SeedPage[];

  for (const page of pages) {
    glideMock.insertRow(pageTable, page.pageId, {
      workspace: workspaceId,
      parent_page: page.parentPageId ?? "",
      sibling_order: page.siblingOrder ?? "1",
      draft_title: page.draftTitle,
      draft_slug: page.draftSlug,
      draft_slug_normalized: page.draftSlug,
      draft_content_json: JSON.stringify(page.draftContentJson),
      draft_body_text: page.draftBodyText,
      draft_revision: 0,
      published_title: page.publishedTitle,
      published_slug: page.publishedSlug,
      published_slug_normalized: page.publishedSlug,
      published_content_json: JSON.stringify(page.publishedContentJson),
      published_body_text: page.publishedBodyText,
      publication_state: "published_with_unpublished_changes",
      active: true
    });
  }

  insertSnapshotPageRow(selectedSnapshotSetId, "page-001", {
    title: "Selected Root",
    slug: "selected-root",
    bodyText: "Selected root body",
    contentJson: createDocument("Selected root body"),
    siblingOrder: "1"
  });
  insertSnapshotPageRow(selectedSnapshotSetId, "page-002", {
    title: "Selected Child",
    slug: "selected-child",
    bodyText: "Selected child body",
    contentJson: createDocument("Selected child body"),
    parentPageId: "page-001",
    siblingOrder: "1"
  });
  insertSnapshotPageRow(selectedSnapshotSetId, "page-003", {
    title: "Selected Sibling",
    slug: "selected-sibling",
    bodyText: "Selected sibling body",
    contentJson: createDocument("Selected sibling body"),
    siblingOrder: "2"
  });

  insertSnapshotPageRow(seedSnapshotSetId, "page-001", {
    title: "Seed Root",
    slug: "seed-root",
    bodyText: "Seed root body",
    contentJson: createDocument("Seed root body"),
    siblingOrder: "1"
  });

  return {
    authority: { changeSetId: selectedChangeSetId, changeSetRevision: 4 },
    selectedChangeSetId,
    selectedSnapshotSetId,
    seedChangeSetId,
    seedSnapshotSetId,
    workspace: workspaceRef({
      pendingChangeSetSysId: selectedChangeSetId,
      publishedSnapshotSetSysId: selectedSnapshotSetId,
      workspaceStateRevision: 7
    })
  };
}

function replaceClaimOwner(generationKey: string, ownerKey: string, ownerExpiresOn = "2026-07-18 00:05:00") {
  const row = claimRow(generationKey);
  if (!row) {
    throw new Error(`Missing mutation claim ${generationKey}`);
  }
  glideMock.updateRow(mutationClaimTable, row.sysId, {
    ...row.fields,
    claim_owner_key: ownerKey,
    owner_expires_on: ownerExpiresOn
  });
}

function expectActiveSelectors(changeSetId: string, snapshotSetId: string) {
  expect(getRows(workspaceTable)[0]?.fields.pending_change_set).toBe(changeSetId);
  expect(getRows(workspaceTable)[0]?.fields.published_snapshot_set).toBe(snapshotSetId);
}

function createService(options: { afterDurablePhase?: DurablePhaseHandler; currentTimestamp?: () => string; failPhase?: FailurePhase } = {}) {
  return createServiceNowWorkspaceChangeSetPersistenceService({
    afterDurablePhase: (phase, context) => {
      options.afterDurablePhase?.(phase, context);
      if (phase === options.failPhase) {
        throw new Error(`Injected ${phase}`);
      }
    },
    currentTimestamp: options.currentTimestamp ?? (() => "2026-07-18 00:00:00")
  });
}

function getRows(tableName: string) {
  return glideMock.getRows(tableName);
}

function pageRow(pageId: string) {
  return getRows(pageTable).find((row) => row.sysId === pageId);
}

function imageNodeAttrs(contentJson: unknown) {
  const envelope = typeof contentJson === "string" ? JSON.parse(contentJson) : contentJson;
  if (!envelope || typeof envelope !== "object" || Array.isArray(envelope)) {
    throw new Error("Expected an image document envelope.");
  }

  const content = (envelope as { document?: { content?: unknown[] } }).document?.content ?? [];
  const imageNode = content.find(
    (node): node is { attrs?: Record<string, unknown>; type?: string } =>
      Boolean(node && typeof node === "object" && !Array.isArray(node) && (node as { type?: string }).type === "image")
  );
  if (!imageNode?.attrs) {
    throw new Error("Expected the document envelope to contain an image node.");
  }

  return imageNode.attrs;
}

function changeSetRow(changeSetId = "change-set-001") {
  return getRows(changeSetTable).find((row) => row.sysId === changeSetId);
}

function claimRow(generationKey: string) {
  return getRows(mutationClaimTable).find((row) => row.fields.generation_key === generationKey);
}

function claimPayload(generationKey: string) {
  const row = claimRow(generationKey);
  const payload = row?.fields.mutation_payload_json;
  return typeof payload === "string" && payload ? JSON.parse(payload) : null;
}

function failNextClaimUpdateToPhase(phase: string) {
  let failed = false;
  glideMock.setUpdateHook(mutationClaimTable, (row) => {
    if (!failed && row.fields.execution_phase === phase) {
      failed = true;
      return false;
    }
    return true;
  });
}

function activeWorkspaceAuthority(workspace = currentWorkspaceRef()) {
  const changeSetId = String(workspace.pendingChangeSetSysId ?? "");
  const changeSetRevision = Number(changeSetRow(changeSetId)?.fields.change_set_revision ?? 0);
  return {
    changeSetId,
    changeSetRevision
  };
}

function seedDiscardRecoveryScenario() {
  seedWorkspaceFoundation({
    pages: [
      createSeedPage({
        pageId: "page-001",
        draftBodyText: "Overview draft body",
        draftTitle: "Overview",
        publishedBodyText: "Overview published body",
        publishedSlug: "overview",
        publishedTitle: "Overview",
        siblingOrder: "1"
      }),
      createSeedPage({
        pageId: "page-002",
        draftBodyText: "Child draft body",
        draftTitle: "Child",
        parentPageId: "page-001",
        publishedBodyText: "Child published body",
        publishedSlug: "child",
        publishedTitle: "Child",
        siblingOrder: "1"
      }),
      createSeedPage({
        pageId: "page-003",
        draftBodyText: "Deprecated body",
        draftTitle: "Deprecated",
        publishedBodyText: "Deprecated body",
        publishedSlug: "deprecated",
        publishedTitle: "Deprecated",
        siblingOrder: "2"
      })
    ]
  });
  const service = createService();
  let authority = expectSucceeded(service.savePageSettings({
    authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
    pageSysId: "page-001",
    slug: "overview-renamed",
    title: "Overview Renamed",
    workspace: workspaceRef()
  })).authority;
  const created = expectSucceeded(service.createPage({
    authority,
    parentPageSysId: "page-001",
    title: "New Guide",
    workspace: workspaceRef()
  }));
  authority = created.authority;
  authority = expectSucceeded(service.movePage({
    authority,
    pageSysId: "page-002",
    parentPageSysId: null,
    siblingOrder: "9",
    workspace: workspaceRef()
  })).authority;
  authority = expectSucceeded(service.deletePage({
    authority,
    pageSysId: "page-003",
    workspace: workspaceRef()
  })).authority;
  return {
    addedPageId: created.result.page.sysId ?? "",
    authority,
    service,
    workspace: workspaceRef()
  };
}

function expectSucceeded<T extends { kind: string }>(result: T): Extract<T, { kind: "succeeded" }> {
  if (result.kind !== "succeeded") {
    throw new Error(`Expected success, received ${JSON.stringify(result)}.`);
  }
  expect(result.kind).toBe("succeeded");
  return result as Extract<T, { kind: "succeeded" }>;
}

beforeEach(() => {
  glideMock.reset();
});

describe("body save canonical document reuse", () => {
  it.each([
    ["legacy", createDocument("Reuse body")],
    ["canonical", createDocumentEnvelope("Reuse body")],
    ["image", createCanonicalImageDocseraDocumentEnvelope()],
    ["table", createStandardTableDocseraDocumentEnvelope()],
    ["nested table", createNestedTableDocseraDocumentEnvelope()]
  ])("preserves %s documents and mutation identity without reparsing the payload", (_label, inputDocument) => {
    seedWorkspaceFoundation();
    const canonical = serverDocument.parseServerDocument(inputDocument);
    const sort = (value: unknown): unknown => Array.isArray(value) ? value.map(sort) : value && typeof value === "object"
      ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, sort(entry)]))
      : value;
    const stableDocument = JSON.stringify(sort(canonical));
    const reparsed = serverDocument.parseServerDocument(stableDocument);
    expect(reparsed).toEqual(canonical);
    const payload = { kind: "body", pageSysId: "page-001", draftContentJson: stableDocument, expectedRevision: 0 };
    const stablePayload = JSON.stringify(sort(payload));
    const parse = vi.spyOn(serverDocument, "parseServerDocument");
    const input = { authority: { changeSetId: "change-set-001", changeSetRevision: 0 }, draftContentJson: inputDocument,
      expectedRevision: 0, pageSysId: "page-001", workspace: workspaceRef() };
    const service = createService();
    const saved = expectSucceeded(service.savePageBody(input));
    expect(parse.mock.calls.filter(([value]) => value === inputDocument)).toHaveLength(1);
    expect(parse.mock.calls.filter(([value]) => value === stableDocument)).toHaveLength(0);
    parse.mockRestore();
    expect(pageRow("page-001")?.fields).toMatchObject({ draft_content_json: JSON.stringify(reparsed),
      draft_body_text: serverDocument.extractPlainTextFromServerDocument(reparsed) || "", draft_revision: 1 });
    expect(claimRow("change-set-001:0")?.fields).toMatchObject({ mutation_payload_json: stablePayload,
      mutation_key: createHash("sha256").update(`body\nchange-set-001:0\n${stablePayload}`).digest("hex").toUpperCase() });
    expectSucceeded(service.savePageBody(input));
    expect(pageRow("page-001")?.fields.draft_revision).toBe(1);
    expect(service.savePageBody({ ...input, draftContentJson: createDocument("conflict") })).toMatchObject({ kind: "failed", code: "stale_generation" });
    expect(saved.result.page.draftRevision).toBe(1);
  });

  it("rejects invalid documents before durable writes", () => {
    seedWorkspaceFoundation();
    const before = [getRows(pageTable), getRows(mutationClaimTable), getRows(changeSetTable), getRows(changeEntryTable)];
    expect(createService().savePageBody({ authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      draftContentJson: "{invalid", expectedRevision: 0, pageSysId: "page-001", workspace: workspaceRef() }).kind).toBe("failed");
    expect([getRows(pageTable), getRows(mutationClaimTable), getRows(changeSetTable), getRows(changeEntryTable)]).toEqual(before);
  });
});

describe("unretained published draft comparisons", () => {
  it("skips content comparisons for 100 unchanged unretained pages", () => {
    const pages = Array.from({ length: 100 }, (_, index) => {
      const title = `Page ${index}`;
      const document = createDocument(`Content ${index}`);
      return createSeedPage({ pageId: `page-${index}`, draftTitle: title, publishedTitle: title,
        draftSlug: `page-${index}`, publishedSlug: `page-${index}`, draftContentJson: document, publishedContentJson: document });
    });
    seedWorkspaceFoundation({ pages });
    const compare = vi.spyOn(pageDomain, "hasPageDraftDifferencesFromPublished");
    const result = expectSucceeded(createService().listPages(workspaceRef(), "edit"));
    expect(result.pages).toHaveLength(100);
    expect(compare).toHaveBeenCalledTimes(0);
    compare.mockRestore();
  });

  it.each([
    ["malformed JSON", "{not-json", "not valid JSON"],
    ["unsupported schema", JSON.stringify({ schemaVersion: 999, document: createDocument("bad") }), "unsupported document schema version"]
  ])("still rejects %s in an unretained selected snapshot", (_label, contentJson, message) => {
    seedWorkspaceFoundation();
    const row = getRows(pageSnapshotTable)[0];
    glideMock.updateRow(pageSnapshotTable, row.sysId, { ...row.fields, content_json: contentJson });
    const result = createService().listPages(workspaceRef(), "edit");
    expect(result).toMatchObject({ kind: "failed", status: 409, errorMessage: expect.stringContaining(message) });
  });

  it("retains the metadata short circuit for an unretained invalid snapshot", () => {
    seedWorkspaceFoundation();
    const row = getRows(pageSnapshotTable)[0];
    glideMock.updateRow(pageSnapshotTable, row.sysId, { ...row.fields, sibling_order: "2", content_json: "{not-json" });
    // The later projection may validate the selected snapshot; observe that the
    // draft-comparison path itself does not parse it before that projection.
    const parse = vi.spyOn(serverDocument, "parseServerDocument");
    createService().listPages(workspaceRef(), "edit");
    expect(parse.mock.calls.filter(([value]) => value === "{not-json").length).toBe(1);
    parse.mockRestore();
  });

  it("retains changed drafts when an empty retention set has a nonzero revision", () => {
    seedWorkspaceFoundation();
    const row = getRows(changeSetTable)[0];
    glideMock.updateRow(changeSetTable, row.sysId, { ...row.fields, change_set_revision: 1 });
    const result = expectSucceeded(createService().listPages(workspaceRef(), "edit"));
    expect(result.pages[0]).toMatchObject({ sysId: "page-001", draftTitle: "Draft title" });
  });

  it("rejects legacy published identity without a selected snapshot", () => {
    seedWorkspaceFoundation();
    const row = getRows(pageSnapshotTable)[0];
    glideMock.updateRow(pageSnapshotTable, row.sysId, { ...row.fields, page: "other-page" });
    expect(createService().listPages(workspaceRef(), "edit")).toMatchObject({
      kind: "failed", status: 409, errorMessage: expect.stringContaining("Legacy draft overlay references unpublished page")
    });
  });
});

describe("settings save state reuse", () => {
  it.each([false, true])("loads each collection once in a 100-page workspace (nested: %s)", (nested) => {
    const pages = Array.from({ length: 100 }, (_, index) => createSeedPage({
      pageId: `scale-${index}`, parentPageId: nested && index > 0 ? "scale-0" : null,
      siblingOrder: String(index + 1)
    }));
    seedWorkspaceFoundation({ pages });
    glideMock.clearIterations();
    const saved = expectSucceeded(createService().savePageSettings({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "scale-0", slug: "renamed", title: "Renamed", workspace: workspaceRef()
    }));
    expect(saved.result.page).toMatchObject({ draftTitle: "Renamed", draftSlug: "renamed", draftRevision: 0 });
    expect(glideMock.iterationCount(pageTable)).toBe(100);
    expect(glideMock.iterationCount(pageSnapshotTable)).toBe(100);
    expect(getRows(changeEntryTable)).toHaveLength(1);
  });

  it.each(["title", "slug"])("preserves content and metadata for a %s-only update and removes the overlay on revert", (field) => {
    const document = createDocument("Original body");
    seedWorkspaceFoundation({ pages: [createSeedPage({ pageId: "page-001", draftTitle: "Original", publishedTitle: "Original",
      draftSlug: "original", publishedSlug: "original", draftContentJson: document, publishedContentJson: document,
      draftBodyText: "Original body", publishedBodyText: "Original body", siblingOrder: "3" })] });
    const service = createService();
    const saved = expectSucceeded(service.savePageSettings({ authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-001", title: field === "title" ? "Changed" : "Original",
      slug: field === "slug" ? "changed" : "original", workspace: workspaceRef() }));
    expect(saved.result.page).toMatchObject({ draftContentJson: createDocumentEnvelope("Original body"), draftRevision: 0, draftBodyText: "Original body" });
    expect(pendingRows(service)).toMatchObject([{ category: "Modified", pageSysId: "page-001" }]);
    expectSucceeded(service.savePageSettings({ authority: saved.authority, pageSysId: "page-001",
      title: "Original", slug: "original", workspace: workspaceRef() }));
    expect(pendingRows(service)).toEqual([]);
  });

  it("retains the complete reload for an unchanged submission", () => {
    seedWorkspaceFoundation();
    const page = getRows(pageTable)[0];
    glideMock.clearIterations();
    expectSucceeded(createService().savePageSettings({ authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-001", title: String(page.fields.draft_title), slug: String(page.fields.draft_slug), workspace: workspaceRef() }));
    expect(glideMock.iterationCount(pageTable)).toBe(2);
    expect(glideMock.iterationCount(pageSnapshotTable)).toBe(2);
  });

  it("preserves unrelated pending entries and removal batches for an Added page", () => {
    const scenario = seedDiscardRecoveryScenario();
    const before = pendingRows(scenario.service);
    const batches = getRows(removalBatchTable);
    expectSucceeded(scenario.service.savePageSettings({ authority: scenario.authority, pageSysId: scenario.addedPageId,
      slug: "added-renamed", title: "Added renamed", workspace: scenario.workspace }));
    const after = pendingRows(scenario.service);
    expect(after.filter((row) => row.pageSysId !== scenario.addedPageId)).toEqual(before.filter((row) => row.pageSysId !== scenario.addedPageId));
    expect(after.find((row) => row.pageSysId === scenario.addedPageId)).toMatchObject({ category: "Added", firstPendingSequence: before.find((row) => row.pageSysId === scenario.addedPageId)?.firstPendingSequence });
    expect(getRows(removalBatchTable)).toEqual(batches);
  });

  it.each(["selector", "revision"])("reloads when the %s changes after persistence", (changed) => {
    seedWorkspaceFoundation();
    glideMock.clearIterations();
    const service = createService({ afterDurablePhase(phase) {
      if (phase === "mutation_page_persisted") {
        const table = changed === "selector" ? workspaceTable : changeSetTable;
        const row = getRows(table)[0];
        glideMock.updateRow(table, row.sysId, { ...row.fields, ...(changed === "selector" ? { workspace_state_revision: 1 } : { change_set_revision: 2 }) });
      }
    } });
    service.savePageSettings({ authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-001", slug: "renamed", title: "Renamed", workspace: workspaceRef() });
    expect(glideMock.iterationCount(pageTable)).toBe(2);
    expect(glideMock.iterationCount(pageSnapshotTable)).toBe(2);
  });
});

describe("body save state reuse", () => {
  it.each([false, true])("loads each collection once in a 100-page workspace (nested: %s)", (nested) => {
    const pages = Array.from({ length: 100 }, (_, index) => createSeedPage({
      pageId: `scale-${index}`, parentPageId: nested && index > 0 ? "scale-0" : null,
      siblingOrder: String(index + 1)
    }));
    seedWorkspaceFoundation({ pages });
    glideMock.clearIterations();
    const service = createService();
    const saved = expectSucceeded(service.savePageBody({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      draftContentJson: createDocument("updated"), expectedRevision: 0,
      pageSysId: "scale-0", workspace: workspaceRef()
    }));
    expect(saved.result.page.draftRevision).toBe(1);
    expect(glideMock.iterationCount(pageTable)).toBe(100);
    expect(glideMock.iterationCount(pageSnapshotTable)).toBe(100);
    expect(getRows(changeEntryTable)).toHaveLength(1);
  });

  it("preserves unrelated pending rows and removal batches when saving an Added page", () => {
    const scenario = seedDiscardRecoveryScenario();
    const before = pendingRows(scenario.service);
    const batches = getRows(removalBatchTable);
    const added = scenario.addedPageId;
    expectSucceeded(scenario.service.savePageBody({ authority: scenario.authority, draftContentJson: createDocument("Added body"),
      expectedRevision: 0, pageSysId: added, workspace: scenario.workspace }));
    const after = pendingRows(scenario.service);
    expect(after.filter((row) => row.pageSysId !== added)).toEqual(before.filter((row) => row.pageSysId !== added));
    expect(after.find((row) => row.pageSysId === added)).toMatchObject({ category: "Added", firstPendingSequence: before.find((row) => row.pageSysId === added)?.firstPendingSequence });
    expect(getRows(removalBatchTable)).toEqual(batches);
  });

  it("reloads after a workspace selector revision changes", () => {
    seedWorkspaceFoundation();
    glideMock.clearIterations();
    const service = createService({ afterDurablePhase(phase) {
      if (phase === "mutation_page_persisted") {
        const row = getRows(workspaceTable)[0];
        glideMock.updateRow(workspaceTable, row.sysId, { ...row.fields, workspace_state_revision: 1 });
      }
    } });
    service.savePageBody({ authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      draftContentJson: createDocument("updated"), expectedRevision: 0, pageSysId: "page-001", workspace: workspaceRef() });
    expect(glideMock.iterationCount(pageTable)).toBe(2);
    expect(glideMock.iterationCount(pageSnapshotTable)).toBe(2);
  });

  it("falls back to a full reload when the change-set revision changes after persistence", () => {
    seedWorkspaceFoundation();
    glideMock.clearIterations();
    const service = createService({ afterDurablePhase(phase) {
      if (phase === "mutation_page_persisted") {
        const row = changeSetRow()!;
        glideMock.updateRow(changeSetTable, row.sysId, { ...row.fields, change_set_revision: 2 });
      }
    } });
    const result = service.savePageBody({ authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      draftContentJson: createDocument("updated"), expectedRevision: 0, pageSysId: "page-001", workspace: workspaceRef() });
    expect(result).toMatchObject({ kind: "failed", status: 409 });
    expect(glideMock.iterationCount(pageTable)).toBe(2);
    expect(glideMock.iterationCount(pageSnapshotTable)).toBe(2);
  });
});

describe("page creation record scaling", () => {
  it("does not map projected documents during creation while listing still maps them", () => {
    const document = createDocument("unique projected content");
    seedWorkspaceFoundation({ pages: [createSeedPage({ pageId: "page-001", publishedContentJson: document })] });
    const parse = vi.spyOn(serverDocument, "parseServerDocument");
    const service = createService();
    expectSucceeded(service.createPage({ authority: { changeSetId: "change-set-001", changeSetRevision: 0 }, parentPageSysId: null, title: "New", workspace: workspaceRef() }));
    const creationCalls = parse.mock.calls.filter(([value]) => JSON.stringify(value).includes("unique projected content")).length;
    parse.mockClear();
    expectSucceeded(service.listPages(workspaceRef(), "edit"));
    const listingCalls = parse.mock.calls.filter(([value]) => JSON.stringify(value).includes("unique projected content")).length;
    expect(creationCalls).toBe(2);
    expect(listingCalls).toBe(3);
    parse.mockRestore();
  });

  it("allocates from effective additions and removals and rejects removed parents", () => {
    seedWorkspaceFoundation({ pages: [
      createSeedPage({ pageId: "root", publishedTitle: "Guide", publishedSlug: "guide", siblingOrder: "4" }),
      createSeedPage({ pageId: "removed", publishedTitle: "Removed", publishedSlug: "removed", siblingOrder: "9" })
    ] });
    const service = createService();
    const removed = expectSucceeded(service.deletePage({ authority: { changeSetId: "change-set-001", changeSetRevision: 0 }, pageSysId: "removed", workspace: workspaceRef() }));
    const first = expectSucceeded(service.createPage({ authority: removed.authority, parentPageSysId: null, title: "Guide", workspace: workspaceRef() }));
    expect(first.result.page).toMatchObject({ draftSlug: "guide-1", siblingOrder: 5 });
    const second = expectSucceeded(service.createPage({ authority: first.authority, parentPageSysId: first.result.page.sysId!, title: "Guide", workspace: workspaceRef() }));
    expect(second.result.page).toMatchObject({ draftSlug: "guide-2", siblingOrder: 1, parentPageSysId: first.result.page.sysId });
    const invalid = service.createPage({ authority: second.authority, parentPageSysId: "removed", title: "Invalid", workspace: workspaceRef() });
    expect(invalid).toMatchObject({ kind: "failed", status: 400 });
  });

  it("rechecks generation after insertion before recording a pending entry", () => {
    seedWorkspaceFoundation();
    const service = createService({ afterDurablePhase(phase) {
      if (phase === "mutation_page_persisted") {
        const row = changeSetRow()!;
        glideMock.updateRow(changeSetTable, row.sysId, { ...row.fields, change_set_revision: 2 });
      }
    } });
    const result = service.createPage({ authority: { changeSetId: "change-set-001", changeSetRevision: 0 }, title: "New", workspace: workspaceRef() });
    expect(result).toMatchObject({ kind: "failed", status: 409 });
    expect(getRows(changeEntryTable)).toHaveLength(0);
    expect(changeSetRow()?.fields.change_set_revision).toBe(2);
  });

  it.each([10, 1000])("loads initialized root-heavy and nested workspaces linearly at %i pages", (size) => {
    for (const nested of [false, true]) {
      glideMock.reset();
      const pages = Array.from({ length: size }, (_, index) => createSeedPage({
        pageId: `scale-${index}`,
        parentPageId: nested && index > 0 ? "scale-0" : null,
        siblingOrder: String(index + 1)
      }));
      seedWorkspaceFoundation({ pages });
      glideMock.clearIterations();
      const result = expectSucceeded(createService().createPage({
        authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
        parentPageSysId: nested ? "scale-0" : null,
        title: "New page",
        workspace: workspaceRef()
      }));
      expect(result.result.page.parentPageSysId ?? null).toBe(nested ? "scale-0" : null);
      expect(glideMock.iterationCount(pageTable)).toBe(size);
      expect(glideMock.iterationCount(pageSnapshotTable)).toBe(size);
    }
  });
});

describe("serviceNowWorkspaceChangeSetPersistence", () => {
  it("replays a unique-index insert loser for an identical same-pair create without duplicating the durable outcome", () => {
    seedWorkspaceFoundation();
    let seeded = false;
    glideMock.setInsertHook(mutationClaimTable, (row) => {
      if (seeded || row.fields.generation_key !== "change-set-001:0") {
        return;
      }
      seeded = true;
      glideMock.insertRow(pageTable, "created-page-001", {
        workspace: "workspace-001",
        parent_page: "",
        sibling_order: "2",
        draft_title: "Created page",
        draft_slug: "created-page",
        draft_slug_normalized: "created-page",
        draft_content_json: JSON.stringify(createDocument("Created page draft body")),
        draft_body_text: "Created page draft body",
        draft_revision: 0,
        published_title: "",
        published_slug: "",
        published_slug_normalized: "",
        published_content_json: "",
        published_body_text: "",
        publication_state: "draft",
        active: true
      });
      const setRow = new glideMock.GlideRecord(changeSetTable);
      setRow.get("sys_id", "change-set-001");
      setRow.setValue("change_set_revision", 1);
      setRow.setValue("next_pending_sequence", 2);
      setRow.update();
      glideMock.insertRow(changeEntryTable, "entry-001", {
        change_set: "change-set-001",
        page: "created-page-001",
        generation_page_key: "change-set-001:created-page-001",
        first_pending_sequence: 1,
        first_pending_on: "2026-07-18 00:00:00",
        last_changed_on: "2026-07-18 00:00:00",
        last_changed_by: "user-1"
      });
      glideMock.insertRow(mutationClaimTable, "claim-001", {
        workspace: "workspace-001",
        change_set: "change-set-001",
        generation_key: "change-set-001:0",
        mutation_key: row.fields.mutation_key,
        mutation_kind: "create",
        mutation_state: "finalized",
        claim_owner_key: "winner-owner",
        owner_expires_on: "2026-07-18 00:00:30",
        execution_phase: "finalized",
        mutation_payload_json: row.fields.mutation_payload_json,
        target_page_sys_id: "created-page-001",
        target_next_page_sys_id: "",
        target_removal_batch_key: "",
        result_change_set: "change-set-001",
        result_change_set_revision: 1,
        mutation_result_json: JSON.stringify({
          page: {
            sysId: "created-page-001",
            workspaceSysId: "workspace-001",
            parentPageSysId: null,
            siblingOrder: 2,
            draftTitle: "Created page",
            draftSlug: "created-page",
            draftSlugNormalized: "created-page",
            draftContentJson: createDocument("Created page draft body"),
            draftBodyText: "Created page draft body",
            draftRevision: 0,
            publishedTitle: null,
            publishedSlug: null,
            publishedSlugNormalized: null,
            publishedContentJson: null,
            publishedBodyText: null,
            publicationState: "draft",
            active: true
          }
        }),
        claimed_on: "2026-07-18 00:00:00",
        applied_on: "2026-07-18 00:00:00",
        finalized_on: "2026-07-18 00:00:01",
        error_message: ""
      });
    });

    const service = createService();
    const result = expectSucceeded(service.createPage({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      parentPageSysId: null,
      title: "Created page",
      workspace: workspaceRef()
    }));

    expect(result.authority).toEqual({ changeSetId: "change-set-001", changeSetRevision: 1 });
    expect(result.result.page.sysId).toBe("created-page-001");
    expect(getRows(pageTable).filter((row) => row.fields.draft_title === "Created page")).toHaveLength(1);
    expect(getRows(mutationClaimTable)).toHaveLength(1);
    expect(getRows(changeEntryTable)).toHaveLength(1);
    expect(changeSetRow()?.fields.change_set_revision).toBe(1);
  });

  it("deletes an Added draft-only page through the delete mutation without creating a removal batch", () => {
    seedWorkspaceFoundation({
      pages: [
        createSeedPage({
          pageId: "page-001",
          draftTitle: "Root",
          publishedTitle: "Root",
          siblingOrder: "1"
        })
      ]
    });
    const service = createService();
    const liveBefore = expectSucceeded(service.listPages(workspaceRef(), "live")).pages;
    const created = expectSucceeded(service.createPage({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      parentPageSysId: "page-001",
      title: "Draft-only child",
      workspace: workspaceRef()
    }));
    const addedPageId = created.result.page.sysId ?? "";

    expect(addedPageId).toBeTruthy();
    expect(pendingRows(service)).toEqual([
      expect.objectContaining({
        category: "Added",
        pageSysId: addedPageId
      })
    ]);

    const deleted = expectSucceeded(service.deletePage({
      authority: created.authority,
      pageSysId: addedPageId,
      workspace: workspaceRef()
    }));

    expect(deleted.authority).toEqual({ changeSetId: "change-set-001", changeSetRevision: 2 });
    expect(deleted.result).toEqual({
      deletedPageSysId: addedPageId,
      nextPageSysId: "page-001"
    });
    expect(expectSucceeded(service.listPages(workspaceRef(), "edit")).pages.map((page) => page.sysId)).toEqual(["page-001"]);
    expect(expectSucceeded(service.listPages(workspaceRef(), "live")).pages).toEqual(liveBefore);
    expect(pageRow(addedPageId)).toBeUndefined();
    expect(getRows(changeEntryTable)).toEqual([]);
    expect(getRows(removalBatchTable)).toEqual([]);
    expect(getRows(removalMemberTable)).toEqual([]);
    expect(changeSetRow()?.fields.change_set_revision).toBe(2);
    expect(claimRow("change-set-001:1")).toEqual(expect.objectContaining({
      fields: expect.objectContaining({
        execution_phase: "finalized",
        mutation_kind: "delete",
        target_next_page_sys_id: "page-001",
        target_page_sys_id: addedPageId,
        target_removal_batch_key: ""
      })
    }));
  });

  it("returns a stale-generation failure when a different mutation kind wins the same generation-pair insert race", () => {
    seedWorkspaceFoundation();
    let seeded = false;
    glideMock.setInsertHook(mutationClaimTable, () => {
      if (seeded) {
        return;
      }
      seeded = true;
      glideMock.insertRow(mutationClaimTable, "claim-001", {
        workspace: "workspace-001",
        change_set: "change-set-001",
        generation_key: "change-set-001:0",
        mutation_key: "SETTINGS-WINNER",
        mutation_kind: "settings",
        mutation_state: "claimed",
        claim_owner_key: "winner-owner",
        owner_expires_on: "2026-07-18 00:00:30",
        execution_phase: "claimed",
        mutation_payload_json: JSON.stringify({
          kind: "settings",
          pageSysId: "page-001",
          slug: "winner",
          title: "Winner"
        }),
        claimed_on: "2026-07-18 00:00:00"
      });
    });

    const service = createService();
    const result = service.savePageBody({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      draftContentJson: createDocument("Body loser"),
      expectedRevision: 0,
      pageSysId: "page-001",
      workspace: workspaceRef()
    });

    expect(result).toMatchObject({
      kind: "failed",
      code: "stale_generation",
      currentChangeSetId: "change-set-001",
      currentChangeSetRevision: 0
    });
    expect(getRows(mutationClaimTable)).toHaveLength(1);
    expect(getRows(mutationClaimTable)[0]?.fields.mutation_kind).toBe("settings");
  });

  it("returns an explicit in-progress failure for an identical request observing a non-expired claim", () => {
    seedWorkspaceFoundation();
    const input = {
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      draftContentJson: createDocument("In progress body"),
      expectedRevision: 0,
      pageSysId: "page-001",
      workspace: workspaceRef()
    };
    const failingService = createService({
      currentTimestamp: () => "2026-07-18 00:00:00",
      failPhase: "mutation_claim_created"
    });
    expect(failingService.savePageBody(input).kind).toBe("failed");

    const service = createService({ currentTimestamp: () => "2026-07-18 00:00:00" });
    const result = service.savePageBody(input);

    expect(result).toMatchObject({
      kind: "failed",
      code: "invalid",
      currentChangeSetId: "change-set-001",
      currentChangeSetRevision: 0,
      status: 409
    });
  });

  it("uses bounded collision-resistant mutation fingerprints for large body payloads while preserving the full canonical payload JSON", () => {
    seedWorkspaceFoundation();
    const service = createService();
    const firstBody = createDocument(`${"A".repeat(4096)}-one`);
    const first = expectSucceeded(service.savePageBody({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      draftContentJson: firstBody,
      expectedRevision: 0,
      pageSysId: "page-001",
      workspace: workspaceRef()
    }));
    const secondBody = createDocument(`${"A".repeat(4096)}-two`);
    expectSucceeded(service.savePageBody({
      authority: first.authority,
      draftContentJson: secondBody,
      expectedRevision: 1,
      pageSysId: "page-001",
      workspace: workspaceRef()
    }));

    const claims = getRows(mutationClaimTable);
    expect(claims).toHaveLength(2);
    expect(String(claims[0]?.fields.mutation_key)).toHaveLength(64);
    expect(String(claims[1]?.fields.mutation_key)).toHaveLength(64);
    expect(claims[0]?.fields.mutation_key).not.toBe(claims[1]?.fields.mutation_key);
    expect(String(claims[0]?.fields.mutation_payload_json)).toContain("A".repeat(256));
    expect(String(claims[1]?.fields.mutation_payload_json)).toContain("A".repeat(256));
  });

  it("loads pending collections only for Edit projections", () => {
    const seeded = seedValidNonSeedSelectors();
    const service = createService();
    const counts = () => [changeEntryTable, removalBatchTable, removalMemberTable].map(glideMock.queryCount);

    glideMock.clearQueries();
    const live = expectSucceeded(service.listPages(seeded.workspace, "live"));
    expect(counts()).toEqual([0, 0, 0]);
    expect(live.pages.map((page) => [page.sysId, page.draftTitle, page.parentPageSysId])).toEqual([
      ["page-001", "Selected Root", null],
      ["page-002", "Selected Child", "page-001"],
      ["page-003", "Selected Sibling", null]
    ]);

    glideMock.insertRow(changeEntryTable, "entry-1", {
      change_set: seeded.selectedChangeSetId, page: "page-001", first_pending_sequence: 1
    });
    for (const [index, state] of ["active", "retired", "active"].entries()) {
      const id = `batch-${index}`;
      glideMock.insertRow(removalBatchTable, id, {
        change_set: seeded.selectedChangeSetId, batch_key: id, root_page: "page-002", lifecycle_state: state
      });
      glideMock.insertRow(removalMemberTable, `member-${index}`, {
        removal_batch: id, page: "page-002", first_pending_sequence: 2
      });
    }
    glideMock.clearQueries();
    expect(expectSucceeded(service.listPages(seeded.workspace, "live")).pages).toEqual(live.pages);
    expect(counts()).toEqual([0, 0, 0]);

    glideMock.clearQueries();
    const edit = expectSucceeded(service.listPages(seeded.workspace, "edit"));
    expect(counts()).toEqual([1, 1, 1]);
    expect(edit.state.entries).toHaveLength(1);
    expect(edit.state.removalBatches.map((batch) => [batch.state, batch.members.length])).toEqual([
      ["active", 1], ["retired", 1], ["active", 1]
    ]);
  });

  it("bounds removal-member queries and associates interleaved rows while retaining empty retired batches", () => {
    const seeded = seedValidNonSeedSelectors();
    const service = createService();
    glideMock.clearQueries();
    expectSucceeded(service.listPages(seeded.workspace, "edit"));
    expect(glideMock.queryCount(removalMemberTable)).toBe(0);
    for (let index = 0; index < 101; index++) {
      glideMock.insertRow(removalBatchTable, `batch-${index}`, {
        change_set: seeded.selectedChangeSetId, batch_key: `key-${index}`, root_page: "page-001", lifecycle_state: "retired"
      });
    }
    for (const [batch, page, sequence] of [[100, "page-003", 3], [0, "page-001", 1], [100, "page-002", 2]] as const) {
      glideMock.insertRow(removalMemberTable, `member-${batch}-${page}`, {
        removal_batch: `batch-${batch}`, page, first_pending_sequence: sequence
      });
    }
    glideMock.clearQueries();
    const edit = expectSucceeded(service.listPages(seeded.workspace, "edit"));
    expect(glideMock.queryCount(removalMemberTable)).toBe(2);
    expect(glideMock.queryConditions(removalMemberTable).map((conditions) => String(conditions[0]?.value).split(",").length)).toEqual([100, 1]);
    expect(edit.state.removalBatches.map((batch) => batch.id)).toEqual(Array.from({ length: 101 }, (_, index) => `key-${index}`));
    expect(edit.state.removalBatches[0]?.members).toEqual([{ pageId: "page-001", firstPendingSequence: 1 }]);
    expect(edit.state.removalBatches[1]?.members).toEqual([]);
    expect(edit.state.removalBatches[100]?.members).toEqual([
      { pageId: "page-003", firstPendingSequence: 3 }, { pageId: "page-002", firstPendingSequence: 2 }
    ]);
  });

  it.each(["duplicate", "missing-root", "invalid-sequence"])("preserves invalid removal validation: %s", (invalid) => {
    const seeded = seedValidNonSeedSelectors();
    glideMock.insertRow(removalBatchTable, "batch-invalid", {
      change_set: seeded.selectedChangeSetId, batch_key: "invalid", root_page: "page-001", lifecycle_state: "active"
    });
    glideMock.insertRow(removalMemberTable, "member-invalid", {
      removal_batch: "batch-invalid", page: invalid === "missing-root" ? "page-002" : "page-001",
      first_pending_sequence: invalid === "invalid-sequence" ? "invalid" : 1
    });
    if (invalid === "duplicate") glideMock.insertRow(removalMemberTable, "member-duplicate", {
      removal_batch: "batch-invalid", page: "page-001", first_pending_sequence: 2
    });
    expect(createService().listPages(seeded.workspace, "edit").kind).toBe("failed");
  });

  it("preserves valid selected successor selectors and selected snapshot rows through ordinary listing and every mutation type", () => {
    const seeded = seedValidNonSeedSelectors();
    const service = createService();
    const snapshotRowsBefore = getRows(pageSnapshotTable)
      .filter((row) => row.fields.snapshot_set === seeded.selectedSnapshotSetId)
      .map((row) => ({ sysId: row.sysId, fields: { ...row.fields } }));

    glideMock.clearGets();
    const live = expectSucceeded(service.listPages(seeded.workspace, "live"));
    expect(glideMock.getCount(mutationClaimTable)).toBe(0);
    expect(live.pages.map((page) => page.draftTitle)).toEqual(["Selected Root", "Selected Child", "Selected Sibling"]);
    expectActiveSelectors(seeded.selectedChangeSetId, seeded.selectedSnapshotSetId);

    glideMock.clearGets();
    const edit = expectSucceeded(service.listPages(seeded.workspace, "edit"));
    expect(glideMock.getCount(mutationClaimTable)).toBe(1);
    expect(edit.pages.map((page) => page.draftTitle)).toEqual(["Draft Root", "Draft Child", "Draft Sibling"]);
    expectActiveSelectors(seeded.selectedChangeSetId, seeded.selectedSnapshotSetId);

    const afterBody = expectSucceeded(service.savePageBody({
      authority: seeded.authority,
      draftContentJson: createDocument("Changed successor sibling"),
      expectedRevision: 0,
      pageSysId: "page-003",
      workspace: seeded.workspace
    }));
    expectActiveSelectors(seeded.selectedChangeSetId, seeded.selectedSnapshotSetId);

    const afterSettings = expectSucceeded(service.savePageSettings({
      authority: afterBody.authority,
      pageSysId: "page-003",
      slug: "renamed-successor-sibling",
      title: "Renamed successor sibling",
      workspace: seeded.workspace
    }));
    expectActiveSelectors(seeded.selectedChangeSetId, seeded.selectedSnapshotSetId);

    const afterCreate = expectSucceeded(service.createPage({
      authority: afterSettings.authority,
      parentPageSysId: null,
      title: "Created successor page",
      workspace: seeded.workspace
    }));
    expectActiveSelectors(seeded.selectedChangeSetId, seeded.selectedSnapshotSetId);

    expectSucceeded(service.deletePage({
      authority: afterCreate.authority,
      pageSysId: "page-001",
      workspace: seeded.workspace
    }));
    expectActiveSelectors(seeded.selectedChangeSetId, seeded.selectedSnapshotSetId);

    expect(getRows(changeEntryTable).length).toBeGreaterThan(0);
    expect(getRows(removalBatchTable).length).toBeGreaterThan(0);
    glideMock.clearGets();
    const liveAfter = expectSucceeded(service.listPages(seeded.workspace, "live"));
    expect(glideMock.getCount(mutationClaimTable)).toBe(0);
    expect(liveAfter.pages.map(({ draftRevision, ...page }) => page)).toEqual(
      live.pages.map(({ draftRevision, ...page }) => page)
    );
    expect(liveAfter.pages.map((page) => page.draftTitle)).toEqual(["Selected Root", "Selected Child", "Selected Sibling"]);
    expectActiveSelectors(seeded.selectedChangeSetId, seeded.selectedSnapshotSetId);
    expect(getRows(workspaceTable)[0]?.fields.pending_change_set).not.toBe(seeded.seedChangeSetId);
    expect(getRows(workspaceTable)[0]?.fields.published_snapshot_set).not.toBe(seeded.seedSnapshotSetId);

    const snapshotRowsAfter = getRows(pageSnapshotTable)
      .filter((row) => row.fields.snapshot_set === seeded.selectedSnapshotSetId)
      .map((row) => ({ sysId: row.sysId, fields: { ...row.fields } }));
    expect(snapshotRowsAfter).toEqual(snapshotRowsBefore);
  });

  it("preserves Edit and Live content when loading published page records", () => {
    const seeded = seedValidNonSeedSelectors();
    const service = createService();
    const edit = expectSucceeded(service.listPages(seeded.workspace, "edit"));
    const live = expectSucceeded(service.listPages(seeded.workspace, "live"));
    const editRoot = edit.pages.find((page) => page.sysId === "page-001");
    const liveRoot = live.pages.find((page) => page.sysId === "page-001");
    expect(editRoot).toMatchObject({ draftTitle: "Draft Root", draftBodyText: "Draft root body" });
    expect(liveRoot).toMatchObject({ draftTitle: "Selected Root", draftBodyText: "Selected root body" });
    expect(editRoot?.draftContentJson).not.toEqual(liveRoot?.draftContentJson);
  });

  it("does not rewrite a ready selected snapshot or Live projection from page published fields", () => {
    const seeded = seedValidNonSeedSelectors();
    const beforeSnapshot = getRows(pageSnapshotTable)
      .filter((row) => row.fields.snapshot_set === seeded.selectedSnapshotSetId)
      .map((row) => ({ sysId: row.sysId, fields: { ...row.fields } }));
    const publishedRow = pageRow("page-001");
    if (!publishedRow) {
      throw new Error("Expected page-001 to exist.");
    }
    glideMock.updateRow(pageTable, "page-001", {
      ...publishedRow.fields,
      published_title: "Published after selector load",
      published_slug: "published-after-selector-load",
      published_slug_normalized: "published-after-selector-load",
      published_content_json: JSON.stringify(createDocument("Published after selector load")),
      published_body_text: "Published after selector load"
    });

    const service = createService();
    const live = expectSucceeded(service.listPages(seeded.workspace, "live"));
    expect(live.pages.find((page) => page.sysId === "page-001")?.draftTitle).toBe("Selected Root");
    expect(live.pages.find((page) => page.sysId === "page-001")?.draftBodyText).toBe("Selected root body");
    expect(
      getRows(pageSnapshotTable)
        .filter((row) => row.fields.snapshot_set === seeded.selectedSnapshotSetId)
        .map((row) => ({ sysId: row.sysId, fields: { ...row.fields } }))
    ).toEqual(beforeSnapshot);
  });

  it.each([
    ["malformed JSON", "{not-json"],
    ["unsupported schema", JSON.stringify({ schemaVersion: 999, document: createDocument("Unsupported schema draft") })]
  ])("loads the Live projection when a draft is %s", (_label, draftContentJson) => {
    seedWorkspaceFoundation({
      pages: [
        createSeedPage({
          pageId: "page-001",
          draftBodyText: "Root draft body",
          draftContentJson: createDocument("Root draft body"),
          draftTitle: "Root",
          publishedBodyText: "Root published body",
          publishedContentJson: createDocument("Root published body"),
          publishedSlug: "root",
          publishedTitle: "Root",
          siblingOrder: "1"
        }),
        createSeedPage({
          pageId: "page-002",
          draftBodyText: "Child draft body",
          draftContentJson: createDocument("Child draft body"),
          draftTitle: "Child",
          parentPageId: "page-001",
          publishedBodyText: "Child published body",
          publishedContentJson: createDocument("Child published body"),
          publishedSlug: "child",
          publishedTitle: "Child",
          siblingOrder: "1"
        }),
        createSeedPage({
          pageId: "page-003",
          draftBodyText: "Sibling draft body",
          draftContentJson: createDocument("Sibling draft body"),
          draftTitle: "Sibling",
          publishedBodyText: "Sibling published body",
          publishedContentJson: createDocument("Sibling published body"),
          publishedSlug: "sibling",
          publishedTitle: "Sibling",
          siblingOrder: "2"
        })
      ]
    });
    const page = pageRow("page-002");
    if (!page) {
      throw new Error("Expected page-002 to exist.");
    }
    glideMock.updateRow(pageTable, "page-002", {
      ...page.fields,
      draft_content_json: draftContentJson
    });

    const live = expectSucceeded(createService().listPages(workspaceRef(), "live"));

    expect(live.pages.map((page) => page.sysId)).toEqual(["page-001", "page-002", "page-003"]);
    expect(live.pages.find((page) => page.sysId === "page-002")).toMatchObject({
      draftBodyText: "Child published body",
      draftTitle: "Child",
      parentPageSysId: "page-001",
      publishedBodyText: "Child published body"
    });
    expect(live.pages.find((page) => page.sysId === "page-003")).toMatchObject({
      draftTitle: "Sibling",
      publishedBodyText: "Sibling published body",
      siblingOrder: 2
    });
  });

  it.each([
    ["malformed JSON", "{not-json"],
    ["unsupported schema", JSON.stringify({ schemaVersion: 999, document: createDocument("Unsupported schema published") })]
  ])("loads the Live projection when a current page-row published content is %s", (_label, publishedContentJson) => {
    const seeded = seedValidNonSeedSelectors();
    const publishedRow = pageRow("page-002");
    if (!publishedRow) {
      throw new Error("Expected page-002 to exist.");
    }
    glideMock.updateRow(pageTable, "page-002", {
      ...publishedRow.fields,
      published_body_text: "Published after selector load",
      published_content_json: publishedContentJson,
      published_slug: "published-after-selector-load",
      published_slug_normalized: "published-after-selector-load",
      published_title: "Published after selector load"
    });

    const live = expectSucceeded(createService().listPages(seeded.workspace, "live"));

    expect(live.pages).toEqual([
      expect.objectContaining({
        active: true,
        draftBodyText: "Selected root body",
        draftSlug: "selected-root",
        draftTitle: "Selected Root",
        parentPageSysId: null,
        siblingOrder: 1,
        sysId: "page-001"
      }),
      expect.objectContaining({
        active: true,
        draftBodyText: "Selected child body",
        draftSlug: "selected-child",
        draftTitle: "Selected Child",
        parentPageSysId: "page-001",
        siblingOrder: 1,
        sysId: "page-002"
      }),
      expect.objectContaining({
        active: true,
        draftBodyText: "Selected sibling body",
        draftSlug: "selected-sibling",
        draftTitle: "Selected Sibling",
        parentPageSysId: null,
        siblingOrder: 2,
        sysId: "page-003"
      })
    ]);
  });

  it.each([
    ["malformed JSON", "{not-json", "not valid JSON"],
    ["unsupported schema", JSON.stringify({ schemaVersion: 999, document: createDocument("Unsupported schema snapshot") }), "unsupported document schema version"]
  ])("fails closed when the selected ready snapshot content is %s", (_label, contentJson, errorMessage) => {
    const seeded = seedValidNonSeedSelectors();
    const snapshotRow = getRows(pageSnapshotTable).find(
      (row) => row.fields.snapshot_set === seeded.selectedSnapshotSetId && row.fields.page === "page-002"
    );
    if (!snapshotRow) {
      throw new Error("Expected selected snapshot page-002 to exist.");
    }
    glideMock.updateRow(pageSnapshotTable, snapshotRow.sysId, {
      ...snapshotRow.fields,
      content_json: contentJson
    });

    const result = createService().listPages(seeded.workspace, "live");

    expect(result).toMatchObject({
      kind: "failed",
      status: 409
    });
    if (result.kind === "failed") {
      expect(result.errorMessage).toContain(errorMessage);
    }
  });

  it.each([
    ["malformed JSON", "{not-json", "not valid JSON"],
    ["unsupported schema", JSON.stringify({ schemaVersion: 999, document: createDocument("Unsupported schema foundation") }), "unsupported document schema version"]
  ])("fails closed when foundation establishment parses a legacy published page row that is %s", (_label, publishedContentJson, errorMessage) => {
    seedWorkspaceFoundation({
      includeChangeSet: false,
      includeSnapshot: false,
      pages: [
        createSeedPage({
          pageId: "page-001",
          draftBodyText: "Root draft body",
          draftContentJson: createDocument("Root draft body"),
          draftTitle: "Root",
          publishedBodyText: "Root published body",
          publishedContentJson: createDocument("Root published body"),
          publishedSlug: "root",
          publishedTitle: "Root",
          siblingOrder: "1"
        }),
        createSeedPage({
          pageId: "page-002",
          draftBodyText: "Child draft body",
          draftContentJson: createDocument("Child draft body"),
          draftTitle: "Child",
          parentPageId: "page-001",
          publishedBodyText: "Child published body",
          publishedContentJson: createDocument("Child published body"),
          publishedSlug: "child",
          publishedTitle: "Child",
          siblingOrder: "1"
        })
      ]
    });
    const page = pageRow("page-002");
    if (!page) {
      throw new Error("Expected page-002 to exist.");
    }
    glideMock.updateRow(pageTable, "page-002", {
      ...page.fields,
      published_content_json: publishedContentJson
    });

    const result = createService().listPages(
      workspaceRef({
        pendingChangeSetSysId: "",
        publishedSnapshotSetSysId: ""
      }),
      "live"
    );

    expect(result).toMatchObject({
      kind: "failed",
      status: 409
    });
    if (result.kind === "failed") {
      expect(result.errorMessage).toContain(errorMessage);
    }
    expect(getRows(snapshotSetTable)).toHaveLength(0);
    expect(getRows(pageSnapshotTable)).toHaveLength(0);
  });

  it.each([
    ["malformed JSON", "{not-json", "not valid JSON"],
    ["unsupported schema", JSON.stringify({ schemaVersion: 999, document: createDocument("Unsupported schema draft") }), "unsupported document schema version"]
  ])("continues to reject Edit loading when a draft is %s", (_label, draftContentJson, errorMessage) => {
    seedWorkspaceFoundation({
      pages: [
        createSeedPage({
          pageId: "page-001",
          draftBodyText: "Root draft body",
          draftContentJson: createDocument("Root draft body"),
          draftTitle: "Root",
          publishedBodyText: "Root published body",
          publishedContentJson: createDocument("Root published body"),
          publishedSlug: "root",
          publishedTitle: "Root",
          siblingOrder: "1"
        }),
        createSeedPage({
          pageId: "page-002",
          draftBodyText: "Child draft body",
          draftContentJson: createDocument("Child draft body"),
          draftTitle: "Child",
          parentPageId: "page-001",
          publishedBodyText: "Child published body",
          publishedContentJson: createDocument("Child published body"),
          publishedSlug: "child",
          publishedTitle: "Child",
          siblingOrder: "1"
        })
      ]
    });
    const page = pageRow("page-002");
    if (!page) {
      throw new Error("Expected page-002 to exist.");
    }
    glideMock.updateRow(pageTable, "page-002", {
      ...page.fields,
      draft_content_json: draftContentJson
    });

    const result = createService().listPages(workspaceRef(), "edit");

    expect(result).toMatchObject({
      kind: "failed",
      status: 409
    });
    if (result.kind === "failed") {
      expect(result.errorMessage).toContain(errorMessage);
    }
  });

  it("converges an incomplete legacy foundation idempotently and stops rewriting once the ready selectors exist", () => {
    seedWorkspaceFoundation({
      includeChangeSet: false,
      includeSnapshot: false,
      pages: [
        createSeedPage({ pageId: "page-001", publishedTitle: "One", publishedSlug: "one", publishedBodyText: "One body" }),
        createSeedPage({ pageId: "page-002", publishedTitle: "Two", publishedSlug: "two", publishedBodyText: "Two body", siblingOrder: "2" })
      ]
    });
    const workspace = workspaceRef({
      pendingChangeSetSysId: "",
      publishedSnapshotSetSysId: ""
    });

    expect(createService({ failPhase: "foundation_snapshot_page_inserted" }).listPages(workspace, "live").kind).toBe("failed");
    const service = createService();
    const recovered = expectSucceeded(service.listPages(workspace, "live"));
    const snapshotRowsAfterRecover = getRows(pageSnapshotTable).map((row) => ({ sysId: row.sysId, fields: { ...row.fields } }));
    const createdChangeSetId = String(getRows(workspaceTable)[0]?.fields.pending_change_set || "");
    const createdSnapshotSetId = String(getRows(workspaceTable)[0]?.fields.published_snapshot_set || "");
    expect(recovered.pages.map((page) => page.sysId).sort()).toEqual(["page-001", "page-002"]);
    expect(Boolean(createdChangeSetId)).toBe(true);
    expect(Boolean(createdSnapshotSetId)).toBe(true);

    const second = expectSucceeded(service.listPages(workspace, "live"));
    expect(second.pages.map((page) => page.sysId).sort()).toEqual(["page-001", "page-002"]);
    expect(getRows(pageSnapshotTable).map((row) => ({ sysId: row.sysId, fields: { ...row.fields } }))).toEqual(snapshotRowsAfterRecover);
    expectActiveSelectors(createdChangeSetId, createdSnapshotSetId);
  });

  it("does not reset a later selected successor generation to deterministic seed rows", () => {
    const seeded = seedValidNonSeedSelectors();
    const service = createService();

    expectSucceeded(service.listPages(seeded.workspace, "edit"));

    expect(getRows(workspaceTable)[0]?.fields.pending_change_set).toBe(seeded.selectedChangeSetId);
    expect(getRows(workspaceTable)[0]?.fields.pending_change_set).not.toBe(seeded.seedChangeSetId);
    expect(changeSetRow(seeded.selectedChangeSetId)?.fields.change_set_revision).toBe(4);
  });

  for (const phase of [
    "mutation_claim_created",
    "mutation_page_persisted",
    "mutation_entry_persisted"
  ] satisfies FailurePhase[]) {
    it(`stops the former body executor before another durable write when ownership changes after ${phase}`, () => {
      seedWorkspaceFoundation();
      const generationKey = "change-set-001:0";
      const service = createService({
        afterDurablePhase(triggeredPhase) {
          if (triggeredPhase === phase) {
            replaceClaimOwner(generationKey, `replacement-owner-${phase}`);
          }
        }
      });

      const result = service.savePageBody({
        authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
        draftContentJson: createDocument(`owner-loss-${phase}`),
        expectedRevision: 0,
        pageSysId: "page-001",
        workspace: workspaceRef()
      });

      expect(result.kind).toBe("failed");
      expect(claimRow(generationKey)?.fields.claim_owner_key).toBe(`replacement-owner-${phase}`);
      if (phase === "mutation_claim_created") {
        expect(pageRow("page-001")?.fields.draft_revision).toBe(0);
      }
      if (phase === "mutation_page_persisted") {
        expect(getRows(changeEntryTable)).toHaveLength(0);
        expect(changeSetRow()?.fields.change_set_revision).toBe(0);
      }
      if (phase === "mutation_entry_persisted") {
        expect(getRows(changeEntryTable)).toHaveLength(1);
        expect(changeSetRow()?.fields.change_set_revision).toBe(0);
      }
    });
  }

  it("stops the former delete executor before another durable write when ownership changes after removal persistence", () => {
    seedWorkspaceFoundation({
      pages: [
        createSeedPage({ pageId: "page-001", draftTitle: "Root Draft", publishedTitle: "Root" }),
        createSeedPage({
          pageId: "page-002",
          parentPageId: "page-001",
          siblingOrder: "1",
          draftTitle: "Child Draft",
          publishedTitle: "Child"
        }),
        createSeedPage({
          pageId: "page-003",
          parentPageId: null,
          siblingOrder: "2",
          draftTitle: "Sibling Draft",
          publishedTitle: "Sibling"
        })
      ]
    });
    const generationKey = "change-set-001:0";
    const service = createService({
      afterDurablePhase(phase) {
        if (phase === "mutation_removal_persisted") {
          replaceClaimOwner(generationKey, "replacement-owner-delete");
        }
      }
    });

    const result = service.deletePage({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-001",
      workspace: workspaceRef()
    });

    expect(result.kind).toBe("failed");
    expect(claimRow(generationKey)?.fields.claim_owner_key).toBe("replacement-owner-delete");
    expect(getRows(removalBatchTable)).toHaveLength(1);
    expect(getRows(removalMemberTable)).toHaveLength(2);
    expect(changeSetRow()?.fields.change_set_revision).toBe(0);
  });

  it("allows exactly one expired-claim recoverer to execute and returns a safe replay to the loser", () => {
    seedWorkspaceFoundation();
    const input = {
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      draftContentJson: createDocument("Recovered expired owner body"),
      expectedRevision: 0,
      pageSysId: "page-001",
      workspace: workspaceRef()
    };
    expect(createService({
      currentTimestamp: () => "2026-07-18 00:00:00",
      failPhase: "mutation_claim_created"
    }).savePageBody(input).kind).toBe("failed");

    const winner = expectSucceeded(createService({ currentTimestamp: () => "2026-07-18 00:01:00" }).savePageBody(input));
    const loser = expectSucceeded(createService({ currentTimestamp: () => "2026-07-18 00:01:00" }).savePageBody(input));

    expect(winner.authority).toEqual({ changeSetId: "change-set-001", changeSetRevision: 1 });
    expect(loser.authority).toEqual({ changeSetId: "change-set-001", changeSetRevision: 1 });
    expect(getRows(changeEntryTable)).toHaveLength(1);
    expect(pageRow("page-001")?.fields.draft_revision).toBe(1);
    expect(changeSetRow()?.fields.change_set_revision).toBe(1);
    expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("finalized");
  });

  for (const phase of [
    "mutation_claim_created",
    "mutation_page_persisted",
    "mutation_entry_persisted",
    "mutation_change_set_persisted",
    "mutation_result_persisted",
    "mutation_finalized"
  ] satisfies FailurePhase[]) {
    it(`recovers body-save interruption at ${phase} without double-applying draft or entry state`, () => {
      seedWorkspaceFoundation();
      let now = "2026-07-18 00:00:00";
      const failingService = createService({ currentTimestamp: () => now, failPhase: phase });
      const input = {
        authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
        draftContentJson: createDocument("Recovered body"),
        expectedRevision: 0,
        pageSysId: "page-001",
        workspace: workspaceRef()
      };

      const first = failingService.savePageBody(input);
      expect(first.kind).toBe("failed");
      now = "2026-07-18 00:01:00";

      const service = createService({ currentTimestamp: () => now });
      const retry = expectSucceeded(service.savePageBody(input));
      expect(retry.authority).toEqual({ changeSetId: "change-set-001", changeSetRevision: 1 });
      expect(retry.result.page.draftRevision).toBe(1);
      expect(pageRow("page-001")?.fields.draft_revision).toBe(1);
      expect(changeSetRow()?.fields.change_set_revision).toBe(1);
      expect(getRows(changeEntryTable)).toHaveLength(1);
      expect(getRows(changeEntryTable)[0]?.fields.first_pending_sequence).toBe(1);
      expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("finalized");
      expect(claimRow("change-set-001:0")?.fields.mutation_state).toBe("finalized");
    });
  }

  it("recovers body-save interruption immediately after the change-set row update without inferring another mutation", () => {
    seedWorkspaceFoundation();
    const input = {
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      draftContentJson: createDocument("Recovered body after row update"),
      expectedRevision: 0,
      pageSysId: "page-001",
      workspace: workspaceRef()
    };

    expect(createService({ failPhase: "mutation_change_set_row_updated" }).savePageBody(input).kind).toBe("failed");
    expect(changeSetRow()?.fields.change_set_revision).toBe(1);
    expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("change_set_advancing");
    expect(claimRow("change-set-001:0")?.fields.result_change_set).toBe("");

    const retry = expectSucceeded(createService().savePageBody(input));
    expect(retry.authority).toEqual({ changeSetId: "change-set-001", changeSetRevision: 1 });
    expect(pageRow("page-001")?.fields.draft_revision).toBe(1);
    expect(getRows(changeEntryTable)).toHaveLength(1);
    expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("finalized");
  });

  it("recovers settings-save interruption immediately after the change-set row update without applying settings twice", () => {
    seedWorkspaceFoundation();
    const input = {
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-001",
      slug: "recovered-after-row-update",
      title: "Recovered after row update",
      workspace: workspaceRef()
    };

    expect(createService({ failPhase: "mutation_change_set_row_updated" }).savePageSettings(input).kind).toBe("failed");
    expect(changeSetRow()?.fields.change_set_revision).toBe(1);
    expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("change_set_advancing");

    const retry = expectSucceeded(createService().savePageSettings(input));
    expect(retry.authority).toEqual({ changeSetId: "change-set-001", changeSetRevision: 1 });
    expect(pageRow("page-001")?.fields.draft_title).toBe("Recovered after row update");
    expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("finalized");
  });

  it("recovers create interruption immediately after the change-set row update without creating a duplicate page", () => {
    seedWorkspaceFoundation();
    const input = {
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      parentPageSysId: null,
      title: "Recovered create after row update",
      workspace: workspaceRef()
    };

    expect(createService({ failPhase: "mutation_change_set_row_updated" }).createPage(input).kind).toBe("failed");
    expect(changeSetRow()?.fields.change_set_revision).toBe(1);
    expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("change_set_advancing");

    const retry = expectSucceeded(createService().createPage(input));
    expect(retry.authority).toEqual({ changeSetId: "change-set-001", changeSetRevision: 1 });
    expect(getRows(pageTable).filter((row) => row.fields.draft_title === "Recovered create after row update")).toHaveLength(1);
    expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("finalized");
  });

  it("recovers delete interruption immediately after the change-set row update without duplicating removal rows", () => {
    seedWorkspaceFoundation({
      pages: [
        createSeedPage({ pageId: "page-001", draftTitle: "Root Draft", publishedTitle: "Root" }),
        createSeedPage({
          pageId: "page-002",
          parentPageId: "page-001",
          siblingOrder: "1",
          draftTitle: "Child Draft",
          publishedTitle: "Child"
        }),
        createSeedPage({
          pageId: "page-003",
          parentPageId: null,
          siblingOrder: "2",
          draftTitle: "Sibling Draft",
          publishedTitle: "Sibling"
        })
      ]
    });
    const input = {
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-001",
      workspace: workspaceRef()
    };

    expect(createService({ failPhase: "mutation_change_set_row_updated" }).deletePage(input).kind).toBe("failed");
    expect(changeSetRow()?.fields.change_set_revision).toBe(1);
    expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("change_set_advancing");

    const retry = expectSucceeded(createService().deletePage(input));
    expect(retry.authority).toEqual({ changeSetId: "change-set-001", changeSetRevision: 1 });
    expect(getRows(removalBatchTable)).toHaveLength(1);
    expect(getRows(removalMemberTable)).toHaveLength(2);
    expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("finalized");
  });

  for (const phase of [
    "mutation_claim_created",
    "mutation_page_persisted",
    "mutation_entry_persisted",
    "mutation_change_set_persisted",
    "mutation_result_persisted",
    "mutation_finalized"
  ] satisfies FailurePhase[]) {
    it(`recovers settings-save interruption at ${phase} without overwriting the page twice`, () => {
      seedWorkspaceFoundation();
      let now = "2026-07-18 00:00:00";
      const failingService = createService({ currentTimestamp: () => now, failPhase: phase });
      const input = {
        authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
        pageSysId: "page-001",
        slug: "settings-recovered",
        title: "Settings recovered",
        workspace: workspaceRef()
      };

      expect(failingService.savePageSettings(input).kind).toBe("failed");
      now = "2026-07-18 00:01:00";

      const service = createService({ currentTimestamp: () => now });
      const retry = expectSucceeded(service.savePageSettings(input));
      expect(retry.authority).toEqual({ changeSetId: "change-set-001", changeSetRevision: 1 });
      expect(pageRow("page-001")?.fields.draft_title).toBe("Settings recovered");
      expect(pageRow("page-001")?.fields.draft_slug).toBe("settings-recovered");
      expect(getRows(changeEntryTable)).toHaveLength(1);
      expect(changeSetRow()?.fields.change_set_revision).toBe(1);
      expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("finalized");
    });
  }

  for (const phase of [
    "mutation_claim_created",
    "mutation_page_persisted",
    "mutation_entry_persisted",
    "mutation_change_set_persisted",
    "mutation_result_persisted",
    "mutation_finalized"
  ] satisfies FailurePhase[]) {
    it(`recovers create interruption at ${phase} without creating a duplicate page`, () => {
      seedWorkspaceFoundation();
      let now = "2026-07-18 00:00:00";
      const failingService = createService({ currentTimestamp: () => now, failPhase: phase });
      const input = {
        authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
        parentPageSysId: null,
        title: "Recovered create",
        workspace: workspaceRef()
      };

      expect(failingService.createPage(input).kind).toBe("failed");
      now = "2026-07-18 00:01:00";

      const service = createService({ currentTimestamp: () => now });
      const retry = expectSucceeded(service.createPage(input));
      expect(retry.authority).toEqual({ changeSetId: "change-set-001", changeSetRevision: 1 });
      expect(retry.result.page.draftTitle).toBe("Recovered create");
      expect(getRows(pageTable).filter((row) => row.fields.draft_title === "Recovered create")).toHaveLength(1);
      expect(getRows(changeEntryTable)).toHaveLength(1);
      expect(changeSetRow()?.fields.change_set_revision).toBe(1);
      expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("finalized");
    });
  }

  for (const phase of [
    "mutation_claim_created",
    "mutation_removal_persisted",
    "mutation_change_set_persisted",
    "mutation_result_persisted",
    "mutation_finalized"
  ] satisfies FailurePhase[]) {
    it(`recovers delete interruption at ${phase} without duplicating removal rows`, () => {
      seedWorkspaceFoundation({
        pages: [
          createSeedPage({ pageId: "page-001", draftTitle: "Root Draft", publishedTitle: "Root" }),
          createSeedPage({
            pageId: "page-002",
            parentPageId: "page-001",
            siblingOrder: "1",
            draftTitle: "Child Draft",
            publishedTitle: "Child"
          }),
          createSeedPage({
            pageId: "page-003",
            parentPageId: null,
            siblingOrder: "2",
            draftTitle: "Sibling Draft",
            publishedTitle: "Sibling"
          })
        ]
      });
      let now = "2026-07-18 00:00:00";
      const failingService = createService({ currentTimestamp: () => now, failPhase: phase });
      const input = {
        authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
        pageSysId: "page-001",
        workspace: workspaceRef()
      };

      expect(failingService.deletePage(input).kind).toBe("failed");
      now = "2026-07-18 00:01:00";

      const service = createService({ currentTimestamp: () => now });
      const retry = expectSucceeded(service.deletePage(input));
      expect(retry.authority).toEqual({ changeSetId: "change-set-001", changeSetRevision: 1 });
      expect(getRows(removalBatchTable)).toHaveLength(1);
      expect(getRows(removalMemberTable)).toHaveLength(2);
      expect(new Set(getRows(removalMemberTable).map((row) => row.fields.batch_page_key))).toHaveLength(2);
      expect(changeSetRow()?.fields.change_set_revision).toBe(1);
      expect(claimRow("change-set-001:0")?.fields.target_removal_batch_key).toBe("change-set-001:0:page-001");
      expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("finalized");
    });
  }

  it("replays one finalized outcome after an uncertain response at mutation_finalized", () => {
    seedWorkspaceFoundation();
    const input = {
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      draftContentJson: createDocument("Uncertain response body"),
      expectedRevision: 0,
      pageSysId: "page-001",
      workspace: workspaceRef()
    };

    const failingService = createService({ failPhase: "mutation_finalized" });
    const first = failingService.savePageBody(input);
    expect(first.kind).toBe("failed");

    const service = createService();
    const retry = expectSucceeded(service.savePageBody(input));
    expect(retry.authority).toEqual({ changeSetId: "change-set-001", changeSetRevision: 1 });
    expect(getRows(changeEntryTable)).toHaveLength(1);
    expect(pageRow("page-001")?.fields.draft_revision).toBe(1);
    expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("finalized");
  });

  it("keeps one pending entry through first change, subsequent change, revert, and later re-change", () => {
    seedWorkspaceFoundation({
      pages: [
        createSeedPage({
          pageId: "page-001",
          draftBodyText: "Snapshot body",
          draftContentJson: createDocument("Snapshot body"),
          draftSlug: "snapshot-title",
          draftTitle: "Snapshot title",
          publishedBodyText: "Snapshot body",
          publishedContentJson: createDocument("Snapshot body"),
          publishedSlug: "snapshot-title",
          publishedTitle: "Snapshot title"
        })
      ]
    });
    let now = "2026-07-18 00:00:00";
    const service = createService({ currentTimestamp: () => now });

    const first = expectSucceeded(service.savePageBody({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      draftContentJson: createDocument("Changed body"),
      expectedRevision: 0,
      pageSysId: "page-001",
      workspace: workspaceRef()
    }));
    expect(pendingRows(service)).toMatchObject([{
      category: "Modified",
      firstPendingSequence: 1,
      pageSysId: "page-001"
    }]);
    expect(getRows(changeEntryTable)[0]?.fields.first_pending_sequence).toBe(1);

    now = "2026-07-18 00:01:00";
    const second = expectSucceeded(service.savePageSettings({
      authority: first.authority,
      pageSysId: "page-001",
      slug: "renamed-page",
      title: "Renamed page",
      workspace: workspaceRef()
    }));
    const secondEntries = pendingRows(service);
    expect(secondEntries).toHaveLength(1);
    expect(secondEntries[0]).toMatchObject({
      category: "Modified",
      firstPendingSequence: 1,
      attribution: expect.objectContaining({ displayName: "Unknown user" }),
      lastChangedOn: "2026-07-18 00:01:00",
      pageSysId: "page-001"
    });
    expect(getRows(changeEntryTable)).toHaveLength(1);
    expect(getRows(changeEntryTable)[0]?.fields.first_pending_sequence).toBe(1);

    now = "2026-07-18 00:02:00";
    const third = expectSucceeded(service.savePageBody({
      authority: second.authority,
      draftContentJson: createDocument("Snapshot body"),
      expectedRevision: 1,
      pageSysId: "page-001",
      workspace: workspaceRef()
    }));
    expect(pendingRows(service)).toHaveLength(1);

    now = "2026-07-18 00:03:00";
    const fourth = expectSucceeded(service.savePageSettings({
      authority: third.authority,
      pageSysId: "page-001",
      slug: "snapshot-title",
      title: "Snapshot title",
      workspace: workspaceRef()
    }));
    expect(pendingRows(service)).toEqual([]);
    expect(getRows(changeEntryTable)).toHaveLength(0);

    now = "2026-07-18 00:04:00";
    expectSucceeded(service.savePageBody({
      authority: fourth.authority,
      draftContentJson: createDocument("Changed again"),
      expectedRevision: 2,
      pageSysId: "page-001",
      workspace: workspaceRef()
    }));
    const finalEntries = pendingRows(service);
    expect(finalEntries).toHaveLength(1);
    expect(finalEntries[0]).toMatchObject({
      firstPendingSequence: 2,
      lastChangedOn: "2026-07-18 00:04:00",
      pageSysId: "page-001"
    });
    expect(getRows(changeEntryTable)).toHaveLength(1);
    expect(getRows(changeEntryTable)[0]?.fields.first_pending_sequence).toBe(2);
  });

  it("builds one pending title projection for 1,000 modified pages", () => {
    const pages = Array.from({ length: 1000 }, (_, index) => createSeedPage({
      pageId: `page-${index}`,
      draftTitle: `Draft ${index}`,
      publishedTitle: `Published ${index}`,
      siblingOrder: String(index)
    }));
    seedWorkspaceFoundation({ pages });
    for (let index = 0; index < pages.length; index++) {
      glideMock.insertRow(changeEntryTable, `entry-${index}`, {
        change_set: "change-set-001", page: pages[index].pageId,
        first_pending_sequence: index + 1, last_changed_on: "2026-07-18 00:00:00", last_changed_by: ""
      });
    }
    const projection = vi.spyOn(changeSetDomain, "projectEdit");
    try {
      const pending = expectSucceeded(createService().pendingChanges(workspaceRef())).pending;
      expect(pending.affectedPageCount).toBe(1000);
      expect(pending.rows.map((row) => row.title)).toEqual(pages.map((page) => page.draftTitle));
      expect(projection).toHaveBeenCalledTimes(1);
    } finally { projection.mockRestore(); }
  });

  it("skips the pending title projection for empty and removed-only responses", () => {
    seedWorkspaceFoundation();
    const service = createService();
    const projection = vi.spyOn(changeSetDomain, "projectEdit");
    try {
      expect(expectSucceeded(service.pendingChanges(workspaceRef())).pending.rows).toEqual([]);
      expect(projection).not.toHaveBeenCalled();
      expectSucceeded(service.deletePage({ authority: { changeSetId: "change-set-001", changeSetRevision: 0 }, pageSysId: "page-001", workspace: workspaceRef() }));
      projection.mockClear();
      expect(expectSucceeded(service.pendingChanges(workspaceRef())).pending.rows).toEqual([
        expect.objectContaining({ category: "Removed", title: "Snapshot title", navigable: false })
      ]);
      expect(projection).not.toHaveBeenCalled();
    } finally { projection.mockRestore(); }
  });

  it("returns ordered mixed pending titles from their authoritative projections", () => {
    const scenario = seedDiscardRecoveryScenario();
    const pending = expectSucceeded(scenario.service.pendingChanges(scenario.workspace)).pending;
    expect(pending.changeSetRevision).toBe(4);
    expect(pending.rows.map((row) => [row.category, row.title, row.firstPendingSequence, row.navigable])).toEqual([
      ["Modified", "Overview Renamed", 1, true],
      ["Added", "New Guide", 2, true],
      ["Modified \u00b7 Moved", "Child", 3, true],
      ["Removed", "Deprecated", 4, false]
    ]);
  });

  it("uses the untitled fallback for a removed page with a missing published title", () => {
    seedWorkspaceFoundation();
    const service = createService();
    expectSucceeded(service.deletePage({ authority: { changeSetId: "change-set-001", changeSetRevision: 0 }, pageSysId: "page-001", workspace: workspaceRef() }));
    const snapshot = getRows(pageSnapshotTable)[0];
    glideMock.updateRow(pageSnapshotTable, snapshot.sysId, { ...snapshot.fields, title: "" });
    expect(expectSucceeded(service.pendingChanges(workspaceRef())).pending.rows[0].title).toBe("Untitled page");
  });

  it("preserves invalid Edit projection failures in pending responses", () => {
    seedWorkspaceFoundation();
    glideMock.insertRow(changeEntryTable, "entry-001", {
      change_set: "change-set-001", page: "page-001", first_pending_sequence: 1,
      last_changed_on: "2026-07-18 00:00:00", last_changed_by: ""
    });
    glideMock.updateRow(pageTable, "page-001", { ...getRows(pageTable)[0].fields, parent_page: "missing-parent" });
    const result = createService().pendingChanges(workspaceRef());
    expect(result).toMatchObject({ kind: "failed", status: 500 });
  });

  it("resolves each pending author once per response and reevaluates user data and access", () => {
    const authors = ["user-1", "user-1", "user-1", "user-2", "user-2", "missing", "missing", "", ""];
    seedWorkspaceFoundation({ pages: authors.map((_, index) => createSeedPage({
      pageId: `attribution-${index}`, draftTitle: `Draft ${index}`, publishedTitle: `Published ${index}`,
      siblingOrder: String(index + 1)
    })) });
    authors.forEach((author, index) => glideMock.insertRow(changeEntryTable, `attribution-entry-${index}`, {
      change_set: "change-set-001", page: `attribution-${index}`,
      generation_page_key: `change-set-001:attribution-${index}`,
      first_pending_sequence: index + 1, first_pending_on: "2026-07-18 00:00:00",
      last_changed_on: "2026-07-18 00:00:00", last_changed_by: author
    }));
    glideMock.insertRow("sys_user", "user-1", { first_name: "Priya", last_name: "Writer", name: "Priya Writer", user_name: "pwriter", email: "priya@example.com" });
    glideMock.insertRow("sys_user", "user-2", { first_name: "Sam", last_name: "Editor", name: "Sam Editor", user_name: "seditor", email: "sam@example.com" });
    const service = createService();
    glideMock.clearGets();
    const first = expectSucceeded(service.pendingChanges(workspaceRef())).pending;
    expect(first.rows).toHaveLength(authors.length);
    expect(glideMock.getCount("sys_user")).toBe(3);
    expect(first.rows.map((row) => row.attribution.displayName)).toEqual([
      "P. Writer", "P. Writer", "P. Writer", "S. Editor", "S. Editor", "Unknown user", "Unknown user", "Unknown user", "Unknown user"
    ]);
    glideMock.updateRow("sys_user", "user-1", { first_name: "New", last_name: "Name", name: "New Name", user_name: "pwriter", email: "priya@example.com" });
    glideMock.setRecordReadable("sys_user", "user-2", false);
    glideMock.clearGets();
    const second = expectSucceeded(service.pendingChanges(workspaceRef())).pending;
    expect(glideMock.getCount("sys_user")).toBe(3);
    expect(second.rows.map((row) => row.attribution.displayName)).toEqual([
      "N. Name", "N. Name", "N. Name", "Unknown user", "Unknown user", "Unknown user", "Unknown user", "Unknown user", "Unknown user"
    ]);
    expect(JSON.stringify(second)).not.toContain("pwriter");
    expect(JSON.stringify(second)).not.toContain("priya@example.com");
    for (const entry of getRows(changeEntryTable)) {
      glideMock.updateRow(changeEntryTable, entry.sysId, { ...entry.fields, last_changed_by: "user-1" });
    }
    glideMock.clearGets();
    expect(expectSucceeded(service.pendingChanges(workspaceRef())).pending.rows).toHaveLength(authors.length);
    expect(glideMock.getCount("sys_user")).toBe(1);
    for (const entry of getRows(changeEntryTable)) {
      glideMock.updateRow(changeEntryTable, entry.sysId, { ...entry.fields, last_changed_by: "" });
    }
    glideMock.clearGets();
    expect(expectSucceeded(service.pendingChanges(workspaceRef())).pending.rows).toHaveLength(authors.length);
    expect(glideMock.getCount("sys_user")).toBe(0);
  });

  it("returns authoritative pending titles, counts, generation pair, and privacy-safe attribution", () => {
    seedWorkspaceFoundation({
      pages: [
        createSeedPage({
          pageId: "page-001",
          draftTitle: "Draft Overview",
          publishedTitle: "Published Overview"
        })
      ]
    });
    glideMock.insertRow("sys_user", "user-1", {
      first_name: "Priya",
      last_name: "Writer",
      name: "Priya Writer",
      user_name: "priya.writer@example.com",
      email: "priya.writer@example.com"
    });
    const service = createService();

    expectSucceeded(service.savePageSettings({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-001",
      slug: "draft-overview",
      title: "Draft Overview",
      workspace: workspaceRef()
    }));
    const beforeRead = {
      changeSet: JSON.stringify(getRows(changeSetTable)),
      claims: JSON.stringify(getRows(mutationClaimTable)),
      entries: JSON.stringify(getRows(changeEntryTable)),
      pages: JSON.stringify(getRows(pageTable)),
      removalBatches: JSON.stringify(getRows(removalBatchTable)),
      removalMembers: JSON.stringify(getRows(removalMemberTable)),
      snapshotPages: JSON.stringify(getRows(pageSnapshotTable)),
      snapshotSets: JSON.stringify(getRows(snapshotSetTable)),
      workspace: JSON.stringify(getRows(workspaceTable))
    };

    const result = service.pendingChanges(workspaceRef());
    const repeatedResult = service.pendingChanges(workspaceRef());

    expect(result.kind).toBe("succeeded");
    expect(repeatedResult.kind).toBe("succeeded");
    if (result.kind !== "succeeded") {
      throw new Error("expected pending changes");
    }
    expect({
      changeSet: JSON.stringify(getRows(changeSetTable)),
      claims: JSON.stringify(getRows(mutationClaimTable)),
      entries: JSON.stringify(getRows(changeEntryTable)),
      pages: JSON.stringify(getRows(pageTable)),
      removalBatches: JSON.stringify(getRows(removalBatchTable)),
      removalMembers: JSON.stringify(getRows(removalMemberTable)),
      snapshotPages: JSON.stringify(getRows(pageSnapshotTable)),
      snapshotSets: JSON.stringify(getRows(snapshotSetTable)),
      workspace: JSON.stringify(getRows(workspaceTable))
    }).toEqual(beforeRead);
    expect(result.pending).toMatchObject({
      affectedPageCount: 1,
      changeSetId: "change-set-001",
      changeSetRevision: 1,
      workspaceSysId: "workspace-001"
    });
    expect(result.pending.rows).toEqual([
      expect.objectContaining({
        attribution: {
          accessibleLabel: "Last changed by Priya Writer",
          displayName: "P. Writer",
          fullDisplayName: "Priya Writer"
        },
        category: "Modified",
        navigable: true,
        pageSysId: "page-001",
        title: "Draft Overview"
      })
    ]);
    expect(JSON.stringify(result.pending)).not.toContain("priya.writer@example.com");

    glideMock.updateRow("sys_user", "user-1", {
      first_name: "",
      last_name: "",
      name: "",
      user_name: "pwriter",
      email: "priya.writer@example.com"
    });
    const unknownResult = service.pendingChanges(workspaceRef());
    expect(unknownResult.kind).toBe("succeeded");
    if (unknownResult.kind !== "succeeded") {
      throw new Error("expected pending changes");
    }
    expect(unknownResult.pending.rows[0]?.attribution).toEqual({
      accessibleLabel: "Last changed by Unknown user",
      displayName: "Unknown user",
      fullDisplayName: "Unknown user"
    });
    expect(JSON.stringify(unknownResult.pending)).not.toContain("pwriter");
    expect(JSON.stringify(unknownResult.pending)).not.toContain("priya.writer@example.com");
  });

  it("publishes a mixed pending set as one workspace transition and replaces the active change set", () => {
    seedWorkspaceFoundation({
      pages: [
        createSeedPage({
          pageId: "page-001",
          draftBodyText: "Overview body",
          draftContentJson: createDocument("Overview body"),
          draftSlug: "overview",
          draftTitle: "Overview",
          publishedBodyText: "Overview body",
          publishedContentJson: createDocument("Overview body"),
          publishedSlug: "overview",
          publishedTitle: "Overview",
          siblingOrder: "1"
        }),
        createSeedPage({
          pageId: "page-002",
          draftBodyText: "Child body",
          draftContentJson: createDocument("Child body"),
          draftSlug: "child",
          draftTitle: "Child",
          parentPageId: "page-001",
          publishedBodyText: "Child body",
          publishedContentJson: createDocument("Child body"),
          publishedSlug: "child",
          publishedTitle: "Child",
          siblingOrder: "1"
        }),
        createSeedPage({
          pageId: "page-003",
          draftBodyText: "Deprecated body",
          draftContentJson: createDocument("Deprecated body"),
          draftSlug: "deprecated",
          draftTitle: "Deprecated",
          publishedBodyText: "Deprecated body",
          publishedContentJson: createDocument("Deprecated body"),
          publishedSlug: "deprecated",
          publishedTitle: "Deprecated",
          siblingOrder: "2"
        })
      ]
    });
    const service = createService();
    const beforeLive = expectSucceeded(service.listPages(workspaceRef(), "live"));
    expect(beforeLive.pages.map((page) => page.draftTitle)).toEqual(["Overview", "Child", "Deprecated"]);

    let authority = expectSucceeded(service.savePageSettings({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-001",
      slug: "overview-renamed",
      title: "Overview Renamed",
      workspace: workspaceRef()
    })).authority;
    const created = expectSucceeded(service.createPage({
      authority,
      parentPageSysId: "page-001",
      title: "New Guide",
      workspace: workspaceRef()
    }));
    authority = created.authority;
    const addedPageId = created.result.page.sysId;
    authority = expectSucceeded(service.movePage({
      authority,
      pageSysId: "page-002",
      parentPageSysId: null,
      siblingOrder: "9",
      workspace: workspaceRef()
    })).authority;
    authority = expectSucceeded(service.deletePage({
      authority,
      pageSysId: "page-003",
      workspace: workspaceRef()
    })).authority;

    const editBeforePublish = expectSucceeded(service.listPages(workspaceRef(), "edit"));
    const pendingBeforePublish = expectSucceeded(service.pendingChanges(workspaceRef()));
    expect(pendingBeforePublish.pending.rows.map((row) => row.category).sort()).toEqual(["Added", "Modified", "Modified · Moved", "Removed"]);
    expect(expectSucceeded(service.listPages(workspaceRef(), "live")).pages.map((page) => page.draftTitle)).toEqual(["Overview", "Child", "Deprecated"]);

    const published = expectSucceeded(service.publishWorkspace({
      authority,
      commandId: "publish-mixed-001",
      workspace: workspaceRef()
    }));

    expect(published.authority).toEqual({
      changeSetId: expect.any(String),
      changeSetRevision: 0
    });
    expect(published.authority.changeSetId).not.toBe("change-set-001");
    expect(published.result.pendingChanges).toMatchObject({
      affectedPageCount: 0,
      changeSetId: published.authority.changeSetId,
      changeSetRevision: 0,
      rows: [],
      workspaceSysId: "workspace-001"
    });
    expectActiveSelectors(published.authority.changeSetId, published.result.publishedSnapshotSetId);
    expect(getRows(workspaceTable)[0]?.fields.workspace_state_revision).toBe(1);
    expect(changeSetRow("change-set-001")?.fields.lifecycle_state).toBe("superseded");
    expect(pendingRows(createService(), currentWorkspaceRef())).toEqual([]);

    const liveAfterPublish = expectSucceeded(service.listPages(currentWorkspaceRef(), "live"));
    expect(liveAfterPublish.pages.map((page) => ({
      parentPageSysId: page.parentPageSysId,
      slug: page.draftSlug,
      sysId: page.sysId,
      title: page.draftTitle
    }))).toEqual(editBeforePublish.pages.map((page) => ({
      parentPageSysId: page.parentPageSysId,
      slug: page.draftSlug,
      sysId: page.sysId,
      title: page.draftTitle
    })));
    expect(liveAfterPublish.pages.map((page) => page.sysId).sort()).toEqual([addedPageId, "page-001", "page-002"].sort());
    expect(pageRow(addedPageId)?.fields.publication_state).toBe("published");
    expect(pageRow("page-001")?.fields.published_title).toBe("Overview Renamed");
    expect(pageRow("page-002")?.fields.parent_page).toBe("");
    expect(pageRow("page-003")?.fields.publication_state).toBe("draft");
    expect(pageRow("page-003")?.fields.active).toBe(false);
  });

  it("preserves Live selectors and pending changes when publish fails before the selector switch", () => {
    seedWorkspaceFoundation({
      pages: [
        createSeedPage({
          pageId: "page-001",
          draftTitle: "Overview",
          publishedTitle: "Overview"
        })
      ]
    });
    const authority = expectSucceeded(createService().savePageSettings({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-001",
      slug: "overview-renamed",
      title: "Overview Renamed",
      workspace: workspaceRef()
    })).authority;
    const beforeWorkspace = JSON.stringify(getRows(workspaceTable));
    const beforePending = pendingRows(createService());

    const failed = createService({ failPhase: "publish_snapshot_page_inserted" }).publishWorkspace({
      authority,
      commandId: "publish-fails-before-switch",
      workspace: workspaceRef()
    });

    expect(failed.kind).toBe("failed");
    expect(JSON.stringify(getRows(workspaceTable))).toBe(beforeWorkspace);
    expect(pendingRows(createService())).toEqual(beforePending);
    expect(expectSucceeded(createService().listPages(workspaceRef(), "live")).pages[0]?.draftTitle).toBe("Overview");

    const recovered = expectSucceeded(createService({ currentTimestamp: () => "2026-07-18 00:01:00" }).publishWorkspace({
      authority,
      commandId: "publish-fails-before-switch",
      workspace: workspaceRef()
    }));
    expect(recovered.result.pendingChanges.affectedPageCount).toBe(0);
    expect(expectSucceeded(createService().listPages(currentWorkspaceRef(), "live")).pages[0]?.draftTitle).toBe("Overview Renamed");
  });

  it("allows only one competing publish request to win a pending generation", () => {
    seedWorkspaceFoundation({
      pages: [
        createSeedPage({
          pageId: "page-001",
          draftTitle: "Overview",
          publishedTitle: "Overview"
        })
      ]
    });
    const authority = expectSucceeded(createService().savePageSettings({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-001",
      slug: "overview-renamed",
      title: "Overview Renamed",
      workspace: workspaceRef()
    })).authority;

    const winner = expectSucceeded(createService().publishWorkspace({
      authority,
      commandId: "publish-winner",
      workspace: workspaceRef()
    }));
    const repeatedWinner = expectSucceeded(createService().publishWorkspace({
      authority,
      commandId: "publish-winner",
      workspace: currentWorkspaceRef()
    }));
    const loser = createService().publishWorkspace({
      authority,
      commandId: "publish-loser",
      workspace: currentWorkspaceRef()
    });

    expect(repeatedWinner.authority).toEqual(winner.authority);
    expect(loser.kind).toBe("failed");
    if (loser.kind !== "failed") {
      throw new Error("expected stale loser");
    }
    expect(loser.code).toBe("stale_generation");
    expect(loser.currentChangeSetId).toBe(winner.authority.changeSetId);
    expect(loser.currentChangeSetRevision).toBe(0);
    expect(getRows(snapshotSetTable).filter((row) => row.fields.command_kind === "publish")).toHaveLength(1);
  });

  it("atomically discards a mixed pending set back to the current published workspace state", () => {
    seedWorkspaceFoundation({
      pages: [
        createSeedPage({
          pageId: "page-001",
          draftBodyText: "Overview draft body",
          draftTitle: "Overview",
          publishedBodyText: "Overview published body",
          publishedSlug: "overview",
          publishedTitle: "Overview",
          siblingOrder: "1"
        }),
        createSeedPage({
          pageId: "page-002",
          draftBodyText: "Child draft body",
          draftTitle: "Child",
          parentPageId: "page-001",
          publishedBodyText: "Child published body",
          publishedSlug: "child",
          publishedTitle: "Child",
          siblingOrder: "1"
        }),
        createSeedPage({
          pageId: "page-003",
          draftBodyText: "Deprecated body",
          draftTitle: "Deprecated",
          publishedBodyText: "Deprecated body",
          publishedSlug: "deprecated",
          publishedTitle: "Deprecated",
          siblingOrder: "2"
        })
      ]
    });
    const service = createService();
    const liveBeforeDiscard = expectSucceeded(service.listPages(workspaceRef(), "live"));
    let authority = expectSucceeded(service.savePageSettings({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-001",
      slug: "overview-renamed",
      title: "Overview Renamed",
      workspace: workspaceRef()
    })).authority;
    const created = expectSucceeded(service.createPage({
      authority,
      parentPageSysId: "page-001",
      title: "New Guide",
      workspace: workspaceRef()
    }));
    authority = created.authority;
    const addedPageId = created.result.page.sysId;
    authority = expectSucceeded(service.movePage({
      authority,
      pageSysId: "page-002",
      parentPageSysId: null,
      siblingOrder: "9",
      workspace: workspaceRef()
    })).authority;
    authority = expectSucceeded(service.deletePage({
      authority,
      pageSysId: "page-003",
      workspace: workspaceRef()
    })).authority;

    const discarded = expectSucceeded(service.discardAllWorkspace({
      authority,
      commandId: "discard-mixed-001",
      workspace: workspaceRef()
    }));

    expect(discarded.result.pendingChanges).toMatchObject({
      affectedPageCount: 0,
      changeSetId: discarded.authority.changeSetId,
      changeSetRevision: 0,
      rows: [],
      workspaceSysId: "workspace-001"
    });
    expect(discarded.result.pages.map((page) => ({
      parentPageSysId: page.parentPageSysId,
      slug: page.draftSlug,
      sysId: page.sysId,
      title: page.draftTitle
    }))).toEqual(liveBeforeDiscard.pages.map((page) => ({
      parentPageSysId: page.parentPageSysId,
      slug: page.draftSlug,
      sysId: page.sysId,
      title: page.draftTitle
    })));
    expect(expectSucceeded(createService().pendingChanges(currentWorkspaceRef())).pending.rows).toEqual([]);
    expect(expectSucceeded(createService().listPages(currentWorkspaceRef(), "live")).pages.map((page) => page.draftTitle)).toEqual(
      liveBeforeDiscard.pages.map((page) => page.draftTitle)
    );
    expect(expectSucceeded(createService().listPages(currentWorkspaceRef(), "edit")).pages.map((page) => page.draftTitle)).toEqual(
      liveBeforeDiscard.pages.map((page) => page.draftTitle)
    );
    expect(pageRow(addedPageId)).toBeUndefined();
    expect(pageRow("page-001")?.fields.draft_title).toBe("Overview");
    expect(pageRow("page-002")?.fields.parent_page).toBe("page-001");
    expect(pageRow("page-003")?.fields.active).toBe(true);
    expect(changeSetRow("change-set-001")?.fields.lifecycle_state).toBe("superseded");
    expect(getRows(changeEntryTable).filter((row) => row.fields.change_set === "change-set-001")).toEqual([]);
    expect(getRows(removalBatchTable).filter((row) => row.fields.change_set === "change-set-001")).toEqual([]);
    expect(getRows(removalMemberTable)).toEqual([]);
  });

  it("preserves canonical image references through draft, publish, discard, and page deletion without copying workspace media", () => {
    const publishedImageEnvelope = createImageDocumentEnvelope({
      align: "center",
      alt: "Published architecture diagram",
      caption: "Published reader state",
      darkMediaId: "workspace-media-published-dark",
      frame: false,
      mediaId: "workspace-media-published-light",
      widthPct: 80
    });
    const draftImageEnvelope = createImageDocumentEnvelope({
      align: "right",
      alt: "Draft architecture diagram",
      caption: "Draft reader state",
      darkMediaId: "workspace-media-draft-dark",
      mediaId: "workspace-media-draft-light",
      widthPct: 60
    });

    seedWorkspaceFoundation({
      pages: [
        createSeedPage({
          draftBodyText: "",
          draftContentJson: publishedImageEnvelope,
          draftSlug: "overview",
          draftTitle: "Overview",
          pageId: "page-001",
          publishedBodyText: "",
          publishedContentJson: publishedImageEnvelope,
          publishedSlug: "overview",
          publishedTitle: "Overview"
        }),
        createSeedPage({
          draftBodyText: "Sibling body",
          draftContentJson: createDocument("Sibling body"),
          draftSlug: "sibling",
          draftTitle: "Sibling",
          pageId: "page-002",
          publishedBodyText: "Sibling body",
          publishedContentJson: createDocument("Sibling body"),
          publishedSlug: "sibling",
          publishedTitle: "Sibling",
          siblingOrder: "2"
        })
      ]
    });
    for (const mediaId of [
      "workspace-media-published-dark",
      "workspace-media-published-light",
      "workspace-media-draft-dark",
      "workspace-media-draft-light"
    ]) {
      glideMock.insertRow("sys_attachment", mediaId, {
        content_type: "image/png",
        file_name: `${mediaId}.png`,
        size_bytes: 1024,
        table_name: workspaceTable,
        table_sys_id: "workspace-001"
      });
    }

    const service = createService();
    const initialAttachmentIds = getRows("sys_attachment").map((row) => row.sysId);
    const initialEdit = expectSucceeded(service.listPages(workspaceRef(), "edit"));
    const initialLive = expectSucceeded(service.listPages(workspaceRef(), "live"));

    expect(imageNodeAttrs(initialEdit.pages.find((page) => page.sysId === "page-001")?.draftContentJson)).toEqual(
      imageNodeAttrs(publishedImageEnvelope)
    );
    expect(imageNodeAttrs(initialLive.pages.find((page) => page.sysId === "page-001")?.draftContentJson)).toEqual(
      imageNodeAttrs(publishedImageEnvelope)
    );
    expect(getRows("sys_attachment").map((row) => row.sysId)).toEqual(initialAttachmentIds);

    const saved = expectSucceeded(service.savePageBody({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      draftContentJson: draftImageEnvelope,
      expectedRevision: 0,
      pageSysId: "page-001",
      workspace: workspaceRef()
    }));

    expect(JSON.parse(String(pageRow("page-001")?.fields.draft_content_json ?? ""))).toEqual(draftImageEnvelope);
    expect(JSON.parse(String(pageRow("page-001")?.fields.published_content_json ?? ""))).toEqual(publishedImageEnvelope);
    expect(getRows("sys_attachment").map((row) => row.sysId)).toEqual(initialAttachmentIds);

    const editAfterSave = expectSucceeded(service.listPages(workspaceRef(), "edit"));
    const liveAfterSave = expectSucceeded(service.listPages(workspaceRef(), "live"));
    expect(imageNodeAttrs(editAfterSave.pages.find((page) => page.sysId === "page-001")?.draftContentJson)).toEqual(
      imageNodeAttrs(draftImageEnvelope)
    );
    expect(imageNodeAttrs(liveAfterSave.pages.find((page) => page.sysId === "page-001")?.draftContentJson)).toEqual(
      imageNodeAttrs(publishedImageEnvelope)
    );

    const published = expectSucceeded(service.publishWorkspace({
      authority: saved.authority,
      commandId: "publish-image-001",
      workspace: workspaceRef()
    }));

    expect(getRows("sys_attachment").map((row) => row.sysId)).toEqual(initialAttachmentIds);
    expect(JSON.parse(String(pageRow("page-001")?.fields.published_content_json ?? ""))).toEqual(draftImageEnvelope);

    const liveAfterPublish = expectSucceeded(service.listPages(currentWorkspaceRef(), "live"));
    expect(imageNodeAttrs(liveAfterPublish.pages.find((page) => page.sysId === "page-001")?.draftContentJson)).toEqual(
      imageNodeAttrs(draftImageEnvelope)
    );

    const currentDraftRevision = Number(pageRow("page-001")?.fields.draft_revision ?? 0);
    const removed = expectSucceeded(service.savePageBody({
      authority: published.authority,
      draftContentJson: createDocument("Image removed"),
      expectedRevision: currentDraftRevision,
      pageSysId: "page-001",
      workspace: currentWorkspaceRef()
    }));

    const discarded = service.discardPage({
      authority: removed.authority,
      pageSysId: "page-001",
      workspace: currentWorkspaceRef()
    });

    if (discarded.kind !== "succeeded") {
      throw new Error(`expected discard page success: ${discarded.errorMessage}`);
    }

    expect(imageNodeAttrs(discarded.result.pages.find((page) => page.sysId === "page-001")?.draftContentJson)).toEqual(
      imageNodeAttrs(draftImageEnvelope)
    );
    expect(getRows("sys_attachment").map((row) => row.sysId)).toEqual(initialAttachmentIds);

    const deleted = expectSucceeded(service.deletePage({
      authority: discarded.authority,
      pageSysId: "page-001",
      workspace: currentWorkspaceRef()
    }));

    expect(deleted.result.deletedPageSysId).toBe("page-001");
    expect(pendingRows(service, currentWorkspaceRef())).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: "Removed",
        pageSysId: "page-001"
      })
    ]));
    expect(getRows("sys_attachment").map((row) => row.sysId)).toEqual(initialAttachmentIds);
  });

  it("rejects discard-all when there are no pending workspace changes", () => {
    seedWorkspaceFoundation();
    const result = createService().discardAllWorkspace({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      commandId: "discard-empty-001",
      workspace: workspaceRef()
    });

    expect(result).toMatchObject({
      kind: "failed",
      code: "invalid",
      errorMessage: "There are no pending changes to discard.",
      status: 400
    });
  });

  it("replays the same completed discard-all command without a second selector switch", () => {
    seedWorkspaceFoundation({
      pages: [
        createSeedPage({
          pageId: "page-001",
          draftTitle: "Overview",
          publishedTitle: "Overview"
        })
      ]
    });
    const authority = expectSucceeded(createService().savePageSettings({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-001",
      slug: "overview-renamed",
      title: "Overview Renamed",
      workspace: workspaceRef()
    })).authority;

    const winner = expectSucceeded(createService().discardAllWorkspace({
      authority,
      commandId: "discard-replay-001",
      workspace: workspaceRef()
    }));
    const replayed = expectSucceeded(createService().discardAllWorkspace({
      authority,
      commandId: "discard-replay-001",
      workspace: currentWorkspaceRef()
    }));

    expect(replayed.authority).toEqual(winner.authority);
    expect(replayed.result).toEqual(winner.result);
  });

  it("leaves the original pending set authoritative when selector switching fails before the discard commit boundary", () => {
    const scenario = seedDiscardRecoveryScenario();
    const pendingBefore = expectSucceeded(scenario.service.pendingChanges(scenario.workspace)).pending;
    const editBefore = expectSucceeded(scenario.service.listPages(scenario.workspace, "edit")).pages.map((page) => ({
      draftSlug: page.draftSlug,
      draftTitle: page.draftTitle,
      parentPageSysId: page.parentPageSysId,
      sysId: page.sysId
    }));
    let failed = false;
    glideMock.setUpdateHook(workspaceTable, () => {
      if (failed) {
        return true;
      }
      failed = true;
      return false;
    });

    const result = scenario.service.discardAllWorkspace({
      authority: scenario.authority,
      commandId: "discard-precommit-001",
      workspace: scenario.workspace
    });

    glideMock.setUpdateHook(workspaceTable, null);
    expect(result.kind).toBe("failed");
    expect(currentWorkspaceRef().pendingChangeSetSysId).toBe("change-set-001");
    expect(expectSucceeded(createService().pendingChanges(currentWorkspaceRef())).pending).toEqual(pendingBefore);
    expect(expectSucceeded(createService().listPages(currentWorkspaceRef(), "edit")).pages.map((page) => ({
      draftSlug: page.draftSlug,
      draftTitle: page.draftTitle,
      parentPageSysId: page.parentPageSysId,
      sysId: page.sysId
    }))).toEqual(editBefore);
  });

  it("blocks later mutations during discard recovery after added-page cleanup fails and resumes only on the same discard command", () => {
    const scenario = seedDiscardRecoveryScenario();
    let failed = false;
    glideMock.setDeleteHook(pageTable, (row) => {
      if (row.sysId !== scenario.addedPageId || failed) {
        return true;
      }
      failed = true;
      return false;
    });

    const first = scenario.service.discardAllWorkspace({
      authority: scenario.authority,
      commandId: "discard-recovery-001",
      workspace: scenario.workspace
    });

    expect(first).toMatchObject({
      kind: "failed",
      code: "recovery_required",
      recoveryCommandId: "discard-recovery-001",
      status: 409
    });
    const recoveryWorkspace = currentWorkspaceRef();
    const recoveryAuthority = activeWorkspaceAuthority(recoveryWorkspace);
    expect(changeSetRow(recoveryAuthority.changeSetId)?.fields.recovery_state).toBe("switched");

    expect(createService().pendingChanges(recoveryWorkspace)).toMatchObject({
      kind: "failed",
      code: "recovery_required",
      recoveryCommandId: "discard-recovery-001",
      status: 409
    });

    const blockedResults = [
      createService().savePageBody({
        authority: recoveryAuthority,
        draftContentJson: createDocumentEnvelope("Blocked body"),
        expectedRevision: 0,
        pageSysId: "page-001",
        workspace: recoveryWorkspace
      }),
      createService().savePageSettings({
        authority: recoveryAuthority,
        pageSysId: "page-001",
        slug: "blocked-settings",
        title: "Blocked Settings",
        workspace: recoveryWorkspace
      }),
      createService().createPage({
        authority: recoveryAuthority,
        parentPageSysId: null,
        title: "Blocked Create",
        workspace: recoveryWorkspace
      }),
      createService().deletePage({
        authority: recoveryAuthority,
        pageSysId: "page-001",
        workspace: recoveryWorkspace
      }),
      createService().movePage({
        authority: recoveryAuthority,
        pageSysId: "page-001",
        parentPageSysId: null,
        siblingOrder: "3",
        workspace: recoveryWorkspace
      }),
      createService().publishWorkspace({
        authority: recoveryAuthority,
        commandId: "publish-blocked-001",
        workspace: recoveryWorkspace
      }),
      createService().discardAllWorkspace({
        authority: recoveryAuthority,
        commandId: "discard-competing-001",
        workspace: recoveryWorkspace
      })
    ];

    for (const blocked of blockedResults) {
      expect(blocked).toMatchObject({
        kind: "failed",
        code: "recovery_required",
        recoveryCommandId: "discard-recovery-001",
        status: 409
      });
    }

    glideMock.setDeleteHook(pageTable, null);
    const recovered = expectSucceeded(createService().discardAllWorkspace({
      authority: recoveryAuthority,
      commandId: "discard-recovery-001",
      workspace: recoveryWorkspace
    }));

    expect(recovered.result.pendingChanges.rows).toEqual([]);
    expect(changeSetRow(recovered.authority.changeSetId)?.fields.recovery_state).toBe("none");
    expect(pageRow(scenario.addedPageId)).toBeUndefined();
  });

  it("retries source supersession after selector-switch interruption and preserves one selected active successor", () => {
    const scenario = seedDiscardRecoveryScenario();
    const first = createService({ failPhase: "discard_selector_switched" }).discardAllWorkspace({
      authority: scenario.authority,
      commandId: "discard-selector-interrupted-001",
      workspace: scenario.workspace
    });

    expect(first).toMatchObject({
      kind: "failed",
      code: "recovery_required",
      affectedPageCount: 4,
      recoveryCommandId: "discard-selector-interrupted-001",
      status: 409
    });
    const recoveryWorkspace = currentWorkspaceRef();
    const recoveryAuthority = activeWorkspaceAuthority(recoveryWorkspace);
    expect(changeSetRow("change-set-001")?.fields.lifecycle_state).toBe("active");
    expect(changeSetRow(recoveryAuthority.changeSetId)?.fields.recovery_state).toBe("switched");

    const recovered = expectSucceeded(createService().discardAllWorkspace({
      authority: recoveryAuthority,
      commandId: "discard-selector-interrupted-001",
      workspace: recoveryWorkspace
    }));

    expect(changeSetRow("change-set-001")?.fields.lifecycle_state).toBe("superseded");
    expect(changeSetRow("change-set-001")?.fields.command_correlation_id).toBe("discard-selector-interrupted-001");
    expect(changeSetRow("change-set-001")?.fields.finalized_on).toBe("2026-07-18 00:00:00");
    expect(getRows(changeSetTable).filter((row) => row.fields.lifecycle_state === "active").map((row) => row.sysId)).toEqual([recovered.authority.changeSetId]);
    expect(currentWorkspaceRef().pendingChangeSetSysId).toBe(recovered.authority.changeSetId);
  });

  it("retries source supersession after the source change-set update fails", () => {
    const scenario = seedDiscardRecoveryScenario();
    let failed = false;
    glideMock.setUpdateHook(changeSetTable, (row) => {
      if (!failed && row.sysId === "change-set-001" && row.fields.command_correlation_id === "discard-source-failure-001") {
        failed = true;
        return false;
      }
      return true;
    });

    const first = scenario.service.discardAllWorkspace({
      authority: scenario.authority,
      commandId: "discard-source-failure-001",
      workspace: scenario.workspace
    });

    expect(first).toMatchObject({
      kind: "failed",
      code: "recovery_required",
      affectedPageCount: 4,
      recoveryCommandId: "discard-source-failure-001",
      status: 409
    });
    expect(changeSetRow("change-set-001")?.fields.lifecycle_state).toBe("active");

    glideMock.setUpdateHook(changeSetTable, null);
    const recovered = expectSucceeded(createService().discardAllWorkspace({
      authority: activeWorkspaceAuthority(),
      commandId: "discard-source-failure-001",
      workspace: currentWorkspaceRef()
    }));

    expect(changeSetRow("change-set-001")?.fields.lifecycle_state).toBe("superseded");
    expect(changeSetRow("change-set-001")?.fields.command_correlation_id).toBe("discard-source-failure-001");
    expect(changeSetRow("change-set-001")?.fields.finalized_on).toBe("2026-07-18 00:00:00");
    expect(getRows(changeSetTable).filter((row) => row.fields.lifecycle_state === "active").map((row) => row.sysId)).toEqual([recovered.authority.changeSetId]);
  });

  it("keeps the successor recovery-blocked when replay-safe result persistence fails and reports the original affected count", () => {
    const scenario = seedDiscardRecoveryScenario();
    failNextClaimUpdateToPhase("result_persisted");

    const first = scenario.service.discardAllWorkspace({
      authority: scenario.authority,
      commandId: "discard-result-persist-failure-001",
      workspace: scenario.workspace
    });

    expect(first).toMatchObject({
      kind: "failed",
      code: "recovery_required",
      affectedPageCount: 4,
      recoveryCommandId: "discard-result-persist-failure-001",
      status: 409
    });
    const recoveryWorkspace = currentWorkspaceRef();
    const recoveryAuthority = activeWorkspaceAuthority(recoveryWorkspace);
    expect(changeSetRow(recoveryAuthority.changeSetId)?.fields.recovery_state).toBe("switched");
    expect(claimRow("change-set-001:4")?.fields.execution_phase).toBe("change_set_persisted");
    expect(createService().pendingChanges(recoveryWorkspace)).toMatchObject({
      kind: "failed",
      code: "recovery_required",
      affectedPageCount: 4,
      recoveryCommandId: "discard-result-persist-failure-001",
      status: 409
    });

    glideMock.setUpdateHook(mutationClaimTable, null);
    const recovered = expectSucceeded(createService().discardAllWorkspace({
      authority: recoveryAuthority,
      commandId: "discard-result-persist-failure-001",
      workspace: recoveryWorkspace
    }));
    expect(recovered.result.pendingChanges.rows).toEqual([]);
    expect(changeSetRow(recovered.authority.changeSetId)?.fields.recovery_state).toBe("none");
  });

  it("retries recovery-marker clearing from the replay-safe phase without rerunning destructive reconciliation", () => {
    const scenario = seedDiscardRecoveryScenario();
    let markerFailure = false;
    glideMock.setUpdateHook(changeSetTable, (row) => {
      if (
        !markerFailure &&
        String(row.fields.recovery_state) === "none" &&
        String(row.fields.lifecycle_state) === "active" &&
        String(row.fields.command_correlation_id) === "discard-marker-failure-001"
      ) {
        markerFailure = true;
        return false;
      }
      return true;
    });

    const first = scenario.service.discardAllWorkspace({
      authority: scenario.authority,
      commandId: "discard-marker-failure-001",
      workspace: scenario.workspace
    });

    expect(first).toMatchObject({
      kind: "failed",
      code: "recovery_required",
      affectedPageCount: 4,
      recoveryCommandId: "discard-marker-failure-001",
      status: 409
    });
    const recoveryWorkspace = currentWorkspaceRef();
    const recoveryAuthority = activeWorkspaceAuthority(recoveryWorkspace);
    expect(claimRow("change-set-001:4")?.fields.execution_phase).toBe("result_persisted");
    expect(changeSetRow(recoveryAuthority.changeSetId)?.fields.recovery_state).toBe("switched");

    let retryPageDeletes = 0;
    let retryPageUpdates = 0;
    glideMock.setDeleteHook(pageTable, () => {
      retryPageDeletes += 1;
      return true;
    });
    glideMock.setUpdateHook(pageTable, () => {
      retryPageUpdates += 1;
      return true;
    });
    glideMock.setUpdateHook(changeSetTable, null);
    const recovered = expectSucceeded(createService().discardAllWorkspace({
      authority: recoveryAuthority,
      commandId: "discard-marker-failure-001",
      workspace: recoveryWorkspace
    }));

    expect(retryPageDeletes).toBe(0);
    expect(retryPageUpdates).toBe(0);
    expect(changeSetRow(recovered.authority.changeSetId)?.fields.recovery_state).toBe("none");

    const beforeReplayPages = JSON.stringify(getRows(pageTable));
    const replayed = expectSucceeded(createService().discardAllWorkspace({
      authority: scenario.authority,
      commandId: "discard-marker-failure-001",
      workspace: currentWorkspaceRef()
    }));
    expect(replayed.result).toEqual(recovered.result);
    expect(retryPageDeletes).toBe(0);
    expect(retryPageUpdates).toBe(0);
    expect(JSON.stringify(getRows(pageTable))).toBe(beforeReplayPages);
  });

  it("does not let a completed discard replay overwrite later authoring or rerun restoration/deletion", () => {
    const scenario = seedDiscardRecoveryScenario();
    let pageDeletes = 0;
    let pageUpdates = 0;
    glideMock.setDeleteHook(pageTable, () => {
      pageDeletes += 1;
      return true;
    });
    glideMock.setUpdateHook(pageTable, () => {
      pageUpdates += 1;
      return true;
    });

    const discarded = expectSucceeded(scenario.service.discardAllWorkspace({
      authority: scenario.authority,
      commandId: "discard-completed-replay-001",
      workspace: scenario.workspace
    }));
    const completedDeletes = pageDeletes;
    const completedUpdates = pageUpdates;

    let laterAuthority = expectSucceeded(createService().savePageBody({
      authority: discarded.authority,
      draftContentJson: createDocumentEnvelope("Later body"),
      expectedRevision: 0,
      pageSysId: "page-001",
      workspace: currentWorkspaceRef()
    })).authority;
    laterAuthority = expectSucceeded(createService().savePageSettings({
      authority: laterAuthority,
      pageSysId: "page-001",
      slug: "later-overview",
      title: "Later Overview",
      workspace: currentWorkspaceRef()
    })).authority;
    laterAuthority = expectSucceeded(createService().movePage({
      authority: laterAuthority,
      pageSysId: "page-002",
      parentPageSysId: null,
      siblingOrder: "9",
      workspace: currentWorkspaceRef()
    })).authority;
    const laterCreated = expectSucceeded(createService().createPage({
      authority: laterAuthority,
      parentPageSysId: null,
      title: "Later Added Page",
      workspace: currentWorkspaceRef()
    }));
    const beforeReplayDeletes = pageDeletes;
    const beforeReplayUpdates = pageUpdates;
    const beforeReplayPages = JSON.stringify(getRows(pageTable));
    const beforeReplayEntries = JSON.stringify(getRows(changeEntryTable));

    const replayed = expectSucceeded(createService().discardAllWorkspace({
      authority: scenario.authority,
      commandId: "discard-completed-replay-001",
      workspace: currentWorkspaceRef()
    }));

    expect(replayed.result).toEqual(discarded.result);
    expect(pageDeletes).toBe(beforeReplayDeletes);
    expect(pageUpdates).toBe(beforeReplayUpdates);
    expect(JSON.stringify(getRows(pageTable))).toBe(beforeReplayPages);
    expect(JSON.stringify(getRows(changeEntryTable))).toBe(beforeReplayEntries);
    expect(pageRow("page-001")?.fields.draft_title).toBe("Later Overview");
    expect(pageRow("page-001")?.fields.draft_body_text).toBe("Later body");
    expect(pageRow("page-002")?.fields.parent_page).toBe("");
    expect(pageRow(laterCreated.result.page.sysId ?? "")?.fields.draft_title).toBe("Later Added Page");
    expect(claimPayload("change-set-001:4")).toMatchObject({ affectedPageCount: 4, commandId: "discard-completed-replay-001", kind: "discard_all" });
  });

  it("returns recovery required after published-row restoration fails and completes on explicit retry", () => {
    const scenario = seedDiscardRecoveryScenario();
    let failed = false;
    glideMock.setUpdateHook(pageTable, (row) => {
      if (row.sysId !== "page-001" || failed) {
        return true;
      }
      failed = true;
      return false;
    });

    const first = scenario.service.discardAllWorkspace({
      authority: scenario.authority,
      commandId: "discard-row-recovery-001",
      workspace: scenario.workspace
    });

    expect(first).toMatchObject({
      kind: "failed",
      code: "recovery_required",
      recoveryCommandId: "discard-row-recovery-001",
      status: 409
    });
    glideMock.setUpdateHook(pageTable, null);
    const recovered = expectSucceeded(createService().discardAllWorkspace({
      authority: activeWorkspaceAuthority(),
      commandId: "discard-row-recovery-001",
      workspace: currentWorkspaceRef()
    }));

    expect(recovered.result.pages.map((page) => page.draftTitle)).toEqual(
      expectSucceeded(createService().listPages(currentWorkspaceRef(), "live")).pages.map((page) => page.draftTitle)
    );
    expect(changeSetRow(recovered.authority.changeSetId)?.fields.recovery_state).toBe("none");
  });

  it("returns recovery required when clearing pending rows or removal cleanup fails and completes on explicit retry", () => {
    for (const [tableName, commandId] of [
      [changeEntryTable, "discard-entry-recovery-001"],
      [removalMemberTable, "discard-removal-member-recovery-001"],
      [removalBatchTable, "discard-removal-batch-recovery-001"]
    ] as const) {
      glideMock.reset();
      const scenario = seedDiscardRecoveryScenario();
      let failed = false;
      glideMock.setDeleteHook(tableName, () => {
        if (failed) {
          return true;
        }
        failed = true;
        return false;
      });

      const first = scenario.service.discardAllWorkspace({
        authority: scenario.authority,
        commandId,
        workspace: scenario.workspace
      });

      expect(first).toMatchObject({
        kind: "failed",
        code: "recovery_required",
        recoveryCommandId: commandId,
        status: 409
      });

      glideMock.setDeleteHook(tableName, null);
      const recovered = expectSucceeded(createService().discardAllWorkspace({
        authority: activeWorkspaceAuthority(),
        commandId,
        workspace: currentWorkspaceRef()
      }));

      expect(recovered.result.pendingChanges.rows).toEqual([]);
      expect(changeSetRow(recovered.authority.changeSetId)?.fields.recovery_state).toBe("none");
    }
  });

  it("resolves pending attribution through record and field read access without leaking identifiers", () => {
    const cases = [
      {
        expected: {
          accessibleLabel: "Last changed by Priya Writer",
          displayName: "P. Writer",
          fullDisplayName: "Priya Writer"
        },
        fields: { first_name: "Priya", last_name: "Writer", name: "Priya Writer", user_name: "pwriter", email: "priya@example.com" },
        name: "readable first and last name"
      },
      {
        expected: {
          accessibleLabel: "Last changed by Priya Writer",
          displayName: "P. Writer",
          fullDisplayName: "Priya Writer"
        },
        fields: { first_name: "Priya", last_name: "Writer", name: "Priya Writer", user_name: "pwriter", email: "priya@example.com" },
        fieldAccess: { first_name: false, last_name: false },
        name: "readable safe display value with unavailable component fields"
      },
      {
        expected: UNKNOWN_USER_ATTRIBUTION_FOR_TEST,
        fields: null,
        name: "missing user"
      },
      {
        expected: UNKNOWN_USER_ATTRIBUTION_FOR_TEST,
        fields: { first_name: "Priya", last_name: "Writer", name: "Priya Writer", user_name: "pwriter", email: "priya@example.com" },
        name: "record not readable",
        recordReadable: false
      },
      {
        expected: UNKNOWN_USER_ATTRIBUTION_FOR_TEST,
        fields: { first_name: "Priya", last_name: "Writer", name: "Priya Writer", user_name: "pwriter", email: "priya@example.com" },
        fieldAccess: { first_name: false, last_name: false, name: false },
        name: "name fields not readable"
      },
      {
        expected: UNKNOWN_USER_ATTRIBUTION_FOR_TEST,
        fields: { first_name: "", last_name: "", name: "priya@example.com", user_name: "pwriter", email: "priya@example.com" },
        name: "display value equal to email",
        rejectedValues: ["priya@example.com"]
      },
      {
        expected: UNKNOWN_USER_ATTRIBUTION_FOR_TEST,
        fields: { first_name: "", last_name: "", name: "user@internal", user_name: "pwriter", email: "priya@example.com" },
        name: "display value containing at-sign without dotted email",
        rejectedValues: ["user@internal", "pwriter", "priya@example.com"]
      },
      {
        expected: UNKNOWN_USER_ATTRIBUTION_FOR_TEST,
        fields: { first_name: "", last_name: "", name: "Priya @ Internal", user_name: "pwriter", email: "priya@example.com" },
        name: "unsafe display value is not reintroduced after abbreviation rejects it",
        rejectedValues: ["Priya @ Internal", "pwriter", "priya@example.com"]
      },
      {
        expected: UNKNOWN_USER_ATTRIBUTION_FOR_TEST,
        fields: { first_name: "", last_name: "", name: "pwriter", user_name: "pwriter", email: "priya@example.com" },
        name: "display value equal to login ID without at-sign",
        rejectedValues: ["pwriter", "priya@example.com"]
      },
      {
        expected: UNKNOWN_USER_ATTRIBUTION_FOR_TEST,
        fields: { first_name: "", last_name: "", name: "pwriter", user_name: "pwriter", email: "priya@example.com" },
        fieldAccess: { user_name: false },
        name: "single-token display value with unreadable login ID",
        rejectedValues: ["pwriter", "priya@example.com"]
      },
      {
        expected: UNKNOWN_USER_ATTRIBUTION_FOR_TEST,
        fields: { first_name: "", last_name: "", name: "internal-id", user_name: "internal-id", email: "internal-id@example.com" },
        fieldAccess: { email: false, user_name: false },
        name: "inaccessible privacy comparison fields cannot expose an internal identifier",
        rejectedValues: ["internal-id", "internal-id@example.com"]
      },
      {
        expected: UNKNOWN_USER_ATTRIBUTION_FOR_TEST,
        fields: { first_name: "", last_name: "", name: "Priya <priya@example.com>", user_name: "pwriter", email: "priya@example.com" },
        name: "display value containing an email",
        rejectedValues: ["Priya <priya@example.com>", "pwriter", "priya@example.com"]
      }
    ];

    for (const testCase of cases) {
      glideMock.reset();
      seedWorkspaceFoundation({
        pages: [
          createSeedPage({
            pageId: "page-001",
            draftTitle: "Draft Overview",
            publishedTitle: "Published Overview"
          })
        ]
      });
      if (testCase.fields) {
        glideMock.insertRow("sys_user", "user-1", testCase.fields);
        if (testCase.recordReadable === false) {
          glideMock.setRecordReadable("sys_user", "user-1", false);
        }
        for (const [fieldName, readable] of Object.entries(testCase.fieldAccess ?? {})) {
          glideMock.setFieldReadable("sys_user", "user-1", fieldName, Boolean(readable));
        }
      }
      expectSucceeded(createService().savePageSettings({
        authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
        pageSysId: "page-001",
        slug: "draft-overview",
        title: "Draft Overview",
        workspace: workspaceRef()
      }));

      const result = expectSucceeded(createService().pendingChanges(workspaceRef()));
      const serialized = JSON.stringify(result.pending);
      expect(result.pending.rows[0]?.attribution, testCase.name).toEqual(testCase.expected);
      for (const rejectedValue of testCase.rejectedValues ?? ["priya@example.com", "pwriter"]) {
        expect(serialized, testCase.name).not.toContain(rejectedValue);
      }
    }
  });

  it("does not alter effective pending-entry lifecycle until an interrupted body mutation is recovered", () => {
    seedWorkspaceFoundation();
    let now = "2026-07-18 00:00:00";
    const failingService = createService({ currentTimestamp: () => now, failPhase: "mutation_page_persisted" });
    const input = {
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      draftContentJson: createDocument("Interrupted body"),
      expectedRevision: 0,
      pageSysId: "page-001",
      workspace: workspaceRef()
    };

    expect(failingService.savePageBody(input).kind).toBe("failed");
    expect(getRows(changeEntryTable)).toHaveLength(0);
    expect(pendingRows(createService({ currentTimestamp: () => now }))).toEqual([]);

    now = "2026-07-18 00:01:00";
    glideMock.clearIterations();
    const recovered = expectSucceeded(createService({ currentTimestamp: () => now }).savePageBody(input));
    expect(glideMock.iterationCount(pageTable)).toBe(2);
    expect(glideMock.iterationCount(pageSnapshotTable)).toBe(2);
    expect(recovered.authority).toEqual({ changeSetId: "change-set-001", changeSetRevision: 1 });
    expect(getRows(changeEntryTable)).toHaveLength(1);
    expect(getRows(changeEntryTable)[0]?.fields.first_pending_sequence).toBe(1);
  });

  for (const phase of [
    "foundation_snapshot_set_created",
    "foundation_snapshot_page_inserted"
  ] satisfies FailurePhase[]) {
    it(`reruns workspace foundation convergence after ${phase} without duplicate snapshot rows`, () => {
      seedWorkspaceFoundation({
        includeChangeSet: false,
        includeSnapshot: false,
        pages: [
          createSeedPage({ pageId: "page-001", publishedTitle: "One", publishedSlug: "one", publishedBodyText: "One body" }),
          createSeedPage({ pageId: "page-002", publishedTitle: "Two", publishedSlug: "two", publishedBodyText: "Two body", siblingOrder: "2" })
        ]
      });

      const failingService = createService({ failPhase: phase });
      const first = failingService.listPages(workspaceRef({
        pendingChangeSetSysId: "",
        publishedSnapshotSetSysId: ""
      }), "edit");
      expect(first.kind).toBe("failed");

      const service = createService();
      const second = expectSucceeded(service.listPages(workspaceRef({
        pendingChangeSetSysId: "",
        publishedSnapshotSetSysId: ""
      }), "edit"));
      expect(second.pages.map((page) => page.sysId).sort()).toEqual(["page-001", "page-002"]);
      expect(getRows(snapshotSetTable)).toHaveLength(1);
      expect(getRows(pageSnapshotTable)).toHaveLength(2);
      expect(getRows(snapshotSetTable)[0]?.fields.readiness_state).toBe("ready");
      expect(String(getRows(workspaceTable)[0]?.fields.pending_change_set)).not.toBe("");
      expect(String(getRows(workspaceTable)[0]?.fields.published_snapshot_set)).not.toBe("");
      expect(getRows(changeSetTable)).toHaveLength(1);
      expect(getRows(changeSetTable)[0]?.fields.generation_key).toBe("workspace-001:change-set");
      expect(getRows(snapshotSetTable)[0]?.fields.snapshot_key).toBe("workspace-001:snapshot");
      expect(new Set(getRows(pageSnapshotTable).map((row) => row.fields.snapshot_page_key))).toHaveLength(2);
    });
  }

  it("preserves stable removal-domain identity across reload and unrelated mutations", () => {
    seedWorkspaceFoundation({
      pages: [
        createSeedPage({ pageId: "page-001", draftTitle: "Root Draft", publishedTitle: "Root" }),
        createSeedPage({
          pageId: "page-002",
          parentPageId: "page-001",
          siblingOrder: "1",
          draftTitle: "Child Draft",
          publishedTitle: "Child"
        }),
        createSeedPage({
          pageId: "page-003",
          parentPageId: null,
          siblingOrder: "2",
          draftTitle: "Sibling Draft",
          publishedTitle: "Sibling"
        })
      ]
    });
    const service = createService();

    const deleted = expectSucceeded(service.deletePage({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-001",
      workspace: workspaceRef()
    }));
    expect(getRows(removalBatchTable)).toHaveLength(1);
    const originalBatchSysId = getRows(removalBatchTable)[0]?.sysId;
    expect(getRows(removalBatchTable)[0]?.fields.batch_key).toBe("change-set-001:0:page-001");
    expect(getRows(removalMemberTable)).toHaveLength(2);

    expectSucceeded(service.savePageBody({
      authority: deleted.authority,
      draftContentJson: createDocument("Sibling changed"),
      expectedRevision: 0,
      pageSysId: "page-003",
      workspace: workspaceRef()
    }));

    expect(getRows(removalBatchTable)).toHaveLength(1);
    expect(getRows(removalBatchTable)[0]?.sysId).toBe(originalBatchSysId);
    expect(getRows(removalBatchTable)[0]?.fields.batch_key).toBe("change-set-001:0:page-001");
    expect(getRows(removalMemberTable)).toHaveLength(2);
    expect(new Set(getRows(removalMemberTable).map((row) => row.fields.batch_page_key))).toHaveLength(2);
  });

  it("fails closed when a body claim cannot persist change_set_advancing before the row advance, then recovers once", () => {
    seedWorkspaceFoundation();
    const input = {
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      draftContentJson: createDocument("Body advancing claim failed"),
      expectedRevision: 0,
      pageSysId: "page-001",
      workspace: workspaceRef()
    };
    failNextClaimUpdateToPhase("change_set_advancing");

    const failed = createService().savePageBody(input);
    expect(failed.kind).toBe("failed");
    expect(changeSetRow()?.fields.change_set_revision).toBe(0);
    expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("entry_persisted");
    expect(claimRow("change-set-001:0")?.fields.mutation_result_json ?? "").toBe("");
    expect(pageRow("page-001")?.fields.draft_revision).toBe(1);
    expect(getRows(changeEntryTable)).toHaveLength(1);

    glideMock.setUpdateHook(mutationClaimTable, null);
    const retry = expectSucceeded(createService({ currentTimestamp: () => "2026-07-18 00:01:00" }).savePageBody(input));
    const replay = expectSucceeded(createService({ currentTimestamp: () => "2026-07-18 00:01:00" }).savePageBody(input));
    expect(retry.authority).toEqual({ changeSetId: "change-set-001", changeSetRevision: 1 });
    expect(replay.authority).toEqual(retry.authority);
    expect(changeSetRow()?.fields.change_set_revision).toBe(1);
    expect(getRows(changeEntryTable)).toHaveLength(1);
    expect(pageRow("page-001")?.fields.draft_revision).toBe(1);
    expect(getRows(mutationClaimTable)).toHaveLength(1);
    expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("finalized");
    expect(claimRow("change-set-001:0")?.fields.mutation_state).toBe("finalized");
  });

  it("fails closed when a settings claim cannot persist change_set_advancing before the row advance, then recovers once", () => {
    seedWorkspaceFoundation();
    const input = {
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-001",
      slug: "settings-advancing-claim-failed",
      title: "Settings advancing claim failed",
      workspace: workspaceRef()
    };
    failNextClaimUpdateToPhase("change_set_advancing");

    expect(createService().savePageSettings(input).kind).toBe("failed");
    expect(changeSetRow()?.fields.change_set_revision).toBe(0);
    expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("entry_persisted");
    expect(claimRow("change-set-001:0")?.fields.mutation_result_json ?? "").toBe("");
    expect(getRows(changeEntryTable)).toHaveLength(1);

    glideMock.setUpdateHook(mutationClaimTable, null);
    const retry = expectSucceeded(createService({ currentTimestamp: () => "2026-07-18 00:01:00" }).savePageSettings(input));
    const replay = expectSucceeded(createService({ currentTimestamp: () => "2026-07-18 00:01:00" }).savePageSettings(input));
    expect(retry.authority).toEqual({ changeSetId: "change-set-001", changeSetRevision: 1 });
    expect(replay.authority).toEqual(retry.authority);
    expect(changeSetRow()?.fields.change_set_revision).toBe(1);
    expect(getRows(changeEntryTable)).toHaveLength(1);
    expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("finalized");
  });

  it("fails closed when a create claim cannot persist change_set_advancing before the row advance, then recovers without duplicates", () => {
    seedWorkspaceFoundation();
    const input = {
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      parentPageSysId: null,
      title: "Create advancing claim failed",
      workspace: workspaceRef()
    };
    failNextClaimUpdateToPhase("change_set_advancing");

    expect(createService().createPage(input).kind).toBe("failed");
    expect(changeSetRow()?.fields.change_set_revision).toBe(0);
    expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("entry_persisted");
    expect(claimRow("change-set-001:0")?.fields.mutation_result_json ?? "").toBe("");
    expect(getRows(pageTable).filter((row) => row.fields.draft_title === input.title)).toHaveLength(1);
    expect(getRows(changeEntryTable)).toHaveLength(1);

    glideMock.setUpdateHook(mutationClaimTable, null);
    const retry = expectSucceeded(createService({ currentTimestamp: () => "2026-07-18 00:01:00" }).createPage(input));
    const replay = expectSucceeded(createService({ currentTimestamp: () => "2026-07-18 00:01:00" }).createPage(input));
    expect(retry.authority).toEqual({ changeSetId: "change-set-001", changeSetRevision: 1 });
    expect(replay.authority).toEqual(retry.authority);
    expect(changeSetRow()?.fields.change_set_revision).toBe(1);
    expect(getRows(pageTable).filter((row) => row.fields.draft_title === input.title)).toHaveLength(1);
    expect(getRows(changeEntryTable)).toHaveLength(1);
    expect(getRows(mutationClaimTable)).toHaveLength(1);
    expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("finalized");
  });

  it("fails closed when a delete claim cannot persist change_set_advancing before the row advance, then recovers without duplicate removals", () => {
    seedWorkspaceFoundation({
      pages: [
        createSeedPage({ pageId: "page-001", draftTitle: "Root Draft", publishedTitle: "Root" }),
        createSeedPage({ pageId: "page-002", parentPageId: "page-001", draftTitle: "Child Draft", publishedTitle: "Child" }),
        createSeedPage({ pageId: "page-003", siblingOrder: "2", draftTitle: "Sibling Draft", publishedTitle: "Sibling" })
      ]
    });
    const input = {
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-001",
      workspace: workspaceRef()
    };
    failNextClaimUpdateToPhase("change_set_advancing");

    expect(createService().deletePage(input).kind).toBe("failed");
    expect(changeSetRow()?.fields.change_set_revision).toBe(0);
    expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("removal_persisted");
    expect(claimRow("change-set-001:0")?.fields.mutation_result_json ?? "").toBe("");
    expect(getRows(removalBatchTable)).toHaveLength(1);
    expect(getRows(removalMemberTable)).toHaveLength(2);

    glideMock.setUpdateHook(mutationClaimTable, null);
    const retry = expectSucceeded(createService({ currentTimestamp: () => "2026-07-18 00:01:00" }).deletePage(input));
    const replay = expectSucceeded(createService({ currentTimestamp: () => "2026-07-18 00:01:00" }).deletePage(input));
    expect(retry.authority).toEqual({ changeSetId: "change-set-001", changeSetRevision: 1 });
    expect(replay.authority).toEqual(retry.authority);
    expect(changeSetRow()?.fields.change_set_revision).toBe(1);
    expect(getRows(removalBatchTable)).toHaveLength(1);
    expect(getRows(removalMemberTable)).toHaveLength(2);
    expect(new Set(getRows(removalMemberTable).map((row) => row.fields.batch_page_key))).toHaveLength(2);
    expect(getRows(mutationClaimTable)).toHaveLength(1);
    expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("finalized");
  });

  it("persists a page move only in Edit projection, records one moved entry, and advances once", () => {
    seedWorkspaceFoundation({
      pages: [
        createSeedPage({ pageId: "page-001", draftBodyText: "Root body", draftContentJson: createDocument("Root body"), draftTitle: "Root", publishedBodyText: "Root body", publishedContentJson: createDocument("Root body"), publishedTitle: "Root", siblingOrder: "1" }),
        createSeedPage({ pageId: "page-002", parentPageId: "page-001", draftBodyText: "Child body", draftContentJson: createDocument("Child body"), draftTitle: "Child", publishedBodyText: "Child body", publishedContentJson: createDocument("Child body"), publishedTitle: "Child", siblingOrder: "1" }),
        createSeedPage({ pageId: "page-003", draftBodyText: "Sibling body", draftContentJson: createDocument("Sibling body"), draftTitle: "Sibling", publishedBodyText: "Sibling body", publishedContentJson: createDocument("Sibling body"), publishedTitle: "Sibling", siblingOrder: "2" })
      ]
    });
    const service = createService();
    const result = expectSucceeded(service.movePage({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-002",
      parentPageSysId: null,
      siblingOrder: "3",
      workspace: workspaceRef()
    }));

    expect(result.authority).toEqual({ changeSetId: "change-set-001", changeSetRevision: 1 });
    expect(pageRow("page-002")?.fields.parent_page).toBe("");
    expect(pageRow("page-002")?.fields.sibling_order).toBe("3");
    expect(getRows(changeEntryTable)).toHaveLength(1);
    expect(getRows(changeEntryTable)[0]?.fields.page).toBe("page-002");
    expect(changeSetRow()?.fields.change_set_revision).toBe(1);
    expect(pendingRows(service)).toEqual([expect.objectContaining({ pageSysId: "page-002" })]);
    expect(pendingRows(service)[0]?.category).toContain("Modified");
    expect(pendingRows(service)[0]?.category).toContain("Moved");
    expect(expectSucceeded(service.listPages(workspaceRef(), "edit")).pages.find((page) => page.sysId === "page-002")?.parentPageSysId).toBe(null);
    expect(expectSucceeded(service.listPages(workspaceRef(), "live")).pages.find((page) => page.sysId === "page-002")?.parentPageSysId).toBe("page-001");
  });

  it("round-trips rank zero when moving the second root before the first while Live remains published", () => {
    seedWorkspaceFoundation({
      pages: [
        createSeedPage({ pageId: "page-001", draftTitle: "First", publishedTitle: "First", siblingOrder: "1" }),
        createSeedPage({ pageId: "page-002", draftTitle: "Second", publishedTitle: "Second", siblingOrder: "2" })
      ]
    });
    const service = createService();
    const beforeEdit = expectSucceeded(service.listPages(workspaceRef(), "edit"));
    expect(beforeEdit.pages.map((page) => [page.sysId, page.siblingOrder])).toEqual([
      ["page-001", 1],
      ["page-002", 2]
    ]);

    const moved = expectSucceeded(service.movePage({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-002",
      parentPageSysId: null,
      siblingOrder: "0",
      workspace: workspaceRef()
    }));

    expect(moved.authority).toEqual({ changeSetId: "change-set-001", changeSetRevision: 1 });
    expect(moved.result.pages.map((page) => [page.sysId, page.siblingOrder])).toEqual([
      ["page-002", 0],
      ["page-001", 1]
    ]);
    expect(pageRow("page-002")?.fields.sibling_order).toBe("0");
    expect(getRows(changeEntryTable)).toHaveLength(1);
    expect(getRows(changeEntryTable)[0]?.fields.page).toBe("page-002");
    expect(changeSetRow()?.fields.change_set_revision).toBe(1);
    expect(getRows(mutationClaimTable)).toHaveLength(1);

    const reloadedEdit = expectSucceeded(service.listPages(workspaceRef(), "edit"));
    expect(reloadedEdit.pages.map((page) => [page.sysId, page.siblingOrder])).toEqual([
      ["page-002", 0],
      ["page-001", 1]
    ]);

    const live = expectSucceeded(service.listPages(workspaceRef(), "live"));
    expect(live.pages.map((page) => [page.sysId, page.siblingOrder])).toEqual([
      ["page-001", 1],
      ["page-002", 2]
    ]);
  });

  it("rejects invalid movement without page-row or revision changes", () => {
    seedWorkspaceFoundation({
      pages: [
        createSeedPage({ pageId: "page-001", publishedTitle: "Root" }),
        createSeedPage({ pageId: "page-002", parentPageId: "page-001", publishedTitle: "Child" })
      ]
    });
    const result = createService().movePage({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-001",
      parentPageSysId: "page-002",
      siblingOrder: "1",
      workspace: workspaceRef()
    });

    expect(result.kind).toBe("failed");
    expect(changeSetRow()?.fields.change_set_revision).toBe(0);
    expect(pageRow("page-001")?.fields.parent_page).toBe("");
    expect(getRows(changeEntryTable)).toHaveLength(0);
    expect(getRows(mutationClaimTable)).toHaveLength(0);
  });

  it("returns invalid and no-op movement before claiming the generation and leaves same-authority mutations unblocked", () => {
    const bodyDocument = createDocumentEnvelope("Unblocked same authority body");
    seedWorkspaceFoundation({
      pages: [
        createSeedPage({ pageId: "page-001", draftContentJson: createDocumentEnvelope("Root"), publishedContentJson: createDocumentEnvelope("Root"), publishedTitle: "Root" }),
        createSeedPage({ pageId: "page-002", draftContentJson: createDocumentEnvelope("Child"), parentPageId: "page-001", publishedContentJson: createDocumentEnvelope("Child"), publishedTitle: "Child" }),
        createSeedPage({ pageId: "page-003", draftContentJson: createDocumentEnvelope("Sibling"), publishedContentJson: createDocumentEnvelope("Sibling"), publishedTitle: "Sibling", siblingOrder: "2" })
      ]
    });

    const service = createService();
    const invalid = service.movePage({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-001",
      parentPageSysId: "page-002",
      siblingOrder: "1",
      workspace: workspaceRef()
    });
    expect(invalid).toMatchObject({ kind: "failed", code: "invalid" });
    expect(getRows(mutationClaimTable)).toHaveLength(0);
    expect(getRows(changeEntryTable)).toHaveLength(0);
    expect(changeSetRow()?.fields.change_set_revision).toBe(0);

    const noop = expectSucceeded(service.movePage({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-002",
      parentPageSysId: "page-001",
      siblingOrder: "1",
      workspace: workspaceRef()
    }));
    expect(noop.authority).toEqual({ changeSetId: "change-set-001", changeSetRevision: 0 });
    expect(getRows(mutationClaimTable)).toHaveLength(0);
    expect(getRows(changeEntryTable)).toHaveLength(0);
    expect(changeSetRow()?.fields.change_set_revision).toBe(0);

    expectSucceeded(service.savePageBody({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      draftContentJson: bodyDocument,
      expectedRevision: 0,
      pageSysId: "page-003",
      workspace: workspaceRef()
    }));
    expect(changeSetRow()?.fields.change_set_revision).toBe(1);
    expect(getRows(mutationClaimTable)).toHaveLength(1);
    expect(claimRow("change-set-001:0")?.fields.mutation_kind).toBe("body");
  });

  it("does not let invalid or no-op movement block other same-authority mutation kinds", () => {
    const seed = () => seedWorkspaceFoundation({
      pages: [
        createSeedPage({ pageId: "page-001", draftContentJson: createDocumentEnvelope("Root"), publishedContentJson: createDocumentEnvelope("Root"), publishedTitle: "Root" }),
        createSeedPage({ pageId: "page-002", draftContentJson: createDocumentEnvelope("Child"), parentPageId: "page-001", publishedContentJson: createDocumentEnvelope("Child"), publishedTitle: "Child" }),
        createSeedPage({ pageId: "page-003", draftContentJson: createDocumentEnvelope("Sibling"), publishedContentJson: createDocumentEnvelope("Sibling"), publishedTitle: "Sibling", siblingOrder: "2" })
      ]
    });
    const assertPreflightDidNotClaim = (service = createService()) => {
      expect(service.movePage({ authority: { changeSetId: "change-set-001", changeSetRevision: 0 }, pageSysId: "page-001", parentPageSysId: "page-002", siblingOrder: "1", workspace: workspaceRef() }).kind).toBe("failed");
      expectSucceeded(service.movePage({ authority: { changeSetId: "change-set-001", changeSetRevision: 0 }, pageSysId: "page-002", parentPageSysId: "page-001", siblingOrder: "1", workspace: workspaceRef() }));
      expect(getRows(mutationClaimTable)).toHaveLength(0);
      expect(changeSetRow()?.fields.change_set_revision).toBe(0);
      expect(getRows(changeEntryTable)).toHaveLength(0);
      return service;
    };

    for (const [kind, mutate] of [
      ["settings", (service: ReturnType<typeof createService>) => service.savePageSettings({ authority: { changeSetId: "change-set-001", changeSetRevision: 0 }, pageSysId: "page-003", slug: "sibling-renamed", title: "Sibling renamed", workspace: workspaceRef() })],
      ["create", (service: ReturnType<typeof createService>) => service.createPage({ authority: { changeSetId: "change-set-001", changeSetRevision: 0 }, parentPageSysId: null, title: "Created after no-op", workspace: workspaceRef() })],
      ["delete", (service: ReturnType<typeof createService>) => service.deletePage({ authority: { changeSetId: "change-set-001", changeSetRevision: 0 }, pageSysId: "page-003", workspace: workspaceRef() })],
      ["move", (service: ReturnType<typeof createService>) => service.movePage({ authority: { changeSetId: "change-set-001", changeSetRevision: 0 }, pageSysId: "page-003", parentPageSysId: "page-001", siblingOrder: "2", workspace: workspaceRef() })]
    ] as const) {
      glideMock.reset();
      seed();
      const result = mutate(assertPreflightDidNotClaim());
      expect(result.kind).toBe("succeeded");
      expect(claimRow("change-set-001:0")?.fields.mutation_kind).toBe(kind);
      expect(changeSetRow()?.fields.change_set_revision).toBe(1);
    }
  });

  it("recovers movement after page persistence and after change-set row advancement without duplicate entries", () => {
    for (const phase of ["mutation_page_persisted", "mutation_change_set_row_updated"] satisfies FailurePhase[]) {
      glideMock.reset();
      seedWorkspaceFoundation({
        pages: [
          createSeedPage({ pageId: "page-001", publishedTitle: "Root" }),
          createSeedPage({ pageId: "page-002", parentPageId: "page-001", publishedTitle: "Child" })
        ]
      });
      const input = {
        authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
        pageSysId: "page-002",
        parentPageSysId: null,
        siblingOrder: "5",
        workspace: workspaceRef()
      };

      expect(createService({ failPhase: phase }).movePage(input).kind).toBe("failed");
      const retry = expectSucceeded(createService({ currentTimestamp: () => "2026-07-18 00:01:00" }).movePage(input));
      const replay = expectSucceeded(createService({ currentTimestamp: () => "2026-07-18 00:01:00" }).movePage(input));

      expect(retry.authority).toEqual({ changeSetId: "change-set-001", changeSetRevision: 1 });
      expect(replay.authority).toEqual(retry.authority);
      expect(changeSetRow()?.fields.change_set_revision).toBe(1);
      expect(getRows(changeEntryTable)).toHaveLength(1);
      expect(pageRow("page-002")?.fields.parent_page).toBe("");
      expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("finalized");
    }
  });

  it("recovers movement when the page row persisted but the page_persisted claim marker did not", () => {
    seedWorkspaceFoundation({
      pages: [
        createSeedPage({ pageId: "page-001", draftContentJson: createDocumentEnvelope("Root"), publishedContentJson: createDocumentEnvelope("Root"), publishedTitle: "Root" }),
        createSeedPage({ pageId: "page-002", draftContentJson: createDocumentEnvelope("Child"), parentPageId: "page-001", publishedContentJson: createDocumentEnvelope("Child"), publishedTitle: "Child" })
      ]
    });
    const input = {
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-002",
      parentPageSysId: null,
      siblingOrder: "5",
      workspace: workspaceRef()
    };
    failNextClaimUpdateToPhase("page_persisted");

    const failed = createService().movePage(input);
    expect(failed.kind).toBe("failed");
    expect(pageRow("page-002")?.fields.parent_page).toBe("");
    expect(pageRow("page-002")?.fields.sibling_order).toBe("5");
    expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("claimed");
    expect(changeSetRow()?.fields.change_set_revision).toBe(0);
    expect(getRows(changeEntryTable)).toHaveLength(0);

    glideMock.setUpdateHook(mutationClaimTable, null);
    const retry = expectSucceeded(createService({ currentTimestamp: () => "2026-07-18 00:01:00" }).movePage(input));
    const replay = expectSucceeded(createService({ currentTimestamp: () => "2026-07-18 00:01:00" }).movePage(input));

    expect(retry.authority).toEqual({ changeSetId: "change-set-001", changeSetRevision: 1 });
    expect(replay.authority).toEqual(retry.authority);
    expect(changeSetRow()?.fields.change_set_revision).toBe(1);
    expect(getRows(changeEntryTable)).toHaveLength(1);
    expect(getRows(changeEntryTable)[0]?.fields.page).toBe("page-002");
    expect(getRows(changeEntryTable)[0]?.fields.first_pending_sequence).toBe(1);
    expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("finalized");
    expect(claimRow("change-set-001:0")?.fields.result_change_set_revision).toBe(1);
  });

  it("recovers movement when change_set_advancing claim persistence fails before revision advancement", () => {
    seedWorkspaceFoundation({
      pages: [
        createSeedPage({ pageId: "page-001", draftContentJson: createDocumentEnvelope("Root"), publishedContentJson: createDocumentEnvelope("Root"), publishedTitle: "Root" }),
        createSeedPage({ pageId: "page-002", draftContentJson: createDocumentEnvelope("Child"), parentPageId: "page-001", publishedContentJson: createDocumentEnvelope("Child"), publishedTitle: "Child" })
      ]
    });
    const input = {
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-002",
      parentPageSysId: null,
      siblingOrder: "6",
      workspace: workspaceRef()
    };
    failNextClaimUpdateToPhase("change_set_advancing");

    expect(createService().movePage(input).kind).toBe("failed");
    expect(changeSetRow()?.fields.change_set_revision).toBe(0);
    expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("entry_persisted");
    expect(claimRow("change-set-001:0")?.fields.mutation_result_json ?? "").toBe("");

    glideMock.setUpdateHook(mutationClaimTable, null);
    const retry = expectSucceeded(createService({ currentTimestamp: () => "2026-07-18 00:01:00" }).movePage(input));
    const replay = expectSucceeded(createService({ currentTimestamp: () => "2026-07-18 00:01:00" }).movePage(input));
    expect(retry.authority).toEqual({ changeSetId: "change-set-001", changeSetRevision: 1 });
    expect(replay.authority).toEqual(retry.authority);
    expect(replay.result.pages).toEqual(retry.result.pages);
    expect(changeSetRow()?.fields.change_set_revision).toBe(1);
    expect(getRows(changeEntryTable)).toHaveLength(1);
    expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("finalized");
  });

  it("returns one winner for same-generation movement contention", () => {
    seedWorkspaceFoundation({
      pages: [
        createSeedPage({ pageId: "page-001", publishedTitle: "Root" }),
        createSeedPage({ pageId: "page-002", parentPageId: "page-001", publishedTitle: "Child" }),
        createSeedPage({ pageId: "page-003", publishedTitle: "Sibling", siblingOrder: "2" })
      ]
    });
    const service = createService();
    const winner = service.movePage({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-002",
      parentPageSysId: null,
      siblingOrder: "4",
      workspace: workspaceRef()
    });
    const loser = service.movePage({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-003",
      parentPageSysId: "page-001",
      siblingOrder: "1",
      workspace: workspaceRef()
    });

    expect(winner.kind).toBe("succeeded");
    expect(loser).toMatchObject({ kind: "failed", code: "stale_generation", currentChangeSetRevision: 1 });
    expect(changeSetRow()?.fields.change_set_revision).toBe(1);
    expect(getRows(changeEntryTable)).toHaveLength(1);
  });

  it("derives movement categories without legacy document migration noise or descendant and sibling entries", () => {
    const canonical = (title: string, order: string, parentPageId: string | null = null) =>
      createSeedPage({
        pageId: `page-${title.toLowerCase()}`,
        draftBodyText: `${title} body`,
        draftContentJson: createDocumentEnvelope(`${title} body`),
        draftTitle: title,
        draftSlug: title.toLowerCase(),
        parentPageId,
        publishedBodyText: `${title} body`,
        publishedContentJson: createDocumentEnvelope(`${title} body`),
        publishedTitle: title,
        publishedSlug: title.toLowerCase(),
        siblingOrder: order
      });
    seedWorkspaceFoundation({
      pages: [
        canonical("Root", "1"),
        canonical("Child", "1", "page-root"),
        canonical("Grandchild", "1", "page-child"),
        canonical("Sibling", "2")
      ]
    });
    const service = createService();

    const moved = expectSucceeded(service.movePage({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-child",
      parentPageSysId: null,
      siblingOrder: "3",
      workspace: workspaceRef()
    }));
    expect(pendingRows(service)).toEqual([expect.objectContaining({ category: "Moved", pageSysId: "page-child", title: "Child" })]);
    expect(getRows(changeEntryTable).map((row) => row.fields.page)).toEqual(["page-child"]);

    const modifiedMoved = expectSucceeded(service.savePageSettings({
      authority: moved.authority,
      pageSysId: "page-child",
      slug: "child-renamed",
      title: "Child renamed",
      workspace: workspaceRef()
    }));
    expect(pendingRows(service)).toEqual([expect.objectContaining({ pageSysId: "page-child" })]);
    expect(pendingRows(service)[0]?.category).toContain("Modified");
    expect(pendingRows(service)[0]?.category).toContain("Moved");

    const restoredModified = expectSucceeded(service.movePage({
      authority: modifiedMoved.authority,
      pageSysId: "page-child",
      parentPageSysId: "page-root",
      siblingOrder: "1",
      workspace: workspaceRef()
    }));
    expect(pendingRows(service)).toEqual([expect.objectContaining({ category: "Modified", pageSysId: "page-child" })]);
    expect(getRows(changeEntryTable)).toHaveLength(1);

    glideMock.reset();
    seedWorkspaceFoundation({ pages: [canonical("Root", "1"), canonical("Child", "1", "page-root"), canonical("Grandchild", "1", "page-child"), canonical("Sibling", "2")] });
    const movedOnly = expectSucceeded(createService().movePage({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-child",
      parentPageSysId: null,
      siblingOrder: "3",
      workspace: workspaceRef()
    }));
    expectSucceeded(createService().movePage({
      authority: movedOnly.authority,
      pageSysId: "page-child",
      parentPageSysId: "page-root",
      siblingOrder: "1",
      workspace: workspaceRef()
    }));
    expect(pendingRows(createService())).toEqual([]);
    expect(getRows(changeEntryTable)).toHaveLength(0);

    glideMock.reset();
    seedWorkspaceFoundation({ pages: [canonical("Root", "1"), canonical("Child", "1", "page-root"), canonical("Sibling", "2")] });
    const added = expectSucceeded(createService().createPage({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      parentPageSysId: null,
      title: "Added",
      workspace: workspaceRef()
    }));
    expectSucceeded(createService().movePage({
      authority: added.authority,
      pageSysId: added.result.page.sysId,
      parentPageSysId: "page-root",
      siblingOrder: "2",
      workspace: workspaceRef()
    }));
    expect(pendingRows(createService())).toEqual([expect.objectContaining({ category: "Added", pageSysId: added.result.page.sysId })]);

    expect(restoredModified.authority.changeSetRevision).toBe(3);
  });

  it("discards a modified page row and returns the refreshed Edit projection without changing Live", () => {
    seedWorkspaceFoundation({
      pages: [
        createSeedPage({
          pageId: "page-001",
          draftBodyText: "Published body",
          draftContentJson: createDocument("Published body"),
          draftTitle: "Overview",
          publishedBodyText: "Published body",
          publishedContentJson: createDocument("Published body"),
          publishedTitle: "Overview"
        })
      ]
    });
    const service = createService();
    const liveBefore = expectSucceeded(service.listPages(workspaceRef(), "live"));
    const modified = expectSucceeded(service.savePageBody({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      draftContentJson: createDocument("Changed body"),
      expectedRevision: 0,
      pageSysId: "page-001",
      workspace: workspaceRef()
    }));

    const discarded = service.discardPage({
      authority: modified.authority,
      pageSysId: "page-001",
      workspace: workspaceRef()
    });

    if (discarded.kind !== "succeeded") {
      throw new Error(`expected discard page success: ${discarded.errorMessage}`);
    }
    expect(discarded.result.discardedPageSysId).toBe("page-001");
    expect(discarded.result.pendingChanges.rows).toEqual([]);
    expect(discarded.result.pages[0]?.draftBodyText).toBe("Published body");
    expect(expectSucceeded(service.listPages(workspaceRef(), "live")).pages[0]).toMatchObject({
      draftBodyText: liveBefore.pages[0]?.draftBodyText,
      draftSlug: liveBefore.pages[0]?.draftSlug,
      draftTitle: liveBefore.pages[0]?.draftTitle,
      publishedBodyText: liveBefore.pages[0]?.publishedBodyText,
      publishedSlug: liveBefore.pages[0]?.publishedSlug,
      publishedTitle: liveBefore.pages[0]?.publishedTitle,
      sysId: "page-001"
    });
  });

  it("discards an Added subtree with nested Added descendants and removes every corresponding pending row without changing Live", () => {
    seedWorkspaceFoundation({
      pages: [
        createSeedPage({
          pageId: "page-root",
          draftBodyText: "Root body",
          draftContentJson: createDocument("Root body"),
          draftSlug: "root",
          draftTitle: "Root",
          publishedBodyText: "Root body",
          publishedContentJson: createDocument("Root body"),
          publishedSlug: "root",
          publishedTitle: "Root",
          siblingOrder: "1"
        }),
        createSeedPage({
          pageId: "page-sibling",
          draftBodyText: "Sibling body",
          draftContentJson: createDocument("Sibling body"),
          draftSlug: "sibling",
          draftTitle: "Sibling",
          publishedBodyText: "Sibling body",
          publishedContentJson: createDocument("Sibling body"),
          publishedSlug: "sibling",
          publishedTitle: "Sibling",
          siblingOrder: "2"
        })
      ]
    });
    const service = createService();
    const liveBefore = expectSucceeded(service.listPages(workspaceRef(), "live"));
    let authority = expectSucceeded(service.createPage({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      parentPageSysId: "page-root",
      title: "Added Parent",
      workspace: workspaceRef()
    })).authority;
    const addedParentId = pendingRows(service).find((row) => row.title === "Added Parent")?.pageSysId ?? "";
    authority = expectSucceeded(service.createPage({
      authority,
      parentPageSysId: addedParentId,
      title: "Added Child",
      workspace: workspaceRef()
    })).authority;
    const addedChildId = pendingRows(service).find((row) => row.title === "Added Child")?.pageSysId ?? "";
    authority = expectSucceeded(service.createPage({
      authority,
      parentPageSysId: addedChildId,
      title: "Added Grandchild",
      workspace: workspaceRef()
    })).authority;
    const addedGrandchildId = pendingRows(service).find((row) => row.title === "Added Grandchild")?.pageSysId ?? "";

    const discarded = service.discardPage({
      authority,
      pageSysId: addedParentId,
      workspace: workspaceRef()
    });

    if (discarded.kind !== "succeeded") {
      throw new Error(`expected discard page success: ${discarded.errorMessage}`);
    }
    expect(discarded.result.discardedPageSysId).toBe(addedParentId);
    expect(discarded.result.pendingChanges.rows).toEqual([]);
    expect(discarded.result.pages.map((page) => page.sysId)).toEqual(["page-root", "page-sibling"]);
    expect(pageRow(addedParentId)).toBeUndefined();
    expect(pageRow(addedChildId)).toBeUndefined();
    expect(pageRow(addedGrandchildId)).toBeUndefined();
    expect(expectSucceeded(service.listPages(currentWorkspaceRef(), "live")).pages).toEqual(liveBefore.pages);
  });

  it("does not silently delete a published identity that still depends on an Added parent during individual undo", () => {
    seedWorkspaceFoundation({
      pages: [
        createSeedPage({
          pageId: "page-root",
          draftSlug: "root",
          draftTitle: "Root",
          publishedSlug: "root",
          publishedTitle: "Root",
          siblingOrder: "1"
        }),
        createSeedPage({
          pageId: "page-child",
          draftSlug: "child",
          draftTitle: "Child",
          parentPageId: "page-root",
          publishedSlug: "child",
          publishedTitle: "Child",
          siblingOrder: "1"
        })
      ]
    });
    const service = createService();
    let authority = expectSucceeded(service.createPage({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      parentPageSysId: "page-root",
      title: "Added Parent",
      workspace: workspaceRef()
    })).authority;
    const addedParentId = pendingRows(service).find((row) => row.title === "Added Parent")?.pageSysId ?? "";
    authority = expectSucceeded(service.movePage({
      authority,
      pageSysId: "page-child",
      parentPageSysId: addedParentId,
      siblingOrder: "1",
      workspace: workspaceRef()
    })).authority;
    const editBeforeUndo = expectSucceeded(service.listPages(workspaceRef(), "edit")).pages.map((page) => page.sysId);
    const pendingBeforeUndo = pendingRows(service).map((row) => row.pageSysId);

    const discarded = service.discardPage({
      authority,
      pageSysId: addedParentId,
      workspace: workspaceRef()
    });

    expect(discarded).toMatchObject({
      kind: "failed",
      code: "invalid",
      errorMessage: "This Added page cannot be undone while other pages still depend on it. Undo or move those dependent changes first.",
      status: 400
    });
    expect(expectSucceeded(service.listPages(workspaceRef(), "edit")).pages.map((page) => page.sysId)).toEqual(editBeforeUndo);
    expect(pendingRows(service).map((row) => row.pageSysId)).toEqual(pendingBeforeUndo);
    expect(pageRow("page-child")).toBeDefined();
  });

  it("discards a removed subtree from a descendant row and restores the Edit projection without changing Live", () => {
    seedWorkspaceFoundation({
      pages: [
        createSeedPage({
          pageId: "page-root",
          draftBodyText: "Root body",
          draftContentJson: createDocument("Root body"),
          draftSlug: "root",
          draftTitle: "Root",
          publishedBodyText: "Root body",
          publishedContentJson: createDocument("Root body"),
          publishedSlug: "root",
          publishedTitle: "Root",
          siblingOrder: "1"
        }),
        createSeedPage({
          pageId: "page-child",
          draftBodyText: "Child body",
          draftContentJson: createDocument("Child body"),
          draftSlug: "child",
          draftTitle: "Child",
          parentPageId: "page-root",
          publishedBodyText: "Child body",
          publishedContentJson: createDocument("Child body"),
          publishedTitle: "Child",
          publishedSlug: "child",
          siblingOrder: "1"
        }),
        createSeedPage({
          pageId: "page-grandchild",
          draftBodyText: "Grandchild body",
          draftContentJson: createDocument("Grandchild body"),
          draftSlug: "grandchild",
          draftTitle: "Grandchild",
          parentPageId: "page-child",
          publishedBodyText: "Grandchild body",
          publishedContentJson: createDocument("Grandchild body"),
          publishedTitle: "Grandchild",
          publishedSlug: "grandchild",
          siblingOrder: "1"
        }),
        createSeedPage({
          pageId: "page-sibling",
          draftBodyText: "Sibling body",
          draftContentJson: createDocument("Sibling body"),
          draftSlug: "sibling",
          draftTitle: "Sibling",
          publishedBodyText: "Sibling body",
          publishedContentJson: createDocument("Sibling body"),
          publishedSlug: "sibling",
          publishedTitle: "Sibling",
          siblingOrder: "2"
        })
      ]
    });
    const service = createService();
    const liveBefore = expectSucceeded(service.listPages(workspaceRef(), "live"));
    const removed = expectSucceeded(service.deletePage({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-child",
      workspace: workspaceRef()
    }));

    expect(expectSucceeded(service.listPages(workspaceRef(), "edit")).pages.map((page) => page.sysId)).toEqual(["page-root", "page-sibling"]);
    expect(pendingRows(service).map((row) => row.pageSysId).sort()).toEqual(["page-child", "page-grandchild"]);

    const discarded = service.discardPage({
      authority: removed.authority,
      pageSysId: "page-grandchild",
      workspace: workspaceRef()
    });

    if (discarded.kind !== "succeeded") {
      throw new Error(`expected discard page success: ${discarded.errorMessage}`);
    }
    expect(discarded.result.discardedPageSysId).toBe("page-grandchild");
    expect(discarded.result.pendingChanges.rows).toEqual([]);
    expect(discarded.result.pages.map((page) => page.sysId)).toEqual(["page-root", "page-child", "page-grandchild", "page-sibling"]);
    expect(discarded.result.pages.find((page) => page.sysId === "page-child")).toMatchObject({
      parentPageSysId: "page-root",
      publicationState: "published",
      sysId: "page-child"
    });
    expect(discarded.result.pages.find((page) => page.sysId === "page-grandchild")).toMatchObject({
      parentPageSysId: "page-child",
      publicationState: "published",
      sysId: "page-grandchild"
    });
    expect(getRows(removalBatchTable)).toEqual([
      expect.objectContaining({
        fields: expect.objectContaining({
          lifecycle_state: "retired"
        })
      })
    ]);
    expect(expectSucceeded(service.listPages(workspaceRef(), "live")).pages).toEqual(liveBefore.pages);
  });

  it("does not proceed to entry persistence when an earlier body owner-scoped claim update fails", () => {
    seedWorkspaceFoundation();
    failNextClaimUpdateToPhase("page_persisted");
    const result = createService().savePageBody({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      draftContentJson: createDocument("Earlier claim failure"),
      expectedRevision: 0,
      pageSysId: "page-001",
      workspace: workspaceRef()
    });

    expect(result.kind).toBe("failed");
    expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("claimed");
    expect(getRows(changeEntryTable)).toHaveLength(0);
    expect(changeSetRow()?.fields.change_set_revision).toBe(0);
  });

  it("does not proceed to change-set advancement when an earlier delete owner-scoped claim update fails", () => {
    seedWorkspaceFoundation();
    failNextClaimUpdateToPhase("removal_persisted");
    const result = createService().deletePage({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      pageSysId: "page-001",
      workspace: workspaceRef()
    });

    expect(result.kind).toBe("failed");
    expect(claimRow("change-set-001:0")?.fields.execution_phase).toBe("claimed");
    expect(getRows(removalBatchTable)).toHaveLength(1);
    expect(changeSetRow()?.fields.change_set_revision).toBe(0);
  });

  it("records claimed_on at claim acquisition time instead of owner expiration", () => {
    seedWorkspaceFoundation();
    expect(createService({
      currentTimestamp: () => "2026-07-18 00:02:03",
      failPhase: "mutation_claim_created"
    }).createPage({
      authority: { changeSetId: "change-set-001", changeSetRevision: 0 },
      parentPageSysId: null,
      title: "Claim timestamp",
      workspace: workspaceRef()
    }).kind).toBe("failed");

    expect(claimRow("change-set-001:0")?.fields.claimed_on).toBe("2026-07-18 00:02:03");
    expect(claimRow("change-set-001:0")?.fields.owner_expires_on).toBe("2026-07-18 00:02:33");
  });
});
