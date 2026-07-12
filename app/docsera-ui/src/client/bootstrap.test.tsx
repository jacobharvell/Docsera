import { beforeEach, describe, expect, it, vi } from "vitest";

const createRootMock = vi.fn(() => ({
  render: vi.fn()
}));

vi.mock("react-dom/client", () => ({
  default: {
    createRoot: createRootMock
  }
}));

vi.mock("./platform/servicenow/runtime", () => ({
  resolveRuntimeContext: vi.fn()
}));

vi.mock("./platform/servicenow/client", () => ({
  createServiceNowClient: vi.fn(() => ({}))
}));

describe("mountDocseraApp", () => {
  beforeEach(() => {
    createRootMock.mockClear();
    document.body.innerHTML = '<div id="docsera-root"></div>';
  });

  it("creates the app root once for a mount node even if bootstrap is invoked twice", async () => {
    const mountNode = document.getElementById("docsera-root") as HTMLDivElement;
    const { resolveRuntimeContext } = await import("./platform/servicenow/runtime");
    vi.mocked(resolveRuntimeContext).mockReturnValue({
      config: {},
      mountNode,
      mountNodeId: "docsera-root"
    });

    const { mountDocseraApp } = await import("./bootstrap");
    mountDocseraApp();
    mountDocseraApp();

    expect(createRootMock).toHaveBeenCalledTimes(1);
    expect(mountNode.getAttribute("data-docsera-mounted")).toBe("true");
  });
});
