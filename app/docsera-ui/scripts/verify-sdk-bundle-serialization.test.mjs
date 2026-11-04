import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { assetIdentityForScope, assetXmlPath } from "./verify-sdk-bundle-serialization.mjs";

const canonicalScope = ["x", "2300756", "docsera"].join("_");

test("enforces the canonical UX Asset sys_id when supplied", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "docsera-ux-assets-"));
  const canonicalId = "f058e74bbed44dbfad24e6b661817a56";
  const canonicalPath = path.join(directory, `sys_ux_lib_asset_${canonicalId}.xml`);
  writeFileSync(canonicalPath, `<name>${canonicalScope}/main</name>`);
  writeFileSync(path.join(directory, "sys_ux_lib_asset_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.xml"), `<name>${canonicalScope}/main</name>`);
  const identity = assetIdentityForScope(canonicalScope).main;
  assert.equal(identity.sysId, canonicalId);
  assert.equal(assetXmlPath(identity, directory), canonicalPath);
  assert.equal(assetIdentityForScope(canonicalScope).mainMap.sysId, "7fee0b502705422e8a9854324554faf8");
});

test("locates converted UX Asset metadata by its scope-derived name without a canonical sys_id", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "docsera-ux-assets-"));
  const filePath = path.join(directory, "sys_ux_lib_asset_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.xml");
  writeFileSync(filePath, "<name>x_2300757_docsera/main</name>");
  const identity = assetIdentityForScope("x_2300757_docsera").main;
  assert.equal(identity.sysId, undefined);
  assert.equal(assetXmlPath(identity, directory), filePath);
});
