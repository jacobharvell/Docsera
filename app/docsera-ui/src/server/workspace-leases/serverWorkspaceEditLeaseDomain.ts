export const DOCSERA_WORKSPACE_EDIT_LEASE_TABLE = "x_2300756_docsera_workspace_edit_lease";
export const DOCSERA_WORKSPACE_EDIT_LEASE_HEARTBEAT_INTERVAL_MS = 60_000;
export const DOCSERA_WORKSPACE_EDIT_LEASE_STALE_AFTER_MS = 300_000;
export const DOCSERA_WORKSPACE_CHANGE_SET_TABLE = "x_2300756_docsera_workspace_change_set";

export type WorkspaceEditLeaseRecord = {
  acquiredAt: string;
  holderDisplayName: string | null;
  holderUserSysId: string;
  lastSeenAt: string;
  sysId?: string;
  verifierDigest: string;
  workspaceSysId: string;
};

export type WorkspaceLeaseHolder = { displayName: string | null; sameUserDifferentSession: boolean; holderUserSysId?: string; observedLeaseId?: string };
export type WorkspaceLeaseGeneration = {
  changeSetId: string;
  changeSetRevision: number;
  workspaceStateRevision: number | null;
};
export type WorkspaceEditLeaseResult =
  | ({ kind: "held"; leaseToken: string; heartbeatIntervalMs: number; staleAfterMs: number } & WorkspaceLeaseGeneration)
  | { kind: "locked"; currentHolder: WorkspaceLeaseHolder }
  | { kind: "lost"; currentHolder: WorkspaceLeaseHolder | null; errorMessage: string }
  | { kind: "released" }
  | { kind: "unlocked" }
  | { kind: "failed"; errorMessage: string; retryable: boolean; status: 400 | 403 | 404 | 409 | 500 };

export function cleanText(value: unknown): string { return typeof value === "string" ? value.trim() : ""; }
export function buildWorkspaceLeaseHolder(lease: Pick<WorkspaceEditLeaseRecord, "holderDisplayName" | "holderUserSysId" | "sysId"> | null, currentUserSysId: string): WorkspaceLeaseHolder | null {
  if (!lease) return null;
  const sameUserDifferentSession = cleanText(lease.holderUserSysId) === cleanText(currentUserSysId);
  return { displayName: cleanText(lease.holderDisplayName) || null, sameUserDifferentSession, ...(!sameUserDifferentSession && cleanText(lease.holderUserSysId) ? { holderUserSysId: cleanText(lease.holderUserSysId) } : {}), ...(sameUserDifferentSession && cleanText(lease.sysId) ? { observedLeaseId: cleanText(lease.sysId) } : {}) };
}
export function buildWorkspaceLockedMessage(holder: WorkspaceLeaseHolder | null): string {
  if (holder?.sameUserDifferentSession) return "This workspace is already being edited in another tab or window for your account.";
  if (holder?.displayName) return `This workspace is currently being edited by ${holder.displayName}.`;
  return "This workspace is currently being edited by another user.";
}
