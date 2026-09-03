import { afterEach, describe, expect, it, vi } from "vitest";
import { createServiceNowClient } from "./client";
import type { DocseraRuntimeContext } from "../../shared/types/docsera";

const workspaceAuthority = {
  changeSetId: "change-set-001",
  changeSetRevision: 9
} as const;

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

function createBinaryResponse(status: number, blob: Blob) {
  return {
    status,
    async blob() {
      return blob;
    }
  };
}

describe("service now client workspace media", () => {
  it("lists workspace media and normalizes the returned descriptors", async () => {
    const fetchMock = vi.fn(async (path: RequestInfo | URL) => {
      expect(String(path)).toContain("/api/x_82900_docsera/docsera_runtime/workspaces/media?workspaceSysId=workspace-001");
      return createJsonResponse(200, {
        result: {
          items: [
            {
              contentType: "image/png",
              createdOn: "2026-08-19T10:00:00.000Z",
              fileName: "diagram.png",
              mediaId: "media-001",
              sizeBytes: 2048,
              updatedOn: "2026-08-19T10:15:00.000Z"
            }
          ]
        }
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await createServiceNowClient(createRuntime()).listWorkspaceMedia!({
      workspaceSysId: "workspace-001"
    });

    expect(result).toEqual({
      state: "succeeded",
      items: [
        {
          contentType: "image/png",
          createdOn: "2026-08-19T10:00:00.000Z",
          fileName: "diagram.png",
          mediaId: "media-001",
          sizeBytes: 2048,
          updatedOn: "2026-08-19T10:15:00.000Z"
        }
      ]
    });
  });

  it("uploads workspace media with the selected file body and lease token header", async () => {
    const file = new File(["image-data"], "diagram.png", { type: "image/png" });
    const fetchMock = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
      expect(String(path)).toContain(
        "/api/x_82900_docsera/docsera_runtime/workspaces/media?workspaceSysId=workspace-001&fileName=diagram.png"
      );
      expect(init?.method).toBe("POST");
      expect(init?.body).toBe(file);
      expect((init?.headers as HeadersInit | undefined) ?? {}).toMatchObject({
        "Content-Type": "image/png",
        "X-Docsera-Workspace-Lease-Token": "workspace-lease-token"
      });
      return createJsonResponse(201, {
        result: {
          media: {
            contentType: "image/png",
            createdOn: "2026-08-19T10:00:00.000Z",
            fileName: "diagram.png",
            mediaId: "media-001",
            sizeBytes: 2048,
            updatedOn: "2026-08-19T10:15:00.000Z"
          }
        }
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await createServiceNowClient(createRuntime()).uploadWorkspaceMedia!({
      file,
      workspaceLeaseToken: "workspace-lease-token",
      workspaceSysId: "workspace-001"
    });

    expect(result).toEqual({
      state: "succeeded",
      media: {
        contentType: "image/png",
        createdOn: "2026-08-19T10:00:00.000Z",
        fileName: "diagram.png",
        mediaId: "media-001",
        sizeBytes: 2048,
        updatedOn: "2026-08-19T10:15:00.000Z"
      }
    });
  });

  it("loads workspace media as a binary blob through the authenticated media boundary", async () => {
    (window as Window & { g_ck?: string }).g_ck = "user-token-001";
    const signal = new AbortController().signal;
    const blob = new Blob(["binary-image"], { type: "image/png" });
    const fetchMock = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
      expect(String(path)).toContain(
        "/api/x_82900_docsera/docsera_runtime/workspaces/media/file?workspaceSysId=workspace-001&mediaId=media-001"
      );
      expect(init?.credentials).toBe("same-origin");
      expect(init?.signal).toBe(signal);
      expect((init?.headers as HeadersInit | undefined) ?? {}).toMatchObject({
        Accept: "image/*",
        "X-UserToken": "user-token-001"
      });
      return createBinaryResponse(200, blob);
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await createServiceNowClient(createRuntime()).loadWorkspaceMedia!({
      mediaId: "media-001",
      signal,
      workspaceSysId: "workspace-001"
    });

    expect(result).toBe(blob);
  });

  it("loads workspace icons as binary blobs through the authenticated uploaded-icon boundary", async () => {
    (window as Window & { g_ck?: string }).g_ck = "user-token-001";
    const signal = new AbortController().signal;
    const blob = new Blob(["icon-image"], { type: "image/png" });
    const fetchMock = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
      expect(path).toBe("/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=asset-key-001");
      expect(init?.credentials).toBe("same-origin");
      expect(init?.signal).toBe(signal);
      expect((init?.headers as HeadersInit | undefined) ?? {}).toMatchObject({
        Accept: "image/*",
        "X-UserToken": "user-token-001"
      });
      return createBinaryResponse(200, blob);
    });

    vi.stubGlobal("fetch", fetchMock);

    const result = await createServiceNowClient(createRuntime()).loadWorkspaceIcon!({
      assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=asset-key-001",
      signal
    });

    expect(result).toBe(blob);
  });

  it("returns a safe null failure for unavailable workspace icon responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => createBinaryResponse(404, new Blob())));

    const result = await createServiceNowClient(createRuntime()).loadWorkspaceIcon!({
      assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=asset-key-001"
    });

    expect(result).toBeNull();
  });

  it("returns a safe null failure for unavailable workspace media responses", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => createBinaryResponse(404, new Blob())));

    const result = await createServiceNowClient(createRuntime()).loadWorkspaceMedia!({
      mediaId: "media-001",
      workspaceSysId: "workspace-001"
    });

    expect(result).toBeNull();
  });
});

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

  it("posts page moves with workspace authority and normalizes the refreshed Edit projection", async () => {
    const fetchMock = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
      expect(String(path)).toBe("/api/x_82900_docsera/docsera_runtime/pages/move");
      expect(JSON.parse(String(init?.body))).toEqual({
        expectedChangeSetId: "change-set-001",
        expectedChangeSetRevision: 9,
        pageSysId: "page-002",
        parentPageSysId: null,
        siblingOrder: "0",
        workspaceLeaseToken: "workspace-lease-token",
        workspaceSlug: "product-docs",
        workspaceSysId: "workspace-001"
      });
      return createJsonResponse(200, {
        result: {
          changeSetId: "change-set-001",
          changeSetRevision: 10,
          pages: [{
            sysId: "page-002",
            workspaceSysId: "workspace-001",
            parentPageSysId: null,
            siblingOrder: "0",
            draftTitle: "Moved",
            draftSlug: "moved",
            draftSlugNormalized: "moved",
            draftContentJson: { type: "doc", content: [] },
            draftBodyText: "",
            publishedTitle: "Moved",
            publishedSlug: "moved",
            publishedSlugNormalized: "moved",
            publishedContentJson: { type: "doc", content: [] },
            publishedBodyText: "",
            publicationState: "published_with_unpublished_changes",
            active: true
          }]
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createServiceNowClient(createRuntime()).movePage!({
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001",
      workspaceLeaseToken: "workspace-lease-token",
      workspaceAuthority,
      pageSysId: "page-002",
      parentPageSysId: null,
      siblingOrder: 0
    });

    expect(result.state).toBe("succeeded");
    if (result.state === "succeeded") {
      expect(result.changeSetRevision).toBe(10);
      expect(result.pages[0]?.parentPageSysId).toBe(null);
      expect(result.pages[0]?.siblingOrder).toBe(0);
    }
  });

  it("posts workspace publish commands with exact authority and normalizes successor state", async () => {
    const fetchMock = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
      expect(String(path)).toBe("/api/x_82900_docsera/docsera_runtime/workspaces/publish");
      expect(JSON.parse(String(init?.body))).toEqual({
        commandId: "publish-001",
        expectedChangeSetId: "change-set-001",
        expectedChangeSetRevision: 9,
        workspaceLeaseToken: "workspace-lease-token",
        workspaceSlug: "product-docs",
        workspaceSysId: "workspace-001"
      });
      return createJsonResponse(200, {
        result: {
          changeSetId: "change-set-successor",
          changeSetRevision: 0,
          workspaceStateRevision: 5,
          publishedSnapshotSetId: "snapshot-published",
          pendingChanges: {
            affectedPageCount: 0,
            changeSetId: "change-set-successor",
            changeSetRevision: 0,
            rows: [],
            workspaceSysId: "workspace-001"
          },
          pages: [{
            sysId: "page-001",
            workspaceSysId: "workspace-001",
            parentPageSysId: null,
            siblingOrder: "1",
            draftTitle: "Published Overview",
            draftSlug: "published-overview",
            draftSlugNormalized: "published-overview",
            draftContentJson: { type: "doc", content: [] },
            draftBodyText: "",
            publishedTitle: "Published Overview",
            publishedSlug: "published-overview",
            publishedSlugNormalized: "published-overview",
            publishedContentJson: { type: "doc", content: [] },
            publishedBodyText: "",
            publicationState: "published",
            active: true
          }]
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createServiceNowClient(createRuntime()).publishWorkspace!({
      commandId: "publish-001",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001",
      workspaceLeaseToken: "workspace-lease-token",
      workspaceAuthority
    });

    expect(result.state).toBe("succeeded");
    if (result.state === "succeeded") {
      expect(result.changeSetId).toBe("change-set-successor");
      expect(result.changeSetRevision).toBe(0);
      expect(result.workspaceStateRevision).toBe(5);
      expect(result.pendingChanges.affectedPageCount).toBe(0);
      expect(result.pages[0]?.draftTitle).toBe("Published Overview");
    }
  });

  it("posts workspace discard-all commands with exact authority and normalizes restored state", async () => {
    const workspaceAuthority = {
      changeSetId: "change-set-001",
      changeSetRevision: 9
    };
    const fetchMock = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
      expect(String(path)).toContain("/api/x_82900_docsera/docsera_runtime/workspaces/discard-all");
      expect(JSON.parse(String(init?.body))).toEqual({
        commandId: "discard-001",
        expectedChangeSetId: "change-set-001",
        expectedChangeSetRevision: 9,
        workspaceLeaseToken: "workspace-lease-token",
        workspaceSlug: "product-docs",
        workspaceSysId: "workspace-001"
      });
      return createJsonResponse(200, {
        result: {
          changeSetId: "change-set-successor",
          changeSetRevision: 0,
          workspaceStateRevision: 5,
          pendingChanges: {
            affectedPageCount: 0,
            changeSetId: "change-set-successor",
            changeSetRevision: 0,
            rows: [],
            workspaceSysId: "workspace-001"
          },
          pages: [{
            sysId: "page-001",
            workspaceSysId: "workspace-001",
            parentPageSysId: null,
            siblingOrder: "1",
            draftTitle: "Published Overview",
            draftSlug: "published-overview",
            draftSlugNormalized: "published-overview",
            draftContentJson: { type: "doc", content: [] },
            draftBodyText: "",
            publishedTitle: "Published Overview",
            publishedSlug: "published-overview",
            publishedSlugNormalized: "published-overview",
            publishedContentJson: { type: "doc", content: [] },
            publishedBodyText: "",
            publicationState: "published",
            active: true
          }]
        }
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createServiceNowClient(createRuntime()).discardAllWorkspace!({
      commandId: "discard-001",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001",
      workspaceLeaseToken: "workspace-lease-token",
      workspaceAuthority
    });

    expect(result.state).toBe("succeeded");
    if (result.state === "succeeded") {
      expect(result.changeSetId).toBe("change-set-successor");
      expect(result.changeSetRevision).toBe(0);
      expect(result.workspaceStateRevision).toBe(5);
      expect(result.pendingChanges.affectedPageCount).toBe(0);
      expect(result.pages[0]?.draftTitle).toBe("Published Overview");
    }
  });

  it("normalizes recovery-required discard-all failures with successor authority and the persisted recovery command", async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse(409, {
        error: {
          affectedPageCount: 4,
          code: "recovery_required",
          currentChangeSetId: "change-set-successor",
          currentChangeSetRevision: 0,
          message: "Discard recovery is incomplete.",
          recoveryCommandId: "discard-001"
        }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await createServiceNowClient(createRuntime()).discardAllWorkspace!({
      commandId: "discard-001",
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001",
      workspaceLeaseToken: "workspace-lease-token",
      workspaceAuthority
    });

    expect(result.state).toBe("failed");
    if (result.state === "failed") {
      expect(result.affectedPageCount).toBe(4);
      expect(result.code).toBe("recovery_required");
      expect(result.currentChangeSetId).toBe("change-set-successor");
      expect(result.currentChangeSetRevision).toBe(0);
      expect(result.recoveryCommandId).toBe("discard-001");
      expect(result.retryable).toBe(true);
      expect(result.errorMessage).toBe("Discard recovery is incomplete.");
    }
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
    const fetchMock = vi.fn(async (_path: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body))).toEqual({
        title: "Task 33 Page Smoke",
        expectedChangeSetId: "change-set-001",
        expectedChangeSetRevision: 9,
        workspaceLeaseToken: "workspace-lease-token",
        workspaceSlug: "product-docs"
      });
      expect(JSON.parse(String(init?.body))).not.toHaveProperty("lockToken");
      return createJsonResponse(201, {
          result: {
            changeSetId: "change-set-002",
            changeSetRevision: 10,
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
        });
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createServiceNowClient(createRuntime());
    const result = await client.createPage({
      workspaceSlug: "product-docs",
      workspaceAuthority,
      workspaceLeaseToken: "workspace-lease-token",
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
              changeSetId: "change-set-002",
              changeSetRevision: 10,
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
      workspaceAuthority,
      workspaceLeaseToken: "workspace-lease-token",
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
      workspaceAuthority,
      workspaceLeaseToken: "workspace-lease-token",
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
        draftBodyText: "Saved draft body",
        expectedRevision: 7,
        expectedChangeSetId: "change-set-001",
        expectedChangeSetRevision: 9,
        workspaceLeaseToken: "workspace-lease-token"
      });

      return createJsonResponse(200, {
        result: {
          changeSetId: "change-set-002",
          changeSetRevision: 10,
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
            draftRevision: 8,
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
      draftBodyText: "Saved draft body",
      expectedRevision: 7,
      workspaceAuthority,
      workspaceLeaseToken: "workspace-lease-token"
    });

    expect(result.state).toBe("succeeded");
    if (result.state === "succeeded") {
      expect(result.page.sysId).toBe("page-005");
      expect(result.page.draftBodyText).toBe("Saved draft body");
      expect(result.page.draftRevision).toBe(8);
    }
  });

  it("returns a safe conflict result for a stale draft revision", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createJsonResponse(409, {
          error: {
            code: "draft_revision_conflict",
            message: "This page has a newer saved draft. Reload before saving again.",
            currentRevision: 9
          }
        })
      )
    );

    const client = createServiceNowClient(createRuntime());
    const result = await client.savePageBody({
      workspaceSlug: "product-docs",
      pageSysId: "page-005",
      draftBodyText: "Stale draft body",
      expectedRevision: 8,
      workspaceAuthority,
      workspaceLeaseToken: "workspace-lease-token"
    });

    expect(result).toEqual({
      code: "conflict",
      currentRevision: 9,
      retryable: false,
      state: "failed",
      errorMessage: "This page has a newer saved draft. Reload before saving again."
    });
  });

  it("normalizes a page publish response and preserves published metadata", async () => {
    const fetchMock = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
      expect(String(path)).toContain("/api/x_82900_docsera/docsera_runtime/pages/publish");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        workspaceSlug: "product-docs",
        workspaceSysId: "",
        pageSysId: "page-005",
        pageSlug: "",
        workspaceLeaseToken: "workspace-lease-token",
        expectedRevision: 8
      });

      return createJsonResponse(200, {
        result: {
          page: {
            sysId: "page-005",
            workspaceSysId: "workspace-001",
            parentPageSysId: null,
            siblingOrder: 5,
            draftTitle: "Published title",
            draftSlug: "published-title",
            draftSlugNormalized: "published-title",
            draftContentJson: {
              type: "doc",
              content: []
            },
            draftBodyText: "Published body",
            draftRevision: 8,
            publishedTitle: "Published title",
            publishedSlug: "published-title",
            publishedSlugNormalized: "published-title",
            publishedContentJson: {
              type: "doc",
              content: []
            },
            publishedBodyText: "Published body",
            publishedAt: "2026-07-15 09:30:00",
            publishedBySysId: "user-123",
            publishedByDisplayName: "Priya Writer",
            publicationState: "published",
            active: true
          }
        }
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createServiceNowClient(createRuntime());
    const result = await client.publishPage({
      workspaceSlug: "product-docs",
      pageSysId: "page-005",
      workspaceLeaseToken: "workspace-lease-token",
      expectedRevision: 8
    });

    expect(result.state).toBe("succeeded");
    if (result.state === "succeeded") {
      expect(result.page.publicationState).toBe("published");
      expect(result.page.publishedAt).toBe("2026-07-15 09:30:00");
      expect(result.page.publishedBySysId).toBe("user-123");
      expect(result.page.publishedByDisplayName).toBe("Priya Writer");
    }
  });

  it("maps publish stale revision and workspace lease loss to the dedicated failure codes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createJsonResponse(409, {
          error: {
            code: "draft_revision_conflict",
            message: "This page has a newer saved draft. Reload before publishing again.",
            currentRevision: 9
          }
        })
      )
    );

    const client = createServiceNowClient(createRuntime());
    const staleResult = await client.publishPage({
      workspaceSlug: "product-docs",
      pageSysId: "page-005",
      workspaceLeaseToken: "workspace-lease-token",
      expectedRevision: 8
    });

    expect(staleResult).toEqual({
      code: "conflict",
      currentRevision: 9,
      retryable: false,
      state: "failed",
      errorMessage: "This page has a newer saved draft. Reload before publishing again."
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createJsonResponse(409, {
          error: {
            code: "workspace_lease_lost",
            message: "This edit session ended and unsaved changes were not published."
          }
        })
      )
    );

    const leaseLostResult = await client.publishPage({
      workspaceSlug: "product-docs",
      pageSysId: "page-005",
      workspaceLeaseToken: "workspace-lease-token",
      expectedRevision: 8
    });

    expect(leaseLostResult).toEqual({
      code: "lock_lost",
      retryable: false,
      state: "failed",
      errorMessage: "This edit session ended and unsaved changes were not published."
    });
  });

  it("maps a publish persistence failure to persistence_invariant instead of invalid input", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createJsonResponse(500, {
          error: {
            code: "persistence_invariant",
            message: "Something went wrong while publishing. Your changes were not published. Please try again."
          }
        })
      )
    );

    const client = createServiceNowClient(createRuntime());
    const result = await client.publishPage({
      workspaceSlug: "product-docs",
      pageSysId: "page-005",
      workspaceLeaseToken: "workspace-lease-token",
      expectedRevision: 8
    });

    expect(result).toEqual({
      code: "persistence_invariant",
      retryable: false,
      state: "failed",
      errorMessage: "Something went wrong while publishing. Your changes were not published. Please try again."
    });
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
      expect(result.code).toBe("forbidden");
      expect(result.retryable).toBe(false);
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
      expect(result.code).toBe("persistence_invariant");
      expect(result.retryable).toBe(false);
      expect(result.errorMessage).toBe("Something went wrong while saving the page body. Please try again.");
    }
  });

  it.each([408, 429, 502, 503, 504])("classifies HTTP %s as transient and retryable", async (status) => {
    vi.stubGlobal("fetch", vi.fn(async () => createJsonResponse(status, { error: { message: "Try again later." } })));

    const result = await createServiceNowClient(createRuntime()).savePageBody({
      workspaceSlug: "product-docs",
      pageSysId: "page-005",
      draftBodyText: "Saved draft body"
    });

    expect(result).toMatchObject({ code: "transient", retryable: true, state: "failed" });
  });

  it("classifies network interruption as retryable but malformed success payloads as terminal", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network interrupted"); }));
    const client = createServiceNowClient(createRuntime());
    await expect(client.savePageBody({ workspaceSlug: "product-docs", pageSysId: "page-005" })).resolves.toMatchObject({
      code: "network",
      retryable: true,
      state: "failed"
    });

    vi.stubGlobal("fetch", vi.fn(async () => createJsonResponse(200, { result: { unexpected: true } })));
    await expect(client.savePageBody({ workspaceSlug: "product-docs", pageSysId: "page-005" })).resolves.toMatchObject({
      code: "persistence_invariant",
      retryable: false,
      state: "failed"
    });
  });

  it("normalizes a locked acquire response and omits an empty lock token from the request body", async () => {
    const fetchMock = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
      expect(String(path)).toContain("/api/x_82900_docsera/docsera_runtime/pages/edit-lock/acquire");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        workspaceSlug: "product-docs",
        workspaceSysId: "",
        pageSysId: "page-005",
        pageSlug: ""
      });

      return createJsonResponse(409, {
        error: {
          code: "page_locked",
          message: "This page is currently being edited by Priya Writer.",
          holderDisplayName: "Priya Writer",
          sameUserDifferentSession: false
        }
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createServiceNowClient(createRuntime());
    const result = await client.acquirePageEditLock({
      workspaceSlug: "product-docs",
      pageSysId: "page-005"
    });

    expect(result).toEqual({
      holderDisplayName: "Priya Writer",
      sameUserDifferentSession: false,
      state: "locked"
    });
  });

  it("normalizes a held status response and preserves a provided resume token", async () => {
    const fetchMock = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
      expect(String(path)).toContain("/api/x_82900_docsera/docsera_runtime/pages/edit-lock/status");
      expect(JSON.parse(String(init?.body))).toEqual({
        workspaceSlug: "product-docs",
        workspaceSysId: "",
        pageSysId: "page-005",
        pageSlug: "",
        lockToken: "resume-token"
      });

      return createJsonResponse(200, {
        result: {
          state: "held",
          lockToken: "resume-token",
          heartbeatIntervalMs: 30000,
          staleAfterMs: 180000
        }
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createServiceNowClient(createRuntime());
    const result = await client.getPageEditLockStatus({
      lockToken: "resume-token",
      workspaceSlug: "product-docs",
      pageSysId: "page-005"
    });

    expect(result).toEqual({
      heartbeatIntervalMs: 30000,
      lockToken: "resume-token",
      staleAfterMs: 180000,
      state: "held"
    });
  });

  it.each([
    {
      action: "acquireWorkspaceEditLease" as const,
      expectedPath: "/api/x_82900_docsera/docsera_runtime/workspaces/edit-lease/acquire",
      input: {
        workspaceSlug: "product-docs",
        workspaceSysId: "workspace-001"
      },
      payload: {
        state: "held" as const,
        leaseToken: "workspace-lease-token",
        heartbeatIntervalMs: 60000,
        staleAfterMs: 300000,
        changeSetId: "change-set-001",
        changeSetRevision: 9,
        workspaceStateRevision: 4
      },
      expected: {
        state: "held" as const,
        leaseToken: "workspace-lease-token",
        heartbeatIntervalMs: 60000,
        staleAfterMs: 300000,
        changeSetId: "change-set-001",
        changeSetRevision: 9,
        workspaceStateRevision: 4
      }
    },
    {
      action: "resumeWorkspaceEditLease" as const,
      expectedPath: "/api/x_82900_docsera/docsera_runtime/workspaces/edit-lease/resume",
      input: {
        workspaceSlug: "product-docs",
        workspaceSysId: "workspace-001",
        leaseToken: "workspace-lease-token"
      },
      payload: {
        state: "held" as const,
        leaseToken: "workspace-lease-token",
        heartbeatIntervalMs: 60000,
        staleAfterMs: 300000,
        changeSetId: "change-set-001",
        changeSetRevision: 9
      },
      expected: {
        state: "held" as const,
        leaseToken: "workspace-lease-token",
        heartbeatIntervalMs: 60000,
        staleAfterMs: 300000,
        changeSetId: "change-set-001",
        changeSetRevision: 9
      }
    },
    {
      action: "renewWorkspaceEditLease" as const,
      expectedPath: "/api/x_82900_docsera/docsera_runtime/workspaces/edit-lease/renew",
      input: {
        workspaceSlug: "product-docs",
        workspaceSysId: "workspace-001",
        leaseToken: "workspace-lease-token"
      },
      payload: {
        state: "held" as const,
        leaseToken: "workspace-lease-token",
        heartbeatIntervalMs: 60000,
        staleAfterMs: 300000,
        changeSetId: "change-set-001",
        changeSetRevision: 9,
        workspaceStateRevision: 5
      },
      expected: {
        state: "held" as const,
        leaseToken: "workspace-lease-token",
        heartbeatIntervalMs: 60000,
        staleAfterMs: 300000,
        changeSetId: "change-set-001",
        changeSetRevision: 9,
        workspaceStateRevision: 5
      }
    }
  ])("normalizes held workspace lease $action responses", async ({ action, expectedPath, input, payload, expected }) => {
    const fetchMock = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
      expect(String(path)).toContain(expectedPath);
      expect(JSON.parse(String(init?.body))).toEqual(input);
      return createJsonResponse(200, {
        result: payload
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createServiceNowClient(createRuntime());
    const leaseMethod = client[action] as (leaseInput: { workspaceSlug: string; workspaceSysId: string; leaseToken?: string }) => Promise<unknown>;
    const result = await leaseMethod(input);

    expect(result).toEqual(expected);
  });

  it.each([
    {
      action: "acquireWorkspaceEditLease" as const,
      expectedPath: "/api/x_82900_docsera/docsera_runtime/workspaces/edit-lease/acquire",
      input: {
        workspaceSlug: "product-docs",
        workspaceSysId: "workspace-001"
      },
      payload: { state: "released" as const }
    },
    {
      action: "acquireWorkspaceEditLease" as const,
      expectedPath: "/api/x_82900_docsera/docsera_runtime/workspaces/edit-lease/acquire",
      input: {
        workspaceSlug: "product-docs",
        workspaceSysId: "workspace-001"
      },
      payload: { state: "unlocked" as const }
    },
    {
      action: "resumeWorkspaceEditLease" as const,
      expectedPath: "/api/x_82900_docsera/docsera_runtime/workspaces/edit-lease/resume",
      input: {
        workspaceSlug: "product-docs",
        workspaceSysId: "workspace-001",
        leaseToken: "workspace-lease-token"
      },
      payload: { state: "released" as const }
    },
    {
      action: "resumeWorkspaceEditLease" as const,
      expectedPath: "/api/x_82900_docsera/docsera_runtime/workspaces/edit-lease/resume",
      input: {
        workspaceSlug: "product-docs",
        workspaceSysId: "workspace-001",
        leaseToken: "workspace-lease-token"
      },
      payload: { state: "unlocked" as const }
    },
    {
      action: "renewWorkspaceEditLease" as const,
      expectedPath: "/api/x_82900_docsera/docsera_runtime/workspaces/edit-lease/renew",
      input: {
        workspaceSlug: "product-docs",
        workspaceSysId: "workspace-001",
        leaseToken: "workspace-lease-token"
      },
      payload: { state: "released" as const }
    },
    {
      action: "renewWorkspaceEditLease" as const,
      expectedPath: "/api/x_82900_docsera/docsera_runtime/workspaces/edit-lease/renew",
      input: {
        workspaceSlug: "product-docs",
        workspaceSysId: "workspace-001",
        leaseToken: "workspace-lease-token"
      },
      payload: { state: "unlocked" as const }
    },
    {
      action: "releaseWorkspaceEditLease" as const,
      expectedPath: "/api/x_82900_docsera/docsera_runtime/workspaces/edit-lease/release",
      input: {
        workspaceSlug: "product-docs",
        workspaceSysId: "workspace-001",
        leaseToken: "workspace-lease-token"
      },
      payload: {
        state: "held" as const,
        leaseToken: "workspace-lease-token",
        heartbeatIntervalMs: 60000,
        staleAfterMs: 300000,
        changeSetId: "change-set-001",
        changeSetRevision: 9,
        workspaceStateRevision: 4
      }
    },
    {
      action: "releaseWorkspaceEditLease" as const,
      expectedPath: "/api/x_82900_docsera/docsera_runtime/workspaces/edit-lease/release",
      input: {
        workspaceSlug: "product-docs",
        workspaceSysId: "workspace-001",
        leaseToken: "workspace-lease-token"
      },
      payload: { state: "unlocked" as const }
    },
    {
      action: "getWorkspaceEditLeaseStatus" as const,
      expectedPath: "/api/x_82900_docsera/docsera_runtime/workspaces/edit-lease/status",
      input: {
        workspaceSlug: "product-docs",
        workspaceSysId: "workspace-001"
      },
      payload: { state: "released" as const }
    }
  ])("fails closed for invalid workspace lease $action state $payload.state", async ({ action, expectedPath, input, payload }) => {
    const fetchMock = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
      expect(String(path)).toContain(expectedPath);
      expect(JSON.parse(String(init?.body))).toEqual(input);
      if (action === "releaseWorkspaceEditLease") {
        expect(init?.keepalive).toBe(true);
      }
      return createJsonResponse(200, {
        result: payload
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createServiceNowClient(createRuntime());
    const leaseMethod = client[action] as (leaseInput: { workspaceSlug: string; workspaceSysId: string; leaseToken?: string; keepalive?: boolean }) => Promise<unknown>;
    const result = await leaseMethod(input);

    expect(result).toEqual({
      failure: "terminal",
      retryable: false,
      state: "failed",
      errorMessage: "Workspace editing is unavailable."
    });
  });

  it("preserves successful release responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createJsonResponse(200, {
          result: {
            state: "released"
          }
        })
      )
    );

    const client = createServiceNowClient(createRuntime());
    const result = await client.releaseWorkspaceEditLease?.({
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001",
      leaseToken: "workspace-lease-token"
    });

    expect(result).toEqual({
      state: "released"
    });
  });

  it("preserves valid workspace lease action-state combinations", async () => {
    const cases = [
      {
        action: "acquireWorkspaceEditLease" as const,
        expectedPath: "/api/x_82900_docsera/docsera_runtime/workspaces/edit-lease/acquire",
        input: {
          workspaceSlug: "product-docs",
          workspaceSysId: "workspace-001"
        },
        payload: {
          state: "locked" as const,
          holderDisplayName: "Priya Writer",
          sameUserDifferentSession: true
        },
        expected: {
          state: "locked" as const,
          holderDisplayName: "Priya Writer",
          sameUserDifferentSession: true
        }
      },
      {
        action: "resumeWorkspaceEditLease" as const,
        expectedPath: "/api/x_82900_docsera/docsera_runtime/workspaces/edit-lease/resume",
        input: {
          workspaceSlug: "product-docs",
          workspaceSysId: "workspace-001",
          leaseToken: "workspace-lease-token"
        },
        payload: {
          state: "lost" as const,
          errorMessage: "This workspace edit session ended and unsaved changes were not saved.",
          holderDisplayName: "Priya Writer",
          sameUserDifferentSession: false
        },
        expected: {
          state: "lost" as const,
          errorMessage: "This workspace edit session ended and unsaved changes were not saved.",
          holderDisplayName: "Priya Writer",
          sameUserDifferentSession: false
        }
      },
      {
        action: "renewWorkspaceEditLease" as const,
        expectedPath: "/api/x_82900_docsera/docsera_runtime/workspaces/edit-lease/renew",
        input: {
          workspaceSlug: "product-docs",
          workspaceSysId: "workspace-001",
          leaseToken: "workspace-lease-token"
        },
        payload: {
          state: "lost" as const,
          errorMessage: "This workspace edit session ended and unsaved changes were not saved.",
          holderDisplayName: null,
          sameUserDifferentSession: false
        },
        expected: {
          state: "lost" as const,
          errorMessage: "This workspace edit session ended and unsaved changes were not saved.",
          holderDisplayName: null,
          sameUserDifferentSession: false
        }
      },
      {
        action: "getWorkspaceEditLeaseStatus" as const,
        expectedPath: "/api/x_82900_docsera/docsera_runtime/workspaces/edit-lease/status",
        input: {
          workspaceSlug: "product-docs",
          workspaceSysId: "workspace-001"
        },
        payload: {
          state: "unlocked" as const
        },
        expected: {
          state: "unlocked" as const
        }
      },
      {
        action: "releaseWorkspaceEditLease" as const,
        expectedPath: "/api/x_82900_docsera/docsera_runtime/workspaces/edit-lease/release",
        input: {
          workspaceSlug: "product-docs",
          workspaceSysId: "workspace-001",
          leaseToken: "workspace-lease-token"
        },
        payload: {
          state: "released" as const
        },
        expected: {
          state: "released" as const
        }
      },
      {
        action: "releaseWorkspaceEditLease" as const,
        expectedPath: "/api/x_82900_docsera/docsera_runtime/workspaces/edit-lease/release",
        input: {
          workspaceSlug: "product-docs",
          workspaceSysId: "workspace-001",
          leaseToken: "workspace-lease-token"
        },
        payload: {
          state: "lost" as const,
          errorMessage: "This workspace edit session ended and unsaved changes were not saved.",
          holderDisplayName: "Priya Writer",
          sameUserDifferentSession: false
        },
        expected: {
          state: "lost" as const,
          errorMessage: "This workspace edit session ended and unsaved changes were not saved.",
          holderDisplayName: "Priya Writer",
          sameUserDifferentSession: false
        }
      }
    ];

    for (const { action, expectedPath, input, payload, expected } of cases) {
      const fetchMock = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
        expect(String(path)).toContain(expectedPath);
        expect(JSON.parse(String(init?.body))).toEqual(input);
        if (action === "releaseWorkspaceEditLease") {
          expect(init?.keepalive).toBe(true);
        }
        return createJsonResponse(200, { result: payload });
      });

      vi.stubGlobal("fetch", fetchMock);

      const client = createServiceNowClient(createRuntime());
      const leaseMethod = client[action] as (leaseInput: { workspaceSlug: string; workspaceSysId: string; leaseToken?: string; keepalive?: boolean }) => Promise<unknown>;
      const result = await leaseMethod(input);

      expect(result).toEqual(expected);
    }
  });

  it("fails closed when release receives malformed held payloads", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createJsonResponse(200, {
          result: {
            state: "held",
            leaseToken: "",
            heartbeatIntervalMs: 60000,
            staleAfterMs: 300000,
            changeSetRevision: 9
          }
        })
      )
    );

    const client = createServiceNowClient(createRuntime());
    const result = await client.releaseWorkspaceEditLease?.({
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001",
      leaseToken: "workspace-lease-token"
    });

    expect(result).toEqual({
      failure: "terminal",
      retryable: false,
      state: "failed",
      errorMessage: "Workspace editing is unavailable."
    });
  });

  it("normalizes a stale status resume as lock loss", async () => {
    const fetchMock = vi.fn(async () =>
      createJsonResponse(409, {
        error: {
          code: "edit_lock_lost",
          message: "This edit session ended and unsaved changes were not saved.",
          holderDisplayName: null,
          sameUserDifferentSession: false
        }
      })
    );

    vi.stubGlobal("fetch", fetchMock);

    const client = createServiceNowClient(createRuntime());
    const result = await client.getPageEditLockStatus({
      lockToken: "resume-token",
      workspaceSlug: "product-docs",
      pageSysId: "page-005"
    });

    expect(result).toEqual({
      errorMessage: "This edit session ended and unsaved changes were not saved.",
      holderDisplayName: null,
      sameUserDifferentSession: false,
      state: "lost"
    });
  });

  it("normalizes heartbeat lock loss distinctly from transient save failures", async () => {
    const fetchMock = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
      expect(String(path)).toContain("/api/x_82900_docsera/docsera_runtime/pages/edit-lock/heartbeat");
      expect(JSON.parse(String(init?.body))).toEqual({
        workspaceSlug: "",
        workspaceSysId: "workspace-001",
        pageSysId: "",
        pageSlug: "draft-body-page",
        lockToken: "held-token"
      });

      return createJsonResponse(409, {
        error: {
          code: "edit_lock_lost",
          message: "This edit session ended because Priya Writer now holds the page lock. Unsaved changes were not saved.",
          holderDisplayName: "Priya Writer",
          sameUserDifferentSession: false
        }
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createServiceNowClient(createRuntime());
    const result = await client.heartbeatPageEditLock({
      lockToken: "held-token",
      workspaceSysId: "workspace-001",
      pageSlug: "draft-body-page"
    });

    expect(result).toEqual({
      errorMessage: "This edit session ended because Priya Writer now holds the page lock. Unsaved changes were not saved.",
      holderDisplayName: "Priya Writer",
      sameUserDifferentSession: false,
      state: "lost"
    });
  });

  it("maps workspace-lease autosave rejection onto the dedicated lock_lost code", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createJsonResponse(409, {
          error: {
            code: "workspace_lease_lost",
            message: "This edit session ended and unsaved changes were not saved."
          }
        })
      )
    );

    const client = createServiceNowClient(createRuntime());
    const result = await client.savePageBody({
      workspaceSlug: "product-docs",
      pageSysId: "page-005",
      workspaceAuthority,
      workspaceLeaseToken: "workspace-lease-token"
    });

    expect(result).toEqual({
      code: "lock_lost",
      errorMessage: "This edit session ended and unsaved changes were not saved.",
      retryable: false,
      state: "failed"
    });
  });

  it("normalizes a page settings save response", async () => {
    const fetchMock = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
      expect(String(path)).toContain("/api/x_82900_docsera/docsera_runtime/pages");
      expect(init?.method).toBe("PUT");
      expect(JSON.parse(String(init?.body))).toEqual({
        workspaceSlug: "product-docs",
        workspaceSysId: "workspace-001",
        pageSysId: "page-007",
        title: "Updated title",
        slug: "updated-title",
        expectedChangeSetId: "change-set-001",
        expectedChangeSetRevision: 9,
        workspaceLeaseToken: "workspace-lease-token"
      });

      return createJsonResponse(200, {
        result: {
          changeSetId: "change-set-002",
          changeSetRevision: 10,
          page: {
            sysId: "page-007",
            workspaceSysId: "workspace-001",
            parentPageSysId: null,
            siblingOrder: 7,
            draftTitle: "Updated title",
            draftSlug: "updated-title",
            draftSlugNormalized: "updated-title",
            draftContentJson: {
              type: "doc",
              content: []
            },
            draftBodyText: "Updated body",
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
    const result = await client.savePageSettings({
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001",
      pageSysId: "page-007",
      title: "Updated title",
      slug: "updated-title",
      workspaceAuthority,
      workspaceLeaseToken: "workspace-lease-token"
    });

    expect(result.state).toBe("succeeded");
    if (result.state === "succeeded") {
      expect(result.page.draftTitle).toBe("Updated title");
      expect(result.page.draftSlugNormalized).toBe("updated-title");
    }
  });

  it("normalizes a page delete response", async () => {
    const fetchMock = vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
      expect(String(path)).toContain("/api/x_82900_docsera/docsera_runtime/pages/delete");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toEqual({
        workspaceSlug: "product-docs",
        workspaceSysId: "workspace-001",
        pageSysId: "page-007",
        expectedChangeSetId: "change-set-001",
        expectedChangeSetRevision: 9,
        workspaceLeaseToken: "workspace-lease-token"
      });

      return createJsonResponse(200, {
        result: {
          changeSetId: "change-set-002",
          changeSetRevision: 10,
          deletedPageSysId: "page-007",
          nextPageSysId: "page-008"
        }
      });
    });

    vi.stubGlobal("fetch", fetchMock);

    const client = createServiceNowClient(createRuntime());
    const result = await client.deletePage({
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001",
      pageSysId: "page-007",
      workspaceAuthority,
      workspaceLeaseToken: "workspace-lease-token"
    });

    expect(result.state).toBe("succeeded");
    if (result.state === "succeeded") {
      expect(result.nextPageSysId).toBe("page-008");
    }
  });

  it("returns a safe failure message for unexpected page delete responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        createJsonResponse(405, {
          error: {
            message: "Delete page requires the action route."
          }
        })
      )
    );

    const client = createServiceNowClient(createRuntime());
    const result = await client.deletePage({
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001",
      pageSysId: "page-007"
    });

    expect(result.state).toBe("failed");
    if (result.state === "failed") {
      expect(result.errorMessage).toBe("Something went wrong while deleting the page. The page was not deleted. Please try again.");
    }
  });

  it("normalizes workspace lease acquisition with the active generation pair", async () => {
    vi.stubGlobal("fetch", vi.fn(async (path: RequestInfo | URL, init?: RequestInit) => {
      expect(String(path)).toContain("/api/x_82900_docsera/docsera_runtime/workspaces/edit-lease/acquire");
      expect(JSON.parse(String(init?.body))).toEqual({
        workspaceSlug: "product-docs",
        workspaceSysId: "workspace-001"
      });
      return createJsonResponse(200, {
        result: {
          state: "held",
          leaseToken: "workspace-lease-token",
          heartbeatIntervalMs: 60000,
          staleAfterMs: 300000,
          changeSetId: "change-set-001",
          changeSetRevision: 9,
          workspaceStateRevision: 4
        }
      });
    }));

    const client = createServiceNowClient(createRuntime());
    const result = await client.acquireWorkspaceEditLease?.({
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    });

    expect(result).toEqual({
      state: "held",
      leaseToken: "workspace-lease-token",
      heartbeatIntervalMs: 60000,
      staleAfterMs: 300000,
      changeSetId: "change-set-001",
      changeSetRevision: 9,
      workspaceStateRevision: 4
    });
  });

  it("normalizes workspace lease status without exposing the plaintext token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => createJsonResponse(200, {
      result: {
        state: "held",
        heartbeatIntervalMs: 60000,
        staleAfterMs: 300000,
        changeSetId: "change-set-001",
        changeSetRevision: 9
      }
    })));

    const client = createServiceNowClient(createRuntime());
    const result = await client.getWorkspaceEditLeaseStatus?.({
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001",
      leaseToken: "workspace-lease-token"
    });

    expect(result).toEqual({
      state: "held",
      heartbeatIntervalMs: 60000,
      staleAfterMs: 300000,
      changeSetId: "change-set-001",
      changeSetRevision: 9
    });
  });

  it("maps workspace foundation invalid responses to a terminal failure instead of lease loss", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => createJsonResponse(409, {
      error: {
        code: "workspace_foundation_invalid",
        message: "Workspace editing is unavailable for this workspace.",
        holderDisplayName: "Priya Writer",
        sameUserDifferentSession: true
      }
    })));

    const client = createServiceNowClient(createRuntime());
    const result = await client.acquireWorkspaceEditLease?.({
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    });

    expect(result).toEqual({
      state: "failed",
      errorMessage: "Workspace editing is unavailable for this workspace.",
      failure: "terminal",
      retryable: false
    });
  });

  it("maps unknown structured 409 responses to a terminal failure instead of invented contention", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => createJsonResponse(409, {
      error: {
        code: "workspace_unexpected_conflict",
        message: "Workspace editing is unavailable."
      }
    })));

    const client = createServiceNowClient(createRuntime());
    const result = await client.renewWorkspaceEditLease?.({
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001",
      leaseToken: "workspace-lease-token"
    });

    expect(result).toEqual({
      state: "failed",
      errorMessage: "Workspace editing is unavailable.",
      failure: "terminal",
      retryable: false
    });
  });

  it("fails closed when held acquisition omits the change-set id", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => createJsonResponse(200, {
      result: {
        state: "held",
        leaseToken: "workspace-lease-token",
        heartbeatIntervalMs: 60000,
        staleAfterMs: 300000,
        changeSetRevision: 9
      }
    })));

    const client = createServiceNowClient(createRuntime());
    const result = await client.acquireWorkspaceEditLease?.({
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    });

    expect(result).toEqual({
      state: "failed",
      errorMessage: "Workspace editing is unavailable.",
      failure: "terminal",
      retryable: false
    });
  });

  it.each([
    { label: "fractional", value: 1.5 },
    { label: "negative", value: -1 },
    { label: "missing", value: undefined },
    { label: "non-numeric", value: "not-a-number" }
  ])("fails closed when held acquisition has a $label change-set revision", async ({ value }) => {
    vi.stubGlobal("fetch", vi.fn(async () => createJsonResponse(200, {
      result: {
        state: "held",
        leaseToken: "workspace-lease-token",
        heartbeatIntervalMs: 60000,
        staleAfterMs: 300000,
        changeSetId: "change-set-001",
        changeSetRevision: value
      }
    })));

    const client = createServiceNowClient(createRuntime());
    const result = await client.acquireWorkspaceEditLease?.({
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    });

    expect(result).toEqual({
      state: "failed",
      errorMessage: "Workspace editing is unavailable.",
      failure: "terminal",
      retryable: false
    });
  });

  it("fails closed when held acquisition omits the plaintext lease token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => createJsonResponse(200, {
      result: {
        state: "held",
        heartbeatIntervalMs: 60000,
        staleAfterMs: 300000,
        changeSetId: "change-set-001",
        changeSetRevision: 9
      }
    })));

    const client = createServiceNowClient(createRuntime());
    const result = await client.acquireWorkspaceEditLease?.({
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001"
    });

    expect(result).toEqual({
      state: "failed",
      errorMessage: "Workspace editing is unavailable.",
      failure: "terminal",
      retryable: false
    });
  });

  it("fails closed when status exposes a plaintext lease token", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => createJsonResponse(200, {
      result: {
        state: "held",
        leaseToken: "workspace-lease-token",
        heartbeatIntervalMs: 60000,
        staleAfterMs: 300000,
        changeSetId: "change-set-001",
        changeSetRevision: 9
      }
    })));

    const client = createServiceNowClient(createRuntime());
    const result = await client.getWorkspaceEditLeaseStatus?.({
      workspaceSlug: "product-docs",
      workspaceSysId: "workspace-001",
      leaseToken: "workspace-lease-token"
    });

    expect(result).toEqual({
      state: "failed",
      errorMessage: "Workspace editing is unavailable.",
      failure: "terminal",
      retryable: false
    });
  });
});
