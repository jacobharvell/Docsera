import { GlideDateTime, GlideDigest, GlideRecord, GlideSecureRandomUtil, gs } from "@servicenow/glide";
import { loadWorkspaceBySlug } from "../pages/serviceNowPageQueries.ts";
import { DOCSERA_WORKSPACE_TABLE } from "../workspaces/serverWorkspaceDomain.ts";
import { evaluateCurrentUserWorkspaceCapabilities } from "../workspaces/serviceNowWorkspaceCapabilities.ts";
import { mapWorkspaceRecord } from "../workspaces/serviceNowWorkspaceRecords.ts";
import { createWorkspaceEditLeaseService } from "./workspaceEditLeaseService.ts";
import { cleanText, DOCSERA_WORKSPACE_CHANGE_SET_TABLE, DOCSERA_WORKSPACE_EDIT_LEASE_TABLE, type WorkspaceEditLeaseRecord } from "./serverWorkspaceEditLeaseDomain.ts";

function timestamp() { return new GlideDateTime().getValue(); }
function map(record: GlideRecord<typeof DOCSERA_WORKSPACE_EDIT_LEASE_TABLE>): WorkspaceEditLeaseRecord { return { sysId: cleanText(record.getUniqueValue()), workspaceSysId: cleanText(record.getValue("workspace")), holderUserSysId: cleanText(record.getValue("holder_user")), holderDisplayName: cleanText(record.getDisplayValue("holder_user")) || null, verifierDigest: cleanText(record.getValue("verifier_digest")), acquiredAt: cleanText(record.getValue("acquired_on")), lastSeenAt: cleanText(record.getValue("last_seen_on")) }; }
function load(workspaceKey: string) { const record = new GlideRecord(DOCSERA_WORKSPACE_EDIT_LEASE_TABLE); record.addQuery("workspace_key", workspaceKey); record.setLimit(1); record.query(); return record.next() ? map(record) : null; }
function expired(input: { currentTimestamp: string; lastSeenAt: string; staleAfterMs: number }) { const now = new GlideDateTime(); now.setValue(input.currentTimestamp); const seen = new GlideDateTime(); seen.setValue(input.lastSeenAt); return !now.isValid() || !seen.isValid() || seen.getNumericValue() < now.getNumericValue() - input.staleAfterMs; }
function loadActiveGeneration(workspace: { pendingChangeSetSysId?: string | null; sysId?: string; workspaceStateRevision?: number | null }) {
  const changeSetId = cleanText(workspace.pendingChangeSetSysId);
  const workspaceSysId = cleanText(workspace.sysId);
  if (!changeSetId || !workspaceSysId) return { kind: "failed" as const, errorMessage: "Workspace editing is unavailable for this workspace.", retryable: false, status: 409 as const };
  const record = new GlideRecord(DOCSERA_WORKSPACE_CHANGE_SET_TABLE);
  if (!record.get("sys_id", changeSetId)) return { kind: "failed" as const, errorMessage: "Workspace editing is unavailable for this workspace.", retryable: false, status: 409 as const };
  const revision = Number(record.getValue("change_set_revision"));
  if (cleanText(record.getValue("workspace")) !== workspaceSysId || cleanText(record.getValue("lifecycle_state")) !== "active" || !Number.isSafeInteger(revision) || revision < 0) {
    return { kind: "failed" as const, errorMessage: "Workspace editing is unavailable for this workspace.", retryable: false, status: 409 as const };
  }
  const workspaceStateRevision = workspace.workspaceStateRevision;
  return {
    kind: "ready" as const,
    generation: {
      changeSetId,
      changeSetRevision: revision,
      workspaceStateRevision: typeof workspaceStateRevision === "number" && workspaceStateRevision >= 0 ? workspaceStateRevision : null
    }
  };
}

export function createServiceNowWorkspaceEditLeaseService() {
  return createWorkspaceEditLeaseService({
    createToken: () => String(GlideSecureRandomUtil.getSecureRandomString(48)), currentTimestamp: timestamp,
    digestToken: (value) => String(new GlideDigest().getSHA256Hex(value)), isLeaseExpired: expired,
    getCurrentUser: () => ({ sysId: cleanText(gs.getUserID()), displayName: cleanText(gs.getUserDisplayName()) || null }),
    loadActiveGeneration,
    evaluateWorkspaceCapabilities: evaluateCurrentUserWorkspaceCapabilities,
    loadWorkspaceBySlug,
    loadWorkspaceBySysId: (sysId) => { const record = new GlideRecord(DOCSERA_WORKSPACE_TABLE); return record.get("sys_id", sysId) ? mapWorkspaceRecord(record) : null; },
    loadLeaseByWorkspaceKey: load,
    insertLease: (lease) => { const record = new GlideRecord(DOCSERA_WORKSPACE_EDIT_LEASE_TABLE); record.initialize(); record.setValue("workspace_key", lease.workspaceSysId); record.setValue("workspace", lease.workspaceSysId); record.setValue("holder_user", lease.holderUserSysId); record.setValue("verifier_digest", lease.verifierDigest); record.setValue("acquired_on", lease.acquiredAt); record.setValue("last_seen_on", lease.lastSeenAt); try { return record.insert() ? "created" : "conflict"; } catch { return "conflict"; } },
    deleteExactExpiredLease: (input) => {
      const cutoff = new GlideDateTime();
      cutoff.setValue(input.currentTimestamp);
      const record = new GlideRecord(DOCSERA_WORKSPACE_EDIT_LEASE_TABLE);
      record.addQuery("sys_id", input.expectedLeaseSysId);
      record.addQuery("workspace_key", input.workspaceKey);
      record.addQuery("last_seen_on", input.expectedLastSeenAt);
      record.addQuery("last_seen_on", "<", cutoff.getValue());
      record.query();
      record.deleteMultiple();
      return !load(input.workspaceKey);
    },
    touchExactLease: (input) => { const record = new GlideRecord(DOCSERA_WORKSPACE_EDIT_LEASE_TABLE); if (!record.get("sys_id", input.leaseSysId) || cleanText(record.getValue("workspace_key")) !== input.workspaceKey || cleanText(record.getValue("holder_user")) !== input.holderUserSysId || cleanText(record.getValue("verifier_digest")) !== input.verifierDigest) return null; record.setValue("last_seen_on", input.lastSeenAt); return record.update() ? map(record) : null; },
    releaseExactLease: (input) => { const record = new GlideRecord(DOCSERA_WORKSPACE_EDIT_LEASE_TABLE); return Boolean(record.get("sys_id", input.leaseSysId) && cleanText(record.getValue("workspace_key")) === input.workspaceKey && cleanText(record.getValue("holder_user")) === input.holderUserSysId && cleanText(record.getValue("verifier_digest")) === input.verifierDigest && record.deleteRecord()); }
  });
}
