import { describe, expect, it } from "vitest";
import { createWorkspaceEditLeaseService } from "./workspaceEditLeaseService.ts";
import type { WorkspaceEditLeaseRecord } from "./serverWorkspaceEditLeaseDomain.ts";

function createHarness() {
  let now = "2026-07-16 12:00:00";
  let currentUser = { displayName: "Editor One", sysId: "user-1" };
  let allowed = true;
  let activeGeneration = { changeSetId: "change-set-1", changeSetRevision: 7, workspaceStateRevision: 3 };
  let lease: WorkspaceEditLeaseRecord | null = null;
  let simulateDeleteMiss = false;
  let sequence = 0;
  const service = createWorkspaceEditLeaseService({
    createToken: () => `token-${++sequence}`,
    currentTimestamp: () => now,
    digestToken: (token) => `digest:${token}`,
    loadActiveGeneration: () => activeGeneration ? { kind: "ready", generation: { ...activeGeneration } } : { kind: "failed", errorMessage: "Workspace editing is unavailable for this workspace.", retryable: false, status: 409 as const },
    evaluateWorkspaceCapabilities: () => ({ canAdminWorkspace: false, canEditWorkspace: allowed }),
    getCurrentUser: () => currentUser,
    isLeaseExpired: ({ currentTimestamp, lastSeenAt, staleAfterMs }) => new Date(`${currentTimestamp}Z`).getTime() - new Date(`${lastSeenAt}Z`).getTime() > staleAfterMs,
    insertLease: (next) => { if (lease) return "conflict"; lease = { ...next, sysId: "lease-1" }; return "created"; },
    deleteExactExpiredLease: ({ currentTimestamp, expectedLastSeenAt, expectedLeaseSysId, workspaceKey }) => {
      if (new Date(`${currentTimestamp}Z`).getTime() - new Date(`${expectedLastSeenAt}Z`).getTime() <= 300000) return false;
      if (simulateDeleteMiss && lease && lease.sysId === expectedLeaseSysId) {
        lease = { ...lease, lastSeenAt: currentTimestamp };
        simulateDeleteMiss = false;
        return false;
      }
      if (!lease || lease.sysId !== expectedLeaseSysId || lease.lastSeenAt !== expectedLastSeenAt || lease.workspaceSysId !== workspaceKey) return false;
      lease = null; return true;
    },
    loadLeaseByWorkspaceKey: () => lease,
    loadWorkspaceBySlug: (slug) => slug === "product-docs" ? workspace : null,
    loadWorkspaceBySysId: (sysId) => sysId === "workspace-1" ? workspace : null,
    touchExactLease: ({ holderUserSysId, lastSeenAt, leaseSysId, verifierDigest, workspaceKey }) => {
      if (!lease || lease.sysId !== leaseSysId || lease.workspaceSysId !== workspaceKey || lease.holderUserSysId !== holderUserSysId || lease.verifierDigest !== verifierDigest) return null;
      lease = { ...lease, lastSeenAt }; return lease;
    },
    releaseExactLease: ({ holderUserSysId, leaseSysId, verifierDigest, workspaceKey }) => {
      if (!lease || lease.sysId !== leaseSysId || lease.workspaceSysId !== workspaceKey || lease.holderUserSysId !== holderUserSysId || lease.verifierDigest !== verifierDigest) return false;
      lease = null; return true;
    }
  });
  return {
    service,
    getLease: () => lease ? { ...lease } : null,
    setActiveGeneration: (value: typeof activeGeneration | null) => { activeGeneration = value as typeof activeGeneration; },
    setAllowed: (value: boolean) => { allowed = value; },
    setLease: (value: WorkspaceEditLeaseRecord | null) => { lease = value; },
    setSimulateDeleteMiss: (value: boolean) => { simulateDeleteMiss = value; },
    setNow: (value: string) => { now = value; },
    setUser: (value: typeof currentUser) => { currentUser = value; }
  };
}

const workspace = { sysId: "workspace-1", slug: "product-docs", name: "Product Docs", shortDescription: null, icon: { type: "builtin" as const, key: "docsera-workspace", label: "Docsera" }, status: "active" as const, adminGroupSysId: "admins", editorGroupSysId: "editors", creatorUserSysId: "user-1", layout: { pageWidth: "readable" as const, tocVisibleByDefault: true } };

describe("workspace edit lease service", () => {
  it("allows exactly one holder, rejects a second same-user tab, and releases only the matching lease", async () => {
    const { service } = createHarness();
    const acquired = await service.acquire({ workspaceSlug: "product-docs" });
    expect(acquired).toMatchObject({ kind: "held", changeSetId: "change-set-1", changeSetRevision: 7, workspaceStateRevision: 3 });
    if (acquired.kind !== "held") return;
    expect((await service.acquire({ workspaceSlug: "product-docs" })).kind).toBe("locked");
    expect((await service.release({ workspaceSlug: "product-docs", leaseToken: "wrong" })).kind).toBe("lost");
    expect((await service.release({ workspaceSlug: "product-docs", leaseToken: acquired.leaseToken })).kind).toBe("released");
    expect((await service.acquire({ workspaceSlug: "product-docs" })).kind).toBe("held");
  });

  it("requires authoring authorization and prevents a revoked holder from renewing", async () => {
    const { service, setAllowed } = createHarness();
    setAllowed(false);
    expect((await service.acquire({ workspaceSlug: "product-docs" })).kind).toBe("failed");
    setAllowed(true);
    const acquired = await service.acquire({ workspaceSlug: "product-docs" });
    if (acquired.kind !== "held") return;
    setAllowed(false);
    const renewed = await service.renew({ workspaceSlug: "product-docs", leaseToken: acquired.leaseToken });
    expect(renewed).toMatchObject({ kind: "failed", status: 403 });
  });

  it("permits takeover only after expiry and rejects stale-holder mutations", async () => {
    const { service, setNow, setUser } = createHarness();
    const acquired = await service.acquire({ workspaceSlug: "product-docs" });
    if (acquired.kind !== "held") return;
    setNow("2026-07-16 12:06:00");
    setUser({ displayName: "Editor Two", sysId: "user-2" });
    const takeover = await service.acquire({ workspaceSlug: "product-docs" });
    expect(takeover).toMatchObject({ kind: "held", changeSetId: "change-set-1", changeSetRevision: 7 });
    setUser({ displayName: "Editor One", sysId: "user-1" });
    expect((await service.renew({ workspaceSlug: "product-docs", leaseToken: acquired.leaseToken })).kind).toBe("lost");
  });

  it("does not delete an observed stale row when the exact delete boundary no longer matches", async () => {
    const { service, setNow, setSimulateDeleteMiss, setUser } = createHarness();
    const acquired = await service.acquire({ workspaceSlug: "product-docs" });
    if (acquired.kind !== "held") return;
    setNow("2026-07-16 12:06:00");
    setSimulateDeleteMiss(true);
    setUser({ displayName: "Editor Two", sysId: "user-2" });
    const contention = await service.acquire({ workspaceSlug: "product-docs" });
    expect(contention).toMatchObject({ kind: "locked" });
  });

  it("fails safely when the active workspace generation is missing or invalid", async () => {
    const { service, setActiveGeneration } = createHarness();
    setActiveGeneration(null);
    expect(await service.acquire({ workspaceSlug: "product-docs" })).toMatchObject({
      kind: "failed",
      retryable: false,
      status: 409
    });
    expect(await service.status({ workspaceSlug: "product-docs" })).toMatchObject({
      kind: "failed",
      retryable: false,
      status: 409
    });
  });

  it("validates a held lease for read without renewing last-seen or mutating the active generation", async () => {
    const { getLease, service, setNow } = createHarness();
    const acquired = await service.acquire({ workspaceSlug: "product-docs" });
    expect(acquired.kind).toBe("held");
    if (acquired.kind !== "held") return;
    const before = getLease();

    setNow("2026-07-16 12:02:00");
    const firstRead = await service.validateHeld({ workspaceSlug: "product-docs", workspaceSysId: "workspace-1", leaseToken: acquired.leaseToken });
    setNow("2026-07-16 12:04:00");
    const secondRead = await service.validateHeld({ workspaceSlug: "product-docs", workspaceSysId: "workspace-1", leaseToken: acquired.leaseToken });

    expect(firstRead).toMatchObject({ kind: "held", changeSetId: "change-set-1", changeSetRevision: 7, workspaceStateRevision: 3 });
    expect(secondRead).toMatchObject({ kind: "held", changeSetId: "change-set-1", changeSetRevision: 7, workspaceStateRevision: 3 });
    expect(getLease()?.lastSeenAt).toBe(before?.lastSeenAt);
    expect(getLease()).toEqual(before);
  });

  it("denies missing, expired, replaced, wrong-user, wrong-workspace, and invalid read tokens", async () => {
    const { service, setLease, setNow, setUser } = createHarness();
    const acquired = await service.acquire({ workspaceSlug: "product-docs" });
    expect(acquired.kind).toBe("held");
    if (acquired.kind !== "held") return;

    await expect(service.validateHeld({ workspaceSlug: "product-docs" })).resolves.toMatchObject({ kind: "failed", status: 400 });
    await expect(service.validateHeld({ workspaceSlug: "product-docs", leaseToken: "invalid-token" })).resolves.toMatchObject({ kind: "lost" });

    setUser({ displayName: "Editor Two", sysId: "user-2" });
    await expect(service.validateHeld({ workspaceSlug: "product-docs", leaseToken: acquired.leaseToken })).resolves.toMatchObject({ kind: "lost" });

    setUser({ displayName: "Editor One", sysId: "user-1" });
    await expect(service.validateHeld({ workspaceSlug: "wrong-workspace", leaseToken: acquired.leaseToken })).resolves.toMatchObject({ kind: "failed", status: 404 });

    setLease({
      acquiredAt: "2026-07-16 12:00:00",
      holderDisplayName: "Editor One",
      holderUserSysId: "user-1",
      lastSeenAt: "2026-07-16 12:00:00",
      sysId: "lease-1",
      verifierDigest: "digest:replacement-token",
      workspaceSysId: "workspace-1"
    });
    await expect(service.validateHeld({ workspaceSlug: "product-docs", leaseToken: acquired.leaseToken })).resolves.toMatchObject({ kind: "lost" });

    setNow("2026-07-16 12:06:00");
    await expect(service.validateHeld({ workspaceSlug: "product-docs", leaseToken: "replacement-token" })).resolves.toMatchObject({ kind: "lost", currentHolder: null });
  });

  it("continues to renew mutation authority through the existing touch boundary", async () => {
    const { getLease, service, setNow } = createHarness();
    const acquired = await service.acquire({ workspaceSlug: "product-docs" });
    expect(acquired.kind).toBe("held");
    if (acquired.kind !== "held") return;

    setNow("2026-07-16 12:01:00");
    await expect(service.renew({ workspaceSlug: "product-docs", leaseToken: acquired.leaseToken })).resolves.toMatchObject({ kind: "held" });
    expect(getLease()?.lastSeenAt).toBe("2026-07-16 12:01:00");
  });
});
