import { describe, expect, it, vi } from "vitest";
import { process } from "./docsera-runtime-page-publish.ts";

describe("docsera runtime page publish route", () => {
  it("fails closed because workspace publish is not active on this route", async () => {
    const setBody = vi.fn();
    const setStatus = vi.fn();

    await process(
      {
        body: {
          workspaceSlug: "product-docs",
          workspaceSysId: "workspace-001",
          pageSysId: "page-001",
          workspaceLeaseToken: "workspace-lease-token"
        }
      },
      { setBody, setStatus }
    );

    expect(setStatus).toHaveBeenCalledWith(405);
    expect(setBody).toHaveBeenCalledWith({
      error: {
        code: "publish_unavailable",
        retryable: false,
        message: "Workspace publish is not active on this route."
      }
    });
  });
});
