#!/usr/bin/env node

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const generatedRoot = path.join(packageRoot, "output", "update-set");
const manifest = JSON.parse(readFileSync(path.join(generatedRoot, "docsera-global-companion.update-set.json"), "utf8"));
const artifact = readFileSync(path.join(generatedRoot, manifest.artifactFile), "utf8");
const scopedIdentity = { scope: "x_2300756_docsera", sysId: "e6e43323accd4c7fb9271525a343850e" };
const stale = ["5bf5c028daaa417d88de36616e4c8300", "x_82900_docsera", "6997f092c3fd8310c569bf0d0501314d", "2698dffadc844c00a9f20d67fca177d5"];

function decodeXml(value) {
  return value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&amp;", "&");
}

const updates = [...artifact.matchAll(/<sys_update_xml action="INSERT_OR_UPDATE">([\s\S]*?)<\/sys_update_xml>/g)].map((match) => {
  const entry = match[1];
  const field = (name) => entry.match(new RegExp(`<${name}>([^<]*)<\/${name}>`))?.[1] ?? "";
  return { table: field("type"), targetSysId: field("target_sys_id"), payload: decodeXml(field("payload")) };
});

assert.equal(manifest.generated, true, "generated manifest marker is required");
assert.equal(manifest.buildType, "global");
assert.equal(manifest.artifactSha256, createHash("sha256").update(artifact).digest("hex"));
assert.equal(manifest.consumerOwnership.ownershipSysId, "global");
assert.equal(manifest.components.membershipBridge.sysId, "bb42e634e203492591a8d18e6953eae1");
assert.equal(manifest.components.membershipBridge.table, "sys_script_include");
assert.equal(updates.length, manifest.records.length, "manifest and XML update inventories differ");
assert.deepEqual(updates.map(({ table, targetSysId }) => `${table}:${targetSysId}`), manifest.records.map((record) => `${record.table}:${record.targetSysId}`));
assert.equal(new Set(updates.map(({ table, targetSysId }) => `${table}:${targetSysId}`)).size, updates.length, "duplicate update targets");

for (const value of stale) assert.equal(artifact.includes(value), false, `stale or unresolved identity ${value}`);
for (const table of ["sys_package", "sys_scope", "sys_app"]) {
  assert.doesNotMatch(artifact, new RegExp(`&lt;record_update table=&quot;${table}&quot;&gt;[\\s\\S]*?&lt;sys_id&gt;global&lt;/sys_id&gt;`));
}
assert.ok(artifact.includes(scopedIdentity.scope));
assert.ok(artifact.includes(scopedIdentity.sysId));
assert.ok(updates.every(({ payload }) => !payload.includes("<sys_scope") || /<sys_scope(?:\s[^>]*)?>global<\/sys_scope>/.test(payload)));
assert.ok(updates.every(({ payload }) => !payload.includes("<sys_package") || /<sys_package(?:\s[^>]*)?>global<\/sys_package>/.test(payload)));
assert.equal(updates.some(({ payload }) => /action="DELETE"/i.test(payload)), false, "unexpected DELETE payload");

const rca = updates.find(({ table }) => table === "sys_restricted_caller_access");
assert.ok(rca, "missing restricted caller access record");
for (const [field, value] of Object.entries({
  sys_scope: "global",
  source: scopedIdentity.sysId,
  source_scope: scopedIdentity.sysId,
  source_table: "sys_scope",
  source_type: "5",
  target_scope: "global",
  target_table: "sys_script_include",
  target: manifest.components.membershipBridge.sysId,
  target_type: "2",
  operation: "execute",
  status: "2",
  rca_type: "real_rca"
})) {
  assert.match(rca.payload, new RegExp(`<${field}(?:\\s[^>]*)?>${value}<\\/${field}>`), `RCA ${field}`);
}
const membershipIndex = updates.findIndex(({ table, targetSysId }) => table === "sys_script_include" && targetSysId === manifest.components.membershipBridge.sysId);
assert.ok(membershipIndex >= 0 && membershipIndex < updates.indexOf(rca), "RCA must follow its membership Script Include");
console.log(`Generated Global companion verified: ${updates.length} records, ${manifest.artifactSha256}`);
