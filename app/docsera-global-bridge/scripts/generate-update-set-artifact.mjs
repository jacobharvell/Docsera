#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(scriptDir, "..");
const distRoot = path.join(packageRoot, "dist");
const distAppRoot = path.join(distRoot, "app");
const outputRoot = path.join(packageRoot, "update-set");
const scopedAppConfigPath = path.resolve(packageRoot, "..", "docsera-ui", "now.config.json");

const constants = Object.freeze({
  buildType: "global",
  appVersion: "0.1.0",
  artifactRevision: "global-base-metadata-safe-r2",
  updateSetName: "Docsera Global Companion 0.1.0",
  updateSetDescription:
    "Global companion update set for Docsera workspace provisioning and the authenticated docsera.do host.",
  updateSetFileName: "sys_remote_update_set_docsera_global_companion_0_1_0.xml",
  manifestFileName: "docsera-global-companion.update-set.json",
  remoteUpdateSetSource: "docsera-global-companion",
  recordedBy: "codex"
});

function readScopedAppConfig() {
  const rawConfig = JSON.parse(readText(scopedAppConfigPath));
  if (!rawConfig.scope || !rawConfig.scopeId) {
    throw new Error(`Scoped app config is missing scope or scopeId: ${scopedAppConfigPath}`);
  }

  return {
    scope: String(rawConfig.scope).trim(),
    scopeId: String(rawConfig.scopeId).trim()
  };
}

const scopedAppConfig = readScopedAppConfig();

const docseraMembershipBridge = Object.freeze({
  name: "DocseraGlobalWorkspaceMembershipBridge",
  sysId: "5bf5c028daaa417d88de36616e4c8300",
  apiName: "global.DocseraGlobalWorkspaceMembershipBridge"
});

const restrictedCallerAccessValues = Object.freeze({
  operationExecuteApi: "execute",
  rcaTypeRealRca: "real_rca",
  sourceTypeScope: "5",
  statusAllowed: "2",
  targetTypeScriptInclude: "2"
});

function stableSysId(seed) {
  return createHash("md5").update(seed).digest("hex");
}

function xmlEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function readText(filePath) {
  return readFileSync(filePath, "utf8").replace(/^\uFEFF/, "");
}

function requireMatch(content, pattern, description, filePath) {
  const match = content.match(pattern);
  if (!match) {
    throw new Error(`Could not resolve ${description} from ${filePath}.`);
  }

  return match[1];
}

function walkXmlFiles(currentPath, rootPath = currentPath) {
  return readdirSync(currentPath, { withFileTypes: true })
    .flatMap((entry) => {
      const entryPath = path.join(currentPath, entry.name);
      if (entry.isDirectory()) {
        return walkXmlFiles(entryPath, rootPath);
      }

      if (!entry.isFile() || !entry.name.endsWith(".xml")) {
        return [];
      }

      return [path.relative(rootPath, entryPath).replaceAll("\\", "/")];
    })
    .sort((left, right) => left.localeCompare(right));
}

function readRecordEntries() {
  if (!existsSync(distAppRoot) || !statSync(distAppRoot).isDirectory()) {
    throw new Error(`Build output directory is missing: ${distAppRoot}`);
  }

  return walkXmlFiles(distAppRoot);
}

function parseRecord(relativePath) {
  const absolutePath = path.join(distAppRoot, relativePath);
  let content = readText(absolutePath);
  const tableMatch = content.match(/<record_update(?:\s+table="([^"]+)")?>/);
  const nestedTableMatch = content.match(/<record_update(?:\s+table="[^"]+")?>\s*<([a-z0-9_]+)/i);
  const tableName = tableMatch?.[1] || nestedTableMatch?.[1];

  if (!tableName) {
    throw new Error(`Could not determine table name for ${absolutePath}.`);
  }

  if (tableName === "sys_scope_privilege") {
    const targetScopePattern = new RegExp(`<target_scope>${scopedAppConfig.scope}</target_scope>`, "g");
    content = content.replace(targetScopePattern, `<target_scope>${scopedAppConfig.scopeId}</target_scope>`);
  }

  const targetSysId = requireMatch(content, /<sys_id>([^<]+)<\/sys_id>/, "sys_id", absolutePath);
  const updateName = content.match(/<sys_update_name>([^<]+)<\/sys_update_name>/)?.[1] ?? `${tableName}_${targetSysId}`;
  const targetName =
    content.match(/<name>([^<]+)<\/name>/)?.[1] ??
    content.match(/<sys_name>([^<]+)<\/sys_name>/)?.[1] ??
    updateName;
  return {
    absolutePath,
    content,
    relativePath: relativePath.replaceAll("\\", "/"),
    tableName,
    targetName,
    targetSysId,
    updateName,
    updateXmlSysId: stableSysId(`sys_update_xml:${relativePath}`)
  };
}

function buildRecordUpdateXml(tableName, sysId, fields) {
  const fieldXml = fields
    .map(({ name, value, attributes = "" }) => {
      if (value === null) {
        return `    <${name}${attributes}/>`;
      }

      return `    <${name}${attributes}>${xmlEscape(value)}</${name}>`;
    })
    .join("\n");

  return [
    '<?xml version="1.0"?>',
    `<record_update table="${tableName}">`,
    `  <${tableName} action="INSERT_OR_UPDATE">`,
    `    <sys_id>${sysId}</sys_id>`,
    fieldXml,
    `  </${tableName}>`,
    "</record_update>"
  ].join("\n");
}

function buildRestrictedCallerAccessRecords() {
  const sysId = stableSysId(
    `sys_restricted_caller_access:${scopedAppConfig.scopeId}:global:${docseraMembershipBridge.apiName}:execute`
  );
  const updateName = `sys_restricted_caller_access_${sysId}`;
  const relativePath = `synthetic/${updateName}.xml`;

  return [
    {
      absolutePath: relativePath,
      content: buildRecordUpdateXml("sys_restricted_caller_access", sysId, [
        {
          name: "description",
          value:
            "Allow the Docsera scoped app to execute the Global workspace membership bridge under Caller Restriction."
        },
        { name: "operation", value: restrictedCallerAccessValues.operationExecuteApi },
        { name: "rca_type", value: restrictedCallerAccessValues.rcaTypeRealRca },
        { name: "source", value: scopedAppConfig.scopeId, attributes: ` display_value="${xmlEscape(scopedAppConfig.scope)}"` },
        { name: "source_scope", value: scopedAppConfig.scopeId, attributes: ` display_value="${xmlEscape(scopedAppConfig.scope)}"` },
        { name: "source_table", value: "sys_scope" },
        { name: "source_type", value: restrictedCallerAccessValues.sourceTypeScope },
        { name: "status", value: restrictedCallerAccessValues.statusAllowed },
        { name: "sys_scope", value: "global", attributes: ' display_value="Global"' },
        {
          name: "target",
          value: docseraMembershipBridge.sysId,
          attributes: ` display_value="${xmlEscape(docseraMembershipBridge.name)}"`
        },
        { name: "target_scope", value: "global", attributes: ' display_value="Global"' },
        { name: "target_table", value: "sys_script_include" },
        { name: "target_type", value: restrictedCallerAccessValues.targetTypeScriptInclude }
      ]),
      relativePath,
      tableName: "sys_restricted_caller_access",
      targetName: docseraMembershipBridge.apiName,
      targetSysId: sysId,
      updateName,
      updateXmlSysId: stableSysId(`sys_update_xml:${relativePath}`)
    }
  ];
}

function buildCompanionRecords() {
  const restrictedCallerAccessRecords = buildRestrictedCallerAccessRecords();
  const parsedRecords = readRecordEntries()
    .filter((relativePath) => !relativePath.startsWith("scope/"))
    .map(parseRecord);

  // The SDK retains the prior INSERT_OR_UPDATE beside its generated DELETE for a
  // removed composite relation. Ship only the deletion so an installed proof no
  // longer requires the temporary editor role.
  const retiredFriendlyUrlAclRoleId = "1416f98418e24c18af184b0300f7793c";
  const builtRecords = parsedRecords.filter((record) => {
    return record.targetSysId !== retiredFriendlyUrlAclRoleId || record.relativePath.startsWith("author_elective_update/");
  });

  const records = [...restrictedCallerAccessRecords, ...builtRecords];
  const unsafeSharedGlobalRecords = records.filter(
    (record) =>
      record.targetSysId === "global" &&
      ["sys_package", "sys_scope", "sys_app"].includes(record.tableName)
  );
  if (unsafeSharedGlobalRecords.length > 0) {
    throw new Error(
      `Refusing to package shared Global identity records: ${unsafeSharedGlobalRecords
        .map((record) => `${record.tableName}:${record.targetSysId}`)
        .join(", ")}`
    );
  }

  return records;
}

function buildRemoteUpdateSetXml({ remoteUpdateSetSysId, createdAt, records }) {
  const customerUpdates = records
    .map((record) => {
      return [
        '  <sys_update_xml action="INSERT_OR_UPDATE">',
        `    <sys_id>${record.updateXmlSysId}</sys_id>`,
        `    <action>INSERT_OR_UPDATE</action>`,
        `    <application>global</application>`,
        `    <category>customer</category>`,
        `    <name>${xmlEscape(record.updateName)}</name>`,
        `    <payload>${xmlEscape(record.content)}</payload>`,
        `    <remote_update_set>${remoteUpdateSetSysId}</remote_update_set>`,
        "    <replace_on_upgrade>false</replace_on_upgrade>",
        `    <source>${xmlEscape(constants.remoteUpdateSetSource)}</source>`,
        `    <sys_created_by>${xmlEscape(constants.recordedBy)}</sys_created_by>`,
        `    <sys_updated_by>${xmlEscape(constants.recordedBy)}</sys_updated_by>`,
        `    <target_name>${xmlEscape(record.targetName)}</target_name>`,
        `    <target_sys_id>${record.targetSysId}</target_sys_id>`,
        `    <type>${record.tableName}</type>`,
        `    <update_guid>${stableSysId(`update_guid:${record.relativePath}`)}</update_guid>`,
        `    <update_guid_history>${stableSysId(`update_guid_history:${record.relativePath}`)}</update_guid_history>`,
        "  </sys_update_xml>"
      ].join("\n");
    })
    .join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<unload unload_date="${createdAt}" unload_version="1" syntax="glide">`,
    '  <sys_remote_update_set action="INSERT_OR_UPDATE">',
    `    <sys_id>${remoteUpdateSetSysId}</sys_id>`,
    '    <application display_value="Global">global</application>',
    `    <description>${xmlEscape(constants.updateSetDescription)}</description>`,
    `    <name>${xmlEscape(constants.updateSetName)}</name>`,
    `    <origin_sys_id>${remoteUpdateSetSysId}</origin_sys_id>`,
    `    <remote_base_update_set>${remoteUpdateSetSysId}</remote_base_update_set>`,
    `    <source>${xmlEscape(constants.remoteUpdateSetSource)}</source>`,
    '    <state>loaded</state>',
    `    <sys_created_by>${xmlEscape(constants.recordedBy)}</sys_created_by>`,
    `    <sys_updated_by>${xmlEscape(constants.recordedBy)}</sys_updated_by>`,
    '  </sys_remote_update_set>',
    customerUpdates,
    "</unload>",
    ""
  ].join("\n");
}

function main() {
  const records = buildCompanionRecords();
  const createdAt = new Date().toISOString().replace("T", " ").replace(/\.\d{3}Z$/, "");
  const remoteUpdateSetSysId = stableSysId(
    `${constants.updateSetName}:${constants.appVersion}:${constants.buildType}:${constants.artifactRevision}`
  );

  mkdirSync(outputRoot, { recursive: true });

  const remoteUpdateSetXml = buildRemoteUpdateSetXml({
    remoteUpdateSetSysId,
    createdAt,
    records
  });
  const manifest = {
    name: constants.updateSetName,
    version: constants.appVersion,
    artifactRevision: constants.artifactRevision,
    buildType: constants.buildType,
    generatedAt: createdAt,
    remoteUpdateSetSysId,
    sourceDistRoot: path.relative(packageRoot, distRoot).replaceAll("\\", "/"),
    artifactFile: constants.updateSetFileName,
    records: records.map((record) => ({
      sourceFile: record.relativePath,
      table: record.tableName,
      targetName: record.targetName,
      targetSysId: record.targetSysId,
      updateName: record.updateName
    }))
  };

  writeFileSync(path.join(outputRoot, constants.updateSetFileName), remoteUpdateSetXml, "utf8");
  writeFileSync(path.join(outputRoot, constants.manifestFileName), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  console.log(`Generated ${path.join("update-set", constants.updateSetFileName)}`);
  console.log(`Generated ${path.join("update-set", constants.manifestFileName)}`);
  console.log(`Included ${records.length} records from ${path.join("dist", "app")}`);
}

main();
