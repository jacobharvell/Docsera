import type { WorkspaceRecord } from "../workspaces/serverWorkspaceDomain.ts";
import {
  type WorkspaceLeaseGeneration,
  buildWorkspaceLeaseHolder,
  cleanText,
  DOCSERA_WORKSPACE_EDIT_LEASE_HEARTBEAT_INTERVAL_MS,
  DOCSERA_WORKSPACE_EDIT_LEASE_STALE_AFTER_MS,
  type WorkspaceEditLeaseRecord,
  type WorkspaceEditLeaseResult
} from "./serverWorkspaceEditLeaseDomain.ts";

type Awaitable<T> = T | Promise<T>;
type Capability = { canAdminWorkspace: boolean; canEditWorkspace: boolean };
type User = { displayName: string | null; sysId: string };
type Reference = { workspaceSlug?: string; workspaceSysId?: string; leaseToken?: string };
type ActiveWorkspaceGenerationResult =
  | { kind: "ready"; generation: WorkspaceLeaseGeneration }
  | { kind: "failed"; errorMessage: string; retryable: boolean; status: 409 | 500 };
type Dependencies = {
  createToken(): string; currentTimestamp(): string; digestToken(token: string): string;
  loadActiveGeneration(workspace: WorkspaceRecord): Awaitable<ActiveWorkspaceGenerationResult>;
  evaluateWorkspaceCapabilities(workspace: WorkspaceRecord): Capability; getCurrentUser(): User;
  isLeaseExpired(input: { currentTimestamp: string; lastSeenAt: string; staleAfterMs: number }): boolean;
  deleteExactExpiredLease(input: {
    currentTimestamp: string; expectedLeaseSysId: string; expectedLastSeenAt: string; workspaceKey: string;
  }): Awaitable<boolean>;
  insertLease(lease: WorkspaceEditLeaseRecord): Awaitable<"created" | "conflict">;
  loadLeaseByWorkspaceKey(key: string): Awaitable<WorkspaceEditLeaseRecord | null>;
  loadWorkspaceBySlug(slug: string): Awaitable<WorkspaceRecord | null>;
  loadWorkspaceBySysId(sysId: string): Awaitable<WorkspaceRecord | null>;
  touchExactLease(input: { lastSeenAt: string; leaseSysId: string; workspaceKey: string; holderUserSysId: string; verifierDigest: string }): Awaitable<WorkspaceEditLeaseRecord | null>;
  releaseExactLease(input: { leaseSysId: string; workspaceKey: string; holderUserSysId: string; verifierDigest: string }): Awaitable<boolean>;
};

function canEdit(capability: Capability) { return capability.canEditWorkspace || capability.canAdminWorkspace; }
function matches(lease: WorkspaceEditLeaseRecord | null, userSysId: string, digest: string) {
  return Boolean(lease && cleanText(lease.holderUserSysId) === cleanText(userSysId) && cleanText(lease.verifierDigest) === cleanText(digest));
}

export function createWorkspaceEditLeaseService(dependencies: Dependencies) {
  async function context(input: Reference): Promise<{ workspace: WorkspaceRecord; currentUser: User } | { error: string; status: 403 | 404; currentUser: User }> {
    const currentUser = dependencies.getCurrentUser();
    if (!cleanText(currentUser.sysId)) return { error: "You do not have permission to edit this workspace.", status: 403 as const, currentUser };
    const workspace = cleanText(input.workspaceSysId) ? await dependencies.loadWorkspaceBySysId(cleanText(input.workspaceSysId)) : await dependencies.loadWorkspaceBySlug(cleanText(input.workspaceSlug));
    if (!workspace || !cleanText(workspace.sysId)) return { error: "Workspace could not be found.", status: 404 as const, currentUser };
    if (cleanText(input.workspaceSlug) && cleanText(workspace.slug) !== cleanText(input.workspaceSlug)) return { error: "Workspace could not be found.", status: 404 as const, currentUser };
    if (!canEdit(dependencies.evaluateWorkspaceCapabilities(workspace))) return { error: "You do not have permission to edit this workspace.", status: 403 as const, currentUser };
    return { workspace, currentUser };
  }
  function failed(resolved: { error: string; status: 403 | 404; currentUser: User }): WorkspaceEditLeaseResult { return { kind: "failed", errorMessage: resolved.error, retryable: false, status: resolved.status }; }
  function expired(lease: WorkspaceEditLeaseRecord | null, now: string) { return Boolean(lease && dependencies.isLeaseExpired({ currentTimestamp: now, lastSeenAt: lease.lastSeenAt, staleAfterMs: DOCSERA_WORKSPACE_EDIT_LEASE_STALE_AFTER_MS })); }
  function held(token: string, generation: WorkspaceLeaseGeneration): WorkspaceEditLeaseResult {
    return {
      kind: "held",
      leaseToken: token,
      heartbeatIntervalMs: DOCSERA_WORKSPACE_EDIT_LEASE_HEARTBEAT_INTERVAL_MS,
      staleAfterMs: DOCSERA_WORKSPACE_EDIT_LEASE_STALE_AFTER_MS,
      ...generation
    };
  }

  async function acquire(input: Reference): Promise<WorkspaceEditLeaseResult> {
    const resolved = await context(input); if ("error" in resolved) return failed(resolved);
    const active = await dependencies.loadActiveGeneration(resolved.workspace); if (active.kind === "failed") return active;
    const key = cleanText(resolved.workspace.sysId); const existing = await dependencies.loadLeaseByWorkspaceKey(key); const token = cleanText(input.leaseToken); const now = dependencies.currentTimestamp();
    if (token && matches(existing, resolved.currentUser.sysId, dependencies.digestToken(token)) && !expired(existing, now)) return held(token, active.generation);
    if (existing && !expired(existing, now)) return { kind: "locked", currentHolder: buildWorkspaceLeaseHolder(existing, resolved.currentUser.sysId)! };
    const nextToken = dependencies.createToken();
    const nextLease = { workspaceSysId: key, holderUserSysId: resolved.currentUser.sysId, holderDisplayName: resolved.currentUser.displayName, verifierDigest: dependencies.digestToken(nextToken), acquiredAt: now, lastSeenAt: now };
    if (existing) {
      await dependencies.deleteExactExpiredLease({
        currentTimestamp: now,
        expectedLeaseSysId: cleanText(existing.sysId),
        expectedLastSeenAt: cleanText(existing.lastSeenAt),
        workspaceKey: key
      });
    }
    const created = await dependencies.insertLease(nextLease);
    if (created === "created") return held(nextToken, active.generation);
    const winner = await dependencies.loadLeaseByWorkspaceKey(key);
    return winner ? { kind: "locked", currentHolder: buildWorkspaceLeaseHolder(winner, resolved.currentUser.sysId)! } : { kind: "failed", errorMessage: "Something went wrong while starting Edit mode. Please try again.", retryable: true, status: 500 };
  }
  async function renew(input: Reference): Promise<WorkspaceEditLeaseResult> {
    const token = cleanText(input.leaseToken); if (!token) return { kind: "failed", errorMessage: "A workspace edit lease token is required.", retryable: false, status: 400 };
    const resolved = await context(input); if ("error" in resolved) return failed(resolved);
    const active = await dependencies.loadActiveGeneration(resolved.workspace); if (active.kind === "failed") return active;
    const key = cleanText(resolved.workspace.sysId); const existing = await dependencies.loadLeaseByWorkspaceKey(key); const digest = dependencies.digestToken(token); const now = dependencies.currentTimestamp();
    if (!matches(existing, resolved.currentUser.sysId, digest) || expired(existing, now)) return { kind: "lost", currentHolder: expired(existing, now) ? null : buildWorkspaceLeaseHolder(existing, resolved.currentUser.sysId), errorMessage: "This workspace edit session ended and unsaved changes were not saved." };
    const touched = await dependencies.touchExactLease({ lastSeenAt: now, leaseSysId: cleanText(existing?.sysId), workspaceKey: key, holderUserSysId: resolved.currentUser.sysId, verifierDigest: digest });
    return touched ? held(token, active.generation) : { kind: "lost", currentHolder: buildWorkspaceLeaseHolder(await dependencies.loadLeaseByWorkspaceKey(key), resolved.currentUser.sysId), errorMessage: "This workspace edit session ended and unsaved changes were not saved." };
  }
  async function release(input: Reference): Promise<WorkspaceEditLeaseResult> {
    const token = cleanText(input.leaseToken); if (!token) return { kind: "failed", errorMessage: "A workspace edit lease token is required.", retryable: false, status: 400 };
    const resolved = await context(input); if ("error" in resolved) return failed(resolved);
    const key = cleanText(resolved.workspace.sysId); const existing = await dependencies.loadLeaseByWorkspaceKey(key); const digest = dependencies.digestToken(token);
    if (!matches(existing, resolved.currentUser.sysId, digest) || expired(existing, dependencies.currentTimestamp())) return { kind: "lost", currentHolder: buildWorkspaceLeaseHolder(existing, resolved.currentUser.sysId), errorMessage: "This workspace edit session has already ended." };
    return await dependencies.releaseExactLease({ leaseSysId: cleanText(existing?.sysId), workspaceKey: key, holderUserSysId: resolved.currentUser.sysId, verifierDigest: digest }) ? { kind: "released" } : { kind: "lost", currentHolder: buildWorkspaceLeaseHolder(await dependencies.loadLeaseByWorkspaceKey(key), resolved.currentUser.sysId), errorMessage: "This workspace edit session has already ended." };
  }
  return {
    acquire,
    renew,
    release,
    resume: renew,
    status: async (input: Reference) => {
      const resolved = await context(input); if ("error" in resolved) return failed(resolved);
      const active = await dependencies.loadActiveGeneration(resolved.workspace); if (active.kind === "failed") return active;
      const lease = await dependencies.loadLeaseByWorkspaceKey(cleanText(resolved.workspace.sysId));
      return !lease || expired(lease, dependencies.currentTimestamp())
        ? { kind: "unlocked" }
        : cleanText(input.leaseToken) && matches(lease, resolved.currentUser.sysId, dependencies.digestToken(cleanText(input.leaseToken)))
          ? held(cleanText(input.leaseToken), active.generation)
          : { kind: "locked", currentHolder: buildWorkspaceLeaseHolder(lease, resolved.currentUser.sysId)! };
    }
  };
}
