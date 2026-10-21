import { beforeEach, describe, expect, it, vi } from "vitest";

const { service } = vi.hoisted(() => ({
  service: {
    acquire: vi.fn(),
    endPreviousSession: vi.fn(),
    release: vi.fn(),
    renew: vi.fn(),
    resume: vi.fn(),
    status: vi.fn()
  }
}));

vi.mock("../workspace-leases/serviceNowWorkspaceEditLeases.ts", () => ({
  createServiceNowWorkspaceEditLeaseService: () => service
}));

vi.mock("@servicenow/glide", () => ({
  gs: {
    error: vi.fn()
  }
}));

import { createWorkspaceEditLeaseProcessor, readWorkspaceMutationAuthority, sendWorkspaceGenerationFailure } from "./docsera-runtime-workspace-edit-lease.ts";

function responseRecorder() {
  return {
    body: undefined as unknown,
    status: undefined as number | undefined,
    setBody(payload: unknown) { this.body = payload; },
    setStatus(status: number) { this.status = status; }
  };
}

describe("workspace edit lease route", () => {
  beforeEach(() => {
    service.acquire.mockReset();
    service.endPreviousSession.mockReset();
    service.release.mockReset();
    service.renew.mockReset();
    service.resume.mockReset();
    service.status.mockReset();
  });

  it("exposes the observed ID only for the current holder and routes the end request", async () => {
    const response = responseRecorder();
    service.acquire.mockResolvedValue({ kind: "locked", currentHolder: { displayName: "Editor", sameUserDifferentSession: true, observedLeaseId: "lease-1", holderUserSysId: "private" } });
    await createWorkspaceEditLeaseProcessor("acquire")({ body: { workspaceSlug: "product-docs" } }, response);
    expect(response.body).toMatchObject({ error: { observedLeaseId: "lease-1" } });
    expect((response.body as { error: Record<string, unknown> }).error.holderUserSysId).toBeUndefined();
    service.acquire.mockResolvedValue({ kind: "locked", currentHolder: { displayName: "Other", sameUserDifferentSession: false, observedLeaseId: "secret-id", holderUserSysId: "user-1" } });
    await createWorkspaceEditLeaseProcessor("acquire")({ body: { workspaceSlug: "product-docs" } }, response);
    expect((response.body as { error: Record<string, unknown> }).error.observedLeaseId).toBeUndefined();
    expect((response.body as { error: Record<string, unknown> }).error.holderUserSysId).toBe("user-1");
    service.endPreviousSession.mockResolvedValue({ kind: "released" });
    await createWorkspaceEditLeaseProcessor("end-previous-session")({ body: { workspaceSlug: "product-docs", observedLeaseId: "lease-1" } }, response);
    expect(service.endPreviousSession).toHaveBeenCalledWith(expect.objectContaining({ workspaceSlug: "product-docs", observedLeaseId: "lease-1" }));
    expect(response.body).toEqual({ result: { state: "released" } });
  });

  it("returns the generation pair with held acquire responses", async () => {
    service.acquire.mockResolvedValue({
      kind: "held",
      leaseToken: "workspace-lease-token",
      heartbeatIntervalMs: 60_000,
      staleAfterMs: 300_000,
      changeSetId: "change-set-001",
      changeSetRevision: 9,
      workspaceStateRevision: 4
    });
    const response = responseRecorder();

    await createWorkspaceEditLeaseProcessor("acquire")({ body: { workspaceSlug: "product-docs" } }, response);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      result: {
        state: "held",
        leaseToken: "workspace-lease-token",
        heartbeatIntervalMs: 60_000,
        staleAfterMs: 300_000,
        changeSetId: "change-set-001",
        changeSetRevision: 9,
        workspaceStateRevision: 4
      }
    });
  });

  it("omits the plaintext token from status responses while preserving the generation pair", async () => {
    service.status.mockResolvedValue({
      kind: "held",
      leaseToken: "workspace-lease-token",
      heartbeatIntervalMs: 60_000,
      staleAfterMs: 300_000,
      changeSetId: "change-set-001",
      changeSetRevision: 9,
      workspaceStateRevision: null
    });
    const response = responseRecorder();

    await createWorkspaceEditLeaseProcessor("status")({ body: { workspaceSlug: "product-docs", leaseToken: "workspace-lease-token" } }, response);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      result: {
        state: "held",
        heartbeatIntervalMs: 60_000,
        staleAfterMs: 300_000,
        changeSetId: "change-set-001",
        changeSetRevision: 9
      }
    });
  });

  it("maps invalid workspace foundation failures to the safe 409 contract", async () => {
    service.acquire.mockResolvedValue({
      kind: "failed",
      errorMessage: "Workspace editing is unavailable for this workspace.",
      retryable: false,
      status: 409
    });
    const response = responseRecorder();

    await createWorkspaceEditLeaseProcessor("acquire")({ body: { workspaceSlug: "product-docs" } }, response);

    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: "workspace_foundation_invalid",
        retryable: false,
        message: "Workspace editing is unavailable for this workspace."
      }
    });
  });

  it("fails closed when a mutation omits the required generation pair", () => {
    const response = responseRecorder();
    const blocked = sendWorkspaceGenerationFailure(
      {
        kind: "held",
        leaseToken: "workspace-lease-token",
        heartbeatIntervalMs: 60_000,
        staleAfterMs: 300_000,
        changeSetId: "change-set-001",
        changeSetRevision: 9,
        workspaceStateRevision: 4
      },
      {},
      response
    );

    expect(blocked).toBe(true);
    expect(response.status).toBe(409);
    expect(response.body).toEqual({
      error: {
        code: "stale_generation",
        retryable: false,
        message: "The active draft generation changed. Reload before saving again.",
        currentChangeSetId: "change-set-001",
        currentChangeSetRevision: 9
      }
    });
  });

  it("accepts a well-formed generation pair even when it is not the newest active pair", () => {
    const response = responseRecorder();
    const blocked = sendWorkspaceGenerationFailure(
      {
        kind: "held",
        leaseToken: "workspace-lease-token",
        heartbeatIntervalMs: 60_000,
        staleAfterMs: 300_000,
        changeSetId: "change-set-001",
        changeSetRevision: 9,
        workspaceStateRevision: 4
      },
      {
        expectedChangeSetId: "change-set-000",
        expectedChangeSetRevision: 8
      },
      response
    );

    expect(blocked).toBe(false);
    expect(response.status).toBeUndefined();
    expect(response.body).toBeUndefined();
  });

  it("returns the caller supplied mutation authority for stale-generation replay handling", () => {
    const response = responseRecorder();
    const authority = readWorkspaceMutationAuthority(
      {
        kind: "held",
        leaseToken: "workspace-lease-token",
        heartbeatIntervalMs: 60_000,
        staleAfterMs: 300_000,
        changeSetId: "change-set-001",
        changeSetRevision: 9,
        workspaceStateRevision: 4
      },
      {
        expectedChangeSetId: "change-set-000",
        expectedChangeSetRevision: 8
      },
      response
    );

    expect(authority).toEqual({
      changeSetId: "change-set-000",
      changeSetRevision: 8
    });
    expect(response.status).toBeUndefined();
    expect(response.body).toBeUndefined();
  });
});
