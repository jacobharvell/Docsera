import { describe, expect, it, vi } from "vitest";
import type { WorkspaceRecord } from "../workspaces/serverWorkspaceDomain.ts";
import type { PageRecord } from "./serverPageDomain.ts";
import { parseServerDocument } from "./serverEditorDocument.ts";
import { createPageBodySaveService } from "./serviceNowPageDraftPersistence.ts";
import { createDocseraDocumentFixtureCorpus, createSupportedE2DocseraDocumentEnvelope } from "../../shared/editor/documentFixtures";
import { createResponsiveImageDocseraDocumentEnvelope } from "../../shared/editor/imageFixtures";

function createWorkspace(): WorkspaceRecord {
  return {
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
      tocVisibleByDefault: true,
      pageWidth: "readable"
    }
  };
}

function createPage(overrides: Partial<PageRecord> = {}): PageRecord {
  return {
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
    draftBodyText: null,
    publishedTitle: null,
    publishedSlug: null,
    publishedSlugNormalized: null,
    publishedContentJson: null,
    publishedBodyText: null,
    publicationState: "draft",
    active: true,
    ...overrides
  };
}

describe("page body save service", () => {
  it("saves draft body content and persistence fields", async () => {
    const savePage = vi.fn(async (page: PageRecord) => page);
    const service = createPageBodySaveService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [createPage()],
      savePageDraft: savePage
    });

    const result = await service.savePageBody({
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      expectedRevision: 0,
      draftBodyText: "Updated draft body"
    });

    expect(result.kind).toBe("succeeded");
    expect(savePage).toHaveBeenCalledTimes(1);
    expect(savePage).toHaveBeenCalledWith(
      expect.objectContaining({
        draftBodyText: "Updated draft body",
        draftRevision: 1,
        draftContentJson: {
          schemaVersion: 1,
          document: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [
                  {
                    type: "text",
                    text: "Updated draft body"
                  }
                ]
              }
            ]
          }
        }
      }),
      0
    );
    if (result.kind === "succeeded") {
      expect(result.page.draftBodyText).toBe("Updated draft body");
    }
  });

  it("marks a previously published page as having unpublished changes while leaving published fields untouched", async () => {
    const savePage = vi.fn(async (page: PageRecord) => page);
    const service = createPageBodySaveService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [
        createPage({
          draftRevision: 2,
          draftTitle: "Overview Draft",
          draftSlug: "overview-draft",
          draftSlugNormalized: "overview-draft",
          draftContentJson: createSupportedE2DocseraDocumentEnvelope(),
          draftBodyText: "Draft body",
          publishedTitle: "Overview",
          publishedSlug: "overview",
          publishedSlugNormalized: "overview",
          publishedContentJson: createSupportedE2DocseraDocumentEnvelope(),
          publishedBodyText: "Published body",
          publicationState: "published"
        })
      ],
      savePageDraft: savePage
    });

    const result = await service.savePageBody({
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      expectedRevision: 2,
      draftBodyText: "Updated draft body"
    });

    expect(result.kind).toBe("succeeded");
    expect(savePage).toHaveBeenCalledWith(
      expect.objectContaining({
        publicationState: "published_with_unpublished_changes",
        publishedTitle: "Overview",
        publishedSlug: "overview",
        publishedBodyText: "Published body"
      }),
      2
    );
  });

  it("rejects a stale expected revision without writing", async () => {
    const savePage = vi.fn(async (page: PageRecord) => page);
    const service = createPageBodySaveService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [createPage({ draftRevision: 4 })],
      savePageDraft: savePage
    });

    const result = await service.savePageBody({
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      draftBodyText: "Stale body",
      expectedRevision: 3
    });

    expect(result).toEqual({
      kind: "conflict",
      currentRevision: 4,
      errorMessage: "This page has a newer saved draft. Reload before saving again."
    });
    expect(savePage).not.toHaveBeenCalled();
  });

  it("allows only one sequential draft save from the same accepted revision", async () => {
    let persisted = createPage({ draftRevision: 3 });
    const savePageDraft = vi.fn(async (nextPage: PageRecord, expectedRevision: number) => {
      if (persisted.draftRevision !== expectedRevision) {
        return null;
      }
      persisted = nextPage;
      return persisted;
    });
    const service = createPageBodySaveService({
      evaluateWorkspaceCapabilities: () => ({ canAdminWorkspace: false, canEditWorkspace: true, canManageWorkspaceMembers: false, canViewWorkspace: true }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [persisted],
      savePageDraft
    });

    const first = await service.savePageBody({ workspaceSlug: "product-docs", pageSysId: "page-001", expectedRevision: 3, draftBodyText: "First" });
    const second = await service.savePageBody({ workspaceSlug: "product-docs", pageSysId: "page-001", expectedRevision: 3, draftBodyText: "Second" });

    expect(first.kind).toBe("succeeded");
    expect(second).toMatchObject({ kind: "conflict" });
    expect(persisted.draftBodyText).toBe("First");
  });

  it("accepts canonical JSON and rejects unsupported documents without writing", async () => {
    const savePage = vi.fn(async (page: PageRecord) => page);
    const service = createPageBodySaveService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [createPage({ draftRevision: 2 })],
      savePageDraft: savePage
    });

    const accepted = await service.savePageBody({
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      expectedRevision: 2,
      draftContentJson: createSupportedE2DocseraDocumentEnvelope()
    });

    expect(accepted.kind).toBe("succeeded");
    expect(savePage).toHaveBeenCalledWith(
      expect.objectContaining({
        draftRevision: 3,
        draftContentJson: createSupportedE2DocseraDocumentEnvelope()
      }),
      2
    );

    savePage.mockClear();
    const rejected = await service.savePageBody({
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      expectedRevision: 2,
      draftContentJson: {
        schemaVersion: 9,
        document: { type: "doc", content: [] }
      }
    });

    expect(rejected).toMatchObject({ kind: "failed", status: 400 });
    expect(savePage).not.toHaveBeenCalled();

    const primitiveRejected = await service.savePageBody({
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      expectedRevision: 2,
      draftContentJson: "not-json" as never
    });

    expect(primitiveRejected).toMatchObject({
      kind: "failed",
      status: 400,
      errorMessage: "The stored page content does not use a supported document envelope."
    });
    expect(savePage).not.toHaveBeenCalled();
  });

  it("accepts a canonical image envelope at the save boundary without widening the image contract", async () => {
    const canonicalImageEnvelope = createResponsiveImageDocseraDocumentEnvelope();
    const savePage = vi.fn(async (page: PageRecord) => page);
    const service = createPageBodySaveService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [createPage({ draftRevision: 2 })],
      savePageDraft: savePage
    });

    const result = await service.savePageBody({
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      expectedRevision: 2,
      draftContentJson: canonicalImageEnvelope
    });

    expect(result.kind).toBe("succeeded");
    expect(savePage).toHaveBeenCalledWith(
      expect.objectContaining({
        draftRevision: 3,
        draftContentJson: canonicalImageEnvelope
      }),
      2
    );

    if (result.kind !== "succeeded") {
      return;
    }

    expect(result.page.draftContentJson).toEqual(canonicalImageEnvelope);
    expect(result.page.draftContentJson.document.content?.[0]).toEqual({
      type: "image",
      attrs: {
        mediaId: "workspace-media-light",
        darkMediaId: "workspace-media-dark",
        alt: "Architecture diagram",
        caption: "Published in both light and dark modes",
        frame: false,
        align: "center",
        widthPct: 80
      }
    });

    const serialized = JSON.stringify(result.page.draftContentJson);
    expect(serialized).not.toContain('"src"');
    expect(serialized).not.toContain('"title"');
    expect(serialized).not.toContain('"width"');
    expect(serialized).not.toContain('"height"');
    expect(serialized).not.toContain('"lightSrc"');
    expect(serialized).not.toContain('"darkSrc"');
    expect(serialized).not.toContain('"lightAlt"');
    expect(serialized).not.toContain('"darkAlt"');
  });

  it.each(createDocseraDocumentFixtureCorpus().filter((fixture) => !fixture.expected.ok))(
    "rejects $label at the save boundary without writing",
    async ({ input }) => {
      const savePage = vi.fn(async (page: PageRecord) => page);
      const service = createPageBodySaveService({
        evaluateWorkspaceCapabilities: () => ({
          canAdminWorkspace: false,
          canEditWorkspace: true,
          canManageWorkspaceMembers: false,
          canViewWorkspace: true
        }),
        loadWorkspaceBySlug: async () => createWorkspace(),
        loadWorkspaceBySysId: async () => createWorkspace(),
        listWorkspacePages: async () => [createPage({ draftRevision: 2 })],
        savePageDraft: savePage
      });

      const rejected = await service.savePageBody({
        workspaceSlug: "product-docs",
        pageSysId: "page-001",
        expectedRevision: 2,
        draftContentJson: input as never
      });

      expect(rejected).toMatchObject({
        kind: "failed",
        status: 400
      });
      expect(savePage).not.toHaveBeenCalled();
    }
  );

  it("preserves a large multi-byte canonical document without trimming through the save boundary", async () => {
    let storedSerializedDocument = "";
    const savePage = vi.fn(async (page: PageRecord) => {
      storedSerializedDocument = JSON.stringify(page.draftContentJson);
      return {
        ...page,
        draftContentJson: JSON.parse(storedSerializedDocument)
      };
    });
    const service = createPageBodySaveService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [createPage({ draftRevision: 7 })],
      savePageDraft: savePage
    });
    const document = {
      schemaVersion: 1 as const,
      document: {
        type: "doc" as const,
        content: Array.from({ length: 1200 }, (_, index) => ({
          type: "paragraph",
          content: [{ type: "text", text: `Docsera canonical capacity 容量🙂 paragraph ${index + 1}${index === 1199 ? "\n" : ""}` }]
        }))
      }
    };
    const expectedSerializedDocument = JSON.stringify(document);

    expect(expectedSerializedDocument.length).toBeGreaterThan(4000);

    const result = await service.savePageBody({
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      expectedRevision: 7,
      draftContentJson: document
    });

    expect(result.kind).toBe("succeeded");
    expect(savePage).toHaveBeenCalledTimes(1);
    expect(storedSerializedDocument).toBe(expectedSerializedDocument);
    expect(storedSerializedDocument).toContain("paragraph 1200\\n");
    if (result.kind === "succeeded") {
      expect(result.page.draftRevision).toBe(8);
      expect(parseServerDocument(JSON.stringify(result.page.draftContentJson))).toEqual(document);
    }
  });

  it("rejects missing workspace references", async () => {
    const service = createPageBodySaveService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: async () => null,
      loadWorkspaceBySysId: async () => null,
      listWorkspacePages: async () => [],
      savePageDraft: async (page) => page
    });

    const result = await service.savePageBody({
      workspaceSlug: "",
      pageSysId: "page-001",
      draftBodyText: "Updated draft body"
    });

    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.status).toBe(400);
      expect(result.errorMessage).toContain("workspace");
    }
  });

  it("rejects missing page references", async () => {
    const service = createPageBodySaveService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [],
      savePageDraft: async (page) => page
    });

    const result = await service.savePageBody({
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      draftBodyText: "Updated draft body"
    });

    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.status).toBe(404);
      expect(result.errorMessage).toContain("Page");
    }
  });

  it("rejects page-workspace mismatches", async () => {
    const service = createPageBodySaveService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: true,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [
        createPage({
          sysId: "page-002",
          workspaceSysId: "workspace-002"
        })
      ],
      savePageDraft: async (page) => page
    });

    const result = await service.savePageBody({
      workspaceSlug: "product-docs",
      pageSysId: "page-002",
      draftBodyText: "Updated draft body"
    });

    expect(result.kind).toBe("failed");
    if (result.kind === "failed") {
      expect(result.status).toBe(400);
      expect(result.errorMessage).toContain("workspace");
    }
  });

  it("rejects users without authoring capability", async () => {
    const savePageDraft = vi.fn(async (page: PageRecord) => page);
    const touchPageEditLock = vi.fn();
    const service = createPageBodySaveService({
      evaluateWorkspaceCapabilities: () => ({
        canAdminWorkspace: false,
        canEditWorkspace: false,
        canManageWorkspaceMembers: false,
        canViewWorkspace: true
      }),
      loadWorkspaceBySlug: async () => createWorkspace(),
      loadWorkspaceBySysId: async () => createWorkspace(),
      listWorkspacePages: async () => [createPage()],
      savePageDraft,
      touchPageEditLock
    });

    const result = await service.savePageBody({
      lockToken: "resume-token",
      workspaceSlug: "product-docs",
      pageSysId: "page-001",
      draftBodyText: "Updated draft body"
    });

    expect(result.kind).toBe("forbidden");
    if (result.kind === "forbidden") {
      expect(result.errorMessage).toContain("permission");
    }
    expect(touchPageEditLock).not.toHaveBeenCalled();
    expect(savePageDraft).not.toHaveBeenCalled();
  });
});
