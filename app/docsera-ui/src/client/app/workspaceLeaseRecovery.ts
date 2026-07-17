import type { WorkspaceEditLeaseHeld } from "../shared/types/docsera";

export type WorkspaceLeaseRecoveryState = "held" | "uncertain" | "recovery_required" | "recovering" | "contention" | "forbidden" | "transient_failure";
export type WorkspaceLeaseRecoveryResult =
  | { state: "held"; lease: WorkspaceEditLeaseHeld }
  | { state: "contention"; holderDisplayName: string | null; sameUserDifferentSession: boolean }
  | { state: "forbidden"; errorMessage: string }
  | { state: "transient_failure"; errorMessage: string };
export type WorkspaceLeaseMutationRecoveryResult = Exclude<WorkspaceLeaseRecoveryResult, { state: "held" }>;

/** Serializes recovery for a workspace.  The App owns route/binding generation
 * checks; this deliberately has no UI or persistence knowledge. */
export class WorkspaceLeaseRecoveryCoordinator {
  private readonly inFlight = new Map<string, Promise<WorkspaceLeaseRecoveryResult>>();

  ensure(scope: string, run: () => Promise<WorkspaceLeaseRecoveryResult>): Promise<WorkspaceLeaseRecoveryResult> {
    let promise = this.inFlight.get(scope);
    if (!promise) {
      promise = run().finally(() => {
        if (this.inFlight.get(scope) === promise) this.inFlight.delete(scope);
      });
      this.inFlight.set(scope, promise);
    }
    return promise;
  }

  reset(scope?: string): void { if (scope) this.inFlight.delete(scope); else this.inFlight.clear(); }

  async runMutation<T>(input: {
    scope: () => string;
    ensure: () => Promise<WorkspaceLeaseRecoveryResult>;
    invalidateLeaseRace: () => void | Promise<void>;
    mutate: (leaseToken: string) => Promise<T>;
    isLeaseRace: (result: T) => boolean;
  }): Promise<T | WorkspaceLeaseMutationRecoveryResult> {
    const initialScope = input.scope();
    const first = await input.ensure();
    if (first.state !== "held") return first;
    // A route/binding change while a shared recovery was pending makes this
    // operation stale.  Never spend the recovered credential on it.
    if (input.scope() !== initialScope) {
      return { state: "transient_failure", errorMessage: "The editing session changed." };
    }
    const result = await input.mutate(first.lease.leaseToken);
    if (!input.isLeaseRace(result)) return result;
    // The server rejected this credential.  App must remove the binding before
    // another ensure can run, so recovery cannot return the rejected token.
    await input.invalidateLeaseRace();
    const replacementScope = input.scope();
    if (replacementScope === initialScope) {
      return { state: "transient_failure", errorMessage: "The editing session did not advance after lease recovery." };
    }
    const recovered = await input.ensure();
    if (recovered.state !== "held") return recovered;
    // Exactly one retry is permitted, and only while the replacement scope is
    // still current. A second lease race is returned to the caller untouched.
    if (input.scope() !== replacementScope) {
      return { state: "transient_failure", errorMessage: "The editing session changed." };
    }
    return input.mutate(recovered.lease.leaseToken);
  }
}
