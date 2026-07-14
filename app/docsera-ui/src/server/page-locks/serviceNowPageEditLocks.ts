import { GlideDateTime, GlideDigest, GlideRecord, GlideSecureRandomUtil, gs } from "@servicenow/glide";
import type { PageRecord } from "../pages/serverPageDomain.ts";
import { loadWorkspaceBySlug, listWorkspacePages } from "../pages/serviceNowPageQueries.ts";
import { DOCSERA_WORKSPACE_TABLE, type WorkspaceRecord } from "../workspaces/serverWorkspaceDomain.ts";
import { evaluateCurrentUserWorkspaceCapabilities } from "../workspaces/serviceNowWorkspaceCapabilities.ts";
import { mapWorkspaceRecord } from "../workspaces/serviceNowWorkspaceRecords.ts";
import { createPageEditLockService } from "./pageEditLockService.ts";
import {
  cleanText,
  DOCSERA_PAGE_EDIT_LOCK_TABLE,
  type PageEditLockRecord
} from "./serverPageEditLockDomain.ts";

function loadWorkspaceBySysId(workspaceSysId: string): WorkspaceRecord | null {
  const sysId = cleanText(workspaceSysId);
  if (!sysId) {
    return null;
  }

  const record = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
  if (!record.get("sys_id", sysId)) {
    return null;
  }

  return mapWorkspaceRecord(record);
}

function currentTimestamp(): string {
  return new GlideDateTime().getValue();
}

function parseGlideDateTime(value: string): GlideDateTime | null {
  const normalizedValue = cleanText(value);
  if (!normalizedValue) {
    return null;
  }

  const timestamp = new GlideDateTime();
  timestamp.setValue(normalizedValue);
  return timestamp.isValid() ? timestamp : null;
}

function isLockExpired(input: {
  currentTimestamp: string;
  lastSeenAt: string;
  staleAfterMs: number;
}): boolean {
  const currentTimestamp = parseGlideDateTime(input.currentTimestamp);
  const lastSeenTimestamp = parseGlideDateTime(input.lastSeenAt);
  if (!currentTimestamp || !lastSeenTimestamp) {
    return true;
  }

  const cutoff = new GlideDateTime(currentTimestamp);
  cutoff.addSeconds(-Math.floor(Math.max(0, input.staleAfterMs) / 1000));
  return lastSeenTimestamp.getNumericValue() < cutoff.getNumericValue();
}

function createToken(): string {
  return GlideSecureRandomUtil.getSecureRandomString(64);
}

function digestToken(token: string): string {
  return new GlideDigest().getSHA256Hex(token);
}

function mapPageEditLockRecord(record: GlideRecord): PageEditLockRecord {
  return {
    acquiredAt: cleanText(record.getValue("acquired_on")),
    holderDisplayName: cleanText(record.getDisplayValue("holder_user")) || null,
    holderUserSysId: cleanText(record.getValue("holder_user")),
    lastSeenAt: cleanText(record.getValue("last_seen_on")),
    pageKey: cleanText(record.getValue("page_key")),
    pageSysId: cleanText(record.getValue("page")),
    sysId: cleanText(record.getUniqueValue()) || undefined,
    verifierDigest: cleanText(record.getValue("verifier_digest")),
    workspaceSysId: cleanText(record.getValue("workspace"))
  };
}

function loadLockByPageKey(pageKey: string): PageEditLockRecord | null {
  const normalizedPageKey = cleanText(pageKey);
  if (!normalizedPageKey) {
    return null;
  }

  const record = new GlideRecord(DOCSERA_PAGE_EDIT_LOCK_TABLE);
  record.addQuery("page_key", normalizedPageKey);
  record.setLimit(1);
  record.query();

  if (!record.next()) {
    return null;
  }

  return mapPageEditLockRecord(record);
}

function insertLock(lock: PageEditLockRecord): "created" | "conflict" {
  const record = new GlideRecord(DOCSERA_PAGE_EDIT_LOCK_TABLE);
  record.initialize();
  record.setValue("page_key", lock.pageKey);
  record.setValue("page", lock.pageSysId);
  record.setValue("workspace", lock.workspaceSysId);
  record.setValue("holder_user", lock.holderUserSysId);
  record.setValue("verifier_digest", lock.verifierDigest);
  record.setValue("acquired_on", lock.acquiredAt);
  record.setValue("last_seen_on", lock.lastSeenAt);

  return cleanText(record.insert()) ? "created" : "conflict";
}

function touchExactLock(input: {
  lastSeenAt: string;
  lockSysId: string;
  pageKey: string;
  holderUserSysId: string;
  staleCutoffTimestamp: string;
  verifierDigest: string;
}): PageEditLockRecord | null {
  const record = new GlideRecord(DOCSERA_PAGE_EDIT_LOCK_TABLE);
  record.addQuery("sys_id", cleanText(input.lockSysId));
  record.addQuery("page_key", cleanText(input.pageKey));
  record.addQuery("holder_user", cleanText(input.holderUserSysId));
  record.addQuery("verifier_digest", cleanText(input.verifierDigest));
  record.addQuery("last_seen_on", ">=", cleanText(input.staleCutoffTimestamp));
  record.setLimit(1);
  record.query();

  if (!record.next()) {
    return null;
  }

  record.setValue("last_seen_on", cleanText(input.lastSeenAt));
  const updatedSysId = cleanText(record.update());
  if (!updatedSysId) {
    return null;
  }

  return mapPageEditLockRecord(record);
}

function releaseExactLock(input: {
  lockSysId: string;
  pageKey: string;
  holderUserSysId: string;
  staleCutoffTimestamp: string;
  verifierDigest: string;
}): boolean {
  const record = new GlideRecord(DOCSERA_PAGE_EDIT_LOCK_TABLE);
  record.addQuery("sys_id", cleanText(input.lockSysId));
  record.addQuery("page_key", cleanText(input.pageKey));
  record.addQuery("holder_user", cleanText(input.holderUserSysId));
  record.addQuery("verifier_digest", cleanText(input.verifierDigest));
  record.addQuery("last_seen_on", ">=", cleanText(input.staleCutoffTimestamp));
  record.setLimit(1);
  record.query();

  if (!record.next()) {
    return false;
  }

  return record.deleteRecord();
}

function getCurrentUser() {
  const userDisplayName = cleanText(gs.getUserDisplayName()) || cleanText(gs.getUserName()) || null;

  return {
    displayName: userDisplayName,
    sysId: cleanText(gs.getUserID())
  };
}

export function createServiceNowPageEditLockService() {
  return createPageEditLockService({
    createToken,
    currentTimestamp,
    digestToken,
    evaluateWorkspaceCapabilities: evaluateCurrentUserWorkspaceCapabilities,
    getCurrentUser,
    isLockExpired,
    insertLock,
    listWorkspacePages,
    loadLockByPageKey,
    loadWorkspaceBySlug,
    loadWorkspaceBySysId,
    releaseExactLock,
    touchExactLock
  });
}

export function listStalePageEditLockSysIds(cutoffTimestamp: string): string[] {
  const cutoff = cleanText(cutoffTimestamp);
  if (!cutoff) {
    return [];
  }

  const record = new GlideRecord(DOCSERA_PAGE_EDIT_LOCK_TABLE);
  record.addQuery("last_seen_on", "<", cutoff);
  record.query();

  const lockSysIds: string[] = [];
  while (record.next()) {
    const lockSysId = cleanText(record.getUniqueValue());
    if (lockSysId) {
      lockSysIds.push(lockSysId);
    }
  }

  return lockSysIds;
}

export function deletePageEditLockIfStillStale(lockSysId: string, cutoffTimestamp: string): boolean {
  const normalizedLockSysId = cleanText(lockSysId);
  const cutoff = cleanText(cutoffTimestamp);
  if (!normalizedLockSysId || !cutoff) {
    return false;
  }

  const record = new GlideRecord(DOCSERA_PAGE_EDIT_LOCK_TABLE);
  record.addQuery("sys_id", normalizedLockSysId);
  record.addQuery("last_seen_on", "<", cutoff);
  record.setLimit(1);
  record.query();

  if (!record.next()) {
    return false;
  }

  return record.deleteRecord();
}

export function buildStalePageEditLockCutoffTimestamp(staleAfterMs: number): string {
  const cutoff = new GlideDateTime();
  cutoff.addSeconds(-Math.floor(Math.max(0, staleAfterMs) / 1000));
  return cutoff.getValue();
}
