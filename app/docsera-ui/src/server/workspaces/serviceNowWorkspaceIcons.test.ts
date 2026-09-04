import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceIconService, DOCSERA_WORKSPACE_ICON_ASSET_TABLE, type WorkspaceIconAssetRecord, type WorkspaceIconServiceDependencies } from "./serviceNowWorkspaceIcons.ts";

const validPng = new Uint8Array(58);
validPng.set([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
  0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
  0, 0, 0, 128, 0, 0, 0, 128, 8, 6, 0, 0, 0,
  0, 0, 0, 0,
  0, 0, 0, 1, 0x49, 0x44, 0x41, 0x54, 0,
  0, 0, 0, 0,
  0, 0, 0, 0, 0x49, 0x45, 0x4e, 0x44,
  0, 0, 0, 0
], 0);

function staged(overrides: Partial<WorkspaceIconAssetRecord> = {}): WorkspaceIconAssetRecord {
  return {
    assetKey: "wsi_asset",
    attachmentSysId: "att-1",
    contentType: "image/png",
    fileName: "icon.png",
    format: "png",
    height: 128,
    provisionRequestSysId: "",
    requestedBy: "user-1",
    sizeBytes: validPng.length,
    state: "staged",
    sysId: "asset-1",
    width: 128,
    workspaceSysId: "",
    ...overrides
  };
}

function dependencies(overrides: Partial<WorkspaceIconServiceDependencies> = {}) {
  let asset = staged();
  const deps: WorkspaceIconServiceDependencies = {
    canCreateWorkspaces: vi.fn(() => true),
    createAsset: vi.fn(() => "asset-1"),
    deleteAsset: vi.fn(),
    deleteAttachment: vi.fn(),
    evaluateWorkspaceCapabilities: vi.fn(() => ({ canAdminWorkspace: true, canViewWorkspace: true })),
    getAttachmentBySysId: vi.fn((attachmentSysId: string) =>
      attachmentSysId === "att-1"
        ? { contentType: "image/png", fileName: "icon.png", mediaId: "att-1", sizeBytes: validPng.length, tableName: DOCSERA_WORKSPACE_ICON_ASSET_TABLE, tableSysId: "asset-1" }
        : null
    ),
    getAttachmentBytes: vi.fn(() => validPng),
    getAttachmentContentStream: vi.fn(() => "stream"),
    getCurrentUserSysId: vi.fn(() => "user-1"),
    loadAssetByKey: vi.fn(() => asset),
    loadWorkspaceBySysId: vi.fn(() => ({
      adminGroupSysId: "admin",
      creatorUserSysId: "user-1",
      editorGroupSysId: "editor",
      icon: { type: "uploaded", key: "wsi_asset", label: "icon.png", assetPath: "/icons/file?assetKey=wsi_asset" },
      layout: { pageWidth: "readable", tocVisible: true },
      name: "Docs",
      shortDescription: null,
      slug: "docs",
      status: "active",
      sysId: "workspace-1"
    })),
    markAssetInvalid: vi.fn(),
    restoreAssetToStaged: vi.fn(),
    setAssetValidated: vi.fn((_assetSysId, input) => {
      asset = input;
    }),
    setAssetStagedWorkspace: vi.fn((_assetSysId, workspaceSysId) => {
      asset = { ...asset, workspaceSysId };
      return true;
    }),
    setAssetWorkspace: vi.fn(() => true),
    tryClaimSettingsAsset: vi.fn((_assetSysId, workspaceSysId) => {
      asset = { ...asset, state: "claimed", workspaceSysId, provisionRequestSysId: "" };
      return true;
    }),
    tryClaimAsset: vi.fn(() => true),
    tryDeleteStagedSettingsAsset: vi.fn(() => "att-1"),
    tryRetireClaimedAsset: vi.fn(() => "att-1"),
    writeAttachmentToAsset: vi.fn(() => "att-1"),
    ...overrides
  };
  return { deps, setAsset: (next: WorkspaceIconAssetRecord) => (asset = next) };
}

describe("workspace icon service", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("keeps the scoped ServiceNow Base64 read contract on a sys_attachment GlideRecord", () => {
    const source = readFileSync(join(process.cwd(), "src/server/workspaces/serviceNowWorkspaceIcons.ts"), "utf8");
    expect(source).toContain('const attachment = new GlideRecord("sys_attachment");');
    expect(source).toContain('attachment.get("sys_id", cleanText(attachmentSysId))');
    expect(source).toContain("getContentBase64?.(attachment)");
    expect(source).not.toContain("getContentBase64?.(cleanText(attachmentSysId))");
    expect(source).not.toContain("getContentBase64?: (id: string) => string");
  });

  it("requires Docsera Admin before creating an asset or attachment", async () => {
    const { deps } = dependencies({ canCreateWorkspaces: vi.fn(() => false) });
    const result = await createWorkspaceIconService(deps).uploadWorkspaceIcon({ contentType: "image/png", dataStream: "stream", fileName: "icon.png" });
    expect(result).toMatchObject({ kind: "failed", status: 403 });
    expect(deps.createAsset).not.toHaveBeenCalled();
    expect(deps.writeAttachmentToAsset).not.toHaveBeenCalled();
  });

  it("allows settings icon upload for Workspace Admin without creation authorization", async () => {
    const { deps } = dependencies({ canCreateWorkspaces: vi.fn(() => false) });
    const result = await createWorkspaceIconService(deps).uploadWorkspaceIcon({
      contentType: "image/png",
      dataStream: "stream",
      fileName: "icon.png",
      workspaceSysId: "workspace-1"
    });
    expect(result).toMatchObject({ kind: "succeeded" });
    expect(deps.loadWorkspaceBySysId).toHaveBeenCalledWith("workspace-1");
    expect(deps.evaluateWorkspaceCapabilities).toHaveBeenCalled();
    expect(deps.createAsset).toHaveBeenCalled();
    expect(deps.setAssetStagedWorkspace).toHaveBeenCalledWith("asset-1", "workspace-1");
  });

  it("rejects unauthorized settings icon upload before asset or attachment writes", async () => {
    const { deps } = dependencies({ evaluateWorkspaceCapabilities: vi.fn(() => ({ canAdminWorkspace: false, canViewWorkspace: true })) });
    const result = await createWorkspaceIconService(deps).uploadWorkspaceIcon({
      contentType: "image/png",
      dataStream: "stream",
      fileName: "icon.png",
      workspaceSysId: "workspace-1"
    });
    expect(result).toMatchObject({ kind: "failed", status: 403 });
    expect(deps.createAsset).not.toHaveBeenCalled();
    expect(deps.writeAttachmentToAsset).not.toHaveBeenCalled();
  });

  it("persists first, validates persisted attachment bytes and metadata, and returns canonical asset metadata", async () => {
    const { deps } = dependencies();
    const result = await createWorkspaceIconService(deps).uploadWorkspaceIcon({ contentType: "image/svg+xml", dataStream: "stream", fileName: "untrusted.svg" });
    expect(deps.writeAttachmentToAsset).toHaveBeenCalled();
    expect(deps.getAttachmentBySysId).toHaveBeenCalledWith("att-1");
    expect(deps.getAttachmentBytes).toHaveBeenCalledWith("att-1");
    expect(result).toMatchObject({ kind: "succeeded", asset: { contentType: "image/png", fileName: "icon.png", height: 128, sizeBytes: validPng.length, width: 128 } });
  });

  it("fails safely and cleans up when the persisted attachment record cannot be resolved", async () => {
    const { deps } = dependencies({ getAttachmentBySysId: vi.fn(() => null) });
    const result = await createWorkspaceIconService(deps).uploadWorkspaceIcon({ contentType: "image/png", dataStream: "stream", fileName: "icon.png" });
    expect(result).toMatchObject({ kind: "failed", status: 500 });
    expect(deps.deleteAttachment).toHaveBeenCalledWith("att-1");
    expect(deps.deleteAsset).toHaveBeenCalledWith("asset-1");
    expect(deps.setAssetValidated).not.toHaveBeenCalled();
  });

  it("cleans up the new asset and attachment when persisted content cannot be read", async () => {
    const { deps } = dependencies({
      getAttachmentBytes: vi.fn(() => {
        throw new Error("Scoped attachment read failed.");
      })
    });
    const result = await createWorkspaceIconService(deps).uploadWorkspaceIcon({ contentType: "image/png", dataStream: "stream", fileName: "icon.png" });
    expect(result).toMatchObject({ kind: "failed", status: 500 });
    expect(deps.deleteAttachment).toHaveBeenCalledWith("att-1");
    expect(deps.deleteAsset).toHaveBeenCalledWith("asset-1");
    expect(deps.setAssetValidated).not.toHaveBeenCalled();
  });

  it("removes invalid persisted uploads so no usable staged asset or attachment remains", async () => {
    const { deps } = dependencies({ getAttachmentBytes: vi.fn(() => new Uint8Array([0x47, 0x49, 0x46])) });
    const result = await createWorkspaceIconService(deps).uploadWorkspaceIcon({ contentType: "image/png", dataStream: "stream", fileName: "icon.png" });
    expect(result).toMatchObject({ kind: "failed" });
    expect(deps.deleteAttachment).toHaveBeenCalledWith("att-1");
    expect(deps.deleteAsset).toHaveBeenCalledWith("asset-1");
  });

  it("claims only staged assets owned by the current user with verified attachment metadata", () => {
    const { deps, setAsset } = dependencies();
    const service = createWorkspaceIconService(deps);
    expect(service.claimWorkspaceIcon("wsi_asset", "request-1")).toMatchObject({ kind: "succeeded", icon: { type: "uploaded", key: "wsi_asset", label: "icon.png" } });
    expect(deps.tryClaimAsset).toHaveBeenCalledWith("asset-1", "request-1");
    setAsset(staged({ requestedBy: "other" }));
    expect(service.claimWorkspaceIcon("wsi_asset", "request-2")).toMatchObject({ kind: "failed", status: 403 });
    setAsset(staged({ state: "claimed" }));
    expect(service.claimWorkspaceIcon("wsi_asset", "request-3")).toMatchObject({ kind: "failed", status: 400 });
  });

  it("rejects duplicate claim attempts when the guarded persistence claim loses", () => {
    const { deps } = dependencies({ tryClaimAsset: vi.fn(() => false) });
    const result = createWorkspaceIconService(deps).claimWorkspaceIcon("wsi_asset", "request-1");
    expect(result).toMatchObject({ kind: "failed", status: 400 });
    expect(deps.tryClaimAsset).toHaveBeenCalledWith("asset-1", "request-1");
  });

  it("claims settings-staged assets only for the exact target workspace without provisioning request writes", () => {
    const { deps, setAsset } = dependencies();
    setAsset(staged({ workspaceSysId: "workspace-1" }));
    const result = createWorkspaceIconService(deps).claimWorkspaceSettingsIcon("wsi_asset", "workspace-1");
    expect(result).toMatchObject({
      asset: { provisionRequestSysId: "", state: "claimed", workspaceSysId: "workspace-1" },
      kind: "succeeded"
    });
    expect(deps.tryClaimSettingsAsset).toHaveBeenCalledWith("asset-1", "workspace-1");
    expect(deps.tryClaimAsset).not.toHaveBeenCalled();
  });

  it("rejects wrong-workspace settings-staged assets", () => {
    const { deps, setAsset } = dependencies();
    setAsset(staged({ workspaceSysId: "workspace-2" }));
    const result = createWorkspaceIconService(deps).claimWorkspaceSettingsIcon("wsi_asset", "workspace-1");
    expect(result).toMatchObject({ kind: "failed", status: 400 });
    expect(deps.tryClaimSettingsAsset).not.toHaveBeenCalled();
  });

  it("restores settings replacement claims to the same staged workspace for retry", () => {
    const { deps } = dependencies();
    createWorkspaceIconService(deps).restoreWorkspaceIconClaim("asset-1", { workspaceSysId: "workspace-1" });
    expect(deps.restoreAssetToStaged).toHaveBeenCalledWith("asset-1", { workspaceSysId: "workspace-1" });
  });

  it("cleans abandoned settings-staged assets only when owner, state, and target workspace match", () => {
    const { deps, setAsset } = dependencies();
    const service = createWorkspaceIconService(deps);
    setAsset(staged({ workspaceSysId: "workspace-1" }));
    service.cleanupStagedWorkspaceSettingsIcon("wsi_asset", "workspace-1");
    expect(deps.tryDeleteStagedSettingsAsset).toHaveBeenCalledWith("asset-1", "workspace-1", "user-1");
    expect(deps.deleteAttachment).toHaveBeenCalledWith("att-1");

    vi.mocked(deps.tryDeleteStagedSettingsAsset).mockClear();
    setAsset(staged({ requestedBy: "other", workspaceSysId: "workspace-1" }));
    service.cleanupStagedWorkspaceSettingsIcon("wsi_asset", "workspace-1");
    expect(deps.tryDeleteStagedSettingsAsset).not.toHaveBeenCalled();
  });

  it("retires old claimed uploaded icons through target-workspace guarded deletion", () => {
    const { deps, setAsset } = dependencies();
    setAsset(staged({ state: "claimed", workspaceSysId: "workspace-1" }));
    createWorkspaceIconService(deps).retireClaimedWorkspaceIcon("wsi_asset", "workspace-1");
    expect(deps.tryRetireClaimedAsset).toHaveBeenCalledWith("asset-1", "workspace-1");
    expect(deps.deleteAttachment).toHaveBeenCalledWith("att-1");
  });

  it("fails uploaded icon finalization when the claimed asset cannot be tied to the provisioning request and workspace", () => {
    const { deps } = dependencies({ setAssetWorkspace: vi.fn(() => false) });
    const result = createWorkspaceIconService(deps).attachClaimedIconToWorkspace("asset-1", "request-1", "workspace-1");
    expect(result).toMatchObject({ kind: "failed", status: 400 });
    expect(deps.setAssetWorkspace).toHaveBeenCalledWith("asset-1", { provisionRequestSysId: "request-1", workspaceSysId: "workspace-1" });
  });

  it("streams claimed custom icons only through workspace view authorization", async () => {
    const { deps, setAsset } = dependencies();
    setAsset(staged({ state: "claimed", workspaceSysId: "workspace-1", provisionRequestSysId: "request-1" }));
    await expect(createWorkspaceIconService(deps).getWorkspaceIconFile({ assetKey: "wsi_asset" })).resolves.toMatchObject({ kind: "succeeded", contentStream: "stream", contentType: "image/png" });
    expect(deps.getAttachmentContentStream).toHaveBeenCalledWith("att-1");
    const denied = dependencies({ evaluateWorkspaceCapabilities: vi.fn(() => ({ canViewWorkspace: false })) });
    denied.setAsset(staged({ state: "claimed", workspaceSysId: "workspace-1", provisionRequestSysId: "request-1" }));
    await expect(createWorkspaceIconService(denied.deps).getWorkspaceIconFile({ assetKey: "wsi_asset" })).resolves.toMatchObject({ kind: "failed", status: 403 });
  });

  it("streams settings-staged preview icons only for the target workspace owner with admin capability", async () => {
    const { deps, setAsset } = dependencies();
    setAsset(staged({ workspaceSysId: "workspace-1" }));
    await expect(createWorkspaceIconService(deps).getWorkspaceSettingsIconPreviewFile({ assetKey: "wsi_asset", workspaceSysId: "workspace-1" })).resolves.toMatchObject({ kind: "succeeded", contentStream: "stream", contentType: "image/png" });
    expect(deps.getAttachmentContentStream).toHaveBeenCalledWith("att-1");

    setAsset(staged());
    await expect(createWorkspaceIconService(deps).getWorkspaceSettingsIconPreviewFile({ assetKey: "wsi_asset", workspaceSysId: "workspace-1" })).resolves.toMatchObject({ kind: "failed", status: 404 });

    const denied = dependencies({ getCurrentUserSysId: vi.fn(() => "other-user") });
    denied.setAsset(staged({ workspaceSysId: "workspace-1" }));
    await expect(createWorkspaceIconService(denied.deps).getWorkspaceSettingsIconPreviewFile({ assetKey: "wsi_asset", workspaceSysId: "workspace-1" })).resolves.toMatchObject({ kind: "failed", status: 403 });

    const notAdmin = dependencies({ evaluateWorkspaceCapabilities: vi.fn(() => ({ canAdminWorkspace: false, canViewWorkspace: true })) });
    notAdmin.setAsset(staged({ workspaceSysId: "workspace-1" }));
    await expect(createWorkspaceIconService(notAdmin.deps).getWorkspaceSettingsIconPreviewFile({ assetKey: "wsi_asset", workspaceSysId: "workspace-1" })).resolves.toMatchObject({ kind: "failed", status: 403 });
  });
});
