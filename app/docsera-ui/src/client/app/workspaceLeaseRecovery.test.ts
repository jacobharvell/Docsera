import { describe, expect, it, vi } from "vitest";
import { WorkspaceLeaseRecoveryCoordinator } from "./workspaceLeaseRecovery";

const held = (leaseToken: string) => ({
  state: "held" as const,
  lease: {
    state: "held" as const,
    changeSetId: "change-set-001",
    changeSetRevision: 7,
    leaseToken,
    heartbeatIntervalMs: 60_000,
    staleAfterMs: 300_000,
    workspaceStateRevision: 3
  }
});

describe("WorkspaceLeaseRecoveryCoordinator", () => {
  it("shares concurrent recovery within a scope", async () => {
    const coordinator = new WorkspaceLeaseRecoveryCoordinator();
    const recover = vi.fn(async () => held("shared-token"));

    const [one, two] = await Promise.all([
      coordinator.ensure("workspace-a:edit:workspace-a:sys-1:1", recover),
      coordinator.ensure("workspace-a:edit:workspace-a:sys-1:1", recover)
    ]);

    expect(one).toEqual(held("shared-token"));
    expect(two).toEqual(held("shared-token"));
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it("uses the original token first and retries with the recovered token only while the exact replacement scope remains current", async () => {
    const coordinator = new WorkspaceLeaseRecoveryCoordinator();
    const scopes = {
      initial: "workspace:edit:product-docs:workspace-001:1",
      replacement: "workspace:edit:product-docs:workspace-001:2"
    };
    let scope = scopes.initial;
    const invalidateLeaseRace = vi.fn(() => {
      scope = scopes.replacement;
    });
    const ensure = vi.fn(async () => (scope === scopes.initial ? held("original-token") : held("replacement-token")));
    const mutate = vi.fn(async (token: string) => ({ code: token === "original-token" ? "lock_lost" : "ok" }));

    const result = await coordinator.runMutation({
      scope: () => scope,
      ensure,
      invalidateLeaseRace,
      mutate,
      isLeaseRace: (value) => value.code === "lock_lost"
    });

    expect(result).toEqual({ code: "ok" });
    expect(invalidateLeaseRace).toHaveBeenCalledTimes(1);
    expect(ensure).toHaveBeenCalledTimes(2);
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(mutate.mock.calls.map((call) => call[0])).toEqual(["original-token", "replacement-token"]);
  });

  it("does not retry ordinary conflicts or failures", async () => {
    const coordinator = new WorkspaceLeaseRecoveryCoordinator();
    const mutate = vi.fn(async () => ({ code: "conflict" }));

    const result = await coordinator.runMutation({
      scope: () => "workspace:edit:product-docs:workspace-001:1",
      ensure: async () => held("original-token"),
      invalidateLeaseRace: vi.fn(),
      mutate,
      isLeaseRace: (value) => value.code === "lock_lost"
    });

    expect(result).toEqual({ code: "conflict" });
    expect(mutate).toHaveBeenCalledTimes(1);
  });

  it("stops with a transient failure when rejected-token invalidation does not advance the scope", async () => {
    const coordinator = new WorkspaceLeaseRecoveryCoordinator();
    const scope = "workspace:edit:product-docs:workspace-001:1";
    const mutate = vi.fn(async (_token: string) => ({ code: "lock_lost" }));

    const result = await coordinator.runMutation({
      scope: () => scope,
      ensure: async () => held("original-token"),
      invalidateLeaseRace: vi.fn(),
      mutate,
      isLeaseRace: (value) => value.code === "lock_lost"
    });

    expect(result).toMatchObject({
      state: "transient_failure",
      errorMessage: "The editing session did not advance after lease recovery."
    });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate).toHaveBeenLastCalledWith("original-token");
  });

  it("prevents the retry when the scope changes again after recovery and never spends the stale replacement token", async () => {
    const coordinator = new WorkspaceLeaseRecoveryCoordinator();
    const scopes = {
      initial: "workspace:edit:product-docs:workspace-001:1",
      replacement: "workspace:edit:product-docs:workspace-001:2",
      changedAgain: "workspace:edit:product-docs:workspace-001:3"
    };
    let scope = scopes.initial;
    const ensure = vi.fn(async () => {
      if (scope === scopes.initial) return held("original-token");
      scope = scopes.changedAgain;
      return held("replacement-token");
    });
    const mutate = vi.fn(async () => ({ code: "lock_lost" }));

    const result = await coordinator.runMutation({
      scope: () => scope,
      ensure,
      invalidateLeaseRace: () => {
        scope = scopes.replacement;
      },
      mutate,
      isLeaseRace: (value) => value.code === "lock_lost"
    });

    expect(result).toMatchObject({
      state: "transient_failure",
      errorMessage: "The editing session changed."
    });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls).toEqual([["original-token"]]);
  });

  it("stops after two mutation attempts when the retried mutation also loses the lease", async () => {
    const coordinator = new WorkspaceLeaseRecoveryCoordinator();
    let generation = 1;
    const mutate = vi.fn(async () => ({ code: "lock_lost" }));

    const result = await coordinator.runMutation({
      scope: () => `workspace:edit:product-docs:workspace-001:${generation}`,
      ensure: async () => held(generation === 1 ? "original-token" : "replacement-token"),
      invalidateLeaseRace: () => {
        generation += 1;
      },
      mutate,
      isLeaseRace: (value) => value.code === "lock_lost"
    });

    expect(result).toEqual({ code: "lock_lost" });
    expect(mutate).toHaveBeenCalledTimes(2);
    expect(mutate).toHaveBeenNthCalledWith(1, "original-token");
    expect(mutate).toHaveBeenNthCalledWith(2, "replacement-token");
  });

  it("does not mutate after a stale shared recovery changes scope before the first mutation", async () => {
    const coordinator = new WorkspaceLeaseRecoveryCoordinator();
    let scope = "workspace:edit:product-docs:workspace-001:1";
    const mutate = vi.fn();

    const result = await coordinator.runMutation({
      scope: () => scope,
      ensure: async () => {
        scope = "workspace:edit:product-docs:workspace-001:2";
        return held("stale-token");
      },
      invalidateLeaseRace: vi.fn(),
      mutate,
      isLeaseRace: () => false
    });

    expect(result).toMatchObject({
      state: "transient_failure",
      errorMessage: "The editing session changed."
    });
    expect(mutate).not.toHaveBeenCalled();
  });

  it("does not share recovery between distinct scopes", async () => {
    const coordinator = new WorkspaceLeaseRecoveryCoordinator();
    const recoverA = vi.fn(async () => held("token-a"));
    const recoverB = vi.fn(async () => held("token-b"));

    await Promise.all([
      coordinator.ensure("workspace:edit:product-docs:workspace-001:1", recoverA),
      coordinator.ensure("workspace:edit:api-docs:workspace-002:1", recoverB)
    ]);

    expect(recoverA).toHaveBeenCalledTimes(1);
    expect(recoverB).toHaveBeenCalledTimes(1);
  });
});
