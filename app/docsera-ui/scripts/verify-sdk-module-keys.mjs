import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const validSysId = /^[0-9a-f]{32}$/i;

function isProductionServerModule(relativePath) {
  const normalized = relativePath.split(sep).join("/");
  return /\.(ts|tsx)$/.test(normalized)
    && !normalized.endsWith(".d.ts")
    && !/(^|\/)(__tests__|test|tests|fixtures)(\/|$)/.test(normalized)
    && !/\.(test|spec)\.(ts|tsx)$/.test(normalized)
    && !normalized.endsWith("/tsconfig.json");
}

function collectFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = resolve(directory, entry.name);
    return entry.isDirectory() ? collectFiles(fullPath) : [fullPath];
  });
}

export function moduleKeyForSourcePath(sourcePath, projectRoot) {
  return relative(projectRoot, sourcePath).split(sep).join("_").replace(/\./g, "_");
}

export function productionServerModules(projectRoot) {
  const serverRoot = resolve(projectRoot, "src/server");
  return collectFiles(serverRoot)
    .filter((filePath) => isProductionServerModule(relative(serverRoot, filePath)))
    .sort();
}

export function readModuleEntries(keysPath) {
  return readModuleEntriesFromSource(readFileSync(keysPath, "utf8"));
}

export function readModuleEntriesFromSource(source) {
  const entries = [];
  const entryPattern = /(?:^|\n)\s*(?:'([^']+)'|([A-Za-z_$][\w$]*))\s*:\s*\{([\s\S]*?)\n\s*\}/g;

  for (const match of source.matchAll(entryPattern)) {
    const [, quotedKey, bareKey, body] = match;
    if (!/\btable\s*:\s*'sys_module'/.test(body)) continue;
    const idMatch = body.match(/\bid\s*:\s*'([^']*)'/);
    entries.push({ key: quotedKey ?? bareKey, id: idMatch?.[1] ?? null });
  }

  return entries;
}

export function verifySdkModuleIdentityContents(sourcePaths, keysSource, projectRoot) {
  const entries = readModuleEntriesFromSource(keysSource);
  const errors = [];
  const entriesByKey = new Map();
  const keysById = new Map();

  for (const entry of entries) {
    const byKey = entriesByKey.get(entry.key) ?? [];
    byKey.push(entry);
    entriesByKey.set(entry.key, byKey);
    if (entry.id) {
      const byId = keysById.get(entry.id) ?? [];
      byId.push(entry.key);
      keysById.set(entry.id, byId);
    }
  }

  for (const sourcePath of sourcePaths) {
    const key = moduleKeyForSourcePath(sourcePath, projectRoot);
    const matches = entriesByKey.get(key) ?? [];
    const displayPath = relative(projectRoot, sourcePath).split(sep).join("/");
    if (matches.length === 0) {
      errors.push(`Missing sys_module identity for ${displayPath} (${key}).`);
    } else if (matches.length !== 1) {
      errors.push(`Duplicate sys_module identities for ${displayPath} (${key}).`);
    } else if (!validSysId.test(matches[0].id ?? "")) {
      errors.push(`Malformed sys_module identity for ${displayPath} (${key}): expected a 32-character hexadecimal sys_id.`);
    }
  }

  for (const [id, keys] of keysById) {
    if (keys.length > 1) {
      errors.push(`Conflicting sys_module identities: sys_id ${id} is assigned to ${keys.join(", ")}.`);
    }
  }

  return errors;
}

export function verifySdkModuleKeys(projectRoot) {
  const keysPath = resolve(projectRoot, "src/fluent/generated/keys.ts");
  return verifySdkModuleIdentityContents(productionServerModules(projectRoot), readFileSync(keysPath, "utf8"), projectRoot);
}

function gitOutput(projectRoot, argumentsList) {
  return execFileSync("git", argumentsList, { cwd: projectRoot, encoding: "utf8" });
}

function gitRepositoryRoot(projectRoot) {
  return gitOutput(projectRoot, ["rev-parse", "--show-toplevel"]).trim();
}

function gitProjectPath(repositoryRoot, projectRoot, projectRelativePath) {
  return relative(repositoryRoot, resolve(projectRoot, projectRelativePath)).split(sep).join("/");
}

export function checkpointProductionServerModules(projectRoot) {
  const repositoryRoot = gitRepositoryRoot(projectRoot);
  const serverRoot = gitProjectPath(repositoryRoot, projectRoot, "src/server");
  return gitOutput(repositoryRoot, ["ls-tree", "-r", "--name-only", "HEAD", "--", serverRoot])
    .split("\n")
    .filter(Boolean)
    .filter(isProductionServerModule)
    .map((path) => resolve(repositoryRoot, path))
    .sort();
}

export function verifySdkModuleKeysCheckpoint(projectRoot) {
  const repositoryRoot = gitRepositoryRoot(projectRoot);
  const keysPath = gitProjectPath(repositoryRoot, projectRoot, "src/fluent/generated/keys.ts");
  const errors = verifySdkModuleIdentityContents(
    checkpointProductionServerModules(projectRoot),
    gitOutput(repositoryRoot, ["show", `HEAD:${keysPath}`]),
    projectRoot
  );

  try {
    gitOutput(repositoryRoot, ["diff", "--quiet", "HEAD", "--", keysPath]);
  } catch (error) {
    if (error.status === 1) errors.push(`Outstanding modifications to tracked generated registry: ${keysPath}.`);
    else throw error;
  }

  return errors;
}

function parseArguments(argumentsList) {
  const checkpoint = argumentsList[0] === "--checkpoint";
  const remaining = checkpoint ? argumentsList.slice(1) : argumentsList;
  if (remaining.length === 0) return { checkpoint, projectRoot: resolve(scriptDirectory, "..") };
  if (remaining.length === 2 && remaining[0] === "--project-root") return { checkpoint, projectRoot: resolve(remaining[1]) };
  throw new Error("Usage: node verify-sdk-module-keys.mjs [--checkpoint] [--project-root <app-directory>]");
}

function main() {
  const { checkpoint, projectRoot } = parseArguments(process.argv.slice(2));
  const errors = checkpoint ? verifySdkModuleKeysCheckpoint(projectRoot) : verifySdkModuleKeys(projectRoot);
  if (errors.length === 0) {
    console.log(checkpoint ? "Committed SDK module identities verified." : "SDK module identities verified.");
    return;
  }

  console.error("SDK module identity verification failed:");
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
