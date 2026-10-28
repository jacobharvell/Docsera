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

test("the production Global host ACL uses the supported GlideSystem authentication API and ACL answer contract", () => {
  const acl = readFileSync(path.join(root, "src", "fluent", "security", "docsera-friendly-url-proof-access.now.ts"), "utf8");
  assert.match(acl, /script: "answer = gs\.isLoggedIn\(\);"/);
  assert.doesNotMatch(acl, /gs\.getUser\(\)\.isLoggedIn\(\)/);
});

test("the scoped application launcher opens the Global host while the scoped runtime remains independent", () => {
  const launcher = readFileSync(path.resolve(root, "..", "docsera-ui", "src", "fluent", "application-menu", "docsera-runtime-launch.now.ts"), "utf8");
  assert.match(launcher, /query: "docsera\.do"/);
  assert.doesNotMatch(launcher, /query: "x_82900_docsera_docsera_sdk_runtime\.do"/);
});
