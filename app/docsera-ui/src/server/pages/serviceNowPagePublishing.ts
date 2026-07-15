import { GlideDateTime, GlideRecord, gs } from "@servicenow/glide";
import { createServiceNowPageEditLockService } from "../page-locks/serviceNowPageEditLocks.ts";
import type { PageEditLockResult } from "../page-locks/serverPageEditLockDomain.ts";
import { DOCSERA_WORKSPACE_TABLE, type WorkspaceRecord } from "../workspaces/serverWorkspaceDomain.ts";
import { evaluateCurrentUserWorkspaceCapabilities } from "../workspaces/serviceNowWorkspaceCapabilities.ts";
import { mapWorkspaceRecord } from "../workspaces/serviceNowWorkspaceRecords.ts";
import { loadWorkspaceBySlug, listWorkspacePages } from "./serviceNowPageQueries.ts";
import { buildPublishedPageRecord, savePublishedPageRecord } from "./serviceNowPagePersistence.ts";
import type { PageRecord } from "./serverPageDomain.ts";
import { PAGE_PUBLICATION_STATES, validatePageSettingsSlug } from "./serverPageDomain.ts";

type Awaitable<T> = T | Promise<T>;

type PagePublishInput = {
  workspaceSlug?: string;
  workspaceSysId?: string;
  pageSysId?: string;
  pageSlug?: string;
  lockToken?: string;
  expectedRevision?: unknown;
};

type PagePublishOutcome =
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
      kind: "conflict";
      currentRevision: number;
      errorMessage: string;
    }
  | {
      kind: "lock_lost";
      errorMessage: string;
    }
  | {
      kind: "succeeded";
      page: PageRecord;
    };

type PagePublishDependencies = {
  currentTimestamp: () => string;
  evaluateWorkspaceCapabilities: (workspace: WorkspaceRecord) => {
    canAdminWorkspace: boolean;
    canEditWorkspace: boolean;
    canManageWorkspaceMembers: boolean;
    canViewWorkspace: boolean;
  };
  getCurrentUser: () => {
    displayName: string | null;
    sysId: string;
  };
  loadWorkspaceBySlug: (workspaceSlug: string) => Awaitable<WorkspaceRecord | null>;
  loadWorkspaceBySysId: (workspaceSysId: string) => Awaitable<WorkspaceRecord | null>;
  listWorkspacePages: (workspaceSysId: string) => Promise<PageRecord[]>;
  publishPage: (page: PageRecord, expectedRevision: number) => Promise<PageRecord | null>;
  touchPageEditLock: (input: {
    lockToken?: string;
    pageSlug?: string;
    pageSysId?: string;
    workspaceSlug?: string;
    workspaceSysId?: string;
  }) => Promise<PageEditLockResult>;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

function findPageByReference(pages: PageRecord[], reference: PagePublishInput): PageRecord | null {
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
    pages.find((candidate) => cleanText(candidate.draftSlugNormalized || candidate.draftSlug).toLowerCase() === pageSlug) ??
    null
  );
}

function isDocumentValidationFailure(error: unknown): boolean {
  const message = cleanText(error instanceof Error ? error.message : error).toLowerCase();
  return (
    message.includes("stored page content") ||
    message.includes("document envelope") ||
    message.includes("valid json") ||
    message.includes("unsupported document") ||
    message.includes("valid tiptap document")
  );
}

function validatePublishableAncestry(page: PageRecord, pages: PageRecord[]) {
  const pagesBySysId = new Map<string, PageRecord>();
  for (const candidate of pages) {
    const candidateSysId = cleanText(candidate.sysId);
    if (candidateSysId) {
      pagesBySysId.set(candidateSysId, candidate);
    }
  }

  const visitedAncestors = new Set<string>();
  let ancestorSysId = cleanText(page.parentPageSysId);

  while (ancestorSysId) {
    if (visitedAncestors.has(ancestorSysId)) {
      return {
        valid: false,
        errorMessage: "This page cannot be published until all ancestor pages are published."
      };
    }

    visitedAncestors.add(ancestorSysId);
    const ancestor = pagesBySysId.get(ancestorSysId);
    if (!ancestor) {
      return {
        valid: false,
        errorMessage: "This page cannot be published until all ancestor pages are published."
      };
    }

    if (
      ancestor.publicationState !== PAGE_PUBLICATION_STATES.published &&
      ancestor.publicationState !== PAGE_PUBLICATION_STATES.publishedWithUnpublishedChanges
    ) {
      return {
        valid: false,
        errorMessage: "This page cannot be published until all ancestor pages are published."
      };
    }

    ancestorSysId = cleanText(ancestor.parentPageSysId);
  }

  return {
    valid: true,
    errorMessage: ""
  };
}

export function createPagePublishService(dependencies: PagePublishDependencies) {
  return {
    async publishPage(input: PagePublishInput): Promise<PagePublishOutcome> {
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

      const expectedRevision = Number(input.expectedRevision);
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
        return {
          kind: "failed",
          errorMessage: "A non-negative expected draft revision is required.",
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
          errorMessage: "You do not have permission to publish pages in this workspace."
        };
      }

      let lockResult: PageEditLockResult;
      try {
        lockResult = await dependencies.touchPageEditLock({
          lockToken: cleanText(input.lockToken),
          pageSlug,
          pageSysId,
          workspaceSlug,
          workspaceSysId: workspace.sysId
        });
      } catch (error) {
        if (isDocumentValidationFailure(error)) {
          return {
            kind: "failed",
            errorMessage: "The current draft content cannot be published.",
            status: 400
          };
        }

        throw error;
      }
      if (lockResult.kind === "failed") {
        return lockResult.status === 403
          ? {
              kind: "forbidden",
              errorMessage: lockResult.errorMessage
            }
          : {
              kind: "failed",
              errorMessage: lockResult.errorMessage,
              status: lockResult.status
            };
      }
      if (lockResult.kind === "lost") {
        return {
          kind: "lock_lost",
          errorMessage: lockResult.errorMessage
        };
      }
      if (lockResult.kind !== "held") {
        return {
          kind: "lock_lost",
          errorMessage: "This edit session ended and unsaved changes were not published."
        };
      }

      let pages: PageRecord[];
      try {
        pages = await dependencies.listWorkspacePages(workspace.sysId);
      } catch (error) {
        if (isDocumentValidationFailure(error)) {
          return {
            kind: "failed",
            errorMessage: "The current draft content cannot be published.",
            status: 400
          };
        }

        throw error;
      }

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

      const currentRevision = Number.isSafeInteger(Number(page.draftRevision)) ? Number(page.draftRevision) : 0;
      if (currentRevision !== expectedRevision) {
        return {
          kind: "conflict",
          currentRevision,
          errorMessage: "This page has a newer saved draft. Reload before publishing again."
        };
      }

      const slugValidation = validatePageSettingsSlug(page.draftSlug, pages, workspace.sysId, page.sysId);
      if (!slugValidation.valid) {
        return {
          kind: "failed",
          errorMessage: slugValidation.error,
          status: 400
        };
      }

      const ancestryValidation = validatePublishableAncestry(page, pages);
      if (!ancestryValidation.valid) {
        return {
          kind: "failed",
          errorMessage: ancestryValidation.errorMessage,
          status: 400
        };
      }

      const currentUser = dependencies.getCurrentUser();
      if (!cleanText(currentUser.sysId)) {
        return {
          kind: "forbidden",
          errorMessage: "You do not have permission to publish pages in this workspace."
        };
      }

      let nextPage: PageRecord;
      try {
        nextPage = buildPublishedPageRecord(page, {
          publishedAt: dependencies.currentTimestamp(),
          publishedByDisplayName: currentUser.displayName,
          publishedBySysId: currentUser.sysId
        });
      } catch {
        return {
          kind: "failed",
          errorMessage: "The current draft content cannot be published.",
          status: 400
        };
      }

      const savedPage = await dependencies.publishPage(nextPage, expectedRevision);
      if (!savedPage) {
        return {
          kind: "conflict",
          currentRevision,
          errorMessage: "This page has a newer saved draft. Reload before publishing again."
        };
      }

      return {
        kind: "succeeded",
        page: savedPage
      };
    }
  };
}

export function createServiceNowPagePublishService() {
  const service = createPagePublishService({
    currentTimestamp: () => new GlideDateTime().getValue(),
    evaluateWorkspaceCapabilities: evaluateCurrentUserWorkspaceCapabilities,
    getCurrentUser: () => ({
      displayName: cleanText(gs.getUserDisplayName()) || cleanText(gs.getUserName()) || null,
      sysId: cleanText(gs.getUserID())
    }),
    loadWorkspaceBySlug,
    loadWorkspaceBySysId,
    listWorkspacePages,
    publishPage: savePublishedPageRecord,
    touchPageEditLock: createServiceNowPageEditLockService().touchPageEditLock
  });

  return {
    async publishPage(input: PagePublishInput): Promise<PagePublishOutcome> {
      return service.publishPage(input);
    }
  };
}
