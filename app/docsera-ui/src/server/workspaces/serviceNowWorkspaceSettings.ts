import { GlideRecord } from "@servicenow/glide";
import {
  DOCSERA_WORKSPACE_TABLE,
  applyWorkspaceSettings,
  type WorkspaceRecord,
  type WorkspaceSettingsInput
} from "./serverWorkspaceDomain.ts";
import { evaluateCurrentUserWorkspaceCapabilities } from "./serviceNowWorkspaceCapabilities.ts";
import { createServiceNowWorkspaceIconService, type WorkspaceIconClaimResult } from "./serviceNowWorkspaceIcons.ts";
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
  claimWorkspaceSettingsIcon?: (assetKey: string, workspaceSysId: string) => WorkspaceIconClaimResult;
  restoreWorkspaceIconClaim?: (assetSysId: string, input?: { provisionRequestSysId?: string; workspaceSysId?: string }) => void;
  retireClaimedWorkspaceIcon?: (assetKey: string, workspaceSysId: string) => void;
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
  record.setValue("toc_default_visible", workspace.layout.tocVisible);
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

      const capability = dependencies.evaluateWorkspaceCapabilities(currentWorkspace);
      if (!capability.canAdminWorkspace) {
        return {
          kind: "forbidden",
          errorMessage: "You do not have permission to manage this workspace."
        };
      }

      const uploadedIconAssetKey =
        input.icon && typeof input.icon === "object" && input.icon.type === "uploaded" ? cleanText(input.icon.key) : "";
      let claimedUploadedIcon: Extract<WorkspaceIconClaimResult, { kind: "succeeded" }> | null = null;
      let settingsInput = input;

      if (uploadedIconAssetKey) {
        if (!dependencies.claimWorkspaceSettingsIcon || !dependencies.restoreWorkspaceIconClaim) {
          return {
            kind: "failed",
            errorMessage: "Uploaded workspace icon replacement is unavailable.",
            status: 500
          };
        }

        const claim = dependencies.claimWorkspaceSettingsIcon(uploadedIconAssetKey, currentWorkspace.sysId);
        if (claim.kind === "failed") {
          if (claim.status === 403) {
            return {
              kind: "forbidden",
              errorMessage: claim.errorMessage
            };
          }
          return {
            kind: "failed",
            errorMessage: claim.errorMessage,
            status: claim.status === 404 ? 404 : claim.status === 500 ? 500 : 400
          };
        }

        claimedUploadedIcon = claim;
        settingsInput = {
          ...input,
          icon: claim.icon
        };
      }

      const settings = applyWorkspaceSettings(currentWorkspace, settingsInput);
      if (!settings.valid) {
        if (claimedUploadedIcon) {
          dependencies.restoreWorkspaceIconClaim?.(claimedUploadedIcon.asset.sysId, { workspaceSysId: currentWorkspace.sysId });
        }
        const error = (settings as { valid: false; error: string }).error;
        return {
          kind: "failed",
          errorMessage: error,
          status: error === "Workspace could not be found." ? 404 : 400
        };
      }

      const savedWorkspace = await dependencies.saveWorkspaceSettings(settings.workspace);
      if (!savedWorkspace) {
        if (claimedUploadedIcon) {
          dependencies.restoreWorkspaceIconClaim?.(claimedUploadedIcon.asset.sysId, { workspaceSysId: currentWorkspace.sysId });
        }
        return {
          kind: "failed",
          errorMessage: "Something went wrong while saving workspace settings. Your changes were not saved. Please try again.",
          status: 500
        };
      }

      if (
        dependencies.retireClaimedWorkspaceIcon &&
        currentWorkspace.icon.type === "uploaded" &&
        cleanText(currentWorkspace.icon.key) &&
        cleanText(currentWorkspace.icon.key) !== cleanText(savedWorkspace.icon.key)
      ) {
        try {
          dependencies.retireClaimedWorkspaceIcon(currentWorkspace.icon.key, currentWorkspace.sysId);
        } catch {
          // Cleanup is best-effort after the authoritative workspace save.
        }
      }

      return {
        kind: "succeeded",
        workspace: savedWorkspace
      };
    }
  };
}

export function createServiceNowWorkspaceSettingsService() {
  const iconService = createServiceNowWorkspaceIconService();
  return createWorkspaceSettingsService({
    claimWorkspaceSettingsIcon: iconService.claimWorkspaceSettingsIcon,
    evaluateWorkspaceCapabilities: evaluateCurrentUserWorkspaceCapabilities,
    loadWorkspaceBySlug,
    loadWorkspaceBySysId,
    restoreWorkspaceIconClaim: iconService.restoreWorkspaceIconClaim,
    retireClaimedWorkspaceIcon: iconService.retireClaimedWorkspaceIcon,
    saveWorkspaceSettings: saveWorkspaceSettingsRecord
  });
}
