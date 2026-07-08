import { gs } from "@servicenow/glide";
import { type WorkspaceCapabilityResult, type WorkspaceRecord } from "../workspaces/serverWorkspaceDomain.ts";
import { evaluateCurrentUserWorkspaceCapabilities } from "../workspaces/serviceNowWorkspaceCapabilities.ts";
import { createPageDraft, type PageDraftInput, type PageRecord } from "./serverPageDomain.ts";
import { listWorkspacePages, loadWorkspaceBySlug } from "./serviceNowPageQueries.ts";
import { savePageRecord } from "./serviceNowPagePersistence.ts";

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
          parentPageWorkspaceSysId: parentPage?.workspaceSysId ?? null,
          active: true
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
    savePage: savePageRecord
  });

  return {
    async createPage(input: PageCreationInput): Promise<PageCreationOutcome> {
      return service.createPage(input);
    }
  };
}
