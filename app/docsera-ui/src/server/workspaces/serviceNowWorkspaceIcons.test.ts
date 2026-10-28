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
  let attachmentPresent = true;
  const deps: WorkspaceIconServiceDependencies = {
    canCreateWorkspaces: vi.fn(() => true),
    createAsset: vi.fn(() => "asset-1"),
    deleteAsset: vi.fn(),
    deleteAttachment: vi.fn(() => {
      attachmentPresent = false;
    }),
    evaluateWorkspaceCapabilities: vi.fn(() => ({ canAdminWorkspace: true, canViewWorkspace: true })),
    getAttachmentBySysId: vi.fn((attachmentSysId: string) =>
      attachmentSysId === "att-1" && attachmentPresent
        ? { contentType: "image/png", fileName: "icon.png", mediaId: "att-1", sizeBytes: validPng.length, tableName: DOCSERA_WORKSPACE_ICON_ASSET_TABLE, tableSysId: "asset-1" }
        : null
    ),
    getAttachmentBytes: vi.fn(() => validPng),
    getAttachmentContentStream: vi.fn(() => "stream"),
    getCurrentUserSysId: vi.fn(() => "user-1"),
    loadAssetByKey: vi.fn(() => asset),
    loadClaimedAssetsByWorkspace: vi.fn(() => (asset.state === "claimed" && asset.workspaceSysId === "workspace-1" ? [asset] : [])),
    loadProvisionRequestBySysId: vi.fn(() => null),
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
    tryBeginStagedSettingsAssetCleanup: vi.fn((_assetSysId, workspaceSysId) => {
      asset = { ...asset, state: "cleaning", workspaceSysId };
      return true;
    }),
    tryFinalizeAssetCleanup: vi.fn(() => true),
    tryRetireClaimedAsset: vi.fn(() => true),
    writeAttachmentToAsset: vi.fn(() => "att-1"),
    ...overrides
  };
  return { deps, setAsset: (next: WorkspaceIconAssetRecord) => (asset = next), setAttachmentPresent: (next: boolean) => (attachmentPresent = next) };
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

  it("does not allow a durable cleanup claim to be reused as a workspace claim", () => {
    const { deps, setAsset } = dependencies();
    setAsset(staged({ state: "cleaning" }));
    expect(createWorkspaceIconService(deps).claimWorkspaceIcon("wsi_asset", "request-1")).toMatchObject({ kind: "failed", status: 400 });
    expect(deps.tryClaimAsset).not.toHaveBeenCalled();
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
    expect(deps.tryBeginStagedSettingsAssetCleanup).toHaveBeenCalledWith("asset-1", "workspace-1", "user-1");
    expect(deps.deleteAttachment).toHaveBeenCalledWith("att-1");
    expect(deps.tryFinalizeAssetCleanup).toHaveBeenCalledWith("asset-1", "att-1");

    vi.mocked(deps.tryBeginStagedSettingsAssetCleanup).mockClear();
    setAsset(staged({ requestedBy: "other", workspaceSysId: "workspace-1" }));
    service.cleanupStagedWorkspaceSettingsIcon("wsi_asset", "workspace-1");
    expect(deps.tryBeginStagedSettingsAssetCleanup).not.toHaveBeenCalled();
  });

  it("retires old claimed uploaded icons only after attachment absence is verified", () => {
    const { deps, setAsset } = dependencies({
      loadWorkspaceBySysId: vi.fn(() => ({
        adminGroupSysId: "admin", creatorUserSysId: "user-1", editorGroupSysId: "editor", icon: { type: "builtin", key: "docsera-workspace", label: "Docsera workspace icon" }, layout: { pageWidth: "readable", tocVisible: true }, name: "Docs", shortDescription: null, slug: "docs", status: "active", sysId: "workspace-1"
      }))
    });
    setAsset(staged({ state: "claimed", workspaceSysId: "workspace-1" }));
    createWorkspaceIconService(deps).retireClaimedWorkspaceIcon("wsi_asset", "workspace-1");
    expect(deps.deleteAttachment).toHaveBeenCalledWith("att-1");
    expect(deps.tryRetireClaimedAsset).toHaveBeenCalledWith("asset-1", "workspace-1", "att-1");
  });

  it("keeps the asset for retry when attachment deletion throws or remains present", () => {
    const replacementWorkspace = { adminGroupSysId: "admin", creatorUserSysId: "user-1", editorGroupSysId: "editor", icon: { type: "builtin" as const, key: "docsera-workspace", label: "Docsera workspace icon" }, layout: { pageWidth: "readable" as const, tocVisible: true }, name: "Docs", shortDescription: null, slug: "docs", status: "active" as const, sysId: "workspace-1" };
    const failedDelete = dependencies({ deleteAttachment: vi.fn(() => { throw new Error("interrupted"); }), loadWorkspaceBySysId: vi.fn(() => replacementWorkspace) });
    failedDelete.setAsset(staged({ state: "claimed", workspaceSysId: "workspace-1" }));
    expect(() => createWorkspaceIconService(failedDelete.deps).retireClaimedWorkspaceIcon("wsi_asset", "workspace-1")).toThrow("interrupted");
    expect(failedDelete.deps.tryRetireClaimedAsset).not.toHaveBeenCalled();

    const unverifiedDelete = dependencies({ deleteAttachment: vi.fn(), loadWorkspaceBySysId: vi.fn(() => replacementWorkspace) });
    unverifiedDelete.setAsset(staged({ state: "claimed", workspaceSysId: "workspace-1" }));
    createWorkspaceIconService(unverifiedDelete.deps).retireClaimedWorkspaceIcon("wsi_asset", "workspace-1");
    expect(unverifiedDelete.deps.tryRetireClaimedAsset).not.toHaveBeenCalled();
  });

  it("retires a completed creation-stage uploaded icon after Settings replaces or removes it", () => {
    for (const replacementIcon of [
      { type: "builtin" as const, key: "docsera-workspace", label: "Docsera workspace icon" },
      { type: "uploaded" as const, key: "wsi_replacement", label: "replacement.png", assetPath: "/icons/file?assetKey=wsi_replacement" }
    ]) {
      const replacementWorkspace = { adminGroupSysId: "admin", creatorUserSysId: "user-1", editorGroupSysId: "editor", icon: replacementIcon, layout: { pageWidth: "readable" as const, tocVisible: true }, name: "Docs", shortDescription: null, slug: "docs", status: "active" as const, sysId: "workspace-1" };
      const { deps, setAsset } = dependencies({
        loadProvisionRequestBySysId: vi.fn(() => ({ iconKey: "wsi_asset", iconType: "uploaded", state: "succeeded", sysId: "request-1", workspaceSysId: "workspace-1" })),
        loadWorkspaceBySysId: vi.fn(() => replacementWorkspace)
      });
      setAsset(staged({ state: "claimed", workspaceSysId: "workspace-1", provisionRequestSysId: "request-1" }));

      createWorkspaceIconService(deps).retireClaimedWorkspaceIcon("wsi_asset", "workspace-1");

      expect(deps.loadProvisionRequestBySysId).toHaveBeenCalledWith("request-1");
      expect(deps.deleteAttachment).toHaveBeenCalledWith("att-1");
      expect(deps.tryRetireClaimedAsset).toHaveBeenCalledWith("asset-1", "workspace-1", "att-1");
    }
  });

  it("retries an already-absent attachment and does not retire active, wrong-workspace, invalid, or unfinished/mismatched provisioning claims", () => {
    const replacementWorkspace = { adminGroupSysId: "admin", creatorUserSysId: "user-1", editorGroupSysId: "editor", icon: { type: "builtin" as const, key: "docsera-workspace", label: "Docsera workspace icon" }, layout: { pageWidth: "readable" as const, tocVisible: true }, name: "Docs", shortDescription: null, slug: "docs", status: "active" as const, sysId: "workspace-1" };
    const absent = dependencies({ loadWorkspaceBySysId: vi.fn(() => replacementWorkspace) });
    absent.setAsset(staged({ state: "claimed", workspaceSysId: "workspace-1" }));
    absent.setAttachmentPresent(false);
    const service = createWorkspaceIconService(absent.deps);
    service.retireObsoleteClaimedWorkspaceIcons("workspace-1");
    service.retireObsoleteClaimedWorkspaceIcons("workspace-1");
    expect(absent.deps.deleteAttachment).not.toHaveBeenCalled();
    expect(absent.deps.tryRetireClaimedAsset).toHaveBeenCalledTimes(2);

    const activeIcon = dependencies();
    activeIcon.setAsset(staged({ state: "claimed", workspaceSysId: "workspace-1" }));
    createWorkspaceIconService(activeIcon.deps).retireClaimedWorkspaceIcon("wsi_asset", "workspace-1");
    expect(activeIcon.deps.deleteAttachment).not.toHaveBeenCalled();

    const protectedAsset = dependencies({ loadWorkspaceBySysId: vi.fn(() => replacementWorkspace) });
    protectedAsset.setAsset(staged({ state: "claimed", workspaceSysId: "workspace-2" }));
    createWorkspaceIconService(protectedAsset.deps).retireClaimedWorkspaceIcon("wsi_asset", "workspace-1");
    expect(protectedAsset.deps.deleteAttachment).not.toHaveBeenCalled();
    for (const request of [
      { iconKey: "wsi_asset", iconType: "uploaded" as const, state: "requested" as const, sysId: "request-1", workspaceSysId: "workspace-1" },
      { iconKey: "wsi_asset", iconType: "uploaded" as const, state: "processing" as const, sysId: "request-1", workspaceSysId: "workspace-1" },
      { iconKey: "wsi_asset", iconType: "uploaded" as const, state: "failed" as const, sysId: "request-1", workspaceSysId: "workspace-1" },
      { iconKey: "wsi_asset", iconType: "uploaded" as const, state: "succeeded" as const, sysId: "request-2", workspaceSysId: "workspace-1" },
      { iconKey: "wsi_asset", iconType: "uploaded" as const, state: "succeeded" as const, sysId: "request-1", workspaceSysId: "workspace-2" },
      { iconKey: "wsi_asset", iconType: "builtin" as const, state: "succeeded" as const, sysId: "request-1", workspaceSysId: "workspace-1" },
      { iconKey: "other-icon", iconType: "uploaded" as const, state: "succeeded" as const, sysId: "request-1", workspaceSysId: "workspace-1" }
    ]) {
      vi.mocked(protectedAsset.deps.loadProvisionRequestBySysId).mockReturnValue(request);
      protectedAsset.setAsset(staged({ state: "claimed", workspaceSysId: "workspace-1", provisionRequestSysId: "request-1" }));
      createWorkspaceIconService(protectedAsset.deps).retireClaimedWorkspaceIcon("wsi_asset", "workspace-1");
    }
    expect(protectedAsset.deps.deleteAttachment).not.toHaveBeenCalled();

    const invalidAssociation = dependencies({
      getAttachmentBySysId: vi.fn(() => ({ contentType: "image/png", fileName: "icon.png", mediaId: "att-1", sizeBytes: validPng.length, tableName: DOCSERA_WORKSPACE_ICON_ASSET_TABLE, tableSysId: "other-asset" })),
      loadWorkspaceBySysId: vi.fn(() => replacementWorkspace)
    });
    invalidAssociation.setAsset(staged({ state: "claimed", workspaceSysId: "workspace-1" }));
    createWorkspaceIconService(invalidAssociation.deps).retireClaimedWorkspaceIcon("wsi_asset", "workspace-1");
    expect(invalidAssociation.deps.deleteAttachment).not.toHaveBeenCalled();
  });

  it("continues the bounded obsolete-icon scan after one attachment deletion fails", () => {
    const replacementWorkspace = { adminGroupSysId: "admin", creatorUserSysId: "user-1", editorGroupSysId: "editor", icon: { type: "builtin" as const, key: "docsera-workspace", label: "Docsera workspace icon" }, layout: { pageWidth: "readable" as const, tocVisible: true }, name: "Docs", shortDescription: null, slug: "docs", status: "active" as const, sysId: "workspace-1" };
    const first = staged({ assetKey: "wsi_failed", attachmentSysId: "att-failed", sysId: "asset-failed", state: "claimed", workspaceSysId: "workspace-1" });
    const second = staged({ assetKey: "wsi_retired", attachmentSysId: "att-retired", sysId: "asset-retired", state: "claimed", workspaceSysId: "workspace-1" });
    const attachments = new Set(["att-failed", "att-retired"]);
    const { deps } = dependencies({
      deleteAttachment: vi.fn((attachmentSysId: string) => {
        if (attachmentSysId === "att-failed") {
          throw new Error("interrupted");
        }
        attachments.delete(attachmentSysId);
      }),
      getAttachmentBySysId: vi.fn((attachmentSysId: string) => attachments.has(attachmentSysId) ? { contentType: "image/png", fileName: "icon.png", mediaId: attachmentSysId, sizeBytes: validPng.length, tableName: DOCSERA_WORKSPACE_ICON_ASSET_TABLE, tableSysId: attachmentSysId === "att-failed" ? "asset-failed" : "asset-retired" } : null),
      loadClaimedAssetsByWorkspace: vi.fn(() => [first, second]),
      loadWorkspaceBySysId: vi.fn(() => replacementWorkspace)
    });

    createWorkspaceIconService(deps).retireObsoleteClaimedWorkspaceIcons("workspace-1");

    expect(deps.deleteAttachment).toHaveBeenCalledWith("att-failed");
    expect(deps.deleteAttachment).toHaveBeenCalledWith("att-retired");
    expect(deps.tryRetireClaimedAsset).toHaveBeenCalledWith("asset-retired", "workspace-1", "att-retired");
    expect(deps.tryRetireClaimedAsset).not.toHaveBeenCalledWith("asset-failed", "workspace-1", "att-failed");
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
