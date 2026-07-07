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
  it("normalizes a nested live page list response", async () => {
    const fetchMock = vi.fn(async (path: RequestInfo | URL) => {
      expect(String(path)).toContain("/api/x_82900_docsera/docsera_runtime/pages?workspaceSlug=product-docs");
      return createJsonResponse(200, {
        result: {
          items: [
            {
              sysId: "page-001",
              workspaceSysId: "workspace-001",
              parentPageSysId: null,
              siblingOrder: 1,
              draftTitle: "Overview",
              draftSlug: "overview",
              draftSlugNormalized: "overview",
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
          ],
          workspaceSlug: "product-docs",
          workspaceSysId: "workspace-001",
          totalCount: 1
        }
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createServiceNowClient(createRuntime());
    const result = await client.listPages({
      workspaceSlug: "product-docs"
    });

    expect(result.workspaceSlug).toBe("product-docs");
    expect(result.workspaceSysId).toBe("workspace-001");
    expect(result.totalCount).toBe(1);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.draftSlug).toBe("overview");
  });

  it("normalizes a double-wrapped live page list response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createJsonResponse(200, {
          result: {
            result: {
              items: [
                {
                  sysId: "page-002",
                  workspaceSysId: "workspace-001",
                  parentPageSysId: null,
                  siblingOrder: 2,
                  draftTitle: "Launch Notes",
                  draftSlug: "launch-notes",
                  draftSlugNormalized: "launch-notes",
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
              ],
              workspaceSlug: "product-docs",
              workspaceSysId: "workspace-001",
              totalCount: 1
            }
          }
        })
      )
    );

    const client = createServiceNowClient(createRuntime());
    const result = await client.listPages({
      workspaceSlug: "product-docs"
    });

    expect(result.items[0]?.draftSlugNormalized).toBe("launch-notes");
  });

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

  it("normalizes a nested page body save response", async () => {
    const fetchMock = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
      expect(String(path)).toContain("/api/x_82900_docsera/docsera_runtime/pages");
      expect(init?.method).toBe("PATCH");
      expect(JSON.parse(String(init?.body))).toEqual({
        workspaceSlug: "product-docs",
        workspaceSysId: "",
        pageSysId: "page-005",
        pageSlug: "",
        draftBodyText: "Saved draft body"
      });

      return createJsonResponse(200, {
        result: {
          page: {
            sysId: "page-005",
            workspaceSysId: "workspace-001",
            parentPageSysId: null,
            siblingOrder: 5,
            draftTitle: "Draft Body Page",
            draftSlug: "draft-body-page",
            draftSlugNormalized: "draft-body-page",
            draftContentJson: {
              type: "doc",
              content: [
                {
                  type: "paragraph",
                  content: [
                    {
                      type: "text",
                      text: "Saved draft body"
                    }
                  ]
                }
              ]
            },
            draftBodyText: "Saved draft body",
            publishedTitle: null,
            publishedSlug: null,
            publishedSlugNormalized: null,
            publishedContentJson: null,
            publishedBodyText: null,
            publicationState: "draft",
            active: true
          }
        }
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createServiceNowClient(createRuntime());
    const result = await client.savePageBody({
      workspaceSlug: "product-docs",
      pageSysId: "page-005",
      draftBodyText: "Saved draft body"
    });

    expect(result.state).toBe("succeeded");
    if (result.state === "succeeded") {
      expect(result.page.sysId).toBe("page-005");
      expect(result.page.draftBodyText).toBe("Saved draft body");
    }
  });

  it("normalizes a double-wrapped page body save response", async () => {
    const fetchMock = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
      expect(String(path)).toContain("/api/x_82900_docsera/docsera_runtime/pages");
      expect(init?.method).toBe("PATCH");
      expect(JSON.parse(String(init?.body))).toEqual({
        workspaceSlug: "",
        workspaceSysId: "workspace-001",
        pageSysId: "",
        pageSlug: "draft-body-page",
        draftBodyText: "Saved draft body"
      });

      return createJsonResponse(200, {
        result: {
          result: {
            page: {
              sysId: "page-006",
              workspaceSysId: "workspace-001",
              parentPageSysId: null,
              siblingOrder: 6,
              draftTitle: "Draft Body Page",
              draftSlug: "draft-body-page",
              draftSlugNormalized: "draft-body-page",
              draftContentJson: {
                type: "doc",
                content: [
                  {
                    type: "paragraph",
                    content: [
                      {
                        type: "text",
                        text: "Saved draft body"
                      }
                    ]
                  }
                ]
              },
              draftBodyText: "Saved draft body",
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
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createServiceNowClient(createRuntime());
    const result = await client.savePageBody({
      workspaceSysId: "workspace-001",
      pageSlug: "draft-body-page",
      draftBodyText: "Saved draft body"
    });

    expect(result.state).toBe("succeeded");
    if (result.state === "succeeded") {
      expect(result.page.draftSlugNormalized).toBe("draft-body-page");
    }
  });

  it("returns a safe failure message for forbidden page body saves", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createJsonResponse(403, {
          error: {
            message: "You do not have permission to edit page bodies in this workspace."
          }
        })
      )
    );

    const client = createServiceNowClient(createRuntime());
    const result = await client.savePageBody({
      workspaceSlug: "product-docs",
      pageSysId: "page-005",
      draftBodyText: "Saved draft body"
    });

    expect(result.state).toBe("failed");
    if (result.state === "failed") {
      expect(result.errorMessage).toBe("You do not have permission to edit page bodies in this workspace.");
    }
  });

  it("returns a safe server message for unexpected page body save failures", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createJsonResponse(500, {
          error: {
            message: "Something went wrong while saving the page body. Please try again."
          }
        })
      )
    );

    const client = createServiceNowClient(createRuntime());
    const result = await client.savePageBody({
      workspaceSlug: "product-docs",
      pageSysId: "page-005",
      draftBodyText: "Saved draft body"
    });

    expect(result.state).toBe("failed");
    if (result.state === "failed") {
      expect(result.errorMessage).toBe("Something went wrong while saving the page body. Please try again.");
    }
  });
});
