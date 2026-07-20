import { describe, expect, it, vi } from "vitest";
import { WorkspaceMutationQueue } from "./workspaceMutationQueue";
import type { WorkspaceEditLeaseGeneration } from "../shared/types/docsera";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("WorkspaceMutationQueue", () => {
  it("serializes mutations and dispatches the second with the authority returned by the first", async () => {
    let authority: WorkspaceEditLeaseGeneration = { changeSetId: "change-set-001", changeSetRevision: 7 };
    const first = deferred<{ changeSetId: string; changeSetRevision: number; state: "succeeded" }>();
    const used: Array<WorkspaceEditLeaseGeneration | undefined> = [];
    const queue = new WorkspaceMutationQueue({
      getAuthority: () => authority,
      installAuthority: (next) => {
        authority = { changeSetId: next.changeSetId!, changeSetRevision: next.changeSetRevision! };
        return true;
      },
      isCurrentContext: () => true,
      onStaleGeneration: vi.fn(async () => true)
    });

    const firstPromise = queue.enqueue({
      contextKey: "workspace:edit",
      type: "body_save",
      dispatch: async (currentAuthority) => {
        used.push(currentAuthority);
        return first.promise;
      }
    });
    const secondPromise = queue.enqueue({
      contextKey: "workspace:edit",
      type: "page_create",
      dispatch: async (currentAuthority) => {
        used.push(currentAuthority);
        return { changeSetId: "change-set-001", changeSetRevision: 9, state: "succeeded" as const };
      }
    });

    await Promise.resolve();
    expect(used).toEqual([{ changeSetId: "change-set-001", changeSetRevision: 7 }]);
    first.resolve({ changeSetId: "change-set-001", changeSetRevision: 8, state: "succeeded" });
    await expect(firstPromise).resolves.toMatchObject({ changeSetRevision: 8 });
    await expect(secondPromise).resolves.toMatchObject({ changeSetRevision: 9 });
    expect(used).toEqual([
      { changeSetId: "change-set-001", changeSetRevision: 7 },
      { changeSetId: "change-set-001", changeSetRevision: 8 }
    ]);
  });

  it("cancels obsolete queued mutations before dispatch", async () => {
    let currentContext = "workspace:edit:1";
    const queue = new WorkspaceMutationQueue({
      getAuthority: () => ({ changeSetId: "change-set-001", changeSetRevision: 1 }),
      installAuthority: () => true,
      isCurrentContext: (context) => context === currentContext,
      onStaleGeneration: vi.fn(async () => true)
    });
    const first = deferred<{ state: "succeeded"; changeSetId: string; changeSetRevision: number }>();
    const dispatched = vi.fn();
    const firstPromise = queue.enqueue({
      contextKey: currentContext,
      type: "body_save",
      dispatch: () => first.promise
    });
    const secondPromise = queue.enqueue({
      contextKey: currentContext,
      type: "page_move",
      dispatch: async () => {
        dispatched();
        return { state: "succeeded" as const, changeSetId: "change-set-001", changeSetRevision: 2 };
      }
    });

    currentContext = "workspace:edit:2";
    queue.cancelObsolete("session_replaced");
    await expect(secondPromise).rejects.toThrow("Workspace mutation was canceled.");
    first.resolve({ state: "succeeded", changeSetId: "change-set-001", changeSetRevision: 2 });

    await expect(firstPromise).rejects.toThrow("Workspace mutation was canceled.");
    expect(dispatched).not.toHaveBeenCalled();
  });

  it("does not install an older authority response over the current revision", async () => {
    let authority: WorkspaceEditLeaseGeneration = { changeSetId: "change-set-001", changeSetRevision: 5 };
    const queue = new WorkspaceMutationQueue({
      getAuthority: () => authority,
      installAuthority: (next) => {
        if (next.changeSetId === authority.changeSetId && Number(next.changeSetRevision) < authority.changeSetRevision) {
          return false;
        }
        authority = { changeSetId: next.changeSetId!, changeSetRevision: next.changeSetRevision! };
        return true;
      },
      isCurrentContext: () => true,
      onStaleGeneration: vi.fn(async () => true)
    });

    await queue.enqueue({
      contextKey: "workspace:edit",
      type: "page_settings",
      dispatch: async () => ({ state: "succeeded" as const, changeSetId: "change-set-001", changeSetRevision: 4 })
    });

    expect(authority).toEqual({ changeSetId: "change-set-001", changeSetRevision: 5 });
  });

  it("triggers stale refresh without retrying non-idempotent page creation", async () => {
    const onStaleGeneration = vi.fn(async () => true);
    const dispatch = vi.fn(async () => ({
      code: "conflict" as const,
      currentChangeSetId: "change-set-001",
      currentChangeSetRevision: 12,
      errorMessage: "The active draft generation changed. Reload before saving again.",
      state: "failed" as const
    }));
    const queue = new WorkspaceMutationQueue({
      getAuthority: () => ({ changeSetId: "change-set-001", changeSetRevision: 11 }),
      installAuthority: () => true,
      isCurrentContext: () => true,
      onStaleGeneration
    });

    await expect(queue.enqueue({ contextKey: "workspace:edit", type: "page_create", dispatch })).resolves.toMatchObject({
      code: "conflict",
      state: "failed"
    });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(onStaleGeneration).toHaveBeenCalledWith(
      { changeSetId: "change-set-001", changeSetRevision: 12 },
      "workspace:edit"
    );
  });

  it("waits for stale recovery before dispatching later queued mutations", async () => {
    let authority: WorkspaceEditLeaseGeneration = { changeSetId: "change-set-001", changeSetRevision: 7 };
    const recovery = deferred<boolean>();
    const used: Array<WorkspaceEditLeaseGeneration | undefined> = [];
    const queue = new WorkspaceMutationQueue({
      getAuthority: () => authority,
      installAuthority: (next) => {
        authority = { changeSetId: next.changeSetId!, changeSetRevision: next.changeSetRevision! };
        return true;
      },
      isCurrentContext: () => true,
      onStaleGeneration: async (next) => {
        const recovered = await recovery.promise;
        if (recovered) {
          authority = { changeSetId: next.changeSetId!, changeSetRevision: next.changeSetRevision! };
        }
        return recovered;
      }
    });

    const stalePromise = queue.enqueue({
      contextKey: "workspace:edit",
      type: "page_settings",
      dispatch: async (currentAuthority) => {
        used.push(currentAuthority);
        return {
          code: "conflict" as const,
          currentChangeSetId: "change-set-001",
          currentChangeSetRevision: 8,
          state: "failed" as const
        };
      }
    });
    const nextPromise = queue.enqueue({
      contextKey: "workspace:edit",
      type: "page_create",
      dispatch: async (currentAuthority) => {
        used.push(currentAuthority);
        return { changeSetId: "change-set-001", changeSetRevision: 9, state: "succeeded" as const };
      }
    });

    await Promise.resolve();
    expect(used).toEqual([{ changeSetId: "change-set-001", changeSetRevision: 7 }]);
    await expect(Promise.race([nextPromise.then(() => "dispatched"), Promise.resolve("blocked")])).resolves.toBe("blocked");

    recovery.resolve(true);

    await expect(stalePromise).resolves.toMatchObject({ code: "conflict", state: "failed" });
    await expect(nextPromise).resolves.toMatchObject({ changeSetRevision: 9 });
    expect(used).toEqual([
      { changeSetId: "change-set-001", changeSetRevision: 7 },
      { changeSetId: "change-set-001", changeSetRevision: 8 }
    ]);
  });

  it("cancels later queued mutations when stale recovery fails", async () => {
    const queue = new WorkspaceMutationQueue({
      getAuthority: () => ({ changeSetId: "change-set-001", changeSetRevision: 7 }),
      installAuthority: () => true,
      isCurrentContext: () => true,
      onStaleGeneration: vi.fn(async () => false)
    });
    const laterDispatch = vi.fn(async () => ({ changeSetId: "change-set-001", changeSetRevision: 9, state: "succeeded" as const }));

    const stalePromise = queue.enqueue({
      contextKey: "workspace:edit",
      type: "page_move",
      dispatch: async () => ({
        code: "conflict" as const,
        currentChangeSetId: "change-set-001",
        currentChangeSetRevision: 8,
        state: "failed" as const
      })
    });
    const laterPromise = queue.enqueue({
      contextKey: "workspace:edit",
      type: "page_create",
      dispatch: laterDispatch
    });

    await expect(stalePromise).resolves.toMatchObject({ code: "conflict", state: "failed" });
    await expect(laterPromise).rejects.toThrow("Workspace mutation was canceled.");
    expect(laterDispatch).not.toHaveBeenCalled();
  });

  it("does not install authority from a response whose context was replaced while active", async () => {
    let currentContext = "workspace:edit:1";
    const active = deferred<{ state: "succeeded"; changeSetId: string; changeSetRevision: number }>();
    const installAuthority = vi.fn(() => true);
    const queue = new WorkspaceMutationQueue({
      getAuthority: () => ({ changeSetId: "change-set-001", changeSetRevision: 7 }),
      installAuthority,
      isCurrentContext: (context) => context === currentContext,
      onStaleGeneration: vi.fn(async () => true)
    });

    const promise = queue.enqueue({
      contextKey: currentContext,
      type: "page_create",
      dispatch: () => active.promise
    });
    currentContext = "workspace:edit:2";
    active.resolve({ state: "succeeded", changeSetId: "change-set-001", changeSetRevision: 8 });

    await expect(promise).rejects.toThrow("Workspace mutation was canceled.");
    expect(installAuthority).not.toHaveBeenCalled();
  });

  it("does not start stale recovery for a response whose lease context was replaced while active", async () => {
    let currentContext = "workspace:edit:1";
    const active = deferred<{ state: "failed"; code: "conflict"; currentChangeSetId: string; currentChangeSetRevision: number }>();
    const onStaleGeneration = vi.fn(async () => true);
    const queue = new WorkspaceMutationQueue({
      getAuthority: () => ({ changeSetId: "change-set-001", changeSetRevision: 7 }),
      installAuthority: () => true,
      isCurrentContext: (context) => context === currentContext,
      onStaleGeneration
    });

    const promise = queue.enqueue({
      contextKey: currentContext,
      type: "page_settings",
      dispatch: () => active.promise
    });
    currentContext = "workspace:edit:2";
    active.resolve({
      code: "conflict",
      currentChangeSetId: "change-set-001",
      currentChangeSetRevision: 8,
      state: "failed"
    });

    await expect(promise).rejects.toThrow("Workspace mutation was canceled.");
    expect(onStaleGeneration).not.toHaveBeenCalled();
  });

  it("does not cancel queued replacement-lease writes after obsolete stale recovery fails", async () => {
    let currentContext = "workspace:edit:1";
    const recovery = deferred<boolean>();
    const used: Array<WorkspaceEditLeaseGeneration | undefined> = [];
    const queue = new WorkspaceMutationQueue({
      getAuthority: () => ({ changeSetId: "change-set-001", changeSetRevision: currentContext.endsWith(":1") ? 7 : 20 }),
      installAuthority: () => true,
      isCurrentContext: (context) => context === currentContext,
      onStaleGeneration: async () => recovery.promise
    });

    const stalePromise = queue.enqueue({
      contextKey: currentContext,
      type: "page_settings",
      dispatch: async (authority) => {
        used.push(authority);
        return {
          code: "conflict" as const,
          currentChangeSetId: "change-set-001",
          currentChangeSetRevision: 8,
          state: "failed" as const
        };
      }
    });
    await Promise.resolve();
    currentContext = "workspace:edit:2";
    const replacementPromise = queue.enqueue({
      contextKey: currentContext,
      type: "page_create",
      dispatch: async (authority) => {
        used.push(authority);
        return { changeSetId: "change-set-001", changeSetRevision: 21, state: "succeeded" as const };
      }
    });

    recovery.resolve(false);

    await expect(stalePromise).resolves.toMatchObject({ code: "conflict", state: "failed" });
    await expect(replacementPromise).resolves.toMatchObject({ changeSetRevision: 21 });
    expect(used).toEqual([
      { changeSetId: "change-set-001", changeSetRevision: 7 },
      { changeSetId: "change-set-001", changeSetRevision: 20 }
    ]);
  });

  it("still cancels later queued writes for the current lease when stale recovery fails", async () => {
    const queue = new WorkspaceMutationQueue({
      getAuthority: () => ({ changeSetId: "change-set-001", changeSetRevision: 7 }),
      installAuthority: () => true,
      isCurrentContext: (context) => context === "workspace:edit:1",
      onStaleGeneration: vi.fn(async () => false)
    });
    const laterDispatch = vi.fn(async () => ({ changeSetId: "change-set-001", changeSetRevision: 9, state: "succeeded" as const }));

    const stalePromise = queue.enqueue({
      contextKey: "workspace:edit:1",
      type: "page_settings",
      dispatch: async () => ({
        code: "conflict" as const,
        currentChangeSetId: "change-set-001",
        currentChangeSetRevision: 8,
        state: "failed" as const
      })
    });
    const laterPromise = queue.enqueue({
      contextKey: "workspace:edit:1",
      type: "page_move",
      dispatch: laterDispatch
    });

    await expect(stalePromise).resolves.toMatchObject({ code: "conflict", state: "failed" });
    await expect(laterPromise).rejects.toThrow("Workspace mutation was canceled.");
    expect(laterDispatch).not.toHaveBeenCalled();
  });
});
