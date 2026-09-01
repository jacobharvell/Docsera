import { GlideRecord } from "@servicenow/glide";
import {
  buildWorkspaceListItem,
  buildWorkspaceListResult,
  type WorkspaceCapabilityResult,
  type WorkspaceListItem,
  type WorkspaceListQuery,
  type WorkspaceListResult,
  type WorkspaceRecord
} from "./serverWorkspaceDomain.ts";
import { canCurrentUserCreateWorkspaces, evaluateCurrentUserWorkspaceCapabilities } from "./serviceNowWorkspaceCapabilities.ts";
import { mapWorkspaceRecord } from "./serviceNowWorkspaceRecords.ts";

const DOCSERA_WORKSPACE_TABLE = "x_82900_docsera_workspace";

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function queryActiveWorkspaces(): WorkspaceRecord[] {
  const workspaces = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
  workspaces.addQuery("status", "active");
  workspaces.orderBy("name");
  workspaces.query();

  const results: WorkspaceRecord[] = [];
  while (workspaces.next()) {
    results.push(mapWorkspaceRecord(workspaces));
  }

  return results;
}

function createCapabilityMap(workspaces: WorkspaceRecord[]): Map<string, WorkspaceCapabilityResult> {
  const capabilitiesBySlug = new Map<string, WorkspaceCapabilityResult>();

  for (const workspace of workspaces) {
    capabilitiesBySlug.set(workspace.slug, evaluateCurrentUserWorkspaceCapabilities(workspace));
  }

  return capabilitiesBySlug;
}

function buildAccessibleWorkspaceView(workspace: WorkspaceRecord): WorkspaceListItem {
  return buildWorkspaceListItem(workspace, evaluateCurrentUserWorkspaceCapabilities(workspace));
}

export function createServiceNowWorkspaceCatalogService() {
  return {
    async getWorkspace(workspaceSlug: string): Promise<WorkspaceListItem | null> {
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

      const workspace = mapWorkspaceRecord(record);
      return buildAccessibleWorkspaceView(workspace);
    },

    async listWorkspaces(query: WorkspaceListQuery = {}): Promise<WorkspaceListResult> {
      const workspaces = queryActiveWorkspaces();
      const capabilitiesBySlug = createCapabilityMap(workspaces);
      return buildWorkspaceListResult(workspaces, capabilitiesBySlug, query, canCurrentUserCreateWorkspaces());
    }
  };
}
