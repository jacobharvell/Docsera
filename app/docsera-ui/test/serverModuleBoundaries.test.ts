import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const serverRoots = [join(packageRoot, "src", "server"), join(packageRoot, "src", "server", "api")];
const forbiddenSharedImportPattern = /\bfrom\s+['"]([^'"]+)['"]|\bimport\s+['"]([^'"]+)['"]/g;
const sharedDocumentWrapperPath = join(packageRoot, "src", "shared", "editor", "document.ts");
const serverDocumentWrapperPath = join(packageRoot, "src", "server", "pages", "serverEditorDocument.ts");
const sharedWorkspaceIconCatalogWrapperPath = join(packageRoot, "src", "shared", "workspaces", "workspaceIconCatalog.ts");
const serverWorkspaceIconCatalogPath = join(packageRoot, "src", "server", "workspaces", "serverWorkspaceIconCatalog.ts");
const serverWorkspaceDomainPath = join(packageRoot, "src", "server", "workspaces", "serverWorkspaceDomain.ts");
const serviceNowWorkspaceProvisioningPath = join(packageRoot, "src", "server", "workspaces", "serviceNowWorkspaceProvisioning.ts");
const serviceNowWorkspaceSettingsPath = join(packageRoot, "src", "server", "workspaces", "serviceNowWorkspaceSettings.ts");
const workspaceTablePath = join(packageRoot, "src", "fluent", "tables", "docsera-workspace.now.ts");
const globalBridgeQueueAccessPath = resolve(packageRoot, "..", "docsera-global-bridge", "src", "fluent", "security", "docsera-workspace-provisioning-queue-access.now.ts");
const globalBridgeVerifyPath = resolve(packageRoot, "..", "docsera-global-bridge", "scripts", "verify-global-bridge.mjs");
const globalBridgeUpdateSetGeneratorPath = resolve(
  packageRoot,
  "..",
  "docsera-global-bridge",
  "scripts",
  "generate-update-set-artifact.mjs"
);
const globalBridgeUpdateSetManifestPath = resolve(
  packageRoot,
  "..",
  "docsera-global-bridge",
  "update-set",
  "docsera-global-workspace-bridge.update-set.json"
);
const globalBridgeUpdateSetXmlPath = resolve(
  packageRoot,
  "..",
  "docsera-global-bridge",
  "update-set",
  "sys_remote_update_set_docsera_global_workspace_provisioning_worker_queue_0_1_0_companion.xml"
);
const globalBridgeWorkerPath = resolve(packageRoot, "..", "docsera-global-bridge", "src", "server", "script-includes", "docsera-global-workspace-provisioning-bridge.js");
const globalMembershipBridgeAccessPath = join(packageRoot, "src", "fluent", "security", "docsera-workspace-membership-bridge-access.now.ts");
const globalMembershipBridgePath = resolve(packageRoot, "..", "docsera-global-bridge", "src", "server", "script-includes", "docsera-global-workspace-membership-bridge.js");
const globalBridgeBusinessRulePath = resolve(packageRoot, "..", "docsera-global-bridge", "src", "fluent", "business-rules", "docsera-workspace-provision-request-worker.now.ts");
const explicitSourceExtensionPattern = /\.(?:ts|tsx)$/;

function collectFiles(dir: string): string[] {
  const entries: string[] = [];
  for (const child of readdirSync(dir, { withFileTypes: true })) {
    const absolute = join(dir, child.name);
    if (child.isDirectory()) {
      entries.push(...collectFiles(absolute));
      continue;
    }

    if (child.isFile() && /\.(?:ts|tsx)$/.test(child.name) && !/\.test\.(?:ts|tsx)$/.test(child.name)) {
      entries.push(absolute);
    }
  }

  return entries;
}

function isForbiddenSharedImport(specifier: string): boolean {
  return (
    specifier === "../shared" ||
    specifier === "../../shared" ||
    specifier.startsWith("../shared/") ||
    specifier.startsWith("../../shared/")
  );
}

function isRelativeImport(specifier: string): boolean {
  return specifier.startsWith("./") || specifier.startsWith("../");
}

function isAllowedSharedImport(file: string, specifier: string): boolean {
  return false;
}

describe("server module boundaries", () => {
  it("keeps server runtime imports out of shared helper paths", () => {
    const offenders: Array<{ file: string; specifier: string }> = [];

    for (const root of serverRoots) {
      for (const file of collectFiles(root)) {
        const sourceText = readFileSync(file, "utf8");
        for (const match of sourceText.matchAll(forbiddenSharedImportPattern)) {
          const specifier = (match[1] ?? match[2] ?? "").trim();
          if (specifier && isForbiddenSharedImport(specifier) && !isAllowedSharedImport(file, specifier)) {
            offenders.push({
              file: relative(packageRoot, file),
              specifier
            });
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps the authoritative document contract inside the deployable server module graph", () => {
    expect(existsSync(serverDocumentWrapperPath)).toBe(true);

    const serverWrapperSource = readFileSync(serverDocumentWrapperPath, "utf8");
    expect(serverWrapperSource).not.toContain("../editor/docseraDocumentContract.ts");

    const sharedWrapperSource = readFileSync(sharedDocumentWrapperPath, "utf8");
    expect(sharedWrapperSource).toContain("../../server/pages/serverEditorDocument");
  });

  it("keeps the authoritative workspace icon catalog inside the deployable server module graph", () => {
    expect(existsSync(serverWorkspaceIconCatalogPath)).toBe(true);

    const serverWorkspaceDomainSource = readFileSync(serverWorkspaceDomainPath, "utf8");
    expect(serverWorkspaceDomainSource).toContain("./serverWorkspaceIconCatalog.ts");
    expect(serverWorkspaceDomainSource).not.toContain("../../shared/workspaces/workspaceIconCatalog");

    const sharedWrapperSource = readFileSync(sharedWorkspaceIconCatalogWrapperPath, "utf8");
    expect(sharedWrapperSource).toContain("../../server/workspaces/serverWorkspaceIconCatalog");
  });

  it("keeps server runtime imports on explicit source-file specifiers", () => {
    const offenders: Array<{ file: string; specifier: string }> = [];

    for (const root of serverRoots) {
      for (const file of collectFiles(root)) {
        const sourceText = readFileSync(file, "utf8");
        for (const match of sourceText.matchAll(forbiddenSharedImportPattern)) {
          const specifier = (match[1] ?? match[2] ?? "").trim();
          if (!specifier || !isRelativeImport(specifier)) {
            continue;
          }

          if (!explicitSourceExtensionPattern.test(specifier)) {
            offenders.push({
              file: relative(packageRoot, file),
              specifier
            });
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps page publish and discard paths free of media deletion behavior", () => {
    const guardedFiles = [
      join(packageRoot, "src", "server", "api", "docsera-runtime-page-delete.ts"),
      join(packageRoot, "src", "server", "api", "docsera-runtime-page-delete-action.ts"),
      join(packageRoot, "src", "server", "api", "docsera-runtime-page-publish.ts"),
      join(packageRoot, "src", "server", "api", "docsera-runtime-workspace-discard-all.ts"),
      join(packageRoot, "src", "server", "api", "docsera-runtime-workspace-discard-page.ts")
    ];

    const offenders = guardedFiles.filter((file) => {
      const sourceText = readFileSync(file, "utf8");
      return sourceText.includes("deleteAttachment") || sourceText.includes("workspace-media");
    });

    expect(offenders).toEqual([]);
  });

  it("keeps uploaded workspace icon finalization before global provisioning success", () => {
    const sourceText = readFileSync(globalBridgeWorkerPath, "utf8");
    const workspaceCreateIndex = sourceText.indexOf("stage = 'create_workspace'");
    const iconFinalizeIndex = sourceText.indexOf("stage = 'finalize_uploaded_icon'");
    const markSucceededIndex = sourceText.indexOf("stage = 'mark_succeeded'");

    expect(workspaceCreateIndex).toBeGreaterThanOrEqual(0);
    expect(iconFinalizeIndex).toBeGreaterThan(workspaceCreateIndex);
    expect(markSucceededIndex).toBeGreaterThan(iconFinalizeIndex);
    expect(sourceText).toContain("_finalizeUploadedIconAsset");
    expect(sourceText).toContain("_rollbackCreatedWorkspace");
    expect(sourceText).toContain("_restoreUploadedIconAssetClaim");
    expect(sourceText).toContain("workspace_icon_finalize_failed");
  });

  it("keeps the global provisioning worker insert-triggered for requested rows only", () => {
    const sourceText = readFileSync(globalBridgeBusinessRulePath, "utf8");

    expect(sourceText).toContain('action: ["insert"]');
    expect(sourceText).not.toContain('"update"');
    expect(sourceText).toContain('filterCondition: "state=requested"');
  });

  it("keeps uploaded workspace provisioning requests claimed and canonicalized before one requested insert", () => {
    const sourceText = readFileSync(serviceNowWorkspaceProvisioningPath, "utf8");
    const futureIdIndex = sourceText.indexOf("allocateProvisionRequestSysId(record)");
    const claimIndex = sourceText.indexOf("iconService.claimWorkspaceIcon");
    const canonicalTypeIndex = sourceText.indexOf('record.setValue("icon_type", claim.icon.type)');
    const canonicalPathIndex = sourceText.indexOf('record.setValue("icon_asset_path", claim.icon.assetPath)');
    const uploadedInsertIndex = sourceText.indexOf("const insertedRequestId = cleanText(record.insert());", canonicalPathIndex);

    expect(futureIdIndex).toBeGreaterThanOrEqual(0);
    expect(claimIndex).toBeGreaterThan(futureIdIndex);
    expect(canonicalTypeIndex).toBeGreaterThan(claimIndex);
    expect(canonicalPathIndex).toBeGreaterThan(canonicalTypeIndex);
    expect(uploadedInsertIndex).toBeGreaterThan(canonicalPathIndex);
    expect(sourceText).toContain('record.setValue("state", "requested");');
    expect(sourceText).not.toContain('record.setValue("state", "processing")');
    expect(sourceText).not.toContain('draft.icon.type === "uploaded" ? "processing" : "requested"');
    expect(sourceText).not.toContain("record.update()");
  });

  it("keeps global rollback delete executable through both cross-scope privilege and scoped table access", () => {
    const workspaceTableSource = readFileSync(workspaceTablePath, "utf8");
    const bridgeAccessSource = readFileSync(globalBridgeQueueAccessPath, "utf8");

    expect(workspaceTableSource).toContain('actions: ["read", "create", "update", "delete"]');
    expect(bridgeAccessSource).toContain('$id: Now.ID["docsera-workspace-delete"]');
    expect(bridgeAccessSource).toContain('operation: "delete"');
    expect(bridgeAccessSource).toContain('targetName: "x_82900_docsera_workspace"');
    expect(readFileSync(globalBridgeVerifyPath, "utf8")).toContain("delete_access");
  });

  it("keeps workspace membership mutation constrained by scoped execute privilege and workspace group-pair validation", () => {
    const accessSource = readFileSync(globalMembershipBridgeAccessPath, "utf8");
    const bridgeSource = readFileSync(globalMembershipBridgePath, "utf8");
    const verifierSource = readFileSync(globalBridgeVerifyPath, "utf8");

    expect(accessSource).toContain('$id: Now.ID["docsera-global-workspace-membership-bridge-execute"]');
    expect(accessSource).toContain('operation: "execute"');
    expect(accessSource).toContain('targetName: "global.DocseraGlobalWorkspaceMembershipBridge"');
    expect(accessSource).toContain('targetScope: "global"');
    expect(accessSource).toContain('targetType: "sys_script_include"');

    expect(bridgeSource).toContain("_validateWorkspaceGroupPair");
    expect(bridgeSource).toContain("new GlideRecord('x_82900_docsera_workspace')");
    expect(bridgeSource).toContain("workspace.addQuery('admin_group', adminGroupSysId)");
    expect(bridgeSource).toContain("workspace.addQuery('editor_group', editorGroupSysId)");

    expect(verifierSource).toContain("source_scope=${defaults.scopedScopeId}");
    expect(verifierSource).toContain("target_type=sys_script_include");
    expect(verifierSource).toContain("target_name=global.${defaults.membershipBridgeName}");
    expect(verifierSource).toContain("operation=${defaults.rca.operationExecuteApi}");
    expect(verifierSource).toContain("status=allowed");
    expect(verifierSource).toContain('table: "sys_restricted_caller_access"');
    expect(verifierSource).toContain("target_table=sys_script_include");
    expect(verifierSource).toContain("isAllowedAccessValue(membershipBridgeRestrictedCallerAccessRecord?.status)");
    expect(verifierSource).toContain('sourceTypeScope: "5"');
    expect(verifierSource).toContain('statusAllowed: "2"');
    expect(verifierSource).toContain('targetTypeScriptInclude: "2"');
    expect(verifierSource).toContain('rcaTypeRealRca: "real_rca"');
    expect(verifierSource).toContain('cleanText(membershipBridgeRestrictedCallerAccessRecord?.sys_scope) === "global"');
  });

  it("keeps the global companion artifact generator responsible for membership bridge restricted caller access", () => {
    const generatorSource = readFileSync(globalBridgeUpdateSetGeneratorPath, "utf8");
    const manifest = JSON.parse(readFileSync(globalBridgeUpdateSetManifestPath, "utf8")) as {
      records: Array<{ table: string; targetName: string; sourceFile: string }>;
    };
    const updateSetXml = readFileSync(globalBridgeUpdateSetXmlPath, "utf8");

    expect(generatorSource).toContain("buildRestrictedCallerAccessRecords");
    expect(generatorSource).toContain('"sys_restricted_caller_access"');
    expect(generatorSource).toContain('sourceTypeScope: "5"');
    expect(generatorSource).toContain('statusAllowed: "2"');
    expect(generatorSource).toContain('targetTypeScriptInclude: "2"');
    expect(generatorSource).toContain('rcaTypeRealRca: "real_rca"');
    expect(generatorSource).toContain('"DocseraGlobalWorkspaceMembershipBridge"');
    expect(generatorSource).toContain('"global.DocseraGlobalWorkspaceMembershipBridge"');
    expect(generatorSource).toContain('"sys_script_include"');
    expect(generatorSource).toContain('operationExecuteApi: "execute"');
    expect(generatorSource).toContain("[...baseRecords, ...restrictedCallerAccessRecords, ...builtRecords]");

    expect(
      manifest.records.some((record) => {
        return (
          record.table === "sys_restricted_caller_access" &&
          record.targetName === "global.DocseraGlobalWorkspaceMembershipBridge" &&
          record.sourceFile.startsWith("synthetic/sys_restricted_caller_access_")
        );
      })
    ).toBe(true);
    expect(updateSetXml).toContain("&lt;record_update table=&quot;sys_restricted_caller_access&quot;&gt;");
    expect(updateSetXml).toContain("&lt;rca_type&gt;real_rca&lt;/rca_type&gt;");
    expect(updateSetXml).toContain("&lt;source_scope display_value=&quot;x_82900_docsera&quot;&gt;6997f092c3fd8310c569bf0d0501314d&lt;/source_scope&gt;");
    expect(updateSetXml).toContain("&lt;source_type&gt;5&lt;/source_type&gt;");
    expect(updateSetXml).toContain("&lt;target display_value=&quot;DocseraGlobalWorkspaceMembershipBridge&quot;&gt;5bf5c028daaa417d88de36616e4c8300&lt;/target&gt;");
    expect(updateSetXml).toContain("&lt;target_type&gt;2&lt;/target_type&gt;");
    expect(updateSetXml).toContain("&lt;operation&gt;execute&lt;/operation&gt;");
    expect(updateSetXml).toContain("&lt;status&gt;2&lt;/status&gt;");
    expect(updateSetXml).toContain("&lt;sys_scope display_value=&quot;Global&quot;&gt;global&lt;/sys_scope&gt;");
  });

  it("keeps workspace settings outside the workspace edit lease module boundary", () => {
    const sourceText = readFileSync(serviceNowWorkspaceSettingsPath, "utf8");

    expect(sourceText).toContain("applyWorkspaceSettings");
    expect(sourceText).toContain("canAdminWorkspace");
    expect(sourceText).not.toContain("workspaceEditLease");
    expect(sourceText).not.toContain("verifyWorkspaceEditLease");
    expect(sourceText).not.toContain("workspaceLeaseToken");
  });
});
