import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { convertIdentity } from "./convert-sdk-identity.mjs";

const sourceScope = "x_2300756_docsera";
const sourceScopeId = "e6e43323accd4c7fb9271525a343850e";

function fixture({ scope, scopeId = "1234567890abcdef1234567890abcdef" }) {
  const root = mkdtempSync(resolve(tmpdir(), "docsera-identity-conversion-"));
  const scaffold = resolve(root, "scaffold");
  mkdirSync(scaffold, { recursive: true });
  writeFileSync(resolve(scaffold, "now.config.json"), `${JSON.stringify({ scope, scopeId, name: "Docsera", tsconfigPath: "./tsconfig.json" })}\n`);
  writeFileSync(resolve(scaffold, "tsconfig.json"), "{}\n");
  writeFileSync(resolve(scaffold, "package.json"), `${JSON.stringify({ private: true, devDependencies: { "@servicenow/sdk": "4.8.1" } })}\n`);
  return { root, scaffold, output: resolve(root, "converted"), scope };
}

function sourceDigest() {
  return createHash("sha256")
    .update(readFileSync(resolve("app/docsera-ui/now.config.json")))
    .update(readFileSync(resolve("app/docsera-ui/src/fluent/generated/keys.ts")))
    .update(readFileSync(resolve("app/docsera-global-bridge/src/fluent/generated/keys.ts")))
    .digest("hex");
}

function convert(target, output = target.output) {
  return convertIdentity([
    "--company-code", target.scope.split("_")[1],
    "--scaffold", target.scaffold,
    "--output", output,
    "--confirm-source", sourceScope
  ]);
}

test("converts both source contracts without changing the canonical source", () => {
  const target = fixture({ scope: "x_2300757_docsera" });
  const before = sourceDigest();
  try {
    const { manifest } = convert(target);
    const scopedConfig = JSON.parse(readFileSync(resolve(target.output, "app/docsera-ui/now.config.json"), "utf8"));
    const globalBridge = readFileSync(resolve(target.output, "app/docsera-global-bridge/src/server/script-includes/docsera-global-workspace-provisioning-bridge.js"), "utf8");
    assert.deepEqual({ scope: scopedConfig.scope, scopeId: scopedConfig.scopeId }, { scope: "x_2300757_docsera", scopeId: "1234567890abcdef1234567890abcdef" });
    assert.match(globalBridge, /x_2300757_docsera_workspace/);
    assert.equal(manifest.remainingSourceReferences.length, 0);
    assert.equal(manifest.unsupportedReferences.length, 0);
    assert.equal(manifest.changedFiles.some((entry) => entry.action === "omitted-generated-registry"), true);
    assert.equal(existsSync(resolve(target.output, "app/docsera-ui/src/fluent/generated/keys.ts")), false);
  } finally {
    assert.equal(sourceDigest(), before);
    rmSync(target.root, { recursive: true, force: true });
  }
});

test("is repeatable for another valid company prefix", () => {
  const target = fixture({ scope: "x_999999_docsera", scopeId: "abcdefabcdefabcdefabcdefabcdefab" });
  const secondOutput = resolve(target.root, "converted-again");
  try {
    const first = convert(target).manifest;
    const second = convert(target, secondOutput).manifest;
    assert.deepEqual(
      { target: first.target, changedFiles: first.changedFiles, excludedFrozenArtifacts: first.excludedFrozenArtifacts },
      { target: second.target, changedFiles: second.changedFiles, excludedFrozenArtifacts: second.excludedFrozenArtifacts }
    );
    assert.equal(existsSync(resolve(target.output, "app/docsera-global-bridge/update-set/docsera-global-companion.update-set.json")), false);
  } finally {
    rmSync(target.root, { recursive: true, force: true });
  }
});

test("rejects invalid, inconsistent, and unsafe identity inputs", () => {
  const target = fixture({ scope: "x_2300756_docsera" });
  try {
    assert.throws(() => convertIdentity(["--company-code", "invalid", "--scaffold", target.scaffold, "--output", target.output, "--confirm-source", sourceScope]));
    assert.throws(() => convertIdentity(["--company-code", "2300756", "--scaffold", target.scaffold, "--output", resolve("output"), "--confirm-source", sourceScope]));
    assert.throws(() => convertIdentity(["--company-code", "2300756", "--scaffold", target.scaffold, "--output", target.output, "--confirm-source", "x_other_docsera"]));
    writeFileSync(resolve(target.scaffold, "now.config.json"), JSON.stringify({
      scope: "x_2300756_docsera",
      scopeId: sourceScopeId,
      name: "Docsera",
      tsconfigPath: "./tsconfig.json"
    }));
    assert.throws(() => convert(target), /must not reuse/);
  } finally {
    rmSync(target.root, { recursive: true, force: true });
  }
});

test("refuses a canonical source identity mismatch before creating output", () => {
  const target = fixture({ scope: "x_2300756_docsera" });
  const mismatchedSourceConfig = resolve(target.root, "mismatched-source-now.config.json");
  const mismatchedScopeConfig = resolve(target.root, "mismatched-source-scope-now.config.json");
  const scopeMismatchOutput = resolve(target.root, "scope-mismatch-output");
  writeFileSync(mismatchedSourceConfig, JSON.stringify({ scope: sourceScope, scopeId: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" }));
  writeFileSync(mismatchedScopeConfig, JSON.stringify({ scope: "x_999999_docsera", scopeId: sourceScopeId }));
  try {
    assert.throws(() => convertIdentity([
      "--company-code", "2300756",
      "--scaffold", target.scaffold,
      "--output", target.output,
      "--confirm-source", sourceScope
    ], { sourceConfigPath: mismatchedSourceConfig }), /Canonical source scopeId must be/);
    assert.equal(existsSync(target.output), false);
    assert.throws(() => convertIdentity([
      "--company-code", "2300756",
      "--scaffold", target.scaffold,
      "--output", scopeMismatchOutput,
      "--confirm-source", sourceScope
    ], { sourceConfigPath: mismatchedScopeConfig }), /Canonical source scope must be/);
    assert.equal(existsSync(scopeMismatchOutput), false);
  } finally {
    rmSync(target.root, { recursive: true, force: true });
  }
});

test("rejects target configuration that does not have the expected SDK scaffold structure", () => {
  const target = fixture({ scope: "x_2300756_docsera" });
  const wrongSdkOutput = resolve(target.root, "wrong-sdk-output");
  rmSync(resolve(target.scaffold, "package.json"));
  try {
    assert.throws(() => convert(target), /must contain package.json/);
    assert.equal(existsSync(target.output), false);
    writeFileSync(resolve(target.scaffold, "package.json"), JSON.stringify({ devDependencies: { "@servicenow/sdk": "4.8.0" } }));
    assert.throws(() => convert(target, wrongSdkOutput), /must pin @servicenow\/sdk to 4\.8\.1/);
    assert.equal(existsSync(wrongSdkOutput), false);
  } finally {
    rmSync(target.root, { recursive: true, force: true });
  }
});

test("documents the command without performing conversion", () => {
  assert.match(convertIdentity(["--help"]).help, /never installs anything/);
});

test("reports unsupported source identity references rather than copying them silently", () => {
  const target = fixture({ scope: "x_2300756_docsera" });
  const sourceFile = resolve("app/docsera-ui", "identity-conversion-test.bin");
  try {
    writeFileSync(sourceFile, sourceScope);
    assert.throws(() => convert(target), /Unsupported source identity references/);
    const manifest = JSON.parse(readFileSync(resolve(target.output, "conversion-manifest.json"), "utf8"));
    assert.deepEqual(manifest.unsupportedReferences, [{ project: "app/docsera-ui", file: "identity-conversion-test.bin", reason: "source identity in unsupported file type" }]);
  } finally {
    rmSync(sourceFile, { force: true });
    rmSync(target.root, { recursive: true, force: true });
  }
});
