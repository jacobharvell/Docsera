import { evaluateCurrentUserWorkspaceCapabilities } from "../workspaces/serviceNowWorkspaceCapabilities.ts";
import { type WorkspaceRecord } from "../workspaces/serverWorkspaceDomain.ts";
import { listWorkspacePages, loadWorkspaceBySlug } from "./serviceNowPageQueries.ts";
import type { PageRecord } from "./serverPageDomain.ts";
import { parseServerDocument } from "./serverEditorDocument.ts";

type PageListingInput = {
  mode?: "edit" | "live";
  workspaceSlug: string;
};

type ProjectedLivePageRecord = {
  active: boolean;
  draftBodyText: PageRecord["publishedBodyText"];
  draftContentJson: PageRecord["publishedContentJson"];
  draftSlug: string;
  draftSlugNormalized: string;
  draftTitle: string;
  parentPageSysId: string | null;
  publicationState: "published";
  publishedBodyText: PageRecord["publishedBodyText"];
  publishedContentJson: PageRecord["publishedContentJson"];
  publishedSlug: string;
  publishedSlugNormalized: string;
  publishedTitle: string;
  siblingOrder: number;
  sysId?: string;
  workspaceSysId: string;
};

type PageListingRecord = PageRecord | ProjectedLivePageRecord;

type Awaitable<T> = T | Promise<T>;

type PageListingDependencies = {
  evaluateWorkspaceCapabilities: (workspace: WorkspaceRecord) => {
    canAdminWorkspace: boolean;
    canEditWorkspace: boolean;
    canManageWorkspaceMembers: boolean;
    canViewWorkspace: boolean;
  };
  loadWorkspaceBySlug: (workspaceSlug: string) => Awaitable<WorkspaceRecord | null>;
  listWorkspacePages: (workspaceSysId: string) => Promise<PageRecord[]>;
};

type PageListingOutcome =
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
      kind: "succeeded";
      mode: "edit" | "live";
      workspace: WorkspaceRecord;
      pages: PageListingRecord[];
    };

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function resolveListingMode(value: unknown): "edit" | "live" {
  return cleanText(value).toLowerCase() === "edit" ? "edit" : "live";
}

function projectPublishedPage(page: PageRecord): ProjectedLivePageRecord | null {
  if (page.publicationState === "draft") {
    return null;
  }

  const projectedTitle = cleanText(page.publishedTitle);
  const projectedSlug = cleanText(page.publishedSlug);
  const projectedSlugNormalized = cleanText(page.publishedSlugNormalized || projectedSlug).toLowerCase();

  if (!projectedTitle || !projectedSlug || !projectedSlugNormalized || !page.publishedContentJson) {
    return null;
  }

  try {
    parseServerDocument(page.publishedContentJson);
  } catch {
    return null;
  }

  return {
    active: page.active,
    draftBodyText: page.publishedBodyText,
    draftContentJson: page.publishedContentJson,
    draftSlug: projectedSlug,
    draftSlugNormalized: projectedSlugNormalized,
    draftTitle: projectedTitle,
    parentPageSysId: page.parentPageSysId,
    publicationState: "published",
    publishedBodyText: page.publishedBodyText,
    publishedContentJson: page.publishedContentJson,
    publishedSlug: projectedSlug,
    publishedSlugNormalized: projectedSlugNormalized,
    publishedTitle: projectedTitle,
    siblingOrder: page.siblingOrder,
    sysId: page.sysId,
    workspaceSysId: page.workspaceSysId
  };
}

export function createPageListingService(dependencies: PageListingDependencies) {
  return {
    async listPages(input: PageListingInput): Promise<PageListingOutcome> {
      const workspaceSlug = cleanText(input.workspaceSlug);
      const mode = resolveListingMode(input.mode);
      if (!workspaceSlug) {
        return {
          kind: "failed",
          errorMessage: "A workspace reference is required.",
          status: 400
        };
      }

      const workspace = await dependencies.loadWorkspaceBySlug(workspaceSlug);
      if (!workspace || !workspace.sysId) {
        return {
          kind: "failed",
          errorMessage: "Workspace could not be found.",
          status: 404
        };
      }

      const capability = dependencies.evaluateWorkspaceCapabilities(workspace);
      if (mode === "edit" && !capability.canEditWorkspace && !capability.canAdminWorkspace) {
        return {
          kind: "forbidden",
          errorMessage: "You do not have permission to view draft pages in this workspace."
        };
      }

      if (mode === "live" && !capability.canViewWorkspace) {
        return {
          kind: "forbidden",
          errorMessage: "You do not have permission to view pages in this workspace."
        };
      }

      const pages = await dependencies.listWorkspacePages(workspace.sysId);
      const visiblePages: PageListingRecord[] =
        mode === "edit"
          ? pages
          : pages
              .map((page) => projectPublishedPage(page))
              .filter((page): page is ProjectedLivePageRecord => page !== null);

      return {
        kind: "succeeded",
        mode,
        workspace,
        pages: visiblePages
      };
    }
  };
}

export function createServiceNowPageListingService() {
  const service = createPageListingService({
    evaluateWorkspaceCapabilities: evaluateCurrentUserWorkspaceCapabilities,
    loadWorkspaceBySlug,
    listWorkspacePages: (workspaceSysId: string) => listWorkspacePages(workspaceSysId)
  });

  return {
    async listPages(input: PageListingInput): Promise<PageListingOutcome> {
      return service.listPages(input);
    }
  };
}
