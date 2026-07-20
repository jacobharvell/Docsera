import { fingerprintDiagnosticSecret, recordDocseraDiagnosticEvent } from "../diagnostics";

export type StoredWorkspaceLease = { tabSessionId: string; token: string };

type CoordinationMessage = {
  bindingId?: string;
  kind?: "active" | "probe";
  probeId?: string;
  runtimeId?: string;
  tabSessionId?: string;
  workspaceSysId?: string;
};

type BroadcastChannelLike = {
  close: () => void;
  onmessage: ((event: MessageEvent<CoordinationMessage>) => void) | null;
  postMessage: (message: CoordinationMessage) => void;
};

type BroadcastChannelConstructor = new (name: string) => BroadcastChannelLike;

export type WorkspaceLeaseCoordinationOptions = {
  channelName: string;
  createRuntimeId?: () => string;
  getBroadcastChannel?: () => BroadcastChannelConstructor | undefined;
  probeTimeoutMs: number;
};

export class WorkspaceLeaseCoordination {
  private responder: BroadcastChannelLike | null = null;
  private responderBindingId = "";
  private readonly runtimeId: string;

  constructor(private readonly options: WorkspaceLeaseCoordinationOptions) {
    this.runtimeId = (options.createRuntimeId ?? createRuntimeId)();
  }

  async canResume(input: { stored: StoredWorkspaceLease; tabSessionId: string; workspaceSysId: string }): Promise<boolean> {
    recordDocseraDiagnosticEvent("lease.broadcast.canResume.start", {
      runtimeId: this.runtimeId,
      storedTabSessionFingerprint: fingerprintDiagnosticSecret(input.stored.tabSessionId),
      tabSessionFingerprint: fingerprintDiagnosticSecret(input.tabSessionId),
      tokenPresent: Boolean(input.stored.token),
      workspaceSysId: input.workspaceSysId
    });
    if (!input.stored.token || !input.stored.tabSessionId || !input.tabSessionId || input.stored.tabSessionId !== input.tabSessionId) {
      recordDocseraDiagnosticEvent("lease.broadcast.canResume.finish", {
        canResume: false,
        reason: "identity_or_token_missing",
        runtimeId: this.runtimeId,
        workspaceSysId: input.workspaceSysId
      });
      return false;
    }
    const BroadcastChannelCtor = this.options.getBroadcastChannel ? this.options.getBroadcastChannel() : getBrowserBroadcastChannel();
    recordDocseraDiagnosticEvent("lease.broadcast.available", {
      exists: Boolean(BroadcastChannelCtor),
      runtimeId: this.runtimeId,
      workspaceSysId: input.workspaceSysId
    });
    if (!BroadcastChannelCtor) {
      recordDocseraDiagnosticEvent("lease.broadcast.canResume.finish", {
        canResume: false,
        reason: "broadcast_channel_unavailable",
        runtimeId: this.runtimeId,
        workspaceSysId: input.workspaceSysId
      });
      return false;
    }

    let channel: BroadcastChannelLike;
    try {
      channel = new BroadcastChannelCtor(this.options.channelName);
      recordDocseraDiagnosticEvent("lease.broadcast.channel.constructed", {
        channelName: this.options.channelName,
        runtimeId: this.runtimeId,
        workspaceSysId: input.workspaceSysId
      });
    } catch {
      recordDocseraDiagnosticEvent("lease.broadcast.channel.error", {
        action: "construct",
        runtimeId: this.runtimeId,
        workspaceSysId: input.workspaceSysId
      });
      return false;
    }
    const probeId = createRuntimeId();
    try {
      return await new Promise<boolean>((resolve) => {
        let settled = false;
        const settle = (value: boolean) => {
          if (settled) return;
          settled = true;
          window.clearTimeout(timeout);
          recordDocseraDiagnosticEvent("lease.broadcast.canResume.finish", {
            canResume: value,
            probeId,
            runtimeId: this.runtimeId,
            workspaceSysId: input.workspaceSysId
          });
          resolve(value);
        };
        const probeStartTime = new Date().toISOString();
        recordDocseraDiagnosticEvent("lease.broadcast.probe.start", {
          probeId,
          probeStartTime,
          probeTimeoutMs: this.options.probeTimeoutMs,
          runtimeId: this.runtimeId,
          tabSessionFingerprint: fingerprintDiagnosticSecret(input.tabSessionId),
          workspaceSysId: input.workspaceSysId
        });
        const timeout = window.setTimeout(() => {
          recordDocseraDiagnosticEvent("lease.broadcast.probe.timeout", {
            probeId,
            runtimeId: this.runtimeId,
            workspaceSysId: input.workspaceSysId
          });
          settle(true);
        }, this.options.probeTimeoutMs);
        channel.onmessage = (event) => {
          try {
            const message = event.data;
            if (
              message?.kind === "active" &&
              message.probeId === probeId &&
              message.workspaceSysId === input.workspaceSysId &&
              message.tabSessionId === input.tabSessionId &&
              message.runtimeId !== this.runtimeId
            ) {
              recordDocseraDiagnosticEvent("lease.broadcast.activeResponse", {
                probeId,
                responseRuntimeId: message.runtimeId,
                runtimeId: this.runtimeId,
                tabSessionFingerprint: fingerprintDiagnosticSecret(message.tabSessionId),
                workspaceSysId: input.workspaceSysId
              });
              settle(false);
            }
          } catch {
            recordDocseraDiagnosticEvent("lease.broadcast.channel.error", {
              action: "message",
              probeId,
              runtimeId: this.runtimeId,
              workspaceSysId: input.workspaceSysId
            });
            settle(false);
          }
        };
        try {
          channel.postMessage({ kind: "probe", probeId, runtimeId: this.runtimeId, tabSessionId: input.tabSessionId, workspaceSysId: input.workspaceSysId });
        } catch {
          recordDocseraDiagnosticEvent("lease.broadcast.channel.error", {
            action: "post_probe",
            probeId,
            runtimeId: this.runtimeId,
            workspaceSysId: input.workspaceSysId
          });
          settle(false);
        }
      });
    } catch {
      recordDocseraDiagnosticEvent("lease.broadcast.canResume.finish", {
        canResume: false,
        reason: "probe_exception",
        runtimeId: this.runtimeId,
        workspaceSysId: input.workspaceSysId
      });
      return false;
    } finally {
      try {
        channel.close();
        recordDocseraDiagnosticEvent("lease.broadcast.channel.close", {
          reason: "probe_complete",
          runtimeId: this.runtimeId,
          workspaceSysId: input.workspaceSysId
        });
      } catch {
        recordDocseraDiagnosticEvent("lease.broadcast.channel.error", {
          action: "close_probe",
          runtimeId: this.runtimeId,
          workspaceSysId: input.workspaceSysId
        });
      }
    }
  }

  startResponder(input: { bindingId: string; tabSessionId: string; workspaceSysId: string }): void {
    this.stopResponder(undefined, "responder_replaced");
    if (!input.bindingId || !input.tabSessionId || !input.workspaceSysId) return;
    const BroadcastChannelCtor = this.options.getBroadcastChannel ? this.options.getBroadcastChannel() : getBrowserBroadcastChannel();
    if (!BroadcastChannelCtor) {
      recordDocseraDiagnosticEvent("lease.broadcast.responder.skip", {
        reason: "broadcast_channel_unavailable",
        runtimeId: this.runtimeId,
        workspaceSysId: input.workspaceSysId
      });
      return;
    }
    try {
      const responder = new BroadcastChannelCtor(this.options.channelName);
      recordDocseraDiagnosticEvent("lease.broadcast.responder.start", {
        bindingId: fingerprintDiagnosticSecret(input.bindingId),
        runtimeId: this.runtimeId,
        tabSessionFingerprint: fingerprintDiagnosticSecret(input.tabSessionId),
        workspaceSysId: input.workspaceSysId
      });
      responder.onmessage = (event) => {
        try {
          const message = event.data;
          if (
            message?.kind === "probe" &&
            message.runtimeId !== this.runtimeId &&
            message.workspaceSysId === input.workspaceSysId &&
            message.tabSessionId === input.tabSessionId &&
            message.probeId
          ) {
            recordDocseraDiagnosticEvent("lease.broadcast.responder.respond", {
              probeId: message.probeId,
              requesterRuntimeId: message.runtimeId,
              runtimeId: this.runtimeId,
              workspaceSysId: input.workspaceSysId
            });
            responder.postMessage({ kind: "active", bindingId: input.bindingId, probeId: message.probeId, runtimeId: this.runtimeId, tabSessionId: input.tabSessionId, workspaceSysId: input.workspaceSysId });
          }
        } catch {
          recordDocseraDiagnosticEvent("lease.broadcast.channel.error", {
            action: "responder_message",
            runtimeId: this.runtimeId,
            workspaceSysId: input.workspaceSysId
          });
        }
      };
      this.responder = responder;
      this.responderBindingId = input.bindingId;
    } catch {
      recordDocseraDiagnosticEvent("lease.broadcast.channel.error", {
        action: "construct_responder",
        runtimeId: this.runtimeId,
        workspaceSysId: input.workspaceSysId
      });
      this.stopResponder(undefined, "responder_construct_error");
    }
  }

  stopResponder(bindingId?: string, reason = "stop_requested"): void {
    if (bindingId && bindingId !== this.responderBindingId) return;
    const responder = this.responder;
    this.responder = null;
    this.responderBindingId = "";
    try {
      responder?.close();
      if (responder) {
        recordDocseraDiagnosticEvent("lease.broadcast.responder.stop", {
          reason,
          runtimeId: this.runtimeId
        });
      }
    } catch {
      recordDocseraDiagnosticEvent("lease.broadcast.channel.error", {
        action: "close_responder",
        reason,
        runtimeId: this.runtimeId
      });
    }
  }
}

function createRuntimeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function getBrowserBroadcastChannel(): BroadcastChannelConstructor | undefined {
  return typeof window !== "undefined" && typeof window.BroadcastChannel === "function"
    ? window.BroadcastChannel as unknown as BroadcastChannelConstructor
    : undefined;
}
