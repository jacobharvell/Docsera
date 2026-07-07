import { beforeEach, expect, test, vi } from "vitest";

const { gsError } = vi.hoisted(() => ({
  gsError: vi.fn()
}));

vi.mock("@servicenow/glide", () => ({
  gs: {
    error: gsError
  }
}));

vi.mock("../src/server/workspaces/serviceNowWorkspaceCatalog.ts", () => ({
  createServiceNowWorkspaceCatalogService: vi.fn()
}));

vi.mock("../src/server/pages/serviceNowPageListing.ts", () => ({
  createServiceNowPageListingService: vi.fn()
}));

vi.mock("../src/server/pages/serviceNowPageDraftPersistence.ts", () => ({
  createServiceNowPageBodySaveService: vi.fn()
}));

vi.mock("../src/server/workspaces/serviceNowWorkspaceProvisioning.ts", () => ({
  createServiceNowWorkspaceProvisioningService: vi.fn()
}));

import { process as processCreateWorkspace } from "../src/server/api/docsera-runtime-create-workspace";
import { process as processPageSave } from "../src/server/api/docsera-runtime-page-save";
import { process as processPages } from "../src/server/api/docsera-runtime-pages";
import { process as processWorkspaceProvisioningStatus } from "../src/server/api/docsera-runtime-workspace-provisioning-status";
import { process as processWorkspaces } from "../src/server/api/docsera-runtime-workspaces";
import { createServiceNowWorkspaceCatalogService } from "../src/server/workspaces/serviceNowWorkspaceCatalog.ts";
import { createServiceNowPageBodySaveService } from "../src/server/pages/serviceNowPageDraftPersistence.ts";
import { createServiceNowPageListingService } from "../src/server/pages/serviceNowPageListing.ts";
import { createServiceNowWorkspaceProvisioningService } from "../src/server/workspaces/serviceNowWorkspaceProvisioning.ts";

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
  gsError.mockClear();
  vi.mocked(createServiceNowWorkspaceCatalogService).mockReset();
  vi.mocked(createServiceNowPageBodySaveService).mockReset();
  vi.mocked(createServiceNowPageListingService).mockReset();
  vi.mocked(createServiceNowWorkspaceProvisioningService).mockReset();
});

test("workspaces endpoint hides unexpected internal errors behind a safe message", async () => {
  vi.mocked(createServiceNowWorkspaceCatalogService).mockReturnValue({
    getWorkspace: vi.fn(),
    listWorkspaces: vi.fn().mockRejectedValue(new Error("GlideRecord failed for table x_82900_docsera_docsera_workspace with sys_id=workspace-001"))
  } as never);

  const response = createResponseRecorder();

  await processWorkspaces({ queryString: "page=1&pageSize=10" }, response);

  expect(response.status).toBe(500);
  expect(response.body).toEqual({
    error: {
      message: "Unable to load workspaces. Please try again."
    }
  });
  expect(String(gsError.mock.calls[0]?.[0] ?? "")).toContain("GlideRecord failed for table x_82900_docsera_docsera_workspace");
});

test("workspace lookup failures still return a safe user-facing message", async () => {
  vi.mocked(createServiceNowWorkspaceCatalogService).mockReturnValue({
    getWorkspace: vi.fn().mockRejectedValue(new Error("ACL denied on x_82900_docsera_docsera_workspace")),
    listWorkspaces: vi.fn()
  } as never);

  const response = createResponseRecorder();

  await processWorkspaces({ queryString: "workspaceSlug=workspace-001" }, response);

  expect(response.status).toBe(500);
  expect(response.body).toEqual({
    error: {
      message: "Unable to load workspaces. Please try again."
    }
  });
  expect(String(gsError.mock.calls[0]?.[0] ?? "")).toContain("ACL denied on x_82900_docsera_docsera_workspace");
});

test("page listing failures still return a safe user-facing message", async () => {
  vi.mocked(createServiceNowPageListingService).mockReturnValue({
    listPages: vi.fn().mockRejectedValue(new Error("ACL denied on x_82900_docsera_page"))
  } as never);

  const response = createResponseRecorder();

  await processPages({ queryString: "workspaceSlug=workspace-001" }, response);

  expect(response.status).toBe(500);
  expect(response.body).toEqual({
    error: {
      message: "Unable to load pages. Please try again."
    }
  });
  expect(String(gsError.mock.calls[0]?.[0] ?? "")).toContain("ACL denied on x_82900_docsera_page");
});

test("page save failures redact draft body text from unexpected error logging", async () => {
  vi.mocked(createServiceNowPageBodySaveService).mockReturnValue({
    savePageBody: vi.fn().mockRejectedValue(new Error("GlideRecord failed for x_82900_docsera_page"))
  } as never);

  const response = createResponseRecorder();
  const requestBody = {
    workspaceSlug: "product-docs",
    workspaceSysId: "workspace-001",
    pageSysId: "page-001",
    pageSlug: "overview",
    draftBodyText: "Sensitive draft body text",
    draft_content_json: {
      type: "doc",
      content: []
    }
  };

  await processPageSave(
    {
      body: {
        data: requestBody
      }
    },
    response
  );

  expect(response.status).toBe(500);
  expect(response.body).toEqual({
    error: {
      message: "Something went wrong while saving the page body. Please try again."
    }
  });

  const logEntry = String(gsError.mock.calls[0]?.[0] ?? "");
  expect(logEntry).toContain("workspace-001");
  expect(logEntry).toContain("page-001");
  expect(logEntry).toContain("\"draftBodyTextPresent\":true");
  expect(logEntry).toContain("\"draftBodyTextLength\":25");
  expect(logEntry).not.toContain("Sensitive draft body text");
  expect(logEntry).not.toContain("draft_content_json");
});

test("create workspace hides unexpected errors behind a safe message", async () => {
  vi.mocked(createServiceNowWorkspaceProvisioningService).mockReturnValue({
    createWorkspace: vi.fn().mockRejectedValue(new Error("Insert failed: x_82900_docsera_docsera_workspace_provision_request")),
    roleNames: {
      docseraAdmin: "Docsera admin",
      editor: "Editor",
      workspaceAdmin: "Workspace admin"
    },
    statusPathFor: vi.fn()
  } as never);

  const response = createResponseRecorder();

  await processCreateWorkspace(
    {
      body: {
        name: "Broken workspace",
        shortDescription: "Test"
      }
    },
    response
  );

  expect(response.status).toBe(500);
  expect(response.body).toEqual({
    error: {
      message: "Something went wrong while creating the workspace. The workspace was not created. Please try again."
    }
  });
  expect(String(gsError.mock.calls[0]?.[0] ?? "")).toContain("Insert failed: x_82900_docsera_docsera_workspace_provision_request");
});

test("workspace provisioning status hides unexpected errors behind a safe message", async () => {
  vi.mocked(createServiceNowWorkspaceProvisioningService).mockReturnValue({
    getProvisioningStatus: vi.fn().mockRejectedValue(new Error("Table x_82900_docsera_docsera_workspace_provision_request not found")),
    roleNames: {
      docseraAdmin: "Docsera admin",
      editor: "Editor",
      workspaceAdmin: "Workspace admin"
    },
    statusPathFor: vi.fn()
  } as never);

  const response = createResponseRecorder();

  await processWorkspaceProvisioningStatus({ queryString: "requestId=request-001" }, response);

  expect(response.status).toBe(500);
  expect(response.body).toEqual({
    error: {
      message: "Workspace provisioning status could not be checked. Please try again."
    }
  });
  expect(String(gsError.mock.calls[0]?.[0] ?? "")).toContain("Table x_82900_docsera_docsera_workspace_provision_request not found");
});
