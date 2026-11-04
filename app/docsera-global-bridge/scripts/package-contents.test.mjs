import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("normal Global companion includes exactly one production docsera host and no proof artifact path", () => {
  const manifest = JSON.parse(readFileSync(path.join(root, "update-set", "docsera-global-companion.update-set.json"), "utf8"));
  assert.equal(manifest.records.filter((record) => record.table === "sys_ui_page" && record.targetSysId === "de3b81474ba94c0a9296d12f9c6bd9cc").length, 1);
  const retiredProofDirectory = path.join(root, "update-set", "friendly-url-proof");
  assert.equal(existsSync(retiredProofDirectory) ? readdirSync(retiredProofDirectory).length : 0, 0);
});

test("Global companion never transports shared Global package, scope, or application identity", () => {
  const manifest = JSON.parse(readFileSync(path.join(root, "update-set", "docsera-global-companion.update-set.json"), "utf8"));
  assert.equal(manifest.records.length, 25);
  const sharedGlobalIdentityRecords = manifest.records.filter(
    (record) => record.targetSysId === "global" && ["sys_package", "sys_scope", "sys_app"].includes(record.table)
  );
  assert.deepEqual(sharedGlobalIdentityRecords, []);

  const artifact = readFileSync(path.join(root, "update-set", "sys_remote_update_set_docsera_global_companion_0_1_0.xml"), "utf8");
  for (const table of ["sys_package", "sys_scope", "sys_app"]) {
    assert.doesNotMatch(artifact, new RegExp(`&lt;record_update table=&quot;${table}&quot;&gt;[\\s\\S]*?&lt;sys_id&gt;global&lt;/sys_id&gt;`));
  }
});

test("Global companion retains the required Docsera-owned bridge, worker, security, and host components", () => {
  const manifest = JSON.parse(readFileSync(path.join(root, "update-set", "docsera-global-companion.update-set.json"), "utf8"));
  const identities = new Set(manifest.records.map((record) => `${record.table}:${record.targetSysId}`));
  for (const identity of [
    "sys_script_include:5bf5c028daaa417d88de36616e4c8300",
    "sys_script_include:abf83bf6db1e46dea88c97ec493153bc",
    "sys_script:0d2f3146f31d4c439ea6b6cd50a105a2",
    "sys_script:fa8109eeb6ed4c3e91c11238db780568",
    "sys_restricted_caller_access:449a6d8fb9d6e5b6c84e14c4314d8ccb",
    "sys_security_acl:879785c448564188a54416cb90d18c14",
    "sys_ui_page:de3b81474ba94c0a9296d12f9c6bd9cc"
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
