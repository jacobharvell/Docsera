import { evaluateCurrentUserWorkspaceCapabilities } from "../workspaces/serviceNowWorkspaceCapabilities.ts";
import { type WorkspaceRecord } from "../workspaces/serverWorkspaceDomain.ts";
import { listWorkspacePages, loadWorkspaceBySlug } from "./serviceNowPageQueries.ts";
import type { PageRecord } from "./serverPageDomain.ts";

type PageListingInput = {
  workspaceSlug: string;
};

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
      workspace: WorkspaceRecord;
      pages: PageRecord[];
    };

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function createPageListingService(dependencies: PageListingDependencies) {
  return {
    async listPages(input: PageListingInput): Promise<PageListingOutcome> {
      const workspaceSlug = cleanText(input.workspaceSlug);
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
      if (!capability.canEditWorkspace && !capability.canAdminWorkspace) {
        return {
          kind: "forbidden",
          errorMessage: "You do not have permission to view pages in this workspace."
        };
      }

      const pages = await dependencies.listWorkspacePages(workspace.sysId);
      return {
        kind: "succeeded",
        workspace,
        pages
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
