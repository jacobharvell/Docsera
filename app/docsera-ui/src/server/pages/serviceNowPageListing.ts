import { evaluateCurrentUserWorkspaceCapabilities } from "../workspaces/serviceNowWorkspaceCapabilities.ts";
import { type WorkspaceRecord } from "../workspaces/serverWorkspaceDomain.ts";
import { loadWorkspaceBySlug } from "./serviceNowPageQueries.ts";
import type { PageRecord } from "./serverPageDomain.ts";
import { createServiceNowWorkspaceChangeSetPersistenceService } from "../workspaces/serviceNowWorkspaceChangeSetPersistence.ts";

type PageListingInput = {
  mode?: "edit" | "live";
  workspaceSlug: string;
};

type PageListingRecord = PageRecord;

type Awaitable<T> = T | Promise<T>;

type PageListingDependencies = {
  evaluateWorkspaceCapabilities: (workspace: WorkspaceRecord) => {
    canAdminWorkspace: boolean;
    canEditWorkspace: boolean;
    canManageWorkspaceMembers: boolean;
    canViewWorkspace: boolean;
  };
  loadWorkspaceBySlug: (workspaceSlug: string) => Awaitable<WorkspaceRecord | null>;
  listPages: (workspace: WorkspaceRecord, mode: "edit" | "live") => Awaitable<PageRecord[]>;
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

      return {
        kind: "succeeded",
        mode,
        workspace,
        pages: await dependencies.listPages(workspace, mode)
      };
    }
  };
}

export function createServiceNowPageListingService() {
  const changeSetPersistence = createServiceNowWorkspaceChangeSetPersistenceService();
  const service = createPageListingService({
    evaluateWorkspaceCapabilities: evaluateCurrentUserWorkspaceCapabilities,
    loadWorkspaceBySlug,
    listPages: async (workspace, mode) => {
      const result = changeSetPersistence.listPages(workspace, mode);
      if (result.kind !== "succeeded") {
        throw new Error(result.errorMessage);
      }
      return result.pages;
    }
  });

  return {
    async listPages(input: PageListingInput): Promise<PageListingOutcome> {
      return service.listPages(input);
    }
  };
}
