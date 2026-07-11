import { GlideRecord, gs } from "@servicenow/glide";
import { DOCSERA_WORKSPACE_TABLE, type WorkspaceRecord } from "../workspaces/serverWorkspaceDomain.ts";
import { evaluateCurrentUserWorkspaceCapabilities } from "../workspaces/serviceNowWorkspaceCapabilities.ts";
import { mapWorkspaceRecord } from "../workspaces/serviceNowWorkspaceRecords.ts";
import { loadWorkspaceBySlug, listWorkspacePages } from "./serviceNowPageQueries.ts";
import { buildPageBodySaveRecord, buildPageContentSaveRecord, savePageRecord } from "./serviceNowPagePersistence.ts";
import type { PageContentJson, PageRecord } from "./serverPageDomain.ts";

type PageBodySaveInput = {
  workspaceSlug?: string;
  workspaceSysId?: string;
  pageSysId?: string;
  pageSlug?: string;
  draftBodyText?: string | null;
  draftContentJson?: unknown;
  expectedRevision?: number | null;
};

type PageBodySaveOutcome =
  | {
      kind: "failed";
      errorMessage: string;
      status: 400 | 404;
    }
  | {
      kind: "forbidden";
      errorMessage: string;
    }
  | {
      kind: "conflict";
      currentRevision: number;
      errorMessage: string;
    }
  | {
      kind: "succeeded";
      page: PageRecord;
    };

type PageBodySaveDependencies = {
  loadWorkspaceBySlug: (workspaceSlug: string) => Awaitable<WorkspaceRecord | null>;
  loadWorkspaceBySysId: (workspaceSysId: string) => Awaitable<WorkspaceRecord | null>;
  evaluateWorkspaceCapabilities: (workspace: WorkspaceRecord) => {
    canAdminWorkspace: boolean;
    canEditWorkspace: boolean;
    canManageWorkspaceMembers: boolean;
    canViewWorkspace: boolean;
  };
  listWorkspacePages: (workspaceSysId: string) => Promise<PageRecord[]>;
  savePage: (page: PageRecord) => Promise<PageRecord>;
};

type Awaitable<T> = T | Promise<T>;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isObjectLike(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function logUnexpectedPageSaveError(error: unknown, context: Record<string, unknown>) {
  const message = cleanText(error instanceof Error ? error.message : error) || "Unknown page save failure.";
  const stack = error instanceof Error ? cleanText(error.stack) : "";
  gs.error(
    `[Docsera page save] ${JSON.stringify({
      context,
      message,
      stack: stack || undefined
    })}`
  );
}

function loadWorkspaceBySysId(workspaceSysId: string): Promise<WorkspaceRecord | null> {
  const sysId = cleanText(workspaceSysId);
  if (!sysId) {
    return Promise.resolve(null);
  }

  const record = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
  if (!record.get("sys_id", sysId)) {
    return Promise.resolve(null);
  }

  return Promise.resolve(mapWorkspaceRecord(record));
}

function findPageByReference(pages: PageRecord[], reference: PageBodySaveInput): PageRecord | null {
  const pageSysId = cleanText(reference.pageSysId);
  const pageSlug = cleanText(reference.pageSlug).toLowerCase();

  if (pageSysId) {
    const page = pages.find((candidate) => cleanText(candidate.sysId) === pageSysId) ?? null;
    if (!page) {
      return null;
    }

    if (pageSlug && cleanText(page.draftSlugNormalized || page.draftSlug).toLowerCase() !== pageSlug) {
      return null;
    }

    return page;
  }

  if (!pageSlug) {
    return null;
  }

  return (
    pages.find((candidate) => {
      const candidateSlug = cleanText(candidate.draftSlugNormalized || candidate.draftSlug).toLowerCase();
      return candidateSlug === pageSlug;
    }) ?? null
  );
}

export function createPageBodySaveService(dependencies: PageBodySaveDependencies) {
  return {
    async savePageBody(input: PageBodySaveInput): Promise<PageBodySaveOutcome> {
      const workspaceSlug = cleanText(input.workspaceSlug);
      const workspaceSysId = cleanText(input.workspaceSysId);
      const pageSysId = cleanText(input.pageSysId);
      const pageSlug = cleanText(input.pageSlug);

      if (!workspaceSlug && !workspaceSysId) {
        return {
          kind: "failed",
          errorMessage: "A workspace reference is required.",
          status: 400
        };
      }

      if (!pageSysId && !pageSlug) {
        return {
          kind: "failed",
          errorMessage: "A page reference is required.",
          status: 400
        };
      }

      const workspace =
        workspaceSysId && typeof dependencies.loadWorkspaceBySysId === "function"
          ? await dependencies.loadWorkspaceBySysId(workspaceSysId)
          : workspaceSlug
            ? await dependencies.loadWorkspaceBySlug(workspaceSlug)
            : null;

      if (!workspace || !workspace.sysId) {
        return {
          kind: "failed",
          errorMessage: "Workspace could not be found.",
          status: 404
        };
      }

      if (workspaceSlug && workspace.slug !== workspaceSlug) {
        return {
          kind: "failed",
          errorMessage: "Workspace could not be found.",
          status: 404
        };
      }

      const capability = dependencies.evaluateWorkspaceCapabilities(workspace);
      if (!capability.canEditWorkspace && !capability.canAdminWorkspace) {
        return {
          kind: "forbidden",
          errorMessage: "You do not have permission to edit page bodies in this workspace."
        };
      }

      const pages = await dependencies.listWorkspacePages(workspace.sysId);
      const page = findPageByReference(pages, input);
      if (!page) {
        return {
          kind: "failed",
          errorMessage: "Page could not be found.",
          status: 404
        };
      }

      if (cleanText(page.workspaceSysId) !== workspace.sysId) {
        return {
          kind: "failed",
          errorMessage: "Page could not be found in this workspace.",
          status: 400
        };
      }
      if (pageSysId && cleanText(page.sysId) !== pageSysId) {
        return {
          kind: "failed",
          errorMessage: "Page could not be found in this workspace.",
          status: 400
        };
      }

      const currentRevision = Number.isSafeInteger(Number(page.draftRevision)) ? Number(page.draftRevision) : 0;
      const expectedRevision = Number(input.expectedRevision);
      if (Number.isSafeInteger(expectedRevision) && expectedRevision >= 0 && expectedRevision !== currentRevision) {
        return {
          kind: "conflict",
          currentRevision,
          errorMessage: "This page has a newer saved draft. Reload before saving again."
        };
      }

      let nextPage: PageRecord;
      try {
        if (input.draftContentJson !== undefined) {
          if (!isObjectLike(input.draftContentJson)) {
            return {
              kind: "failed",
              errorMessage: "The stored page content does not use a supported document envelope.",
              status: 400
            };
          }

          nextPage = buildPageContentSaveRecord(page, input.draftContentJson as PageContentJson, currentRevision + 1);
        } else {
          nextPage = buildPageBodySaveRecord(page, input.draftBodyText ?? "", currentRevision + 1);
        }
      } catch (error) {
        return {
          kind: "failed",
          errorMessage: cleanText(error instanceof Error ? error.message : error) || "The page document is invalid.",
          status: 400
        };
      }

      const savedPage = await dependencies.savePage(nextPage);

      return {
        kind: "succeeded",
        page: savedPage
      };
    }
  };
}

export function createServiceNowPageBodySaveService() {
  const service = createPageBodySaveService({
    evaluateWorkspaceCapabilities: evaluateCurrentUserWorkspaceCapabilities,
    loadWorkspaceBySlug,
    loadWorkspaceBySysId,
    listWorkspacePages,
    savePage: savePageRecord
  });

  return {
    async savePageBody(input: PageBodySaveInput): Promise<PageBodySaveOutcome> {
      return service.savePageBody(input);
    }
  };
}
