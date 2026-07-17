import { beforeEach, describe, expect, it, vi } from "vitest";

const { publishPage, sendWorkspaceLeaseMutationFailure, verifyWorkspaceEditLease } = vi.hoisted(() => ({
  publishPage: vi.fn(),
  sendWorkspaceLeaseMutationFailure: vi.fn(() => false),
  verifyWorkspaceEditLease: vi.fn()
}));

vi.mock("../pages/serviceNowPagePublishing.ts", () => ({
  createServiceNowPagePublishService: () => ({
    publishPage
  })
}));

vi.mock("./docsera-runtime-workspace-edit-lease.ts", () => ({
  sendWorkspaceLeaseMutationFailure,
  verifyWorkspaceEditLease
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
    verifyWorkspaceEditLease.mockReset();
    verifyWorkspaceEditLease.mockResolvedValue({ kind: "held" });
    sendWorkspaceLeaseMutationFailure.mockReset();
    sendWorkspaceLeaseMutationFailure.mockReturnValue(false);
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
          workspaceSysId: "workspace-001",
          pageSysId: "page-001",
          workspaceLeaseToken: "workspace-lease-token",
          lockToken: "ignored-page-token",
          expectedRevision: 4
        }
      },
      {
        setBody,
        setStatus
      }
    );

    expect(setStatus).toHaveBeenCalledWith(500);
    expect(verifyWorkspaceEditLease).toHaveBeenCalledWith(expect.objectContaining({
      workspaceLeaseToken: "workspace-lease-token",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    }));
    expect(publishPage).toHaveBeenCalledWith({
      expectedRevision: 4,
      pageSlug: "",
      pageSysId: "page-001",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    });
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
      { body: { workspaceSlug: "product-docs", workspaceSysId: "workspace-001", workspaceLeaseToken: "workspace-lease-token" } },
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

  it("returns a workspace lease failure before publishing", async () => {
    sendWorkspaceLeaseMutationFailure.mockImplementation((_result, response) => {
      response.setStatus?.(409);
      response.setBody({ error: { code: "workspace_lease_lost", message: "Workspace lease lost.", retryable: false } });
      return true;
    });
    const setBody = vi.fn();
    const setStatus = vi.fn();

    await process({ body: { workspaceSlug: "product-docs", workspaceSysId: "workspace-001", pageSysId: "page-001", workspaceLeaseToken: "lost-token", expectedRevision: 4 } }, { setBody, setStatus });

    expect(publishPage).not.toHaveBeenCalled();
    expect(setStatus).toHaveBeenCalledWith(409);
  });
});
