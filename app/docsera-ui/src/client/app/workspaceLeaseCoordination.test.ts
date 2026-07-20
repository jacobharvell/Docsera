import { afterEach, describe, expect, it, vi } from "vitest";
import { initializeDocseraDiagnostics } from "../diagnostics";
import { WorkspaceLeaseCoordination } from "./workspaceLeaseCoordination";

type Message = Record<string, unknown>;

class FakeBroadcastChannel {
  static peers = new Map<string, Set<FakeBroadcastChannel>>();
  onmessage: ((event: MessageEvent<Message>) => void) | null = null;
  closed = false;
  constructor(readonly name: string) {
    const peers = FakeBroadcastChannel.peers.get(name) ?? new Set<FakeBroadcastChannel>();
    peers.add(this);
    FakeBroadcastChannel.peers.set(name, peers);
  }
  postMessage(message: Message) {
    for (const peer of FakeBroadcastChannel.peers.get(this.name) ?? []) {
      if (peer !== this && !peer.closed) peer.onmessage?.({ data: message } as MessageEvent<Message>);
    }
  }
  close() {
    this.closed = true;
    const peers = FakeBroadcastChannel.peers.get(this.name);
    peers?.delete(this);
    if (peers?.size === 0) FakeBroadcastChannel.peers.delete(this.name);
  }
}

function coordinator() {
  return new WorkspaceLeaseCoordination({
    channelName: "workspace-lease-test",
    createRuntimeId: () => `runtime-${++runtimeId}`,
    getBroadcastChannel: () => FakeBroadcastChannel as never,
    probeTimeoutMs: 10
  });
}

let runtimeId = 0;

afterEach(() => {
  FakeBroadcastChannel.peers.clear();
  runtimeId = 0;
  window.__DOCSERA_DIAGNOSTICS__?.disable();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.useRealTimers();
});

describe("WorkspaceLeaseCoordination", () => {
  it("permits a same-tab hard-refresh resume after a silent probe timeout", async () => {
    vi.useFakeTimers();
    const result = coordinator().canResume({ stored: { tabSessionId: "tab-a", token: "token" }, tabSessionId: "tab-a", workspaceSysId: "workspace-a" });
    await vi.advanceTimersByTimeAsync(10);
    await expect(result).resolves.toBe(true);
  });

  it("never permits missing or different tab identities", async () => {
    const subject = coordinator();
    await expect(subject.canResume({ stored: { tabSessionId: "", token: "token" }, tabSessionId: "tab-a", workspaceSysId: "workspace-a" })).resolves.toBe(false);
    await expect(subject.canResume({ stored: { tabSessionId: "tab-b", token: "token" }, tabSessionId: "tab-a", workspaceSysId: "workspace-a" })).resolves.toBe(false);
  });

  it("answers duplicate-tab probes while the original holder responder is active", async () => {
    const holder = coordinator();
    holder.startResponder({ bindingId: "binding-a", tabSessionId: "tab-a", workspaceSysId: "workspace-a" });
    await expect(coordinator().canResume({ stored: { tabSessionId: "tab-a", token: "token" }, tabSessionId: "tab-a", workspaceSysId: "workspace-a" })).resolves.toBe(false);
    holder.stopResponder();
  });

  it("closes the responder and then permits a refresh probe to time out", async () => {
    vi.useFakeTimers();
    const holder = coordinator();
    holder.startResponder({ bindingId: "binding-a", tabSessionId: "tab-a", workspaceSysId: "workspace-a" });
    holder.stopResponder("binding-a");
    const result = coordinator().canResume({ stored: { tabSessionId: "tab-a", token: "token" }, tabSessionId: "tab-a", workspaceSysId: "workspace-a" });
    await vi.advanceTimersByTimeAsync(10);
    await expect(result).resolves.toBe(true);
  });

  it("fails closed when BroadcastChannel is unavailable or message construction fails", async () => {
    const unavailable = new WorkspaceLeaseCoordination({ channelName: "x", getBroadcastChannel: () => undefined, probeTimeoutMs: 1 });
    await expect(unavailable.canResume({ stored: { tabSessionId: "tab-a", token: "token" }, tabSessionId: "tab-a", workspaceSysId: "workspace-a" })).resolves.toBe(false);
    class ThrowingChannel extends FakeBroadcastChannel { postMessage() { throw new Error("broken"); } }
    const broken = new WorkspaceLeaseCoordination({ channelName: "x", getBroadcastChannel: () => ThrowingChannel as never, probeTimeoutMs: 1 });
    await expect(broken.canResume({ stored: { tabSessionId: "tab-a", token: "token" }, tabSessionId: "tab-a", workspaceSysId: "workspace-a" })).resolves.toBe(false);
  });

  it("keeps the same canResume decision when diagnostics are enabled", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    window.localStorage.setItem("docsera.diagnostics.enabled", "true");
    initializeDocseraDiagnostics();

    const result = coordinator().canResume({ stored: { tabSessionId: "tab-a", token: "token" }, tabSessionId: "tab-a", workspaceSysId: "workspace-a" });
    await vi.advanceTimersByTimeAsync(10);

    await expect(result).resolves.toBe(true);
    expect(window.__DOCSERA_DIAGNOSTICS__?.exportTrace().events.some((event) => event.event === "lease.broadcast.canResume.finish")).toBe(true);
  });
});
