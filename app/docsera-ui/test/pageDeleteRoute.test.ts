import { beforeEach, describe, expect, it, vi } from "vitest";

const { createServiceNowPageSettingsService } = vi.hoisted(() => ({
  createServiceNowPageSettingsService: vi.fn()
}));

const { sendWorkspaceLeaseMutationFailure, verifyWorkspaceEditLease } = vi.hoisted(() => ({
  sendWorkspaceLeaseMutationFailure: vi.fn(() => false),
  verifyWorkspaceEditLease: vi.fn(async () => ({ kind: "held" }))
}));

vi.mock("@servicenow/glide", () => ({
  gs: {
    error: vi.fn()
  }
}));

vi.mock("../src/server/pages/serviceNowPageSettings.ts", () => ({
  createServiceNowPageSettingsService
}));

vi.mock("../src/server/api/docsera-runtime-workspace-edit-lease.ts", () => ({
  sendWorkspaceLeaseMutationFailure,
  verifyWorkspaceEditLease
}));

import { process as processDeletePageAction } from "../src/server/api/docsera-runtime-page-delete-action";
import { process as processDeletePageLegacy } from "../src/server/api/docsera-runtime-page-delete";

type ResponseRecorder = {
  body: unknown;
  status?: number;
  setBody: (payload: unknown) => void;
  setStatus: (status: number) => void;
};

function createResponseRecorder(): ResponseRecorder {
  return {
    body: undefined,
    status: undefined,
    setBody(payload: unknown) {
      this.body = payload;
    },
    setStatus(status: number) {
      this.status = status;
    }
  };
}

beforeEach(() => {
  vi.mocked(createServiceNowPageSettingsService).mockReset();
  vi.mocked(sendWorkspaceLeaseMutationFailure).mockReturnValue(false);
  vi.mocked(verifyWorkspaceEditLease).mockResolvedValue({ kind: "held" } as never);
});

describe("page delete action route", () => {
  it("reads identifiers from the POST body and forwards them to the page settings service", async () => {
    const deletePage = vi.fn(async () => ({
      kind: "succeeded" as const,
      deletedPageSysId: "page-001",
      nextPageSysId: "page-002"
    }));
    vi.mocked(createServiceNowPageSettingsService).mockReturnValue({
      deletePage,
      publishPage: vi.fn(),
      savePageSettings: vi.fn()
    } as never);

    const response = createResponseRecorder();

    await processDeletePageAction(
      {
        body: {
          data: {
            workspaceSlug: "product-docs",
            workspaceSysId: "workspace-001",
            pageSysId: "page-001",
            workspaceLeaseToken: "workspace-lease-token",
            lockToken: "ignored-page-token"
          }
        }
      },
      response
    );

    expect(deletePage).toHaveBeenCalledWith({
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001",
      pageSysId: "page-001"
    });
    expect(verifyWorkspaceEditLease).toHaveBeenCalledWith(expect.objectContaining({
      workspaceLeaseToken: "workspace-lease-token",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    }));
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      result: {
        mode: "servicenow",
        deletedPageSysId: "page-001",
        nextPageSysId: "page-002"
      }
    });
  });

  it("rejects missing identifiers safely", async () => {
    vi.mocked(createServiceNowPageSettingsService).mockReturnValue({
      deletePage: vi.fn(async () => ({
        kind: "failed" as const,
        errorMessage: "A workspace reference is required.",
        status: 400 as const
      })),
      publishPage: vi.fn(),
      savePageSettings: vi.fn()
    } as never);

    const response = createResponseRecorder();

    await processDeletePageAction(
      {
        body: {
          data: {
            workspaceSlug: "",
            workspaceSysId: "",
            pageSysId: "",
            workspaceLeaseToken: "workspace-lease-token"
          }
        }
      },
      response
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      error: {
        message: "A workspace reference is required."
      }
    });
  });

  it("returns the workspace lease failure before calling the delete service", async () => {
    const deletePage = vi.fn();
    vi.mocked(createServiceNowPageSettingsService).mockReturnValue({
      deletePage,
      publishPage: vi.fn(),
      savePageSettings: vi.fn()
    } as never);
    vi.mocked(sendWorkspaceLeaseMutationFailure).mockImplementation((_result, response) => {
      response.setStatus?.(409);
      response.setBody({ error: { code: "workspace_lease_lost", message: "Workspace lease lost.", retryable: false } });
      return true;
    });

    const response = createResponseRecorder();
    await processDeletePageAction({ body: { workspaceSlug: "product-docs", workspaceSysId: "workspace-001", pageSysId: "page-001", workspaceLeaseToken: "lost-token" } }, response);

    expect(deletePage).not.toHaveBeenCalled();
    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: { code: "workspace_lease_lost", message: "Workspace lease lost.", retryable: false } });
  });

  it("keeps the legacy DELETE route body-free", async () => {
    const response = createResponseRecorder();

    await processDeletePageLegacy({}, response);

    expect(response.status).toBe(405);
    expect(response.body).toEqual({
      error: {
        message: "Delete page requires the POST /pages/delete action route."
      }
    });
  });
});
