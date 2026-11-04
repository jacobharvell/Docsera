import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import test from "node:test";
import { command, parseArguments, setupDeveloperInstanceIdentity } from "./setup-developer-instance-identity.mjs";

const canonicalScoped = { scope: "x_2300756_docsera", scopeId: "e6e43323accd4c7fb9271525a343850e", name: "Docsera", tsconfigPath: "./src/server/tsconfig.json" };
const canonicalGlobal = { scope: "global", scopeId: "2698dffadc844c00a9f20d67fca177d5", name: "Docsera Global Workspace Provisioning Bridge", tsconfigPath: "./src/server/tsconfig.json" };

function writeJson(path, value) { mkdirSync(resolve(path, ".."), { recursive: true }); writeFileSync(path, `${JSON.stringify(value)}\n`); }

function launchedCommand(file, args) {
  if (args.length) return { file, args };
  const parts = [...file.matchAll(/"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2]);
  return { file: parts[0], args: parts.slice(1) };
}

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "docsera-developer-setup-"));
  writeJson(resolve(root, "app/docsera-ui/now.config.json"), canonicalScoped);
  writeJson(resolve(root, "app/docsera-global-bridge/now.config.json"), canonicalGlobal);
  mkdirSync(resolve(root, "app/docsera-ui/node_modules/.bin"), { recursive: true });
  writeFileSync(resolve(root, "app/docsera-ui/node_modules/.bin", process.platform === "win32" ? "now-sdk.cmd" : "now-sdk"), "stub");
  return root;
}

function fakeRunner(calls, dirty = false) {
  return (file, args, options) => {
    const launched = launchedCommand(file, args);
    file = launched.file;
    args = launched.args;
    const { cwd } = options;
    calls.push({ file, args, ...options });
    if (file === "git") return dirty ? " M app/docsera-ui/now.config.json\n" : "";
    if (args.join(" ") === "auth --list") return "Listing all credentials:\n[docsera-local]\n      host = https://dev123456.service-now.com\n      type = basic\n      default = No\n";
    if (args[0] === "init") {
      const scope = args[args.indexOf("--scopeName") + 1];
      writeJson(resolve(cwd, "now.config.json"), { scope, scopeId: scope === "global" ? "abcdefabcdefabcdefabcdefabcdefab" : "1234567890abcdef1234567890abcdef" });
      return "";
    }
    if (file === "npm" && args.join(" ") === "run build") {
      mkdirSync(resolve(cwd, "src/fluent/generated"), { recursive: true });
      writeFileSync(resolve(cwd, "src/fluent/generated/keys.ts"), "export const generated = true;\n");
    }
    return "";
  };
}

function fakeConverter(argumentsList) {
  const output = argumentsList[argumentsList.indexOf("--output") + 1];
  const scaffold = argumentsList[argumentsList.indexOf("--scaffold") + 1];
  const scoped = JSON.parse(readFileSync(resolve(scaffold, "now.config.json"), "utf8"));
  writeJson(resolve(output, "app/docsera-ui/now.config.json"), { ...canonicalScoped, scope: scoped.scope, scopeId: scoped.scopeId });
  writeJson(resolve(output, "app/docsera-global-bridge/now.config.json"), canonicalGlobal);
  return { manifest: {} };
}

test("initializes both SDK identities, applies a built candidate, and preserves the checkout structure", () => {
  const root = fixture();
  const calls = [];
  try {
    const result = setupDeveloperInstanceIdentity(["--instance", "https://dev123456.service-now.com", "--auth", "docsera-local", "--company-code", "123456"], {
      root,
      commandRunner: fakeRunner(calls),
      converter: fakeConverter
    });
    assert.equal(result.scope, "x_123456_docsera");
    assert.deepEqual(JSON.parse(readFileSync(resolve(root, "app/docsera-ui/now.config.json"))), { ...canonicalScoped, scope: "x_123456_docsera", scopeId: "1234567890abcdef1234567890abcdef" });
    assert.equal(JSON.parse(readFileSync(resolve(root, "app/docsera-global-bridge/now.config.json"))).scopeId, "abcdefabcdefabcdefabcdefabcdefab");
    assert.equal(readFileSync(resolve(root, "app/docsera-ui/src/fluent/generated/keys.ts"), "utf8"), "export const generated = true;\n");
    assert.equal(existsSync(resolve(root, "app/docsera-ui/node_modules/.bin", process.platform === "win32" ? "now-sdk.cmd" : "now-sdk")), true);
    assert.equal(calls.filter(({ args }) => args[0] === "init").length, 2);
    assert.equal(calls.filter(({ file, args }) => file === "npm" && args.join(" ") === "run build").length, 4);
    assert.equal(calls.filter(({ file, args }) => file === "npm" && args.join(" ") === "ci").length, 4);
    assert.deepEqual(calls.find(({ args }) => args[0] === "auth").args, ["auth", "--list"]);
    assert.equal(calls.every(({ shell }) => shell === (process.platform === "win32")), true);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("rejects an alias whose credential block points at a different instance", () => {
  const root = fixture();
  const calls = [];
  const runner = (file, args, options) => {
    const launched = launchedCommand(file, args);
    file = launched.file;
    args = launched.args;
    calls.push({ file, args, ...options });
    if (file === "git") return "";
    if (args.join(" ") === "auth --list") return "[docsera-local]\n      host = https://wrong.service-now.com\n[other]\n      host = https://dev123456.service-now.com\n";
    return "";
  };
  try {
    assert.throws(() => setupDeveloperInstanceIdentity(["--instance", "https://dev123456.service-now.com", "--auth", "docsera-local", "--company-code", "123456"], {
      root,
      commandRunner: runner,
      converter: fakeConverter
    }), /not configured/);
    assert.equal(calls.some(({ args }) => args[0] === "init"), false);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("refuses dirty or previously converted checkouts before SDK initialization", () => {
  const root = fixture();
  const calls = [];
  try {
    assert.throws(() => setupDeveloperInstanceIdentity(["--instance", "https://dev123456.service-now.com", "--auth", "docsera-local", "--company-code", "123456"], { root, commandRunner: fakeRunner(calls, true), converter: fakeConverter }), /uncommitted changes/);
    assert.equal(calls.some(({ args }) => args[0] === "init"), false);
    writeJson(resolve(root, "app/docsera-ui/now.config.json"), { ...canonicalScoped, scope: "x_123456_docsera" });
    assert.throws(() => setupDeveloperInstanceIdentity(["--instance", "https://dev123456.service-now.com", "--auth", "docsera-local", "--company-code", "123456"], { root, commandRunner: fakeRunner([]), converter: fakeConverter }), /already identity-converted/);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test("requires an explicit valid instance, SDK auth alias, and company code", () => {
  assert.throws(() => parseArguments([]), /Usage/);
  assert.throws(() => parseArguments(["--instance", "http://example.com", "--auth", "alias", "--company-code", "1"]), /instance/);
  assert.throws(() => parseArguments(["--instance", "https://dev123456.service-now.com", "--auth", "", "--company-code", "1"]), /auth/);
  assert.throws(() => parseArguments(["--instance", "https://dev123456.service-now.com", "--auth", "alias & other", "--company-code", "1"]), /auth/);
});

test("Windows shell execution preserves an executable path and multiword app name as individual arguments", { skip: process.platform !== "win32" }, () => {
  const directory = mkdtempSync(resolve(tmpdir(), "docsera command path "));
  const commandPath = resolve(directory, "capture arguments.cmd");
  const outputPath = resolve(directory, "received.txt");
  try {
    writeFileSync(commandPath, "@echo off\r\n> \"%~dp0received.txt\" (\r\n  echo [%~1]\r\n  echo [%~2]\r\n  echo [%~3]\r\n)\r\n");
    command(execFileSync, commandPath, ["init", "--appName", "Docsera Global Workspace Provisioning Bridge"], { cwd: directory });
    assert.deepEqual(readFileSync(outputPath, "utf8").trim().split(/\r?\n/), ["[init]", "[--appName]", "[Docsera Global Workspace Provisioning Bridge]"]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
