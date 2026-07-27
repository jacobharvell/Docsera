import { recordDocseraDiagnosticEvent } from "../diagnostics";
import type { WorkspaceEditLeaseGeneration } from "../shared/types/docsera";

export type WorkspaceMutationType = "body_save" | "page_create" | "page_delete" | "page_move" | "page_settings" | "workspace_discard_all" | "workspace_publish";

export type WorkspaceMutationResultAuthority = {
  changeSetId?: string;
  changeSetRevision?: number;
  currentChangeSetId?: string;
  currentChangeSetRevision?: number;
  state?: string;
  code?: string;
};

type QueueEntry<T> = {
  contextKey: string;
  dispatch: (authority: WorkspaceEditLeaseGeneration | undefined) => Promise<T>;
  enqueuedAt: string;
  id: string;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  type: WorkspaceMutationType;
};

export type WorkspaceMutationQueueOptions = {
  getAuthority: () => WorkspaceEditLeaseGeneration | undefined;
  installAuthority: (authority: { changeSetId?: string; changeSetRevision?: number }, source: "mutation" | "refresh") => boolean;
  isCurrentContext: (contextKey: string) => boolean;
  onStaleGeneration: (authority: { changeSetId?: string; changeSetRevision?: number }, contextKey: string) => Promise<boolean>;
};

export class WorkspaceMutationQueue {
  private active = false;
  private nextId = 1;
  private readonly pending: Array<QueueEntry<unknown>> = [];

  constructor(private options: WorkspaceMutationQueueOptions) {}

  setOptions(options: WorkspaceMutationQueueOptions): void {
    this.options = options;
  }

  enqueue<T>(input: {
    contextKey: string;
    dispatch: (authority: WorkspaceEditLeaseGeneration | undefined) => Promise<T>;
    type: WorkspaceMutationType;
  }): Promise<T> {
    const id = `wm-${this.nextId}`;
    this.nextId += 1;
    const entry = {
      contextKey: input.contextKey,
      dispatch: input.dispatch,
      enqueuedAt: new Date().toISOString(),
      id,
      type: input.type
    } as QueueEntry<T>;
    const promise = new Promise<T>((resolve, reject) => {
      entry.resolve = resolve;
      entry.reject = reject;
    });

    this.pending.push(entry as QueueEntry<unknown>);
    recordDocseraDiagnosticEvent("workspaceMutation.enqueue", {
      contextKey: input.contextKey,
      enqueueTime: entry.enqueuedAt,
      mutationType: input.type,
      operationId: id,
      queueDepth: this.pending.length
    });
    this.drain();
    return promise;
  }

  cancelObsolete(reason: string): void {
    for (let index = this.pending.length - 1; index >= 0; index -= 1) {
      const entry = this.pending[index];
      if (!this.options.isCurrentContext(entry.contextKey)) {
        this.pending.splice(index, 1);
        recordDocseraDiagnosticEvent("workspaceMutation.complete", {
          cancellationReason: reason,
          contextKey: entry.contextKey,
          mutationType: entry.type,
          operationId: entry.id,
          result: "canceled"
        });
        entry.reject(new WorkspaceMutationCanceledError(reason));
      }
    }
  }

  private drain(): void {
    if (this.active) return;
    this.active = true;
    void this.runNext();
  }

  private async runNext(): Promise<void> {
    try {
      while (this.pending.length > 0) {
        const entry = this.pending.shift()!;
        if (!this.options.isCurrentContext(entry.contextKey)) {
          recordDocseraDiagnosticEvent("workspaceMutation.complete", {
            cancellationReason: "obsolete_before_dispatch",
            contextKey: entry.contextKey,
            mutationType: entry.type,
            operationId: entry.id,
            result: "canceled"
          });
          entry.reject(new WorkspaceMutationCanceledError("obsolete_before_dispatch"));
          continue;
        }
        const dispatchTime = new Date().toISOString();
        const authority = this.options.getAuthority();
        recordDocseraDiagnosticEvent("workspaceMutation.dispatch", {
          authority,
          contextKey: entry.contextKey,
          dispatchTime,
          enqueueTime: entry.enqueuedAt,
          mutationType: entry.type,
          operationId: entry.id
        });
        try {
          const result = await entry.dispatch(authority);
          const normalized = normalizeMutationResult(result);
          let authorityAction: "none" | "installed" | "ignored" | "stale_recovery" = "none";
          if (normalized.state === "succeeded") {
            const authority = {
              changeSetId: normalized.changeSetId,
              changeSetRevision: normalized.changeSetRevision
            };
            const hasMutationAuthority = Boolean(authority.changeSetId) && typeof authority.changeSetRevision === "number";
            if (hasMutationAuthority && !this.options.isCurrentContext(entry.contextKey)) {
              recordDocseraDiagnosticEvent("workspaceMutation.complete", {
                cancellationReason: "obsolete_after_dispatch",
                contextKey: entry.contextKey,
                mutationType: entry.type,
                operationId: entry.id,
                result: "canceled"
              });
              entry.reject(new WorkspaceMutationCanceledError("obsolete_after_dispatch"));
              continue;
            }
            authorityAction = hasMutationAuthority
              ? this.options.installAuthority(authority, "mutation")
                ? "installed"
                : "ignored"
              : "none";
          } else if (normalized.state === "failed" && normalized.code === "conflict") {
            if (!this.options.isCurrentContext(entry.contextKey)) {
              recordDocseraDiagnosticEvent("workspaceMutation.complete", {
                cancellationReason: "obsolete_stale_generation",
                contextKey: entry.contextKey,
                mutationType: entry.type,
                operationId: entry.id,
                result: "canceled"
              });
              entry.reject(new WorkspaceMutationCanceledError("obsolete_stale_generation"));
              continue;
            }
            authorityAction = "stale_recovery";
            const recovered = await this.options.onStaleGeneration({
              changeSetId: normalized.currentChangeSetId,
              changeSetRevision: normalized.currentChangeSetRevision
            }, entry.contextKey);
            if (!recovered && this.options.isCurrentContext(entry.contextKey)) {
              this.cancelPendingAfterStaleRecoveryFailure(entry.contextKey);
            }
          }
          recordDocseraDiagnosticEvent("workspaceMutation.complete", {
            authorityAction,
            currentAuthority: this.options.getAuthority(),
            contextKey: entry.contextKey,
            mutationType: entry.type,
            operationId: entry.id,
            responseStatus: normalized.state,
            resultCode: normalized.code,
            returnedAuthority: {
              changeSetId: normalized.changeSetId ?? normalized.currentChangeSetId,
              changeSetRevision: normalized.changeSetRevision ?? normalized.currentChangeSetRevision
            },
            result: "completed"
          });
          entry.resolve(result);
        } catch (error) {
          recordDocseraDiagnosticEvent("workspaceMutation.complete", {
            contextKey: entry.contextKey,
            error: "exception",
            mutationType: entry.type,
            operationId: entry.id,
            result: "failed"
          });
          entry.reject(error);
        }
      }
    } finally {
      this.active = false;
      if (this.pending.length > 0) this.drain();
    }
  }

  private cancelPendingAfterStaleRecoveryFailure(contextKey: string): void {
    for (let index = this.pending.length - 1; index >= 0; index -= 1) {
      const entry = this.pending[index];
      if (!this.options.isCurrentContext(entry.contextKey) || entry.contextKey !== contextKey) {
        continue;
      }
      this.pending.splice(index, 1);
      recordDocseraDiagnosticEvent("workspaceMutation.complete", {
        cancellationReason: "stale_generation_recovery_failed",
        contextKey: entry.contextKey,
        mutationType: entry.type,
        operationId: entry.id,
        result: "canceled",
        staleContextKey: contextKey
      });
      entry.reject(new WorkspaceMutationCanceledError("stale_generation_recovery_failed"));
    }
  }
}

export class WorkspaceMutationCanceledError extends Error {
  constructor(readonly reason: string) {
    super("Workspace mutation was canceled.");
  }
}

export function isWorkspaceMutationCanceled(error: unknown): error is WorkspaceMutationCanceledError {
  return error instanceof WorkspaceMutationCanceledError;
}

function normalizeMutationResult(result: unknown): WorkspaceMutationResultAuthority {
  return result && typeof result === "object" ? result as WorkspaceMutationResultAuthority : {};
}
