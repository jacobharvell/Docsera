import { beforeEach, describe, expect, it, vi } from "vitest";

const publishPage = vi.fn();

vi.mock("../pages/serviceNowPagePublishing.ts", () => ({
  createServiceNowPagePublishService: () => ({
    publishPage
  })
}));

vi.mock("@servicenow/glide", () => ({
  gs: {
    error: vi.fn(),
    getUserDisplayName: vi.fn(),
    getUserName: vi.fn(),
    getUserID: vi.fn()
  }
}));

import { process } from "./docsera-runtime-page-publish.ts";

describe("docsera runtime page publish route", () => {
  beforeEach(() => {
    publishPage.mockReset();
  });

  it("maps a persistence failure result to persistence_invariant instead of invalid input", async () => {
    publishPage.mockResolvedValue({
      kind: "failed",
      status: 500,
      errorMessage: "Database write exploded."
    });

    const setBody = vi.fn();
    const setStatus = vi.fn();

    await process(
      {
        body: {
          workspaceSlug: "product-docs",
          pageSysId: "page-001",
          lockToken: "held-token",
          expectedRevision: 4
        }
      },
      {
        setBody,
        setStatus
      }
    );

    expect(setStatus).toHaveBeenCalledWith(500);
    expect(setBody).toHaveBeenCalledWith({
      error: {
        code: "persistence_invariant",
        retryable: false,
        message: "Something went wrong while publishing. Your changes were not published. Please try again."
      }
    });
  });

  it("keeps validation failures on the invalid contract", async () => {
    publishPage.mockResolvedValue({
      kind: "failed",
      status: 400,
      errorMessage: "A page reference is required."
    });

    const setBody = vi.fn();
    const setStatus = vi.fn();

    await process(
      {
        body: {}
      },
      {
        setBody,
        setStatus
      }
    );

    expect(setStatus).toHaveBeenCalledWith(400);
    expect(setBody).toHaveBeenCalledWith({
      error: {
        code: "invalid",
        retryable: false,
        message: "A page reference is required."
      }
    });
  });
});
