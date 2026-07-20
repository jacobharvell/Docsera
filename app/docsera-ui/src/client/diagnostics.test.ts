import { afterEach, describe, expect, it, vi } from "vitest";

async function loadDiagnostics() {
  vi.resetModules();
  return import("./diagnostics");
}

afterEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/");
  vi.restoreAllMocks();
});

describe("Docsera diagnostics", () => {
  it("is disabled by default and emits no trace", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const diagnostics = await loadDiagnostics();

    diagnostics.initializeDocseraDiagnostics();
    diagnostics.recordDocseraDiagnosticEvent("test.event", {});

    expect(window.__DOCSERA_DIAGNOSTICS__?.exportTrace()).toMatchObject({
      enabled: false,
      events: []
    });
    expect(debug).not.toHaveBeenCalled();
  });

  it("exports and clears a bounded chronological ring buffer", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const diagnostics = await loadDiagnostics();
    window.localStorage.setItem("docsera.diagnostics.enabled", "true");
    diagnostics.initializeDocseraDiagnostics();
    window.__DOCSERA_DIAGNOSTICS__?.clearTrace();

    for (let index = 0; index < 405; index += 1) {
      diagnostics.recordDocseraDiagnosticEvent("test.event", { index });
    }

    const trace = window.__DOCSERA_DIAGNOSTICS__?.exportTrace();
    expect(trace?.events).toHaveLength(400);
    expect(trace?.events[0]?.data.index).toBe(5);
    expect(trace?.events[399]?.data.index).toBe(404);

    const cleared = window.__DOCSERA_DIAGNOSTICS__?.clearTrace();
    expect(cleared?.events).toHaveLength(1);
    expect(cleared?.events[0]?.event).toBe("trace.clear");
  });

  it("redacts plaintext lease tokens while preserving stable token fingerprints", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const diagnostics = await loadDiagnostics();
    window.localStorage.setItem("docsera.diagnostics.enabled", "true");
    diagnostics.initializeDocseraDiagnostics();
    window.__DOCSERA_DIAGNOSTICS__?.clearTrace();

    const token = "workspace-lease-token-secret";
    const fingerprint = diagnostics.fingerprintDiagnosticSecret(token);
    diagnostics.recordDocseraDiagnosticEvent("lease.test", {
      leaseToken: token,
      tokenFingerprint: fingerprint
    });

    const serialized = JSON.stringify(window.__DOCSERA_DIAGNOSTICS__?.exportTrace());
    expect(diagnostics.fingerprintDiagnosticSecret(token)).toBe(fingerprint);
    expect(fingerprint).not.toContain(token);
    expect(serialized).not.toContain(token);
    expect(serialized).toContain(fingerprint);
    expect(serialized).toContain("[redacted]");
  });

  it("keeps storage clear and release reasons in exported events", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const diagnostics = await loadDiagnostics();
    window.localStorage.setItem("docsera.diagnostics.enabled", "true");
    diagnostics.initializeDocseraDiagnostics();
    window.__DOCSERA_DIAGNOSTICS__?.clearTrace();

    diagnostics.recordDocseraDiagnosticEvent("lease.storage.clear", {
      reason: "identity_mismatch",
      tokenFingerprint: diagnostics.fingerprintDiagnosticSecret("token")
    });
    diagnostics.recordDocseraDiagnosticEvent("lease.release.request", {
      reason: "document_teardown",
      tokenFingerprint: diagnostics.fingerprintDiagnosticSecret("token")
    });

    expect(window.__DOCSERA_DIAGNOSTICS__?.exportTrace().events.map((event) => event.data.reason)).toEqual([
      undefined,
      "identity_mismatch",
      "document_teardown"
    ]);
  });

  it("route parser diagnostics distinguish workspace routes from launcher fallback", async () => {
    vi.spyOn(console, "debug").mockImplementation(() => undefined);
    const diagnostics = await loadDiagnostics();
    window.localStorage.setItem("docsera.diagnostics.enabled", "true");
    diagnostics.initializeDocseraDiagnostics();
    window.__DOCSERA_DIAGNOSTICS__?.clearTrace();
    const routing = await import("./features/workspaces/workspaceRouting");

    routing.readAppRoute({ search: "?workspace=product-docs&page=overview&mode=edit" } as Location);
    routing.readAppRoute({ search: "?view=my-workspaces" } as Location);
    routing.readAppRoute({ search: "?mode=edit" } as Location);

    const parseEvents = window.__DOCSERA_DIAGNOSTICS__?.exportTrace().events.filter((event) => event.event === "route.parse") ?? [];
    expect(parseEvents[0]?.data).toMatchObject({
      defaultedToLauncher: false,
      requestedMode: "edit",
      workspacePresent: true,
      workspaceSlug: "product-docs"
    });
    expect(parseEvents[1]?.data).toMatchObject({
      defaultedToLauncher: true,
      workspacePresent: false
    });
    expect(parseEvents[2]?.data).toMatchObject({
      defaultedToLauncher: true,
      rawSearch: "?mode=edit",
      workspacePresent: false
    });
  });
});
