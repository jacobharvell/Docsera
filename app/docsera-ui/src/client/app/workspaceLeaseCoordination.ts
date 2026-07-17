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
    if (!input.stored.token || !input.stored.tabSessionId || !input.tabSessionId || input.stored.tabSessionId !== input.tabSessionId) {
      return false;
    }
    const BroadcastChannelCtor = this.options.getBroadcastChannel ? this.options.getBroadcastChannel() : getBrowserBroadcastChannel();
    if (!BroadcastChannelCtor) return false;

    let channel: BroadcastChannelLike;
    try {
      channel = new BroadcastChannelCtor(this.options.channelName);
    } catch {
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
          resolve(value);
        };
        const timeout = window.setTimeout(() => settle(true), this.options.probeTimeoutMs);
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
              settle(false);
            }
          } catch {
            settle(false);
          }
        };
        try {
          channel.postMessage({ kind: "probe", probeId, runtimeId: this.runtimeId, tabSessionId: input.tabSessionId, workspaceSysId: input.workspaceSysId });
        } catch {
          settle(false);
        }
      });
    } catch {
      return false;
    } finally {
      channel.close();
    }
  }

  startResponder(input: { bindingId: string; tabSessionId: string; workspaceSysId: string }): void {
    this.stopResponder();
    if (!input.bindingId || !input.tabSessionId || !input.workspaceSysId) return;
    const BroadcastChannelCtor = this.options.getBroadcastChannel ? this.options.getBroadcastChannel() : getBrowserBroadcastChannel();
    if (!BroadcastChannelCtor) return;
    try {
      const responder = new BroadcastChannelCtor(this.options.channelName);
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
            responder.postMessage({ kind: "active", bindingId: input.bindingId, probeId: message.probeId, runtimeId: this.runtimeId, tabSessionId: input.tabSessionId, workspaceSysId: input.workspaceSysId });
          }
        } catch {
          // Coordination is advisory. A broken responder must never authorize resume.
        }
      };
      this.responder = responder;
      this.responderBindingId = input.bindingId;
    } catch {
      this.stopResponder();
    }
  }

  stopResponder(bindingId?: string): void {
    if (bindingId && bindingId !== this.responderBindingId) return;
    const responder = this.responder;
    this.responder = null;
    this.responderBindingId = "";
    try { responder?.close(); } catch { /* no-op */ }
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
