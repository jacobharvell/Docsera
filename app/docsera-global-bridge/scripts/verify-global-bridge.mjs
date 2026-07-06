#!/usr/bin/env node

import { parseArgs } from "node:util";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const sdkCliPath = fileURLToPath(new URL("../node_modules/@servicenow/sdk/bin/index.js", import.meta.url));

const defaults = {
  authAlias: "docsera-pdi",
  workerName: "DocseraGlobalWorkspaceProvisioningBridge",
  workerRuleName: "Docsera Workspace Provision Request Worker",
  packageRuntimePathPrefix: "/global/docsera-global-workspace-bridge/0.1.0/",
  expectedPackageResolverVersion: "2.0.0",
  expectedPackageJsonPath: "/global/docsera-global-workspace-bridge/0.1.0/package.json",
  expectedGlobalJsLevel: "es_latest",
  expectedRuntimeAccessTracking: "permissive",
  scopedRequestTable: "x_82900_docsera_workspace_provision_request",
  scopedWorkspaceTable: "x_82900_docsera_workspace"
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
    query: `target_scope=6997f092c3fd8310c569bf0d0501314d^target_nameIN${defaults.scopedRequestTable},${defaults.scopedWorkspaceTable}`,
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
