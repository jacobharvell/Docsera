import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import assert from "node:assert/strict";
import { verifySdkModuleKeys, verifySdkModuleKeysCheckpoint } from "./verify-sdk-module-keys.mjs";

const verifierPath = fileURLToPath(new URL("./verify-sdk-module-keys.mjs", import.meta.url));

function createFixture({ files, entries, root = mkdtempSync(join(tmpdir(), "docsera-sdk-keys-")) }) {
  try {
    for (const file of files) {
      const path = join(root, "src/server", file);
      mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, "export {};\n");
    }
    const keysPath = join(root, "src/fluent/generated/keys.ts");
    mkdirSync(join(keysPath, ".."), { recursive: true });
    writeFileSync(keysPath, `declare global {\n  type Modules = {\n${entries.join("\n")}\n  }\n}\n`);
    return { root, keysPath };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

function moduleEntry(key, id = "0123456789abcdef0123456789abcdef") {
  return `    ${key}: {\n      table: 'sys_module'\n      id: '${id}'\n    }`;
}

function withFixture(options, assertion) {
  const fixture = createFixture(options);
  try { assertion(fixture); } finally { rmSync(fixture.root, { recursive: true, force: true }); }
}

function withNestedRepositoryFixture(options, assertion) {
  const repositoryRoot = mkdtempSync(join(tmpdir(), "docsera-sdk-keys-repository-"));
  const root = join(repositoryRoot, "app/docsera-ui");
  try {
    const fixture = createFixture({ ...options, root });
    commitFixture(repositoryRoot, "fixture");
    assertion(fixture);
  } finally {
    rmSync(repositoryRoot, { recursive: true, force: true });
  }
}

function git(root, argumentsList) {
  const result = spawnSync("git", argumentsList, { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
}

function commitFixture(root, message) {
  git(root, ["init", "--quiet"]);
  git(root, ["config", "user.name", "Docsera Test"]);
  git(root, ["config", "user.email", "docsera-test@example.invalid"]);
  git(root, ["add", "."]);
  git(root, ["commit", "--quiet", "-m", message]);
}

test("passes complete production module identities and preserves its inputs", () => {
  withFixture({
    files: ["workspaces/example.ts", "pages/view.tsx"],
    entries: [moduleEntry("src_server_workspaces_example_ts"), moduleEntry("src_server_pages_view_tsx", "fedcba9876543210fedcba9876543210")]
  }, ({ root, keysPath }) => {
    const before = readFileSync(keysPath, "utf8");
    assert.deepEqual(verifySdkModuleKeys(root), []);
    assert.equal(spawnSync(process.execPath, [verifierPath, "--project-root", root]).status, 0);
    assert.equal(readFileSync(keysPath, "utf8"), before);
  });
});

test("fails when a newly added production module has no identity", () => {
  withFixture({ files: ["workspaces/example.ts"], entries: [] }, ({ root }) => {
    assert.match(verifySdkModuleKeys(root).join("\n"), /Missing sys_module identity.*src\/server\/workspaces\/example\.ts/);
    const result = spawnSync(process.execPath, [verifierPath, "--project-root", root], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Missing sys_module identity/);
  });
});

test("fails duplicate and malformed module identities", () => {
  withFixture({
    files: ["workspaces/example.ts", "pages/view.ts", "editor/color.ts"],
    entries: [
      moduleEntry("src_server_workspaces_example_ts", "not-a-sys-id"),
      moduleEntry("src_server_workspaces_example_ts", "0123456789abcdef0123456789abcdef"),
      moduleEntry("src_server_pages_view_ts", "0123456789abcdef0123456789abcdef"),
      moduleEntry("src_server_editor_color_ts", "not-a-sys-id")
    ]
  }, ({ root }) => {
    const errors = verifySdkModuleKeys(root).join("\n");
    assert.match(errors, /Duplicate sys_module identities.*example/);
    assert.match(errors, /Conflicting sys_module identities/);
    assert.match(errors, /Malformed sys_module identity.*color/);
  });
});

test("ignores test and declaration files and permits historical extra entries", () => {
  withFixture({
    files: ["workspaces/example.ts", "workspaces/example.test.ts", "workspaces/types.d.ts", "__tests__/ignored.ts"],
    entries: [moduleEntry("src_server_workspaces_example_ts"), moduleEntry("src_server_removed_legacy_ts", "fedcba9876543210fedcba9876543210")]
  }, ({ root }) => assert.deepEqual(verifySdkModuleKeys(root), []));
});

test("checkpoint rejects a committed module missing its identity even when the working registry has it", () => {
  withFixture({ files: ["workspaces/example.ts"], entries: [] }, ({ root, keysPath }) => {
    commitFixture(root, "module without generated identity");
    writeFileSync(keysPath, `declare global {\n  type Modules = {\n${moduleEntry("src_server_workspaces_example_ts")}\n  }\n}\n`);

    assert.deepEqual(verifySdkModuleKeys(root), []);
    assert.match(verifySdkModuleKeysCheckpoint(root).join("\n"), /Missing sys_module identity.*example\.ts/);
    const result = spawnSync(process.execPath, [verifierPath, "--checkpoint", "--project-root", root], { encoding: "utf8" });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Missing sys_module identity/);
  });
});

test("checkpoint passes when a module and generated identity are committed together", () => {
  withNestedRepositoryFixture({ files: ["workspaces/example.ts"], entries: [moduleEntry("src_server_workspaces_example_ts")] }, ({ root }) => {
    assert.deepEqual(verifySdkModuleKeysCheckpoint(root), []);
    assert.equal(spawnSync(process.execPath, [verifierPath, "--checkpoint", "--project-root", root]).status, 0);
  });
});

test("checkpoint rejects subsequent uncommitted generated registry changes", () => {
  withFixture({ files: ["workspaces/example.ts"], entries: [moduleEntry("src_server_workspaces_example_ts")] }, ({ root, keysPath }) => {
    commitFixture(root, "complete checkpoint");
    writeFileSync(keysPath, `${readFileSync(keysPath, "utf8")}\n// regenerated locally\n`);
    assert.match(verifySdkModuleKeysCheckpoint(root).join("\n"), /Outstanding modifications to tracked generated registry/);
  });
});
