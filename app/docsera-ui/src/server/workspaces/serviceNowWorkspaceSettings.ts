import { GlideRecord } from "@servicenow/glide";
import {
  DOCSERA_WORKSPACE_TABLE,
  applyWorkspaceSettings,
  type WorkspaceRecord,
  type WorkspaceSettingsInput
} from "./serverWorkspaceDomain.ts";
import { evaluateCurrentUserWorkspaceCapabilities } from "./serviceNowWorkspaceCapabilities.ts";
import { mapWorkspaceRecord } from "./serviceNowWorkspaceRecords.ts";

type Awaitable<T> = T | Promise<T>;

export type WorkspaceSettingsDependencies = {
  evaluateWorkspaceCapabilities: (workspace: WorkspaceRecord) => {
    canAdminWorkspace: boolean;
    canEditWorkspace: boolean;
    canManageWorkspaceMembers: boolean;
    canViewWorkspace: boolean;
  };
  loadWorkspaceBySlug: (workspaceSlug: string) => Awaitable<WorkspaceRecord | null>;
  loadWorkspaceBySysId: (workspaceSysId: string) => Awaitable<WorkspaceRecord | null>;
  saveWorkspaceSettings: (workspace: WorkspaceRecord) => Awaitable<WorkspaceRecord | null>;
};

export type WorkspaceSettingsOutcome =
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
      workspace: WorkspaceRecord;
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

function loadWorkspaceBySlug(workspaceSlug: string): Promise<WorkspaceRecord | null> {
  const slug = cleanText(workspaceSlug);
  if (!slug) {
    return Promise.resolve(null);
  }

  const record = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
  record.addQuery("workspace_slug", slug);
  record.setLimit(1);
  record.query();

  if (!record.next()) {
    return Promise.resolve(null);
  }

  return Promise.resolve(mapWorkspaceRecord(record));
}

function saveWorkspaceSettingsRecord(workspace: WorkspaceRecord): WorkspaceRecord | null {
  const sysId = cleanText(workspace.sysId);
  if (!sysId) {
    return null;
  }

  const record = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
  if (!record.get("sys_id", sysId)) {
    return null;
  }

  record.setValue("name", workspace.name);
  record.setValue("short_description", workspace.shortDescription ?? "");
  record.setValue("toc_default_visible", workspace.layout.tocVisibleByDefault);
  record.setValue("icon_type", workspace.icon.type);
  record.setValue("icon_key", workspace.icon.key);
  record.setValue("icon_label", workspace.icon.label);
  record.setValue("icon_asset_path", workspace.icon.assetPath ?? "");

  const updatedSysId = cleanText(record.update());
  if (!updatedSysId) {
    return null;
  }

  const refreshed = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
  if (!refreshed.get("sys_id", sysId)) {
    return null;
  }

  return mapWorkspaceRecord(refreshed);
}

export function createWorkspaceSettingsService(dependencies: WorkspaceSettingsDependencies) {
  return {
    async saveWorkspaceSettings(input: WorkspaceSettingsInput): Promise<WorkspaceSettingsOutcome> {
      const workspaceSlug = cleanText(input.workspaceSlug);
      const workspaceSysId = cleanText(input.workspaceSysId);
      if (!workspaceSlug && !workspaceSysId) {
        return {
          kind: "failed",
          errorMessage: "A workspace reference is required.",
          status: 400
        };
      }

      const currentWorkspace =
        workspaceSysId && typeof dependencies.loadWorkspaceBySysId === "function"
          ? await dependencies.loadWorkspaceBySysId(workspaceSysId)
          : workspaceSlug
            ? await dependencies.loadWorkspaceBySlug(workspaceSlug)
            : null;

      if (!currentWorkspace || !currentWorkspace.sysId) {
        return {
          kind: "failed",
          errorMessage: "Workspace could not be found.",
          status: 404
        };
      }

      const settings = applyWorkspaceSettings(currentWorkspace, input);
      if (!settings.valid) {
        const error = (settings as { valid: false; error: string }).error;
        return {
          kind: "failed",
          errorMessage: error,
          status: error === "Workspace could not be found." ? 404 : 400
        };
      }

      const capability = dependencies.evaluateWorkspaceCapabilities(currentWorkspace);
      if (!capability.canAdminWorkspace) {
        return {
          kind: "forbidden",
          errorMessage: "You do not have permission to manage this workspace."
        };
      }

      const savedWorkspace = await dependencies.saveWorkspaceSettings(settings.workspace);
      if (!savedWorkspace) {
        return {
          kind: "failed",
          errorMessage: "Something went wrong while saving workspace settings. Your changes were not saved. Please try again.",
          status: 500
        };
      }

      return {
        kind: "succeeded",
        workspace: savedWorkspace
      };
    }
  };
}

export function createServiceNowWorkspaceSettingsService() {
  return createWorkspaceSettingsService({
    evaluateWorkspaceCapabilities: evaluateCurrentUserWorkspaceCapabilities,
    loadWorkspaceBySlug,
    loadWorkspaceBySysId,
    saveWorkspaceSettings: saveWorkspaceSettingsRecord
  });
}
