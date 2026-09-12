#!/usr/bin/env node

import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sdkCliPath = fileURLToPath(new URL("../node_modules/@servicenow/sdk/bin/index.js", import.meta.url));

const defaults = {
  authAlias: "docsera-pdi",
  membershipBridgeName: "DocseraGlobalWorkspaceMembershipBridge",
  workerName: "DocseraGlobalWorkspaceProvisioningBridge",
  workerRuleName: "Docsera Workspace Provision Request Worker",
  packageRuntimePathPrefix: "/global/docsera-global-workspace-bridge/0.1.0/",
  expectedPackageResolverVersion: "2.0.0",
  expectedPackageJsonPath: "/global/docsera-global-workspace-bridge/0.1.0/package.json",
  expectedGlobalJsLevel: "es_latest",
  expectedRuntimeAccessTracking: "permissive",
  scopedRequestTable: "x_82900_docsera_workspace_provision_request",
  scopedWorkspaceIconAssetTable: "x_82900_docsera_workspace_icon_asset",
  scopedWorkspaceTable: "x_82900_docsera_workspace",
  scopedScopeId: "6997f092c3fd8310c569bf0d0501314d",
  rca: Object.freeze({
    operationExecuteApi: "execute",
    rcaTypeRealRca: "real_rca",
    sourceTypeScope: "5",
    statusAllowed: "2",
    targetTypeScriptInclude: "2"
  })
};

function readEnv(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function getOptionValue(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function runQuery({ authAlias, table, query, fields }) {
  const result = spawnSync(
    process.execPath,
    [
      sdkCliPath,
      "query",
      table,
      "-a",
      authAlias,
      "-q",
      query,
      "-f",
      fields,
      "-o",
      "json"
    ],
    {
      cwd: process.cwd(),
      encoding: "utf8"
    }
  );

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const stderr = typeof result.stderr === "string" ? result.stderr.trim() : "";
    const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
    throw new Error(stderr || stdout || `Query ${table} failed.`);
  }

  const stdout = typeof result.stdout === "string" ? result.stdout.trim() : "";
  const payload = JSON.parse(stdout);
  if (!payload.ok) {
    throw new Error(payload.error?.message ?? `Query ${table} failed.`);
  }

  return payload.records;
}

function printCheck(ok, label, detail = "") {
  console.log(`${ok ? "[pass]" : "[fail]"} ${label}`);
  if (!ok && detail) {
    console.log(`       ${detail}`);
  }
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeBoolean(value) {
  const normalized = cleanText(value).toLowerCase();
  return value === true || value === 1 || normalized === "true" || normalized === "1" || normalized === "yes";
}

function isRestrictedCallerValue(value) {
  const normalized = cleanText(value);
  return normalized === "2" || normalized.toLowerCase() === "restriction";
}

function isAllowedAccessValue(value) {
  return cleanText(value) === defaults.rca.statusAllowed;
}

function isScopeSourceValue(value) {
  return cleanText(value) === defaults.rca.sourceTypeScope;
}

function isScriptIncludeTargetValue(value) {
  return cleanText(value) === defaults.rca.targetTypeScriptInclude;
}

function main() {
  const parsedArgs = parseArgs({
    allowPositionals: false,
    options: {
      "auth-alias": { type: "string" },
      help: { type: "boolean", short: "h" }
    },
    args: process.argv.slice(2)
  });

  if (parsedArgs.values.help) {
    console.log("Usage: node ./scripts/verify-global-bridge.mjs [--auth-alias <alias>]");
    return;
  }

  const authAlias =
    getOptionValue(parsedArgs.values["auth-alias"]) ??
    readEnv("DOCSERA_SDK_AUTH_ALIAS", "SN_SDK_AUTH_ALIAS") ??
    defaults.authAlias;

  const checks = [];

  console.log("Docsera global workspace worker verification");
  console.log("");
  console.log(`Auth alias: ${authAlias}`);
  console.log("");

  const workerRecords = runQuery({
    authAlias,
    table: "sys_script_include",
    query: `name=${defaults.workerName}`,
    fields: "sys_id,name,api_name,access,caller_access,sys_scope"
  });
  const workerRecord = workerRecords[0] ?? null;

  checks.push({
    ok: workerRecords.length === 1,
    label: "global worker script include is installed",
    detail: JSON.stringify(workerRecords)
  });
  checks.push({
    ok: workerRecords.length <= 1,
    label: "global worker script include is not duplicated",
    detail: JSON.stringify(workerRecords)
  });
  checks.push({
    ok: cleanText(workerRecord?.api_name) === `global.${defaults.workerName}`,
    label: "global worker api_name matches expected value",
    detail: JSON.stringify(workerRecord)
  });
  checks.push({
    ok: cleanText(workerRecord?.access) === "package_private",
    label: "global worker script include is package-private",
    detail: JSON.stringify(workerRecord)
  });
  checks.push({
    ok: cleanText(workerRecord?.sys_scope) === "global",
    label: "global worker script include is installed in the global scope",
    detail: JSON.stringify(workerRecord)
  });

  const membershipBridgeRecords = runQuery({
    authAlias,
    table: "sys_script_include",
    query: `name=${defaults.membershipBridgeName}`,
    fields: "sys_id,name,api_name,access,caller_access,sys_scope"
  });
  const membershipBridgeRecord = membershipBridgeRecords[0] ?? null;

  checks.push({
    ok: membershipBridgeRecords.length === 1,
    label: "global membership bridge script include is installed",
    detail: JSON.stringify(membershipBridgeRecords)
  });
  checks.push({
    ok: membershipBridgeRecords.length <= 1,
    label: "global membership bridge script include is not duplicated",
    detail: JSON.stringify(membershipBridgeRecords)
  });
  checks.push({
    ok: cleanText(membershipBridgeRecord?.api_name) === `global.${defaults.membershipBridgeName}`,
    label: "global membership bridge api_name matches expected value",
    detail: JSON.stringify(membershipBridgeRecord)
  });
  checks.push({
    ok: cleanText(membershipBridgeRecord?.access) === "public",
    label: "global membership bridge is callable from approved external scopes",
    detail: JSON.stringify(membershipBridgeRecord)
  });
  checks.push({
    ok: isRestrictedCallerValue(membershipBridgeRecord?.caller_access),
    label: "global membership bridge uses restricted caller access",
    detail: JSON.stringify(membershipBridgeRecord)
  });
  checks.push({
    ok: cleanText(membershipBridgeRecord?.sys_scope) === "global",
    label: "global membership bridge script include is installed in the global scope",
    detail: JSON.stringify(membershipBridgeRecord)
  });

  const membershipBridgePrivilegeRecords = runQuery({
    authAlias,
    table: "sys_scope_privilege",
    query: `source_scope=${defaults.scopedScopeId}^target_scope=global^target_type=sys_script_include^target_name=global.${defaults.membershipBridgeName}^operation=${defaults.rca.operationExecuteApi}^status=allowed`,
    fields: "sys_id,target_name,target_scope,target_type,operation,status,source_scope"
  });

  checks.push({
    ok: membershipBridgePrivilegeRecords.length >= 1,
    label: "scoped app owns an allowed execute cross-scope privilege for the global membership bridge",
    detail: JSON.stringify(membershipBridgePrivilegeRecords)
  });

  const membershipBridgeRestrictedCallerAccessRecords = runQuery({
    authAlias,
    table: "sys_restricted_caller_access",
    query: `source_scope=${defaults.scopedScopeId}^target_scope=global^target_table=sys_script_include^target=${cleanText(membershipBridgeRecord?.sys_id)}`,
    fields: "sys_id,sys_scope,source_scope,source_type,source_table,source,target_scope,target_type,target_table,target,operation,status,rca_type,description"
  });
  const membershipBridgeRestrictedCallerAccessRecord =
    membershipBridgeRestrictedCallerAccessRecords.find((record) => {
      return (
        cleanText(record.source_scope) === defaults.scopedScopeId &&
        cleanText(record.target_scope) === "global" &&
        cleanText(record.target_table) === "sys_script_include" &&
        cleanText(record.target) === cleanText(membershipBridgeRecord?.sys_id)
      );
    });

  checks.push({
    ok: Boolean(membershipBridgeRestrictedCallerAccessRecord),
    label: "restricted caller access relationship exists for the scoped membership bridge caller",
    detail: JSON.stringify(membershipBridgeRestrictedCallerAccessRecords)
  });
  checks.push({
    ok: isScopeSourceValue(membershipBridgeRestrictedCallerAccessRecord?.source_type),
    label: "restricted caller access source type stores the canonical Scope value",
    detail: JSON.stringify(membershipBridgeRestrictedCallerAccessRecord)
  });
  checks.push({
    ok: isAllowedAccessValue(membershipBridgeRestrictedCallerAccessRecord?.status),
    label: "restricted caller access status stores the canonical Allowed value",
    detail: JSON.stringify(membershipBridgeRestrictedCallerAccessRecord)
  });
  checks.push({
    ok: isScriptIncludeTargetValue(membershipBridgeRestrictedCallerAccessRecord?.target_type),
    label: "restricted caller access target type stores the canonical Script Include value",
    detail: JSON.stringify(membershipBridgeRestrictedCallerAccessRecord)
  });
  checks.push({
    ok: cleanText(membershipBridgeRestrictedCallerAccessRecord?.operation) === defaults.rca.operationExecuteApi,
    label: "restricted caller access operation stores the canonical Execute API value",
    detail: JSON.stringify(membershipBridgeRestrictedCallerAccessRecord)
  });
  checks.push({
    ok: cleanText(membershipBridgeRestrictedCallerAccessRecord?.rca_type) === defaults.rca.rcaTypeRealRca,
    label: "restricted caller access type stores the canonical Real RCA value",
    detail: JSON.stringify(membershipBridgeRestrictedCallerAccessRecord)
  });
  checks.push({
    ok:
      cleanText(membershipBridgeRestrictedCallerAccessRecord?.source_scope) === defaults.scopedScopeId &&
      cleanText(membershipBridgeRestrictedCallerAccessRecord?.source_table) === "sys_scope",
    label: "restricted caller access source scope is the Docsera scoped application",
    detail: JSON.stringify(membershipBridgeRestrictedCallerAccessRecord)
  });
  checks.push({
    ok: cleanText(membershipBridgeRestrictedCallerAccessRecord?.target) === cleanText(membershipBridgeRecord?.sys_id),
    label: "restricted caller access target is the installed membership Script Include",
    detail: JSON.stringify(membershipBridgeRestrictedCallerAccessRecord)
  });
  checks.push({
    ok: cleanText(membershipBridgeRestrictedCallerAccessRecord?.sys_scope) === "global",
    label: "restricted caller access record is owned by the Global application scope",
    detail: JSON.stringify(membershipBridgeRestrictedCallerAccessRecord)
  });

  const workerRules = runQuery({
    authAlias,
    table: "sys_script",
    query: `collection=${defaults.scopedRequestTable}^active=true`,
    fields: "sys_id,name,collection,when,active,filter_condition,script"
  });
  const workerRule = workerRules.find((record) => {
    return (
      cleanText(record.collection) === defaults.scopedRequestTable &&
      cleanText(record.active) === "true" &&
      cleanText(record.filter_condition) === "state=requested" &&
      cleanText(record.script).includes("DocseraGlobalWorkspaceProvisioningBridge")
    );
  });

  checks.push({
    ok: workerRules.length >= 1,
    label: "global async worker business rule is installed",
    detail: JSON.stringify(workerRules)
  });
  checks.push({
    ok: Boolean(workerRule),
    label: "global async worker business rule matches the Docsera worker contract",
    detail: JSON.stringify(workerRules)
  });
  checks.push({
    ok: cleanText(workerRule?.collection) === defaults.scopedRequestTable,
    label: "global worker business rule targets the scoped request table",
    detail: JSON.stringify(workerRule)
  });
  checks.push({
    ok: cleanText(workerRule?.when) === "async" || cleanText(workerRule?.when) === "async_always",
    label: "global worker business rule runs async",
    detail: JSON.stringify(workerRule)
  });
  checks.push({
    ok: normalizeBoolean(workerRule?.active),
    label: "global worker business rule is active",
    detail: JSON.stringify(workerRule)
  });
  checks.push({
    ok: cleanText(workerRule?.filter_condition) === "state=requested",
    label: "global worker business rule filters requested rows",
    detail: JSON.stringify(workerRule)
  });
  checks.push({
    ok: cleanText(workerRule?.script).includes("DocseraGlobalWorkspaceProvisioningBridge"),
    label: "global worker business rule script invokes the Docsera worker",
    detail: JSON.stringify(workerRule)
  });

  const privilegeRecords = runQuery({
    authAlias,
    table: "sys_scope_privilege",
    query: `target_scope=6997f092c3fd8310c569bf0d0501314d^target_nameIN${defaults.scopedRequestTable},${defaults.scopedWorkspaceTable},${defaults.scopedWorkspaceIconAssetTable}`,
    fields: "sys_id,target_name,target_scope,target_type,operation,status,source_scope"
  });
  const privilegeKeys = new Set(
    privilegeRecords
      .filter((record) => cleanText(record.source_scope) === "global" && cleanText(record.status) === "allowed")
      .map((record) => `${cleanText(record.target_name)}::${cleanText(record.operation)}`)
  );

  checks.push({
    ok: privilegeKeys.has(`${defaults.scopedRequestTable}::read`),
    label: "global worker has read privilege on the scoped request table",
    detail: JSON.stringify(privilegeRecords)
  });
  checks.push({
    ok: privilegeKeys.has(`${defaults.scopedRequestTable}::write`),
    label: "global worker has write privilege on the scoped request table",
    detail: JSON.stringify(privilegeRecords)
  });
  checks.push({
    ok: privilegeKeys.has(`${defaults.scopedWorkspaceTable}::create`),
    label: "global worker has create privilege on the scoped workspace table",
    detail: JSON.stringify(privilegeRecords)
  });
  checks.push({
    ok: privilegeKeys.has(`${defaults.scopedWorkspaceTable}::read`),
    label: "global worker has read privilege on the scoped workspace table",
    detail: JSON.stringify(privilegeRecords)
  });
  checks.push({
    ok: privilegeKeys.has(`${defaults.scopedWorkspaceTable}::delete`),
    label: "global worker has delete privilege on the scoped workspace table for rollback",
    detail: JSON.stringify(privilegeRecords)
  });
  checks.push({
    ok: privilegeKeys.has(`${defaults.scopedWorkspaceIconAssetTable}::read`),
    label: "global worker has read privilege on the scoped workspace icon asset table",
    detail: JSON.stringify(privilegeRecords)
  });
  checks.push({
    ok: privilegeKeys.has(`${defaults.scopedWorkspaceIconAssetTable}::write`),
    label: "global worker has write privilege on the scoped workspace icon asset table",
    detail: JSON.stringify(privilegeRecords)
  });

  const scopedWorkspaceTableRecords = runQuery({
    authAlias,
    table: "sys_db_object",
    query: `name=${defaults.scopedWorkspaceTable}`,
    fields: "sys_id,name,read_access,create_access,delete_access"
  });
  const scopedWorkspaceTableRecord = scopedWorkspaceTableRecords[0] ?? null;

  checks.push({
    ok: scopedWorkspaceTableRecords.length === 1,
    label: "scoped workspace table Application Access record is queryable",
    detail: JSON.stringify(scopedWorkspaceTableRecords)
  });
  checks.push({
    ok: normalizeBoolean(scopedWorkspaceTableRecord?.read_access),
    label: "scoped workspace table permits cross-scope read",
    detail: JSON.stringify(scopedWorkspaceTableRecord)
  });
  checks.push({
    ok: normalizeBoolean(scopedWorkspaceTableRecord?.create_access),
    label: "scoped workspace table permits cross-scope create",
    detail: JSON.stringify(scopedWorkspaceTableRecord)
  });
  checks.push({
    ok: normalizeBoolean(scopedWorkspaceTableRecord?.delete_access),
    label: "scoped workspace table permits cross-scope delete for rollback",
    detail: JSON.stringify(scopedWorkspaceTableRecord)
  });

  const runtimeModuleRecords = runQuery({
    authAlias,
    table: "sys_module",
    query: `pathSTARTSWITH${defaults.packageRuntimePathPrefix}`,
    fields: "sys_id,path,sys_scope"
  });
  const runtimeModulePaths = new Set(runtimeModuleRecords.map((record) => cleanText(record.path)));

  checks.push({
    ok: runtimeModuleRecords.length >= 3,
    label: "global bridge package runtime sys_module records are installed",
    detail: JSON.stringify(runtimeModuleRecords)
  });
  checks.push({
    ok: runtimeModulePaths.has(`${defaults.packageRuntimePathPrefix}package.json`),
    label: "global bridge package.json sys_module is installed",
    detail: JSON.stringify(runtimeModuleRecords)
  });
  checks.push({
    ok: runtimeModulePaths.has(
      `${defaults.packageRuntimePathPrefix}src/server/script-includes/docsera-global-workspace-provisioning-bridge.js`
    ),
    label: "global worker script sys_module is installed",
    detail: JSON.stringify(runtimeModuleRecords)
  });
  checks.push({
    ok: runtimeModulePaths.has(
      `${defaults.packageRuntimePathPrefix}src/server/script-includes/docsera-global-workspace-membership-bridge.js`
    ),
    label: "global membership bridge script sys_module is installed",
    detail: JSON.stringify(runtimeModuleRecords)
  });
  checks.push({
    ok: runtimeModulePaths.has(
      `${defaults.packageRuntimePathPrefix}src/server/business-rules/process-workspace-provision-request.js`
    ),
    label: "global worker business rule script sys_module is installed",
    detail: JSON.stringify(runtimeModuleRecords)
  });

  const packageRecords = runQuery({
    authAlias,
    table: "sys_package",
    query: "sys_id=global",
    fields: "sys_id,name,source,version,package_json,package_resolver_version,active"
  });
  const packageRecord = packageRecords[0] ?? null;

  checks.push({
    ok: packageRecords.length === 1,
    label: "global package record is queryable",
    detail: JSON.stringify(packageRecords)
  });
  checks.push({
    ok: cleanText(packageRecord?.package_json) === defaults.expectedPackageJsonPath,
    label: "global package_json points at the bridge package path",
    detail: JSON.stringify(packageRecord)
  });
  checks.push({
    ok: cleanText(packageRecord?.package_resolver_version) === defaults.expectedPackageResolverVersion,
    label: "global package resolver version matches the SDK bridge package",
    detail: JSON.stringify(packageRecord)
  });

  const scopeRecords = runQuery({
    authAlias,
    table: "sys_scope",
    query: "sys_id=global",
    fields: "sys_id,scope,js_level,runtime_access_tracking,can_edit_in_studio"
  });
  const scopeRecord = scopeRecords[0] ?? null;

  checks.push({
    ok: scopeRecords.length === 1,
    label: "global scope record is queryable",
    detail: JSON.stringify(scopeRecords)
  });
  checks.push({
    ok: cleanText(scopeRecord?.js_level) === defaults.expectedGlobalJsLevel,
    label: "global scope js_level matches the SDK bridge package",
    detail: JSON.stringify(scopeRecord)
  });
  checks.push({
    ok: cleanText(scopeRecord?.runtime_access_tracking) === defaults.expectedRuntimeAccessTracking,
    label: "global scope runtime access tracking matches the SDK bridge package",
    detail: JSON.stringify(scopeRecord)
  });

  console.log("Scoped table privilege diagnostics");
  console.log(JSON.stringify(privilegeRecords, null, 2));
  console.log("");
  console.log("Scoped membership bridge execute privilege diagnostics");
  console.log(JSON.stringify(membershipBridgePrivilegeRecords, null, 2));
  console.log("");
  console.log("Global membership bridge restricted caller access diagnostics");
  console.log(JSON.stringify(membershipBridgeRestrictedCallerAccessRecords, null, 2));
  console.log("");
  console.log("Global package runtime sys_module diagnostics");
  console.log(JSON.stringify(runtimeModuleRecords, null, 2));
  console.log("");
  console.log("Global package metadata diagnostics");
  console.log(JSON.stringify(packageRecords, null, 2));
  console.log("");
  console.log("Global scope metadata diagnostics");
  console.log(JSON.stringify(scopeRecords, null, 2));
  console.log("");

  for (const check of checks) {
    printCheck(check.ok, check.label, check.detail);
  }

  const success = checks.every((check) => check.ok);
  console.log("");
  console.log(`Result: ${success ? "pass" : "fail"}`);

  if (!success) {
    process.exitCode = 1;
  }
}

main();
