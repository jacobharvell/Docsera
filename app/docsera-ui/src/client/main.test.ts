import { beforeEach, describe, expect, it, vi } from "vitest";

const initializeDocseraDiagnostics = vi.fn();
const mountDocseraApp = vi.fn();
const ensureRuntimeStylesheet = vi.fn();
const prepareStandaloneRuntimeLaunch = vi.fn();
const renderStandaloneLaunchFailure = vi.fn();

vi.mock("./diagnostics", () => ({
  initializeDocseraDiagnostics
}));

vi.mock("./bootstrap", () => ({
  mountDocseraApp
}));

vi.mock("./runtimeStylesheet", () => ({
  ensureRuntimeStylesheet
}));

vi.mock("./runtimeLaunch", () => ({
  prepareStandaloneRuntimeLaunch,
  renderStandaloneLaunchFailure
}));

describe("main bootstrap entry", () => {
  beforeEach(() => {
    initializeDocseraDiagnostics.mockReset();
    mountDocseraApp.mockReset();
    ensureRuntimeStylesheet.mockReset();
    prepareStandaloneRuntimeLaunch.mockReset();
    renderStandaloneLaunchFailure.mockReset();
    vi.resetModules();
  });

  it("starts diagnostics, CSS, and React only for the top-level standalone runtime", async () => {
    prepareStandaloneRuntimeLaunch.mockReturnValue({
      kind: "continue",
      targetUrl: "/x_82900_docsera_docsera_sdk_runtime.do"
    });

    await import("./main");

    expect(prepareStandaloneRuntimeLaunch).toHaveBeenCalledOnce();
    expect(initializeDocseraDiagnostics).toHaveBeenCalledOnce();
    expect(ensureRuntimeStylesheet).toHaveBeenCalledOnce();
    expect(mountDocseraApp).toHaveBeenCalledOnce();
    expect(renderStandaloneLaunchFailure).not.toHaveBeenCalled();
  });

  it("does not start diagnostics, CSS, or React in the framed copy while the top-level handoff is in progress", async () => {
    prepareStandaloneRuntimeLaunch.mockReturnValue({
      kind: "redirected",
      targetUrl: "/x_82900_docsera_docsera_sdk_runtime.do#/workspace/page?mode=edit"
    });

    await import("./main");

    expect(prepareStandaloneRuntimeLaunch).toHaveBeenCalledOnce();
    expect(initializeDocseraDiagnostics).not.toHaveBeenCalled();
    expect(ensureRuntimeStylesheet).not.toHaveBeenCalled();
    expect(mountDocseraApp).not.toHaveBeenCalled();
    expect(renderStandaloneLaunchFailure).not.toHaveBeenCalled();
  });

  it("renders a launch failure surface instead of starting the framed runtime when handoff cannot complete", async () => {
    const failure = {
      currentUrl: "https://example.service-now.com/x_82900_docsera_docsera_sdk_runtime.do",
      details: {
        redirectError: "replace failed"
      },
      kind: "failed" as const,
      message: "Docsera could not switch this launch into the standalone runtime.",
      targetUrl: "/x_82900_docsera_docsera_sdk_runtime.do#/workspace/page?mode=edit"
    };
    prepareStandaloneRuntimeLaunch.mockReturnValue(failure);

    await import("./main");

    expect(prepareStandaloneRuntimeLaunch).toHaveBeenCalledOnce();
    expect(renderStandaloneLaunchFailure).toHaveBeenCalledWith(failure);
    expect(initializeDocseraDiagnostics).not.toHaveBeenCalled();
    expect(ensureRuntimeStylesheet).not.toHaveBeenCalled();
    expect(mountDocseraApp).not.toHaveBeenCalled();
  });
});
