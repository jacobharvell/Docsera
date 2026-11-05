import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("Global artifact generator writes only ignored temporary output", () => {
  const generator = readFileSync(path.join(root, "scripts", "generate-update-set-artifact.mjs"), "utf8");
  assert.match(generator, /path\.join\(packageRoot, "output", "update-set"\)/);
  assert.doesNotMatch(generator, /candidates\/rr-074-global-consumer-portability/);
  assert.match(generator, /UTF-8 with LF line endings/);
});

test("Global source retains the required companion component identities", () => {
  const keys = readFileSync(path.join(root, "src", "fluent", "generated", "keys.ts"), "utf8");
  for (const identity of [
    "bb42e634e203492591a8d18e6953eae1",
    "010930ea12354689b678fc9b37ba0f88",
    "b9d7e176310f447ea61072dc4a9fca11",
    "4bb3dc32dcfc4441a57bfce97db77529"
  ]) {
    assert.match(keys, new RegExp(identity), `missing required Global companion component ${identity}`);
  }
});

test("the production Global host ACL uses the supported GlideSystem authentication API and ACL answer contract", () => {
  const acl = readFileSync(path.join(root, "src", "fluent", "security", "docsera-friendly-url-proof-access.now.ts"), "utf8");
  assert.match(acl, /script: "answer = gs\.isLoggedIn\(\);"/);
  assert.doesNotMatch(acl, /gs\.getUser\(\)\.isLoggedIn\(\)/);
});

test("friendly URL artifact verification follows the current generated identities", () => {
  const verifier = readFileSync(path.join(root, "scripts", "verify-friendly-url-host-artifact.mjs"), "utf8");
  for (const identity of ["4bb3dc32dcfc4441a57bfce97db77529", "b9d7e176310f447ea61072dc4a9fca11"]) {
    assert.match(verifier, new RegExp(identity));
  }
  assert.doesNotMatch(verifier, /sys_security_acl_role_1416f98418e24c18af184b0300f7793c/);
});

test("the scoped application launcher opens the Global host while the scoped runtime remains independent", () => {
  const launcher = readFileSync(path.resolve(root, "..", "docsera-ui", "src", "fluent", "application-menu", "docsera-runtime-launch.now.ts"), "utf8");
  assert.match(launcher, /query: "docsera\.do"/);
  assert.doesNotMatch(launcher, /query: "x_2300756_docsera_docsera_sdk_runtime\.do"/);
});
