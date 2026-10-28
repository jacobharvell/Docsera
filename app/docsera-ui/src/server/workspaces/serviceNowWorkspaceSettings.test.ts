import { describe, expect, it, vi } from "vitest";
import { applyWorkspaceSettings, type WorkspaceRecord } from "./serverWorkspaceDomain.ts";
import { mapWorkspaceRecord } from "./serviceNowWorkspaceRecords.ts";
import { createWorkspaceSettingsService } from "./serviceNowWorkspaceSettings.ts";

function workspace(overrides: Partial<WorkspaceRecord> = {}): WorkspaceRecord {
  return {
    adminGroupSysId: "admin-group",
    creatorUserSysId: "creator-1",
    editorGroupSysId: "editor-group",
    icon: {
      type: "builtin",
      key: "docsera-workspace",
      label: "Docsera workspace icon"
    },
    layout: {
      pageWidth: "full",
      tocVisible: true
    },
    name: "Platform Docs",
    pendingChangeSetSysId: "change-set-1",
    publishedSnapshotSetSysId: "snapshot-set-1",
    shortDescription: "Original description",
    slug: "platform-docs",
    status: "active",
    sysId: "workspace-1",
    workspaceStateRevision: 7,
    ...overrides
  };
}

function service(overrides: {
  canAdminWorkspace?: boolean;
  currentWorkspace?: WorkspaceRecord | null;
  savedWorkspace?: WorkspaceRecord | null;
} = {}) {
  const currentWorkspace = overrides.currentWorkspace === undefined ? workspace() : overrides.currentWorkspace;
  const savedWorkspace = overrides.savedWorkspace === undefined ? currentWorkspace : overrides.savedWorkspace;
  const deps = {
    evaluateWorkspaceCapabilities: vi.fn(() => ({
      canAdminWorkspace: overrides.canAdminWorkspace ?? true,
      canEditWorkspace: overrides.canAdminWorkspace ?? true,
      canManageWorkspaceMembers: overrides.canAdminWorkspace ?? true,
      canViewWorkspace: true
    })),
    loadWorkspaceBySlug: vi.fn(async () => currentWorkspace),
    loadWorkspaceBySysId: vi.fn(async () => currentWorkspace),
    saveWorkspaceSettings: vi.fn(async () => savedWorkspace)
  };

  return {
    deps,
    settingsService: createWorkspaceSettingsService(deps)
  };
}

function workspaceRecord(values: Record<string, unknown> = {}) {
  const fields: Record<string, unknown> = {
    admin_group: "admin-group",
    creator: "creator-1",
    editor_group: "editor-group",
    icon_asset_path: "",
    icon_key: "docsera-workspace",
    icon_label: "Docsera workspace icon",
    icon_type: "builtin",
    name: "Platform Docs",
    page_width: "full",
    pending_change_set: "change-set-1",
    published_snapshot_set: "snapshot-set-1",
    short_description: "Original description",
    status: "active",
    toc_default_visible: "1",
    workspace_slug: "platform-docs",
    workspace_state_revision: "7",
    ...values
  };

  return {
    getUniqueValue: () => "workspace-1",
    getValue: (fieldName: string) => fields[fieldName] ?? "",
    getDisplayValue: (fieldName: string) => {
      if (fieldName === "creator") {
        return "Creator One";
      }

      if (fieldName === "sys_created_on") {
        return "2026-09-01 10:00:00";
      }

      if (fieldName === "sys_updated_on") {
        return "2026-09-02 10:00:00";
      }

      if (fieldName === "sys_updated_by") {
        return "admin";
      }

      return "";
    }
  };
}

describe("workspace settings domain", () => {
  it("requires a matching existing workspace identity and a non-empty workspace name", () => {
    const current = workspace();

    expect(
      applyWorkspaceSettings(current, {
        name: "Renamed",
        workspaceSlug: "wrong",
        workspaceSysId: "workspace-1"
      })
    ).toMatchObject({ valid: false, error: "Workspace could not be found." });

    expect(
      applyWorkspaceSettings(current, {
        name: " ",
        workspaceSlug: "platform-docs",
        workspaceSysId: "workspace-1"
      })
    ).toMatchObject({ valid: false, error: "Workspace name is required." });
  });

  it("normalizes short description, enforces field limits, and persists the ToC default boolean", () => {
    const current = workspace();
    const result = applyWorkspaceSettings(current, {
      layout: { tocVisible: false },
      name: "  Renamed Docs  ",
      shortDescription: "  A tighter purpose  ",
      workspaceSlug: "platform-docs",
      workspaceSysId: "workspace-1"
    });

    expect(result).toMatchObject({
      valid: true,
      workspace: {
        name: "Renamed Docs",
        shortDescription: "A tighter purpose",
        layout: {
          pageWidth: "full",
          tocVisible: false
        }
      }
    });

    expect(
      applyWorkspaceSettings(current, {
        name: "Renamed Docs",
        shortDescription: "x".repeat(241),
        workspaceSysId: "workspace-1"
      })
    ).toMatchObject({ valid: false, error: "Short description must be 240 characters or fewer." });
  });

  it("canonicalizes controlled built-in icons and accepts only canonical uploaded icon metadata", () => {
    const current = workspace();

    expect(
      applyWorkspaceSettings(current, {
        icon: { type: "builtin", key: "security", label: "Forged" },
        name: "Platform Docs",
        workspaceSysId: "workspace-1"
      })
    ).toMatchObject({
      valid: true,
      workspace: {
        icon: {
          type: "builtin",
          key: "security",
          label: "Security"
        }
      }
    });

    expect(
      applyWorkspaceSettings(current, {
        icon: { type: "builtin", key: "not-real", label: "Forged" },
        name: "Platform Docs",
        workspaceSysId: "workspace-1"
      })
    ).toMatchObject({ valid: false, error: "Unsupported built-in workspace icon." });

    expect(
      applyWorkspaceSettings(current, {
        icon: { type: "uploaded", key: "wsi_new", label: "icon.png", assetPath: "/icons/file?assetKey=wsi_new" },
        name: "Platform Docs",
        workspaceSysId: "workspace-1"
      })
    ).toMatchObject({
      valid: true,
      workspace: {
        icon: {
          type: "uploaded",
          key: "wsi_new",
          label: "icon.png",
          assetPath: "/icons/file?assetKey=wsi_new"
        }
      }
    });
  });

  it("preserves uploaded icons and unrelated workspace state when icon is omitted", () => {
    const current = workspace({
      icon: {
        type: "uploaded",
        key: "wsi_existing",
        label: "existing.png",
        assetPath: "/icons/file?assetKey=wsi_existing"
      }
    });

    const result = applyWorkspaceSettings(current, {
      layout: { tocVisible: false },
      name: "Renamed Docs",
      shortDescription: "",
      workspaceSlug: "platform-docs",
      workspaceSysId: "workspace-1"
    });

    expect(result).toEqual({
      valid: true,
      workspace: {
        ...current,
        name: "Renamed Docs",
        shortDescription: null,
        layout: {
          pageWidth: "full",
          tocVisible: false
        }
      }
    });
  });
});

describe("workspace record mapping", () => {
  it.each([
    ["1", true],
    ["0", false],
    ["true", true],
    ["false", false]
  ])("normalizes persisted ToC default value %o to %s", (persistedValue, expectedVisible) => {
    expect(mapWorkspaceRecord(workspaceRecord({ toc_default_visible: persistedValue })).layout.tocVisible).toBe(expectedVisible);
  });

  it("preserves existing workspace identity, icon, settings, and metadata projection", () => {
    expect(mapWorkspaceRecord(workspaceRecord())).toEqual({
      adminGroupSysId: "admin-group",
      createdOn: "2026-09-01 10:00:00",
      creatorUserName: "Creator One",
      creatorUserSysId: "creator-1",
      editorGroupSysId: "editor-group",
      icon: {
        key: "docsera-workspace",
        label: "Docsera workspace icon",
        type: "builtin"
      },
      layout: {
        pageWidth: "full",
        tocVisible: true
      },
      name: "Platform Docs",
      pendingChangeSetSysId: "change-set-1",
      publishedSnapshotSetSysId: "snapshot-set-1",
      shortDescription: "Original description",
      slug: "platform-docs",
      status: "active",
      sysId: "workspace-1",
      updatedBy: "admin",
      updatedOn: "2026-09-02 10:00:00",
      workspaceStateRevision: 7
    });
  });
});

describe("workspace settings service", () => {
  it("allows Docsera Admin or Workspace Admin capability to save settings", async () => {
    const { deps, settingsService } = service({ canAdminWorkspace: true });

    await expect(
      settingsService.saveWorkspaceSettings({
        layout: { tocVisible: false },
        name: "Renamed Docs",
        workspaceSlug: "platform-docs",
        workspaceSysId: "workspace-1"
      })
    ).resolves.toMatchObject({
      kind: "succeeded",
      workspace: {
        sysId: "workspace-1"
      }
    });

    expect(deps.evaluateWorkspaceCapabilities).toHaveBeenCalledWith(workspace());
    expect(deps.saveWorkspaceSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "Renamed Docs",
        slug: "platform-docs",
        adminGroupSysId: "admin-group",
        editorGroupSysId: "editor-group",
        status: "active",
        pendingChangeSetSysId: "change-set-1",
        publishedSnapshotSetSysId: "snapshot-set-1",
        workspaceStateRevision: 7,
        layout: {
          pageWidth: "full",
          tocVisible: false
        }
      })
    );
  });

  it.each([
    [true, "1"],
    [false, "0"]
  ])("preserves saved ToC default %s through canonical record projection", async (tocVisible, persistedValue) => {
    let storedTocDefault = persistedValue;
    const currentWorkspace = workspace({ layout: { pageWidth: "full", tocVisible: !tocVisible } });
    const saveWorkspaceSettings = vi.fn(async (savedWorkspace: WorkspaceRecord) => {
      storedTocDefault = savedWorkspace.layout.tocVisible ? "1" : "0";
      return mapWorkspaceRecord(workspaceRecord({ toc_default_visible: storedTocDefault }));
    });
    const settingsWithCanonicalProjection = createWorkspaceSettingsService({
      evaluateWorkspaceCapabilities: vi.fn(() => ({
        canAdminWorkspace: true,
        canEditWorkspace: true,
        canManageWorkspaceMembers: true,
        canViewWorkspace: true
      })),
      loadWorkspaceBySlug: vi.fn(async () => currentWorkspace),
      loadWorkspaceBySysId: vi.fn(async () => currentWorkspace),
      saveWorkspaceSettings
    });

    await expect(
      settingsWithCanonicalProjection.saveWorkspaceSettings({
        layout: { tocVisible },
        name: "Platform Docs",
        workspaceSlug: "platform-docs",
        workspaceSysId: "workspace-1"
      })
    ).resolves.toMatchObject({
      kind: "succeeded",
      workspace: {
        layout: {
          tocVisible
        }
      }
    });

    expect(storedTocDefault).toBe(persistedValue);
    expect(saveWorkspaceSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        layout: {
          pageWidth: "full",
          tocVisible
        }
      })
    );
  });

  it("rejects editor or read-only users before persistence", async () => {
    const { deps, settingsService } = service({ canAdminWorkspace: false });

    await expect(
      settingsService.saveWorkspaceSettings({
        name: "Renamed Docs",
        workspaceSysId: "workspace-1"
      })
    ).resolves.toMatchObject({ kind: "forbidden" });

    expect(deps.saveWorkspaceSettings).not.toHaveBeenCalled();
  });

  it("claims staged uploaded icon replacement only after settings authorization and rolls back on save failure", async () => {
    const currentWorkspace = workspace();
    const restoreWorkspaceIconClaim = vi.fn();
    const claimWorkspaceSettingsIcon = vi.fn(() => ({
        asset: {
          assetKey: "wsi_new",
          attachmentSysId: "att-1",
          contentType: "image/png",
          fileName: "icon.png",
          format: "png",
          height: 128,
          provisionRequestSysId: "",
          requestedBy: "user-1",
          sizeBytes: 128,
          state: "claimed",
          sysId: "asset-1",
          width: 128,
          workspaceSysId: "workspace-1"
        },
        icon: { assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=wsi_new", key: "wsi_new", label: "icon.png", type: "uploaded" },
        kind: "succeeded"
      } as const));
    const settingsWithIconClaim = createWorkspaceSettingsService({
      claimWorkspaceSettingsIcon,
      evaluateWorkspaceCapabilities: vi.fn(() => ({
        canAdminWorkspace: true,
        canEditWorkspace: true,
        canManageWorkspaceMembers: true,
        canViewWorkspace: true
      })),
      loadWorkspaceBySlug: vi.fn(async () => currentWorkspace),
      loadWorkspaceBySysId: vi.fn(async () => currentWorkspace),
      restoreWorkspaceIconClaim,
      saveWorkspaceSettings: vi.fn(async () => null)
    });

    await expect(
      settingsWithIconClaim.saveWorkspaceSettings({
        icon: { type: "uploaded", key: "wsi_new", label: "forged", assetPath: "/forged" },
        name: "Platform Docs",
        workspaceSysId: "workspace-1"
      })
    ).resolves.toMatchObject({ kind: "failed", status: 500 });
    expect(claimWorkspaceSettingsIcon).toHaveBeenCalledWith("wsi_new", "workspace-1");
    expect(restoreWorkspaceIconClaim).toHaveBeenCalledWith("asset-1", { workspaceSysId: "workspace-1" });
  });

  it("retires a prior uploaded icon only after successful authoritative replacement", async () => {
    const currentWorkspace = workspace({
      icon: { type: "uploaded", key: "wsi_old", label: "old.png", assetPath: "/icons/file?assetKey=wsi_old" }
    });
    const retireClaimedWorkspaceIcon = vi.fn();
    const settingsWithCleanup = createWorkspaceSettingsService({
      claimWorkspaceSettingsIcon: vi.fn(() => ({
        asset: {
          assetKey: "wsi_new",
          attachmentSysId: "att-1",
          contentType: "image/png",
          fileName: "icon.png",
          format: "png",
          height: 128,
          provisionRequestSysId: "",
          requestedBy: "user-1",
          sizeBytes: 128,
          state: "claimed",
          sysId: "asset-1",
          width: 128,
          workspaceSysId: "workspace-1"
        },
        icon: { assetPath: "/api/x_82900_docsera/docsera_runtime/workspaces/icons/file?assetKey=wsi_new", key: "wsi_new", label: "icon.png", type: "uploaded" },
        kind: "succeeded"
      })),
      evaluateWorkspaceCapabilities: vi.fn(() => ({
        canAdminWorkspace: true,
        canEditWorkspace: true,
        canManageWorkspaceMembers: true,
        canViewWorkspace: true
      })),
      loadWorkspaceBySlug: vi.fn(async () => currentWorkspace),
      loadWorkspaceBySysId: vi.fn(async () => currentWorkspace),
      restoreWorkspaceIconClaim: vi.fn(),
      retireClaimedWorkspaceIcon,
      saveWorkspaceSettings: vi.fn(async (saved: WorkspaceRecord) => saved)
    });

    await expect(
      settingsWithCleanup.saveWorkspaceSettings({
        icon: { type: "uploaded", key: "wsi_new", label: "forged", assetPath: "/forged" },
        name: "Platform Docs",
        workspaceSysId: "workspace-1"
      })
    ).resolves.toMatchObject({ kind: "succeeded" });
    expect(retireClaimedWorkspaceIcon).toHaveBeenCalledWith("wsi_old", "workspace-1");
  });

  it("retries bounded obsolete-icon retirement after every successful authorized settings save", async () => {
    const currentWorkspace = workspace({
      icon: { type: "uploaded", key: "wsi_current", label: "current.png", assetPath: "/icons/file?assetKey=wsi_current" }
    });
    const retireObsoleteClaimedWorkspaceIcons = vi.fn();
    const settingsWithRetry = createWorkspaceSettingsService({
      evaluateWorkspaceCapabilities: vi.fn(() => ({ canAdminWorkspace: true, canEditWorkspace: true, canManageWorkspaceMembers: true, canViewWorkspace: true })),
      loadWorkspaceBySlug: vi.fn(async () => currentWorkspace),
      loadWorkspaceBySysId: vi.fn(async () => currentWorkspace),
      retireObsoleteClaimedWorkspaceIcons,
      saveWorkspaceSettings: vi.fn(async (saved: WorkspaceRecord) => saved)
    });

    await expect(settingsWithRetry.saveWorkspaceSettings({ workspaceSlug: "platform-docs", workspaceSysId: "workspace-1", name: "Platform Docs", icon: { type: "builtin", key: "docsera-workspace", label: "Docsera workspace icon" } })).resolves.toMatchObject({ kind: "succeeded" });
    expect(retireObsoleteClaimedWorkspaceIcons).toHaveBeenCalledWith("workspace-1");
  });

  it("rejects missing or mismatched workspace identity before persistence", async () => {
    const { deps, settingsService } = service();

    await expect(
      settingsService.saveWorkspaceSettings({
        name: "Renamed Docs"
      })
    ).resolves.toMatchObject({ kind: "failed", status: 400 });

    await expect(
      settingsService.saveWorkspaceSettings({
        name: "Renamed Docs",
        workspaceSlug: "wrong",
        workspaceSysId: "workspace-1"
      })
    ).resolves.toMatchObject({ kind: "failed", status: 404 });

    expect(deps.saveWorkspaceSettings).not.toHaveBeenCalled();
  });
});
