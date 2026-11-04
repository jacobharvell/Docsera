#!/usr/bin/env node

import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const SOURCE_SCOPE = "x_2300756_docsera";
const SOURCE_SCOPE_ID = "e6e43323accd4c7fb9271525a343850e";
const SOURCE_CONFIG_PATH = resolve(repositoryRoot, "app/docsera-ui/now.config.json");
const PINNED_SDK_VERSION = "4.8.1";
const supportedTextExtensions = new Set([".css", ".d.ts", ".html", ".js", ".json", ".md", ".mjs", ".now.ts", ".test.ts", ".ts", ".tsx", ".txt"]);
const excludedDirectoryNames = new Set([".git", ".now", ".now-sdk", "coverage", "dist", "lib", "node_modules", "target", "update-set"]);

function usage() {
  return [
    "Usage: node scripts/convert-sdk-identity.mjs --company-code <digits> --scaffold <sdk-scaffold-directory> --output <empty-directory> --confirm-source x_2300756_docsera",
    "",
    "The scaffold must have the local structure emitted by the repository-pinned SDK 4.8.1 init flow; its target scopeId still requires pre-install verification.",
    "This command copies source into output/app, never installs anything, and deliberately leaves generated keys.ts registries for SDK regeneration."
  ].join("\n");
}

function fail(message) {
  throw new Error(message);
}

function parseArguments(argumentsList) {
  if (argumentsList.length === 1 && argumentsList[0] === "--help") return { help: true };
  const values = new Map();
  for (let index = 0; index < argumentsList.length; index += 2) {
    const flag = argumentsList[index];
    const value = argumentsList[index + 1];
    if (!flag?.startsWith("--") || value === undefined || values.has(flag)) fail(usage());
    values.set(flag, value);
  }
  const expected = ["--company-code", "--scaffold", "--output", "--confirm-source"];
  if (values.size !== expected.length || expected.some((flag) => !values.has(flag))) fail(usage());
  return Object.fromEntries(expected.map((flag) => [flag.slice(2).replaceAll("-", "_"), values.get(flag)]));
}

function normalized(pathValue) {
  return resolve(pathValue).replaceAll("\\", "/").toLowerCase();
}

function isInside(candidate, container) {
  const pathRelative = relative(container, candidate);
  return pathRelative === "" || (!pathRelative.startsWith(`..${sep}`) && pathRelative !== "..");
}

function validateOutput(outputPath, scaffoldPath) {
  if (!isAbsolute(outputPath)) fail("--output must be an absolute path so the source tree cannot be overwritten by accident.");
  const source = realpathSync(repositoryRoot);
  const scaffold = realpathSync(scaffoldPath);
  const output = resolve(outputPath);
  if (normalized(output) === normalized(source) || isInside(source, output) || isInside(output, source)) {
    fail("--output must be outside the canonical repository tree.");
  }
  if (normalized(output) === normalized(scaffold) || isInside(scaffold, output) || isInside(output, scaffold)) {
    fail("--output must not contain, or be contained by, the SDK scaffold.");
  }
  if (existsSync(output)) {
    if (!lstatSync(output).isDirectory() || readdirSync(output).length > 0) fail("--output must not exist or must be an empty directory.");
  }
  return output;
}

function readJson(filePath, description) {
  try {
    return JSON.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    fail(`Unable to read ${description}: ${error.message}`);
  }
}

function validateCanonicalSourceIdentity(sourceConfigPath = SOURCE_CONFIG_PATH) {
  const config = readJson(sourceConfigPath, "the canonical scoped application now.config.json");
  if (config.scope !== SOURCE_SCOPE) {
    fail(`Canonical source scope must be ${SOURCE_SCOPE}; received ${JSON.stringify(config.scope)}.`);
  }
  if (config.scopeId !== SOURCE_SCOPE_ID) {
    fail(`Canonical source scopeId must be ${SOURCE_SCOPE_ID}; received ${JSON.stringify(config.scopeId)}.`);
  }
}

function validateIdentity({ company_code: companyCode, scaffold, confirm_source: confirmSource }) {
  if (!/^\d{1,10}$/.test(companyCode)) fail("--company-code must contain only 1-10 digits.");
  if (confirmSource !== SOURCE_SCOPE) fail(`--confirm-source must explicitly confirm the canonical source scope ${SOURCE_SCOPE}.`);
  if (!existsSync(scaffold) || !lstatSync(scaffold).isDirectory()) fail("--scaffold must be an existing SDK scaffold directory.");
  const configPath = resolve(scaffold, "now.config.json");
  if (!existsSync(configPath)) fail("--scaffold must contain now.config.json.");
  const config = readJson(configPath, "the SDK scaffold now.config.json");
  if (typeof config.name !== "string" || config.name.trim() === "") fail("Scaffold now.config.json must declare a non-empty application name.");
  if (typeof config.tsconfigPath !== "string" || config.tsconfigPath.trim() === "" || isAbsolute(config.tsconfigPath)) {
    fail("Scaffold now.config.json must declare a relative tsconfigPath.");
  }
  const tsconfigPath = resolve(scaffold, config.tsconfigPath);
  if (!isInside(tsconfigPath, resolve(scaffold)) || !existsSync(tsconfigPath) || !lstatSync(tsconfigPath).isFile()) {
    fail("Scaffold tsconfigPath must resolve to a file inside the scaffold.");
  }
  const packagePath = resolve(scaffold, "package.json");
  if (!existsSync(packagePath)) fail("--scaffold must contain package.json.");
  const packageConfig = readJson(packagePath, "the SDK scaffold package.json");
  if (packageConfig.devDependencies?.["@servicenow/sdk"] !== PINNED_SDK_VERSION) {
    fail(`Scaffold package.json must pin @servicenow/sdk to ${PINNED_SDK_VERSION}.`);
  }
  const scope = `x_${companyCode}_docsera`;
  if (config.scope !== scope) fail(`Scaffold scope must be ${scope}; received ${JSON.stringify(config.scope)}.`);
  if (!/^[0-9a-f]{32}$/i.test(String(config.scopeId ?? ""))) fail("Scaffold scopeId must be a 32-character sys_id-shaped value.");
  if (config.scopeId === SOURCE_SCOPE_ID) fail("Scaffold scopeId must not reuse the canonical source application record ID.");
  if (scope.length > 18) fail(`Target scope ${scope} exceeds the SDK 18-character limit.`);
  return { scope, scopeId: config.scopeId.toLowerCase(), scaffoldConfigPath: configPath };
}

function extensionFor(relativePath) {
  const fileName = relativePath.split("/").at(-1);
  if (fileName.endsWith(".now.ts")) return ".now.ts";
  if (fileName.endsWith(".test.ts")) return ".test.ts";
  if (fileName.endsWith(".d.ts")) return ".d.ts";
  const dot = fileName.lastIndexOf(".");
  return dot === -1 ? "" : fileName.slice(dot);
}

function containsSourceIdentity(buffer) {
  return buffer.includes(SOURCE_SCOPE) || buffer.includes(SOURCE_SCOPE_ID);
}

function collectUnsupportedReferences(rootPath, relativePath = "") {
  const fullPath = resolve(rootPath, relativePath);
  const entry = lstatSync(fullPath);
  if (entry.isDirectory()) {
    if (excludedDirectoryNames.has(relativePath.split("/").at(-1))) return [];
    return readdirSync(fullPath).flatMap((name) => collectUnsupportedReferences(rootPath, `${relativePath}${relativePath ? "/" : ""}${name}`));
  }
  if (!entry.isFile() || relativePath.endsWith("src/fluent/generated/keys.ts")) return [];
  const content = readFileSync(fullPath);
  return !supportedTextExtensions.has(extensionFor(relativePath)) && containsSourceIdentity(content)
    ? [{ file: relativePath.replaceAll("\\", "/"), reason: "source identity in unsupported file type" }]
    : [];
}

function transformTree(sourcePath, destinationPath, sourceRoot = sourcePath) {
  const relativePath = relative(sourceRoot, sourcePath).split(sep).join("/");
  if (lstatSync(sourcePath).isDirectory()) {
    const directoryName = relativePath.split("/").at(-1);
    if (excludedDirectoryNames.has(directoryName)) return [];
    mkdirSync(destinationPath, { recursive: true });
    return readdirSync(sourcePath).flatMap((name) => transformTree(resolve(sourcePath, name), resolve(destinationPath, name), sourceRoot));
  }
  if (relativePath.endsWith("src/fluent/generated/keys.ts")) return [{ file: relativePath, action: "omitted-generated-registry" }];
  const content = readFileSync(sourcePath);
  if (!supportedTextExtensions.has(extensionFor(relativePath))) {
    cpSync(sourcePath, destinationPath);
    return [{ file: relativePath, action: "copied" }];
  }
  const sourceText = content.toString("utf8");
  const transformed = sourceText.replaceAll(SOURCE_SCOPE, targetIdentity.scope).replaceAll(SOURCE_SCOPE_ID, targetIdentity.scopeId);
  writeFileSync(destinationPath, transformed, "utf8");
  return [{ file: relativePath, action: transformed === sourceText ? "copied" : "converted" }];
}

function findRemainingReferences(rootPath, relativePath = "") {
  const fullPath = resolve(rootPath, relativePath);
  const entry = lstatSync(fullPath);
  if (entry.isDirectory()) return readdirSync(fullPath).flatMap((name) => findRemainingReferences(rootPath, `${relativePath}${relativePath ? "/" : ""}${name}`));
  if (relativePath.endsWith("src/fluent/generated/keys.ts")) return [];
  if (!entry.isFile()) return [];
  const content = readFileSync(fullPath);
  return containsSourceIdentity(content) ? [relativePath.replaceAll("\\", "/")] : [];
}

let targetIdentity;

export function convertIdentity(argumentsList, { sourceRoot = repositoryRoot, sourceConfigPath = SOURCE_CONFIG_PATH } = {}) {
  const argumentsObject = parseArguments(argumentsList);
  if (argumentsObject.help) return { help: usage() };
  if (resolve(sourceRoot) !== repositoryRoot) fail("The converter only accepts the canonical repository source root.");
  validateCanonicalSourceIdentity(sourceConfigPath);
  targetIdentity = validateIdentity(argumentsObject);
  const output = validateOutput(argumentsObject.output, argumentsObject.scaffold);
  const unsupportedReferences = ["app/docsera-ui", "app/docsera-global-bridge"].flatMap((project) =>
    collectUnsupportedReferences(resolve(repositoryRoot, project)).map((reference) => ({ project, ...reference }))
  );
  mkdirSync(output, { recursive: true });
  const manifestPath = resolve(output, "conversion-manifest.json");
  const projects = ["docsera-ui", "docsera-global-bridge"];
  const changedFiles = projects.flatMap((project) =>
    transformTree(resolve(repositoryRoot, "app", project), resolve(output, "app", project)).map((entry) => ({ project, ...entry }))
  );
  const remainingReferences = findRemainingReferences(resolve(output, "app"));
  const manifest = {
    format: 1,
    source: { scope: SOURCE_SCOPE, scopeId: SOURCE_SCOPE_ID, repositoryRoot },
    target: { scope: targetIdentity.scope, scopeId: targetIdentity.scopeId, scaffold: targetIdentity.scaffoldConfigPath },
    output,
    changedFiles,
    generatedMetadata: {
      omittedRegistries: projects.map((project) => `app/${project}/src/fluent/generated/keys.ts`),
      requiredRegeneration: [
        "Run npm install (or npm ci when a lockfile is supplied) in each converted application.",
        "Run the repository-pinned SDK 4.8.1 build for the scoped application, then review its newly generated keys.ts.",
        "Run the repository-pinned SDK 4.8.1 build for the Global companion, then review its newly generated keys.ts.",
        "Do not install either output until an independent review approves the generated registries."
      ]
    },
    excludedFrozenArtifacts: ["app/docsera-global-bridge/update-set"],
    unsupportedReferences,
    remainingSourceReferences: remainingReferences
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  if (unsupportedReferences.length > 0) fail(`Unsupported source identity references were reported in ${manifestPath}.`);
  if (remainingReferences.length > 0) fail(`Unconverted source identity references were reported in ${manifestPath}.`);
  return { manifestPath, manifest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = convertIdentity(process.argv.slice(2));
    if (result.help) console.log(result.help);
    else console.log(`Converted source written to ${dirname(result.manifestPath)}`);
  } catch (error) {
    console.error(`SDK identity conversion failed: ${error.message}`);
    process.exitCode = 1;
  }
}
