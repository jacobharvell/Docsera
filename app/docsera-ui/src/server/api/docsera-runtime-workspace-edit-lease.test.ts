import { beforeEach, describe, expect, it, vi } from "vitest";

const { service } = vi.hoisted(() => ({
  service: {
    acquire: vi.fn(),
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
    service.release.mockReset();
    service.renew.mockReset();
    service.resume.mockReset();
    service.status.mockReset();
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
