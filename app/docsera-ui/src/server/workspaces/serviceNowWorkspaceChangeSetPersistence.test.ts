import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

type TableRow = {
  sysId: string;
  fields: Record<string, unknown>;
};

const glideMock = vi.hoisted(() => {
  const tables = new Map<string, TableRow[]>();
  const fieldReadAccess = new Map<string, boolean>();
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
    private pendingQueries: Array<{ fieldName: string; value: unknown }> = [];
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

    addQuery(fieldName: string, value: unknown) {
      this.pendingQueries.push({ fieldName, value });
    }

    setLimit(limit: number) {
      this.limit = limit;
    }

    query() {
      const rows = tables.get(this.tableName) ?? [];
      const filtered = rows.filter((row) => this.pendingQueries.every(({ fieldName, value }) => matchField(row.fields[fieldName], value)));
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
      fieldReadAccess.clear();
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

function changeSetRow(changeSetId = "change-set-001") {
  return getRows(changeSetTable).find((row) => row.sysId === changeSetId);
}

function claimRow(generationKey: string) {
  return getRows(mutationClaimTable).find((row) => row.fields.generation_key === generationKey);
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

  it("preserves valid selected successor selectors and selected snapshot rows through ordinary listing and every mutation type", () => {
    const seeded = seedValidNonSeedSelectors();
    const service = createService();
    const snapshotRowsBefore = getRows(pageSnapshotTable)
      .filter((row) => row.fields.snapshot_set === seeded.selectedSnapshotSetId)
      .map((row) => ({ sysId: row.sysId, fields: { ...row.fields } }));

    const live = expectSucceeded(service.listPages(seeded.workspace, "live"));
    expect(live.pages.map((page) => page.draftTitle)).toEqual(["Selected Root", "Selected Child", "Selected Sibling"]);
    expectActiveSelectors(seeded.selectedChangeSetId, seeded.selectedSnapshotSetId);

    const edit = expectSucceeded(service.listPages(seeded.workspace, "edit"));
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

    const liveAfter = expectSucceeded(service.listPages(seeded.workspace, "live"));
    expect(liveAfter.pages.map((page) => page.draftTitle)).toEqual(["Selected Root", "Selected Child", "Selected Sibling"]);
    expectActiveSelectors(seeded.selectedChangeSetId, seeded.selectedSnapshotSetId);
    expect(getRows(workspaceTable)[0]?.fields.pending_change_set).not.toBe(seeded.seedChangeSetId);
    expect(getRows(workspaceTable)[0]?.fields.published_snapshot_set).not.toBe(seeded.seedSnapshotSetId);

    const snapshotRowsAfter = getRows(pageSnapshotTable)
      .filter((row) => row.fields.snapshot_set === seeded.selectedSnapshotSetId)
      .map((row) => ({ sysId: row.sysId, fields: { ...row.fields } }));
    expect(snapshotRowsAfter).toEqual(snapshotRowsBefore);
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
    const recovered = expectSucceeded(createService({ currentTimestamp: () => now }).savePageBody(input));
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
    expect(pendingRows(service)).toEqual([expect.objectContaining({ category: "Moved", pageSysId: "page-child" })]);
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
