#!/usr/bin/env node

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { convertIdentity } from "./convert-sdk-identity.mjs";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const sourceScopedIdentity = { scope: "x_2300756_docsera", scopeId: "e6e43323accd4c7fb9271525a343850e" };
const sourceGlobalIdentity = { scope: "global", scopeId: "2698dffadc844c00a9f20d67fca177d5" };
const ignoredDirectories = new Set([".git", ".now", ".now-sdk", "coverage", "dist", "lib", "node_modules", "target", "update-set"]);

function fail(message) { throw new Error(message); }

function usage() {
  return "Usage: npm run setup:developer-instance -- -- --instance <https://instance.service-now.com> --auth <sdk-auth-alias> --company-code <digits>";
}

export function parseArguments(argumentsList) {
  if (argumentsList.length === 1 && argumentsList[0] === "--help") return { help: true };
  const values = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!flag?.startsWith("--") || value === undefined || values.has(flag)) fail(usage());
    values.set(flag, value);
  }
  const required = ["--instance", "--auth", "--company-code"];
  if (values.size !== required.length || required.some((flag) => !values.has(flag))) fail(usage());
  const instance = values.get("--instance");
  if (!/^https:\/\/[^/]+\.service-now\.com\/?$/i.test(instance)) fail("--instance must be an explicit https://<name>.service-now.com URL.");
  const companyCode = values.get("--company-code");
  if (!/^\d{1,10}$/.test(companyCode)) fail("--company-code must contain only 1-10 digits.");
  if (!/^[A-Za-z0-9._-]+$/.test(values.get("--auth"))) fail("--auth must name an SDK authentication alias using letters, numbers, dots, underscores, or hyphens.");
  return { instance: instance.replace(/\/$/, ""), auth: values.get("--auth"), companyCode };
}

function readJson(path, label) {
  try { return JSON.parse(readFileSync(path, "utf8")); }
  catch (error) { fail(`Unable to read ${label}: ${error.message}`); }
}

function sameIdentity(config, identity) {
  return config.scope === identity.scope && config.scopeId === identity.scopeId;
}

function copyCandidateTree(source, destination) {
  for (const entry of readdirSync(source)) {
    if (ignoredDirectories.has(entry)) continue;
    cpSync(resolve(source, entry), resolve(destination, entry), { recursive: true, force: true });
  }
}

function quoteWindowsCommandArgument(value) {
  return `"${String(value).replace(/(\\*)"/g, "$1$1\\\"").replace(/(\\+)$/g, "$1$1")}"`;
}

export function command(commandRunner, file, args, options) {
  if (process.platform !== "win32") {
    return commandRunner(file, args, { encoding: "utf8", stdio: "pipe", shell: false, ...options });
  }
  const commandLine = [file, ...args].map(quoteWindowsCommandArgument).join(" ");
  return commandRunner(commandLine, [], { encoding: "utf8", stdio: "pipe", shell: true, ...options });
}

function authProfileMatches(authList, alias, instance) {
  const lines = authList.replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const aliasMatch = lines[index].trim().match(/^\*?\[([^\]]+)\]$/);
    if (!aliasMatch || aliasMatch[1] !== alias) continue;
    for (let detailIndex = index + 1; detailIndex < lines.length && !lines[detailIndex].trim().match(/^\*?\[[^\]]+\]$/); detailIndex += 1) {
      const hostMatch = lines[detailIndex].match(/^\s*host\s*=\s*(\S+)\s*$/);
      if (hostMatch) return hostMatch[1].replace(/\/$/, "").toLowerCase() === instance.toLowerCase();
    }
    return false;
  }
  return false;
}

export function setupDeveloperInstanceIdentity(argumentsList, {
  root = repositoryRoot,
  commandRunner = execFileSync,
  converter = convertIdentity,
  temporaryDirectory = () => mkdtempSync(resolve(tmpdir(), "docsera-developer-identity-"))
} = {}) {
  const options = parseArguments(argumentsList);
  if (options.help) return { help: usage() };
  const scopedProject = resolve(root, "app/docsera-ui");
  const globalProject = resolve(root, "app/docsera-global-bridge");
  const scopedConfigPath = resolve(scopedProject, "now.config.json");
  const globalConfigPath = resolve(globalProject, "now.config.json");
  const scopedConfig = readJson(scopedConfigPath, "the scoped now.config.json");
  const globalConfig = readJson(globalConfigPath, "the Global companion now.config.json");
  if (!sameIdentity(scopedConfig, sourceScopedIdentity) || !sameIdentity(globalConfig, sourceGlobalIdentity)) {
    fail("This checkout is already identity-converted or is not the canonical Docsera source; setup is one-time and will not replace an existing identity.");
  }
  const status = command(commandRunner, "git", ["status", "--porcelain"], { cwd: root });
  if (status.trim()) fail("Refusing identity setup because this checkout has uncommitted changes. Commit, stash, or discard them first.");
  const sdk = resolve(scopedProject, "node_modules/.bin", process.platform === "win32" ? "now-sdk.cmd" : "now-sdk");
  if (!existsSync(sdk)) fail("Missing the pinned SDK executable. Run npm ci in app/docsera-ui before identity setup.");
  const authList = command(commandRunner, sdk, ["auth", "--list"], { cwd: scopedProject });
  if (!authProfileMatches(authList, options.auth, options.instance)) {
    fail(`SDK authentication alias ${JSON.stringify(options.auth)} is not configured for ${options.instance}. Create or correct it with now-sdk auth before retrying.`);
  }
  const scratch = temporaryDirectory();
  try {
    const scopedScaffold = resolve(scratch, "scoped-scaffold");
    const globalScaffold = resolve(scratch, "global-scaffold");
    mkdirSync(scopedScaffold, { recursive: true });
    mkdirSync(globalScaffold, { recursive: true });
    command(commandRunner, sdk, ["init", "--appName", "Docsera", "--packageName", "docsera-direct-ui-page-runtime", "--scopeName", `x_${options.companyCode}_docsera`, "--template", "typescript.react", "--auth", options.auth, "--noUpdate"], { cwd: scopedScaffold });
    command(commandRunner, sdk, ["init", "--appName", "Docsera Global Workspace Provisioning Bridge", "--packageName", "docsera-global-workspace-bridge", "--scopeName", "global", "--template", "typescript.basic", "--auth", options.auth, "--noUpdate"], { cwd: globalScaffold });
    const output = resolve(scratch, "converted");
    converter(["--company-code", options.companyCode, "--scaffold", scopedScaffold, "--output", output, "--confirm-source", sourceScopedIdentity.scope]);
    const globalScaffoldConfig = readJson(resolve(globalScaffold, "now.config.json"), "the initialized Global companion now.config.json");
    if (globalScaffoldConfig.scope !== "global" || !/^[0-9a-f]{32}$/i.test(String(globalScaffoldConfig.scopeId))) {
      fail("The SDK did not produce a separately owned Global companion identity. Refusing to use the platform Global identity.");
    }
    const convertedGlobalConfigPath = resolve(output, "app/docsera-global-bridge/now.config.json");
    const convertedGlobalConfig = readJson(convertedGlobalConfigPath, "the converted Global companion now.config.json");
    writeFileSync(convertedGlobalConfigPath, `${JSON.stringify({ ...convertedGlobalConfig, scopeId: globalScaffoldConfig.scopeId.toLowerCase() }, null, 2)}\n`);
    for (const project of ["docsera-ui", "docsera-global-bridge"]) {
      const candidate = resolve(output, "app", project);
      command(commandRunner, "npm", ["ci"], { cwd: candidate });
      command(commandRunner, "npm", ["run", "build"], { cwd: candidate });
    }
    if (command(commandRunner, "git", ["status", "--porcelain"], { cwd: root }).trim()) {
      fail("This checkout changed while identity setup was preparing its candidate. No identity files were applied.");
    }
    copyCandidateTree(resolve(output, "app/docsera-ui"), scopedProject);
    copyCandidateTree(resolve(output, "app/docsera-global-bridge"), globalProject);
    for (const project of [scopedProject, globalProject]) {
      command(commandRunner, "npm", ["ci"], { cwd: project });
      command(commandRunner, "npm", ["run", "build"], { cwd: project });
    }
    return { instance: options.instance, auth: options.auth, scope: `x_${options.companyCode}_docsera`, scopedProject, globalProject };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = setupDeveloperInstanceIdentity(process.argv.slice(2));
    console.log(result.help ?? `Developer identity setup complete for ${result.scope}. No ServiceNow installation was performed.`);
  } catch (error) {
    console.error(`Developer identity setup failed: ${error.message}`);
    process.exitCode = 1;
  }
}
