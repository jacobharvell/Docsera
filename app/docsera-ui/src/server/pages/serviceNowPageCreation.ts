import { GlideRecord, gs } from "@servicenow/glide";
import { DOCSERA_WORKSPACE_TABLE, type WorkspaceCapabilityResult, type WorkspaceRecord } from "../workspaces/serverWorkspaceDomain.ts";
import { evaluateCurrentUserWorkspaceCapabilities } from "../workspaces/serviceNowWorkspaceCapabilities.ts";
import { mapWorkspaceRecord } from "../workspaces/serviceNowWorkspaceRecords.ts";
import { DOCSERA_PAGE_TABLE, createPageDraft, normalizePageRecord, type PageDraftInput, type PageRecord } from "./serverPageDomain.ts";
import { mapPageRecord } from "./serviceNowPageRecords.ts";

type PageCreationInput = {
  title: string;
  workspaceSlug: string;
  parentPageSysId?: string | null;
};

type Awaitable<T> = T | Promise<T>;

type PageCreationDependencies = {
  evaluateWorkspaceCapabilities: (workspace: WorkspaceRecord) => WorkspaceCapabilityResult;
  loadWorkspaceBySlug: (workspaceSlug: string) => Awaitable<WorkspaceRecord | null>;
  listWorkspacePages: (workspaceSysId: string) => Promise<PageRecord[]>;
  savePage: (page: PageRecord) => Promise<PageRecord>;
};

type PageCreationOutcome =
  | {
      kind: "failed";
      errorMessage: string;
    }
  | {
      kind: "forbidden";
      errorMessage: string;
    }
  | {
      kind: "succeeded";
      page: PageRecord;
    };

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function logUnexpectedPageCreationError(error: unknown, context: Record<string, unknown>) {
  const message = cleanText(error instanceof Error ? error.message : error) || "Unknown page creation failure.";
  const stack = error instanceof Error ? cleanText(error.stack) : "";
  gs.error(
    `[Docsera page creation] ${JSON.stringify({
      context,
      message,
      stack: stack || undefined
    })}`
  );
}

function serializePageContentJson(value: Record<string, unknown>): string {
  return JSON.stringify(value ?? { type: "doc", content: [] });
}

function loadWorkspaceBySlug(workspaceSlug: string): ReturnType<typeof mapWorkspaceRecord> | null {
  const slug = cleanText(workspaceSlug);
  if (!slug) {
    return null;
  }

  const record = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
  record.addQuery("workspace_slug", slug);
  record.addQuery("status", "active");
  record.setLimit(1);
  record.query();

  if (!record.next()) {
    return null;
  }

  return mapWorkspaceRecord(record);
}

function listWorkspacePages(workspaceSysId: string): Promise<PageRecord[]> {
  const sysId = cleanText(workspaceSysId);
  const pages = new GlideRecord(DOCSERA_PAGE_TABLE);
  pages.addQuery("workspace", sysId);
  pages.query();

  const results: PageRecord[] = [];
  while (pages.next()) {
    results.push(mapPageRecord(pages));
  }

  return Promise.resolve(
    results.sort((left, right) => {
      if (left.siblingOrder !== right.siblingOrder) {
        return left.siblingOrder - right.siblingOrder;
      }

      const titleComparison = cleanText(left.draftTitle).localeCompare(cleanText(right.draftTitle), undefined, { sensitivity: "base" });
      if (titleComparison !== 0) {
        return titleComparison;
      }

      return cleanText(left.draftSlug).localeCompare(cleanText(right.draftSlug), undefined, { sensitivity: "base" });
    })
  );
}

function savePage(page: PageRecord): Promise<PageRecord> {
  const draft = normalizePageRecord(page);
  const record = new GlideRecord(DOCSERA_PAGE_TABLE);
  record.initialize();
  record.setValue("workspace", draft.workspaceSysId);
  record.setValue("parent_page", draft.parentPageSysId ?? "");
  record.setValue("sibling_order", String(draft.siblingOrder));
  record.setValue("draft_title", draft.draftTitle);
  record.setValue("draft_slug", draft.draftSlug);
  record.setValue("draft_slug_normalized", draft.draftSlugNormalized);
  record.setValue("draft_content_json", serializePageContentJson(draft.draftContentJson));
  record.setValue("draft_body_text", draft.draftBodyText ?? "");
  record.setValue("published_title", draft.publishedTitle ?? "");
  record.setValue("published_slug", draft.publishedSlug ?? "");
  record.setValue("published_slug_normalized", draft.publishedSlugNormalized ?? "");
  record.setValue("published_content_json", draft.publishedContentJson ? serializePageContentJson(draft.publishedContentJson) : "");
  record.setValue("published_body_text", draft.publishedBodyText ?? "");
  record.setValue("publication_state", draft.publicationState);
  record.setValue("active", draft.active ? "true" : "false");

  const insertedSysId = cleanText(record.insert());
  if (!insertedSysId) {
    throw new Error("Failed to create page record.");
  }

  const inserted = new GlideRecord(DOCSERA_PAGE_TABLE);
  if (!inserted.get(insertedSysId)) {
    throw new Error("Page record could not be loaded after insert.");
  }

  return Promise.resolve(mapPageRecord(inserted));
}

export function createPageCreationService(dependencies: PageCreationDependencies) {
  return {
    async createPage(input: PageCreationInput): Promise<PageCreationOutcome> {
      const title = cleanText(input.title);
      if (!title) {
        return {
          kind: "failed",
          errorMessage: "Page title is required."
        };
      }

      if (title.length > 160) {
        return {
          kind: "failed",
          errorMessage: "Page title must be 160 characters or fewer."
        };
      }

      const workspaceSlug = cleanText(input.workspaceSlug);
      if (!workspaceSlug) {
        return {
          kind: "failed",
          errorMessage: "A workspace reference is required."
        };
      }

      const workspace = await dependencies.loadWorkspaceBySlug(workspaceSlug);
      if (!workspace || !workspace.sysId) {
        return {
          kind: "failed",
          errorMessage: "Workspace could not be found."
        };
      }

      const capability = dependencies.evaluateWorkspaceCapabilities(workspace);
      if (!capability.canEditWorkspace) {
        return {
          kind: "forbidden",
          errorMessage: "You do not have permission to create pages in this workspace."
        };
      }

      const retainedPages = await dependencies.listWorkspacePages(workspace.sysId);
      const parentPageSysId = cleanText(input.parentPageSysId);
      const parentPage = parentPageSysId ? retainedPages.find((page) => page.sysId === parentPageSysId) ?? null : null;

      if (parentPageSysId && !parentPage) {
        return {
          kind: "failed",
          errorMessage: "A valid parent page is required."
        };
      }

      if (parentPage && parentPage.workspaceSysId !== workspace.sysId) {
        return {
          kind: "failed",
          errorMessage: "A parent page must belong to the same workspace."
        };
      }

      const draft = createPageDraft(
        {
          title,
          workspaceSysId: workspace.sysId,
          parentPageSysId: parentPage?.sysId ?? null,
          parentPageWorkspaceSysId: parentPage?.workspaceSysId ?? null
        } satisfies PageDraftInput,
        retainedPages
      );

      const savedPage = await dependencies.savePage(draft);
      return {
        kind: "succeeded",
        page: savedPage
      };
    }
  };
}

export function createServiceNowPageCreationService() {
  const service = createPageCreationService({
    evaluateWorkspaceCapabilities: evaluateCurrentUserWorkspaceCapabilities,
    loadWorkspaceBySlug,
    listWorkspacePages,
    savePage
  });

  return {
    async createPage(input: PageCreationInput): Promise<PageCreationOutcome> {
      return service.createPage(input);
    }
  };
}
