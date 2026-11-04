import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const candidateRoot = path.join(root, "update-set", "candidates", "rr-074-global-consumer-portability");
const candidateManifestPath = path.join(candidateRoot, "docsera-global-companion-consumer-candidate.update-set.json");

test("RR-074 consumer candidate is separately identified and preserves historical artifacts", () => {
  const manifest = JSON.parse(readFileSync(candidateManifestPath, "utf8"));
  assert.equal(manifest.candidate, true);
  assert.ok(existsSync(path.join(root, "update-set", "docsera-global-companion.update-set.json")));
  assert.ok(existsSync(path.join(root, "update-set", "sys_remote_update_set_docsera_global_companion_0_1_0.xml")));
  assert.equal(manifest.records.filter((record) => record.table === "sys_ui_page").length, 1);
  const sharedGlobalIdentityRecords = manifest.records.filter(
    (record) => record.targetSysId === "global" && ["sys_package", "sys_scope", "sys_app"].includes(record.table)
  );
  assert.deepEqual(sharedGlobalIdentityRecords, []);

  const artifactBytes = readFileSync(path.join(candidateRoot, manifest.artifactFile));
  assert.equal(artifactBytes.includes(0x0d), false, "candidate XML must use canonical LF line endings");
  assert.equal(createHash("sha256").update(artifactBytes).digest("hex"), manifest.artifactSha256);
  assert.equal(manifest.serialization, "UTF-8 with LF line endings");
  assert.equal(manifest.generatorRevision, manifest.artifactRevision);
  assert.equal(manifest.sourceSha, "16c5f95f4befa109277d1f67a50f8d977faebf17");
  const artifact = artifactBytes.toString("utf8");
  for (const table of ["sys_package", "sys_scope", "sys_app"]) {
    assert.doesNotMatch(artifact, new RegExp(`&lt;record_update table=&quot;${table}&quot;&gt;[\\s\\S]*?&lt;sys_id&gt;global&lt;/sys_id&gt;`));
  }
});

test("consumer candidate resolves current bridge identities from the SDK registry", () => {
  const manifest = JSON.parse(readFileSync(candidateManifestPath, "utf8"));
  const identities = new Set(manifest.records.map((record) => `${record.table}:${record.targetSysId}`));
  for (const identity of [
    "sys_script_include:bb42e634e203492591a8d18e6953eae1",
    "sys_script_include:010930ea12354689b678fc9b37ba0f88",
    "sys_security_acl:b9d7e176310f447ea61072dc4a9fca11",
    "sys_ui_page:4bb3dc32dcfc4441a57bfce97db77529"
  ]) {
    assert.ok(identities.has(identity), `missing required Global companion component ${identity}`);
  }
  assert.equal(manifest.records.filter((record) => record.table === "sys_scope_privilege").length, 9);
  assert.equal(manifest.records.filter((record) => record.table === "sys_module").length, 6);
});

test("the production Global host ACL uses the supported GlideSystem authentication API and ACL answer contract", () => {
  const acl = readFileSync(path.join(root, "src", "fluent", "security", "docsera-friendly-url-proof-access.now.ts"), "utf8");
  assert.match(acl, /script: "answer = gs\.isLoggedIn\(\);"/);
  assert.doesNotMatch(acl, /gs\.getUser\(\)\.isLoggedIn\(\)/);
});

test("the scoped application launcher opens the Global host while the scoped runtime remains independent", () => {
  const launcher = readFileSync(path.resolve(root, "..", "docsera-ui", "src", "fluent", "application-menu", "docsera-runtime-launch.now.ts"), "utf8");
  assert.match(launcher, /query: "docsera\.do"/);
  assert.doesNotMatch(launcher, /query: "x_2300756_docsera_docsera_sdk_runtime\.do"/);
});
