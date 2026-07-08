import { GlideRecord, gs } from "@servicenow/glide";
import { DOCSERA_WORKSPACE_TABLE, type WorkspaceRecord } from "../workspaces/serverWorkspaceDomain.ts";
import { evaluateCurrentUserWorkspaceCapabilities } from "../workspaces/serviceNowWorkspaceCapabilities.ts";
import { mapWorkspaceRecord } from "../workspaces/serviceNowWorkspaceRecords.ts";
import { loadWorkspaceBySlug, listWorkspacePages } from "./serviceNowPageQueries.ts";
import { deletePageRecord, savePageRecord } from "./serviceNowPagePersistence.ts";
import type { PageRecord } from "./serverPageDomain.ts";
import {
  collectPageSubtreeSysIds,
  pickNextVisiblePageAfterDelete,
  validatePageSettingsSlug,
  validatePageSettingsTitle
} from "./serverPageDomain.ts";

type Awaitable<T> = T | Promise<T>;

type PageSettingsInput = {
  pageSysId?: string;
  slug?: string;
  title?: string;
  workspaceSlug?: string;
  workspaceSysId?: string;
};

type PageDeleteInput = {
  pageSysId?: string;
  workspaceSlug?: string;
  workspaceSysId?: string;
};

type PageSettingsDependencies = {
  evaluateWorkspaceCapabilities: (workspace: WorkspaceRecord) => {
    canAdminWorkspace: boolean;
    canEditWorkspace: boolean;
    canManageWorkspaceMembers: boolean;
    canViewWorkspace: boolean;
  };
  loadWorkspaceBySlug: (workspaceSlug: string) => Awaitable<WorkspaceRecord | null>;
  loadWorkspaceBySysId: (workspaceSysId: string) => Awaitable<WorkspaceRecord | null>;
  listWorkspacePages: (workspaceSysId: string, options?: { activeOnly?: boolean }) => Promise<PageRecord[]>;
  savePage: (page: PageRecord) => Promise<PageRecord>;
  deletePage: (pageSysId: string) => Promise<void>;
};

type PageSettingsOutcome =
  | {
      kind: "failed";
      errorMessage: string;
      status: 400 | 404 | 500;
    }
  | {
      kind: "forbidden";
      errorMessage: string;
    }
  | {
      kind: "succeeded";
      page: PageRecord;
    };

type PageDeleteOutcome =
  | {
      kind: "failed";
      errorMessage: string;
      status: 400 | 404 | 500;
    }
  | {
      kind: "forbidden";
      errorMessage: string;
    }
  | {
      kind: "succeeded";
      deletedPageSysId: string;
      nextPageSysId: string;
    };

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function logUnexpectedPageSettingsError(error: unknown, context: Record<string, unknown>) {
  const message = cleanText(error instanceof Error ? error.message : error) || "Unknown page settings failure.";
  const stack = error instanceof Error ? cleanText(error.stack) : "";
  gs.error(
    `[Docsera page settings] ${JSON.stringify({
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
  if (!record.get(sysId)) {
    return Promise.resolve(null);
  }

  return Promise.resolve(mapWorkspaceRecord(record));
}

function findPageBySysId(pages: PageRecord[], pageSysId: string): PageRecord | null {
  const normalizedPageSysId = cleanText(pageSysId);
  if (!normalizedPageSysId) {
    return null;
  }

  return pages.find((candidate) => cleanText(candidate.sysId) === normalizedPageSysId) ?? null;
}

function normalizePageSettingsResult(page: PageRecord): Promise<PageRecord> {
  return savePageRecord(page);
}

export function createPageSettingsService(dependencies: PageSettingsDependencies) {
  return {
    async savePageSettings(input: PageSettingsInput): Promise<PageSettingsOutcome> {
      const workspaceSlug = cleanText(input.workspaceSlug);
      const workspaceSysId = cleanText(input.workspaceSysId);
      const pageSysId = cleanText(input.pageSysId);
      const title = cleanText(input.title);
      const slug = cleanText(input.slug);

      if (!workspaceSlug && !workspaceSysId) {
        return {
          kind: "failed",
          errorMessage: "A workspace reference is required.",
          status: 400
        };
      }

      if (!pageSysId) {
        return {
          kind: "failed",
          errorMessage: "A page reference is required.",
          status: 400
        };
      }

      if (!title) {
        return {
          kind: "failed",
          errorMessage: "Page title is required.",
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
          errorMessage: "You do not have permission to edit page settings in this workspace."
        };
      }

      const pages = await dependencies.listWorkspacePages(workspace.sysId);
      const currentPage = findPageBySysId(pages, pageSysId);
      if (!currentPage) {
        return {
          kind: "failed",
          errorMessage: "Page could not be found.",
          status: 404
        };
      }

      if (cleanText(currentPage.workspaceSysId) !== workspace.sysId) {
        return {
          kind: "failed",
          errorMessage: "Page could not be found in this workspace.",
          status: 400
        };
      }

      const titleValidation = validatePageSettingsTitle(title);
      if (!titleValidation.valid) {
        return {
          kind: "failed",
          errorMessage: titleValidation.error,
          status: 400
        };
      }

      const slugValidation = validatePageSettingsSlug(slug, pages, workspace.sysId, currentPage.sysId);
      if (!slugValidation.valid) {
        return {
          kind: "failed",
          errorMessage: slugValidation.error,
          status: 400
        };
      }

      const savedPage = await dependencies.savePage({
        ...currentPage,
        draftTitle: titleValidation.value,
        draftSlug: slugValidation.normalizedValue,
        draftSlugNormalized: slugValidation.normalizedValue
      });

      return {
        kind: "succeeded",
        page: savedPage
      };
    },

    async deletePage(input: PageDeleteInput): Promise<PageDeleteOutcome> {
      const workspaceSlug = cleanText(input.workspaceSlug);
      const workspaceSysId = cleanText(input.workspaceSysId);
      const pageSysId = cleanText(input.pageSysId);

      if (!workspaceSlug && !workspaceSysId) {
        return {
          kind: "failed",
          errorMessage: "A workspace reference is required.",
          status: 400
        };
      }

      if (!pageSysId) {
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
          errorMessage: "You do not have permission to delete pages in this workspace."
        };
      }

      const pages = await dependencies.listWorkspacePages(workspace.sysId, { activeOnly: false });
      const currentPage = findPageBySysId(pages, pageSysId);
      if (!currentPage) {
        return {
          kind: "failed",
          errorMessage: "Page could not be found.",
          status: 404
        };
      }

      if (cleanText(currentPage.workspaceSysId) !== workspace.sysId) {
        return {
          kind: "failed",
          errorMessage: "Page could not be found in this workspace.",
          status: 400
        };
      }

      const subtreeIds = collectPageSubtreeSysIds(pages, currentPage.sysId);
      const subtreePages = pages.filter((page) => subtreeIds.includes(cleanText(page.sysId)));
      const nextPageSysId = pickNextVisiblePageAfterDelete(pages, currentPage.sysId);
      const deleteTargets = subtreePages.slice().reverse();

      for (const page of deleteTargets) {
        if (!page.sysId) {
          continue;
        }

        await dependencies.deletePage(page.sysId);
      }

      const remainingPages = await dependencies.listWorkspacePages(workspace.sysId, { activeOnly: false });
      const remainingSubtreeIds = remainingPages
        .map((page) => cleanText(page.sysId))
        .filter((candidate) => subtreeIds.includes(candidate));
      if (remainingSubtreeIds.length > 0) {
        return {
          kind: "failed",
          errorMessage: "Something went wrong while deleting the page. The page was not deleted. Please try again.",
          status: 500
        };
      }

      return {
        kind: "succeeded",
        deletedPageSysId: currentPage.sysId ?? pageSysId,
        nextPageSysId
      };
    }
  };
}

export function createServiceNowPageSettingsService() {
  const service = createPageSettingsService({
    evaluateWorkspaceCapabilities: evaluateCurrentUserWorkspaceCapabilities,
    loadWorkspaceBySlug,
    loadWorkspaceBySysId,
    listWorkspacePages,
    savePage: normalizePageSettingsResult,
    deletePage: deletePageRecord
  });

  return {
    async savePageSettings(input: PageSettingsInput): Promise<PageSettingsOutcome> {
      return service.savePageSettings(input);
    },

    async deletePage(input: PageDeleteInput): Promise<PageDeleteOutcome> {
      return service.deletePage(input);
    }
  };
}
