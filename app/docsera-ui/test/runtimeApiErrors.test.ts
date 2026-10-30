import { beforeEach, expect, test, vi } from "vitest";

const { gsError } = vi.hoisted(() => ({
  gsError: vi.fn()
}));

const { readWorkspaceMutationAuthority, sendWorkspaceLeaseMutationFailure, verifyWorkspaceEditLease } = vi.hoisted(() => ({
  readWorkspaceMutationAuthority: vi.fn(() => ({
    changeSetId: "change-set-001",
    changeSetRevision: 9
  })),
  sendWorkspaceLeaseMutationFailure: vi.fn(() => false),
  verifyWorkspaceEditLease: vi.fn(async () => ({ kind: "held", changeSetId: "change-set-001", changeSetRevision: 9 }))
}));

vi.mock("@servicenow/glide", () => ({
  GlideRecord: vi.fn(() => ({
    get: vi.fn((_field: string, value: string) => value === "workspace-001"),
    getValue: vi.fn((field: string) => {
      const values: Record<string, string> = {
        sys_id: "workspace-001",
        name: "Product Docs",
        workspace_slug: "product-docs",
        short_description: "Product documentation",
        status: "active",
        icon_type: "builtin",
        icon_value: "docsera-workspace",
        icon_label: "Docsera workspace icon",
        admin_group_sys_id: "group-admin",
        editor_group_sys_id: "group-editor",
        creator_user_sys_id: "user-001",
        layout_toc_visible_by_default: "true",
        layout_page_width: "readable"
      };
      return values[field] ?? "";
    }),
    isValidField: vi.fn(() => true)
  })),
  gs: {
    error: gsError
  }
}));

vi.mock("../src/server/workspaces/serviceNowWorkspaceCatalog.ts", () => ({
  createServiceNowWorkspaceCatalogService: vi.fn()
}));

vi.mock("../src/server/workspaces/serviceNowWorkspaceRecords.ts", () => ({
  mapWorkspaceRecord: vi.fn(() => ({
    sysId: "workspace-001",
    name: "Product Docs",
    slug: "product-docs",
    shortDescription: "Product documentation",
    icon: {
      type: "builtin",
      key: "docsera-workspace",
      label: "Docsera workspace icon"
    },
    status: "active",
    adminGroupSysId: "group-admin",
    editorGroupSysId: "group-editor",
    creatorUserSysId: "user-001",
    layout: {
      tocVisible: true,
      pageWidth: "readable"
    }
  }))
}));

vi.mock("../src/server/pages/serviceNowPageListing.ts", () => ({
  createServiceNowPageListingService: vi.fn()
}));

vi.mock("../src/server/workspaces/serviceNowWorkspaceChangeSetPersistence.ts", () => ({
  createServiceNowWorkspaceChangeSetPersistenceService: vi.fn()
}));

vi.mock("../src/server/pages/serviceNowPagePublishing.ts", () => ({
  createServiceNowPagePublishService: vi.fn()
}));

vi.mock("../src/server/api/docsera-runtime-workspace-edit-lease.ts", () => ({
  readWorkspaceMutationAuthority,
  sendWorkspaceLeaseMutationFailure,
  verifyWorkspaceEditLease
}));

vi.mock("../src/server/workspaces/serviceNowWorkspaceProvisioning.ts", () => ({
  createServiceNowWorkspaceProvisioningService: vi.fn()
}));

vi.mock("../src/server/workspaces/serviceNowWorkspaceSettings.ts", () => ({
  createServiceNowWorkspaceSettingsService: vi.fn()
}));

vi.mock("../src/server/workspaces/serviceNowWorkspaceCapabilities.ts", () => ({
  canCurrentUserCreateWorkspaces: vi.fn(() => true)
}));

import { process as processCreateWorkspace } from "../src/server/api/docsera-runtime-create-workspace";
import { process as processCreatePage } from "../src/server/api/docsera-runtime-create-page";
import { process as processDeletePage } from "../src/server/api/docsera-runtime-page-delete-action";
import { process as processPageSettings } from "../src/server/api/docsera-runtime-page-settings-save";
import { process as processPageSave } from "../src/server/api/docsera-runtime-page-save";
import { process as processWorkspaceSettings } from "../src/server/api/docsera-runtime-workspace-settings-save";
import { process as processPagePublish } from "../src/server/api/docsera-runtime-page-publish";
import { process as processPages } from "../src/server/api/docsera-runtime-pages";
import { process as processWorkspaceProvisioningStatus } from "../src/server/api/docsera-runtime-workspace-provisioning-status";
import { process as processWorkspaces } from "../src/server/api/docsera-runtime-workspaces";
import { createServiceNowWorkspaceCatalogService } from "../src/server/workspaces/serviceNowWorkspaceCatalog.ts";
import { createServiceNowWorkspaceChangeSetPersistenceService } from "../src/server/workspaces/serviceNowWorkspaceChangeSetPersistence.ts";
import { createServiceNowPagePublishService } from "../src/server/pages/serviceNowPagePublishing.ts";
import { createServiceNowPageListingService } from "../src/server/pages/serviceNowPageListing.ts";
import { createServiceNowWorkspaceProvisioningService } from "../src/server/workspaces/serviceNowWorkspaceProvisioning.ts";
import { createServiceNowWorkspaceSettingsService } from "../src/server/workspaces/serviceNowWorkspaceSettings.ts";
import { canCurrentUserCreateWorkspaces } from "../src/server/workspaces/serviceNowWorkspaceCapabilities.ts";

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
  vi.mocked(createServiceNowWorkspaceChangeSetPersistenceService).mockReset();
  vi.mocked(createServiceNowPagePublishService).mockReset();
  vi.mocked(createServiceNowPageListingService).mockReset();
  vi.mocked(createServiceNowWorkspaceProvisioningService).mockReset();
  vi.mocked(createServiceNowWorkspaceSettingsService).mockReset();
  vi.mocked(canCurrentUserCreateWorkspaces).mockReset();
  vi.mocked(canCurrentUserCreateWorkspaces).mockReturnValue(true);
  vi.mocked(readWorkspaceMutationAuthority).mockReturnValue({
    changeSetId: "change-set-001",
    changeSetRevision: 9
  } as never);
  vi.mocked(sendWorkspaceLeaseMutationFailure).mockReturnValue(false);
  vi.mocked(verifyWorkspaceEditLease).mockResolvedValue({ kind: "held", changeSetId: "change-set-001", changeSetRevision: 9 } as never);
});

test("workspaces endpoint hides unexpected internal errors behind a safe message", async () => {
  vi.mocked(createServiceNowWorkspaceCatalogService).mockReturnValue({
    getWorkspace: vi.fn(),
    listWorkspaces: vi.fn().mockRejectedValue(new Error("GlideRecord failed for table x_82900_docsera_docsera_workspace with sys_id=workspace-001"))
  } as never);

  const response = createResponseRecorder();

  await processWorkspaces({ queryString: "q=WORKSPACE-QUERY-MARKER&page=1&pageSize=10&unexpected=UNEXPECTED-QUERY-MARKER" }, response);

  expect(response.status).toBe(500);
  expect(response.body).toEqual({
    error: {
      message: "Unable to load workspaces. Please try again."
    }
  });
  const logEntry = String(gsError.mock.calls[0]?.[0] ?? "");
  expect(logEntry).toContain("GlideRecord failed for table x_82900_docsera_docsera_workspace");
  expect(logEntry).toContain("\"searchTextLength\":22");
  expect(logEntry).not.toContain("WORKSPACE-QUERY-MARKER");
  expect(logEntry).not.toContain("UNEXPECTED-QUERY-MARKER");
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

test("workspaces endpoint exposes the server workspace-creation capability", async () => {
  for (const canCreateWorkspaces of [true, false]) {
    vi.mocked(createServiceNowWorkspaceCatalogService).mockReturnValue({
      getWorkspace: vi.fn(),
      listWorkspaces: vi.fn(async () => ({
        canCreateWorkspaces,
        items: [],
        page: 1,
        pageSize: 10,
        totalCount: 0,
        hasNextPage: false,
        searchText: ""
      }))
    } as never);

    const response = createResponseRecorder();

    await processWorkspaces({ queryString: "page=1&pageSize=10" }, response);

    expect(response.status).toBeUndefined();
    expect(response.body).toEqual({
      result: {
        mode: "servicenow",
        canCreateWorkspaces,
        items: [],
        page: 1,
        pageSize: 10,
        totalCount: 0,
        hasNextPage: false,
        searchText: ""
      }
    });
  }
});

test("page listing failures log bounded query metadata and return a safe user-facing message", async () => {
  vi.mocked(createServiceNowPageListingService).mockReturnValue({
    listPages: vi.fn().mockRejectedValue(new Error("ACL denied on x_82900_docsera_page"))
  } as never);

  const response = createResponseRecorder();

  await processPages({ queryString: "workspaceSlug=QUERY-DATA-MARKER&unexpected=UNEXPECTED-QUERY-MARKER" }, response);

  expect(response.status).toBe(500);
  expect(response.body).toEqual({
    error: {
      message: "Unable to load pages. Please try again."
    }
  });
  const logEntry = String(gsError.mock.calls[0]?.[0] ?? "");
  expect(logEntry).toContain("ACL denied on x_82900_docsera_page");
  expect(logEntry).toContain("\"workspaceSlugLength\":17");
  expect(logEntry).not.toContain("QUERY-DATA-MARKER");
  expect(logEntry).not.toContain("UNEXPECTED-QUERY-MARKER");
});

test("page save failures redact draft body text from unexpected error logging", async () => {
  vi.mocked(createServiceNowWorkspaceChangeSetPersistenceService).mockReturnValue({
    savePageBody: vi.fn().mockRejectedValue(new Error("GlideRecord failed for x_82900_docsera_page"))
  } as never);

  const response = createResponseRecorder();
  const requestBody = {
    workspaceSlug: "product-docs",
    workspaceSysId: "workspace-001",
    pageSysId: "page-001",
    pageSlug: "overview",
    workspaceLeaseToken: "workspace-lease-token",
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
      code: "persistence_invariant",
      retryable: false,
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
  expect(logEntry).not.toContain("workspace-lease-token");
});

test("page create, delete, and settings failures log bounded metadata without lease tokens or authored text", async () => {
  const requestBody = {
    workspaceSlug: "product-docs",
    workspaceSysId: "workspace-001",
    pageSysId: "page-001",
    title: "AUTHORED-PAGE-TEXT-MARKER",
    slug: "page-marker",
    workspaceLeaseToken: "LEASE-TOKEN-MARKER",
    unexpectedField: "UNEXPECTED-FIELD-MARKER"
  };
  const createResponse = createResponseRecorder();
  vi.mocked(createServiceNowWorkspaceChangeSetPersistenceService).mockReturnValue({
    createPage: vi.fn().mockRejectedValue(new Error("create failure"))
  } as never);
  await processCreatePage({ body: { data: requestBody } }, createResponse);

  const deleteResponse = createResponseRecorder();
  vi.mocked(createServiceNowWorkspaceChangeSetPersistenceService).mockReturnValue({
    deletePage: vi.fn().mockRejectedValue(new Error("delete failure"))
  } as never);
  await processDeletePage({ body: { data: requestBody } }, deleteResponse);

  const settingsResponse = createResponseRecorder();
  vi.mocked(createServiceNowWorkspaceChangeSetPersistenceService).mockReturnValue({
    listPages: vi.fn(() => ({ kind: "succeeded", pages: [] })),
    savePageSettings: vi.fn().mockRejectedValue(new Error("settings failure"))
  } as never);
  await processPageSettings({ body: { data: requestBody } }, settingsResponse);

  expect([createResponse.status, deleteResponse.status, settingsResponse.status]).toEqual([500, 500, 500]);
  const logs = gsError.mock.calls.map(([entry]) => String(entry)).join("\n");
  expect(logs).toContain("\"workspaceSysIdLength\":13");
  expect(logs).toContain("\"titleLength\":25");
  expect(logs).not.toContain("LEASE-TOKEN-MARKER");
  expect(logs).not.toContain("AUTHORED-PAGE-TEXT-MARKER");
  expect(logs).not.toContain("UNEXPECTED-FIELD-MARKER");
});

test("page save passes raw draft_content_json through without coercion", async () => {
  const savePageBody = vi.fn(() => ({
    authority: {
      changeSetId: "change-set-002",
      changeSetRevision: 10
    },
    kind: "succeeded",
    result: {
      page: {
        active: true,
        draftBodyText: null,
        draftContentJson: { schemaVersion: 1, document: { type: "doc", content: [] } },
        draftRevision: 1,
        draftSlug: "overview",
        draftSlugNormalized: "overview",
        draftTitle: "Overview",
        parentPageSysId: null,
        publishedBodyText: null,
        publishedContentJson: null,
        publishedSlug: null,
        publishedSlugNormalized: null,
        publishedTitle: null,
        publicationState: "draft",
        siblingOrder: 1,
        sysId: "page-001",
        workspaceSysId: "workspace-001"
      }
    }
  }) as never);

  vi.mocked(createServiceNowWorkspaceChangeSetPersistenceService).mockReturnValue({
    savePageBody
  } as never);

  const response = createResponseRecorder();

  await processPageSave(
    {
      body: {
        data: {
          workspaceSlug: "product-docs",
          workspaceSysId: "workspace-001",
          pageSysId: "page-001",
          pageSlug: "overview",
          draftBodyText: "",
          draftContentJson: "not-json",
          workspaceLeaseToken: "workspace-lease-token",
          expectedChangeSetId: "change-set-001",
          expectedChangeSetRevision: 9
        }
      }
    },
    response
  );

  expect(savePageBody).toHaveBeenCalledWith(
    expect.objectContaining({
      draftContentJson: "not-json"
    })
  );
});

test("page publish failures redact workspace lease tokens from unexpected error logging", async () => {
  const response = createResponseRecorder();

  await processPagePublish(
    {
      body: {
        data: {
          workspaceSlug: "product-docs",
          workspaceSysId: "workspace-001",
          pageSysId: "page-001",
          pageSlug: "overview",
          workspaceLeaseToken: "sensitive-token",
          expectedRevision: 4
        }
      }
    },
    response
  );

  expect(response.status).toBe(405);
  expect(response.body).toEqual({
    error: {
      code: "publish_unavailable",
      retryable: false,
      message: "Workspace publish is not active on this route."
    }
  });
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

test("workspace create and settings failures log only allowlisted diagnostic metadata", async () => {
  const requestBody = {
    workspaceSlug: "product-docs",
    workspaceSysId: "workspace-001",
    name: "AUTHORED-WORKSPACE-NAME-MARKER",
    shortDescription: "AUTHORED-WORKSPACE-DESCRIPTION-MARKER",
    workspaceLeaseToken: "LEASE-TOKEN-MARKER",
    unexpectedField: "UNEXPECTED-FIELD-MARKER"
  };
  vi.mocked(createServiceNowWorkspaceProvisioningService).mockReturnValue({
    createWorkspace: vi.fn().mockRejectedValue(new Error("provision failure")),
    roleNames: { docseraAdmin: "Docsera admin", editor: "Editor", workspaceAdmin: "Workspace admin" },
    statusPathFor: vi.fn()
  } as never);
  const createResponse = createResponseRecorder();
  await processCreateWorkspace({ body: requestBody }, createResponse);

  vi.mocked(createServiceNowWorkspaceSettingsService).mockReturnValue({
    saveWorkspaceSettings: vi.fn().mockRejectedValue(new Error("settings failure"))
  } as never);
  const settingsResponse = createResponseRecorder();
  await processWorkspaceSettings({ body: requestBody }, settingsResponse);

  expect([createResponse.status, settingsResponse.status]).toEqual([500, 500]);
  const logs = gsError.mock.calls.map(([entry]) => String(entry)).join("\n");
  expect(logs).toContain("\"nameLength\":30");
  expect(logs).toContain("\"shortDescriptionLength\":37");
  expect(logs).not.toContain("LEASE-TOKEN-MARKER");
  expect(logs).not.toContain("AUTHORED-WORKSPACE-NAME-MARKER");
  expect(logs).not.toContain("AUTHORED-WORKSPACE-DESCRIPTION-MARKER");
  expect(logs).not.toContain("UNEXPECTED-FIELD-MARKER");
});

test("create workspace rejects unsupported built-in workspace icons before provisioning", async () => {
  const createWorkspace = vi.fn();
  vi.mocked(createServiceNowWorkspaceProvisioningService).mockReturnValue({
    createWorkspace,
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
        name: "Forged workspace",
        shortDescription: "Test",
        icon: {
          type: "builtin",
          key: "forged-workspace-icon",
          label: "Forged"
        }
      }
    },
    response
  );

  expect(response.status).toBe(400);
  expect(response.body).toEqual({
    error: {
      code: "workspace_create_invalid",
      message: "Unsupported built-in workspace icon."
    }
  });
  expect(createWorkspace).not.toHaveBeenCalled();
});

test("create workspace rejects unauthorized requests before provisioning", async () => {
  vi.mocked(canCurrentUserCreateWorkspaces).mockReturnValue(false);
  const createWorkspace = vi.fn();
  vi.mocked(createServiceNowWorkspaceProvisioningService).mockReturnValue({
    createWorkspace,
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
        name: "Forbidden workspace",
        shortDescription: "Test"
      }
    },
    response
  );

  expect(response.status).toBe(403);
  expect(response.body).toEqual({
    error: {
      code: "workspace_create_forbidden",
      message: "You do not have permission to create workspaces."
    }
  });
  expect(createServiceNowWorkspaceProvisioningService).not.toHaveBeenCalled();
  expect(createWorkspace).not.toHaveBeenCalled();
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

test("workspace provisioning status allows an authorized caller to poll a known request", async () => {
  const getProvisioningStatus = vi.fn().mockResolvedValue({
    kind: "pending",
    requestId: "known-request-001",
    state: "processing"
  });
  vi.mocked(createServiceNowWorkspaceProvisioningService).mockReturnValue({
    getProvisioningStatus,
    roleNames: {
      docseraAdmin: "Docsera admin",
      editor: "Editor",
      workspaceAdmin: "Workspace admin"
    },
    statusPathFor: vi.fn((requestId: string) => `/status?requestId=${requestId}`)
  } as never);

  const response = createResponseRecorder();

  await processWorkspaceProvisioningStatus({ queryString: "requestId=known-request-001" }, response);

  expect(response.status).toBeUndefined();
  expect(getProvisioningStatus).toHaveBeenCalledWith("known-request-001");
  expect(response.body).toEqual({
    result: {
      mode: "servicenow",
      provisioning: {
        pollAfterMs: 1000,
        requestId: "known-request-001",
        state: "processing",
        statusPath: "/status?requestId=known-request-001"
      },
      roleNames: {
        docseraAdmin: "Docsera admin",
        editor: "Editor",
        workspaceAdmin: "Workspace admin"
      }
    }
  });
});

test("workspace provisioning status rejects an unauthorized caller before looking up a known request", async () => {
  vi.mocked(canCurrentUserCreateWorkspaces).mockReturnValue(false);
  const getProvisioningStatus = vi.fn();
  vi.mocked(createServiceNowWorkspaceProvisioningService).mockReturnValue({
    getProvisioningStatus,
    roleNames: {
      docseraAdmin: "Docsera admin",
      editor: "Editor",
      workspaceAdmin: "Workspace admin"
    },
    statusPathFor: vi.fn()
  } as never);

  const response = createResponseRecorder();

  await processWorkspaceProvisioningStatus({ queryString: "requestId=known-request-001" }, response);

  expect(response.status).toBe(403);
  expect(response.body).toEqual({
    error: {
      code: "workspace_provisioning_status_forbidden",
      message: "You do not have permission to check workspace provisioning status."
    }
  });
  expect(createServiceNowWorkspaceProvisioningService).not.toHaveBeenCalled();
  expect(getProvisioningStatus).not.toHaveBeenCalled();
});
