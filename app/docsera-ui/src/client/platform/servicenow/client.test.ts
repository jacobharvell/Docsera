import { afterEach, describe, expect, it, vi } from "vitest";
import { createServiceNowClient } from "./client";
import type { DocseraRuntimeContext } from "../../shared/types/docsera";

function createRuntime(): DocseraRuntimeContext {
  return {
    mountNode: document.createElement("div"),
    mountNodeId: "docsera-root",
    config: {
      backendPingPath: undefined,
      pageCollectionPath: "/api/x_82900_docsera/docsera_runtime/pages",
      workspaceCollectionPath: "/api/x_82900_docsera/docsera_runtime/workspaces",
      workspaceProvisioningStatusPath: "/api/x_82900_docsera/docsera_runtime/workspace-provisioning-status"
    }
  };
}

function createJsonResponse(status: number, body: unknown) {
  return {
    status,
    async text() {
      return JSON.stringify(body);
    }
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("service now client page creation", () => {
  it("normalizes a nested page create response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createJsonResponse(201, {
          result: {
            page: {
              sysId: "page-003",
              workspaceSysId: "workspace-001",
              parentPageSysId: null,
              siblingOrder: 3,
              draftTitle: "Task 33 Page Smoke",
              draftSlug: "task-33-page-smoke",
              draftSlugNormalized: "task-33-page-smoke",
              draftContentJson: {
                type: "doc",
                content: []
              },
              draftBodyText: "",
              publishedTitle: null,
              publishedSlug: null,
              publishedSlugNormalized: null,
              publishedContentJson: null,
              publishedBodyText: null,
              publicationState: "draft",
              active: true
            }
          }
        })
      )
    );

    const client = createServiceNowClient(createRuntime());
    const result = await client.createPage({
      workspaceSlug: "product-docs",
      title: "Task 33 Page Smoke"
    });

    expect(result.state).toBe("succeeded");
    if (result.state === "succeeded") {
      expect(result.page.sysId).toBe("page-003");
      expect(result.page.draftSlug).toBe("task-33-page-smoke");
      expect(result.page.draftTitle).toBe("Task 33 Page Smoke");
    }
  });

  it("normalizes a double-wrapped live page create response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createJsonResponse(201, {
          result: {
            result: {
              page: {
                sysId: "page-004",
                workspaceSysId: "workspace-001",
                parentPageSysId: null,
                siblingOrder: 4,
                draftTitle: "Task 33 Browser Page Smoke",
                draftSlug: "task-33-browser-page-smoke",
                draftSlugNormalized: "task-33-browser-page-smoke",
                draftContentJson: {
                  type: "doc",
                  content: []
                },
                draftBodyText: "",
                publishedTitle: null,
                publishedSlug: null,
                publishedSlugNormalized: null,
                publishedContentJson: null,
                publishedBodyText: null,
                publicationState: "draft",
                active: true
              }
            }
          }
        })
      )
    );

    const client = createServiceNowClient(createRuntime());
    const result = await client.createPage({
      workspaceSlug: "product-docs",
      title: "Task 33 Browser Page Smoke"
    });

    expect(result.state).toBe("succeeded");
    if (result.state === "succeeded") {
      expect(result.page.sysId).toBe("page-004");
      expect(result.page.draftSlug).toBe("task-33-browser-page-smoke");
      expect(result.page.draftSlugNormalized).toBe("task-33-browser-page-smoke");
    }
  });

  it("returns a safe failure message for forbidden page creation", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createJsonResponse(403, {
          error: {
            message: "You do not have permission to create pages in this workspace."
          }
        })
      )
    );

    const client = createServiceNowClient(createRuntime());
    const result = await client.createPage({
      workspaceSlug: "product-docs",
      title: "Task 33 Page Smoke"
    });

    expect(result.state).toBe("failed");
    if (result.state === "failed") {
      expect(result.errorMessage).toBe("You do not have permission to create pages in this workspace.");
    }
  });
});
