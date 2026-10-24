import { GlideDateTime, GlideDigest, GlideRecord, GlideSecureRandomUtil, gs } from "@servicenow/glide";
import {
  createRemovalBatch,
  discardPageChanges,
  deriveChangeCategory,
  completeSnapshotStaging,
  movePage,
  pendingEntries,
  projectEdit,
  projectLive,
  recordPendingChange,
  stageSnapshotSet,
  switchSelectors,
  backfillWorkspaceFoundation,
  type ChangeSetToken,
  type DraftPage,
  type SnapshotPage,
  type WorkspaceChangeSetState
} from "./workspaceChangeSetDomain.ts";
import { DOCSERA_WORKSPACE_TABLE, type WorkspaceRecord } from "./serverWorkspaceDomain.ts";
import { mapWorkspaceRecord } from "./serviceNowWorkspaceRecords.ts";
import {
  DOCSERA_PAGE_TABLE,
  collectPageSubtreeSysIds,
  createPageDraft,
  hasPageDraftDifferencesFromPublished,
  normalizePageRecord,
  normalizeServiceNowBoolean,
  normalizeSiblingOrder,
  pickNextVisiblePageAfterDelete,
  type PageRecord
} from "../pages/serverPageDomain.ts";
import { mapPageRecord } from "../pages/serviceNowPageRecords.ts";
import { createEmptyServerDocumentEnvelope, extractPlainTextFromServerDocument, parseServerDocument } from "../pages/serverEditorDocument.ts";

declare const GlideRecordSecure: (new (tableName: string) => AclReadableRecord) | undefined;

const DOCSERA_WORKSPACE_CHANGE_SET_TABLE = "x_82900_docsera_workspace_change_set";
const DOCSERA_WORKSPACE_SNAPSHOT_SET_TABLE = "x_82900_docsera_workspace_snapshot_set";
const DOCSERA_WORKSPACE_PAGE_SNAPSHOT_TABLE = "x_82900_docsera_workspace_page_snapshot";
const DOCSERA_WORKSPACE_CHANGE_ENTRY_TABLE = "x_82900_docsera_workspace_change_entry";
const DOCSERA_WORKSPACE_REMOVAL_BATCH_TABLE = "x_82900_docsera_workspace_removal_batch";
const DOCSERA_WORKSPACE_REMOVAL_MEMBER_TABLE = "x_82900_docsera_workspace_removal_member";
const DOCSERA_WORKSPACE_MUTATION_CLAIM_TABLE = "x_82900_docsera_workspace_mutation_claim";

export type WorkspaceMutationAuthority = {
  changeSetId: string;
  changeSetRevision: number;
};

type WorkspaceMutationKind = "body" | "create" | "delete" | "discard_all" | "discard_page" | "move" | "publish" | "settings";
type WorkspaceMutationState = "claimed" | "applied" | "finalized" | "rolled_back";
type WorkspaceMutationPhase =
  | "claimed"
  | "page_persisted"
  | "entry_persisted"
  | "removal_persisted"
  | "change_set_advancing"
  | "change_set_persisted"
  | "result_persisted"
  | "finalized";

type WorkspaceMutationClaimPayload =
  | {
      kind: "body";
      pageSysId: string;
      draftContentJson: string;
      expectedRevision: number;
    }
  | {
      kind: "settings";
      pageSysId: string;
      slug: string;
      title: string;
    }
  | {
      kind: "create";
      parentPageSysId: string | null;
      title: string;
      pageSysId?: string;
    }
  | {
      kind: "delete";
      pageSysId: string;
      rootPageId: string;
      memberPageIds: string[];
      batchId?: string;
    }
  | {
      kind: "move";
      pageSysId: string;
      parentPageSysId: string | null;
      siblingOrder: string;
    }
  | {
      kind: "publish";
      commandId: string;
      snapshotSetSysId: string;
      snapshotKey: string;
      successorChangeSetSysId: string;
      successorGenerationKey: string;
    }
  | {
      kind: "discard_all";
      commandId: string;
      affectedPageCount: number;
      successorChangeSetSysId: string;
      successorGenerationKey: string;
    }
  | {
      kind: "discard_page";
      category: WorkspacePendingChangeCategory;
      pageSysId: string;
      affectedPageIds: string[];
      removalBatchId?: string;
    };

type WorkspaceMutationClaimRecord = {
  sysId: string;
  workspaceId: string;
  changeSetId: string;
  generationKey: string;
  mutationKey: string;
  kind: WorkspaceMutationKind;
  state: WorkspaceMutationState;
  ownerKey: string;
  ownerExpiresOn: string;
  claimedOn?: string;
  phase: WorkspaceMutationPhase;
  payload: WorkspaceMutationClaimPayload;
  resultAuthority?: WorkspaceMutationAuthority;
  resultJson?: string;
  targetNextPageSysId?: string;
  targetPageSysId?: string;
  targetRemovalBatchKey?: string;
  errorMessage?: string;
  appliedOn?: string;
  finalizedOn?: string;
};

type WorkspaceMutationAcquisition =
  | { kind: "execute"; claim: WorkspaceMutationClaimRecord; executorKey: string | null; recovered: boolean }
  | { kind: "replay"; claim: WorkspaceMutationClaimRecord; resultAuthority: WorkspaceMutationAuthority; resultJson: string }
  | { kind: "failed"; failure: WorkspaceMutationFailure };

export type WorkspaceChangeSetPersistenceFailurePhase =
  | "foundation_snapshot_set_created"
  | "foundation_snapshot_page_inserted"
  | "mutation_claim_created"
  | "mutation_page_persisted"
  | "mutation_entry_persisted"
  | "mutation_removal_persisted"
  | "mutation_change_set_row_updated"
  | "mutation_change_set_persisted"
  | "mutation_result_persisted"
  | "mutation_finalized"
  | "publish_snapshot_set_created"
  | "publish_snapshot_page_inserted"
  | "publish_snapshot_ready"
  | "publish_selector_switched"
  | "publish_page_rows_reconciled"
  | "discard_selector_switched"
  | "discard_page_rows_reconciled"
  | "discard_result_persisted";

type WorkspaceChangeSetPersistenceDependencies = {
  afterDurablePhase?: (
    phase: WorkspaceChangeSetPersistenceFailurePhase,
    context: { batchKey?: string; generationKey?: string; kind?: WorkspaceMutationKind; pageSysId?: string; snapshotPageKey?: string }
  ) => void;
  createDeterministicSysId: (seed: string) => string;
  currentTimestamp: () => string;
  currentUserSysId: () => string;
  digest: (value: string) => string;
  ownerTimeoutMs: number;
  randomKey: (prefix: string) => string;
};

export type WorkspaceProjectionFailure = {
  kind: "failed";
  errorMessage: string;
  status: 404 | 409 | 500;
};

export type WorkspaceProjectionSuccess = {
  kind: "succeeded";
  mode: "edit" | "live";
  pages: PageRecord[];
  state: WorkspaceChangeSetState;
  workspace: WorkspaceRecord;
};

export type WorkspaceProjectionResult = WorkspaceProjectionFailure | WorkspaceProjectionSuccess;

export type WorkspaceMutationFailure =
  | {
      kind: "failed";
      code?: "invalid" | "recovery_required" | "stale_generation" | "unsupported";
      affectedPageCount?: number;
      currentChangeSetId?: string;
      currentChangeSetRevision?: number;
      errorMessage: string;
      recoveryCommandId?: string;
      status: 400 | 404 | 409 | 500;
    }
  | {
      kind: "forbidden";
      errorMessage: string;
    };

export type WorkspaceMutationSuccess<T> = {
  authority: WorkspaceMutationAuthority;
  kind: "succeeded";
  result: T;
};

export type WorkspaceBodySaveResult = WorkspaceMutationSuccess<{ page: PageRecord }> | WorkspaceMutationFailure;
export type WorkspaceBodySaveRecoveryResult =
  | { kind: "already_resolved"; authority: WorkspaceMutationAuthority }
  | { kind: "executor_active"; authority: WorkspaceMutationAuthority }
  | { kind: "recovered"; authority: WorkspaceMutationAuthority }
  | { kind: "unsupported"; authority: WorkspaceMutationAuthority }
  | { kind: "failed"; authority: WorkspaceMutationAuthority; status: 409 | 500 };
export type WorkspaceSettingsSaveResult = WorkspaceMutationSuccess<{ page: PageRecord }> | WorkspaceMutationFailure;
export type WorkspaceCreateResult = WorkspaceMutationSuccess<{ page: PageRecord }> | WorkspaceMutationFailure;
export type WorkspaceDeleteResult = WorkspaceMutationSuccess<{ deletedPageSysId: string; nextPageSysId: string }> | WorkspaceMutationFailure;
export type WorkspaceMoveResult = WorkspaceMutationSuccess<{ pages: PageRecord[] }> | WorkspaceMutationFailure;
export type WorkspacePendingChangeCategory = "Added" | "Modified" | "Moved" | "Modified · Moved" | "Removed";
export type WorkspacePendingChangeRow = {
  attribution: {
    accessibleLabel: string;
    displayName: string;
    fullDisplayName: string;
  };
  category: WorkspacePendingChangeCategory;
  firstPendingSequence: number;
  lastChangedOn: string;
  navigable: boolean;
  pageSysId: string;
  title: string;
};

type AclReadableRecord = {
  canRead?: (fieldName?: string) => boolean;
  get: (fieldName: string, value: unknown) => boolean;
  getDisplayValue: (fieldName?: string) => unknown;
  getElement?: (fieldName: string) => { canRead?: () => boolean } | null;
  getValue: (fieldName: string) => unknown;
};
type WorkspacePageRecordLoadMode = "edit" | "foundation" | "live";
export type WorkspacePendingChangesReadModel = {
  affectedPageCount: number;
  changeSetId: string;
  changeSetRevision: number;
  rows: WorkspacePendingChangeRow[];
  workspaceSysId: string;
};
export type WorkspacePublishResult = WorkspaceMutationSuccess<{
  pages: PageRecord[];
  pendingChanges: WorkspacePendingChangesReadModel;
  publishedSnapshotSetId: string;
  workspaceStateRevision: number;
}> | WorkspaceMutationFailure;
export type WorkspaceDiscardAllResult = WorkspaceMutationSuccess<{
  pages: PageRecord[];
  pendingChanges: WorkspacePendingChangesReadModel;
  workspaceStateRevision: number;
}> | WorkspaceMutationFailure;
export type WorkspaceDiscardPageResult = WorkspaceMutationSuccess<{
  discardedPageSysId: string;
  pages: PageRecord[];
  pendingChanges: WorkspacePendingChangesReadModel;
  workspaceStateRevision: number;
}> | WorkspaceMutationFailure;
export type WorkspacePendingChangesResult =
  | { kind: "succeeded"; pending: WorkspacePendingChangesReadModel }
  | {
      kind: "failed";
      code?: "recovery_required";
      affectedPageCount?: number;
      currentChangeSetId?: string;
      currentChangeSetRevision?: number;
      errorMessage: string;
      recoveryCommandId?: string;
      status: 404 | 409 | 500;
    };

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function safeInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function parseTimestamp(value: string): number | null {
  const normalized = cleanText(value).replace(" ", "T");
  if (!normalized) {
    return null;
  }
  const withZone = normalized.endsWith("Z") ? normalized : `${normalized}Z`;
  const parsed = Date.parse(withZone);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatTimestamp(value: number): string {
  const date = new Date(value);
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  const second = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

function plusDuration(timestampValue: string, durationMs: number): string {
  const parsed = parseTimestamp(timestampValue);
  return parsed === null ? timestampValue : formatTimestamp(parsed + durationMs);
}

function stableSerialize(value: unknown): string {
  return JSON.stringify(sortForSerialization(value));
}

function sortForSerialization(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((entry) => sortForSerialization(entry));
  }
  if (!value || typeof value !== "object") {
    return value;
  }
  const candidate = value as Record<string, unknown>;
  return Object.keys(candidate)
    .sort((left, right) => left.localeCompare(right))
    .reduce<Record<string, unknown>>((result, key) => {
      result[key] = sortForSerialization(candidate[key]);
      return result;
    }, {});
}

function serializeDocument(value: unknown): string {
  return JSON.stringify(parseServerDocument(value ?? createEmptyServerDocumentEnvelope()));
}

function readBoolean(value: unknown, fallback = true): boolean {
  const text = cleanText(value).toLowerCase();
  if (text === "false" || text === "0") {
    return false;
  }
  if (text === "true" || text === "1") {
    return true;
  }
  return typeof value === "boolean" ? value : fallback;
}

function createDefaultDependencies(): WorkspaceChangeSetPersistenceDependencies {
  return {
    createDeterministicSysId(seed) {
      return new GlideDigest().getSHA256Hex(seed).slice(0, 32).toLowerCase();
    },
    currentTimestamp() {
      return new GlideDateTime().getValue();
    },
    currentUserSysId() {
      return cleanText(gs.getUserID()) || "system";
    },
    digest(value) {
      return new GlideDigest().getSHA256Hex(value).toUpperCase();
    },
    ownerTimeoutMs: 30_000,
    randomKey(prefix) {
      return `${prefix}-${GlideSecureRandomUtil.getSecureRandomString(24)}`;
    }
  };
}

function triggerDurablePhase(
  dependencies: WorkspaceChangeSetPersistenceDependencies,
  phase: WorkspaceChangeSetPersistenceFailurePhase,
  context: { batchKey?: string; generationKey?: string; kind?: WorkspaceMutationKind; pageSysId?: string; snapshotPageKey?: string }
) {
  dependencies.afterDurablePhase?.(phase, context);
}

function loadWorkspaceBySysId(workspaceSysId: string): WorkspaceRecord | null {
  const sysId = cleanText(workspaceSysId);
  if (!sysId) {
    return null;
  }
  const row = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
  if (!row.get("sys_id", sysId)) {
    return null;
  }
  return mapWorkspaceRecord(row);
}

function mapWorkspaceFoundationPageRecord(record: {
  getDisplayValue: (fieldName: string) => unknown;
  getUniqueValue: () => string;
  getValue: (fieldName: string) => unknown;
}): PageRecord {
  const publishedContentJson = cleanText(record.getValue("published_content_json"));
  const parsedPublishedContentJson = publishedContentJson ? parseServerDocument(publishedContentJson) : null;
  const publishedTitle = cleanText(record.getValue("published_title")) || null;
  const publishedSlug = cleanText(record.getValue("published_slug_normalized") || record.getValue("published_slug")) || null;
  const publishedBodyText = cleanText(record.getValue("published_body_text")) || null;

  return normalizePageRecord({
    sysId: cleanText(record.getUniqueValue()),
    workspaceSysId: cleanText(record.getValue("workspace")),
    parentPageSysId: cleanText(record.getValue("parent_page")) || null,
    siblingOrder: normalizeSiblingOrder(record.getValue("sibling_order")),
    draftTitle: cleanText(record.getValue("draft_title")) || publishedTitle || "",
    draftSlug: cleanText(record.getValue("draft_slug")) || publishedSlug || "",
    draftSlugNormalized: cleanText(record.getValue("draft_slug_normalized")) || publishedSlug || "",
    draftContentJson: parsedPublishedContentJson ?? createEmptyServerDocumentEnvelope(),
    draftRevision: safeInteger(record.getValue("draft_revision")) ?? 0,
    draftBodyText: cleanText(record.getValue("draft_body_text")) || publishedBodyText || null,
    publishedTitle,
    publishedSlug,
    publishedSlugNormalized: publishedSlug,
    publishedContentJson: parsedPublishedContentJson,
    publishedBodyText,
    publishedAt: cleanText(record.getDisplayValue("published_at")) || cleanText(record.getValue("published_at")) || null,
    publishedBySysId: cleanText(record.getValue("published_by")) || null,
    publishedByDisplayName: cleanText(record.getDisplayValue("published_by")) || null,
    publicationState: cleanText(record.getValue("publication_state")) || "draft",
    active: normalizeServiceNowBoolean(record.getValue("active"), true)
  });
}

function mapWorkspaceLivePageRecord(record: {
  getDisplayValue: (fieldName: string) => unknown;
  getUniqueValue: () => string;
  getValue: (fieldName: string) => unknown;
}): PageRecord {
  return normalizePageRecord({
    sysId: cleanText(record.getUniqueValue()),
    workspaceSysId: cleanText(record.getValue("workspace")),
    parentPageSysId: cleanText(record.getValue("parent_page")) || null,
    siblingOrder: normalizeSiblingOrder(record.getValue("sibling_order")),
    draftTitle: cleanText(record.getValue("draft_title")),
    draftSlug: cleanText(record.getValue("draft_slug")),
    draftSlugNormalized: cleanText(record.getValue("draft_slug_normalized")),
    draftContentJson: createEmptyServerDocumentEnvelope(),
    draftRevision: safeInteger(record.getValue("draft_revision")) ?? 0,
    draftBodyText: cleanText(record.getValue("draft_body_text")) || null,
    publishedTitle: cleanText(record.getValue("published_title")) || null,
    publishedSlug: cleanText(record.getValue("published_slug_normalized") || record.getValue("published_slug")) || null,
    publishedSlugNormalized: cleanText(record.getValue("published_slug_normalized") || record.getValue("published_slug")) || null,
    publishedContentJson: null,
    publishedBodyText: cleanText(record.getValue("published_body_text")) || null,
    publishedAt: cleanText(record.getDisplayValue("published_at")) || cleanText(record.getValue("published_at")) || null,
    publishedBySysId: cleanText(record.getValue("published_by")) || null,
    publishedByDisplayName: cleanText(record.getDisplayValue("published_by")) || null,
    publicationState: cleanText(record.getValue("publication_state")) || "draft",
    active: normalizeServiceNowBoolean(record.getValue("active"), true)
  });
}

function listWorkspacePageRecords(workspaceSysId: string, mode: WorkspacePageRecordLoadMode = "edit"): PageRecord[] {
  const rows = new GlideRecord(DOCSERA_PAGE_TABLE);
  rows.addQuery("workspace", workspaceSysId);
  rows.query();
  const results: PageRecord[] = [];
  while (rows.next()) {
    if (mode === "live") {
      results.push(mapWorkspaceLivePageRecord(rows));
      continue;
    }
    if (mode === "foundation") {
      results.push(mapWorkspaceFoundationPageRecord(rows));
      continue;
    }
    results.push(mapPageRecord(rows));
  }
  return results;
}

function buildSnapshotPageFromPublished(page: PageRecord): SnapshotPage | null {
  const pageId = cleanText(page.sysId);
  const publishedTitle = cleanText(page.publishedTitle);
  const publishedSlug = cleanText(page.publishedSlugNormalized || page.publishedSlug);
  if (!pageId || !publishedTitle || !publishedSlug || !page.publishedContentJson) {
    return null;
  }
  return {
    pageId,
    parentPageId: page.parentPageSysId,
    siblingOrder: String(page.siblingOrder),
    title: publishedTitle,
    slug: publishedSlug,
    contentJson: serializeDocument(page.publishedContentJson),
    bodyText: page.publishedBodyText,
    active: page.active
  };
}

function foundationKey(workspaceSysId: string, kind: "change-set" | "snapshot"): string {
  return `${cleanText(workspaceSysId)}:${kind}`;
}

function mutationGenerationRevision(generationKey: string): number {
  const delimiter = generationKey.lastIndexOf(":");
  const revision = safeInteger(delimiter >= 0 ? generationKey.slice(delimiter + 1) : "");
  if (revision === null) {
    throw new Error("Workspace mutation generation is invalid.");
  }
  return revision;
}

function preparedResultAuthority(claim: Pick<WorkspaceMutationClaimRecord, "changeSetId" | "generationKey">): WorkspaceMutationAuthority {
  return {
    changeSetId: cleanText(claim.changeSetId),
    changeSetRevision: mutationGenerationRevision(claim.generationKey) + 1
  };
}

function authorityMatchesOrExceeds(current: WorkspaceMutationAuthority, expected: WorkspaceMutationAuthority): boolean {
  return current.changeSetId === expected.changeSetId && current.changeSetRevision >= expected.changeSetRevision;
}

function loadMutationClaimByGeneration(generationKey: string): WorkspaceMutationClaimRecord | null {
  const rows = new GlideRecord(DOCSERA_WORKSPACE_MUTATION_CLAIM_TABLE);
  if (!rows.get("generation_key", generationKey)) {
    return null;
  }
  const payload = cleanText(rows.getValue("mutation_payload_json"));
  let parsedPayload: WorkspaceMutationClaimPayload | null = null;
  try {
    parsedPayload = payload ? (JSON.parse(payload) as WorkspaceMutationClaimPayload) : null;
  } catch {
    parsedPayload = null;
  }
  if (!parsedPayload) {
    return null;
  }
  return {
    sysId: cleanText(rows.getUniqueValue()),
    workspaceId: cleanText(rows.getValue("workspace")),
    changeSetId: cleanText(rows.getValue("change_set")),
    generationKey,
    mutationKey: cleanText(rows.getValue("mutation_key")),
    kind: cleanText(rows.getValue("mutation_kind")) as WorkspaceMutationKind,
    state: (cleanText(rows.getValue("mutation_state")) as WorkspaceMutationState) || "claimed",
    ownerKey: cleanText(rows.getValue("claim_owner_key")),
    ownerExpiresOn: cleanText(rows.getValue("owner_expires_on")),
    claimedOn: cleanText(rows.getValue("claimed_on")) || undefined,
    phase: (cleanText(rows.getValue("execution_phase")) as WorkspaceMutationPhase) || "claimed",
    payload: parsedPayload,
    resultAuthority:
      cleanText(rows.getValue("result_change_set")) && safeInteger(rows.getValue("result_change_set_revision")) !== null
        ? {
            changeSetId: cleanText(rows.getValue("result_change_set")),
            changeSetRevision: safeInteger(rows.getValue("result_change_set_revision")) ?? 0
          }
        : undefined,
    resultJson: cleanText(rows.getValue("mutation_result_json")) || undefined,
    targetPageSysId: cleanText(rows.getValue("target_page_sys_id")) || undefined,
    targetNextPageSysId: cleanText(rows.getValue("target_next_page_sys_id")) || undefined,
    targetRemovalBatchKey: cleanText(rows.getValue("target_removal_batch_key")) || undefined,
    errorMessage: cleanText(rows.getValue("error_message")) || undefined,
    appliedOn: cleanText(rows.getValue("applied_on")) || undefined,
    finalizedOn: cleanText(rows.getValue("finalized_on")) || undefined
  };
}

function writeMutationClaimRow(row: GlideRecord<typeof DOCSERA_WORKSPACE_MUTATION_CLAIM_TABLE>, input: WorkspaceMutationClaimRecord) {
  row.setValue("workspace", input.workspaceId);
  row.setValue("change_set", input.changeSetId);
  row.setValue("generation_key", input.generationKey);
  row.setValue("mutation_key", input.mutationKey);
  row.setValue("mutation_kind", input.kind);
  row.setValue("mutation_state", input.state);
  row.setValue("claim_owner_key", input.ownerKey);
  row.setValue("owner_expires_on", input.ownerExpiresOn);
  row.setValue("execution_phase", input.phase);
  row.setValue("mutation_payload_json", stableSerialize(input.payload));
  row.setValue("claimed_on", input.claimedOn ?? cleanText(row.getValue("claimed_on")) ?? "");
  row.setValue("target_page_sys_id", input.targetPageSysId ?? "");
  row.setValue("target_next_page_sys_id", input.targetNextPageSysId ?? "");
  row.setValue("target_removal_batch_key", input.targetRemovalBatchKey ?? "");
  row.setValue("result_change_set", input.resultAuthority?.changeSetId ?? "");
  row.setValue("result_change_set_revision", input.resultAuthority?.changeSetRevision ?? "");
  row.setValue("mutation_result_json", input.resultJson ?? "");
  row.setValue("error_message", input.errorMessage ?? "");
  row.setValue("applied_on", input.appliedOn ?? "");
  row.setValue("finalized_on", input.finalizedOn ?? "");
}

function insertMutationClaimRow(input: WorkspaceMutationClaimRecord): "created" | "conflict" {
  const row = new GlideRecord(DOCSERA_WORKSPACE_MUTATION_CLAIM_TABLE);
  row.initialize();
  writeMutationClaimRow(row, input);
  row.setValue("claimed_on", input.claimedOn ?? input.appliedOn ?? input.finalizedOn ?? "");
  try {
    return row.insert() ? "created" : "conflict";
  } catch {
    return "conflict";
  }
}

function tryUpdateMutationClaimRow(
  input: WorkspaceMutationClaimRecord,
  expected?: Partial<Pick<WorkspaceMutationClaimRecord, "ownerKey" | "phase" | "state">>
): boolean {
  const row = new GlideRecord(DOCSERA_WORKSPACE_MUTATION_CLAIM_TABLE);
  row.addQuery("generation_key", input.generationKey);
  if (expected?.ownerKey) {
    row.addQuery("claim_owner_key", expected.ownerKey);
  }
  if (expected?.phase) {
    row.addQuery("execution_phase", expected.phase);
  }
  if (expected?.state) {
    row.addQuery("mutation_state", expected.state);
  }
  row.query();
  if (!row.next()) {
    return false;
  }
  const claimedOn = cleanText(row.getValue("claimed_on"));
  writeMutationClaimRow(row, input);
  row.setValue("claimed_on", claimedOn || input.appliedOn || input.finalizedOn || input.ownerExpiresOn);
  return Boolean(row.update());
}

function mutationAuthoritiesMatch(left: WorkspaceMutationAuthority | undefined, right: WorkspaceMutationAuthority | undefined): boolean {
  if (!left || !right) {
    return !left && !right;
  }
  return left.changeSetId === right.changeSetId && left.changeSetRevision === right.changeSetRevision;
}

function mutationClaimAlreadyRepresents(input: WorkspaceMutationClaimRecord, reloaded: WorkspaceMutationClaimRecord): boolean {
  return (
    reloaded.workspaceId === input.workspaceId &&
    reloaded.changeSetId === input.changeSetId &&
    reloaded.generationKey === input.generationKey &&
    reloaded.mutationKey === input.mutationKey &&
    reloaded.kind === input.kind &&
    reloaded.state === input.state &&
    reloaded.ownerKey === input.ownerKey &&
    reloaded.phase === input.phase &&
    stableSerialize(reloaded.payload) === stableSerialize(input.payload) &&
    mutationAuthoritiesMatch(reloaded.resultAuthority, input.resultAuthority) &&
    cleanText(reloaded.resultJson) === cleanText(input.resultJson) &&
    cleanText(reloaded.targetPageSysId) === cleanText(input.targetPageSysId) &&
    cleanText(reloaded.targetNextPageSysId) === cleanText(input.targetNextPageSysId) &&
    cleanText(reloaded.targetRemovalBatchKey) === cleanText(input.targetRemovalBatchKey) &&
    cleanText(reloaded.appliedOn) === cleanText(input.appliedOn) &&
    cleanText(reloaded.finalizedOn) === cleanText(input.finalizedOn)
  );
}

function updateMutationClaimRow(
  input: WorkspaceMutationClaimRecord,
  expected?: Partial<Pick<WorkspaceMutationClaimRecord, "ownerKey" | "phase" | "state">>
) {
  if (tryUpdateMutationClaimRow(input, expected)) {
    return;
  }
  const reloaded = loadMutationClaimByGeneration(input.generationKey);
  if (!reloaded) {
    throw new Error("Workspace mutation claim could not be reloaded.");
  }
  if (reloaded.mutationKey !== input.mutationKey) {
    throw new Error("Workspace mutation claim no longer matches this mutation.");
  }
  if (mutationClaimAlreadyRepresents(input, reloaded)) {
    return;
  }
  throw new Error("Workspace mutation claim could not be updated.");
}

function updateOwnedMutationClaimRow(
  input: WorkspaceMutationClaimRecord,
  ownerKey: string,
  fallbackMessage: string
): WorkspaceMutationClaimRecord {
  if (tryUpdateMutationClaimRow(input, { ownerKey })) {
    return input;
  }
  const reloaded = loadMutationClaimByGeneration(input.generationKey);
  if (reloaded && mutationClaimAlreadyRepresents(input, reloaded)) {
    return reloaded;
  }
  throw new Error(fallbackMessage);
}

function updateReplayableMutationClaimRow(
  input: WorkspaceMutationClaimRecord,
  prior: WorkspaceMutationClaimRecord,
  fallbackMessage: string
): WorkspaceMutationClaimRecord {
  if (tryUpdateMutationClaimRow(input, { phase: prior.phase, state: prior.state })) {
    return input;
  }
  const reloaded = loadMutationClaimByGeneration(input.generationKey);
  if (!reloaded || reloaded.mutationKey !== input.mutationKey) {
    throw new Error(fallbackMessage);
  }
  if (mutationClaimAlreadyRepresents(input, reloaded)) {
    return reloaded;
  }
  if (
    reloaded.state === "finalized" &&
    reloaded.phase === "finalized" &&
    reloaded.resultAuthority &&
    reloaded.resultJson
  ) {
    return reloaded;
  }
  throw new Error(fallbackMessage);
}

function requireClaimOwner(claim: WorkspaceMutationClaimRecord, executorKey: string | null): WorkspaceMutationClaimRecord {
  if (!executorKey) {
    return claim;
  }
  const current = loadMutationClaimByGeneration(claim.generationKey);
  if (!current) {
    throw new Error("Workspace mutation claim could not be reloaded.");
  }
  if (current.mutationKey !== claim.mutationKey) {
    throw new Error("Workspace mutation claim no longer matches this mutation.");
  }
  if (current.state !== "finalized" && current.ownerKey !== executorKey) {
    throw new Error("Workspace mutation claim ownership was lost.");
  }
  return current;
}

function requireDurableChangeSetAdvancingMarker(
  claim: WorkspaceMutationClaimRecord,
  executorKey: string | null,
  resultJson: string
): WorkspaceMutationClaimRecord {
  if (!executorKey) {
    throw new Error("Workspace mutation claim ownership was lost.");
  }
  const current = loadMutationClaimByGeneration(claim.generationKey);
  if (
    !current ||
    current.ownerKey !== executorKey ||
    current.changeSetId !== claim.changeSetId ||
    current.generationKey !== claim.generationKey ||
    current.mutationKey !== claim.mutationKey ||
    current.phase !== "change_set_advancing" ||
    current.resultJson !== resultJson ||
    current.resultAuthority ||
    current.targetPageSysId !== claim.targetPageSysId ||
    current.targetNextPageSysId !== claim.targetNextPageSysId ||
    current.targetRemovalBatchKey !== claim.targetRemovalBatchKey
  ) {
    throw new Error("Workspace mutation claim change-set advance marker was not persisted.");
  }
  return current;
}

function buildMutationGenerationKey(authority: WorkspaceMutationAuthority): string {
  return `${cleanText(authority.changeSetId)}:${String(authority.changeSetRevision)}`;
}

function buildMutationKey(
  dependencies: WorkspaceChangeSetPersistenceDependencies,
  authority: WorkspaceMutationAuthority,
  kind: WorkspaceMutationKind,
  payload: WorkspaceMutationClaimPayload
): string {
  return dependencies.digest(`${kind}\n${buildMutationGenerationKey(authority)}\n${stableSerialize(payload)}`);
}

function claimOwnerExpired(claim: WorkspaceMutationClaimRecord, now: string): boolean {
  const expiresOn = parseTimestamp(claim.ownerExpiresOn);
  const current = parseTimestamp(now);
  return expiresOn !== null && current !== null ? expiresOn <= current : true;
}

function inProgressFailure(current: WorkspaceMutationAuthority): WorkspaceMutationFailure {
  return {
    kind: "failed",
    code: "invalid",
    currentChangeSetId: current.changeSetId,
    currentChangeSetRevision: current.changeSetRevision,
    errorMessage: "This draft mutation is already in progress. Retry after the current request finishes.",
    status: 409
  };
}

function replayClaim(claim: WorkspaceMutationClaimRecord): WorkspaceMutationAcquisition {
  if (!claim.resultAuthority || !claim.resultJson) {
    return {
      kind: "failed",
      failure: {
        kind: "failed",
        errorMessage: "The previous mutation result could not be recovered.",
        status: 500
      }
    };
  }
  return {
    kind: "replay",
    claim,
    resultAuthority: claim.resultAuthority,
    resultJson: claim.resultJson
  };
}

function persistClaimProgress(
  dependencies: WorkspaceChangeSetPersistenceDependencies,
  claim: WorkspaceMutationClaimRecord,
  input: Partial<Pick<WorkspaceMutationClaimRecord, "appliedOn" | "errorMessage" | "phase" | "resultAuthority" | "resultJson" | "state">>,
  executorKey: string | null
): WorkspaceMutationClaimRecord {
  const next: WorkspaceMutationClaimRecord = {
    ...claim,
    ...input,
    ownerExpiresOn: executorKey ? plusDuration(dependencies.currentTimestamp(), dependencies.ownerTimeoutMs) : claim.ownerExpiresOn
  };
  return executorKey
    ? updateOwnedMutationClaimRow(next, executorKey, "Workspace mutation claim ownership was lost.")
    : updateReplayableMutationClaimRow(next, claim, "Workspace mutation claim replay could not be persisted.");
}

function finalizeMutationClaim(
  dependencies: WorkspaceChangeSetPersistenceDependencies,
  claim: WorkspaceMutationClaimRecord,
  resultAuthority: WorkspaceMutationAuthority,
  result: unknown,
  executorKey: string | null
): WorkspaceMutationClaimRecord {
  const now = dependencies.currentTimestamp();
  const next: WorkspaceMutationClaimRecord = {
    ...claim,
    state: "finalized",
    phase: "finalized",
    resultAuthority,
    resultJson: stableSerialize(result),
    appliedOn: claim.appliedOn ?? now,
    finalizedOn: now,
    errorMessage: undefined,
    ownerExpiresOn: executorKey ? plusDuration(now, dependencies.ownerTimeoutMs) : claim.ownerExpiresOn
  };
  return executorKey
    ? updateOwnedMutationClaimRow(next, executorKey, "Workspace mutation claim ownership was lost.")
    : updateReplayableMutationClaimRow(next, claim, "Workspace mutation claim replay could not be finalized.");
}

function recoverMutationClaimOwner(
  dependencies: WorkspaceChangeSetPersistenceDependencies,
  claim: WorkspaceMutationClaimRecord
): WorkspaceMutationClaimRecord | null {
  const ownerKey = dependencies.randomKey("mutation-owner");
  const recovered: WorkspaceMutationClaimRecord = {
    ...claim,
    ownerKey,
    ownerExpiresOn: plusDuration(dependencies.currentTimestamp(), dependencies.ownerTimeoutMs),
    errorMessage: undefined
  };
  if (
    !tryUpdateMutationClaimRow(recovered, {
      ownerKey: claim.ownerKey,
      phase: claim.phase,
      state: claim.state
    })
  ) {
    return null;
  }
  const reloaded = loadMutationClaimByGeneration(claim.generationKey);
  return reloaded && reloaded.ownerKey === ownerKey ? reloaded : null;
}

function createClaimResult(
  claim: WorkspaceMutationClaimRecord,
  resultAuthority: WorkspaceMutationAuthority,
  result: unknown
): WorkspaceMutationAcquisition {
  return {
    kind: "replay",
    claim,
    resultAuthority,
    resultJson: stableSerialize(result)
  };
}

function isMutationFailure(value: WorkspaceMutationAcquisition): value is Extract<WorkspaceMutationAcquisition, { kind: "failed" }> {
  return value.kind === "failed";
}

function acquireMutationClaim(
  dependencies: WorkspaceChangeSetPersistenceDependencies,
  state: WorkspaceChangeSetState,
  claim: WorkspaceMutationClaimRecord
): WorkspaceMutationAcquisition {
  const current = nextAuthority(state);
  const existing = loadMutationClaimByGeneration(claim.generationKey);
  if (existing) {
    if (existing.mutationKey !== claim.mutationKey) {
      return { kind: "failed", failure: staleFailure(current) };
    }
    if (existing.state === "finalized" || existing.phase === "finalized") {
      return replayClaim(existing);
    }
    if (existing.phase === "change_set_persisted" && existing.resultAuthority && existing.resultJson) {
      return { kind: "execute", claim: existing, executorKey: null, recovered: true };
    }
    if (existing.phase === "result_persisted" && existing.resultAuthority && existing.resultJson) {
      return { kind: "execute", claim: existing, executorKey: null, recovered: true };
    }
    if (current.changeSetId !== claim.changeSetId || current.changeSetRevision !== safeInteger(claim.generationKey.split(":")[1])!) {
      if (
        existing.phase === "change_set_advancing" ||
        existing.phase === "change_set_persisted" ||
        existing.phase === "result_persisted" ||
        existing.resultAuthority
      ) {
        return { kind: "execute", claim: existing, executorKey: null, recovered: true };
      }
      return { kind: "failed", failure: staleFailure(current) };
    }
    if (!claimOwnerExpired(existing, dependencies.currentTimestamp())) {
      return { kind: "failed", failure: inProgressFailure(current) };
    }
    const recovered = recoverMutationClaimOwner(dependencies, existing);
    if (recovered && recovered.ownerKey !== existing.ownerKey) {
      return { kind: "execute", claim: recovered, executorKey: recovered.ownerKey, recovered: true };
    }
    return { kind: "failed", failure: inProgressFailure(current) };
  }
  if (claim.changeSetId !== current.changeSetId || safeInteger(claim.generationKey.split(":")[1]) !== current.changeSetRevision) {
    return { kind: "failed", failure: staleFailure(current) };
  }
  if (insertMutationClaimRow(claim) === "created") {
    triggerDurablePhase(dependencies, "mutation_claim_created", {
      generationKey: claim.generationKey,
      kind: claim.kind,
      pageSysId: claim.targetPageSysId
    });
    return { kind: "execute", claim, executorKey: claim.ownerKey, recovered: false };
  }
  const winner = loadMutationClaimByGeneration(claim.generationKey);
  if (!winner) {
    return {
      kind: "failed",
      failure: {
        kind: "failed",
        errorMessage: "The winning draft mutation claim could not be reloaded.",
        status: 500
      }
    };
  }
  if (winner.mutationKey !== claim.mutationKey) {
    return { kind: "failed", failure: staleFailure(current) };
  }
  if (winner.state === "finalized" || winner.phase === "finalized" || (winner.resultAuthority && winner.resultJson)) {
    return replayClaim(winner);
  }
  return { kind: "failed", failure: inProgressFailure(current) };
}

function validateSnapshotPages(pages: SnapshotPage[]) {
  const ids = new Set<string>();
  for (const page of pages) {
    const pageId = cleanText(page.pageId);
    if (!pageId || ids.has(pageId)) {
      throw new Error("Workspace foundation is ambiguous.");
    }
    ids.add(pageId);
  }
  for (const page of pages) {
    if (page.parentPageId && !ids.has(page.parentPageId)) {
      throw new Error("Workspace foundation is invalid.");
    }
  }
}

function loadFoundationChangeSet(
  workspaceSysId: string,
  changeSetSysId: string
): { commandCorrelationId: string; nextPendingSequence: number; recoveryState: string; revision: number; sysId: string } | null {
  const sysId = cleanText(changeSetSysId);
  if (!sysId) {
    return null;
  }
  const row = new GlideRecord(DOCSERA_WORKSPACE_CHANGE_SET_TABLE);
  if (!row.get("sys_id", sysId)) {
    return null;
  }
  const revision = safeInteger(row.getValue("change_set_revision"));
  const nextPendingSequence = safeInteger(row.getValue("next_pending_sequence"));
  if (
    cleanText(row.getValue("workspace")) !== workspaceSysId ||
    cleanText(row.getValue("lifecycle_state")) !== "active" ||
    revision === null ||
    nextPendingSequence === null
  ) {
    return null;
  }
  return {
    commandCorrelationId: cleanText(row.getValue("command_correlation_id")),
    sysId,
    revision,
    nextPendingSequence,
    recoveryState: cleanText(row.getValue("recovery_state")) || "none"
  };
}

function loadFoundationSnapshot(workspaceSysId: string, snapshotSysId: string): { pages: SnapshotPage[]; readiness: string; sysId: string } | null {
  const sysId = cleanText(snapshotSysId);
  if (!sysId) {
    return null;
  }
  const row = new GlideRecord(DOCSERA_WORKSPACE_SNAPSHOT_SET_TABLE);
  if (!row.get("sys_id", sysId)) {
    return null;
  }
  const readiness = cleanText(row.getValue("readiness_state"));
  if (cleanText(row.getValue("workspace")) !== workspaceSysId) {
    return null;
  }
  const pages = loadSnapshotPages(sysId);
  validateSnapshotPages(pages);
  return { sysId, readiness, pages };
}

function setFoundationRecoveryState(changeSetSysId: string, recoveryState: string) {
  const row = new GlideRecord(DOCSERA_WORKSPACE_CHANGE_SET_TABLE);
  if (!row.get("sys_id", changeSetSysId)) {
    throw new Error("Workspace foundation is invalid.");
  }
  row.setValue("recovery_state", recoveryState);
  if (!row.update()) {
    throw new Error("Workspace foundation could not update recovery state.");
  }
}

function updateWorkspaceSelectors(
  workspace: WorkspaceRecord,
  changeSetSysId: string,
  snapshotSysId: string
): WorkspaceRecord {
  const workspaceSysId = cleanText(workspace.sysId);
  const workspaceRow = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
  if (!workspaceRow.get("sys_id", workspaceSysId)) {
    throw new Error("Workspace could not be reloaded.");
  }
  workspaceRow.setValue("pending_change_set", changeSetSysId);
  workspaceRow.setValue("published_snapshot_set", snapshotSysId);
  workspaceRow.setValue("workspace_state_revision", typeof workspace.workspaceStateRevision === "number" ? workspace.workspaceStateRevision : 0);
  if (!workspaceRow.update()) {
    throw new Error("Workspace foundation could not update selectors.");
  }
  const reloaded = loadWorkspaceBySysId(workspaceSysId);
  if (!reloaded) {
    throw new Error("Workspace could not be reloaded.");
  }
  return reloaded;
}

function ensureWorkspaceFoundation(workspace: WorkspaceRecord, pages: PageRecord[], dependencies: WorkspaceChangeSetPersistenceDependencies, selectedSnapshotCache: { pages?: SnapshotPage[] }): WorkspaceRecord {
  const workspaceSysId = cleanText(workspace.sysId);
  if (!workspaceSysId) {
    throw new Error("Workspace could not be found.");
  }
  const selectedChangeSetSysId = cleanText(workspace.pendingChangeSetSysId);
  const selectedSnapshotSysId = cleanText(workspace.publishedSnapshotSetSysId);
  const selectedChangeSet = loadFoundationChangeSet(workspaceSysId, selectedChangeSetSysId);
  const selectedSnapshot = loadFoundationSnapshot(workspaceSysId, selectedSnapshotSysId);
  if (selectedChangeSetSysId || selectedSnapshotSysId) {
    if (!selectedChangeSetSysId || !selectedSnapshotSysId || !selectedChangeSet || !selectedSnapshot || selectedSnapshot.readiness !== "ready") {
      throw new Error("Workspace foundation is invalid.");
    }
    selectedSnapshotCache.pages = selectedSnapshot.pages;
    return workspace;
  }
  const snapshotKey = foundationKey(workspaceSysId, "snapshot");
  const changeSetKey = foundationKey(workspaceSysId, "change-set");
  const expectedSnapshotPages = pages.map(buildSnapshotPageFromPublished).filter((page): page is SnapshotPage => page !== null);

  const changeSetRows = new GlideRecord(DOCSERA_WORKSPACE_CHANGE_SET_TABLE);
  changeSetRows.addQuery("generation_key", changeSetKey);
  changeSetRows.query();
  const changeSetIds: string[] = [];
  while (changeSetRows.next()) {
    changeSetIds.push(cleanText(changeSetRows.getUniqueValue()));
  }
  if (changeSetIds.length > 1) {
    throw new Error("Workspace foundation is ambiguous.");
  }

  let changeSetSysId = changeSetIds[0] ?? "";
  if (!changeSetSysId) {
    const changeSet = new GlideRecord(DOCSERA_WORKSPACE_CHANGE_SET_TABLE);
    changeSet.initialize();
    changeSet.setValue("workspace", workspaceSysId);
    changeSet.setValue("generation_key", changeSetKey);
    changeSet.setValue("change_set_revision", 0);
    changeSet.setValue("next_pending_sequence", 1);
    changeSet.setValue("lifecycle_state", "active");
    changeSet.setValue("recovery_state", "foundation_recovery");
    changeSetSysId = cleanText(changeSet.insert());
    if (!changeSetSysId) {
      throw new Error("Workspace foundation could not create the initial change set.");
    }
  }

  const snapshotRows = new GlideRecord(DOCSERA_WORKSPACE_SNAPSHOT_SET_TABLE);
  snapshotRows.addQuery("snapshot_key", snapshotKey);
  snapshotRows.query();
  const snapshotIds: string[] = [];
  while (snapshotRows.next()) {
    snapshotIds.push(cleanText(snapshotRows.getUniqueValue()));
  }
  if (snapshotIds.length > 1) {
    throw new Error("Workspace foundation is ambiguous.");
  }

  let snapshotSysId = snapshotIds[0] ?? "";
  if (!snapshotSysId) {
    const snapshot = new GlideRecord(DOCSERA_WORKSPACE_SNAPSHOT_SET_TABLE);
    snapshot.initialize();
    snapshot.setValue("workspace", workspaceSysId);
    snapshot.setValue("snapshot_key", snapshotKey);
    snapshot.setValue("readiness_state", "staging");
    snapshotSysId = cleanText(snapshot.insert());
    if (!snapshotSysId) {
      throw new Error("Workspace foundation could not create the initial snapshot.");
    }
    triggerDurablePhase(dependencies, "foundation_snapshot_set_created", { snapshotPageKey: snapshotKey });
  }

  const activeChangeSet = loadFoundationChangeSet(workspaceSysId, changeSetSysId);
  if (!activeChangeSet) {
    throw new Error("Workspace foundation is invalid.");
  }
  const snapshotCandidate = loadFoundationSnapshot(workspaceSysId, snapshotSysId);
  if (!snapshotCandidate) {
    throw new Error("Workspace foundation is invalid.");
  }
  if (snapshotCandidate.readiness === "ready") {
    return updateWorkspaceSelectors(workspace, activeChangeSet.sysId, snapshotCandidate.sysId);
  }
  if (snapshotCandidate.readiness !== "staging" && activeChangeSet.recoveryState !== "foundation_recovery") {
    throw new Error("Workspace foundation is invalid.");
  }
  setFoundationRecoveryState(activeChangeSet.sysId, "foundation_recovery");

  const snapshotSetRow = new GlideRecord(DOCSERA_WORKSPACE_SNAPSHOT_SET_TABLE);
  if (!snapshotSetRow.get("sys_id", snapshotSysId) || cleanText(snapshotSetRow.getValue("workspace")) !== workspaceSysId) {
    throw new Error("Workspace foundation is invalid.");
  }

  const seenSnapshotKeys = new Set<string>();
  const seenSnapshotPageIds = new Set<string>();
  const existingSnapshotRows = new GlideRecord(DOCSERA_WORKSPACE_PAGE_SNAPSHOT_TABLE);
  existingSnapshotRows.addQuery("snapshot_set", snapshotSysId);
  existingSnapshotRows.query();
  while (existingSnapshotRows.next()) {
    const pageId = cleanText(existingSnapshotRows.getValue("page"));
    const snapshotPageKey = cleanText(existingSnapshotRows.getValue("snapshot_page_key"));
    if (!snapshotPageKey || seenSnapshotKeys.has(snapshotPageKey) || seenSnapshotPageIds.has(pageId)) {
      throw new Error("Workspace foundation is ambiguous.");
    }
    seenSnapshotKeys.add(snapshotPageKey);
    seenSnapshotPageIds.add(pageId);
  }

  for (const page of expectedSnapshotPages) {
    const snapshotPageKey = `${snapshotSysId}:${page.pageId}`;
    const row = new GlideRecord(DOCSERA_WORKSPACE_PAGE_SNAPSHOT_TABLE);
    if (!row.get("snapshot_page_key", snapshotPageKey)) {
      row.initialize();
      row.setValue("snapshot_set", snapshotSysId);
      row.setValue("page", page.pageId);
      row.setValue("snapshot_page_key", snapshotPageKey);
      row.setValue("parent_page", page.parentPageId ?? "");
      row.setValue("sibling_order", page.siblingOrder);
      row.setValue("title", page.title);
      row.setValue("slug", page.slug);
      row.setValue("slug_normalized", page.slug);
      row.setValue("content_json", page.contentJson);
      row.setValue("body_text", page.bodyText ?? "");
      row.setValue("active", page.active);
      if (!row.insert()) {
        throw new Error("Workspace foundation could not create snapshot pages.");
      }
      triggerDurablePhase(dependencies, "foundation_snapshot_page_inserted", { pageSysId: page.pageId, snapshotPageKey });
      continue;
    }
    if (cleanText(row.getValue("snapshot_set")) !== snapshotSysId || cleanText(row.getValue("page")) !== page.pageId) {
      throw new Error("Workspace foundation is ambiguous.");
    }
  }

  const expectedSnapshotKeys = new Set(expectedSnapshotPages.map((page) => `${snapshotSysId}:${page.pageId}`));
  const validatedSnapshotRows = new GlideRecord(DOCSERA_WORKSPACE_PAGE_SNAPSHOT_TABLE);
  validatedSnapshotRows.addQuery("snapshot_set", snapshotSysId);
  validatedSnapshotRows.query();
  while (validatedSnapshotRows.next()) {
    if (!expectedSnapshotKeys.has(cleanText(validatedSnapshotRows.getValue("snapshot_page_key")))) {
      throw new Error("Workspace foundation is ambiguous.");
    }
  }

  snapshotSetRow.setValue("readiness_state", "ready");
  if (!snapshotSetRow.update()) {
    throw new Error("Workspace foundation could not finalize the initial snapshot.");
  }
  setFoundationRecoveryState(changeSetSysId, "none");
  return updateWorkspaceSelectors(workspace, changeSetSysId, snapshotSysId);
}

function loadSnapshotPages(snapshotSetSysId: string): SnapshotPage[] {
  const rows = new GlideRecord(DOCSERA_WORKSPACE_PAGE_SNAPSHOT_TABLE);
  rows.addQuery("snapshot_set", snapshotSetSysId);
  rows.query();
  const results: SnapshotPage[] = [];
  while (rows.next()) {
    results.push({
      pageId: cleanText(rows.getValue("page")),
      parentPageId: cleanText(rows.getValue("parent_page")) || null,
      siblingOrder: cleanText(rows.getValue("sibling_order")),
      title: cleanText(rows.getValue("title")),
      slug: cleanText(rows.getValue("slug_normalized")) || cleanText(rows.getValue("slug")),
      contentJson: cleanText(rows.getValue("content_json")),
      bodyText: cleanText(rows.getValue("body_text")) || null,
      active: readBoolean(rows.getValue("active"), true)
    });
  }
  return results;
}

function retainedDraftPageIdsForClaim(claim: WorkspaceMutationClaimRecord | null): Set<string> {
  if (!claim) {
    return new Set();
  }
  if (claim.kind === "delete" && claim.payload.kind === "delete") {
    return new Set([cleanText(claim.targetPageSysId), ...claim.payload.memberPageIds.map((pageId) => cleanText(pageId))].filter(Boolean));
  }
  if (claim.kind === "discard_page" && claim.payload.kind === "discard_page") {
    return new Set([cleanText(claim.targetPageSysId), ...claim.payload.affectedPageIds.map((pageId) => cleanText(pageId))].filter(Boolean));
  }
  if (claim.kind === "publish" || claim.kind === "discard_all") {
    return new Set();
  }
  if (claim.kind === "create" && claim.payload.kind === "create") {
    return new Set([cleanText(claim.targetPageSysId), cleanText(claim.payload.pageSysId)].filter(Boolean));
  }
  return new Set([cleanText(claim.targetPageSysId)].filter(Boolean));
}

function buildDraftPages(pageRecords: PageRecord[], snapshotPages: SnapshotPage[], retainedPageIds: Set<string>): DraftPage[] {
  const snapshotById = new Map(snapshotPages.map((page) => [page.pageId, page]));
  const results: DraftPage[] = [];
  for (const page of pageRecords) {
    const pageId = cleanText(page.sysId);
    if (!pageId) {
      continue;
    }
    const selectedSnapshot = snapshotById.get(pageId) ?? null;
    const hasPublishedIdentity = Boolean(selectedSnapshot);
    if (!hasPublishedIdentity && (cleanText(page.publishedTitle) || cleanText(page.publishedSlug) || page.publishedContentJson)) {
      throw new Error(`Legacy draft overlay references unpublished page ${pageId}.`);
    }
    if (hasPublishedIdentity) {
      if (!retainedPageIds.has(pageId)) {
        // The old comparison parsed the snapshot only after these metadata checks.
        // Keep that validation boundary even though its comparison result is discarded.
        if (page.parentPageSysId === selectedSnapshot.parentPageId &&
            String(page.siblingOrder) === selectedSnapshot.siblingOrder) {
          parseServerDocument(selectedSnapshot.contentJson ?? createEmptyServerDocumentEnvelope());
        }
        continue;
      }
      const changed = page.parentPageSysId !== selectedSnapshot.parentPageId ||
        String(page.siblingOrder) !== selectedSnapshot.siblingOrder ||
        hasPageDraftDifferencesFromPublished({
        draftTitle: page.draftTitle,
        draftSlug: page.draftSlug,
        draftSlugNormalized: page.draftSlugNormalized,
        draftContentJson: page.draftContentJson,
        publishedTitle: selectedSnapshot?.title ?? "",
        publishedSlug: selectedSnapshot?.slug ?? "",
        publishedSlugNormalized: selectedSnapshot?.slug ?? "",
        publishedContentJson: parseServerDocument(selectedSnapshot?.contentJson ?? createEmptyServerDocumentEnvelope()),
        publishedBodyText: selectedSnapshot?.bodyText ?? null
      });
      if (!changed) {
        continue;
      }
    }
    if (!hasPublishedIdentity && (page.active === false || !retainedPageIds.has(pageId))) {
      continue;
    }
    results.push({
      pageId,
      hasPublishedIdentity,
      parentPageId: page.parentPageSysId,
      siblingOrder: String(page.siblingOrder),
      title: cleanText(page.draftTitle),
      slug: cleanText(page.draftSlugNormalized || page.draftSlug),
      contentJson: serializeDocument(page.draftContentJson),
      bodyText: extractPlainTextFromServerDocument(page.draftContentJson) || null,
      active: page.active
    });
  }
  return results;
}

function loadWorkspaceState(
  workspaceInput: WorkspaceRecord,
  dependencies: WorkspaceChangeSetPersistenceDependencies,
  mode: "edit" | "live" = "edit"
): {
  activeChangeSet: { commandCorrelationId: string; recoveryState: string; revision: number; sysId: string };
  pageRecords: PageRecord[];
  state: WorkspaceChangeSetState;
  workspace: WorkspaceRecord;
} {
  const foundationPageRecords = cleanText(workspaceInput.pendingChangeSetSysId) && cleanText(workspaceInput.publishedSnapshotSetSysId)
    ? []
    : listWorkspacePageRecords(cleanText(workspaceInput.sysId), "foundation");
  const selectedSnapshotCache: { pages?: SnapshotPage[] } = {};
  const workspace = ensureWorkspaceFoundation(workspaceInput, foundationPageRecords, dependencies, selectedSnapshotCache);
  const workspaceSysId = cleanText(workspace.sysId);
  const activeChangeSetSysId = cleanText(workspace.pendingChangeSetSysId);
  const selectedSnapshotSysId = cleanText(workspace.publishedSnapshotSetSysId);
  if (!workspaceSysId || !activeChangeSetSysId || !selectedSnapshotSysId) {
    throw new Error("Workspace foundation is invalid.");
  }

  const changeSet = new GlideRecord(DOCSERA_WORKSPACE_CHANGE_SET_TABLE);
  if (!changeSet.get("sys_id", activeChangeSetSysId)) {
    throw new Error("Workspace foundation is invalid.");
  }
  const revision = safeInteger(changeSet.getValue("change_set_revision"));
  const nextPendingSequence = safeInteger(changeSet.getValue("next_pending_sequence"));
  if (cleanText(changeSet.getValue("workspace")) !== workspaceSysId || cleanText(changeSet.getValue("lifecycle_state")) !== "active" || revision === null || nextPendingSequence === null) {
    throw new Error("Workspace foundation is invalid.");
  }

  const snapshot = new GlideRecord(DOCSERA_WORKSPACE_SNAPSHOT_SET_TABLE);
  if (!snapshot.get("sys_id", selectedSnapshotSysId)) {
    throw new Error("Workspace foundation is invalid.");
  }
  if (cleanText(snapshot.getValue("workspace")) !== workspaceSysId || cleanText(snapshot.getValue("readiness_state")) !== "ready") {
    throw new Error("Workspace foundation is invalid.");
  }

  const pageRecords = listWorkspacePageRecords(workspaceSysId, mode === "live" ? "live" : "edit");
  const snapshotPages = selectedSnapshotCache.pages ?? loadSnapshotPages(selectedSnapshotSysId);

  const entryResults: WorkspaceChangeSetState["entries"] = [];
  const removalBatches: WorkspaceChangeSetState["removalBatches"] = [];
  if (mode === "edit") {
    const entries = new GlideRecord(DOCSERA_WORKSPACE_CHANGE_ENTRY_TABLE);
    entries.addQuery("change_set", activeChangeSetSysId);
    entries.query();
    while (entries.next()) {
      const firstPendingSequence = safeInteger(entries.getValue("first_pending_sequence"));
      if (firstPendingSequence === null) {
        throw new Error("Workspace foundation is invalid.");
      }
      entryResults.push({
        changeSetId: activeChangeSetSysId,
        pageId: cleanText(entries.getValue("page")),
        firstPendingSequence,
        firstPendingOn: cleanText(entries.getValue("first_pending_on")),
        lastChangedOn: cleanText(entries.getValue("last_changed_on")),
        lastChangedBy: cleanText(entries.getValue("last_changed_by"))
      });
    }

    const removalRows = new GlideRecord(DOCSERA_WORKSPACE_REMOVAL_BATCH_TABLE);
    removalRows.addQuery("change_set", activeChangeSetSysId);
    removalRows.query();
    const batchesBySysId = new Map<string, WorkspaceChangeSetState["removalBatches"][number]>();
    while (removalRows.next()) {
      const batchSysId = cleanText(removalRows.getUniqueValue());
      const batch = {
        id: cleanText(removalRows.getValue("batch_key")),
        changeSetId: activeChangeSetSysId,
        rootPageId: cleanText(removalRows.getValue("root_page")),
        members: [] as WorkspaceChangeSetState["removalBatches"][number]["members"],
        state: (cleanText(removalRows.getValue("lifecycle_state")) === "retired" ? "retired" : "active") as "retired" | "active",
        removedOn: cleanText(removalRows.getValue("removed_on")),
        removedBy: cleanText(removalRows.getValue("removed_by"))
      };
      removalBatches.push(batch);
      batchesBySysId.set(batchSysId, batch);
    }
    const batchIds = Array.from(batchesBySysId.keys());
    const memberQueryBatchSize = 100;
    for (let offset = 0; offset < batchIds.length; offset += memberQueryBatchSize) {
      const memberRows = new GlideRecord(DOCSERA_WORKSPACE_REMOVAL_MEMBER_TABLE);
      memberRows.addQuery("removal_batch", "IN", batchIds.slice(offset, offset + memberQueryBatchSize).join(","));
      memberRows.query();
      while (memberRows.next()) {
        const firstPendingSequence = safeInteger(memberRows.getValue("first_pending_sequence"));
        if (firstPendingSequence === null) {
          throw new Error("Workspace foundation is invalid.");
        }
        batchesBySysId.get(cleanText(memberRows.getValue("removal_batch")))?.members.push({
          pageId: cleanText(memberRows.getValue("page")),
          firstPendingSequence
        });
      }
    }
  }

  let draftPages: DraftPage[] = [];
  if (mode === "edit") {
    const retainedPageIds = new Set<string>([
      ...entryResults.map((entry) => cleanText(entry.pageId)),
      ...removalBatches.flatMap((batch) => batch.members.map((member) => cleanText(member.pageId))),
      ...retainedDraftPageIdsForClaim(loadMutationClaimByGeneration(buildMutationGenerationKey({
        changeSetId: activeChangeSetSysId,
        changeSetRevision: revision
      }))).values()
    ].filter(Boolean));
    if (retainedPageIds.size === 0 && revision > 0) {
      for (const page of pageRecords) {
        retainedPageIds.add(cleanText(page.sysId));
      }
    }
    draftPages = buildDraftPages(pageRecords, snapshotPages, retainedPageIds);
  }

  const state: WorkspaceChangeSetState = {
    selectors: {
      workspaceId: workspaceSysId,
      activeChangeSetId: activeChangeSetSysId,
      publishedSnapshotSetId: selectedSnapshotSysId,
      workspaceStateRevision: typeof workspace.workspaceStateRevision === "number" ? workspace.workspaceStateRevision : 0
    },
    changeSets: [{
      id: activeChangeSetSysId,
      workspaceId: workspaceSysId,
      revision,
      nextPendingSequence,
      state: "active"
    }],
    snapshotSets: [{
      id: selectedSnapshotSysId,
      workspaceId: workspaceSysId,
      readiness: "ready",
      pages: snapshotPages
    }],
    draftPages,
    entries: entryResults,
    removalBatches,
    commands: []
  };

  return {
    activeChangeSet: {
      commandCorrelationId: cleanText(changeSet.getValue("command_correlation_id")),
      recoveryState: cleanText(changeSet.getValue("recovery_state")) || "none",
      revision,
      sysId: activeChangeSetSysId
    },
    pageRecords,
    state,
    workspace
  };
}

function nextAuthority(state: WorkspaceChangeSetState): WorkspaceMutationAuthority {
  const active = state.changeSets.find((set) => set.id === state.selectors.activeChangeSetId && set.state === "active");
  if (!active) {
    throw new Error("Workspace foundation is invalid.");
  }
  return {
    changeSetId: active.id,
    changeSetRevision: active.revision
  };
}

type WorkspaceStateReuseBaseline = {
  activeChangeSet: { commandCorrelationId: string; recoveryState: string; revision: number; sysId: string };
  state: WorkspaceChangeSetState;
  workspace: WorkspaceRecord;
};

function loadFreshWorkspaceForStateReuse(
  loaded: WorkspaceStateReuseBaseline,
  eligible: boolean
): { unchanged: boolean; workspace: WorkspaceRecord | null } {
  const workspace = eligible ? loadWorkspaceBySysId(cleanText(loaded.workspace.sysId)) : null;
  const changeSet = workspace
    ? loadFoundationChangeSet(cleanText(workspace.sysId), cleanText(workspace.pendingChangeSetSysId))
    : null;
  const initialChangeSet = loaded.state.changeSets[0];
  const unchanged = Boolean(
    workspace &&
      changeSet &&
      cleanText(workspace.pendingChangeSetSysId) === loaded.state.selectors.activeChangeSetId &&
      cleanText(workspace.publishedSnapshotSetSysId) === loaded.state.selectors.publishedSnapshotSetId &&
      (workspace.workspaceStateRevision ?? 0) === loaded.state.selectors.workspaceStateRevision &&
      changeSet.revision === initialChangeSet.revision &&
      changeSet.nextPendingSequence === initialChangeSet.nextPendingSequence &&
      changeSet.recoveryState === loaded.activeChangeSet.recoveryState &&
      changeSet.commandCorrelationId === loaded.activeChangeSet.commandCorrelationId
  );
  return { unchanged, workspace };
}

function staleFailure(current: WorkspaceMutationAuthority): WorkspaceMutationFailure {
  return {
    kind: "failed",
    code: "stale_generation",
    currentChangeSetId: current.changeSetId,
    currentChangeSetRevision: current.changeSetRevision,
    errorMessage: "The active draft generation changed. Reload before saving again.",
    status: 409
  };
}

function isDiscardRecoveryState(recoveryState: string): boolean {
  return recoveryState === "staged" || recoveryState === "switched";
}

function discardRecoveryRequiredMessage(): string {
  return "Discard recovery is incomplete. Retry discard all to finish restoring this workspace before making other changes.";
}

function discardRecoveryRequiredFailure(input: {
  affectedPageCount?: number;
  currentChangeSetId: string;
  currentChangeSetRevision: number;
  recoveryCommandId: string;
}): WorkspaceMutationFailure {
  return {
    kind: "failed",
    code: "recovery_required",
    affectedPageCount: typeof input.affectedPageCount === "number" ? input.affectedPageCount : undefined,
    currentChangeSetId: input.currentChangeSetId,
    currentChangeSetRevision: input.currentChangeSetRevision,
    errorMessage: discardRecoveryRequiredMessage(),
    recoveryCommandId: input.recoveryCommandId,
    status: 409
  };
}

type ActiveDiscardRecovery = {
  affectedPageCount: number;
  claim: WorkspaceMutationClaimRecord;
  recoveryCommandId: string;
  sourceAuthority: WorkspaceMutationAuthority;
  successorAuthority: WorkspaceMutationAuthority;
};

function loadDiscardRecoveryClaimBySuccessor(
  workspaceSysId: string,
  successorChangeSetId: string,
  commandId?: string
): WorkspaceMutationClaimRecord | null {
  const rows = new GlideRecord(DOCSERA_WORKSPACE_MUTATION_CLAIM_TABLE);
  rows.addQuery("workspace", workspaceSysId);
  rows.addQuery("mutation_kind", "discard_all");
  rows.query();
  let matched: WorkspaceMutationClaimRecord | null = null;
  while (rows.next()) {
    const generationKey = cleanText(rows.getValue("generation_key"));
    const claim = loadMutationClaimByGeneration(generationKey);
    if (!claim || claim.kind !== "discard_all" || claim.payload.kind !== "discard_all") {
      continue;
    }
    if (claim.payload.successorChangeSetSysId !== successorChangeSetId) {
      continue;
    }
    if (commandId && claim.payload.commandId !== commandId) {
      continue;
    }
    if (matched) {
      throw new Error("Workspace discard recovery metadata is ambiguous.");
    }
    matched = claim;
  }
  return matched;
}

function readActiveDiscardRecovery(loaded: {
  activeChangeSet: { commandCorrelationId: string; recoveryState: string; revision: number; sysId: string };
  workspace: WorkspaceRecord;
}): ActiveDiscardRecovery | null {
  if (!isDiscardRecoveryState(loaded.activeChangeSet.recoveryState)) {
    return null;
  }
  const workspaceSysId = cleanText(loaded.workspace.sysId);
  const successorChangeSetId = cleanText(loaded.activeChangeSet.sysId);
  const recoveryCommandId = cleanText(loaded.activeChangeSet.commandCorrelationId);
  const claim = loadDiscardRecoveryClaimBySuccessor(workspaceSysId, successorChangeSetId, recoveryCommandId || undefined);
  if (!claim || claim.kind !== "discard_all" || claim.payload.kind !== "discard_all") {
    throw new Error("Workspace discard recovery metadata is invalid.");
  }
  if (recoveryCommandId && claim.payload.commandId !== recoveryCommandId) {
    throw new Error("Workspace discard recovery metadata is invalid.");
  }
  return {
    affectedPageCount: claim.payload.affectedPageCount,
    claim,
    recoveryCommandId: claim.payload.commandId,
    sourceAuthority: {
      changeSetId: claim.changeSetId,
      changeSetRevision: mutationGenerationRevision(claim.generationKey)
    },
    successorAuthority: {
      changeSetId: successorChangeSetId,
      changeSetRevision: loaded.activeChangeSet.revision
    }
  };
}

function blockOnActiveDiscardRecovery(loaded: {
  activeChangeSet: { commandCorrelationId: string; recoveryState: string; revision: number; sysId: string };
  workspace: WorkspaceRecord;
}): WorkspaceMutationFailure | null {
  const recovery = readActiveDiscardRecovery(loaded);
  if (!recovery) {
    return null;
  }
  return discardRecoveryRequiredFailure({
    affectedPageCount: recovery.affectedPageCount,
    currentChangeSetId: recovery.successorAuthority.changeSetId,
    currentChangeSetRevision: recovery.successorAuthority.changeSetRevision,
    recoveryCommandId: recovery.recoveryCommandId
  });
}

function updateChangeSetRow(state: WorkspaceChangeSetState) {
  const active = state.changeSets.find((set) => set.id === state.selectors.activeChangeSetId);
  if (!active) {
    throw new Error("Workspace foundation is invalid.");
  }
  const row = new GlideRecord(DOCSERA_WORKSPACE_CHANGE_SET_TABLE);
  if (!row.get("sys_id", active.id)) {
    throw new Error("Workspace foundation is invalid.");
  }
  row.setValue("change_set_revision", active.revision);
  row.setValue("next_pending_sequence", active.nextPendingSequence);
  if (!row.update()) {
    throw new Error("Workspace change set could not be updated.");
  }
}

function upsertChangeEntry(state: WorkspaceChangeSetState, pageId: string) {
  const changeSetId = cleanText(state.selectors.activeChangeSetId);
  const entry = state.entries.find((candidate) => candidate.changeSetId === changeSetId && candidate.pageId === pageId);
  const row = new GlideRecord(DOCSERA_WORKSPACE_CHANGE_ENTRY_TABLE);
  row.addQuery("change_set", changeSetId);
  row.addQuery("page", pageId);
  row.query();
  const exists = row.next();

  if (!entry) {
    if (exists) {
      row.deleteRecord();
    }
    return;
  }

  const target = exists ? row : new GlideRecord(DOCSERA_WORKSPACE_CHANGE_ENTRY_TABLE);
  if (!exists) {
    target.initialize();
  }
  target.setValue("change_set", changeSetId);
  target.setValue("page", pageId);
  target.setValue("generation_page_key", `${changeSetId}:${pageId}`);
  target.setValue("first_pending_sequence", entry.firstPendingSequence);
  target.setValue("first_pending_on", entry.firstPendingOn);
  target.setValue("last_changed_on", entry.lastChangedOn);
  target.setValue("last_changed_by", entry.lastChangedBy);
  if (!(exists ? target.update() : target.insert())) {
    throw new Error("Workspace change entry could not be persisted.");
  }
}

function replaceRemovalBatches(state: WorkspaceChangeSetState) {
  const changeSetId = cleanText(state.selectors.activeChangeSetId);
  for (const batch of state.removalBatches.filter((candidate) => candidate.changeSetId === changeSetId)) {
    const batchRow = new GlideRecord(DOCSERA_WORKSPACE_REMOVAL_BATCH_TABLE);
    const exists = batchRow.get("batch_key", batch.id);
    const needsBatchUpdate =
      !exists ||
      cleanText(batchRow.getValue("change_set")) !== changeSetId ||
      cleanText(batchRow.getValue("root_page")) !== cleanText(batch.rootPageId) ||
      cleanText(batchRow.getValue("batch_key")) !== cleanText(batch.id) ||
      cleanText(batchRow.getValue("lifecycle_state")) !== cleanText(batch.state) ||
      cleanText(batchRow.getValue("removed_on")) !== cleanText(batch.removedOn) ||
      cleanText(batchRow.getValue("removed_by")) !== cleanText(batch.removedBy);
    if (!exists) {
      batchRow.initialize();
    }
    batchRow.setValue("change_set", changeSetId);
    batchRow.setValue("root_page", batch.rootPageId);
    batchRow.setValue("batch_key", batch.id);
    batchRow.setValue("lifecycle_state", batch.state);
    batchRow.setValue("removed_on", batch.removedOn);
    batchRow.setValue("removed_by", batch.removedBy);
    const batchSysId = cleanText(!exists ? batchRow.insert() : needsBatchUpdate ? batchRow.update() : batchRow.getUniqueValue());
    if (!batchSysId) {
      throw new Error("Workspace removal batch could not be persisted.");
    }
    const existingMembers = new GlideRecord(DOCSERA_WORKSPACE_REMOVAL_MEMBER_TABLE);
    existingMembers.addQuery("removal_batch", batchSysId);
    existingMembers.query();
    const expectedMembersByPageId = new Map(batch.members.map((member) => [member.pageId, member]));
    while (existingMembers.next()) {
      const pageId = cleanText(existingMembers.getValue("page"));
      const member = expectedMembersByPageId.get(pageId);
      if (!member) {
        if (!existingMembers.deleteRecord()) {
          throw new Error("Workspace removal batch member could not be removed.");
        }
        continue;
      }
      const batchPageKey = `${batch.id}:${member.pageId}`;
      const needsMemberUpdate =
        cleanText(existingMembers.getValue("removal_batch")) !== batchSysId ||
        cleanText(existingMembers.getValue("page")) !== cleanText(member.pageId) ||
        cleanText(existingMembers.getValue("batch_page_key")) !== batchPageKey ||
        safeInteger(existingMembers.getValue("first_pending_sequence")) !== member.firstPendingSequence;
      if (needsMemberUpdate) {
        existingMembers.setValue("removal_batch", batchSysId);
        existingMembers.setValue("page", member.pageId);
        existingMembers.setValue("batch_page_key", batchPageKey);
        existingMembers.setValue("first_pending_sequence", member.firstPendingSequence);
        if (!existingMembers.update()) {
          throw new Error("Workspace removal batch member could not be persisted.");
        }
      }
      expectedMembersByPageId.delete(member.pageId);
    }
    for (const member of expectedMembersByPageId.values()) {
      const memberRow = new GlideRecord(DOCSERA_WORKSPACE_REMOVAL_MEMBER_TABLE);
      memberRow.initialize();
      memberRow.setValue("removal_batch", batchSysId);
      memberRow.setValue("page", member.pageId);
      memberRow.setValue("batch_page_key", `${batch.id}:${member.pageId}`);
      memberRow.setValue("first_pending_sequence", member.firstPendingSequence);
      if (!memberRow.insert()) {
        throw new Error("Workspace removal batch member could not be persisted.");
      }
    }
  }
}

function updateDraftPageRecord(page: PageRecord) {
  const pageSysId = cleanText(page.sysId);
  const row = new GlideRecord(DOCSERA_PAGE_TABLE);
  if (!row.get("sys_id", pageSysId)) {
    throw new Error("Page could not be found.");
  }
  row.setValue("parent_page", page.parentPageSysId ?? "");
  row.setValue("sibling_order", String(page.siblingOrder));
  row.setValue("draft_title", page.draftTitle);
  row.setValue("draft_slug", page.draftSlug);
  row.setValue("draft_slug_normalized", page.draftSlugNormalized);
  row.setValue("draft_content_json", serializeDocument(page.draftContentJson));
  row.setValue("draft_body_text", page.draftBodyText ?? "");
  row.setValue("draft_revision", page.draftRevision ?? 0);
  row.setValue("active", page.active);
  if (!row.update()) {
    throw new Error("Page could not be updated.");
  }
}

function deleteDraftPageRecord(pageSysId: string) {
  const row = new GlideRecord(DOCSERA_PAGE_TABLE);
  if (!row.get("sys_id", cleanText(pageSysId))) {
    return false;
  }
  if (!row.deleteRecord()) {
    throw new Error("Page could not be deleted.");
  }
  return true;
}

function deleteDraftPageRecords(pageSysIds: string[]) {
  for (const pageSysId of [...new Set(pageSysIds.map((value) => cleanText(value)).filter(Boolean))]) {
    deleteDraftPageRecord(pageSysId);
  }
}

function writePagePublicationState(pageSysId: string, publicationState: PageRecord["publicationState"]) {
  const row = new GlideRecord(DOCSERA_PAGE_TABLE);
  if (!row.get("sys_id", cleanText(pageSysId))) {
    throw new Error("Page could not be found.");
  }
  row.setValue("publication_state", publicationState);
  if (!row.update()) {
    throw new Error("Page publication state could not be updated.");
  }
}

function restoreDraftPageFromSnapshot(
  pageSysId: string,
  snapshotPage: SnapshotPage,
  options: { restoreContent: boolean; restoreHierarchy: boolean; publicationState: PageRecord["publicationState"] }
) {
  const row = new GlideRecord(DOCSERA_PAGE_TABLE);
  if (!row.get("sys_id", cleanText(pageSysId))) {
    throw new Error("Page could not be found.");
  }
  if (options.restoreHierarchy) {
    row.setValue("parent_page", snapshotPage.parentPageId ?? "");
    row.setValue("sibling_order", snapshotPage.siblingOrder);
  }
  if (options.restoreContent) {
    row.setValue("draft_title", snapshotPage.title);
    row.setValue("draft_slug", snapshotPage.slug);
    row.setValue("draft_slug_normalized", snapshotPage.slug);
    row.setValue("draft_content_json", snapshotPage.contentJson);
    row.setValue("draft_body_text", snapshotPage.bodyText ?? "");
    row.setValue("active", snapshotPage.active);
  }
  row.setValue("publication_state", options.publicationState);
  if (!row.update()) {
    throw new Error("Page could not be updated.");
  }
}

function updateDraftPageHierarchy(pageSysId: string, parentPageSysId: string | null, siblingOrder: string) {
  const row = new GlideRecord(DOCSERA_PAGE_TABLE);
  if (!row.get("sys_id", cleanText(pageSysId))) {
    throw new Error("Page could not be found.");
  }
  row.setValue("parent_page", cleanText(parentPageSysId) || "");
  row.setValue("sibling_order", cleanText(siblingOrder));
  if (!row.update()) {
    throw new Error("Page hierarchy could not be updated.");
  }
}

function pageHierarchyMatches(pageSysId: string, parentPageSysId: string | null, siblingOrder: string): boolean {
  const row = new GlideRecord(DOCSERA_PAGE_TABLE);
  if (!row.get("sys_id", cleanText(pageSysId))) {
    return false;
  }
  return cleanText(row.getValue("parent_page")) === cleanText(parentPageSysId) && cleanText(row.getValue("sibling_order")) === cleanText(siblingOrder);
}

function pageContentAndSettingsMatchSnapshot(pageSysId: string, snapshotPage: SnapshotPage): boolean {
  const row = new GlideRecord(DOCSERA_PAGE_TABLE);
  if (!row.get("sys_id", cleanText(pageSysId))) {
    return false;
  }
  return (
    cleanText(row.getValue("draft_title")) === cleanText(snapshotPage.title) &&
    cleanText(row.getValue("draft_slug_normalized") || row.getValue("draft_slug")) === cleanText(snapshotPage.slug) &&
    cleanText(row.getValue("draft_content_json")) === cleanText(snapshotPage.contentJson) &&
    cleanText(row.getValue("draft_body_text")) === cleanText(snapshotPage.bodyText) &&
    readBoolean(row.getValue("active"), true) === snapshotPage.active
  );
}

function insertPageRecord(page: PageRecord, targetSysId: string): PageRecord {
  const row = new GlideRecord(DOCSERA_PAGE_TABLE);
  row.initialize();
  row.setNewGuidValue(targetSysId);
  row.setValue("workspace", page.workspaceSysId);
  row.setValue("parent_page", page.parentPageSysId ?? "");
  row.setValue("sibling_order", String(page.siblingOrder));
  row.setValue("draft_title", page.draftTitle);
  row.setValue("draft_slug", page.draftSlug);
  row.setValue("draft_slug_normalized", page.draftSlugNormalized);
  row.setValue("draft_content_json", serializeDocument(page.draftContentJson));
  row.setValue("draft_body_text", page.draftBodyText ?? "");
  row.setValue("draft_revision", page.draftRevision ?? 0);
  row.setValue("published_title", "");
  row.setValue("published_slug", "");
  row.setValue("published_slug_normalized", "");
  row.setValue("published_content_json", "");
  row.setValue("published_body_text", "");
  row.setValue("publication_state", "draft");
  row.setValue("active", page.active);
  const sysId = cleanText(row.insert() || targetSysId);
  if (!sysId) {
    throw new Error("Page could not be created.");
  }
  const reread = new GlideRecord(DOCSERA_PAGE_TABLE);
  if (!reread.get("sys_id", sysId)) {
    throw new Error("Page could not be loaded.");
  }
  return mapPageRecord(reread);
}

function pageFromProjectionPage(page: SnapshotPage, existing: PageRecord | undefined, workspaceSysId: string, mode: "edit" | "live"): PageRecord {
  const document = parseServerDocument(page.contentJson);
  return {
    sysId: page.pageId,
    workspaceSysId,
    parentPageSysId: page.parentPageId,
    siblingOrder: normalizeSiblingOrder(page.siblingOrder),
    draftTitle: page.title,
    draftSlug: page.slug,
    draftSlugNormalized: page.slug,
    draftContentJson: document,
    draftRevision: existing?.draftRevision ?? 0,
    draftBodyText: page.bodyText,
    publishedTitle: page.title,
    publishedSlug: page.slug,
    publishedSlugNormalized: page.slug,
    publishedContentJson: document,
    publishedBodyText: page.bodyText ?? null,
    publishedAt: existing?.publishedAt ?? null,
    publishedBySysId: existing?.publishedBySysId ?? null,
    publishedByDisplayName: existing?.publishedByDisplayName ?? null,
    publicationState: mode === "live" ? "published" : existing?.publicationState ?? "published",
    active: page.active
  };
}

function indexPageRecordsByIdFirstMatch(pageRecords: PageRecord[]): Map<string, PageRecord> {
  const recordsById = new Map<string, PageRecord>();
  for (const pageRecord of pageRecords) {
    const pageId = cleanText(pageRecord.sysId);
    if (!recordsById.has(pageId)) {
      recordsById.set(pageId, pageRecord);
    }
  }
  return recordsById;
}

function orderProjectionPages(pages: SnapshotPage[]): SnapshotPage[] {
  const childrenByParent = new Map<string, SnapshotPage[]>();
  for (const page of pages) {
    const parentKey = cleanText(page.parentPageId);
    const siblings = childrenByParent.get(parentKey);
    if (siblings) {
      siblings.push(page);
    } else {
      childrenByParent.set(parentKey, [page]);
    }
  }

  const sortSiblings = (siblings: SnapshotPage[]) =>
    siblings.sort((left, right) => {
      const leftOrder = normalizeSiblingOrder(left.siblingOrder);
      const rightOrder = normalizeSiblingOrder(right.siblingOrder);
      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      const titleComparison = cleanText(left.title).localeCompare(cleanText(right.title), undefined, { sensitivity: "base" });
      return titleComparison || cleanText(left.slug).localeCompare(cleanText(right.slug), undefined, { sensitivity: "base" }) || cleanText(left.pageId).localeCompare(cleanText(right.pageId), undefined, { sensitivity: "base" });
    });

  const ordered: SnapshotPage[] = [];
  const appendBranch = (parentKey: string) => {
    for (const page of sortSiblings(childrenByParent.get(parentKey) ?? [])) {
      ordered.push(page);
      appendBranch(cleanText(page.pageId));
    }
  };
  appendBranch("");
  return ordered.length === pages.length ? ordered : [...pages].sort((left, right) => normalizeSiblingOrder(left.siblingOrder) - normalizeSiblingOrder(right.siblingOrder));
}

function refreshEntriesForPage(state: WorkspaceChangeSetState, pageId: string) {
  const category = deriveChangeCategory(state, pageId);
  if (category === null) {
    state.entries = state.entries.filter((entry) => !(entry.changeSetId === state.selectors.activeChangeSetId && entry.pageId === pageId));
  }
}

function persistMutatedState(state: WorkspaceChangeSetState, touchedPageIds: string[]) {
  for (const pageId of touchedPageIds) {
    upsertChangeEntry(state, pageId);
  }
  replaceRemovalBatches(state);
  updateChangeSetRow(state);
}

function workspaceCommandToken(commandId: string, dependencies: WorkspaceChangeSetPersistenceDependencies): string {
  return dependencies.digest(cleanText(commandId)).slice(0, 24).toLowerCase();
}

function publishCommandToken(commandId: string, dependencies: WorkspaceChangeSetPersistenceDependencies): string {
  return workspaceCommandToken(commandId, dependencies);
}

function buildPublishPayload(
  workspaceSysId: string,
  commandId: string,
  authority: WorkspaceMutationAuthority,
  dependencies: WorkspaceChangeSetPersistenceDependencies
): Extract<WorkspaceMutationClaimPayload, { kind: "publish" }> {
  const token = publishCommandToken(commandId, dependencies);
  const snapshotKey = `${workspaceSysId}:publish:${token}:snapshot`;
  const successorGenerationKey = `${workspaceSysId}:publish:${token}:change-set`;
  return {
    kind: "publish",
    commandId,
    snapshotKey,
    snapshotSetSysId: dependencies.createDeterministicSysId(`${snapshotKey}:sys_id`),
    successorChangeSetSysId: dependencies.createDeterministicSysId(`${successorGenerationKey}:sys_id`),
    successorGenerationKey
  };
}

function buildDiscardAllPayload(
  workspaceSysId: string,
  commandId: string,
  _authority: WorkspaceMutationAuthority,
  affectedPageCount: number,
  dependencies: WorkspaceChangeSetPersistenceDependencies
): Extract<WorkspaceMutationClaimPayload, { kind: "discard_all" }> {
  const token = workspaceCommandToken(commandId, dependencies);
  const successorGenerationKey = `${workspaceSysId}:discard_all:${token}:change-set`;
  return {
    affectedPageCount,
    kind: "discard_all",
    commandId,
    successorChangeSetSysId: dependencies.createDeterministicSysId(`${successorGenerationKey}:sys_id`),
    successorGenerationKey
  };
}

function buildDiscardPagePayload(input: {
  affectedPageIds: string[];
  category: WorkspacePendingChangeCategory;
  pageSysId: string;
  removalBatchId?: string;
}): Extract<WorkspaceMutationClaimPayload, { kind: "discard_page" }> {
  return {
    affectedPageIds: [...new Set(input.affectedPageIds.map((pageId) => cleanText(pageId)).filter(Boolean))],
    category: input.category,
    kind: "discard_page",
    pageSysId: cleanText(input.pageSysId),
    removalBatchId: cleanText(input.removalBatchId) || undefined
  };
}

function publicationStateForPendingCategory(category: WorkspacePendingChangeCategory | null): PageRecord["publicationState"] {
  return category === null ? "published" : "published_with_unpublished_changes";
}

function snapshotPageKey(snapshotSetSysId: string, pageSysId: string): string {
  return `${cleanText(snapshotSetSysId)}:${cleanText(pageSysId)}`;
}

function persistPublishSnapshot(
  dependencies: WorkspaceChangeSetPersistenceDependencies,
  loaded: { state: WorkspaceChangeSetState; workspace: WorkspaceRecord },
  payload: Extract<WorkspaceMutationClaimPayload, { kind: "publish" }>,
  authority: WorkspaceMutationAuthority,
  publishedOn: string,
  publishedBy: string
): SnapshotPage[] {
  const staged = completeSnapshotStaging(
    stageSnapshotSet(loaded.state, {
      commandId: payload.commandId,
      kind: "publish",
      snapshotSetId: payload.snapshotSetSysId
    }),
    payload.snapshotSetSysId
  );
  const stagedSnapshot = staged.snapshotSets.find((snapshot) => snapshot.id === payload.snapshotSetSysId);
  if (!stagedSnapshot || stagedSnapshot.readiness !== "ready") {
    throw new Error("Workspace publish could not stage the published snapshot.");
  }

  const snapshotRow = new GlideRecord(DOCSERA_WORKSPACE_SNAPSHOT_SET_TABLE);
  if (!snapshotRow.get("snapshot_key", payload.snapshotKey)) {
    snapshotRow.initialize();
    snapshotRow.setNewGuidValue(payload.snapshotSetSysId);
    snapshotRow.setValue("workspace", cleanText(loaded.workspace.sysId));
    snapshotRow.setValue("snapshot_key", payload.snapshotKey);
    snapshotRow.setValue("readiness_state", "staging");
    snapshotRow.setValue("command_correlation_id", payload.commandId);
    snapshotRow.setValue("command_kind", "publish");
    snapshotRow.setValue("source_change_set", authority.changeSetId);
    snapshotRow.setValue("source_change_set_revision", authority.changeSetRevision);
    snapshotRow.setValue("published_on", "");
    if (!snapshotRow.insert()) {
      throw new Error("Workspace publish could not create the staged snapshot.");
    }
    triggerDurablePhase(dependencies, "publish_snapshot_set_created", {
      generationKey: buildMutationGenerationKey(authority),
      kind: "publish",
      snapshotPageKey: payload.snapshotKey
    });
  }

  const snapshotSysId = cleanText(snapshotRow.getUniqueValue()) || payload.snapshotSetSysId;
  if (
    snapshotSysId !== payload.snapshotSetSysId ||
    cleanText(snapshotRow.getValue("workspace")) !== cleanText(loaded.workspace.sysId) ||
    cleanText(snapshotRow.getValue("command_correlation_id")) !== payload.commandId ||
    cleanText(snapshotRow.getValue("command_kind")) !== "publish" ||
    cleanText(snapshotRow.getValue("source_change_set")) !== authority.changeSetId ||
    safeInteger(snapshotRow.getValue("source_change_set_revision")) !== authority.changeSetRevision
  ) {
    throw new Error("Workspace publish snapshot identity is invalid.");
  }

  const existingKeys = new Set<string>();
  const existingPageIds = new Set<string>();
  const existingRows = new GlideRecord(DOCSERA_WORKSPACE_PAGE_SNAPSHOT_TABLE);
  existingRows.addQuery("snapshot_set", payload.snapshotSetSysId);
  existingRows.query();
  while (existingRows.next()) {
    const key = cleanText(existingRows.getValue("snapshot_page_key"));
    const pageId = cleanText(existingRows.getValue("page"));
    if (!key || existingKeys.has(key) || existingPageIds.has(pageId)) {
      throw new Error("Workspace publish snapshot pages are ambiguous.");
    }
    existingKeys.add(key);
    existingPageIds.add(pageId);
  }

  for (const page of stagedSnapshot.pages) {
    const key = snapshotPageKey(payload.snapshotSetSysId, page.pageId);
    const pageRow = new GlideRecord(DOCSERA_WORKSPACE_PAGE_SNAPSHOT_TABLE);
    if (!pageRow.get("snapshot_page_key", key)) {
      pageRow.initialize();
      pageRow.setValue("snapshot_set", payload.snapshotSetSysId);
      pageRow.setValue("page", page.pageId);
      pageRow.setValue("snapshot_page_key", key);
      pageRow.setValue("parent_page", page.parentPageId ?? "");
      pageRow.setValue("sibling_order", page.siblingOrder);
      pageRow.setValue("title", page.title);
      pageRow.setValue("slug", page.slug);
      pageRow.setValue("slug_normalized", page.slug);
      pageRow.setValue("content_json", page.contentJson);
      pageRow.setValue("body_text", page.bodyText ?? "");
      pageRow.setValue("active", page.active);
      pageRow.setValue("published_on", publishedOn);
      pageRow.setValue("published_by", publishedBy);
      if (!pageRow.insert()) {
        throw new Error("Workspace publish could not create snapshot pages.");
      }
      triggerDurablePhase(dependencies, "publish_snapshot_page_inserted", {
        generationKey: buildMutationGenerationKey(authority),
        kind: "publish",
        pageSysId: page.pageId,
        snapshotPageKey: key
      });
      continue;
    }
    if (cleanText(pageRow.getValue("snapshot_set")) !== payload.snapshotSetSysId || cleanText(pageRow.getValue("page")) !== page.pageId) {
      throw new Error("Workspace publish snapshot page identity is invalid.");
    }
  }

  const expectedKeys = new Set(stagedSnapshot.pages.map((page) => snapshotPageKey(payload.snapshotSetSysId, page.pageId)));
  const validatedRows = new GlideRecord(DOCSERA_WORKSPACE_PAGE_SNAPSHOT_TABLE);
  validatedRows.addQuery("snapshot_set", payload.snapshotSetSysId);
  validatedRows.query();
  while (validatedRows.next()) {
    if (!expectedKeys.has(cleanText(validatedRows.getValue("snapshot_page_key")))) {
      throw new Error("Workspace publish snapshot pages are invalid.");
    }
  }

  if (cleanText(snapshotRow.getValue("readiness_state")) !== "ready") {
    snapshotRow.setValue("readiness_state", "ready");
    snapshotRow.setValue("published_on", publishedOn);
    if (!snapshotRow.update()) {
      throw new Error("Workspace publish could not finalize the staged snapshot.");
    }
    triggerDurablePhase(dependencies, "publish_snapshot_ready", {
      generationKey: buildMutationGenerationKey(authority),
      kind: "publish",
      snapshotPageKey: payload.snapshotKey
    });
  }

  return stagedSnapshot.pages.map((page) => ({ ...page }));
}

function ensurePublishSuccessorChangeSet(
  workspaceSysId: string,
  payload: Extract<WorkspaceMutationClaimPayload, { kind: "publish" }>
) {
  const row = new GlideRecord(DOCSERA_WORKSPACE_CHANGE_SET_TABLE);
  if (row.get("generation_key", payload.successorGenerationKey)) {
    if (
      cleanText(row.getUniqueValue()) !== payload.successorChangeSetSysId ||
      cleanText(row.getValue("workspace")) !== workspaceSysId ||
      safeInteger(row.getValue("change_set_revision")) !== 0 ||
      safeInteger(row.getValue("next_pending_sequence")) !== 1
    ) {
      throw new Error("Workspace publish successor generation is invalid.");
    }
    return;
  }
  row.initialize();
  row.setNewGuidValue(payload.successorChangeSetSysId);
  row.setValue("workspace", workspaceSysId);
  row.setValue("generation_key", payload.successorGenerationKey);
  row.setValue("change_set_revision", 0);
  row.setValue("next_pending_sequence", 1);
  row.setValue("lifecycle_state", "active");
  row.setValue("command_correlation_id", payload.commandId);
  row.setValue("recovery_state", "none");
  if (!row.insert()) {
    throw new Error("Workspace publish could not create the successor change set.");
  }
}

function updateChangeSetRecoveryState(changeSetSysId: string, recoveryState: string) {
  const row = new GlideRecord(DOCSERA_WORKSPACE_CHANGE_SET_TABLE);
  if (!row.get("sys_id", cleanText(changeSetSysId))) {
    throw new Error("Workspace recovery state could not be updated.");
  }
  row.setValue("recovery_state", recoveryState);
  if (!row.update()) {
    throw new Error("Workspace recovery state could not be updated.");
  }
}

function ensureDiscardAllSuccessorChangeSet(
  workspaceSysId: string,
  payload: Extract<WorkspaceMutationClaimPayload, { kind: "discard_all" }>
) {
  const row = new GlideRecord(DOCSERA_WORKSPACE_CHANGE_SET_TABLE);
  if (row.get("generation_key", payload.successorGenerationKey)) {
    if (
      cleanText(row.getUniqueValue()) !== payload.successorChangeSetSysId ||
      cleanText(row.getValue("workspace")) !== workspaceSysId ||
      safeInteger(row.getValue("change_set_revision")) !== 0 ||
      safeInteger(row.getValue("next_pending_sequence")) !== 1 ||
      cleanText(row.getValue("command_correlation_id")) !== payload.commandId
    ) {
      throw new Error("Workspace discard-all successor generation is invalid.");
    }
    return;
  }
  row.initialize();
  row.setNewGuidValue(payload.successorChangeSetSysId);
  row.setValue("workspace", workspaceSysId);
  row.setValue("generation_key", payload.successorGenerationKey);
  row.setValue("change_set_revision", 0);
  row.setValue("next_pending_sequence", 1);
  row.setValue("lifecycle_state", "active");
  row.setValue("command_correlation_id", payload.commandId);
  row.setValue("recovery_state", "staged");
  if (!row.insert()) {
    throw new Error("Workspace discard-all could not create the successor change set.");
  }
}

function markPublishedChangeSetSuperseded(changeSetSysId: string, commandId: string, finalizedOn: string) {
  const row = new GlideRecord(DOCSERA_WORKSPACE_CHANGE_SET_TABLE);
  if (!row.get("sys_id", cleanText(changeSetSysId))) {
    throw new Error("Workspace discard-all could not finalize the source change set.");
  }
  if (cleanText(row.getValue("lifecycle_state")) !== "superseded") {
    row.setValue("lifecycle_state", "superseded");
  }
  row.setValue("command_correlation_id", commandId);
  row.setValue("finalized_on", finalizedOn);
  if (!row.update()) {
    throw new Error("Workspace discard-all could not finalize the source change set.");
  }
}

function markDiscardRecoverySwitched(successorChangeSetId: string, commandId: string) {
  const row = new GlideRecord(DOCSERA_WORKSPACE_CHANGE_SET_TABLE);
  if (!row.get("sys_id", cleanText(successorChangeSetId))) {
    throw new Error("Workspace discard recovery metadata is invalid.");
  }
  if (cleanText(row.getValue("command_correlation_id")) !== commandId) {
    throw new Error("Workspace discard recovery metadata is invalid.");
  }
  if (cleanText(row.getValue("recovery_state")) === "switched") {
    return;
  }
  row.setValue("recovery_state", "switched");
  if (!row.update()) {
    throw new Error("Workspace discard recovery state could not be updated.");
  }
}

function switchWorkspacePublishSelectors(input: {
  authority: WorkspaceMutationAuthority;
  dependencies: WorkspaceChangeSetPersistenceDependencies;
  payload: Extract<WorkspaceMutationClaimPayload, { kind: "publish" }>;
  snapshotSetSysId: string;
  workspace: WorkspaceRecord;
}): WorkspaceRecord {
  const workspaceSysId = cleanText(input.workspace.sysId);
  const priorSnapshotSetSysId = cleanText(input.workspace.publishedSnapshotSetSysId);
  const priorRevision = typeof input.workspace.workspaceStateRevision === "number" ? input.workspace.workspaceStateRevision : 0;
  const row = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
  row.addQuery("pending_change_set", input.authority.changeSetId);
  row.addQuery("published_snapshot_set", priorSnapshotSetSysId);
  row.addQuery("workspace_state_revision", priorRevision);
  row.query();
  let found = false;
  while (row.next()) {
    if (cleanText(row.getUniqueValue()) === workspaceSysId) {
      found = true;
      break;
    }
  }
  if (!found) {
    throw new Error("The active draft generation changed. Reload before publishing again.");
  }
  row.setValue("pending_change_set", input.payload.successorChangeSetSysId);
  row.setValue("published_snapshot_set", input.snapshotSetSysId);
  row.setValue("workspace_state_revision", priorRevision + 1);
  if (!row.update()) {
    throw new Error("Workspace publish could not update the workspace snapshot selectors.");
  }
  triggerDurablePhase(input.dependencies, "publish_selector_switched", {
    generationKey: buildMutationGenerationKey(input.authority),
    kind: "publish",
    snapshotPageKey: input.payload.snapshotKey
  });
  const reloaded = loadWorkspaceBySysId(workspaceSysId);
  if (!reloaded) {
    throw new Error("Workspace could not be reloaded after publishing.");
  }
  return reloaded;
}

function switchWorkspaceDiscardSelectors(input: {
  authority: WorkspaceMutationAuthority;
  dependencies: WorkspaceChangeSetPersistenceDependencies;
  payload: Extract<WorkspaceMutationClaimPayload, { kind: "discard_all" }>;
  workspace: WorkspaceRecord;
}): WorkspaceRecord {
  const workspaceSysId = cleanText(input.workspace.sysId);
  const priorSnapshotSetSysId = cleanText(input.workspace.publishedSnapshotSetSysId);
  const priorRevision = typeof input.workspace.workspaceStateRevision === "number" ? input.workspace.workspaceStateRevision : 0;
  const row = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
  row.addQuery("pending_change_set", input.authority.changeSetId);
  row.addQuery("published_snapshot_set", priorSnapshotSetSysId);
  row.addQuery("workspace_state_revision", priorRevision);
  row.query();
  let found = false;
  while (row.next()) {
    if (cleanText(row.getUniqueValue()) === workspaceSysId) {
      found = true;
      break;
    }
  }
  if (!found) {
    throw new Error("The active draft generation changed. Reload before discarding again.");
  }
  row.setValue("pending_change_set", input.payload.successorChangeSetSysId);
  row.setValue("workspace_state_revision", priorRevision + 1);
  if (!row.update()) {
    throw new Error("Workspace discard-all could not update the workspace change-set selector.");
  }
  markDiscardRecoverySwitched(input.payload.successorChangeSetSysId, input.payload.commandId);
  triggerDurablePhase(input.dependencies, "discard_selector_switched", {
    generationKey: buildMutationGenerationKey(input.authority),
    kind: "discard_all"
  });
  const reloaded = loadWorkspaceBySysId(workspaceSysId);
  if (!reloaded) {
    throw new Error("Workspace could not be reloaded after discarding changes.");
  }
  return reloaded;
}

function reconcilePublishedPageRows(input: {
  dependencies: WorkspaceChangeSetPersistenceDependencies;
  pages: SnapshotPage[];
  publishedBy: string;
  publishedOn: string;
  workspaceSysId: string;
}) {
  const byPageId = new Map(input.pages.map((page) => [page.pageId, page]));
  const rows = new GlideRecord(DOCSERA_PAGE_TABLE);
  rows.addQuery("workspace", input.workspaceSysId);
  rows.query();
  while (rows.next()) {
    const pageId = cleanText(rows.getUniqueValue());
    const page = byPageId.get(pageId);
    if (page) {
      rows.setValue("parent_page", page.parentPageId ?? "");
      rows.setValue("sibling_order", page.siblingOrder);
      rows.setValue("draft_title", page.title);
      rows.setValue("draft_slug", page.slug);
      rows.setValue("draft_slug_normalized", page.slug);
      rows.setValue("draft_content_json", page.contentJson);
      rows.setValue("draft_body_text", page.bodyText ?? "");
      rows.setValue("published_title", page.title);
      rows.setValue("published_slug", page.slug);
      rows.setValue("published_slug_normalized", page.slug);
      rows.setValue("published_content_json", page.contentJson);
      rows.setValue("published_body_text", page.bodyText ?? "");
      rows.setValue("published_on", input.publishedOn);
      rows.setValue("published_by", input.publishedBy);
      rows.setValue("publication_state", "published");
      rows.setValue("active", page.active);
    } else {
      rows.setValue("published_title", "");
      rows.setValue("published_slug", "");
      rows.setValue("published_slug_normalized", "");
      rows.setValue("published_content_json", "");
      rows.setValue("published_body_text", "");
      rows.setValue("publication_state", "draft");
      rows.setValue("active", false);
    }
    if (!rows.update()) {
      throw new Error("Workspace publish could not reconcile page records.");
    }
  }
  triggerDurablePhase(input.dependencies, "publish_page_rows_reconciled", {
    kind: "publish"
  });
}

function clearDiscardedPendingRows(changeSetId: string) {
  const entries = new GlideRecord(DOCSERA_WORKSPACE_CHANGE_ENTRY_TABLE);
  entries.addQuery("change_set", changeSetId);
  entries.query();
  while (entries.next()) {
    if (!entries.deleteRecord()) {
      throw new Error("Workspace discard-all could not clear pending change entries.");
    }
  }

  const batches = new GlideRecord(DOCSERA_WORKSPACE_REMOVAL_BATCH_TABLE);
  batches.addQuery("change_set", changeSetId);
  batches.query();
  const batchSysIds: string[] = [];
  while (batches.next()) {
    const batchSysId = cleanText(batches.getUniqueValue());
    if (batchSysId) {
      batchSysIds.push(batchSysId);
    }
  }

  const memberQueryBatchSize = 100;
  for (let offset = 0; offset < batchSysIds.length; offset += memberQueryBatchSize) {
    const members = new GlideRecord(DOCSERA_WORKSPACE_REMOVAL_MEMBER_TABLE);
    members.addQuery("removal_batch", "IN", batchSysIds.slice(offset, offset + memberQueryBatchSize).join(","));
    members.query();
    while (members.next()) {
      if (!members.deleteRecord()) {
        throw new Error("Workspace discard-all could not clear removal members.");
      }
    }
  }

  const batchesToDelete = new GlideRecord(DOCSERA_WORKSPACE_REMOVAL_BATCH_TABLE);
  batchesToDelete.addQuery("change_set", changeSetId);
  batchesToDelete.query();
  while (batchesToDelete.next()) {
    if (!batchesToDelete.deleteRecord()) {
      throw new Error("Workspace discard-all could not clear removal batches.");
    }
  }
}

function reconcileDiscardedPageRows(input: {
  dependencies: WorkspaceChangeSetPersistenceDependencies;
  discardedChangeSetId: string;
  pages: SnapshotPage[];
  workspaceSysId: string;
}) {
  const byPageId = new Map(input.pages.map((page) => [page.pageId, page]));
  const rows = new GlideRecord(DOCSERA_PAGE_TABLE);
  rows.addQuery("workspace", input.workspaceSysId);
  rows.query();
  while (rows.next()) {
    const pageId = cleanText(rows.getUniqueValue());
    const page = byPageId.get(pageId);
    if (!page) {
      if (!rows.deleteRecord()) {
        throw new Error("Workspace discard-all could not delete draft-only pages.");
      }
      continue;
    }
    rows.setValue("parent_page", page.parentPageId ?? "");
    rows.setValue("sibling_order", page.siblingOrder);
    rows.setValue("draft_title", page.title);
    rows.setValue("draft_slug", page.slug);
    rows.setValue("draft_slug_normalized", page.slug);
    rows.setValue("draft_content_json", page.contentJson);
    rows.setValue("draft_body_text", page.bodyText ?? "");
    rows.setValue("published_title", page.title);
    rows.setValue("published_slug", page.slug);
    rows.setValue("published_slug_normalized", page.slug);
    rows.setValue("published_content_json", page.contentJson);
    rows.setValue("published_body_text", page.bodyText ?? "");
    rows.setValue("publication_state", "published");
    rows.setValue("active", page.active);
    if (!rows.update()) {
      throw new Error("Workspace discard-all could not reconcile page records.");
    }
  }
  clearDiscardedPendingRows(input.discardedChangeSetId);
  triggerDurablePhase(input.dependencies, "discard_page_rows_reconciled", {
    kind: "discard_all"
  });
}

function loadPageRecordBySysId(pageSysId: string): PageRecord | null {
  const row = new GlideRecord(DOCSERA_PAGE_TABLE);
  if (!row.get("sys_id", cleanText(pageSysId))) {
    return null;
  }
  return mapPageRecord(row);
}

function abbreviateDisplayName(displayName: string): string {
  const safe = cleanText(displayName).replace(/[<>\r\n\t]/g, " ").replace(/\s+/g, " ");
  if (!safe || /@/.test(safe)) {
    return "";
  }
  const parts = safe.split(" ").filter(Boolean);
  if (parts.length < 2) {
    return safe;
  }
  const surname = parts[parts.length - 1] ?? "";
  const initial = parts[0]?.slice(0, 1) ?? "";
  return initial && surname ? `${initial}. ${surname}` : safe;
}

const UNKNOWN_USER_ATTRIBUTION = { accessibleLabel: "Last changed by Unknown user", displayName: "Unknown user", fullDisplayName: "Unknown user" };

function createAclUserRecord(): AclReadableRecord {
  try {
    if (typeof GlideRecordSecure !== "undefined") {
      return new GlideRecordSecure("sys_user");
    }
  } catch {
    // Fall through to the typed GlideRecord used by local tests.
  }
  return new GlideRecord("sys_user") as unknown as AclReadableRecord;
}

function canReadRecord(record: AclReadableRecord): boolean {
  return typeof record.canRead === "function" ? record.canRead() : false;
}

function canReadField(record: AclReadableRecord, fieldName: string): boolean {
  const element = typeof record.getElement === "function" ? record.getElement(fieldName) : null;
  if (element && typeof element.canRead === "function") {
    return element.canRead();
  }
  if (typeof record.canRead === "function" && record.canRead.length > 0) {
    return record.canRead(fieldName);
  }
  return false;
}

function readUserField(record: AclReadableRecord, fieldName: string): { readable: boolean; value: string } {
  const readable = canReadField(record, fieldName);
  return { readable, value: readable ? cleanText(record.getValue(fieldName)) : "" };
}

function readUserDisplayValue(record: AclReadableRecord): { readable: boolean; value: string } {
  const readable = canReadField(record, "name");
  return { readable, value: readable ? cleanText(record.getDisplayValue("name")) : "" };
}

function containsEmailAddress(value: string): boolean {
  return /[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+/.test(value);
}

function sameFolded(left: string, right: string): boolean {
  return Boolean(cleanText(left) && cleanText(right) && cleanText(left).toLowerCase() === cleanText(right).toLowerCase());
}

function isUnsafeUserDisplayValue(value: string, identifiers: { email?: string; login?: string; sysId?: string }): boolean {
  const candidate = cleanText(value);
  if (!candidate || /@/.test(candidate) || containsEmailAddress(candidate)) {
    return true;
  }
  return sameFolded(candidate, identifiers.email ?? "") || sameFolded(candidate, identifiers.login ?? "") || sameFolded(candidate, identifiers.sysId ?? "");
}

function isAmbiguousFallbackDisplayValue(value: string, readable: { email: boolean; login: boolean }): boolean {
  const candidate = cleanText(value);
  if (!candidate) {
    return true;
  }
  const parts = candidate.split(/\s+/).filter(Boolean);
  return parts.length < 2 && (!readable.login || !readable.email);
}

function buildAttribution(displayName: string, fullDisplayName: string) {
  const safeDisplayName = cleanText(displayName);
  const safeFullDisplayName = cleanText(fullDisplayName);
  if (!safeDisplayName || !safeFullDisplayName) {
    return UNKNOWN_USER_ATTRIBUTION;
  }
  return {
    accessibleLabel: `Last changed by ${safeFullDisplayName}`,
    displayName: safeDisplayName,
    fullDisplayName: safeFullDisplayName
  };
}

function readAttribution(userSysId: string) {
  const sysId = cleanText(userSysId);
  if (!sysId) {
    return UNKNOWN_USER_ATTRIBUTION;
  }
  const user = createAclUserRecord();
  if (!user.get("sys_id", sysId)) {
    return UNKNOWN_USER_ATTRIBUTION;
  }
  if (!canReadRecord(user)) {
    return UNKNOWN_USER_ATTRIBUTION;
  }
  const email = readUserField(user, "email");
  const login = readUserField(user, "user_name");
  const firstName = readUserField(user, "first_name");
  const lastName = readUserField(user, "last_name");
  if (firstName.value && lastName.value) {
    const fullDisplayName = cleanText(`${firstName.value} ${lastName.value}`);
    if (!isUnsafeUserDisplayValue(fullDisplayName, { email: email.value, login: login.value, sysId })) {
      return buildAttribution(`${firstName.value.slice(0, 1)}. ${lastName.value}`, fullDisplayName);
    }
  }
  const displayValue = readUserDisplayValue(user);
  if (!displayValue.readable || isUnsafeUserDisplayValue(displayValue.value, { email: email.value, login: login.value, sysId })) {
    return UNKNOWN_USER_ATTRIBUTION;
  }
  const abbreviatedDisplayName = abbreviateDisplayName(displayValue.value);
  if (!abbreviatedDisplayName || isAmbiguousFallbackDisplayValue(displayValue.value, { email: email.readable, login: login.readable })) {
    return UNKNOWN_USER_ATTRIBUTION;
  }
  return buildAttribution(abbreviatedDisplayName, displayValue.value);
}

function titleForPendingRow(
  row: ReturnType<typeof pendingEntries>[number],
  editTitles: Map<string, string>,
  publishedTitles: Map<string, string>,
  pageRecords: Map<string, PageRecord>
): string {
  const safeFallback = "Untitled page";
  if (row.category === "Removed") {
    return cleanText(publishedTitles.get(row.pageId)) || safeFallback;
  }
  if (editTitles.has(row.pageId)) {
    return cleanText(editTitles.get(row.pageId)) || safeFallback;
  }
  const page = pageRecords.get(row.pageId);
  return cleanText(page?.draftTitle || page?.publishedTitle) || safeFallback;
}

function normalizePendingCategory(category: string | null): WorkspacePendingChangeCategory | null {
  return category === "Added" || category === "Modified" || category === "Moved" || category === "Modified · Moved" || category === "Removed"
    ? category
    : null;
}

function isExpectedNextAuthority(current: WorkspaceMutationAuthority, prior: WorkspaceMutationAuthority): boolean {
  return current.changeSetId === prior.changeSetId && current.changeSetRevision === prior.changeSetRevision + 1;
}

function parseReplayResult<T>(resultJson: string): T {
  return JSON.parse(resultJson) as T;
}

function advanceRecoveredRemovalState(state: WorkspaceChangeSetState, batchKey: string): WorkspaceChangeSetState {
  const next: WorkspaceChangeSetState = {
    ...state,
    selectors: { ...state.selectors },
    changeSets: state.changeSets.map((changeSet) => ({ ...changeSet })),
    snapshotSets: state.snapshotSets.map((snapshot) => ({ ...snapshot, pages: snapshot.pages.map((page) => ({ ...page })) })),
    draftPages: state.draftPages.map((draftPage) => ({ ...draftPage })),
    entries: state.entries.map((entry) => ({ ...entry })),
    removalBatches: state.removalBatches.map((batch) => ({
      ...batch,
      members: batch.members.map((member) => ({ ...member }))
    })),
    commands: state.commands.map((command) => ({ ...command, result: { ...command.result } }))
  };
  const activeChangeSet = next.changeSets.find((changeSet) => changeSet.id === next.selectors.activeChangeSetId && changeSet.state === "active");
  const batch = next.removalBatches.find((candidate) => candidate.id === batchKey && candidate.changeSetId === next.selectors.activeChangeSetId);
  if (!activeChangeSet || !batch) {
    throw new Error("Recovered removal state is invalid.");
  }
  activeChangeSet.revision += 1;
  activeChangeSet.nextPendingSequence = Math.max(
    activeChangeSet.nextPendingSequence,
    ...batch.members.map((member) => member.firstPendingSequence + 1)
  );
  return next;
}

function reconstructClaimedRemovalBatch(
  state: WorkspaceChangeSetState,
  claim: WorkspaceMutationClaimRecord
): WorkspaceChangeSetState {
  if (claim.payload.kind !== "delete" || !claim.targetRemovalBatchKey) {
    throw new Error("Recovered removal claim is invalid.");
  }
  const existingBatch = state.removalBatches.find((batch) => batch.id === claim.targetRemovalBatchKey);
  const activeChangeSet = state.changeSets.find((changeSet) => changeSet.id === state.selectors.activeChangeSetId && changeSet.state === "active");
  if (!existingBatch || !activeChangeSet || existingBatch.changeSetId !== activeChangeSet.id) {
    throw new Error("Recovered removal batch is invalid.");
  }

  // Re-run the domain allocation against the pre-removal state. The claim is the
  // authority for the original subtree; the extant batch row only supplies its
  // durable identity and timestamps after an interrupted member write.
  const withoutExistingBatch: WorkspaceChangeSetState = {
    ...state,
    removalBatches: state.removalBatches.filter((batch) => batch.id !== existingBatch.id)
  };
  const reconstructed = createRemovalBatch(withoutExistingBatch, {
    expectedChangeSetId: claim.changeSetId,
    expectedChangeSetRevision: mutationGenerationRevision(claim.generationKey)
  }, {
    batchId: existingBatch.id,
    rootPageId: claim.payload.rootPageId,
    memberPageIds: claim.payload.memberPageIds,
    actorId: existingBatch.removedBy,
    changedOn: existingBatch.removedOn
  });
  if (reconstructed.kind !== "applied") {
    throw new Error("Recovered removal membership is invalid.");
  }
  const intendedBatch = reconstructed.state.removalBatches.find((batch) => batch.id === existingBatch.id);
  if (!intendedBatch) {
    throw new Error("Recovered removal membership is invalid.");
  }
  return {
    ...state,
    removalBatches: state.removalBatches.map((batch) => batch.id === existingBatch.id
      ? { ...batch, members: intendedBatch.members }
      : batch)
  };
}

function advanceRecoveredAddedDraftRemovalState(state: WorkspaceChangeSetState, memberPageIds: string[]): WorkspaceChangeSetState {
  const removedIds = new Set(memberPageIds.map((pageId) => cleanText(pageId)).filter(Boolean));
  const next: WorkspaceChangeSetState = {
    ...state,
    selectors: { ...state.selectors },
    changeSets: state.changeSets.map((changeSet) => ({ ...changeSet })),
    snapshotSets: state.snapshotSets.map((snapshot) => ({ ...snapshot, pages: snapshot.pages.map((page) => ({ ...page })) })),
    draftPages: state.draftPages.map((draftPage) => ({ ...draftPage })),
    entries: state.entries.map((entry) => ({ ...entry })),
    removalBatches: state.removalBatches.map((batch) => ({
      ...batch,
      members: batch.members.map((member) => ({ ...member }))
    })),
    commands: state.commands.map((command) => ({ ...command, result: { ...command.result } }))
  };
  const activeChangeSet = next.changeSets.find((changeSet) => changeSet.id === next.selectors.activeChangeSetId && changeSet.state === "active");
  if (!activeChangeSet || removedIds.size === 0) {
    throw new Error("Recovered Added draft removal state is invalid.");
  }
  next.draftPages = next.draftPages.filter((draftPage) => !removedIds.has(draftPage.pageId));
  next.entries = next.entries.filter((entry) => !(entry.changeSetId === activeChangeSet.id && removedIds.has(entry.pageId)));
  activeChangeSet.revision += 1;
  return next;
}

export function createServiceNowWorkspaceChangeSetPersistenceService(
  overrides: Partial<WorkspaceChangeSetPersistenceDependencies> = {}
) {
  const dependencies: WorkspaceChangeSetPersistenceDependencies = {
    ...createDefaultDependencies(),
    ...overrides
  };
  return {
    listPages(workspace: WorkspaceRecord, mode: "edit" | "live"): WorkspaceProjectionResult {
      try {
        const loaded = loadWorkspaceState(workspace, dependencies, mode);
        const recordMap = new Map(loaded.pageRecords.map((page) => [cleanText(page.sysId), page]));
        const projected = orderProjectionPages(mode === "live" ? projectLive(loaded.state) : projectEdit(loaded.state)).map((page) =>
          pageFromProjectionPage(page, recordMap.get(page.pageId), cleanText(loaded.workspace.sysId), mode)
        );
        return {
          kind: "succeeded",
          mode,
          pages: projected,
          state: loaded.state,
          workspace: loaded.workspace
        };
      } catch (error) {
        return {
          kind: "failed",
          errorMessage: cleanText(error instanceof Error ? error.message : error) || "Unable to load pages.",
          status: 409
        };
      }
    },

    savePageBody(input: {
      authority: WorkspaceMutationAuthority;
      draftContentJson: unknown;
      expectedRevision: number;
      pageSysId?: string;
      pageSlug?: string;
      workspace: WorkspaceRecord;
    }): WorkspaceBodySaveResult {
      try {
        const loaded = loadWorkspaceState(input.workspace, dependencies);
        const recoveryFailure = blockOnActiveDiscardRecovery(loaded);
        if (recoveryFailure) {
          return recoveryFailure;
        }
        const page = loaded.pageRecords.find((candidate) =>
          (cleanText(input.pageSysId) && cleanText(candidate.sysId) === cleanText(input.pageSysId)) ||
          (cleanText(input.pageSlug) && cleanText(candidate.draftSlugNormalized || candidate.draftSlug).toLowerCase() === cleanText(input.pageSlug).toLowerCase())
        );
        if (!page || !page.sysId) {
          return { kind: "failed", errorMessage: "Page could not be found.", status: 404 };
        }
        if (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0) {
          return { kind: "failed", errorMessage: "A non-negative expected draft revision is required.", status: 400 };
        }
        const pageId = cleanText(page.sysId);
        const generationKey = buildMutationGenerationKey(input.authority);
        const validatedDocument = parseServerDocument(input.draftContentJson);
        // Retain the stable payload's key order for the later persistence serializer.
        const desiredDocument = sortForSerialization(validatedDocument) as typeof validatedDocument;
        const canonicalDocument = JSON.stringify(desiredDocument);
        const existingClaim = loadMutationClaimByGeneration(generationKey);
        if (
          existingClaim &&
          (
            existingClaim.kind !== "body" ||
            existingClaim.targetPageSysId !== pageId ||
            existingClaim.payload.kind !== "body" ||
            existingClaim.payload.expectedRevision !== Number(input.expectedRevision) ||
            existingClaim.payload.draftContentJson !== canonicalDocument
          )
        ) {
          return staleFailure(nextAuthority(loaded.state));
        }
        let claim = existingClaim ?? {
          sysId: "",
          workspaceId: cleanText(loaded.workspace.sysId),
          changeSetId: input.authority.changeSetId,
          generationKey,
          mutationKey: buildMutationKey(dependencies, input.authority, "body", {
            kind: "body",
            pageSysId: pageId,
            draftContentJson: canonicalDocument,
            expectedRevision: Number(input.expectedRevision)
          }),
          kind: "body" as const,
          state: "claimed" as const,
          ownerKey: dependencies.randomKey("mutation-owner"),
          ownerExpiresOn: plusDuration(dependencies.currentTimestamp(), dependencies.ownerTimeoutMs),
          claimedOn: dependencies.currentTimestamp(),
          phase: "claimed" as const,
          payload: {
            kind: "body",
            pageSysId: pageId,
            draftContentJson: canonicalDocument,
            expectedRevision: Number(input.expectedRevision)
          },
          targetPageSysId: pageId
        };
        const acquired = acquireMutationClaim(dependencies, loaded.state, claim);
        if (acquired.kind === "failed") {
          return acquired.failure;
        }
        if (acquired.kind === "replay") {
          return {
            kind: "succeeded",
            authority: acquired.resultAuthority,
            result: parseReplayResult<{ page: PageRecord }>(acquired.resultJson)
          };
        }
        claim = acquired.claim;
        const executorKey = acquired.executorKey;
        const desiredBodyText = extractPlainTextFromServerDocument(desiredDocument) || null;
        let activePage = loadPageRecordBySysId(pageId);
        if (!activePage) {
          return { kind: "failed", errorMessage: "Page could not be found.", status: 404 };
        }
        let newlyPersisted = false;
        if (claim.phase === "claimed") {
          claim = requireClaimOwner(claim, executorKey);
          const activeRevision = safeInteger(activePage.draftRevision) ?? 0;
          const alreadyApplied =
            activeRevision === Number(input.expectedRevision) + 1 &&
            serializeDocument(activePage.draftContentJson) === canonicalDocument &&
            cleanText(activePage.draftBodyText) === cleanText(desiredBodyText);
          if (!alreadyApplied) {
            if (activeRevision !== Number(input.expectedRevision)) {
              return { kind: "failed", errorMessage: "This page has a newer saved draft. Reload before saving again.", status: 409, code: "invalid" };
            }
            activePage = {
              ...activePage,
              draftContentJson: desiredDocument,
              draftBodyText: desiredBodyText,
              draftRevision: activeRevision + 1
            };
            updateDraftPageRecord(activePage);
            newlyPersisted = !acquired.recovered;
            claim = persistClaimProgress(dependencies, claim, {
              appliedOn: dependencies.currentTimestamp(),
              phase: "page_persisted"
            }, executorKey);
            triggerDurablePhase(dependencies, "mutation_page_persisted", { generationKey, kind: "body", pageSysId: pageId });
          } else {
            claim = persistClaimProgress(dependencies, claim, {
              appliedOn: claim.appliedOn ?? dependencies.currentTimestamp(),
              phase: "page_persisted"
            }, executorKey);
          }
        }
        // Reuse only the projection validated by this newly acquired mutation.
        // Resumed and already-applied claims must reconstruct recovery state fully.
        const reuse = loadFreshWorkspaceForStateReuse(loaded, newlyPersisted);
        const recovered = reuse.unchanged
          ? { ...loaded, state: { ...loaded.state, draftPages: [
              ...loaded.state.draftPages.filter((draft) => draft.pageId !== pageId),
              ...buildDraftPages([activePage], loaded.state.snapshotSets[0].pages, new Set([pageId]))
            ] } }
          : loadWorkspaceState(reuse.workspace ?? input.workspace, dependencies);
        let resultAuthority = claim.resultAuthority;
        const recoveredAuthority = nextAuthority(recovered.state);
        const preparedAuthority = preparedResultAuthority(claim);
        if (!resultAuthority && claim.phase === "change_set_advancing" && authorityMatchesOrExceeds(recoveredAuthority, preparedAuthority)) {
          resultAuthority = preparedAuthority;
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: claim.appliedOn ?? dependencies.currentTimestamp(),
            phase: "change_set_persisted",
            resultAuthority,
            state: "applied"
          }, null);
        } else if (!resultAuthority && isExpectedNextAuthority(recoveredAuthority, input.authority)) {
          resultAuthority = recoveredAuthority;
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: claim.appliedOn ?? dependencies.currentTimestamp(),
            phase: "change_set_persisted",
            resultAuthority,
            state: "applied"
          }, null);
        }
        if (!resultAuthority) {
          claim = requireClaimOwner(claim, executorKey);
          const changedOn = claim.appliedOn ?? dependencies.currentTimestamp();
          const changed = recordPendingChange(recovered.state, {
            expectedChangeSetId: input.authority.changeSetId,
            expectedChangeSetRevision: input.authority.changeSetRevision
          }, {
            pageId,
            actorId: dependencies.currentUserSysId(),
            changedOn
          });
          if (changed.kind !== "applied") {
            return staleFailure(changed.current);
          }
          refreshEntriesForPage(changed.state, pageId);
          upsertChangeEntry(changed.state, pageId);
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: changedOn,
            phase: "entry_persisted"
          }, executorKey);
          triggerDurablePhase(dependencies, "mutation_entry_persisted", { generationKey, kind: "body", pageSysId: pageId });
          claim = requireClaimOwner(claim, executorKey);
          const persistedResult = { page: activePage };
          const persistedResultJson = stableSerialize(persistedResult);
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: changedOn,
            phase: "change_set_advancing",
            resultJson: persistedResultJson
          }, executorKey);
          claim = requireDurableChangeSetAdvancingMarker(claim, executorKey, persistedResultJson);
          updateChangeSetRow(changed.state);
          triggerDurablePhase(dependencies, "mutation_change_set_row_updated", { generationKey, kind: "body", pageSysId: pageId });
          resultAuthority = preparedResultAuthority(claim);
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: changedOn,
            phase: "change_set_persisted",
            resultAuthority,
            state: "applied"
          }, null);
          triggerDurablePhase(dependencies, "mutation_change_set_persisted", { generationKey, kind: "body", pageSysId: pageId });
        }
        if (claim.phase === "change_set_persisted" && resultAuthority) {
          if (!claim.resultJson) {
            activePage = loadPageRecordBySysId(pageId);
            if (!activePage) {
              throw new Error("Recovered body result could not be loaded.");
            }
            claim = {
              ...claim,
              resultJson: stableSerialize({ page: activePage })
            };
          }
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: claim.appliedOn ?? dependencies.currentTimestamp(),
            phase: "result_persisted",
            resultAuthority,
            resultJson: claim.resultJson,
            state: "applied"
          }, null);
          triggerDurablePhase(dependencies, "mutation_result_persisted", { generationKey, kind: "body", pageSysId: pageId });
        }
        if (!claim.resultAuthority || !claim.resultJson) {
          throw new Error("Recovered body result could not be persisted.");
        }
        const replayed = parseReplayResult<{ page: PageRecord }>(claim.resultJson);
        claim = finalizeMutationClaim(dependencies, claim, claim.resultAuthority, replayed, null);
        triggerDurablePhase(dependencies, "mutation_finalized", { generationKey, kind: "body", pageSysId: pageId });
        const result: WorkspaceBodySaveResult = {
          kind: "succeeded",
          authority: claim.resultAuthority,
          result: replayed
        };
        return result;
      } catch (error) {
        return {
          kind: "failed",
          errorMessage: cleanText(error instanceof Error ? error.message : error) || "Something went wrong while saving the page body. Please try again.",
          status: 500
        };
      }
    },

    /**
     * Recover only the active generation's expired body-save claim.  The
     * caller supplies no generation, owner, page, or document authority:
     * those values are reconstructed from the durable claim before entering
     * the normal body-save replay path.
     */
    recoverAbandonedBodySave(workspace: WorkspaceRecord): WorkspaceBodySaveRecoveryResult {
      try {
        const loaded = loadWorkspaceState(workspace, dependencies);
        const authority = nextAuthority(loaded.state);
        const claim = loadMutationClaimByGeneration(buildMutationGenerationKey(authority));
        if (!claim || claim.workspaceId !== cleanText(loaded.workspace.sysId)) {
          return { kind: "already_resolved", authority };
        }
        if (claim.state === "finalized" || claim.phase === "finalized") {
          return { kind: "already_resolved", authority: claim.resultAuthority ?? authority };
        }
        if (claim.kind !== "body" || claim.payload.kind !== "body") {
          return { kind: "unsupported", authority };
        }
        if (!claimOwnerExpired(claim, dependencies.currentTimestamp())) {
          return { kind: "executor_active", authority };
        }
        const resumed = this.savePageBody({
          authority: {
            changeSetId: claim.changeSetId,
            changeSetRevision: mutationGenerationRevision(claim.generationKey)
          },
          draftContentJson: claim.payload.draftContentJson,
          expectedRevision: claim.payload.expectedRevision,
          pageSysId: claim.payload.pageSysId,
          workspace: loaded.workspace
        });
        if (resumed.kind === "succeeded") {
          return { kind: "recovered", authority: resumed.authority };
        }
        if (resumed.kind === "failed" && resumed.status === 409 && resumed.errorMessage === "This draft mutation is already in progress. Retry after the current request finishes.") {
          return { kind: "executor_active", authority: resumed.currentChangeSetId && typeof resumed.currentChangeSetRevision === "number"
            ? { changeSetId: resumed.currentChangeSetId, changeSetRevision: resumed.currentChangeSetRevision }
            : authority };
        }
        return { kind: "failed", authority, status: resumed.kind === "failed" && resumed.status === 409 ? 409 : 500 };
      } catch {
        // Claim payloads and document contents are deliberately never exposed.
        try {
          const reloaded = loadWorkspaceState(workspace, dependencies);
          return { kind: "failed", authority: nextAuthority(reloaded.state), status: 500 };
        } catch {
          return { kind: "failed", authority: { changeSetId: "", changeSetRevision: 0 }, status: 500 };
        }
      }
    },

    savePageSettings(input: {
      authority: WorkspaceMutationAuthority;
      pageSysId: string;
      slug: string;
      title: string;
      workspace: WorkspaceRecord;
    }): WorkspaceSettingsSaveResult {
      try {
        const loaded = loadWorkspaceState(input.workspace, dependencies);
        const recoveryFailure = blockOnActiveDiscardRecovery(loaded);
        if (recoveryFailure) {
          return recoveryFailure;
        }
        const page = loaded.pageRecords.find((candidate) => cleanText(candidate.sysId) === cleanText(input.pageSysId));
        if (!page || !page.sysId) {
          return { kind: "failed", errorMessage: "Page could not be found.", status: 404 };
        }
        const pageId = cleanText(page.sysId);
        const generationKey = buildMutationGenerationKey(input.authority);
        const desiredSlug = cleanText(input.slug).toLowerCase();
        const desiredTitle = cleanText(input.title);
        const existingClaim = loadMutationClaimByGeneration(generationKey);
        if (
          existingClaim &&
          (
            existingClaim.kind !== "settings" ||
            existingClaim.targetPageSysId !== pageId ||
            existingClaim.payload.kind !== "settings" ||
            existingClaim.payload.slug !== desiredSlug ||
            existingClaim.payload.title !== desiredTitle
          )
        ) {
          return staleFailure(nextAuthority(loaded.state));
        }
        let claim = existingClaim ?? {
          sysId: "",
          workspaceId: cleanText(loaded.workspace.sysId),
          changeSetId: input.authority.changeSetId,
          generationKey,
          mutationKey: buildMutationKey(dependencies, input.authority, "settings", {
            kind: "settings",
            pageSysId: pageId,
            slug: desiredSlug,
            title: desiredTitle
          }),
          kind: "settings" as const,
          state: "claimed" as const,
          ownerKey: dependencies.randomKey("mutation-owner"),
          ownerExpiresOn: plusDuration(dependencies.currentTimestamp(), dependencies.ownerTimeoutMs),
          claimedOn: dependencies.currentTimestamp(),
          phase: "claimed" as const,
          payload: {
            kind: "settings",
            pageSysId: pageId,
            slug: desiredSlug,
            title: desiredTitle
          },
          targetPageSysId: pageId
        };
        const acquired = acquireMutationClaim(dependencies, loaded.state, claim);
        if (acquired.kind === "failed") {
          return acquired.failure;
        }
        if (acquired.kind === "replay") {
          return {
            kind: "succeeded",
            authority: acquired.resultAuthority,
            result: parseReplayResult<{ page: PageRecord }>(acquired.resultJson)
          };
        }
        claim = acquired.claim;
        const executorKey = acquired.executorKey;
        let activePage = loadPageRecordBySysId(pageId);
        if (!activePage) {
          return { kind: "failed", errorMessage: "Page could not be found.", status: 404 };
        }
        let newlyPersisted = false;
        if (claim.phase === "claimed") {
          claim = requireClaimOwner(claim, executorKey);
          if (
            cleanText(activePage.draftTitle) !== desiredTitle ||
            cleanText(activePage.draftSlugNormalized || activePage.draftSlug) !== desiredSlug
          ) {
            activePage = {
              ...activePage,
              draftTitle: desiredTitle,
              draftSlug: desiredSlug,
              draftSlugNormalized: desiredSlug
            };
            updateDraftPageRecord(activePage);
            newlyPersisted = !acquired.recovered;
            claim = persistClaimProgress(dependencies, claim, {
              appliedOn: dependencies.currentTimestamp(),
              phase: "page_persisted"
            }, executorKey);
            triggerDurablePhase(dependencies, "mutation_page_persisted", { generationKey, kind: "settings", pageSysId: pageId });
          } else {
            claim = persistClaimProgress(dependencies, claim, {
              appliedOn: claim.appliedOn ?? dependencies.currentTimestamp(),
              phase: "page_persisted"
            }, executorKey);
          }
        }
        // Only a newly persisted, newly acquired mutation can reuse the validated projection.
        const reuse = loadFreshWorkspaceForStateReuse(loaded, newlyPersisted);
        const recovered = reuse.unchanged
          ? { ...loaded, state: { ...loaded.state, draftPages: [
              ...loaded.state.draftPages.filter((draft) => draft.pageId !== pageId),
              ...buildDraftPages([activePage], loaded.state.snapshotSets[0].pages, new Set([pageId]))
            ] } }
          : loadWorkspaceState(reuse.workspace ?? input.workspace, dependencies);
        let resultAuthority = claim.resultAuthority;
        const recoveredAuthority = nextAuthority(recovered.state);
        const preparedAuthority = preparedResultAuthority(claim);
        if (!resultAuthority && claim.phase === "change_set_advancing" && authorityMatchesOrExceeds(recoveredAuthority, preparedAuthority)) {
          resultAuthority = preparedAuthority;
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: claim.appliedOn ?? dependencies.currentTimestamp(),
            phase: "change_set_persisted",
            resultAuthority,
            state: "applied"
          }, null);
        } else if (!resultAuthority && isExpectedNextAuthority(recoveredAuthority, input.authority)) {
          resultAuthority = recoveredAuthority;
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: claim.appliedOn ?? dependencies.currentTimestamp(),
            phase: "change_set_persisted",
            resultAuthority,
            state: "applied"
          }, null);
        }
        if (!resultAuthority) {
          claim = requireClaimOwner(claim, executorKey);
          const changedOn = claim.appliedOn ?? dependencies.currentTimestamp();
          const changed = recordPendingChange(recovered.state, {
            expectedChangeSetId: input.authority.changeSetId,
            expectedChangeSetRevision: input.authority.changeSetRevision
          }, {
            pageId,
            actorId: dependencies.currentUserSysId(),
            changedOn
          });
          if (changed.kind !== "applied") {
            return staleFailure(changed.current);
          }
          refreshEntriesForPage(changed.state, pageId);
          upsertChangeEntry(changed.state, pageId);
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: changedOn,
            phase: "entry_persisted"
          }, executorKey);
          triggerDurablePhase(dependencies, "mutation_entry_persisted", { generationKey, kind: "settings", pageSysId: pageId });
          claim = requireClaimOwner(claim, executorKey);
          const persistedResult = { page: activePage };
          const persistedResultJson = stableSerialize(persistedResult);
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: changedOn,
            phase: "change_set_advancing",
            resultJson: persistedResultJson
          }, executorKey);
          claim = requireDurableChangeSetAdvancingMarker(claim, executorKey, persistedResultJson);
          updateChangeSetRow(changed.state);
          triggerDurablePhase(dependencies, "mutation_change_set_row_updated", { generationKey, kind: "settings", pageSysId: pageId });
          resultAuthority = preparedResultAuthority(claim);
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: changedOn,
            phase: "change_set_persisted",
            resultAuthority,
            state: "applied"
          }, null);
          triggerDurablePhase(dependencies, "mutation_change_set_persisted", { generationKey, kind: "settings", pageSysId: pageId });
        }
        if (claim.phase === "change_set_persisted" && resultAuthority) {
          if (!claim.resultJson) {
            activePage = loadPageRecordBySysId(pageId);
            if (!activePage) {
              throw new Error("Recovered settings result could not be loaded.");
            }
            claim = {
              ...claim,
              resultJson: stableSerialize({ page: activePage })
            };
          }
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: claim.appliedOn ?? dependencies.currentTimestamp(),
            phase: "result_persisted",
            resultAuthority,
            resultJson: claim.resultJson,
            state: "applied"
          }, null);
          triggerDurablePhase(dependencies, "mutation_result_persisted", { generationKey, kind: "settings", pageSysId: pageId });
        }
        if (!claim.resultAuthority || !claim.resultJson) {
          throw new Error("Recovered settings result could not be persisted.");
        }
        const replayed = parseReplayResult<{ page: PageRecord }>(claim.resultJson);
        claim = finalizeMutationClaim(dependencies, claim, claim.resultAuthority, replayed, null);
        triggerDurablePhase(dependencies, "mutation_finalized", { generationKey, kind: "settings", pageSysId: pageId });
        const result: WorkspaceSettingsSaveResult = {
          kind: "succeeded",
          authority: claim.resultAuthority,
          result: replayed
        };
        return result;
      } catch (error) {
        return {
          kind: "failed",
          errorMessage: cleanText(error instanceof Error ? error.message : error) || "Something went wrong while saving page settings. Your changes were not saved. Please try again.",
          status: 500
        };
      }
    },

    createPage(input: {
      authority: WorkspaceMutationAuthority;
      parentPageSysId?: string | null;
      title: string;
      workspace: WorkspaceRecord;
    }): WorkspaceCreateResult {
      try {
        const loaded = loadWorkspaceState(input.workspace, dependencies);
        const recoveryFailure = blockOnActiveDiscardRecovery(loaded);
        if (recoveryFailure) {
          return recoveryFailure;
        }
        const parentId = cleanText(input.parentPageSysId);
        const generationKey = buildMutationGenerationKey(input.authority);
        const title = cleanText(input.title);
        const existingClaim = loadMutationClaimByGeneration(generationKey);
        if (
          existingClaim &&
          (
            existingClaim.kind !== "create" ||
            existingClaim.payload.kind !== "create" ||
            cleanText(existingClaim.payload.parentPageSysId) !== parentId ||
            existingClaim.payload.title !== title
          )
        ) {
          return staleFailure(nextAuthority(loaded.state));
        }
        let claim = existingClaim ?? {
          sysId: "",
          workspaceId: cleanText(loaded.workspace.sysId),
          changeSetId: input.authority.changeSetId,
          generationKey,
          mutationKey: buildMutationKey(dependencies, input.authority, "create", {
            kind: "create",
            parentPageSysId: parentId || null,
            title
          }),
          kind: "create" as const,
          state: "claimed" as const,
          ownerKey: dependencies.randomKey("mutation-owner"),
          ownerExpiresOn: plusDuration(dependencies.currentTimestamp(), dependencies.ownerTimeoutMs),
          claimedOn: dependencies.currentTimestamp(),
          phase: "claimed" as const,
          payload: {
            kind: "create",
            parentPageSysId: parentId || null,
            title
          },
          targetPageSysId: dependencies.createDeterministicSysId(`${generationKey}\ncreate\n${parentId}\n${title}`)
        };
        const acquired = acquireMutationClaim(dependencies, loaded.state, claim);
        if (acquired.kind === "failed") {
          return acquired.failure;
        }
        if (acquired.kind === "replay") {
          return {
            kind: "succeeded",
            authority: acquired.resultAuthority,
            result: parseReplayResult<{ page: PageRecord }>(acquired.resultJson)
          };
        }
        claim = acquired.claim;
        const executorKey = acquired.executorKey;
        let activePage = loadPageRecordBySysId(claim.targetPageSysId ?? "");
        let newlyInserted = false;
        if (claim.phase === "claimed") {
          const editPages = projectEdit(loaded.state);
          if (parentId && !editPages.some((page) => cleanText(page.pageId) === parentId)) {
            return { kind: "failed", errorMessage: "A valid parent page is required.", status: 400 };
          }
          claim = requireClaimOwner(claim, executorKey);
          if (!activePage) {
            const draft = createPageDraft({
              title,
              workspaceSysId: cleanText(loaded.workspace.sysId),
              parentPageSysId: parentId || null,
              parentPageWorkspaceSysId: cleanText(loaded.workspace.sysId),
              active: true
            }, editPages.map((page) => ({
              workspaceSysId: cleanText(loaded.workspace.sysId),
              parentPageSysId: page.parentPageId ?? undefined,
              siblingOrder: normalizeSiblingOrder(page.siblingOrder),
              slug: page.slug
            })));
            activePage = insertPageRecord(draft, claim.targetPageSysId ?? "");
            newlyInserted = !acquired.recovered;
            claim = persistClaimProgress(dependencies, claim, {
              appliedOn: dependencies.currentTimestamp(),
              phase: "page_persisted"
            }, executorKey);
            triggerDurablePhase(dependencies, "mutation_page_persisted", {
              generationKey,
              kind: "create",
              pageSysId: cleanText(activePage.sysId)
            });
          } else {
            claim = persistClaimProgress(dependencies, claim, {
              appliedOn: claim.appliedOn ?? dependencies.currentTimestamp(),
              phase: "page_persisted"
            }, executorKey);
          }
        }
        // Only a newly acquired claim that inserted its own page can reuse the
        // validated projection. Resumed claims retain the full recovery load.
        const reuse = loadFreshWorkspaceForStateReuse(loaded, newlyInserted);
        const recovered = reuse.unchanged && activePage
          ? { ...loaded, state: { ...loaded.state, draftPages: [
              ...loaded.state.draftPages,
              ...buildDraftPages([activePage], [], new Set([cleanText(activePage.sysId)]))
            ] } }
          : loadWorkspaceState(reuse.workspace ?? input.workspace, dependencies);
        let resultAuthority = claim.resultAuthority;
        const recoveredAuthority = nextAuthority(recovered.state);
        const preparedAuthority = preparedResultAuthority(claim);
        if (!resultAuthority && claim.phase === "change_set_advancing" && authorityMatchesOrExceeds(recoveredAuthority, preparedAuthority)) {
          resultAuthority = preparedAuthority;
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: claim.appliedOn ?? dependencies.currentTimestamp(),
            phase: "change_set_persisted",
            resultAuthority,
            state: "applied"
          }, null);
        } else if (!resultAuthority && isExpectedNextAuthority(recoveredAuthority, input.authority)) {
          resultAuthority = recoveredAuthority;
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: claim.appliedOn ?? dependencies.currentTimestamp(),
            phase: "change_set_persisted",
            resultAuthority,
            state: "applied"
          }, null);
        }
        if (!resultAuthority) {
          claim = requireClaimOwner(claim, executorKey);
          const createdPageId = claim.targetPageSysId ?? "";
          const changedOn = claim.appliedOn ?? dependencies.currentTimestamp();
          const changed = recordPendingChange(recovered.state, {
            expectedChangeSetId: input.authority.changeSetId,
            expectedChangeSetRevision: input.authority.changeSetRevision
          }, {
            pageId: createdPageId,
            actorId: dependencies.currentUserSysId(),
            changedOn
          });
          if (changed.kind !== "applied") {
            return staleFailure(changed.current);
          }
          refreshEntriesForPage(changed.state, createdPageId);
          upsertChangeEntry(changed.state, createdPageId);
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: changedOn,
            phase: "entry_persisted"
          }, executorKey);
          triggerDurablePhase(dependencies, "mutation_entry_persisted", { generationKey, kind: "create", pageSysId: createdPageId });
          claim = requireClaimOwner(claim, executorKey);
          const persistedResult = { page: activePage };
          const persistedResultJson = stableSerialize(persistedResult);
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: changedOn,
            phase: "change_set_advancing",
            resultJson: persistedResultJson
          }, executorKey);
          claim = requireDurableChangeSetAdvancingMarker(claim, executorKey, persistedResultJson);
          updateChangeSetRow(changed.state);
          triggerDurablePhase(dependencies, "mutation_change_set_row_updated", { generationKey, kind: "create", pageSysId: createdPageId });
          resultAuthority = preparedResultAuthority(claim);
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: changedOn,
            phase: "change_set_persisted",
            resultAuthority,
            state: "applied"
          }, null);
          triggerDurablePhase(dependencies, "mutation_change_set_persisted", { generationKey, kind: "create", pageSysId: createdPageId });
        }
        if (claim.phase === "change_set_persisted" && resultAuthority) {
          if (!claim.resultJson) {
            activePage = loadPageRecordBySysId(claim.targetPageSysId ?? "");
            if (!activePage) {
              throw new Error("Recovered created page could not be loaded.");
            }
            claim = {
              ...claim,
              resultJson: stableSerialize({ page: activePage })
            };
          }
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: claim.appliedOn ?? dependencies.currentTimestamp(),
            phase: "result_persisted",
            resultAuthority,
            resultJson: claim.resultJson,
            state: "applied"
          }, null);
          triggerDurablePhase(dependencies, "mutation_result_persisted", {
            generationKey,
            kind: "create",
            pageSysId: cleanText(activePage.sysId)
          });
        }
        if (!claim.resultAuthority || !claim.resultJson) {
          throw new Error("Recovered create result could not be persisted.");
        }
        const replayed = parseReplayResult<{ page: PageRecord }>(claim.resultJson);
        claim = finalizeMutationClaim(dependencies, claim, claim.resultAuthority, replayed, null);
        triggerDurablePhase(dependencies, "mutation_finalized", {
          generationKey,
          kind: "create",
          pageSysId: cleanText(replayed.page.sysId)
        });
        const result: WorkspaceCreateResult = {
          kind: "succeeded",
          authority: claim.resultAuthority,
          result: replayed
        };
        return result;
      } catch (error) {
        return {
          kind: "failed",
          errorMessage: cleanText(error instanceof Error ? error.message : error) || "Something went wrong while creating the page. The page was not created. Please try again.",
          status: 500
        };
      }
    },

    deletePage(input: {
      authority: WorkspaceMutationAuthority;
      pageSysId: string;
      workspace: WorkspaceRecord;
    }): WorkspaceDeleteResult {
      try {
        const loaded = loadWorkspaceState(input.workspace, dependencies);
        const recoveryFailure = blockOnActiveDiscardRecovery(loaded);
        if (recoveryFailure) {
          return recoveryFailure;
        }
        const pageId = cleanText(input.pageSysId);
        const generationKey = buildMutationGenerationKey(input.authority);
        const existingClaim = loadMutationClaimByGeneration(generationKey);
        let memberPageIds: string[] = [];
        let nextPageSysId = "";
        if (existingClaim) {
          if (existingClaim.kind !== "delete" || existingClaim.payload.kind !== "delete" || cleanText(existingClaim.payload.pageSysId) !== pageId) {
            return staleFailure(nextAuthority(loaded.state));
          }
          memberPageIds = [...existingClaim.payload.memberPageIds];
          nextPageSysId = cleanText(existingClaim.targetNextPageSysId);
        } else {
          const editProjection = this.listPages(loaded.workspace, "edit");
          if (editProjection.kind !== "succeeded") {
            return editProjection;
          }
          memberPageIds = collectPageSubtreeSysIds(editProjection.pages, pageId);
          if (!memberPageIds.length) {
            return { kind: "failed", errorMessage: "Page could not be found.", status: 404 };
          }
          const targetCategory = deriveChangeCategory(loaded.state, pageId);
          const addedIds = new Set(loaded.state.draftPages.filter((page) => !page.hasPublishedIdentity).map((page) => page.pageId));
          const containsAddedDescendant = memberPageIds.some((memberPageId) => memberPageId !== pageId && addedIds.has(memberPageId));
          if (targetCategory !== "Added" && containsAddedDescendant) {
            return {
              kind: "failed",
              code: "unsupported",
              errorMessage: "Removing published subtrees with Added draft-only descendants is not supported yet.",
              status: 400
            };
          }
          nextPageSysId = pickNextVisiblePageAfterDelete(editProjection.pages, pageId);
        }
        const deletesAddedDraftOnlyPage = !loaded.state.snapshotSets
          .find((snapshot) => snapshot.id === loaded.state.selectors.publishedSnapshotSetId && snapshot.workspaceId === loaded.state.selectors.workspaceId)
          ?.pages.some((page) => page.pageId === pageId);
        let claim = existingClaim ?? {
          sysId: "",
          workspaceId: cleanText(loaded.workspace.sysId),
          changeSetId: input.authority.changeSetId,
          generationKey,
          mutationKey: buildMutationKey(dependencies, input.authority, "delete", {
            kind: "delete",
            pageSysId: pageId,
            rootPageId: pageId,
            memberPageIds
          }),
          kind: "delete" as const,
          state: "claimed" as const,
          ownerKey: dependencies.randomKey("mutation-owner"),
          ownerExpiresOn: plusDuration(dependencies.currentTimestamp(), dependencies.ownerTimeoutMs),
          claimedOn: dependencies.currentTimestamp(),
          phase: "claimed" as const,
          payload: {
            kind: "delete",
            pageSysId: pageId,
            rootPageId: pageId,
            memberPageIds
          },
          targetNextPageSysId: nextPageSysId,
          targetPageSysId: pageId,
          targetRemovalBatchKey: deletesAddedDraftOnlyPage ? undefined : `${input.authority.changeSetId}:${input.authority.changeSetRevision}:${pageId}`
        };
        const acquired = acquireMutationClaim(dependencies, loaded.state, claim);
        if (acquired.kind === "failed") {
          return acquired.failure;
        }
        if (acquired.kind === "replay") {
          return {
            kind: "succeeded",
            authority: acquired.resultAuthority,
            result: parseReplayResult<{ deletedPageSysId: string; nextPageSysId: string }>(acquired.resultJson)
          };
        }
        claim = acquired.claim;
        const executorKey = acquired.executorKey;
        if (claim.phase === "claimed") {
          claim = requireClaimOwner(claim, executorKey);
          const existingBatch = claim.targetRemovalBatchKey
            ? loaded.state.removalBatches.find((batch) => batch.id === claim.targetRemovalBatchKey)
            : null;
          if (!existingBatch) {
            const changedOn = dependencies.currentTimestamp();
            const changed = claim.targetRemovalBatchKey
              ? createRemovalBatch(loaded.state, {
                  expectedChangeSetId: input.authority.changeSetId,
                  expectedChangeSetRevision: input.authority.changeSetRevision
                }, {
                  batchId: claim.targetRemovalBatchKey,
                  rootPageId: pageId,
                  memberPageIds,
                  actorId: dependencies.currentUserSysId(),
                  changedOn
                })
              : discardPageChanges(loaded.state, {
                  expectedChangeSetId: input.authority.changeSetId,
                  expectedChangeSetRevision: input.authority.changeSetRevision
                }, {
                  actorId: dependencies.currentUserSysId(),
                  changedOn,
                  pageId,
                  targetAffectedPageIds: memberPageIds,
                  targetCategory: "Added"
                });
            if (changed.kind !== "applied") {
              return changed.kind === "stale"
                ? staleFailure(changed.current)
                : { kind: "failed", code: "invalid", errorMessage: changed.reason, status: 400 };
            }
            if (claim.targetRemovalBatchKey) {
              replaceRemovalBatches(changed.state);
            } else {
              for (const memberPageId of memberPageIds) {
                upsertChangeEntry(changed.state, memberPageId);
              }
              deleteDraftPageRecords(memberPageIds);
            }
            claim = persistClaimProgress(dependencies, claim, {
              appliedOn: changedOn,
              phase: "removal_persisted"
            }, executorKey);
            triggerDurablePhase(dependencies, "mutation_removal_persisted", {
              batchKey: claim.targetRemovalBatchKey,
              generationKey,
              kind: "delete",
              pageSysId: pageId
            });
          } else {
            const reconciled = reconstructClaimedRemovalBatch(loaded.state, claim);
            replaceRemovalBatches(reconciled);
            claim = persistClaimProgress(dependencies, claim, {
              appliedOn: claim.appliedOn ?? dependencies.currentTimestamp(),
              phase: "removal_persisted"
            }, executorKey);
          }
        }
        const recovered = loadWorkspaceState(input.workspace, dependencies);
        let resultAuthority = claim.resultAuthority;
        const recoveredAuthority = nextAuthority(recovered.state);
        const preparedAuthority = preparedResultAuthority(claim);
        if (!resultAuthority && claim.phase === "change_set_advancing" && authorityMatchesOrExceeds(recoveredAuthority, preparedAuthority)) {
          resultAuthority = preparedAuthority;
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: claim.appliedOn ?? dependencies.currentTimestamp(),
            phase: "change_set_persisted",
            resultAuthority,
            state: "applied"
          }, null);
        } else if (!resultAuthority && isExpectedNextAuthority(recoveredAuthority, input.authority)) {
          resultAuthority = recoveredAuthority;
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: claim.appliedOn ?? dependencies.currentTimestamp(),
            phase: "change_set_persisted",
            resultAuthority,
            state: "applied"
          }, null);
        }
        if (!resultAuthority) {
          claim = requireClaimOwner(claim, executorKey);
          const nextState = claim.targetRemovalBatchKey
            ? advanceRecoveredRemovalState(recovered.state, claim.targetRemovalBatchKey)
            : advanceRecoveredAddedDraftRemovalState(recovered.state, memberPageIds);
          const persistedResult = {
            deletedPageSysId: pageId,
            nextPageSysId: cleanText(claim.targetNextPageSysId)
          };
          const persistedResultJson = stableSerialize(persistedResult);
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: claim.appliedOn ?? dependencies.currentTimestamp(),
            phase: "change_set_advancing",
            resultJson: persistedResultJson
          }, executorKey);
          claim = requireDurableChangeSetAdvancingMarker(claim, executorKey, persistedResultJson);
          updateChangeSetRow(nextState);
          triggerDurablePhase(dependencies, "mutation_change_set_row_updated", {
            batchKey: claim.targetRemovalBatchKey,
            generationKey,
            kind: "delete",
            pageSysId: pageId
          });
          resultAuthority = preparedResultAuthority(claim);
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: claim.appliedOn ?? dependencies.currentTimestamp(),
            phase: "change_set_persisted",
            resultAuthority,
            state: "applied"
          }, null);
          triggerDurablePhase(dependencies, "mutation_change_set_persisted", {
            batchKey: claim.targetRemovalBatchKey,
            generationKey,
            kind: "delete",
            pageSysId: pageId
          });
        }
        if (claim.phase === "change_set_persisted" && resultAuthority) {
          const persistedResult = claim.resultJson
            ? parseReplayResult<{ deletedPageSysId: string; nextPageSysId: string }>(claim.resultJson)
            : {
                deletedPageSysId: pageId,
                nextPageSysId: cleanText(claim.targetNextPageSysId)
              };
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: claim.appliedOn ?? dependencies.currentTimestamp(),
            phase: "result_persisted",
            resultAuthority,
            resultJson: stableSerialize(persistedResult),
            state: "applied"
          }, null);
          triggerDurablePhase(dependencies, "mutation_result_persisted", {
            batchKey: claim.targetRemovalBatchKey,
            generationKey,
            kind: "delete",
            pageSysId: pageId
          });
        }
        if (!claim.resultAuthority || !claim.resultJson) {
          throw new Error("Recovered delete result could not be persisted.");
        }
        const replayed = parseReplayResult<{ deletedPageSysId: string; nextPageSysId: string }>(claim.resultJson);
        claim = finalizeMutationClaim(dependencies, claim, claim.resultAuthority, replayed, null);
        triggerDurablePhase(dependencies, "mutation_finalized", {
          batchKey: claim.targetRemovalBatchKey,
          generationKey,
          kind: "delete",
          pageSysId: pageId
        });
        const result: WorkspaceDeleteResult = {
          kind: "succeeded",
          authority: claim.resultAuthority,
          result: replayed
        };
        return result;
      } catch (error) {
        return {
          kind: "failed",
          errorMessage: cleanText(error instanceof Error ? error.message : error) || "Something went wrong while deleting the page. The page was not deleted. Please try again.",
          status: 500
        };
      }
    },

    movePage(input: {
      authority: WorkspaceMutationAuthority;
      pageSysId: string;
      parentPageSysId?: string | null;
      siblingOrder: string;
      workspace: WorkspaceRecord;
    }): WorkspaceMoveResult {
      try {
        const loaded = loadWorkspaceState(input.workspace, dependencies);
        const recoveryFailure = blockOnActiveDiscardRecovery(loaded);
        if (recoveryFailure) {
          return recoveryFailure;
        }
        const pageId = cleanText(input.pageSysId);
        const parentId = cleanText(input.parentPageSysId) || null;
        const siblingOrder = cleanText(input.siblingOrder);
        const generationKey = buildMutationGenerationKey(input.authority);
        const existingClaim = loadMutationClaimByGeneration(generationKey);
        if (
          existingClaim &&
          (
            existingClaim.kind !== "move" ||
            existingClaim.targetPageSysId !== pageId ||
            existingClaim.payload.kind !== "move" ||
            cleanText(existingClaim.payload.parentPageSysId) !== cleanText(parentId) ||
            existingClaim.payload.siblingOrder !== siblingOrder
          )
        ) {
          return staleFailure(nextAuthority(loaded.state));
        }
        if (!pageId || !siblingOrder) {
          return { kind: "failed", errorMessage: "A page and sibling placement are required.", status: 400 };
        }
        const prospective = movePage(loaded.state, {
          expectedChangeSetId: input.authority.changeSetId,
          expectedChangeSetRevision: input.authority.changeSetRevision
        }, {
          pageId,
          parentPageId: parentId,
          siblingOrder,
          actorId: dependencies.currentUserSysId(),
          changedOn: dependencies.currentTimestamp()
        });
        if (!existingClaim) {
          if (prospective.kind === "stale") {
            return staleFailure(prospective.current);
          }
          if (prospective.kind === "invalid") {
            return { kind: "failed", code: "invalid", errorMessage: prospective.reason, status: 400 };
          }
          if (prospective.kind === "noop") {
            const pages = this.listPages(loaded.workspace, "edit");
            if (pages.kind !== "succeeded") {
              return pages;
            }
            return {
              kind: "succeeded",
              authority: nextAuthority(loaded.state),
              result: { pages: pages.pages }
            };
          }
        }
        let claim = existingClaim ?? {
          sysId: "",
          workspaceId: cleanText(loaded.workspace.sysId),
          changeSetId: input.authority.changeSetId,
          generationKey,
          mutationKey: buildMutationKey(dependencies, input.authority, "move", {
            kind: "move",
            pageSysId: pageId,
            parentPageSysId: parentId,
            siblingOrder
          }),
          kind: "move" as const,
          state: "claimed" as const,
          ownerKey: dependencies.randomKey("mutation-owner"),
          ownerExpiresOn: plusDuration(dependencies.currentTimestamp(), dependencies.ownerTimeoutMs),
          claimedOn: dependencies.currentTimestamp(),
          phase: "claimed" as const,
          payload: {
            kind: "move",
            pageSysId: pageId,
            parentPageSysId: parentId,
            siblingOrder
          },
          targetPageSysId: pageId
        };
        const acquired = acquireMutationClaim(dependencies, loaded.state, claim);
        if (acquired.kind === "failed") {
          return acquired.failure;
        }
        if (acquired.kind === "replay") {
          return {
            kind: "succeeded",
            authority: acquired.resultAuthority,
            result: parseReplayResult<{ pages: PageRecord[] }>(acquired.resultJson)
          };
        }
        claim = acquired.claim;
        const executorKey = acquired.executorKey;
        let newlyPersisted = false;
        if (claim.phase === "claimed") {
          const candidate = prospective;
          if (candidate.kind === "stale") {
            return staleFailure(candidate.current);
          }
          if (candidate.kind === "invalid") {
            return { kind: "failed", code: "invalid", errorMessage: candidate.reason, status: 400 };
          }
          if (candidate.kind === "noop") {
            if (!existingClaim || !pageHierarchyMatches(pageId, parentId, siblingOrder)) {
              const pages = this.listPages(loaded.workspace, "edit");
              if (pages.kind !== "succeeded") {
                return pages;
              }
              return {
                kind: "succeeded",
                authority: nextAuthority(loaded.state),
                result: { pages: pages.pages }
              };
            }
            claim = requireClaimOwner(claim, executorKey);
            claim = persistClaimProgress(dependencies, claim, {
              appliedOn: claim.appliedOn ?? dependencies.currentTimestamp(),
              phase: "page_persisted"
            }, executorKey);
            triggerDurablePhase(dependencies, "mutation_page_persisted", { generationKey, kind: "move", pageSysId: pageId });
          } else {
            claim = requireClaimOwner(claim, executorKey);
            updateDraftPageHierarchy(pageId, parentId, siblingOrder);
            newlyPersisted = !acquired.recovered;
            claim = persistClaimProgress(dependencies, claim, {
              appliedOn: dependencies.currentTimestamp(),
              phase: "page_persisted"
            }, executorKey);
            triggerDurablePhase(dependencies, "mutation_page_persisted", { generationKey, kind: "move", pageSysId: pageId });
          }
        }
        // Reuse only the projection validated by this newly acquired hierarchy
        // write. Resumed and already-applied claims must reconstruct recovery
        // state fully. The moved overlay uses the hierarchy just persisted while
        // retaining every other field from the initial authoritative record.
        const reuse = loadFreshWorkspaceForStateReuse(loaded, newlyPersisted);
        const movedPageRecord = reuse.unchanged
          ? indexPageRecordsByIdFirstMatch(loaded.pageRecords).get(pageId)
          : undefined;
        const recovered = reuse.unchanged && movedPageRecord
          ? {
              ...loaded,
              pageRecords: loaded.pageRecords.map((page) => cleanText(page.sysId) === pageId
                ? { ...page, parentPageSysId: parentId, siblingOrder: normalizeSiblingOrder(siblingOrder) }
                : page),
              state: {
                ...loaded.state,
                draftPages: [
                  ...loaded.state.draftPages.filter((draft) => draft.pageId !== pageId),
                  ...buildDraftPages([
                    { ...movedPageRecord, parentPageSysId: parentId, siblingOrder: normalizeSiblingOrder(siblingOrder) }
                  ], loaded.state.snapshotSets[0].pages, new Set([pageId]))
                ]
              }
            }
          : loadWorkspaceState(reuse.workspace ?? input.workspace, dependencies);
        let resultAuthority = claim.resultAuthority;
        const recoveredAuthority = nextAuthority(recovered.state);
        const preparedAuthority = preparedResultAuthority(claim);
        if (!resultAuthority && claim.phase === "change_set_advancing" && authorityMatchesOrExceeds(recoveredAuthority, preparedAuthority)) {
          resultAuthority = preparedAuthority;
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: claim.appliedOn ?? dependencies.currentTimestamp(),
            phase: "change_set_persisted",
            resultAuthority,
            state: "applied"
          }, null);
        } else if (!resultAuthority && isExpectedNextAuthority(recoveredAuthority, input.authority)) {
          resultAuthority = recoveredAuthority;
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: claim.appliedOn ?? dependencies.currentTimestamp(),
            phase: "change_set_persisted",
            resultAuthority,
            state: "applied"
          }, null);
        }
        if (!resultAuthority) {
          claim = requireClaimOwner(claim, executorKey);
          const changedOn = claim.appliedOn ?? dependencies.currentTimestamp();
          const moved = movePage(recovered.state, {
            expectedChangeSetId: input.authority.changeSetId,
            expectedChangeSetRevision: input.authority.changeSetRevision
          }, {
            pageId,
            parentPageId: parentId,
            siblingOrder,
            actorId: dependencies.currentUserSysId(),
            changedOn
          });
          if (moved.kind === "stale") {
            return staleFailure(moved.current);
          }
          if (moved.kind === "invalid") {
            return { kind: "failed", code: "invalid", errorMessage: moved.reason, status: 400 };
          }
          const changed = moved.kind === "applied"
            ? moved
            : recordPendingChange(recovered.state, {
                expectedChangeSetId: input.authority.changeSetId,
                expectedChangeSetRevision: input.authority.changeSetRevision
              }, {
                pageId,
                actorId: dependencies.currentUserSysId(),
                changedOn
              });
          if (changed.kind === "stale") {
            return staleFailure(changed.current);
          }
          refreshEntriesForPage(changed.state, pageId);
          upsertChangeEntry(changed.state, pageId);
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: changedOn,
            phase: "entry_persisted"
          }, executorKey);
          triggerDurablePhase(dependencies, "mutation_entry_persisted", { generationKey, kind: "move", pageSysId: pageId });
          const recoveredPageRecordsById = indexPageRecordsByIdFirstMatch(recovered.pageRecords);
          const projected = orderProjectionPages(projectEdit(changed.state)).map((page) =>
            pageFromProjectionPage(page, recoveredPageRecordsById.get(page.pageId), cleanText(recovered.workspace.sysId), "edit")
          );
          const persistedResult = { pages: projected };
          const persistedResultJson = stableSerialize(persistedResult);
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: changedOn,
            phase: "change_set_advancing",
            resultJson: persistedResultJson
          }, executorKey);
          claim = requireDurableChangeSetAdvancingMarker(claim, executorKey, persistedResultJson);
          updateChangeSetRow(changed.state);
          triggerDurablePhase(dependencies, "mutation_change_set_row_updated", { generationKey, kind: "move", pageSysId: pageId });
          resultAuthority = preparedResultAuthority(claim);
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: changedOn,
            phase: "change_set_persisted",
            resultAuthority,
            state: "applied"
          }, null);
          triggerDurablePhase(dependencies, "mutation_change_set_persisted", { generationKey, kind: "move", pageSysId: pageId });
        }
        if (claim.phase === "change_set_persisted" && resultAuthority) {
          if (!claim.resultJson) {
            const refreshed = this.listPages(input.workspace, "edit");
            if (refreshed.kind !== "succeeded") {
              return refreshed;
            }
            claim = { ...claim, resultJson: stableSerialize({ pages: refreshed.pages }) };
          }
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: claim.appliedOn ?? dependencies.currentTimestamp(),
            phase: "result_persisted",
            resultAuthority,
            resultJson: claim.resultJson,
            state: "applied"
          }, null);
          triggerDurablePhase(dependencies, "mutation_result_persisted", { generationKey, kind: "move", pageSysId: pageId });
        }
        if (!claim.resultAuthority || !claim.resultJson) {
          throw new Error("Recovered move result could not be persisted.");
        }
        const replayed = parseReplayResult<{ pages: PageRecord[] }>(claim.resultJson);
        claim = finalizeMutationClaim(dependencies, claim, claim.resultAuthority, replayed, null);
        triggerDurablePhase(dependencies, "mutation_finalized", { generationKey, kind: "move", pageSysId: pageId });
        return {
          kind: "succeeded",
          authority: claim.resultAuthority,
          result: replayed
        };
      } catch (error) {
        return {
          kind: "failed",
          errorMessage: cleanText(error instanceof Error ? error.message : error) || "Something went wrong while moving the page. The page was not moved. Please try again.",
          status: 500
        };
      }
    },

    discardPage(input: {
      authority: WorkspaceMutationAuthority;
      pageSysId: string;
      workspace: WorkspaceRecord;
    }): WorkspaceDiscardPageResult {
      try {
        const loaded = loadWorkspaceState(input.workspace, dependencies);
        const recoveryFailure = blockOnActiveDiscardRecovery(loaded);
        if (recoveryFailure) {
          return recoveryFailure;
        }
        const pageId = cleanText(input.pageSysId);
        if (!pageId) {
          return { kind: "failed", code: "invalid", errorMessage: "A target page is required.", status: 400 };
        }
        const generationKey = buildMutationGenerationKey(input.authority);
        const existingClaim = loadMutationClaimByGeneration(generationKey);
        let payload: Extract<WorkspaceMutationClaimPayload, { kind: "discard_page" }>;
        if (existingClaim) {
          if (existingClaim.kind !== "discard_page" || existingClaim.payload.kind !== "discard_page" || cleanText(existingClaim.payload.pageSysId) !== pageId) {
            return staleFailure(nextAuthority(loaded.state));
          }
          payload = existingClaim.payload;
        } else {
          const category = deriveChangeCategory(loaded.state, pageId);
          if (!category) {
            return { kind: "failed", code: "invalid", errorMessage: "This page no longer has pending changes to undo.", status: 409 };
          }
          const removalBatchId =
            category === "Removed"
              ? loaded.state.removalBatches.find((candidate) =>
                  candidate.changeSetId === cleanText(loaded.state.selectors.activeChangeSetId) &&
                  candidate.state === "active" &&
                  candidate.members.some((member) => member.pageId === pageId)
                )?.id
              : undefined;
          if (category === "Removed" && !removalBatchId) {
            return { kind: "failed", code: "invalid", errorMessage: "This page no longer has pending changes to undo.", status: 409 };
          }
          const prepared = discardPageChanges(loaded.state, {
            expectedChangeSetId: input.authority.changeSetId,
            expectedChangeSetRevision: input.authority.changeSetRevision
          }, {
            pageId,
            actorId: dependencies.currentUserSysId(),
            changedOn: dependencies.currentTimestamp(),
            targetCategory: category,
            targetRemovalBatchId: removalBatchId ?? null
          });
          if (prepared.kind === "stale") {
            return staleFailure(prepared.current);
          }
          if (prepared.kind === "invalid") {
            return { kind: "failed", code: "invalid", errorMessage: prepared.reason, status: 400 };
          }
          payload = buildDiscardPagePayload({
            affectedPageIds: prepared.affectedPageIds,
            category,
            pageSysId: pageId,
            removalBatchId
          });
        }

        let claim = existingClaim ?? {
          sysId: "",
          workspaceId: cleanText(loaded.workspace.sysId),
          changeSetId: input.authority.changeSetId,
          generationKey,
          mutationKey: buildMutationKey(dependencies, input.authority, "discard_page", payload),
          kind: "discard_page" as const,
          state: "claimed" as const,
          ownerKey: dependencies.randomKey("mutation-owner"),
          ownerExpiresOn: plusDuration(dependencies.currentTimestamp(), dependencies.ownerTimeoutMs),
          claimedOn: dependencies.currentTimestamp(),
          phase: "claimed" as const,
          payload,
          targetPageSysId: pageId,
          targetRemovalBatchKey: payload.removalBatchId
        };
        const acquired = acquireMutationClaim(dependencies, loaded.state, claim);
        if (acquired.kind === "failed") {
          return acquired.failure;
        }
        if (acquired.kind === "replay") {
          return {
            kind: "succeeded",
            authority: acquired.resultAuthority,
            result: parseReplayResult<{
              discardedPageSysId: string;
              pages: PageRecord[];
              pendingChanges: WorkspacePendingChangesReadModel;
              workspaceStateRevision: number;
            }>(acquired.resultJson)
          };
        }

        claim = acquired.claim;
        const currentPayload = claim.payload.kind === "discard_page" ? claim.payload : payload;
        const executorKey = acquired.executorKey;
        const restoreContent = currentPayload.category === "Modified" || currentPayload.category === "Modified · Moved";
        const restoreHierarchy = currentPayload.category === "Moved" || currentPayload.category === "Modified · Moved";
        if (claim.phase === "claimed") {
          const prepared = discardPageChanges(loaded.state, {
            expectedChangeSetId: input.authority.changeSetId,
            expectedChangeSetRevision: input.authority.changeSetRevision
          }, {
            pageId,
            actorId: dependencies.currentUserSysId(),
            changedOn: dependencies.currentTimestamp(),
            targetAffectedPageIds: currentPayload.affectedPageIds,
            targetCategory: currentPayload.category,
            targetRemovalBatchId: currentPayload.removalBatchId ?? null
          });
          if (prepared.kind === "stale") {
            return staleFailure(prepared.current);
          }
          if (prepared.kind === "invalid") {
            return { kind: "failed", code: "invalid", errorMessage: prepared.reason, status: 400 };
          }
          claim = requireClaimOwner(claim, executorKey);
          const selectedSnapshot = loaded.state.snapshotSets.find((candidate) =>
            candidate.id === loaded.state.selectors.publishedSnapshotSetId &&
            candidate.workspaceId === loaded.state.selectors.workspaceId &&
            candidate.readiness === "ready"
          );
          const snapshotPage = selectedSnapshot?.pages.find((candidate) => candidate.pageId === pageId) ?? null;
          if (currentPayload.category === "Added") {
            deleteDraftPageRecords(currentPayload.affectedPageIds);
            claim = persistClaimProgress(dependencies, claim, {
              appliedOn: dependencies.currentTimestamp(),
              phase: "page_persisted"
            }, executorKey);
            triggerDurablePhase(dependencies, "mutation_page_persisted", { generationKey, kind: "discard_page", pageSysId: pageId });
          } else if (currentPayload.category === "Removed") {
            replaceRemovalBatches(prepared.state);
            claim = persistClaimProgress(dependencies, claim, {
              appliedOn: dependencies.currentTimestamp(),
              phase: "removal_persisted"
            }, executorKey);
            triggerDurablePhase(dependencies, "mutation_removal_persisted", {
              batchKey: currentPayload.removalBatchId,
              generationKey,
              kind: "discard_page",
              pageSysId: pageId
            });
          } else {
            if (!snapshotPage) {
              return { kind: "failed", code: "invalid", errorMessage: "This page no longer has pending changes to undo.", status: 409 };
            }
            restoreDraftPageFromSnapshot(pageId, snapshotPage, {
              restoreContent,
              restoreHierarchy,
              publicationState: publicationStateForPendingCategory(deriveChangeCategory(prepared.state, pageId))
            });
            claim = persistClaimProgress(dependencies, claim, {
              appliedOn: dependencies.currentTimestamp(),
              phase: "page_persisted"
            }, executorKey);
            triggerDurablePhase(dependencies, "mutation_page_persisted", { generationKey, kind: "discard_page", pageSysId: pageId });
          }
        }

        const recovered = loadWorkspaceState(input.workspace, dependencies);
        let resultAuthority = claim.resultAuthority;
        const recoveredAuthority = nextAuthority(recovered.state);
        const preparedAuthority = preparedResultAuthority(claim);
        if (!resultAuthority && claim.phase === "change_set_advancing" && authorityMatchesOrExceeds(recoveredAuthority, preparedAuthority)) {
          resultAuthority = preparedAuthority;
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: claim.appliedOn ?? dependencies.currentTimestamp(),
            phase: "change_set_persisted",
            resultAuthority,
            state: "applied"
          }, null);
        } else if (!resultAuthority && isExpectedNextAuthority(recoveredAuthority, input.authority)) {
          resultAuthority = recoveredAuthority;
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: claim.appliedOn ?? dependencies.currentTimestamp(),
            phase: "change_set_persisted",
            resultAuthority,
            state: "applied"
          }, null);
        }
        if (!resultAuthority) {
          claim = requireClaimOwner(claim, executorKey);
          const changedOn = claim.appliedOn ?? dependencies.currentTimestamp();
          const changed = discardPageChanges(recovered.state, {
            expectedChangeSetId: input.authority.changeSetId,
            expectedChangeSetRevision: input.authority.changeSetRevision
          }, {
            pageId,
            actorId: dependencies.currentUserSysId(),
            changedOn,
            targetAffectedPageIds: currentPayload.affectedPageIds,
            targetCategory: currentPayload.category,
            targetRemovalBatchId: currentPayload.removalBatchId ?? null
          });
          if (changed.kind === "stale") {
            return staleFailure(changed.current);
          }
          if (changed.kind === "invalid") {
            return { kind: "failed", code: "invalid", errorMessage: changed.reason, status: 400 };
          }
          const touchedPageIds = currentPayload.affectedPageIds.length > 0 ? currentPayload.affectedPageIds : changed.affectedPageIds;
          for (const affectedPageId of touchedPageIds) {
            refreshEntriesForPage(changed.state, affectedPageId);
          }
          persistMutatedState(changed.state, touchedPageIds);
          if (currentPayload.category === "Removed") {
            const publicationPageIds = new Set(
              touchedPageIds.filter((affectedPageId) => changed.state.snapshotSets[0]?.pages.some((candidate) => candidate.pageId === affectedPageId))
            );
            for (const affectedPageId of publicationPageIds) {
              writePagePublicationState(affectedPageId, publicationStateForPendingCategory(deriveChangeCategory(changed.state, affectedPageId)));
            }
          } else if (currentPayload.category !== "Added") {
            writePagePublicationState(pageId, publicationStateForPendingCategory(deriveChangeCategory(changed.state, pageId)));
          }
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: changedOn,
            phase: "entry_persisted"
          }, executorKey);
          triggerDurablePhase(dependencies, "mutation_entry_persisted", { generationKey, kind: "discard_page", pageSysId: pageId });
          const refreshedWorkspace = loadWorkspaceBySysId(cleanText(input.workspace.sysId)) ?? input.workspace;
          const refreshedPages = this.listPages(refreshedWorkspace, "edit");
          if (refreshedPages.kind !== "succeeded") {
            return refreshedPages;
          }
          const refreshedPending = this.pendingChanges(refreshedWorkspace);
          if (refreshedPending.kind !== "succeeded") {
            return {
              kind: "failed",
              code: refreshedPending.code === "recovery_required" ? "recovery_required" : undefined,
              currentChangeSetId: refreshedPending.currentChangeSetId,
              currentChangeSetRevision: refreshedPending.currentChangeSetRevision,
              errorMessage: refreshedPending.errorMessage,
              recoveryCommandId: refreshedPending.recoveryCommandId,
              status: refreshedPending.status
            };
          }
          const persistedResult = {
            discardedPageSysId: pageId,
            pages: refreshedPages.pages,
            pendingChanges: refreshedPending.pending,
            workspaceStateRevision: typeof refreshedWorkspace.workspaceStateRevision === "number" ? refreshedWorkspace.workspaceStateRevision : 0
          };
          const persistedResultJson = stableSerialize(persistedResult);
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: changedOn,
            phase: "change_set_advancing",
            resultJson: persistedResultJson
          }, executorKey);
          claim = requireDurableChangeSetAdvancingMarker(claim, executorKey, persistedResultJson);
          triggerDurablePhase(dependencies, "mutation_change_set_row_updated", {
            batchKey: currentPayload.removalBatchId,
            generationKey,
            kind: "discard_page",
            pageSysId: pageId
          });
          resultAuthority = preparedResultAuthority(claim);
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: changedOn,
            phase: "change_set_persisted",
            resultAuthority,
            state: "applied"
          }, null);
          triggerDurablePhase(dependencies, "mutation_change_set_persisted", {
            batchKey: currentPayload.removalBatchId,
            generationKey,
            kind: "discard_page",
            pageSysId: pageId
          });
        }
        if (claim.phase === "change_set_persisted" && resultAuthority) {
          if (!claim.resultJson) {
            const refreshedWorkspace = loadWorkspaceBySysId(cleanText(input.workspace.sysId)) ?? input.workspace;
            const refreshedPages = this.listPages(refreshedWorkspace, "edit");
            if (refreshedPages.kind !== "succeeded") {
              return refreshedPages;
            }
            const refreshedPending = this.pendingChanges(refreshedWorkspace);
            if (refreshedPending.kind !== "succeeded") {
              return {
                kind: "failed",
                code: refreshedPending.code === "recovery_required" ? "recovery_required" : undefined,
                currentChangeSetId: refreshedPending.currentChangeSetId,
                currentChangeSetRevision: refreshedPending.currentChangeSetRevision,
                errorMessage: refreshedPending.errorMessage,
                recoveryCommandId: refreshedPending.recoveryCommandId,
                status: refreshedPending.status
              };
            }
            claim = {
              ...claim,
              resultJson: stableSerialize({
                discardedPageSysId: pageId,
                pages: refreshedPages.pages,
                pendingChanges: refreshedPending.pending,
                workspaceStateRevision: typeof refreshedWorkspace.workspaceStateRevision === "number" ? refreshedWorkspace.workspaceStateRevision : 0
              })
            };
          }
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: claim.appliedOn ?? dependencies.currentTimestamp(),
            phase: "result_persisted",
            resultAuthority,
            resultJson: claim.resultJson,
            state: "applied"
          }, null);
          triggerDurablePhase(dependencies, "mutation_result_persisted", { generationKey, kind: "discard_page", pageSysId: pageId });
        }
        if (!claim.resultAuthority || !claim.resultJson) {
          throw new Error("Recovered discard-page result could not be persisted.");
        }
        const replayed = parseReplayResult<{
          discardedPageSysId: string;
          pages: PageRecord[];
          pendingChanges: WorkspacePendingChangesReadModel;
          workspaceStateRevision: number;
        }>(claim.resultJson);
        claim = finalizeMutationClaim(dependencies, claim, claim.resultAuthority, replayed, null);
        triggerDurablePhase(dependencies, "mutation_finalized", {
          batchKey: currentPayload.removalBatchId,
          generationKey,
          kind: "discard_page",
          pageSysId: pageId
        });
        return {
          kind: "succeeded",
          authority: claim.resultAuthority,
          result: replayed
        };
      } catch (error) {
        const errorMessage = cleanText(error instanceof Error ? error.message : error);
        if (errorMessage === "The active draft generation changed. Reload before discarding again.") {
          try {
            const reloadedWorkspace = loadWorkspaceBySysId(cleanText(input.workspace.sysId)) ?? input.workspace;
            return staleFailure(nextAuthority(loadWorkspaceState(reloadedWorkspace, dependencies).state));
          } catch {
            return {
              kind: "failed",
              code: "stale_generation",
              errorMessage,
              status: 409
            };
          }
        }
        return {
          kind: "failed",
          errorMessage: errorMessage || "Something went wrong while discarding changes to this page. No changes were discarded. Please try again.",
          status: 500
        };
      }
    },

    discardAllWorkspace(input: {
      authority: WorkspaceMutationAuthority;
      commandId: string;
      workspace: WorkspaceRecord;
    }): WorkspaceDiscardAllResult {
      try {
        const loaded = loadWorkspaceState(input.workspace, dependencies);
        const workspaceSysId = cleanText(loaded.workspace.sysId);
        const commandId = cleanText(input.commandId);
        if (!workspaceSysId) {
          return { kind: "failed", errorMessage: "Workspace could not be found.", status: 404 };
        }
        if (!commandId || commandId.length > 64 || !/^[a-zA-Z0-9._:-]+$/.test(commandId)) {
          return { kind: "failed", code: "invalid", errorMessage: "A valid discard-all command identity is required.", status: 400 };
        }
        const activeRecovery = readActiveDiscardRecovery(loaded);
        if (activeRecovery && activeRecovery.recoveryCommandId !== commandId) {
          return discardRecoveryRequiredFailure({
            affectedPageCount: activeRecovery.affectedPageCount,
            currentChangeSetId: activeRecovery.successorAuthority.changeSetId,
            currentChangeSetRevision: activeRecovery.successorAuthority.changeSetRevision,
            recoveryCommandId: activeRecovery.recoveryCommandId
          });
        }
        const selectedSnapshotSetSysId = cleanText(loaded.workspace.publishedSnapshotSetSysId);
        if (!selectedSnapshotSetSysId) {
          return { kind: "failed", errorMessage: "Workspace foundation is invalid.", status: 409 };
        }
        const sourceAuthority = activeRecovery?.sourceAuthority ?? input.authority;
        const generationKey = buildMutationGenerationKey(sourceAuthority);
        const originalAffectedPageCount = activeRecovery?.affectedPageCount ?? pendingEntries(loaded.state).length;
        const payload =
          activeRecovery?.claim.kind === "discard_all" && activeRecovery.claim.payload.kind === "discard_all"
            ? activeRecovery.claim.payload
            : buildDiscardAllPayload(workspaceSysId, commandId, sourceAuthority, originalAffectedPageCount, dependencies);
        const existingClaim = activeRecovery?.claim ?? loadMutationClaimByGeneration(generationKey);
        if (
          existingClaim &&
          (
            existingClaim.kind !== "discard_all" ||
            existingClaim.payload.kind !== "discard_all" ||
            existingClaim.payload.commandId !== payload.commandId ||
            existingClaim.payload.successorChangeSetSysId !== payload.successorChangeSetSysId ||
            existingClaim.payload.successorGenerationKey !== payload.successorGenerationKey
          )
        ) {
          return staleFailure(nextAuthority(loaded.state));
        }
        // loadWorkspaceState has already selected and validated this ready snapshot.
        // Reuse it so the claimed phase neither rereads the complete snapshot table
        // nor risks substituting another snapshot for the active selector.
        const selectedSnapshot = loaded.state.snapshotSets.find((snapshot) =>
          snapshot.id === selectedSnapshotSetSysId && snapshot.readiness === "ready"
        );
        if (!selectedSnapshot) {
          throw new Error("Workspace foundation is invalid.");
        }
        const publishedPages = selectedSnapshot.pages;
        if (!existingClaim) {
          if (originalAffectedPageCount === 0) {
            return { kind: "failed", code: "invalid", errorMessage: "There are no pending changes to discard.", status: 400 };
          }
          orderProjectionPages(projectEdit(loaded.state));
          const validatedSwitch = switchSelectors(loaded.state, {
            expectedChangeSetId: input.authority.changeSetId,
            expectedChangeSetRevision: input.authority.changeSetRevision
          }, {
            commandId,
            kind: "discard_all",
            successorChangeSetId: payload.successorChangeSetSysId
          });
          if (validatedSwitch.kind === "stale") {
            return staleFailure(validatedSwitch.current);
          }
        }

        let claim = existingClaim ?? {
          sysId: "",
          workspaceId: workspaceSysId,
          changeSetId: sourceAuthority.changeSetId,
          generationKey,
          mutationKey: buildMutationKey(dependencies, sourceAuthority, "discard_all", payload),
          kind: "discard_all" as const,
          state: "claimed" as const,
          ownerKey: dependencies.randomKey("mutation-owner"),
          ownerExpiresOn: plusDuration(dependencies.currentTimestamp(), dependencies.ownerTimeoutMs),
          claimedOn: dependencies.currentTimestamp(),
          phase: "claimed" as const,
          payload
        };
        const acquired = acquireMutationClaim(dependencies, loaded.state, claim);
        if (acquired.kind === "failed") {
          return acquired.failure;
        }
        if (acquired.kind === "replay") {
          return {
            kind: "succeeded",
            authority: acquired.resultAuthority,
            result: parseReplayResult<{
              pages: PageRecord[];
              pendingChanges: WorkspacePendingChangesReadModel;
              workspaceStateRevision: number;
            }>(acquired.resultJson)
          };
        }

        claim = acquired.claim;
        const executorKey = acquired.executorKey;
        const discardedOn = claim.appliedOn ?? dependencies.currentTimestamp();
        let resultAuthority = claim.resultAuthority;
        let switchedWorkspace = loadWorkspaceBySysId(workspaceSysId) ?? loaded.workspace;
        const alreadySwitched =
          cleanText(switchedWorkspace.pendingChangeSetSysId) === payload.successorChangeSetSysId &&
          cleanText(switchedWorkspace.publishedSnapshotSetSysId) === selectedSnapshotSetSysId;
        if (!resultAuthority && alreadySwitched) {
          resultAuthority = {
            changeSetId: payload.successorChangeSetSysId,
            changeSetRevision: 0
          };
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: claim.appliedOn ?? discardedOn,
            phase: "change_set_persisted",
            resultAuthority,
            state: "applied"
          }, null);
        }

        if (!resultAuthority) {
          claim = requireClaimOwner(claim, executorKey);
          const validatedSwitch = switchSelectors(loaded.state, {
            expectedChangeSetId: input.authority.changeSetId,
            expectedChangeSetRevision: input.authority.changeSetRevision
          }, {
            commandId,
            kind: "discard_all",
            successorChangeSetId: payload.successorChangeSetSysId
          });
          if (validatedSwitch.kind === "stale") {
            return staleFailure(validatedSwitch.current);
          }
          // Match Array.find's existing first-match semantics while avoiding one
          // complete page-record scan for every published projection page.
          const preparedPageRecordsBySysId = new Map<string, PageRecord>();
          for (const record of loaded.pageRecords) {
            const pageSysId = cleanText(record.sysId);
            if (pageSysId && !preparedPageRecordsBySysId.has(pageSysId)) {
              preparedPageRecordsBySysId.set(pageSysId, record);
            }
          }
          const preparedResult = {
            pages: orderProjectionPages(publishedPages).map((page) =>
              pageFromProjectionPage(page, preparedPageRecordsBySysId.get(page.pageId), workspaceSysId, "live")
            ),
            pendingChanges: {
              affectedPageCount: 0,
              changeSetId: payload.successorChangeSetSysId,
              changeSetRevision: 0,
              rows: [] as WorkspacePendingChangeRow[],
              workspaceSysId
            },
            workspaceStateRevision: validatedSwitch.result.workspaceStateRevision
          };
          const preparedResultJson = stableSerialize(preparedResult);
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: claim.appliedOn ?? discardedOn,
            phase: "change_set_advancing",
            resultJson: preparedResultJson
          }, executorKey);
          claim = requireDurableChangeSetAdvancingMarker(claim, executorKey, preparedResultJson);
          ensureDiscardAllSuccessorChangeSet(workspaceSysId, payload);
          switchedWorkspace = switchWorkspaceDiscardSelectors({
            authority: input.authority,
            dependencies,
            payload,
            workspace: loaded.workspace
          });
          resultAuthority = {
            changeSetId: payload.successorChangeSetSysId,
            changeSetRevision: 0
          };
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: claim.appliedOn ?? discardedOn,
            phase: "change_set_persisted",
            resultAuthority,
            state: "applied"
          }, null);
        }

        if (claim.phase === "change_set_persisted" && resultAuthority) {
          markPublishedChangeSetSuperseded(claim.changeSetId, commandId, discardedOn);
          reconcileDiscardedPageRows({
            dependencies,
            discardedChangeSetId: claim.changeSetId,
            pages: publishedPages,
            workspaceSysId
          });
          switchedWorkspace = loadWorkspaceBySysId(workspaceSysId) ?? switchedWorkspace;
          const pageRecords = listWorkspacePageRecords(workspaceSysId);
          const recordMap = new Map(pageRecords.map((page) => [cleanText(page.sysId), page]));
          const result = {
            pages: orderProjectionPages(publishedPages).map((page) =>
              pageFromProjectionPage(page, recordMap.get(page.pageId), workspaceSysId, "edit")
            ),
            pendingChanges: {
              affectedPageCount: 0,
              changeSetId: resultAuthority.changeSetId,
              changeSetRevision: resultAuthority.changeSetRevision,
              rows: [] as WorkspacePendingChangeRow[],
              workspaceSysId
            },
            workspaceStateRevision: typeof switchedWorkspace.workspaceStateRevision === "number" ? switchedWorkspace.workspaceStateRevision : 0
          };
          try {
            claim = persistClaimProgress(dependencies, claim, {
              appliedOn: claim.appliedOn ?? discardedOn,
              phase: "result_persisted",
              resultAuthority,
              resultJson: stableSerialize(result),
              state: "applied"
            }, null);
          } catch (error) {
            gs.error(`[Docsera workspace discard-all] Result persistence failed while discard recovery remains blocked: ${cleanText(error instanceof Error ? error.message : error) || "unknown failure"}`);
            return discardRecoveryRequiredFailure({
              affectedPageCount: payload.affectedPageCount,
              currentChangeSetId: resultAuthority.changeSetId,
              currentChangeSetRevision: resultAuthority.changeSetRevision,
              recoveryCommandId: commandId
            });
          }
          triggerDurablePhase(dependencies, "discard_result_persisted", {
            generationKey,
            kind: "discard_all"
          });
        }
        if (claim.phase === "result_persisted" && claim.resultAuthority) {
          try {
            updateChangeSetRecoveryState(claim.resultAuthority.changeSetId, "none");
          } catch (error) {
            gs.error(`[Docsera workspace discard-all] Replay-safe result persisted but recovery marker still needs retry: ${cleanText(error instanceof Error ? error.message : error) || "unknown failure"}`);
            return discardRecoveryRequiredFailure({
              affectedPageCount: payload.affectedPageCount,
              currentChangeSetId: claim.resultAuthority.changeSetId,
              currentChangeSetRevision: claim.resultAuthority.changeSetRevision,
              recoveryCommandId: commandId
            });
          }
        }
        if (!claim.resultAuthority || !claim.resultJson) {
          throw new Error("Recovered discard-all result could not be persisted.");
        }
        const replayed = parseReplayResult<{
          pages: PageRecord[];
          pendingChanges: WorkspacePendingChangesReadModel;
          workspaceStateRevision: number;
        }>(claim.resultJson);
        try {
          claim = finalizeMutationClaim(dependencies, claim, claim.resultAuthority, replayed, null);
        } catch (error) {
          gs.error(`[Docsera workspace discard-all] Selector advanced but claim finalization needs retry: ${cleanText(error instanceof Error ? error.message : error) || "unknown failure"}`);
        }
        return {
          kind: "succeeded",
          authority: claim.resultAuthority,
          result: replayed
        };
      } catch (error) {
        const errorMessage = cleanText(error instanceof Error ? error.message : error);
        if (errorMessage === "The active draft generation changed. Reload before discarding again.") {
          try {
            const reloadedWorkspace = loadWorkspaceBySysId(cleanText(input.workspace.sysId)) ?? input.workspace;
            return staleFailure(nextAuthority(loadWorkspaceState(reloadedWorkspace, dependencies).state));
          } catch {
            return {
              kind: "failed",
              code: "stale_generation",
              errorMessage,
              status: 409
            };
          }
        }
        try {
          const reloadedWorkspace = loadWorkspaceBySysId(cleanText(input.workspace.sysId)) ?? input.workspace;
          const recovery = readActiveDiscardRecovery(loadWorkspaceState(reloadedWorkspace, dependencies));
          if (recovery) {
            return discardRecoveryRequiredFailure({
              affectedPageCount: recovery.affectedPageCount,
              currentChangeSetId: recovery.successorAuthority.changeSetId,
              currentChangeSetRevision: recovery.successorAuthority.changeSetRevision,
              recoveryCommandId: recovery.recoveryCommandId
            });
          }
        } catch {
          // Fall back to the generic failure below.
        }
        return {
          kind: "failed",
          errorMessage: errorMessage || "Something went wrong while discarding changes. No changes were discarded. Please try again.",
          status: 500
        };
      }
    },

    publishWorkspace(input: {
      authority: WorkspaceMutationAuthority;
      commandId: string;
      workspace: WorkspaceRecord;
    }): WorkspacePublishResult {
      try {
        const loaded = loadWorkspaceState(input.workspace, dependencies);
        const recoveryFailure = blockOnActiveDiscardRecovery(loaded);
        if (recoveryFailure) {
          return recoveryFailure;
        }
        const workspaceSysId = cleanText(loaded.workspace.sysId);
        const commandId = cleanText(input.commandId);
        if (!workspaceSysId) {
          return { kind: "failed", errorMessage: "Workspace could not be found.", status: 404 };
        }
        if (!commandId || commandId.length > 64 || !/^[a-zA-Z0-9._:-]+$/.test(commandId)) {
          return { kind: "failed", code: "invalid", errorMessage: "A valid publish command identity is required.", status: 400 };
        }
        const generationKey = buildMutationGenerationKey(input.authority);
        const payload = buildPublishPayload(workspaceSysId, commandId, input.authority, dependencies);
        const existingClaim = loadMutationClaimByGeneration(generationKey);
        if (
          existingClaim &&
          (
            existingClaim.kind !== "publish" ||
            existingClaim.payload.kind !== "publish" ||
            existingClaim.payload.commandId !== payload.commandId ||
            existingClaim.payload.snapshotSetSysId !== payload.snapshotSetSysId ||
            existingClaim.payload.snapshotKey !== payload.snapshotKey ||
            existingClaim.payload.successorChangeSetSysId !== payload.successorChangeSetSysId ||
            existingClaim.payload.successorGenerationKey !== payload.successorGenerationKey
          )
        ) {
          return staleFailure(nextAuthority(loaded.state));
        }
        if (!existingClaim) {
          const tokenValidation = switchSelectors(
            completeSnapshotStaging(
              stageSnapshotSet(loaded.state, {
                commandId,
                kind: "publish",
                snapshotSetId: payload.snapshotSetSysId
              }),
              payload.snapshotSetSysId
            ),
            {
              expectedChangeSetId: input.authority.changeSetId,
              expectedChangeSetRevision: input.authority.changeSetRevision
            },
            {
              commandId,
              kind: "publish",
              snapshotSetId: payload.snapshotSetSysId,
              successorChangeSetId: payload.successorChangeSetSysId
            }
          );
          if (tokenValidation.kind === "stale") {
            return staleFailure(tokenValidation.current);
          }
          if (pendingEntries(loaded.state).length === 0) {
            return { kind: "failed", code: "invalid", errorMessage: "There are no pending changes to publish.", status: 400 };
          }
        }

        let claim = existingClaim ?? {
          sysId: "",
          workspaceId: workspaceSysId,
          changeSetId: input.authority.changeSetId,
          generationKey,
          mutationKey: buildMutationKey(dependencies, input.authority, "publish", payload),
          kind: "publish" as const,
          state: "claimed" as const,
          ownerKey: dependencies.randomKey("mutation-owner"),
          ownerExpiresOn: plusDuration(dependencies.currentTimestamp(), dependencies.ownerTimeoutMs),
          claimedOn: dependencies.currentTimestamp(),
          phase: "claimed" as const,
          payload
        };
        const acquired = acquireMutationClaim(dependencies, loaded.state, claim);
        if (acquired.kind === "failed") {
          return acquired.failure;
        }
        if (acquired.kind === "replay") {
          return {
            kind: "succeeded",
            authority: acquired.resultAuthority,
            result: parseReplayResult<{
              pages: PageRecord[];
              pendingChanges: WorkspacePendingChangesReadModel;
              publishedSnapshotSetId: string;
              workspaceStateRevision: number;
            }>(acquired.resultJson)
          };
        }

        claim = acquired.claim;
        const executorKey = acquired.executorKey;
        const publishedOn = claim.appliedOn ?? dependencies.currentTimestamp();
        const publishedBy = dependencies.currentUserSysId();
        let snapshotPages: SnapshotPage[] = [];

        if (claim.phase === "claimed") {
          claim = requireClaimOwner(claim, executorKey);
          snapshotPages = persistPublishSnapshot(dependencies, loaded, payload, input.authority, publishedOn, publishedBy);
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: publishedOn,
            phase: "page_persisted"
          }, executorKey);
        } else {
          const snapshot = loadFoundationSnapshot(workspaceSysId, payload.snapshotSetSysId);
          if (!snapshot || snapshot.readiness !== "ready") {
            throw new Error("Workspace publish snapshot could not be recovered.");
          }
          snapshotPages = snapshot.pages;
        }

        let resultAuthority = claim.resultAuthority;
        let switchedWorkspace = loadWorkspaceBySysId(workspaceSysId) ?? loaded.workspace;
        const alreadySwitched =
          cleanText(switchedWorkspace.pendingChangeSetSysId) === payload.successorChangeSetSysId &&
          cleanText(switchedWorkspace.publishedSnapshotSetSysId) === payload.snapshotSetSysId;
        if (!resultAuthority && alreadySwitched) {
          resultAuthority = {
            changeSetId: payload.successorChangeSetSysId,
            changeSetRevision: 0
          };
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: claim.appliedOn ?? publishedOn,
            phase: "change_set_persisted",
            resultAuthority,
            state: "applied"
          }, null);
        }

        if (!resultAuthority) {
          claim = requireClaimOwner(claim, executorKey);
          const validationState = completeSnapshotStaging(
            stageSnapshotSet(loaded.state, {
              commandId,
              kind: "publish",
              snapshotSetId: payload.snapshotSetSysId
            }),
            payload.snapshotSetSysId
          );
          const validatedSwitch = switchSelectors(validationState, {
            expectedChangeSetId: input.authority.changeSetId,
            expectedChangeSetRevision: input.authority.changeSetRevision
          }, {
            commandId,
            kind: "publish",
            snapshotSetId: payload.snapshotSetSysId,
            successorChangeSetId: payload.successorChangeSetSysId
          });
          if (validatedSwitch.kind === "stale") {
            return staleFailure(validatedSwitch.current);
          }
          const preparedResult = {
            pages: [] as PageRecord[],
            pendingChanges: {
              affectedPageCount: 0,
              changeSetId: payload.successorChangeSetSysId,
              changeSetRevision: 0,
              rows: [] as WorkspacePendingChangeRow[],
              workspaceSysId
            },
            publishedSnapshotSetId: payload.snapshotSetSysId,
            workspaceStateRevision: validatedSwitch.result.workspaceStateRevision
          };
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: claim.appliedOn ?? publishedOn,
            phase: "change_set_advancing",
            resultJson: stableSerialize(preparedResult)
          }, executorKey);
          claim = requireDurableChangeSetAdvancingMarker(claim, executorKey, stableSerialize(preparedResult));
          ensurePublishSuccessorChangeSet(workspaceSysId, payload);
          switchedWorkspace = switchWorkspacePublishSelectors({
            authority: input.authority,
            dependencies,
            payload,
            snapshotSetSysId: payload.snapshotSetSysId,
            workspace: loaded.workspace
          });
          markPublishedChangeSetSuperseded(input.authority.changeSetId, commandId, publishedOn);
          resultAuthority = {
            changeSetId: payload.successorChangeSetSysId,
            changeSetRevision: 0
          };
          claim = persistClaimProgress(dependencies, claim, {
            appliedOn: claim.appliedOn ?? publishedOn,
            phase: "change_set_persisted",
            resultAuthority,
            state: "applied"
          }, null);
        }

        if (claim.phase === "change_set_persisted" && resultAuthority) {
          try {
            reconcilePublishedPageRows({
              dependencies,
              pages: snapshotPages.length > 0 ? snapshotPages : loadSnapshotPages(payload.snapshotSetSysId),
              publishedBy,
              publishedOn: claim.appliedOn ?? publishedOn,
              workspaceSysId
            });
          } catch (error) {
            gs.error(`[Docsera workspace publish] Published selector advanced but page row reconciliation needs retry: ${cleanText(error instanceof Error ? error.message : error) || "unknown failure"}`);
          }
          switchedWorkspace = loadWorkspaceBySysId(workspaceSysId) ?? switchedWorkspace;
          const refreshed = this.listPages(switchedWorkspace, "edit");
          if (refreshed.kind !== "succeeded") {
            return refreshed;
          }
          const workspaceStateRevision = typeof refreshed.workspace.workspaceStateRevision === "number" ? refreshed.workspace.workspaceStateRevision : 0;
          const result = {
            pages: refreshed.pages,
            pendingChanges: {
              affectedPageCount: 0,
              changeSetId: resultAuthority.changeSetId,
              changeSetRevision: resultAuthority.changeSetRevision,
              rows: [] as WorkspacePendingChangeRow[],
              workspaceSysId
            },
            publishedSnapshotSetId: payload.snapshotSetSysId,
            workspaceStateRevision
          };
          try {
            claim = persistClaimProgress(dependencies, claim, {
              appliedOn: claim.appliedOn ?? publishedOn,
              phase: "result_persisted",
              resultAuthority,
              resultJson: stableSerialize(result),
              state: "applied"
            }, null);
          } catch (error) {
            gs.error(`[Docsera workspace publish] Published selector advanced but result persistence needs retry: ${cleanText(error instanceof Error ? error.message : error) || "unknown failure"}`);
            return {
              kind: "succeeded",
              authority: resultAuthority,
              result
            };
          }
        }
        if (!claim.resultAuthority || !claim.resultJson) {
          throw new Error("Recovered publish result could not be persisted.");
        }
        const replayed = parseReplayResult<{
          pages: PageRecord[];
          pendingChanges: WorkspacePendingChangesReadModel;
          publishedSnapshotSetId: string;
          workspaceStateRevision: number;
        }>(claim.resultJson);
        try {
          claim = finalizeMutationClaim(dependencies, claim, claim.resultAuthority, replayed, null);
        } catch (error) {
          gs.error(`[Docsera workspace publish] Published selector advanced but claim finalization needs retry: ${cleanText(error instanceof Error ? error.message : error) || "unknown failure"}`);
        }
        return {
          kind: "succeeded",
          authority: claim.resultAuthority,
          result: replayed
        };
      } catch (error) {
        const errorMessage = cleanText(error instanceof Error ? error.message : error);
        if (errorMessage === "The active draft generation changed. Reload before publishing again.") {
          try {
            const reloadedWorkspace = loadWorkspaceBySysId(cleanText(input.workspace.sysId)) ?? input.workspace;
            return staleFailure(nextAuthority(loadWorkspaceState(reloadedWorkspace, dependencies).state));
          } catch {
            return {
              kind: "failed",
              code: "stale_generation",
              errorMessage,
              status: 409
            };
          }
        }
        return {
          kind: "failed",
          errorMessage: errorMessage || "Something went wrong while publishing. No changes were published. Please try again.",
          status: 500
        };
      }
    },

    pendingChanges(workspace: WorkspaceRecord): WorkspacePendingChangesResult {
      try {
        const loaded = loadWorkspaceState(workspace, dependencies);
        const recovery = readActiveDiscardRecovery(loaded);
        if (recovery) {
          return {
            kind: "failed",
            affectedPageCount: recovery.affectedPageCount,
            code: "recovery_required",
            currentChangeSetId: recovery.successorAuthority.changeSetId,
            currentChangeSetRevision: recovery.successorAuthority.changeSetRevision,
            errorMessage: discardRecoveryRequiredMessage(),
            recoveryCommandId: recovery.recoveryCommandId,
            status: 409
          };
        }
        const authority = nextAuthority(loaded.state);
        const entries = pendingEntries(loaded.state);
        const editTitles = new Map<string, string>();
        if (entries.some((entry) => entry.category !== "Removed")) {
          for (const page of projectEdit(loaded.state)) {
            if (!editTitles.has(page.pageId)) editTitles.set(page.pageId, page.title);
          }
        }
        const publishedTitles = new Map<string, string>();
        const published = loaded.state.snapshotSets.find((snapshot) =>
          snapshot.id === loaded.state.selectors.publishedSnapshotSetId && snapshot.workspaceId === loaded.state.selectors.workspaceId
        );
        for (const page of published?.pages ?? []) {
          if (!publishedTitles.has(page.pageId)) publishedTitles.set(page.pageId, page.title);
        }
        const pageRecords = new Map<string, PageRecord>();
        for (const page of loaded.pageRecords) {
          const pageId = cleanText(page.sysId);
          if (!pageRecords.has(pageId)) pageRecords.set(pageId, page);
        }
        const attributions = new Map<string, ReturnType<typeof readAttribution>>();
        const rows = entries.map((entry) => {
          const category = normalizePendingCategory(entry.category);
          if (!category) {
            throw new Error("Workspace pending category is invalid.");
          }
          const authorId = cleanText(entry.lastChangedBy);
          let attribution = attributions.get(authorId);
          if (!attribution) {
            attribution = readAttribution(authorId);
            attributions.set(authorId, attribution);
          }
          return {
            attribution,
            category,
            firstPendingSequence: entry.firstPendingSequence,
            lastChangedOn: entry.lastChangedOn,
            navigable: category !== "Removed",
            pageSysId: entry.pageId,
            title: titleForPendingRow(entry, editTitles, publishedTitles, pageRecords)
          };
        });

        return {
          kind: "succeeded",
          pending: {
            affectedPageCount: rows.length,
            changeSetId: authority.changeSetId,
            changeSetRevision: authority.changeSetRevision,
            rows,
            workspaceSysId: cleanText(loaded.workspace.sysId)
          }
        };
      } catch (error) {
        return {
          kind: "failed",
          errorMessage: cleanText(error instanceof Error ? error.message : error) || "Unable to load pending changes. Please try again.",
          status: 500
        };
      }
    }
  };
}
