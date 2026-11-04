import { describe, expect, it, vi } from "vitest";
import { prepareStandaloneRuntimeLaunch, renderStandaloneLaunchFailure, type StandaloneLaunchPreparation } from "./runtimeLaunch";

function createEnvironment(options: {
  currentHref?: string;
  pathname?: string;
  search?: string;
  hash?: string;
  replaceThrows?: boolean;
  topAccessible?: boolean;
  topHref?: string;
} = {}) {
  const {
    currentHref = "https://example.service-now.com/x_2300756_docsera_docsera_sdk_runtime.do",
    pathname = "/x_2300756_docsera_docsera_sdk_runtime.do",
    search = "",
    hash = "",
    replaceThrows = false,
    topAccessible = true,
    topHref = "https://example.service-now.com/now/nav/ui/classic/params/target/x_2300756_docsera_docsera_sdk_runtime.do"
  } = options;

  const replace = vi.fn((nextUrl: string) => {
    if (replaceThrows) {
      throw new Error(`replace failed for ${nextUrl}`);
    }
  });

  const body = document.createElement("body");
  const topWindow = {
    location: {
      href: topHref,
      replace
    }
  };

  const targetWindow = {
    get location() {
      return {
        hash,
        href: currentHref,
        pathname,
        search
      };
    },
    get self() {
      return targetWindow;
    },
    get top() {
      if (!topAccessible) {
        throw new Error("cross-origin access denied");
      }
      return topWindow;
    }
  };

  return {
    body,
    console: {
      error: vi.fn()
    },
    document: {
      body,
      createElement: document.createElement.bind(document),
      title: "Docsera"
    },
    replace,
    topWindow,
    window: targetWindow
  };
}

describe("prepareStandaloneRuntimeLaunch", () => {
  it("does not redirect when the runtime already owns the top-level window", () => {
    const environment = createEnvironment();
    Object.defineProperty(environment.window, "top", {
      get: () => environment.window
    });

    const result = prepareStandaloneRuntimeLaunch(environment);

    expect(result).toEqual({
      kind: "continue",
      targetUrl: "/x_2300756_docsera_docsera_sdk_runtime.do"
    });
    expect(environment.replace).not.toHaveBeenCalled();
  });

  it("replaces the top-level browser location before bootstrap when launched in a frame", () => {
    const environment = createEnvironment({
      currentHref: "https://example.service-now.com/x_2300756_docsera_docsera_sdk_runtime.do?foo=1#/workspace/page?mode=edit",
      hash: "#/workspace/page?mode=edit",
      search: "?foo=1"
    });

    const result = prepareStandaloneRuntimeLaunch(environment);

    expect(result).toEqual({
      kind: "redirected",
      targetUrl: "/x_2300756_docsera_docsera_sdk_runtime.do?foo=1#/workspace/page?mode=edit"
    });
    expect(environment.replace).toHaveBeenCalledWith("/x_2300756_docsera_docsera_sdk_runtime.do?foo=1#/workspace/page?mode=edit");
  });

  it("fails closed when the top window cannot be reached", () => {
    const environment = createEnvironment({
      topAccessible: false
    });

    const result = prepareStandaloneRuntimeLaunch(environment);

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") {
      throw new Error("Expected launch failure");
    }
    expect(result.message).toContain("could not open outside the ServiceNow navigator frame");
    expect(result.targetUrl).toBe("/x_2300756_docsera_docsera_sdk_runtime.do");
  });

  it("fails closed when top-level replacement throws", () => {
    const environment = createEnvironment({
      replaceThrows: true
    });

    const result = prepareStandaloneRuntimeLaunch(environment);

    expect(result.kind).toBe("failed");
    if (result.kind !== "failed") {
      throw new Error("Expected launch failure");
    }
    expect(result.details).toMatchObject({
      redirectError: "replace failed for /x_2300756_docsera_docsera_sdk_runtime.do"
    });
  });
});

describe("renderStandaloneLaunchFailure", () => {
  it("renders a direct-open fallback without starting the app", () => {
    const environment = createEnvironment();
    const result: Extract<StandaloneLaunchPreparation, { kind: "failed" }> = {
      currentUrl: "https://example.service-now.com/x_2300756_docsera_docsera_sdk_runtime.do",
      details: {
        redirectError: "replace failed"
      },
      kind: "failed",
      message: "Docsera could not switch this launch into the standalone runtime.",
      targetUrl: "/x_2300756_docsera_docsera_sdk_runtime.do#/workspace/page?mode=edit"
    };

    renderStandaloneLaunchFailure(result, environment);

    const action = environment.body.querySelector("a");
    expect(environment.document.title).toBe("Docsera Launch Failed");
    expect(environment.body.textContent).toContain("Open Docsera in a full page");
    expect(action?.getAttribute("href")).toBe("/x_2300756_docsera_docsera_sdk_runtime.do#/workspace/page?mode=edit");
    expect(action?.getAttribute("target")).toBe("_top");
    expect(environment.console.error).toHaveBeenCalledOnce();
  });
});
