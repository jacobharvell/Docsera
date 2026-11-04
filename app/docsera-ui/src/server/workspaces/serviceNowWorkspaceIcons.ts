import { GlideRecord, GlideSysAttachment, gs } from "@servicenow/glide";
import { DOCSERA_WORKSPACE_TABLE, type WorkspaceRecord } from "./serverWorkspaceDomain.ts";
import { evaluateCurrentUserWorkspaceCapabilities } from "./serviceNowWorkspaceCapabilities.ts";
import { mapWorkspaceRecord } from "./serviceNowWorkspaceRecords.ts";
import { validateWorkspaceIconImage, type WorkspaceIconImageMetadata } from "./serverWorkspaceIconImage.ts";

export const DOCSERA_WORKSPACE_ICON_ASSET_TABLE = "x_2300756_docsera_workspace_icon_asset";
export const WORKSPACE_ICON_FILE_ROUTE_PATH = "/api/x_2300756_docsera/docsera_runtime/workspaces/icons/file";

export type WorkspaceIconAssetRecord = WorkspaceIconImageMetadata & {
  assetKey: string;
  attachmentSysId: string;
  fileName: string;
  requestedBy: string;
  sizeBytes: number;
  state: "staged" | "cleaning" | "claimed" | "invalid";
  sysId: string;
  workspaceSysId: string;
  provisionRequestSysId: string;
};

export type WorkspaceIconAttachmentRecord = {
  contentType: string;
  fileName: string;
  mediaId: string;
  sizeBytes: number;
  tableName: string;
  tableSysId: string;
};

export type WorkspaceIconProvisionRequestRecord = {
  iconKey: string;
  iconType: "builtin" | "uploaded";
  state: "requested" | "processing" | "succeeded" | "failed";
  sysId: string;
  workspaceSysId: string;
};

type WorkspaceIconFailure = {
  errorMessage: string;
  kind: "failed";
  status: 400 | 403 | 404 | 413 | 415 | 500;
};

export type WorkspaceIconUploadResult =
  | {
      asset: {
        assetKey: string;
        contentType: WorkspaceIconImageMetadata["contentType"];
        fileName: string;
        height: number;
        sizeBytes: number;
        url: string;
        width: number;
      };
      kind: "succeeded";
    }
  | WorkspaceIconFailure;

export type WorkspaceIconClaimResult =
  | {
      asset: WorkspaceIconAssetRecord;
      icon: {
        assetPath: string;
        key: string;
        label: string;
        type: "uploaded";
      };
      kind: "succeeded";
    }
  | WorkspaceIconFailure;

export type WorkspaceIconFileResult =
  | {
      asset: WorkspaceIconAssetRecord;
      contentStream: unknown;
      contentType: WorkspaceIconImageMetadata["contentType"];
      kind: "succeeded";
    }
  | WorkspaceIconFailure;

export type WorkspaceIconServiceDependencies = {
  canCreateWorkspaces: () => boolean;
  createAsset: (input: { assetKey: string; requestedBy: string }) => string | null;
  deleteAsset: (assetSysId: string) => void;
  deleteAttachment: (attachmentSysId: string) => void;
  evaluateWorkspaceCapabilities: (workspace: WorkspaceRecord) => { canAdminWorkspace?: boolean; canViewWorkspace: boolean };
  getAttachmentBySysId: (attachmentSysId: string) => WorkspaceIconAttachmentRecord | null;
  getAttachmentBytes: (attachmentSysId: string) => Uint8Array | null;
  getAttachmentContentStream: (attachmentSysId: string) => unknown;
  getCurrentUserSysId: () => string;
  loadAssetByKey: (assetKey: string) => WorkspaceIconAssetRecord | null;
  loadClaimedAssetsByWorkspace: (workspaceSysId: string) => WorkspaceIconAssetRecord[];
  loadProvisionRequestBySysId: (provisionRequestSysId: string) => WorkspaceIconProvisionRequestRecord | null;
  loadWorkspaceBySysId: (workspaceSysId: string) => WorkspaceRecord | null;
  markAssetInvalid: (assetSysId: string) => void;
  restoreAssetToStaged: (assetSysId: string, input?: { provisionRequestSysId?: string; workspaceSysId?: string }) => void;
  setAssetValidated: (assetSysId: string, input: WorkspaceIconAssetRecord) => void;
  setAssetStagedWorkspace: (assetSysId: string, workspaceSysId: string) => boolean;
  setAssetWorkspace: (assetSysId: string, input: { provisionRequestSysId: string; workspaceSysId: string }) => boolean;
  tryClaimSettingsAsset: (assetSysId: string, workspaceSysId: string) => boolean;
  tryClaimAsset: (assetSysId: string, provisionRequestSysId: string) => boolean;
  tryBeginStagedSettingsAssetCleanup: (assetSysId: string, workspaceSysId: string, requestedBy: string) => boolean;
  tryFinalizeAssetCleanup: (assetSysId: string, attachmentSysId: string) => boolean;
  tryRetireClaimedAsset: (assetSysId: string, workspaceSysId: string, attachmentSysId: string) => boolean;
  writeAttachmentToAsset: (input: { assetSysId: string; contentType: WorkspaceIconImageMetadata["contentType"]; dataStream: unknown; fileName: string }) => string | null;
};

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeState(value: unknown): WorkspaceIconAssetRecord["state"] {
  const state = cleanText(value);
  return state === "claimed" || state === "cleaning" || state === "invalid" ? state : "staged";
}

function safeInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : Number.NaN;
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function toFailure(status: WorkspaceIconFailure["status"], errorMessage: string): WorkspaceIconFailure {
  return { errorMessage, kind: "failed", status };
}

function decodeBase64(value: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const clean = value.replace(/\s+/g, "");
  const bytes: number[] = [];
  for (let offset = 0; offset < clean.length; offset += 4) {
    const chunk = clean.slice(offset, offset + 4);
    const values = chunk.split("").map((character) => (character === "=" ? 0 : alphabet.indexOf(character)));
    if (values.some((item) => item < 0)) {
      return new Uint8Array();
    }
    const triplet = (values[0] << 18) | (values[1] << 12) | (values[2] << 6) | values[3];
    bytes.push((triplet >> 16) & 0xff);
    if (chunk[2] !== "=") {
      bytes.push((triplet >> 8) & 0xff);
    }
    if (chunk[3] !== "=") {
      bytes.push(triplet & 0xff);
    }
  }
  return new Uint8Array(bytes);
}

function assetFileUrl(assetKey: string): string {
  return `${WORKSPACE_ICON_FILE_ROUTE_PATH}?assetKey=${encodeURIComponent(assetKey)}`;
}

function createOpaqueAssetKey(dependencies: Pick<WorkspaceIconServiceDependencies, "getCurrentUserSysId">): string {
  const glideSystem = gs as unknown as { generateGUID?: () => string } | undefined;
  const generated = cleanText(glideSystem?.generateGUID?.()).replace(/[^a-zA-Z0-9]/g, "");
  const suffix = generated || `${Date.now()}${Math.floor(Math.random() * 1000000)}`;
  return `wsi_${cleanText(dependencies.getCurrentUserSysId()).slice(0, 8)}_${suffix}`;
}

function mapAsset(record: { getUniqueValue: () => string; getValue: (fieldName: string) => unknown }): WorkspaceIconAssetRecord {
  const contentType = cleanText(record.getValue("content_type"));
  return {
    assetKey: cleanText(record.getValue("asset_key")),
    attachmentSysId: cleanText(record.getValue("attachment")),
    contentType: contentType === "image/png" || contentType === "image/webp" ? contentType : "image/jpeg",
    fileName: cleanText(record.getValue("file_name")),
    format: contentType === "image/png" ? "png" : contentType === "image/webp" ? "webp" : "jpeg",
    height: safeInteger(record.getValue("height")) ?? 0,
    requestedBy: cleanText(record.getValue("requested_by")),
    sizeBytes: safeInteger(record.getValue("size_bytes")) ?? 0,
    state: normalizeState(record.getValue("state")),
    sysId: cleanText(record.getUniqueValue()),
    width: safeInteger(record.getValue("width")) ?? 0,
    workspaceSysId: cleanText(record.getValue("workspace")),
    provisionRequestSysId: cleanText(record.getValue("provision_request"))
  };
}

function createDefaultDependencies(): WorkspaceIconServiceDependencies {
  return {
    canCreateWorkspaces: () => gs.hasRole("x_2300756_docsera.admin"),
    createAsset(input) {
      const record = new GlideRecord(DOCSERA_WORKSPACE_ICON_ASSET_TABLE);
      record.initialize();
      record.setValue("asset_key", input.assetKey);
      record.setValue("state", "staged");
      record.setValue("requested_by", input.requestedBy);
      return cleanText(record.insert());
    },
    deleteAsset(assetSysId) {
      const record = new GlideRecord(DOCSERA_WORKSPACE_ICON_ASSET_TABLE);
      if (record.get("sys_id", cleanText(assetSysId))) {
        record.deleteRecord();
      }
    },
    deleteAttachment(attachmentSysId) {
      new GlideSysAttachment().deleteAttachment(cleanText(attachmentSysId));
    },
    evaluateWorkspaceCapabilities: evaluateCurrentUserWorkspaceCapabilities,
    getAttachmentBySysId(attachmentSysId) {
      const attachment = new GlideRecord("sys_attachment");
      if (!attachment.get("sys_id", cleanText(attachmentSysId))) {
        return null;
      }
      return {
        contentType: cleanText(attachment.getValue("content_type")).split(";")[0].trim().toLowerCase(),
        fileName: cleanText(attachment.getValue("file_name")),
        mediaId: cleanText(attachment.getUniqueValue()),
        sizeBytes: safeInteger(attachment.getValue("size_bytes")) ?? 0,
        tableName: cleanText(attachment.getValue("table_name")),
        tableSysId: cleanText(attachment.getValue("table_sys_id"))
      };
    },
    getAttachmentBytes(attachmentSysId) {
      const attachment = new GlideRecord("sys_attachment");
      if (!attachment.get("sys_id", cleanText(attachmentSysId))) {
        return null;
      }
      const base64 = cleanText((new GlideSysAttachment() as unknown as { getContentBase64?: (record: GlideRecord) => string }).getContentBase64?.(attachment));
      return base64 ? decodeBase64(base64) : null;
    },
    getAttachmentContentStream(attachmentSysId) {
      return new GlideSysAttachment().getContentStream(cleanText(attachmentSysId));
    },
    getCurrentUserSysId: () => cleanText(gs.getUserID()),
    loadAssetByKey(assetKey) {
      const record = new GlideRecord(DOCSERA_WORKSPACE_ICON_ASSET_TABLE);
      record.addQuery("asset_key", cleanText(assetKey));
      record.setLimit(1);
      record.query();
      return record.next() ? mapAsset(record) : null;
    },
    loadClaimedAssetsByWorkspace(workspaceSysId) {
      const record = new GlideRecord(DOCSERA_WORKSPACE_ICON_ASSET_TABLE);
      record.addQuery("state", "claimed");
      record.addQuery("workspace", cleanText(workspaceSysId));
      record.orderBy("sys_created_on");
      record.setLimit(10);
      record.query();
      const assets: WorkspaceIconAssetRecord[] = [];
      while (record.next()) {
        assets.push(mapAsset(record));
      }
      return assets;
    },
    loadProvisionRequestBySysId(provisionRequestSysId) {
      const record = new GlideRecord("x_2300756_docsera_workspace_provision_request");
      if (!record.get("sys_id", cleanText(provisionRequestSysId))) {
        return null;
      }
      const state = cleanText(record.getValue("state"));
      const iconType = cleanText(record.getValue("icon_type"));
      return {
        iconKey: cleanText(record.getValue("icon_key")),
        iconType: iconType === "uploaded" ? "uploaded" : "builtin",
        state: state === "processing" || state === "succeeded" || state === "failed" ? state : "requested",
        sysId: cleanText(record.getUniqueValue()),
        workspaceSysId: cleanText(record.getValue("workspace"))
      };
    },
    loadWorkspaceBySysId(workspaceSysId) {
      const record = new GlideRecord(DOCSERA_WORKSPACE_TABLE);
      if (!record.get("sys_id", cleanText(workspaceSysId))) {
        return null;
      }
      return mapWorkspaceRecord(record);
    },
    markAssetInvalid(assetSysId) {
      const record = new GlideRecord(DOCSERA_WORKSPACE_ICON_ASSET_TABLE);
      if (record.get("sys_id", cleanText(assetSysId))) {
        record.setValue("state", "invalid");
        record.update();
      }
    },
    restoreAssetToStaged(assetSysId, input = {}) {
      const record = new GlideRecord(DOCSERA_WORKSPACE_ICON_ASSET_TABLE);
      if (record.get("sys_id", cleanText(assetSysId))) {
        record.setValue("state", "staged");
        record.setValue("provision_request", cleanText(input.provisionRequestSysId));
        record.setValue("workspace", cleanText(input.workspaceSysId));
        record.update();
      }
    },
    setAssetValidated(assetSysId, input) {
      const record = new GlideRecord(DOCSERA_WORKSPACE_ICON_ASSET_TABLE);
      if (record.get("sys_id", cleanText(assetSysId))) {
        record.setValue("attachment", input.attachmentSysId);
        record.setValue("file_name", input.fileName);
        record.setValue("content_type", input.contentType);
        record.setValue("size_bytes", input.sizeBytes);
        record.setValue("width", input.width);
        record.setValue("height", input.height);
        record.setValue("state", "staged");
        record.update();
      }
    },
    setAssetStagedWorkspace(assetSysId, workspaceSysId) {
      const sysId = cleanText(assetSysId);
      const targetWorkspaceSysId = cleanText(workspaceSysId);
      const record = new GlideRecord(DOCSERA_WORKSPACE_ICON_ASSET_TABLE);
      record.addQuery("sys_id", sysId);
      record.addQuery("state", "staged");
      record.addQuery("provision_request", "");
      record.addQuery("workspace", "");
      record.setValue("workspace", targetWorkspaceSysId);
      record.updateMultiple();
      const verified = new GlideRecord(DOCSERA_WORKSPACE_ICON_ASSET_TABLE);
      return (
        verified.get("sys_id", sysId) &&
        cleanText(verified.getValue("state")) === "staged" &&
        cleanText(verified.getValue("provision_request")) === "" &&
        cleanText(verified.getValue("workspace")) === targetWorkspaceSysId
      );
    },
    setAssetWorkspace(assetSysId, input) {
      const sysId = cleanText(assetSysId);
      const requestSysId = cleanText(input.provisionRequestSysId);
      const workspaceSysId = cleanText(input.workspaceSysId);
      const record = new GlideRecord(DOCSERA_WORKSPACE_ICON_ASSET_TABLE);
      record.addQuery("sys_id", sysId);
      record.addQuery("state", "claimed");
      record.addQuery("provision_request", requestSysId);
      record.addQuery("workspace", "");
      if (cleanText(input.workspaceSysId)) {
        record.setValue("workspace", workspaceSysId);
      }
      record.updateMultiple();
      const verified = new GlideRecord(DOCSERA_WORKSPACE_ICON_ASSET_TABLE);
      return (
        verified.get("sys_id", sysId) &&
        cleanText(verified.getValue("state")) === "claimed" &&
        cleanText(verified.getValue("provision_request")) === requestSysId &&
        cleanText(verified.getValue("workspace")) === workspaceSysId
      );
    },
    tryClaimAsset(assetSysId, provisionRequestSysId) {
      const sysId = cleanText(assetSysId);
      const requestSysId = cleanText(provisionRequestSysId);
      const record = new GlideRecord(DOCSERA_WORKSPACE_ICON_ASSET_TABLE);
      record.addQuery("sys_id", sysId);
      record.addQuery("state", "staged");
      record.addQuery("provision_request", "");
      record.addQuery("workspace", "");
      record.setValue("state", "claimed");
      record.setValue("provision_request", requestSysId);
      record.updateMultiple();
      const verified = new GlideRecord(DOCSERA_WORKSPACE_ICON_ASSET_TABLE);
      return (
        verified.get("sys_id", sysId) &&
        cleanText(verified.getValue("state")) === "claimed" &&
        cleanText(verified.getValue("provision_request")) === requestSysId &&
        cleanText(verified.getValue("workspace")) === ""
      );
    },
    tryClaimSettingsAsset(assetSysId, workspaceSysId) {
      const sysId = cleanText(assetSysId);
      const targetWorkspaceSysId = cleanText(workspaceSysId);
      const record = new GlideRecord(DOCSERA_WORKSPACE_ICON_ASSET_TABLE);
      record.addQuery("sys_id", sysId);
      record.addQuery("state", "staged");
      record.addQuery("provision_request", "");
      record.addQuery("workspace", targetWorkspaceSysId);
      record.setValue("state", "claimed");
      record.updateMultiple();
      const verified = new GlideRecord(DOCSERA_WORKSPACE_ICON_ASSET_TABLE);
      return (
        verified.get("sys_id", sysId) &&
        cleanText(verified.getValue("state")) === "claimed" &&
        cleanText(verified.getValue("provision_request")) === "" &&
        cleanText(verified.getValue("workspace")) === targetWorkspaceSysId
      );
    },
    tryBeginStagedSettingsAssetCleanup(assetSysId, workspaceSysId, requestedBy) {
      const sysId = cleanText(assetSysId);
      const targetWorkspaceSysId = cleanText(workspaceSysId);
      const userSysId = cleanText(requestedBy);
      const record = new GlideRecord(DOCSERA_WORKSPACE_ICON_ASSET_TABLE);
      record.addQuery("sys_id", sysId);
      record.addQuery("state", "staged");
      record.addQuery("workspace", targetWorkspaceSysId);
      record.addQuery("requested_by", userSysId);
      record.addQuery("provision_request", "");
      record.setValue("state", "cleaning");
      record.updateMultiple();
      const verified = new GlideRecord(DOCSERA_WORKSPACE_ICON_ASSET_TABLE);
      return verified.get("sys_id", sysId) && cleanText(verified.getValue("state")) === "cleaning" && cleanText(verified.getValue("workspace")) === targetWorkspaceSysId && cleanText(verified.getValue("requested_by")) === userSysId && cleanText(verified.getValue("provision_request")) === "";
    },
    tryFinalizeAssetCleanup(assetSysId, attachmentSysId) {
      const record = new GlideRecord(DOCSERA_WORKSPACE_ICON_ASSET_TABLE);
      record.addQuery("sys_id", cleanText(assetSysId));
      record.addQuery("state", "cleaning");
      record.addQuery("attachment", cleanText(attachmentSysId));
      record.setLimit(1);
      record.query();
      return record.next() ? Boolean(record.deleteRecord()) : false;
    },
    tryRetireClaimedAsset(assetSysId, workspaceSysId, attachmentSysId) {
      const sysId = cleanText(assetSysId);
      const targetWorkspaceSysId = cleanText(workspaceSysId);
      const targetAttachmentSysId = cleanText(attachmentSysId);
      const record = new GlideRecord(DOCSERA_WORKSPACE_ICON_ASSET_TABLE);
      record.addQuery("sys_id", sysId);
      record.addQuery("state", "claimed");
      record.addQuery("workspace", targetWorkspaceSysId);
      record.addQuery("attachment", targetAttachmentSysId);
      record.setLimit(1);
      record.query();
      return record.next() ? Boolean(record.deleteRecord()) : false;
    },
    writeAttachmentToAsset(input) {
      const asset = new GlideRecord(DOCSERA_WORKSPACE_ICON_ASSET_TABLE);
      if (!asset.get("sys_id", cleanText(input.assetSysId))) {
        return null;
      }
      return cleanText(new GlideSysAttachment().writeContentStream(asset, cleanText(input.fileName), input.contentType, input.dataStream as never));
    }
  };
}

export function createWorkspaceIconService(dependencies: WorkspaceIconServiceDependencies) {
  function hasCompletedMatchingProvisioningClaim(asset: WorkspaceIconAssetRecord, workspaceSysId: string): boolean {
    if (!asset.provisionRequestSysId) {
      return true;
    }
    const request = dependencies.loadProvisionRequestBySysId(asset.provisionRequestSysId);
    return Boolean(
      request &&
        request.sysId === asset.provisionRequestSysId &&
        request.state === "succeeded" &&
        request.workspaceSysId === workspaceSysId &&
        request.iconType === "uploaded" &&
        request.iconKey === asset.assetKey
    );
  }

  function retireVerifiedClaimedWorkspaceIcon(asset: WorkspaceIconAssetRecord, workspaceSysId: string): void {
    const targetWorkspaceSysId = cleanText(workspaceSysId);
    if (
      !targetWorkspaceSysId ||
      asset.state !== "claimed" ||
      asset.workspaceSysId !== targetWorkspaceSysId ||
      !asset.sysId ||
      !asset.attachmentSysId ||
      !hasCompletedMatchingProvisioningClaim(asset, targetWorkspaceSysId)
    ) {
      return;
    }

    const workspace = dependencies.loadWorkspaceBySysId(targetWorkspaceSysId);
    if (!workspace || cleanText(workspace.sysId) !== targetWorkspaceSysId || (workspace.icon.type === "uploaded" && cleanText(workspace.icon.key) === asset.assetKey)) {
      return;
    }

    const attachment = dependencies.getAttachmentBySysId(asset.attachmentSysId);
    if (attachment) {
      if (attachment.mediaId !== asset.attachmentSysId || attachment.tableName !== DOCSERA_WORKSPACE_ICON_ASSET_TABLE || attachment.tableSysId !== asset.sysId) {
        return;
      }
      dependencies.deleteAttachment(asset.attachmentSysId);
      if (dependencies.getAttachmentBySysId(asset.attachmentSysId)) {
        return;
      }
    }

    dependencies.tryRetireClaimedAsset(asset.sysId, targetWorkspaceSysId, asset.attachmentSysId);
  }

  function cleanupFailedUpload(assetSysId: string, attachmentSysId?: string): void {
    if (attachmentSysId) {
      dependencies.deleteAttachment(attachmentSysId);
    }
    dependencies.deleteAsset(assetSysId);
  }

  function finishCleaningAsset(asset: WorkspaceIconAssetRecord): void {
    if (asset.state !== "cleaning" || !asset.sysId || !asset.attachmentSysId) return;
    const attachment = dependencies.getAttachmentBySysId(asset.attachmentSysId);
    if (attachment && (attachment.mediaId !== asset.attachmentSysId || attachment.tableName !== DOCSERA_WORKSPACE_ICON_ASSET_TABLE || attachment.tableSysId !== asset.sysId)) return;
    if (attachment) dependencies.deleteAttachment(asset.attachmentSysId);
    if (!dependencies.getAttachmentBySysId(asset.attachmentSysId)) dependencies.tryFinalizeAssetCleanup(asset.sysId, asset.attachmentSysId);
  }

  function validateClaimableAsset(assetKey: string, options: { workspaceSysId?: string } = {}): WorkspaceIconAssetRecord | WorkspaceIconFailure {
    const asset = dependencies.loadAssetByKey(assetKey);
    const currentUserSysId = cleanText(dependencies.getCurrentUserSysId());
    const targetWorkspaceSysId = cleanText(options.workspaceSysId);
    if (!asset || asset.assetKey !== cleanText(assetKey)) {
      return toFailure(400, "The uploaded workspace icon could not be found.");
    }
    if (asset.state !== "staged" || asset.provisionRequestSysId) {
      return toFailure(400, "The uploaded workspace icon has already been used.");
    }
    if (targetWorkspaceSysId ? asset.workspaceSysId !== targetWorkspaceSysId : Boolean(asset.workspaceSysId)) {
      return toFailure(400, "The uploaded workspace icon was staged for another workspace.");
    }
    if (asset.requestedBy !== currentUserSysId) {
      return toFailure(403, "The uploaded workspace icon belongs to another user.");
    }
    if (!asset.attachmentSysId || asset.width < 128 || asset.width !== asset.height) {
      return toFailure(400, "The uploaded workspace icon is not valid.");
    }
    const attachment = dependencies.getAttachmentBySysId(asset.attachmentSysId);
    if (!attachment || attachment.mediaId !== asset.attachmentSysId || attachment.tableName !== DOCSERA_WORKSPACE_ICON_ASSET_TABLE || attachment.tableSysId !== asset.sysId) {
      return toFailure(400, "The uploaded workspace icon attachment could not be verified.");
    }
    if (attachment.fileName !== asset.fileName || attachment.contentType !== asset.contentType || attachment.sizeBytes !== asset.sizeBytes) {
      return toFailure(400, "The uploaded workspace icon attachment metadata could not be verified.");
    }
    return asset;
  }

  return {
    async uploadWorkspaceIcon(input: { contentLengthBytes?: number | null; contentType: string; dataStream: unknown; fileName: string; workspaceSysId?: string }): Promise<WorkspaceIconUploadResult> {
      const targetWorkspaceSysId = cleanText(input.workspaceSysId);
      if (targetWorkspaceSysId) {
        const targetWorkspace = dependencies.loadWorkspaceBySysId(targetWorkspaceSysId);
        if (!targetWorkspace || cleanText(targetWorkspace.sysId) !== targetWorkspaceSysId) {
          return toFailure(404, "Workspace could not be found.");
        }
        if (!dependencies.evaluateWorkspaceCapabilities(targetWorkspace).canAdminWorkspace) {
          return toFailure(403, "You do not have permission to upload workspace icons.");
        }
      } else if (!dependencies.canCreateWorkspaces()) {
        return toFailure(403, "You do not have permission to upload workspace icons.");
      }
      if (input.dataStream === undefined || input.dataStream === null) {
        return toFailure(400, "The icon upload body cannot be empty.");
      }
      const contentLengthBytes = Number.isSafeInteger(input.contentLengthBytes) ? input.contentLengthBytes ?? null : null;
      if (contentLengthBytes !== null && contentLengthBytes > 1024 * 1024) {
        return toFailure(413, "The icon upload exceeds the 1 MB limit.");
      }
      const currentUserSysId = cleanText(dependencies.getCurrentUserSysId());
      if (!currentUserSysId) {
        return toFailure(403, "The current user could not be resolved.");
      }
      const assetKey = createOpaqueAssetKey(dependencies);
      const assetSysId = dependencies.createAsset({ assetKey, requestedBy: currentUserSysId });
      if (!assetSysId) {
        return toFailure(500, "Something went wrong while preparing the icon asset. Please try again.");
      }
      const attachmentSysId = dependencies.writeAttachmentToAsset({
        assetSysId,
        contentType: cleanText(input.contentType).split(";")[0].trim().toLowerCase() as WorkspaceIconImageMetadata["contentType"],
        dataStream: input.dataStream,
        fileName: cleanText(input.fileName)
      });
      if (!attachmentSysId) {
        cleanupFailedUpload(assetSysId);
        return toFailure(500, "Something went wrong while saving the icon file. Please try again.");
      }
      try {
        const attachment = dependencies.getAttachmentBySysId(attachmentSysId);
        const bytes = dependencies.getAttachmentBytes(attachmentSysId);
        if (!attachment || attachment.mediaId !== attachmentSysId || attachment.tableName !== DOCSERA_WORKSPACE_ICON_ASSET_TABLE || attachment.tableSysId !== assetSysId || !bytes) {
          cleanupFailedUpload(assetSysId, attachmentSysId);
          return toFailure(500, "Something went wrong while validating the icon file. Please try again.");
        }
        const validation = validateWorkspaceIconImage({
          bytes,
          contentType: attachment.contentType,
          fileName: attachment.fileName,
          sizeBytes: attachment.sizeBytes
        });
        if (validation.kind === "failed") {
          dependencies.markAssetInvalid(assetSysId);
          cleanupFailedUpload(assetSysId, attachmentSysId);
          const status = validation.errorMessage.includes("1 MB") ? 413 : validation.errorMessage.includes("PNG") || validation.errorMessage.includes("content") || validation.errorMessage.includes("extension") ? 415 : 400;
          return toFailure(status, validation.errorMessage);
        }
        const asset: WorkspaceIconAssetRecord = {
          ...validation,
          assetKey,
          attachmentSysId,
          fileName: attachment.fileName,
          requestedBy: currentUserSysId,
          sizeBytes: attachment.sizeBytes,
          state: "staged",
          sysId: assetSysId,
          workspaceSysId: "",
          provisionRequestSysId: ""
        };
        dependencies.setAssetValidated(assetSysId, asset);
        if (targetWorkspaceSysId && !dependencies.setAssetStagedWorkspace(assetSysId, targetWorkspaceSysId)) {
          cleanupFailedUpload(assetSysId, attachmentSysId);
          return toFailure(500, "Something went wrong while preparing the icon asset. Please try again.");
        }
        return {
          asset: {
            assetKey,
            contentType: validation.contentType,
            fileName: attachment.fileName,
            height: validation.height,
            sizeBytes: attachment.sizeBytes,
            url: assetFileUrl(assetKey),
            width: validation.width
          },
          kind: "succeeded"
        };
      } catch {
        cleanupFailedUpload(assetSysId, attachmentSysId);
        return toFailure(500, "Something went wrong while validating the icon file. Please try again.");
      }
    },

    claimWorkspaceIcon(assetKey: string, provisionRequestSysId: string): WorkspaceIconClaimResult {
      const asset = validateClaimableAsset(assetKey);
      if ("kind" in asset) {
        return asset;
      }
      if (!dependencies.tryClaimAsset(asset.sysId, provisionRequestSysId)) {
        return toFailure(400, "The uploaded workspace icon has already been used.");
      }
      return {
        asset: { ...asset, provisionRequestSysId, state: "claimed" },
        icon: {
          assetPath: assetFileUrl(asset.assetKey),
          key: asset.assetKey,
          label: asset.fileName || "Uploaded workspace icon",
          type: "uploaded"
        },
        kind: "succeeded"
      };
    },

    claimWorkspaceSettingsIcon(assetKey: string, workspaceSysId: string): WorkspaceIconClaimResult {
      const targetWorkspaceSysId = cleanText(workspaceSysId);
      if (!targetWorkspaceSysId) {
        return toFailure(400, "A workspace reference is required.");
      }
      const asset = validateClaimableAsset(assetKey, { workspaceSysId: targetWorkspaceSysId });
      if ("kind" in asset) {
        return asset;
      }
      if (!dependencies.tryClaimSettingsAsset(asset.sysId, targetWorkspaceSysId)) {
        return toFailure(400, "The uploaded workspace icon has already been used.");
      }
      return {
        asset: { ...asset, provisionRequestSysId: "", state: "claimed", workspaceSysId: targetWorkspaceSysId },
        icon: {
          assetPath: assetFileUrl(asset.assetKey),
          key: asset.assetKey,
          label: asset.fileName || "Uploaded workspace icon",
          type: "uploaded"
        },
        kind: "succeeded"
      };
    },

    restoreWorkspaceIconClaim(assetSysId: string, input?: { provisionRequestSysId?: string; workspaceSysId?: string }): void {
      dependencies.restoreAssetToStaged(assetSysId, input);
    },

    attachClaimedIconToWorkspace(assetSysId: string, provisionRequestSysId: string, workspaceSysId: string): WorkspaceIconFailure | { kind: "succeeded" } {
      if (!dependencies.setAssetWorkspace(assetSysId, { provisionRequestSysId, workspaceSysId })) {
        return toFailure(400, "The uploaded workspace icon could not be finalized for the new workspace.");
      }
      return { kind: "succeeded" };
    },

    cleanupStagedWorkspaceSettingsIcon(assetKey: string, workspaceSysId: string): void {
      const asset = dependencies.loadAssetByKey(assetKey);
      const targetWorkspaceSysId = cleanText(workspaceSysId);
      const currentUserSysId = cleanText(dependencies.getCurrentUserSysId());
      if (!asset || asset.state !== "staged" || asset.workspaceSysId !== targetWorkspaceSysId || asset.requestedBy !== currentUserSysId || asset.provisionRequestSysId) {
        return;
      }
      if (!dependencies.tryBeginStagedSettingsAssetCleanup(asset.sysId, targetWorkspaceSysId, currentUserSysId)) return;
      const cleaning = dependencies.loadAssetByKey(asset.assetKey);
      if (cleaning) finishCleaningAsset(cleaning);
    },

    retireClaimedWorkspaceIcon(assetKey: string, workspaceSysId: string): void {
      const asset = dependencies.loadAssetByKey(assetKey);
      if (asset) {
        retireVerifiedClaimedWorkspaceIcon(asset, workspaceSysId);
      }
    },

    retireObsoleteClaimedWorkspaceIcons(workspaceSysId: string): void {
      const targetWorkspaceSysId = cleanText(workspaceSysId);
      if (!targetWorkspaceSysId) {
        return;
      }
      for (const asset of dependencies.loadClaimedAssetsByWorkspace(targetWorkspaceSysId)) {
        try {
          retireVerifiedClaimedWorkspaceIcon(asset, targetWorkspaceSysId);
        } catch {
          // Keep this asset durable for a later bounded cleanup retry.
        }
      }
    },

    async getWorkspaceIconFile(input: { assetKey: string }): Promise<WorkspaceIconFileResult> {
      const asset = dependencies.loadAssetByKey(input.assetKey);
      if (!asset || asset.assetKey !== cleanText(input.assetKey) || asset.state !== "claimed" || !asset.workspaceSysId) {
        return toFailure(404, "Workspace icon could not be found.");
      }
      const workspace = dependencies.loadWorkspaceBySysId(asset.workspaceSysId);
      if (!workspace) {
        return toFailure(404, "Workspace could not be found.");
      }
      if (!dependencies.evaluateWorkspaceCapabilities(workspace).canViewWorkspace) {
        return toFailure(403, "You do not have permission to view this workspace icon.");
      }
      const attachment = dependencies.getAttachmentBySysId(asset.attachmentSysId);
      if (!attachment || attachment.tableName !== DOCSERA_WORKSPACE_ICON_ASSET_TABLE || attachment.tableSysId !== asset.sysId) {
        return toFailure(404, "Workspace icon could not be found.");
      }
      const stream = dependencies.getAttachmentContentStream(asset.attachmentSysId);
      if (stream === null || stream === undefined) {
        return toFailure(404, "Workspace icon could not be found.");
      }
      return { asset, contentStream: stream, contentType: asset.contentType, kind: "succeeded" };
    },

    async getWorkspaceSettingsIconPreviewFile(input: { assetKey: string; workspaceSysId: string }): Promise<WorkspaceIconFileResult> {
      const targetWorkspaceSysId = cleanText(input.workspaceSysId);
      const asset = dependencies.loadAssetByKey(input.assetKey);
      if (!targetWorkspaceSysId || !asset || asset.assetKey !== cleanText(input.assetKey) || asset.state !== "staged" || asset.workspaceSysId !== targetWorkspaceSysId || asset.provisionRequestSysId) {
        return toFailure(404, "Workspace icon could not be found.");
      }
      const currentUserSysId = cleanText(dependencies.getCurrentUserSysId());
      if (!currentUserSysId || asset.requestedBy !== currentUserSysId) {
        return toFailure(403, "You do not have permission to view this workspace icon.");
      }
      const workspace = dependencies.loadWorkspaceBySysId(targetWorkspaceSysId);
      if (!workspace) {
        return toFailure(404, "Workspace could not be found.");
      }
      if (!dependencies.evaluateWorkspaceCapabilities(workspace).canAdminWorkspace) {
        return toFailure(403, "You do not have permission to view this workspace icon.");
      }
      const attachment = dependencies.getAttachmentBySysId(asset.attachmentSysId);
      if (!attachment || attachment.mediaId !== asset.attachmentSysId || attachment.tableName !== DOCSERA_WORKSPACE_ICON_ASSET_TABLE || attachment.tableSysId !== asset.sysId || attachment.fileName !== asset.fileName || attachment.contentType !== asset.contentType || attachment.sizeBytes !== asset.sizeBytes) {
        return toFailure(404, "Workspace icon could not be found.");
      }
      const stream = dependencies.getAttachmentContentStream(asset.attachmentSysId);
      if (stream === null || stream === undefined) {
        return toFailure(404, "Workspace icon could not be found.");
      }
      return { asset, contentStream: stream, contentType: asset.contentType, kind: "succeeded" };
    }
  };
}

export function createServiceNowWorkspaceIconService() {
  return createWorkspaceIconService(createDefaultDependencies());
}
