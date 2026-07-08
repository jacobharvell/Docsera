#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, "..");

export const runtimeStylePaths = {
  appRoot,
  appDistDir: path.join(appRoot, "dist", "app"),
  bundle: path.join(appRoot, "dist", "static", "main.jsdbx"),
  keys: path.join(appRoot, "src", "fluent", "generated", "keys.ts"),
  sourceCss: path.join(appRoot, "src", "client", "styles", "runtime-shell.css"),
  staticDir: path.join(appRoot, "dist", "static"),
  updateDir: path.join(appRoot, "dist", "app", "update")
};

export const runtimeStyleIdentity = {
  marker: 'data-docsera-runtime-style="runtime-shell"',
  probeCssProperty: "--docsera-runtime-probe-size",
  probeSelector: "#docsera-root",
  styleSelector: 'style[data-docsera-runtime-style="runtime-shell"]'
};

export function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function readText(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

export function sha256Hex(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function parseProbeValue(sourceCss) {
  const probeMatch = sourceCss.match(
    new RegExp(`${runtimeStyleIdentity.probeCssProperty}:\\s*([^;]+);`)
  );
  return probeMatch?.[1]?.trim();
}

function findRuntimeThemeAssetXmls(appDistDir) {
  if (!fs.existsSync(appDistDir)) {
    return [];
  }

  return fs
    .readdirSync(appDistDir, { recursive: true })
    .filter((entry) => typeof entry === "string")
    .filter((entry) => /(^|[\\/])sys_ux_theme_asset_[0-9a-f]{32}\.xml$/i.test(entry))
    .map((fileName) => ({
      fileName,
      source: readText(path.join(appDistDir, fileName))
    }))
    .filter(({ source }) => /runtime-shell(?:[^<\n\r]*)?\.css/i.test(source));
}

function findRuntimeCssOutputs(staticDir) {
  if (!fs.existsSync(staticDir)) {
    return [];
  }

  return fs
    .readdirSync(staticDir, { recursive: true })
    .filter((entry) => typeof entry === "string")
    .filter((entry) => /(^|[\\/])runtime-shell(?:\.[^\\/]+)?\.css$/i.test(entry));
}

export function collectLocalInlineRuntimeCssBuild() {
  assert(fs.existsSync(runtimeStylePaths.sourceCss), `Missing source CSS at ${runtimeStylePaths.sourceCss}.`);
  assert(fs.existsSync(runtimeStylePaths.bundle), `Missing built bundle at ${runtimeStylePaths.bundle}. Run the SDK build first.`);
  assert(fs.existsSync(runtimeStylePaths.keys), `Missing generated keys file at ${runtimeStylePaths.keys}.`);

  const sourceCss = readText(runtimeStylePaths.sourceCss);
  const bundleSource = readText(runtimeStylePaths.bundle);
  const keysSource = readText(runtimeStylePaths.keys);
  const probeValue = parseProbeValue(sourceCss);
  const runtimeThemeAssets = findRuntimeThemeAssetXmls(runtimeStylePaths.appDistDir);
  const emittedRuntimeCssFiles = findRuntimeCssOutputs(runtimeStylePaths.staticDir);
  const bundleHash = sha256Hex(bundleSource);

  assert(
    probeValue,
    `Could not parse ${runtimeStyleIdentity.probeCssProperty} from ${runtimeStylePaths.sourceCss}.`
  );

  assert(
    bundleSource.includes(runtimeStyleIdentity.marker),
    "main.jsdbx does not contain the runtime style injection marker."
  );

  assert(
    bundleSource.includes(`${runtimeStyleIdentity.probeCssProperty}: ${probeValue};`),
    `main.jsdbx does not contain the expected ${runtimeStyleIdentity.probeCssProperty} probe value.`
  );

  assert(
    !/\/uxta\/[^"'`\s)]+\.assetx\?path=[^"'`\s)]+runtime-shell[^"'`\s)]*\.css/i.test(bundleSource),
    "main.jsdbx still contains a runtime-shell CSS theme asset reference."
  );

  assert(
    !bundleSource.includes("styles\\runtime-shell.css"),
    "main.jsdbx still contains a Windows runtime-shell.css path."
  );

  return {
    bundleHash,
    bundleSource,
    emittedRuntimeCssFiles,
    keysSource,
    probeValue,
    runtimeThemeAssets,
    sourceCss
  };
}
